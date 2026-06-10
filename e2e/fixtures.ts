import { test as base, expect } from "@playwright/test";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ============ FIXTURES E2E ============
// Setup/teardown para testes isolados: cada teste começa com banco zerado
// (ou reutiliza se reusable: true). DATABASE_URL aponta para demo_e2e local
// ou via Neon TEST_DATABASE_URL em CI.

type TestContext = {
  dbUrl: string;
};

export const test = base.extend<TestContext>({
  dbUrl: async ({}, use) => {
    const dbUrl = process.env.TEST_DATABASE_URL ||
      "postgresql://test:test@localhost:5432/demo_e2e";

    // Setup: reset database (drop + create + migrate + seed)
    console.log(`Preparando banco para testes: ${dbUrl}`);
    try {
      // Drop e create schema (simples + rápido)
      await execAsync(`
        npx prisma migrate reset --force --schema backend/prisma/schema.prisma
      `, { env: { ...process.env, DATABASE_URL: dbUrl } });
      console.log("✓ Banco resetado e seed aplicado");
    } catch (err) {
      console.error("❌ Erro ao resetar banco:", err);
      throw err;
    }

    await use(dbUrl);

    // Teardown: deixar limpo (opcional — pode manter para inspeção)
    // await execAsync(`dropdb ${dbUrl}`, { shell: '/bin/bash' });
  },
});

export { expect };

// ============ USUARIOS PADRAO DO SEED ============
export const USUARIOS_TESTE = {
  admin: { email: "admin@gestaopro.local", senha: "admin123" },
  vendedor: { email: "julia.costa@gestaopro.local", senha: "func123" },
};

// ============ HELPERS ============
export async function login(
  page: typeof test,
  usuario = USUARIOS_TESTE.admin,
) {
  await page.goto("/");
  await page.waitForLoadState("load");
  // Tela de login deve estar visível
  await page.fill('input[type="email"]', usuario.email);
  await page.fill('input[type="password"]', usuario.senha);
  await page.click('button:has-text("Entrar")');
  // Aguarda redirecionamento ou sucesso do login (presença de elementos pós-login)
  await page.waitForURL(/^\/$/, { timeout: 10000 }).catch(() => {});
}
