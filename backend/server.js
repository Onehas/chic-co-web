"use strict";

const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { promises: fs } = require("fs");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "chic-co-db.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const maxBodyBytes = 10 * 1024 * 1024;
let pgPool = null;
let pgReady = false;

const superPermissionModules = ["clientes", "inventario", "procedimientos", "enCurso", "planes", "citas", "facturacion", "usuarios"];
const superUserPermissions = superPermissionModules.reduce((permissions, moduleName) => {
  permissions[moduleName] = { read: true, write: true };
  return permissions;
}, {});

const systemUserAuth = {
  "USR-000": {
    email: "gaboarcegazel@outlook.com",
    role: "super",
    function: "Super usuario",
    permissions: superUserPermissions,
    passwordHash: "8761fab13ae64eed33cad324c8bf7023caa5cf9ec63c858fd4e421e7650d51a5"
  },
  "USR-001": {
    email: "andresguevarag1@gmail.com",
    role: "super",
    function: "Super usuario",
    permissions: superUserPermissions,
    passwordHash: "6ab0130c6093517a1088727b42c89ce7a3cb31387bcc4e42b3ee9973374af324"
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

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function setBaseHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  setBaseHeaders(res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { ok: false, message });
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function applySystemUserAuth(state) {
  if (!state || !Array.isArray(state.users)) return state;
  return {
    ...state,
    users: state.users.map((user) => {
      const auth = systemUserAuth[user.id];
      return auth ? { ...user, ...auth } : user;
    })
  };
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBodyBytes) {
        reject(new Error("REQUEST_TOO_LARGE"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const rawBody = await readBody(req);
  if (!rawBody) return {};
  return JSON.parse(rawBody);
}

async function getPostgresPool() {
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({
      connectionString: databaseUrl,
      max: 3
    });
  }

  if (!pgReady) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id integer PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    pgReady = true;
  }

  return pgPool;
}

async function readJsonState() {
  try {
    const rawState = await fs.readFile(dbPath, "utf8");
    return applySystemUserAuth(JSON.parse(rawState));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonState(nextState) {
  await fs.mkdir(dataDir, { recursive: true });
  const tempPath = `${dbPath}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(applySystemUserAuth(nextState), null, 2), "utf8");
  await fs.rename(tempPath, dbPath);
}

async function readState() {
  if (!databaseUrl) return readJsonState();

  const pool = await getPostgresPool();
  const result = await pool.query("SELECT data FROM app_state WHERE id = $1", [1]);
  return applySystemUserAuth(result.rows[0]?.data || null);
}

async function writeState(nextState) {
  if (!databaseUrl) {
    await writeJsonState(nextState);
    return;
  }

  const pool = await getPostgresPool();
  const storedState = applySystemUserAuth(nextState);
  await pool.query(
    `INSERT INTO app_state (id, data, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [1, storedState]
  );
}

function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

async function handleLogin(req, res) {
  const payload = await readJsonBody(req);
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const state = await readState();

  if (!state) {
    sendError(res, 503, "La base de datos del backend aun no esta inicializada.");
    return;
  }

  const users = Array.isArray(state.users) ? state.users : [];
  const user = users.find((item) => String(item.email || "").trim().toLowerCase() === email);
  const passwordHash = hashPassword(password);

  if (!user || user.active === false || user.passwordHash !== passwordHash) {
    sendError(res, 401, "Email o contrasena incorrectos.");
    return;
  }

  state.currentUserId = user.id;
  await writeState(state);
  sendJson(res, 200, { ok: true, userId: user.id, user: publicUser(user) });
}

async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") {
    setBaseHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true, app: "Chic & Co Backend", storage: databaseUrl ? "postgres" : "json" });
    return;
  }

  if (pathname === "/api/state" && req.method === "GET") {
    const state = await readState();
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (pathname === "/api/state" && req.method === "PUT") {
    const payload = await readJsonBody(req);
    const nextState = payload.state || payload;

    if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
      sendError(res, 400, "Estado invalido.");
      return;
    }

    await writeState(nextState);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/login" && req.method === "POST") {
    await handleLogin(req, res);
    return;
  }

  sendError(res, 404, "Ruta de API no encontrada.");
}

function isPathInside(parentDir, targetPath) {
  const relativePath = path.relative(parentDir, targetPath);
  return relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

async function serveStatic(req, res, pathname) {
  const requestedPath = decodeURIComponent(pathname);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");

  if (relativePath === "backend" || relativePath.startsWith("backend/")) {
    sendError(res, 404, "Archivo no encontrado.");
    return;
  }

  let filePath = path.resolve(rootDir, relativePath);
  if (!isPathInside(rootDir, filePath)) {
    sendError(res, 403, "Ruta no permitida.");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[extension] || "application/octet-stream";
    const fileBuffer = await fs.readFile(filePath);
    let responseBuffer = fileBuffer;

    if (path.basename(filePath) === "index.html") {
      const html = fileBuffer.toString("utf8");
      if (!html.includes("agenda-upgrade.js")) {
        responseBuffer = Buffer.from(html.replace("</body>", '    <script src="agenda-upgrade.js"></script>\n  </body>'), "utf8");
      }
    }

    setBaseHeaders(res);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": responseBuffer.length
    });
    res.end(responseBuffer);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "Archivo no encontrado.");
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendError(res, 405, "Metodo no permitido.");
      return;
    }

    await serveStatic(req, res, url.pathname);
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") {
      sendError(res, 413, "La solicitud es demasiado grande.");
      return;
    }

    if (error instanceof SyntaxError) {
      sendError(res, 400, "JSON invalido.");
      return;
    }

    console.error(error);
    sendError(res, 500, "Error interno del backend.");
  }
});

server.listen(port, host, () => {
  console.log(`Chic & Co backend listo en http://${host}:${port}`);
});
