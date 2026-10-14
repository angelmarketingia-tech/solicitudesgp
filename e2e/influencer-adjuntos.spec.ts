/**
 * Adjuntos en Contenido Influencers: imágenes, PDF/Word y enlaces.
 *
 * POR QUÉ: hasta ahora el brief cabía en el campo «Ideas», así que el guion en
 * Word, el PDF de la campaña o el video de referencia se mandaban por aparte y
 * al influencer le llegaba el calendario sin ellos.
 *
 * Esta prueba ESCRIBE de verdad —sube a Storage y crea documentos— porque lo
 * que hay que demostrar es justo eso: que el archivo llega a Storage y que el
 * influencer lo ve en su enlace público, sin cuenta. Lo que crea lo borra al
 * final; todo va marcado [E2E] por si algo se interrumpe (`npm run e2e:limpiar`).
 */
import { test, expect } from "@playwright/test";
import { ficheroSesion, sesionDisponible } from "./helpers/sesion";
import { shareCodeDeInfluencer } from "./helpers/datos";

const MARCADOR = "[E2E]";

/** Un PNG de 1×1 de verdad, para que la subida a Storage sea real. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DAAAMBAQBiH7bvAAAAAElFTkSuQmCC",
  "base64",
);

test.use({ storageState: ficheroSesion("admin") });

test("una tarjeta admite imagen, PDF y enlace, y el influencer los ve en su link", async ({ page, browser }) => {
  test.skip(!sesionDisponible("admin"), "Sin sesión de Trafficker");
  test.setTimeout(240_000);

  const nombreInf = `${MARCADOR} Adjuntos ${Date.now()}`;
  const tituloItem = `${MARCADOR} Contenido con adjuntos`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 40_000 });
  await page.getByText("Contenido Influencers", { exact: true }).click();

  // Alta del influencer de prueba.
  await page.getByPlaceholder("Nombre del influencer").fill(nombreInf);
  await page.getByRole("button", { name: /^Agregar$/ }).click();
  // .first(): el nombre sale en la lista lateral y también en el encabezado
  // del calendario, así que sin acotar el localizador es ambiguo.
  await expect(page.getByText(nombreInf).first()).toBeVisible({ timeout: 40_000 });
  await page.getByText(nombreInf).first().click();

  // Nueva tarjeta de contenido.
  await page.getByRole("button", { name: /^Solicitud$/ }).click();
  await expect(page.getByRole("heading", { name: /Nueva solicitud de contenido/i })).toBeVisible();
  await page.getByPlaceholder(/Recap del fin de semana/i).fill(tituloItem);

  // Lo nuevo: una imagen y un PDF.
  await page.locator('input[type="file"]').last().setInputFiles([
    { name: "referencia-e2e.png", mimeType: "image/png", buffer: PNG },
    { name: "brief-e2e.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e") },
  ]);
  await expect(page.getByText(/adjuntos? listos?/i)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("brief-e2e.pdf")).toBeVisible();

  // Y un enlace de referencia, que se normaliza solo (sin https:// delante).
  await page.getByPlaceholder(/Pega un enlace/i).fill("youtube.com/watch?v=e2e");
  // exact: el panel tiene otro botón que dice «copiar enlace alterno».
  await page.getByRole("button", { name: "Enlace", exact: true }).click();
  await expect(page.getByText(/youtube\.com/)).toBeVisible();

  await page.getByRole("button", { name: /Agregar al calendario/i }).click();
  await expect(page.getByText(/Contenido agregado/i)).toBeVisible({ timeout: 40_000 });

  // Lo que de verdad recibe el influencer: su enlace público, sin cuenta.
  // El código se lee de la base y no del portapapeles: Playwright no tiene
  // permiso de lectura por defecto y ese fallo se confundiría con un fallo
  // de la función que se está probando.
  const code = await shareCodeDeInfluencer(nombreInf);
  expect(code, "el influencer debería tener código de enlace público").toBeTruthy();
  const ruta = `/i/${code}`;

  const ctx = await browser.newContext();   // sin sesión: como el influencer
  const publica = await ctx.newPage();
  await publica.goto(ruta!);
  await publica.getByText(tituloItem).first().click();
  await expect(publica.getByText(/Referencias y documentos/i)).toBeVisible({ timeout: 40_000 });
  await expect(publica.getByText("brief-e2e.pdf")).toBeVisible();
  await expect(publica.getByAltText(/Referencia 1/i)).toBeVisible();
  await ctx.close();

  // Limpieza: al borrar al influencer se va también su contenido.
  page.once("dialog", d => d.accept());
  await page.getByTitle("Eliminar influencer").first().click();
  await expect(page.getByText(nombreInf)).toHaveCount(0, { timeout: 40_000 });  // ni en la lista ni en el encabezado
});
