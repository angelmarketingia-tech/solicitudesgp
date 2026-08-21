/**
 * Base de la suite E2E: credenciales y sesiones reutilizables.
 *
 * POR QUÉ EXISTE: cada prueba iniciaba sesión por su cuenta y `/api/auth`
 * limita a 15 intentos por minuto y por IP. Con ~50 pruebas, la suite se
 * bloqueaba a sí misma y fallaba con "Demasiados intentos" en sitios al azar,
 * que parecían errores de la app pero no lo eran.
 *
 * Ahora `auth.setup.ts` entra UNA vez por perfil y guarda la sesión; las
 * pruebas arrancan ya dentro. Solo `acceso.spec.ts` prueba el login de verdad.
 */
import fs from "fs";
import path from "path";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export type Perfil = "admin" | "cm" | "operator" | "administrative" | "designer" | "comercial" | "ejecutivo";

/** Contraseñas: SIEMPRE del entorno, nunca escritas en el código. */
export const CREDENCIALES = {
  admin: process.env.E2E_ADMIN_PASS || "",
  general: process.env.E2E_GENERAL_PASS || "",
  designer: process.env.E2E_DESIGNER_PASS || process.env.E2E_GENERAL_PASS || "",
};

/** Contraseña que corresponde a cada perfil. */
export function passwordDe(perfil: Perfil): string {
  if (perfil === "admin") return CREDENCIALES.admin;
  if (perfil === "designer") return CREDENCIALES.designer;
  return CREDENCIALES.general;
}

/**
 * Tarjeta del login, nombre a elegir y correo corporativo de cada perfil.
 *
 * Roberto dejó de ser DIRECTIVO: ahora es Ejecutivo Comercial, con su propia
 * tarjeta y sin acceso a lo que levanta el Trafficker.
 */
export const PERFILES: Record<Perfil, { tarjeta: string; nombre: string | null; correo: string }> = {
  admin: { tarjeta: "Trafficker", nombre: null, correo: "angel.vaca@ganaplay.com" },
  cm: { tarjeta: "Community Manager", nombre: null, correo: "fernanda.monrroy@ganaplay.com" },
  operator: { tarjeta: "Operador", nombre: "Juan", correo: "juan.gutierrez@ganaplay.com" },
  administrative: { tarjeta: "DIRECTIVOS", nombre: "Sebastian", correo: "sebastian.calderon@ganaplay.com" },
  designer: { tarjeta: "Diseñador", nombre: "Juan David", correo: "david.gutierrez@ganaplay.com" },
  comercial: { tarjeta: "Comercial", nombre: null, correo: "comercial@ganaplay.com" },
  ejecutivo: { tarjeta: "Ejecutivo Comercial", nombre: "Roberto", correo: "roberto.andrade@ganaplay.com" },
};

/** Fichero donde se guarda la sesión ya iniciada de cada perfil. */
export function ficheroSesion(perfil: Perfil): string {
  return path.join(__dirname, "..", ".auth", `${perfil}.json`);
}

/** ¿Hay contraseña para este perfil? Si no, la prueba se salta. */
export function faltaPassword(perfil: Perfil): boolean {
  return !passwordDe(perfil);
}

/** Deja la pantalla de acceso en blanco, sin sesión previa. */
async function abrirAcceso(page: Page) {
  await page.goto("/");
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* */ } });
  await page.reload();
}

/** Marca "Recordar" para que la sesión quede en localStorage (lo que guarda Playwright). */
async function marcarRecordar(page: Page, recordar?: boolean) {
  if (recordar === false) return;
  const casilla = page.getByRole("checkbox").first();
  if (await casilla.isVisible().catch(() => false) && !(await casilla.isChecked())) await casilla.check();
}

/**
 * Inicia sesión por el ACCESO POR ROL, que ahora vive tras el enlace discreto
 * "Acceso por rol" de la pantalla principal.
 */
export async function entrar(page: Page, perfil: Perfil, opts: { recordar?: boolean; password?: string } = {}) {
  const { tarjeta, nombre } = PERFILES[perfil];
  const pass = opts.password ?? passwordDe(perfil);

  await abrirAcceso(page);
  await page.getByRole("button", { name: /^Acceso por rol$/i }).click({ timeout: 15_000 });

  await page.getByText(tarjeta, { exact: true }).click({ timeout: 15_000 });
  if (nombre) await page.getByRole("combobox").selectOption(nombre, { timeout: 15_000 });
  await marcarRecordar(page, opts.recordar);
  await page.getByPlaceholder("••••••••••••").fill(pass);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
}

/** Inicia sesión por el ACCESO PRINCIPAL: correo corporativo + contraseña. */
export async function entrarPorCorreo(
  page: Page,
  perfil: Perfil,
  opts: { recordar?: boolean; password?: string; correo?: string } = {},
) {
  const correo = opts.correo ?? PERFILES[perfil].correo;
  const pass = opts.password ?? passwordDe(perfil);

  await abrirAcceso(page);
  await page.getByPlaceholder("nombre.apellido@ganaplay.com").fill(correo);
  await page.getByPlaceholder("••••••••••••").fill(pass);
  await marcarRecordar(page, opts.recordar);
  await page.getByRole("button", { name: /Acceder al sistema/i }).click();
}

/** Entra y espera al tablero. */
export async function entrarYEsperar(page: Page, perfil: Perfil) {
  await entrar(page, perfil);
  await expect(page.getByRole("heading", { name: /Solicitudes de diseño/i })).toBeVisible({ timeout: 25_000 });
}

/** Abre una pestaña del menú lateral. */
export async function irA(page: Page, pestana: string) {
  await page.getByText(pestana, { exact: true }).first().click();
}

/**
 * ¿Se pudo iniciar sesión con este perfil? `auth.setup.ts` deja el fichero
 * vacío cuando no. Las pruebas lo consultan para saltarse solas en vez de
 * fallar con una pantalla de login.
 */
export function sesionDisponible(perfil: Perfil): boolean {
  try {
    const datos = JSON.parse(fs.readFileSync(ficheroSesion(perfil), "utf8")) as {
      origins?: { localStorage?: { name: string }[] }[];
    };
    return (datos.origins || []).some(o => (o.localStorage || []).some(x => x.name === "gp_role"));
  } catch {
    return false;
  }
}
