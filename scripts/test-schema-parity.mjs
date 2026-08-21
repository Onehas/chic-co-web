import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const server = require("../backend/server.js");

// Esta prueba es una red de seguridad para escalar sin perder datos.
//
// El servidor fusiona cada escritura sobre el estado guardado, asi que nunca
// borra una coleccion que ya existe. Pero el CLIENTE (app.js) reconstruye los
// datos de cada sucursal a partir de listas fijas: `branchDataKeys` (que
// colecciones existen) y `branchOptions` (que sucursales existen). Si esas
// listas se desincronizan del servidor, una coleccion nueva puede:
//   - guardarse en el cliente pero el servidor la ignora (no esta en su lista), o
//   - existir en el servidor pero el cliente la deja de mandar.
// En ambos casos la funcion "se guarda" en apariencia pero no persiste. Esta
// prueba obliga a mantener las dos listas iguales: si alguien agrega una
// coleccion o una sucursal en un solo lado, la suite se pone roja aqui.

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");

// Extrae un arreglo de strings declarado como `const NOMBRE = [ ... ]`.
function extractStringArray(source, name) {
  const match = source.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  assert.ok(match, `no se encontro la declaracion de ${name} en app.js`);
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
}

// Extrae los ids de `const branchOptions = [ { id: "...", ... }, ... ]`.
function extractBranchOptionIds(source) {
  const match = source.match(/const branchOptions\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(match, "no se encontro branchOptions en app.js");
  return [...match[1].matchAll(/id:\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

/* --- Colecciones de sucursal: cliente vs servidor ---------------------- */

const clientCollections = extractStringArray(appSource, "branchDataKeys");
const serverCollections = server.branchDataCollections;

assert.deepEqual(
  [...clientCollections].sort(),
  [...serverCollections].sort(),
  "branchDataKeys (app.js) y branchDataCollections (server.js) deben tener EXACTAMENTE las mismas colecciones. " +
    "Si agregaste una coleccion nueva, agregala en AMBOS lados o no se guardara."
);

/* --- Sucursales: cliente vs servidor ----------------------------------- */

const clientBranchIds = extractBranchOptionIds(appSource);
const serverBranchIds = server.branchIds;

// Toda sucursal que el servidor siembra tiene que ser visible en el cliente,
// o el usuario no podria abrirla ni ver sus datos.
serverBranchIds.forEach((branchId) => {
  assert.ok(
    clientBranchIds.includes(branchId),
    `la sucursal "${branchId}" existe en el servidor pero no en branchOptions (app.js): no se veria`
  );
});

/* --- Permisos de escritura apuntan a colecciones reales ---------------- */

// Cada coleccion listada en moduleWriteCollections debe existir de verdad
// (ser una coleccion de sucursal o "users"), o un permiso apuntaria al vacio.
const validWritableTargets = new Set([...serverCollections, "users"]);
Object.entries(server.moduleWriteCollections).forEach(([moduleName, collections]) => {
  collections.forEach((collectionName) => {
    assert.ok(
      validWritableTargets.has(collectionName),
      `moduleWriteCollections.${moduleName} menciona "${collectionName}", que no es una coleccion real`
    );
  });
});

console.log("Schema parity tests passed");
