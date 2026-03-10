// @version: v1.1-versioned
// Menu principale Gestione Ricette — Tre Gobbi
// Coerente con Home & Gestione Vini

import React from "react";
import { useNavigate } from "react-router-dom";
import { VersionBadge } from "../../config/versions";

export default function RicetteMenu() {
  const navigate = useNavigate();

  const tiles = [
    {
      title: "Nuova ricetta",
      subtitle: "Inserimento guidato con sub-ricette",
      icon: "➕",
      onClick: () => navigate("/ricette/nuova"),
      color: "bg-amber-50 border-amber-200 text-amber-900",
    },
    {
      title: "Archivio ricette",
      subtitle: "Lista completa con food cost calcolato",
      icon: "📚",
      onClick: () => navigate("/ricette/archivio"),
      color: "bg-blue-50 border-blue-200 text-blue-900",
    },
    {
      title: "Ingredienti & prezzi",
      subtitle: "Anagrafica, fornitori, storico prezzi",
      icon: "🧾",
      onClick: () => navigate("/ricette/ingredienti"),
      color: "bg-green-50 border-green-200 text-green-900",
    },
    {
      title: "Matching fatture",
      subtitle: "Collega righe fattura XML agli ingredienti",
      icon: "🔗",
      onClick: () => navigate("/ricette/matching"),
      color: "bg-purple-50 border-purple-200 text-purple-900",
    },
    {
      title: "Import / Export",
      subtitle: "JSON, backup, integrazione",
      icon: "📥",
      onClick: () => navigate("/ricette/import"),
      color: "bg-neutral-50 border-neutral-300 text-neutral-800",
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">

        {/* HEADER + TORNA A HOME */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-4xl font-bold text-amber-900 tracking-wide font-playfair text-center sm:text-left">
                📘 Ricette & Food Cost
              </h1>
              <VersionBadge modulo="ricette" />
            </div>
            <p className="text-neutral-600 text-center sm:text-left">
              Archivio strutturato di ricette, ingredienti e costi.
            </p>
          </div>

          <div className="flex justify-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="
                px-4 py-2 rounded-xl text-sm font-medium
                border border-neutral-300 bg-neutral-50
                hover:bg-neutral-100 hover:-translate-y-0.5
                shadow-sm transition
              "
            >
              ← Torna alla Home
            </button>
          </div>
        </div>

        {/* GRID MENU RICETTE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {tiles.map((tile) => (
            <button
              key={tile.title}
              type="button"
              onClick={tile.onClick}
              className={`
                ${tile.color}
                w-full text-left
                rounded-2xl border p-7 shadow
                hover:shadow-xl hover:-translate-y-1
                transition transform cursor-pointer
              `}
              style={{ fontFamily: "Inter", borderWidth: "1px" }}
            >
              <div className="text-4xl mb-3">{tile.icon}</div>
              <div className="text-xl font-semibold font-playfair mb-1">
                {tile.title}
              </div>
              <div className="text-sm text-neutral-700 opacity-90">
                {tile.subtitle}
              </div>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}