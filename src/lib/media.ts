/**
 * Clasificación de archivos entregables.
 *
 * Distingue cuatro familias porque cada una se trata distinto:
 *  · image    → estática: se puede comprimir a data URL si Storage falla.
 *  · animated → GIF/APNG/WEBP animado: se MUESTRA como imagen pero NO se puede
 *               comprimir (pasarlo por canvas lo dejaría en un solo fotograma).
 *  · video    → necesita <video> para reproducirse, no <img>.
 *  · doc      → PDF/ZIP: solo icono y descarga.
 */

export type MediaKind = "image" | "animated" | "video" | "doc";

export const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "avif"];
export const ANIMATED_EXTS = ["gif", "apng"];
export const VIDEO_EXTS = ["mp4", "webm", "mov", "m4v"];
export const DOC_EXTS = ["pdf", "zip"];

/** Todo lo que un diseñador puede subir como entregable. */
export const DELIVERABLE_EXTS = [...IMAGE_EXTS, ...ANIMATED_EXTS, ...VIDEO_EXTS, ...DOC_EXTS];

/** Para el atributo `accept` del input de archivos. */
export const DELIVERABLE_ACCEPT = DELIVERABLE_EXTS.map((e) => `.${e}`).join(",");

export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;   // 150 MB
export const MAX_FILE_BYTES = 50 * 1024 * 1024;     // 50 MB para el resto

export function extensionOf(nameOrUrl: string): string {
  const clean = (nameOrUrl || "").split("?")[0].split("#")[0];
  const m = clean.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "";
}

/**
 * Clasifica por nombre de archivo. `urlFallback` cubre las piezas antiguas
 * cuyo `type` no trae extensión: se mira la data URL o la ruta de Storage.
 */
export function mediaKindOf(nameOrUrl: string, urlFallback?: string): MediaKind {
  let ext = extensionOf(nameOrUrl);
  if (!ext && urlFallback) {
    const dataMime = urlFallback.match(/^data:([^;,]+)/);
    if (dataMime) {
      const mime = dataMime[1].toLowerCase();
      if (mime.startsWith("video/")) return "video";
      if (mime === "image/gif" || mime === "image/apng") return "animated";
      if (mime.startsWith("image/")) return "image";
      return "doc";
    }
    // URL de Storage: el nombre del objeto conserva la extensión real.
    ext = extensionOf(decodeURIComponent(urlFallback));
  }
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (ANIMATED_EXTS.includes(ext)) return "animated";
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (DOC_EXTS.includes(ext)) return "doc";
  // Sin pistas: lo tratamos como imagen, que es el caso histórico.
  return "image";
}

/** ¿Se muestra en pantalla (miniatura/lightbox) o solo se descarga? */
export function isViewable(kind: MediaKind): boolean {
  return kind !== "doc";
}

/** Límite de tamaño según el tipo. */
export function maxBytesFor(kind: MediaKind): number {
  return kind === "video" ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
}

export function formatMB(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
