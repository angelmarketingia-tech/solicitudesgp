/**
 * Alta de solicitudes de diseño desde fuera del navegador.
 *
 * Lo comparten dos entradas:
 *  - `/api/requests` → integraciones existentes (p. ej. el Calendario Deportivo).
 *  - `/api/mcp`      → el agente de IA de cada persona, vía MCP.
 *
 * La solicitud queda en el tablero exactamente igual que una creada a mano.
 */
import { createDoc, nextRequestId } from "./firestore-rest";

export const VALID_PRIORITIES = ["Bajo", "Medio", "Alto", "Urgente"] as const;
export const VALID_AREAS = ["Pauta", "Redes Sociales", "CMR"] as const;
export const VALID_KINDS = [
  "Nueva Línea Gráfica",
  "Giveaway",
  "Línea Gráfica Existente",
] as const;

export type Priority = (typeof VALID_PRIORITIES)[number];

export type IncomingRequest = {
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

/** Normaliza la prioridad de cualquier app a la escala de GanaPlay Diseño. */
export function mapPriority(raw?: string): Priority {
  if ((VALID_PRIORITIES as readonly string[]).includes(raw || "")) return raw as Priority;
  const n = (raw || "").toLowerCase().trim();
  if (n === "urgente" || n === "urgent") return "Urgente";
  if (n === "alta" || n === "alto" || n === "high") return "Alto";
  if (n === "baja" || n === "bajo" || n === "low") return "Bajo";
  return "Medio";
}

/**
 * Crea la solicitud y avisa a Diseño. Devuelve el identificador asignado.
 * Lanza si falta el título o si Firestore rechaza la escritura.
 */
export async function crearSolicitud(
  body: IncomingRequest,
  opciones: { requesterNamePorDefecto?: string } = {},
): Promise<{ id: string; title: string; deliveryDate: string; priority: Priority }> {
  const title = (body.title || "").trim();
  if (!title) throw new Error("Falta el título de la solicitud.");

  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.split("T")[0];
  const deliveryDate = (body.deliveryDate || "").slice(0, 10) || today;
  const priority = mapPriority(body.priority);
  const requesterName =
    (body.requesterName || "").trim() ||
    opciones.requesterNamePorDefecto ||
    "Calendario Deportivo";
  const area = (VALID_AREAS as readonly string[]).includes(body.area || "")
    ? (body.area as string)
    : "Pauta";
  const dimensions =
    Array.isArray(body.dimensions) && body.dimensions.length > 0 ? body.dimensions : ["General"];
  const countries =
    Array.isArray(body.countries) && body.countries.length > 0 ? body.countries : ["Internacional"];
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
  if ((VALID_KINDS as readonly string[]).includes(body.requestKind || "")) {
    newReq.requestKind = body.requestKind;
  }

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

  return { id, title, deliveryDate, priority };
}
