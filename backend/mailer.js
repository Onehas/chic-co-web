"use strict";

// Envio de correo a traves de Resend.
//
// Se llama con `fetch`, que Node trae de serie desde la version 18: no hace
// falta el SDK ni ninguna dependencia nueva, y el proyecto sigue sin paso de
// compilacion.
//
// Regla de oro: un fallo de correo NUNCA puede tumbar la operacion que lo
// disparo. Si Resend esta caido o falta la clave, la cita igual se confirma y
// el reporte igual se genera; lo que se pierde es el aviso, y eso queda escrito
// en la bitacora de envios para que alguien pueda reintentarlo a mano.

const resendApiKey = process.env.RESEND_API_KEY || "";
const fromAddress = process.env.RESEND_FROM || "";
const replyToAddress = process.env.RESEND_REPLY_TO || "";
// A quien llegan los avisos internos y el reporte de fin de dia.
const staffRecipients = String(process.env.CHIC_STAFF_EMAILS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const endpoint = process.env.RESEND_ENDPOINT || "https://api.resend.com/emails";
const requestTimeoutMs = 10000;

// Bitacora en memoria de los ultimos envios, para poder ver desde la app si el
// correo esta saliendo o fallando sin tener que entrar al panel de Resend.
const deliveryLog = [];
const deliveryLogLimit = 50;

function isConfigured() {
  return Boolean(resendApiKey && fromAddress);
}

function recordDelivery(entry) {
  deliveryLog.unshift({ at: new Date().toISOString(), ...entry });
  deliveryLog.length = Math.min(deliveryLog.length, deliveryLogLimit);
}

function recentDeliveries() {
  return deliveryLog.slice(0, deliveryLogLimit);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendEmail({ to, subject, html, text = "", replyTo = "" }) {
  const recipients = (Array.isArray(to) ? to : [to]).map((value) => String(value || "").trim()).filter(Boolean);

  if (!recipients.length) {
    recordDelivery({ ok: false, subject, reason: "sin destinatarios" });
    return { ok: false, skipped: true, reason: "sin destinatarios" };
  }

  if (!isConfigured()) {
    // En desarrollo esto es lo normal y no debe ensuciar la salida en cada
    // envio, pero tampoco puede pasar desapercibido en produccion.
    recordDelivery({ ok: false, subject, to: recipients, reason: "RESEND_API_KEY o RESEND_FROM sin definir" });
    console.warn(`[correo] omitido "${subject}": falta RESEND_API_KEY o RESEND_FROM`);
    return { ok: false, skipped: true, reason: "no configurado" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipients,
        subject,
        html,
        ...(text ? { text } : {}),
        ...(replyTo || replyToAddress ? { reply_to: replyTo || replyToAddress } : {})
      }),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = payload?.message || `HTTP ${response.status}`;
      recordDelivery({ ok: false, subject, to: recipients, reason });
      console.error(`[correo] fallo "${subject}": ${reason}`);
      return { ok: false, reason };
    }

    recordDelivery({ ok: true, subject, to: recipients, id: payload?.id || "" });
    return { ok: true, id: payload?.id || "" };
  } catch (error) {
    const reason = error.name === "AbortError" ? "tiempo de espera agotado" : error.message;
    recordDelivery({ ok: false, subject, to: recipients, reason });
    console.error(`[correo] fallo "${subject}": ${reason}`);
    return { ok: false, reason };
  } finally {
    clearTimeout(timeout);
  }
}

/* -------------------------------------------------------------------------
 * Plantillas
 * ---------------------------------------------------------------------- */

// Un solo envoltorio para todos los correos. Se usan tablas y estilos en linea
// porque los clientes de correo -Outlook sobre todo- no aplican flexbox, grid
// ni hojas externas.
function layout({ title, intro, rows = [], footnote = "", accent = "#1d1d1f" }) {
  const rowsHtml = rows
    .filter(Boolean)
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:7px 0;color:#6b6b70;font-size:13px;width:150px;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:7px 0;color:#1d1d1f;font-size:14px;font-weight:600;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f2f2f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e3e3e7;">
    <tr><td style="padding:26px 26px 0;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${accent};">Chic &amp; Co</div>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:600;color:#1d1d1f;letter-spacing:-.01em;">${escapeHtml(title)}</h1>
    </td></tr>
    <tr><td style="padding:14px 26px 0;color:#45454b;font-size:14px;line-height:1.55;">${intro}</td></tr>
    ${rowsHtml ? `<tr><td style="padding:16px 26px 0;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rowsHtml}</table></td></tr>` : ""}
    <tr><td style="padding:22px 26px 26px;color:#6b6b70;font-size:12px;line-height:1.5;border-top:1px solid #e3e3e7;margin-top:16px;">
      ${footnote || "Chic &amp; Co &middot; Este mensaje se genero automaticamente."}
    </td></tr>
  </table>
</body></html>`;
}

function longDate(dateISO) {
  const names = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
  const date = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateISO;
  return `${names[date.getDay()]} ${date.getDate()} de ${months[date.getMonth()]}`;
}

// Acuse de recibo. Deja claro que TODAVIA no es una cita: la promesa a medias
// es peor que no avisar, porque la clienta se presenta y no hay campo.
async function sendRequestReceived(request, branchLabel) {
  return sendEmail({
    to: request.clientEmail,
    subject: "Recibimos tu solicitud de cita",
    html: layout({
      title: "Recibimos tu solicitud",
      intro: `Hola ${escapeHtml(request.clientName.split(" ")[0])}, ya tenemos tu solicitud. <strong>Todavia no es una cita confirmada</strong>: la revisamos y te escribimos por WhatsApp o correo para confirmarte el horario.`,
      rows: [
        ["Servicio", request.procedureName],
        ["Fecha", longDate(request.date)],
        ["Hora", request.time],
        ["Sucursal", branchLabel],
        request.notes ? ["Tu nota", request.notes] : null
      ],
      footnote: "Si necesitas cambiar algo, responde a este correo o escribenos por WhatsApp."
    })
  });
}

async function sendRequestConfirmed(request, branchLabel, specialist) {
  return sendEmail({
    to: request.clientEmail,
    subject: `Cita confirmada: ${longDate(request.date)} a las ${request.time}`,
    html: layout({
      title: "Tu cita quedo confirmada",
      accent: "#1c7a43",
      intro: `Hola ${escapeHtml(request.clientName.split(" ")[0])}, te esperamos. Si no puedes venir, avisanos con tiempo para liberar el espacio.`,
      rows: [
        ["Servicio", request.procedureName],
        ["Fecha", longDate(request.date)],
        ["Hora", request.time],
        ["Sucursal", branchLabel],
        specialist ? ["Te atiende", specialist] : null
      ]
    })
  });
}

async function sendRequestRejected(request, branchLabel, reason) {
  return sendEmail({
    to: request.clientEmail,
    subject: "Sobre tu solicitud de cita",
    html: layout({
      title: "No pudimos tomar ese horario",
      accent: "#8a5a10",
      intro: `Hola ${escapeHtml(request.clientName.split(" ")[0])}, lamentablemente no podemos atenderte ${escapeHtml(longDate(request.date))} a las ${escapeHtml(request.time)}. ${
        reason ? escapeHtml(reason) : "Escribenos y buscamos otro espacio que te sirva."
      }`,
      rows: [
        ["Servicio", request.procedureName],
        ["Sucursal", branchLabel]
      ]
    })
  });
}

// Aviso interno. Lleva el enlace de WhatsApp ya armado para que quien lo lea
// pueda contactar a la clienta desde el propio correo, sin abrir la app.
async function sendStaffNewRequest(request, branchLabel, whatsappUrl) {
  if (!staffRecipients.length) return { ok: false, skipped: true, reason: "sin CHIC_STAFF_EMAILS" };

  return sendEmail({
    to: staffRecipients,
    replyTo: request.clientEmail,
    subject: `Nueva solicitud de cita: ${request.clientName}`,
    html: layout({
      title: "Nueva solicitud desde la web",
      intro: `Entro una solicitud por el enlace publico. Confirmala o rechazala desde el modulo de Citas.<br><br><a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;padding:9px 16px;background:#1d1d1f;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Escribirle por WhatsApp</a>`,
      rows: [
        ["Cliente", request.clientName],
        ["WhatsApp", `+${request.clientPhone}`],
        ["Correo", request.clientEmail],
        ["Servicio", request.procedureName],
        ["Fecha", longDate(request.date)],
        ["Hora", request.time],
        ["Sucursal", branchLabel],
        request.notes ? ["Nota", request.notes] : null
      ]
    })
  });
}

async function sendDailyReport({ subject, title, intro, rows, footnote }) {
  if (!staffRecipients.length) return { ok: false, skipped: true, reason: "sin CHIC_STAFF_EMAILS" };
  return sendEmail({
    to: staffRecipients,
    subject,
    html: layout({ title, intro, rows, footnote })
  });
}

module.exports = {
  isConfigured,
  staffRecipients,
  sendEmail,
  layout,
  longDate,
  escapeHtml,
  recentDeliveries,
  sendRequestReceived,
  sendRequestConfirmed,
  sendRequestRejected,
  sendStaffNewRequest,
  sendDailyReport
};
