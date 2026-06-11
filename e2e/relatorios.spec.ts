import { test, expect } from "playwright/test";
import { apiLogin, garantirCaixaAberto, irParaTela, loginUI, sairDoPDV } from "./fixtures";

// ============ E2E — TELA RELATORIOS (smoke) ============
// Cobertura minima: a tela monta com as abas e o RESUMO DO DIA (aba default,
// Fase 6) gera de verdade — KPIs + quebras por forma/vendedor — usando os
// primitivos extraidos no fatiamento (BlocoRelatorio/Resumo/Tabela).
// As vendas criadas pelos outros specs garantem dados no dia.

test("Relatórios: Resumo do Dia (default) gera KPIs e quebras", async ({ page, request }) => {
  const token = await apiLogin(request);
  await garantirCaixaAberto(request, token);

  await loginUI(page);
  await sairDoPDV(page);
  await irParaTela(page, "Relatórios");

  // Aba default = Resumo do Dia, em estado vazio orientando a gerar.
  await expect(page.getByText("Defina os filtros").first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Gerar/ }).first().click();

  // KPIs executivos + tabelas de quebra com dados reais.
  await expect(page.getByText("Faturamento").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Ticket médio").first()).toBeVisible();
  await expect(page.getByText("Por forma de pagamento").first()).toBeVisible();
  await expect(page.getByText("Por vendedor").first()).toBeVisible();
  await expect(page.getByText("Caixas do dia").first()).toBeVisible();
});
