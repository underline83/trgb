// @version: v1.0-movimenti-cantina-placeholder
// Movimenti Cantina — placeholder (UI finale, logica in arrivo)

import React from "react";
import { useNavigate } from "react-router-dom";

export default function MovimentiCantina() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-4">
              📦 Movimenti Cantina
            </h1>
            <p className="text-neutral-600">
              Carico / Scarico / Vendita bottiglia / Vendita calice / Rottura / Rettifiche.
            </p>
          </div>

          <div className="flex justify-center sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => navigate("/vini")}
              className="
                px-4 py-2 rounded-xl text-sm font-medium
                border border-neutral-300 bg-neutral-50
                hover:bg-neutral-100 hover:-translate-y-0.5
                shadow-sm transition
              "
            >
              ← Menu Vini
            </button>
          </div>
        </div>

        <div className="bg-neutral-50 border border-neutral-300 rounded-2xl p-6 shadow-inner">
          <div className="text-sm text-neutral-700">
            <div className="inline-flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold bg-neutral-200 px-2 py-1 rounded">
                In sviluppo
              </span>
              <span className="text-xs text-neutral-500">
                Qui agganceremo i movimenti su <strong>vini_magazzino_movimenti</strong>.
              </span>
            </div>

            <ul className="list-disc pl-5 space-y-2">
              <li>Ricerca vino (come in magazzino) → selezione rapida.</li>
              <li>Pulsanti evento: Carico, Scarico, Vendita bottiglia, Vendita calice, Rottura, Rettifica.</li>
              <li>Scrittura movimento + aggiornamento QTA_TOTALE.</li>
              <li>Timeline movimenti recente e filtri per periodo/utente.</li>
            </ul>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow transition"
            >
              Vai a Magazzino Vini
            </button>
            <button
              type="button"
              onClick={() => navigate("/vini/settings")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-white hover:bg-neutral-50 shadow-sm transition"
            >
              Impostazioni Modulo Vini
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}