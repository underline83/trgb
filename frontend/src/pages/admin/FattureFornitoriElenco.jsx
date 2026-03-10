// @version: v1.0-fornitori-elenco
// Elenco fornitori con ricerca, ordinamento, KPI e link a dettaglio
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const FE = `${API_BASE}/contabilita/fe`;
const fmt = (v) =>
  v != null
    ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";

export default function FattureFornitoriElenco() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [fornitori, setFornitori] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [year, setYear] = useState("");
  const [sortKey, setSortKey] = useState("totale_fatture");
  const [sortDir, setSortDir] = useState("desc");

  // Fetch fornitori
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const url = year
          ? `${FE}/stats/fornitori?year=${year}`
          : `${FE}/stats/fornitori`;
        const res = await apiFetch(url);
        if (!res.ok) throw new Error(`Errore API: ${res.status}`);
        const data = await res.json();
        setFornitori(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("[FornitoriElenco]", e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [year]);

  // Derive available years from data
  const years = useMemo(() => {
    const set = new Set();
    fornitori.forEach((f) => {
      if (f.primo_acquisto) set.add(f.primo_acquisto.substring(0, 4));
      if (f.ultimo_acquisto) set.add(f.ultimo_acquisto.substring(0, 4));
    });
    return [...set].sort().reverse();
  }, [fornitori]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = fornitori;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.fornitore_nome?.toLowerCase().includes(q) ||
          f.fornitore_piva?.toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (typeof va === "string") va = va?.toLowerCase() || "";
      if (typeof vb === "string") vb = vb?.toLowerCase() || "";
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [fornitori, search, sortKey, sortDir]);

  // KPI
  const totFornitori = filtered.length;
  const totSpesa = filtered.reduce((s, f) => s + (f.totale_fatture || 0), 0);
  const totFatture = filtered.reduce((s, f) => s + (f.numero_fatture || 0), 0);
  const mediaPerFornitore = totFornitori > 0 ? totSpesa / totFornitori : 0;

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "fornitore_nome" ? "asc" : "desc");
    }
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="fornitori" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-neutral-200">
          {/* HEADER */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-amber-900 font-playfair mb-1">
              Elenco Fornitori
            </h1>
            <p className="text-neutral-500 text-sm">
              Riepilogo fornitori con totali acquisti, numero fatture e date.
            </p>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Fornitori", value: totFornitori, bg: "bg-green-50 border-green-200" },
              { label: "Totale Spesa", value: `€ ${fmt(totSpesa)}`, bg: "bg-amber-50 border-amber-200" },
              { label: "Fatture", value: totFatture, bg: "bg-blue-50 border-blue-200" },
              { label: "Media/Fornitore", value: `€ ${fmt(mediaPerFornitore)}`, bg: "bg-purple-50 border-purple-200" },
            ].map((c) => (
              <div key={c.label} className={`rounded-xl border p-3 ${c.bg}`}>
                <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">{c.label}</p>
                <p className="text-lg font-bold text-neutral-900 font-playfair tabular-nums">{c.value}</p>
              </div>
            ))}
          </div>

          {/* FILTERS */}
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <input
              type="text"
              placeholder="Cerca fornitore o P.IVA..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 border border-neutral-300 rounded-xl text-sm w-64 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            {years.length > 0 && (
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="px-3 py-2 border border-neutral-300 rounded-xl text-sm"
              >
                <option value="">Tutti gli anni</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}
            <span className="text-xs text-neutral-500 ml-auto">
              {filtered.length} fornitore{filtered.length !== 1 ? "i" : ""} trovato{filtered.length !== 1 ? "i" : ""}
            </span>
          </div>

          {/* ERROR */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          {/* TABLE */}
          {loading ? (
            <p className="text-neutral-500 text-sm py-8 text-center">Caricamento fornitori...</p>
          ) : filtered.length === 0 ? (
            <p className="text-neutral-500 text-sm py-8 text-center">Nessun fornitore trovato.</p>
          ) : (
            <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="max-h-[65vh] overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50 text-neutral-600 sticky top-0">
                    <tr>
                      <th
                        className="px-4 py-2.5 text-left cursor-pointer hover:text-amber-700 select-none"
                        onClick={() => handleSort("fornitore_nome")}
                      >
                        Fornitore{sortIcon("fornitore_nome")}
                      </th>
                      <th className="px-4 py-2.5 text-left hidden sm:table-cell">P.IVA</th>
                      <th
                        className="px-4 py-2.5 text-right cursor-pointer hover:text-amber-700 select-none"
                        onClick={() => handleSort("numero_fatture")}
                      >
                        Fatture{sortIcon("numero_fatture")}
                      </th>
                      <th
                        className="px-4 py-2.5 text-right cursor-pointer hover:text-amber-700 select-none"
                        onClick={() => handleSort("totale_fatture")}
                      >
                        Totale €{sortIcon("totale_fatture")}
                      </th>
                      <th
                        className="px-4 py-2.5 text-center hidden md:table-cell cursor-pointer hover:text-amber-700 select-none"
                        onClick={() => handleSort("primo_acquisto")}
                      >
                        Primo{sortIcon("primo_acquisto")}
                      </th>
                      <th
                        className="px-4 py-2.5 text-center hidden md:table-cell cursor-pointer hover:text-amber-700 select-none"
                        onClick={() => handleSort("ultimo_acquisto")}
                      >
                        Ultimo{sortIcon("ultimo_acquisto")}
                      </th>
                      <th className="px-4 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((f, idx) => (
                      <tr
                        key={idx}
                        className="border-t border-neutral-200 hover:bg-amber-50/40 cursor-pointer transition"
                        onClick={() =>
                          navigate(
                            `/admin/fatture/fornitore/${encodeURIComponent(f.fornitore_piva || f.fornitore_nome)}`
                          )
                        }
                      >
                        <td className="px-4 py-2.5 font-medium text-neutral-900">
                          {f.fornitore_nome || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-neutral-500 text-xs hidden sm:table-cell font-mono">
                          {f.fornitore_piva || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {f.numero_fatture}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-amber-900">
                          € {fmt(f.totale_fatture)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs text-neutral-500 hidden md:table-cell">
                          {f.primo_acquisto || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs text-neutral-500 hidden md:table-cell">
                          {f.ultimo_acquisto || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center text-neutral-400">
                          →
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
