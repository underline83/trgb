// vite.config.js
import { defineConfig } from "file:///sessions/epic-admiring-euler/mnt/trgb/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/epic-admiring-euler/mnt/trgb/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import { writeFileSync } from "fs";
import { resolve } from "path";
var BUILD_VERSION = String(Math.floor(Date.now() / 1e3));
function versionJsonPlugin() {
  const payload = () => JSON.stringify({ version: BUILD_VERSION, built: (/* @__PURE__ */ new Date()).toISOString() });
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
    }
  };
}
var vite_config_default = defineConfig({
  plugins: [react(), versionJsonPlugin()],
  // Inietta BUILD_VERSION come costante globale in tutto il codice JS
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION)
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
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvZXBpYy1hZG1pcmluZy1ldWxlci9tbnQvdHJnYi9mcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3Nlc3Npb25zL2VwaWMtYWRtaXJpbmctZXVsZXIvbW50L3RyZ2IvZnJvbnRlbmQvdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3Nlc3Npb25zL2VwaWMtYWRtaXJpbmctZXVsZXIvbW50L3RyZ2IvZnJvbnRlbmQvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xuaW1wb3J0IHsgd3JpdGVGaWxlU3luYyB9IGZyb20gXCJmc1wiO1xuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gXCJwYXRoXCI7XG5cbi8vIFZlcnNpb25lIGJ1aWxkIFx1MjAxNCB0aW1lc3RhbXAgdW5pY28gZ2VuZXJhdG8gVU5BIHZvbHRhIHBlciB0dXR0byBpbCBidWlsZFxuY29uc3QgQlVJTERfVkVSU0lPTiA9IFN0cmluZyhNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSk7XG5cbi8vIFBsdWdpbjogc2VydmUgL3ZlcnNpb24uanNvbiBjb24gaWwgdGltZXN0YW1wIGNvcnJlbnRlXG4vLyAtIERldiBtb2RlIChWUFMpOiBtaWRkbGV3YXJlIHNlcnZlIGxhIHJpc3Bvc3RhIGRpbmFtaWNhbWVudGVcbi8vIC0gQnVpbGQgbW9kZTogc2NyaXZlIHZlcnNpb24uanNvbiBuZWxsYSBjYXJ0ZWxsYSBkaXN0XG5mdW5jdGlvbiB2ZXJzaW9uSnNvblBsdWdpbigpIHtcbiAgY29uc3QgcGF5bG9hZCA9ICgpID0+IEpTT04uc3RyaW5naWZ5KHsgdmVyc2lvbjogQlVJTERfVkVSU0lPTiwgYnVpbHQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9KTtcbiAgcmV0dXJuIHtcbiAgICBuYW1lOiBcInZlcnNpb24tanNvblwiLFxuICAgIC8vIERldiBzZXJ2ZXI6IG1pZGRsZXdhcmUgaW50ZXJjZXR0YSAvdmVyc2lvbi5qc29uIHByaW1hIGRpIHB1YmxpYy9cbiAgICBjb25maWd1cmVTZXJ2ZXIoc2VydmVyKSB7XG4gICAgICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKFwiL3ZlcnNpb24uanNvblwiLCAoX3JlcSwgcmVzKSA9PiB7XG4gICAgICAgIHJlcy5zZXRIZWFkZXIoXCJDb250ZW50LVR5cGVcIiwgXCJhcHBsaWNhdGlvbi9qc29uXCIpO1xuICAgICAgICByZXMuc2V0SGVhZGVyKFwiQ2FjaGUtQ29udHJvbFwiLCBcIm5vLWNhY2hlLCBuby1zdG9yZVwiKTtcbiAgICAgICAgcmVzLmVuZChwYXlsb2FkKCkpO1xuICAgICAgfSk7XG4gICAgfSxcbiAgICAvLyBQcm9kdWN0aW9uIGJ1aWxkOiBzY3JpdmUgaWwgZmlsZSBuZWxsYSBjYXJ0ZWxsYSBvdXRwdXRcbiAgICB3cml0ZUJ1bmRsZShvcHRpb25zKSB7XG4gICAgICBjb25zdCBvdXREaXIgPSBvcHRpb25zLmRpciB8fCBcImRpc3RcIjtcbiAgICAgIHdyaXRlRmlsZVN5bmMocmVzb2x2ZShvdXREaXIsIFwidmVyc2lvbi5qc29uXCIpLCBwYXlsb2FkKCkpO1xuICAgIH0sXG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpLCB2ZXJzaW9uSnNvblBsdWdpbigpXSxcblxuICAvLyBJbmlldHRhIEJVSUxEX1ZFUlNJT04gY29tZSBjb3N0YW50ZSBnbG9iYWxlIGluIHR1dHRvIGlsIGNvZGljZSBKU1xuICBkZWZpbmU6IHtcbiAgICBfX0JVSUxEX1ZFUlNJT05fXzogSlNPTi5zdHJpbmdpZnkoQlVJTERfVkVSU0lPTiksXG4gIH0sXG5cbiAgc2VydmVyOiB7XG4gICAgaG9zdDogXCIxMjcuMC4wLjFcIixcbiAgICBwb3J0OiA1MTczLFxuICAgIGFsbG93ZWRIb3N0czogW1wiYXBwLnRyZWdvYmJpLml0XCJdLFxuXG4gICAgd2F0Y2g6IHtcbiAgICAgIGlnbm9yZWQ6IFtcbiAgICAgICAgXCIqKi8uRFNfU3RvcmVcIixcbiAgICAgICAgXCIqKi8uVHJhc2gvKipcIixcbiAgICAgICAgXCIqKi8uU3BvdGxpZ2h0LVYxMDAvKipcIixcbiAgICAgICAgXCIqKi8uZnNldmVudHNkLyoqXCIsXG4gICAgICAgIFwiKiovLl8qLipcIlxuICAgICAgXVxuICAgIH1cbiAgfVxufSk7XG5cblxuXG5cblxuXG5cblxuXG5cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1QsU0FBUyxvQkFBb0I7QUFDNVYsT0FBTyxXQUFXO0FBQ2xCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZUFBZTtBQUd4QixJQUFNLGdCQUFnQixPQUFPLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxHQUFJLENBQUM7QUFLMUQsU0FBUyxvQkFBb0I7QUFDM0IsUUFBTSxVQUFVLE1BQU0sS0FBSyxVQUFVLEVBQUUsU0FBUyxlQUFlLFFBQU8sb0JBQUksS0FBSyxHQUFFLFlBQVksRUFBRSxDQUFDO0FBQ2hHLFNBQU87QUFBQSxJQUNMLE1BQU07QUFBQTtBQUFBLElBRU4sZ0JBQWdCLFFBQVE7QUFDdEIsYUFBTyxZQUFZLElBQUksaUJBQWlCLENBQUMsTUFBTSxRQUFRO0FBQ3JELFlBQUksVUFBVSxnQkFBZ0Isa0JBQWtCO0FBQ2hELFlBQUksVUFBVSxpQkFBaUIsb0JBQW9CO0FBQ25ELFlBQUksSUFBSSxRQUFRLENBQUM7QUFBQSxNQUNuQixDQUFDO0FBQUEsSUFDSDtBQUFBO0FBQUEsSUFFQSxZQUFZLFNBQVM7QUFDbkIsWUFBTSxTQUFTLFFBQVEsT0FBTztBQUM5QixvQkFBYyxRQUFRLFFBQVEsY0FBYyxHQUFHLFFBQVEsQ0FBQztBQUFBLElBQzFEO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQztBQUFBO0FBQUEsRUFHdEMsUUFBUTtBQUFBLElBQ04sbUJBQW1CLEtBQUssVUFBVSxhQUFhO0FBQUEsRUFDakQ7QUFBQSxFQUVBLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLGNBQWMsQ0FBQyxpQkFBaUI7QUFBQSxJQUVoQyxPQUFPO0FBQUEsTUFDTCxTQUFTO0FBQUEsUUFDUDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
