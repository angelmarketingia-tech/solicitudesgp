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

export const DEFAULT_COMMUNITY_EMAIL =
  (process.env.NEXT_PUBLIC_COMMUNITY_EMAIL || "").trim() ||
  "Fernanda.Monrroy@ganaplay.com";

/**
 * Directorio nombre → correo. Completa los correos del resto del equipo
 * para que el destinatario se autocomplete al crear/entregar solicitudes.
 */
export const USER_DIRECTORY: Record<string, string> = {
  "Trafficker": DEFAULT_TRAFFICKER_EMAIL,
  "Community Manager": DEFAULT_COMMUNITY_EMAIL,
  "Juan David": "david.gutierrez@ganaplay.com",
  "Eliana": "Eliana.Izquierdo@ganaplay.com",
  "Verónica": "veronica.marquez@ganaplay.com",
  "Caleb": "caleb.guevara@ganaplay.com",
  "Roberto": "roberto.andrade@ganaplay.com",
  "Gabriela": "gabriela.martinez@ganaplay.com",
  "Juan": "juan.gutierrez@ganaplay.com",
  "Comercial": "comercial@ganaplay.com",
  // Directivos restantes: completar cuando sepamos sus emails.
  "Andres": "",
  "Sebastian": "",
};

/**
 * Correos que aparecen PRE-SELECCIONADOS al crear una solicitud (para que la
 * entrega les llegue por defecto). El solicitante puede quitar o agregar más.
 */
export const DEFAULT_REQUESTER_EMAILS: string[] = [
  "angel.vaca@ganaplay.com",
  "roberto.andrade@ganaplay.com",
  "fernanda.monrroy@ganaplay.com",
];

/** Correos sugeridos (chips de un clic) al elegir destinatarios de la solicitud. */
export const SUGGESTED_REQUESTER_EMAILS: string[] = Array.from(
  new Set([
    ...DEFAULT_REQUESTER_EMAILS,
    ...Object.values(USER_DIRECTORY).filter(Boolean),
  ]),
);

/** Lista de operadores válidos — espejo del backend. "Quota" pasó a Comercial. */
export const OPERATOR_USERS = ["Juan"] as const;

/**
 * Lista de DIRECTIVOS válidos (Andres, Sebastian) — espejo del backend.
 * Internamente el rol se sigue llamando "administrative" por compatibilidad
 * con datos previos; el label visible en UI es "DIRECTIVOS".
 *
 * Roberto ya no está aquí: pasó a Ejecutivo Comercial, un perfil con menos
 * alcance (no ve las solicitudes del Trafficker). Dejarlo también como
 * DIRECTIVO habría sido una puerta trasera a lo que se le acaba de restringir.
 */
export const ADMINISTRATIVE_USERS = ["Andres", "Sebastian"] as const;

/** Ejecutivos comerciales — espejo del backend. */
export const EJECUTIVO_USERS = ["Roberto"] as const;

/** Correo asociado a un nombre de usuario (cadena vacía si no está registrado). */
export function emailForUser(name: string): string {
  return USER_DIRECTORY[name] || "";
}

/** URL pública de la aplicación, usada en los correos. */
export const APP_URL =
  (process.env.NEXT_PUBLIC_APP_URL || "").trim() ||
  "https://solicitudesgp.vercel.app";
