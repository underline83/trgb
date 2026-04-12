import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync } from "fs";
import { resolve } from "path";

// Plugin: genera version.json nella cartella build ad ogni build
function versionJsonPlugin() {
  return {
    name: "version-json",
    writeBundle(options) {
      const outDir = options.dir || "dist";
      const version = String(Math.floor(Date.now() / 1000));
      writeFileSync(
        resolve(outDir, "version.json"),
        JSON.stringify({ version, built: new Date().toISOString() })
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), versionJsonPlugin()],

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










