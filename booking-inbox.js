// Bandeja de solicitudes que llegan desde el enlace publico.
//
// Vive dentro del modulo de Citas, no como modulo nuevo. Dos razones: es donde
// recepcion ya trabaja -nadie va a revisar una pestana aparte cada media hora-
// y anadir un modulo obligaria a tocar los permisos de todos los roles, que es
// justo la clase de cambio que rompe cosas en silencio.

(function () {
  if (window.__chicBookingInbox || typeof viewRenderers === "undefined") return;
  window.__chicBookingInbox = true;

  let requests = [];
  let loading = false;
  let loadedOnce = false;

  function canManage() {
    if (typeof canWrite !== "function") return false;
    return canWrite("citas");
  }

  async function loadRequests({ silent = false } = {}) {
    if (loading || typeof backendRequest !== "function") return;
    loading = true;
    try {
      const branchId = state?.currentBranchId || "";
      const result = await backendRequest(`/bookings?status=pending&branchId=${encodeURIComponent(branchId)}`, {
        cache: "no-store"
      });
      requests = Array.isArray(result.requests) ? result.requests : [];
      loadedOnce = true;
      if (typeof renderView === "function" && currentModule === "citas") renderView();
    } catch (error) {
      if (!silent && typeof showToast === "function") {
        showToast("No se pudieron cargar las solicitudes en linea");
      }
    } finally {
      loading = false;
    }
  }

  function longDate(dateISO) {
    if (typeof weekdayNames === "undefined" || typeof monthNames === "undefined") return dateISO;
    const date = new Date(`${dateISO}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateISO;
    return `${weekdayNames[date.getDay()]} ${date.getDate()} de ${monthNames[date.getMonth()].toLowerCase()}`;
  }

  function waitedLabel(createdAt) {
    const minutes = Math.max(0, Math.round((Date.now() - Date.parse(createdAt)) / 60000));
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${Math.round(hours / 24)} d`;
  }

  // Una solicitud que lleva mas de seis horas esperando se marca: la clienta
  // ya se esta preguntando si alguien la leyo.
  function isStale(createdAt) {
    return Date.now() - Date.parse(createdAt) > 6 * 60 * 60 * 1000;
  }

  function renderInbox() {
    if (!requests.length) return "";

    const specialists =
      typeof currentBranchSpecialists === "function"
        ? currentBranchSpecialists()
        : typeof procedureSpecialists !== "undefined"
        ? procedureSpecialists
        : [];

    const cards = requests
      .map((request) => {
        const options = specialists
          .map((specialist) => `<option value="${escapeHtml(specialist.name)}">${escapeHtml(specialist.name)}</option>`)
          .join("");

        return `
          <article class="request-card${isStale(request.createdAt) ? " is-stale" : ""}">
            <div class="request-main">
              <div class="request-who">
                <strong>${escapeHtml(request.clientName)}</strong>
                <span>${escapeHtml(request.procedureName)}</span>
              </div>
              <div class="request-when">
                <strong>${escapeHtml(longDate(request.date))}</strong>
                <span>${escapeHtml(request.time)} · ${escapeHtml(request.duration)} min</span>
              </div>
              <div class="request-contact">
                <a href="${escapeHtml(request.whatsappUrl)}" target="_blank" rel="noopener noreferrer" class="request-whatsapp">
                  WhatsApp +${escapeHtml(request.clientPhone)}
                </a>
                <a href="mailto:${escapeHtml(request.clientEmail)}">${escapeHtml(request.clientEmail)}</a>
              </div>
              <span class="request-age">${escapeHtml(waitedLabel(request.createdAt))}</span>
            </div>

            ${request.notes ? `<p class="request-note">${escapeHtml(request.notes)}</p>` : ""}

            <div class="request-actions">
              <label class="request-assign">
                <span>Atiende</span>
                <select data-request-specialist="${escapeHtml(request.id)}">${options}</select>
              </label>
              <button class="row-action" type="button" data-request-confirm="${escapeHtml(request.id)}">Confirmar cita</button>
              <button class="row-action is-warning" type="button" data-request-reject="${escapeHtml(request.id)}">Rechazar</button>
            </div>
          </article>
        `;
      })
      .join("");

    return `
      <section class="request-inbox" aria-label="Solicitudes en linea">
        <header class="request-inbox-head">
          <div>
            <strong>Solicitudes desde la web</strong>
            <span>Apartan el horario, pero no son citas hasta que las confirme.</span>
          </div>
          <span class="request-count">${escapeHtml(requests.length)}</span>
        </header>
        <div class="request-list">${cards}</div>
      </section>
    `;
  }

  // Se antepone la bandeja a lo que ya dibuja el modulo de Citas.
  const originalCitas = viewRenderers.citas;
  viewRenderers.citas = function (search) {
    const rendered = originalCitas.call(this, search);
    if (!canManage()) return rendered;

    if (!loadedOnce && !loading) loadRequests({ silent: true });
    const inbox = renderInbox();
    if (!inbox) return rendered;

    // Entra justo despues del titulo del panel de registros, encima de la
    // agenda: es lo primero que hay que atender al abrir el modulo.
    return rendered.replace(/(<section class="records-panel">\s*<h3>[^<]*<\/h3>)/, `$1${inbox}`);
  };

  async function pullFreshState(attempts = 4) {
    if (typeof refreshStateFromBackend !== "function") return false;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (await refreshStateFromBackend({ render: true })) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
    return false;
  }

  async function resolveRequest(requestId, action, body) {
    if (typeof backendRequest !== "function") return;
    const card = document.querySelector(`[data-request-confirm="${requestId}"]`)?.closest(".request-card");
    card?.classList.add("is-working");

    try {
      await backendRequest(`/bookings/${encodeURIComponent(requestId)}/${action}`, {
        method: "POST",
        body: JSON.stringify(body || {})
      });
      requests = requests.filter((request) => request.id !== requestId);

      if (action === "confirm") {
        // La cita y la ficha de la clienta las creo el servidor dentro del
        // estado. Hay que traerlo de vuelta o la agenda seguiria sin mostrarlas.
        // refreshStateFromBackend se rinde si hay un guardado en vuelo, asi que
        // se reintenta: sin esto la pantalla se queda vieja justo cuando la
        // persona acaba de actuar, que es cuando mas mira.
        await pullFreshState();
        showToast("Cita confirmada y avisada por correo");
      } else {
        showToast("Solicitud rechazada");
      }

      if (typeof renderView === "function") renderView();
    } catch (error) {
      card?.classList.remove("is-working");
      showToast(error.message || "No se pudo procesar la solicitud");
      // Si otra persona la resolvio primero, la lista local esta vieja.
      if (error.status === 409) loadRequests({ silent: true });
    }
  }

  document.addEventListener("click", (event) => {
    const confirmButton = event.target.closest("[data-request-confirm]");
    if (confirmButton) {
      event.preventDefault();
      const requestId = confirmButton.dataset.requestConfirm;
      const specialist = document.querySelector(`[data-request-specialist="${requestId}"]`)?.value || "";
      if (!specialist) {
        showToast("Elija quien atendera la cita");
        return;
      }
      resolveRequest(requestId, "confirm", { specialist });
      return;
    }

    const rejectButton = event.target.closest("[data-request-reject]");
    if (rejectButton) {
      event.preventDefault();
      const requestId = rejectButton.dataset.requestReject;
      const reason = window.prompt("Motivo (se le envia a la clienta, opcional):", "");
      // `prompt` devuelve null si cancelan; "" es un motivo vacio valido.
      if (reason === null) return;
      resolveRequest(requestId, "reject", { reason });
    }
  });

  // Cuando llega una solicitud nueva, el servidor emite el mismo evento de
  // tiempo real que ya usa la aplicacion para sincronizarse entre navegadores.
  // Ese evento termina llamando a refreshStateFromBackend, asi que basta con
  // envolverla: es el patron de capas que usa todo el proyecto y evita
  // inventar un canal nuevo que habria que mantener aparte.
  if (typeof refreshStateFromBackend === "function") {
    const originalRefresh = refreshStateFromBackend;
    refreshStateFromBackend = async function (...args) {
      const result = await originalRefresh.apply(this, args);
      if (canManage()) loadRequests({ silent: true });
      return result;
    };
  }

  // Y una revision periodica, por si el flujo de eventos se cayo sin avisar.
  window.setInterval(() => {
    if (document.visibilityState === "visible" && canManage()) loadRequests({ silent: true });
  }, 3 * 60 * 1000);

  const style = document.createElement("style");
  style.textContent = `
    .request-inbox {
      display: grid;
      gap: 10px;
      margin-bottom: 14px;
      padding: 14px;
      background: var(--accent-soft);
      border: 1px solid var(--line);
      border-radius: var(--radius);
    }

    .request-inbox-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .request-inbox-head strong {
      display: block;
      color: var(--ink);
      font-size: 14px;
      font-weight: 600;
    }

    .request-inbox-head span {
      color: var(--ink-2);
      font-size: 12.5px;
    }

    .request-count {
      display: grid;
      place-items: center;
      min-width: 26px;
      height: 26px;
      padding: 0 8px;
      color: var(--on-brand);
      background: var(--brand);
      border-radius: 13px;
      font-size: 13px;
      font-weight: 700;
    }

    .request-list {
      display: grid;
      gap: 8px;
    }

    .request-card {
      display: grid;
      gap: 9px;
      padding: 12px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      transition: opacity 160ms ease;
    }

    .request-card.is-stale {
      border-left: 3px solid var(--warn);
    }

    .request-card.is-working {
      opacity: 0.5;
      pointer-events: none;
    }

    .request-main {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.3fr) auto;
      gap: 12px;
      align-items: start;
    }

    .request-who,
    .request-when,
    .request-contact {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .request-who strong,
    .request-when strong {
      color: var(--ink);
      font-size: 13.5px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .request-who span,
    .request-when span {
      color: var(--ink-3);
      font-size: 12.5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .request-contact a {
      color: var(--accent);
      font-size: 12.5px;
      overflow: hidden;
      text-decoration: none;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .request-contact a:hover {
      text-decoration: underline;
    }

    .request-whatsapp {
      font-weight: 600;
    }

    .request-age {
      color: var(--ink-3);
      font-size: 11.5px;
      white-space: nowrap;
    }

    .request-note {
      margin: 0;
      padding: 8px 10px;
      color: var(--ink-2);
      background: var(--surface-2);
      border-radius: var(--radius-sm);
      font-size: 12.5px;
    }

    .request-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      justify-content: flex-end;
      gap: 8px;
    }

    .request-assign {
      display: grid;
      gap: 3px;
      margin-right: auto;
      min-width: 0;
    }

    .request-assign span {
      color: var(--ink-3);
      font-size: 11.5px;
      font-weight: 600;
    }

    .request-assign select {
      max-width: 220px;
      padding: 6px 8px;
      color: var(--ink);
      background: var(--surface);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-sm);
      font-size: 12.5px;
    }

    @media (max-width: 860px) {
      .request-main {
        grid-template-columns: 1fr;
      }

      .request-age {
        justify-self: start;
      }

      .request-assign {
        margin-right: 0;
        width: 100%;
      }

      .request-assign select {
        max-width: none;
      }
    }
  `;
  document.head.appendChild(style);
})();
