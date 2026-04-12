// src/pages/admin/MancePage.jsx
// @version: v1.0 — Pagina Mance standalone (accessibile anche a ruolo SALA)
import React, { useState, useEffect, useMemo, useCallback } from "react";
import VenditeNav from "./VenditeNav";
import { API_BASE, apiFetch } from "../../config/api";

const MONTH_NAMES = [
  "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre",
];

function fmt(n) {
  return Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00");
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

export default function MancePage() {
  const now = new Date();
  const [anno, setAnno] = useState(now.getFullYear());
  const [mese, setMese] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchMance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/shift-closures`);
      if (!res.ok) throw new Error("Errore caricamento");
      const all = await res.json();
      const filtered = all.filter(sc => {
        if (!sc.date) return false;
        const [y, m] = sc.date.split("-").map(Number);
        return y === anno && m === mese && (sc.mance || 0) > 0;
      });
      filtered.sort((a, b) => b.date.localeCompare(a.date) || b.turno.localeCompare(a.turno));
      setRows(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [anno, mese]);

  useEffect(() => { fetchMance(); }, [fetchMance]);

  const totaleMance = useMemo(() => rows.reduce((s, r) => s + (r.mance || 0), 0), [rows]);
  const giorniConMance = useMemo(() => new Set(rows.map(r => r.date)).size, [rows]);

  return (
    <div className="min-h-screen bg-brand-cream">
      <VenditeNav current="mance" />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-5 md:p-6 space-y-5">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-neutral-800">Mance del mese</h2>
              <p className="text-xs text-neutral-500 mt-0.5">Mance registrate nelle chiusure turno — da distribuire ai ragazzi</p>
            </div>
            <div className="flex items-center gap-2">
              <select value={mese} onChange={e => setMese(Number(e.target.value))}
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white">
                {MONTH_NAMES.map((n, i) => (
                  <option key={i} value={i + 1}>{n}</option>
                ))}
              </select>
              <select value={anno} onChange={e => setAnno(Number(e.target.value))}
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white">
                {[now.getFullYear(), now.getFullYear() - 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-xs text-amber-600 font-semibold uppercase">Totale mance</p>
              <p className="text-2xl font-bold text-amber-800 mt-1">€ {fmt(totaleMance)}</p>
            </div>
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-center">
              <p className="text-xs text-violet-600 font-semibold uppercase">Turni con mance</p>
              <p className="text-2xl font-bold text-violet-800 mt-1">{rows.length}</p>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-center">
              <p className="text-xs text-teal-600 font-semibold uppercase">Giorni con mance</p>
              <p className="text-2xl font-bold text-teal-800 mt-1">{giorniConMance}</p>
            </div>
          </div>

          {/* Tabella */}
          {loading ? (
            <div className="text-center py-10 text-neutral-400">Caricamento...</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-neutral-400">
              <p className="text-3xl mb-2">🎁</p>
              <p>Nessuna mancia registrata in {MONTH_NAMES[mese - 1]} {anno}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-500 text-xs uppercase">
                    <th className="px-4 py-2.5 text-left">Data</th>
                    <th className="px-4 py-2.5 text-left">Turno</th>
                    <th className="px-4 py-2.5 text-right">Mancia €</th>
                    <th className="px-4 py-2.5 text-right">Coperti</th>
                    <th className="px-4 py-2.5 text-right">€ / coperto</th>
                    <th className="px-4 py-2.5 text-left">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const perCoperto = r.coperti > 0 ? (r.mance / r.coperti) : 0;
                    return (
                      <tr key={r.id} className="border-t border-neutral-100 hover:bg-amber-50/40 transition">
                        <td className="px-4 py-2.5 font-medium text-neutral-800">{fmtDate(r.date)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            r.turno === "pranzo"
                              ? "bg-amber-100 text-amber-700 border border-amber-200"
                              : "bg-indigo-100 text-indigo-700 border border-indigo-200"
                          }`}>
                            {r.turno === "pranzo" ? "Pranzo" : "Cena"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-amber-700">€ {fmt(r.mance)}</td>
                        <td className="px-4 py-2.5 text-right text-neutral-600">{r.coperti || "—"}</td>
                        <td className="px-4 py-2.5 text-right text-neutral-500">
                          {perCoperto > 0 ? `€ ${fmt(perCoperto)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-neutral-500 truncate max-w-[200px]">{r.note || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-bold bg-amber-50/60 border-t-2 border-amber-300">
                    <td className="px-4 py-2.5" colSpan={2}>Totale {MONTH_NAMES[mese - 1]}</td>
                    <td className="px-4 py-2.5 text-right text-amber-800">€ {fmt(totaleMance)}</td>
                    <td className="px-4 py-2.5 text-right text-neutral-600">
                      {rows.reduce((s, r) => s + (r.coperti || 0), 0)}
                    </td>
                    <td className="px-4 py-2.5" colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
