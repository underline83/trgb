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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* cache-buster per forzare refresh UI a ogni build_version */}
    <App key={BUILD_VERSION} />
  </React.StrictMode>
);