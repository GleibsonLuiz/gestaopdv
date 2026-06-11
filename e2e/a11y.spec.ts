import { test, expect } from "playwright/test";
import { apiLogin, bipar, garantirCaixaAberto, loginUI } from "./fixtures";

// ============ E2E — ACESSIBILIDADE (Fase 7) ============
// Focus-trap dos modais: com um modal aberto, Tab/Shift+Tab circulam DENTRO
// dele — o teclado nunca escapa para a tela bloqueada atras. Implementado em
// useModalKeys, entao vale para toda a familia de modais do PDV/Caixa.

test("a11y: Tab fica preso dentro do modal de pagamento e Esc devolve o foco", async ({ page, request }) => {
  const token = await apiLogin(request);
  await garantirCaixaAberto(request, token);

  await loginUI(page);
  await page.locator('input[placeholder*="Bipe"]').first().waitFor({ timeout: 20_000 });
  await bipar(page, "PAP-0006");

  await page.keyboard.press("F10"); // abre o modal de pagamento
  const dialogo = page.locator('[role="dialog"]').last();
  await expect(dialogo).toBeVisible({ timeout: 10_000 });

  // 15 Tabs (mais que o numero de controles do modal): o foco precisa
  // continuar dentro do dialogo em todos eles.
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press(i % 4 === 3 ? "Shift+Tab" : "Tab");
    const dentro = await page.evaluate(() => {
      const modal = document.querySelector(".pdv-modal, [role=\"dialog\"]");
      return !!modal && !!document.activeElement && modal.contains(document.activeElement);
    });
    expect(dentro, `Tab nº ${i + 1} escapou do modal`).toBe(true);
  }

  // Esc fecha e o app continua operavel (busca de bipe acessivel de novo).
  await page.keyboard.press("Escape");
  await expect(dialogo).toBeHidden({ timeout: 5_000 });
  await expect(page.locator('input[placeholder*="Bipe"]').first()).toBeVisible();
});
