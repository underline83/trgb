// Modulo: platform/UI primitives (R5, sessione 60, 2026-04-29)
// Helper frontend per leggere stringhe UI specifiche del locale corrente.
//
// Le stringhe TRGB-specific (es. "Osteria Tre Gobbi", saluti WA) vivono in
// `locali/<TRGB_LOCALE>/strings.json` lato repo, esposte via endpoint
// `GET /locale/strings.json`. Il frontend carica le strings al boot
// (parallelamente al branding) e le usa via `t("chiave", "fallback")`.
//
// Pattern speculare a brandConfig.js. Vedi docs/refactor_monorepo.md §3 R5.

import { useEffect, useState } from "react";
import { API_BASE } from "../config/api";

let _strings = null;
let _loadPromise = null;
const _subscribers = new Set();

function _notifySubscribers() {
  for (const fn of _subscribers) {
    try { fn(_strings); } catch (e) { console.warn("localeStrings subscriber error:", e); }
  }
}

/**
 * Carica le strings del locale corrente (cached). Chiamare UNA volta al boot.
 * Restituisce Promise<strings|null>.
 */
export function loadLocaleStrings() {
  if (_strings) return Promise.resolve(_strings);
  if (_loadPromise) return _loadPromise;

  _loadPromise = fetch(`${API_BASE}/locale/strings.json`, {
    method: "GET",
    headers: { "Accept": "application/json" },
    cache: "no-cache",
  })
    .then(r => {
      if (!r.ok) throw new Error(`strings HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      _strings = data || {};
      _notifySubscribers();
      const nKeys = Object.keys(_strings).length;
      console.log(`💬 LocaleStrings caricato: ${nKeys} chiavi top-level`);
      return _strings;
    })
    .catch(err => {
      console.warn("⚠️ loadLocaleStrings fallita, uso solo fallback:", err);
      _strings = {};
      return _strings;
    });

  return _loadPromise;
}

/**
 * Ritorna la stringa associata a `key` (dot-notation) nel locale corrente,
 * oppure `fallback` se la chiave manca o le strings non sono ancora caricate.
 *
 * Esempio:
 *   t("wa.template.compleanno", "Buon compleanno!")
 *   t("page.title_carta_vini", "Carta vini")
 */
export function t(key, fallback = "") {
  if (!_strings) return fallback;
  const parts = key.split(".");
  let v = _strings;
  for (const p of parts) {
    if (v && typeof v === "object" && p in v) v = v[p];
    else return fallback;
  }
  return typeof v === "string" ? v : fallback;
}

/**
 * Hook React: ritorna {t} reattivo. Se le strings non sono ancora caricate,
 * lancia loadLocaleStrings() e re-renderizza appena disponibili.
 *
 * Esempio:
 *   const { t } = useLocaleStrings();
 *   <span>{t("page.footer_carta_vini", "Carta aggiornata in tempo reale")}</span>
 */
export function useLocaleStrings() {
  const [s, setS] = useState(_strings);
  useEffect(() => {
    if (_strings) {
      if (s !== _strings) setS(_strings);
      return;
    }
    loadLocaleStrings().then(() => setS(_strings));
    const onUpdate = (next) => setS(next);
    _subscribers.add(onUpdate);
    return () => { _subscribers.delete(onUpdate); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { t, strings: s || {} };
}
