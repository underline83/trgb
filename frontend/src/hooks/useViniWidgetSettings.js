// Modulo: vini
// Hook React: legge i settings widget del modulo Vini da
// `/settings/vini/widget/` (sessione 2026-05-12, V-H.G).
//
// Pattern:
//   const { settings, loading, get } = useViniWidgetSettings();
//   const freshHours = get("calici_fresh_hours", 12);
//
// Cache: una fetch al primo mount, valori tipizzati dal backend.
// Fallback: usa il default passato a `get()` se la chiave manca o se la
// fetch non è ancora completata / fallita.

import { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../config/api";

// Cache globale process-life (condivisa fra tutte le istanze del hook)
let _cache = null;
let _loadingPromise = null;

async function fetchSettings() {
  const r = await apiFetch(`${API_BASE}/settings/vini/widget/`);
  if (!r.ok) throw new Error(`settings widget HTTP ${r.status}`);
  return await r.json();
}

export default function useViniWidgetSettings() {
  const [settings, setSettings] = useState(_cache || {});
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    if (_cache) {
      setSettings(_cache);
      setLoading(false);
      return;
    }
    if (!_loadingPromise) {
      _loadingPromise = fetchSettings()
        .then((data) => {
          _cache = data || {};
          return _cache;
        })
        .catch(() => {
          _cache = {};
          return _cache;
        });
    }
    let cancelled = false;
    _loadingPromise.then((data) => {
      if (!cancelled) {
        setSettings(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Legge un setting con fallback. Le entrate hanno forma {value, raw, tipo, descrizione}. */
  const get = (key, defaultVal) => {
    const entry = settings?.[key];
    if (entry === undefined || entry === null) return defaultVal;
    if (typeof entry === "object" && "value" in entry) return entry.value;
    return entry;
  };

  return { settings, loading, get };
}

/** Invalida la cache (chiamare dopo PUT). */
export function invalidateViniWidgetSettingsCache() {
  _cache = null;
  _loadingPromise = null;
}
