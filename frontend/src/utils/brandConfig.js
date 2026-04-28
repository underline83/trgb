// Modulo: platform/UI primitives (R2, sessione 60, 2026-04-28)
// Helper per leggere il branding del locale corrente e applicare le CSS vars
// al :root al boot dell'app, prima del primo render React.
//
// Strategia:
//  1. Boot frontend: fetch GET /locale/branding.json
//  2. Mappa colors.* del JSON → CSS vars --trgb-* (override del default in index.css)
//  3. Espone getBranding() per i componenti che vogliono leggere font/asset/PWA config
//  4. Fallback graceful: se il fetch fallisce, restano i valori hardcoded di index.css
//     (palette TRGB-02 originale) — l'osteria continua a funzionare anche con backend down.
//
// Vedi docs/refactor_monorepo.md §3 R2 e locali/<id>/branding.json.

import { API_BASE } from "../config/api";

let _branding = null;
let _loadPromise = null;

/**
 * Mappa il branding.json sulle CSS vars del :root.
 * Pure function — no side effects fuori dal documento.
 */
function applyCssVars(branding) {
  if (!branding || !branding.colors) return;
  const root = document.documentElement;
  const c = branding.colors;
  // Mappa coerente con index.css :root
  if (c.brand_cream)  root.style.setProperty("--trgb-bg",    c.brand_cream);
  if (c.brand_ink)    root.style.setProperty("--trgb-text",  c.brand_ink);
  if (c.brand_red)    root.style.setProperty("--trgb-red",   c.brand_red);
  if (c.brand_green)  root.style.setProperty("--trgb-green", c.brand_green);
  if (c.brand_blue)   root.style.setProperty("--trgb-blue",  c.brand_blue);
  if (c.brand_night)  root.style.setProperty("--trgb-night", c.brand_night);

  // Aggiorna anche meta theme-color se presente nel branding (manifest PWA + barra browser)
  if (branding.theme && branding.theme.html_theme_color) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", branding.theme.html_theme_color);
  }
}

/**
 * Carica il branding del locale corrente (cached). Da chiamare UNA volta al boot.
 * Restituisce una Promise<branding|null>.
 */
export function loadBrandConfig() {
  if (_branding) return Promise.resolve(_branding);
  if (_loadPromise) return _loadPromise;

  _loadPromise = fetch(`${API_BASE}/locale/branding.json`, {
    method: "GET",
    headers: { "Accept": "application/json" },
    cache: "no-cache",
  })
    .then(r => {
      if (!r.ok) throw new Error(`branding HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      _branding = data || {};
      applyCssVars(_branding);
      console.log(`🎨 Branding caricato: locale=${_branding.id || "?"} wordmark=${_branding.wordmark_text || "?"}`);
      return _branding;
    })
    .catch(err => {
      console.warn("⚠️ loadBrandConfig fallita, uso fallback hardcoded TRGB-02:", err);
      _branding = {};
      return _branding;
    });

  return _loadPromise;
}

/**
 * Ritorna il branding già caricato (sincrono). Null se non ancora loaded.
 * I componenti che vogliono leggere font/asset/PWA config dovrebbero usare
 * useBranding() (hook React) o aspettare loadBrandConfig() al boot.
 */
export function getBranding() {
  return _branding;
}

/**
 * Ritorna il valore di un campo del branding o un fallback.
 * Esempio: brandValue("wordmark_text", "TRGB") oppure brandValue("colors.brand_red", "#E8402B").
 */
export function brandValue(path, fallback = null) {
  if (!_branding) return fallback;
  const parts = path.split(".");
  let v = _branding;
  for (const p of parts) {
    if (v && typeof v === "object" && p in v) v = v[p];
    else return fallback;
  }
  return v != null ? v : fallback;
}
