// FILE: frontend/src/pages/DashboardSala.jsx
// @version: v3.0 — Home v3.2 Magazine style
// Dashboard a tile per utenti sala — accesso rapido alle funzioni principali
// Stile Magazine: card bianche, accent bar colorata, icona tinta, 2 righe testo

import React from "react";
import { useNavigate } from "react-router-dom";
import { IconVendite, IconVini, IconPrenotazioni } from "../components/icons";

const TILES = [
  {
    key: "fine-turno",
    title: "Chiusura Turno",
    line1: "Compila la chiusura cassa",
    line2: "Fine servizio",
    Icon: IconVendite,
    go: "/vendite/fine-turno",
    accent: "#5A6B50",
    tint: "#EBF0E8",
  },
  {
    key: "cantina",
    title: "Cantina Vini",
    line1: "Cerca vini e giacenze",
    line2: "Magazzino e locazioni",
    Icon: IconVini,
    go: "/vini/magazzino",
    accent: "#B8860B",
    tint: "#F5F0E6",
  },
  {
    key: "prenotazioni",
    title: "Prenotazioni",
    line1: "Tavoli e servizi",
    line2: "Planning di oggi",
    Icon: IconPrenotazioni,
    go: "/prenotazioni",
    accent: "#8B5E3C",
    tint: "#F3EDE7",
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

        {/* Tiles — Magazine style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TILES.map((tile) => (
            <div
              key={tile.key}
              onClick={() => navigate(tile.go)}
              className="bg-white cursor-pointer active:scale-[.97] transition-transform overflow-hidden relative"
              style={{
                borderRadius: 14,
                boxShadow: "0 2px 8px rgba(0,0,0,.05)",
                padding: 16,
              }}
            >
              {/* Accent bar */}
              <div
                className="absolute top-0 left-0 right-0 h-[3px]"
                style={{ background: tile.accent }}
              />
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-[11px] flex items-center justify-center"
                style={{ background: tile.tint, color: tile.accent }}
              >
                <tile.Icon size={22} />
              </div>
              {/* Text */}
              <div className="mt-2.5">
                <div className="text-[14px] font-bold text-brand-ink">{tile.title}</div>
                <div className="text-[11px] mt-1" style={{ color: "#888" }}>{tile.line1}</div>
                <div className="text-[11px]" style={{ color: "#aaa" }}>{tile.line2}</div>
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
