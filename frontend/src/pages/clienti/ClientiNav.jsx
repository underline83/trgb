// @version: v1.2-clienti-nav
// Tab navigation per il modulo Clienti CRM
// Import, Duplicati, Mailchimp spostati dentro Impostazioni (sidebar)
import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const TABS = [
  { key: "lista", label: "Anagrafica", path: "/clienti/lista", icon: "📇" },
  { key: "prenotazioni", label: "Prenotazioni", path: "/clienti/prenotazioni", icon: "📅" },
  { key: "preventivi", label: "Preventivi", path: "/clienti/preventivi", icon: "📋" },
  { key: "dashboard", label: "Dashboard", path: "/clienti/dashboard", icon: "📊" },
  { key: "impostazioni", label: "Impostazioni", path: "/clienti/impostazioni", icon: "⚙️", roles: ["superadmin", "admin"] },
];

export default function ClientiNav({ current, diffCount: externalDiffCount }) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = localStorage.getItem("role");
  const [diffCount, setDiffCount] = useState(0);

  useEffect(() => {
    if (externalDiffCount !== undefined) {
      setDiffCount(externalDiffCount);
      return;
    }
    apiFetch(`${API_BASE}/clienti/import/diff/count`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDiffCount(d.pending || 0); })
      .catch(() => {});
  }, [externalDiffCount]);

  // superadmin eredita tutti i permessi di admin (allineato a useModuleAccess.roleMatch)
  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role) || (role === "superadmin" && tab.roles.includes("admin")));

  // Impostazioni attivo anche per sotto-path
  const isActive = (tab) => {
    if (tab.key === "impostazioni") return location.pathname.startsWith("/clienti/impostazioni");
    if (tab.key === "preventivi") return location.pathname.startsWith("/clienti/preventivi");
    return current === tab.key;
  };

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
                const active = isActive(tab);
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
                    {tab.key === "impostazioni" && diffCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full leading-none">
                        {diffCount}
                      </span>
                    )}
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
