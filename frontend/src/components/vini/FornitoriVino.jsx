// Modulo: vini (multi-fornitore) — [core]
// @version: v1.0 — VMF.1 (2026-11-02). Spec: docs/spec_vini_multifornitore.md
// Fornitori di un vino nella scheda (tab Prezzi): chi lo vende, il preferito
// (quello degli ordini), per questa annata l'ultimo pagato e l'ultimo listino
// presso ciascuno, e lo storico. Regola del costo: ULTIMO PAGATO (Marco 02/11).
import React, { useCallback, useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../ui";

const euro = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " €");
const dataIt = (d) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const FONTI = { storico: "storico", carico: "carico", ordine: "ordine", fattura: "fattura", listino: "listino", manuale: "a mano" };

export default function FornitoriVino({ madreId, bottigliaId, canEdit, onCostoCambiato }) {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);
  const [anagrafica, setAnagrafica] = useState([]);
  const [nuovoForn, setNuovoForn] = useState("");
  const [nomeNuovo, setNomeNuovo] = useState("");
  const [form, setForm] = useState({ fornitore_id: "", tipo: "pagato", prezzo: "", data: "", note: "" });

  const carica = useCallback(async () => {
    if (!madreId) return;
    try {
      const r = await apiFetch(`${API_BASE}/vini/multifornitore/madre/${madreId}/`);
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      setDati(await r.json());
      setErrore("");
    } catch (e) { setErrore(e.message); }
  }, [madreId]);

  useEffect(() => { carica(); }, [carica]);

  useEffect(() => {
    if (!canEdit) return;
    apiFetch(`${API_BASE}/vini/anagrafiche/fornitori/`).then(r => (r.ok ? r.json() : [])).then(j => {
      const arr = Array.isArray(j) ? j : (j.items || j.fornitori || []);
      setAnagrafica(arr.filter(f => f.attivo !== 0));
    }).catch(() => {});
  }, [canEdit]);

  const chiama = async (url, opts, dopo) => {
    setBusy(true); setErrore("");
    try {
      const r = await apiFetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || `Errore ${r.status}`);
      if (j && j.fornitori) setDati(j); else await carica();
      if (dopo) dopo(j);
    } catch (e) { setErrore(e.message); }
    finally { setBusy(false); }
  };

  if (!madreId) {
    return <div className="text-sm text-neutral-500">Questo vino non è collegato a un vino «madre»: i fornitori si gestiscono dopo averlo collegato in Anagrafiche.</div>;
  }
  if (!dati) return <div className="text-sm text-neutral-400">{errore || "Carico i fornitori…"}</div>;

  const annata = dati.annate.find(a => a.bottiglia_id === bottigliaId);
  const prezzoDi = (fid) => annata?.prezzi.find(p => p.fornitore_id === fid) || {};
  const giaCollegati = new Set(dati.fornitori.map(f => f.fornitore_id));

  const aggiungi = () => {
    const v = nuovoForn;
    if (!v) return;
    const body = v === "__nuovo" ? { nome: nomeNuovo.trim() } : { fornitore_id: Number(v.slice(3)) };
    if (v === "__nuovo" && !body.nome) return;
    chiama(`${API_BASE}/vini/multifornitore/madre/${madreId}/fornitori/`, { method: "POST", body: JSON.stringify(body) },
      () => { setNuovoForn(""); setNomeNuovo(""); });
  };

  const salvaPrezzo = () => {
    const prezzo = Number(String(form.prezzo).replace(",", "."));
    if (!form.fornitore_id || !(prezzo > 0)) { setErrore("Scegli il fornitore e un prezzo maggiore di zero."); return; }
    chiama(`${API_BASE}/vini/multifornitore/prezzi/`, {
      method: "POST",
      body: JSON.stringify({ bottiglia_id: bottigliaId, fornitore_id: Number(form.fornitore_id), prezzo, tipo: form.tipo, data: form.data || null, note: form.note || null }),
    }, (j) => {
      setForm({ fornitore_id: "", tipo: "pagato", prezzo: "", data: "", note: "" });
      if (j?.costo?.cambiato && onCostoCambiato) onCostoCambiato();
    });
  };

  const scarta = (id) => {
    if (!window.confirm("Scartare questo prezzo? Resta nello storico ma non conta più per il costo.")) return;
    chiama(`${API_BASE}/vini/multifornitore/prezzi/${id}/scarta`, { method: "POST" }, (j) => {
      if (j?.costo?.cambiato && onCostoCambiato) onCostoCambiato();
    });
  };

  const storicoAnnata = dati.storico.filter(s => s.bottiglia_id === bottigliaId);

  return (
    <div className="space-y-3">
      {errore && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errore}</div>}

      {annata?.costo_da && (
        <div className="text-xs text-neutral-600">
          Il costo in uso ({euro(annata.euro_listino)}) è l'ultimo pagato: <b>{annata.costo_da.fornitore_nome}</b>, {dataIt(annata.costo_da.data)} ({FONTI[annata.costo_da.fonte] || annata.costo_da.fonte}).
          {annata.forza_prezzo ? " Prezzo in carta forzato: non si ricalcola." : ""}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500 border-b">
              <th className="py-2 pr-2">Fornitore</th>
              <th className="py-2 pr-2 text-right">Ultimo pagato</th>
              <th className="py-2 pr-2 text-right">Listino</th>
              <th className="py-2 pr-2">Ultimo acquisto</th>
              {canEdit && <th className="py-2" />}
            </tr>
          </thead>
          <tbody>
            {dati.fornitori.map(f => {
              const p = prezzoDi(f.fornitore_id);
              return (
                <tr key={f.fornitore_id} className="border-b border-neutral-100">
                  <td className="py-2 pr-2">
                    {f.preferito ? <span title="Preferito: gli ordini vanno qui">⭐ </span> : null}
                    <span className={f.attivo === 0 ? "text-neutral-400" : ""}>{f.nome}</span>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {p.pagato ? <span title={`${dataIt(p.pagato.data)} · ${FONTI[p.pagato.fonte] || p.pagato.fonte}`}>{euro(p.pagato.prezzo)}</span> : "—"}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-neutral-500">
                    {p.listino ? <span title={dataIt(p.listino.data)}>{euro(p.listino.prezzo)}</span> : "—"}
                  </td>
                  <td className="py-2 pr-2 text-neutral-500">{dataIt(f.ultimo_acquisto)}</td>
                  {canEdit && (
                    <td className="py-2 text-right whitespace-nowrap">
                      {!f.preferito && (
                        <button type="button" disabled={busy} className="text-xs text-brand-blue hover:underline mr-3"
                          onClick={() => chiama(`${API_BASE}/vini/multifornitore/madre/${madreId}/preferito/`, { method: "POST", body: JSON.stringify({ fornitore_id: f.fornitore_id }) })}>
                          ⭐ preferito
                        </button>
                      )}
                      {!f.preferito && (
                        <button type="button" disabled={busy} className="text-xs text-neutral-400 hover:text-red-600"
                          title="Togli questo fornitore dal vino"
                          onClick={() => chiama(`${API_BASE}/vini/multifornitore/madre/${madreId}/fornitori/${f.fornitore_id}`, { method: "DELETE" })}>
                          ✕
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {dati.fornitori.length === 0 && (
              <tr><td colSpan={5} className="py-3 text-neutral-500">Nessun fornitore: aggiungilo qui sotto o arriverà col primo carico.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={nuovoForn} onChange={e => setNuovoForn(e.target.value)}
            className="border border-neutral-300 rounded-lg px-2 py-2 text-sm min-h-[44px]">
            <option value="">➕ Aggiungi un fornitore…</option>
            {anagrafica.filter(f => !giaCollegati.has(f.id)).map(f => (
              <option key={f.id} value={`id:${f.id}`}>{f.nome}</option>
            ))}
            <option value="__nuovo">— nuovo fornitore (scrivi il nome) —</option>
          </select>
          {nuovoForn === "__nuovo" && (
            <input autoFocus placeholder="Nome del fornitore (es. Diretto)" value={nomeNuovo} onChange={e => setNomeNuovo(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") aggiungi(); }}
              className="border border-neutral-300 rounded-lg px-2 py-2 text-sm min-h-[44px]" />
          )}
          <Btn size="md" variant="secondary" type="button" disabled={busy || !nuovoForn || (nuovoForn === "__nuovo" && !nomeNuovo.trim())} onClick={aggiungi}>Aggiungi</Btn>
        </div>
      )}

      {canEdit && dati.fornitori.length > 0 && (
        <div className="border border-neutral-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Prezzo a mano per questa annata</div>
          <div className="flex flex-wrap gap-2 items-center">
            <select value={form.fornitore_id} onChange={e => setForm({ ...form, fornitore_id: e.target.value })}
              className="border border-neutral-300 rounded-lg px-2 py-2 text-sm min-h-[44px]">
              <option value="">Fornitore…</option>
              {dati.fornitori.map(f => <option key={f.fornitore_id} value={f.fornitore_id}>{f.nome}</option>)}
            </select>
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
              className="border border-neutral-300 rounded-lg px-2 py-2 text-sm min-h-[44px]">
              <option value="pagato">pagato (cambia il costo se è il più recente)</option>
              <option value="listino">listino (solo riferimento)</option>
            </select>
            <input inputMode="decimal" placeholder="€/bt" value={form.prezzo} onChange={e => setForm({ ...form, prezzo: e.target.value })}
              className="border border-neutral-300 rounded-lg px-2 py-2 text-sm w-24 min-h-[44px]" />
            <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })}
              className="border border-neutral-300 rounded-lg px-2 py-2 text-sm min-h-[44px]" />
            <input placeholder="nota" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
              className="border border-neutral-300 rounded-lg px-2 py-2 text-sm flex-1 min-w-[120px] min-h-[44px]" />
            <Btn size="md" type="button" disabled={busy} onClick={salvaPrezzo}>Salva</Btn>
          </div>
        </div>
      )}

      {storicoAnnata.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-600">Storico prezzi per fornitore ({storicoAnnata.length})</summary>
          <table className="w-full text-sm mt-2">
            <tbody>
              {storicoAnnata.map(s => (
                <tr key={s.id} className={`border-b border-neutral-100 ${s.stato === "scartato" ? "text-neutral-400 line-through" : ""}`}>
                  <td className="py-1 pr-2">{dataIt(s.data)}</td>
                  <td className="py-1 pr-2">{s.fornitore_nome}</td>
                  <td className="py-1 pr-2">{s.tipo}{s.stato === "da_verificare" ? " · da verificare" : ""}</td>
                  <td className="py-1 pr-2 text-neutral-500">{FONTI[s.fonte] || s.fonte}{s.ordine_id ? ` #${s.ordine_id}` : ""}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{euro(s.prezzo)}</td>
                  <td className="py-1 text-right">
                    {canEdit && s.stato !== "scartato" && (
                      <button type="button" className="text-xs text-neutral-400 hover:text-red-600" disabled={busy} onClick={() => scarta(s.id)}>scarta</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
