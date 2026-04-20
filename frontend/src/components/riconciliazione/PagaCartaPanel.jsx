// @version: v1.0-paga-carta-panel
// Pannello per chiudere una riconciliazione marcando l'uscita come pagata con
// carta di credito. Il modulo "Carta di Credito" per il matching con gli
// estratti carta NON e' ancora implementato: questa e' una predisposizione.
//
// POST /controllo-gestione/uscite/{id}/paga-carta  { data_pagamento?, note? }
// Effetto backend: metodo_pagamento=CARTA, stato=PAGATA_MANUALE.
// L'uscita esce dalla worklist banca (filtrata per canale) e sara' visibile
// nella worklist carta quando il modulo sara' attivo.
//
// Props: stesse di PagaContantiPanel.

import React, { useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";

const CG = `${API_BASE}/controllo-gestione`;

const fmt = (n) => Number(n || 0).toLocaleString("it-IT", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const today = () => new Date().toISOString().slice(0, 10);

export default function PagaCartaPanel({
  uscitaId,
  contextLabel,
  importo,
  dataRif,
  onPaid,
  compact = false,
}) {
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
      const res = await apiFetch(`${CG}/uscite/${uscitaId}/paga-carta`, {
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
      console.error("Errore paga-carta:", e);
      setError("Errore di rete");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header con context + avviso modulo in arrivo */}
      <div className={`${padX} ${padY} border-b border-neutral-200 bg-amber-50`}>
        {contextLabel && (
          <div className="text-[11px] text-amber-900 font-semibold mb-1 truncate" title={contextLabel}>
            {contextLabel}
          </div>
        )}
        <div className="text-[11px] text-amber-800">
          <span className="mr-1">💳</span>
          Marca come pagata con <b>carta di credito</b>.
        </div>
        <div className="mt-1.5 text-[10px] text-amber-700/90 bg-amber-100/60 border border-amber-200 rounded px-2 py-1.5">
          <b>⚠️ Modulo Carta di Credito in arrivo.</b><br />
          Per ora l'uscita viene marcata <code className="bg-white px-1 rounded">CARTA</code>
          {" / "}<code className="bg-white px-1 rounded">PAGATA_MANUALE</code>. Quando il
          modulo sara' attivo potrai collegarla ai movimenti dell'estratto carta
          (una worklist dedicata "canale = carta").
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
            Data addebito carta
          </label>
          <input
            type="date"
            value={dataPag}
            onChange={(e) => setDataPag(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-neutral-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
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
            placeholder="Es. carta Amex, ultimo 4 cifre 1234..."
            className="w-full px-2 py-1.5 text-sm border border-neutral-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
          />
        </div>
      </div>

      {/* Azione */}
      <div className={`${padX} py-3 border-t border-neutral-200 bg-neutral-50`}>
        <button
          onClick={handleConferma}
          disabled={submitting || !dataPag}
          className="w-full px-3 py-2.5 rounded-md bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          {submitting ? "Registrazione..." : "💳 Segna pagata con carta"}
        </button>
      </div>
    </div>
  );
}
