// FILE: frontend/src/pages/DashboardSala.jsx
// Dashboard a tile per utenti sala — accesso rapido alle funzioni principali

import React from "react";
import { useNavigate } from "react-router-dom";

const TILES = [
  {
    key: "fine-turno",
    title: "Chiusura Turno",
    subtitle: "Compila la chiusura cassa di fine servizio",
    icon: "🧾",
    go: "/vendite/fine-turno",
    color: "bg-yellow-50 border-yellow-300 text-yellow-900",
    iconBg: "bg-yellow-100",
  },
  {
    key: "cantina",
    title: "Cantina Vini",
    subtitle: "Cerca vini, controlla giacenze e locazioni",
    icon: "🍷",
    go: "/vini/magazzino",
    color: "bg-amber-50 border-amber-300 text-amber-900",
    iconBg: "bg-amber-100",
  },
  {
    key: "checklist",
    title: "Checklist Servizio",
    subtitle: "Controlli apertura e chiusura sala",
    icon: "✅",
    go: "/vendite/fine-turno",
    color: "bg-emerald-50 border-emerald-300 text-emerald-900",
    iconBg: "bg-emerald-100",
  },
];

export default function DashboardSala() {
  const navigate = useNavigate();
  const displayName = localStorage.getItem("display_name") || localStorage.getItem("username") || "Sala";

  return (
    <div className="min-h-screen bg-brand-cream p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-white shadow-xl rounded-3xl p-8 border border-neutral-200 mb-6 text-center">
          <h1 className="text-3xl font-bold text-rose-900 font-playfair">
            Ciao, {displayName}
          </h1>
          <p className="text-neutral-500 mt-1 text-sm">
            Cosa devi fare?
          </p>
        </div>

        {/* Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TILES.map((tile) => (
            <div
              key={tile.key}
              onClick={() => navigate(tile.go)}
              className={`rounded-2xl border-2 shadow-lg p-6 cursor-pointer
                hover:shadow-xl hover:-translate-y-1 transition-all duration-200
                ${tile.color} flex flex-col items-center text-center`}
            >
              <div className={`w-16 h-16 rounded-2xl ${tile.iconBg} flex items-center justify-center text-3xl mb-4`}>
                {tile.icon}
              </div>
              <div className="text-lg font-bold">{tile.title}</div>
              <div className="text-sm opacity-70 mt-1">{tile.subtitle}</div>
            </div>
          ))}
        </div>

        {/* Link alla home completa per chi ha bisogno */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate("/?full=1")}
            className="text-sm text-neutral-400 hover:text-neutral-600 transition"
          >
            Mostra tutti i moduli
          </button>
        </div>
      </div>
    </div>
  );
}
