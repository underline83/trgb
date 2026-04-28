// @version: v2.5-locale-branding (R2, sessione 60, 2026-04-28)
// Entry point frontend TRGB Web

import React from "react";
import ReactDOM from "react-dom/client";

// ✔️ CSS globale + Tailwind
import "./index.css";

// ✔️ Build cache buster
import { BUILD_VERSION } from "./build_version";

// ✔️ Branding locale-aware (R2): legge /locale/branding.json e applica
// CSS vars al :root prima del primo render. Se fallisce, fallback a TRGB-02
// hardcoded da index.css (l'app gira lo stesso).
import { loadBrandConfig } from "./utils/brandConfig";

// ✔️ App principale
import App from "./App.jsx";

console.log("🔄 Build version:", BUILD_VERSION);
console.log("🏠 TRGB_LOCALE (build-time):", typeof __TRGB_LOCALE__ !== "undefined" ? __TRGB_LOCALE__ : "(non iniettato)");

// ---------------------------------------------------------------
// PWA — Fase 0 v2 (sessione 28)
// Strategia: network-first per tutto, cache solo come fallback offline.
// CACHE_NAME legato a BUILD_VERSION per invalidazione automatica.
// ---------------------------------------------------------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => {
      console.log("✅ Service worker registrato:", reg.scope);
      // Comunica il CACHE_NAME dinamico al SW
      const sendCacheName = (sw) => {
        sw.postMessage({
          type: "SET_CACHE_NAME",
          cacheName: `trgb-v2-${BUILD_VERSION}`,
        });
      };
      if (reg.active) sendCacheName(reg.active);
      if (reg.installing || reg.waiting) {
        const sw = reg.installing || reg.waiting;
        sw.addEventListener("statechange", () => {
          if (sw.state === "activated") sendCacheName(sw);
        });
      }
    })
    .catch((err) => console.warn("⚠️ SW registrazione fallita:", err));
}

// Boot: carica il branding del locale (palette, font, asset paths) PRIMA del
// primo render. Anche se la fetch fallisce, render comunque avviene con i
// fallback hardcoded di index.css. Tempi: <80ms su LAN locale.
loadBrandConfig().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      {/* cache-buster per forzare refresh UI a ogni build_version */}
      <App key={BUILD_VERSION} />
    </React.StrictMode>
  );
});