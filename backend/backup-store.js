"use strict";

// Respaldo automatico del estado completo.
//
// El disco de Render es efimero: un respaldo en archivo local se pierde al
// reiniciar. Por eso el respaldo durable vive en Postgres, que si persiste. Se
// guarda una instantanea diaria del estado y se conservan las ultimas 30. Aun
// si el documento principal se corrompe o se vacia, siempre hay de donde
// recuperar el dia anterior.
//
// En modo archivo (desarrollo) se escriben instantaneas con fecha en disco.

const path = require("path");
const { promises: fs } = require("fs");

const dataDir = path.join(__dirname, "data");
const backupDir = path.join(dataDir, "backups");
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const keepCount = Number(process.env.CHIC_BACKUP_KEEP || 30);

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
      CREATE TABLE IF NOT EXISTS state_backups (
        id bigserial PRIMARY KEY,
        label text NOT NULL DEFAULT '',
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    pgReady = true;
  }
  return pgPool;
}

// Guarda una instantanea y poda las viejas. `label` distingue el motivo
// (p. ej. la fecha del cierre diario).
async function snapshot(state, label = "") {
  if (!state || typeof state !== "object") return { ok: false, reason: "estado invalido" };

  const db = await pool();
  if (db) {
    await db.query("INSERT INTO state_backups (label, data) VALUES ($1, $2)", [String(label).slice(0, 60), state]);
    await db.query(
      `DELETE FROM state_backups
        WHERE id NOT IN (SELECT id FROM state_backups ORDER BY created_at DESC LIMIT $1)`,
      [keepCount]
    );
    return { ok: true };
  }

  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.writeFile(path.join(backupDir, `state-${stamp}.json`), JSON.stringify(state, null, 2), "utf8");
  const files = (await fs.readdir(backupDir)).filter((name) => name.startsWith("state-")).sort();
  const excess = files.slice(0, Math.max(0, files.length - keepCount));
  await Promise.all(excess.map((name) => fs.unlink(path.join(backupDir, name)).catch(() => {})));
  return { ok: true };
}

// Instantanea mas reciente, para recuperar si el documento principal se daña.
async function latest() {
  const db = await pool();
  if (db) {
    const result = await db.query("SELECT label, data, created_at FROM state_backups ORDER BY created_at DESC LIMIT 1");
    const row = result.rows[0];
    return row ? { label: row.label, state: row.data, createdAt: new Date(row.created_at).toISOString() } : null;
  }

  try {
    const files = (await fs.readdir(backupDir)).filter((name) => name.startsWith("state-")).sort();
    if (!files.length) return null;
    const name = files[files.length - 1];
    const state = JSON.parse(await fs.readFile(path.join(backupDir, name), "utf8"));
    return { label: name, state, createdAt: name };
  } catch (error) {
    return null;
  }
}

async function count() {
  const db = await pool();
  if (db) {
    const result = await db.query("SELECT count(*)::int AS total FROM state_backups");
    return Number(result.rows[0]?.total || 0);
  }
  try {
    return (await fs.readdir(backupDir)).filter((name) => name.startsWith("state-")).length;
  } catch (error) {
    return 0;
  }
}

module.exports = { snapshot, latest, count, keepCount };
