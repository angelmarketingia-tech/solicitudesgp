/**
 * Acceso a Firestore desde el servidor con su API REST.
 *
 * No se usa el SDK de cliente (que no es fiable del lado del servidor) ni el
 * Admin SDK (el proyecto no tiene service account). Funciona con la API key
 * pública porque las reglas de Firestore ya permiten escritura sin Firebase
 * Auth: la app tiene su propio login.
 */

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "ganaplay-73120";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export const firestoreConfigurado = Boolean(API_KEY);

// ── Conversión de valores JS al formato tipado de la API REST de Firestore ──
export function fsValue(v: unknown): Record<string, unknown> {
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

export function fsFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) out[k] = fsValue(val);
  return out;
}

// ── Conversión inversa: del formato de Firestore a valores JS normales ──
type FsRaw = Record<string, unknown>;

function fromFsValue(v: FsRaw): unknown {
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) {
    const arr = (v.arrayValue as { values?: FsRaw[] })?.values || [];
    return arr.map(fromFsValue);
  }
  if ("mapValue" in v) {
    return fromFsFields((v.mapValue as { fields?: Record<string, FsRaw> })?.fields || {});
  }
  return null;
}

export function fromFsFields(fields: Record<string, FsRaw>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(fields)) out[k] = fromFsValue(val);
  return out;
}

/** Crea un documento. Si `docId` es null, Firestore genera el identificador. */
export async function createDoc(
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

/** Lee un documento por su identificador. `null` si no existe. */
export async function getDoc(
  collection: string,
  docId: string,
  campos?: string[],
): Promise<Record<string, unknown> | null> {
  const url = new URL(`${FS_BASE}/${collection}/${encodeURIComponent(docId)}`);
  url.searchParams.set("key", API_KEY);
  for (const campo of campos || []) url.searchParams.append("mask.fieldPaths", campo);
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return fromFsFields(data.fields || {});
}

/**
 * Recorre una colección entera, página a página.
 *
 * `campos` limita lo que viaja: el tablero guarda imágenes en base64 dentro de
 * los documentos, así que pedir todo trae megabytes que casi nunca hacen falta.
 */
export async function listDocs(
  collection: string,
  opciones: { campos?: string[]; maxPaginas?: number } = {},
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const { campos, maxPaginas = 30 } = opciones;
  const out: { id: string; data: Record<string, unknown> }[] = [];
  let pageToken = "";
  for (let page = 0; page < maxPaginas; page++) {
    const url = new URL(`${FS_BASE}/${collection}`);
    url.searchParams.set("key", API_KEY);
    url.searchParams.set("pageSize", "300");
    for (const campo of campos || []) url.searchParams.append("mask.fieldPaths", campo);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!res.ok) throw new Error(`Firestore list ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const d of data.documents || []) {
      out.push({
        id: String(d.name || "").split("/").pop() || "",
        data: fromFsFields(d.fields || {}),
      });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return out;
}

/**
 * Calcula el siguiente id GP<n> recorriendo la colección `requests`.
 *
 * Solo cuentan los identificadores con la forma exacta `GP<números>`. Antes se
 * quitaba del id todo lo que no fuera un dígito, y los módulos que comparten
 * esta colección (Promocionales, CMR, Influencers) traen identificadores
 * propios con marca de tiempo dentro: de ahí salían solicitudes numeradas
 * GP1785772307361672 en vez de la siguiente del tablero.
 */
export async function nextRequestId(): Promise<string> {
  let max = 6611;
  const docs = await listDocs("requests", { campos: ["status"] });
  for (const { id } of docs) {
    const m = /^GP(\d{1,9})$/.exec(id);
    if (!m) continue;
    const n = Number(m[1]);
    if (n > max) max = n;
  }
  return `GP${max + 1}`;
}
