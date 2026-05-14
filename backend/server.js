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
const maxBodyBytes = 10 * 1024 * 1024;

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

async function readState() {
  try {
    const rawState = await fs.readFile(dbPath, "utf8");
    return JSON.parse(rawState);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeState(nextState) {
  await fs.mkdir(dataDir, { recursive: true });
  const tempPath = `${dbPath}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(nextState, null, 2), "utf8");
  await fs.rename(tempPath, dbPath);
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
    sendJson(res, 200, { ok: true, app: "Chic & Co Backend" });
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

    setBaseHeaders(res);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": fileBuffer.length
    });
    res.end(fileBuffer);
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
