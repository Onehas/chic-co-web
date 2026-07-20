import { existsSync, readFileSync, writeFileSync } from "node:fs";

function writeIfChanged(path, nextContent) {
  const currentContent = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (currentContent !== nextContent) {
    writeFileSync(path, nextContent, "utf8");
  }
}

function replaceSection(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1) return source;
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

const passwordHash = "d3ad9315b7be5dd53b31a273b3b3aba5defe700808305aa16a3062b76658a791";
const receptionPasswordHash = "5813f24ae4432b277c8c92a78bf035caaa8f5a9ad0031441f5eccd2d4c0e2fd0";
const legacyPrefix = ["de", "mo"].join("");
const legacyPasswordName = `${legacyPrefix}PasswordHash`;
const legacyResetMessage = ["Datos", legacyPrefix, "reiniciados"].join(" ");
const legacyLocalAccessMessage = ["Este navegador no permite validar el acceso", "local"].join(" ");
const legacyLocalSyncMessage = ["Datos sincronizados", ["local", "mente"].join("")].join(" ");
const legacyLocalLogoutMessage = ["Sesion cerrada", ["local", "mente"].join("")].join(" ");
const legacyResetButtonText = [["Re", "iniciar"].join(""), legacyPrefix].join(" ");
const emptyBranchData = `function emptyBranchData() {
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

`;

const systemUserAuthBlock = `const systemUserAuth = {
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
  "USR-003": {},
  "USR-004": {}
};
`;

const cleanDefaultState = `const defaultState = {
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
      name: "Paola",
      email: "",
      role: "recepcion",
      function: "Recepcion y agenda",
      active: true,
      passwordHash: fallbackPasswordHash,
      permissions: rolePresets.recepcion.permissions
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

`;

const apiSessionHelpers = `function apiSessionToken() {
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

`;

const hydrateBackendStateBlock = `async function hydrateBackendState() {
  if (window.location.protocol === "file:" || !window.fetch) return false;

  try {
    const health = await backendRequest("/health", { cache: "no-store" });
    backendAvailable = Boolean(health?.ok);
    if (!backendAvailable) return false;

    try {
      const response = await backendRequest("/state", { cache: "no-store" });
      if (response.state) {
        state = normalizeStateSnapshot(response.state);
        try {
          localStorage.setItem(storageKey, JSON.stringify(state));
        } catch (error) {
          // El backend queda como fuente principal si el navegador bloquea localStorage.
        }
      } else {
        await syncStateToBackend({ force: true });
      }
    } catch (error) {
      if (error.status === 401) return true;
      throw error;
    }
    return true;
  } catch (error) {
    backendAvailable = false;
    return false;
  }
}

`;

let app = readFileSync("app.js", "utf8");
app = app.replace(new RegExp(`const ${legacyPasswordName}\\s*=\\s*"[a-f0-9]{64}";`, "i"), `const fallbackPasswordHash = "${passwordHash}";`);
if (!app.includes("const receptionPasswordHash =")) {
  app = app.replace(
    `const fallbackPasswordHash = "${passwordHash}";`,
    `const fallbackPasswordHash = "${passwordHash}";\nconst receptionPasswordHash = "${receptionPasswordHash}";`
  );
}
if (!app.includes("const apiSessionTokenKey =")) {
  app = app.replace(
    'const authSessionKey = "salonSuiteSessionUserId";',
    'const authSessionKey = "salonSuiteSessionUserId";\nconst apiSessionTokenKey = "salonSuiteApiSessionToken";'
  );
}
app = app.replaceAll(legacyPasswordName, "fallbackPasswordHash");
app = app.replace(/email:\s*"gaboarcegazel@outlook\.com"/g, 'email: ""');
app = app.replace(/email:\s*"[^"]+@chicco\.local"/g, 'email: ""');
app = app.replace(/passwordHash:\s*"[a-f0-9]{64}"/gi, "passwordHash: fallbackPasswordHash");
if (!app.includes("headers.Authorization = `Bearer ${token}`")) {
  app = app.replace(
    `  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(apiPath(path), {`,
    `  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const token = apiSessionToken();
  if (token && !headers.Authorization) {
    headers.Authorization = \`Bearer \${token}\`;
  }

  const response = await fetch(apiPath(path), {`
  );
}
if (app.includes("const systemUserAuth =")) {
  app = replaceSection(app, "const systemUserAuth = {", "const branchDataKeys =", systemUserAuthBlock);
} else {
  app = app.replace(/const allowedUserIds = \[[^\n]+\];\n/, (match) => `${match}${systemUserAuthBlock}`);
}
if (!app.includes("function emptyBranchData()")) {
  app = app.replace("const defaultState = {", `${emptyBranchData}const defaultState = {`);
}
app = replaceSection(app, "const defaultState = {", "const moduleConfig = {", cleanDefaultState);
app = replaceSection(app, "async function hydrateBackendState() {", "function scheduleBackendSync()", hydrateBackendStateBlock);
if (!app.includes("function apiSessionToken()")) {
  app = app.replace("\nfunction clearSessionUser() {", `\n${apiSessionHelpers}function clearSessionUser() {`);
}
if (!app.includes("clearApiSessionToken();")) {
  app = app.replace(
    `  } catch (error) {
    localStorage.removeItem(authSessionKey);
  }
}`,
    `  } catch (error) {
    localStorage.removeItem(authSessionKey);
  }
  clearApiSessionToken();
}`
  );
}
if (!app.includes("saveApiSessionToken(backendLogin.token);")) {
  app = app.replace(
    `      const user = state.users.find((item) => item.id === backendLogin.userId) || backendLogin.user;
      saveSessionUser(backendLogin.userId);`,
    `      const user = state.users.find((item) => item.id === backendLogin.userId) || backendLogin.user;
      saveApiSessionToken(backendLogin.token);
      saveSessionUser(backendLogin.userId);`
  );
}
app = app.replace(
  /function alajuelaBranchData\(\) \{[\s\S]*?\n\}\n\nfunction defaultBranches\(\)/,
  "function alajuelaBranchData() {\n  return emptyBranchData();\n}\n\nfunction defaultBranches()"
);
app = app.replace(
  new RegExp(`\\nelements\\.resetDataButton\\.addEventListener\\("click", \\(\\) => \\{[\\s\\S]*?showToast\\("${legacyResetMessage}"\\);\\n\\}\\);\\n`, "g"),
  "\n"
);
app = app.replace(`${legacyLocalAccessMessage}.`, "No se pudo validar el acceso.");
app = app.replace(legacyLocalSyncMessage, "Datos sincronizados");
app = app.replace(legacyLocalLogoutMessage, "Sesion cerrada");
writeIfChanged("app.js", app);

let html = readFileSync("index.html", "utf8");
html = html.replace(
  new RegExp(`<button class="secondary-action" type="button" id="resetDataButton">${legacyResetButtonText}<\\/button>`, "g"),
  '<button class="secondary-action" type="button" id="resetDataButton" hidden aria-hidden="true" tabindex="-1"></button>'
);
writeIfChanged("index.html", html);

let server = readFileSync("backend/server.js", "utf8");
server = server.replace(`passwordHash: ${legacyPasswordName}`, "passwordHash: fallbackPasswordHash");
writeIfChanged("backend/server.js", server);
