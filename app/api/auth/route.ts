import { NextResponse } from "next/server";

/**
 * Validación de acceso del lado del servidor.
 *
 * Las contraseñas ya NO viven en el bundle del navegador. Se leen de variables
 * de entorno y, si no están configuradas, se usan valores por defecto para no
 * romper el sistema (recomendado sobreescribirlos en .env.local).
 *
 * Variables soportadas:
 *  - AUTH_PASS_TRAFFICKER  → acceso del Trafficker (rol admin)
 *  - AUTH_PASS_GENERAL     → acceso de Community Manager y Diseñadores
 */

const PASS_TRAFFICKER = process.env.AUTH_PASS_TRAFFICKER || "angel2026";
const PASS_GENERAL = process.env.AUTH_PASS_GENERAL || "ganaplay2026";

const DESIGNER_USERS = ["Juan David", "Eliana", "Verónica", "Caleb"];

type AuthBody = {
  role?: "admin" | "cm" | "designer";
  password?: string;
  designerName?: string;
};

export async function POST(req: Request) {
  try {
    const { role, password, designerName }: AuthBody = await req.json();

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
