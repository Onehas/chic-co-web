import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

const require = createRequire(import.meta.url);

const dataDir = new URL("../backend/data", import.meta.url);
await rm(dataDir, { recursive: true, force: true });

const overlay = require("../backend/collection-store.js");
const backup = require("../backend/backup-store.js");

function baseState() {
  return {
    currentBranchId: "rohrmoser",
    stateRevision: 1,
    users: [{ id: "USR-000", name: "A" }],
    branches: {
      rohrmoser: { stockMovements: [], products: [{ id: "PRD-1", name: "Peroxido", stock: 5 }] },
      alajuela: { stockMovements: [] }
    },
    stockMovements: []
  };
}

/* --- Absorber y rellenar --------------------------------------------- */

const s1 = baseState();
s1.branches.rohrmoser.stockMovements = [
  { id: "MOV-1", type: "Salida", quantity: 1, date: "2026-08-20" },
  { id: "MOV-2", type: "Entrada", quantity: 3, date: "2026-08-21" }
];
s1.stockMovements = s1.branches.rohrmoser.stockMovements;

const written = await overlay.absorb(s1, "stockMovements");
assert.equal(written, 2, "absorbe los dos movimientos");

// El documento a persistir ya no lleva la coleccion.
const doc = overlay.stripped(s1, "stockMovements");
assert.equal(doc.stockMovements, undefined, "el nivel superior queda sin la coleccion");
assert.equal(doc.branches.rohrmoser.stockMovements, undefined, "y la sucursal tambien");
assert.ok(doc.branches.rohrmoser.products, "pero conserva lo demas");

// Al rellenar un documento nuevo (sin la coleccion), vuelve desde la tabla.
const fresh = baseState();
delete fresh.branches.rohrmoser.stockMovements;
delete fresh.stockMovements;
await overlay.hydrate(fresh, "stockMovements");
assert.equal(fresh.branches.rohrmoser.stockMovements.length, 2, "rellena la sucursal desde la tabla");
assert.equal(fresh.stockMovements.length, 2, "y el espejo de la sucursal activa");
assert.equal(fresh.stockMovements[0].id, "MOV-2", "ordena por fecha descendente");

/* --- Nunca borra por ausencia (clave para no perder datos) ----------- */

// Un cliente desactualizado guarda SIN MOV-1 (nunca lo vio). No debe borrarlo.
const stale = baseState();
stale.branches.rohrmoser.stockMovements = [{ id: "MOV-3", type: "Salida", quantity: 2, date: "2026-08-22" }];
stale.stockMovements = stale.branches.rohrmoser.stockMovements;
await overlay.absorb(stale, "stockMovements");

const afterStale = baseState();
await overlay.hydrate(afterStale, "stockMovements");
const ids = afterStale.branches.rohrmoser.stockMovements.map((m) => m.id).sort();
assert.deepEqual(ids, ["MOV-1", "MOV-2", "MOV-3"], "un guardado sin un movimiento previo no lo borra");

/* --- Actualizacion por id -------------------------------------------- */

const edit = baseState();
edit.branches.rohrmoser.stockMovements = [{ id: "MOV-1", type: "Salida", quantity: 99, date: "2026-08-20" }];
edit.stockMovements = edit.branches.rohrmoser.stockMovements;
await overlay.absorb(edit, "stockMovements");

const afterEdit = baseState();
await overlay.hydrate(afterEdit, "stockMovements");
const mov1 = afterEdit.branches.rohrmoser.stockMovements.find((m) => m.id === "MOV-1");
assert.equal(mov1.quantity, 99, "actualiza el movimiento existente por id");
assert.equal(afterEdit.branches.rohrmoser.stockMovements.length, 3, "sin duplicarlo");

/* --- No contamina entre sucursales ----------------------------------- */

// El espejo de nivel superior podria venir desincronizado de currentBranchId
// (un bug del cliente en la ventana de cambio de sucursal). La absorcion no
// debe usar ese espejo para atribuir sucursal: solo cuenta lo que hay bajo
// cada branches[b]. Aqui el espejo trae movimientos de rohrmoser pero
// currentBranchId dice "alajuela"; alajuela NO debe recibirlos.
const crossState = baseState();
crossState.currentBranchId = "alajuela";
crossState.branches.rohrmoser.stockMovements = [{ id: "RH-1", date: "2026-08-25" }];
crossState.branches.alajuela.stockMovements = [];
crossState.stockMovements = [{ id: "RH-1", date: "2026-08-25" }]; // espejo mal atribuido
await overlay.absorb(crossState, "stockMovements");

const afterCross = baseState();
await overlay.hydrate(afterCross, "stockMovements");
assert.ok(
  afterCross.branches.rohrmoser.stockMovements.some((m) => m.id === "RH-1"),
  "el movimiento queda en su sucursal real"
);
assert.equal(
  afterCross.branches.alajuela.stockMovements.filter((m) => m.id === "RH-1").length,
  0,
  "y NO se filtra a la otra sucursal"
);

/* --- Purga: empezar de cero borra el overlay de verdad --------------- */

const purgeState = {
  currentBranchId: "rohrmoser",
  branches: {
    rohrmoser: { stockMovements: [{ id: "PG-1", type: "Entrada" }, { id: "PG-2", type: "Salida" }] },
    alajuela: { stockMovements: [{ id: "PG-3", type: "Entrada" }] }
  }
};
await overlay.absorb(purgeState, "stockMovements");
const beforePurge = { branches: { rohrmoser: {}, alajuela: {} } };
await overlay.hydrate(beforePurge, "stockMovements");
assert.ok(beforePurge.branches.rohrmoser.stockMovements.length >= 2, "hay movimientos antes de purgar");

await overlay.purge("stockMovements");
const afterPurge = { branches: { rohrmoser: {}, alajuela: {} } };
await overlay.hydrate(afterPurge, "stockMovements");
assert.equal(afterPurge.branches.rohrmoser.stockMovements.length, 0, "la purga vacia el overlay (rohrmoser)");
assert.equal(afterPurge.branches.alajuela.stockMovements.length, 0, "y tambien alajuela");

/* --- Respaldo automatico --------------------------------------------- */

assert.equal(await backup.count(), 0, "arranca sin respaldos");
await backup.snapshot(baseState(), "prueba-1");
await backup.snapshot(baseState(), "prueba-2");
assert.equal(await backup.count(), 2, "guarda cada instantanea");

const last = await backup.latest();
assert.ok(last, "recupera la ultima instantanea");
assert.ok(last.state?.users, "la instantanea trae el estado completo");

await rm(dataDir, { recursive: true, force: true });

console.log("Overlay tests passed");
