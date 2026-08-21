import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { emailDeIdToken, findByEmail, mcpTokenFor, verificarCredenciales } from "@/lib/team";

/**
 * Entrega el token con el que cada persona conecta su agente de IA al servidor
 * MCP (`/api/mcp`).
 *
 * Se pide con las credenciales de siempre —correo + contraseña, o el idToken de
 * quien ya tiene contraseña personal— en vez de devolverlo al iniciar sesión:
 * es una llave de larga duración, y así solo aparece cuando alguien la pide a
 * propósito desde "Mi perfil".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`mcp-token:${ip}`, { max: 10, windowMs: 60_000 });
    if (rl.limited) {
      return NextResponse.json(
        { ok: false, error: `Demasiados intentos. Espera ${Math.ceil(rl.resetInMs / 1000)}s.` },
        { status: 429 },
      );
    }

    const { email, password, idToken } = (await req.json()) as {
      email?: string;
      password?: string;
      idToken?: string;
    };

    let correo = "";
    if (idToken) {
      correo = (await emailDeIdToken(idToken)) || "";
      if (!correo) {
        return NextResponse.json({ ok: false, error: "Sesión no válida." }, { status: 401 });
      }
      if (!findByEmail(correo)) {
        return NextResponse.json(
          { ok: false, error: "Tu cuenta no está dada de alta en el sistema." },
          { status: 403 },
        );
      }
    } else {
      if (!email || !password) {
        return NextResponse.json({ ok: false, error: "Confirma tu correo y tu contraseña." }, { status: 400 });
      }
      const entry = verificarCredenciales(email, password);
      if (!entry) {
        return NextResponse.json({ ok: false, error: "Correo o contraseña incorrectos." }, { status: 401 });
      }
      correo = entry.email;
    }

    const token = mcpTokenFor(correo);
    if (!token) {
      console.error("[mcp-token] no hay secreto para derivar tokens (MCP_TOKEN_SECRET).");
      return NextResponse.json(
        { ok: false, error: "La conexión de agentes no está configurada en el servidor." },
        { status: 500 },
      );
    }

    const url = new URL(req.url);
    return NextResponse.json({ ok: true, token, url: `${url.origin}/api/mcp` });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo generar el token." }, { status: 500 });
  }
}
