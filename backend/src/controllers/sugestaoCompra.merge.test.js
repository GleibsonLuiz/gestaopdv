import test from "node:test";
import assert from "node:assert/strict";
import { mesclarSugestoes, qtdSugeridaPadrao } from "./sugestaoCompraController.js";

// Helper: produto "baixo" no formato vindo do $queryRaw.
function baixo(over = {}) {
  return {
    id: "p1", codigo: "001", nome: "Produto 1", unidade: "UN",
    estoque: 2, estoqueMinimo: 10, precoCusto: 5,
    fornecedorId: null, fornecedorNome: null, ...over,
  };
}

// Helper: linha salva no formato normalizado.
function linha(over = {}) {
  return {
    produtoId: "p1", origem: "MANUAL", status: "PENDENTE",
    quantidadeSugerida: null, observacao: null,
    fornecedorId: null, fornecedorNome: null,
    produto: { codigo: "001", nome: "Produto 1", unidade: "UN", estoque: 50, estoqueMinimo: 10, precoCusto: 5 },
    ...over,
  };
}

test("qtdSugeridaPadrao repoe ate ~2x o minimo, com piso 1", () => {
  assert.equal(qtdSugeridaPadrao(2, 10), 18);   // 2*10 - 2
  assert.equal(qtdSugeridaPadrao(10, 10), 10);  // 2*10 - 10
  assert.equal(qtdSugeridaPadrao(0, 1), 2);     // 2*1 - 0
  assert.equal(qtdSugeridaPadrao(100, 10), 1);  // deficit negativo -> piso 1
  assert.equal(qtdSugeridaPadrao(5, 0), 1);     // sem minimo -> piso 1
});

test("produto abaixo do minimo sem linha salva -> sugestao do SISTEMA", () => {
  const itens = mesclarSugestoes([baixo()], []);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].origem, "SISTEMA");
  assert.equal(itens[0].abaixoMinimo, true);
  assert.equal(itens[0].quantidadeSugerida, 18);
  assert.equal(itens[0].temLinhaSalva, false);
});

test("linha DESCARTADO esconde a sugestao do sistema", () => {
  const itens = mesclarSugestoes([baixo()], [linha({ status: "DESCARTADO", origem: "SISTEMA" })]);
  assert.equal(itens.length, 0);
});

test("override de quantidade/fornecedor numa sugestao do sistema e respeitado", () => {
  const itens = mesclarSugestoes([baixo()], [
    linha({ origem: "SISTEMA", quantidadeSugerida: 7, fornecedorId: "f9", fornecedorNome: "ACME" }),
  ]);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].quantidadeSugerida, 7);
  assert.equal(itens[0].fornecedorId, "f9");
  assert.equal(itens[0].fornecedorNome, "ACME");
  assert.equal(itens[0].abaixoMinimo, true);
});

test("item manual acima do minimo aparece como MANUAL, nao abaixo do minimo", () => {
  // produto NAO esta na lista de baixos (estoque 50 > minimo 10)
  const itens = mesclarSugestoes([], [
    linha({ produtoId: "p2", quantidadeSugerida: 3,
      produto: { codigo: "002", nome: "Antecipado", unidade: "UN", estoque: 50, estoqueMinimo: 10, precoCusto: 8 } }),
  ]);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].origem, "MANUAL");
  assert.equal(itens[0].abaixoMinimo, false);
  assert.equal(itens[0].quantidadeSugerida, 3);
});

test("nao duplica quando produto baixo TAMBEM tem linha manual", () => {
  const itens = mesclarSugestoes([baixo()], [linha({ origem: "MANUAL", quantidadeSugerida: 4 })]);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].origem, "MANUAL");      // respeita origem manual do usuario
  assert.equal(itens[0].abaixoMinimo, true);    // mas continua sinalizando urgencia
  assert.equal(itens[0].quantidadeSugerida, 4);
});

test("ordena: abaixo do minimo primeiro, maior deficit antes", () => {
  const itens = mesclarSugestoes(
    [
      baixo({ id: "a", nome: "A", estoque: 9, estoqueMinimo: 10 }),  // deficit -1
      baixo({ id: "b", nome: "B", estoque: 0, estoqueMinimo: 10 }),  // deficit -10
    ],
    [linha({ produtoId: "c", produto: { codigo: "c", nome: "C", unidade: "UN", estoque: 99, estoqueMinimo: 5, precoCusto: 1 } })],
  );
  assert.deepEqual(itens.map((i) => i.produtoId), ["b", "a", "c"]);
  assert.equal(itens[2].abaixoMinimo, false);
});

test("linha COMPRADO nao entra na lista", () => {
  const itens = mesclarSugestoes([], [linha({ produtoId: "p3", status: "COMPRADO" })]);
  assert.equal(itens.length, 0);
});
