/**
 * Capa de envío de correo — Resend (vía API REST, sin dependencias extra).
 *
 * Variables de entorno requeridas:
 *  - RESEND_API_KEY        → API key de Resend
 *  - EMAIL_FROM            → remitente verificado, p.ej. "GanaPlay Diseño <noreply@ganaplay.com>"
 *  - DESIGN_TEAM_EMAILS    → correos del equipo de diseño/responsable (separados por coma)
 *
 * Si las variables no están configuradas, sendEmail devuelve { ok:false, skipped:true }
 * para NO bloquear el flujo principal de la aplicación.
 */

export type EmailResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  id?: string;
};

type SendArgs = {
  to: string[];
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendArgs): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    return {
      ok: false,
      skipped: true,
      error: "Email no configurado (faltan RESEND_API_KEY o EMAIL_FROM).",
    };
  }

  const recipients = Array.from(new Set(to.filter(Boolean)));
  if (recipients.length === 0) {
    return { ok: false, error: "No hay destinatarios válidos." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    });
    const data = await res.json().catch(() => ({}));

    // Cuota diaria del plan gratuito (100 correos/día, y OJO: cada
    // destinatario cuenta como uno). Resend la devuelve como un 429 con
    // `daily_quota_exceeded`, pero antes se mostraba el mensaje genérico
    // "revisa la configuración de email": quien lo leía se iba a mirar
    // variables de entorno que estaban perfectas. Se dice lo que pasa y
    // cuándo se arregla solo.
    const cuotaAgotada =
      res.status === 429 &&
      /daily_quota|quota/i.test(`${data?.name || ""} ${data?.message || ""}`);
    if (cuotaAgotada) {
      console.warn("[email] cuota diaria de Resend agotada:", data?.message || "");
      return {
        ok: false,
        error:
          "Se agotó la cuota diaria de correos. Se reinicia a medianoche UTC " +
          "(19:00 en Colombia). La solicitud se guardó igual: solo no salió el aviso.",
      };
    }

    // En el plan gratuito Resend informa cuánto queda en una cabecera. Queda
    // en el registro del servidor para ver venir el tope antes de chocar.
    const restante = res.headers.get("x-resend-daily-quota");
    if (restante) console.log(`[email] cuota diaria restante: ${restante}`);

    if (!res.ok) {
      return { ok: false, error: data?.message || `Resend respondió ${res.status}.` };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error de red al enviar el correo.",
    };
  }
}

/** Plantilla HTML con la marca GanaPlay (verde corporativo). */
export function brandEmail(opts: { label: string; heading: string; bodyHtml: string }): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f3f5f4;">
  <div style="font-family:Arial,Helvetica,sans-serif;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e6e3;">
      <div style="background:#00783e;padding:22px 28px;">
        <div style="color:#ffffff;font-size:18px;font-weight:bold;">GanaPlay Diseño</div>
        <div style="color:#bfe0ce;font-size:12px;margin-top:2px;">${opts.label}</div>
      </div>
      <div style="padding:28px;">
        <h1 style="font-size:18px;color:#333333;margin:0 0 16px;">${opts.heading}</h1>
        ${opts.bodyHtml}
      </div>
      <div style="padding:16px 28px;background:#f5f7f6;color:#a7a9ac;font-size:11px;border-top:1px solid #e2e6e3;">
        Notificación automática del sistema de solicitudes de diseño · GanaPlay
      </div>
    </div>
  </div>
</body></html>`;
}

/** Botón de llamada a la acción con el verde corporativo. */
export function ctaButton(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:18px;background:#00783e;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:10px;font-size:14px;font-weight:bold;">${label}</a>`;
}

/** Lista de correos del equipo de diseño desde variable de entorno. */
export function designTeamEmails(): string[] {
  return (process.env.DESIGN_TEAM_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}
