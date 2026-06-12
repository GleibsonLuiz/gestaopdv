import { test, expect } from "playwright/test";
import {
  apiLogin, bipar, contarVendas, garantirCaixaAberto, loginUI,
} from "./fixtures";

// ============ E2E — PDV OFFLINE-FIRST (Fase 3) ============
// Simula queda de rede REAL (context.setOffline) no meio do expediente:
// a venda finalizada sem conexao vai para a fila local (IndexedDB) e e
// enviada automaticamente quando a rede volta — sem acao do operador.
// O `request` fixture usa um contexto proprio, NAO afetado pelo setOffline:
// e o nosso observador externo do que chegou (ou nao) no servidor.

test("venda offline entra na fila e sincroniza sozinha quando a rede volta", async ({ page, context, request }) => {
  const token = await apiLogin(request);
  await garantirCaixaAberto(request, token);
  const vendasAntes = await contarVendas(request, token);

  await loginUI(page);
  await page.locator('input[placeholder*="Bipe"]').first().waitFor({ timeout: 20_000 });
  await bipar(page, "PAP-0006");

  // === A REDE CAI ===
  await context.setOffline(true);

  await page.keyboard.press("F10"); // abre pagamento (aviso de modo offline)
  await page.waitForTimeout(800);
  await page.keyboard.press("F10"); // confirma → fila local em IndexedDB

  // Banner de pendencias aparece; nada chegou no servidor.
  await expect(page.getByTestId("banner-vendas-offline")).toBeVisible({ timeout: 10_000 });
  expect(await contarVendas(request, token)).toBe(vendasAntes);

  // === A REDE VOLTA ===
  await context.setOffline(false);

  // O sincronizador (evento online / recuperacao de saude da API) envia a
  // venda sem nenhum clique. Folga de 60s: a recuperacao de apiSaudavel pode
  // depender do proximo heartbeat (~30s) apos a janela offline.
  await expect
    .poll(() => contarVendas(request, token), { timeout: 60_000 })
    .toBeGreaterThan(vendasAntes);

  // Fila esvaziou — banner some.
  await expect(page.getByTestId("banner-vendas-offline")).toBeHidden({ timeout: 15_000 });
});

test("catálogo offline: PDV abre sem /produtos usando o snapshot da sessão anterior", async ({ page, request }) => {
  const token = await apiLogin(request);
  await garantirCaixaAberto(request, token);

  // 1ª visita ONLINE: a carga normal salva o snapshot do catálogo em
  // IndexedDB (persiste por origem, sobrevive ao reload).
  await loginUI(page);
  await page.locator('input[placeholder*="Bipe"]').first().waitFor({ timeout: 20_000 });
  await bipar(page, "PAP-0006"); // prova que o catálogo carregou de verdade
  await page.waitForTimeout(600); // folga para o salvarSnapshot assíncrono

  // 2ª visita com /produtos DERRUBADO — simula abrir o app sem internet
  // para os dados (o shell vem do service worker em produção).
  await page.route("**/produtos*", route => route.abort());
  await page.reload();
  const busca = page.locator('input[placeholder*="Bipe"]').first();
  await busca.waitFor({ timeout: 20_000 });

  // Aviso de catálogo defasado aparece e o bipe segue funcionando com os
  // produtos do snapshot.
  await expect(page.getByText("Catálogo offline").first()).toBeVisible({ timeout: 10_000 });
  await bipar(page, "PAP-0007");
  await expect(page.getByRole("button", { name: /F10 Finalizar/i })).toBeEnabled();
});
