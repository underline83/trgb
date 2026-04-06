// @version: v2.0-clienti-lista
// Lista clienti — estetica ispirata a Cantina, colonna prenotazioni, click → dettaglio
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";

// ── Colori rank (stile badge Cantina) ────────────────────
const RANK_COLORS = {
  Gold:    { row: "bg-yellow-50/60", badge: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  Silver:  { row: "bg-neutral-50/60", badge: "bg-neutral-200 text-neutral-700 border-neutral-300" },
  Bronze:  { row: "bg-orange-50/60", badge: "bg-orange-100 text-orange-700 border-orange-300" },
  Caution: { row: "bg-red-50/60", badge: "bg-red-100 text-red-700 border-red-300" },
};
const rankBadge = (rank) => RANK_COLORS[rank]?.badge || "bg-neutral-100 text-neutral-600 border-neutral-200";

// ── Sort colonna ─────────────────────────────────────────
function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <span className="text-neutral-300 ml-0.5">↕</span>;
  return <span className="text-teal-600 ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

const PAGE_SIZE = 50;

export default function ClientiLista() {
  const navigate = useNavigate();
  const [clienti, setClienti] = useState([]);
  const [totale, setTotale] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState([]);

  // Filtri
  const [q, setQ] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [tagFiltro, setTagFiltro] = useState("");
  const [rankFiltro, setRankFiltro] = useState("");
  const [mostraInattivi, setMostraInattivi] = useState(false);
  const [offset, setOffset] = useState(0);

  // Ordinamento
  const [sortKey, setSortKey] = useState("cognome");
  const [sortDir, setSortDir] = useState("asc");
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

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
      params.set("ordine", `${sortKey}_${sortDir}`);

      for (const [k, v] of [...params.entries()]) {
        if (!v) params.delete(k);
      }

      const res = await apiFetch(`${API_BASE}/clienti/?${params}`);
      const data = await res.json();
      setClienti(data.clienti || []);
      setTotale(data.totale || 0);
    } catch (err) {
      console.error("Errore caricamento clienti", err);
    } finally {
      setLoading(false);
    }
  }, [q, vipOnly, tagFiltro, rankFiltro, mostraInattivi, offset, sortKey, sortDir]);

  useEffect(() => { fetchClienti(); }, [fetchClienti]);

  useEffect(() => {
    apiFetch(`${API_BASE}/clienti/tag/lista`)
      .then((r) => r.json())
      .then((data) => setTags(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => { setOffset(0); }, [q, vipOnly, tagFiltro, rankFiltro, mostraInattivi]);

  // Riepilogo per rank (stile Cantina riepilogo tipologie)
  const riepilogo = useMemo(() => {
    const counts = {};
    clienti.forEach(c => {
      const r = c.rank || "Nessuno";
      counts[r] = (counts[r] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [clienti]);

  const pagina = Math.floor(offset / PAGE_SIZE) + 1;
  const totalePagine = Math.ceil(totale / PAGE_SIZE);

  const sel = "w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-300";
  const lbl = "block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5";

  return (
    <>
      <ClientiNav current="lista" />
      <div className="min-h-screen bg-neutral-100 font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">

          {/* ── HEADER ── */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Anagrafica Clienti</h1>
              <p className="text-xs text-neutral-500 mt-0.5">
                {totale.toLocaleString("it-IT")} client{totale === 1 ? "e" : "i"}
              </p>
            </div>
            <button onClick={() => navigate("/clienti/nuovo")}
              className="bg-teal-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-800 shadow-sm transition">
              + Nuovo Cliente
            </button>
          </div>

          {/* ── FILTRI (stile Cantina: row compatta) ── */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className={lbl}>Cerca</label>
                <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Nome, cognome, tel, email..."
                  className={sel} />
              </div>
              <div>
                <label className={lbl}>Rank</label>
                <select value={rankFiltro} onChange={(e) => setRankFiltro(e.target.value)} className={sel}>
                  <option value="">Tutti</option>
                  <option value="Gold">Gold</option>
                  <option value="Silver">Silver</option>
                  <option value="Bronze">Bronze</option>
                  <option value="Caution">Caution</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Tag</label>
                <select value={tagFiltro} onChange={(e) => setTagFiltro(e.target.value)} className={sel}>
                  <option value="">Tutti</option>
                  {tags.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs text-neutral-700 cursor-pointer whitespace-nowrap">
                  <input type="checkbox" checked={vipOnly} onChange={(e) => setVipOnly(e.target.checked)}
                    className="rounded border-neutral-400 text-teal-600 focus:ring-teal-500" />
                  Solo VIP
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs text-neutral-700 cursor-pointer whitespace-nowrap">
                  <input type="checkbox" checked={mostraInattivi} onChange={(e) => setMostraInattivi(e.target.checked)}
                    className="rounded border-neutral-400 text-teal-600 focus:ring-teal-500" />
                  Inattivi
                </label>
              </div>
              <div className="flex items-end">
                <button onClick={() => { setQ(""); setVipOnly(false); setTagFiltro(""); setRankFiltro(""); setMostraInattivi(false); }}
                  className="text-[11px] text-neutral-500 hover:text-neutral-700 transition underline">
                  Resetta
                </button>
              </div>
            </div>
          </div>

          {/* ── RIEPILOGO RANK (badges stile Cantina) ── */}
          {riepilogo.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {riepilogo.map(([rank, count]) => (
                <button key={rank}
                  onClick={() => setRankFiltro(rankFiltro === rank ? "" : (rank === "Nessuno" ? "" : rank))}
                  className={`text-[11px] px-2 py-0.5 rounded-full border font-medium transition ${
                    rank !== "Nessuno" ? rankBadge(rank) : "bg-neutral-100 text-neutral-600 border-neutral-200"
                  } ${rankFiltro === rank ? "ring-2 ring-teal-400" : "hover:opacity-80"}`}>
                  {rank} ({count})
                </button>
              ))}
            </div>
          )}

          {/* ── TABELLA ── */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-16 text-center text-neutral-400 text-sm">Caricamento...</div>
            ) : clienti.length === 0 ? (
              <div className="p-16 text-center text-neutral-400 text-sm">
                Nessun cliente trovato.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">
                      <th className="px-3 py-2.5 text-left cursor-pointer select-none hover:text-teal-700" onClick={() => handleSort("cognome")}>
                        Cognome <SortIcon col="cognome" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th className="px-3 py-2.5 text-left cursor-pointer select-none hover:text-teal-700" onClick={() => handleSort("nome")}>
                        Nome <SortIcon col="nome" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th className="px-3 py-2.5 text-left">Telefono</th>
                      <th className="px-3 py-2.5 text-left hidden md:table-cell">Email</th>
                      <th className="px-3 py-2.5 text-left hidden lg:table-cell">Tag</th>
                      <th className="px-3 py-2.5 text-center w-12">VIP</th>
                      <th className="px-3 py-2.5 text-center cursor-pointer select-none hover:text-teal-700 w-16" onClick={() => handleSort("n_prenotazioni")}>
                        Pren. <SortIcon col="n_prenotazioni" sortKey={sortKey} sortDir={sortDir} />
                      </th>
                      <th className="px-3 py-2.5 text-left hidden xl:table-cell">Ultima visita</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {clienti.map((c) => {
                      const rowColor = c.rank ? (RANK_COLORS[c.rank]?.row || "") : "";
                      return (
                        <tr key={c.id}
                          onClick={() => navigate(`/clienti/${c.id}`)}
                          className={`cursor-pointer hover:bg-teal-50/80 transition ${rowColor} ${!c.attivo ? "opacity-40" : ""}`}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-neutral-900">{c.cognome}</span>
                              {c.rank && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${rankBadge(c.rank)}`}>
                                  {c.rank}
                                </span>
                              )}
                              {c.protetto === 1 && (
                                <span className="text-[10px] text-teal-500" title="Protetto da import">🛡</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-neutral-700">{c.nome}</td>
                          <td className="px-3 py-2.5 text-neutral-600 font-mono text-xs whitespace-nowrap">{c.telefono || "—"}</td>
                          <td className="px-3 py-2.5 text-neutral-500 text-xs max-w-[180px] truncate hidden md:table-cell">{c.email || "—"}</td>
                          <td className="px-3 py-2.5 hidden lg:table-cell">
                            {c.tags && c.tags.split(", ").filter(Boolean).map((tag) => (
                              <span key={tag} className="inline-block text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full mr-0.5 mb-0.5 border border-teal-200">
                                {tag}
                              </span>
                            ))}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {c.vip ? <span className="text-sm">⭐</span> : ""}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {c.n_prenotazioni > 0 ? (
                              <span className={`text-xs font-bold ${
                                c.n_prenotazioni >= 10 ? "text-teal-700" :
                                c.n_prenotazioni >= 3 ? "text-neutral-700" :
                                "text-neutral-400"
                              }`}>
                                {c.n_prenotazioni}
                              </span>
                            ) : (
                              <span className="text-neutral-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-neutral-500 hidden xl:table-cell whitespace-nowrap">
                            {c.ultima_visita || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── PAGINAZIONE ── */}
            {totalePagine > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-neutral-200 bg-neutral-50">
                <button disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="text-xs px-3 py-1.5 rounded-lg border border-neutral-300 disabled:opacity-40 hover:bg-white transition font-medium">
                  ← Precedente
                </button>
                <span className="text-xs text-neutral-500">
                  Pagina {pagina} di {totalePagine}
                </span>
                <button disabled={offset + PAGE_SIZE >= totale}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-neutral-300 disabled:opacity-40 hover:bg-white transition font-medium">
                  Successiva →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
