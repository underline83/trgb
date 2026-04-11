/*
 * TRGB Gestionale — Service Worker (Fase 0 PWA)
 *
 * Strategia:
 *  - Shell app (HTML/JS/CSS/icone/font) → stale-while-revalidate
 *  - API calls (fetch verso VITE_API_BASE_URL)      → network-only (mai cache)
 *  - Navigazioni → network-first, fallback cache shell se offline
 *
 * IMPORTANTE:
 *  - Versionare CACHE_NAME per invalidare cache vecchie ad ogni deploy importante.
 *    Al momento usiamo un timestamp build statico, che conviene bumpare quando si
 *    cambia la struttura della app-shell (index.html, entry point JS, routing).
 *  - Non caching-are MAI risposte delle API: i dati (fatture, prenotazioni,
 *    movimenti) devono essere sempre freschi. Offline verr accettato solo in
 *    Fase 1+ con strategia esplicita per modulo.
 */

const CACHE_NAME = "trgb-shell-v1";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon.ico"
];

// --- INSTALL: precache shell minima -----------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll fallisce se uno solo degli asset non c' — usiamo addAll singoli
      Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[SW] precache skip", url, err);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

// --- ACTIVATE: pulizia cache vecchie ----------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k.startsWith("trgb-"))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// --- Helper: capire se una richiesta  "API" ---------------------------------
// Le API girano su un dominio diverso dal frontend (app.tregobbi.it vs
// trgb.tregobbi.it, o anche localhost:8000 in dev). Qualunque cosa verso un
// origin diverso dal frontend la trattiamo come API: niente cache.
function isApiRequest(request) {
  try {
    const url = new URL(request.url);
    return url.origin !== self.location.origin;
  } catch (_) {
    return false;
  }
}

// --- Helper: risorsa statica da cache-are -----------------------------------
function isStaticAsset(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return /\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico|webmanifest)$/i.test(
    url.pathname
  );
}

// --- FETCH: routing strategie -----------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Metodi di scrittura: mai toccati (POST/PUT/DELETE/PATCH)
  if (request.method !== "GET") return;

  // API → network-only, nessuna cache
  if (isApiRequest(request)) {
    return; // lascia passare al default browser
  }

  // Navigazioni (refresh pagina, apertura deep link) → network-first
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Non cachiamo le navigazioni: il fallback offline  index.html
          return res;
        })
        .catch(() =>
          caches.match("/index.html").then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // Asset statici stessa origine → stale-while-revalidate
  if (isStaticAsset(request)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request)
            .then((networkRes) => {
              if (networkRes && networkRes.status === 200) {
                cache.put(request, networkRes.clone());
              }
              return networkRes;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Default: lascia al browser
});
