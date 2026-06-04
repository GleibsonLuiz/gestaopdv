import test from "node:test";
import assert from "node:assert/strict";
import { resolverItem, casarItens, contarPendentes } from "./casarEntrada.js";

const mapas = {
  dePara: new Map([["F-001", "prod-depara"]]),
  porEan: new Map([["7891000100103", "prod-ean"]]),
  porCodigo: new Map([["F-002", "prod-codigo"]]),
};

test("prioridade DEPARA > GTIN > CODIGO > NENHUM", () => {
  // DEPARA vence mesmo com EAN tambem cadastrado
  assert.deepEqual(
    resolverItem({ cProdFornecedor: "F-001", cEAN: "7891000100103" }, mapas),
    { produtoIdSugerido: "prod-depara", origem: "DEPARA" }
  );
  // sem de-para, casa por GTIN
  assert.deepEqual(
    resolverItem({ cProdFornecedor: "X", cEAN: "7891000100103" }, mapas),
    { produtoIdSugerido: "prod-ean", origem: "GTIN" }
  );
  // sem de-para nem GTIN, casa por codigo
  assert.deepEqual(
    resolverItem({ cProdFornecedor: "F-002", cEAN: null }, mapas),
    { produtoIdSugerido: "prod-codigo", origem: "CODIGO" }
  );
  // nada bate
  assert.deepEqual(
    resolverItem({ cProdFornecedor: "Z", cEAN: "000" }, mapas),
    { produtoIdSugerido: null, origem: "NENHUM" }
  );
});

test("casarItens preserva numero e contarPendentes conta os sem palpite", () => {
  const itens = [
    { numero: 1, cProdFornecedor: "F-001" },           // DEPARA
    { numero: 2, cProdFornecedor: "Z", cEAN: "000" },  // NENHUM
    { numero: 3, cProdFornecedor: "X", cEAN: "7891000100103" }, // GTIN
  ];
  const sug = casarItens(itens, mapas);
  assert.equal(sug.length, 3);
  assert.equal(sug[0].numero, 1);
  assert.equal(sug[0].origem, "DEPARA");
  assert.equal(sug[1].origem, "NENHUM");
  assert.equal(contarPendentes(sug), 1);
});

test("listas vazias nao quebram", () => {
  assert.deepEqual(casarItens(null, mapas), []);
  assert.equal(contarPendentes(null), 0);
});
