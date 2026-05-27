import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Validación de acceso del lado del servidor.
 *
 * Las contraseñas ya NO viven en el bundle del navegador. Se leen de variables
 * de entorno y, si no están configuradas, se usan valores por defecto para no
 * romper el sistema (recomendado sobreescribirlos en .env.local).
 *
 * Variables soportadas:
 *  - AUTH_PASS_TRAFFICKER  → acceso del Trafficker (rol admin)
 *  - AUTH_PASS_GENERAL     → acceso de Community Manager, Operadores y Diseñadores
 *
 * Roles:
 *  - admin     → Trafficker. Acceso total.
 *  - cm        → Community Manager. Crea solicitudes, ve calendario.
 *  - operator  → Operadores (Roberto, Quota). Mismos permisos que CM
 *                pero cada uno con su nombre propio. NO accede al panel
 *                interno de diseñadores.
 *  - designer  → Diseñador. Centro de Diseño, entregables, IA Andromeda.
 */

const PASS_TRAFFICKER = process.env.AUTH_PASS_TRAFFICKER || "angel2026";
const PASS_GENERAL = process.env.AUTH_PASS_GENERAL || "ganaplay2026";

const DESIGNER_USERS = ["Juan David", "Eliana", "Verónica", "Caleb"];
const OPERATOR_USERS = ["Roberto", "Quota"];

type AuthBody = {
  role?: "admin" | "cm" | "designer" | "operator";
  password?: string;
  designerName?: string;
  operatorName?: string;
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

    const { role, password, designerName, operatorName }: AuthBody = await req.json();

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

    if (role === "designer") {
      if (!designerName || !DESIGNER_USERS.includes(designerName)) {
        return NextResponse.json(
          { ok: false, error: "Selecciona un diseñador válido." },
          { status: 400 }
        );
      }
      if (password !== PASS_GENERAL) {
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
