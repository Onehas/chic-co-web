import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { sanitizeTrackingConfig } = require("../backend/server.js");

// Los ids de pixel viajan a la pagina publica y se meten dentro del script del
// pixel. Un valor con basura (espacios, comillas, un intento de inyeccion) no
// debe pasar: se acepta solo la forma esperada de cada plataforma, o vacio.

/* --- Valores validos ---------------------------------------------------- */

const ok = sanitizeTrackingConfig({
  metaPixelId: "123456789012345",
  ga4Id: "G-ABC1234567",
  tiktokPixelId: "CABC123DEF456GHI789"
});
assert.equal(ok.metaPixelId, "123456789012345", "acepta un Meta Pixel numerico");
assert.equal(ok.ga4Id, "G-ABC1234567", "acepta un GA4 con prefijo G-");
assert.equal(ok.tiktokPixelId, "CABC123DEF456GHI789", "acepta un TikTok pixel alfanumerico");

// Se recortan espacios alrededor.
const trimmed = sanitizeTrackingConfig({ metaPixelId: "  123456789012345  " });
assert.equal(trimmed.metaPixelId, "123456789012345", "recorta espacios");

/* --- Valores invalidos se descartan (quedan vacios) --------------------- */

const junk = sanitizeTrackingConfig({
  metaPixelId: "12345<script>",
  ga4Id: "no-empieza-con-g",
  tiktokPixelId: "corto"
});
assert.equal(junk.metaPixelId, "", "un Meta Pixel con basura se descarta");
assert.equal(junk.ga4Id, "", "un GA4 mal formado se descarta");
assert.equal(junk.tiktokPixelId, "", "un TikTok pixel muy corto se descarta");

// Un intento de inyeccion no sobrevive.
const inject = sanitizeTrackingConfig({ metaPixelId: "1');fetch('//evil')//" });
assert.equal(inject.metaPixelId, "", "un intento de inyeccion se descarta");

// Sin entrada, todo queda vacio (nada configurado).
const empty = sanitizeTrackingConfig({});
assert.deepEqual(empty, { metaPixelId: "", ga4Id: "", tiktokPixelId: "" }, "sin datos, nada configurado");

console.log("Tracking tests passed");
