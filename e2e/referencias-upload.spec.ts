/**
 * Regresión del bug "No se pudo adjuntar el Word".
 *
 * Las reglas de Storage desplegadas rechazan el MIME de Word (403
 * storage/unauthorized) sin importar el tamaño; por eso `storage-upload.ts`
 * sube los .docx declarándolos `application/zip`, que es su contenedor real.
 *
 * OJO: esta prueba sube de verdad a Storage (deja un objeto de 2.27 MB en
 * `creatives/_references/`). Requiere `E2E_ADMIN_PASS` y un servidor local;
 * pásale `E2E_BASE_URL` si tu dev no está en el 3001.
 */
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

test("una referencia Word de 2.3 MB se adjunta sin errores", async ({ page }) => {
  test.setTimeout(180_000);

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      errors.push(m.text());
      console.log(`[browser:${m.type()}] ${m.text()}`);
    }
  });
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
  // Toda petición a Storage: útil para ver si el POST siquiera sale y con qué responde.
  page.on("response", (r) => {
    if (r.url().includes("firebasestorage") || r.url().includes("storage.googleapis"))
      console.log(`[storage] ${r.status()} ${r.request().method()} ${r.url().slice(0, 120)}`);
  });

  await loginAsAdmin(page);
  await page.getByRole("button", { name: /^Nueva$/i }).click();
  await expect(page.getByRole("heading", { name: /Nueva solicitud de diseño/i })).toBeVisible();

  // Mismo tamaño y nombre (con acentos y paréntesis) del archivo que fallaba.
  const buffer = Buffer.alloc(2.27 * 1024 * 1024, "A");
  await page.locator('input[type="file"][accept*="wordprocessingml"]').setInputFiles({
    name: "Diseño piezas tienda de lealtad (final).docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer,
  });

  // OJO: el texto de progreso también contiene el nombre del archivo, así que
  // hay que esperar la CONFIRMACIÓN (toast) y el chip con su badge DOCX, no el
  // nombre a secas.
  await expect(page.getByText(/1 referencia lista/i)).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText("DOCX", { exact: true })).toBeVisible();
  await expect(page.getByText(/Subiendo/i)).toHaveCount(0);
  // …y NINGUNO de los toasts de fallo.
  await expect(page.getByText(/No se pudo adjuntar/i)).toHaveCount(0);
  await expect(page.getByText(/se omitieron/i)).toHaveCount(0);
  await expect(page.getByText(/formato no admitido/i)).toHaveCount(0);
  await expect(page.getByText(/supera el límite/i)).toHaveCount(0);

  console.log("Errores de consola durante la subida:", errors.length ? errors : "ninguno");
});

/**
 * Una imagen de referencia NO se guarda dentro de la solicitud.
 *
 * Antes se comprimía y se incrustaba como `data:…` en el propio documento.
 * Con 652 solicitudes eso eran 112 MB dentro de la colección, y como el
 * tablero se carga entero, cada persona que lo abría se los descargaba: eso
 * —no el almacenamiento— es lo que generaba la factura de Google. Si esta
 * prueba se pone roja, la factura vuelve.
 */
test("una imagen de referencia queda en Storage, no dentro de la solicitud", async ({ page }) => {
  test.setTimeout(180_000);

  // Un PNG de verdad (1x1), para que la compresión por canvas tenga algo real.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DAAAMBAQBiH7bvAAAAAElFTkSuQmCC",
    "base64",
  );

  await loginAsAdmin(page);
  await page.getByRole("button", { name: /^Nueva$/i }).click();
  await expect(page.getByRole("heading", { name: /Nueva solicitud de diseño/i })).toBeVisible();

  await page.locator('input[type="file"][accept*="wordprocessingml"]').setInputFiles({
    name: "referencia-de-prueba.png",
    mimeType: "image/png",
    buffer: png,
  });

  await expect(page.getByText(/1 referencia lista/i)).toBeVisible({ timeout: 150_000 });

  const src = await page.getByAltText("Referencia 1").getAttribute("src");
  expect(src, "la referencia debería ser una URL de Storage").toMatch(/^https?:\/\//);
  expect(src, "la referencia NO debe ir incrustada en el documento").not.toMatch(/^data:/);
  expect(src).toContain("creatives");
});
