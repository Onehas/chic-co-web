"use strict";

// Adaptador de facturacion electronica para Alegra (https://www.alegra.com).
//
// "Preparado para conectar": el mapeo de una factura interna al formato de
// Alegra esta completo y probado contra un servidor simulado. Para encenderlo
// en produccion solo faltan las credenciales reales del negocio:
//
//   ALEGRA_EMAIL   correo de la cuenta de Alegra
//   ALEGRA_TOKEN   token de API (Configuracion -> API en Alegra)
//   ALEGRA_TAX_ID  (opcional) id del impuesto IVA 13% en esa cuenta; si se
//                  define, se envia como referencia de impuesto en cada linea
//
// Se llama con fetch, sin dependencias nuevas. Un fallo de Alegra nunca tumba
// la operacion: la factura ya quedo guardada en el sistema; lo que se registra
// es que el envio externo fallo, para reintentarlo.

const defaultEndpoint = "https://api.alegra.com/api/v1";
const requestTimeoutMs = 15000;

// Configuracion viva. Arranca desde las variables de entorno (compatibilidad)
// pero se puede sobreescribir en caliente desde la app con `configure()`, para
// que el negocio conecte Alegra sin tocar el servidor ni redeployar.
const config = {
  email: process.env.ALEGRA_EMAIL || "",
  token: process.env.ALEGRA_TOKEN || "",
  taxId: process.env.ALEGRA_TAX_ID || "",
  endpoint: process.env.ALEGRA_ENDPOINT || defaultEndpoint
};

// Aplica una configuracion guardada. Un campo ausente o vacio no pisa lo que ya
// habia (asi el token no se borra al guardar solo el correo), salvo que se pase
// explicitamente la bandera para limpiarlo.
function configure(next = {}) {
  if (typeof next.email === "string") config.email = next.email.trim();
  if (typeof next.token === "string" && next.token) config.token = next.token.trim();
  if (next.clearToken) config.token = "";
  if (typeof next.taxId === "string") config.taxId = next.taxId.trim();
  if (typeof next.endpoint === "string") {
    config.endpoint = next.endpoint.trim() || defaultEndpoint;
  }
  return currentConfig();
}

// Vista sin secretos para la app: nunca sale el token en claro, solo si existe
// y una pista de sus ultimos caracteres para reconocerlo.
function currentConfig() {
  return {
    configured: isConfigured(),
    email: config.email,
    taxId: config.taxId,
    endpoint: config.endpoint,
    hasToken: Boolean(config.token),
    tokenHint: config.token ? `****${config.token.slice(-4)}` : ""
  };
}

const deliveryLog = [];
const deliveryLogLimit = 50;

function isConfigured() {
  return Boolean(config.email && config.token);
}

function authHeader() {
  return `Basic ${Buffer.from(`${config.email}:${config.token}`).toString("base64")}`;
}

// Comprueba las credenciales contra Alegra sin emitir nada: pide los datos de
// la empresa. 200 = conecta; 401 = credenciales malas; otro = problema de red o
// del servicio. Asi el usuario sabe si quedo bien conectado antes de facturar.
async function testConnection() {
  if (!isConfigured()) return { ok: false, reason: "Falta el correo o el token." };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${config.endpoint}/company`, {
      method: "GET",
      headers: { Authorization: authHeader(), Accept: "application/json" },
      signal: controller.signal
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: response.status, reason: "Credenciales rechazadas por Alegra." };
    }
    if (!response.ok) {
      return { ok: false, status: response.status, reason: `Alegra respondio HTTP ${response.status}.` };
    }
    const payload = await response.json().catch(() => ({}));
    return { ok: true, status: response.status, name: String(payload?.name || "") };
  } catch (error) {
    const reason = error.name === "AbortError" ? "Tiempo de espera agotado." : error.message;
    return { ok: false, reason };
  } finally {
    clearTimeout(timeout);
  }
}

function recordDelivery(entry) {
  deliveryLog.unshift({ at: new Date().toISOString(), ...entry });
  deliveryLog.length = Math.min(deliveryLog.length, deliveryLogLimit);
}

function recentDeliveries() {
  return deliveryLog.slice(0, deliveryLogLimit);
}

// Metodos de pago del sistema -> valores que entiende Alegra.
function mapPaymentMethod(method) {
  return method === "Tarjeta" ? "debit-card" : "cash";
}

// Traduce una factura interna al cuerpo que espera la API de Alegra. Se expone
// aparte para poder probar el mapeo sin llamar a la red.
function mapInvoiceToAlegra(invoice, context = {}) {
  const items = [];

  const serviceAmount = Number(invoice.serviceAmount || 0);
  if (serviceAmount > 0) {
    items.push(buildItem(context.procedureName || "Servicio estetico", serviceAmount, 1, invoice.ivaRate));
  }

  const productAmount = Number(invoice.productAmount || 0);
  if (productAmount > 0) {
    const quantity = Number(invoice.productQty || 1) || 1;
    // Alegra multiplica precio x cantidad; se reparte el monto total entre las
    // unidades para que el total de la linea coincida con lo cobrado.
    items.push(buildItem(context.productName || "Producto", productAmount / quantity, quantity, invoice.ivaRate));
  }

  if (!items.length) {
    // Una factura sin montos igual necesita al menos una linea para Alegra.
    items.push(buildItem(context.procedureName || "Servicio", 0, 1, invoice.ivaRate));
  }

  const client = {
    name: context.clientName || "Cliente de mostrador"
  };
  if (context.clientIdentification) client.identification = context.clientIdentification;
  if (context.clientEmail) client.email = context.clientEmail;
  if (context.clientPhone) client.phonePrimary = context.clientPhone;

  return {
    date: invoice.date,
    dueDate: invoice.date,
    client,
    items,
    paymentMethod: mapPaymentMethod(invoice.paymentMethod),
    anotation: invoice.notes || "",
    status: "open",
    // Marca de origen para poder reconciliar en Alegra.
    termsConditions: `Chic & Co #${invoice.id}`
  };
}

function buildItem(name, price, quantity, ivaRate) {
  const item = {
    name: String(name).slice(0, 200),
    price: Math.round(Number(price || 0) * 100) / 100,
    quantity: Number(quantity || 1)
  };
  // El id de impuesto es especifico de cada cuenta de Alegra; si no se
  // configura, se envia el porcentaje para que quede documentado el IVA.
  if (config.taxId) item.tax = [{ id: config.taxId }];
  else if (Number(ivaRate) > 0) item.tax = [{ percentage: Number(ivaRate) }];
  return item;
}

async function sendInvoice(invoice, context = {}) {
  if (!isConfigured()) {
    recordDelivery({ ok: false, invoiceId: invoice.id, reason: "Alegra no esta configurado" });
    return { ok: false, skipped: true, reason: "Alegra no esta configurado" };
  }

  const body = mapInvoiceToAlegra(invoice, context);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`${config.endpoint}/invoices`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason =
        payload?.message || payload?.error || (Array.isArray(payload?.errors) ? payload.errors[0]?.message : "") || `HTTP ${response.status}`;
      recordDelivery({ ok: false, invoiceId: invoice.id, reason });
      return { ok: false, reason };
    }

    const result = {
      ok: true,
      alegraId: String(payload?.id || ""),
      number: String(payload?.numberTemplate?.fullNumber || payload?.number || ""),
      url: String(payload?.pdf || payload?.permalink || "")
    };
    recordDelivery({ ok: true, invoiceId: invoice.id, alegraId: result.alegraId });
    return result;
  } catch (error) {
    const reason = error.name === "AbortError" ? "tiempo de espera agotado" : error.message;
    recordDelivery({ ok: false, invoiceId: invoice.id, reason });
    return { ok: false, reason };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  isConfigured,
  configure,
  currentConfig,
  testConnection,
  mapPaymentMethod,
  mapInvoiceToAlegra,
  buildItem,
  sendInvoice,
  recentDeliveries
};
