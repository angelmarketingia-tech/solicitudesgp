import { NextResponse } from "next/server";
import { sendEmail, brandEmail, ctaButton, designTeamEmails } from "@/lib/email";
import { APP_URL } from "@/lib/users";

/**
 * Alertas por correo del sistema de solicitudes.
 *
 * Reglas de negocio:
 *  - type "new_request": solo se envía cuando la prioridad es Alto o Urgente.
 *    Destinatarios: equipo de diseño / responsable (DESIGN_TEAM_EMAILS).
 *  - type "delivery": se envía SIEMPRE que el diseñador entrega una pieza.
 *    Destinatario: el correo del solicitante.
 *
 * Si el correo falla o no está configurado, NO se bloquea el flujo: se devuelve
 * { ok:false, error } y la aplicación lo muestra como aviso no crítico.
 */

type NewRequestPayload = {
  type: "new_request";
  request: {
    id: string;
    title: string;
    priority: string;
    deliveryDate: string;
    area?: string;
    objective?: string;
    copy?: string;
    requesterName?: string;
  };
};

type DeliveryPayload = {
  type: "delivery";
  to: string;
  designer: string;
  pieceType: string;
  requesterName?: string;
  deliveryDate?: string;
  request: { id: string; title: string; status?: string };
};

type DeclinePayload = {
  type: "decline";
  to: string;
  declinedBy: string;
  reason: string;
  comment?: string;
  requesterName?: string;
  request: { id: string; title: string; status?: string };
};

type NotifyPayload = NewRequestPayload | DeliveryPayload | DeclinePayload;

const row = (label: string, value: string) =>
  `<p style="margin:0 0 8px;font-size:14px;color:#333333;">
     <strong style="color:#6d6e71;">${label}:</strong> ${value || "—"}
   </p>`;

export async function POST(req: Request) {
  try {
    const payload: NotifyPayload = await req.json();

    if (!payload || !payload.type) {
      return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    }

    // ── Nueva solicitud de prioridad alta/urgente ──
    if (payload.type === "new_request") {
      const r = payload.request;
      const priority = (r.priority || "").toLowerCase();
      if (priority !== "alto" && priority !== "urgente") {
        // Regla: prioridad baja/media NO envía correo inmediato.
        return NextResponse.json({ ok: true, skipped: true, reason: "Prioridad sin alerta inmediata." });
      }
      const recipients = designTeamEmails();
      if (recipients.length === 0) {
        console.warn("[notify] new_request sin DESIGN_TEAM_EMAILS configurado.");
        return NextResponse.json({
          ok: false,
          error: "Sin destinatarios: configura DESIGN_TEAM_EMAILS.",
        });
      }
      const html = brandEmail({
        label: `Nueva solicitud · Prioridad ${r.priority}`,
        heading: `🎨 Nueva solicitud de diseño: ${r.id}`,
        bodyHtml:
          row("Título", r.title) +
          row("Prioridad", r.priority) +
          row("Área solicitante", r.area || "") +
          row("Solicitante", r.requesterName || "") +
          row("Objetivo", r.objective || "") +
          row("Instrucción", r.copy || "") +
          row("Fecha de entrega", r.deliveryDate) +
          `<p style="margin:18px 0 0;font-size:13px;color:#6d6e71;">
             Ingresa al tablero de GanaPlay Diseño para gestionar esta solicitud.
           </p>`,
      });
      const result = await sendEmail({
        to: recipients,
        subject: `[GanaPlay Diseño] ${r.priority.toUpperCase()} · ${r.id} ${r.title}`,
        html,
      });
      console.log(`[notify] new_request ${r.id} → ${recipients.length} destinatario(s):`, result.ok ? "enviado" : result.error);
      return NextResponse.json(result, { status: result.ok ? 200 : 200 });
    }

    // ── Entrega de pieza al solicitante ──
    if (payload.type === "delivery") {
      const { to, request: r, designer, pieceType, requesterName, deliveryDate } = payload;
      if (!to) {
        return NextResponse.json({ ok: false, error: "Falta el correo del solicitante." });
      }
      // Asunto predeterminado (configurable con EMAIL_SUBJECT_DELIVERY).
      const subjectTemplate =
        process.env.EMAIL_SUBJECT_DELIVERY ||
        "Tu solicitud de diseño ya fue entregada - {titulo}";
      const subject = subjectTemplate.replace("{titulo}", r.title);

      const html = brandEmail({
        label: "Entrega de diseño",
        heading: `✅ ${requesterName ? requesterName + ", tu" : "Tu"} solicitud ya fue entregada`,
        bodyHtml:
          row("Solicitante", requesterName || "—") +
          row("Solicitud", `${r.id} — ${r.title}`) +
          row("Estado", r.status || "Entregada") +
          row("Pieza entregada", pieceType) +
          row("Diseñador", designer) +
          row("Fecha de entrega", deliveryDate || new Date().toISOString().split("T")[0]) +
          `<p style="margin:18px 0 4px;font-size:13px;color:#6d6e71;">
             Ingresa al sistema para revisar y descargar el entregable:
           </p>` +
          ctaButton("Ver y descargar la solicitud", `${APP_URL}`),
      });
      const result = await sendEmail({ to: [to], subject, html });
      console.log(`[notify] delivery ${r.id} → ${to}:`, result.ok ? "enviado" : result.error);
      return NextResponse.json(result);
    }

    // ── Declinación de solicitud (avisa al solicitante) ──
    if (payload.type === "decline") {
      const { to, request: r, declinedBy, reason, comment, requesterName } = payload;
      if (!to) {
        return NextResponse.json({ ok: false, error: "Falta el correo del solicitante." });
      }
      const subject = `[GanaPlay Diseño] Solicitud ${r.id} declinada — ${r.title}`;
      const html = brandEmail({
        label: "Solicitud declinada",
        heading: `🚫 ${requesterName ? requesterName + ", tu" : "Tu"} solicitud fue declinada`,
        bodyHtml:
          row("Solicitud", `${r.id} — ${r.title}`) +
          row("Motivo", reason) +
          (comment ? row("Comentario", comment) : "") +
          row("Declinada por", declinedBy) +
          row("Fecha", new Date().toLocaleString("es-ES")) +
          `<p style="margin:18px 0 4px;font-size:13px;color:#6d6e71;">
             Si crees que es un error, contacta al equipo. Podés crear una nueva solicitud corrigiendo los puntos señalados.
           </p>` +
          ctaButton("Ir a GanaPlay Diseño", `${APP_URL}`),
      });
      const result = await sendEmail({ to: [to], subject, html });
      console.log(`[notify] decline ${r.id} → ${to}:`, result.ok ? "enviado" : result.error);
      return NextResponse.json(result);
    }

    return NextResponse.json({ ok: false, error: "Tipo de notificación no soportado." }, { status: 400 });
  } catch (error: unknown) {
    console.error("Error en /api/notify:", error);
    const message = error instanceof Error ? error.message : "Error interno al enviar el correo.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
