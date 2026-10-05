/**
 * Que el informe cuente el trabajo que SÍ se hizo.
 *
 * Dos agujeros reales, medidos sobre el tablero de producción en octubre de
 * 2026 y arreglados a la vez:
 *
 *  · Un diseñador tenía 36 solicitudes asignadas y el informe le daba CERO
 *    piezas: entrega por fuera, nunca sube archivos y nadie declaraba la
 *    cuenta. 105 solicitudes publicadas estaban así.
 *  · El trabajo que se pide de viva voz —«en la oficina: 2 solicitudes, 6
 *    piezas»— no existía en ningún sitio.
 *
 * Todo contra el tablero de mentira (`helpers/tablero-falso.ts`): Firestore
 * cortado, sin contraseñas y sin escribir nada. Por eso las cifras se afirman
 * al número.
 */
import { test, expect, Page } from "@playwright/test";
import { montarTablero, SolicitudFalsa } from "./helpers/tablero-falso";

const DESDE = "2026-09-01";
const HASTA = "2026-09-30";

/**
 * Tablero a medida. Totales de septiembre:
 *   · GP9101 cuenta 2 solicitudes y 6 piezas (es un registro de fuera).
 *   · GP9102 está publicada, sin archivos y sin cuenta ⇒ 0 piezas, y es la
 *     que tiene que salir en el aviso de «sin contar».
 *   · GP9103 es de Eliana: NO debe salir en el aviso de Verónica.
 *   ⇒ Solicitudes 4 (2+1+1) · piezas 6
 */
const TABLERO: SolicitudFalsa[] = [
  {
    id: "GP9101", title: "Urgentes pedidos en la oficina", status: "Publicado", priority: "Medio",
    requestKind: "E-CARDS", area: "Directiva", assignedTo: "Verónica",
    requesterName: "Pedido fuera de la plataforma",
    requestDate: "2026-09-10", deliveryDate: "2026-09-10", publicadaEl: "2026-09-10",
    piezas: 0, solicitudesDeclaradas: 2, piezasDeclaradas: 4, redimensionesDeclaradas: 2,
    registroManual: true,
  },
  {
    id: "GP9102", title: "Parrilla entregada por WhatsApp", status: "Publicado", priority: "Medio",
    requestKind: "Línea Gráfica Existente", area: "Pauta", assignedTo: "Verónica",
    requesterName: "Trafficker",
    requestDate: "2026-09-12", deliveryDate: "2026-09-14", publicadaEl: "2026-09-13", piezas: 0,
  },
  {
    id: "GP9103", title: "Trabajo de otra diseñadora", status: "Publicado", priority: "Medio",
    requestKind: "Giveaway", area: "Pauta", assignedTo: "Eliana",
    requesterName: "Trafficker",
    requestDate: "2026-09-15", deliveryDate: "2026-09-16", publicadaEl: "2026-09-16", piezas: 0,
  },
];

async function abrirIndicadores(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 40_000 });
  await page.getByText("Indicadores", { exact: true }).first().click();
  await expect(page.getByRole("heading", { name: /Indicadores/i })).toBeVisible({ timeout: 20_000 });
}

async function acotarASeptiembre(page: Page) {
  await page.getByLabel(/Periodo/i).or(page.locator("select").first()).selectOption("Personalizado");
  const fechas = page.locator('input[type="date"]');
  await fechas.nth(0).fill(DESDE);
  await fechas.nth(1).fill(HASTA);
  await expect(page.getByText(`${DESDE} → ${HASTA}`)).toBeVisible({ timeout: 10_000 });
}

function indicador(page: Page, etiqueta: string) {
  return page.locator("div").filter({ hasText: new RegExp(`^${etiqueta}$`) }).first()
    .locator("xpath=following-sibling::div[1]");
}

test.describe("Conteo de producción", () => {
  test.beforeEach(async ({ page }) => { await montarTablero(page, { solicitudes: TABLERO }); });

  test("un registro de varias solicitudes cuenta por todas, no por una", async ({ page }) => {
    await abrirIndicadores(page);
    await acotarASeptiembre(page);
    // 2 (GP9101) + 1 (GP9102) + 1 (GP9103). Si contara una ficha = una
    // solicitud, saldría 3 y el mes quedaría corto.
    await expect(indicador(page, "Solicitudes")).toHaveText("4");
    await expect(indicador(page, "Total de piezas")).toHaveText("6");
  });

  test("avisa de las entregas propias que están contando cero", async ({ page }) => {
    await abrirIndicadores(page);
    await acotarASeptiembre(page);
    const aviso = page.getByText(/entrega tuya sin piezas contadas|entregas tuyas sin piezas contadas/i);
    await expect(aviso).toBeVisible();
    // Solo la suya: la de Eliana no es asunto de Verónica.
    await expect(page.getByText("GP9102", { exact: true })).toBeVisible();
    await expect(page.getByText("GP9103", { exact: true })).toHaveCount(0);
    // Y la que ya tiene cuenta declarada tampoco molesta.
    await expect(page.getByText("GP9101", { exact: true })).toHaveCount(0);
  });

  test("la cuenta se declara desde el propio aviso, sin abrir la solicitud", async ({ page }) => {
    await abrirIndicadores(page);
    await acotarASeptiembre(page);

    const fila = page.locator("div").filter({ hasText: /^GP9102/ }).last();
    const guardar = fila.getByRole("button", { name: /^Guardar$/ });

    // Sin escribir nada no se puede guardar: una cuenta vacía volvería a dejar
    // la solicitud en cero, que es el problema que esto viene a resolver.
    await expect(guardar).toBeDisabled();

    await fila.getByPlaceholder("Artes").fill("3");
    await expect(guardar).toBeEnabled();
    await fila.getByPlaceholder("Redim.").fill("5");
    await expect(fila.getByPlaceholder("Artes")).toHaveValue("3");
    await expect(fila.getByPlaceholder("Redim.")).toHaveValue("5");

    // Y el atajo del caso más común está a un clic.
    await expect(fila.getByRole("button", { name: /^Fue 1$/ })).toBeVisible();
    // (El guardado contra Firestore lo cubre «el conteo de piezas y
    // redimensiones se guarda», que sí escribe de verdad. Aquí la conexión
    // está cortada a propósito.)
  });

  test("el formulario de trabajo de fuera pide lo mínimo y calcula el total", async ({ page }) => {
    await abrirIndicadores(page);
    await acotarASeptiembre(page);
    await page.getByRole("button", { name: /Registrar trabajo de fuera/i }).click();

    // Acotado al formulario a propósito: el aviso de pendientes también tiene
    // campos numéricos y está detrás, así que buscar "el primer number" de la
    // página cogería el que no es.
    const form = page.getByTestId("registro-manual");
    await expect(form.getByRole("heading", { name: /Registrar trabajo pedido fuera/i })).toBeVisible();

    // Sin decir qué se hizo no se puede registrar.
    const registrar = form.getByRole("button", { name: /^Registrar$/ });
    await expect(registrar).toBeDisabled();

    await form.getByPlaceholder(/Banners urgentes/i).fill("Artes de la oficina");
    await expect(registrar).toBeEnabled();

    // El caso del ejemplo real: 2 solicitudes, 6 piezas.
    const numeros = form.locator('input[type="number"]');
    await numeros.nth(0).fill("2");   // solicitudes
    await numeros.nth(1).fill("4");   // artes
    await numeros.nth(2).fill("2");   // redimensiones
    await expect(form.getByText(/Total:\s*6\s*piezas en 2 solicitudes/i)).toBeVisible();

    // Y si no se hizo ninguna pieza, no hay nada que registrar.
    await numeros.nth(1).fill("0");
    await numeros.nth(2).fill("0");
    await expect(registrar).toBeDisabled();
  });
});
