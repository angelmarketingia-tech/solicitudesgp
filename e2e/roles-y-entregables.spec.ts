/**
 * 1) Separación de roles: el menú "Acceso por rol" ya no ofrece Diseñador, y la
 *    contraseña general no sirve para entrar como diseñador cuando
 *    AUTH_PASS_DESIGNER está configurada.
 * 2) Entregables animados: un GIF se sube y se guarda como pieza.
 *
 * Variables: E2E_ADMIN_PASS (Trafficker), E2E_GENERAL_PASS, E2E_DESIGNER_PASS,
 * E2E_DESIGNER_EMAIL. Sube de verdad a Storage.
 */
import { test, expect, Page } from "@playwright/test";

const GENERAL_PASS = process.env.E2E_GENERAL_PASS || "";
const DESIGNER_PASS = process.env.E2E_DESIGNER_PASS || "";
const DESIGNER_EMAIL = process.env.E2E_DESIGNER_EMAIL || "david.gutierrez@ganaplay.com";

test.use({ baseURL: process.env.E2E_BASE_URL || "http://localhost:3001" });

async function loginConCorreo(page: Page, email: string, pass: string) {
  await page.goto("/");
  await page.getByPlaceholder("nombre.apellido@ganaplay.com").fill(email);
  await page.getByPlaceholder("••••••••••••").fill(pass);
  await page.getByRole("button", { name: /Iniciar sesión/i }).click();
}

test.describe("Separación de roles", () => {
  test("el menú de roles sigue ofreciendo los cinco perfiles", async ({ page }) => {
    // Diseño debe seguir aquí: quitarlo rompía la forma de entrar del equipo.
    // La separación la da la contraseña, no esconder la tarjeta.
    await page.goto("/");
    await page.getByRole("button", { name: /Acceso por rol/i }).click();
    for (const perfil of ["Trafficker", "Community Manager", "Operador", "DIRECTIVOS", "Diseñador"]) {
      await expect(page.getByText(perfil, { exact: true })).toBeVisible();
    }
    // Y al elegir Diseñador se puede escoger el nombre, como siempre.
    await page.getByText("Diseñador", { exact: true }).click();
    const selector = page.getByRole("combobox");
    await expect(selector).toBeVisible();
    await expect(selector.locator("option")).toContainText(["", "Juan David", "Eliana", "Verónica", "Caleb"]);
  });

  test("la contraseña general NO abre una cuenta de diseñador", async ({ page }) => {
    test.skip(!GENERAL_PASS, "Falta E2E_GENERAL_PASS");
    await loginConCorreo(page, DESIGNER_EMAIL, GENERAL_PASS);
    await expect(page.getByText(/Correo o contraseña incorrectos/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toHaveCount(0);
  });

  test("el diseñador entra por el menú de roles, como siempre", async ({ page }) => {
    test.skip(!DESIGNER_PASS, "Falta E2E_DESIGNER_PASS");
    await page.goto("/");
    await page.getByRole("button", { name: /Acceso por rol/i }).click();
    await page.getByText("Diseñador", { exact: true }).click();
    await page.getByRole("combobox").selectOption("Juan David");
    await page.getByPlaceholder("••••••••••••").fill(DESIGNER_PASS);
    await page.getByRole("button", { name: /Acceder al sistema/i }).click();
    await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Centro de Diseño")).toBeVisible();
  });

  test("Quota NO entra como diseñador con su contraseña", async ({ page }) => {
    test.skip(!GENERAL_PASS, "Falta E2E_GENERAL_PASS");
    await page.goto("/");
    await page.getByRole("button", { name: /Acceso por rol/i }).click();
    await page.getByText("Diseñador", { exact: true }).click();
    await page.getByRole("combobox").selectOption("Juan David");
    await page.getByPlaceholder("••••••••••••").fill(GENERAL_PASS);
    await page.getByRole("button", { name: /Acceder al sistema/i }).click();
    await expect(page.getByText(/Contraseña incorrecta/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Centro de Diseño")).toHaveCount(0);
  });

  test("el diseñador entra con su correo y su propia contraseña", async ({ page }) => {
    test.skip(!DESIGNER_PASS, "Falta E2E_DESIGNER_PASS");
    await loginConCorreo(page, DESIGNER_EMAIL, DESIGNER_PASS);
    await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 20_000 });
    // Y sí ve lo suyo: el Centro de Diseño.
    await expect(page.getByText("Centro de Diseño")).toBeVisible();
  });
});

test.describe("Entregables animados", () => {
  test("un GIF se sube como entregable", async ({ page }) => {
    // CUIDADO: esta prueba ESCRIBE en una solicitud real del tablero (adjunta la
    // pieza, pasa el estado a "En Proceso" y añade una entrada al historial).
    // Por eso está apagada salvo que se pida a propósito, y hay que revertir a
    // mano lo que deje. Sin datos de prueba aislados, no hay forma limpia.
    test.skip(process.env.E2E_ALLOW_WRITES !== "1", "Escribe en datos reales: exporta E2E_ALLOW_WRITES=1 para correrla");
    test.skip(!DESIGNER_PASS, "Falta E2E_DESIGNER_PASS");
    test.setTimeout(180_000);
    page.on("console", (m) => { if (m.type() === "error") console.log(`[browser:error] ${m.text()}`); });
    page.on("response", (r) => {
      if (r.url().includes("firebasestorage") || r.url().includes("firestore"))
        console.log(`[red] ${r.status()} ${r.request().method()} ${r.url().slice(0, 90)}`);
    });

    await loginConCorreo(page, DESIGNER_EMAIL, DESIGNER_PASS);
    await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 20_000 });

    // Abrir la primera solicitud del tablero (la tabla son divs, no <table>).
    await page.getByText("Tabla", { exact: true }).click();
    const primera = page.getByText(/^GP\d{3,}/).first();
    await expect(primera).toBeVisible({ timeout: 20_000 });
    await primera.click();
    await expect(page.getByText(/Subir entregables/i)).toBeVisible({ timeout: 20_000 });

    // GIF animado mínimo y válido (2 fotogramas), en base64.
    const gif = Buffer.from(
      "R0lGODlhCgAKAIAAAP8AAAAA/yH/C05FVFNDQVBFMi4wAwEAAAAh+QQJZAABACwAAAAACgAKAAACC4SPqcvtD6OctNqLACH5BAlkAAEALAAAAAAKAAoAAAILhI+py+0Po5y02osAOw==",
      "base64"
    );
    await page.locator('input[type="file"][accept*=".gif"]').setInputFiles({
      name: "animacion-prueba.gif", mimeType: "image/gif", buffer: gif,
    });

    // OJO: el nombre del archivo también aparece en el toast "Subiendo …", así
    // que hay que esperar la PIEZA GUARDADA: su tarjeta trae botón "Descargar".
    const tarjeta = page.locator('.card').filter({ hasText: 'animacion-prueba.gif' });
    await expect(tarjeta.getByRole('button', { name: /Descargar/i })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(/No se pudo subir/i)).toHaveCount(0);
    await expect(page.getByText(/formato no permitido/i)).toHaveCount(0);
    await expect(page.getByText(/falló al actualizar/i)).toHaveCount(0);
  });
});
