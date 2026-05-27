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
 *  - AUTH_PASS_GENERAL     → acceso de Community Manager, Operadores y Diseñadores
 *
 * Configuradas en Vercel (Production) y en .env.local (Development).
 *
 * Roles:
 *  - admin           → Trafficker. Acceso total + eliminación permanente.
 *  - cm              → Community Manager. Crea solicitudes, ve calendario.
 *  - operator        → Operadores (Roberto, Quota, Juan). Mismos permisos
 *                      que CM pero cada uno con su nombre propio.
 *  - administrative  → Administrativos (Andres, Sebastian). Mismos permisos
 *                      que CM/operator, distinto perfil para auditoría.
 *  - designer        → Diseñador. Centro de Diseño, entregables, IA Andromeda.
 *
 * Ninguno de los roles "internos no-admin" (cm, operator, administrative)
 * accede al panel de diseñadores ni a la eliminación permanente.
 */

const PASS_TRAFFICKER = process.env.AUTH_PASS_TRAFFICKER || "";
const PASS_GENERAL = process.env.AUTH_PASS_GENERAL || "";

const DESIGNER_USERS = ["Juan David", "Eliana", "Verónica", "Caleb"];
const OPERATOR_USERS = ["Roberto", "Quota", "Juan"];
const ADMINISTRATIVE_USERS = ["Andres", "Sebastian"];

type AuthBody = {
  role?: "admin" | "cm" | "designer" | "operator" | "administrative";
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

    const { role, password, designerName, operatorName, administrativeName }: AuthBody = await req.json();

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
