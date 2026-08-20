// Envio de facturas a Alegra desde el modulo de Facturacion.
//
// El adaptador vive en el servidor (backend/alegra.js). Aqui solo se dispara el
// envio de una factura por su boton y se refleja el resultado. Si Alegra no
// esta configurado, el servidor responde con un mensaje claro y se muestra.

(function () {
  if (window.__chicBillingAlegra) return;
  window.__chicBillingAlegra = true;

  let integrations = null;

  async function loadIntegrations() {
    if (integrations || typeof backendRequest !== "function") return integrations;
    try {
      const result = await backendRequest("/integrations", { cache: "no-store" });
      integrations = result?.integrations || {};
    } catch (error) {
      integrations = {};
    }
    return integrations;
  }

  async function sendInvoice(invoiceId, button) {
    if (typeof backendRequest !== "function") return;

    const info = await loadIntegrations();
    if (info && info.alegra && info.alegra.configured === false) {
      if (typeof showToast === "function") {
        showToast("Alegra no esta configurado todavia. Falta poner las credenciales.");
      }
      return;
    }

    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Enviando...";

    try {
      const result = await backendRequest(`/invoices/${encodeURIComponent(invoiceId)}/alegra`, {
        method: "POST",
        body: JSON.stringify({ branchId: state?.currentBranchId || "" })
      });
      // El servidor guardo el resultado en la factura; se refresca el estado
      // para que la celda muestre el numero de Alegra.
      if (typeof refreshStateFromBackend === "function") await refreshStateFromBackend({ render: true });
      if (typeof showToast === "function") {
        showToast(result?.alegra?.number ? `Enviada a Alegra: ${result.alegra.number}` : "Factura enviada a Alegra");
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      if (typeof showToast === "function") showToast(error.message || "No se pudo enviar a Alegra");
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-alegra-send]");
    if (!button) return;
    event.preventDefault();
    sendInvoice(button.dataset.alegraSend, button);
  });

  /* ===================================================================
     Conectar Alegra desde la app (solo administradores)
     -------------------------------------------------------------------
     El token nunca vive en el navegador: se envia al guardar y el servidor
     solo devuelve si hay token y una pista. Asi el negocio conecta Alegra
     sin tocar variables de entorno ni redeployar, y puede probar la conexion
     antes de facturar de verdad.
     =================================================================== */

  function isAdmin() {
    const role = typeof currentUser === "function" ? currentUser()?.role : "";
    return role === "super" || role === "admin";
  }

  let modal = null;
  let lastFocus = null;

  function buildModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "alegra-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <section class="alegra-card" role="dialog" aria-modal="true" aria-labelledby="alegraTitle">
        <form class="alegra-form">
          <div class="alegra-head">
            <div>
              <h2 id="alegraTitle">Conectar Alegra</h2>
              <p class="alegra-sub">Facturacion electronica. Alegra habla con Hacienda por vos.</p>
            </div>
            <button class="alegra-close" type="button" data-alegra-cancel aria-label="Cerrar">&times;</button>
          </div>

          <div class="alegra-status" data-alegra-status hidden></div>

          <label class="alegra-field">
            <span>Correo de la cuenta de Alegra</span>
            <input type="email" data-alegra-email autocomplete="off" placeholder="cuenta@negocio.com" />
          </label>

          <label class="alegra-field">
            <span>Token de API <em>(Configuracion &rarr; API en Alegra)</em></span>
            <input type="password" data-alegra-token autocomplete="off" placeholder="Pega el token aqui" />
            <small data-alegra-tokenhint></small>
          </label>

          <label class="alegra-field">
            <span>Id del impuesto IVA <em>(opcional)</em></span>
            <input type="text" data-alegra-taxid inputmode="numeric" placeholder="Solo si tu cuenta lo pide" />
          </label>

          <details class="alegra-advanced">
            <summary>Avanzado</summary>
            <label class="alegra-field">
              <span>Endpoint de la API</span>
              <input type="url" data-alegra-endpoint placeholder="https://api.alegra.com/api/v1" />
            </label>
          </details>

          <p class="alegra-error" role="alert" aria-live="polite" data-alegra-error></p>

          <div class="alegra-actions">
            <button class="secondary-action" type="button" data-alegra-test>Probar conexion</button>
            <span class="alegra-actions-spacer"></span>
            <button class="secondary-action" type="button" data-alegra-cancel>Cerrar</button>
            <button class="primary-action" type="submit" data-alegra-save>Guardar</button>
          </div>
        </form>
      </section>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-alegra-cancel]")) {
        closeModal();
      }
      if (event.target.closest("[data-alegra-test]")) testCurrent();
    });
    modal.querySelector(".alegra-form").addEventListener("submit", save);
    return modal;
  }

  function setStatus(config) {
    const box = modal.querySelector("[data-alegra-status]");
    if (!config) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.className = `alegra-status ${config.configured ? "is-ok" : "is-off"}`;
    box.textContent = config.configured
      ? "Conectado. Ya puedes enviar facturas a Alegra."
      : "Sin conectar. Pon el correo y el token para empezar.";
  }

  async function loadConfig() {
    const result = await backendRequest("/alegra/config", { cache: "no-store" });
    return result?.config || {};
  }

  async function openModal() {
    if (typeof backendRequest !== "function") return;
    buildModal();
    const error = modal.querySelector("[data-alegra-error]");
    error.textContent = "";
    try {
      const config = await loadConfig();
      modal.querySelector("[data-alegra-email]").value = config.email || "";
      modal.querySelector("[data-alegra-token]").value = "";
      modal.querySelector("[data-alegra-taxid]").value = config.taxId || "";
      modal.querySelector("[data-alegra-endpoint]").value = config.endpoint || "";
      const hint = modal.querySelector("[data-alegra-tokenhint]");
      hint.textContent = config.hasToken ? `Ya hay un token guardado (${config.tokenHint}). Dejalo vacio para conservarlo.` : "";
      setStatus(config);
    } catch (e) {
      error.textContent = e.message || "No se pudo cargar la configuracion.";
    }
    lastFocus = document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.querySelectorAll(".topbar, .app-shell").forEach((region) => (region.inert = true));
    modal.querySelector("[data-alegra-email]").focus();
  }

  function closeModal() {
    if (!modal?.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.querySelectorAll(".topbar, .app-shell").forEach((region) => (region.inert = false));
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
    lastFocus = null;
  }

  function readForm() {
    return {
      email: modal.querySelector("[data-alegra-email]").value.trim(),
      token: modal.querySelector("[data-alegra-token]").value.trim(),
      taxId: modal.querySelector("[data-alegra-taxid]").value.trim(),
      endpoint: modal.querySelector("[data-alegra-endpoint]").value.trim()
    };
  }

  async function save(event) {
    event.preventDefault();
    const error = modal.querySelector("[data-alegra-error]");
    const button = modal.querySelector("[data-alegra-save]");
    error.textContent = "";
    button.disabled = true;
    button.textContent = "Guardando...";
    try {
      const result = await backendRequest("/alegra/config", { method: "PUT", body: JSON.stringify(readForm()) });
      integrations = null; // se recalcula la proxima vez que se envie
      setStatus(result?.config);
      const hint = modal.querySelector("[data-alegra-tokenhint]");
      hint.textContent = result?.config?.hasToken
        ? `Ya hay un token guardado (${result.config.tokenHint}). Dejalo vacio para conservarlo.`
        : "";
      modal.querySelector("[data-alegra-token]").value = "";
      if (typeof showToast === "function") showToast("Conexion con Alegra guardada");
    } catch (e) {
      error.textContent = e.message || "No se pudo guardar.";
    } finally {
      button.disabled = false;
      button.textContent = "Guardar";
    }
  }

  async function testCurrent() {
    const error = modal.querySelector("[data-alegra-error]");
    const button = modal.querySelector("[data-alegra-test]");
    error.textContent = "";
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Probando...";
    try {
      // Si el usuario escribio credenciales nuevas, se guardan primero para
      // probarlas; si no toco nada, se prueban las ya guardadas.
      const form = readForm();
      if (form.email && form.token) {
        await backendRequest("/alegra/config", { method: "PUT", body: JSON.stringify(form) });
        modal.querySelector("[data-alegra-token]").value = "";
      }
      const result = await backendRequest("/alegra/test", { method: "POST", body: "{}" });
      const box = modal.querySelector("[data-alegra-status]");
      box.hidden = false;
      box.className = "alegra-status is-ok";
      box.textContent = result?.result?.name
        ? `Conecta con Alegra: ${result.result.name}`
        : "Conecta con Alegra correctamente.";
    } catch (e) {
      const box = modal.querySelector("[data-alegra-status]");
      box.hidden = false;
      box.className = "alegra-status is-off";
      box.textContent = e.message || "No conecta con Alegra. Revisa el correo y el token.";
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  window.openAlegraSettings = openModal;

  // Entrada "Conectar Alegra" en el menu del usuario, solo para administradores.
  function installMenuEntry() {
    if (typeof dropdownOptions !== "function" || dropdownOptions.__chicAlegra) return false;
    const original = dropdownOptions;
    const wrapped = function (menuName) {
      const options = original(menuName) || [];
      if (menuName !== "usuario" || !isAdmin()) return options;
      if (options.some((item) => item.alegra)) return options;
      return [...options, { label: "Conectar Alegra", alegra: true }];
    };
    wrapped.__chicAlegra = true;
    dropdownOptions = wrapped;
    return true;
  }
  if (!installMenuEntry()) {
    const timer = window.setInterval(() => {
      if (installMenuEntry()) window.clearInterval(timer);
    }, 100);
    window.setTimeout(() => window.clearInterval(timer), 5000);
  }

  document.addEventListener(
    "click",
    (event) => {
      const item = event.target.closest('[data-menu-label="Conectar Alegra"]');
      if (!item) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof closeDropdown === "function") closeDropdown();
      openModal();
    },
    true
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal?.classList.contains("is-open")) {
      event.preventDefault();
      closeModal();
    }
  });

  const style = document.createElement("style");
  style.textContent = `
    .alegra-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 600;
      text-decoration: none;
    }
    .alegra-badge.is-sent { color: var(--ok); background: var(--ok-soft); }
    a.alegra-badge.is-sent:hover { text-decoration: underline; }
    .alegra-send.is-retry { color: var(--crit); border-color: var(--crit-soft); }
    .alegra-note { display: block; margin-top: 3px; color: var(--ink-3); font-size: 11px; }

    .alegra-modal {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: none;
      place-items: center;
      padding: 20px;
      background: color-mix(in srgb, var(--ink) 45%, transparent);
      backdrop-filter: blur(3px);
    }
    .alegra-modal.is-open { display: grid; }
    .alegra-card {
      width: min(440px, 100%);
      max-height: 90vh;
      overflow-y: auto;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: 0 24px 60px -20px color-mix(in srgb, var(--ink) 55%, transparent);
      transform: scale(0.97);
      opacity: 0;
      transition: transform 0.28s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.28s cubic-bezier(0.23, 1, 0.32, 1);
    }
    .alegra-modal.is-open .alegra-card { transform: scale(1); opacity: 1; }
    .alegra-form { display: flex; flex-direction: column; gap: 14px; padding: 22px; }
    .alegra-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .alegra-head h2 { margin: 0; font-size: 18px; }
    .alegra-sub { margin: 4px 0 0; color: var(--ink-3); font-size: 12.5px; }
    .alegra-close {
      border: none; background: none; color: var(--ink-3);
      font-size: 24px; line-height: 1; cursor: pointer; padding: 0 4px;
    }
    .alegra-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
    .alegra-field > span { color: var(--ink-2); font-weight: 600; }
    .alegra-field em { color: var(--ink-3); font-style: normal; font-weight: 400; }
    .alegra-field input {
      padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px;
      background: var(--surface-2); color: inherit; font-size: 14px;
    }
    .alegra-field input:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .alegra-field small { color: var(--ink-3); font-size: 11.5px; }
    .alegra-advanced summary { cursor: pointer; color: var(--ink-3); font-size: 12.5px; }
    .alegra-advanced .alegra-field { margin-top: 10px; }
    .alegra-status { padding: 10px 12px; border-radius: 10px; font-size: 12.5px; font-weight: 600; }
    .alegra-status.is-ok { color: var(--ok); background: var(--ok-soft); }
    .alegra-status.is-off { color: var(--ink-2); background: var(--surface-2); }
    .alegra-error { margin: 0; color: var(--crit); font-size: 12.5px; min-height: 1em; }
    .alegra-actions { display: flex; align-items: center; gap: 8px; }
    .alegra-actions-spacer { flex: 1; }
    .alegra-card button:active { transform: scale(0.97); }
    @media (prefers-reduced-motion: reduce) {
      .alegra-card { transition: none; }
      .alegra-card button:active { transform: none; }
    }
  `;
  document.head.appendChild(style);
})();
