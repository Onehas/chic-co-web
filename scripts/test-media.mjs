import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

const require = createRequire(import.meta.url);

// El almacén en modo archivo escribe en backend/data/media. Se limpia antes de
// empezar para que la prueba no dependa de lo que dejaran ejecuciones previas.
const mediaDir = new URL("../backend/data/media", import.meta.url);
await rm(mediaDir, { recursive: true, force: true });

const media = require("../backend/media-store.js");
const { referencedImageIds } = require("../backend/server.js");

/* --- Detección de formato ---------------------------------------------- */

const png = Buffer.from(
  "89504e470d0a1a0a0000000d494844520000000100000001080600000001f15c4890000000d" +
    "4944415478da6364f8ffff3f0305fe02fea6a3b3f30000000049454e44ae426082",
  "hex"
);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const webp = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.alloc(4),
  Buffer.from("WEBP", "ascii"),
  Buffer.alloc(32)
]);

assert.equal(media.detectImage(png)?.type, "image/png", "reconoce PNG por su firma");
assert.equal(media.detectImage(jpeg)?.type, "image/jpeg", "reconoce JPEG por su firma");
assert.equal(media.detectImage(webp)?.type, "image/webp", "reconoce WebP por su firma");

/* --- El tipo declarado nunca manda -------------------------------------- */

// Un SVG puede transportar scripts: se rechaza aunque venga rotulado como PNG.
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
assert.equal(media.detectImage(svg), null, "no reconoce SVG como imagen admitida");
assert.throws(
  () => media.decodeImage(`data:image/png;base64,${svg.toString("base64")}`),
  /Formato no admitido/,
  "rechaza SVG disfrazado de PNG"
);

// HTML disfrazado de imagen: mismo trato.
const html = Buffer.from("<html><script>alert(1)</script></html>");
assert.throws(
  () => media.decodeImage(`data:image/jpeg;base64,${html.toString("base64")}`),
  /Formato no admitido/,
  "rechaza HTML disfrazado de JPEG"
);

/* --- Validación de entrada ---------------------------------------------- */

assert.throws(() => media.decodeImage(""), /No se recibió/, "rechaza una imagen vacía");
assert.throws(() => media.decodeImage("no-es-base64!!"), /base64/, "rechaza base64 inválido");

const tooBig = Buffer.concat([png, Buffer.alloc(media.maxImageBytes + 1)]);
assert.throws(
  () => media.decodeImage(tooBig.toString("base64")),
  /supera el máximo/,
  "rechaza una imagen por encima del tope"
);

// El data URI es opcional: también acepta base64 pelado.
const bare = media.decodeImage(png.toString("base64"));
assert.equal(bare.contentType, "image/png", "acepta base64 sin prefijo data:");
assert.equal(bare.buffer.length, png.length);

/* --- Guardar, leer y borrar (modo archivo) ------------------------------ */

const saved = await media.saveImage({
  dataUrl: `data:image/png;base64,${png.toString("base64")}`,
  branchId: "rohrmoser",
  ownerId: "PRD-001",
  userId: "USR-000"
});

assert.match(saved.id, /^[a-f0-9]{32}$/, "el identificador es aleatorio y opaco");
assert.equal(saved.contentType, "image/png");
assert.equal(saved.byteSize, png.length);

const loaded = await media.readImage(saved.id);
assert.ok(loaded, "la imagen guardada se puede recuperar");
assert.equal(loaded.contentType, "image/png");
assert.ok(loaded.buffer.equals(png), "los bytes vuelven intactos");

// Un identificador con forma de ruta nunca debe llegar al disco.
assert.equal(await media.readImage("../../etc/passwd"), null, "no acepta rutas como identificador");
assert.equal(await media.readImage("zzz"), null, "no acepta identificadores mal formados");

/* --- Limpieza de huérfanas ---------------------------------------------- */

const keeper = await media.saveImage({ dataUrl: png.toString("base64"), ownerId: "PRD-002" });

// Periodo de gracia: el navegador sube la foto y solo despues guarda el estado
// con su id. Mientras tanto la imagen esta sin referenciar, y cualquier
// guardado que toque productos -facturar descuenta stock- dispara la limpieza.
// Con el periodo de gracia por defecto, esa foto recien subida no se toca.
assert.equal(await media.collectOrphans([]), 0, "no borra fotos recién subidas");
assert.ok(await media.readImage(saved.id), "la foto en curso de asignación sobrevive");

const removed = await media.collectOrphans([keeper.id], { graceMs: 0 });
assert.equal(removed, 1, "borra exactamente la imagen que ya nadie referencia");
assert.equal(await media.readImage(saved.id), null, "la huérfana desaparece");
assert.ok(await media.readImage(keeper.id), "la referenciada sobrevive");

assert.equal(await media.deleteImage(keeper.id), true, "borra por identificador");
assert.equal(await media.deleteImage(keeper.id), false, "borrar dos veces no falla");

/* --- Referencias desde el estado ---------------------------------------- */

const ids = referencedImageIds({
  products: [{ id: "PRD-001", imageId: "aaa" }, { id: "PRD-002" }],
  branches: {
    rohrmoser: { products: [{ id: "PRD-001", imageId: "aaa" }] },
    alajuela: { products: [{ id: "PRD-009", imageId: "bbb" }] }
  }
});
assert.deepEqual([...ids].sort(), ["aaa", "bbb"], "recoge las imágenes de las dos sucursales");
assert.deepEqual([...referencedImageIds({})], [], "un estado sin productos no referencia nada");

await rm(mediaDir, { recursive: true, force: true });

console.log("Media tests passed");
