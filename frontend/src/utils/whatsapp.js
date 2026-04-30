// @version: v1.0-whatsapp-composer
// Mattone M.C — Utility centralizzata WhatsApp
//
// PUNTO UNICO per generare link wa.me e comporre messaggi.
// Tutti i moduli usano queste funzioni — MAI costruire wa.me a mano.
//
// Uso:
//   import { openWhatsApp, buildWaLink, normalizePhone, fillTemplate } from "../utils/whatsapp";
//
//   // Apri WA con messaggio
//   openWhatsApp("3331234567", "Ciao {nome}!", { nome: "Marco" });
//
//   // Solo il link (per href)
//   const url = buildWaLink("3331234567", "Testo messaggio");
//
//   // Solo normalizzare il telefono
//   const tel = normalizePhone("+39 333-123.4567");  // → "393331234567"

/**
 * Normalizza un numero di telefono italiano per wa.me.
 * Gestisce: spazi, trattini, punti, parentesi, prefisso +39, numeri corti.
 *
 * @param {string} telefono — numero grezzo (es. "+39 333 1234567", "333-1234567", "0351234567")
 * @returns {string|null} — numero pulito (es. "393331234567") o null se non valido
 */
export function normalizePhone(telefono) {
  if (!telefono) return null;

  // Rimuovi tutto tranne cifre e +
  let tel = telefono.replace(/[^\d+]/g, "");

  // Rimuovi il + iniziale (wa.me non lo vuole)
  if (tel.startsWith("+")) tel = tel.slice(1);

  // Se inizia con 39 e ha lunghezza giusta (12-13 cifre), è già ok
  if (tel.startsWith("39") && tel.length >= 11) return tel;

  // Cellulare italiano (3xx...) senza prefisso internazionale
  if (tel.startsWith("3") && tel.length === 10) return "39" + tel;

  // Fisso italiano (0xx...) senza prefisso internazionale
  if (tel.startsWith("0") && tel.length >= 9) return "39" + tel;

  // Se ha almeno 10 cifre ma non riconosciamo il pattern, proviamo con 39
  if (tel.length >= 10 && !tel.startsWith("39")) return "39" + tel;

  // Già con prefisso internazionale (non italiano)
  if (tel.length >= 10) return tel;

  return null; // troppo corto o non valido
}


/**
 * Sostituisce variabili template nel testo.
 * Variabili: {nome}, {cognome}, {nome2}, {pax}, {data}, {ora}, {importo}, {mese}, {anno}, etc.
 *
 * @param {string} template — testo con placeholder {variabile}
 * @param {Object} vars — oggetto con le variabili da sostituire
 * @returns {string} — testo con variabili sostituite
 */
export function fillTemplate(template, vars = {}) {
  if (!template) return "";
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : match;
  });
}


/**
 * Costruisce un URL wa.me completo.
 *
 * @param {string} telefono — numero grezzo (verrà normalizzato)
 * @param {string} testo — messaggio già composto (o template + vars)
 * @param {Object} [vars] — se fornito, applica fillTemplate al testo
 * @returns {string|null} — URL wa.me o null se telefono non valido
 */
export function buildWaLink(telefono, testo = "", vars = null) {
  const tel = normalizePhone(telefono);
  if (!tel) return null;

  const messaggio = vars ? fillTemplate(testo, vars) : testo;
  const encoded = encodeURIComponent(messaggio);

  return `https://wa.me/${tel}${messaggio ? `?text=${encoded}` : ""}`;
}


/**
 * Apre WhatsApp con messaggio pre-compilato (nuova tab).
 *
 * @param {string} telefono — numero grezzo
 * @param {string} testo — messaggio (o template)
 * @param {Object} [vars] — variabili template opzionali
 * @returns {boolean} — true se aperto, false se telefono non valido
 */
export function openWhatsApp(telefono, testo = "", vars = null) {
  const url = buildWaLink(telefono, testo, vars);
  if (!url) return false;
  window.open(url, "_blank", "noopener");
  return true;
}


/**
 * Costruisce link wa.me per una lista di destinatari (broadcast manuale).
 * Ritorna un array di { nome, telefono, url } per ogni destinatario valido.
 *
 * @param {Array} destinatari — [{nome, cognome, telefono, ...}]
 * @param {string} template — template messaggio con {variabili}
 * @returns {Array} — [{nome, cognome, telefono, url}]
 */
export function buildBroadcastLinks(destinatari, template) {
  return destinatari
    .filter(d => d.telefono)
    .map(d => {
      const url = buildWaLink(d.telefono, template, d);
      return url ? { ...d, url } : null;
    })
    .filter(Boolean);
}


// ─── Template predefiniti (costanti, usati come fallback) ───
// R5 (sessione 60): i template TRGB-specific (firma osteria) sono ora override-abili
// via locali/<locale>/strings.json (key: wa.template.*) tramite il helper t().
// I valori qui sono FALLBACK generici (firma "TRGB"). I file strings.json di
// tregobbi sostituiscono con la firma "Osteria Tre Gobbi". Vedi
// frontend/src/utils/localeStrings.js per il helper.

import { t } from "./localeStrings";

// Template come getter dinamici: leggono dalla strings.json tenant-aware
// se caricata, altrimenti fallback al testo generico.
export const WA_TEMPLATES = new Proxy({
  compleanno: "Buon compleanno {nome}! 🎉 Tanti auguri! 🎂",
  conferma_prenotazione: "Ciao {nome}, confermiamo la prenotazione per {pax} persone il {data} alle {ora}. Vi aspettiamo!",
  reminder_prenotazione: "Ciao {nome}, vi ricordiamo la prenotazione per domani alle {ora} ({pax} persone). A presto!",
  broadcast_clienti: "Ciao {nome}, a presto!",
  cedolino: "Ciao {nome}, ecco la tua busta paga di {mese}/{anno}.\nNetto: € {importo}.\n(Il PDF è stato scaricato sul mio PC, te lo allego qui.)",
}, {
  get(target, prop) {
    if (typeof prop !== "string") return target[prop];
    // Cedolino è universale (no firma osteria), resta hardcoded
    if (prop === "cedolino") return target[prop];
    // Le altre sono override-abili via locali/<locale>/strings.json
    return t(`wa.template.${prop}`, target[prop] || "");
  },
});
