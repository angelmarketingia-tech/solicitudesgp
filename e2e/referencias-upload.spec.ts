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

const ADMIN_PASS = process.env.E2E_ADMIN_PASS || "angel2026";

test.use({ baseURL: process.env.E2E_BASE_URL || "http://localhost:3001" });

async function loginAsAdmin(page: Page) {
  await page.goto("/");
  await page.getByText("Trafficker").click();
  await page.getByPlaceholder("••••••••••••").fill(ADMIN_PASS);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
  await expect(
    page.getByRole("heading", { name: /Solicitudes de diseño/i })
  ).toBeVisible({ timeout: 20_000 });
}

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
