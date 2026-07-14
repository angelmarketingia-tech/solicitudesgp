import { NextResponse } from "next/server";

/**
 * Entrada de solicitudes desde aplicaciones externas de GanaPlay.
 *
 * La usa, por ejemplo, el Calendario Deportivo: cuando un trafficker registra
 * un evento y pide arte, esa app hace POST aquí y la solicitud aparece en el
 * tablero de GanaPlay Diseño igual que una creada a mano.
 *
 * Escribe en Firestore con la API REST (no el SDK de cliente, que no es fiable
 * del lado del servidor). Funciona con la API key pública porque las reglas de
 * Firestore ya permiten escritura sin Firebase Auth (la app usa login propio).
 *
 * Seguridad: si REQUESTS_INTAKE_SECRET está definido, exige el header
 *   Authorization: Bearer <secreto>
 */

export const runtime = "nodejs";

const INTAKE_SECRET = process.env.REQUESTS_INTAKE_SECRET || "";
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "ganaplay-73120";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const VALID_PRIORITIES = ["Bajo", "Medio", "Alto", "Urgente"];
const VALID_AREAS = ["Pauta", "Redes Sociales", "CMR"];
const VALID_KINDS = ["Nueva Línea Gráfica", "Giveaway", "Línea Gráfica Existente"];

type IncomingRequest = {
  title?: string;
  copy?: string;
  objective?: string;
  deliveryDate?: string;
  priority?: string;
  format?: string;
  dimensions?: string[];
  countries?: string[];
  channels?: string[];
  area?: string;
  requesterName?: string;
  requesterEmail?: string;
  referenceImage?: string;
  requestKind?: string;
  source?: string;
};

// ── Conversión de valores JS al formato tipado de la API REST de Firestore ──
function fsValue(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
  if (typeof v === "object") {
    return { mapValue: { fields: fsFields(v as Record<string, unknown>) } };
  }
  return { stringValue: String(v) };
}
function fsFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) out[k] = fsValue(val);
  return out;
}

// Normaliza la prioridad de cualquier app a la escala de GanaPlay Diseño.
function mapPriority(raw?: string): "Bajo" | "Medio" | "Alto" | "Urgente" {
  if (VALID_PRIORITIES.includes(raw || "")) return raw as "Bajo" | "Medio" | "Alto" | "Urgente";
  const n = (raw || "").toLowerCase().trim();
  if (n === "urgente" || n === "urgent") return "Urgente";
  if (n === "alta" || n === "alto" || n === "high") return "Alto";
  if (n === "baja" || n === "bajo" || n === "low") return "Bajo";
  return "Medio";
}

// Calcula el siguiente id GP<n> recorriendo la colección `requests`.
async function nextRequestId(): Promise<string> {
  let max = 6611;
  let pageToken = "";
  for (let page = 0; page < 30; page++) {
    const url = new URL(`${FS_BASE}/requests`);
    url.searchParams.set("key", API_KEY);
    url.searchParams.set("pageSize", "300");
    url.searchParams.set("mask.fieldPaths", "status");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Firestore list ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const d of data.documents || []) {
      const id = String(d.name || "").split("/").pop() || "";
      const n = parseInt(id.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(n) && n > max) max = n;
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return `GP${max + 1}`;
}

// Crea un documento en Firestore vía API REST.
async function createDoc(
  collection: string,
  docId: string | null,
  fields: Record<string, unknown>,
): Promise<void> {
  const url = new URL(`${FS_BASE}/${collection}`);
  url.searchParams.set("key", API_KEY);
  if (docId) url.searchParams.set("documentId", docId);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fsFields(fields) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Firestore create ${res.status}: ${await res.text()}`);
}

export async function POST(req: Request) {
  try {
    // ── Autenticación de integración externa ──
    if (INTAKE_SECRET) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${INTAKE_SECRET}`) {
        return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
      }
    }
    if (!API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Firebase no configurado en el servidor." },
        { status: 500 },
      );
    }

    const body: IncomingRequest = await req.json().catch(() => ({}));

    const title = (body.title || "").trim();
    if (!title) {
      return NextResponse.json(
        { ok: false, error: "Falta el título de la solicitud." },
        { status: 400 },
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const today = nowIso.split("T")[0];
    const deliveryDate = (body.deliveryDate || "").slice(0, 10) || today;
    const priority = mapPriority(body.priority);
    const requesterName = (body.requesterName || "Calendario Deportivo").trim();
    const area = VALID_AREAS.includes(body.area || "") ? (body.area as string) : "Pauta";
    const dimensions =
      Array.isArray(body.dimensions) && body.dimensions.length > 0 ? body.dimensions : ["General"];
    const countries =
      Array.isArray(body.countries) && body.countries.length > 0
        ? body.countries
        : ["Internacional"];
    const channels = Array.isArray(body.channels) ? body.channels : [];
    const source = (body.source || "integración externa").trim();

    const id = await nextRequestId();

    const newReq: Record<string, unknown> = {
      id,
      title,
      copy: (body.copy || "").trim(),
      format: (body.format || "static").trim(),
      dimensions,
      countries,
      requestDate: today,
      deliveryDate,
      status: "Pendiente",
      priority,
      area,
      requesterName,
      requesterEmail: (body.requesterEmail || "").trim(),
      objective: (body.objective || "").trim(),
      channels,
      creatives: [],
      comments: 0,
      history: [{ action: `Solicitud creada desde ${source}`, by: requesterName, at: nowIso }],
      updatedAt: now,
    };
    if (body.referenceImage) newReq.referenceImage = body.referenceImage;
    if (VALID_KINDS.includes(body.requestKind || "")) newReq.requestKind = body.requestKind;

    await createDoc("requests", id, newReq);

    // Notificación interna para los diseñadores (no crítica si falla).
    try {
      await createDoc("notifications", null, {
        type: "new_request",
        title: "📋 Nueva solicitud",
        message: `${id}: "${title}" — Entrega ${deliveryDate}`,
        targetRole: "designer",
        requestId: id,
        read: false,
        createdAt: now,
        triggeredBy: requesterName,
      });
    } catch (e) {
      console.warn("[requests] notificación no creada:", e);
    }

    return NextResponse.json({ ok: true, id });
  } catch (error: unknown) {
    console.error("Error en /api/requests:", error);
    const message =
      error instanceof Error ? error.message : "Error interno al crear la solicitud.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
