import { createRequire } from "node:module";
import assert from "node:assert/strict";
import http from "node:http";
import { rm } from "node:fs/promises";

const require = createRequire(import.meta.url);

// Arranca sin credenciales de entorno: la configuracion viene de la app.
delete process.env.ALEGRA_EMAIL;
delete process.env.ALEGRA_TOKEN;
delete process.env.ALEGRA_TAX_ID;
delete process.env.ALEGRA_ENDPOINT;

const dataDir = new URL("../backend/data", import.meta.url);
await rm(dataDir, { recursive: true, force: true });

const alegra = require("../backend/alegra.js");
const store = require("../backend/alegra-config-store.js");

/* --- configure() y currentConfig() ------------------------------------- */

assert.equal(alegra.isConfigured(), false, "sin credenciales no esta configurado");

alegra.configure({ email: "cuenta@chicco.cr", token: "tok-secreto-1234", taxId: "5" });
assert.equal(alegra.isConfigured(), true, "con correo y token queda configurado");

const view = alegra.currentConfig();
assert.equal(view.email, "cuenta@chicco.cr", "expone el correo");
assert.equal(view.hasToken, true, "indica que hay token");
assert.equal(view.tokenHint, "****1234", "solo una pista del token, nunca completo");
assert.equal(view.token, undefined, "la vista publica jamas trae el token en claro");
assert.equal(view.taxId, "5", "expone el id de impuesto");

// Guardar solo el correo no borra el token vigente.
alegra.configure({ email: "otra@chicco.cr" });
assert.equal(alegra.currentConfig().hasToken, true, "un guardado sin token conserva el token previo");
assert.equal(alegra.currentConfig().email, "otra@chicco.cr", "y actualiza el correo");

// clearToken si lo borra.
alegra.configure({ clearToken: true });
assert.equal(alegra.isConfigured(), false, "clearToken deja la cuenta sin token");

/* --- Persistencia en el store (modo archivo) --------------------------- */

await store.save({ email: "cuenta@chicco.cr", token: "tok-persistido-9999", taxId: "7" });
let loaded = await store.load();
assert.equal(loaded.email, "cuenta@chicco.cr", "persiste el correo");
assert.equal(loaded.token, "tok-persistido-9999", "y el token (solo del lado servidor)");

// Guardar solo el taxId no pierde el token guardado.
await store.save({ taxId: "13" });
loaded = await store.load();
assert.equal(loaded.token, "tok-persistido-9999", "un guardado parcial no borra el token");
assert.equal(loaded.taxId, "13", "y actualiza el impuesto");

// clearToken lo elimina del disco.
await store.save({ clearToken: true });
loaded = await store.load();
assert.equal(loaded.token, undefined, "clearToken borra el token guardado");

/* --- testConnection contra un Alegra simulado -------------------------- */

// 200 -> conecta.
const okServer = http.createServer((req, res) => {
  assert.match(req.headers.authorization || "", /^Basic /, "prueba con Basic auth");
  assert.equal(req.url, "/company", "consulta los datos de la empresa");
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ name: "Chic & Co SA" }));
});
await new Promise((resolve) => okServer.listen(0, "127.0.0.1", resolve));
alegra.configure({ email: "c@chicco.cr", token: "t", endpoint: `http://127.0.0.1:${okServer.address().port}` });
const good = await alegra.testConnection();
okServer.close();
assert.equal(good.ok, true, "200 = conecta");
assert.equal(good.name, "Chic & Co SA", "devuelve el nombre de la empresa");

// 401 -> credenciales rechazadas.
const badServer = http.createServer((req, res) => {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: "Unauthorized" }));
});
await new Promise((resolve) => badServer.listen(0, "127.0.0.1", resolve));
alegra.configure({ email: "c@chicco.cr", token: "malo", endpoint: `http://127.0.0.1:${badServer.address().port}` });
const bad = await alegra.testConnection();
badServer.close();
assert.equal(bad.ok, false, "401 = no conecta");
assert.match(bad.reason, /rechazad/i, "explica que las credenciales fueron rechazadas");

await rm(dataDir, { recursive: true, force: true });

console.log("Alegra config tests passed");
