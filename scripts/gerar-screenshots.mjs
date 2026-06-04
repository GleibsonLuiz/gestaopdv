// Gera screenshots de todas as telas do sistema para o manual (docs/MANUAL.md).
//
// Pré-requisitos (ver README do processo):
//   - Backend-demo rodando (banco demo_manual)        -> http://127.0.0.1:3334
//   - Frontend (Vite) com VITE_API_URL=...:3334        -> http://127.0.0.1:5173
//
// Uso:  node scripts/gerar-screenshots.mjs
// Saída: docs/img/<chave>.png
//
// Login demo: admin@gestaopro.local / admin123 (seed da Maxcollor).

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "docs", "img");
mkdirSync(OUT, { recursive: true });

const APP = process.env.APP_URL || "http://127.0.0.1:5173";
const EMAIL = "admin@gestaopro.local";
const SENHA = "admin123";

// Telas acessíveis pela sidebar: { chave do arquivo, rótulo exato no menu }.
// A ordem segue as seções do manual.
const TELAS = [
  { key: "dashboard",      label: "Dashboard" },
  { key: "dashboardcrm",   label: "Dashboard CRM" },
  { key: "clientes",       label: "Clientes" },
  { key: "segmentos",      label: "Segmentos" },
  { key: "reativacao",     label: "Aniversários" },
  { key: "tarefas",        label: "Tarefas" },
  { key: "fidelidade",     label: "Fidelidade" },
  { key: "fornecedores",   label: "Fornecedores" },
  { key: "produtos",       label: "Produtos" },
  { key: "etiquetas",      label: "Etiquetas" },
  { key: "caixa",          label: "Caixa" },
  { key: "estoque",        label: "Estoque" },
  { key: "inventario",     label: "Inventário" },
  { key: "compras",        label: "Compras" },
  { key: "orcamentos",     label: "Orçamentos" },
  { key: "funil",          label: "Funil de Vendas" },
  { key: "automacoes",     label: "Automações" },
  { key: "nps",            label: "NPS" },
  { key: "financeiro",     label: "Financeiro" },
  { key: "crediario",      label: "Crediário" },
  { key: "ordemservico",   label: "Ordem de Serviço" },
  { key: "relatorios",     label: "Relatórios" },
  { key: "notasfiscais",   label: "Notas Fiscais" },
  { key: "fiscalavancado", label: "NF-e / NFS-e" },
  { key: "comissoes",      label: "Comissões" },
  { key: "painelcomandas", label: "Central de Comandas" },
  { key: "whatsapp",       label: "Atendimento WhatsApp" },
  { key: "funcionarios",   label: "Funcionários" },
  { key: "empresa",        label: "Empresa" },
  { key: "impressora",     label: "Impressora" },
  { key: "ajuda",          label: "Ajuda" },
  { key: "projeto",        label: "Projeto" },
  { key: "logs",           label: "Logs" },
  { key: "backup",         label: "Backup" },
  { key: "sistema",        label: "Sistema" },
  // "Aparência" não fica na sidebar — capturada no passo 5 (menu do usuário).
];

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ✔ ${name}.png`);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    locale: "pt-BR",
  });
  // Garante a sidebar expandida (rótulos visíveis) já no primeiro mount.
  await context.addInitScript(() => {
    try { localStorage.setItem("gestao_sidebar_collapsed", "0"); } catch {}
  });
  const page = await context.newPage();
  const erros = [];

  // ---- 1. Tela de login ----
  console.log("→ login");
  await page.goto(APP, { waitUntil: "networkidle" });
  await pausa(800);
  await shot(page, "login");

  // ---- 2. Autentica ----
  await page.fill("#email", EMAIL);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
  await pausa(1500);

  // ---- 3. PDV (modo focado, sem sidebar) ----
  console.log("→ pdv");
  // O app abre direto no PDV em tela cheia.
  if (await page.locator(".pdv-user-chip").count()) {
    await pausa(800);
    await shot(page, "pdv");
    // Sai do PDV: chip do usuário -> "Menu principal".
    await page.click(".pdv-user-chip");
    await pausa(400);
    await page.getByText("Menu principal", { exact: true }).click();
    await page.waitForLoadState("networkidle");
    await pausa(1200);
  } else {
    console.log("  (PDV focado não detectado — seguindo)");
  }

  // ---- 4. Demais telas via sidebar ----
  const sidebar = page.locator(".gp-sidebar");
  for (const { key, label } of TELAS) {
    try {
      console.log(`→ ${key}`);
      const item = sidebar.getByText(label, { exact: true }).first();
      await item.click({ timeout: 8000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      await pausa(1300);
      await shot(page, key);
    } catch (e) {
      erros.push(`${key}: ${e.message.split("\n")[0]}`);
      console.log(`  ✖ ${key} — ${e.message.split("\n")[0]}`);
    }
  }

  // ---- 5. Aparência (fica no menu do usuário, não na sidebar) ----
  try {
    console.log("→ aparencia");
    await sidebar.getByText("GLEIBSON", { exact: false }).first().click();
    await pausa(400);
    await page.getByText("Aparência", { exact: false }).first().click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await pausa(1300);
    await shot(page, "aparencia");
  } catch (e) {
    erros.push(`aparencia: ${e.message.split("\n")[0]}`);
    console.log(`  ✖ aparencia — ${e.message.split("\n")[0]}`);
  }

  await browser.close();
  console.log("\n==== RESUMO ====");
  console.log(`Telas com erro: ${erros.length}`);
  erros.forEach((e) => console.log("  - " + e));
})();
