// src/config/viniConstants.js
// Vocabolario operativo per il modulo Magazzino Vini
// Codici interni compatibili con il sistema Excel originale

// ─────────────────────────────────────────────────────────────
// STATO VENDITA — comportamento commerciale
// Post V-H.F (mig 128, 2026-05-15): INTEGER 0..3 (lettere ritirate).
// 0=NON_VENDERE, 1=CONTROLLARE, 2=VENDERE (default nuovi vini), 3=SPINGERE.
// L'ordine numerico è anche un'intensità: 0 minima → 3 massima spinta commerciale.
// ─────────────────────────────────────────────────────────────
export const STATO_VENDITA = {
  0: {
    label: "Non vendere",
    short: "0",
    color: "bg-red-100 text-red-800 border-red-200",
    dot:   "bg-red-500",
  },
  1: {
    label: "Controllare",
    short: "1",
    color: "bg-neutral-100 text-neutral-600 border-neutral-300",
    dot:   "bg-neutral-400",
  },
  2: {
    label: "Vendere",
    short: "2",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dot:   "bg-emerald-500",
  },
  3: {
    label: "Spingere",
    short: "3",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    dot:   "bg-blue-500",
  },
};

// ─────────────────────────────────────────────────────────────
// STATO RIORDINO — gestione stock / acquisti
// ─────────────────────────────────────────────────────────────
export const STATO_RIORDINO = {
  D: {
    label: "Da ordinare",
    short: "D",
    color: "bg-orange-100 text-orange-800 border-orange-200",
    dot:   "bg-orange-400",
  },
  // 'O' (Finito — ordinare) rimosso 2026-05-11: ridondante con 'D'.
  // Vecchi record con stato 'O' vengono trattati come 'D' dalle query.
  "0": {
    label: "Ordinato",
    short: "0",
    color: "bg-sky-100 text-sky-800 border-sky-200",
    dot:   "bg-sky-400",
  },
  A: {
    label: "Annata esaurita",
    short: "A",
    color: "bg-neutral-100 text-neutral-600 border-neutral-300",
    dot:   "bg-neutral-400",
  },
  X: {
    label: "Non ricomprare",
    short: "X",
    color: "bg-neutral-800 text-white border-neutral-700",
    dot:   "bg-neutral-700",
  },
};

// ─────────────────────────────────────────────────────────────
// STATO CONSERVAZIONE — condizione della bottiglia
// ─────────────────────────────────────────────────────────────
export const STATO_CONSERVAZIONE = {
  "3": {
    label: "Perfetta — non urgente",
    short: "3",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dot:   "bg-emerald-500",
  },
  "2": {
    label: "Buona — vendere",
    short: "2",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    dot:   "bg-amber-400",
  },
  "1": {
    label: "Difficile — vendere ora",
    short: "1",
    color: "bg-red-100 text-red-800 border-red-200",
    dot:   "bg-red-500",
  },
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Ritorna il label completo dato il codice, o il codice grezzo se non trovato */
export const statoVenditaLabel = (code) =>
  STATO_VENDITA[code]?.label ?? code ?? null;

export const statoRiordinoLabel = (code) =>
  STATO_RIORDINO[code]?.label ?? code ?? null;

export const statoConservazioneLabel = (code) =>
  STATO_CONSERVAZIONE[code]?.label ?? code ?? null;

/** Opzioni per <select> — [{value, label}] */
export const STATO_VENDITA_OPTIONS = [
  { value: "", label: "— nessuna indicazione —" },
  ...Object.entries(STATO_VENDITA).map(([k, v]) => ({
    value: k,
    label: `${v.short} — ${v.label}`,
  })),
];

export const STATO_RIORDINO_OPTIONS = [
  { value: "", label: "— nessuna indicazione —" },
  ...Object.entries(STATO_RIORDINO).map(([k, v]) => ({
    value: k,
    label: `${v.short} — ${v.label}`,
  })),
];

export const STATO_CONSERVAZIONE_OPTIONS = [
  { value: "", label: "— nessuna indicazione —" },
  ...Object.entries(STATO_CONSERVAZIONE).map(([k, v]) => ({
    value: k,
    label: `${v.short} — ${v.label}`,
  })),
];
