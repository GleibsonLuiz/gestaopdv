import test from "node:test";
import assert from "node:assert/strict";
import { validarEntradaNfe, validarChaveAcesso } from "./validarEntradaNfe.js";

const CHAVE = "29260611222333000181550010000000071000000717";

// NF-e modelo 55 minima e coerente. mod/itens/total parametrizaveis p/ os casos.
function montarXml({ mod = "55", ncm1 = "22021000", vProdTot = "100.00", chave = CHAVE } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide><cUF>29</cUF><natOp>COMPRA</natOp><mod>${mod}</mod><serie>1</serie><nNF>7</nNF><dhEmi>2026-06-03T10:00:00-03:00</dhEmi></ide>
      <emit><CNPJ>11222333000181</CNPJ><xNome>Fornecedor Exemplo LTDA</xNome><IE>123456789</IE></emit>
      <dest><CPF>52998224725</CPF><xNome>Minha Empresa</xNome></dest>
      <det nItem="1"><prod><cProd>F-001</cProd><cEAN>7891000100103</cEAN><xProd>Refrigerante 2L</xProd><NCM>${ncm1}</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>5.0000000000</vUnCom><vProd>50.00</vProd></prod></det>
      <det nItem="2"><prod><cProd>F-002</cProd><cEAN>SEM GTIN</cEAN><xProd>Agua 500ml</xProd><NCM>22011000</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>25.0000000000</vUnCom><vProd>50.00</vProd></prod></det>
      <total><ICMSTot><vProd>${vProdTot}</vProd><vNF>${vProdTot}</vNF></ICMSTot></total>
      <cobr><dup><nDup>001</nDup><dVenc>2026-07-03</dVenc><vDup>100.00</vDup></dup></cobr>
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><chNFe>${chave}</chNFe><nProt>129260000000071</nProt></infProt></protNFe>
</nfeProc>`;
}

test("validarChaveAcesso confere o DV", () => {
  assert.equal(validarChaveAcesso(CHAVE), true);
  assert.equal(validarChaveAcesso(CHAVE.slice(0, 43) + "0"), false); // DV errado
  assert.equal(validarChaveAcesso("123"), false);
});

test("NF-e coerente passa e extrai o modelo intermediario", () => {
  const r = validarEntradaNfe(montarXml());
  assert.equal(r.ok, true, JSON.stringify(r.erros));
  assert.equal(r.dados.chave, CHAVE);
  assert.equal(r.dados.modelo, "55");
  assert.equal(r.dados.emitente.cnpj, "11222333000181");
  assert.equal(r.dados.emitente.nome, "Fornecedor Exemplo LTDA");
  assert.equal(r.dados.itens.length, 2);
  assert.equal(r.dados.itens[0].cEAN, "7891000100103");
  assert.equal(r.dados.itens[0].cProdFornecedor, "F-001");
  assert.equal(r.dados.itens[1].cEAN, null); // "SEM GTIN" -> null
  assert.equal(r.dados.totais.valorNota, 100);
  assert.equal(r.dados.duplicatas.length, 1);
  assert.equal(r.dados.duplicatas[0].valor, 100);
});

test("chave com DV invalido e barrada", () => {
  const r = validarEntradaNfe(montarXml({ chave: CHAVE.slice(0, 43) + "0" }));
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.campo === "chave"));
});

test("modelo 65 (NFC-e) e recusado na entrada", () => {
  const r = validarEntradaNfe(montarXml({ mod: "65" }));
  assert.ok(r.erros.some((e) => e.campo === "ide.mod"));
});

test("NCM invalido e divergencia de total sao barrados", () => {
  const r = validarEntradaNfe(montarXml({ ncm1: "123", vProdTot: "999.00" }));
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.campo === "NCM" && e.item === 1));
  assert.ok(r.erros.some((e) => e.campo === "total.vProd"));
  // mesmo invalido, ainda extrai os dados p/ a UI
  assert.equal(r.dados.itens.length, 2);
});

test("NCM 00000000 (8 digitos porem zerado) e barrado", () => {
  const r = validarEntradaNfe(montarXml({ ncm1: "00000000" }));
  assert.ok(r.erros.some((e) => e.campo === "NCM" && e.item === 1));
});

test("XML vazio ou sem infNFe", () => {
  assert.equal(validarEntradaNfe("").ok, false);
  assert.equal(validarEntradaNfe("<xml>nada</xml>").ok, false);
});
