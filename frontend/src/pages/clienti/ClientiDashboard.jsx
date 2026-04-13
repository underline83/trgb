// @version: v1.2-clienti-dashboard
// Dashboard CRM — statistiche clienti + prenotazioni, compleanni, top clienti
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";
import Tooltip from "../../components/Tooltip";
import { buildWaLink, WA_TEMPLATES } from "../../utils/whatsapp";

export default function ClientiDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [prenStats, setPrenStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch(`${API_BASE}/clienti/dashboard/stats`).then((r) => r.json()),
      apiFetch(`${API_BASE}/clienti/prenotazioni/stats`).then((r) => r.json()).catch(() => null),
    ]).then(([clientiData, prenData]) => {
      setStats(clientiData);
      setPrenStats(prenData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <>
      <ClientiNav current="dashboard" />
      <div className="p-12 text-center text-neutral-400">Caricamento dashboard...</div>
    </>
  );

  if (!stats) return (
    <>
      <ClientiNav current="dashboard" />
      <div className="p-12 text-center text-neutral-400">Nessun dato disponibile</div>
    </>
  );

  const fmt = (n) => (n != null ? Number(n).toLocaleString("it-IT") : "—");

  const StatCard = ({ icon, label, value, color = "teal", sub = null }) => (
    <div className={`bg-${color}-50 border border-${color}-200 rounded-xl p-4 shadow-sm`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{icon}</span>
        <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl font-bold text-${color}-900`}>{fmt(value)}</div>
      {sub && <p className="text-xs text-neutral-500 mt-1">{sub}</p>}
    </div>
  );

  return (
    <>
      <ClientiNav current="dashboard" />
      <div className="min-h-screen bg-neutral-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-neutral-900 mb-6">📊 Dashboard Clienti</h1>

          {/* KPI Cards — Clienti */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <StatCard icon="👥" label="Totale clienti" value={stats.totale} />
            <StatCard icon="⭐" label="VIP" value={stats.vip} color="amber" />
            <StatCard icon="📧" label="Con email" value={stats.con_email} color="sky" />
            <StatCard icon="🆕" label="Nuovi (30gg)" value={stats.nuovi_30gg} color="emerald" />
          </div>

          {/* KPI Cards — Prenotazioni */}
          {prenStats && prenStats.totale > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <StatCard icon="📅" label="Prenotazioni" value={prenStats.totale} color="indigo" />
              <StatCard icon="🪑" label="Pax medio" value={prenStats.pax_medio} color="teal" />
              <StatCard icon="🚫" label="No Show" value={prenStats.no_show} color="amber"
                sub={prenStats.totale > 0 ? `${(prenStats.no_show / prenStats.totale * 100).toFixed(1)}%` : ""} />
              <StatCard icon="❌" label="Cancellazioni" value={prenStats.cancellazioni} color="red"
                sub={prenStats.totale > 0 ? `${(prenStats.cancellazioni / prenStats.totale * 100).toFixed(1)}%` : ""} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Compleanni prossimi */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-700 mb-4">🎂 Compleanni prossimi 7 giorni</h2>
              {stats.compleanni_prossimi?.length === 0 ? (
                <p className="text-sm text-neutral-400">Nessun compleanno in arrivo</p>
              ) : (
                <div className="space-y-2">
                  {stats.compleanni_prossimi?.map((c) => {
                    const waLink = buildWaLink(c.telefono, WA_TEMPLATES.compleanno, { nome: c.nome });
                    const mailLink = c.email ? `mailto:${c.email}?subject=${encodeURIComponent("Buon Compleanno!")}&body=${encodeURIComponent(`Caro/a ${c.nome},\n\ntanti auguri di buon compleanno da parte di tutto lo staff dell'Osteria Tre Gobbi!\n\nSperiamo di rivederti presto.\n\nUn caro saluto`)}` : null;
                    return (
                      <div key={c.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-amber-50 transition">
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate(`/clienti/${c.id}`)}>
                          <span className="text-sm font-medium text-neutral-800">{c.nome} {c.cognome}</span>
                          <span className="text-xs text-neutral-500">{c.data_nascita}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {waLink && (
                            <Tooltip label={`WhatsApp a ${tel}`}>
                              <a href={waLink} target="_blank" rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-0.5 px-2 py-1 text-[11px] font-medium bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition border border-emerald-200">
                                WA
                              </a>
                            </Tooltip>
                          )}
                          {mailLink && (
                            <Tooltip label={`Email a ${c.email}`}>
                              <a href={mailLink}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-0.5 px-2 py-1 text-[11px] font-medium bg-sky-100 text-sky-700 rounded-lg hover:bg-sky-200 transition border border-sky-200">
                                Email
                              </a>
                            </Tooltip>
                          )}
                          {!waLink && !mailLink && (
                            <span className="text-[10px] text-neutral-400">No contatti</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top clienti per prenotazioni */}
            {prenStats?.top_clienti?.length > 0 && (
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-neutral-700 mb-4">🏆 Top 20 Clienti (per visite)</h2>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-xs font-medium text-neutral-500">#</th>
                        <th className="px-2 py-1.5 text-left text-xs font-medium text-neutral-500">Cliente</th>
                        <th className="px-2 py-1.5 text-center text-xs font-medium text-neutral-500">Visite</th>
                        <th className="px-2 py-1.5 text-center text-xs font-medium text-neutral-500">Tot Pax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {prenStats.top_clienti.map((c, i) => (
                        <tr key={c.id} onClick={() => navigate(`/clienti/${c.id}`)}
                          className="hover:bg-teal-50 cursor-pointer transition">
                          <td className="px-2 py-1.5 text-neutral-400 font-mono text-xs">{i + 1}</td>
                          <td className="px-2 py-1.5 font-medium text-neutral-800">
                            {c.vip ? "⭐ " : ""}{c.cognome} {c.nome}
                          </td>
                          <td className="px-2 py-1.5 text-center font-bold text-teal-700">{c.n_prenotazioni}</td>
                          <td className="px-2 py-1.5 text-center text-neutral-600">{fmt(c.tot_pax)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Distribuzione per rank */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-700 mb-4">🏅 Distribuzione per Rank</h2>
              <div className="space-y-2">
                {stats.per_rank?.map((r) => {
                  const pct = stats.totale > 0 ? (r.n / stats.totale * 100) : 0;
                  const colors = {
                    Gold: "bg-yellow-400", Silver: "bg-neutral-400",
                    Bronze: "bg-orange-400", Caution: "bg-red-400", Nessuno: "bg-neutral-200",
                  };
                  return (
                    <div key={r.rank}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-neutral-700">{r.rank}</span>
                        <span className="text-neutral-500">{fmt(r.n)} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${colors[r.rank] || "bg-neutral-300"}`}
                          style={{ width: `${Math.max(pct, 0.5)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Per canale prenotazione */}
            {prenStats?.per_canale?.length > 0 && (
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-neutral-700 mb-4">📡 Prenotazioni per Canale</h2>
                <div className="space-y-2">
                  {prenStats.per_canale.map((c) => {
                    const pct = prenStats.totale > 0 ? (c.n / prenStats.totale * 100) : 0;
                    return (
                      <div key={c.canale}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-neutral-700">{c.canale}</span>
                          <span className="text-neutral-500">{fmt(c.n)} ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-400 rounded-full"
                            style={{ width: `${Math.max(pct, 0.5)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Andamento mensile prenotazioni */}
            {prenStats?.per_mese?.length > 0 && (
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-neutral-700 mb-4">📈 Andamento Mensile (12 mesi)</h2>
                <div className="space-y-1.5">
                  {prenStats.per_mese.map((m) => {
                    const maxN = Math.max(...prenStats.per_mese.map((x) => x.n));
                    const pct = maxN > 0 ? (m.n / maxN * 100) : 0;
                    return (
                      <div key={m.mese} className="flex items-center gap-2">
                        <span className="text-xs text-neutral-500 w-16 font-mono">{m.mese}</span>
                        <div className="flex-1 h-4 bg-neutral-100 rounded overflow-hidden">
                          <div className="h-full bg-teal-400 rounded" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-neutral-600 w-12 text-right">{m.n}</span>
                        <span className="text-xs text-neutral-400 w-14 text-right">{fmt(m.pax)} pax</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Distribuzione per tag */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-700 mb-4">🏷️ Per Tag</h2>
              <div className="space-y-2">
                {stats.per_tag?.map((t) => (
                  <div key={t.nome} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.colore }} />
                      <span className="text-sm text-neutral-700">{t.nome}</span>
                    </div>
                    <span className="text-sm font-medium text-neutral-600">{fmt(t.n)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Copertura contatti */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-700 mb-4">📱 Copertura Contatti</h2>
              <div className="space-y-3">
                {[
                  { label: "Con telefono", value: stats.con_telefono, icon: "📱" },
                  { label: "Con email", value: stats.con_email, icon: "📧" },
                  { label: "Con compleanno", value: stats.con_compleanno, icon: "🎂" },
                  { label: "Con allergie", value: stats.con_allergie, icon: "⚠️" },
                  { label: "Con preferenze cibo", value: stats.con_preferenze, icon: "🍽️" },
                ].map((item) => {
                  const pct = stats.totale > 0 ? (item.value / stats.totale * 100) : 0;
                  return (
                    <div key={item.label}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-neutral-700">{item.icon} {item.label}</span>
                        <span className="text-neutral-500">{fmt(item.value)} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
