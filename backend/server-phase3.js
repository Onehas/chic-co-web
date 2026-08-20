"use strict";

const path = require("path");
const crypto = require("crypto");
const { promises: fs } = require("fs");
const core = require("./server");
const shared = require("./hacienda-shared");

require("./server-hacienda");

const { server } = core;
const { branchId, pool, readJson, readJsonFile, writeJsonFile, withFileLock } = shared;

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const settingsPath = path.join(dataDir, "hacienda-settings.json");
const phase3Path = path.join(dataDir, "hacienda-phase3.json");
const port = Number(process.env.PORT || 4173);
const databaseUrl = shared.databaseUrl;

const documentTypes = {
  "01": "Factura electronica",
  "04": "Tiquete electronico"
};

function setHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  setHeaders(res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function documentType(value) {
  const next = String(value || "04").trim();
  return Object.prototype.hasOwnProperty.call(documentTypes, next) ? next : "04";
}

function nowIso() {
  return new Date().toISOString();
}

function number(value) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function compact(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function firstText(...values) {
  for (const value of values) {
    const text = compact(value);
    if (text) return text;
  }
  return "";
}

function defaultHaciendaConfig(id) {
  return {
    branchId: id,
    enabled: false,
    directSubmissionEnabled: false,
    legacyProviderEnabled: true,
    environment: "Sandbox",
    issuerIdType: "",
    issuerIdNumber: "",
    issuerLegalName: "",
    issuerTradeName: "",
    economicActivityCode: "",
    branchCode: "",
    terminalCode: "",
    apiUsername: "",
    apiPasswordEncrypted: "",
    p12Encrypted: "",
    p12StorageRef: "",
    p12PinEncrypted: "",
    issuerEmail: "",
    defaultCurrency: "CRC",
    submissionMethod: "LegacyProvider"
  };
}

function rowToConfig(row, id) {
  if (!row) return defaultHaciendaConfig(id);
  return {
    ...defaultHaciendaConfig(row.branch_id || id),
    enabled: Boolean(row.enabled),
    directSubmissionEnabled: Boolean(row.direct_submission_enabled),
    legacyProviderEnabled: Boolean(row.legacy_provider_enabled),
    environment: row.environment || "Sandbox",
    issuerIdType: row.issuer_id_type || "",
    issuerIdNumber: row.issuer_id_number || "",
    issuerLegalName: row.issuer_legal_name || "",
    issuerTradeName: row.issuer_trade_name || "",
    economicActivityCode: row.economic_activity_code || "",
    branchCode: row.branch_code || "",
    terminalCode: row.terminal_code || "",
    apiUsername: row.api_username || "",
    apiPasswordEncrypted: row.api_password_encrypted || "",
    p12Encrypted: row.p12_encrypted || "",
    p12StorageRef: row.p12_storage_ref || "",
    p12PinEncrypted: row.p12_pin_encrypted || "",
    issuerEmail: row.issuer_email || "",
    defaultCurrency: row.default_currency || "CRC",
    submissionMethod: row.submission_method || "LegacyProvider"
  };
}

async function readHaciendaConfig(id) {
  const safeId = branchId(id);
  const db = await pool();
  if (db) {
    const result = await db.query("SELECT * FROM hacienda_company_settings WHERE branch_id = $1", [safeId]);
    return rowToConfig(result.rows[0], safeId);
  }
  const store = await readJsonFile(settingsPath, { settings: {} });
  return { ...defaultHaciendaConfig(safeId), ...(store.settings?.[safeId] || {}) };
}

function publicHaciendaConfig(config) {
  return {
    branchId: config.branchId,
    enabled: Boolean(config.enabled),
    directSubmissionEnabled: Boolean(config.directSubmissionEnabled),
    legacyProviderEnabled: Boolean(config.legacyProviderEnabled),
    environment: config.environment || "Sandbox",
    issuerLegalName: config.issuerLegalName || "",
    issuerTradeName: config.issuerTradeName || "",
    defaultCurrency: config.defaultCurrency || "CRC",
    branchCode: config.branchCode || "",
    terminalCode: config.terminalCode || "",
    readyForDirect: Boolean(
      config.apiUsername &&
        config.apiPasswordEncrypted &&
        (config.p12Encrypted || config.p12StorageRef) &&
        config.p12PinEncrypted
    )
  };
}

const requireAdmin = (req) =>
  shared.requireAdmin(req, null, "Solo un administrador puede crear borradores fiscales.");

function branchState(state, id) {
  const branch = state?.branches?.[id];
  const source = branch && typeof branch === "object" ? branch : state || {};
  return {
    clients: Array.isArray(source.clients) ? source.clients : [],
    products: Array.isArray(source.products) ? source.products : [],
    procedures: Array.isArray(source.procedures) ? source.procedures : [],
    invoices: Array.isArray(source.invoices) ? source.invoices : []
  };
}

function findInvoiceContext(state, id, invoiceId) {
  const data = branchState(state, id);
  const invoice = data.invoices.find((item) => String(item.id) === String(invoiceId));
  const client = invoice ? data.clients.find((item) => String(item.id) === String(invoice.clientId)) : null;
  const procedure = invoice ? data.procedures.find((item) => String(item.id) === String(invoice.procedureId)) : null;
  const product = invoice ? data.products.find((item) => String(item.id) === String(invoice.productId)) : null;
  return { data, invoice, client, procedure, product };
}

function invoiceTotals(invoice) {
  const subtotal = number(invoice?.serviceAmount) + number(invoice?.productAmount);
  const taxRate = number(invoice?.ivaRate || 13);
  const tax = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + tax;
  const paid = number(invoice?.paid);
  return {
    currency: "CRC",
    subtotal,
    taxRate,
    tax,
    total,
    paid,
    balance: paid - total
  };
}

function clientFiscalData(client) {
  return {
    idType: firstText(client?.idType, client?.fiscalIdType, client?.identificationType, client?.documentType),
    idNumber: firstText(client?.idNumber, client?.fiscalId, client?.identificationNumber, client?.identification, client?.cedula),
    email: firstText(client?.email),
    name: firstText(client?.name)
  };
}

function buildLineItems(invoice, procedure, product) {
  const taxRate = number(invoice?.ivaRate || 13);
  const lines = [];
  if (number(invoice?.serviceAmount) > 0) {
    lines.push({
      type: "Servicio",
      description: firstText(procedure?.name, procedure?.title, invoice?.area, "Servicio Chic & Co"),
      quantity: 1,
      amount: number(invoice.serviceAmount),
      taxRate,
      cabys: firstText(procedure?.cabys, procedure?.cabysCode)
    });
  }
  if (number(invoice?.productAmount) > 0 || number(invoice?.productQty) > 0) {
    lines.push({
      type: "Producto",
      description: firstText(product?.name, product?.title, "Producto Chic & Co"),
      quantity: Math.max(1, number(invoice?.productQty || 1)),
      amount: number(invoice?.productAmount),
      taxRate,
      cabys: firstText(product?.cabys, product?.cabysCode)
    });
  }
  return lines;
}

function addFinding(list, field, message) {
  list.push({ field, message });
}

async function consecutivePreview(config, id, type) {
  const branchCode = compact(config.branchCode).padStart(3, "0").slice(-3);
  const terminalCode = compact(config.terminalCode).padStart(5, "0").slice(-5);
  let lastNumber = 0;
  const counterId = `${id}:${type}:${branchCode}:${terminalCode}`;
  const db = await pool();
  if (db) {
    const result = await db.query(
      "SELECT last_number FROM hacienda_consecutive_counters WHERE branch_id = $1 AND document_type = $2 AND branch_code = $3 AND terminal_code = $4",
      [id, type, branchCode, terminalCode]
    );
    lastNumber = Number(result.rows[0]?.last_number || 0);
  } else {
    const store = await readJsonFile(phase3Path, { counters: {} });
    lastNumber = Number(store.counters?.[counterId]?.lastNumber || 0);
  }
  const sequence = String(lastNumber + 1).padStart(10, "0").slice(-10);
  const consecutivo = `${branchCode}${terminalCode}${type}${sequence}`;
  return {
    counterId,
    consecutivo,
    clave: `PENDIENTE-FASE4-${config.environment || "Sandbox"}-${consecutivo}`,
    reserved: false
  };
}

async function validateInvoice(state, id, invoiceId, type) {
  const safeType = documentType(type);
  const config = await readHaciendaConfig(id);
  const { invoice, client, procedure, product } = findInvoiceContext(state, id, invoiceId);
  const errors = [];
  const warnings = [];
  const totals = invoiceTotals(invoice);
  const lines = buildLineItems(invoice, procedure, product);
  const fiscalClient = clientFiscalData(client);

  if (!invoice) {
    addFinding(errors, "invoiceId", "No se encontro la factura seleccionada.");
  } else {
    if (!compact(invoice.date)) addFinding(errors, "date", "La factura no tiene fecha.");
    if (totals.subtotal <= 0) addFinding(errors, "amount", "La factura debe tener un monto mayor a cero.");
    if (!["Efectivo", "Tarjeta"].includes(String(invoice.paymentMethod || ""))) {
      addFinding(errors, "paymentMethod", "El metodo de pago debe ser Efectivo o Tarjeta.");
    }
    if (!client) addFinding(errors, "clientId", "La factura no tiene cliente valido.");
    if (client && !fiscalClient.name) addFinding(errors, "clientName", "El cliente necesita nombre.");
    if (!lines.length) addFinding(errors, "lines", "La factura necesita al menos una linea fiscal.");
    if (number(invoice.productAmount) > 0 && !product) {
      addFinding(warnings, "productId", "Hay monto de producto, pero el producto no existe en inventario.");
    }
    if (lines.some((line) => !line.cabys)) {
      addFinding(warnings, "cabys", "Falta CABYS en una o mas lineas. Es necesario antes del XML final.");
    }
  }

  if (!config.enabled) addFinding(warnings, "enabled", "La integracion fiscal de esta sucursal esta apagada.");
  [
    ["issuerIdType", "tipo de identificacion del emisor"],
    ["issuerIdNumber", "identificacion del emisor"],
    ["issuerLegalName", "razon social del emisor"],
    ["economicActivityCode", "actividad economica"],
    ["branchCode", "codigo de sucursal"],
    ["terminalCode", "codigo de terminal"]
  ].forEach(([field, label]) => {
    if (!compact(config[field])) addFinding(errors, field, `Falta ${label}.`);
  });
  if (config.branchCode && !/^\d{3}$/.test(config.branchCode)) {
    addFinding(errors, "branchCode", "El codigo de sucursal debe tener 3 digitos.");
  }
  if (config.terminalCode && !/^\d{5}$/.test(config.terminalCode)) {
    addFinding(errors, "terminalCode", "El codigo de terminal debe tener 5 digitos.");
  }
  if (safeType === "01" && (!fiscalClient.idType || !fiscalClient.idNumber)) {
    addFinding(errors, "clientFiscalId", "Factura electronica requiere identificacion fiscal del cliente. Use tiquete electronico o agregue esos datos.");
  }
  if (!fiscalClient.email) {
    addFinding(warnings, "clientEmail", "El cliente no tiene email para entregar el comprobante.");
  }
  if (config.submissionMethod === "Direct" || config.directSubmissionEnabled) {
    if (!config.apiUsername || !config.apiPasswordEncrypted) addFinding(warnings, "atv", "Faltan credenciales ATV para envio directo.");
    if (!(config.p12Encrypted || config.p12StorageRef) || !config.p12PinEncrypted) addFinding(warnings, "p12", "Falta certificado .p12 o PIN para firma digital.");
  }

  const status = errors.length ? "Blocked" : warnings.length ? "NeedsReview" : "Ready";
  const preliminary = await consecutivePreview(config, id, safeType);
  const findings = [
    ...errors.map((item) => ({ ...item, severity: "error" })),
    ...warnings.map((item) => ({ ...item, severity: "warning" }))
  ];

  return {
    branchId: id,
    invoiceId: compact(invoiceId),
    documentType: safeType,
    documentTypeLabel: documentTypes[safeType],
    status,
    canCreateDraft: Boolean(invoice),
    config: publicHaciendaConfig(config),
    invoice: invoice ? sanitizeInvoice(invoice) : null,
    client: client ? sanitizeClient(client) : null,
    totals: { ...totals, currency: config.defaultCurrency || "CRC" },
    lineItems: lines,
    preliminary,
    findings,
    errors,
    warnings
  };
}

function sanitizeInvoice(invoice) {
  return {
    id: compact(invoice.id),
    date: compact(invoice.date),
    clientId: compact(invoice.clientId),
    area: compact(invoice.area),
    procedureId: compact(invoice.procedureId),
    productId: compact(invoice.productId),
    productQty: number(invoice.productQty),
    serviceAmount: number(invoice.serviceAmount),
    productAmount: number(invoice.productAmount),
    ivaRate: number(invoice.ivaRate || 13),
    paid: number(invoice.paid),
    paymentMethod: compact(invoice.paymentMethod),
    notes: compact(invoice.notes, 500)
  };
}

function sanitizeClient(client) {
  const fiscal = clientFiscalData(client);
  return {
    id: compact(client.id),
    name: fiscal.name,
    phone: compact(client.phone),
    email: fiscal.email,
    fiscalIdType: fiscal.idType,
    fiscalIdNumber: fiscal.idNumber
  };
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function dateIso(value) {
  return value instanceof Date ? value.toISOString() : value || "";
}

function rowToDocument(row) {
  return {
    id: row.id,
    branchId: row.branch_id,
    invoiceId: row.invoice_id,
    documentType: row.document_type,
    documentTypeLabel: documentTypes[row.document_type] || row.document_type,
    clave: row.clave || "",
    consecutivo: row.consecutivo || "",
    issuedAt: dateIso(row.issued_at),
    environment: row.environment || "Sandbox",
    internalStatus: row.internal_status || "Draft",
    haciendaStatus: row.hacienda_status || "",
    validationStatus: row.validation_status || "Pending",
    validationErrors: parseJson(row.validation_errors, []),
    totals: parseJson(row.totals, {}),
    payload: parseJson(row.json_sent, {}),
    attemptCount: Number(row.attempt_count || 0),
    lastAttemptAt: dateIso(row.last_attempt_at),
    sentAt: dateIso(row.sent_at),
    responseAt: dateIso(row.response_at),
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at)
  };
}

async function listDocuments(id) {
  const safeId = branchId(id);
  const db = await pool();
  if (db) {
    const result = await db.query(
      "SELECT * FROM hacienda_electronic_documents WHERE branch_id = $1 ORDER BY updated_at DESC, created_at DESC LIMIT 80",
      [safeId]
    );
    return result.rows.map(rowToDocument);
  }
  const store = await readJsonFile(phase3Path, { documents: [] });
  return (store.documents || [])
    .filter((item) => item.branchId === safeId)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, 80);
}

function draftStatus(validation) {
  if (validation.errors.length) return "Blocked";
  if (validation.warnings.length) return "NeedsReview";
  return "DraftReady";
}

async function saveDocumentDraft(validation) {
  const timestamp = nowIso();
  const status = draftStatus(validation);
  const payload = {
    phase: "phase3-draft",
    officialXmlReady: false,
    officialSendReady: false,
    invoice: validation.invoice,
    client: validation.client,
    lineItems: validation.lineItems,
    preliminary: validation.preliminary,
    findings: validation.findings
  };
  const db = await pool();
  if (db) {
    const existing = await db.query(
      "SELECT id FROM hacienda_electronic_documents WHERE branch_id = $1 AND invoice_id = $2 AND document_type = $3",
      [validation.branchId, validation.invoiceId, validation.documentType]
    );
    const id = existing.rows[0]?.id || crypto.randomUUID();
    const result = await db.query(
      `INSERT INTO hacienda_electronic_documents (
        id, branch_id, invoice_id, document_type, clave, consecutivo, issued_at, environment,
        internal_status, hacienda_status, validation_status, validation_errors, totals, json_sent, updated_at
      ) VALUES (
        $1, $2, $3, $4, '', '', NULL, $5, $6, '', $7, $8::jsonb, $9::jsonb, $10::jsonb, now()
      )
      ON CONFLICT (branch_id, invoice_id, document_type) DO UPDATE SET
        environment = EXCLUDED.environment,
        internal_status = EXCLUDED.internal_status,
        validation_status = EXCLUDED.validation_status,
        validation_errors = EXCLUDED.validation_errors,
        totals = EXCLUDED.totals,
        json_sent = EXCLUDED.json_sent,
        updated_at = now()
      RETURNING *`,
      [
        id,
        validation.branchId,
        validation.invoiceId,
        validation.documentType,
        validation.config.environment || "Sandbox",
        status,
        status,
        JSON.stringify(validation.findings),
        JSON.stringify(validation.totals),
        JSON.stringify(payload)
      ]
    );
    return rowToDocument(result.rows[0]);
  }

  const store = await readJsonFile(phase3Path, { documents: [], counters: {}, auditLog: [] });
  const documents = Array.isArray(store.documents) ? store.documents : [];
  const existingIndex = documents.findIndex(
    (item) =>
      item.branchId === validation.branchId &&
      item.invoiceId === validation.invoiceId &&
      item.documentType === validation.documentType
  );
  const current = existingIndex >= 0 ? documents[existingIndex] : {};
  const document = {
    ...current,
    id: current.id || crypto.randomUUID(),
    branchId: validation.branchId,
    invoiceId: validation.invoiceId,
    documentType: validation.documentType,
    documentTypeLabel: documentTypes[validation.documentType],
    clave: "",
    consecutivo: "",
    issuedAt: "",
    environment: validation.config.environment || "Sandbox",
    internalStatus: status,
    haciendaStatus: "",
    validationStatus: status,
    validationErrors: validation.findings,
    totals: validation.totals,
    payload,
    attemptCount: Number(current.attemptCount || 0),
    createdAt: current.createdAt || timestamp,
    updatedAt: timestamp
  };
  if (existingIndex >= 0) documents[existingIndex] = document;
  else documents.unshift(document);
  store.documents = documents.slice(0, 300);
  await writeJsonFile(phase3Path, store);
  return document;
}

async function writeAudit(entry) {
  const db = await pool();
  if (db) {
    await db.query(
      `INSERT INTO hacienda_audit_log (id, branch_id, user_id, user_name, action, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())`,
      [entry.id, entry.branchId, entry.userId, entry.userName, entry.action, JSON.stringify(entry.details || {})]
    );
    return;
  }
  const store = await readJsonFile(phase3Path, { documents: [], counters: {}, auditLog: [] });
  store.auditLog = [entry, ...(store.auditLog || [])].slice(0, 300);
  await writeJsonFile(phase3Path, store);
}

async function handlePhase3Api(req, res, url) {
  const { state, user } = await shared.requireLogin(req);
  const safeBranchId = branchId(url.searchParams.get("branchId") || state.currentBranchId || "rohrmoser");

  if (url.pathname === "/api/hacienda/documents" && req.method === "GET") {
    const documents = await listDocuments(safeBranchId);
    sendJson(res, 200, { ok: true, documents });
    return true;
  }

  if (url.pathname === "/api/hacienda/validate-invoice" && req.method === "POST") {
    const payload = await readJson(req);
    const id = branchId(payload.branchId || safeBranchId);
    const validation = await validateInvoice(state, id, payload.invoiceId, payload.documentType);
    sendJson(res, 200, { ok: true, validation });
    return true;
  }

  if (url.pathname === "/api/hacienda/documents/draft" && req.method === "POST") {
    await requireAdmin(req);
    const payload = await readJson(req);
    const id = branchId(payload.branchId || safeBranchId);
    const validation = await validateInvoice(state, id, payload.invoiceId, payload.documentType);
    if (!validation.canCreateDraft) {
      sendJson(res, 400, { ok: false, message: "No se puede crear borrador sin factura valida.", validation });
      return true;
    }
    const document = await saveDocumentDraft(validation);
    await writeAudit({
      id: crypto.randomUUID(),
      branchId: id,
      userId: user?.id || "",
      userName: user?.name || "Administrador",
      action: "hacienda.document.draft",
      details: {
        invoiceId: validation.invoiceId,
        documentType: validation.documentType,
        internalStatus: document.internalStatus,
        findings: validation.findings.length
      },
      createdAt: nowIso()
    });
    sendJson(res, 200, { ok: true, document, validation });
    return true;
  }

  sendJson(res, 404, { ok: false, message: "Ruta de fase fiscal no encontrada." });
  return true;
}

function injectHaciendaBase(html) {
  let next = html;
  if (!next.includes("data-hacienda-open")) {
    next = next.replace(
      '<button class="module-button" type="button" data-module="usuarios">',
      `<button class="module-button" type="button" data-hacienda-open>
            <span class="module-icon">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <path d="M18 10h28v44H18z" />
                <path d="M24 21h16" />
                <path d="M24 30h16" />
                <path d="M24 39h10" />
                <path d="M40 41h9" />
                <path d="M44.5 36v10" />
              </svg>
            </span>
            <span class="module-label">
              <strong>Hacienda</strong>
              <small>Configuracion fiscal</small>
            </span>
          </button>

          <button class="module-button" type="button" data-module="usuarios">`
    );
  }
  if (!next.includes("hacienda.js")) {
    next = next.replace("</body>", '    <script src="hacienda.js"></script>\n  </body>');
  }
  return next;
}

function injectPhase3(html) {
  let next = injectHaciendaBase(html);
  if (!next.includes("hacienda-phase3.js")) {
    next = next.replace("</body>", '    <script src="hacienda-phase3.js"></script>\n  </body>');
  }
  return next;
}

async function serveIndex(req, res) {
  const html = injectPhase3(await fs.readFile(path.join(rootDir, "index.html"), "utf8"));
  const body = Buffer.from(html, "utf8");
  setHeaders(res);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length
  });
  if (req.method === "HEAD") res.end();
  else res.end(body);
}

const previousHandler = server.listeners("request")[0];
if (!previousHandler) {
  throw new Error("No se encontro el servidor base de Hacienda.");
}

server.removeAllListeners("request");
server.on("request", async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const route = url.pathname.toLowerCase();
    if (route === "/" || route === "/index.html" || route === "/hacienda" || route === "/hacienda/") {
      await serveIndex(req, res);
      return;
    }
    if (
      url.pathname === "/api/hacienda/validate-invoice" ||
      url.pathname === "/api/hacienda/documents" ||
      url.pathname === "/api/hacienda/documents/draft"
    ) {
      await handlePhase3Api(req, res, url);
      return;
    }
    previousHandler(req, res);
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") {
      sendJson(res, 413, { ok: false, message: "La solicitud es demasiado grande." });
      return;
    }
    if (error instanceof SyntaxError) {
      sendJson(res, 400, { ok: false, message: "JSON invalido." });
      return;
    }
    sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Error interno de fase fiscal." });
  }
});

// Expuesto para que la fase 4 valide sin hacer una peticion HTTP a si misma.
module.exports = { validateInvoice, documentType, listDocuments };
