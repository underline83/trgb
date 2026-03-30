// src/pages/banca/FlussiCassaNav.jsx
// @version: v1.0 — Tab navigation per Flussi di Cassa
// Ingloba: Conti Correnti (ex Banca), Carta di Credito, Contanti, Mance
import React from "react";
import { useNavigate } from "react-router-dom";
import { isAdminRole, isSuperAdminRole } from "../../utils/authHelpers";

const TABS = [
  { key: "dashboard",  label: "Dashboard",        path: "/flussi-cassa/dashboard",  icon: "📊", check: null },
  { key: "cc",         label: "Conti Correnti",    path: "/flussi-cassa/cc",         icon: "🏦", check: null },
  { key: "carta",      label: "Carta di Credito",  path: "/flussi-cassa/carta",      icon: "💳", check: null },
  { key: "contanti",   label: "Contanti",          path: "/flussi-cassa/contanti",   icon: "💰", check: "superadmin" },
  { key: "mance",      label: "Mance",             path: "/flussi-cassa/mance",      icon: "🎁", check: null },
  { key: "impostazioni", label: "Impostazioni",    path: "/flussi-cassa/impostazioni", icon: "⚙️", check: "admin" },
];

export default function FlussiCassaNav({ current }) {
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "";

  const visibleTabs = TABS.filter(tab =>
    tab.check === null
    || (tab.check === "admin" && isAdminRole(role))
    || (tab.check === "superadmin" && isSuperAdminRole(role))
  );

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
