// src/pages/admin/PrecontiAdmin.jsx
// @version: v1.0
// Pagina admin per controllo storico pre-conti (contanti non battuti al registratore)

import React, { useState, useEffect, useMemo } from "react";
import VenditeNav from "./VenditeNav";
import { API_BASE, apiFetch } from "../../config/api";

function fmt(n) {
  return Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PrecontiAdmin() {
  // Filtri data — default ultimi 30 giorni
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [data, setData] = useState({ preconti: [], totale: 0, count: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await apiFetch(`${API_BASE}/admin/finance/shift-closures/preconti?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [dateFrom, dateTo]);

  // Raggruppa per data
  const grouped = useMemo(() => {
    const map = new Map();
    for (const p of data.preconti) {
      const key = `${p.date}_${p.turno}`;
      if (!map.has(key)) {
        map.set(key, { date: p.date, turno: p.turno, created_by: p.created_by, items: [], totale: 0 });
      }
      const g = map.get(key);
      g.items.push(p);
      g.totale += p.importo;
    }
    return [...map.values()];
  }, [data.preconti]);

  return (
    <div className="min-h-screen bg-neutral-100">
      <VenditeNav current="preconti" />
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">

        {/* HEADER */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral-200">
          <h1 className="text-2xl font-bold text-amber-900">
            🍽️ Pre-conti
          </h1>
          <p className="text-neutral-500 text-sm mt-1">
            Contanti incassati ma non battuti al registratore — verifica corrispondenza tavoli
          </p>
        </div>

        {/* FILTRI */}
        <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">Da</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">A</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200" />
            </div>
            <div className="bg-orange-50 rounded-xl p-3 border border-orange-200 text-center">
              <div className="text-[10px] font-semibold text-orange-500 uppercase">Totale pre-conti</div>
              <div className="text-lg font-bold text-orange-800">€ {fmt(data.totale)}</div>
            </div>
            <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200 text-center">
              <div className="text-[10px] font-semibold text-neutral-400 uppercase">Registrazioni</div>
              <div className="text-lg font-bold text-neutral-700">{data.count}</div>
            </div>
          </div>
        </div>

        {/* CONTENUTO */}
        {loading && (
          <div className="bg-white rounded-2xl p-8 text-center text-neutral-400 animate-pulse">Caricamento...</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700 font-medium">{error}</div>
        )}

        {!loading && !error && grouped.length === 0 && (
          <div className="bg-white rounded-2xl shadow p-8 border border-neutral-200 text-center text-neutral-400">
            Nessun pre-conto trovato nel periodo selezionato.
          </div>
        )}

        {!loading && !error && grouped.map((g, gi) => (
          <div key={gi} className="bg-white rounded-2xl shadow border border-neutral-200 overflow-hidden">
            {/* Header giorno/turno */}
            <div className="flex items-center justify-between px-5 py-3 bg-neutral-50 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-neutral-800">
                  {new Date(g.date + "T00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  g.turno === "pranzo"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                }`}>
                  {g.turno === "pranzo" ? "☀️" : "🌙"} {g.turno}
                </span>
                <span className="text-xs text-neutral-400">inserita da {g.created_by || "—"}</span>
              </div>
              <span className="text-sm font-bold text-orange-700">€ {fmt(g.totale)}</span>
            </div>

            {/* Dettaglio tavoli */}
            <div className="divide-y divide-neutral-100">
              {g.items.map((item, ii) => (
                <div key={ii} className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-neutral-700 font-medium">{item.tavolo || "—"}</span>
                  <span className="text-sm font-semibold text-neutral-800">€ {fmt(item.importo)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

      </div>
    </div>
  );
}
