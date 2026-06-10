import type { APIRequestContext, Page } from "playwright/test";
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

// Abre o caixa se nao houver um aberto. 400 = "ja existe caixa aberto" — serve.
export async function garantirCaixaAberto(request: APIRequestContext, token: string) {
  const r = await request.post(`${API_URL}/caixas/abrir`, {
    headers: authHeaders(token),
    data: { saldoInicial: 100 },
  });
  if (![200, 201, 400].includes(r.status())) {
    const body = await r.text();
    throw new Error(`abrir caixa: status ${r.status()} — ${body.slice(0, 200)}`);
  }
}

// Lida com os dois shapes de listagem usados no backend (array puro ou
// paginado em items/dados) — mesmo normalizador do gerar-vendas-demo.mjs.
export async function contarVendas(request: APIRequestContext, token: string): Promise<number> {
  const r = await request.get(`${API_URL}/vendas`, { headers: authHeaders(token) });
  const body = await r.json().catch(() => []);
  const lista = Array.isArray(body) ? body : body.items || body.dados || body.vendas || [];
  return lista.length;
}

export async function loginUI(page: Page, cred = ADMIN) {
  await page.goto("/");
  await page.fill("#email", cred.email);
  await page.fill("#password", cred.senha);
  await page.click('button[type="submit"]');
}

export { API_URL, authHeaders };
