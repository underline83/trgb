// src/pages/vini/DashboardVini.jsx
// @version: v2.1-drilldown
// Dashboard Vini — KPI, alert, ultimi movimenti, distribuzione tipologie

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

// ─────────────────────────────────────────────────────────────
// COSTANTI
// ─────────────────────────────────────────────────────────────
const TIPO_COLORS = {
  CARICO:    "bg-emerald-100 text-emerald-800 border-emerald-200",
  SCARICO:   "bg-red-100    text-red-800    border-red-200",
  VENDITA:   "bg-violet-100 text-violet-800 border-violet-200",
  RETTIFICA: "bg-amber-100  text-amber-800  border-amber-200",
};

const TIPO_EMOJI = {
  CARICO:    "⬆️",
  SCARICO:   "⬇️",
  VENDITA:   "🛒",
  RETTIFICA: "✏️",
};

function formatDate(isoStr) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPALE
// ─────────────────────────────────────────────────────────────
export default function DashboardVini() {
  const navigate = useNavigate();

  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [drilldown, setDrilldown] = useState(null); // null | "senza_listino"

  const toggleDrilldown = (key) =>
    setDrilldown((prev) => (prev === key ? null : key));

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/dashboard`);
      if (!resp.ok) throw new Error(`Errore server: ${resp.status}`);
      const data = await resp.json();
      setStats(data);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.message || "Errore caricamento dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ── KPI tiles — riga stock ─────────────────────────────────
  const kpiStock = stats
    ? [
        {
          label:   "Bottiglie in cantina",
          value:   stats.total_bottiglie,
          icon:    "🍾",
          color:   "bg-amber-50 border-amber-200 text-amber-900",
          sub:     `su ${stats.total_vini} referenze`,
        },
        {
          label:   "Vini in carta",
          value:   stats.vini_in_carta,
          icon:    "📋",
          color:   "bg-emerald-50 border-emerald-200 text-emerald-900",
          sub:     `${stats.total_vini > 0 ? Math.round((stats.vini_in_carta / stats.total_vini) * 100) : 0}% del catalogo`,
        },
        {
          label:   "Senza prezzo listino",
          value:   stats.vini_senza_listino,
          icon:    "⚠️",
          color:   stats.vini_senza_listino > 0
                     ? "bg-orange-50 border-orange-200 text-orange-900"
                     : "bg-neutral-50 border-neutral-200 text-neutral-700",
          sub:     stats.vini_senza_listino > 0 ? "clicca per vedere la lista" : "tutto ok",
          drilldownKey: "senza_listino",
          clickable: stats.vini_senza_listino > 0,
        },
        {
          label:   "Vini fermi (30gg)",
          value:   stats.vini_fermi?.length ?? 0,
          icon:    "💤",
          color:   (stats.vini_fermi?.length ?? 0) > 0
                     ? "bg-slate-50 border-slate-300 text-slate-800"
                     : "bg-neutral-50 border-neutral-200 text-neutral-700",
          sub:     (stats.vini_fermi?.length ?? 0) > 0 ? "in cantina, senza movimenti" : "tutto si muove",
          drilldownKey: "vini_fermi",
          clickable: (stats.vini_fermi?.length ?? 0) > 0,
        },
      ]
    : [];

  // ── KPI tiles — riga vendite ───────────────────────────────
  const kpiVendite = stats
    ? [
        {
          label:   "Vendute ultimi 7gg",
          value:   stats.vendute_7gg ?? 0,
          icon:    "🛒",
          color:   "bg-violet-50 border-violet-200 text-violet-900",
          sub:     "bottiglie",
        },
        {
          label:   "Vendute ultimi 30gg",
          value:   stats.vendute_30gg ?? 0,
          icon:    "📈",
          color:   "bg-violet-50 border-violet-200 text-violet-900",
          sub:     "bottiglie",
        },
      ]
    : [];

  // ── distribuzione max per scala barre ─────────────────────
  const maxBottiglie = stats?.distribuzione_tipologie?.length
    ? Math.max(...stats.distribuzione_tipologie.map((d) => d.tot_bottiglie))
    : 1;

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── HEADER ───────────────────────────────────────── */}
        <div className="bg-white shadow-2xl rounded-3xl px-8 py-6 border border-neutral-200">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair">
                📊 Dashboard Cantina
              </h1>
              <p className="text-neutral-500 text-sm mt-1">
                Situazione operativa in tempo reale.
                {lastUpdate && (
                  <span className="ml-2 text-neutral-400">
                    Aggiornato alle {lastUpdate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={fetchStats}
                disabled={loading}
                className={`px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition ${
                  loading
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-amber-700 text-white hover:bg-amber-800 hover:-translate-y-0.5"
                }`}
              >
                {loading ? "Carico…" : "⟳ Aggiorna"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/vini")}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 transition"
              >
                ← Menu Vini
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* ── ALERT: VINI IN CARTA SENZA GIACENZA ─────────── */}
        {stats?.alert_carta_senza_giacenza?.length > 0 && (
          <div className="bg-white rounded-3xl border border-red-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-red-50 border-b border-red-200 flex items-center gap-3">
              <span className="text-xl">🚨</span>
              <div>
                <div className="font-semibold text-red-800">
                  {stats.alert_carta_senza_giacenza.length}{" "}
                  {stats.alert_carta_senza_giacenza.length === 1
                    ? "vino con flag CARTA=SI e giacenza zero"
                    : "vini con flag CARTA=SI e giacenza zero"}
                </div>
                <div className="text-xs text-red-600 mt-0.5">
                  Marcati per la carta nel database ma senza bottiglie disponibili — da riordinare o da escludere dalla carta.
                </div>
              </div>
            </div>
            <div className="divide-y divide-neutral-100 max-h-56 overflow-auto">
              {stats.alert_carta_senza_giacenza.map((v) => (
                <div
                  key={v.id}
                  className="px-6 py-3 flex items-center justify-between hover:bg-red-50 cursor-pointer transition"
                  onClick={() => navigate(`/vini/magazzino/${v.id}`)}
                >
                  <div>
                    <span className="inline-flex items-center bg-slate-700 text-white text-[11px] font-bold px-2 py-0.5 rounded font-mono tracking-tight mr-2">#{v.id}</span>
                    <span className="font-semibold text-neutral-900 text-sm">{v.DESCRIZIONE}</span>
                    {v.ANNATA && <span className="ml-2 text-xs text-neutral-500">{v.ANNATA}</span>}
                    {v.PRODUTTORE && (
                      <span className="ml-2 text-xs text-neutral-500">— {v.PRODUTTORE}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
                      {v.TIPOLOGIA}
                    </span>
                    <span className="text-xs text-red-600 font-semibold">0 bt</span>
                    <span className="text-neutral-400 text-xs">→</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── KPI TILES ────────────────────────────────────── */}
        {loading && !stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-5 animate-pulse">
                <div className="h-4 bg-neutral-200 rounded w-2/3 mb-3" />
                <div className="h-8 bg-neutral-200 rounded w-1/2 mb-2" />
                <div className="h-3 bg-neutral-100 rounded w-3/4" />
              </div>
            ))}
          </div>
        )}

        {stats && (
          <div className="space-y-4">

          {/* riga stock */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpiStock.map((tile) => (
              <div
                key={tile.label}
                onClick={() => tile.clickable && toggleDrilldown(tile.drilldownKey)}
                className={`rounded-2xl border p-5 shadow-sm transition
                  ${tile.color}
                  ${tile.clickable ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""}
                  ${drilldown === tile.drilldownKey ? "ring-2 ring-orange-400" : ""}
                `}
              >
                <div className="flex justify-between items-start">
                  <div className="text-2xl mb-2">{tile.icon}</div>
                  {tile.clickable && (
                    <span className="text-[10px] font-semibold opacity-50 uppercase tracking-wide">
                      {drilldown === tile.drilldownKey ? "▲ chiudi" : "▼ lista"}
                    </span>
                  )}
                </div>
                <div className="text-3xl font-bold tracking-tight">
                  {tile.value?.toLocaleString("it-IT")}
                </div>
                <div className="text-xs font-semibold mt-1 opacity-80">{tile.label}</div>
                <div className="text-xs mt-0.5 opacity-60">{tile.sub}</div>
              </div>
            ))}
          </div>

          {/* riga vendite */}
          <div className="grid grid-cols-2 gap-4">
            {kpiVendite.map((tile) => (
              <div key={tile.label} className={`rounded-2xl border p-5 shadow-sm ${tile.color}`}>
                <div className="text-2xl mb-2">{tile.icon}</div>
                <div className="text-3xl font-bold tracking-tight">{tile.value?.toLocaleString("it-IT")}</div>
                <div className="text-xs font-semibold mt-1 opacity-80">{tile.label}</div>
                <div className="text-xs mt-0.5 opacity-60">{tile.sub}</div>
              </div>
            ))}
          </div>

          </div>
        )}

        {/* ── DRILLDOWN: SENZA LISTINO ─────────────────────── */}
        {drilldown === "senza_listino" && stats?.vini_senza_listino_list?.length > 0 && (
          <div className="bg-white rounded-3xl border border-orange-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-orange-50 border-b border-orange-200 flex items-center justify-between">
              <div>
                <div className="font-semibold text-orange-900">
                  {stats.vini_senza_listino_list.length} vini senza prezzo listino
                </div>
                <div className="text-xs text-orange-700 mt-0.5">
                  Clicca su un vino per aprire la scheda e aggiungere il prezzo.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrilldown(null)}
                className="text-orange-400 hover:text-orange-700 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="bg-orange-50 sticky top-0">
                  <tr className="text-xs text-orange-700 uppercase tracking-wide border-b border-orange-100">
                    <th className="px-4 py-2 text-left">ID</th>
                    <th className="px-4 py-2 text-left">Tipologia</th>
                    <th className="px-4 py-2 text-left">Vino</th>
                    <th className="px-4 py-2 text-left">Produttore</th>
                    <th className="px-4 py-2 text-center">Annata</th>
                    <th className="px-4 py-2 text-center">Prezzo carta</th>
                    <th className="px-4 py-2 text-center">Giacenza</th>
                    <th className="px-4 py-2 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {stats.vini_senza_listino_list.map((v) => (
                    <tr
                      key={v.id}
                      className="border-b border-neutral-100 hover:bg-orange-50 cursor-pointer transition"
                      onClick={() => navigate(`/vini/magazzino/${v.id}`)}
                    >
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center bg-slate-700 text-white text-[11px] font-bold px-2 py-0.5 rounded font-mono tracking-tight">#{v.id}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-neutral-600">{v.TIPOLOGIA}</td>
                      <td className="px-4 py-2 font-semibold text-neutral-900">{v.DESCRIZIONE}</td>
                      <td className="px-4 py-2 text-neutral-600">{v.PRODUTTORE || "—"}</td>
                      <td className="px-4 py-2 text-center text-neutral-600">{v.ANNATA || "—"}</td>
                      <td className="px-4 py-2 text-center text-neutral-600">
                        {v.PREZZO_CARTA != null && v.PREZZO_CARTA !== ""
                          ? `${Number(v.PREZZO_CARTA).toFixed(2)} €`
                          : <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="px-4 py-2 text-center font-semibold text-neutral-700">
                        {v.QTA_TOTALE ?? 0} bt
                      </td>
                      <td className="px-4 py-2 text-center text-amber-600 text-xs font-semibold">
                        Apri →
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DRILLDOWN: VINI FERMI ────────────────────────── */}
        {drilldown === "vini_fermi" && stats?.vini_fermi?.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">
                  {stats.vini_fermi.length} vini in cantina senza movimenti da 30+ giorni
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Da valutare: promuovere, riposizionare o correggere la giacenza.
                </div>
              </div>
              <button type="button" onClick={() => setDrilldown(null)} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
            </div>
            <div className="divide-y divide-neutral-100 max-h-72 overflow-auto">
              {stats.vini_fermi.map((v) => (
                <div key={v.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition"
                  onClick={() => navigate(`/vini/magazzino/${v.id}`)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex items-center bg-slate-700 text-white text-[11px] font-bold px-2 py-0.5 rounded font-mono tracking-tight shrink-0">#{v.id}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-neutral-900 truncate">{v.DESCRIZIONE}</div>
                      <div className="text-xs text-neutral-500">{v.TIPOLOGIA}{v.ANNATA ? ` · ${v.ANNATA}` : ""}{v.PRODUTTORE ? ` · ${v.PRODUTTORE}` : ""}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <div className="text-right">
                      <div className="text-sm font-bold text-neutral-800">{v.QTA_TOTALE} bt</div>
                      <div className="text-[11px] text-neutral-400">{v.ultimo_movimento ? `ult. mov. ${v.ultimo_movimento.slice(0,10)}` : "nessun movimento"}</div>
                    </div>
                    <span className="text-amber-600 text-xs font-semibold">→</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RIGA CENTRALE: VENDITE + OPERATIVI ───────────── */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* VENDITE RECENTI */}
            <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200 bg-violet-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-violet-900 uppercase tracking-wide">
                  🛒 Vendite recenti
                </h2>
              </div>
              {!stats.vendite_recenti?.length ? (
                <div className="px-6 py-8 text-center text-sm text-neutral-400">Nessuna vendita registrata.</div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {stats.vendite_recenti.map((m) => (
                    <div key={m.id} className="px-6 py-3 flex items-center justify-between hover:bg-violet-50 cursor-pointer transition"
                      onClick={() => navigate(`/vini/magazzino/${m.vino_id}`)}>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-neutral-900 truncate">{m.vino_desc}</div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {formatDate(m.data_mov)}{m.utente && <span className="ml-2">— {m.utente}</span>}
                        </div>
                      </div>
                      <div className="ml-3 text-sm font-bold text-violet-700 whitespace-nowrap">{m.qta} bt</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* MOVIMENTI OPERATIVI */}
            <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">
                  🔧 Movimenti operativi
                </h2>
              </div>
              {!stats.movimenti_operativi?.length ? (
                <div className="px-6 py-8 text-center text-sm text-neutral-400">Nessun movimento operativo.</div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {stats.movimenti_operativi.map((m) => (
                    <div key={m.id} className="px-6 py-3 flex items-start justify-between hover:bg-neutral-50 cursor-pointer transition"
                      onClick={() => navigate(`/vini/magazzino/${m.vino_id}`)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${TIPO_COLORS[m.tipo] || ""}`}>
                            {TIPO_EMOJI[m.tipo]} {m.tipo}
                          </span>
                          <span className="text-sm font-semibold text-neutral-900 truncate">{m.vino_desc}</span>
                        </div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {formatDate(m.data_mov)}{m.utente && <span className="ml-2">— {m.utente}</span>}
                        </div>
                      </div>
                      <div className="ml-3 text-sm font-bold text-neutral-800 whitespace-nowrap">{m.qta} bt</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* TOP VENDUTI 30gg */}
            <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden lg:col-span-2">
              <div className="px-6 py-4 border-b border-neutral-200 bg-violet-50">
                <h2 className="text-sm font-semibold text-violet-900 uppercase tracking-wide">🏆 Top venduti — ultimi 30gg</h2>
              </div>
              {!stats.top_venduti_30gg?.length ? (
                <div className="px-6 py-8 text-center text-sm text-neutral-400">Nessuna vendita negli ultimi 30 giorni.</div>
              ) : (
                <div className="p-5 space-y-3">
                  {stats.top_venduti_30gg.map((v, i) => {
                    const maxV = stats.top_venduti_30gg[0]?.tot_vendute || 1;
                    const pct = Math.round((v.tot_vendute / maxV) * 100);
                    return (
                      <div key={v.id} className="cursor-pointer" onClick={() => navigate(`/vini/magazzino/${v.id}`)}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-neutral-400 font-mono w-4 shrink-0">{i + 1}.</span>
                            <span className="font-semibold text-neutral-800 truncate">{v.DESCRIZIONE}</span>
                            {v.ANNATA && <span className="text-neutral-400 shrink-0">{v.ANNATA}</span>}
                          </div>
                          <span className="font-bold text-violet-700 shrink-0 ml-2">{v.tot_vendute} bt</span>
                        </div>
                        <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RIGA INFERIORE: DISTRIBUZIONE ────────────────── */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* DISTRIBUZIONE TIPOLOGIE */}
            <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">
                  🍷 Bottiglie per tipologia
                </h2>
              </div>

              {stats.distribuzione_tipologie.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-neutral-400">
                  Nessun dato disponibile.
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  {stats.distribuzione_tipologie.map((d) => {
                    const pct = maxBottiglie > 0
                      ? Math.round((d.tot_bottiglie / maxBottiglie) * 100)
                      : 0;
                    return (
                      <div key={d.TIPOLOGIA || "—"}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-neutral-800">
                            {d.TIPOLOGIA || "—"}
                          </span>
                          <span className="text-neutral-500">
                            {d.tot_bottiglie} bt
                            <span className="ml-2 text-neutral-400">
                              ({d.n_vini} ref.)
                            </span>
                          </span>
                        </div>
                        <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {/* Totale */}
                  <div className="pt-3 border-t border-neutral-200 flex justify-between text-sm">
                    <span className="font-semibold text-neutral-700">Totale cantina</span>
                    <span className="font-bold text-neutral-900">
                      {stats.total_bottiglie} bottiglie
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ACCESSO RAPIDO ───────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm px-6 py-5">
          <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-4">
            Accesso rapido
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition"
            >
              📦 Magazzino vini
            </button>
            <button
              type="button"
              onClick={() => navigate("/vini/magazzino/nuovo")}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-amber-700 text-amber-700 hover:bg-amber-50 shadow-sm transition"
            >
              ➕ Nuovo vino
            </button>
            <button
              type="button"
              onClick={() => navigate("/vini/carta")}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              📋 Carta vini
            </button>
            <button
              type="button"
              onClick={() => navigate("/vini/impostazioni")}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ⚙️ Impostazioni
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
