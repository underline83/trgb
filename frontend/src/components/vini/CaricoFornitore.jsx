// Modulo: vini (multi-fornitore) — [core]
// @version: v1.1 — stile del form Movimenti. v1.0 VMF.2 (2026-11-02). Spec: docs/spec_vini_multifornitore.md D3
// «Da chi arriva» nel carico della scheda vino. Marco 02/11: se c'è un ordine
// aperto fatto dal modulo Ordini lo propone (e il carico lo chiude); se no,
// tendina coi fornitori del vino, l'ultimo usato in cima, e «aggiungi».
import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../ui";

const euro = (v) => (v == null ? null : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " €");
const dataIt = (d) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");

/**
 * value: null | {tipo:"ordine", ordine_id, riga_id, prezzo, residuo, nome}
 *              | {tipo:"fornitore", fornitore_id, prezzo, nome}
 * onChange(value) — il genitore usa value.prezzo per proporre il €/bt.
 */
export default function CaricoFornitore({ bottigliaId, madreId, canAdd, value, onChange, refreshKey }) {
  const [prop, setProp] = useState(null);
  const [nomeNuovo, setNomeNuovo] = useState("");
  const [aggiungo, setAggiungo] = useState(false);
  const [errore, setErrore] = useState("");

  const carica = async (scegliId) => {
    try {
      const r = await apiFetch(`${API_BASE}/vini/multifornitore/bottiglia/${bottigliaId}/carico/`);
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      const j = await r.json();
      setProp(j);
      // Scelta iniziale: l'ordine aperto più recente, se no l'ultimo fornitore usato.
      if (scegliId) {
        const f = j.fornitori.find(x => x.fornitore_id === scegliId);
        if (f) onChange({ tipo: "fornitore", fornitore_id: f.fornitore_id, prezzo: f.ultimo_pagato ?? f.ultimo_listino, nome: f.nome });
      } else if (j.ordini_aperti.length) {
        const o = j.ordini_aperti[0];
        onChange({ tipo: "ordine", ordine_id: o.ordine_id, riga_id: o.riga_id, prezzo: o.prezzo_unit, residuo: o.qta_ordinata - o.qta_ricevuta, nome: o.fornitore_nome });
      } else if (j.fornitori.length) {
        const f = j.fornitori[0];
        onChange({ tipo: "fornitore", fornitore_id: f.fornitore_id, prezzo: f.ultimo_pagato ?? f.ultimo_listino, nome: f.nome });
      } else {
        onChange(null);
      }
    } catch (e) { setErrore(e.message); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (bottigliaId) carica(); }, [bottigliaId, refreshKey]);

  if (!prop) return errore ? <div className="text-xs text-red-600">{errore}</div> : null;

  const valoreSelect = !value ? "" : value.tipo === "ordine" ? `o:${value.riga_id}` : `f:${value.fornitore_id}`;

  const scegli = (v) => {
    if (v === "__nuovo") { setAggiungo(true); return; }
    setAggiungo(false);
    if (!v) { onChange(null); return; }
    if (v.startsWith("o:")) {
      const o = prop.ordini_aperti.find(x => String(x.riga_id) === v.slice(2));
      onChange({ tipo: "ordine", ordine_id: o.ordine_id, riga_id: o.riga_id, prezzo: o.prezzo_unit, residuo: o.qta_ordinata - o.qta_ricevuta, nome: o.fornitore_nome });
    } else {
      const f = prop.fornitori.find(x => String(x.fornitore_id) === v.slice(2));
      onChange({ tipo: "fornitore", fornitore_id: f.fornitore_id, prezzo: f.ultimo_pagato ?? f.ultimo_listino, nome: f.nome });
    }
  };

  const salvaNuovo = async () => {
    if (!nomeNuovo.trim() || !madreId) return;
    setErrore("");
    try {
      const r = await apiFetch(`${API_BASE}/vini/multifornitore/madre/${madreId}/fornitori/`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: nomeNuovo.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || `Errore ${r.status}`);
      const nuovo = j.fornitori?.find(f => f.nome.toLowerCase() === nomeNuovo.trim().toLowerCase());
      setNomeNuovo(""); setAggiungo(false);
      await carica(nuovo?.fornitore_id);
    } catch (e) { setErrore(e.message); }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Da chi arriva</span>
      <select value={aggiungo ? "__nuovo" : valoreSelect} onChange={e => scegli(e.target.value)}
        className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 max-w-full">
        {prop.ordini_aperti.length > 0 && (
          <optgroup label="Ordini aperti">
            {prop.ordini_aperti.map(o => (
              <option key={`o${o.riga_id}`} value={`o:${o.riga_id}`}>
                📦 Ordine #{o.ordine_id} · {o.fornitore_nome} · {dataIt(o.data_invio)} · {o.qta_ordinata - o.qta_ricevuta} da ricevere{o.prezzo_unit ? ` · ${euro(o.prezzo_unit)}` : ""}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Fornitori del vino">
          {prop.fornitori.map(f => (
            <option key={`f${f.fornitore_id}`} value={`f:${f.fornitore_id}`}>
              {f.preferito ? "⭐ " : ""}{f.nome}{f.ultimo_pagato != null ? ` · ultimo ${euro(f.ultimo_pagato)}` : ""}
            </option>
          ))}
          <option value="">— non so / non indicato —</option>
          {canAdd && madreId && <option value="__nuovo">➕ Aggiungi fornitore…</option>}
        </optgroup>
      </select>
      {aggiungo && (
        <>
          <input autoFocus value={nomeNuovo} onChange={e => setNomeNuovo(e.target.value)} placeholder="Nome (es. Diretto)"
            onKeyDown={e => { if (e.key === "Enter") salvaNuovo(); }}
            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
          <Btn variant="secondary" size="md" type="button" onClick={salvaNuovo} disabled={!nomeNuovo.trim()}>Aggiungi</Btn>
        </>
      )}
      {value?.tipo === "ordine" && (
        <span className="text-xs text-neutral-500">Il carico chiude la riga dell'ordine; vale il prezzo dell'ordine.</span>
      )}
      {errore && <span className="text-xs text-red-600">{errore}</span>}
    </div>
  );
}
