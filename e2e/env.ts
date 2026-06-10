import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ============ AMBIENTE E2E ============
// Portas dedicadas para nao colidir com dev (3333/5173) nem com o ambiente
// demo de screenshots (3334/5174). Sempre 127.0.0.1: o backend so escuta
// IPv4 — "localhost" resolve ::1 no Windows e a conexao falha.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BACKEND_DIR = join(ROOT, "backend");

export const API_PORT = 3335;
export const APP_PORT = 5175;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const APP_URL = `http://127.0.0.1:${APP_PORT}`;

// Banco demo_e2e: mesma instancia Neon do dev, database separado — mesmo
// padrao do demo_manual usado pelos screenshots do manual. Deriva a URL
// trocando o nome do database na DATABASE_URL de backend/.env.
export function e2eDatabaseUrl(): string {
  const explicita = process.env.E2E_DATABASE_URL;
  const url = new URL(explicita || lerDatabaseUrlDoEnv());
  if (!explicita) url.pathname = "/demo_e2e";
  // Trava de seguranca: o global-setup roda `db push --accept-data-loss` e
  // seed neste banco. Exigir "e2e" no nome impede apontar para o banco real.
  if (!/e2e/i.test(url.pathname)) {
    throw new Error(
      `Banco E2E invalido: "${url.pathname}" nao contem "e2e". ` +
      "O setup reseta schema/dados — use um database dedicado (ex.: demo_e2e).",
    );
  }
  return url.toString();
}

function lerDatabaseUrlDoEnv(): string {
  const envFile = readFileSync(join(BACKEND_DIR, ".env"), "utf8");
  const m = envFile.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m);
  if (!m) {
    throw new Error("DATABASE_URL nao encontrado em backend/.env (ou defina E2E_DATABASE_URL)");
  }
  return m[1];
}
