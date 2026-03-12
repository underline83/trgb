// @version: v2.0-vini-nav
// Tab navigation persistente per la sezione vini
// Impostazioni visibile solo per admin e sommelier
import React from "react";
import { useNavigate } from "react-router-dom";

const TABS = [
  { key: "carta", label: "Carta", path: "/vini/carta", icon: "📜" },
  { key: "vendite", label: "Vendite", path: "/vini/vendite", icon: "🛒" },
  { key: "cantina", label: "Cantina", path: "/vini/magazzino", icon: "🍷" },
  { key: "dashboard", label: "Dashboard", path: "/vini/dashboard", icon: "📊" },
  { key: "settings", label: "Impostazioni", path: "/vini/settings", icon: "⚙️", roles: ["admin", "sommelier"] },
];

export default function ViniNav({ current }) {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role));

  return (
    <div className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">
          {/* Left: brand + tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/vini")}
              className="text-sm font-bold text-amber-900 font-playfair mr-4 hover:text-amber-700 transition whitespace-nowrap"
            >
              Vini
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
                        ? "bg-amber-100 text-amber-900 shadow-sm"
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
