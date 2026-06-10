import { defineConfig, devices } from "@playwright/test";

// ============ E2E TESTES COM PLAYWRIGHT ============
// Fluxos de negócio real: login, PDV, venda completa, caixa.
// Base de dados de teste (demo_e2e) é criada+resetada no beforeAll.
// CI roda em headless; dev roda com UI (npx playwright test --ui).

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30 * 1000,
  expect: { timeout: 5 * 1000 },

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: "npm --prefix backend run dev",
      url: "http://localhost:3000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: { DATABASE_URL: "postgresql://test:test@localhost:5432/demo_e2e" },
    },
  ],

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
