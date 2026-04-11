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
// PWA — Fase 0 DISABILITATA temporaneamente (sessione 26+)
// Sintomo: su iPad crashava le pagine pesanti (Cantina, RicetteNuova).
// Su Mac nessun problema.
// Ipotesi: cache stale-while-revalidate del sw.js servita male da iOS
// Safari al primo deploy. Da reinvestigare con strategia di cache
// diversa (network-first per la app shell? versioning del CACHE_NAME
// legato a BUILD_VERSION?).
//
// Blocco difensivo: ripuliamo TUTTI i service worker e le cache che
// fossero gia' stati registrati su qualunque client. Cosi' Mac e iPad
// si auto-ripuliscono al prossimo load, senza azioni manuali.
// ---------------------------------------------------------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => {
      reg.unregister().then((ok) => {
        if (ok) console.log("🧹 Service worker unregistrato:", reg.scope);
      });
    });
  });
  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((k) => caches.delete(k).then(() => console.log("🧹 Cache eliminata:", k)));
    });
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* cache-buster per forzare refresh UI a ogni build_version */}
    <App key={BUILD_VERSION} />
  </React.StrictMode>
);