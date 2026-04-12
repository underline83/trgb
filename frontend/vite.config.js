import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync } from "fs";
import { resolve } from "path";

// Versione build — timestamp unico generato UNA volta per tutto il build
const BUILD_VERSION = String(Math.floor(Date.now() / 1000));

// Plugin: serve /version.json con il timestamp corrente
// - Dev mode (VPS): middleware serve la risposta dinamicamente
// - Build mode: scrive version.json nella cartella dist
function versionJsonPlugin() {
  const payload = () => JSON.stringify({ version: BUILD_VERSION, built: new Date().toISOString() });
  return {
    name: "version-json",
    // Dev server: middleware intercetta /version.json prima di public/
    configureServer(server) {
      server.middlewares.use("/version.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache, no-store");
        res.end(payload());
      });
    },
    // Production build: scrive il file nella cartella output
    writeBundle(options) {
      const outDir = options.dir || "dist";
      writeFileSync(resolve(outDir, "version.json"), payload());
    },
  };
}

export default defineConfig({
  plugins: [react(), versionJsonPlugin()],

  // Inietta BUILD_VERSION come costante globale in tutto il codice JS
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },

  server: {
    host: "127.0.0.1",
    port: 5173,
    allowedHosts: ["app.tregobbi.it"],

    watch: {
      ignored: [
        "**/.DS_Store",
        "**/.Trash/**",
        "**/.Spotlight-V100/**",
        "**/.fseventsd/**",
        "**/._*.*"
      ]
    }
  }
});










