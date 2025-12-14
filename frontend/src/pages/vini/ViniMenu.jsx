// @version: v3.1-premium-magazzino-menu-finale
// Menu Gestione Vini — Vintage Premium + Magazzino (FINAL STRUCTURE)

import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function ViniMenu() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-center sm:text-left mb-4 text-amber-900 tracking-wide font-playfair">
              🍷 Gestione Vini — Osteria Tre Gobbi
            </h1>
            <p className="text-center sm:text-left text-neutral-600 mb-2">
              Modulo completo gestione vini, magazzino e analisi.
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

        {/* GRID MENU */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

          {/* CARTA VINI */}
          <Link
            to="/vini/carta"
            className="
              bg-amber-50 border border-amber-200 text-amber-900
              rounded-2xl p-8 shadow
              hover:shadow-xl hover:-translate-y-1 transition transform
              text-center
            "
          >
            <div className="text-5xl mb-3">📜</div>
            <h2 className="text-xl font-semibold font-playfair">
              Carta dei Vini
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Consultazione carta (HTML / PDF / Word)
            </p>
          </Link>

          {/* DATABASE / RICERCA */}
          <Link
            to="/vini/database"
            className="
              bg-blue-50 border border-blue-200 text-blue-900
              rounded-2xl p-8 shadow
              hover:shadow-xl hover:-translate-y-1 transition transform
              text-center
            "
          >
            <div className="text-5xl mb-3">🔎</div>
            <h2 className="text-xl font-semibold font-playfair">
              Database & Ricerca Vini
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Ricerca completa anagrafica vini
            </p>
          </Link>

          {/* VENDITE */}
          <Link
            to="/vini/vendite"
            className="
              bg-emerald-50 border border-emerald-200 text-emerald-900
              rounded-2xl p-8 shadow
              hover:shadow-xl hover:-translate-y-1 transition transform
              text-center
            "
          >
            <div className="text-5xl mb-3">💶</div>
            <h2 className="text-xl font-semibold font-playfair">
              Vendite Vini
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Vendite bottiglia / calice
            </p>
          </Link>

          {/* MAGAZZINO */}
          <Link
            to="/vini/magazzino"
            className="
              bg-purple-50 border border-purple-200 text-purple-900
              rounded-2xl p-8 shadow
              hover:shadow-xl hover:-translate-y-1 transition transform
              text-center
            "
          >
            <div className="text-5xl mb-3">🏷️</div>
            <h2 className="text-xl font-semibold font-playfair">
              Magazzino Vini
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Giacenze, locazioni, stato vendita
            </p>
          </Link>

          {/* MOVIMENTI CANTINA */}
          <div
            className="
              bg-neutral-50 border border-neutral-300 text-neutral-400
              rounded-2xl p-8 shadow
              text-center cursor-not-allowed relative
            "
          >
            <div className="text-5xl mb-3">📦</div>
            <h2 className="text-xl font-semibold font-playfair">
              Movimenti Cantina
            </h2>
            <p className="text-sm mt-1">
              Carico / Scarico / Vendita / Rottura
            </p>
            <span className="absolute top-3 right-4 text-xs font-semibold bg-neutral-200 px-2 py-0.5 rounded">
              In sviluppo
            </span>
          </div>

          {/* DASHBOARD */}
          <div
            className="
              bg-neutral-50 border border-neutral-300 text-neutral-400
              rounded-2xl p-8 shadow
              text-center cursor-not-allowed relative
            "
          >
            <div className="text-5xl mb-3">📊</div>
            <h2 className="text-xl font-semibold font-playfair">
              Dashboard Vini
            </h2>
            <p className="text-sm mt-1">
              Analisi vendite, vini fermi, alert
            </p>
            <span className="absolute top-3 right-4 text-xs font-semibold bg-neutral-200 px-2 py-0.5 rounded">
              In sviluppo
            </span>
          </div>

          {/* IMPOSTAZIONI */}
          <Link
            to="/vini/settings"
            className="
              bg-neutral-50 border border-neutral-300 text-neutral-800
              rounded-2xl p-8 shadow
              hover:shadow-xl hover:-translate-y-1 transition transform
              text-center
            "
          >
            <div className="text-5xl mb-3">⚙️</div>
            <h2 className="text-xl font-semibold font-playfair">
              Impostazioni Modulo Vini
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Import, allineamenti, liste controllate
            </p>
          </Link>

        </div>
      </div>
    </div>
  );
}