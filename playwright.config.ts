import { defineConfig, devices } from "playwright/test";
import { API_URL, APP_URL, API_PORT, APP_PORT, e2eDatabaseUrl } from "./e2e/env";

// ============ E2E COM PLAYWRIGHT ============
// Fluxos de negocio reais (login → PDV → venda → caixa) contra um ambiente
// proprio: backend na 3335 + vite na 5175 + banco demo_e2e no Neon (criado/
// seedado pelo global-setup). Nada disso toca o dev (3333/5173) nem o demo
// dos screenshots (3334/5174).
//
// Rodar:  npm run e2e        (headless)
//         npm run e2e:ui     (com interface)
// Import: "playwright/test" — o pacote instalado e `playwright`, que embute
// o runner; `@playwright/test` NAO esta nas dependencias.

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Os testes compartilham estado real (caixa aberto, estoque). Serial.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: APP_URL,
    locale: "pt-BR",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  webServer: [
    {
      // tsx (nao node): ha rotas .ts no backend. Sem watch — processo de teste.
      command: "npx tsx src/server.js",
      cwd: "backend",
      url: `${API_URL}/health`,
      env: { DATABASE_URL: e2eDatabaseUrl(), PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${APP_PORT} --host 127.0.0.1 --strictPort`,
      url: APP_URL,
      env: { VITE_API_URL: API_URL },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
