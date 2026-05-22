/**
 * Utilidades de imagen del lado del cliente.
 *
 * Permite usar imágenes (referencias, comentarios, chat) SIN depender de
 * Firebase Storage: la imagen se comprime y se guarda como data URL (base64)
 * directamente en Firestore, que sí está operativo.
 *
 * Los entregables finales del diseñador (archivos grandes) siguen usando
 * Storage, porque superan el límite de tamaño de un documento de Firestore.
 */

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
export const MAX_IMAGE_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB de archivo de entrada

/** Valida tipo y tamaño de una imagen. Devuelve un mensaje de error o null. */
export function validateImage(file: { type: string; size: number; name?: string }): string | null {
  const typeOk =
    ALLOWED_IMAGE_TYPES.includes(file.type) ||
    /\.(png|jpe?g|webp)$/i.test(file.name || "");
  if (!typeOk) return "Formato no permitido. Usa PNG, JPG o WEBP.";
  if (file.size > MAX_IMAGE_INPUT_BYTES) return "La imagen supera el límite de 10 MB.";
  return null;
}

/**
 * Comprime una imagen a un data URL pequeño (apto para Firestore).
 * Redimensiona y baja calidad hasta quedar por debajo de maxBytes.
 */
export async function compressImageToDataUrl(
  file: Blob,
  opts: { maxDimension?: number; maxBytes?: number } = {}
): Promise<string> {
  const maxDimension = opts.maxDimension ?? 1400;
  const maxBytes = opts.maxBytes ?? 480 * 1024; // ~480 KB de data URL

  const sourceUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("El archivo no es una imagen válida."));
    i.src = sourceUrl;
  });

  let width = img.width;
  let height = img.height;
  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const render = (w: number, h: number, quality: number): string => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la imagen.");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  };

  let quality = 0.82;
  let out = render(width, height, quality);
  while (out.length > maxBytes && quality > 0.4) {
    quality -= 0.12;
    out = render(width, height, quality);
  }
  // Si aún excede, reducir dimensión una vez más.
  if (out.length > maxBytes) {
    out = render(Math.round(width * 0.7), Math.round(height * 0.7), 0.6);
  }
  return out;
}
