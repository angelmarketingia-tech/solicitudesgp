/**
 * Contraseña personal de cada persona, sobre Firebase Authentication.
 *
 * Antes solo existían contraseñas COMPARTIDAS por tipo de acceso (una para el
 * Trafficker y otra para el resto), guardadas como variables de entorno: nadie
 * podía cambiar la suya y quien conocía una entraba como cualquiera de ese
 * grupo. Aquí cada quien tiene la suya, la cambia cuando quiera y la recupera
 * por correo si la olvida.
 *
 * Convive con lo anterior en lugar de reemplazarlo de golpe: quien todavía no
 * ha creado la suya sigue entrando con la compartida. La primera vez que la
 * cambia, se le crea la cuenta personal con la nueva.
 *
 * El ROL no sale de aquí — lo sigue decidiendo el servidor a partir del correo
 * (`/api/auth`), para que nadie se auto-asigne un perfil.
 */
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase";

export const MIN_PASSWORD = 8;

export type AccountResult =
  | { ok: true; idToken?: string }
  | { ok: false; error: string; code?: string };

function codeOf(e: unknown): string {
  return e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
}

/** ¿El error significa "esta persona aún no tiene contraseña personal"? */
function sinCuenta(code: string): boolean {
  // Con la protección de enumeración de correos activada, Firebase devuelve
  // `invalid-credential` tanto si el usuario no existe como si la contraseña
  // es incorrecta. Por eso ambos casos caen al camino de la compartida.
  return code === "auth/user-not-found" || code === "auth/invalid-credential" || code === "auth/wrong-password";
}

export function mensajeDeError(code: string): string {
  switch (code) {
    case "auth/invalid-email": return "Ese correo no tiene un formato válido.";
    case "auth/weak-password": return `La contraseña es muy corta (mínimo ${MIN_PASSWORD} caracteres).`;
    case "auth/email-already-in-use": return "Ya existe una contraseña personal para este correo. Usa «Olvidé mi contraseña».";
    case "auth/too-many-requests": return "Demasiados intentos. Espera unos minutos.";
    case "auth/network-request-failed": return "Sin conexión con el servidor de acceso.";
    case "auth/operation-not-allowed": return "El acceso por correo no está habilitado en Firebase.";
    case "auth/requires-recent-login": return "Por seguridad, vuelve a entrar y reintenta el cambio.";
    default: return "No se pudo completar la operación de contraseña.";
  }
}

/**
 * Entra con la contraseña PERSONAL. Devuelve el idToken para que el servidor
 * verifique la identidad antes de entregar el rol.
 */
export async function entrarConPersonal(email: string, password: string): Promise<AccountResult> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return { ok: true, idToken: await cred.user.getIdToken() };
  } catch (e) {
    const code = codeOf(e);
    return { ok: false, code, error: sinCuenta(code) ? "sin-cuenta" : mensajeDeError(code) };
  }
}

/**
 * Cambia (o crea, la primera vez) la contraseña personal.
 *
 * `validarCompartida` prueba la contraseña actual contra el servidor: es lo que
 * permite crear la cuenta personal a quien todavía usa la compartida, sin que
 * un extraño pueda apropiarse de un correo del equipo.
 */
export async function cambiarPassword(
  email: string,
  actual: string,
  nueva: string,
  validarCompartida: (email: string, password: string) => Promise<boolean>,
): Promise<AccountResult> {
  const correo = email.trim();
  if (!correo) return { ok: false, error: "Tu perfil no tiene un correo corporativo asignado." };
  if (nueva.length < MIN_PASSWORD) return { ok: false, error: `La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
  if (nueva === actual) return { ok: false, error: "La nueva contraseña debe ser distinta de la actual." };

  // Caso 1: ya tiene contraseña personal → la cambiamos.
  try {
    const cred = await signInWithEmailAndPassword(auth, correo, actual);
    await updatePassword(cred.user, nueva);
    await signOut(auth).catch(() => { /* sin importancia */ });
    return { ok: true };
  } catch (e) {
    const code = codeOf(e);
    if (!sinCuenta(code)) return { ok: false, code, error: mensajeDeError(code) };
  }

  // Caso 2: todavía usa la compartida → la validamos y creamos su cuenta.
  const esValida = await validarCompartida(correo, actual);
  if (!esValida) return { ok: false, error: "La contraseña actual no es correcta." };
  try {
    await createUserWithEmailAndPassword(auth, correo, nueva);
    await signOut(auth).catch(() => { /* sin importancia */ });
    return { ok: true };
  } catch (e) {
    const code = codeOf(e);
    // Ya tenía contraseña personal, pero la "actual" que escribió no es esa
    // (escribió la compartida). Sin este aviso se quedaría atascado probando
    // una y otra vez.
    if (code === "auth/email-already-in-use") {
      return {
        ok: false, code,
        error: "Ya tienes una contraseña personal y la actual que escribiste no es esa. Si no la recuerdas, usa «Olvidé mi contraseña» en la pantalla de acceso.",
      };
    }
    return { ok: false, code, error: mensajeDeError(code) };
  }
}

/** Envía el correo de recuperación. */
export async function recuperarPassword(email: string): Promise<AccountResult> {
  const correo = email.trim();
  if (!correo) return { ok: false, error: "Escribe tu correo corporativo." };
  try {
    await sendPasswordResetEmail(auth, correo);
    return { ok: true };
  } catch (e) {
    const code = codeOf(e);
    // No revelamos si el correo existe: mismo mensaje en ambos casos.
    if (sinCuenta(code)) return { ok: true };
    return { ok: false, code, error: mensajeDeError(code) };
  }
}
