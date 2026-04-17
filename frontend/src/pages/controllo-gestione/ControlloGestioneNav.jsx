// src/pages/controllo-gestione/ControlloGestioneNav.jsx
// @version: v2.0-uniformato — allineato al pattern Dipendenti/Flussi/Clienti (sessione 40 Wave 3 S40-7)
// Tab navigation persistente per la sezione Controllo Gestione.
// Colore modulo: sky (pattern ereditato da v1). Layout e tipografia identici
// agli altri moduli dopo la revisione nav della sessione 39.
import React from "react";
import { useNavigate } from "react-router-dom";

const TABS = [
  { key: "dashboard",       label: "Dashboard",       path: "/controllo-gestione/dashboard",       icon: "📊" },
  { key: "liquidita",       label: "Liquidita'",      path: "/controllo-gestione/liquidita",       icon: "🏦" },
  { key: "uscite",          label: "Uscite",          path: "/controllo-gestione/uscite",          icon: "💸" },
  { key: "riconciliazione", label: "Riconciliazione", path: "/controllo-gestione/riconciliazione", icon: "🔗" },
  { key: "confronto",       label: "Confronto",       path: "/controllo-gestione/confronto",       icon: "📈" },
];

export default function ControlloGestioneNav({ current }) {
  const navigate = useNavigate();

  return (
    <div className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/controllo-gestione")}
              className="text-sm font-bold text-sky-900 font-playfair mr-4 hover:text-sky-700 transition whitespace-nowrap"
            >
              🎯 Controllo Gestione
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
                        ? "bg-sky-100 text-sky-900 shadow-sm"
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
