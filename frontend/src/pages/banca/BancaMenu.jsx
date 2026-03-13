// @version: v1.0-banca-menu
// Menu principale sezione Banca
import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { VersionBadge } from "../../config/versions";

export default function BancaMenu() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-4xl font-bold text-emerald-900 tracking-wide font-playfair">
                Banca
              </h1>
              <VersionBadge modulo="banca" />
            </div>
            <p className="text-neutral-600 mb-2">
              Monitora i movimenti bancari, analizza entrate e uscite, collega ai pagamenti fornitori.
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
            to="/banca/dashboard"
            className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
          >
            <div className="text-5xl mb-3">📊</div>
            <h2 className="text-xl font-semibold font-playfair">Dashboard</h2>
            <p className="text-neutral-700 text-sm mt-1">
              Panoramica saldo, entrate/uscite, andamento.
            </p>
          </Link>

          <Link
            to="/banca/movimenti"
            className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
          >
            <div className="text-5xl mb-3">📋</div>
            <h2 className="text-xl font-semibold font-playfair">Movimenti</h2>
            <p className="text-neutral-700 text-sm mt-1">
              Elenco completo, filtri per data, categoria, tipo.
            </p>
          </Link>

          <Link
            to="/banca/categorie"
            className="bg-purple-50 border border-purple-200 text-purple-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
          >
            <div className="text-5xl mb-3">🏷️</div>
            <h2 className="text-xl font-semibold font-playfair">Categorie</h2>
            <p className="text-neutral-700 text-sm mt-1">
              Mappa le categorie della banca alle tue categorie personalizzate.
            </p>
          </Link>

          <Link
            to="/banca/crossref"
            className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
          >
            <div className="text-5xl mb-3">🔗</div>
            <h2 className="text-xl font-semibold font-playfair">Cross-Ref Fatture</h2>
            <p className="text-neutral-700 text-sm mt-1">
              Collega pagamenti bancari alle fatture XML importate.
            </p>
          </Link>

          <Link
            to="/banca/import"
            className="bg-neutral-50 border border-neutral-300 text-neutral-800 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
          >
            <div className="text-5xl mb-3">📥</div>
            <h2 className="text-xl font-semibold font-playfair">Importa CSV</h2>
            <p className="text-neutral-700 text-sm mt-1">
              Carica l'export Banco BPM per aggiornare i movimenti.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
