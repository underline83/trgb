// @version: v1.0-paga-contanti-panel
// Pannello per chiudere una riconciliazione marcando l'uscita come pagata in contanti.
// Usato nel workbench ControlloGestioneRiconciliazione quando il canale selezionato e' "contanti".
//
// POST /controllo-gestione/uscite/{id}/paga-contanti  { data_pagamento?, note? }
// Effetto backend: metodo_pagamento=CONTANTI, stato=PAGATA.
//
// Props:
//   uscitaId      : number (obbligatorio)
//   contextLabel  : string — testo sopra il form (es: "PESCE FRESCO · € 892 · 18/03/2026")
//   importo       : float opzionale — mostrato come riepilogo
//   dataRif       : YYYY-MM-DD opzionale — usato come default data pagamento
//   onPaid        : () => void chiamato dopo successo (per ricaricare worklist)
//   compact       : bool — layout piu' denso per embedding in split-pane

import React, { useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";

const CG = `${API_BASE}/controllo-gestione`;

const fmt = (n) => Number(n || 0).toLocaleString("it-IT", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const today = () => new Date().toISOString().slice(0, 10);

export default function PagaContantiPanel({
  uscitaId,
  contextLabel,
  importo,
  dataRif,
  onPaid,
  compact = false,
}) {
  // Default: data_pagamento dell'uscita se presente, altrimenti oggi
  const [dataPag, setDataPag] = useState(dataRif || today());
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const padX = compact ? "px-3" : "px-4";
  const padY = compact ? "py-3" : "py-4";

  const handleConferma = async () => {
    if (!uscitaId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`${CG}/uscite/${uscitaId}/paga-contanti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_pagamento: dataPag || undefined,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      if (json.ok === false) {
        setError(json.error || "Errore nella registrazione");
        return;
      }
      if (onPaid) onPaid();
    } catch (e) {
      console.error("Errore paga-contanti:", e);
      setError("Errore di rete");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header con context */}
      <div className={`${padX} ${padY} border-b border-neutral-200 bg-emerald-50`}>
        {contextLabel && (
          <div className="text-[11px] text-emerald-900 font-semibold mb-1 truncate" title={contextLabel}>
            {contextLabel}
          </div>
        )}
        <div className="text-[11px] text-emerald-800">
          <span className="mr-1">💵</span>
          Marca come pagata in <b>contanti</b>.
          <span className="block text-[10px] text-emerald-700/80 mt-0.5">
            La prova di pagamento E' il modulo Contanti: l'uscita verra' chiusa
            (stato PAGATA) senza alcun movimento bancario collegato.
          </span>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-[11px] text-red-700">
          {error}
        </div>
      )}

      {/* Form */}
      <div className={`${padX} py-3 space-y-3 flex-1 overflow-y-auto`}>
        {importo != null && (
          <div className="flex items-baseline justify-between bg-neutral-50 border border-neutral-200 rounded px-3 py-2">
            <span className="text-[11px] text-neutral-500">Importo da pagare</span>
            <span className="font-mono font-semibold text-neutral-800 text-sm tabular-nums">
              € {fmt(importo)}
            </span>
          </div>
        )}

        <div>
          <label className="block text-[10px] text-neutral-500 mb-1 font-medium uppercase tracking-wide">
            Data pagamento
          </label>
          <input
            type="date"
            value={dataPag}
            onChange={(e) => setDataPag(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-neutral-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
          />
        </div>

        <div>
          <label className="block text-[10px] text-neutral-500 mb-1 font-medium uppercase tracking-wide">
            Note (opzionale)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Es. pagato al corriere, scontrino #123..."
            className="w-full px-2 py-1.5 text-sm border border-neutral-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
          />
        </div>
      </div>

      {/* Azione */}
      <div className={`${padX} py-3 border-t border-neutral-200 bg-neutral-50`}>
        <button
          onClick={handleConferma}
          disabled={submitting || !dataPag}
          className="w-full px-3 py-2.5 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          {submitting ? "Registrazione..." : "💵 Segna pagata in contanti"}
        </button>
      </div>
    </div>
  );
}
