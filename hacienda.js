(() => {
  if (window.__chicHaciendaModule) return;
  window.__chicHaciendaModule = true;

  const routePath = "/Hacienda";
  const providerPortalUrl = "https://facturas.sufacturafacil.com/PortalApi/account/login?ReturnUrl=%2fPortalApi";
  let currentConfig = null;
  let lastStatus = "";

  function safeEscape(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function haciendaButton() {
    return document.querySelector("[data-hacienda-open]");
  }

  function isHaciendaRoute() {
    return /^\/hacienda\/?$/i.test(window.location.pathname);
  }

  function activeBranchId() {
    return typeof state === "object" && state?.currentBranchId ? state.currentBranchId : "rohrmoser";
  }

  function activeBranchLabel() {
    const branchId = activeBranchId();
    const branch = Array.isArray(branchOptions) ? branchOptions.find((item) => item.id === branchId) : null;
    return branch?.label || branchId;
  }

  function activeUser() {
    return typeof currentUser === "function" ? currentUser() : null;
  }

  function canViewHaciendaLocal() {
    const user = activeUser();
    return Boolean(user?.active && (["super", "admin"].includes(user.role) || user.permissions?.facturacion?.read));
  }

  function canManageHaciendaLocal() {
    const user = activeUser();
    return Boolean(user?.active && ["super", "admin"].includes(user.role));
  }

  function setButtonState(active = false) {
    const button = haciendaButton();
    if (!button) return;
    button.classList.toggle("is-hidden", !canViewHaciendaLocal());
    button.classList.toggle("is-active", Boolean(active && canViewHaciendaLocal()));
  }

  function statusBadge(label, enabled) {
    const className = enabled ? "is-ok" : "is-muted";
    return `<span class="hacienda-badge ${className}">${safeEscape(label)}</span>`;
  }

  function secretBadge(label, present) {
    return statusBadge(`${label}: ${present ? "registrado" : "pendiente"}`, present);
  }

  function formValue(name, fallback = "") {
    return safeEscape(currentConfig?.[name] ?? fallback);
  }

  function selectOption(value, label, selectedValue) {
    const selected = value === selectedValue ? " selected" : "";
    return `<option value="${safeEscape(value)}"${selected}>${safeEscape(label)}</option>`;
  }

  function checked(value) {
    return value ? " checked" : "";
  }

  function disabled() {
    return canManageHaciendaLocal() && currentConfig?.canManage ? "" : " disabled";
  }

  function renderHaciendaMetrics(config) {
    const flags = config?.featureFlags || {};
    const secret = config?.secretStatus || {};
    const metrics = [
      [config?.environment || "Sandbox", "Ambiente"],
      [flags.HaciendaIntegrationEnabled ? "Activa" : "Apagada", "Integracion"],
      [secret.encryptionConfigured ? "Lista" : "Pendiente", "Clave segura"]
    ];
    elements.moduleMetrics.innerHTML = metrics
      .map(([value, label]) => `<div class="metric"><strong>${safeEscape(value)}</strong><span>${safeEscape(label)}</span></div>`)
      .join("");
  }

  function renderHaciendaShell(config = currentConfig) {
    document.querySelectorAll("[data-module]").forEach((button) => button.classList.remove("is-active"));
    setButtonState(true);

    elements.moduleTitle.textContent = "Hacienda";
    elements.moduleDescription.textContent = "Configuracion fiscal por sucursal para preparar la integracion de comprobantes electronicos.";
    renderHaciendaMetrics(config);

    elements.moduleActions.innerHTML = `
      <button class="secondary-action" type="button" data-hacienda-refresh>Actualizar</button>
      ${canManageHaciendaLocal() ? `<button class="secondary-action" type="button" data-hacienda-test-credentials>Probar usuario</button>` : ""}
      ${canManageHaciendaLocal() ? `<button class="secondary-action" type="button" data-hacienda-test-certificate>Probar certificado</button>` : ""}
    `;

    elements.viewEyebrow.textContent = "Fiscal";
    elements.viewTitle.textContent = "Comprobantes electronicos";
    elements.viewSubtitle.textContent = activeBranchLabel();

    if (!config) {
      elements.viewContent.innerHTML = `<div class="empty-state">Cargando configuracion fiscal...</div>`;
      return;
    }

    elements.viewContent.innerHTML = renderHaciendaView(config);
  }

  function renderHaciendaView(config) {
    const secret = config.secretStatus || {};
    const flags = config.featureFlags || {};
    const endpoints = config.endpoints || {};
    const isDisabled = disabled();
    const editNote = config.canManage
      ? "Los secretos se guardan cifrados en el backend y nunca se muestran de vuelta."
      : "Este usuario puede consultar la configuracion, pero no modificarla.";

    return `
      <section class="hacienda-panel">
        <div class="hacienda-status-row">
          <article class="hacienda-card">
            <span>Estado fiscal</span>
            <strong>${flags.HaciendaIntegrationEnabled ? "Preparado" : "Sin activar"}</strong>
            <div class="hacienda-badges">
              ${statusBadge(`Ambiente: ${config.environment}`, true)}
              ${statusBadge("Envio directo", flags.HaciendaDirectSubmissionEnabled)}
              ${statusBadge("Proveedor anterior", flags.LegacyInvoiceProviderEnabled)}
            </div>
          </article>
          <article class="hacienda-card">
            <span>Secretos</span>
            <strong>${secret.encryptionConfigured ? "Cifrado disponible" : "Falta clave Render"}</strong>
            <div class="hacienda-badges">
              ${secretBadge("ATV", secret.apiPassword)}
              ${secretBadge("P12", secret.p12)}
              ${secretBadge("PIN", secret.p12Pin)}
            </div>
          </article>
          <article class="hacienda-card">
            <span>Endpoint</span>
            <strong>${safeEscape(endpoints.clientId || "api-stag")}</strong>
            <small>${safeEscape(endpoints.receptionBaseUrl || "")}</small>
          </article>
        </div>

        <div class="hacienda-alert" id="haciendaStatusMessage">${safeEscape(lastStatus || editNote)}</div>

        <form class="hacienda-form" data-hacienda-form autocomplete="off">
          <input type="hidden" name="branchId" value="${safeEscape(config.branchId || activeBranchId())}" />

          <div class="form-grid">
            <label class="hacienda-switch field full">
              <input name="enabled" type="checkbox"${checked(config.enabled)}${isDisabled} />
              <span>Activar integracion fiscal para esta sucursal</span>
            </label>
            <label class="hacienda-switch field">
              <input name="directSubmissionEnabled" type="checkbox"${checked(config.directSubmissionEnabled)}${isDisabled} />
              <span>Preparar envio directo</span>
            </label>
            <label class="hacienda-switch field">
              <input name="legacyProviderEnabled" type="checkbox"${checked(config.legacyProviderEnabled)}${isDisabled} />
              <span>Mantener proveedor anterior</span>
            </label>

            <label class="field">
              <span>Ambiente</span>
              <select name="environment"${isDisabled}>
                ${selectOption("Sandbox", "Sandbox", config.environment)}
                ${selectOption("Produccion", "Produccion", config.environment)}
              </select>
            </label>
            <label class="field">
              <span>Metodo de envio</span>
              <select name="submissionMethod"${isDisabled}>
                ${selectOption("LegacyProvider", "Proveedor anterior", config.submissionMethod)}
                ${selectOption("Direct", "Directo Hacienda", config.submissionMethod)}
              </select>
            </label>

            <label class="field">
              <span>Tipo identificacion</span>
              <input name="issuerIdType" value="${formValue("issuerIdType")}" placeholder="01"${isDisabled} />
            </label>
            <label class="field">
              <span>Identificacion</span>
              <input name="issuerIdNumber" value="${formValue("issuerIdNumber")}" inputmode="numeric"${isDisabled} />
            </label>
            <label class="field">
              <span>Razon social</span>
              <input name="issuerLegalName" value="${formValue("issuerLegalName")}"${isDisabled} />
            </label>
            <label class="field">
              <span>Nombre comercial</span>
              <input name="issuerTradeName" value="${formValue("issuerTradeName", "Chic & Co")}"${isDisabled} />
            </label>
            <label class="field">
              <span>Actividad economica</span>
              <input name="economicActivityCode" value="${formValue("economicActivityCode")}" inputmode="numeric"${isDisabled} />
            </label>
            <label class="field">
              <span>Email emisor</span>
              <input name="issuerEmail" type="email" value="${formValue("issuerEmail")}"${isDisabled} />
            </label>
            <label class="field">
              <span>Codigo sucursal</span>
              <input name="branchCode" value="${formValue("branchCode")}" inputmode="numeric" maxlength="3" placeholder="001"${isDisabled} />
            </label>
            <label class="field">
              <span>Codigo terminal</span>
              <input name="terminalCode" value="${formValue("terminalCode")}" inputmode="numeric" maxlength="5" placeholder="00001"${isDisabled} />
            </label>

            <label class="field">
              <span>Provincia</span>
              <input name="province" value="${formValue("province")}" inputmode="numeric" maxlength="2"${isDisabled} />
            </label>
            <label class="field">
              <span>Canton</span>
              <input name="canton" value="${formValue("canton")}" inputmode="numeric" maxlength="2"${isDisabled} />
            </label>
            <label class="field">
              <span>Distrito</span>
              <input name="district" value="${formValue("district")}" inputmode="numeric" maxlength="2"${isDisabled} />
            </label>
            <label class="field">
              <span>Moneda</span>
              <input name="defaultCurrency" value="${formValue("defaultCurrency", "CRC")}" maxlength="3"${isDisabled} />
            </label>
            <label class="field full">
              <span>Direccion exacta</span>
              <textarea name="otherAddress" rows="3"${isDisabled}>${formValue("otherAddress")}</textarea>
            </label>

            <label class="field">
              <span>Usuario ATV</span>
              <input name="apiUsername" value="${formValue("apiUsername")}" autocomplete="off"${isDisabled} />
            </label>
            <label class="field">
              <span>Nueva contrasena ATV</span>
              <input name="apiPassword" type="password" autocomplete="new-password"${isDisabled} />
            </label>
            <label class="hacienda-switch field">
              <input name="clearApiPassword" type="checkbox"${isDisabled} />
              <span>Borrar contrasena ATV guardada</span>
            </label>

            <label class="field">
              <span>Certificado .p12</span>
              <input name="p12File" type="file" accept=".p12,.pfx,application/x-pkcs12"${isDisabled} />
            </label>
            <label class="field">
              <span>PIN certificado</span>
              <input name="p12Pin" type="password" autocomplete="new-password"${isDisabled} />
            </label>
            <label class="field">
              <span>Referencia externa P12</span>
              <input name="p12StorageRef" value="${formValue("p12StorageRef")}" placeholder="Opcional"${isDisabled} />
            </label>
            <label class="hacienda-switch field">
              <input name="clearP12" type="checkbox"${isDisabled} />
              <span>Borrar certificado guardado</span>
            </label>
            <label class="hacienda-switch field">
              <input name="clearP12Pin" type="checkbox"${isDisabled} />
              <span>Borrar PIN guardado</span>
            </label>

            <label class="field">
              <span>Proveedor sistema</span>
              <input name="systemProvider" value="${formValue("systemProvider")}" placeholder="Chic & Co"${isDisabled} />
            </label>
            <label class="field">
              <span>Callback HTTPS</span>
              <input name="callbackUrl" type="url" value="${formValue("callbackUrl")}" placeholder="https://..."${isDisabled} />
            </label>
          </div>

          <div class="hacienda-actions">
            ${config.legacyProviderEnabled ? `<a class="secondary-action" href="${providerPortalUrl}" target="_blank" rel="noopener noreferrer">Abrir proveedor anterior</a>` : ""}
            ${config.canManage ? `<button class="primary-action" type="submit">Guardar configuracion</button>` : ""}
          </div>
        </form>
      </section>
    `;
  }

  function updateStatus(message) {
    lastStatus = message || "";
    const status = document.getElementById("haciendaStatusMessage");
    if (status) status.textContent = lastStatus;
  }

  async function loadHaciendaConfig() {
    renderHaciendaShell(null);
    try {
      const result = await backendRequest(`/hacienda/config?branchId=${encodeURIComponent(activeBranchId())}`, { cache: "no-store" });
      currentConfig = result.config;
      renderHaciendaShell(currentConfig);
    } catch (error) {
      currentConfig = null;
      elements.viewContent.innerHTML = `<div class="empty-state">${safeEscape(error.message || "No se pudo cargar Hacienda.")}</div>`;
    }
  }

  function openHacienda(options = {}) {
    if (!canViewHaciendaLocal()) {
      setButtonState(false);
      if (typeof showToast === "function") showToast("Este usuario no tiene acceso a Hacienda");
      return;
    }
    if (options.push !== false && !isHaciendaRoute()) {
      window.history.pushState({ chicModule: "hacienda" }, "", routePath);
    }
    loadHaciendaConfig();
  }

  function normalizeFormPayload(form) {
    const formData = new FormData(form);
    const payload = {
      branchId: String(formData.get("branchId") || activeBranchId()),
      enabled: Boolean(formData.get("enabled")),
      directSubmissionEnabled: Boolean(formData.get("directSubmissionEnabled")),
      legacyProviderEnabled: Boolean(formData.get("legacyProviderEnabled")),
      environment: String(formData.get("environment") || "Sandbox"),
      submissionMethod: String(formData.get("submissionMethod") || "LegacyProvider"),
      issuerIdType: String(formData.get("issuerIdType") || ""),
      issuerIdNumber: String(formData.get("issuerIdNumber") || ""),
      issuerLegalName: String(formData.get("issuerLegalName") || ""),
      issuerTradeName: String(formData.get("issuerTradeName") || ""),
      economicActivityCode: String(formData.get("economicActivityCode") || ""),
      branchCode: String(formData.get("branchCode") || ""),
      terminalCode: String(formData.get("terminalCode") || ""),
      apiUsername: String(formData.get("apiUsername") || ""),
      apiPassword: String(formData.get("apiPassword") || ""),
      clearApiPassword: Boolean(formData.get("clearApiPassword")),
      issuerEmail: String(formData.get("issuerEmail") || ""),
      province: String(formData.get("province") || ""),
      canton: String(formData.get("canton") || ""),
      district: String(formData.get("district") || ""),
      otherAddress: String(formData.get("otherAddress") || ""),
      defaultCurrency: String(formData.get("defaultCurrency") || "CRC"),
      systemProvider: String(formData.get("systemProvider") || ""),
      p12StorageRef: String(formData.get("p12StorageRef") || ""),
      p12Pin: String(formData.get("p12Pin") || ""),
      clearP12: Boolean(formData.get("clearP12")),
      clearP12Pin: Boolean(formData.get("clearP12Pin")),
      callbackUrl: String(formData.get("callbackUrl") || "")
    };
    return payload;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve("");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("No se pudo leer el certificado."));
      reader.readAsDataURL(file);
    });
  }

  async function handleHaciendaSubmit(form) {
    const payload = normalizeFormPayload(form);
    const file = form.elements.p12File?.files?.[0];
    if (file) payload.p12Base64 = await fileToBase64(file);

    const result = await backendRequest("/hacienda/config", {
      method: "PUT",
      body: JSON.stringify(payload)
    });

    currentConfig = result.config;
    lastStatus = "Configuracion fiscal guardada.";
    renderHaciendaShell(currentConfig);
    if (typeof showToast === "function") showToast("Hacienda actualizado");
  }

  async function runHaciendaTest(kind) {
    const path = kind === "credentials" ? "/hacienda/test-credentials" : "/hacienda/test-certificate";
    const result = await backendRequest(path, {
      method: "POST",
      body: JSON.stringify({ branchId: activeBranchId() })
    });
    const label = kind === "credentials" ? "Usuario ATV" : "Certificado";
    const message = result.ready
      ? `${label}: preparacion local correcta.`
      : `${label}: falta ${Array.isArray(result.missing) && result.missing.length ? result.missing.join(", ") : "configuracion"}.`;
    updateStatus(`${message} ${result.message || ""}`.trim());
    if (typeof showToast === "function") showToast(result.ready ? "Prueba lista" : "Configuracion incompleta");
  }

  function installHaciendaStyles() {
    if (document.getElementById("haciendaModuleStyles")) return;
    const style = document.createElement("style");
    style.id = "haciendaModuleStyles";
    style.textContent = `
      .hacienda-panel {
        display: grid;
        gap: 16px;
      }
      .hacienda-status-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .hacienda-card {
        display: grid;
        align-content: start;
        gap: 8px;
        min-height: 128px;
        padding: 16px;
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(31, 34, 31, 0.08);
        border-radius: 8px;
        box-shadow: 0 12px 32px rgba(25, 28, 24, 0.07);
      }
      .hacienda-card span,
      .hacienda-card small {
        color: rgba(41, 49, 49, 0.62);
        font-size: 12px;
        font-weight: 800;
      }
      .hacienda-card strong {
        color: #252928;
        font-size: 20px;
      }
      .hacienda-badges,
      .hacienda-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .hacienda-badge {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        color: #25302e;
        background: rgba(220, 234, 231, 0.8);
        border-radius: 999px;
        font-size: 12px;
        font-weight: 800;
      }
      .hacienda-badge.is-ok {
        color: #0f453d;
        background: rgba(155, 201, 195, 0.38);
      }
      .hacienda-badge.is-muted {
        color: #6f6251;
        background: rgba(221, 209, 184, 0.42);
      }
      .hacienda-alert {
        padding: 12px 14px;
        color: #26302e;
        background: rgba(255, 255, 255, 0.74);
        border: 1px solid rgba(31, 34, 31, 0.08);
        border-radius: 8px;
        font-size: 13px;
        font-weight: 800;
      }
      .hacienda-form {
        display: grid;
        gap: 16px;
      }
      .hacienda-switch {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .hacienda-switch input {
        width: 18px;
        height: 18px;
        min-height: 18px;
        accent-color: #111514;
      }
      .hacienda-switch span {
        margin: 0;
      }
      .hacienda-actions {
        justify-content: flex-end;
      }
      @media (max-width: 900px) {
        .hacienda-status-row {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function maybeOpenRoute() {
    if (!isHaciendaRoute()) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      setButtonState(false);
      if (document.body.classList.contains("is-authenticated") && canViewHaciendaLocal()) {
        window.clearInterval(timer);
        openHacienda({ push: false });
      }
      if (attempts > 40) window.clearInterval(timer);
    }, 150);
  }

  function wrapShowAppForRoute() {
    if (typeof showApp !== "function" || showApp.__haciendaWrapped) return;
    const originalShowApp = showApp;
    showApp = function wrappedShowApp(...args) {
      const result = originalShowApp.apply(this, args);
      setButtonState(false);
      if (isHaciendaRoute()) {
        window.setTimeout(() => openHacienda({ push: false }), 80);
      }
      return result;
    };
    showApp.__haciendaWrapped = true;
  }

  installHaciendaStyles();
  wrapShowAppForRoute();
  setButtonState(false);
  maybeOpenRoute();

  document.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-hacienda-open]");
    if (openButton) {
      event.preventDefault();
      openHacienda();
      return;
    }

    if (event.target.closest("[data-module]")) {
      setButtonState(false);
      if (isHaciendaRoute()) {
        window.history.pushState({}, "", "/");
      }
      return;
    }

    if (event.target.closest("[data-hacienda-refresh]")) {
      event.preventDefault();
      lastStatus = "";
      loadHaciendaConfig();
      return;
    }

    if (event.target.closest("[data-hacienda-test-credentials]")) {
      event.preventDefault();
      runHaciendaTest("credentials").catch((error) => updateStatus(error.message || "No se pudo probar usuario."));
      return;
    }

    if (event.target.closest("[data-hacienda-test-certificate]")) {
      event.preventDefault();
      runHaciendaTest("certificate").catch((error) => updateStatus(error.message || "No se pudo probar certificado."));
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-hacienda-form]");
    if (!form) return;
    event.preventDefault();
    handleHaciendaSubmit(form).catch((error) => {
      updateStatus(error.message || "No se pudo guardar Hacienda.");
      if (typeof showToast === "function") showToast("No se pudo guardar Hacienda");
    });
  });

  window.addEventListener("popstate", () => {
    if (isHaciendaRoute()) {
      openHacienda({ push: false });
    } else {
      setButtonState(false);
    }
  });
})();
