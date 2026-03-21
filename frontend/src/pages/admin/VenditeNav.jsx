// @version: v2.1-vendite-nav-indigo
// Tab navigation persistente per la sezione Gestione Vendite
// I tab admin-only sono nascosti per ruoli sala/sommelier
import React from "react";
import { useNavigate } from "react-router-dom";

const TABS = [
  { key: "fine-turno", label: "Chiusura Turno", path: "/vendite/fine-turno", icon: "🔔", roles: null },
  { key: "chiusure", label: "Chiusure", path: "/vendite/chiusure", icon: "📅", roles: ["admin"] },
  { key: "preconti", label: "Pre-conti", path: "/vendite/preconti", icon: "🍽️", roles: ["admin"] },
  { key: "riepilogo", label: "Riepilogo", path: "/vendite/riepilogo", icon: "📋", roles: ["admin"] },
  { key: "dashboard", label: "Dashboard", path: "/vendite/dashboard", icon: "📊", roles: ["admin"] },
  { key: "annual", label: "Annuale", path: "/vendite/annual", icon: "📈", roles: ["admin"] },
  { key: "impostazioni", label: "Impostazioni", path: "/vendite/impostazioni", icon: "⚙️", roles: ["admin"] },
];

export default function VenditeNav({ current }) {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  const visibleTabs = TABS.filter(tab =>
    tab.roles === null || tab.roles.includes(role)
  );

  return (
    <div className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">
          {/* Left: brand + tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/vendite")}
              className="text-sm font-bold text-indigo-900 font-playfair mr-4 hover:text-indigo-700 transition whitespace-nowrap"
            >
              Vendite
            </button>
            <div className="flex gap-0.5">
              {visibleTabs.map((tab) => {
                const active = current === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => navigate(tab.path)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                      active
                        ? "bg-indigo-100 text-indigo-900 shadow-sm"
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

          {/* Right: back link */}
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
