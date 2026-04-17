// @version: v1.0 — Liquidita' (principio di cassa) — sessione 42
// Complementare a ControlloGestioneDashboard (principio di competenza).
// Legge da banca_movimenti via /controllo-gestione/liquidita.
import React, { useEffect, useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { API_BASE, apiFetch } from "../../config/api";
import ControlloGestioneNav from "./ControlloGestioneNav";
import TrgbLoader from "../../components/TrgbLoader";

const CG = `${API_BASE}/controllo-gestione`;

const MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

// Palette TRGB-02
const BRAND_BLUE = "#2E7BE8";
const BRAND_GREEN = "#2EB872";
const BRAND_RED = "#E8402B";
const GRAY_PREC = "#d1d5db";

// Colori tipi entrata — coerenti con brand
const TIPO_COLORS = {
  POS:      BRAND_BLUE,
  Contanti: BRAND_GREEN,
  Bonifici: "#8B5CF6", // viola
  Altro:    "#9CA3AF", // grigio medio
};

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const fmtK = (n) => {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return fmt(n);
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

export default function ControlloGestioneLiquidita() {
  const oggi = new Date();
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, [anno, mese]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch(`${CG}/liquidita?anno=${anno}&mese=${mese}`);
      if (!r.ok) throw new Error("Errore caricamento liquidita'");
      setData(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Header period selector ──
  const PeriodSelector = () => (
    <div className="flex items-center gap-2">
      <select value={mese} onChange={(e) => setMese(+e.target.value)}
        className="border border-sky-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-sky-500">
        {MESI.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
      </select>
      <select value={anno} onChange={(e) => setAnno(+e.target.value)}
        className="border border-sky-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-sky-500">
        {[...Array(6)].map((_, i) => {
          const y = oggi.getFullYear() - 3 + i;
          return <option key={y} value={y}>{y}</option>;
        })}
      </select>
    </div>
  );

  // ── KPI card (stile allineato a Dashboard CG) ──
  const KPI = ({ label, value, sub, icon, color = "sky", alert: isAlert, tip }) => (
    <div
      title={tip}
      className={`rounded-2xl border p-4 transition
        ${isAlert ? "border-red-300 bg-red-50" : `border-${color}-200 bg-${color}-50`}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-2xl">{icon}</span>
        {sub != null && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
            {sub}
          </span>
        )}
      </div>
      <div className={`text-xl font-bold ${isAlert ? "text-red-800" : `text-${color}-900`}`}>
        {value}
      </div>
      <div className={`text-xs mt-0.5 ${isAlert ? "text-red-600" : `text-${color}-600`}`}>{label}</div>
    </div>
  );

  // ── Tooltip custom (euro formattati) ──
  const EuroTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-white border border-neutral-200 rounded-lg shadow-lg px-3 py-2 text-xs">
        <div className="font-semibold text-neutral-700 mb-1">{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color }}>
            {p.name}: € {fmt(p.value)}
          </div>
        ))}
      </div>
    );
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-brand-cream">
        <ControlloGestioneNav current="liquidita" />
        <TrgbLoader size={48} label="Caricamento liquidita'…" className="max-w-7xl mx-auto mt-4 py-20" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-brand-cream">
        <ControlloGestioneNav current="liquidita" />
        <div className="max-w-7xl mx-auto mt-4 text-center py-20 text-red-500">{error}</div>
      </div>
    );
  }

  const d = data;
  const saldo = d?.saldo_attuale || {};
  const mc = d?.mese_corrente || {};
  const p90 = d?.periodo_90gg || {};
  const trend = d?.trend_saldo || [];
  const mensili = d?.entrate_mensili || [];
  const yoy = d?.confronto_yoy || [];
  const ultime = d?.ultime_entrate || [];

  // Dati grafici
  const pieEntrate = (mc.entrate_per_tipo || [])
    .filter((t) => t.totale > 0)
    .map((t) => ({ name: t.tipo, value: t.totale, num: t.num }));

  const mensiliChart = mensili.map((m) => ({
    name: m.mese_label,
    POS: m.POS,
    Contanti: m.Contanti,
    Bonifici: m.Bonifici,
    Altro: m.Altro,
  }));

  // YoY: filtra solo mesi con almeno un dato (per non far vedere linea piatta fino a dic)
  const yoyChart = yoy.map((m) => ({
    name: m.mese_label,
    [String(anno)]: m.anno_corrente,
    [String(anno - 1)]: m.anno_prec,
  }));

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <ControlloGestioneNav current="liquidita" />

      <div className="px-4 sm:px-6 pb-6">
        <div className="max-w-7xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-8 border border-neutral-200 mt-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
            <div>
              <h1 className="text-2xl font-bold text-sky-900 font-playfair tracking-wide">
                Liquidita'
              </h1>
              <p className="text-sm text-neutral-500 mt-0.5">
                Principio di cassa — quanto arriva e quando, dalla banca — {d?.periodo}
              </p>
            </div>
            <PeriodSelector />
          </div>

          {loading && <div className="text-xs text-sky-400 mb-3 animate-pulse">Aggiornamento...</div>}

          {/* Badge data riferimento saldo */}
          {saldo.data_riferimento && (
            <div className="text-[11px] text-neutral-400 mb-3">
              Dati banca aggiornati al <span className="font-semibold text-neutral-600">{saldo.data_riferimento}</span>
              {" · "}
              {saldo.num_movimenti_totali} movimenti totali
            </div>
          )}

          {/* ─── RIGA KPI ─── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <KPI icon="🏦" label="Saldo attuale"
              value={`€ ${fmt(saldo.saldo)}`}
              color={saldo.saldo >= 0 ? "sky" : "red"}
              alert={saldo.saldo < 0}
              tip="Saldo cumulativo su tutti i movimenti importati" />

            <KPI icon="📥" label={`Entrate ${mc.mese_label}`}
              value={`€ ${fmt(mc.entrate_totali)}`}
              color="emerald"
              sub={`${mc.num_movimenti} mov.`} />

            <KPI icon="📤" label={`Uscite ${mc.mese_label}`}
              value={`€ ${fmt(mc.uscite_totali)}`}
              color="rose" />

            <KPI icon={mc.delta >= 0 ? "📈" : "📉"}
              label={`Delta cassa ${mc.mese_label}`}
              value={`€ ${fmt(mc.delta)}`}
              color={mc.delta >= 0 ? "emerald" : "red"}
              alert={mc.delta < 0}
              tip="Entrate - Uscite del mese selezionato" />

            <KPI icon="🔄" label="Entrate 90gg"
              value={`€ ${fmtK(p90.entrate_totali)}`}
              color="indigo"
              sub={`Δ € ${fmtK(p90.delta)}`}
              tip={`Finestra rolling ${p90.data_inizio} → ${p90.data_fine}`} />

            <KPI icon="📊" label="Media entrate/giorno"
              value={`€ ${fmt(p90.media_entrate_giorno)}`}
              color="cyan"
              tip="Media sui 90 giorni precedenti" />
          </div>

          {/* ─── RIGA 2: Trend saldo + Breakdown entrate tipo ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {/* Trend saldo 90gg */}
            <div className="lg:col-span-2 bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-neutral-700">
                  📈 Trend saldo (ultimi 90 giorni)
                </h3>
                <span className="text-[11px] text-neutral-400">
                  {trend.length} giorni con movimenti
                </span>
              </div>
              {trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={trend.map((p) => ({ ...p, data: fmtDate(p.data) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} />
                    <Tooltip content={<EuroTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="saldo"
                      name="Saldo"
                      stroke={BRAND_BLUE}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-sm text-neutral-400 text-center py-12">Nessun dato</div>
              )}
            </div>

            {/* Breakdown entrate mese per tipo */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-neutral-700 mb-3">
                🧩 Entrate {mc.mese_label} per tipo
              </h3>
              {pieEntrate.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={pieEntrate}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={75}
                        label={(entry) => entry.name}
                        labelLine={false}
                      >
                        {pieEntrate.map((entry, i) => (
                          <Cell key={i} fill={TIPO_COLORS[entry.name] || "#9CA3AF"} />
                        ))}
                      </Pie>
                      <Tooltip content={<EuroTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-3 space-y-1 text-xs">
                    {pieEntrate.map((t) => (
                      <div key={t.name} className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block w-3 h-3 rounded-full"
                            style={{ backgroundColor: TIPO_COLORS[t.name] || "#9CA3AF" }}
                          />
                          {t.name}
                          <span className="text-neutral-400">({t.num})</span>
                        </span>
                        <span className="font-semibold text-neutral-700">€ {fmt(t.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-sm text-neutral-400 text-center py-12">Nessuna entrata nel mese</div>
              )}
            </div>
          </div>

          {/* ─── RIGA 3: Entrate mensili anno (stacked) + Confronto YoY ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-neutral-700 mb-3">
                📅 Entrate mensili {anno} per tipo
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={mensiliChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} />
                  <Tooltip content={<EuroTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="POS" stackId="a" fill={TIPO_COLORS.POS} />
                  <Bar dataKey="Contanti" stackId="a" fill={TIPO_COLORS.Contanti} />
                  <Bar dataKey="Bonifici" stackId="a" fill={TIPO_COLORS.Bonifici} />
                  <Bar dataKey="Altro" stackId="a" fill={TIPO_COLORS.Altro} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-neutral-700 mb-3">
                🆚 Confronto YoY — entrate per mese
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={yoyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} />
                  <Tooltip content={<EuroTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey={String(anno - 1)} fill={GRAY_PREC} />
                  <Bar dataKey={String(anno)} fill={BRAND_BLUE} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ─── RIGA 4: Uscite per categoria + Ultime entrate ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-neutral-700 mb-3">
                💸 Uscite {mc.mese_label} per categoria
              </h3>
              {(mc.uscite_per_categoria || []).length > 0 ? (
                <div className="space-y-1.5 text-xs">
                  {mc.uscite_per_categoria.map((c) => {
                    const max = mc.uscite_totali || 1;
                    const pct = (c.totale / max) * 100;
                    return (
                      <div key={c.categoria}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-neutral-700">
                            {c.categoria} <span className="text-neutral-400">({c.num})</span>
                          </span>
                          <span className="font-semibold text-neutral-800">€ {fmt(c.totale)}</span>
                        </div>
                        <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: BRAND_RED }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-neutral-400 text-center py-8">Nessuna uscita nel mese</div>
              )}
            </div>

            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-neutral-700 mb-3">
                🧾 Ultime entrate
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-neutral-500 border-b border-neutral-200">
                      <th className="py-1.5 pr-2">Data</th>
                      <th className="py-1.5 pr-2">Tipo</th>
                      <th className="py-1.5 pr-2">Descrizione</th>
                      <th className="py-1.5 text-right">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ultime.map((e) => (
                      <tr key={e.id} className="border-b border-neutral-100">
                        <td className="py-1.5 pr-2 whitespace-nowrap text-neutral-600">{fmtDate(e.data)}</td>
                        <td className="py-1.5 pr-2">
                          <span
                            className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-white"
                            style={{ backgroundColor: TIPO_COLORS[e.tipo] || "#9CA3AF" }}
                          >
                            {e.tipo}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-neutral-700 max-w-[240px] truncate" title={e.descrizione}>
                          {e.descrizione}
                        </td>
                        <td className="py-1.5 text-right font-semibold text-emerald-700 whitespace-nowrap">
                          € {fmt(e.importo)}
                        </td>
                      </tr>
                    ))}
                    {ultime.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-neutral-400">Nessuna entrata</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Nota piede */}
          <div className="mt-5 text-[11px] text-neutral-400 text-center">
            Questa vista risponde al <span className="font-semibold">principio di cassa</span> (quando il denaro tocca il conto).
            Per il <span className="font-semibold">principio di competenza</span> (vendite attribuite al giorno in cui sono fatte) vedi la Dashboard.
          </div>
        </div>
      </div>
    </div>
  );
}
