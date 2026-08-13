/**
 * La plataforma sigue usable cuando la red del navegador no deja hablar con
 * Firestore.
 *
 * Pasó de verdad, varias veces y en distintas redes: el tablero se quedaba
 * vacío y no se podía crear nada, porque el número de la nueva solicitud se
 * calcula sobre esa lista. Aquí se cuelga Firestore en el navegador —igual que
 * hace esas redes— y se exige que el trabajo continúe por el servidor.
 */
import { test, expect } from "@playwright/test";
import { ficheroSesion, sesionDisponible } from "./helpers/sesion";
import { borrarSolicitud, MARCADOR } from "./helpers/datos";

test.use({ storageState: ficheroSesion("admin") });

const creadas: string[] = [];
// Barrer la colección entera agotaba el tiempo del hook; basta con lo creado aquí.
test.setTimeout(240_000);
test.afterAll(async () => {
  for (const id of creadas) await borrarSolicitud(id);
});

/** Deja colgadas las peticiones a Firestore, sin respuesta ni error. */
async function colgarFirestore(page: import("@playwright/test").Page) {
  await page.route("**://firestore.googleapis.com/**", () => { /* sin responder */ });
}

test("el tablero se carga por el servidor si la conexión en vivo no responde", async ({ page }) => {
  test.skip(!sesionDisponible("admin"), "Sin sesión de admin");
  test.setTimeout(150_000);
  await colgarFirestore(page);

  await page.goto("/");
  // Avisa de que está en respaldo…
  await expect(page.getByText(/Tu red no permite la conexión en vivo/i)).toBeVisible({ timeout: 110_000 });
  // …y aun así hay solicitudes en pantalla.
  await page.getByText("Tabla", { exact: true }).first().click();
  await expect(page.getByText(/^GP\d{3,}/).first()).toBeVisible({ timeout: 110_000 });
});

test("se puede crear una solicitud aunque la conexión en vivo esté cortada", async ({ page }) => {
  test.skip(!sesionDisponible("admin"), "Sin sesión de admin");
  test.setTimeout(180_000);
  await colgarFirestore(page);

  await page.goto("/");
  await expect(page.getByText(/Tu red no permite la conexión en vivo/i)).toBeVisible({ timeout: 110_000 });

  await page.getByRole("button", { name: /^Nueva$/i }).click();
  const nombre = `${MARCADOR} respaldo ${Date.now()}`;
  await page.getByPlaceholder("Nombre del requerimiento...").fill(nombre);
  await page.getByRole("button", { name: /Crear y asignar solicitud/i }).click();

  const aviso = page.getByText(/creada correctamente/i);
  await expect(aviso).toBeVisible({ timeout: 110_000 });
  const id = ((await aviso.textContent()) || "").match(/GP\d+/)?.[0];
  expect(id, "debe anunciar el número asignado").toBeTruthy();
  creadas.push(id!);
  // Y nunca el número de arranque, que pisaría una solicitud existente.
  expect(id).not.toBe("GP6612");
});

test("con la red normal NO aparece el aviso de respaldo", async ({ page }) => {
  test.skip(!sesionDisponible("admin"), "Sin sesión de admin");
  test.setTimeout(90_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText(/Tu red no permite la conexión en vivo/i)).toHaveCount(0);
});
