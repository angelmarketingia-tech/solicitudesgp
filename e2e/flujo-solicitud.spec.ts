/**
 * El ciclo de vida de una solicitud: crear, abrir, comentar, cambiar de
 * estado, entregar piezas y declinar.
 *
 * ESCRIBE en Firestore, así que todo lo que crea lleva el marcador [E2E] y se
 * borra en `afterAll` — incluidas sus piezas en Storage y sus notificaciones.
 * Nunca toca una solicitud real del equipo.
 */
import { test, expect } from "@playwright/test";
import { ficheroSesion, faltaPassword } from "./helpers/sesion";
import { crearSolicitud, borrarSolicitud, leerSolicitud, hayFirebase, MARCADOR } from "./helpers/datos";

const creadas: string[] = [];

test.afterAll(async () => {
  for (const id of creadas) await borrarSolicitud(id);
  if (creadas.length) console.log(`Limpieza: ${creadas.length} solicitud(es) de prueba borradas.`);
});

/** Abre una solicitud concreta desde la vista de Tabla. */
async function abrirSolicitud(page: import("@playwright/test").Page, id: string) {
  await page.goto("/");
  await page.getByText("Tabla", { exact: true }).first().click();
  const fila = page.getByText(id, { exact: false }).first();
  await expect(fila).toBeVisible({ timeout: 30_000 });
  await fila.click();
}

test.describe("Crear solicitudes", () => {
  test.use({ storageState: ficheroSesion("admin") });

  test("basta el nombre: el resto es opcional", async ({ page }) => {
    test.skip(faltaPassword("admin"), "Falta E2E_ADMIN_PASS");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 25_000 });
    await page.getByRole("button", { name: /^Nueva$/i }).click();

    // Solo el título lleva asterisco.
    await expect(page.getByText("Título del proyecto *")).toBeVisible();
    for (const campo of ["Área solicitante", "Nombre del solicitante", "Objetivo de la pieza",
                         "Países destino", "Prioridad", "Fecha límite de entrega"]) {
      await expect(page.getByText(`${campo} *`)).toHaveCount(0);
    }

    await page.getByPlaceholder("Tu nombre").fill("");
    const fecha = page.locator('input[type="date"]');
    if (await fecha.count()) await fecha.first().fill("");

    const nombre = `${MARCADOR} minima ${Date.now()}`;
    await page.getByPlaceholder("Nombre del requerimiento...").fill(nombre);
    await page.getByRole("button", { name: /Crear y asignar solicitud/i }).click();

    const aviso = page.getByText(/creada correctamente/i);
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    const id = ((await aviso.textContent()) || "").match(/GP\d+/)?.[0];
    expect(id, "debería anunciar el ID de la solicitud creada").toBeTruthy();
    creadas.push(id!);

    // Nunca el número de arranque: ese fallo pisó una solicitud real.
    expect(id).not.toBe("GP6612");
    // Y aparece en el tablero pese a no tener fecha de entrega.
    await page.getByText("Tabla", { exact: true }).first().click();
    await expect(page.getByText(nombre).first()).toBeVisible({ timeout: 25_000 });
  });

  test("dos solicitudes seguidas reciben números distintos", async ({ page }) => {
    test.skip(faltaPassword("admin"), "Falta E2E_ADMIN_PASS");
    test.setTimeout(150_000);
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      await page.goto("/");
      await page.getByRole("button", { name: /^Nueva$/i }).click();
      await page.getByPlaceholder("Nombre del requerimiento...").fill(`${MARCADOR} secuencia ${i} ${Date.now()}`);
      await page.getByRole("button", { name: /Crear y asignar solicitud/i }).click();
      const aviso = page.getByText(/creada correctamente/i);
      await expect(aviso).toBeVisible({ timeout: 30_000 });
      const id = ((await aviso.textContent()) || "").match(/GP\d+/)?.[0];
      expect(id).toBeTruthy();
      ids.push(id!); creadas.push(id!);
    }
    expect(ids[0]).not.toBe(ids[1]);
  });

  test("sin nombre no deja crear", async ({ page }) => {
    test.skip(faltaPassword("admin"), "Falta E2E_ADMIN_PASS");
    await page.goto("/");
    await page.getByRole("button", { name: /^Nueva$/i }).click();
    await page.getByPlaceholder("Nombre del requerimiento...").fill("");
    await page.getByRole("button", { name: /Crear y asignar solicitud/i }).click();
    await expect(page.getByRole("heading", { name: /Nueva solicitud de diseño/i })).toBeVisible();
  });
});

test.describe("Trabajar una solicitud", () => {
  test.use({ storageState: ficheroSesion("designer") });

  test("el diseñador cambia el estado y queda registrado", async ({ page }) => {
    test.skip(faltaPassword("designer") || !hayFirebase(), "Faltan credenciales");
    test.setTimeout(150_000);
    const id = await crearSolicitud({ title: `${MARCADOR} estado ${Date.now()}` });
    creadas.push(id);

    await abrirSolicitud(page, id);
    const selector = page.getByRole("combobox").first();
    await expect(selector).toBeVisible({ timeout: 20_000 });
    await selector.selectOption("Planeando");
    await expect(page.getByText(/Planeando/).first()).toBeVisible();

    await expect.poll(async () => (await leerSolicitud(id))?.status, { timeout: 25_000 }).toBe("Planeando");
  });

  test("el diseñador entrega una pieza y se guarda", async ({ page }) => {
    test.skip(faltaPassword("designer") || !hayFirebase(), "Faltan credenciales");
    test.setTimeout(180_000);
    const id = await crearSolicitud({ title: `${MARCADOR} entrega ${Date.now()}` });
    creadas.push(id);

    await abrirSolicitud(page, id);
    await expect(page.getByText(/Subir entregables/i)).toBeVisible({ timeout: 25_000 });
    // Formatos anunciados: estáticos, animados, video y archivos.
    await expect(page.getByText(/Animados: GIF, APNG/i)).toBeVisible();
    await expect(page.getByText(/Video: MP4, WEBM, MOV/i)).toBeVisible();

    const gif = Buffer.from(
      "R0lGODlhCgAKAIAAAP8AAAAA/yH/C05FVFNDQVBFMi4wAwEAAAAh+QQJZAABACwAAAAACgAKAAACC4SPqcvtD6OctNqLACH5BAlkAAEALAAAAAAKAAoAAAILhI+py+0Po5y02osAOw==",
      "base64");
    await page.locator('input[type="file"][accept*=".gif"]').setInputFiles({
      name: "e2e-animacion.gif", mimeType: "image/gif", buffer: gif,
    });

    // La pieza GUARDADA trae botón de descarga (el nombre a secas también
    // aparece en el aviso "Subiendo…", que no prueba nada).
    const tarjeta = page.locator(".card").filter({ hasText: "e2e-animacion.gif" });
    await expect(tarjeta.getByRole("button", { name: /Descargar/i })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(/No se pudo subir/i)).toHaveCount(0);

    // Y un video, que exige reglas de Storage que aceptan video/*.
    await page.locator('input[type="file"][accept*=".mp4"]').setInputFiles({
      name: "e2e-video.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.concat([
        Buffer.from("00000018667479706d703432000000006d70343269736f6d", "hex"),
        Buffer.alloc(200 * 1024, 0),
      ]),
    });
    const tarjetaVideo = page.locator(".card").filter({ hasText: "e2e-video.mp4" });
    await expect(tarjetaVideo.getByRole("button", { name: /Descargar/i })).toBeVisible({ timeout: 150_000 });
    // Se muestra con reproductor, no como icono de archivo.
    await expect(tarjetaVideo.locator("video")).toHaveCount(1);

    const guardada = await leerSolicitud(id);
    expect((guardada?.creatives as unknown[] | undefined)?.length, "las dos piezas deben quedar guardadas").toBe(2);
  });

  test("un comentario del diseñador se guarda", async ({ page }) => {
    test.skip(faltaPassword("designer") || !hayFirebase(), "Faltan credenciales");
    test.setTimeout(150_000);
    const id = await crearSolicitud({ title: `${MARCADOR} comentario ${Date.now()}` });
    creadas.push(id);

    await abrirSolicitud(page, id);
    const texto = `comentario de prueba ${Date.now()}`;
    const caja = page.getByPlaceholder(/Escribe|mensaje|comentario/i).first();
    await expect(caja).toBeVisible({ timeout: 20_000 });
    await caja.fill(texto);
    await caja.press("Enter");
    await expect(page.getByText(texto).first()).toBeVisible({ timeout: 25_000 });
  });
});

test.describe("Declinar", () => {
  test.use({ storageState: ficheroSesion("admin") });

  test("declinar pide motivo y deja la solicitud declinada", async ({ page }) => {
    test.skip(faltaPassword("admin") || !hayFirebase(), "Faltan credenciales");
    test.setTimeout(150_000);
    const id = await crearSolicitud({ title: `${MARCADOR} declinar ${Date.now()}` });
    creadas.push(id);

    await abrirSolicitud(page, id);
    await page.getByRole("button", { name: /Declinar solicitud/i }).click();
    await page.getByRole("button", { name: /Confirmar declinación/i }).click();

    await expect.poll(async () => (await leerSolicitud(id))?.status, { timeout: 25_000 }).toBe("Declinada");
  });
});
