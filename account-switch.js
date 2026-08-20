// Cambio de cuenta con contrasena.
//
// El cambio de usuario original (app.js) solo reasignaba state.currentUserId en
// el navegador, sin tocar el token de sesion: una sola persona con el login del
// super se volvia cualquiera con un clic. Eso es justo "pasarse entre usuarios".
//
// Aqui se sustituye por un cambio real: elegir otra cuenta pide SU contrasena,
// hace un login nuevo contra el servidor -token nuevo, ligado a esa persona- y
// revoca el token anterior. Nadie puede actuar como otro sin su clave, y la
// bitacora del servidor registra al autor correcto, porque el backend decide
// todo por el token, no por lo que diga el navegador.

(function () {
  if (window.__chicAccountSwitch) return;
  window.__chicAccountSwitch = true;

  function ready() {
    return (
      typeof loginWithBackend === "function" &&
      typeof backendRequest === "function" &&
      typeof showApp === "function" &&
      typeof saveSessionUser === "function"
    );
  }

  // Modal propio, inyectado una sola vez. Reutiliza el aspecto de los demas
  // dialogos de la aplicacion (tokens de color, radios, sombras).
  let modal = null;
  let returnFocus = null;

  function buildModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "switch-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <section class="switch-card" role="dialog" aria-modal="true" aria-labelledby="switchTitle">
        <form class="switch-form" autocomplete="off">
          <div class="switch-head">
            <div>
              <p class="switch-eyebrow">Cambiar de usuario</p>
              <h2 id="switchTitle">Confirmar identidad</h2>
            </div>
            <button class="switch-close" type="button" data-switch-cancel aria-label="Cancelar">&times;</button>
          </div>
          <p class="switch-lead" data-switch-lead></p>
          <label class="field">
            <span>Contrasena de <b data-switch-name></b></span>
            <input type="password" data-switch-password autocomplete="current-password" required />
          </label>
          <p class="switch-error" role="alert" aria-live="polite" data-switch-error></p>
          <div class="switch-actions">
            <button class="secondary-action" type="button" data-switch-cancel>Cancelar</button>
            <button class="primary-action" type="submit" data-switch-submit>Entrar como esta persona</button>
          </div>
        </form>
      </section>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-switch-cancel]")) {
        event.preventDefault();
        closeModal();
      }
    });
    modal.querySelector(".switch-form").addEventListener("submit", handleSubmit);
    return modal;
  }

  function openModal(user) {
    buildModal();
    returnFocus = document.activeElement;
    modal.querySelector("[data-switch-name]").textContent = user.name || "esta cuenta";
    modal.querySelector("[data-switch-lead]").textContent =
      "Para trabajar como otra persona, ingrese la contrasena de su cuenta. La sesion actual se cierra al entrar.";
    const error = modal.querySelector("[data-switch-error]");
    error.textContent = "";
    const password = modal.querySelector("[data-switch-password]");
    password.value = "";
    modal.dataset.targetId = user.id;
    modal.dataset.targetEmail = user.email || "";
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    // La pagina de fondo queda inerte: el foco no se escapa por detras.
    document.querySelectorAll(".topbar, .app-shell").forEach((region) => {
      region.inert = true;
    });
    window.setTimeout(() => password.focus(), 60);
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.querySelectorAll(".topbar, .app-shell").forEach((region) => {
      region.inert = false;
    });
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
    returnFocus = null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const targetEmail = modal.dataset.targetEmail;
    const targetId = modal.dataset.targetId;
    const password = modal.querySelector("[data-switch-password]").value;
    const error = modal.querySelector("[data-switch-error]");
    const submit = modal.querySelector("[data-switch-submit]");

    if (!targetEmail) {
      error.textContent = "Esa cuenta no tiene correo configurado, no se puede cambiar a ella.";
      return;
    }

    error.textContent = "";
    submit.disabled = true;
    submit.textContent = "Verificando...";

    // El token vigente se guarda para revocarlo en el servidor una vez que el
    // nuevo login tenga exito: asi no queda una sesion abierta de la persona
    // anterior en este equipo. backendAuthToken() es local a security-upgrade.js,
    // asi que se lee la clave de sessionStorage directamente.
    let previousToken = "";
    try {
      previousToken = sessionStorage.getItem("salonSuiteBackendToken") || "";
    } catch (storageError) {
      previousToken = "";
    }

    try {
      const login = await loginWithBackend(targetEmail, password);

      if (login?.userId && login.userId === targetId) {
        if (previousToken) {
          backendRequest("/logout", {
            method: "POST",
            headers: { Authorization: `Bearer ${previousToken}` }
          }).catch(() => {});
        }
        saveSessionUser(login.userId);
        closeModal();
        showApp(login.userId);
        if (typeof showToast === "function") showToast(`Sesion de ${login.user?.name || "usuario"}`);
        return;
      }

      if (login?.status === 429) {
        error.textContent = "Demasiados intentos. Espere unos minutos.";
      } else if (login?.userId && login.userId !== targetId) {
        error.textContent = "Ese correo pertenece a otra cuenta.";
      } else if (login === null) {
        error.textContent = "No hay conexion con el servidor. Intente de nuevo.";
      } else {
        error.textContent = "Contrasena incorrecta.";
      }
    } catch (errorObject) {
      error.textContent = "No se pudo verificar. Intente de nuevo.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Entrar como esta persona";
    }
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal?.classList.contains("is-open")) {
      event.preventDefault();
      closeModal();
    }
  });

  // Reemplaza el cambio de usuario sin contrasena por el flujo con verificacion.
  const applyOverride = () => {
    if (typeof switchUser !== "function" || switchUser.__chicSecured) return false;
    const secured = function (userId) {
      const user = (state?.users || []).find((item) => item.id === userId);
      if (!user) return;
      if (typeof currentUser === "function" && user.id === currentUser()?.id) {
        if (typeof closeDropdown === "function") closeDropdown();
        return;
      }
      if (!user.active) {
        if (typeof showToast === "function") showToast("Esa cuenta esta pausada");
        return;
      }
      if (!ready()) {
        if (typeof showToast === "function") showToast("El cambio de cuenta necesita conexion al servidor");
        return;
      }
      if (typeof closeDropdown === "function") closeDropdown();
      openModal(user);
    };
    secured.__chicSecured = true;
    switchUser = secured;
    return true;
  };

  if (!applyOverride()) {
    // app.js y las capas que lo envuelven pueden cargar despues; se reintenta.
    const timer = window.setInterval(() => {
      if (applyOverride()) window.clearInterval(timer);
    }, 100);
    window.setTimeout(() => window.clearInterval(timer), 5000);
  }

  const style = document.createElement("style");
  style.textContent = `
    .switch-modal {
      position: fixed;
      inset: 0;
      z-index: 120;
      display: none;
      place-items: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.5);
    }

    .switch-modal.is-open {
      display: grid;
    }

    .switch-card {
      width: min(420px, 100%);
      padding: 20px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow-3);
      animation: switch-pop 200ms var(--ease-out, ease) both;
    }

    @keyframes switch-pop {
      from { opacity: 0; transform: scale(0.96); }
    }

    .switch-form { display: grid; gap: 14px; }

    .switch-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .switch-eyebrow {
      margin: 0 0 2px;
      color: var(--ink-3);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .switch-head h2 { margin: 0; font-size: 18px; font-weight: 600; }

    .switch-close {
      width: 30px;
      height: 30px;
      color: var(--ink-2);
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      font-size: 18px;
      line-height: 1;
    }

    .switch-lead { margin: 0; color: var(--ink-2); font-size: 13.5px; line-height: 1.5; }

    .switch-error { margin: 0; min-height: 18px; color: var(--crit); font-size: 13px; font-weight: 500; }
    .switch-error:empty { min-height: 0; }

    .switch-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `;
  document.head.appendChild(style);
})();
