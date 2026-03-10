// @version: v3.0-versioned-modules
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";
import MODULE_VERSIONS, { VersionBadge } from "../config/versions";

const MENU_CONFIG = {
  vini:     { title: "Gestione Vini",         subtitle: "Carta, cantina, vendite, dashboard",              icon: "\uD83C\uDF77", go: "/vini",      color: "bg-amber-50 border-amber-200 text-amber-900",       vKey: "vini" },
  acquisti: { title: "Gestione Acquisti",     subtitle: "Fatture XML, fornitori, dashboard, categorie",    icon: "\uD83D\uDCE6", go: "/acquisti",  color: "bg-teal-50 border-teal-200 text-teal-900",          vKey: "fatture" },
  vendite:  { title: "Gestione Vendite",     subtitle: "Corrispettivi, chiusure cassa, dashboard, confronto annuale", icon: "\uD83D\uDCB5", go: "/vendite", color: "bg-yellow-50 border-yellow-200 text-yellow-900", vKey: "corrispettivi" },
  ricette:  { title: "Ricette & Food Cost",   subtitle: "Ricette, ingredienti, costi, matching fatture",   icon: "\uD83D\uDCD8", go: "/ricette",   color: "bg-blue-50 border-blue-200 text-blue-900",          vKey: "ricette" },
  admin:    { title: "Amministrazione",       subtitle: "Dipendenti, utenti, impostazioni",                icon: "\uD83E\uDDFE", go: "/admin",     color: "bg-neutral-50 border-neutral-300 text-neutral-800", vKey: "sistema" },
};

export default function Home() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${API_BASE}/settings/modules/`)
      .then((r) => r.json())
      .then(setModules)
      .catch(() => {
        setModules(Object.keys(MENU_CONFIG).map((key) => ({ key, roles: ["admin", "chef", "sommelier", "sala", "viewer"] })));
      })
      .finally(() => setLoading(false));
  }, []);

  const visibleModules = modules.filter((m) => m.roles?.includes(role));

  return (
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        <h1 className="text-4xl font-bold text-center mb-4">
          Osteria Tre Gobbi — Sistema Gestionale
        </h1>
        <p className="text-center text-neutral-600 mb-10">
          Seleziona un'area per iniziare.
        </p>

        {loading ? (
          <p className="text-center text-neutral-400 py-12">Caricamento...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {visibleModules.map((m) => {
              const cfg = MENU_CONFIG[m.key];
              if (!cfg) return null;
              return (
                <div
                  key={m.key}
                  onClick={() => navigate(cfg.go)}
                  className={`rounded-2xl border shadow-lg p-6 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition ${cfg.color}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-4xl">{cfg.icon}</div>
                    <VersionBadge modulo={cfg.vKey} />
                  </div>
                  <div className="text-xl font-semibold">{cfg.title}</div>
                  <div className="text-sm opacity-80">{cfg.subtitle}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer versione sistema */}
        <div className="mt-12 text-center text-xs text-neutral-400">
          TRGB Gestionale v{MODULE_VERSIONS.sistema.version} — Osteria Tre Gobbi, Bergamo
        </div>
      </div>
    </div>
  );
}
