// @version: v1.2-banca-dashboard
// Dashboard Banca — panoramica saldo, entrate/uscite, andamento, breakdown
// v1.2: nuovo selettore periodi (Mese con scelta mese/anno, Anno con scelta anno, Personalizzato)
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FlussiCassaNav from "./FlussiCassaNav";

const FC = `${API_BASE}/banca`;

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const MESI_SHORT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

// Anni disponibili per selezione
const ANNI = [];
for (let y = 2020; y <= new Date().getFullYear() + 1; y++) ANNI.push(y);

export default function BancaDashboard() {
  const navigate = useNavigate();
  const isViewer = localStorage.getItem("role") === "viewer";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [andamento, setAndamento] = useState([]);

  // Modalità periodo: "mese" | "anno" | "custom" | "tutto"
  const [modo, setModo] = useState("mese");

  // Per modo "mese"
  const now = new Date();
  const [selMese, setSelMese] = useState(now.getMonth()); // 0-based
  const [selAnnoMese, setSelAnnoMese] = useState(now.getFullYear());

  // Per modo "anno"
  const [selAnno, setSelAnno] = useState(now.getFullYear());

  // Per modo "custom"
  const [customDa, setCustomDa] = useState("");
  const [customA, setCustomA] = useState("");

  // Date effettive calcolate
  const [dataDa, setDataDa] = useState("");
  const [dataA, setDataA] = useState("");

  // Calcola date in base al modo selezionato
  useEffect(() => {
    if (modo === "mese") {
      const y = selAnnoMese;
      const m = selMese;
      const da = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const last = new Date(y, m + 1, 0);
      const a = `${y}-${String(m + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
      setDataDa(da);
      setDataA(a);
    } else if (modo === "anno") {
      setDataDa(`${selAnno}-01-01`);
      setDataA(`${selAnno}-12-31`);
    } else if (modo === "custom") {
      if (customDa && customA) {
        setDataDa(customDa);
        setDataA(customA);
      }
    } else if (modo === "tutto") {
      setDataDa("2020-01-01");
      setDataA("2030-12-31");
    }
  }, [modo, selMese, selAnnoMese, selAnno, customDa, customA]);

  // Scegli raggruppamento automatico in base al range
  const calcRaggruppamento = (da, a) => {
    if (!da || !a) return "giorno";
    const d1 = new Date(da), d2 = new Date(a);
    const diffDays = (d2 - d1) / (1000 * 60 * 60 * 24);
    if (diffDays > 180) return "mese";
    if (diffDays > 45) return "settimana";
    return "giorno";
  };

  const raggruppamento = calcRaggruppamento(dataDa, dataA);
  const raggrLabels = { giorno: "giornaliero", settimana: "settimanale", mese: "mensile" };

  useEffect(() => {
    if (!dataDa || !dataA) return;
    loadData();
  }, [dataDa, dataA]);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const qs = `?data_da=${dataDa}&data_a=${dataA}`;
      const raggr = calcRaggruppamento(dataDa, dataA);
      const [dashResp, andResp] = await Promise.all([
        apiFetch(`${FC}/dashboard${qs}`),
        apiFetch(`${FC}/andamento${qs}&raggruppamento=${raggr}`),
      ]);
      if (!dashResp.ok) throw new Error("Errore caricamento dashboard");
      if (!andResp.ok) throw new Error("Errore caricamento andamento");
      setDashboard(await dashResp.json());
      setAndamento(await andResp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Navigazione mese avanti/indietro
  const mesePrev = () => {
    if (selMese === 0) {
      setSelMese(11);
      setSelAnnoMese(selAnnoMese - 1);
    } else {
      setSelMese(selMese - 1);
    }
  };
  const meseNext = () => {
    if (selMese === 11) {
      setSelMese(0);
      setSelAnnoMese(selAnnoMese + 1);
    } else {
      setSelMese(selMese + 1);
    }
  };

  // Barra grafico semplice
  const maxAbs = andamento.length
    ? Math.max(...andamento.map((a) => Math.max(a.entrate || 0, a.uscite || 0)), 1)
    : 1;

  // Etichetta periodo per il titolo
  const periodoLabel = modo === "mese"
    ? `${MESI[selMese]} ${selAnnoMese}`
    : modo === "anno"
    ? `Anno ${selAnno}`
    : modo === "tutto"
    ? "Tutti i dati"
    : `${dataDa} — ${dataA}`;

  // Bottone modo attivo
  const modoBtn = (key, label) => (
    <button
      key={key}
      onClick={() => setModo(key)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
        modo === key
          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
          : "border-neutral-200 bg-neutral-50 hover:bg-emerald-50 hover:border-emerald-300"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <FlussiCassaNav current="dashboard" />
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">
        <h1 className="text-3xl font-bold text-emerald-900 tracking-wide font-playfair mb-1">
          Dashboard Banca
        </h1>
        <p className="text-neutral-600 text-sm mb-6">
          Panoramica movimenti bancari Tre Gobbi S.R.L.
        </p>

        {/* Selettore periodo */}
        <div className="mb-6 space-y-3">
          {/* Riga 1: bottoni modo */}
          <div className="flex flex-wrap items-center gap-2">
            {modoBtn("mese", "Mese")}
            {modoBtn("anno", "Anno")}
            {modoBtn("custom", "Personalizzato")}
            {modoBtn("tutto", "Tutto")}
          </div>

          {/* Riga 2: controlli specifici per modo */}
          <div className="flex flex-wrap items-center gap-2">
            {modo === "mese" && (
              <>
                <button
                  onClick={mesePrev}
                  className="px-2 py-1 rounded-lg text-sm border border-neutral-200 hover:bg-neutral-100 transition"
                  title="Mese precedente"
                >
                  ←
                </button>
                <select
                  value={selMese}
                  onChange={(e) => setSelMese(Number(e.target.value))}
                  className="border rounded-lg px-2 py-1 text-sm bg-white"
                >
                  {MESI.map((m, i) => (
                    <option key={i} value={i}>{m}</option>
                  ))}
                </select>
                <select
                  value={selAnnoMese}
                  onChange={(e) => setSelAnnoMese(Number(e.target.value))}
                  className="border rounded-lg px-2 py-1 text-sm bg-white"
                >
                  {ANNI.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <button
                  onClick={meseNext}
                  className="px-2 py-1 rounded-lg text-sm border border-neutral-200 hover:bg-neutral-100 transition"
                  title="Mese successivo"
                >
                  →
                </button>
              </>
            )}

            {modo === "anno" && (
              <>
                <button
                  onClick={() => setSelAnno(selAnno - 1)}
                  className="px-2 py-1 rounded-lg text-sm border border-neutral-200 hover:bg-neutral-100 transition"
                >
                  ←
                </button>
                <select
                  value={selAnno}
                  onChange={(e) => setSelAnno(Number(e.target.value))}
                  className="border rounded-lg px-2 py-1 text-sm bg-white"
                >
                  {ANNI.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <button
                  onClick={() => setSelAnno(selAnno + 1)}
                  className="px-2 py-1 rounded-lg text-sm border border-neutral-200 hover:bg-neutral-100 transition"
                >
                  →
                </button>
                <span className="text-xs text-neutral-400 ml-2">
                  Raggruppamento: mensile
                </span>
              </>
            )}

            {modo === "custom" && (
              <>
                <input
                  type="date"
                  value={customDa}
                  onChange={(e) => setCustomDa(e.target.value)}
                  className="border rounded-lg px-2 py-1 text-sm"
                />
                <span className="text-neutral-400 text-xs">→</span>
                <input
                  type="date"
                  value={customA}
                  onChange={(e) => setCustomA(e.target.value)}
                  className="border rounded-lg px-2 py-1 text-sm"
                />
                {customDa && customA && (
                  <span className="text-xs text-neutral-400 ml-2">
                    Raggruppamento: {raggrLabels[raggruppamento]}
                  </span>
                )}
              </>
            )}

            {modo === "tutto" && (
              <span className="text-xs text-neutral-400">
                Tutti i movimenti disponibili — raggruppamento: {raggrLabels[raggruppamento]}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-neutral-500">Caricamento...</div>
        ) : !dashboard || dashboard.totals.num_movimenti === 0 ? (
          <div className="text-center py-12 text-neutral-500">
            Nessun movimento trovato per il periodo selezionato.
            {!isViewer && (
              <>
                <br />
                <button
                  onClick={() => navigate("/banca/import")}
                  className="mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow transition"
                >
                  Importa CSV
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs text-emerald-600 font-medium mb-1">Entrate</div>
                <div className="text-xl font-bold text-emerald-800">
                  +{fmt(dashboard.totals.totale_entrate)}
                </div>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <div className="text-xs text-red-600 font-medium mb-1">Uscite</div>
                <div className="text-xl font-bold text-red-800">
                  {fmt(dashboard.totals.totale_uscite)}
                </div>
              </div>
              <div className={`rounded-2xl border p-4 ${
                dashboard.totals.saldo_periodo >= 0
                  ? "border-blue-200 bg-blue-50"
                  : "border-orange-200 bg-orange-50"
              }`}>
                <div className="text-xs text-neutral-600 font-medium mb-1">Saldo Periodo</div>
                <div className={`text-xl font-bold ${
                  dashboard.totals.saldo_periodo >= 0 ? "text-blue-800" : "text-orange-800"
                }`}>
                  {fmt(dashboard.totals.saldo_periodo)}
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-xs text-neutral-600 font-medium mb-1">Movimenti</div>
                <div className="text-xl font-bold text-neutral-800">
                  {dashboard.totals.num_movimenti}
                </div>
              </div>
            </div>

            {/* Grafico andamento (barre CSS) */}
            {andamento.length > 1 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-neutral-800 mb-3">
                  Andamento {raggrLabels[raggruppamento]} — {periodoLabel}
                </h2>
                <div className="w-full">
                  <div className="flex items-end gap-1 w-full">
                    {andamento.map((a, i) => {
                      const hE = Math.max((a.entrate / maxAbs) * 140, 2);
                      const hU = Math.max((a.uscite / maxAbs) * 140, 2);
                      const periodo = a.periodo || "";
                      const day = raggruppamento === "mese"
                        ? (MESI_SHORT[parseInt(periodo.slice(-2), 10) - 1] || periodo.slice(-2))
                        : raggruppamento === "settimana"
                        ? "W" + periodo.slice(-2)
                        : periodo.slice(-2);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center min-w-0">
                          <div className="flex gap-px items-end w-full justify-center" style={{ height: 150 }}>
                            <div
                              className="bg-emerald-400 rounded-t flex-1 max-w-[14px]"
                              style={{ height: hE }}
                              title={`Entrate: ${fmt(a.entrate)}`}
                            />
                            <div
                              className="bg-red-400 rounded-t flex-1 max-w-[14px]"
                              style={{ height: hU }}
                              title={`Uscite: ${fmt(a.uscite)}`}
                            />
                          </div>
                          <div className="text-[9px] text-neutral-400 mt-1 truncate w-full text-center">{day}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-emerald-400 rounded inline-block" /> Entrate
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-400 rounded inline-block" /> Uscite
                  </span>
                </div>
              </div>
            )}

            {/* Breakdown uscite per categoria */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h2 className="text-lg font-semibold text-neutral-800 mb-3">Uscite per categoria</h2>
                {dashboard.uscite_per_categoria.length === 0 ? (
                  <p className="text-sm text-neutral-400">Nessuna uscita nel periodo.</p>
                ) : (
                  <div className="space-y-2">
                    {dashboard.uscite_per_categoria.map((c, i) => {
                      const pct = dashboard.totals.totale_uscite !== 0
                        ? Math.abs(c.totale / dashboard.totals.totale_uscite) * 100
                        : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-36 text-xs text-neutral-700 truncate" title={`${c.categoria_banca} - ${c.sottocategoria_banca}`}>
                            {c.sottocategoria_banca || c.categoria_banca}
                          </div>
                          <div className="flex-1 bg-neutral-100 rounded-full h-4 overflow-hidden">
                            <div
                              className="bg-red-400 h-full rounded-full transition-all"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <div className="text-xs font-mono text-neutral-600 w-24 text-right">
                            {fmt(c.totale)}
                          </div>
                          <div className="text-[10px] text-neutral-400 w-10 text-right">
                            {pct.toFixed(0)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-lg font-semibold text-neutral-800 mb-3">Entrate per categoria</h2>
                {dashboard.entrate_per_categoria.length === 0 ? (
                  <p className="text-sm text-neutral-400">Nessuna entrata nel periodo.</p>
                ) : (
                  <div className="space-y-2">
                    {dashboard.entrate_per_categoria.map((c, i) => {
                      const pct = dashboard.totals.totale_entrate
                        ? (c.totale / dashboard.totals.totale_entrate) * 100
                        : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-36 text-xs text-neutral-700 truncate" title={`${c.categoria_banca} - ${c.sottocategoria_banca}`}>
                            {c.sottocategoria_banca || c.categoria_banca}
                          </div>
                          <div className="flex-1 bg-neutral-100 rounded-full h-4 overflow-hidden">
                            <div
                              className="bg-emerald-400 h-full rounded-full transition-all"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <div className="text-xs font-mono text-neutral-600 w-24 text-right">
                            +{fmt(c.totale)}
                          </div>
                          <div className="text-[10px] text-neutral-400 w-10 text-right">
                            {pct.toFixed(0)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Ultimi movimenti */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-neutral-800 mb-3">Ultimi movimenti</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-neutral-500 text-xs">
                      <th className="pb-2">Data</th>
                      <th className="pb-2">Descrizione</th>
                      <th className="pb-2">Categoria</th>
                      <th className="pb-2 text-right">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.ultimi_movimenti.map((m) => (
                      <tr key={m.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                        <td className="py-2 text-xs text-neutral-500 whitespace-nowrap">{m.data_contabile}</td>
                        <td className="py-2 text-xs truncate max-w-xs" title={m.descrizione}>{m.descrizione}</td>
                        <td className="py-2 text-xs text-neutral-500">{m.sottocategoria_banca || m.categoria_banca}</td>
                        <td className={`py-2 text-xs text-right font-mono font-semibold ${
                          m.importo >= 0 ? "text-emerald-700" : "text-red-600"
                        }`}>
                          {m.importo >= 0 ? "+" : ""}{fmt(m.importo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-center">
                <button
                  onClick={() => navigate("/banca/movimenti")}
                  className="text-sm text-emerald-700 hover:text-emerald-900 font-medium"
                >
                  Vedi tutti i movimenti →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
