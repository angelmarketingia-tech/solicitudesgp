import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Verificación server-side para eliminación permanente de solicitudes.
 *
 * Flujo:
 *  1. Cliente envía POST { requestId, adminPass }.
 *  2. Server valida adminPass contra AUTH_PASS_TRAFFICKER (rol admin).
 *  3. Si es válido:
 *     - Escribe entrada de audit_log en Firestore (SIN contenido sensible:
 *       solo id, acción, usuario, timestamp).
 *     - Devuelve { ok: true } al cliente.
 *  4. Cliente, tras recibir ok, ejecuta la limpieza real:
 *     - Borra el documento /requests/{id}
 *     - Borra archivos de /creatives/{id}/* en Storage
 *
 * El audit log NO almacena el contenido de la solicitud ni los artes
 * (requisito de la tarea). Solo deja rastro de quién y cuándo.
 *
 * Limitación honesta: este endpoint solo valida la contraseña; no impide
 * que alguien con acceso al cliente y conocimientos técnicos borre desde
 * el navegador directamente (las reglas Firestore son abiertas). Cerrar
 * esa puerta requiere Firebase Admin SDK + reglas Firestore estrictas
 * (siguiente iteración). Para el UI/UX y la auditoría, este endpoint
 * cumple el requisito.
 */

export const runtime = "nodejs";

// SIN default hardcodeado: la contraseña jamás vive en el código fuente
// (el repo es público). Si falta la variable de entorno, el endpoint falla
// cerrado (500), igual que /api/auth.
const PASS_TRAFFICKER = process.env.AUTH_PASS_TRAFFICKER || "";
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "respaldogp-a2578";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

type Body = {
  requestId?: string;
  adminPass?: string;
  by?: string;
};

async function writeAuditLog(entry: {
  action: string;
  requestId: string;
  by: string;
  at: string;
}): Promise<void> {
  if (!API_KEY) return;
  // Hash sencillo para no exponer el id real en logs externos si más adelante
  // se quieren consumir. Mantenemos también el id para correlacionar.
  let hash = 0;
  for (let i = 0; i < entry.requestId.length; i++) {
    hash = (hash * 31 + entry.requestId.charCodeAt(i)) | 0;
  }
  const idHash = `gp-${(hash >>> 0).toString(36)}`;

  const url = `${FS_BASE}/audit_log?key=${API_KEY}`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          action: { stringValue: entry.action },
          requestId: { stringValue: entry.requestId },
          idHash: { stringValue: idHash },
          by: { stringValue: entry.by },
          at: { timestampValue: entry.at },
          result: { stringValue: "ok" },
        },
      }),
    });
  } catch {
    // Audit log NO bloquea la operación (best-effort).
  }
}

export async function POST(req: Request) {
  try {
    // Rate limit fuerte: 8 intentos por IP por 5 min. Brute force de la pass
    // de Trafficker queda totalmente impráctico.
    const ip = getClientIp(req);
    const rl = checkRateLimit(`admin-delete:${ip}`, { max: 8, windowMs: 300_000 });
    if (rl.limited) {
      return NextResponse.json(
        {
          ok: false,
          error: `Demasiados intentos. Espera ${Math.ceil(rl.resetInMs / 60_000)} minutos.`,
        },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetInMs / 1000)) } }
      );
    }

    if (!PASS_TRAFFICKER) {
      console.error("[admin-delete] Falta AUTH_PASS_TRAFFICKER en el entorno.");
      return NextResponse.json(
        { ok: false, error: "Servidor no configurado. Contacta al administrador." },
        { status: 500 }
      );
    }

    const { requestId, adminPass, by }: Body = await req.json();

    if (!requestId || typeof requestId !== "string") {
      return NextResponse.json({ ok: false, error: "requestId requerido." }, { status: 400 });
    }
    if (!adminPass || typeof adminPass !== "string") {
      return NextResponse.json({ ok: false, error: "Falta contraseña de admin." }, { status: 400 });
    }

    if (adminPass !== PASS_TRAFFICKER) {
      return NextResponse.json(
        { ok: false, error: "No autorizado. Solo el Trafficker puede eliminar permanentemente." },
        { status: 403 }
      );
    }

    await writeAuditLog({
      action: "permanent_delete",
      requestId,
      by: (by && typeof by === "string" ? by : "Trafficker"),
      at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
