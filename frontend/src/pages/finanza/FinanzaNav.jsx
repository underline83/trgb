// @version: v1.0-finanza-nav
import React from "react";
import { useNavigate } from "react-router-dom";

const TABS = [
  { key: "dashboard", label: "Dashboard", path: "/finanza/dashboard", icon: "📊" },
  { key: "movimenti", label: "Movimenti", path: "/finanza/movimenti", icon: "📋" },
  { key: "scadenzario", label: "Scadenzario", path: "/finanza/scadenzario", icon: "📅", roles: ["admin"] },
  { key: "categorie", label: "Categorie", path: "/finanza/categorie", icon: "🏷️", roles: ["admin"] },
  { key: "import", label: "Import", path: "/finanza/import", icon: "📥", roles: ["admin"] },
];

export default function FinanzaNav({ current }) {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role));

  return (
    <div className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/finanza")}
              className="text-sm font-bold text-violet-900 font-playfair mr-4 hover:text-violet-700 transition whitespace-nowrap"
            >
              Finanza
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
                        ? "bg-violet-100 text-violet-900 shadow-sm"
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
