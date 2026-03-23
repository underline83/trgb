// src/pages/admin/CorrispettiviDashboard.jsx
// @version: v3.0-fiscale — Dashboard Vendite (solo dato fiscale, nessuna differenza)
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import VenditeNav from "./VenditeNav";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { API_BASE, apiFetch } from "../../config/api";

const monthNames = [
  "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre",
];

function getTodayYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function formatCurrency(value) {
  if (value == null) return "-";
  return value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatShortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function calcMonthNavigation(year, month, delta) {
  const base = new Date(year, month - 1 + delta, 1);
  return { year: base.getFullYear(), month: base.getMonth() + 1 };
}

export default function CorrispettiviDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const today = getTodayYearMonth();
  const [year, setYear] = useState(() => {
    const p = parseInt(searchParams.get("year"));
    return p >= 2000 && p <= 2100 ? p : today.year;
  });
  const [month, setMonth] = useState(() => {
    const p = parseInt(searchParams.get("month"));
    return p >= 1 && p <= 12 ? p : today.month;
  });

  const [monthlyStats, setMonthlyStats] = useState(null);
  const [prevYearStats, setPrevYearStats] = useState(null);
  const [topDays, setTopDays] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setLoading(true);
      setError(null);
      try {
        // Mese corrente
        const monthlyRes = await apiFetch(`${API_BASE}/admin/finance/stats/monthly?year=${year}&month=${month}`);
        if (!monthlyRes.ok) throw new Error(`Errore stats mensili: ${monthlyRes.status}`);
        const monthlyJson = await monthlyRes.json();
        if (cancelled) return;

        // Stesso mese anno precedente
        const prevRes = await apiFetch(`${API_BASE}/admin/finance/stats/monthly?year=${year - 1}&month=${month}`);
        const prevJson = prevRes.ok ? await prevRes.json() : null;
        if (cancelled) return;

        const topRes = await apiFetch(`${API_BASE}/admin/finance/stats/top-days?year=${year}&limit=10`);
        if (!topRes.ok) throw new Error(`Errore top-days: ${topRes.status}`);
        const topJson = await topRes.json();
        if (cancelled) return;

        setMonthlyStats(monthlyJson);
        setPrevYearStats(prevJson);
        setTopDays(topJson);
      } catch (err) {
        console.error(err);
        setError(err.message || "Errore nel caricamento dati");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAll();
    return () => { cancelled = true; };
  }, [year, month]);

  const monthName = useMemo(() => monthNames[month - 1] || "", [month]);

  // ── Confronto alla pari: se il mese è in corso, taglia l'anno precedente allo stesso giorno ──
  const yoyComparison = useMemo(() => {
    const todayNow = new Date();
    const isCurrentMonth = year === todayNow.getFullYear() && month === todayNow.getMonth() + 1;
    // Giorno limite: se mese corrente, fino ad oggi; altrimenti tutto il mese
    const cutoffDay = isCurrentMonth ? todayNow.getDate() : 31;

    // Somma corrispettivi anno corrente (solo giorni aperti fino a cutoff)
    let currTotal = 0, currDays = 0;
    if (monthlyStats?.giorni) {
      for (const g of monthlyStats.giorni) {
        if (g.is_closed) continue;
        const dayNum = new Date(g.date).getDate();
        if (dayNum > cutoffDay) continue;
        currTotal += g.corrispettivi ?? 0;
        currDays++;
      }
    }

    // Somma corrispettivi anno precedente (solo giorni aperti fino a cutoff)
    let prevTotal = 0, prevDays = 0;
    if (prevYearStats?.giorni) {
      for (const g of prevYearStats.giorni) {
        if (g.is_closed) continue;
        const dayNum = new Date(g.date).getDate();
        if (dayNum > cutoffDay) continue;
        prevTotal += g.corrispettivi ?? 0;
        prevDays++;
      }
    }

    const currMedia = currDays > 0 ? currTotal / currDays : 0;
    const prevMedia = prevDays > 0 ? prevTotal / prevDays : 0;
    const delta = prevTotal > 0 ? currTotal - prevTotal : null;
    const deltaPct = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : null;
    const deltaMedia = prevMedia > 0 ? currMedia - prevMedia : null;
    const deltaMediaPct = prevMedia > 0 ? ((currMedia - prevMedia) / prevMedia) * 100 : null;

    return {
      isPartial: isCurrentMonth,
      cutoffDay,
      currTotal, currDays, currMedia,
      prevTotal, prevDays, prevMedia,
      delta, deltaPct, deltaMedia, deltaMediaPct,
    };
  }, [monthlyStats, prevYearStats, year, month]);

  // Grafico: corrispettivi anno corrente + anno precedente
  const chartData = useMemo(() => {
    if (!monthlyStats || !monthlyStats.giorni) return [];

    // Mappa anno precedente per giorno del mese
    const prevMap = {};
    if (prevYearStats?.giorni) {
      for (const g of prevYearStats.giorni) {
        if (!g.is_closed) {
          const dayNum = new Date(g.date).getDate();
          prevMap[dayNum] = g.corrispettivi ?? 0;
        }
      }
    }

    return monthlyStats.giorni
      .filter((g) => !g.is_closed)
      .map((g) => {
        const dayNum = new Date(g.date).getDate();
        return {
          date: formatShortDate(g.date),
          corrispettivi: g.corrispettivi,
          prev: prevMap[dayNum] ?? null,
        };
      });
  }, [monthlyStats, prevYearStats]);

  // Medie corrispettivi per giorno della settimana
  const weekdayAverages = useMemo(() => {
    if (!monthlyStats || !monthlyStats.giorni) return {};
    const sums = {};
    const counts = {};
    for (const g of monthlyStats.giorni) {
      if (g.is_closed) continue;
      const corr = g.corrispettivi ?? 0;
      if (!corr) continue;
      const idx = new Date(g.date).getDay();
      sums[idx] = (sums[idx] || 0) + corr;
      counts[idx] = (counts[idx] || 0) + 1;
    }
    const avg = {};
    Object.keys(sums).forEach((k) => { avg[Number(k)] = sums[k] / counts[k]; });
    return avg;
  }, [monthlyStats]);

  // Calendario
  const calendarDays = useMemo(() => {
    if (!monthlyStats || !monthlyStats.giorni) return [];
    const map = {};
    for (const g of monthlyStats.giorni) {
      map[new Date(g.date).getDate()] = g;
    }
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const offset = (firstDay.getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < offset; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(map[d] || {
        date: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        is_closed: false, corrispettivi: 0, totale_incassi: 0,
      });
    }
    return days;
  }, [monthlyStats, year, month]);

  function goPrevMonth() { const n = calcMonthNavigation(year, month, -1); setYear(n.year); setMonth(n.month); }
  function goNextMonth() { const n = calcMonthNavigation(year, month, 1); setYear(n.year); setMonth(n.month); }
  function goToday() { const t = getTodayYearMonth(); setYear(t.year); setMonth(t.month); }

  // Torta pagamenti: contanti = corrispettivi - elettronici (quadra sempre)
  const pag = monthlyStats?.pagamenti;
  const paymentPieData = useMemo(() => {
    if (!pag) return [];
    const elettronici = (pag.pos_bpm ?? 0) + (pag.pos_sella ?? 0) + (pag.stripe_pay ?? 0) + (pag.bonifici ?? 0);
    const corrTot = monthlyStats?.totale_corrispettivi ?? 0;
    // Contanti = dichiarato - pagamenti elettronici tracciati
    const contantiFiscali = Math.max(0, corrTot - elettronici);

    const entries = [
      { label: "Contanti", value: contantiFiscali, color: "#f97316" },
      { label: "POS BPM", value: pag.pos_bpm ?? 0, color: "#22c55e" },
      { label: "POS Sella", value: pag.pos_sella ?? 0, color: "#0ea5e9" },
      { label: "Stripe / Pay", value: pag.stripe_pay ?? 0, color: "#8b5cf6" },
      { label: "Bonifici", value: pag.bonifici ?? 0, color: "#eab308" },
    ];

    return entries.filter((e) => e.value > 0).map((e) => ({ name: e.label, value: e.value, color: e.color }));
  }, [pag, monthlyStats]);

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <VenditeNav current="dashboard" />

      <div className="p-6">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-indigo-900 tracking-wide font-playfair">
              Vendite — Dashboard Mensile
            </h1>
            <p className="text-neutral-600">
              Analisi mensile corrispettivi e composizione pagamenti.
            </p>
          </div>
        </div>

        {/* NAV MESE/ANNO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <button onClick={goPrevMonth} className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm">
              ← Mese precedente
            </button>
            <button onClick={goToday} className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm">
              Oggi
            </button>
            <button onClick={goNextMonth} className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm">
              Mese successivo →
            </button>
          </div>
          <div className="flex items-center gap-2">
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm">
              {monthNames.map((m, idx) => (<option key={idx + 1} value={idx + 1}>{m}</option>))}
            </select>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="w-24 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm" />
          </div>
        </div>

        {loading && <div className="mb-4 text-sm text-neutral-600">Caricamento dati in corso...</div>}
        {error && <div className="mb-4 text-sm text-red-600">Errore: {error}</div>}
        {!loading && monthlyStats && monthlyStats.giorni.length === 0 && (
          <div className="text-sm text-neutral-600">Nessuna chiusura registrata per {monthName} {year}.</div>
        )}

        {monthlyStats && (
          <>
            {/* KPI PRINCIPALI — con confronto alla pari anno precedente */}
            {(() => {
              const yoy = yoyComparison;
              const partialLabel = yoy.isPartial ? ` (1-${yoy.cutoffDay})` : "";
              return (
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-indigo-800">Totale Corrispettivi</p>
                    <p className="mt-2 text-2xl font-bold text-indigo-900">
                      € {formatCurrency(monthlyStats.totale_corrispettivi)}
                    </p>
                    <p className="text-xs text-indigo-900/70 mt-1">Mese di {monthName} {year}</p>
                  </div>

                  <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-neutral-700">Media giornaliera</p>
                    <p className="mt-2 text-2xl font-bold text-neutral-900">
                      € {formatCurrency(monthlyStats.media_corrispettivi)}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      Su {monthlyStats.giorni_con_chiusura} giorni aperti
                    </p>
                  </div>

                  {/* Confronto anno precedente — alla pari */}
                  <div className={`rounded-2xl p-4 shadow-sm border ${yoy.prevTotal > 0 ? (yoy.delta >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200") : "bg-neutral-50 border-neutral-200"}`}>
                    <p className="text-xs uppercase tracking-wide text-neutral-700">vs {monthName}{partialLabel} {year - 1}</p>
                    {yoy.prevTotal > 0 ? (
                      <>
                        <p className={`mt-2 text-2xl font-bold ${yoy.delta >= 0 ? "text-emerald-800" : "text-red-800"}`}>
                          {yoy.delta >= 0 ? "+" : ""}{formatCurrency(yoy.delta)}
                        </p>
                        <p className={`text-xs mt-1 font-semibold ${yoy.delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {yoy.deltaPct >= 0 ? "+" : ""}{yoy.deltaPct.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-neutral-400 mt-0.5">
                          {year}: € {formatCurrency(yoy.currTotal)} ({yoy.currDays}gg) — {year - 1}: € {formatCurrency(yoy.prevTotal)} ({yoy.prevDays}gg)
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-lg font-bold text-neutral-400">—</p>
                        <p className="text-xs text-neutral-400 mt-1">Nessun dato per {year - 1}</p>
                      </>
                    )}
                  </div>

                  <div className={`rounded-2xl p-4 shadow-sm border ${yoy.prevMedia > 0 ? (yoy.deltaMedia >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200") : "bg-neutral-50 border-neutral-200"}`}>
                    <p className="text-xs uppercase tracking-wide text-neutral-700">Media/gg vs {year - 1}</p>
                    {yoy.prevMedia > 0 ? (
                      <>
                        <p className={`mt-2 text-2xl font-bold ${yoy.deltaMedia >= 0 ? "text-emerald-800" : "text-red-800"}`}>
                          {yoy.deltaMedia >= 0 ? "+" : ""}{formatCurrency(yoy.deltaMedia)}
                        </p>
                        <p className={`text-xs mt-1 font-semibold ${yoy.deltaMedia >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {yoy.deltaMediaPct >= 0 ? "+" : ""}{yoy.deltaMediaPct.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-neutral-400 mt-0.5">
                          {year}: € {formatCurrency(yoy.currMedia)}/gg — {year - 1}: € {formatCurrency(yoy.prevMedia)}/gg
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-lg font-bold text-neutral-400">—</p>
                        <p className="text-xs text-neutral-400 mt-1">Nessun dato per {year - 1}</p>
                      </>
                    )}
                  </div>
                </section>
              );
            })()}

            {/* GRAFICO + CALENDARIO */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Grafico corrispettivi giornalieri + anno precedente */}
              <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-lg font-semibold text-neutral-900 font-playfair">
                    Corrispettivi giornalieri
                  </h2>
                  <p className="text-xs text-neutral-500">Solo giorni aperti</p>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(value, name) => [
                        `€ ${formatCurrency(value)}`,
                        name === "prev" ? `${year - 1}` : `${year}`
                      ]} />
                      <Legend />
                      <Line type="monotone" dataKey="corrispettivi" stroke="#4f46e5" strokeWidth={2} dot={false} name={`${year}`} />
                      <Line type="monotone" dataKey="prev" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name={`${year - 1}`} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Calendario mensile */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">
                  Calendario {monthName} {year}
                </h2>
                <div className="grid grid-cols-7 text-xs text-neutral-500 mb-1">
                  <span>Lun</span><span>Mar</span><span>Mer</span><span>Gio</span><span>Ven</span><span>Sab</span><span>Dom</span>
                </div>
                <div className="grid grid-cols-7 gap-1 text-xs">
                  {calendarDays.map((g, idx) => {
                    if (g === null) return <div key={idx} />;
                    const d = new Date(g.date);
                    const dayNum = d.getDate();
                    const isClosed = g.is_closed === true;
                    const corr = g.corrispettivi ?? 0;
                    const weekdayIdx = d.getDay();
                    const avgForWeekday = weekdayAverages[weekdayIdx];

                    let bgClass = "bg-white";
                    let textClass = "";
                    if (isClosed) {
                      bgClass = "bg-neutral-200";
                    } else if (avgForWeekday && corr > 0) {
                      const ratio = corr / avgForWeekday;
                      if (ratio >= 1.15) { bgClass = "bg-emerald-500"; textClass = "text-white"; }
                      else if (ratio >= 0.9) { bgClass = "bg-emerald-100"; }
                      else { bgClass = "bg-red-200"; }
                    }

                    return (
                      <div key={idx}
                        className={`rounded-xl border border-neutral-200 px-1 py-1 cursor-pointer hover:border-indigo-400 transition ${bgClass} ${textClass}`}
                        title={isClosed ? "Chiuso" : `Corrispettivi: € ${formatCurrency(corr)}`}
                        onClick={() => navigate(`/vendite/chiusure?date=${g.date}`)}>
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-[11px] font-semibold">{dayNum}</span>
                          {!isClosed && corr > 0 && (
                            <span className="text-[9px] opacity-80">€{Math.round(corr / 100) * 100}</span>
                          )}
                        </div>
                        {isClosed && <div className="text-[9px] text-neutral-700">chiuso</div>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-[10px] text-neutral-500 space-y-0.5">
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded bg-emerald-500" />
                    <span>Sopra media del giorno (+15%)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
                    <span>In linea con la media</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded bg-red-200 border border-red-300" />
                    <span>Sotto media del giorno</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded bg-neutral-200 border border-neutral-300" />
                    <span>Giorno chiuso</span>
                  </div>
                </div>
              </div>
            </section>

            {/* COMPOSIZIONE PAGAMENTI */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">
                  Composizione pagamenti
                </h2>
                {paymentPieData.length > 0 ? (
                  <>
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={paymentPieData} dataKey="value" nameKey="name"
                            innerRadius="45%" outerRadius="80%" paddingAngle={2}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}>
                            {paymentPieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value, name) => [`€ ${formatCurrency(value)}`, name]} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 text-sm flex justify-between font-semibold text-neutral-900">
                      <span>Totale corrispettivi mese</span>
                      <span>€ {formatCurrency(monthlyStats.totale_corrispettivi)}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-neutral-500">Nessun dato pagamenti per questo mese.</p>
                )}
              </div>

              {/* Dettaglio metodi di pagamento */}
              {pag && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 shadow-sm">
                  <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-3">
                    Dettaglio metodi
                  </h2>
                  <div className="space-y-2">
                    {(() => {
                      const elettronici = (pag.pos_bpm ?? 0) + (pag.pos_sella ?? 0) + (pag.stripe_pay ?? 0) + (pag.bonifici ?? 0);
                      const contantiFiscali = Math.max(0, (monthlyStats?.totale_corrispettivi ?? 0) - elettronici);
                      const items = [
                        { label: "Contanti", value: contantiFiscali, color: "bg-orange-100 text-orange-800 border-orange-200" },
                        { label: "POS BPM", value: pag.pos_bpm ?? 0, color: "bg-green-100 text-green-800 border-green-200" },
                        { label: "POS Sella", value: pag.pos_sella ?? 0, color: "bg-sky-100 text-sky-800 border-sky-200" },
                        { label: "Stripe / PayPal", value: pag.stripe_pay ?? 0, color: "bg-violet-100 text-violet-800 border-violet-200" },
                        { label: "Bonifici", value: pag.bonifici ?? 0, color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
                      ];
                      return items.filter(i => i.value > 0).map(i => (
                        <div key={i.label} className={`flex justify-between items-center rounded-xl border px-3 py-2 text-sm font-medium ${i.color}`}>
                          <span>{i.label}</span>
                          <span className="font-bold">€ {formatCurrency(i.value)}</span>
                        </div>
                      ));
                    })()}
                    <div className="flex justify-between items-center rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-900 px-3 py-2 text-sm font-bold mt-3">
                      <span>Totale dichiarato</span>
                      <span>€ {formatCurrency(monthlyStats.totale_corrispettivi)}</span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* TABELLA GIORNALIERA — solo dato fiscale */}
            <section className="space-y-6">
              <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm overflow-x-auto">
                <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-3">
                  Dettaglio giornaliero — {monthName} {year}
                </h2>
                <table className="min-w-full text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 text-neutral-700">
                      <th className="border border-neutral-200 px-2 py-1 text-left">Data</th>
                      <th className="border border-neutral-200 px-2 py-1 text-left">Giorno</th>
                      <th className="border border-neutral-200 px-2 py-1 text-right">Corrispettivi</th>
                      <th className="border border-neutral-200 px-2 py-1 text-center">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyStats.giorni.map((g) => {
                      const closed = g.is_closed;
                      return (
                        <tr key={g.date} className={closed ? "bg-neutral-50 text-neutral-500" : "hover:bg-indigo-50"}>
                          <td className="border border-neutral-200 px-2 py-1 whitespace-nowrap">{formatShortDate(g.date)}</td>
                          <td className="border border-neutral-200 px-2 py-1 whitespace-nowrap">{g.weekday}</td>
                          <td className="border border-neutral-200 px-2 py-1 text-right">€ {formatCurrency(g.corrispettivi)}</td>
                          <td className="border border-neutral-200 px-2 py-1 text-center">
                            {closed ? (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700">chiuso</span>
                            ) : (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">aperto</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Top / Bottom days dell'anno — per corrispettivi, esclusi giorni chiusura */}
              {topDays && (() => {
                // Filtra giorni con corrispettivi > 0 (esclude chiusure) e riordina per corrispettivi
                const validDays = [...topDays.top_best, ...topDays.top_worst]
                  .filter((d, i, arr) => arr.findIndex(x => x.date === d.date) === i) // deduplica
                  .filter(d => (d.corrispettivi ?? 0) > 0);
                const bestByCorr = [...validDays].sort((a, b) => (b.corrispettivi ?? 0) - (a.corrispettivi ?? 0)).slice(0, 10);
                const worstByCorr = [...validDays].sort((a, b) => (a.corrispettivi ?? 0) - (b.corrispettivi ?? 0)).slice(0, 10);
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm">
                      <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">
                        Giorni migliori — {year}
                      </h2>
                      <ul className="space-y-1 text-sm max-h-72 overflow-auto">
                        {bestByCorr.map((d, idx) => (
                          <li key={idx} className="flex justify-between border-b border-neutral-100 py-1">
                            <span>{formatShortDate(d.date)} — {d.weekday}</span>
                            <span>€ {formatCurrency(d.corrispettivi)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm">
                      <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">
                        Giorni peggiori — {year}
                      </h2>
                      <ul className="space-y-1 text-sm max-h-72 overflow-auto">
                        {worstByCorr.map((d, idx) => (
                          <li key={idx} className="flex justify-between border-b border-neutral-100 py-1">
                            <span>{formatShortDate(d.date)} — {d.weekday}</span>
                            <span>€ {formatCurrency(d.corrispettivi)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })()}
            </section>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
