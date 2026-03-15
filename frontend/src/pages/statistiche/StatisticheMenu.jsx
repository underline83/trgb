// @version: v1.0-statistiche-menu
// Menu principale sezione Statistiche
import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { VersionBadge } from "../../config/versions";

export default function StatisticheMenu() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-4xl font-bold text-rose-900 tracking-wide font-playfair">
                Statistiche
              </h1>
              <VersionBadge modulo="statistiche" />
            </div>
            <p className="text-neutral-600 mb-2">
              Analizza le vendite iPratico: categorie, prodotti, trend mensili.
            </p>
          </div>
          <div className="flex justify-center sm:justify-end">
            <button
              onClick={() => navigate("/")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Torna alla Home
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Link
            to="/statistiche/dashboard"
            className="bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
          >
            <div className="text-5xl mb-3">📊</div>
            <h2 className="text-xl font-semibold font-playfair">Dashboard</h2>
            <p className="text-neutral-700 text-sm mt-1">
              Panoramica categorie, top prodotti, andamento mensile.
            </p>
          </Link>

          <Link
            to="/statistiche/prodotti"
            className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
          >
            <div className="text-5xl mb-3">🍽️</div>
            <h2 className="text-xl font-semibold font-playfair">Prodotti</h2>
            <p className="text-neutral-700 text-sm mt-1">
              Dettaglio vendite per prodotto, filtri e ricerca.
            </p>
          </Link>

          <Link
            to="/statistiche/import"
            className="bg-neutral-50 border border-neutral-300 text-neutral-800 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
          >
            <div className="text-5xl mb-3">📥</div>
            <h2 className="text-xl font-semibold font-playfair">Import iPratico</h2>
            <p className="text-neutral-700 text-sm mt-1">
              Carica gli export mensili iPratico (.xls).
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
