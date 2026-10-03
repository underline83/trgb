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

// Tasto Cantina mobile (mig 175): solo ai ruoli con accesso a vini/magazzino.
const CANTINA_MOBILE = { key: "cantina-mobile", label: "Cantina mobile", sub: "Trova e muovi bottiglie", emoji: "📱", route: "/vini/cantina-mobile", color: "bg-amber-50 border-amber-200 text-amber-900" };

// admin / superadmin / sommelier: admin + Cantina mobile dopo Cantina Vini
const VINI_FALLBACK = [...ADMIN_FALLBACK.slice(0, 3), CANTINA_MOBILE, ...ADMIN_FALLBACK.slice(3)];

const SALA_FALLBACK = [
  { key: "chiusura-turno", label: "Chiusura Turno",  sub: "Fine servizio",     emoji: "💵", route: "/vendite/fine-turno", color: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  { key: "prenotazioni",   label: "Prenotazioni",    sub: "Planning completo", emoji: "📅", route: "/prenotazioni",       color: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  { key: "carta-vini",     label: "Carta dei Vini",  sub: "Cerca vini",        emoji: "🍷", route: "/vini/carta",         color: "bg-amber-50 border-amber-200 text-amber-900" },
  CANTINA_MOBILE,
  { key: "mance",          label: "Mance",           sub: "Registra mance",    emoji: "💰", route: "/flussi-cassa/mance", color: "bg-emerald-50 border-emerald-200 text-emerald-900" },
];

// Cucina (2026-10-03): specchio di CUCINA_ACTIONS_DEFAULTS nel backend.
const CUCINA_FALLBACK = [
  { key: "oggi",          label: "Oggi",        sub: "Checklist e compiti del giorno", emoji: "📋", route: "/cucina/mobile/oggi", color: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  { key: "frigo-scorte",  label: "Gestione Frigoriferi e scorte", sub: "Frigo, congelatori, scorte", emoji: "🧊", route: "/cucina/mobile/frigo", color: "bg-sky-50 border-sky-200 text-sky-900" },
  { key: "lista-spesa",   label: "Lista spesa", sub: "Cosa manca",                     emoji: "🛒", route: "/cucina/mobile/spesa", color: "bg-emerald-50 border-emerald-200 text-emerald-900" },
  { key: "ricette",       label: "Ricette",     sub: "Archivio",                       emoji: "📚", route: "/ricette/archivio",    color: "bg-orange-50 border-orange-200 text-orange-900" },
  { key: "menu-carta",    label: "Menu Carta",  sub: "Piatti in carta",                emoji: "📋", route: "/menu-carta",          color: "bg-amber-50 border-amber-200 text-amber-900" },
  { key: "selezioni",     label: "Selezioni",   sub: "Macellaio, pescato, formaggi",   emoji: "🥩", route: "/selezioni",           color: "bg-rose-50 border-rose-200 text-rose-900" },
];

export const HOME_ACTIONS_FALLBACK = {
  admin:      VINI_FALLBACK,
  superadmin: VINI_FALLBACK,
  contabile:  ADMIN_FALLBACK,
  sommelier:  VINI_FALLBACK,
  chef:       CUCINA_FALLBACK,
  sous_chef:  CUCINA_FALLBACK,
  commis:     CUCINA_FALLBACK,
  viewer:     ADMIN_FALLBACK,
  sala:       SALA_FALLBACK,
};

export default HOME_ACTIONS_FALLBACK;
