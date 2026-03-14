// src/config/viniConstants.js
// Vocabolario operativo per il modulo Magazzino Vini
// Codici interni compatibili con il sistema Excel originale

// ─────────────────────────────────────────────────────────────
// STATO VENDITA — comportamento commerciale
// ─────────────────────────────────────────────────────────────
export const STATO_VENDITA = {
  N: {
    label: "Non vendere",
    short: "N",
    color: "bg-red-100 text-red-800 border-red-200",
    dot:   "bg-red-500",
  },
  T: {
    label: "Vendere con cautela",
    short: "T",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    dot:   "bg-yellow-400",
  },
  V: {
    label: "Vendere",
    short: "V",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dot:   "bg-emerald-500",
  },
  F: {
    label: "Spingere",
    short: "F",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    dot:   "bg-blue-500",
  },
  S: {
    label: "Vendere aggressivo",
    short: "S",
    color: "bg-violet-100 text-violet-800 border-violet-200",
    dot:   "bg-violet-500",
  },
  C: {
    label: "Controllare",
    short: "C",
    color: "bg-neutral-100 text-neutral-600 border-neutral-300",
    dot:   "bg-neutral-400",
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
  O: {
    label: "Finito — ordinare",
    short: "O",
    color: "bg-red-100 text-red-800 border-red-200",
    dot:   "bg-red-500",
  },
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
