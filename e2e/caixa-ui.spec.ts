import { test, expect } from "playwright/test";
import {
  apiLogin, caixaAtual, garantirCaixaAberto, irParaTela, loginUI, sairDoPDV,
} from "./fixtures";

// ============ E2E — CAIXA PELA INTERFACE ============
// Mesmo caminho do tutorial em video (scripts/gravar-videos-fluxos.mjs):
// sair do PDV → sidebar "Caixa" → fechar com conferencia cega → reabrir.
// Confirmacoes sempre contra a API (/caixas/atual), nao contra o layout.
// Roda antes de caixa.spec/pdv.spec (ordem alfabetica) e TERMINA com caixa
// aberto — os demais specs garantem o proprio estado de qualquer forma.

// Login + 2 navegacoes + 2 modais + polls na API: aperta o default de 60s
// quando o ambiente esta frio (primeira carga do vite).
test.setTimeout(120_000);

test("fechar e reabrir o caixa pela tela Caixa", async ({ page, request }) => {
  const token = await apiLogin(request);
  await garantirCaixaAberto(request, token);

  await loginUI(page);
  await sairDoPDV(page);
  await irParaTela(page, "Caixa");

  // --- Fechamento com conferencia cega ---
  await page.getByRole("button", { name: /Fechar Caixa/i }).first().click();
  // O modal abre com foco no campo do valor contado (padrao do tutorial).
  await page.keyboard.type("200");
  await page.getByRole("button", { name: "Fechar caixa", exact: true }).click();

  await expect
    .poll(async () => (await caixaAtual(request, token)) === null, { timeout: 10_000 })
    .toBe(true);

  // O fechamento abre o comprovante "Caixa Fechado" (esperado/contado/
  // diferenca) que cobre a tela inteira — "Concluir" dispensa.
  await page.getByRole("button", { name: "Concluir" }).click({ timeout: 10_000 });

  // --- Reabertura ---
  await page.getByRole("button", { name: /Abrir Caixa/i }).first().click({ timeout: 15_000 });
  await page.keyboard.type("150");
  await page.getByRole("button", { name: /^Abrir caixa$/i }).click();

  await expect
    .poll(async () => {
      const caixa = await caixaAtual(request, token);
      return caixa?.status === "ABERTO" ? Number(caixa.saldoInicial) : null;
    }, { timeout: 10_000 })
    .toBe(150);
});
