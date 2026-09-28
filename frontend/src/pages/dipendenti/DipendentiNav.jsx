// @version: v1.2-permessi — i tab si filtrano per ruolo (2026-09-01)
// Tab navigation persistente per la sezione Dipendenti (pattern ViniNav).
// Colore modulo: viola (amber = admin, viola = dipendenti). Si mostra in tutte
// le pagine del modulo: Dashboard, Anagrafica, Buste Paga, Turni, Scadenze, Costi, Impostazioni.
//
// PERMESSI: fino alla v1.1 questa nav mostrava tutti gli 8 tab a chiunque
// vedesse il modulo. Un sommelier entrava da "Turni" e si trovava "Buste Paga"
// li' da cliccare — non doveva nemmeno inventarsi l'URL. Ora ogni tab dichiara
// il sotto-modulo di modules.json da cui dipende e viene nascosto se il ruolo
// non ce l'ha. La nav e' il primo dei tre livelli: le route (App.jsx) e i
// router backend (dipendenti.py / turni_router.py) hanno i loro controlli.
import React from "react";
import { ModuleNav } from "../../components/ui";
import useModuleAccess from "../../hooks/useModuleAccess";

const TABS = [
  // `sub` = chiave del sotto-modulo in modules.json che autorizza il tab.
  // Dashboard mostra il netto delle buste paga del mese e il conteggio
  // scadenze: stesso livello di riservatezza delle buste paga, non di Turni.
  { key: "dashboard", label: "Dashboard", path: "/dipendenti/dashboard", icon: "📊", sub: "buste-paga" },
  { key: "anagrafica", label: "Anagrafica", path: "/dipendenti/anagrafica", icon: "🗂️", sub: "anagrafica" },
  { key: "buste-paga", label: "Buste Paga", path: "/dipendenti/buste-paga", icon: "📋", sub: "buste-paga" },
  { key: "turni", label: "Turni", path: "/dipendenti/turni", icon: "📅", sub: "turni" },
  // Intermittenti invia la comunicazione UNI al Ministero: admin.
  { key: "intermittenti", label: "Intermittenti", path: "/dipendenti/intermittenti", icon: "📨", sub: "impostazioni" },
  { key: "scadenze", label: "Scadenze", path: "/dipendenti/scadenze", icon: "🚨", sub: "scadenze" },
  { key: "costi", label: "Costi", path: "/dipendenti/costi", icon: "💰", sub: "costi" },
  { key: "impostazioni", label: "Impostazioni", path: "/dipendenti/impostazioni", icon: "⚙️", sub: "impostazioni" },
];

export default function DipendentiNav({ current }) {
  const { canAccessSub, loading } = useModuleAccess();

  // Durante il caricamento non mostriamo tab riservati: meglio una nav che si
  // popola in ritardo che una che lampeggia "Buste Paga" a chi non deve vederlo.
  const tabs = loading
    ? TABS.filter((t) => t.sub === "turni")
    : TABS.filter((t) => canAccessSub("dipendenti", t.sub));

  return (
    <ModuleNav
      title="👥 Dipendenti"
      homePath="/dipendenti"
      color="purple"
      tabs={tabs}
      isActive={(tab) => current === tab.key}
    />
  );
}
