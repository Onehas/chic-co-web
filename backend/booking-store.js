"use strict";

// Solicitudes de cita que llegan desde el enlace publico.
//
// NO viven dentro de `state`. La aplicacion sincroniza todo el estado como un
// solo documento JSON con tope de 2 MB en cada guardado, asi que dejar que un
// endpoint publico escriba ahi tiene dos consecuencias graves: cada solicitud
// entraria en conflicto con el guardado del personal (control de concurrencia
// optimista), y cualquiera que golpee el endpoint en bucle infla el documento
// hasta pasar el tope, momento en el que NADIE puede guardar nada -tampoco el
// personal-. Aqui viven aparte, y solo pasan al estado cuando recepcion
// confirma una, por la via normal.

const path = require("path");
const crypto = require("crypto");
const { promises: fs } = require("fs");

const dataDir = path.join(__dirname, "data");
const storePath = path.join(dataDir, "booking-requests.json");
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

// Cuanto se conserva una solicitud ya resuelta antes de poder purgarla.
const retentionDays = 180;

let pgPool = null;
let pgReady = false;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

/* -------------------------------------------------------------------------
 * Validacion
 * ---------------------------------------------------------------------- */

// Correo y WhatsApp son obligatorios: son las dos unicas formas de avisarle a
// la clienta que su cita quedo confirmada o de contactarla si hay que moverla.
function normalizeEmail(rawValue) {
  const value = String(rawValue || "").trim().toLowerCase();
  if (!value) throw httpError("El correo es obligatorio.", 400);
  if (value.length > 160) throw httpError("El correo es demasiado largo.", 400);
  // Deliberadamente permisiva: la comprobacion real es que llegue el mensaje.
  // Una expresion estricta rechaza direcciones validas y no detiene a nadie.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value)) {
    throw httpError("El correo no tiene un formato valido.", 400);
  }
  return value;
}

// Costa Rica: ocho digitos, con o sin el 506. Se guarda en formato
// internacional sin signos, que es lo que espera el enlace de WhatsApp.
function normalizePhone(rawValue) {
  const digits = String(rawValue || "").replace(/\D+/g, "");
  if (!digits) throw httpError("El numero de WhatsApp es obligatorio.", 400);

  const local = digits.startsWith("506") ? digits.slice(3) : digits;
  if (local.length !== 8) {
    throw httpError("El numero de WhatsApp debe tener 8 digitos.", 400);
  }
  // Los moviles de Costa Rica empiezan en 6, 7 u 8. Un fijo no recibe WhatsApp
  // y la clienta se quedaria sin enterarse de nada.
  if (!/^[678]/.test(local)) {
    throw httpError("Ese numero no parece un celular. WhatsApp necesita un movil.", 400);
  }
  return `506${local}`;
}

function normalizeName(rawValue) {
  const value = String(rawValue || "").trim().replace(/\s+/g, " ");
  if (value.length < 3) throw httpError("Escriba su nombre completo.", 400);
  if (value.length > 90) throw httpError("El nombre es demasiado largo.", 400);
  return value;
}

function normalizeDate(rawValue) {
  const value = String(rawValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw httpError("Fecha invalida.", 400);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw httpError("Fecha invalida.", 400);
  return value;
}

function normalizeTime(rawValue) {
  const value = String(rawValue || "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw httpError("Hora invalida.", 400);
  return value;
}

function normalizeNotes(rawValue) {
  return String(rawValue || "").trim().slice(0, 400);
}

/* -------------------------------------------------------------------------
 * Postgres
 * ---------------------------------------------------------------------- */

async function pool() {
  if (!databaseUrl) return null;

  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: databaseUrl, max: 3 });
  }

  if (!pgReady) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS booking_requests (
        id text PRIMARY KEY,
        branch_id text NOT NULL,
        procedure_id text NOT NULL DEFAULT '',
        procedure_name text NOT NULL DEFAULT '',
        requested_date text NOT NULL,
        requested_time text NOT NULL,
        duration integer NOT NULL DEFAULT 60,
        client_name text NOT NULL,
        client_email text NOT NULL,
        client_phone text NOT NULL,
        notes text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'pending',
        appointment_id text NOT NULL DEFAULT '',
        handled_by text NOT NULL DEFAULT '',
        handled_at timestamptz,
        source_ip text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pgPool.query(
      "CREATE INDEX IF NOT EXISTS booking_requests_pending_idx ON booking_requests (branch_id, status, requested_date)"
    );
    // Sostiene el limite por correo sin recorrer la tabla entera.
    await pgPool.query(
      "CREATE INDEX IF NOT EXISTS booking_requests_email_idx ON booking_requests (client_email, created_at)"
    );
    pgReady = true;
  }

  return pgPool;
}

/* -------------------------------------------------------------------------
 * Modo archivo (desarrollo local, sin Postgres)
 * ---------------------------------------------------------------------- */

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(storePath, "utf8"));
    return Array.isArray(parsed.requests) ? parsed : { requests: [] };
  } catch (error) {
    if (error.code === "ENOENT") return { requests: [] };
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(dataDir, { recursive: true });
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tempPath, storePath);
}

let storeLock = Promise.resolve();

function withStoreLock(task) {
  const next = storeLock.then(task, task);
  storeLock = next.then(
    () => {},
    () => {}
  );
  return next;
}

function rowToRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    branchId: row.branch_id,
    procedureId: row.procedure_id,
    procedureName: row.procedure_name,
    date: row.requested_date,
    time: row.requested_time,
    duration: Number(row.duration),
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    notes: row.notes,
    status: row.status,
    appointmentId: row.appointment_id,
    handledBy: row.handled_by,
    handledAt: row.handled_at ? new Date(row.handled_at).toISOString() : "",
    createdAt: new Date(row.created_at).toISOString()
  };
}

/* -------------------------------------------------------------------------
 * API del almacen
 * ---------------------------------------------------------------------- */

async function createRequest(input = {}) {
  const record = {
    id: crypto.randomUUID(),
    branchId: String(input.branchId || "").slice(0, 60),
    procedureId: String(input.procedureId || "").slice(0, 60),
    procedureName: String(input.procedureName || "").slice(0, 120),
    date: normalizeDate(input.date),
    time: normalizeTime(input.time),
    duration: Math.min(480, Math.max(15, Number(input.duration) || 60)),
    clientName: normalizeName(input.clientName),
    clientEmail: normalizeEmail(input.clientEmail),
    clientPhone: normalizePhone(input.clientPhone),
    notes: normalizeNotes(input.notes),
    status: "pending",
    appointmentId: "",
    handledBy: "",
    handledAt: "",
    sourceIp: String(input.sourceIp || "").slice(0, 60),
    createdAt: new Date().toISOString()
  };

  const db = await pool();
  if (db) {
    await db.query(
      `INSERT INTO booking_requests
         (id, branch_id, procedure_id, procedure_name, requested_date, requested_time,
          duration, client_name, client_email, client_phone, notes, status, source_ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        record.id, record.branchId, record.procedureId, record.procedureName,
        record.date, record.time, record.duration, record.clientName,
        record.clientEmail, record.clientPhone, record.notes, record.status, record.sourceIp
      ]
    );
    return record;
  }

  await withStoreLock(async () => {
    const store = await readStore();
    store.requests.unshift(record);
    await writeStore(store);
  });
  return record;
}

// Cuantas solicitudes lleva ese correo en la ventana dada. Es el freno contra
// quien automatiza el formulario: el limite por IP solo no basta.
async function countRecentByEmail(rawEmail, windowMs) {
  const email = String(rawEmail || "").trim().toLowerCase();
  const since = Date.now() - Math.max(0, Number(windowMs) || 0);

  const db = await pool();
  if (db) {
    const result = await db.query(
      "SELECT count(*)::int AS total FROM booking_requests WHERE client_email = $1 AND created_at > to_timestamp($2 / 1000.0)",
      [email, since]
    );
    return Number(result.rows[0]?.total || 0);
  }

  const store = await readStore();
  return store.requests.filter(
    (item) => item.clientEmail === email && Date.parse(item.createdAt) > since
  ).length;
}

// Solicitudes pendientes que ya apartan un horario. Se usa para que la propia
// pagina publica no ofrezca dos veces el mismo hueco.
async function pendingForDay(branchId, date) {
  const db = await pool();
  if (db) {
    const result = await db.query(
      `SELECT * FROM booking_requests
        WHERE branch_id = $1 AND requested_date = $2 AND status = 'pending'`,
      [String(branchId || ""), String(date || "")]
    );
    return result.rows.map(rowToRequest);
  }

  const store = await readStore();
  return store.requests.filter(
    (item) => item.branchId === branchId && item.date === date && item.status === "pending"
  );
}

async function listRequests({ branchId = "", status = "", limit = 100 } = {}) {
  const safeLimit = Math.min(300, Math.max(1, Number(limit) || 100));

  const db = await pool();
  if (db) {
    const conditions = [];
    const values = [];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }
    values.push(safeLimit);
    const result = await db.query(
      `SELECT * FROM booking_requests
        ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
        ORDER BY created_at DESC
        LIMIT $${values.length}`,
      values
    );
    return result.rows.map(rowToRequest);
  }

  const store = await readStore();
  return store.requests
    .filter((item) => (!branchId || item.branchId === branchId) && (!status || item.status === status))
    .slice(0, safeLimit);
}

async function getRequest(id) {
  const db = await pool();
  if (db) {
    const result = await db.query("SELECT * FROM booking_requests WHERE id = $1", [String(id || "")]);
    return rowToRequest(result.rows[0]);
  }

  const store = await readStore();
  return store.requests.find((item) => item.id === id) || null;
}

// Cierra una solicitud. Solo avanza desde `pending`, asi que dos personas de
// recepcion pulsando a la vez no crean dos citas para la misma solicitud:
// la segunda recibe null y la interfaz le dice que ya estaba resuelta.
async function resolveRequest(id, { status, handledBy = "", appointmentId = "" }) {
  if (!["confirmed", "rejected"].includes(status)) {
    throw httpError("Estado de solicitud invalido.", 400);
  }

  const db = await pool();
  if (db) {
    const result = await db.query(
      `UPDATE booking_requests
          SET status = $2, handled_by = $3, appointment_id = $4, handled_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [String(id || ""), status, String(handledBy).slice(0, 60), String(appointmentId).slice(0, 60)]
    );
    return rowToRequest(result.rows[0]);
  }

  return withStoreLock(async () => {
    const store = await readStore();
    const item = store.requests.find((entry) => entry.id === id);
    if (!item || item.status !== "pending") return null;
    item.status = status;
    item.handledBy = String(handledBy).slice(0, 60);
    item.appointmentId = String(appointmentId).slice(0, 60);
    item.handledAt = new Date().toISOString();
    await writeStore(store);
    return item;
  });
}

// Solicitudes creadas dentro de un rango. Alimenta el reporte de fin de dia.
async function requestsBetween(fromISO, toISO) {
  const db = await pool();
  if (db) {
    const result = await db.query(
      "SELECT * FROM booking_requests WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at ASC",
      [fromISO, toISO]
    );
    return result.rows.map(rowToRequest);
  }

  const store = await readStore();
  const from = Date.parse(fromISO);
  const to = Date.parse(toISO);
  return store.requests
    .filter((item) => {
      const at = Date.parse(item.createdAt);
      return at >= from && at < to;
    })
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

async function purgeResolved(days = retentionDays) {
  const cutoff = Date.now() - Math.max(1, Number(days) || retentionDays) * 24 * 60 * 60 * 1000;

  const db = await pool();
  if (db) {
    const result = await db.query(
      "DELETE FROM booking_requests WHERE status <> 'pending' AND handled_at < to_timestamp($1 / 1000.0)",
      [cutoff]
    );
    return result.rowCount;
  }

  return withStoreLock(async () => {
    const store = await readStore();
    const before = store.requests.length;
    store.requests = store.requests.filter(
      (item) => item.status === "pending" || !item.handledAt || Date.parse(item.handledAt) >= cutoff
    );
    if (store.requests.length !== before) await writeStore(store);
    return before - store.requests.length;
  });
}

module.exports = {
  retentionDays,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeDate,
  normalizeTime,
  createRequest,
  countRecentByEmail,
  pendingForDay,
  listRequests,
  getRequest,
  resolveRequest,
  requestsBetween,
  purgeResolved
};
