// @version: v4.0 — TRGB-02 brand integration (wordmark + cream + gobbette strip)
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";
import MODULE_VERSIONS, { VersionBadge } from "../config/versions";
import MODULES_MENU from "../config/modulesMenu";
import DashboardSala from "./DashboardSala";
import TrgbLoader from "../components/TrgbLoader";
import TrgbWordmark from "../assets/brand/TRGB-02-wordmark-color.svg";
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
        {/* Wordmark brand + strip gobbette */}
        <div className="flex flex-col items-center gap-4 mb-10">
          <img src={TrgbWordmark} alt="TRGB" className="h-16 w-auto" />
          <img src={GobbetteStrip} alt="" className="w-40 opacity-40" aria-hidden="true" />
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
