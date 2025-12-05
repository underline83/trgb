// @version: v1.0-fe-dashboard
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

export default function FattureDashboard() {
  const navigate = useNavigate();

  const [fatture, setFatture] = useState([]);
  const [fattureLoading, setFattureLoading] = useState(false);

  const [selectedYear, setSelectedYear] = useState("all");
  const [statsSuppliers, setStatsSuppliers] = useState([]);
  const [statsMonthly, setStatsMonthly] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);

  // carica le fatture solo per derivare gli anni disponibili
  const fetchFattureBase = async () => {
    setFattureLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/contabilita/fe/fatture`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error("Errore nel caricamento fatture.");
      }
      const data = await res.json();
      setFatture(data || []);
    } catch {
      // per la dashboard basta derivare gli anni, non blocchiamo tutto
    } finally {
      setFattureLoading(false);
    }
  };

  const fetchStats = async (yearParam = "all") => {
    setStatsLoading(true);
    setStatsError(null);

    try {
      const token = localStorage.getItem("token");
      const query =
        yearParam === "all" ? "" : `?year=${encodeURIComponent(yearParam)}`;

      const [resFor, resMens] = await Promise.all([
        fetch(`${API_BASE}/contabilita/fe/stats/fornitori${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/contabilita/fe/stats/mensili${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!resFor.ok) {
        const err = await resFor.json().catch(() => ({}));
        throw new Error(err.detail || "Errore stats fornitori.");
      }
      if (!resMens.ok) {
        const err = await resMens.json().catch(() => ({}));
        throw new Error(err.detail || "Errore stats mensili.");
      }

      const dataFor = await resFor.json();
      const dataMens = await resMens.json();

      setStatsSuppliers(dataFor || []);
      setStatsMonthly(dataMens || []);
    } catch (e) {
      setStatsError(e.message);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchFattureBase();
    fetchStats("all");
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set();
    fatture.forEach((f) => {
      if (f.data_fattura) {
        const y = f.data_fattura.slice(0, 4);
        if (y) years.add(y);
      }
    });
    return Array.from(years).sort();
  }, [fatture]);

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📈 Dashboard Acquisti da Fatture
            </h1>
            <p className="text-neutral-600 text-sm sm:text-base">
              Analisi degli acquisti a partire dalle fatture elettroniche
              importate: top fornitori, andamento mensile e volumi per anno.
            </p>
            {fattureLoading && (
              <p className="text-xs text-neutral-500 mt-1">
                Caricamento base dati fatture…
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => navigate("/admin/fatture")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Menu Fatture
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-300 bg-white hover:bg-neutral-50 shadow-sm transition"
            >
              ← Amministrazione
            </button>
          </div>
        </div>

        {/* FILTRO ANNO */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold font-playfair text-amber-900">
              Riepilogo acquisti per anno
            </h2>
            <p className="text-xs text-neutral-600">
              I dati si basano esclusivamente sulle fatture XML importate nel
              modulo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-600">
              Anno di riferimento:
            </label>
            <select
              value={selectedYear}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedYear(val);
                fetchStats(val === "all" ? "all" : Number(val));
              }}
              className="text-sm border border-neutral-300 rounded-xl px-3 py-1 bg-white shadow-sm"
            >
              <option value="all">Tutti gli anni</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {statsError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">
            Errore nel caricamento delle statistiche: {statsError}
          </div>
        )}

        {statsLoading && (
          <p className="text-sm text-neutral-500 mb-4">
            Caricamento statistiche in corso…
          </p>
        )}

        {!statsLoading && !statsError && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* TABELLA FORNITORI */}
            <div className="border border-neutral-200 rounded-2xl bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50">
                <h3 className="text-sm font-semibold text-neutral-800">
                  Top fornitori per totale acquisti
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Ordinati per totale fatture in euro.
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {statsSuppliers.length === 0 ? (
                  <p className="text-xs text-neutral-500 px-4 py-3">
                    Nessun dato disponibile per il periodo selezionato.
                  </p>
                ) : (
                  <table className="min-w-full text-xs">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Fornitore</th>
                        <th className="px-3 py-2 text-right">N. fatture</th>
                        <th className="px-3 py-2 text-right">Totale €</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statsSuppliers.map((s, idx) => (
                        <tr
                          key={`${s.fornitore_nome}-${idx}`}
                          className="border-t border-neutral-200 hover:bg-neutral-50"
                        >
                          <td className="px-3 py-2 align-top">
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {s.fornitore_nome}
                              </span>
                              {s.fornitore_piva && (
                                <span className="text-[10px] text-neutral-500">
                                  P.IVA: {s.fornitore_piva}
                                </span>
                              )}
                              <span className="text-[10px] text-neutral-500 mt-0.5">
                                {s.primo_acquisto} → {s.ultimo_acquisto}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right align-middle">
                            {s.numero_fatture}
                          </td>
                          <td className="px-3 py-2 text-right align-middle">
                            {s.totale_fatture != null
                              ? s.totale_fatture.toLocaleString("it-IT", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* TABELLA MENSILE */}
            <div className="border border-neutral-200 rounded-2xl bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50">
                <h3 className="text-sm font-semibold text-neutral-800">
                  Andamento mensile degli acquisti
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Numero fatture e totale per mese.
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {statsMonthly.length === 0 ? (
                  <p className="text-xs text-neutral-500 px-4 py-3">
                    Nessun dato disponibile per il periodo selezionato.
                  </p>
                ) : (
                  <table className="min-w-full text-xs">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Anno</th>
                        <th className="px-3 py-2 text-left">Mese</th>
                        <th className="px-3 py-2 text-right">N. fatture</th>
                        <th className="px-3 py-2 text-right">Totale €</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statsMonthly.map((m, idx) => (
                        <tr
                          key={`${m.anno}-${m.mese}-${idx}`}
                          className="border-t border-neutral-200 hover:bg-neutral-50"
                        >
                          <td className="px-3 py-2 align-middle">{m.anno}</td>
                          <td className="px-3 py-2 align-middle">
                            {String(m.mese).padStart(2, "0")}
                          </td>
                          <td className="px-3 py-2 text-right align-middle">
                            {m.numero_fatture}
                          </td>
                          <td className="px-3 py-2 text-right align-middle">
                            {m.totale_fatture != null
                              ? m.totale_fatture.toLocaleString("it-IT", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* LINK RAPIDO ALL'IMPORT */}
        <div className="mt-8 border-t border-neutral-200 pt-4 flex justify-between items-center">
          <p className="text-xs text-neutral-500">
            Per aggiornare i dati della dashboard importa nuove fatture dalla
            pagina dedicata.
          </p>
          <button
            type="button"
            onClick={() => navigate("/admin/fatture/import")}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition"
          >
            Vai all&apos;Import XML →
          </button>
        </div>
      </div>
    </div>
  );
}
