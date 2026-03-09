// @version: v2.5-modules
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";

const MENU_CONFIG = {
  vini:     { title: "Gestione Vini",     subtitle: "Carta, database, vendite, impostazioni",         icon: "🍷", go: "/vini",     color: "bg-amber-50 border-amber-200 text-amber-900" },
  ricette:  { title: "Gestione Ricette",  subtitle: "Archivio ricette, costi, stampa PDF",            icon: "📘", go: "/ricette",  color: "bg-blue-50 border-blue-200 text-blue-900" },
  foodcost: { title: "Food Cost",         subtitle: "Analisi costi, materie prime, porzioni",         icon: "📊", go: "/foodcost", color: "bg-green-50 border-green-200 text-green-900" },
  admin:    { title: "Amministrazione",   subtitle: "Corrispettivi, fatture, dipendenti, utenti",     icon: "🧾", go: "/admin",    color: "bg-neutral-50 border-neutral-300 text-neutral-800" },
};

export default function Home() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAdmin = role === "admin";

  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${API_BASE}/settings/modules/`)
      .then((r) => r.json())
      .then((data) => setModules(data))
      .catch(() => {
        // Se fallisce, mostra tutti i moduli (fallback sicuro)
        setModules(Object.keys(MENU_CONFIG).map((key) => ({ key, enabled: true })));
      })
      .finally(() => setLoading(false));
  }, []);

  // Admin vede sempre tutti i moduli; altri utenti vedono solo quelli abilitati
  const visibleModules = modules.filter((m) => isAdmin || m.enabled);

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
              const disabled = isAdmin && !m.enabled;
              return (
                <div
                  key={m.key}
                  onClick={() => !disabled && navigate(cfg.go)}
                  className={`
                    relative rounded-2xl border shadow-lg p-6 transition
                    ${disabled
                      ? "opacity-50 cursor-not-allowed bg-neutral-50 border-neutral-200"
                      : `${cfg.color} cursor-pointer hover:shadow-xl hover:-translate-y-1`}
                  `}
                >
                  {disabled && (
                    <span className="absolute top-3 right-3 text-xs bg-neutral-200 text-neutral-500 rounded-full px-2 py-0.5">
                      Disabilitato
                    </span>
                  )}
                  <div className="text-4xl mb-2">{cfg.icon}</div>
                  <div className="text-xl font-semibold">{cfg.title}</div>
                  <div className="text-sm opacity-80">{cfg.subtitle}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
