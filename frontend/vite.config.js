import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync } from "fs";
import { resolve } from "path";

// Versione build — timestamp unico generato UNA volta per tutto il build
const BUILD_VERSION = String(Math.floor(Date.now() / 1000));

// Plugin: genera version.json nella cartella build ad ogni build
function versionJsonPlugin() {
  return {
    name: "version-json",
    writeBundle(options) {
      const outDir = options.dir || "dist";
      writeFileSync(
        resolve(outDir, "version.json"),
        JSON.stringify({ version: BUILD_VERSION, built: new Date().toISOString() })
      );
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










