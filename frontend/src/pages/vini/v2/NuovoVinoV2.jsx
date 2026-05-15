// src/pages/vini/v2/NuovoVinoV2.jsx — placeholder (sessione M2.6)
import React from "react";

export default function NuovoVinoV2() {
  return (
    <div className="max-w-[1100px] mx-auto p-6">
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-8 text-center">
        <div className="text-4xl mb-3">➕</div>
        <h2 className="text-lg font-bold text-amber-900 mb-2">Nuovo Vino — wizard 3-step (in arrivo)</h2>
        <p className="text-sm text-neutral-600 max-w-md mx-auto">
          Wizard di inserimento in 3 passi: scegli produttore (autocomplete) → scegli vino madre del produttore
          (o creane uno nuovo) → compila i dati dell'annata (prezzo, formato, qta, locazioni).
        </p>
        <p className="text-xs text-rose-700 mt-3">
          Anche quando sarà pronto, sarà in <strong>modalità preview</strong>: il submit resterà disabilitato
          finché siamo in test parallelo. Per inserire davvero un vino, usa la Cantina classica.
        </p>
        <p className="text-[11px] text-neutral-400 mt-3">Implementazione prevista in sessione M2.6</p>
      </div>
    </div>
  );
}
