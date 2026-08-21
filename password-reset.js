// Recuperar la contrasena desde la pantalla de acceso. Todo pasa por rutas
// publicas (sin sesion): pedir el enlace y confirmar el cambio con el token que
// llega por correo. Es autonomo: no depende de app.js.

(function () {
  if (window.__chicPasswordReset) return;
  window.__chicPasswordReset = true;

  const $ = (id) => document.getElementById(id);

  function show(el, on) {
    if (el) el.classList.toggle("is-hidden", !on);
  }

  async function postJson(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || "No se pudo completar la solicitud.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const loginForm = $("loginForm");
    const forgotLink = $("forgotLink");
    const recoverForm = $("recoverForm");
    const recoverBack = $("recoverBack");
    const resetForm = $("resetForm");

    // --- Pedir enlace ---
    forgotLink?.addEventListener("click", () => {
      show(loginForm, false);
      show(forgotLink, false);
      show(recoverForm, true);
      $("recoverEmail")?.focus();
    });
    recoverBack?.addEventListener("click", () => {
      show(recoverForm, false);
      show(loginForm, true);
      show(forgotLink, true);
    });
    recoverForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = $("recoverSubmit");
      const msg = $("recoverMsg");
      const email = $("recoverEmail")?.value.trim();
      if (!email) return;
      button.disabled = true;
      button.textContent = "Enviando...";
      try {
        await postJson("/api/public/password-reset/request", { email });
      } catch (error) {
        /* la respuesta es generica a proposito; no revela nada */
      }
      // Mensaje generico: no revela si el correo existe.
      msg.textContent = "Si ese correo tiene una cuenta, te enviamos un enlace. Revisa tu bandeja (y el spam).";
      button.disabled = false;
      button.textContent = "Enviar enlace";
    });

    // --- Confirmar cambio con el token del correo ---
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset");
    if (token) {
      show(loginForm, false);
      show(forgotLink, false);
      show(resetForm, true);
      const title = $("loginTitle");
      if (title) title.textContent = "Nueva contraseña";
      $("resetPassword")?.focus();

      resetForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = $("resetSubmit");
        const error = $("resetError");
        const msg = $("resetMsg");
        error.textContent = "";
        msg.textContent = "";
        const p1 = $("resetPassword")?.value || "";
        const p2 = $("resetPassword2")?.value || "";
        if (p1.length < 10) {
          error.textContent = "La contraseña debe tener al menos 10 caracteres.";
          return;
        }
        if (p1 !== p2) {
          error.textContent = "Las contraseñas no coinciden.";
          return;
        }
        button.disabled = true;
        button.textContent = "Guardando...";
        try {
          await postJson("/api/public/password-reset/confirm", { token, password: p1 });
          show(resetForm, false);
          const login = $("loginForm");
          show(login, true);
          show($("forgotLink"), true);
          if (title) title.textContent = "Acceso interno";
          const loginError = $("loginError");
          if (loginError) loginError.textContent = "";
          const okNote = document.createElement("p");
          okNote.className = "login-note";
          okNote.textContent = "Contraseña actualizada. Ya puedes iniciar sesión.";
          login?.parentNode?.insertBefore(okNote, login);
          // Limpia el token de la URL para que no quede en el historial.
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
          error.textContent = e.message || "No se pudo cambiar la contraseña.";
          button.disabled = false;
          button.textContent = "Cambiar contraseña";
        }
      });
    }
  });

  const style = document.createElement("style");
  style.textContent = `
    .login-link { border: none; background: none; color: var(--accent); font-size: 13px; font-weight: 600; cursor: pointer; padding: 4px; justify-self: center; }
    .login-link:hover { text-decoration: underline; }
    .login-help { margin: 0; color: var(--ink-3); font-size: 12.5px; line-height: 1.5; }
    .login-note { margin: 0; color: var(--ok); font-size: 12.5px; font-weight: 500; min-height: 1em; }
  `;
  document.head.appendChild(style);
})();
