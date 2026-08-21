import { NextResponse } from "next/server";
import { firestoreConfigurado } from "@/lib/firestore-rest";
import { crearSolicitud, type IncomingRequest } from "@/lib/request-intake";

/**
 * Entrada de solicitudes desde aplicaciones externas de GanaPlay.
 *
 * La usa, por ejemplo, el Calendario Deportivo: cuando un trafficker registra
 * un evento y pide arte, esa app hace POST aquí y la solicitud aparece en el
 * tablero de GanaPlay Diseño igual que una creada a mano.
 *
 * La lógica de alta vive en `src/lib/request-intake.ts` porque el servidor MCP
 * (`/api/mcp`) crea las solicitudes del agente de IA exactamente igual.
 *
 * Seguridad: si REQUESTS_INTAKE_SECRET está definido, exige el header
 *   Authorization: Bearer <secreto>
 */

export const runtime = "nodejs";

const INTAKE_SECRET = process.env.REQUESTS_INTAKE_SECRET || "";

export async function POST(req: Request) {
  try {
    // ── Autenticación de integración externa ──
    if (INTAKE_SECRET) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${INTAKE_SECRET}`) {
        return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
      }
    }
    if (!firestoreConfigurado) {
      return NextResponse.json(
        { ok: false, error: "Firebase no configurado en el servidor." },
        { status: 500 },
      );
    }

    const body: IncomingRequest = await req.json().catch(() => ({}));
    if (!(body.title || "").trim()) {
      return NextResponse.json(
        { ok: false, error: "Falta el título de la solicitud." },
        { status: 400 },
      );
    }

    const { id } = await crearSolicitud(body);
    return NextResponse.json({ ok: true, id });
  } catch (error: unknown) {
    console.error("Error en /api/requests:", error);
    const message =
      error instanceof Error ? error.message : "Error interno al crear la solicitud.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
