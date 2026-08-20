// Agenda publica de Chic & Co.
//
// Sin framework y sin dependencias, igual que el resto del proyecto. La pagina
// la abre gente desde el telefono con datos moviles: cada kilobyte que no se
// descarga es medio segundo que no espera.
//
// La validacion que hay aqui es comodidad, no seguridad. El servidor revalida
// absolutamente todo -correo, telefono, horario libre, ventana de reserva-
// porque cualquiera puede llamar al endpoint sin pasar por este formulario.

(() => {
  "use strict";

  const elements = {
    form: document.getElementById("bookingForm"),
    branch: document.getElementById("branchSelect"),
    procedure: document.getElementById("procedureSelect"),
    serviceDetail: document.getElementById("serviceDetail"),
    date: document.getElementById("dateInput"),
    dayHint: document.getElementById("dayHint"),
    slots: document.getElementById("slots"),
    slotsEmpty: document.getElementById("slotsEmpty"),
    name: document.getElementById("nameInput"),
    phone: document.getElementById("phoneInput"),
    email: document.getElementById("emailInput"),
    notes: document.getElementById("notesInput"),
    website: document.getElementById("websiteInput"),
    summary: document.getElementById("summary"),
    error: document.getElementById("formError"),
    submit: document.getElementById("submitButton"),
    submitLabel: document.getElementById("submitLabel"),
    done: document.getElementById("done"),
    doneDetail: document.getElementById("doneDetail"),
    again: document.getElementById("againButton"),
    steps: document.querySelectorAll(".step")
  };

  let config = null;
  let selectedTime = "";
  let sending = false;
  // Cada peticion de disponibilidad lleva numero. Si alguien cambia de fecha
  // mientras la anterior sigue en vuelo, la respuesta vieja llega despues y
  // pintaria los horarios del dia equivocado.
  let availabilityToken = 0;

  const monthNames = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"
  ];
  const weekdayNames = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

  function longDate(dateISO) {
    const date = new Date(`${dateISO}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateISO;
    return `${weekdayNames[date.getDay()]} ${date.getDate()} de ${monthNames[date.getMonth()]}`;
  }

  function money(value) {
    return `CRC ${Number(value || 0).toLocaleString("es-CR")}`;
  }

  function addDays(dateISO, amount) {
    const date = new Date(`${dateISO}T00:00:00`);
    date.setDate(date.getDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  async function api(path, options) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(payload.message || "No se pudo completar la accion."), {
        status: response.status
      });
    }
    return payload;
  }

  function currentBranch() {
    return config?.branches.find((branch) => branch.id === elements.branch.value) || null;
  }

  function currentProcedure() {
    return currentBranch()?.procedures.find((procedure) => procedure.id === elements.procedure.value) || null;
  }

  /* --- Pasos ----------------------------------------------------------- */

  function refreshSteps() {
    const done = [
      Boolean(elements.procedure.value),
      Boolean(elements.date.value),
      Boolean(selectedTime),
      Boolean(elements.name.value.trim() && elements.phone.value.trim() && elements.email.value.trim())
    ];

    elements.steps.forEach((step, index) => {
      step.classList.toggle("is-done", done[index]);
      // Se activa el paso si ya se completo o si es el siguiente por hacer:
      // el resto queda atenuado, visible pero claramente aun no.
      const reachable = index === 0 || done.slice(0, index).every(Boolean);
      step.classList.toggle("is-active", reachable);
    });

    refreshSummary(done);
  }

  function refreshSummary(done) {
    const ready = done.every(Boolean);
    const procedure = currentProcedure();

    if (done[0] && done[1] && done[2] && procedure) {
      elements.summary.hidden = false;
      elements.summary.innerHTML = `
        <strong>${escapeHtml(procedure.name)}</strong>
        <span>${escapeHtml(longDate(elements.date.value))} a las ${escapeHtml(selectedTime)}</span>
        <span>${escapeHtml(currentBranch()?.label || "")}</span>
      `;
    } else {
      elements.summary.hidden = true;
    }

    elements.submit.disabled = !ready || sending;
    if (sending) elements.submitLabel.textContent = "Enviando...";
    else if (ready) elements.submitLabel.textContent = "Solicitar esta cita";
    else if (!done[0]) elements.submitLabel.textContent = "Elige un servicio";
    else if (!done[1]) elements.submitLabel.textContent = "Elige una fecha";
    else if (!done[2]) elements.submitLabel.textContent = "Elige una hora";
    else elements.submitLabel.textContent = "Completa tus datos";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  /* --- Carga inicial --------------------------------------------------- */

  function fillBranches() {
    elements.branch.innerHTML = config.branches
      .map((branch) => `<option value="${escapeHtml(branch.id)}">${escapeHtml(branch.label)}</option>`)
      .join("");
    fillProcedures();
  }

  function fillProcedures() {
    const branch = currentBranch();
    const procedures = branch?.procedures || [];

    if (!procedures.length) {
      elements.procedure.innerHTML = `<option value="">Sin servicios disponibles</option>`;
      elements.serviceDetail.textContent = "Esta sucursal aun no tiene servicios habilitados en linea.";
      return;
    }

    elements.procedure.innerHTML = [
      `<option value="">Elige un servicio</option>`,
      ...procedures.map(
        (procedure) => `<option value="${escapeHtml(procedure.id)}">${escapeHtml(procedure.name)}</option>`
      )
    ].join("");
    elements.serviceDetail.textContent = "";
  }

  function showServiceDetail() {
    const procedure = currentProcedure();
    if (!procedure) {
      elements.serviceDetail.textContent = "";
      return;
    }
    const parts = [`Dura ${procedure.duration} minutos`];
    if (procedure.price > 0) parts.push(money(procedure.price));
    elements.serviceDetail.textContent = parts.join(" · ");
  }

  function configureDateInput() {
    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);
    elements.date.min = todayISO;
    elements.date.max = addDays(todayISO, config.maxHorizonDays || 60);
  }

  /* --- Disponibilidad -------------------------------------------------- */

  async function loadSlots() {
    selectedTime = "";
    elements.slots.innerHTML = "";

    const procedure = currentProcedure();
    if (!procedure || !elements.date.value) {
      elements.slotsEmpty.textContent = "Elige primero un servicio y una fecha.";
      refreshSteps();
      return;
    }

    const weekday = new Date(`${elements.date.value}T00:00:00`).getDay();
    if ((config.closedWeekdays || []).includes(weekday)) {
      elements.dayHint.textContent = "Ese dia el salon no abre. Elige otro.";
      elements.dayHint.classList.add("is-blocked");
      elements.slotsEmpty.textContent = "";
      refreshSteps();
      return;
    }
    elements.dayHint.textContent = "";
    elements.dayHint.classList.remove("is-blocked");

    const token = ++availabilityToken;
    elements.slotsEmpty.textContent = "Buscando horarios...";

    try {
      const query = new URLSearchParams({
        branchId: elements.branch.value,
        date: elements.date.value,
        duration: String(procedure.duration)
      });
      const result = await api(`/api/public/availability?${query}`);
      if (token !== availabilityToken) return;

      if (!result.slots.length) {
        elements.slotsEmpty.textContent = result.reason || "No quedan espacios ese dia.";
        refreshSteps();
        return;
      }

      elements.slotsEmpty.textContent = "";
      elements.slots.innerHTML = result.slots
        .map(
          (time) =>
            `<button class="slot" type="button" data-slot="${escapeHtml(time)}" aria-pressed="false">${escapeHtml(time)}</button>`
        )
        .join("");
    } catch (error) {
      if (token !== availabilityToken) return;
      elements.slotsEmpty.textContent = "No pudimos cargar los horarios. Intenta de nuevo.";
    }

    refreshSteps();
  }

  /* --- Envio ----------------------------------------------------------- */

  function localValidation() {
    const phoneDigits = elements.phone.value.replace(/\D+/g, "").replace(/^506/, "");
    if (phoneDigits.length !== 8 || !/^[678]/.test(phoneDigits)) {
      elements.phone.setAttribute("aria-invalid", "true");
      return "Escribe un celular de 8 digitos que tenga WhatsApp.";
    }
    elements.phone.removeAttribute("aria-invalid");

    if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(elements.email.value.trim())) {
      elements.email.setAttribute("aria-invalid", "true");
      return "Revisa el correo, parece incompleto.";
    }
    elements.email.removeAttribute("aria-invalid");

    if (elements.name.value.trim().length < 3) {
      elements.name.setAttribute("aria-invalid", "true");
      return "Escribe tu nombre completo.";
    }
    elements.name.removeAttribute("aria-invalid");

    return "";
  }

  async function submit(event) {
    event.preventDefault();
    if (sending) return;

    const problem = localValidation();
    if (problem) {
      elements.error.textContent = problem;
      return;
    }

    sending = true;
    elements.error.textContent = "";
    refreshSteps();

    try {
      await api("/api/public/booking", {
        method: "POST",
        body: JSON.stringify({
          branchId: elements.branch.value,
          procedureId: elements.procedure.value,
          date: elements.date.value,
          time: selectedTime,
          clientName: elements.name.value,
          clientPhone: elements.phone.value,
          clientEmail: elements.email.value,
          notes: elements.notes.value,
          website: elements.website.value
        })
      });

      elements.doneDetail.textContent = `${currentProcedure()?.name || "Tu cita"} · ${longDate(
        elements.date.value
      )} a las ${selectedTime}`;
      elements.form.hidden = true;
      elements.done.hidden = false;
      elements.done.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      // 409 significa que el hueco se ocupo entre que lo eligio y lo envio:
      // hay que recargar los horarios o volveria a elegir el mismo.
      elements.error.textContent = error.message;
      if (error.status === 409) loadSlots();
    } finally {
      sending = false;
      refreshSteps();
    }
  }

  function restart() {
    elements.form.reset();
    selectedTime = "";
    elements.slots.innerHTML = "";
    elements.slotsEmpty.textContent = "Elige primero una fecha.";
    elements.summary.hidden = true;
    elements.error.textContent = "";
    elements.done.hidden = true;
    elements.form.hidden = false;
    fillProcedures();
    showServiceDetail();
    refreshSteps();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* --- Enlaces --------------------------------------------------------- */

  elements.branch.addEventListener("change", () => {
    fillProcedures();
    showServiceDetail();
    loadSlots();
  });

  elements.procedure.addEventListener("change", () => {
    showServiceDetail();
    loadSlots();
  });

  elements.date.addEventListener("change", loadSlots);

  elements.slots.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slot]");
    if (!button) return;
    selectedTime = button.dataset.slot;
    elements.slots.querySelectorAll(".slot").forEach((slot) => {
      const active = slot === button;
      slot.classList.toggle("is-selected", active);
      slot.setAttribute("aria-pressed", String(active));
    });
    elements.error.textContent = "";
    refreshSteps();
  });

  [elements.name, elements.phone, elements.email].forEach((input) => {
    input.addEventListener("input", refreshSteps);
  });

  elements.form.addEventListener("submit", submit);
  elements.again.addEventListener("click", restart);

  /* --- Arranque -------------------------------------------------------- */

  // Identidad del negocio: logo y nombre configurados desde el sistema.
  async function loadBranding() {
    try {
      const response = await fetch("/api/public/branding", { cache: "no-store" });
      if (!response.ok) return;
      const { branding } = await response.json();
      if (!branding) return;
      const name = document.getElementById("brandName");
      const logo = document.getElementById("brandLogo");
      if (name && branding.name) name.textContent = branding.name;
      if (logo && branding.hasLogo) {
        logo.src = `/api/public/logo?v=${encodeURIComponent(branding.logoVersion || "")}`;
        logo.alt = branding.name || "Logo";
      }
      if (branding.name) document.title = `Reservar cita · ${branding.name}`;
    } catch (error) {
      /* se queda con el logo por defecto */
    }
  }

  (async () => {
    loadBranding();
    try {
      const result = await api("/api/public/config");
      config = result.config;
      fillBranches();
      configureDateInput();
      refreshSteps();
    } catch (error) {
      elements.error.textContent =
        "No pudimos cargar la agenda en este momento. Escribenos por WhatsApp y te ayudamos.";
      elements.submit.disabled = true;
    }
  })();
})();
