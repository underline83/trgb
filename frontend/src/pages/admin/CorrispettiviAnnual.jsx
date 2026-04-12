// src/pages/admin/CorrispettiviAnnual.jsx
// @version: v2.0-vendite — Confronto Annuale
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import VenditeNav from "./VenditeNav";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { API_BASE, apiFetch } from "../../config/api";
import TrgbLoader from "../../components/TrgbLoader";

const monthNames = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

function formatCurrency(value) {
  if (value == null) return "-";
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDelta(value, pct) {
  if (value == null) return "-";
  const sign = value >= 0 ? "+" : "";
  const pctStr = pct != null ? ` (${sign}${pct.toFixed(1)}%)` : "";
  return `${sign}€ ${formatCurrency(value)}${pctStr}`;
}

export default function CorrispettiviAnnual() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData(year);
  }, [year]);

  async function fetchData(y) {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await apiFetch(
        `${API_BASE}/admin/finance/stats/annual-compare?year=${y}`
      );
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Costruisce dati per il grafico mensile comparativo
  const chartData = data
    ? monthNames.map((name, i) => {
        const month = i + 1;
        const cur = data.current.mesi.find((m) => m.month === month);
        const prev = data.previous.mesi.find((m) => m.month === month);
        return {
          name,
          [data.current.year]: cur ? cur.totale_incassi : 0,
          [data.previous.year]: prev ? prev.totale_incassi : 0,
        };
      })
    : [];

  const deltaPositive = data && data.delta_incassi >= 0;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <VenditeNav current="annual" />

      <div className="p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Confronto Annuale</h1>
        </div>

        {/* Selettore anno */}
        <div className="flex items-center gap-3 mb-6">
          <label className="text-sm text-gray-600 font-medium">Anno:</label>
          <select
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
          >
            {Array.from({ length: 6 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {data && (
            <span className="text-sm text-gray-500">
              Confronto {data.current.year} vs {data.previous.year}
            </span>
          )}
        </div>

        {/* Stato */}
        {loading && <TrgbLoader size={40} className="my-4" />}
        {error && <p className="text-red-500 text-sm">Errore: {error}</p>}

        {data && (
          <>
            {/* Riepilogo totali */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Anno corrente */}
              <div className="bg-white rounded-xl shadow p-5 border-l-4 border-brand-blue">
                <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">
                  {data.current.year}
                </div>
                <div className="text-2xl font-bold text-gray-800">
                  € {formatCurrency(data.current.totale_incassi)}
                </div>
                <div className="text-xs text-gray-500 mt-1">Incassi totali</div>
              </div>

              {/* Anno precedente */}
              <div className="bg-white rounded-xl shadow p-5 border-l-4 border-gray-300">
                <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">
                  {data.previous.year}
                </div>
                <div className="text-2xl font-bold text-gray-600">
                  € {formatCurrency(data.previous.totale_incassi)}
                </div>
                <div className="text-xs text-gray-500 mt-1">Incassi totali</div>
              </div>

              {/* Delta */}
              <div
                className={`bg-white rounded-xl shadow p-5 border-l-4 ${
                  deltaPositive ? "border-green-500" : "border-red-400"
                }`}
              >
                <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">
                  Variazione
                </div>
                <div
                  className={`text-2xl font-bold ${
                    deltaPositive ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {formatDelta(data.delta_incassi, data.delta_incassi_pct)}
                </div>
                <div className="text-xs text-gray-500 mt-1">vs anno precedente</div>
              </div>
            </div>

            {/* Grafico mensile */}
            <div className="bg-white rounded-xl shadow p-5 mb-6">
              <h2 className="text-base font-semibold text-gray-700 mb-4">
                Incassi mensili — {data.current.year} vs {data.previous.year}
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value) => [`€ ${formatCurrency(value)}`, ""]}
                  />
                  <Legend />
                  <Bar dataKey={String(data.current.year)} fill="#2E7BE8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey={String(data.previous.year)} fill="#d1d5db" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tabella mensile dettaglio */}
            <div className="bg-white rounded-xl shadow p-5">
              <h2 className="text-base font-semibold text-gray-700 mb-4">Dettaglio mensile</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 text-xs border-b">
                      <th className="pb-2 pr-4">Mese</th>
                      <th className="pb-2 pr-4 text-right">{data.current.year}</th>
                      <th className="pb-2 pr-4 text-right">{data.previous.year}</th>
                      <th className="pb-2 text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthNames.map((name, i) => {
                      const month = i + 1;
                      const cur = data.current.mesi.find((m) => m.month === month);
                      const prev = data.previous.mesi.find((m) => m.month === month);
                      const curVal = cur ? cur.totale_incassi : null;
                      const prevVal = prev ? prev.totale_incassi : null;
                      const delta =
                        curVal != null && prevVal != null ? curVal - prevVal : null;
                      const positive = delta != null && delta >= 0;
                      return (
                        <tr key={month} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 pr-4 font-medium text-gray-700">{name}</td>
                          <td className="py-2 pr-4 text-right text-blue-700">
                            {curVal != null ? `€ ${formatCurrency(curVal)}` : "—"}
                          </td>
                          <td className="py-2 pr-4 text-right text-gray-500">
                            {prevVal != null ? `€ ${formatCurrency(prevVal)}` : "—"}
                          </td>
                          <td
                            className={`py-2 text-right font-medium ${
                              delta == null
                                ? "text-gray-300"
                                : positive
                                ? "text-green-600"
                                : "text-red-500"
                            }`}
                          >
                            {delta != null
                              ? `${positive ? "+" : ""}€ ${formatCurrency(delta)}`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold text-gray-800 border-t-2 border-gray-200">
                      <td className="pt-3 pr-4">Totale</td>
                      <td className="pt-3 pr-4 text-right text-blue-700">
                        € {formatCurrency(data.current.totale_incassi)}
                      </td>
                      <td className="pt-3 pr-4 text-right text-gray-500">
                        € {formatCurrency(data.previous.totale_incassi)}
                      </td>
                      <td
                        className={`pt-3 text-right ${
                          deltaPositive ? "text-green-600" : "text-red-500"
                        }`}
                      >
                        {`${deltaPositive ? "+" : ""}€ ${formatCurrency(data.delta_incassi)}`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
