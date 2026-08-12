/**
 * Qué ve alguien de fuera cuando su red bloquea a Firestore.
 *
 * Caso real: una influencer en El Salvador abrió su link y se quedó en una
 * pantalla gris para siempre, mientras aquí abría bien. Firestore habla por
 * streaming (WebChannel) y en algunas redes esa conexión no falla: se cuelga.
 * La página esperaba indefinidamente, sin mensaje ni forma de reintentar.
 *
 * Aquí se simula esa red colgando las peticiones a Firestore.
 */
import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

const CODIGO = process.env.E2E_INFLUENCER_CODE || "mrazeuvqe7sq28gf";

test("si la red cuelga a Firestore, se avisa y se puede reintentar", async ({ page }) => {
  test.setTimeout(90_000);

  // Se dejan colgadas SOLO las peticiones de Firestore: ni respuesta ni error,
  // que es justo lo que hace una red que bloquea su streaming. (Bloquear todo
  // googleapis.com colgaría también las fuentes y la página no cargaría nunca,
  // que no es el caso que queremos reproducir.)
  await page.route("**://firestore.googleapis.com/**", () => { /* sin responder */ });

  await page.goto(`/i/${CODIGO}`);

  // Mientras espera, al menos dice qué está haciendo.
  await expect(page.getByText(/Cargando tu calendario/i)).toBeVisible({ timeout: 15_000 });

  // Y no se queda en gris para siempre.
  await expect(page.getByText(/No pudimos cargar tu calendario/i)).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole("button", { name: /Reintentar/i })).toBeVisible();
});

test("con red normal, el calendario carga y no aparece ningún aviso", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`/i/${CODIGO}`);
  await expect(page.getByText(/Vista de solo lectura/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/No pudimos cargar/i)).toHaveCount(0);
});
