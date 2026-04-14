// @version: v1.1-dashboard-tab — sostituita voce Home (hub eliminato) con Dashboard (sessione 39)
// Tab navigation persistente per la sezione Dipendenti (pattern ViniNav).
// Colore modulo: viola (amber = admin, viola = dipendenti). Si mostra in tutte
// le pagine del modulo: Dashboard, Anagrafica, Buste Paga, Turni, Scadenze, Costi, Impostazioni.
import React from "react";
import { useNavigate } from "react-router-dom";

const TABS = [
  { key: "dashboard", label: "Dashboard", path: "/dipendenti/dashboard", icon: "📊" },
  { key: "anagrafica", label: "Anagrafica", path: "/dipendenti/anagrafica", icon: "🗂️" },
  { key: "buste-paga", label: "Buste Paga", path: "/dipendenti/buste-paga", icon: "📋" },
  { key: "turni", label: "Turni", path: "/dipendenti/turni", icon: "📅" },
  { key: "scadenze", label: "Scadenze", path: "/dipendenti/scadenze", icon: "🚨" },
  { key: "costi", label: "Costi", path: "/dipendenti/costi", icon: "💰" },
  { key: "impostazioni", label: "Impostazioni", path: "/dipendenti/impostazioni", icon: "⚙️" },
];

export default function DipendentiNav({ current }) {
  const navigate = useNavigate();

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
              {TABS.map((tab) => {
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
