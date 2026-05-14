(function () {
  if (typeof hydrateBackendState === "function" || window.location.protocol === "file:") return;
  if (typeof saveState !== "function" || typeof loadState !== "function") return;

  const apiBase = "api";
  let backendOnline = false;
  let saveTimer = null;
  let saveInFlight = false;
  let saveQueued = false;

  function apiPath(path) {
    return `${apiBase}${path}`;
  }

  async function requestBackend(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(apiPath(path), {
      ...options,
      headers
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : {};

    if (!response.ok) {
      const error = new Error(payload.message || "Error del backend");
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  async function syncToBackend({ force = false } = {}) {
    if ((!backendOnline && !force) || saveInFlight) {
      saveQueued = saveInFlight;
      return;
    }

    saveInFlight = true;
    try {
      if (typeof syncCurrentBranchData === "function") {
        syncCurrentBranchData();
      }
      await requestBackend("/state", {
        method: "PUT",
        body: JSON.stringify({ state })
      });
    } catch (error) {
      backendOnline = false;
    } finally {
      saveInFlight = false;
      if (saveQueued) {
        saveQueued = false;
        scheduleSync();
      }
    }
  }

  function scheduleSync() {
    if (!backendOnline) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => syncToBackend(), 250);
  }

  const originalSaveState = saveState;
  saveState = function () {
    originalSaveState();
    scheduleSync();
  };

  const originalHandleLogin = handleLogin;
  handleLogin = async function () {
    if (!backendOnline) {
      return originalHandleLogin();
    }

    const email = elements.loginEmail.value.trim();
    const password = elements.loginPassword.value;
    elements.loginError.textContent = "";

    try {
      const login = await requestBackend("/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      const user = state.users.find((item) => item.id === login.userId) || login.user;

      saveSessionUser(login.userId);
      elements.loginForm.reset();
      showApp(login.userId);
      showToast(`Bienvenido, ${user.name}`);
    } catch (error) {
      if (error.status === 401) {
        showLogin("Email o contrasena incorrectos.");
        return;
      }
      backendOnline = false;
      return originalHandleLogin();
    }
  };

  async function bootBackendClient() {
    try {
      const health = await requestBackend("/health", { cache: "no-store" });
      backendOnline = Boolean(health?.ok);
      if (!backendOnline) return;

      const response = await requestBackend("/state", { cache: "no-store" });
      if (response.state) {
        localStorage.setItem(storageKey, JSON.stringify(response.state));
        state = loadState();
        restoreSession();
      } else {
        await syncToBackend({ force: true });
      }
    } catch (error) {
      backendOnline = false;
    }
  }

  bootBackendClient();
})();
