/**
 * Qué ve alguien de fuera cuando su red bloquea a Firestore.
 *
 * Caso real: una influencer en El Salvador abrió su link y se quedó en la
 * pantalla de carga para siempre, mientras el mismo enlace abría bien desde
 * Colombia. Firestore habla por streaming (WebChannel) y en algunas redes esa
 * conexión no falla: se cuelga. Ni el long-polling automático lo arregló.
 *
 * Por eso el calendario ya no lee Firestore desde el navegador, sino de
 * `/api/influencer/<code>`. Esta prueba bloquea Firestore en el navegador —la
 * red de ella— y exige que el calendario cargue IGUAL.
 */
import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

const CODIGO = process.env.E2E_INFLUENCER_CODE || "mrazeuvqe7sq28gf";

test("el calendario carga aunque la red bloquee Firestore", async ({ page }) => {
  test.setTimeout(90_000);

  // Se cuelgan las peticiones a Firestore: ni respuesta ni error, que es justo
  // lo que hace una red que bloquea su streaming.
  let intentosAFirestore = 0;
  await page.route("**://firestore.googleapis.com/**", () => { intentosAFirestore++; });

  await page.goto(`/i/${CODIGO}`);

  await expect(page.getByText(/Vista de solo lectura/i)).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText(/Contenido /i).first()).toBeVisible();
  await expect(page.getByText(/No pudimos cargar/i)).toHaveCount(0);
  console.log(`Peticiones del navegador a Firestore: ${intentosAFirestore} (deberían ser 0)`);
});

test("si NUESTRO servidor tampoco responde, se avisa y se puede reintentar", async ({ page }) => {
  test.setTimeout(90_000);
  // Ahora el que falla es nuestro endpoint: la persona debe enterarse.
  await page.route("**/api/influencer/**", route => route.abort("failed"));

  await page.goto(`/i/${CODIGO}`);
  await expect(page.getByText(/No pudimos cargar tu calendario/i)).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole("button", { name: /Reintentar/i })).toBeVisible();
});

test("el botón Reintentar vuelve a pedir los datos y carga", async ({ page }) => {
  test.setTimeout(90_000);
  let fallar = true;
  await page.route("**/api/influencer/**", route => {
    if (fallar) { fallar = false; return route.abort("failed"); }
    return route.continue();
  });

  await page.goto(`/i/${CODIGO}`);
  await page.getByRole("button", { name: /Reintentar/i }).click({ timeout: 40_000 });
  await expect(page.getByText(/Vista de solo lectura/i)).toBeVisible({ timeout: 40_000 });
});

test("un código inexistente sí dice que el enlace no vale", async ({ page }) => {
  await page.goto("/i/codigo-que-no-existe-000");
  await expect(page.getByText(/Enlace no válido/i)).toBeVisible({ timeout: 30_000 });
});

test("con red normal, el calendario carga y no aparece ningún aviso", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`/i/${CODIGO}`);
  await expect(page.getByText(/Vista de solo lectura/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/No pudimos cargar/i)).toHaveCount(0);
});
