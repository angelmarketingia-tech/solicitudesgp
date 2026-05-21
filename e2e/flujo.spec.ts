import { test, expect, Page } from "@playwright/test";

const ADMIN_PASS = process.env.E2E_ADMIN_PASS || "angel2026";

async function loginAsAdmin(page: Page) {
  await page.goto("/");
  await page.getByText("Trafficker").click();
  await page.getByPlaceholder("••••••••••••").fill(ADMIN_PASS);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
  await expect(
    page.getByRole("heading", { name: /Solicitudes de diseño/i })
  ).toBeVisible({ timeout: 20_000 });
}

test.describe("Flujo del tablero", () => {
  test("el Trafficker puede abrir el formulario de nueva solicitud", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("button", { name: /^Nueva$/i }).click();
    await expect(
      page.getByRole("heading", { name: /Nueva solicitud de diseño/i })
    ).toBeVisible();
    // El formulario incluye los campos ampliados del brief.
    await expect(page.getByText("Área solicitante", { exact: false })).toBeVisible();
    await expect(page.getByText("Objetivo de la pieza", { exact: false })).toBeVisible();
    await expect(page.getByText("Canales donde se usará", { exact: false })).toBeVisible();
  });

  test("la navegación entre vistas del tablero funciona", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByText("Por estado").click();
    await expect(page.getByText("En proceso", { exact: false }).first()).toBeVisible();
    await page.getByText("Historial").click();
    await expect(page.getByPlaceholder(/Buscar por ID/i)).toBeVisible();
    await page.getByText("Tabla", { exact: true }).click();
    await expect(page.getByText("En curso", { exact: false }).first()).toBeVisible();
  });

  test("el panel de notificaciones se abre y se cierra", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByTitle("Notificaciones").click();
    await expect(page.getByText("Notificaciones", { exact: true })).toBeVisible();
  });

  test("los canales se limitan a Facebook, Instagram, Página Web y CMR", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("button", { name: /^Nueva$/i }).click();
    await expect(
      page.getByRole("heading", { name: /Nueva solicitud de diseño/i })
    ).toBeVisible();
    await expect(page.getByText("Facebook")).toBeVisible();
    await expect(page.getByText("Página Web")).toBeVisible();
    await expect(page.locator("label").filter({ hasText: "CMR" }).first()).toBeVisible();
    // Google Ads y TikTok ya no deben existir.
    await expect(page.getByText("Google Ads")).toHaveCount(0);
    await expect(page.getByText("TikTok")).toHaveCount(0);
  });
});

test.describe("Centro de Diseño", () => {
  test("un diseñador accede a su Centro de Diseño", async ({ page }) => {
    const PASS = process.env.E2E_GENERAL_PASS || "ganaplay2026";
    await page.goto("/");
    await page.getByText("Diseñador").click();
    await page.locator("select").selectOption("Juan David");
    await page.getByPlaceholder("••••••••••••").fill(PASS);
    await page.getByRole("button", { name: /Acceder al sistema/i }).click();
    await expect(
      page.getByText("¿Quién está trabajando en qué?")
    ).toBeVisible({ timeout: 20_000 });
  });
});
