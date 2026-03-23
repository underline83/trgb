// src/pages/admin/GestioneContanti.jsx
// @version: v1.0 — Gestione Contanti (contanti da versare + pre-conti + versamenti banca)
import React, { useState, useEffect, useMemo, useCallback } from "react";
import VenditeNav from "./VenditeNav";
import { API_BASE, apiFetch } from "../../config/api";

const MONTH_NAMES = [
  "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre",
];

function fmt(n) {
  return Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00");
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

// ── SIDEBAR MENU ──
const MENU = [
  { key: "contanti", label: "Contanti da versare", icon: "💰" },
  { key: "preconti", label: "Pre-conti", icon: "🍽️" },
  { key: "spese", label: "Spese turno", icon: "🧾" },
  { key: "spese-varie", label: "Spese varie", icon: "💸" },
];

export default function GestioneContanti() {
  const [activeSection, setActiveSection] = useState("contanti");

  return (
    <div className="min-h-screen bg-neutral-100">
      <VenditeNav current="contanti" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
          <div className="flex flex-col md:flex-row min-h-[600px]">
            {/* Sidebar */}
            <div className="w-full md:w-56 bg-neutral-50 border-b md:border-b-0 md:border-r border-neutral-200 p-3 md:p-4 flex md:flex-col gap-1">
              <h2 className="hidden md:block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 px-2">
                Gestione Contanti
              </h2>
              {MENU.map(item => (
                <button key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition w-full text-left ${
                    activeSection === item.key
                      ? "bg-indigo-100 text-indigo-900 shadow-sm"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}>
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 p-5 md:p-6 overflow-auto">
              {activeSection === "contanti" && <SezioneContanti />}
              {activeSection === "preconti" && <SezionePreconti />}
              {activeSection === "spese" && <SezioneSpese />}
              {activeSection === "spese-varie" && <SezioneSpeseVarie />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════
// SEZIONE: CONTANTI DA VERSARE
// ═══════════════════════════════════════════
function SezioneContanti() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form versamento
  const [showForm, setShowForm] = useState(false);
  const [depositDate, setDepositDate] = useState(() => today.toISOString().slice(0, 10));
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/daily?year=${year}&month=${month}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Compute running balance with deposits
  const tableRows = useMemo(() => {
    if (!data) return [];
    const rows = [];
    let cumulative = 0;

    // Create a map of deposit dates
    const depositsByDate = {};
    for (const v of data.versamenti || []) {
      if (!depositsByDate[v.date]) depositsByDate[v.date] = [];
      depositsByDate[v.date].push(v);
    }

    // Also add deposits that don't match any day
    const allDates = new Set(data.giorni.map(g => g.date));

    for (const g of data.giorni) {
      if (g.is_closed) {
        rows.push({ type: "day", ...g, cumulative: cumulative });
        continue;
      }
      cumulative += g.contanti_fiscali;
      rows.push({ type: "day", ...g, cumulative: cumulative });

      // Add deposits for this date
      if (depositsByDate[g.date]) {
        for (const dep of depositsByDate[g.date]) {
          cumulative -= dep.importo;
          rows.push({ type: "deposit", ...dep, cumulative: cumulative });
        }
      }
    }

    // Add deposits on dates not in giorni
    for (const v of data.versamenti || []) {
      if (!allDates.has(v.date)) {
        cumulative -= v.importo;
        rows.push({ type: "deposit", ...v, cumulative: cumulative });
      }
    }

    return rows;
  }, [data]);

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: depositDate, importo: amount, note: depositNote }),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      setShowForm(false);
      setDepositAmount("");
      setDepositNote("");
      fetchData();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDeposit = async (id) => {
    if (!confirm("Eliminare questo versamento?")) return;
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/deposit/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Errore eliminazione");
      fetchData();
    } catch (e) {
      alert(e.message);
    }
  };

  const goBack = () => {
    const d = new Date(year, month - 2, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };
  const goForward = () => {
    const d = new Date(year, month, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-indigo-900 font-playfair">Contanti da versare</h1>
        <p className="text-neutral-500 text-sm mt-1">
          Contanti fiscali giornalieri (corrispettivi - pagamenti elettronici) con tracking versamenti in banca.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={goBack} className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm">
          ← Mese prec.
        </button>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm">
          {MONTH_NAMES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
          className="w-20 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm" />
        <button onClick={goForward} className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm">
          Mese succ. →
        </button>
      </div>

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
            <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide">Totale contanti mese</p>
            <p className="text-2xl font-bold text-orange-800 mt-1">€ {fmt(data.totale_contanti)}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Versato in banca</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">€ {fmt(data.totale_versato)}</p>
          </div>
          <div className={`rounded-xl p-4 text-center border ${
            data.saldo_da_versare > 0
              ? "bg-red-50 border-red-200"
              : "bg-neutral-50 border-neutral-200"
          }`}>
            <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wide">Da versare</p>
            <p className={`text-2xl font-bold mt-1 ${
              data.saldo_da_versare > 0 ? "text-red-700" : "text-neutral-700"
            }`}>€ {fmt(data.saldo_da_versare)}</p>
          </div>
        </div>
      )}

      {/* Add deposit button */}
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition">
          + Registra versamento
        </button>
      </div>

      {/* Deposit form */}
      {showForm && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-emerald-800">Nuovo versamento in banca</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Data</label>
              <input type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Importo €</label>
              <input type="number" step="0.01" min="0" value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Note</label>
              <input type="text" value={depositNote} onChange={e => setDepositNote(e.target.value)}
                placeholder="es. Versamento settimanale"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleDeposit} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                {saving ? "..." : "Salva"}
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300 bg-white hover:bg-neutral-50">
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading / Error */}
      {loading && <div className="text-sm text-neutral-500 animate-pulse">Caricamento...</div>}
      {error && <div className="text-sm text-red-600">Errore: {error}</div>}

      {/* Daily table with cumulative */}
      {data && !loading && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="bg-neutral-50 text-neutral-700">
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Data</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-right">Corrispettivi</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-right">Elettronici</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-right">Contanti</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-right">Cumulativo</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, idx) => {
                if (row.type === "deposit") {
                  return (
                    <tr key={`dep-${row.id}`} className="bg-emerald-50">
                      <td className="border-b border-neutral-100 px-3 py-2" colSpan={3}>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-700 font-semibold text-xs px-2 py-0.5 rounded-full bg-emerald-200">
                            VERSAMENTO
                          </span>
                          <span className="text-xs text-neutral-600">{fmtDate(row.date)}</span>
                          {row.note && <span className="text-xs text-neutral-400">— {row.note}</span>}
                        </div>
                      </td>
                      <td className="border-b border-neutral-100 px-3 py-2 text-right text-emerald-700 font-bold">
                        -€ {fmt(row.importo)}
                      </td>
                      <td className="border-b border-neutral-100 px-3 py-2 text-right font-semibold">
                        <div className="flex items-center justify-end gap-2">
                          <span className={row.cumulative > 0 ? "text-orange-700" : "text-neutral-600"}>
                            € {fmt(row.cumulative)}
                          </span>
                          <button onClick={() => handleDeleteDeposit(row.id)}
                            className="text-red-400 hover:text-red-600 text-xs" title="Elimina">
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                // Day row
                const closed = row.is_closed;
                return (
                  <tr key={row.date} className={closed ? "bg-neutral-50 text-neutral-400" : "hover:bg-indigo-50"}>
                    <td className="border-b border-neutral-100 px-3 py-2 whitespace-nowrap">
                      <span className="font-medium">{fmtDate(row.date)}</span>
                      {closed && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-500">chiuso</span>}
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 text-right">
                      {closed ? "—" : `€ ${fmt(row.corrispettivi)}`}
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 text-right">
                      {closed ? "—" : `€ ${fmt(row.elettronici)}`}
                    </td>
                    <td className={`border-b border-neutral-100 px-3 py-2 text-right font-semibold ${
                      !closed && row.contanti_fiscali > 0 ? "text-orange-700" : ""
                    }`}>
                      {closed ? "—" : `€ ${fmt(row.contanti_fiscali)}`}
                    </td>
                    <td className={`border-b border-neutral-100 px-3 py-2 text-right font-semibold ${
                      !closed && row.cumulative > 0 ? "text-orange-700" : "text-neutral-500"
                    }`}>
                      {closed ? "—" : `€ ${fmt(row.cumulative)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-neutral-50 border-t-2 border-neutral-300">
                <td className="px-3 py-2">Totale</td>
                <td className="px-3 py-2 text-right text-indigo-700">
                  € {fmt(data.giorni.filter(g => !g.is_closed).reduce((s, g) => s + g.corrispettivi, 0))}
                </td>
                <td className="px-3 py-2 text-right text-neutral-600">
                  € {fmt(data.giorni.filter(g => !g.is_closed).reduce((s, g) => s + g.elettronici, 0))}
                </td>
                <td className="px-3 py-2 text-right text-orange-700">
                  € {fmt(data.totale_contanti)}
                </td>
                <td className={`px-3 py-2 text-right ${data.saldo_da_versare > 0 ? "text-red-700" : "text-emerald-700"}`}>
                  € {fmt(data.saldo_da_versare)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Riepilogo versamenti */}
      {data && data.versamenti.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-emerald-800 mb-2">Versamenti del mese</h3>
          <div className="space-y-1">
            {data.versamenti.map(v => (
              <div key={v.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2 border border-emerald-100">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-neutral-700">{fmtDate(v.date)}</span>
                  {v.note && <span className="text-neutral-400 text-xs">{v.note}</span>}
                  <span className="text-xs text-neutral-400">da {v.created_by || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-emerald-700">€ {fmt(v.importo)}</span>
                  <button onClick={() => handleDeleteDeposit(v.id)}
                    className="text-red-400 hover:text-red-600 text-xs" title="Elimina">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════
// SEZIONE: SPESE (storico spese dai fine turno)
// ═══════════════════════════════════════════
const TIPO_LABELS = {
  scontrino: { label: "Scontrino", color: "bg-blue-50 text-blue-700 border-blue-200" },
  fattura: { label: "Fattura", color: "bg-purple-50 text-purple-700 border-purple-200" },
  personale: { label: "Personale", color: "bg-rose-50 text-rose-700 border-rose-200" },
  altro: { label: "Altro", color: "bg-neutral-100 text-neutral-600 border-neutral-300" },
};

function SezioneSpese() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState({ spese: [], totale: 0, count: 0, totale_per_tipo: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await apiFetch(`${API_BASE}/admin/finance/shift-closures/spese?${params}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [dateFrom, dateTo]);

  // Flat rows with group separators
  const flatRows = useMemo(() => {
    return data.spese || [];
  }, [data.spese]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-indigo-900 font-playfair">Spese</h1>
        <p className="text-neutral-500 text-sm mt-1">
          Spese registrate nei fine turno — scontrini, fatture, spese personale.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">Da</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">A</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide">Totale spese</p>
          <p className="text-2xl font-bold text-red-800 mt-1">€ {fmt(data.totale)}</p>
        </div>
        {Object.entries(data.totale_per_tipo || {}).map(([tipo, tot]) => {
          const info = TIPO_LABELS[tipo] || TIPO_LABELS.altro;
          return (
            <div key={tipo} className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 text-center">
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">{info.label}</p>
              <p className="text-lg font-bold text-neutral-700 mt-1">€ {fmt(tot)}</p>
            </div>
          );
        })}
      </div>

      {loading && <div className="text-sm text-neutral-500 animate-pulse">Caricamento...</div>}
      {error && <div className="text-sm text-red-600">Errore: {error}</div>}

      {!loading && !error && flatRows.length === 0 && (
        <div className="bg-neutral-50 rounded-xl p-8 text-center text-neutral-400 border border-neutral-200">
          Nessuna spesa trovata nel periodo selezionato.
        </div>
      )}

      {/* Table */}
      {!loading && !error && flatRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="bg-neutral-50 text-neutral-700">
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Data</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Turno</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Tipo</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Descrizione</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-right">Importo</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Inserito da</th>
              </tr>
            </thead>
            <tbody>
              {flatRows.map((row, idx) => {
                const prevDate = idx > 0 ? flatRows[idx - 1].date : null;
                const prevTurno = idx > 0 ? flatRows[idx - 1].turno : null;
                const isNewGroup = row.date !== prevDate || row.turno !== prevTurno;
                const tipoInfo = TIPO_LABELS[row.tipo] || TIPO_LABELS.altro;

                return (
                  <tr key={idx} className={`hover:bg-indigo-50 ${isNewGroup && idx > 0 ? "border-t-2 border-neutral-200" : ""}`}>
                    <td className="border-b border-neutral-100 px-3 py-2 whitespace-nowrap">
                      <span className="font-medium">{fmtDate(row.date)}</span>
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        row.turno === "pranzo"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-indigo-50 text-indigo-700 border-indigo-200"
                      }`}>
                        {row.turno === "pranzo" ? "☀️" : "🌙"} {row.turno}
                      </span>
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${tipoInfo.color}`}>
                        {tipoInfo.label}
                      </span>
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 text-neutral-700">
                      {row.descrizione || "—"}
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 text-right font-semibold text-red-700">
                      € {fmt(row.importo)}
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 text-xs text-neutral-400">
                      {row.created_by || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-neutral-50 border-t-2 border-neutral-300">
                <td className="px-3 py-2" colSpan={4}>Totale ({data.count} registrazioni)</td>
                <td className="px-3 py-2 text-right text-red-700">€ {fmt(data.totale)}</td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════
// SEZIONE: PRE-CONTI (storico tavoli non battuti)
// ═══════════════════════════════════════════
function SezionePreconti() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState({ preconti: [], totale: 0, count: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await apiFetch(`${API_BASE}/admin/finance/shift-closures/preconti?${params}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [dateFrom, dateTo]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const p of data.preconti) {
      const key = `${p.date}_${p.turno}`;
      if (!map.has(key)) {
        map.set(key, { date: p.date, turno: p.turno, created_by: p.created_by, items: [], totale: 0 });
      }
      const g = map.get(key);
      g.items.push(p);
      g.totale += p.importo;
    }
    return [...map.values()];
  }, [data.preconti]);

  // Flat list for table view
  const flatRows = useMemo(() => {
    const rows = [];
    for (const g of grouped) {
      for (const item of g.items) {
        rows.push({ ...item, date: g.date, turno: g.turno, created_by: g.created_by });
      }
    }
    return rows;
  }, [grouped]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-indigo-900 font-playfair">Pre-conti</h1>
        <p className="text-neutral-500 text-sm mt-1">
          Contanti incassati ma non battuti al registratore — verifica corrispondenza tavoli.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">Da</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">A</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
          <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide">Totale pre-conti</p>
          <p className="text-2xl font-bold text-orange-800 mt-1">€ {fmt(data.totale)}</p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 text-center">
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Registrazioni</p>
          <p className="text-2xl font-bold text-neutral-700 mt-1">{data.count}</p>
        </div>
      </div>

      {loading && <div className="text-sm text-neutral-500 animate-pulse">Caricamento...</div>}
      {error && <div className="text-sm text-red-600">Errore: {error}</div>}

      {!loading && !error && flatRows.length === 0 && (
        <div className="bg-neutral-50 rounded-xl p-8 text-center text-neutral-400 border border-neutral-200">
          Nessun pre-conto trovato nel periodo selezionato.
        </div>
      )}

      {/* Table */}
      {!loading && !error && flatRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="bg-neutral-50 text-neutral-700">
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Data</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Turno</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Tavolo</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-right">Importo</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Inserito da</th>
              </tr>
            </thead>
            <tbody>
              {flatRows.map((row, idx) => {
                // Check if this is a new date group
                const prevDate = idx > 0 ? flatRows[idx - 1].date : null;
                const prevTurno = idx > 0 ? flatRows[idx - 1].turno : null;
                const isNewGroup = row.date !== prevDate || row.turno !== prevTurno;

                return (
                  <tr key={idx} className={`hover:bg-indigo-50 ${isNewGroup ? "border-t-2 border-neutral-200" : ""}`}>
                    <td className="border-b border-neutral-100 px-3 py-2 whitespace-nowrap">
                      <span className="font-medium">{fmtDate(row.date)}</span>
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        row.turno === "pranzo"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-indigo-50 text-indigo-700 border-indigo-200"
                      }`}>
                        {row.turno === "pranzo" ? "☀️" : "🌙"} {row.turno}
                      </span>
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 font-medium text-neutral-700">
                      {row.tavolo || "—"}
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 text-right font-semibold text-orange-700">
                      € {fmt(row.importo)}
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 text-xs text-neutral-400">
                      {row.created_by || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-neutral-50 border-t-2 border-neutral-300">
                <td className="px-3 py-2" colSpan={3}>Totale ({data.count} registrazioni)</td>
                <td className="px-3 py-2 text-right text-orange-700">€ {fmt(data.totale)}</td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════
// SEZIONE: SPESE VARIE (pagate con contanti preconti)
// ═══════════════════════════════════════════
const COLOR_MAP = {
  green:   "bg-green-50 text-green-700 border-green-200",
  blue:    "bg-blue-50 text-blue-700 border-blue-200",
  amber:   "bg-amber-50 text-amber-700 border-amber-200",
  cyan:    "bg-cyan-50 text-cyan-700 border-cyan-200",
  rose:    "bg-rose-50 text-rose-700 border-rose-200",
  purple:  "bg-purple-50 text-purple-700 border-purple-200",
  orange:  "bg-orange-50 text-orange-700 border-orange-200",
  red:     "bg-red-50 text-red-700 border-red-200",
  indigo:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  teal:    "bg-teal-50 text-teal-700 border-teal-200",
  neutral: "bg-neutral-100 text-neutral-600 border-neutral-300",
};
const AVAILABLE_COLORS = Object.keys(COLOR_MAP);

function SezioneSpeseVarie() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState({ spese: [], totale: 0, count: 0, totale_per_categoria: {} });
  const [precontiTotale, setPrecontiTotale] = useState(0);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form nuova spesa
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formImporto, setFormImporto] = useState("");
  const [formDescrizione, setFormDescrizione] = useState("");
  const [formCategoria, setFormCategoria] = useState("altro");
  const [formNote, setFormNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Gestione categorie
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCatKey, setNewCatKey] = useState("");
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatColor, setNewCatColor] = useState("neutral");
  const [editingCat, setEditingCat] = useState(null); // {id, key, label, color, ordine}

  const fetchCategories = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/expense-categories`);
      if (res.ok) setCategories(await res.json());
    } catch (_) { /* ignore */ }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const [resSpese, resPreconti] = await Promise.all([
        apiFetch(`${API_BASE}/admin/finance/cash/expenses?${params}`),
        apiFetch(`${API_BASE}/admin/finance/shift-closures/preconti?${params}`),
      ]);
      if (!resSpese.ok) throw new Error(`Errore spese ${resSpese.status}`);
      setData(await resSpese.json());
      if (resPreconti.ok) {
        const pc = await resPreconti.json();
        setPrecontiTotale(pc.totale || 0);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const saldo = precontiTotale - data.totale;

  // Helpers per categorie
  const catMap = useMemo(() => {
    const m = {};
    for (const c of categories) m[c.key] = c;
    return m;
  }, [categories]);

  const catColor = (key) => COLOR_MAP[catMap[key]?.color] || COLOR_MAP.neutral;
  const catLabel = (key) => catMap[key]?.label || key;
  const activeCats = useMemo(() => categories.filter(c => c.attiva), [categories]);

  // CRUD spese
  const handleSave = async () => {
    const importo = parseFloat(formImporto);
    if (!importo || importo <= 0 || !formDescrizione.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/expense`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: formDate, importo, descrizione: formDescrizione.trim(),
          categoria: formCategoria, note: formNote.trim(),
        }),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      setShowForm(false);
      setFormImporto(""); setFormDescrizione(""); setFormNote(""); setFormCategoria("altro");
      fetchData();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Eliminare questa spesa?")) return;
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/expense/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Errore eliminazione");
      fetchData();
    } catch (e) { alert(e.message); }
  };

  // CRUD categorie
  const handleAddCat = async () => {
    const key = newCatKey.trim().toLowerCase().replace(/\s+/g, "-");
    const label = newCatLabel.trim();
    if (!key || !label) return;
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/expense-category`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, label, color: newCatColor, ordine: categories.length + 1 }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Errore"); }
      setNewCatKey(""); setNewCatLabel(""); setNewCatColor("neutral");
      fetchCategories();
    } catch (e) { alert(e.message); }
  };

  const handleUpdateCat = async () => {
    if (!editingCat) return;
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/expense-category/${editingCat.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: editingCat.key, label: editingCat.label,
          color: editingCat.color, ordine: editingCat.ordine,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Errore"); }
      setEditingCat(null);
      fetchCategories(); fetchData();
    } catch (e) { alert(e.message); }
  };

  const handleDeleteCat = async (id) => {
    if (!confirm("Eliminare questa categoria? Le spese associate verranno spostate su 'Altro'.")) return;
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/expense-category/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Errore eliminazione");
      fetchCategories(); fetchData();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-indigo-900 font-playfair">Spese varie</h1>
          <p className="text-neutral-500 text-sm mt-1">
            Spese pagate con i contanti dei pre-conti (soldi non battuti al registratore).
          </p>
        </div>
        <button onClick={() => setShowCatManager(!showCatManager)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
            showCatManager
              ? "bg-indigo-100 text-indigo-800 border-indigo-300"
              : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
          }`}>
          ⚙️ Categorie
        </button>
      </div>

      {/* ── GESTIONE CATEGORIE ── */}
      {showCatManager && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-bold text-indigo-800">Gestione categorie</h3>

          {/* Lista categorie esistenti */}
          <div className="space-y-2">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center gap-2 bg-white rounded-lg border border-neutral-200 px-3 py-2">
                {editingCat?.id === cat.id ? (
                  <>
                    <input type="text" value={editingCat.label}
                      onChange={e => setEditingCat({ ...editingCat, label: e.target.value })}
                      className="flex-1 border border-neutral-300 rounded px-2 py-1 text-sm" />
                    <select value={editingCat.color}
                      onChange={e => setEditingCat({ ...editingCat, color: e.target.value })}
                      className="border border-neutral-300 rounded px-2 py-1 text-xs bg-white">
                      {AVAILABLE_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" value={editingCat.ordine} min={0}
                      onChange={e => setEditingCat({ ...editingCat, ordine: Number(e.target.value) })}
                      className="w-14 border border-neutral-300 rounded px-2 py-1 text-xs text-center" title="Ordine" />
                    <button onClick={handleUpdateCat}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 px-2">Salva</button>
                    <button onClick={() => setEditingCat(null)}
                      className="text-xs text-neutral-400 hover:text-neutral-600 px-1">Annulla</button>
                  </>
                ) : (
                  <>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${COLOR_MAP[cat.color] || COLOR_MAP.neutral}`}>
                      {cat.label}
                    </span>
                    <span className="text-[10px] text-neutral-400 ml-1">({cat.key})</span>
                    <span className="text-[10px] text-neutral-300 ml-auto">#{cat.ordine}</span>
                    <button onClick={() => setEditingCat({ ...cat })}
                      className="text-xs text-indigo-500 hover:text-indigo-700 px-1">Modifica</button>
                    <button onClick={() => handleDeleteCat(cat.id)}
                      className="text-xs text-red-400 hover:text-red-600 px-1">✕</button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Aggiungi nuova */}
          <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-indigo-200">
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">Chiave</label>
              <input type="text" value={newCatKey} onChange={e => setNewCatKey(e.target.value)}
                placeholder="es. pulizia" className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-28" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">Nome</label>
              <input type="text" value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)}
                placeholder="es. Pulizia" className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-36" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">Colore</label>
              <select value={newCatColor} onChange={e => setNewCatColor(e.target.value)}
                className="border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white">
                {AVAILABLE_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button onClick={handleAddCat}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700">
              + Aggiungi
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">Da</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">A</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
      </div>

      {/* KPI Cards — bilancio preconti vs spese */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Entrate (pre-conti)</p>
          <p className="text-2xl font-bold text-emerald-800 mt-1">€ {fmt(precontiTotale)}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide">Uscite (spese)</p>
          <p className="text-2xl font-bold text-red-800 mt-1">€ {fmt(data.totale)}</p>
        </div>
        <div className={`rounded-xl p-4 text-center border ${
          saldo >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
        }`}>
          <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wide">Saldo contanti</p>
          <p className={`text-2xl font-bold mt-1 ${saldo >= 0 ? "text-emerald-800" : "text-red-800"}`}>€ {fmt(saldo)}</p>
        </div>
      </div>

      {/* Breakdown per categoria */}
      {Object.keys(data.totale_per_categoria || {}).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(data.totale_per_categoria).map(([cat, tot]) => (
            <div key={cat} className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-center">
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">{catLabel(cat)}</p>
              <p className="text-lg font-bold text-neutral-700 mt-1">€ {fmt(tot)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 shadow-sm transition">
          + Registra spesa
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-red-800">Nuova spesa</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Data</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Importo €</label>
              <input type="number" step="0.01" min="0" value={formImporto}
                onChange={e => setFormImporto(e.target.value)} placeholder="0.00"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Categoria</label>
              <select value={formCategoria} onChange={e => setFormCategoria(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white">
                {activeCats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Descrizione</label>
              <input type="text" value={formDescrizione} onChange={e => setFormDescrizione(e.target.value)}
                placeholder="es. Spesa frutta mercato"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                {saving ? "..." : "Salva"}
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300 bg-white hover:bg-neutral-50">
                Annulla
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">Note (opzionale)</label>
            <input type="text" value={formNote} onChange={e => setFormNote(e.target.value)}
              placeholder="Note aggiuntive..."
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-neutral-500 animate-pulse">Caricamento...</div>}
      {error && <div className="text-sm text-red-600">Errore: {error}</div>}

      {!loading && !error && data.spese.length === 0 && (
        <div className="bg-neutral-50 rounded-xl p-8 text-center text-neutral-400 border border-neutral-200">
          Nessuna spesa registrata nel periodo selezionato.
        </div>
      )}

      {/* Table */}
      {!loading && !error && data.spese.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="bg-neutral-50 text-neutral-700">
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Data</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Categoria</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Descrizione</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-right">Importo</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Note</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-center w-10"></th>
              </tr>
            </thead>
            <tbody>
              {data.spese.map((row, idx) => {
                const prevDate = idx > 0 ? data.spese[idx - 1].date : null;
                const isNewDate = row.date !== prevDate;
                return (
                  <tr key={row.id} className={`hover:bg-indigo-50 ${isNewDate && idx > 0 ? "border-t-2 border-neutral-200" : ""}`}>
                    <td className="border-b border-neutral-100 px-3 py-2 whitespace-nowrap">
                      <span className="font-medium">{fmtDate(row.date)}</span>
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${catColor(row.categoria)}`}>
                        {catLabel(row.categoria)}
                      </span>
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 text-neutral-700">
                      {row.descrizione || "—"}
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 text-right font-semibold text-red-700">
                      € {fmt(row.importo)}
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 text-xs text-neutral-400">
                      {row.note || "—"}
                    </td>
                    <td className="border-b border-neutral-100 px-3 py-2 text-center">
                      <button onClick={() => handleDelete(row.id)}
                        className="text-red-400 hover:text-red-600 text-xs" title="Elimina">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-neutral-50 border-t-2 border-neutral-300">
                <td className="px-3 py-2" colSpan={3}>Totale ({data.count} spese)</td>
                <td className="px-3 py-2 text-right text-red-700">€ {fmt(data.totale)}</td>
                <td className="px-3 py-2" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
