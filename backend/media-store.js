"use strict";

// Almacenamiento de imágenes (fotos de producto).
//
// Las fotos NO pueden vivir dentro de `state`: la aplicación sincroniza todo el
// estado como un solo JSON en cada guardado, con un tope de 2 MB por petición.
// Una docena de fotos en base64 dejaría la app sin poder guardar y obligaría a
// reenviarlas enteras en cada cambio. Por eso viven aparte, y `state` solo
// guarda el identificador.

const path = require("path");
const crypto = require("crypto");
const { promises: fs } = require("fs");

const dataDir = path.join(__dirname, "data");
const mediaDir = path.join(dataDir, "media");
const indexPath = path.join(mediaDir, "index.json");
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

// 900 KB ya descodificado. El navegador reduce la foto antes de subirla, así
// que en la práctica llegan entre 60 y 200 KB.
const maxImageBytes = 900 * 1024;

let pgPool = null;
let pgReady = false;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

/* -------------------------------------------------------------------------
 * Validación del contenido
 * ---------------------------------------------------------------------- */

// Firmas reales de archivo. Nunca se confía en el tipo declarado por el
// cliente: se comprueba el contenido. Solo mapas de bits — SVG queda fuera a
// propósito, porque puede transportar scripts.
const signatures = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/png",
    ext: "png",
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  },
  {
    type: "image/webp",
    ext: "webp",
    test: (b) =>
      b.length > 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP"
  }
];

function detectImage(buffer) {
  return signatures.find((signature) => signature.test(buffer)) || null;
}

// Acepta un data URI o base64 pelado y devuelve el buffer ya verificado.
function decodeImage(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) throw httpError("No se recibió ninguna imagen.", 400);

  const base64 = raw.replace(/^data:[^;,]*;base64,/i, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw httpError("La imagen no tiene formato base64 válido.", 400);
  }

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) throw httpError("La imagen llegó vacía.", 400);
  if (buffer.length > maxImageBytes) {
    throw httpError(`La imagen supera el máximo de ${Math.round(maxImageBytes / 1024)} KB.`, 413);
  }

  const signature = detectImage(buffer);
  if (!signature) {
    throw httpError("Formato no admitido. Use una foto JPG, PNG o WebP.", 415);
  }

  return { buffer, contentType: signature.type, extension: signature.ext };
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
      CREATE TABLE IF NOT EXISTS media_objects (
        id text PRIMARY KEY,
        branch_id text NOT NULL DEFAULT '',
        kind text NOT NULL DEFAULT 'product',
        owner_id text NOT NULL DEFAULT '',
        content_type text NOT NULL,
        byte_size integer NOT NULL,
        checksum text NOT NULL DEFAULT '',
        data bytea NOT NULL,
        created_by text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pgPool.query("CREATE INDEX IF NOT EXISTS media_objects_owner_idx ON media_objects (branch_id, kind, owner_id)");
    pgReady = true;
  }

  return pgPool;
}

/* -------------------------------------------------------------------------
 * Modo archivo (desarrollo local, sin Postgres)
 * ---------------------------------------------------------------------- */

async function readIndex() {
  try {
    return JSON.parse(await fs.readFile(indexPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeIndex(index) {
  await fs.mkdir(mediaDir, { recursive: true });
  const tempPath = `${indexPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(index, null, 2), "utf8");
  await fs.rename(tempPath, indexPath);
}

let indexLock = Promise.resolve();

function withIndexLock(task) {
  const next = indexLock.then(task, task);
  indexLock = next.then(
    () => {},
    () => {}
  );
  return next;
}

/* -------------------------------------------------------------------------
 * API del almacén
 * ---------------------------------------------------------------------- */

async function saveImage({ dataUrl, branchId = "", kind = "product", ownerId = "", userId = "" }) {
  const { buffer, contentType, extension } = decodeImage(dataUrl);
  const id = crypto.randomBytes(16).toString("hex");
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

  const meta = {
    id,
    branchId: String(branchId || "").slice(0, 60),
    kind: String(kind || "product").slice(0, 40),
    ownerId: String(ownerId || "").slice(0, 60),
    contentType,
    byteSize: buffer.length,
    checksum,
    createdBy: String(userId || "").slice(0, 60),
    createdAt: new Date().toISOString()
  };

  const db = await pool();
  if (db) {
    await db.query(
      `INSERT INTO media_objects (id, branch_id, kind, owner_id, content_type, byte_size, checksum, data, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [meta.id, meta.branchId, meta.kind, meta.ownerId, meta.contentType, meta.byteSize, meta.checksum, buffer, meta.createdBy]
    );
    return meta;
  }

  await fs.mkdir(mediaDir, { recursive: true });
  await fs.writeFile(path.join(mediaDir, `${id}.${extension}`), buffer);
  await withIndexLock(async () => {
    const index = await readIndex();
    index[id] = { ...meta, extension };
    await writeIndex(index);
  });
  return meta;
}

async function readImage(rawId) {
  const id = String(rawId || "").trim();
  if (!/^[a-f0-9]{32}$/.test(id)) return null;

  const db = await pool();
  if (db) {
    const result = await db.query("SELECT content_type, data FROM media_objects WHERE id = $1", [id]);
    const row = result.rows[0];
    return row ? { contentType: row.content_type, buffer: row.data } : null;
  }

  const index = await readIndex();
  const meta = index[id];
  if (!meta) return null;
  try {
    const buffer = await fs.readFile(path.join(mediaDir, `${id}.${meta.extension}`));
    return { contentType: meta.contentType, buffer };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function deleteImage(rawId) {
  const id = String(rawId || "").trim();
  if (!/^[a-f0-9]{32}$/.test(id)) return false;

  const db = await pool();
  if (db) {
    const result = await db.query("DELETE FROM media_objects WHERE id = $1", [id]);
    return result.rowCount > 0;
  }

  return withIndexLock(async () => {
    const index = await readIndex();
    const meta = index[id];
    if (!meta) return false;
    delete index[id];
    await writeIndex(index);
    try {
      await fs.unlink(path.join(mediaDir, `${id}.${meta.extension}`));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return true;
  });
}

// Borra las imágenes que ya no referencia ningún producto. Se llama tras
// guardar el estado: si alguien elimina un producto con foto, el archivo no
// debe quedarse ocupando espacio para siempre.
async function collectOrphans(referencedIds) {
  const keep = new Set(Array.from(referencedIds || []).filter(Boolean));

  const db = await pool();
  if (db) {
    const result = await db.query("SELECT id FROM media_objects");
    const orphans = result.rows.map((row) => row.id).filter((id) => !keep.has(id));
    if (!orphans.length) return 0;
    await db.query("DELETE FROM media_objects WHERE id = ANY($1::text[])", [orphans]);
    return orphans.length;
  }

  return withIndexLock(async () => {
    const index = await readIndex();
    const orphans = Object.keys(index).filter((id) => !keep.has(id));
    if (!orphans.length) return 0;
    for (const id of orphans) {
      const meta = index[id];
      delete index[id];
      try {
        await fs.unlink(path.join(mediaDir, `${id}.${meta.extension}`));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await writeIndex(index);
    return orphans.length;
  });
}

module.exports = {
  maxImageBytes,
  decodeImage,
  detectImage,
  saveImage,
  readImage,
  deleteImage,
  collectOrphans
};
