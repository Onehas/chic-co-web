import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { applyWritePolicy, bootstrapState } = require("../backend/server.js");

// Esta prueba protege la data que YA existe en produccion cuando el esquema
// evoluciona. Simula un documento "viejo" (de antes de que existieran las
// estaciones, el colaborador en factura, etc., y con restos de otra epoca) y
// comprueba que una escritura del cliente NO lo daña. El servidor fusiona cada
// PUT sobre el estado guardado; nunca reemplaza el documento entero. Si alguien
// rompe esa garantia, esta prueba se pone roja.

function legacyProductionState() {
  const base = bootstrapState();
  const admin = base.users[0]; // USR-000, super
  return {
    ...base,
    currentUserId: admin.id,
    // Una clave de primer nivel de otra epoca (p. ej. datos fiscales viejos).
    // No la conoce el codigo actual; no debe desaparecer al guardar.
    legacyFiscalArchive: [{ id: "OLD-1", note: "documento historico" }],
    branches: {
      rohrmoser: {
        clients: [{ id: "CL-001", name: "Cliente Historico" }],
        products: [{ id: "PRD-001", name: "Producto Viejo", stock: 5, price: 1000 }],
        procedures: [],
        activeProcedures: [],
        plans: [],
        appointments: [],
        invoices: [{ id: "FAC-001", clientId: "CL-001", serviceAmount: 1000, paid: 1000 }],
        stockMovements: [],
        locations: []
        // OJO: sin `stations`. Es data anterior a esa coleccion.
      },
      alajuela: {
        clients: [],
        products: [],
        procedures: [],
        activeProcedures: [],
        plans: [],
        appointments: [],
        invoices: [],
        stockMovements: [],
        locations: []
      },
      // Una sucursal que el cliente actual no lista en branchOptions. Su data
      // debe sobrevivir aunque el cliente no la muestre ni la reenvie.
      cartago: {
        clients: [{ id: "CL-900", name: "Cliente de Cartago" }],
        invoices: [{ id: "FAC-900", clientId: "CL-900", serviceAmount: 5000, paid: 0 }]
      }
    }
  };
}

const session = { userId: "USR-000" };

/* --- Un guardado del cliente no borra data que no reenvia -------------- */

// El cliente moderno normaliza el estado y, al hacerlo, deja fuera la sucursal
// "cartago" (no esta en branchOptions) y no incluye `stations`. Simulamos ese
// PUT: solo trae rohrmoser y alajuela, con una coleccion nueva de estaciones.
const current = legacyProductionState();
const clientPut = {
  currentUserId: "USR-000",
  currentBranchId: "rohrmoser",
  users: current.users,
  branches: {
    rohrmoser: {
      clients: [
        { id: "CL-001", name: "Cliente Historico" },
        { id: "CL-002", name: "Cliente Nuevo" }
      ],
      products: [{ id: "PRD-001", name: "Producto Viejo", stock: 5, price: 1000 }],
      procedures: [],
      activeProcedures: [],
      plans: [],
      appointments: [],
      invoices: [{ id: "FAC-001", clientId: "CL-001", serviceAmount: 1000, paid: 1000 }],
      stockMovements: [],
      locations: [],
      stations: [{ id: "EST-001", type: "estetica", name: "Cabina 1" }]
    },
    alajuela: current.branches.alajuela
    // cartago NO viaja en el PUT (el cliente lo dejo fuera).
  }
};

const result = applyWritePolicy(clientPut, current, session);

// 1. La sucursal desconocida y su data siguen intactas.
assert.ok(result.branches.cartago, "la sucursal 'cartago' no debe desaparecer al guardar");
assert.equal(
  result.branches.cartago.clients[0].name,
  "Cliente de Cartago",
  "la data de la sucursal que el cliente no reenvia se conserva"
);
assert.equal(result.branches.cartago.invoices[0].id, "FAC-900", "sus facturas tambien se conservan");

// 2. La clave de primer nivel de otra epoca sobrevive.
assert.ok(Array.isArray(result.legacyFiscalArchive), "una clave de primer nivel vieja no se borra");
assert.equal(result.legacyFiscalArchive[0].id, "OLD-1", "y conserva su contenido");

// 3. Lo que el cliente si escribio se aplica.
assert.equal(result.branches.rohrmoser.clients.length, 2, "el cliente nuevo se agrega");
assert.equal(result.branches.rohrmoser.stations.length, 1, "la coleccion nueva de estaciones persiste");
assert.equal(result.branches.rohrmoser.invoices[0].id, "FAC-001", "la factura historica sigue ahi");

/* --- Un PUT que "olvida" una coleccion no la vacia -------------------- */

// Si el cliente manda una sucursal SIN la clave `invoices` (por un bug o una
// version vieja), el servidor conserva las facturas guardadas en vez de
// borrarlas.
const forgetful = {
  currentUserId: "USR-000",
  currentBranchId: "rohrmoser",
  users: current.users,
  branches: {
    rohrmoser: {
      clients: [{ id: "CL-001", name: "Cliente Historico" }]
      // sin invoices, sin products, etc.
    }
  }
};

const result2 = applyWritePolicy(forgetful, legacyProductionState(), session);
assert.equal(
  result2.branches.rohrmoser.invoices[0].id,
  "FAC-001",
  "una coleccion ausente en el PUT no se vacia: se conserva la guardada"
);
assert.equal(
  result2.branches.rohrmoser.products[0].id,
  "PRD-001",
  "los productos guardados se conservan aunque el PUT no los traiga"
);

console.log("Migration safety tests passed");
