import { test, expect, Page } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * E2E LIVE — Chat IA Andromeda contra OpenAI real (sin mocks).
 *
 * Cuándo usar:
 *  - Tras configurar OPENAI_API_KEY (gpt-4o recomendado) en .env.local.
 *  - Para confirmar que el flujo end-to-end funciona con el proveedor real.
 *
 * Cómo correr:
 *   npm run dev          # en una terminal (deja el server arriba)
 *   E2E_LIVE=1 npx playwright test e2e/chat-vision-live.spec.ts
 *
 * Se salta si E2E_LIVE no está activado (evita gastar créditos accidentalmente
 * en cada corrida de `npm run e2e`).
 *
 * Requisitos:
 *  - E2E_GENERAL_PASS válida para login como diseñador.
 *  - Una imagen de prueba en /logo (usa el logo verde por defecto).
 */

const PASS = process.env.E2E_GENERAL_PASS || "ganaplay2026";
const LIVE = process.env.E2E_LIVE === "1";

async function loginAsDesigner(page: Page) {
  await page.goto("/");
  await page.getByText("Diseñador").click();
  await page.locator("select").selectOption("Juan David");
  await page.getByPlaceholder("••••••••••••").fill(PASS);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
  await expect(page.getByText("¿Quién está trabajando en qué?")).toBeVisible({ timeout: 20_000 });
}

test.describe("IA Andromeda — verificación LIVE con proveedor real", () => {
  test.skip(!LIVE, "Activa con E2E_LIVE=1 para correr contra OpenAI real.");

  test("badge debe indicar 'visión activa' al abrir el chat", async ({ page }) => {
    await loginAsDesigner(page);
    await page.getByLabel("Abrir chat IA Andromeda").click();
    await expect(page.getByText(/visión activa/i)).toBeVisible({ timeout: 15_000 });
  });

  test("sube imagen real (logo GanaPlay) y recibe análisis sin frase prohibida", async ({ page }) => {
    test.setTimeout(120_000); // damos tiempo a la llamada real

    await loginAsDesigner(page);
    await page.getByLabel("Abrir chat IA Andromeda").click();

    const imagePath = path.resolve(process.cwd(), "logo", "Logo GanaPlay  Verde (1).png");
    if (!fs.existsSync(imagePath)) {
      test.skip(true, `No existe ${imagePath}. Coloca un PNG real para la prueba.`);
      return;
    }

    await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles(imagePath);
    await expect(page.getByText(/Imagen lista para analizar/)).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder("Pregunta o sube un diseño...").fill(
      "Analiza esta pieza para Meta Ads Feed cuadrado. Dame scoring y 3 mejoras concretas."
    );

    await page.getByRole("button").filter({ has: page.locator("svg") }).last().click();

    // Aparece estado "Analizando imagen…"
    await expect(page.getByText(/Analizando imagen…/i)).toBeVisible({ timeout: 5_000 }).catch(() => undefined);

    // Espera la respuesta real (puede tardar 5-30 s)
    const lastMsg = page.locator('[style*="align-self: flex-start"]').last();
    await expect(lastMsg).toBeVisible({ timeout: 90_000 });

    const text = (await lastMsg.textContent()) || "";

    // Verificaciones de calidad mínima
    expect(text.length).toBeGreaterThan(80);
    expect(text.toLowerCase()).not.toContain("no puedo ver la imagen");
    expect(text.toLowerCase()).not.toContain("no tengo visión");
    expect(text.toLowerCase()).not.toContain("no veo");

    // Debería mencionar algún indicador estructurado (score, marca, legibilidad, etc.)
    const hasStructure = /(score|marca|legibilidad|jerarqu|cta|recomend|mejora)/i.test(text);
    expect(hasStructure).toBe(true);
  });
});
