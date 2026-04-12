// BUILD_VERSION — iniettata da Vite al build (vite.config.js define __BUILD_VERSION__)
// In dev mode usa "dev" come fallback (il banner non appare mai in dev)
export const BUILD_VERSION = typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "dev";
