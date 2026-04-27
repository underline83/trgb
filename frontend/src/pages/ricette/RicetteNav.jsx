// @version: v1.1-ricette-nav-orange
// Tab navigation persistente per la sezione ricette
// Matching e Impostazioni visibili solo per admin/sommelier
import React from "react";
import { useNavigate } from "react-router-dom";

const TABS = [
  { key: "cucina-dashboard", label: "Cucina", path: "/cucina/dashboard", icon: "🍳" },
  { key: "archivio", label: "Ricette", path: "/ricette/archivio", icon: "📚" },
  { key: "ingredienti", label: "Ingredienti", path: "/ricette/ingredienti", icon: "🧾" },
  { key: "spesa", label: "Spesa", path: "/cucina/spesa", icon: "🛒" },
  { key: "selezioni", label: "Selezioni", path: "/selezioni/macellaio", icon: "🍽️" },
  { key: "menu-carta", label: "Menu Carta", path: "/menu-carta", icon: "📜" },
  { key: "pranzo", label: "Pranzo", path: "/pranzo", icon: "🥙" },
  { key: "matching", label: "Matching", path: "/ricette/matching", icon: "🔗", roles: ["admin", "sommelier"] },
  { key: "dashboard", label: "Food Cost", path: "/ricette/dashboard", icon: "📊", roles: ["admin", "sommelier"] },
  { key: "settings", label: "Impostazioni", path: "/ricette/settings", icon: "⚙️", roles: ["admin"] },
];

export default function RicetteNav({ current }) {
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
              onClick={() => navigate("/ricette")}
              className="text-sm font-bold text-orange-900 font-playfair mr-4 hover:text-orange-700 transition whitespace-nowrap"
            >
              Gestione Cucina
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
                        ? "bg-orange-100 text-orange-900 shadow-sm"
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
