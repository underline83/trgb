// @version: v1.0-statistiche-dashboard
// Dashboard Statistiche — categorie, top prodotti, trend mensile
import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import StatisticheNav from "./StatisticheNav";
import TrgbLoader from "../../components/TrgbLoader";

const EP = `${API_BASE}/statistiche`;

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const MESI_SHORT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const fmtInt = (n) =>
  n != null ? Number(n).toLocaleString("it-IT") : "—";

// Anni disponibili
const ANNI = [];
for (let y = 2020; y <= new Date().getFullYear() + 1; y++) ANNI.push(y);

export default function StatisticheDashboard() {
  const [loading, setLoading] = useState(true);
  const [categorie, setCategorie] = useState([]);
  const [topProdotti, setTopProdotti] = useState([]);
  const [trend, setTrend] = useState([]);
  const [mesi, setMesi] = useState([]);

  // Filtro
  const now = new Date();
  const [modo, setModo] = useState("anno"); // "anno" | "mese" | "tutto"
  const [selAnno, setSelAnno] = useState(now.getFullYear());
  const [selMese, setSelMese] = useState(now.getMonth() + 1);

  useEffect(() => {
    loadAll();
  }, [modo, selAnno, selMese]);

  const buildParams = () => {
    const p = new URLSearchParams();
    if (modo === "anno") p.set("anno", selAnno);
    if (modo === "mese") {
      p.set("anno", selAnno);
      p.set("mese", selMese);
    }
    return p.toString();
  };

  const loadAll = async () => {
    setLoading(true);
    const qs = buildParams();
    try {
      const [catRes, topRes, trendRes, mesiRes] = await Promise.all([
        apiFetch(`${EP}/categorie?${qs}`),
        apiFetch(`${EP}/top-prodotti?${qs}&n=15`),
        apiFetch(`${EP}/trend?anno=${modo !== "tutto" ? selAnno : ""}`),
        apiFetch(`${EP}/mesi`),
      ]);
      if (catRes.ok) setCategorie(await catRes.json());
      if (topRes.ok) setTopProdotti(await topRes.json());
      if (trendRes.ok) setTrend(await trendRes.json());
      if (mesiRes.ok) setMesi(await mesiRes.json());
    } catch (_) {}
    setLoading(false);
  };

  // Totali per KPI
  const totaleVendite = categorie.reduce((s, c) => s + c.totale_euro, 0);
  const totaleQta = categorie.reduce((s, c) => s + c.quantita, 0);

  // Barra percentuale per categorie
  const maxCat = categorie.length > 0 ? categorie[0].totale_euro : 1;

  // Trend chart max
  const maxTrend = trend.length > 0 ? Math.max(...trend.map((t) => t.totale_euro)) : 1;

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <StatisticheNav current="dashboard" />
      <div className="max-w-6xl mx-auto mt-4">
        {/* Filtro periodo */}
        <div className="bg-white rounded-2xl shadow p-4 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-neutral-600">Periodo:</span>
          <select
            value={modo}
            onChange={(e) => setModo(e.target.value)}
            className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="anno">Anno</option>
            <option value="mese">Mese</option>
            <option value="tutto">Tutto</option>
          </select>
          {(modo === "anno" || modo === "mese") && (
            <select
              value={selAnno}
              onChange={(e) => setSelAnno(Number(e.target.value))}
              className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
            >
              {ANNI.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
          {modo === "mese" && (
            <select
              value={selMese}
              onChange={(e) => setSelMese(Number(e.target.value))}
              className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
            >
              {MESI.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          )}
          <span className="text-xs text-neutral-400 ml-auto">
            {mesi.length} mesi importati
          </span>
        </div>

        {loading ? (
          <TrgbLoader size={48} label="Caricamento…" className="py-12" />
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl shadow p-5 text-center">
                <div className="text-3xl font-bold text-rose-700">{fmt(totaleVendite)} €</div>
                <div className="text-sm text-neutral-500 mt-1">Fatturato</div>
              </div>
              <div className="bg-white rounded-2xl shadow p-5 text-center">
                <div className="text-3xl font-bold text-blue-700">{fmtInt(totaleQta)}</div>
                <div className="text-sm text-neutral-500 mt-1">Pezzi venduti</div>
              </div>
              <div className="bg-white rounded-2xl shadow p-5 text-center">
                <div className="text-3xl font-bold text-emerald-700">{categorie.length}</div>
                <div className="text-sm text-neutral-500 mt-1">Categorie</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Categorie */}
              <div className="bg-white rounded-2xl shadow p-6">
                <h2 className="text-lg font-bold text-neutral-800 mb-4">Categorie per fatturato</h2>
                {categorie.length === 0 ? (
                  <p className="text-neutral-400 text-sm">Nessun dato.</p>
                ) : (
                  <div className="space-y-2">
                    {categorie.map((c, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-sm mb-0.5">
                          <span className="font-medium truncate mr-2">{c.categoria}</span>
                          <span className="text-neutral-600 whitespace-nowrap">
                            {fmt(c.totale_euro)} € ({fmtInt(c.quantita)} pz)
                          </span>
                        </div>
                        <div className="w-full bg-neutral-100 rounded-full h-2">
                          <div
                            className="bg-rose-500 h-2 rounded-full transition-all"
                            style={{ width: `${(c.totale_euro / maxCat) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top prodotti */}
              <div className="bg-white rounded-2xl shadow p-6">
                <h2 className="text-lg font-bold text-neutral-800 mb-4">Top 15 prodotti</h2>
                {topProdotti.length === 0 ? (
                  <p className="text-neutral-400 text-sm">Nessun dato.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 text-left text-neutral-500">
                          <th className="py-1.5 px-1">#</th>
                          <th className="py-1.5 px-1">Prodotto</th>
                          <th className="py-1.5 px-1 text-right">Qta</th>
                          <th className="py-1.5 px-1 text-right">Totale €</th>
                          <th className="py-1.5 px-1 text-right">Prezzo medio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProdotti.map((p, i) => (
                          <tr key={i} className="border-b border-neutral-50 hover:bg-neutral-50">
                            <td className="py-1.5 px-1 text-neutral-400">{i + 1}</td>
                            <td className="py-1.5 px-1">
                              <div className="font-medium truncate max-w-[180px]">{p.prodotto}</div>
                              <div className="text-xs text-neutral-400">{p.categoria}</div>
                            </td>
                            <td className="py-1.5 px-1 text-right">{fmtInt(p.quantita)}</td>
                            <td className="py-1.5 px-1 text-right font-medium">{fmt(p.totale_euro)}</td>
                            <td className="py-1.5 px-1 text-right text-neutral-500">{fmt(p.prezzo_medio)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Trend mensile (barra chart semplice CSS) */}
            <div className="bg-white rounded-2xl shadow p-6">
              <h2 className="text-lg font-bold text-neutral-800 mb-4">Trend mensile</h2>
              {trend.length === 0 ? (
                <p className="text-neutral-400 text-sm">Nessun dato per il trend.</p>
              ) : (
                <div className="flex items-end gap-1 h-48">
                  {trend.map((t, i) => {
                    const pct = maxTrend > 0 ? (t.totale_euro / maxTrend) * 100 : 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                        <div className="text-[10px] text-neutral-500 mb-1 whitespace-nowrap">
                          {fmt(t.totale_euro)}
                        </div>
                        <div
                          className="w-full bg-rose-400 rounded-t-md transition-all min-h-[2px]"
                          style={{ height: `${Math.max(pct, 1)}%` }}
                          title={`${t.label}: ${fmt(t.totale_euro)} €`}
                        />
                        <div className="text-[10px] text-neutral-500 mt-1">
                          {MESI_SHORT[t.mese - 1]}
                          {trend.some((x, j) => j !== i && x.mese === t.mese) && (
                            <span className="block text-[8px]">{t.anno}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
