(function () {
  if (typeof hydrateBackendState === "function" || window.location.protocol === "file:") return;
  if (typeof saveState !== "function" || typeof loadState !== "function") return;

  const apiBase = "api";
  let backendOnline = false;
  let saveTimer = null;
  let saveInFlight = false;
  let saveQueued = false;
  const knownUserAuth = {
    "USR-000": {
      email: "gaboarcegazel@outlook.com",
      passwordHash: "8761fab13ae64eed33cad324c8bf7023caa5cf9ec63c858fd4e421e7650d51a5"
    },
    "USR-001": {
      email: "andres@chicco.local",
      passwordHash: "6117904c28115e4b6b78c601687c966a640888ba4f019e49459f0b97bce17a60"
    },
    "USR-002": {
      email: "gabriela@chicco.local",
      passwordHash: "9b71058a47f7c7fd26251e3855bbdac834ff19ace919ab5ee9f19a1fd13911e3"
    },
    "USR-003": {
      email: "paola@chicco.local",
      passwordHash: "dbbe503845a96eb0f5faffb9fc84a89a60f870c8afacacbd32adde1bc2980040"
    },
    "USR-004": {
      email: "camila@chicco.local",
      passwordHash: "96fb023c77fde9e57d5b11a8285e19bec7f0093459223894a0ead9d77029534f"
    }
  };

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
      applyKnownCredentialsToState();
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
    applyKnownCredentialsToState();
    originalSaveState();
    scheduleSync();
  };

  function applyKnownCredentialsToState() {
    if (!state || !Array.isArray(state.users)) return;
    state.users = state.users.map((user) => {
      const auth = knownUserAuth[user.id];
      return auth ? { ...user, email: auth.email, passwordHash: auth.passwordHash } : user;
    });
  }

  async function loginWithKnownCredentials(email, password) {
    applyKnownCredentialsToState();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const user = state.users.find((item) => String(item.email || "").trim().toLowerCase() === normalizedEmail);
    const passwordHash = await hashText(password);

    if (!user || !user.active || user.passwordHash !== passwordHash) {
      showLogin("Email o contrasena incorrectos.");
      return;
    }

    saveSessionUser(user.id);
    elements.loginForm.reset();
    showApp(user.id);
    showToast(`Bienvenido, ${user.name}`);
  }

  const originalHandleLogin = handleLogin;
  handleLogin = async function () {
    if (!backendOnline) {
      return loginWithKnownCredentials(elements.loginEmail.value.trim(), elements.loginPassword.value);
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
        return loginWithKnownCredentials(email, password);
      }
      backendOnline = false;
      return loginWithKnownCredentials(email, password);
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
        applyKnownCredentialsToState();
        restoreSession();
      } else {
        applyKnownCredentialsToState();
        await syncToBackend({ force: true });
      }
    } catch (error) {
      backendOnline = false;
    }
  }

  applyKnownCredentialsToState();
  bootBackendClient();
})();
