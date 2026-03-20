// src/pages/vini/RegistroMovimenti.jsx
// @version: v1.0
// Registro globale movimenti cantina — visibile solo admin

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ViniNav from "./ViniNav";

const TIPO_LABELS = {
  CARICO:    { label: "Carico",    icon: "⬆️", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  SCARICO:   { label: "Scarico",   icon: "⬇️", cls: "bg-red-50 text-red-700 border-red-200" },
  VENDITA:   { label: "Vendita",   icon: "🛒", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  RETTIFICA: { label: "Rettifica", icon: "✏️", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  MODIFICA:  { label: "Modifica",  icon: "🔧", cls: "bg-blue-50 text-blue-700 border-blue-200" },
};

const PAGE_SIZE = 50;

export default function RegistroMovimenti() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  // Filtri
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [textFiltro, setTextFiltro] = useState("");
  const [dataDa, setDataDa] = useState("");
  const [dataA, setDataA] = useState("");

  // Dati
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async (pageNum = 0) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (tipoFiltro) params.set("tipo", tipoFiltro);
      if (textFiltro.trim()) params.set("text", textFiltro.trim());
      if (dataDa) params.set("data_da", dataDa);
      if (dataA) params.set("data_a", dataA);
      params.set("limit", PAGE_SIZE);
      params.set("offset", pageNum * PAGE_SIZE);

      const resp = await apiFetch(`${API_BASE}/vini/magazzino/movimenti-globali?${params}`);
      if (!resp.ok) throw new Error(`Errore server: ${resp.status}`);
      const data = await resp.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPage(pageNum);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tipoFiltro, textFiltro, dataDa, dataA]);

  useEffect(() => {
    fetchData(0);
  }, [fetchData]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Accesso negato per non-admin
  if (role !== "admin") {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 font-sans flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-xl p-10 text-center max-w-md">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-neutral-800 mb-2">Accesso negato</h1>
          <p className="text-neutral-600 text-sm">Questa sezione è riservata agli amministratori.</p>
          <button type="button" onClick={() => navigate("/vini/magazzino")}
            className="mt-6 px-5 py-2 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 transition">
            ← Torna alla Cantina
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <ViniNav current="cantina" />
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📋 Registro Movimenti
            </h1>
            <p className="text-neutral-600">
              Log completo di tutti i movimenti della cantina.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
              ← Cantina
            </button>
          </div>
        </div>


        {/* FILTRI */}
        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 mb-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300">
              <option value="">Tutti i tipi</option>
              <option value="CARICO">⬆️ Carico</option>
              <option value="SCARICO">⬇️ Scarico</option>
              <option value="VENDITA">🛒 Vendita</option>
              <option value="RETTIFICA">✏️ Rettifica</option>
              <option value="MODIFICA">🔧 Modifica</option>
            </select>

            <input type="text" placeholder="Cerca vino, produttore…" value={textFiltro}
              onChange={e => setTextFiltro(e.target.value)}
              className="md:col-span-2 border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />

            <input type="date" value={dataDa} onChange={e => setDataDa(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />

            <input type="date" value={dataA} onChange={e => setDataA(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">
              {total} moviment{total === 1 ? "o" : "i"} trovat{total === 1 ? "o" : "i"}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => {
                setTipoFiltro(""); setTextFiltro(""); setDataDa(""); setDataA("");
              }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100 transition">
                ✕ Pulisci filtri
              </button>
              <button type="button" onClick={() => fetchData(0)}
                disabled={loading}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  loading ? "bg-gray-300 text-gray-500" : "bg-amber-700 text-white hover:bg-amber-800"
                }`}>
                {loading ? "Carico…" : "⟳ Aggiorna"}
              </button>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {/* TABELLA */}
        <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 sticky top-0 z-10">
                <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-center">Tipo</th>
                  <th className="px-3 py-2 text-center">Qtà</th>
                  <th className="px-3 py-2 text-left">Vino</th>
                  <th className="px-3 py-2 text-left">Locazione</th>
                  <th className="px-3 py-2 text-left">Note</th>
                  <th className="px-3 py-2 text-left">Utente</th>
                </tr>
              </thead>
              <tbody>
                {items.map(m => {
                  const t = TIPO_LABELS[m.tipo] ?? { label: m.tipo, icon: "", cls: "" };
                  return (
                    <tr key={m.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition">
                      <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                        {m.data_mov?.slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${t.cls}`}>
                          {t.icon} {t.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-semibold">{m.tipo === "MODIFICA" ? "—" : m.qta}</td>
                      <td className="px-3 py-2">
                        <div
                          className="cursor-pointer hover:text-amber-700 transition"
                          onClick={() => navigate(`/vini/magazzino/${m.vino_id}`)}
                        >
                          <span className="inline-flex items-center bg-slate-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-mono tracking-tight mr-1.5">
                            #{m.vino_id}
                          </span>
                          <span className="font-medium text-neutral-900">{m.vino_desc}</span>
                          {m.vino_produttore && (
                            <span className="text-xs text-neutral-400 ml-1">— {m.vino_produttore}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-600">{m.locazione || "—"}</td>
                      <td className="px-3 py-2 text-xs text-neutral-700">{m.note || ""}</td>
                      <td className="px-3 py-2 text-xs text-neutral-500 font-medium">{m.utente || "—"}</td>
                    </tr>
                  );
                })}
                {items.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-neutral-500">
                      Nessun movimento trovato con i filtri selezionati.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* PAGINAZIONE */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <button type="button" onClick={() => fetchData(page - 1)} disabled={page === 0}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 transition disabled:opacity-40">
              ← Precedente
            </button>
            <span className="text-xs text-neutral-500">
              Pagina {page + 1} di {totalPages}
            </span>
            <button type="button" onClick={() => fetchData(page + 1)} disabled={page >= totalPages - 1}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 transition disabled:opacity-40">
              Successiva →
            </button>
          </div>
        )}

      </div>
      </div>
    </div>
  );
}
