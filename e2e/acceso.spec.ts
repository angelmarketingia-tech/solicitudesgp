/**
 * El login de verdad: es el ÚNICO archivo que llama a `/api/auth` repetidas
 * veces, por eso va en serie. `/api/auth` limita a 15 intentos por minuto y
 * por IP; si estas pruebas corrieran en paralelo con el resto, la suite se
 * bloquearía a sí misma.
 *
 * Lo que garantiza: que la contraseña de un perfil NO abre otro.
 */
import { test, expect } from "@playwright/test";
import { entrar, passwordDe, faltaPassword, CREDENCIALES } from "./helpers/sesion";

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

const tablero = /Solicitudes de diseño/i;

test("solo se entra por rol: no queda acceso por correo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByPlaceholder("nombre.apellido@ganaplay.com")).toHaveCount(0);
  await expect(page.getByText(/acceso por correo/i)).toHaveCount(0);
});

test("el Trafficker entra con su contraseña", async ({ page }) => {
  test.skip(faltaPassword("admin"), "Falta E2E_ADMIN_PASS");
  await entrar(page, "admin");
  await expect(page.getByRole("heading", { name: tablero })).toBeVisible({ timeout: 25_000 });
});

test("el diseñador entra y aterriza en su Centro de Diseño", async ({ page }) => {
  test.skip(faltaPassword("designer"), "Falta E2E_DESIGNER_PASS");
  await entrar(page, "designer");
  await expect(page.getByRole("heading", { name: tablero })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Centro de Diseño")).toBeVisible();
});

test("una contraseña equivocada no entra", async ({ page }) => {
  await entrar(page, "cm", { password: "clave-que-no-es" });
  await expect(page.getByText(/Contraseña incorrecta|incorrectos/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: tablero })).toHaveCount(0);
});

test.describe("una contraseña no abre el perfil de otro", () => {
  test("la general no abre Diseño", async ({ page }) => {
    test.skip(!CREDENCIALES.general || CREDENCIALES.general === CREDENCIALES.designer,
      "Diseño aún comparte la contraseña general (falta AUTH_PASS_DESIGNER)");
    await entrar(page, "designer", { password: CREDENCIALES.general });
    await expect(page.getByText(/Contraseña incorrecta/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Centro de Diseño")).toHaveCount(0);
  });

  test("la general no abre Trafficker", async ({ page }) => {
    test.skip(faltaPassword("cm"), "Falta E2E_GENERAL_PASS");
    await entrar(page, "admin", { password: CREDENCIALES.general });
    await expect(page.getByText(/Contraseña incorrecta/i)).toBeVisible({ timeout: 20_000 });
  });

  test("la del Trafficker no abre Diseño", async ({ page }) => {
    test.skip(faltaPassword("admin"), "Falta E2E_ADMIN_PASS");
    await entrar(page, "designer", { password: passwordDe("admin") });
    await expect(page.getByText(/Contraseña incorrecta/i)).toBeVisible({ timeout: 20_000 });
  });
});

test("la sesión sobrevive al recargar", async ({ page }) => {
  test.skip(faltaPassword("cm"), "Falta E2E_GENERAL_PASS");
  await entrar(page, "cm");
  await expect(page.getByRole("heading", { name: tablero })).toBeVisible({ timeout: 25_000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: tablero })).toBeVisible({ timeout: 25_000 });
});

test("al cerrar sesión se vuelve a la pantalla de acceso", async ({ page }) => {
  test.skip(faltaPassword("cm"), "Falta E2E_GENERAL_PASS");
  await entrar(page, "cm");
  await expect(page.getByRole("heading", { name: tablero })).toBeVisible({ timeout: 25_000 });
  await page.getByRole("button", { name: /Cerrar sesión/i }).click();
  await expect(page.getByText("Trafficker", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: tablero })).toHaveCount(0);
});
