// @version: v1.0-fattureincloud
// Pagina integrazione Fatture in Cloud — connessione, sync fatture ricevute, lista
import React, { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const FC = `${API_BASE}/fic`;

const fmt = (v) => (v != null ? Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");

export default function FattureInCloud() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [fatture, setFatture] = useState([]);
  const [totalFatture, setTotalFatture] = useState(0);
  const [page, setPage] = useState(1);
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [syncLog, setSyncLog] = useState([]);
  const [filterFornitore, setFilterFornitore] = useState("");

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

  // ── Sync ────────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
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
    setSyncing(false);
  };

  // ── RENDER ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
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

            {/* Sync result */}
            {syncResult && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 text-sm">
                <span className="font-semibold text-emerald-800">Sync completata:</span>{" "}
                <span className="text-emerald-700">
                  {syncResult.nuove} nuove, {syncResult.aggiornate} aggiornate
                  {syncResult.duplicate_xml > 0 && <span className="text-neutral-500">, {syncResult.duplicate_xml} già presenti da XML</span>}
                  {syncResult.righe_importate > 0 && <span className="text-teal-600">, {syncResult.righe_importate} righe dettaglio</span>}
                  {syncResult.errori > 0 && <span className="text-red-600">, {syncResult.errori} errori</span>}
                  {" — "}{syncResult.totale_api} totali su FIC
                </span>
              </div>
            )}

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
      </div>
    </div>
  );
}
