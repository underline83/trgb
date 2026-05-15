// src/pages/vini/v2/CantinaV2.jsx
// Modulo: vini (V.6+V.7+V.8 — Modulo Gestione Vino 2)
//
// Pagina principale del modulo v2: lista bottiglie (vista flat di default)
// con possibilità di passare alla vista "Visualizza Madri" (raggruppata).
// Read-only durante il test parallelo: niente checkbox/bulk/modifiche.
//
// Stile fedele a MagazzinoVini.jsx (stessa sidebar filtri, stessa intestazione,
// stessa tabella con badge slate-700 per ID, chip Flag, riepilogo tipologie).

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../../config/api";
import { STATO_VENDITA } from "../../../config/viniConstants";

// ──────────────────────────────────────────────
// HELPERS stile
// ──────────────────────────────────────────────
const fLbl = "block text-[10px] font-semibold text-neutral-500 uppercase mb-0.5";
const fInp = "w-full border border-neutral-300 rounded-md px-2 py-1.5 text-[11px] bg-white";
const fSel = "w-full border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white";

// Mappa colori per tipologia (replica TIPOLOGIA_HEADER di SchedaVino + tipologiaRowColor)
const TIPO_ROW_BG = {
  ROSSI:     "bg-red-50/30",
  BIANCHI:   "bg-amber-50/30",
  BOLLICINE: "bg-yellow-50/30",
  ROSATI:    "bg-pink-50/30",
};
const TIPO_BADGE = {
  ROSSI:     "bg-red-100 text-red-800 border-red-200",
  BIANCHI:   "bg-amber-100 text-amber-800 border-amber-200",
  BOLLICINE: "bg-yellow-100 text-yellow-800 border-yellow-200",
  ROSATI:    "bg-pink-100 text-pink-800 border-pink-200",
};
function tipoRowBg(t) {
  if (!t) return "bg-white";
  const k = String(t).toUpperCase();
  for (const [key, v] of Object.entries(TIPO_ROW_BG)) if (k.includes(key)) return v;
  return "bg-white";
}
function tipoBadge(t) {
  if (!t) return "bg-neutral-100 text-neutral-700 border-neutral-200";
  const k = String(t).toUpperCase();
  for (const [key, v] of Object.entries(TIPO_BADGE)) if (k.includes(key)) return v;
  return "bg-neutral-100 text-neutral-700 border-neutral-200";
}
function fmtEuro(v) {
  if (v == null || v === "") return "—";
  return `€${Number(v).toLocaleString("it-IT", { minimumFractionDigits: 0 })}`;
}

// ──────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────
export default function CantinaV2() {
  const navigate = useNavigate();
  const [vista, setVista] = useState("bottiglie");  // "bottiglie" | "madri"
  const [bottiglie, setBottiglie] = useState([]);
  const [madri, setMadri] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtri (replica della sidebar di MagazzinoVini)
  const [search, setSearch] = useState("");
  const [searchId, setSearchId] = useState("");
  const [tipologia, setTipologia] = useState("");
  const [nazione, setNazione] = useState("");
  const [regione, setRegione] = useState("");
  const [produttore, setProduttore] = useState("");
  const [distributore, setDistributore] = useState("");
  const [statoVendita, setStatoVendita] = useState("");
  const [statoRiordino, setStatoRiordino] = useState("");
  const [carta, setCarta] = useState("");
  const [calice, setCalice] = useState("");
  const [biologico, setBiologico] = useState("");
  const [ipratico, setIpratico] = useState("");
  const [onlyPositive, setOnlyPositive] = useState(false);
  const [onlyMissingListino, setOnlyMissingListino] = useState(false);

  // Fetch dati
  const fetchData = async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (searchId) params.set("id_search", searchId);
      if (tipologia) params.set("tipologia", tipologia);
      if (nazione) params.set("nazione", nazione);
      if (regione) params.set("regione", regione);
      if (produttore) params.set("produttore", produttore);
      if (distributore) params.set("distributore", distributore);
      if (statoVendita !== "") params.set("stato_vendita", statoVendita);
      if (statoRiordino) params.set("stato_riordino", statoRiordino);
      if (carta !== "") params.set("carta", carta);
      if (calice !== "") params.set("calice", calice);
      if (biologico !== "") params.set("biologico", biologico);
      if (ipratico !== "") params.set("ipratico", ipratico);
      if (onlyPositive) params.set("only_positive_stock", "true");
      if (onlyMissingListino) params.set("only_missing_listino", "true");

      if (vista === "bottiglie") {
        const r = await apiFetch(`${API_BASE}/vini/v2/bottiglie/?${params}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setBottiglie(await r.json());
      } else {
        // Vista madri raggruppate (subset di filtri supportati)
        const mp = new URLSearchParams();
        if (search) mp.set("search", search);
        if (tipologia) mp.set("tipologia", tipologia);
        if (onlyPositive) mp.set("only_positive_stock", "true");
        const r = await apiFetch(`${API_BASE}/vini/v2/madri-raggruppate/?${mp}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setMadri(await r.json());
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [vista]);  // eslint-disable-line

  const clearAll = () => {
    setSearch(""); setSearchId(""); setTipologia(""); setNazione(""); setRegione("");
    setProduttore(""); setDistributore(""); setStatoVendita(""); setStatoRiordino("");
    setCarta(""); setCalice(""); setBiologico(""); setIpratico("");
    setOnlyPositive(false); setOnlyMissingListino(false);
    setTimeout(fetchData, 100);
  };

  // Opzioni distinct ricavate dai dati (per popolare i select)
  const opts = useMemo(() => {
    const src = bottiglie;
    const distinct = (key) => [...new Set(src.map(v => v[key]).filter(Boolean))].sort();
    return {
      tipologie: distinct("TIPOLOGIA"),
      nazioni: distinct("NAZIONE"),
      regioni: distinct("REGIONE"),
      produttori: distinct("PRODUTTORE"),
      distributori: distinct("DISTRIBUTORE"),
    };
  }, [bottiglie]);

  // Riepilogo tipologie (per i chip sopra la tabella)
  const riepilogo = useMemo(() => {
    const src = vista === "bottiglie" ? bottiglie : madri.flatMap(m => m.annate || []);
    const map = new Map();
    for (const r of src) {
      const t = r.TIPOLOGIA || r.tipologia || "(senza)";
      if (!map.has(t)) map.set(t, { tip: t, etichette: 0, bottiglie: 0, esaurite: 0 });
      const e = map.get(t);
      e.etichette += 1;
      const qta = r.QTA_TOTALE || 0;
      e.bottiglie += qta;
      if (qta === 0) e.esaurite += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.etichette - a.etichette);
  }, [bottiglie, madri, vista]);

  return (
    <div className="flex" style={{ minHeight: "calc(100vh - 200px)" }}>

      {/* SIDEBAR FILTRI 280px */}
      <aside className="w-sidebar min-w-sidebar border-r border-neutral-200 bg-neutral-50 overflow-y-auto flex-shrink-0">
        <div className="p-2.5 space-y-2">

          {/* Ricerca */}
          <div className="bg-white rounded-lg p-2.5 border border-neutral-200 shadow-sm">
            <div className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest mb-1.5">Ricerca</div>
            <div className="space-y-1.5">
              <div>
                <label className={fLbl}>Ricerca libera</label>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Descrizione, produttore…" className={fInp} />
              </div>
              <div>
                <label className={fLbl}>Ricerca per ID</label>
                <input type="text" value={searchId} onChange={e => setSearchId(e.target.value)}
                  placeholder="es. 1234" className={fInp} />
              </div>
            </div>
          </div>

          {/* Anagrafica */}
          <div className="bg-amber-50/50 rounded-lg p-2.5 border border-amber-100 shadow-sm">
            <div className="text-[9px] font-extrabold text-amber-600 uppercase tracking-widest mb-1.5">Anagrafica</div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className={fLbl}>Tipologia</label>
                <select value={tipologia} onChange={e => setTipologia(e.target.value)} className={fSel}>
                  <option value="">Tutte</option>
                  {opts.tipologie.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={fLbl}>Nazione</label>
                <select value={nazione} onChange={e => setNazione(e.target.value)} className={fSel}>
                  <option value="">Tutte</option>
                  {opts.nazioni.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className={fLbl}>Regione</label>
                <select value={regione} onChange={e => setRegione(e.target.value)} className={fSel}>
                  <option value="">Tutte</option>
                  {opts.regioni.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className={fLbl}>Produttore</label>
                <select value={produttore} onChange={e => setProduttore(e.target.value)} className={fSel}>
                  <option value="">Tutti</option>
                  {opts.produttori.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-1.5 mt-1.5">
              <div>
                <label className={fLbl}>Distributore</label>
                <select value={distributore} onChange={e => setDistributore(e.target.value)} className={fSel}>
                  <option value="">Tutti</option>
                  {opts.distributori.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Stati */}
          <div className="bg-blue-50/40 rounded-lg p-2.5 border border-blue-100 shadow-sm">
            <div className="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest mb-1.5">Stati</div>
            <div className="space-y-1.5">
              <div>
                <label className={fLbl}>Stato vendita</label>
                <select value={statoVendita} onChange={e => setStatoVendita(e.target.value)} className={fSel}>
                  <option value="">Tutti</option>
                  <option value="0">0 — Non vendere</option>
                  <option value="1">1 — Controllare</option>
                  <option value="2">2 — Vendere</option>
                  <option value="3">3 — Spingere</option>
                </select>
              </div>
              <div>
                <label className={fLbl}>Stato riordino</label>
                <select value={statoRiordino} onChange={e => setStatoRiordino(e.target.value)} className={fSel}>
                  <option value="">Tutti</option>
                  <option value="D">D — Da ordinare</option>
                  <option value="0">0 — Ordinato</option>
                  <option value="A">A — Annata esaurita</option>
                  <option value="X">X — Non ricomprare</option>
                </select>
              </div>
            </div>
          </div>

          {/* Flag */}
          <div className="bg-rose-50/40 rounded-lg p-2.5 border border-rose-100 shadow-sm">
            <div className="text-[9px] font-extrabold text-rose-600 uppercase tracking-widest mb-1.5">Flag</div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className={fLbl}>Carta</label>
                <select value={carta} onChange={e => setCarta(e.target.value)} className={fSel}>
                  <option value="">Tutti</option><option value="1">SI</option><option value="0">NO</option>
                </select>
              </div>
              <div>
                <label className={fLbl}>Calice</label>
                <select value={calice} onChange={e => setCalice(e.target.value)} className={fSel}>
                  <option value="">Tutti</option><option value="1">SI</option><option value="0">NO</option>
                </select>
              </div>
              <div>
                <label className={fLbl}>Biologico</label>
                <select value={biologico} onChange={e => setBiologico(e.target.value)} className={fSel}>
                  <option value="">Tutti</option><option value="1">SI</option><option value="0">NO</option>
                </select>
              </div>
              <div>
                <label className={fLbl}>iPratico</label>
                <select value={ipratico} onChange={e => setIpratico(e.target.value)} className={fSel}>
                  <option value="">Tutti</option><option value="1">SI</option><option value="0">NO</option>
                </select>
              </div>
            </div>
          </div>

          {/* Giacenza */}
          <div className="bg-violet-50/40 rounded-lg p-2.5 border border-violet-100 shadow-sm">
            <div className="text-[9px] font-extrabold text-violet-600 uppercase tracking-widest mb-1.5">Giacenza</div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[10px] text-neutral-700 cursor-pointer">
                <input type="checkbox" checked={onlyPositive} onChange={e => setOnlyPositive(e.target.checked)} className="rounded w-3.5 h-3.5" />
                <span>Solo giacenza positiva</span>
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-neutral-700 cursor-pointer">
                <input type="checkbox" checked={onlyMissingListino} onChange={e => setOnlyMissingListino(e.target.checked)} className="rounded w-3.5 h-3.5" />
                <span>Solo senza listino</span>
              </label>
            </div>
          </div>

          {/* Bottoni */}
          <div className="flex gap-2 pt-1">
            <button onClick={clearAll} className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100">
              ✕ Pulisci
            </button>
            <button onClick={fetchData} disabled={loading}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold shadow transition ${
                loading ? "bg-neutral-400 text-white" : "bg-amber-700 text-white hover:bg-amber-800"
              }`}>
              {loading ? "Carico…" : "⟳ Ricarica"}
            </button>
          </div>
        </div>
      </aside>

      {/* CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header + toggle vista */}
        <div className="px-3 py-2 bg-white border-b border-neutral-200 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-amber-900">🍷 Cantina v2</h2>
            <span className="text-[10px] text-neutral-500">Read-only — test parallelo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-neutral-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setVista("bottiglie")}
                className={`px-3 py-1.5 text-xs font-semibold transition ${vista === "bottiglie" ? "bg-amber-700 text-white" : "bg-white text-neutral-700 hover:bg-neutral-100"}`}>
                🍾 Bottiglie
              </button>
              <button
                onClick={() => setVista("madri")}
                className={`px-3 py-1.5 text-xs font-semibold transition ${vista === "madri" ? "bg-amber-700 text-white" : "bg-white text-neutral-700 hover:bg-neutral-100"}`}>
                🍷 Madri
              </button>
            </div>
          </div>
        </div>

        {/* Riepilogo tipologie chip */}
        {!loading && riepilogo.length > 0 && (
          <div className="px-3 py-2 border-b border-neutral-200 bg-white flex flex-wrap gap-1.5 items-center flex-shrink-0">
            <span className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest mr-1">Riepilogo</span>
            {riepilogo.map(r => (
              <button key={r.tip}
                onClick={() => setTipologia(tipologia === r.tip ? "" : r.tip)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold transition cursor-pointer ${tipoBadge(r.tip)} ${tipologia === r.tip ? "ring-2 ring-amber-400 shadow-md" : "hover:shadow-sm"}`}>
                <span>{r.tip}</span><span className="opacity-60">·</span><span>{r.etichette}</span>
                {vista === "bottiglie" && <span className="opacity-40 font-normal">({r.bottiglie}bt)</span>}
                {r.esaurite > 0 && <span className="text-[9px] text-red-600 font-bold ml-0.5">⚠{r.esaurite}</span>}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-neutral-500 flex-shrink-0">
              {vista === "bottiglie" ? `${bottiglie.length} bottiglie` : `${madri.length} madri · ${madri.reduce((s, m) => s + (m.annate?.length || 0), 0)} annate`}
            </span>
          </div>
        )}

        {/* Contenuto: tabella bottiglie o lista madri */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading && <div className="p-6 text-center text-sm text-neutral-500">Carico…</div>}
          {error && !loading && <div className="p-6 text-center text-sm text-red-600">Errore: {error}</div>}

          {/* ── VISTA BOTTIGLIE ── */}
          {!loading && !error && vista === "bottiglie" && (
            <table className="w-full text-[11px]">
              <thead className="bg-neutral-100 sticky top-0 z-10">
                <tr className="text-[9px] text-neutral-600 uppercase tracking-wide select-none">
                  <th className="px-2 py-2 text-left w-12">ID</th>
                  <th className="px-2 py-2 text-left">Vino</th>
                  <th className="px-2 py-2 text-left w-20">Produttore</th>
                  <th className="px-2 py-2 text-left w-16">Origine</th>
                  <th className="px-2 py-2 text-center w-10">Qta</th>
                  <th className="px-2 py-2 text-center w-14">Prezzo</th>
                  <th className="px-2 py-2 text-center w-20">Flag</th>
                </tr>
              </thead>
              <tbody>
                {bottiglie.map(v => {
                  const tip = v.TIPOLOGIA || v.m_tipologia;
                  const denom = v.DENOMINAZIONE || v.d_display;
                  return (
                    <tr key={v.id}
                      className={`cursor-pointer border-b border-neutral-100 hover:bg-amber-50/70 ${tipoRowBg(tip)}`}
                      onClick={() => navigate(`/vini/v2/bottiglia/${v.id}`)}>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className="inline-flex items-center bg-slate-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">#{v.id}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-semibold text-neutral-900 truncate max-w-[260px]">
                          {v.DESCRIZIONE || v.m_descrizione}
                          {v.ANNATA && <span className="text-neutral-500 font-normal"> · {v.ANNATA}</span>}
                          {v.FORMATO && <span className="text-neutral-500 font-normal"> · {v.FORMATO}</span>}
                        </div>
                        {denom && <div className="text-[10px] text-neutral-500 truncate max-w-[260px]">{denom}</div>}
                      </td>
                      <td className="px-2 py-1.5 text-neutral-700 truncate max-w-[100px]">{v.PRODUTTORE || v.p_nome || "—"}</td>
                      <td className="px-2 py-1.5 text-[10px] text-neutral-600 truncate max-w-[90px]">
                        {v.NAZIONE || v.p_nazione}{(v.REGIONE || v.p_regione) ? ` / ${v.REGIONE || v.p_regione}` : ""}
                      </td>
                      <td className="px-2 py-1.5 text-center font-bold text-neutral-900">{v.QTA_TOTALE || 0}</td>
                      <td className="px-2 py-1.5 text-center text-[10px] text-neutral-600">{fmtEuro(v.PREZZO_CARTA)}</td>
                      <td className="px-1 py-1.5 text-center">
                        <div className="flex flex-wrap gap-0.5 justify-center">
                          {v.CARTA === 1 && <span title="In carta" className="inline-block px-1 py-0 rounded text-[8px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">C</span>}
                          {v.IPRATICO === 1 && <span title="iPratico" className="inline-block px-1 py-0 rounded text-[8px] font-bold bg-sky-100 text-sky-700 border border-sky-200">I</span>}
                          {v.BIOLOGICO === 1 && <span title="Biologico" className="inline-block px-1 py-0 rounded text-[8px] font-bold bg-lime-100 text-lime-700 border border-lime-200">B</span>}
                          {v.VENDITA_CALICE === 1 && <span title="Calice" className="inline-block px-1 py-0 rounded text-[8px] font-bold bg-violet-100 text-violet-700 border border-violet-200">K</span>}
                          {v.STATO_VENDITA != null && (() => {
                            const s = STATO_VENDITA[v.STATO_VENDITA];
                            return s ? <span title={s.label} className={`inline-block px-1 py-0 rounded text-[8px] font-bold border ${s.color}`}>{v.STATO_VENDITA}</span> : null;
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {bottiglie.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-neutral-500">Nessun vino con i filtri correnti.</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* ── VISTA MADRI ── compact layout (1-annata inline, N-annate tabella stretta) */}
          {!loading && !error && vista === "madri" && (
            <div className="p-2 space-y-1.5">
              {madri.map(m => {
                const tip = m.tipologia;
                const borderColor =
                  tip?.toUpperCase()?.includes("ROSS") ? "border-l-red-600" :
                  tip?.toUpperCase()?.includes("BIANC") ? "border-l-amber-600" :
                  tip?.toUpperCase()?.includes("BOLLIC") ? "border-l-yellow-600" :
                  tip?.toUpperCase()?.includes("ROSAT") ? "border-l-pink-600" :
                  "border-l-neutral-400";
                const isSingle = (m.annate?.length || 0) === 1;
                const sottotitolo = [m.produttore_nome, m.regione, m.denominazione_display].filter(Boolean).join(" · ");

                // ── 1 ANNATA: tutto inline su una sola riga compatta (~50px) ──
                if (isSingle) {
                  const a = m.annate[0];
                  const loc = [
                    a.FRIGORIFERO && `Frigo: ${a.QTA_FRIGO || 0}`,
                    a.LOCAZIONE_1 && `${a.LOCAZIONE_1}: ${a.QTA_LOC1 || 0}`,
                    a.LOCAZIONE_2 && `${a.LOCAZIONE_2}: ${a.QTA_LOC2 || 0}`,
                  ].filter(Boolean).join(" · ");
                  return (
                    <div key={m.id} onClick={() => navigate(`/vini/v2/bottiglia/${a.id}`)}
                      className={`bg-white rounded-lg border border-neutral-200 shadow-sm hover:bg-amber-50/40 cursor-pointer border-l-4 ${borderColor} flex items-center gap-2 px-3 py-1.5`}>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">M{String(m.id).padStart(4, "0")}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${tipoBadge(tip)} hidden md:inline`}>{tip}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[13px] text-neutral-900 truncate leading-tight">{m.descrizione}</div>
                        {sottotitolo && <div className="text-[10px] text-neutral-500 truncate leading-tight">{sottotitolo}</div>}
                      </div>
                      <div className="flex items-center gap-2.5 text-[11px] flex-shrink-0">
                        <span className="font-semibold text-neutral-700 w-12 text-right">{a.ANNATA || "NV"}</span>
                        <span className="text-neutral-500 w-8 text-center">{a.FORMATO || "BT"}</span>
                        <span className="font-semibold text-neutral-700 w-14 text-right tabular-nums">{fmtEuro(a.PREZZO_CARTA)}</span>
                        <span className="font-bold text-neutral-900 w-12 text-center tabular-nums">{a.QTA_TOTALE || 0}<span className="text-[9px] text-neutral-400 font-normal"> bt</span></span>
                        {a.STATO_VENDITA != null && (() => {
                          const s = STATO_VENDITA[a.STATO_VENDITA];
                          return s ? <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border w-20 text-center ${s.color}`}>{s.label}</span> : <span className="w-20 inline-block" />;
                        })()}
                        {loc && <span className="text-[10px] text-neutral-500 hidden lg:inline w-44 truncate">{loc}</span>}
                      </div>
                    </div>
                  );
                }

                // ── N ANNATE: header compatto (1 riga) + tabella stretta sotto ──
                return (
                  <div key={m.id} className={`bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden border-l-4 ${borderColor}`}>
                    <div className="px-3 py-1.5 flex items-center gap-2 border-b border-neutral-100">
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 flex-shrink-0">M{String(m.id).padStart(4, "0")}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${tipoBadge(tip)} flex-shrink-0 hidden md:inline`}>{tip}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[13px] text-neutral-900 truncate leading-tight">{m.descrizione}</div>
                        {sottotitolo && <div className="text-[10px] text-neutral-500 truncate leading-tight">{sottotitolo}</div>}
                      </div>
                      <span className="text-[10px] text-neutral-500 whitespace-nowrap flex-shrink-0">{m.n_annate} annate · {m.qta_tot} bt</span>
                    </div>
                    <table className="w-full text-[11px]">
                      <tbody>
                        {m.annate.map(a => {
                          const loc = [
                            a.FRIGORIFERO && `Frigo: ${a.QTA_FRIGO || 0}`,
                            a.LOCAZIONE_1 && `${a.LOCAZIONE_1}: ${a.QTA_LOC1 || 0}`,
                            a.LOCAZIONE_2 && `${a.LOCAZIONE_2}: ${a.QTA_LOC2 || 0}`,
                          ].filter(Boolean).join(" · ");
                          return (
                            <tr key={a.id} onClick={() => navigate(`/vini/v2/bottiglia/${a.id}`)}
                              className="cursor-pointer border-t border-neutral-100 hover:bg-amber-50/70">
                              <td className="pl-3 pr-2 py-1 font-semibold w-16 text-right">{a.ANNATA || "NV"}</td>
                              <td className="px-2 py-1 text-neutral-600 w-10 text-center">{a.FORMATO || "BT"}</td>
                              <td className="px-2 py-1 text-right font-semibold w-16 tabular-nums">{fmtEuro(a.PREZZO_CARTA)}</td>
                              <td className="px-2 py-1 text-center font-bold w-12 tabular-nums">{a.QTA_TOTALE || 0}</td>
                              <td className="px-2 py-1 w-24">
                                {a.STATO_VENDITA != null && (() => {
                                  const s = STATO_VENDITA[a.STATO_VENDITA];
                                  return s ? <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${s.color}`}>{s.label}</span> : null;
                                })()}
                              </td>
                              <td className="px-2 py-1 text-[10px] text-neutral-500 truncate">{loc}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {madri.length === 0 && (
                <div className="p-8 text-center text-sm text-neutral-500">Nessun vino madre con i filtri correnti.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
