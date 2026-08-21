// Modulo "Integraciones" (solo admin): un hogar para conectar las aplicaciones
// que usa el negocio. Hoy: facturacion (Alegra), marketing (Meta/GA4/TikTok) y
// correo (Resend). Cada tarjeta muestra si esta conectada y abre su
// configuracion. Deja lugar para futuras integraciones.

(function () {
  if (window.__chicIntegrations || typeof viewRenderers === "undefined") return;
  window.__chicIntegrations = true;

  let status = { alegra: null, correo: null, pixeles: null };

  function badge(state, action) {
    if (state === true) return `<span class="intg-badge is-on">Conectado</span>`;
    if (state === false) return `<span class="intg-badge is-off">Sin conectar</span>`;
    // Sin estado booleano: si la tarjeta se configura, aun estamos verificando;
    // si es una integracion futura, no lleva insignia de estado.
    return action ? `<span class="intg-badge is-wait">Verificando...</span>` : "";
  }

  function card({ key, name, icon, desc, state, action, actionLabel, hint }) {
    return `
      <article class="intg-card">
        <div class="intg-card-top">
          <span class="intg-icon" aria-hidden="true">${icon}</span>
          ${badge(state, action)}
        </div>
        <h3>${escapeHtml(name)}</h3>
        <p class="intg-desc">${escapeHtml(desc)}</p>
        ${hint ? `<p class="intg-hint">${escapeHtml(hint)}</p>` : ""}
        ${
          action
            ? `<button class="secondary-action intg-btn" type="button" data-integration="${key}">${escapeHtml(actionLabel)}</button>`
            : `<span class="intg-soon">Proximamente</span>`
        }
      </article>
    `;
  }

  function renderCards() {
    const cards = [
      card({
        key: "alegra",
        name: "Alegra",
        icon: "🧾",
        desc: "Facturacion electronica: Alegra emite las facturas por vos.",
        state: status.alegra,
        action: "alegra",
        actionLabel: "Configurar"
      }),
      card({
        key: "pixeles",
        name: "Pixeles de marketing",
        icon: "📈",
        desc: "Meta, Google Analytics y TikTok. Mide cuantas visitas al enlace de reservas terminan en cita.",
        state: status.pixeles,
        action: "pixeles",
        actionLabel: "Configurar"
      }),
      card({
        key: "correo",
        name: "Correo (Resend)",
        icon: "✉️",
        desc: "Confirmaciones a las clientas, avisos al equipo y el reporte de cierre diario.",
        state: status.correo,
        hint: status.correo === false ? "Se configura en Render con RESEND_API_KEY y RESEND_FROM." : ""
      }),
      card({
        key: "whatsapp",
        name: "WhatsApp",
        icon: "💬",
        desc: "Hoy cada aviso trae un enlace de WhatsApp listo para escribirle a la clienta.",
        state: null,
        hint: "El enlace directo ya funciona; la API oficial queda para despues."
      }),
      card({
        key: "calendar",
        name: "Google Calendar",
        icon: "📅",
        desc: "Sincronizar las citas con el calendario del equipo.",
        state: null
      })
    ];
    return `
      <section class="intg">
        <div class="intg-head">
          <h2>Integraciones</h2>
          <p>Conecta las apps que trabajan con Chic &amp; Co. Solo lo ve la administracion.</p>
        </div>
        <div class="intg-grid">${cards.join("")}</div>
      </section>
    `;
  }

  viewRenderers.integraciones = renderCards;

  async function refreshStatus() {
    if (typeof backendRequest !== "function") return;
    try {
      const [integrations, tracking] = await Promise.all([
        backendRequest("/integrations", { cache: "no-store" }).catch(() => null),
        backendRequest("/tracking/config", { cache: "no-store" }).catch(() => null)
      ]);
      status.alegra = integrations?.integrations?.alegra?.configured ?? false;
      status.correo = integrations?.integrations?.correo?.configured ?? false;
      const t = tracking?.config || {};
      status.pixeles = Boolean(t.metaPixelId || t.ga4Id || t.tiktokPixelId);
    } catch (error) {
      /* si falla, las tarjetas quedan en "sin conectar" */
    }
    if (typeof currentModule !== "undefined" && currentModule === "integraciones") {
      const host = elements?.viewContent;
      if (host) host.innerHTML = renderCards();
    }
  }

  // Al entrar al modulo, refrescar el estado real de cada integracion.
  const originalRenderView = renderView;
  renderView = function (...args) {
    const result = originalRenderView.apply(this, args);
    if (typeof currentModule !== "undefined" && currentModule === "integraciones") refreshStatus();
    return result;
  };

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-integration]");
    if (!button) return;
    event.preventDefault();
    const which = button.dataset.integration;
    if (which === "alegra" && typeof window.openAlegraSettings === "function") window.openAlegraSettings();
    else if (which === "pixeles" && typeof window.openMarketingPixels === "function") window.openMarketingPixels();
  });

  const style = document.createElement("style");
  style.textContent = `
    .intg-head h2 { margin: 0 0 2px; font-size: 18px; }
    .intg-head p { margin: 0 0 18px; color: var(--ink-3); font-size: 13px; }
    .intg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    .intg-card { display: flex; flex-direction: column; gap: 8px; padding: 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-1); }
    .intg-card-top { display: flex; align-items: center; justify-content: space-between; }
    .intg-icon { font-size: 24px; line-height: 1; }
    .intg-card h3 { margin: 2px 0 0; font-size: 15px; }
    .intg-desc { margin: 0; color: var(--ink-2); font-size: 12.5px; line-height: 1.45; }
    .intg-hint { margin: 0; color: var(--ink-3); font-size: 11.5px; }
    .intg-badge { font-size: 10.5px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; padding: 3px 9px; border-radius: 999px; }
    .intg-badge.is-on { color: var(--ok); background: var(--ok-soft); }
    .intg-badge.is-off { color: var(--ink-2); background: var(--surface-2); }
    .intg-badge.is-wait { color: var(--ink-3); background: var(--surface-2); }
    .intg-btn { margin-top: 4px; align-self: flex-start; }
    .intg-soon { margin-top: 4px; font-size: 11.5px; color: var(--ink-3); font-style: italic; }
  `;
  document.head.appendChild(style);
})();
