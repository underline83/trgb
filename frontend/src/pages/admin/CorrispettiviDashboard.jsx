// src/pages/admin/CorrispettiviDashboard.jsx
// Dashboard Corrispettivi — TRGB

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { API_BASE } from "../../config/api";

const monthNames = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

function getTodayYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function formatCurrency(value) {
  if (value == null) return "-";
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

  const today = getTodayYearMonth();
  const [year, setYear] = useState(today.year);
  const [month, setMonth] = useState(today.month);

  const [monthlyStats, setMonthlyStats] = useState(null);
  const [annualStats, setAnnualStats] = useState(null);
  const [annualCompare, setAnnualCompare] = useState(null);
  const [topDays, setTopDays] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // carica dati quando cambiano year/month
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setError(null);
      try {
        // 1) Stats mensili
        const monthlyRes = await fetch(
          `${API_BASE}/admin/finance/stats/monthly?year=${year}&month=${month}`
        );
        if (!monthlyRes.ok) {
          throw new Error(`Errore stats mensili: ${monthlyRes.status}`);
        }
        const monthlyJson = await monthlyRes.json();
        if (cancelled) return;

        // 2) Stats annuali (anno corrente)
        const annualRes = await fetch(
          `${API_BASE}/admin/finance/stats/annual?year=${year}`
        );
        if (!annualRes.ok) {
          throw new Error(`Errore stats annuali: ${annualRes.status}`);
        }
        const annualJson = await annualRes.json();
        if (cancelled) return;

        // 3) Confronto anno vs anno precedente
        const compareRes = await fetch(
          `${API_BASE}/admin/finance/stats/annual-compare?year=${year}`
        );
        if (!compareRes.ok) {
          throw new Error(`Errore annual-compare: ${compareRes.status}`);
        }
        const compareJson = await compareRes.json();
        if (cancelled) return;

        // 4) Top/bottom days
        const topRes = await fetch(
          `${API_BASE}/admin/finance/stats/top-days?year=${year}&limit=10`
        );
        if (!topRes.ok) {
          throw new Error(`Errore top-days: ${topRes.status}`);
        }
        const topJson = await topRes.json();
        if (cancelled) return;

        setMonthlyStats(monthlyJson);
        setAnnualStats(annualJson);
        setAnnualCompare(compareJson);
        setTopDays(topJson);
      } catch (err) {
        console.error(err);
        setError(err.message || "Errore nel caricamento dati");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const monthName = useMemo(
    () => monthNames[month - 1] || "",
    [month]
  );

  // dati per grafico giornaliero
  const chartData = useMemo(() => {
    if (!monthlyStats || !monthlyStats.giorni) return [];
    return monthlyStats.giorni.map((g) => ({
      date: formatShortDate(g.date),
      totale_incassi: g.totale_incassi,
      corrispettivi: g.corrispettivi,
      is_closed: g.is_closed,
    }));
  }, [monthlyStats]);

  // medie incassi per giorno della settimana (solo giorni aperti)
  const weekdayAverages = useMemo(() => {
    if (!monthlyStats || !monthlyStats.giorni) return {};

    const sums = {};
    const counts = {};

    for (const g of monthlyStats.giorni) {
      if (g.is_closed) continue;
      const tot = g.totale_incassi ?? 0;
      if (!tot) continue;

      const d = new Date(g.date);
      const idx = d.getDay(); // 0=Dom ... 6=Sab

      sums[idx] = (sums[idx] || 0) + tot;
      counts[idx] = (counts[idx] || 0) + 1;
    }

    const avg = {};
    Object.keys(sums).forEach((k) => {
      const i = Number(k);
      avg[i] = sums[i] / counts[i];
    });

    return avg; // es: {1: media lunedì, 2: media martedì, ...}
  }, [monthlyStats]);

  // calcola numero di giorni nel mese + offset per calendario
  const calendarDays = useMemo(() => {
    if (!monthlyStats || !monthlyStats.giorni) return [];

    const map = {};
    for (const g of monthlyStats.giorni) {
      const d = new Date(g.date);
      map[d.getDate()] = g;
    }

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const firstWeekday = firstDay.getDay(); // 0=Dom, 1=Lun,...

    const offset = (firstWeekday + 6) % 7; // 0=Mon, ... 6=Sun

    const days = [];
    for (let i = 0; i < offset; i++) {
      days.push(null);
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(
        map[d] ||
          {
            date: `${year}-${String(month).padStart(2, "0")}-${String(
              d
            ).padStart(2, "0")}`,
            is_closed: false,
            corrispettivi: 0,
            totale_incassi: 0,
            cash_diff: 0,
          }
      );
    }
    return days;
  }, [monthlyStats, year, month]);

  function goPrevMonth() {
    const next = calcMonthNavigation(year, month, -1);
    setYear(next.year);
    setMonth(next.month);
  }

  function goNextMonth() {
    const next = calcMonthNavigation(year, month, 1);
    setYear(next.year);
    setMonth(next.month);
  }

  function goToday() {
    const t = getTodayYearMonth();
    setYear(t.year);
    setMonth(t.month);
  }

  const yearlyDelta = useMemo(() => {
    if (!annualCompare) return null;
    const dCorr = annualCompare.delta_corrispettivi;
    const dCorrPct = annualCompare.delta_corrispettivi_pct;
    const dInc = annualCompare.delta_incassi;
    const dIncPct = annualCompare.delta_incassi_pct;
    return { dCorr, dCorrPct, dInc, dIncPct };
  }, [annualCompare]);

  const pag = monthlyStats?.pagamenti;

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-amber-900 tracking-wide font-playfair">
              Corrispettivi — Dashboard
            </h1>
            <p className="text-neutral-600">
              Analisi mensile, confronto annuale e controllo chiusure cassa.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="px-3 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Amministrazione
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/corrispettivi/gestione")}
              className="px-3 py-2 rounded-xl text-sm font-medium border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 shadow-sm transition"
            >
              Modulo Chiusura Giornaliera
            </button>
          </div>
        </div>

        {/* NAV MESE/ANNO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={goPrevMonth}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm"
            >
              ← Mese precedente
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm"
            >
              Oggi
            </button>
            <button
              onClick={goNextMonth}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm"
            >
              Mese successivo →
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm"
            >
              {monthNames.map((m, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm"
            />
          </div>
        </div>

        {/* STATO CARICAMENTO / ERRORE */}
        {loading && (
          <div className="mb-4 text-sm text-neutral-600">
            Caricamento dati in corso...
          </div>
        )}
        {error && (
          <div className="mb-4 text-sm text-red-600">
            Errore: {error}
          </div>
        )}

        {/* Se non ci sono dati, mostra solo messaggio */}
        {!loading && monthlyStats && monthlyStats.giorni.length === 0 && (
          <div className="text-sm text-neutral-600">
            Nessuna chiusura registrata per {monthName} {year}.
          </div>
        )}

        {monthlyStats && (
          <>
            {/* KPI PRINCIPALI */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-amber-800">
                  Totale Corrispettivi
                </p>
                <p className="mt-2 text-2xl font-bold text-amber-900">
                  € {formatCurrency(monthlyStats.totale_corrispettivi)}
                </p>
                <p className="text-xs text-amber-900/70 mt-1">
                  Mese di {monthName} {year}
                </p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-emerald-800">
                  Totale Incassi
                </p>
                <p className="mt-2 text-2xl font-bold text-emerald-900">
                  € {formatCurrency(monthlyStats.totale_incassi)}
                </p>
                <p className="text-xs text-emerald-900/70 mt-1">
                  Somma di contanti, POS, Sella, Stripe, bonifici, mance
                </p>
              </div>

              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-neutral-700">
                  Media Corrispettivi (giorni aperti)
                </p>
                <p className="mt-2 text-2xl font-bold text-neutral-900">
                  € {formatCurrency(monthlyStats.media_corrispettivi)}
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  Giorni aperti considerati: {monthlyStats.giorni_con_chiusura}
                </p>
              </div>

              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-neutral-700">
                  Giorni aperti / chiusi
                </p>
                <p className="mt-2 text-2xl font-bold text-neutral-900">
                  {monthlyStats.giorni_con_chiusura} aperti
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  {monthlyStats.giorni.length - monthlyStats.giorni_con_chiusura} chiusi (automatici o flag)
                </p>
              </div>
            </section>

            {/* BLOCCO CENTRALE: GRAFICO + CALENDARIO */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* GRAFICO ANDAMENTO GIORNO PER GIORNO */}
              <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-lg font-semibold text-neutral-900 font-playfair">
                    Andamento giornaliero incassi vs corrispettivi
                  </h2>
                  <p className="text-xs text-neutral-500">
                    Giorni chiusi esclusi dalle medie, ma visibili nel calendario.
                  </p>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip
                        formatter={(value, name) =>
                          [`€ ${formatCurrency(value)}`, name === "totale_incassi" ? "Incassi" : "Corrispettivi"]
                        }
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="totale_incassi"
                        stroke="#16a34a"
                        strokeWidth={2}
                        dot={false}
                        name="Incassi"
                      />
                      <Line
                        type="monotone"
                        dataKey="corrispettivi"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={false}
                        name="Corrispettivi"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* CALENDARIO MENSILE SINTETICO */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">
                  Calendario {monthName} {year}
                </h2>
                <div className="grid grid-cols-7 text-xs text-neutral-500 mb-1">
                  <span>Lun</span>
                  <span>Mar</span>
                  <span>Mer</span>
                  <span>Gio</span>
                  <span>Ven</span>
                  <span>Sab</span>
                  <span>Dom</span>
                </div>
                <div className="grid grid-cols-7 gap-1 text-xs">
                  {calendarDays.map((g, idx) => {
                    if (g === null) {
                      return <div key={idx} />;
                    }

                    const d = new Date(g.date);
                    const dayNum = d.getDate();
                    const isClosed = g.is_closed === true;
                    const corr = g.corrispettivi ?? 0;
                    const tot = g.totale_incassi ?? 0;
                    const diff = g.cash_diff ?? 0;

                    const weekdayIdx = d.getDay(); // 0=Dom ... 6=Sab
                    const avgForWeekday = weekdayAverages[weekdayIdx];

                    // Colori:
                    // - grigio chiaro: giorno chiuso
                    // - verde forte: sopra media del suo giorno (>= +15%)
                    // - verde chiaro: in media (±10%)
                    // - rosso: sotto media (>10% sotto)
                    let bgClass = "bg-white";
                    let textClass = "";

                    if (isClosed) {
                      bgClass = "bg-neutral-200";
                    } else if (avgForWeekday && tot > 0) {
                      const ratio = tot / avgForWeekday;

                      if (ratio >= 1.15) {
                        bgClass = "bg-emerald-500";
                        textClass = "text-white";
                      } else if (ratio >= 0.9 && ratio <= 1.15) {
                        bgClass = "bg-emerald-100";
                      } else if (ratio < 0.9) {
                        bgClass = "bg-red-200";
                      }
                    }

                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border border-neutral-200 px-1 py-1 cursor-pointer hover:border-amber-400 transition ${bgClass} ${textClass}`}
                        title={
                          isClosed
                            ? `Chiuso`
                            : `Incassi: € ${formatCurrency(
                                tot
                              )} — Corrispettivi: € ${formatCurrency(
                                corr
                              )} — Diff: € ${formatCurrency(diff)}`
                        }
                        onClick={() =>
                          navigate(`/admin/corrispettivi/gestione?date=${g.date}`)
                        }
                      >
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-[11px] font-semibold">
                            {dayNum}
                          </span>
                          {!isClosed && tot > 0 && (
                            <span className="text-[9px] opacity-80">
                              €{Math.round(tot / 100) * 100}
                            </span>
                          )}
                        </div>
                        {!isClosed && diff && Math.abs(diff) >= 20 && (
                          <div className="text-[9px]">
                            diff €{formatCurrency(diff)}
                          </div>
                        )}
                        {isClosed && (
                          <div className="text-[9px] text-neutral-700">
                            chiuso
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-[10px] text-neutral-500 space-y-0.5">
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded bg-emerald-500" />
                    <span>Verde scuro: sopra media del giorno (es. lunedì)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
                    <span>Verde chiaro: in linea con la media</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded bg-red-200 border border-red-300" />
                    <span>Rosso: sotto media del giorno</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded bg-neutral-200 border border-neutral-300" />
                    <span>Grigio: giorno chiuso (manuale o mercoledì a zero)</span>
                  </div>
                </div>
              </div>
            </section>

            {/* PAGAMENTI + ALERT + RIEPILOGO ANNI */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Breakdown pagamenti */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">
                  Breakdown metodi di pagamento
                </h2>
                {pag ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Contanti finali</span>
                      <span>€ {formatCurrency(pag.contanti_finali)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>POS</span>
                      <span>€ {formatCurrency(pag.pos)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sella</span>
                      <span>€ {formatCurrency(pag.sella)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Stripe / Pay</span>
                      <span>€ {formatCurrency(pag.stripe_pay)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Bonifici</span>
                      <span>€ {formatCurrency(pag.bonifici)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mance</span>
                      <span>€ {formatCurrency(pag.mance)}</span>
                    </div>
                    <hr className="my-2" />
                    <div className="flex justify-between font-semibold text-neutral-900">
                      <span>Totale incassi mese</span>
                      <span>€ {formatCurrency(pag.totale_incassi)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">
                    Nessun dato pagamenti per questo mese.
                  </p>
                )}
              </div>

              {/* Alert */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">
                  Alert e differenze cassa
                </h2>
                {monthlyStats.alerts && monthlyStats.alerts.length > 0 ? (
                  <div className="space-y-1 max-h-60 overflow-auto text-sm">
                    {monthlyStats.alerts.map((a, idx) => (
                      <div
                        key={idx}
                        className="border border-amber-300 bg-amber-50 rounded-xl px-2 py-1.5"
                      >
                        <div className="flex justify-between text-xs text-neutral-700 mb-0.5">
                          <span>{formatShortDate(a.date)}</span>
                          <span>diff € {formatCurrency(a.cash_diff)}</span>
                        </div>
                        <div className="text-xs text-neutral-800">
                          {a.message}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">
                    Nessun alert superiore alla soglia impostata.
                  </p>
                )}
              </div>

              {/* Riepilogo Annuale / Confronto anni */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">
                  Confronto {year} vs {year - 1}
                </h2>
                {annualStats && yearlyDelta ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Totale corrispettivi {year}</span>
                      <span>
                        € {formatCurrency(annualStats.totale_corrispettivi)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Totale incassi {year}</span>
                      <span>
                        € {formatCurrency(annualStats.totale_incassi)}
                      </span>
                    </div>
                    <hr className="my-2" />
                    <div className="flex justify-between">
                      <span>Δ corrispettivi vs {year - 1}</span>
                      <span>
                        € {formatCurrency(yearlyDelta.dCorr)}{" "}
                        {yearlyDelta.dCorrPct != null && (
                          <span
                            className={
                              yearlyDelta.dCorrPct >= 0
                                ? "text-emerald-700 ml-1"
                                : "text-red-700 ml-1"
                            }
                          >
                            ({yearlyDelta.dCorrPct.toFixed(1)}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Δ incassi vs {year - 1}</span>
                      <span>
                        € {formatCurrency(yearlyDelta.dInc)}{" "}
                        {yearlyDelta.dIncPct != null && (
                          <span
                            className={
                              yearlyDelta.dIncPct >= 0
                                ? "text-emerald-700 ml-1"
                                : "text-red-700 ml-1"
                            }
                          >
                            ({yearlyDelta.dIncPct.toFixed(1)}%)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">
                    Dati annuali non disponibili.
                  </p>
                )}
              </div>
            </section>

            {/* TOP/BOTTOM DAYS + TABELLA RIEPILOGO GIORNI */}
            <section className="space-y-6">
              {/* Tabella riepilogo giorni */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm overflow-x-auto">
                <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-3">
                  Dettaglio giornaliero — {monthName} {year}
                </h2>
                <table className="min-w-full text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 text-neutral-700">
                      <th className="border border-neutral-200 px-2 py-1 text-left">
                        Data
                      </th>
                      <th className="border border-neutral-200 px-2 py-1 text-left">
                        Giorno
                      </th>
                      <th className="border border-neutral-200 px-2 py-1 text-right">
                        Corrispettivi
                      </th>
                      <th className="border border-neutral-200 px-2 py-1 text-right">
                        Incassi
                      </th>
                      <th className="border border-neutral-200 px-2 py-1 text-right">
                        Diff cassa
                      </th>
                      <th className="border border-neutral-200 px-2 py-1 text-center">
                        Stato
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyStats.giorni.map((g) => {
                      const d = new Date(g.date);
                      const closed = g.is_closed;
                      const diff = g.cash_diff ?? 0;
                      return (
                        <tr
                          key={g.date}
                          className={
                            closed
                              ? "bg-neutral-50 text-neutral-500"
                              : "hover:bg-amber-50"
                          }
                        >
                          <td className="border border-neutral-200 px-2 py-1 whitespace-nowrap">
                            {formatShortDate(g.date)}
                          </td>
                          <td className="border border-neutral-200 px-2 py-1 whitespace-nowrap">
                            {g.weekday}
                          </td>
                          <td className="border border-neutral-200 px-2 py-1 text-right">
                            € {formatCurrency(g.corrispettivi)}
                          </td>
                          <td className="border border-neutral-200 px-2 py-1 text-right">
                            € {formatCurrency(g.totale_incassi)}
                          </td>
                          <td
                            className={
                              "border border-neutral-200 px-2 py-1 text-right " +
                              (Math.abs(diff) >= 20 && !closed
                                ? "text-red-700 font-semibold"
                                : "")
                            }
                          >
                            € {formatCurrency(diff)}
                          </td>
                          <td className="border border-neutral-200 px-2 py-1 text-center">
                            {closed ? (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700">
                                chiuso
                              </span>
                            ) : Math.abs(diff) >= 20 ? (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                diff alta
                              </span>
                            ) : (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                ok
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Top / Bottom days dell'anno */}
              {topDays && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm">
                    <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">
                      Giorni migliori per incassi — {year}
                    </h2>
                    <ul className="space-y-1 text-sm max-h-72 overflow-auto">
                      {topDays.top_best.map((d, idx) => (
                        <li
                          key={idx}
                          className="flex justify-between border-b border-neutral-100 py-1"
                        >
                          <span>
                            {formatShortDate(d.date)} — {d.weekday}
                          </span>
                          <span>
                            € {formatCurrency(d.totale_incassi)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm">
                    <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">
                      Giorni peggiori per incassi — {year}
                    </h2>
                    <ul className="space-y-1 text-sm max-h-72 overflow-auto">
                      {topDays.top_worst.map((d, idx) => (
                        <li
                          key={idx}
                          className="flex justify-between border-b border-neutral-100 py-1"
                        >
                          <span>
                            {formatShortDate(d.date)} — {d.weekday}
                          </span>
                          <span>
                            € {formatCurrency(d.totale_incassi)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}