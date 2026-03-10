// @version: v1.0-fatture-nav
// Tab navigation persistente per la sezione fatture
import React from "react";
import { useNavigate } from "react-router-dom";

const TABS = [
  { key: "dashboard", label: "Dashboard", path: "/admin/fatture/dashboard", icon: "📈" },
  { key: "elenco", label: "Elenco", path: "/admin/fatture/elenco", icon: "📋" },
  { key: "fornitori", label: "Fornitori", path: "/admin/fatture/fornitori", icon: "🏢" },
  { key: "import", label: "Import", path: "/admin/fatture/import", icon: "📤" },
  { key: "categorie", label: "Categorie", path: "/admin/fatture/categorie", icon: "🏷️" },
];

export default function FattureNav({ current }) {
  const navigate = useNavigate();

  return (
    <div className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">
          {/* Left: brand + tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/admin/fatture")}
              className="text-sm font-bold text-amber-900 font-playfair mr-4 hover:text-amber-700 transition whitespace-nowrap"
            >
              Fatture E.
            </button>
            <div className="flex gap-0.5">
              {TABS.map((tab) => {
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
            onClick={() => navigate("/admin")}
            className="text-[11px] text-neutral-400 hover:text-neutral-600 transition hidden sm:block"
          >
            ← Amministrazione
          </button>
        </div>
      </div>
    </div>
  );
}
