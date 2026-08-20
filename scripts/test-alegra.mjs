import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);

// El adaptador lee las credenciales al cargar el modulo. Se definen antes.
process.env.ALEGRA_EMAIL = "cuenta@chicco.cr";
process.env.ALEGRA_TOKEN = "token-de-prueba";

const alegra = require("../backend/alegra.js");

assert.equal(alegra.isConfigured(), true, "se considera configurado con correo y token");

/* --- Metodos de pago ---------------------------------------------------- */

assert.equal(alegra.mapPaymentMethod("Tarjeta"), "debit-card", "tarjeta -> debit-card");
assert.equal(alegra.mapPaymentMethod("Efectivo"), "cash", "efectivo -> cash");
assert.equal(alegra.mapPaymentMethod("otro"), "cash", "cualquier otro cae en efectivo");

/* --- Mapeo de una factura ----------------------------------------------- */

const invoice = {
  id: "FAC-014",
  date: "2026-08-20",
  clientId: "CL-1",
  procedureId: "SRV-1",
  productId: "PRD-1",
  productQty: 2,
  serviceAmount: 40000,
  productAmount: 20000,
  ivaRate: 13,
  paid: 60000,
  paymentMethod: "Tarjeta",
  notes: "Cliente frecuente"
};

const body = alegra.mapInvoiceToAlegra(invoice, {
  clientName: "Maria Gomez",
  clientEmail: "maria@example.com",
  procedureName: "Limpieza facial",
  productName: "Serum vitamina C"
});

assert.equal(body.date, "2026-08-20", "conserva la fecha");
assert.equal(body.paymentMethod, "debit-card", "traduce el metodo de pago");
assert.equal(body.client.name, "Maria Gomez", "incluye el cliente");
assert.equal(body.client.email, "maria@example.com", "y su correo cuando existe");
assert.equal(body.items.length, 2, "una linea de servicio y una de producto");

const serviceItem = body.items[0];
assert.equal(serviceItem.name, "Limpieza facial", "la primera linea es el servicio");
assert.equal(serviceItem.price, 40000, "con su monto");
assert.equal(serviceItem.quantity, 1, "cantidad 1 para el servicio");
assert.deepEqual(serviceItem.tax, [{ percentage: 13 }], "sin ALEGRA_TAX_ID envia el porcentaje de IVA");

const productItem = body.items[1];
assert.equal(productItem.quantity, 2, "respeta la cantidad de producto");
assert.equal(productItem.price, 10000, "reparte el monto entre las unidades (20000 / 2)");
assert.equal(productItem.price * productItem.quantity, invoice.productAmount, "el total de la linea coincide con lo cobrado");
assert.equal(body.termsConditions, "Chic & Co #FAC-014", "marca el origen para reconciliar");

/* --- Factura sin montos ------------------------------------------------- */

const empty = alegra.mapInvoiceToAlegra({ id: "FAC-000", date: "2026-08-20", ivaRate: 0 }, {});
assert.equal(empty.items.length, 1, "una factura sin montos igual lleva una linea");
assert.equal(empty.client.name, "Cliente de mostrador", "cliente por defecto cuando no hay nombre");

/* --- Envio real contra un servidor simulado ----------------------------- */

// Se levanta un Alegra falso para comprobar autenticacion, cuerpo y respuesta.
const http = require("node:http");
const captured = [];
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    captured.push({ auth: req.headers.authorization, path: req.url, body: JSON.parse(raw || "{}") });
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: 5567, numberTemplate: { fullNumber: "FE-0000001" }, pdf: "https://alegra.com/f/5567.pdf" }));
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

// Se recarga el modulo apuntando al servidor simulado.
delete require.cache[require.resolve("../backend/alegra.js")];
process.env.ALEGRA_ENDPOINT = `http://127.0.0.1:${port}`;
const alegraLive = require("../backend/alegra.js");

const result = await alegraLive.sendInvoice(invoice, { clientName: "Maria Gomez", procedureName: "Limpieza facial" });
server.close();

assert.equal(result.ok, true, "el envio tiene exito");
assert.equal(result.alegraId, "5567", "captura el id de Alegra");
assert.equal(result.number, "FE-0000001", "y el numero de la factura electronica");
assert.equal(result.url, "https://alegra.com/f/5567.pdf", "y el enlace al PDF");

const sent = captured[0];
assert.match(sent.auth, /^Basic /, "usa autenticacion Basic");
assert.equal(
  Buffer.from(sent.auth.replace("Basic ", ""), "base64").toString(),
  "cuenta@chicco.cr:token-de-prueba",
  "con correo y token"
);
assert.equal(sent.path, "/invoices", "publica en el recurso de facturas");
assert.equal(sent.body.client.name, "Maria Gomez", "el cuerpo lleva la factura mapeada");

console.log("Alegra tests passed");
