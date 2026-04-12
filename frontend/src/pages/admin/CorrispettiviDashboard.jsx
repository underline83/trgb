// src/pages/admin/CorrispettiviDashboard.jsx
// @version: v4.0-unified — Dashboard Vendite con 3 modalità (Mensile / Trimestrale / Annuale)
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import VenditeNav from "./VenditeNav";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { API_BASE, apiFetch } from "../../config/api";
import TrgbLoader from "../../components/TrgbLoader";

// ── Costanti ──
const MONTH_NAMES = [
  "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre",
];
const MONTH_SHORT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
const QUARTER_LABELS = ["Q1 (Gen-Mar)", "Q2 (Apr-Giu)", "Q3 (Lug-Set)", "Q4 (Ott-Dic)"];
const QUARTER_MONTHS = [[1,2,3],[4,5,6],[7,8,9],[10,11,12]];
const MODES = [
  { key: "mensile",     label: "Mensile",     icon: "📅" },
  { key: "trimestrale", label: "Trimestrale", icon: "📊" },
  { key: "annuale",     label: "Annuale",     icon: "📈" },
];

function getTodayInfo() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), quarter: Math.ceil((d.getMonth() + 1) / 3) };
}

function formatCurrency(value) {
  if (value == null) return "-";
  return value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatShortDate(iso) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// ── Componente principale ──
export default function CorrispettiviDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = getTodayInfo();

  // Mode: mensile | trimestrale | annuale
  const [mode, setMode] = useState(() => {
    const m = searchParams.get("mode");
    return ["mensile", "trimestrale", "annuale"].includes(m) ? m : "mensile";
  });

  const [year, setYear] = useState(() => {
    const p = parseInt(searchParams.get("year"));
    return p >= 2000 && p <= 2100 ? p : today.year;
  });
  const [month, setMonth] = useState(() => {
    const p = parseInt(searchParams.get("month"));
    return p >= 1 && p <= 12 ? p : today.month;
  });
  const [quarter, setQuarter] = useState(() => {
    const p = parseInt(searchParams.get("quarter"));
    return p >= 1 && p <= 4 ? p : today.quarter;
  });

  // Data state
  const [monthlyStats, setMonthlyStats] = useState(null);
  const [prevYearStats, setPrevYearStats] = useState(null);
  const [topDays, setTopDays] = useState(null);
  // For quarterly: array of 3 monthly stats
  const [quarterStats, setQuarterStats] = useState(null);
  const [prevQuarterStats, setPrevQuarterStats] = useState(null);
  // For annual: annual-compare data
  const [annualData, setAnnualData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [turniChiusi, setTurniChiusi] = useState([]);

  // ── Data fetching ──
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        if (mode === "mensile") {
          const [monthlyRes, prevRes, topRes] = await Promise.all([
            apiFetch(`${API_BASE}/admin/finance/stats/monthly?year=${year}&month=${month}`),
            apiFetch(`${API_BASE}/admin/finance/stats/monthly?year=${year - 1}&month=${month}`),
            apiFetch(`${API_BASE}/admin/finance/stats/top-days?year=${year}&limit=10`),
          ]);
          if (cancelled) return;
          if (!monthlyRes.ok) throw new Error(`Errore stats mensili: ${monthlyRes.status}`);
          setMonthlyStats(await monthlyRes.json());
          setPrevYearStats(prevRes.ok ? await prevRes.json() : null);
          if (topRes.ok) setTopDays(await topRes.json());

        } else if (mode === "trimestrale") {
          const months = QUARTER_MONTHS[quarter - 1];
          // Fetch all 3 months of the quarter + same quarter previous year
          const fetches = months.map(m =>
            apiFetch(`${API_BASE}/admin/finance/stats/monthly?year=${year}&month=${m}`)
          );
          const prevFetches = months.map(m =>
            apiFetch(`${API_BASE}/admin/finance/stats/monthly?year=${year - 1}&month=${m}`)
          );
          const topRes = apiFetch(`${API_BASE}/admin/finance/stats/top-days?year=${year}&limit=10`);
          const [results, prevResults, topResult] = await Promise.all([
            Promise.all(fetches), Promise.all(prevFetches), topRes,
          ]);
          if (cancelled) return;
          const qStats = [];
          for (const r of results) {
            if (r.ok) qStats.push(await r.json());
          }
          const pqStats = [];
          for (const r of prevResults) {
            if (r.ok) pqStats.push(await r.json());
          }
          setQuarterStats(qStats);
          setPrevQuarterStats(pqStats);
          if (topResult.ok) setTopDays(await topResult.json());

        } else if (mode === "annuale") {
          const [annualRes, topRes] = await Promise.all([
            apiFetch(`${API_BASE}/admin/finance/stats/annual-compare?year=${year}`),
            apiFetch(`${API_BASE}/admin/finance/stats/top-days?year=${year}&limit=10`),
          ]);
          if (cancelled) return;
          if (!annualRes.ok) throw new Error(`Errore confronto annuale: ${annualRes.status}`);
          setAnnualData(await annualRes.json());
          if (topRes.ok) setTopDays(await topRes.json());
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError(err.message || "Errore nel caricamento dati");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    // Carica turni chiusi (indipendente dal mode)
    apiFetch(`${API_BASE}/settings/closures-config/`)
      .then(r => r.ok ? r.json() : { turni_chiusi: [] })
      .then(data => { if (!cancelled) setTurniChiusi(data.turni_chiusi || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mode, year, month, quarter]);

  // ── Navigation ──
  const goBack = useCallback(() => {
    if (mode === "mensile") {
      const d = new Date(year, month - 2, 1);
      setYear(d.getFullYear()); setMonth(d.getMonth() + 1);
    } else if (mode === "trimestrale") {
      if (quarter === 1) { setQuarter(4); setYear(y => y - 1); }
      else setQuarter(q => q - 1);
    } else {
      setYear(y => y - 1);
    }
  }, [mode, year, month, quarter]);

  const goForward = useCallback(() => {
    if (mode === "mensile") {
      const d = new Date(year, month, 1);
      setYear(d.getFullYear()); setMonth(d.getMonth() + 1);
    } else if (mode === "trimestrale") {
      if (quarter === 4) { setQuarter(1); setYear(y => y + 1); }
      else setQuarter(q => q + 1);
    } else {
      setYear(y => y + 1);
    }
  }, [mode, year, month, quarter]);

  const goToday = useCallback(() => {
    const t = getTodayInfo();
    setYear(t.year); setMonth(t.month); setQuarter(t.quarter);
  }, []);

  // ── Period label ──
  const periodLabel = useMemo(() => {
    if (mode === "mensile") return `${MONTH_NAMES[month - 1]} ${year}`;
    if (mode === "trimestrale") return `${QUARTER_LABELS[quarter - 1]} ${year}`;
    return `Anno ${year}`;
  }, [mode, year, month, quarter]);

  const prevPeriodLabel = useMemo(() => {
    if (mode === "mensile") return `${MONTH_NAMES[month - 1]} ${year - 1}`;
    if (mode === "trimestrale") return `${QUARTER_LABELS[quarter - 1]} ${year - 1}`;
    return `Anno ${year - 1}`;
  }, [mode, year, month, quarter]);

  const navBackLabel = useMemo(() => {
    if (mode === "mensile") return "← Mese prec.";
    if (mode === "trimestrale") return "← Trim. prec.";
    return "← Anno prec.";
  }, [mode]);

  const navForwardLabel = useMemo(() => {
    if (mode === "mensile") return "Mese succ. →";
    if (mode === "trimestrale") return "Trim. succ. →";
    return "Anno succ. →";
  }, [mode]);

  // ── Computed data for current mode ──

  // MENSILE: reuse existing logic
  const monthlyComputed = useMemo(() => {
    if (mode !== "mensile" || !monthlyStats) return null;
    const todayNow = new Date();
    const isCurrentMonth = year === todayNow.getFullYear() && month === todayNow.getMonth() + 1;
    const cutoffDay = isCurrentMonth ? todayNow.getDate() : 31;

    let currTotal = 0, currDays = 0;
    if (monthlyStats?.giorni) {
      for (const g of monthlyStats.giorni) {
        if (g.is_closed) continue;
        const dayNum = new Date(g.date).getDate();
        if (dayNum > cutoffDay) continue;
        currTotal += g.corrispettivi ?? 0;
        currDays++;
      }
    }
    let prevTotal = 0, prevDays = 0;
    if (prevYearStats?.giorni) {
      for (const g of prevYearStats.giorni) {
        if (g.is_closed) continue;
        const dayNum = new Date(g.date).getDate();
        if (dayNum > cutoffDay) continue;
        prevTotal += g.corrispettivi ?? 0;
        prevDays++;
      }
    }
    const currMedia = currDays > 0 ? currTotal / currDays : 0;
    const prevMedia = prevDays > 0 ? prevTotal / prevDays : 0;
    const delta = prevTotal > 0 ? currTotal - prevTotal : null;
    const deltaPct = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : null;
    const deltaMedia = prevMedia > 0 ? currMedia - prevMedia : null;
    const deltaMediaPct = prevMedia > 0 ? ((currMedia - prevMedia) / prevMedia) * 100 : null;

    return {
      isPartial: isCurrentMonth, cutoffDay,
      currTotal, currDays, currMedia, prevTotal, prevDays, prevMedia,
      delta, deltaPct, deltaMedia, deltaMediaPct,
    };
  }, [mode, monthlyStats, prevYearStats, year, month]);

  // TRIMESTRALE computed
  const quarterComputed = useMemo(() => {
    if (mode !== "trimestrale" || !quarterStats) return null;
    const todayNow = new Date();
    const isCurrentQuarter = year === todayNow.getFullYear() && quarter === Math.ceil((todayNow.getMonth() + 1) / 3);
    const currentMonth = todayNow.getMonth() + 1;
    const currentDay = todayNow.getDate();

    let currTotal = 0, currDays = 0;
    for (const ms of quarterStats) {
      if (!ms?.giorni) continue;
      for (const g of ms.giorni) {
        if (g.is_closed) continue;
        if (isCurrentQuarter) {
          const gMonth = new Date(g.date).getMonth() + 1;
          const gDay = new Date(g.date).getDate();
          if (gMonth > currentMonth || (gMonth === currentMonth && gDay > currentDay)) continue;
        }
        currTotal += g.corrispettivi ?? 0;
        currDays++;
      }
    }

    let prevTotal = 0, prevDays = 0;
    if (prevQuarterStats) {
      for (const ms of prevQuarterStats) {
        if (!ms?.giorni) continue;
        for (const g of ms.giorni) {
          if (g.is_closed) continue;
          if (isCurrentQuarter) {
            const gMonth = new Date(g.date).getMonth() + 1;
            const gDay = new Date(g.date).getDate();
            // Same cutoff: same month/day offset within the quarter
            const qMonthOffset = gMonth - QUARTER_MONTHS[quarter - 1][0];
            const currQMonthOffset = currentMonth - QUARTER_MONTHS[quarter - 1][0];
            if (qMonthOffset > currQMonthOffset || (qMonthOffset === currQMonthOffset && gDay > currentDay)) continue;
          }
          prevTotal += g.corrispettivi ?? 0;
          prevDays++;
        }
      }
    }

    const currMedia = currDays > 0 ? currTotal / currDays : 0;
    const prevMedia = prevDays > 0 ? prevTotal / prevDays : 0;
    const delta = prevTotal > 0 ? currTotal - prevTotal : null;
    const deltaPct = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : null;
    const deltaMedia = prevMedia > 0 ? currMedia - prevMedia : null;
    const deltaMediaPct = prevMedia > 0 ? ((currMedia - prevMedia) / prevMedia) * 100 : null;

    return {
      isPartial: isCurrentQuarter,
      currTotal, currDays, currMedia, prevTotal, prevDays, prevMedia,
      delta, deltaPct, deltaMedia, deltaMediaPct,
      totCorrispettivi: currTotal,
      mediaCorrispettivi: currMedia,
      giorniAperti: currDays,
    };
  }, [mode, quarterStats, prevQuarterStats, year, quarter]);

  // ANNUALE computed
  const annualComputed = useMemo(() => {
    if (mode !== "annuale" || !annualData) return null;
    const curr = annualData.current;
    const prev = annualData.previous;

    // Use corrispettivi if available, else incassi
    const currTotal = curr.totale_corrispettivi ?? curr.totale_incassi ?? 0;
    const prevTotal = prev.totale_corrispettivi ?? prev.totale_incassi ?? 0;
    const currDays = curr.giorni_aperti ?? curr.mesi?.reduce((s, m) => s + (m.giorni_aperti ?? 0), 0) ?? 0;
    const prevDays = prev.giorni_aperti ?? prev.mesi?.reduce((s, m) => s + (m.giorni_aperti ?? 0), 0) ?? 0;

    const currMedia = currDays > 0 ? currTotal / currDays : 0;
    const prevMedia = prevDays > 0 ? prevTotal / prevDays : 0;
    const delta = prevTotal > 0 ? currTotal - prevTotal : null;
    const deltaPct = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : null;
    const deltaMedia = prevMedia > 0 ? currMedia - prevMedia : null;
    const deltaMediaPct = prevMedia > 0 ? ((currMedia - prevMedia) / prevMedia) * 100 : null;

    return {
      isPartial: year === today.year,
      currTotal, currDays, currMedia, prevTotal, prevDays, prevMedia,
      delta, deltaPct, deltaMedia, deltaMediaPct,
    };
  }, [mode, annualData, year, today.year]);

  // Generic KPI values for rendering
  const kpiData = mode === "mensile" ? monthlyComputed
    : mode === "trimestrale" ? quarterComputed
    : annualComputed;

  // Total corrispettivi for the period
  const totalCorrispettivi = useMemo(() => {
    if (mode === "mensile") return monthlyStats?.totale_corrispettivi ?? 0;
    if (mode === "trimestrale") return quarterComputed?.totCorrispettivi ?? 0;
    if (mode === "annuale") return annualComputed?.currTotal ?? 0;
    return 0;
  }, [mode, monthlyStats, quarterComputed, annualComputed]);

  const giorniAperti = useMemo(() => {
    if (mode === "mensile") return monthlyStats?.giorni_con_chiusura ?? 0;
    if (mode === "trimestrale") return quarterComputed?.giorniAperti ?? 0;
    if (mode === "annuale") return annualComputed?.currDays ?? 0;
    return 0;
  }, [mode, monthlyStats, quarterComputed, annualComputed]);

  const mediaCorrispettivi = useMemo(() => {
    if (mode === "mensile") return monthlyStats?.media_corrispettivi ?? 0;
    if (mode === "trimestrale") return quarterComputed?.mediaCorrispettivi ?? 0;
    if (mode === "annuale") return annualComputed?.currMedia ?? 0;
    return 0;
  }, [mode, monthlyStats, quarterComputed, annualComputed]);

  // ── Chart data ──
  const chartData = useMemo(() => {
    if (mode === "mensile") {
      if (!monthlyStats?.giorni) return [];
      const prevMap = {};
      if (prevYearStats?.giorni) {
        for (const g of prevYearStats.giorni) {
          if (!g.is_closed) {
            prevMap[new Date(g.date).getDate()] = g.corrispettivi ?? 0;
          }
        }
      }
      return monthlyStats.giorni.filter(g => !g.is_closed).map(g => {
        const dayNum = new Date(g.date).getDate();
        return { date: formatShortDate(g.date), corrispettivi: g.corrispettivi, prev: prevMap[dayNum] ?? null };
      });
    }

    if (mode === "trimestrale") {
      if (!quarterStats) return [];
      // Combine all days from the quarter
      const allDays = [];
      const prevMap = {};
      if (prevQuarterStats) {
        for (const ms of prevQuarterStats) {
          if (!ms?.giorni) continue;
          for (const g of ms.giorni) {
            if (!g.is_closed) {
              prevMap[g.date.slice(5)] = g.corrispettivi ?? 0; // "MM-DD" as key
            }
          }
        }
      }
      for (const ms of quarterStats) {
        if (!ms?.giorni) continue;
        for (const g of ms.giorni) {
          if (!g.is_closed) {
            const mmdd = g.date.slice(5);
            allDays.push({
              date: formatShortDate(g.date),
              corrispettivi: g.corrispettivi ?? 0,
              prev: prevMap[mmdd] ?? null,
            });
          }
        }
      }
      return allDays;
    }

    if (mode === "annuale" && annualData) {
      return MONTH_SHORT.map((name, i) => {
        const m = i + 1;
        const cur = annualData.current.mesi.find(x => x.month === m);
        const prev = annualData.previous.mesi.find(x => x.month === m);
        return {
          date: name,
          corrispettivi: cur?.totale_corrispettivi ?? cur?.totale_incassi ?? 0,
          prev: prev?.totale_corrispettivi ?? prev?.totale_incassi ?? 0,
        };
      });
    }

    return [];
  }, [mode, monthlyStats, prevYearStats, quarterStats, prevQuarterStats, annualData]);

  // ── Calendar (monthly only) ──
  const calendarDays = useMemo(() => {
    if (mode !== "mensile" || !monthlyStats?.giorni) return [];
    const map = {};
    for (const g of monthlyStats.giorni) { map[new Date(g.date).getDate()] = g; }
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const offset = (firstDay.getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < offset; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(map[d] || {
        date: `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`,
        is_closed: false, corrispettivi: 0, totale_incassi: 0,
      });
    }
    return days;
  }, [mode, monthlyStats, year, month]);

  // Weekday averages (monthly only)
  const weekdayAverages = useMemo(() => {
    if (mode !== "mensile" || !monthlyStats?.giorni) return {};
    const sums = {}, counts = {};
    for (const g of monthlyStats.giorni) {
      if (g.is_closed) continue;
      const corr = g.corrispettivi ?? 0;
      if (!corr) continue;
      const idx = new Date(g.date).getDay();
      sums[idx] = (sums[idx] || 0) + corr;
      counts[idx] = (counts[idx] || 0) + 1;
    }
    const avg = {};
    Object.keys(sums).forEach(k => { avg[Number(k)] = sums[k] / counts[k]; });
    return avg;
  }, [mode, monthlyStats]);

  // ── Payment pie (mensile + trimestrale) ──
  const paymentPieData = useMemo(() => {
    if (mode === "annuale") return [];
    let pag, corrTot;
    if (mode === "mensile") {
      pag = monthlyStats?.pagamenti;
      corrTot = monthlyStats?.totale_corrispettivi ?? 0;
    } else if (mode === "trimestrale" && quarterStats) {
      // Aggregate payments across all months of the quarter
      pag = { pos_bpm: 0, pos_sella: 0, stripe_pay: 0, bonifici: 0 };
      corrTot = 0;
      for (const ms of quarterStats) {
        if (!ms?.pagamenti) continue;
        pag.pos_bpm += ms.pagamenti.pos_bpm ?? 0;
        pag.pos_sella += ms.pagamenti.pos_sella ?? 0;
        pag.stripe_pay += ms.pagamenti.stripe_pay ?? 0;
        pag.bonifici += ms.pagamenti.bonifici ?? 0;
        corrTot += ms.totale_corrispettivi ?? 0;
      }
    }
    if (!pag) return [];
    const elettronici = (pag.pos_bpm ?? 0) + (pag.pos_sella ?? 0) + (pag.stripe_pay ?? 0) + (pag.bonifici ?? 0);
    const contantiFiscali = Math.max(0, corrTot - elettronici);
    const entries = [
      { label: "Contanti", value: contantiFiscali, color: "#f97316" },
      { label: "POS BPM", value: pag.pos_bpm ?? 0, color: "#22c55e" },
      { label: "POS Sella", value: pag.pos_sella ?? 0, color: "#0ea5e9" },
      { label: "Stripe / Pay", value: pag.stripe_pay ?? 0, color: "#8b5cf6" },
      { label: "Bonifici", value: pag.bonifici ?? 0, color: "#eab308" },
    ];
    return entries.filter(e => e.value > 0).map(e => ({ name: e.label, value: e.value, color: e.color }));
  }, [mode, monthlyStats, quarterStats]);

  // ── Daily table (mensile + trimestrale) ──
  const dailyRows = useMemo(() => {
    if (mode === "mensile") return monthlyStats?.giorni ?? [];
    if (mode === "trimestrale" && quarterStats) {
      const rows = [];
      for (const ms of quarterStats) {
        if (ms?.giorni) rows.push(...ms.giorni);
      }
      return rows.sort((a, b) => a.date.localeCompare(b.date));
    }
    return [];
  }, [mode, monthlyStats, quarterStats]);

  // ── Annual monthly table ──
  const annualMonthlyTable = useMemo(() => {
    if (mode !== "annuale" || !annualData) return [];
    return MONTH_SHORT.map((name, i) => {
      const m = i + 1;
      const cur = annualData.current.mesi.find(x => x.month === m);
      const prev = annualData.previous.mesi.find(x => x.month === m);
      const curVal = cur?.totale_corrispettivi ?? cur?.totale_incassi ?? null;
      const prevVal = prev?.totale_corrispettivi ?? prev?.totale_incassi ?? null;
      const delta = curVal != null && prevVal != null ? curVal - prevVal : null;
      return { name, month: m, curVal, prevVal, delta };
    });
  }, [mode, annualData]);

  // ── Ready to render? ──
  const hasData = mode === "mensile" ? !!monthlyStats
    : mode === "trimestrale" ? !!quarterStats
    : !!annualData;

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <VenditeNav current="dashboard" />

      <div className="p-6">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">

        {/* HEADER + MODE SWITCHER */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-indigo-900 tracking-wide font-playfair">
              Vendite — Dashboard
            </h1>
            <p className="text-neutral-600">
              Analisi incassi e composizione pagamenti.
            </p>
          </div>
          {/* Mode switcher */}
          <div className="flex bg-neutral-100 rounded-xl p-1 gap-1">
            {MODES.map(m => (
              <button key={m.key}
                onClick={() => setMode(m.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  mode === m.key
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-neutral-600 hover:bg-neutral-200"
                }`}>
                <span className="mr-1">{m.icon}</span>{m.label}
              </button>
            ))}
          </div>
        </div>

        {/* NAVIGATION */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <button onClick={goBack}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm">
              {navBackLabel}
            </button>
            <button onClick={goToday}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm">
              Oggi
            </button>
            <button onClick={goForward}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm">
              {navForwardLabel}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {mode === "mensile" && (
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm">
                {MONTH_NAMES.map((m, idx) => (<option key={idx+1} value={idx+1}>{m}</option>))}
              </select>
            )}
            {mode === "trimestrale" && (
              <select value={quarter} onChange={e => setQuarter(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm">
                {QUARTER_LABELS.map((q, idx) => (<option key={idx+1} value={idx+1}>{q}</option>))}
              </select>
            )}
            <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
              className="w-24 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm" />
          </div>
        </div>

        {/* Period label */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-indigo-900 font-playfair">{periodLabel}</h2>
          <p className="text-xs text-neutral-500">Confronto con {prevPeriodLabel}</p>
        </div>

        {loading && <TrgbLoader size={40} className="mb-4" />}
        {error && <div className="mb-4 text-sm text-red-600">Errore: {error}</div>}
        {!loading && hasData && dailyRows.length === 0 && mode !== "annuale" && (
          <div className="text-sm text-neutral-600">Nessuna chiusura registrata per {periodLabel}.</div>
        )}

        {hasData && (
          <>
            {/* ── KPI CARDS ── */}
            {kpiData && (() => {
              const yoy = kpiData;
              const partialLabel = yoy.isPartial ? " (parziale)" : "";
              return (
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-indigo-800">Totale Incassi</p>
                    <p className="mt-2 text-2xl font-bold text-indigo-900">€ {formatCurrency(totalCorrispettivi)}</p>
                    <p className="text-xs text-indigo-900/70 mt-1">{periodLabel}</p>
                  </div>

                  <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-neutral-700">Media giornaliera</p>
                    <p className="mt-2 text-2xl font-bold text-neutral-900">€ {formatCurrency(mediaCorrispettivi)}</p>
                    <p className="text-xs text-neutral-500 mt-1">Su {giorniAperti} giorni aperti</p>
                  </div>

                  <div className={`rounded-2xl p-4 shadow-sm border ${yoy.prevTotal > 0 ? (yoy.delta >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200") : "bg-neutral-50 border-neutral-200"}`}>
                    <p className="text-xs uppercase tracking-wide text-neutral-700">vs {prevPeriodLabel}{partialLabel}</p>
                    {yoy.prevTotal > 0 ? (
                      <>
                        <p className={`mt-2 text-2xl font-bold ${yoy.delta >= 0 ? "text-emerald-800" : "text-red-800"}`}>
                          {yoy.delta >= 0 ? "+" : ""}{formatCurrency(yoy.delta)}
                        </p>
                        <p className={`text-xs mt-1 font-semibold ${yoy.delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {yoy.deltaPct >= 0 ? "+" : ""}{yoy.deltaPct.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-neutral-400 mt-0.5">
                          {year}: € {formatCurrency(yoy.currTotal)} ({yoy.currDays}gg) — {year - 1}: € {formatCurrency(yoy.prevTotal)} ({yoy.prevDays}gg)
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-lg font-bold text-neutral-400">—</p>
                        <p className="text-xs text-neutral-400 mt-1">Nessun dato per {year - 1}</p>
                      </>
                    )}
                  </div>

                  <div className={`rounded-2xl p-4 shadow-sm border ${yoy.prevMedia > 0 ? (yoy.deltaMedia >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200") : "bg-neutral-50 border-neutral-200"}`}>
                    <p className="text-xs uppercase tracking-wide text-neutral-700">Media/gg vs {year - 1}</p>
                    {yoy.prevMedia > 0 ? (
                      <>
                        <p className={`mt-2 text-2xl font-bold ${yoy.deltaMedia >= 0 ? "text-emerald-800" : "text-red-800"}`}>
                          {yoy.deltaMedia >= 0 ? "+" : ""}{formatCurrency(yoy.deltaMedia)}
                        </p>
                        <p className={`text-xs mt-1 font-semibold ${yoy.deltaMedia >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {yoy.deltaMediaPct >= 0 ? "+" : ""}{yoy.deltaMediaPct.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-neutral-400 mt-0.5">
                          {year}: € {formatCurrency(yoy.currMedia)}/gg — {year - 1}: € {formatCurrency(yoy.prevMedia)}/gg
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-lg font-bold text-neutral-400">—</p>
                        <p className="text-xs text-neutral-400 mt-1">Nessun dato per {year - 1}</p>
                      </>
                    )}
                  </div>
                </section>
              );
            })()}

            {/* ── CHART + CALENDAR (monthly) / CHART only (quarterly/annual) ── */}
            <section className={`grid grid-cols-1 ${mode === "mensile" ? "lg:grid-cols-3" : ""} gap-6 mb-8`}>
              <div className={`${mode === "mensile" ? "lg:col-span-2" : ""} bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm`}>
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-lg font-semibold text-neutral-900 font-playfair">
                    {mode === "annuale" ? "Incassi mensili" : "Incassi giornalieri"}
                  </h2>
                  <p className="text-xs text-neutral-500">{mode !== "annuale" ? "Solo giorni aperti" : `${year} vs ${year - 1}`}</p>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    {mode === "annuale" ? (
                      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value) => [`€ ${formatCurrency(value)}`, ""]} />
                        <Legend />
                        <Bar dataKey="corrispettivi" fill="#2E7BE8" radius={[3,3,0,0]} name={`${year}`} />
                        <Bar dataKey="prev" fill="#d1d5db" radius={[3,3,0,0]} name={`${year - 1}`} />
                      </BarChart>
                    ) : (
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip formatter={(value, name) => [
                          `€ ${formatCurrency(value)}`,
                          name === "prev" ? `${year - 1}` : `${year}`
                        ]} />
                        <Legend />
                        <Line type="monotone" dataKey="corrispettivi" stroke="#2E7BE8" strokeWidth={2} dot={false} name={`${year}`} />
                        <Line type="monotone" dataKey="prev" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name={`${year - 1}`} connectNulls={false} />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Calendar — monthly only */}
              {mode === "mensile" && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 shadow-sm">
                  <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">
                    Calendario {MONTH_NAMES[month - 1]} {year}
                  </h2>
                  <div className="grid grid-cols-7 text-xs text-neutral-500 mb-1">
                    <span>Lun</span><span>Mar</span><span>Mer</span><span>Gio</span><span>Ven</span><span>Sab</span><span>Dom</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-xs">
                    {calendarDays.map((g, idx) => {
                      if (g === null) return <div key={idx} />;
                      const d = new Date(g.date);
                      const dayNum = d.getDate();
                      const isClosed = g.is_closed === true;
                      const hasTurnoChiuso = !isClosed && turniChiusi.some(t => t.data === g.date);
                      const corr = g.corrispettivi ?? 0;
                      const weekdayIdx = d.getDay();
                      const avgForWeekday = weekdayAverages[weekdayIdx];

                      let bgClass = "bg-white", textClass = "";
                      if (isClosed) { bgClass = "bg-neutral-200"; }
                      else if (avgForWeekday && corr > 0) {
                        const ratio = corr / avgForWeekday;
                        if (ratio >= 1.15) { bgClass = "bg-emerald-500"; textClass = "text-white"; }
                        else if (ratio >= 0.9) { bgClass = "bg-emerald-100"; }
                        else { bgClass = "bg-red-200"; }
                      }

                      return (
                        <div key={idx}
                          className={`rounded-xl border border-neutral-200 px-1 py-1 cursor-pointer hover:border-indigo-400 transition ${bgClass} ${textClass}`}
                          title={isClosed ? "Chiuso" : `Incassi: € ${formatCurrency(corr)}`}
                          onClick={() => navigate(`/vendite/chiusure?date=${g.date}`)}>
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-[11px] font-semibold">{dayNum}</span>
                            {!isClosed && corr > 0 && (
                              <span className="text-[9px] opacity-80">€{Math.round(corr / 100) * 100}</span>
                            )}
                          </div>
                          {isClosed && <div className="text-[9px] text-neutral-700">chiuso</div>}
                          {hasTurnoChiuso && <div className="text-[9px] text-amber-600">parziale</div>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-[10px] text-neutral-500 space-y-0.5">
                    <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-500" /><span>Sopra media (+15%)</span></div>
                    <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-100 border border-emerald-300" /><span>In linea</span></div>
                    <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-200 border border-red-300" /><span>Sotto media</span></div>
                    <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-neutral-200 border border-neutral-300" /><span>Chiuso</span></div>
                  </div>
                </div>
              )}
            </section>

            {/* ── COMPOSIZIONE PAGAMENTI (mensile + trimestrale) ── */}
            {mode !== "annuale" && paymentPieData.length > 0 && (() => {
              // Calculate payment details
              let pag, corrTot;
              if (mode === "mensile") {
                pag = monthlyStats?.pagamenti;
                corrTot = monthlyStats?.totale_corrispettivi ?? 0;
              } else if (quarterStats) {
                pag = { pos_bpm: 0, pos_sella: 0, stripe_pay: 0, bonifici: 0 };
                corrTot = 0;
                for (const ms of quarterStats) {
                  if (!ms?.pagamenti) continue;
                  pag.pos_bpm += ms.pagamenti.pos_bpm ?? 0;
                  pag.pos_sella += ms.pagamenti.pos_sella ?? 0;
                  pag.stripe_pay += ms.pagamenti.stripe_pay ?? 0;
                  pag.bonifici += ms.pagamenti.bonifici ?? 0;
                  corrTot += ms.totale_corrispettivi ?? 0;
                }
              }
              if (!pag) return null;
              const elettronici = (pag.pos_bpm ?? 0) + (pag.pos_sella ?? 0) + (pag.stripe_pay ?? 0) + (pag.bonifici ?? 0);
              const contantiFiscali = Math.max(0, corrTot - elettronici);

              return (
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm">
                    <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">Composizione pagamenti</h2>
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={paymentPieData} dataKey="value" nameKey="name"
                            innerRadius="45%" outerRadius="80%" paddingAngle={2}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}>
                            {paymentPieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value, name) => [`€ ${formatCurrency(value)}`, name]} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 text-sm flex justify-between font-semibold text-neutral-900">
                      <span>Totale incassi</span>
                      <span>€ {formatCurrency(corrTot)}</span>
                    </div>
                  </div>

                  <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 shadow-sm">
                    <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-3">Dettaglio metodi</h2>
                    <div className="space-y-2">
                      {[
                        { label: "Contanti", value: contantiFiscali, color: "bg-orange-100 text-orange-800 border-orange-200" },
                        { label: "POS BPM", value: pag.pos_bpm ?? 0, color: "bg-green-100 text-green-800 border-green-200" },
                        { label: "POS Sella", value: pag.pos_sella ?? 0, color: "bg-sky-100 text-sky-800 border-sky-200" },
                        { label: "Stripe / PayPal", value: pag.stripe_pay ?? 0, color: "bg-violet-100 text-violet-800 border-violet-200" },
                        { label: "Bonifici", value: pag.bonifici ?? 0, color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
                      ].filter(i => i.value > 0).map(i => (
                        <div key={i.label} className={`flex justify-between items-center rounded-xl border px-3 py-2 text-sm font-medium ${i.color}`}>
                          <span>{i.label}</span>
                          <span className="font-bold">€ {formatCurrency(i.value)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-900 px-3 py-2 text-sm font-bold mt-3">
                        <span>Totale dichiarato</span>
                        <span>€ {formatCurrency(corrTot)}</span>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* ── TABELLA GIORNALIERA (mensile + trimestrale) ── */}
            {mode !== "annuale" && dailyRows.length > 0 && (
              <section className="space-y-6">
                <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm overflow-x-auto">
                  <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-3">
                    Dettaglio giornaliero — {periodLabel}
                  </h2>
                  <table className="min-w-full text-xs sm:text-sm border-collapse">
                    <thead>
                      <tr className="bg-neutral-50 text-neutral-700">
                        <th className="border border-neutral-200 px-2 py-1 text-left">Data</th>
                        <th className="border border-neutral-200 px-2 py-1 text-left">Giorno</th>
                        <th className="border border-neutral-200 px-2 py-1 text-right">Incassi</th>
                        <th className="border border-neutral-200 px-2 py-1 text-center">Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyRows.map(g => {
                        const closed = g.is_closed;
                        const tcPranzo = turniChiusi.find(t => t.data === g.date && t.turno === "pranzo");
                        const tcCena = turniChiusi.find(t => t.data === g.date && t.turno === "cena");
                        const hasTurnoParziale = !closed && (tcPranzo || tcCena);
                        return (
                          <tr key={g.date} className={closed ? "bg-neutral-50 text-neutral-500" : "hover:bg-indigo-50"}>
                            <td className="border border-neutral-200 px-2 py-1 whitespace-nowrap">{formatShortDate(g.date)}</td>
                            <td className="border border-neutral-200 px-2 py-1 whitespace-nowrap">{g.weekday}</td>
                            <td className="border border-neutral-200 px-2 py-1 text-right">€ {formatCurrency(g.corrispettivi)}</td>
                            <td className="border border-neutral-200 px-2 py-1 text-center">
                              {closed ? (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700">chiuso</span>
                              ) : hasTurnoParziale ? (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                  solo {tcCena ? "pranzo" : "cena"}{(tcPranzo?.motivo || tcCena?.motivo) ? ` — ${tcPranzo?.motivo || tcCena?.motivo}` : ""}
                                </span>
                              ) : (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">aperto</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ── TABELLA MENSILE (annuale) ── */}
            {mode === "annuale" && annualData && (
              <section className="mb-8">
                <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm overflow-x-auto">
                  <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-3">
                    Dettaglio mensile — {year} vs {year - 1}
                  </h2>
                  <table className="min-w-full text-xs sm:text-sm border-collapse">
                    <thead>
                      <tr className="bg-neutral-50 text-neutral-700">
                        <th className="border border-neutral-200 px-3 py-2 text-left">Mese</th>
                        <th className="border border-neutral-200 px-3 py-2 text-right">{year}</th>
                        <th className="border border-neutral-200 px-3 py-2 text-right">{year - 1}</th>
                        <th className="border border-neutral-200 px-3 py-2 text-right">Variazione</th>
                      </tr>
                    </thead>
                    <tbody>
                      {annualMonthlyTable.map(row => {
                        const positive = row.delta != null && row.delta >= 0;
                        return (
                          <tr key={row.month} className="hover:bg-indigo-50">
                            <td className="border border-neutral-200 px-3 py-2 font-medium">{row.name}</td>
                            <td className="border border-neutral-200 px-3 py-2 text-right text-indigo-700">
                              {row.curVal != null ? `€ ${formatCurrency(row.curVal)}` : "—"}
                            </td>
                            <td className="border border-neutral-200 px-3 py-2 text-right text-neutral-500">
                              {row.prevVal != null ? `€ ${formatCurrency(row.prevVal)}` : "—"}
                            </td>
                            <td className={`border border-neutral-200 px-3 py-2 text-right font-medium ${
                              row.delta == null ? "text-neutral-300" : positive ? "text-emerald-600" : "text-red-500"
                            }`}>
                              {row.delta != null ? `${positive ? "+" : ""}€ ${formatCurrency(row.delta)}` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold text-neutral-800 border-t-2 border-neutral-300">
                        <td className="border border-neutral-200 px-3 py-2">Totale</td>
                        <td className="border border-neutral-200 px-3 py-2 text-right text-indigo-700">
                          € {formatCurrency(annualComputed?.currTotal)}
                        </td>
                        <td className="border border-neutral-200 px-3 py-2 text-right text-neutral-500">
                          € {formatCurrency(annualComputed?.prevTotal)}
                        </td>
                        <td className={`border border-neutral-200 px-3 py-2 text-right ${
                          annualComputed?.delta >= 0 ? "text-emerald-600" : "text-red-500"
                        }`}>
                          {annualComputed?.delta != null
                            ? `${annualComputed.delta >= 0 ? "+" : ""}€ ${formatCurrency(annualComputed.delta)}`
                            : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            )}

            {/* ── TOP / BOTTOM DAYS ── */}
            {topDays && (() => {
              const validDays = [...(topDays.top_best || []), ...(topDays.top_worst || [])]
                .filter((d, i, arr) => arr.findIndex(x => x.date === d.date) === i)
                .filter(d => (d.corrispettivi ?? 0) > 0);
              const bestByCorr = [...validDays].sort((a, b) => (b.corrispettivi ?? 0) - (a.corrispettivi ?? 0)).slice(0, 10);
              const worstByCorr = [...validDays].sort((a, b) => (a.corrispettivi ?? 0) - (b.corrispettivi ?? 0)).slice(0, 10);
              return (
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm">
                    <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">Giorni migliori — {year}</h2>
                    <ul className="space-y-1 text-sm max-h-72 overflow-auto">
                      {bestByCorr.map((d, idx) => (
                        <li key={idx} className="flex justify-between border-b border-neutral-100 py-1">
                          <span>{formatShortDate(d.date)} — {d.weekday}</span>
                          <span>€ {formatCurrency(d.corrispettivi)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm">
                    <h2 className="text-lg font-semibold text-neutral-900 font-playfair mb-2">Giorni peggiori — {year}</h2>
                    <ul className="space-y-1 text-sm max-h-72 overflow-auto">
                      {worstByCorr.map((d, idx) => (
                        <li key={idx} className="flex justify-between border-b border-neutral-100 py-1">
                          <span>{formatShortDate(d.date)} — {d.weekday}</span>
                          <span>€ {formatCurrency(d.corrispettivi)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              );
            })()}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
