import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TIPOS_RECORRENCIA,
  toNumber,
  parseDate,
  calcularValores,
  adicionarMeses,
  gerarSerieRecorrencia,
} from "./contas.js";

describe("TIPOS_RECORRENCIA", () => {
  it("contem os 3 tipos", () => {
    assert.ok(TIPOS_RECORRENCIA.has("NENHUMA"));
    assert.ok(TIPOS_RECORRENCIA.has("PARCELADA"));
    assert.ok(TIPOS_RECORRENCIA.has("RECORRENTE"));
    assert.equal(TIPOS_RECORRENCIA.size, 3);
  });
});

describe("toNumber", () => {
  it("retorna null para vazio/null/undefined", () => {
    assert.equal(toNumber(null), null);
    assert.equal(toNumber(undefined), null);
    assert.equal(toNumber(""), null);
  });

  it("converte numero direto", () => {
    assert.equal(toNumber(10.5), 10.5);
  });

  it("converte string com virgula", () => {
    assert.equal(toNumber("10,50"), 10.5);
  });

  it("converte string com ponto", () => {
    assert.equal(toNumber("10.50"), 10.5);
  });

  it("retorna NaN para string invalida", () => {
    assert.ok(Number.isNaN(toNumber("abc")));
  });
});

describe("parseDate", () => {
  it("retorna null para falsy", () => {
    assert.equal(parseDate(null), null);
    assert.equal(parseDate(""), null);
  });

  it("parseia YYYY-MM-DD como data local meio-dia", () => {
    const d = parseDate("2026-05-15");
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 4); // maio = 4
    assert.equal(d.getDate(), 15);
    assert.equal(d.getHours(), 12);
  });

  it("parseia string ISO completa", () => {
    const d = parseDate("2026-01-10T10:00:00Z");
    assert.ok(d instanceof Date);
    assert.ok(!isNaN(d.getTime()));
  });

  it("retorna null para data invalida", () => {
    assert.equal(parseDate("invalido"), null);
  });
});

describe("calcularValores", () => {
  it("calcula liquido corretamente", () => {
    const r = calcularValores({ valorBruto: 100, juros: 5, multa: 2, desconto: 7 });
    assert.equal(r.ok, true);
    assert.equal(r.valores.valor, 100); // 100 + 5 + 2 - 7 = 100
    assert.equal(r.valores.valorBruto, 100);
    assert.equal(r.valores.juros, 5);
    assert.equal(r.valores.multa, 2);
    assert.equal(r.valores.desconto, 7);
  });

  it("rejeita valorBruto zero ou negativo", () => {
    assert.equal(calcularValores({ valorBruto: 0 }).ok, false);
    assert.equal(calcularValores({ valorBruto: -1 }).ok, false);
  });

  it("rejeita valorBruto nao-numerico", () => {
    assert.equal(calcularValores({ valorBruto: "abc" }).ok, false);
  });

  it("rejeita juros/multa/desconto negativos", () => {
    assert.equal(calcularValores({ valorBruto: 100, juros: -1 }).ok, false);
    assert.equal(calcularValores({ valorBruto: 100, multa: -1 }).ok, false);
    assert.equal(calcularValores({ valorBruto: 100, desconto: -1 }).ok, false);
  });

  it("rejeita quando liquido fica <= 0", () => {
    const r = calcularValores({ valorBruto: 10, desconto: 20 });
    assert.equal(r.ok, false);
    assert.match(r.erro, /maior que zero/);
  });

  it("aceita juros/multa/desconto ausentes (default 0)", () => {
    const r = calcularValores({ valorBruto: 50 });
    assert.equal(r.ok, true);
    assert.equal(r.valores.valor, 50);
  });

  it("aceita strings com virgula", () => {
    const r = calcularValores({ valorBruto: "100,50", juros: "2,00" });
    assert.equal(r.ok, true);
    assert.equal(r.valores.valorBruto, 100.5);
    assert.equal(r.valores.juros, 2);
  });
});

describe("adicionarMeses", () => {
  it("adiciona meses simples", () => {
    const base = new Date(2026, 0, 15); // 15/jan/2026
    const r = adicionarMeses(base, 2);
    assert.equal(r.getMonth(), 2); // marco
    assert.equal(r.getDate(), 15);
  });

  it("ajusta dia 31 em meses curtos", () => {
    const base = new Date(2026, 0, 31); // 31/jan
    const r = adicionarMeses(base, 1); // fev
    assert.equal(r.getMonth(), 1);
    assert.equal(r.getDate(), 28); // 2026 nao e bissexto
  });

  it("funciona com 0 meses (devolve mesma data)", () => {
    const base = new Date(2026, 5, 10);
    const r = adicionarMeses(base, 0);
    assert.equal(r.getMonth(), 5);
    assert.equal(r.getDate(), 10);
  });
});

describe("gerarSerieRecorrencia", () => {
  const dadosBase = { descricao: "Aluguel", fornecedorId: "f1" };
  const valores = { valorBruto: 1200, juros: 0, multa: 0, desconto: 0, valor: 1200 };
  const vencimento = new Date(2026, 0, 10);

  it("NENHUMA: retorna registro unico", () => {
    const r = gerarSerieRecorrencia({
      tipoRecorrencia: "NENHUMA",
      parcelaTotal: 1,
      valores,
      vencimento,
      dadosBase,
    });
    assert.equal(r.ok, true);
    assert.equal(r.registros.length, 1);
    assert.equal(r.registros[0].tipoRecorrencia, "NENHUMA");
    assert.equal(r.entrada, null);
  });

  it("PARCELADA: divide em N parcelas", () => {
    const r = gerarSerieRecorrencia({
      tipoRecorrencia: "PARCELADA",
      parcelaTotal: 3,
      valores,
      vencimento,
      dadosBase,
    });
    assert.equal(r.ok, true);
    assert.equal(r.registros.length, 3);
    // Soma dos valorBruto deve dar ~1200
    const soma = r.registros.reduce((s, p) => s + p.valorBruto, 0);
    assert.ok(Math.abs(soma - 1200) < 0.01);
    // Cada parcela tem parcelaAtual crescente
    assert.equal(r.registros[0].parcelaAtual, 1);
    assert.equal(r.registros[2].parcelaAtual, 3);
  });

  it("PARCELADA com entrada", () => {
    const r = gerarSerieRecorrencia({
      tipoRecorrencia: "PARCELADA",
      parcelaTotal: 2,
      valores,
      vencimento,
      dadosBase,
      entrada: 200,
    });
    assert.equal(r.ok, true);
    assert.ok(r.entrada !== null);
    assert.equal(r.entrada.valorBruto, 200);
    assert.equal(r.entrada.status, "PAGA");
    // Parcelas dividem o restante (1000)
    const soma = r.registros.reduce((s, p) => s + p.valorBruto, 0);
    assert.ok(Math.abs(soma - 1000) < 0.01);
  });

  it("PARCELADA: rejeita entrada >= valor total", () => {
    const r = gerarSerieRecorrencia({
      tipoRecorrencia: "PARCELADA",
      parcelaTotal: 2,
      valores,
      vencimento,
      dadosBase,
      entrada: 1200,
    });
    assert.equal(r.ok, false);
    assert.match(r.erro, /entrada/i);
  });

  it("RECORRENTE: gera N registros com mesmo valor", () => {
    const r = gerarSerieRecorrencia({
      tipoRecorrencia: "RECORRENTE",
      parcelaTotal: 4,
      valores,
      vencimento,
      dadosBase,
    });
    assert.equal(r.ok, true);
    assert.equal(r.registros.length, 4);
    for (const reg of r.registros) {
      assert.equal(reg.valor, 1200);
      assert.equal(reg.tipoRecorrencia, "RECORRENTE");
    }
  });

  it("RECORRENTE: default 12 parcelas se parcelaTotal invalido", () => {
    const r = gerarSerieRecorrencia({
      tipoRecorrencia: "RECORRENTE",
      parcelaTotal: 0,
      valores,
      vencimento,
      dadosBase,
    });
    assert.equal(r.ok, true);
    assert.equal(r.registros.length, 12);
  });

  it("rejeita tipo invalido", () => {
    const r = gerarSerieRecorrencia({
      tipoRecorrencia: "INVALIDO",
      parcelaTotal: 3,
      valores,
      vencimento,
      dadosBase,
    });
    assert.equal(r.ok, false);
  });

  it("rejeita parcelas fora do range (>60)", () => {
    const r = gerarSerieRecorrencia({
      tipoRecorrencia: "PARCELADA",
      parcelaTotal: 61,
      valores,
      vencimento,
      dadosBase,
    });
    assert.equal(r.ok, false);
    assert.match(r.erro, /2 e 60/);
  });
});
