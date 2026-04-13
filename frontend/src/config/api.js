// frontend/src/config/api.js
export const API_BASE = import.meta.env.VITE_API_BASE_URL;

/**
 * apiFetch — wrapper di fetch con gestione automatica token e 401.
 *
 * Uso: identico a fetch(url, options), ma:
 *  - inietta automaticamente `Authorization: Bearer <token>` se presente
 *  - su 401: cancella token/role da localStorage e rimanda a /login
 *
 * Esempi:
 *   const res = await apiFetch(`${API_BASE}/endpoint`)
 *   const res = await apiFetch(`${API_BASE}/endpoint`, { method: "POST", body: JSON.stringify(data) })
 *   const res = await apiFetch(url, { headers: { "Content-Type": "application/json" } })
 */
export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("token");

  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // Log QUALE endpoint ha provocato il 401 — fondamentale per debug
    console.error(`[apiFetch] 401 su: ${url}`);
    console.error(`[apiFetch] Token presente: ${!!token}, lunghezza: ${token?.length || 0}`);
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "/login";
    // Lancia un errore per interrompere la catena .then() del chiamante
    throw new Error(`Sessione scaduta (401 su ${url}). Reindirizzamento al login.`);
  }

  return response;
}

// ─── Auto-refresh token ───────────────────────────────────
// Rinnova il token ogni 30 minuti finché la pagina è aperta.
// Così anche se l'utente si allontana per un po', il token resta valido.

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minuti

async function refreshToken() {
  const token = localStorage.getItem("token");
  if (!token) return; // non loggato, skip

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      if (data.role) localStorage.setItem("role", data.role);
    }
    // Se 401 non facciamo nulla — scatterà al prossimo apiFetch
  } catch {
    // Errore di rete, riproverà al prossimo intervallo
  }
}

// Avvia il timer di refresh
setInterval(refreshToken, REFRESH_INTERVAL_MS);

// Refresh anche quando la pagina torna in primo piano (dopo tab switch / resume laptop)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshToken();
  }
});
