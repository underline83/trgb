// ============================================================
// zonaConfig.js — config per le 4 zone di "Selezioni del Giorno"
// Ogni zona definisce: endpoint, campi specifici, modello di stato
// (venduto per macellaio/pescato, attivo per salumi/formaggi).
// ============================================================

// Tipi di stato:
//   "venduto" → toggle "disponibile ↔ venduto" (macellaio, pescato)
//   "attivo"  → toggle "in carta ↔ archiviato" (salumi, formaggi)

export const ZONA_CONFIG = {
  macellaio: {
    key: "macellaio",
    label: "Macellaio",
    icon: "🥩",
    endpoint: "/macellaio",
    stato: "venduto",
    accent: {
      tint: "bg-red-50",
      ring: "border-red-200",
      active: "bg-red-50 text-red-900 border border-red-200",
      badge: "bg-red-100 text-red-700 border border-red-200",
    },
    desc: "Tagli di carne disponibili alla vendita",
    // Campi extra oltre a nome/grammatura_g/prezzo_euro/note
    campiExtra: [],
  },
  salumi: {
    key: "salumi",
    label: "Salumi",
    icon: "🥓",
    endpoint: "/salumi",
    stato: "attivo",
    accent: {
      tint: "bg-amber-50",
      ring: "border-amber-200",
      active: "bg-amber-50 text-amber-900 border border-amber-200",
      badge: "bg-amber-100 text-amber-700 border border-amber-200",
    },
    desc: "Salumi in carta — presente / archivio",
    // Per salumi/formaggi niente prezzo / grammatura nella UI nuova.
    campiExtra: [
      { name: "produttore",      label: "Produttore",    placeholder: "Salumificio / produttore" },
      { name: "stagionatura",    label: "Stagionatura",  placeholder: "Es. 24 mesi, in grotta" },
      { name: "origine_animale", label: "Origine",       placeholder: "Maiale, cinghiale, oca…" },
      { name: "territorio",      label: "Territorio",    placeholder: "DOP / IGP / regione" },
      { name: "descrizione",     label: "Descrizione",   placeholder: "Racconto per la sala", textarea: true },
    ],
  },
  formaggi: {
    key: "formaggi",
    label: "Formaggi",
    icon: "🧀",
    endpoint: "/formaggi",
    stato: "attivo",
    accent: {
      tint: "bg-yellow-50",
      ring: "border-yellow-200",
      active: "bg-yellow-50 text-yellow-900 border border-yellow-200",
      badge: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    },
    desc: "Formaggi in carta — presente / archivio",
    campiExtra: [
      { name: "produttore",   label: "Caseificio",   placeholder: "Caseificio / produttore" },
      { name: "stagionatura", label: "Stagionatura", placeholder: "Es. 12 mesi, grotta" },
      { name: "latte",        label: "Latte",        placeholder: "Vaccino / caprino / ovino / misto" },
      { name: "territorio",   label: "Territorio",   placeholder: "DOP / IGP / regione" },
      { name: "descrizione",  label: "Descrizione",  placeholder: "Racconto per la sala", textarea: true },
    ],
  },
  pescato: {
    key: "pescato",
    label: "Pescato",
    icon: "🐟",
    endpoint: "/pescato",
    stato: "venduto",
    accent: {
      tint: "bg-sky-50",
      ring: "border-sky-200",
      active: "bg-sky-50 text-sky-900 border border-sky-200",
      badge: "bg-sky-100 text-sky-700 border border-sky-200",
    },
    desc: "Pesce, crostacei e molluschi del giorno",
    campiExtra: [
      { name: "zona_fao", label: "Zona FAO / Provenienza", placeholder: "Es. FAO 37.2.1 Adriatico" },
    ],
  },
};

export const ZONA_ORDER = ["macellaio", "pescato", "salumi", "formaggi"];

export function isValidZona(z) {
  return Object.prototype.hasOwnProperty.call(ZONA_CONFIG, z);
}
