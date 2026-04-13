// @version: v1.0-useNotifiche
// Hook centralizzato per notifiche e comunicazioni — Mattone M.A
//
// Uso:
//   const { totaleNonLette, notifiche, comunicazioni, refresh, segnaLetta, ... } = useNotifiche();
//
// Polling automatico ogni 60s per il contatore badge.
// Lista completa caricata on-demand quando si apre il pannello.

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch, API_BASE } from "../config/api";

const POLL_INTERVAL = 60_000; // 60 secondi

export default function useNotifiche() {
  // ── Contatore badge (polling leggero) ──
  const [contatore, setContatore] = useState({ notifiche: 0, comunicazioni: 0, totale: 0 });

  // ── Liste complete (caricate on-demand) ──
  const [notifiche, setNotifiche] = useState([]);
  const [comunicazioni, setComunicazioni] = useState([]);
  const [loading, setLoading] = useState(false);

  const pollRef = useRef(null);

  // ── Fetch contatore ──
  const fetchContatore = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/notifiche/contatore`);
      if (res.ok) {
        const data = await res.json();
        setContatore(data);
      }
    } catch {
      // silenzioso — non bloccare l'app se il backend non risponde
    }
  }, []);

  // ── Polling contatore ──
  useEffect(() => {
    fetchContatore();
    pollRef.current = setInterval(fetchContatore, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [fetchContatore]);

  // ── Fetch lista notifiche ──
  const fetchNotifiche = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/notifiche/mie?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setNotifiche(data);
      }
    } catch { /* silenzioso */ }
  }, []);

  // ── Fetch comunicazioni attive ──
  const fetchComunicazioni = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/comunicazioni`);
      if (res.ok) {
        const data = await res.json();
        setComunicazioni(data);
      }
    } catch { /* silenzioso */ }
  }, []);

  // ── Carica tutto (quando si apre il pannello) ──
  const caricaTutto = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchNotifiche(), fetchComunicazioni(), fetchContatore()]);
    setLoading(false);
  }, [fetchNotifiche, fetchComunicazioni, fetchContatore]);

  // ── Segna notifica come letta ──
  const segnaLetta = useCallback(async (notificaId) => {
    try {
      await apiFetch(`${API_BASE}/notifiche/${notificaId}/letta`, { method: "POST" });
      setNotifiche(prev => prev.map(n => n.id === notificaId ? { ...n, letta: 1 } : n));
      setContatore(prev => ({ ...prev, notifiche: Math.max(0, prev.notifiche - 1), totale: Math.max(0, prev.totale - 1) }));
    } catch { /* silenzioso */ }
  }, []);

  // ── Segna tutte come lette ──
  const segnaTutteLette = useCallback(async () => {
    try {
      await apiFetch(`${API_BASE}/notifiche/tutte-lette`, { method: "POST" });
      setNotifiche(prev => prev.map(n => ({ ...n, letta: 1 })));
      setContatore(prev => ({ ...prev, notifiche: 0, totale: prev.comunicazioni }));
    } catch { /* silenzioso */ }
  }, []);

  // ── Segna comunicazione come letta ──
  const segnaComunicazioneLetta = useCallback(async (comId) => {
    try {
      await apiFetch(`${API_BASE}/comunicazioni/${comId}/letta`, { method: "POST" });
      setComunicazioni(prev => prev.map(c => c.id === comId ? { ...c, letta: 1 } : c));
      setContatore(prev => ({ ...prev, comunicazioni: Math.max(0, prev.comunicazioni - 1), totale: Math.max(0, prev.totale - 1) }));
    } catch { /* silenzioso */ }
  }, []);

  // ── Refresh forzato (dopo azione esterna) ──
  const refresh = useCallback(() => {
    fetchContatore();
  }, [fetchContatore]);

  return {
    // Contatore (per badge)
    totaleNonLette: contatore.totale,
    contatoreNotifiche: contatore.notifiche,
    contatoreComunicazioni: contatore.comunicazioni,

    // Liste
    notifiche,
    comunicazioni,
    loading,

    // Azioni
    caricaTutto,
    segnaLetta,
    segnaTutteLette,
    segnaComunicazioneLetta,
    refresh,
  };
}
