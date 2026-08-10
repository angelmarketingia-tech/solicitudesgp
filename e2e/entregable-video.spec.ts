/**
 * Comprueba que un diseñador puede entregar VIDEO y ANIMACIÓN.
 *
 * Corre sobre una solicitud desechable (GP0001PRUEBA) que se crea y se borra
 * fuera de la prueba, para no tocar ninguna solicitud real del tablero.
 */
import { test, expect } from "@playwright/test";

const DESIGNER_PASS = process.env.E2E_DESIGNER_PASS || "";
const ID = "GP0001PRUEBA";

test.use({ baseURL: process.env.E2E_BASE_URL || "http://localhost:3001" });

test("el diseñador entrega un MP4 y un GIF", async ({ page }) => {
  test.skip(!DESIGNER_PASS, "Falta E2E_DESIGNER_PASS");
  test.setTimeout(240_000);
  page.on("console", (m) => { if (m.type() === "error") console.log(`[browser:error] ${m.text()}`); });

  await page.goto("/");
  await page.getByText("Diseñador", { exact: true }).click();
  await page.getByRole("combobox").selectOption("Juan David");
  await page.getByPlaceholder("••••••••••••").fill(DESIGNER_PASS);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 20_000 });

  await page.getByText("Tabla", { exact: true }).click();
  await page.getByText(ID).first().click();
  await expect(page.getByText(/Subir entregables/i)).toBeVisible({ timeout: 20_000 });

  // El formulario debe anunciar los formatos nuevos.
  await expect(page.getByText(/Animados: GIF, APNG/i)).toBeVisible();
  await expect(page.getByText(/Video: MP4, WEBM, MOV/i)).toBeVisible();

  const entrada = page.locator('input[type="file"][accept*=".mp4"]');

  // ── MP4 ──
  await entrada.setInputFiles({
    name: "animacion-prueba.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.concat([
      Buffer.from("00000018667479706d703432000000006d70343269736f6d", "hex"), // ftyp
      Buffer.alloc(300 * 1024, 0),
    ]),
  });
  const tarjetaVideo = page.locator(".card").filter({ hasText: "animacion-prueba.mp4" });
  await expect(tarjetaVideo.getByRole("button", { name: /Descargar/i })).toBeVisible({ timeout: 150_000 });
  // Y se muestra con reproductor, no como icono de archivo.
  await expect(tarjetaVideo.locator("video")).toHaveCount(1);

  // ── GIF animado ──
  await entrada.setInputFiles({
    name: "animacion-prueba.gif",
    mimeType: "image/gif",
    buffer: Buffer.from(
      "R0lGODlhCgAKAIAAAP8AAAAA/yH/C05FVFNDQVBFMi4wAwEAAAAh+QQJZAABACwAAAAACgAKAAACC4SPqcvtD6OctNqLACH5BAlkAAEALAAAAAAKAAoAAAILhI+py+0Po5y02osAOw==",
      "base64"
    ),
  });
  const tarjetaGif = page.locator(".card").filter({ hasText: "animacion-prueba.gif" });
  await expect(tarjetaGif.getByRole("button", { name: /Descargar/i })).toBeVisible({ timeout: 150_000 });
  // El GIF va como imagen (si pasara por el compresor perdería la animación).
  await expect(tarjetaGif.locator("img")).toHaveCount(1);

  await expect(page.getByText(/No se pudo subir/i)).toHaveCount(0);
  await expect(page.getByText(/formato no permitido/i)).toHaveCount(0);
  await expect(page.getByText(/supera el límite/i)).toHaveCount(0);
});
