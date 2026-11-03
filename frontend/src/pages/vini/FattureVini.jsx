// Modulo: vini (multi-fornitore) — [core]
// @version: v1.0 — VMF.3 fatture → vini (2026-11-03). Spec: docs/spec_vini_multifornitore.md
// Le righe vino delle fatture elettroniche diventano «prezzi pagati» dei vini.
// Regole di Marco: la fattura decide il fornitore da chi la emette (distributore
// → lui, cantina → Diretto); entro ±soglia% dal carico vince da sola, oltre si
// decide qui. Le righe abbinate una volta si abbinano da sole la volta dopo.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import ViniNav from "./ViniNav";
import useToast from "../../hooks/useToast";
import { Btn } from "../../components/ui";

const euro = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €");
const dataIt = (d) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const CAMPO = "border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300";
const ETICHETTA = "text-xs font-semibold text-neutral-600 uppercase tracking-wide";
const FONTI = { storico: "storico", carico: "carico", ordine: "ordine", manuale: "a mano" };

function Sezione({ titolo, sotto, children, destra }) {
  return (
    <section className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-neutral-50 border-b border-neutral-200">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">{titolo}</h2>
          {sotto && <div className="text-xs text-neutral-500 mt-0.5">{sotto}</div>}
        </div>
        <div className="flex gap-2 items-center">{destra}</div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Pill({ cls, children }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{children}</span>;
}

function Emittente({ e, fornitori, onSalva, busy }) {
  const [tipo, setTipo] = useState("");
  const [fid, setFid] = useState("");
  return (
    <tr className="border-t border-neutral-100">
      <td className="px-3 py-2">
        <div className="font-medium text-neutral-900">{e.nome}</div>
        <div className="text-xs text-neutral-500">P.IVA {e.piva} · {e.righe} righe · es. «{e.esempi?.[0] || ""}»</div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-2 items-center">
          <select value={tipo} onChange={ev => setTipo(ev.target.value)} className={CAMPO}>
            <option value="">— Chi è? —</option>
            <option value="distributore">Distributore (dal suo magazzino)</option>
            <option value="cantina">Cantina → acquisto Diretto</option>
            <option value="non_vini">Non vende vini in cantina</option>
          </select>
          {tipo === "distributore" && (
            <select value={fid} onChange={ev => setFid(ev.target.value)} className={CAMPO}>
              <option value="">— Quale distributore —</option>
              {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          )}
          <Btn variant="primary" size="md" type="button" disabled={busy || !tipo || (tipo === "distributore" && !fid)}
            onClick={() => onSalva({ piva: e.piva, nome: e.nome, tipo, fornitore_id: fid ? Number(fid) : null })}>
            Salva
          </Btn>
        </div>
      </td>
    </tr>
  );
}

function RigaDaAbbinare({ r, onAbbina, onIgnora, busy }) {
  const [scelta, setScelta] = useState(r.suggerimenti?.[0]?.bottiglia_id ? String(r.suggerimenti[0].bottiglia_id) : "");
  const [cerca, setCerca] = useState("");
  const [trovati, setTrovati] = useState(null);
  const opzioni = trovati || r.suggerimenti || [];
  const cercaVini = async () => {
    if (cerca.trim().length < 3) return;
    const res = await apiFetch(`${API_BASE}/vini/multifornitore/fatture/cerca-vini/?q=${encodeURIComponent(cerca.trim())}`);
    if (res.ok) {
      const j = await res.json();
      setTrovati(j);
      setScelta(j[0] ? String(j[0].bottiglia_id) : "");
    }
  };
  return (
    <tr className="border-t border-neutral-100 hover:bg-neutral-50 transition align-top">
      <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">{dataIt(r.data)}</td>
      <td className="px-3 py-2">
        <div className="text-sm text-neutral-900">{r.descrizione}</div>
        <div className="text-xs text-neutral-500 mt-0.5">
          {r.fornitore_fattura} · {r.quantita} {r.pezzi > 1 ? `× ${r.pezzi} bt${r.pezzi_presunti ? " (presunte)" : ""}` : "bt"}
          {r.emittente ? <> · <Pill cls="bg-amber-50 text-amber-700 border-amber-200">{r.emittente.fornitore}</Pill></> : <> · <Pill cls="bg-red-50 text-red-700 border-red-200">emittente da classificare</Pill></>}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-neutral-900 whitespace-nowrap">{euro(r.prezzo)}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-2 min-w-[280px]">
          <select value={scelta} onChange={e => setScelta(e.target.value)} className={CAMPO}>
            <option value="">— Scegli il vino —</option>
            {opzioni.map(o => (
              <option key={o.bottiglia_id} value={o.bottiglia_id}>
                {o.produttore ? `${o.produttore} · ` : ""}{o.descrizione} · {o.annata || "s.a."}{o.formato && o.formato !== "BT" ? ` · ${o.formato}` : ""} ({o.qta} bt){o.punteggio != null && !trovati ? ` — ${o.punteggio}` : ""}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input value={cerca} onChange={e => setCerca(e.target.value)} onKeyDown={e => { if (e.key === "Enter") cercaVini(); }}
              placeholder="Cerca un altro vino…" className={`${CAMPO} flex-1`} />
            <Btn variant="secondary" size="md" type="button" onClick={cercaVini}>Cerca</Btn>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <div className="inline-flex flex-col gap-2">
          <Btn variant="primary" size="md" type="button" disabled={busy || !scelta || !r.emittente} onClick={() => onAbbina(r.fe_riga_id, Number(scelta))}>Abbina</Btn>
          <Btn variant="ghost" size="sm" type="button" disabled={busy} onClick={() => onIgnora(r.fe_riga_id)}>Non è in cantina</Btn>
        </div>
      </td>
    </tr>
  );
}

export default function FattureVini() {
  const { toast } = useToast();
  const [dati, setDati] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [fornitori, setFornitori] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [mostra, setMostra] = useState(50);

  const chiama = useCallback(async (url, opts = {}) => {
    setBusy(true); setErrore("");
    try {
      const r = await apiFetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || `Errore ${r.status}`);
      return j;
    } catch (e) { setErrore(e.message); return null; }
    finally { setBusy(false); }
  }, []);

  const ricarica = useCallback(async () => {
    const j = await chiama(`${API_BASE}/vini/multifornitore/fatture/`);
    if (j) setDati(j);
  }, [chiama]);

  useEffect(() => {
    (async () => {
      const j = await chiama(`${API_BASE}/vini/multifornitore/fatture/aggiorna`, { method: "POST" });
      if (j) setDati(j);
    })();
    apiFetch(`${API_BASE}/vini/anagrafiche/fornitori/`).then(r => (r.ok ? r.json() : [])).then(j => {
      const arr = Array.isArray(j) ? j : (j.items || j.fornitori || []);
      setFornitori(arr.filter(f => f.attivo !== 0 && (f.nome || "").toLowerCase() !== "diretto").sort((a, b) => a.nome.localeCompare(b.nome)));
    }).catch(() => {});
  }, [chiama]);

  const salvaEmittente = async (body) => {
    const j = await chiama(`${API_BASE}/vini/multifornitore/fatture/emittenti/`, { method: "POST", body: JSON.stringify(body) });
    if (j) { setDati(j); toast(`${body.nome}: salvato`, { kind: "success" }); }
  };
  const abbina = async (id, bottiglia_id) => {
    const j = await chiama(`${API_BASE}/vini/multifornitore/fatture/righe/${id}/abbina`, { method: "POST", body: JSON.stringify({ bottiglia_id }) });
    if (j) {
      toast(j.stato === "ok" ? (j.costo?.cambiato ? "Abbinata · costo aggiornato" : "Abbinata") : "Abbinata · da verificare (prezzo diverso dal carico)",
        { kind: j.stato === "ok" ? "success" : "warn", duration: 2600 });
      ricarica();
    }
  };
  const ignora = async (id) => {
    if (await chiama(`${API_BASE}/vini/multifornitore/fatture/righe/${id}/ignora`, { method: "POST" })) ricarica();
  };
  const risolvi = async (id, vale) => {
    if (await chiama(`${API_BASE}/vini/multifornitore/fatture/prezzi/${id}/risolvi`, { method: "POST", body: JSON.stringify({ vale }) })) {
      toast(vale === "fattura" ? "Vale la fattura" : "Vale il carico", { kind: "success" });
      ricarica();
    }
  };
  const confermaSicuri = async () => {
    const j = await chiama(`${API_BASE}/vini/multifornitore/fatture/conferma-sicuri`, { method: "POST" });
    if (j) { toast(`${j.abbinate} righe abbinate, ${j.restano} da guardare`, { kind: "success", duration: 3000 }); ricarica(); }
  };

  const daAbbinare = useMemo(() => {
    const rr = dati?.da_abbinare || [];
    const q = filtro.trim().toLowerCase();
    return q ? rr.filter(r => `${r.descrizione} ${r.fornitore_fattura}`.toLowerCase().includes(q)) : rr;
  }, [dati, filtro]);

  return (
    <div className="min-h-screen bg-brand-cream">
      <ViniNav current="fatture" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-amber-900 font-playfair">🧾 Fatture dei vini</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Le fatture elettroniche dal {dataIt(dati?.dal)} diventano i prezzi pagati dei vini. Chi emette la fattura decide il fornitore
            (una cantina = acquisto diretto); entro ±{dati?.soglia_pct ?? 2}% dal carico vale la fattura, oltre decidi tu qui sotto.
          </p>
        </div>

        {errore && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errore}</div>}
        {!dati && !errore && <div className="text-sm text-neutral-500">Leggo le fatture…</div>}

        {dati && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ["Chi emette da classificare", dati.da_classificare.length],
                ["Da verificare", dati.da_verificare.length],
                ["Da abbinare", dati.conteggi?.da_abbinare || 0],
                ["Abbinate", dati.conteggi?.abbinata || 0],
              ].map(([l, n]) => (
                <div key={l} className="bg-white border border-neutral-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{l}</div>
                  <div className="text-lg font-bold text-neutral-900">{n}</div>
                </div>
              ))}
            </div>

            {dati.da_classificare.length > 0 && (
              <Sezione titolo="Chi emette le fatture" sotto="Una volta per ciascuno: distributore (il vino arriva dal suo magazzino) o cantina (acquisto diretto).">
                <div className="border border-neutral-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <tbody>
                      {dati.da_classificare.map(e => <Emittente key={e.piva} e={e} fornitori={fornitori} onSalva={salvaEmittente} busy={busy} />)}
                    </tbody>
                  </table>
                </div>
              </Sezione>
            )}

            {dati.da_verificare.length > 0 && (
              <Sezione titolo="Da verificare" sotto="La fattura è diversa da quanto registrato al carico (o dal costo che c'era) oltre la soglia, oppure il cartone non dice quante bottiglie.">
                <div className="border border-neutral-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead className="bg-neutral-100">
                      <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                        <th className="px-3 py-2 text-left">Vino</th>
                        <th className="px-3 py-2 text-right">Fattura</th>
                        <th className="px-3 py-2 text-right">Registrato</th>
                        <th className="px-3 py-2 text-center">Δ</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {dati.da_verificare.map(v => {
                        const diff = v.confronto_prezzo ? (v.prezzo - v.confronto_prezzo) / v.confronto_prezzo * 100 : null;
                        return (
                          <tr key={v.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition">
                            <td className="px-3 py-2">
                              <div className="font-medium text-neutral-900">{v.produttore} · {v.descrizione} {v.annata || ""}</div>
                              <div className="text-xs text-neutral-500">{v.note}</div>
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <div className="font-mono text-xs font-semibold">{euro(v.prezzo)}</div>
                              <div className="text-xs text-neutral-500">{v.fornitore_nome} · {dataIt(v.data)}</div>
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {v.confronto_prezzo != null ? (
                                <>
                                  <div className="font-mono text-xs">{euro(v.confronto_prezzo)}</div>
                                  <div className="text-xs text-neutral-500">{v.confronto_fornitore} · {FONTI[v.confronto_fonte] || v.confronto_fonte}</div>
                                </>
                              ) : <span className="text-neutral-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {diff != null ? <span className={`text-[11px] font-semibold ${diff > 0 ? "text-red-600" : "text-emerald-700"}`}>{diff > 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(1)}%</span> : <span className="text-neutral-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <div className="inline-flex gap-2">
                                <Btn variant="primary" size="sm" type="button" disabled={busy} onClick={() => risolvi(v.id, "fattura")}>Vale la fattura</Btn>
                                {v.confronto_prezzo != null && (
                                  <Btn variant="secondary" size="sm" type="button" disabled={busy} onClick={() => risolvi(v.id, "carico")}>Vale il registrato</Btn>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Sezione>
            )}

            <Sezione
              titolo="Da abbinare"
              sotto="Scegli a quale vino corrisponde ogni riga: TRGB se lo ricorda per le fatture dopo."
              destra={
                <>
                  <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtra…" className={`${CAMPO} w-40`} />
                  <Btn variant="chip" tone="amber" size="sm" type="button" disabled={busy} onClick={confermaSicuri}
                    title="Abbina le righe con un suggerimento netto (stessa annata, punteggio alto)">
                    ✓ Abbina i sicuri
                  </Btn>
                </>
              }
            >
              {daAbbinare.length === 0 ? (
                <div className="text-center py-8 text-sm text-neutral-500 bg-neutral-50 rounded-xl border border-neutral-200">Niente da abbinare.</div>
              ) : (
                <div className="border border-neutral-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead className="bg-neutral-100">
                      <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-left">Riga di fattura</th>
                        <th className="px-3 py-2 text-right">€/bt</th>
                        <th className="px-3 py-2 text-left">Vino</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {daAbbinare.slice(0, mostra).map(r => (
                        <RigaDaAbbinare key={r.fe_riga_id} r={r} onAbbina={abbina} onIgnora={ignora} busy={busy} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {daAbbinare.length > mostra && (
                <div className="text-center mt-3">
                  <Btn variant="secondary" size="md" type="button" onClick={() => setMostra(m => m + 50)}>Mostra altre ({daAbbinare.length - mostra})</Btn>
                </div>
              )}
            </Sezione>

            {dati.recenti.length > 0 && (
              <Sezione titolo="Abbinate di recente">
                <div className="border border-neutral-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <tbody>
                      {dati.recenti.map(x => (
                        <tr key={x.fe_riga_id} className="border-t border-neutral-100">
                          <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">{dataIt(x.data)}</td>
                          <td className="px-3 py-2 text-sm">{x.produttore} · {x.descrizione} {x.annata || ""}</td>
                          <td className="px-3 py-2 text-xs text-neutral-600">{x.fornitore_nome}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs font-semibold">{euro(x.prezzo)}</td>
                          <td className="px-3 py-2 text-center">
                            {x.stato === "da_verificare" ? <Pill cls="bg-red-50 text-red-700 border-red-200">Da verificare</Pill>
                              : x.stato === "scartato" ? <Pill cls="bg-neutral-100 text-neutral-500 border-neutral-200">Scartata</Pill>
                              : <Pill cls="bg-emerald-50 text-emerald-700 border-emerald-200">Ok</Pill>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Sezione>
            )}
          </>
        )}
      </div>
    </div>
  );
}
