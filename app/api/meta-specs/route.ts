import { NextResponse } from "next/server";
import { META_SPECS } from "@/lib/brand-context";

export const runtime = "nodejs";

/**
 * Endpoint de specs Meta Ads.
 *
 * Modo principal: devuelve la tabla de especificaciones documentadas en
 * src/lib/brand-context.ts (META_SPECS). Editable sin redeploy de prompt.
 *
 * Modo opcional: si hay credenciales de Meta API válidas, además adjunta
 *   - estado de conexión a la cuenta publicitaria
 *   - cuenta publicitaria detectada
 *   - última versión de la Graph API soportada por el token
 *
 * NUNCA crea campañas ni publica anuncios. Solo lectura/diagnóstico.
 */

type MetaIntegrationState =
  | { configured: false; reason: string }
  | { configured: true; accountId?: string; apiVersion: string; status: "ok" | "error"; details?: string };

async function probeMetaApi(): Promise<MetaIntegrationState> {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const accountId = process.env.META_AD_ACCOUNT_ID?.trim();
  const apiVersion = process.env.META_API_VERSION?.trim() || "v21.0";
  if (!token) {
    return { configured: false, reason: "META_ACCESS_TOKEN no configurado" };
  }
  try {
    // Llamada de salud (solo lectura: /me). No toca ninguna cuenta.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/me?access_token=${encodeURIComponent(token)}`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { configured: true, apiVersion, accountId, status: "error", details: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = await res.json();
    return { configured: true, apiVersion, accountId, status: "ok", details: data?.name ? `Cuenta: ${data.name}` : undefined };
  } catch (err) {
    return {
      configured: true,
      apiVersion,
      accountId,
      status: "error",
      details: err instanceof Error ? err.message : "error desconocido",
    };
  }
}

export async function GET() {
  const metaIntegration = await probeMetaApi();
  return NextResponse.json({
    specs: META_SPECS,
    metaIntegration,
    note:
      "Las specs declaradas en META_SPECS son la fuente de verdad para la IA. " +
      "Cuando Meta actualice formatos, editar src/lib/brand-context.ts y la IA usará la nueva versión sin redeploy del prompt.",
  });
}
