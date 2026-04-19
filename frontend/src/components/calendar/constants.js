// FILE: frontend/src/components/calendar/constants.js
// @version: v1.0 — Costanti M.E Calendar (label IT + preset colori brand)

export const MESI_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export const MESI_IT_BREVI = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

// Indici JS Date: 0=domenica, 1=lunedì, ... 6=sabato.
// Le label sono in ordine "lunedì-prima" per UI italiana.
export const GIORNI_IT = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
export const GIORNI_IT_3 = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
export const GIORNI_IT_1 = ["L", "M", "M", "G", "V", "S", "D"];

// Preset colori — chiave usata in `event.color`.
// Per ogni preset due varianti: soft (default, bg tinted) e solid (full bg).
export const COLORI_EVENTO = {
  blue: {
    soft:  "bg-blue-50 border-blue-300 text-blue-800",
    solid: "bg-brand-blue border-brand-blue text-white",
    dot:   "bg-brand-blue",
  },
  red: {
    soft:  "bg-red-50 border-red-300 text-red-800",
    solid: "bg-brand-red border-brand-red text-white",
    dot:   "bg-brand-red",
  },
  green: {
    soft:  "bg-emerald-50 border-emerald-300 text-emerald-800",
    solid: "bg-brand-green border-brand-green text-white",
    dot:   "bg-brand-green",
  },
  amber: {
    soft:  "bg-amber-50 border-amber-300 text-amber-800",
    solid: "bg-amber-500 border-amber-500 text-white",
    dot:   "bg-amber-500",
  },
  violet: {
    soft:  "bg-violet-50 border-violet-300 text-violet-800",
    solid: "bg-violet-500 border-violet-500 text-white",
    dot:   "bg-violet-500",
  },
  slate: {
    soft:  "bg-slate-50 border-slate-300 text-slate-700",
    solid: "bg-slate-600 border-slate-600 text-white",
    dot:   "bg-slate-500",
  },
};

export const DEFAULT_COLOR = "blue";
export const DEFAULT_TONE = "soft";

export const VIEWS = ["mese", "settimana", "giorno"];
