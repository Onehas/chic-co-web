"use strict";

// Almacen de ajustes por clave, fuera del estado que se transmite a los
// navegadores. Guarda pequeños objetos de configuracion (p. ej. los pixeles de
// marketing) en Postgres si hay base durable, o en un archivo local en
// desarrollo. Mismo patron y tabla que alegra-config-store, pero generico.

const path = require("path");
const { promises: fs } = require("fs");

const dataDir = path.join(__dirname, "data");
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

let pgPool = null;
let pgReady = false;

async function pool() {
  if (!databaseUrl) return null;
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: databaseUrl, max: 2 });
    // Sin este listener, un cliente ocioso que Postgres cierra (reinicio,
    // timeout de red) emite un 'error' sin manejar y TUMBA el proceso entero.
    pgPool.on("error", (error) => console.error("Pool de Postgres (idle) fallo:", error.message));
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

function filePathFor(key) {
  return path.join(dataDir, `settings-${key}.json`);
}

async function load(key) {
  const db = await pool();
  if (db) {
    const result = await db.query("SELECT value FROM app_settings WHERE key = $1", [key]);
    return result.rows[0]?.value || null;
  }
  try {
    return JSON.parse(await fs.readFile(filePathFor(key), "utf8"));
  } catch (error) {
    return null;
  }
}

// Fusiona `patch` sobre lo guardado. Un campo string vacio SI se guarda (permite
// borrar un pixel dejando su casilla en blanco).
async function save(key, patch = {}) {
  const current = (await load(key)) || {};
  const merged = { ...current, ...patch };

  const db = await pool();
  if (db) {
    await db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [key, merged]
    );
    return merged;
  }

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(filePathFor(key), JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

module.exports = { load, save };
