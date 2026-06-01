// ============ CALCULO DE TRIBUTOS POR ITEM (NFC-e) ============
//
// Monta o grupo `imposto` de cada item da NFC-e (ICMS, PIS, COFINS) no leiaute
// oficial da SEFAZ (mesmos nomes de grupo usados pela NuvemFiscal:
// ICMSSN102, ICMS00, PISAliq, PISNT, etc).
//
// Regra de qual grupo de ICMS usar:
//   CRT 1 ou 2 (Simples Nacional) -> CSOSN (grupos ICMSSN*)
//   CRT 3 (Regime Normal)         -> CST do ICMS (grupos ICMS*)
//
// ESCOPO desta versao (baseline para homologacao): cobre os casos mais comuns
// do varejo. CSOSN 102/103/300/400 (sem valor de ICMS) e 101/900 (com valor);
// CST 00 (tributada integral) e 40/41/60 (sem valor). PIS/COFINS com CST
// tributavel (01/02), nao-tributavel (04/06/07/08/09) e "outras" (49/99).
// Outros CST/CSOSN sao adicionados conforme as rejeicoes encontradas na
// homologacao (Fase de Testes do PLANO_FISCAL_NFCE).
//
// Origem (Tabela A) — codigo 0..8 que vai no campo `orig` de todo grupo ICMS.

import { ErroFiscal } from "./provedor.js";

const ORIGEM_CODIGO = {
  NACIONAL: "0",
  ESTRANGEIRA_IMP_DIRETA: "1",
  ESTRANGEIRA_ADQUIRIDA_BR: "2",
  NACIONAL_IMP_SUP_40: "3",
  NACIONAL_PROC_BAS: "4",
  NACIONAL_IMP_INF_40: "5",
  ESTRANGEIRA_IMP_SEM_SIM: "6",
  ESTRANGEIRA_ADQ_SEM_SIM: "7",
  NACIONAL_IMP_SUP_70: "8",
};

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function origemCodigo(origemEnum) {
  return ORIGEM_CODIGO[origemEnum] ?? "0";
}

// ---------- ICMS ----------

// CSOSN sem valor de ICMS no leiaute (so orig + CSOSN).
const CSOSN_SEM_VALOR = new Set(["102", "103", "300", "400"]);
// CST sem valor de ICMS (isenta/nao tributada/diferida/ST ja recolhido).
const CST_SEM_VALOR = new Set(["40", "41", "50", "60"]);

function montarIcms({ crt, csosn, cst, orig, vProd, aliquotaIcms }) {
  const aliq = num(aliquotaIcms);

  // Simples Nacional (CRT 1/2) -> CSOSN
  if (crt === 1 || crt === 2) {
    if (!csosn) {
      throw new ErroFiscal("Produto sem CSOSN definido (obrigatorio no Simples Nacional).");
    }
    const code = String(csosn).padStart(3, "0");
    if (CSOSN_SEM_VALOR.has(code)) {
      return { ICMSSN102: { orig, CSOSN: code } };
    }
    if (code === "101") {
      // Com permissao de credito — pCredSN/vCredICMSSN. Sem dados de credito
      // configurados, emitimos o minimo; ajustar na homologacao se necessario.
      return { ICMSSN101: { orig, CSOSN: code, pCredSN: aliq, vCredICMSSN: round2(vProd * aliq / 100) } };
    }
    if (code === "900") {
      const vBC = round2(vProd);
      return { ICMSSN900: { orig, CSOSN: code, modBC: "3", vBC, pICMS: aliq, vICMS: round2(vBC * aliq / 100) } };
    }
    if (code === "500") {
      // ICMS ST cobrado anteriormente — sem recalculo aqui.
      return { ICMSSN500: { orig, CSOSN: code } };
    }
    // Fallback seguro: trata como "sem valor".
    return { ICMSSN102: { orig, CSOSN: code } };
  }

  // Regime Normal (CRT 3) -> CST
  if (!cst) {
    throw new ErroFiscal("Produto sem CST do ICMS definido (obrigatorio no Regime Normal).");
  }
  const code = String(cst).padStart(2, "0");
  if (code === "00") {
    const vBC = round2(vProd);
    return { ICMS00: { orig, CST: code, modBC: "3", vBC, pICMS: aliq, vICMS: round2(vBC * aliq / 100) } };
  }
  if (CST_SEM_VALOR.has(code)) {
    return { ICMS40: { orig, CST: code } };
  }
  if (code === "20") {
    // Reducao de BC — sem pRedBC configurado, aplica aliquota sobre vProd.
    const vBC = round2(vProd);
    return { ICMS20: { orig, CST: code, modBC: "3", vBC, pICMS: aliq, vICMS: round2(vBC * aliq / 100) } };
  }
  // Fallback seguro.
  const vBC = round2(vProd);
  return { ICMS00: { orig, CST: code, modBC: "3", vBC, pICMS: aliq, vICMS: round2(vBC * aliq / 100) } };
}

// ---------- PIS / COFINS ----------

// CST de PIS/COFINS sem valor (nao tributado / isento / sem incidencia).
const CST_PISCOFINS_SEM_VALOR = new Set(["04", "05", "06", "07", "08", "09"]);

// Monta o grupo PIS ou COFINS. `grupo` = "PIS" | "COFINS".
function montarPisCofins(grupo, { cst, aliquota, vProd }) {
  const code = String(cst || "07").padStart(2, "0"); // 07 = isenta (default seguro)
  const aliq = num(aliquota);

  if (code === "01" || code === "02") {
    const vBC = round2(vProd);
    const valor = round2(vBC * aliq / 100);
    return { [`${grupo}Aliq`]: { CST: code, vBC, [`p${grupo}`]: aliq, [`v${grupo}`]: valor } };
  }
  if (CST_PISCOFINS_SEM_VALOR.has(code)) {
    return { [`${grupo}NT`]: { CST: code } };
  }
  // 49/50..99 -> "Outras Operacoes"
  const vBC = round2(vProd);
  const valor = round2(vBC * aliq / 100);
  return { [`${grupo}Outr`]: { CST: code, vBC, [`p${grupo}`]: aliq, [`v${grupo}`]: valor } };
}

// ---------- API publica ----------

// Calcula o grupo `imposto` de UM item. Recebe os dados fiscais ja resolvidos
// (vindos do Produto + CRT da empresa) e o valor do produto (vProd ja liquido
// do rateio de desconto/acrescimo, calculado no montarNfce).
//
// Retorna { imposto, vICMS, vPIS, vCOFINS } — os valores agregados sobem para
// o total da nota e para o snapshot do ItemNotaFiscal.
export function calcularImpostoItem({
  crt, origem, csosn, cst, aliquotaIcms,
  cstPis, aliquotaPis, cstCofins, aliquotaCofins,
  vProd, vTotTrib,
}) {
  const orig = origemCodigo(origem);
  const icms = montarIcms({ crt, csosn, cst, orig, vProd, aliquotaIcms });
  const pis = montarPisCofins("PIS", { cst: cstPis, aliquota: aliquotaPis, vProd });
  const cofins = montarPisCofins("COFINS", { cst: cstCofins, aliquota: aliquotaCofins, vProd });

  // Extrai os valores calculados (quando existirem) para os totais.
  const vICMS = num(Object.values(icms)[0]?.vICMS);
  const vPIS = num(Object.values(pis)[0]?.vPIS);
  const vCOFINS = num(Object.values(cofins)[0]?.vCOFINS);
  const vBCICMS = num(Object.values(icms)[0]?.vBC);

  const imposto = { ICMS: icms, PIS: pis, COFINS: cofins };
  if (vTotTrib != null) imposto.vTotTrib = round2(vTotTrib);

  return { imposto, vICMS, vPIS, vCOFINS, vBCICMS };
}
