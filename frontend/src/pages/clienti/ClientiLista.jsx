// @version: v1.0-clienti-lista
// Lista clienti con ricerca, filtri sidebar, paginazione
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";

function SortTh({ label, sort, setSort, col, align }) {
  const active = sort.field === col;
  const arrow = active ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th className={`px-3 py-2 cursor-pointer select-none hover:text-teal-800 transition ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => setSort(prev => ({ field: col, dir: prev.field === col && prev.dir === "asc" ? "desc" : "asc" }))}>
      {label}{arrow}
    </th>
  );
}

function sortRows(rows, sort) {
  if (!sort.field) return rows;
  return [...rows].sort((a, b) => {
    let va = a[sort.field], vb = b[sort.field];
    if (va == null) va = "";
    if (vb == null) vb = "";
    if (typeof va === "number" && typeof vb === "number") return sort.dir === "asc" ? va - vb : vb - va;
    return sort.dir === "asc" ? String(va).localeCompare(String(vb), "it") : String(vb).localeCompare(String(va), "it");
  });
}

const PAGE_SIZE = 50;

export default function ClientiLista() {
  const navigate = useNavigate();
  const [clienti, setClienti] = useState([]);
  const [totale, setTotale] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState([]);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Filtri
  const [q, setQ] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [tagFiltro, setTagFiltro] = useState("");
  const [rankFiltro, setRankFiltro] = useState("");
  const [mostraInattivi, setMostraInattivi] = useState(false);
  const [offset, setOffset] = useState(0);

  // Ordinamento
  const [sort, setSort] = useState({ col: "cognome", asc: true });

  const fetchClienti = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (vipOnly) params.set("vip", "true");
      if (tagFiltro) params.set("tag_id", tagFiltro);
      if (rankFiltro) params.set("rank", rankFiltro);
      params.set("attivo", mostraInattivi ? "" : "true");
      params.set("limit", PAGE_SIZE);
      params.set("offset", offset);
      params.set("ordine", `${sort.col}_${sort.asc ? "asc" : "desc"}`);

      // Rimuovi parametri vuoti
      for (const [k, v] of [...params.entries()]) {
        if (!v) params.delete(k);
      }

      const res = await apiFetch(`${API_BASE}/clienti/?${params}`);
      const data = await res.json();
      setClienti(data.clienti || []);
      setTotale(data.totale || 0);
    } catch (err) {
      setToast({ show: true, message: "Errore caricamento clienti", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [q, vipOnly, tagFiltro, rankFiltro, mostraInattivi, offset, sort]);

  useEffect(() => {
    fetchClienti();
  }, [fetchClienti]);

  useEffect(() => {
    apiFetch(`${API_BASE}/clienti/tag/lista`)
      .then((r) => r.json())
      .then((data) => setTags(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Reset offset quando cambiano filtri
  useEffect(() => {
    setOffset(0);
  }, [q, vipOnly, tagFiltro, rankFiltro, mostraInattivi]);

  const pagina = Math.floor(offset / PAGE_SIZE) + 1;
  const totalePagine = Math.ceil(totale / PAGE_SIZE);

  const fmt = (v) => (v != null && v !== "" ? v : "—");

  return (
    <>
      <ClientiNav current="lista" />
      <div className="min-h-screen bg-neutral-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">📇 Anagrafica Clienti</h1>
              <p className="text-sm text-neutral-500 mt-1">
                {totale.toLocaleString("it-IT")} client{totale === 1 ? "e" : "i"} trovat{totale === 1 ? "o" : "i"}
              </p>
            </div>
            <button
              onClick={() => navigate("/clienti/nuovo")}
              className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition"
            >
              + Nuovo Cliente
            </button>
          </div>

          <div className="flex gap-6">
            {/* SIDEBAR FILTRI */}
            <div className="w-56 flex-shrink-0 hidden lg:block">
              <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm space-y-4">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Filtri</h3>

                {/* Ricerca */}
                <div>
                  <label className="text-xs text-neutral-600 font-medium">Cerca</label>
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Nome, cognome, tel..."
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-300 focus:border-teal-400 outline-none"
                  />
                </div>

                {/* VIP */}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vipOnly}
                    onChange={(e) => setVipOnly(e.target.checked)}
                    className="rounded border-neutral-300 text-teal-600 focus:ring-teal-500"
                  />
                  Solo VIP ⭐
                </label>

                {/* Rank */}
                <div>
                  <label className="text-xs text-neutral-600 font-medium">Rank</label>
                  <select
                    value={rankFiltro}
                    onChange={(e) => setRankFiltro(e.target.value)}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="">Tutti</option>
                    <option value="Gold">Gold</option>
                    <option value="Silver">Silver</option>
                    <option value="Bronze">Bronze</option>
                    <option value="Caution">Caution</option>
                  </select>
                </div>

                {/* Tag */}
                <div>
                  <label className="text-xs text-neutral-600 font-medium">Tag</label>
                  <select
                    value={tagFiltro}
                    onChange={(e) => setTagFiltro(e.target.value)}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="">Tutti</option>
                    {tags.map((t) => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                </div>

                {/* Mostra inattivi */}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mostraInattivi}
                    onChange={(e) => setMostraInattivi(e.target.checked)}
                    className="rounded border-neutral-300 text-teal-600 focus:ring-teal-500"
                  />
                  Mostra inattivi
                </label>

                {/* Reset */}
                <button
                  onClick={() => { setQ(""); setVipOnly(false); setTagFiltro(""); setRankFiltro(""); setMostraInattivi(false); }}
                  className="w-full text-xs text-neutral-500 hover:text-neutral-700 transition py-1"
                >
                  Resetta filtri
                </button>
              </div>
            </div>

            {/* TABELLA */}
            <div className="flex-1 min-w-0">
              {/* Filtri mobile */}
              <div className="lg:hidden mb-4">
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cerca clienti..."
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                {loading ? (
                  <div className="p-12 text-center text-neutral-400">Caricamento...</div>
                ) : clienti.length === 0 ? (
                  <div className="p-12 text-center text-neutral-400">
                    Nessun cliente trovato. {!totale && "Importa da TheFork per iniziare!"}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <SortTh label="Cognome" sort={sort} setSort={setSort} col="cognome" />
                          <SortTh label="Nome" sort={sort} setSort={setSort} col="nome" />
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Telefono</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Email</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Tag</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-neutral-500">VIP</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {clienti.map((c) => (
                          <tr
                            key={c.id}
                            onClick={() => navigate(`/clienti/${c.id}`)}
                            className={`cursor-pointer hover:bg-teal-50 transition ${!c.attivo ? "opacity-50" : ""}`}
                          >
                            <td className="px-3 py-2.5 font-medium text-neutral-900">
                              {c.cognome}
                              {c.rank && (
                                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  c.rank === "Gold" ? "bg-yellow-100 text-yellow-700" :
                                  c.rank === "Silver" ? "bg-neutral-200 text-neutral-600" :
                                  c.rank === "Bronze" ? "bg-orange-100 text-orange-700" :
                                  "bg-red-100 text-red-600"
                                }`}>
                                  {c.rank}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-neutral-700">{c.nome}</td>
                            <td className="px-3 py-2.5 text-neutral-600 font-mono text-xs">{fmt(c.telefono)}</td>
                            <td className="px-3 py-2.5 text-neutral-600 text-xs max-w-[180px] truncate">{fmt(c.email)}</td>
                            <td className="px-3 py-2.5">
                              {c.tags && c.tags.split(", ").filter(Boolean).map((tag) => (
                                <span key={tag} className="inline-block text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full mr-1">
                                  {tag}
                                </span>
                              ))}
                            </td>
                            <td className="px-3 py-2.5 text-center">{c.vip ? "⭐" : ""}</td>
                            <td className="px-3 py-2.5 text-neutral-500 text-xs max-w-[200px] truncate">
                              {c.pref_cibo || c.allergie || c.note_thefork
                                ? (c.pref_cibo || c.allergie || c.note_thefork).substring(0, 60) + "..."
                                : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* PAGINAZIONE */}
                {totalePagine > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
                    <button
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                      className="text-xs px-3 py-1.5 rounded-lg border border-neutral-300 disabled:opacity-40 hover:bg-white transition"
                    >
                      ← Precedente
                    </button>
                    <span className="text-xs text-neutral-500">
                      Pagina {pagina} di {totalePagine}
                    </span>
                    <button
                      disabled={offset + PAGE_SIZE >= totale}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-neutral-300 disabled:opacity-40 hover:bg-white transition"
                    >
                      Successiva →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 ${
            toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
          }`}
          onClick={() => setToast({ ...toast, show: false })}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
