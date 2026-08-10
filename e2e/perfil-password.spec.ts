/**
 * "Mi perfil" → cambiar contraseña.
 *
 * La parte que NO crea cuentas (mostrar el perfil, rechazar una contraseña
 * actual equivocada) corre siempre. El ciclo completo —crear la contraseña
 * personal y entrar con ella— crea una cuenta real en Firebase Auth, así que
 * exige E2E_ALLOW_WRITES=1 y hay que borrar la cuenta después.
 */
import { test, expect, Page } from "@playwright/test";

const DESIGNER_PASS = process.env.E2E_DESIGNER_PASS || "";
const CORREO = "david.gutierrez@ganaplay.com";

test.use({ baseURL: process.env.E2E_BASE_URL || "http://localhost:3001" });

async function entrarComoDisenador(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Acceso por rol/i }).click();
  await page.getByText("Diseñador", { exact: true }).click();
  await page.getByRole("combobox").selectOption("Juan David");
  await page.getByPlaceholder("••••••••••••").fill(DESIGNER_PASS);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 20_000 });
}

async function abrirPerfil(page: Page) {
  await page.getByTitle("Mi perfil y contraseña").click();
  await expect(page.getByRole("heading", { name: "Mi perfil" })).toBeVisible();
  // Los inputs no tienen htmlFor, así que se localizan por posición en el modal.
  const modal = page.locator(".modal-overlay");
  return {
    modal,
    actual: modal.locator("input[type=password]").nth(0),
    nueva: modal.locator("input[type=password]").nth(1),
    repetir: modal.locator("input[type=password]").nth(2),
    guardar: modal.getByRole("button", { name: /Guardar contraseña/i }),
  };
}

test("el perfil muestra quién eres y tu correo", async ({ page }) => {
  test.skip(!DESIGNER_PASS, "Falta E2E_DESIGNER_PASS");
  await entrarComoDisenador(page);
  const f = await abrirPerfil(page);
  await expect(f.modal.getByText("Juan David")).toBeVisible();
  await expect(f.modal.getByText(CORREO)).toBeVisible();
  await expect(f.modal.getByText(/Cambiar mi contraseña/i)).toBeVisible();
});

test("rechaza una contraseña actual equivocada", async ({ page }) => {
  test.skip(!DESIGNER_PASS, "Falta E2E_DESIGNER_PASS");
  await entrarComoDisenador(page);
  const f = await abrirPerfil(page);
  await f.actual.fill("esto-no-es-mi-clave");
  await f.nueva.fill("NuevaClave2026");
  await f.repetir.fill("NuevaClave2026");
  await f.guardar.click();
  await expect(page.getByText(/La contraseña actual no es correcta/i)).toBeVisible({ timeout: 20_000 });
});

test("avisa si la nueva contraseña no coincide", async ({ page }) => {
  test.skip(!DESIGNER_PASS, "Falta E2E_DESIGNER_PASS");
  await entrarComoDisenador(page);
  const f = await abrirPerfil(page);
  await f.actual.fill(DESIGNER_PASS);
  await f.nueva.fill("NuevaClave2026");
  await f.repetir.fill("OtraDistinta2026");
  await f.guardar.click();
  await expect(page.getByText(/no coinciden/i)).toBeVisible();
});

test("exige una contraseña de largo mínimo", async ({ page }) => {
  test.skip(!DESIGNER_PASS, "Falta E2E_DESIGNER_PASS");
  await entrarComoDisenador(page);
  const f = await abrirPerfil(page);
  await f.actual.fill(DESIGNER_PASS);
  await f.nueva.fill("corta");
  await f.repetir.fill("corta");
  await f.guardar.click();
  await expect(page.getByText(/al menos 8 caracteres/i)).toBeVisible();
});

test("crea la contraseña personal y sirve para entrar", async ({ page }) => {
  test.skip(process.env.E2E_ALLOW_WRITES !== "1", "Crea una cuenta real en Firebase Auth; hay que borrarla después");
  test.skip(!DESIGNER_PASS, "Falta E2E_DESIGNER_PASS");
  const nueva = process.env.E2E_NUEVA_PASS || "";
  test.skip(!nueva, "Falta E2E_NUEVA_PASS");

  await entrarComoDisenador(page);
  const f = await abrirPerfil(page);
  await f.actual.fill(DESIGNER_PASS);
  await f.nueva.fill(nueva);
  await f.repetir.fill(nueva);
  await f.guardar.click();
  await expect(page.getByText(/La próxima vez entra con tu correo/i)).toBeVisible({ timeout: 30_000 });

  // Y ahora entra con su correo + la contraseña nueva.
  await f.modal.click({ position: { x: 6, y: 6 } });   // cerrar el modal
  await expect(page.getByRole("heading", { name: "Mi perfil" })).toHaveCount(0);
  await page.getByRole("button", { name: /Cerrar sesión/i }).click();
  // Al salir queda la pantalla de roles (fue el último modo usado).
  const volver = page.getByRole("button", { name: /Volver al acceso por correo/i });
  if (await volver.isVisible().catch(() => false)) await volver.click();
  await page.getByPlaceholder("nombre.apellido@ganaplay.com").fill(CORREO);
  await page.getByPlaceholder("••••••••••••").fill(nueva);
  await page.getByRole("button", { name: /Iniciar sesión/i }).click();
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Centro de Diseño")).toBeVisible();
});
