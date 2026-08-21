"use strict";

// Almacen de overlay para colecciones que solo crecen (registros de bitacora
// que se agregan y nunca se editan ni se borran).
//
// El problema de raiz del sistema es que TODA la base vive en un solo documento
// JSON con tope de 2 MB que se reescribe entero en cada guardado. Con el tiempo
// se llena y deja de guardar. Aqui empieza la solucion: las colecciones que
// solo crecen se sacan a una tabla propia y dejan de ocupar espacio en el
// documento.
//
// El overlay es transparente para el navegador:
//   - Al LEER el estado para el cliente, se rellenan (hydrate) desde la tabla.
//   - Al GUARDAR, se absorben (absorb) hacia la tabla y se quitan del documento.
//
// La absorcion es SOLO agregar/actualizar por id, nunca borrar por ausencia.
// Para un registro que solo crece eso es exactamente correcto y hace la
// migracion segura: en el peor caso la tabla crece, jamas pierde una fila. Y si
// la tabla falla, el llamador conserva los datos en el documento (comportamiento
// anterior), asi que un fallo degrada sin perder nada.

const path = require("path");
const { promises: fs } = require("fs");

const dataDir = path.join(__dirname, "data");
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

let pgPool = null;
const readyTables = new Set();

function tableName(collection) {
  // Solo letras/numeros/guion bajo: la coleccion viene de una lista fija del
  // servidor, pero se valida igual antes de interpolarla en el nombre.
  const safe = String(collection).replace(/[^a-z0-9_]/gi, "");
  if (!safe) throw new Error("Coleccion invalida.");
  return `col_${safe}`;
}

async function pool(collection) {
  if (!databaseUrl) return null;
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: databaseUrl, max: 3 });
    // Sin este listener, un cliente ocioso que Postgres cierra (reinicio,
    // timeout de red) emite un 'error' sin manejar y TUMBA el proceso entero.
    pgPool.on("error", (error) => console.error("Pool de Postgres (idle) fallo:", error.message));
  }
  const table = tableName(collection);
  if (!readyTables.has(table)) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        branch_id text NOT NULL,
        item_id text NOT NULL,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (branch_id, item_id)
      )
    `);
    readyTables.add(table);
  }
  return pgPool;
}

function filePath(collection) {
  return path.join(dataDir, `collection-${String(collection).replace(/[^a-z0-9_]/gi, "")}.json`);
}

async function readFile(collection) {
  try {
    return JSON.parse(await fs.readFile(filePath(collection), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeFile(collection, byBranch) {
  await fs.mkdir(dataDir, { recursive: true });
  const target = filePath(collection);
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(byBranch, null, 2), "utf8");
  await fs.rename(temp, target);
}

let lock = Promise.resolve();
function withLock(task) {
  const next = lock.then(task, task);
  lock = next.then(() => {}, () => {});
  return next;
}

// Devuelve { branchId: [items...] } para todas las sucursales.
async function readAll(collection) {
  const db = await pool(collection);
  if (db) {
    const result = await db.query(`SELECT branch_id, data FROM ${tableName(collection)}`);
    const byBranch = {};
    for (const row of result.rows) {
      (byBranch[row.branch_id] = byBranch[row.branch_id] || []).push(row.data);
    }
    return byBranch;
  }

  const store = await readFile(collection);
  const byBranch = {};
  for (const [branchId, items] of Object.entries(store)) {
    byBranch[branchId] = Object.values(items || {});
  }
  return byBranch;
}

// Rellena state.branches[b][collection] y, para la sucursal activa, el espejo de
// nivel superior state[collection]. Ordena por fecha descendente cuando existe.
async function hydrate(state, collection) {
  if (!state || typeof state !== "object") return state;
  const byBranch = await readAll(collection);

  const sortItems = (items) =>
    items.slice().sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")));

  Object.keys(state.branches || {}).forEach((branchId) => {
    state.branches[branchId] = state.branches[branchId] || {};
    state.branches[branchId][collection] = sortItems(byBranch[branchId] || []);
  });

  const active = state.currentBranchId;
  if (active && state.branches?.[active]) {
    state[collection] = state.branches[active][collection].slice();
  }
  return state;
}

// Toma los items de la coleccion en el estado y los agrega/actualiza en la
// tabla, por id. Nunca borra. Devuelve el numero de filas escritas.
async function absorb(state, collection) {
  if (!state || typeof state !== "object") return 0;

  const seen = new Map(); // branchId -> Map(id -> item)
  const collectFrom = (branchId, items) => {
    if (!Array.isArray(items)) return;
    const bucket = seen.get(branchId) || new Map();
    items.forEach((item) => {
      if (item && item.id) bucket.set(String(item.id), item);
    });
    seen.set(branchId, bucket);
  };

  // Se absorbe SOLO desde cada sucursal, nunca desde el espejo de nivel
  // superior. Ese espejo es una copia de la sucursal activa, pero si un PUT
  // llega con `currentBranchId` que no concuerda con el contenido del espejo
  // -un bug del cliente en la ventana de cambio de sucursal-, atribuirlo a la
  // sucursal activa escribia los movimientos de una sucursal en la tabla de la
  // otra. Como el overlay nunca borra, esa contaminacion quedaba permanente.
  // La sucursal siempre es la fuente correcta: el cliente vuelca el espejo a
  // branches[currentBranchId] antes de sincronizar, asi que no se pierde nada.
  Object.entries(state.branches || {}).forEach(([branchId, data]) => collectFrom(branchId, data?.[collection]));

  let written = 0;
  const db = await pool(collection);
  if (db) {
    for (const [branchId, bucket] of seen) {
      for (const [itemId, item] of bucket) {
        await db.query(
          `INSERT INTO ${tableName(collection)} (branch_id, item_id, data, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (branch_id, item_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [branchId, itemId, item]
        );
        written += 1;
      }
    }
    return written;
  }

  await withLock(async () => {
    const store = await readFile(collection);
    for (const [branchId, bucket] of seen) {
      store[branchId] = store[branchId] || {};
      for (const [itemId, item] of bucket) {
        store[branchId][itemId] = item;
        written += 1;
      }
    }
    await writeFile(collection, store);
  });
  return written;
}

// Devuelve una copia del estado con la coleccion vaciada, para persistir el
// documento sin ella. No muta el original.
function stripped(state, collection) {
  const clone = JSON.parse(JSON.stringify(state));
  delete clone[collection];
  Object.values(clone.branches || {}).forEach((data) => {
    if (data && collection in data) delete data[collection];
  });
  return clone;
}

// Borra TODOS los registros de la coleccion overlay (todas las sucursales).
// El overlay nunca borra en el flujo normal (solo agrega/actualiza), asi que
// esta es la unica via para dejarlo realmente vacio al empezar de cero. Sin
// esto, vaciar la coleccion en el estado no bastaria: se rehidrataria.
async function purge(collection) {
  const db = await pool(collection);
  if (db) {
    await db.query(`DELETE FROM ${tableName(collection)}`);
    return;
  }
  await withLock(async () => {
    await writeFile(collection, {});
  });
}

module.exports = {
  hydrate,
  absorb,
  stripped,
  readAll,
  purge
};
