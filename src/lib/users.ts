import { PUBLIC_APP_URL } from "./public-url";

/**
 * Directorio del equipo y configuración de correos predeterminados.
 *
 * El correo del Trafficker se lee de la variable de entorno
 * NEXT_PUBLIC_DEFAULT_TRAFFICKER_EMAIL (configurable), con un valor por
 * defecto. NO es un valor inmutable hardcodeado.
 */

export const DEFAULT_TRAFFICKER_EMAIL =
  (process.env.NEXT_PUBLIC_DEFAULT_TRAFFICKER_EMAIL || "").trim() ||
  "angel.vaca@ganaplay.com";

/** Buzón del PUESTO de Community Manager, no de quien lo ocupe hoy. */
export const DEFAULT_COMMUNITY_EMAIL =
  (process.env.NEXT_PUBLIC_COMMUNITY_EMAIL || "").trim() ||
  "community.manager@ganaplay.com";

/**
 * Directorio nombre → correo. Completa los correos del resto del equipo
 * para que el destinatario se autocomplete al crear/entregar solicitudes.
 */
export const USER_DIRECTORY: Record<string, string> = {
  "Trafficker": DEFAULT_TRAFFICKER_EMAIL,
  "Community Manager": DEFAULT_COMMUNITY_EMAIL,   // nombre histórico del puesto
  "Luisa": DEFAULT_COMMUNITY_EMAIL,
  "Juan David": "david.gutierrez@ganaplay.com",
  "Eliana": "Eliana.Izquierdo@ganaplay.com",
  "Verónica": "veronica.marquez@ganaplay.com",
  "Caleb": "caleb.guevara@ganaplay.com",
  "Roberto": "roberto.andrade@ganaplay.com",
  // El del puesto: es el que recibe los avisos de entrega.
  "Keyri": "auxiliar.marketing@ganaplay.com",
  "Juan": "juan.gutierrez@ganaplay.com",
  "Comercial": "comercial@ganaplay.com",
  "Juan Saavedra": "Juan.Saavedra@ganaplay.com",
  "Diego Barreto": "diego.barreto@ganaplay.com",
  "Juan Currea": "juan.currea@ganaplay.com",
  "Sebastian": "sebastian.calderon@ganaplay.com",
  "Fernanda": "coordinador.marketing@ganaplay.com",
  "Andres": "andres.clavijo@ganaplay.com",
};

/**
 * Correos que aparecen PRE-SELECCIONADOS al crear una solicitud (para que la
 * entrega les llegue por defecto). El solicitante puede quitar o agregar más.
 */
export const DEFAULT_REQUESTER_EMAILS: string[] = [
  "angel.vaca@ganaplay.com",
  "roberto.andrade@ganaplay.com",
  "coordinador.marketing@ganaplay.com",
];

/** Correos sugeridos (chips de un clic) al elegir destinatarios de la solicitud. */
export const SUGGESTED_REQUESTER_EMAILS: string[] = Array.from(
  new Set([
    ...DEFAULT_REQUESTER_EMAILS,
    ...Object.values(USER_DIRECTORY).filter(Boolean),
  ]),
);

/**
 * Quiénes ocupan el puesto de Community Manager — espejo del backend.
 * Son VARIAS desde octubre de 2026 (la CM y la Auxiliar de Marketing), así que
 * al entrar por perfil hay que decir quién eres, como ya hacían los
 * diseñadores: si no, las dos crearían a nombre del puesto y no del suyo.
 */
export const CM_USERS = ["Luisa", "Keyri"] as const;

/** Lista de operadores válidos — espejo del backend. "Quota" pasó a Comercial. */
export const OPERATOR_USERS = ["Juan"] as const;

/**
 * Lista de DIRECTIVOS válidos (Andres, Sebastian y la Coordinación de
 * Marketing) — espejo del backend.
 * Internamente el rol se sigue llamando "administrative" por compatibilidad
 * con datos previos; el label visible en UI es "DIRECTIVOS".
 *
 * Roberto ya no está aquí: pasó a Ejecutivo Comercial, un perfil con menos
 * alcance (no ve las solicitudes del Trafficker). Dejarlo también como
 * DIRECTIVO habría sido una puerta trasera a lo que se le acaba de restringir.
 */
export const ADMINISTRATIVE_USERS = ["Andres", "Sebastian", "Fernanda"] as const;

/** Ejecutivos comerciales — espejo del backend. */
export const EJECUTIVO_USERS = ["Roberto", "Juan Saavedra", "Diego Barreto", "Juan Currea"] as const;

/** Correo asociado a un nombre de usuario (cadena vacía si no está registrado). */
export function emailForUser(name: string): string {
  return USER_DIRECTORY[name] || "";
}

/**
 * Con quién se abre la lista de destinatarios al crear una solicitud.
 *
 * SOLO quien la pide. Cualquier otra persona se agrega a mano.
 *
 * Hubo dos intentos antes de llegar aquí y los dos acabaron molestando. Primero
 * tres correos fijos e invisibles, que avisaban a gente que no había pedido
 * nada. Después el buzón del puesto de Community Manager preseleccionado en
 * TODAS las solicitudes: visible y quitable, pero igual aparecía en las de todo
 * el mundo y había que borrarlo una y otra vez. Quien crea la solicitud sabe a
 * quién le toca enterarse; la lista nace con su correo y nada más.
 *
 * OJO con la consecuencia, que es real: el aviso de entrega se manda a los
 * correos que lleva la solicitud y a nada más. Si la CM —o cualquier otro— debe
 * enterarse de una entrega, hay que agregarlo AL CREARLA. Si no está, no le
 * llega nada.
 */
export function destinatariosIniciales(correoPropio: string): string[] {
  const propio = (correoPropio || "").trim();
  return propio ? [propio] : [];
}

/**
 * URL pública de la aplicación, usada en los correos.
 *
 * Se reexporta de `public-url.ts` para que NO haya dos direcciones por
 * defecto distintas: aquí caía en `solicitudesgp.vercel.app` —el dominio de
 * respaldo— mientras los enlaces públicos salían del dominio propio, así que
 * los botones de los correos mandaban a la gente a la dirección alterna.
 */
export const APP_URL = PUBLIC_APP_URL;

/**
 * Enlace a UNA solicitud concreta. Al abrirlo, la app le muestra su ficha en
 * vez de dejar a la persona buscándola en el tablero (el parámetro
 * `?solicitud=` ya lo entiende la portada).
 */
export function requestLink(id: string): string {
  const limpio = String(id || "").trim();
  return limpio ? `${APP_URL}/?solicitud=${encodeURIComponent(limpio)}` : APP_URL;
}
