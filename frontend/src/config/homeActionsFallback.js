// FILE: frontend/src/config/homeActionsFallback.js
// @version: v1.0 — fallback statico azioni rapide Home per ruolo (sessione 49)
//
// Usato da useHomeActions() quando il backend /settings/home-actions/ fallisce o
// tarda a rispondere. Valori identici al seed DB (app/services/home_actions_defaults.py).
// Zero rischio di regressione: se il BE va giu', la Home resta funzionante con
// gli stessi pulsanti che aveva prima della sessione 49.

const ADMIN_FALLBACK = [
  { key: "chiusura-turno",     label: "Chiusura Turno",     sub: "Fine servizio",     emoji: "💵", route: "/vendite/fine-turno",           color: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  { key: "prenotazioni",       label: "Prenotazioni",       sub: "Planning completo", emoji: "📅", route: "/prenotazioni",                 color: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  { key: "cantina-vini",       label: "Cantina Vini",       sub: "Magazzino",         emoji: "🍷", route: "/vini/magazzino",               color: "bg-amber-50 border-amber-200 text-amber-900" },
  { key: "food-cost",          label: "Food Cost",          sub: "Ricette e costi",   emoji: "📘", route: "/ricette/archivio",             color: "bg-orange-50 border-orange-200 text-orange-900" },
  { key: "controllo-gestione", label: "Controllo Gestione", sub: "Dashboard P&L",     emoji: "📊", route: "/controllo-gestione/dashboard", color: "bg-emerald-50 border-emerald-200 text-emerald-900" },
];

const SALA_FALLBACK = [
  { key: "chiusura-turno", label: "Chiusura Turno",  sub: "Fine servizio",     emoji: "💵", route: "/vendite/fine-turno", color: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  { key: "prenotazioni",   label: "Prenotazioni",    sub: "Planning completo", emoji: "📅", route: "/prenotazioni",       color: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  { key: "carta-vini",     label: "Carta dei Vini",  sub: "Cerca vini",        emoji: "🍷", route: "/vini/carta",         color: "bg-amber-50 border-amber-200 text-amber-900" },
  { key: "mance",          label: "Mance",           sub: "Registra mance",    emoji: "💰", route: "/flussi-cassa/mance", color: "bg-emerald-50 border-emerald-200 text-emerald-900" },
];

export const HOME_ACTIONS_FALLBACK = {
  admin:      ADMIN_FALLBACK,
  superadmin: ADMIN_FALLBACK,
  contabile:  ADMIN_FALLBACK,
  sommelier:  ADMIN_FALLBACK,
  chef:       ADMIN_FALLBACK,
  sous_chef:  ADMIN_FALLBACK,
  commis:     ADMIN_FALLBACK,
  viewer:     ADMIN_FALLBACK,
  sala:       SALA_FALLBACK,
};

export default HOME_ACTIONS_FALLBACK;
