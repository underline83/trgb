// src/pages/banca/CartaRiepilogoPage.jsx
// Modulo: banca (sub-modulo carta_credito)
// @version: v1.0 (CC.5.b — riepilogo mensile per categoria)
//
// Vista aggregata delle spese carta per mese × categoria.
// Categoria derivata da carta_mcc[:4] tramite mappa hardcoded backend.
// GET /banca/carta/riepilogo?carta_id=&from=&to=

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import FlussiCassaNav from "./FlussiCassaNav";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, StatusBadge } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

const CARTA = `${API_BASE}/banca/carta`;

const MESI_IT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

const fmtEUR = (n) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtEURCompact = (n) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("it-IT", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }) + " €";

const meseLabel = (yyyy_mm) => {
  if (!yyyy_mm) return "—";
  const [y, m] = yyyy_mm.split("-");
  return `${MESI_IT[parseInt(m, 10) - 1]} ${y.slice(-2)}`;
};

// Colori per categoria — coordinati con palette TRGB-02 ma distinguibili
const CATEGORIA_COLORE = {
  ALIMENTARI:  "#16a34a",   // emerald
  TRASPORTI:   "#2563eb",   // blue
  SOFTWARE:    "#a855f7",   // violet
  RISTORANTI:  "#f97316",   // orange
  ALBERGHI:    "#ec4899",   // pink
  FINANZIARI:  "#dc2626",   // red
  SERVIZI:     "#06b6d4",   // cyan
  VARIE:       "#6b7280",   // gray
};

const categoriaColore = (cat) => CATEGORIA_COLORE[cat] || "#6b7280";

// ─────────────────────────────────────────────────────────────────────

export default function CartaRiepilogoPage() {
  const navigate = useNavigate();

  const [carte, setCarte] = useState([]);
  const [cartaId, setCartaId] = useState("");  // "" = tutte
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [riepilogo, setRiepilogo] = useState({ mesi: [], categorie: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Inizializza date a "ultimi 12 mesi" se vuote
  useEffect(() => {
    const oggi = new Date();
    const da = new Date(oggi.getFullYear(), oggi.getMonth() - 11, 1);
    setDateFrom(da.toISOString().slice(0, 10));
    setDateTo(oggi.toISOString().slice(0, 10));
  }, []);

  // Carica carte
  useEffect(() => {
    apiFetch(`${CARTA}/carte`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCarte(d.carte || []))
      .catch(() => {});
  }, []);

  // Carica riepilogo
  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    setError("");
    const url = new URL(`${CARTA}/riepilogo`);
    url.searchParams.set("from", dateFrom);
    url.searchParams.set("to", dateTo);
    if (cartaId) url.searchParams.set("carta_id", cartaId);
    apiFetch(url.toString())
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setRiepilogo({ mesi: d.mesi || [], categorie: d.categorie || [] }))
      .catch((e) => setError(e.message || "Errore caricamento"))
      .finally(() => setLoading(false));
  }, [cartaId, dateFrom, dateTo]);

  // Calcoli derivati
  const { mesi, categorie } = riepilogo;
  const totalePeriodo = useMemo(
    () => mesi.reduce((acc, m) => acc + (m.totale || 0), 0),
    [mesi]
  );
  const nMovTotali = useMemo(
    () => mesi.reduce((acc, m) => acc + (m.n_mov || 0), 0),
    [mesi]
  );

  // Totali per categoria
  const totaliPerCategoria = useMemo(() => {
    const out = {};
    categorie.forEach((c) => {
      out[c] = mesi.reduce((acc, m) => acc + (m.per_categoria?.[c] || 0), 0);
    });
    return out;
  }, [mesi, categorie]);

  // Dati per il bar chart (mesi sull'asse X, una serie per categoria)
  const chartData = useMemo(
    () =>
      mesi.map((m) => ({
        mese: meseLabel(m.mese),
        ...Object.fromEntries(categorie.map((c) => [c, m.per_categoria?.[c] || 0])),
        totale: m.totale,
      })),
    [mesi, categorie]
  );

  // ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-brand-cream">
      <FlussiCassaNav current="carta" />

      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-brand-ink tracking-tight">
              Riepilogo mensile carta
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Spese carta di credito per mese e categoria, derivata dal merchant code (MCC).
            </p>
          </div>
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => navigate("/flussi-cassa/carta")}
          >
            ← Lista estratti
          </Btn>
        </div>

        {/* FILTRI */}
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 px-5 py-4 mb-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Carta</label>
              <select
                value={cartaId}
                onChange={(e) => setCartaId(e.target.value)}
                className="px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:border-brand-blue"
              >
                <option value="">Tutte le carte</option>
                {carte.map((c) => (
                  <option key={c.id} value={c.id}>{c.nickname}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Da</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:border-brand-blue"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-neutral-500 mb-1">A</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>
        </div>

        {/* ALERT */}
        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
            ⚠ {error}
          </div>
        )}

        {loading ? (
          <div className="py-16">
            <TrgbLoader label="Calcolo riepilogo..." />
          </div>
        ) : mesi.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-8 text-center text-sm text-neutral-500">
            <p className="font-semibold text-neutral-700 mb-2">Nessun dato nel periodo selezionato</p>
            <p>Carica almeno un PDF estratto carta o allarga l'intervallo di date.</p>
          </div>
        ) : (
          <>
            {/* STAT CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <StatCard label="Totale periodo" value={fmtEUR(totalePeriodo)} />
              <StatCard label="Movimenti" value={nMovTotali} />
              <StatCard label="Mesi coperti" value={mesi.length} />
              <StatCard
                label="Media mese"
                value={mesi.length > 0 ? fmtEUR(totalePeriodo / mesi.length) : "—"}
              />
            </div>

            {/* GRAFICO */}
            <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-5 mb-4">
              <h3 className="text-sm font-semibold text-neutral-700 mb-3">
                Andamento mensile per categoria
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mese" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(n) => `${Math.round(n / 100) / 10}k`}
                    />
                    <Tooltip
                      formatter={(v, name) => [fmtEUR(v), name]}
                      labelStyle={{ fontSize: 12, fontWeight: 600 }}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    {categorie.map((c) => (
                      <Bar
                        key={c}
                        dataKey={c}
                        stackId="totale"
                        fill={categoriaColore(c)}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TABELLA MESI × CATEGORIE */}
            <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-200">
                <h3 className="text-sm font-semibold text-neutral-700">
                  Dettaglio per mese e categoria
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-[11px] uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium sticky left-0 bg-neutral-50">Mese</th>
                      {categorie.map((c) => (
                        <th key={c} className="text-right px-3 py-2 font-medium whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{ backgroundColor: categoriaColore(c) }}
                              aria-hidden="true"
                            />
                            {c}
                          </span>
                        </th>
                      ))}
                      <th className="text-right px-3 py-2 font-medium bg-amber-50">Totale</th>
                      <th className="text-right px-3 py-2 font-medium">Mov.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mesi.map((m) => (
                      <tr key={m.mese} className="border-b border-neutral-100 hover:bg-neutral-50">
                        <td className="px-3 py-2 font-medium sticky left-0 bg-white">{meseLabel(m.mese)}</td>
                        {categorie.map((c) => {
                          const val = m.per_categoria?.[c] || 0;
                          return (
                            <td key={c} className="px-3 py-2 text-right tabular-nums">
                              {val > 0 ? fmtEURCompact(val) : <span className="text-neutral-300">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right tabular-nums font-semibold bg-amber-50">
                          {fmtEUR(m.totale)}
                        </td>
                        <td className="px-3 py-2 text-right text-neutral-500 tabular-nums">{m.n_mov}</td>
                      </tr>
                    ))}
                    {/* RIGA TOTALI */}
                    <tr className="border-t-2 border-neutral-300 bg-neutral-100 font-semibold">
                      <td className="px-3 py-2 sticky left-0 bg-neutral-100">Totale</td>
                      {categorie.map((c) => (
                        <td key={c} className="px-3 py-2 text-right tabular-nums">
                          {fmtEURCompact(totaliPerCategoria[c])}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums bg-amber-100">
                        {fmtEUR(totalePeriodo)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{nMovTotali}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* LEGENDA CATEGORIE */}
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-500">
              {categorie.map((c) => (
                <StatusBadge key={c} tone="neutral" size="sm">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                    style={{ backgroundColor: categoriaColore(c) }}
                    aria-hidden="true"
                  />
                  {c} {fmtEUR(totaliPerCategoria[c])}
                </StatusBadge>
              ))}
            </div>
            <p className="text-[10px] text-neutral-400 mt-2">
              Categorie derivate dai primi 4 cifre del MCC (Merchant Category Code) BPM. La mappa è hardcoded
              in <code>banca_carta_router.py</code>; se vedi merchant in categoria sbagliata segnalalo —
              passeremo a tabella editabile in roadmap futura.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-lg font-bold text-brand-ink tabular-nums mt-1">{value}</div>
    </div>
  );
}
