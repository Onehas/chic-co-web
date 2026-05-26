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
const maxBodyBytes = 2 * 1024 * 1024;
const sessionTtlMs = 8 * 60 * 60 * 1000;
const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 8;
let pgPool = null;
let pgReady = false;
const sessions = new Map();
const loginAttempts = new Map();

const superPermissionModules = ["clientes", "inventario", "procedimientos", "enCurso", "planes", "citas", "facturacion", "usuarios"];
const superUserPermissions = superPermissionModules.reduce((permissions, moduleName) => {
  permissions[moduleName] = { read: true, write: true };
  return permissions;
}, {});

const systemUserAuth = {
  "USR-000": {
    role: "super",
    function: "Super usuario",
    permissions: superUserPermissions
  },
  "USR-001": {
    role: "super",
    function: "Super usuario",
    permissions: superUserPermissions
  },
  "USR-002": {},
  "USR-003": {},
  "USR-004": {}
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

function requestProtocol(req) {
  return String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
}

function expectedOrigin(req) {
  return `${requestProtocol(req)}://${req.headers.host || "localhost"}`;
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === expectedOrigin(req);
}

function setSecurityHeaders(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  if (requestProtocol(req) === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function setBaseHeaders(req, res) {
  setSecurityHeaders(req, res);
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(req)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(req, res, statusCode, payload) {
  const body = JSON.stringify(payload);
  setBaseHeaders(req, res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(req, res, statusCode, message) {
  sendJson(req, res, statusCode, { ok: false, message });
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function loginAttemptKey(req, email) {
  return `${clientIp(req)}:${String(email || "").trim().toLowerCase()}`;
}

function isLoginRateLimited(req, email) {
  const key = loginAttemptKey(req, email);
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 0, resetAt: now + loginWindowMs });
    return false;
  }
  return entry.count >= maxLoginAttempts;
}

function recordFailedLogin(req, email) {
  const key = loginAttemptKey(req, email);
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + loginWindowMs });
    return;
  }
  entry.count += 1;
}

function clearFailedLogins(req, email) {
  loginAttempts.delete(loginAttemptKey(req, email));
}

function createSession(user, req) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + sessionTtlMs;
  sessions.set(token, {
    userId: user.id,
    ip: clientIp(req),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 180),
    expiresAt
  });
  return { token, expiresAt };
}

function sessionFromRequest(req) {
  const authorization = String(req.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return { token, ...session };
}

function stripSensitiveState(state) {
  if (!state || !Array.isArray(state.users)) return state;
  return {
    ...state,
    users: state.users.map(publicUser)
  };
}

function preserveProtectedState(nextState, currentState) {
  if (!nextState || !Array.isArray(nextState.users) || !currentState || !Array.isArray(currentState.users)) {
    return nextState;
  }

  const currentUsersById = new Map(currentState.users.map((user) => [user.id, user]));
  return {
    ...nextState,
    users: nextState.users.map((user) => {
      const currentUser = currentUsersById.get(user.id);
      if (!currentUser) return user;
      return {
        ...user,
        passwordHash: currentUser.passwordHash
      };
    })
  };
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
    sendError(req, res, 503, "La base de datos del backend aun no esta inicializada.");
    return;
  }

  const users = Array.isArray(state.users) ? state.users : [];
  const user = users.find((item) => String(item.email || "").trim().toLowerCase() === email);
  const passwordHash = hashPassword(password);

  if (!user || user.active === false || !timingSafeEqualText(user.passwordHash, passwordHash)) {
    recordFailedLogin(req, email);
    if (isLoginRateLimited(req, email)) {
      sendError(req, res, 429, "Demasiados intentos. Espere unos minutos e intente de nuevo.");
      return;
    }
    sendError(req, res, 401, "Email o contrasena incorrectos.");
    return;
  }

  clearFailedLogins(req, email);
  state.currentUserId = user.id;
  await writeState(state);
  const session = createSession(user, req);
  sendJson(req, res, 200, {
    ok: true,
    userId: user.id,
    user: publicUser(user),
    token: session.token,
    expiresAt: new Date(session.expiresAt).toISOString()
  });
}

async function handleApi(req, res, pathname) {
  if (!isAllowedOrigin(req)) {
    sendError(req, res, 403, "Origen no permitido.");
    return;
  }

  if (req.method === "OPTIONS") {
    setBaseHeaders(req, res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(req, res, 200, { ok: true, app: "Chic & Co Backend", storage: databaseUrl ? "postgres" : "json" });
    return;
  }

  if (pathname === "/api/login" && req.method === "POST") {
    await handleLogin(req, res);
    return;
  }

  const session = sessionFromRequest(req);
  if (!session) {
    sendError(req, res, 401, "Sesion requerida.");
    return;
  }

  if (pathname === "/api/state" && req.method === "GET") {
    const state = await readState();
    sendJson(req, res, 200, { ok: true, state: stripSensitiveState(state) });
    return;
  }

  if (pathname === "/api/state" && req.method === "PUT") {
    const payload = await readJsonBody(req);
    const nextState = payload.state || payload;

    if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
      sendError(req, res, 400, "Estado invalido.");
      return;
    }

    const currentState = await readState();
    await writeState(preserveProtectedState(nextState, currentState));
    sendJson(req, res, 200, { ok: true });
    return;
  }

  sendError(req, res, 404, "Ruta de API no encontrada.");
}

function isPathInside(parentDir, targetPath) {
  const relativePath = path.relative(parentDir, targetPath);
  return relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

async function serveStatic(req, res, pathname) {
  const requestedPath = decodeURIComponent(pathname);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");

  if (relativePath === "backend" || relativePath.startsWith("backend/") || relativePath === "backend-client.js") {
    sendError(req, res, 404, "Archivo no encontrado.");
    return;
  }

  let filePath = path.resolve(rootDir, relativePath);
  if (!isPathInside(rootDir, filePath)) {
    sendError(req, res, 403, "Ruta no permitida.");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[extension];
    if (!contentType) {
      sendError(req, res, 404, "Archivo no encontrado.");
      return;
    }

    const fileBuffer = await fs.readFile(filePath);
    let responseBuffer = fileBuffer;

    if (path.basename(filePath) === "app.js") {
      const js = fileBuffer.toString("utf8").replace(/passwordHash:\s*"[a-f0-9]{64}"/gi, "passwordHash: fallbackPasswordHash");
      responseBuffer = Buffer.from(js, "utf8");
    }

    if (path.basename(filePath) === "index.html") {
      let html = fileBuffer.toString("utf8");
      html = html.replace(/\s*<script src="backend-client\.js"><\/script>/, "");
      if (!html.includes("security-upgrade.js")) {
        html = html.replace('<script src="app.js"></script>', '<script src="app.js"></script>\n    <script src="security-upgrade.js"></script>');
      }
      if (!html.includes("agenda-upgrade.js")) {
        html = html.replace("</body>", '    <script src="agenda-upgrade.js"></script>\n  </body>');
      }
      responseBuffer = Buffer.from(html, "utf8");
    }

    setBaseHeaders(req, res);
    const headers = {
      "Content-Type": contentType,
      "Content-Length": responseBuffer.length
    };
    if ([".html", ".js", ".css"].includes(extension)) {
      headers["Cache-Control"] = "no-store";
    }
    res.writeHead(200, headers);
    res.end(responseBuffer);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(req, res, 404, "Archivo no encontrado.");
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
      sendError(req, res, 405, "Metodo no permitido.");
      return;
    }

    await serveStatic(req, res, url.pathname);
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") {
      sendError(req, res, 413, "La solicitud es demasiado grande.");
      return;
    }

    if (error instanceof SyntaxError) {
      sendError(req, res, 400, "JSON invalido.");
      return;
    }

    console.error(error);
    sendError(req, res, 500, "Error interno del backend.");
  }
});

server.listen(port, host, () => {
  console.log(`Chic & Co backend listo en http://${host}:${port}`);
});
