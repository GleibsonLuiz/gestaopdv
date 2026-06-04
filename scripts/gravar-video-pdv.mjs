// Grava um vídeo (webm) simulando uma venda no PDV, contra o ambiente DEMO.
// Pré-req: backend-demo (3334) + vite-demo (5174) no ar, caixa aberto.
// Saída: docs/video/pdv-venda.webm
import { chromium } from "playwright";
import { mkdirSync, copyFileSync } from "node:fs";

const APP = process.env.APP_URL || "http://127.0.0.1:5174";
const VIDDIR = "docs/video/_raw";
const OUT = "docs/video/pdv-venda.webm";
mkdirSync(VIDDIR, { recursive: true });

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
// Códigos reais do seed demo (código + Enter = bipe direto).
const ITENS = ["PAP-0001", "PAP-0007", "PAP-0006"];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "pt-BR",
  recordVideo: { dir: VIDDIR, size: { width: 1440, height: 900 } },
});
await context.addInitScript(() => { try { localStorage.setItem("gestao_sidebar_collapsed", "0"); } catch {} });
const page = await context.newPage();

// --- Login ---
await page.goto(APP, { waitUntil: "networkidle" });
await pausa(900);
await page.fill("#email", "admin@gestaopro.local");
await page.fill("#password", "admin123");
await pausa(500);
await page.click('button[type="submit"]');
await page.waitForLoadState("networkidle");
await pausa(2000); // abre no PDV (tela cheia)

// --- Campo de busca/bipe ---
const busca = page.locator('input[placeholder*="Bipe"]').first();
await busca.waitFor({ timeout: 10000 });
await pausa(1000);

// --- Bipa os itens ---
for (const cod of ITENS) {
  await busca.click();
  await busca.type(cod, { delay: 90 });
  await pausa(500);
  await page.keyboard.press("Enter");
  await pausa(1200); // mostra item entrando no carrinho
}

await pausa(1500); // mostra carrinho + total

// --- Finaliza: F10 abre pagamento (Dinheiro cheio), F10 confirma ---
await page.keyboard.press("F10");
await pausa(2200); // mostra modal de pagamento / troco
await page.keyboard.press("F10");
await pausa(3500); // mostra tela de sucesso / cupom

// --- Encerra e salva o vídeo ---
const video = page.video();
await context.close();
await browser.close();
if (video) {
  const raw = await video.path();
  copyFileSync(raw, OUT);
  console.log("VÍDEO salvo em:", OUT, "\n(raw:", raw + ")");
} else {
  console.log("Sem vídeo gerado.");
}
