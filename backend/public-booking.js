"use strict";

// Reglas de la agenda publica.
//
// Se mantiene sin nada de HTTP a proposito: recibe el estado y devuelve datos,
// asi que las reglas que deciden que horario se ofrece a una clienta se pueden
// probar sin levantar un servidor. `backend/server.js` pone el transporte.

// Horario de atencion. Coincide con el que dibuja la agenda interna
// (agenda-upgrade.js): si aqui se ofreciera un horario que la rejilla del
// personal no muestra, la cita confirmada quedaria invisible para recepcion.
const openingMinutes = minutesFromEnv("CHIC_OPENING_TIME", 8 * 60 + 30);
const closingMinutes = minutesFromEnv("CHIC_CLOSING_TIME", 19 * 60);
const slotStep = 30;

// Dias cerrados, 0 = domingo. Un salon que abre los siete dias define "".
const closedWeekdays = new Set(
  String(process.env.CHIC_CLOSED_WEEKDAYS ?? "0")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
);

// Cuanta antelacion minima se exige, y hasta cuando se puede reservar.
const minLeadMinutes = Number(process.env.CHIC_MIN_LEAD_MINUTES || 120);
const maxHorizonDays = Number(process.env.CHIC_MAX_HORIZON_DAYS || 60);

// Costa Rica es UTC-6 todo el ano, sin horario de verano.
const timezoneOffsetMinutes = Number(process.env.CHIC_UTC_OFFSET_MINUTES || -360);

function minutesFromEnv(name, fallback) {
  const raw = String(process.env[name] || "").trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

function toTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function toMinutes(timeValue) {
  const [hours, minutes] = String(timeValue || "00:00").split(":").map(Number);
  return Number(hours || 0) * 60 + Number(minutes || 0);
}

// "Ahora" en hora de Costa Rica, no en la del servidor. Render corre en UTC,
// asi que sin esto la antelacion minima se calcularia con seis horas de
// desfase y a las 7 de la noche la pagina ya no ofreceria nada del dia
// siguiente.
function localNow(now = Date.now()) {
  const shifted = new Date(now + timezoneOffsetMinutes * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  };
}

function weekdayOf(dateISO) {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay();
}

function daysBetween(fromISO, toISO) {
  const from = Date.parse(`${fromISO}T00:00:00Z`);
  const to = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

/* -------------------------------------------------------------------------
 * Que se puede ofrecer
 * ---------------------------------------------------------------------- */

function branchData(state, branchId) {
  return state?.branches?.[branchId] || {};
}

// Los servicios que se muestran en la pagina publica. Un procedimiento sin
// precio o sin duracion no se ofrece: la clienta no puede decidir a ciegas y
// el hueco quedaria mal calculado.
function bookableProcedures(state, branchId) {
  const procedures = branchData(state, branchId).procedures || state?.procedures || [];
  return procedures
    .filter((procedure) => procedure?.id && procedure?.name)
    .filter((procedure) => procedure.publicBooking !== false)
    .map((procedure) => ({
      id: String(procedure.id),
      name: String(procedure.name),
      duration: Math.min(480, Math.max(15, Number(procedure.duration) || 60)),
      price: Number(procedure.price) || 0,
      area: String(procedure.area || "")
    }));
}

// Roster por defecto de especialistas que ofrece la pagina publica. Los nombres
// deben coincidir con los de la agenda interna (app.js: procedureSpecialists)
// para que una cita confirmada quede asignada a la misma persona y su hueco se
// respete en las dos vistas. Si una sucursal define su propia lista en
// `state.branches[id].specialists`, esa manda.
const DEFAULT_SPECIALISTS = [
  "Andrea Morales", "Paola Jimenez", "Camila Soto", "Natalia Vargas", "Sofia Marin",
  "Valeria Campos", "Daniela Rojas", "Mariana Arias", "Laura Quiros", "Fernanda Solis",
  "Karla Mendez", "Melissa Castro", "Gabriela Mora", "Isabel Pineda", "Lucia Herrera",
  "Monica Salazar", "Rebeca Chacon", "Elena Navarro", "Cristina Vega", "Jimena Fuentes"
];

function specialistsForBranch(state, branchId) {
  const raw = branchData(state, branchId).specialists;
  const source = Array.isArray(raw) && raw.length
    ? raw.map((item) => (typeof item === "string" ? item : item?.name)).filter(Boolean)
    : DEFAULT_SPECIALISTS;
  return [...new Set(source.map((name) => String(name).trim()).filter(Boolean))];
}

function isKnownSpecialist(state, branchId, specialist) {
  const want = String(specialist || "").trim().toLowerCase();
  if (!want) return true; // "sin preferencia" siempre es valido
  return specialistsForBranch(state, branchId).some((name) => name.toLowerCase() === want);
}

function bookingConfig(state, branchLabels) {
  return {
    branches: Object.keys(state?.branches || {}).map((branchId) => ({
      id: branchId,
      label: branchLabels?.[branchId] || branchId,
      procedures: bookableProcedures(state, branchId),
      specialists: specialistsForBranch(state, branchId)
    })),
    hours: { opens: toTime(openingMinutes), closes: toTime(closingMinutes), slotStep },
    closedWeekdays: [...closedWeekdays],
    minLeadMinutes,
    maxHorizonDays
  };
}

/* -------------------------------------------------------------------------
 * Disponibilidad
 * ---------------------------------------------------------------------- */

// Cuantas personas pueden estar siendo atendidas a la vez. Sin esto, una sola
// cita a las 10 bloquearia esa hora para todo el salon aunque haya ocho
// especialistas libres.
function capacityFor(state, branchId) {
  const configured = Number(process.env.CHIC_PUBLIC_CAPACITY || 0);
  if (configured > 0) return configured;
  const specialists = branchData(state, branchId).specialists;
  if (Array.isArray(specialists) && specialists.length) return specialists.length;
  return 4;
}

function appointmentsForDay(state, branchId, dateISO) {
  const appointments = branchData(state, branchId).appointments || [];
  return appointments.filter(
    (appointment) => appointment?.date === dateISO && appointment.status !== "Cancelada"
  );
}

// Intervalos ya tomados: citas del personal mas solicitudes pendientes, que
// tambien apartan el horario mientras recepcion decide. Sin contarlas, dos
// personas distintas reservarian el mismo hueco antes de que nadie confirme.
// Con `specialist` se cuentan solo los intervalos de ESA persona: asi la
// disponibilidad que se muestra es la de la especialista elegida, no la del
// salon entero. Sin especialista (sin preferencia) se cuentan todos.
function busyIntervals(state, branchId, dateISO, pendingRequests = [], specialist = "") {
  const want = String(specialist || "").trim().toLowerCase();
  const matches = (name) => !want || String(name || "").trim().toLowerCase() === want;

  const fromAppointments = appointmentsForDay(state, branchId, dateISO)
    .filter((appointment) => matches(appointment.specialist))
    .map((appointment) => {
      const start = toMinutes(appointment.time);
      return { start, end: start + (Number(appointment.duration) || 60) };
    });

  const fromRequests = pendingRequests
    .filter((request) => request.branchId === branchId && request.date === dateISO && matches(request.specialist))
    .map((request) => {
      const start = toMinutes(request.time);
      return { start, end: start + (Number(request.duration) || 60) };
    });

  return [...fromAppointments, ...fromRequests];
}

function overlapCount(intervals, start, end) {
  return intervals.filter((interval) => start < interval.end && end > interval.start).length;
}

// Motivo por el que una fecha no admite reservas, o "" si si admite.
function dayBlockReason(dateISO, now = Date.now()) {
  const today = localNow(now);

  if (daysBetween(today.date, dateISO) < 0) return "Esa fecha ya paso.";
  if (daysBetween(today.date, dateISO) > maxHorizonDays) {
    return `Solo se puede reservar con ${maxHorizonDays} dias de anticipacion.`;
  }
  if (closedWeekdays.has(weekdayOf(dateISO))) return "Ese dia el salon no abre.";
  return "";
}

function availableSlots(state, branchId, dateISO, duration, pendingRequests = [], now = Date.now(), specialist = "") {
  const blocked = dayBlockReason(dateISO, now);
  if (blocked) return { slots: [], reason: blocked };

  const safeDuration = Math.min(480, Math.max(15, Number(duration) || 60));
  const wantSpecialist = String(specialist || "").trim();
  const intervals = busyIntervals(state, branchId, dateISO, pendingRequests, wantSpecialist);
  // Con una especialista elegida, su capacidad es 1: solo puede atender a una
  // clienta a la vez. Sin preferencia, se usa la capacidad del salon.
  const capacity = wantSpecialist ? 1 : capacityFor(state, branchId);
  const today = localNow(now);
  const isToday = today.date === dateISO;
  const earliest = isToday ? today.minutes + minLeadMinutes : 0;

  const slots = [];
  for (let start = openingMinutes; start + safeDuration <= closingMinutes; start += slotStep) {
    if (start < earliest) continue;
    if (overlapCount(intervals, start, start + safeDuration) >= capacity) continue;
    slots.push(toTime(start));
  }

  return {
    slots,
    reason: slots.length ? "" : isToday ? "Ya no quedan espacios para hoy." : "No quedan espacios ese dia."
  };
}

// Ultima comprobacion antes de guardar. La pagina ya filtro los horarios, pero
// entre que la clienta eligio y pulso "reservar" pueden haber pasado minutos y
// alguien mas pudo tomar el hueco.
function validateSlot(state, branchId, dateISO, time, duration, pendingRequests = [], now = Date.now(), specialist = "") {
  const blocked = dayBlockReason(dateISO, now);
  if (blocked) return blocked;

  const start = toMinutes(time);
  const safeDuration = Math.min(480, Math.max(15, Number(duration) || 60));

  if (start < openingMinutes || start + safeDuration > closingMinutes) {
    return `El horario de atencion es de ${toTime(openingMinutes)} a ${toTime(closingMinutes)}.`;
  }
  if (start % slotStep !== 0) return "Elija un horario en punto o y media.";

  const today = localNow(now);
  if (today.date === dateISO && start < today.minutes + minLeadMinutes) {
    return `Necesitamos al menos ${Math.round(minLeadMinutes / 60)} horas de anticipacion.`;
  }

  const wantSpecialist = String(specialist || "").trim();
  const intervals = busyIntervals(state, branchId, dateISO, pendingRequests, wantSpecialist);
  const capacity = wantSpecialist ? 1 : capacityFor(state, branchId);
  if (overlapCount(intervals, start, start + safeDuration) >= capacity) {
    return wantSpecialist
      ? "Esa especialista se acaba de ocupar a esa hora. Elija otra hora u otra especialista."
      : "Ese horario se acaba de ocupar. Elija otro, por favor.";
  }

  return "";
}

/* -------------------------------------------------------------------------
 * WhatsApp
 * ---------------------------------------------------------------------- */

// Enlace de "clic para chatear". No envia nada por si solo: abre WhatsApp con
// el mensaje ya escrito y quien lo pulsa decide si lo manda. Cero costo y sin
// verificacion de empresa, a diferencia de la API de WhatsApp Business.
function whatsappUrl(phone, message = "") {
  const digits = String(phone || "").replace(/\D+/g, "");
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

module.exports = {
  openingMinutes,
  closingMinutes,
  slotStep,
  closedWeekdays,
  minLeadMinutes,
  maxHorizonDays,
  toTime,
  toMinutes,
  localNow,
  bookableProcedures,
  specialistsForBranch,
  isKnownSpecialist,
  bookingConfig,
  capacityFor,
  busyIntervals,
  dayBlockReason,
  availableSlots,
  validateSlot,
  whatsappUrl
};
