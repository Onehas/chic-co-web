// Importar clientes desde un archivo CSV. Migrar datos de otro sistema (o de un
// Excel exportado) sin teclear a mano: se arrastra el archivo, se ve un
// resumen y se importa a la sucursal activa. Deduplica por telefono para que
// reimportar no cree copias.

(function () {
  if (window.__chicDataImport) return;
  window.__chicDataImport = true;

  // --- Parser de CSV (comillas, comas dentro de comillas, saltos de linea) ---
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    let i = 0;
    const pushField = () => {
      row.push(field);
      field = "";
    };
    const pushRow = () => {
      rows.push(row);
      row = [];
    };
    const clean = String(text || "").replace(/^﻿/, ""); // quita BOM
    while (i < clean.length) {
      const c = clean[i];
      if (inQuotes) {
        if (c === '"') {
          if (clean[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        field += c;
        i += 1;
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (c === ",") {
        pushField();
        i += 1;
        continue;
      }
      if (c === "\r") {
        i += 1;
        continue;
      }
      if (c === "\n") {
        pushField();
        pushRow();
        i += 1;
        continue;
      }
      field += c;
      i += 1;
    }
    if (field.length || row.length) {
      pushField();
      pushRow();
    }
    return rows.filter((r) => r.some((cell) => String(cell).trim() !== ""));
  }

  // Acepta cabeceras en espanol o ingles.
  const HEADER_MAP = {
    name: ["name", "nombre", "nombrecliente", "cliente"],
    phone: ["phone", "telefono", "teléfono", "tel", "celular"],
    email: ["email", "correo", "correoelectronico", "mail"],
    birthday: ["birthday", "cumpleaños", "cumpleanos", "cumple", "nacimiento", "fechanacimiento"],
    points: ["points", "puntos", "puntosobtenidos"],
    creditBalance: ["creditbalance", "saldo", "saldocredito", "credito", "saldofavor"],
    notes: ["notes", "notas", "nota", "observaciones"]
  };

  function normalizeKey(header) {
    const clean = String(header || "").trim().toLowerCase();
    for (const [field, aliases] of Object.entries(HEADER_MAP)) {
      if (aliases.includes(clean)) return field;
    }
    return null;
  }

  function cleanDate(value) {
    const match = String(value || "").trim().match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    // dd/mm/yyyy
    const alt = String(value || "").trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (alt) return `${alt[3]}-${String(alt[2]).padStart(2, "0")}-${String(alt[1]).padStart(2, "0")}`;
    return "";
  }

  function toRecords(rows) {
    if (!rows.length) return { records: [], columns: [] };
    const header = rows[0].map(normalizeKey);
    const columns = header.filter(Boolean);
    const records = [];
    for (let r = 1; r < rows.length; r += 1) {
      const cells = rows[r];
      const rec = {};
      header.forEach((field, c) => {
        if (field) rec[field] = String(cells[c] ?? "").trim();
      });
      const name = (rec.name || "").replace(/\s+/g, " ").trim();
      if (!name) continue;
      records.push({
        name,
        phone: String(rec.phone || "").replace(/\D/g, ""),
        email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((rec.email || "").toLowerCase()) ? rec.email.toLowerCase() : "",
        birthday: cleanDate(rec.birthday),
        points: Number(rec.points || 0) || 0,
        creditBalance: Number(rec.creditBalance || 0) || 0,
        notes: rec.notes || ""
      });
    }
    return { records, columns };
  }

  let parsed = { records: [], columns: [] };
  let modal = null;
  let lastFocus = null;

  function build() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "import-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <section class="import-card" role="dialog" aria-modal="true" aria-labelledby="importTitle">
        <div class="import-head">
          <div>
            <h2 id="importTitle">Importar clientes</h2>
            <p class="import-sub">Se agregan a la sucursal activa. Reimportar no duplica: se salta a quien ya tenga el mismo telefono.</p>
          </div>
          <button class="import-close" type="button" data-import-cancel aria-label="Cerrar">&times;</button>
        </div>

        <label class="import-drop" data-import-drop>
          <input type="file" accept=".csv,text/csv" data-import-file hidden />
          <span class="import-drop-icon" aria-hidden="true">⬆</span>
          <span class="import-drop-text">Arrastra un archivo CSV aqui o haz clic para elegirlo</span>
          <span class="import-drop-hint">Columnas: nombre, telefono, correo, cumpleaños, puntos, saldo, notas</span>
        </label>

        <div class="import-preview" data-import-preview hidden></div>
        <p class="import-error" role="alert" aria-live="polite" data-import-error></p>

        <div class="import-actions">
          <button class="secondary-action" type="button" data-import-cancel>Cerrar</button>
          <button class="primary-action" type="button" data-import-go disabled>Importar</button>
        </div>
      </section>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-import-cancel]")) close();
      if (event.target.closest("[data-import-go]")) runImport();
    });
    const fileInput = modal.querySelector("[data-import-file]");
    fileInput.addEventListener("change", () => {
      if (fileInput.files?.[0]) readFile(fileInput.files[0]);
    });
    const drop = modal.querySelector("[data-import-drop]");
    drop.addEventListener("dragover", (event) => {
      event.preventDefault();
      drop.classList.add("is-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    drop.addEventListener("drop", (event) => {
      event.preventDefault();
      drop.classList.remove("is-over");
      const file = event.dataTransfer?.files?.[0];
      if (file) readFile(file);
    });
    return modal;
  }

  function readFile(file) {
    const error = modal.querySelector("[data-import-error]");
    error.textContent = "";
    const reader = new FileReader();
    reader.onload = () => {
      try {
        parsed = toRecords(parseCSV(reader.result));
        renderPreview();
      } catch (e) {
        error.textContent = "No se pudo leer el archivo. Asegurate de que sea un CSV.";
      }
    };
    reader.onerror = () => {
      error.textContent = "No se pudo leer el archivo.";
    };
    reader.readAsText(file, "utf-8");
  }

  // Clave para deduplicar: el telefono si existe; si no, nombre+correo. Asi un
  // cliente sin telefono tampoco se duplica al reimportar.
  function dedupeKey(client) {
    const phone = String(client.phone || "").replace(/\D/g, "");
    if (phone) return "tel:" + phone;
    return "nm:" + String(client.name || "").trim().toLowerCase() + "|" + String(client.email || "").trim().toLowerCase();
  }

  function existingKeys() {
    const set = new Set();
    (state.clients || []).forEach((client) => set.add(dedupeKey(client)));
    return set;
  }

  function renderPreview() {
    const box = modal.querySelector("[data-import-preview]");
    const go = modal.querySelector("[data-import-go]");
    if (!parsed.records.length) {
      box.hidden = false;
      box.innerHTML = `<p class="import-empty">No se encontraron clientes en el archivo. Revisa que tenga una fila de encabezado con al menos "nombre".</p>`;
      go.disabled = true;
      return;
    }
    const keys = existingKeys();
    const seenInFile = new Set();
    const nuevos = parsed.records.filter((r) => {
      const key = dedupeKey(r);
      if (keys.has(key) || seenInFile.has(key)) return false;
      seenInFile.add(key);
      return true;
    });
    const repetidos = parsed.records.length - nuevos.length;
    const conCorreo = nuevos.filter((r) => r.email).length;
    const conCumple = nuevos.filter((r) => r.birthday).length;
    modal.__toImport = nuevos;
    box.hidden = false;
    box.innerHTML = `
      <div class="import-stats">
        <div class="import-stat"><strong>${nuevos.length}</strong><span>a importar</span></div>
        <div class="import-stat"><strong>${repetidos}</strong><span>ya existen (se saltan)</span></div>
        <div class="import-stat"><strong>${conCorreo}</strong><span>con correo</span></div>
        <div class="import-stat"><strong>${conCumple}</strong><span>con cumpleaños</span></div>
      </div>
      <p class="import-target">Se agregaran a la sucursal <strong>${escapeHtml(branchLabelText())}</strong>.</p>
    `;
    go.disabled = nuevos.length === 0;
    go.textContent = `Importar ${nuevos.length} clientes`;
  }

  function branchLabelText() {
    const options = typeof branchOptions !== "undefined" ? branchOptions : [];
    return options.find?.((b) => b.id === state.currentBranchId)?.label || state.currentBranchId || "actual";
  }

  function runImport() {
    const nuevos = modal.__toImport || [];
    if (!nuevos.length) return;
    const go = modal.querySelector("[data-import-go]");
    go.disabled = true;
    go.textContent = "Importando...";
    // Se agregan en bloque con un solo guardado, para no re-renderizar mil
    // veces. nextId depende de la lista, asi que cada uno se agrega antes de
    // calcular el siguiente id (por eso el sufijo aleatorio garantiza unicidad).
    const today = typeof todayISO === "function" ? todayISO() : new Date().toISOString().slice(0, 10);
    const list = state.clients;
    nuevos.forEach((r) => {
      list.unshift({
        id: nextId("CL", list),
        name: r.name,
        phone: r.phone,
        email: r.email,
        birthday: r.birthday,
        points: Number(r.points || 0),
        creditBalance: Number(r.creditBalance || 0),
        lastVisit: today,
        notes: r.notes || ""
      });
    });
    if (typeof persistAndRender === "function") persistAndRender(`${nuevos.length} clientes importados`);
    close();
  }

  function open() {
    build();
    parsed = { records: [], columns: [] };
    modal.__toImport = [];
    modal.querySelector("[data-import-preview]").hidden = true;
    modal.querySelector("[data-import-error]").textContent = "";
    const go = modal.querySelector("[data-import-go]");
    go.disabled = true;
    go.textContent = "Importar";
    const fileInput = modal.querySelector("[data-import-file]");
    fileInput.value = "";
    lastFocus = document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.querySelectorAll(".topbar, .app-shell").forEach((region) => (region.inert = true));
    modal.querySelector("[data-import-drop]")?.focus?.();
  }

  function close() {
    if (!modal?.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.querySelectorAll(".topbar, .app-shell").forEach((region) => (region.inert = false));
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
    lastFocus = null;
  }

  window.openClientImport = open;

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal?.classList.contains("is-open")) {
      event.preventDefault();
      close();
    }
  });

  const style = document.createElement("style");
  style.textContent = `
    .import-modal { position: fixed; inset: 0; z-index: 65; display: none; place-items: center; padding: 20px; background: color-mix(in srgb, var(--ink) 45%, transparent); backdrop-filter: blur(3px); }
    .import-modal.is-open { display: grid; }
    .import-card { width: min(480px, 100%); max-height: 90vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 24px 60px -20px color-mix(in srgb, var(--ink) 55%, transparent); padding: 22px; display: flex; flex-direction: column; gap: 16px; transform: scale(0.97); opacity: 0; transition: transform .28s cubic-bezier(.23,1,.32,1), opacity .28s cubic-bezier(.23,1,.32,1); }
    .import-modal.is-open .import-card { transform: scale(1); opacity: 1; }
    .import-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .import-head h2 { margin: 0; font-size: 18px; }
    .import-sub { margin: 4px 0 0; color: var(--ink-3); font-size: 12.5px; }
    .import-close { border: none; background: none; color: var(--ink-3); font-size: 24px; line-height: 1; cursor: pointer; padding: 0 4px; }
    .import-drop { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 26px 18px; border: 1.5px dashed var(--line-strong); border-radius: 14px; background: var(--surface-2); cursor: pointer; transition: border-color .2s, background .2s; }
    .import-drop:hover, .import-drop.is-over { border-color: var(--accent); background: var(--accent-soft); }
    .import-drop:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .import-drop-icon { font-size: 22px; color: var(--ink-3); }
    .import-drop-text { font-weight: 600; font-size: 13.5px; }
    .import-drop-hint { color: var(--ink-3); font-size: 11.5px; }
    .import-stats { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; }
    .import-stat { border: 1px solid var(--line); border-radius: 10px; padding: 9px; text-align: center; }
    .import-stat strong { display: block; font-size: 18px; }
    .import-stat span { font-size: 10.5px; color: var(--ink-3); }
    .import-target { margin: 10px 0 0; font-size: 12.5px; color: var(--ink-2); }
    .import-empty { margin: 0; font-size: 12.5px; color: var(--ink-3); }
    .import-error { margin: 0; color: var(--crit); font-size: 12.5px; min-height: 1em; }
    .import-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .import-card button:active { transform: scale(.97); }
    .client-extras { color: var(--ink-3); font-size: 11.5px; }
    @media (max-width: 520px) { .import-stats { grid-template-columns: repeat(2, minmax(0,1fr)); } }
    @media (prefers-reduced-motion: reduce) { .import-card { transition: none; } .import-card button:active { transform: none; } }
  `;
  document.head.appendChild(style);
})();
