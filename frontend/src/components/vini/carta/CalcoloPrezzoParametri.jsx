// Modulo: vini (sub-modulo carta bevande) — [core]
// @version: v1.0 — parametri del calcolo prezzo di una sezione (mig 183, 2026-10-10)
//
// Modale per admin/sommelier: incidenza obiettivo, IVA, arrotondamento, formato e
// dose di default, dose per tipologia, miscelati (es. G&T sul Gin con il costo
// della tonica). Salva su PUT /bevande/sezioni/{key}/calcolo-prezzo; la
// validazione vera è nel backend (bevande_prezzi_service.valida_parametri).

import React, { useState } from "react";
import { API_BASE } from "../../../config/api";
import { Btn } from "../../ui";

const optValue = (o) => (o != null && typeof o === "object" ? String(o.value ?? o.label ?? "") : String(o ?? ""));
const optLabel = (o) => (o != null && typeof o === "object" ? String(o.label ?? o.value ?? "") : String(o ?? ""));

const inputCls =
  "w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white min-h-[40px] " +
  "focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue";

export default function CalcoloPrezzoParametri({ sezione, onClose, onSaved, authHeader, toast }) {
  const tipologie =
    (sezione?.schema_form?.fields || []).find((f) => (f.key || f.name) === "tipologia")?.options || [];
  const init = sezione?.calcolo_prezzo || {};
  const [p, setP] = useState({
    attivo: init.attivo ?? true,
    incidenza_pct: init.incidenza_pct ?? 25,
    iva_pct: init.iva_pct ?? 10,
    arrotondamento: init.arrotondamento ?? 0.5,
    bottiglia_cl: init.bottiglia_cl ?? 70,
    dose_cl: init.dose_cl ?? 4,
    dose_per_tipologia: { ...(init.dose_per_tipologia || {}) },
    miscelati: JSON.parse(JSON.stringify(init.miscelati || {})),
  });
  const [saving, setSaving] = useState(false);
  const [nuovoMix, setNuovoMix] = useState("");

  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const setDose = (tip, v) =>
    setP((x) => {
      const d = { ...x.dose_per_tipologia };
      if (v === "" || v == null) delete d[tip];
      else d[tip] = v;
      return { ...x, dose_per_tipologia: d };
    });
  const setMix = (tip, k, v) =>
    setP((x) => ({ ...x, miscelati: { ...x.miscelati, [tip]: { ...x.miscelati[tip], [k]: v } } }));
  const delMix = (tip) =>
    setP((x) => {
      const m = { ...x.miscelati };
      delete m[tip];
      return { ...x, miscelati: m };
    });

  const salva = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/bevande/sezioni/${sezione.key}/calcolo-prezzo`, {
        method: "PUT",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { msg = (await r.json()).detail || msg; } catch { /* testo non JSON */ }
        throw new Error(msg);
      }
      toast("Parametri salvati", { kind: "success" });
      onSaved?.();
      onClose();
    } catch (e) {
      toast(`Errore: ${e.message}`, { kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  // Funzione, non componente: un componente definito nel render si rimonta a ogni
  // tasto e l'input perde il focus.
  const num = (label, k, help) => (
    <div key={k}>
      <label className="block text-xs font-semibold text-neutral-700 mb-1">{label}</label>
      <input type="number" step="any" inputMode="decimal" className={inputCls}
        value={p[k]} onChange={(e) => set(k, e.target.value)} />
      {help && <div className="text-[11px] text-neutral-500 mt-1">{help}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[95dvh] sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h3 className="text-lg font-bold text-brand-ink">🧮 Parametri calcolo prezzo — {sezione.nome}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 p-1 rounded min-w-[44px] min-h-[44px]">×</button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
          <label className="flex items-center gap-2 text-sm font-semibold text-neutral-800 min-h-[44px]">
            <input type="checkbox" className="w-4 h-4 accent-brand-green" checked={!!p.attivo}
              onChange={(e) => set("attivo", e.target.checked)} />
            Calcolo prezzo attivo in questa sezione
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {num("Incidenza obiettivo %", "incidenza_pct", "Quota del prezzo (IVA esclusa) che va in costo.")}
            {num("IVA % sul prezzo in carta", "iva_pct", "Somministrazione al tavolo: 10%, alcolici compresi.")}
            {num("Arrotondamento €", "arrotondamento", "0,5 = al mezzo euro più vicino.")}
            {num("Bottiglia di default (cl)", "bottiglia_cl")}
            {num("Dose di default (cl)", "dose_cl")}
          </div>

          {tipologie.length > 0 && (
            <div>
              <div className="text-sm font-bold text-brand-ink mb-1">Dose per tipologia (cl)</div>
              <div className="text-[11px] text-neutral-500 mb-2">Vuoto = dose di default.</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {tipologie.map((o) => (
                  <div key={optValue(o)}>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-0.5">{optLabel(o)}</label>
                    <input type="number" step="any" inputMode="decimal" className={inputCls} placeholder={String(p.dose_cl)}
                      value={p.dose_per_tipologia[optValue(o)] ?? ""} onChange={(e) => setDose(optValue(o), e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-sm font-bold text-brand-ink mb-1">Miscelati</div>
            <div className="text-[11px] text-neutral-500 mb-2">
              Un secondo prezzo suggerito per tipologia (es. G&T sul Gin): dose del distillato + costo extra (tonica, guarnizione), IVA esclusa.
            </div>
            {Object.entries(p.miscelati).map(([tip, m]) => (
              <div key={tip} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end mb-2">
                <div className="text-sm font-semibold text-neutral-700 self-center">{tip}</div>
                <div>
                  <label className="block text-[11px] text-neutral-600">Nome</label>
                  <input className={inputCls} value={m.etichetta ?? ""} onChange={(e) => setMix(tip, "etichetta", e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] text-neutral-600">Dose (cl)</label>
                  <input type="number" step="any" className={inputCls} value={m.dose_cl ?? ""} onChange={(e) => setMix(tip, "dose_cl", e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] text-neutral-600">Costo extra €</label>
                  <input type="number" step="any" className={inputCls} value={m.costo_extra ?? ""} onChange={(e) => setMix(tip, "costo_extra", e.target.value)} />
                </div>
                <button type="button" onClick={() => delMix(tip)} className="text-red-600 text-sm min-h-[40px] px-2" title="Togli">🗑</button>
              </div>
            ))}
            {tipologie.length > 0 && (
              <div className="flex gap-2 items-center">
                <select className={inputCls + " max-w-[220px]"} value={nuovoMix} onChange={(e) => setNuovoMix(e.target.value)}>
                  <option value="">— aggiungi per tipologia —</option>
                  {tipologie.filter((o) => !p.miscelati[optValue(o)]).map((o) => (
                    <option key={optValue(o)} value={optValue(o)}>{optLabel(o)}</option>
                  ))}
                </select>
                <Btn variant="secondary" size="sm" disabled={!nuovoMix}
                  onClick={() => { setMix(nuovoMix, "dose_cl", p.dose_cl); setMix(nuovoMix, "costo_extra", 0); setMix(nuovoMix, "etichetta", "miscelato"); setNuovoMix(""); }}>
                  + Aggiungi
                </Btn>
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-neutral-200 flex justify-end gap-2">
          <Btn variant="secondary" size="md" onClick={onClose}>Annulla</Btn>
          <Btn variant="primary" size="md" onClick={salva} loading={saving}>Salva</Btn>
        </div>
      </div>
    </div>
  );
}
