/**
 * Directorio corporativo del equipo — LADO SERVIDOR.
 *
 * Es la única fuente de verdad de "qué correo es quién y con qué permisos".
 * Lo usan el login (`/api/auth`) y el servidor MCP (`/api/mcp`), así que dar de
 * alta a alguien es tocar UN solo sitio.
 *
 * Este archivo NUNCA debe importarse desde componentes de cliente: contiene la
 * lógica de contraseñas y la derivación de tokens.
 */
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Roles del sistema.
 *
 *  - admin           → Trafficker. Acceso total + eliminación permanente.
 *  - cm              → Community Manager. Crea solicitudes, ve calendario.
 *  - comercial       → Equipo Comercial. Solo Promocionales y CMR.
 *  - ejecutivo       → Ejecutivo Comercial (Roberto). Crea y ve solicitudes,
 *                      Promocionales y CMR. NO ve las solicitudes levantadas
 *                      por el Trafficker ni el Centro de Diseño.
 *  - operator        → Operadores (Juan). Como CM pero sin ver lo del Trafficker.
 *  - administrative  → DIRECTIVOS (Andres, Sebastian). Label en UI: "DIRECTIVOS".
 *  - designer        → Diseñador. Centro de Diseño, entregables, IA Andromeda.
 */
export type Role =
  | "admin"
  | "cm"
  | "designer"
  | "operator"
  | "administrative"
  | "comercial"
  | "ejecutivo";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Trafficker",
  cm: "Community Manager",
  designer: "Diseñador",
  operator: "Operador",
  administrative: "Directivo",
  comercial: "Comercial",
  ejecutivo: "Ejecutivo Comercial",
};

export type DirectoryEntry = { role: Role; name: string; email: string };

/**
 * Correo → rol y nombre. Cada persona entra con SU correo corporativo.
 *
 * Se puede ampliar o corregir SIN desplegar código con la variable de entorno
 * AUTH_USERS (JSON): [{"email":"...","role":"designer","name":"..."}]
 */
const BUILTIN_DIRECTORY: DirectoryEntry[] = [
  { email: "angel.vaca@ganaplay.com",       role: "admin",          name: "Trafficker" },
  { email: "fernanda.monrroy@ganaplay.com", role: "cm",             name: "Community Manager" },
  { email: "david.gutierrez@ganaplay.com",  role: "designer",       name: "Juan David" },
  { email: "eliana.izquierdo@ganaplay.com", role: "designer",       name: "Eliana" },
  { email: "veronica.marquez@ganaplay.com", role: "designer",       name: "Verónica" },
  { email: "veronica@ganaplay.com",         role: "designer",       name: "Verónica" },
  // Caleb entra con los MISMOS permisos que el resto de Diseño.
  { email: "caleb.guevara@ganaplay.com",    role: "designer",       name: "Caleb" },
  // Roberto pasó de DIRECTIVOS a Ejecutivo Comercial: solicitudes (sin ver las
  // del Trafficker), Promocionales y CMR.
  { email: "roberto.andrade@ganaplay.com",  role: "ejecutivo",      name: "Roberto" },
  // OJO: el rol de Gabriela llegó sin especificar. Queda con el perfil de menor
  // alcance (Promocionales y CMR) hasta que se confirme. Para cambiarlo no hace
  // falta desplegar: basta agregarla a la variable AUTH_USERS.
  { email: "gabriela.martinez@ganaplay.com", role: "comercial",     name: "Gabriela" },
  { email: "comercial@ganaplay.com",        role: "comercial",      name: "Comercial" },
  { email: "juan.gutierrez@ganaplay.com",   role: "operator",       name: "Juan" },
];

function buildDirectory(): Map<string, DirectoryEntry> {
  const map = new Map<string, DirectoryEntry>();
  for (const u of BUILTIN_DIRECTORY) map.set(u.email.toLowerCase(), { ...u, email: u.email.toLowerCase() });
  try {
    const raw = process.env.AUTH_USERS;
    if (raw) {
      const arr = JSON.parse(raw) as { email?: string; role?: Role; name?: string }[];
      for (const u of arr) {
        if (u.email && u.role && u.name) {
          const email = u.email.toLowerCase().trim();
          map.set(email, { email, role: u.role, name: u.name });
        }
      }
    }
  } catch (e) {
    console.error("[team] AUTH_USERS mal formado (JSON inválido):", e);
  }
  return map;
}

const DIRECTORY = buildDirectory();

/** Busca a alguien por su correo corporativo. */
export function findByEmail(email: string): DirectoryEntry | null {
  return DIRECTORY.get(String(email || "").toLowerCase().trim()) || null;
}

/** Busca por nombre visible (el que usa el acceso por rol). */
export function findByName(name: string): DirectoryEntry | null {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  for (const entry of DIRECTORY.values()) {
    if (entry.name.toLowerCase() === n) return entry;
  }
  return null;
}

/** Nombres dados de alta con un rol concreto (para los menús del login). */
export function namesForRole(role: Role): string[] {
  const out: string[] = [];
  for (const entry of DIRECTORY.values()) {
    if (entry.role === role && !out.includes(entry.name)) out.push(entry.name);
  }
  return out;
}

// ─── Contraseñas compartidas por tipo de acceso ──────────────────────────────
const PASS_TRAFFICKER = process.env.AUTH_PASS_TRAFFICKER || "";
const PASS_GENERAL = process.env.AUTH_PASS_GENERAL || "";
const PASS_DESIGNER = process.env.AUTH_PASS_DESIGNER || "";

export const sharedPasswordsConfigured = Boolean(PASS_TRAFFICKER && PASS_GENERAL);

/** ¿Está ya separada la contraseña de Diseño de la general? */
export const designerPasswordIsolated = Boolean(PASS_DESIGNER);

/** Contraseña compartida que corresponde a cada rol. */
export function expectedPasswordFor(role: Role): string {
  if (role === "admin") return PASS_TRAFFICKER;
  if (role === "designer") {
    if (!PASS_DESIGNER) {
      console.warn(
        "[auth] AUTH_PASS_DESIGNER no está configurada: los diseñadores siguen " +
        "usando la contraseña general y cualquiera que la conozca puede entrar " +
        "como diseñador. Defínela en Vercel para cerrar el acceso."
      );
      return PASS_GENERAL;
    }
    return PASS_DESIGNER;
  }
  return PASS_GENERAL;
}

/**
 * Comprueba correo + contraseña compartida y devuelve a la persona.
 * `null` si el correo no está dado de alta o la contraseña no coincide.
 */
export function verificarCredenciales(email: string, password: string): DirectoryEntry | null {
  const entry = findByEmail(email);
  if (!entry) return null;
  const esperada = expectedPasswordFor(entry.role);
  if (!esperada || password !== esperada) return null;
  return entry;
}

/**
 * Verifica un idToken de Firebase Auth contra Google y devuelve el correo real
 * del usuario. Sin esto, el cliente podría decir "soy fulano" y llevarse su rol.
 * Se usa el endpoint público de Identity Toolkit porque el proyecto no tiene
 * Admin SDK ni service account.
 */
export async function emailDeIdToken(idToken: string): Promise<string | null> {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { users?: { email?: string }[] };
    return data.users?.[0]?.email?.toLowerCase().trim() || null;
  } catch (e) {
    console.error("[auth] no se pudo verificar el idToken:", e);
    return null;
  }
}

// ─── Token del agente de IA (MCP) ────────────────────────────────────────────
/**
 * Cada persona tiene un token propio para conectar su agente de IA. Se DERIVA
 * de su correo con un secreto del servidor en vez de guardarse en la base:
 * así no hay tabla de tokens que mantener, el token identifica a su dueño (las
 * solicitudes que cree el agente salen a su nombre) y se revocan todos de golpe
 * rotando el secreto.
 *
 * MCP_TOKEN_SECRET es lo recomendable. Si no está definida se derivan de las
 * contraseñas compartidas, para que la función exista sin configurar nada más.
 */
const MCP_SECRET =
  (process.env.MCP_TOKEN_SECRET || "").trim() ||
  `${PASS_TRAFFICKER}|${PASS_GENERAL}`;

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function firma(email: string): string {
  return createHmac("sha256", MCP_SECRET).update(email.toLowerCase().trim()).digest("hex").slice(0, 40);
}

/** Token MCP de una persona. Devuelve "" si el correo no está dado de alta. */
export function mcpTokenFor(email: string): string {
  const entry = findByEmail(email);
  if (!entry || !MCP_SECRET.replace(/\|/g, "")) return "";
  return `gpmcp_${b64url(entry.email)}_${firma(entry.email)}`;
}

/** Valida un token MCP y devuelve a su dueño, o null si no es válido. */
export function verifyMcpToken(token: string): DirectoryEntry | null {
  const t = String(token || "").trim();
  if (!t.startsWith("gpmcp_")) return null;
  const partes = t.slice("gpmcp_".length).split("_");
  if (partes.length !== 2) return null;
  let email = "";
  try {
    email = Buffer.from(partes[0], "base64url").toString("utf8");
  } catch {
    return null;
  }
  const entry = findByEmail(email);
  if (!entry) return null;
  const esperada = Buffer.from(firma(entry.email));
  const recibida = Buffer.from(partes[1]);
  if (esperada.length !== recibida.length) return null;
  return timingSafeEqual(esperada, recibida) ? entry : null;
}

// ─── Visibilidad de solicitudes ──────────────────────────────────────────────
/**
 * ¿Este perfil tiene vetadas las solicitudes que levanta el Trafficker?
 *
 * El Operador y el Ejecutivo Comercial trabajan su propio flujo y no deben ver
 * la pauta que pide el Trafficker.
 */
export function ocultaSolicitudesDelTrafficker(role: Role): boolean {
  return role === "operator" || role === "ejecutivo";
}

/**
 * ¿La solicitud la levantó el Trafficker?
 *
 * `requesterName` es texto libre y en los datos reales aparece de mil formas
 * ("Trafficker", "TRAFFCIKER", "Angel", "angel "…). Por eso se normaliza y se
 * aceptan las variantes mal escritas — espejo de la misma función en el cliente.
 */
export function esSolicitudDelTrafficker(req: { requesterName?: string }): boolean {
  const n = (req.requesterName || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, "");
  if (!n) return false;
  return n.startsWith("traf") || n.startsWith("tarf") || n.includes("angel");
}
