// src/pages/controllo-gestione/ControlloGestioneNav.jsx
// @version: v2.1-audit (2026-05-16, audit Marco)
// Tab navigation persistente per la sezione Controllo Gestione.
// Colore modulo: sky (pattern ereditato da v1). Layout e tipografia identici
// agli altri moduli dopo la revisione nav della sessione 39.
//
// Audit 2026-05-16:
//  - RIMOSSI: "Liquidità" (overlap con Flussi Cassa + modalità Cassa CE),
//    "Confronto" (placeholder mai sviluppato).
//  - AGGIUNTO: "Spese Fisse" (era raggiungibile solo via deep-link).
//  - RIORDINATO: flusso operativo Dashboard → Conto Economico → operatività
//    (Scadenzario / Calendario / Spese Fisse / Riconciliazione).
import React from "react";
import { ModuleNav } from "../../components/ui";

const TABS = [
  { key: "dashboard",        label: "Dashboard",       path: "/controllo-gestione/dashboard",        icon: "📊" },
  { key: "conto-economico",  label: "Conto Economico", path: "/controllo-gestione/conto-economico",  icon: "💼" },
  { key: "uscite",           label: "Scadenzario",     path: "/controllo-gestione/uscite",           icon: "💸" },
  { key: "calendario",       label: "Calendario",      path: "/controllo-gestione/calendario",       icon: "📅" },
  { key: "spese-fisse",      label: "Spese Fisse",     path: "/controllo-gestione/spese-fisse",      icon: "📋" },
  { key: "utenze",           label: "Utenze",          path: "/controllo-gestione/utenze",           icon: "💡" },
  { key: "batch-pagamenti",  label: "Batch",           path: "/controllo-gestione/batch-pagamenti",  icon: "📨" },
  { key: "riconciliazione",  label: "Riconciliazione", path: "/controllo-gestione/riconciliazione",  icon: "🔗" },
];

export default function ControlloGestioneNav({ current }) {

  return (
    <ModuleNav
      title="🎯 Controllo Gestione"
      homePath="/controllo-gestione"
      color="sky"
      tabs={TABS}
      isActive={(tab) => current === tab.key}
    />
  );
}
