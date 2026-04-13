// FILE: frontend/src/hooks/useComunicazioni.js
// @version: v1.0 — Fetch comunicazioni bacheca staff
// Endpoint: GET /comunicazioni → lista attive filtrate per ruolo utente

import { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../config/api";

/**
 * Hook per la bacheca comunicazioni.
 *
 * Restituisce:
 *   comunicazioni — array di { id, autore, titolo, messaggio, urgenza, dest_ruolo, scadenza, created_at, letta }
 *   loading       — true durante il primo fetch
 *   nonLette      — count comunicazioni non lette
 *   segnaLetta    — funzione (id) => marca come letta
 *   refetch       — ricarica manualmente
 */
export default function useComunicazioni() {
  const [comunicazioni, setComunicazioni] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/comunicazioni`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setComunicazioni(json);
    } catch (e) {
      console.warn("useComunicazioni: fetch fallito", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const nonLette = comunicazioni.filter((c) => !c.letta).length;

  const segnaLetta = useCallback(async (id) => {
    try {
      await apiFetch(`${API_BASE}/comunicazioni/${id}/letta`, { method: "POST" });
      setComunicazioni((prev) =>
        prev.map((c) => (c.id === id ? { ...c, letta: 1 } : c))
      );
    } catch (e) {
      console.warn("segnaLetta fallito", e);
    }
  }, []);

  return { comunicazioni, loading, nonLette, segnaLetta, refetch: fetchData };
}
