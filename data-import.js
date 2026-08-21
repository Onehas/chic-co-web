// Importar datos desde un archivo CSV: clientes, inventario (productos) y
// servicios (procedimientos). Migrar de otro sistema o de un Excel sin teclear
// a mano: se descarga la plantilla, se llena, se arrastra el archivo, se ve un
// resumen y se importa a la sucursal activa. Deduplica para que reimportar el
// mismo archivo no cree copias.

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

  function cleanDate(value) {
    const match = String(value || "").trim().match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    // dd/mm/yyyy
    const alt = String(value || "").trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (alt) return `${alt[3]}-${String(alt[2]).padStart(2, "0")}-${String(alt[1]).padStart(2, "0")}`;
    return "";
  }

  function toNumber(value) {
    // Acepta "12 000", "12.000", "12,50", "CRC 12000", "₡12000".
    const clean = String(value ?? "")
      .replace(/[^\d.,-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "") // punto de miles
      .replace(",", ".");
    const n = Number(clean);
    return Number.isFinite(n) ? n : 0;
  }

  function lower(value) {
    return String(value || "").trim().toLowerCase();
  }

  // Busca la ubicacion del inventario por nombre ("Bodega principal" -> id).
  function locationIdByName(name) {
    const want = lower(name);
    if (!want) return "";
    const list = Array.isArray(state.locations) ? state.locations : [];
    return list.find((loc) => lower(loc.name) === want)?.id || "";
  }

  /* -------------------------------------------------------------------
   * Que se puede importar. Cada tipo define sus columnas (con alias en
   * espanol e ingles), como se convierte una fila en registro, la clave
   * para no duplicar, y la plantilla de ejemplo.
   * ---------------------------------------------------------------- */
  const TYPES = {
    clientes: {
      title: "Importar clientes",
      sub: "Se agregan a la sucursal activa. Reimportar no duplica: se salta a quien ya tenga el mismo telefono.",
      module: "clientes",
      collection: "clients",
      idPrefix: "CL",
      noun: ["cliente", "clientes"],
      columnsHint: "Columnas: nombre, telefono, correo, cumpleaños, puntos, saldo, notas",
      templateName: "plantilla-clientes-chic-co.csv",
      templateHeaders: ["nombre", "telefono", "correo", "cumpleaños", "puntos", "saldo", "notas"],
      templateRows: [
        ["Maria Perez", "88887777", "maria@correo.com", "1990-06-18", "120", "5000", "Clienta frecuente"],
        ["Ana Rodriguez", "70001234", "", "", "0", "0", ""]
      ],
      headerMap: {
        name: ["name", "nombre", "nombrecliente", "cliente"],
        phone: ["phone", "telefono", "teléfono", "tel", "celular"],
        email: ["email", "correo", "correoelectronico", "mail"],
        birthday: ["birthday", "cumpleaños", "cumpleanos", "cumple", "nacimiento", "fechanacimiento"],
        points: ["points", "puntos", "puntosobtenidos"],
        creditBalance: ["creditbalance", "saldo", "saldocredito", "credito", "saldofavor"],
        notes: ["notes", "notas", "nota", "observaciones"]
      },
      toRecord(rec) {
        const name = (rec.name || "").replace(/\s+/g, " ").trim();
        if (!name) return null;
        return {
          name,
          phone: String(rec.phone || "").replace(/\D/g, ""),
          email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lower(rec.email)) ? lower(rec.email) : "",
          birthday: cleanDate(rec.birthday),
          points: toNumber(rec.points),
          creditBalance: toNumber(rec.creditBalance),
          notes: rec.notes || ""
        };
      },
      // Varias claves por registro: coincide si repite el telefono O el mismo
      // nombre+correo. Asi la misma persona con y sin telefono no entra doble.
      dedupeKeys(r) {
        const keys = [];
        const phone = String(r.phone || "").replace(/\D/g, "");
        if (phone) keys.push("tel:" + phone);
        keys.push("nm:" + lower(r.name) + "|" + lower(r.email));
        return keys;
      },
      stats(nuevos) {
        return [
          [nuevos.filter((r) => r.email).length, "con correo"],
          [nuevos.filter((r) => r.birthday).length, "con cumpleaños"]
        ];
      },
      build(r, today) {
        return {
          id: nextId("CL", state.clients),
          name: r.name,
          phone: r.phone,
          email: r.email,
          birthday: r.birthday,
          points: r.points,
          creditBalance: r.creditBalance,
          lastVisit: today,
          notes: r.notes || ""
        };
      }
    },

    inventario: {
      title: "Importar inventario",
      sub: "Se agregan a la sucursal activa. Reimportar no duplica: se salta lo que ya exista con el mismo codigo de barras o nombre.",
      module: "inventario",
      collection: "products",
      idPrefix: "PRD",
      noun: ["producto", "productos"],
      columnsHint: "Columnas: producto, categoria, stock, minimo, unidad, costo, precio, proveedor, ubicacion, lugar, codigo de barras",
      templateName: "plantilla-inventario-chic-co.csv",
      templateHeaders: ["producto", "categoria", "stock", "minimo", "unidad", "costo", "precio", "proveedor", "ubicacion", "lugar", "codigo de barras"],
      templateRows: [
        ["Peroxido 20 vol.", "Quimicos", "6", "2", "botellas", "4500", "8000", "Distribuidora Belleza", "Bodega principal", "Estante A-3", "7501234567890"],
        ["Serum vitamina C", "Facial", "8", "3", "frascos", "9000", "19000", "DermaCR", "", "", ""]
      ],
      headerMap: {
        name: ["name", "producto", "nombre", "articulo", "artículo", "item"],
        category: ["category", "categoria", "categoría", "tipo"],
        stock: ["stock", "existencias", "cantidad", "inventario"],
        min: ["min", "minimo", "mínimo", "stockminimo", "stock minimo"],
        unit: ["unit", "unidad", "unidades", "presentacion", "presentación"],
        cost: ["cost", "costo", "costounitario"],
        price: ["price", "precio", "precioventa", "precio venta"],
        supplier: ["supplier", "proveedor", "distribuidor"],
        location: ["location", "ubicacion", "ubicación", "bodega"],
        spot: ["spot", "lugar", "detalle", "detallelugar", "estante"],
        barcode: ["barcode", "codigo", "código", "codigodebarras", "codigo de barras", "código de barras", "codigobarras", "ean", "upc"]
      },
      toRecord(rec) {
        const name = (rec.name || "").replace(/\s+/g, " ").trim();
        if (!name) return null;
        return {
          name,
          category: (rec.category || "").trim() || "General",
          stock: toNumber(rec.stock),
          min: toNumber(rec.min),
          unit: (rec.unit || "").trim() || "unidades",
          cost: toNumber(rec.cost),
          price: toNumber(rec.price),
          supplier: (rec.supplier || "").trim(),
          location: (rec.location || "").trim(),
          spot: (rec.spot || "").trim(),
          barcode: String(rec.barcode || "").replace(/\s+/g, "").trim()
        };
      },
      // Coincide por codigo de barras O por nombre: el mismo producto con y
      // sin codigo no entra doble.
      dedupeKeys(r) {
        const keys = ["nm:" + lower(r.name)];
        if (r.barcode) keys.push("bc:" + r.barcode);
        return keys;
      },
      stats(nuevos) {
        return [
          [nuevos.filter((r) => r.barcode).length, "con codigo de barras"],
          [nuevos.filter((r) => toNumber(r.stock) <= toNumber(r.min)).length, "bajo minimo"]
        ];
      },
      build(r) {
        return {
          id: nextId("PRD", state.products),
          name: r.name,
          category: r.category,
          stock: r.stock,
          min: r.min,
          unit: r.unit,
          cost: r.cost,
          price: r.price,
          supplier: r.supplier,
          imageId: "",
          locationId: locationIdByName(r.location),
          spot: r.spot,
          barcode: r.barcode
        };
      }
    },

    servicios: {
      title: "Importar servicios",
      sub: "Se agregan a la sucursal activa. Reimportar no duplica: se salta el servicio que ya exista con el mismo nombre.",
      module: "procedimientos",
      collection: "procedures",
      idPrefix: "SRV",
      noun: ["servicio", "servicios"],
      columnsHint: "Columnas: servicio, categoria, duracion, precio, sesiones, cuidados",
      templateName: "plantilla-servicios-chic-co.csv",
      templateHeaders: ["servicio", "categoria", "duracion", "precio", "sesiones", "cuidados"],
      templateRows: [
        ["Limpieza facial profunda", "Facial", "75", "26000", "1", "No exponerse al sol por 24 horas"],
        ["Corte y estilo", "Cabello", "60", "18000", "1", ""],
        ["Manicure semipermanente", "Unas", "60", "14000", "1", ""]
      ],
      headerMap: {
        name: ["name", "servicio", "nombre", "procedimiento", "tratamiento"],
        category: ["category", "categoria", "categoría", "area", "área", "tipo"],
        duration: ["duration", "duracion", "duración", "minutos", "min", "tiempo"],
        price: ["price", "precio", "precioventa", "tarifa"],
        sessions: ["sessions", "sesiones", "numerosesiones", "sesion"],
        aftercare: ["aftercare", "cuidados", "cuidadosposteriores", "indicaciones", "notas"]
      },
      toRecord(rec) {
        const name = (rec.name || "").replace(/\s+/g, " ").trim();
        if (!name) return null;
        return {
          name,
          category: (rec.category || "").trim() || "General",
          duration: Math.max(5, toNumber(rec.duration) || 60),
          price: toNumber(rec.price),
          sessions: Math.max(1, toNumber(rec.sessions) || 1),
          aftercare: (rec.aftercare || "").trim()
        };
      },
      dedupeKeys(r) {
        return ["nm:" + lower(r.name)];
      },
      stats(nuevos) {
        const categorias = new Set(nuevos.map((r) => lower(r.category)).filter(Boolean));
        return [
          [categorias.size, "categorias"],
          [nuevos.filter((r) => r.sessions > 1).length, "de varias sesiones"]
        ];
      },
      build(r) {
        return {
          id: nextId("SRV", state.procedures),
          name: r.name,
          category: r.category,
          duration: r.duration,
          price: r.price,
          sessions: r.sessions,
          productId: "",
          aftercare: r.aftercare
        };
      }
    }
  };

  let current = TYPES.clientes;
  let parsed = { records: [] };
  let modal = null;
  let lastFocus = null;

  function normalizeKey(header) {
    const clean = lower(header);
    for (const [field, aliases] of Object.entries(current.headerMap)) {
      if (aliases.includes(clean)) return field;
    }
    return null;
  }

  function toRecords(rows) {
    if (!rows.length) return { records: [] };
    const header = rows[0].map(normalizeKey);
    const records = [];
    for (let r = 1; r < rows.length; r += 1) {
      const cells = rows[r];
      const rec = {};
      header.forEach((field, c) => {
        if (field) rec[field] = String(cells[c] ?? "").trim();
      });
      const record = current.toRecord(rec);
      if (record) records.push(record);
    }
    return { records };
  }

  function build() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "import-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <section class="import-card" role="dialog" aria-modal="true" aria-labelledby="importTitle">
        <div class="import-head">
          <div>
            <h2 id="importTitle">Importar</h2>
            <p class="import-sub" data-import-sub></p>
          </div>
          <button class="import-close" type="button" data-import-cancel aria-label="Cerrar">&times;</button>
        </div>

        <label class="import-drop" data-import-drop>
          <input type="file" accept=".csv,text/csv" data-import-file hidden />
          <span class="import-drop-icon" aria-hidden="true">⬆</span>
          <span class="import-drop-text">Arrastra un archivo CSV aqui o haz clic para elegirlo</span>
          <span class="import-drop-hint" data-import-hint></span>
        </label>

        <p class="import-template-row">
          ¿No tienes el archivo listo?
          <button type="button" class="import-template-link" data-import-template>Descargar plantilla</button>
          <span class="import-template-hint">Abrela en Excel, llena tus datos y guardala como CSV.</span>
        </p>

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
      if (event.target.closest("[data-import-template]")) {
        event.preventDefault();
        downloadTemplate();
      }
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

  function existingKeys() {
    const set = new Set();
    (state[current.collection] || []).forEach((item) => {
      current.dedupeKeys(item).forEach((key) => set.add(key));
    });
    return set;
  }

  function renderPreview() {
    const box = modal.querySelector("[data-import-preview]");
    const go = modal.querySelector("[data-import-go]");
    if (!parsed.records.length) {
      box.hidden = false;
      box.innerHTML = `<p class="import-empty">No se encontraron ${current.noun[1]} en el archivo. Revisa que tenga una fila de encabezado con al menos "${current.templateHeaders[0]}".</p>`;
      go.disabled = true;
      return;
    }
    const keys = existingKeys();
    const seenInFile = new Set();
    const nuevos = parsed.records.filter((r) => {
      const recordKeys = current.dedupeKeys(r);
      if (recordKeys.some((key) => keys.has(key) || seenInFile.has(key))) return false;
      recordKeys.forEach((key) => seenInFile.add(key));
      return true;
    });
    const repetidos = parsed.records.length - nuevos.length;
    const extra = current.stats(nuevos);
    modal.__toImport = nuevos;
    box.hidden = false;
    box.innerHTML = `
      <div class="import-stats">
        <div class="import-stat"><strong>${nuevos.length}</strong><span>a importar</span></div>
        <div class="import-stat"><strong>${repetidos}</strong><span>ya existen (se saltan)</span></div>
        ${extra
          .map(([value, label]) => `<div class="import-stat"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`)
          .join("")}
      </div>
      <p class="import-target">Se agregaran a la sucursal <strong>${escapeHtml(branchLabelText())}</strong>.</p>
    `;
    go.disabled = nuevos.length === 0;
    go.textContent = `Importar ${nuevos.length} ${nuevos.length === 1 ? current.noun[0] : current.noun[1]}`;
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
    // Se agregan en bloque con un solo guardado, para no re-renderizar mil veces.
    const today = typeof todayISO === "function" ? todayISO() : new Date().toISOString().slice(0, 10);
    const list = state[current.collection];
    nuevos.forEach((r) => {
      list.unshift(current.build(r, today));
    });
    if (typeof persistAndRender === "function") {
      persistAndRender(`${nuevos.length} ${nuevos.length === 1 ? current.noun[0] : current.noun[1]} importados`);
    }
    close();
  }

  // Plantilla lista para llenar: los mismos encabezados que el importador
  // entiende, con filas de ejemplo para que se vea el formato. Se descarga con
  // BOM para que Excel respete los acentos.
  function downloadTemplate() {
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [current.templateHeaders, ...current.templateRows]
      .map((row) => row.map(quote).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = current.templateName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (typeof showToast === "function") showToast("Plantilla descargada. Llenala y vuelve a importarla.");
  }

  function open(typeName) {
    current = TYPES[typeName] || TYPES.clientes;
    build();
    parsed = { records: [] };
    modal.__toImport = [];
    modal.querySelector("#importTitle").textContent = current.title;
    modal.querySelector("[data-import-sub]").textContent = current.sub;
    modal.querySelector("[data-import-hint]").textContent = current.columnsHint;
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

  window.openDataImport = open;
  // Compatibilidad: el boton de clientes ya llamaba a esta funcion.
  window.openClientImport = () => open("clientes");

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
    .import-template-row { margin: 0; font-size: 12px; color: var(--ink-3); display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
    .import-template-link { border: none; background: none; padding: 0; color: var(--accent); font-weight: 600; font-size: 12px; cursor: pointer; text-decoration: underline; }
    .import-template-link:hover { opacity: .8; }
    .import-template-hint { flex-basis: 100%; color: var(--ink-3); font-size: 11px; }
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
