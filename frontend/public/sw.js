/*
 * TRGB Gestionale — Service Worker v2 (Fase 0 PWA)
 * Sessione 28 — riscrittura post-rollback sessione 26
 *
 * Strategia NETWORK-FIRST per tutto:
 *  - Ogni richiesta va prima alla rete
 *  - Se la rete risponde, salva in cache e restituisce
 *  - Se la rete fallisce (offline), serve dalla cache
 *  - API (origin diverso) → mai cachate, network-only
 *
 * CACHE_NAME cambia ad ogni build (legato a BUILD_VERSION via query param
 * passato al momento della registrazione). Al activate, le cache vecchie
 * vengono cancellate automaticamente.
 *
 * PERCHE' network-first e non stale-while-revalidate:
 * Vite genera chunk JS con hash nel nome (es. index-abc123.js). Dopo un
 * deploy, i vecchi chunk non esistono piu' sul server. Se il SW serve un
 * chunk vecchio dalla cache mentre index.html punta a quello nuovo, il
 * browser carica un mix incoerente → crash. Con network-first il browser
 * prende sempre i file freschi, la cache serve solo offline.
 */

// Il CACHE_NAME viene impostato dal messaggio di init (vedi main.jsx).
// Fallback statico se il messaggio non arriva.
let CACHE_NAME = "trgb-v2";

// Ricevi il CACHE_NAME dinamico da main.jsx
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SET_CACHE_NAME") {
    CACHE_NAME = event.data.cacheName;
  }
});

// --- INSTALL: skipWaiting immediato, niente precache ---
self.addEventListener("install", () => {
  self.skipWaiting();
});

// --- ACTIVATE: pulizia cache vecchie ---
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

// --- Helper: richiesta API (origin diverso) ---
function isApiRequest(request) {
  try {
    return new URL(request.url).origin !== self.location.origin;
  } catch (_) {
    return false;
  }
}

// --- Helper: upload utente (foto piatti, futuri) → mai cachare ---
// Modulo D fix (2026-04-27): nginx serviva index.html in fallback per file
// non esistenti, il SW cachava quella response sotto la chiave del path foto,
// e quando il file effettivamente caricato dall'utente diventava disponibile,
// il SW serviva la index cachata → click sulla foto rimbalza alla home.
// Modulo K (2026-04-27): nuovi upload vanno in /uploads/ FUORI dal repo.
// I path /static/menu_carta/ legacy restano serviti per compat.
// Soluzione: bypass totale del SW per entrambi i pattern.
function isUserUpload(request) {
  try {
    const path = new URL(request.url).pathname;
    return (
      path.startsWith("/uploads/") ||
      path.startsWith("/static/menu_carta/")
    );
  } catch (_) {
    return false;
  }
}

// --- Helper: API backend → mai cachare ---
// Stesso problema dello user-upload ma su path API: nginx in alcuni casi
// fa fallback a index.html per route non matchate (SPA mode), il SW cacha
// l'HTML sotto la chiave del path API, le successive POST/GET ricevono HTML
// invece di JSON → fetch fail.
// Soluzione: bypass totale del SW per i path noti del backend FastAPI.
const API_PATHS = [
  "/contabilita/", "/foodcost/", "/menu-carta/", "/pranzo/", "/vini/",
  "/banca/", "/clienti/", "/dipendenti/", "/admin/", "/auth/",
  "/system/", "/dashboard/", "/notifiche/", "/alerts/", "/tasks/",
  "/preventivi/", "/statistiche/", "/prenotazioni/", "/macellaio/",
  "/salumi/", "/pescato/", "/formaggi/", "/selezioni/", "/ricette/",
  "/ipratico/", "/controllo-gestione/", "/service-types",
  "/lista-spesa/", "/haccp/",
];
function isBackendApi(request) {
  try {
    const path = new URL(request.url).pathname;
    return API_PATHS.some((p) => path.startsWith(p));
  } catch (_) {
    return false;
  }
}

// --- FETCH: network-first per tutto ---
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo GET
  if (request.method !== "GET") return;

  // API → network-only, nessuna cache
  if (isApiRequest(request)) return;

  // Upload utente → network-only, mai cache (Modulo D fix)
  if (isUserUpload(request)) return;

  // API backend (stesso origin) → network-only, mai cache
  // Risolve "Errore di rete" persistente quando SW serviva index.html
  // cached invece di passare la richiesta al backend (Modulo M debug)
  if (isBackendApi(request)) return;

  // Tutto il resto: network-first con fallback cache
  event.respondWith(
    fetch(request)
      .then((networkRes) => {
        // Salva in cache solo risposte valide
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkRes;
      })
      .catch(() =>
        // Offline: prova dalla cache
        caches.match(request).then((cached) => {
          if (cached) return cached;
          // Navigazioni offline: fallback a index.html cachato
          if (request.mode === "navigate") {
            return caches.match("/index.html").then((idx) => idx || Response.error());
          }
          return Response.error();
        })
      )
  );
});

// ---------------------------------------------------------------
// NOTIFICHE PUSH (mattone M.A, 2026-11-24 — docs/spec_notifiche_push.md)
// TRGB manda {titolo, corpo, link, tag}; qui la si mostra e, al tocco, si apre
// la pagina giusta del gestionale. Su iPhone/iPad OGNI push deve mostrare una
// notifica (Safari revoca il permesso a chi riceve push senza mostrarle).
// ---------------------------------------------------------------
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (_) {
    d = { corpo: event.data ? event.data.text() : "" };
  }
  const opzioni = {
    body: d.corpo || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { link: typeof d.link === "string" && d.link.startsWith("/") ? d.link : "/" },
  };
  if (d.tag) opzioni.tag = d.tag;
  event.waitUntil(self.registration.showNotification(d.titolo || "TRGB", opzioni));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((finestre) => {
      // Se TRGB è già aperto lo si porta davanti e gli si dice dove andare
      // (App.jsx ascolta «APRI_LINK»); altrimenti si apre sulla pagina.
      for (const f of finestre) {
        if ("focus" in f) {
          f.postMessage({ type: "APRI_LINK", link });
          return f.focus();
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
