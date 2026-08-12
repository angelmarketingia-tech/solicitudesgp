/**
 * Salud del sitio: que responda, que cargue en un tiempo razonable y que no
 * escupa errores en consola. Es la primera prueba que debería fallar si algo
 * gordo se rompe en un despliegue.
 *
 * No necesita sesión.
 */
import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

/** Errores de consola que no dicen nada del estado de la app. */
const RUIDO = [
  /favicon/i,
  /React DevTools/i,
  /Download the React/i,
  /\[HMR\]/i,
  /permission-denied/i,          // listeners de módulos que el perfil no usa
  /Failed to load resource.*40[34]/i,
];

function erroresReales(mensajes: string[]): string[] {
  return mensajes.filter(m => !RUIDO.some(r => r.test(m)));
}

function vigilarConsola(page: Page): string[] {
  const errores: string[] = [];
  page.on("console", m => { if (m.type() === "error") errores.push(m.text().slice(0, 200)); });
  page.on("pageerror", e => errores.push(`pageerror: ${e.message}`));
  return errores;
}

test("la pantalla de acceso carga rápido y sin errores", async ({ page }) => {
  const errores = vigilarConsola(page);
  const t0 = Date.now();
  const respuesta = await page.goto("/");
  expect(respuesta?.status()).toBeLessThan(400);
  await expect(page.getByText("GanaPlay Diseño").first()).toBeVisible({ timeout: 20_000 });
  const tardo = Date.now() - t0;
  console.log(`Pantalla de acceso: ${tardo} ms`);
  // Umbral holgado a propósito: detecta caídas gordas, no microrregresiones.
  expect(tardo).toBeLessThan(20_000);
  expect(erroresReales(errores)).toEqual([]);
});

test("los cinco perfiles están disponibles para entrar", async ({ page }) => {
  await page.goto("/");
  for (const perfil of ["Trafficker", "Community Manager", "Operador", "DIRECTIVOS", "Diseñador"]) {
    await expect(page.getByText(perfil, { exact: true })).toBeVisible();
  }
});

test("una ruta que no existe no rompe la app", async ({ page }) => {
  const r = await page.goto("/ruta-que-no-existe-jamas");
  expect([404, 200]).toContain(r?.status() ?? 0);
  await expect(page.locator("body")).toBeVisible();
});

test("un código de link público inválido avisa, no revienta", async ({ page }) => {
  const errores = vigilarConsola(page);
  await page.goto("/i/codigo-que-no-existe-000");
  await page.waitForTimeout(4000);
  await expect(page.locator("body")).toBeVisible();
  // No debe quedarse cargando para siempre ni mostrar una pantalla en blanco.
  const texto = await page.locator("body").innerText();
  expect(texto.trim().length).toBeGreaterThan(0);
  expect(erroresReales(errores)).toEqual([]);
});

test("las rutas principales responden", async ({ request }) => {
  for (const ruta of ["/", "/i/codigo-invalido", "/p/codigo-invalido"]) {
    const r = await request.get(ruta);
    console.log(`${ruta.padEnd(22)} → ${r.status()}`);
    expect(r.status(), `la ruta ${ruta} debería responder`).toBeLessThan(500);
  }
});
