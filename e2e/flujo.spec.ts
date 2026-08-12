import { test, expect, Page } from "@playwright/test";
import { ficheroSesion } from "./helpers/sesion";

const ADMIN_PASS = process.env.E2E_ADMIN_PASS || "";

// La sesión la abre auth.setup.ts una sola vez (ver helpers/sesion.ts):
// aquí basta con abrir el tablero. Antes cada prueba hacía su propio login
// y el límite de 15 intentos/minuto de /api/auth tumbaba la suite entera.
async function loginAsAdmin(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 30_000 });
}

test.use({ storageState: ficheroSesion("admin") });

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
  test.use({ storageState: ficheroSesion("designer") });
  test("un diseñador accede a su Centro de Diseño", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText("¿Quién está trabajando en qué?")
    ).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("Perfil Community Manager", () => {
  test.use({ storageState: ficheroSesion("cm") });
  test("la nueva solicitud viene preseleccionada para Community", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Solicitudes de diseño/i })
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^Nueva$/i }).click();
    await expect(
      page.getByRole("heading", { name: /Nueva solicitud de diseño/i })
    ).toBeVisible();
    // Nombre y correo del solicitante vienen preseleccionados.
    await expect(page.getByPlaceholder("Tu nombre")).toHaveValue("Community Manager");
    // El campo de correo pasó a ser una lista de destinatarios ya elegidos:
    // se comprueba que el del CM esté entre ellos.
    await expect(page.getByText(/fernanda.monrroy@ganaplay.com/i).first()).toBeVisible();
  });
});
