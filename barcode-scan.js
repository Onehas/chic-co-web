// Escaneo de codigos de barras con la camara del telefono.
//
// Usa html5-qrcode (vendorizado en /vendor, se sirve desde el propio dominio y
// funciona sin conexion, tambien en Safari de iPhone). La libreria es pesada
// (~370 KB), asi que se carga bajo demanda la primera vez que se abre el
// escaner: no pesa en cada carga del sistema.
//
// Uso:  openBarcodeScanner((codigo) => { ... })
// El callback recibe el texto del codigo leido; el escaner se cierra solo.

(() => {
  "use strict";

  const LIB_URL = "vendor/html5-qrcode.min.js";
  let libPromise = null;

  function toast(message) {
    if (typeof window.showToast === "function") window.showToast(message);
  }

  // Carga la libreria una sola vez. Se cachea la promesa para no re-inyectar el
  // script si se abre el escaner varias veces.
  function loadLibrary() {
    if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = LIB_URL;
      script.async = true;
      script.onload = () => {
        const lib = window.Html5Qrcode || (window.__Html5QrcodeLibrary__ && window.__Html5QrcodeLibrary__.Html5Qrcode);
        if (lib) resolve(lib);
        else reject(new Error("La libreria de escaneo no cargo bien."));
      };
      script.onerror = () => {
        libPromise = null; // permitir reintento
        reject(new Error("No se pudo cargar el escaner. Revisa tu conexion."));
      };
      document.head.appendChild(script);
    });
    return libPromise;
  }

  function supportedFormats() {
    const F = window.Html5QrcodeSupportedFormats || (window.__Html5QrcodeLibrary__ && window.__Html5QrcodeLibrary__.Html5QrcodeSupportedFormats);
    if (!F) return undefined; // sin filtro: intenta todos
    // Los codigos tipicos de producto (1D) mas QR, por si etiquetan con QR.
    return [
      F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.UPC_EAN_EXTENSION,
      F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.CODABAR, F.QR_CODE
    ].filter((value) => value !== undefined);
  }

  let activeScanner = null;
  let activeOverlay = null;

  async function stopActive() {
    const scanner = activeScanner;
    const overlay = activeOverlay;
    activeScanner = null;
    activeOverlay = null;
    if (scanner) {
      try { await scanner.stop(); } catch (error) { /* ya estaba detenido */ }
      try { scanner.clear(); } catch (error) { /* nada que limpiar */ }
    }
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.removeEventListener("keydown", onKey, true);
  }

  function onKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      stopActive();
    }
  }

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "scan-overlay";
    overlay.innerHTML = `
      <div class="scan-modal" role="dialog" aria-modal="true" aria-label="Escanear codigo de barras">
        <div class="scan-head">
          <strong>Escanear codigo</strong>
          <button type="button" class="scan-close" aria-label="Cerrar">&times;</button>
        </div>
        <div class="scan-reader" id="scanReader"></div>
        <div class="scan-hint">Apunta la camara al codigo de barras del producto. Se lee solo.</div>
        <div class="scan-actions">
          <label class="scan-camera-pick" hidden>Camara <select class="scan-camera-select"></select></label>
        </div>
      </div>`;
    return overlay;
  }

  // Abre el escaner. `onDetected(text)` se llama una vez, con el primer codigo
  // valido; luego el escaner se cierra.
  async function openBarcodeScanner(onDetected) {
    if (activeScanner) return; // ya hay uno abierto
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Este navegador no permite usar la camara.");
      return;
    }

    let Html5Qrcode;
    try {
      Html5Qrcode = await loadLibrary();
    } catch (error) {
      toast(error.message || "No se pudo cargar el escaner.");
      return;
    }

    const overlay = buildOverlay();
    document.body.appendChild(overlay);
    activeOverlay = overlay;
    overlay.querySelector(".scan-close").addEventListener("click", stopActive);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) stopActive();
    });
    document.addEventListener("keydown", onKey, true);

    const scanner = new Html5Qrcode("scanReader", { formatsToSupport: supportedFormats(), verbose: false });
    activeScanner = scanner;

    let handled = false;
    const onSuccess = (decodedText) => {
      if (handled) return;
      handled = true;
      // Vibra si el telefono lo soporta: confirmacion tactil de lectura.
      try { navigator.vibrate && navigator.vibrate(60); } catch (error) { /* opcional */ }
      const value = String(decodedText || "").trim();
      stopActive().then(() => {
        if (value && typeof onDetected === "function") onDetected(value);
      });
    };

    const config = {
      fps: 10,
      // Ventana de lectura ancha y baja: los codigos de barras 1D son horizontales.
      qrbox: (viewWidth, viewHeight) => {
        const width = Math.floor(Math.min(viewWidth, viewHeight) * 0.92);
        return { width, height: Math.max(120, Math.floor(width * 0.55)) };
      },
      aspectRatio: 1.3333,
      formatsToSupport: supportedFormats()
    };

    try {
      // Camara trasera por defecto (environment): es la que enfoca el producto.
      await scanner.start({ facingMode: "environment" }, config, onSuccess, () => {});
    } catch (error) {
      // Permiso denegado, sin camara, o navegador restringido.
      const message =
        error && /permission|denied|notallowed/i.test(String(error.name || error))
          ? "Diste que no a la camara. Habilitala en los ajustes del navegador para escanear."
          : "No pudimos abrir la camara. Puedes escribir el codigo a mano.";
      toast(message);
      await stopActive();
    }
  }

  window.openBarcodeScanner = openBarcodeScanner;
})();
