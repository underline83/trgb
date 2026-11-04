// Modulo: vini (multi-fornitore) — [core]
// @version: v1.0 — VMF.4 (2026-11-04). Spec: docs/spec_vini_multifornitore.md
// Listini dei fornitori: carichi il PDF, TRGB propone il vino della cantina per
// ogni riga, confermi e diventano i prezzi di listino di quel fornitore
// (riferimento, decisione D5: il costo in carta resta l'ultimo pagato).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import ViniNav from "./ViniNav";
import useToast from "../../hooks/useToast";
import { Btn } from "../../components/ui";

const URL_BASE = `${API_BASE}/vini/multifornitore/listini`;
const euro = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €");
const dataIt = (d) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const CAMPO = "border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300";
const ETICHETTA = "text-xs font-semibold text-neutral-600 uppercase tracking-wide";
const PAGINA = 50;

function Sezione({ titolo, sotto, children, destra }) {
  return (
    <section className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-neutral-50 border-b border-neutral-200">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">{titolo}</h2>
          {sotto && <div className="text-xs text-neutral-500 mt-0.5">{sotto}</div>}
        </div>
        <div className="flex flex-wrap gap-2 items-center">{destra}</div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Pill({ cls, children, title }) {
  return <span title={title} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{children}</span>;
}

function Delta({ v }) {
  if (v == null) return <span className="text-neutral-300">—</span>;
  if (Math.abs(v) < 0.05) return <span className="text-[11px] text-neutral-500">=</span>;
  return <span className={`text-[11px] font-semibold ${v > 0 ? "text-red-600" : "text-emerald-700"}`}>{v > 0 ? "▲" : "▼"} {Math.abs(v).toFixed(1)}%</span>;
}

// Ricerca vino mentre scrivi (come Fatture/Vendite): annate a 0 bt comprese.
function CercaVino({ onScegli, busy }) {
  const [q, setQ] = useState("");
  const [trovati, setTrovati] = useState(null);
  const [scelta, setScelta] = useState("");
  useEffect(() => {
    const t0 = q.trim();
    if (t0.length < 2) { setTrovati(null); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      const res = await apiFetch(`${API_BASE}/vini/multifornitore/fatture/cerca-vini/?q=${encodeURIComponent(t0)}`);
      if (res.ok && vivo) {
        const j = await res.json();
        setTrovati(j);
        setScelta(j[0] ? String(j[0].bottiglia_id) : "");
      }
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [q]);
  return (
    <div className="flex flex-col gap-2 min-w-[280px]">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca il vino (produttore, nome, annata)…" className={CAMPO} />
      {trovati && (
        <div className="flex gap-2">
          <select value={scelta} onChange={e => setScelta(e.target.value)} className={`${CAMPO} flex-1 min-w-0`}>
            {trovati.length === 0 && <option value="">Nessun vino</option>}
            {trovati.map(o => (
              <option key={o.bottiglia_id} value={o.bottiglia_id}>
                {o.produttore ? `${o.produttore} · ` : ""}{o.descrizione} · {o.annata || "s.a."}{o.formato && o.formato !== "BT" ? ` · ${o.formato}` : ""} ({o.qta} bt)
              </option>
            ))}
          </select>
          <Btn variant="primary" size="sm" type="button" disabled={busy || !scelta} onClick={() => onScegli(Number(scelta))}>Abbina</Btn>
        </div>
      )}
    </div>
  );
}

function Carica({ fornitori, onCaricato, busy, setBusy }) {
  const [fid, setFid] = useState("");
  const [data, setData] = useState("");
  const [file, setFile] = useState(null);
  const [errore, setErrore] = useState("");
  const leggi = async () => {
    setBusy(true); setErrore("");
    try {
      const fd = new FormData();
      fd.append("fornitore_id", fid);
      if (data) fd.append("data", data);
      fd.append("file", file);
      const r = await apiFetch(`${URL_BASE}/`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || `Errore ${r.status}`);
      setFile(null); setData("");
      onCaricato(j);
    } catch (e) { setErrore(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1">
          <span className={ETICHETTA}>Fornitore</span>
          <select value={fid} onChange={e => setFid(e.target.value)} className={CAMPO}>
            <option value="">— Di chi è il listino —</option>
            {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={ETICHETTA}>Valido dal</span>
          <input type="date" value={data} onChange={e => setData(e.target.value)} className={CAMPO} title="Vuoto: la data scritta nel PDF, altrimenti oggi" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={ETICHETTA}>PDF</span>
          <input type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="text-sm" />
        </label>
        <Btn variant="primary" size="md" type="button" disabled={busy || !fid || !file} onClick={leggi}>
          {busy ? "Leggo…" : "Leggi il listino"}
        </Btn>
      </div>
      <div className="text-xs text-neutral-500">Data vuota: uso quella scritta nel PDF («Validi al…», «Listino 10/2026»), altrimenti oggi.</div>
      {errore && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errore}</div>}
    </div>
  );
}

function RigaProposta({ r, spuntata, onSpunta, onCambia, onScarta, busy }) {
  const [cambia, setCambia] = useState(false);
  return (
    <tr className="border-t border-neutral-100 hover:bg-neutral-50 transition align-top">
      <td className="px-3 py-2">
        <input type="checkbox" checked={spuntata} onChange={e => onSpunta(r.id, e.target.checked)} className="mt-1 accent-amber-600" />
      </td>
      <td className="px-3 py-2">
        <div className="text-sm text-neutral-900">{r.descrizione}</div>
        <div className="text-xs text-neutral-500">{r.produttore ? `${r.produttore} · ` : ""}pag. {r.pagina}</div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-neutral-900 whitespace-nowrap">{euro(r.prezzo)}</td>
      <td className="px-3 py-2">
        {cambia ? (
          <CercaVino busy={busy} onScegli={(bid) => { setCambia(false); onCambia(r.id, bid); }} />
        ) : (
          <>
            <div className="text-sm text-neutral-900">{r.b_produttore} · {r.b_descrizione}</div>
            <div className="text-xs text-neutral-500 flex flex-wrap gap-1.5 items-center mt-0.5">
              <span>{r.b_annata || "s.a."}{r.b_formato && r.b_formato !== "BT" ? ` · ${r.b_formato}` : ""} · {r.b_qta} bt</span>
              {r.annata_diversa && <Pill cls="bg-amber-50 text-amber-700 border-amber-200" title="Il listino è di un'altra annata">annata diversa</Pill>}
              {r.punteggio == null
                ? <Pill cls="bg-sky-50 text-sky-700 border-sky-200">scelto a mano</Pill>
                : <Pill cls="bg-neutral-50 text-neutral-600 border-neutral-200" title="Quanto la riga somiglia al vino (100 = sicuro o già abbinato in un listino prima)">{r.punteggio}</Pill>}
            </div>
          </>
        )}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {r.listino_prima ? (
          <><div className="font-mono text-xs">{euro(r.listino_prima.prezzo)}</div><div className="text-xs text-neutral-500">listino {dataIt(r.listino_prima.data)}</div></>
        ) : (
          <><div className="font-mono text-xs">{euro(r.b_listino)}</div><div className="text-xs text-neutral-500">costo in scheda</div></>
        )}
      </td>
      <td className="px-3 py-2 text-center"><Delta v={r.delta_pct} /></td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <div className="inline-flex flex-col gap-1.5">
          <Btn variant="ghost" size="sm" type="button" disabled={busy} onClick={() => setCambia(c => !c)}>{cambia ? "Annulla" : "Altro vino"}</Btn>
          <Btn variant="ghost" size="sm" type="button" disabled={busy} onClick={() => onScarta(r.id)}>Non interessa</Btn>
        </div>
      </td>
    </tr>
  );
}

function RigaSenzaVino({ r, onAbbina, onScarta, busy }) {
  return (
    <tr className="border-t border-neutral-100 hover:bg-neutral-50 transition align-top">
      <td className="px-3 py-2">
        <div className="text-sm text-neutral-900">{r.descrizione}</div>
        <div className="text-xs text-neutral-500">{r.produttore ? `${r.produttore} · ` : ""}pag. {r.pagina}</div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-neutral-900 whitespace-nowrap">{euro(r.prezzo)}</td>
      <td className="px-3 py-2"><CercaVino busy={busy} onScegli={(bid) => onAbbina(r.id, bid)} /></td>
      <td className="px-3 py-2 text-right">
        <Btn variant="ghost" size="sm" type="button" disabled={busy} onClick={() => onScarta(r.id)}>Non interessa</Btn>
      </td>
    </tr>
  );
}

const TABS = [
  ["proposta", "Da confermare"],
  ["confermata", "Confermate"],
  ["nessuna", "Senza vino"],
  ["scartata", "Non interessano"],
];

function Dettaglio({ id, onCambiato, toast }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [tab, setTab] = useState("proposta");
  const [soloCantina, setSoloCantina] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [mostra, setMostra] = useState(PAGINA);
  const [spunte, setSpunte] = useState({});

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

  const ricarica = useCallback(async (azzera = false) => {
    const j = await chiama(`${URL_BASE}/${id}/`);
    if (j) {
      setD(j);
      setSpunte(prev => {
        const out = {};
        j.righe.filter(r => r.stato === "proposta").forEach(r => {
          out[r.id] = azzera || prev[r.id] === undefined ? !!r.sicura : prev[r.id];
        });
        return out;
      });
    }
  }, [chiama, id]);

  useEffect(() => { setD(null); setTab("proposta"); setMostra(PAGINA); ricarica(true); }, [id, ricarica]);

  const conta = useMemo(() => {
    const c = {};
    (d?.righe || []).forEach(r => { c[r.stato] = (c[r.stato] || 0) + 1; });
    return c;
  }, [d]);

  const righe = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return (d?.righe || []).filter(r => r.stato === tab
      && (!soloCantina || tab === "nessuna" || tab === "scartata" || (r.b_qta || 0) > 0)
      && (!q || `${r.produttore || ""} ${r.descrizione} ${r.b_produttore || ""} ${r.b_descrizione || ""}`.toLowerCase().includes(q)));
  }, [d, tab, soloCantina, filtro]);

  const spuntate = righe.filter(r => r.stato === "proposta" && spunte[r.id]).map(r => r.id);

  const conferma = async () => {
    const j = await chiama(`${URL_BASE}/${id}/conferma`, { method: "POST", body: JSON.stringify({ righe: spuntate }) });
    if (j) {
      toast(`${j.confermate} prezzi di listino registrati${j.errori?.length ? ` · ${j.errori.length} errori` : ""}`, { kind: j.errori?.length ? "warn" : "success", duration: 3000 });
      ricarica(); onCambiato();
    }
  };
  const abbina = async (rid, bid) => {
    if (await chiama(`${URL_BASE}/righe/${rid}/abbina`, { method: "POST", body: JSON.stringify({ bottiglia_id: bid }) })) {
      setSpunte(s => ({ ...s, [rid]: true }));
      toast("Abbinata: la trovi in «Da confermare»", { kind: "success" });
      ricarica(); onCambiato();
    }
  };
  const scarta = async (rid) => {
    if (await chiama(`${URL_BASE}/righe/${rid}/scarta`, { method: "POST" })) { ricarica(); onCambiato(); }
  };
  const apriPdf = async () => {
    const res = await apiFetch(`${URL_BASE}/${id}/pdf`);
    if (!res.ok) { setErrore("PDF non trovato"); return; }
    window.open(URL.createObjectURL(await res.blob()), "_blank");
  };

  if (!d) return <div className="text-sm text-neutral-500">{errore || "Carico il listino…"}</div>;

  return (
    <Sezione
      titolo={`${d.fornitore} · listino del ${dataIt(d.data)}`}
      sotto={`${d.righe_lette} righe lette da «${d.nome_file}». Spuntate in automatico: punteggio da ${d.soglia_sicuri} in su, stessa annata, prezzo non lontanissimo dal costo.`}
      destra={<Btn variant="secondary" size="sm" type="button" onClick={apriPdf}>📄 Apri il PDF</Btn>}
    >
      {errore && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errore}</div>}
      <div className="flex flex-wrap gap-2 items-center mb-3">
        {TABS.map(([k, l]) => (
          <Btn key={k} variant="chip" tone={tab === k ? "amber" : "neutral"} size="sm" type="button"
            onClick={() => { setTab(k); setMostra(PAGINA); }}>
            {l} ({conta[k] || 0})
          </Btn>
        ))}
        <div className="flex-1" />
        {(tab === "proposta" || tab === "confermata") && (
          <label className="text-xs text-neutral-600 flex items-center gap-1.5">
            <input type="checkbox" checked={soloCantina} onChange={e => setSoloCantina(e.target.checked)} className="accent-amber-600" />
            solo vini con bottiglie in cantina
          </label>
        )}
        <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtra…" className={`${CAMPO} w-40`} />
      </div>

      {tab === "proposta" && righe.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <Btn variant="primary" size="md" type="button" disabled={busy || spuntate.length === 0} onClick={conferma}>
            ✓ Conferma le spuntate ({spuntate.length})
          </Btn>
          <Btn variant="ghost" size="sm" type="button" onClick={() => setSpunte(s => ({ ...s, ...Object.fromEntries(righe.map(r => [r.id, true])) }))}>Spunta tutte</Btn>
          <Btn variant="ghost" size="sm" type="button" onClick={() => setSpunte(s => ({ ...s, ...Object.fromEntries(righe.map(r => [r.id, false])) }))}>Togli tutte</Btn>
          <span className="text-xs text-neutral-500">Il prezzo di listino è un riferimento: il costo in carta resta l'ultimo pagato.</span>
        </div>
      )}

      {righe.length === 0 ? (
        <div className="text-center py-8 text-sm text-neutral-500 bg-neutral-50 rounded-xl border border-neutral-200">Niente qui.</div>
      ) : (
        <div className="border border-neutral-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-neutral-100">
              {tab === "nessuna" || tab === "scartata" ? (
                <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Riga di listino</th>
                  <th className="px-3 py-2 text-right">€/bt</th>
                  <th className="px-3 py-2 text-left">{tab === "nessuna" ? "Vino" : ""}</th>
                  <th className="px-3 py-2" />
                </tr>
              ) : (
                <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                  <th className="px-3 py-2 w-8" />
                  <th className="px-3 py-2 text-left">Riga di listino</th>
                  <th className="px-3 py-2 text-right">€/bt</th>
                  <th className="px-3 py-2 text-left">Vino in cantina</th>
                  <th className="px-3 py-2 text-right">Prima</th>
                  <th className="px-3 py-2 text-center">Δ</th>
                  <th className="px-3 py-2" />
                </tr>
              )}
            </thead>
            <tbody>
              {righe.slice(0, mostra).map(r => {
                if (tab === "proposta") {
                  return <RigaProposta key={r.id} r={r} busy={busy} spuntata={!!spunte[r.id]}
                    onSpunta={(rid, v) => setSpunte(s => ({ ...s, [rid]: v }))} onCambia={abbina} onScarta={scarta} />;
                }
                if (tab === "nessuna") return <RigaSenzaVino key={r.id} r={r} busy={busy} onAbbina={abbina} onScarta={scarta} />;
                if (tab === "scartata") {
                  return (
                    <tr key={r.id} className="border-t border-neutral-100">
                      <td className="px-3 py-2"><div className="text-sm text-neutral-700">{r.descrizione}</div><div className="text-xs text-neutral-500">{r.produttore || ""} · pag. {r.pagina}</div></td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{euro(r.prezzo)}</td>
                      <td className="px-3 py-2" /><td className="px-3 py-2" />
                    </tr>
                  );
                }
                return (
                  <tr key={r.id} className="border-t border-neutral-100">
                    <td className="px-3 py-2 text-emerald-600">✓</td>
                    <td className="px-3 py-2"><div className="text-sm text-neutral-900">{r.descrizione}</div><div className="text-xs text-neutral-500">{r.produttore || ""} · pag. {r.pagina}</div></td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold">{euro(r.prezzo)}</td>
                    <td className="px-3 py-2"><div className="text-sm">{r.b_produttore} · {r.b_descrizione}</div><div className="text-xs text-neutral-500">{r.b_annata || "s.a."} · {r.b_qta} bt</div></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{r.listino_prima ? <><div className="font-mono text-xs">{euro(r.listino_prima.prezzo)}</div><div className="text-xs text-neutral-500">listino {dataIt(r.listino_prima.data)}</div></> : <><div className="font-mono text-xs">{euro(r.b_listino)}</div><div className="text-xs text-neutral-500">costo in scheda</div></>}</td>
                    <td className="px-3 py-2 text-center"><Delta v={r.delta_pct} /></td>
                    <td className="px-3 py-2" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {righe.length > mostra && (
        <div className="mt-3 text-center">
          <Btn variant="secondary" size="sm" type="button" onClick={() => setMostra(m => m + PAGINA)}>Mostra altre {Math.min(PAGINA, righe.length - mostra)} (di {righe.length - mostra})</Btn>
        </div>
      )}
    </Sezione>
  );
}

export default function ListiniVini() {
  const toast = useToast();
  const [listini, setListini] = useState(null);
  const [fornitori, setFornitori] = useState([]);
  const [aperto, setAperto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");

  const ricarica = useCallback(async () => {
    try {
      const r = await apiFetch(`${URL_BASE}/`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || `Errore ${r.status}`);
      setListini(j);
    } catch (e) { setErrore(e.message); }
  }, []);

  useEffect(() => {
    ricarica();
    apiFetch(`${API_BASE}/vini/anagrafiche/fornitori/`).then(r => (r.ok ? r.json() : [])).then(j => {
      const arr = Array.isArray(j) ? j : (j.items || j.fornitori || []);
      setFornitori(arr.filter(f => f.attivo !== 0).sort((a, b) => a.nome.localeCompare(b.nome)));
    }).catch(() => {});
  }, [ricarica]);

  const caricato = (j) => {
    toast(`${j.fornitore}: ${j.righe_lette} righe lette, ${j.proposte} con un vino proposto`, { kind: "success", duration: 3500 });
    setAperto(j.id);
    ricarica();
  };
  const elimina = async (l) => {
    if (!window.confirm(`Elimino il listino ${l.fornitore} del ${dataIt(l.data)}?`)) return;
    const r = await apiFetch(`${URL_BASE}/${l.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.detail || "Non eliminato", { kind: "error" }); return; }
    if (aperto === l.id) setAperto(null);
    ricarica();
  };

  return (
    <div className="min-h-screen bg-brand-cream">
      <ViniNav current="listini" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-amber-900 font-playfair">📋 Listini dei fornitori</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Carica il PDF del listino: TRGB propone per ogni riga il vino della cantina e, quando confermi, il prezzo diventa
            il listino di quel fornitore (lo vedi nella scheda del vino › Prezzi › Fornitori). È un riferimento: il costo in carta resta l'ultimo pagato.
          </p>
        </div>

        {errore && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errore}</div>}

        <Sezione titolo="Carica un listino" sotto="Per ora PDF. Le righe confermate una volta si riconoscono da sole nel listino dopo dello stesso fornitore.">
          <Carica fornitori={fornitori} onCaricato={caricato} busy={busy} setBusy={setBusy} />
        </Sezione>

        <Sezione titolo="Listini caricati">
          {!listini ? <div className="text-sm text-neutral-500">Carico…</div> : listini.length === 0 ? (
            <div className="text-center py-6 text-sm text-neutral-500 bg-neutral-50 rounded-xl border border-neutral-200">Nessun listino ancora.</div>
          ) : (
            <div className="border border-neutral-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-neutral-100">
                  <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                    <th className="px-3 py-2 text-left">Fornitore</th>
                    <th className="px-3 py-2 text-left">Valido dal</th>
                    <th className="px-3 py-2 text-right">Righe</th>
                    <th className="px-3 py-2 text-right">Da confermare</th>
                    <th className="px-3 py-2 text-right">Confermate</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {listini.map(l => (
                    <tr key={l.id} className={`border-t border-neutral-100 transition ${aperto === l.id ? "bg-amber-50" : "hover:bg-neutral-50"}`}>
                      <td className="px-3 py-2"><div className="font-medium text-neutral-900">{l.fornitore}</div><div className="text-xs text-neutral-500">{l.nome_file}</div></td>
                      <td className="px-3 py-2 text-xs text-neutral-700">{dataIt(l.data)}</td>
                      <td className="px-3 py-2 text-right text-xs">{l.righe_lette}</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold">{l.proposte}</td>
                      <td className="px-3 py-2 text-right text-xs">{l.confermate}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex gap-2">
                          <Btn variant={aperto === l.id ? "secondary" : "primary"} size="sm" type="button" onClick={() => setAperto(aperto === l.id ? null : l.id)}>
                            {aperto === l.id ? "Chiudi" : "Apri"}
                          </Btn>
                          {!l.confermate && <Btn variant="ghost" size="sm" type="button" onClick={() => elimina(l)}>Elimina</Btn>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Sezione>

        {aperto && <Dettaglio id={aperto} onCambiato={ricarica} toast={toast} />}
      </div>
    </div>
  );
}
