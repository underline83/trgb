// @version: v1.0-elenco-fatture
// Elenco fatture con filtri avanzati, ricerca, paginazione
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const FE = `${API_BASE}/contabilita/fe`;
const fmt = (v) =>
  v != null
    ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";

const PAGE_SIZE = 50;

export default function FattureElenco() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filtri dallo URL
  const initialSearch = searchParams.get("q") || "";
  const initialYear = searchParams.get("year") || "";
  const initialMonth = searchParams.get("month") || "";
  const initialFornitore = searchParams.get("fornitore") || "";

  const [search, setSearch] = useState(initialSearch);
  const [yearFilter, setYearFilter] = useState(initialYear);
  const [monthFilter, setMonthFilter] = useState(initialMonth);
  const [fornitoreFilter, setFornitoreFilter] = useState(initialFornitore);
  const [importoMin, setImportoMin] = useState("");
  const [importoMax, setImportoMax] = useState("");

  const [data, setData] = useState({ fatture: [], total: 0, totale_importo: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  // Anni disponibili
  const [years, setYears] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`${FE}/fatture?limit=1&offset=0`);
        if (!res.ok) return;
        // fetch all to get years
        const all = await apiFetch(`${FE}/fatture?limit=5000`);
        if (all.ok) {
          const d = await all.json();
          const ySet = new Set();
          (d.fatture || []).forEach((f) => {
            if (f.data_fattura) ySet.add(f.data_fattura.slice(0, 4));
          });
          setYears(Array.from(ySet).sort());
        }
      } catch { /* ok */ }
    })();
  }, []);

  // Ref per i filtri correnti (evita loop di refetch su ogni keystroke)
  const filtersRef = React.useRef({ search, yearFilter, monthFilter, fornitoreFilter, importoMin, importoMax });
  filtersRef.current = { search, yearFilter, monthFilter, fornitoreFilter, importoMin, importoMax };

  const fetchData = useCallback(async (pg = 0) => {
    setLoading(true);
    try {
      const f = filtersRef.current;
      const params = new URLSearchParams();
      if (f.search.trim()) params.set("search", f.search.trim());
      if (f.yearFilter) params.set("year", f.yearFilter);
      if (f.monthFilter) params.set("month", f.monthFilter);
      if (f.fornitoreFilter) params.set("fornitore", f.fornitoreFilter);
      if (f.importoMin) params.set("importo_min", f.importoMin);
      if (f.importoMax) params.set("importo_max", f.importoMax);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(pg * PAGE_SIZE));

      const res = await apiFetch(`${FE}/fatture?${params.toString()}`);
      if (!res.ok) throw new Error("Errore");
      const json = await res.json();
      setData(json);
      setPage(pg);
    } catch {
      setData({ fatture: [], total: 0, totale_importo: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch iniziale + refetch quando cambiano i filtri select (anno/mese)
  useEffect(() => {
    fetchData(0);
  }, [yearFilter, monthFilter]);

  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  const MESI = ["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

  const handleSearchKey = (e) => {
    if (e.key === "Enter") fetchData(0);
  };

  const clearFilters = () => {
    setSearch("");
    setYearFilter("");
    setMonthFilter("");
    setFornitoreFilter("");
    setImportoMin("");
    setImportoMax("");
  };

  const hasFilters = search || yearFilter || monthFilter || fornitoreFilter || importoMin || importoMax;

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="elenco" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-amber-900 font-playfair">
              Elenco Fatture
            </h1>
            <p className="text-neutral-500 text-xs mt-0.5">
              {data.total} fatture — Totale: € {fmt(data.totale_importo)}
            </p>
          </div>
        </div>

        {/* SEARCH + FILTERS */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search bar */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKey}
                placeholder="Cerca per fornitore, P.IVA, numero fattura..."
                className="w-full text-sm border border-neutral-300 rounded-xl px-4 py-2.5 pr-10 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
              />
              <button
                onClick={() => fetchData(0)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-amber-100 hover:bg-amber-200 flex items-center justify-center text-amber-800 text-sm transition"
              >
                ⌕
              </button>
            </div>

            {/* Quick filters */}
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="text-sm border border-neutral-300 rounded-xl px-3 py-2 bg-white"
            >
              <option value="">Tutti gli anni</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="text-sm border border-neutral-300 rounded-xl px-3 py-2 bg-white"
            >
              <option value="">Tutti i mesi</option>
              {MESI.slice(1).map((m, i) => (
                <option key={i + 1} value={String(i + 1).padStart(2, "0")}>{m}</option>
              ))}
            </select>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                showFilters ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              Filtri {showFilters ? "▲" : "▼"}
            </button>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-2 rounded-xl text-sm font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition"
              >
                Pulisci
              </button>
            )}
          </div>

          {/* Advanced filters panel */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t border-neutral-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-neutral-500 font-medium uppercase tracking-wide">Importo min</label>
                <input
                  type="number"
                  value={importoMin}
                  onChange={(e) => setImportoMin(e.target.value)}
                  placeholder="€ 0"
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-1.5 mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 font-medium uppercase tracking-wide">Importo max</label>
                <input
                  type="number"
                  value={importoMax}
                  onChange={(e) => setImportoMax(e.target.value)}
                  placeholder="€ 99999"
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-1.5 mt-1"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-neutral-500 font-medium uppercase tracking-wide">Fornitore specifico</label>
                <input
                  type="text"
                  value={fornitoreFilter}
                  onChange={(e) => setFornitoreFilter(e.target.value)}
                  placeholder="Nome esatto fornitore"
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-1.5 mt-1"
                />
              </div>
            </div>
          )}
        </div>

        {/* TABLE */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="text-center py-16 text-neutral-400 text-sm">Caricamento...</div>
          ) : data.fatture.length === 0 ? (
            <div className="text-center py-16 text-neutral-400 text-sm">
              Nessuna fattura trovata{hasFilters ? " con i filtri selezionati" : ""}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Data</th>
                      <th className="px-4 py-3 text-left font-medium">Fornitore</th>
                      <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">P.IVA</th>
                      <th className="px-4 py-3 text-left font-medium">Numero</th>
                      <th className="px-4 py-3 text-right font-medium">Importo</th>
                      <th className="px-4 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.fatture.map((f, i) => (
                      <tr
                        key={f.id}
                        className="border-b border-neutral-100 hover:bg-amber-50/40 cursor-pointer transition"
                        onClick={() => navigate(`/admin/fatture/dettaglio/${f.id}`)}
                      >
                        <td className="px-4 py-2.5 tabular-nums text-neutral-700 whitespace-nowrap">
                          {f.data_fattura || "-"}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-neutral-800 truncate max-w-[250px]">
                            {f.fornitore_nome || "-"}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-neutral-500 tabular-nums hidden sm:table-cell">
                          {f.fornitore_piva || "-"}
                        </td>
                        <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">
                          {f.numero_fattura || "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-neutral-900 tabular-nums whitespace-nowrap">
                          € {fmt(f.totale_fattura)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-amber-500 text-sm">→</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100">
                  <p className="text-xs text-neutral-500">
                    Pagina {page + 1} di {totalPages} ({data.total} risultati)
                  </p>
                  <div className="flex gap-1">
                    <button
                      disabled={page === 0}
                      onClick={() => fetchData(page - 1)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                        page === 0
                          ? "bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed"
                          : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      ← Prec
                    </button>
                    <button
                      disabled={page >= totalPages - 1}
                      onClick={() => fetchData(page + 1)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                        page >= totalPages - 1
                          ? "bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed"
                          : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      Succ →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
