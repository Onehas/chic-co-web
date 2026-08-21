(function () {
  window.__chicLoginHardening = true;
  window.__chicLoginOnlineGuard = true;

  document.querySelectorAll('img[src$="chic-co-logo.svg"]').forEach((image) => {
    image.src = "assets/chic-co-logo-black.png";
  });
  document.querySelector("#resetDataButton")?.remove();

  if (window.location.protocol === "file:" || !window.fetch) return;

  const backendTokenKey = "salonSuiteBackendToken";
  const pendingSyncKey = "salonSuitePendingOnlineSync";
  const inventoryCategoryOptions = ["General", "Cabello", "Facial", "Venta"];
  const realSpecialistsByBranch = {
    rohrmoser: [
      { name: "Jean Carlo Ramirez Esquivel", focus: "Rohrmoser" },
      { name: "Jose Eduardo Cascante", focus: "Rohrmoser" },
      { name: "Yamileth Romero Rodriguez", focus: "Rohrmoser" },
      { name: "Xinia Villasenor Ramirez", focus: "Rohrmoser" },
      { name: "Irma Castillo Cantillo", focus: "Rohrmoser" },
      { name: "Juan Carlos Selva Quesada", focus: "Rohrmoser" },
      { name: "Ruth Bojorge Sobrado", focus: "Rohrmoser" },
      { name: "Giovanna Chinchilla Zuniga", focus: "Rohrmoser" }
    ],
    alajuela: [
      { name: "Francinne Bermudez", focus: "Alajuela" },
      { name: "Jennifer Cruz Moreira", focus: "Alajuela" },
      { name: "Zamora Solis Tarcia Xiomara", focus: "Alajuela" },
      { name: "Andrea Guzman Sanchez", focus: "Alajuela" },
      { name: "Largaespada Castillo Maria Lidia", focus: "Alajuela" },
      { name: "Barrantes Suarez Roxina Maria", focus: "Alajuela" },
      { name: "Natalli Zamora Mora", focus: "Alajuela" },
      { name: "Kiara Picado Mendoza", focus: "Alajuela" }
    ]
  };
  const legacySpecialistDefaults = new Set(["Andrea Morales"]);
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
  let bridgeLastSyncToast = 0;
  let bridgeRealtimeEvents = null;
  let bridgeRealtimeReconnectTimer = null;

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

  function markPendingOnlineSync() {
    try {
      localStorage.setItem(
        pendingSyncKey,
        JSON.stringify({
          at: Date.now(),
          branchId: state?.currentBranchId || ""
        })
      );
    } catch (error) {
      // Online sync still runs even when this browser blocks the pending marker.
    }
  }

  function clearPendingOnlineSync() {
    try {
      localStorage.removeItem(pendingSyncKey);
    } catch (error) {
      // Ignore storage cleanup failures.
    }
  }

  function hasPendingOnlineSync() {
    try {
      return Boolean(localStorage.getItem(pendingSyncKey));
    } catch (error) {
      return false;
    }
  }

  function showSyncSavedToast() {
    if (typeof showToast !== "function") return;
    const now = Date.now();
    if (now - bridgeLastSyncToast < 1500) return;
    bridgeLastSyncToast = now;
    showToast("Guardado online");
  }

  function escapeOptionValue(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function applyInventoryCategoryOptions() {
    const select = document.querySelector('form[data-form="product"] select[name="category"]');
    if (!select) return;

    const selectedValue = inventoryCategoryOptions.includes(select.value) ? select.value : inventoryCategoryOptions[0];
    select.innerHTML = inventoryCategoryOptions
      .map((category) => `<option value="${escapeOptionValue(category)}">${escapeOptionValue(category)}</option>`)
      .join("");
    select.value = selectedValue;
  }

  function activeBranchId() {
    try {
      return state?.currentBranchId || "rohrmoser";
    } catch (error) {
      return "rohrmoser";
    }
  }

  function branchSpecialistList() {
    // Fuente de verdad: el roster editable del modulo Personal (coleccion
    // `specialists` por sucursal), con los traslados temporales del dia. Si esa
    // sede aun no armo su roster, se cae a la lista real por defecto para que la
    // agenda nunca quede vacia. Asi el personal deja de estar quemado en el
    // codigo: lo que edite la gerencia manda.
    try {
      const branch = activeBranchId();
      if (typeof rosterForBranchOn === "function") {
        const today = typeof todayISO === "function" ? todayISO() : "";
        const roster = rosterForBranchOn(branch, today);
        if (Array.isArray(roster) && roster.length) {
          return roster.map((person) => ({ name: person.name, focus: person.category || "" }));
        }
      }
    } catch (error) {
      /* si el roster no esta disponible, se usa el respaldo */
    }
    const specialists = realSpecialistsByBranch[activeBranchId()] || realSpecialistsByBranch.rohrmoser;
    return specialists.map((specialist) => ({ ...specialist }));
  }

  function namesMatch(left, right) {
    if (typeof normalize === "function") return normalize(left) === normalize(right);
    return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
  }

  function applyBranchSpecialists() {
    if (!Array.isArray(procedureSpecialists)) return;
    const specialists = branchSpecialistList();
    procedureSpecialists.splice(0, procedureSpecialists.length, ...specialists);
  }

  function refreshBranchSpecialistLabels() {
    const count = branchSpecialistList().length;
    document.querySelectorAll(".agenda-availability .agenda-today-head span").forEach((label) => {
      if (/personas\s*\|\s*cupos/i.test(label.textContent || "")) {
        label.textContent = `${count} personas | cupos de 60 mins`;
      }
    });
    document.querySelectorAll(".agenda-team-head strong").forEach((label) => {
      if (/especialistas/i.test(label.textContent || "")) {
        label.textContent = `${count} especialistas`;
      }
    });
  }

  function applyBranchSpecialistOptions() {
    if (typeof specialistOptions === "function") {
      specialistOptions = function (selected = "") {
        const specialists = branchSpecialistList();
        const selectedExists = specialists.some((specialist) => namesMatch(specialist.name, selected));
        const keepSavedSpecialist = selected && !selectedExists && !legacySpecialistDefaults.has(selected);
        const savedSpecialist = keepSavedSpecialist ? [{ name: selected, focus: "Agenda" }] : [];
        const selectedName = selectedExists ? selected : specialists[0]?.name || selected || "";

        return [...savedSpecialist, ...specialists].map((specialist) => ({
          value: specialist.name,
          label: specialist.name,
          selected: namesMatch(specialist.name, selectedName)
        }));
      };
    }

    if (typeof moduleMetrics === "function" && !window.__chicBranchSpecialistMetrics) {
      window.__chicBranchSpecialistMetrics = true;
      const originalModuleMetrics = moduleMetrics;
      moduleMetrics = function (moduleName) {
        const metrics = originalModuleMetrics(moduleName);
        if (moduleName === "citas" && Array.isArray(metrics) && metrics[2]) {
          metrics[2] = [branchSpecialistList().length, "Especialistas"];
        }
        return metrics;
      };
    }
  }

  function wrapRenderForBranchSpecialists(functionName) {
    const originalRender = typeof window[functionName] === "function" ? window[functionName] : null;
    if (!originalRender || originalRender.__chicBranchSpecialistWrapped) return;

    window[functionName] = function (...args) {
      applyBranchSpecialists();
      const result = originalRender.apply(this, args);
      refreshBranchSpecialistLabels();
      return result;
    };
    window[functionName].__chicBranchSpecialistWrapped = true;
  }

  function bootBranchSpecialists() {
    applyBranchSpecialists();
    applyBranchSpecialistOptions();
    ["renderView", "renderAll", "setModule"].forEach(wrapRenderForBranchSpecialists);
    refreshBranchSpecialistLabels();
  }

  function wrapRenderForInventoryCategories(functionName) {
    const originalRender = typeof window[functionName] === "function" ? window[functionName] : null;
    if (!originalRender) return;

    window[functionName] = function (...args) {
      const result = originalRender.apply(this, args);
      applyInventoryCategoryOptions();
      return result;
    };
  }

  function setBackendAvailable(value) {
    bridgeBackendAvailable = Boolean(value);
    try {
      backendAvailable = bridgeBackendAvailable;
    } catch (error) {
      // Older app.js builds did not define backendAvailable.
    }
  }

  // Copia del estado tal como lo confirmo el backend por ultima vez. Es la
  // base de la fusion a tres bandas cuando otro usuario guarda primero.
  let bridgeLastSyncedState = null;

  function snapshotClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sameCollection(left, right) {
    return JSON.stringify(left || []) === JSON.stringify(right || []);
  }

  // Toma el estado del servidor y le vuelve a aplicar solo las colecciones que
  // este navegador cambio desde la ultima confirmacion. Asi, si recepcion edito
  // clientes y otra persona edito facturas, sobreviven los dos cambios.
  // Fusion de tres vias por identificador.
  //
  // Antes, si mi coleccion diferia en algo de mi copia base, se reemplazaba la
  // del servidor ENTERA por la mia. Eso borraba en silencio cualquier registro
  // que el servidor hubiera creado y este navegador nunca hubiera visto: por
  // ejemplo la ficha de clienta que se crea al confirmar una reserva de la web
  // desde otra pantalla. La cita quedaba apuntando a un cliente inexistente.
  //
  // Ahora se parte de lo que tiene el servidor y encima se aplica solo lo que
  // yo cambie de verdad: lo que agregue, lo que edite y lo que borre.
  function mergeCollection(baseList, myList, theirList) {
    const hasIds = [baseList, myList, theirList].every(
      (list) => !Array.isArray(list) || list.every((item) => item && item.id)
    );
    // Sin identificadores no hay forma de casar registros; se conserva el
    // comportamiento anterior antes que fusionar a ciegas.
    if (!hasIds) {
      return sameCollection(myList, baseList) ? snapshotClone(theirList || []) : snapshotClone(myList || []);
    }

    const byId = (list) => new Map((list || []).map((item) => [item.id, item]));
    const base = byId(baseList);
    const mine = byId(myList);
    const theirs = byId(theirList);
    const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

    const result = new Map(theirs);

    // Lo que yo borre se borra, salvo que el servidor lo haya modificado
    // despues: en ese caso hubo un cambio real y no se descarta en silencio.
    base.forEach((item, id) => {
      if (mine.has(id)) return;
      const theirItem = theirs.get(id);
      if (!theirItem || same(theirItem, item)) result.delete(id);
    });

    // Lo que yo agregue o edite manda sobre lo del servidor.
    const added = [];
    mine.forEach((item, id) => {
      const baseItem = base.get(id);
      if (!baseItem) {
        added.push(item);
        result.set(id, item);
        return;
      }
      if (!same(item, baseItem)) result.set(id, item);
    });

    // La aplicacion agrega siempre al principio, asi que lo mio recien creado
    // va delante para que aparezca donde la persona espera verlo.
    const addedIds = new Set(added.map((item) => item.id));
    return snapshotClone([...added, ...[...result.values()].filter((item) => !addedIds.has(item.id))]);
  }

  function mergeAgainstServer(base, mine, theirs) {
    const merged = normalizeStateSnapshot(theirs);

    branchOptions.forEach((branch) => {
      branchDataKeys.forEach((key) => {
        merged.branches[branch.id][key] = mergeCollection(
          base?.branches?.[branch.id]?.[key],
          mine?.branches?.[branch.id]?.[key],
          merged.branches[branch.id][key]
        );
      });
    });

    merged.users = mergeCollection(base?.users, mine?.users, merged.users);

    // Planilla / RRHH: colecciones de nivel superior. Se fusionan por id para no
    // perder una comision/beneficio/vacacion que se guardo aqui mientras otra
    // persona guardaba algo mas. Para quien no tiene acceso a RRHH todas llegan
    // vacias y el servidor de todos modos ignora sus escrituras a planilla.
    ["staff", "commissions", "benefits", "vacations"].forEach((key) => {
      merged[key] = mergeCollection(base?.[key], mine?.[key], merged[key]);
    });

    if (branchOptions.some((branch) => branch.id === mine?.currentBranchId)) {
      merged.currentBranchId = mine.currentBranchId;
    }
    if (merged.users.some((user) => user.id === mine?.currentUserId && user.active)) {
      merged.currentUserId = mine.currentUserId;
    }
    writeBranchData(merged, merged.branches[merged.currentBranchId]);
    merged.stateRevision = theirs?.stateRevision;
    return merged;
  }

  function adoptBackendState(snapshot) {
    if (!snapshot) return;

    // La sesion y la sucursal abiertas en este navegador mandan sobre las que
    // venga guardadas en el servidor: son de quien las cambio de ultimo.
    const localUserId = state?.currentUserId;
    const localBranchId = state?.currentBranchId;
    const next = normalizeStateSnapshot(snapshot);

    if (next.users.some((user) => user.id === localUserId && user.active)) {
      next.currentUserId = localUserId;
    }
    if (branchOptions.some((branch) => branch.id === localBranchId)) {
      next.currentBranchId = localBranchId;
      writeBranchData(next, next.branches[localBranchId]);
    }

    state = next;
    const removedSeedRecords = removeSeedRecords(state);
    bridgeLastSyncedState = snapshotClone(state);
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      // The backend remains the source of truth if localStorage is blocked.
    }
    if (removedSeedRecords && backendAuthToken()) {
      window.setTimeout(() => syncStateToBackend({ force: true }), 0);
    }
  }

  // Cuantas coincidencias con los datos de demostracion hacen falta para dar
  // por hecho que se trata de una instalacion de prueba y no de datos reales.
  //
  // La huella es solo el identificador mas el nombre, y eso no distingue nada:
  // "Limpieza facial profunda" o una clienta llamada "Maria Lopez" son nombres
  // corrientes en un salon de verdad. Con la regla anterior, el primer servicio
  // que alguien creara con uno de esos nombres se borraba solo en cuanto la
  // aplicacion recargaba el estado -y arrastraba sus citas, que quedaban
  // apuntando a un procedimiento inexistente-. La demostracion original traia
  // veintiseis registros; exigir cuatro a la vez la reconoce sin falsos
  // positivos posibles en la practica.
  const seedCleanupThreshold = 4;

  function countSeedMatches(target) {
    if (!target || typeof target !== "object") return 0;
    return Object.entries(seedRecordFingerprints).reduce((total, [collectionName, fingerprints]) => {
      if (!Array.isArray(target[collectionName])) return total;
      return total + target[collectionName].filter((item) => matchesFingerprint(item, fingerprints[item?.id])).length;
    }, 0);
  }

  function removeSeedRecords(targetState) {
    if (!targetState || typeof targetState !== "object") return false;

    const branchValues = Object.values(targetState.branches || {});
    const matches = [targetState, ...branchValues].reduce((total, target) => total + countSeedMatches(target), 0);
    if (matches < seedCleanupThreshold) return false;

    let changed = cleanCollections(targetState);
    branchValues.forEach((branchData) => {
      changed = cleanCollections(branchData) || changed;
    });
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
      error.payload = payload;
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

  scheduleBackendSync = function ({ immediate = false } = {}) {
    if (!isBackendAvailable() || !backendAuthToken()) return;
    window.clearTimeout(bridgeSaveTimer);
    bridgeSaveTimer = window.setTimeout(() => {
      // Hay que soltar el identificador al disparar. refreshStateFromBackend se
      // rinde mientras bridgeSaveTimer tenga valor, asi que dejarlo puesto
      // significaba que, tras el primer guardado de la sesion, este navegador
      // no volvia a traer NUNCA los cambios de los demas: el evento en vivo
      // llegaba, llamaba a la funcion y esta se iba sin hacer nada.
      bridgeSaveTimer = null;
      syncStateToBackend();
    }, immediate ? 0 : 250);
  };

  syncStateToBackend = async function ({ force = false, keepalive = false, retryCount = 0 } = {}) {
    const isRetry = retryCount > 0;
    if ((!isBackendAvailable() && !force) || !backendAuthToken()) return;
    if (bridgeSaveInFlight && !isRetry) {
      bridgeSaveQueued = true;
      return;
    }

    bridgeSaveInFlight = true;
    try {
      syncCurrentBranchData();
      const result = await backendRequest("/state", {
        method: "PUT",
        body: JSON.stringify({ state, baseRevision: state.stateRevision }),
        keepalive
      });
      if (result?.stateRevision !== undefined) state.stateRevision = result.stateRevision;
      bridgeLastSyncedState = snapshotClone(state);
      clearPendingOnlineSync();
      showSyncSavedToast();
    } catch (error) {
      // Otro usuario guardo primero. Se fusionan los cambios de este navegador
      // sobre el estado del servidor y se reintenta, re-fusionando en cada
      // choque con un backoff pequeno, hasta agotar los reintentos. Un solo
      // reintento perdia trabajo bajo tres o mas escritores concurrentes.
      const maxSyncRetries = 5;
      if (error.status === 409 && error.payload?.state && retryCount < maxSyncRetries) {
        state = mergeAgainstServer(bridgeLastSyncedState, state, error.payload.state);
        storeStateLocally();
        if (document.body.classList.contains("is-authenticated")) renderAll();
        bridgeSaveInFlight = false;
        if (retryCount > 0) {
          await new Promise((resolve) => setTimeout(resolve, 60 * retryCount));
        }
        return syncStateToBackend({ force: true, keepalive, retryCount: retryCount + 1 });
      }

      if (error.status === 409) {
        adoptBackendState(error.payload?.state);
        if (document.body.classList.contains("is-authenticated")) renderAll();
        clearPendingOnlineSync();
        if (typeof showToast === "function") {
          showToast("Otro usuario guardo primero. Se recargaron los datos.");
        }
      } else if (error.status === 401) {
        clearSessionUser();
        showLogin("Sesion vencida. Ingrese de nuevo.");
      } else {
        markPendingOnlineSync();
        setBackendAvailable(false);
        if (typeof showToast === "function") {
          showToast("No se pudo guardar online. Reintentando al volver a conectar.");
        }
      }
    } finally {
      bridgeSaveInFlight = false;
      if (bridgeSaveQueued) {
        bridgeSaveQueued = false;
        scheduleBackendSync();
      }
    }
  };

  storeStateLocally = function () {
    try {
      syncCurrentBranchData();
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      // El backend queda como fuente principal si este navegador bloquea localStorage.
    }
  };

  refreshStateFromBackend = async function (options = {}) {
    if (!isBackendAvailable() || !backendAuthToken()) return false;
    if (bridgeSaveInFlight || bridgeSaveTimer) return false;

    try {
      const response = await backendRequest("/state", { cache: "no-store" });
      if (response.state) {
        adoptBackendState(response.state);
        if (options.render && document.body.classList.contains("is-authenticated")) {
          renderAll();
        }
        return true;
      }
    } catch (error) {
      if (error.status === 401) {
        disconnectRealtimeSync();
        clearSessionUser();
        showLogin("Sesion vencida. Ingrese de nuevo.");
        return false;
      }
      setBackendAvailable(false);
      disconnectRealtimeSync();
    }
    return false;
  };

  disconnectRealtimeSync = function () {
    window.clearTimeout(bridgeRealtimeReconnectTimer);
    bridgeRealtimeReconnectTimer = null;
    if (bridgeRealtimeEvents) {
      bridgeRealtimeEvents.close();
      bridgeRealtimeEvents = null;
    }
  };

  function scheduleRealtimeReconnect() {
    if (bridgeRealtimeReconnectTimer || !backendAuthToken()) return;
    bridgeRealtimeReconnectTimer = window.setTimeout(() => {
      bridgeRealtimeReconnectTimer = null;
      connectRealtimeSync();
    }, 5000);
  }

  connectRealtimeSync = function () {
    if (!isBackendAvailable() || !backendAuthToken() || !window.EventSource) return;

    disconnectRealtimeSync();
    const eventUrl = `${apiRequestPath("/events")}?token=${encodeURIComponent(backendAuthToken())}`;
    const source = new EventSource(eventUrl);
    bridgeRealtimeEvents = source;

    source.addEventListener("connected", () => {
      setBackendAvailable(true);
    });

    source.addEventListener("state-updated", () => {
      refreshStateFromBackend({ render: true });
    });

    source.onerror = () => {
      if (bridgeRealtimeEvents === source) {
        source.close();
        bridgeRealtimeEvents = null;
      }
      scheduleRealtimeReconnect();
    };
  };

  function parseMoneyInput(value) {
    const normalized = String(value || "").trim().replace(/[^\d.,]/g, "");
    if (!normalized) return NaN;

    const commaIndex = normalized.lastIndexOf(",");
    const dotIndex = normalized.lastIndexOf(".");
    let numberText = normalized;

    if (commaIndex >= 0 && dotIndex >= 0) {
      if (commaIndex > dotIndex) {
        numberText = normalized.replace(/\./g, "").replace(",", ".");
      } else {
        numberText = normalized.replace(/,/g, "");
      }
    } else if (commaIndex >= 0) {
      const cents = normalized.slice(commaIndex + 1);
      numberText = cents.length === 3 ? normalized.replace(/,/g, "") : normalized.replace(",", ".");
    } else if (dotIndex >= 0) {
      const cents = normalized.slice(dotIndex + 1);
      if (cents.length === 3) {
        numberText = normalized.replace(/\./g, "");
      }
    }

    return Math.round(Number(numberText));
  }

  registerPlanPayment = function (planId) {
    const plan = state.plans.find((item) => item.id === planId);
    if (!plan) return;

    const pending = Math.max(0, Number(plan.total || 0) - Number(plan.paid || 0));
    if (pending <= 0) {
      showToast("El plan ya esta pagado");
      return;
    }

    const answer = window.prompt(
      `Monto del abono para ${plan.title}\nPendiente: ${money(pending)}`,
      ""
    );
    if (answer === null) return;

    const payment = parseMoneyInput(answer);
    if (!Number.isFinite(payment) || payment <= 0) {
      showToast("Ingrese un monto de abono valido");
      return;
    }
    if (payment > pending) {
      showToast(`El abono maximo es ${money(pending)}`);
      return;
    }

    plan.paid = Number(plan.paid || 0) + payment;
    persistAndRender(`Abono registrado: ${money(payment)}`);
  };

  const originalSaveState = typeof saveState === "function" ? saveState : null;
  if (originalSaveState && !window.__chicBackendSaveBridge) {
    window.__chicBackendSaveBridge = true;
    saveState = function () {
      markPendingOnlineSync();
      originalSaveState();
      scheduleBackendSync({ immediate: true });
    };
  }

  async function refreshStateAfterLogin(login) {
    if (hasPendingOnlineSync()) {
      try {
        if (login?.userId) state.currentUserId = login.userId;
        await syncStateToBackend({ force: true });
        return true;
      } catch (error) {
        console.warn("No se pudo subir el estado pendiente antes de refrescar.", error);
      }
    }

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

  if (!window.__chicInventoryCategoryGuard) {
    window.__chicInventoryCategoryGuard = true;
    ["renderView", "renderAll", "setModule"].forEach(wrapRenderForInventoryCategories);
    window.setTimeout(applyInventoryCategoryOptions, 0);
  }

  if (!window.__chicBranchSpecialists) {
    window.__chicBranchSpecialists = true;
    bootBranchSpecialists();
    window.setTimeout(bootBranchSpecialists, 0);
  }

  document.addEventListener(
    "click",
    (event) => {
      const syncButton = event.target.closest('[data-quick="sync"]');
      if (!syncButton) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      markPendingOnlineSync();
      syncStateToBackend({ force: true });
    },
    true
  );

  document.addEventListener(
    "submit",
    async (event) => {
      if (event.target !== elements.loginForm) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const email = elements.loginEmail.value.trim();
      const password = elements.loginPassword.value;
      elements.loginError.textContent = "";

      // Estado de carga: sin esto, en red lenta el boton no daba senal y se
      // podia reenviar el formulario varias veces.
      const submitButton = document.querySelector("#loginSubmit");
      const submitLabel = submitButton?.textContent;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.setAttribute("aria-busy", "true");
        submitButton.textContent = "Entrando...";
      }

      let login;
      try {
        login = await completeBackendLogin(email, password);
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.removeAttribute("aria-busy");
          submitButton.textContent = submitLabel || "Entrar";
        }
      }
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

  // Cierra tambien la sesion en el servidor: el token deja de servir en
  // cualquier otro navegador donde se hubiera copiado.
  async function revokeServerSession() {
    if (!backendAuthToken()) return;
    try {
      await backendRequest("/logout", { method: "POST" });
    } catch (error) {
      // Aunque el servidor no responda, la sesion local se cierra igual.
    }
  }

  const originalLogout = logout;
  logout = function () {
    if (hasPendingOnlineSync() && backendAuthToken()) {
      syncStateToBackend({ force: true })
        .then(revokeServerSession)
        .finally(() => {
          clearBackendAuthToken();
          originalLogout();
        });
      return;
    }
    revokeServerSession().finally(() => {
      clearBackendAuthToken();
      originalLogout();
    });
  };

  /* ---------------------------------------------------------------------
   * Cambio de contrasena
   * ------------------------------------------------------------------ */

  const changePasswordLabel = "Cambiar contrasena";

  if (typeof dropdownOptions === "function" && !window.__chicPasswordMenu) {
    window.__chicPasswordMenu = true;
    const originalDropdownOptions = dropdownOptions;
    dropdownOptions = function (menuName) {
      const options = originalDropdownOptions(menuName) || [];
      if (menuName !== "usuario" || options.some((item) => item.label === changePasswordLabel)) {
        return options;
      }
      return [...options, { label: changePasswordLabel }];
    };
  }

  async function changeOwnPassword() {
    const currentPassword = window.prompt("Contrasena actual");
    if (currentPassword === null) return;

    const newPassword = window.prompt("Contrasena nueva (minimo 10 caracteres)");
    if (newPassword === null) return;

    if (String(newPassword).length < 10) {
      showToast("La contrasena nueva debe tener al menos 10 caracteres");
      return;
    }
    if (window.prompt("Repita la contrasena nueva") !== newPassword) {
      showToast("Las contrasenas no coinciden");
      return;
    }

    try {
      await backendRequest("/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword })
      });
      showToast("Contrasena actualizada");
    } catch (error) {
      showToast(error.message || "No se pudo cambiar la contrasena");
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      const option = event.target.closest(`[data-menu-label="${changePasswordLabel}"]`);
      if (!option) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeDropdown();
      changeOwnPassword();
    },
    true
  );

  setTimeout(async () => {
    const online = await hydrateBackendState();
    if (online && !backendAuthToken()) {
      clearSessionUser();
      showLogin();
      return;
    }
    if (online) restoreSession();
  }, 0);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && hasPendingOnlineSync()) {
      syncStateToBackend({ force: true, keepalive: true });
    }
  });

  window.addEventListener("pagehide", () => {
    if (hasPendingOnlineSync()) {
      syncStateToBackend({ force: true, keepalive: true });
    }
  });
})();
