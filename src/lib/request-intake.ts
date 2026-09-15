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
/**
 * Áreas SUGERIDAS, no la lista cerrada.
 *
 * El área solicitante dejó de ser un catálogo fijo: llegan solicitudes de
 * Directiva y de cualquier otro frente, y encerrarlas en tres opciones las
 * hacía aterrizar todas en "Pauta", falseando la contabilidad y el informe.
 * Ahora se admite cualquier texto (ver `normalizarArea`) y estas son las
 * opciones que la interfaz ofrece de un clic.
 */
export const AREAS_SUGERIDAS = ["Pauta", "Redes Sociales", "CMR", "Directiva"] as const;

/** Se mantiene el nombre anterior para quien ya lo importaba. */
export const VALID_AREAS = AREAS_SUGERIDAS;

export const AREA_POR_DEFECTO = "Pauta";

/** Tope de longitud del área escrita a mano, para que no entre un texto largo. */
const MAX_AREA = 40;

/**
 * Deja el área como se va a guardar: texto libre, recortado y sin duplicar por
 * mayúsculas/espacios. Si viene vacía, cae en el área por defecto.
 *
 * Se reconoce una sugerencia escrita con otra caja ("PAUTA", "pauta ") y se
 * guarda con la grafía del catálogo, para que la contabilidad no acabe con
 * "Pauta" y "PAUTA" contando por separado.
 */
export function normalizarArea(raw?: string): string {
  const texto = String(raw || "").trim().replace(/\s+/g, " ").slice(0, MAX_AREA);
  if (!texto) return AREA_POR_DEFECTO;
  const canon = (AREAS_SUGERIDAS as readonly string[]).find(
    a => a.toLowerCase() === texto.toLowerCase(),
  );
  return canon || texto;
}

export const VALID_KINDS = [
  "Nueva Línea Gráfica",
  "Giveaway",
  "Línea Gráfica Existente",
  "E-CARDS",
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
  const area = normalizarArea(body.area);
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
