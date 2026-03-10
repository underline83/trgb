// @version: v1.1-elenco-fix
// Elenco fatture con filtri avanzati, ricerca, paginazione
import React, { useState, useEffect } from "react";
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
  const [searchParams] = useSearchParams();

  // Filtri
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [yearFilter, setYearFilter] = useState(searchParams.get("year") || "");
  const [monthFilter, setMonthFilter] = useState(searchParams.get("month") || "");
  const [fornitoreFilter, setFornitoreFilter] = useState("");
  const [importoMin, setImportoMin] = useState("");
  const [importoMax, setImportoMax] = useState("");

  const [fatture, setFatture] = useState([]);
  const [total, setTotal] = useState(0);
  const [totaleImporto, setTotaleImporto] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [years, setYears] = useState([]);

  // Carica anni disponibili (una sola volta)
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`${FE}/fatture?limit=5000`);
        if (!res.ok) return;
        const json = await res.json();
        const list = json.fatture || json || [];
        const ySet = new Set();
        list.forEach((f) => {
          if (f.data_fattura) ySet.add(f.data_fattura.slice(0, 4));
        });
        setYears(Array.from(ySet).sort());
      } catch { /* ok */ }
    })();
  }, []);

  // Funzione di fetch — prende i filtri come parametri espliciti
  async function doFetch(opts = {}) {
    const s = opts.search ?? search;
    const y = opts.year ?? yearFilter;
    const m = opts.month ?? monthFilter;
    const forn = opts.fornitore ?? fornitoreFilter;
    const imin = opts.importoMin ?? importoMin;
    const imax = opts.importoMax ?? importoMax;
    const pg = opts.page ?? 0;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (s.trim()) params.set("search", s.trim());
      if (y) params.set("year", y);
      if (m) params.set("month", m);
      if (forn) params.set("fornitore", forn);
      if (imin) params.set("importo_min", imin);
      if (imax) params.set("importo_max", imax);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(pg * PAGE_SIZE));

      const url = `${FE}/fatture?${params.toString()}`;
      console.log("[FattureElenco] fetch:", url);

      const res = await apiFetch(url);
      if (!res.ok) {
        const errBody = await res.text();
        console.error("[FattureElenco] API error:", res.status, errBody);
        throw new Error(`Errore API: ${res.status}`);
      }

      const json = await res.json();
      console.log("[FattureElenco] response:", { total: json.total, n: (json.fatture || []).length });

      // Supporta sia il nuovo formato {fatture, total} che il vecchio [lista]
      if (Array.isArray(json)) {
        setFatture(json);
        setTotal(json.length);
        setTotaleImporto(json.reduce((s, f) => s + (f.totale_fattura || 0), 0));
      } else {
        setFatture(json.fatture || []);
        setTotal(json.total || 0);
        setTotaleImporto(json.totale_importo || 0);
      }
      setPage(pg);
    } catch (e) {
      console.error("[FattureElenco] fetch error:", e);
      setError(e.message || "Errore nel caricamento");
      setFatture([]);
      setTotal(0);
      setTotaleImporto(0);
    } finally {
      setLoading(false);
    }
  }

  // Fetch iniziale
  useEffect(() => {
    doFetch({ page: 0 });
  }, []);

  // Refetch quando cambiano i select (anno/mese)
  function handleYearChange(val) {
    setYearFilter(val);
    doFetch({ year: val, page: 0 });
  }
  function handleMonthChange(val) {
    setMonthFilter(val);
    doFetch({ month: val, page: 0 });
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const MESI = ["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

  const hasFilters = search || yearFilter || monthFilter || fornitoreFilter || importoMin || importoMax;

  function clearFilters() {
    setSearch("");
    setYearFilter("");
    setMonthFilter("");
    setFornitoreFilter("");
    setImportoMin("");
    setImportoMax("");
    doFetch({ search: "", year: "", month: "", fornitore: "", importoMin: "", importoMax: "", page: 0 });
  }

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
              {total} fatture — Totale: € {fmt(totaleImporto)}
            </p>
          </div>
        </div>

        {/* SEARCH + FILTERS */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doFetch({ page: 0 }); }}
                placeholder="Cerca per fornitore, P.IVA, numero fattura..."
                className="w-full text-sm border border-neutral-300 rounded-xl px-4 py-2.5 pr-10 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
              />
              <button
                onClick={() => doFetch({ page: 0 })}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-amber-100 hover:bg-amber-200 flex items-center justify-center text-amber-800 text-sm transition"
              >
                ⌕
              </button>
            </div>

            <select
              value={yearFilter}
              onChange={(e) => handleYearChange(e.target.value)}
              className="text-sm border border-neutral-300 rounded-xl px-3 py-2 bg-white"
            >
              <option value="">Tutti gli anni</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <select
              value={monthFilter}
              onChange={(e) => handleMonthChange(e.target.value)}
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

          {showFilters && (
            <div className="mt-3 pt-3 border-t border-neutral-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-neutral-500 font-medium uppercase tracking-wide">Importo min</label>
                <input type="number" value={importoMin} onChange={(e) => setImportoMin(e.target.value)}
                  placeholder="€ 0" className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-1.5 mt-1" />
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 font-medium uppercase tracking-wide">Importo max</label>
                <input type="number" value={importoMax} onChange={(e) => setImportoMax(e.target.value)}
                  placeholder="€ 99999" className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-1.5 mt-1" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-neutral-500 font-medium uppercase tracking-wide">Fornitore specifico</label>
                <input type="text" value={fornitoreFilter} onChange={(e) => setFornitoreFilter(e.target.value)}
                  placeholder="Nome esatto fornitore" className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-1.5 mt-1" />
              </div>
            </div>
          )}
        </div>

        {/* ERROR */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">
            {error}
          </div>
        )}

        {/* TABLE */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="text-center py-16 text-neutral-400 text-sm">Caricamento...</div>
          ) : fatture.length === 0 ? (
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
                    {fatture.map((f) => (
                      <tr
                        key={f.id}
                        className="border-b border-neutral-100 hover:bg-amber-50/40 cursor-pointer transition"
                        onClick={() => navigate(`/acquisti/dettaglio/${f.id}`)}
                      >
                        <td className="px-4 py-2.5 tabular-nums text-neutral-700 whitespace-nowrap">{f.data_fattura || "-"}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-neutral-800 truncate max-w-[250px]">{f.fornitore_nome || "-"}</div>
                        </td>
                        <td className="px-4 py-2.5 text-neutral-500 tabular-nums hidden sm:table-cell">{f.fornitore_piva || "-"}</td>
                        <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{f.numero_fattura || "-"}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-neutral-900 tabular-nums whitespace-nowrap">€ {fmt(f.totale_fattura)}</td>
                        <td className="px-4 py-2.5 text-center"><span className="text-amber-500 text-sm">→</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100">
                  <p className="text-xs text-neutral-500">
                    Pagina {page + 1} di {totalPages} ({total} risultati)
                  </p>
                  <div className="flex gap-1">
                    <button disabled={page === 0} onClick={() => doFetch({ page: page - 1 })}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${page === 0 ? "bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed" : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"}`}>
                      ← Prec
                    </button>
                    <button disabled={page >= totalPages - 1} onClick={() => doFetch({ page: page + 1 })}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${page >= totalPages - 1 ? "bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed" : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"}`}>
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
