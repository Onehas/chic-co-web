"use strict";

const path = require("path");
const crypto = require("crypto");
const { promises: fs } = require("fs");
const core = require("./server");
const shared = require("./hacienda-shared");

require("./server-phase4");

const { server } = core;
const { branchId, pool, readJson, readJsonFile, writeJsonFile, withFileLock } = shared;

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const settingsPath = path.join(dataDir, "hacienda-settings.json");
const storePath = path.join(dataDir, "hacienda-phase3.json");
const port = Number(process.env.PORT || 4173);
const databaseUrl = shared.databaseUrl;
const host = process.env.HOST || "127.0.0.1";

const documentTypes = {
  "01": "Factura electronica",
  "04": "Tiquete electronico"
};

function clean(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function documentTypeLabel(value) {
  return documentTypes[value] || value || "";
}

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

const requireAdmin = (req) =>
  shared.requireAdmin(req, null, "Solo un administrador puede revisar firma fiscal.");

function rowToSettings(row, id) {
  if (!row) {
    return {
      branchId: id,
      environment: "Sandbox",
      issuerIdType: "",
      issuerIdNumber: "",
      apiUsername: "",
      apiPasswordEncrypted: "",
      p12Encrypted: "",
      p12StorageRef: "",
      p12PinEncrypted: "",
      callbackUrl: ""
    };
  }
  return {
    branchId: row.branch_id || row.branchId || id,
    environment: row.environment || "Sandbox",
    issuerIdType: row.issuer_id_type || row.issuerIdType || "",
    issuerIdNumber: row.issuer_id_number || row.issuerIdNumber || "",
    issuerLegalName: row.issuer_legal_name || row.issuerLegalName || "",
    apiUsername: row.api_username || row.apiUsername || "",
    apiPasswordEncrypted: row.api_password_encrypted || row.apiPasswordEncrypted || "",
    p12Encrypted: row.p12_encrypted || row.p12Encrypted || "",
    p12StorageRef: row.p12_storage_ref || row.p12StorageRef || "",
    p12PinEncrypted: row.p12_pin_encrypted || row.p12PinEncrypted || "",
    callbackUrl: row.callback_url || row.callbackUrl || "",
    submissionMethod: row.submission_method || row.submissionMethod || "LegacyProvider",
    directSubmissionEnabled: Boolean(row.direct_submission_enabled || row.directSubmissionEnabled)
  };
}

async function readSettings(id) {
  const safeId = branchId(id);
  const db = await pool();
  if (db) {
    const result = await db.query("SELECT * FROM hacienda_company_settings WHERE branch_id = $1", [safeId]);
    return rowToSettings(result.rows[0], safeId);
  }
  const store = await readJsonFile(settingsPath, { settings: {} });
  return rowToSettings({ ...(store.settings?.[safeId] || {}), branch_id: safeId }, safeId);
}

function publicDocument(row) {
  if (!row) return null;
  const payload = parseJson(row.json_sent || row.payload, {});
  return {
    id: row.id,
    branchId: row.branch_id || row.branchId || "",
    invoiceId: row.invoice_id || row.invoiceId || "",
    documentType: row.document_type || row.documentType || "",
    documentTypeLabel: documentTypeLabel(row.document_type || row.documentType),
    clave: row.clave || "",
    consecutivo: row.consecutivo || "",
    issuedAt: dateIso(row.issued_at || row.issuedAt),
    environment: row.environment || "Sandbox",
    internalStatus: row.internal_status || row.internalStatus || "Draft",
    validationStatus: row.validation_status || row.validationStatus || "Pending",
    totals: parseJson(row.totals, row.totals || {}),
    payload,
    hasUnsignedXml: Boolean(row.xml_original || row.xmlOriginal),
    hasSignedXml: Boolean(row.xml_signed || row.xmlSigned),
    updatedAt: dateIso(row.updated_at || row.updatedAt),
    createdAt: dateIso(row.created_at || row.createdAt)
  };
}

function rawDocument(row) {
  if (!row) return null;
  return {
    public: publicDocument(row),
    xmlOriginal: row.xml_original || row.xmlOriginal || "",
    xmlSigned: row.xml_signed || row.xmlSigned || "",
    payload: parseJson(row.json_sent || row.payload, {})
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
    return result.rows.map((row) => rawDocument(row).public);
  }
  const store = await readJsonFile(storePath, { documents: [] });
  return (store.documents || [])
    .filter((item) => item.branchId === safeId)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, 80)
    .map(publicDocument);
}

async function findDocument(documentId) {
  const id = clean(documentId, 80);
  if (!id) return null;
  const db = await pool();
  if (db) {
    const result = await db.query("SELECT * FROM hacienda_electronic_documents WHERE id = $1", [id]);
    return rawDocument(result.rows[0]);
  }
  const store = await readJsonFile(storePath, { documents: [] });
  const doc = (store.documents || []).find((item) => String(item.id) === id);
  return rawDocument(doc);
}

async function updateDocument(document, status, patchPayload = {}, signedXml = undefined) {
  const current = document.public;
  const payload = { ...(document.payload || {}), ...patchPayload };
  const db = await pool();
  if (db) {
    const result = await db.query(
      `UPDATE hacienda_electronic_documents
       SET internal_status = $2,
           validation_status = $3,
           json_sent = $4::jsonb,
           xml_signed = COALESCE($5, xml_signed),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [current.id, status, status, JSON.stringify(payload), signedXml === undefined ? null : signedXml]
    );
    return rawDocument(result.rows[0]);
  }
  return withFileLock(storePath, async () => {
  const store = await readJsonFile(storePath, { documents: [] });
  const docs = Array.isArray(store.documents) ? store.documents : [];
  const index = docs.findIndex((item) => String(item.id) === String(current.id));
  if (index < 0) return document;
  docs[index] = {
    ...docs[index],
    internalStatus: status,
    validationStatus: status,
    payload,
    ...(signedXml === undefined ? {} : { xmlSigned: signedXml }),
    updatedAt: new Date().toISOString()
  };
  store.documents = docs;
  await writeJsonFile(storePath, store);
  return rawDocument(docs[index]);
  });
}

async function writeAudit(branch, action, details, auditActor) {
  const entry = {
    id: crypto.randomUUID(),
    branchId: branchId(branch),
    userId: auditActor?.id || "",
    userName: auditActor?.name || "Administrador",
    action,
    details,
    createdAt: new Date().toISOString()
  };
  const db = await pool();
  if (db) {
    await db.query(
      "INSERT INTO hacienda_audit_log (id, branch_id, user_id, user_name, action, details, created_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,now())",
      [entry.id, entry.branchId, entry.userId, entry.userName, entry.action, JSON.stringify(entry.details || {})]
    );
    return;
  }
  await withFileLock(storePath, async () => {
    const store = await readJsonFile(storePath, { documents: [], counters: {}, auditLog: [] });
    store.auditLog = [entry, ...(store.auditLog || [])].slice(0, 300);
    await writeJsonFile(storePath, store);
  });
}

function addRequirement(list, key, label, ok, detail, severity = "error") {
  list.push({ key, label, ok: Boolean(ok), detail: detail || "", severity: ok ? "ok" : severity });
}

function inspectCertificate(settings, requirements) {
  const hasInlineP12 = Boolean(settings.p12Encrypted);
  const hasStorageRef = Boolean(settings.p12StorageRef);
  let certificateSha256 = "";
  let p12Bytes = 0;

  addRequirement(requirements, "encryption", "Llave de cifrado en Render", encryptionConfigured(), "HACIENDA_SECRET_KEY debe existir en Render.");
  addRequirement(requirements, "p12", "Certificado .p12", hasInlineP12 || hasStorageRef, "Suba el .p12 o registre la referencia externa.");
  addRequirement(requirements, "p12Pin", "PIN del certificado", Boolean(settings.p12PinEncrypted), "Guarde el PIN del certificado.");

  if (!encryptionConfigured()) return { certificateSha256, p12Bytes, storageRef: settings.p12StorageRef || "" };

  if (hasInlineP12) {
    try {
      const p12Base64 = decryptSecret(settings.p12Encrypted);
      const p12Buffer = Buffer.from(p12Base64, "base64");
      p12Bytes = p12Buffer.length;
      certificateSha256 = sha256(p12Buffer);
      addRequirement(requirements, "p12Decrypt", "Certificado descifrable", Boolean(p12Bytes), "El .p12 se pudo abrir desde el secreto cifrado.", "warning");
    } catch (error) {
      addRequirement(requirements, "p12Decrypt", "Certificado descifrable", false, "No se pudo descifrar el .p12 con la llave actual.");
    }
  }

  if (settings.p12PinEncrypted) {
    try {
      const pin = decryptSecret(settings.p12PinEncrypted);
      addRequirement(requirements, "p12PinDecrypt", "PIN descifrable", Boolean(pin), "El PIN existe y se pudo leer de forma interna.", "warning");
    } catch (error) {
      addRequirement(requirements, "p12PinDecrypt", "PIN descifrable", false, "No se pudo descifrar el PIN con la llave actual.");
    }
  }

  if (!hasInlineP12 && hasStorageRef) {
    addRequirement(requirements, "p12External", "Certificado externo", true, "La referencia externa queda pendiente del firmador.");
  }

  return { certificateSha256, p12Bytes, storageRef: settings.p12StorageRef || "" };
}

function signedXmlFindings(xmlText, document) {
  const findings = [];
  const text = String(xmlText || "");
  if (!text.trim()) findings.push({ severity: "error", message: "Falta XML firmado." });
  if (!/<([A-Za-z0-9_-]+:)?Signature[\s>]/.test(text)) findings.push({ severity: "error", message: "El XML no contiene etiqueta Signature." });
  if (!/<([A-Za-z0-9_-]+:)?QualifyingProperties[\s>]/.test(text)) findings.push({ severity: "error", message: "El XML no contiene propiedades XAdES." });
  if (!/<([A-Za-z0-9_-]+:)?SignaturePolicyIdentifier[\s>]/.test(text)) findings.push({ severity: "error", message: "El XML no declara politica XAdES-EPES." });
  if (document?.clave && !text.includes(document.clave)) findings.push({ severity: "error", message: "El XML firmado no conserva la misma clave." });
  if (document?.consecutivo && !text.includes(document.consecutivo)) findings.push({ severity: "error", message: "El XML firmado no conserva el mismo consecutivo." });
  return findings;
}

function buildSignatureCheck(document, settings) {
  const requirements = [];
  const publicDoc = document.public || {};
  const unsignedXml = document.xmlOriginal || "";
  const signedXml = document.xmlSigned || "";

  addRequirement(requirements, "xmlOriginal", "XML base", Boolean(unsignedXml), "Genere el XML en fase 4.");
  addRequirement(requirements, "clave", "Clave numerica", /^\d{50}$/.test(publicDoc.clave || ""), "La clave debe tener 50 digitos.");
  addRequirement(requirements, "consecutivo", "Consecutivo", /^\d{20}$/.test(publicDoc.consecutivo || ""), "El consecutivo debe tener 20 digitos.");
  addRequirement(requirements, "issuer", "Emisor fiscal", Boolean(settings.issuerIdType && settings.issuerIdNumber), "Complete tipo y numero de identificacion del emisor.");
  addRequirement(requirements, "apiUser", "Usuario ATV", Boolean(settings.apiUsername), "Guarde el usuario de ATV.");
  addRequirement(requirements, "apiPassword", "Contrasena ATV", Boolean(settings.apiPasswordEncrypted), "Guarde la contrasena de ATV.");
  const certificate = inspectCertificate(settings, requirements);

  const signedFindings = signedXmlFindings(signedXml, publicDoc);
  const signedReady = signedFindings.length === 0;
  addRequirement(requirements, "signedXml", "XML firmado XAdES-EPES", signedReady, "Registre un XML firmado antes de preparar envio.");

  const signingBlocked = requirements.some((item) => item.key !== "signedXml" && item.severity === "error" && !item.ok);
  const readyForSigner = !signingBlocked;
  const readyForSubmission = readyForSigner && signedReady;
  const xmlSha256 = unsignedXml ? sha256(unsignedXml) : "";
  const signedXmlSha256 = signedXml ? sha256(signedXml) : "";

  return {
    document: publicDoc,
    status: readyForSubmission ? "ReadyToSubmit" : readyForSigner ? "SignatureReady" : "SignatureBlocked",
    readyForSigner,
    readyForSubmission,
    xmlSha256,
    signedXmlSha256,
    certificate,
    requirements,
    signedFindings,
    policy: {
      xmlSignature: "XMLDSig",
      xades: "XAdES-EPES",
      packaging: "ENVELOPED",
      digest: "SHA-256 o SHA-512",
      certificateAlgorithm: "RSA 2048 o RSA 4096",
      submittedXmlEncoding: "Base64 UTF-8"
    }
  };
}

function submissionPayload(document, settings) {
  const publicDoc = document.public;
  const signedXml = document.xmlSigned || "";
  const payload = {
    clave: publicDoc.clave,
    fecha: publicDoc.issuedAt,
    emisor: {
      tipoIdentificacion: settings.issuerIdType,
      numeroIdentificacion: settings.issuerIdNumber
    },
    comprobanteXml: Buffer.from(signedXml, "utf8").toString("base64")
  };
  if (settings.callbackUrl) payload.callbackUrl = settings.callbackUrl;
  return payload;
}

async function handlePhase5(req, res, url) {
  const { state, user } = await shared.requireLogin(req);
  const safeBranchId = branchId(url.searchParams.get("branchId") || state.currentBranchId || "rohrmoser");

  if (url.pathname === "/api/hacienda/documents/signature-candidates" && req.method === "GET") {
    await requireAdmin(req);
    const documents = await listDocuments(safeBranchId);
    return sendJson(res, 200, { ok: true, documents });
  }

  if (url.pathname === "/api/hacienda/documents/signature-check" && req.method === "POST") {
    await requireAdmin(req);
    const payload = await readJson(req);
    const document = await findDocument(payload.documentId);
    if (!document) return sendJson(res, 404, { ok: false, message: "Documento fiscal no encontrado." });
    const settings = await readSettings(document.public.branchId || safeBranchId);
    const check = buildSignatureCheck(document, settings);
    const updated = await updateDocument(document, check.status, {
      phase: "phase5-signature-gate",
      xmlSigned: Boolean(document.xmlSigned),
      submittedToHacienda: false,
      signatureGate: {
        status: check.status,
        readyForSigner: check.readyForSigner,
        readyForSubmission: check.readyForSubmission,
        xmlSha256: check.xmlSha256,
        signedXmlSha256: check.signedXmlSha256,
        checkedAt: new Date().toISOString()
      }
    });
    await writeAudit(document.public.branchId || safeBranchId, "hacienda.document.signature_check", {
      documentId: document.public.id,
      invoiceId: document.public.invoiceId,
      status: check.status
    }, user);
    return sendJson(res, 200, { ok: true, check: { ...check, document: updated.public } });
  }

  if (url.pathname === "/api/hacienda/documents/signed-xml" && req.method === "POST") {
    await requireAdmin(req);
    const payload = await readJson(req);
    const signedXml = String(payload.signedXml || "").trim();
    const document = await findDocument(payload.documentId);
    if (!document) return sendJson(res, 404, { ok: false, message: "Documento fiscal no encontrado." });
    const findings = signedXmlFindings(signedXml, document.public);
    if (Buffer.byteLength(signedXml, "utf8") > 2 * 1024 * 1024) findings.push({ severity: "error", message: "El XML firmado supera 2 MB." });
    if (findings.some((item) => item.severity === "error")) {
      return sendJson(res, 422, { ok: false, message: "El XML firmado no cumple la compuerta de fase 5.", findings });
    }
    const updated = await updateDocument(document, "SignedReady", {
      phase: "phase5-signed-xml",
      xmlSigned: true,
      submittedToHacienda: false,
      signedXml: {
        sha256: sha256(signedXml),
        bytes: Buffer.byteLength(signedXml, "utf8"),
        receivedAt: new Date().toISOString()
      }
    }, signedXml);
    await writeAudit(document.public.branchId || safeBranchId, "hacienda.document.signed_xml", {
      documentId: document.public.id,
      invoiceId: document.public.invoiceId,
      signedXmlSha256: sha256(signedXml)
    }, user);
    const settings = await readSettings(updated.public.branchId || safeBranchId);
    return sendJson(res, 200, { ok: true, document: updated.public, check: buildSignatureCheck(updated, settings) });
  }

  if (url.pathname === "/api/hacienda/documents/prepare-submission" && req.method === "POST") {
    await requireAdmin(req);
    const payload = await readJson(req);
    const document = await findDocument(payload.documentId);
    if (!document) return sendJson(res, 404, { ok: false, message: "Documento fiscal no encontrado." });
    const settings = await readSettings(document.public.branchId || safeBranchId);
    const check = buildSignatureCheck(document, settings);
    if (!check.readyForSubmission) {
      await updateDocument(document, "SubmissionBlocked", {
        phase: "phase5-submission-blocked",
        xmlSigned: Boolean(document.xmlSigned),
        submittedToHacienda: false,
        blockedAt: new Date().toISOString(),
        requirements: check.requirements
      });
      return sendJson(res, 409, { ok: false, message: "Falta XML firmado XAdES-EPES antes de preparar envio.", check });
    }

    const haciendaPayload = submissionPayload(document, settings);
    const safeSubmission = {
      phase: "phase5-submission-ready",
      xmlSigned: true,
      submittedToHacienda: false,
      preparedAt: new Date().toISOString(),
      endpointEnvironment: settings.environment || "Sandbox",
      payloadPreview: {
        clave: haciendaPayload.clave,
        fecha: haciendaPayload.fecha,
        emisor: haciendaPayload.emisor,
        callbackUrl: haciendaPayload.callbackUrl || ""
      },
      comprobanteXml: {
        bytes: Buffer.byteLength(document.xmlSigned || "", "utf8"),
        base64Sha256: sha256(haciendaPayload.comprobanteXml)
      }
    };
    const updated = await updateDocument(document, "ReadyToSubmit", safeSubmission);
    await writeAudit(document.public.branchId || safeBranchId, "hacienda.document.submission_ready", {
      documentId: document.public.id,
      invoiceId: document.public.invoiceId,
      clave: document.public.clave
    }, user);
    return sendJson(res, 200, { ok: true, document: updated.public, submission: safeSubmission });
  }

  return sendJson(res, 404, { ok: false, message: "Ruta de fase 5 no encontrada." });
}

function inject(html) {
  let next = html;
  if (!next.includes("data-hacienda-open")) {
    next = next.replace('<button class="module-button" type="button" data-module="usuarios">', `<button class="module-button" type="button" data-hacienda-open><span class="module-icon"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 10h28v44H18z" /><path d="M24 21h16" /><path d="M24 30h16" /><path d="M24 39h10" /><path d="M40 41h9" /><path d="M44.5 36v10" /></svg></span><span class="module-label"><strong>Hacienda</strong><small>Configuracion fiscal</small></span></button><button class="module-button" type="button" data-module="usuarios">`);
  }
  if (!next.includes("hacienda.js")) next = next.replace("</body>", '    <script src="hacienda.js"></script>\n  </body>');
  if (!next.includes("hacienda-phase3.js")) next = next.replace("</body>", '    <script src="hacienda-phase3.js"></script>\n  </body>');
  if (!next.includes("hacienda-phase4.js")) next = next.replace("</body>", '    <script src="hacienda-phase4.js"></script>\n  </body>');
  if (!next.includes("hacienda-phase5.js")) next = next.replace("</body>", '    <script src="hacienda-phase5.js"></script>\n  </body>');
  return next;
}

async function serveIndex(req, res) {
  const html = inject(await fs.readFile(path.join(rootDir, "index.html"), "utf8"));
  const body = Buffer.from(html, "utf8");
  setHeaders(res);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": body.length });
  if (req.method === "HEAD") res.end();
  else res.end(body);
}

const previousHandler = server.listeners("request")[0];
if (!previousHandler) throw new Error("No se encontro el servidor de fase 4.");

server.removeAllListeners("request");
server.on("request", async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const route = url.pathname.toLowerCase();
    if (["/", "/index.html", "/hacienda", "/hacienda/"].includes(route)) {
      await serveIndex(req, res);
      return;
    }
    if (
      url.pathname === "/api/hacienda/documents/signature-candidates" ||
      url.pathname === "/api/hacienda/documents/signature-check" ||
      url.pathname === "/api/hacienda/documents/signed-xml" ||
      url.pathname === "/api/hacienda/documents/prepare-submission"
    ) {
      await handlePhase5(req, res, url);
      return;
    }
    await previousHandler(req, res);
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") return sendJson(res, 413, { ok: false, message: "La solicitud es demasiado grande." });
    if (error instanceof SyntaxError) return sendJson(res, 400, { ok: false, message: "JSON invalido." });
    return sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Error interno de fase 5." });
  }
});

// Punto de entrada real (npm start). El listen ocurre aqui, cuando la cadena
// completa de fases ya registro sus rutas.
if (require.main === module) {
  server.listen(port, host, () => {
    console.log(`Chic & Co backend listo en http://${host}:${port}`);
  });
}

module.exports = { server };
