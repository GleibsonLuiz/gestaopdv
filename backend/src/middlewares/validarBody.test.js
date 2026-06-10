import { test } from "node:test";
import assert from "node:assert/strict";
import {
  criarVendaSchema, abrirCaixaSchema, fecharCaixaSchema, movimentoCaixaSchema,
} from "./validarBody.js";

// O risco de validar na borda e ser MAIS rigido que o front e quebrar venda
// real. Estes casos espelham o payload que o PDV envia hoje (incluindo
// strings numericas e campos extras via passthrough).

test("venda: payload real do PDV passa (strings numericas + campos extras)", () => {
  const r = criarVendaSchema.safeParse({
    clienteId: "",
    itens: [
      { produtoId: "abc123", quantidade: 2, precoUnitario: 10.5 },
      { produtoId: "def456", quantidade: "0.4", precoUnitario: "39.90" }, // peso em kg
    ],
    desconto: "5",
    pagamentos: [
      { forma: "DINHEIRO", valor: 30, valorEntregue: 50 },
      { forma: "PIX", valor: "20.30", formaCustomId: null },
    ],
    idempotencyKey: "chave-xyz",
    pontosResgatar: 0,
    gerarContaReceber: { vencimento: "2026-07-01", parcelas: 2 },
  });
  assert.equal(r.success, true);
  // Coercao aplicada + passthrough preservado
  assert.equal(r.data.itens[1].quantidade, 0.4);
  assert.equal(r.data.pagamentos[1].valor, 20.3);
  assert.equal(r.data.idempotencyKey, "chave-xyz");
  assert.deepEqual(r.data.gerarContaReceber, { vencimento: "2026-07-01", parcelas: 2 });
});

test("venda: estrutura invalida e rejeitada", () => {
  assert.equal(criarVendaSchema.safeParse({ itens: [] }).success, false);
  assert.equal(criarVendaSchema.safeParse({}).success, false);
  assert.equal(criarVendaSchema.safeParse({
    itens: [{ produtoId: "x", quantidade: -1 }],
  }).success, false);
  assert.equal(criarVendaSchema.safeParse({
    itens: [{ produtoId: "x", quantidade: "abc" }],
  }).success, false);
  assert.equal(criarVendaSchema.safeParse({
    itens: [{ produtoId: "", quantidade: 1 }],
  }).success, false);
  assert.equal(criarVendaSchema.safeParse({
    itens: [{ produtoId: "x", quantidade: 1, precoUnitario: Infinity }],
  }).success, false);
  assert.equal(criarVendaSchema.safeParse({
    itens: [{ produtoId: "x", quantidade: 1 }],
    desconto: -10,
  }).success, false);
});

test("caixa: abrir/fechar aceitam campos opcionais e coagem strings", () => {
  assert.equal(abrirCaixaSchema.safeParse({}).success, true);
  const ab = abrirCaixaSchema.safeParse({ saldoInicial: "100.50", observacoesAbertura: "troco" });
  assert.equal(ab.success, true);
  assert.equal(ab.data.saldoInicial, 100.5);
  assert.equal(ab.data.observacoesAbertura, "troco");

  const fe = fecharCaixaSchema.safeParse({ saldoFinalContado: 250, trocoProximoDia: "50" });
  assert.equal(fe.success, true);
  assert.equal(fe.data.trocoProximoDia, 50);
  assert.equal(fecharCaixaSchema.safeParse({ saldoFinalContado: "nada" }).success, false);
});

test("caixa: sangria/suprimento exigem valor positivo", () => {
  const ok = movimentoCaixaSchema.safeParse({ valor: 50, descricao: "almoco", senhaAutorizacao: "x" });
  assert.equal(ok.success, true);
  assert.equal(ok.data.senhaAutorizacao, "x");
  assert.equal(movimentoCaixaSchema.safeParse({ valor: 0 }).success, false);
  assert.equal(movimentoCaixaSchema.safeParse({ valor: -5 }).success, false);
  assert.equal(movimentoCaixaSchema.safeParse({}).success, false);
});
