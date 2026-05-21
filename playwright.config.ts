import { defineConfig, devices } from "@playwright/test";

/**
 * Configuración de pruebas E2E — GanaPlay Diseño.
 * Levanta el servidor de desarrollo automáticamente si no hay uno corriendo.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    locale: "es-ES",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 150_000,
  },
});
