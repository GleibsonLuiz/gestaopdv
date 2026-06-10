import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BACKEND_DIR, e2eDatabaseUrl } from "./env";

// ============ SETUP GLOBAL (roda 1x por execucao da suite) ============
// Prepara o banco demo_e2e: `db push` cria o database se nao existir e
// alinha o schema (em banco novo, `migrate deploy` QUEBRA — a migration
// fiscal de 2026-05-28 referencia um enum antes de cria-lo; por isso push).
// O seed e idempotente (upserts; compras so na primeira vez), entao rodar
// de novo e barato.

export default function globalSetup() {
  const dbUrl = e2eDatabaseUrl();
  const env = { ...process.env, DATABASE_URL: dbUrl };
  const banco = new URL(dbUrl).pathname;
  console.log(`[e2e] preparando banco ${banco} (db push + seed)…`);
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: BACKEND_DIR, env, stdio: "inherit",
  });
  execSync("node prisma/seed.js", { cwd: BACKEND_DIR, env, stdio: "inherit" });
  // Ajustes que so valem no banco de teste (ex.: dispositivos ilimitados).
  const posSeed = join(dirname(fileURLToPath(import.meta.url)), "pos-seed.sql");
  execSync(`npx prisma db execute --url "${dbUrl}" --file "${posSeed}"`, {
    cwd: BACKEND_DIR, env, stdio: "inherit",
  });
  console.log("[e2e] banco pronto.");
}
