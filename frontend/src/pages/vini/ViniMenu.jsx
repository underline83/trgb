// @version: v3.0-premium-magazzino
// Menu Gestione Vini — Vintage Premium + Magazzino

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
              Scegli un modulo da gestire.
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

          {/* --- CARTA VINI --- */}
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
              Anteprima HTML, PDF, Word
            </p>
          </Link>

          {/* --- DATABASE (Import Excel) --- */}
          <Link
            to="/vini/database"
            className="
              bg-blue-50 border border-blue-200 text-blue-900
              rounded-2xl p-8 shadow
              hover:shadow-xl hover:-translate-y-1 transition transform
              text-center
            "
          >
            <div className="text-5xl mb-3">📥</div>
            <h2 className="text-xl font-semibold font-playfair">
              Import / Database Carta
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Carica e aggiorna i dati da Excel
            </p>
          </Link>

{/* MAGAZZINO VINI */}
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
    Giacenze cantina, locazioni, stato vendita
  </p>
</Link>

          {/* --- IMPOSTAZIONI CARTA --- */}
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
              Impostazioni Carta
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Tipologie, regioni, preferenze (solo per Carta da Excel)
            </p>
          </Link>

        </div>

      </div>
    </div>
  );
}