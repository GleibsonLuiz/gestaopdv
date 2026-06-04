// ============ GERADOR DE NF-e FAKE (mock da distribuicao DF-e) ============
//
// Usado SO pelo adapter mock para simular notas chegando da SEFAZ sem
// certificado. Produz um XML de NF-e (modelo 55) DETERMINISTICO a partir de um
// `seed` (= nNF) que PASSA no validarEntradaNfe real (chave com DV valido, CNPJ
// valido, NCM 8 digitos, totais coerentes) — assim o fluxo de baixar->conciliar
// ->efetivar funciona de verdade na Fase A.
//
// Chave <-> seed: distribuirDFe gera o resumo (com a chave) a partir do seed;
// baixarXmlEntrada recebe a chave, extrai o seed (nNF) e REGENERA o mesmo XML.
// Sem estado em memoria (serverless-safe).

// --- CNPJ valido construido a partir de uma base de 12 digitos ---
function dvCnpj(base) {
  const pesos = base.length === 12
    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}
function montarCnpj(base12) {
  const d1 = dvCnpj(base12);
  const d2 = dvCnpj(base12 + d1);
  return base12 + String(d1) + String(d2);
}

// DV da chave de acesso (mod-11, pesos 2..9 da direita) sobre os 43 digitos.
function dvChave(chave43) {
  let soma = 0, peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto === 0 || resto === 1 ? 0 : 11 - resto);
}

const FORNECEDORES = [
  { cnpj: montarCnpj("112223330001"), nome: "ATACADAO PAPELARIA CENTRAL LTDA" },
  { cnpj: montarCnpj("114447770001"), nome: "DISTRIBUIDORA NORDESTE DE BAZAR LTDA" },
  { cnpj: montarCnpj("223344550001"), nome: "COMERCIAL ARMARINHOS DO VALE LTDA" },
];

const PRODUTOS = [
  { desc: "CADERNO ESPIRAL 96 FOLHAS", ncm: "48201000", uCom: "UN", v: 6.9 },
  { desc: "CANETA ESFEROGRAFICA AZUL", ncm: "96081000", uCom: "UN", v: 1.2 },
  { desc: "COLA BRANCA ESCOLAR 90G", ncm: "35061000", uCom: "UN", v: 2.3 },
  { desc: "LAPIS PRETO N2", ncm: "96091000", uCom: "UN", v: 0.8 },
  { desc: "TESOURA ESCOLAR SEM PONTA", ncm: "82142000", uCom: "UN", v: 4.5 },
];

const TOTAL_FAKES = 5; // quantas notas o mock "tem" para entregar (NSU 1..5)
const r2 = (n) => Math.round(n * 100) / 100;
const pad = (n, w) => String(n).padStart(w, "0");

// Extrai o seed (nNF) de uma chave de 44 digitos (posicoes 25..34).
export function seedDaChave(chave) {
  const d = String(chave || "").replace(/\D/g, "");
  if (d.length !== 44) return null;
  return Number(d.slice(25, 34));
}

// Gera o documento fake determinístico para um seed (= nNF). destCnpj = o nosso
// CNPJ (destinatario). Devolve { chave, resumo, xml }.
export function gerarNfeFake(seed, destCnpj) {
  const dest = String(destCnpj || "").replace(/\D/g, "") || "00000000000000";
  const forn = FORNECEDORES[seed % FORNECEDORES.length];
  const qtdItens = 1 + (seed % 3); // 1..3 itens
  const itens = [];
  let total = 0;
  for (let i = 0; i < qtdItens; i++) {
    const p = PRODUTOS[(seed + i) % PRODUTOS.length];
    const qCom = (1 + ((seed + i) % 5)) * 10; // 10..50
    const vProd = r2(qCom * p.v);
    total = r2(total + vProd);
    itens.push({ ...p, cProd: `FK-${pad(seed, 3)}-${i + 1}`, qCom, vProd });
  }

  const cUF = "29", mod = "55", serie = "1", tpEmis = "1";
  const aamm = "2606";
  const cNF = pad((seed * 7919 + 13) % 1e8, 8);
  const base43 = cUF + aamm + forn.cnpj + mod + pad(serie, 3) + pad(seed, 9) + tpEmis + cNF;
  const chave = base43 + dvChave(base43);
  const dhEmi = `2026-06-${pad(1 + (seed % 27), 2)}T10:00:00-03:00`;

  const det = itens.map((it, idx) => `      <det nItem="${idx + 1}">
        <prod>
          <cProd>${it.cProd}</cProd><cEAN>SEM GTIN</cEAN><xProd>${it.desc}</xProd>
          <NCM>${it.ncm}</NCM><CFOP>5102</CFOP><uCom>${it.uCom}</uCom>
          <qCom>${it.qCom.toFixed(4)}</qCom><vUnCom>${it.v.toFixed(10)}</vUnCom><vProd>${it.vProd.toFixed(2)}</vProd>
          <cEANTrib>SEM GTIN</cEANTrib><uTrib>${it.uCom}</uTrib><qTrib>${it.qCom.toFixed(4)}</qTrib>
          <vUnTrib>${it.v.toFixed(10)}</vUnTrib><indTot>1</indTot>
        </prod>
        <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${it.vProd.toFixed(2)}</vBC><pICMS>18.00</pICMS><vICMS>${r2(it.vProd * 0.18).toFixed(2)}</vICMS></ICMS00></ICMS></imposto>
      </det>`).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide><cUF>${cUF}</cUF><cNF>${cNF}</cNF><natOp>VENDA</natOp><mod>${mod}</mod><serie>${serie}</serie><nNF>${seed}</nNF><dhEmi>${dhEmi}</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>2910800</cMunFG><tpImp>1</tpImp><tpEmis>${tpEmis}</tpEmis><tpAmb>1</tpAmb><finNFe>1</finNFe><indFinal>0</indFinal><indPres>0</indPres></ide>
      <emit><CNPJ>${forn.cnpj}</CNPJ><xNome>${forn.nome}</xNome><enderEmit><xLgr>RUA DO COMERCIO</xLgr><nro>100</nro><xBairro>CENTRO</xBairro><cMun>2910800</cMun><xMun>FEIRA DE SANTANA</xMun><UF>BA</UF><CEP>44000000</CEP></enderEmit><IE>ISENTO</IE><CRT>3</CRT></emit>
      <dest><CNPJ>${dest}</CNPJ><xNome>DESTINATARIO</xNome><indIEDest>9</indIEDest></dest>
${det}
      <total><ICMSTot><vBC>${total.toFixed(2)}</vBC><vICMS>${r2(total * 0.18).toFixed(2)}</vICMS><vProd>${total.toFixed(2)}</vProd><vDesc>0.00</vDesc><vNF>${total.toFixed(2)}</vNF></ICMSTot></total>
      <transp><modFrete>0</modFrete></transp>
      <cobr><dup><nDup>001</nDup><dVenc>2026-07-${pad(1 + (seed % 27), 2)}</dVenc><vDup>${total.toFixed(2)}</vDup></dup></cobr>
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${chave}</chNFe><nProt>1292600000${pad(seed, 5)}</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`;

  const resumo = {
    nsu: pad(seed, 15),
    tipo: "RESUMO_NFE",
    chave,
    emitenteCnpj: forn.cnpj,
    emitenteNome: forn.nome,
    valorTotal: total,
    dataEmissao: dhEmi,
  };

  return { chave, resumo, xml };
}

// Lista de resumos "novos" a partir de um cursor NSU, ate o maximo do mock.
// Determinístico: dado o mesmo ultimoNSU, devolve sempre os mesmos. Quando
// ultimoNSU >= TOTAL_FAKES, nao ha novidade (ultNSU == maxNSU).
export function distribuirFakes(ultimoNSU, destCnpj, lote = 3) {
  const inicio = Math.max(0, Number(ultimoNSU) || 0);
  const documentos = [];
  for (let nsu = inicio + 1; nsu <= TOTAL_FAKES && documentos.length < lote; nsu++) {
    documentos.push(gerarNfeFake(nsu, destCnpj).resumo);
  }
  const ultNSU = documentos.length ? Number(documentos[documentos.length - 1].nsu) : inicio;
  return { ultimoNSU: pad(ultNSU, 15), maxNSU: pad(TOTAL_FAKES, 15), documentos };
}

export { TOTAL_FAKES };
