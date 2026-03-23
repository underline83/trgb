// src/pages/admin/PrecontiOggi.jsx
// @version: v1.0 — Pre-conti di oggi (visibile a tutti i ruoli)
// Mostra i pre-conti del giorno corrente. Una volta "chiuso" il giorno, non mostra nulla.
import React, { useState, useEffect, useMemo } from "react";
import VenditeNav from "./VenditeNav";
import { API_BASE, apiFetch } from "../../config/api";
import { isSuperAdminRole } from "../../utils/authHelpers";
import { useNavigate } from "react-router-dom";

function fmt(n) {
  return Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PrecontiOggi() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const today = new Date().toISOString().slice(0, 10);

  const [data, setData] = useState({ preconti: [], totale: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ date_from: today, date_to: today });
        const res = await apiFetch(`${API_BASE}/admin/finance/shift-closures/preconti?${params}`);
        if (!res.ok) throw new Error(`Errore ${res.status}`);
        setData(await res.json());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [today]);

  const flatRows = useMemo(() => {
    const rows = [];
    const map = new Map();
    for (const p of data.preconti) {
      const key = `${p.date}_${p.turno}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    for (const items of map.values()) {
      for (const item of items) rows.push(item);
    }
    return rows;
  }, [data.preconti]);

  const todayLabel = new Date(today + "T00:00").toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="min-h-screen bg-neutral-100">
      <VenditeNav current="preconti" />
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden p-5 md:p-6">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h1 className="text-2xl font-bold text-indigo-900 font-playfair">Pre-conti di oggi</h1>
              <p className="text-neutral-500 text-sm mt-1 capitalize">{todayLabel}</p>
            </div>
            {isSuperAdminRole(role) && (
              <button
                onClick={() => navigate("/vendite/contanti")}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition"
              >
                Storico completo →
              </button>
            )}
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
              <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide">Totale pre-conti</p>
              <p className="text-2xl font-bold text-orange-800 mt-1">€ {fmt(data.totale)}</p>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 text-center">
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Tavoli</p>
              <p className="text-2xl font-bold text-neutral-700 mt-1">{data.count}</p>
            </div>
          </div>

          {/* Loading / Error */}
          {loading && <div className="text-sm text-neutral-500 animate-pulse py-8 text-center">Caricamento...</div>}
          {error && <div className="text-sm text-red-600 py-4">Errore: {error}</div>}

          {/* Empty state */}
          {!loading && !error && flatRows.length === 0 && (
            <div className="bg-neutral-50 rounded-xl p-8 text-center text-neutral-400 border border-neutral-200">
              Nessun pre-conto registrato oggi.
            </div>
          )}

          {/* Table */}
          {!loading && !error && flatRows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-neutral-200">
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-700">
                    <th className="border-b border-neutral-200 px-3 py-2 text-left">Turno</th>
                    <th className="border-b border-neutral-200 px-3 py-2 text-left">Tavolo</th>
                    <th className="border-b border-neutral-200 px-3 py-2 text-right">Importo</th>
                    <th className="border-b border-neutral-200 px-3 py-2 text-left">Inserito da</th>
                  </tr>
                </thead>
                <tbody>
                  {flatRows.map((row, idx) => {
                    const prevTurno = idx > 0 ? flatRows[idx - 1].turno : null;
                    const isNewGroup = row.turno !== prevTurno;
                    return (
                      <tr key={idx} className={`hover:bg-indigo-50 ${isNewGroup && idx > 0 ? "border-t-2 border-neutral-200" : ""}`}>
                        <td className="border-b border-neutral-100 px-3 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            row.turno === "pranzo"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-indigo-50 text-indigo-700 border-indigo-200"
                          }`}>
                            {row.turno === "pranzo" ? "☀️" : "🌙"} {row.turno}
                          </span>
                        </td>
                        <td className="border-b border-neutral-100 px-3 py-2 font-medium text-neutral-700">
                          {row.tavolo || "—"}
                        </td>
                        <td className="border-b border-neutral-100 px-3 py-2 text-right font-semibold text-orange-700">
                          € {fmt(row.importo)}
                        </td>
                        <td className="border-b border-neutral-100 px-3 py-2 text-xs text-neutral-400">
                          {row.created_by || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-bold bg-neutral-50 border-t-2 border-neutral-300">
                    <td className="px-3 py-2" colSpan={2}>Totale ({data.count} tavoli)</td>
                    <td className="px-3 py-2 text-right text-orange-700">€ {fmt(data.totale)}</td>
                    <td className="px-3 py-2"></td>
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
