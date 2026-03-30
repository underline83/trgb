// @version: v3.0-riconciliazione-spese
// Riconciliazione Spese — match movimenti bancari ↔ fatture + spese fisse
// Tabella con colonne ordinabili, filtri, ricerca manuale
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FlussiCassaNav from "./FlussiCassaNav";

const FC = `${API_BASE}/banca`;

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
  } catch { return d; }
};

const TIPO_LABELS = {
  FATTURA: "Fattura",
  SPESA_FISSA: "Spesa fissa",
  AFFITTO: "Affitto",
  TASSA: "Tassa",
  STIPENDIO: "Stipendio",
  PRESTITO: "Prestito",
  RATEIZZAZIONE: "Rata",
  ASSICURAZIONE: "Assicurazione",
  ALTRO: "Altro",
};

const tipoBadge = (tipo) => {
  const colors = {
    FATTURA: "bg-blue-100 text-blue-700 border-blue-200",
    SPESA_FISSA: "bg-violet-100 text-violet-700 border-violet-200",
    AFFITTO: "bg-amber-100 text-amber-700 border-amber-200",
    TASSA: "bg-red-100 text-red-700 border-red-200",
    STIPENDIO: "bg-emerald-100 text-emerald-700 border-emerald-200",
    PRESTITO: "bg-orange-100 text-orange-700 border-orange-200",
    RATEIZZAZIONE: "bg-orange-100 text-orange-700 border-orange-200",
    ASSICURAZIONE: "bg-sky-100 text-sky-700 border-sky-200",
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${colors[tipo] || "bg-neutral-100 text-neutral-600 border-neutral-200"}`}>
      {TIPO_LABELS[tipo] || tipo}
    </span>
  );
};

const TABS = [
  { key: "suggerimenti", label: "Suggerimenti",  icon: "💡", desc: "Match automatici" },
  { key: "senza",        label: "Senza match",   icon: "❓", desc: "Ricerca manuale" },
  { key: "collegati",    label: "Collegati",      icon: "✅", desc: "Già riconciliati" },
];

// ── Sort header ──
function SortTh({ label, field, sort, onSort, className = "" }) {
  const active = sort.field === field;
  const arrow = active ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th onClick={() => onSort(field)}
      className={`px-3 py-2 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-800 whitespace-nowrap ${className}`}>
      {label}{arrow}
    </th>
  );
}

function sortRows(rows, sort) {
  if (!sort.field) return rows;
  return [...rows].sort((a, b) => {
    let va = a[sort.field], vb = b[sort.field];
    if (sort.field === "importo") {
      va = Math.abs(va || 0); vb = Math.abs(vb || 0);
    }
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return sort.dir === "asc" ? va - vb : vb - va;
    return sort.dir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
}

export default function BancaCrossRef() {
  const [movimenti, setMovimenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("suggerimenti");
  const [linking, setLinking] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [searchId, setSearchId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [sort, setSort] = useState({ field: "data_contabile", dir: "desc" });
  const debounceRef = useRef(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await apiFetch(`${FC}/cross-ref`);
      if (!resp.ok) throw new Error("Errore caricamento");
      setMovimenti(await resp.json());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleLink = async (movimentoId, source, sourceId) => {
    setLinking(movimentoId);
    try {
      const body = { movimento_id: movimentoId };
      if (source === "fattura") body.fattura_id = sourceId;
      else body.uscita_id = sourceId;
      const resp = await apiFetch(`${FC}/cross-ref/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.detail || "Errore collegamento"); }
      setSearchId(null); setSearchQuery(""); setSearchResults([]); setExpandedId(null);
      await loadData();
    } catch (err) { setError(err.message); }
    finally { setLinking(null); }
  };

  const handleUnlink = async (linkId) => {
    try {
      await apiFetch(`${FC}/cross-ref/link/${linkId}`, { method: "DELETE" });
      await loadData();
    } catch (_) {}
  };

  // Ricerca manuale
  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const resp = await apiFetch(`${FC}/cross-ref/search?q=${encodeURIComponent(q)}`);
      if (resp.ok) setSearchResults(await resp.json());
    } catch (_) {}
    setSearchLoading(false);
  }, []);

  const onSearchChange = (q) => {
    setSearchQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 350);
  };

  const onSort = (field) => {
    setSort(prev => prev.field === field
      ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { field, dir: field === "data_contabile" ? "desc" : "asc" }
    );
  };

  // ── Filtra per tab ──
  const linked   = useMemo(() => movimenti.filter(m => m.link_id), [movimenti]);
  const unlinked = useMemo(() => movimenti.filter(m => !m.link_id), [movimenti]);
  const withSugg = useMemo(() => unlinked.filter(m => m.possibili_match?.length > 0), [unlinked]);
  const noMatch  = useMemo(() => unlinked.filter(m => !m.possibili_match?.length), [unlinked]);

  const listMap = { collegati: linked, suggerimenti: withSugg, senza: noMatch };
  let currentList = listMap[tab] || [];

  // Filtro testo
  if (filterText.trim()) {
    const ft = filterText.toLowerCase();
    currentList = currentList.filter(m =>
      (m.descrizione || "").toLowerCase().includes(ft) ||
      (m.link_fornitore || "").toLowerCase().includes(ft) ||
      (m.link_numero || "").toLowerCase().includes(ft) ||
      String(Math.abs(m.importo || 0)).includes(ft)
    );
  }

  // Ordina
  const sorted = sortRows(currentList, sort);

  // ── Render match option (fattura o uscita) ──
  const renderMatchOption = (s, movId) => (
    <div key={`${s.source}-${s.source_id}`}
      className="flex items-center justify-between bg-white rounded-lg border border-neutral-200 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {tipoBadge(s.tipo)}
        <span className="text-sm font-medium text-neutral-800 truncate">{s.fornitore_nome}</span>
        <span className="text-xs text-neutral-400 whitespace-nowrap">
          {s.numero_fattura ? `${s.numero_fattura} ` : ""}{fmtDate(s.data_ref)}
        </span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
        <span className="text-sm font-mono font-semibold text-neutral-700">€ {fmt(s.totale)}</span>
        <button onClick={() => handleLink(movId, s.source, s.source_id)}
          disabled={linking === movId}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-40">
          {linking === movId ? "..." : "Collega"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FlussiCassaNav current="crossref" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 mt-2">
        <div className="bg-white shadow-2xl rounded-3xl p-6 sm:p-8 border border-neutral-200">
          <h1 className="text-3xl font-bold text-emerald-900 tracking-wide font-playfair mb-1">
            Riconciliazione Spese
          </h1>
          <p className="text-neutral-500 text-sm mb-5">
            Collega i movimenti bancari a fatture, affitti, tasse, rate e altre spese.
          </p>

          {/* ── Tab ── */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {TABS.map(t => {
              const count = t.key === "collegati" ? linked.length : t.key === "suggerimenti" ? withSugg.length : noMatch.length;
              const active = tab === t.key;
              return (
                <button key={t.key} onClick={() => { setTab(t.key); setExpandedId(null); setSearchId(null); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition flex items-center gap-2 ${
                    active ? "bg-emerald-100 border-emerald-300 text-emerald-800 shadow-sm" : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  }`}>
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${active ? "bg-white/60" : "bg-neutral-100"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* ── Filtro ── */}
          <div className="mb-4">
            <input type="text" value={filterText} onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filtra per descrizione, fornitore, importo..."
              className="w-full sm:w-96 px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
          )}

          {loading ? (
            <div className="text-center py-12 text-neutral-500">Caricamento...</div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-neutral-400">
              {filterText ? "Nessun risultato per il filtro." :
               tab === "collegati" ? "Nessun movimento riconciliato." :
               tab === "suggerimenti" ? "Nessun suggerimento disponibile." :
               "Tutti i movimenti hanno almeno un suggerimento."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <SortTh label="Data" field="data_contabile" sort={sort} onSort={onSort} />
                    <SortTh label="Importo" field="importo" sort={sort} onSort={onSort} className="text-right" />
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Descrizione</th>
                    {tab === "collegati" && (
                      <>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Tipo</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Collegato a</th>
                        <th className="px-3 py-2 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider w-20"></th>
                      </>
                    )}
                    {tab === "suggerimenti" && (
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Match</th>
                    )}
                    {tab === "senza" && (
                      <th className="px-3 py-2 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider w-24"></th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(m => {
                    const isExpanded = expandedId === m.id;
                    const isSearching = searchId === m.id;
                    const hasLink = !!m.link_id;
                    const hasSugg = m.possibili_match?.length > 0;

                    return (
                      <React.Fragment key={m.id}>
                        <tr className={`border-b border-neutral-100 hover:bg-neutral-50 transition ${
                          isExpanded || isSearching ? "bg-neutral-50" : ""
                        }`}>
                          <td className="px-3 py-2.5 text-xs text-neutral-600 whitespace-nowrap">{fmtDate(m.data_contabile)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold text-red-600 whitespace-nowrap">
                            € {fmt(m.importo)}
                          </td>
                          <td className="px-3 py-2.5 max-w-xs">
                            <div className="text-xs text-neutral-800 truncate" title={m.descrizione}>{m.descrizione}</div>
                            {m.categoria_banca && (
                              <div className="text-[10px] text-neutral-400">{m.categoria_banca}{m.sottocategoria_banca ? ` — ${m.sottocategoria_banca}` : ""}</div>
                            )}
                          </td>

                          {/* ── Tab collegati: info link ── */}
                          {tab === "collegati" && hasLink && (
                            <>
                              <td className="px-3 py-2.5">{tipoBadge(m.link_tipo || "FATTURA")}</td>
                              <td className="px-3 py-2.5">
                                <div className="text-xs text-neutral-800 font-medium">{m.link_fornitore}</div>
                                <div className="text-[10px] text-neutral-500">
                                  {m.link_numero || "—"} {m.link_data ? `· ${fmtDate(m.link_data)}` : ""} · € {fmt(m.link_totale)}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button onClick={() => handleUnlink(m.link_id)}
                                  className="px-2 py-1 rounded text-[10px] border border-red-200 text-red-500 hover:bg-red-50">
                                  Scollega
                                </button>
                              </td>
                            </>
                          )}

                          {/* ── Tab suggerimenti: pulsante espandi ── */}
                          {tab === "suggerimenti" && (
                            <td className="px-3 py-2.5">
                              <button onClick={() => setExpandedId(isExpanded ? null : m.id)}
                                className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                                  isExpanded ? "bg-amber-100 border-amber-300 text-amber-800" : "border-amber-200 text-amber-700 hover:bg-amber-50"
                                }`}>
                                {isExpanded ? "Chiudi" : `${m.possibili_match?.length} possibili`}
                              </button>
                            </td>
                          )}

                          {/* ── Tab senza match: pulsante cerca ── */}
                          {tab === "senza" && (
                            <td className="px-3 py-2.5 text-center">
                              <button onClick={() => {
                                if (isSearching) { setSearchId(null); setSearchQuery(""); setSearchResults([]); }
                                else { setSearchId(m.id); setExpandedId(null); setSearchQuery(""); setSearchResults([]); }
                              }}
                                className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                                  isSearching ? "bg-teal-100 border-teal-300 text-teal-800" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                                }`}>
                                {isSearching ? "Chiudi" : "🔍 Cerca"}
                              </button>
                            </td>
                          )}
                        </tr>

                        {/* ── Riga espansa: suggerimenti auto ── */}
                        {isExpanded && hasSugg && (
                          <tr>
                            <td colSpan={tab === "collegati" ? 6 : 4} className="px-3 py-3 bg-amber-50/30">
                              <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-2">
                                Possibili corrispondenze (importo ±5-10%, data ±10-20gg)
                              </div>
                              <div className="space-y-1.5">
                                {m.possibili_match.map(s => renderMatchOption(s, m.id))}
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* ── Riga espansa: ricerca manuale ── */}
                        {isSearching && (
                          <tr>
                            <td colSpan={tab === "collegati" ? 6 : 4} className="px-3 py-3 bg-teal-50/30">
                              <div className="text-[10px] font-semibold text-teal-600 uppercase tracking-wide mb-2">
                                Cerca fattura o spesa per fornitore, tipo o importo
                              </div>
                              <input type="text" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)}
                                placeholder="es. Compagnia del Vino, affitto, 1077..."
                                autoFocus
                                className="w-full sm:w-96 px-3 py-2 rounded-lg border border-teal-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 mb-2" />
                              {searchLoading && <div className="text-xs text-neutral-500 py-1">Ricerca...</div>}
                              {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
                                <div className="text-xs text-neutral-400 py-1">Nessun risultato tra fatture e uscite non collegate.</div>
                              )}
                              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                                {searchResults.map(s => renderMatchOption(s, m.id))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Riepilogo ── */}
          {!loading && (
            <div className="mt-4 pt-3 border-t border-neutral-200 flex flex-wrap gap-4 text-xs text-neutral-500">
              <span>{movimenti.length} movimenti totali</span>
              <span>•</span>
              <span className="text-emerald-600 font-medium">{linked.length} riconciliati</span>
              <span>•</span>
              <span className="text-amber-600">{withSugg.length} con suggerimenti</span>
              <span>•</span>
              <span>{noMatch.length} senza match</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
