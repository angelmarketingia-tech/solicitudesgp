import {
  type DirectoryEntry,
  esSolicitudDelTrafficker,
  ocultaSolicitudesDelTrafficker,
  ROLE_LABELS,
  verifyMcpToken,
} from "@/lib/team";
import { firestoreConfigurado, getDoc, listDocs } from "@/lib/firestore-rest";
import { crearSolicitud, VALID_AREAS, VALID_KINDS, VALID_PRIORITIES } from "@/lib/request-intake";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Servidor MCP de GanaPlay Diseño.
 *
 * Deja que el agente de IA de cada persona (Claude u otro cliente compatible)
 * levante y consulte solicitudes sin abrir la plataforma. Se conecta con la URL
 * de este endpoint y el token personal que cada quien copia desde "Mi perfil".
 *
 * IDENTIDAD Y PERMISOS: el token identifica a su dueño, así que las solicitudes
 * que crea el agente salen a NOMBRE de esa persona, y lo que puede consultar es
 * exactamente lo que vería en pantalla (el Ejecutivo Comercial y el Operador no
 * ven las solicitudes del Trafficker tampoco por aquí).
 *
 * Habla JSON-RPC 2.0 sobre HTTP POST — el transporte "Streamable HTTP" de MCP,
 * en su forma de respuesta simple. No se necesita ninguna librería extra.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "ganaplay-diseno", version: "1.0.0" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

// ─── JSON-RPC ────────────────────────────────────────────────────────────────
type RpcId = string | number | null;

function ok(id: RpcId, result: unknown, status = 200) {
  return Response.json({ jsonrpc: "2.0", id, result }, { status, headers: CORS });
}

function rpcError(id: RpcId, code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status, headers: CORS });
}

/** Resultado de una herramienta: texto plano para que el modelo lo lea. */
function texto(contenido: string, esError = false) {
  return { content: [{ type: "text", text: contenido }], isError: esError };
}

// ─── Definición de las herramientas ──────────────────────────────────────────
const TOOLS = [
  {
    name: "crear_solicitud",
    title: "Crear solicitud de diseño",
    description:
      "Levanta una solicitud de diseño en el tablero de GanaPlay. Queda en estado " +
      "Pendiente, a nombre de quien conectó el agente, y el equipo de Diseño recibe " +
      "el aviso. Pregunta lo que falte antes de llamar: el título y la fecha de " +
      "entrega son lo que más se usa para priorizar.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Qué se pide, en una línea. Obligatorio." },
        copy: { type: "string", description: "Texto que debe llevar la pieza." },
        objetivo: { type: "string", description: "Para qué es la pieza / qué debe conseguir." },
        fechaEntrega: { type: "string", description: "Fecha de entrega en formato AAAA-MM-DD. Por defecto, hoy." },
        prioridad: { type: "string", enum: [...VALID_PRIORITIES], description: "Bajo, Medio, Alto o Urgente. Por defecto Medio." },
        area: { type: "string", enum: [...VALID_AREAS], description: "Área que la pide. Por defecto Pauta." },
        tipo: { type: "string", enum: [...VALID_KINDS], description: "Tipo de solicitud creativa." },
        formato: { type: "string", description: "Formato de la pieza (por ejemplo static, video, gif)." },
        dimensiones: { type: "array", items: { type: "string" }, description: "Medidas o formatos pedidos, p. ej. [\"1080x1080\"]." },
        paises: { type: "array", items: { type: "string" }, description: "Países destino. Por defecto Internacional." },
        canales: { type: "array", items: { type: "string" }, description: "Canales donde se publicará." },
      },
      required: ["titulo"],
    },
  },
  {
    name: "listar_solicitudes",
    title: "Listar solicitudes",
    description:
      "Devuelve las solicitudes del tablero que esta persona puede ver, de la más " +
      "próxima a entregar a la más lejana. Se puede filtrar por estado, prioridad, " +
      "área o texto libre.",
    inputSchema: {
      type: "object",
      properties: {
        estado: { type: "string", description: "Pendiente, Planeando, En Proceso, Publicado, Denegado o Declinada." },
        prioridad: { type: "string", enum: [...VALID_PRIORITIES] },
        area: { type: "string", enum: [...VALID_AREAS] },
        buscar: { type: "string", description: "Texto a buscar en el título o en quien la pidió." },
        soloMias: { type: "boolean", description: "Solo las solicitudes levantadas por esta persona." },
        limite: { type: "number", description: "Cuántas devolver como máximo (por defecto 25, tope 100)." },
      },
    },
  },
  {
    name: "ver_solicitud",
    title: "Ver una solicitud",
    description: "Ficha completa de una solicitud por su identificador (por ejemplo GP6740).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Identificador de la solicitud, p. ej. GP6740." } },
      required: ["id"],
    },
  },
  {
    name: "resumen_tablero",
    title: "Resumen del tablero",
    description:
      "Cuántas solicitudes hay en cada estado, cuántas vencen hoy y cuántas están " +
      "atrasadas. Útil para arrancar el día.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "quien_soy",
    title: "Quién soy",
    description: "Con qué cuenta y permisos está conectado el agente. Sirve para comprobar la conexión.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

// ─── Lectura del tablero ─────────────────────────────────────────────────────
type Solicitud = {
  id: string;
  title: string;
  status: string;
  priority: string;
  area: string;
  deliveryDate: string;
  requestDate: string;
  requesterName: string;
  requesterEmail: string;
  assignedTo: string;
};

const CAMPOS_LISTA = [
  "title", "status", "priority", "area", "deliveryDate", "requestDate",
  "requesterName", "requesterEmail", "assignedTo", "board",
];

function comoSolicitud(id: string, d: Record<string, unknown>): Solicitud {
  const s = (k: string) => String(d[k] ?? "");
  return {
    id,
    title: s("title"),
    status: s("status"),
    priority: s("priority"),
    area: s("area"),
    deliveryDate: s("deliveryDate"),
    requestDate: s("requestDate"),
    requesterName: s("requesterName"),
    requesterEmail: s("requesterEmail"),
    assignedTo: s("assignedTo"),
  };
}

/**
 * Solicitudes visibles para esta persona.
 *
 * Se descartan los documentos con `board`: los módulos de Influencers,
 * Promocionales y CMR viven en la misma colección y no son solicitudes.
 */
async function solicitudesVisibles(quien: DirectoryEntry): Promise<Solicitud[]> {
  const docs = await listDocs("requests", { campos: CAMPOS_LISTA });
  const lista = docs
    .filter(({ data }) => !data.board)
    .map(({ id, data }) => comoSolicitud(id, data));
  const filtrada = ocultaSolicitudesDelTrafficker(quien.role)
    ? lista.filter(r => !esSolicitudDelTrafficker(r))
    : lista;
  return filtrada.sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""));
}

/** ¿Este perfil trabaja con el tablero de solicitudes? */
function veElTablero(quien: DirectoryEntry): boolean {
  return quien.role !== "comercial";
}

const SIN_TABLERO =
  "Tu perfil no trabaja con el tablero de solicitudes: solo con Promocionales y CMR. " +
  "Puedes crear solicitudes, pero no consultarlas desde aquí.";

// ─── Herramientas ────────────────────────────────────────────────────────────
type Args = Record<string, unknown>;

const str = (a: Args, k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
const arr = (a: Args, k: string) =>
  Array.isArray(a[k]) ? (a[k] as unknown[]).map(String).filter(Boolean) : undefined;

async function ejecutarHerramienta(nombre: string, args: Args, quien: DirectoryEntry) {
  if (nombre === "quien_soy") {
    return texto(
      [
        `Conectado como ${quien.name} (${quien.email}).`,
        `Perfil: ${ROLE_LABELS[quien.role]}.`,
        veElTablero(quien)
          ? `Puede crear y consultar solicitudes${ocultaSolicitudesDelTrafficker(quien.role) ? ", salvo las levantadas por el Trafficker." : "."}`
          : "Puede crear solicitudes, pero no consultar el tablero.",
      ].join("\n"),
    );
  }

  if (!firestoreConfigurado) {
    return texto("La base de datos no está configurada en el servidor. Avisa al Trafficker.", true);
  }

  if (nombre === "crear_solicitud") {
    const titulo = str(args, "titulo");
    if (!titulo) return texto("Falta el título de la solicitud.", true);
    const creada = await crearSolicitud(
      {
        title: titulo,
        copy: str(args, "copy"),
        objective: str(args, "objetivo"),
        deliveryDate: str(args, "fechaEntrega"),
        priority: str(args, "prioridad"),
        area: str(args, "area"),
        requestKind: str(args, "tipo"),
        format: str(args, "formato"),
        dimensions: arr(args, "dimensiones"),
        countries: arr(args, "paises"),
        channels: arr(args, "canales"),
        // La identidad sale del token, nunca de lo que diga el agente.
        requesterName: quien.name,
        requesterEmail: quien.email,
        source: `agente de IA de ${quien.name}`,
      },
    );
    return texto(
      `Solicitud ${creada.id} creada a nombre de ${quien.name}.\n` +
      `Título: ${creada.title}\nEntrega: ${creada.deliveryDate}\nPrioridad: ${creada.priority}\n` +
      `Estado: Pendiente. El equipo de Diseño ya tiene el aviso.`,
    );
  }

  if (!veElTablero(quien)) return texto(SIN_TABLERO, true);

  if (nombre === "listar_solicitudes") {
    const todas = await solicitudesVisibles(quien);
    const estado = str(args, "estado").toLowerCase();
    const prioridad = str(args, "prioridad").toLowerCase();
    const area = str(args, "area").toLowerCase();
    const buscar = str(args, "buscar").toLowerCase();
    const soloMias = args.soloMias === true;
    const limite = Math.min(Math.max(Number(args.limite) || 25, 1), 100);

    const filtradas = todas.filter(r => {
      if (estado && r.status.toLowerCase() !== estado) return false;
      if (prioridad && r.priority.toLowerCase() !== prioridad) return false;
      if (area && r.area.toLowerCase() !== area) return false;
      if (soloMias && r.requesterEmail.toLowerCase() !== quien.email) return false;
      if (buscar && !`${r.title} ${r.requesterName}`.toLowerCase().includes(buscar)) return false;
      return true;
    });

    if (filtradas.length === 0) return texto("No hay solicitudes que coincidan con esos filtros.");

    const lineas = filtradas.slice(0, limite).map(r =>
      `${r.id} · ${r.title} — ${r.status} · ${r.priority} · ${r.area} · entrega ${r.deliveryDate || "sin fecha"}` +
      ` · pide ${r.requesterName || "—"}${r.assignedTo ? ` · asignada a ${r.assignedTo}` : ""}`,
    );
    const extra = filtradas.length > limite ? `\n… y ${filtradas.length - limite} más.` : "";
    return texto(`${filtradas.length} solicitud(es):\n${lineas.join("\n")}${extra}`);
  }

  if (nombre === "ver_solicitud") {
    const id = str(args, "id").toUpperCase();
    if (!id) return texto("Falta el identificador de la solicitud.", true);
    const doc = await getDoc("requests", id, [
      ...CAMPOS_LISTA, "copy", "objective", "format", "dimensions", "countries",
      "channels", "requestKind", "comments",
    ]);
    if (!doc || doc.board) return texto(`No existe la solicitud ${id}.`, true);
    const r = comoSolicitud(id, doc);
    if (ocultaSolicitudesDelTrafficker(quien.role) && esSolicitudDelTrafficker(r)) {
      return texto(`No tienes acceso a la solicitud ${id}.`, true);
    }
    const lista = (v: unknown) => (Array.isArray(v) ? v.map(String).join(", ") : "");
    return texto(
      [
        `${r.id} — ${r.title}`,
        `Estado: ${r.status} · Prioridad: ${r.priority} · Área: ${r.area}`,
        `Pedida por ${r.requesterName || "—"} el ${r.requestDate || "—"} · Entrega ${r.deliveryDate || "sin fecha"}`,
        r.assignedTo ? `Asignada a: ${r.assignedTo}` : "Sin asignar",
        doc.requestKind ? `Tipo: ${doc.requestKind}` : "",
        doc.format ? `Formato: ${doc.format}` : "",
        lista(doc.dimensions) ? `Dimensiones: ${lista(doc.dimensions)}` : "",
        lista(doc.countries) ? `Países: ${lista(doc.countries)}` : "",
        lista(doc.channels) ? `Canales: ${lista(doc.channels)}` : "",
        doc.objective ? `\nObjetivo:\n${doc.objective}` : "",
        doc.copy ? `\nCopy:\n${doc.copy}` : "",
      ].filter(Boolean).join("\n"),
    );
  }

  if (nombre === "resumen_tablero") {
    const todas = await solicitudesVisibles(quien);
    const hoy = new Date().toISOString().slice(0, 10);
    const porEstado = new Map<string, number>();
    let vencenHoy = 0;
    let atrasadas = 0;
    for (const r of todas) {
      porEstado.set(r.status || "Sin estado", (porEstado.get(r.status || "Sin estado") || 0) + 1);
      const cerrada = r.status === "Publicado" || r.status === "Denegado" || r.status === "Declinada";
      if (cerrada || !r.deliveryDate) continue;
      if (r.deliveryDate === hoy) vencenHoy++;
      else if (r.deliveryDate < hoy) atrasadas++;
    }
    const estados = [...porEstado.entries()].map(([k, v]) => `  ${k}: ${v}`).join("\n");
    return texto(
      `Tablero de ${quien.name} — ${todas.length} solicitudes visibles.\n${estados}\n\n` +
      `Vencen hoy: ${vencenHoy}\nAtrasadas: ${atrasadas}`,
    );
  }

  return texto(`No conozco la herramienta "${nombre}".`, true);
}

// ─── Transporte ──────────────────────────────────────────────────────────────
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * Este servidor no abre canal de eventos: responde cada petición al momento.
 * El propio protocolo contempla contestar 405 al GET en ese caso.
 */
export async function GET() {
  return new Response("Este servidor MCP solo acepta POST.", { status: 405, headers: CORS });
}

export async function POST(req: Request) {
  let cuerpo: { jsonrpc?: string; id?: RpcId; method?: string; params?: Args };
  try {
    cuerpo = await req.json();
  } catch {
    return rpcError(null, -32700, "JSON mal formado.", 400);
  }

  const id: RpcId = cuerpo.id ?? null;
  const method = cuerpo.method || "";
  const esNotificacion = cuerpo.id === undefined || cuerpo.id === null;

  // `initialize` y las notificaciones de arranque no necesitan credenciales:
  // así el cliente puede describir el servidor antes de pedir nada real.
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions:
        "Solicitudes de diseño de GanaPlay. Usa `listar_solicitudes` y `ver_solicitud` " +
        "para consultar el tablero, y `crear_solicitud` para levantar una nueva. " +
        "Antes de crear, confirma con la persona el título y la fecha de entrega.",
    });
  }
  if (method.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: CORS });
  }
  if (method === "ping") return ok(id, {});

  // ── A partir de aquí hace falta el token personal ──
  const ip = getClientIp(req);
  const rl = checkRateLimit(`mcp:${ip}`, { max: 120, windowMs: 60_000 });
  if (rl.limited) {
    return rpcError(id, -32000, `Demasiadas peticiones. Espera ${Math.ceil(rl.resetInMs / 1000)}s.`, 429);
  }

  const cabecera = req.headers.get("authorization") || "";
  const quien = verifyMcpToken(cabecera.replace(/^Bearer\s+/i, ""));
  if (!quien) {
    return rpcError(
      id,
      -32001,
      "Token no válido. Cópialo de nuevo desde «Mi perfil → Conectar mi agente de IA» en la plataforma.",
      401,
    );
  }

  if (method === "tools/list") return ok(id, { tools: TOOLS });

  if (method === "tools/call") {
    const nombre = String(cuerpo.params?.name || "");
    const args = (cuerpo.params?.arguments as Args) || {};
    try {
      return ok(id, await ejecutarHerramienta(nombre, args, quien));
    } catch (e) {
      console.error(`[mcp] fallo en la herramienta "${nombre}":`, e);
      const mensaje = e instanceof Error ? e.message : "error desconocido";
      return ok(id, texto(`No se pudo completar la operación: ${mensaje}`, true));
    }
  }

  if (esNotificacion) return new Response(null, { status: 202, headers: CORS });
  return rpcError(id, -32601, `Método no soportado: ${method}`);
}
