// Agenda publica de Chic & Co.
//
// Sin framework y sin dependencias, igual que el resto del proyecto. La pagina
// la abre gente desde el telefono con datos moviles: cada kilobyte que no se
// descarga es medio segundo que no espera.
//
// La validacion de aqui es comodidad, no seguridad. El servidor revalida TODO
// -correo, telefono, horario libre, ventana de reserva- porque cualquiera puede
// llamar al endpoint sin pasar por este formulario.

(() => {
  "use strict";

  const el = {
    form: document.getElementById("bookingForm"),
    branchStep: document.querySelector('[data-step="branch"]'),
    branchGroup: document.getElementById("branchGroup"),
    serviceGroup: document.getElementById("serviceGroup"),
    servicePicked: document.getElementById("servicePicked"),
    datePicked: document.getElementById("datePicked"),
    timePicked: document.getElementById("timePicked"),
    dayStrip: document.getElementById("dayStrip"),
    moreDates: document.getElementById("moreDates"),
    dateInput: document.getElementById("dateInput"),
    nativeDate: document.querySelector(".native-date"),
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
    actionbar: document.getElementById("actionbar"),
    submit: document.getElementById("submitButton"),
    submitLabel: document.getElementById("submitLabel"),
    done: document.getElementById("done"),
    doneDetail: document.getElementById("doneDetail"),
    again: document.getElementById("againButton"),
    steps: document.querySelectorAll(".card[data-step]")
  };

  let config = null;
  const sel = { branchId: "", procedureId: "", date: "", time: "" };
  let sending = false;
  // Cada peticion de disponibilidad lleva numero: si cambian de dia mientras la
  // anterior sigue en vuelo, la respuesta vieja no debe pintar el dia equivocado.
  let availabilityToken = 0;

  const monthShort = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  const monthLong = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"
  ];
  const weekShort = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
  const weekLong = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

  function longDate(iso) {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return `${weekLong[d.getDay()]} ${d.getDate()} de ${monthLong[d.getMonth()]}`;
  }

  function money(value) {
    return `₡${Number(value || 0).toLocaleString("es-CR")}`;
  }

  function todayISO() {
    // Costa Rica es UTC-6 todo el año (sin horario de verano). Sin este ajuste,
    // entre las 18:00 y medianoche el navegador (en UTC) ya marca el dia
    // siguiente: la tira de dias omitia "hoy" y el minimo del calendario
    // saltaba a mañana. Se calcula el dia con el offset de CR.
    const crMs = Date.now() - 6 * 60 * 60 * 1000;
    return new Date(crMs).toISOString().slice(0, 10);
  }

  function addDays(iso, n) {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  async function api(path, options) {
    const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(payload.message || "No se pudo completar la accion."), {
        status: response.status
      });
    }
    return payload;
  }

  function branch() {
    return config?.branches.find((b) => b.id === sel.branchId) || null;
  }
  function procedure() {
    return branch()?.procedures.find((p) => p.id === sel.procedureId) || null;
  }

  /* --- Estado de los pasos --------------------------------------------- */

  // Un paso queda "listo" cuando su dato esta elegido, "activo" cuando es el
  // siguiente por hacer, y "bloqueado" mientras falte algo antes. Asi la
  // persona ve de un vistazo donde va y cuanto queda.
  function refresh() {
    const done = {
      service: Boolean(sel.procedureId),
      date: Boolean(sel.date),
      time: Boolean(sel.time),
      details: Boolean(el.name.value.trim() && el.phone.value.trim() && el.email.value.trim())
    };
    const order = ["service", "date", "time", "details"];

    el.steps.forEach((step) => {
      const key = step.dataset.step;
      if (key === "branch") return; // la sucursal se maneja aparte
      const idx = order.indexOf(key);
      const reachable = order.slice(0, idx).every((k) => done[k]);
      step.classList.toggle("is-done", done[key]);
      step.classList.toggle("is-locked", !reachable);
      step.classList.toggle("is-active", reachable && !done[key]);
    });

    el.servicePicked.textContent = done.service ? procedure()?.name || "" : "";
    el.datePicked.textContent = done.date ? shortDateLabel(sel.date) : "";
    el.timePicked.textContent = done.time ? sel.time : "";

    updateActionbar(done);
  }

  function shortDateLabel(iso) {
    const d = new Date(`${iso}T00:00:00`);
    return `${weekShort[d.getDay()]} ${d.getDate()} ${monthShort[d.getMonth()]}`;
  }

  function updateActionbar(done) {
    const ready = done.service && done.date && done.time && done.details;

    if (done.service && done.date && done.time) {
      el.summary.innerHTML = `<strong>${escapeHtml(procedure()?.name || "")}</strong>${escapeHtml(
        `${shortDateLabel(sel.date)} · ${sel.time}`
      )}`;
    } else {
      el.summary.textContent = "";
    }

    el.submit.disabled = !ready || sending;
    if (sending) el.submitLabel.textContent = "Enviando...";
    else if (ready) el.submitLabel.textContent = "Solicitar cita";
    else if (!done.service) el.submitLabel.textContent = "Elige un servicio";
    else if (!done.date) el.submitLabel.textContent = "Elige un dia";
    else if (!done.time) el.submitLabel.textContent = "Elige una hora";
    else el.submitLabel.textContent = "Completa tus datos";
  }

  /* --- Sucursal -------------------------------------------------------- */

  function fillBranches() {
    const branches = config.branches;
    if (branches.length <= 1) {
      sel.branchId = branches[0]?.id || "";
      el.branchStep.hidden = true;
    } else {
      el.branchStep.hidden = false;
      sel.branchId = branches[0].id;
      el.branchGroup.innerHTML = branches
        .map(
          (b, i) =>
            `<button type="button" role="radio" aria-checked="${i === 0}" class="${
              i === 0 ? "is-selected" : ""
            }" data-branch="${escapeHtml(b.id)}">${escapeHtml(b.label)}</button>`
        )
        .join("");
    }
    fillServices();
  }

  /* --- Servicios como tarjetas ----------------------------------------- */

  function fillServices() {
    const procedures = branch()?.procedures || [];
    // Cambiar de sucursal invalida el servicio elegido si ya no existe alli.
    if (sel.procedureId && !procedures.some((p) => p.id === sel.procedureId)) {
      sel.procedureId = "";
      sel.time = "";
    }

    if (!procedures.length) {
      el.serviceGroup.innerHTML = `<p class="slots-empty">Esta sucursal aun no tiene servicios en linea.</p>`;
      refresh();
      return;
    }

    el.serviceGroup.innerHTML = procedures
      .map((p) => {
        const selected = p.id === sel.procedureId;
        const meta = `${p.duration} min`;
        return `
          <button type="button" role="radio" aria-checked="${selected}" class="service${
          selected ? " is-selected" : ""
        }" data-service="${escapeHtml(p.id)}">
            <span class="service-radio" aria-hidden="true"></span>
            <span class="service-body">
              <span class="service-name">${escapeHtml(p.name)}</span>
              <span class="service-meta">${escapeHtml(meta)}</span>
            </span>
            ${p.price > 0 ? `<span class="service-price">${escapeHtml(money(p.price))}</span>` : ""}
          </button>`;
      })
      .join("");
    refresh();
  }

  /* --- Tira de dias ---------------------------------------------------- */

  function buildDayStrip() {
    const closed = new Set(config.closedWeekdays || []);
    const horizon = config.maxHorizonDays || 60;
    const chips = [];
    let iso = todayISO();
    let scanned = 0;
    // Los primeros dias abiertos, hasta 14 o el horizonte.
    while (chips.length < 14 && scanned <= horizon) {
      const d = new Date(`${iso}T00:00:00`);
      if (!closed.has(d.getDay())) {
        chips.push({ iso, d, today: iso === todayISO() });
      }
      iso = addDays(iso, 1);
      scanned += 1;
    }

    el.dayStrip.innerHTML = chips
      .map(
        (c) => `
        <button type="button" role="radio" aria-checked="false" class="day${c.today ? " is-today" : ""}"
          data-day="${escapeHtml(c.iso)}" aria-label="${escapeHtml(longDate(c.iso))}">
          <span class="day-name">${escapeHtml(weekShort[c.d.getDay()])}</span>
          <span class="day-num">${escapeHtml(c.d.getDate())}</span>
          <span class="day-month">${escapeHtml(monthShort[c.d.getMonth()])}</span>
        </button>`
      )
      .join("");

    el.dateInput.min = todayISO();
    el.dateInput.max = addDays(todayISO(), horizon);
  }

  function selectDay(iso, { fromNative = false } = {}) {
    sel.date = iso;
    sel.time = "";
    el.dayStrip.querySelectorAll(".day").forEach((chip) => {
      const active = chip.dataset.day === iso;
      chip.classList.toggle("is-selected", active);
      chip.setAttribute("aria-checked", String(active));
    });
    // Si eligieron una fecha lejana por el selector nativo, no hay chip: se
    // deja el hint con la fecha para que quede claro cual es.
    if (fromNative) {
      el.dayHint.classList.remove("is-blocked");
      el.dayHint.textContent = longDate(iso);
    } else {
      el.dayHint.textContent = "";
    }
    loadSlots();
  }

  /* --- Disponibilidad -------------------------------------------------- */

  async function loadSlots() {
    sel.time = "";
    el.slots.innerHTML = "";

    const p = procedure();
    if (!p || !sel.date) {
      el.slotsEmpty.textContent = "Elige primero un servicio y un dia.";
      refresh();
      return;
    }

    const token = ++availabilityToken;
    el.slotsEmpty.textContent = "Buscando horarios...";

    try {
      const query = new URLSearchParams({ branchId: sel.branchId, date: sel.date, duration: String(p.duration) });
      const result = await api(`/api/public/availability?${query}`);
      if (token !== availabilityToken) return;

      if (!result.slots.length) {
        el.slotsEmpty.textContent = result.reason || "No quedan espacios ese dia.";
        refresh();
        return;
      }

      el.slotsEmpty.textContent = "";
      el.slots.innerHTML = result.slots
        .map(
          (time) =>
            `<button class="slot" type="button" role="radio" aria-checked="false" data-slot="${escapeHtml(
              time
            )}">${escapeHtml(time)}</button>`
        )
        .join("");
    } catch (error) {
      if (token !== availabilityToken) return;
      el.slotsEmpty.textContent = "No pudimos cargar los horarios. Intenta de nuevo.";
    }
    refresh();
  }

  /* --- Envio ----------------------------------------------------------- */

  function localValidation() {
    const phoneDigits = el.phone.value.replace(/\D+/g, "").replace(/^506/, "");
    if (phoneDigits.length !== 8 || !/^[678]/.test(phoneDigits)) {
      el.phone.setAttribute("aria-invalid", "true");
      return "Escribe un celular de 8 digitos que tenga WhatsApp.";
    }
    el.phone.removeAttribute("aria-invalid");

    if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(el.email.value.trim())) {
      el.email.setAttribute("aria-invalid", "true");
      return "Revisa el correo, parece incompleto.";
    }
    el.email.removeAttribute("aria-invalid");

    if (el.name.value.trim().length < 3) {
      el.name.setAttribute("aria-invalid", "true");
      return "Escribe tu nombre completo.";
    }
    el.name.removeAttribute("aria-invalid");
    return "";
  }

  async function submit(event) {
    event.preventDefault();
    if (sending) return;

    const problem = localValidation();
    if (problem) {
      el.error.textContent = problem;
      return;
    }

    sending = true;
    el.error.textContent = "";
    refresh();

    try {
      await api("/api/public/booking", {
        method: "POST",
        body: JSON.stringify({
          branchId: sel.branchId,
          procedureId: sel.procedureId,
          date: sel.date,
          time: sel.time,
          clientName: el.name.value,
          clientPhone: el.phone.value,
          clientEmail: el.email.value,
          notes: el.notes.value,
          website: el.website.value
        })
      });

      trackConversion();
      el.doneDetail.textContent = `${procedure()?.name || "Tu cita"} · ${longDate(sel.date)} a las ${sel.time}`;
      el.form.hidden = true;
      el.actionbar.hidden = true;
      el.done.hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      // 409 = el hueco se ocupo entre elegir y enviar: limpiar la hora elegida
      // (para que el resumen no siga mostrando un cupo que ya no existe) y
      // recargar los horarios.
      el.error.textContent = error.message;
      if (error.status === 409) {
        sel.time = "";
        loadSlots();
      }
    } finally {
      sending = false;
      refresh();
    }
  }

  function restart() {
    el.form.reset();
    sel.procedureId = "";
    sel.date = "";
    sel.time = "";
    el.slots.innerHTML = "";
    el.slotsEmpty.textContent = "Elige primero un dia.";
    el.dayHint.textContent = "";
    el.error.textContent = "";
    el.done.hidden = true;
    el.form.hidden = false;
    el.actionbar.hidden = false;
    el.nativeDate.hidden = true;
    el.dayStrip.querySelectorAll(".day").forEach((c) => {
      c.classList.remove("is-selected");
      c.setAttribute("aria-checked", "false");
    });
    fillServices();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* --- Interaccion ----------------------------------------------------- */

  el.branchGroup.addEventListener("click", (event) => {
    const button = event.target.closest("[data-branch]");
    if (!button) return;
    sel.branchId = button.dataset.branch;
    el.branchGroup.querySelectorAll("button").forEach((b) => {
      const active = b === button;
      b.classList.toggle("is-selected", active);
      b.setAttribute("aria-checked", String(active));
    });
    sel.date = "";
    sel.time = "";
    el.dayStrip.querySelectorAll(".day").forEach((c) => {
      c.classList.remove("is-selected");
      c.setAttribute("aria-checked", "false");
    });
    el.slots.innerHTML = "";
    el.slotsEmpty.textContent = "Elige primero un dia.";
    fillServices();
  });

  el.serviceGroup.addEventListener("click", (event) => {
    const button = event.target.closest("[data-service]");
    if (!button) return;
    sel.procedureId = button.dataset.service;
    el.serviceGroup.querySelectorAll(".service").forEach((s) => {
      const active = s === button;
      s.classList.toggle("is-selected", active);
      s.setAttribute("aria-checked", String(active));
    });
    // Cambiar de servicio cambia la duracion: los horarios se recalculan.
    if (sel.date) loadSlots();
    else refresh();
  });

  el.dayStrip.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-day]");
    if (chip) selectDay(chip.dataset.day);
  });

  el.moreDates.addEventListener("click", () => {
    el.nativeDate.hidden = !el.nativeDate.hidden;
    if (!el.nativeDate.hidden) el.dateInput.showPicker?.();
  });

  el.dateInput.addEventListener("change", () => {
    if (!el.dateInput.value) return;
    const closed = new Set(config.closedWeekdays || []);
    const weekday = new Date(`${el.dateInput.value}T00:00:00`).getDay();
    el.dayStrip.querySelectorAll(".day").forEach((c) => {
      c.classList.remove("is-selected");
      c.setAttribute("aria-checked", "false");
    });
    if (closed.has(weekday)) {
      el.dayHint.classList.add("is-blocked");
      el.dayHint.textContent = "Ese dia el salon no abre. Elige otro.";
      sel.date = "";
      sel.time = "";
      el.slots.innerHTML = "";
      el.slotsEmpty.textContent = "";
      refresh();
      return;
    }
    selectDay(el.dateInput.value, { fromNative: true });
  });

  el.slots.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slot]");
    if (!button) return;
    sel.time = button.dataset.slot;
    el.slots.querySelectorAll(".slot").forEach((s) => {
      const active = s === button;
      s.classList.toggle("is-selected", active);
      s.setAttribute("aria-checked", String(active));
    });
    el.error.textContent = "";
    refresh();
  });

  [el.name, el.phone, el.email].forEach((input) => input.addEventListener("input", refresh));
  el.form.addEventListener("submit", submit);
  el.again.addEventListener("click", restart);

  // Navegacion con flechas dentro de cada grupo de opciones (servicio, dia,
  // hora). Es aditiva: el Tab sigue llegando a cada opcion; las flechas mueven
  // el foco a la vecina y la seleccionan, como espera el patron de radiogroup.
  [el.branchGroup, el.serviceGroup, el.dayStrip, el.slots].forEach((group) => {
    if (!group) return;
    group.addEventListener("keydown", (event) => {
      const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
      if (!keys.includes(event.key)) return;
      const options = [...group.querySelectorAll('[role="radio"]')].filter(
        (node) => !node.disabled && node.offsetParent !== null
      );
      if (!options.length) return;
      const current = options.indexOf(document.activeElement);
      let next;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      else if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1 + options.length) % options.length;
      else next = (current - 1 + options.length) % options.length;
      event.preventDefault();
      options[next].focus();
      options[next].click();
    });
  });

  /* --- Arranque -------------------------------------------------------- */

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

  /* --- Pixeles de marketing ------------------------------------------------
     El admin configura los ids desde la app; aqui solo se cargan si existen.
     PageView al abrir el enlace y una conversion cuando se solicita la cita,
     para poder medir el recorrido del cliente de punta a punta. Cada carga va
     en su propio try: un pixel mal configurado nunca rompe la reserva. */

  function loadMetaPixel(id) {
    if (window.fbq) return;
    /* eslint-disable */
    (function (f, b, e, v, n, t, s) {
      f.fbq = n = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = true; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq("init", id);
    window.fbq("track", "PageView");
  }

  function loadGA4(id) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(script);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id);
  }

  function loadTikTokPixel(id) {
    /* eslint-disable */
    (function (w, d, t) {
      w.TiktokAnalyticsObject = t;
      var ttq = (w[t] = w[t] || []);
      ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
      ttq.setAndDefer = function (a, b) { a[b] = function () { a.push([b].concat(Array.prototype.slice.call(arguments, 0))); }; };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.load = function (e) {
        var r = "https://analytics.tiktok.com/i18n/pixel/events.js";
        ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r; ttq._t = ttq._t || {}; ttq._t[e] = +new Date();
        var o = d.createElement("script"); o.type = "text/javascript"; o.async = true; o.src = r + "?sdkid=" + e + "&lib=" + t;
        var a = d.getElementsByTagName("script")[0]; a.parentNode.insertBefore(o, a);
      };
      ttq.load(id); ttq.page();
    })(window, document, "ttq");
    /* eslint-enable */
  }

  function initTracking(tracking) {
    if (!tracking) return;
    try { if (tracking.metaPixelId) loadMetaPixel(tracking.metaPixelId); } catch (error) { /* pixel opcional */ }
    try { if (tracking.ga4Id) loadGA4(tracking.ga4Id); } catch (error) { /* pixel opcional */ }
    try { if (tracking.tiktokPixelId) loadTikTokPixel(tracking.tiktokPixelId); } catch (error) { /* pixel opcional */ }
  }

  // Conversion cuando el cliente solicita la cita. Se usan eventos estandar
  // para que Meta/Google/TikTok los reconozcan como leads/citas.
  function trackConversion() {
    try { if (window.fbq) window.fbq("track", "Schedule"); } catch (error) { /* ignore */ }
    try { if (window.gtag) window.gtag("event", "generate_lead", { currency: "CRC" }); } catch (error) { /* ignore */ }
    try { if (window.ttq) window.ttq.track("SubmitForm"); } catch (error) { /* ignore */ }
  }

  (async () => {
    loadBranding();
    try {
      const result = await api("/api/public/config");
      config = result.config;
      initTracking(config.tracking);
      fillBranches();
      buildDayStrip();
      el.actionbar.hidden = false;
      refresh();
    } catch (error) {
      el.serviceGroup.innerHTML =
        '<p class="slots-empty">No pudimos cargar la agenda ahora. Escribenos por WhatsApp y te ayudamos.</p>';
      el.actionbar.hidden = false;
      el.submit.disabled = true;
    }
  })();
})();
