(() => {
  if (window.__chicHaciendaPhase3) return;
  window.__chicHaciendaPhase3 = true;

  let lastValidation = null;
  let lastDocuments = [];
  let loadedBranchId = "";
  let loadingDocuments = false;

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

  function invoiceSubtotalLocal(invoice) {
    return Number(invoice?.serviceAmount || 0) + Number(invoice?.productAmount || 0);
  }

  function invoiceIvaLocal(invoice) {
    return Math.round(invoiceSubtotalLocal(invoice) * (Number(invoice?.ivaRate || 0) / 100));
  }

  function invoiceTotalLocal(invoice) {
    return invoiceSubtotalLocal(invoice) + invoiceIvaLocal(invoice);
  }

  function clientLabel(clientId) {
    if (typeof clientName === "function") return clientName(clientId);
    const client = Array.isArray(state?.clients) ? state.clients.find((item) => item.id === clientId) : null;
    return client?.name || "Sin cliente";
  }

  function branchInvoices() {
    return Array.isArray(state?.invoices) ? state.invoices : [];
  }

  function selectedInvoiceId() {
    return document.querySelector("[data-hacienda-phase3-invoice]")?.value || "";
  }

  function selectedDocumentType() {
    return document.querySelector("[data-hacienda-phase3-document-type]")?.value || "04";
  }

  function statusLabel(status) {
    const labels = {
      Ready: "Listo",
      NeedsReview: "Revisar",
      Blocked: "Bloqueado",
      DraftReady: "Borrador listo",
      Draft: "Borrador",
      Pending: "Pendiente"
    };
    return labels[status] || status || "Pendiente";
  }

  function statusClass(status) {
    if (["Ready", "DraftReady"].includes(status)) return "is-ok";
    if (status === "Blocked") return "is-error";
    return "is-warning";
  }

  function documentTypeLabel(value) {
    return value === "01" ? "Factura electronica" : "Tiquete electronico";
  }

  function invoiceOptions() {
    const invoices = branchInvoices().slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    if (!invoices.length) return `<option value="">No hay facturas</option>`;
    return invoices
      .map((invoice) => {
        const label = `${invoice.id} | ${invoice.date || "Sin fecha"} | ${clientLabel(invoice.clientId)} | ${moneyText(invoiceTotalLocal(invoice))}`;
        return `<option value="${safeEscape(invoice.id)}">${safeEscape(label)}</option>`;
      })
      .join("");
  }

  function renderPhase3Panel() {
    const invoices = branchInvoices();
    const disabled = invoices.length ? "" : " disabled";
    const draftDisabled = !canManageHacienda() || !invoices.length ? " disabled" : "";
    return `
      <section class="hacienda-phase3-panel" id="haciendaPhase3Panel">
        <div class="hacienda-phase3-heading">
          <div>
            <span>Fase 3</span>
            <strong>Revision fiscal de facturas</strong>
          </div>
          <button class="secondary-action" type="button" data-hacienda-phase3-refresh>Actualizar</button>
        </div>

        <div class="hacienda-phase3-form">
          <label class="field">
            <span>Factura</span>
            <select data-hacienda-phase3-invoice${disabled}>
              ${invoiceOptions()}
            </select>
          </label>
          <label class="field">
            <span>Tipo de comprobante</span>
            <select data-hacienda-phase3-document-type${disabled}>
              <option value="04">Tiquete electronico</option>
              <option value="01">Factura electronica</option>
            </select>
          </label>
          <div class="hacienda-phase3-actions">
            <button class="secondary-action" type="button" data-hacienda-phase3-validate${disabled}>Validar</button>
            <button class="primary-action" type="button" data-hacienda-phase3-draft${draftDisabled}>Crear borrador</button>
          </div>
        </div>

        <div class="hacienda-phase3-result" id="haciendaPhase3Result">
          ${invoices.length ? "Seleccione una factura para revisar." : "Primero cree una factura en Facturacion."}
        </div>

        <div class="hacienda-phase3-documents" id="haciendaPhase3Documents">
          ${renderDocuments(lastDocuments)}
        </div>
      </section>
    `;
  }

  function renderFindings(validation) {
    const findings = validation?.findings || [];
    if (!findings.length) return `<div class="hacienda-phase3-finding is-ok">Sin errores fiscales internos.</div>`;
    return findings
      .map((finding) => {
        const kind = finding.severity === "error" ? "is-error" : "is-warning";
        return `<div class="hacienda-phase3-finding ${kind}">${safeEscape(finding.message)}</div>`;
      })
      .join("");
  }

  function renderValidation(validation, document = null) {
    if (!validation) return "Seleccione una factura para revisar.";
    const totals = validation.totals || {};
    const preliminary = validation.preliminary || {};
    const documentStatus = document ? statusLabel(document.internalStatus) : statusLabel(validation.status);
    return `
      <div class="hacienda-phase3-summary">
        <span class="hacienda-badge ${statusClass(document?.internalStatus || validation.status)}">${safeEscape(documentStatus)}</span>
        <span>Total ${safeEscape(moneyText(totals.total || 0))}</span>
        <span>${safeEscape(validation.documentTypeLabel || documentTypeLabel(validation.documentType))}</span>
      </div>
      <div class="hacienda-phase3-grid">
        <div>
          <small>Consecutivo preliminar</small>
          <strong>${safeEscape(preliminary.consecutivo || "Pendiente")}</strong>
        </div>
        <div>
          <small>Clave</small>
          <strong>${safeEscape(preliminary.clave || "Fase 4")}</strong>
        </div>
      </div>
      <div class="hacienda-phase3-findings">
        ${renderFindings(validation)}
      </div>
    `;
  }

  function renderDocuments(documents = []) {
    if (!documents.length) return `<div class="empty-state">Sin borradores fiscales internos.</div>`;
    return `
      <table class="data-table hacienda-phase3-table">
        <thead>
          <tr>
            <th>Factura</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th>Total</th>
            <th>Actualizado</th>
          </tr>
        </thead>
        <tbody>
          ${documents
            .map((document) => {
              const total = document.totals?.total || 0;
              return `
                <tr>
                  <td>${safeEscape(document.invoiceId)}</td>
                  <td>${safeEscape(document.documentTypeLabel || documentTypeLabel(document.documentType))}</td>
                  <td><span class="hacienda-badge ${statusClass(document.internalStatus)}">${safeEscape(statusLabel(document.internalStatus))}</span></td>
                  <td>${safeEscape(moneyText(total))}</td>
                  <td>${safeEscape(String(document.updatedAt || "").slice(0, 19).replace("T", " "))}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  function setResult(html) {
    const result = document.getElementById("haciendaPhase3Result");
    if (result) result.innerHTML = html;
  }

  function setDocuments(documents) {
    lastDocuments = Array.isArray(documents) ? documents : [];
    const container = document.getElementById("haciendaPhase3Documents");
    if (container) container.innerHTML = renderDocuments(lastDocuments);
  }

  async function loadDocuments() {
    if (loadingDocuments) return;
    loadingDocuments = true;
    try {
      const result = await backendRequest(`/hacienda/documents?branchId=${encodeURIComponent(activeBranchId())}`, { cache: "no-store" });
      setDocuments(result.documents || []);
      loadedBranchId = activeBranchId();
    } catch (error) {
      setDocuments([]);
    } finally {
      loadingDocuments = false;
    }
  }

  async function validateSelectedInvoice() {
    const invoiceId = selectedInvoiceId();
    if (!invoiceId) return;
    setResult("Validando factura...");
    const result = await backendRequest("/hacienda/validate-invoice", {
      method: "POST",
      body: JSON.stringify({
        branchId: activeBranchId(),
        invoiceId,
        documentType: selectedDocumentType()
      })
    });
    lastValidation = result.validation;
    setResult(renderValidation(lastValidation));
  }

  async function createDraft() {
    const invoiceId = selectedInvoiceId();
    if (!invoiceId) return;
    setResult("Creando borrador fiscal...");
    const result = await backendRequest("/hacienda/documents/draft", {
      method: "POST",
      body: JSON.stringify({
        branchId: activeBranchId(),
        invoiceId,
        documentType: selectedDocumentType()
      })
    });
    lastValidation = result.validation;
    setResult(renderValidation(lastValidation, result.document));
    await loadDocuments();
    if (typeof showToast === "function") showToast("Borrador fiscal actualizado");
  }

  function ensurePanel() {
    if (!isHaciendaRoute()) return;
    if (!document.body.classList.contains("is-authenticated")) return;
    const haciendaPanel = document.querySelector(".hacienda-panel");
    if (!haciendaPanel) return;
    let panel = document.getElementById("haciendaPhase3Panel");
    if (!panel) {
      haciendaPanel.insertAdjacentHTML("afterend", renderPhase3Panel());
      panel = document.getElementById("haciendaPhase3Panel");
      loadDocuments();
      return;
    }
    if (loadedBranchId && loadedBranchId !== activeBranchId()) {
      lastValidation = null;
      loadedBranchId = "";
      panel.outerHTML = renderPhase3Panel();
      loadDocuments();
    }
  }

  function installStyles() {
    if (document.getElementById("haciendaPhase3Styles")) return;
    const style = document.createElement("style");
    style.id = "haciendaPhase3Styles";
    style.textContent = `
      .hacienda-phase3-panel {
        display: grid;
        gap: 14px;
        padding: 16px;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 8px;
        box-shadow: var(--shadow-2);
      }
      .hacienda-phase3-heading,
      .hacienda-phase3-actions,
      .hacienda-phase3-summary {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .hacienda-phase3-heading {
        justify-content: space-between;
      }
      .hacienda-phase3-heading div {
        display: grid;
        gap: 4px;
      }
      .hacienda-phase3-heading span,
      .hacienda-phase3-grid small {
        color: rgba(41, 49, 49, 0.62);
        font-size: 12px;
        font-weight: 800;
      }
      .hacienda-phase3-heading strong {
        color: var(--ink);
        font-size: 20px;
      }
      .hacienda-phase3-form {
        display: grid;
        grid-template-columns: minmax(220px, 1.2fr) minmax(180px, 0.8fr) auto;
        gap: 12px;
        align-items: end;
      }
      .hacienda-phase3-actions {
        justify-content: flex-end;
      }
      .hacienda-phase3-result {
        display: grid;
        gap: 12px;
        min-height: 54px;
        color: var(--ink);
        font-size: 13px;
        font-weight: 800;
      }
      .hacienda-phase3-summary {
        color: var(--ink);
      }
      .hacienda-phase3-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .hacienda-phase3-grid div {
        display: grid;
        gap: 4px;
        padding: 12px;
        background: rgba(220, 234, 231, 0.32);
        border-radius: 8px;
      }
      .hacienda-phase3-grid strong {
        overflow-wrap: anywhere;
        color: var(--ink);
        font-size: 13px;
      }
      .hacienda-phase3-findings {
        display: grid;
        gap: 8px;
      }
      .hacienda-phase3-finding {
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--ok-soft);
        color: var(--ok);
      }
      .hacienda-phase3-finding.is-warning {
        background: var(--warn-soft);
        color: var(--warn);
      }
      .hacienda-phase3-finding.is-error,
      .hacienda-badge.is-error {
        background: var(--crit-soft);
        color: var(--crit);
      }
      .hacienda-badge.is-warning {
        background: rgba(221, 209, 184, 0.56);
        color: var(--warn);
      }
      .hacienda-phase3-documents {
        overflow-x: auto;
      }
      .hacienda-phase3-table {
        min-width: 720px;
      }
      @media (max-width: 980px) {
        .hacienda-phase3-form,
        .hacienda-phase3-grid {
          grid-template-columns: 1fr;
        }
        .hacienda-phase3-actions {
          justify-content: stretch;
        }
        .hacienda-phase3-actions button {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  installStyles();
  window.setInterval(ensurePanel, 700);
  window.addEventListener("popstate", () => window.setTimeout(ensurePanel, 100));

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-hacienda-phase3-refresh]")) {
      event.preventDefault();
      loadDocuments();
      return;
    }
    if (event.target.closest("[data-hacienda-phase3-validate]")) {
      event.preventDefault();
      validateSelectedInvoice().catch((error) => {
        setResult(safeEscape(error.message || "No se pudo validar la factura."));
      });
      return;
    }
    if (event.target.closest("[data-hacienda-phase3-draft]")) {
      event.preventDefault();
      createDraft().catch((error) => {
        setResult(safeEscape(error.message || "No se pudo crear el borrador fiscal."));
      });
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.closest("[data-hacienda-phase3-invoice], [data-hacienda-phase3-document-type]")) {
      lastValidation = null;
      setResult("Seleccione Validar para revisar la factura.");
    }
  });
})();
