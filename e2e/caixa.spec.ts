import { test, expect } from "playwright/test";
import {
  API_URL, apiLogin, authHeaders, caixaAtual, garantirCaixaAberto,
} from "./fixtures";

// ============ E2E — CICLO DE VIDA DO CAIXA (via API) ============
// abrir → sangria → suprimento → extrato → fechar → atual vira null.
// Exercita os controllers reais (e a borda zod) sem depender de UI.
// Este arquivo roda ANTES de pdv.spec.ts (ordem alfabetica, worker unico) e
// FECHA o caixa no fim — pdv.spec reabre via garantirCaixaAberto.

test("ciclo completo: abrir, sangria, suprimento, extrato e fechamento", async ({ request }) => {
  const token = await apiLogin(request);
  const H = authHeaders(token);

  await garantirCaixaAberto(request, token);
  const caixa = await caixaAtual(request, token);
  expect(caixa, "deveria haver caixa aberto").not.toBeNull();

  // Sangria de 30 e suprimento de 50 — admin passa pela autorizacao
  // gerencial sem senha extra (so VENDEDOR precisa).
  const rs = await request.post(`${API_URL}/caixas/${caixa.id}/sangria`, {
    headers: H, data: { valor: 30, descricao: "E2E sangria" },
  });
  expect(rs.status(), await rs.text()).toBeLessThan(300);

  const ru = await request.post(`${API_URL}/caixas/${caixa.id}/suprimento`, {
    headers: H, data: { valor: 50, descricao: "E2E suprimento" },
  });
  expect(ru.status(), await ru.text()).toBeLessThan(300);

  // Extrato registra os dois movimentos com os valores certos.
  const re = await request.get(`${API_URL}/caixas/${caixa.id}/extrato`, { headers: H });
  expect(re.status()).toBe(200);
  const extrato = await re.json();
  const movs = extrato.movimentacoes || [];
  expect(movs.some((m: any) => m.tipo === "SANGRIA" && Number(m.valor) === 30)).toBe(true);
  expect(movs.some((m: any) => m.tipo === "SUPRIMENTO" && Number(m.valor) === 50)).toBe(true);

  // Fecha contando um saldo qualquer (o controller registra a diferenca,
  // nao rejeita) e sem troco para o proximo dia.
  const rf = await request.post(`${API_URL}/caixas/${caixa.id}/fechar`, {
    headers: H, data: { saldoFinalContado: 120, trocoProximoDia: 0 },
  });
  expect(rf.status(), await rf.text()).toBeLessThan(300);

  // Depois de fechado, nao ha mais caixa atual.
  expect(await caixaAtual(request, token)).toBeNull();
});

test("borda zod: sangria com valor nao positivo cai com 400", async ({ request }) => {
  const token = await apiLogin(request);
  await garantirCaixaAberto(request, token);
  const caixa = await caixaAtual(request, token);

  for (const valor of [0, -10, "abc"]) {
    const r = await request.post(`${API_URL}/caixas/${caixa.id}/sangria`, {
      headers: authHeaders(token), data: { valor, descricao: "invalida" },
    });
    expect(r.status(), `valor ${valor} deveria dar 400`).toBe(400);
  }
});
