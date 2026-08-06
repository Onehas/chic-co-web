"use strict";

const path = require("path");
const crypto = require("crypto");
const { promises: fs } = require("fs");
const { server } = require("./server");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const settingsPath = path.join(dataDir, "hacienda-settings.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const maxP12Bytes = 1024 * 1024;
let pgPool = null;
let pgReady = false;

const endpoints = {
  Sandbox: {
    receptionBaseUrl: "https://api.comprobanteselectronicos.go.cr/recepcion-sandbox/v1/",
    tokenUrl: "https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token",
    clientId: "api-stag"
  },
  Produccion: {
    receptionBaseUrl: "https://api.comprobanteselectronicos.go.cr/recepcion/v1/",
    tokenUrl: "https://idp.comprobanteselectronicos.go.cr/auth/realms/rut/protocol/openid-connect/token",
    clientId: "api-prod"
  }
};

const textFields = [
  "issuerIdType",
  "issuerIdNumber",
  "issuerLegalName",
  "issuerTradeName",
  "economicActivityCode",
  "branchCode",
  "terminalCode",
  "apiUsername",
  "issuerEmail",
  "province",
  "canton",
  "district",
  "otherAddress",
  "defaultCurrency",
  "systemProvider",
  "submissionMethod",
  "callbackUrl",
  "p12StorageRef"
];

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

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > 2 * 1024 * 1024) {
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

function encryptionSecret() {
  return String(process.env.HACIENDA_SECRET_KEY || process.env.HACIENDA_ENCRYPTION_KEY || "");
}

function encryptionConfigured() {
  return encryptionSecret().length >= 24;
}

function encryptSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  const secret = encryptionSecret();
  if (!secret) {
    const error = new Error("Configure HACIENDA_SECRET_KEY en Render antes de guardar secretos fiscales.");
    error.statusCode = 503;
    throw error;
  }
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

function branchId(value) {
  const next = String(value || "rohrmoser").trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,60}$/.test(next)) {
    const error = new Error("Sucursal fiscal invalida.");
    error.statusCode = 400;
    throw error;
  }
  return next;
}

function defaultSettings(id) {
  const now = new Date().toISOString();
  return {
    id: `hac-${id}`,
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
    p12PinEncrypted: "",
    p12StorageRef: "",
    issuerEmail: "",
    province: "",
    canton: "",
    district: "",
    otherAddress: "",
    defaultCurrency: "CRC",
    systemProvider: "",
    submissionMethod: "LegacyProvider",
    callbackUrl: "",
    createdAt: now,
    updatedAt: now
  };
}

function normalizeText(field, value) {
  let text = String(value || "").trim();
  if (field === "defaultCurrency") text = text.toUpperCase() || "CRC";
  if (field === "submissionMethod" && !text) text = "LegacyProvider";
  if (text.length > 240) {
    const error = new Error(`El campo ${field} supera el largo permitido.`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function normalizeP12(value) {
  const raw = String(value || "").replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  if (!raw) return "";
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 !== 0) {
    const error = new Error("El certificado .p12 no tiene formato base64 valido.");
    error.statusCode = 400;
    throw error;
  }
  const decoded = Buffer.from(raw, "base64");
  if (!decoded.length || decoded.length > maxP12Bytes) {
    const error = new Error("El certificado .p12 debe pesar maximo 1 MB.");
    error.statusCode = 400;
    throw error;
  }
  return decoded.toString("base64");
}

function validateSettings(settings) {
  if (!["Sandbox", "Produccion"].includes(settings.environment)) throw Object.assign(new Error("Ambiente de Hacienda invalido."), { statusCode: 400 });
  if (!["LegacyProvider", "Direct"].includes(settings.submissionMethod)) throw Object.assign(new Error("Metodo de envio fiscal invalido."), { statusCode: 400 });
  if (settings.branchCode && !/^\d{3}$/.test(settings.branchCode)) throw Object.assign(new Error("El codigo de sucursal debe tener 3 digitos."), { statusCode: 400 });
  if (settings.terminalCode && !/^\d{5}$/.test(settings.terminalCode)) throw Object.assign(new Error("El codigo de terminal debe tener 5 digitos."), { statusCode: 400 });
  if (settings.callbackUrl && !/^https:\/\/.+/i.test(settings.callbackUrl)) throw Object.assign(new Error("La URL de callback debe empezar con https://."), { statusCode: 400 });
}

async function pool() {
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: databaseUrl, max: 3 });
  }
  if (!pgReady) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS hacienda_company_settings (
        id text PRIMARY KEY,
        branch_id text UNIQUE NOT NULL,
        enabled boolean NOT NULL DEFAULT false,
        direct_submission_enabled boolean NOT NULL DEFAULT false,
        legacy_provider_enabled boolean NOT NULL DEFAULT true,
        environment text NOT NULL DEFAULT 'Sandbox',
        issuer_id_type text NOT NULL DEFAULT '',
        issuer_id_number text NOT NULL DEFAULT '',
        issuer_legal_name text NOT NULL DEFAULT '',
        issuer_trade_name text NOT NULL DEFAULT '',
        economic_activity_code text NOT NULL DEFAULT '',
        branch_code text NOT NULL DEFAULT '',
        terminal_code text NOT NULL DEFAULT '',
        api_username text NOT NULL DEFAULT '',
        api_password_encrypted text NOT NULL DEFAULT '',
        p12_encrypted text NOT NULL DEFAULT '',
        p12_pin_encrypted text NOT NULL DEFAULT '',
        p12_storage_ref text NOT NULL DEFAULT '',
        issuer_email text NOT NULL DEFAULT '',
        province text NOT NULL DEFAULT '',
        canton text NOT NULL DEFAULT '',
        district text NOT NULL DEFAULT '',
        other_address text NOT NULL DEFAULT '',
        default_currency text NOT NULL DEFAULT 'CRC',
        system_provider text NOT NULL DEFAULT '',
        submission_method text NOT NULL DEFAULT 'LegacyProvider',
        callback_url text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS hacienda_audit_log (
        id text PRIMARY KEY,
        branch_id text NOT NULL,
        user_id text NOT NULL DEFAULT '',
        user_name text NOT NULL DEFAULT '',
        action text NOT NULL,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    pgReady = true;
  }
  return pgPool;
}

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(settingsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { settings: {}, auditLog: [] };
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(dataDir, { recursive: true });
  const tempPath = `${settingsPath}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tempPath, settingsPath);
}

function rowToSettings(row, id) {
  if (!row) return defaultSettings(id);
  return {
    ...defaultSettings(row.branch_id || id),
    enabled: row.enabled,
    directSubmissionEnabled: row.direct_submission_enabled,
    legacyProviderEnabled: row.legacy_provider_enabled,
    environment: row.environment,
    issuerIdType: row.issuer_id_type,
    issuerIdNumber: row.issuer_id_number,
    issuerLegalName: row.issuer_legal_name,
    issuerTradeName: row.issuer_trade_name,
    economicActivityCode: row.economic_activity_code,
    branchCode: row.branch_code,
    terminalCode: row.terminal_code,
    apiUsername: row.api_username,
    apiPasswordEncrypted: row.api_password_encrypted,
    p12Encrypted: row.p12_encrypted,
    p12PinEncrypted: row.p12_pin_encrypted,
    p12StorageRef: row.p12_storage_ref,
    issuerEmail: row.issuer_email,
    province: row.province,
    canton: row.canton,
    district: row.district,
    otherAddress: row.other_address,
    defaultCurrency: row.default_currency,
    systemProvider: row.system_provider,
    submissionMethod: row.submission_method,
    callbackUrl: row.callback_url,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

async function readSettings(id) {
  const safeId = branchId(id);
  if (!databaseUrl) {
    const store = await readStore();
    return { ...defaultSettings(safeId), ...(store.settings?.[safeId] || {}) };
  }
  const db = await pool();
  const result = await db.query("SELECT * FROM hacienda_company_settings WHERE branch_id = $1", [safeId]);
  return rowToSettings(result.rows[0], safeId);
}

function sanitized(settings, canManage) {
  const endpoint = endpoints[settings.environment] || endpoints.Sandbox;
  return {
    ...textFields.reduce((safe, field) => {
      safe[field] = settings[field] || "";
      return safe;
    }, {}),
    id: settings.id,
    branchId: settings.branchId,
    enabled: Boolean(settings.enabled),
    directSubmissionEnabled: Boolean(settings.directSubmissionEnabled),
    legacyProviderEnabled: Boolean(settings.legacyProviderEnabled),
    environment: settings.environment,
    canManage,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
    secretStatus: {
      apiPassword: Boolean(settings.apiPasswordEncrypted),
      p12: Boolean(settings.p12Encrypted || settings.p12StorageRef),
      p12Pin: Boolean(settings.p12PinEncrypted),
      encryptionConfigured: encryptionConfigured()
    },
    featureFlags: {
      HaciendaIntegrationEnabled: Boolean(settings.enabled),
      HaciendaDirectSubmissionEnabled: Boolean(settings.directSubmissionEnabled),
      LegacyInvoiceProviderEnabled: Boolean(settings.legacyProviderEnabled),
      HaciendaEnvironment: settings.environment
    },
    endpoints: {
      receptionBaseUrl: endpoint.receptionBaseUrl,
      clientId: endpoint.clientId,
      ...(canManage ? { tokenUrl: endpoint.tokenUrl } : {})
    }
  };
}

async function writeAudit(entry) {
  if (!databaseUrl) {
    const store = await readStore();
    store.auditLog = [entry, ...(store.auditLog || [])].slice(0, 300);
    await writeStore(store);
    return;
  }
  const db = await pool();
  await db.query(
    `INSERT INTO hacienda_audit_log (id, branch_id, user_id, user_name, action, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [entry.id, entry.branchId, entry.userId, entry.userName, entry.action, entry.details]
  );
}

async function saveSettings(payload) {
  const id = branchId(payload.branchId);
  const current = await readSettings(id);
  const next = { ...current, branchId: id, id: current.id || `hac-${id}` };
  ["enabled", "directSubmissionEnabled", "legacyProviderEnabled"].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) next[field] = Boolean(payload[field]);
  });
  textFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) next[field] = normalizeText(field, payload[field]);
  });
  if (payload.environment) next.environment = normalizeText("environment", payload.environment);
  if (payload.clearApiPassword) next.apiPasswordEncrypted = "";
  else if (String(payload.apiPassword || "").trim()) next.apiPasswordEncrypted = encryptSecret(payload.apiPassword);
  if (payload.clearP12) next.p12Encrypted = "";
  else if (String(payload.p12Base64 || "").trim()) next.p12Encrypted = encryptSecret(normalizeP12(payload.p12Base64));
  if (payload.clearP12Pin) next.p12PinEncrypted = "";
  else if (String(payload.p12Pin || "").trim()) next.p12PinEncrypted = encryptSecret(payload.p12Pin);
  next.environment = ["Sandbox", "Produccion"].includes(next.environment) ? next.environment : "Sandbox";
  next.submissionMethod = ["LegacyProvider", "Direct"].includes(next.submissionMethod) ? next.submissionMethod : "LegacyProvider";
  validateSettings(next);
  next.updatedAt = new Date().toISOString();

  if (!databaseUrl) {
    const store = await readStore();
    store.settings = store.settings || {};
    store.settings[id] = next;
    await writeStore(store);
  } else {
    const db = await pool();
    await db.query(
      `INSERT INTO hacienda_company_settings (
        id, branch_id, enabled, direct_submission_enabled, legacy_provider_enabled, environment,
        issuer_id_type, issuer_id_number, issuer_legal_name, issuer_trade_name, economic_activity_code,
        branch_code, terminal_code, api_username, api_password_encrypted, p12_encrypted, p12_pin_encrypted,
        p12_storage_ref, issuer_email, province, canton, district, other_address, default_currency,
        system_provider, submission_method, callback_url, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, now()
      )
      ON CONFLICT (branch_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        direct_submission_enabled = EXCLUDED.direct_submission_enabled,
        legacy_provider_enabled = EXCLUDED.legacy_provider_enabled,
        environment = EXCLUDED.environment,
        issuer_id_type = EXCLUDED.issuer_id_type,
        issuer_id_number = EXCLUDED.issuer_id_number,
        issuer_legal_name = EXCLUDED.issuer_legal_name,
        issuer_trade_name = EXCLUDED.issuer_trade_name,
        economic_activity_code = EXCLUDED.economic_activity_code,
        branch_code = EXCLUDED.branch_code,
        terminal_code = EXCLUDED.terminal_code,
        api_username = EXCLUDED.api_username,
        api_password_encrypted = EXCLUDED.api_password_encrypted,
        p12_encrypted = EXCLUDED.p12_encrypted,
        p12_pin_encrypted = EXCLUDED.p12_pin_encrypted,
        p12_storage_ref = EXCLUDED.p12_storage_ref,
        issuer_email = EXCLUDED.issuer_email,
        province = EXCLUDED.province,
        canton = EXCLUDED.canton,
        district = EXCLUDED.district,
        other_address = EXCLUDED.other_address,
        default_currency = EXCLUDED.default_currency,
        system_provider = EXCLUDED.system_provider,
        submission_method = EXCLUDED.submission_method,
        callback_url = EXCLUDED.callback_url,
        updated_at = now()`,
      [
        next.id,
        next.branchId,
        next.enabled,
        next.directSubmissionEnabled,
        next.legacyProviderEnabled,
        next.environment,
        next.issuerIdType,
        next.issuerIdNumber,
        next.issuerLegalName,
        next.issuerTradeName,
        next.economicActivityCode,
        next.branchCode,
        next.terminalCode,
        next.apiUsername,
        next.apiPasswordEncrypted,
        next.p12Encrypted,
        next.p12PinEncrypted,
        next.p12StorageRef,
        next.issuerEmail,
        next.province,
        next.canton,
        next.district,
        next.otherAddress,
        next.defaultCurrency,
        next.systemProvider,
        next.submissionMethod,
        next.callbackUrl
      ]
    );
  }
  await writeAudit({
    id: crypto.randomUUID(),
    branchId: id,
    userId: "session",
    userName: "Administrador",
    action: "hacienda.config.update",
    details: { enabled: next.enabled, directSubmissionEnabled: next.directSubmissionEnabled, environment: next.environment }
  });
  return next;
}

function missingFields(settings) {
  return [
    ["issuerIdType", "tipo de identificacion"],
    ["issuerIdNumber", "identificacion"],
    ["issuerLegalName", "razon social"],
    ["economicActivityCode", "actividad economica"],
    ["branchCode", "codigo de sucursal"],
    ["terminalCode", "codigo de terminal"],
    ["apiUsername", "usuario del ATV"],
    ["apiPasswordEncrypted", "contrasena del ATV"],
    [settings.p12Encrypted || settings.p12StorageRef ? "ok" : "p12", "certificado .p12"],
    ["p12PinEncrypted", "PIN del certificado"]
  ].filter(([field]) => field !== "ok" && !settings[field]).map(([, label]) => label);
}

async function originalApi(req, apiPath) {
  const authorization = String(req.headers.authorization || "");
  const response = await fetch(`http://127.0.0.1:${port}${apiPath}`, {
    headers: authorization ? { Authorization: authorization } : {}
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    payload = {};
  }
  return { status: response.status, ok: response.ok, payload };
}

async function requireLogin(req) {
  const response = await originalApi(req, "/api/state");
  if (!response.ok) {
    const error = new Error(response.payload?.message || "Sesion requerida.");
    error.statusCode = response.status;
    throw error;
  }
  return response.payload?.state || {};
}

async function requireAdmin(req) {
  const response = await originalApi(req, "/api/audit");
  if (!response.ok) {
    const error = new Error("Solo un administrador puede modificar configuracion de Hacienda.");
    error.statusCode = response.status === 401 ? 401 : 403;
    throw error;
  }
}

async function handleHaciendaApi(req, res, url) {
  const pathname = url.pathname;
  const state = await requireLogin(req);
  const id = branchId(url.searchParams.get("branchId") || state.currentBranchId || "rohrmoser");

  if (pathname === "/api/hacienda/config" && req.method === "GET") {
    const settings = await readSettings(id);
    const admin = (await originalApi(req, "/api/audit")).ok;
    sendJson(res, 200, { ok: true, config: sanitized(settings, admin) });
    return true;
  }

  if (pathname === "/api/hacienda/config" && req.method === "PUT") {
    await requireAdmin(req);
    const payload = await readJson(req);
    const saved = await saveSettings({ ...payload, branchId: payload.branchId || id });
    sendJson(res, 200, { ok: true, config: sanitized(saved, true) });
    return true;
  }

  if ((pathname === "/api/hacienda/test-credentials" || pathname === "/api/hacienda/test-certificate") && req.method === "POST") {
    await requireAdmin(req);
    const payload = await readJson(req);
    const settings = await readSettings(payload.branchId || id);
    const missing = missingFields(settings);
    const credentialsReady = Boolean(settings.apiUsername && settings.apiPasswordEncrypted && encryptionConfigured());
    const certificateReady = Boolean((settings.p12Encrypted || settings.p12StorageRef) && settings.p12PinEncrypted && encryptionConfigured());
    sendJson(res, 200, {
      ok: true,
      ready: pathname.endsWith("credentials") ? credentialsReady : certificateReady,
      overallReady: missing.length === 0 && encryptionConfigured(),
      missing,
      message: pathname.endsWith("credentials")
        ? "Prueba local lista. La llamada real al IdP de Hacienda se habilita en la fase de autenticacion."
        : "Certificado registrado para la configuracion. La validacion criptografica real se habilita en la fase de firma XML."
    });
    return true;
  }

  sendJson(res, 404, { ok: false, message: "Ruta de Hacienda no encontrada." });
  return true;
}

function injectHacienda(html) {
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

async function serveIndex(req, res) {
  const html = injectHacienda(await fs.readFile(path.join(rootDir, "index.html"), "utf8"));
  const body = Buffer.from(html, "utf8");
  setHeaders(res);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length
  });
  if (req.method === "HEAD") res.end();
  else res.end(body);
}

const originalHandler = server.listeners("request")[0];
server.removeAllListeners("request");
server.on("request", async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const route = url.pathname.toLowerCase();
    if (route === "/" || route === "/index.html" || route === "/hacienda" || route === "/hacienda/") {
      await serveIndex(req, res);
      return;
    }
    if (url.pathname.startsWith("/api/hacienda/")) {
      await handleHaciendaApi(req, res, url);
      return;
    }
    originalHandler(req, res);
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") {
      sendJson(res, 413, { ok: false, message: "La solicitud es demasiado grande." });
      return;
    }
    if (error instanceof SyntaxError) {
      sendJson(res, 400, { ok: false, message: "JSON invalido." });
      return;
    }
    sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Error interno de Hacienda." });
  }
});

server.listen(port, host, () => {
  console.log(`Chic & Co backend listo en http://${host}:${port}`);
});
