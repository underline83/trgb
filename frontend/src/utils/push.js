// Modulo: platform (mattone M.A notifiche — push sui dispositivi) — [core]
// @version: v1.0 (2026-11-24) — fase 1: attiva / disattiva / prova su questo dispositivo
//
// L'UNICO punto del frontend che parla con le push. Oggi usa il browser (web push
// della PWA); quando ci sarà l'app nativa (Capacitor) cambia solo questo file: le
// pagine continuano a chiamare statoPush / attivaPush / disattivaPush / provaPush.
// Specifica: docs/spec_notifiche_push.md.

import { apiFetch, API_BASE } from "../config/api";

const BASE = `${API_BASE}/notifiche/push`;

// --- Dove siamo ---------------------------------------------------------

export function eIOS() {
  const ua = navigator.userAgent || "";
  // iPadOS si presenta come Mac: lo si riconosce dal tocco
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function apertaDallaHome() {
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true
  );
}

export function pushSupportate() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// --- Utilità ------------------------------------------------------------

function chiaveInByte(b64url) {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const grezzo = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(grezzo, (c) => c.charCodeAt(0));
}

function byteInChiave(buffer) {
  const b = new Uint8Array(buffer || []);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Stessa impronta del backend (sha256 dell'indirizzo, primi 16 caratteri esadecimali):
// serve a riconoscere «questo dispositivo» nell'elenco senza far girare l'indirizzo.
async function impronta(testo) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(testo));
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

async function iscrizioneAttuale() {
  if (!pushSupportate()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function leggi(res, cosa) {
  let dati = null;
  try {
    dati = await res.json();
  } catch (_) {
    /* risposta senza corpo */
  }
  if (!res.ok) throw new Error((dati && dati.detail) || `${cosa}: errore ${res.status}`);
  return dati;
}

// --- Le quattro funzioni che usano le pagine ----------------------------

/**
 * Com'è messo questo dispositivo.
 * motivo: null = si può attivare/disattivare | "home" = su iPhone/iPad va aperto
 * dall'icona sulla Home | "non_supportate" | "bloccate" (permesso negato nel dispositivo)
 * | "server" (chiavi del locale non leggibili: lo dice `errore`).
 */
export async function statoPush() {
  const base = { attive: false, motivo: null, errore: null, dispositivi: [], questo: null };
  if (!pushSupportate()) {
    return { ...base, motivo: eIOS() && !apertaDallaHome() ? "home" : "non_supportate" };
  }
  const server = await leggi(await apiFetch(`${BASE}/stato`), "Stato delle notifiche");
  const dispositivi = server.dispositivi || [];
  if (!server.chiave_pubblica) return { ...base, dispositivi, motivo: "server", errore: server.errore };
  const sub = await iscrizioneAttuale();
  const mia = sub ? await impronta(sub.endpoint) : null;
  const questo = dispositivi.find((d) => d.impronta === mia) || null;
  const motivo = Notification.permission === "denied" ? "bloccate" : null;
  return {
    ...base,
    dispositivi,
    questo,
    motivo,
    attive: !!(sub && questo && questo.attivo && Notification.permission === "granted"),
  };
}

/** Attiva le notifiche su questo dispositivo. Va chiamata da un tocco dell'utente. */
export async function attivaPush(nome) {
  if (!pushSupportate()) throw new Error("Questo browser non supporta le notifiche.");
  // Il permesso PRIMA di tutto: su iPhone va chiesto dentro il tocco, senza attese davanti.
  const permesso = await Notification.requestPermission();
  if (permesso !== "granted") {
    throw new Error("Permesso non dato: le notifiche restano spente su questo dispositivo.");
  }
  const server = await leggi(await apiFetch(`${BASE}/stato`), "Stato delle notifiche");
  if (!server.chiave_pubblica) throw new Error(server.errore || "Notifiche non disponibili sul server.");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Iscrizione fatta con un'altra chiave (chiavi del locale rigenerate): si rifà.
  if (sub && sub.options && sub.options.applicationServerKey &&
      byteInChiave(sub.options.applicationServerKey) !== server.chiave_pubblica) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chiaveInByte(server.chiave_pubblica),
    });
  }
  const res = await apiFetch(`${BASE}/dispositivi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ iscrizione: sub.toJSON(), nome: nome || null }),
  });
  return leggi(res, "Attivazione delle notifiche");
}

/** Spegne le notifiche su questo dispositivo e lo toglie dall'elenco. */
export async function disattivaPush() {
  const sub = await iscrizioneAttuale();
  if (!sub) return;
  const mia = await impronta(sub.endpoint);
  const server = await leggi(await apiFetch(`${BASE}/stato`), "Stato delle notifiche");
  const questo = (server.dispositivi || []).find((d) => d.impronta === mia);
  await sub.unsubscribe();
  if (questo) await togliDispositivo(questo.id);
}

/** Toglie un dispositivo dall'elenco (anche un altro dei propri, es. un telefono vecchio). */
export async function togliDispositivo(id) {
  const res = await apiFetch(`${BASE}/dispositivi/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) await leggi(res, "Rimozione del dispositivo");
}

/** Manda una push di prova a tutti i propri dispositivi accesi. */
export async function provaPush() {
  return leggi(await apiFetch(`${BASE}/prova`, { method: "POST" }), "Push di prova");
}

/**
 * Tocco su una notifica con TRGB già aperto: il service worker manda «APRI_LINK»
 * e qui si va alla pagina. Chiamata una volta sola da main.jsx.
 */
export function ascoltaTocchiNotifica() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const d = event.data || {};
    if (d.type !== "APRI_LINK" || typeof d.link !== "string" || !d.link.startsWith("/") || d.link.startsWith("//")) return;
    const qui = window.location.pathname + window.location.search;
    if (d.link !== qui) window.location.assign(d.link);
  });
}
