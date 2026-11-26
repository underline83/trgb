// Modulo: clienti
// @version: v1.0 — persone della scheda: i parenti stretti che prenotano con lo stesso numero (2026-11-26)
// Marco: «i parenti stretti nella stessa scheda». Uno storico solo; su ogni prenotazione c'è scritto chi ha chiamato.
import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";

const RELAZIONI = ["", "moglie", "marito", "compagno/a", "figlio/a", "genitore", "segreteria", "altro"];

export default function PersoneScheda({ clienteId, titolare }) {
  const [persone, setPersone] = useState([]);
  const [aperto, setAperto] = useState(false);
  const [nuova, setNuova] = useState({ nome: "", relazione: "" });
  const [errore, setErrore] = useState("");

  useEffect(() => {
    if (!clienteId) return;
    apiFetch(`${API_BASE}/prenotazioni/clienti/${clienteId}/persone`)
      .then((r) => (r.ok ? r.json() : { persone: [] }))
      .then((d) => setPersone(d.persone || []))
      .catch(() => setPersone([]));
  }, [clienteId]);

  const aggiungi = async () => {
    if (!nuova.nome.trim()) return;
    setErrore("");
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/clienti/${clienteId}/persone`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nuova),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErrore(d.detail || `Errore ${r.status}`); return; }
      setPersone(d.persone || []);
      setNuova({ nome: "", relazione: "" });
      setAperto(false);
    } catch { setErrore("Errore di connessione"); }
  };

  const togli = async (p) => {
    if (!window.confirm(`Togliere ${p.nome} dalla scheda? Le sue prenotazioni restano.`)) return;
    const r = await apiFetch(`${API_BASE}/prenotazioni/clienti/${clienteId}/persone/${p.id}`, { method: "DELETE" });
    if (r.ok) { const d = await r.json().catch(() => ({})); setPersone(d.persone || []); }
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-bold text-neutral-700">Persone della scheda</div>
        <button type="button" onClick={() => setAperto((a) => !a)}
          className="min-h-[44px] px-3 rounded-lg border border-dashed border-indigo-400 text-indigo-700 text-sm">
          + Aggiungi persona
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-sm text-indigo-900">
          <strong>{titolare || "Titolare"}</strong> · titolare
        </span>
        {persone.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 text-sm">
            <span><strong>{p.nome}</strong>{p.relazione ? ` · ${p.relazione}` : ""}<span className="ml-1 text-neutral-500">· {p.prenotazioni} pren.</span></span>
            <button type="button" aria-label={`Togli ${p.nome}`} onClick={() => togli(p)} className="text-neutral-400 hover:text-red-500">✕</button>
          </span>
        ))}
      </div>
      {aperto && (
        <div className="flex flex-wrap items-end gap-2">
          <input type="text" placeholder="Nome" value={nuova.nome} onChange={(e) => setNuova({ ...nuova, nome: e.target.value })}
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm min-h-[44px]" />
          <select value={nuova.relazione} onChange={(e) => setNuova({ ...nuova, relazione: e.target.value })}
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm min-h-[44px] bg-white">
            {RELAZIONI.map((o) => <option key={o} value={o}>{o || "— chi è (facoltativo) —"}</option>)}
          </select>
          <button type="button" onClick={aggiungi} className="min-h-[44px] px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium">Aggiungi</button>
        </div>
      )}
      {errore && <div className="text-xs text-red-600">{errore}</div>}
      <div className="text-[11px] text-neutral-400">Chi prenota con lo stesso numero (moglie, figli, segreteria). Uno storico solo: sulla prenotazione c'è scritto chi ha chiamato.</div>
    </div>
  );
}
