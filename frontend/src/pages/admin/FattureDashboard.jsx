// @version: v3.0-drill-fix
// Dashboard acquisti fatture elettroniche — KPI, grafici, categorie, anomalie, drill-down
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

const FE = `${API_BASE}/contabilita/fe`;

const CAT_COLORS = [
  "#d97706", "#2563eb", "#dc2626", "#059669", "#7c3aed",
  "#db2777", "#0891b2", "#65a30d", "#ea580c", "#6366f1",
  "#78716c",
];

const fmt = (v) =>
  v != null
    ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";

const fmtK = (v) => {
  if (v == null) return "-";
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return fmt(v);
};

export default function FattureDashboard() {
  const navigate = useNavigate();
  const drillRef = useRef(null);

  // State
  const [fatture, setFatture] = useState([]);
  const [selectedYear, setSelectedYear] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data sections
  const [kpi, setKpi] = useState(null);
  const [categorie, setCategorie] = useState([]);
  const [topFornitori, setTopFornitori] = useState({ fornitori: [], totale_globale: 0 });
  const [confronto, setConfronto] = useState(null);
  const [anomalie, setAnomalie] = useState([]);
  const [mensili, setMensili] = useState([]);

  // Drill-down state
  const [drill, setDrill] = useState(null);

  const openDrill = useCallback(async ({ label, year: drillYear, month, categoria }) => {
    setDrill({ label, fatture: [], n_fatture: 0, totale: 0, loading: true, error: null });
    try {
      const params = new URLSearchParams();
      const y = drillYear || (selectedYear !== "all" ? selectedYear : null);
      if (y) params.set("year", y);
      if (month) params.set("month", month);
      if (categoria) params.set("categoria", categoria);
      const res = await apiFetch(`${FE}/stats/drill?${params.toString()}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = await res.json();
      setDrill({ label, ...data, loading: false, error: null });
      // Scroll to drill panel
      setTimeout(() => {
        drillRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (e) {
      setDrill((prev) => prev ? { ...prev, loading: false, error: e.message } : null);
    }
  }, [selectedYear]);

  const closeDrill = () => setDrill(null);

  // Load available years
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`${FE}/fatture?limit=5000`);
        if (res.ok) {
          const data = await res.json();
          setFatture(data.fatture || data || []);
        }
      } catch { /* ok */ }
    })();
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set();
    const list = Array.isArray(fatture) ? fatture : [];
    list.forEach((f) => {
      if (f.data_fattura) years.add(f.data_fattura.slice(0, 4));
    });
    return Array.from(years).sort();
  }, [fatture]);

  // Fetch all stats
  const fetchAll = async (yearParam) => {
    setLoading(true);
    setError(null);
    setDrill(null);
    try {
      const q = yearParam === "all" ? "" : `?year=${yearParam}`;
      const qYear = yearParam === "all" ? null : Number(yearParam);

      const promises = [
        apiFetch(`${FE}/stats/kpi${q}`),
        apiFetch(`${FE}/stats/per-categoria${q}`),
        apiFetch(`${FE}/stats/top-fornitori${q}${q ? "&" : "?"}limit=10`),
        apiFetch(`${FE}/stats/mensili${q}`),
      ];

      if (qYear) {
        promises.push(apiFetch(`${FE}/stats/confronto-annuale?year=${qYear}`));
        promises.push(apiFetch(`${FE}/stats/anomalie?year=${qYear}&soglia_pct=30`));
      }

      const results = await Promise.all(promises);
      for (const r of results) {
        if (!r.ok) throw new Error("Errore nel caricamento statistiche");
      }

      const [kpiRes, catRes, topRes, mensRes] = await Promise.all(
        results.slice(0, 4).map((r) => r.json())
      );

      setKpi(kpiRes);
      setCategorie(catRes);
      setTopFornitori(topRes);
      setMensili(mensRes);

      if (qYear && results.length > 4) {
        const [confRes, anomRes] = await Promise.all(
          results.slice(4).map((r) => r.json())
        );
        setConfronto(confRes);
        setAnomalie(anomRes);
      } else {
        setConfronto(null);
        setAnomalie([]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll("all");
  }, []);

  const handleYearChange = (val) => {
    setSelectedYear(val);
    fetchAll(val);
  };

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="dashboard" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-amber-900 font-playfair">
              Dashboard Acquisti
            </h1>
            <p className="text-neutral-500 text-sm mt-1">
              Analisi fatture elettroniche importate
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="text-sm border border-neutral-300 rounded-xl px-3 py-2 bg-white shadow-sm font-medium"
            >
              <option value="all">Tutti gli anni</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-neutral-400">Caricamento dashboard...</div>
        ) : (
          <>
            {kpi && <KpiCards kpi={kpi} />}

            {/* ROW 1: Mensile + Categorie */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              <div className="lg:col-span-2">
                <ChartMensile data={mensili} selectedYear={selectedYear} onDrill={openDrill} />
              </div>
              <div>
                <ChartCategorie data={categorie} onDrill={openDrill} />
              </div>
            </div>

            {/* DRILL-DOWN PANEL */}
            {drill && (
              <div ref={drillRef}>
                <DrillPanel drill={drill} onClose={closeDrill} navigate={navigate} />
              </div>
            )}

            {/* ROW 2: Top fornitori + Confronto */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <TopFornitoriCard data={topFornitori} navigate={navigate} />
              {confronto ? (
                <ChartConfronto data={confronto} />
              ) : (
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 flex items-center justify-center">
                  <p className="text-sm text-neutral-400 text-center">
                    Seleziona un anno specifico per il confronto con l'anno precedente
                  </p>
                </div>
              )}
            </div>

            {/* ROW 3: Anomalie */}
            {anomalie.length > 0 && <AnomalieCard data={anomalie} year={selectedYear} />}

            {/* FOOTER */}
            <div className="mt-4 border-t border-neutral-200 pt-4 flex justify-between items-center">
              <p className="text-xs text-neutral-400">
                Autofatture e fornitori esclusi non sono inclusi nei dati.
              </p>
              <button onClick={() => navigate("/acquisti/import")}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition">
                Import XML →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KPI CARDS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function KpiCards({ kpi }) {
  const cards = [
    {
      label: "Totale Spesa",
      value: `€ ${fmt(kpi.totale_spesa)}`,
      sub: kpi.delta_pct != null
        ? `${kpi.delta_pct > 0 ? "+" : ""}${kpi.delta_pct}% vs ${kpi.prev_year}`
        : null,
      subColor: kpi.delta_pct > 0 ? "text-red-600" : kpi.delta_pct < 0 ? "text-green-600" : "text-neutral-500",
      bg: "bg-amber-50 border-amber-200",
      icon: "€",
    },
    {
      label: "Fatture",
      value: kpi.n_fatture,
      sub: null,
      bg: "bg-blue-50 border-blue-200",
      icon: "#",
    },
    {
      label: "Fornitori Attivi",
      value: kpi.n_fornitori,
      sub: null,
      bg: "bg-green-50 border-green-200",
      icon: "F",
    },
    {
      label: "Media Mensile",
      value: `€ ${fmt(kpi.spesa_media_mensile)}`,
      sub: null,
      bg: "bg-purple-50 border-purple-200",
      icon: "M",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-2xl border p-4 shadow-sm ${c.bg}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-7 h-7 rounded-lg bg-white/70 flex items-center justify-center text-xs font-bold text-neutral-600">
              {c.icon}
            </span>
            <span className="text-[11px] text-neutral-600 font-medium uppercase tracking-wide">{c.label}</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-neutral-900 font-playfair">{c.value}</div>
          {c.sub && <div className={`text-xs mt-1 font-medium ${c.subColor}`}>{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHART ANDAMENTO MENSILE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ChartMensile({ data, selectedYear, onDrill }) {
  const NOMI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const map = {};
    data.forEach((d) => {
      const key = `${d.anno}-${d.mese}`;
      map[key] = d.totale_fatture || 0;
    });

    if (selectedYear !== "all") {
      return NOMI.map((n, i) => {
        const m = String(i + 1).padStart(2, "0");
        return { mese: n, mese_num: m, anno: String(selectedYear), totale: map[`${selectedYear}-${m}`] || 0 };
      });
    }

    return data.map((d) => ({
      mese: `${NOMI[parseInt(d.mese) - 1]} ${d.anno}`,
      mese_num: d.mese,
      anno: String(d.anno),
      totale: d.totale_fatture || 0,
    }));
  }, [data, selectedYear]);

  const handleBarClick = (data, index) => {
    // Recharts Bar onClick passes (data, index) for individual bar clicks
    if (!data || !data.payload) return;
    const d = data.payload;
    if (d.totale <= 0) return;
    const meseLabel = NOMI[parseInt(d.mese_num) - 1] || d.mese;
    onDrill({
      label: `${meseLabel} ${d.anno}`,
      year: d.anno,
      month: d.mese_num,
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-neutral-800">Andamento Mensile Acquisti</h3>
        <span className="text-[10px] text-neutral-400">Clicca su una barra per il dettaglio</span>
      </div>
      {chartData.length === 0 ? (
        <p className="text-xs text-neutral-400 py-10 text-center">Nessun dato</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="mese" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} width={55} />
            <Tooltip
              formatter={(v) => [`€ ${fmt(v)}`, "Totale"]}
              contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #e5e5e5" }}
            />
            <Bar
              dataKey="totale"
              fill="#d97706"
              radius={[4, 4, 0, 0]}
              name="Spesa"
              onClick={handleBarClick}
              style={{ cursor: "pointer" }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHART CATEGORIE (DONUT)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ChartCategorie({ data, onDrill }) {
  const totale = useMemo(() => data.reduce((s, d) => s + (d.totale || 0), 0), [data]);

  const handleSliceClick = (entry) => {
    // Recharts Pie onClick passes (data, index) — data is the entry
    if (!entry || entry.totale <= 0) return;
    const catName = entry.categoria || entry.name || "(Non categorizzato)";
    onDrill({ label: `Cat: ${catName}`, categoria: catName });
  };

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 h-full">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold text-neutral-800">Spesa per Categoria</h3>
        {data.length > 0 && (
          <span className="text-[10px] text-neutral-400">Clicca per dettaglio</span>
        )}
      </div>
      {data.length === 0 ? (
        <p className="text-xs text-neutral-400 py-10 text-center">
          Assegna categorie ai fornitori per visualizzare
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie
                data={data}
                dataKey="totale"
                nameKey="categoria"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                onClick={handleSliceClick}
                style={{ cursor: "pointer" }}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, name) => [`€ ${fmt(v)} (${totale > 0 ? Math.round(v / totale * 100) : 0}%)`, name]}
                contentStyle={{ fontSize: 11, borderRadius: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-1 max-h-32 overflow-y-auto">
            {data.map((d, i) => (
              <div
                key={d.categoria}
                className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-neutral-50 rounded px-1 -mx-1 py-0.5"
                onClick={() => handleSliceClick(d)}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }}
                />
                <span className="truncate flex-1 text-neutral-700">{d.categoria}</span>
                <span className="font-medium text-neutral-900 tabular-nums">
                  {totale > 0 ? Math.round((d.totale / totale) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TOP FORNITORI (barre orizzontali)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TopFornitoriCard({ data, navigate }) {
  const { fornitori, totale_globale } = data;
  const maxVal = fornitori.length > 0 ? fornitori[0].totale : 1;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-neutral-800 mb-3">Top 10 Fornitori</h3>
      {fornitori.length === 0 ? (
        <p className="text-xs text-neutral-400 py-10 text-center">Nessun dato</p>
      ) : (
        <div className="space-y-2">
          {fornitori.map((f, i) => (
            <div
              key={i}
              className="cursor-pointer hover:bg-neutral-50 rounded-lg px-1 -mx-1 py-0.5 transition"
              onClick={() => {
                if (f.fornitore_piva) navigate(`/acquisti/fornitore/${encodeURIComponent(f.fornitore_piva)}`);
              }}
            >
              <div className="flex justify-between items-baseline mb-0.5">
                <span className="text-xs font-medium text-neutral-800 truncate max-w-[60%]">
                  {f.fornitore_nome}
                </span>
                <div className="flex items-center gap-2">
                  {f.categoria && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      {f.categoria}
                    </span>
                  )}
                  <span className="text-xs font-semibold text-neutral-900 tabular-nums">
                    € {fmt(f.totale)}
                  </span>
                  <span className="text-[10px] text-neutral-400 tabular-nums w-10 text-right">
                    {f.pct}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-neutral-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${maxVal > 0 ? (f.totale / maxVal) * 100 : 0}%`,
                    backgroundColor: CAT_COLORS[i % CAT_COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
          <div className="text-[10px] text-neutral-400 text-right mt-2 pt-2 border-t border-neutral-100">
            Totale complessivo: € {fmt(totale_globale)}
          </div>
        </div>
      )}
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFRONTO ANNUALE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ChartConfronto({ data }) {
  const { year, prev_year, chart_data } = data;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-neutral-800 mb-3">
        Confronto {prev_year} vs {year}
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chart_data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis dataKey="mese" tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} width={55} />
          <Tooltip
            formatter={(v, name) => [`€ ${fmt(v)}`, name]}
            contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #e5e5e5" }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey={String(prev_year)} fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Bar dataKey={String(year)} fill="#d97706" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DRILL-DOWN PANEL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DrillPanel({ drill, onClose, navigate }) {
  const { label, fatture, n_fatture, totale, loading, error } = drill;

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-lg p-4 mb-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="text-sm font-bold text-amber-900">
            Dettaglio: {label}
          </h3>
          {!loading && !error && (
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {n_fatture} fattur{n_fatture === 1 ? "a" : "e"} — Totale: € {fmt(totale)}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-neutral-500 text-sm font-bold transition"
          title="Chiudi"
        >
          ×
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-neutral-400 text-sm">Caricamento fatture...</div>
      ) : error ? (
        <div className="text-center py-8 text-red-500 text-sm">Errore: {error}</div>
      ) : fatture.length === 0 ? (
        <div className="text-center py-8 text-neutral-400 text-sm">Nessuna fattura trovata</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-3 font-medium">Data</th>
                <th className="py-2 pr-3 font-medium">Numero</th>
                <th className="py-2 pr-3 font-medium">Fornitore</th>
                <th className="py-2 pr-3 font-medium hidden sm:table-cell">P.IVA</th>
                <th className="py-2 text-right font-medium">Importo</th>
                <th className="py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {fatture.map((f, i) => (
                <tr
                  key={f.id || i}
                  className="border-b border-neutral-100 hover:bg-amber-50/50 cursor-pointer transition"
                  onClick={() => f.id && navigate(`/acquisti/dettaglio/${f.id}`)}
                >
                  <td className="py-1.5 pr-3 tabular-nums text-neutral-700 whitespace-nowrap">
                    {f.data_fattura || "-"}
                  </td>
                  <td className="py-1.5 pr-3 text-neutral-700 whitespace-nowrap">
                    {f.numero_fattura || "-"}
                  </td>
                  <td className="py-1.5 pr-3 font-medium text-neutral-800 max-w-[200px] truncate">
                    {f.fornitore_nome || "-"}
                  </td>
                  <td className="py-1.5 pr-3 text-neutral-500 tabular-nums whitespace-nowrap hidden sm:table-cell">
                    {f.fornitore_piva || "-"}
                  </td>
                  <td className="py-1.5 text-right font-semibold text-neutral-900 tabular-nums whitespace-nowrap">
                    € {fmt(f.totale_fattura)}
                  </td>
                  <td className="py-1.5 text-center">
                    <span className="text-amber-500 text-sm">→</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {n_fatture > fatture.length && (
            <p className="text-[10px] text-neutral-400 text-center py-2 border-t border-neutral-100">
              Mostrate {fatture.length} di {n_fatture} fatture
            </p>
          )}
        </div>
      )}
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ANOMALIE / ALERT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AnomalieCard({ data, year }) {
  const tipoStyles = {
    aumento: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", label: "Aumento" },
    diminuzione: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", label: "Diminuzione" },
    nuovo: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", label: "Nuovo" },
    scomparso: { bg: "bg-neutral-50", border: "border-neutral-300", text: "text-neutral-600", label: "Scomparso" },
  };

  const visible = data.slice(0, 8);

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 mb-4">
      <h3 className="text-sm font-semibold text-neutral-800 mb-1">
        Variazioni Significative vs {Number(year) - 1}
      </h3>
      <p className="text-[11px] text-neutral-400 mb-3">
        Fornitori con variazione superiore al 30% rispetto all'anno precedente
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {visible.map((a, i) => {
          const s = tipoStyles[a.tipo] || tipoStyles.aumento;
          return (
            <div key={i} className={`rounded-xl border p-3 ${s.bg} ${s.border}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.text} bg-white/60`}>
                  {s.label}
                </span>
                {a.delta_pct != null && (
                  <span className={`text-xs font-bold ${s.text}`}>
                    {a.delta_pct > 0 ? "+" : ""}{a.delta_pct}%
                  </span>
                )}
              </div>
              <div className="text-xs font-medium text-neutral-800 truncate">{a.fornitore}</div>
              <div className="text-[10px] text-neutral-500 mt-0.5">
                {a.tipo === "nuovo"
                  ? `€ ${fmt(a.totale_corrente)} (${a.n_fatture} fatt.)`
                  : a.tipo === "scomparso"
                    ? `Era € ${fmt(a.totale_precedente)}`
                    : `€ ${fmt(a.totale_precedente)} → € ${fmt(a.totale_corrente)}`
                }
              </div>
            </div>
          );
        })}
      </div>
      {data.length > 8 && (
        <p className="text-[10px] text-neutral-400 mt-2 text-right">
          +{data.length - 8} altre variazioni
        </p>
      )}
    </div>
  );
}
