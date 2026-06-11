import { test, expect } from "playwright/test";
import { apiLogin, garantirCaixaAberto, irParaTela, loginUI, sairDoPDV } from "./fixtures";

// ============ E2E — TELA RELATORIOS (smoke) ============
// Cobertura minima para o fatiamento do modulo (Fase 5): a tela monta com
// as abas, e o relatorio de Vendas GERA de verdade (KPIs aparecem) usando
// os primitivos extraidos (BlocoRelatorio/Resumo/Tabela + criarPDF infra).
// As vendas criadas pelos outros specs garantem dados no periodo.

test("Relatórios: tela monta e o relatório de Vendas gera KPIs", async ({ page, request }) => {
  const token = await apiLogin(request);
  await garantirCaixaAberto(request, token);

  await loginUI(page);
  await sairDoPDV(page);
  await irParaTela(page, "Relatórios");

  // Abas do modulo visiveis (estado vazio orienta a gerar).
  await expect(page.getByText("Defina os filtros").first()).toBeVisible({ timeout: 10_000 });

  // Gera o relatorio de Vendas (aba default, periodo default = hoje).
  await page.getByRole("button", { name: /Gerar/ }).first().click();

  // Faixa de KPIs do padrao executivo aparece com dados reais.
  await expect(page.getByText("Faturamento").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Ticket médio").first()).toBeVisible();
});
