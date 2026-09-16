/**
 * Servidor MCP de GanaPlay Diseño — dirección principal.
 *
 * Aquí el token va en la cabecera `Authorization: Bearer <token>`, que es lo
 * que manda la especificación y lo que usan Claude Code y la API.
 *
 * Los clientes que solo admiten una URL —los "conectores" de claude.ai y de
 * Claude Desktop— tienen su propia entrada en `/api/mcp/t/<token>`.
 *
 * Toda la lógica está en `@/lib/mcp` para que las dos direcciones sean, sin
 * lugar a dudas, el MISMO servidor.
 */
import { getMcp, opcionesMcp, responderMcp } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return opcionesMcp();
}

export function GET() {
  return getMcp();
}

export async function POST(req: Request) {
  // `?token=` se admite como último recurso, para un cliente que no deje poner
  // cabeceras NI aceptar la ruta con el token dentro.
  let deLaUrl = "";
  try {
    deLaUrl = new URL(req.url).searchParams.get("token") || "";
  } catch { /* URL rara: se sigue con la cabecera */ }
  return responderMcp(req, deLaUrl);
}
