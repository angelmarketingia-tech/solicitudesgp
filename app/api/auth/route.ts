import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Validación de acceso del lado del servidor.
 *
 * Las contraseñas NO viven en el bundle del navegador NI como defaults
 * en el código fuente (que es público en GitHub). Se exigen como variables
 * de entorno; si faltan, el endpoint devuelve 500 con mensaje claro.
 *
 * Variables OBLIGATORIAS:
 *  - AUTH_PASS_TRAFFICKER  → acceso del Trafficker (rol admin)
 *  - AUTH_PASS_GENERAL     → Community Manager, Operadores y DIRECTIVOS
 *
 * Variable RECOMENDADA (si falta, Diseño usa AUTH_PASS_GENERAL):
 *  - AUTH_PASS_DESIGNER    → equipo de Diseño, separado del resto
 *
 * Configuradas en Vercel (Production) y en .env.local (Development).
 *
 * Roles:
 *  - admin           → Trafficker. Acceso total + eliminación permanente.
 *  - cm              → Community Manager. Crea solicitudes, ve calendario.
 *  - operator        → Operadores (Quota, Juan). Mismos permisos
 *                      que CM pero cada uno con su nombre propio.
 *  - administrative  → DIRECTIVOS (Andres, Sebastian, Roberto). Mismos
 *                      permisos que CM/operator, distinto perfil para
 *                      auditoría. Label en UI: "DIRECTIVOS".
 *  - designer        → Diseñador. Centro de Diseño, entregables, IA Andromeda.
 *
 * Ninguno de los roles "internos no-admin" (cm, operator, administrative)
 * accede al panel de diseñadores ni a la eliminación permanente.
 */

const PASS_TRAFFICKER = process.env.AUTH_PASS_TRAFFICKER || "";
const PASS_GENERAL = process.env.AUTH_PASS_GENERAL || "";
// Los diseñadores tienen contraseña PROPIA. Antes compartían AUTH_PASS_GENERAL
// con CM/operadores/directivos, así que cualquiera de ellos podía entrar como
// diseñador (Centro de Diseño, IA Andromeda, comentarios internos, borrar
// entregables) solo eligiendo "Diseñador" en el menú del login.
//
// MIENTRAS AUTH_PASS_DESIGNER no exista en Vercel, se acepta AUTH_PASS_GENERAL
// para no dejar al equipo de Diseño fuera de producción. En cuanto se defina la
// variable, la separación entra en vigor sola: no hay que tocar código.
const PASS_DESIGNER = process.env.AUTH_PASS_DESIGNER || "";

/** ¿Está ya separada la contraseña de Diseño? */
export const designerPasswordIsolated = Boolean(PASS_DESIGNER);

/** Contraseña que corresponde a cada rol. */
function expectedPasswordFor(role: Role): string {
  if (role === "admin") return PASS_TRAFFICKER;
  if (role === "designer") {
    if (!PASS_DESIGNER) {
      console.warn(
        "[auth] AUTH_PASS_DESIGNER no está configurada: los diseñadores siguen " +
        "usando la contraseña general y cualquiera que la conozca puede entrar " +
        "como diseñador. Defínela en Vercel para cerrar el acceso."
      );
      return PASS_GENERAL;
    }
    return PASS_DESIGNER;
  }
  return PASS_GENERAL;
}

const DESIGNER_USERS = ["Juan David", "Eliana", "Verónica", "Caleb"];
const OPERATOR_USERS = ["Quota", "Juan"];
const ADMINISTRATIVE_USERS = ["Andres", "Sebastian", "Roberto"];

type Role = "admin" | "cm" | "designer" | "operator" | "administrative";

// ─── Directorio corporativo: correo → { rol, nombre } ────────────────────────
// Cada persona entra con SU correo corporativo. La contraseña sigue siendo
// compartida por tipo de acceso (Trafficker vs. general), así agregar o quitar
// a alguien es solo editar este directorio — sin rotar contraseñas.
//
// Se puede sobrescribir/ampliar SIN desplegar código con la variable de entorno
// AUTH_USERS (JSON): [{"email":"...","role":"designer","name":"..."}]
const BUILTIN_DIRECTORY: { email: string; role: Role; name: string }[] = [
  { email: "angel.vaca@ganaplay.com",       role: "admin",          name: "Trafficker" },
  { email: "fernanda.monrroy@ganaplay.com", role: "cm",             name: "Community Manager" },
  { email: "david.gutierrez@ganaplay.com",  role: "designer",       name: "Juan David" },
  { email: "eliana.izquierdo@ganaplay.com", role: "designer",       name: "Eliana" },
  { email: "veronica.marquez@ganaplay.com", role: "designer",       name: "Verónica" },
  { email: "veronica@ganaplay.com",         role: "designer",       name: "Verónica" },
  { email: "caleb.guevara@ganaplay.com",    role: "designer",       name: "Caleb" },
  { email: "roberto.andrade@ganaplay.com",  role: "administrative", name: "Roberto" },
  { email: "juan.gutierrez@ganaplay.com",   role: "operator",       name: "Juan" },
];

function buildDirectory(): Map<string, { role: Role; name: string }> {
  const map = new Map<string, { role: Role; name: string }>();
  for (const u of BUILTIN_DIRECTORY) map.set(u.email.toLowerCase(), { role: u.role, name: u.name });
  // Override/extensión por variable de entorno (opcional).
  try {
    const raw = process.env.AUTH_USERS;
    if (raw) {
      const arr = JSON.parse(raw) as { email?: string; role?: Role; name?: string }[];
      for (const u of arr) {
        if (u.email && u.role && u.name) map.set(u.email.toLowerCase().trim(), { role: u.role, name: u.name });
      }
    }
  } catch (e) {
    console.error("[auth] AUTH_USERS mal formado (JSON inválido):", e);
  }
  return map;
}

const DIRECTORY = buildDirectory();

type AuthBody = {
  // Nuevo: acceso corporativo por correo.
  email?: string;
  // Compatibilidad: acceso por rol (método anterior, aún soportado).
  role?: Role;
  password?: string;
  designerName?: string;
  operatorName?: string;
  administrativeName?: string;
};

export async function POST(req: Request) {
  try {
    // Rate limit: 15 intentos por IP por minuto. Suficiente para uso normal
    // (incluso si alguien teclea mal), bloquea brute force con 1 IP.
    const ip = getClientIp(req);
    const rl = checkRateLimit(`auth:${ip}`, { max: 15, windowMs: 60_000 });
    if (rl.limited) {
      return NextResponse.json(
        {
          ok: false,
          error: `Demasiados intentos. Espera ${Math.ceil(rl.resetInMs / 1000)}s antes de volver a intentar.`,
        },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetInMs / 1000)) } }
      );
    }

    // Fallar fast si las passwords no están configuradas en Vercel/.env.local.
    // Antes había defaults en el código fuente público → riesgo eliminado.
    if (!PASS_TRAFFICKER || !PASS_GENERAL) {
      console.error("[auth] Faltan AUTH_PASS_TRAFFICKER o AUTH_PASS_GENERAL en el entorno.");
      return NextResponse.json(
        { ok: false, error: "Servidor no configurado. Contacta al administrador." },
        { status: 500 }
      );
    }

    const { email, role, password, designerName, operatorName, administrativeName }: AuthBody = await req.json();

    // ── Acceso corporativo por correo (método preferido) ──
    if (email) {
      if (!password) {
        return NextResponse.json({ ok: false, error: "Ingresa tu contraseña." }, { status: 400 });
      }
      const entry = DIRECTORY.get(String(email).toLowerCase().trim());
      if (!entry) {
        // Mensaje genérico: no revelamos si el correo existe o no.
        return NextResponse.json({ ok: false, error: "Correo o contraseña incorrectos." }, { status: 401 });
      }
      const expected = expectedPasswordFor(entry.role);
      if (!expected) {
        console.error(`[auth] Falta la contraseña configurada para el rol "${entry.role}".`);
        return NextResponse.json(
          { ok: false, error: "Ese perfil no tiene contraseña configurada. Contacta al administrador." },
          { status: 500 }
        );
      }
      if (password !== expected) {
        return NextResponse.json({ ok: false, error: "Correo o contraseña incorrectos." }, { status: 401 });
      }
      return NextResponse.json({ ok: true, role: entry.role, userName: entry.name });
    }

    if (!role || !password) {
      return NextResponse.json(
        { ok: false, error: "Faltan datos de acceso." },
        { status: 400 }
      );
    }

    if (role === "admin") {
      if (password !== PASS_TRAFFICKER) {
        return NextResponse.json(
          { ok: false, error: "Contraseña incorrecta." },
          { status: 401 }
        );
      }
      return NextResponse.json({ ok: true, role, userName: "Trafficker" });
    }

    if (role === "cm") {
      if (password !== PASS_GENERAL) {
        return NextResponse.json(
          { ok: false, error: "Contraseña incorrecta." },
          { status: 401 }
        );
      }
      return NextResponse.json({
        ok: true,
        role,
        userName: "Community Manager",
      });
    }

    if (role === "operator") {
      if (!operatorName || !OPERATOR_USERS.includes(operatorName)) {
        return NextResponse.json(
          { ok: false, error: "Selecciona un operador válido." },
          { status: 400 }
        );
      }
      if (password !== PASS_GENERAL) {
        return NextResponse.json(
          { ok: false, error: "Contraseña incorrecta." },
          { status: 401 }
        );
      }
      return NextResponse.json({ ok: true, role, userName: operatorName });
    }

    if (role === "administrative") {
      if (!administrativeName || !ADMINISTRATIVE_USERS.includes(administrativeName)) {
        return NextResponse.json(
          { ok: false, error: "Selecciona un administrativo válido." },
          { status: 400 }
        );
      }
      if (password !== PASS_GENERAL) {
        return NextResponse.json(
          { ok: false, error: "Contraseña incorrecta." },
          { status: 401 }
        );
      }
      return NextResponse.json({ ok: true, role, userName: administrativeName });
    }

    if (role === "designer") {
      if (!designerName || !DESIGNER_USERS.includes(designerName)) {
        return NextResponse.json(
          { ok: false, error: "Selecciona un diseñador válido." },
          { status: 400 }
        );
      }
      if (password !== expectedPasswordFor("designer")) {
        return NextResponse.json(
          { ok: false, error: "Contraseña incorrecta." },
          { status: 401 }
        );
      }
      return NextResponse.json({ ok: true, role, userName: designerName });
    }

    return NextResponse.json(
      { ok: false, error: "Rol no válido." },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Error procesando el acceso." },
      { status: 500 }
    );
  }
}
