(() => {
  if (window.__chicHaciendaPhase5) return;
  window.__chicHaciendaPhase5 = true;

  let documents = [];
  let selectedCheck = null;
  let loadedBranchId = "";
  let loading = false;

  function safeEscape(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isHaciendaRoute() {
    return /^\/hacienda\/?$/i.test(window.location.pathname);
  }

  function activeBranchId() {
    return typeof state === "object" && state?.currentBranchId ? state.currentBranchId : "rohrmoser";
  }

  function activeUser() {
    return typeof currentUser === "function" ? currentUser() : null;
  }

  function canManageHacienda() {
    const user = activeUser();
    return Boolean(user?.active && ["super", "admin"].includes(user.role));
  }

  function moneyText(value) {
    if (typeof money === "function") return money(value);
    return `CRC ${Number(value || 0).toLocaleString("es-CR")}`;
  }

  function statusLabel(status) {
    const labels = {
      XmlReady: "XML listo",
      XmlNeedsReview: "XML para revisar",
      SignatureReady: "Listo para firma",
      SignatureBlocked: "Firma bloqueada",
      SignedReady: "XML firmado",
      SubmissionBlocked: "Envio bloqueado",
      ReadyToSubmit: "Listo para envio",
      DraftReady: "Borrador listo",
      NeedsReview: "Revisar",
      Blocked: "Bloqueado"
    };
    return labels[status] || status || "Pendiente";
  }

  function statusClass(status) {
    if (["SignatureReady", "SignedReady", "ReadyToSubmit", "XmlReady"].includes(status)) return "is-ok";
    if (["SignatureBlocked", "SubmissionBlocked", "Blocked"].includes(status)) return "is-error";
    return "is-warning";
  }

  function selectedDocumentId() {
    return document.querySelector("[data-hacienda-phase5-document]")?.value || "";
  }

  function documentOptions() {
    const candidates = documents.filter((doc) => doc.hasUnsignedXml || doc.hasSignedXml || doc.clave);
    if (!candidates.length) return `<option value="">No hay XML fiscales</option>`;
    return candidates
      .map((doc) => {
        const total = doc.totals?.total || 0;
        const flag = doc.hasSignedXml ? "firmado" : doc.hasUnsignedXml ? "base" : "sin XML";
        const label = `${doc.invoiceId || doc.id} | ${doc.documentTypeLabel || ""} | ${statusLabel(doc.internalStatus)} | ${flag} | ${moneyText(total)}`;
        return `<option value="${safeEscape(doc.id)}">${safeEscape(label)}</option>`;
      })
      .join("");
  }

  function renderPanel() {
    const disabled = !canManageHacienda() || !documents.length ? " disabled" : "";
    return `
      <section class="hacienda-phase5-panel" id="haciendaPhase5Panel">
        <div class="hacienda-phase5-heading">
          <div>
            <span>Fase 5</span>
            <strong>Firma fiscal segura</strong>
          </div>
          <button class="secondary-action" type="button" data-hacienda-phase5-refresh${canManageHacienda() ? "" : " disabled"}>Actualizar</button>
        </div>

        <div class="hacienda-phase5-form">
          <label class="field">
            <span>Documento</span>
            <select data-hacienda-phase5-document${disabled}>
              ${documentOptions()}
            </select>
          </label>
          <div class="hacienda-phase5-actions">
            <button class="secondary-action" type="button" data-hacienda-phase5-check${disabled}>Revisar firma</button>
            <button class="primary-action" type="button" data-hacienda-phase5-prepare${disabled}>Preparar envio</button>
          </div>
        </div>

        <label class="field hacienda-phase5-signed">
          <span>XML firmado externo</span>
          <textarea data-hacienda-phase5-signed-xml spellcheck="false"${disabled}></textarea>
        </label>

        <div class="hacienda-phase5-actions">
          <button class="secondary-action" type="button" data-hacienda-phase5-save-signed${disabled}>Guardar XML firmado</button>
        </div>

        <div class="hacienda-phase5-result" id="haciendaPhase5Result">
          ${canManageHacienda() ? "Seleccione un documento fiscal." : "Solo administradores pueden revisar firma fiscal."}
        </div>
      </section>
    `;
  }

  function renderRequirement(item) {
    const kind = item.ok ? "is-ok" : item.severity === "warning" ? "is-warning" : "is-error";
    return `
      <div class="hacienda-phase5-requirement ${kind}">
        <strong>${safeEscape(item.label)}</strong>
        <span>${safeEscape(item.ok ? "OK" : item.detail || "Pendiente")}</span>
      </div>
    `;
  }

  function renderCheck(check) {
    const doc = check?.document || {};
    const requirements = Array.isArray(check?.requirements) ? check.requirements : [];
    const certificate = check?.certificate || {};
    return `
      <div class="hacienda-phase5-summary">
        <span class="hacienda-badge ${statusClass(check.status)}">${safeEscape(statusLabel(check.status))}</span>
        <span>${safeEscape(doc.documentTypeLabel || "")}</span>
        <span>${safeEscape(doc.invoiceId || doc.id || "")}</span>
      </div>
      <div class="hacienda-phase5-grid">
        <div>
          <small>XML SHA-256</small>
          <strong>${safeEscape(check.xmlSha256 || "Pendiente")}</strong>
        </div>
        <div>
          <small>XML firmado SHA-256</small>
          <strong>${safeEscape(check.signedXmlSha256 || "Pendiente")}</strong>
        </div>
        <div>
          <small>Certificado SHA-256</small>
          <strong>${safeEscape(certificate.certificateSha256 || certificate.storageRef || "Pendiente")}</strong>
        </div>
        <div>
          <small>Bytes .p12</small>
          <strong>${safeEscape(certificate.p12Bytes ? String(certificate.p12Bytes) : "Pendiente")}</strong>
        </div>
      </div>
      <div class="hacienda-phase5-requirements">
        ${requirements.map(renderRequirement).join("")}
      </div>
    `;
  }

  function renderDocumentsList() {
    if (!documents.length) return `<div class="empty-state">Sin documentos fiscales para esta sucursal.</div>`;
    return `
      <table class="data-table hacienda-phase5-table">
        <thead>
          <tr>
            <th>Factura</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th>XML</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${documents
            .map((doc) => `
              <tr>
                <td>${safeEscape(doc.invoiceId)}</td>
                <td>${safeEscape(doc.documentTypeLabel || doc.documentType)}</td>
                <td><span class="hacienda-badge ${statusClass(doc.internalStatus)}">${safeEscape(statusLabel(doc.internalStatus))}</span></td>
                <td>${safeEscape(doc.hasSignedXml ? "Firmado" : doc.hasUnsignedXml ? "Base" : "Pendiente")}</td>
                <td>${safeEscape(moneyText(doc.totals?.total || 0))}</td>
              </tr>
            `)
            .join("")}
        </tbody>
      </table>
    `;
  }

  function setResult(html) {
    const result = document.getElementById("haciendaPhase5Result");
    if (result) result.innerHTML = html;
  }

  async function loadDocuments() {
    if (loading || !canManageHacienda()) return;
    loading = true;
    try {
      const result = await backendRequest(`/hacienda/documents/signature-candidates?branchId=${encodeURIComponent(activeBranchId())}`, { cache: "no-store" });
      documents = Array.isArray(result.documents) ? result.documents : [];
      loadedBranchId = activeBranchId();
      const panel = document.getElementById("haciendaPhase5Panel");
      if (panel) panel.outerHTML = renderPanel();
      setResult(renderDocumentsList());
    } catch (error) {
      documents = [];
      setResult(safeEscape(error.message || "No se pudieron cargar documentos fiscales."));
    } finally {
      loading = false;
    }
  }

  async function reviewSignature() {
    const documentId = selectedDocumentId();
    if (!documentId) return;
    setResult("Revisando firma fiscal...");
    const result = await backendRequest("/hacienda/documents/signature-check", {
      method: "POST",
      body: JSON.stringify({ documentId })
    });
    selectedCheck = result.check || null;
    setResult(renderCheck(selectedCheck));
    await loadDocuments();
  }

  async function saveSignedXml() {
    const documentId = selectedDocumentId();
    const signedXml = document.querySelector("[data-hacienda-phase5-signed-xml]")?.value || "";
    if (!documentId || !signedXml.trim()) return;
    setResult("Guardando XML firmado...");
    const result = await backendRequest("/hacienda/documents/signed-xml", {
      method: "POST",
      body: JSON.stringify({ documentId, signedXml })
    });
    selectedCheck = result.check || null;
    setResult(renderCheck(selectedCheck));
    const textarea = document.querySelector("[data-hacienda-phase5-signed-xml]");
    if (textarea) textarea.value = "";
    await loadDocuments();
    if (typeof showToast === "function") showToast("XML firmado guardado");
  }

  async function prepareSubmission() {
    const documentId = selectedDocumentId();
    if (!documentId) return;
    setResult("Preparando paquete fiscal...");
    const result = await backendRequest("/hacienda/documents/prepare-submission", {
      method: "POST",
      body: JSON.stringify({ documentId })
    });
    const submission = result.submission || {};
    setResult(`
      <div class="hacienda-phase5-summary">
        <span class="hacienda-badge is-ok">Listo para envio</span>
        <span>${safeEscape(submission.endpointEnvironment || "")}</span>
      </div>
      <div class="hacienda-phase5-grid">
        <div>
          <small>Clave</small>
          <strong>${safeEscape(submission.payloadPreview?.clave || "")}</strong>
        </div>
        <div>
          <small>XML Base64 SHA-256</small>
          <strong>${safeEscape(submission.comprobanteXml?.base64Sha256 || "")}</strong>
        </div>
      </div>
    `);
    await loadDocuments();
    if (typeof showToast === "function") showToast("Paquete fiscal preparado");
  }

  function ensurePanel() {
    if (!isHaciendaRoute()) return;
    if (!document.body.classList.contains("is-authenticated")) return;
    const anchor = document.getElementById("haciendaPhase4Panel") || document.getElementById("haciendaPhase3Panel") || document.querySelector(".hacienda-panel");
    if (!anchor) return;
    let panel = document.getElementById("haciendaPhase5Panel");
    if (!panel) {
      anchor.insertAdjacentHTML("afterend", renderPanel());
      loadDocuments();
      return;
    }
    if (loadedBranchId && loadedBranchId !== activeBranchId()) {
      documents = [];
      selectedCheck = null;
      loadedBranchId = "";
      panel.outerHTML = renderPanel();
      loadDocuments();
    }
  }

  function installStyles() {
    if (document.getElementById("haciendaPhase5Styles")) return;
    const style = document.createElement("style");
    style.id = "haciendaPhase5Styles";
    style.textContent = `
      .hacienda-phase5-panel { display: grid; gap: 14px; padding: 16px; background: rgba(255, 255, 255, 0.78); border: 1px solid rgba(31, 34, 31, 0.08); border-radius: 8px; box-shadow: 0 12px 32px rgba(25, 28, 24, 0.07); }
      .hacienda-phase5-heading, .hacienda-phase5-actions, .hacienda-phase5-summary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .hacienda-phase5-heading { justify-content: space-between; }
      .hacienda-phase5-heading div { display: grid; gap: 4px; }
      .hacienda-phase5-heading span, .hacienda-phase5-grid small { color: rgba(41, 49, 49, 0.62); font-size: 12px; font-weight: 800; }
      .hacienda-phase5-heading strong { color: #252928; font-size: 20px; }
      .hacienda-phase5-form { display: grid; grid-template-columns: minmax(260px, 1fr) auto; gap: 12px; align-items: end; }
      .hacienda-phase5-signed textarea { min-height: 130px; width: 100%; padding: 12px; color: #1d2423; background: rgba(255, 255, 255, 0.86); border: 1px solid rgba(31, 34, 31, 0.14); border-radius: 8px; font: 12px/1.45 Consolas, Monaco, monospace; resize: vertical; }
      .hacienda-phase5-result { display: grid; gap: 12px; min-height: 54px; color: #25302e; font-size: 13px; font-weight: 800; }
      .hacienda-phase5-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .hacienda-phase5-grid div { display: grid; gap: 4px; padding: 12px; background: rgba(220, 234, 231, 0.32); border-radius: 8px; }
      .hacienda-phase5-grid strong { overflow-wrap: anywhere; color: #252928; font-size: 12px; }
      .hacienda-phase5-requirements { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .hacienda-phase5-requirement { display: grid; gap: 4px; padding: 10px 12px; border-radius: 8px; background: rgba(220, 234, 231, 0.5); color: #183d38; }
      .hacienda-phase5-requirement span { font-size: 12px; font-weight: 800; opacity: 0.78; }
      .hacienda-phase5-requirement.is-warning { background: rgba(221, 209, 184, 0.48); color: #6f4f20; }
      .hacienda-phase5-requirement.is-error, .hacienda-badge.is-error { background: rgba(255, 220, 214, 0.72); color: #7e2d23; }
      .hacienda-phase5-table { min-width: 760px; }
      @media (max-width: 980px) { .hacienda-phase5-form, .hacienda-phase5-grid, .hacienda-phase5-requirements { grid-template-columns: 1fr; } .hacienda-phase5-actions button { width: 100%; } }
    `;
    document.head.appendChild(style);
  }

  installStyles();
  window.setInterval(ensurePanel, 700);
  window.addEventListener("popstate", () => window.setTimeout(ensurePanel, 100));

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-hacienda-phase5-refresh]")) {
      event.preventDefault();
      loadDocuments();
      return;
    }
    if (event.target.closest("[data-hacienda-phase5-check]")) {
      event.preventDefault();
      reviewSignature().catch((error) => setResult(safeEscape(error.message || "No se pudo revisar la firma.")));
      return;
    }
    if (event.target.closest("[data-hacienda-phase5-save-signed]")) {
      event.preventDefault();
      saveSignedXml().catch((error) => setResult(safeEscape(error.message || "No se pudo guardar el XML firmado.")));
      return;
    }
    if (event.target.closest("[data-hacienda-phase5-prepare]")) {
      event.preventDefault();
      prepareSubmission().catch((error) => setResult(safeEscape(error.message || "No se pudo preparar el envio.")));
    }
  });

  document.addEventListener("change", (event) => {
    if (!event.target.closest("[data-hacienda-phase5-document]")) return;
    selectedCheck = null;
    setResult("Documento seleccionado.");
  });
})();
