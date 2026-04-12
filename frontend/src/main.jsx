// @version: v2.4-stable
// Entry point frontend TRGB Web

import React from "react";
import ReactDOM from "react-dom/client";

// ✔️ CSS globale + Tailwind
import "./index.css";

// ✔️ Build cache buster
import { BUILD_VERSION } from "./build_version";

// ✔️ App principale
import App from "./App.jsx";

console.log("🔄 Build version:", BUILD_VERSION);

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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* cache-buster per forzare refresh UI a ogni build_version */}
    <App key={BUILD_VERSION} />
  </React.StrictMode>
);