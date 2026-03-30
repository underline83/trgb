// src/pages/admin/GestioneContanti.jsx
// @version: v2.0 — Gestione Contanti (contanti da versare + pre-conti + spese)
// Ora vive sotto Flussi di Cassa. Il contenuto è esportato come GestioneContantiContent.
import React, { useState, useEffect, useMemo, useCallback } from "react";
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

// ── SIDEBAR MENU (Mance ora ha tab dedicata in FlussiCassa) ──
const MENU = [
  { key: "movimenti", label: "Movimenti Contanti", icon: "💶" },
  { key: "preconti", label: "Pre-conti", icon: "🍽️" },
  { key: "spese", label: "Spese turno", icon: "🧾" },
  { key: "spese-varie", label: "Spese varie", icon: "💸" },
];

/** Contenuto senza nav esterna — usato da FlussiCassaContanti */
export function GestioneContantiContent() {
  const [activeSection, setActiveSection] = useState("movimenti");

  return (
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
                      ? "bg-emerald-100 text-emerald-900 shadow-sm"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}>
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 p-5 md:p-6 overflow-auto">
              {activeSection === "movimenti" && <SezioneMovimentiContanti />}
              {activeSection === "preconti" && <SezionePreconti />}
              {activeSection === "spese" && <SezioneSpese />}
              {activeSection === "spese-varie" && <SezioneSpeseVarie />}
            </div>
          </div>
        </div>
      </div>
  );
}


// ═══════════════════════════════════════════
// SEZIONE: MOVIMENTI CONTANTI (wrapper 2 sub-tab)
// ═══════════════════════════════════════════
function SezioneMovimentiContanti() {
  const [subTab, setSubTab] = useState("pagamenti");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-emerald-900 font-playfair">Movimenti Contanti</h1>
        <p className="text-neutral-500 text-sm mt-1">
          Pagamenti in contanti per fatture/spese tracciate e versamenti contanti in banca.
        </p>
      </div>

      {/* Sub-tab switcher */}
      <div className="flex gap-1 bg-neutral-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setSubTab("pagamenti")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            subTab === "pagamenti"
              ? "bg-white text-emerald-800 shadow-sm"
              : "text-neutral-500 hover:text-neutral-700"
          }`}>
          💶 Pagamenti spese
        </button>
        <button
          onClick={() => setSubTab("versamenti")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            subTab === "versamenti"
              ? "bg-white text-emerald-800 shadow-sm"
              : "text-neutral-500 hover:text-neutral-700"
          }`}>
          🏦 Versamenti in banca
        </button>
      </div>

      {subTab === "pagamenti" && <SubPagamentiContanti />}
      {subTab === "versamenti" && <SubVersamentiContanti />}
    </div>
  );
}

// ═══════════════════════════════════════════
// SUB: PAGAMENTI SPESE IN CONTANTI
// ═══════════════════════════════════════════
function SubPagamentiContanti() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [movimenti, setMovimenti] = useState([]);
  const [totale, setTotale] = useState(0);
  const [loading, setLoading] = useState(false);

  // Form registrazione pagamento
  const [showForm, setShowForm] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [uscite, setUscite] = useState([]);
  const [loadingUscite, setLoadingUscite] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const fetchMovimenti = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/movimenti-contanti?anno=${year}&mese=${month}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const j = await res.json();
      setMovimenti(j.movimenti || []);
      setTotale(j.totale || 0);
    } catch (_) {}
    finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { fetchMovimenti(); }, [fetchMovimenti]);

  // Ricerca uscite da pagare
  const [errUscite, setErrUscite] = useState(null);
  const searchUscite = useCallback(async (q) => {
    setLoadingUscite(true);
    setErrUscite(null);
    try {
      const url = q && q.length >= 2
        ? `${API_BASE}/controllo-gestione/uscite-da-pagare?search=${encodeURIComponent(q)}`
        : `${API_BASE}/controllo-gestione/uscite-da-pagare`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const j = await res.json();
      setUscite(j.uscite || []);
    } catch (e) { setErrUscite(e.message); setUscite([]); }
    finally { setLoadingUscite(false); }
  }, []);

  // Carica uscite quando si apre il form
  useEffect(() => {
    if (showForm) searchUscite(searchText);
  }, [showForm]);

  // Debounce search
  useEffect(() => {
    if (!showForm) return;
    const timer = setTimeout(() => searchUscite(searchText), 350);
    return () => clearTimeout(timer);
  }, [searchText, searchUscite]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handlePaga = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite/segna-pagate-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [...selected],
          data_pagamento: new Date().toISOString().slice(0, 10),
          metodo_pagamento: "CONTANTI",
        }),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      setShowForm(false);
      setSelected(new Set());
      setSearchText("");
      setUscite([]);
      fetchMovimenti();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => { const d = new Date(year, month - 2, 1); setYear(d.getFullYear()); setMonth(d.getMonth() + 1); };
  const goForward = () => { const d = new Date(year, month, 1); setYear(d.getFullYear()); setMonth(d.getMonth() + 1); };

  const tipoBadge = (u) => {
    if (u.tipo_uscita === "STIPENDIO") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">Stipendio</span>;
    if (u.tipo_uscita === "SPESA_FISSA") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Spesa fissa</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Fattura</span>;
  };

  const totaleSelezionato = [...selected].reduce((s, id) => {
    const u = uscite.find(x => x.id === id);
    return s + (u ? Number(u.importo || 0) : 0);
  }, 0);

  return (
    <div className="space-y-4">
      {/* Nav mese */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={goBack} className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm">← Mese prec.</button>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm">
          {MONTH_NAMES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
          className="w-20 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm" />
        <button onClick={goForward} className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm">Mese succ. →</button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
          <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide">Pagamenti contanti del mese</p>
          <p className="text-2xl font-bold text-orange-800 mt-1">€ {fmt(totale)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">N. operazioni</p>
          <p className="text-2xl font-bold text-blue-800 mt-1">{movimenti.length}</p>
        </div>
      </div>

      {/* Button */}
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition">
          + Registra pagamento contanti
        </button>
      </div>

      {/* Form registra pagamento */}
      {showForm && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-bold text-emerald-800">Seleziona spese da pagare in contanti</h3>
          <input
            type="text" value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Cerca per fornitore o n° fattura..."
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
          />
          {loadingUscite && <p className="text-xs text-neutral-400 animate-pulse">Ricerca...</p>}
          {errUscite && <p className="text-xs text-red-600">Errore: {errUscite}</p>}
          {uscite.length > 0 && (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {uscite.map(u => {
                const checked = selected.has(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => toggleSelect(u.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition border ${
                      checked
                        ? "bg-emerald-100 border-emerald-400 ring-2 ring-emerald-300"
                        : "bg-white border-neutral-200 hover:border-emerald-300 hover:bg-emerald-50"
                    }`}>
                    <input type="checkbox" checked={checked} readOnly className="accent-emerald-600" />
                    {tipoBadge(u)}
                    <span className="truncate text-neutral-700 flex-1">{u.fornitore_nome || "—"}</span>
                    <span className="text-xs text-neutral-400">{u.numero_fattura || u.descrizione || ""}</span>
                    <span className="font-bold text-neutral-800 whitespace-nowrap">€ {fmt(u.importo)}</span>
                  </button>
                );
              })}
            </div>
          )}
          {!loadingUscite && !errUscite && uscite.length === 0 && (
            <p className="text-xs text-neutral-400 italic">Nessuna spesa da pagare trovata{searchText ? ` per "${searchText}"` : ""}.</p>
          )}
          {selected.size > 0 && (
            <div className="flex items-center justify-between bg-emerald-100 rounded-lg px-4 py-3">
              <span className="text-sm font-medium text-emerald-800">
                {selected.size} {selected.size === 1 ? "spesa selezionata" : "spese selezionate"} — Totale: <strong>€ {fmt(totaleSelezionato)}</strong>
              </span>
              <button onClick={handlePaga} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 transition">
                {saving ? "..." : "💶 Paga in contanti"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lista movimenti passati */}
      {loading && <div className="text-sm text-neutral-500 animate-pulse">Caricamento...</div>}
      {!loading && movimenti.length === 0 && (
        <div className="text-center text-neutral-400 py-8 text-sm">Nessun pagamento in contanti per questo mese.</div>
      )}
      {!loading && movimenti.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="bg-neutral-50 text-neutral-700">
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Data pag.</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Fornitore</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-left">Descrizione</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-center">Tipo</th>
                <th className="border-b border-neutral-200 px-3 py-2 text-right">Importo</th>
              </tr>
            </thead>
            <tbody>
              {movimenti.map(m => (
                <tr key={m.id} className="hover:bg-orange-50">
                  <td className="border-b border-neutral-100 px-3 py-2 whitespace-nowrap">{fmtDate(m.data_pagamento)}</td>
                  <td className="border-b border-neutral-100 px-3 py-2 font-medium text-neutral-700">{m.fornitore_nome || "—"}</td>
                  <td className="border-b border-neutral-100 px-3 py-2 text-neutral-500 text-xs">{m.numero_fattura || m.descrizione || "—"}</td>
                  <td className="border-b border-neutral-100 px-3 py-2 text-center">
                    {m.tipo_uscita === "STIPENDIO"
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">Stipendio</span>
                      : m.tipo_uscita === "SPESA_FISSA"
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Spesa fissa</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Fattura</span>
                    }
                  </td>
                  <td className="border-b border-neutral-100 px-3 py-2 text-right font-bold text-orange-700">€ {fmt(m.importo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-neutral-50 border-t-2 border-neutral-300">
                <td colSpan={4} className="px-3 py-2">Totale</td>
                <td className="px-3 py-2 text-right text-orange-700">€ {fmt(totale)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// SUB: VERSAMENTI CONTANTI IN BANCA (ex SezioneContanti)
// ═══════════════════════════════════════════
function SubVersamentiContanti() {
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
  const [depositBancaId, setDepositBancaId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Bank matches
  const [bankMatches, setBankMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

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

  const fetchBankMatches = useCallback(async () => {
    setLoadingMatches(true);
    try {
      // Cerca movimenti entrata con "contanti" in descrizione, anno corrente
      const dFrom = `${year}-01-01`;
      const dTo = new Date().toISOString().slice(0, 10);
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/deposit/bank-matches?data_da=${dFrom}&data_a=${dTo}&search=contanti`);
      if (res.ok) setBankMatches(await res.json());
    } catch (_) { /* ignore */ }
    finally { setLoadingMatches(false); }
  }, [year]);

  const handleOpenForm = () => {
    setShowForm(true);
    setDepositBancaId(null);
    fetchBankMatches();
  };

  const handleSelectMatch = (mov) => {
    setDepositBancaId(mov.id);
    setDepositDate(mov.data_contabile);
    setDepositAmount(String(mov.importo));
    setDepositNote(mov.descrizione || "");
  };

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: depositDate, importo: amount, note: depositNote,
          banca_movimento_id: depositBancaId,
        }),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      setShowForm(false);
      setDepositAmount("");
      setDepositNote("");
      setDepositBancaId(null);
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
        <button onClick={() => showForm ? setShowForm(false) : handleOpenForm()}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition">
          + Registra versamento
        </button>
      </div>

      {/* Deposit form */}
      {showForm && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-bold text-emerald-800">Nuovo versamento in banca</h3>

          {/* Movimenti bancari suggeriti */}
          <div>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
              Movimenti bancari in ingresso (ultimi 60gg)
            </p>
            {loadingMatches && <p className="text-xs text-neutral-400 animate-pulse">Ricerca movimenti...</p>}
            {!loadingMatches && bankMatches.filter(m => !m.gia_collegato).length === 0 && (
              <p className="text-xs text-neutral-400 italic">Nessun movimento in ingresso trovato.</p>
            )}
            {!loadingMatches && bankMatches.filter(m => !m.gia_collegato).length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {bankMatches.filter(m => !m.gia_collegato).map(mov => {
                  const selected = depositBancaId === mov.id;
                  return (
                    <button key={mov.id} type="button"
                      onClick={() => selected ? (() => { setDepositBancaId(null); setDepositAmount(""); setDepositNote(""); })() : handleSelectMatch(mov)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition border ${
                        selected
                          ? "bg-emerald-200 border-emerald-400 ring-2 ring-emerald-300"
                          : "bg-white border-neutral-200 hover:border-emerald-300 hover:bg-emerald-50"
                      }`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-neutral-500 whitespace-nowrap">{fmtDate(mov.data_contabile)}</span>
                        <span className="truncate text-neutral-700">{mov.descrizione || "—"}</span>
                        {mov.categoria_banca && (
                          <span className="text-[10px] text-neutral-400 whitespace-nowrap">{mov.categoria_banca}</span>
                        )}
                      </div>
                      <span className="font-bold text-emerald-700 whitespace-nowrap ml-3">€ {fmt(mov.importo)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {depositBancaId && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-100 rounded-lg px-3 py-2">
              <span className="font-semibold">Collegato a movimento bancario #{depositBancaId}</span>
              <button onClick={() => { setDepositBancaId(null); setDepositAmount(""); setDepositNote(""); }}
                className="text-emerald-500 hover:text-emerald-800 ml-auto">✕ Scollega</button>
            </div>
          )}

          {/* Form manuale / override */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Data</label>
              <input type="date" value={depositDate} onChange={e => { setDepositDate(e.target.value); if (depositBancaId) setDepositBancaId(null); }}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Importo €</label>
              <input type="number" step="0.01" min="0" value={depositAmount}
                onChange={e => { setDepositAmount(e.target.value); if (depositBancaId) setDepositBancaId(null); }}
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
                          {row.banca_movimento_id && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 border border-blue-200">🏦 collegato</span>
                          )}
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
  // Totali anno (dal 1/1 al dateTo)
  const [yearPreconti, setYearPreconti] = useState(0);
  const [yearSpese, setYearSpese] = useState(0);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [openingNote, setOpeningNote] = useState("");
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

  // Saldo iniziale anno
  const [showBalanceForm, setShowBalanceForm] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");
  const [balanceNoteInput, setBalanceNoteInput] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);

  // Gestione categorie
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCatKey, setNewCatKey] = useState("");
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatColor, setNewCatColor] = useState("neutral");
  const [editingCat, setEditingCat] = useState(null); // {id, key, label, color, ordine}

  // Anno corrente dal dateFrom
  const currentYear = useMemo(() => {
    if (dateFrom) return parseInt(dateFrom.slice(0, 4));
    return new Date().getFullYear();
  }, [dateFrom]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/expense-categories`);
      if (res.ok) setCategories(await res.json());
    } catch (_) { /* ignore */ }
  }, []);

  const fetchOpeningBalance = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/opening-balance/${currentYear}`);
      if (res.ok) {
        const ob = await res.json();
        setOpeningBalance(ob.importo || 0);
        setOpeningNote(ob.note || "");
      }
    } catch (_) { /* ignore */ }
  }, [currentYear]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      // Params per anno intero (1/1 → dateTo)
      const yearStart = `${currentYear}-01-01`;
      const yearParams = new URLSearchParams({ date_from: yearStart, date_to: dateTo || yearStart });

      const [resSpese, resPreconti, resYearSpese, resYearPreconti] = await Promise.all([
        apiFetch(`${API_BASE}/admin/finance/cash/expenses?${params}`),
        apiFetch(`${API_BASE}/admin/finance/shift-closures/preconti?${params}`),
        apiFetch(`${API_BASE}/admin/finance/cash/expenses?${yearParams}`),
        apiFetch(`${API_BASE}/admin/finance/shift-closures/preconti?${yearParams}`),
      ]);
      if (!resSpese.ok) throw new Error(`Errore spese ${resSpese.status}`);
      setData(await resSpese.json());
      if (resPreconti.ok) setPrecontiTotale((await resPreconti.json()).totale || 0);
      if (resYearSpese.ok) setYearSpese((await resYearSpese.json()).totale || 0);
      if (resYearPreconti.ok) setYearPreconti((await resYearPreconti.json()).totale || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, currentYear]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchOpeningBalance(); }, [fetchOpeningBalance]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Periodo selezionato
  const saldoPeriodo = precontiTotale - data.totale;
  // Anno intero (incluso saldo iniziale)
  const entrateAnno = openingBalance + yearPreconti;
  const saldoAnno = entrateAnno - yearSpese;

  // Helpers per categorie
  const catMap = useMemo(() => {
    const m = {};
    for (const c of categories) m[c.key] = c;
    return m;
  }, [categories]);

  const catColor = (key) => COLOR_MAP[catMap[key]?.color] || COLOR_MAP.neutral;
  const catLabel = (key) => catMap[key]?.label || key;
  const activeCats = useMemo(() => categories.filter(c => c.attiva), [categories]);

  // Saldo iniziale
  const handleSaveBalance = async () => {
    const importo = parseFloat(balanceInput);
    if (isNaN(importo)) return;
    setSavingBalance(true);
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/cash/opening-balance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: currentYear, importo, note: balanceNoteInput.trim() }),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      setShowBalanceForm(false);
      fetchOpeningBalance();
    } catch (e) { alert(e.message); }
    finally { setSavingBalance(false); }
  };

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

      {/* KPI — Periodo selezionato */}
      <div>
        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Periodo selezionato</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Entrate</p>
            <p className="text-xl font-bold text-emerald-800 mt-1">€ {fmt(precontiTotale)}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide">Uscite</p>
            <p className="text-xl font-bold text-red-800 mt-1">€ {fmt(data.totale)}</p>
          </div>
          <div className={`rounded-xl p-3 text-center border ${
            saldoPeriodo >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
          }`}>
            <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wide">Saldo periodo</p>
            <p className={`text-xl font-bold mt-1 ${saldoPeriodo >= 0 ? "text-emerald-800" : "text-red-800"}`}>€ {fmt(saldoPeriodo)}</p>
          </div>
        </div>
      </div>

      {/* KPI — Totale anno */}
      <div>
        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Totale {currentYear}</p>
        <div className="grid grid-cols-4 gap-3">
          {openingBalance > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
              <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">Saldo iniziale</p>
              <p className="text-lg font-bold text-indigo-800 mt-1">€ {fmt(openingBalance)}</p>
            </div>
          )}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Entrate anno</p>
            <p className="text-lg font-bold text-emerald-800 mt-1">€ {fmt(yearPreconti)}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide">Spese anno</p>
            <p className="text-lg font-bold text-red-800 mt-1">€ {fmt(yearSpese)}</p>
          </div>
          <div className={`rounded-xl p-3 text-center border ${
            saldoAnno >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
          }`}>
            <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wide">Saldo anno</p>
            <p className={`text-2xl font-bold mt-1 ${saldoAnno >= 0 ? "text-emerald-800" : "text-red-800"}`}>€ {fmt(saldoAnno)}</p>
          </div>
        </div>
      </div>

      {/* Saldo iniziale anno */}
      {!showBalanceForm && (
        <div className="flex items-center gap-3">
          <button onClick={() => { setBalanceInput(String(openingBalance || "")); setBalanceNoteInput(openingNote); setShowBalanceForm(true); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition">
            {openingBalance > 0 ? `✏️ Saldo iniziale ${currentYear}: € ${fmt(openingBalance)}` : `+ Imposta saldo iniziale ${currentYear}`}
          </button>
          {openingNote && <span className="text-xs text-neutral-400">{openingNote}</span>}
        </div>
      )}
      {showBalanceForm && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-indigo-800 mb-3">Saldo iniziale {currentYear}</h3>
          <p className="text-xs text-neutral-500 mb-3">Contanti pre-conti accumulati prima dell'inizio del tracciamento. Questo valore si somma alle entrate dell'anno.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Importo €</label>
              <input type="number" step="0.01" value={balanceInput}
                onChange={e => setBalanceInput(e.target.value)} placeholder="0.00"
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-36" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Note</label>
              <input type="text" value={balanceNoteInput}
                onChange={e => setBalanceNoteInput(e.target.value)} placeholder="es. Contanti in cassa al 1/1"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSaveBalance} disabled={savingBalance}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {savingBalance ? "..." : "Salva"}
              </button>
              <button onClick={() => setShowBalanceForm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300 bg-white hover:bg-neutral-50">
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

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

// Default export per retrocompatibilità (redirect da vecchie route)
export default GestioneContantiContent;
