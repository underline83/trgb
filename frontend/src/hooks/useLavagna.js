// FILE: frontend/src/hooks/useLavagna.js
// @version: v1.0 — La Lavagna (briefing di servizio Home)
//
// Endpoint:
//   GET    /dashboard/lavagna       → briefing completo del turno corrente
//   POST   /comunicazioni/nota      → appende la riga del turno (solo admin)
//   DELETE /comunicazioni/nota      → toglie la riga (solo admin)
//
// Sostituisce useComunicazioni() nella Home. L'hook della bacheca classica
// resta in piedi: lo usa ancora la pagina /comunicazioni.

import { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../config/api";

export default function useLavagna() {
  const [lavagna, setLavagna] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/dashboard/lavagna`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLavagna(await res.json());
    } catch (e) {
      console.warn("useLavagna: fetch fallito", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Scrive la riga del turno ──
  // Aggiorna subito la nota in locale (la card non deve "lampeggiare"),
  // poi ricarica per riallineare anche il testo WhatsApp che la include.
  const scriviNota = useCallback(async (messaggio) => {
    const testo = (messaggio || "").trim();
    if (!testo) return false;
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/comunicazioni/nota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messaggio: testo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setLavagna((prev) => (prev ? { ...prev, nota: json.nota } : prev));
      fetchData();
      return true;
    } catch (e) {
      console.warn("useLavagna: scrittura nota fallita", e);
      return false;
    } finally {
      setSaving(false);
    }
  }, [fetchData]);

  const rimuoviNota = useCallback(async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/comunicazioni/nota`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLavagna((prev) => (prev ? { ...prev, nota: null } : prev));
      fetchData();
      return true;
    } catch (e) {
      console.warn("useLavagna: rimozione nota fallita", e);
      return false;
    } finally {
      setSaving(false);
    }
  }, [fetchData]);

  return { lavagna, loading, saving, scriviNota, rimuoviNota, refetch: fetchData };
}
