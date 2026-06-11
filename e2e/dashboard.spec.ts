import { test, expect } from "playwright/test";
import { apiLogin, garantirCaixaAberto, irParaTela, loginUI, sairDoPDV } from "./fixtures";

// ============ E2E — DASHBOARD (smoke) ============
// Cobertura minima para o fatiamento (Fase 5): a tela carrega os dados e os
// KPIs executivos renderizam atraves dos modulos extraidos (comum/primitivos/
// paineis/icones). As vendas dos outros specs garantem numeros reais.

test("Dashboard: KPIs e painéis renderizam com dados reais", async ({ page, request }) => {
  const token = await apiLogin(request);
  await garantirCaixaAberto(request, token);

  await loginUI(page);
  await sairDoPDV(page);
  await irParaTela(page, "Dashboard");

  await expect(page.getByText("Vendas hoje").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Faturamento do mês").first()).toBeVisible();
});
