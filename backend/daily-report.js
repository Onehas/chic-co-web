"use strict";

// Reporte de fin de dia para administracion y gerencia.
//
// Se dispara de dos maneras, a proposito:
//
//  1. Un temporizador dentro del proceso, que sirve mientras el servicio este
//     despierto. En el plan gratuito de Render el servicio se duerme tras unos
//     minutos sin trafico y el temporizador no llega a sonar.
//  2. Una ruta protegida por secreto, `POST /api/reports/daily`, para que un
//     Cron Job de Render -o cualquier disparador externo- la invoque a la hora
//     indicada. Esa es la via fiable.
//
// El envio es idempotente por fecha: si las dos vias coinciden el mismo dia,
// el reporte sale una sola vez.

const mailer = require("./mailer");
const bookingStore = require("./booking-store");

// Costa Rica es UTC-6 todo el ano.
const timezoneOffsetMinutes = Number(process.env.CHIC_UTC_OFFSET_MINUTES || -360);
// Hora local a la que se manda, en formato 24h.
const reportHour = Math.min(23, Math.max(0, Number(process.env.CHIC_REPORT_HOUR || 20)));

let lastSentDate = "";
let timer = null;

function localParts(now = Date.now()) {
  const shifted = new Date(now + timezoneOffsetMinutes * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
}

// Limites UTC del dia local, para pedirle al almacen las solicitudes del dia
// correcto. Sin esto, un reporte lanzado a las 8 de la noche de Costa Rica
// pediria las de un dia UTC que ya cambio.
function localDayBounds(dateISO) {
  const startUtc = Date.parse(`${dateISO}T00:00:00Z`) - timezoneOffsetMinutes * 60 * 1000;
  return {
    from: new Date(startUtc).toISOString(),
    to: new Date(startUtc + 24 * 60 * 60 * 1000).toISOString()
  };
}

function money(value) {
  return `CRC ${Number(value || 0).toLocaleString("es-CR")}`;
}

function invoiceTotal(invoice) {
  return Number(invoice?.total || invoice?.paid || invoice?.serviceAmount || 0);
}

function branchSummary(state, branchId, dateISO) {
  const branch = state?.branches?.[branchId] || {};
  const invoices = (branch.invoices || []).filter((invoice) => String(invoice.date || "").startsWith(dateISO));
  const appointments = (branch.appointments || []).filter((appointment) => appointment.date === dateISO);
  const products = branch.products || [];

  return {
    invoiceCount: invoices.length,
    billed: invoices.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0),
    cash: invoices
      .filter((invoice) => invoice.paymentMethod === "Efectivo")
      .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0),
    card: invoices
      .filter((invoice) => invoice.paymentMethod === "Tarjeta")
      .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0),
    attended: appointments.filter((appointment) => appointment.status === "Atendida").length,
    cancelled: appointments.filter((appointment) => appointment.status === "Cancelada").length,
    pending: appointments.filter((appointment) => ["Pendiente", "Confirmada"].includes(appointment.status)).length,
    lowStock: products.filter((product) => Number(product.stock) <= Number(product.min || 0)).map((product) => product.name)
  };
}

async function buildReport(state, dateISO, branchLabels) {
  const { from, to } = localDayBounds(dateISO);
  const requests = await bookingStore.requestsBetween(from, to);

  const branchIds = Object.keys(state?.branches || {});
  const summaries = branchIds.map((branchId) => ({
    branchId,
    label: branchLabels?.[branchId] || branchId,
    ...branchSummary(state, branchId, dateISO)
  }));

  const totals = summaries.reduce(
    (accumulator, summary) => ({
      billed: accumulator.billed + summary.billed,
      invoiceCount: accumulator.invoiceCount + summary.invoiceCount,
      attended: accumulator.attended + summary.attended,
      cancelled: accumulator.cancelled + summary.cancelled
    }),
    { billed: 0, invoiceCount: 0, attended: 0, cancelled: 0 }
  );

  const pendingRequests = requests.filter((request) => request.status === "pending");
  const lowStock = [...new Set(summaries.flatMap((summary) => summary.lowStock))];

  const rows = [
    ["Facturado", money(totals.billed)],
    ["Facturas", String(totals.invoiceCount)],
    ["Citas atendidas", String(totals.attended)],
    ["Citas canceladas", String(totals.cancelled)],
    ["Reservas web recibidas", String(requests.length)],
    pendingRequests.length ? ["Reservas SIN responder", String(pendingRequests.length)] : null,
    lowStock.length ? ["Productos bajo minimo", lowStock.slice(0, 8).join(", ")] : null,
    ...summaries.map((summary) => [summary.label, `${money(summary.billed)} · ${summary.attended} atendidas`])
  ];

  // Lo que exige accion va arriba del todo, no enterrado entre cifras.
  const alerts = [];
  if (pendingRequests.length) {
    alerts.push(
      `<strong style="color:#b3261e;">Hay ${pendingRequests.length} reserva${
        pendingRequests.length === 1 ? "" : "s"
      } de la web sin responder.</strong>`
    );
  }
  if (lowStock.length) {
    alerts.push(`<strong style="color:#8a5a10;">${lowStock.length} producto(s) bajo el minimo.</strong>`);
  }

  return {
    subject: `Cierre del ${mailer.longDate(dateISO)} · ${money(totals.billed)}`,
    title: `Cierre del ${mailer.longDate(dateISO)}`,
    intro: alerts.length ? alerts.join("<br>") : "Dia cerrado sin pendientes.",
    rows,
    footnote: "Reporte automatico de Chic &amp; Co. Se envia una vez al dia."
  };
}

// `force` salta la comprobacion de idempotencia: la usa el envio manual desde
// la aplicacion, donde alguien pidio el reporte a proposito.
async function sendReportFor(state, dateISO, branchLabels, { force = false } = {}) {
  if (!force && lastSentDate === dateISO) {
    return { ok: false, skipped: true, reason: "ya se envio hoy" };
  }
  const report = await buildReport(state, dateISO, branchLabels);
  const result = await mailer.sendDailyReport(report);
  if (result.ok) lastSentDate = dateISO;
  return result;
}

// Comprueba cada quince minutos si ya paso la hora del reporte. Un intervalo
// corto seria un desperdicio y uno largo se saltaria la ventana.
function startScheduler(getState, branchLabels) {
  if (timer) return timer;

  timer = setInterval(async () => {
    try {
      const { date, hour } = localParts();
      if (hour < reportHour || lastSentDate === date) return;
      const state = await getState();
      await sendReportFor(state, date, branchLabels);
    } catch (error) {
      console.error("No se pudo enviar el reporte de fin de dia:", error.message);
    }
  }, 15 * 60 * 1000);

  // No debe mantener el proceso vivo por si solo ni retrasar un apagado.
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  reportHour,
  localParts,
  localDayBounds,
  branchSummary,
  buildReport,
  sendReportFor,
  startScheduler,
  stopScheduler
};
