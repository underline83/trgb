// src/pages/vini/v2/CantinaV2.jsx
// Modulo: vini (V.6+V.7+V.8 — Modulo Gestione Vino 2)
//
// Cantina v2 read-only. Usa i mattoni condivisi:
//   - useCantinaFilters (hook): state filtri + applyFilters(items)
//   - <CantinaFiltri />: sidebar JSX identica a MagazzinoVini
//   - <RiepilogoTipologie /> + applyRiepilogoFilter: chip in cima
//
// Differenza dal classico: legge da `/vini/v2/*` (tabelle `_v2`), niente
// scritture/checkbox/bulk. Tutto il resto del comportamento filtri è IDENTICO.

import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../../config/api";
import {
  STATO_VENDITA,
  STATO_VENDITA_OPTIONS,
  STATO_RIORDINO_OPTIONS,
  STATO_CONSERVAZIONE_OPTIONS,
} from "../../../config/viniConstants";
import useCantinaFilters from "../../../hooks/useCantinaFilters";
import useBulkSelection from "../../../hooks/useBulkSelection";
import useSortableTable from "../../../hooks/useSortableTable";
import CantinaFiltri from "../../../components/vini/CantinaFiltri";
import RiepilogoTipologie, { applyRiepilogoFilter } from "../../../components/vini/RiepilogoTipologie";
import BulkActionBar from "../../../components/vini/BulkActionBar";
import groupByMadre from "../../../utils/vini/groupByMadre";
import SchedaVino from "../SchedaVino";
import SchedaMadreV2 from "../../../components/vini/SchedaMadreV2";

// ──────────────────────────────────────────────
// Helpers stile (replica MagazzinoVini)
// ──────────────────────────────────────────────
// Opacità identica a MagazzinoVini (TIPOLOGIA_COLORS riga 414-422)
const TIPO_ROW_BG = {
  ROSSI:     "bg-red-50/70",
  BIANCHI:   "bg-amber-50/50",
  BOLLICINE: "bg-yellow-50/60",
  ROSATI:    "bg-pink-50/60",
  "PASSITI E VINI DA MEDITAZIONE": "bg-orange-50/50",
  "GRANDI FORMATI": "bg-purple-50/50",
  "VINI ANALCOLICI": "bg-teal-50/50",
};
const TIPO_BORDER_L = {
  ROSSI:     "border-l-red-600",
  BIANCHI:   "border-l-amber-600",
  BOLLICINE: "border-l-yellow-600",
  ROSATI:    "border-l-pink-600",
};
const TIPO_BADGE = {
  ROSSI:     "bg-red-100 text-red-800 border-red-200",
  BIANCHI:   "bg-amber-100 text-amber-800 border-amber-200",
  BOLLICINE: "bg-yellow-100 text-yellow-800 border-yellow-200",
  ROSATI:    "bg-pink-100 text-pink-800 border-pink-200",
};
function pickByTipo(t, map, fallback = "") {
  if (!t) return fallback;
  const k = String(t).toUpperCase();
  for (const [key, v] of Object.entries(map)) if (k.includes(key)) return v;
  return fallback;
}
// Mini Field component per la scheda madre read-only
function Field({ label, value }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-sm text-neutral-900">{value || <span className="text-neutral-400">—</span>}</div>
    </div>
  );
}

function fmtEuro(v) {
  if (v == null || v === "") return "—";
  return `€${Number(v).toLocaleString("it-IT", { minimumFractionDigits: 0 })}`;
}

export default function CantinaV2() {
  const navigate = useNavigate();
  // M2.7-bis: la vista (bottiglie/madri) è ora pilotata dall'URL search param
  // `?vista=`, gestito dal toggle nell'header globale di GestioneVino2. Qui la
  // leggiamo soltanto; non c'è più state interno o toggle nella pagina.
  const [searchParams] = useSearchParams();
  const vista = searchParams.get("vista") === "madri" ? "madri" : "bottiglie";
  const [bottiglie, setBottiglie] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [printingPdf, setPrintingPdf] = useState(false);
  // Scheda inline aperta (id bottiglia) — null = lista
  const [openSchedaId, setOpenSchedaId] = useState(null);
  // Scheda Madre inline aperta (id madre) — null = lista
  const [openMadreId, setOpenMadreId] = useState(null);
  const schedaRef = useRef(null);
  // Selezione multipla (riusa hook)
  const sel = useBulkSelection();
  // Sort tabella (riusa hook)
  const sort = useSortableTable();
  const [locConfig, setLocConfig] = useState({ frigorifero: [], locazione_1: [], locazione_2: [], locazione_3: [] });
  const [riepilogoFilter, setRiepilogoFilter] = useState(null);

  // ── Hook condiviso filtri ──
  const f = useCantinaFilters({ locConfig });

  // ── Fetch dati v2 (un solo fetch — la vista Madri raggruppa client-side) ──
  const fetchData = async () => {
    setLoading(true); setError("");
    try {
      const r = await apiFetch(`${API_BASE}/vini/v2/bottiglie/?limit=10000`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setBottiglie(await r.json());
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line

  // ── Carica locConfig (stessa fonte di MagazzinoVini) ──
  useEffect(() => {
    apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setLocConfig({
            frigorifero: data.frigorifero || [],
            locazione_1: data.locazione_1 || [],
            locazione_2: data.locazione_2 || [],
            locazione_3: data.locazione_3 || [],
          });
        }
      })
      .catch(() => {});
  }, []);

  // ── opts per i select anagrafica (distinct dai dati come MagazzinoVini) ──
  const opts = useMemo(() => {
    const distinct = (key) => [...new Set(bottiglie.map(v => v[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "it"));
    return {
      tipologie: distinct("TIPOLOGIA"),
      nazioni: distinct("NAZIONE"),
      regioni: distinct("REGIONE"),
      produttori: distinct("PRODUTTORE"),
      distributori: distinct("DISTRIBUTORE"),
      rappresentanti: distinct("RAPPRESENTANTE"),
    };
  }, [bottiglie]);

  // ── Pipeline filtri unica (vale per Bottiglie e Madri) ──
  // 1) applyFilters dei filtri sidebar → bottiglieFiltrate
  // 2) applyRiepilogoFilter dei chip in cima → bottiglieVisibili
  // 3) groupByMadre delle visibili → madriVisibili (solo per vista madri)
  const bottiglieFiltrate = useMemo(() => f.applyFilters(bottiglie), [f, bottiglie]);
  const bottiglieVisibili = useMemo(() => {
    const filtered = applyRiepilogoFilter(bottiglieFiltrate, riepilogoFilter);
    // Sort secondo header cliccato (replica MagazzinoVini)
    return sort.sortRows(filtered, {
      id:          v => v.id ?? 0,
      descrizione: v => (v.DESCRIZIONE || "").toLowerCase(),
      produttore:  v => (v.PRODUTTORE || "").toLowerCase(),
      origine:     v => ((v.NAZIONE || "") + (v.REGIONE || "")).toLowerCase(),
      qta:         v => (v.QTA_TOTALE ?? ((v.QTA_FRIGO ?? 0) + (v.QTA_LOC1 ?? 0) + (v.QTA_LOC2 ?? 0) + (v.QTA_LOC3 ?? 0))) || 0,
      prezzo:      v => parseFloat(v.PREZZO_CARTA) || 0,
    });
  }, [bottiglieFiltrate, riepilogoFilter, sort]);
  const madriVisibili = useMemo(() => groupByMadre(bottiglieVisibili), [bottiglieVisibili]);

  // ── Apertura scheda inline (sostituisce la lista nel frame centrale) ──
  const handleRowClick = (id) => {
    setOpenMadreId(null);
    setOpenSchedaId(id);
    setTimeout(() => schedaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };
  const handleMadreClick = (id) => {
    setOpenSchedaId(null);
    setOpenMadreId(id);
    setTimeout(() => schedaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };
  const closeAll = () => { setOpenSchedaId(null); setOpenMadreId(null); };

  // Madre attualmente aperta (dati già in memoria via groupByMadre)
  const openMadre = useMemo(
    () => (openMadreId ? madriVisibili.find(m => m.id === openMadreId) : null),
    [openMadreId, madriVisibili]
  );

  // ── Stampa selezione PDF (riusa lo stesso endpoint di Cantina classica) ──
  const handlePrintSelection = async () => {
    if (sel.count === 0) return;
    setPrintingPdf(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/cantina-tools/inventario/selezione/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: sel.ids }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "Errore generazione PDF");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e) {
      alert(e.message || "Errore durante la stampa");
    } finally {
      setPrintingPdf(false);
    }
  };

  return (
    <div className="flex" style={{ minHeight: "calc(100vh - 200px)" }}>

      {/* SIDEBAR FILTRI (condivisa) */}
      <aside className="w-sidebar min-w-sidebar border-r border-neutral-200 bg-neutral-50 overflow-y-auto flex-shrink-0">
        <CantinaFiltri
          f={f}
          opts={opts}
          statoVenditaOptions={STATO_VENDITA_OPTIONS}
          statoRiordinoOptions={STATO_RIORDINO_OPTIONS}
          statoConservazioneOptions={STATO_CONSERVAZIONE_OPTIONS}
          loading={loading}
          onReload={fetchData}
          error={error}
        />
      </aside>

      {/* CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Toggle Bottiglie/Madri è ora nell'header globale di GestioneVino2 (M2.7-bis). */}

        {/* Riepilogo tipologie chip — sempre sulle bottigliefiltrate (=stessa pipeline) */}
        <RiepilogoTipologie
          items={bottiglieFiltrate}
          riepilogoFilter={riepilogoFilter}
          setRiepilogoFilter={setRiepilogoFilter}
          rightSummary={vista === "bottiglie"
            ? `${bottiglieVisibili.length} di ${bottiglie.length} bottiglie`
            : `${madriVisibili.length} madri · ${bottiglieVisibili.length} annate`}
        />

        {/* Contenuto */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading && <div className="p-6 text-center text-sm text-neutral-500">Carico…</div>}
          {error && !loading && <div className="p-6 text-center text-sm text-red-600">Errore: {error}</div>}

          {/* ── SCHEDA MADRE V2 (sostituisce la lista quando openMadreId è settato) ── */}
          {openMadre && (
            <div className="flex-1 overflow-auto min-h-0">
              {/* Barra navigazione (replica MagazzinoVini per coerenza) */}
              <div className="px-3 py-2 bg-rose-50 border-b border-rose-200 flex items-center gap-2 flex-shrink-0">
                <button onClick={closeAll}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-neutral-300 hover:bg-neutral-50 transition shadow-sm">
                  ← Lista
                </button>
                <span className="text-xs font-bold text-rose-900">🍷 Scheda Vino Madre</span>
              </div>
              <div ref={schedaRef} className="p-3">
                <SchedaMadreV2
                  madre={openMadre}
                  onClose={closeAll}
                  onOpenAnnata={handleRowClick}
                />
              </div>
            </div>
          )}

          {/* ── SCHEDA BOTTIGLIA INLINE (sostituisce la lista quando openSchedaId è settato) ── */}
          {openSchedaId && !openMadre && (() => {
            // Calcola prev/next nella lista visibile per la barra di navigazione
            const curIdx = bottiglieVisibili.findIndex(v => v.id === openSchedaId);
            const prevVino = curIdx > 0 ? bottiglieVisibili[curIdx - 1] : null;
            const nextVino = curIdx >= 0 && curIdx < bottiglieVisibili.length - 1 ? bottiglieVisibili[curIdx + 1] : null;
            return (
              <div className="flex-1 overflow-auto min-h-0">
                {/* Barra navigazione (replica MagazzinoVini) */}
                <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setOpenSchedaId(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-neutral-300 hover:bg-neutral-50 transition shadow-sm">
                    ← Lista
                  </button>
                  <div className="flex items-center gap-1 ml-2">
                    <button onClick={() => prevVino && setOpenSchedaId(prevVino.id)} disabled={!prevVino}
                      title={prevVino ? `← ${prevVino.DESCRIZIONE}` : "Primo vino"}
                      className="px-2 py-1 rounded-md text-xs font-bold bg-white border border-neutral-300 hover:bg-amber-100 transition shadow-sm disabled:opacity-30 disabled:cursor-not-allowed">
                      ‹
                    </button>
                    <span className="text-[10px] text-amber-700 font-medium min-w-[60px] text-center">
                      {curIdx >= 0 ? `${curIdx + 1} / ${bottiglieVisibili.length}` : "—"}
                    </span>
                    <button onClick={() => nextVino && setOpenSchedaId(nextVino.id)} disabled={!nextVino}
                      title={nextVino ? `→ ${nextVino.DESCRIZIONE}` : "Ultimo vino"}
                      className="px-2 py-1 rounded-md text-xs font-bold bg-white border border-neutral-300 hover:bg-amber-100 transition shadow-sm disabled:opacity-30 disabled:cursor-not-allowed">
                      ›
                    </button>
                  </div>
                  <span className="text-xs text-amber-800 font-medium ml-2">#{openSchedaId}</span>
                  {/* S2 cutover 2026-05-18: badge READ-ONLY rimosso. */}
                </div>
                <div className="p-3" ref={schedaRef}>
                  <SchedaVino
                    vinoId={openSchedaId}
                    inline={true}
                    readOnly={true}
                    apiBaseDettaglio="/vini/v2/bottiglie"
                    onClose={() => setOpenSchedaId(null)}
                  />
                </div>
              </div>
            );
          })()}

          {/* ── VISTA BOTTIGLIE ── */}
          {!openSchedaId && !loading && !error && vista === "bottiglie" && (
            <table className="w-full text-[11px]">
              <thead className="bg-neutral-100 sticky top-0 z-10">
                <tr className="text-[9px] text-neutral-600 uppercase tracking-wide select-none">
                  <th className="px-1.5 py-2 text-center w-8">
                    <input type="checkbox"
                      checked={sel.allSelected(bottiglieVisibili.map(v => v.id))}
                      onChange={() => sel.toggleAll(bottiglieVisibili.map(v => v.id))}
                      className="rounded border-violet-400 text-violet-600 focus:ring-violet-300 w-3.5 h-3.5" />
                  </th>
                  <th className="px-2 py-2 text-left w-12 cursor-pointer hover:text-amber-700 transition" onClick={() => sort.handleSort("id")}>
                    ID <sort.SortIcon col="id" />
                  </th>
                  <th className="px-2 py-2 text-left cursor-pointer hover:text-amber-700 transition" onClick={() => sort.handleSort("descrizione")}>
                    Vino <sort.SortIcon col="descrizione" />
                  </th>
                  <th className="px-2 py-2 text-left w-20 cursor-pointer hover:text-amber-700 transition" onClick={() => sort.handleSort("produttore")}>
                    Produttore <sort.SortIcon col="produttore" />
                  </th>
                  <th className="px-2 py-2 text-left w-16 cursor-pointer hover:text-amber-700 transition" onClick={() => sort.handleSort("origine")}>
                    Origine <sort.SortIcon col="origine" />
                  </th>
                  <th className="px-2 py-2 text-center w-10 cursor-pointer hover:text-amber-700 transition" onClick={() => sort.handleSort("qta")}>
                    Qta <sort.SortIcon col="qta" />
                  </th>
                  <th className="px-2 py-2 text-center w-14 cursor-pointer hover:text-amber-700 transition" onClick={() => sort.handleSort("prezzo")}>
                    Prezzo <sort.SortIcon col="prezzo" />
                  </th>
                  <th className="px-2 py-2 text-center w-20">Flag</th>
                </tr>
              </thead>
              <tbody>
                {bottiglieVisibili.map(v => {
                  const tip = v.TIPOLOGIA || v.m_tipologia;
                  const denom = v.DENOMINAZIONE || v.d_display;
                  const isSel = sel.isSelected(v.id);
                  return (
                    <tr key={v.id}
                      className={`cursor-pointer border-b border-neutral-100 hover:bg-amber-50/70 transition ${
                        isSel ? "bg-violet-50/80" : pickByTipo(tip, TIPO_ROW_BG, "bg-white")
                      }`}
                      onClick={() => handleRowClick(v.id)}>
                      <td className="px-1.5 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isSel} onChange={() => sel.toggleId(v.id)}
                          className="rounded border-violet-400 text-violet-600 focus:ring-violet-300 w-3.5 h-3.5" />
                      </td>
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
                {bottiglieVisibili.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-neutral-500">Nessun vino con i filtri correnti.</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* ── VISTA MADRI ── 1 annata inline / N annate compatte */}
          {!openSchedaId && !loading && !error && vista === "madri" && (
            <div className="p-2 space-y-1.5">
              {madriVisibili.map(m => {
                const tip = m.tipologia;
                const borderColor = pickByTipo(tip, TIPO_BORDER_L, "border-l-neutral-400");
                const sottotitolo = [m.produttore_nome, m.regione, m.denominazione_display].filter(Boolean).join(" · ");
                const isSingle = m.annate.length === 1;

                if (isSingle) {
                  const a = m.annate[0];
                  const loc = [
                    a.FRIGORIFERO && `Frigo: ${a.QTA_FRIGO || 0}`,
                    a.LOCAZIONE_1 && `${a.LOCAZIONE_1}: ${a.QTA_LOC1 || 0}`,
                    a.LOCAZIONE_2 && `${a.LOCAZIONE_2}: ${a.QTA_LOC2 || 0}`,
                  ].filter(Boolean).join(" · ");
                  return (
                    <div key={m.id}
                      className={`bg-white rounded-lg border border-neutral-200 shadow-sm border-l-4 ${borderColor} flex items-center gap-2 px-3 py-1.5`}>
                      {/* Zona MADRE (cliccabile → scheda madre) */}
                      <div onClick={() => handleMadreClick(m.id)} title="Apri scheda vino madre"
                        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:bg-rose-50/50 -ml-1 px-1 py-0.5 rounded transition">
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">M{String(m.id).padStart(4, "0")}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${pickByTipo(tip, TIPO_BADGE)} hidden md:inline`}>{tip}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[13px] text-neutral-900 truncate leading-tight">{m.descrizione}</div>
                          {sottotitolo && <div className="text-[10px] text-neutral-500 truncate leading-tight">{sottotitolo}</div>}
                        </div>
                      </div>
                      {/* Zona ANNATA (cliccabile → scheda bottiglia) */}
                      <div onClick={() => handleRowClick(a.id)} title="Apri scheda bottiglia (annata)"
                        className="flex items-center gap-2.5 text-[11px] flex-shrink-0 cursor-pointer hover:bg-amber-50 -mr-1 px-1 py-0.5 rounded transition">
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

                return (
                  <div key={m.id} className={`bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden border-l-4 ${borderColor}`}>
                    {/* Header madre — cliccabile → scheda madre */}
                    <div onClick={() => handleMadreClick(m.id)} title="Apri scheda vino madre"
                      className="px-3 py-1.5 flex items-center gap-2 border-b border-neutral-100 cursor-pointer hover:bg-rose-50/50 transition">
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 flex-shrink-0">M{String(m.id).padStart(4, "0")}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${pickByTipo(tip, TIPO_BADGE)} flex-shrink-0 hidden md:inline`}>{tip}</span>
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
                            <tr key={a.id} onClick={() => handleRowClick(a.id)}
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
              {madriVisibili.length === 0 && (
                <div className="p-8 text-center text-sm text-neutral-500">Nessun vino madre con i filtri correnti.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Barra fissa azioni multiple (S2 cutover 2026-05-18: Modifica/Duplica
          erano disabilitati per "read-only modulo v2", ora che la Cantina classica
          è morta e v2 è scrivibile non hanno più senso come placeholder vuoti.
          Tornare quando saranno implementate come funzioni vere su _v2). */}
      <BulkActionBar
        count={sel.count}
        onClear={sel.clear}
        actions={[
          {
            label: printingPdf ? "Genero…" : "Stampa",
            icon: "🖨️",
            onClick: handlePrintSelection,
            loading: printingPdf,
            variant: "emerald",
          },
        ]}
      />
    </div>
  );
}
