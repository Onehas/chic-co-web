"use strict";

const path = require("path");
const crypto = require("crypto");
const { promises: fs } = require("fs");
const { server } = require("./server");

require("./server-phase3");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const storePath = path.join(dataDir, "hacienda-phase3.json");
const port = Number(process.env.PORT || 4173);
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
let pgPool = null;
let pgReady = false;

const meta = {
  "01": ["Factura electronica", "FacturaElectronica", "https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica"],
  "04": ["Tiquete electronico", "TiqueteElectronico", "https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/tiqueteElectronico"]
};

function clean(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function digits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function money(value) {
  const next = Number(value || 0);
  return (Number.isFinite(next) ? next : 0).toFixed(5);
}

function number(value) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function branchId(value) {
  const id = clean(value || "rohrmoser").toLowerCase();
  if (!/^[a-z0-9_-]{2,60}$/.test(id)) throw Object.assign(new Error("Sucursal fiscal invalida."), { statusCode: 400 });
  return id;
}

function docType(value) {
  const type = clean(value || "04");
  return meta[type] ? type : "04";
}

function xml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function sendXml(res, status, payload) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(status, { "Content-Type": "application/xml; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > 1024 * 1024) {
        reject(new Error("REQUEST_TOO_LARGE"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const body = await readBody(req);
  return body ? JSON.parse(body) : {};
}

async function pool() {
  if (!databaseUrl) return null;
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: databaseUrl, max: 3 });
  }
  if (!pgReady) {
    await pgPool.query(`CREATE TABLE IF NOT EXISTS hacienda_consecutive_counters (id text PRIMARY KEY, branch_id text NOT NULL, document_type text NOT NULL, branch_code text NOT NULL, terminal_code text NOT NULL, last_number bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (branch_id, document_type, branch_code, terminal_code))`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS hacienda_electronic_documents (id text PRIMARY KEY, branch_id text NOT NULL, invoice_id text NOT NULL, document_type text NOT NULL, clave text NOT NULL DEFAULT '', consecutivo text NOT NULL DEFAULT '', issued_at timestamptz, environment text NOT NULL DEFAULT 'Sandbox', internal_status text NOT NULL DEFAULT 'Draft', hacienda_status text NOT NULL DEFAULT '', validation_status text NOT NULL DEFAULT 'Pending', validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb, totals jsonb NOT NULL DEFAULT '{}'::jsonb, xml_original text NOT NULL DEFAULT '', xml_signed text NOT NULL DEFAULT '', xml_hacienda_response text NOT NULL DEFAULT '', json_sent jsonb NOT NULL DEFAULT '{}'::jsonb, http_status integer, location_header text NOT NULL DEFAULT '', hacienda_error text NOT NULL DEFAULT '', attempt_count integer NOT NULL DEFAULT 0, last_attempt_at timestamptz, sent_at timestamptz, response_at timestamptz, next_status_check_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (branch_id, invoice_id, document_type))`);
    pgReady = true;
  }
  return pgPool;
}

async function fileStore() {
  try {
    return JSON.parse(await fs.readFile(storePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { documents: [], counters: {}, auditLog: [] };
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(dataDir, { recursive: true });
  const tmp = `${storePath}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, storePath);
}

async function api(req, apiPath, options = {}) {
  const authorization = String(req.headers.authorization || "");
  const response = await fetch(`http://127.0.0.1:${port}${apiPath}`, {
    method: options.method || "GET",
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    payload = {};
  }
  return { ok: response.ok, status: response.status, payload, text };
}

async function requireLogin(req) {
  const response = await api(req, "/api/state");
  if (!response.ok) throw Object.assign(new Error(response.payload?.message || "Sesion requerida."), { statusCode: response.status });
  return response.payload?.state || {};
}

async function requireAdmin(req) {
  const response = await api(req, "/api/audit");
  if (!response.ok) throw Object.assign(new Error("Solo un administrador puede generar XML fiscal."), { statusCode: response.status === 401 ? 401 : 403 });
}

async function readConfig(id) {
  const db = await pool();
  if (db) {
    const result = await db.query("SELECT * FROM hacienda_company_settings WHERE branch_id = $1", [id]);
    const row = result.rows[0] || {};
    return {
      branchId: id,
      environment: row.environment || "Sandbox",
      issuerIdType: row.issuer_id_type || "",
      issuerIdNumber: row.issuer_id_number || "",
      issuerLegalName: row.issuer_legal_name || "Chic & Co",
      economicActivityCode: row.economic_activity_code || "",
      branchCode: row.branch_code || "",
      terminalCode: row.terminal_code || "",
      issuerEmail: row.issuer_email || "",
      defaultCurrency: row.default_currency || "CRC"
    };
  }
  return { branchId: id, environment: "Sandbox", issuerIdType: "", issuerIdNumber: "", issuerLegalName: "Chic & Co", economicActivityCode: "", branchCode: "", terminalCode: "", issuerEmail: "", defaultCurrency: "CRC" };
}

async function validate(req, id, invoiceId, type) {
  const response = await api(req, "/api/hacienda/validate-invoice", { method: "POST", body: { branchId: id, invoiceId, documentType: type } });
  if (!response.ok) throw Object.assign(new Error(response.payload?.message || "No se pudo validar la factura."), { statusCode: response.status });
  return response.payload?.validation || {};
}

function fiscalDate(date) {
  const value = clean(date);
  const parsed = value ? new Date(`${value}T12:00:00-06:00`) : new Date();
  return `${String(parsed.getDate()).padStart(2, "0")}${String(parsed.getMonth() + 1).padStart(2, "0")}${String(parsed.getFullYear()).slice(-2)}`;
}

function issuedAt(date) {
  const value = clean(date);
  if (value) return `${value}T12:00:00-06:00`;
  return `${new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 19)}-06:00`;
}

function clave(config, invoice, type, consecutivo) {
  const security = String(crypto.randomInt(0, 100000000)).padStart(8, "0");
  return `506${fiscalDate(invoice?.date)}${digits(config.issuerIdNumber).padStart(12, "0").slice(-12)}${consecutivo}1${security}`;
}

async function existingDoc(id, invoiceId, type) {
  const db = await pool();
  if (db) {
    const result = await db.query("SELECT * FROM hacienda_electronic_documents WHERE branch_id = $1 AND invoice_id = $2 AND document_type = $3", [id, invoiceId, type]);
    return result.rows[0] || null;
  }
  const store = await fileStore();
  return (store.documents || []).find((doc) => doc.branchId === id && doc.invoiceId === invoiceId && doc.documentType === type) || null;
}

async function nextConsecutive(config, id, type, existing) {
  if (existing) return existing;
  const branchCode = digits(config.branchCode).padStart(3, "0").slice(-3);
  const terminalCode = digits(config.terminalCode).padStart(5, "0").slice(-5);
  const db = await pool();
  if (db) {
    const counterId = `${id}:${type}:${branchCode}:${terminalCode}`;
    const result = await db.query(`INSERT INTO hacienda_consecutive_counters (id, branch_id, document_type, branch_code, terminal_code, last_number, updated_at) VALUES ($1,$2,$3,$4,$5,1,now()) ON CONFLICT (branch_id, document_type, branch_code, terminal_code) DO UPDATE SET last_number = hacienda_consecutive_counters.last_number + 1, updated_at = now() RETURNING last_number`, [counterId, id, type, branchCode, terminalCode]);
    return `${branchCode}${terminalCode}${type}${String(result.rows[0].last_number).padStart(10, "0").slice(-10)}`;
  }
  const store = await fileStore();
  const key = `${id}:${type}:${branchCode}:${terminalCode}`;
  const lastNumber = Number(store.counters?.[key]?.lastNumber || 0) + 1;
  store.counters = { ...(store.counters || {}), [key]: { branchId: id, documentType: type, branchCode, terminalCode, lastNumber, updatedAt: new Date().toISOString() } };
  await writeStore(store);
  return `${branchCode}${terminalCode}${type}${String(lastNumber).padStart(10, "0").slice(-10)}`;
}

function payment(method) {
  return method === "Tarjeta" ? "02" : "01";
}

function taxRateCode(rate) {
  if (Number(rate) === 0) return "01";
  if (Number(rate) === 1) return "02";
  if (Number(rate) === 2) return "03";
  if (Number(rate) === 4) return "04";
  return "08";
}

function lineXml(line, index) {
  const qty = Math.max(1, number(line.quantity || 1));
  const sub = number(line.amount);
  const rate = number(line.taxRate || 13);
  const tax = Math.round(sub * (rate / 100));
  return `    <LineaDetalle>
      <NumeroLinea>${index}</NumeroLinea>
      <CodigoCABYS>${digits(line.cabys).padStart(13, "0").slice(-13)}</CodigoCABYS>
      <Cantidad>${money(qty)}</Cantidad>
      <UnidadMedida>Sp</UnidadMedida>
      <Detalle>${xml(line.description || "Servicio Chic & Co")}</Detalle>
      <PrecioUnitario>${money(sub / qty)}</PrecioUnitario>
      <MontoTotal>${money(sub)}</MontoTotal>
      <SubTotal>${money(sub)}</SubTotal>
      <Impuesto><Codigo>01</Codigo><CodigoTarifa>${taxRateCode(rate)}</CodigoTarifa><Tarifa>${money(rate)}</Tarifa><Monto>${money(tax)}</Monto></Impuesto>
      <ImpuestoNeto>${money(tax)}</ImpuestoNeto>
      <MontoTotalLinea>${money(sub + tax)}</MontoTotalLinea>
    </LineaDetalle>`;
}

function receptorXml(validation, type) {
  const client = validation.client || {};
  if (type === "04" && (!client.fiscalIdType || !client.fiscalIdNumber)) return "";
  return `  <Receptor>
    <Nombre>${xml(client.name || "Cliente")}</Nombre>
    <Identificacion><Tipo>${xml(client.fiscalIdType || "01")}</Tipo><Numero>${xml(client.fiscalIdNumber || "000000000")}</Numero></Identificacion>
    ${client.email ? `<CorreoElectronico>${xml(client.email)}</CorreoElectronico>` : ""}
  </Receptor>`;
}

function buildXml(validation, config, fiscal) {
  const type = docType(validation.documentType);
  const [label, root, ns] = meta[type];
  const invoice = validation.invoice || {};
  const totals = validation.totals || {};
  const lines = Array.isArray(validation.lineItems) && validation.lineItems.length ? validation.lineItems : [{ description: label, quantity: 1, amount: totals.subtotal || 0, taxRate: totals.taxRate || 13 }];
  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="${ns}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${ns} ${ns}.xsd">
  <Clave>${fiscal.clave}</Clave>
  <CodigoActividad>${xml(config.economicActivityCode)}</CodigoActividad>
  <NumeroConsecutivo>${fiscal.consecutivo}</NumeroConsecutivo>
  <FechaEmision>${fiscal.issuedAt}</FechaEmision>
  <Emisor>
    <Nombre>${xml(config.issuerLegalName || "Chic & Co")}</Nombre>
    <Identificacion><Tipo>${xml(config.issuerIdType || "01")}</Tipo><Numero>${xml(config.issuerIdNumber)}</Numero></Identificacion>
    ${config.issuerEmail ? `<CorreoElectronico>${xml(config.issuerEmail)}</CorreoElectronico>` : ""}
  </Emisor>
${receptorXml(validation, type)}
  <CondicionVenta>01</CondicionVenta>
  <MedioPago>${payment(invoice.paymentMethod)}</MedioPago>
  <DetalleServicio>
${lines.map((line, index) => lineXml(line, index + 1)).join("\n")}
  </DetalleServicio>
  <ResumenFactura>
    <CodigoTipoMoneda><CodigoMoneda>${xml(totals.currency || config.defaultCurrency || "CRC")}</CodigoMoneda><TipoCambio>1.00000</TipoCambio></CodigoTipoMoneda>
    <TotalServGravados>${money(invoice.serviceAmount || 0)}</TotalServGravados>
    <TotalMercanciasGravadas>${money(invoice.productAmount || 0)}</TotalMercanciasGravadas>
    <TotalGravado>${money(totals.subtotal || 0)}</TotalGravado>
    <TotalVenta>${money(totals.subtotal || 0)}</TotalVenta>
    <TotalVentaNeta>${money(totals.subtotal || 0)}</TotalVentaNeta>
    <TotalImpuesto>${money(totals.tax || 0)}</TotalImpuesto>
    <TotalComprobante>${money(totals.total || 0)}</TotalComprobante>
  </ResumenFactura>
</${root}>`;
}

function publicDoc(row) {
  if (!row) return null;
  const totals = typeof row.totals === "string" ? JSON.parse(row.totals || "{}") : row.totals || {};
  const payload = typeof row.json_sent === "string" ? JSON.parse(row.json_sent || "{}") : row.json_sent || row.payload || {};
  return {
    id: row.id,
    branchId: row.branch_id || row.branchId,
    invoiceId: row.invoice_id || row.invoiceId,
    documentType: row.document_type || row.documentType,
    documentTypeLabel: meta[row.document_type || row.documentType]?.[0] || "",
    clave: row.clave || "",
    consecutivo: row.consecutivo || "",
    issuedAt: row.issued_at instanceof Date ? row.issued_at.toISOString() : row.issued_at || row.issuedAt || "",
    environment: row.environment || "Sandbox",
    internalStatus: row.internal_status || row.internalStatus || "XmlReady",
    validationStatus: row.validation_status || row.validationStatus || "XmlReady",
    totals,
    payload,
    hasUnsignedXml: Boolean(row.xml_original || row.xmlOriginal)
  };
}

async function saveDocument(validation, fiscal, unsignedXml, status) {
  const payload = { phase: "phase4-unsigned-xml", xmlVersion: "4.4", xmlSigned: false, submittedToHacienda: false, findings: validation.findings || [] };
  const db = await pool();
  if (db) {
    const result = await db.query(`INSERT INTO hacienda_electronic_documents (id, branch_id, invoice_id, document_type, clave, consecutivo, issued_at, environment, internal_status, hacienda_status, validation_status, validation_errors, totals, xml_original, json_sent, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9,'',$10,$11::jsonb,$12::jsonb,$13,$14::jsonb,now()) ON CONFLICT (branch_id, invoice_id, document_type) DO UPDATE SET clave=EXCLUDED.clave, consecutivo=EXCLUDED.consecutivo, issued_at=EXCLUDED.issued_at, environment=EXCLUDED.environment, internal_status=EXCLUDED.internal_status, validation_status=EXCLUDED.validation_status, validation_errors=EXCLUDED.validation_errors, totals=EXCLUDED.totals, xml_original=EXCLUDED.xml_original, json_sent=EXCLUDED.json_sent, updated_at=now() RETURNING *`, [fiscal.id, validation.branchId, validation.invoiceId, validation.documentType, fiscal.clave, fiscal.consecutivo, fiscal.issuedAt, validation.config.environment || "Sandbox", status, status, JSON.stringify(validation.findings || []), JSON.stringify(validation.totals || {}), unsignedXml, JSON.stringify(payload)]);
    return publicDoc(result.rows[0]);
  }
  const store = await fileStore();
  const docs = Array.isArray(store.documents) ? store.documents : [];
  const index = docs.findIndex((doc) => doc.branchId === validation.branchId && doc.invoiceId === validation.invoiceId && doc.documentType === validation.documentType);
  const current = index >= 0 ? docs[index] : {};
  const doc = { ...current, id: current.id || fiscal.id, branchId: validation.branchId, invoiceId: validation.invoiceId, documentType: validation.documentType, documentTypeLabel: meta[validation.documentType]?.[0] || "", clave: fiscal.clave, consecutivo: fiscal.consecutivo, issuedAt: fiscal.issuedAt, environment: validation.config.environment || "Sandbox", internalStatus: status, validationStatus: status, validationErrors: validation.findings || [], totals: validation.totals || {}, xmlOriginal: unsignedXml, payload, hasUnsignedXml: true, createdAt: current.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (index >= 0) docs[index] = doc;
  else docs.unshift(doc);
  store.documents = docs.slice(0, 300);
  await writeStore(store);
  return doc;
}

async function findXml(documentId) {
  const db = await pool();
  if (db) {
    const result = await db.query("SELECT * FROM hacienda_electronic_documents WHERE id = $1", [documentId]);
    const row = result.rows[0];
    return row ? { document: publicDoc(row), xml: row.xml_original || "" } : null;
  }
  const store = await fileStore();
  const doc = (store.documents || []).find((item) => item.id === documentId);
  return doc ? { document: publicDoc(doc), xml: doc.xmlOriginal || "" } : null;
}

async function audit(id, details) {
  const db = await pool();
  const entry = { id: crypto.randomUUID(), branchId: id, userId: "session", userName: "Administrador", action: "hacienda.document.xml", details, createdAt: new Date().toISOString() };
  if (db) {
    await db.query("INSERT INTO hacienda_audit_log (id, branch_id, user_id, user_name, action, details, created_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,now())", [entry.id, entry.branchId, entry.userId, entry.userName, entry.action, JSON.stringify(entry.details)]);
    return;
  }
  const store = await fileStore();
  store.auditLog = [entry, ...(store.auditLog || [])].slice(0, 300);
  await writeStore(store);
}

async function handlePhase4(req, res, url) {
  const state = await requireLogin(req);
  const id = branchId(url.searchParams.get("branchId") || state.currentBranchId || "rohrmoser");
  if (url.pathname === "/api/hacienda/documents/xml" && req.method === "GET") {
    await requireAdmin(req);
    const found = await findXml(clean(url.searchParams.get("documentId")));
    if (!found) return sendJson(res, 404, { ok: false, message: "XML fiscal no encontrado." });
    if (url.searchParams.get("download") === "1") return sendXml(res, 200, found.xml);
    return sendJson(res, 200, { ok: true, document: found.document, xml: found.xml });
  }
  if (url.pathname === "/api/hacienda/documents/xml" && req.method === "POST") {
    await requireAdmin(req);
    const payload = await readJson(req);
    const type = docType(payload.documentType);
    const validation = await validate(req, branchId(payload.branchId || id), payload.invoiceId, type);
    const errors = (validation.findings || []).filter((finding) => finding.severity === "error");
    if (errors.length) return sendJson(res, 400, { ok: false, message: "La factura todavia tiene errores fiscales.", validation });
    const config = await readConfig(validation.branchId);
    validation.config = { ...(validation.config || {}), ...config };
    const existing = await existingDoc(validation.branchId, validation.invoiceId, type);
    const consecutivo = await nextConsecutive(config, validation.branchId, type, existing?.consecutivo);
    const fiscal = { id: existing?.id || crypto.randomUUID(), consecutivo, issuedAt: existing?.issued_at || existing?.issuedAt || issuedAt(validation.invoice?.date), clave: existing?.clave || clave(config, validation.invoice || {}, type, consecutivo) };
    const warnings = (validation.findings || []).filter((finding) => finding.severity !== "error");
    const status = warnings.length ? "XmlNeedsReview" : "XmlReady";
    const unsignedXml = buildXml(validation, config, fiscal);
    const document = await saveDocument(validation, fiscal, unsignedXml, status);
    await audit(validation.branchId, { invoiceId: validation.invoiceId, documentType: type, internalStatus: status, warnings: warnings.length });
    return sendJson(res, 200, { ok: true, document, validation, xml: unsignedXml });
  }
  return sendJson(res, 404, { ok: false, message: "Ruta de fase 4 no encontrada." });
}

function inject(html) {
  let next = html;
  if (!next.includes("data-hacienda-open")) {
    next = next.replace('<button class="module-button" type="button" data-module="usuarios">', `<button class="module-button" type="button" data-hacienda-open><span class="module-icon"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 10h28v44H18z" /><path d="M24 21h16" /><path d="M24 30h16" /><path d="M24 39h10" /><path d="M40 41h9" /><path d="M44.5 36v10" /></svg></span><span class="module-label"><strong>Hacienda</strong><small>Configuracion fiscal</small></span></button><button class="module-button" type="button" data-module="usuarios">`);
  }
  if (!next.includes("hacienda.js")) next = next.replace("</body>", '    <script src="hacienda.js"></script>\n  </body>');
  if (!next.includes("hacienda-phase3.js")) next = next.replace("</body>", '    <script src="hacienda-phase3.js"></script>\n  </body>');
  if (!next.includes("hacienda-phase4.js")) next = next.replace("</body>", '    <script src="hacienda-phase4.js"></script>\n  </body>');
  return next;
}

async function serveIndex(req, res) {
  const body = Buffer.from(inject(await fs.readFile(path.join(rootDir, "index.html"), "utf8")), "utf8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": body.length });
  req.method === "HEAD" ? res.end() : res.end(body);
}

const previousHandler = server.listeners("request")[0];
if (!previousHandler) throw new Error("No se encontro el servidor de fase 3.");

server.removeAllListeners("request");
server.on("request", async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const route = url.pathname.toLowerCase();
    if (["/", "/index.html", "/hacienda", "/hacienda/"].includes(route)) return serveIndex(req, res);
    if (url.pathname === "/api/hacienda/documents/xml") return handlePhase4(req, res, url);
    return previousHandler(req, res);
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") return sendJson(res, 413, { ok: false, message: "La solicitud es demasiado grande." });
    if (error instanceof SyntaxError) return sendJson(res, 400, { ok: false, message: "JSON invalido." });
    return sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Error interno de fase 4." });
  }
});
