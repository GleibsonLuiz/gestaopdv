// Grava 4 vídeos com LEGENDAS (tutorial) contra o ambiente DEMO:
//   1) venda-pdv         2) caixa-abrir-fechar
//   3) cadastrar-produto 4) venda-fiado (crediário)
// Pré-req: backend-demo (3334) + vite-demo (5174) no ar.
// Saída: docs/video/<nome>.webm  (mp4 é gerado depois por ffmpeg).
import { chromium } from "playwright";
import { mkdirSync, copyFileSync } from "node:fs";

const APP = "http://127.0.0.1:5174";
const API = "http://127.0.0.1:3334";
const VIDDIR = "docs/video/_raw";
mkdirSync(VIDDIR, { recursive: true });
mkdirSync("docs/video", { recursive: true });

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const jr = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

// ---------- API helpers ----------
async function token() {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@gestaopro.local", senha: "admin123" }) });
  return (await jr(r)).token;
}
const H = (t) => ({ "Content-Type": "application/json", Authorization: `Bearer ${t}` });
async function caixaAtual(t) { return jr(await fetch(`${API}/caixas/atual`, { headers: H(t) })); }
async function garantirCaixaAberto(t) {
  const c = await caixaAtual(t);
  const aberto = c?.caixa?.status === "ABERTO";
  if (!aberto) await fetch(`${API}/caixas/abrir`, { method: "POST", headers: H(t), body: JSON.stringify({ saldoInicial: 200 }) });
}
async function fecharCaixaApi(t) {
  const c = await caixaAtual(t);
  if (c?.caixa?.id && c.caixa.status === "ABERTO") {
    await fetch(`${API}/caixas/${c.caixa.id}/fechar`, { method: "POST", headers: H(t), body: JSON.stringify({ saldoFinalContado: 200, trocoProximoDia: 0 }) });
  }
}

// ---------- caption (legenda) ----------
const CAPSCRIPT = `
window.__cap = function(n, text){
  let el = document.getElementById('__cap');
  if(!el){ el = document.createElement('div'); el.id='__cap'; (document.body||document.documentElement).appendChild(el);
    Object.assign(el.style,{position:'fixed',left:'50%',bottom:'46px',transform:'translateX(-50%)',maxWidth:'80%',background:'rgba(15,23,42,0.95)',color:'#fff',font:'600 22px/1.45 system-ui,Segoe UI,Roboto,sans-serif',padding:'15px 22px',borderRadius:'14px',borderLeft:'5px solid #4f8ef7',boxShadow:'0 14px 44px rgba(0,0,0,0.55)',zIndex:'2147483647',display:'flex',gap:'13px',alignItems:'center',pointerEvents:'none',transition:'opacity .25s'});
  }
  el.innerHTML = (n?('<span style="background:#4f8ef7;color:#fff;border-radius:50%;width:34px;height:34px;min-width:34px;display:inline-flex;align-items:center;justify-content:center;font-weight:800">'+n+'</span>'):'')+'<span>'+text+'</span>';
  el.style.opacity='1';
};
window.__capHide=function(){var el=document.getElementById('__cap');if(el)el.style.opacity='0';};
`;
let CAP_N = 0;
async function cap(page, text, ms = 2400, withNum = true) {
  CAP_N = withNum ? CAP_N + 1 : 0;
  await page.evaluate(({ n, t }) => window.__cap(n, t), { n: withNum ? CAP_N : 0, t: text });
  await pausa(ms);
}
async function capHide(page) { await page.evaluate(() => window.__capHide && window.__capHide()).catch(() => {}); }

// ---------- navegação ----------
async function login(page) {
  await page.goto(APP, { waitUntil: "networkidle" });
  await pausa(800);
  await page.fill("#email", "admin@gestaopro.local");
  await page.fill("#password", "admin123");
  await pausa(400);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
  await pausa(2000);
}
async function sairPDV(page) {
  if (await page.locator(".pdv-user-chip").count()) {
    await page.click(".pdv-user-chip");
    await pausa(400);
    await page.getByText("Menu principal", { exact: true }).click();
    await page.waitForLoadState("networkidle");
    await pausa(1200);
  }
}
async function navSidebar(page, label) {
  await page.locator(".gp-sidebar").getByText(label, { exact: true }).first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await pausa(1300);
}

// ---------- runner de gravação ----------
async function gravar(nome, fn) {
  CAP_N = 0;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, locale: "pt-BR",
    recordVideo: { dir: VIDDIR, size: { width: 1440, height: 900 } },
  });
  await context.addInitScript(() => { try { localStorage.setItem("gestao_sidebar_collapsed", "0"); } catch {} });
  await context.addInitScript(CAPSCRIPT);
  const page = await context.newPage();
  try { await fn(page); }
  catch (e) { console.log(`  ✖ erro no fluxo ${nome}:`, e.message.split("\n")[0]); try { await cap(page, "⚠️ (fim da demonstração)", 1500, false); } catch {} }
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) { const raw = await video.path(); const dest = `docs/video/${nome}.webm`; copyFileSync(raw, dest); console.log(`  ✔ ${dest}`); }
}

// ===================== FLUXOS =====================
async function fVenda(page) {
  await login(page);
  await cap(page, "PDV — vamos registrar uma venda no balcão", 2600);
  const busca = page.locator('input[placeholder*="Bipe"]').first();
  await busca.waitFor({ timeout: 10000 });
  const itens = [["PAP-0001", "Caderno universitário"], ["PAP-0007", "Apontador"], ["PAP-0006", "Borracha"]];
  await cap(page, "Bipe (ou digite) o código do produto e tecle Enter", 2600);
  for (const [cod, nome] of itens) {
    await busca.click();
    await busca.type(cod, { delay: 90 });
    await pausa(400);
    await page.keyboard.press("Enter");
    await cap(page, `${nome} adicionado ao carrinho`, 1700);
  }
  await cap(page, "Confira os itens e o total a pagar", 2400);
  await page.keyboard.press("F10");
  await cap(page, "F10 abre o pagamento (Dinheiro já preenchido)", 2600);
  await page.keyboard.press("F10");
  await cap(page, "Pronto! Venda finalizada com sucesso ✅", 3200);
  await capHide(page); await pausa(800);
}

async function fCaixa(page) {
  await login(page);
  await sairPDV(page);
  await navSidebar(page, "Caixa");
  await cap(page, "Tela de Caixa — controle do dinheiro físico", 2600);
  await page.getByRole("button", { name: /Abrir Caixa/i }).first().click();
  await pausa(900);
  await cap(page, "Informe o saldo inicial (o troco em dinheiro)", 2400);
  await page.keyboard.type("200", { delay: 110 });
  await pausa(500);
  await cap(page, "Clique em “Abrir caixa” para começar o dia", 2200);
  await page.getByRole("button", { name: /^Abrir caixa$/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await cap(page, "Caixa aberto ✅ — já dá pra vender", 2600);
  // Fechar
  await page.getByRole("button", { name: /Fechar Caixa/i }).first().click();
  await pausa(900);
  await cap(page, "No fim do dia, feche o caixa", 2200);
  await cap(page, "Conferência cega: conte e digite o valor em caixa", 2600);
  await page.keyboard.type("200", { delay: 110 });
  await pausa(500);
  await page.getByRole("button", { name: "Fechar caixa", exact: true }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await cap(page, "Caixa fechado — o sistema mostra a diferença", 3000);
  await capHide(page); await pausa(800);
}

async function fProduto(page) {
  await login(page);
  await sairPDV(page);
  await navSidebar(page, "Produtos");
  await cap(page, "Cadastro de Produtos", 2200);
  await page.getByRole("button", { name: /Novo Produto/i }).first().click();
  await pausa(1000);
  await cap(page, "Clique em “Novo Produto” e preencha os dados", 2400);
  const codigo = page.locator('.lux-field:has(label:has-text("Código")) input').first();
  await codigo.click();
  await codigo.type("DEMO-VIDEO-01", { delay: 70 });
  await cap(page, "Código do produto (etiqueta/barras)", 1900);
  const nome = page.locator('input[placeholder^="Ex.: Caneta"]').first();
  await nome.click();
  await nome.type("Caneta Gel Premium Azul", { delay: 60 });
  await cap(page, "Nome do produto", 1700);
  const preco = page.locator('.lux-field:has(label:has-text("Preço de venda")) input').first();
  await preco.click();
  await preco.type("7.90", { delay: 90 });
  await cap(page, "Preço de venda", 1800);
  await cap(page, "Clique em “Criar produto” para salvar", 2400);
  await page.getByRole("button", { name: /Criar produto/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await pausa(1500);
  await cap(page, "Produto cadastrado e já disponível no PDV ✅", 3000);
  await capHide(page); await pausa(800);
}

async function fFiado(page, clienteNome) {
  await login(page);
  await cap(page, "Venda no fiado (crediário) — pelo PDV", 2600);
  // 1) adiciona o produto
  const busca = page.locator('input[placeholder*="Bipe"]').first();
  await busca.waitFor({ timeout: 10000 });
  await busca.click();
  await busca.type("PAP-0001", { delay: 90 });
  await page.keyboard.press("Enter");
  await cap(page, "Adicione os produtos normalmente", 2200);
  // 2) escolhe Crediário -> abre o modal de pagamento
  await page.locator(".pdv-pay-btn", { hasText: "Crediário" }).first().click().catch(async () => {
    await page.locator(".pdv-pay-btn", { hasText: "Fiado" }).first().click();
  });
  await pausa(1000);
  await cap(page, "Forma de pagamento: Crediário (fiado)", 2400);
  // 3) seleciona o cliente DENTRO do modal de pagamento
  const selCliente = page.getByPlaceholder("— Consumidor —").first();
  await selCliente.click();
  await pausa(400);
  await cap(page, "Escolha o cliente que vai dever (a caderneta dele)", 2400);
  await selCliente.type(clienteNome.slice(0, 8), { delay: 80 });
  await pausa(1000);
  await page.getByText(clienteNome, { exact: false }).first().click().catch(() => {});
  await pausa(900);
  await cap(page, "O sistema mostra o limite e o vencimento (30 dias)", 2800);
  // 4) confirma (F10 finaliza quando o modal está aberto)
  await page.keyboard.press("F10");
  await pausa(1500);
  await cap(page, "Fiado registrado na caderneta do cliente ✅", 2600);
  // 5) mostra a tela de Crediário
  await sairPDV(page);
  await navSidebar(page, "Crediário");
  await cap(page, "Em Crediário você acompanha o saldo devedor de cada cliente", 3200);
  await capHide(page); await pausa(800);
}

// ===================== RUN =====================
(async () => {
  const t = await token();
  // cliente para o fiado
  const cl = await jr(await fetch(`${API}/clientes?ativo=true`, { headers: H(t) }));
  const clientes = Array.isArray(cl) ? cl : cl.items || cl.dados || [];
  const cliente = clientes[0];
  // garante limite de crédito no cliente do fiado
  if (cliente?.id) {
    await fetch(`${API}/clientes/${cliente.id}`, { method: "PATCH", headers: H(t), body: JSON.stringify({ limiteCredito: 1000 }) }).catch(() => {});
  }

  // Filtro opcional: `node ... venda-fiado caixa-abrir-fechar` grava só esses.
  const only = process.argv.slice(2);
  const run = (nome) => only.length === 0 || only.includes(nome);

  if (run("venda-pdv"))         { console.log("venda-pdv");         await garantirCaixaAberto(t); await gravar("venda-pdv", fVenda); }
  if (run("venda-fiado"))       { console.log("venda-fiado");       await garantirCaixaAberto(t); await gravar("venda-fiado", (p) => fFiado(p, cliente?.nome || "Consumidor")); }
  if (run("cadastrar-produto")) { console.log("cadastrar-produto"); await gravar("cadastrar-produto", fProduto); }
  if (run("caixa-abrir-fechar")){ console.log("caixa-abrir-fechar"); await fecharCaixaApi(t); await gravar("caixa-abrir-fechar", fCaixa); }
  await garantirCaixaAberto(t); // deixa o demo com caixa aberto
  console.log("\nConcluído.");
})();
