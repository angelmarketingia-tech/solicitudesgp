/**
 * Subida a Firebase Storage (cliente).
 *
 * Usa SIEMPRE `uploadBytesResumable` en lugar de `uploadBytes`:
 *  - `uploadBytes` manda el archivo en UNA sola petición; si la conexión es
 *    lenta, la petición completa supera `maxUploadRetryTime` y el SDK aborta
 *    con `storage/retry-limit-exceeded`. Por eso fallaban archivos de 2–3 MB
 *    (Word/PDF) aunque estuvieran muy por debajo del límite permitido.
 *  - `uploadBytesResumable` sube por trozos, reporta progreso y aguanta
 *    archivos grandes en conexiones lentas.
 *
 * Además detecta "subida estancada": si no hay avance durante X segundos se
 * cancela con un error claro, en vez de colgarse o de cortar una subida que
 * sí estaba avanzando.
 */
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Nombre seguro para la ruta de Storage (sin acentos, espacios ni paréntesis). */
export function sanitizeFileName(name: string): string {
  const safe = name
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(-120);
  return safe || "archivo";
}

/** Ruta única: evita que dos archivos con el mismo nombre se pisen. */
export function uniquePath(folder: string, fileName: string): string {
  const clean = folder.replace(/^\/+|\/+$/g, "");
  return `${clean}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${sanitizeFileName(fileName)}`;
}

/** Mensaje en español para un error de Storage. */
export function storageErrorMessage(err: unknown): string {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  const raw = err instanceof Error ? err.message : "";
  switch (code) {
    case "storage/unauthorized":
      return "Storage rechazó la subida (revisa las reglas de Storage).";
    case "storage/unauthenticated":
      return "La sesión expiró. Vuelve a entrar e inténtalo de nuevo.";
    case "storage/retry-limit-exceeded":
      return "La conexión es lenta y se agotó el tiempo de subida. Inténtalo de nuevo.";
    case "storage/quota-exceeded":
      return "El almacenamiento del proyecto está lleno.";
    case "storage/canceled":
      return "La subida se canceló.";
    case "storage/unknown":
      return "Storage no respondió (¿bucket inactivo o sin conexión?).";
  }
  if (raw.includes("storage/stalled")) return "La subida se quedó sin avance. Revisa tu conexión e inténtalo de nuevo.";
  return raw || "error desconocido";
}

export type UploadOptions = {
  /** Se llama con el porcentaje (0-100) mientras sube. */
  onProgress?: (pct: number) => void;
  /** Cancelar si no hay ningún avance durante este tiempo. Por defecto 60 s. */
  stallMs?: number;
};

/**
 * Sube un archivo a `folder` dentro de Storage y devuelve su URL de descarga.
 * Lanza el error original de Storage si falla (formatéalo con
 * `storageErrorMessage`).
 */
export async function uploadToStorage(folder: string, file: File, opts: UploadOptions = {}): Promise<string> {
  const stallMs = opts.stallMs ?? 60_000;
  const task = uploadBytesResumable(ref(storage, uniquePath(folder, file.name)), file, {
    contentType: file.type || "application/octet-stream",
  });

  await new Promise<void>((resolve, reject) => {
    let lastMove = Date.now();
    let settled = false;
    const watchdog = setInterval(() => {
      if (settled) return;
      if (Date.now() - lastMove > stallMs) {
        settled = true;
        clearInterval(watchdog);
        try { task.cancel(); } catch { /* ya terminó */ }
        reject(new Error(`storage/stalled: sin avance durante ${Math.round(stallMs / 1000)} s.`));
      }
    }, 2_000);
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(watchdog);
      fn();
    };

    task.on(
      "state_changed",
      (snap) => {
        lastMove = Date.now();
        if (opts.onProgress && snap.totalBytes > 0) {
          opts.onProgress(Math.min(100, Math.round((snap.bytesTransferred / snap.totalBytes) * 100)));
        }
      },
      (err) => finish(() => reject(err)),
      () => finish(resolve)
    );
  });

  return getDownloadURL(task.snapshot.ref);
}
