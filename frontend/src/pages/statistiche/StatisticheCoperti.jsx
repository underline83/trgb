// src/pages/statistiche/StatisticheCoperti.jsx
// @version: v1.0
// Statistiche giornaliere coperti & incassi — dati da chiusure turno

import React, { useState, useEffect, useMemo } from "react";
import StatisticheNav from "./StatisticheNav";
import { API_BASE, apiFetch } from "../../config/api";

const DAYS_IT = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const MONTHS_IT = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n) {
  return n != null && n > 0 ? n : "—";
}

function getWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getDayName(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return DAYS_IT[d.getDay()];
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y.slice(2)}`;
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

  // Totali / medie
  const totals = useMemo(() => {
    if (!data.length) return null;
    const t = {
      incassato: 0, coperti: 0,
      coperti_pranzo: 0, coperti_cena: 0,
      fatt_pranzo: 0, fatt_cena: 0, count: data.length,
    };
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
    return t;
  }, [data]);

  return (
    <div className="min-h-screen bg-neutral-100">
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
                Statistiche giornaliere da chiusure turno
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white">
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white">
                {MONTHS_IT.slice(1).map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* KPI TILES */}
        {totals && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl shadow p-4 border border-neutral-200 text-center">
              <div className="text-[10px] font-semibold text-neutral-400 uppercase">Incassato mese</div>
              <div className="text-xl font-bold text-neutral-800 mt-1">€ {fmt(totals.incassato)}</div>
            </div>
            <div className="bg-white rounded-2xl shadow p-4 border border-neutral-200 text-center">
              <div className="text-[10px] font-semibold text-neutral-400 uppercase">Coperti totali</div>
              <div className="text-xl font-bold text-neutral-800 mt-1">{totals.coperti}</div>
            </div>
            <div className="bg-white rounded-2xl shadow p-4 border border-neutral-200 text-center">
              <div className="text-[10px] font-semibold text-neutral-400 uppercase">Media coperto</div>
              <div className="text-xl font-bold text-neutral-800 mt-1">€ {fmt(totals.media)}</div>
            </div>
            <div className="bg-white rounded-2xl shadow p-4 border border-neutral-200 text-center">
              <div className="text-[10px] font-semibold text-neutral-400 uppercase">Giorni registrati</div>
              <div className="text-xl font-bold text-neutral-800 mt-1">{totals.count}</div>
            </div>
          </div>
        )}

        {/* TABELLA */}
        {loading && (
          <div className="bg-white rounded-2xl p-8 text-center text-neutral-400 animate-pulse">Caricamento...</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && data.length === 0 && (
          <div className="bg-white rounded-2xl shadow p-8 border border-neutral-200 text-center text-neutral-400">
            Nessuna chiusura trovata per {MONTHS_IT[month]} {year}.
          </div>
        )}

        {!loading && !error && data.length > 0 && (
          <div className="bg-white rounded-2xl shadow border border-neutral-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200">
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-neutral-500 uppercase">Sett.</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-neutral-500 uppercase">Data</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-neutral-500 uppercase">Giorno</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-neutral-500 uppercase">Incassato</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-neutral-500 uppercase">Coperti</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-neutral-500 uppercase">Media</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-amber-600 uppercase">Pranzo</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-indigo-600 uppercase">Cena</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-amber-600 uppercase">Fatt. Pranzo</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-indigo-600 uppercase">Fatt. Cena</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-amber-600 uppercase">Media P.</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-indigo-600 uppercase">Media C.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.map((row, i) => {
                    const week = getWeek(row.date);
                    const prevWeek = i > 0 ? getWeek(data[i - 1].date) : null;
                    const isNewWeek = prevWeek !== null && week !== prevWeek;
                    const dayName = getDayName(row.date);
                    const isWeekend = dayName === "Sabato" || dayName === "Domenica";

                    return (
                      <tr key={row.date}
                        className={`hover:bg-neutral-50 transition ${isNewWeek ? "border-t-2 border-neutral-300" : ""} ${isWeekend ? "bg-amber-50/30" : ""}`}>
                        <td className="px-3 py-2 text-neutral-400 text-xs">{week}</td>
                        <td className="px-3 py-2 font-medium text-neutral-700">{formatDate(row.date)}</td>
                        <td className="px-3 py-2 text-neutral-500 text-xs">{dayName}</td>
                        <td className="px-3 py-2 text-right font-semibold text-neutral-800">€ {fmt(row.incassato)}</td>
                        <td className="px-3 py-2 text-right text-neutral-700">{fmtInt(row.coperti)}</td>
                        <td className="px-3 py-2 text-right text-neutral-600">€ {fmt(row.media)}</td>
                        <td className="px-3 py-2 text-right text-amber-700">{fmtInt(row.coperti_pranzo)}</td>
                        <td className="px-3 py-2 text-right text-indigo-700">{fmtInt(row.coperti_cena)}</td>
                        <td className="px-3 py-2 text-right text-amber-700">€ {fmt(row.fatt_pranzo)}</td>
                        <td className="px-3 py-2 text-right text-indigo-700">€ {fmt(row.fatt_cena)}</td>
                        <td className="px-3 py-2 text-right text-amber-600 text-xs">{row.media_pranzo != null ? `€ ${fmt(row.media_pranzo)}` : "—"}</td>
                        <td className="px-3 py-2 text-right text-indigo-600 text-xs">{row.media_cena != null ? `€ ${fmt(row.media_cena)}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* RIGA TOTALI */}
                {totals && (
                  <tfoot>
                    <tr className="bg-neutral-100 border-t-2 border-neutral-300 font-semibold">
                      <td className="px-3 py-3" colSpan={3}>
                        <span className="text-xs text-neutral-500 uppercase">Totale {MONTHS_IT[month]}</span>
                      </td>
                      <td className="px-3 py-3 text-right text-neutral-900">€ {fmt(totals.incassato)}</td>
                      <td className="px-3 py-3 text-right text-neutral-700">{totals.coperti}</td>
                      <td className="px-3 py-3 text-right text-neutral-600">€ {fmt(totals.media)}</td>
                      <td className="px-3 py-3 text-right text-amber-700">{totals.coperti_pranzo}</td>
                      <td className="px-3 py-3 text-right text-indigo-700">{totals.coperti_cena}</td>
                      <td className="px-3 py-3 text-right text-amber-700">€ {fmt(totals.fatt_pranzo)}</td>
                      <td className="px-3 py-3 text-right text-indigo-700">€ {fmt(totals.fatt_cena)}</td>
                      <td className="px-3 py-3 text-right text-amber-600 text-xs">€ {fmt(totals.media_pranzo)}</td>
                      <td className="px-3 py-3 text-right text-indigo-600 text-xs">€ {fmt(totals.media_cena)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
