// src/pages/vini/v2/SchedaVinoV2.jsx — placeholder (sessione M2.4)
import React from "react";
import { useParams, useNavigate } from "react-router-dom";

export default function SchedaVinoV2() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <div className="max-w-[1100px] mx-auto p-6">
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-8">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate("/vini/v2/cantina")} className="text-xs text-blue-600 hover:underline">← Cantina v2</button>
          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-neutral-900 text-white">#{id}</span>
        </div>
        <div className="text-center py-6">
          <div className="text-4xl mb-3">📄</div>
          <h2 className="text-lg font-bold text-amber-900 mb-2">Scheda Vino 2 — in arrivo</h2>
          <p className="text-sm text-neutral-600 max-w-md mx-auto">
            Dettaglio bottiglia con tab Anagrafica refactor: campi del vino madre marcati 🔗 con bottone
            "Modifica madre" che apre il modal. Altri tab (Giacenze · Movimenti · Prezzi · Statistiche · Note)
            puntano alla versione del modulo classico finché siamo in test parallelo.
          </p>
          <p className="text-[11px] text-neutral-400 mt-3">Implementazione prevista in sessione M2.4</p>
        </div>
      </div>
    </div>
  );
}
