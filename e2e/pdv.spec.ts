import { test, expect } from "playwright/test";
import {
  API_URL, apiLogin, authHeaders, contarVendas, garantirCaixaAberto, loginUI,
} from "./fixtures";

// ============ E2E — FLUXO DE VENDA NO PDV ============
// Selectores e atalhos comprovados (mesmos de scripts/gravar-video-pdv.mjs):
// o app abre direto no PDV em tela cheia; bipe = codigo exato + Enter no
// input "Bipe..."; F10 abre o pagamento (semeia DINHEIRO cheio); F10 de
// novo confirma. A validacao final e contra a API (venda persistida), nao
// contra a UI — imune a mudanca de layout.

// Codigos do seed com estoque garantido pelas compras do proprio seed.
const ITENS = [
  { codigo: "PAP-0001", nome: "CADERNO UNIVERSITÁRIO 200 FLS TILIBRA" },
  { codigo: "PAP-0007", nome: "APONTADOR COM DEPÓSITO FABER-CASTELL" },
  { codigo: "PAP-0006", nome: "BORRACHA BRANCA MERCUR PEQUENA" },
];

test("venda completa: login → bipe 3 itens → F10 dinheiro → persistida", async ({ page, request }) => {
  const token = await apiLogin(request);
  await garantirCaixaAberto(request, token);
  const vendasAntes = await contarVendas(request, token);

  await loginUI(page);

  // PDV em tela cheia: campo de bipe e a prova de que carregou.
  const busca = page.locator('input[placeholder*="Bipe"]').first();
  await busca.waitFor({ timeout: 20_000 });

  for (const item of ITENS) {
    await busca.click();
    await busca.fill(item.codigo);
    await page.keyboard.press("Enter");
    // Item entra no carrinho — espera o nome aparecer antes do proximo bipe.
    await expect(page.getByText(item.nome).first()).toBeVisible();
  }

  await page.keyboard.press("F10"); // abre pagamento (DINHEIRO valor cheio)
  await page.waitForTimeout(800);
  await page.keyboard.press("F10"); // confirma

  // A venda existe no backend — fonte da verdade.
  await expect
    .poll(() => contarVendas(request, token), { timeout: 15_000 })
    .toBeGreaterThan(vendasAntes);
});

test("login com senha errada mostra erro e nao entra", async ({ page }) => {
  await loginUI(page, { email: "admin@gestaopro.local", senha: "senha-errada-123" });
  await expect(page.getByText(/credenciais/i).first()).toBeVisible();
  // Continua na tela de login (campo de senha ainda presente).
  await expect(page.locator("#password")).toBeVisible();
});

// ============ BORDA DA API (validacao zod da Fase 1, em integracao real) ============

test("API rejeita venda estruturalmente invalida com 400 (zod)", async ({ request }) => {
  const token = await apiLogin(request);
  const casos = [
    {},                                                        // sem itens
    { itens: [] },                                             // array vazio
    { itens: [{ produtoId: "x", quantidade: -1 }] },           // quantidade negativa
    { itens: [{ produtoId: "x", quantidade: "abc" }] },        // quantidade nao numerica
    { itens: [{ produtoId: "", quantidade: 1 }] },             // produtoId vazio
    { itens: [{ produtoId: "x", quantidade: 1 }], desconto: -5 }, // desconto negativo
  ];
  for (const body of casos) {
    const r = await request.post(`${API_URL}/vendas`, {
      headers: authHeaders(token), data: body,
    });
    expect(r.status(), `payload deveria dar 400: ${JSON.stringify(body)}`).toBe(400);
  }
});

test("API rejeita abertura de caixa com saldo invalido (400)", async ({ request }) => {
  const token = await apiLogin(request);
  // Validacao roda ANTES da regra de negocio: mesmo com caixa ja aberto,
  // payload invalido tem que cair na borda com 400.
  const r = await request.post(`${API_URL}/caixas/abrir`, {
    headers: authHeaders(token), data: { saldoInicial: "abc" },
  });
  expect(r.status()).toBe(400);
});
