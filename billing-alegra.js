// Envio de facturas a Alegra desde el modulo de Facturacion.
//
// El adaptador vive en el servidor (backend/alegra.js). Aqui solo se dispara el
// envio de una factura por su boton y se refleja el resultado. Si Alegra no
// esta configurado, el servidor responde con un mensaje claro y se muestra.

(function () {
  if (window.__chicBillingAlegra) return;
  window.__chicBillingAlegra = true;

  let integrations = null;

  async function loadIntegrations() {
    if (integrations || typeof backendRequest !== "function") return integrations;
    try {
      const result = await backendRequest("/integrations", { cache: "no-store" });
      integrations = result?.integrations || {};
    } catch (error) {
      integrations = {};
    }
    return integrations;
  }

  async function sendInvoice(invoiceId, button) {
    if (typeof backendRequest !== "function") return;

    const info = await loadIntegrations();
    if (info && info.alegra && info.alegra.configured === false) {
      if (typeof showToast === "function") {
        showToast("Alegra no esta configurado todavia. Falta poner las credenciales.");
      }
      return;
    }

    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Enviando...";

    try {
      const result = await backendRequest(`/invoices/${encodeURIComponent(invoiceId)}/alegra`, {
        method: "POST",
        body: JSON.stringify({ branchId: state?.currentBranchId || "" })
      });
      // El servidor guardo el resultado en la factura; se refresca el estado
      // para que la celda muestre el numero de Alegra.
      if (typeof refreshStateFromBackend === "function") await refreshStateFromBackend({ render: true });
      if (typeof showToast === "function") {
        showToast(result?.alegra?.number ? `Enviada a Alegra: ${result.alegra.number}` : "Factura enviada a Alegra");
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      if (typeof showToast === "function") showToast(error.message || "No se pudo enviar a Alegra");
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-alegra-send]");
    if (!button) return;
    event.preventDefault();
    sendInvoice(button.dataset.alegraSend, button);
  });

  const style = document.createElement("style");
  style.textContent = `
    .alegra-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 600;
      text-decoration: none;
    }
    .alegra-badge.is-sent { color: var(--ok); background: var(--ok-soft); }
    a.alegra-badge.is-sent:hover { text-decoration: underline; }
    .alegra-send.is-retry { color: var(--crit); border-color: var(--crit-soft); }
    .alegra-note { display: block; margin-top: 3px; color: var(--ink-3); font-size: 11px; }
  `;
  document.head.appendChild(style);
})();
