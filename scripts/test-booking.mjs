import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

const require = createRequire(import.meta.url);

// El almacen en modo archivo escribe en backend/data. Se limpia antes de
// empezar para que la prueba no dependa de lo que dejaran ejecuciones previas.
const dataDir = new URL("../backend/data", import.meta.url);
await rm(dataDir, { recursive: true, force: true });

const booking = require("../backend/public-booking.js");
const store = require("../backend/booking-store.js");
const report = require("../backend/daily-report.js");

/* --- Contacto obligatorio y bien formado -------------------------------- */

// Correo y WhatsApp son las dos unicas vias para avisarle a la clienta.
assert.throws(() => store.normalizeEmail(""), /obligatorio/, "el correo es obligatorio");
assert.throws(() => store.normalizeEmail("sin-arroba"), /formato/, "rechaza un correo sin arroba");
assert.throws(() => store.normalizeEmail("a@b"), /formato/, "rechaza un dominio sin punto");
assert.equal(store.normalizeEmail("  Maria@Example.COM "), "maria@example.com", "normaliza el correo");

assert.throws(() => store.normalizePhone(""), /obligatorio/, "el WhatsApp es obligatorio");
assert.throws(() => store.normalizePhone("2222 1111"), /celular/, "un fijo no recibe WhatsApp");
assert.throws(() => store.normalizePhone("8888 111"), /8 digitos/, "rechaza un numero corto");
assert.equal(store.normalizePhone("8888 1111"), "50688881111", "agrega el codigo de pais");
assert.equal(store.normalizePhone("+506 7000-1234"), "50670001234", "acepta el formato internacional");

assert.throws(() => store.normalizeName("A"), /nombre completo/, "exige un nombre real");
assert.equal(store.normalizeName("  Maria   Gomez  "), "Maria Gomez", "colapsa los espacios");

/* --- Que se ofrece al publico ------------------------------------------- */

const baseState = {
  currentBranchId: "rohrmoser",
  branches: {
    rohrmoser: {
      procedures: [
        { id: "SRV-1", name: "Limpieza facial", duration: 60, price: 35000 },
        { id: "SRV-2", name: "Uso interno", duration: 30, price: 0, publicBooking: false }
      ],
      appointments: [],
      specialists: [{ name: "A" }, { name: "B" }]
    }
  }
};

const offered = booking.bookableProcedures(baseState, "rohrmoser");
assert.equal(offered.length, 1, "solo se ofrece lo marcado como publico");
assert.equal(offered[0].id, "SRV-1");
assert.equal(booking.capacityFor(baseState, "rohrmoser"), 2, "la capacidad sale de los especialistas");

/* --- Ventana de reservas ------------------------------------------------ */

// Se fija un "ahora" concreto para que la prueba no dependa del reloj.
const now = Date.parse("2026-08-20T15:00:00Z"); // 09:00 en Costa Rica
const today = "2026-08-20";

assert.match(booking.dayBlockReason("2026-08-19", now), /ya paso/, "no deja reservar en el pasado");
assert.match(booking.dayBlockReason("2027-08-20", now), /anticipacion/, "hay un horizonte maximo");
assert.match(booking.dayBlockReason("2026-08-23", now), /no abre/, "el domingo esta cerrado");
assert.equal(booking.dayBlockReason("2026-08-21", now), "", "un dia habil si admite");

/* --- Disponibilidad ----------------------------------------------------- */

const free = booking.availableSlots(baseState, "rohrmoser", "2026-08-21", 60, [], now);
assert.ok(free.slots.includes("08:30"), "abre a las 8:30");
assert.ok(free.slots.includes("18:00"), "el ultimo cupo de 60 min entra antes de cerrar");
assert.ok(!free.slots.includes("18:30"), "no ofrece un cupo que se pasaria de la hora de cierre");

// Antelacion minima: hoy no se puede reservar para dentro de diez minutos.
const todaySlots = booking.availableSlots(baseState, "rohrmoser", today, 60, [], now);
assert.ok(!todaySlots.slots.includes("09:00"), "respeta la antelacion minima");
assert.ok(todaySlots.slots.includes("11:00"), "mas tarde el mismo dia si se puede");

// Capacidad: con dos especialistas, dos citas a la misma hora agotan el cupo.
const busyState = structuredClone(baseState);
busyState.branches.rohrmoser.appointments = [
  { date: "2026-08-21", time: "10:00", duration: 60, status: "Confirmada" },
  { date: "2026-08-21", time: "10:00", duration: 60, status: "Pendiente" }
];
const busy = booking.availableSlots(busyState, "rohrmoser", "2026-08-21", 60, [], now);
assert.ok(!busy.slots.includes("10:00"), "un horario lleno no se ofrece");
assert.ok(!busy.slots.includes("09:30"), "tampoco uno que se solaparia");
assert.ok(busy.slots.includes("11:00"), "el siguiente libre si");

// Una cita cancelada libera el espacio.
const cancelledState = structuredClone(busyState);
cancelledState.branches.rohrmoser.appointments.forEach((item) => {
  item.status = "Cancelada";
});
assert.ok(
  booking.availableSlots(cancelledState, "rohrmoser", "2026-08-21", 60, [], now).slots.includes("10:00"),
  "cancelar libera el horario"
);

// Las solicitudes pendientes tambien apartan: sin esto, dos personas
// reservarian el mismo hueco antes de que nadie confirme.
const withPending = booking.availableSlots(
  baseState,
  "rohrmoser",
  "2026-08-21",
  60,
  [
    { branchId: "rohrmoser", date: "2026-08-21", time: "12:00", duration: 60 },
    { branchId: "rohrmoser", date: "2026-08-21", time: "12:00", duration: 60 }
  ],
  now
);
assert.ok(!withPending.slots.includes("12:00"), "las solicitudes pendientes apartan el horario");

/* --- Disponibilidad por especialista ------------------------------------ */

// La sucursal expone su lista de especialistas.
assert.deepEqual(booking.specialistsForBranch(baseState, "rohrmoser"), ["A", "B"], "lista de especialistas de la sede");
assert.ok(booking.isKnownSpecialist(baseState, "rohrmoser", "A"), "A si atiende aqui");
assert.ok(booking.isKnownSpecialist(baseState, "rohrmoser", ""), "sin preferencia siempre vale");
assert.ok(!booking.isKnownSpecialist(baseState, "rohrmoser", "Z"), "Z no atiende aqui");

// A tiene una cita a las 10:00; B esta libre.
const specState = structuredClone(baseState);
specState.branches.rohrmoser.appointments = [
  { date: "2026-08-21", time: "10:00", duration: 60, status: "Confirmada", specialist: "A" }
];

// Pidiendo a A, su hora de las 10:00 esta ocupada (capacidad 1 por persona).
const withA = booking.availableSlots(specState, "rohrmoser", "2026-08-21", 60, [], now, "A");
assert.ok(!withA.slots.includes("10:00"), "A no puede a las 10:00 (ya tiene cita)");
assert.ok(withA.slots.includes("11:00"), "A si a las 11:00");

// Pidiendo a B, las 10:00 estan libres: la cita de A no le afecta.
const withB = booking.availableSlots(specState, "rohrmoser", "2026-08-21", 60, [], now, "B");
assert.ok(withB.slots.includes("10:00"), "B si puede a las 10:00 (la cita de A no le afecta)");

// Sin preferencia, con capacidad 2 y solo una cita, las 10:00 siguen libres.
const withAny = booking.availableSlots(specState, "rohrmoser", "2026-08-21", 60, [], now, "");
assert.ok(withAny.slots.includes("10:00"), "sin preferencia hay cupo (capacidad 2, 1 ocupada)");

// Una solicitud pendiente para A tambien bloquea a A, pero no a B.
const pendA = [{ branchId: "rohrmoser", date: "2026-08-21", time: "14:00", duration: 60, specialist: "A" }];
assert.ok(!booking.availableSlots(specState, "rohrmoser", "2026-08-21", 60, pendA, now, "A").slots.includes("14:00"), "una solicitud pendiente aparta a A");
assert.ok(booking.availableSlots(specState, "rohrmoser", "2026-08-21", 60, pendA, now, "B").slots.includes("14:00"), "pero no a B");

// validateSlot tambien respeta al especialista.
assert.match(
  booking.validateSlot(specState, "rohrmoser", "2026-08-21", "10:00", 60, [], now, "A"),
  /especialista se acaba de ocupar/,
  "no deja guardar con A a una hora que ya tiene ocupada"
);
assert.equal(booking.validateSlot(specState, "rohrmoser", "2026-08-21", "10:00", 60, [], now, "B"), "", "con B esa hora si pasa");

// El almacen guarda y devuelve la especialista pedida.
const withSpecialist = await store.createRequest({
  branchId: "rohrmoser", procedureId: "SRV-1", procedureName: "Limpieza facial",
  date: "2026-08-22", time: "09:00", duration: 60, clientName: "Ana Lopez",
  clientEmail: "ana@example.com", clientPhone: "8888 2222", specialist: "A"
});
assert.equal(withSpecialist.specialist, "A", "la solicitud guarda la especialista elegida");
const fetched = await store.getRequest(withSpecialist.id);
assert.equal(fetched.specialist, "A", "y la devuelve al leerla");

/* --- Ultima validacion antes de guardar --------------------------------- */

assert.equal(booking.validateSlot(baseState, "rohrmoser", "2026-08-21", "10:00", 60, [], now), "", "un hueco libre pasa");
assert.match(
  booking.validateSlot(baseState, "rohrmoser", "2026-08-21", "07:00", 60, [], now),
  /horario de atencion/,
  "rechaza antes de abrir"
);
assert.match(
  booking.validateSlot(baseState, "rohrmoser", "2026-08-21", "18:45", 60, [], now),
  /horario de atencion/,
  "rechaza lo que se pasaria del cierre"
);
assert.match(
  booking.validateSlot(baseState, "rohrmoser", "2026-08-21", "10:07", 60, [], now),
  /en punto/,
  "rechaza una hora fuera de la rejilla"
);
assert.match(
  booking.validateSlot(busyState, "rohrmoser", "2026-08-21", "10:00", 60, [], now),
  /se acaba de ocupar/,
  "rechaza un horario que se lleno mientras tanto"
);

/* --- Almacen de solicitudes --------------------------------------------- */

const created = await store.createRequest({
  branchId: "rohrmoser",
  procedureId: "SRV-1",
  procedureName: "Limpieza facial",
  date: "2026-08-21",
  time: "10:00",
  duration: 60,
  clientName: "Maria Gomez",
  clientEmail: "maria@example.com",
  clientPhone: "8888 1111",
  notes: "Piel sensible"
});

assert.equal(created.status, "pending", "nace pendiente, no confirmada");
assert.equal(created.clientPhone, "50688881111", "guarda el telefono normalizado");
assert.equal((await store.pendingForDay("rohrmoser", "2026-08-21")).length, 1, "aparta el horario");
assert.equal(await store.countRecentByEmail("maria@example.com", 3600000), 1, "cuenta por correo");

// Solo se resuelve una vez: dos personas de recepcion pulsando a la vez no
// pueden crear dos citas para la misma solicitud.
const first = await store.resolveRequest(created.id, { status: "confirmed", handledBy: "USR-000" });
assert.ok(first, "la primera confirmacion pasa");
const second = await store.resolveRequest(created.id, { status: "confirmed", handledBy: "USR-001" });
assert.equal(second, null, "la segunda no crea nada");
assert.equal((await store.pendingForDay("rohrmoser", "2026-08-21")).length, 0, "ya no aparta el horario");

/* --- WhatsApp ----------------------------------------------------------- */

assert.equal(
  booking.whatsappUrl("50688881111", "Hola Maria"),
  "https://wa.me/50688881111?text=Hola%20Maria",
  "arma el enlace de clic para chatear"
);

/* --- Reporte de fin de dia ---------------------------------------------- */

// Los limites del dia local, no del dia UTC: sin esto un reporte lanzado a las
// 8 de la noche en Costa Rica pediria las cifras de un dia que ya cambio.
const bounds = report.localDayBounds("2026-08-20");
assert.equal(bounds.from, "2026-08-20T06:00:00.000Z", "el dia local empieza a las 06:00 UTC");
assert.equal(bounds.to, "2026-08-21T06:00:00.000Z", "y termina 24 horas despues");

const summary = report.branchSummary(
  {
    branches: {
      rohrmoser: {
        invoices: [
          { date: "2026-08-20", total: 30000, paymentMethod: "Efectivo" },
          { date: "2026-08-20", total: 20000, paymentMethod: "Tarjeta" },
          { date: "2026-08-19", total: 99000, paymentMethod: "Efectivo" }
        ],
        appointments: [
          { date: "2026-08-20", status: "Atendida" },
          { date: "2026-08-20", status: "Cancelada" },
          { date: "2026-08-20", status: "Confirmada" }
        ],
        products: [{ name: "Peroxido", stock: 1, min: 3 }, { name: "Tinte", stock: 9, min: 2 }]
      }
    }
  },
  "rohrmoser",
  "2026-08-20"
);

assert.equal(summary.billed, 50000, "solo suma las facturas del dia");
assert.equal(summary.cash, 30000, "separa efectivo");
assert.equal(summary.card, 20000, "y tarjeta");
assert.equal(summary.attended, 1, "cuenta las atendidas");
assert.equal(summary.cancelled, 1, "y las canceladas");
assert.deepEqual(summary.lowStock, ["Peroxido"], "avisa del stock bajo minimo");

await rm(dataDir, { recursive: true, force: true });

console.log("Booking tests passed");
