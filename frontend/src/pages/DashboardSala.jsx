// FILE: frontend/src/pages/DashboardSala.jsx
// @version: v2.0 — Home v3 style
// Dashboard a tile per utenti sala — accesso rapido alle funzioni principali
// Stile coerente con Home v3: icone SVG, colori smorzati, card 14px radius

import React from "react";
import { useNavigate } from "react-router-dom";
import { IconVendite, IconVini, IconPrenotazioni } from "../components/icons";

/* ── Palette smorzata coerente con Home v3 ── */
const TILES = [
  {
    key: "fine-turno",
    title: "Chiusura Turno",
    subtitle: "Compila la chiusura cassa di fine servizio",
    Icon: IconVendite,
    go: "/vendite/fine-turno",
    accent: "#5A6B50",   // vendite muted
    tint: "#EEF0EC",
    gobbetta: "#E8402B",
  },
  {
    key: "cantina",
    title: "Cantina Vini",
    subtitle: "Cerca vini, controlla giacenze e locazioni",
    Icon: IconVini,
    go: "/vini/magazzino",
    accent: "#B8860B",   // vini muted
    tint: "#F5F0E6",
    gobbetta: "#2EB872",
  },
  {
    key: "prenotazioni",
    title: "Prenotazioni",
    subtitle: "Visualizza le prenotazioni di oggi",
    Icon: IconPrenotazioni,
    go: "/prenotazioni",
    accent: "#8B5E3C",   // prenotazioni muted
    tint: "#F3EDE7",
    gobbetta: "#2E7BE8",
  },
];

export default function DashboardSala() {
  const navigate = useNavigate();
  const displayName = localStorage.getItem("display_name") || localStorage.getItem("username") || "Sala";

  /* Saluto contestuale */
  const h = new Date().getHours();
  const saluto = h < 12 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";

  return (
    <div className="min-h-screen bg-brand-cream p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div
          className="bg-white p-8 mb-6 text-center"
          style={{ borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}
        >
          <h1 className="text-2xl font-bold text-brand-ink font-playfair">
            {saluto}, {displayName}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#a8a49e" }}>
            Cosa devi fare?
          </p>
        </div>

        {/* Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TILES.map((tile) => (
            <div
              key={tile.key}
              onClick={() => navigate(tile.go)}
              className="bg-white cursor-pointer hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col items-center text-center"
              style={{
                borderRadius: 14,
                boxShadow: "0 1px 3px rgba(0,0,0,.04)",
                borderTop: `2px solid ${tile.gobbetta}50`,
              }}
            >
              <div className="pt-6 pb-2">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto"
                  style={{ backgroundColor: tile.tint, color: tile.accent }}
                >
                  <tile.Icon size={24} />
                </div>
              </div>
              <div className="px-5 pb-5">
                <div className="text-base font-semibold text-brand-ink mt-2">{tile.title}</div>
                <div className="text-xs mt-1" style={{ color: "#a8a49e" }}>{tile.subtitle}</div>
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
