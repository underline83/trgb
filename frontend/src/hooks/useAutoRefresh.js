// FILE: frontend/src/hooks/useAutoRefresh.js
// @version: v1.0 — ricarica periodica dei widget della Home (2026-11-04)
// Modulo: platform (Home)
//
// Un iPad lasciato sulla Home durante il servizio deve vedere da solo
// prenotazioni nuove, arrivi e note della Lavagna. Chiama `fn` ogni
// HOME_REFRESH_MS mentre la pagina è visibile, e subito quando l'iPad torna
// in primo piano (se è passato più di VISIBILITY_MIN_MS dall'ultima volta).
//
// Intervallo fisso nel codice per scelta di Marco (2026-11-04), come le
// notifiche (useNotifiche, 60 s): se serve, si sposta in Impostazioni.

import { useEffect, useRef } from "react";

export const HOME_REFRESH_MS = 3 * 60 * 1000;
const VISIBILITY_MIN_MS = 30 * 1000;

export default function useAutoRefresh(fn, { enabled = true, ms = HOME_REFRESH_MS } = {}) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled || !ms) return undefined;
    let ultima = Date.now();
    const esegui = () => {
      ultima = Date.now();
      try { fnRef.current?.(); } catch (e) { console.warn("useAutoRefresh", e); }
    };
    const id = setInterval(() => {
      if (document.visibilityState === "visible") esegui();
    }, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - ultima > VISIBILITY_MIN_MS) esegui();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, ms]);
}
