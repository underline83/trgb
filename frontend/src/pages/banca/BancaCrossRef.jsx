// @version: v2.0-crossref-filtri
// Cross-reference movimenti bancari ↔ fatture XML
// Tab: Collegati / Suggerimenti / Senza match — ricerca manuale
import React, { useEffect, useState, useCallback, useRef } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FlussiCassaNav from "./FlussiCassaNav";

const FC = `${API_BASE}/banca`;

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const TABS = [
  { key: "collegati",    label: "Collegati",     icon: "✅", color: "emerald" },
  { key: "suggerimenti", label: "Suggerimenti",  icon: "💡", color: "amber" },
  { key: "senza",        label: "Senza match",   icon: "❓", color: "neutral" },
];

export default function BancaCrossRef() {
  const [movimenti, setMovimenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("suggerimenti");
  const [linking, setLinking] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [searchId, setSearchId] = useState(null);      // movimento in ricerca manuale
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [filterText, setFilterText] = useState("");
  const debounceRef = useRef(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await apiFetch(`${FC}/cross-ref`);
      if (!resp.ok) throw new Error("Errore caricamento");
      setMovimenti(await resp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async (movimentoId, fatturaId) => {
    setLinking(movimentoId);
    try {
      const resp = await apiFetch(`${FC}/cross-ref/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimento_id: movimentoId, fattura_id: fatturaId }),
      });
      if (!resp.ok) throw new Error("Errore collegamento");
      setSearchId(null);
      setSearchQuery("");
      setSearchResults([]);
      setExpandedId(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLinking(null);
    }
  };

  const handleUnlink = async (linkId) => {
    try {
      await apiFetch(`${FC}/cross-ref/link/${linkId}`, { method: "DELETE" });
      await loadData();
    } catch (_) {}
  };

  // Ricerca manuale fatture con debounce
  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const resp = await apiFetch(`${FC}/cross-ref/search-fatture?q=${encodeURIComponent(q)}`);
      if (resp.ok) setSearchResults(await resp.json());
    } catch (_) {}
    setSearchLoading(false);
  }, []);

  const onSearchChange = (q) => {
    setSearchQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 350);
  };

  // Filtra movimenti per tab
  const linked   = movimenti.filter((m) => m.link_id);
  const unlinked = movimenti.filter((m) => !m.link_id);
  const withSugg = unlinked.filter((m) => m.possibili_fatture?.length > 0);
  const noMatch  = unlinked.filter((m) => !m.possibili_fatture?.length);

  const listMap = { collegati: linked, suggerimenti: withSugg, senza: noMatch };
  let currentList = listMap[tab] || [];

  // Filtro testo libero
  if (filterText.trim()) {
    const ft = filterText.toLowerCase();
    currentList = currentList.filter(m =>
      (m.descrizione || "").toLowerCase().includes(ft) ||
      (m.fornitore_nome || "").toLowerCase().includes(ft) ||
      (m.numero_fattura || "").toLowerCase().includes(ft) ||
      String(Math.abs(m.importo || 0)).includes(ft)
    );
  }

  const tabColor = (key) => {
    const t = TABS.find(t => t.key === key);
    if (!t) return {};
    return tab === key
      ? `bg-${t.color}-100 text-${t.color}-800 border-${t.color}-300`
      : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50";
  };

  // ── Card movimento ──
  const renderMovimento = (m) => {
    const isExpanded = expandedId === m.id;
    const isSearching = searchId === m.id;
    const hasLink = !!m.link_id;
    const hasSugg = m.possibili_fatture?.length > 0;

    return (
      <div key={m.id} className={`rounded-xl border p-4 transition ${
        hasLink ? "bg-emerald-50/40 border-emerald-200" :
        hasSugg ? "bg-amber-50/30 border-amber-200" :
        "bg-white border-neutral-200"
      }`}>
        {/* Header movimento */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs text-neutral-500 whitespace-nowrap">{m.data_contabile}</span>
              <span className="text-sm font-semibold text-red-600 font-mono">€ {fmt(m.importo)}</span>
              {hasLink && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">collegato</span>
              )}
            </div>
            <div className="text-xs text-neutral-700 truncate" title={m.descrizione}>
              {m.descrizione}
            </div>
            {m.categoria_banca && (
              <div className="text-[10px] text-neutral-400 mt-0.5">
                {m.categoria_banca}{m.sottocategoria_banca ? ` — ${m.sottocategoria_banca}` : ""}
              </div>
            )}

            {/* Link esistente */}
            {hasLink && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-emerald-700 font-medium">
                  → {m.fornitore_nome} — Fatt. {m.numero_fattura} del {m.data_fattura} (€ {fmt(m.totale_fattura)})
                </span>
                <button onClick={() => handleUnlink(m.link_id)}
                  className="px-2 py-0.5 rounded text-[10px] border border-red-200 text-red-500 hover:bg-red-50">
                  Scollega
                </button>
              </div>
            )}
          </div>

          {/* Bottoni azione */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!hasLink && hasSugg && (
              <button onClick={() => { setExpandedId(isExpanded ? null : m.id); setSearchId(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  isExpanded ? "bg-amber-100 border-amber-300 text-amber-800" : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}>
                {isExpanded ? "Chiudi" : `${m.possibili_fatture.length} match`}
              </button>
            )}
            {!hasLink && (
              <button onClick={() => {
                  if (isSearching) { setSearchId(null); setSearchQuery(""); setSearchResults([]); }
                  else { setSearchId(m.id); setExpandedId(null); setSearchQuery(""); setSearchResults([]); }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  isSearching ? "bg-teal-100 border-teal-300 text-teal-800" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
                }`}>
                {isSearching ? "Chiudi" : "🔍 Cerca"}
              </button>
            )}
          </div>
        </div>

        {/* Pannello suggerimenti auto */}
        {isExpanded && hasSugg && (
          <div className="mt-3 pt-3 border-t border-amber-200 space-y-2">
            <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">
              Fatture con importo simile (±5%, ±10gg)
            </div>
            {m.possibili_fatture.map((f) => renderFatturaOption(f, m.id))}
          </div>
        )}

        {/* Pannello ricerca manuale */}
        {isSearching && (
          <div className="mt-3 pt-3 border-t border-teal-200">
            <div className="text-[10px] font-semibold text-teal-600 uppercase tracking-wide mb-2">
              Cerca fattura per fornitore, numero o importo
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="es. Compagnia del Vino, 26000203, 1077..."
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-teal-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 mb-2"
            />
            {searchLoading && <div className="text-xs text-neutral-500 py-2">Ricerca...</div>}
            {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div className="text-xs text-neutral-400 py-2">Nessuna fattura trovata (non già collegata)</div>
            )}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {searchResults.map((f) => renderFatturaOption(f, m.id))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Card fattura da collegare ──
  const renderFatturaOption = (f, movId) => (
    <div key={f.id} className="flex items-center justify-between bg-white rounded-lg border border-neutral-200 p-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-neutral-800 truncate">{f.fornitore_nome}</div>
        <div className="text-xs text-neutral-500">
          {f.numero_fattura ? `Fatt. ${f.numero_fattura}` : "Senza numero"} {f.data_fattura ? `del ${f.data_fattura}` : ""} — € {fmt(f.totale_fattura)}
        </div>
      </div>
      <button
        onClick={() => handleLink(movId, f.id)}
        disabled={linking === movId}
        className="ml-3 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-40 flex-shrink-0">
        {linking === movId ? "..." : "Collega"}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FlussiCassaNav current="crossref" />
      <div className="max-w-6xl mx-auto p-4 sm:p-6 mt-2">
        <div className="bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200">
          <h1 className="text-3xl font-bold text-emerald-900 tracking-wide font-playfair mb-1">
            Cross-Ref Fatture
          </h1>
          <p className="text-neutral-500 text-sm mb-5">
            Collega i pagamenti bancari alle fatture per riconciliazione automatica.
          </p>

          {/* ── Tab badges ── */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {TABS.map(t => {
              const count = t.key === "collegati" ? linked.length : t.key === "suggerimenti" ? withSugg.length : noMatch.length;
              const active = tab === t.key;
              const colors = {
                collegati:    active ? "bg-emerald-100 border-emerald-300 text-emerald-800" : "bg-white border-neutral-200 text-neutral-600 hover:bg-emerald-50",
                suggerimenti: active ? "bg-amber-100 border-amber-300 text-amber-800"     : "bg-white border-neutral-200 text-neutral-600 hover:bg-amber-50",
                senza:        active ? "bg-neutral-200 border-neutral-400 text-neutral-800" : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50",
              };
              return (
                <button key={t.key} onClick={() => { setTab(t.key); setExpandedId(null); setSearchId(null); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition flex items-center gap-2 ${colors[t.key]}`}>
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    active ? "bg-white/60" : "bg-neutral-100"
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* ── Filtro testo ── */}
          <div className="mb-4">
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filtra per descrizione, fornitore, importo..."
              className="w-full sm:w-96 px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-neutral-500">Caricamento...</div>
          ) : currentList.length === 0 ? (
            <div className="text-center py-12 text-neutral-400">
              {filterText ? "Nessun risultato per il filtro corrente." :
               tab === "collegati" ? "Nessun movimento collegato ancora." :
               tab === "suggerimenti" ? "Nessun suggerimento automatico disponibile." :
               "Tutti i movimenti hanno almeno un suggerimento."}
            </div>
          ) : (
            <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
              {currentList.map(renderMovimento)}
            </div>
          )}

          {/* ── Riepilogo totale ── */}
          {!loading && (
            <div className="mt-4 pt-3 border-t border-neutral-200 flex flex-wrap gap-4 text-xs text-neutral-500">
              <span>{movimenti.length} movimenti totali</span>
              <span>•</span>
              <span className="text-emerald-600">{linked.length} collegati</span>
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
