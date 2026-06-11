import { test, expect } from "playwright/test";
import {
  API_URL, apiLogin, authHeaders, bipar, contarVendas, garantirCaixaAberto,
  loginUI, produtosVendaveis,
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
    await bipar(page, item.codigo);
  }
  // Com os 3 itens no carrinho, o finalizar habilita.
  await expect(page.getByRole("button", { name: /F10 Finalizar/i })).toBeEnabled();

  await page.keyboard.press("F10"); // abre pagamento (DINHEIRO valor cheio)
  await page.waitForTimeout(800);
  await page.keyboard.press("F10"); // confirma

  // A venda existe no backend — fonte da verdade.
  await expect
    .poll(() => contarVendas(request, token), { timeout: 15_000 })
    .toBeGreaterThan(vendasAntes);
});

test("venda PIX pela UI: bipe 1 item → card PIX → F10 confirma", async ({ page, request }) => {
  const token = await apiLogin(request);
  await garantirCaixaAberto(request, token);
  const vendasAntes = await contarVendas(request, token);

  await loginUI(page);
  const busca = page.locator('input[placeholder*="Bipe"]').first();
  await busca.waitFor({ timeout: 20_000 });

  await bipar(page, "PAP-0002");
  await expect(page.getByRole("button", { name: /F10 Finalizar/i })).toBeEnabled();

  // Os atalhos F1-F6 sao DINAMICOS (reordenados por frequencia de uso) —
  // clica no card pelo rotulo, que e estavel. O clique abre o modal de
  // pagamento ja semeado com PIX no valor cheio; F10 confirma.
  await page.locator(".pdv-pay-btn", { has: page.locator(".pay-lbl", { hasText: "PIX" }) }).click();
  await page.waitForTimeout(800);
  await page.keyboard.press("F10");

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

test("venda com pagamento dividido (DINHEIRO + PIX) via API", async ({ request }) => {
  const token = await apiLogin(request);
  await garantirCaixaAberto(request, token);

  const [p1, p2] = await produtosVendaveis(request, token);
  expect(p2, "seed deveria ter >=2 produtos vendaveis").toBeTruthy();

  const itens = [
    { produtoId: p1.id, quantidade: 2, precoUnitario: Number(p1.precoVenda) },
    { produtoId: p2.id, quantidade: 1, precoUnitario: Number(p2.precoVenda) },
  ];
  const total = Number(
    (itens.reduce((a, it) => a + it.quantidade * it.precoUnitario, 0)).toFixed(2),
  );
  const parte = Number((total / 2).toFixed(2));

  const r = await request.post(`${API_URL}/vendas`, {
    headers: authHeaders(token),
    data: {
      itens,
      pagamentos: [
        { forma: "DINHEIRO", valor: parte },
        { forma: "PIX", valor: Number((total - parte).toFixed(2)) },
      ],
    },
  });
  expect(r.status(), await r.text()).toBeLessThan(300);
  const venda = await r.json();
  expect(Number(venda.total ?? venda.venda?.total)).toBeCloseTo(total, 2);
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
