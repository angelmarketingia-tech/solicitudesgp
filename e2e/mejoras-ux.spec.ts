/**
 * Los ajustes pedidos para la plataforma: Escape, botón atrás, enlace de una
 * solicitud, navegación de semanas, compartir la entrega, copy con su formato
 * y correos del solicitante.
 *
 * Lo que escribe se borra en `afterAll` (marcador [E2E]).
 */
import { test, expect, type Page } from "@playwright/test";
import { ficheroSesion, sesionDisponible } from "./helpers/sesion";
import { crearSolicitud, borrarSolicitud, hayFirebase, MARCADOR } from "./helpers/datos";

const creadas: string[] = [];
test.afterAll(async () => { for (const id of creadas) await borrarSolicitud(id); });

async function abrirSolicitud(page: Page, id: string) {
  // Por enlace directo: además de ser estable, es la función que se acaba de
  // añadir. Buscar la fila entre 200+ solicitudes daba tiempos muy variables.
  await page.goto(`/?solicitud=${id}`);
  await expect(page.getByRole("button", { name: /Copiar enlace/i })).toBeVisible({ timeout: 75_000 });
}

test.describe("Ventanas emergentes", () => {
  test.use({ storageState: ficheroSesion("admin") });

  test("Escape cierra la ventana de nueva solicitud", async ({ page }) => {
    test.skip(!sesionDisponible("admin"), "Sin sesión de admin");
    await page.goto("/");
    await page.getByRole("button", { name: /^Nueva$/i }).click();
    await expect(page.getByRole("heading", { name: /Nueva solicitud de diseño/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: /Nueva solicitud de diseño/i })).toHaveCount(0);
  });

  test("Escape cierra Mi perfil", async ({ page }) => {
    test.skip(!sesionDisponible("admin"), "Sin sesión de admin");
    await page.goto("/");
    await page.getByTitle("Mi perfil y contraseña").click();
    await expect(page.getByRole("heading", { name: "Mi perfil" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Mi perfil" })).toHaveCount(0);
  });

  test("el botón atrás cierra la ventana SIN salir de la plataforma", async ({ page }) => {
    test.skip(!sesionDisponible("admin"), "Sin sesión de admin");
    test.setTimeout(120_000);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 25_000 });

    await page.getByRole("button", { name: /^Nueva$/i }).click();
    await expect(page.getByRole("heading", { name: /Nueva solicitud de diseño/i })).toBeVisible();

    await page.goBack();
    // La ventana se cierra…
    await expect(page.getByRole("heading", { name: /Nueva solicitud de diseño/i })).toHaveCount(0);
    // …y se sigue dentro de la plataforma, no fuera.
    await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible();
  });
});

test.describe("Enlace y compartir", () => {
  test.use({ storageState: ficheroSesion("admin") });

  test("la ficha ofrece copiar el enlace de la solicitud", async ({ page }) => {
    test.skip(!sesionDisponible("admin") || !hayFirebase(), "Faltan credenciales");
    test.setTimeout(120_000);
    const id = await crearSolicitud({ title: `${MARCADOR} enlace ${Date.now()}` });
    creadas.push(id);
    await abrirSolicitud(page, id);
    await expect(page.getByRole("button", { name: /Copiar enlace/i })).toBeVisible();
  });

  test("un enlace de solicitud abre esa ficha al entrar", async ({ page }) => {
    test.skip(!sesionDisponible("admin") || !hayFirebase(), "Faltan credenciales");
    test.setTimeout(120_000);
    const titulo = `${MARCADOR} directo ${Date.now()}`;
    const id = await crearSolicitud({ title: titulo });
    creadas.push(id);

    await page.goto(`/?solicitud=${id}`);
    // La ficha se abre sola, sin tener que buscarla.
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 40_000 });
    await expect(page.getByRole("button", { name: /Copiar enlace/i })).toBeVisible();
  });

  test("con la entrega hecha aparece el botón de compartir", async ({ page }) => {
    test.skip(!sesionDisponible("admin") || !hayFirebase(), "Faltan credenciales");
    test.setTimeout(150_000);
    const id = await crearSolicitud({
      title: `${MARCADOR} compartir ${Date.now()}`,
      creatives: [{ id: "x1", url: "https://example.com/pieza.png", type: "pieza.png" }],
    });
    creadas.push(id);
    await abrirSolicitud(page, id);
    await expect(page.getByRole("button", { name: /Compartir entrega/i })).toBeVisible();
  });
});

test.describe("Planeación y formato", () => {
  test.use({ storageState: ficheroSesion("admin") });

  test("las semanas se pueden mover hacia atrás y hacia adelante", async ({ page }) => {
    test.skip(!sesionDisponible("admin"), "Sin sesión de admin");
    await page.goto("/");
    await page.getByText("Planeación", { exact: true }).first().click();

    const anteriores = page.getByRole("button", { name: /Anteriores/i });
    const siguientes = page.getByRole("button", { name: /Siguientes/i });
    await expect(anteriores).toBeVisible({ timeout: 25_000 });

    const rango = () => page.locator(".card").first().innerText();
    const inicial = await rango();
    await siguientes.click();
    await expect.poll(rango, { timeout: 10_000 }).not.toBe(inicial);
    await expect(page.getByRole("button", { name: /Volver a esta semana/i })).toBeVisible();
    await anteriores.click();
    await anteriores.click();
    await expect.poll(rango, { timeout: 10_000 }).not.toBe(inicial);
    await page.getByRole("button", { name: /Volver a esta semana/i }).click();
    await expect.poll(rango, { timeout: 10_000 }).toBe(inicial);
  });

  test("el copy respeta los saltos de línea de quien lo escribió", async ({ page }) => {
    test.skip(!sesionDisponible("admin") || !hayFirebase(), "Faltan credenciales");
    test.setTimeout(120_000);
    const id = await crearSolicitud({
      title: `${MARCADOR} copy ${Date.now()}`,
      copy: "Primera línea\nSegunda línea\n\nCuarta tras un hueco",
    });
    creadas.push(id);
    await abrirSolicitud(page, id);
    const parrafo = page.getByText("Primera línea").first();
    await expect(parrafo).toBeVisible({ timeout: 25_000 });
    // `pre-wrap` es lo que conserva renglones y espacios.
    await expect(parrafo).toHaveCSS("white-space", "pre-wrap");
  });

  test("al crear, solo viene el correo de quien solicita", async ({ page }) => {
    test.skip(!sesionDisponible("admin"), "Sin sesión de admin");
    await page.goto("/");
    await page.getByRole("button", { name: /^Nueva$/i }).click();
    await expect(page.getByRole("heading", { name: /Nueva solicitud de diseño/i })).toBeVisible();
    // Antes venían TRES correos fijos ya elegidos como destinatarios de la
    // entrega. Ahora solo el de quien está creando la solicitud. (Las
    // sugerencias de un clic siguen ofreciéndose aparte: eso es otra cosa.)
    await expect(page.getByText("La entrega llega a TODOS (1)")).toBeVisible();
  });
});

test.describe("Subir arrastrando", () => {
  test.use({ storageState: ficheroSesion("designer") });

  test("un entregable se sube soltándolo sobre la zona", async ({ page }) => {
    test.skip(!sesionDisponible("designer") || !hayFirebase(), "Faltan credenciales");
    test.setTimeout(180_000);
    const id = await crearSolicitud({ title: `${MARCADOR} arrastre ${Date.now()}` });
    creadas.push(id);

    await page.goto(`/?solicitud=${id}`);
    const zona = page.getByText(/Arrastra los entregables aquí/i);
    await expect(zona).toBeVisible({ timeout: 75_000 });

    // Se construye un DataTransfer real en el navegador y se sueltan los
    // eventos de arrastre sobre la zona, como haría una persona.
    const gif = "R0lGODlhCgAKAIAAAP8AAAAA/yH5BAAAAAAALAAAAAAKAAoAAAIKhI+py+0Po5yUFQA7";
    await page.evaluate(async ({ base64 }) => {
      const zona = [...document.querySelectorAll("label")]
        .find(l => l.textContent?.includes("Arrastra los entregables aquí"));
      if (!zona) throw new Error("no se encontró la zona de arrastre");
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const archivo = new File([bytes], "arrastrado.gif", { type: "image/gif" });
      const dt = new DataTransfer();
      dt.items.add(archivo);
      zona.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: dt }));
      zona.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
      zona.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
    }, { base64: gif });

    // La pieza queda guardada (su tarjeta trae botón de descarga).
    const tarjeta = page.locator(".card").filter({ hasText: "arrastrado.gif" });
    await expect(tarjeta.getByRole("button", { name: /Descargar/i })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(/No se pudo subir/i)).toHaveCount(0);
  });
});
