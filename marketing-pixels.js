// Pixeles de marketing: el admin conecta Meta, Google (GA4) y TikTok para
// medir el recorrido del cliente desde la pagina publica de reservas. Los ids
// no son secretos (viven en la pagina publica), pero se guardan en el servidor
// para conectarlos sin tocar codigo. Mismo patron de menu que "Conectar Alegra".

(function () {
  if (window.__chicMarketingPixels) return;
  window.__chicMarketingPixels = true;

  function isAdmin() {
    const role = typeof currentUser === "function" ? currentUser()?.role : "";
    return role === "super" || role === "admin";
  }

  let modal = null;
  let lastFocus = null;

  function buildModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "pixels-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <section class="pixels-card" role="dialog" aria-modal="true" aria-labelledby="pixelsTitle">
        <form class="pixels-form">
          <div class="pixels-head">
            <div>
              <h2 id="pixelsTitle">Pixeles de marketing</h2>
              <p class="pixels-sub">Mide cuantas visitas al enlace de reservas terminan en cita.</p>
            </div>
            <button class="pixels-close" type="button" data-pixels-cancel aria-label="Cerrar">&times;</button>
          </div>

          <label class="pixels-field">
            <span>Meta Pixel ID <em>(Facebook / Instagram)</em></span>
            <input type="text" data-pixels-meta inputmode="numeric" autocomplete="off" placeholder="Ej: 123456789012345" />
            <small>Solo numeros. Lo encuentras en el Administrador de eventos de Meta.</small>
          </label>

          <label class="pixels-field">
            <span>Google Analytics 4 (Measurement ID)</span>
            <input type="text" data-pixels-ga4 autocomplete="off" placeholder="Ej: G-XXXXXXXXXX" />
            <small>Empieza con G-. Lo da Google Analytics en Administrar &rarr; Flujos de datos.</small>
          </label>

          <label class="pixels-field">
            <span>TikTok Pixel ID</span>
            <input type="text" data-pixels-tiktok autocomplete="off" placeholder="Ej: Cabc123def456ghi789" />
            <small>Lo da TikTok Ads en Activos &rarr; Eventos.</small>
          </label>

          <p class="pixels-hint">Deja una casilla vacia para desconectar ese pixel. Los cambios aplican en el proximo ingreso a la pagina de reservas.</p>
          <p class="pixels-error" role="alert" aria-live="polite" data-pixels-error></p>

          <div class="pixels-actions">
            <button class="secondary-action" type="button" data-pixels-cancel>Cerrar</button>
            <button class="primary-action" type="submit" data-pixels-save>Guardar</button>
          </div>
        </form>
      </section>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-pixels-cancel]")) closeModal();
    });
    modal.querySelector(".pixels-form").addEventListener("submit", save);
    return modal;
  }

  async function openModal() {
    if (typeof backendRequest !== "function") return;
    buildModal();
    const error = modal.querySelector("[data-pixels-error]");
    error.textContent = "";
    try {
      const result = await backendRequest("/tracking/config", { cache: "no-store" });
      const config = result?.config || {};
      modal.querySelector("[data-pixels-meta]").value = config.metaPixelId || "";
      modal.querySelector("[data-pixels-ga4]").value = config.ga4Id || "";
      modal.querySelector("[data-pixels-tiktok]").value = config.tiktokPixelId || "";
    } catch (e) {
      error.textContent = e.message || "No se pudo cargar la configuracion.";
    }
    lastFocus = document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.querySelectorAll(".topbar, .app-shell").forEach((region) => (region.inert = true));
    modal.querySelector("[data-pixels-meta]").focus();
  }

  function closeModal() {
    if (!modal?.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.querySelectorAll(".topbar, .app-shell").forEach((region) => (region.inert = false));
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
    lastFocus = null;
  }

  async function save(event) {
    event.preventDefault();
    const error = modal.querySelector("[data-pixels-error]");
    const button = modal.querySelector("[data-pixels-save]");
    error.textContent = "";
    button.disabled = true;
    button.textContent = "Guardando...";
    try {
      const result = await backendRequest("/tracking/config", {
        method: "PUT",
        body: JSON.stringify({
          metaPixelId: modal.querySelector("[data-pixels-meta]").value.trim(),
          ga4Id: modal.querySelector("[data-pixels-ga4]").value.trim().toUpperCase(),
          tiktokPixelId: modal.querySelector("[data-pixels-tiktok]").value.trim()
        })
      });
      // El servidor normaliza: refleja lo que quedo guardado (un id invalido se
      // ignora y vuelve vacio, para que el usuario lo note).
      const config = result?.config || {};
      modal.querySelector("[data-pixels-meta]").value = config.metaPixelId || "";
      modal.querySelector("[data-pixels-ga4]").value = config.ga4Id || "";
      modal.querySelector("[data-pixels-tiktok]").value = config.tiktokPixelId || "";
      if (typeof showToast === "function") showToast("Pixeles de marketing guardados");
    } catch (e) {
      error.textContent = e.message || "No se pudo guardar.";
    } finally {
      button.disabled = false;
      button.textContent = "Guardar";
    }
  }

  window.openMarketingPixels = openModal;

  function installMenuEntry() {
    if (typeof dropdownOptions !== "function" || dropdownOptions.__chicPixels) return false;
    const original = dropdownOptions;
    const wrapped = function (menuName) {
      const options = original(menuName) || [];
      if (menuName !== "usuario" || !isAdmin()) return options;
      if (options.some((item) => item.pixels)) return options;
      return [...options, { label: "Pixeles de marketing", pixels: true }];
    };
    wrapped.__chicPixels = true;
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
      const item = event.target.closest('[data-menu-label="Pixeles de marketing"]');
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
    .pixels-modal {
      position: fixed; inset: 0; z-index: 60; display: none; place-items: center;
      padding: 20px; background: color-mix(in srgb, var(--ink) 45%, transparent); backdrop-filter: blur(3px);
    }
    .pixels-modal.is-open { display: grid; }
    .pixels-card {
      width: min(440px, 100%); max-height: 90vh; overflow-y: auto;
      background: var(--surface); border: 1px solid var(--line); border-radius: 18px;
      box-shadow: 0 24px 60px -20px color-mix(in srgb, var(--ink) 55%, transparent);
      transform: scale(0.97); opacity: 0;
      transition: transform 0.28s cubic-bezier(0.23,1,0.32,1), opacity 0.28s cubic-bezier(0.23,1,0.32,1);
    }
    .pixels-modal.is-open .pixels-card { transform: scale(1); opacity: 1; }
    .pixels-form { display: flex; flex-direction: column; gap: 14px; padding: 22px; }
    .pixels-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .pixels-head h2 { margin: 0; font-size: 18px; }
    .pixels-sub { margin: 4px 0 0; color: var(--ink-3); font-size: 12.5px; }
    .pixels-close { border: none; background: none; color: var(--ink-3); font-size: 24px; line-height: 1; cursor: pointer; padding: 0 4px; }
    .pixels-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
    .pixels-field > span { color: var(--ink-2); font-weight: 600; }
    .pixels-field em { color: var(--ink-3); font-style: normal; font-weight: 400; }
    .pixels-field input {
      padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px;
      background: var(--surface-2); color: inherit; font-size: 14px;
    }
    .pixels-field input:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .pixels-field small { color: var(--ink-3); font-size: 11.5px; }
    .pixels-hint { margin: 0; color: var(--ink-3); font-size: 12px; }
    .pixels-error { margin: 0; color: var(--crit); font-size: 12.5px; min-height: 1em; }
    .pixels-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .pixels-card button:active { transform: scale(0.97); }
    @media (prefers-reduced-motion: reduce) {
      .pixels-card { transition: none; }
      .pixels-card button:active { transform: none; }
    }
  `;
  document.head.appendChild(style);
})();
