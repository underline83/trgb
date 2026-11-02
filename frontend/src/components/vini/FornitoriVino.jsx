// Modulo: vini (multi-fornitore) — [core]
// @version: v1.1 — stile allineato al resto della scheda (tabelle, pill, campi, Btn). v1.0 VMF.1 (2026-11-02). Spec: docs/spec_vini_multifornitore.md
// Fornitori di un vino nella scheda (tab Prezzi): chi lo vende, il preferito
// (quello degli ordini), per questa annata l'ultimo pagato e l'ultimo listino
// presso ciascuno, e lo storico. Regola del costo: ULTIMO PAGATO (Marco 02/11).
import React, { useCallback, useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../ui";

const euro = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " €");
const dataIt = (d) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const FONTI = { storico: "storico", carico: "carico", ordine: "ordine", fattura: "fattura", listino: "listino", manuale: "a mano" };
// Pill come «Origine» dello storico prezzi della scheda
const FONTE_CLS = {
  storico: "bg-neutral-50 text-neutral-600 border-neutral-200",
  carico:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  ordine:  "bg-blue-50 text-blue-700 border-blue-200",
  fattura: "bg-violet-50 text-violet-700 border-violet-200",
  listino: "bg-teal-50 text-teal-700 border-teal-200",
  manuale: "bg-amber-50 text-amber-700 border-amber-200",
};
// Stessi campi del form Movimenti
const CAMPO = "border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300";
const ETICHETTA = "text-xs font-semibold text-neutral-600 uppercase tracking-wide";

function Pill({ cls, children }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{children}</span>;
}

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
    <div className="space-y-4">
      {errore && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errore}</div>
      )}

      {annata?.costo_da && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-sm text-neutral-700">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wide mr-2">Costo in uso</span>
          <b className="text-neutral-900">{euro(annata.euro_listino)}</b>
          {" "}= ultimo pagato a <b>{annata.costo_da.fornitore_nome}</b>, {dataIt(annata.costo_da.data)}{" "}
          <Pill cls={FONTE_CLS[annata.costo_da.fonte] || FONTE_CLS.storico}>{FONTI[annata.costo_da.fonte] || annata.costo_da.fonte}</Pill>
          {annata.forza_prezzo ? <span className="text-neutral-500"> · prezzo in carta forzato, non si ricalcola</span> : null}
        </div>
      )}

      <div className="border border-neutral-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-neutral-100">
            <tr className="text-xs text-neutral-600 uppercase tracking-wide">
              <th className="px-3 py-2 text-left">Fornitore</th>
              <th className="px-3 py-2 text-right">Ultimo pagato</th>
              <th className="px-3 py-2 text-right">Listino</th>
              <th className="px-3 py-2 text-left">Ultimo acquisto</th>
              {canEdit && <th className="px-3 py-2 text-right" />}
            </tr>
          </thead>
          <tbody>
            {dati.fornitori.map(f => {
              const p = prezzoDi(f.fornitore_id);
              return (
                <tr key={f.fornitore_id} className="border-t border-neutral-100 hover:bg-neutral-50 transition">
                  <td className="px-3 py-2">
                    <span className={`font-medium ${f.attivo === 0 ? "text-neutral-400" : "text-neutral-900"}`}>{f.nome}</span>
                    {f.preferito && <span className="ml-2"><Pill cls="bg-amber-50 text-amber-700 border-amber-200">⭐ Preferito</Pill></span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-neutral-900"
                    title={p.pagato ? `${dataIt(p.pagato.data)} · ${FONTI[p.pagato.fonte] || p.pagato.fonte}` : undefined}>
                    {p.pagato ? euro(p.pagato.prezzo) : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-neutral-600"
                    title={p.listino ? dataIt(p.listino.data) : undefined}>
                    {p.listino ? euro(p.listino.prezzo) : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                    {f.ultimo_acquisto ? dataIt(f.ultimo_acquisto) : <span className="text-neutral-300">—</span>}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {!f.preferito && (
                        <div className="inline-flex gap-1.5">
                          <Btn variant="chip" tone="amber" size="sm" type="button" disabled={busy}
                            onClick={() => chiama(`${API_BASE}/vini/multifornitore/madre/${madreId}/preferito/`, { method: "POST", body: JSON.stringify({ fornitore_id: f.fornitore_id }) })}>
                            ⭐ Rendi preferito
                          </Btn>
                          <Btn variant="ghost" size="sm" type="button" disabled={busy} title="Togli questo fornitore dal vino"
                            onClick={() => chiama(`${API_BASE}/vini/multifornitore/madre/${madreId}/fornitori/${f.fornitore_id}`, { method: "DELETE" })}>
                            Togli
                          </Btn>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {dati.fornitori.length === 0 && (
              <tr className="border-t border-neutral-100">
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-neutral-500">
                  Nessun fornitore: aggiungilo qui sotto, oppure arriva col primo carico.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={ETICHETTA}>Aggiungi fornitore</span>
            <select value={nuovoForn} onChange={e => setNuovoForn(e.target.value)} className={CAMPO}>
              <option value="">— Scegli —</option>
              {anagrafica.filter(f => !giaCollegati.has(f.id)).map(f => (
                <option key={f.id} value={`id:${f.id}`}>{f.nome}</option>
              ))}
              <option value="__nuovo">➕ Nuovo fornitore…</option>
            </select>
            {nuovoForn === "__nuovo" && (
              <input autoFocus placeholder="Nome (es. Diretto)" value={nomeNuovo} onChange={e => setNomeNuovo(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") aggiungi(); }} className={CAMPO} />
            )}
            <Btn variant="secondary" size="md" type="button" onClick={aggiungi}
              disabled={busy || !nuovoForn || (nuovoForn === "__nuovo" && !nomeNuovo.trim())}>
              Aggiungi
            </Btn>
          </div>

          {dati.fornitori.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-neutral-200">
              <div className={ETICHETTA}>Prezzo a mano per questa annata</div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <select value={form.fornitore_id} onChange={e => setForm({ ...form, fornitore_id: e.target.value })} className={CAMPO}>
                  <option value="">— Fornitore —</option>
                  {dati.fornitori.map(f => <option key={f.fornitore_id} value={f.fornitore_id}>{f.nome}</option>)}
                </select>
                <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className={CAMPO}
                  title="Pagato: diventa il costo se è il più recente. Listino: solo riferimento.">
                  <option value="pagato">Pagato</option>
                  <option value="listino">Listino</option>
                </select>
                <div className="relative">
                  <input type="number" step="0.01" min={0} placeholder="€/bt" value={form.prezzo}
                    onChange={e => setForm({ ...form, prezzo: e.target.value })} className={`${CAMPO} w-full pr-7`} />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400 pointer-events-none">€</span>
                </div>
                <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} className={CAMPO} />
                <input placeholder="Nota (opz.)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className={CAMPO} />
                <Btn variant="primary" size="md" type="button" onClick={salvaPrezzo} disabled={busy} loading={busy}>Salva</Btn>
              </div>
              <div className="text-xs text-neutral-500">
                «Pagato» diventa il costo se è il più recente; «Listino» resta solo come riferimento.
              </div>
            </div>
          )}
        </div>
      )}

      {storicoAnnata.length > 0 && (
        <details className="group">
          <summary className={`${ETICHETTA} cursor-pointer select-none`}>
            Storico per fornitore ({storicoAnnata.length})
          </summary>
          <div className="border border-neutral-200 rounded-xl overflow-x-auto mt-2">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-neutral-100">
                <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Fornitore</th>
                  <th className="px-3 py-2 text-center">Tipo</th>
                  <th className="px-3 py-2 text-center">Origine</th>
                  <th className="px-3 py-2 text-right">Prezzo</th>
                  <th className="px-3 py-2 text-left">Note</th>
                  {canEdit && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {storicoAnnata.map(s => {
                  const scartato = s.stato === "scartato";
                  return (
                    <tr key={s.id} className={`border-t border-neutral-100 hover:bg-neutral-50 transition ${scartato ? "opacity-50" : ""}`}>
                      <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">{dataIt(s.data)}</td>
                      <td className="px-3 py-2 text-xs text-neutral-800">{s.fornitore_nome}</td>
                      <td className="px-3 py-2 text-center">
                        <Pill cls={s.tipo === "pagato" ? "bg-neutral-50 text-neutral-700 border-neutral-200" : "bg-teal-50 text-teal-700 border-teal-200"}>
                          {s.tipo === "pagato" ? "Pagato" : "Listino"}
                        </Pill>
                        {s.stato === "da_verificare" && <span className="ml-1"><Pill cls="bg-red-50 text-red-700 border-red-200">Da verificare</Pill></span>}
                        {scartato && <span className="ml-1"><Pill cls="bg-neutral-100 text-neutral-500 border-neutral-200">Scartato</Pill></span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Pill cls={FONTE_CLS[s.fonte] || FONTE_CLS.storico}>{FONTI[s.fonte] || s.fonte}{s.ordine_id ? ` #${s.ordine_id}` : ""}</Pill>
                      </td>
                      <td className={`px-3 py-2 text-right font-mono text-xs font-semibold ${scartato ? "line-through text-neutral-500" : "text-neutral-900"}`}>{euro(s.prezzo)}</td>
                      <td className="px-3 py-2 text-xs text-neutral-600" style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis" }}>{s.note || ""}</td>
                      {canEdit && (
                        <td className="px-3 py-2 text-right">
                          {!scartato && (
                            <Btn variant="ghost" size="sm" type="button" disabled={busy} onClick={() => scarta(s.id)}>Scarta</Btn>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
