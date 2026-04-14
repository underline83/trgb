// @version: v2.4-dipendenti-hub-nav (DipendentiNav aggiunta in cima)
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import MODULE_VERSIONS, { VersionBadge } from "../../config/versions";
import DipendentiNav from "./DipendentiNav";

const SEZIONI = [
  {
    to: "/dipendenti/anagrafica",
    icon: "\uD83D\uDDC2\uFE0F",
    title: "Anagrafica",
    subtitle: "Dati personali, ruoli, IBAN, documenti allegati",
    color: "bg-purple-50 border-purple-200 text-purple-900",
    ready: true,
  },
  {
    to: "/dipendenti/buste-paga",
    icon: "\uD83D\uDCCB",
    title: "Buste Paga",
    subtitle: "Import PDF cedolini, netti, contributi, scadenze stipendio",
    color: "bg-sky-50 border-sky-200 text-sky-900",
    ready: true,
  },
  {
    to: "/dipendenti/turni",
    icon: "\uD83D\uDCC5",
    title: "Turni",
    subtitle: "Foglio settimana SALA/CUCINA con assegnazione slot e ore nette",
    color: "bg-indigo-50 border-indigo-200 text-indigo-900",
    ready: true,
  },
  {
    to: "/dipendenti/scadenze",
    icon: "\uD83D\uDEA8",
    title: "Scadenze Documenti",
    subtitle: "HACCP, sicurezza, visite mediche, permessi — con alert",
    color: "bg-amber-50 border-amber-200 text-amber-900",
    ready: true,
  },
  {
    to: "/dipendenti/costi",
    icon: "\uD83D\uDCB0",
    title: "Costi Personale",
    subtitle: "Costo mensile, per ruolo, incidenza su ricavi, trend",
    color: "bg-rose-50 border-rose-200 text-rose-900",
    ready: false,
  },
  {
    to: "/dipendenti/impostazioni",
    icon: "\u2699\uFE0F",  // ⚙️
    title: "Impostazioni",
    subtitle: "Reparti, orari standard, soglie CCNL, template WhatsApp",
    color: "bg-neutral-50 border-neutral-200 text-neutral-900",
    ready: true,
  },
];

export default function DipendentiMenu() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    apiFetch(`${API_BASE}/dipendenti/?include_inactive=false`)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.dipendenti || [];
        setStats({ totale: list.length });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-brand-cream">
      <DipendentiNav current="home" />
      <div className="p-6">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        {/* HEADER — stesso pattern di Home.jsx */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-4xl font-bold text-center flex-1">
            <span className="mr-2">{"\uD83D\uDC65"}</span> Dipendenti
          </h1>
        </div>
        <p className="text-center text-neutral-600 mb-1">
          Gestione completa del personale: anagrafica, buste paga, turni, scadenze, costi.
        </p>
        {stats && (
          <p className="text-center text-sm text-purple-600 font-medium mb-2">
            {stats.totale} dipendent{stats.totale === 1 ? "e" : "i"} attiv{stats.totale === 1 ? "o" : "i"}
          </p>
        )}
        <div className="text-center mb-10">
          <button onClick={() => navigate("/")}
            className="text-sm text-neutral-500 hover:text-neutral-700 transition">
            {"\u2190"} Torna alla Home
          </button>
        </div>

        {/* GRID — stesso layout tile di Home.jsx */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {SEZIONI.map((s) => {
            if (!s.ready) {
              return (
                <div key={s.title}
                  className={`rounded-2xl border shadow-lg p-6 opacity-50 cursor-default ${s.color}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-4xl">{s.icon}</div>
                    <span className="inline-flex items-center text-[10px] bg-neutral-200 text-neutral-500 px-2 py-0.5 rounded-full font-medium">
                      Prossimamente
                    </span>
                  </div>
                  <div className="text-xl font-semibold">{s.title}</div>
                  <div className="text-sm opacity-80">{s.subtitle}</div>
                </div>
              );
            }
            return (
              <div key={s.title} onClick={() => navigate(s.to)}
                className={`rounded-2xl border shadow-lg p-6 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition ${s.color}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="text-4xl">{s.icon}</div>
                  {s.title === "Anagrafica" && <VersionBadge modulo="dipendenti" />}
                </div>
                <div className="text-xl font-semibold">{s.title}</div>
                <div className="text-sm opacity-80">{s.subtitle}</div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-xs text-neutral-400">
          Modulo Dipendenti v{MODULE_VERSIONS.dipendenti?.version} — Osteria Tre Gobbi
        </div>
      </div>
      </div>
    </div>
  );
}
