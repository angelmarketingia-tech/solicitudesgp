/**
 * Separación de perfiles en el único acceso que existe: el menú de roles.
 *
 * Lo que se comprueba: que la contraseña de un perfil NO abre otro. Quota
 * (contraseña general) no entra como Diseñador ni como Trafficker.
 *
 * Variables: E2E_GENERAL_PASS, E2E_DESIGNER_PASS, E2E_ADMIN_PASS.
 */
import { test, expect, Page } from "@playwright/test";

const GENERAL_PASS = process.env.E2E_GENERAL_PASS || "";
const DESIGNER_PASS = process.env.E2E_DESIGNER_PASS || "";
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || "";

test.use({ baseURL: process.env.E2E_BASE_URL || "http://localhost:3001" });

async function entrarPorRol(page: Page, perfil: string, nombre: string | null, pass: string) {
  await page.goto("/");
  await page.getByText(perfil, { exact: true }).click();
  if (nombre) await page.getByRole("combobox").selectOption(nombre);
  await page.getByPlaceholder("••••••••••••").fill(pass);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
}

test.describe("Acceso", () => {
  test("solo se entra por rol: ya no hay acceso por correo", async ({ page }) => {
    await page.goto("/");
    for (const perfil of ["Trafficker", "Community Manager", "Operador", "DIRECTIVOS", "Diseñador"]) {
      await expect(page.getByText(perfil, { exact: true })).toBeVisible();
    }
    await expect(page.getByPlaceholder("nombre.apellido@ganaplay.com")).toHaveCount(0);
    await expect(page.getByText(/acceso por correo/i)).toHaveCount(0);
  });

  test("el diseñador entra y ve su Centro de Diseño", async ({ page }) => {
    test.skip(!DESIGNER_PASS, "Falta E2E_DESIGNER_PASS");
    await entrarPorRol(page, "Diseñador", "Juan David", DESIGNER_PASS);
    await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Centro de Diseño")).toBeVisible();
  });

  test("Quota entra en su propio perfil", async ({ page }) => {
    test.skip(!GENERAL_PASS, "Falta E2E_GENERAL_PASS");
    await entrarPorRol(page, "Operador", "Quota", GENERAL_PASS);
    await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 20_000 });
    // Y NO ve lo de Diseño.
    await expect(page.getByText("Centro de Diseño")).toHaveCount(0);
    await expect(page.getByTitle("Abrir chat IA Andromeda")).toHaveCount(0);
  });
});

test.describe("Una contraseña no abre otro perfil", () => {
  test("Quota NO entra como Diseñador", async ({ page }) => {
    test.skip(!GENERAL_PASS, "Falta E2E_GENERAL_PASS");
    await entrarPorRol(page, "Diseñador", "Juan David", GENERAL_PASS);
    await expect(page.getByText(/Contraseña incorrecta/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Centro de Diseño")).toHaveCount(0);
  });

  test("Quota NO entra como Trafficker", async ({ page }) => {
    test.skip(!GENERAL_PASS, "Falta E2E_GENERAL_PASS");
    await entrarPorRol(page, "Trafficker", null, GENERAL_PASS);
    await expect(page.getByText(/Contraseña incorrecta/i)).toBeVisible({ timeout: 15_000 });
  });

  test("un diseñador NO entra como Trafficker", async ({ page }) => {
    test.skip(!DESIGNER_PASS, "Falta E2E_DESIGNER_PASS");
    await entrarPorRol(page, "Trafficker", null, DESIGNER_PASS);
    await expect(page.getByText(/Contraseña incorrecta/i)).toBeVisible({ timeout: 15_000 });
  });

  test("la contraseña del Trafficker NO entra como Diseñador", async ({ page }) => {
    test.skip(!ADMIN_PASS, "Falta E2E_ADMIN_PASS");
    await entrarPorRol(page, "Diseñador", "Eliana", ADMIN_PASS);
    await expect(page.getByText(/Contraseña incorrecta/i)).toBeVisible({ timeout: 15_000 });
  });
});
