// Configurazione moduli + sotto-menu — usata da Home e Header (dropdown navigazione)
// Ogni key corrisponde alla key in modules.json
// NOTA: il controllo accessi reale passa da modules.json (useModuleAccess hook).
// Il campo `check` qui è cosmetico/legacy — mantenuto per documentazione.
// sub: sotto-pagine visibili nel dropdown header. check: null=tutti, "admin", "superadmin"
//
// Nota (sessione 2026-04-20): Selezioni del Giorno non ha piu' tile a se' in Home ne'
// voce top-level nel dropdown Header. Vive come sotto-voce di "Gestione Cucina" (ricette).
// Il widget SelezioniCard sulla Home pagina 1 resta (widget di servizio).

const MODULES_MENU = {
  vini: {
    title: "Gestione Vini", icon: "\uD83C\uDF77", go: "/vini",
    color: "bg-amber-50 border-amber-200 text-amber-900", hoverBg: "hover:bg-amber-50",
    sub: [
      { label: "Carta dei Vini", go: "/vini/carta" },
      { label: "Vendite",        go: "/vini/vendite" },
      { label: "Cantina",        go: "/vini/magazzino" },
      { label: "Dashboard",      go: "/vini/dashboard" },
      { label: "Impostazioni",   go: "/vini/settings",  check: "admin" },
    ],
  },
  acquisti: {
    title: "Gestione Acquisti", icon: "\uD83D\uDCE6", go: "/acquisti",
    color: "bg-teal-50 border-teal-200 text-teal-900", hoverBg: "hover:bg-teal-50",
    sub: [
      { label: "Dashboard",    go: "/acquisti/dashboard" },
      { label: "Fatture",      go: "/acquisti/fatture" },
      { label: "Fornitori",    go: "/acquisti/fornitori" },
      { label: "Impostazioni", go: "/acquisti/impostazioni", check: "admin" },
    ],
  },
  vendite: {
    title: "Gestione Vendite", icon: "\uD83D\uDCB5", go: "/vendite",
    color: "bg-indigo-50 border-indigo-200 text-indigo-900", hoverBg: "hover:bg-indigo-50",
    sub: [
      { label: "Chiusura Turno", go: "/vendite/fine-turno" },
      { label: "Lista Chiusure", go: "/vendite/chiusure",    check: "admin" },
      { label: "Riepilogo",      go: "/vendite/riepilogo",   check: "admin" },
      { label: "Dashboard",      go: "/vendite/dashboard",   check: "admin" },
      { label: "Impostazioni",   go: "/vendite/impostazioni", check: "admin" },
    ],
  },
  ricette: {
    title: "Gestione Cucina", icon: "\uD83D\uDCD8", go: "/ricette",
    color: "bg-orange-50 border-orange-200 text-orange-900", hoverBg: "hover:bg-orange-50",
    sub: [
      { label: "Dashboard Cucina", go: "/cucina/dashboard" },
      { label: "Lista Spesa",   go: "/cucina/spesa" },
      { label: "Archivio",      go: "/ricette/archivio" },
      { label: "Ingredienti",   go: "/ricette/ingredienti" },
      { label: "Matching",      go: "/ricette/matching",   check: "admin" },
      { label: "Dashboard FC",  go: "/ricette/dashboard" },
      // Selezioni del giorno: gestite qui dentro (sessione 2026-04-20 — niente tile a sé in Home)
      { label: "Selezioni · Macellaio", go: "/selezioni/macellaio" },
      { label: "Selezioni · Pescato",   go: "/selezioni/pescato" },
      { label: "Selezioni · Salumi",    go: "/selezioni/salumi" },
      { label: "Selezioni · Formaggi",  go: "/selezioni/formaggi" },
      { label: "Menu Carta",    go: "/menu-carta" },
      { label: "Menu Pranzo",   go: "/pranzo" },
      { label: "Impostazioni",  go: "/ricette/settings",   check: "admin" },
    ],
  },
  "flussi-cassa": {
    title: "Flussi di Cassa", icon: "\uD83C\uDFE6", go: "/flussi-cassa",
    color: "bg-emerald-50 border-emerald-200 text-emerald-900", hoverBg: "hover:bg-emerald-50",
    sub: [
      { label: "Dashboard",        go: "/flussi-cassa/dashboard" },
      { label: "Conti Correnti",   go: "/flussi-cassa/cc" },
      { label: "Riconciliazione",    go: "/flussi-cassa/cc/crossref" },
      { label: "Carta di Credito", go: "/flussi-cassa/carta" },
      { label: "Contanti",         go: "/flussi-cassa/contanti", check: "admin" },
      { label: "Mance",            go: "/flussi-cassa/mance" },
      { label: "Impostazioni",     go: "/flussi-cassa/impostazioni", check: "admin" },
    ],
  },
  "controllo-gestione": {
    title: "Controllo di Gestione", icon: "\uD83C\uDFAF", go: "/controllo-gestione",
    color: "bg-sky-50 border-sky-200 text-sky-900", hoverBg: "hover:bg-sky-50",
    sub: [
      { label: "Dashboard",     go: "/controllo-gestione/dashboard" },
      { label: "Liquidita'",    go: "/controllo-gestione/liquidita" },
      { label: "Scadenzario",   go: "/controllo-gestione/uscite" },
      { label: "Confronto",     go: "/controllo-gestione/confronto" },
      { label: "Spese Fisse",   go: "/controllo-gestione/spese-fisse" },
    ],
  },
  statistiche: {
    title: "Statistiche", icon: "\uD83D\uDCC8", go: "/statistiche",
    color: "bg-rose-50 border-rose-200 text-rose-900", hoverBg: "hover:bg-rose-50",
    sub: [
      { label: "Cucina",            go: "/statistiche/dashboard" },
      { label: "Coperti & Incassi", go: "/statistiche/coperti" },
      { label: "Import iPratico",   go: "/statistiche/import", check: "admin" },
    ],
  },
  prenotazioni: {
    title: "Prenotazioni", icon: "\uD83D\uDCC5", go: "/prenotazioni",
    color: "bg-indigo-50 border-indigo-200 text-indigo-900", hoverBg: "hover:bg-indigo-50",
    sub: [
      { label: "Planning",      go: "/prenotazioni/planning/" + new Date().toISOString().slice(0, 10) },
      { label: "Mappa Tavoli",  go: "/prenotazioni/mappa" },
      { label: "Settimana",     go: "/prenotazioni/settimana/" + new Date().toISOString().slice(0, 10) },
      { label: "Editor Tavoli", go: "/prenotazioni/tavoli", check: "admin" },
      { label: "Impostazioni",  go: "/prenotazioni/impostazioni", check: "admin" },
    ],
  },
  clienti: {
    title: "Gestione Clienti", icon: "\uD83E\uDD1D", go: "/clienti",
    color: "bg-teal-50 border-teal-200 text-teal-900", hoverBg: "hover:bg-teal-50",
    sub: [
      { label: "Anagrafica",    go: "/clienti/lista" },
      { label: "Prenotazioni",  go: "/clienti/prenotazioni" },
      { label: "Preventivi",    go: "/clienti/preventivi" },
      { label: "Dashboard",     go: "/clienti/dashboard" },
      { label: "Impostazioni",  go: "/clienti/impostazioni", check: "admin" },
    ],
  },
  tasks: {
    title: "Task Manager", icon: "\uD83D\uDCCB", go: "/tasks",
    color: "bg-indigo-50 border-indigo-200 text-indigo-900", hoverBg: "hover:bg-indigo-50",
    sub: [
      { label: "Agenda giornaliera", go: "/tasks/agenda" },
      { label: "Agenda settimana",   go: "/tasks/agenda/settimana" },
      { label: "Task",               go: "/tasks/tasks" },
      { label: "Report HACCP",       go: "/tasks/haccp" },
      { label: "Template",           go: "/tasks/templates", check: "admin" },
    ],
  },
  dipendenti: {
    title: "Dipendenti", icon: "\uD83D\uDC65", go: "/dipendenti",
    color: "bg-purple-50 border-purple-200 text-purple-900", hoverBg: "hover:bg-purple-50",
    sub: [
      { label: "Dashboard",     go: "/dipendenti/dashboard" },
      { label: "Anagrafica",    go: "/dipendenti/anagrafica",    check: "admin" },
      { label: "Buste Paga",    go: "/dipendenti/buste-paga",    check: "admin" },
      { label: "Turni",         go: "/dipendenti/turni" },
      { label: "Scadenze",      go: "/dipendenti/scadenze",      check: "admin" },
      { label: "Costi",         go: "/dipendenti/costi",         check: "admin" },
      { label: "Impostazioni",  go: "/dipendenti/impostazioni",  check: "admin" },
    ],
  },
  impostazioni: {
    title: "Impostazioni", icon: "\u2699\uFE0F", go: "/impostazioni",
    color: "bg-neutral-50 border-neutral-300 text-neutral-800", hoverBg: "hover:bg-neutral-100",
    sub: [
      { label: "Utenti & Ruoli",     go: "/impostazioni?tab=utenti" },
      { label: "Moduli & Permessi",  go: "/impostazioni?tab=moduli" },
      { label: "Backup",             go: "/impostazioni?tab=backup" },
    ],
  },
};

export default MODULES_MENU;
