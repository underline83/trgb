// @version: v1.0-ricette-menu
// Menu principale Gestione Ricette — Tre Gobbi
// Coerente con Home & Gestione Vini

import React from "react";
import { useNavigate } from "react-router-dom";

export default function RicetteMenu() {
  const navigate = useNavigate();

  const tiles = [
    {
      title: "Nuova ricetta",
      subtitle: "Inserimento manuale guidato",
      icon: "➕",
      onClick: () => navigate("/ricette/nuova"), // pagina futura
      color: "bg-amber-50 border-amber-200 text-amber-900",
    },
    {
      title: "Archivio ricette",
      subtitle: "Cerca, modifica, duplica",
      icon: "📚",
      onClick: () => navigate("/ricette/archivio"), // pagina futura
      color: "bg-blue-50 border-blue-200 text-blue-900",
    },
    {
      title: "Ingredienti & database",
      subtitle: "Materie prime condivise con Food Cost",
      icon: "🧾",
      onClick: () => navigate("/ricette/ingredienti"), // pagina futura
      color: "bg-green-50 border-green-200 text-green-900",
    },
    {
      title: "Import / Export",
      subtitle: "JSON, backup, integrazione con GPT",
      icon: "📥",
      onClick: () => navigate("/ricette/import"), // pagina futura
      color: "bg-neutral-50 border-neutral-300 text-neutral-800",
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">

        {/* HEADER + TORNA A HOME */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2 text-center sm:text-left">
              📘 Gestione Ricette — Osteria Tre Gobbi
            </h1>
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