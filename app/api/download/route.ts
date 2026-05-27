import { NextResponse } from "next/server";

/**
 * Proxy de descarga server-side.
 *
 * Resuelve el "Failed to fetch" de Firebase Storage:
 *   El bucket no tiene CORS configurado para nuestro origen, así que un
 *   `fetch()` desde el navegador hacia firebasestorage.googleapis.com falla.
 *   Pasando la descarga por aquí, el navegador hace la petición a NUESTRO
 *   dominio (mismo origen → sin CORS) y el server hace la petición externa
 *   a Firebase Storage sin restricciones de navegador.
 *
 * Bonus:
 *   - Forzamos Content-Disposition: attachment para que descargue de verdad
 *     (sin esto los navegadores abren PDFs/imágenes en línea).
 *   - Preservamos el filename original.
 *   - Aceptamos data URLs como passthrough (poco común aquí — el cliente
 *     puede manejarlos directo — pero damos consistencia).
 *
 * Uso desde el cliente:
 *   GET /api/download?url=<urlencoded firebase url>&name=<filename.png>
 */

export const runtime = "nodejs";
export const maxDuration = 60;

function sanitizeFilename(name: string): string {
  // Quita caracteres peligrosos en Content-Disposition y nombres de archivo.
  return name.replace(/[\r\n"\\]/g, "_").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 200) || "archivo";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");
    const rawName = url.searchParams.get("name") || "";

    if (!target) {
      return NextResponse.json({ error: "Falta parámetro 'url'." }, { status: 400 });
    }

    // Solo permitimos descargas desde Firebase Storage o data URLs.
    // Evita que el endpoint se use como proxy abierto para descargar cualquier URL.
    const isFirebase =
      target.startsWith("https://firebasestorage.googleapis.com/") ||
      target.startsWith("https://storage.googleapis.com/") ||
      target.includes(".firebasestorage.app/");

    if (!isFirebase) {
      // Data URLs: no son necesarias aquí (el cliente puede manejarlas), pero
      // si llegan, devolvemos error claro en vez de proxy abierto.
      return NextResponse.json(
        { error: "Solo se permiten URLs de Firebase Storage." },
        { status: 400 }
      );
    }

    const upstream = await fetch(target, {
      // No reenviamos cookies del cliente; petición limpia.
      headers: { Accept: "*/*" },
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Storage devolvió ${upstream.status}.` },
        { status: upstream.status || 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");
    const filename = sanitizeFilename(rawName);

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    if (contentLength) headers.set("Content-Length", contentLength);
    // Encoding RFC 5987 para soportar Unicode en el filename.
    headers.set(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    headers.set("Cache-Control", "private, max-age=0, no-store");

    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error proxy descarga.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
