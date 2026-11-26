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
  F("SEATED", "Seduto", "✅", "emerald", "ov", ["LEFT", "BILL", "RECORDED"]),
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

// Bottoni dei cambi di stato: stesse etichette e colori in Planning e in Servizio (2026-11-26, prima in PrenotazioniPlanning.jsx)
export const AZIONI_STATO = {
  SEATED:   { label: "✅ Seduto", cls: "bg-emerald-600 hover:bg-emerald-700" },
  ARRIVED:  { label: "🚶 Arrivato", cls: "bg-teal-600 hover:bg-teal-700" },
  BILL:     { label: "🧾 Al conto", cls: "bg-amber-600 hover:bg-amber-700" },
  LEFT:     { label: "🚪 Andato via", cls: "bg-neutral-500 hover:bg-neutral-600" },
  OPTION:   { label: "⏳ In opzione", cls: "bg-amber-500 hover:bg-amber-600" },
  WAITLIST: { label: "🕰️ Lista d'attesa", cls: "bg-violet-500 hover:bg-violet-600" },
  CANCELED: { label: "✖ Cancella", cls: "bg-neutral-400 hover:bg-neutral-500" },
  NO_SHOW:  { label: "👻 No-show", cls: "bg-red-500 hover:bg-red-600" },
  REFUSED:  { label: "⛔ Rifiuta", cls: "bg-red-400 hover:bg-red-500" },
};
export function azioneStato(da, a) {
  // Passi all'indietro (mig 250): da seduto/arrivato a prenotato, da completata o al conto a seduto
  if ((a === "RECORDED" && ["SEATED", "ARRIVED"].includes(da)) || (a === "SEATED" && ["LEFT", "BILL"].includes(da))) {
    return { label: a === "RECORDED" ? "↩ Torna a prenotato" : "↩ Torna a seduto", cls: "bg-neutral-500 hover:bg-neutral-600", indietro: true };
  }
  if (a === "RECORDED") {
    return ["CANCELED", "NO_SHOW", "REFUSED"].includes(da)
      ? { label: "↩ Ripristina", cls: "bg-indigo-500 hover:bg-indigo-600" }
      : { label: "✓ Conferma", cls: "bg-indigo-600 hover:bg-indigo-700" };
  }
  return AZIONI_STATO[a] || { label: a, cls: "bg-neutral-500 hover:bg-neutral-600" };
}
