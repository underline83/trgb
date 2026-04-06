// @version: v1.0-prenotazioni-nav
// Tab navigation per il modulo Prenotazioni
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

const TABS = [
  { key: "planning", label: "Planning", path: "/prenotazioni/planning", icon: "📋" },
  { key: "settimana", label: "Settimana", path: "/prenotazioni/settimana", icon: "📆" },
  { key: "impostazioni", label: "Impostazioni", path: "/prenotazioni/impostazioni", icon: "⚙️", roles: ["superadmin", "admin"] },
];

export default function PrenotazioniNav({ current }) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = localStorage.getItem("role");

  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role));

  const isActive = (tab) => {
    if (tab.key === "impostazioni") return location.pathname.startsWith("/prenotazioni/impostazioni");
    if (tab.key === "planning") return location.pathname.startsWith("/prenotazioni/planning");
    if (tab.key === "settimana") return location.pathname.startsWith("/prenotazioni/settimana");
    return current === tab.key;
  };

  return (
    <div className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/prenotazioni")}
              className="text-sm font-bold text-indigo-900 font-playfair mr-4 hover:text-indigo-700 transition whitespace-nowrap"
            >
              Prenotazioni
            </button>
            <div className="flex gap-0.5">
              {visibleTabs.map((tab) => {
                const active = isActive(tab);
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
