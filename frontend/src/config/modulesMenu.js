// Configurazione moduli — usata da Home e Header (dropdown navigazione)
// Ogni key corrisponde alla key in modules.json
const MODULES_MENU = {
  vini:                { title: "Gestione Vini",           icon: "\uD83C\uDF77", go: "/vini",              color: "bg-amber-50 border-amber-200 text-amber-900",     hoverBg: "hover:bg-amber-50" },
  acquisti:            { title: "Gestione Acquisti",       icon: "\uD83D\uDCE6", go: "/acquisti",          color: "bg-teal-50 border-teal-200 text-teal-900",        hoverBg: "hover:bg-teal-50" },
  vendite:             { title: "Gestione Vendite",        icon: "\uD83D\uDCB5", go: "/vendite",           color: "bg-indigo-50 border-indigo-200 text-indigo-900",  hoverBg: "hover:bg-indigo-50" },
  ricette:             { title: "Ricette & Food Cost",     icon: "\uD83D\uDCD8", go: "/ricette",           color: "bg-orange-50 border-orange-200 text-orange-900",  hoverBg: "hover:bg-orange-50" },
  "flussi-cassa":      { title: "Flussi di Cassa",        icon: "\uD83C\uDFE6", go: "/flussi-cassa",      color: "bg-emerald-50 border-emerald-200 text-emerald-900", hoverBg: "hover:bg-emerald-50" },
  "controllo-gestione":{ title: "Controllo di Gestione",  icon: "\uD83C\uDFAF", go: "/controllo-gestione", color: "bg-sky-50 border-sky-200 text-sky-900",          hoverBg: "hover:bg-sky-50" },
  statistiche:         { title: "Statistiche",             icon: "\uD83D\uDCC8", go: "/statistiche",       color: "bg-rose-50 border-rose-200 text-rose-900",       hoverBg: "hover:bg-rose-50" },
  dipendenti:          { title: "Dipendenti",              icon: "\uD83D\uDC65", go: "/dipendenti",        color: "bg-purple-50 border-purple-200 text-purple-900", hoverBg: "hover:bg-purple-50" },
  impostazioni:        { title: "Impostazioni",            icon: "\u2699\uFE0F", go: "/impostazioni",      color: "bg-neutral-50 border-neutral-300 text-neutral-800", hoverBg: "hover:bg-neutral-100" },
};

export default MODULES_MENU;
