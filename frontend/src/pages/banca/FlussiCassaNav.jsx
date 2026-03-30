// src/pages/banca/FlussiCassaNav.jsx
// @version: v1.1 — Tab navigation con permessi granulari
import React from "react";
import { useNavigate } from "react-router-dom";
import useModuleAccess from "../../hooks/useModuleAccess";

const TABS = [
  { key: "dashboard",    label: "Dashboard",        path: "/flussi-cassa/dashboard",    icon: "📊" },
  { key: "cc",           label: "Conti Correnti",    path: "/flussi-cassa/cc",           icon: "🏦" },
  { key: "crossref",     label: "Cross-Ref Fatture", path: "/flussi-cassa/cc/crossref",  icon: "🔗", perm: "cc" },
  { key: "carta",        label: "Carta di Credito",  path: "/flussi-cassa/carta",        icon: "💳" },
  { key: "contanti",     label: "Contanti",          path: "/flussi-cassa/contanti",     icon: "💰" },
  { key: "mance",        label: "Mance",             path: "/flussi-cassa/mance",        icon: "🎁" },
  { key: "impostazioni", label: "Impostazioni",      path: "/flussi-cassa/impostazioni", icon: "⚙️" },
];

export default function FlussiCassaNav({ current }) {
  const navigate = useNavigate();
  const { canAccessSub } = useModuleAccess();

  const visibleTabs = TABS.filter(tab => canAccessSub("flussi-cassa", tab.perm || tab.key));

  return (
    <div className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/flussi-cassa")}
              className="text-sm font-bold text-emerald-900 font-playfair mr-4 hover:text-emerald-700 transition whitespace-nowrap"
            >
              Flussi di Cassa
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
                        ? "bg-emerald-100 text-emerald-900 shadow-sm"
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
