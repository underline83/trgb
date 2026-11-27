// @version: v1.0 — stati delle prenotazioni dalla tabella prenotazioni_stati (mig 232, 2026-11-13)
// Modulo: prenotazioni
// Etichette, emoji, colori, gruppi e passaggi permessi arrivano da GET /prenotazioni/stati/
// (una chiamata sola, condivisa da tutte le pagine). Finché non risponde valgono i
// FALLBACK qui sotto, uguali al seed della migrazione.
import { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../../config/api";

// Classi scritte per intero: Tailwind tiene solo quelle che trova nel codice
export const TONI = {
  indigo:  "bg-indigo-100 text-indigo-700",
  blue:    "bg-blue-100 text-blue-700",
  teal:    "bg-teal-100 text-teal-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber:   "bg-amber-100 text-amber-700",
  violet:  "bg-violet-100 text-violet-700",
  red:     "bg-red-100 text-red-600",
  neutral: "bg-neutral-100 text-neutral-600",
};

const F = (codice, etichetta, emoji, tono, gruppi, transizioni) => ({
  codice, etichetta, emoji, tono,
  occupa: gruppi.includes("o"), venuto: gruppi.includes("v"), fuori: gruppi.includes("f"),
  incerta: gruppi.includes("i"), solo_trgb: gruppi.includes("t"), transizioni,
});

export const FALLBACK = [
  F("WAITLIST", "Lista d'attesa", "🕰️", "violet", "t", ["OPTION", "RECORDED", "CANCELED"]),
  F("REQUESTED", "Da confermare", "📨", "blue", "o", ["RECORDED", "OPTION", "WAITLIST", "REFUSED", "CANCELED"]),
  F("OPTION", "In opzione", "⏳", "amber", "oit", ["RECORDED", "CANCELED"]),
  F("RECORDED", "Prenotato", "📅", "indigo", "o", ["ARRIVED", "SEATED", "OPTION", "CANCELED", "NO_SHOW", "REFUSED"]),
  F("ARRIVED", "Arrivato", "🚶", "teal", "ov", ["SEATED", "CANCELED", "NO_SHOW", "RECORDED"]),
  F("PARTIALLY_ARRIVED", "Parziale", "👥", "amber", "ov", ["SEATED", "LEFT"]),
  F("SEATED", "Seduto", "✅", "emerald", "ov", ["LEFT", "RECORDED"]),   // «Al conto» non si usa (mig 251)
  F("BILL", "Al conto", "🧾", "amber", "ov", ["LEFT", "SEATED"]),
  F("LEFT", "Completata", "🚪", "neutral", "ov", ["SEATED"]),
  F("CANCELED", "Cancellata", "✖", "neutral", "f", ["RECORDED"]),
  F("NO_SHOW", "No-show", "👻", "red", "f", ["RECORDED"]),
  F("REFUSED", "Rifiutata", "⛔", "red", "f", ["RECORDED"]),
];

let cache = null;      // lista dal backend
let inCorso = null;    // promise condivisa

function carica() {
  if (cache) return Promise.resolve(cache);
  if (!inCorso) {
    inCorso = apiFetch(`${API_BASE}/prenotazioni/stati/`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.stati?.length) cache = d.stati;
        return cache || FALLBACK;
      })
      .catch(() => FALLBACK)
      .finally(() => { inCorso = null; });
  }
  return inCorso;
}

// Hook: { stati, perCodice, info(codice), puo(da, a), gruppo(nome) }
export default function usePrenotazioniStati() {
  const [stati, setStati] = useState(cache || FALLBACK);
  useEffect(() => {
    let vivo = true;
    carica().then((s) => { if (vivo) setStati(s); });
    return () => { vivo = false; };
  }, []);
  const perCodice = Object.fromEntries(stati.map((s) => [s.codice, s]));
  return {
    stati,
    perCodice,
    info: (c) => perCodice[c] || { codice: c, etichetta: c, tono: "neutral", transizioni: [] },
    puo: (da, a) => (perCodice[da]?.transizioni || []).includes(a),
    gruppo: (nome) => stati.filter((s) => s[nome]).map((s) => s.codice),
  };
}

// Bottoni dei cambi di stato: stesse etichette e colori in Elenco, Servizio e Mappa.
// Regola colori del modulo (Marco 2026-11-26, «uniformare i colori»): ogni colore un mestiere solo.
//   blu del marchio = il bottone che scrive (uno per schermata) · indaco scuro = «dove sono / cosa ho scelto» ·
//   bianco col bordo = tutti gli altri bottoni · rosso = ciò che toglie o chiude · i colori degli stati solo per gli stati.
// `cls` porta sfondo, bordo e colore del testo: chi lo usa non aggiunge text-white.
export const BTN_PRIMARIO = "bg-brand-blue text-white hover:bg-blue-700 border border-brand-blue";
export const BTN_QUIETO = "bg-white text-neutral-800 hover:bg-neutral-50 border border-neutral-300";
export const BTN_ROSSO = "bg-white text-red-700 hover:bg-red-50 border border-red-300";
export const SCELTO = "bg-indigo-900 text-white border-indigo-900";
export const AZIONI_STATO = {
  SEATED:   { label: "✅ Seduto", cls: BTN_QUIETO },
  ARRIVED:  { label: "🚶 Arrivato", cls: BTN_QUIETO },
  BILL:     { label: "🧾 Al conto", cls: BTN_QUIETO },
  LEFT:     { label: "🚪 Andato via", cls: BTN_QUIETO },
  OPTION:   { label: "⏳ In opzione", cls: BTN_QUIETO },
  WAITLIST: { label: "🕰️ Lista d'attesa", cls: BTN_QUIETO },
  CANCELED: { label: "✖ Cancella", cls: BTN_ROSSO },
  NO_SHOW:  { label: "👻 No-show", cls: BTN_ROSSO },
  REFUSED:  { label: "⛔ Rifiuta", cls: BTN_ROSSO },
};
export function azioneStato(da, a) {
  // Passi all'indietro (mig 250): da seduto/arrivato a prenotato, da completata o al conto a seduto
  if ((a === "RECORDED" && ["SEATED", "ARRIVED"].includes(da)) || (a === "SEATED" && ["LEFT", "BILL"].includes(da))) {
    return { label: a === "RECORDED" ? "↩ Torna a prenotato" : "↩ Torna a seduto", cls: BTN_QUIETO, indietro: true };
  }
  if (a === "RECORDED") {
    return ["CANCELED", "NO_SHOW", "REFUSED"].includes(da)
      ? { label: "↩ Ripristina", cls: BTN_QUIETO }
      : { label: "✓ Conferma", cls: BTN_PRIMARIO };
  }
  return AZIONI_STATO[a] || { label: a, cls: BTN_QUIETO };
}
