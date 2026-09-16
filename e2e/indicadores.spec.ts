/**
 * Los cambios de septiembre de 2026, comprobados sobre un tablero conocido:
 *
 *  · Pestaña Indicadores: las cifras del mes, los filtros y las tablas.
 *  · Área solicitante con «Otra…» y tipo E-CARDS en el formulario.
 *  · Entregas de la Community Manager.
 *  · El enlace del correo (?solicitud=) sobrevive al inicio de sesión.
 *
 * Todas montan el tablero en el navegador y cortan Firestore (ver
 * `helpers/tablero-falso.ts`): no hace falta contraseña y NO se escribe nada.
 * Por eso las cifras se afirman al número en vez de "mayor que cero", que es
 * lo único que se puede exigir contra datos que cambian solos.
 */
import { test, expect, Page } from "@playwright/test";
import { montarTablero } from "./helpers/tablero-falso";

/** Septiembre de 2026: el mes con el que están calculados los totales. */
const DESDE = "2026-09-01";
const HASTA = "2026-09-30";

async function abrirIndicadores(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 40_000 });
  await page.getByText("Indicadores", { exact: true }).first().click();
  await expect(page.getByRole("heading", { name: /Indicadores/i })).toBeVisible({ timeout: 20_000 });
}

/** Acota el periodo con el filtro personalizado. */
async function acotarASeptiembre(page: Page) {
  await page.getByLabel(/Periodo/i).or(page.locator("select").first()).selectOption("Personalizado");
  const fechas = page.locator('input[type="date"]');
  await fechas.nth(0).fill(DESDE);
  await fechas.nth(1).fill(HASTA);
  await expect(page.getByText(`${DESDE} → ${HASTA}`)).toBeVisible({ timeout: 10_000 });
}

/** El número grande de una ficha de indicador, por su etiqueta. */
function indicador(page: Page, etiqueta: string) {
  return page.locator("div").filter({ hasText: new RegExp(`^${etiqueta}$`) }).first()
    .locator("xpath=following-sibling::div[1]");
}

test.describe("Indicadores de Diseño", () => {
  test.beforeEach(async ({ page }) => { await montarTablero(page); });

  test("las cifras del mes son las que salen del tablero", async ({ page }) => {
    await abrirIndicadores(page);
    await acotarASeptiembre(page);

    // 5 solicitudes en septiembre (GP9005 es de agosto y queda fuera).
    await expect(page.getByText("5 solicitudes")).toBeVisible();
    await expect(indicador(page, "Solicitudes")).toHaveText("5");
    // 6 piezas = 3 diseños principales + 3 redimensiones.
    await expect(indicador(page, "Diseños principales")).toHaveText("3");
    await expect(indicador(page, "Redimensiones")).toHaveText("3");
    await expect(indicador(page, "Total de piezas")).toHaveText("6");
    // De 2 publicadas, 1 salió dentro de la fecha comprometida.
    await expect(page.getByText("1 de 2 publicadas dentro de la fecha")).toBeVisible();
    await expect(indicador(page, "Cumplimiento")).toHaveText("50%");
  });

  test("el periodo acota de verdad: agosto trae otra solicitud", async ({ page }) => {
    await abrirIndicadores(page);
    await acotarASeptiembre(page);
    await expect(indicador(page, "Solicitudes")).toHaveText("5");

    const fechas = page.locator('input[type="date"]');
    await fechas.nth(0).fill("2026-08-01");
    // Agosto + septiembre: entra también GP9005, con su pieza.
    await expect(indicador(page, "Solicitudes")).toHaveText("6");
    await expect(indicador(page, "Total de piezas")).toHaveText("7");
  });

  test("producción por diseñador y por área, con E-CARDS contadas", async ({ page }) => {
    await abrirIndicadores(page);
    await acotarASeptiembre(page);

    const porDisenador = page.locator(".card").filter({ hasText: "Producción por diseñador" });
    // Verónica 2+1, Eliana 3, Caleb 0 piezas.
    await expect(porDisenador.getByText("Verónica")).toBeVisible();
    await expect(porDisenador.getByText("Eliana")).toBeVisible();

    // El anillo de áreas reparte las 6 piezas: Pauta 5, Directiva 1.
    const porArea = page.locator(".card").filter({ hasText: "Producción por área" });
    await expect(porArea.getByText("Pauta")).toBeVisible();
    await expect(porArea.getByText("Directiva")).toBeVisible();

    // E-CARDS existe como tipo y cuenta sus solicitudes (GP9001 y GP9004).
    const porTipo = page.locator(".card").filter({ hasText: "Solicitudes por tipo" });
    // exact: el subtítulo de la tarjeta también nombra E-CARDS.
    await expect(porTipo.getByText("E-CARDS", { exact: true })).toBeVisible();
  });

  test("Registros repite las mismas cifras en tabla", async ({ page }) => {
    await abrirIndicadores(page);
    await acotarASeptiembre(page);
    await page.getByText("Registros", { exact: true }).click();

    // La tabla es el gemelo accesible de las gráficas: los totales no cambian.
    await expect(indicador(page, "Total de piezas")).toHaveText("6");
    const tabla = page.locator(".card").filter({ hasText: "Producción por diseñador" }).locator("table");
    await expect(tabla.getByRole("row", { name: /Verónica/ })).toBeVisible();

    // Y el detalle lista las solicitudes del periodo, no las de fuera.
    await expect(page.getByText("GP9001")).toBeVisible();
    await expect(page.getByText("GP9005")).toHaveCount(0);
  });

  test("«Mis solicitudes» solo trae las de quien mira", async ({ page }) => {
    await abrirIndicadores(page);
    await acotarASeptiembre(page);
    await page.getByText("Mis solicitudes", { exact: true }).click();

    // Verónica tiene GP9001 y GP9002 en septiembre.
    await expect(indicador(page, "Solicitudes")).toHaveText("2");
    await expect(page.getByText("GP9003")).toHaveCount(0);
  });
});

test.describe("Formulario de solicitud", () => {
  test.beforeEach(async ({ page }) => { await montarTablero(page, { rol: "admin", nombre: "Trafficker" }); });

  test("el área solicitante admite una escrita a mano", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Nueva$/i }).click();

    const area = page.locator("select").filter({ hasText: "Pauta" }).first();
    await expect(area).toBeVisible({ timeout: 20_000 });
    // Directiva ya viene en el catálogo…
    await expect(area.getByRole("option", { name: "Directiva" })).toHaveCount(1);
    // …y además se puede escribir cualquier otra.
    await area.selectOption("__otra__");
    const libre = page.getByPlaceholder(/¿Qué área la pide/i);
    await expect(libre).toBeVisible();
    await libre.fill("Cumplimiento");
    await expect(libre).toHaveValue("Cumplimiento");
  });

  test("E-CARDS se puede elegir como tipo de solicitud", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Nueva$/i }).click();
    const ecards = page.getByText("Tarjeta digital / pieza de correo");
    await expect(ecards).toBeVisible({ timeout: 20_000 });
  });

  test("los correos del solicitante se sugieren al escribir", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Nueva$/i }).click();
    const campo = page.getByPlaceholder(/escribe un nombre o un correo/i);
    await expect(campo).toBeVisible({ timeout: 20_000 });
    await campo.fill("v");
    // Escribir "v" tiene que ofrecer a Verónica.
    await expect(page.getByText("veronica.marquez@ganaplay.com")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Community Manager", () => {
  test("ve sus entregas en Redes Sociales", async ({ page }) => {
    await montarTablero(page, { rol: "cm", nombre: "Community Manager", correo: "fernanda.monrroy@ganaplay.com" });
    await page.goto("/");
    await page.getByText("Redes Sociales", { exact: true }).first().click();
    // El texto de la pestaña llega con un espacio delante (va tras el icono).
    await page.getByText("Entregas (", { exact: false }).first().click();

    // Suyas y CON piezas entregadas: GP9001 y GP9003.
    await expect(page.getByText("GP9001", { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("GP9003", { exact: false }).first()).toBeVisible();
    // GP9004 es suya pero aún no tiene piezas; GP9002 no es suya.
    await expect(page.getByText("GP9004", { exact: false })).toHaveCount(0);
    await expect(page.getByText("GP9002", { exact: false })).toHaveCount(0);
  });
});

test("el enlace del correo abre la solicitud aunque haya que iniciar sesión", async ({ page }) => {
  // Se llega SIN sesión, como quien pulsa el botón del correo de entrega.
  await montarTablero(page, { sesion: false });
  await page.goto("/?solicitud=GP9002");
  // La app pide entrar; la solicitud pedida no se puede perder por el camino.
  await expect(page.getByPlaceholder("nombre.apellido@ganaplay.com")).toBeVisible({ timeout: 30_000 });

  // Se inicia sesión: se deja la sesión que el login habría dejado. Va como
  // script de arranque —y no con evaluate— porque el de "sin sesión" se
  // vuelve a ejecutar en CADA navegación y borraría lo que pusiéramos ahora.
  await page.addInitScript(() => {
    localStorage.setItem("gp_role", "designer");
    localStorage.setItem("gp_userName", "Verónica");
  });
  // Y se vuelve al tablero SIN el parámetro, que es lo que pasaba al entrar.
  await page.goto("/");

  // Se espera al tablero antes de juzgar: con el servidor compilando en frío,
  // la primera carga tarda y si no, la prueba falla por lenta, no por rota.
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 60_000 });

  // Aun así, se abre la ficha de la solicitud del enlace.
  await expect(page.getByText("Nueva línea Directiva").first()).toBeVisible({ timeout: 40_000 });
});
