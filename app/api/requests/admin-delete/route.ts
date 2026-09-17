import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { emailDeIdToken, findByEmail } from "@/lib/team";
import { deleteDocConfirmado, listSubDocIds } from "@/lib/firestore-rest";

/**
 * Verificación server-side para eliminación permanente de solicitudes.
 *
 * Flujo:
 *  1. Cliente envía POST { requestId, by } con `adminPass` o con `idToken`.
 *  2. Server autoriza de dos maneras, porque a la plataforma se entra de dos
 *     formas y las dos tienen que servir aquí:
 *       · `adminPass`: la contraseña compartida del Trafficker o de Diseño.
 *       · `idToken`: quien ya tiene contraseña PERSONAL. Se resuelve su correo
 *         contra Firebase y se mira su perfil en el directorio.
 *     Diseño borra porque son quienes detectan los duplicados y las pruebas;
 *     en el registro queda quién fue.
 *  3. Si es válido:
 *     - Escribe entrada de audit_log en Firestore (SIN contenido sensible:
 *       solo id, acción, usuario, timestamp).
 *     - Devuelve { ok: true } al cliente.
 *  4. EL SERVIDOR borra la solicitud y comprueba que ya no está. Antes esto
 *     lo hacía el navegador, y la conexión de Firestore desde el navegador es
 *     justo la que se cuelga en algunas redes: se encontraron 34 solicitudes
 *     mandadas a eliminar que seguían en el tablero, contando en los
 *     indicadores. Una de ellas se había intentado dos veces el mismo día.
 *  5. El cliente, con el ok, limpia los archivos de /creatives/{id}/* en
 *     Storage (eso sí necesita su SDK) y refresca la pantalla.
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
const PASS_DESIGNER = process.env.AUTH_PASS_DESIGNER || "";
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "respaldogp-a2578";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

type Body = {
  requestId?: string;
  adminPass?: string;
  /** De quien entra con contraseña personal en vez de la compartida. */
  idToken?: string;
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

    if (!PASS_TRAFFICKER && !PASS_DESIGNER) {
      console.error("[admin-delete] Faltan AUTH_PASS_TRAFFICKER y AUTH_PASS_DESIGNER en el entorno.");
      return NextResponse.json(
        { ok: false, error: "Servidor no configurado. Contacta al administrador." },
        { status: 500 }
      );
    }

    const { requestId, adminPass, idToken, by }: Body = await req.json();

    if (!requestId || typeof requestId !== "string") {
      return NextResponse.json({ ok: false, error: "requestId requerido." }, { status: 400 });
    }
    if ((!adminPass || typeof adminPass !== "string") && !idToken) {
      return NextResponse.json({ ok: false, error: "Falta la contraseña." }, { status: 400 });
    }

    // Quién está borrando. Se guarda en el registro: es lo único que queda
    // cuando alguien pregunta "¿y esta solicitud?".
    let perfil =
      (adminPass && PASS_TRAFFICKER && adminPass === PASS_TRAFFICKER) ? "Trafficker"
      : (adminPass && PASS_DESIGNER && adminPass === PASS_DESIGNER) ? "Diseño"
      : "";

    // Contraseña personal: se comprueba contra Firebase y el perfil sale del
    // directorio. Sin esto, quien ya se puso contraseña propia no podía borrar
    // aunque su perfil sí tuviera permiso.
    if (!perfil && idToken && typeof idToken === "string") {
      const correo = await emailDeIdToken(idToken);
      const persona = correo ? findByEmail(correo) : null;
      if (persona?.role === "admin") perfil = "Trafficker";
      else if (persona?.role === "designer") perfil = "Diseño";
    }

    if (!perfil) {
      return NextResponse.json(
        { ok: false, error: "No autorizado. Eliminar permanentemente es del Trafficker y del equipo de Diseño." },
        { status: 403 }
      );
    }

    const quien = `${(by && typeof by === "string" ? by : perfil)} (${perfil})`;

    // Primero los comentarios: un documento con subcolección deja "documentos
    // huérfanos" que siguen apareciendo en algunas consultas.
    try {
      const mensajes = await listSubDocIds(`requests/${encodeURIComponent(requestId)}/messages`);
      for (const m of mensajes) {
        await deleteDocConfirmado(`requests/${encodeURIComponent(requestId)}/messages`, m).catch(() => {});
      }
    } catch { /* no bloquea el borrado principal */ }

    let borrada = false;
    try {
      borrada = await deleteDocConfirmado("requests", requestId);
    } catch (e) {
      console.error("[admin-delete] fallo al borrar:", e);
    }

    if (!borrada) {
      return NextResponse.json(
        { ok: false, error: "No se pudo borrar la solicitud. Vuelve a intentarlo en un momento." },
        { status: 502 },
      );
    }

    // El registro se escribe DESPUÉS de comprobar que se fue: antes quedaba
    // rastro de borrados que en realidad no habían ocurrido.
    await writeAuditLog({
      action: "permanent_delete",
      requestId,
      by: quien,
      at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
