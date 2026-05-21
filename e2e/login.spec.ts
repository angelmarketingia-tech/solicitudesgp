import { test, expect } from "@playwright/test";

const ADMIN_PASS = process.env.E2E_ADMIN_PASS || "angel2026";

test.describe("Acceso al sistema", () => {
  test("la pantalla de login muestra la marca y los tres roles", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("GanaPlay Diseño").first()).toBeVisible();
    await expect(page.getByText("Trafficker")).toBeVisible();
    await expect(page.getByText("Community Manager")).toBeVisible();
    await expect(page.getByText("Diseñador")).toBeVisible();
  });

  test("una contraseña incorrecta muestra un error claro", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Trafficker").click();
    await page.getByPlaceholder("••••••••••••").fill("clave-incorrecta");
    await page.getByRole("button", { name: /Acceder al sistema/i }).click();
    await expect(page.getByText(/Contraseña incorrecta/i)).toBeVisible();
  });

  test("un Trafficker con la contraseña correcta accede al tablero", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Trafficker").click();
    await page.getByPlaceholder("••••••••••••").fill(ADMIN_PASS);
    await page.getByRole("button", { name: /Acceder al sistema/i }).click();
    await expect(
      page.getByRole("heading", { name: /Solicitudes de diseño/i })
    ).toBeVisible({ timeout: 20_000 });
  });
});
