"use strict";

// Base comun de las capas fiscales de Hacienda.
//
// Antes cada fase resolvia permisos haciendo fetch a http://127.0.0.1:PORT
// contra su propio proceso, y cada una creaba su parte del esquema. Aqui viven
// una sola vez la autenticacion, el esquema y el acceso al almacenamiento.

const path = require("path");
const { promises: fs } = require("fs");

const core = require("./server");

const dataDir = path.join(__dirname, "data");
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

let pgPool = null;
let pgReady = false;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

/* -------------------------------------------------------------------------
 * Autenticacion
 * ---------------------------------------------------------------------- */

// Ninguna ruta fiscal se consume desde un `src` de imagen, asi que el token
// siempre viaja en la cabecera Authorization. Aceptarlo por query lo dejaria
// escrito en los registros del proxy y en el historial del navegador.
async function requireSession(req) {
  const session = await core.sessionFromRequest(req);
  if (!session) throw httpError("Sesion requerida.", 401);
  return session;
}

// Devuelve el estado de la aplicacion para una sesion valida.
async function requireLogin(req, url) {
  const session = await requireSession(req, url);
  const state = await core.ensureState();
  const user = core.sessionUserFromState(state, session);
  if (!user?.active) throw httpError("Usuario inactivo o no encontrado.", 403);
  return { state, session, user };
}

// True cuando la sesion pertenece a un super usuario o administrador.
async function isAdminRequest(req, url) {
  try {
    const { user } = await requireLogin(req, url);
    return core.isFullAccessUser(user);
  } catch (error) {
    return false;
  }
}

async function requireAdmin(req, url, message = "Solo un administrador puede realizar esta accion.") {
  const context = await requireLogin(req, url);
  if (!core.isFullAccessUser(context.user)) throw httpError(message, 403);
  return context;
}

/* -------------------------------------------------------------------------
 * Validacion
 * ---------------------------------------------------------------------- */

function branchId(value) {
  const next = String(value || "rohrmoser").trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,60}$/.test(next)) throw httpError("Sucursal fiscal invalida.", 400);
  return next;
}

/* -------------------------------------------------------------------------
 * Esquema
 * ---------------------------------------------------------------------- */

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS hacienda_company_settings (
     id text PRIMARY KEY,
     branch_id text UNIQUE NOT NULL,
     enabled boolean NOT NULL DEFAULT false,
     direct_submission_enabled boolean NOT NULL DEFAULT false,
     legacy_provider_enabled boolean NOT NULL DEFAULT true,
     environment text NOT NULL DEFAULT 'Sandbox',
     issuer_id_type text NOT NULL DEFAULT '',
     issuer_id_number text NOT NULL DEFAULT '',
     issuer_legal_name text NOT NULL DEFAULT '',
     issuer_trade_name text NOT NULL DEFAULT '',
     economic_activity_code text NOT NULL DEFAULT '',
     branch_code text NOT NULL DEFAULT '',
     terminal_code text NOT NULL DEFAULT '',
     api_username text NOT NULL DEFAULT '',
     api_password_encrypted text NOT NULL DEFAULT '',
     p12_encrypted text NOT NULL DEFAULT '',
     p12_pin_encrypted text NOT NULL DEFAULT '',
     p12_storage_ref text NOT NULL DEFAULT '',
     issuer_email text NOT NULL DEFAULT '',
     province text NOT NULL DEFAULT '',
     canton text NOT NULL DEFAULT '',
     district text NOT NULL DEFAULT '',
     other_address text NOT NULL DEFAULT '',
     default_currency text NOT NULL DEFAULT 'CRC',
     system_provider text NOT NULL DEFAULT '',
     submission_method text NOT NULL DEFAULT 'LegacyProvider',
     callback_url text NOT NULL DEFAULT '',
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS hacienda_consecutive_counters (
     id text PRIMARY KEY,
     branch_id text NOT NULL,
     document_type text NOT NULL,
     branch_code text NOT NULL,
     terminal_code text NOT NULL,
     last_number bigint NOT NULL DEFAULT 0,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (branch_id, document_type, branch_code, terminal_code)
   )`,
  `CREATE TABLE IF NOT EXISTS hacienda_electronic_documents (
     id text PRIMARY KEY,
     branch_id text NOT NULL,
     invoice_id text NOT NULL,
     document_type text NOT NULL,
     clave text NOT NULL DEFAULT '',
     consecutivo text NOT NULL DEFAULT '',
     issued_at timestamptz,
     environment text NOT NULL DEFAULT 'Sandbox',
     internal_status text NOT NULL DEFAULT 'Draft',
     hacienda_status text NOT NULL DEFAULT '',
     validation_status text NOT NULL DEFAULT 'Pending',
     validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
     totals jsonb NOT NULL DEFAULT '{}'::jsonb,
     xml_original text NOT NULL DEFAULT '',
     xml_signed text NOT NULL DEFAULT '',
     xml_hacienda_response text NOT NULL DEFAULT '',
     json_sent jsonb NOT NULL DEFAULT '{}'::jsonb,
     http_status integer,
     location_header text NOT NULL DEFAULT '',
     hacienda_error text NOT NULL DEFAULT '',
     attempt_count integer NOT NULL DEFAULT 0,
     last_attempt_at timestamptz,
     sent_at timestamptz,
     response_at timestamptz,
     next_status_check_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (branch_id, invoice_id, document_type)
   )`,
  `CREATE TABLE IF NOT EXISTS hacienda_audit_log (
     id text PRIMARY KEY,
     branch_id text NOT NULL,
     user_id text NOT NULL DEFAULT '',
     user_name text NOT NULL DEFAULT '',
     action text NOT NULL,
     details jsonb NOT NULL DEFAULT '{}'::jsonb,
     created_at timestamptz NOT NULL DEFAULT now()
   )`
];

// Devuelve el pool de Postgres, o null cuando la instalacion corre sobre
// archivos. Crea el esquema fiscal completo una sola vez.
async function pool() {
  if (!databaseUrl) return null;

  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: databaseUrl, max: 3 });
  }

  if (!pgReady) {
    for (const statement of schemaStatements) {
      await pgPool.query(statement);
    }
    pgReady = true;
  }

  return pgPool;
}

/* -------------------------------------------------------------------------
 * Almacenamiento en archivo
 * ---------------------------------------------------------------------- */

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(dataDir, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

const fileLocks = new Map();

// Serializa los ciclos leer-modificar-escribir sobre un archivo. Sin esto, dos
// peticiones simultaneas pueden reservar el mismo consecutivo fiscal.
function withFileLock(filePath, task) {
  const previous = fileLocks.get(filePath) || Promise.resolve();
  const next = previous.then(task, task);
  fileLocks.set(
    filePath,
    next.then(
      () => {},
      () => {}
    )
  );
  return next;
}

/* -------------------------------------------------------------------------
 * Cuerpo de la peticion
 * ---------------------------------------------------------------------- */

const maxBodyBytes = 2 * 1024 * 1024;

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBodyBytes) {
        reject(new Error("REQUEST_TOO_LARGE"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const body = await readBody(req);
  return body ? JSON.parse(body) : {};
}

module.exports = {
  databaseUrl,
  dataDir,
  httpError,
  requireSession,
  requireLogin,
  requireAdmin,
  isAdminRequest,
  branchId,
  pool,
  readJsonFile,
  writeJsonFile,
  withFileLock,
  readBody,
  readJson
};
