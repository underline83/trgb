// @version: v1.0-clienti-menu
// Hub modulo Clienti CRM — TRGB Gestionale
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import MODULE_VERSIONS, { VersionBadge } from "../../config/versions";

const SEZIONI = [
  {
    to: "/clienti/lista",
    icon: "📇",
    title: "Anagrafica",
    subtitle: "Cerca, filtra, visualizza e modifica schede clienti",
    color: "bg-teal-50 border-teal-200 text-teal-900",
    ready: true,
  },
  {
    to: "/clienti/dashboard",
    icon: "📊",
    title: "Dashboard",
    subtitle: "Statistiche CRM, compleanni in arrivo, distribuzione tag e rank",
    color: "bg-sky-50 border-sky-200 text-sky-900",
    ready: true,
  },
  {
    to: "/clienti/import",
    icon: "📥",
    title: "Import TheFork",
    subtitle: "Importa clienti dall'export XLSX di TheFork",
    color: "bg-amber-50 border-amber-200 text-amber-900",
    ready: true,
    roles: ["superadmin", "admin"],
  },
  {
    to: "/clienti/prenotazioni",
    icon: "📅",
    title: "Prenotazioni",
    subtitle: "Storico prenotazioni TheFork: date, pax, tavoli, canale, note",
    color: "bg-indigo-50 border-indigo-200 text-indigo-900",
    ready: true,
  },
];

export default function ClientiMenu() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    apiFetch(`${API_BASE}/clienti/dashboard/stats`)
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  const visibleSezioni = SEZIONI.filter(
    (s) => !s.roles || s.roles.includes(role)
  );

  return (
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-4xl font-bold text-center flex-1">
            <span className="mr-2">🤝</span> Gestione Clienti
          </h1>
        </div>
        <p className="text-center text-neutral-600 mb-1">
          CRM del ristorante: anagrafica, preferenze, tag, note e storico clienti.
        </p>
        {stats && (
          <p className="text-center text-sm text-teal-600 font-medium mb-2">
            {stats.totale?.toLocaleString("it-IT")} client{stats.totale === 1 ? "e" : "i"} attiv{stats.totale === 1 ? "o" : "i"}
            {stats.vip > 0 && ` · ${stats.vip} VIP`}
            {stats.compleanni_prossimi?.length > 0 && (
              <span className="text-amber-600">
                {" · "}🎂 {stats.compleanni_prossimi.length} compleanno{stats.compleanni_prossimi.length > 1 ? "i" : ""} questa settimana
              </span>
            )}
          </p>
        )}
        <div className="text-center mb-10">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-neutral-500 hover:text-neutral-700 transition"
          >
            ← Torna alla Home
          </button>
        </div>

        {/* GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {visibleSezioni.map((s) => {
            if (!s.ready) {
              return (
                <div
                  key={s.title}
                  className={`rounded-2xl border shadow-lg p-6 opacity-50 cursor-default ${s.color}`}
                >
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
              <div
                key={s.title}
                onClick={() => navigate(s.to)}
                className={`rounded-2xl border shadow-lg p-6 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition ${s.color}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="text-4xl">{s.icon}</div>
                  {s.title === "Anagrafica" && <VersionBadge modulo="clienti" />}
                </div>
                <div className="text-xl font-semibold">{s.title}</div>
                <div className="text-sm opacity-80">{s.subtitle}</div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-xs text-neutral-400">
          Modulo Clienti v{MODULE_VERSIONS.clienti?.version} — Osteria Tre Gobbi
        </div>
      </div>
    </div>
  );
}
