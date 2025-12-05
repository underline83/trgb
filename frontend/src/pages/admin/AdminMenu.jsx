import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function AdminMenu() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-center sm:text-left mb-4 text-amber-900 tracking-wide font-playfair">
              🧾 Amministrazione — Osteria Tre Gobbi
            </h1>
            <p className="text-center sm:text-left text-neutral-600 mb-2">
              Seleziona un modulo amministrativo da gestire.
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
          
          {/* CORRISPETTIVI */}
          <Link
            to="/admin/corrispettivi"
            className="
              bg-yellow-50 border border-yellow-200 text-yellow-900
              rounded-2xl p-8 shadow
              hover:shadow-xl hover:-translate-y-1 transition transform
              text-center
            "
          >
            <div className="text-5xl mb-3">💵</div>
            <h2 className="text-xl font-semibold font-playfair">
              Corrispettivi &amp; Chiusura Cassa
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Import da Excel, registrazione giornaliera e gestione cassa.
            </p>
          </Link>

          {/* FATTURE ELETTRONICHE */}
          <Link
            to="/admin/fatture"
            className="
              bg-amber-50 border border-amber-200 text-amber-900
              rounded-2xl p-8 shadow
              hover:shadow-xl hover:-translate-y-1 transition transform
              text-center
            "
          >
            <div className="text-5xl mb-3">🧾</div>
            <h2 className="text-xl font-semibold font-playfair">
              Fatture Elettroniche (XML)
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Import XML acquisti, analisi per fornitore e dashboard mensile.
            </p>
          </Link>

          {/* DIPENDENTI — MENU */}
          <Link
            to="/admin/dipendenti"
            className="
              bg-purple-50 border border-purple-200 text-purple-900
              rounded-2xl p-8 shadow
              hover:shadow-xl hover:-translate-y-1 transition transform
              text-center
            "
          >
            <div className="text-5xl mb-3">👥</div>
            <h2 className="text-xl font-semibold font-playfair">
              Dipendenti
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Anagrafica personale, ruoli e gestione turni.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
