(function () {
  window.__chicLoginHardening = true;
  window.__chicLoginOnlineGuard = true;

  document.querySelectorAll('img[src$="chic-co-logo.svg"]').forEach((image) => {
    image.src = "assets/chic-co-logo-black.png";
  });

  if (window.location.protocol === "file:" || typeof backendRequest !== "function") return;

  const backendTokenKey = "salonSuiteBackendToken";

  function backendAuthToken() {
    try {
      return sessionStorage.getItem(backendTokenKey) || "";
    } catch (error) {
      return "";
    }
  }

  function saveBackendAuthToken(token) {
    try {
      if (token) sessionStorage.setItem(backendTokenKey, token);
    } catch (error) {
      // The login still falls back to the current page session if sessionStorage is blocked.
    }
  }

  function clearBackendAuthToken() {
    try {
      sessionStorage.removeItem(backendTokenKey);
    } catch (error) {
      // Ignore storage cleanup failures.
    }
  }

  backendRequest = async function (path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const token = backendAuthToken();
    if (token && !headers.Authorization && !options.skipAuth) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(apiPath(path), {
      ...options,
      headers
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : {};

    if (!response.ok) {
      if (response.status === 401 && !options.skipAuth) {
        clearBackendAuthToken();
      }
      const error = new Error(payload.message || "Error del backend");
      error.status = response.status;
      throw error;
    }

    return payload;
  };

  hydrateBackendState = async function () {
    if (!window.fetch) return false;

    try {
      const health = await backendRequest("/health", { cache: "no-store", skipAuth: true });
      backendAvailable = Boolean(health?.ok);
      if (!backendAvailable || !backendAuthToken()) return backendAvailable;

      const response = await backendRequest("/state", { cache: "no-store" });
      if (response.state) {
        state = normalizeStateSnapshot(response.state);
        try {
          localStorage.setItem(storageKey, JSON.stringify(state));
        } catch (error) {
          // The backend remains the source of truth if localStorage is blocked.
        }
      }
      return true;
    } catch (error) {
      if (error.status === 401) {
        clearBackendAuthToken();
        clearSessionUser();
        showLogin();
        return true;
      }
      backendAvailable = false;
      return false;
    }
  };

  syncStateToBackend = async function ({ force = false } = {}) {
    if ((!backendAvailable && !force) || !backendAuthToken()) return;
    if (backendSaveInFlight) {
      backendSaveQueued = true;
      return;
    }

    backendSaveInFlight = true;
    try {
      syncCurrentBranchData();
      await backendRequest("/state", {
        method: "PUT",
        body: JSON.stringify({ state })
      });
    } catch (error) {
      if (error.status === 401) {
        clearSessionUser();
        showLogin("Sesion vencida. Ingrese de nuevo.");
      } else {
        backendAvailable = false;
      }
    } finally {
      backendSaveInFlight = false;
      if (backendSaveQueued) {
        backendSaveQueued = false;
        scheduleBackendSync();
      }
    }
  };

  async function completeBackendLogin(email, password) {
    try {
      if (!backendAvailable) {
        const health = await backendRequest("/health", { cache: "no-store", skipAuth: true });
        backendAvailable = Boolean(health?.ok);
      }
      if (!backendAvailable) return null;

      const login = await backendRequest("/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        skipAuth: true
      });

      if (login?.token) {
        saveBackendAuthToken(login.token);
      }

      const response = await backendRequest("/state", { cache: "no-store" });
      if (response.state) {
        state = normalizeStateSnapshot(response.state);
        try {
          localStorage.setItem(storageKey, JSON.stringify(state));
        } catch (error) {
          // The live backend is still the source of truth.
        }
      }

      return login;
    } catch (error) {
      if (error.status === 401 || error.status === 429) {
        return { denied: true, status: error.status };
      }
      backendAvailable = false;
      return null;
    }
  }

  loginWithBackend = async function (email, password) {
    return completeBackendLogin(email, password);
  };

  document.addEventListener(
    "submit",
    async (event) => {
      if (event.target !== elements.loginForm) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const email = elements.loginEmail.value.trim();
      const password = elements.loginPassword.value;
      elements.loginError.textContent = "";

      const login = await completeBackendLogin(email, password);
      if (login?.userId) {
        const user = state.users.find((item) => item.id === login.userId) || login.user;
        saveSessionUser(login.userId);
        elements.loginForm.reset();
        showApp(login.userId);
        showToast(`Bienvenido, ${user?.name || "Usuario"}`);
        return;
      }

      if (login?.status === 429) {
        showLogin("Demasiados intentos. Espere unos minutos e intente de nuevo.");
        return;
      }

      showLogin("Email o contrasena incorrectos.");
    },
    true
  );

  const originalLogout = logout;
  logout = function () {
    clearBackendAuthToken();
    originalLogout();
  };

  setTimeout(async () => {
    const online = await hydrateBackendState();
    if (online && !backendAuthToken()) {
      clearSessionUser();
      showLogin();
      return;
    }
    if (online) restoreSession();
  }, 0);
})();
