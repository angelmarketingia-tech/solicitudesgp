import { defineConfig, devices } from "@playwright/test";

/**
 * Configuración de pruebas E2E — GanaPlay Diseño.
 *
 * Dos proyectos:
 *  · "setup" inicia sesión una vez por perfil y guarda el estado en e2e/.auth.
 *  · "chromium" corre las pruebas, que reutilizan esas sesiones.
 *
 * Ese reparto no es cosmético: `/api/auth` limita a 15 intentos por minuto y
 * por IP, así que una suite donde cada prueba hace login se bloquea a sí misma
 * y falla en sitios al azar, aparentando errores de la app.
 *
 * Por defecto apunta al servidor de desarrollo local. Para probar producción:
 *   E2E_BASE_URL=https://solicitudes.ganaplay.lat npx playwright test
 */
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const esLocal = baseURL.includes("localhost");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  // Con más paralelismo se dispara el límite de intentos y se saturan las
  // escrituras de Firestore; 4 es el punto donde la suite es estable.
  workers: 4,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "es-ES",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: esLocal
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      }
    : undefined,
});
