import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function DipendentiMenu() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-amber-900 tracking-wide font-playfair">
              👥 Dipendenti — Moduli
            </h1>
            <p className="text-neutral-600">
              Gestione del personale, turni e analisi dei costi.
            </p>
          </div>

          <button
            onClick={() => navigate("/admin")}
            className="px-4 py-2 rounded-xl text-sm border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
          >
            ← Torna all'Amministrazione
          </button>
        </div>

        {/* GRID SOTTOMENU */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* ANAGRAFICA */}
          <Link
            to="/admin/dipendenti/anagrafica"
            className="bg-purple-50 border border-purple-200 text-purple-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition text-center"
          >
            <div className="text-5xl mb-3">🗂️</div>
            <h2 className="text-xl font-semibold font-playfair">
              Anagrafica Dipendenti
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Dati personali, ruoli, indirizzi, IBAN, note e documenti.
            </p>
          </Link>

          {/* TURNI */}
          <Link
            to="/admin/dipendenti/turni"
            className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition text-center"
          >
            <div className="text-5xl mb-3">📅</div>
            <h2 className="text-xl font-semibold font-playfair">
              Turni Dipendenti
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Calendario turni settimanale e mensile del personale.
            </p>
          </Link>

          {/* COSTI DIPENDENTI */}
          <Link
            to="/admin/dipendenti/costi"
            className="bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition text-center"
          >
            <div className="text-5xl mb-3">💰</div>
            <h2 className="text-xl font-semibold font-playfair">
              Costi Dipendenti
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Analisi dei costi del personale per periodo, ruolo e dipendente.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
