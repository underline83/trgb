// FILE: frontend/src/components/vini/MatriceCelleVendita.jsx
// @version: v1.0 — griglia Matrice per scegliere le bottiglie da scaricare in vendita (2026-11-05)
// Modulo: vini
//
// Estratta da ViniVendite.jsx (vini 3.89) per usarla anche nel riquadro
// «Vendi o apri» della Home sommelier. Dati e toggle arrivano da
// useRegistraVenditaVino.

import React from "react";

export default function MatriceCelleVendita({ matriceStato, myCelleMatrice, selectedCelle, matriceLoading, toggleCella }) {
  return (
  <div className="mt-4">
    {matriceLoading ? (
      <div className="text-sm text-neutral-400 py-4 text-center">Caricamento griglia…</div>
    ) : matriceStato && matriceStato.righe > 0 ? (
      <div className="border border-violet-200 rounded-2xl p-4 bg-violet-50/40">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-violet-700 uppercase tracking-wide">
            Tocca le tue bottiglie per selezionare quelle da scaricare
          </span>
          {selectedCelle.length > 0 && (
            <span className="text-sm font-bold text-violet-600 bg-violet-100 px-3 py-1 rounded-full">
              {selectedCelle.length} {selectedCelle.length === 1 ? "bottiglia" : "bottiglie"}
            </span>
          )}
        </div>
        {/* Legenda */}
        <div className="flex flex-wrap gap-4 mb-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-violet-500 border border-violet-600 inline-block"></span> Selezionata</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-amber-400 border border-amber-500 inline-block"></span> Tua bottiglia</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-neutral-300 border border-neutral-400 inline-block"></span> Altro vino</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-white border border-neutral-200 inline-block"></span> Vuota</span>
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="inline-block">
            {/* Intestazione colonne */}
            <div className="flex">
              <div className="w-8 h-8"></div>
              {Array.from({ length: matriceStato.colonne }, (_, c) => (
                <div key={c} className="w-12 h-8 text-center text-xs font-bold text-neutral-500 flex items-end justify-center">{c + 1}</div>
              ))}
            </div>
            {/* Righe */}
            {Array.from({ length: matriceStato.righe }, (_, r) => {
              const riga = r + 1;
              return (
                <div key={r} className="flex">
                  <div className="w-8 h-12 flex items-center justify-center text-xs font-bold text-neutral-500">{riga}</div>
                  {Array.from({ length: matriceStato.colonne }, (_, c) => {
                    const colonna = c + 1;
                    const cellKey = `${riga},${colonna}`;
                    const isMine = myCelleMatrice.some(mc => mc.riga === riga && mc.colonna === colonna);
                    const isSelected = selectedCelle.some(sc => sc.riga === riga && sc.colonna === colonna);
                    const occupiedCell = (matriceStato.celle || []).find(mc => mc.riga === riga && mc.colonna === colonna);
                    const isOther = occupiedCell && !isMine;

                    let cls = "w-12 h-12 border text-base font-semibold flex items-center justify-center rounded-lg transition-all ";
                    if (isSelected) {
                      cls += "bg-violet-500 border-violet-600 text-white ring-2 ring-violet-300 cursor-pointer scale-105";
                    } else if (isMine) {
                      cls += "bg-amber-400 border-amber-500 text-white cursor-pointer hover:bg-violet-400 hover:border-violet-500 hover:scale-105 active:scale-95";
                    } else if (isOther) {
                      cls += "bg-neutral-200 border-neutral-300 text-neutral-400 cursor-not-allowed";
                    } else {
                      cls += "bg-white border-neutral-100 cursor-not-allowed";
                    }

                    return (
                      <div key={cellKey} className={cls}
                        onClick={() => isMine && toggleCella(riga, colonna)}
                        title={
                          isSelected ? `Selezionata: (${colonna},${riga}) — click per deselezionare` :
                          isMine ? `Tua: (${colonna},${riga}) — click per selezionare` :
                          isOther ? `Occupata da: ${occupiedCell.DESCRIZIONE || "?"}` :
                          "Vuota"
                        }>
                        {isSelected ? "✓" : isMine ? "●" : isOther ? "·" : ""}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    ) : null}
  </div>
  );
}
