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

    // Validación estricta por HOST (no por substring, que era bypasseable con
    // p. ej. ".../#.firebasestorage.app/" apuntando a un host interno → SSRF).
    // Parseamos la URL y validamos protocolo https + hostname exacto.
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return NextResponse.json({ error: "URL inválida." }, { status: 400 });
    }
    const host = parsed.hostname.toLowerCase();
    const allowedHost =
      parsed.protocol === "https:" &&
      (host === "firebasestorage.googleapis.com" ||
        host === "storage.googleapis.com" ||
        host.endsWith(".firebasestorage.app"));

    if (!allowedHost) {
      // Bloquea proxy abierto / SSRF (metadata interna, data:, javascript:, http:, etc.).
      return NextResponse.json(
        { error: "Solo se permiten URLs https de Firebase Storage." },
        { status: 400 }
      );
    }

    const upstream = await fetch(parsed.toString(), {
      // No reenviamos cookies del cliente; petición limpia.
      headers: { Accept: "*/*" },
      cache: "no-store",
      // No seguir redirecciones: evita rebotes a hosts internos tras el chequeo.
      redirect: "error",
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
