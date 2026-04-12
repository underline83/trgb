// FILE: frontend/src/pages/DashboardSala.jsx
// @version: v4.0 — Originale Potenziato: emoji + colori modulesMenu
// Dashboard a tile per utenti sala — accesso rapido alle funzioni principali

import React from "react";
import { useNavigate } from "react-router-dom";

const TILES = [
  {
    key: "fine-turno",
    title: "Chiusura Turno",
    line1: "Compila la chiusura cassa",
    line2: "Fine servizio",
    icon: "💵",
    go: "/vendite/fine-turno",
    color: "bg-indigo-50 border-indigo-200 text-indigo-900",
  },
  {
    key: "cantina",
    title: "Cantina Vini",
    line1: "Cerca vini e giacenze",
    line2: "Magazzino e locazioni",
    icon: "🍷",
    go: "/vini/magazzino",
    color: "bg-amber-50 border-amber-200 text-amber-900",
  },
  {
    key: "prenotazioni",
    title: "Prenotazioni",
    line1: "Tavoli e servizi",
    line2: "Planning di oggi",
    icon: "📅",
    go: "/prenotazioni",
    color: "bg-indigo-50 border-indigo-200 text-indigo-900",
  },
];

export default function DashboardSala() {
  const navigate = useNavigate();
  const displayName = localStorage.getItem("display_name") || localStorage.getItem("username") || "Sala";

  const h = new Date().getHours();
  const saluto = h < 12 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";

  return (
    <div className="min-h-screen bg-brand-cream p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-brand-ink font-playfair">
            {saluto}, {displayName}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#a8a49e" }}>
            Cosa devi fare?
          </p>
        </div>

        {/* Tiles — Originale Potenziato */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TILES.map((tile) => (
            <div
              key={tile.key}
              onClick={() => navigate(tile.go)}
              className={`cursor-pointer active:scale-[.97] transition-transform overflow-hidden rounded-[14px] border ${tile.color}`}
              style={{
                boxShadow: "0 2px 10px rgba(0,0,0,.06)",
                padding: 16,
                minHeight: 110,
              }}
            >
              <span className="text-[28px] leading-none">{tile.icon}</span>
              <div className="mt-2.5">
                <div className="text-[14px] font-bold">{tile.title}</div>
                <div className="text-[11px] opacity-70 mt-1">{tile.line1}</div>
                <div className="text-[11px] opacity-55">{tile.line2}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Link alla home completa */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate("/?full=1")}
            className="text-sm transition"
            style={{ color: "#a8a49e" }}
          >
            Mostra tutti i moduli
          </button>
        </div>
      </div>
    </div>
  );
}
