import { readFileSync, writeFileSync, existsSync } from "node:fs";

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
      name: "Gabriela",
      email: "",
      role: "admin",
      function: "Administradora general",
      active: true,
      passwordHash: fallbackPasswordHash,
      permissions: rolePresets.admin.permissions
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

let app = readFileSync("app.js", "utf8");
app = app.replace(/const demoPasswordHash\s*=\s*"[a-f0-9]{64}";/i, `const fallbackPasswordHash = "${passwordHash}";`);
app = app.replaceAll("demoPasswordHash", "fallbackPasswordHash");
app = app.replace(/email:\s*"gaboarcegazel@outlook\.com"/g, 'email: ""');
app = app.replace(/email:\s*"[^"]+@chicco\.local"/g, 'email: ""');
app = app.replace(/passwordHash:\s*"[a-f0-9]{64}"/gi, "passwordHash: fallbackPasswordHash");
if (!app.includes("function emptyBranchData()")) {
  app = app.replace("const defaultState = {", `${emptyBranchData}const defaultState = {`);
}
app = replaceSection(app, "const defaultState = {", "const moduleConfig = {", cleanDefaultState);
app = app.replace(/function alajuelaBranchData\(\) \{[\s\S]*?\n\}\n\nfunction defaultBranches\(\)/, "function alajuelaBranchData() {\n  return emptyBranchData();\n}\n\nfunction defaultBranches()");
app = app.replace(/\nelements\.resetDataButton\.addEventListener\("click", \(\) => \{[\s\S]*?showToast\("Datos demo reiniciados"\);\n\}\);\n/g, "\n");
app = app.replace("Este navegador no permite validar el acceso local.", "No se pudo validar el acceso.");
app = app.replace("Datos sincronizados localmente", "Datos sincronizados");
app = app.replace("Sesion cerrada localmente", "Sesion cerrada");
writeIfChanged("app.js", app);

let html = readFileSync("index.html", "utf8");
html = html.replace(/<button class="secondary-action" type="button" id="resetDataButton">Reiniciar demo<\/button>/g, '<button class="secondary-action" type="button" id="resetDataButton" hidden aria-hidden="true" tabindex="-1"></button>');
writeIfChanged("index.html", html);

let server = readFileSync("backend/server.js", "utf8");
server = server.replace("passwordHash: demoPasswordHash", "passwordHash: fallbackPasswordHash");
writeIfChanged("backend/server.js", server);
