import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function CorrispettiviMenu() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-center sm:text-left mb-4 text-amber-900 tracking-wide font-playfair">
              💵 Corrispettivi — Chiusure Cassa
            </h1>
            <p className="text-center sm:text-left text-neutral-600 mb-2">
              Gestisci import Excel e chiusure giornaliere.
            </p>
          </div>

          <div className="flex justify-center sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="
                px-4 py-2 rounded-xl text-sm font-medium
                border border-neutral-300 bg-neutral-50
                hover:bg-neutral-100 hover:-translate-y-0.5
                shadow-sm transition
              "
            >
              ← Torna ad Amministrazione
            </button>
          </div>
        </div>

        {/* MENU GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

          {/* IMPORT */}
          <Link
            to="/admin/corrispettivi/import"
            className="
              bg-yellow-50 border border-yellow-200 text-yellow-900
              rounded-2xl p-8 shadow
              hover:shadow-xl hover:-translate-y-1 transition transform
              text-center
            "
          >
            <div className="text-5xl mb-3">📤</div>
            <h2 className="text-xl font-semibold font-playfair">
              Importa da Excel
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Carica il file corrispettivi (2025, 2026, …)
            </p>
          </Link>

          {/* GESTIONE */}
          <Link
            to="/admin/corrispettivi/gestione"
            className="
              bg-green-50 border border-green-200 text-green-900
              rounded-2xl p-8 shadow
              hover:shadow-xl hover:-translate-y-1 transition transform
              text-center
            "
          >
            <div className="text-5xl mb-3">📝</div>
            <h2 className="text-xl font-semibold font-playfair">
              Gestione Chiusure
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Inserisci e modifica le chiusure cassa giornaliere.
            </p>
          </Link>

        </div>
      </div>
    </div>
  );
}
