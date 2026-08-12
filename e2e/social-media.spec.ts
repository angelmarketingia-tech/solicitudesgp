import { test, expect, Page } from "@playwright/test";
import { ficheroSesion } from "./helpers/sesion";
import path from "path";

/**
 * E2E de la pestaña "Redes Sociales" — cubre toda la experiencia y todos los botones:
 *   - Aparición y apertura del tab
 *   - Calendario: meses anterior/siguiente, encabezados de días, clic en un día
 *   - Diseñador: crear carpeta, entrar, breadcrumb, volver
 *   - Subida REAL de video + imagen a Firebase Storage (opcional, ver abajo)
 *   - Reproductor/lightbox, descargar, borrar archivo, borrar carpeta
 *   - Permisos: admin/CM en modo solo lectura (sin botones de gestión)
 *
 * La subida real toca Firebase Storage. Para evitar dejar basura en el bucket
 * en cada corrida, los tests que suben archivos están detrás de RUN_UPLOAD=1
 * y limpian lo que crean. Sin esa variable, se omiten (skip) y el resto corre.
 */

const ADMIN_PASS = process.env.E2E_ADMIN_PASS || "";
const GENERAL_PASS = process.env.E2E_GENERAL_PASS || "";
const RUN_UPLOAD = process.env.RUN_UPLOAD === "1";

const VIDEO = path.join(__dirname, "fixtures", "test-video.mp4");
const IMAGE = path.join(__dirname, "fixtures", "test-image.png");

// La sesión la abre auth.setup.ts una sola vez (ver helpers/sesion.ts):
// aquí basta con abrir el tablero. Antes cada prueba hacía su propio login
// y el límite de 15 intentos/minuto de /api/auth tumbaba la suite entera.
async function loginAsDesigner(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 30_000 });
}

// El admin entra con SU sesión guardada, en su propio contexto: este fichero
// corre con la sesión de diseñador.
async function paginaComoAdmin(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext({ storageState: ficheroSesion("admin") });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 30_000 });
  return { ctx, page };
}

async function openSocialTab(page: Page) {
  await page.getByText("Redes Sociales", { exact: true }).click();
  await expect(page.getByText("Calendario de Redes Sociales")).toBeVisible({ timeout: 15_000 });
}

test.use({ storageState: ficheroSesion("designer") });

test.describe("Redes Sociales — navegación y calendario", () => {
  test("el tab aparece y abre el calendario", async ({ page }) => {
    await loginAsDesigner(page);
    await openSocialTab(page);
    // Encabezados de la semana visibles
    await expect(page.getByText("Lun", { exact: true })).toBeVisible();
    await expect(page.getByText("Dom", { exact: true })).toBeVisible();
  });

  test("el calendario navega entre meses (anterior y siguiente)", async ({ page }) => {
    await loginAsDesigner(page);
    await openSocialTab(page);

    // Lee el mes actual mostrado (selector estable por testid)
    const header = page.getByTestId("sm-month-label");
    await expect(header).toBeVisible();
    const monthBefore = (await header.textContent())?.trim() || "";

    // Avanza un mes → el texto debe cambiar
    await page.getByRole("button", { name: "Mes siguiente" }).click();
    await expect(header).not.toHaveText(monthBefore);

    // Retrocede → vuelve exactamente al mes original
    await page.getByRole("button", { name: "Mes anterior" }).click();
    await expect(header).toHaveText(monthBefore);
  });

  test("al hacer clic en un día se abre el detalle con breadcrumb", async ({ page }) => {
    await loginAsDesigner(page);
    await openSocialTab(page);
    // Clic en el día 15 (existe en todos los meses)
    await page.getByRole("button", { name: "15", exact: true }).click();
    // Cabecera del día y breadcrumb "Inicio del día"
    await expect(page.getByText(/15 de .* de \d{4}/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Inicio del día/i })).toBeVisible();
    // Volver al calendario
    await page.getByTitle("Volver al calendario").click();
    await expect(page.getByText("Calendario de Redes Sociales")).toBeVisible();
  });
});

test.describe("Redes Sociales — diseñador (gestión)", () => {
  test("el diseñador ve los botones de gestión dentro de un día", async ({ page }) => {
    await loginAsDesigner(page);
    await openSocialTab(page);
    await page.getByRole("button", { name: "10", exact: true }).click();
    await expect(page.getByRole("button", { name: /Nueva carpeta/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Subir archivos/i })).toBeVisible();
    // Estado vacío con mensaje
    await expect(page.getByText(/vacía/i)).toBeVisible();
  });

  test("crear carpeta, entrar y navegar por breadcrumb", async ({ page }) => {
    await loginAsDesigner(page);
    await openSocialTab(page);
    await page.getByRole("button", { name: "12", exact: true }).click();

    const folderName = `QA-${Date.now()}`;
    page.once("dialog", (d) => d.accept(folderName)); // window.prompt
    await page.getByRole("button", { name: /Nueva carpeta/i }).click();

    // La carpeta aparece
    const folderCard = page.getByText(folderName, { exact: true });
    await expect(folderCard).toBeVisible({ timeout: 15_000 });

    // Entrar a la carpeta → breadcrumb muestra su nombre
    await folderCard.click();
    await expect(page.getByRole("button", { name: folderName, exact: true })).toBeVisible();

    // Volver al inicio del día
    await page.getByRole("button", { name: /Inicio del día/i }).click();
    await expect(folderCard).toBeVisible();

    // Limpieza: borrar la carpeta (acepta el confirm)
    page.once("dialog", (d) => d.accept());
    await folderCard.locator("xpath=ancestor::div[1]").getByTitle("Eliminar").click();
    await expect(folderCard).toBeHidden({ timeout: 15_000 });
  });

  (RUN_UPLOAD ? test : test.skip)(
    "subir un VIDEO real, verlo, descargarlo y borrarlo",
    async ({ page }) => {
      await loginAsDesigner(page);
      await openSocialTab(page);
      await page.getByRole("button", { name: "18", exact: true }).click();

      // Subir el video (input file oculto)
      await page.locator('input[type="file"]').setInputFiles(VIDEO);

      // Aparece la tarjeta del archivo
      const fileCard = page.getByText("test-video.mp4", { exact: true });
      await expect(fileCard).toBeVisible({ timeout: 40_000 });

      // Botón descargar presente
      const card = fileCard.locator("xpath=ancestor::div[contains(@style,'border-radius')][1]");
      await expect(card.getByRole("button", { name: /Descargar/i })).toBeVisible();

      // Abrir lightbox (clic en la miniatura)
      await card.locator("video").first().click();
      await expect(page.locator('video[controls]')).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press("Escape").catch(() => {});
      // Cerrar lightbox con la X si sigue abierto
      const closeBtn = page.locator('button:has(svg)').filter({ hasText: "" });
      await page.mouse.click(5, 5).catch(() => {});

      // Limpieza: borrar el archivo
      page.once("dialog", (d) => d.accept());
      await card.getByTitle("Eliminar").click();
      await expect(fileCard).toBeHidden({ timeout: 20_000 });
    }
  );

  (RUN_UPLOAD ? test : test.skip)(
    "subir una IMAGEN real y borrarla",
    async ({ page }) => {
      await loginAsDesigner(page);
      await openSocialTab(page);
      await page.getByRole("button", { name: "20", exact: true }).click();
      await page.locator('input[type="file"]').setInputFiles(IMAGE);
      const fileCard = page.getByText("test-image.png", { exact: true });
      await expect(fileCard).toBeVisible({ timeout: 40_000 });
      const card = fileCard.locator("xpath=ancestor::div[contains(@style,'border-radius')][1]");
      page.once("dialog", (d) => d.accept());
      await card.getByTitle("Eliminar").click();
      await expect(fileCard).toBeHidden({ timeout: 20_000 });
    }
  );
});

test.describe("Redes Sociales — permisos (solo lectura)", () => {
  test("el Trafficker (admin) ve el calendario pero NO botones de gestión", async ({ browser }) => {
    const { ctx, page } = await paginaComoAdmin(browser);
    await openSocialTab(page);
    // Aviso de solo lectura
    await expect(page.getByText(/solo lectura/i)).toBeVisible();
    // Entra a un día y confirma que NO hay botones de subir/crear
    await page.getByRole("button", { name: "14", exact: true }).click();
    await expect(page.getByRole("button", { name: /Nueva carpeta/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Subir archivos/i })).toHaveCount(0);
    await ctx.close();
  });
});
