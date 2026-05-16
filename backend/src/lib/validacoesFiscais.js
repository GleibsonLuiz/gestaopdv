// ETAPA 14: validacoes fiscais reutilizaveis (NF-e / NFC-e).
// Sem dependencias externas. Erros em pt-BR sem acentos (padrao do projeto).
//
// Cada funcao retorna { ok, valor } em sucesso ou { ok: false, erro } em
// falha — facilita o uso no controller sem ter que tratar throw.

// NCM: 8 digitos numericos. Nao validamos contra a tabela TIPI aqui
// (seria um endpoint que consulta API externa). Aceita string com
// pontos/tracos vindo da UI ("4820.20.00") e devolve so os digitos.
export function validarNcm(v) {
  if (v === null || v === undefined || v === "") return { ok: true, valor: null };
  const limpo = String(v).replace(/\D/g, "");
  if (limpo.length !== 8) return { ok: false, erro: "NCM deve ter 8 digitos" };
  return { ok: true, valor: limpo };
}

// CEST: 7 digitos. Opcional — so para itens com Substituicao Tributaria.
export function validarCest(v) {
  if (v === null || v === undefined || v === "") return { ok: true, valor: null };
  const limpo = String(v).replace(/\D/g, "");
  if (limpo.length !== 7) return { ok: false, erro: "CEST deve ter 7 digitos" };
  return { ok: true, valor: limpo };
}

// CFOP: 4 digitos. Primeiro digito 1/2/3 = entrada, 5/6/7 = saida.
// Para cadastro de produto so faz sentido CFOP de saida.
export function validarCfopSaida(v) {
  if (v === null || v === undefined || v === "") return { ok: true, valor: null };
  const limpo = String(v).replace(/\D/g, "");
  if (limpo.length !== 4) return { ok: false, erro: "CFOP deve ter 4 digitos" };
  if (!["5", "6", "7"].includes(limpo[0])) {
    return { ok: false, erro: "CFOP de saida deve comecar com 5, 6 ou 7" };
  }
  return { ok: true, valor: limpo };
}

// EAN/GTIN: 8, 12, 13 ou 14 digitos com checksum Modulo 10 (pesos 3/1).
// "SEM GTIN" e valor especial aceito pela SEFAZ para produtos sem codigo
// de barras (vai literal no XML — nao confunda com null).
export function validarGtin(v) {
  if (v === null || v === undefined || v === "") return { ok: true, valor: null };
  const limpo = String(v).trim();
  if (limpo === "") return { ok: true, valor: null };
  if (limpo.toUpperCase() === "SEM GTIN") return { ok: true, valor: "SEM GTIN" };
  if (!/^\d+$/.test(limpo)) return { ok: false, erro: "Codigo de barras deve conter apenas digitos" };
  if (![8, 12, 13, 14].includes(limpo.length)) {
    return { ok: false, erro: "Codigo de barras deve ter 8, 12, 13 ou 14 digitos" };
  }
  const digitos = limpo.split("").map(Number);
  const verif = digitos.pop();
  let soma = 0;
  for (let i = digitos.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) {
    soma += digitos[i] * peso;
  }
  const esperado = (10 - (soma % 10)) % 10;
  if (esperado !== verif) return { ok: false, erro: "Codigo de barras invalido (digito verificador)" };
  return { ok: true, valor: limpo };
}

// Coerencia regime x CST x CSOSN. Os campos do XML sao mutuamente
// exclusivos: regime normal usa CST, simples usa CSOSN.
export function validarTributacaoIcms({ regime, cstIcms, csosnIcms }) {
  if (regime === "REGIME_NORMAL") {
    if (csosnIcms) return { ok: false, erro: "CSOSN nao deve ser informado em Regime Normal" };
    if (cstIcms && !/^\d{3}$/.test(cstIcms)) {
      return { ok: false, erro: "CST do ICMS deve ter 3 digitos" };
    }
  } else {
    if (cstIcms) return { ok: false, erro: "CST do ICMS nao deve ser informado no Simples" };
    if (csosnIcms && !/^\d{3,4}$/.test(csosnIcms)) {
      return { ok: false, erro: "CSOSN deve ter 3 ou 4 digitos" };
    }
  }
  return { ok: true };
}

// CST de 2 digitos (PIS, COFINS). Aceita vazio.
export function validarCst2Digitos(v, nome) {
  if (v === null || v === undefined || v === "") return { ok: true, valor: null };
  const limpo = String(v).trim();
  if (!/^\d{2}$/.test(limpo)) return { ok: false, erro: `CST do ${nome} deve ter 2 digitos` };
  return { ok: true, valor: limpo };
}

export const ORIGENS_VALIDAS = new Set([
  "NACIONAL", "ESTRANGEIRA_IMP_DIRETA", "ESTRANGEIRA_ADQUIRIDA_BR",
  "NACIONAL_IMP_SUP_40", "NACIONAL_PROC_BAS", "NACIONAL_IMP_INF_40",
  "ESTRANGEIRA_IMP_SEM_SIM", "ESTRANGEIRA_ADQ_SEM_SIM", "NACIONAL_IMP_SUP_70",
]);

export const REGIMES_VALIDOS = new Set([
  "SIMPLES_NACIONAL", "SIMPLES_EXCESSO_SUBLIMITE", "REGIME_NORMAL",
]);
