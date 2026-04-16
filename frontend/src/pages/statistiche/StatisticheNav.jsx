// @version: v1.0-statistiche-nav
// Tab navigation per la sezione Statistiche
import React from "react";
import { useNavigate } from "react-router-dom";

const TABS = [
  { key: "dashboard", label: "Dashboard", path: "/statistiche/dashboard", icon: "📊" },
  { key: "prodotti", label: "Prodotti", path: "/statistiche/prodotti", icon: "🍽️" },
  { key: "coperti", label: "Coperti & Incassi", path: "/statistiche/coperti", icon: "👥" },
  { key: "import", label: "Import iPratico", path: "/statistiche/import", icon: "📥", roles: ["admin"] },
  { key: "cantina", label: "Cantina", icon: "🍷", soon: true },
  { key: "personale", label: "Personale", icon: "👤", soon: true },
];

export default function StatisticheNav({ current }) {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  // superadmin eredita tutti i permessi di admin (allineato a useModuleAccess.roleMatch)
  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role) || (role === "superadmin" && tab.roles.includes("admin")));

  return (
    <div className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/statistiche")}
              className="text-sm font-bold text-rose-900 font-playfair mr-4 hover:text-rose-700 transition whitespace-nowrap"
            >
              Statistiche
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
                        ? "bg-rose-100 text-rose-900 shadow-sm"
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
