// @version: v2.0-dipendenti-hub
import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const SEZIONI = [
  {
    to: "/dipendenti/anagrafica",
    icon: "\uD83D\uDDC2\uFE0F",
    title: "Anagrafica",
    desc: "Dati personali, ruoli, IBAN, documenti allegati",
    color: "bg-purple-50 border-purple-200 text-purple-900",
    ready: true,
  },
  {
    to: "/dipendenti/buste-paga",
    icon: "\uD83D\uDCCB",
    title: "Buste Paga",
    desc: "Import PDF cedolini, netti, contributi, scadenze stipendio",
    color: "bg-sky-50 border-sky-200 text-sky-900",
    ready: true,
  },
  {
    to: "/dipendenti/turni",
    icon: "\uD83D\uDCC5",
    title: "Turni",
    desc: "Calendario turni settimanale e mensile del personale",
    color: "bg-indigo-50 border-indigo-200 text-indigo-900",
    ready: true,
  },
  {
    to: "/dipendenti/scadenze",
    icon: "\uD83D\uDEA8",
    title: "Scadenze Documenti",
    desc: "HACCP, sicurezza, visite mediche, permessi — con alert",
    color: "bg-amber-50 border-amber-200 text-amber-900",
    ready: true,
  },
  {
    to: "/dipendenti/costi",
    icon: "\uD83D\uDCB0",
    title: "Costi Personale",
    desc: "Costo mensile, per ruolo, incidenza su ricavi, trend",
    color: "bg-rose-50 border-rose-200 text-rose-900",
    ready: false,
  },
  {
    to: "#",
    icon: "\uD83D\uDCDD",
    title: "Contratti",
    desc: "Tipologia, scadenze, allegati PDF — prossimamente",
    color: "bg-neutral-50 border-neutral-200 text-neutral-500",
    ready: false,
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
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-purple-900 tracking-wide font-playfair flex items-center gap-3">
              <span className="text-4xl">{"\uD83D\uDC65"}</span> Dipendenti
            </h1>
            <p className="text-neutral-600 mt-1">
              Gestione completa del personale: anagrafica, buste paga, turni, scadenze, costi.
            </p>
            {stats && (
              <p className="text-sm text-purple-600 mt-1 font-medium">
                {stats.totale} dipendent{stats.totale === 1 ? "e" : "i"} attiv{stats.totale === 1 ? "o" : "i"}
              </p>
            )}
          </div>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-xl text-sm border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition self-start"
          >
            {"\u2190"} Home
          </button>
        </div>

        {/* GRID SEZIONI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {SEZIONI.map((s) => {
            if (!s.ready) {
              return (
                <div key={s.title}
                  className={`rounded-2xl p-7 border shadow-sm opacity-50 cursor-default ${s.color}`}>
                  <div className="text-4xl mb-2">{s.icon}</div>
                  <h2 className="text-lg font-semibold font-playfair">{s.title}</h2>
                  <p className="text-sm mt-1 opacity-70">{s.desc}</p>
                  <span className="inline-block mt-2 text-[10px] bg-neutral-200 text-neutral-500 px-2 py-0.5 rounded-full font-medium">
                    Prossimamente
                  </span>
                </div>
              );
            }
            return (
              <Link key={s.title} to={s.to}
                className={`rounded-2xl p-7 border shadow hover:shadow-xl hover:-translate-y-1 transition ${s.color}`}>
                <div className="text-4xl mb-2">{s.icon}</div>
                <h2 className="text-lg font-semibold font-playfair">{s.title}</h2>
                <p className="text-neutral-700 text-sm mt-1">{s.desc}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
