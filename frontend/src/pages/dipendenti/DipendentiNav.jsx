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
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const { canAccessSub, loading } = useModuleAccess();

  // Durante il caricamento non mostriamo tab riservati: meglio una nav che si
  // popola in ritardo che una che lampeggia "Buste Paga" a chi non deve vederlo.
  const tabs = loading
    ? TABS.filter((t) => t.sub === "turni")
    : TABS.filter((t) => canAccessSub("dipendenti", t.sub));

  return (
    <div className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/dipendenti")}
              className="text-sm font-bold text-purple-900 font-playfair mr-4 hover:text-purple-700 transition whitespace-nowrap"
            >
              👥 Dipendenti
            </button>
            <div className="flex gap-0.5 overflow-x-auto">
              {tabs.map((tab) => {
                const active = current === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => navigate(tab.path)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                      active
                        ? "bg-purple-100 text-purple-900 shadow-sm"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                    }`}
                  >
                    <span className="mr-1">{tab.icon}</span>
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => navigate("/")}
            className="text-[11px] text-neutral-400 hover:text-neutral-600 transition hidden sm:block"
          >
            ← Home
          </button>
        </div>
      </div>
    </div>
  );
}
