import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  type Role,
  emailDeIdToken,
  expectedPasswordFor,
  findByEmail,
  findByName,
  namesForRole,
  sharedPasswordsConfigured,
  verificarCredenciales,
} from "@/lib/team";

/**
 * Validación de acceso del lado del servidor.
 *
 * MÉTODO PRINCIPAL: correo corporativo + contraseña. El rol NUNCA lo elige el
 * cliente: sale del directorio de `src/lib/team.ts` a partir del correo.
 *
 * MÉTODO DE RESPALDO (el anterior, sigue funcionando): elegir un rol en la
 * pantalla de acceso y escribir la contraseña compartida de ese rol.
 *
 * Las contraseñas NO viven en el bundle del navegador NI como defaults en el
 * código fuente (que es público en GitHub). Se exigen como variables de
 * entorno; si faltan, el endpoint devuelve 500 con mensaje claro.
 *
 * Variables OBLIGATORIAS:
 *  - AUTH_PASS_TRAFFICKER  → acceso del Trafficker (rol admin)
 *  - AUTH_PASS_GENERAL     → el resto de perfiles
 *
 * Variable RECOMENDADA (si falta, Diseño usa AUTH_PASS_GENERAL):
 *  - AUTH_PASS_DESIGNER    → equipo de Diseño, separado del resto
 */

const DESIGNER_USERS = namesForRole("designer");
const OPERATOR_USERS = namesForRole("operator");
const ADMINISTRATIVE_USERS = ["Andres", "Sebastian"];
const EJECUTIVO_USERS = namesForRole("ejecutivo");

type AuthBody = {
  // Contraseña personal ya verificada por Firebase Auth: llega el idToken.
  idToken?: string;
  // Acceso corporativo por correo con la contraseña compartida.
  email?: string;
  // Compatibilidad: acceso por rol (método anterior, aún soportado).
  role?: Role;
  password?: string;
  designerName?: string;
  operatorName?: string;
  administrativeName?: string;
  ejecutivoName?: string;
};

/** Respuesta de sesión: rol, nombre y el correo con el que quedó identificado. */
function sesion(role: Role, userName: string, email: string) {
  return NextResponse.json({ ok: true, role, userName, email });
}

/** Contraseña compartida del rol elegido en el acceso de respaldo. */
function validaCompartida(role: Role, password: string): boolean {
  const esperada = expectedPasswordFor(role);
  return Boolean(esperada) && password === esperada;
}

export async function POST(req: Request) {
  try {
    // Rate limit: 15 intentos por IP por minuto. Suficiente para uso normal
    // (incluso si alguien teclea mal), bloquea brute force con 1 IP.
    const ip = getClientIp(req);
    const rl = checkRateLimit(`auth:${ip}`, { max: 15, windowMs: 60_000 });
    if (rl.limited) {
      return NextResponse.json(
        {
          ok: false,
          error: `Demasiados intentos. Espera ${Math.ceil(rl.resetInMs / 1000)}s antes de volver a intentar.`,
        },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetInMs / 1000)) } }
      );
    }

    // Fallar rápido si las passwords no están configuradas en Vercel/.env.local.
    // Antes había defaults en el código fuente público → riesgo eliminado.
    if (!sharedPasswordsConfigured) {
      console.error("[auth] Faltan AUTH_PASS_TRAFFICKER o AUTH_PASS_GENERAL en el entorno.");
      return NextResponse.json(
        { ok: false, error: "Servidor no configurado. Contacta al administrador." },
        { status: 500 }
      );
    }

    const {
      idToken, email, role, password,
      designerName, operatorName, administrativeName, ejecutivoName,
    }: AuthBody = await req.json();

    // ── Acceso con contraseña PERSONAL (Firebase Auth ya la validó) ──
    // El rol nunca viene del cliente: se resuelve aquí desde el correo que
    // Google confirma que es dueño de ese token.
    if (idToken) {
      const correo = await emailDeIdToken(idToken);
      if (!correo) {
        return NextResponse.json({ ok: false, error: "Sesión no válida. Vuelve a intentar." }, { status: 401 });
      }
      const entry = findByEmail(correo);
      if (!entry) {
        return NextResponse.json(
          { ok: false, error: "Tu cuenta no está dada de alta en el sistema. Pídeselo al Trafficker." },
          { status: 403 }
        );
      }
      // El rol sale del directorio, nunca de lo que pida el cliente. Si eligió
      // un perfil que no es el suyo, se rechaza en vez de colarlo en otro:
      // así una contraseña personal solo abre SU perfil.
      if (role && role !== entry.role) {
        return NextResponse.json(
          { ok: false, error: "Esa contraseña no corresponde al perfil seleccionado." },
          { status: 403 }
        );
      }
      return sesion(entry.role, entry.name, entry.email);
    }

    // ── ACCESO PRINCIPAL: correo corporativo + contraseña ──
    if (email) {
      if (!password) {
        return NextResponse.json({ ok: false, error: "Ingresa tu contraseña." }, { status: 400 });
      }
      const alta = findByEmail(email);
      if (alta && !expectedPasswordFor(alta.role)) {
        console.error(`[auth] Falta la contraseña configurada para el rol "${alta.role}".`);
        return NextResponse.json(
          { ok: false, error: "Ese perfil no tiene contraseña configurada. Contacta al administrador." },
          { status: 500 }
        );
      }
      const entry = verificarCredenciales(email, password);
      if (!entry) {
        // Mensaje genérico: no revelamos si el correo existe o no.
        return NextResponse.json({ ok: false, error: "Correo o contraseña incorrectos." }, { status: 401 });
      }
      return sesion(entry.role, entry.name, entry.email);
    }

    // ── ACCESO DE RESPALDO: elegir rol + contraseña compartida ──
    if (!role || !password) {
      return NextResponse.json({ ok: false, error: "Faltan datos de acceso." }, { status: 400 });
    }

    // Perfiles con nombre propio: hay que decir quién eres.
    const CON_NOMBRE: Partial<Record<Role, { elegido: string; validos: string[] }>> = {
      designer:       { elegido: designerName || "",       validos: DESIGNER_USERS },
      operator:       { elegido: operatorName || "",       validos: OPERATOR_USERS },
      administrative: { elegido: administrativeName || "", validos: ADMINISTRATIVE_USERS },
      ejecutivo:      { elegido: ejecutivoName || "",      validos: EJECUTIVO_USERS },
    };

    const conNombre = CON_NOMBRE[role];
    if (conNombre) {
      if (!conNombre.elegido || !conNombre.validos.includes(conNombre.elegido)) {
        return NextResponse.json({ ok: false, error: "Selecciona un nombre válido." }, { status: 400 });
      }
      if (!validaCompartida(role, password)) {
        return NextResponse.json({ ok: false, error: "Contraseña incorrecta." }, { status: 401 });
      }
      // El correo se recupera del directorio para que "Mi perfil" y el token del
      // agente de IA funcionen igual entrando por este camino.
      return sesion(role, conNombre.elegido, correoDeNombre(role, conNombre.elegido));
    }

    // Perfiles de nombre único (Trafficker, CM, Comercial).
    const NOMBRE_FIJO: Partial<Record<Role, string>> = {
      admin: "Trafficker",
      cm: "Community Manager",
      comercial: "Comercial",
    };
    const nombre = NOMBRE_FIJO[role];
    if (!nombre) {
      return NextResponse.json({ ok: false, error: "Rol no válido." }, { status: 400 });
    }
    if (!validaCompartida(role, password)) {
      return NextResponse.json({ ok: false, error: "Contraseña incorrecta." }, { status: 401 });
    }
    return sesion(role, nombre, correoDeNombre(role, nombre));
  } catch {
    return NextResponse.json(
      { ok: false, error: "Error procesando el acceso." },
      { status: 500 }
    );
  }
}

/**
 * Correo del directorio para un nombre visible dentro de un rol. Cadena vacía
 * si esa persona todavía no tiene correo corporativo dado de alta.
 */
function correoDeNombre(role: Role, name: string): string {
  const entry = findByName(name);
  return entry && entry.role === role ? entry.email : "";
}
