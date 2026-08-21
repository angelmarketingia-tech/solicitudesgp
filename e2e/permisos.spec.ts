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
    ve: ["Planeación", "Por estado", "Pendientes", "Historial", "Tabla", "Redes Sociales", "Promocionales"],
    noVe: ["Centro de Diseño", "Contenido Influencers"],
  },
  ejecutivo: {
    // Roberto: sus solicitudes, Promocionales y CMR. Nada de Redes Sociales,
    // influencers ni el panel interno de Diseño.
    ve: ["Planeación", "Por estado", "Pendientes", "Historial", "Tabla", "Promocionales", "CMR"],
    noVe: ["Redes Sociales", "Centro de Diseño", "Contenido Influencers"],
  },
  comercial: {
    // Comercial solo trabaja con sus dos carpetas.
    ve: ["Promocionales", "CMR"],
    noVe: ["Planeación", "Por estado", "Pendientes", "Historial", "Tabla", "Redes Sociales", "Centro de Diseño", "Contenido Influencers"],
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

    test(`la IA Andromeda solo la tiene Diseño`, async ({ page }) => {
      test.skip(!sesionDisponible(perfil), `Sin sesión de ${perfil}`);
      await abrirTablero(page);
      const boton = page.getByRole("button", { name: /Abrir chat IA Andromeda/i });
      if (perfil === "designer") await expect(boton).toBeVisible();
      else await expect(boton).toHaveCount(0);
    });

    test(`"Eliminar permanentemente" solo lo tiene el Trafficker`, async ({ page }) => {
      test.setTimeout(120_000);
      test.skip(!sesionDisponible(perfil), `Sin sesión de ${perfil}`);
      test.skip(perfil === "comercial", "Comercial no tiene tablero de solicitudes");
      await abrirTablero(page);
      await page.getByText("Tabla", { exact: true }).first().click();
      const fila = page.getByText(/^GP\d{3,}/).first();
      await expect(fila).toBeVisible({ timeout: 60_000 });
      await fila.click();
      const borrar = page.getByRole("button", { name: /Eliminar permanentemente/i });
      if (perfil === "admin") await expect(borrar).toBeVisible();
      else await expect(borrar).toHaveCount(0);
    });

    test(`todos pueden crear una solicitud`, async ({ page }) => {
      test.skip(!sesionDisponible(perfil), `Sin sesión de ${perfil}`);
      test.skip(perfil === "comercial", "Comercial no crea solicitudes de diseño");
      await abrirTablero(page);
      await page.getByRole("button", { name: /^Nueva$/i }).click();
      await expect(page.getByRole("heading", { name: /Nueva solicitud de diseño/i })).toBeVisible();
      // Y lo único obligatorio sigue siendo el nombre.
      await expect(page.getByText("Título del proyecto *")).toBeVisible();
    });
  });
}

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
