const storageKey = "salonSuiteStateV2";
const authSessionKey = "salonSuiteSessionUserId";
const apiSessionTokenKey = "salonSuiteApiSessionToken";
const fallbackPasswordHash = "d3ad9315b7be5dd53b31a273b3b3aba5defe700808305aa16a3062b76658a791";
const receptionPasswordHash = "5813f24ae4432b277c8c92a78bf035caaa8f5a9ad0031441f5eccd2d4c0e2fd0";
const monicaPasswordHash = "e7d081ee45073bc0da9fd633a609db90be0adc2abac6ac47e79e375544e81c22";

const permissionModules = ["clientes", "inventario", "procedimientos", "enCurso", "planes", "citas", "facturacion", "proveedores", "personal", "usuarios"];

const moduleNames = {
  clientes: "Clientes",
  inventario: "Inventario",
  procedimientos: "Procedimientos",
  enCurso: "En curso",
  planes: "Planes",
  citas: "Citas",
  facturacion: "Facturacion",
  proveedores: "Cuentas por pagar",
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
  gerente: {
    label: "Gerente",
    permissions: buildPermissions(
      ["clientes", "inventario", "procedimientos", "enCurso", "planes", "citas", "facturacion", "proveedores", "personal"],
      ["clientes", "inventario", "citas", "facturacion", "proveedores", "personal"]
    )
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
const branchDataKeys = ["clients", "products", "procedures", "activeProcedures", "plans", "appointments", "invoices", "stockMovements", "locations", "stations", "payables", "specialists"];

const branchOptions = [
  { id: "rohrmoser", label: "Chic & Co Rohrmoser" },
  { id: "alajuela", label: "Chic & Co Alajuela" }
];

// Sucursales validas para atar una cuenta. "all" = todas las sedes. Se declara
// junto a branchOptions porque normalizeUser lo usa al construir el estado
// inicial, antes de que corra el resto del archivo.
const branchScopeValues = ["all", ...branchOptions.map((branch) => branch.id)];

// Colecciones de planilla / RRHH en el nivel superior del estado. `staff` es el
// registro de empleados (datos fijos); `commissions` guarda los ajustes de cada
// quincena por persona; `benefits` y `vacations` el resto de RRHH.
const payrollKeys = ["staff", "commissions", "benefits", "vacations"];

// Deduccion obrera de la CCSS sobre el total del salario. Coincide con la
// planilla real del salon (10.83%). Editable aqui si cambia la tasa.
const CCSS_RATE = 0.1083;

// Puestos del personal (para el registro de empleados).
const puestoOptions = ["Estilista", "Esteticista", "Manicurista", "Administradora", "Recepcionista", "Mercadeo", "Bodega", "Otro"];

// Categorias de especialista: cada persona atiende solo su tipo de servicio.
const specialistCategories = [
  { id: "estilista", label: "Estilista" },
  { id: "esteticista", label: "Esteticista" },
  { id: "manicurista", label: "Manicurista" }
];

const procedureSpecialists = [
  { name: "Andrea Morales", focus: "Faciales", category: "esteticista" },
  { name: "Paola Jimenez", focus: "Color", category: "estilista" },
  { name: "Camila Soto", focus: "Cabello", category: "estilista" },
  { name: "Natalia Vargas", focus: "Laser", category: "esteticista" },
  { name: "Sofia Marin", focus: "Unas", category: "manicurista" },
  { name: "Valeria Campos", focus: "Depilacion", category: "esteticista" },
  { name: "Daniela Rojas", focus: "Masajes", category: "esteticista" },
  { name: "Mariana Arias", focus: "Cejas", category: "estilista" },
  { name: "Laura Quiros", focus: "Tratamientos", category: "esteticista" },
  { name: "Fernanda Solis", focus: "Maquillaje", category: "estilista" },
  { name: "Karla Mendez", focus: "Cabello", category: "estilista" },
  { name: "Melissa Castro", focus: "Faciales", category: "esteticista" },
  { name: "Gabriela Mora", focus: "Unas", category: "manicurista" },
  { name: "Isabel Pineda", focus: "Laser", category: "esteticista" },
  { name: "Lucia Herrera", focus: "Color", category: "estilista" },
  { name: "Monica Salazar", focus: "Depilacion", category: "esteticista" },
  { name: "Rebeca Chacon", focus: "Masajes", category: "esteticista" },
  { name: "Elena Navarro", focus: "Cejas", category: "estilista" },
  { name: "Cristina Vega", focus: "Tratamientos", category: "esteticista" },
  { name: "Jimena Fuentes", focus: "Maquillaje", category: "estilista" }
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
    stockMovements: [],
    locations: [],
    stations: [],
    payables: [],
    specialists: []
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
  dashboard: {
    title: "Dashboard de direccion",
    description: "Saldos, facturas y ventas en vivo por sucursal, colaborador, servicio y producto.",
    actions: []
  },
  integraciones: {
    title: "Integraciones",
    description: "Conecta las aplicaciones que usa el negocio: facturacion, marketing y correo.",
    actions: []
  },
  proveedores: {
    title: "Cuentas por pagar",
    description: "Facturas de proveedores por pagar: cargalas, adjunta factura y comprobante, y controla que ya se pagaron.",
    actions: [{ label: "Nueva factura por pagar", action: "focusForm" }]
  },
  personal: {
    title: "Personal",
    description: "El equipo de esta sucursal: categoria, servicios que ofrece, correo, acceso al sistema y traslados temporales a otra sede.",
    actions: [{ label: "Agregar persona", action: "focusForm" }]
  },
  planilla: {
    title: "Planilla y RRHH",
    description: "Comisiones, beneficios y vacaciones del personal. Acceso restringido por el super usuario.",
    actions: []
  },
  clientes: {
    title: "Clientes",
    description: "Registra informacion de contacto, historial, notas y acciones rapidas para planes o citas.",
    actions: [
      { label: "Nuevo cliente", action: "focusForm" },
      { label: "Importar clientes", action: "importClients" },
      { label: "Crear plan", module: "planes" }
    ]
  },
  inventario: {
    title: "Inventario",
    description: "Productos, stock minimo, costos y donde esta guardado cada cosa.",
    actions: [
      { label: "Nuevo producto", action: "focusForm" },
      { label: "Ubicaciones", action: "manageLocations" },
      { label: "Ver alertas", action: "showAlerts" }
    ]
  },
  procedimientos: {
    title: "Procedimientos esteticos",
    description: "Define servicios, duracion, precio, producto asociado y cuidados posteriores.",
    actions: [
      { label: "Nuevo procedimiento", action: "focusForm" },
      { label: "Ver en curso", module: "enCurso" }
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
      { label: "Nuevo usuario", action: "focusForm" }
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

// security-upgrade.js define estas tres, pero carga despues de que este
// archivo ejecute restoreSession() al final. Sin los sustitutos, la primera
// recarga con sesion abierta lanzaba `storeStateLocally is not defined` y
// showApp() se cortaba a la mitad. security-upgrade.js las reasigna al
// cargar, asi que estos cuerpos vacios solo cubren ese hueco de arranque.
var storeStateLocally = function () {};
var connectRealtimeSync = function () {};
var disconnectRealtimeSync = function () {};

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
  dropdownLayer: document.querySelector("#dropdownLayer"),
  toast: document.querySelector("#toast"),
  reasonModal: document.querySelector("#inventoryReasonModal"),
  reasonForm: document.querySelector("#inventoryReasonForm"),
  reasonProductName: document.querySelector("#reasonProductName"),
  reasonText: document.querySelector("#reasonText"),
  reasonWordCount: document.querySelector("#reasonWordCount"),
  reasonCancelButton: document.querySelector("#reasonCancelButton"),
  reasonSecondaryCancelButton: document.querySelector("#reasonSecondaryCancelButton"),
  currentUserName: document.querySelector("#currentUserName"),
  currentBranchName: document.querySelector("#currentBranchName"),
  loginScreen: document.querySelector("#loginScreen"),
  loginForm: document.querySelector("#loginForm"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  loginError: document.querySelector("#loginError")
};

let pendingStockUseProductId = "";
let inventoryFilter = "all";

// Deja cualquier estado -del backend, de localStorage o de un respaldo- en la
// forma que espera la aplicacion: colecciones completas, las dos sucursales
// reconstruidas y la sucursal activa volcada al nivel superior de `state`.
// Sin esto, un estado adoptado del backend puede mostrar los datos de la otra
// sucursal hasta que el usuario la cambia a mano.
function normalizeStateSnapshot(snapshot) {
  const parsed = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {};
  const merged = { ...clone(defaultState), ...parsed };

  branchDataKeys.forEach((key) => {
    if (!Array.isArray(merged[key])) merged[key] = [];
  });

  // Colecciones de planilla: siempre arrays. Para quien no tiene acceso a RRHH
  // el servidor no las envia, asi que quedan vacias (no las vera de todos modos).
  payrollKeys.forEach((key) => {
    if (!Array.isArray(merged[key])) merged[key] = [];
  });

  const fallbackBranches = defaultBranches();
  const savedBranches = parsed.branches || {};
  const legacyRohrmoserData = pickBranchData(merged);
  merged.branches = branchOptions.reduce((branches, branch) => {
    // Cuando el servidor ya envio sucursales (estado real), una sucursal ausente
    // es una sede que ESTA CUENTA no puede ver (esta atada a otra): se rellena
    // VACIA, nunca con datos de demostracion. Sembrarla con la demo generaba
    // registros fantasma en el navegador y un sync forzado en cada inicio de
    // sesion. La semilla solo aplica en una instalacion sin estado guardado.
    const fallback = parsed.branches
      ? emptyBranchData()
      : branch.id === "rohrmoser"
        ? legacyRohrmoserData
        : fallbackBranches[branch.id];
    branches[branch.id] = normalizeBranchData(savedBranches[branch.id], fallback);
    return branches;
  }, {});

  // Conserva cualquier sucursal guardada que todavia no este en branchOptions.
  // Escalar el negocio a una tercera sucursal no debe perder su data solo
  // porque el selector aun no la lista: sus datos viajan intactos (y el
  // dashboard los suma) hasta que se agregue a branchOptions y sea navegable.
  const knownBranchIds = new Set(branchOptions.map((branch) => branch.id));
  Object.keys(savedBranches).forEach((branchId) => {
    if (!knownBranchIds.has(branchId)) {
      merged.branches[branchId] = normalizeBranchData(savedBranches[branchId], emptyBranchData());
    }
  });

  merged.currentBranchId = branchOptions.some((branch) => branch.id === merged.currentBranchId)
    ? merged.currentBranchId
    : "rohrmoser";
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
}

function loadState() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return createInitialState();
    return normalizeStateSnapshot(JSON.parse(saved));
  } catch (error) {
    return createInitialState();
  }
}

function normalizeUser(user) {
  const role = rolePresets[user.role] ? user.role : "recepcion";
  const basePermissions = clone(rolePresets[role].permissions);
  const savedPermissions = user.permissions || {};
  // Super y admin siempre ven todas las sucursales; el resto conserva la sede
  // que se le asigno, o "all" si nunca se le asigno una (compatibilidad).
  const savedScope = typeof user.branchScope === "string" ? user.branchScope.trim() : "";
  const branchScope =
    role === "super" || role === "admin"
      ? "all"
      : branchScopeValues.includes(savedScope) && savedScope
        ? savedScope
        : "all";
  // Acceso a planilla/RRHH. El super siempre lo tiene; el resto solo si el
  // super se lo asigno. Se guarda como booleano explicito.
  const payrollAccess = role === "super" ? true : user.payrollAccess === true;
  return {
    ...user,
    role,
    branchScope,
    payrollAccess,
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

// Garantiza que existan las cuentas de sistema y que el super usuario siga
// siendo super y activo, PERO conserva todas las cuentas de personal que se
// hayan agregado (el salon puede tener muchas colaboradoras). La identidad
// guardada (correo y nombre) manda sobre la plantilla local: de lo contrario
// cada guardado borraria el correo que el servidor tiene registrado.
function ensureSystemUsers(users) {
  const usersById = new Map((users || []).map((user) => [user.id, normalizeUser(user)]));

  // El super usuario siempre existe, es super y esta activo.
  const savedSuperUser = usersById.get(superUserAccount.id);
  usersById.set(
    superUserAccount.id,
    normalizeUser({
      ...superUserAccount,
      ...(savedSuperUser || {}),
      role: "super",
      active: true,
      permissions: rolePresets.super.permissions
    })
  );

  // Solo la cuenta raiz (USR-000) se garantiza siempre —ya se hizo arriba— para
  // que nunca haya un bloqueo total de super. Las demas cuentas semilla
  // (USR-001..004) NO se vuelven a inyectar: si el super las elimina, se quedan
  // eliminadas. Antes se "rellenaban" al recargar y una cuenta borrada reaparecia
  // sola (y hasta se re-guardaba en el backend). El servidor ya protege la raiz
  // y exige al menos un super activo, asi que quitar el backfill es seguro.

  // Orden estable: primero las cuentas de sistema que aun existan, luego el
  // personal agregado.
  const systemFirst = allowedUserIds.filter((id) => usersById.has(id));
  const rest = [...usersById.keys()].filter((id) => !allowedUserIds.includes(id));
  return [...systemFirst, ...rest].map((id) => usersById.get(id)).filter(Boolean);
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
  // Blindaje en cliente: una cuenta atada no puede cambiar a una sede que no le
  // toca. El servidor ya no le envia esos datos, pero esto evita hasta el
  // intento y un estado local inconsistente.
  if (!canAccessBranch(branchId)) {
    showToast("Su cuenta solo tiene acceso a su sucursal.");
    return;
  }
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

// Cumpleaños en formato corto "18 jun": el dia y el mes son lo util para
// felicitar; el año se omite.
function birthdayLabel(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const month = monthNames[Number(match[2]) - 1] || "";
  return `${Number(match[3])} ${month.slice(0, 3).toLowerCase()}`;
}

// Sufijo aleatorio colision-resistente para el id. Sin esto, dos sesiones que
// parten de la misma lista generan el MISMO id para registros distintos y la
// fusion los trata como uno solo: uno pisa al otro de forma permanente y sin
// avisar. El id es la identidad; el numero de secuencia es solo legibilidad.
function idSuffix() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, "").slice(0, 6);
    }
  } catch (error) {
    /* contexto sin crypto: caemos al aleatorio de abajo */
  }
  return Math.random().toString(36).slice(2, 8).padStart(6, "0");
}

function nextId(prefix, list) {
  // parseInt (no Number) lee el numero inicial aunque el id lleve sufijo,
  // asi la secuencia visible sigue avanzando.
  const nextNumber =
    list.reduce((max, item) => {
      const number = parseInt(String(item.id).replace(`${prefix}-`, ""), 10);
      return Number.isFinite(number) ? Math.max(max, number) : max;
    }, 0) + 1;
  return `${prefix}-${String(nextNumber).padStart(3, "0")}-${idSuffix()}`;
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

// Estado de la factura frente a Alegra. El envio real lo hace billing-alegra.js;
// aqui solo se dibuja la celda con su estado o el boton para enviarla.
function alegraCell(invoice) {
  const info = invoice.alegra;
  if (info?.status === "sent") {
    const label = info.number ? `Alegra ${escapeHtml(info.number)}` : "Enviada";
    return info.url
      ? `<a class="alegra-badge is-sent" href="${escapeHtml(info.url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : `<span class="alegra-badge is-sent">${label}</span>`;
  }
  const retry = info?.status === "error" ? " is-retry" : "";
  const text = info?.status === "error" ? "Reintentar" : "Enviar a Alegra";
  return `<button class="row-action alegra-send${retry}" type="button" data-alegra-send="${escapeHtml(invoice.id)}">${text}</button>${
    info?.status === "error" ? `<span class="alegra-note">${escapeHtml(info.reason || "Fallo el envio")}</span>` : ""
  }`;
}

function isAdminRole(user = currentUser()) {
  return Boolean(user?.active && (user.role === "super" || user.role === "admin"));
}

// Sucursal a la que esta atada una cuenta. Super y admin ven todas; el resto
// queda en la sede que el super le asigno (`branchScope`). Sin asignacion se
// asume "all" para no romper cuentas viejas. Espeja la logica del servidor:
// aqui es solo para no mostrar lo que el servidor de todos modos no envia.
function userBranchScope(user = currentUser()) {
  if (isAdminRole(user)) return "all";
  const scope = typeof user?.branchScope === "string" ? user.branchScope.trim() : "";
  return scope || "all";
}

function allowedBranchOptions(user = currentUser()) {
  const scope = userBranchScope(user);
  if (scope === "all") return branchOptions;
  return branchOptions.filter((branch) => branch.id === scope);
}

function canAccessBranch(branchId, user = currentUser()) {
  const scope = userBranchScope(user);
  return scope === "all" || scope === branchId;
}

function branchScopeLabel(scope) {
  if (!scope || scope === "all") return "Todas las sucursales";
  return branchOptions.find((branch) => branch.id === scope)?.label || scope;
}

function branchScopeOptions(selected = "all") {
  return [
    { value: "all", label: "Todas las sucursales", selected: selected === "all" },
    ...branchOptions.map((branch) => ({
      value: branch.id,
      label: branch.label,
      selected: branch.id === selected
    }))
  ];
}

// Modulos de direccion, solo para administradores; no pasan por la matriz de
// permisos por modulo.
const adminOnlyModules = new Set(["dashboard", "integraciones"]);

// Acceso a planilla/RRHH: el super siempre, y cualquier cuenta a la que el super
// le asigno payrollAccess. NO basta con ser admin: es un acceso designado.
function hasPayrollAccess(user = currentUser()) {
  return Boolean(user?.active && (user.role === "super" || user.payrollAccess === true));
}

// Modulo de planilla: acceso designado, no por rol ni por la matriz de permisos.
const payrollModules = new Set(["planilla"]);

function canView(moduleName) {
  const user = currentUser();
  if (payrollModules.has(moduleName)) return hasPayrollAccess(user);
  if (adminOnlyModules.has(moduleName)) return isAdminRole(user);
  return Boolean(user?.active && user.permissions?.[moduleName]?.read);
}

function canWrite(moduleName) {
  const user = currentUser();
  if (payrollModules.has(moduleName)) return hasPayrollAccess(user);
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
  reasonModalReturnFocus = document.activeElement;
  elements.reasonModal.classList.add("is-open");
  elements.reasonModal.setAttribute("aria-hidden", "false");
  // El fondo queda inerte para que el foco no se escape por detras del modal,
  // igual que el drawer y los demas modales.
  document.querySelectorAll(".topbar, .app-shell").forEach((region) => (region.inert = true));
  setTimeout(() => elements.reasonText.focus(), 80);
}

let reasonModalReturnFocus = null;

function closeStockReasonModal() {
  pendingStockUseProductId = "";
  elements.reasonModal.classList.remove("is-open");
  elements.reasonModal.setAttribute("aria-hidden", "true");
  elements.reasonText.value = "";
  updateReasonWordCount();
  document.querySelectorAll(".topbar, .app-shell").forEach((region) => (region.inert = false));
  if (reasonModalReturnFocus instanceof HTMLElement) reasonModalReturnFocus.focus();
  reasonModalReturnFocus = null;
}

function setModule(moduleName, options = {}) {
  if (!moduleConfig[moduleName]) return;
  if (!canView(moduleName)) {
    showToast("Este usuario no tiene acceso a ese modulo");
    return;
  }
  currentModule = moduleName;
  if (!options.keepSearch) elements.searchInput.value = "";

  // Al entrar a Personal por primera vez se siembra el roster (una sola vez).
  // Se hace aqui -no al arrancar- para que sea sobre el estado real ya cargado.
  if (moduleName === "personal") seedRosterIfNeeded();

  renderAll();
  closeDropdown();

  if (!options.silent) {
    showToast(`${moduleConfig[moduleName].title} listo`);
    // Antes se hacía scrollIntoView del panel, lo que dejaba el título del
    // módulo debajo de la barra superior fija. Ahora la vista cabe entera.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// Si la sucursal activa quedo fuera del alcance del usuario (por ejemplo una
// cuenta que antes veia todas y el super acaba de atar a una sede), se corrige
// antes de dibujar: nunca se muestran datos de una sucursal que no le toca.
function enforceBranchScope() {
  if (canAccessBranch(state.currentBranchId)) return;
  const target = allowedBranchOptions()[0];
  if (!target) return;
  syncCurrentBranchData();
  state.currentBranchId = target.id;
  state.branches = state.branches || defaultBranches();
  state.branches[target.id] = normalizeBranchData(state.branches[target.id], defaultBranches()[target.id]);
  writeBranchData(state, state.branches[target.id]);
}

function renderAll() {
  enforceBranchScope();
  renderActiveUser();
  renderModuleAccess();
  renderSummary();
  renderView();
}

function renderActiveUser() {
  const user = currentUser();
  elements.currentUserName.textContent = user ? user.name : "Usuario";
  // Mostrar la sucursal activa en la barra: los datos cambian por sucursal, asi
  // que saber donde se esta operando de un vistazo evita errores.
  if (elements.currentBranchName) {
    const branch = branchOptions.find((item) => item.id === state.currentBranchId);
    elements.currentBranchName.textContent = branch?.label || "Sucursal";
  }
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
      [rosterForBranchOn(state.currentBranchId, todayISO()).length || procedureSpecialists.length, "Especialistas"]
    ],
    personal: [
      [rosterList().filter((person) => person.active !== false).length, "En el equipo"],
      [rosterList().filter((person) => person.userId).length, "Con acceso"],
      [rosterList().filter((person) => (person.assignments || []).length).length, "Con traslado"]
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
    ],
    proveedores: [
      [money(payablesList().filter((i) => i.estado !== "Pagada").reduce((s, i) => s + Number(i.monto || 0), 0)), "Por pagar"],
      [payablesList().filter(payableIsOverdue).length, "Vencidas"],
      [payablesList().filter((i) => i.estado === "Pagada").length, "Pagadas"]
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
  if (adminOnlyModules.has(currentModule)) {
    // El dashboard y las integraciones son de solo lectura por naturaleza; no
    // tiene sentido el aviso de "solo lectura".
    elements.moduleActions.innerHTML = "";
    return;
  }
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

function renderView() {
  if (!canView(currentModule)) {
    currentModule = firstAllowedModule();
  }
  const config = moduleConfig[currentModule];
  const search = elements.searchInput.value;

  // El título y la descripción del módulo ya están en la cabecera de arriba.
  // Estos nodos se dejan vacíos —y el CSS los colapsa— pero deben existir por
  // si algún módulo quiere escribir un subtítulo propio.
  elements.viewEyebrow.textContent = "";
  elements.viewTitle.textContent = "";
  elements.viewSubtitle.textContent = "";
  elements.viewContent.innerHTML = viewRenderers[currentModule]?.(search) || `<div class="empty-state">Modulo no disponible.</div>`;

  // Debe seguir siendo síncrono: production-tools.js y enhancements.js leen
  // #viewContent justo después de que esta función retorne.
  moveFormToDrawer();
  hydrateProductImages(elements.viewContent);
}

// La rejilla mantiene .view-grid > (.form-panel, .records-panel) porque
// production-tools.js y enhancements.js se anclan justamente ahí. El
// formulario se traslada al panel lateral después de renderizar; ver
// moveFormToDrawer().
function renderLayout(stats, formTitle, formHtml, recordsTitle, recordsHtml) {
  const writableForm = canWrite(currentModule)
    ? formHtml
    : `<div class="empty-state">Este usuario puede consultar este modulo, pero no puede crear ni modificar datos.</div>`;
  return `
    <div class="view-grid">
      <section class="form-panel" data-form-title="${escapeHtml(formTitle)}">
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
  if (!rows.length) {
    // "Con ese filtro" solo tiene sentido si de verdad hay una busqueda o un
    // filtro activo; en una lista recien creada confunde.
    const searching = (elements.searchInput?.value || "").trim().length > 0;
    const filtering = currentModule === "inventario" && inventoryFilter !== "all";
    const message =
      searching || filtering
        ? "No hay registros que coincidan con la busqueda o el filtro."
        : "Aun no hay registros aqui. Crea el primero con el formulario de la izquierda.";
    return `<div class="empty-state">${message}</div>`;
  }
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

// `required` ya da aria-required al lector de pantalla, pero visualmente no
// habia forma de saber que campos son obligatorios hasta que el navegador
// rechazaba el envio. La marca se pinta desde CSS con .is-required.
function fieldClass(baseClass, extra) {
  return String(extra || "").includes("required") ? `${baseClass} is-required` : baseClass;
}

function inputField(label, name, type = "text", value = "", extra = "") {
  return `
    <label class="${fieldClass("field", extra)}">
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

// Lista de <option>. Respeta `option.selected`, o un valor pasado aparte.
function optionsHtml(options, selectedValue) {
  return options
    .map((option) => {
      const isSelected =
        selectedValue !== undefined ? String(option.value) === String(selectedValue) : Boolean(option.selected);
      return `<option value="${escapeHtml(option.value)}" ${isSelected ? "selected" : ""}>${escapeHtml(option.label)}</option>`;
    })
    .join("");
}

function selectField(label, name, options, selectedValue = "", extra = "") {
  return `
    <label class="${fieldClass("field", extra)}">
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

/* --- Personal / roster editable por sucursal ---------------------------
 * El personal deja de estar quemado en el codigo: cada sucursal tiene su
 * propio roster editable (coleccion `specialists`, con aislamiento por sede).
 * De aqui salen las especialistas de la agenda y de la reserva publica. La
 * lista `procedureSpecialists` queda solo como semilla y respaldo. */

// Semilla: convierte la lista fija en fichas editables la primera vez.
function defaultRoster() {
  return procedureSpecialists.map((sp, index) => ({
    id: `SPC-${String(index + 1).padStart(3, "0")}`,
    name: sp.name,
    category: sp.category || "",
    email: "",
    serviceAdd: [],
    serviceRemove: [],
    assignments: [],
    userId: "",
    active: true
  }));
}

// Roster de la sucursal activa (esta espejado en el nivel superior de `state`).
function rosterList() {
  return Array.isArray(state.specialists) ? state.specialists.filter((person) => person && person.id) : [];
}

// Roster de una sucursal cualquiera. La activa se lee del nivel superior (ahi
// viven los cambios sin guardar aun); las demas, de `state.branches`.
function rosterOfBranch(branchId) {
  const list =
    branchId === state.currentBranchId
      ? state.specialists
      : state.branches?.[branchId]?.specialists;
  return Array.isArray(list) ? list.filter((person) => person && person.id) : [];
}

// Sede efectiva de una persona en una fecha: si tiene un traslado temporal que
// cubre ese dia, manda esa sede; si no, su sede base (donde vive su ficha).
function personBranchOn(person, homeBranchId, dateISO) {
  const day = String(dateISO || "").slice(0, 10);
  if (!day) return homeBranchId;
  const move = (person.assignments || []).find(
    (item) => item && item.branch && String(item.from || "") <= day && day <= String(item.to || "")
  );
  return move ? move.branch : homeBranchId;
}

// Categoria de especialista que atiende un servicio (espeja backend/public-booking).
const serviceToSpecialistCategory = {
  facial: "esteticista", faciales: "esteticista", cabello: "estilista", color: "estilista",
  laser: "esteticista", "láser": "esteticista", corporal: "esteticista", depilacion: "esteticista",
  "depilación": "esteticista", masajes: "esteticista", tratamientos: "esteticista", cejas: "estilista",
  maquillaje: "estilista", unas: "manicurista", "uñas": "manicurista"
};
function procedureCategory(procedure) {
  const raw = String(procedure?.category || procedure?.area || "").trim().toLowerCase();
  if (["estilista", "esteticista", "manicurista"].includes(raw)) return raw;
  return serviceToSpecialistCategory[raw] || "";
}

// Una persona ofrece un servicio si esta en sus "servicios extra", o si su
// categoria coincide con la del servicio y no lo tiene excluido. Sin categoria
// de servicio, lo puede hacer cualquiera.
function personOffersProcedure(person, procedure) {
  if (!procedure) return true;
  if ((person.serviceAdd || []).includes(procedure.id)) return true;
  if ((person.serviceRemove || []).includes(procedure.id)) return false;
  const category = procedureCategory(procedure);
  if (!category) return true;
  return (person.category || "") === category;
}

// Roster efectivo de una sucursal en una fecha: personas activas cuya sede
// efectiva ese dia es esta sucursal (suma traslados entrantes, resta salientes).
function rosterForBranchOn(branchId, dateISO) {
  const people = [];
  const seen = new Set();
  branchOptions.forEach((branch) => {
    rosterOfBranch(branch.id).forEach((person) => {
      if (person.active === false) return;
      if (personBranchOn(person, branch.id, dateISO) !== branchId) return;
      const key = String(person.name || "").trim().toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      people.push(person);
    });
  });
  return people;
}

// Opciones de especialista para la agenda de la sucursal activa. Si el roster
// aun no se ha sembrado, cae a la lista semilla para no quedar vacia.
function specialistOptions(selected = "") {
  let names = rosterForBranchOn(state.currentBranchId, todayISO()).map((person) => person.name);
  if (!names.length) names = procedureSpecialists.map((specialist) => specialist.name);
  names = [...new Set(names.map((name) => String(name).trim()).filter(Boolean))];
  if (selected && !names.includes(selected)) names = [selected, ...names];
  return names.map((name, index) => ({
    value: name,
    label: name,
    selected: selected ? name === selected : index === 0
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

/* =====================================================================
   Dashboard de direccion (solo administradores)
   ---------------------------------------------------------------------
   Agrega en vivo las facturas de TODAS las sucursales. La sucursal activa se
   lee del espejo de nivel superior (lo mas fresco); las demas, de
   state.branches. Cada re-render refleja el estado ya sincronizado, asi que el
   tablero se actualiza solo cuando entra una factura nueva.
   ===================================================================== */

let dashboardPeriod = "mes";
// Control de facturas pagadas (gerencia): periodo y sucursal filtrada.

const dashboardPeriods = [
  { id: "hoy", label: "Hoy" },
  { id: "mes", label: "Este mes" },
  { id: "todo", label: "Todo" }
];

/* --- Cuentas por pagar a proveedores ------------------------------------
   Los gerentes cargan las facturas de proveedores por pagar y adjuntan la
   factura; al pagar adjuntan el comprobante. Son datos de la sucursal, asi que
   heredan el aislamiento: cada gerente ve solo las de su sede; los duenos, todas.
*/

let proveedoresFilter = "todas";

function payablesList() {
  return Array.isArray(state.payables) ? state.payables : [];
}

function payableIsOverdue(item) {
  return item.estado !== "Pagada" && item.fechaVencimiento && item.fechaVencimiento < todayISO();
}

function addPayable(data) {
  const proveedor = (data.proveedor || "").trim();
  if (!proveedor) return showToast("Escribe el nombre del proveedor");
  state.payables = payablesList();
  state.payables.unshift({
    id: nextId("CXP", state.payables),
    proveedor,
    concepto: (data.concepto || "").trim(),
    monto: Number(data.monto || 0),
    fechaEmision: (data.fechaEmision || "").trim(),
    fechaVencimiento: (data.fechaVencimiento || "").trim(),
    estado: "Pendiente",
    fechaPago: "",
    metodoPago: "",
    facturaImageId: "",
    comprobanteImageId: "",
    notes: (data.notes || "").trim(),
    createdBy: currentUser()?.name || ""
  });
  persistAndRender("Factura por pagar registrada");
}

function markPayablePaid(id, metodo) {
  const item = payablesList().find((p) => p.id === id);
  if (!item) return;
  item.estado = "Pagada";
  item.fechaPago = todayISO();
  if (metodo) item.metodoPago = metodo;
  persistAndRender("Marcada como pagada");
}

function markPayablePending(id) {
  const item = payablesList().find((p) => p.id === id);
  if (!item) return;
  item.estado = "Pendiente";
  item.fechaPago = "";
  persistAndRender("Marcada como pendiente");
}

function removePayable(id) {
  const item = payablesList().find((p) => p.id === id);
  if (!item) return;
  if (!confirm(`¿Eliminar la cuenta por pagar de ${item.proveedor}?`)) return;
  state.payables = payablesList().filter((p) => p.id !== id);
  persistAndRender("Cuenta por pagar eliminada");
}

async function uploadPayableImage(file) {
  if (!file) return "";
  if (!/^image\//i.test(file.type)) throw new Error("Adjunta una foto (JPG o PNG) de la factura o el comprobante.");
  if (typeof backendRequest !== "function") throw new Error("Sin conexion con el servidor");
  const dataUrl = await downscaleImage(file);
  const response = await backendRequest("/media", {
    method: "POST",
    body: JSON.stringify({ dataUrl, branchId: state.currentBranchId || "", kind: "payable" })
  });
  return response?.image?.id || "";
}

async function attachPayableImage(id, field, file) {
  const item = payablesList().find((p) => p.id === id);
  if (!item || !file) return;
  try {
    showToast("Subiendo...");
    const imageId = await uploadPayableImage(file);
    if (!imageId) throw new Error("No se recibio la imagen");
    item[field] = imageId;
    persistAndRender(field === "facturaImageId" ? "Factura adjuntada" : "Comprobante adjuntado");
  } catch (error) {
    showToast(error.message || "No se pudo subir el archivo");
  }
}

function exportPayables() {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const header = ["Proveedor", "Concepto", "Monto", "Emision", "Vencimiento", "Estado", "Fecha pago", "Metodo", "Cargada por"];
  const lines = [header.map(quote).join(",")];
  payablesList().forEach((item) => {
    lines.push(
      [item.proveedor, item.concepto, item.monto, item.fechaEmision, item.fechaVencimiento, item.estado, item.fechaPago, item.metodoPago, item.createdBy]
        .map(quote)
        .join(",")
    );
  });
  downloadFile(`chic-co-cuentas-por-pagar-${todayISO()}.csv`, "﻿" + lines.join("\n"), "text/csv;charset=utf-8");
  showToast("Cuentas por pagar exportadas");
}

function branchLabel(branchId) {
  return branchOptions.find((branch) => branch.id === branchId)?.label || branchId;
}

// Facturas de todas las sucursales, con su sucursal y los nombres resueltos
// dentro de la coleccion de esa misma sucursal (un cliente de Alajuela no vive
// en Rohrmoser).
function allInvoicesAcrossBranches() {
  const branches = state.branches || {};
  const rows = [];
  Object.keys(branches).forEach((branchId) => {
    const isCurrent = branchId === state.currentBranchId;
    const data = isCurrent
      ? { invoices: state.invoices, clients: state.clients, procedures: state.procedures, products: state.products }
      : branches[branchId] || {};
    const nameIn = (list, id) => (list || []).find((item) => item.id === id)?.name || "";
    (data.invoices || []).forEach((invoice) => {
      rows.push({
        invoice,
        branchId,
        branchName: branchLabel(branchId),
        clientName: nameIn(data.clients, invoice.clientId) || "Cliente",
        procedureName: nameIn(data.procedures, invoice.procedureId) || "Sin servicio",
        productName: nameIn(data.products, invoice.productId),
        collaborator: (invoice.collaborator || "").trim() || "Sin asignar"
      });
    });
  });
  return rows;
}

function invoiceInPeriod(invoice, period) {
  const date = String(invoice.date || "");
  if (period === "hoy") return date === todayISO();
  if (period === "mes") return date.slice(0, 7) === todayISO().slice(0, 7);
  return true;
}

// Suma facturado (total con IVA), cobrado (pagos) y saldo pendiente (lo que
// falta por cobrar) de un grupo de filas.
function sumInvoiceRows(rows) {
  return rows.reduce(
    (acc, row) => {
      const total = invoiceTotal(row.invoice);
      const paid = Number(row.invoice.paid || 0);
      const pending = Math.max(0, total - paid);
      acc.facturado += total;
      acc.cobrado += Math.min(paid, total);
      acc.pendiente += pending;
      acc.count += 1;
      if (pending > 0) acc.pendientes += 1;
      return acc;
    },
    { facturado: 0, cobrado: 0, pendiente: 0, count: 0, pendientes: 0 }
  );
}

// Agrupa filas por una clave y devuelve los grupos ordenados por facturado.
function groupInvoiceRows(rows, keyFn) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyFn(row) || "—";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.entries()]
    .map(([key, groupRows]) => ({ key, ...sumInvoiceRows(groupRows) }))
    .sort((a, b) => b.facturado - a.facturado);
}

// Descarga un archivo generado en el navegador.
function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Exporta el dashboard del periodo activo a un CSV: los totales y los cuatro
// desgloses en una sola hoja, listos para abrir en Excel.
function exportDashboardReport() {
  const period = dashboardPeriod;
  const all = allInvoicesAcrossBranches().filter((row) => invoiceInPeriod(row.invoice, period));
  const totals = sumInvoiceRows(all);
  const periodLabel = dashboardPeriods.find((item) => item.id === period)?.label || period;
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [];
  lines.push(quote(`Reporte Chic & Co - ${periodLabel}`));
  lines.push("");
  lines.push(["Total", "Valor"].map(quote).join(","));
  lines.push(["Facturado", totals.facturado].map(quote).join(","));
  lines.push(["Cobrado", totals.cobrado].map(quote).join(","));
  lines.push(["Saldo pendiente", totals.pendiente].map(quote).join(","));
  lines.push(["Facturas", totals.count].map(quote).join(","));
  lines.push(["Por cobrar", totals.pendientes].map(quote).join(","));

  const sections = [
    ["Por sucursal", groupInvoiceRows(all, (row) => row.branchName)],
    ["Por colaborador", groupInvoiceRows(all, (row) => row.collaborator)],
    ["Por servicio", groupInvoiceRows(all, (row) => row.procedureName)],
    [
      "Por producto",
      groupInvoiceRows(
        all.filter((row) => row.productName && Number(row.invoice.productAmount || 0) > 0),
        (row) => row.productName
      )
    ]
  ];
  sections.forEach(([title, groups]) => {
    lines.push("");
    lines.push(quote(title));
    lines.push(["Nombre", "Facturado", "Cobrado", "Saldo", "Facturas"].map(quote).join(","));
    groups.forEach((group) => {
      lines.push([group.key, group.facturado, group.cobrado, group.pendiente, group.count].map(quote).join(","));
    });
  });

  downloadFile(`chic-co-reporte-${period}-${todayISO()}.csv`, "﻿" + lines.join("\n"), "text/csv;charset=utf-8");
  showToast("Reporte exportado");
}

function dashboardBreakdownTable(title, groups, extraLabel) {
  if (!groups.length) {
    return `<section class="dash-panel"><h3>${escapeHtml(title)}</h3><p class="dash-empty">Sin datos en este periodo.</p></section>`;
  }
  const rows = groups
    .map(
      (group) => `
        <tr>
          <td>${escapeHtml(group.key)}</td>
          <td class="dash-num">${money(group.facturado)}</td>
          <td class="dash-num">${money(group.cobrado)}</td>
          <td class="dash-num${group.pendiente > 0 ? " is-pending" : ""}">${money(group.pendiente)}</td>
          <td class="dash-num dash-muted">${group.count}</td>
        </tr>`
    )
    .join("");
  return `
    <section class="dash-panel">
      <h3>${escapeHtml(title)}</h3>
      <div class="table-wrap">
        <table class="dash-table">
          <thead>
            <tr>
              <th>${escapeHtml(extraLabel)}</th>
              <th class="dash-num">Facturado</th>
              <th class="dash-num">Cobrado</th>
              <th class="dash-num">Saldo</th>
              <th class="dash-num">Facturas</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

/* =====================================================================
   Planilla / RRHH
   ---------------------------------------------------------------------
   Comisiones, beneficios usados y vacaciones del personal. Datos de todo
   el negocio (no de una sucursal). Solo los ve y edita quien el super
   usuario designe con payrollAccess; el servidor ni siquiera los envia a
   los demas.
   ===================================================================== */

function currentMonthISO() {
  return todayISO().slice(0, 7);
}

// Nombres del personal para asignar comisiones/beneficios/vacaciones: cuentas
// activas del sistema, la ficha de planilla y el roster de especialistas de las
// sucursales visibles, sin repetir.
function staffNames() {
  const fromStaff = (state.staff || []).map((item) => item.name);
  const fromUsers = (state.users || []).filter((user) => user.active).map((user) => user.name);
  const fromRoster = branchOptions.flatMap((branch) => rosterOfBranch(branch.id).map((person) => person.name));
  const seed = fromRoster.length ? [] : procedureSpecialists.map((specialist) => specialist.name);
  return [...new Set([...fromStaff, ...fromUsers, ...fromRoster, ...seed].map((name) => String(name).trim()).filter(Boolean))].sort();
}

function staffOptions(selected = "") {
  return staffNames().map((name) => ({ value: name, label: name, selected: name === selected }));
}

/* --- Planilla quincenal (replica la planilla real del salon) ------------ */

function staffList() {
  return (state.staff || []).filter((item) => item && item.id);
}
function activeStaff() {
  return staffList().filter((item) => item.active !== false);
}
function staffByName(name) {
  const want = String(name || "").trim().toLowerCase();
  return staffList().find((item) => String(item.name || "").trim().toLowerCase() === want) || null;
}

// Quincena actual "YYYY-MM-Q1" / "YYYY-MM-Q2" (dias 1-15 / 16-fin de mes).
function currentQuincena() {
  const iso = todayISO();
  return `${iso.slice(0, 7)}-Q${Number(iso.slice(8, 10)) <= 15 ? 1 : 2}`;
}

// Rango de fechas ISO que cubre una quincena.
function quincenaRange(period) {
  const match = String(period || "").match(/^(\d{4})-(\d{2})-Q([12])$/);
  if (!match) return { from: "", to: "" };
  const [, y, mo, q] = match;
  if (q === "1") return { from: `${y}-${mo}-01`, to: `${y}-${mo}-15` };
  const lastDay = new Date(Number(y), Number(mo), 0).getDate();
  return { from: `${y}-${mo}-16`, to: `${y}-${mo}-${String(lastDay).padStart(2, "0")}` };
}

function quincenaLabel(period) {
  const match = String(period || "").match(/^(\d{4})-(\d{2})-Q([12])$/);
  if (!match) return period || "";
  const [, y, mo, q] = match;
  return `${q === "1" ? "1a" : "2a"} quincena de ${monthNames[Number(mo) - 1] || mo} ${y}`;
}

// Ultimas quincenas para el selector, de la actual hacia atras.
function quincenaOptions(count = 8) {
  const iso = todayISO();
  let y = Number(iso.slice(0, 4));
  let mo = Number(iso.slice(5, 7));
  let q = Number(iso.slice(8, 10)) <= 15 ? 1 : 2;
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const period = `${y}-${String(mo).padStart(2, "0")}-Q${q}`;
    list.push({ value: period, label: quincenaLabel(period) });
    if (q === 2) {
      q = 1;
    } else {
      q = 2;
      mo -= 1;
      if (mo < 1) { mo = 12; y -= 1; }
    }
  }
  return list;
}

// Ventas reales de un colaborador dentro del rango de la quincena.
function payrollSalesForQuincena(worker, period) {
  const want = String(worker || "").trim().toLowerCase();
  const { from, to } = quincenaRange(period);
  if (!want || !from) return 0;
  return allInvoicesAcrossBranches()
    .filter((row) => String(row.collaborator || "").trim().toLowerCase() === want)
    .filter((row) => {
      const d = String(row.invoice.date || "").slice(0, 10);
      return d >= from && d <= to;
    })
    .reduce((sum, row) => sum + invoiceTotal(row.invoice), 0);
}

// Fila de ajustes de una persona en una quincena (bonos, horas, feriados...).
function payrollRun(worker, period) {
  const want = String(worker || "").trim().toLowerCase();
  return (state.commissions || []).find(
    (item) => String(item.worker || "").trim().toLowerCase() === want && item.period === period
  ) || null;
}

// Calcula TODO para una persona en una quincena, con la formula de la planilla
// real: quincenal (base/2), hora (quincenal/120), dia (quincenal/15), feriado,
// extra (hora x1.5), rebajo, incapacidad, comision (de las ventas x %), total
// salario, CCSS (10.83%) y total a pagar.
function computePayroll(staff, run, period) {
  const base = Number(staff?.salarioBase || 0);
  const quincenal = base / 2;
  const hora = quincenal / 120;
  const diaValor = quincenal / 15;
  const feriado = diaValor * Number(run?.feriadoDias || 0);
  const extra = hora * 1.5 * Number(run?.horasExtra || 0);
  const rebajo = hora * Number(run?.horasRebajo || 0);
  const incapacidad = diaValor * Number(run?.incapacidadDias || 0);
  const bonos = Number(run?.bonos || 0);
  const otrosRebajos = Number(run?.otrosRebajos || 0);
  const ventas = payrollSalesForQuincena(staff?.name, period);
  // Comision: si se escribio una manual se respeta; si no, ventas x % del puesto.
  const manual = run?.comisionManual;
  const comision =
    manual !== "" && manual != null && Number.isFinite(Number(manual))
      ? Number(manual)
      : Math.round(ventas * Number(staff?.comisionRate || 0) / 100);
  const totalSalario = quincenal + extra + feriado + comision + bonos - incapacidad - rebajo;
  const ccss = totalSalario * CCSS_RATE;
  const totalPagar = totalSalario - ccss - otrosRebajos;
  return { base, quincenal, hora, feriado, extra, rebajo, incapacidad, bonos, ventas, comision, otrosRebajos, totalSalario, ccss, totalPagar };
}

function vacationDays(fromISO, toISO) {
  const from = Date.parse(`${fromISO}T00:00:00Z`);
  const to = Date.parse(`${toISO}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  return Math.round((to - from) / (24 * 60 * 60 * 1000)) + 1;
}

// Estado de UI: empleado que se esta editando y quincena elegida en la vista.
let editingStaffId = "";
let payrollPeriod = "";

// Alta/edicion de empleado (registro fijo). Si viene staffId, actualiza.
function addStaff(data) {
  const name = (data.name || "").trim();
  if (!name) return showToast("Escribe el nombre del empleado");
  const fields = {
    name,
    puesto: (data.puesto || "Otro").trim(),
    branch: branchScopeValues.includes(data.branch) && data.branch !== "all" ? data.branch : (branchOptions[0]?.id || ""),
    cedula: (data.cedula || "").trim(),
    cuenta: (data.cuenta || "").trim(),
    salarioBase: Number(data.salarioBase || 0),
    comisionRate: Number(data.comisionRate || 0),
    active: true
  };
  const editing = (data.staffId || editingStaffId || "").trim();
  if (editing) {
    const record = staffList().find((item) => item.id === editing);
    if (record) {
      Object.assign(record, fields, { active: record.active !== false });
      editingStaffId = "";
      persistAndRender("Empleado actualizado");
      return;
    }
  }
  state.staff.push({ id: nextId("EMP", state.staff), ...fields });
  editingStaffId = "";
  persistAndRender("Empleado agregado");
}

function startEditStaff(id) {
  editingStaffId = id;
  renderView();
}

function toggleStaffActive(id) {
  const record = staffList().find((item) => item.id === id);
  if (!record) return;
  record.active = record.active === false;
  persistAndRender(record.active ? "Empleado reactivado" : "Empleado pausado");
}

function removeStaff(id) {
  const record = staffList().find((item) => item.id === id);
  if (!record) return;
  if (!confirm(`¿Eliminar a ${record.name} del registro de personal? Sus quincenas guardadas se conservan.`)) return;
  state.staff = staffList().filter((item) => item.id !== id);
  if (editingStaffId === id) editingStaffId = "";
  persistAndRender("Empleado eliminado");
}

/* --- Personal: roster editable de la sucursal activa -------------------- */

// Persona del roster que se esta editando (id) en la vista de Personal.
let editingRosterId = "";

// Alta/edicion de una persona del roster de la sucursal activa. Si se pide
// "crear acceso" y trae correo, se le crea (o vincula) una cuenta del sistema
// atada a esta sucursal, sin contrasena: la persona la define con "¿Olvidaste
// tu contraseña?" en el login (ninguna cuenta arranca con clave compartida).
function saveRosterPerson(data) {
  if (!requireWrite("personal")) return;
  const name = String(data.name || "").trim();
  if (!name) return showToast("Escribe el nombre de la persona");
  const category = ["estilista", "esteticista", "manicurista"].includes(data.category) ? data.category : "";
  const email = String(data.email || "").trim();
  const editingId = String(data.rosterId || editingRosterId || "").trim();

  if (!Array.isArray(state.specialists)) state.specialists = [];
  const existing = editingId ? state.specialists.find((person) => person.id === editingId) : null;
  const person = existing || {
    id: nextId("SPC", state.specialists),
    serviceAdd: [],
    serviceRemove: [],
    assignments: [],
    userId: "",
    active: true
  };
  person.name = name;
  person.category = category;
  person.email = email;

  // "Afinar servicios": las casillas marcadas dicen que servicios ofrece. Se
  // leen del DOM (FormData colapsa las casillas repetidas). Se guardan como
  // excepciones respecto a su categoria:
  //   - ofrece un servicio que NO es de su categoria -> serviceAdd
  //   - NO ofrece un servicio que SI es de su categoria -> serviceRemove
  const serviceBoxes = document.querySelectorAll("input[data-roster-service]");
  if (serviceBoxes.length) {
    const chosen = new Set([...serviceBoxes].filter((box) => box.checked).map((box) => box.value));
    const add = [];
    const remove = [];
    (state.procedures || []).forEach((procedure) => {
      const belongs = !procedureCategory(procedure) || procedureCategory(procedure) === category;
      const offered = chosen.has(procedure.id);
      if (offered && !belongs) add.push(procedure.id);
      if (!offered && belongs) remove.push(procedure.id);
    });
    person.serviceAdd = add;
    person.serviceRemove = remove;
  }

  if (!existing) state.specialists.push(person);

  // Acceso al sistema: crea la cuenta la primera vez que se pide y hay correo.
  if (data.createLogin === "true" && email && !person.userId) {
    const already = (state.users || []).find((user) => String(user.email || "").trim().toLowerCase() === email.toLowerCase());
    if (already) {
      person.userId = already.id;
    } else if (currentUser()?.role === "super" || currentUser()?.role === "admin" || currentUser()?.role === "gerente") {
      const account = {
        id: nextId("USR", state.users),
        name,
        email,
        role: "especialista",
        function: category ? `Especialista ${category}` : "Especialista",
        branchScope: state.currentBranchId,
        payrollAccess: false,
        active: true,
        passwordHash: "",
        permissions: clone(rolePresets.especialista.permissions)
      };
      state.users.push(account);
      person.userId = account.id;
    }
  }

  editingRosterId = "";
  persistAndRender(
    existing
      ? "Persona actualizada"
      : person.userId
        ? "Persona agregada. Pidele que entre con su correo y \"¿Olvidaste tu contraseña?\" para crear su clave."
        : "Persona agregada"
  );
}

function startEditRoster(id) {
  editingRosterId = id;
  renderView();
}

function toggleRosterActive(id) {
  const person = rosterList().find((item) => item.id === id);
  if (!person || !requireWrite("personal")) return;
  person.active = person.active === false;
  persistAndRender(person.active ? "Persona reactivada" : "Persona pausada");
}

function removeRosterPerson(id) {
  const person = rosterList().find((item) => item.id === id);
  if (!person || !requireWrite("personal")) return;
  if (!confirm(`¿Quitar a ${person.name} del roster de esta sucursal?`)) return;
  state.specialists = rosterList().filter((item) => item.id !== id);
  if (editingRosterId === id) editingRosterId = "";
  persistAndRender("Persona quitada del roster");
}

// Traslado temporal a otra sede por un rango de fechas.
function addRosterAssignment(data) {
  if (!requireWrite("personal")) return;
  const person = rosterList().find((item) => item.id === String(data.rosterId || "").trim());
  if (!person) return;
  const branch = branchOptions.find((item) => item.id === data.branch && item.id !== state.currentBranchId);
  if (!branch) return showToast("Elige una sucursal distinta a la actual");
  const from = String(data.from || "").slice(0, 10);
  const to = String(data.to || from).slice(0, 10);
  if (!from) return showToast("Elige la fecha de inicio del traslado");
  if (to < from) return showToast("La fecha final no puede ser antes de la inicial");
  if (!Array.isArray(person.assignments)) person.assignments = [];
  person.assignments.push({ id: nextId("MOV", person.assignments), branch: branch.id, from, to });
  persistAndRender(`Traslado de ${person.name} a ${branch.label} guardado`);
}

function removeRosterAssignment(personId, assignmentId) {
  const person = rosterList().find((item) => item.id === personId);
  if (!person || !requireWrite("personal")) return;
  person.assignments = (person.assignments || []).filter((item) => item.id !== assignmentId);
  persistAndRender("Traslado eliminado");
}

// Siembra el roster de la sucursal ACTIVA la primera vez: convierte la lista de
// especialistas de la sede (hoy fija) en fichas editables. `defaultRoster()` sale
// de `procedureSpecialists`, que ya viene ajustado a la sede activa. Solo corre
// una vez por sede y navegador, y solo si esa sede aun no tiene roster propio
// (para no re-sembrar tras un borrado intencional).
function seedRosterIfNeeded() {
  if (!currentUser() || !canWrite("personal")) return;
  const branchId = state.currentBranchId;
  if (!branchId || !state.branches?.[branchId]) return;
  if (rosterOfBranch(branchId).length > 0) return;
  const seedKey = `chic_roster_seeded_${branchId}`;
  try {
    if (localStorage.getItem(seedKey)) return;
  } catch (error) { /* sin localStorage: se siembra igual */ }
  const seed = defaultRoster();
  if (!seed.length) return;
  state.branches[branchId].specialists = seed;
  state.specialists = clone(seed);
  try { localStorage.setItem(seedKey, "1"); } catch (error) { /* no critico */ }
  saveState();
}

// Fija un ajuste de la quincena (bonos, feriados, horas, otros rebajos, estado).
// Crea la fila si no existia. Todo lo demas (comision, CCSS, total) se recalcula.
function setPayrollField(worker, period, field, rawValue) {
  const numericFields = ["bonos", "feriadoDias", "horasExtra", "horasRebajo", "incapacidadDias", "otrosRebajos", "comisionManual"];
  let run = payrollRun(worker, period);
  if (!run) {
    run = { id: nextId("COM", state.commissions), worker, period, status: "Pendiente" };
    state.commissions.push(run);
  }
  if (field === "comisionManual" && String(rawValue).trim() === "") {
    delete run.comisionManual; // vacio = volver al calculo automatico
  } else if (numericFields.includes(field)) {
    run[field] = Number(rawValue || 0);
  } else {
    run[field] = rawValue;
  }
  saveState();
  renderView();
}

// Marca la quincena de una persona como Pagada / Pendiente.
function setPayrollStatus(worker, period, status) {
  let run = payrollRun(worker, period);
  if (!run) {
    run = { id: nextId("COM", state.commissions), worker, period, status };
    state.commissions.push(run);
  } else {
    run.status = status;
  }
  persistAndRender(status === "Pagada" ? "Quincena marcada como pagada" : "Quincena marcada como pendiente");
}

function exportPayroll(period) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const header = ["Nombre", "Puesto", "Sucursal", "Cedula", "Cuenta", "Salario base", "Quincenal", "Feriado", "Extra", "Rebajo", "Incapacidad", "Bonos", "Comision", "Total salario", "CCSS", "Otros rebajos", "Total a pagar", "Estado"];
  const lines = [header.map(quote).join(",")];
  activeStaff().forEach((staff) => {
    const run = payrollRun(staff.name, period);
    const c = computePayroll(staff, run, period);
    lines.push(
      [
        staff.name, staff.puesto, branchLabel(staff.branch), staff.cedula, staff.cuenta,
        c.base, Math.round(c.quincenal), Math.round(c.feriado), Math.round(c.extra), Math.round(c.rebajo),
        Math.round(c.incapacidad), c.bonos, c.comision, Math.round(c.totalSalario), Math.round(c.ccss),
        c.otrosRebajos, Math.round(c.totalPagar), run?.status || "Pendiente"
      ]
        .map(quote)
        .join(",")
    );
  });
  downloadFile(`chic-co-planilla-${period}.csv`, "﻿" + lines.join("\n"), "text/csv;charset=utf-8");
  showToast("Planilla exportada");
}

function addBenefit(data) {
  const worker = (data.worker || "").trim();
  if (!worker) return showToast("Elige a la persona");
  state.benefits.unshift({
    id: nextId("BEN", state.benefits),
    worker,
    type: (data.type || "Beneficio").trim(),
    amount: Number(data.amount || 0),
    date: (data.date || todayISO()).trim(),
    notes: (data.notes || "").trim()
  });
  persistAndRender("Beneficio registrado");
}

function addVacation(data) {
  const worker = (data.worker || "").trim();
  if (!worker) return showToast("Elige a la persona");
  const from = (data.from || todayISO()).trim();
  const to = (data.to || from).trim();
  if (vacationDays(from, to) <= 0) return showToast("Revisa las fechas de las vacaciones");
  state.vacations.unshift({
    id: nextId("VAC", state.vacations),
    worker,
    from,
    to,
    status: data.status || "Solicitada",
    notes: (data.notes || "").trim()
  });
  persistAndRender("Vacaciones registradas");
}

const payrollCollectionByKind = { commission: "commissions", benefit: "benefits", vacation: "vacations" };

function removePayrollRecord(kind, id) {
  const collection = payrollCollectionByKind[kind];
  if (!collection || !Array.isArray(state[collection])) return;
  const record = state[collection].find((item) => item.id === id);
  if (!record) return;
  if (!confirm("¿Eliminar este registro de planilla?")) return;
  state[collection] = state[collection].filter((item) => item.id !== id);
  persistAndRender("Registro eliminado");
}

const viewRenderers = {
  dashboard() {
    const period = dashboardPeriod;
    const all = allInvoicesAcrossBranches().filter((row) => invoiceInPeriod(row.invoice, period));
    const totals = sumInvoiceRows(all);

    const periodTabs = dashboardPeriods
      .map(
        (item) =>
          `<button type="button" class="dash-tab${item.id === period ? " is-active" : ""}" data-dashboard-period="${item.id}">${escapeHtml(item.label)}</button>`
      )
      .join("");

    const kpis = [
      ["Facturado", money(totals.facturado)],
      ["Cobrado", money(totals.cobrado)],
      ["Saldo pendiente", money(totals.pendiente)],
      ["Facturas", String(totals.count)],
      ["Por cobrar", String(totals.pendientes)]
    ]
      .map(
        ([label, value]) => `
          <div class="dash-kpi">
            <span class="dash-kpi-value">${escapeHtml(value)}</span>
            <span class="dash-kpi-label">${escapeHtml(label)}</span>
          </div>`
      )
      .join("");

    const byBranch = groupInvoiceRows(all, (row) => row.branchName);
    const byCollaborator = groupInvoiceRows(all, (row) => row.collaborator);
    const byService = groupInvoiceRows(all, (row) => row.procedureName);
    const byProduct = groupInvoiceRows(
      all.filter((row) => row.productName && Number(row.invoice.productAmount || 0) > 0),
      (row) => row.productName
    );

    return `
      <section class="dash">
        <div class="dash-head">
          <div>
            <h2>Saldos y ventas en vivo</h2>
            <p>Todas las sucursales juntas. Se actualiza solo cuando entra una factura.</p>
          </div>
          <div class="dash-controls">
            <div class="dash-tabs" role="group" aria-label="Periodo">${periodTabs}</div>
            <button type="button" class="dash-export" data-dashboard-export>Exportar CSV</button>
          </div>
        </div>
        <div class="dash-kpis">${kpis}</div>
        <div class="dash-grid">
          ${dashboardBreakdownTable("Por sucursal", byBranch, "Sucursal")}
          ${dashboardBreakdownTable("Por colaborador", byCollaborator, "Colaborador")}
          ${dashboardBreakdownTable("Por servicio", byService, "Servicio")}
          ${dashboardBreakdownTable("Por producto", byProduct, "Producto")}
        </div>
      </section>
    `;
  },

  proveedores(search) {
    const items = payablesList();
    const filter = proveedoresFilter;

    const vencidasCount = items.filter(payableIsOverdue).length;

    const chip = (id, label, count) =>
      `<button class="filter-chip ${filter === id ? "is-active" : ""}" type="button" aria-pressed="${filter === id}" data-proveedores-filter="${id}">${escapeHtml(label)}${count === null ? "" : ` <b>${count}</b>`}</button>`;
    const filters = `
      <div class="proveedores-bar">
        <div class="filter-bar" role="group" aria-label="Filtrar cuentas por pagar">
          ${chip("todas", "Todas", items.length)}
          ${chip("pendientes", "Pendientes", items.filter((i) => i.estado !== "Pagada").length)}
          ${chip("vencidas", "Vencidas", vencidasCount)}
          ${chip("pagadas", "Pagadas", items.filter((i) => i.estado === "Pagada").length)}
        </div>
        <button class="secondary-action" type="button" data-proveedores-export>Exportar CSV</button>
      </div>`;

    const shown = items
      .filter((item) => {
        if (filter === "pendientes") return item.estado !== "Pagada";
        if (filter === "pagadas") return item.estado === "Pagada";
        if (filter === "vencidas") return payableIsOverdue(item);
        return true;
      })
      .filter((item) => matchesSearch([item.proveedor, item.concepto, item.estado, item.metodoPago], search));

    const attach = (item, field, label) => {
      const imageId = item[field];
      const thumb = imageId
        ? `<button class="pay-attach-thumb" type="button" data-photo-open="${escapeHtml(imageId)}" data-photo-name="${escapeHtml(label + " " + item.proveedor)}" title="Ver ${escapeHtml(label)}"><img data-image-id="${escapeHtml(imageId)}" alt="" /></button>`
        : `<span class="pay-attach-none">Sin ${escapeHtml(label.toLowerCase())}</span>`;
      const upload = canWrite("proveedores")
        ? `<label class="row-action is-muted pay-upload"><input type="file" accept="image/*" data-payable-upload="${escapeHtml(item.id)}:${field}" hidden />${imageId ? "Cambiar" : "Adjuntar"}</label>`
        : "";
      return `<div class="pay-attach">${thumb}${upload}</div>`;
    };

    const metodos = ["Transferencia", "Sinpe", "Efectivo", "Tarjeta", "Cheque"];
    const rows = shown.length
      ? shown
          .map((item) => {
            const paid = item.estado === "Pagada";
            const overdue = payableIsOverdue(item);
            const actions = canWrite("proveedores")
              ? paid
                ? `<button class="row-action is-muted" type="button" data-payable-unpay="${escapeHtml(item.id)}">Marcar pendiente</button>`
                : `<span class="pay-pay">
                     <select data-payable-method="${escapeHtml(item.id)}">${metodos.map((m) => `<option value="${m}"${item.metodoPago === m ? " selected" : ""}>${m}</option>`).join("")}</select>
                     <button class="row-action" type="button" data-payable-pay="${escapeHtml(item.id)}">Marcar pagada</button>
                   </span>`
              : "";
            const del = canWrite("proveedores") ? `<button class="row-action is-warning" type="button" data-payable-del="${escapeHtml(item.id)}">Eliminar</button>` : "";
            return `
        <tr class="${paid ? "is-paid-row" : overdue ? "is-overdue-row" : ""}">
          <td>
            <div class="cell-title">
              <strong>${escapeHtml(item.proveedor)}</strong>
              <span>${escapeHtml(item.concepto || "Sin concepto")}</span>
            </div>
          </td>
          <td class="dash-num">${money(item.monto)}</td>
          <td>${item.fechaVencimiento ? escapeHtml(item.fechaVencimiento) : "<span class='muted-cell'>—</span>"}${overdue ? '<br /><span class="pay-overdue">Vencida</span>' : ""}</td>
          <td>${paid ? statusBadge("Pagada") + `<br /><span class="dash-muted">${escapeHtml(item.fechaPago || "")} · ${escapeHtml(item.metodoPago || "")}</span>` : statusBadge("Pendiente")}</td>
          <td>${attach(item, "facturaImageId", "Factura")}</td>
          <td>${attach(item, "comprobanteImageId", "Comprobante")}</td>
          <td><div class="inline-actions pay-actions">${actions}${del}</div></td>
        </tr>`;
          })
          .join("")
      : `<tr><td colspan="7"><div class="empty-state">No hay cuentas por pagar con este filtro. Carga la primera con el formulario.</div></td></tr>`;

    const form = `
      <form class="data-form" data-form="payable" autocomplete="off">
        <div class="form-grid">
          ${inputField("Proveedor", "proveedor", "text", "", "required")}
          ${inputField("Concepto", "concepto", "text", "")}
          ${inputField("Monto", "monto", "number", "0", "min='0' step='100' required")}
          ${inputField("Fecha de emision", "fechaEmision", "date", "")}
          ${inputField("Fecha de vencimiento", "fechaVencimiento", "date", "")}
          ${textareaField("Notas", "notes")}
        </div>
        <p class="payroll-sub">Guarda la factura y luego adjunta la foto de la factura (y el comprobante cuando pagues) desde la tabla.</p>
        <button class="primary-action" type="submit">Guardar factura por pagar</button>
      </form>`;

    const records = `
      ${filters}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Proveedor</th><th class="dash-num">Monto</th><th>Vence</th><th>Estado</th><th>Factura</th><th>Comprobante</th><th>Accion</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    return renderLayout(
      moduleMetrics("proveedores"),
      "Nueva factura por pagar",
      form,
      "Cuentas por pagar a proveedores",
      records
    );
  },

  personal(search) {
    const editing = editingRosterId ? rosterList().find((person) => person.id === editingRosterId) : null;
    const branchNow = branchOptions.find((branch) => branch.id === state.currentBranchId)?.label || "esta sucursal";
    const categoryOptions = [
      { value: "", label: "Sin categoria" },
      { value: "estilista", label: "Estilista (cabello)" },
      { value: "esteticista", label: "Esteticista (facial y corporal)" },
      { value: "manicurista", label: "Manicurista (unas)" }
    ];

    // Casillas de servicios: marcadas segun lo que la persona ofrece hoy, o el
    // default de su categoria si es nueva.
    const stub = editing || { category: "", serviceAdd: [], serviceRemove: [] };
    const serviceBoxes = (state.procedures || []).length
      ? (state.procedures || [])
          .map((procedure) => {
            const offered = personOffersProcedure(stub, procedure);
            const cat = procedureCategory(procedure);
            return `<label class="roster-service"><input type="checkbox" data-roster-service value="${escapeHtml(procedure.id)}" ${
              offered ? "checked" : ""
            } /> <span>${escapeHtml(procedure.name)}${cat ? ` <em>· ${escapeHtml(cat)}</em>` : ""}</span></label>`;
          })
          .join("")
      : `<p class="payroll-sub">Aun no hay servicios cargados. Agrega procedimientos para poder afinar quien hace que.</p>`;

    const linkedUser = editing?.userId ? (state.users || []).find((user) => user.id === editing.userId) : null;
    const loginBlock = linkedUser
      ? `<p class="payroll-sub">Acceso al sistema: <strong>${escapeHtml(linkedUser.email || linkedUser.name)}</strong> (rol ${escapeHtml(roleLabel(linkedUser.role))}).</p>`
      : `<label class="field roster-login"><input type="checkbox" name="createLogin" value="true" /> <span>Crear acceso al sistema con su correo (podra entrar y definir su clave)</span></label>`;

    const form = `
      <form class="data-form" data-form="rosterPerson" autocomplete="off">
        <input type="hidden" name="rosterId" value="${escapeHtml(editing?.id || "")}" />
        <div class="form-grid">
          ${inputField("Nombre completo", "name", "text", editing?.name || "", "required")}
          ${selectField("Categoria", "category", categoryOptions, editing?.category || "")}
          ${inputField("Correo", "email", "email", editing?.email || "")}
        </div>
        <fieldset class="roster-services">
          <legend>Servicios que ofrece <span class="payroll-sub">(por defecto los de su categoria; destilda o agrega los que quieras)</span></legend>
          <div class="roster-services-grid">${serviceBoxes}</div>
        </fieldset>
        ${loginBlock}
        <div class="payroll-form-actions">
          <button class="primary-action" type="submit">${editing ? "Guardar cambios" : "Agregar al roster"}</button>
          ${editing ? `<button class="secondary-action" type="button" data-roster-cancel>Cancelar</button>` : ""}
        </div>
      </form>`;

    // Traslados temporales: solo al editar una persona y si hay otra sede.
    const otherBranches = branchOptions.filter((branch) => branch.id !== state.currentBranchId);
    const assignForm =
      editing && otherBranches.length
        ? `
      <form class="data-form roster-move" data-form="rosterAssignment" autocomplete="off">
        <input type="hidden" name="rosterId" value="${escapeHtml(editing.id)}" />
        <div class="form-grid">
          ${selectField("Trasladar a", "branch", otherBranches.map((branch) => ({ value: branch.id, label: branch.label })))}
          ${inputField("Desde", "from", "date", "")}
          ${inputField("Hasta", "to", "date", "")}
        </div>
        <button class="secondary-action" type="submit">Guardar traslado</button>
      </form>`
        : "";

    const moveList =
      editing && (editing.assignments || []).length
        ? `<ul class="roster-moves">${(editing.assignments || [])
            .map(
              (move) =>
                `<li><strong>${escapeHtml(branchLabel(move.branch))}</strong>: ${escapeHtml(move.from)} → ${escapeHtml(
                  move.to
                )} <button class="row-action is-warning" type="button" data-move-del="${escapeHtml(editing.id)}:${escapeHtml(
                  move.id
                )}">Quitar</button></li>`
            )
            .join("")}</ul>`
        : editing
          ? `<p class="payroll-sub">Sin traslados. Usa el formulario de arriba para mover a ${escapeHtml(editing.name)} a otra sede por unos dias.</p>`
          : "";

    const formWithMoves = editing
      ? `${form}<section class="roster-move-panel"><h4>Traslados temporales</h4>${assignForm}${moveList}</section>`
      : form;

    const roster = rosterList().filter((person) => matchesSearch([person.name, person.category, person.email], search));
    const today = todayISO();
    const rows = roster.length
      ? roster
          .map((person) => {
            const offered = (state.procedures || []).filter((procedure) => personOffersProcedure(person, procedure)).length;
            const linked = person.userId ? (state.users || []).find((user) => user.id === person.userId) : null;
            const movedNow = personBranchOn(person, state.currentBranchId, today);
            const away = movedNow !== state.currentBranchId;
            return `
        <tr class="${person.active === false ? "is-muted-row" : ""}">
          <td><strong>${escapeHtml(person.name)}</strong>${person.active === false ? ' <span class="dash-muted">(pausada)</span>' : ""}${
              away ? ` <span class="dash-muted">· hoy en ${escapeHtml(branchLabel(movedNow))}</span>` : ""
            }</td>
          <td>${person.category ? escapeHtml(person.category) : '<span class="dash-muted">—</span>'}</td>
          <td>${person.email ? escapeHtml(person.email) : '<span class="dash-muted">—</span>'}${linked ? ' <span class="dash-muted">· con acceso</span>' : ""}</td>
          <td class="dash-num">${offered}</td>
          <td>${(person.assignments || []).length || '<span class="dash-muted">—</span>'}</td>
          <td>
            <div class="inline-actions">
              <button class="row-action" type="button" data-roster-edit="${escapeHtml(person.id)}">Editar</button>
              <button class="row-action is-muted" type="button" data-roster-toggle="${escapeHtml(person.id)}">${
              person.active === false ? "Activar" : "Pausar"
            }</button>
              <button class="row-action is-warning" type="button" data-roster-del="${escapeHtml(person.id)}">Quitar</button>
            </div>
          </td>
        </tr>`;
          })
          .join("")
      : `<tr><td colspan="6"><div class="empty-state">Aun no hay personal en ${escapeHtml(
          branchNow
        )}. Agrega a tu equipo con el formulario.</div></td></tr>`;

    const records = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Categoria</th><th>Correo / acceso</th><th class="dash-num">Servicios</th><th>Traslados</th><th>Accion</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    return renderLayout(
      moduleMetrics("personal"),
      editing ? `Editar a ${editing.name}` : "Agregar persona",
      formWithMoves,
      `Equipo de ${branchNow}`,
      records
    );
  },

  planilla() {
    const benefits = state.benefits || [];
    const vacations = state.vacations || [];
    const period = payrollPeriod || currentQuincena();
    const staff = activeStaff();

    const canEdit = canWrite("planilla");
    const statusOptions = (list, selected) => list.map((value) => ({ value, label: value, selected: value === selected }));
    const delBtn = (kind, id) => `<button class="row-action is-warning" type="button" data-payroll-del="${kind}:${escapeHtml(id)}">Eliminar</button>`;

    // Totales de la quincena.
    const totals = staff.reduce(
      (acc, person) => {
        const c = computePayroll(person, payrollRun(person.name, period), period);
        acc.totalPagar += c.totalPagar;
        acc.totalSalario += c.totalSalario;
        acc.ccss += c.ccss;
        acc.comision += c.comision;
        const run = payrollRun(person.name, period);
        if ((run?.status || "Pendiente") !== "Pagada") acc.pendientes += 1;
        return acc;
      },
      { totalPagar: 0, totalSalario: 0, ccss: 0, comision: 0, pendientes: 0 }
    );

    const kpis = [
      ["Total a pagar (quincena)", money(totals.totalPagar)],
      ["Comisiones (quincena)", money(totals.comision)],
      ["Empleados activos", String(staff.length)],
      ["Pendientes de pago", String(totals.pendientes)]
    ]
      .map(
        ([label, value]) => `
          <div class="dash-kpi">
            <span class="dash-kpi-value">${escapeHtml(value)}</span>
            <span class="dash-kpi-label">${escapeHtml(label)}</span>
          </div>`
      )
      .join("");

    /* --- Registro de empleados --- */
    const editing = editingStaffId ? staffList().find((item) => item.id === editingStaffId) : null;
    const branchStaffOptions = branchOptions.map((b) => ({ value: b.id, label: b.label, selected: editing ? editing.branch === b.id : false }));
    const puestoSelOptions = puestoOptions.map((p) => ({ value: p, label: p, selected: editing ? editing.puesto === p : false }));
    const staffForm = `
      <form class="data-form payroll-form" data-form="staff" autocomplete="off">
        <input type="hidden" name="staffId" value="${escapeHtml(editing?.id || "")}" />
        <div class="form-grid">
          ${inputField("Nombre completo", "name", "text", editing?.name || "", "required")}
          ${selectField("Puesto", "puesto", puestoSelOptions, editing?.puesto || "Estilista")}
          ${selectField("Sucursal", "branch", branchStaffOptions, editing?.branch || branchOptions[0]?.id)}
          ${inputField("Cedula", "cedula", "text", editing?.cedula || "")}
          ${inputField("Cuenta bancaria (IBAN)", "cuenta", "text", editing?.cuenta || "")}
          ${inputField("Salario base mensual", "salarioBase", "number", editing?.salarioBase ?? 0, "min='0' step='1000'")}
          ${inputField("Comision % sobre ventas", "comisionRate", "number", editing?.comisionRate ?? 0, "min='0' step='0.5'")}
        </div>
        <div class="payroll-form-actions">
          <button class="primary-action" type="submit">${editing ? "Guardar cambios" : "Agregar empleado"}</button>
          ${editing ? `<button class="secondary-action" type="button" data-staff-cancel>Cancelar</button>` : ""}
        </div>
      </form>`;

    const staffRows = staff.length || staffList().length
      ? staffList()
          .map(
            (item) => `
        <tr class="${item.active === false ? "is-muted-row" : ""}">
          <td><strong>${escapeHtml(item.name)}</strong>${item.active === false ? ' <span class="dash-muted">(pausado)</span>' : ""}</td>
          <td>${escapeHtml(item.puesto || "")}</td>
          <td>${escapeHtml(branchLabel(item.branch))}</td>
          <td class="dash-num">${money(item.salarioBase)}</td>
          <td class="dash-num">${escapeHtml(item.comisionRate || 0)}%</td>
          <td>${escapeHtml(item.cuenta || "")}</td>
          <td>
            <div class="inline-actions">
              <button class="row-action" type="button" data-staff-edit="${escapeHtml(item.id)}">Editar</button>
              <button class="row-action is-muted" type="button" data-staff-toggle="${escapeHtml(item.id)}">${item.active === false ? "Activar" : "Pausar"}</button>
              <button class="row-action is-warning" type="button" data-staff-del="${escapeHtml(item.id)}">Eliminar</button>
            </div>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="7"><p class="dash-empty">Aun no hay empleados. Agrega al personal para armar la planilla.</p></td></tr>`;

    /* --- Planilla quincenal (todo calculado) --- */
    const quincenaSel = quincenaOptions(10)
      .map((q) => `<option value="${escapeHtml(q.value)}"${q.value === period ? " selected" : ""}>${escapeHtml(q.label)}</option>`)
      .join("");

    const numInput = (item, field, value, step = "1") =>
      `<input class="pay-cell" type="number" min="0" step="${step}" value="${value ? escapeHtml(value) : ""}" data-pay-emp="${escapeHtml(item.id)}" data-pay-field="${field}" ${canEdit ? "" : "disabled"} />`;

    const payrollRows = staff.length
      ? staff
          .map((item) => {
            const run = payrollRun(item.name, period);
            const c = computePayroll(item, run, period);
            const paid = (run?.status || "Pendiente") === "Pagada";
            return `
        <tr class="${paid ? "is-paid-row" : ""}">
          <td><strong>${escapeHtml(item.name)}</strong><br /><span class="dash-muted">${escapeHtml(item.puesto || "")} · ${escapeHtml(branchLabel(item.branch))}</span></td>
          <td class="dash-num">${money(Math.round(c.quincenal))}</td>
          <td class="pay-input">${numInput(item, "feriadoDias", run?.feriadoDias, "1")}</td>
          <td class="pay-input">${numInput(item, "horasExtra", run?.horasExtra, "0.5")}</td>
          <td class="pay-input">${numInput(item, "horasRebajo", run?.horasRebajo, "0.5")}</td>
          <td class="pay-input">${numInput(item, "incapacidadDias", run?.incapacidadDias, "0.5")}</td>
          <td class="pay-input">${numInput(item, "bonos", run?.bonos, "500")}</td>
          <td class="pay-input"><input class="pay-cell" type="number" min="0" step="500" placeholder="${Math.round(c.comision)}" value="${run?.comisionManual != null && run?.comisionManual !== "" ? escapeHtml(run.comisionManual) : ""}" data-pay-emp="${escapeHtml(item.id)}" data-pay-field="comisionManual" ${canEdit ? "" : "disabled"} /></td>
          <td class="dash-num">${money(Math.round(c.totalSalario))}</td>
          <td class="dash-num dash-muted">${money(Math.round(c.ccss))}</td>
          <td class="pay-input">${numInput(item, "otrosRebajos", run?.otrosRebajos, "500")}</td>
          <td class="dash-num"><strong>${money(Math.round(c.totalPagar))}</strong></td>
          <td>
            <button class="row-action ${paid ? "is-muted" : ""}" type="button" data-pay-status="${escapeHtml(item.id)}:${paid ? "Pendiente" : "Pagada"}" ${canEdit ? "" : "disabled"}>${paid ? "Pagado ✓" : "Marcar pagado"}</button>
          </td>
        </tr>`;
          })
          .join("")
      : `<tr><td colspan="13"><p class="dash-empty">Agrega empleados arriba para ver la planilla de la quincena.</p></td></tr>`;

    const totalsRow = staff.length
      ? `<tr class="pay-totals">
          <td><strong>Totales</strong></td>
          <td colspan="7"></td>
          <td class="dash-num"><strong>${money(Math.round(totals.totalSalario))}</strong></td>
          <td class="dash-num"><strong>${money(Math.round(totals.ccss))}</strong></td>
          <td></td>
          <td class="dash-num"><strong>${money(Math.round(totals.totalPagar))}</strong></td>
          <td></td>
        </tr>`
      : "";

    const payrollSection = `
      <section class="dash-panel dash-panel-wide payroll-panel">
        <div class="payroll-head">
          <div>
            <h3>Planilla de la quincena</h3>
            <p class="payroll-sub">Ventas, comision, CCSS (10.83%) y total a pagar se calculan solos. Solo llenas feriados, horas y ajustes.</p>
          </div>
          <div class="payroll-controls">
            <label class="field"><span class="visually-hidden">Quincena</span><select data-payroll-period>${quincenaSel}</select></label>
            <button type="button" class="dash-export" data-payroll-export>Exportar para el banco</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="dash-table payroll-table">
            <thead><tr>
              <th>Empleado</th><th class="dash-num">Quincenal</th><th>Feriado d.</th><th>H. extra</th><th>H. rebajo</th><th>Incap. d.</th><th>Bonos ₡</th><th>Comision ₡</th><th class="dash-num">Total salario</th><th class="dash-num">CCSS</th><th>Otros reb. ₡</th><th class="dash-num">Total a pagar</th><th></th>
            </tr></thead>
            <tbody>${payrollRows}${totalsRow}</tbody>
          </table>
        </div>
      </section>`;

    const staffPanel = `
      <section class="dash-panel dash-panel-wide payroll-panel">
        <h3>Empleados</h3>
        <p class="payroll-sub">Datos fijos de cada persona: puesto, sucursal, cedula, cuenta, salario base y % de comision.</p>
        ${canEdit ? staffForm : ""}
        <div class="table-wrap">
          <table class="dash-table">
            <thead><tr><th>Nombre</th><th>Puesto</th><th>Sucursal</th><th class="dash-num">Salario base</th><th>Comision</th><th>Cuenta</th><th></th></tr></thead>
            <tbody>${staffRows}</tbody>
          </table>
        </div>
      </section>`;

    /* --- Beneficios --- */
    const benefitRows = benefits.length
      ? benefits
          .map(
            (item) => `
        <tr>
          <td><strong>${escapeHtml(item.worker)}</strong></td>
          <td>${escapeHtml(item.type)}</td>
          <td class="dash-num">${money(item.amount)}</td>
          <td>${escapeHtml(item.date)}</td>
          <td>${escapeHtml(item.notes || "")}</td>
          <td>${delBtn("benefit", item.id)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="6"><p class="dash-empty">Aun no hay beneficios registrados.</p></td></tr>`;

    const benefitForm = `
      <form class="data-form payroll-form" data-form="benefit" autocomplete="off">
        <div class="form-grid">
          ${selectField("Persona", "worker", staffOptions(), "", "required")}
          ${selectField("Tipo", "type", statusOptions(["Aguinaldo", "Bono", "Seguro", "Capacitacion", "Adelanto", "Otro"], "Bono"), "Bono")}
          ${inputField("Monto", "amount", "number", "0", "min='0' step='100'")}
          ${inputField("Fecha", "date", "date", todayISO(), "required")}
          ${inputField("Nota", "notes", "text", "")}
        </div>
        <button class="primary-action" type="submit">Registrar beneficio</button>
      </form>`;

    /* --- Vacaciones --- */
    const vacationRows = vacations.length
      ? vacations
          .map(
            (item) => `
        <tr>
          <td><strong>${escapeHtml(item.worker)}</strong></td>
          <td>${escapeHtml(item.from)}</td>
          <td>${escapeHtml(item.to)}</td>
          <td class="dash-num">${vacationDays(item.from, item.to)}</td>
          <td>${statusBadge(item.status)}</td>
          <td>${escapeHtml(item.notes || "")}</td>
          <td>${delBtn("vacation", item.id)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="7"><p class="dash-empty">Aun no hay vacaciones registradas.</p></td></tr>`;

    const vacationForm = `
      <form class="data-form payroll-form" data-form="vacation" autocomplete="off">
        <div class="form-grid">
          ${selectField("Persona", "worker", staffOptions(), "", "required")}
          ${inputField("Desde", "from", "date", todayISO(), "required")}
          ${inputField("Hasta", "to", "date", todayISO(), "required")}
          ${selectField("Estado", "status", statusOptions(["Solicitada", "Aprobada", "Tomada"], "Solicitada"), "Solicitada")}
          ${inputField("Nota", "notes", "text", "")}
        </div>
        <button class="primary-action" type="submit">Registrar vacaciones</button>
      </form>`;

    const panel = (title, subtitle, form, headers, rows) => `
      <section class="dash-panel dash-panel-wide payroll-panel">
        <h3>${escapeHtml(title)}</h3>
        <p class="payroll-sub">${escapeHtml(subtitle)}</p>
        ${canWrite("planilla") ? form : ""}
        <div class="table-wrap">
          <table class="dash-table">
            <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;

    return `
      <section class="dash">
        <div class="dash-head">
          <div>
            <h2>Planilla y RRHH</h2>
            <p>Planilla quincenal calculada, empleados, beneficios y vacaciones. Acceso restringido por el super usuario.</p>
          </div>
        </div>
        <div class="dash-kpis">${kpis}</div>
        ${payrollSection}
        ${staffPanel}
        ${panel(
          "Beneficios y aguinaldo",
          "Aguinaldo, bonos, seguros, capacitaciones y adelantos por persona.",
          benefitForm,
          ["Persona", "Tipo", "Monto", "Fecha", "Nota", ""],
          benefitRows
        )}
        ${panel(
          "Vacaciones",
          "Control de dias solicitados, aprobados y tomados.",
          vacationForm,
          ["Persona", "Desde", "Hasta", "Dias", "Estado", "Nota", ""],
          vacationRows
        )}
      </section>
    `;
  },

  clientes(search) {
    const rows = state.clients
      .filter((client) => matchesSearch([client.name, client.phone, client.email, client.notes, client.birthday], search))
      .map(
        (client) => {
          const extras = [];
          if (client.birthday) extras.push(`🎂 ${escapeHtml(birthdayLabel(client.birthday))}`);
          if (Number(client.points) > 0) extras.push(`★ ${escapeHtml(client.points)} pts`);
          if (Number(client.creditBalance) > 0) extras.push(`saldo ${money(client.creditBalance)}`);
          return `
          <tr>
            <td>
              <div class="cell-title">
                <strong>${escapeHtml(client.name)}</strong>
                <span>${escapeHtml(client.id)} | ultima visita ${escapeHtml(client.lastVisit || "Sin fecha")}</span>
              </div>
            </td>
            <td>
              ${escapeHtml(client.phone) || "<span class='muted-cell'>Sin telefono</span>"}<br />${escapeHtml(client.email) || "<span class='muted-cell'>Sin correo</span>"}
              ${extras.length ? `<br /><span class="client-extras">${extras.join(" · ")}</span>` : ""}
            </td>
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
        `;
        }
      );

    const form = `
      <form class="data-form" data-form="client" autocomplete="off">
        <div class="form-grid">
          ${inputField("Nombre", "name", "text", "", "required")}
          ${inputField("Telefono", "phone", "tel", "", "required")}
          ${inputField("Email", "email", "email")}
          ${inputField("Cumpleaños", "birthday", "date")}
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
    if (ensureLocations()) storeStateLocally();

    const filter = inventoryFilter;
    const all = state.products;
    const lowCount = all.filter(isLowStock).length;
    const unplacedCount = all.filter((product) => !product.locationId).length;

    const matchesFilter = (product) => {
      if (filter === "low") return isLowStock(product);
      if (filter === "unplaced") return !product.locationId;
      if (filter.startsWith("loc:")) return String(product.locationId || "") === filter.slice(4);
      return true;
    };

    const rows = all
      .filter(matchesFilter)
      .filter((product) =>
        matchesSearch(
          [product.name, product.category, product.supplier, product.unit, locationName(product.locationId), product.spot, isLowStock(product) ? "stock bajo alerta reponer" : "ok"],
          search
        )
      )
      .map((product) => {
        const low = isLowStock(product);
        const place = product.locationId
          ? `<span class="location-name"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></svg>${escapeHtml(locationName(product.locationId))}</span>${
              product.spot ? `<span class="location-spot">${escapeHtml(product.spot)}</span>` : ""
            }`
          : `<span class="location-none">Sin ubicacion</span>`;

        return `
          <tr>
            <td>
              <div class="product-cell">
                ${productPhotoCell(product)}
                <div class="cell-title">
                  <strong>${escapeHtml(product.name)}</strong>
                  <span>${escapeHtml(product.id)} | ${escapeHtml(product.category)}</span>
                </div>
              </div>
            </td>
            <td>${low ? statusBadge("Reponer") : statusBadge("En rango")}</td>
            <td class="num"><strong>${escapeHtml(product.stock)}</strong> <span class="muted-cell">${escapeHtml(product.unit)}</span></td>
            <td class="num muted-cell">${escapeHtml(product.min)}</td>
            <td><div class="location-cell">${place}</div></td>
            <td class="num">${money(product.cost)}</td>
            <td>${escapeHtml(product.supplier || "-")}</td>
            <td>
              <div class="inline-actions">
                <button class="row-action" type="button" data-stock-add="${product.id}">Entrada +1</button>
                <button class="row-action is-muted" type="button" data-stock-use="${product.id}">Usar -1</button>
                <button class="row-action is-muted" type="button" data-product-place="${product.id}">Ubicar</button>
              </div>
            </td>
          </tr>
        `;
      });

    // aria-pressed: sin el, un lector de pantalla lee ocho botones iguales y
    // no dice cual esta aplicado. Los dias del calendario ya lo llevaban.
    const chip = (value, label, count, tone = "") =>
      `<button class="filter-chip ${filter === value ? "is-active" : ""}" type="button" aria-pressed="${
        filter === value
      }" data-inventory-filter="${escapeHtml(value)}">${escapeHtml(label)}${
        count === null ? "" : ` <b class="${tone}">${escapeHtml(count)}</b>`
      }</button>`;

    const filters = `
      <div class="filter-bar" role="group" aria-label="Filtrar productos">
        ${chip("all", "Todos", all.length)}
        ${chip("low", "Bajo minimo", lowCount)}
        ${chip("unplaced", "Sin ubicacion", unplacedCount)}
        ${locationList()
          .map((location) => chip(`loc:${location.id}`, location.name, productsAtLocation(location.id).length))
          .join("")}
      </div>
    `;

    const board = locationList().length
      ? `
        <div class="location-board">
          ${locationList()
            .map((location) => {
              const items = productsAtLocation(location.id);
              const low = items.filter(isLowStock);
              return `
                <article class="location-card">
                  <div class="location-card-head">
                    <strong>${escapeHtml(location.name)}</strong>
                    <span>${escapeHtml(items.length)} productos</span>
                  </div>
                  <div class="location-chips">
                    ${
                      items.length
                        ? items
                            .slice(0, 6)
                            .map(
                              (product) =>
                                `<span class="location-chip ${isLowStock(product) ? "is-low" : ""}">${escapeHtml(product.name)}</span>`
                            )
                            .join("")
                        : `<span class="location-empty">Sin productos asignados</span>`
                    }
                    ${items.length > 6 ? `<span class="location-chip">+${escapeHtml(items.length - 6)}</span>` : ""}
                  </div>
                  ${low.length ? `<span class="location-empty">${escapeHtml(low.length)} por reponer</span>` : ""}
                </article>
              `;
            })
            .join("")}
        </div>
      `
      : "";

    const form = `
      <form class="data-form" data-form="product" autocomplete="off">
        <div class="form-grid">
          ${photoField()}
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
          ${selectField("Ubicacion", "locationId", locationOptions(prefill.locationId || ""), prefill.locationId || "")}
          ${inputField("Detalle del lugar", "spot", "text", "", "placeholder='Estante B, nivel 2'")}
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
      `${filters}${renderTable(
        ["Producto", "Estado", "Stock", "Minimo", "Ubicacion", "Costo", "Proveedor", "Acciones"],
        rows
      )}${board}`
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
    if (ensureStations()) storeStateLocally();

    const selectedClient = prefill.clientId || state.clients[0]?.id || "";
    const selectedProcedure = prefill.procedureId || state.procedures[0]?.id || "";
    const rows = state.activeProcedures
      .filter((item) =>
        matchesSearch(
          [clientName(item.clientId), procedureName(item.procedureId), item.specialist, item.status, item.notes, stationName(item.stationId)],
          search
        )
      )
      .map((item) => {
        const procedure = getProcedure(item.procedureId);
        const productId = procedure?.productId || "";
        const stationSelect = `<select class="station-inline" data-station-select="${item.id}" aria-label="Estacion de ${escapeHtml(clientName(item.clientId))}">${optionsHtml(stationOptions(item.stationId || ""))}</select>`;
        return `
          <tr>
            <td>
              <div class="cell-title">
                <strong>${escapeHtml(clientName(item.clientId))}</strong>
                <span>${escapeHtml(procedureName(item.procedureId))}</span>
              </div>
            </td>
            <td>${statusBadge(item.status)}<br />${escapeHtml(item.specialist)}</td>
            <td>${canWrite("enCurso") ? stationSelect : escapeHtml(stationName(item.stationId) || "Sin estacion")}</td>
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
          ${selectField("Especialista", "specialist", specialistOptions(""), "", "required")}
          ${selectField("Estacion", "stationId", stationOptions(""), "")}
          ${inputField("Proxima accion", "next", "date", todayISO())}
          ${textareaField("Notas de la sesion", "notes")}
        </div>
        <button class="primary-action" type="submit">Iniciar procedimiento</button>
      </form>
    `;

    return `
      ${renderStationBoard()}
      ${renderLayout(
        moduleMetrics("enCurso"),
        "Iniciar procedimiento",
        form,
        "Seguimiento activo",
        renderTable(["Cliente", "Estado", "Estacion", "Fechas", "Notas", "Acciones"], rows)
      )}
    `;
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
          ${selectField("Especialista", "specialist", specialistOptions(""), "", "required")}
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
      `${typeof renderAppointmentAgenda === "function" ? renderAppointmentAgenda() : ""}${renderTable(["Cliente", "Fecha", "Especialista", "Estado", "Acciones"], rows)}`
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
            <td data-alegra-cell="${escapeHtml(invoice.id)}">${alegraCell(invoice)}</td>
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
          ${selectField("Colaborador", "collaborator", specialistOptions(""), "", "required")}
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
      renderTable(["Factura", "Tratamiento", "Productos", "Montos", "IVA", "Pago", "Notas", "Alegra"], rows)
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
            <td>${escapeHtml(roleLabel(user.role))}<br />${escapeHtml(user.function)}${user.payrollAccess ? `<br /><span class="access-chip">Planilla</span>` : ""}</td>
            <td>${escapeHtml(branchScopeLabel(user.branchScope))}</td>
            <td>${user.active ? statusBadge("Activo") : statusBadge("Pausado")}</td>
            <td><div class="permission-list">${permissionBadges}</div></td>
            <td>
              <div class="inline-actions">
                ${
                  user.id === state.currentUserId
                    ? `<button class="row-action" type="button" disabled>Actual</button>`
                    : user.email
                      ? `<button class="row-action" type="button" data-switch-user="${user.id}">Usar cuenta</button>`
                      : `<button class="row-action" type="button" disabled title="Esta cuenta no tiene correo configurado">Sin correo</button>`
                }
                <button class="row-action is-muted" type="button" data-toggle-user="${user.id}">
                  ${user.active ? "Pausar" : "Activar"}
                </button>
                ${
                  currentUser()?.role === "super" && user.id !== state.currentUserId
                    ? `<button class="row-action" type="button" data-user-reset-pw="${user.id}" data-user-name="${escapeHtml(user.name)}">Contrasena</button>`
                    : ""
                }
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
          ${selectField("Sucursal asignada", "branchScope", branchScopeOptions(), "all")}
          ${
            currentUser()?.role === "super"
              ? selectField(
                  "Acceso a planilla",
                  "payrollAccess",
                  [
                    { value: "false", label: "No", selected: true },
                    { value: "true", label: "Si" }
                  ],
                  "false"
                )
              : ""
          }
        </div>
        <div class="permission-preview">
          <strong>Funciones base</strong>
          <span>Super usuario y administrador: todo y todas las sucursales. Recepcion: clientes/citas/facturacion. Especialista: sesiones. Inventario: productos. La "Sucursal asignada" ata a la persona a una sede: no vera ni tocara datos de la otra.</span>
        </div>
        <button class="primary-action" type="submit">Guardar usuario</button>
      </form>
    `;

    return renderLayout(
      moduleMetrics("usuarios"),
      "Nuevo usuario",
      form,
      "Usuarios y permisos",
      renderTable(["Usuario", "Funcion", "Sucursal", "Estado", "Permisos", "Acciones"], rows)
    );
  }
};

/* =====================================================================
   Panel lateral de creación
   ---------------------------------------------------------------------
   El formulario de alta se creaba en línea y ocupaba media pantalla de
   forma permanente, aunque se use una vez al día. Sigue generándose en el
   marcado del módulo —production-tools.js y enhancements.js se anclan a
   .view-grid y .records-panel— pero se traslada al panel lateral, que solo
   se abre cuando hace falta.
   ===================================================================== */

const drawerElements = {
  root: document.querySelector("#drawer"),
  scrim: document.querySelector("#drawerScrim"),
  title: document.querySelector("#drawerTitle"),
  body: document.querySelector("#drawerBody"),
  close: document.querySelector("#drawerClose"),
  cancel: document.querySelector("#drawerCancel"),
  submit: document.querySelector("#drawerSubmit")
};

let drawerReturnFocus = null;

// Mueve el .form-panel recién renderizado dentro del panel lateral.
function moveFormToDrawer() {
  if (!drawerElements.body) return;
  const panel = elements.viewContent?.querySelector(".view-grid > .form-panel");
  if (!panel) return;

  // Si el panel esta abierto, alguien lo esta llenando. Un render disparado
  // por la sincronizacion -otra persona guardo algo- no debe borrarle lo
  // escrito. Se descarta el formulario recien generado para no dejar dos
  // copias en el documento: los modulos que buscan form[data-form="..."] con
  // querySelector se quedarian con la copia oculta.
  if (document.body.classList.contains("drawer-open")) {
    panel.remove();
    return;
  }

  drawerElements.body.replaceChildren(panel);
  if (drawerElements.title) {
    drawerElements.title.textContent = panel.dataset.formTitle || "Nuevo registro";
  }
  const hasForm = Boolean(panel.querySelector(".data-form"));
  if (drawerElements.submit) drawerElements.submit.hidden = !hasForm;
}

// El panel cerrado sigue en el documento, solo desplazado fuera de la
// pantalla. Sin `inert`, sus nueve controles seguian en el recorrido del
// tabulador: el foco desaparecia de la vista y habia que tabular a ciegas
// para salir. `inert` los saca del recorrido y del arbol de accesibilidad,
// que es ademas lo que exige `aria-hidden`.
function setDrawerInert(isOpen) {
  if (!drawerElements.root) return;
  drawerElements.root.inert = !isOpen;
  drawerElements.root.setAttribute("aria-hidden", isOpen ? "false" : "true");
  // Y al reves mientras esta abierto: el resto de la pagina queda inerte,
  // asi el foco no se escapa por detras del velo, que solo frena al raton.
  document.querySelectorAll(".topbar, .app-shell").forEach((region) => {
    region.inert = isOpen;
  });
}

function openDrawer() {
  if (!drawerElements.root) return;
  if (!drawerElements.body?.querySelector(".data-form")) {
    showToast("Este usuario no puede crear registros en este modulo");
    return;
  }
  drawerReturnFocus = document.activeElement;
  document.body.classList.add("drawer-open");
  setDrawerInert(true);
  window.setTimeout(() => {
    // Solo controles realmente enfocables: el campo de foto trae un input de
    // archivo oculto y otro de tipo hidden, y enfocarlos no hace nada.
    drawerElements.body
      ?.querySelector("input:not([type=hidden]):not([hidden]), select, textarea")
      ?.focus();
  }, 220);
}

function closeDrawer() {
  if (!document.body.classList.contains("drawer-open")) return;
  document.body.classList.remove("drawer-open");
  setDrawerInert(false);
  if (drawerReturnFocus instanceof HTMLElement) drawerReturnFocus.focus();
  drawerReturnFocus = null;
}

function submitDrawerForm() {
  const form = drawerElements.body?.querySelector(".data-form");
  if (!form) return;
  if (typeof form.requestSubmit === "function") form.requestSubmit();
  else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

/* =====================================================================
   Ubicaciones físicas del inventario
   ---------------------------------------------------------------------
   Saber que quedan dos peróxidos no sirve si nadie sabe en qué estante
   están. Las ubicaciones son datos de sucursal: un estante de Rohrmoser
   no existe en Alajuela.
   ===================================================================== */

const defaultLocationNames = ["Bodega principal", "Recepcion", "Sala 1", "Sala 2", "Vitrina"];

function locationList() {
  return Array.isArray(state.locations) ? state.locations : [];
}

// Siembra las ubicaciones habituales la primera vez que se abre inventario.
// Se hace aunque todavía no haya productos: si no, al primer producto no se le
// podría asignar ubicación porque la lista estaría vacía.
function ensureLocations() {
  if (!Array.isArray(state.locations)) state.locations = [];
  if (state.locations.length) return false;
  state.locations = defaultLocationNames.map((name, index) => ({
    id: `UBI-${String(index + 1).padStart(3, "0")}`,
    name
  }));
  return true;
}

function locationById(id) {
  return locationList().find((location) => location.id === id) || null;
}

function locationName(id) {
  return locationById(id)?.name || "";
}

function locationOptions(selected = "") {
  return [
    { value: "", label: "Sin ubicacion asignada" },
    ...locationList().map((location) => ({
      value: location.id,
      label: location.name,
      selected: location.id === selected
    }))
  ];
}

function productsAtLocation(locationId) {
  return state.products.filter((product) => String(product.locationId || "") === String(locationId));
}

function isLowStock(product) {
  return Number(product.stock) <= Number(product.min);
}

/* =====================================================================
   Estaciones de trabajo (cabinas de estetica, sillas de unas y de pelo)
   ---------------------------------------------------------------------
   Una estacion es un puesto fisico donde se atiende. En "En curso" se ve el
   tablero: cuales estan libres y cuales ocupadas, con quien y en que. La
   ocupacion se deduce de los procedimientos activos: cada uno puede quedar
   asignado a una estacion por su `stationId`. Son datos de sucursal, como las
   ubicaciones de inventario.
   ===================================================================== */

const stationTypes = [
  { id: "estetica", label: "Cabinas de estetica", one: "Cabina", icon: "&#10024;" },
  { id: "unas", label: "Sillas de unas", one: "Silla de unas", icon: "&#128133;" },
  { id: "peluqueria", label: "Sillas de peluqueria", one: "Silla de pelo", icon: "&#9986;" }
];

const defaultStationSeed = [
  { type: "estetica", name: "Cabina 1" },
  { type: "estetica", name: "Cabina 2" },
  { type: "estetica", name: "Cabina 3" },
  { type: "unas", name: "Silla de unas 1" },
  { type: "unas", name: "Silla de unas 2" },
  { type: "unas", name: "Silla de unas 3" },
  { type: "unas", name: "Silla de unas 4" },
  { type: "peluqueria", name: "Silla de pelo 1" },
  { type: "peluqueria", name: "Silla de pelo 2" },
  { type: "peluqueria", name: "Silla de pelo 3" }
];

function stationList() {
  return Array.isArray(state.stations) ? state.stations : [];
}

// Siembra las estaciones habituales la primera vez que se entra a En curso, si
// la sucursal todavia no tiene ninguna.
function ensureStations() {
  if (!Array.isArray(state.stations)) state.stations = [];
  if (state.stations.length) return false;
  state.stations = defaultStationSeed.map((seed, index) => ({
    id: `EST-${String(index + 1).padStart(3, "0")}-${idSuffix()}`,
    type: seed.type,
    name: seed.name
  }));
  return true;
}

function stationById(id) {
  return stationList().find((station) => station.id === id) || null;
}

function stationName(id) {
  return stationById(id)?.name || "";
}

function stationTypeLabel(typeId) {
  return stationTypes.find((type) => type.id === typeId)?.one || "Estacion";
}

// Procedimiento activo (sin finalizar) que ocupa una estacion, si hay alguno.
function stationOccupant(stationId) {
  return activeProcedures().find((item) => String(item.stationId || "") === String(stationId)) || null;
}

function stationOptions(selected = "") {
  return [
    { value: "", label: "Sin estacion asignada" },
    ...stationList().map((station) => ({
      value: station.id,
      label: `${station.name} (${stationTypeLabel(station.type)})`,
      selected: station.id === selected
    }))
  ];
}

// Tablero de estaciones para "En curso": una fila por tipo, con tarjetas que se
// pintan libres u ocupadas y, si estan ocupadas, con quien y en que.
function renderStationBoard() {
  const canManage = canWrite("enCurso");
  const groups = stationTypes
    .map((type) => {
      const stations = stationList().filter((station) => station.type === type.id);
      const freeCount = stations.filter((station) => !stationOccupant(station.id)).length;
      const cards = stations
        .map((station) => {
          const occ = stationOccupant(station.id);
          if (occ) {
            const paused = occ.status === "Pausado";
            return `
              <div class="station-card is-busy${paused ? " is-paused" : ""}">
                <div class="station-top">
                  <span class="station-name">${escapeHtml(station.name)}</span>
                  <span class="station-pill is-busy">${paused ? "Pausada" : "Ocupada"}</span>
                </div>
                <div class="station-client">${escapeHtml(clientName(occ.clientId))}</div>
                <div class="station-meta">${escapeHtml(procedureName(occ.procedureId))}</div>
                <div class="station-meta station-with">Con ${escapeHtml(occ.specialist || "sin asignar")}</div>
                <div class="station-since">Desde ${escapeHtml(occ.started || "hoy")}</div>
                ${
                  canManage
                    ? `<button class="station-free" type="button" data-free-station="${occ.id}">Liberar</button>`
                    : ""
                }
              </div>`;
          }
          return `
            <div class="station-card is-free">
              <div class="station-top">
                <span class="station-name">${escapeHtml(station.name)}</span>
                <span class="station-pill is-free">Disponible</span>
              </div>
              <div class="station-meta station-empty-hint">Libre ahora</div>
              ${
                canManage
                  ? `<button class="station-remove" type="button" data-remove-station="${station.id}" title="Quitar estacion" aria-label="Quitar ${escapeHtml(station.name)}">&times;</button>`
                  : ""
              }
            </div>`;
        })
        .join("");
      return `
        <section class="station-group">
          <header class="station-group-head">
            <h4>${type.icon} ${escapeHtml(type.label)}</h4>
            <span class="station-count">${freeCount}/${stations.length} libres</span>
          </header>
          <div class="station-cards">
            ${stations.length ? cards : `<p class="station-empty">Sin estaciones de este tipo.</p>`}
          </div>
        </section>`;
    })
    .join("");

  const manage = canManage
    ? `
      <form class="station-add" data-add-station>
        <input type="text" name="stationName" placeholder="Nombre de la estacion" maxlength="40" required />
        <select name="stationType" aria-label="Tipo de estacion">
          ${stationTypes.map((type) => `<option value="${type.id}">${type.label}</option>`).join("")}
        </select>
        <button class="secondary-action" type="submit">Agregar</button>
      </form>`
    : "";

  return `
    <section class="station-board">
      <div class="station-board-head">
        <h3>Estaciones</h3>
        <p>Cabinas y sillas de la sucursal: quien esta libre y quien esta trabajando.</p>
      </div>
      <div class="station-groups">${groups}</div>
      ${manage}
    </section>`;
}

// Libera la estacion de un procedimiento activo sin finalizarlo.
function freeStationOccupant(activeId) {
  const active = state.activeProcedures.find((item) => item.id === activeId);
  if (!active) return;
  active.stationId = "";
  persistAndRender("Estacion liberada");
}

// Asigna (o cambia) la estacion de un procedimiento activo.
function setActiveStation(activeId, stationId) {
  const active = state.activeProcedures.find((item) => item.id === activeId);
  if (!active) return;
  active.stationId = stationId || "";
  persistAndRender(stationId ? "Estacion asignada" : "Estacion liberada");
}

function addStation(name, type) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return;
  if (!Array.isArray(state.stations)) state.stations = [];
  const validType = stationTypes.some((item) => item.id === type) ? type : stationTypes[0].id;
  state.stations.push({ id: `EST-${String(state.stations.length + 1).padStart(3, "0")}-${idSuffix()}`, type: validType, name: cleanName });
  persistAndRender("Estacion agregada");
}

function removeStation(stationId) {
  if (stationOccupant(stationId)) {
    showToast("Esa estacion esta ocupada. Liberala antes de quitarla.");
    return;
  }
  state.stations = stationList().filter((station) => station.id !== stationId);
  persistAndRender("Estacion eliminada");
}

/* =====================================================================
   Fotos de producto
   ---------------------------------------------------------------------
   Las imágenes no viajan dentro de `state`: el estado completo se envía en
   cada guardado con un tope de 2 MB, y una docena de fotos en base64 lo
   reventaría. `state` solo guarda el identificador; los bytes viven en
   /api/media.
   ===================================================================== */

const imageObjectUrls = new Map();
const imageRequests = new Map();
const maxImageSide = 1000;

function mediaToken() {
  try {
    return sessionStorage.getItem("salonSuiteBackendToken") || apiSessionToken() || "";
  } catch (error) {
    return apiSessionToken() || "";
  }
}

function mediaPath(imageId) {
  return `api/media/${encodeURIComponent(imageId)}`;
}

// Descarga la imagen con la sesión activa y la deja como blob URL. Un
// <img src> no puede enviar la cabecera Authorization, así que se busca
// aparte y se cachea por identificador.
function loadProductImage(imageId) {
  if (!imageId) return Promise.resolve("");
  if (imageObjectUrls.has(imageId)) return Promise.resolve(imageObjectUrls.get(imageId));
  if (imageRequests.has(imageId)) return imageRequests.get(imageId);

  const token = mediaToken();
  const request = fetch(mediaPath(imageId), {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
    .then((response) => (response.ok ? response.blob() : null))
    .then((blob) => {
      if (!blob) return "";
      const url = URL.createObjectURL(blob);
      imageObjectUrls.set(imageId, url);
      return url;
    })
    .catch(() => "")
    .finally(() => imageRequests.delete(imageId));

  imageRequests.set(imageId, request);
  return request;
}

// Rellena los <img data-image-id> que el render dejó vacíos.
function hydrateProductImages(root = document) {
  root.querySelectorAll("img[data-image-id]:not([src])").forEach((image) => {
    const imageId = image.dataset.imageId;
    loadProductImage(imageId).then((url) => {
      if (url && image.isConnected) image.src = url;
      else if (!url) image.closest(".product-photo, .photo-preview")?.classList.add("is-missing");
    });
  });
}

function forgetProductImage(imageId) {
  const url = imageObjectUrls.get(imageId);
  if (url) URL.revokeObjectURL(url);
  imageObjectUrls.delete(imageId);
}

function photoPlaceholder() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.6" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" /></svg>`;
}

function productPhotoCell(product) {
  if (!product.imageId) {
    return `<span class="product-photo" aria-hidden="true">${photoPlaceholder()}</span>`;
  }
  return `<button class="product-photo is-clickable" type="button" data-photo-open="${escapeHtml(product.imageId)}" data-photo-name="${escapeHtml(product.name)}" aria-label="Ver foto de ${escapeHtml(product.name)}"><img data-image-id="${escapeHtml(product.imageId)}" alt="" /></button>`;
}

// Reduce la foto antes de subirla. Un teléfono moderno produce archivos de
// 4 MB; aquí salen entre 60 y 200 KB, que es lo que admite el almacén.
async function downscaleImage(file) {
  const source = await loadBitmap(file);
  const width = source.width;
  const height = source.height;
  const scale = Math.min(1, maxImageSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (typeof source.close === "function") source.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).catch(() => loadImageElement(file));
  }
  return loadImageElement(file);
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    image.src = url;
  });
}

async function uploadProductPhoto(file, ownerId = "") {
  if (!file) return "";
  if (!/^image\//i.test(file.type)) {
    throw new Error("Ese archivo no es una imagen");
  }
  if (typeof backendRequest !== "function") {
    throw new Error("Sin conexion con el servidor");
  }
  const dataUrl = await downscaleImage(file);
  const response = await backendRequest("/media", {
    method: "POST",
    body: JSON.stringify({
      dataUrl,
      branchId: state.currentBranchId || "",
      ownerId
    })
  });
  return response?.image?.id || "";
}

// Campo de foto para el formulario de producto. El identificador viaja en un
// input oculto para que FormData lo recoja como un campo más.
function photoField(imageId = "") {
  return `
    <div class="photo-field" data-photo-field>
      <span class="photo-field-label">Foto del producto</span>
      <div class="photo-drop" data-photo-drop>
        <span class="photo-preview">${
          imageId ? `<img data-image-id="${escapeHtml(imageId)}" alt="" />` : photoPlaceholder()
        }</span>
        <div class="photo-actions">
          <div class="inline-actions">
            <button class="row-action" type="button" data-photo-pick>Subir foto</button>
            <button class="row-action is-muted" type="button" data-photo-clear${imageId ? "" : " hidden"}>Quitar</button>
          </div>
          <span class="photo-hint" data-photo-hint>JPG, PNG o WebP. Se reduce sola antes de subir.</span>
        </div>
      </div>
      <input type="file" accept="image/jpeg,image/png,image/webp" data-photo-input hidden />
      <input type="hidden" name="imageId" value="${escapeHtml(imageId)}" />
    </div>
  `;
}

/* Visor de foto a tamaño grande */

const photoViewer = {
  root: document.querySelector("#photoViewer"),
  image: document.querySelector("#photoViewerImage"),
  caption: document.querySelector("#photoViewerCaption"),
  close: document.querySelector("#photoViewerClose")
};

let photoViewerReturnFocus = null;

function openPhotoViewer(imageId, name) {
  if (!photoViewer.root) return;
  photoViewer.caption.textContent = name || "Foto del producto";
  photoViewer.image.removeAttribute("src");
  photoViewer.image.alt = name ? `Foto de ${name}` : "Foto del producto";
  photoViewer.root.classList.add("is-open");
  photoViewer.root.setAttribute("aria-hidden", "false");
  // Sin esto el foco se queda en la miniatura que la foto acaba de tapar, y
  // el tabulador recorre la pagina de detras. Ademas se vuelve inerte el fondo.
  photoViewerReturnFocus = document.activeElement;
  document.querySelectorAll(".topbar, .app-shell").forEach((region) => (region.inert = true));
  photoViewer.close?.focus();
  loadProductImage(imageId).then((url) => {
    if (url) photoViewer.image.src = url;
  });
}

function closePhotoViewer() {
  if (!photoViewer.root?.classList.contains("is-open")) return;
  photoViewer.root.classList.remove("is-open");
  photoViewer.root.setAttribute("aria-hidden", "true");
  document.querySelectorAll(".topbar, .app-shell").forEach((region) => (region.inert = false));
  if (photoViewerReturnFocus instanceof HTMLElement) photoViewerReturnFocus.focus();
  photoViewerReturnFocus = null;
}

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
    user: addUser,
    staff: addStaff,
    benefit: addBenefit,
    vacation: addVacation,
    payable: addPayable,
    rosterPerson: saveRosterPerson,
    rosterAssignment: addRosterAssignment
  };

  handlers[form.dataset.form]?.(data);
}

function addClient(data) {
  state.clients.unshift({
    id: nextId("CL", state.clients),
    name: data.name.trim(),
    phone: data.phone.trim(),
    email: data.email.trim(),
    birthday: (data.birthday || "").trim(),
    points: Number(data.points || 0),
    creditBalance: Number(data.creditBalance || 0),
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
    supplier: data.supplier.trim(),
    imageId: String(data.imageId || "").trim(),
    locationId: String(data.locationId || "").trim(),
    spot: String(data.spot || "").trim()
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
    stationId: data.stationId || "",
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
  const title = (data.title || "").trim() || `${procedure?.name || "Plan"} - ${client?.name || "Cliente"}`;
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
    notes: (data.notes || "").trim()
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
    collaborator: (data.collaborator || "").trim(),
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
  const role = rolePresets[data.role] ? data.role : "recepcion";
  // Super y admin ven todas las sedes; para el resto se respeta la sucursal
  // elegida (o "all" si se dejo asi).
  const chosenScope = typeof data.branchScope === "string" ? data.branchScope.trim() : "all";
  const branchScope =
    role === "super" || role === "admin"
      ? "all"
      : branchScopeValues.includes(chosenScope)
        ? chosenScope
        : "all";
  // Acceso a planilla solo lo puede otorgar un super (el servidor tambien lo
  // exige). Un admin creando una cuenta no puede darlo.
  const payrollAccess = currentUser()?.role === "super" ? data.payrollAccess === "true" : false;
  state.users.push({
    id: nextId("USR", state.users),
    name: data.name.trim(),
    email: data.email.trim(),
    role,
    function: data.function.trim(),
    branchScope,
    payrollAccess,
    active: true,
    // Sin contrasena: la cuenta nueva no puede entrar hasta que su dueña la
    // cree con "¿Olvidaste tu contraseña?" en el login. Asi ninguna cuenta
    // arranca con una contrasena por defecto compartida.
    passwordHash: "",
    permissions: clone(rolePresets[role].permissions)
  });
  persistAndRender("Usuario creado. Pidele que entre con su correo y \"¿Olvidaste tu contraseña?\" para crear su clave.");
}

function persistAndRender(message) {
  saveState();
  closeDrawer();
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
    openDrawer();
    return;
  }

  if (button.dataset.sideAction === "manageLocations") {
    if (!requireWrite("inventario")) return;
    openLocationsDrawer();
    return;
  }

  if (button.dataset.sideAction === "importClients") {
    if (!requireWrite("clientes")) return;
    window.openClientImport?.();
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
  const freeStationButton = event.target.closest("[data-free-station]");
  const removeStationButton = event.target.closest("[data-remove-station]");
  const dashboardPeriodButton = event.target.closest("[data-dashboard-period]");

  if (dashboardPeriodButton) {
    dashboardPeriod = dashboardPeriodButton.dataset.dashboardPeriod;
    renderView();
    return;
  }

  if (event.target.closest("[data-dashboard-export]")) {
    exportDashboardReport();
    return;
  }

  const proveedoresFilterBtn = event.target.closest("[data-proveedores-filter]");
  if (proveedoresFilterBtn) {
    proveedoresFilter = proveedoresFilterBtn.dataset.proveedoresFilter;
    renderView();
    return;
  }
  if (event.target.closest("[data-proveedores-export]")) {
    exportPayables();
    return;
  }
  const payablePayBtn = event.target.closest("[data-payable-pay]");
  if (payablePayBtn) {
    if (!requireWrite("proveedores")) return;
    const id = payablePayBtn.dataset.payablePay;
    const method = document.querySelector(`[data-payable-method="${id}"]`)?.value || "";
    markPayablePaid(id, method);
    return;
  }
  const payableUnpayBtn = event.target.closest("[data-payable-unpay]");
  if (payableUnpayBtn) {
    if (!requireWrite("proveedores")) return;
    markPayablePending(payableUnpayBtn.dataset.payableUnpay);
    return;
  }
  const payableDelBtn = event.target.closest("[data-payable-del]");
  if (payableDelBtn) {
    if (!requireWrite("proveedores")) return;
    removePayable(payableDelBtn.dataset.payableDel);
    return;
  }

  const payrollDelButton = event.target.closest("[data-payroll-del]");
  if (payrollDelButton) {
    if (!requireWrite("planilla")) return;
    const [kind, id] = payrollDelButton.dataset.payrollDel.split(":");
    removePayrollRecord(kind, id);
    return;
  }

  const staffEditBtn = event.target.closest("[data-staff-edit]");
  if (staffEditBtn) {
    if (!requireWrite("planilla")) return;
    startEditStaff(staffEditBtn.dataset.staffEdit);
    return;
  }
  const staffToggleBtn = event.target.closest("[data-staff-toggle]");
  if (staffToggleBtn) {
    if (!requireWrite("planilla")) return;
    toggleStaffActive(staffToggleBtn.dataset.staffToggle);
    return;
  }
  const staffDelBtn = event.target.closest("[data-staff-del]");
  if (staffDelBtn) {
    if (!requireWrite("planilla")) return;
    removeStaff(staffDelBtn.dataset.staffDel);
    return;
  }
  if (event.target.closest("[data-staff-cancel]")) {
    event.preventDefault();
    editingStaffId = "";
    renderView();
    return;
  }

  const rosterEditBtn = event.target.closest("[data-roster-edit]");
  if (rosterEditBtn) {
    if (!requireWrite("personal")) return;
    startEditRoster(rosterEditBtn.dataset.rosterEdit);
    return;
  }
  const rosterToggleBtn = event.target.closest("[data-roster-toggle]");
  if (rosterToggleBtn) {
    toggleRosterActive(rosterToggleBtn.dataset.rosterToggle);
    return;
  }
  const rosterDelBtn = event.target.closest("[data-roster-del]");
  if (rosterDelBtn) {
    removeRosterPerson(rosterDelBtn.dataset.rosterDel);
    return;
  }
  if (event.target.closest("[data-roster-cancel]")) {
    event.preventDefault();
    editingRosterId = "";
    renderView();
    return;
  }
  const moveDelBtn = event.target.closest("[data-move-del]");
  if (moveDelBtn) {
    const [personId, moveId] = moveDelBtn.dataset.moveDel.split(":");
    removeRosterAssignment(personId, moveId);
    return;
  }

  const payStatusBtn = event.target.closest("[data-pay-status]");
  if (payStatusBtn) {
    if (!requireWrite("planilla")) return;
    const [empId, status] = payStatusBtn.dataset.payStatus.split(":");
    const person = staffList().find((item) => item.id === empId);
    if (person) setPayrollStatus(person.name, payrollPeriod || currentQuincena(), status);
    return;
  }
  if (event.target.closest("[data-payroll-export]")) {
    event.preventDefault();
    exportPayroll(payrollPeriod || currentQuincena());
    return;
  }

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
    completeAppointment,
    freeStationButton,
    removeStationButton
  ].some(Boolean);

  if (needsWrite && !requireWrite(currentModule)) return;

  if (freeStationButton) {
    freeStationOccupant(freeStationButton.dataset.freeStation);
    return;
  }

  if (removeStationButton) {
    removeStation(removeStationButton.dataset.removeStation);
    return;
  }

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

  elements.dropdownLayer.setAttribute("role", "menu");
  elements.dropdownLayer.innerHTML = options
    .map((item) => {
      const moduleAttr = item.module ? ` data-menu-module="${item.module}"` : "";
      const userAttr = item.switchUser ? ` data-menu-switch="${item.switchUser}"` : "";
      const branchAttr = item.branch ? ` data-menu-branch="${item.branch}"` : "";
      const logoutAttr = item.logout ? ` data-menu-logout="true"` : "";
      return `<button type="button" role="menuitem"${moduleAttr}${userAttr}${branchAttr}${logoutAttr} data-menu-label="${escapeHtml(item.label)}">${escapeHtml(item.label)}<span>&gt;</span></button>`;
    })
    .join("");
  elements.dropdownLayer.style.left = `${Math.min(rect.left, window.innerWidth - 244)}px`;
  elements.dropdownLayer.classList.add("is-open");
  markDropdownExpanded(button);
  // El menu se dibuja fuera del boton, asi que el tabulador no llegaria solo.
  elements.dropdownLayer.querySelector("button")?.focus();
}

// Sin `aria-expanded` el lector de pantalla nunca dice si el menu esta
// abierto: las opciones simplemente aparecen.
function markDropdownExpanded(openButton) {
  document.querySelectorAll("[data-menu]").forEach((button) => {
    button.setAttribute("aria-expanded", button === openButton ? "true" : "false");
  });
}

function dropdownOptions(menuName) {
  if (menuName === "usuario") {
    const activeUser = currentUser();
    const switchers =
      activeUser.role === "super"
        ? state.users
            // Solo cuentas con correo: cambiar a otra persona hace un login real
            // con su contrasena, y sin correo no hay con que iniciar sesion.
            .filter((user) => user.active && user.id !== state.currentUserId && String(user.email || "").trim())
            .map((user) => ({ label: `Cambiar a ${user.name}`, switchUser: user.id }))
        : [];
    return [{ label: `${activeUser.name} - ${roleLabel(activeUser.role)}` }, ...switchers];
  }

  if (menuName === "sucursal") {
    // Una cuenta atada a una sede solo ve su sucursal en el menu: no puede
    // siquiera intentar cambiar a la otra.
    return allowedBranchOptions().map((branch) => ({
      label: branch.label,
      branch: branch.id
    }));
  }

  return menuItems[menuName] || [];
}

function closeDropdown() {
  markDropdownExpanded(null);
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

// Al cambiar la categoria en la ficha de Personal, se marcan por defecto los
// servicios de esa categoria (el usuario luego afina). Sin esto, una persona
// nueva quedaria sin servicios marcados hasta hacerlo a mano.
document.addEventListener("change", (event) => {
  const categorySelect = event.target.closest('form[data-form="rosterPerson"] select[name="category"]');
  if (!categorySelect) return;
  const category = categorySelect.value;
  document.querySelectorAll("input[data-roster-service]").forEach((box) => {
    const procedure = (state.procedures || []).find((item) => item.id === box.value);
    const procedureCat = procedureCategory(procedure);
    box.checked = !procedureCat || procedureCat === category;
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDropdown();
    closeStockReasonModal();
  }
});

/* =====================================================================
   Interacción de inventario, panel lateral y fotos
   ===================================================================== */

// Panel lateral para colocar un producto ya existente en su sitio.
function openPlaceDrawer(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product || !drawerElements.body) return;

  drawerElements.title.textContent = `Ubicar ${product.name}`;
  drawerElements.body.innerHTML = `
    <div class="drawer-inline" data-place-form data-product-id="${escapeHtml(product.id)}">
      <div class="form-grid">
        ${selectField("Ubicacion", "locationId", locationOptions(product.locationId || ""), product.locationId || "")}
        ${inputField("Detalle del lugar", "spot", "text", product.spot || "", "placeholder='Estante B, nivel 2'")}
      </div>
      <p class="photo-hint">Stock actual: ${escapeHtml(product.stock)} ${escapeHtml(product.unit)}</p>
    </div>
  `;
  drawerElements.submit.hidden = false;
  drawerReturnFocus = document.activeElement;
  document.body.classList.add("drawer-open");
  // setDrawerInert activa el panel y vuelve inerte el fondo. Sin esto el drawer
  // quedaba con inert=true de su estado cerrado y no se podia ni enfocar ni
  // tocar ningun campo.
  setDrawerInert(true);
  window.setTimeout(() => drawerElements.body.querySelector("select")?.focus(), 220);
}

function savePlaceDrawer() {
  const panel = drawerElements.body?.querySelector("[data-place-form]");
  if (!panel) return false;
  const product = state.products.find((item) => item.id === panel.dataset.productId);
  if (!product) return false;

  product.locationId = panel.querySelector('[name="locationId"]')?.value || "";
  product.spot = (panel.querySelector('[name="spot"]')?.value || "").trim();
  persistAndRender(product.locationId ? `Ubicado en ${locationName(product.locationId)}` : "Ubicacion retirada");
  return true;
}

// Panel lateral para administrar la lista de ubicaciones de la sucursal.
function openLocationsDrawer() {
  if (!drawerElements.body) return;
  ensureLocations();

  drawerElements.title.textContent = "Ubicaciones de la sucursal";
  drawerElements.body.innerHTML = `
    <div class="drawer-inline" data-locations-form>
      <div class="location-editor">
        ${
          locationList().length
            ? locationList()
                .map(
                  (location) => `
                    <div class="location-row" data-location-id="${escapeHtml(location.id)}">
                      <input type="text" value="${escapeHtml(location.name)}" data-location-name aria-label="Nombre de la ubicacion" />
                      <span class="location-count">${escapeHtml(productsAtLocation(location.id).length)}</span>
                      <button class="row-action is-warning" type="button" data-location-remove="${escapeHtml(location.id)}" aria-label="Eliminar ${escapeHtml(location.name)}">Quitar</button>
                    </div>
                  `
                )
                .join("")
            : `<div class="empty-state">Todavia no hay ubicaciones.</div>`
        }
      </div>
      <label class="field">
        <span>Agregar ubicacion</span>
        <input type="text" data-location-new placeholder="Bodega, Sala 3, Vitrina..." />
      </label>
      <p class="photo-hint">Al quitar una ubicacion, los productos que estaban ahi quedan sin ubicacion asignada.</p>
    </div>
  `;
  drawerElements.submit.hidden = false;
  drawerReturnFocus = document.activeElement;
  document.body.classList.add("drawer-open");
  // Igual que openPlaceDrawer: sin setDrawerInert el panel quedaba inerte y no
  // se podia editar ni agregar ubicaciones.
  setDrawerInert(true);
  window.setTimeout(() => drawerElements.body.querySelector("input, select, textarea")?.focus(), 220);
}

function saveLocationsDrawer() {
  const panel = drawerElements.body?.querySelector("[data-locations-form]");
  if (!panel) return false;

  panel.querySelectorAll(".location-row").forEach((row) => {
    const location = locationById(row.dataset.locationId);
    const name = (row.querySelector("[data-location-name]")?.value || "").trim();
    if (location && name) location.name = name;
  });

  const fresh = (panel.querySelector("[data-location-new]")?.value || "").trim();
  if (fresh) {
    state.locations = locationList().concat({ id: nextId("UBI", locationList()), name: fresh });
  }

  persistAndRender("Ubicaciones actualizadas");
  return true;
}

function removeLocation(locationId) {
  if (locationList().length <= 1) {
    showToast("Debe quedar al menos una ubicacion");
    return;
  }
  state.locations = locationList().filter((location) => location.id !== locationId);
  state.products.forEach((product) => {
    if (product.locationId === locationId) product.locationId = "";
  });
  saveState();
  renderAll();
  openLocationsDrawer();
  showToast("Ubicacion eliminada");
}

// Sube la foto elegida y refleja el resultado en el propio campo.
async function handlePhotoSelection(input) {
  const field = input.closest("[data-photo-field]");
  const file = input.files?.[0];
  input.value = "";
  await uploadPhotoIntoField(field, file);
}

// El recuadro punteado invitaba a soltar una foto ahi, pero no habia ni un
// manejador de arrastre: el navegador abria la imagen en la pestana y se
// perdia el formulario a medio llenar.
function bindPhotoDropZones() {
  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  document.addEventListener("dragover", (event) => {
    const zone = event.target.closest?.("[data-photo-drop]");
    if (!zone) return;
    stop(event);
    event.dataTransfer.dropEffect = "copy";
    zone.classList.add("is-over");
  });

  document.addEventListener("dragleave", (event) => {
    const zone = event.target.closest?.("[data-photo-drop]");
    if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove("is-over");
  });

  // Fuera de la zona tambien hay que interceptarlo: si no, soltar la foto
  // un centimetro al lado navega a la imagen y se pierde lo escrito.
  document.addEventListener("dragover", (event) => {
    if (!event.target.closest?.("[data-photo-drop]")) event.preventDefault();
  });

  document.addEventListener("drop", (event) => {
    const zone = event.target.closest?.("[data-photo-drop]");
    if (!zone) {
      event.preventDefault();
      return;
    }
    stop(event);
    zone.classList.remove("is-over");
    uploadPhotoIntoField(zone.closest("[data-photo-field]"), event.dataTransfer?.files?.[0]);
  });
}

async function uploadPhotoIntoField(field, file) {
  if (!field || !file) return;

  const hint = field.querySelector("[data-photo-hint]");
  const preview = field.querySelector(".photo-preview");
  const hidden = field.querySelector('input[name="imageId"]');
  const clear = field.querySelector("[data-photo-clear]");

  hint.classList.remove("is-error");
  hint.textContent = "Subiendo foto...";

  try {
    const imageId = await uploadProductPhoto(file, hidden?.value || "");
    if (!imageId) throw new Error("El servidor no devolvio la imagen");
    hidden.value = imageId;
    preview.innerHTML = `<img data-image-id="${escapeHtml(imageId)}" alt="" />`;
    hydrateProductImages(field);
    clear?.removeAttribute("hidden");
    hint.textContent = "Foto lista.";
  } catch (error) {
    hint.classList.add("is-error");
    hint.textContent = error.message || "No se pudo subir la foto";
  }
}

function clearPhotoField(field) {
  const hidden = field.querySelector('input[name="imageId"]');
  const preview = field.querySelector(".photo-preview");
  const hint = field.querySelector("[data-photo-hint]");
  if (hidden?.value) forgetProductImage(hidden.value);
  if (hidden) hidden.value = "";
  if (preview) preview.innerHTML = photoPlaceholder();
  field.querySelector("[data-photo-clear]")?.setAttribute("hidden", "");
  if (hint) {
    hint.classList.remove("is-error");
    hint.textContent = "JPG, PNG o WebP. Se reduce sola antes de subir.";
  }
}

document.addEventListener("click", (event) => {
  const filterChip = event.target.closest("[data-inventory-filter]");
  if (filterChip) {
    inventoryFilter = filterChip.dataset.inventoryFilter;
    renderView();
    return;
  }

  if (event.target.closest("[data-product-place]")) {
    if (!requireWrite("inventario")) return;
    openPlaceDrawer(event.target.closest("[data-product-place]").dataset.productPlace);
    return;
  }

  const photoOpen = event.target.closest("[data-photo-open]");
  if (photoOpen) {
    openPhotoViewer(photoOpen.dataset.photoOpen, photoOpen.dataset.photoName);
    return;
  }

  if (event.target.closest("[data-photo-pick]")) {
    event.target.closest("[data-photo-field]")?.querySelector("[data-photo-input]")?.click();
    return;
  }

  const photoClear = event.target.closest("[data-photo-clear]");
  if (photoClear) {
    clearPhotoField(photoClear.closest("[data-photo-field]"));
    return;
  }

  const locationRemove = event.target.closest("[data-location-remove]");
  if (locationRemove) {
    removeLocation(locationRemove.dataset.locationRemove);
    return;
  }

  if (event.target === photoViewer.root || event.target.closest("#photoViewerClose")) {
    closePhotoViewer();
    return;
  }

  if (event.target === drawerElements.scrim || event.target.closest("#drawerClose") || event.target.closest("#drawerCancel")) {
    closeDrawer();
    return;
  }

  if (event.target.closest("#drawerSubmit")) {
    if (savePlaceDrawer() || saveLocationsDrawer()) return;
    submitDrawerForm();
  }
});

document.addEventListener("change", (event) => {
  const photoInput = event.target.closest("[data-photo-input]");
  if (photoInput) handlePhotoSelection(photoInput);

  const stationSelect = event.target.closest("[data-station-select]");
  if (stationSelect) {
    if (!requireWrite("enCurso")) return;
    setActiveStation(stationSelect.dataset.stationSelect, stationSelect.value);
  }

  const payableUpload = event.target.closest("[data-payable-upload]");
  if (payableUpload && payableUpload.files?.[0]) {
    if (!requireWrite("proveedores")) return;
    const [id, field] = payableUpload.dataset.payableUpload.split(":");
    attachPayableImage(id, field, payableUpload.files[0]);
    return;
  }

  const payPeriodSelect = event.target.closest("[data-payroll-period]");
  if (payPeriodSelect) {
    payrollPeriod = payPeriodSelect.value;
    renderView();
    return;
  }

  const payFieldInput = event.target.closest("[data-pay-field]");
  if (payFieldInput) {
    if (!requireWrite("planilla")) return;
    const person = staffList().find((item) => item.id === payFieldInput.dataset.payEmp);
    if (person) setPayrollField(person.name, payrollPeriod || currentQuincena(), payFieldInput.dataset.payField, payFieldInput.value);
    return;
  }
});

// Alta de estacion desde el tablero de En curso (su propio form, no un .data-form).
document.addEventListener("submit", (event) => {
  const addForm = event.target.closest("[data-add-station]");
  if (!addForm) return;
  event.preventDefault();
  if (!requireWrite("enCurso")) return;
  const data = Object.fromEntries(new FormData(addForm).entries());
  addStation(data.stationName, data.stationType);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (photoViewer.root?.classList.contains("is-open")) {
    closePhotoViewer();
    return;
  }
  closeDrawer();
});

bindPhotoDropZones();
restoreSession();
