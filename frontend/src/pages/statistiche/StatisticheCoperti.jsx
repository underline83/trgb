// src/pages/statistiche/StatisticheCoperti.jsx
// @version: v2.0 — Dashboard coperti & incassi con grafici + tabella
import React, { useState, useEffect, useMemo } from "react";
import StatisticheNav from "./StatisticheNav";
import { API_BASE, apiFetch } from "../../config/api";

const DAYS_IT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const DAYS_FULL = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const MONTHS_IT = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmt2(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getDayName(dateStr) { return DAYS_FULL[new Date(dateStr + "T00:00:00").getDay()]; }
function getDayShort(dateStr) { return DAYS_IT[new Date(dateStr + "T00:00:00").getDay()]; }
function getDay(dateStr) { return dateStr.split("-")[2]; }

// ─── Simple SVG bar chart ───
function BarChart({ data, barKey1, barKey2, label1, label2, color1, color2, height = 220 }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => (d[barKey1] || 0) + (d[barKey2] || 0)), 1);
  const barW = Math.max(Math.min(Math.floor(600 / data.length) - 4, 30), 8);
  const chartW = data.length * (barW + 4) + 40;
  const chartH = height;
  const plotH = chartH - 30;

  return (
    <div className="overflow-x-auto">
      <svg width={chartW} height={chartH} className="block">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={30} y1={plotH * (1 - f)} x2={chartW} y2={plotH * (1 - f)}
              stroke="#e5e5e5" strokeDasharray="2,2" />
            <text x={28} y={plotH * (1 - f) + 4} textAnchor="end" fontSize="9" fill="#aaa">
              {fmt(Math.round(max * f))}
            </text>
          </g>
        ))}
        {/* Bars */}
        {data.map((d, i) => {
          const x = 35 + i * (barW + 4);
          const h1 = ((d[barKey1] || 0) / max) * plotH;
          const h2 = ((d[barKey2] || 0) / max) * plotH;
          const isWeekend = getDayName(d.date) === "Sabato" || getDayName(d.date) === "Domenica";
          return (
            <g key={d.date}>
              {/* Pranzo */}
              <rect x={x} y={plotH - h1 - h2} width={barW} height={h1}
                fill={color1} rx={2} opacity={0.85} />
              {/* Cena */}
              <rect x={x} y={plotH - h2} width={barW} height={h2}
                fill={color2} rx={2} opacity={0.85} />
              {/* Day label */}
              <text x={x + barW / 2} y={plotH + 12} textAnchor="middle"
                fontSize="8" fill={isWeekend ? "#b45309" : "#999"}
                fontWeight={isWeekend ? "bold" : "normal"}>
                {getDay(d.date)}
              </text>
              <text x={x + barW / 2} y={plotH + 22} textAnchor="middle" fontSize="7" fill="#bbb">
                {getDayShort(d.date)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 mt-2 ml-8">
        <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color1 }}></div> {label1}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color2 }}></div> {label2}
        </div>
      </div>
    </div>
  );
}

// ─── Line sparkline for media coperto ───
function MediaLine({ data, height = 120 }) {
  if (!data.length) return null;
  const vals = data.map(d => d.media || 0);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals.filter(v => v > 0));
  const range = max - min || 1;
  const chartW = Math.max(data.length * 20, 300);
  const plotH = height - 25;

  const avg = vals.reduce((a, b) => a + b, 0) / vals.filter(v => v > 0).length;
  const avgY = plotH - ((avg - min) / range) * plotH;

  const points = data.map((d, i) => {
    const x = 10 + i * ((chartW - 20) / (data.length - 1 || 1));
    const y = (d.media && d.media > 0) ? plotH - ((d.media - min) / range) * plotH : plotH;
    return { x, y, d };
  }).filter(p => p.d.media > 0);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg width={chartW} height={height} className="block">
        {/* Average line */}
        <line x1={0} y1={avgY} x2={chartW} y2={avgY} stroke="#f59e0b" strokeDasharray="4,3" strokeWidth={1} />
        <text x={chartW - 2} y={avgY - 4} textAnchor="end" fontSize="9" fill="#f59e0b">
          media: {fmt2(avg)}
        </text>
        {/* Line */}
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2} />
        {/* Dots */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill="#6366f1" />
            <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="8" fill="#6366f1" fontWeight="600">
              {fmt2(p.d.media)}
            </text>
          </g>
        ))}
        {/* X labels */}
        {data.map((d, i) => {
          const x = 10 + i * ((chartW - 20) / (data.length - 1 || 1));
          return (
            <text key={d.date} x={x} y={height - 2} textAnchor="middle" fontSize="8" fill="#aaa">
              {getDay(d.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export default function StatisticheCoperti() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year, month });
      const res = await apiFetch(`${API_BASE}/admin/finance/shift-closures/stats/daily?${params}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const json = await res.json();
      setData(json.days || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [year, month]);

  // Totali mese
  const totals = useMemo(() => {
    if (!data.length) return null;
    const t = { incassato: 0, coperti: 0, coperti_pranzo: 0, coperti_cena: 0,
      fatt_pranzo: 0, fatt_cena: 0, count: data.length };
    for (const d of data) {
      t.incassato += d.incassato || 0;
      t.coperti += d.coperti || 0;
      t.coperti_pranzo += d.coperti_pranzo || 0;
      t.coperti_cena += d.coperti_cena || 0;
      t.fatt_pranzo += d.fatt_pranzo || 0;
      t.fatt_cena += d.fatt_cena || 0;
    }
    t.media = t.coperti > 0 ? t.incassato / t.coperti : null;
    t.media_pranzo = t.coperti_pranzo > 0 ? t.fatt_pranzo / t.coperti_pranzo : null;
    t.media_cena = t.coperti_cena > 0 ? t.fatt_cena / t.coperti_cena : null;
    // Best / worst day
    if (data.length) {
      const sorted = [...data].sort((a, b) => (b.incassato || 0) - (a.incassato || 0));
      t.bestDay = sorted[0];
      t.worstDay = sorted[sorted.length - 1];
    }
    return t;
  }, [data]);

  // Weekly aggregates
  const weeks = useMemo(() => {
    const map = new Map();
    for (const d of data) {
      const w = getWeek(d.date);
      if (!map.has(w)) map.set(w, { week: w, incassato: 0, coperti: 0, days: 0 });
      const wk = map.get(w);
      wk.incassato += d.incassato || 0;
      wk.coperti += d.coperti || 0;
      wk.days++;
    }
    return [...map.values()];
  }, [data]);

  return (
    <div className="min-h-screen bg-brand-cream">
      <StatisticheNav current="coperti" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">

        {/* HEADER + FILTRI */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-rose-900 font-playfair">
                Coperti & Incassi
              </h1>
              <p className="text-neutral-500 text-sm mt-1">
                {MONTHS_IT[month]} {year} — dati dalle chiusure turno
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={() => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }}
                className="px-2 py-1.5 rounded-lg border border-neutral-300 text-neutral-500 hover:bg-neutral-50 text-sm">←</button>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white">
                {MONTHS_IT.slice(1).map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white">
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button onClick={() => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }}
                className="px-2 py-1.5 rounded-lg border border-neutral-300 text-neutral-500 hover:bg-neutral-50 text-sm">→</button>
            </div>
          </div>
        </div>

        {loading && <div className="bg-white rounded-2xl p-8 text-center text-neutral-400 animate-pulse">Caricamento...</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>}

        {!loading && !error && data.length === 0 && (
          <div className="bg-white rounded-2xl shadow p-8 border border-neutral-200 text-center text-neutral-400">
            Nessuna chiusura per {MONTHS_IT[month]} {year}.
          </div>
        )}

        {!loading && !error && data.length > 0 && totals && (
          <>
            {/* ═══ KPI ROW ═══ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white rounded-2xl shadow p-4 border border-neutral-200 text-center">
                <div className="text-[10px] font-semibold text-neutral-400 uppercase">Incassato</div>
                <div className="text-lg font-bold text-neutral-800">€ {fmt(totals.incassato)}</div>
              </div>
              <div className="bg-white rounded-2xl shadow p-4 border border-neutral-200 text-center">
                <div className="text-[10px] font-semibold text-neutral-400 uppercase">Coperti</div>
                <div className="text-lg font-bold text-neutral-800">{totals.coperti}</div>
                <div className="text-[9px] text-neutral-400">{totals.coperti_pranzo} pranzo · {totals.coperti_cena} cena</div>
              </div>
              <div className="bg-white rounded-2xl shadow p-4 border border-neutral-200 text-center">
                <div className="text-[10px] font-semibold text-neutral-400 uppercase">Media coperto</div>
                <div className="text-lg font-bold text-neutral-800">€ {fmt2(totals.media)}</div>
              </div>
              <div className="bg-rose-50 rounded-2xl shadow p-4 border border-rose-200 text-center">
                <div className="text-[10px] font-semibold text-rose-500 uppercase">Media pranzo</div>
                <div className="text-lg font-bold text-rose-800">€ {fmt2(totals.media_pranzo)}</div>
              </div>
              <div className="bg-indigo-50 rounded-2xl shadow p-4 border border-indigo-200 text-center">
                <div className="text-[10px] font-semibold text-indigo-500 uppercase">Media cena</div>
                <div className="text-lg font-bold text-indigo-800">€ {fmt2(totals.media_cena)}</div>
              </div>
              <div className="bg-white rounded-2xl shadow p-4 border border-neutral-200 text-center">
                <div className="text-[10px] font-semibold text-neutral-400 uppercase">Giorni</div>
                <div className="text-lg font-bold text-neutral-800">{totals.count}</div>
                <div className="text-[9px] text-neutral-400">media/g € {fmt(totals.incassato / totals.count)}</div>
              </div>
            </div>

            {/* ═══ GRAFICO INCASSI GIORNALIERI ═══ */}
            <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
              <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-3">
                Incassi giornalieri — pranzo vs cena
              </h2>
              <BarChart
                data={data}
                barKey1="fatt_pranzo" barKey2="fatt_cena"
                label1="Pranzo" label2="Cena"
                color1="#f59e0b" color2="#6366f1"
                height={200}
              />
            </div>

            {/* ═══ GRAFICO MEDIA COPERTO ═══ */}
            <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
              <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-3">
                Media per coperto — andamento giornaliero
              </h2>
              <MediaLine data={data} height={130} />
            </div>

            {/* ═══ RIEPILOGO SETTIMANALE ═══ */}
            {weeks.length > 1 && (
              <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
                <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-3">
                  Riepilogo settimanale
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                  {weeks.map(w => (
                    <div key={w.week} className="bg-neutral-50 rounded-xl p-3 border border-neutral-200 text-center">
                      <div className="text-[10px] text-neutral-400 font-semibold uppercase">Sett. {w.week}</div>
                      <div className="text-base font-bold text-neutral-800">€ {fmt(w.incassato)}</div>
                      <div className="text-[10px] text-neutral-400">
                        {w.coperti} coperti · {w.days}g · € {w.coperti > 0 ? fmt2(w.incassato / w.coperti) : "—"}/cop
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ TABELLA COMPATTA ═══ */}
            <div className="bg-white rounded-2xl shadow border border-neutral-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">
                  Dettaglio giornaliero
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50/50">
                      <th className="px-2 py-2 text-left text-[10px] font-semibold text-neutral-400 uppercase w-10">S</th>
                      <th className="px-2 py-2 text-left text-[10px] font-semibold text-neutral-400 uppercase">Data</th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold text-neutral-500 uppercase">Incassato</th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold text-neutral-500 uppercase">Cop.</th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold text-neutral-500 uppercase">Media</th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold text-rose-500 uppercase">P</th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold text-indigo-500 uppercase">C</th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold text-rose-500 uppercase">Fatt.P</th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold text-indigo-500 uppercase">Fatt.C</th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold text-rose-500 uppercase">M.P</th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold text-indigo-500 uppercase">M.C</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {data.map((row, i) => {
                      const week = getWeek(row.date);
                      const prevWeek = i > 0 ? getWeek(data[i - 1].date) : null;
                      const isNewWeek = prevWeek !== null && week !== prevWeek;
                      const dayName = getDayName(row.date);
                      const isWeekend = dayName === "Sabato" || dayName === "Domenica";
                      const isBest = totals.bestDay && row.date === totals.bestDay.date;
                      return (
                        <tr key={row.date}
                          className={`hover:bg-neutral-50 ${isNewWeek ? "border-t-2 border-neutral-300" : ""} ${isWeekend ? "bg-rose-50/20" : ""} ${isBest ? "bg-emerald-50/40" : ""}`}>
                          <td className="px-2 py-1.5 text-neutral-300 text-[10px]">{week}</td>
                          <td className="px-2 py-1.5 text-neutral-700 text-xs">
                            <span className="font-medium">{getDay(row.date)}</span>
                            <span className="text-neutral-400 ml-1">{getDayShort(row.date)}</span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold text-neutral-800">€ {fmt(row.incassato)}</td>
                          <td className="px-2 py-1.5 text-right text-neutral-600">{row.coperti || "—"}</td>
                          <td className="px-2 py-1.5 text-right text-neutral-500 text-xs">€ {fmt2(row.media)}</td>
                          <td className="px-2 py-1.5 text-right text-rose-600 text-xs">{row.coperti_pranzo || "—"}</td>
                          <td className="px-2 py-1.5 text-right text-indigo-600 text-xs">{row.coperti_cena || "—"}</td>
                          <td className="px-2 py-1.5 text-right text-rose-600 text-xs">€ {fmt(row.fatt_pranzo)}</td>
                          <td className="px-2 py-1.5 text-right text-indigo-600 text-xs">€ {fmt(row.fatt_cena)}</td>
                          <td className="px-2 py-1.5 text-right text-rose-500 text-[10px]">{row.media_pranzo != null ? `€${fmt2(row.media_pranzo)}` : "—"}</td>
                          <td className="px-2 py-1.5 text-right text-indigo-500 text-[10px]">{row.media_cena != null ? `€${fmt2(row.media_cena)}` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-neutral-100 border-t-2 border-neutral-300 font-semibold text-xs">
                      <td className="px-2 py-2.5" colSpan={2}>
                        <span className="text-[10px] text-neutral-500 uppercase">Totale</span>
                      </td>
                      <td className="px-2 py-2.5 text-right text-neutral-900">€ {fmt(totals.incassato)}</td>
                      <td className="px-2 py-2.5 text-right text-neutral-700">{totals.coperti}</td>
                      <td className="px-2 py-2.5 text-right text-neutral-600">€ {fmt2(totals.media)}</td>
                      <td className="px-2 py-2.5 text-right text-rose-700">{totals.coperti_pranzo}</td>
                      <td className="px-2 py-2.5 text-right text-indigo-700">{totals.coperti_cena}</td>
                      <td className="px-2 py-2.5 text-right text-rose-700">€ {fmt(totals.fatt_pranzo)}</td>
                      <td className="px-2 py-2.5 text-right text-indigo-700">€ {fmt(totals.fatt_cena)}</td>
                      <td className="px-2 py-2.5 text-right text-rose-600">€{fmt2(totals.media_pranzo)}</td>
                      <td className="px-2 py-2.5 text-right text-indigo-600">€{fmt2(totals.media_cena)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
