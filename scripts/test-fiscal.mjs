import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { clave, docType, taxRateCode, fiscalDate, buildXml } = require("../backend/server-phase4.js");
const { validateInvoice } = require("../backend/server-phase3.js");

const config = {
  branchId: "rohrmoser",
  environment: "Sandbox",
  issuerIdType: "01",
  issuerIdNumber: "3101234567",
  issuerLegalName: "Chic & Co",
  economicActivityCode: "960201",
  branchCode: "001",
  terminalCode: "00001",
  issuerEmail: "fiscal@chicco.cr",
  defaultCurrency: "CRC"
};

/* --- Clave de 50 digitos ------------------------------------------------ */

const consecutivo = "00100001040000000001";
assert.equal(consecutivo.length, 20, "el consecutivo tiene 20 digitos");

const key = clave(config, { date: "2026-08-19" }, "04", consecutivo);
assert.equal(key.length, 50, "la clave tiene exactamente 50 posiciones");
assert.match(key, /^\d{50}$/, "la clave es solo numerica");
assert.ok(key.startsWith("506"), "la clave arranca con el codigo de pais");
assert.equal(key.slice(3, 9), "190826", "la fecha va en formato ddmmaa");
assert.ok(key.includes(consecutivo), "la clave contiene el consecutivo");

// El codigo de seguridad cambia entre comprobantes, la parte fija no.
const otherKey = clave(config, { date: "2026-08-19" }, "04", consecutivo);
assert.equal(key.slice(0, 42), otherKey.slice(0, 42), "la parte fija de la clave es estable");

/* --- Fechas ------------------------------------------------------------- */

assert.equal(fiscalDate("2026-01-05"), "050126", "rellena dia y mes con cero");
assert.equal(fiscalDate("2026-12-31"), "311226");

/* --- Tipos y tarifas ---------------------------------------------------- */

assert.equal(docType("01"), "01", "acepta factura electronica");
assert.equal(docType("04"), "04", "acepta tiquete electronico");
assert.equal(docType("99"), "04", "un tipo desconocido cae a tiquete");
assert.equal(taxRateCode(13), "08", "la tarifa general es el codigo 08");
assert.equal(taxRateCode(0), "01", "la tarifa exenta es el codigo 01");
assert.equal(taxRateCode(4), "04");

/* --- XML ---------------------------------------------------------------- */

const validation = {
  documentType: "04",
  invoice: { date: "2026-08-19", paymentMethod: "Efectivo", serviceAmount: 20000, productAmount: 0 },
  client: { name: "Ana <Rojas> & Cia", email: "ana@ejemplo.cr", fiscalIdType: "01", fiscalIdNumber: "112340567" },
  totals: { currency: "CRC", subtotal: 20000, taxRate: 13, tax: 2600, total: 22600 },
  lineItems: [{ description: "Facial", quantity: 1, amount: 20000, taxRate: 13, cabys: "9602010000000" }]
};

const xml = buildXml(validation, config, { clave: key, consecutivo, issuedAt: "2026-08-19T12:00:00-06:00" });
assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), "el XML declara su version");
assert.ok(xml.includes("<TiqueteElectronico"), "usa la raiz del tipo de comprobante");
assert.ok(xml.includes(`<Clave>${key}</Clave>`), "el XML lleva la clave");
assert.ok(xml.includes("<CodigoCABYS>9602010000000</CodigoCABYS>"), "el XML lleva el CABYS de la linea");
assert.ok(xml.includes("<MedioPago>01</MedioPago>"), "efectivo es el medio de pago 01");

// Los datos del cliente se escapan: un nombre con < o & no rompe el XML.
assert.ok(xml.includes("Ana &lt;Rojas&gt; &amp; Cia"), "escapa los caracteres reservados de XML");
assert.equal(xml.includes("<Rojas>"), false, "no deja etiquetas inyectadas por el nombre");

/* --- Validacion fiscal de la factura ------------------------------------ */

const state = {
  currentBranchId: "rohrmoser",
  branches: {
    rohrmoser: {
      clients: [{ id: "CL-001", name: "Ana Rojas", email: "ana@ejemplo.cr" }],
      products: [],
      procedures: [{ id: "SRV-001", name: "Facial" }],
      invoices: [
        {
          id: "FAC-001",
          date: "2026-08-19",
          clientId: "CL-001",
          procedureId: "SRV-001",
          serviceAmount: 20000,
          productAmount: 0,
          ivaRate: 13,
          paid: 22600,
          paymentMethod: "Efectivo"
        }
      ]
    }
  }
};

const result = await validateInvoice(state, "rohrmoser", "FAC-001", "04");
assert.equal(result.invoiceId, "FAC-001");
assert.equal(result.totals.subtotal, 20000, "el subtotal suma servicio y producto");
assert.equal(result.totals.tax, 2600, "el IVA del 13 por ciento se redondea a colones");
assert.equal(result.totals.total, 22600, "el total suma subtotal e impuesto");
assert.ok(result.canCreateDraft, "una factura existente permite borrador");

// Sin configuracion fiscal la factura queda bloqueada, no lista.
assert.equal(result.status, "Blocked", "sin datos del emisor no se puede emitir");
assert.ok(
  result.errors.some((finding) => finding.field === "issuerIdNumber"),
  "reporta que falta la identificacion del emisor"
);
assert.ok(
  result.warnings.some((finding) => finding.field === "cabys"),
  "avisa que falta el CABYS de la linea"
);

// Una factura inexistente no puede generar borrador.
const missing = await validateInvoice(state, "rohrmoser", "FAC-999", "04");
assert.equal(missing.canCreateDraft, false, "no crea borrador sin factura");

// La factura electronica exige identificacion fiscal del cliente.
const asInvoice = await validateInvoice(state, "rohrmoser", "FAC-001", "01");
assert.ok(
  asInvoice.errors.some((finding) => finding.field === "clientFiscalId"),
  "la factura electronica exige cedula del receptor"
);

console.log("Fiscal tests passed");
