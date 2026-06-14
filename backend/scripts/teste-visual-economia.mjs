// Teste visual das telas (Playwright) contra o app de PRODUCAO, logado no
// tenant ECONOMIA. Percorre as telas principais, captura screenshot e coleta
// erros de console / pageerror / respostas de API com erro por tela.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const APP = "https://gestaopdv.vercel.app";
const API = "gestao-pdv-api.vercel.app";
const OUT = "D:/tmp/visual-economia";
mkdirSync(OUT, { recursive: true });

const TELAS = [
  ["dashboard", "Dashboard"], ["dashboardcrm", "Dashboard CRM"],
  ["clientes", "Clientes"], ["segmentos", "Segmentos"], ["reativacao", "Aniversários"],
  ["fidelidade", "Fidelidade"], ["fornecedores", "Fornecedores"], ["produtos", "Produtos"],
  ["caixa", "Caixa"], ["estoque", "Estoque"], ["inventario", "Inventário"],
  ["compras", "Compras"], ["sugestoes", "Sugestões de Compra"], ["orcamentos", "Orçamentos"],
  ["funil", "Funil de Vendas"], ["nps", "NPS"], ["financeiro", "Financeiro"],
  ["despesas", "Despesas"], ["contabilidade", "Contabilidade"], ["crediario", "Crediário"],
  ["relatorios", "Relatórios"], ["comissoes", "Comissões"],
];

const erros = []; // {tela, tipo, msg}
let telaAtual = "login";
function logErro(tipo, msg) { erros.push({ tela: telaAtual, tipo, msg: String(msg).slice(0, 200) }); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "pt-BR" });
// Forca a sidebar COLAPSADA: cada item vira <button title="Label"> (clique deterministico).
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("gestao_sidebar_collapsed", "1");
    // Fingerprint FIXO: reutiliza 1 unico dispositivo entre execucoes (nao
    // estoura o limite de licenca por maquina). UUID v4 valido.
    localStorage.setItem("gestao_device_id", "11111111-1111-4111-8111-111111111111");
  } catch {}
});
const page = await ctx.newPage();

async function temSidebar() {
  return (await page.locator('button[title="Dashboard"]').count().catch(() => 0)) > 0;
}
async function abrirMenu() {
  // O PDV substitui a sidebar global por um header proprio. Para revelar o
  // menu: clicar no avatar (abre dropdown) e depois "Menu principal" (onSair).
  if (await temSidebar()) return true;
  try {
    await page.locator('button[title="Menu / Sair do PDV"]').first().click({ timeout: 4000 });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /Menu principal/i }).first().click({ timeout: 4000 });
    await page.waitForTimeout(1500);
  } catch {}
  return await temSidebar();
}

async function navegarPara(label) {
  await abrirMenu();
  // 1) por title (sidebar colapsada), 2) por role button exato, 3) por texto
  const tentativas = [
    () => page.locator(`button[title="${label}"]`).first(),
    () => page.getByRole("button", { name: label, exact: true }).first(),
    () => page.getByText(label, { exact: true }).first(),
  ];
  for (const get of tentativas) {
    const el = get();
    if (await el.count().catch(() => 0)) {
      try { await el.scrollIntoViewIfNeeded({ timeout: 3000 }); await el.click({ timeout: 4000 }); return true; } catch {}
    }
  }
  return false;
}

page.on("console", (m) => { if (m.type() === "error") logErro("console", m.text()); });
page.on("pageerror", (e) => logErro("pageerror", e.message));
page.on("response", (r) => {
  const u = r.url();
  if (u.includes(API) && r.status() >= 400) logErro("api", `${r.status()} ${u.replace(/^https?:\/\/[^/]+/, "")}`);
});
page.on("requestfailed", (r) => { const u = r.url(); if (u.includes(API)) logErro("netfail", `${r.failure()?.errorText} ${u.replace(/^https?:\/\/[^/]+/, "")}`); });

const resultados = [];
async function snap(id, nome) {
  telaAtual = id;
  const antes = erros.length;
  await page.waitForTimeout(1800); // deixa carregar dados
  let ok = true, detalhe = "";
  try {
    await page.screenshot({ path: `${OUT}/${String(resultados.length).padStart(2, "0")}-${id}.png`, fullPage: false });
  } catch (e) { ok = false; detalhe = "screenshot falhou: " + e.message; }
  const errosTela = erros.slice(antes);
  resultados.push({ id, nome, ok, novosErros: errosTela.length, detalhe });
  const flag = errosTela.length ? ` ⚠️ ${errosTela.length} erro(s)` : " ✓";
  console.log(`${nome.padEnd(22)}${flag}${detalhe ? "  " + detalhe : ""}`);
}

try {
  console.log("Abrindo", APP, "...");
  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#email", { timeout: 30000 });

  // login
  await page.fill("#email", "gerente@economia.local");
  await page.fill("#password", "economia123");
  await page.click('button:has-text("Entrar")');

  // espera o app carregar (sidebar com "Dashboard" ou some o campo de email)
  await page.waitForSelector("#email", { state: "detached", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const logou = await page.locator("text=Dashboard").first().isVisible().catch(() => false);
  if (!logou) {
    const corpo = (await page.locator("body").innerText().catch(() => "")).slice(0, 300);
    console.log("AVISO: pode nao ter logado. Texto da tela:\n", corpo);
  } else {
    console.log("Login OK. Percorrendo telas...\n");
  }

  // tela inicial (PDV)
  await snap("pdv", "PDV (inicial)");
  await abrirMenu();

  for (const [id, label] of TELAS) {
    const navegou = await navegarPara(label);
    if (!navegou) {
      telaAtual = id;
      resultados.push({ id, nome: label, ok: false, novosErros: 0, detalhe: "nao navegou" });
      console.log(`${label.padEnd(22)} ❌ nao navegou`);
      continue;
    }
    await snap(id, label);
  }

  // resumo
  const comErro = resultados.filter((r) => r.novosErros > 0);
  const naoNavegou = resultados.filter((r) => !r.ok && r.detalhe.includes("nao navegou"));
  console.log(`\n== ${resultados.length} telas | ${resultados.filter((r) => r.ok && r.novosErros === 0).length} limpas | ${comErro.length} com erro | ${naoNavegou.length} sem navegar ==`);
  if (comErro.length) {
    console.log("\nTELAS COM ERRO:");
    for (const r of comErro) {
      console.log(`  ${r.nome}:`);
      for (const e of erros.filter((x) => x.tela === r.id)) console.log(`     [${e.tipo}] ${e.msg}`);
    }
  }
  // erros de API agregados
  const apiErr = erros.filter((e) => e.tipo === "api");
  if (apiErr.length) console.log("\nAPI 4xx/5xx:", [...new Set(apiErr.map((e) => e.msg))].join("\n  "));
  console.log("\nScreenshots em:", OUT);
} catch (e) {
  console.error("FALHA GERAL:", e.message);
  await page.screenshot({ path: `${OUT}/_falha.png` }).catch(() => {});
} finally {
  await browser.close();
}
