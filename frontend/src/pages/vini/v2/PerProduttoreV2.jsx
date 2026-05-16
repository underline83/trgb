// Modulo: vini
// src/pages/vini/v2/PerProduttoreV2.jsx
//
// M2.6 (2026-05-16) — Vista "catalogo": layout split sinistra/destra.
//   Sinistra: lista produttori della cantina (con counts), ricerca + filtro nazione.
//   Destra:   vini madre del produttore selezionato (cards espandibili con annate),
//             click su madre → SchedaMadreV2 inline che occupa tutto il content area.
//
// Read-only come tutto il modulo Cantina 2. Per modifiche → Cantina classica.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../../../config/api";
import SchedaMadreV2 from "../../../components/vini/SchedaMadreV2";
import { sortRows, SortTh } from "../../../utils/vini/sortableTable";

const TIPOLOGIA_DOT = {
  ROSSI:     "bg-red-500",
  BIANCHI:   "bg-amber-400",
  BOLLICINE: "bg-yellow-400",
  ROSATI:    "bg-pink-400",
  "PASSITI E VINI DA MEDITAZIONE": "bg-orange-500",
  "GRANDI FORMATI": "bg-purple-500",
  "VINI ANALCOLICI": "bg-teal-500",
};

export default function PerProduttoreV2() {
  // ── Sinistra: lista produttori (con counts) ──────────────────────
  const [produttori, setProduttori] = useState([]);
  const [loadingP, setLoadingP] = useState(true);
  const [errorP, setErrorP] = useState("");

  const [search, setSearch] = useState("");
  const [nazione, setNazione] = useState("");
  const [onlyWithStock, setOnlyWithStock] = useState(true);
  const [sortP, setSortP] = useState({ key: "nome", dir: "asc" });

  const reloadP = useCallback(async () => {
    setLoadingP(true); setErrorP("");
    try {
      const params = new URLSearchParams();
      params.set("with_counts", "true");
      if (search) params.set("search", search);
      if (nazione) params.set("nazione", nazione);
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/produttori/?${params}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setProduttori(await r.json());
    } catch (e) {
      setErrorP(String(e.message || e));
    } finally {
      setLoadingP(false);
    }
  }, [search, nazione]);

  useEffect(() => { reloadP(); }, [reloadP]);

  const produttoriFiltered = useMemo(() => {
    let arr = produttori;
    if (onlyWithStock) arr = arr.filter(p => (p.qta_bottiglie || 0) > 0);
    return sortRows(arr, sortP.key, sortP.dir);
  }, [produttori, onlyWithStock, sortP]);

  const nazioniDisponibili = useMemo(
    () => [...new Set(produttori.map(p => p.nazione).filter(Boolean))].sort(),
    [produttori]
  );

  // ── Destra: produttore selezionato + suoi vini madre ─────────────
  const [selectedP, setSelectedP] = useState(null);
  const [madri, setMadri] = useState([]);
  const [loadingM, setLoadingM] = useState(false);
  const [errorM, setErrorM] = useState("");
  const [tipologiaFiltro, setTipologiaFiltro] = useState("");
  const [searchVino, setSearchVino] = useState("");
  const [expandedMadreId, setExpandedMadreId] = useState(null);  // accordion una madre alla volta
  const [openMadreId, setOpenMadreId] = useState(null);  // scheda madre full-frame

  useEffect(() => {
    if (!selectedP) { setMadri([]); return; }
    let cancelled = false;
    (async () => {
      setLoadingM(true); setErrorM(""); setExpandedMadreId(null); setOpenMadreId(null);
      try {
        const r = await apiFetch(`${API_BASE}/vini/v2/madri-raggruppate/?produttore_id=${selectedP.id}&only_positive_stock=false`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) setMadri(data);
      } catch (e) {
        if (!cancelled) setErrorM(String(e.message || e));
      } finally {
        if (!cancelled) setLoadingM(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedP]);

  const madriFiltered = useMemo(() => {
    let arr = madri;
    if (tipologiaFiltro) arr = arr.filter(m => m.tipologia === tipologiaFiltro);
    if (searchVino) {
      const q = searchVino.toLowerCase();
      arr = arr.filter(m => (m.descrizione || "").toLowerCase().includes(q));
    }
    return arr;
  }, [madri, tipologiaFiltro, searchVino]);

  const tipologieDisponibili = useMemo(
    () => [...new Set(madri.map(m => m.tipologia).filter(Boolean))].sort(),
    [madri]
  );
  const madriIndex = useMemo(
    () => Object.fromEntries(madri.map(m => [m.id, m])),
    [madri]
  );
  const openMadre = openMadreId ? madriIndex[openMadreId] : null;

  // Aggregati per il produttore selezionato
  const totMadre = selectedP?.n_madre || 0;
  const totBtg = selectedP?.n_bottiglie || 0;
  const totQta = selectedP?.qta_bottiglie || 0;

  return (
    <div className="max-w-[1400px] mx-auto p-3 md:p-4">
      <div className="flex gap-3 md:gap-4" style={{ height: "calc(100vh - 130px)" }}>

        {/* ═══════════════ SIDEBAR PRODUTTORI ═══════════════ */}
        <aside className="w-72 md:w-80 flex-shrink-0 bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-3 py-2 bg-amber-50 border-b border-amber-200">
            <div className="text-[11px] font-semibold text-amber-900 uppercase tracking-wider">🏛️ Produttori</div>
            <div className="text-[10px] text-amber-800 mt-0.5">{produttoriFiltered.length} su {produttori.length}</div>
          </div>

          <div className="p-2 space-y-1.5 border-b border-neutral-200">
            <input type="text" placeholder="Cerca produttore…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-2 py-1 rounded-lg border border-neutral-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300" />
            <select value={nazione} onChange={e => setNazione(e.target.value)}
              className="w-full px-2 py-1 rounded-lg border border-neutral-300 text-xs bg-white">
              <option value="">Tutte le nazioni</option>
              {nazioniDisponibili.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[10px] text-neutral-700">
              <input type="checkbox" checked={onlyWithStock} onChange={e => setOnlyWithStock(e.target.checked)} />
              Solo con giacenza &gt; 0
            </label>
          </div>

          <div className="px-2 py-1 border-b border-neutral-200 flex items-center gap-2 text-[9px] text-neutral-500 uppercase">
            <button onClick={() => setSortP({ key: "nome", dir: sortP.key === "nome" && sortP.dir === "asc" ? "desc" : "asc" })}
              className={`px-1.5 py-0.5 rounded hover:bg-neutral-100 ${sortP.key === "nome" ? "text-amber-700 font-semibold" : ""}`}>
              Nome {sortP.key === "nome" ? (sortP.dir === "asc" ? "↑" : "↓") : ""}
            </button>
            <button onClick={() => setSortP({ key: "qta_bottiglie", dir: sortP.key === "qta_bottiglie" && sortP.dir === "desc" ? "asc" : "desc" })}
              className={`px-1.5 py-0.5 rounded hover:bg-neutral-100 ${sortP.key === "qta_bottiglie" ? "text-amber-700 font-semibold" : ""}`}>
              Giacenza {sortP.key === "qta_bottiglie" ? (sortP.dir === "desc" ? "↓" : "↑") : ""}
            </button>
            <button onClick={() => setSortP({ key: "n_madre", dir: sortP.key === "n_madre" && sortP.dir === "desc" ? "asc" : "desc" })}
              className={`px-1.5 py-0.5 rounded hover:bg-neutral-100 ${sortP.key === "n_madre" ? "text-amber-700 font-semibold" : ""}`}>
              Vini {sortP.key === "n_madre" ? (sortP.dir === "desc" ? "↓" : "↑") : ""}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingP && <div className="p-4 text-center text-xs text-neutral-500">Carico…</div>}
            {errorP && <div className="p-3 text-xs text-red-700">{errorP}</div>}
            {!loadingP && produttoriFiltered.length === 0 && (
              <div className="p-4 text-center text-xs text-neutral-500">Nessun produttore.</div>
            )}
            {!loadingP && produttoriFiltered.map(p => {
              const active = selectedP?.id === p.id;
              return (
                <button key={p.id}
                  onClick={() => setSelectedP(p)}
                  className={`w-full text-left px-3 py-2 border-b border-neutral-100 transition ${
                    active ? "bg-amber-100 border-l-4 border-l-amber-600" : "hover:bg-amber-50"
                  }`}>
                  <div className={`text-sm font-semibold ${active ? "text-amber-900" : "text-neutral-900"} truncate`}>{p.nome}</div>
                  <div className="text-[10px] text-neutral-600 flex items-center gap-2 mt-0.5">
                    {p.nazione && <span>{p.nazione}{p.regione ? ` · ${p.regione}` : ""}</span>}
                    <span className="ml-auto">
                      <span className="font-semibold text-neutral-800">{p.n_madre || 0}</span>v · <span className="font-semibold text-neutral-800">{p.qta_bottiglie || 0}</span>bt
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ═══════════════ CONTENT AREA ═══════════════ */}
        <section className="flex-1 bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-w-0">
          {!selectedP && (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-neutral-500">
              <div>
                <div className="text-5xl mb-3 opacity-50">🏛️</div>
                <div className="text-sm">Seleziona un produttore dalla lista a sinistra<br/>per vedere i suoi vini madre.</div>
              </div>
            </div>
          )}

          {selectedP && !openMadre && (
            <>
              {/* Header produttore */}
              <div className="px-4 py-3 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white flex items-start justify-between gap-3 flex-shrink-0">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-amber-700">Produttore #{selectedP.id}</div>
                  <h2 className="text-lg font-semibold font-playfair text-amber-900 truncate">🏛️ {selectedP.nome}</h2>
                  <div className="text-xs text-neutral-700 mt-0.5">
                    {[selectedP.citta, selectedP.provincia, selectedP.regione, selectedP.nazione].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="flex gap-3 text-xs flex-shrink-0">
                  <div className="text-right">
                    <div className="text-[9px] text-neutral-500 uppercase">Vini madre</div>
                    <div className="text-lg font-bold text-neutral-900 tabular-nums">{totMadre}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-neutral-500 uppercase">Btg (annate)</div>
                    <div className="text-lg font-bold text-neutral-900 tabular-nums">{totBtg}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-neutral-500 uppercase">Giacenza</div>
                    <div className="text-lg font-bold text-neutral-900 tabular-nums">{totQta}</div>
                  </div>
                </div>
              </div>

              {/* Filtri vini */}
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50 flex items-center gap-2 flex-wrap flex-shrink-0">
                <input type="text" placeholder="Cerca vino…"
                  value={searchVino} onChange={e => setSearchVino(e.target.value)}
                  className="flex-1 min-w-[160px] px-2 py-1 rounded-lg border border-neutral-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300" />
                <select value={tipologiaFiltro} onChange={e => setTipologiaFiltro(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-neutral-300 text-xs bg-white">
                  <option value="">Tutte le tipologie</option>
                  {tipologieDisponibili.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-[10px] text-neutral-500 ml-auto">{madriFiltered.length} vini</span>
              </div>

              {/* Lista madri (cards espandibili) */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {loadingM && <div className="text-center text-xs text-neutral-500 py-8">Carico vini…</div>}
                {errorM && <div className="text-center text-xs text-red-700 py-4">{errorM}</div>}
                {!loadingM && madriFiltered.length === 0 && (
                  <div className="text-center text-xs text-neutral-500 py-8">Nessun vino corrisponde ai filtri.</div>
                )}
                {!loadingM && madriFiltered.map(m => {
                  const isExpanded = expandedMadreId === m.id;
                  const annate = m.annate || [];
                  const tipoDot = TIPOLOGIA_DOT[m.tipologia] || "bg-neutral-300";
                  return (
                    <div key={m.id} className={`border rounded-xl overflow-hidden transition ${isExpanded ? "border-amber-400 shadow-sm" : "border-neutral-200"}`}>
                      <div className="px-3 py-2 bg-white flex items-center gap-2 hover:bg-amber-50 cursor-pointer transition"
                           onClick={() => setExpandedMadreId(isExpanded ? null : m.id)}>
                        <div className={`w-2 h-8 rounded ${tipoDot}`} />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-neutral-900 truncate">{m.descrizione}</div>
                          <div className="text-[10px] text-neutral-500 truncate">
                            {[m.tipologia, m.denominazione_display, m.regione].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right text-[11px] text-neutral-600">
                          <div><strong className="text-neutral-900">{annate.length}</strong> annat{annate.length === 1 ? "a" : "e"}</div>
                          <div><strong className="text-neutral-900">{m.qta_tot || 0}</strong> bt</div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setOpenMadreId(m.id); }}
                          title="Apri scheda madre completa"
                          className="px-2 py-1 rounded border border-amber-400 text-amber-800 text-xs hover:bg-amber-100 flex-shrink-0">
                          📋 Scheda
                        </button>
                        <span className="text-amber-600 flex-shrink-0">{isExpanded ? "▾" : "▸"}</span>
                      </div>

                      {isExpanded && annate.length > 0 && (
                        <div className="border-t border-neutral-100 bg-neutral-50">
                          <AnnateTable annate={annate} />
                        </div>
                      )}
                      {isExpanded && annate.length === 0 && (
                        <div className="border-t border-neutral-100 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 italic">
                          Nessuna annata caricata.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* SchedaMadreV2 inline (sostituisce la lista) */}
          {selectedP && openMadre && (
            <>
              <div className="px-3 py-2 bg-rose-50 border-b border-rose-200 flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setOpenMadreId(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-neutral-300 hover:bg-neutral-50 shadow-sm">
                  ← Vini di {selectedP.nome}
                </button>
                <span className="text-xs font-bold text-rose-900">🍷 Scheda Vino Madre</span>
              </div>
              <div className="flex-1 overflow-auto p-3 bg-neutral-50">
                <SchedaMadreV2 madre={openMadre} onClose={() => setOpenMadreId(null)} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}


/**
 * Sotto-tabella annate per il pannello espanso di un vino madre.
 * Mostra colonne essenziali (annata, formato, qta, prezzo carta, giacenza).
 */
function AnnateTable({ annate }) {
  const [sort, setSort] = useState({ key: "ANNATA", dir: "desc" });
  const sorted = useMemo(() => sortRows(annate, sort.key, sort.dir), [annate, sort]);
  return (
    <table className="w-full text-xs">
      <thead className="text-[10px] uppercase tracking-wider text-neutral-500">
        <tr>
          <SortTh label="Annata"     sortKey="ANNATA"        sort={sort} setSort={setSort} />
          <SortTh label="Formato"    sortKey="FORMATO"       sort={sort} setSort={setSort} />
          <SortTh label="Qta"        sortKey="QTA_TOTALE"    sort={sort} setSort={setSort} align="right" />
          <SortTh label="Frigo"      sortKey="QTA_FRIGO"     sort={sort} setSort={setSort} align="right" />
          <SortTh label="Loc1"       sortKey="QTA_LOC1"      sort={sort} setSort={setSort} align="right" />
          <SortTh label="Loc2"       sortKey="QTA_LOC2"      sort={sort} setSort={setSort} align="right" />
          <SortTh label="Loc3"       sortKey="QTA_LOC3"      sort={sort} setSort={setSort} align="right" />
          <SortTh label="Carta"      sortKey="PREZZO_CARTA"  sort={sort} setSort={setSort} align="right" />
          <SortTh label="Listino"    sortKey="EURO_LISTINO"  sort={sort} setSort={setSort} align="right" />
        </tr>
      </thead>
      <tbody>
        {sorted.map(a => (
          <tr key={a.id} className="border-t border-neutral-100 hover:bg-white">
            <td className="px-3 py-1 font-semibold tabular-nums">{a.ANNATA || "NV"}</td>
            <td className="px-3 py-1">{a.FORMATO || "BT"}</td>
            <td className="px-3 py-1 text-right tabular-nums font-semibold">{a.QTA_TOTALE || 0}</td>
            <td className="px-3 py-1 text-right tabular-nums text-neutral-500">{a.QTA_FRIGO || 0}</td>
            <td className="px-3 py-1 text-right tabular-nums text-neutral-500">{a.QTA_LOC1 || 0}</td>
            <td className="px-3 py-1 text-right tabular-nums text-neutral-500">{a.QTA_LOC2 || 0}</td>
            <td className="px-3 py-1 text-right tabular-nums text-neutral-500">{a.QTA_LOC3 || 0}</td>
            <td className="px-3 py-1 text-right tabular-nums">
              {a.PREZZO_CARTA != null && a.PREZZO_CARTA !== "" ? `€ ${Number(a.PREZZO_CARTA).toFixed(0)}` : "—"}
            </td>
            <td className="px-3 py-1 text-right tabular-nums text-neutral-500">
              {a.EURO_LISTINO != null && a.EURO_LISTINO !== "" ? `€ ${Number(a.EURO_LISTINO).toFixed(2)}` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
