// @version: v1.0-finanza-dashboard
// Dashboard Finanza con doppia vista (analitico/finanziario), pivot mensile, categorie
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FinanzaNav from "./FinanzaNav";

const FC = `${API_BASE}/finanza`;

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const ANNI_DISPONIBILI = [];
for (let y = 2021; y <= new Date().getFullYear() + 1; y++) ANNI_DISPONIBILI.push(y);

export default function FinanzaDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(null);

  const [anno, setAnno] = useState(new Date().getFullYear());
  const [vista, setVista] = useState("analitico");

  // Stats riconciliazione
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadAll();
  }, [anno, vista]);

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [dashResp, statsResp] = await Promise.all([
        apiFetch(`${FC}/dashboard?anno=${anno}&vista=${vista}`),
        apiFetch(`${FC}/stats`),
      ]);
      if (!dashResp.ok) throw new Error("Errore dashboard");
      setDashboard(await dashResp.json());
      if (statsResp.ok) setStats(await statsResp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const maxMese = dashboard?.mesi
    ? Math.max(...dashboard.mesi.map((m) => Math.max(m.entrate, m.uscite)), 1)
    : 1;

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <FinanzaNav current="dashboard" />
      <div className="max-w-7xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-3xl font-bold text-violet-900 tracking-wide font-playfair">
            Dashboard Finanza
          </h1>
          {/* Toggle vista */}
          <div className="flex rounded-lg overflow-hidden border border-violet-300">
            <button
              onClick={() => setVista("analitico")}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                vista === "analitico" ? "bg-violet-600 text-white" : "bg-white text-violet-700 hover:bg-violet-50"
              }`}
            >
              Analitico
            </button>
            <button
              onClick={() => setVista("finanziario")}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                vista === "finanziario" ? "bg-violet-600 text-white" : "bg-white text-violet-700 hover:bg-violet-50"
              }`}
            >
              Finanziario
            </button>
          </div>
        </div>
        <p className="text-neutral-600 text-sm mb-4">
          Vista {vista === "analitico" ? "per competenza" : "per cassa"} — {anno}
        </p>

        {/* Selezione anno */}
        <div className="flex items-center gap-2 mb-6">
          <button onClick={() => setAnno(anno - 1)} className="px-2 py-1 rounded-lg text-sm border hover:bg-neutral-100">←</button>
          <select value={anno} onChange={(e) => setAnno(Number(e.target.value))} className="border rounded-lg px-2 py-1 text-sm bg-white">
            {ANNI_DISPONIBILI.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setAnno(anno + 1)} className="px-2 py-1 rounded-lg text-sm border hover:bg-neutral-100">→</button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-12 text-neutral-500">Caricamento...</div>
        ) : !dashboard || dashboard.totali.num_movimenti === 0 ? (
          <div className="text-center py-12 text-neutral-500">
            Nessun dato per il {anno}.
            <br />
            <button onClick={() => navigate("/finanza/import")} className="mt-4 px-5 py-2 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 shadow transition">
              Importa Excel
            </button>
          </div>
        ) : (
          <>
            {/* KPI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs text-emerald-600 font-medium mb-1">Entrate</div>
                <div className="text-xl font-bold text-emerald-800">+{fmt(dashboard.totali.totale_entrate)}</div>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <div className="text-xs text-red-600 font-medium mb-1">Uscite</div>
                <div className="text-xl font-bold text-red-800">{fmt(dashboard.totali.totale_uscite)}</div>
              </div>
              <div className={`rounded-2xl border p-4 ${dashboard.totali.saldo >= 0 ? "border-blue-200 bg-blue-50" : "border-orange-200 bg-orange-50"}`}>
                <div className="text-xs text-neutral-600 font-medium mb-1">Saldo {anno}</div>
                <div className={`text-xl font-bold ${dashboard.totali.saldo >= 0 ? "text-blue-800" : "text-orange-800"}`}>{fmt(dashboard.totali.saldo)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-xs text-neutral-600 font-medium mb-1">Movimenti</div>
                <div className="text-xl font-bold text-neutral-800">{dashboard.totali.num_movimenti}</div>
              </div>
            </div>

            {/* Riconciliazione */}
            {stats && (
              <div className="mb-8">
                <h2 className="text-sm font-semibold text-neutral-700 mb-2">Stato riconciliazione</h2>
                <div className="flex gap-3">
                  {[
                    { key: "X", label: "Banca", color: "emerald" },
                    { key: "C", label: "Contanti", color: "amber" },
                    { key: "pending", label: "Da fare", color: "red" },
                  ].map(({ key, label, color }) => {
                    const r = dashboard.riconciliazione[key];
                    return (
                      <div key={key} className={`flex-1 rounded-xl border border-${color}-200 bg-${color}-50 p-3 text-center`}>
                        <div className={`text-lg font-bold text-${color}-800`}>{r?.num || 0}</div>
                        <div className={`text-[10px] text-${color}-600`}>{label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grafico mensile */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-neutral-800 mb-3">Andamento mensile — {anno}</h2>
              <div className="flex items-end gap-1 w-full">
                {dashboard.mesi.map((m, i) => {
                  const hE = Math.max((m.entrate / maxMese) * 120, 2);
                  const hU = Math.max((m.uscite / maxMese) * 120, 2);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center min-w-0">
                      <div className="flex gap-px items-end w-full justify-center" style={{ height: 130 }}>
                        <div className="bg-emerald-400 rounded-t flex-1 max-w-[12px]" style={{ height: hE }} title={`Entrate: ${fmt(m.entrate)}`} />
                        <div className="bg-red-400 rounded-t flex-1 max-w-[12px]" style={{ height: hU }} title={`Uscite: ${fmt(m.uscite)}`} />
                      </div>
                      <div className="text-[9px] text-neutral-400 mt-1">{m.mese}</div>
                      <div className={`text-[8px] font-mono mt-0.5 ${m.saldo >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {m.saldo >= 0 ? "+" : ""}{Math.round(m.saldo / 1000)}k
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-neutral-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-400 rounded inline-block" /> Entrate</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded inline-block" /> Uscite</span>
              </div>
            </div>

            {/* Pivot mensile (tabella) */}
            <div className="mb-8 overflow-x-auto">
              <h2 className="text-lg font-semibold text-neutral-800 mb-3">Pivot mensile</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-neutral-500">
                    <th className="pb-2 text-left">Mese</th>
                    <th className="pb-2 text-right">Entrate</th>
                    <th className="pb-2 text-right">Uscite</th>
                    <th className="pb-2 text-right">Saldo</th>
                    <th className="pb-2 text-right">Mov.</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.mesi.map((m, i) => (
                    <tr key={i} className={`border-b border-neutral-100 ${m.num === 0 ? "opacity-30" : ""}`}>
                      <td className="py-1.5 font-medium text-neutral-700">{m.mese_full}</td>
                      <td className="py-1.5 text-right font-mono text-emerald-700">{m.entrate ? "+" + fmt(m.entrate) : ""}</td>
                      <td className="py-1.5 text-right font-mono text-red-600">{m.uscite ? fmt(-m.uscite) : ""}</td>
                      <td className={`py-1.5 text-right font-mono font-semibold ${m.saldo >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                        {m.num ? fmt(m.saldo) : ""}
                      </td>
                      <td className="py-1.5 text-right text-neutral-400">{m.num || ""}</td>
                    </tr>
                  ))}
                  {/* Totale */}
                  <tr className="border-t-2 border-neutral-300 font-semibold">
                    <td className="py-2 text-neutral-800">TOTALE</td>
                    <td className="py-2 text-right font-mono text-emerald-800">+{fmt(dashboard.totali.totale_entrate)}</td>
                    <td className="py-2 text-right font-mono text-red-700">{fmt(dashboard.totali.totale_uscite)}</td>
                    <td className={`py-2 text-right font-mono ${dashboard.totali.saldo >= 0 ? "text-blue-800" : "text-orange-800"}`}>
                      {fmt(dashboard.totali.saldo)}
                    </td>
                    <td className="py-2 text-right text-neutral-600">{dashboard.totali.num_movimenti}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Breakdown categorie */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h2 className="text-lg font-semibold text-neutral-800 mb-3">Uscite per categoria</h2>
                <div className="space-y-2">
                  {dashboard.categorie
                    .filter((c) => c.dare_tot < 0)
                    .sort((a, b) => a.dare_tot - b.dare_tot)
                    .map((c, i) => {
                      const pct = dashboard.totali.totale_uscite !== 0
                        ? Math.abs(c.dare_tot / dashboard.totali.totale_uscite) * 100 : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-32 text-xs text-neutral-700 truncate">{c.cat1}</div>
                          <div className="flex-1 bg-neutral-100 rounded-full h-3.5 overflow-hidden">
                            <div className="bg-red-400 h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <div className="text-xs font-mono text-neutral-600 w-24 text-right">{fmt(c.dare_tot)}</div>
                          <div className="text-[10px] text-neutral-400 w-10 text-right">{pct.toFixed(0)}%</div>
                        </div>
                      );
                    })}
                </div>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-neutral-800 mb-3">Entrate per categoria</h2>
                <div className="space-y-2">
                  {dashboard.categorie
                    .filter((c) => c.avere_tot > 0 || c.dare_tot > 0)
                    .sort((a, b) => (b.avere_tot + Math.max(b.dare_tot, 0)) - (a.avere_tot + Math.max(a.dare_tot, 0)))
                    .map((c, i) => {
                      const tot = c.avere_tot + Math.max(c.dare_tot, 0);
                      const pct = dashboard.totali.totale_entrate ? (tot / dashboard.totali.totale_entrate) * 100 : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-32 text-xs text-neutral-700 truncate">{c.cat1}</div>
                          <div className="flex-1 bg-neutral-100 rounded-full h-3.5 overflow-hidden">
                            <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <div className="text-xs font-mono text-neutral-600 w-24 text-right">+{fmt(tot)}</div>
                          <div className="text-[10px] text-neutral-400 w-10 text-right">{pct.toFixed(0)}%</div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
