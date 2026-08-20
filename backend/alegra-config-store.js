"use strict";

// Guarda la configuracion de Alegra (correo, token de API, id de impuesto,
// endpoint) fuera del estado que se transmite a los navegadores. El token NUNCA
// viaja en el documento de estado: vive solo en el servidor, en Postgres si hay
// base durable o en un archivo local en desarrollo. Asi el negocio conecta
// Alegra desde la app sin exponer el token a las cuentas de recepcion.

const path = require("path");
const { promises: fs } = require("fs");

const dataDir = path.join(__dirname, "data");
const filePath = path.join(dataDir, "alegra-config.json");
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

let pgPool = null;
let pgReady = false;

async function pool() {
  if (!databaseUrl) return null;
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: databaseUrl, max: 2 });
  }
  if (!pgReady) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    pgReady = true;
  }
  return pgPool;
}

// Devuelve la configuracion guardada, o null si nunca se guardo (entonces manda
// la configuracion por variables de entorno).
async function load() {
  const db = await pool();
  if (db) {
    const result = await db.query("SELECT value FROM app_settings WHERE key = 'alegra'");
    return result.rows[0]?.value || null;
  }
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

// Fusiona y persiste. `next` puede traer solo los campos que cambian; el token
// vacio no borra el guardado salvo que llegue `clearToken`.
async function save(next = {}) {
  const current = (await load()) || {};
  const merged = { ...current };
  if (typeof next.email === "string") merged.email = next.email.trim();
  if (typeof next.taxId === "string") merged.taxId = next.taxId.trim();
  if (typeof next.endpoint === "string") merged.endpoint = next.endpoint.trim();
  if (next.clearToken) delete merged.token;
  else if (typeof next.token === "string" && next.token) merged.token = next.token.trim();

  const db = await pool();
  if (db) {
    await db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('alegra', $1, now())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
      [merged]
    );
    return merged;
  }

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

module.exports = { load, save };
