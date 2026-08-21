import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const {
  applyWritePolicy,
  scopeStateForUser,
  branchScopeOf,
  userCanAccessBranch,
  allowedBranchSet
} = require("../backend/server.js");

const allPermissions = Object.fromEntries(
  ["clientes", "inventario", "procedimientos", "enCurso", "planes", "citas", "facturacion", "usuarios"].map((m) => [
    m,
    { read: true, write: true }
  ])
);

const recepcionPermissions = {
  clientes: { read: true, write: true },
  inventario: { read: false, write: false },
  procedimientos: { read: false, write: false },
  enCurso: { read: true, write: false },
  planes: { read: true, write: false },
  citas: { read: true, write: true },
  facturacion: { read: true, write: true },
  usuarios: { read: false, write: false }
};

function branchData(tag) {
  return {
    clients: [{ id: `CL-${tag}`, name: `Cliente ${tag}` }],
    products: [{ id: `PRD-${tag}`, name: `Producto ${tag}`, stock: 5 }],
    procedures: [{ id: `SRV-${tag}`, name: `Servicio ${tag}` }],
    activeProcedures: [],
    plans: [],
    appointments: [{ id: `CIT-${tag}`, date: "2026-09-01", time: "10:00", specialist: "Andrea" }],
    invoices: [{ id: `FAC-${tag}`, clientId: `CL-${tag}`, total: 10000 }],
    stockMovements: [],
    locations: [{ id: `UBI-${tag}`, name: `Bodega ${tag}` }],
    stations: []
  };
}

function baseState() {
  const roh = branchData("ROH");
  return {
    currentBranchId: "rohrmoser",
    currentUserId: "USR-REC-ROH",
    // Nivel superior = espejo de rohrmoser (la sucursal activa global).
    ...structuredClone(roh),
    users: [
      { id: "USR-000", name: "Gabriel", role: "super", active: true, passwordHash: "super-hash", permissions: allPermissions },
      { id: "USR-ADM", name: "Admin", role: "admin", active: true, passwordHash: "admin-hash", permissions: allPermissions },
      {
        id: "USR-REC-ROH",
        name: "Recep Rohrmoser",
        role: "recepcion",
        active: true,
        branchScope: "rohrmoser",
        passwordHash: "roh-hash",
        permissions: recepcionPermissions
      },
      {
        id: "USR-REC-ALA",
        name: "Recep Alajuela",
        role: "recepcion",
        active: true,
        branchScope: "alajuela",
        passwordHash: "ala-hash",
        permissions: recepcionPermissions
      },
      {
        id: "USR-REC-LIBRE",
        name: "Recep sin atar",
        role: "recepcion",
        active: true,
        passwordHash: "libre-hash",
        permissions: recepcionPermissions
      }
    ],
    branches: {
      rohrmoser: structuredClone(roh),
      alajuela: branchData("ALA")
    }
  };
}

const userById = (state, id) => state.users.find((u) => u.id === id);

/* --- branchScopeOf ------------------------------------------------------- */

const st = baseState();
assert.equal(branchScopeOf(userById(st, "USR-000")), "all", "el super ve todas");
assert.equal(branchScopeOf(userById(st, "USR-ADM")), "all", "el admin ve todas");
assert.equal(branchScopeOf(userById(st, "USR-REC-ROH")), "rohrmoser", "recepcion atada a su sede");
assert.equal(branchScopeOf(userById(st, "USR-REC-ALA")), "alajuela", "recepcion atada a su sede");
assert.equal(branchScopeOf(userById(st, "USR-REC-LIBRE")), "all", "sin atar = todas (compatibilidad)");

// Aunque a un super se le pusiera un branchScope, sigue viendo todas: el rol
// manda sobre el campo.
const superConScope = { id: "X", role: "super", active: true, branchScope: "alajuela" };
assert.equal(branchScopeOf(superConScope), "all", "el rol super ignora un branchScope suelto");

/* --- userCanAccessBranch ------------------------------------------------- */

assert.ok(userCanAccessBranch(userById(st, "USR-000"), "alajuela"), "el super entra a cualquier sede");
assert.ok(userCanAccessBranch(userById(st, "USR-REC-ROH"), "rohrmoser"), "recepcion entra a la suya");
assert.ok(!userCanAccessBranch(userById(st, "USR-REC-ROH"), "alajuela"), "recepcion NO entra a la otra");

const setRoh = allowedBranchSet(st, userById(st, "USR-REC-ROH"));
assert.ok(setRoh instanceof Set && setRoh.has("rohrmoser") && !setRoh.has("alajuela"), "el set permitido es solo su sede");
assert.equal(allowedBranchSet(st, userById(st, "USR-000")), null, "el super no tiene set (todas)");

/* --- scopeStateForUser: LECTURA ----------------------------------------- */

// Una recepcion atada a Rohrmoser NO recibe nada de Alajuela.
const forRoh = scopeStateForUser(baseState(), userById(st, "USR-REC-ROH"));
assert.deepEqual(Object.keys(forRoh.branches), ["rohrmoser"], "solo viaja su sucursal en branches");
assert.equal(forRoh.branches.alajuela, undefined, "la otra sede no viaja");
assert.equal(forRoh.currentBranchId, "rohrmoser", "su sucursal queda como activa");
assert.equal(forRoh.clients[0].id, "CL-ROH", "el espejo de nivel superior es el de SU sede");
assert.equal(forRoh.invoices[0].id, "FAC-ROH", "las facturas del nivel superior son las suyas");

// Ningun DATO de sucursal de Alajuela (clientes, facturas, productos, citas...)
// puede aparecer en la respuesta. Se excluye la lista de usuarios: el directorio
// de personal se sigue enviando (sin hashes), no es dato operativo de una sede.
function branchDataFingerprints(state) {
  const { users, ...rest } = state;
  return JSON.stringify(rest);
}
const alajuelaMarkers = ["CL-ALA", "FAC-ALA", "PRD-ALA", "SRV-ALA", "CIT-ALA", "UBI-ALA"];
alajuelaMarkers.forEach((marker) => {
  assert.equal(
    branchDataFingerprints(forRoh).includes(marker),
    false,
    `ningun dato de Alajuela (${marker}) llega a una recepcion de Rohrmoser`
  );
});

// Una recepcion atada a Alajuela recibe SOLO Alajuela, aunque el nivel superior
// guardado sea el espejo de Rohrmoser.
const forAla = scopeStateForUser(baseState(), userById(st, "USR-REC-ALA"));
assert.deepEqual(Object.keys(forAla.branches), ["alajuela"], "solo Alajuela");
assert.equal(forAla.clients[0].id, "CL-ALA", "el nivel superior se reapunta a Alajuela");
["CL-ROH", "FAC-ROH", "PRD-ROH", "SRV-ROH", "CIT-ROH", "UBI-ROH"].forEach((marker) => {
  assert.equal(
    branchDataFingerprints(forAla).includes(marker),
    false,
    `ningun dato de Rohrmoser (${marker}) llega a una recepcion de Alajuela`
  );
});

// El super recibe el estado intacto (las dos sucursales).
const forSuper = scopeStateForUser(baseState(), userById(st, "USR-000"));
assert.deepEqual(Object.keys(forSuper.branches).sort(), ["alajuela", "rohrmoser"], "el super ve ambas");

/* --- applyWritePolicy: ESCRITURA ---------------------------------------- */

// Una recepcion de Rohrmoser guarda un cliente nuevo en SU sede: se aplica.
const cur1 = baseState();
const next1 = structuredClone(cur1);
next1.clients = [{ id: "CL-NUEVO", name: "Nueva de Rohrmoser" }];
next1.branches.rohrmoser.clients = next1.clients;
const res1 = applyWritePolicy(next1, cur1, { userId: "USR-REC-ROH" });
assert.ok(res1.branches.rohrmoser.clients.some((c) => c.id === "CL-NUEVO"), "aplica el cliente en su sede");
assert.equal(res1.branches.alajuela.clients[0].id, "CL-ALA", "Alajuela intacta");

// ATAQUE: una recepcion de Rohrmoser intenta reescribir/vaciar Alajuela en el
// mismo PUT. La sede ajena debe quedar EXACTAMENTE igual que estaba.
const cur2 = baseState();
const next2 = structuredClone(cur2);
next2.branches.alajuela.clients = [{ id: "CL-HACK", name: "Inyectada" }];
next2.branches.alajuela.invoices = []; // intento de borrar facturas de la otra sede
const res2 = applyWritePolicy(next2, cur2, { userId: "USR-REC-ROH" });
assert.equal(res2.branches.alajuela.clients[0].id, "CL-ALA", "no puede inyectar clientes en la otra sede");
assert.equal(res2.branches.alajuela.clients.length, 1, "no puede alterar el conteo de la otra sede");
assert.equal(res2.branches.alajuela.invoices.length, 1, "no puede vaciar las facturas de la otra sede");
assert.deepEqual(res2.branches.alajuela, cur2.branches.alajuela, "la sede ajena queda intacta byte a byte");

// Una recepcion de Alajuela guarda en Alajuela y NO toca Rohrmoser.
const cur3 = baseState();
const next3 = structuredClone(cur3);
next3.branches.alajuela.clients = [{ id: "CL-ALA", name: "Cliente ALA" }, { id: "CL-ALA-2", name: "Otra de Alajuela" }];
const res3 = applyWritePolicy(next3, cur3, { userId: "USR-REC-ALA" });
assert.ok(res3.branches.alajuela.clients.some((c) => c.id === "CL-ALA-2"), "aplica en Alajuela");
assert.deepEqual(res3.branches.rohrmoser, cur3.branches.rohrmoser, "Rohrmoser intacta");

// El super si puede escribir ambas sucursales a la vez.
const cur4 = baseState();
const next4 = structuredClone(cur4);
next4.branches.rohrmoser.clients = [{ id: "CL-ROH-2", name: "Nueva ROH" }];
next4.branches.alajuela.clients = [{ id: "CL-ALA-2", name: "Nueva ALA" }];
const res4 = applyWritePolicy(next4, cur4, { userId: "USR-000" });
assert.ok(res4.branches.rohrmoser.clients.some((c) => c.id === "CL-ROH-2"), "el super escribe Rohrmoser");
assert.ok(res4.branches.alajuela.clients.some((c) => c.id === "CL-ALA-2"), "el super escribe Alajuela");

console.log("Branch isolation tests passed");
