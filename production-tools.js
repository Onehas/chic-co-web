(function () {
  if (window.__chicCoProductionTools) return;
  window.__chicCoProductionTools = true;

  function canUseBackend() {
    return typeof backendRequest === "function";
  }

  function canUseSuperTools() {
    return typeof currentUser === "function" && currentUser()?.role === "super";
  }

  function safeMoney(value) {
    if (typeof money === "function") return money(value);
    return `CRC ${Number(value || 0).toLocaleString("es-CR")}`;
  }

  function invoiceAmount(invoice) {
    if (typeof invoiceTotal === "function") return invoiceTotal(invoice);
    return Number(invoice.total || invoice.paid || invoice.serviceAmount || 0);
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function todayFileStamp() {
    if (typeof todayISO === "function") return todayISO();
    return new Date().toISOString().slice(0, 10);
  }

  async function exportOnlineBackup() {
    try {
      if (typeof syncStateToBackend === "function") {
        await syncStateToBackend({ force: true });
      }
      if (!canUseBackend()) throw new Error("Backend no disponible");
      const response = await backendRequest("/backup", { cache: "no-store" });
      downloadFile(
        `chic-co-respaldo-online-${todayFileStamp()}.json`,
        JSON.stringify(response.backup || response, null, 2),
        "application/json;charset=utf-8"
      );
      showToast("Respaldo online exportado");
    } catch (error) {
      const payload = { version: 1, exportedAt: new Date().toISOString(), state };
      downloadFile(`chic-co-respaldo-local-${todayFileStamp()}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
      showToast("Se exporto un respaldo local");
    }
  }

  async function importOnlineBackup(file) {
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      showToast("Respaldo invalido");
      return;
    }
    if (!confirm("Importar este respaldo reemplazara los datos online actuales. Continuar?")) return;
    const nextState = parsed.state || parsed.backup?.state || parsed;
    try {
      if (!canUseBackend()) throw new Error("Backend no disponible");
      await backendRequest("/backup", {
        method: "POST",
        body: JSON.stringify({ state: nextState })
      });
      const response = await backendRequest("/state", { cache: "no-store" });
      if (response.state) {
        state = typeof normalizeStateSnapshot === "function" ? normalizeStateSnapshot(response.state) : response.state;
        if (typeof saveState === "function") saveState();
        if (typeof renderAll === "function") renderAll();
      }
      showToast("Respaldo online importado");
    } catch (error) {
      state = typeof normalizeStateSnapshot === "function" ? normalizeStateSnapshot(nextState) : nextState;
      if (typeof saveState === "function") saveState();
      if (typeof renderAll === "function") renderAll();
      showToast("Respaldo importado localmente");
    }
  }

  async function exportAuditLog() {
    try {
      if (!canUseBackend()) throw new Error("Backend no disponible");
      const response = await backendRequest("/audit", { cache: "no-store" });
      downloadFile(
        `chic-co-bitacora-${todayFileStamp()}.json`,
        JSON.stringify(response.auditLog || [], null, 2),
        "application/json;charset=utf-8"
      );
      showToast("Bitacora exportada");
    } catch (error) {
      showToast("La bitacora online no esta disponible");
    }
  }

  function branchName() {
    if (typeof currentBranch === "function") return currentBranch()?.label || "Sucursal";
    return "Sucursal";
  }

  function currentMonthInvoices() {
    const month = todayFileStamp().slice(0, 7);
    return (state.invoices || []).filter((invoice) => String(invoice.date || "").startsWith(month));
  }

  function renderBranchReport() {
    // El resumen mensual pertenece a Facturacion. Repetirlo en los ocho
    // modulos empujaba el contenido real 300px hacia abajo.
    if (typeof currentModule === "string" && currentModule !== "facturacion") return;
    if (!elements?.viewContent || elements.viewContent.querySelector(".branch-report")) return;
    const target = elements.viewContent.querySelector(".view-grid") || elements.viewContent.firstElementChild;
    if (!target) return;

    const invoices = currentMonthInvoices();
    const reportItems = [
      ["Ventas del mes", safeMoney(invoices.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0))],
      ["Pagado", safeMoney(invoices.reduce((sum, invoice) => sum + Number(invoice.paid || invoiceAmount(invoice)), 0))],
      ["Efectivo", safeMoney(invoices.filter((invoice) => invoice.paymentMethod === "Efectivo").reduce((sum, invoice) => sum + invoiceAmount(invoice), 0))],
      ["Tarjeta", safeMoney(invoices.filter((invoice) => invoice.paymentMethod === "Tarjeta").reduce((sum, invoice) => sum + invoiceAmount(invoice), 0))],
      ["Citas hoy", (state.appointments || []).filter((appointment) => appointment.date === todayFileStamp()).length],
      ["Planes activos", (state.plans || []).filter((plan) => plan.status !== "Completado").length],
      ["Stock bajo", typeof lowProducts === "function" ? lowProducts().length : 0],
      ["Clientes", (state.clients || []).length]
    ];

    const report = document.createElement("section");
    report.className = "branch-report";
    report.innerHTML = `
      <div class="branch-report-head">
        <div>
          <span>Resumen online</span>
          <h3>${escapeHtml(branchName())}</h3>
        </div>
        <small>Datos separados por sucursal</small>
      </div>
      <div class="branch-report-grid">
        ${reportItems
          .map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
          .join("")}
      </div>
    `;
    target.before(report);
  }

  function addProductionTools() {
    if (!canUseSuperTools()) return;
    const panel = elements?.viewContent?.querySelector(".records-panel");
    if (!panel || panel.querySelector(".production-tools")) return;
    const tools = document.createElement("section");
    tools.className = "production-tools";
    tools.innerHTML = `
      <div>
        <strong>Herramientas online</strong>
        <span>Respaldo, restauracion y bitacora del servidor.</span>
      </div>
      <div class="production-tools-actions">
        <button class="secondary-action" type="button" data-online-backup>Respaldo online</button>
        <button class="secondary-action" type="button" data-online-import>Importar online</button>
        <button class="secondary-action" type="button" data-online-audit>Bitacora</button>
        <input type="file" accept="application/json,.json" data-online-import-file hidden>
      </div>
    `;
    panel.prepend(tools);
  }

  function enhanceCurrentView() {
    renderBranchReport();
    addProductionTools();
  }

  const previousRenderView = renderView;
  renderView = function () {
    previousRenderView();
    enhanceCurrentView();
  };

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-online-backup]")) {
      event.preventDefault();
      exportOnlineBackup();
      return;
    }
    if (event.target.closest("[data-online-import]")) {
      event.preventDefault();
      document.querySelector("[data-online-import-file]")?.click();
      return;
    }
    if (event.target.closest("[data-online-audit]")) {
      event.preventDefault();
      exportAuditLog();
    }
  });

  document.addEventListener("change", (event) => {
    const input = event.target.closest("[data-online-import-file]");
    if (!input?.files?.[0]) return;
    importOnlineBackup(input.files[0]);
    input.value = "";
  });

  const style = document.createElement("style");
  style.textContent = `
    .branch-report,
    .production-tools {
      display: grid;
      gap: 12px;
      padding: 12px;
      border: 1px solid rgba(36, 49, 50, 0.08);
      background: rgba(251, 251, 244, 0.94);
      border-radius: var(--radius);
    }

    .branch-report {
      margin-bottom: 12px;
    }

    .branch-report-head,
    .production-tools {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }

    .branch-report-head h3,
    .production-tools strong {
      margin: 0;
      color: var(--ink);
      font-size: 15px;
    }

    .branch-report-head span,
    .branch-report-head small,
    .production-tools span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .branch-report-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }

    .branch-report-grid article {
      display: grid;
      gap: 4px;
      min-width: 0;
      padding: 10px;
      background: #fff;
      border: 1px solid rgba(36, 49, 50, 0.06);
      border-radius: var(--radius);
    }

    .branch-report-grid span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
    }

    .branch-report-grid strong {
      color: var(--ink);
      font-size: 14px;
      overflow-wrap: anywhere;
    }

    .production-tools {
      margin-bottom: 10px;
    }

    .production-tools-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }

    @media (max-width: 860px) {
      .branch-report-head,
      .production-tools {
        grid-template-columns: 1fr;
      }

      .branch-report-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .production-tools-actions > * {
        flex: 1 1 140px;
      }
    }
  `;
  document.head.appendChild(style);

  if (document.body.classList.contains("is-authenticated")) {
    enhanceCurrentView();
  }
})();