/**
 * URL pública para los enlaces que se comparten FUERA del equipo
 * (calendarios de influencers `/i/<code>` y promocionales `/p/<code>`).
 *
 * Antes se construían con `window.location.origin`, es decir, la dirección en
 * la que estuviera el navegador de quien copiaba el enlace. Eso rompía el
 * enlace en dos casos muy fáciles de dar:
 *
 *  · Copiado desde una URL de despliegue de Vercel
 *    (`…-angelmarketingia-9738s-projects.vercel.app`, `…-git-main-….vercel.app`):
 *    esas direcciones están protegidas y redirigen a `vercel.com/sso-api`, así
 *    que la persona de fuera se topaba con un LOGIN DE VERCEL.
 *  · Copiado desde `localhost`: el enlace solo abría en esa misma máquina.
 *
 * Ahora el enlace sale siempre de la dirección pública, salvo que el navegador
 * ya esté en una que sabemos pública (así se respeta el dominio propio).
 */

/** Dirección pública configurada. El dominio propio es el valor por defecto. */
export const PUBLIC_APP_URL = (
  (process.env.NEXT_PUBLIC_APP_URL || "").trim() || "https://solicitudes.ganaplay.lat"
).replace(/\/+$/, "");

/** Hosts que sirven la app SIN pedir credenciales. */
const HOSTS_PUBLICOS = new Set([
  "solicitudes.ganaplay.lat",
  "solicitudesgp.vercel.app",
]);

/** Base sobre la que construir un enlace para compartir con gente de fuera. */
export function publicBaseUrl(): string {
  if (typeof window === "undefined") return PUBLIC_APP_URL;
  try {
    const { hostname, origin } = window.location;
    if (HOSTS_PUBLICOS.has(hostname)) return origin;
    // Y el dominio configurado, aunque no esté en la lista de arriba.
    if (PUBLIC_APP_URL.includes(hostname) && hostname !== "localhost") return origin;
  } catch { /* usa el valor por defecto */ }
  return PUBLIC_APP_URL;
}

/** Enlace absoluto y compartible. `path` va con barra inicial: "/i/abc123". */
export function publicLink(path: string): string {
  return `${publicBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Dirección de respaldo, en dominio neutro. */
const BASE_ALTERNA = "https://solicitudesgp.vercel.app";

/**
 * El MISMO contenido servido desde `…vercel.app` en vez de `ganaplay.lat`.
 *
 * POR QUÉ: a varios influencers no les abre el enlace normal, y la página está
 * comprobada: responde 200 y se ve entera desde fuera, sin sesión. Lo que
 * queda del otro lado es su red. "ganaplay" en el dominio tiene toda la pinta
 * de caer en los filtros de apuestas que aplican algunos operadores móviles,
 * y `vercel.app` no le dice nada a esos filtros.
 *
 * Es una conjetura, pero sale gratis probarla: es la misma página.
 */
export function publicLinkAlterno(path: string): string {
  const ruta = path.startsWith("/") ? path : `/${path}`;
  // Si el dominio propio YA es el alterno, se ofrece el otro para que el botón
  // nunca copie exactamente lo mismo que el de al lado.
  if (publicBaseUrl() === BASE_ALTERNA) return `https://solicitudes.ganaplay.lat${ruta}`;
  return `${BASE_ALTERNA}${ruta}`;
}
