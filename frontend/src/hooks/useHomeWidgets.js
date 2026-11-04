// FILE: frontend/src/hooks/useHomeWidgets.js
// @version: v1.1 — ricarica automatica ogni 3 minuti con ?lieve=1 (2026-11-04)
// v1.0 — Home v3 widget data hook
// Fetch dati aggregati da GET /dashboard/home per i widget della Home.

import { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../config/api";
import useAutoRefresh from "./useAutoRefresh";

/**
 * Hook per i dati widget della Home v3.
 *
 * Restituisce:
 *   data     — oggetto DashboardHome (prenotazioni, incasso_ieri, coperti_mese, fatture_pending, alerts)
 *   loading  — true durante il primo fetch
 *   error    — messaggio errore se il fetch fallisce
 *   refetch  — funzione per ricaricare manualmente
 */
export default function useHomeWidgets({ autoRefresh = false } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // lieve=true: ricarica automatica, il backend salta i trigger fire-and-forget
  const fetchData = useCallback(async (lieve = false) => {
    try {
      const res = await apiFetch(`${API_BASE}/dashboard/home${lieve === true ? "?lieve=1" : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      console.warn("useHomeWidgets: fetch fallito", e);
      setError(e.message);
      // Non azzerare data: se avevamo dati precedenti, li teniamo
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useAutoRefresh(() => fetchData(true), { enabled: autoRefresh });

  return { data, loading, error, refetch: fetchData };
}
