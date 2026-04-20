// src/utils/authFetch.js
// Helper per aprire endpoint auth-protetti (JWT Bearer) in un nuovo tab del browser.
//
// Motivo: window.open(url) apre la URL senza header Authorization e il backend
// risponde 401 "Not authenticated". Soluzione: fetch con header, scarica in blob,
// apre il blob in un nuovo tab.
//
// Bypass popup blocker: il window.open deve partire *sincrono* dal click dell'utente
// (non dopo un await), altrimenti i browser lo bloccano. Trucco: apriamo subito
// un tab "vuoto" e poi lo redirigiamo al blob URL una volta pronto.

/**
 * Apre una URL auth-protetta in un nuovo tab.
 * @param {string} url - endpoint (es. `${API_BASE}/bevande/carta/pdf`)
 * @param {object} opts - { filename?: string, onError?: (err) => void }
 * @returns {Promise<Window|null>} il Window del tab aperto (o null se bloccato)
 */
export async function openAuthedInNewTab(url, opts = {}) {
  const { onError } = opts;
  const token = localStorage.getItem("token");

  // 1. Apriamo immediatamente un tab "placeholder" per non farci bloccare dal browser.
  const win = window.open("about:blank", "_blank");
  if (win) {
    // Messaggio user-friendly mentre carica
    try {
      win.document.write(
        "<title>Caricamento…</title>" +
        "<div style=\"font-family:system-ui;padding:2rem;color:#555\">Caricamento in corso…</div>"
      );
    } catch { /* cross-origin in edge cases, ignoriamo */ }
  }

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);

    if (win && !win.closed) {
      win.location.href = blobUrl;
    } else {
      // Popup bloccato: fallback su location corrente (utente vede download)
      window.location.href = blobUrl;
    }

    // Cleanup del blob URL dopo un minuto (dà tempo al tab di caricare)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return win;
  } catch (err) {
    console.error("[openAuthedInNewTab]", url, err);
    if (win && !win.closed) {
      try {
        win.document.write(
          "<title>Errore</title>" +
          `<div style="font-family:system-ui;padding:2rem;color:#b00">Errore: ${err.message}</div>`
        );
      } catch { /* ignore */ }
    }
    if (onError) onError(err);
    return null;
  }
}
