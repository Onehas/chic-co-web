const storageKey = "salonSuiteStateV2";
const authSessionKey = "salonSuiteSessionUserId";
const apiSessionTokenKey = "salonSuiteApiSessionToken";
const fallbackPasswordHash = "d3ad9315b7be5dd53b31a273b3b3aba5defe700808305aa16a3062b76658a791";
const receptionPasswordHash = "5813f24ae4432b277c8c92a78bf035caaa8f5a9ad0031441f5eccd2d4c0e2fd0";
const monicaPasswordHash = "e7d081ee45073bc0da9fd633a609db90be0adc2abac6ac47e79e375544e81c22";

const permissionModules = ["clientes", "inventario", "procedimientos", "enCurso", "planes", "citas", "facturacion", "usuarios"];

const moduleNames = {
  clientes: "Clientes",
  inventario: "Inventario",
  procedimientos: "Procedimientos",
  enCurso: "En curso",
  planes: "Planes",
  citas: "Citas",
  facturacion: "Facturacion",
  usuarios: "Usuarios"
};

function buildPermissions(readModules, writeModules = readModules) {
  return permissionModules.reduce((permissions, moduleName) => {
    permissions[moduleName] = {
      read: readModules.includes(moduleName),
      write: writeModules.includes(moduleName)
    };
    return permissions;
  }, {});
}

const rolePresets = {
  super: {
    label: "Super usuario",
    permissions: buildPermissions(permissionModules)
  },
  admin: {
    label: "Administrador",
    permissions: buildPermissions(permissionModules)
  },
  recepcion: {
    label: "Recepcion",
    permissions: buildPermissions(["clientes", "enCurso", "planes", "citas", "facturacion"], ["clientes", "citas", "facturacion"])
  },
  especialista: {
    label: "Especialista",
    permissions: buildPermissions(["clientes", "procedimientos", "enCurso", "planes", "citas", "facturacion"], ["enCurso"])
  },
  inventario: {
    label: "Inventario",
    permissions: buildPermissions(["inventario", "procedimientos"], ["inventario"])
  }
};

const superUserAccount = {
  id: "USR-000",
  name: "Gabriel Arce",
  email: "",
  role: "super",
  function: "Super usuario",
  active: true,
  passwordHash: fallbackPasswordHash,
  permissions: rolePresets.super.permissions
};

const allowedUserIds = ["USR-000", "USR-001", "USR-002", "USR-003", "USR-004"];
const systemUserAuth = {
  "USR-000": {
    role: "super",
    function: "Super usuario",
    permissions: rolePresets.super.permissions
  },
  "USR-001": {
    role: "super",
    function: "Super usuario",
    permissions: rolePresets.super.permissions
  },
  "USR-002": {
    name: "Recepcion",
    email: "recepcion@chicnco.cr",
    role: "recepcion",
    function: "Recepcion y agenda",
    passwordHash: receptionPasswordHash,
    permissions: rolePresets.recepcion.permissions
  },
  "USR-003": {
    name: "Monica",
    email: "mgazel@mgjobs.net",
    role: "recepcion",
    function: "Recepcion y agenda",
    passwordHash: monicaPasswordHash,
    permissions: rolePresets.recepcion.permissions
  },
  "USR-004": {}
};
const branchDataKeys = ["clients", "products", "procedures", "activeProcedures", "plans", "appointments", "invoices", "stockMovements"];

const branchOptions = [
  { id: "rohrmoser", label: "Chic & Co Rohrmoser" },
  { id: "alajuela", label: "Chic & Co Alajuela" }
];

const procedureSpecialists = [
  { name: "Andrea Morales", focus: "Faciales" },
  { name: "Paola Jimenez", focus: "Color" },
  { name: "Camila Soto", focus: "Cabello" },
  { name: "Natalia Vargas", focus: "Laser" },
  { name: "Sofia Marin", focus: "Unas" },
  { name: "Valeria Campos", focus: "Depilacion" },
  { name: "Daniela Rojas", focus: "Masajes" },
  { name: "Mariana Arias", focus: "Cejas" },
  { name: "Laura Quiros", focus: "Tratamientos" },
  { name: "Fernanda Solis", focus: "Maquillaje" },
  { name: "Karla Mendez", focus: "Cabello" },
  { name: "Melissa Castro", focus: "Faciales" },
  { name: "Gabriela Mora", focus: "Unas" },
  { name: "Isabel Pineda", focus: "Laser" },
  { name: "Lucia Herrera", focus: "Color" },
  { name: "Monica Salazar", focus: "Depilacion" },
  { name: "Rebeca Chacon", focus: "Masajes" },
  { name: "Elena Navarro", focus: "Cejas" },
  { name: "Cristina Vega", focus: "Tratamientos" },
  { name: "Jimena Fuentes", focus: "Maquillaje" }
];

const monthNames = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];

const weekdayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const weekdayShortNames = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

function emptyBranchData() {
  return {
    clients: [],
    products: [],
    procedures: [],
    activeProcedures: [],
    plans: [],
    appointments: [],
    invoices: [],
    stockMovements: []
  };
}

const defaultState = {
  ...emptyBranchData(),
  currentBranchId: "rohrmoser",
  currentUserId: "USR-000",
  users: [
    superUserAccount,
    {
      id: "USR-001",
      name: "Andres",
      email: "",
      role: systemUserAuth["USR-001"]?.role || "super",
      function: systemUserAuth["USR-001"]?.function || "Super usuario",
      active: true,
      passwordHash: fallbackPasswordHash,
      permissions: systemUserAuth["USR-001"]?.permissions || rolePresets.super.permissions
    },
    {
      id: "USR-002",
      name: "Recepcion",
      email: "recepcion@chicnco.cr",
      role: systemUserAuth["USR-002"]?.role || "recepcion",
      function: systemUserAuth["USR-002"]?.function || "Recepcion y agenda",
      active: true,
      passwordHash: receptionPasswordHash,
      permissions: systemUserAuth["USR-002"]?.permissions || rolePresets.recepcion.permissions
    },
    {
      id: "USR-003",
      name: "Monica",
      email: "mgazel@mgjobs.net",
      role: systemUserAuth["USR-003"]?.role || "recepcion",
      function: systemUserAuth["USR-003"]?.function || "Recepcion y agenda",
      active: true,
      passwordHash: monicaPasswordHash,
      permissions: systemUserAuth["USR-003"]?.permissions || rolePresets.recepcion.permissions
    },
    {
      id: "USR-004",
      name: "Camila",
      email: "",
      role: "especialista",
      function: "Especialista estetica",
      active: true,
      passwordHash: fallbackPasswordHash,
      permissions: rolePresets.especialista.permissions
    }
  ]
};

const moduleConfig = {
  clientes: {
    title: "Clientes",
    description: "Registra informacion de contacto, historial, notas y acciones rapidas para planes o citas.",
    actions: [
      { label: "Nuevo cliente", action: "focusForm" },
      { label: "Crear plan", module: "planes" }
    ]
  },
  inventario: {
    title: "Inventario",
    description: "Controla productos, stock minimo, costos, precios y alertas para compras.",
    actions: [
      { label: "Nuevo producto", action: "focusForm" },
      { label: "Ver alertas", action: "showAlerts" }
    ]
  },
  procedimientos: {
    title: "Procedimientos esteticos",
    description: "Define servicios, duracion, precio, producto asociado y cuidados posteriores.",
    actions: [
      { label: "Nuevo procedimiento", action: "focusForm" },
      { label: "Iniciar sesion", module: "enCurso" }
    ]
  },
  enCurso: {
    title: "Procedimientos en curso",
    description: "Da seguimiento a sesiones activas, consumo de producto, especialista y proxima accion.",
    actions: [
      { label: "Iniciar procedimiento", action: "focusForm" },
      { label: "Crear cita", module: "citas" }
    ]
  },
  planes: {
    title: "Planes largos",
    description: "Administra paquetes de varias sesiones, avances, fechas proximas, abonos y saldos.",
    actions: [
      { label: "Nuevo plan", action: "focusForm" },
      { label: "Agendar sesion", module: "citas" }
    ]
  },
  citas: {
    title: "Citas",
    description: "Agenda sesiones, confirma llegadas e inicia procedimientos desde el calendario.",
    actions: [
      { label: "Nueva cita", action: "focusForm" },
      { label: "Ver en curso", module: "enCurso" }
    ]
  },
  facturacion: {
    title: "Facturacion",
    description: "Consulta historial por cliente, productos vendidos, area del tratamiento, pagos e IVA.",
    actions: [
      { label: "Nueva factura", action: "focusForm" },
      { label: "Ver clientes", module: "clientes" }
    ]
  },
  usuarios: {
    title: "Usuarios y permisos",
    description: "Administra usuarios del sistema, funciones y accesos por modulo.",
    actions: [
      { label: "Nuevo usuario", action: "focusForm" },
      { label: "Ver permisos", action: "focusForm" }
    ]
  }
};

const menuItems = {
  usuario: [
    { label: "Perfil de Andres" },
    { label: "Preferencias" },
    { label: "Soporte" },
    { label: "Bloquear sesion" }
  ]
};

const clone = (value) => JSON.parse(JSON.stringify(value));

function pickBranchData(source) {
  return branchDataKeys.reduce((data, key) => {
    data[key] = clone(source[key] || []);
    return data;
  }, {});
}

function writeBranchData(target, branchData) {
  branchDataKeys.forEach((key) => {
    target[key] = clone(branchData?.[key] || []);
  });
}

function alajuelaBranchData() {
  return emptyBranchData();
}

function defaultBranches() {
  return {
    rohrmoser: pickBranchData(defaultState),
    alajuela: alajuelaBranchData()
  };
}

function normalizeBranchData(branchData, fallbackData) {
  const fallback = fallbackData || {};
  return branchDataKeys.reduce((data, key) => {
    data[key] = Array.isArray(branchData?.[key]) ? clone(branchData[key]) : clone(fallback[key] || []);
    return data;
  }, {});
}

function createInitialState() {
  const initial = clone(defaultState);
  initial.branches = defaultBranches();
  initial.currentBranchId = "rohrmoser";
  initial.users = ensureSystemUsers(clone(defaultState.users).map(normalizeUser));
  writeBranchData(initial, initial.branches[initial.currentBranchId]);
  return initial;
}

let state = loadState();
let currentModule = "clientes";
let prefill = {};
let selectedAgendaDate = todayISO();
let toastTimer;

const elements = {
  moduleTitle: document.querySelector("#moduleTitle"),
  moduleDescription: document.querySelector("#moduleDescription"),
  moduleMetrics: document.querySelector("#moduleMetrics"),
  moduleActions: document.querySelector("#moduleActions"),
  viewEyebrow: document.querySelector("#viewEyebrow"),
  viewTitle: document.querySelector("#viewTitle"),
  viewSubtitle: document.querySelector("#viewSubtitle"),
  viewContent: document.querySelector("#viewContent"),
  searchInput: document.querySelector("#searchInput"),
  resetDataButton: document.querySelector("#resetDataButton"),
  activeCount: document.querySelector("#activeCount"),
  activeProcedureList: document.querySelector("#activeProcedureList"),
  alertCount: document.querySelector("#alertCount"),
  requestList: document.querySelector("#requestList"),
  dropdownLayer: document.querySelector("#dropdownLayer"),
  toast: document.querySelector("#toast"),
  operationsPanel: document.querySelector(".operations-panel"),
  reasonModal: document.querySelector("#inventoryReasonModal"),
  reasonForm: document.querySelector("#inventoryReasonForm"),
  reasonProductName: document.querySelector("#reasonProductName"),
  reasonText: document.querySelector("#reasonText"),
  reasonWordCount: document.querySelector("#reasonWordCount"),
  reasonCancelButton: document.querySelector("#reasonCancelButton"),
  reasonSecondaryCancelButton: document.querySelector("#reasonSecondaryCancelButton"),
  currentUserName: document.querySelector("#currentUserName"),
  loginScreen: document.querySelector("#loginScreen"),
  loginForm: document.querySelector("#loginForm"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  loginError: document.querySelector("#loginError")
};

let pendingStockUseProductId = "";

function loadState() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return createInitialState();
    const parsed = JSON.parse(saved);
    const merged = { ...clone(defaultState), ...parsed };
    merged.stockMovements = merged.stockMovements || [];
    merged.invoices = merged.invoices || clone(defaultState.invoices);
    const fallbackBranches = defaultBranches();
    const savedBranches = parsed.branches || {};
    const legacyRohrmoserData = pickBranchData(merged);
    merged.branches = branchOptions.reduce((branches, branch) => {
      const fallback = branch.id === "rohrmoser" && !parsed.branches ? legacyRohrmoserData : fallbackBranches[branch.id];
      branches[branch.id] = normalizeBranchData(savedBranches[branch.id], fallback);
      return branches;
    }, {});
    merged.currentBranchId = branchOptions.some((branch) => branch.id === merged.currentBranchId) ? merged.currentBranchId : "rohrmoser";
    writeBranchData(merged, merged.branches[merged.currentBranchId]);
    merged.users =
      Array.isArray(merged.users) && merged.users.length
        ? ensureSystemUsers(merged.users.map(normalizeUser))
        : ensureSystemUsers(clone(defaultState.users).map(normalizeUser));
    merged.currentUserId = merged.currentUserId || defaultState.currentUserId;
    if (!merged.users.some((user) => user.id === merged.currentUserId && user.active)) {
      merged.currentUserId = merged.users.find((user) => user.active)?.id || defaultState.currentUserId;
    }
    return merged;
  } catch (error) {
    return createInitialState();
  }
}

function normalizeUser(user) {
  const role = rolePresets[user.role] ? user.role : "recepcion";
  const basePermissions = clone(rolePresets[role].permissions);
  const savedPermissions = user.permissions || {};
  return {
    ...user,
    role,
    active: user.active !== false,
    passwordHash: user.passwordHash || fallbackPasswordHash,
    permissions: permissionModules.reduce((permissions, moduleName) => {
      permissions[moduleName] = {
        ...basePermissions[moduleName],
        ...(savedPermissions[moduleName] || {})
      };
      return permissions;
    }, {})
  };
}

function ensureSystemUsers(users) {
  const normalizedSuperUser = normalizeUser(superUserAccount);
  const usersById = new Map(
    users
      .filter((user) => allowedUserIds.includes(user.id))
      .map((user) => [user.id, normalizeUser(user)])
  );
  usersById.set(normalizedSuperUser.id, normalizedSuperUser);
  return allowedUserIds.map((userId) => usersById.get(userId) || normalizeUser(defaultState.users.find((user) => user.id === userId))).filter(Boolean);
}

function saveState() {
  try {
    syncCurrentBranchData();
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    showToast("No se pudo guardar en este navegador");
  }
}

function currentBranch() {
  return branchOptions.find((branch) => branch.id === state.currentBranchId) || branchOptions[0];
}

function syncCurrentBranchData() {
  if (!state?.branches || !state.currentBranchId) return;
  state.branches[state.currentBranchId] = pickBranchData(state);
}

function switchBranch(branchId) {
  const nextBranch = branchOptions.find((branch) => branch.id === branchId);
  if (!nextBranch) return;
  if (state.currentBranchId === branchId) {
    closeDropdown();
    showToast(`Sucursal activa: ${nextBranch.label}`);
    return;
  }

  syncCurrentBranchData();
  state.currentBranchId = branchId;
  state.branches = state.branches || defaultBranches();
  state.branches[branchId] = normalizeBranchData(state.branches[branchId], defaultBranches()[branchId]);
  writeBranchData(state, state.branches[branchId]);
  prefill = {};
  selectedAgendaDate = todayISO();
  if (!canView(currentModule)) {
    currentModule = firstAllowedModule();
  }
  storeStateLocally();
  renderAll();
  closeDropdown();
  showToast(`Sucursal activa: ${nextBranch.label}`);
}

function sessionUserId() {
  try {
    return sessionStorage.getItem(authSessionKey) || localStorage.getItem(authSessionKey);
  } catch (error) {
    return localStorage.getItem(authSessionKey);
  }
}

function saveSessionUser(userId) {
  try {
    sessionStorage.setItem(authSessionKey, userId);
  } catch (error) {
    localStorage.setItem(authSessionKey, userId);
  }
}

function apiSessionToken() {
  try {
    return sessionStorage.getItem(apiSessionTokenKey) || localStorage.getItem(apiSessionTokenKey);
  } catch (error) {
    return localStorage.getItem(apiSessionTokenKey);
  }
}

function saveApiSessionToken(token) {
  if (!token) return;
  try {
    sessionStorage.setItem(apiSessionTokenKey, token);
  } catch (error) {
    localStorage.setItem(apiSessionTokenKey, token);
  }
}

function clearApiSessionToken() {
  try {
    sessionStorage.removeItem(apiSessionTokenKey);
    localStorage.removeItem(apiSessionTokenKey);
  } catch (error) {
    localStorage.removeItem(apiSessionTokenKey);
  }
}

function clearSessionUser() {
  disconnectRealtimeSync();
  try {
    sessionStorage.removeItem(authSessionKey);
    localStorage.removeItem(authSessionKey);
  } catch (error) {
    localStorage.removeItem(authSessionKey);
  }
  clearApiSessionToken();
}

async function hashText(value) {
  if (!window.crypto?.subtle) {
    throw new Error("No crypto");
  }
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function findUserByEmail(email) {
  const normalizedEmail = normalize(email);
  return state.users.find((user) => normalize(user.email) === normalizedEmail);
}

function showLogin(message = "") {
  document.body.classList.add("is-login");
  document.body.classList.remove("is-authenticated");
  elements.loginError.textContent = message;
  setTimeout(() => elements.loginEmail?.focus(), 100);
}

function showApp(userId) {
  state.currentUserId = userId;
  storeStateLocally();
  document.body.classList.remove("is-login");
  document.body.classList.add("is-authenticated");
  currentModule = canView("clientes") ? "clientes" : firstAllowedModule();
  connectRealtimeSync();
  setModule(currentModule, { silent: true });
}

function restoreSession() {
  const storedUserId = sessionUserId();
  const user = state.users.find((item) => item.id === storedUserId && item.active);
  if (!user) {
    showLogin();
    return;
  }
  showApp(user.id);
}

async function handleLogin() {
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value;
  elements.loginError.textContent = "";

  try {
    const user = findUserByEmail(email);
    const passwordHash = await hashText(password);
    if (!user || !user.active || user.passwordHash !== passwordHash) {
      showLogin("Email o contrasena incorrectos.");
      return;
    }
    saveSessionUser(user.id);
    elements.loginForm.reset();
    showApp(user.id);
    showToast(`Bienvenido, ${user.name}`);
  } catch (error) {
    showLogin("No se pudo validar el acceso.");
  }
}

function logout() {
  clearSessionUser();
  closeDropdown();
  showLogin("Sesion cerrada.");
}

function todayISO() {
  const date = new Date();
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function addDays(dateValue, days) {
  const base = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  base.setDate(base.getDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function dateToISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextId(prefix, list) {
  const nextNumber =
    list.reduce((max, item) => {
      const number = Number(String(item.id).replace(`${prefix}-`, ""));
      return Number.isFinite(number) ? Math.max(max, number) : max;
    }, 0) + 1;
  return `${prefix}-${String(nextNumber).padStart(3, "0")}`;
}

function money(value) {
  return `CRC ${Number(value || 0).toLocaleString("es-CR")}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesSearch(parts, search) {
  if (!search) return true;
  const haystack = normalize(parts.join(" "));
  return haystack.includes(normalize(search));
}

function clientName(id) {
  return state.clients.find((client) => client.id === id)?.name || "Sin cliente";
}

function procedureName(id) {
  return state.procedures.find((procedure) => procedure.id === id)?.name || "Sin procedimiento";
}

function productName(id) {
  return state.products.find((product) => product.id === id)?.name || "Sin producto";
}

function getProduct(id) {
  return state.products.find((product) => product.id === id);
}

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || state.users[0];
}

function canView(moduleName) {
  const user = currentUser();
  return Boolean(user?.active && user.permissions?.[moduleName]?.read);
}

function canWrite(moduleName) {
  const user = currentUser();
  return Boolean(user?.active && user.permissions?.[moduleName]?.write);
}

function firstAllowedModule() {
  return permissionModules.find((moduleName) => moduleConfig[moduleName] && canView(moduleName)) || "clientes";
}

function requireWrite(moduleName = currentModule) {
  if (canWrite(moduleName)) return true;
  showToast("Este usuario no tiene permiso para editar este modulo");
  return false;
}

function roleLabel(role) {
  return rolePresets[role]?.label || role;
}

function getProcedure(id) {
  return state.procedures.find((procedure) => procedure.id === id);
}

function invoiceSubtotal(invoice) {
  return Number(invoice.serviceAmount || 0) + Number(invoice.productAmount || 0);
}

function invoiceIva(invoice) {
  return Math.round(invoiceSubtotal(invoice) * (Number(invoice.ivaRate || 0) / 100));
}

function invoiceTotal(invoice) {
  return invoiceSubtotal(invoice) + invoiceIva(invoice);
}

function paymentMethodLabel(method) {
  return method === "Tarjeta" ? "Tarjeta" : method === "Efectivo" ? "Efectivo" : "No especificado";
}

function procedureArea(procedure) {
  if (!procedure) return "Belleza";
  return ["Cabello", "Unas", "Color"].includes(procedure.category) ? "Belleza" : "Estetica";
}

function lowProducts() {
  return state.products.filter((product) => Number(product.stock) <= Number(product.min));
}

function activeProcedures() {
  return state.activeProcedures.filter((procedure) => procedure.status !== "Finalizado");
}

function activePlans() {
  return state.plans.filter((plan) => plan.status !== "Completado");
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

function wordList(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function countWords(value) {
  return wordList(value).length;
}

function trimToWordLimit(value, limit = 100) {
  const words = wordList(value);
  if (words.length <= limit) return value;
  return words.slice(0, limit).join(" ");
}

function updateReasonWordCount() {
  const limited = trimToWordLimit(elements.reasonText.value, 100);
  if (limited !== elements.reasonText.value) {
    elements.reasonText.value = limited;
    showToast("El motivo tiene limite de 100 palabras");
  }
  elements.reasonWordCount.textContent = `${countWords(elements.reasonText.value)}/100 palabras`;
}

function openStockReasonModal(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  if (Number(product.stock) <= 0) {
    showToast("No hay stock disponible");
    return;
  }

  pendingStockUseProductId = productId;
  elements.reasonProductName.textContent = `${product.name} | Stock actual: ${product.stock} ${product.unit}`;
  elements.reasonText.value = "";
  updateReasonWordCount();
  elements.reasonModal.classList.add("is-open");
  elements.reasonModal.setAttribute("aria-hidden", "false");
  setTimeout(() => elements.reasonText.focus(), 80);
}

function closeStockReasonModal() {
  pendingStockUseProductId = "";
  elements.reasonModal.classList.remove("is-open");
  elements.reasonModal.setAttribute("aria-hidden", "true");
  elements.reasonText.value = "";
  updateReasonWordCount();
}

function setModule(moduleName, options = {}) {
  if (!moduleConfig[moduleName]) return;
  if (!canView(moduleName)) {
    showToast("Este usuario no tiene acceso a ese modulo");
    return;
  }
  currentModule = moduleName;
  if (!options.keepSearch) elements.searchInput.value = "";

  renderAll();
  closeDropdown();

  if (!options.silent) {
    showToast(`${moduleConfig[moduleName].title} listo`);
    elements.operationsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderAll() {
  renderActiveUser();
  renderModuleAccess();
  renderSummary();
  renderSideLists();
  renderView();
}

function renderActiveUser() {
  const user = currentUser();
  elements.currentUserName.textContent = user ? user.name : "Usuario";
}

function renderModuleAccess() {
  document.querySelectorAll("[data-module]").forEach((button) => {
    const moduleName = button.dataset.module;
    const allowed = canView(moduleName);
    button.classList.toggle("is-hidden", !allowed);
    button.classList.toggle("is-active", allowed && moduleName === currentModule);
  });
}

function moduleMetrics(moduleName) {
  const inProgress = activeProcedures().length;
  const plans = activePlans();
  const lowStock = lowProducts().length;

  const metrics = {
    clientes: [
      [state.clients.length, "Clientes"],
      [plans.length, "Planes activos"],
      [inProgress, "En curso"]
    ],
    inventario: [
      [state.products.length, "Productos"],
      [lowStock, "Stock bajo"],
      [state.products.reduce((sum, product) => sum + Number(product.stock || 0), 0), "Unidades"]
    ],
    procedimientos: [
      [state.procedures.length, "Servicios"],
      [state.procedures.filter((procedure) => Number(procedure.sessions) > 1).length, "Largos"],
      [money(average(state.procedures.map((procedure) => procedure.price))), "Precio prom."]
    ],
    enCurso: [
      [inProgress, "Activos"],
      [state.activeProcedures.filter((procedure) => procedure.status === "Pausado").length, "Pausados"],
      [state.activeProcedures.filter((procedure) => procedure.next === todayISO()).length, "Hoy"]
    ],
    planes: [
      [plans.length, "Activos"],
      [plans.reduce((sum, plan) => sum + (Number(plan.sessionsTotal) - Number(plan.sessionsDone)), 0), "Sesiones pend."],
      [money(plans.reduce((sum, plan) => sum + (Number(plan.total) - Number(plan.paid)), 0)), "Saldo"]
    ],
    citas: [
      [state.appointments.length, "Citas"],
      [state.appointments.filter((appointment) => appointment.date === todayISO()).length, "Hoy"],
      [procedureSpecialists.length, "Especialistas"]
    ],
    facturacion: [
      [state.invoices.length, "Facturas"],
      [money(state.invoices.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0)), "Total fact."],
      [money(state.invoices.reduce((sum, invoice) => sum + invoiceIva(invoice), 0)), "IVA"]
    ],
    usuarios: [
      [state.users.length, "Usuarios"],
      [state.users.filter((user) => user.role === "admin" && user.active).length, "Acceso total"],
      [state.users.filter((user) => user.active).length, "Activos"]
    ]
  };

  return metrics[moduleName] || [];
}

function average(values) {
  const numbers = values.map(Number).filter((value) => Number.isFinite(value));
  if (!numbers.length) return 0;
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function renderSummary() {
  const config = moduleConfig[currentModule];
  elements.moduleTitle.textContent = config.title;
  elements.moduleDescription.textContent = config.description;
  elements.moduleMetrics.innerHTML = moduleMetrics(currentModule)
    .map(([value, label]) => `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`)
    .join("");
  if (!canWrite(currentModule)) {
    elements.moduleActions.innerHTML = `<div class="permission-note">Solo lectura para ${escapeHtml(currentUser()?.name || "este usuario")}</div>`;
    return;
  }
  elements.moduleActions.innerHTML = config.actions
    .filter((action) => !action.module || canView(action.module))
    .map((action, index) => {
      const className = index === 0 ? "primary-action" : "secondary-action";
      const target = action.module ? ` data-target-module="${action.module}"` : "";
      const actionName = action.action ? ` data-side-action="${action.action}"` : "";
      return `<button class="${className}" type="button"${target}${actionName}>${escapeHtml(action.label)}</button>`;
    })
    .join("");
}

function renderSideLists() {
  const active = activeProcedures();
  const alerts = lowProducts();

  elements.activeCount.textContent = active.length;
  elements.activeProcedureList.innerHTML = active.length
    ? active
        .slice(0, 5)
        .map(
          (item) => `
            <article class="compact-item">
              <strong>${escapeHtml(clientName(item.clientId))}</strong>
              <span>${escapeHtml(procedureName(item.procedureId))} | ${escapeHtml(item.status)} | ${escapeHtml(item.specialist)}</span>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">No hay procedimientos activos.</div>`;

  elements.alertCount.textContent = alerts.length;
  elements.requestList.innerHTML = alerts.length
    ? alerts
        .map(
          (product) => `
            <article class="compact-item">
              <strong>${escapeHtml(product.name)}</strong>
              <span>Stock ${escapeHtml(product.stock)} de minimo ${escapeHtml(product.min)} ${escapeHtml(product.unit)}</span>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Inventario dentro del minimo definido.</div>`;
}

function renderView() {
  if (!canView(currentModule)) {
    currentModule = firstAllowedModule();
  }
  const config = moduleConfig[currentModule];
  const search = elements.searchInput.value;

  elements.viewEyebrow.textContent = "Gestion";
  elements.viewTitle.textContent = config.title;
  elements.viewSubtitle.textContent = config.description;
  elements.viewContent.innerHTML = viewRenderers[currentModule]?.(search) || `<div class="empty-state">Modulo no disponible.</div>`;
}

function renderStats(stats) {
  return `
    <div class="stat-strip">
      ${stats
        .map(
          ([value, label]) => `
            <article class="stat-card">
              <strong>${escapeHtml(value)}</strong>
              <span>${escapeHtml(label)}</span>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderLayout(stats, formTitle, formHtml, recordsTitle, recordsHtml) {
  const writableForm = canWrite(currentModule)
    ? formHtml
    : `<div class="empty-state">Este usuario puede consultar este modulo, pero no puede crear ni modificar datos.</div>`;
  return `
    ${renderStats(stats)}
    <div class="view-grid">
      <section class="form-panel">
        <h3>${escapeHtml(formTitle)}</h3>
        ${writableForm}
      </section>
      <section class="records-panel">
        <h3>${escapeHtml(recordsTitle)}</h3>
        ${recordsHtml}
      </section>
    </div>
  `;
}

function renderTable(headers, rows) {
  if (!rows.length) return `<div class="empty-state">No hay registros para mostrar con ese filtro.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>
  `;
}

function inputField(label, name, type = "text", value = "", extra = "") {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${extra} />
    </label>
  `;
}

function textareaField(label, name, value = "") {
  return `
    <label class="field full">
      <span>${escapeHtml(label)}</span>
      <textarea name="${escapeHtml(name)}">${escapeHtml(value)}</textarea>
    </label>
  `;
}

function selectField(label, name, options, selectedValue = "", extra = "") {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}" ${extra}>
        ${options
          .map(
            (option) =>
              `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(selectedValue) ? "selected" : ""}>${escapeHtml(
                option.label
              )}</option>`
          )
          .join("")}
      </select>
    </label>
  `;
}

function clientOptions(selected = "") {
  return state.clients.map((client) => ({
    value: client.id,
    label: `${client.name} (${client.id})`,
    selected: client.id === selected
  }));
}

function procedureOptions(selected = "") {
  return state.procedures.map((procedure) => ({
    value: procedure.id,
    label: `${procedure.name} (${procedure.sessions} ses.)`,
    selected: procedure.id === selected
  }));
}

function productOptions(selected = "") {
  return [
    { value: "", label: "Sin producto asociado" },
    ...state.products.map((product) => ({
      value: product.id,
      label: `${product.name} - stock ${product.stock}`,
      selected: product.id === selected
    }))
  ];
}

function specialistOptions(selected = "") {
  const savedSpecialist =
    selected && !procedureSpecialists.some((specialist) => specialist.name === selected)
      ? [{ name: selected, focus: "Agenda" }]
      : [];
  return [...savedSpecialist, ...procedureSpecialists].map((specialist) => ({
    value: specialist.name,
    label: specialist.name,
    selected: specialist.name === selected
  }));
}

function statusBadge(status) {
  const className =
    status === "Completado" || status === "Finalizado" || status === "Atendida"
      ? "is-green"
      : status === "Pausado" || status === "Pendiente"
        ? "is-warning"
        : status === "En curso"
          ? "is-rose"
          : "";
  return `<span class="status-badge ${className}">${escapeHtml(status)}</span>`;
}

function specialistInitials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function agendaMonthDays(referenceDate) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const calendarStart = new Date(year, month, 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return {
      date,
      inMonth: date.getMonth() === month
    };
  });
}

function renderAppointmentAgenda() {
  const selectedDay = selectedAgendaDate || todayISO();
  const selectedDate = new Date(`${selectedDay}T00:00:00`);
  const scheduleCounts = {};
  const addScheduleCount = (dateValue) => {
    if (!dateValue) return;
    scheduleCounts[dateValue] = (scheduleCounts[dateValue] || 0) + 1;
  };
  state.appointments.forEach((appointment) => addScheduleCount(appointment.date));
  state.activeProcedures.forEach((procedure) => addScheduleCount(procedure.next));
  state.plans.forEach((plan) => addScheduleCount(plan.next));
  const selectedItems = [
    ...state.appointments
      .filter((appointment) => appointment.date === selectedDay)
      .map((appointment) => ({
        time: appointment.time,
        type: "Cita",
        client: clientName(appointment.clientId),
        detail: procedureName(appointment.procedureId),
        meta: `${appointment.specialist} | ${appointment.status}`
      })),
    ...state.activeProcedures
      .filter((procedure) => procedure.next === selectedDay)
      .map((procedure) => ({
        time: "",
        type: "Seguimiento",
        client: clientName(procedure.clientId),
        detail: procedureName(procedure.procedureId),
        meta: `${procedure.specialist} | ${procedure.status}`
      })),
    ...state.plans
      .filter((plan) => plan.next === selectedDay)
      .map((plan) => ({
        time: "",
        type: "Plan",
        client: clientName(plan.clientId),
        detail: plan.title,
        meta: procedureName(plan.procedureId)
      }))
  ].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  const selectedTitle = `${weekdayNames[selectedDate.getDay()]}, ${selectedDate.getDate()} de ${monthNames[
    selectedDate.getMonth()
  ].toLowerCase()}`;
  const monthTitle = `${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
  const days = agendaMonthDays(selectedDate)
    .map(({ date, inMonth }) => {
      const dayISO = dateToISO(date);
      const count = scheduleCounts[dayISO] || 0;
      const className = [
        "agenda-day",
        inMonth ? "" : "is-muted",
        dayISO === selectedDay ? "is-selected" : "",
        count ? "has-appointments" : ""
      ]
        .filter(Boolean)
        .join(" ");
      const counter = count ? `<small>${escapeHtml(count)}</small>` : "";
      return `<button class="${className}" type="button" data-agenda-date="${escapeHtml(dayISO)}" aria-pressed="${
        dayISO === selectedDay
      }" aria-label="Ver agenda del ${escapeHtml(dayISO)}"><span>${escapeHtml(date.getDate())}</span>${counter}</button>`;
    })
    .join("");
  const team = procedureSpecialists
    .map(
      (specialist) => `
        <article class="specialist-card">
          <span class="specialist-avatar">${escapeHtml(specialistInitials(specialist.name))}</span>
          <span class="specialist-meta">
            <strong>${escapeHtml(specialist.name)}</strong>
            <small>${escapeHtml(specialist.focus)}</small>
          </span>
        </article>
      `
    )
    .join("");
  const selectedList = selectedItems.length
    ? selectedItems
        .map(
          (item) => `
            <article class="agenda-mini-item">
              <strong>${item.time ? `${escapeHtml(item.time)} | ` : ""}${escapeHtml(item.client)}</strong>
              <span>${escapeHtml(item.type)} | ${escapeHtml(item.detail)}</span>
              <small>${escapeHtml(item.meta)}</small>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">No hay citas ni procedimientos programados para esta fecha.</div>`;

  return `
    <div class="agenda-board">
      <section class="agenda-calendar" aria-label="Calendario de citas">
        <div class="agenda-calendar-top">
          <strong>${escapeHtml(selectedTitle)}</strong>
          <span class="agenda-menu" aria-hidden="true">v</span>
        </div>
        <div class="agenda-month-row">
          <h4>${escapeHtml(monthTitle)}</h4>
          <div class="agenda-month-controls" aria-hidden="true">
            <span class="agenda-arrow is-up"></span>
            <span class="agenda-arrow is-down"></span>
          </div>
        </div>
        <div class="agenda-weekdays">
          ${weekdayShortNames.map((day) => `<span>${escapeHtml(day)}</span>`).join("")}
        </div>
        <div class="agenda-days">
          ${days}
        </div>
      </section>
      <section class="agenda-team" aria-label="Equipo de procedimientos">
        <div class="agenda-team-head">
          <span>Equipo</span>
          <strong>20 especialistas</strong>
        </div>
        <div class="specialist-list">${team}</div>
      </section>
    </div>
    <section class="agenda-today">
      <div class="agenda-today-head">
        <strong>Agenda del dia</strong>
        <span>${escapeHtml(selectedItems.length)} registros | ${escapeHtml(selectedDay)}</span>
      </div>
      <div class="agenda-today-list">${selectedList}</div>
    </section>
  `;
}

const viewRenderers = {
  clientes(search) {
    const rows = state.clients
      .filter((client) => matchesSearch([client.name, client.phone, client.email, client.notes], search))
      .map(
        (client) => `
          <tr>
            <td>
              <div class="cell-title">
                <strong>${escapeHtml(client.name)}</strong>
                <span>${escapeHtml(client.id)} | ultima visita ${escapeHtml(client.lastVisit || "Sin fecha")}</span>
              </div>
            </td>
            <td>${escapeHtml(client.phone)}<br />${escapeHtml(client.email)}</td>
            <td>${escapeHtml(client.notes)}</td>
            <td>
              <div class="inline-actions">
                <button class="row-action" type="button" data-create-plan-client="${client.id}">Plan</button>
                <button class="row-action is-muted" type="button" data-start-client="${client.id}">Iniciar</button>
                <button class="row-action is-muted" type="button" data-schedule-client="${client.id}">Cita</button>
                <button class="row-action is-muted" type="button" data-invoice-client="${client.id}">Factura</button>
              </div>
            </td>
          </tr>
        `
      );

    const form = `
      <form class="data-form" data-form="client" autocomplete="off">
        <div class="form-grid">
          ${inputField("Nombre", "name", "text", "", "required")}
          ${inputField("Telefono", "phone", "tel", "", "required")}
          ${inputField("Email", "email", "email")}
          ${inputField("Ultima visita", "lastVisit", "date", todayISO())}
          ${textareaField("Notas, alergias o preferencias", "notes")}
        </div>
        <button class="primary-action" type="submit">Guardar cliente</button>
      </form>
    `;

    return renderLayout(
      moduleMetrics("clientes"),
      "Nuevo cliente",
      form,
      "Base de clientes",
      renderTable(["Cliente", "Contacto", "Notas", "Acciones"], rows)
    );
  },

  inventario(search) {
    const rows = state.products
      .filter((product) => {
        const isLow = Number(product.stock) <= Number(product.min);
        return matchesSearch([product.name, product.category, product.supplier, product.unit, isLow ? "stock bajo alerta" : "ok"], search);
      })
      .map((product) => {
        const isLow = Number(product.stock) <= Number(product.min);
        return `
          <tr>
            <td>
              <div class="cell-title">
                <strong>${escapeHtml(product.name)}</strong>
                <span>${escapeHtml(product.id)} | ${escapeHtml(product.category)}</span>
              </div>
            </td>
            <td>${escapeHtml(product.stock)} ${escapeHtml(product.unit)}<br />Minimo ${escapeHtml(product.min)}</td>
            <td>${isLow ? statusBadge("Stock bajo") : statusBadge("OK")}</td>
            <td>${money(product.cost)}<br />Venta ${money(product.price)}</td>
            <td>${escapeHtml(product.supplier)}</td>
            <td>
              <div class="inline-actions">
                <button class="row-action" type="button" data-stock-add="${product.id}">Entrada +1</button>
                <button class="row-action is-muted" type="button" data-stock-use="${product.id}">Usar -1</button>
              </div>
            </td>
          </tr>
        `;
      });

    const form = `
      <form class="data-form" data-form="product" autocomplete="off">
        <div class="form-grid">
          ${inputField("Producto", "name", "text", "", "required")}
          ${selectField("Categoria", "category", [
            { value: "Quimicos", label: "Quimicos" },
            { value: "Color", label: "Color" },
            { value: "Tratamiento", label: "Tratamiento" },
            { value: "Facial", label: "Facial" },
            { value: "Aparatologia", label: "Aparatologia" }
          ])}
          ${inputField("Stock", "stock", "number", "1", "min='0' required")}
          ${inputField("Minimo", "min", "number", "1", "min='0' required")}
          ${inputField("Unidad", "unit", "text", "unidades", "required")}
          ${inputField("Costo", "cost", "number", "0", "min='0' step='100'")}
          ${inputField("Precio venta", "price", "number", "0", "min='0' step='100'")}
          ${inputField("Proveedor", "supplier", "text")}
        </div>
        <button class="primary-action" type="submit">Guardar producto</button>
      </form>
    `;

    return renderLayout(
      moduleMetrics("inventario"),
      "Nuevo producto",
      form,
      "Productos y stock",
      renderTable(["Producto", "Stock", "Estado", "Costo/venta", "Proveedor", "Acciones"], rows)
    );
  },

  procedimientos(search) {
    const rows = state.procedures
      .filter((procedure) =>
        matchesSearch([procedure.name, procedure.category, productName(procedure.productId), procedure.aftercare], search)
      )
      .map(
        (procedure) => `
          <tr>
            <td>
              <div class="cell-title">
                <strong>${escapeHtml(procedure.name)}</strong>
                <span>${escapeHtml(procedure.id)} | ${escapeHtml(procedure.category)}</span>
              </div>
            </td>
            <td>${escapeHtml(procedure.duration)} min<br />${escapeHtml(procedure.sessions)} sesion(es)</td>
            <td>${money(procedure.price)}</td>
            <td>${escapeHtml(productName(procedure.productId))}</td>
            <td>${escapeHtml(procedure.aftercare)}</td>
            <td>
              <div class="inline-actions">
                <button class="row-action" type="button" data-start-procedure="${procedure.id}">Iniciar</button>
                <button class="row-action is-muted" type="button" data-plan-procedure="${procedure.id}">Plan</button>
                <button class="row-action is-muted" type="button" data-invoice-procedure="${procedure.id}">Factura</button>
              </div>
            </td>
          </tr>
        `
      );

    const form = `
      <form class="data-form" data-form="procedure" autocomplete="off">
        <div class="form-grid">
          ${inputField("Nombre", "name", "text", "", "required")}
          ${selectField("Categoria", "category", [
            { value: "Facial", label: "Facial" },
            { value: "Cabello", label: "Cabello" },
            { value: "Laser", label: "Laser" },
            { value: "Corporal", label: "Corporal" },
            { value: "Unas", label: "Unas" }
          ])}
          ${inputField("Duracion min.", "duration", "number", "60", "min='5' required")}
          ${inputField("Precio", "price", "number", "0", "min='0' step='100' required")}
          ${inputField("Sesiones sugeridas", "sessions", "number", "1", "min='1' required")}
          ${selectField("Producto asociado", "productId", productOptions())}
          ${textareaField("Cuidados posteriores", "aftercare")}
        </div>
        <button class="primary-action" type="submit">Guardar procedimiento</button>
      </form>
    `;

    return renderLayout(
      moduleMetrics("procedimientos"),
      "Nuevo procedimiento",
      form,
      "Catalogo de procedimientos",
      renderTable(["Procedimiento", "Tiempo", "Precio", "Producto", "Cuidados", "Acciones"], rows)
    );
  },

  enCurso(search) {
    const selectedClient = prefill.clientId || state.clients[0]?.id || "";
    const selectedProcedure = prefill.procedureId || state.procedures[0]?.id || "";
    const rows = state.activeProcedures
      .filter((item) =>
        matchesSearch(
          [clientName(item.clientId), procedureName(item.procedureId), item.specialist, item.status, item.notes],
          search
        )
      )
      .map((item) => {
        const procedure = getProcedure(item.procedureId);
        const productId = procedure?.productId || "";
        return `
          <tr>
            <td>
              <div class="cell-title">
                <strong>${escapeHtml(clientName(item.clientId))}</strong>
                <span>${escapeHtml(procedureName(item.procedureId))}</span>
              </div>
            </td>
            <td>${statusBadge(item.status)}<br />${escapeHtml(item.specialist)}</td>
            <td>Inicio ${escapeHtml(item.started)}<br />Proxima ${escapeHtml(item.next || "Sin fecha")}</td>
            <td>${escapeHtml(item.notes)}<br />Producto: ${escapeHtml(productName(productId))}</td>
            <td>
              <div class="inline-actions">
                <button class="row-action" type="button" data-consume-active="${item.id}">Usar prod.</button>
                <button class="row-action is-muted" type="button" data-toggle-active="${item.id}">
                  ${item.status === "Pausado" ? "Retomar" : "Pausar"}
                </button>
                <button class="row-action is-warning" type="button" data-finish-active="${item.id}">Finalizar</button>
              </div>
            </td>
          </tr>
        `;
      });

    const form = `
      <form class="data-form" data-form="active" autocomplete="off">
        <div class="form-grid">
          ${selectField("Cliente", "clientId", clientOptions(selectedClient), selectedClient, "required")}
          ${selectField("Procedimiento", "procedureId", procedureOptions(selectedProcedure), selectedProcedure, "required")}
          ${selectField("Especialista", "specialist", specialistOptions("Andrea Morales"), "Andrea Morales", "required")}
          ${inputField("Proxima accion", "next", "date", todayISO())}
          ${textareaField("Notas de la sesion", "notes")}
        </div>
        <button class="primary-action" type="submit">Iniciar procedimiento</button>
      </form>
    `;

    return renderLayout(
      moduleMetrics("enCurso"),
      "Iniciar procedimiento",
      form,
      "Seguimiento activo",
      renderTable(["Cliente", "Estado", "Fechas", "Notas", "Acciones"], rows)
    );
  },

  planes(search) {
    const selectedClient = prefill.clientId || state.clients[0]?.id || "";
    const selectedProcedure = prefill.procedureId || state.procedures.find((procedure) => Number(procedure.sessions) > 1)?.id || "";
    const rows = state.plans
      .filter((plan) =>
        matchesSearch([plan.title, clientName(plan.clientId), procedureName(plan.procedureId), plan.status, plan.notes], search)
      )
      .map((plan) => {
        const total = Number(plan.sessionsTotal) || 1;
        const done = Number(plan.sessionsDone) || 0;
        const progress = Math.min(100, Math.round((done / total) * 100));
        const pending = Number(plan.total) - Number(plan.paid);
        return `
          <tr>
            <td>
              <div class="cell-title">
                <strong>${escapeHtml(plan.title)}</strong>
                <span>${escapeHtml(clientName(plan.clientId))} | ${escapeHtml(procedureName(plan.procedureId))}</span>
              </div>
            </td>
            <td>
              <div class="progress-cell">
                <span>${escapeHtml(done)} de ${escapeHtml(total)} sesiones</span>
                <div class="progress-track"><div class="progress-fill" style="--progress: ${progress}%"></div></div>
              </div>
            </td>
            <td>${statusBadge(plan.status)}<br />Proxima ${escapeHtml(plan.next || "Sin fecha")}</td>
            <td>Pagado ${money(plan.paid)}<br />Pendiente ${money(pending)}</td>
            <td>${escapeHtml(plan.notes)}</td>
            <td>
              <div class="inline-actions">
                <button class="row-action" type="button" data-plan-session="${plan.id}">Sesion +1</button>
                <button class="row-action is-muted" type="button" data-plan-start="${plan.id}">Iniciar</button>
                <button class="row-action is-muted" type="button" data-plan-pay="${plan.id}">Abono</button>
              </div>
            </td>
          </tr>
        `;
      });

    const form = `
      <form class="data-form" data-form="plan" autocomplete="off">
        <div class="form-grid">
          ${selectField("Cliente", "clientId", clientOptions(selectedClient), selectedClient, "required")}
          ${selectField("Procedimiento", "procedureId", procedureOptions(selectedProcedure), selectedProcedure, "required")}
          ${inputField("Nombre del plan", "title", "text", prefill.title || "")}
          ${inputField("Sesiones", "sessionsTotal", "number", "6", "min='1' required")}
          ${inputField("Cada cuantos dias", "intervalDays", "number", "14", "min='1' required")}
          ${inputField("Inicio", "start", "date", todayISO(), "required")}
          ${inputField("Total", "total", "number", "0", "min='0' step='100'")}
          ${inputField("Abono inicial", "paid", "number", "0", "min='0' step='100'")}
          ${textareaField("Notas del plan", "notes")}
        </div>
        <button class="primary-action" type="submit">Guardar plan</button>
      </form>
    `;

    return renderLayout(
      moduleMetrics("planes"),
      "Nuevo plan de larga duracion",
      form,
      "Planes y paquetes",
      renderTable(["Plan", "Avance", "Estado", "Pagos", "Notas", "Acciones"], rows)
    );
  },

  citas(search) {
    const selectedClient = prefill.clientId || state.clients[0]?.id || "";
    const selectedProcedure = prefill.procedureId || state.procedures[0]?.id || "";
    const rows = state.appointments
      .filter((appointment) =>
        matchesSearch(
          [clientName(appointment.clientId), procedureName(appointment.procedureId), appointment.specialist, appointment.status],
          search
        )
      )
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .map(
        (appointment) => `
          <tr>
            <td>
              <div class="cell-title">
                <strong>${escapeHtml(clientName(appointment.clientId))}</strong>
                <span>${escapeHtml(procedureName(appointment.procedureId))}</span>
              </div>
            </td>
            <td>${escapeHtml(appointment.date)}<br />${escapeHtml(appointment.time)}</td>
            <td>${escapeHtml(appointment.specialist)}</td>
            <td>${statusBadge(appointment.status)}</td>
            <td>
              <div class="inline-actions">
                <button class="row-action" type="button" data-confirm-appointment="${appointment.id}">Confirmar</button>
                <button class="row-action is-muted" type="button" data-start-appointment="${appointment.id}">Iniciar</button>
                <button class="row-action is-warning" type="button" data-complete-appointment="${appointment.id}">Atendida</button>
              </div>
            </td>
          </tr>
        `
      );

    const form = `
      <form class="data-form" data-form="appointment" autocomplete="off">
        <div class="form-grid">
          ${selectField("Cliente", "clientId", clientOptions(selectedClient), selectedClient, "required")}
          ${selectField("Procedimiento", "procedureId", procedureOptions(selectedProcedure), selectedProcedure, "required")}
          ${inputField("Fecha", "date", "date", selectedAgendaDate || todayISO(), "required")}
          ${inputField("Hora", "time", "time", "10:00", "required")}
          ${selectField("Especialista", "specialist", specialistOptions("Andrea Morales"), "Andrea Morales", "required")}
          ${selectField("Estado", "status", [
            { value: "Pendiente", label: "Pendiente" },
            { value: "Confirmada", label: "Confirmada" },
            { value: "En curso", label: "En curso" }
          ])}
        </div>
        <button class="primary-action" type="submit">Guardar cita</button>
      </form>
    `;

    return renderLayout(
      moduleMetrics("citas"),
      "Nueva cita",
      form,
      "Agenda",
      `${renderAppointmentAgenda()}${renderTable(["Cliente", "Fecha", "Especialista", "Estado", "Acciones"], rows)}`
    );
  },

  facturacion(search) {
    const rows = state.invoices
      .filter((invoice) =>
        matchesSearch(
          [
            invoice.id,
            clientName(invoice.clientId),
            invoice.area,
            procedureName(invoice.procedureId),
            productName(invoice.productId),
            paymentMethodLabel(invoice.paymentMethod),
            invoice.notes
          ],
          search
        )
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((invoice) => {
        const subtotal = invoiceSubtotal(invoice);
        const iva = invoiceIva(invoice);
        const total = invoiceTotal(invoice);
        const balance = Number(invoice.paid || 0) - total;
        return `
          <tr>
            <td>
              <div class="cell-title">
                <strong>${escapeHtml(invoice.id)} | ${escapeHtml(clientName(invoice.clientId))}</strong>
                <span>${escapeHtml(invoice.date)} | ${escapeHtml(invoice.area)}</span>
              </div>
            </td>
            <td>${escapeHtml(procedureName(invoice.procedureId))}</td>
            <td>${escapeHtml(productName(invoice.productId))}<br />Cantidad ${escapeHtml(invoice.productQty || 0)}</td>
            <td>Servicio ${money(invoice.serviceAmount)}<br />Productos ${money(invoice.productAmount)}</td>
            <td>Subtotal ${money(subtotal)}<br />IVA ${escapeHtml(invoice.ivaRate)}%: ${money(iva)}</td>
            <td>Total ${money(total)}<br />Pago ${money(invoice.paid)}<br />Metodo ${escapeHtml(paymentMethodLabel(invoice.paymentMethod))}<br />${balance >= 0 ? "Cambio" : "Saldo"} ${money(Math.abs(balance))}</td>
            <td>${escapeHtml(invoice.notes)}</td>
          </tr>
        `;
      });

    const selectedProcedure = prefill.procedureId || state.procedures[0]?.id || "";
    const selectedProcedureData = getProcedure(selectedProcedure);
    const selectedProduct = state.products[0]?.id || "";
    const selectedProductPrice = getProduct(selectedProduct)?.price || 0;
    const defaultServiceAmount = prefill.serviceAmount || selectedProcedureData?.price || 0;
    const defaultArea = procedureArea(selectedProcedureData);
    const form = `
      <form class="data-form" data-form="invoice" autocomplete="off">
        <div class="form-grid">
          ${inputField("Fecha", "date", "date", todayISO(), "required")}
          ${selectField("Cliente", "clientId", clientOptions(prefill.clientId || state.clients[0]?.id || ""), prefill.clientId || state.clients[0]?.id || "", "required")}
          ${selectField("Area", "area", [
            { value: "Belleza", label: "Belleza - pelo o unas" },
            { value: "Estetica", label: "Estetica - tratamientos" }
          ], defaultArea, "required")}
          ${selectField("Procedimiento", "procedureId", procedureOptions(selectedProcedure), selectedProcedure, "required")}
          ${selectField("Producto llevado", "productId", productOptions(selectedProduct), selectedProduct)}
          ${inputField("Cantidad producto", "productQty", "number", "1", "min='0' required")}
          ${inputField("Monto servicio", "serviceAmount", "number", defaultServiceAmount, "min='0' step='100' required")}
          ${inputField("Monto productos", "productAmount", "number", selectedProductPrice, "min='0' step='100' required")}
          ${inputField("IVA %", "ivaRate", "number", "13", "min='0' step='0.01' required")}
          ${inputField("Pago cliente", "paid", "number", "0", "min='0' step='100' required")}
          ${selectField("Metodo de pago", "paymentMethod", [
            { value: "Efectivo", label: "Efectivo" },
            { value: "Tarjeta", label: "Tarjeta" }
          ], "Efectivo", "required")}
          ${textareaField("Notas de factura", "notes")}
        </div>
        <button class="primary-action" type="submit">Guardar factura</button>
      </form>
    `;

    return renderLayout(
      moduleMetrics("facturacion"),
      "Nueva factura",
      form,
      "Historial de facturacion",
      renderTable(["Factura", "Tratamiento", "Productos", "Montos", "IVA", "Pago", "Notas"], rows)
    );
  },

  usuarios(search) {
    const rows = state.users
      .filter((user) => matchesSearch([user.name, user.email, roleLabel(user.role), user.function], search))
      .map((user) => {
        const permissionBadges = permissionModules
          .filter((moduleName) => user.permissions?.[moduleName]?.read)
          .map((moduleName) => {
            const mode = user.permissions?.[moduleName]?.write ? "RW" : "R";
            return `<span class="access-chip">${escapeHtml(moduleNames[moduleName])} ${mode}</span>`;
          })
          .join("");
        return `
          <tr>
            <td>
              <div class="cell-title">
                <strong>${escapeHtml(user.name)}</strong>
                <span>${escapeHtml(user.id)} | ${escapeHtml(user.email)}</span>
              </div>
            </td>
            <td>${escapeHtml(roleLabel(user.role))}<br />${escapeHtml(user.function)}</td>
            <td>${user.active ? statusBadge("Activo") : statusBadge("Pausado")}</td>
            <td><div class="permission-list">${permissionBadges}</div></td>
            <td>
              <div class="inline-actions">
                <button class="row-action" type="button" data-switch-user="${user.id}">
                  ${user.id === state.currentUserId ? "Actual" : "Usar cuenta"}
                </button>
                <button class="row-action is-muted" type="button" data-toggle-user="${user.id}">
                  ${user.active ? "Pausar" : "Activar"}
                </button>
              </div>
            </td>
          </tr>
        `;
      });

    const roleOptions = Object.entries(rolePresets).map(([value, preset]) => ({
      value,
      label: preset.label
    }));
    const form = `
      <form class="data-form" data-form="user" autocomplete="off">
        <div class="form-grid">
          ${inputField("Nombre", "name", "text", "", "required")}
          ${inputField("Email", "email", "email", "", "required")}
          ${selectField("Funcion", "role", roleOptions, "recepcion", "required")}
          ${inputField("Detalle de funcion", "function", "text", "Recepcion y agenda", "required")}
        </div>
        <div class="permission-preview">
          <strong>Funciones base</strong>
          <span>Super usuario y administrador: todo. Recepcion: clientes/citas/facturacion. Especialista: sesiones. Inventario: productos.</span>
        </div>
        <button class="primary-action" type="submit">Guardar usuario</button>
      </form>
    `;

    return renderLayout(
      moduleMetrics("usuarios"),
      "Nuevo usuario",
      form,
      "Usuarios y permisos",
      renderTable(["Usuario", "Funcion", "Estado", "Permisos", "Acciones"], rows)
    );
  }
};

function handleSubmit(event) {
  if (event.target === elements.loginForm) {
    event.preventDefault();
    handleLogin();
    return;
  }

  if (event.target === elements.reasonForm) {
    event.preventDefault();
    if (!requireWrite("inventario")) return;
    confirmStockUse();
    return;
  }

  const form = event.target.closest(".data-form");
  if (!form) return;
  event.preventDefault();
  if (!requireWrite(currentModule)) return;

  const data = Object.fromEntries(new FormData(form).entries());
  const handlers = {
    client: addClient,
    product: addProduct,
    procedure: addProcedure,
    active: addActiveProcedure,
    plan: addPlan,
    appointment: addAppointment,
    invoice: addInvoice,
    user: addUser
  };

  handlers[form.dataset.form]?.(data);
}

function addClient(data) {
  state.clients.unshift({
    id: nextId("CL", state.clients),
    name: data.name.trim(),
    phone: data.phone.trim(),
    email: data.email.trim(),
    lastVisit: data.lastVisit || todayISO(),
    notes: data.notes.trim()
  });
  persistAndRender("Cliente guardado");
}

function addProduct(data) {
  state.products.unshift({
    id: nextId("PRD", state.products),
    name: data.name.trim(),
    category: data.category,
    stock: Number(data.stock || 0),
    min: Number(data.min || 0),
    unit: data.unit.trim(),
    cost: Number(data.cost || 0),
    price: Number(data.price || 0),
    supplier: data.supplier.trim()
  });
  persistAndRender("Producto guardado");
}

function addProcedure(data) {
  state.procedures.unshift({
    id: nextId("SRV", state.procedures),
    name: data.name.trim(),
    category: data.category,
    duration: Number(data.duration || 0),
    price: Number(data.price || 0),
    sessions: Number(data.sessions || 1),
    productId: data.productId,
    aftercare: data.aftercare.trim()
  });
  persistAndRender("Procedimiento guardado");
}

function addActiveProcedure(data) {
  state.activeProcedures.unshift({
    id: nextId("ACT", state.activeProcedures),
    clientId: data.clientId,
    procedureId: data.procedureId,
    specialist: data.specialist.trim(),
    status: "En progreso",
    started: todayISO(),
    next: data.next || todayISO(),
    notes: data.notes.trim(),
    productsUsed: []
  });
  prefill = {};
  persistAndRender("Procedimiento iniciado");
}

function addPlan(data) {
  const procedure = getProcedure(data.procedureId);
  const client = state.clients.find((item) => item.id === data.clientId);
  const sessionsTotal = Number(data.sessionsTotal || procedure?.sessions || 1);
  const title = data.title.trim() || `${procedure?.name || "Plan"} - ${client?.name || "Cliente"}`;
  const total = Number(data.total || (procedure?.price || 0) * sessionsTotal);
  const start = data.start || todayISO();

  state.plans.unshift({
    id: nextId("PLN", state.plans),
    clientId: data.clientId,
    procedureId: data.procedureId,
    title,
    sessionsTotal,
    sessionsDone: 0,
    intervalDays: Number(data.intervalDays || 14),
    start,
    next: start,
    paid: Number(data.paid || 0),
    total,
    status: "Activo",
    notes: data.notes.trim()
  });
  prefill = {};
  persistAndRender("Plan guardado");
}

function addAppointment(data) {
  state.appointments.unshift({
    id: nextId("CIT", state.appointments),
    clientId: data.clientId,
    procedureId: data.procedureId,
    date: data.date,
    time: data.time,
    specialist: data.specialist.trim(),
    status: data.status
  });
  prefill = {};
  persistAndRender("Cita guardada");
}

function addInvoice(data) {
  const productQty = Number(data.productQty || 0);
  const product = data.productId ? getProduct(data.productId) : null;
  if (product && productQty > Number(product.stock)) {
    showToast("No hay suficiente stock para facturar ese producto");
    return;
  }

  const invoice = {
    id: nextId("FAC", state.invoices),
    date: data.date || todayISO(),
    clientId: data.clientId,
    area: data.area,
    procedureId: data.procedureId,
    productId: data.productId,
    productQty,
    serviceAmount: Number(data.serviceAmount || 0),
    productAmount: Number(data.productAmount || 0),
    ivaRate: Number(data.ivaRate || 13),
    paid: Number(data.paid || 0),
    paymentMethod: data.paymentMethod === "Tarjeta" ? "Tarjeta" : "Efectivo",
    notes: data.notes.trim()
  };

  state.invoices.unshift(invoice);

  if (product && productQty > 0) {
    product.stock = Number(product.stock) - productQty;
    state.stockMovements = state.stockMovements || [];
    state.stockMovements.unshift({
      id: nextId("MOV", state.stockMovements),
      productId: product.id,
      type: "Salida",
      quantity: productQty,
      reason: `Venta en factura ${invoice.id}`,
      date: invoice.date
    });
  }

  prefill = {};
  persistAndRender("Factura guardada");
}

function addUser(data) {
  if (state.users.length >= allowedUserIds.length) {
    showToast("Solo se mantienen los 5 usuarios autorizados");
    return;
  }

  const role = rolePresets[data.role] ? data.role : "recepcion";
  state.users.push({
    id: nextId("USR", state.users),
    name: data.name.trim(),
    email: data.email.trim(),
    role,
    function: data.function.trim(),
    active: true,
    passwordHash: fallbackPasswordHash,
    permissions: clone(rolePresets[role].permissions)
  });
  persistAndRender("Usuario guardado");
}

function persistAndRender(message) {
  saveState();
  renderAll();
  showToast(message);
}

function handleClick(event) {
  const moduleButton = event.target.closest("[data-module]");
  const menuButton = event.target.closest("[data-menu]");
  const menuAction = event.target.closest("[data-menu-module], [data-menu-switch], [data-menu-branch], [data-menu-logout], [data-menu-label]");
  const sideAction = event.target.closest("[data-side-action], [data-target-module]");
  const quickButton = event.target.closest("[data-quick]");
  const agendaDay = event.target.closest("[data-agenda-date]");

  if (moduleButton) {
    prefill = {};
    setModule(moduleButton.dataset.module);
    return;
  }

  if (menuButton) {
    openDropdown(menuButton);
    return;
  }

  if (menuAction) {
    const targetModule = menuAction.dataset.menuModule;
    const targetUser = menuAction.dataset.menuSwitch;
    const targetBranch = menuAction.dataset.menuBranch;
    const shouldLogout = menuAction.dataset.menuLogout;
    if (shouldLogout) {
      logout();
      return;
    }
    if (targetBranch) {
      switchBranch(targetBranch);
      return;
    }
    if (targetUser) {
      switchUser(targetUser);
      closeDropdown();
      return;
    }
    if (targetModule) {
      prefill = {};
      setModule(targetModule);
    }
    else showToast(`${menuAction.dataset.menuLabel} abierto`);
    closeDropdown();
    return;
  }

  if (!event.target.closest("#dropdownLayer")) closeDropdown();

  if (sideAction) {
    handleSideAction(sideAction);
    return;
  }

  if (quickButton) {
    if (quickButton.dataset.quick === "logout") {
      logout();
      return;
    }
    const labels = {
      sync: "Datos sincronizados",
      transfer: "Turno cambiado",
      logout: "Sesion cerrada"
    };
    showToast(labels[quickButton.dataset.quick]);
    return;
  }

  if (agendaDay) {
    selectedAgendaDate = agendaDay.dataset.agendaDate;
    renderView();
    showToast(`Agenda del ${selectedAgendaDate}`);
    return;
  }

  handleRowActions(event);
}

function handleSideAction(button) {
  if (button.dataset.targetModule) {
    setModule(button.dataset.targetModule);
    return;
  }

  if (button.dataset.sideAction === "focusForm") {
    if (!requireWrite(currentModule)) return;
    elements.operationsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => document.querySelector(".data-form input, .data-form select, .data-form textarea")?.focus(), 250);
    return;
  }

  if (button.dataset.sideAction === "showAlerts") {
    if (!canView("inventario")) {
      showToast("Este usuario no tiene acceso a inventario");
      return;
    }
    setModule("inventario", { keepSearch: true });
    elements.searchInput.value = "stock bajo";
    renderView();
    showToast("Mostrando inventario con alertas");
  }
}

function handleRowActions(event) {
  const createPlanClient = event.target.closest("[data-create-plan-client]");
  const startClient = event.target.closest("[data-start-client]");
  const scheduleClient = event.target.closest("[data-schedule-client]");
  const invoiceClient = event.target.closest("[data-invoice-client]");
  const startProcedure = event.target.closest("[data-start-procedure]");
  const planProcedure = event.target.closest("[data-plan-procedure]");
  const invoiceProcedure = event.target.closest("[data-invoice-procedure]");
  const stockAdd = event.target.closest("[data-stock-add]");
  const stockUse = event.target.closest("[data-stock-use]");
  const consumeActive = event.target.closest("[data-consume-active]");
  const toggleActive = event.target.closest("[data-toggle-active]");
  const finishActive = event.target.closest("[data-finish-active]");
  const planSession = event.target.closest("[data-plan-session]");
  const planStart = event.target.closest("[data-plan-start]");
  const planPay = event.target.closest("[data-plan-pay]");
  const confirmAppointment = event.target.closest("[data-confirm-appointment]");
  const startAppointment = event.target.closest("[data-start-appointment]");
  const completeAppointment = event.target.closest("[data-complete-appointment]");
  const switchUserButton = event.target.closest("[data-switch-user]");
  const toggleUserButton = event.target.closest("[data-toggle-user]");

  if (switchUserButton) {
    switchUser(switchUserButton.dataset.switchUser);
    return;
  }

  if (toggleUserButton) {
    if (!requireWrite("usuarios")) return;
    toggleUserStatus(toggleUserButton.dataset.toggleUser);
    return;
  }

  const needsWrite = [
    createPlanClient,
    startClient,
    scheduleClient,
    invoiceClient,
    startProcedure,
    planProcedure,
    invoiceProcedure,
    stockAdd,
    stockUse,
    consumeActive,
    toggleActive,
    finishActive,
    planSession,
    planStart,
    planPay,
    confirmAppointment,
    startAppointment,
    completeAppointment
  ].some(Boolean);

  if (needsWrite && !requireWrite(currentModule)) return;

  if (createPlanClient) {
    prefill = { clientId: createPlanClient.dataset.createPlanClient };
    setModule("planes");
    return;
  }

  if (startClient) {
    prefill = { clientId: startClient.dataset.startClient };
    setModule("enCurso");
    return;
  }

  if (scheduleClient) {
    prefill = { clientId: scheduleClient.dataset.scheduleClient };
    setModule("citas");
    return;
  }

  if (invoiceClient) {
    prefill = { clientId: invoiceClient.dataset.invoiceClient };
    setModule("facturacion");
    return;
  }

  if (startProcedure) {
    prefill = { procedureId: startProcedure.dataset.startProcedure };
    setModule("enCurso");
    return;
  }

  if (planProcedure) {
    const procedure = getProcedure(planProcedure.dataset.planProcedure);
    prefill = {
      procedureId: planProcedure.dataset.planProcedure,
      title: procedure ? `${procedure.name} por sesiones` : ""
    };
    setModule("planes");
    return;
  }

  if (invoiceProcedure) {
    const procedure = getProcedure(invoiceProcedure.dataset.invoiceProcedure);
    prefill = {
      procedureId: invoiceProcedure.dataset.invoiceProcedure,
      serviceAmount: procedure?.price || 0
    };
    setModule("facturacion");
    return;
  }

  if (stockAdd) {
    updateStock(stockAdd.dataset.stockAdd, 1, "Entrada registrada");
    return;
  }

  if (stockUse) {
    openStockReasonModal(stockUse.dataset.stockUse);
    return;
  }

  if (consumeActive) {
    consumeProductForActive(consumeActive.dataset.consumeActive);
    return;
  }

  if (toggleActive) {
    toggleActiveStatus(toggleActive.dataset.toggleActive);
    return;
  }

  if (finishActive) {
    finishActiveProcedure(finishActive.dataset.finishActive);
    return;
  }

  if (planSession) {
    registerPlanSession(planSession.dataset.planSession);
    return;
  }

  if (planStart) {
    startPlanSession(planStart.dataset.planStart);
    return;
  }

  if (planPay) {
    registerPlanPayment(planPay.dataset.planPay);
    return;
  }

  if (confirmAppointment) {
    updateAppointmentStatus(confirmAppointment.dataset.confirmAppointment, "Confirmada");
    return;
  }

  if (startAppointment) {
    startAppointmentProcedure(startAppointment.dataset.startAppointment);
    return;
  }

  if (completeAppointment) {
    updateAppointmentStatus(completeAppointment.dataset.completeAppointment, "Atendida");
  }
}

function switchUser(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  if (currentUser()?.role !== "super") {
    showToast("Solo el super usuario puede cambiar cuentas");
    return;
  }
  if (!user.active) {
    showToast("Ese usuario esta pausado");
    return;
  }
  state.currentUserId = userId;
  saveSessionUser(userId);
  if (!canView(currentModule)) {
    currentModule = firstAllowedModule();
  }
  storeStateLocally();
  renderAll();
  closeDropdown();
  showToast(`Usuario activo: ${user.name}`);
}

function toggleUserStatus(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  if (user.id === state.currentUserId) {
    showToast("No puede pausar el usuario activo");
    return;
  }
  user.active = !user.active;
  persistAndRender(user.active ? "Usuario activado" : "Usuario pausado");
}

function updateStock(productId, delta, message, reason = "") {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  const nextStock = Number(product.stock) + delta;
  if (nextStock < 0) {
    showToast("No hay stock disponible");
    return;
  }
  product.stock = nextStock;
  if (reason) {
    state.stockMovements = state.stockMovements || [];
    state.stockMovements.unshift({
      id: nextId("MOV", state.stockMovements),
      productId,
      type: delta < 0 ? "Salida" : "Entrada",
      quantity: Math.abs(delta),
      reason,
      date: todayISO()
    });
  }
  persistAndRender(message);
}

function confirmStockUse() {
  const reason = elements.reasonText.value.trim().replace(/\s+/g, " ");
  if (!pendingStockUseProductId) return;

  if (!reason) {
    showToast("Escriba el motivo para descontar inventario");
    elements.reasonText.focus();
    return;
  }

  if (countWords(reason) > 100) {
    elements.reasonText.value = trimToWordLimit(reason, 100);
    updateReasonWordCount();
    showToast("El motivo tiene limite de 100 palabras");
    return;
  }

  const productId = pendingStockUseProductId;
  closeStockReasonModal();
  updateStock(productId, -1, "Producto descontado con motivo", reason);
}

function consumeProductForActive(activeId) {
  const active = state.activeProcedures.find((item) => item.id === activeId);
  const procedure = getProcedure(active?.procedureId);
  if (!procedure?.productId) {
    showToast("Este procedimiento no tiene producto asociado");
    return;
  }
  const product = state.products.find((item) => item.id === procedure.productId);
  if (!product || Number(product.stock) <= 0) {
    showToast("No hay stock para consumir");
    return;
  }
  product.stock = Number(product.stock) - 1;
  active.productsUsed.push(product.id);
  persistAndRender(`${product.name} descontado`);
}

function toggleActiveStatus(activeId) {
  const active = state.activeProcedures.find((item) => item.id === activeId);
  if (!active || active.status === "Finalizado") return;
  active.status = active.status === "Pausado" ? "En progreso" : "Pausado";
  persistAndRender(`Estado actualizado: ${active.status}`);
}

function finishActiveProcedure(activeId) {
  const active = state.activeProcedures.find((item) => item.id === activeId);
  if (!active) return;
  active.status = "Finalizado";
  active.next = "";
  persistAndRender("Procedimiento finalizado");
}

function registerPlanSession(planId) {
  const plan = state.plans.find((item) => item.id === planId);
  if (!plan || plan.status === "Completado") return;

  plan.sessionsDone = Math.min(Number(plan.sessionsTotal), Number(plan.sessionsDone) + 1);
  if (Number(plan.sessionsDone) >= Number(plan.sessionsTotal)) {
    plan.status = "Completado";
    plan.next = "";
  } else {
    plan.status = "Activo";
    plan.next = addDays(plan.next || todayISO(), Number(plan.intervalDays));
  }
  persistAndRender("Sesion registrada");
}

function startPlanSession(planId) {
  const plan = state.plans.find((item) => item.id === planId);
  if (!plan) return;
  state.activeProcedures.unshift({
    id: nextId("ACT", state.activeProcedures),
    clientId: plan.clientId,
    procedureId: plan.procedureId,
    specialist: "Por asignar",
    status: "En progreso",
    started: todayISO(),
    next: plan.next || todayISO(),
    notes: `Sesion ${Number(plan.sessionsDone) + 1} de ${plan.sessionsTotal} - ${plan.title}`,
    productsUsed: []
  });
  setModule("enCurso", { silent: true });
  persistAndRender("Sesion del plan iniciada");
}

function registerPlanPayment(planId) {
  const plan = state.plans.find((item) => item.id === planId);
  if (!plan) return;
  const pending = Math.max(0, Number(plan.total) - Number(plan.paid));
  const payment = Math.min(25000, pending);
  if (payment <= 0) {
    showToast("El plan ya esta pagado");
    return;
  }
  plan.paid = Number(plan.paid) + payment;
  persistAndRender(`Abono registrado: ${money(payment)}`);
}

function updateAppointmentStatus(appointmentId, status) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  if (!appointment) return;
  appointment.status = status;
  persistAndRender(`Cita marcada como ${status}`);
}

function startAppointmentProcedure(appointmentId) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  if (!appointment) return;
  appointment.status = "En curso";
  state.activeProcedures.unshift({
    id: nextId("ACT", state.activeProcedures),
    clientId: appointment.clientId,
    procedureId: appointment.procedureId,
    specialist: appointment.specialist,
    status: "En progreso",
    started: todayISO(),
    next: appointment.date,
    notes: `Iniciado desde cita ${appointment.id}`,
    productsUsed: []
  });
  setModule("enCurso", { silent: true });
  persistAndRender("Cita enviada a procedimientos en curso");
}

function openDropdown(button) {
  const menuName = button.dataset.menu;
  const options = dropdownOptions(menuName);
  const rect = button.getBoundingClientRect();

  elements.dropdownLayer.innerHTML = options
    .map((item) => {
      const moduleAttr = item.module ? ` data-menu-module="${item.module}"` : "";
      const userAttr = item.switchUser ? ` data-menu-switch="${item.switchUser}"` : "";
      const branchAttr = item.branch ? ` data-menu-branch="${item.branch}"` : "";
      const logoutAttr = item.logout ? ` data-menu-logout="true"` : "";
      return `<button type="button"${moduleAttr}${userAttr}${branchAttr}${logoutAttr} data-menu-label="${escapeHtml(item.label)}">${escapeHtml(item.label)}<span>&gt;</span></button>`;
    })
    .join("");
  elements.dropdownLayer.style.left = `${Math.min(rect.left, window.innerWidth - 244)}px`;
  elements.dropdownLayer.classList.add("is-open");
}

function dropdownOptions(menuName) {
  if (menuName === "usuario") {
    const activeUser = currentUser();
    const switchers =
      activeUser.role === "super"
        ? state.users
            .filter((user) => user.active && user.id !== state.currentUserId)
            .map((user) => ({ label: `Cambiar a ${user.name}`, switchUser: user.id }))
        : [];
    return [{ label: `${activeUser.name} - ${roleLabel(activeUser.role)}` }, ...switchers];
  }

  if (menuName === "sucursal") {
    return branchOptions.map((branch) => ({
      label: branch.label,
      branch: branch.id
    }));
  }

  return menuItems[menuName] || [];
}

function closeDropdown() {
  elements.dropdownLayer.classList.remove("is-open");
}

elements.searchInput.addEventListener("input", renderView);
elements.reasonText.addEventListener("input", updateReasonWordCount);
elements.reasonCancelButton.addEventListener("click", closeStockReasonModal);
elements.reasonSecondaryCancelButton.addEventListener("click", closeStockReasonModal);
elements.reasonModal.addEventListener("click", (event) => {
  if (event.target === elements.reasonModal) {
    closeStockReasonModal();
  }
});

document.addEventListener("submit", handleSubmit);
document.addEventListener("click", handleClick);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDropdown();
    closeStockReasonModal();
  }
});

restoreSession();
