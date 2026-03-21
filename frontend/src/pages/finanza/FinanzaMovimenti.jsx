// @version: v1.0-finanza-movimenti
// Lista movimenti con doppia vista (analitico / finanziario) + filtri + expand descrizione
import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FinanzaNav from "./FinanzaNav";

const FC = `${API_BASE}/finanza`;

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const STATO_LABELS = { X: "Banca", C: "Contanti", "": "Da fare" };
const STATO_COLORS = {
  X: "bg-emerald-100 text-emerald-800",
  C: "bg-violet-100 text-violet-800",
  "": "bg-red-50 text-red-600",
};

export default function FinanzaMovimenti() {
  const isViewer = localStorage.getItem("role") === "viewer";
  const [movimenti, setMovimenti] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Vista
  const [vista, setVista] = useState("analitico");

  // Filtri
  const [dataDa, setDataDa] = useState("");
  const [dataA, setDataA] = useState("");
  const [filtroCat1, setFiltroCat1] = useState("");
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Ordinamento
  const [sortBy, setSortBy] = useState("data");
  const [sortDir, setSortDir] = useState("desc");

  // Expand
  const [expandedId, setExpandedId] = useState(null);

  // Valori unici per dropdown
  const [valori, setValori] = useState({});

  useEffect(() => {
    apiFetch(`${FC}/valori-unici`)
      .then((r) => r.json())
      .then(setValori)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadMovimenti();
  }, [dataDa, dataA, filtroCat1, filtroStato, filtroTipo, search, page, vista, sortBy, sortDir]);

  const loadMovimenti = async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams();
      p.set("vista", vista);
      p.set("limit", PAGE_SIZE);
      p.set("offset", page * PAGE_SIZE);
      if (dataDa) p.set("data_da", dataDa);
      if (dataA) p.set("data_a", dataA);
      if (filtroCat1) p.set("cat1", filtroCat1);
      if (filtroStato) p.set("stato", filtroStato);
      if (filtroTipo) p.set("tipo", filtroTipo);
      if (search) p.set("search", search);
      p.set("sort_by", sortBy);
      p.set("sort_dir", sortDir);

      const resp = await apiFetch(`${FC}/movimenti?${p}`);
      if (!resp.ok) throw new Error("Errore caricamento");
      const data = await resp.json();
      setMovimenti(data.movimenti);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const catList = vista === "finanziario" ? (valori.cat1_fin || []) : (valori.cat1 || []);
  const tipiList = vista === "finanziario" ? (valori.tipi_finanziario || []) : (valori.tipi_analitico || []);

  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir(col === "descrizione" ? "asc" : "desc");
    }
    setPage(0);
  };

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <span className="text-neutral-300 ml-0.5">&#8597;</span>;
    return <span className="text-violet-600 ml-0.5">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  const thClass = "pb-2 cursor-pointer hover:text-violet-700 select-none transition";

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <FinanzaNav current="movimenti" />
      <div className="max-w-7xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-3xl font-bold text-violet-900 tracking-wide font-playfair">
            Movimenti
          </h1>
          {/* Toggle vista */}
          <div className="flex rounded-lg overflow-hidden border border-violet-300">
            <button
              onClick={() => { setVista("analitico"); setPage(0); }}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                vista === "analitico" ? "bg-violet-600 text-white" : "bg-white text-violet-700 hover:bg-violet-50"
              }`}
            >
              Analitico
            </button>
            <button
              onClick={() => { setVista("finanziario"); setPage(0); }}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                vista === "finanziario" ? "bg-violet-600 text-white" : "bg-white text-violet-700 hover:bg-violet-50"
              }`}
            >
              Finanziario
            </button>
          </div>
        </div>
        <p className="text-neutral-600 text-sm mb-5">
          {total} movimenti — vista {vista === "analitico" ? "per competenza" : "per cassa"}
        </p>

        {/* Filtri */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input type="date" value={dataDa} onChange={(e) => { setDataDa(e.target.value); setPage(0); }} className="border rounded-lg px-2 py-1.5 text-sm" />
          <span className="text-neutral-400 text-xs">→</span>
          <input type="date" value={dataA} onChange={(e) => { setDataA(e.target.value); setPage(0); }} className="border rounded-lg px-2 py-1.5 text-sm" />

          <select value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value); setPage(0); }} className="border rounded-lg px-2 py-1.5 text-sm">
            <option value="">Tutti i tipi</option>
            {tipiList.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          <select value={filtroCat1} onChange={(e) => { setFiltroCat1(e.target.value); setPage(0); }} className="border rounded-lg px-2 py-1.5 text-sm max-w-[200px]">
            <option value="">Tutte le categorie</option>
            {catList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={filtroStato} onChange={(e) => { setFiltroStato(e.target.value); setPage(0); }} className="border rounded-lg px-2 py-1.5 text-sm">
            <option value="">Tutti gli stati</option>
            <option value="X">Banca (X)</option>
            <option value="C">Contanti (C)</option>
            <option value="pending">Da riconciliare</option>
          </select>

          <input
            type="text"
            placeholder="Cerca..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px]"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-12 text-neutral-500">Caricamento...</div>
        ) : movimenti.length === 0 ? (
          <div className="text-center py-12 text-neutral-500">Nessun movimento trovato.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-neutral-500 text-xs">
                    <th className={`${thClass} w-8`} onClick={() => toggleSort("stato")}>St.<SortIcon col="stato" /></th>
                    <th className={`${thClass} w-24`} onClick={() => toggleSort("data")}>Data<SortIcon col="data" /></th>
                    <th className={thClass} onClick={() => toggleSort("descrizione")}>Descrizione<SortIcon col="descrizione" /></th>
                    <th className={`${thClass} w-28`} onClick={() => toggleSort(vista === "finanziario" ? "cat1_fin" : "cat1")}>Cat.1<SortIcon col={vista === "finanziario" ? "cat1_fin" : "cat1"} /></th>
                    <th className={`${thClass} w-28`} onClick={() => toggleSort(vista === "finanziario" ? "cat2_fin" : "cat2")}>Cat.2<SortIcon col={vista === "finanziario" ? "cat2_fin" : "cat2"} /></th>
                    {vista === "finanziario" && <th className={`${thClass} w-32`} onClick={() => toggleSort("descrizione_finanziaria")}>Fin. Desc<SortIcon col="descrizione_finanziaria" /></th>}
                    <th className={`${thClass} w-24 text-right`} onClick={() => toggleSort("dare")}>Dare<SortIcon col="dare" /></th>
                    <th className={`${thClass} w-24 text-right`} onClick={() => toggleSort("avere")}>Avere<SortIcon col="avere" /></th>
                  </tr>
                </thead>
                <tbody>
                  {movimenti.map((m) => {
                    const isExpanded = expandedId === m.id;
                    const stato = m.stato || "";
                    const c1 = vista === "finanziario" ? m.cat1_fin : m.cat1;
                    const c2 = vista === "finanziario" ? m.cat2_fin : m.cat2;
                    return (
                      <tr
                        key={m.id}
                        className={`border-b border-neutral-100 transition ${isExpanded ? "bg-violet-50" : "hover:bg-neutral-50"}`}
                      >
                        <td className="py-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${STATO_COLORS[stato] || STATO_COLORS[""]}`}>
                            {stato || "—"}
                          </span>
                        </td>
                        <td className="py-2 text-xs text-neutral-500 whitespace-nowrap">{m.data}</td>
                        <td
                          className="py-2 text-xs cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : m.id)}
                        >
                          <div className={isExpanded ? "whitespace-normal break-words" : "truncate max-w-sm"}>
                            {m.descrizione}
                          </div>
                          {isExpanded && m.descrizione_estesa && (
                            <div className="text-[10px] text-neutral-400 mt-0.5">{m.descrizione_estesa}</div>
                          )}
                          {isExpanded && m.note && (
                            <div className="text-[10px] text-violet-600 mt-0.5">Note: {m.note}</div>
                          )}
                          {isExpanded && m.cat_debito && (
                            <div className="text-[10px] text-blue-600 mt-0.5">Debito: {m.cat_debito}</div>
                          )}
                          {isExpanded && vista === "analitico" && m.descrizione_finanziaria && (
                            <div className="text-[10px] text-violet-500 mt-0.5">Fin: {m.descrizione_finanziaria} ({m.mese_finanziario} {m.anno_finanziario})</div>
                          )}
                          {isExpanded && vista === "finanziario" && m.mese_analitico && (
                            <div className="text-[10px] text-violet-500 mt-0.5">Analitico: {m.tipo_analitico} — {m.mese_analitico} {m.anno_analitico}</div>
                          )}
                        </td>
                        <td className="py-2 text-xs text-neutral-600">{c1}</td>
                        <td className="py-2 text-xs text-neutral-400">{c2}</td>
                        {vista === "finanziario" && (
                          <td className="py-2 text-[10px] text-violet-600">{m.descrizione_finanziaria}</td>
                        )}
                        <td className={`py-2 text-xs text-right font-mono ${m.dare < 0 ? "text-red-600 font-semibold" : "text-neutral-400"}`}>
                          {m.dare !== 0 ? fmt(m.dare) : ""}
                        </td>
                        <td className={`py-2 text-xs text-right font-mono ${m.avere > 0 ? "text-emerald-700 font-semibold" : "text-neutral-400"}`}>
                          {m.avere !== 0 ? fmt(m.avere) : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button disabled={page === 0} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded-lg text-sm border disabled:opacity-40">←</button>
                <span className="text-sm text-neutral-500">Pagina {page + 1} di {totalPages}</span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded-lg text-sm border disabled:opacity-40">→</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
