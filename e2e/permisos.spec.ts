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

test.describe("Quota no ve el trabajo del Trafficker", () => {
  test("ve menos solicitudes que el Trafficker, y ninguna suya", async ({ browser }) => {
    test.skip(!sesionDisponible("operator") || !sesionDisponible("admin"), "Faltan contraseñas");

    const ids = async (perfil: Perfil): Promise<string[]> => {
      const ctx = await browser.newContext({ storageState: ficheroSesion(perfil) });
      const page = await ctx.newPage();
      await page.goto("/");
      await page.getByText("Tabla", { exact: true }).first().click();
      await expect(page.getByText(/^GP\d{3,}/).first()).toBeVisible({ timeout: 25_000 });
      const textos = await page.getByText(/^GP\d{3,}/).allTextContents();
      await ctx.close();
      return textos.map(t => (t.match(/GP\d+/) || [""])[0]).filter(Boolean);
    };

    const [todas, deQuota] = [await ids("admin"), await ids("operator")];
    console.log(`Trafficker ve ${todas.length}; Quota ve ${deQuota.length}`);
    expect(deQuota.length).toBeGreaterThan(0);
    expect(deQuota.length).toBeLessThan(todas.length);
    for (const id of deQuota) expect(todas).toContain(id);
  });
});
