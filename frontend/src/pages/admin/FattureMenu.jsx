// @version: v1.0-fe-menu
import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function FattureMenu() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🧾 Fatture Elettroniche — Modulo Acquisti
            </h1>
            <p className="text-neutral-600 text-sm sm:text-base">
              Gestione import massivo XML, elenco fatture e analisi acquisti
              per fornitore e mese.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Amministrazione
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-200 bg-white hover:bg-neutral-50 shadow-sm transition"
            >
              ← Home
            </button>
          </div>
        </div>

        {/* GRID MENU */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* IMPORT + ELENCO */}
          <Link
            to="/admin/fatture/import"
            className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
          >
            <div className="text-5xl mb-3">📤</div>
            <h2 className="text-xl font-semibold font-playfair">
              Import XML & Elenco Fatture
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Carica i file XML di fattura elettronica, evita duplicati,
              consulta elenco e dettaglio di ogni documento.
            </p>
          </Link>

          {/* DASHBOARD ACQUISTI */}
          <Link
            to="/admin/fatture/dashboard"
            className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
          >
            <div className="text-5xl mb-3">📈</div>
            <h2 className="text-xl font-semibold font-playfair">
              Dashboard Acquisti da Fatture
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Analisi per fornitore e per mese, totali annuali, andamento degli
              acquisti a partire dalle fatture importate.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
