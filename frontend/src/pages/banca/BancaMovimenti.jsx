// @version: v1.0-banca-movimenti
// Lista movimenti bancari con filtri
import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import BancaNav from "./BancaNav";

const FC = `${API_BASE}/banca`;

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

export default function BancaMovimenti() {
  const [movimenti, setMovimenti] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtri
  const [dataDa, setDataDa] = useState("");
  const [dataA, setDataA] = useState("");
  const [categoria, setCategoria] = useState("");
  const [tipo, setTipo] = useState(""); // "" | entrata | uscita
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Categorie disponibili
  const [categorie, setCategorie] = useState([]);

  useEffect(() => {
    apiFetch(`${FC}/categorie`)
      .then((r) => r.json())
      .then((data) => {
        const cats = [...new Set(data.map((c) => c.categoria_banca))].sort();
        setCategorie(cats);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadMovimenti();
  }, [dataDa, dataA, categoria, tipo, search, page]);

  const loadMovimenti = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (dataDa) params.set("data_da", dataDa);
      if (dataA) params.set("data_a", dataA);
      if (categoria) params.set("categoria", categoria);
      if (tipo) params.set("tipo", tipo);
      if (search) params.set("search", search);
      params.set("limit", PAGE_SIZE);
      params.set("offset", page * PAGE_SIZE);

      const resp = await apiFetch(`${FC}/movimenti?${params}`);
      if (!resp.ok) throw new Error("Errore caricamento movimenti");
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

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <BancaNav current="movimenti" />
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">
        <h1 className="text-3xl font-bold text-emerald-900 tracking-wide font-playfair mb-1">
          Movimenti Bancari
        </h1>
        <p className="text-neutral-600 text-sm mb-6">
          {total} movimenti totali.
        </p>

        {/* Filtri */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="date"
            value={dataDa}
            onChange={(e) => { setDataDa(e.target.value); setPage(0); }}
            className="border rounded-lg px-2 py-1.5 text-sm"
          />
          <span className="text-neutral-400 text-xs">→</span>
          <input
            type="date"
            value={dataA}
            onChange={(e) => { setDataA(e.target.value); setPage(0); }}
            className="border rounded-lg px-2 py-1.5 text-sm"
          />

          <select
            value={tipo}
            onChange={(e) => { setTipo(e.target.value); setPage(0); }}
            className="border rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="">Tutti</option>
            <option value="entrata">Solo entrate</option>
            <option value="uscita">Solo uscite</option>
          </select>

          <select
            value={categoria}
            onChange={(e) => { setCategoria(e.target.value); setPage(0); }}
            className="border rounded-lg px-2 py-1.5 text-sm max-w-xs"
          >
            <option value="">Tutte le categorie</option>
            {categorie.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Cerca descrizione..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px]"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-neutral-500">Caricamento...</div>
        ) : movimenti.length === 0 ? (
          <div className="text-center py-12 text-neutral-500">
            Nessun movimento trovato con i filtri attuali.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-neutral-500 text-xs">
                    <th className="pb-2 w-24">Data</th>
                    <th className="pb-2">Descrizione</th>
                    <th className="pb-2 w-40">Categoria</th>
                    <th className="pb-2 w-28 text-right">Importo</th>
                  </tr>
                </thead>
                <tbody>
                  {movimenti.map((m) => (
                    <tr key={m.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition">
                      <td className="py-2.5 text-xs text-neutral-500 whitespace-nowrap">{m.data_contabile}</td>
                      <td className="py-2.5 text-xs" title={m.descrizione}>
                        <div className="truncate max-w-md">{m.descrizione}</div>
                        {m.categoria_custom && (
                          <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ backgroundColor: m.cat_colore + "20", color: m.cat_colore }}>
                            {m.cat_icona} {m.categoria_custom}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-xs text-neutral-500">
                        <div>{m.categoria_banca}</div>
                        {m.sottocategoria_banca && (
                          <div className="text-[10px] text-neutral-400">{m.sottocategoria_banca}</div>
                        )}
                      </td>
                      <td className={`py-2.5 text-xs text-right font-mono font-semibold whitespace-nowrap ${
                        m.importo >= 0 ? "text-emerald-700" : "text-red-600"
                      }`}>
                        {m.importo >= 0 ? "+" : ""}{fmt(m.importo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginazione */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  className="px-3 py-1 rounded-lg text-sm border disabled:opacity-40"
                >
                  ←
                </button>
                <span className="text-sm text-neutral-500">
                  Pagina {page + 1} di {totalPages}
                </span>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                  className="px-3 py-1 rounded-lg text-sm border disabled:opacity-40"
                >
                  →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
