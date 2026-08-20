import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { applyWritePolicy, stripSensitiveState, assertPersistableState, clientIp } = require("../backend/server.js");

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

/* --- Escritura de productos sin permiso de inventario -------------------- */

// Facturar descuenta stock, asi que recepcion necesita tocar `products`. Pero
// solo eso: no puede crear productos, borrarlos ni cambiarles el precio.
const stockCurrent = baseState();
stockCurrent.products = [{ id: "PRD-1", name: "Peroxido", stock: 10, min: 2, price: 5000, cost: 3000 }];
stockCurrent.branches.rohrmoser.products = stockCurrent.products;

const stockNext = structuredClone(stockCurrent);
stockNext.products = [
  { id: "PRD-1", name: "Peroxido RENOMBRADO", stock: 9, min: 99, price: 1, cost: 1 },
  { id: "PRD-999", name: "Producto inventado", stock: 500, min: 0, price: 0 }
];
stockNext.branches.rohrmoser.products = stockNext.products;

const stockResult = applyWritePolicy(stockNext, stockCurrent, { userId: "USR-003" });
assert.equal(stockResult.products.length, 1, "no puede agregar productos al catalogo");
assert.equal(stockResult.products[0].stock, 9, "si puede descontar stock al facturar");
assert.equal(stockResult.products[0].name, "Peroxido", "no puede renombrar el producto");
assert.equal(stockResult.products[0].price, 5000, "no puede cambiar el precio");
assert.equal(stockResult.products[0].min, 2, "no puede cambiar el minimo");
assert.equal(
  stockResult.branches.rohrmoser.products.length,
  1,
  "la restriccion tambien aplica dentro de la sucursal"
);

// Un stock negativo o no numerico se ignora en vez de corromper el inventario.
const badStock = structuredClone(stockCurrent);
badStock.products = [{ id: "PRD-1", name: "Peroxido", stock: -50, min: 2, price: 5000, cost: 3000 }];
badStock.branches.rohrmoser.products = badStock.products;
const badResult = applyWritePolicy(badStock, stockCurrent, { userId: "USR-003" });
assert.equal(badResult.products[0].stock, 10, "ignora un stock negativo");

// Facturar solo descuenta: recepcion nunca puede INFLAR el stock por encima del
// actual. Si el documento entrante trae mas stock del que hay, se ignora.
const upStock = structuredClone(stockCurrent);
upStock.products = [{ id: "PRD-1", name: "Peroxido", stock: 999, min: 2, price: 5000, cost: 3000 }];
upStock.branches.rohrmoser.products = upStock.products;
const upResult = applyWritePolicy(upStock, stockCurrent, { userId: "USR-003" });
assert.equal(upResult.products[0].stock, 10, "no puede subir el stock, solo descontarlo");

// Quien si administra inventario conserva control total.
const invUser = baseState();
invUser.products = stockCurrent.products;
invUser.branches.rohrmoser.products = stockCurrent.products;
const invResult = applyWritePolicy(stockNext, invUser, { userId: "USR-000" });
assert.equal(invResult.products.length, 2, "el super usuario si puede agregar productos");
assert.equal(invResult.products[0].name, "Peroxido RENOMBRADO", "y renombrarlos");

/* --- Un guardado parcial nunca puede destruir el estado ------------------ */

// Antes, la rama de acceso total escribia el documento del cliente tal cual:
// un PUT sin `users` ni `branches` persistia un estado sin cuentas y dejaba la
// instancia inaccesible para siempre. Ahora toda escritura se fusiona.
const partialCurrent = baseState();
const partialResult = applyWritePolicy(
  { clients: [{ id: "CL-9", name: "Unico" }] },
  partialCurrent,
  { userId: "USR-000" }
);
assert.equal(partialResult.users.length, 2, "un guardado parcial de super usuario conserva las cuentas");
assert.ok(partialResult.branches?.rohrmoser, "y conserva las sucursales");
assert.equal(partialResult.products.length, 1, "y las colecciones que el payload no traia");
assert.equal(partialResult.clients[0].id, "CL-9", "aplicando lo que si venia");

// El super usuario sigue pudiendo borrar de verdad cuando lo pide explicito.
const deleteNext = structuredClone(partialCurrent);
deleteNext.clients = [];
const deleteResult = applyWritePolicy(deleteNext, partialCurrent, { userId: "USR-000" });
assert.equal(deleteResult.clients.length, 0, "una coleccion vacia explicita si vacia");

// El disco es la ultima barrera: un estado sin usuarios no se guarda nunca.
assert.throws(
  () => assertPersistableState({ clients: [], branches: {} }),
  /sin usuarios/,
  "rechaza persistir un estado sin usuarios"
);
assert.throws(
  () => assertPersistableState({ users: [{ id: "USR-000" }] }),
  /sucursales/,
  "rechaza persistir un estado sin sucursales"
);
assert.ok(assertPersistableState(baseState()), "un estado completo si se puede guardar");

/* --- La IP del limitador no se puede falsificar -------------------------- */

// `X-Forwarded-For` lo escribe el cliente: tomar el primer elemento permitia
// rotar la IP en cada intento y no acumular nunca el contador de fallos.
const spoofed = {
  headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
  socket: { remoteAddress: "127.0.0.1" }
};
assert.equal(clientIp(spoofed), "127.0.0.1", "ignora X-Forwarded-For sin proxys de confianza declarados");

console.log("Security policy tests passed");
