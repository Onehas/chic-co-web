import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { applyWritePolicy, stripSensitiveState } = require("../backend/server.js");

const permissions = {
  clientes: { read: true, write: true },
  inventario: { read: false, write: false },
  procedimientos: { read: false, write: false },
  enCurso: { read: true, write: false },
  planes: { read: true, write: false },
  citas: { read: true, write: true },
  facturacion: { read: true, write: true },
  usuarios: { read: false, write: false }
};

const allPermissions = Object.fromEntries(Object.keys(permissions).map((moduleName) => [moduleName, { read: true, write: true }]));

function baseState() {
  return {
    currentBranchId: "rohrmoser",
    currentUserId: "USR-003",
    clients: [{ id: "CL-1", name: "Cliente original" }],
    products: [{ id: "PRD-1", name: "Producto original", stock: 5 }],
    procedures: [{ id: "SRV-1", name: "Servicio original" }],
    activeProcedures: [],
    plans: [],
    appointments: [],
    invoices: [],
    stockMovements: [],
    locations: [{ id: "UBI-001", name: "Bodega principal" }],
    users: [
      { id: "USR-000", name: "Gabriel", role: "super", active: true, passwordHash: "super-hash", permissions: allPermissions },
      { id: "USR-003", name: "Paola", role: "recepcion", active: true, passwordHash: "recepcion-hash", permissions }
    ],
    branches: {
      rohrmoser: {
        clients: [{ id: "CL-1", name: "Cliente original" }],
        products: [{ id: "PRD-1", name: "Producto original", stock: 5 }],
        procedures: [{ id: "SRV-1", name: "Servicio original" }],
        activeProcedures: [],
        plans: [],
        appointments: [],
        invoices: [],
        stockMovements: [],
        locations: [{ id: "UBI-001", name: "Bodega principal" }]
      }
    }
  };
}

const limitedCurrent = baseState();
const limitedNext = structuredClone(limitedCurrent);
limitedNext.clients = [{ id: "CL-2", name: "Cliente permitido" }];
limitedNext.procedures = [{ id: "SRV-2", name: "Servicio bloqueado" }];
limitedNext.users = [{ id: "USR-003", name: "Paola modificada", role: "super", active: true, passwordHash: "evil", permissions: allPermissions }];
limitedNext.branches.rohrmoser.clients = limitedNext.clients;
limitedNext.branches.rohrmoser.procedures = limitedNext.procedures;

const limitedResult = applyWritePolicy(limitedNext, limitedCurrent, { userId: "USR-003" });
assert.equal(limitedResult.clients[0].id, "CL-2");
assert.equal(limitedResult.procedures[0].id, "SRV-1");
assert.equal(limitedResult.users[1].role, "recepcion");
assert.equal(limitedResult.users[1].passwordHash, "recepcion-hash");
assert.equal(limitedResult.auditLog[0].action, "state.write.limited");

const superCurrent = baseState();
const superNext = structuredClone(superCurrent);
superNext.currentUserId = "USR-000";
superNext.procedures = [{ id: "SRV-2", name: "Servicio permitido" }];
superNext.users[1].role = "admin";
superNext.users[1].passwordHash = "not-allowed";

const superResult = applyWritePolicy(superNext, superCurrent, { userId: "USR-000" });
assert.equal(superResult.procedures[0].id, "SRV-2");
assert.equal(superResult.users[1].role, "admin");
assert.equal(superResult.users[1].passwordHash, "recepcion-hash");
assert.equal(superResult.auditLog[0].action, "state.write");

const publicState = stripSensitiveState(superResult);
assert.equal(publicState.users.some((user) => "passwordHash" in user), false);

/* --- Ubicaciones del inventario ----------------------------------------- */

// Las ubicaciones son datos de inventario: quien no puede escribir inventario
// tampoco puede mover productos de estante.
const placeCurrent = baseState();
const placeNext = structuredClone(placeCurrent);
placeNext.locations = [{ id: "UBI-001", name: "Renombrada por recepcion" }];
placeNext.branches.rohrmoser.locations = placeNext.locations;

const placeResult = applyWritePolicy(placeNext, placeCurrent, { userId: "USR-003" });
assert.equal(
  placeResult.locations[0].name,
  "Bodega principal",
  "recepcion no puede tocar las ubicaciones del inventario"
);

// Un super usuario si puede.
const placeSuper = applyWritePolicy(placeNext, placeCurrent, { userId: "USR-000" });
assert.equal(placeSuper.locations[0].name, "Renombrada por recepcion", "el super usuario si puede renombrarlas");

// La foto de un producto viaja como referencia, nunca como bytes dentro del
// estado: el estado completo se envia en cada guardado.
const photoCurrent = baseState();
const photoNext = structuredClone(photoCurrent);
photoNext.products = [{ id: "PRD-1", name: "Producto", stock: 5, imageId: "a".repeat(32), locationId: "UBI-001", spot: "Estante B" }];
photoNext.branches.rohrmoser.products = photoNext.products;

const photoResult = applyWritePolicy(photoNext, photoCurrent, { userId: "USR-000" });
assert.equal(photoResult.products[0].imageId.length, 32, "el producto guarda solo el identificador de la foto");
assert.equal(photoResult.products[0].spot, "Estante B", "guarda el detalle del lugar");
assert.equal(
  JSON.stringify(photoResult).includes("data:image"),
  false,
  "ninguna imagen viaja embebida en el estado"
);

console.log("Security policy tests passed");
