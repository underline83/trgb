// @version: v4.0 — TRGB-02 brand integration (wordmark + cream + gobbette strip)
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";
import MODULE_VERSIONS, { VersionBadge } from "../config/versions";
import MODULES_MENU from "../config/modulesMenu";
import DashboardSala from "./DashboardSala";
import TrgbLoader from "../components/TrgbLoader";
import GobbetteStrip from "../assets/brand/TRGB-gobbette-strip.svg";

// Estendi con subtitle e vKey per le card Home (il resto viene da modulesMenu)
const HOME_EXTRA = {
  vini:                { subtitle: "Carta, cantina, vendite, dashboard",                                   vKey: "vini" },
  acquisti:            { subtitle: "Fatture XML, fornitori, dashboard, categorie",                         vKey: "fatture" },
  vendite:             { subtitle: "Corrispettivi, chiusure cassa, dashboard, confronto annuale",          vKey: "corrispettivi" },
  ricette:             { subtitle: "Ricette, ingredienti, costi, matching fatture",                        vKey: "ricette" },
  "flussi-cassa":      { subtitle: "Conti correnti, carta di credito, contanti, mance",                   vKey: "flussiCassa" },
  "controllo-gestione":{ subtitle: "Panorama finanziario — vendite, acquisti, banca, scadenze, margine",   vKey: "controlloGestione" },
  statistiche:         { subtitle: "Analisi vendite iPratico, categorie, prodotti, trend",                 vKey: "statistiche" },
  clienti:             { subtitle: "CRM ristorante: anagrafica, tag, note, preferenze",                    vKey: "clienti" },
  dipendenti:          { subtitle: "Personale, buste paga, turni, scadenze, costi",                        vKey: "dipendenti" },
  impostazioni:        { subtitle: "Utenti, ruoli, configurazione sistema",                                vKey: "sistema" },
};

// Merge per backward compat
const MENU_CONFIG = Object.fromEntries(
  Object.entries(MODULES_MENU).map(([k, v]) => [k, { ...v, ...(HOME_EXTRA[k] || {}) }])
);

export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const role = localStorage.getItem("role");

  // Utenti sala vedono dashboard semplificata a tile (bypass con ?full=1)
  if (role === "sala" && !searchParams.get("full")) {
    return <DashboardSala />;
  }

  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${API_BASE}/settings/modules/`)
      .then((r) => r.json())
      .then(setModules)
      .catch(() => {
        setModules(Object.keys(MENU_CONFIG).map((key) => ({ key, roles: ["superadmin", "admin", "chef", "sommelier", "sala", "viewer"] })));
      })
      .finally(() => setLoading(false));
  }, []);

  // superadmin vede tutto ciò che vede admin
  const visibleModules = modules.filter((m) =>
    m.roles?.includes(role) || (role === "superadmin" && m.roles?.includes("admin"))
  );

  return (
    <div className="min-h-screen bg-brand-cream p-6">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        {/* Wordmark brand — gobbette inline + testo, centrato da flexbox */}
        <div className="flex flex-col items-center gap-4 mb-10">
          <div className="flex items-center gap-3">
            {/* Gobbette strip inline — solo le 3 curve */}
            <svg viewBox="15 28 155 28" className="h-8 w-auto" aria-hidden="true">
              <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5">
                <path d="M 20 50 L 20.3 48.8 L 20.6 47.7 L 21.0 46.5 L 21.4 45.4 L 21.9 44.3 L 22.4 43.2 L 23.0 42.2 L 23.6 41.1 L 24.3 40.1 L 25.0 39.2 L 25.9 38.2 L 26.8 37.3 L 27.7 36.6 L 28.7 35.9 L 29.7 35.3 L 30.7 34.8 L 31.8 34.4 L 32.9 34.1 L 34.1 33.9 L 35.3 33.8 L 36.5 33.8 L 37.7 33.9 L 38.8 34.1 L 40.0 34.2 L 41.1 34.5 L 42.2 34.8 L 43.3 35.2 L 44.3 35.6 L 45.4 36.1 L 46.4 36.6 L 47.4 37.2 L 48.4 37.8 L 49.4 38.4 L 50.4 39.0 L 51.3 39.7 L 52.3 40.3 L 53.3 41.0 L 54.2 41.7 L 55.2 42.4" stroke="#E8402B"/>
                <path d="M 75 50 L 75.3 48.8 L 75.6 47.7 L 76.0 46.5 L 76.4 45.4 L 76.9 44.3 L 77.4 43.2 L 78.0 42.2 L 78.6 41.1 L 79.3 40.1 L 80.0 39.2 L 80.9 38.2 L 81.8 37.3 L 82.7 36.6 L 83.7 35.9 L 84.7 35.3 L 85.7 34.8 L 86.8 34.4 L 87.9 34.1 L 89.1 33.9 L 90.3 33.8 L 91.5 33.8 L 92.7 33.9 L 93.8 34.1 L 95.0 34.2 L 96.1 34.5 L 97.2 34.8 L 98.3 35.2 L 99.3 35.6 L 100.4 36.1 L 101.4 36.6 L 102.4 37.2 L 103.4 37.8 L 104.4 38.4 L 105.4 39.0 L 106.3 39.7 L 107.3 40.3 L 108.3 41.0 L 109.2 41.7 L 110.2 42.4" stroke="#2EB872"/>
                <path d="M 130 50 L 130.3 48.8 L 130.6 47.7 L 131.0 46.5 L 131.4 45.4 L 131.9 44.3 L 132.4 43.2 L 133.0 42.2 L 133.6 41.1 L 134.3 40.1 L 135.0 39.2 L 135.9 38.2 L 136.8 37.3 L 137.7 36.6 L 138.7 35.9 L 139.7 35.3 L 140.7 34.8 L 141.8 34.4 L 142.9 34.1 L 144.1 33.9 L 145.3 33.8 L 146.5 33.8 L 147.7 33.9 L 148.8 34.1 L 150.0 34.2 L 151.1 34.5 L 152.2 34.8 L 153.3 35.2 L 154.3 35.6 L 155.4 36.1 L 156.4 36.6 L 157.4 37.2 L 158.4 37.8 L 159.4 38.4 L 160.4 39.0 L 161.3 39.7 L 162.3 40.3 L 163.3 41.0 L 164.2 41.7 L 165.2 42.4" stroke="#2E7BE8"/>
              </g>
            </svg>
            <span className="text-4xl font-extrabold text-brand-ink tracking-tight" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
              TRGB
            </span>
          </div>
          <img src={GobbetteStrip} alt="" className="h-3 w-auto opacity-30" aria-hidden="true" />
          <p className="text-brand-ink/60 text-sm">
            Seleziona un'area per iniziare.
          </p>
        </div>

        {loading ? (
          <TrgbLoader size={56} label="Caricamento…" className="py-12" />
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
        <div className="mt-12 flex flex-col items-center gap-2">
          <img src={GobbetteStrip} alt="" className="w-24 opacity-30" aria-hidden="true" />
          <span className="text-xs text-brand-ink/40">
            TRGB Gestionale v{MODULE_VERSIONS.sistema.version} — Osteria Tre Gobbi, Bergamo
          </span>
        </div>
      </div>
    </div>
  );
}
