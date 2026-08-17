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

  function renderAppointmentAgenda() {
    const selectedDay = selectedAgendaDate || todayISO();
    const selectedDate = new Date(`${selectedDay}T00:00:00`);
    const scheduleCounts = {};
    const addCount = (dateValue) => {
      if (!dateValue) return;
      scheduleCounts[dateValue] = (scheduleCounts[dateValue] || 0) + 1;
    };

    state.appointments.filter(isOpenAppointment).forEach((appointment) => addCount(appointment.date));
    state.activeProcedures.forEach((procedure) => addCount(procedure.next));
    state.plans.forEach((plan) => addCount(plan.next));

    const days = agendaMonthDays(selectedDate)
      .map(({ date, inMonth }) => {
        const dayISO = dateToISO(date);
        const count = scheduleCounts[dayISO] || 0;
        const className = [
          "agenda-day",
          inMonth ? "" : "is-muted",
          dayISO === selectedDay ? "is-selected" : "",
          count ? "has-appointments" : ""
        ]
          .filter(Boolean)
          .join(" ");
        return `<button class="${className}" type="button" data-agenda-date="${escapeHtml(dayISO)}" aria-pressed="${
          dayISO === selectedDay
        }"><span>${escapeHtml(date.getDate())}</span>${count ? `<small>${escapeHtml(count)}</small>` : ""}</button>`;
      })
      .join("");

    const selectedAppointments = appointmentsForDay(selectedDay);
    const timelineItems = selectedAppointments.length
      ? selectedAppointments
          .map(
            (appointment) => `
              <article class="agenda-event-card">
                <div>
                  <strong>${escapeHtml(appointment.time)} - ${escapeHtml(appointmentEnd(appointment))}</strong>
                  <span>${escapeHtml(clientName(appointment.clientId))} | ${escapeHtml(procedureName(appointment.procedureId))}</span>
                  <small>${escapeHtml(appointment.specialist)}${appointment.notes ? ` | ${escapeHtml(appointment.notes)}` : ""}</small>
                </div>
                ${statusBadge(appointment.status)}
              </article>
            `
          )
          .join("")
      : `<div class="empty-state">No hay citas registradas para este dia.</div>`;

    const agendaSpecialists = typeof currentBranchSpecialists === "function" ? currentBranchSpecialists() : procedureSpecialists;
    const availability = agendaSpecialists
      .map((specialist) => {
        const booked = selectedAppointments.filter(
          (appointment) => normalize(appointment.specialist) === normalize(specialist.name) && isOpenAppointment(appointment)
        );
        const slots = slotStates(selectedDay, specialist.name, 60);
        return `
          <article class="agenda-availability-card">
            <div>
              <strong>${escapeHtml(specialist.name)}</strong>
              <span>${escapeHtml(specialist.focus)} | ${escapeHtml(booked.length)} citas</span>
            </div>
            <div class="agenda-slot-row">
              ${
                slots.length
                  ? slots
                      .map(
                        (slot) =>
                          `<button class="${slot.busy ? "is-busy" : "is-free"}" type="button" data-agenda-slot="${escapeHtml(
                            slot.time
                          )}" data-agenda-specialist="${escapeHtml(
                            specialist.name
                          )}" ${slot.busy ? 'disabled aria-disabled="true" title="Horario ocupado"' : ""}>${escapeHtml(
                            slot.time
                          )}</button>`
                      )
                      .join("")
                  : `<span class="agenda-full">Sin cupos</span>`
              }
            </div>
          </article>
        `;
      })
      .join("");

    const selectedTitle = `${weekdayNames[selectedDate.getDay()]}, ${selectedDate.getDate()} de ${monthNames[
      selectedDate.getMonth()
    ].toLowerCase()}`;
    const monthTitle = `${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;

    return `
      <div class="agenda-board agenda-board-upgraded">
        <section class="agenda-calendar" aria-label="Calendario de citas">
          <div class="agenda-calendar-top">
            <strong>${escapeHtml(selectedTitle)}</strong>
            <button class="agenda-today-button" type="button" data-agenda-today>Hoy</button>
          </div>
          <div class="agenda-month-row">
            <h4>${escapeHtml(monthTitle)}</h4>
            <div class="agenda-month-controls">
              <button type="button" data-agenda-shift="-1" aria-label="Mes anterior">^</button>
              <button type="button" data-agenda-shift="1" aria-label="Mes siguiente">v</button>
            </div>
          </div>
          <div class="agenda-weekdays">
            ${weekdayShortNames.map((day) => `<span>${escapeHtml(day)}</span>`).join("")}
          </div>
          <div class="agenda-days">${days}</div>
        </section>

        <section class="agenda-day-panel">
          <div class="agenda-today-head">
            <strong>Agenda del dia</strong>
            <span>${escapeHtml(selectedAppointments.length)} citas | ${escapeHtml(selectedDay)}</span>
          </div>
          <div class="agenda-timeline">${timelineItems}</div>
        </section>
      </div>

      <section class="agenda-availability">
        <div class="agenda-today-head">
          <strong>Disponibilidad por especialista</strong>
          <span>${escapeHtml(agendaSpecialists.length)} personas | cupos de 60 mins</span>
        </div>
        <div class="agenda-availability-grid">${availability}</div>
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
          <tr>
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
              <div class="inline-actions">
                <button class="row-action" type="button" data-confirm-appointment="${appointment.id}">Confirmar</button>
                <button class="row-action is-muted" type="button" data-start-appointment="${appointment.id}">Iniciar</button>
                <button class="row-action is-warning" type="button" data-complete-appointment="${appointment.id}">Atendida</button>
                <button class="row-action is-muted" type="button" data-cancel-appointment="${appointment.id}">Cancelar</button>
              </div>
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
    const form = document.querySelector(".agenda-form");
    if (!form) return;
    const timeInput = form.querySelector('[name="time"]');
    const specialistInput = form.querySelector('[name="specialist"]');
    const dateInput = form.querySelector('[name="date"]');
    if (timeInput) timeInput.value = button.dataset.agendaSlot;
    if (specialistInput) specialistInput.value = button.dataset.agendaSpecialist;
    if (dateInput) dateInput.value = selectedAgendaDate || todayISO();
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  document.addEventListener(
    "click",
    (event) => {
      const shiftButton = event.target.closest("[data-agenda-shift]");
      const todayButton = event.target.closest("[data-agenda-today]");
      const slotButton = event.target.closest("[data-agenda-slot]");
      const cancelButton = event.target.closest("[data-cancel-appointment]");

      if (shiftButton) {
        event.preventDefault();
        selectedAgendaDate = addMonths(selectedAgendaDate || todayISO(), Number(shiftButton.dataset.agendaShift));
        renderView();
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
    const procedureInput = event.target.closest('.agenda-form [name="procedureId"]');
    if (!procedureInput) return;
    const form = procedureInput.closest(".agenda-form");
    const durationInput = form.querySelector('[name="duration"]');
    const procedure = getProcedure(procedureInput.value);
    if (durationInput && procedure?.duration) durationInput.value = procedure.duration;
  });

  const style = document.createElement("style");
  style.textContent = `
    .agenda-board-upgraded {
      grid-template-columns: minmax(320px, 420px) minmax(320px, 1fr);
    }

    .agenda-month-controls {
      display: inline-flex;
      gap: 8px;
    }

    .agenda-month-controls button,
    .agenda-today-button,
    .agenda-slot-row button {
      min-height: 28px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
      border-radius: var(--radius);
      font-size: 12px;
      font-weight: 900;
    }

    .agenda-month-controls button {
      min-width: 34px;
    }

    .agenda-today-button {
      padding: 0 10px;
    }

    .agenda-day-panel,
    .agenda-availability {
      display: grid;
      gap: 12px;
      padding: 14px;
      border: 1px solid rgba(36, 49, 50, 0.08);
      background: #fff;
      border-radius: var(--radius);
    }

    .agenda-timeline,
    .agenda-availability-grid {
      display: grid;
      gap: 8px;
      max-height: 430px;
      overflow: auto;
      padding-right: 2px;
    }

    .agenda-event-card,
    .agenda-availability-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
      padding: 10px;
      border: 1px solid rgba(36, 49, 50, 0.07);
      background: #f7faf9;
      border-radius: var(--radius);
    }

    .agenda-event-card div,
    .agenda-availability-card div:first-child {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    .agenda-event-card strong,
    .agenda-availability-card strong {
      color: var(--ink);
      font-size: 13px;
    }

    .agenda-event-card span,
    .agenda-event-card small,
    .agenda-availability-card span,
    .muted-cell {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.25;
    }

    .agenda-availability {
      margin-top: 12px;
    }

    .agenda-availability-grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      max-height: 520px;
    }

    .agenda-slot-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
      max-height: 142px;
      overflow: auto;
    }

    .agenda-slot-row button {
      min-height: 26px;
      min-width: 58px;
      padding: 0 8px;
      opacity: 1;
    }

    .agenda-slot-row button.is-free {
      color: #315657;
      background: var(--mint-soft);
      border-color: rgba(95, 137, 134, 0.18);
    }

    .agenda-slot-row button.is-busy {
      color: #8d1e16;
      background: #ffe0dc;
      border-color: rgba(180, 47, 36, 0.34);
      cursor: not-allowed;
    }

    .agenda-full {
      color: var(--rose);
      font-size: 12px;
      font-weight: 900;
    }

    @media (max-width: 860px) {
      .agenda-board-upgraded {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
})();
