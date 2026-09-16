/**
 * Servidor MCP con el token dentro de la dirección.
 *
 * POR QUÉ EXISTE: los "conectores" de claude.ai y de Claude Desktop solo piden
 * una URL — no hay dónde escribir una cabecera. Sin esta entrada, conectar un
 * agente desde ahí exigiría montar OAuth entero.
 *
 * QUÉ TENER EN CUENTA: una dirección con el token dentro se queda en los
 * registros del servidor y en el historial del navegador, así que NO es la vía
 * recomendada. Quien pueda poner cabeceras —Claude Code y la API— debe usar
 * `/api/mcp` con `Authorization: Bearer`. Es el mismo servidor y los mismos
 * permisos; cambia solo por dónde entra la credencial.
 *
 * Si un enlace de estos se filtra, se corta igual que cualquier token: cambiando
 * `MCP_TOKEN_SECRET` en el servidor.
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

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return responderMcp(req, decodeURIComponent(token || ""));
}
