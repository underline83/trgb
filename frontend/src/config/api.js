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
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "/login";
    // Lancia un errore per interrompere la catena .then() del chiamante
    throw new Error("Sessione scaduta. Reindirizzamento al login.");
  }

  return response;
}
