// @version: v1.0-prenotazioni-menu
// Hub modulo Prenotazioni — TRGB Gestionale
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import MODULE_VERSIONS, { VersionBadge } from "../../config/versions";

const oggi = new Date().toISOString().slice(0, 10);

const SEZIONI = [
  {
    to: `/prenotazioni/planning/${oggi}`,
    icon: "📋",
    title: "Planning Giornaliero",
    subtitle: "Gestisci le prenotazioni di oggi: arrivi, tavoli, stati",
    color: "bg-indigo-50 border-indigo-200 text-indigo-900",
    ready: true,
  },
  {
    to: "/prenotazioni/mappa",
    icon: "🗺️",
    title: "Mappa Tavoli",
    subtitle: "Vista sala con tavoli, assegnazione e stato in tempo reale",
    color: "bg-emerald-50 border-emerald-200 text-emerald-900",
    ready: true,
  },
  {
    to: `/prenotazioni/settimana/${oggi}`,
    icon: "📆",
    title: "Vista Settimanale",
    subtitle: "Panoramica della settimana: prenotazioni e coperti per giorno",
    color: "bg-sky-50 border-sky-200 text-sky-900",
    ready: true,
  },
  {
    to: "/prenotazioni/tavoli",
    icon: "✏️",
    title: "Editor Piantina",
    subtitle: "Posiziona i tavoli, gestisci zone e layout sala",
    color: "bg-amber-50 border-amber-200 text-amber-900",
    ready: true,
    roles: ["superadmin", "admin"],
  },
  {
    to: "/prenotazioni/impostazioni",
    icon: "⚙️",
    title: "Impostazioni",
    subtitle: "Slot orari, capienza, template messaggi",
    color: "bg-neutral-50 border-neutral-300 text-neutral-800",
    ready: true,
    roles: ["superadmin", "admin"],
  },
];

export default function PrenotazioniMenu() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    apiFetch(`${API_BASE}/prenotazioni/planning/${oggi}`)
      .then((r) => r.json())
      .then((data) => setStats(data.contatori))
      .catch(() => {});
  }, []);

  const visibleSezioni = SEZIONI.filter(
    (s) => !s.roles || s.roles.includes(role)
  );

  return (
    <div className="min-h-screen bg-brand-cream p-6">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-4xl font-bold text-center flex-1">
            <span className="mr-2">📅</span> Prenotazioni
          </h1>
        </div>
        <p className="text-center text-neutral-600 mb-1">
          Gestione prenotazioni, planning serale, tavoli e conferme.
        </p>
        {stats && (
          <p className="text-center text-sm text-indigo-600 font-medium mb-2">
            Oggi: {stats.pranzo_count + stats.cena_count} prenotazioni · {stats.pranzo_pax + stats.cena_pax} coperti
            {stats.senza_tavolo > 0 && (
              <span className="text-amber-600"> · {stats.senza_tavolo} senza tavolo</span>
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
          {visibleSezioni.map((s) => (
            <div
              key={s.title}
              onClick={() => navigate(s.to)}
              className={`rounded-2xl border shadow-lg p-6 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition ${s.color}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-4xl">{s.icon}</div>
                {s.title === "Planning Giornaliero" && <VersionBadge modulo="prenotazioni" />}
              </div>
              <div className="text-xl font-semibold">{s.title}</div>
              <div className="text-sm opacity-80">{s.subtitle}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-xs text-neutral-400">
          Modulo Prenotazioni v{MODULE_VERSIONS.prenotazioni?.version || "1.0"} — Osteria Tre Gobbi
        </div>
      </div>
    </div>
  );
}
