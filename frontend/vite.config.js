import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    watch: {
      ignored: [
        "**/.DS_Store",
        "**/.Trash/**",
        "**/.Spotlight-V100/**",
        "**/.fseventsd/**",

        // IMPORTANTISSIMO: questa è la versione SICURA
        "**/._*.*"
      ]
    }
  }
});