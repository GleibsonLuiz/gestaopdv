import { expect, type APIRequestContext, type Page } from "playwright/test";
import { API_URL } from "./env";

// ============ HELPERS DOS TESTES E2E ============
// Credenciais vem do seed (backend/prisma/seed.js), rodado no global-setup.

export const ADMIN = { email: "admin@gestaopro.local", senha: "admin123" };

// Device estavel para chamadas de API: evita acumular um Dispositivo novo a
// cada execucao da suite (a empresa do seed nao tem limite, mas manter 1
// registro fixo deixa o banco de teste legivel).
const DEVICE_HEADERS = { "X-Device-Id": "e2e-runner", "X-Device-Name": "Suite E2E" };

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, ...DEVICE_HEADERS };
}

export async function apiLogin(request: APIRequestContext, cred = ADMIN): Promise<string> {
  const r = await request.post(`${API_URL}/auth/login`, {
    data: { email: cred.email, senha: cred.senha },
    headers: DEVICE_HEADERS,
  });
  const body = await r.json().catch(() => ({}));
  if (!body.token) {
    throw new Error(`login API falhou (${r.status()}): ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.token as string;
}

// Abre o caixa se nao houver um aberto. O controller responde 409 quando ja
// existe caixa aberto (politica INDEPENDENTE/COMPARTILHADO) — tambem serve.
export async function garantirCaixaAberto(request: APIRequestContext, token: string) {
  const r = await request.post(`${API_URL}/caixas/abrir`, {
    headers: authHeaders(token),
    data: { saldoInicial: 100 },
  });
  if (![200, 201, 409].includes(r.status())) {
    const body = await r.text();
    throw new Error(`abrir caixa: status ${r.status()} — ${body.slice(0, 200)}`);
  }
}

// Caixa aberto do usuario do token (null se nao houver).
export async function caixaAtual(request: APIRequestContext, token: string) {
  const r = await request.get(`${API_URL}/caixas/atual`, { headers: authHeaders(token) });
  const body = await r.json().catch(() => ({}));
  return body.caixa ?? null;
}

// Produtos vendaveis do seed (ativos, com preco e estoque) — para montar
// payloads de venda realistas sem depender de IDs fixos.
export async function produtosVendaveis(request: APIRequestContext, token: string) {
  const r = await request.get(`${API_URL}/produtos`, { headers: authHeaders(token) });
  const body = await r.json().catch(() => []);
  const lista = Array.isArray(body) ? body : body.items || body.dados || [];
  return lista.filter(
    (p: any) => p.ativo && Number(p.precoVenda) > 0 && Number(p.estoque) > 5,
  );
}

// Lida com os dois shapes de listagem usados no backend (array puro ou
// paginado em items/dados) — mesmo normalizador do gerar-vendas-demo.mjs.
export async function contarVendas(request: APIRequestContext, token: string): Promise<number> {
  const r = await request.get(`${API_URL}/vendas`, { headers: authHeaders(token) });
  const body = await r.json().catch(() => []);
  const lista = Array.isArray(body) ? body : body.items || body.dados || body.vendas || [];
  return lista.length;
}

// UUID fixo do "navegador" da suite: sem ele, cada execucao cria um
// localStorage virgem → fingerprint novo → um Dispositivo novo no banco, e
// o plano default do seed limita 2 maquinas (a 3ª execucao caia na tela
// "Esta conta ja esta em uso"). Formato precisa casar o valido() de
// src/lib/dispositivo.ts (UUID hex).
export const E2E_DEVICE_UUID = "e2ee2ee2-0000-4000-8000-00000000e2e0";

export async function loginUI(page: Page, cred = ADMIN) {
  await page.addInitScript((id) => {
    try {
      localStorage.setItem("gestao_device_id", id);
      // Sidebar expandida: navegacao por texto exato (.gp-sidebar) precisa
      // dos rotulos visiveis — mesmo truque dos scripts de video/screenshot.
      localStorage.setItem("gestao_sidebar_collapsed", "0");
    } catch { /* indiferente */ }
  }, E2E_DEVICE_UUID);
  await page.goto("/");
  await page.fill("#email", cred.email);
  await page.fill("#password", cred.senha);
  await page.click('button[type="submit"]');
}

// Bipa um item no PDV. A busca e DEBOUNCED + assincrona: Enter so adiciona
// quando o resultado ja chegou, e nao ha sinal visivel confiavel de "pronto"
// (o hint "Enter Adicionar bipado" e ESTATICO — esperar por ele nao prova
// nada; espera fixa quebrou no CI, onde o runner nos EUA fala com o Neon em
// sa-east-1). Estrategia: re-tenta Enter ate o input limpar — limpar e a
// prova de que o item entrou no carrinho. Enter sem candidato e no-op,
// entao re-tentar nao duplica item.
export async function bipar(page: Page, codigo: string) {
  const busca = page.locator('input[placeholder*="Bipe"]').first();
  await busca.click();
  await busca.fill(codigo);
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    await page.waitForTimeout(tentativa === 0 ? 400 : 700);
    await page.keyboard.press("Enter");
    const limpou = await expect(busca).toHaveValue("", { timeout: 1_500 })
      .then(() => true, () => false);
    if (limpou) return;
  }
  throw new Error(`item ${codigo} nao entrou no carrinho (busca nunca resolveu)`);
}

// O app loga direto no PDV em tela cheia; para telas da sidebar e preciso
// sair pelo chip do usuario → "Menu principal".
export async function sairDoPDV(page: Page) {
  const chip = page.locator(".pdv-user-chip");
  await chip.waitFor({ timeout: 20_000 });
  await chip.click();
  await page.getByText("Menu principal", { exact: true }).click();
}

// Banner flutuante de alertas/notificacoes ("✓ OK" / Marcar como lida) cobre
// a sidebar e intercepta cliques de navegacao ate ser dispensado — eventos
// como fechamento de caixa e estoque baixo disparam um. Fecha o que houver.
export async function dispensarAlertas(page: Page) {
  const ok = page.locator('button[title="Marcar como lida"]');
  for (let i = 0; i < 5 && (await ok.count()) > 0; i++) {
    const sumiu = await ok.first().click({ timeout: 2_000 }).then(() => true, () => false);
    if (!sumiu) break;
    await page.waitForTimeout(200);
  }
}

export async function irParaTela(page: Page, label: string) {
  await dispensarAlertas(page);
  await page.locator(".gp-sidebar").getByText(label, { exact: true }).first().click();
}

export { API_URL, authHeaders };
