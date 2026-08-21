import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { applyWritePolicy, clampUserRoles, hasPayrollAccess, payrollCollections } = require("../backend/server.js");

const allPermissions = Object.fromEntries(
  ["clientes", "inventario", "procedimientos", "enCurso", "planes", "citas", "facturacion", "usuarios"].map((m) => [m, { read: true, write: true }])
);
const recepcionPermissions = {
  clientes: { read: true, write: true }, inventario: { read: false, write: false },
  procedimientos: { read: false, write: false }, enCurso: { read: true, write: false },
  planes: { read: true, write: false }, citas: { read: true, write: true },
  facturacion: { read: true, write: true }, usuarios: { read: false, write: false }
};

function baseState() {
  return {
    currentBranchId: "rohrmoser",
    currentUserId: "USR-000",
    clients: [], products: [], procedures: [], activeProcedures: [], plans: [],
    appointments: [], invoices: [], stockMovements: [], locations: [], stations: [],
    commissions: [{ id: "COM-1", worker: "Andrea", period: "2026-08", total: 500000 }],
    benefits: [{ id: "BEN-1", worker: "Andrea", type: "Bono", amount: 20000 }],
    vacations: [{ id: "VAC-1", worker: "Andrea", from: "2026-09-01", to: "2026-09-05" }],
    users: [
      { id: "USR-000", name: "Super", role: "super", active: true, passwordHash: "h", permissions: allPermissions },
      { id: "USR-ADM", name: "Admin", role: "admin", active: true, passwordHash: "h", permissions: allPermissions },
      { id: "USR-HR", name: "RRHH", role: "recepcion", active: true, payrollAccess: true, passwordHash: "h", permissions: recepcionPermissions },
      { id: "USR-REC", name: "Recep", role: "recepcion", active: true, passwordHash: "h", permissions: recepcionPermissions }
    ],
    branches: {
      rohrmoser: { clients: [], products: [], procedures: [], activeProcedures: [], plans: [], appointments: [], invoices: [], stockMovements: [], locations: [], stations: [] }
    }
  };
}
const uid = (s, id) => s.users.find((u) => u.id === id);

assert.deepEqual(payrollCollections, ["staff", "commissions", "benefits", "vacations"]);

/* --- hasPayrollAccess ---------------------------------------------------- */
const st = baseState();
assert.ok(hasPayrollAccess(uid(st, "USR-000")), "el super tiene acceso a planilla");
assert.ok(!hasPayrollAccess(uid(st, "USR-ADM")), "un admin NO tiene acceso por su rol");
assert.ok(hasPayrollAccess(uid(st, "USR-HR")), "una cuenta designada si tiene acceso");
assert.ok(!hasPayrollAccess(uid(st, "USR-REC")), "una recepcion normal no tiene acceso");

/* --- Escritura de planilla ---------------------------------------------- */

// El super edita comisiones: se aplica.
const cur1 = baseState();
const next1 = structuredClone(cur1);
next1.commissions = [{ id: "COM-1", worker: "Andrea", period: "2026-08", total: 999999 }, { id: "COM-2", worker: "Paola", total: 300000 }];
const res1 = applyWritePolicy(next1, cur1, { userId: "USR-000" });
assert.equal(res1.commissions.length, 2, "el super agrega comisiones");
assert.equal(res1.commissions[0].total, 999999, "y las edita");

// La cuenta designada (RRHH) tambien puede.
const res1b = applyWritePolicy(next1, cur1, { userId: "USR-HR" });
assert.equal(res1b.commissions.length, 2, "la cuenta con acceso a RRHH tambien escribe planilla");

// ATAQUE: un admin SIN acceso a RRHH intenta vaciar/editar la planilla. Se
// conserva tal cual estaba: applyExtraTopLevelKeys no toca payroll.
const cur2 = baseState();
const next2 = structuredClone(cur2);
next2.commissions = [];
next2.benefits = [{ id: "BEN-HACK", worker: "X", amount: 1 }];
next2.vacations = [];
const res2 = applyWritePolicy(next2, cur2, { userId: "USR-ADM" });
assert.deepEqual(res2.commissions, cur2.commissions, "un admin sin acceso no puede vaciar comisiones");
assert.deepEqual(res2.benefits, cur2.benefits, "ni tocar beneficios");
assert.deepEqual(res2.vacations, cur2.vacations, "ni vacaciones");

// Una recepcion normal tampoco.
const res3 = applyWritePolicy(next2, cur2, { userId: "USR-REC" });
assert.deepEqual(res3.commissions, cur2.commissions, "una recepcion no puede tocar la planilla");

/* --- Solo el super otorga payrollAccess --------------------------------- */

const tree = {
  users: [
    { id: "USR-000", role: "super", active: true, payrollAccess: true },
    { id: "USR-ADM", role: "admin", active: true, payrollAccess: false },
    { id: "USR-REC", role: "recepcion", active: true, payrollAccess: false }
  ]
};
const asAdmin = { id: "USR-ADM", role: "admin", active: true };
const asSuper = { id: "USR-000", role: "super", active: true };

// Un admin intenta darse acceso a planilla: se revierte.
const admGrantsSelf = clampUserRoles([{ id: "USR-ADM", role: "admin", active: true, payrollAccess: true }], tree, asAdmin);
assert.equal(admGrantsSelf[0].payrollAccess, false, "un admin no se puede dar acceso a planilla");

// Un admin intenta dar acceso a otro: se revierte.
const admGrantsOther = clampUserRoles([{ id: "USR-REC", role: "recepcion", active: true, payrollAccess: true }], tree, asAdmin);
assert.equal(admGrantsOther[0].payrollAccess, false, "un admin no puede dar acceso a planilla a otro");

// El super si puede otorgarlo.
const superGrants = clampUserRoles([{ id: "USR-REC", role: "recepcion", active: true, payrollAccess: true }], tree, asSuper);
assert.equal(superGrants[0].payrollAccess, true, "el super si puede otorgar acceso a planilla");

console.log("Payroll access tests passed");
