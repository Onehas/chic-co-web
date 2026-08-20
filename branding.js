// Identidad del negocio: nombre y logotipo, editables desde el sistema.
//
// El logo original del sistema estaba incrustado en el codigo (assets). Aqui se
// vuelve un dato: un super usuario sube el suyo y se aplica en la pantalla de
// acceso, la barra lateral, la barra superior y la pagina publica de reservas.
// El archivo vive en el almacen de imagenes; su id y el nombre viven en
// state.branding, que se sincroniza como parte del estado.

(function () {
  if (window.__chicBranding) return;
  window.__chicBranding = true;

  const DEFAULT_NAME = "Chic & Co";
  let current = { name: DEFAULT_NAME, hasLogo: false, logoVersion: "" };

  function logoUrl(version) {
    // La version (el id del archivo) rompe la cache cuando se cambia el logo.
    return `${apiBase()}/public/logo${version ? `?v=${encodeURIComponent(version)}` : ""}`;
  }

  function apiBase() {
    // Mismo prefijo que usa el resto de la app, sin depender de internos.
    return "api";
  }

  function initials(name) {
    return String(name || DEFAULT_NAME)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }

  function applyBranding(branding) {
    if (!branding) return;
    current = {
      name: String(branding.name || DEFAULT_NAME),
      hasLogo: Boolean(branding.hasLogo || branding.logoId),
      logoVersion: String(branding.logoVersion || branding.logoId || "")
    };

    const url = current.hasLogo ? logoUrl(current.logoVersion) : "assets/chic-co-logo-black.png";

    // Logos de la pantalla de acceso y la barra lateral.
    document.querySelectorAll(".login-logo-frame img, .sidebar-brand img").forEach((img) => {
      img.src = url;
      img.alt = current.name;
    });

    // Marca de la barra superior: logo si hay, iniciales si no.
    const mark = document.querySelector(".brand-mark");
    if (mark) {
      if (current.hasLogo) {
        mark.innerHTML = `<img src="${url}" alt="${escapeAttr(current.name)}" />`;
        mark.classList.add("has-logo");
      } else {
        mark.textContent = initials(current.name);
        mark.classList.remove("has-logo");
      }
    }

    // Nombre del negocio en los textos visibles.
    document.querySelectorAll("[data-brand-name], .brand-copy strong").forEach((node) => {
      node.textContent = current.name;
    });
    document.title = `${current.name} · Administracion`;
  }

  function escapeAttr(value) {
    return String(value || "").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  }

  // La identidad se lee del endpoint publico: funciona antes de iniciar sesion.
  async function loadPublicBranding() {
    try {
      const response = await fetch(`${apiBase()}/public/branding`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.branding) applyBranding(payload.branding);
    } catch (error) {
      /* sin conexion se queda con el logo por defecto */
    }
  }

  // Ya autenticado, state.branding es la fuente y refleja cambios recien hechos.
  function applyFromState() {
    if (typeof state === "object" && state?.branding) applyBranding(state.branding);
  }

  /* -------------------------------------------------------------------------
   * Panel de personalizacion (solo super usuario)
   * ---------------------------------------------------------------------- */

  let modal = null;
  let returnFocus = null;
  let pendingDataUrl = "";

  function buildModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "branding-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <section class="branding-card" role="dialog" aria-modal="true" aria-labelledby="brandingTitle">
        <form class="branding-form" autocomplete="off">
          <div class="branding-head">
            <div>
              <p class="branding-eyebrow">Personalizacion</p>
              <h2 id="brandingTitle">Identidad del negocio</h2>
            </div>
            <button class="branding-close" type="button" data-brand-cancel aria-label="Cerrar">&times;</button>
          </div>

          <label class="field">
            <span>Nombre del negocio</span>
            <input type="text" data-brand-input maxlength="80" />
          </label>

          <div class="field">
            <span>Logotipo</span>
            <div class="branding-logo-row">
              <div class="branding-preview" data-brand-preview aria-hidden="true"></div>
              <div class="branding-logo-actions">
                <button class="secondary-action" type="button" data-brand-pick>Subir imagen</button>
                <button class="secondary-action is-muted" type="button" data-brand-remove>Quitar</button>
                <input type="file" accept="image/png,image/jpeg,image/webp" data-brand-file hidden />
                <small>PNG, JPG o WebP. Se reduce sola antes de subir.</small>
              </div>
            </div>
          </div>

          <p class="branding-error" role="alert" aria-live="polite" data-brand-error></p>

          <div class="branding-actions">
            <button class="secondary-action" type="button" data-brand-cancel>Cancelar</button>
            <button class="primary-action" type="submit" data-brand-save>Guardar</button>
          </div>
        </form>
      </section>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-brand-cancel]")) {
        event.preventDefault();
        closeModal();
      }
      if (event.target.closest("[data-brand-pick]")) {
        event.preventDefault();
        modal.querySelector("[data-brand-file]").click();
      }
      if (event.target.closest("[data-brand-remove]")) {
        event.preventDefault();
        pendingDataUrl = "__REMOVE__";
        renderPreview("");
      }
    });
    modal.querySelector("[data-brand-file]").addEventListener("change", handleFile);
    modal.querySelector(".branding-form").addEventListener("submit", handleSave);
    return modal;
  }

  function renderPreview(dataUrl) {
    const preview = modal.querySelector("[data-brand-preview]");
    if (dataUrl && dataUrl !== "__REMOVE__") {
      preview.innerHTML = `<img src="${dataUrl}" alt="" />`;
    } else if (dataUrl === "__REMOVE__") {
      preview.innerHTML = `<span>Sin logo</span>`;
    } else if (current.hasLogo) {
      preview.innerHTML = `<img src="${logoUrl(current.logoVersion)}" alt="" />`;
    } else {
      preview.innerHTML = `<span>${escapeAttr(initials(current.name))}</span>`;
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const error = modal.querySelector("[data-brand-error]");
    error.textContent = "";
    try {
      pendingDataUrl = await downscaleLogo(file);
      renderPreview(pendingDataUrl);
    } catch (errorObject) {
      error.textContent = "No se pudo leer la imagen. Pruebe con un PNG o JPG.";
    }
  }

  // El logo puede tener transparencia (fondo recortado), asi que se exporta PNG
  // sin rellenar el fondo, a diferencia de las fotos de producto.
  async function downscaleLogo(file) {
    const maxSide = 320;
    const source =
      typeof loadBitmap === "function"
        ? await loadBitmap(file)
        : await new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => {
              URL.revokeObjectURL(url);
              resolve(image);
            };
            image.onerror = reject;
            image.src = url;
          });
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    if (typeof source.close === "function") source.close();
    return canvas.toDataURL("image/png");
  }

  async function handleSave(event) {
    event.preventDefault();
    if (typeof backendRequest !== "function") return;
    const name = modal.querySelector("[data-brand-input]").value.trim();
    const error = modal.querySelector("[data-brand-error]");
    const save = modal.querySelector("[data-brand-save]");
    error.textContent = "";
    save.disabled = true;
    save.textContent = "Guardando...";

    const body = { name };
    if (pendingDataUrl === "__REMOVE__") body.removeLogo = true;
    else if (pendingDataUrl) body.dataUrl = pendingDataUrl;

    try {
      const result = await backendRequest("/branding", { method: "POST", body: JSON.stringify(body) });
      if (result?.branding && typeof state === "object") state.branding = result.branding;
      applyBranding({
        name: result?.branding?.name || name || DEFAULT_NAME,
        hasLogo: Boolean(result?.branding?.logoId),
        logoVersion: result?.branding?.logoId || ""
      });
      closeModal();
      if (typeof showToast === "function") showToast("Identidad actualizada");
    } catch (errorObject) {
      error.textContent = errorObject.message || "No se pudo guardar.";
    } finally {
      save.disabled = false;
      save.textContent = "Guardar";
    }
  }

  function openModal() {
    buildModal();
    returnFocus = document.activeElement;
    pendingDataUrl = "";
    modal.querySelector("[data-brand-input]").value = current.name === DEFAULT_NAME ? "" : current.name;
    modal.querySelector("[data-brand-input]").placeholder = DEFAULT_NAME;
    modal.querySelector("[data-brand-error]").textContent = "";
    renderPreview("");
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.querySelectorAll(".topbar, .app-shell").forEach((region) => (region.inert = true));
    window.setTimeout(() => modal.querySelector("[data-brand-input]").focus(), 60);
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.querySelectorAll(".topbar, .app-shell").forEach((region) => (region.inert = false));
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
    returnFocus = null;
  }

  window.openBrandingSettings = openModal;

  // Se agrega "Personalizacion" al menu del usuario, solo para el super.
  function installMenuEntry() {
    if (typeof dropdownOptions !== "function" || dropdownOptions.__chicBranding) return false;
    const original = dropdownOptions;
    const wrapped = function (menuName) {
      const options = original(menuName) || [];
      if (menuName !== "usuario") return options;
      if (typeof currentUser !== "function" || currentUser()?.role !== "super") return options;
      if (options.some((item) => item.branding)) return options;
      // Antes de "Cerrar sesion", que la capa de index.html agrega al final.
      return [...options, { label: "Personalizacion", branding: true }];
    };
    wrapped.__chicBranding = true;
    dropdownOptions = wrapped;
    return true;
  }

  if (!installMenuEntry()) {
    const timer = window.setInterval(() => {
      if (installMenuEntry()) window.clearInterval(timer);
    }, 100);
    window.setTimeout(() => window.clearInterval(timer), 5000);
  }

  // El menu se dibuja con data-menu-label; se engancha por el texto de la opcion.
  document.addEventListener(
    "click",
    (event) => {
      const item = event.target.closest('[data-menu-label="Personalizacion"]');
      if (!item) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof closeDropdown === "function") closeDropdown();
      openModal();
    },
    true
  );

  // Al autenticarse y en cada refresco de estado, refleja la identidad guardada.
  if (typeof refreshStateFromBackend === "function") {
    const originalRefresh = refreshStateFromBackend;
    refreshStateFromBackend = async function (...args) {
      const result = await originalRefresh.apply(this, args);
      applyFromState();
      return result;
    };
  }
  const bodyObserver = new MutationObserver(() => {
    if (document.body.classList.contains("is-authenticated")) applyFromState();
  });
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal?.classList.contains("is-open")) {
      event.preventDefault();
      closeModal();
    }
  });

  loadPublicBranding();
  if (document.readyState !== "loading") applyFromState();
  else document.addEventListener("DOMContentLoaded", applyFromState);

  const style = document.createElement("style");
  style.textContent = `
    .brand-mark.has-logo { padding: 3px; background: #111113; }
    .brand-mark.has-logo img { width: 100%; height: 100%; object-fit: contain; }

    .branding-modal {
      position: fixed;
      inset: 0;
      z-index: 120;
      display: none;
      place-items: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.5);
    }
    .branding-modal.is-open { display: grid; }

    .branding-card {
      width: min(460px, 100%);
      padding: 20px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow-3);
      animation: branding-pop 200ms var(--ease-out, ease) both;
    }
    @keyframes branding-pop { from { opacity: 0; transform: scale(0.96); } }

    .branding-form { display: grid; gap: 14px; }
    .branding-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .branding-eyebrow {
      margin: 0 0 2px; color: var(--ink-3); font-size: 11px; font-weight: 700;
      letter-spacing: 0.12em; text-transform: uppercase;
    }
    .branding-head h2 { margin: 0; font-size: 18px; font-weight: 600; }
    .branding-close {
      width: 30px; height: 30px; color: var(--ink-2); background: var(--surface-2);
      border: 1px solid var(--line); border-radius: var(--radius-sm); font-size: 18px; line-height: 1;
    }
    .branding-logo-row { display: flex; align-items: center; gap: 14px; }
    .branding-preview {
      display: grid; place-items: center; flex: none;
      width: 72px; height: 72px; padding: 8px;
      background: #111113; border: 1px solid var(--line); border-radius: 14px;
      color: var(--gold); font-weight: 700;
    }
    .branding-preview img { width: 100%; height: 100%; object-fit: contain; }
    .branding-logo-actions { display: grid; gap: 6px; }
    .branding-logo-actions small { color: var(--ink-3); font-size: 12px; }
    .branding-error { margin: 0; min-height: 18px; color: var(--crit); font-size: 13px; font-weight: 500; }
    .branding-error:empty { min-height: 0; }
    .branding-actions { display: flex; justify-content: flex-end; gap: 8px; }
  `;
  document.head.appendChild(style);
})();
