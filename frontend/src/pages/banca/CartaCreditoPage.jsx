// src/pages/banca/CartaCreditoPage.jsx
// @version: v0.1 — Scheletro Carta di Credito
// TODO: import estratto conto CSV/PDF, lista movimenti, riconciliazione con CG uscite
import React, { useState } from "react";
import FlussiCassaNav from "./FlussiCassaNav";

export default function CartaCreditoPage() {
  return (
    <div className="min-h-screen bg-neutral-100">
      <FlussiCassaNav current="carta" />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6 md:p-8">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-neutral-800">Carta di Credito</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Importa l'estratto conto della carta, visualizza i movimenti e riconciliali con le spese in Controllo Gestione.
            </p>
          </div>

          {/* Placeholder — funzionalità in arrivo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Import */}
            <div className="border-2 border-dashed border-violet-200 rounded-2xl p-8 text-center bg-violet-50/30">
              <div className="text-4xl mb-3">📄</div>
              <h3 className="font-semibold text-violet-800 mb-1">Import Estratto Conto</h3>
              <p className="text-sm text-neutral-500">
                Carica il CSV o PDF dell'estratto conto della carta di credito.
              </p>
              <p className="text-xs text-violet-500 mt-3 font-medium">Prossimamente</p>
            </div>

            {/* Movimenti */}
            <div className="border-2 border-dashed border-blue-200 rounded-2xl p-8 text-center bg-blue-50/30">
              <div className="text-4xl mb-3">💳</div>
              <h3 className="font-semibold text-blue-800 mb-1">Movimenti Carta</h3>
              <p className="text-sm text-neutral-500">
                Lista movimenti con filtri, categorie e ricerca.
              </p>
              <p className="text-xs text-blue-500 mt-3 font-medium">Prossimamente</p>
            </div>

            {/* Riconciliazione */}
            <div className="border-2 border-dashed border-emerald-200 rounded-2xl p-8 text-center bg-emerald-50/30">
              <div className="text-4xl mb-3">🔗</div>
              <h3 className="font-semibold text-emerald-800 mb-1">Riconciliazione CG</h3>
              <p className="text-sm text-neutral-500">
                Collega i movimenti carta alle spese del Controllo di Gestione.
              </p>
              <p className="text-xs text-emerald-500 mt-3 font-medium">Prossimamente</p>
            </div>

            {/* Riepilogo */}
            <div className="border-2 border-dashed border-amber-200 rounded-2xl p-8 text-center bg-amber-50/30">
              <div className="text-4xl mb-3">📊</div>
              <h3 className="font-semibold text-amber-800 mb-1">Riepilogo Mensile</h3>
              <p className="text-sm text-neutral-500">
                Totale spese carta per mese, categorie, confronto con budget.
              </p>
              <p className="text-xs text-amber-500 mt-3 font-medium">Prossimamente</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
