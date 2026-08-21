import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

const require = createRequire(import.meta.url);
const dataDir = new URL("../backend/data", import.meta.url);
await rm(dataDir, { recursive: true, force: true });

const store = require("../backend/password-reset-store.js");

// Un token creado sirve una sola vez para su usuario.
const { token, minutes } = await store.create("USR-000");
assert.ok(token && token.length >= 32, "el token es largo y aleatorio");
assert.ok(minutes > 0, "trae los minutos de vigencia");

const userId = await store.consume(token);
assert.equal(userId, "USR-000", "consume devuelve el usuario del token");

// Consumir de nuevo el mismo token no sirve (un solo uso).
const again = await store.consume(token);
assert.equal(again, null, "un token ya usado no vuelve a servir");

// Un token inventado no sirve.
assert.equal(await store.consume("no-existe"), null, "un token invalido no sirve");
assert.equal(await store.consume(""), null, "un token vacio no sirve");

// Dos tokens distintos para el mismo usuario coexisten.
const a = await store.create("USR-001");
const b = await store.create("USR-001");
assert.notEqual(a.token, b.token, "cada solicitud genera un token distinto");
assert.equal(await store.consume(a.token), "USR-001");
assert.equal(await store.consume(b.token), "USR-001");

await rm(dataDir, { recursive: true, force: true });

console.log("Reset tests passed");
