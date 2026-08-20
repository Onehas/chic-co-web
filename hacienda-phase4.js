(() => {
  if (window.__chicHaciendaPhase4) return;
  window.__chicHaciendaPhase4 = true;

  let lastXml = "";
  let lastDocument = null;
  let loadedBranchId = "";

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

  function branchInvoices() {
    return Array.isArray(state?.invoices) ? state.invoices : [];
  }

  function moneyText(value) {
    if (typeof money === "function") return money(value);
    return `CRC ${Number(value || 0).toLocaleString("es-CR")}`;
  }

  function clientLabel(clientId) {
    if (typeof clientName === "function") return clientName(clientId);
    const client = Array.isArray(state?.clients) ? state.clients.find((item) => item.id === clientId) : null;
    return client?.name || "Sin cliente";
  }

  function invoiceTotal(invoice) {
    const subtotal = Number(invoice?.serviceAmount || 0) + Number(invoice?.productAmount || 0);
    return subtotal + Math.round(subtotal * (Number(invoice?.ivaRate || 0) / 100));
  }

  function invoiceOptions() {
    const invoices = branchInvoices().slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    if (!invoices.length) return `<option value="">No hay facturas</option>`;
    return invoices
      .map((invoice) => {
        const label = `${invoice.id} | ${invoice.date || "Sin fecha"} | ${clientLabel(invoice.clientId)} | ${moneyText(invoiceTotal(invoice))}`;
        return `<option value="${safeEscape(invoice.id)}">${safeEscape(label)}</option>`;
      })
      .join("");
  }

  function selectedInvoiceId() {
    return document.querySelector("[data-hacienda-phase4-invoice]")?.value || "";
  }

  function selectedDocumentType() {
    return document.querySelector("[data-hacienda-phase4-document-type]")?.value || "04";
  }

  function statusLabel(status) {
    const labels = {
      XmlReady: "XML listo",
      XmlNeedsReview: "XML para revisar",
      DraftReady: "Borrador listo",
      NeedsReview: "Revisar",
      Blocked: "Bloqueado"
    };
    return labels[status] || status || "Pendiente";
  }

  function statusClass(status) {
    if (status === "XmlReady") return "is-ok";
    if (status === "Blocked") return "is-error";
    return "is-warning";
  }

  function renderPanel() {
    const invoices = branchInvoices();
    const disabled = invoices.length && canManageHacienda() ? "" : " disabled";
    return `
      <section class="hacienda-phase4-panel" id="haciendaPhase4Panel">
        <div class="hacienda-phase4-heading">
          <div>
            <span>Fase 4</span>
            <strong>XML fiscal 4.4</strong>
          </div>
          <span class="hacienda-badge is-warning">Sin firma ni envio</span>
        </div>

        <div class="hacienda-phase4-form">
          <label class="field">
            <span>Factura</span>
            <select data-hacienda-phase4-invoice${disabled}>
              ${invoiceOptions()}
            </select>
          </label>
          <label class="field">
            <span>Tipo de XML</span>
            <select data-hacienda-phase4-document-type${disabled}>
              <option value="04">Tiquete electronico</option>
              <option value="01">Factura electronica</option>
            </select>
          </label>
          <button class="primary-action" type="button" data-hacienda-phase4-generate${disabled}>Generar XML base</button>
        </div>

        <div class="hacienda-phase4-result" id="haciendaPhase4Result">
          ${canManageHacienda() ? "Seleccione una factura para generar la estructura XML." : "Solo administradores pueden generar XML fiscal."}
        </div>
      </section>
    `;
  }

  function renderFindings(validation) {
    const findings = validation?.findings || [];
    if (!findings.length) return `<div class="hacienda-phase4-finding is-ok">Sin hallazgos fiscales pendientes.</div>`;
    return findings
      .map((finding) => {
        const kind = finding.severity === "error" ? "is-error" : "is-warning";
        return `<div class="hacienda-phase4-finding ${kind}">${safeEscape(finding.message)}</div>`;
      })
      .join("");
  }

  function renderXmlResult(payload) {
    const document = payload.document || {};
    const validation = payload.validation || {};
    const totals = document.totals || validation.totals || {};
    return `
      <div class="hacienda-phase4-summary">
        <span class="hacienda-badge ${statusClass(document.internalStatus)}">${safeEscape(statusLabel(document.internalStatus))}</span>
        <span>${safeEscape(document.documentTypeLabel || "")}</span>
        <span>Total ${safeEscape(moneyText(totals.total || 0))}</span>
      </div>
      <div class="hacienda-phase4-grid">
        <div>
          <small>Clave</small>
          <strong>${safeEscape(document.clave || "Pendiente")}</strong>
        </div>
        <div>
          <small>Consecutivo</small>
          <strong>${safeEscape(document.consecutivo || "Pendiente")}</strong>
        </div>
      </div>
      <div class="hacienda-phase4-findings">
        ${renderFindings(validation)}
      </div>
      <textarea class="hacienda-phase4-xml" readonly spellcheck="false">${safeEscape(payload.xml || "")}</textarea>
    `;
  }

  function setResult(html) {
    const result = document.getElementById("haciendaPhase4Result");
    if (result) result.innerHTML = html;
  }

  async function generateXml() {
    const invoiceId = selectedInvoiceId();
    if (!invoiceId) return;
    setResult("Generando XML base...");
    const payload = await backendRequest("/hacienda/documents/xml", {
      method: "POST",
      body: JSON.stringify({
        branchId: activeBranchId(),
        invoiceId,
        documentType: selectedDocumentType()
      })
    });
    lastXml = payload.xml || "";
    lastDocument = payload.document || null;
    setResult(renderXmlResult(payload));
    if (typeof showToast === "function") showToast("XML fiscal base generado");
  }

  function ensurePanel() {
    if (!isHaciendaRoute()) return;
    if (!document.body.classList.contains("is-authenticated")) return;
    const anchor = document.getElementById("haciendaPhase3Panel") || document.querySelector(".hacienda-panel");
    if (!anchor) return;
    let panel = document.getElementById("haciendaPhase4Panel");
    if (!panel) {
      anchor.insertAdjacentHTML("afterend", renderPanel());
      loadedBranchId = activeBranchId();
      return;
    }
    if (loadedBranchId && loadedBranchId !== activeBranchId()) {
      lastXml = "";
      lastDocument = null;
      loadedBranchId = activeBranchId();
      panel.outerHTML = renderPanel();
    }
  }

  function installStyles() {
    if (document.getElementById("haciendaPhase4Styles")) return;
    const style = document.createElement("style");
    style.id = "haciendaPhase4Styles";
    style.textContent = `
      .hacienda-phase4-panel { display: grid; gap: 14px; padding: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow-2); }
      .hacienda-phase4-heading, .hacienda-phase4-form, .hacienda-phase4-summary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .hacienda-phase4-heading { justify-content: space-between; }
      .hacienda-phase4-heading div { display: grid; gap: 4px; }
      .hacienda-phase4-heading span, .hacienda-phase4-grid small { color: rgba(41, 49, 49, 0.62); font-size: 12px; font-weight: 800; }
      .hacienda-phase4-heading strong { color: var(--ink); font-size: 20px; }
      .hacienda-phase4-form { display: grid; grid-template-columns: minmax(220px, 1.2fr) minmax(180px, 0.8fr) auto; gap: 12px; align-items: end; }
      .hacienda-phase4-result { display: grid; gap: 12px; min-height: 54px; color: var(--ink); font-size: 13px; font-weight: 800; }
      .hacienda-phase4-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .hacienda-phase4-grid div { display: grid; gap: 4px; padding: 12px; background: rgba(220, 234, 231, 0.32); border-radius: 8px; }
      .hacienda-phase4-grid strong { overflow-wrap: anywhere; color: var(--ink); font-size: 13px; }
      .hacienda-phase4-findings { display: grid; gap: 8px; }
      .hacienda-phase4-finding { padding: 10px 12px; border-radius: 8px; background: var(--ok-soft); color: var(--ok); }
      .hacienda-phase4-finding.is-warning { background: var(--warn-soft); color: var(--warn); }
      .hacienda-phase4-finding.is-error, .hacienda-badge.is-error { background: var(--crit-soft); color: var(--crit); }
      .hacienda-phase4-xml { min-height: 240px; width: 100%; padding: 12px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 8px; font: 12px/1.45 Consolas, Monaco, monospace; resize: vertical; }
      @media (max-width: 980px) { .hacienda-phase4-form, .hacienda-phase4-grid { grid-template-columns: 1fr; } .hacienda-phase4-form button { width: 100%; } }
    `;
    document.head.appendChild(style);
  }

  installStyles();
  window.setInterval(ensurePanel, 700);
  window.addEventListener("popstate", () => window.setTimeout(ensurePanel, 100));

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-hacienda-phase4-generate]")) return;
    event.preventDefault();
    generateXml().catch((error) => {
      setResult(safeEscape(error.message || "No se pudo generar el XML fiscal."));
    });
  });

  document.addEventListener("change", (event) => {
    if (!event.target.closest("[data-hacienda-phase4-invoice], [data-hacienda-phase4-document-type]")) return;
    lastXml = "";
    lastDocument = null;
    setResult("Seleccione Generar XML base para preparar la factura.");
  });
})();
