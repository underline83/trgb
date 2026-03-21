// src/pages/admin/CorrispettiviRiepilogo.jsx
// @version: v1.0 — Riepilogo chiusure mese per mese (multi-anno)
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import VenditeNav from "./VenditeNav";

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const SHORT_MONTHS = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

function fmt(v) {
  if (v == null) return "-";
  return v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CorrispettiviRiepilogo() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  // Carica tutti gli anni disponibili
  const [yearsData, setYearsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedYear, setExpandedYear] = useState(currentYear);

  useEffect(() => {
    loadAllYears();
  }, []);

  async function loadAllYears() {
    setLoading(true);
    setError(null);
    const data = {};
    // Prova anni dal 2021 al corrente
    const years = [];
    for (let y = 2021; y <= currentYear; y++) years.push(y);

    try {
      const results = await Promise.all(
        years.map((y) =>
          apiFetch(`${API_BASE}/admin/finance/stats/annual?year=${y}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        )
      );
      results.forEach((r) => {
        if (r && r.mesi && r.mesi.length > 0) {
          data[r.year] = r;
        }
      });
      setYearsData(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const sortedYears = Object.keys(yearsData)
    .map(Number)
    .sort((a, b) => b - a);

  // Grand total
  const grandCorr = sortedYears.reduce((s, y) => s + (yearsData[y]?.totale_corrispettivi || 0), 0);
  const grandInc = sortedYears.reduce((s, y) => s + (yearsData[y]?.totale_incassi || 0), 0);

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <VenditeNav current="riepilogo" />

      <div className="p-6">
        <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
          {/* HEADER */}
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-indigo-900 tracking-wide font-playfair mb-2">
              Riepilogo Chiusure
            </h1>
            <p className="text-neutral-600">
              Panoramica delle chiusure cassa mese per mese, con totali annuali e medie giornaliere.
            </p>
          </div>

          {loading && (
            <p className="text-neutral-500 text-sm">Caricamento dati...</p>
          )}
          {error && (
            <p className="text-red-600 text-sm">Errore: {error}</p>
          )}

          {!loading && sortedYears.length === 0 && (
            <p className="text-neutral-500">Nessuna chiusura trovata nel database.</p>
          )}

          {/* TOTALI COMPLESSIVI */}
          {!loading && sortedYears.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
                <p className="text-[10px] uppercase tracking-wide text-indigo-700">Anni registrati</p>
                <p className="text-2xl font-bold text-indigo-900">{sortedYears.length}</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
                <p className="text-[10px] uppercase tracking-wide text-indigo-700">Corrispettivi totali</p>
                <p className="text-xl font-bold text-indigo-900">€ {fmt(grandCorr)}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                <p className="text-[10px] uppercase tracking-wide text-emerald-700">Incassi totali</p>
                <p className="text-xl font-bold text-emerald-900">€ {fmt(grandInc)}</p>
              </div>
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 text-center">
                <p className="text-[10px] uppercase tracking-wide text-neutral-600">Diff cassa totale</p>
                <p className={`text-xl font-bold ${grandInc - grandCorr >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  € {fmt(grandInc - grandCorr)}
                </p>
              </div>
            </div>
          )}

          {/* ACCORDION PER ANNO */}
          <div className="space-y-4">
            {sortedYears.map((year) => {
              const d = yearsData[year];
              const isOpen = expandedYear === year;
              const mesi = d.mesi || [];
              const totGg = mesi.reduce((s, m) => s + m.giorni_con_chiusura, 0);

              return (
                <div key={year} className="border border-neutral-200 rounded-2xl overflow-hidden">
                  {/* Year header — clickable */}
                  <button
                    onClick={() => setExpandedYear(isOpen ? null : year)}
                    className="w-full flex items-center justify-between px-6 py-4 bg-neutral-50 hover:bg-neutral-100 transition text-left"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-indigo-900 font-playfair">{year}</span>
                      <span className="text-sm text-neutral-600">
                        {mesi.length} mesi — {totGg} giorni aperti
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-right">
                        <span className="text-neutral-500">Corrispettivi: </span>
                        <span className="font-semibold text-indigo-900">€ {fmt(d.totale_corrispettivi)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-neutral-500">Incassi: </span>
                        <span className="font-semibold text-emerald-700">€ {fmt(d.totale_incassi)}</span>
                      </div>
                      <span className="text-neutral-400 text-lg">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {/* Monthly detail table */}
                  {isOpen && (
                    <div className="p-4 overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-neutral-50 text-neutral-700 text-xs uppercase tracking-wide">
                            <th className="border border-neutral-200 px-3 py-2 text-left">Mese</th>
                            <th className="border border-neutral-200 px-3 py-2 text-right">Gg Aperti</th>
                            <th className="border border-neutral-200 px-3 py-2 text-right">Corrispettivi</th>
                            <th className="border border-neutral-200 px-3 py-2 text-right">Incassi</th>
                            <th className="border border-neutral-200 px-3 py-2 text-right">Media Corr/gg</th>
                            <th className="border border-neutral-200 px-3 py-2 text-right">Media Inc/gg</th>
                            <th className="border border-neutral-200 px-3 py-2 text-right">Diff Cassa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mesi.map((m) => {
                            const diff = m.totale_incassi - m.totale_corrispettivi;
                            const diffAbs = Math.abs(diff);
                            return (
                              <tr
                                key={m.month}
                                className="hover:bg-indigo-50 cursor-pointer transition"
                                onClick={() => navigate(`/vendite/dashboard?year=${year}&month=${m.month}`)}
                                title={`Vai alla dashboard di ${MONTH_NAMES[m.month - 1]} ${year}`}
                              >
                                <td className="border border-neutral-200 px-3 py-2 font-medium text-neutral-800">
                                  {MONTH_NAMES[m.month - 1]}
                                </td>
                                <td className="border border-neutral-200 px-3 py-2 text-right text-neutral-700">
                                  {m.giorni_con_chiusura}
                                </td>
                                <td className="border border-neutral-200 px-3 py-2 text-right font-medium text-indigo-900">
                                  € {fmt(m.totale_corrispettivi)}
                                </td>
                                <td className="border border-neutral-200 px-3 py-2 text-right font-medium text-emerald-700">
                                  € {fmt(m.totale_incassi)}
                                </td>
                                <td className="border border-neutral-200 px-3 py-2 text-right text-neutral-600">
                                  € {fmt(m.media_corrispettivi)}
                                </td>
                                <td className="border border-neutral-200 px-3 py-2 text-right text-neutral-600">
                                  € {fmt(m.media_incassi)}
                                </td>
                                <td className={`border border-neutral-200 px-3 py-2 text-right font-medium ${
                                  diffAbs < 50 ? "text-neutral-500" : diff > 0 ? "text-emerald-600" : "text-red-600"
                                }`}>
                                  € {fmt(diff)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-neutral-50 font-bold text-neutral-900">
                            <td className="border border-neutral-200 px-3 py-2">Totale {year}</td>
                            <td className="border border-neutral-200 px-3 py-2 text-right">{totGg}</td>
                            <td className="border border-neutral-200 px-3 py-2 text-right text-indigo-900">
                              € {fmt(d.totale_corrispettivi)}
                            </td>
                            <td className="border border-neutral-200 px-3 py-2 text-right text-emerald-700">
                              € {fmt(d.totale_incassi)}
                            </td>
                            <td className="border border-neutral-200 px-3 py-2 text-right text-neutral-600">
                              € {fmt(totGg > 0 ? d.totale_corrispettivi / totGg : 0)}
                            </td>
                            <td className="border border-neutral-200 px-3 py-2 text-right text-neutral-600">
                              € {fmt(totGg > 0 ? d.totale_incassi / totGg : 0)}
                            </td>
                            <td className={`border border-neutral-200 px-3 py-2 text-right font-bold ${
                              d.totale_incassi - d.totale_corrispettivi >= 0 ? "text-emerald-600" : "text-red-600"
                            }`}>
                              € {fmt(d.totale_incassi - d.totale_corrispettivi)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
