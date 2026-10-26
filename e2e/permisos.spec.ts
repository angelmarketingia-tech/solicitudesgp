/**
 * Matriz de permisos: qué ve y qué NO ve cada perfil.
 *
 * Es la red de seguridad de todo lo que se acordó sobre separación de roles.
 * Si alguien añade una pestaña o un botón sin pensar en los perfiles, aquí
 * salta. Solo lectura: ninguna prueba de este archivo escribe nada.
 */
import { test, expect, type Page } from "@playwright/test";
import { ficheroSesion, sesionDisponible, type Perfil } from "./helpers/sesion";

/** Lo que cada perfil DEBE y NO DEBE ver en el menú. */
const MATRIZ: Record<Perfil, { ve: string[]; noVe: string[] }> = {
  admin: {
    ve: ["Planeación", "Por estado", "Pendientes", "Historial", "Tabla", "Redes Sociales", "Promocionales", "Contenido Influencers"],
    noVe: ["Centro de Diseño"],
  },
  cm: {
    ve: ["Planeación", "Por estado", "Pendientes", "Historial", "Tabla", "Redes Sociales", "Promocionales", "Contenido Influencers"],
    noVe: ["Centro de Diseño"],
  },
  operator: {
    // Quota: sin Redes Sociales y sin el módulo de influencers.
    ve: ["Planeación", "Por estado", "Pendientes", "Historial", "Tabla", "Promocionales"],
    noVe: ["Redes Sociales", "Centro de Diseño", "Contenido Influencers"],
  },
  administrative: {
    // Dirección de operaciones: ve todo el trabajo de la empresa. Lo único
    // fuera de su alcance es el escritorio personal de cada diseñador (y la
    // eliminación permanente, que comprueba la prueba de más abajo).
    ve: ["Planeación", "Por estado", "Pendientes", "Historial", "Tabla",
         "Redes Sociales", "Promocionales", "CMR", "Contenido Influencers"],
    noVe: ["Centro de Diseño"],
  },
  ejecutivo: {
    // Roberto: sus solicitudes, Promocionales y CMR. Nada de Redes Sociales,
    // influencers ni el panel interno de Diseño.
    ve: ["Planeación", "Por estado", "Pendientes", "Historial", "Tabla", "Promocionales", "CMR"],
    noVe: ["Redes Sociales", "Centro de Diseño", "Contenido Influencers"],
  },
  comercial: {
    // Comercial trabaja sus dos carpetas y las solicitudes que levanta él.
    // "Mis solicitudes" es su tabla: la misma vista del resto, pero filtrada
    // por autoría. No tiene el tablero del equipo ni el historial general.
    ve: ["Mis solicitudes", "Entregas", "Promocionales", "CMR"],
    noVe: ["Planeación", "Por estado", "Pendientes", "Historial", "Redes Sociales", "Centro de Diseño", "Contenido Influencers"],
  },
  designer: {
    ve: ["Planeación", "Por estado", "Centro de Diseño", "Historial", "Tabla", "Redes Sociales", "Promocionales"],
    noVe: ["Pendientes", "Contenido Influencers"],
  },
};

async function abrirTablero(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 25_000 });
}

for (const perfil of Object.keys(MATRIZ) as Perfil[]) {
  test.describe(`Perfil ${perfil}`, () => {
    test.use({ storageState: ficheroSesion(perfil) });

    test(`ve exactamente sus secciones`, async ({ page }) => {
      test.skip(!sesionDisponible(perfil), `Sin sesión de ${perfil}`);
      await abrirTablero(page);
      const menu = page.getByTestId("menu-principal");
      for (const seccion of MATRIZ[perfil].ve) {
        await expect(menu.getByText(seccion, { exact: false }).first(), `${perfil} debería ver "${seccion}"`).toBeVisible();
      }
      for (const seccion of MATRIZ[perfil].noVe) {
        await expect(menu.getByText(seccion, { exact: false }), `${perfil} NO debería ver "${seccion}"`).toHaveCount(0);
      }
    });

    /**
     * La IA se retiró del producto: ni el chat Andromeda ni la calificación
     * automática de piezas. Esta prueba vigilaba que el chat fuera solo de
     * Diseño; ahora vigila que no esté en ningún perfil, para que no vuelva a
     * entrar por descuido con la cuenta de OpenAI desconectada.
     */
    test(`el chat de IA ya no existe en ningún perfil`, async ({ page }) => {
      test.skip(!sesionDisponible(perfil), `Sin sesión de ${perfil}`);
      await abrirTablero(page);
      await expect(page.getByRole("button", { name: /Abrir chat IA Andromeda/i })).toHaveCount(0);
    });

    test(`"Eliminar permanentemente" lo tienen el Trafficker y Diseño (y el Ejecutivo, en lo suyo)`, async ({ page }) => {
      test.setTimeout(120_000);
      test.skip(!sesionDisponible(perfil), `Sin sesión de ${perfil}`);
      // Comercial sí tiene tabla ("Mis solicitudes"), pero solo con lo suyo:
      // si ese perfil aún no ha pedido nada, no hay fila que abrir. Su falta de
      // botón de borrado la cubre el propio código (`puedeEliminar`).
      test.skip(perfil === "comercial", "Comercial solo ve sus propias solicitudes");
      await abrirTablero(page);
      await page.getByText("Tabla", { exact: true }).first().click();
      const fila = page.getByText(/^GP\d{3,}/).first();
      await expect(fila).toBeVisible({ timeout: 60_000 });
      await fila.click();
      // Diseño entró aquí a petición del equipo: son quienes detectan los
      // duplicados y las pruebas, y declinar no los quita de en medio. Se les
      // sigue pidiendo su contraseña al confirmar.
      const borrar = page.getByRole("button", { name: /Eliminar permanentemente/i });
      if (perfil === "admin" || perfil === "designer") await expect(borrar).toBeVisible();
      // El Ejecutivo Comercial lo ve solo en las que creó él: depende de cuál
      // salga primera en la tabla. Lo cubre cambios-tablero.spec.ts con datos fijos.
      else if (perfil !== "ejecutivo") await expect(borrar).toHaveCount(0);
    });

    test(`todos pueden crear una solicitud`, async ({ page }) => {
      test.skip(!sesionDisponible(perfil), `Sin sesión de ${perfil}`);
      await abrirTablero(page);
      await page.getByRole("button", { name: /^Nueva$/i }).click();
      await expect(page.getByRole("heading", { name: /Nueva solicitud de diseño/i })).toBeVisible();
      // Y lo único obligatorio sigue siendo el nombre.
      await expect(page.getByText("Título del proyecto *")).toBeVisible();
    });
  });
}

test.describe("Comercial: solicitudes propias, con el mismo formulario", () => {
  test.use({ storageState: ficheroSesion("comercial") });

  test("su tabla dice que solo están las suyas", async ({ page }) => {
    test.skip(!sesionDisponible("comercial"), "Sin sesión de comercial");
    await abrirTablero(page);
    await page.getByText("Mis solicitudes", { exact: true }).click();
    await expect(page.getByText(/las solicitudes que tú levantaste/i)).toBeVisible();
  });

  test("su solicitud nace marcada como CMR", async ({ page }) => {
    test.skip(!sesionDisponible("comercial"), "Sin sesión de comercial");
    await abrirTablero(page);
    await page.getByRole("button", { name: /^Nueva$/i }).click();
    await expect(page.getByRole("heading", { name: /Nueva solicitud de diseño/i })).toBeVisible();
    // Es el formulario de siempre; lo único distinto es el área preseleccionada,
    // que además sigue siendo editable.
    const area = page
      .locator(".form-group", { has: page.getByText("Área solicitante", { exact: true }) })
      .locator("select");
    await expect(area).toHaveValue("CMR");
  });

  test("tiene su historial de entregas", async ({ page }) => {
    test.skip(!sesionDisponible("comercial"), "Sin sesión de comercial");
    await abrirTablero(page);
    await page.getByTestId("menu-principal").getByText("Entregas", { exact: false }).click();
    await expect(page.getByRole("heading", { name: /Mis entregas/i })).toBeVisible();
  });

  test("su solicitud no trae ningún correo preseleccionado", async ({ page }) => {
    test.skip(!sesionDisponible("comercial"), "Sin sesión de comercial");
    await abrirTablero(page);
    await page.getByRole("button", { name: /^Nueva$/i }).click();
    await expect(page.getByRole("heading", { name: /Nueva solicitud de diseño/i })).toBeVisible();
    // Ni el suyo ni el del puesto de CM: la lista nace vacía y lo dice.
    await expect(page.getByText(/agrega a quien deba recibir la entrega/i)).toBeVisible();
    await expect(page.getByText("comercial@ganaplay.com")).toHaveCount(0);
    await expect(page.getByText("community.manager@ganaplay.com")).toHaveCount(0);
  });
});

test.describe("El trabajo del Trafficker no se ve desde otros perfiles", () => {
  const ids = async (browser: Parameters<Parameters<typeof test>[1]>[0]["browser"], perfil: Perfil): Promise<string[]> => {
    const ctx = await browser.newContext({ storageState: ficheroSesion(perfil) });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByText("Tabla", { exact: true }).first().click();
    await expect(page.getByText(/^GP\d{3,}/).first()).toBeVisible({ timeout: 60_000 });
    const textos = await page.getByText(/^GP\d{3,}/).allTextContents();
    await ctx.close();
    return textos.map(t => (t.match(/GP\d+/) || [""])[0]).filter(Boolean);
  };

  // Operador (Juan) y Ejecutivo Comercial (Roberto) comparten la misma regla:
  // ven su parte del tablero, nunca lo que levanta el Trafficker.
  for (const perfil of ["operator", "ejecutivo"] as const) {
    test(`${perfil} ve menos solicitudes que el Trafficker, y todas las suyas están en el tablero completo`, async ({ browser }) => {
      // Carga el tablero ENTERO dos veces, con dos sesiones distintas: con el
      // minuto por defecto se agotaba el tiempo cuando la suite va en paralelo.
      test.setTimeout(180_000);
      test.skip(!sesionDisponible(perfil) || !sesionDisponible("admin"), "Faltan contraseñas");
      const todas = await ids(browser, "admin");
      const suyas = await ids(browser, perfil);
      console.log(`Trafficker ve ${todas.length}; ${perfil} ve ${suyas.length}`);
      expect(suyas.length).toBeGreaterThan(0);
      expect(suyas.length).toBeLessThan(todas.length);
      for (const id of suyas) expect(todas).toContain(id);
    });
  }
});
