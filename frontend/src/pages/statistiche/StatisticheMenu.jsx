// @version: v2.0-statistiche-menu-sottosezioni
// Menu principale sezione Statistiche — hub con sottosezioni
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
              Analisi dati, vendite e andamenti del ristorante.
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

        {/* ── SOTTOSEZIONI ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

          {/* CUCINA — iPratico */}
          <Link
            to="/statistiche/dashboard"
            className="bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform"
          >
            <div className="text-5xl mb-3 text-center">🍽️</div>
            <h2 className="text-xl font-semibold font-playfair text-center">Cucina</h2>
            <p className="text-neutral-700 text-sm mt-2 text-center">
              Vendite iPratico: categorie, prodotti, trend mensili, import totalizzazioni.
            </p>
            <div className="flex justify-center gap-2 mt-4">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">Dashboard</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">Prodotti</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">Import</span>
            </div>
          </Link>

          {/* COPERTI & INCASSI — da chiusure turno */}
          <Link
            to="/statistiche/coperti"
            className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform"
          >
            <div className="text-5xl mb-3 text-center">👥</div>
            <h2 className="text-xl font-semibold font-playfair text-center">Coperti & Incassi</h2>
            <p className="text-neutral-700 text-sm mt-2 text-center">
              Statistiche giornaliere: incassato, coperti, medie per coperto, pranzo vs cena.
            </p>
            <div className="flex justify-center gap-2 mt-4">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">Giornaliero</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">Medie</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">Pranzo/Cena</span>
            </div>
          </Link>

          {/* CANTINA — placeholder futuro */}
          <div className="bg-neutral-50 border border-dashed border-neutral-300 text-neutral-400 rounded-2xl p-8 shadow-sm flex flex-col items-center justify-center">
            <div className="text-5xl mb-3 opacity-40">🍷</div>
            <h2 className="text-xl font-semibold font-playfair">Cantina</h2>
            <p className="text-sm mt-2 text-center">
              Analisi vendite vini, rotazione etichette, margini.
            </p>
            <span className="mt-3 px-3 py-1 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-400 border border-neutral-200 uppercase tracking-wider">
              Prossimamente
            </span>
          </div>

          {/* PERSONALE — placeholder futuro */}
          <div className="bg-neutral-50 border border-dashed border-neutral-300 text-neutral-400 rounded-2xl p-8 shadow-sm flex flex-col items-center justify-center">
            <div className="text-5xl mb-3 opacity-40">👤</div>
            <h2 className="text-xl font-semibold font-playfair">Personale</h2>
            <p className="text-sm mt-2 text-center">
              Costi del personale, turni, ore lavorate.
            </p>
            <span className="mt-3 px-3 py-1 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-400 border border-neutral-200 uppercase tracking-wider">
              Prossimamente
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
