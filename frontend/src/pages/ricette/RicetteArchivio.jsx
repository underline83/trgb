// @version: v2.0-ricette-archivio
// Archivio Ricette — lista con food cost, filtri, azioni
// Allineato al backend v2 (foodcost_recipes_router)

import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const FC = `${API_BASE}/foodcost`;

// Badge food cost con colore dinamico
function FcBadge({ pct }) {
  if (pct == null) return <span className="text-xs text-neutral-400">—</span>;
  let color = "bg-green-100 text-green-800 border-green-300";
  if (pct > 35) color = "bg-yellow-100 text-yellow-800 border-yellow-300";
  if (pct > 45) color = "bg-red-100 text-red-800 border-red-300";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${color}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

export default function RicetteArchivio() {
  const navigate = useNavigate();

  const [ricette, setRicette] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtri
  const [search, setSearch] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("tutti"); // tutti | piatti | basi
  const [filtroCategoria, setFiltroCategoria] = useState("");

  // Caricamento
  const loadRicette = async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await apiFetch(`${FC}/ricette`);
      if (!resp.ok) throw new Error("Errore caricamento ricette");
      const data = await resp.json();
      setRicette(data || []);
    } catch (err) {
      console.error(err);
      setError("Impossibile caricare le ricette.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRicette();
  }, []);

  // Categorie uniche per filtro
  const categorie = useMemo(() => {
    const set = new Set();
    ricette.forEach((r) => r.category_name && set.add(r.category_name));
    return [...set].sort();
  }, [ricette]);

  // Filtraggio
  const filtered = useMemo(() => {
    return ricette.filter((r) => {
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filtroTipo === "piatti" && r.is_base) return false;
      if (filtroTipo === "basi" && !r.is_base) return false;
      if (filtroCategoria && r.category_name !== filtroCategoria) return false;
      return true;
    });
  }, [ricette, search, filtroTipo, filtroCategoria]);

  // Disattiva ricetta
  const handleDisattiva = async (id, nome) => {
    if (!window.confirm(`Disattivare "${nome}"?`)) return;
    try {
      const resp = await apiFetch(`${FC}/ricette/${id}`, { method: "DELETE" });
      if (!resp.ok) throw new Error("Errore");
      await loadRicette();
    } catch (err) {
      alert("Errore nella disattivazione.");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 sm:p-12 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-1">
              Archivio Ricette
            </h1>
            <p className="text-neutral-600 text-sm">
              {ricette.length} ricette totali &middot; {filtered.length} visualizzate
            </p>
          </div>
          <div className="flex gap-2 justify-center sm:justify-end flex-wrap">
            <button
              onClick={() => navigate("/ricette/nuova")}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow transition"
            >
              + Nuova ricetta
            </button>
            <button
              onClick={() => navigate("/ricette")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              &larr; Menu Ricette
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* FILTRI */}
        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 mb-6 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Cerca ricetta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[180px] focus:outline-none focus:ring-1 focus:ring-amber-500"
          />

          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="tutti">Tutti i tipi</option>
            <option value="piatti">Solo piatti</option>
            <option value="basi">Solo basi</option>
          </select>

          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">Tutte le categorie</option>
            {categorie.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* TABELLA */}
        {loading ? (
          <div className="text-center py-12 text-neutral-500">Caricamento...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-neutral-500">
            {ricette.length === 0 ? "Nessuna ricetta presente. Crea la prima!" : "Nessun risultato per i filtri selezionati."}
          </div>
        ) : (
          <div className="border border-neutral-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-100 text-neutral-700">
                  <tr>
                    <th className="p-3 text-left font-semibold">ID</th>
                    <th className="p-3 text-left font-semibold">Nome</th>
                    <th className="p-3 text-left font-semibold">Categoria</th>
                    <th className="p-3 text-center font-semibold">Tipo</th>
                    <th className="p-3 text-right font-semibold">Resa</th>
                    <th className="p-3 text-right font-semibold">Costo tot.</th>
                    <th className="p-3 text-right font-semibold">Costo/pz</th>
                    <th className="p-3 text-right font-semibold">Vendita</th>
                    <th className="p-3 text-center font-semibold">FC %</th>
                    <th className="p-3 text-right font-semibold">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-neutral-100 hover:bg-amber-50/40 transition cursor-pointer"
                      onClick={() => navigate(`/ricette/${r.id}`)}
                    >
                      <td className="p-3">
                        <span className="text-xs font-mono bg-slate-700 text-white px-1.5 py-0.5 rounded">
                          R{String(r.id).padStart(3, "0")}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-neutral-900">
                        {r.name}
                      </td>
                      <td className="p-3 text-neutral-600">
                        {r.category_name || "—"}
                      </td>
                      <td className="p-3 text-center">
                        {r.is_base ? (
                          <span className="text-xs bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 rounded-full font-semibold">
                            Base
                          </span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-semibold">
                            Piatto
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right text-neutral-700">
                        {r.yield_qty} {r.yield_unit}
                      </td>
                      <td className="p-3 text-right text-neutral-700">
                        {r.total_cost != null ? `${r.total_cost.toFixed(2)} \u20AC` : "—"}
                      </td>
                      <td className="p-3 text-right font-semibold text-neutral-900">
                        {r.cost_per_unit != null ? `${r.cost_per_unit.toFixed(2)} \u20AC` : "—"}
                      </td>
                      <td className="p-3 text-right text-neutral-700">
                        {r.selling_price != null ? `${r.selling_price.toFixed(2)} \u20AC` : "—"}
                      </td>
                      <td className="p-3 text-center">
                        <FcBadge pct={r.food_cost_pct} />
                      </td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => navigate(`/ricette/modifica/${r.id}`)}
                            className="px-2 py-1 text-xs bg-amber-100 text-amber-800 border border-amber-300 rounded hover:bg-amber-200 transition"
                          >
                            Modifica
                          </button>
                          <button
                            onClick={() => handleDisattiva(r.id, r.name)}
                            className="px-2 py-1 text-xs bg-red-100 text-red-800 border border-red-300 rounded hover:bg-red-200 transition"
                          >
                            Disattiva
                          </button>
                        </div>
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
  );
}
