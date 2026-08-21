"use strict";

const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { promises: fs } = require("fs");
const mediaStore = require("./media-store");
const bookingStore = require("./booking-store");
const publicBooking = require("./public-booking");
const mailer = require("./mailer");
const dailyReport = require("./daily-report");
const alegra = require("./alegra");
const alegraConfigStore = require("./alegra-config-store");
const settingsStore = require("./settings-store");
const passwordResetStore = require("./password-reset-store");
const collectionStore = require("./collection-store");

// Pixeles de marketing para la pagina publica de reservas. Los ids NO son
// secretos (viajan al navegador de cualquier visitante), pero se guardan en el
// servidor para que un admin los configure desde la app sin redeployar.
const trackingConfig = { metaPixelId: "", ga4Id: "", tiktokPixelId: "" };

function sanitizeTrackingConfig(input = {}) {
  // Solo se aceptan ids con la forma esperada; asi un valor pegado con espacios
  // o comillas no rompe el script del pixel en la pagina publica.
  const clean = (value, pattern) => {
    const trimmed = String(value || "").trim();
    return pattern.test(trimmed) ? trimmed : "";
  };
  return {
    metaPixelId: clean(input.metaPixelId, /^[0-9]{6,20}$/),
    ga4Id: clean(input.ga4Id, /^G-[A-Z0-9]{4,15}$/),
    tiktokPixelId: clean(input.tiktokPixelId, /^[A-Z0-9]{10,30}$/i)
  };
}

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "chic-co-db.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
// El estado completo viaja en cada guardado. 2 MB se quedaba corto al pensar en
// anios de historial (los ~1800 clientes reales pesan ~0,5 MB, pero las citas y
// facturas se acumulan). 8 MB da holgura de sobra; Postgres jsonb lo aguanta.
const maxBodyBytes = 8 * 1024 * 1024;
const sessionTtlMs = 8 * 60 * 60 * 1000;
const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 8;
const maxAccountLoginAttempts = 20;
let pgPool = null;
let pgReady = false;
const sessions = new Map();
const loginAttempts = new Map();
const realtimeClients = new Map();
let realtimeRevision = 0;

// Las contrasenas reales vienen de variables de entorno del proveedor. Ya no se
// hornea ningun hash por defecto: los que habia eran sha256 sin sal y estaban
// publicados en el historial del repositorio, asi que cualquiera con acceso de
// lectura podia romperlos offline. Sin la variable, la cuenta arranca sin hash y
// no puede entrar hasta que un super usuario le fije la contrasena desde la app.
const receptionPasswordHash = process.env.CHIC_RECEPCION_PASSWORD_HASH || "";
const monicaPasswordHash = process.env.CHIC_MONICA_PASSWORD_HASH || "";
const bootstrapEmail = String(process.env.CHIC_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
const bootstrapPassword = String(process.env.CHIC_BOOTSTRAP_PASSWORD || "");

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
  // USR-001 ya NO se fija como super. Antes quedaba como un segundo super
  // permanente e imposible de degradar desde la app; si alguien le ponia correo
  // y contrasena, tenia acceso total. Se deja fuera de las cuentas de sistema
  // para que sea una cuenta normal, editable como cualquier otra.
  "USR-002": {
    name: "Recepcion",
    email: "recepcion@chicnco.cr",
    role: "recepcion",
    function: "Recepcion y agenda",
    passwordHash: receptionPasswordHash,
    permissions: {
      clientes: { read: true, write: true },
      inventario: { read: false, write: false },
      procedimientos: { read: false, write: false },
      enCurso: { read: true, write: false },
      planes: { read: true, write: false },
      citas: { read: true, write: true },
      facturacion: { read: true, write: true },
      usuarios: { read: false, write: false }
    }
  },
  "USR-003": {
    name: "Monica",
    email: "mgazel@mgjobs.net",
    role: "recepcion",
    function: "Recepcion y agenda",
    passwordHash: monicaPasswordHash,
    permissions: {
      clientes: { read: true, write: true },
      inventario: { read: false, write: false },
      procedimientos: { read: false, write: false },
      enCurso: { read: true, write: false },
      planes: { read: true, write: false },
      citas: { read: true, write: true },
      facturacion: { read: true, write: true },
      usuarios: { read: false, write: false }
    }
  },
  "USR-004": {}
};

const moduleWriteCollections = {
  clientes: ["clients"],
  inventario: ["products", "stockMovements", "locations"],
  procedimientos: ["procedures"],
  enCurso: ["activeProcedures", "products", "stockMovements", "stations"],
  planes: ["plans", "activeProcedures", "appointments"],
  citas: ["appointments", "activeProcedures"],
  facturacion: ["invoices", "products", "stockMovements"],
  proveedores: ["payables"],
  personal: ["specialists"],
  usuarios: ["users"]
};
const branchDataCollections = ["clients", "products", "procedures", "activeProcedures", "plans", "appointments", "invoices", "stockMovements", "locations", "stations", "payables", "specialists"];
const auditLogLimit = 300;

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

// Hosts de los pixeles de marketing. Solo se permiten en la pagina publica de
// reservas; el back-office mantiene la politica estricta 'self'.
const pixelScriptHosts = "https://connect.facebook.net https://www.googletagmanager.com https://analytics.tiktok.com";
const pixelConnectHosts =
  "https://www.facebook.com https://www.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://*.google-analytics.com https://analytics.tiktok.com https://*.tiktok.com";
const pixelImgHosts = "https://www.facebook.com https://www.google-analytics.com https://*.google-analytics.com https://analytics.tiktok.com";

// La pagina publica usa Google Fonts (Fraunces + Inter). La hoja de estilos
// viene de fonts.googleapis.com y los archivos .woff2 de fonts.gstatic.com; sin
// abrir esos hosts el navegador bloquea la tipografia y todo cae a las fuentes
// del sistema. Solo se permiten aqui: el back-office sigue con 'self' estricto.
const fontStyleHost = "https://fonts.googleapis.com";
const fontFileHost = "https://fonts.gstatic.com";

function contentSecurityPolicy(pathname) {
  if (pathname === "/reservar.html" || pathname === "/reservar") {
    return [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' ${pixelScriptHosts}`,
      `style-src 'self' 'unsafe-inline' ${fontStyleHost}`,
      `font-src 'self' ${fontFileHost}`,
      `img-src 'self' data: blob: ${pixelImgHosts}`,
      `connect-src 'self' ${pixelConnectHosts}`,
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join("; ");
  }
  // blob: es necesario para mostrar fotos (producto, factura, comprobante): se
  // descargan autenticadas y se pintan desde un URL de objeto en memoria.
  return "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
}

function requestPathname(req) {
  try {
    return new URL(req.url, "http://localhost").pathname;
  } catch (error) {
    return String(req.url || "");
  }
}

function setSecurityHeaders(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  // camera=(self): el inventario escanea codigos de barras con la camara del
  // propio dominio. El resto (microfono, ubicacion, pago) sigue deshabilitado.
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
  res.setHeader("Content-Security-Policy", contentSecurityPolicy(requestPathname(req)));
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

const scryptOptions = { N: 16384, r: 8, p: 1 };
const scryptKeyLength = 64;

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function isModernHash(storedHash) {
  return String(storedHash || "").startsWith("scrypt$");
}

function hashPasswordModern(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(String(password), salt, scryptKeyLength, scryptOptions).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

// scrypt es deliberadamente costoso. Hecho de forma sincrona bloquea el unico
// hilo de Node durante toda la derivacion, asi que unos pocos intentos de login
// simultaneos dejan la aplicacion entera -incluidas las rutas fiscales- sin
// responder. En las rutas HTTP siempre se usa la variante asincrona.
function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, scryptKeyLength, scryptOptions, (error, derived) => {
      if (error) reject(error);
      else resolve(derived.toString("hex"));
    });
  });
}

async function hashPasswordModernAsync(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `scrypt$${salt}$${await scryptAsync(password, salt)}`;
}

function verifyPassword(password, storedHash) {
  const stored = String(storedHash || "");
  if (!stored) return false;

  if (isModernHash(stored)) {
    const [, salt, digest] = stored.split("$");
    if (!salt || !digest) return false;
    let derived;
    try {
      derived = crypto.scryptSync(String(password), salt, scryptKeyLength, scryptOptions).toString("hex");
    } catch (error) {
      return false;
    }
    return timingSafeEqualText(derived, digest);
  }

  return timingSafeEqualText(stored, hashPassword(password));
}

async function verifyPasswordAsync(password, storedHash) {
  const stored = String(storedHash || "");
  if (!stored) return false;

  if (isModernHash(stored)) {
    const [, salt, digest] = stored.split("$");
    if (!salt || !digest) return false;
    let derived;
    try {
      derived = await scryptAsync(password, salt);
    } catch (error) {
      return false;
    }
    return timingSafeEqualText(derived, digest);
  }

  return timingSafeEqualText(stored, hashPassword(password));
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

// `X-Forwarded-For` lo escribe el cliente y el proxy solo le anade su valor al
// final, asi que el primer elemento es dato del atacante: tomarlo permitia
// rotar la IP en cada intento y saltarse el limite de intentos por completo.
// Solo se confia en los ultimos `trustedProxyHops` saltos, que son los proxys
// propios. Con 0 (por defecto) se usa la conexion real.
const trustedProxyHops = Math.max(0, Number(process.env.TRUST_PROXY_HOPS || 0) || 0);

function clientIp(req) {
  const socketIp = String(req.socket?.remoteAddress || "unknown");
  if (!trustedProxyHops) return socketIp;

  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!forwarded.length) return socketIp;

  const index = forwarded.length - trustedProxyHops;
  return forwarded[index >= 0 ? index : 0];
}

function normalizedEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Dos contadores independientes. El de IP+email frena a un atacante concreto;
// el de solo email frena la fuerza bruta distribuida contra una cuenta, que es
// justo lo que el contador por IP no puede ver.
function loginAttemptKeys(req, email) {
  const account = normalizedEmail(email);
  return [`${clientIp(req)}:${account}`, `account:${account}`];
}

function limitFor(key) {
  return key.startsWith("account:") ? maxAccountLoginAttempts : maxLoginAttempts;
}

function isLoginRateLimited(req, email) {
  const now = Date.now();
  return loginAttemptKeys(req, email).some((key) => {
    const entry = loginAttempts.get(key);
    if (!entry || now > entry.resetAt) {
      loginAttempts.set(key, { count: 0, resetAt: now + loginWindowMs });
      return false;
    }
    return entry.count >= limitFor(key);
  });
}

function recordFailedLogin(req, email) {
  const now = Date.now();
  // Poda oportunista: bajo credential-stuffing con correos/IPs rotatorias el
  // mapa creceria sin limite en un proceso que vive semanas. Se limpia al
  // escribir, como el limitador publico.
  if (loginAttempts.size > 5000) {
    loginAttempts.forEach((value, mapKey) => {
      if (now > value.resetAt) loginAttempts.delete(mapKey);
    });
  }
  loginAttemptKeys(req, email).forEach((key) => {
    const entry = loginAttempts.get(key);
    if (!entry || now > entry.resetAt) {
      loginAttempts.set(key, { count: 1, resetAt: now + loginWindowMs });
      return;
    }
    entry.count += 1;
  });
}

function clearFailedLogins(req, email) {
  loginAttemptKeys(req, email).forEach((key) => loginAttempts.delete(key));
}

// Las sesiones se guardan en Postgres cuando hay base de datos: el plan
// gratuito de Render suspende y reinicia el servicio, y un Map en memoria
// expulsaria a todo el personal en cada reinicio o despliegue.
async function createSession(user, req) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + sessionTtlMs;
  const session = {
    userId: user.id,
    ip: clientIp(req),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 180),
    expiresAt
  };

  sessions.set(token, session);

  if (databaseUrl) {
    try {
      const pool = await getPostgresPool();
      await pool.query(
        `INSERT INTO app_sessions (token, user_id, ip, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
         ON CONFLICT (token) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
        [token, session.userId, session.ip, session.userAgent, expiresAt]
      );
      await pool.query("DELETE FROM app_sessions WHERE expires_at <= now()");
    } catch (error) {
      console.error("No se pudo guardar la sesion en Postgres:", error.message);
    }
  }

  return { token, expiresAt };
}

async function destroySession(token) {
  sessions.delete(token);
  if (!databaseUrl) return;
  try {
    const pool = await getPostgresPool();
    await pool.query("DELETE FROM app_sessions WHERE token = $1", [token]);
  } catch (error) {
    console.error("No se pudo borrar la sesion en Postgres:", error.message);
  }
}

// Cierra TODAS las sesiones de un usuario. Se usa al restablecer la contrasena:
// si alguien la cambia (o se la roban y la recupera el dueño), los tokens
// viejos dejan de servir de inmediato.
async function destroySessionsForUser(userId) {
  for (const [token, session] of sessions) {
    if (session.userId === userId) sessions.delete(token);
  }
  if (!databaseUrl) return;
  try {
    const pool = await getPostgresPool();
    await pool.query("DELETE FROM app_sessions WHERE user_id = $1", [userId]);
  } catch (error) {
    console.error("No se pudieron borrar las sesiones del usuario:", error.message);
  }
}

async function sessionFromToken(rawToken) {
  const token = String(rawToken || "").trim();
  if (!token) return null;

  const cached = sessions.get(token);
  if (cached) {
    if (cached.expiresAt > Date.now()) return { token, ...cached };
    sessions.delete(token);
  }

  if (!databaseUrl) return null;

  try {
    const pool = await getPostgresPool();
    const result = await pool.query(
      "SELECT user_id, ip, user_agent, expires_at FROM app_sessions WHERE token = $1 AND expires_at > now()",
      [token]
    );
    const row = result.rows[0];
    if (!row) return null;

    const session = {
      userId: row.user_id,
      ip: row.ip || "",
      userAgent: row.user_agent || "",
      expiresAt: new Date(row.expires_at).getTime()
    };
    sessions.set(token, session);
    return { token, ...session };
  } catch (error) {
    console.error("No se pudo leer la sesion en Postgres:", error.message);
    return null;
  }
}

async function sessionFromRequest(req) {
  const authorization = String(req.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? sessionFromToken(match[1]) : null;
}

async function sessionFromQuery(url) {
  return sessionFromToken(url.searchParams.get("token"));
}

function sendRealtimeEvent(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastStateUpdated(session, collections = []) {
  realtimeRevision += 1;
  const payload = {
    revision: realtimeRevision,
    at: new Date().toISOString(),
    userId: session?.userId || "",
    collections
  };

  realtimeClients.forEach((client, clientId) => {
    try {
      sendRealtimeEvent(client.res, "state-updated", payload);
    } catch (error) {
      clearInterval(client.heartbeat);
      realtimeClients.delete(clientId);
    }
  });
}

function handleRealtimeEvents(req, res, session) {
  setBaseHeaders(req, res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const clientId = crypto.randomUUID();
  const heartbeat = setInterval(() => {
    if (res.destroyed) {
      clearInterval(heartbeat);
      realtimeClients.delete(clientId);
      return;
    }
    res.write(`: keepalive ${Date.now()}\n\n`);
  }, 25000);

  realtimeClients.set(clientId, { res, heartbeat, userId: session.userId });
  sendRealtimeEvent(res, "connected", { ok: true, revision: realtimeRevision });

  req.on("close", () => {
    clearInterval(heartbeat);
    realtimeClients.delete(clientId);
  });
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

function cloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sessionUserFromState(state, session) {
  return Array.isArray(state?.users) ? state.users.find((user) => user.id === session.userId) || null : null;
}

function isSuperUser(user) {
  return Boolean(user?.active && user.role === "super");
}

function isFullAccessUser(user) {
  return Boolean(user?.active && (user.role === "super" || user.role === "admin"));
}

function canWriteModule(user, moduleName) {
  return Boolean(user?.active && user.permissions?.[moduleName]?.write);
}

// Sucursal(es) que un usuario puede ver y tocar.
//   - Super y administrador ven TODAS: dirigen el negocio completo.
//   - Cualquier otra cuenta queda atada a la sucursal que el super usuario le
//     asigno en `branchScope`. La recepcion de Rohrmoser jamas recibe ni puede
//     escribir datos de Alajuela, y viceversa.
//   - Sin una asignacion valida se asume "all" para no romper cuentas que ya
//     existian antes de esta separacion: el super decide cuando atar cada una a
//     su sede. La UI de usuarios lo deja hacer con un clic.
function branchScopeOf(user) {
  if (isFullAccessUser(user)) return "all";
  const scope = typeof user?.branchScope === "string" ? user.branchScope.trim() : "";
  return scope || "all";
}

function userCanAccessBranch(user, branchId) {
  const scope = branchScopeOf(user);
  return scope === "all" || scope === branchId;
}

// Datos de planilla / RRHH (comisiones, beneficios usados, vacaciones). Son
// datos sensibles del personal: viven en el nivel superior del estado (no son
// de una sucursal) y solo los ve y los toca quien tenga acceso explicito.
const payrollCollections = ["staff", "commissions", "benefits", "vacations"];

// Acceso a planilla: siempre el super, y cualquier cuenta a la que el super le
// haya puesto payrollAccess. Un administrador NO lo tiene por su rol: la
// pantalla de planilla la abre solo quien el super designe, tal como se pidio.
function hasPayrollAccess(user) {
  return Boolean(user?.active && (user.role === "super" || user.payrollAccess === true));
}

// Sucursales concretas que este usuario puede tocar en el estado actual. null
// significa "todas" (no hay que filtrar nada).
function allowedBranchSet(state, user) {
  const scope = branchScopeOf(user);
  if (scope === "all") return null;
  return new Set([scope]);
}

// Copia del estado recortada a la sucursal del usuario. Para una cuenta atada a
// una sede, las demas sucursales NO viajan en el JSON: la separacion es real en
// el servidor, no un simple filtro de pantalla que se pueda saltar leyendo la
// respuesta cruda. El nivel superior (espejo de la sucursal abierta) se
// reapunta a la sede permitida.
function scopeStateForUser(state, user) {
  const scope = branchScopeOf(user);
  if (scope === "all" || !state || typeof state !== "object") return state;
  const allowed = state.branches && state.branches[scope] ? scope : null;
  const scoped = { ...state };
  const branches = {};
  if (allowed) branches[allowed] = state.branches[allowed];
  scoped.branches = branches;
  scoped.currentBranchId = allowed || scope;
  branchDataCollections.forEach((collectionName) => {
    scoped[collectionName] = allowed ? cloneValue(state.branches[allowed][collectionName] || []) : [];
  });
  return scoped;
}

function writableCollectionsForUser(user) {
  if (isFullAccessUser(user)) return new Set(["users", ...branchDataCollections]);
  const collections = new Set();
  Object.entries(moduleWriteCollections).forEach(([moduleName, collectionNames]) => {
    if (!canWriteModule(user, moduleName)) return;
    collectionNames.forEach((collectionName) => collections.add(collectionName));
  });
  // Administrar cuentas de personal (crear usuarios, cambiar roles/permisos) es
  // territorio de administracion. Aunque un no-admin tuviera el permiso
  // `usuarios.write`, no puede escribir la coleccion `users`: asi no puede
  // fabricar cuentas con permisos ni tocar los roles de nadie.
  collections.delete("users");
  // Salida de inventario: quien tenga stockOutAccess (lo asigna el super, p. ej.
  // una contadora que solo lee inventario) puede tocar productos y movimientos
  // para SACAR stock. No es escritura de inventario: mas abajo, como no tiene el
  // modulo `inventario`, restrictProductChanges limita esos cambios a BAJAS de
  // stock (nunca subir existencias ni reeditar el catalogo).
  if (user && user.stockOutAccess === true) {
    collections.add("products");
    collections.add("stockMovements");
  }
  return collections;
}

// Facturar y consumir producto descuentan stock, por eso los modulos de
// facturacion y en-curso necesitan tocar `products`. Pero solo para eso: quien
// no administra inventario no puede crear, borrar ni reeditar productos. Sin
// esta restriccion, cualquiera que pueda facturar podia reescribir el catalogo
// entero -precios incluidos- aunque la interfaz le oculte el modulo.
function mergeStockOnlyProducts(nextProducts, currentProducts) {
  if (!Array.isArray(currentProducts)) return currentProducts;
  if (!Array.isArray(nextProducts)) return currentProducts;

  const incomingById = new Map(nextProducts.filter((item) => item?.id).map((item) => [item.id, item]));
  return currentProducts.map((product) => {
    const incoming = incomingById.get(product.id);
    if (!incoming) return product;
    const stock = Number(incoming.stock);
    if (!Number.isFinite(stock) || stock < 0) return product;
    // Estos modulos (facturacion, en-curso) solo DESCUENTAN stock al vender o
    // consumir producto. Nunca lo suben: subir existencias es administrar
    // inventario, y eso queda para quien tiene ese permiso. Por eso un valor
    // mayor al actual se ignora: evita que un usuario de facturacion infle las
    // existencias, con intencion o por un bug del cliente.
    const currentStock = Number(product.stock);
    if (Number.isFinite(currentStock) && stock > currentStock) return product;
    return { ...product, stock };
  });
}

function restrictProductChanges(mergedState, currentState) {
  mergedState.products = mergeStockOnlyProducts(mergedState.products, currentState?.products);

  Object.keys(mergedState.branches || {}).forEach((branchId) => {
    const currentBranch = currentState?.branches?.[branchId];
    if (!currentBranch) return;
    mergedState.branches[branchId].products = mergeStockOnlyProducts(
      mergedState.branches[branchId]?.products,
      currentBranch.products
    );
  });
}

function collectionChanged(nextState, currentState, collectionName) {
  return JSON.stringify(nextState?.[collectionName] || []) !== JSON.stringify(currentState?.[collectionName] || []);
}

function branchCollectionChanged(nextState, currentState, branchId, collectionName) {
  return JSON.stringify(nextState?.branches?.[branchId]?.[collectionName] || []) !== JSON.stringify(currentState?.branches?.[branchId]?.[collectionName] || []);
}

function changedCollections(nextState, currentState) {
  const changed = new Set();
  branchDataCollections.forEach((collectionName) => {
    if (collectionChanged(nextState, currentState, collectionName)) changed.add(collectionName);
  });
  if (collectionChanged(nextState, currentState, "users")) changed.add("users");

  const branchIds = new Set([...Object.keys(currentState?.branches || {}), ...Object.keys(nextState?.branches || {})]);
  branchIds.forEach((branchId) => {
    branchDataCollections.forEach((collectionName) => {
      if (branchCollectionChanged(nextState, currentState, branchId, collectionName)) {
        changed.add(`${branchId}.${collectionName}`);
      }
    });
  });
  return Array.from(changed).sort();
}

function addAuditEntry(state, user, action, collections = []) {
  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    action,
    userId: user?.id || "",
    userName: user?.name || "Sistema",
    role: user?.role || "",
    collections
  };
  const auditLog = Array.isArray(state.auditLog) ? state.auditLog : [];
  state.auditLog = [entry, ...auditLog].slice(0, auditLogLimit);
}

// Umbral de "vaciado masivo": si una coleccion de datos de sucursal tenia al
// menos estos registros y el guardado la dejaria en cero, se sospecha de un bug
// del navegador (la app borra de a un registro, no en bloque) y se CONSERVA lo
// guardado. El borrado real de pocos registros sigue funcionando. Es una red
// extra a favor de "que nada se borre".
const wipeGuardThreshold = 3;

function wouldWipeBranchCollection(collectionName, currentList, nextList) {
  if (!branchDataCollections.includes(collectionName)) return false;
  return (
    Array.isArray(currentList) &&
    currentList.length >= wipeGuardThreshold &&
    Array.isArray(nextList) &&
    nextList.length === 0
  );
}

function applyAllowedCollections(mergedState, nextState, collectionNames) {
  collectionNames.forEach((collectionName) => {
    if (Array.isArray(nextState?.[collectionName])) {
      if (wouldWipeBranchCollection(collectionName, mergedState[collectionName], nextState[collectionName])) return;
      mergedState[collectionName] = cloneValue(nextState[collectionName]);
    }
  });
}

// `allowedBranches`: null = todas; un Set = solo esas sucursales se aplican. Una
// cuenta atada a una sede nunca puede escribir en otra: aunque su navegador
// mande datos de la otra sucursal (por un bug o a proposito), aqui se ignoran y
// la sede ajena se conserva intacta desde el estado guardado. Esto es a la vez
// la frontera de seguridad y el seguro contra perdida de datos: un cliente que
// normaliza a "ambas sucursales" con la ajena vacia no puede vaciar la real.
function applyAllowedBranchCollections(mergedState, nextState, collectionNames, allowedBranches = null) {
  const branchIds = new Set([...Object.keys(mergedState.branches || {}), ...Object.keys(nextState?.branches || {})]);
  mergedState.branches = mergedState.branches || {};

  branchIds.forEach((branchId) => {
    if (allowedBranches && !allowedBranches.has(branchId)) return;
    const nextBranch = nextState?.branches?.[branchId];
    if (!nextBranch) return;
    mergedState.branches[branchId] = mergedState.branches[branchId] || {};
    collectionNames.forEach((collectionName) => {
      if (Array.isArray(nextBranch[collectionName])) {
        if (wouldWipeBranchCollection(collectionName, mergedState.branches[branchId][collectionName], nextBranch[collectionName])) return;
        mergedState.branches[branchId][collectionName] = cloneValue(nextBranch[collectionName]);
      }
    });
  });
}

// Claves de primer nivel que nunca se copian tal cual del cliente: se derivan
// del estado guardado o pasan por el merge por coleccion.
// `branding` solo se cambia por su propio endpoint (super usuario). Se marca
// como gestionada para que un PUT de estado normal nunca la pise con una copia
// vieja del cliente.
const managedTopLevelKeys = new Set(["users", "branches", "auditLog", "stateRevision", "updatedAt", "branding"]);

function applyExtraTopLevelKeys(mergedState, nextState) {
  Object.keys(nextState || {}).forEach((key) => {
    if (managedTopLevelKeys.has(key)) return;
    if (branchDataCollections.includes(key)) return;
    // La planilla se aplica aparte y solo para quien tiene acceso: un admin sin
    // acceso a RRHH no puede reescribirla (ni vaciarla) con un PUT normal.
    if (payrollCollections.includes(key)) return;
    if (nextState[key] === undefined) return;
    mergedState[key] = cloneValue(nextState[key]);
  });
}

// Barrera contra escalada de privilegios por la coleccion `users`.
//   - Nadie puede subirse a si mismo el rol ni los permisos con un PUT de
//     estado: su propia cuenta conserva el rol y permisos guardados.
//   - Solo un super puede otorgar roles de acceso total (super/admin). Un
//     requester de menor rango que intente crear o elevar a alguien a
//     super/admin ve ese cambio revertido a un rol seguro.
// Las cuentas de sistema (USR-000/002/003) ya las re-fija applySystemUserAuth.
const elevatedRoles = new Set(["super", "admin"]);

function clampUserRoles(nextUsers, currentState, requester) {
  if (!Array.isArray(nextUsers)) return nextUsers;
  const requesterIsSuper = isSuperUser(requester);
  const currentById = new Map((currentState?.users || []).map((item) => [item.id, item]));
  return nextUsers.map((candidate) => {
    const current = currentById.get(candidate.id);
    // Solo un super puede otorgar o quitar acceso a planilla. Para cualquier
    // otro requester, payrollAccess queda como estaba guardado (o false en una
    // cuenta nueva): nadie que no sea super se da acceso a RRHH ni se lo da a otro.
    // Solo un super otorga/quita acceso a planilla y salida de inventario. Para
    // cualquier otro requester, ambos quedan como estaban guardados (o false en
    // una cuenta nueva): nadie que no sea super se los da a si mismo ni a otro.
    const clampPayroll = (user) =>
      requesterIsSuper
        ? user
        : {
            ...user,
            payrollAccess: current ? current.payrollAccess === true : false,
            stockOutAccess: current ? current.stockOutAccess === true : false
          };
    // Un no-super no puede PAUSAR (ni reactivar) una cuenta elevada (super o
    // admin) ni la cuenta raiz: si pudiera, un admin dejaria fuera al super
    // enviando su cuenta con active:false y se quedaria como unica cuenta con
    // mando. `active` se fuerza al valor guardado en esos casos.
    const clampActive = (user) => {
      if (requesterIsSuper || !current) return user;
      if (elevatedRoles.has(current.role) || user.id === "USR-000") {
        return { ...user, active: current.active };
      }
      return user;
    };
    const clamp = (user) => clampActive(clampPayroll(user));
    if (requester && candidate.id === requester.id && current) {
      return clamp({ ...candidate, role: current.role, permissions: current.permissions });
    }
    // Solo un super puede INTRODUCIR o ELEVAR a super/admin. Pero si el rol
    // enviado es elevado y coincide con el ya guardado, no es una elevacion: no
    // se toca. Sin esto, como el cliente reenvia SIEMPRE la lista completa de
    // usuarios, cualquier guardado de un no-super (o de un admin, que tampoco es
    // super) degradaba a recepcion a TODOS los admin/super existentes.
    if (!requesterIsSuper && elevatedRoles.has(candidate.role)) {
      if (current && current.role === candidate.role) return clamp(candidate);
      const safeRole = current && !elevatedRoles.has(current.role) ? current.role : "recepcion";
      return clamp({ ...candidate, role: safeRole });
    }
    return clamp(candidate);
  });
}

// Solo un super usuario puede ELIMINAR cuentas. Un admin (que tambien escribe la
// coleccion `users`) puede editar y pausar, pero si su guardado omite a alguien,
// esa cuenta se conserva: borrar personal es decision del super. La cuenta raiz
// USR-000 nunca se elimina por esta via (ademas applySystemUserAuth la re-fija).
function guardUserDeletions(nextUsers, currentState, requester) {
  if (!Array.isArray(nextUsers)) return nextUsers;
  if (isSuperUser(requester)) {
    // El super puede borrar a cualquiera menos la cuenta raiz.
    const nextIds = new Set(nextUsers.map((user) => user.id));
    if (nextIds.has("USR-000")) return nextUsers;
    const root = (currentState?.users || []).find((user) => user.id === "USR-000");
    return root ? [root, ...nextUsers] : nextUsers;
  }
  // Requester no-super: se re-agrega cualquier cuenta que haya desaparecido.
  const nextById = new Map(nextUsers.map((user) => [user.id, user]));
  const restored = [...nextUsers];
  (currentState?.users || []).forEach((current) => {
    if (!nextById.has(current.id)) restored.push(current);
  });
  return restored;
}

// Toda escritura -tambien la de un super usuario- se fusiona coleccion por
// coleccion sobre el estado guardado. Antes, la rama de acceso total escribia
// el documento del cliente tal cual: un PUT parcial (un cliente desactualizado,
// una respuesta truncada, un bug del navegador) persistia un estado sin
// `users` ni `branches` y dejaba la instancia inaccesible para siempre, porque
// `ensureState` ya no vuelve a sembrar cuando el estado existe.
function applyWritePolicy(nextState, currentState, session) {
  const user = sessionUserFromState(currentState, session);
  if (!user?.active) {
    const error = new Error("Usuario inactivo o no encontrado.");
    error.statusCode = 403;
    throw error;
  }

  const fullAccess = isFullAccessUser(user);
  const safeNextState = preserveProtectedState(nextState, currentState);
  const writableCollections = writableCollectionsForUser(user);
  const mergedState = cloneValue(currentState) || {};
  // Sucursales que este usuario puede escribir. Para una cuenta atada a una
  // sede, `allowedBranches` es {suSede} y toda escritura a otra sucursal se
  // descarta mas abajo, conservando la ajena tal como estaba guardada.
  const allowedBranches = allowedBranchSet(currentState, user);

  if (fullAccess) {
    applyExtraTopLevelKeys(mergedState, safeNextState);
  } else {
    mergedState.currentUserId = session.userId;
    // La sucursal activa global solo la puede cambiar quien ve todas. Una cuenta
    // atada no mueve el espejo de nivel superior de las demas: se queda con la
    // sede que ya tenia el estado guardado, y su GET siempre le devuelve la
    // suya recortada de todos modos.
    if (!allowedBranches && typeof nextState.currentBranchId === "string") {
      mergedState.currentBranchId = nextState.currentBranchId;
    }
  }

  // El nivel superior es solo el espejo de la sucursal activa global. Una cuenta
  // atada no debe reescribirlo con los datos de SU sede (pisaria el espejo que
  // ve un administrador en otra sucursal); sus cambios entran por la rama de su
  // sucursal, que es la fuente de verdad. Por eso, cuando esta atada, no se
  // aplican colecciones de sucursal al nivel superior.
  if (allowedBranches) {
    const nonBranchWritables = new Set([...writableCollections].filter((name) => !branchDataCollections.includes(name)));
    applyAllowedCollections(mergedState, safeNextState, nonBranchWritables);
  } else {
    applyAllowedCollections(mergedState, safeNextState, writableCollections);
  }
  applyAllowedBranchCollections(mergedState, safeNextState, writableCollections, allowedBranches);

  if (writableCollections.has("users")) {
    mergedState.users = clampUserRoles(mergedState.users, currentState, user);
    // Solo un super puede borrar cuentas; un admin que omita a alguien no lo
    // elimina. Se corre despues de clampUserRoles para conservar rol/permisos.
    mergedState.users = guardUserDeletions(mergedState.users, currentState, user);
  }

  // Planilla: solo quien tiene acceso a RRHH puede escribir estas colecciones.
  // Para el resto quedan tal como estaban guardadas (cloneValue de currentState).
  if (hasPayrollAccess(user)) {
    applyAllowedCollections(mergedState, safeNextState, new Set(payrollCollections));
  }

  if (!canWriteModule(user, "inventario")) {
    restrictProductChanges(mergedState, currentState);
  }

  addAuditEntry(
    mergedState,
    user,
    fullAccess ? "state.write" : "state.write.limited",
    changedCollections(mergedState, currentState)
  );
  return preserveProtectedState(mergedState, currentState);
}

function backupPayload(state) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: "Chic & Co",
    state: stripSensitiveState(state)
  };
}

// Fija rol, funcion y permisos de las cuentas de sistema para que un cliente
// manipulado no pueda escalar privilegios. El hash de contrasena solo se aplica
// cuando la cuenta todavia no tiene uno guardado, de modo que la contrasena si
// se pueda cambiar desde la aplicacion.
function applySystemUserAuth(state) {
  if (!state || !Array.isArray(state.users)) return state;
  return {
    ...state,
    users: state.users.map((user) => {
      const auth = systemUserAuth[user.id];
      if (!auth) return user;
      const { passwordHash: seedHash, ...pinned } = auth;
      const merged = { ...user, ...pinned };
      if (seedHash && !user.passwordHash) merged.passwordHash = seedHash;
      // La cuenta raiz nunca queda pausada: si algun guardado la desactivo, se
      // reactiva aqui. Es la ultima garantia contra un bloqueo total de super.
      if (user.id === "USR-000") merged.active = true;
      return merged;
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
    // Sin este listener, un cliente ocioso que Postgres cierra (reinicio del
    // proveedor, timeout de red) emite un 'error' sin manejar que TUMBA el
    // proceso entero. Con el, el pool descarta ese cliente y sigue.
    pgPool.on("error", (error) => console.error("Pool de Postgres (idle) fallo:", error.message));
  }

  if (!pgReady) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id integer PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS app_sessions (
        token text PRIMARY KEY,
        user_id text NOT NULL,
        ip text NOT NULL DEFAULT '',
        user_agent text NOT NULL DEFAULT '',
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pgPool.query("CREATE INDEX IF NOT EXISTS app_sessions_expires_at_idx ON app_sessions (expires_at)");
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

// Ultima red de seguridad antes de tocar el disco o la base. Un estado sin
// usuarios no se puede recuperar desde la propia aplicacion: nadie podria
// iniciar sesion y `ensureState` no vuelve a sembrar porque la fila existe.
function assertPersistableState(nextState) {
  const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 });

  if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
    throw invalid("Estado invalido: no es un objeto.");
  }
  if (!Array.isArray(nextState.users) || !nextState.users.length) {
    throw invalid("Estado invalido: no se puede guardar sin usuarios.");
  }
  if (!nextState.branches || typeof nextState.branches !== "object" || Array.isArray(nextState.branches) || !Object.keys(nextState.branches).length) {
    throw invalid("Estado invalido: faltan las sucursales.");
  }
  // Siempre debe quedar al menos un super activo, o nadie podria volver a
  // administrar la instancia (crear cuentas, elevar roles, respaldos). Es la
  // ultima barrera contra un bloqueo total, ademas de las de clampUserRoles.
  if (!nextState.users.some((user) => user?.active !== false && user?.role === "super")) {
    throw invalid("Estado invalido: debe quedar al menos un super usuario activo.");
  }
  return nextState;
}

// Colecciones que solo crecen y viven en su propia tabla, fuera del documento
// de 2 MB. Ver backend/collection-store.js. Empezamos por los movimientos de
// inventario, que solo se agregan (nunca se editan ni se borran), asi que la
// migracion no puede perder datos.
const overlayCollections = ["stockMovements"];

// Rellena las colecciones de overlay antes de entregar el estado al cliente.
async function hydrateForClient(state) {
  for (const collection of overlayCollections) {
    try {
      await collectionStore.hydrate(state, collection);
    } catch (error) {
      console.error(`No se pudo rellenar ${collection} desde su tabla:`, error.message);
    }
  }
  return state;
}

// Mueve las colecciones de overlay a su tabla y las quita del documento a
// persistir. Si la tabla falla, la coleccion se queda en el documento
// (comportamiento anterior): un fallo degrada sin perder nada.
async function dehydrateForStorage(state) {
  let doc = state;
  for (const collection of overlayCollections) {
    try {
      await collectionStore.absorb(doc, collection);
      doc = collectionStore.stripped(doc, collection);
    } catch (error) {
      console.error(`No se pudo mover ${collection} a su tabla, se queda en el documento:`, error.message);
    }
  }
  return doc;
}

async function writeState(nextState) {
  assertPersistableState(nextState);
  const doc = await dehydrateForStorage(nextState);

  if (!databaseUrl) {
    await writeJsonState(doc);
    return;
  }

  const pool = await getPostgresPool();
  const storedState = applySystemUserAuth(doc);
  await pool.query(
    `INSERT INTO app_state (id, data, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [1, storedState]
  );
}

// Escritura condicionada a la revision leida. En Postgres la comprobacion y la
// escritura ocurren en la misma sentencia: sin esto, dos PUT simultaneos con la
// misma `baseRevision` pasaban ambos el control y el segundo pisaba al primero.
// Devuelve false si otro proceso escribio primero.
async function writeStateIfRevision(nextState, expectedRevision) {
  assertPersistableState(nextState);

  if (!databaseUrl) {
    const current = await readJsonState();
    if (stateRevision(current) !== Number(expectedRevision)) return false;
    await writeState(nextState);
    return true;
  }

  const pool = await getPostgresPool();
  // La revision se comprueba en el documento. Se hace primero para no absorber
  // los movimientos si otra escritura gano la carrera.
  const check = await pool.query(
    "SELECT COALESCE((data ->> 'stateRevision')::numeric, 0) AS rev FROM app_state WHERE id = 1"
  );
  if (Number(check.rows[0]?.rev ?? -1) !== Number(expectedRevision)) return false;

  const doc = await dehydrateForStorage(nextState);
  const storedState = applySystemUserAuth(doc);
  const result = await pool.query(
    `UPDATE app_state
        SET data = $1, updated_at = now()
      WHERE id = 1
        AND COALESCE((data ->> 'stateRevision')::numeric, 0) = $2`,
    [storedState, Number(expectedRevision)]
  );
  return result.rowCount > 0;
}

// Serializa las mutaciones dentro de este proceso. Render corre una sola
// instancia, asi que junto con la escritura condicionada cubre las carreras
// reales entre peticiones.
let stateMutationLock = Promise.resolve();

function withStateLock(task) {
  const next = stateMutationLock.then(task, task);
  stateMutationLock = next.then(
    () => {},
    () => {}
  );
  return next;
}

// Mismo patron para las reservas publicas: revalidar el cupo y crear la
// solicitud tienen que ocurrir sin que otra reserva concurrente se cuele en
// medio. Sin esto, varias personas apretando a la vez sobre-reservaban el mismo
// espacio (todas recibian 201) hasta agotar la capacidad.
let bookingMutationLock = Promise.resolve();

function withBookingLock(task) {
  const next = bookingMutationLock.then(task, task);
  bookingMutationLock = next.then(
    () => {},
    () => {}
  );
  return next;
}

const branchIds = ["rohrmoser", "alajuela"];

function emptyBranchData() {
  return branchDataCollections.reduce((data, collectionName) => {
    data[collectionName] = [];
    return data;
  }, {});
}

// Estado inicial de una instalacion nueva. Sin CHIC_BOOTSTRAP_EMAIL y
// CHIC_BOOTSTRAP_PASSWORD el super usuario queda sin correo y no puede entrar:
// no se hornea ninguna contrasena de administrador por defecto.
function bootstrapState() {
  const superUser = {
    id: "USR-000",
    name: "Gabriel Arce",
    email: bootstrapEmail,
    role: "super",
    function: "Super usuario",
    active: true,
    passwordHash: bootstrapPassword ? hashPasswordModern(bootstrapPassword) : "",
    permissions: superUserPermissions
  };

  const seededUsers = ["USR-001", "USR-002", "USR-003", "USR-004"].map((userId) => ({
    id: userId,
    name: userId,
    email: "",
    role: "recepcion",
    function: "Pendiente",
    active: true,
    passwordHash: "",
    permissions: {}
  }));

  return {
    ...emptyBranchData(),
    stateRevision: 1,
    updatedAt: new Date().toISOString(),
    currentBranchId: branchIds[0],
    currentUserId: superUser.id,
    users: [superUser, ...seededUsers],
    branches: branchIds.reduce((branches, id) => {
      branches[id] = emptyBranchData();
      return branches;
    }, {}),
    auditLog: []
  };
}

let bootstrapPromise = null;

// Devuelve el estado, creandolo la primera vez. Sin esto una base de datos
// vacia deja la aplicacion inaccesible: no se puede entrar ni restaurar un
// respaldo porque ambas cosas requieren una sesion.
async function ensureState() {
  const current = await readState();
  if (current) return current;

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const existing = await readState();
      if (existing) return existing;

      const seeded = applySystemUserAuth(bootstrapState());
      await writeState(seeded);
      if (bootstrapEmail && bootstrapPassword) {
        console.log(`Estado inicial creado. Super usuario: ${bootstrapEmail}`);
      } else {
        console.warn(
          "Estado inicial creado sin super usuario. Configure CHIC_BOOTSTRAP_EMAIL y CHIC_BOOTSTRAP_PASSWORD y reinicie."
        );
      }
      return seeded;
    })().finally(() => {
      bootstrapPromise = null;
    });
  }

  return bootstrapPromise;
}

function stateRevision(state) {
  return Number(state?.stateRevision || 0);
}

function stampRevision(nextState, currentState) {
  return {
    ...nextState,
    stateRevision: stateRevision(currentState) + 1,
    updatedAt: new Date().toISOString()
  };
}

function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

// Cambia el hash de una sola cuenta sin reescribir el documento entero. Antes
// se guardaba el estado completo leido antes del login, asi que cualquier
// cambio que otro usuario hubiera guardado en ese intervalo se revertia.
async function setUserPasswordHash(userId, passwordHash) {
  if (databaseUrl) {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `UPDATE app_state
          SET data = jsonb_set(data, '{users}', (
                SELECT jsonb_agg(
                  CASE WHEN item ->> 'id' = $1
                       THEN jsonb_set(item, '{passwordHash}', to_jsonb($2::text))
                       ELSE item END
                )
                FROM jsonb_array_elements(data -> 'users') AS item
              )),
              updated_at = now()
        WHERE id = 1
          AND jsonb_typeof(data -> 'users') = 'array'`,
      [userId, passwordHash]
    );
    return result.rowCount > 0;
  }

  return withStateLock(async () => {
    const current = await readJsonState();
    if (!current || !Array.isArray(current.users)) return false;
    await writeJsonState({
      ...current,
      users: current.users.map((item) => (item.id === userId ? { ...item, passwordHash } : item))
    });
    return true;
  });
}

// Sube un hash heredado sha256 a scrypt tras un inicio de sesion correcto.
// Nunca debe impedir el acceso, por eso ignora cualquier fallo de escritura.
async function upgradeLegacyHash(user, password) {
  if (isModernHash(user.passwordHash)) return;
  try {
    await setUserPasswordHash(user.id, await hashPasswordModernAsync(password));
  } catch (error) {
    console.error("No se pudo actualizar el hash de contrasena:", error.message);
  }
}

async function handleLogin(req, res) {
  const payload = await readJsonBody(req);
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");

  if (isLoginRateLimited(req, email)) {
    sendError(req, res, 429, "Demasiados intentos. Espere unos minutos e intente de nuevo.");
    return;
  }

  const state = await ensureState();
  const users = Array.isArray(state.users) ? state.users : [];
  const user = users.find((item) => email && String(item.email || "").trim().toLowerCase() === email);

  if (!user || user.active === false || !(await verifyPasswordAsync(password, user.passwordHash))) {
    recordFailedLogin(req, email);
    if (isLoginRateLimited(req, email)) {
      sendError(req, res, 429, "Demasiados intentos. Espere unos minutos e intente de nuevo.");
      return;
    }
    sendError(req, res, 401, "Email o contrasena incorrectos.");
    return;
  }

  clearFailedLogins(req, email);
  await upgradeLegacyHash(user, password);
  const session = await createSession(user, req);
  sendJson(req, res, 200, {
    ok: true,
    userId: user.id,
    user: publicUser(user),
    token: session.token,
    expiresAt: new Date(session.expiresAt).toISOString()
  });
}

// Cambio de contrasena. Cada usuario puede cambiar la suya con su contrasena
// actual; un super usuario puede restablecer la de cualquier cuenta.
async function handlePasswordChange(req, res, session) {
  const payload = await readJsonBody(req);
  const state = await ensureState();
  const actor = sessionUserFromState(state, session);

  if (!actor?.active) {
    sendError(req, res, 403, "Usuario inactivo o no encontrado.");
    return;
  }

  const targetId = String(payload.userId || actor.id);
  const target = state.users.find((item) => item.id === targetId);
  if (!target) {
    sendError(req, res, 404, "Usuario no encontrado.");
    return;
  }

  const isSelf = target.id === actor.id;
  if (!isSelf && !isSuperUser(actor)) {
    sendError(req, res, 403, "Solo un super usuario puede cambiar la contrasena de otra cuenta.");
    return;
  }

  const newPassword = String(payload.newPassword || "");
  if (newPassword.length < 10) {
    sendError(req, res, 400, "La contrasena nueva debe tener al menos 10 caracteres.");
    return;
  }

  if (isSelf && !(await verifyPasswordAsync(String(payload.currentPassword || ""), target.passwordHash))) {
    sendError(req, res, 401, "La contrasena actual no es correcta.");
    return;
  }

  const passwordHash = await hashPasswordModernAsync(newPassword);
  await withStateLock(async () => {
    const freshState = await ensureState();
    const nextState = {
      ...freshState,
      users: (freshState.users || []).map((item) =>
        item.id === target.id ? { ...item, passwordHash } : item
      )
    };
    addAuditEntry(nextState, actor, isSelf ? "password.change" : "password.reset", [`users:${target.id}`]);
    await writeState(stampRevision(nextState, freshState));
  });
  sendJson(req, res, 200, { ok: true });
}

/* -------------------------------------------------------------------------
 * Imágenes de producto
 * ---------------------------------------------------------------------- */

// Recorre el estado y devuelve todos los identificadores de imagen que siguen
// referenciados, en las dos sucursales y en el nivel superior.
function referencedImageIds(state) {
  const ids = new Set();
  const collect = (products) => {
    if (!Array.isArray(products)) return;
    products.forEach((product) => {
      if (product?.imageId) ids.add(String(product.imageId));
    });
  };

  collect(state?.products);
  Object.values(state?.branches || {}).forEach((branch) => collect(branch?.products));

  // Adjuntos de cuentas por pagar (factura y comprobante). Sin esto, la
  // recoleccion de huerfanas los borraria una hora despues de adjuntarlos.
  const collectPayables = (payables) => {
    if (!Array.isArray(payables)) return;
    payables.forEach((item) => {
      if (item?.facturaImageId) ids.add(String(item.facturaImageId));
      if (item?.comprobanteImageId) ids.add(String(item.comprobanteImageId));
    });
  };
  collectPayables(state?.payables);
  Object.values(state?.branches || {}).forEach((branch) => collectPayables(branch?.payables));

  // El logotipo del negocio tambien vive en el almacen de imagenes. Sin esto,
  // la recoleccion de huerfanas lo borraria una hora despues de subirlo, porque
  // ningun producto lo referencia.
  if (state?.branding?.logoId) ids.add(String(state.branding.logoId));
  return ids;
}

async function handleMediaUpload(req, res, session) {
  const state = await ensureState();
  const user = sessionUserFromState(state, session);

  // Subir una imagen es escribir en inventario (foto de producto) o en cuentas
  // por pagar (adjuntar factura/comprobante de un proveedor).
  if (!canWriteModule(user, "inventario") && !canWriteModule(user, "proveedores") && !isFullAccessUser(user)) {
    sendError(req, res, 403, "Este usuario no puede subir imagenes.");
    return;
  }

  const payload = await readJsonBody(req);
  let saved;
  try {
    saved = await mediaStore.saveImage({
      dataUrl: payload.dataUrl,
      branchId: payload.branchId,
      kind: payload.kind === "payable" ? "payable" : "product",
      ownerId: payload.ownerId,
      userId: user.id
    });
  } catch (error) {
    sendError(req, res, error.statusCode || 400, error.message || "No se pudo guardar la imagen.");
    return;
  }

  sendJson(req, res, 201, {
    ok: true,
    image: { id: saved.id, contentType: saved.contentType, byteSize: saved.byteSize }
  });
}

async function handleMediaItem(req, res, session, rawId) {
  if (req.method === "DELETE") {
    const state = await ensureState();
    const user = sessionUserFromState(state, session);
    if (!canWriteModule(user, "inventario") && !isFullAccessUser(user)) {
      sendError(req, res, 403, "Este usuario no puede modificar el inventario.");
      return;
    }
    const removed = await mediaStore.deleteImage(rawId);
    sendJson(req, res, removed ? 200 : 404, { ok: removed });
    return;
  }

  const image = await mediaStore.readImage(rawId);
  if (!image) {
    sendError(req, res, 404, "Imagen no encontrada.");
    return;
  }

  setBaseHeaders(req, res);
  res.writeHead(200, {
    "Content-Type": image.contentType,
    "Content-Length": image.buffer.length,
    // El identificador es aleatorio y el contenido nunca cambia, así que se
    // puede cachear de forma indefinida, pero solo en el navegador del usuario.
    "Cache-Control": "private, max-age=31536000, immutable",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff"
  });
  if (req.method === "HEAD") res.end();
  else res.end(image.buffer);
}

/* -------------------------------------------------------------------------
 * Agenda publica
 * ---------------------------------------------------------------------- */

const branchLabels = {
  rohrmoser: "Chic & Co Rohrmoser",
  alajuela: "Chic & Co Alajuela"
};

// Limite por IP. Reservar una cita es un acto poco frecuente: quien pide seis
// en una hora no es una clienta.
const publicRequests = new Map();
const publicWindowMs = 60 * 60 * 1000;
const maxPublicRequestsPerIp = 6;
const maxPublicRequestsPerEmail = 4;

function publicRateLimited(req) {
  const key = clientIp(req);
  const now = Date.now();
  const entry = publicRequests.get(key);

  if (!entry || now > entry.resetAt) {
    publicRequests.set(key, { count: 1, resetAt: now + publicWindowMs });
    // La tabla se limpia sola aprovechando la escritura, para que no crezca
    // sin limite en un proceso que vive semanas.
    if (publicRequests.size > 5000) {
      publicRequests.forEach((value, mapKey) => {
        if (now > value.resetAt) publicRequests.delete(mapKey);
      });
    }
    return false;
  }

  entry.count += 1;
  return entry.count > maxPublicRequestsPerIp;
}

// Etiquetas derivadas del estado: una sucursal agregada desde la app tambien
// puede reservar, sin tener que tocar el mapa fijo. Los nombres bonitos de las
// sucursales conocidas se conservan; una nueva usa su propio id como nombre.
function branchLabelsFor(state) {
  const labels = { ...branchLabels };
  Object.keys(state?.branches || {}).forEach((id) => {
    if (!labels[id]) labels[id] = id;
  });
  return labels;
}

function publicBranchLabel(branchId, state) {
  return branchLabelsFor(state)[branchId] || branchLabels[branchId] || branchId;
}

function isBookableBranch(state, branchId) {
  return Boolean(state?.branches?.[branchId]);
}

async function handlePublicBooking(req, res, url) {
  const pathname = url.pathname;

  // Identidad del negocio: nombre y si hay logo propio. Sin sesion, porque lo
  // consumen la pantalla de acceso y la pagina publica de reservas.
  if (pathname === "/api/public/branding" && req.method === "GET") {
    const state = await ensureState();
    const branding = state.branding || {};
    sendJson(req, res, 200, {
      ok: true,
      branding: {
        name: String(branding.name || "Chic & Co"),
        hasLogo: Boolean(branding.logoId),
        logoVersion: String(branding.logoId || "")
      }
    });
    return;
  }

  // Bytes del logotipo actual. Publico: un logo no es secreto, y lo necesitan
  // surperficies que se muestran antes de iniciar sesion.
  if (pathname === "/api/public/logo" && (req.method === "GET" || req.method === "HEAD")) {
    const state = await ensureState();
    const logoId = state.branding?.logoId;
    const image = logoId ? await mediaStore.readImage(logoId) : null;
    if (!image) {
      sendError(req, res, 404, "Sin logotipo.");
      return;
    }
    setBaseHeaders(req, res);
    res.writeHead(200, {
      "Content-Type": image.contentType,
      "Content-Length": image.buffer.length,
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff"
    });
    if (req.method === "HEAD") res.end();
    else res.end(image.buffer);
    return;
  }

  if (pathname === "/api/public/config" && req.method === "GET") {
    const state = await ensureState();
    const config = publicBooking.bookingConfig(state, branchLabelsFor(state));
    // Los pixeles configurados viajan a la pagina publica para poder trackear
    // el recorrido del cliente desde que abre el enlace.
    config.tracking = { ...trackingConfig };
    sendJson(req, res, 200, { ok: true, config });
    return;
  }

  if (pathname === "/api/public/availability" && req.method === "GET") {
    const branchId = String(url.searchParams.get("branchId") || "");
    const date = String(url.searchParams.get("date") || "");
    const duration = Number(url.searchParams.get("duration") || 60);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      sendError(req, res, 400, "Fecha invalida.");
      return;
    }

    const state = await ensureState();
    if (!isBookableBranch(state, branchId)) {
      sendError(req, res, 400, "Sucursal invalida.");
      return;
    }
    const specialist = String(url.searchParams.get("specialist") || "").trim();
    if (!publicBooking.isKnownSpecialist(state, branchId, specialist, date)) {
      sendError(req, res, 400, "Esa especialista no atiende en esta sucursal.");
      return;
    }
    const pending = await bookingStore.pendingForDay(branchId, date);
    const { slots, reason } = publicBooking.availableSlots(state, branchId, date, duration, pending, Date.now(), specialist);
    sendJson(req, res, 200, { ok: true, slots, reason });
    return;
  }

  if (pathname === "/api/public/booking" && req.method === "POST") {
    if (publicRateLimited(req)) {
      sendError(req, res, 429, "Demasiadas solicitudes. Intente de nuevo mas tarde.");
      return;
    }

    const payload = await readJsonBody(req);

    // Campo trampa: es invisible en el formulario, asi que solo lo rellena un
    // robot. Se responde 200 a proposito para no ensenarle que fue detectado.
    if (String(payload.website || "").trim()) {
      sendJson(req, res, 200, { ok: true, request: { id: "", status: "pending" } });
      return;
    }

    const branchId = String(payload.branchId || "");
    const state = await ensureState();
    if (!isBookableBranch(state, branchId)) {
      sendError(req, res, 400, "Sucursal invalida.");
      return;
    }

    const procedure = publicBooking
      .bookableProcedures(state, branchId)
      .find((item) => item.id === String(payload.procedureId || ""));
    if (!procedure) {
      sendError(req, res, 400, "Ese servicio no esta disponible para reservar en linea.");
      return;
    }

    let email;
    let phone;
    let name;
    try {
      email = bookingStore.normalizeEmail(payload.clientEmail);
      phone = bookingStore.normalizePhone(payload.clientPhone);
      name = bookingStore.normalizeName(payload.clientName);
    } catch (error) {
      sendError(req, res, error.statusCode || 400, error.message);
      return;
    }

    if ((await bookingStore.countRecentByEmail(email, publicWindowMs)) >= maxPublicRequestsPerEmail) {
      sendError(req, res, 429, "Ya tiene varias solicitudes en curso. Le escribiremos pronto.");
      return;
    }

    const date = String(payload.date || "");
    const time = String(payload.time || "");
    // Especialista elegida (opcional). Debe pertenecer a la sucursal; si no, se
    // rechaza para que nadie inyecte un nombre arbitrario en la agenda.
    const specialist = String(payload.specialist || "").trim();
    if (!publicBooking.isKnownSpecialist(state, branchId, specialist, date)) {
      sendError(req, res, 400, "Esa especialista no atiende en esta sucursal.");
      return;
    }
    // La especialista elegida debe poder hacer el servicio (su categoria coincide
    // con la del procedimiento). Evita agendar, por manipulacion del formulario,
    // a una manicurista para un facial.
    if (!publicBooking.specialistDoesProcedure(state, branchId, specialist, procedure)) {
      sendError(req, res, 400, "Esa especialista no realiza este servicio.");
      return;
    }

    let request;
    try {
      // Revalidar el cupo y crear la solicitud en el mismo turno del lock: los
      // pendientes se releen adentro para que dos reservas concurrentes no
      // pasen ambas la validacion antes de que cualquiera se guarde.
      request = await withBookingLock(async () => {
        const freshPending = await bookingStore.pendingForDay(branchId, date);
        const problem = publicBooking.validateSlot(state, branchId, date, time, procedure.duration, freshPending, Date.now(), specialist);
        if (problem) {
          const conflict = new Error(problem);
          conflict.statusCode = 409;
          throw conflict;
        }
        return bookingStore.createRequest({
          branchId,
          procedureId: procedure.id,
          procedureName: procedure.name,
          date,
          time,
          duration: procedure.duration,
          clientName: name,
          clientEmail: email,
          clientPhone: phone,
          notes: payload.notes,
          specialist,
          sourceIp: clientIp(req)
        });
      });
    } catch (error) {
      sendError(req, res, error.statusCode || 400, error.message || "No se pudo registrar la solicitud.");
      return;
    }

    // Los correos no bloquean la respuesta: la clienta ya reservo y no tiene
    // por que esperar a que Resend conteste. Si fallan, queda en la bitacora.
    const label = publicBranchLabel(branchId, state);
    mailer.sendRequestReceived(request, label).catch(() => {});
    mailer
      .sendStaffNewRequest(
        request,
        label,
        publicBooking.whatsappUrl(
          request.clientPhone,
          `Hola ${request.clientName.split(" ")[0]}, le escribimos de Chic & Co por su solicitud de ${request.procedureName}.`
        )
      )
      .catch(() => {});

    broadcastStateUpdated(null, ["bookingRequests"]);
    sendJson(req, res, 201, {
      ok: true,
      request: { id: request.id, date: request.date, time: request.time, status: request.status }
    });
    return;
  }

  // Solicitar un enlace de restablecimiento. Se responde 200 siempre (exista o
  // no el correo) para no revelar que cuentas existen. Con el mismo limitador
  // que las reservas, para que no se use como fuente de spam.
  if (pathname === "/api/public/password-reset/request" && req.method === "POST") {
    if (publicRateLimited(req)) {
      sendError(req, res, 429, "Demasiadas solicitudes. Intente de nuevo mas tarde.");
      return;
    }
    const payload = await readJsonBody(req);
    const email = String(payload.email || "").trim().toLowerCase();
    const genericOk = () => sendJson(req, res, 200, { ok: true });
    if (!email) return genericOk();

    const state = await ensureState();
    const user = (state.users || []).find(
      (item) => item.active !== false && String(item.email || "").trim().toLowerCase() === email
    );
    if (user) {
      try {
        const { token, minutes } = await passwordResetStore.create(user.id);
        const resetUrl = `${expectedOrigin(req)}/?reset=${encodeURIComponent(token)}`;
        // No bloquea la respuesta: el correo sale en segundo plano.
        mailer.sendPasswordReset({ to: user.email, name: user.name, resetUrl, minutes }).catch(() => {});
      } catch (error) {
        console.error("No se pudo crear el enlace de restablecimiento:", error.message);
      }
    }
    return genericOk();
  }

  // Confirmar el cambio con el token del correo.
  if (pathname === "/api/public/password-reset/confirm" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const token = String(payload.token || "");
    const password = String(payload.password || "");
    if (password.length < 10) {
      sendError(req, res, 400, "La contrasena debe tener al menos 10 caracteres.");
      return;
    }
    const userId = await passwordResetStore.consume(token);
    if (!userId) {
      sendError(req, res, 400, "El enlace no es valido o ya vencio. Solicita uno nuevo.");
      return;
    }
    const hash = await hashPasswordModernAsync(password);
    const ok = await setUserPasswordHash(userId, hash);
    if (!ok) {
      sendError(req, res, 500, "No se pudo cambiar la contrasena. Intenta de nuevo.");
      return;
    }
    // Cierra cualquier sesion vieja de esa cuenta.
    await destroySessionsForUser(userId);
    sendJson(req, res, 200, { ok: true });
    return;
  }

  sendError(req, res, 404, "Ruta publica no encontrada.");
}

/* -------------------------------------------------------------------------
 * Bandeja de solicitudes (lado del personal)
 * ---------------------------------------------------------------------- */

function nextAppointmentId(appointments) {
  const highest = (appointments || []).reduce((top, appointment) => {
    const match = String(appointment?.id || "").match(/^CIT-(\d+)$/);
    return match ? Math.max(top, Number(match[1])) : top;
  }, 0);
  return `CIT-${String(highest + 1).padStart(3, "0")}`;
}

// Inserta la cita en la sucursal que corresponde. El estado guarda cada
// coleccion dos veces -dentro de `branches` y en el nivel superior, que es el
// espejo de la sucursal abierta-, asi que hay que tocar las dos o la cita no
// aparece hasta el siguiente cambio de sucursal.
function appendAppointment(state, branchId, appointment) {
  const branch = (state.branches[branchId] = state.branches[branchId] || {});
  branch.appointments = [appointment, ...(branch.appointments || [])];
  if (state.currentBranchId === branchId) {
    state.appointments = [appointment, ...(state.appointments || [])];
  }
}

// Busca una clienta ya registrada por correo o telefono, para no duplicar la
// ficha cada vez que la misma persona reserva por la web.
function findClientByContact(state, branchId, email, phone) {
  const clients = state.branches?.[branchId]?.clients || [];
  const digits = String(phone || "").replace(/\D+/g, "").slice(-8);
  return (
    clients.find((client) => String(client.email || "").trim().toLowerCase() === email) ||
    clients.find((client) => String(client.phone || "").replace(/\D+/g, "").endsWith(digits)) ||
    null
  );
}

async function handleBookingInbox(req, res, url, session, pathname) {
  const state = await ensureState();
  const user = sessionUserFromState(state, session);

  if (!canWriteModule(user, "citas") && !isFullAccessUser(user)) {
    sendError(req, res, 403, "Este usuario no puede gestionar la agenda.");
    return;
  }

  // Sucursal a la que se limita esta cuenta ("all" = sin limite). Las
  // solicitudes de reserva son datos de la sede, asi que una recepcion atada
  // solo ve y resuelve las de su sucursal, nunca las de la otra.
  const bookingScope = branchScopeOf(user);

  if (pathname === "/api/bookings" && req.method === "GET") {
    const requestedBranch = String(url.searchParams.get("branchId") || "");
    // Una cuenta atada ignora el branchId que pida el navegador y usa el suyo:
    // no puede listar las solicitudes de otra sede pasando otro id en la URL.
    const effectiveBranch = bookingScope === "all" ? requestedBranch : bookingScope;
    const requests = await bookingStore.listRequests({
      branchId: effectiveBranch,
      status: String(url.searchParams.get("status") || ""),
      limit: Number(url.searchParams.get("limit") || 100)
    });
    sendJson(req, res, 200, {
      ok: true,
      requests: requests.map((request) => ({
        ...request,
        whatsappUrl: publicBooking.whatsappUrl(
          request.clientPhone,
          `Hola ${request.clientName.split(" ")[0]}, le escribimos de Chic & Co por su solicitud de ${request.procedureName}.`
        )
      }))
    });
    return;
  }

  const actionMatch = pathname.match(/^\/api\/bookings\/([\w-]{1,64})\/(confirm|reject)$/);
  if (!actionMatch || req.method !== "POST") {
    sendError(req, res, 404, "Ruta de solicitudes no encontrada.");
    return;
  }

  const [, requestId, action] = actionMatch;
  const payload = await readJsonBody(req);
  const existing = await bookingStore.getRequest(requestId);

  if (!existing) {
    sendError(req, res, 404, "Solicitud no encontrada.");
    return;
  }
  // Una cuenta atada a una sede no puede confirmar ni rechazar una solicitud de
  // otra sucursal, aunque conozca su id.
  if (bookingScope !== "all" && existing.branchId !== bookingScope) {
    sendError(req, res, 403, "Esa solicitud es de otra sucursal.");
    return;
  }
  if (existing.status !== "pending") {
    sendError(req, res, 409, "Esa solicitud ya fue resuelta por alguien mas.");
    return;
  }

  if (action === "reject") {
    const resolved = await bookingStore.resolveRequest(requestId, {
      status: "rejected",
      handledBy: user.id
    });
    if (!resolved) {
      sendError(req, res, 409, "Esa solicitud ya fue resuelta por alguien mas.");
      return;
    }
    mailer
      .sendRequestRejected(resolved, publicBranchLabel(resolved.branchId), String(payload.reason || ""))
      .catch(() => {});
    broadcastStateUpdated(session, ["bookingRequests"]);
    sendJson(req, res, 200, { ok: true, request: resolved });
    return;
  }

  // Recepcion confirma con una especialista; si no la indica, se toma la que la
  // clienta eligio al reservar en linea (cuando eligio alguna).
  const specialist = String(payload.specialist || "").trim() || String(existing.specialist || "").trim();
  if (!specialist) {
    sendError(req, res, 400, "Indique que especialista atendera la cita.");
    return;
  }

  // Se cierra la solicitud ANTES de escribir la cita. Si dos personas de
  // recepcion confirman a la vez, la segunda recibe null aqui y se va sin
  // crear una cita duplicada; el coste de fallar en este orden es una
  // solicitud cerrada sin cita, que se ve y se arregla. Al reves seria una
  // cita fantasma que nadie sabe de donde salio.
  const resolved = await bookingStore.resolveRequest(requestId, {
    status: "confirmed",
    handledBy: user.id
  });
  if (!resolved) {
    sendError(req, res, 409, "Esa solicitud ya fue resuelta por alguien mas.");
    return;
  }

  let created;
  try {
    created = await withStateLock(async () => {
      const currentState = await ensureState();
      const branchId = resolved.branchId;
      const branchAppointments = currentState.branches?.[branchId]?.appointments || [];
      const existingClient = findClientByContact(currentState, branchId, resolved.clientEmail, resolved.clientPhone);

      const nextState = cloneValue(currentState);
      let clientId = existingClient?.id || "";

      if (!clientId) {
        const branchClients = nextState.branches?.[branchId]?.clients || [];
        const highest = branchClients.reduce((top, client) => {
          const match = String(client?.id || "").match(/^CL-(\d+)$/);
          return match ? Math.max(top, Number(match[1])) : top;
        }, 0);
        clientId = `CL-${String(highest + 1).padStart(3, "0")}`;
        const newClient = {
          id: clientId,
          name: resolved.clientName,
          phone: `+${resolved.clientPhone}`,
          email: resolved.clientEmail,
          lastVisit: "",
          notes: "Registrada desde la agenda en linea."
        };
        nextState.branches[branchId] = nextState.branches[branchId] || {};
        nextState.branches[branchId].clients = [newClient, ...branchClients];
        if (nextState.currentBranchId === branchId) {
          nextState.clients = [newClient, ...(nextState.clients || [])];
        }
      }

      const appointment = {
        id: nextAppointmentId(branchAppointments),
        clientId,
        procedureId: resolved.procedureId,
        date: resolved.date,
        time: resolved.time,
        specialist,
        status: "Confirmada",
        duration: resolved.duration,
        notes: resolved.notes ? `Reserva en linea: ${resolved.notes}` : "Reserva en linea",
        bookingRequestId: resolved.id
      };

      appendAppointment(nextState, branchId, appointment);
      addAuditEntry(nextState, user, "booking.confirm", [`appointments:${appointment.id}`]);
      await writeState(stampRevision(nextState, currentState));
      return appointment;
    });
  } catch (error) {
    // La solicitud ya quedo confirmada pero la cita no entro. Se avisa con el
    // identificador para poder crearla a mano en vez de dejarlo en silencio.
    console.error(`No se pudo crear la cita de la solicitud ${resolved.id}:`, error.message);
    sendError(req, res, 500, "La solicitud se marco confirmada pero la cita no se pudo crear. Creela manualmente.");
    return;
  }

  mailer
    .sendRequestConfirmed(resolved, publicBranchLabel(resolved.branchId), specialist)
    .catch(() => {});
  broadcastStateUpdated(session, ["appointments", "clients", "bookingRequests"]);
  sendJson(req, res, 200, { ok: true, request: { ...resolved, appointmentId: created.id }, appointment: created });
}

// Identidad del negocio (nombre + logotipo). Solo un super usuario la cambia.
// El logo se guarda en el almacen de imagenes y su id vive en state.branding,
// que es texto minusculo y se sincroniza como parte del estado.
async function handleBrandingUpdate(req, res, session) {
  const state = await ensureState();
  const user = sessionUserFromState(state, session);
  if (!isSuperUser(user)) {
    sendError(req, res, 403, "Solo un super usuario puede cambiar la identidad del negocio.");
    return;
  }

  const payload = await readJsonBody(req);
  const name = String(payload.name || "").trim().slice(0, 80);
  let newLogoId = "";

  if (payload.dataUrl) {
    try {
      const saved = await mediaStore.saveImage({
        dataUrl: payload.dataUrl,
        kind: "branding",
        ownerId: "branding",
        userId: user.id
      });
      newLogoId = saved.id;
    } catch (error) {
      sendError(req, res, error.statusCode || 400, error.message || "No se pudo guardar el logotipo.");
      return;
    }
  }

  let previousLogoId = "";
  await withStateLock(async () => {
    const current = await ensureState();
    const branding = { ...(current.branding || {}) };
    previousLogoId = branding.logoId || "";
    if (name) branding.name = name;
    if (newLogoId) branding.logoId = newLogoId;
    if (payload.removeLogo) delete branding.logoId;
    branding.updatedAt = new Date().toISOString();

    const nextState = { ...current, branding };
    addAuditEntry(nextState, user, "branding.update", ["branding"]);
    await writeState(stampRevision(nextState, current));
  });

  // Si se reemplazo o quito el logo, el anterior deja de estar referenciado.
  if ((newLogoId || payload.removeLogo) && previousLogoId && previousLogoId !== newLogoId) {
    mediaStore.deleteImage(previousLogoId).catch(() => {});
  }

  broadcastStateUpdated(session, ["branding"]);
  const fresh = await ensureState();
  sendJson(req, res, 200, { ok: true, branding: fresh.branding || {} });
}

// Envia una factura ya guardada a Alegra y anota el resultado en la propia
// factura. La factura no cambia si el envio falla: solo se registra el intento.
async function handleInvoiceToAlegra(req, res, session, invoiceId) {
  const state = await ensureState();
  const user = sessionUserFromState(state, session);
  if (!canWriteModule(user, "facturacion") && !isFullAccessUser(user)) {
    sendError(req, res, 403, "Este usuario no puede facturar.");
    return;
  }
  if (!alegra.isConfigured()) {
    sendError(req, res, 400, "Alegra no esta configurado. Defina ALEGRA_EMAIL y ALEGRA_TOKEN.");
    return;
  }

  const payload = await readJsonBody(req);
  const branchId = String(payload.branchId || state.currentBranchId || "");

  // La factura y sus datos relacionados viven en la sucursal.
  const findInBranch = (data) => (data?.invoices || []).find((invoice) => invoice.id === invoiceId);
  let branch = state.branches?.[branchId];
  let invoice = findInBranch(branch);
  let resolvedBranchId = branchId;
  if (!invoice) {
    for (const [id, data] of Object.entries(state.branches || {})) {
      const found = findInBranch(data);
      if (found) {
        invoice = found;
        branch = data;
        resolvedBranchId = id;
        break;
      }
    }
  }

  if (!invoice) {
    sendError(req, res, 404, "Factura no encontrada.");
    return;
  }
  // Una cuenta atada a una sede no puede enviar a Alegra una factura de otra
  // sucursal, aunque la busqueda la haya encontrado recorriendo todas.
  if (!userCanAccessBranch(user, resolvedBranchId)) {
    sendError(req, res, 403, "Esa factura es de otra sucursal.");
    return;
  }
  if (invoice.alegra?.status === "sent") {
    sendJson(req, res, 200, { ok: true, alegra: invoice.alegra, alreadySent: true });
    return;
  }

  const client = (branch.clients || []).find((item) => item.id === invoice.clientId) || {};
  const procedure = (branch.procedures || []).find((item) => item.id === invoice.procedureId) || {};
  const product = (branch.products || []).find((item) => item.id === invoice.productId) || {};

  const result = await alegra.sendInvoice(invoice, {
    clientName: client.name,
    clientEmail: client.email,
    clientPhone: client.phone,
    clientIdentification: client.identification || client.cedula,
    procedureName: procedure.name,
    productName: product.name
  });

  const record = result.ok
    ? { status: "sent", alegraId: result.alegraId, number: result.number, url: result.url, sentAt: new Date().toISOString() }
    : { status: "error", reason: result.reason || "Fallo el envio", sentAt: new Date().toISOString() };

  await withStateLock(async () => {
    const current = await ensureState();
    const nextState = cloneValue(current);
    const targetBranch = nextState.branches?.[resolvedBranchId];
    const applyTo = (list) => {
      const item = (list || []).find((entry) => entry.id === invoiceId);
      if (item) item.alegra = record;
    };
    applyTo(targetBranch?.invoices);
    if (nextState.currentBranchId === resolvedBranchId) applyTo(nextState.invoices);
    addAuditEntry(nextState, user, result.ok ? "alegra.sent" : "alegra.error", [`invoices:${invoiceId}`]);
    await writeState(stampRevision(nextState, current));
  });

  broadcastStateUpdated(session, ["invoices"]);
  if (result.ok) sendJson(req, res, 200, { ok: true, alegra: record });
  else sendError(req, res, 502, record.reason);
}

// Configuracion de Alegra desde la app. Solo un administrador la ve o cambia.
// El token nunca sale en claro: la vista publica solo dice si existe y una
// pista. Al guardar se persiste fuera del estado y se reconfigura el adaptador
// en caliente, sin redeployar.
async function handleAlegraConfig(req, res, session) {
  const state = await ensureState();
  const user = sessionUserFromState(state, session);
  if (!isFullAccessUser(user)) {
    sendError(req, res, 403, "Solo un administrador puede ver o cambiar la conexion con Alegra.");
    return;
  }

  if (req.method === "GET") {
    sendJson(req, res, 200, { ok: true, config: alegra.currentConfig() });
    return;
  }

  const payload = await readJsonBody(req);
  const stored = await alegraConfigStore.save({
    email: payload.email,
    token: payload.token,
    taxId: payload.taxId,
    endpoint: payload.endpoint,
    clearToken: Boolean(payload.clearToken)
  });
  alegra.configure({ ...stored, clearToken: Boolean(payload.clearToken) });
  sendJson(req, res, 200, { ok: true, config: alegra.currentConfig() });
}

// Pixeles de marketing. Solo un administrador los ve o cambia. Los ids no son
// secretos, pero centralizarlos aqui evita tocar codigo para conectar Meta,
// Google o TikTok.
async function handleTrackingConfig(req, res, session) {
  const state = await ensureState();
  const user = sessionUserFromState(state, session);
  if (!isFullAccessUser(user)) {
    sendError(req, res, 403, "Solo un administrador puede ver o cambiar los pixeles de marketing.");
    return;
  }

  if (req.method === "GET") {
    sendJson(req, res, 200, { ok: true, config: { ...trackingConfig } });
    return;
  }

  const payload = await readJsonBody(req);
  const clean = sanitizeTrackingConfig(payload);
  const stored = await settingsStore.save("tracking", clean);
  Object.assign(trackingConfig, sanitizeTrackingConfig(stored));
  sendJson(req, res, 200, { ok: true, config: { ...trackingConfig } });
}

// Prueba la conexion con las credenciales vigentes sin emitir ninguna factura.
async function handleAlegraTest(req, res, session) {
  const state = await ensureState();
  const user = sessionUserFromState(state, session);
  if (!isFullAccessUser(user)) {
    sendError(req, res, 403, "Solo un administrador puede probar la conexion con Alegra.");
    return;
  }
  const result = await alegra.testConnection();
  sendJson(req, res, result.ok ? 200 : 400, { ok: result.ok, result });
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
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

  // Agenda publica. Es la unica parte del sistema sin sesion, asi que es
  // tambien la unica superficie que un desconocido puede tocar: todo lo que
  // hay debajo esta limitado por peticion, validado y escrito en una tabla
  // aparte, nunca en el documento de estado.
  if (pathname.startsWith("/api/public/")) {
    await handlePublicBooking(req, res, url);
    return;
  }

  // Reporte de fin de dia. No lleva sesion porque quien la invoca es un Cron
  // Job, no una persona: se autentica con un secreto compartido comparado en
  // tiempo constante. Sin CHIC_REPORT_SECRET definido, la ruta no existe.
  if (pathname === "/api/reports/daily" && req.method === "POST") {
    const secret = String(process.env.CHIC_REPORT_SECRET || "");
    if (!secret) {
      sendError(req, res, 404, "Ruta de API no encontrada.");
      return;
    }
    if (!timingSafeEqualText(String(req.headers["x-report-secret"] || ""), secret)) {
      sendError(req, res, 401, "Secreto invalido.");
      return;
    }

    const state = await ensureState();
    const result = await dailyReport.sendReportFor(state, dailyReport.localParts().date, branchLabels, {
      force: true
    });
    sendJson(req, res, result.ok ? 200 : 202, { ok: result.ok, detail: result.reason || "" });
    return;
  }

  // El token por query solo se acepta donde el navegador no puede poner
  // cabeceras: el `src` de una imagen y el EventSource del tiempo real. En el
  // resto de rutas se exige Authorization, porque los query strings quedan
  // escritos en los registros del proxy y en el historial del navegador.
  const allowsQueryToken =
    req.method === "GET" && (pathname === "/api/events" || pathname.startsWith("/api/media/"));
  const session = (await sessionFromRequest(req)) || (allowsQueryToken ? await sessionFromQuery(url) : null);
  if (!session) {
    sendError(req, res, 401, "Sesion requerida.");
    return;
  }

  if (pathname === "/api/events" && req.method === "GET") {
    handleRealtimeEvents(req, res, session);
    return;
  }

  if (pathname === "/api/bookings" || pathname.startsWith("/api/bookings/")) {
    await handleBookingInbox(req, res, url, session, pathname);
    return;
  }

  if (pathname === "/api/branding" && req.method === "POST") {
    await handleBrandingUpdate(req, res, session);
    return;
  }

  if (pathname === "/api/integrations" && req.method === "GET") {
    sendJson(req, res, 200, {
      ok: true,
      integrations: {
        alegra: { configured: alegra.isConfigured() },
        correo: { configured: mailer.isConfigured() }
      }
    });
    return;
  }

  if (pathname === "/api/alegra/config" && (req.method === "GET" || req.method === "PUT")) {
    await handleAlegraConfig(req, res, session);
    return;
  }

  if (pathname === "/api/alegra/test" && req.method === "POST") {
    await handleAlegraTest(req, res, session);
    return;
  }

  if (pathname === "/api/tracking/config" && (req.method === "GET" || req.method === "PUT")) {
    await handleTrackingConfig(req, res, session);
    return;
  }

  const alegraMatch = pathname.match(/^\/api\/invoices\/([\w-]{1,40})\/alegra$/);
  if (alegraMatch && req.method === "POST") {
    await handleInvoiceToAlegra(req, res, session, alegraMatch[1]);
    return;
  }

  if (pathname === "/api/reports/daily/preview" && req.method === "POST") {
    const state = await ensureState();
    const user = sessionUserFromState(state, session);
    if (!isFullAccessUser(user)) {
      sendError(req, res, 403, "Solo un administrador puede enviar el reporte.");
      return;
    }
    const result = await dailyReport.sendReportFor(state, dailyReport.localParts().date, branchLabels, {
      force: true
    });
    sendJson(req, res, 200, {
      ok: result.ok,
      detail: result.reason || "",
      mailer: { configured: mailer.isConfigured(), recipients: mailer.staffRecipients.length },
      deliveries: mailer.recentDeliveries().slice(0, 10)
    });
    return;
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    await destroySession(session.token);
    sendJson(req, res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/password" && req.method === "POST") {
    await handlePasswordChange(req, res, session);
    return;
  }

  if (pathname === "/api/media" && req.method === "POST") {
    await handleMediaUpload(req, res, session);
    return;
  }

  if (pathname.startsWith("/api/media/") && (req.method === "GET" || req.method === "DELETE")) {
    await handleMediaItem(req, res, session, pathname.slice("/api/media/".length));
    return;
  }

  if (pathname === "/api/state" && req.method === "GET") {
    const state = await hydrateForClient(await ensureState());
    const user = sessionUserFromState(state, session);
    // Una cuenta desactivada (o borrada) pierde el acceso de lectura de
    // inmediato, sin esperar a que expire su token de 8 horas.
    if (!user?.active) {
      await destroySession(session.token);
      sendError(req, res, 401, "Sesion vencida. Ingrese de nuevo.");
      return;
    }
    // Primero se recorta a la sucursal del usuario (una cuenta atada nunca
    // recibe datos de otra sede) y luego se limpian los hashes.
    const safe = stripSensitiveState(scopeStateForUser(state, user));
    // La bitacora de auditoria es solo para administradores (igual que
    // /api/audit). No debe viajar en el estado a una cuenta de recepcion.
    if (!isFullAccessUser(user)) delete safe.auditLog;
    // La planilla (comisiones, beneficios, vacaciones) es datos sensibles del
    // personal: no viaja a quien no tenga acceso a RRHH, ni siquiera en crudo.
    if (!hasPayrollAccess(user)) payrollCollections.forEach((collection) => delete safe[collection]);
    sendJson(req, res, 200, { ok: true, state: safe });
    return;
  }

  if (pathname === "/api/backup" && req.method === "GET") {
    const state = await ensureState();
    const user = sessionUserFromState(state, session);
    if (!isSuperUser(user)) {
      sendError(req, res, 403, "Solo un super usuario puede exportar respaldos.");
      return;
    }
    // El respaldo debe incluir las colecciones de overlay, no solo el documento.
    await hydrateForClient(state);
    sendJson(req, res, 200, { ok: true, backup: backupPayload(state) });
    return;
  }

  if (pathname === "/api/backup" && req.method === "POST") {
    const currentState = await ensureState();
    const user = sessionUserFromState(currentState, session);
    if (!isSuperUser(user)) {
      sendError(req, res, 403, "Solo un super usuario puede importar respaldos.");
      return;
    }

    const payload = await readJsonBody(req);
    const nextState = payload.state || payload.backup?.state || payload;
    if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
      sendError(req, res, 400, "Respaldo invalido.");
      return;
    }

    let collections;
    try {
      collections = await withStateLock(async () => {
        const freshState = await ensureState();
        const restoredState = preserveProtectedState(nextState, freshState);
        const changed = changedCollections(restoredState, freshState);
        addAuditEntry(restoredState, user, "backup.restore", changed);
        await writeState(stampRevision(restoredState, freshState));
        return changed;
      });
    } catch (error) {
      sendError(req, res, error.statusCode || 400, error.message || "Respaldo invalido.");
      return;
    }

    broadcastStateUpdated(session, collections);
    sendJson(req, res, 200, { ok: true });
    return;
  }

  // Empezar de cero: borra TODOS los datos operativos (clientes, inventario,
  // procedimientos, citas, facturas, planes, movimientos, planilla y
  // solicitudes de reserva) y deja las sucursales vacias. CONSERVA las cuentas
  // de usuario, la identidad del negocio (branding) y la bitacora. Solo super.
  if (pathname === "/api/reset" && req.method === "POST") {
    const currentUser0 = sessionUserFromState(await ensureState(), session);
    if (!isSuperUser(currentUser0)) {
      sendError(req, res, 403, "Solo un super usuario puede borrar todos los datos.");
      return;
    }
    // Doble confirmacion explicita: el cuerpo debe traer confirm:"BORRAR".
    const payload = await readJsonBody(req);
    if (String(payload.confirm || "") !== "BORRAR") {
      sendError(req, res, 400, "Confirmacion invalida.");
      return;
    }

    try {
      await withStateLock(async () => {
        const freshState = await ensureState();
        const emptyBranches = Object.keys(freshState.branches || {}).reduce((branches, branchId) => {
          branches[branchId] = emptyBranchData();
          return branches;
        }, {});
        // Si por alguna razon no hubiera sucursales, se recrean las conocidas.
        if (!Object.keys(emptyBranches).length) {
          branchIds.forEach((id) => (emptyBranches[id] = emptyBranchData()));
        }
        const resetState = {
          ...emptyBranchData(), // espejo de nivel superior vacio
          currentBranchId: freshState.currentBranchId || branchIds[0],
          currentUserId: freshState.currentUserId,
          users: freshState.users, // se conservan las cuentas
          branding: freshState.branding, // y la identidad del negocio
          staff: [],
          commissions: [],
          benefits: [],
          vacations: [],
          branches: emptyBranches,
          auditLog: Array.isArray(freshState.auditLog) ? freshState.auditLog : []
        };
        addAuditEntry(resetState, currentUser0, "state.reset", [...branchDataCollections, ...payrollCollections]);
        // Las tablas overlay nunca borran solas: hay que purgarlas o los datos
        // rehidratarian el estado que acabamos de vaciar.
        for (const collection of overlayCollections) {
          try {
            await collectionStore.purge(collection);
          } catch (error) {
            console.error(`No se pudo purgar ${collection} al empezar de cero:`, error.message);
          }
        }
        await writeState(stampRevision(resetState, freshState));
      });
      // Las solicitudes de reserva viven en su propia tabla.
      try {
        await bookingStore.purgeAll();
      } catch (error) {
        console.error("No se pudieron borrar las solicitudes de reserva:", error.message);
      }
    } catch (error) {
      sendError(req, res, error.statusCode || 500, error.message || "No se pudo borrar los datos.");
      return;
    }

    broadcastStateUpdated(session, [...branchDataCollections, ...payrollCollections]);
    sendJson(req, res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/audit" && req.method === "GET") {
    const state = await ensureState();
    const user = sessionUserFromState(state, session);
    if (!isFullAccessUser(user)) {
      sendError(req, res, 403, "Solo usuarios administradores pueden ver la bitacora.");
      return;
    }
    sendJson(req, res, 200, { ok: true, auditLog: Array.isArray(state.auditLog) ? state.auditLog : [] });
    return;
  }

  if (pathname === "/api/state" && req.method === "PUT") {
    const payload = await readJsonBody(req);
    const nextState = payload.state || payload;

    if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
      sendError(req, res, 400, "Estado invalido.");
      return;
    }

    // Control de concurrencia optimista: sin esto, dos personas guardando con
    // segundos de diferencia hacen que la segunda escritura borre la primera.
    // `baseRevision` es obligatorio: omitirlo saltaba el control entero, asi
    // que un cliente desactualizado pisaba en silencio lo de los demas. Si
    // falta o no coincide se responde 409 con el estado vigente, que es lo que
    // el navegador ya sabe fusionar y reintentar.
    let result;
    try {
      result = await withStateLock(async () => {
        const currentState = await ensureState();
        const currentRevision = stateRevision(currentState);

        if (payload.baseRevision === undefined || Number(payload.baseRevision) !== currentRevision) {
          return { conflict: true, currentState, currentRevision };
        }

        const writableState = applyWritePolicy(nextState, currentState, session);
        const collections = changedCollections(writableState, currentState);
        const savedState = stampRevision(writableState, currentState);

        if (!(await writeStateIfRevision(savedState, currentRevision))) {
          const freshState = await ensureState();
          return { conflict: true, currentState: freshState, currentRevision: stateRevision(freshState) };
        }

        return { savedState, collections };
      });
    } catch (error) {
      sendError(req, res, error.statusCode || 403, error.message || "No tiene permiso para guardar esos cambios.");
      return;
    }

    if (result.conflict) {
      // El estado que se devuelve para fusionar debe traer las colecciones de
      // overlay, o el cliente creeria que se vaciaron.
      await hydrateForClient(result.currentState);
      // Tambien el estado del conflicto se recorta a la sucursal del usuario:
      // una cuenta atada no puede ver la otra sede ni siquiera en la respuesta
      // 409 que usa para fusionar.
      const conflictUser = sessionUserFromState(result.currentState, session);
      const conflictState = stripSensitiveState(scopeStateForUser(result.currentState, conflictUser));
      if (!hasPayrollAccess(conflictUser)) payrollCollections.forEach((collection) => delete conflictState[collection]);
      sendJson(req, res, 409, {
        ok: false,
        code: "STATE_CONFLICT",
        message: "Otro usuario guardo primero. Vuelva a cargar los datos antes de guardar.",
        stateRevision: result.currentRevision,
        state: conflictState
      });
      return;
    }

    // Si un producto con foto se elimina o se le cambia la imagen, el archivo
    // anterior deja de estar referenciado y no debe quedarse ocupando espacio.
    if (result.collections.some((name) => name.endsWith("products"))) {
      mediaStore
        .collectOrphans(referencedImageIds(result.savedState))
        .catch((error) => console.error("No se pudieron limpiar imágenes huérfanas:", error.message));
    }

    broadcastStateUpdated(session, result.collections);
    sendJson(req, res, 200, { ok: true, stateRevision: stateRevision(result.savedState) });
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

  if (relativePath === "backend" || relativePath.startsWith("backend/")) {
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
      await handleApi(req, res, url);
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

if (require.main === module) {
  server.listen(port, host, () => {
    console.log(`Chic & Co backend listo en http://${host}:${port}`);
  });
}

// La configuracion de Alegra guardada en la app manda sobre las variables de
// entorno: se carga al arrancar para que el envio use las credenciales que el
// negocio conecto desde la interfaz.
async function loadStoredAlegraConfig() {
  try {
    const stored = await alegraConfigStore.load();
    if (stored) alegra.configure(stored);
  } catch (error) {
    console.error("No se pudo cargar la configuracion de Alegra:", error.message);
  }
}

async function loadStoredTrackingConfig() {
  try {
    const stored = await settingsStore.load("tracking");
    if (stored) Object.assign(trackingConfig, sanitizeTrackingConfig(stored));
  } catch (error) {
    console.error("No se pudo cargar la configuracion de pixeles:", error.message);
  }
}

// El temporizador se enciende una sola vez, cuando el servidor empieza a oir.
server.on("listening", () => {
  loadStoredAlegraConfig();
  loadStoredTrackingConfig();
  // El estado para el reporte y el respaldo se entrega hidratado, para que la
  // instantanea incluya las colecciones que viven en tablas de overlay.
  dailyReport.startScheduler(async () => hydrateForClient(await ensureState()), branchLabels);
});

module.exports = {
  server,
  port,
  host,
  applyWritePolicy,
  changedCollections,
  preserveProtectedState,
  stripSensitiveState,
  applySystemUserAuth,
  // Expuestos para las pruebas y para cualquier capa que quiera leer el estado
  // sin autenticarse por HTTP contra su propio proceso.
  ensureState,
  readState,
  sessionFromRequest,
  sessionFromQuery,
  sessionUserFromState,
  isSuperUser,
  isFullAccessUser,
  hashPassword,
  hashPasswordModern,
  hashPasswordModernAsync,
  verifyPassword,
  verifyPasswordAsync,
  assertPersistableState,
  clientIp,
  stateRevision,
  stampRevision,
  bootstrapState,
  referencedImageIds,
  mergeStockOnlyProducts,
  sanitizeTrackingConfig,
  clampUserRoles,
  guardUserDeletions,
  contentSecurityPolicy,
  branchScopeOf,
  userCanAccessBranch,
  allowedBranchSet,
  scopeStateForUser,
  hasPayrollAccess,
  payrollCollections,
  // El esquema de sucursales y colecciones se exporta para que una prueba de
  // paridad verifique que el cliente (app.js: branchDataKeys / branchOptions)
  // no se desincronice del servidor. Una divergencia hace que una coleccion
  // deje de persistir en silencio: exactamente lo que no queremos al escalar.
  branchDataCollections,
  branchIds,
  moduleWriteCollections
};
