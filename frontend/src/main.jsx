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
// PWA — registrazione service worker (Fase 0)
// Il SW cacha solo la shell statica. Le chiamate API (cross-origin)
// NON vengono cache-ate: i dati restano sempre freschi dal VPS.
// Non registriamo in dev (vite dev server) per evitare cache sporca.
// ---------------------------------------------------------------
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("✅ Service worker registrato:", reg.scope);
      })
      .catch((err) => {
        console.warn("⚠️ Service worker NON registrato:", err);
      });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* cache-buster per forzare refresh UI a ogni build_version */}
    <App key={BUILD_VERSION} />
  </React.StrictMode>
);