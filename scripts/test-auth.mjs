import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const {
  hashPassword,
  hashPasswordModern,
  verifyPassword,
  applySystemUserAuth,
  bootstrapState,
  stateRevision,
  stampRevision
} = require("../backend/server.js");

/* --- Hash de contrasenas ------------------------------------------------ */

const modern = hashPasswordModern("ClaveDePrueba2026");
assert.ok(modern.startsWith("scrypt$"), "el hash nuevo usa scrypt");
assert.equal(modern.split("$").length, 3, "el hash guarda algoritmo, sal y digest");
assert.ok(verifyPassword("ClaveDePrueba2026", modern), "acepta la contrasena correcta");
assert.equal(verifyPassword("otra", modern), false, "rechaza una contrasena incorrecta");

// Dos hashes de la misma contrasena difieren: la sal es por usuario.
assert.notEqual(hashPasswordModern("ClaveDePrueba2026"), modern, "cada hash lleva su propia sal");

// Las cuentas anteriores siguen entrando con su hash sha256 heredado.
assert.ok(verifyPassword("hola", hashPassword("hola")), "verifica el hash heredado sha256");
assert.equal(verifyPassword("hola", ""), false, "una cuenta sin hash no puede entrar");
assert.equal(verifyPassword("", ""), false, "una contrasena vacia no entra por hash vacio");

/* --- Cuentas de sistema ------------------------------------------------- */

// El rol y los permisos siguen fijados desde el servidor.
const escalated = applySystemUserAuth({
  users: [{ id: "USR-002", role: "super", permissions: { usuarios: { read: true, write: true } }, passwordHash: "propio" }]
});
assert.equal(escalated.users[0].role, "recepcion", "no se puede escalar el rol de una cuenta de sistema");
assert.equal(escalated.users[0].permissions.usuarios.write, false, "los permisos siguen fijados");

// Pero la contrasena guardada se respeta: por eso se puede cambiar.
assert.equal(escalated.users[0].passwordHash, "propio", "conserva el hash elegido por el usuario");

// Ya no se hornea ninguna contrasena por defecto. Sin la variable de entorno,
// una cuenta de sistema sin hash sigue sin hash y no puede entrar hasta que un
// super usuario le fije la contrasena desde la app.
const seeded = applySystemUserAuth({ users: [{ id: "USR-002", passwordHash: "" }] });
assert.equal(seeded.users[0].passwordHash, "", "sin variable de entorno no hay contrasena por defecto");

// USR-001 ya no es una cuenta super de sistema: se puede administrar como
// cualquier otra, sin que el servidor le re-fije el rol super.
const legacy = applySystemUserAuth({ users: [{ id: "USR-001", role: "recepcion", passwordHash: "x" }] });
assert.notEqual(legacy.users[0].role, "super", "USR-001 no queda fijado como super");

/* --- Estado inicial ----------------------------------------------------- */

const initial = bootstrapState();
assert.equal(initial.users.length, 5, "el estado inicial trae las cinco cuentas");
assert.equal(initial.currentBranchId, "rohrmoser");
assert.deepEqual(Object.keys(initial.branches).sort(), ["alajuela", "rohrmoser"]);
assert.deepEqual(initial.branches.rohrmoser.invoices, [], "las sucursales arrancan vacias");
assert.equal(stateRevision(initial), 1, "el estado inicial arranca en la revision 1");

// Sin CHIC_BOOTSTRAP_PASSWORD el super usuario queda sin hash y no puede
// entrar: no se hornea ninguna contrasena de administrador por defecto.
assert.equal(initial.users[0].passwordHash, "", "sin variables de arranque no hay contrasena por defecto");

/* --- Revisiones --------------------------------------------------------- */

const stamped = stampRevision({ clients: [] }, initial);
assert.equal(stateRevision(stamped), 2, "cada escritura incrementa la revision");
assert.ok(stamped.updatedAt, "cada escritura deja fecha de actualizacion");
assert.equal(stateRevision({}), 0, "un estado sin revision cuenta como cero");

console.log("Auth tests passed");
