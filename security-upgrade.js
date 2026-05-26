(function () {
  window.__chicLoginHardening = true;
  window.__chicLoginOnlineGuard = true;

  document.querySelectorAll('img[src$="chic-co-logo.svg"]').forEach((image) => {
    image.src = "assets/chic-co-logo-black.png";
  });
  document.querySelector("#resetDataButton")?.remove();

  if (window.location.protocol === "file:" || !window.fetch) return;

  const backendTokenKey = "salonSuiteBackendToken";
  const seedRecordIds = {
    clients: ["CL-001", "CL-002", "CL-003", "CL-004", "CL-101", "CL-102", "CL-103"],
    products: ["PRD-001", "PRD-002", "PRD-003", "PRD-004", "PRD-005", "PRD-101", "PRD-102", "PRD-103"],
    procedures: ["SRV-001", "SRV-002", "SRV-003", "SRV-004", "SRV-005", "SRV-101", "SRV-102", "SRV-103"],
    activeProcedures: ["ACT-001", "ACT-002", "ACT-101"],
    plans: ["PLN-001", "PLN-002", "PLN-101"],
    appointments: ["CIT-001", "CIT-002", "CIT-101", "CIT-102"],
    invoices: ["FAC-001", "FAC-002", "FAC-101"],
    stockMovements: ["MOV-101"]
  };
  let bridgeBackendAvailable = false;
  let bridgeSaveTimer = null;
  let bridgeSaveInFlight = false;
  let bridgeSaveQueued = false;

  function apiRequestPath(path) {
    if (typeof apiPath === "function") return apiPath(path);
    const normalizedPath = String(path || "").startsWith("/") ? path : `/${path || ""}`;
    return `api${normalizedPath}`;
  }

  function isBackendAvailable() {
    try {
      return Boolean(backendAvailable);
    } catch (error) {
      return bridgeBackendAvailable;
    }
  }

  function setBackendAvailable(value) {
    bridgeBackendAvailable = Boolean(value);
    try {
      backendAvailable = bridgeBackendAvailable;
    } catch (error) {
      // Older app.js builds did not define backendAvailable.
    }
  }

  function adoptBackendState(snapshot) {
    if (!snapshot) return;
    state = typeof normalizeStateSnapshot === "function" ? normalizeStateSnapshot(snapshot) : snapshot;
    const removedSeedRecords = removeSeedRecords(state);
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      // The backend remains the source of truth if localStorage is blocked.
    }
    if (removedSeedRecords && backendAuthToken()) {
      window.setTimeout(() => syncStateToBackend({ force: true }), 0);
    }
  }

  function removeSeedRecords(targetState) {
    if (!targetState || typeof targetState !== "object") return false;
    let changed = cleanCollections(targetState);
    if (targetState.branches && typeof targetState.branches === "object") {
      Object.values(targetState.branches).forEach((branchData) => {
        changed = cleanCollections(branchData) || changed;
      });
    }
    return changed;
  }

  function cleanCollections(target) {
    let changed = false;
    Object.entries(seedRecordIds).forEach(([collectionName, ids]) => {
      if (!Array.isArray(target?.[collectionName])) return;
      const blockedIds = new Set(ids);
      const filtered = target[collectionName].filter((item) => !blockedIds.has(item?.id));
      if (filtered.length !== target[collectionName].length) {
        target[collectionName] = filtered;
        changed = true;
      }
    });
    return changed;
  }

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

    const response = await fetch(apiRequestPath(path), {
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
      setBackendAvailable(Boolean(health?.ok));
      if (!isBackendAvailable() || !backendAuthToken()) return isBackendAvailable();

      const response = await backendRequest("/state", { cache: "no-store" });
      if (response.state) {
        adoptBackendState(response.state);
      }
      return true;
    } catch (error) {
      if (error.status === 401) {
        clearBackendAuthToken();
        clearSessionUser();
        showLogin();
        return true;
      }
      setBackendAvailable(false);
      return false;
    }
  };

  scheduleBackendSync = function () {
    if (!isBackendAvailable() || !backendAuthToken()) return;
    window.clearTimeout(bridgeSaveTimer);
    bridgeSaveTimer = window.setTimeout(() => {
      syncStateToBackend();
    }, 250);
  };

  syncStateToBackend = async function ({ force = false } = {}) {
    if ((!isBackendAvailable() && !force) || !backendAuthToken()) return;
    if (bridgeSaveInFlight) {
      bridgeSaveQueued = true;
      return;
    }

    bridgeSaveInFlight = true;
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
        setBackendAvailable(false);
      }
    } finally {
      bridgeSaveInFlight = false;
      if (bridgeSaveQueued) {
        bridgeSaveQueued = false;
        scheduleBackendSync();
      }
    }
  };

  const originalSaveState = typeof saveState === "function" ? saveState : null;
  if (originalSaveState && !window.__chicBackendSaveBridge) {
    window.__chicBackendSaveBridge = true;
    saveState = function () {
      originalSaveState();
      scheduleBackendSync();
    };
  }

  async function refreshStateAfterLogin(login) {
    try {
      const response = await backendRequest("/state", { cache: "no-store" });
      if (response.state) {
        adoptBackendState(response.state);
        return true;
      }
    } catch (error) {
      console.warn("No se pudo refrescar el estado despues del login.", error);
    }

    if (login?.user && Array.isArray(state?.users)) {
      const existingIndex = state.users.findIndex((user) => user.id === login.userId);
      if (existingIndex >= 0) {
        state.users[existingIndex] = {
          ...state.users[existingIndex],
          ...login.user
        };
      } else {
        state.users.push(login.user);
      }
    }
    return false;
  }

  async function completeBackendLogin(email, password) {
    try {
      if (!isBackendAvailable()) {
        const health = await backendRequest("/health", { cache: "no-store", skipAuth: true });
        setBackendAvailable(Boolean(health?.ok));
      }
      if (!isBackendAvailable()) return null;

      const login = await backendRequest("/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        skipAuth: true
      });

      if (login?.token) {
        saveBackendAuthToken(login.token);
      }

      await refreshStateAfterLogin(login);

      return login;
    } catch (error) {
      if (error.status === 401 || error.status === 429) {
        return { denied: true, status: error.status };
      }
      setBackendAvailable(false);
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
        try {
          saveSessionUser(login.userId);
          elements.loginForm.reset();
          showApp(login.userId);
          showToast(`Bienvenido, ${user?.name || "Usuario"}`);
        } catch (error) {
          console.error("Login validado, pero no se pudo cargar el panel.", error);
          showLogin("Acceso validado, pero no se pudo cargar el panel. Recargue la pagina.");
        }
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
