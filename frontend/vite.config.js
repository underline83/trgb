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

  // Code-splitting: un chunk vendor per libreria pesante + un chunk per modulo
  // applicativo. Cosi' il primo load scarica solo React + router + Home,
  // e ogni modulo (vini, dipendenti, ecc.) arriva on-demand via React.lazy.
  build: {
    // Aumenta warning: con recharts e xlsx la soglia 500KB e' sempre rossa
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Nome stabile dei chunk (cacheable con hash sul contenuto)
        chunkFileNames: "assets/[name]-[hash].js",
        manualChunks(id) {
          // --- Vendor: raggruppa librerie node_modules per peso/uso ---
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("xlsx") || id.includes("exceljs")) return "vendor-xlsx";
            if (id.includes("react-router")) return "vendor-router";
            if (
              id.includes("react-dom") ||
              id.includes("scheduler") ||
              /node_modules\/react\//.test(id)
            ) {
              return "vendor-react";
            }
            return "vendor";
          }

          // --- App: un chunk per modulo (cartella sotto src/pages/<modulo>/) ---
          const m = id.match(/\/src\/pages\/([^/]+)\//);
          if (m) return `module-${m[1]}`;

          // --- Servizi/utils condivisi: lasciamo che Rollup li metta nel chunk
          //     del modulo che li importa (nessun return = default) ---
        },
      },
    },
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










