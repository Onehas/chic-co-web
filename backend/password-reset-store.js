"use strict";

// Tokens de restablecimiento de contrasena, fuera del estado. Un token vive
// pocos minutos, apunta a un usuario y se consume una sola vez. En Postgres es
// una tabla; en desarrollo, un archivo local.

const path = require("path");
const crypto = require("crypto");
const { promises: fs } = require("fs");

const dataDir = path.join(__dirname, "data");
const filePath = path.join(dataDir, "password-resets.json");
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const ttlMs = Number(process.env.CHIC_RESET_TTL_MINUTES || 30) * 60 * 1000;

let pgPool = null;
let pgReady = false;

async function pool() {
  if (!databaseUrl) return null;
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: databaseUrl, max: 2 });
    pgPool.on("error", (error) => console.error("Pool de Postgres (idle) fallo:", error.message));
  }
  if (!pgReady) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        token text PRIMARY KEY,
        user_id text NOT NULL,
        expires_at timestamptz NOT NULL
      )
    `);
    pgReady = true;
  }
  return pgPool;
}

function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function readFileMap() {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    return {};
  }
}

async function writeFileMap(map) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(map, null, 2), "utf8");
}

// Crea un token para el usuario. Devuelve el token y los minutos de vigencia.
async function create(userId) {
  const token = newToken();
  const expiresAt = Date.now() + ttlMs;
  const db = await pool();
  if (db) {
    await db.query("DELETE FROM password_resets WHERE expires_at <= now()");
    await db.query("INSERT INTO password_resets (token, user_id, expires_at) VALUES ($1, $2, to_timestamp($3))", [
      token,
      userId,
      expiresAt / 1000
    ]);
  } else {
    const map = await readFileMap();
    // Poda vencidos.
    const now = Date.now();
    Object.keys(map).forEach((key) => {
      if (!map[key] || map[key].expiresAt <= now) delete map[key];
    });
    map[token] = { userId, expiresAt };
    await writeFileMap(map);
  }
  return { token, minutes: Math.round(ttlMs / 60000) };
}

// Consume un token: devuelve el userId si es valido y lo elimina; null si no.
async function consume(token) {
  const clean = String(token || "");
  if (!clean) return null;
  const db = await pool();
  if (db) {
    const result = await db.query(
      "DELETE FROM password_resets WHERE token = $1 AND expires_at > now() RETURNING user_id",
      [clean]
    );
    return result.rows[0]?.user_id || null;
  }
  const map = await readFileMap();
  const entry = map[clean];
  delete map[clean];
  await writeFileMap(map);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.userId;
}

module.exports = { create, consume, ttlMs };
