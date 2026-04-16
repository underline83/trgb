// @version: v1.1-fattureincloud-warnings
// Pagina integrazione Fatture in Cloud — connessione, sync fatture ricevute, lista
// + Tab "Warning" (mig 062 / problemi.md A1): lista documenti FIC skippati dal sync
// perché senza numero e senza P.IVA (prima nota mascherata da fattura).
import React, { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";
import Tooltip from "../../components/Tooltip";

const FC = `${API_BASE}/fic`;

const fmt = (v) => (v != null ? Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");

export default function FattureInCloud() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncProgress, setSyncProgress] = useState(null); // { phase, total, phase1_done, phase2_total, phase2_done, last_fornitore, ... }
  const [fatture, setFatture] = useState([]);
  const [totalFatture, setTotalFatture] = useState(0);
  const [page, setPage] = useState(1);
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [syncLog, setSyncLog] = useState([]);
  const [filterFornitore, setFilterFornitore] = useState("");

  // ── Tab + Warnings (A1 / mig 062) ───────────────────────
  const [activeTab, setActiveTab] = useState("fatture"); // "fatture" | "warnings"
  const [warnings, setWarnings] = useState([]);
  const [warningsTotal, setWarningsTotal] = useState(0);
  const [warningsUnseen, setWarningsUnseen] = useState(0);
  const [warningsFilter, setWarningsFilter] = useState("non_visti"); // "non_visti" | "visti" | "tutti"
  const [warningDetail, setWarningDetail] = useState(null); // raw payload modale

  // ── S40-15 Debug dettaglio fattura ───────────────────────
  const [debugFicId, setDebugFicId] = useState("");
  const [debugResult, setDebugResult] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState("");

  // ── Fetch status ────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${FC}/status`);
      if (r.ok) setStatus(await r.json());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // ── Fetch fatture ───────────────────────────────────────
  const fetchFatture = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page, per_page: 50 });
      if (anno) params.append("anno", anno);
      if (filterFornitore) params.append("fornitore", filterFornitore);
      const r = await apiFetch(`${FC}/fatture?${params}`);
      if (r.ok) {
        const d = await r.json();
        setFatture(d.fatture || []);
        setTotalFatture(d.total || 0);
      }
    } catch (_) {}
  }, [anno, page, filterFornitore]);

  useEffect(() => {
    if (status?.connected) fetchFatture();
  }, [status, fetchFatture]);

  // ── Fetch sync log ──────────────────────────────────────
  const fetchSyncLog = useCallback(async () => {
    try {
      const r = await apiFetch(`${FC}/sync-log?limit=5`);
      if (r.ok) {
        const d = await r.json();
        setSyncLog(d.log || []);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (status?.connected) fetchSyncLog();
  }, [status, fetchSyncLog]);

  // ── Fetch warnings ──────────────────────────────────────
  const fetchWarnings = useCallback(async () => {
    try {
      const params = new URLSearchParams({ tipo: "non_fattura", per_page: 200 });
      if (warningsFilter === "non_visti") params.append("visto", "0");
      else if (warningsFilter === "visti") params.append("visto", "1");
      const r = await apiFetch(`${FC}/warnings?${params}`);
      if (r.ok) {
        const d = await r.json();
        setWarnings(d.warnings || []);
        setWarningsTotal(d.total || 0);
      }
    } catch (_) {}
  }, [warningsFilter]);

  const fetchWarningsCount = useCallback(async () => {
    try {
      const r = await apiFetch(`${FC}/warnings/count?visto=0`);
      if (r.ok) {
        const d = await r.json();
        setWarningsUnseen(d.count || 0);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (status?.connected) fetchWarningsCount();
  }, [status, fetchWarningsCount]);

  useEffect(() => {
    if (status?.connected && activeTab === "warnings") fetchWarnings();
  }, [status, activeTab, fetchWarnings]);

  // ── Warning actions ─────────────────────────────────────
  const handleMarkSeen = async (w) => {
    const note = prompt("Nota opzionale (lascia vuoto per saltare):", w.note || "") ?? "";
    try {
      const r = await apiFetch(`${FC}/warnings/${w.id}/visto?note=${encodeURIComponent(note)}`, { method: "POST" });
      if (r.ok) {
        fetchWarnings();
        fetchWarningsCount();
      }
    } catch (_) {}
  };

  const handleMarkUnseen = async (w) => {
    try {
      const r = await apiFetch(`${FC}/warnings/${w.id}/unvisto`, { method: "POST" });
      if (r.ok) {
        fetchWarnings();
        fetchWarningsCount();
      }
    } catch (_) {}
  };

  const handleShowDetail = async (w) => {
    try {
      const r = await apiFetch(`${FC}/warnings/${w.id}`);
      if (r.ok) setWarningDetail(await r.json());
    } catch (_) {}
  };

  const exportWarningsCsv = () => {
    if (!warnings.length) return;
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [
      ["id", "sync_at", "tipo", "fornitore", "piva", "numero", "data", "importo", "fic_id", "visto", "note"],
      ...warnings.map((w) => [
        w.id, w.sync_at, w.tipo, w.fornitore_nome, w.fornitore_piva,
        w.numero_documento, w.data_documento, w.importo, w.fic_document_id,
        w.visto, w.note,
      ]),
    ];
    const csv = rows.map((r) => r.map(esc).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fic_warnings_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── S40-15 Debug dettaglio fattura FIC ──────────────────
  const handleDebugDetail = async () => {
    const id = (debugFicId || "").trim();
    if (!id) return;
    setDebugLoading(true);
    setDebugError("");
    setDebugResult(null);
    try {
      const r = await apiFetch(`${FC}/debug-detail/${id}`);
      const d = await r.json();
      if (r.ok) setDebugResult(d);
      else setDebugError(d.detail || `HTTP ${r.status}`);
    } catch (e) {
      setDebugError("Errore di rete");
    }
    setDebugLoading(false);
  };

  // ── Connect ─────────────────────────────────────────────
  const handleConnect = async () => {
    if (!token.trim()) return;
    setConnecting(true);
    try {
      const r = await apiFetch(`${FC}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token.trim() }),
      });
      const d = await r.json();
      if (r.ok) {
        setToken("");
        fetchStatus();
      } else {
        alert(d.detail || "Errore connessione");
      }
    } catch (e) {
      alert("Errore di rete");
    }
    setConnecting(false);
  };

  // ── Disconnect ──────────────────────────────────────────
  const handleDisconnect = async () => {
    if (!confirm("Scollegare Fatture in Cloud?")) return;
    await apiFetch(`${FC}/disconnect`, { method: "POST" });
    setStatus(null);
    setFatture([]);
    fetchStatus();
  };

  // ── Sync con progress ─────────────────────────────────
  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncProgress(null);

    // 1) Conta rapida per avere il totale
    try {
      const countR = await apiFetch(`${FC}/sync/count?anno=${anno}`);
      if (countR.ok) {
        const countData = await countR.json();
        setSyncProgress({ phase: "count", total: countData.total, phase1_done: 0, phase2_total: 0, phase2_done: 0, last_fornitore: "" });
      }
    } catch (_) {}

    // 2) Avvia polling progress
    const pollId = setInterval(async () => {
      try {
        const pr = await apiFetch(`${FC}/sync/progress`);
        if (pr.ok) {
          const p = await pr.json();
          setSyncProgress(prev => ({ ...prev, ...p }));
          if (p.phase === "done") clearInterval(pollId);
        }
      } catch (_) {}
    }, 1500);

    // 3) Avvia sync (bloccante finché non finisce)
    try {
      const r = await apiFetch(`${FC}/sync?anno=${anno}`, { method: "POST" });
      const d = await r.json();
      if (r.ok) {
        setSyncResult(d);
        fetchFatture();
        fetchSyncLog();
      } else {
        alert(d.detail || "Errore sync");
      }
    } catch (e) {
      alert("Errore di rete durante sync");
    }

    clearInterval(pollId);
    setSyncing(false);
    // Mantieni progress visibile per qualche secondo, poi nascondi
    setTimeout(() => setSyncProgress(null), 3000);
  };

  // ── RENDER ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <FattureNav current="fic" />

      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-teal-900 font-playfair tracking-wide mt-4 mb-1">
          Fatture in Cloud
        </h1>
        <p className="text-neutral-600 text-sm mb-8">
          Collegamento API per importare automaticamente le fatture ricevute (passive).
        </p>

        {loading ? (
          <div className="text-center py-12 text-neutral-500 text-sm">Caricamento...</div>
        ) : !status?.connected ? (
          /* ── NON COLLEGATO ─────────────────────────────── */
          <div className="bg-white rounded-2xl border-2 border-teal-200 p-6 sm:p-8 shadow-sm max-w-xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🔗</span>
              <h2 className="text-lg font-bold text-teal-900">Collega il tuo account</h2>
            </div>
            <p className="text-sm text-neutral-600 mb-4">
              Incolla il <strong>Token Personale</strong> generato su{" "}
              <a href="https://developers.fattureincloud.it" target="_blank" rel="noreferrer"
                className="text-teal-700 underline hover:text-teal-900">
                developers.fattureincloud.it
              </a>
            </p>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="a/eyJ0eXA..."
              className="w-full px-4 py-3 border-2 border-neutral-200 rounded-xl text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
            />
            <button
              onClick={handleConnect}
              disabled={connecting || !token.trim()}
              className={`px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition ${
                connecting || !token.trim()
                  ? "bg-neutral-400 cursor-not-allowed"
                  : "bg-teal-700 hover:bg-teal-800 shadow-md"
              }`}
            >
              {connecting ? "Collegamento..." : "Collega"}
            </button>
            {status?.error && (
              <p className="mt-3 text-xs text-red-600">Errore: {status.error}</p>
            )}
          </div>
        ) : (
          /* ── COLLEGATO ─────────────────────────────────── */
          <>
            {/* Status bar */}
            <div className="bg-white rounded-2xl border border-teal-200 p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm" />
                <div>
                  <div className="text-sm font-bold text-teal-900">{status.company_name}</div>
                  <div className="text-xs text-neutral-500">
                    ID: {status.company_id}
                    {status.fatture_fic != null && <span className="ml-3">FIC: {status.fatture_fic}</span>}
                    {status.fatture_xml != null && <span className="ml-2">XML: {status.fatture_xml}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={anno}
                  onChange={(e) => { setAnno(Number(e.target.value)); setPage(1); }}
                  className="px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-teal-400"
                >
                  {[2026, 2025, 2024, 2023].map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className={`px-5 py-2 rounded-xl text-sm font-semibold text-white transition ${
                    syncing ? "bg-neutral-400 cursor-not-allowed" : "bg-teal-700 hover:bg-teal-800 shadow-md"
                  }`}
                >
                  {syncing ? "Sincronizzazione..." : "Sincronizza " + anno}
                </button>
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-2 rounded-lg text-xs text-red-600 hover:bg-red-50 transition"
                >
                  Scollega
                </button>
              </div>
            </div>

            {/* Sync progress bar */}
            {syncing && syncProgress && syncProgress.total > 0 && (
              <div className="bg-white border border-teal-200 rounded-xl p-4 mb-6 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-teal-900">
                    {syncProgress.phase === "lista" ? "Fase 1 — Lettura fatture" :
                     syncProgress.phase === "dettaglio" ? "Fase 2 — Scaricamento dettagli" :
                     syncProgress.phase === "done" ? "Completata" : "Preparazione..."}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {syncProgress.phase === "lista" && `${syncProgress.phase1_done || 0} / ${syncProgress.total}`}
                    {syncProgress.phase === "dettaglio" && `${syncProgress.phase2_done || 0} / ${syncProgress.phase2_total || "?"}`}
                  </span>
                </div>
                {/* Barra progresso */}
                <div className="w-full bg-neutral-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-teal-500 to-teal-600"
                    style={{ width: `${(() => {
                      const p = syncProgress;
                      if (p.phase === "lista" && p.total > 0)
                        return Math.min(100, Math.round((p.phase1_done / p.total) * 50));
                      if (p.phase === "dettaglio" && p.phase2_total > 0)
                        return Math.min(100, 50 + Math.round((p.phase2_done / p.phase2_total) * 50));
                      if (p.phase === "done") return 100;
                      return 2;
                    })()}%` }}
                  />
                </div>
                {/* Info sotto la barra */}
                <div className="flex items-center justify-between mt-2 text-xs text-neutral-500">
                  <span>
                    {syncProgress.last_fornitore && (
                      <span className="text-neutral-600">{syncProgress.last_fornitore}</span>
                    )}
                  </span>
                  <span>
                    {(syncProgress.nuove > 0 || syncProgress.aggiornate > 0) && (
                      <span className="text-teal-700">
                        +{syncProgress.nuove} nuove, ↻{syncProgress.aggiornate} agg.
                        {syncProgress.errori > 0 && <span className="text-red-600 ml-1">⚠ {syncProgress.errori}</span>}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Sync result */}
            {syncResult && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 text-sm">
                <span className="font-semibold text-emerald-800">Sync completata:</span>{" "}
                <span className="text-emerald-700">
                  {syncResult.nuove} nuove, {syncResult.aggiornate} aggiornate
                  {syncResult.duplicate_xml > 0 && <span className="text-neutral-500">, {syncResult.duplicate_xml} già presenti da XML</span>}
                  {syncResult.merged_xml > 0 && <span className="text-blue-600">, {syncResult.merged_xml} uniti con XML</span>}
                  {syncResult.righe_importate > 0 && <span className="text-teal-600">, {syncResult.righe_importate} righe dettaglio</span>}
                  {syncResult.errori > 0 && <span className="text-red-600">, {syncResult.errori} errori</span>}
                  {" — "}{syncResult.totale_api} totali su FIC
                </span>
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-neutral-200 mb-4">
              <button
                onClick={() => setActiveTab("fatture")}
                className={`px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
                  activeTab === "fatture"
                    ? "border-teal-600 text-teal-900"
                    : "border-transparent text-neutral-500 hover:text-neutral-800"
                }`}
              >
                Fatture
              </button>
              <button
                onClick={() => setActiveTab("warnings")}
                className={`px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px flex items-center gap-2 ${
                  activeTab === "warnings"
                    ? "border-amber-500 text-amber-800"
                    : "border-transparent text-neutral-500 hover:text-neutral-800"
                }`}
              >
                Warning
                {warningsUnseen > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                    {warningsUnseen}
                  </span>
                )}
              </button>
            </div>

            {activeTab === "fatture" && (
            <>
            {/* Filtri */}
            <div className="flex items-center gap-3 mb-4">
              <input
                type="text"
                value={filterFornitore}
                onChange={(e) => { setFilterFornitore(e.target.value); setPage(1); }}
                placeholder="Cerca fornitore..."
                className="px-3 py-2 border border-neutral-200 rounded-lg text-sm w-64 focus:ring-teal-400 focus:outline-none focus:ring-2"
              />
              <span className="text-xs text-neutral-500">
                {totalFatture} fatture {anno}
              </span>
            </div>

            {/* Tabella fatture */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-teal-50 border-b border-teal-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-teal-800">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-teal-800">N.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-teal-800">Fornitore</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-teal-800">Netto</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-teal-800">IVA</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-teal-800">Totale</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-teal-800">Righe</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-teal-800">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {fatture.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                        {totalFatture === 0
                          ? "Nessuna fattura sincronizzata. Premi \"Sincronizza\" per importare."
                          : "Nessun risultato."}
                      </td>
                    </tr>
                  ) : (
                    fatture.map((f) => (
                      <tr key={f.fic_id} className="border-b border-neutral-100 hover:bg-teal-50/30 transition">
                        <td className="px-4 py-2.5 text-neutral-700">{f.data || "—"}</td>
                        <td className="px-4 py-2.5 text-neutral-600 font-mono text-xs">{f.numero || "—"}</td>
                        <td className="px-4 py-2.5 font-medium text-neutral-900">{f.fornitore_nome || "—"}</td>
                        <td className="px-4 py-2.5 text-right text-neutral-700">€ {fmt(f.importo_netto)}</td>
                        <td className="px-4 py-2.5 text-right text-neutral-500 text-xs">€ {fmt(f.importo_iva)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-teal-900">€ {fmt(f.importo_totale)}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-neutral-500">
                          {f.n_righe > 0 ? (
                            <span className="text-teal-700 font-medium">{f.n_righe}</span>
                          ) : (
                            <span className="text-neutral-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {f.pagato ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">Pagata</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">Da pagare</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalFatture > 50 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs rounded-lg border border-neutral-200 hover:bg-neutral-100 disabled:opacity-40"
                >
                  ← Prec
                </button>
                <span className="text-xs text-neutral-500">
                  Pagina {page} di {Math.ceil(totalFatture / 50)}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.ceil(totalFatture / 50)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-neutral-200 hover:bg-neutral-100 disabled:opacity-40"
                >
                  Succ →
                </button>
              </div>
            )}

            {/* S40-15 Debug dettaglio fattura FIC */}
            <div className="mt-8 bg-white rounded-2xl border border-neutral-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-neutral-700 mb-1 flex items-center gap-2">
                🔬 Debug dettaglio fattura FIC
              </h3>
              <p className="text-xs text-neutral-500 mb-3">
                Interroga direttamente FIC per un singolo <code className="bg-neutral-100 px-1 rounded">fic_id</code> e mostra cosa restituisce il dettaglio (righe, scadenze, numero). Utile per capire perché una fattura arriva senza righe.
              </p>
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  value={debugFicId}
                  onChange={(e) => setDebugFicId(e.target.value.replace(/\D/g, ""))}
                  placeholder="fic_id (es. 405656723)"
                  className="px-3 py-2 border border-neutral-200 rounded-lg text-sm w-56 font-mono focus:ring-teal-400 focus:outline-none focus:ring-2"
                  onKeyDown={(e) => { if (e.key === "Enter") handleDebugDetail(); }}
                />
                <button
                  onClick={handleDebugDetail}
                  disabled={debugLoading || !debugFicId.trim()}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition ${
                    debugLoading || !debugFicId.trim()
                      ? "bg-neutral-400 cursor-not-allowed"
                      : "bg-teal-700 hover:bg-teal-800 shadow-sm"
                  }`}
                >
                  {debugLoading ? "Interrogazione..." : "Analizza"}
                </button>
                {(debugResult || debugError) && (
                  <button
                    onClick={() => { setDebugResult(null); setDebugError(""); }}
                    className="px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-100 rounded-lg"
                  >
                    Pulisci
                  </button>
                )}
              </div>
              {debugError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 font-mono">
                  ⚠ {debugError}
                </div>
              )}
              {debugResult && (
                <div className="space-y-3">
                  {/* Sintesi */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-neutral-50 rounded-lg p-2 border border-neutral-200">
                      <div className="text-[10px] uppercase text-neutral-500 font-semibold tracking-wider">N. righe</div>
                      <div className={`text-lg font-bold ${debugResult.n_items > 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {debugResult.n_items ?? "—"}
                      </div>
                    </div>
                    <div className="bg-neutral-50 rounded-lg p-2 border border-neutral-200">
                      <div className="text-[10px] uppercase text-neutral-500 font-semibold tracking-wider">Detailed</div>
                      <div className={`text-lg font-bold ${debugResult.is_detailed ? "text-emerald-700" : "text-red-700"}`}>
                        {debugResult.is_detailed ? "sì" : "no"}
                      </div>
                    </div>
                    <div className="bg-neutral-50 rounded-lg p-2 border border-neutral-200">
                      <div className="text-[10px] uppercase text-neutral-500 font-semibold tracking-wider">Numero FIC</div>
                      <div className="text-sm font-mono text-neutral-800 truncate" title={debugResult.numero || ""}>
                        {debugResult.numero || "—"}
                      </div>
                    </div>
                    <div className="bg-neutral-50 rounded-lg p-2 border border-neutral-200">
                      <div className="text-[10px] uppercase text-neutral-500 font-semibold tracking-wider">N. pagamenti</div>
                      <div className="text-lg font-bold text-neutral-700">
                        {debugResult.n_payments ?? "—"}
                      </div>
                    </div>
                  </div>
                  {/* Verdict */}
                  {debugResult.n_items === 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                      <strong>Verdict:</strong> FIC restituisce {debugResult.is_detailed ? "fieldset=detailed" : "fieldset di default"} con <code>items_list</code> vuoto.
                      {debugResult.is_detailed
                        ? " La fattura è header-only anche su FIC — dobbiamo aspettare l'XML SdI per le righe."
                        : " Proviamo a forzare fieldset=detailed (potrebbe essere un problema di parametro)."}
                    </div>
                  )}
                  {debugResult.n_items > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900">
                      <strong>Verdict:</strong> FIC restituisce {debugResult.n_items} righe. Se in DB risultano 0 righe, il bug è nel parser o nella scrittura (exception swallowed in <code>_fetch_detail_and_righe</code>).
                    </div>
                  )}
                  {/* Payload raw */}
                  <details className="bg-neutral-900 rounded-lg overflow-hidden">
                    <summary className="px-3 py-2 text-xs text-neutral-300 cursor-pointer hover:bg-neutral-800 select-none">
                      Payload raw FIC (click per espandere)
                    </summary>
                    <pre className="px-3 py-3 text-[11px] text-emerald-300 font-mono overflow-x-auto max-h-96">
                      {JSON.stringify(debugResult, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>

            {/* Sync Log */}
            {syncLog.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-bold text-neutral-700 mb-3">Storico sincronizzazioni</h3>
                <div className="space-y-2">
                  {syncLog.map((l) => (
                    <div key={l.id} className="bg-white rounded-lg border border-neutral-200 px-4 py-2.5 flex items-center justify-between text-xs">
                      <span className="text-neutral-600">
                        {l.started_at?.replace("T", " ").slice(0, 16)}
                      </span>
                      <span className="text-neutral-700">
                        +{l.nuove} nuove, ↻{l.aggiornate} agg.
                        {l.errori > 0 && <span className="text-red-600 ml-1">⚠ {l.errori} err</span>}
                      </span>
                      <span className="text-neutral-400">{l.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>
            )}

            {activeTab === "warnings" && (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-xs text-amber-900">
                  <div className="font-semibold mb-1">⚠ Documenti skippati dal sync FIC</div>
                  <div className="text-amber-800">
                    Record importati da Fatture in Cloud come <code className="bg-amber-100 px-1 rounded">expense</code> ma
                    senza numero documento e senza P.IVA del fornitore — tipicamente
                    registrazioni di prima nota (affitti, spese cassa) non vere fatture.
                    Il sync li esclude automaticamente dalla dashboard Acquisti.
                    <br />
                    Controlla periodicamente se emerge qualcosa di inatteso: se FIC inizia a
                    inviare documenti nuovi, qui li trovi e puoi decidere come gestirli.
                  </div>
                </div>

                {/* Filtri */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-1 bg-white border border-neutral-200 rounded-lg p-1">
                    {[
                      { k: "non_visti", label: "Non visti" },
                      { k: "visti", label: "Visti" },
                      { k: "tutti", label: "Tutti" },
                    ].map((opt) => (
                      <button
                        key={opt.k}
                        onClick={() => setWarningsFilter(opt.k)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          warningsFilter === opt.k
                            ? "bg-amber-500 text-white"
                            : "text-neutral-600 hover:bg-neutral-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-neutral-500">
                    {warningsTotal} warning
                  </span>
                  <button
                    onClick={exportWarningsCsv}
                    disabled={!warnings.length}
                    className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40"
                  >
                    📥 Export CSV
                  </button>
                </div>

                {/* Tabella warnings */}
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-amber-50 border-b border-amber-100">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-amber-800">Sync</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-amber-800">Fornitore</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-amber-800">Data</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-amber-800">Importo</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-amber-800">FIC ID</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-amber-800">Stato</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-amber-800">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {warnings.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                            {warningsFilter === "non_visti"
                              ? "Nessun warning da controllare 👍"
                              : "Nessun warning."}
                          </td>
                        </tr>
                      ) : (
                        warnings.map((w) => (
                          <tr key={w.id} className="border-b border-neutral-100 hover:bg-amber-50/40 transition">
                            <td className="px-4 py-2.5 text-neutral-500 text-xs font-mono">
                              {w.sync_at?.replace("T", " ").slice(0, 16)}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-neutral-900">{w.fornitore_nome || "—"}</td>
                            <td className="px-4 py-2.5 text-neutral-600">{w.data_documento || "—"}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-amber-900">€ {fmt(w.importo)}</td>
                            <td className="px-4 py-2.5 text-neutral-500 text-xs font-mono">{w.fic_document_id}</td>
                            <td className="px-4 py-2.5 text-center">
                              {w.visto ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">✓ Visto</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">Da vedere</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <div className="flex items-center gap-1 justify-center">
                                <Tooltip label="Mostra payload raw FIC">
                                  <button
                                    onClick={() => handleShowDetail(w)}
                                    className="px-2 py-1 rounded text-xs border border-neutral-200 hover:bg-neutral-100"
                                  >
                                    🔍
                                  </button>
                                </Tooltip>
                                {w.visto ? (
                                  <Tooltip label="Rimetti come non visto">
                                    <button
                                      onClick={() => handleMarkUnseen(w)}
                                      className="px-2 py-1 rounded text-xs border border-amber-300 text-amber-700 hover:bg-amber-50"
                                    >
                                      ↺
                                    </button>
                                  </Tooltip>
                                ) : (
                                  <Tooltip label="Marca come visto (nota opzionale)">
                                    <button
                                      onClick={() => handleMarkSeen(w)}
                                      className="px-2 py-1 rounded text-xs border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                    >
                                      ✓
                                    </button>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Note visibili (solo se ci sono warning con note) */}
                {warnings.some((w) => w.note) && (
                  <div className="mt-4 space-y-1">
                    {warnings.filter((w) => w.note).map((w) => (
                      <div key={`note-${w.id}`} className="text-xs text-neutral-600">
                        <span className="font-mono text-amber-700">#{w.id}</span>{" "}
                        <span className="text-neutral-400">{w.fornitore_nome}:</span>{" "}
                        {w.note}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Modale dettaglio raw FIC */}
        {warningDetail && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setWarningDetail(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-teal-900">Payload raw FIC</h3>
                  <p className="text-xs text-neutral-500">
                    {warningDetail.fornitore_nome} — fic_id {warningDetail.fic_document_id}
                  </p>
                </div>
                <button
                  onClick={() => setWarningDetail(null)}
                  className="text-neutral-400 hover:text-neutral-700 text-2xl leading-none"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-auto p-6">
                <pre className="text-[11px] font-mono text-neutral-700 bg-neutral-50 p-4 rounded-lg whitespace-pre-wrap break-all">
                  {JSON.stringify(warningDetail.raw_payload || warningDetail, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
