// @version: v1.1-mattoni — M.I primitives (Btn) su CTA "← Statistiche"
// Sottomenu Statistiche > Cucina — Dashboard, Prodotti, Import iPratico
import React from "react";
import { useNavigate, Link } from "react-router-dom";
import StatisticheNav from "./StatisticheNav";
import { Btn } from "../../components/ui";

export default function CucinaMenu() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <StatisticheNav current="cucina" />
      <div className="max-w-5xl mx-auto p-6">
        <div className="bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
          <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-rose-900 tracking-wide font-playfair mb-1">
                🍽️ Statistiche Cucina
              </h1>
              <p className="text-neutral-600 text-sm">
                Analisi vendite da export iPratico: categorie, prodotti, andamento mensile.
              </p>
            </div>
            <div className="self-start">
              <Btn variant="secondary" size="md" onClick={() => navigate("/statistiche")}>
                ← Statistiche
              </Btn>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Link
              to="/statistiche/cucina/dashboard"
              className="bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
            >
              <div className="text-5xl mb-3">📊</div>
              <h2 className="text-lg font-semibold font-playfair">Dashboard</h2>
              <p className="text-neutral-700 text-xs mt-1">
                Panoramica categorie, top prodotti, trend.
              </p>
            </Link>

            <Link
              to="/statistiche/cucina/prodotti"
              className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
            >
              <div className="text-5xl mb-3">🧾</div>
              <h2 className="text-lg font-semibold font-playfair">Prodotti</h2>
              <p className="text-neutral-700 text-xs mt-1">
                Dettaglio vendite per prodotto, filtri.
              </p>
            </Link>

            <Link
              to="/statistiche/cucina/import"
              className="bg-neutral-50 border border-neutral-300 text-neutral-800 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
            >
              <div className="text-5xl mb-3">📥</div>
              <h2 className="text-lg font-semibold font-playfair">Import iPratico</h2>
              <p className="text-neutral-700 text-xs mt-1">
                Carica le totalizzazioni mensili.
              </p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
