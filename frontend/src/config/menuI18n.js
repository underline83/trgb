// frontend/src/config/menuI18n.js
// Modulo: menu_carta
// @version: v1.0-menu-i18n (2026-08-07) — dizionario lingue Menu Carta [core]
//
// GEMELLO di app/services/menu_i18n_service.py — se tocchi uno, tocca l'altro.
//
// Qui stanno SOLO le etichette di struttura: nomi delle sezioni e micro-copy
// della pagina. Sono prodotto, non contenuto del ristorante: "Antipasti" si
// dice "Starters" per chiunque venda TRGB, quindi non ha senso farle riscrivere
// a ogni cliente e non stanno a DB.
//
// Il CONTENUTO (piatti, descrizioni, degustazioni) arriva gia' tradotto dal
// backend dentro i campi originali della risposta di /menu-carta/public/today:
// il componente non deve scegliere niente, legge i campi che ha sempre letto.
//
// de/uk: chiavi presenti e vuote, i testi arrivano a parte. Stringa vuota =
// fallback sull'italiano, che e' meglio di un buco in carta.

export const LINGUA_MADRE = "it";

export const LINGUE = ["it", "en", "fr", "es", "de", "uk"];

// Solo le lingue di traduzione: l'italiano non si traduce, si scrive nel menu.
// E' l'elenco che vede il backoffice nel tab Traduzioni.
export const LINGUE_TRADOTTE = LINGUE.filter((l) => l !== LINGUA_MADRE);

// Sigle testuali, MAI bandiere: una bandiera e' uno stato, non una lingua.
// Il francese non e' la Francia, lo spagnolo non e' la Spagna, e su un menu
// da osteria una fila di bandierine fa provinciale.
export const LINGUE_LABEL = {
  it: "IT", en: "EN", fr: "FR", es: "ES", de: "DE", uk: "UK",
};

// Nome della lingua nella lingua stessa — per il `title`/aria-label del
// selettore: chi cerca il francese cerca "Français", non "Francese".
export const LINGUE_NOME = {
  it: "Italiano", en: "English", fr: "Français",
  es: "Español", de: "Deutsch", uk: "Українська",
};

/**
 * Riduce un input qualsiasi a una lingua a sistema. Non lancia mai.
 * Accetta 'EN', 'en-GB', 'fr_FR', ' es '. Sconosciuto o vuoto -> italiano.
 */
export function normalizzaLang(raw) {
  if (!raw) return LINGUA_MADRE;
  const code = String(raw).trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  return LINGUE.includes(code) ? code : LINGUA_MADRE;
}

export const SEZIONI_LABEL = {
  antipasti: {
    it: "Antipasti", en: "Starters", fr: "Entrées", es: "Entrantes", de: "", uk: "",
  },
  paste_risi_zuppe: {
    it: "Paste, Risi e Zuppe", en: "Pasta, Rice and Soups",
    fr: "Pâtes, riz et soupes", es: "Pastas, arroces y sopas", de: "", uk: "",
  },
  piatti_del_giorno: {
    it: "Piatti del Giorno", en: "Dishes of the Day",
    fr: "Plats du jour", es: "Platos del día", de: "", uk: "",
  },
  secondi: {
    it: "Secondi", en: "Main Courses", fr: "Plats", es: "Segundos", de: "", uk: "",
  },
  contorni: {
    it: "Contorni", en: "Sides", fr: "Accompagnements", es: "Guarniciones", de: "", uk: "",
  },
  dolci: {
    it: "Dolci", en: "Desserts", fr: "Desserts", es: "Postres", de: "", uk: "",
  },
  degustazioni: {
    it: "Degustazioni", en: "Tasting Menu", fr: "Dégustation", es: "Degustación", de: "", uk: "",
  },
  bambini: {
    it: "Per i Bambini", en: "Children's Menu", fr: "Menu enfants", es: "Menú infantil", de: "", uk: "",
  },
  servizio: {
    it: "Servizio", en: "Service", fr: "Service", es: "Servicio", de: "", uk: "",
  },
};

export const UI_LABEL = {
  titolo_pagina: {
    it: "La Carta del Menu", en: "The Menu", fr: "La Carte", es: "La Carta", de: "", uk: "",
  },
  caricamento: {
    it: "Caricamento del menu…", en: "Loading the menu…",
    fr: "Chargement du menu…", es: "Cargando el menú…", de: "", uk: "",
  },
  menu_non_disponibile: {
    it: "Nessun menu attualmente in carta. Torna a trovarci presto.",
    en: "No menu is currently available. Please come back soon.",
    fr: "Aucun menu n'est disponible pour le moment. Revenez bientôt.",
    es: "No hay ningún menú disponible en este momento. Vuelve pronto.",
    de: "", uk: "",
  },
  percorso_degustazione: {
    it: "Percorso di degustazione", en: "Tasting menu",
    fr: "Menu dégustation", es: "Menú degustación", de: "", uk: "",
  },
  allergeni: {
    it: "Allergeni", en: "Allergens", fr: "Allergènes", es: "Alérgenos", de: "", uk: "",
  },
  composizione_variabile: {
    it: "Composizione variabile — chiedere allo staff",
    en: "Varies daily — please ask our staff",
    fr: "Composition variable — demandez au personnel",
    es: "Composición variable — consulte al personal",
    de: "", uk: "",
  },
  // {n} = numero di persone
  consigliato_per: {
    it: "Consigliato per {n} persone", en: "Recommended for {n} people",
    fr: "Conseillé pour {n} personnes", es: "Recomendado para {n} personas",
    de: "", uk: "",
  },
  prezzo_per_persona: {
    it: "a persona", en: "per person", fr: "par personne", es: "por persona", de: "", uk: "",
  },
  senza_titolo: {
    it: "(senza titolo)", en: "(untitled)", fr: "(sans titre)", es: "(sin título)", de: "", uk: "",
  },
  buon_appetito: {
    it: "Buon appetito", en: "Enjoy your meal",
    fr: "Bon appétit", es: "Buen provecho", de: "", uk: "",
  },
  carta_vini: {
    it: "Carta Vini", en: "Wine List", fr: "Carte des vins", es: "Carta de vinos", de: "", uk: "",
  },
  carta_vini_full: {
    it: "Carta Vini & Bevande", en: "Wine & Drinks List",
    fr: "Carte des vins et boissons", es: "Carta de vinos y bebidas", de: "", uk: "",
  },
  torna_carta_vini: {
    it: "← Torna alla carta vini", en: "← Back to the wine list",
    fr: "← Retour à la carte des vins", es: "← Volver a la carta de vinos", de: "", uk: "",
  },
  scegli_lingua: {
    it: "Scegli la lingua", en: "Choose your language",
    fr: "Choisissez votre langue", es: "Elige tu idioma", de: "", uk: "",
  },
};

/** Etichetta sezione. Fallback: lingua -> it -> chiave grezza. */
export function labelSezione(sezione, lang) {
  const voci = SEZIONI_LABEL[sezione];
  if (!voci) return sezione;
  return voci[lang] || voci[LINGUA_MADRE] || sezione;
}

/**
 * Micro-copy UI. Fallback: lingua -> it -> chiave grezza.
 * `vars` interpola i segnaposto {nome}: labelUi("consigliato_per", lang, { n: 2 }).
 */
export function labelUi(chiave, lang, vars) {
  const voci = UI_LABEL[chiave];
  let out = voci ? (voci[lang] || voci[LINGUA_MADRE] || chiave) : chiave;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}

/** Ordine canonico delle sezioni in carta. Deve combaciare col router. */
export const SEZIONI_ORDINE = [
  "antipasti",
  "paste_risi_zuppe",
  "piatti_del_giorno",
  "secondi",
  "contorni",
  "dolci",
  "bambini",
  "servizio",
];

const LS_KEY = "trgb_menu_lang";

/**
 * Lingua iniziale, in ordine di precedenza:
 *   1. ?lang= nell'URL      — un link condiviso vince su tutto
 *   2. localStorage          — la scelta fatta da questo ospite poco fa
 *   3. navigator.language    — la lingua del suo telefono, se e' fra le attive
 *   4. italiano
 * Il passo 3 e' un suggerimento, non una decisione: resta sempre cambiabile
 * dal selettore, che e' visibile senza scorrere.
 */
export function langIniziale() {
  try {
    const url = new URLSearchParams(window.location.search).get("lang");
    if (url && LINGUE.includes(normalizzaLang(url))) return normalizzaLang(url);

    const salvata = window.localStorage?.getItem(LS_KEY);
    if (salvata && LINGUE.includes(salvata)) return salvata;

    const nav = normalizzaLang(navigator?.language);
    // normalizzaLang() ritorna 'it' anche per gli sconosciuti: senza questo
    // controllo un telefono in giapponese sembrerebbe una scelta di italiano.
    if (nav !== LINGUA_MADRE) return nav;
    if (String(navigator?.language || "").toLowerCase().startsWith("it")) return "it";
  } catch {
    /* SSR, storage disabilitato, modalita' privata: si cade su italiano */
  }
  return LINGUA_MADRE;
}

export function salvaLang(lang) {
  try {
    window.localStorage?.setItem(LS_KEY, lang);
  } catch {
    /* storage negato: la lingua vale per questa visita, non e' un errore */
  }
}
