// @version: v2.4-premium-stable
// Pagina Vendite & Statistiche — placeholder professionale
// UI coerente con Home, Carta e Database

import React from "react";
import { useNavigate } from "react-router-dom";

export default function ViniVendite() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">

        {/* 🔙 BACK BUTTON */}
        <button
          onClick={() => navigate("/vini")}
          className="mb-6 px-5 py-2 rounded-xl border border-neutral-300 bg-neutral-50 text-neutral-800 hover:bg-neutral-200 transition shadow-sm"
        >
          ← Torna al Menu Vini
        </button>

        {/* HEADER */}
        <h1 className="text-4xl font-bold tracking-wide text-center mb-4 text-amber-900 font-playfair">
          📊 Vendite & Statistiche — Vini
        </h1>

        <p className="text-center text-neutral-600 mb-10">
          Analisi vendite, consumi e performance della cantina.
        </p>

        {/* PLACEHOLDER PROFESSIONALE */}
        <div
          className="
            bg-neutral-50 border border-neutral-300 rounded-2xl 
            shadow-inner p-10 text-center
          "
        >
          <div className="text-7xl mb-4 opacity-70">📈</div>

          <h2 className="text-2xl font-semibold text-neutral-800 font-playfair mb-3">
            Modulo in sviluppo
          </h2>

          <p className="text-neutral-600 max-w-xl mx-auto leading-relaxed">
            Questa sezione ospiterà dashboard di analisi vendite, grafici
            di rotazione, statistiche di consumo, marginalità e report avanzati.
          </p>
        </div>

      </div>
    </div>
  );
}