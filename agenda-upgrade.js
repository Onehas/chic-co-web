(function () {
  if (window.__chicAgendaUpgrade || typeof viewRenderers === "undefined") return;
  window.__chicAgendaUpgrade = true;

  const dayStart = 8 * 60 + 30;
  const dayEnd = 19 * 60;
  const slotStep = 30;
  const activeStatuses = ["Pendiente", "Confirmada", "En curso"];
  const closedStatuses = ["Atendida", "Cancelada"];

  function text(value = "") {
    return String(value || "").trim();
  }

  function toMinutes(timeValue = "00:00") {
    const [hours, minutes] = String(timeValue || "00:00").split(":").map(Number);
    return Number(hours || 0) * 60 + Number(minutes || 0);
  }

  function toTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function addMonths(dateValue, amount) {
    const date = new Date(`${dateValue || todayISO()}T00:00:00`);
    date.setMonth(date.getMonth() + amount);
    return dateToISO(date);
  }

  function appointmentDuration(appointment = {}) {
    const procedure = getProcedure(appointment.procedureId);
    return Number(appointment.duration || procedure?.duration || 60);
  }

  function appointmentEnd(appointment = {}) {
    return toTime(toMinutes(appointment.time) + appointmentDuration(appointment));
  }

  function isOpenAppointment(appointment = {}) {
    return !closedStatuses.includes(appointment.status);
  }

  function appointmentsForDay(day) {
    return state.appointments
      .filter((appointment) => appointment.date === day)
      .sort((a, b) => `${a.time} ${a.specialist}`.localeCompare(`${b.time} ${b.specialist}`));
  }

  function appointmentConflict(data, ignoreId = "") {
    const start = toMinutes(data.time);
    const end = start + Number(data.duration || appointmentDuration(data));
    return state.appointments.find((appointment) => {
      if (appointment.id === ignoreId || !isOpenAppointment(appointment)) return false;
      if (appointment.date !== data.date || normalize(appointment.specialist) !== normalize(data.specialist)) return false;
      const otherStart = toMinutes(appointment.time);
      const otherEnd = otherStart + appointmentDuration(appointment);
      return start < otherEnd && end > otherStart;
    });
  }

  function slotStates(day, specialist, duration = 60) {
    const slots = [];
    for (let start = dayStart; start + Number(duration) <= dayEnd; start += slotStep) {
      const candidate = {
        date: day,
        time: toTime(start),
        specialist,
        duration: Number(duration)
      };
      slots.push({
        time: candidate.time,
        busy: Boolean(appointmentConflict(candidate))
      });
    }
    return slots;
  }

  function availableSlots(day, specialist, duration = 60) {
    return slotStates(day, specialist, duration)
      .filter((slot) => !slot.busy)
      .map((slot) => slot.time);
  }

  function selectedProcedureDuration() {
    const selectedProcedure = prefill.procedureId || state.procedures[0]?.id || "";
    return Number(getProcedure(selectedProcedure)?.duration || 60);
  }

  function statusOptions(selected = "Pendiente") {
    return ["Pendiente", "Confirmada", "En curso", "Atendida", "Cancelada"].map((status) => ({
      value: status,
      label: status,
      selected: status === selected
    }));
  }

  function addDays(dateValue, amount) {
    const date = new Date(`${dateValue || todayISO()}T00:00:00`);
    date.setDate(date.getDate() + amount);
    return dateToISO(date);
  }

  // Lunes de la semana a la que pertenece la fecha.
  function weekStart(dateValue) {
    const date = new Date(`${dateValue || todayISO()}T00:00:00`);
    const weekday = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - weekday);
    return dateToISO(date);
  }

  function longDate(dayISO) {
    const date = new Date(`${dayISO}T00:00:00`);
    return `${weekdayNames[date.getDay()]} ${date.getDate()} de ${monthNames[date.getMonth()].toLowerCase()}`;
  }

  function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
  }

  const statusTone = {
    Pendiente: "pendiente",
    Confirmada: "confirmada",
    "En curso": "curso",
    Atendida: "atendida",
    Cancelada: "cancelada"
  };

  // Cuenta lo que hay agendado cada dia: citas abiertas, sesiones en curso
  // con proxima fecha y planes con proxima sesion.
  function scheduleCountByDay() {
    const counts = {};
    const add = (dateValue) => {
      if (!dateValue) return;
      counts[dateValue] = (counts[dateValue] || 0) + 1;
    };
    state.appointments.filter(isOpenAppointment).forEach((appointment) => add(appointment.date));
    state.activeProcedures.forEach((procedure) => add(procedure.next));
    state.plans.forEach((plan) => add(plan.next));
    return counts;
  }

  function renderWeekStrip(selectedDay) {
    const counts = scheduleCountByDay();
    const today = todayISO();
    const monday = weekStart(selectedDay);

    return Array.from({ length: 7 }, (unused, index) => {
      const dayISO = addDays(monday, index);
      const date = new Date(`${dayISO}T00:00:00`);
      const count = counts[dayISO] || 0;
      const className = [
        "agenda-day-chip",
        dayISO === selectedDay ? "is-selected" : "",
        dayISO === today ? "is-today" : ""
      ]
        .filter(Boolean)
        .join(" ");
      return `
        <button class="${className}" type="button" data-agenda-date="${escapeHtml(dayISO)}" aria-pressed="${
        dayISO === selectedDay
      }">
          <span class="agenda-day-name">${escapeHtml(weekdayShortNames[date.getDay()])}</span>
          <span class="agenda-day-number">${escapeHtml(date.getDate())}</span>
          <span class="agenda-day-count">${count ? escapeHtml(plural(count, "cita", "citas")) : "libre"}</span>
        </button>
      `;
    }).join("");
  }

  // La rejilla del dia: una columna por especialista, una fila cada media
  // hora. Sustituye a los tres bloques que habia antes -rejilla del mes,
  // lista del dia y muro de fichas de horario-, que obligaban a mirar en
  // tres sitios distintos para responder a "quien esta libre a las 3".
  function renderDayGrid(selectedDay, specialists) {
    const rowCount = Math.ceil((dayEnd - dayStart) / slotStep);
    const dayAppointments = appointmentsForDay(selectedDay);
    const byIndex = new Map(specialists.map((specialist, index) => [normalize(specialist.name), index]));

    const heads = specialists
      .map((specialist, index) => {
        const count = dayAppointments.filter(
          (appointment) => byIndex.get(normalize(appointment.specialist)) === index && isOpenAppointment(appointment)
        ).length;
        return `
          <div class="agenda-grid-head" style="grid-column: ${index + 2}; grid-row: 1;">
            <strong>${escapeHtml(specialist.name)}</strong>
            <span>${count ? escapeHtml(plural(count, "cita", "citas")) : "sin citas"}</span>
          </div>
        `;
      })
      .join("");

    const hours = Array.from({ length: rowCount }, (unused, row) => {
      const minutes = dayStart + row * slotStep;
      const onTheHour = minutes % 60 === 0;
      return `<div class="agenda-grid-time${onTheHour ? " is-hour" : ""}" style="grid-row: ${row + 2};">${
        onTheHour ? escapeHtml(toTime(minutes)) : ""
      }</div>`;
    }).join("");

    // Se marca cada media hora ocupada para no dibujar un hueco libre
    // encima de una cita en curso.
    const occupied = specialists.map(() => new Set());
    const blocks = [];
    const unplaced = [];

    dayAppointments.forEach((appointment) => {
      const column = byIndex.get(normalize(appointment.specialist));
      const startMinutes = toMinutes(appointment.time);
      const duration = appointmentDuration(appointment);
      const row = Math.round((startMinutes - dayStart) / slotStep);
      const span = Math.max(1, Math.round(duration / slotStep));

      if (column === undefined || row < 0 || row >= rowCount) {
        unplaced.push(appointment);
        return;
      }

      for (let offset = 0; offset < span && row + offset < rowCount; offset += 1) {
        occupied[column].add(row + offset);
      }

      const tone = statusTone[appointment.status] || "pendiente";
      blocks.push(`
        <button
          class="agenda-block is-${tone}"
          type="button"
          data-agenda-appointment="${escapeHtml(appointment.id)}"
          style="grid-column: ${column + 2}; grid-row: ${row + 2} / span ${Math.min(span, rowCount - row)};"
          title="${escapeHtml(`${appointment.time}-${appointmentEnd(appointment)} · ${clientName(appointment.clientId)} · ${appointment.status}`)}"
        >
          <span class="agenda-block-time">${escapeHtml(appointment.time)} - ${escapeHtml(appointmentEnd(appointment))}</span>
          <span class="agenda-block-client">${escapeHtml(clientName(appointment.clientId))}</span>
          <span class="agenda-block-service">${escapeHtml(procedureName(appointment.procedureId))}</span>
        </button>
      `);
    });

    const freeCells = specialists
      .map((specialist, column) =>
        Array.from({ length: rowCount }, (unused, row) => {
          if (occupied[column].has(row)) return "";
          const time = toTime(dayStart + row * slotStep);
          return `
            <button
              class="agenda-free"
              type="button"
              data-agenda-slot="${escapeHtml(time)}"
              data-agenda-specialist="${escapeHtml(specialist.name)}"
              style="grid-column: ${column + 2}; grid-row: ${row + 2};"
              aria-label="${escapeHtml(`Agendar a las ${time} con ${specialist.name}`)}"
            ><span aria-hidden="true">+</span></button>
          `;
        }).join("")
      )
      .join("");

    const leftovers = unplaced.length
      ? `
        <div class="agenda-unplaced">
          <strong>Fuera de la rejilla</strong>
          <span>Horario o especialista que ya no esta en la lista de la sucursal.</span>
          <div class="agenda-unplaced-list">
            ${unplaced
              .map(
                (appointment) => `
                  <button class="agenda-unplaced-item" type="button" data-agenda-appointment="${escapeHtml(appointment.id)}">
                    <strong>${escapeHtml(appointment.time)}</strong>
                    <span>${escapeHtml(clientName(appointment.clientId))} · ${escapeHtml(appointment.specialist || "Sin especialista")}</span>
                    ${statusBadge(appointment.status)}
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
      `
      : "";

    if (!specialists.length) {
      return `<div class="empty-state">Esta sucursal no tiene especialistas registrados.</div>${leftovers}`;
    }

    // Linea de "ahora": solo cuando se mira el dia de hoy y la hora cae dentro
    // del horario dibujado. Se coloca en la fila de su media hora y se empuja
    // hacia abajo la fraccion exacta que falta, para que quede justo en la hora.
    let nowLine = "";
    if (selectedDay === todayISO()) {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (nowMinutes >= dayStart && nowMinutes <= dayEnd) {
        const nowRow = Math.floor((nowMinutes - dayStart) / slotStep);
        const nowOffset = (((nowMinutes - dayStart) % slotStep) / slotStep) * 32;
        nowLine = `<div class="agenda-now" aria-hidden="true" style="grid-column: 2 / -1; grid-row: ${nowRow + 2}; transform: translateY(${nowOffset}px);"><span class="agenda-now-dot"></span></div>`;
      }
    }

    return `
      <div class="agenda-grid-scroll">
        <div
          class="agenda-grid"
          style="grid-template-columns: 58px repeat(${specialists.length}, minmax(148px, 1fr)); grid-template-rows: auto repeat(${rowCount}, 32px);"
        >
          <div class="agenda-grid-corner" style="grid-column: 1; grid-row: 1;"></div>
          ${heads}
          ${hours}
          ${freeCells}
          ${blocks.join("")}
          ${nowLine}
        </div>
      </div>
      ${leftovers}
    `;
  }

  // Pulso del dia: un vistazo a como viene la jornada por estado.
  function renderDayPulse(selectedDay) {
    const dayAppointments = appointmentsForDay(selectedDay);
    const count = (status) => dayAppointments.filter((appointment) => appointment.status === status).length;
    const chips = [
      { label: "Confirmadas", value: count("Confirmada"), tone: "confirmada" },
      { label: "Pendientes", value: count("Pendiente"), tone: "pendiente" },
      { label: "En curso", value: count("En curso"), tone: "curso" },
      { label: "Atendidas", value: count("Atendida"), tone: "atendida" }
    ];
    return `
      <div class="agenda-pulse" role="group" aria-label="Resumen del dia">
        ${chips
          .map(
            (chip) => `
              <div class="agenda-pulse-chip is-${chip.tone}">
                <span class="agenda-pulse-value">${chip.value}</span>
                <span class="agenda-pulse-label">${escapeHtml(chip.label)}</span>
              </div>`
          )
          .join("")}
      </div>
    `;
  }

  function renderAppointmentAgenda() {
    const selectedDay = selectedAgendaDate || todayISO();
    const specialists = typeof currentBranchSpecialists === "function" ? currentBranchSpecialists() : procedureSpecialists;
    const openCount = appointmentsForDay(selectedDay).filter(isOpenAppointment).length;

    return `
      <section class="agenda" aria-label="Agenda del dia">
        <header class="agenda-bar">
          <div class="agenda-nav">
            <button class="agenda-step" type="button" data-agenda-shift="-1" aria-label="Dia anterior">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button class="agenda-step" type="button" data-agenda-shift="1" aria-label="Dia siguiente">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          <div class="agenda-heading">
            <strong>${escapeHtml(longDate(selectedDay))}</strong>
            <span>${escapeHtml(openCount ? plural(openCount, "cita activa", "citas activas") : "Sin citas activas")}</span>
          </div>

          <div class="agenda-bar-actions">
            <label class="agenda-jump">
              <span class="visually-hidden">Ir a una fecha</span>
              <input type="date" value="${escapeHtml(selectedDay)}" data-agenda-jump />
            </label>
            <button class="secondary-action" type="button" data-agenda-today>Hoy</button>
          </div>
        </header>

        <div class="agenda-week">${renderWeekStrip(selectedDay)}</div>

        ${renderDayPulse(selectedDay)}

        ${renderDayGrid(selectedDay, specialists)}

        <footer class="agenda-legend">
          <span><i class="is-pendiente"></i>Pendiente</span>
          <span><i class="is-confirmada"></i>Confirmada</span>
          <span><i class="is-curso"></i>En curso</span>
          <span><i class="is-atendida"></i>Atendida</span>
          <span><i class="is-cancelada"></i>Cancelada</span>
          <span class="agenda-legend-hint">Toque un hueco libre para agendar ahi.</span>
        </footer>
      </section>
    `;
  }

  window.renderAppointmentAgenda = renderAppointmentAgenda;

  const originalAddAppointment = addAppointment;
  addAppointment = function (data) {
    const duration = Math.max(15, Number(data.duration || appointmentDuration(data)));
    const payload = {
      ...data,
      clientId: data.clientId,
      procedureId: data.procedureId,
      date: data.date || selectedAgendaDate || todayISO(),
      time: data.time,
      specialist: text(data.specialist),
      status: data.status || "Pendiente",
      duration,
      notes: text(data.notes)
    };

    if (!payload.clientId || !payload.procedureId || !payload.date || !payload.time || !payload.specialist) {
      showToast("Complete cliente, procedimiento, fecha, hora y especialista");
      return;
    }

    if (appointmentConflict(payload)) {
      showToast("Ese especialista ya tiene una cita en ese horario");
      return;
    }

    state.appointments.unshift({
      id: nextId("CIT", state.appointments),
      ...payload
    });
    selectedAgendaDate = payload.date;
    prefill = {};
    persistAndRender("Cita guardada en agenda");
  };

  // Solo los pasos que tienen sentido desde el estado actual. Antes se
  // mostraban los cuatro siempre: en una cita ya cancelada, "Confirmar" e
  // "Iniciar" seguian ahi, y una fila con cuatro botones repetida veinte
  // veces era la mitad del ruido de la pantalla.
  const nextActions = {
    Pendiente: [
      ["data-confirm-appointment", "Confirmar", ""],
      ["data-cancel-appointment", "Cancelar", " is-muted"]
    ],
    Confirmada: [
      ["data-start-appointment", "Iniciar", ""],
      ["data-cancel-appointment", "Cancelar", " is-muted"]
    ],
    "En curso": [["data-complete-appointment", "Marcar atendida", ""]],
    Atendida: [],
    Cancelada: [["data-confirm-appointment", "Reactivar", " is-muted"]]
  };

  function appointmentActions(appointment) {
    const actions = nextActions[appointment.status] || nextActions.Pendiente;
    if (!actions.length) return '<span class="muted-cell">Cerrada</span>';
    return actions
      .map(
        ([attribute, label, extra]) =>
          `<button class="row-action${extra}" type="button" ${attribute}="${escapeHtml(appointment.id)}">${escapeHtml(label)}</button>`
      )
      .join("");
  }

  viewRenderers.citas = function (search) {
    const selectedClient = prefill.clientId || state.clients[0]?.id || "";
    const selectedProcedure = prefill.procedureId || state.procedures[0]?.id || "";
    const agendaSpecialists = typeof currentBranchSpecialists === "function" ? currentBranchSpecialists() : procedureSpecialists;
    const selectedSpecialist = prefill.specialist || agendaSpecialists[0]?.name || "";
    const selectedDay = selectedAgendaDate || todayISO();
    const defaultDuration = selectedProcedureDuration();
    const firstAvailableTime = availableSlots(selectedDay, selectedSpecialist, defaultDuration)[0] || "10:00";

    const rows = state.appointments
      .filter((appointment) =>
        matchesSearch(
          [
            clientName(appointment.clientId),
            procedureName(appointment.procedureId),
            appointment.specialist,
            appointment.status,
            appointment.notes || "",
            appointment.date,
            appointment.time
          ],
          search
        )
      )
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .map(
        (appointment) => `
          <tr data-appointment-row="${escapeHtml(appointment.id)}">
            <td>
              <div class="cell-title">
                <strong>${escapeHtml(clientName(appointment.clientId))}</strong>
                <span>${escapeHtml(procedureName(appointment.procedureId))}</span>
              </div>
            </td>
            <td>${escapeHtml(appointment.date)}<br />${escapeHtml(appointment.time)} - ${escapeHtml(appointmentEnd(appointment))}</td>
            <td>${escapeHtml(appointment.specialist)}<br /><span class="muted-cell">${escapeHtml(appointmentDuration(appointment))} mins</span></td>
            <td>${statusBadge(appointment.status)}</td>
            <td>${escapeHtml(appointment.notes || "Sin notas")}</td>
            <td>
              <div class="inline-actions">${appointmentActions(appointment)}</div>
            </td>
          </tr>
        `
      );

    const form = `
      <form class="data-form agenda-form" data-form="appointment" autocomplete="off">
        <div class="form-grid">
          ${selectField("Cliente", "clientId", clientOptions(selectedClient), selectedClient, "required")}
          ${selectField("Procedimiento", "procedureId", procedureOptions(selectedProcedure), selectedProcedure, "required")}
          ${inputField("Fecha", "date", "date", selectedDay, "required")}
          ${inputField("Hora", "time", "time", firstAvailableTime, "required")}
          ${selectField("Especialista", "specialist", specialistOptions(selectedSpecialist), selectedSpecialist, "required")}
          ${inputField("Duracion mins", "duration", "number", defaultDuration, "min='15' step='15' required")}
          ${selectField("Estado", "status", statusOptions("Pendiente"), "Pendiente", "required")}
          ${textareaField("Notas de la cita", "notes")}
        </div>
        <button class="primary-action" type="submit">Guardar cita</button>
      </form>
    `;

    return renderLayout(
      moduleMetrics("citas"),
      "Nueva cita",
      form,
      "Agenda operativa",
      `${renderAppointmentAgenda()}${renderTable(["Cliente", "Horario", "Especialista", "Estado", "Notas", "Acciones"], rows)}`
    );
  };

  function fillAgendaSlot(button) {
    // El formulario vive en el panel lateral desde el rediseno. Si esta
    // cerrado hay que abrirlo, o el horario se cargaria en un formulario
    // que nadie ve.
    if (typeof openDrawer === "function" && !document.body.classList.contains("drawer-open")) {
      openDrawer(button);
    }

    const form = document.querySelector(".agenda-form");
    if (!form) return;
    const timeInput = form.querySelector('[name="time"]');
    const specialistInput = form.querySelector('[name="specialist"]');
    const dateInput = form.querySelector('[name="date"]');
    if (timeInput) timeInput.value = button.dataset.agendaSlot;
    if (specialistInput) specialistInput.value = button.dataset.agendaSpecialist;
    if (dateInput) dateInput.value = selectedAgendaDate || todayISO();
    form.querySelector('[name="clientId"]')?.focus();
  }

  function highlightAppointmentRow(appointmentId) {
    const row = document.querySelector(`tr[data-appointment-row="${appointmentId}"]`);
    if (!row) return;
    document.querySelectorAll("[data-appointment-row].is-highlighted").forEach((item) => {
      item.classList.remove("is-highlighted");
    });
    row.classList.add("is-highlighted");
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  document.addEventListener(
    "click",
    (event) => {
      const shiftButton = event.target.closest("[data-agenda-shift]");
      const todayButton = event.target.closest("[data-agenda-today]");
      const dateButton = event.target.closest("[data-agenda-date]");
      const slotButton = event.target.closest("[data-agenda-slot]");
      const blockButton = event.target.closest("[data-agenda-appointment]");
      const cancelButton = event.target.closest("[data-cancel-appointment]");

      if (shiftButton) {
        event.preventDefault();
        selectedAgendaDate = addDays(selectedAgendaDate || todayISO(), Number(shiftButton.dataset.agendaShift));
        renderView();
        return;
      }

      if (dateButton) {
        event.preventDefault();
        selectedAgendaDate = dateButton.dataset.agendaDate;
        renderView();
        return;
      }

      // Al tocar una cita se resalta su fila en la tabla de abajo, que es
      // donde viven las acciones. Asi la rejilla explica y la tabla opera,
      // en vez de repetir los mismos botones en dos sitios.
      if (blockButton) {
        event.preventDefault();
        highlightAppointmentRow(blockButton.dataset.agendaAppointment);
        return;
      }

      if (todayButton) {
        event.preventDefault();
        selectedAgendaDate = todayISO();
        renderView();
        return;
      }

      if (slotButton) {
        event.preventDefault();
        fillAgendaSlot(slotButton);
        showToast("Horario cargado en la nueva cita");
        return;
      }

      if (cancelButton) {
        event.preventDefault();
        updateAppointmentStatus(cancelButton.dataset.cancelAppointment, "Cancelada");
      }
    },
    true
  );

  document.addEventListener("change", (event) => {
    const jumpInput = event.target.closest("[data-agenda-jump]");
    if (jumpInput?.value) {
      selectedAgendaDate = jumpInput.value;
      renderView();
      return;
    }

    const procedureInput = event.target.closest('.agenda-form [name="procedureId"]');
    if (!procedureInput) return;
    const form = procedureInput.closest(".agenda-form");
    const durationInput = form.querySelector('[name="duration"]');
    const procedure = getProcedure(procedureInput.value);
    if (durationInput && procedure?.duration) durationInput.value = procedure.duration;
  });

  // Este bloque se inyecta despues de styles.css, asi que gana el desempate
  // por orden. Todo lo de aqui usa tokens: de lo contrario el tema oscuro
  // -que solo vive en styles.css- no llegaria nunca a la agenda.
  const style = document.createElement("style");
  style.textContent = `
    .agenda {
      display: grid;
      gap: 12px;
      margin-bottom: 14px;
      padding: 14px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
    }

    .agenda-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }

    .agenda-nav {
      display: inline-flex;
      gap: 4px;
    }

    .agenda-step {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      color: var(--ink-2);
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      transition: background 150ms ease, color 150ms ease, transform 140ms var(--ease-out);
    }

    .agenda-step svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .agenda-step:active,
    .agenda-day-chip:active {
      transform: scale(0.96);
    }

    .agenda-heading {
      display: grid;
      flex: 1 1 200px;
      gap: 1px;
      min-width: 0;
    }

    .agenda-heading strong {
      color: var(--ink);
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .agenda-heading span {
      color: var(--ink-3);
      font-size: 12.5px;
    }

    .agenda-bar-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .agenda-jump input {
      height: 32px;
      padding: 0 8px;
      color: var(--ink-2);
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      font-size: 12.5px;
    }

    .agenda-week {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 6px;
    }

    .agenda-day-chip {
      display: grid;
      gap: 1px;
      padding: 7px 4px;
      color: var(--ink-2);
      background: var(--surface-2);
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      text-align: center;
      transition: background 150ms ease, color 150ms ease, transform 140ms var(--ease-out);
    }

    .agenda-day-name {
      color: var(--ink-3);
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .agenda-day-number {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }

    .agenda-day-count {
      color: var(--ink-3);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .agenda-day-chip.is-today {
      border-color: var(--line-strong);
    }

    .agenda-day-chip.is-selected {
      color: var(--on-brand);
      background: var(--brand);
      border-color: var(--brand);
    }

    .agenda-day-chip.is-selected .agenda-day-name,
    .agenda-day-chip.is-selected .agenda-day-count {
      color: inherit;
      opacity: 0.72;
    }

    .agenda-grid-scroll {
      overflow-x: auto;
      overscroll-behavior-x: contain;
    }

    .agenda-grid {
      display: grid;
      min-width: 100%;
      background: var(--surface);
    }

    .agenda-grid-corner,
    .agenda-grid-head {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--surface);
      border-bottom: 1px solid var(--line-strong);
    }

    .agenda-grid-head {
      display: grid;
      gap: 1px;
      padding: 6px 8px;
      min-width: 0;
    }

    .agenda-grid-head strong {
      color: var(--ink);
      font-size: 12.5px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .agenda-grid-head span {
      color: var(--ink-3);
      font-size: 11px;
    }

    .agenda-grid-time {
      padding-right: 8px;
      color: var(--ink-3);
      border-top: 1px solid transparent;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    .agenda-grid-time.is-hour {
      border-top-color: var(--line);
      color: var(--ink-2);
    }

    .agenda-free {
      margin: 1px;
      color: transparent;
      background: var(--surface-2);
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      font-size: 15px;
      line-height: 1;
      transition: background 130ms ease, color 130ms ease;
    }

    @media (hover: hover) and (pointer: fine) {
      .agenda-free:hover {
        color: var(--ink-2);
        background: var(--surface-3);
      }

      .agenda-step:hover,
      .agenda-day-chip:hover:not(.is-selected) {
        color: var(--ink);
        background: var(--surface-3);
      }
    }

    .agenda-free:focus-visible {
      color: var(--ink-2);
    }

    .agenda-block {
      display: grid;
      align-content: start;
      gap: 1px;
      margin: 1px;
      padding: 5px 8px;
      min-width: 0;
      overflow: hidden;
      color: var(--ink);
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-left: 3px solid var(--ink-3);
      border-radius: var(--radius-sm);
      text-align: left;
      transition: transform 140ms var(--ease-out), box-shadow 140ms ease;
    }

    .agenda-block:active {
      transform: scale(0.985);
    }

    @media (hover: hover) and (pointer: fine) {
      .agenda-block:hover {
        box-shadow: var(--shadow-2);
      }
    }

    .agenda-block-time {
      color: var(--ink-3);
      font-size: 10.5px;
      font-variant-numeric: tabular-nums;
    }

    .agenda-block-client {
      font-size: 12.5px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .agenda-block-service {
      color: var(--ink-3);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .agenda-block.is-pendiente { border-left-color: var(--warn); background: var(--warn-soft); }
    .agenda-block.is-confirmada { border-left-color: var(--accent); background: var(--accent-soft); }
    .agenda-block.is-curso { border-left-color: var(--ok); background: var(--ok-soft); }
    .agenda-block.is-atendida { border-left-color: var(--line-strong); background: var(--surface-2); }
    .agenda-block.is-cancelada { border-left-color: var(--crit); background: var(--crit-soft); }

    .agenda-block.is-cancelada .agenda-block-client {
      text-decoration: line-through;
    }

    .agenda-legend {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 14px;
      color: var(--ink-3);
      font-size: 11.5px;
    }

    .agenda-legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .agenda-legend i {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      border-left: 3px solid var(--ink-3);
      background: var(--surface-2);
    }

    .agenda-legend i.is-pendiente { border-left-color: var(--warn); background: var(--warn-soft); }
    .agenda-legend i.is-confirmada { border-left-color: var(--accent); background: var(--accent-soft); }
    .agenda-legend i.is-curso { border-left-color: var(--ok); background: var(--ok-soft); }
    .agenda-legend i.is-atendida { border-left-color: var(--line-strong); }
    .agenda-legend i.is-cancelada { border-left-color: var(--crit); background: var(--crit-soft); }

    .agenda-legend-hint {
      margin-left: auto;
    }

    .agenda-unplaced {
      display: grid;
      gap: 8px;
      padding: 10px;
      background: var(--warn-soft);
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
    }

    .agenda-unplaced > strong {
      color: var(--ink);
      font-size: 12.5px;
    }

    .agenda-unplaced > span {
      color: var(--ink-2);
      font-size: 11.5px;
    }

    .agenda-unplaced-list {
      display: grid;
      gap: 6px;
    }

    .agenda-unplaced-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 9px;
      color: var(--ink);
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      text-align: left;
    }

    .agenda-unplaced-item span {
      flex: 1 1 auto;
      color: var(--ink-2);
      font-size: 12px;
      min-width: 0;
    }

    tr[data-appointment-row].is-highlighted > td {
      background: var(--accent-soft);
    }

    .muted-cell {
      color: var(--ink-3);
      font-size: 12px;
    }

    /* Pulso del dia */
    .agenda-pulse {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 14px 0 4px;
    }
    .agenda-pulse-chip {
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 9px 12px;
      border: 1px solid var(--line);
      border-left: 3px solid var(--ink-3);
      border-radius: var(--radius-sm);
      background: var(--surface);
    }
    .agenda-pulse-chip.is-pendiente { border-left-color: var(--warn); }
    .agenda-pulse-chip.is-confirmada { border-left-color: var(--accent); }
    .agenda-pulse-chip.is-curso { border-left-color: var(--ok); }
    .agenda-pulse-chip.is-atendida { border-left-color: var(--line-strong); }
    .agenda-pulse-value {
      font-size: 19px;
      font-weight: 700;
      letter-spacing: -0.01em;
      font-variant-numeric: tabular-nums;
    }
    .agenda-pulse-label {
      font-size: 11.5px;
      color: var(--ink-3);
    }

    /* Linea de la hora actual sobre la rejilla */
    .agenda-now {
      position: relative;
      height: 0;
      border-top: 2px solid var(--crit);
      z-index: 3;
      pointer-events: none;
      align-self: start;
    }
    .agenda-now-dot {
      position: absolute;
      left: -5px;
      top: -5px;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--crit);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--crit) 25%, transparent);
    }

    /* Entrada escalonada de las citas al abrir el dia */
    @media (prefers-reduced-motion: no-preference) {
      .agenda-block {
        animation: agendaBlockRise 320ms var(--ease-out) both;
      }
      @keyframes agendaBlockRise {
        from { opacity: 0; transform: translateY(6px) scale(0.99); }
        to { opacity: 1; transform: none; }
      }
    }

    @media (max-width: 720px) {
      .agenda-legend-hint {
        margin-left: 0;
      }

      .agenda-day-count {
        display: none;
      }

      .agenda-pulse {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;
  document.head.appendChild(style);
})();
