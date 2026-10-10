// Modulo: vini (sub-modulo carta bevande) — [core]
// @version: v1.1 — campo Accisa € accanto al costo (mig 184): il fornitore la mette
//   su una riga separata, il backend la somma al costo bottiglia.
// v1.0 — calcolo prezzo a dose nel form voce (mig 183, 2026-10-10)
//
// Riquadro sotto il form dinamico: costo bottiglia (IVA esclusa), formato e dose
// → costo a dose, prezzo suggerito, incidenza del prezzo attuale, miscelato
// (es. G&T). Il calcolo lo fa il backend (POST /bevande/calcolo-prezzo/anteprima,
// unica fonte: app/services/bevande_prezzi_service.py), qui solo debounce e resa.
// "Usa" copia il prezzo suggerito nel campo prezzo_eur: niente scritture da sole.

import React, { useEffect, useState } from "react";
import { API_BASE } from "../../../config/api";

const fmt = (n) =>
  n == null ? "—" : `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const toNum = (v) => {
  if (v === "" || v == null) return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
};

export default function CalcoloPrezzoBox({ sezioneKey, parametri, values, onChange, canEdit, authHeader }) {
  const [calcolo, setCalcolo] = useState(null);
  const [errore, setErrore] = useState(null);

  const tipologia = values.tipologia || "";
  const doseDefault = parametri?.dose_per_tipologia?.[tipologia] ?? parametri?.dose_cl;

  useEffect(() => {
    const costo = toNum(values.costo_bottiglia);
    if (!costo || costo <= 0) {
      setCalcolo(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${API_BASE}/bevande/calcolo-prezzo/anteprima`, {
          method: "POST",
          headers: { ...authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({
            sezione_key: sezioneKey,
            tipologia: tipologia || null,
            costo_bottiglia: costo,
            accisa_bottiglia: toNum(values.accisa_bottiglia),
            bottiglia_cl: toNum(values.bottiglia_cl),
            dose_cl: toNum(values.dose_cl),
            prezzo_eur: toNum(values.prezzo_eur),
          }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setCalcolo(data.calcolo);
        setErrore(null);
      } catch (e) {
        setErrore("Calcolo non disponibile");
      }
    }, 300);
    return () => clearTimeout(t);
  }, [sezioneKey, tipologia, values.costo_bottiglia, values.accisa_bottiglia, values.bottiglia_cl, values.dose_cl, values.prezzo_eur, authHeader]);

  const set = (k, v) => onChange({ ...values, [k]: v });
  const inputCls =
    "w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white min-h-[40px] " +
    "focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue disabled:bg-neutral-50";

  const sopra = calcolo?.sopra_obiettivo;

  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <div className="text-sm font-bold text-brand-ink">🧮 Calcolo prezzo</div>
        <div className="text-[11px] text-neutral-500">
          Riservato allo staff · obiettivo {parametri?.incidenza_pct}% di costo sul prezzo
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-1">Costo bottiglia € (IVA esclusa)</label>
          <input type="number" step="any" inputMode="decimal" className={inputCls} disabled={!canEdit}
            value={values.costo_bottiglia ?? ""} onChange={(e) => set("costo_bottiglia", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-1">Accisa € (riga a parte)</label>
          <input type="number" step="any" inputMode="decimal" className={inputCls} disabled={!canEdit}
            placeholder="0"
            value={values.accisa_bottiglia ?? ""} onChange={(e) => set("accisa_bottiglia", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-1">Bottiglia (cl)</label>
          <input type="number" step="any" inputMode="decimal" className={inputCls} disabled={!canEdit}
            placeholder={String(parametri?.bottiglia_cl ?? "")}
            value={values.bottiglia_cl ?? ""} onChange={(e) => set("bottiglia_cl", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-1">Dose (cl)</label>
          <input type="number" step="any" inputMode="decimal" className={inputCls} disabled={!canEdit}
            placeholder={String(doseDefault ?? "")}
            value={values.dose_cl ?? ""} onChange={(e) => set("dose_cl", e.target.value)} />
        </div>
      </div>
      <div className="text-[11px] text-neutral-500 mt-1">
        Costo e accisa come in fattura, IVA esclusa: si sommano da soli. Formato e dose vuoti = valori di default della sezione.
      </div>

      {errore && <div className="mt-3 text-xs text-red-600">{errore}</div>}

      {calcolo && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div className="bg-white rounded-lg border border-neutral-200 px-3 py-2">
            <div className="text-[11px] text-neutral-500">Costo a dose</div>
            <div className="font-mono font-semibold">{fmt(calcolo.costo_dose)}</div>
            <div className="text-[11px] text-neutral-400">{calcolo.dosi} dosi da {calcolo.dose_cl} cl</div>
            {calcolo.accisa > 0 && (
              <div className="text-[11px] text-neutral-400">bottiglia + accisa {fmt(calcolo.costo_bottiglia_totale)}</div>
            )}
          </div>
          <div className="bg-white rounded-lg border border-neutral-200 px-3 py-2">
            <div className="text-[11px] text-neutral-500">Prezzo suggerito</div>
            <div className="font-mono font-semibold text-brand-blue">{fmt(calcolo.prezzo_suggerito)}</div>
            {canEdit && (
              <button type="button" className="text-[11px] font-semibold text-brand-blue underline min-h-[24px]"
                onClick={() => set("prezzo_eur", String(calcolo.prezzo_suggerito))}>
                Usa questo prezzo
              </button>
            )}
          </div>
          <div className={`rounded-lg border px-3 py-2 ${sopra == null ? "bg-white border-neutral-200" : sopra ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
            <div className="text-[11px] text-neutral-500">Incidenza col prezzo attuale</div>
            <div className={`font-mono font-semibold ${sopra ? "text-red-700" : sopra === false ? "text-emerald-700" : ""}`}>
              {calcolo.incidenza_reale != null ? `${calcolo.incidenza_reale.toLocaleString("it-IT")}%` : "—"}
            </div>
            <div className="text-[11px] text-neutral-400">obiettivo {calcolo.incidenza_obiettivo}%</div>
          </div>
          <div className="bg-white rounded-lg border border-neutral-200 px-3 py-2">
            <div className="text-[11px] text-neutral-500">Margine a dose (IVA esclusa)</div>
            <div className="font-mono font-semibold">{fmt(calcolo.margine_dose)}</div>
          </div>
          {calcolo.miscelato && (
            <div className="col-span-2 sm:col-span-4 bg-white rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-700">
              <strong>{calcolo.miscelato.etichetta}</strong> ({calcolo.miscelato.dose_cl} cl + extra): costo {fmt(calcolo.miscelato.costo)} ·
              prezzo suggerito <strong className="text-brand-blue">{fmt(calcolo.miscelato.prezzo_suggerito)}</strong>
              <span className="text-neutral-400"> — da riportare a mano nel «Prezzo in carta (testo)»</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
