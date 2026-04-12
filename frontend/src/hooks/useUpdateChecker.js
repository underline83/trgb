// useUpdateChecker — polling /version.json ogni N minuti
// Se la versione sul server è diversa da quella in memoria,
// segnala che c'è un aggiornamento disponibile.

import { useState, useEffect, useCallback } from "react";
import { BUILD_VERSION } from "../build_version";

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minuti

export default function useUpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/version.json?_=" + Date.now(), {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.version && data.version !== BUILD_VERSION) {
        setUpdateAvailable(true);
      }
    } catch {
      // offline o errore — ignora silenziosamente
    }
  }, []);

  useEffect(() => {
    // Primo check dopo 30 secondi (non subito, lascia caricare l'app)
    const initial = setTimeout(check, 30_000);
    const interval = setInterval(check, POLL_INTERVAL);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [check]);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  return { updateAvailable, reload };
}
