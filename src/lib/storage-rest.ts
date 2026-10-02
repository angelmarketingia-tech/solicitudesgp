/**
 * Subir archivos a Cloud Storage desde el servidor, con su API REST.
 *
 * POR QUÉ EXISTE: las solicitudes que entran desde fuera del navegador
 * (`/api/requests`, el agente por MCP) pueden traer la imagen de referencia
 * incrustada como `data:…`. Guardarla así dentro del documento es justo lo que
 * encareció la factura de Google: el tablero se carga entero, así que una
 * imagen metida en una solicitud se la descargaba todo el que abría la
 * plataforma. Aquí se deja en Storage y en el documento queda solo la URL.
 *
 * Va por REST y no con el SDK de cliente por lo mismo que `firestore-rest.ts`:
 * funciona con la API key pública porque las reglas del bucket ya permiten
 * escribir sin Firebase Auth (la app tiene su propio login).
 */

const BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";

/**
 * Tipos que ACEPTA el bucket hoy. Las reglas que hay en producción solo dejan
 * pasar estos tres (comprobado con sondas reales; ver `storage.rules`), así
 * que no se intenta subir nada más: fallaría con un 403 y se perdería tiempo.
 */
const TIPOS_ADMITIDOS = /^(image\/|application\/pdf$|application\/zip$)/;

/** Trocea un `data:` en tipo y bytes. Devuelve null si no lo es. */
export function partirDataUrl(dataUrl: string): { tipo: string; bytes: Buffer } | null {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  // `[\s\S]` en vez del modificador `s`: el base64 no trae saltos de línea,
  // pero así la expresión vale con el objetivo de compilación del proyecto.
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const tipo = m[1] || "application/octet-stream";
  try {
    const bytes = m[2]
      ? Buffer.from(m[3], "base64")
      : Buffer.from(decodeURIComponent(m[3]), "binary");
    return bytes.length > 0 ? { tipo, bytes } : null;
  } catch {
    return null;
  }
}

/**
 * Sube los bytes y devuelve su URL de descarga, o null si no se pudo.
 *
 * Nunca lanza: quien la llama está dando de alta una solicitud, y perder la
 * solicitud entera porque falló la imagen de referencia sería peor que
 * quedarse sin la imagen.
 */
export async function subirBytes(
  carpeta: string,
  bytes: Buffer,
  tipo: string,
  nombre = "archivo",
): Promise<string | null> {
  if (!BUCKET || !TIPOS_ADMITIDOS.test(tipo)) return null;
  if (bytes.length > 150 * 1024 * 1024) return null;

  const limpio = nombre.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60) || "archivo";
  const ruta = `${carpeta.replace(/^\/+|\/+$/g, "")}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${limpio}`;

  try {
    const r = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(ruta)}`,
      { method: "POST", headers: { "Content-Type": tipo }, body: new Uint8Array(bytes) },
    );
    if (!r.ok) {
      console.warn("[storage-rest] no se pudo subir:", r.status, await r.text().catch(() => ""));
      return null;
    }
    const datos = (await r.json()) as { downloadTokens?: string };
    const token = String(datos.downloadTokens || "").split(",")[0];
    if (!token) return null;
    return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(ruta)}?alt=media&token=${token}`;
  } catch (err) {
    console.warn("[storage-rest] no se pudo subir:", err);
    return null;
  }
}

/** Atajo: coge un `data:`, lo sube y devuelve su URL. null si no se pudo. */
export async function subirDataUrl(
  carpeta: string,
  dataUrl: string,
  nombre?: string,
): Promise<string | null> {
  const trozos = partirDataUrl(dataUrl);
  if (!trozos) return null;
  const ext = trozos.tipo.split("/")[1]?.split("+")[0] || "bin";
  return subirBytes(carpeta, trozos.bytes, trozos.tipo, nombre || `referencia.${ext}`);
}
