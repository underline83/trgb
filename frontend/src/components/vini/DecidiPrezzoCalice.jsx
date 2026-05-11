// src/components/vini/DecidiPrezzoCalice.jsx
// Modale per decidere il prezzo del calice quando il sommelier apre per
// la prima volta una bottiglia il cui flag anagrafica VENDITA_CALICE non è "SI".
// Sessione 2026-05-11.
//
// Regole prezzo (rispetto al default calcolato come PREZZO_CARTA/5 step 0,50):
//   - prezzo < default            → nota OBBLIGATORIA (motivazione svalutazione)
//   - default ≤ prezzo ≤ +40%     → OK silenzioso
//   - +40% < prezzo ≤ +50%        → nessun obbligo (zona morbida)
//   - prezzo > +50%               → nota OBBLIGATORIA (conferma motivata)
//
// La nota inserita viene salvata nei `note` del movimento VENDITA così è
// auditabile dallo storico vendite del vino.

import React, { useState, useEffect } from "react";

/** Arrotonda a step 0,50 (es. 7,3 → 7,5; 7,1 → 7,0). */
function roundToHalf(v) {
  return Math.round(v * 2) / 2;
}

export default function DecidiPrezzoCalice({
  vino,
  defaultPrezzo,        // numero, già calcolato dal chiamante (PREZZO_CARTA/5 step 0,50)
  onConfirm,            // ({ prezzo: number, nota: string }) => void
  onCancel,             // () => void
}) {
  const [prezzo, setPrezzo] = useState(defaultPrezzo);
  const [nota, setNota] = useState("");

  // Re-set del prezzo se cambia il vino selezionato
  useEffect(() => { setPrezzo(defaultPrezzo); setNota(""); }, [defaultPrezzo, vino?.id]);

  const prezzoNum = Number(prezzo);
  const isValid = Number.isFinite(prezzoNum) && prezzoNum > 0;

  // Soglie
  const soglia40 = defaultPrezzo * 1.4;
  const soglia50 = defaultPrezzo * 1.5;

  // Determina zona
  let zone = "ok"; // ok | basso | tolleranza-alta | alto
  if (isValid) {
    if (prezzoNum < defaultPrezzo) zone = "basso";
    else if (prezzoNum <= soglia40) zone = "ok";
    else if (prezzoNum <= soglia50) zone = "tolleranza-alta";
    else zone = "alto";
  }

  const notaObbligatoria = zone === "basso" || zone === "alto";
  const notaPresente = nota.trim().length >= 3;
  const canConfirm = isValid && (!notaObbligatoria || notaPresente);

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({ prezzo: prezzoNum, nota: nota.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
         onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5"
           onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-neutral-900 mb-1">🥂 Apri per calice</h3>
        <p className="text-xs text-neutral-500 mb-4">
          Questo vino <strong>non</strong> è in carta calici (anagrafica
          <code className="mx-1 px-1 bg-neutral-100 rounded">VENDITA_CALICE ≠ SI</code>).
          Scegli tu il prezzo per questa apertura.
        </p>

        {vino && (
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 mb-3 text-xs">
            <div className="font-semibold text-neutral-800">{vino.DESCRIZIONE}{vino.ANNATA && <span className="font-normal text-neutral-500"> · {vino.ANNATA}</span>}</div>
            <div className="text-neutral-500">{[vino.PRODUTTORE, vino.REGIONE, vino.TIPOLOGIA].filter(Boolean).join(" · ")}</div>
            {vino.PREZZO_CARTA && (
              <div className="text-neutral-400 mt-0.5">Prezzo bottiglia in carta: € {Number(vino.PREZZO_CARTA).toFixed(2)}</div>
            )}
          </div>
        )}

        <label className="block text-xs font-semibold text-neutral-700 mb-1">
          Prezzo calice
        </label>
        <div className="flex items-center gap-2 mb-1">
          <input
            type="number"
            step="0.50"
            min="0"
            value={prezzo}
            onChange={(e) => setPrezzo(e.target.value)}
            className={`w-32 px-3 py-2 rounded-lg text-center text-lg font-semibold tabular-nums
              ${zone === "basso" ? "border-2 border-red-300 bg-red-50" :
                zone === "alto" ? "border-2 border-red-300 bg-red-50" :
                zone === "tolleranza-alta" ? "border-2 border-amber-300 bg-amber-50" :
                "border border-neutral-300"}
              focus:outline-none focus:ring-2 focus:ring-violet-300`}
            autoFocus
          />
          <span className="text-sm text-neutral-500">€</span>
          <span className="ml-auto text-[11px] text-neutral-500">
            Sistema: € {defaultPrezzo.toFixed(2)} <span className="text-neutral-400">(PREZZO_CARTA / 5)</span>
          </span>
        </div>

        {/* Feedback zona */}
        {zone === "basso" && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[11px] text-red-800 mt-2">
            ⚠ <strong>Prezzo più basso del sistema.</strong> Scrivi una motivazione
            (es. vino vecchio da smaltire, qualità calata, ecc.). La nota verrà
            salvata nello storico vendite del vino.
          </div>
        )}
        {zone === "tolleranza-alta" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-800 mt-2">
            ℹ Prezzo superiore al sistema entro la tolleranza (+40% / +50%). OK.
          </div>
        )}
        {zone === "alto" && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[11px] text-red-800 mt-2">
            ⚠ <strong>Prezzo molto superiore al sistema (+50%).</strong> Conferma
            con una nota di motivazione (es. annata particolare, edizione limitata,
            richiesta cliente).
          </div>
        )}

        <label className="block text-xs font-semibold text-neutral-700 mt-3 mb-1">
          Nota motivazione {notaObbligatoria ? <span className="text-red-500">*</span> : <span className="text-neutral-400 font-normal">(opzionale)</span>}
        </label>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          placeholder={notaObbligatoria ? "Obbligatoria — scrivi il motivo (min 3 caratteri)" : "Es. vino in degustazione, edizione speciale, etc."}
          className={`w-full px-3 py-2 rounded-lg text-sm
            ${notaObbligatoria && !notaPresente ? "border-2 border-red-300 bg-red-50" : "border border-neutral-300"}
            focus:outline-none focus:ring-2 focus:ring-violet-300`}
        />

        <div className="flex items-center justify-end gap-2 mt-4">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-700 text-sm hover:bg-neutral-50">
            Annulla
          </button>
          <button type="button" onClick={handleConfirm} disabled={!canConfirm}
            className="px-5 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed">
            Conferma e registra
          </button>
        </div>
      </div>
    </div>
  );
}

// Esporta anche helper per uso esterno (calcolo default)
export { roundToHalf };
