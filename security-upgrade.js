(function () {
  window.__chicLoginHardening = true;
  window.__chicLoginOnlineGuard = true;

  document.querySelectorAll('img[src$="chic-co-logo.svg"]').forEach((image) => {
    image.src = "assets/chic-co-logo-black.png";
  });
  document.querySelector("#resetDataButton")?.remove();

  if (window.location.protocol === "file:" || !window.fetch) return;

  const backendTokenKey = "salonSuiteBackendToken";
  const seedRecordFingerprints = {
    clients: {
      "CL-001": { name: "Maria Lopez" },
      "CL-002": { name: "Valeria Soto" },
      "CL-003": { name: "Ana Rojas" },
      "CL-004": { name: "Karla Mena" },
      "CL-101": { name: "Lucia Fernandez" },
      "CL-102": { name: "Sofia Quesada" },
      "CL-103": { name: "Daniela Castro" }
    },
    products: {
      "PRD-001": { name: "Peroxido 20 vol." },
      "PRD-002": { name: "Tinte rubio 8.1" },
      "PRD-003": { name: "Mascarilla hidratante" },
      "PRD-004": { name: "Serum despigmentante" },
      "PRD-005": { name: "Gel conductor" },
      "PRD-101": { name: "Base rubber" },
      "PRD-102": { name: "Serum vitamina C" },
      "PRD-103": { name: "Decolorante azul" }
    },
    procedures: {
      "SRV-001": { name: "Limpieza facial profunda" },
      "SRV-002": { name: "Plan despigmentante" },
      "SRV-003": { name: "Depilacion laser axila" },
      "SRV-004": { name: "Color completo" },
      "SRV-005": { name: "Hidratacion capilar" },
      "SRV-101": { name: "Manicura semipermanente" },
      "SRV-102": { name: "Facial luminosidad" },
      "SRV-103": { name: "Color fantasia" }
    },
    plans: {
      "PLN-001": { title: "Despigmentante 12 semanas" },
      "PLN-002": { title: "Laser axila 8 sesiones" },
      "PLN-101": { title: "Facial luminosidad mensual" }
    }
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
    const matchedSeedIds = collectMatchedSeedIds(target);

    Object.entries(seedRecordFingerprints).forEach(([collectionName, fingerprints]) => {
      if (!Array.isArray(target?.[collectionName])) return;
      const filtered = target[collectionName].filter((item) => !matchesFingerprint(item, fingerprints[item?.id]));
      if (filtered.length !== target[collectionName].length) {
        target[collectionName] = filtered;
        changed = true;
      }
    });

    const relationCollections = ["activeProcedures", "appointments", "invoices", "stockMovements"];
    relationCollections.forEach((collectionName) => {
      if (!Array.isArray(target?.[collectionName])) return;
      const filtered = target[collectionName].filter((item) => !isLinkedToMatchedSeed(item, matchedSeedIds));
      if (filtered.length !== target[collectionName].length) {
        target[collectionName] = filtered;
        changed = true;
      }
    });

    return changed;
  }

  function collectMatchedSeedIds(target) {
    const ids = new Set();
    Object.entries(seedRecordFingerprints).forEach(([collectionName, fingerprints]) => {
      if (!Array.isArray(target?.[collectionName])) return;
      target[collectionName].forEach((item) => {
        if (matchesFingerprint(item, fingerprints[item?.id])) {
          ids.add(item.id);
        }
      });
    });
    return ids;
  }

  function matchesFingerprint(record, fingerprint) {
    if (!record || !fingerprint) return false;
    return Object.entries(fingerprint).every(([field, expected]) => String(record[field] || "") === expected);
  }

  function isLinkedToMatchedSeed(record, matchedSeedIds) {
    if (!record || !matchedSeedIds.size) return false;
    return ["clientId", "procedureId", "productId"].some((field) => matchedSeedIds.has(record[field]));
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
