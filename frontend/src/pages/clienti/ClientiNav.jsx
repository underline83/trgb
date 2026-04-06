// @version: v1.0-clienti-nav
// Tab navigation per il modulo Clienti CRM
import React from "react";
import { useNavigate } from "react-router-dom";

const TABS = [
  { key: "lista", label: "Anagrafica", path: "/clienti/lista", icon: "📇" },
  { key: "prenotazioni", label: "Prenotazioni", path: "/clienti/prenotazioni", icon: "📅" },
  { key: "dashboard", label: "Dashboard", path: "/clienti/dashboard", icon: "📊" },
  { key: "import", label: "Import", path: "/clienti/import", icon: "📥", roles: ["superadmin", "admin"] },
];

export default function ClientiNav({ current }) {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role));

  return (
    <div className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/clienti")}
              className="text-sm font-bold text-teal-900 font-playfair mr-4 hover:text-teal-700 transition whitespace-nowrap"
            >
              Clienti
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
                        ? "bg-teal-100 text-teal-900 shadow-sm"
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
