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
  "Juan David": "",        // TODO: completar correo del diseñador
  "Eliana": "",            // TODO: completar correo del diseñador
  "Verónica": "",          // TODO: completar correo del diseñador
  "Caleb": "",             // TODO: completar correo del diseñador
  "Roberto": "",           // TODO: completar correo del operador
  "Quota": "",             // TODO: completar correo del operador
  "Juan": "",              // TODO: completar correo del operador
  "Andres": "",            // TODO: completar correo del administrativo
  "Sebastian": "",         // TODO: completar correo del administrativo
};

/** Lista de operadores válidos (Roberto, Quota, Juan) — espejo del backend. */
export const OPERATOR_USERS = ["Roberto", "Quota", "Juan"] as const;

/** Lista de administrativos válidos (Andres, Sebastian) — espejo del backend. */
export const ADMINISTRATIVE_USERS = ["Andres", "Sebastian"] as const;

/** Correo asociado a un nombre de usuario (cadena vacía si no está registrado). */
export function emailForUser(name: string): string {
  return USER_DIRECTORY[name] || "";
}

/** URL pública de la aplicación, usada en los correos. */
export const APP_URL =
  (process.env.NEXT_PUBLIC_APP_URL || "").trim() ||
  "https://solicitudesgp.vercel.app";
