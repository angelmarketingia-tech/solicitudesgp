/**
 * Qué ve y qué NO ve el perfil Operador (Quota, Juan).
 *
 * Solo lectura: entra, mira y sale. No escribe nada.
 * Variables: E2E_GENERAL_PASS, E2E_ADMIN_PASS.
 */
import { test, expect, Page } from "@playwright/test";

const GENERAL_PASS = process.env.E2E_GENERAL_PASS || "";
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || "";

test.use({ baseURL: process.env.E2E_BASE_URL || "http://localhost:3001" });

async function entrarPorRol(page: Page, perfil: string, nombre: string | null, pass: string) {
  await page.goto("/");
  // La sesión queda guardada; sin limpiarla, el segundo login del test
  // aterrizaría en el tablero del primero.
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByText(perfil, { exact: true }).click();
  if (nombre) await page.getByRole("combobox").selectOption(nombre);
  await page.getByPlaceholder("••••••••••••").fill(pass);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 20_000 });
}

/** IDs de solicitud visibles en la vista de Tabla. */
async function idsEnTabla(page: Page): Promise<string[]> {
  await page.getByText("Tabla", { exact: true }).click();
  await expect(page.getByText(/^GP\d{3,}/).first()).toBeVisible({ timeout: 20_000 });
  const textos = await page.getByText(/^GP\d{3,}/).allTextContents();
  return textos.map(t => (t.match(/GP\d+/) || [""])[0]).filter(Boolean);
}

test("Quota no tiene Redes Sociales", async ({ page }) => {
  test.skip(!GENERAL_PASS, "Falta E2E_GENERAL_PASS");
  await entrarPorRol(page, "Operador", "Quota", GENERAL_PASS);
  await expect(page.getByText("Redes Sociales", { exact: true })).toHaveCount(0);
  // Lo que sí conserva:
  await expect(page.getByText("Promocionales", { exact: true })).toBeVisible();
  await expect(page.getByText("Historial", { exact: true })).toBeVisible();
});

test("el Trafficker sí tiene Redes Sociales", async ({ page }) => {
  test.skip(!ADMIN_PASS, "Falta E2E_ADMIN_PASS");
  await entrarPorRol(page, "Trafficker", null, ADMIN_PASS);
  await expect(page.getByText("Redes Sociales", { exact: true })).toBeVisible();
});

test("Quota no ve las solicitudes levantadas por el Trafficker", async ({ page }) => {
  test.skip(!GENERAL_PASS || !ADMIN_PASS, "Faltan contraseñas");

  await entrarPorRol(page, "Trafficker", null, ADMIN_PASS);
  const todas = await idsEnTabla(page);
  expect(todas.length).toBeGreaterThan(0);

  await entrarPorRol(page, "Operador", "Quota", GENERAL_PASS);
  const deQuota = await idsEnTabla(page);

  // Ve menos, y ninguna de las que ve puede faltar en la lista completa.
  expect(deQuota.length).toBeLessThan(todas.length);
  for (const id of deQuota) expect(todas).toContain(id);
  console.log(`Trafficker ve ${todas.length} solicitudes; Quota ve ${deQuota.length}.`);
});
