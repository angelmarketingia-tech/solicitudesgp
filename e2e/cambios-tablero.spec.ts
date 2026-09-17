/**
 * Los cambios pedidos por el equipo de Diseño (septiembre de 2026).
 *
 * Dos grupos, por un motivo práctico:
 *
 *  · Lo que ESCRIBE (asignar, publicar, contar, eliminar) se prueba contra el
 *    Firestore real con una solicitud de usar y tirar marcada [E2E]. Es la
 *    única forma de comprobar que el cambio se guarda de verdad; la última
 *    prueba la elimina, y de paso eso mismo comprueba el botón de eliminar.
 *  · Lo que solo MIRA (filtros, artes de un enlace) usa el tablero de mentira
 *    de `helpers/tablero-falso.ts`: sin contraseñas y sin tocar nada.
 */
import { test, expect, Page } from "@playwright/test";
import { ficheroSesion, sesionDisponible, passwordDe } from "./helpers/sesion";
import { borrarSolicitud, leerSolicitud, MARCADOR } from "./helpers/datos";
import { montarTablero, SOLICITUDES } from "./helpers/tablero-falso";

// ────────────────────────────────────────────────────────────────────────────
// Grupo 1 · Flujos que escriben, con la sesión de un diseñador
// ────────────────────────────────────────────────────────────────────────────
test.describe("Ciclo de una solicitud, como diseñador", () => {
  test.use({ storageState: ficheroSesion("designer") });
  test.describe.configure({ mode: "serial" });   // comparten la misma solicitud
  test.setTimeout(180_000);

  let creada = "";

  test.afterAll(async () => {
    if (creada) await borrarSolicitud(creada);   // por si una prueba se cortó
  });

  /** Abre la ficha de una solicitud por su número. */
  async function abrirFicha(page: Page, id: string) {
    await page.goto("/");
    await page.getByText("Tabla", { exact: true }).first().click();
    await page.getByText(id, { exact: false }).first().click();
    await expect(page.getByText(id, { exact: false }).first()).toBeVisible();
  }

  test("se crea la solicitud de prueba", async ({ page }) => {
    test.skip(!sesionDisponible("designer"), "Sin sesión de diseñador");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 40_000 });
    await page.getByRole("button", { name: /^Nueva$/i }).click();
    await page.getByPlaceholder("Nombre del requerimiento...").fill(`${MARCADOR} ciclo ${Date.now()}`);
    await page.getByRole("button", { name: /Crear y asignar solicitud/i }).click();

    const aviso = page.getByText(/creada correctamente/i);
    await expect(aviso).toBeVisible({ timeout: 60_000 });
    creada = ((await aviso.textContent()) || "").match(/GP\d+/)?.[0] || "";
    expect(creada, "debe anunciar el número").toBeTruthy();
  });

  test("ponerla En Proceso la asigna sola, sin pulsar «Asignarme»", async ({ page }) => {
    test.skip(!creada, "Sin solicitud de prueba");
    await abrirFicha(page, creada);

    // El selector de estado del diseñador.
    const estado = page.locator("select").filter({ hasText: "Pendiente" }).first();
    await estado.selectOption("En Proceso");

    // El encargado pasa a ser quien la movió, sin ningún otro clic.
    const encargado = page.locator("select").filter({ hasText: "Sin encargado" }).first();
    await expect(encargado).toHaveValue("Juan David", { timeout: 30_000 });
  });

  test("se puede pasar a otro diseñador", async ({ page }) => {
    test.skip(!creada, "Sin solicitud de prueba");
    await abrirFicha(page, creada);
    const encargado = page.locator("select").filter({ hasText: "Sin encargado" }).first();
    await encargado.selectOption("Eliana");
    await expect(page.getByText(/es ahora de Eliana/i)).toBeVisible({ timeout: 30_000 });
    // Y quedó guardado: se vuelve a entrar desde cero (recargar cierra la ficha).
    await abrirFicha(page, creada);
    await expect(page.locator("select").filter({ hasText: "Sin encargado" }).first())
      .toHaveValue("Eliana", { timeout: 30_000 });
  });

  test("publicarla se la atribuye a quien publica, no a quien la tenía", async ({ page }) => {
    test.skip(!creada, "Sin solicitud de prueba");
    await abrirFicha(page, creada);
    // La tiene Eliana; la publica Juan David.
    const estado = page.locator("select").filter({ hasText: "En Proceso" }).first();
    await estado.selectOption("Publicado");

    const encargado = page.locator("select").filter({ hasText: "Sin encargado" }).first();
    await expect(encargado).toHaveValue("Juan David", { timeout: 30_000 });
    await abrirFicha(page, creada);
    await expect(page.locator("select").filter({ hasText: "Sin encargado" }).first())
      .toHaveValue("Juan David", { timeout: 30_000 });
  });

  test("el conteo de piezas y redimensiones se guarda", async ({ page }) => {
    test.skip(!creada, "Sin solicitud de prueba");
    await abrirFicha(page, creada);

    const artes = page.getByRole("spinbutton").first();
    const redim = page.getByRole("spinbutton").nth(1);
    await artes.fill("4");
    await redim.fill("12");
    await page.getByRole("button", { name: /Guardar conteo/i }).click();
    await expect(page.getByText(/Conteo guardado/i)).toBeVisible({ timeout: 30_000 });

    // 4 + 12 = 16 piezas, y sobrevive a recargar.
    await expect(page.getByText(/Total:\s*16/)).toBeVisible({ timeout: 20_000 });
    await abrirFicha(page, creada);
    await expect(page.getByRole("spinbutton").first()).toHaveValue("4", { timeout: 30_000 });
    await expect(page.getByRole("spinbutton").nth(1)).toHaveValue("12");
  });

  test("un diseñador puede eliminarla con SU contraseña", async ({ page }) => {
    test.skip(!creada, "Sin solicitud de prueba");
    test.skip(!passwordDe("designer"), "Sin contraseña de diseñador");
    await abrirFicha(page, creada);

    await page.getByRole("button", { name: /Eliminar permanentemente/i }).first().click();
    const dialogo = page.locator(".card").filter({ hasText: "Eliminar permanentemente" }).last();
    await expect(dialogo).toBeVisible();

    // Con una contraseña equivocada NO borra.
    await dialogo.locator('input[type="password"]').fill("no-es-la-clave");
    await dialogo.getByRole("button", { name: /^Eliminar permanentemente$/i }).click();
    await expect(page.getByText(/No se pudo eliminar|Contraseña incorrecta/i)).toBeVisible({ timeout: 30_000 });

    // Con la suya, sí.
    await dialogo.locator('input[type="password"]').fill(passwordDe("designer"));
    await dialogo.getByRole("button", { name: /^Eliminar permanentemente$/i }).click();
    await expect(page.getByText(/eliminada permanentemente/i)).toBeVisible({ timeout: 60_000 });

    // Y comprobarlo DE VERDAD en la base, no por el aviso de pantalla. Ese
    // agujero dejó 34 solicitudes "eliminadas" vivas en el tablero, contando
    // en los indicadores: el aviso salía igual y nadie miraba el documento.
    await expect.poll(async () => await leerSolicitud(creada), {
      message: "la solicitud debe desaparecer de Firestore, no solo de la pantalla",
      timeout: 30_000,
    }).toBeNull();
    creada = "";   // ya no hay que limpiarla
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Grupo 2 · Lo que solo se mira, sobre el tablero de mentira
// ────────────────────────────────────────────────────────────────────────────
test.describe("Historial con filtros detallados", () => {
  test.beforeEach(async ({ page }) => {
    await montarTablero(page, { rol: "admin", nombre: "Trafficker" });
    await page.goto("/");
    await page.getByText("Historial", { exact: true }).first().click();
  });

  test("filtra por área, diseñador, prioridad y fechas", async ({ page }) => {
    const resultados = page.getByText(/\d+ resultados?$/);
    await expect(resultados).toHaveText("6 resultados", { timeout: 30_000 });

    // Por área: Pauta tiene GP9001 y GP9003.
    await page.locator("select").filter({ hasText: "Todas las áreas" }).selectOption("Pauta");
    await expect(resultados).toHaveText("2 resultados");

    // Sumando diseñador: de esas dos, una es de Eliana.
    await page.locator("select").filter({ hasText: "Todos los diseñadores" }).selectOption("Eliana");
    await expect(resultados).toHaveText("1 resultado");

    await page.getByRole("button", { name: /Limpiar filtros/i }).click();
    await expect(resultados).toHaveText("6 resultados");

    // Por prioridad: solo GP9002 es Alto.
    await page.locator("select").filter({ hasText: "Toda prioridad" }).selectOption("Alto");
    await expect(resultados).toHaveText("1 resultado");
    await page.getByRole("button", { name: /Limpiar filtros/i }).click();

    // Por fechas: agosto deja solo GP9005.
    const fechas = page.locator('input[type="date"]');
    await fechas.nth(0).fill("2026-08-01");
    await fechas.nth(1).fill("2026-08-31");
    await expect(resultados).toHaveText("1 resultado");
  });

  test("la búsqueda encuentra por solicitante y por diseñador", async ({ page }) => {
    const resultados = page.getByText(/\d+ resultados?$/);
    const buscador = page.getByPlaceholder(/Buscar por ID, título/i);

    await buscador.fill("Eliana");           // por encargado
    await expect(resultados).toHaveText("1 resultado", { timeout: 20_000 });

    await buscador.fill("Roberto");          // por quien la pidió
    await expect(resultados).toHaveText("1 resultado");

    await buscador.fill("GP9002");           // por número, como siempre
    await expect(resultados).toHaveText("1 resultado");
  });
});

test("los artes se ven al abrir una solicitud desde el enlace", async ({ page }) => {
  // Igual que en la vida real: la copia local llega sin artes y los trae el
  // servidor un momento después.
  await montarTablero(page, { artesSoloDelServidor: true });
  await page.goto("/?solicitud=GP9001");

  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 40_000 });
  // GP9001 tiene 2 piezas: tienen que acabar viéndose, no quedarse en blanco.
  const piezas = page.locator('img[alt*="pieza"], img[src^="data:image/gif"]');
  await expect(piezas.first()).toBeVisible({ timeout: 60_000 });
  expect(await piezas.count()).toBeGreaterThanOrEqual(1);
});

test("el conteo declarado manda sobre los archivos en los Indicadores", async ({ page }) => {
  // GP9001 tiene 2 archivos; si declara 5 artes y 10 redimensiones, el informe
  // tiene que contar 15 por esa solicitud, no 2.
  const conConteo = SOLICITUDES.map(s => s.id === "GP9001"
    ? { ...s, piezasDeclaradas: 5, redimensionesDeclaradas: 10 }
    : s);
  await montarTablero(page, { solicitudes: conConteo });
  await page.goto("/");
  await page.getByText("Indicadores", { exact: true }).first().click();

  await page.locator("select").first().selectOption("Personalizado");
  const fechas = page.locator('input[type="date"]');
  await fechas.nth(0).fill("2026-09-01");
  await fechas.nth(1).fill("2026-09-30");

  // Antes: 6 piezas. Ahora: 4 (las otras) + 15 = 19.
  const total = page.locator("div").filter({ hasText: /^Total de piezas$/ }).first()
    .locator("xpath=following-sibling::div[1]");
  await expect(total).toHaveText("19", { timeout: 30_000 });
});
