// FILE: frontend/src/hooks/useHomeActions.js
// @version: v1.0 — Home per ruolo: fetch azioni rapide configurabili (sessione 49)
//
// Sostituisce gli array hardcoded ADMIN_ACTIONS (Home.jsx) e SALA_ACTIONS
// (DashboardSala.jsx). Legge da GET /settings/home-actions/?ruolo=... e in caso
// di errore ricade sul fallback statico in config/homeActionsFallback.js
// (stessi valori del seed DB, zero regressioni se il BE e' down).
//
// Ritorna SOLO le azioni con attivo=true, gia' ordinate per `ordine`.

import { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../config/api";
import { HOME_ACTIONS_FALLBACK } from "../config/homeActionsFallback";

/**
 * Hook per le azioni rapide Home configurabili per ruolo.
 *
 * @param {string} ruolo — opzionale. Se omesso, il BE usa il ruolo dell'utente corrente.
 * @returns {{actions, loading, error, refetch}}
 *   actions — lista [{id,key,label,sub,emoji,route,color,ordine,attivo}], solo attive, ordinate
 *   loading — true durante il primo fetch
 *   error   — messaggio errore se il fetch fallisce (comunque si torna fallback)
 *   refetch — ricarica manualmente
 */
export default function useHomeActions(ruolo) {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const applyFallback = useCallback((r) => {
    const fb = HOME_ACTIONS_FALLBACK[r] || HOME_ACTIONS_FALLBACK.admin || [];
    // Normalizza al formato del BE (id fittizio per key React)
    return fb.map((a, i) => ({
      id: `fb-${r || "default"}-${i}`,
      ordine: i,
      attivo: true,
      ...a,
    }));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const qs = ruolo ? `?ruolo=${encodeURIComponent(ruolo)}` : "";
      const res = await apiFetch(`${API_BASE}/settings/home-actions/${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // Tolgo gli inattivi e ordino (il BE gia' ordina, ma per sicurezza)
      const filtered = (Array.isArray(json) ? json : [])
        .filter((a) => a.attivo !== false)
        .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
      if (filtered.length === 0) {
        // BE ha risposto OK ma nessuna azione configurata: usa fallback
        setActions(applyFallback(ruolo));
      } else {
        setActions(filtered);
      }
      setError(null);
    } catch (e) {
      console.warn("useHomeActions: fetch fallito, uso fallback", e);
      setActions(applyFallback(ruolo));
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [ruolo, applyFallback]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { actions, loading, error, refetch: fetchData };
}
