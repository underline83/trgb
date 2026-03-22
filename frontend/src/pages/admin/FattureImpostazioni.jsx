// @version: v1.0-unified-settings
// Pagina Impostazioni Acquisti — Import XML + Fatture in Cloud unificati
import React, { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const FC = `${API_BASE}/fic`;
const FE = `${API_BASE}/contabilita/fe`;

const fmt = (v) =>
  v != null
    ? Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const MESI = [
  { value: "", label: "Tutti i mesi" },
  { value: "1", label: "Gennaio" },
  { value: "2", label: "Febbraio" },
  { value: "3", label: "Marzo" },
  { value: "4", label: "Aprile" },
  { value: "5", label: "Maggio" },
  { value: "6", label: "Giugno" },
  { value: "7", label: "Luglio" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Settembre" },
  { value: "10", label: "Ottobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Dicembre" },
];

export default function FattureImpostazioni() {
  const [tab, setTab] = useState("xml"); // "xml" | "fic"

  // ─── XML STATE ─────────────────────────────────────────
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [xmlStats, setXmlStats] = useState(null);

  // ─── FIC STATE ─────────────────────────────────────────
  const [ficStatus, setFicStatus] = useState(null);
  const [ficLoading, setFicLoading] = useState(true);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncAnno, setSyncAnno] = useState(new Date().getFullYear());
  const [syncMese, setSyncMese] = useState("");
  const [syncSoloNuove, setSyncSoloNuove] = useState(false);
  const [syncLog, setSyncLog] = useState([]);

  // ─── FETCH XML STATS ──────────────────────────────────
  const fetchXmlStats = useCallback(async () => {
    try {
      const r = await apiFetch(`${FE}/fatture?limit=1`);
      if (r.ok) {
        const d = await r.json();
        setXmlStats({ total: d.total || 0, totale_importo: d.totale_importo || 0 });
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchXmlStats();
  }, [fetchXmlStats]);

  // ─── XML: FILE HANDLING ───────────────────────────────
  const handleFileChange = (e) => {
    const fileList = Array.from(e.target.files || []);
    const valid = fileList.filter((f) => {
      const l = f.name?.toLowerCase() || "";
      return l.endsWith(".xml") || l.endsWith(".zip");
    });
    setFiles(valid);
    setUploadResult(null);
    setUploadError(null);
  };

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); if (!isDragging) setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    setUploadResult(null); setUploadError(null);
    const dropped = Array.from(e.dataTransfer?.files || []);
    if (!dropped.length) return;
    const valid = dropped.filter((f) => {
      const l = f.name?.toLowerCase() || "";
      return l.endsWith(".xml") || l.endsWith(".zip");
    });
    if (!valid.length) { setUploadError("Nessun file XML o ZIP valido trovato."); return; }
    setFiles(valid);
  };

  const handleUpload = async () => {
    if (!files.length) { setUploadError("Seleziona almeno un file XML o ZIP."); return; }
    setUploading(true); setUploadError(null); setUploadResult(null);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      const res = await apiFetch(`${FE}/import`, { method: "POST", body: formData });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || "Errore importazione XML."); }
      const data = await res.json();
      setUploadResult(data);
      setFiles([]);
      fetchXmlStats();
    } catch (e) { setUploadError(e.message); }
    finally { setUploading(false); }
  };

  const handleReset = async () => {
    if (!window.confirm("Sei sicuro? Verranno eliminate TUTTE le fatture importate. Azione irreversibile.")) return;
    setResetting(true);
    try {
      const res = await apiFetch(`${FE}/fatture`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || "Errore reset."); }
      setUploadResult(null); setFiles([]);
      fetchXmlStats();
    } catch (e) { setUploadError(e.message); }
    finally { setResetting(false); }
  };

  // ─── FIC: FETCH STATUS ────────────────────────────────
  const fetchFicStatus = useCallback(async () => {
    setFicLoading(true);
    try {
      const r = await apiFetch(`${FC}/status`);
      if (r.ok) setFicStatus(await r.json());
    } catch (_) {}
    setFicLoading(false);
  }, []);

  useEffect(() => { fetchFicStatus(); }, [fetchFicStatus]);

  // ─── FIC: FETCH SYNC LOG ─────────────────────────────
  const fetchSyncLog = useCallback(async () => {
    try {
      const r = await apiFetch(`${FC}/sync-log?limit=5`);
      if (r.ok) { const d = await r.json(); setSyncLog(d.log || []); }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (ficStatus?.connected) fetchSyncLog();
  }, [ficStatus, fetchSyncLog]);

  // ─── FIC: CONNECT ─────────────────────────────────────
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
      if (r.ok) { setToken(""); fetchFicStatus(); }
      else alert(d.detail || "Errore connessione");
    } catch (_) { alert("Errore di rete"); }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    if (!confirm("Scollegare Fatture in Cloud?")) return;
    await apiFetch(`${FC}/disconnect`, { method: "POST" });
    setFicStatus(null);
    fetchFicStatus();
  };

  // ─── FIC: SYNC ────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const params = new URLSearchParams({ anno: syncAnno });
      if (syncMese) params.append("mese", syncMese);
      if (syncSoloNuove) params.append("solo_nuove", "1");
      const r = await apiFetch(`${FC}/sync?${params}`, { method: "POST" });
      const d = await r.json();
      if (r.ok) { setSyncResult(d); fetchSyncLog(); }
      else alert(d.detail || "Errore sync");
    } catch (_) { alert("Errore di rete durante sync"); }
    setSyncing(false);
  };

  // ─── RENDER ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="impostazioni" />

      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        {/* Page Header */}
        <div className="mt-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-teal-900 font-playfair tracking-wide mb-1">
            Impostazioni Acquisti
          </h1>
          <p className="text-neutral-500 text-sm">
            Importa fatture da file XML o sincronizza da Fatture in Cloud.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl border border-neutral-200 p-1 shadow-sm w-fit">
          <button
            onClick={() => setTab("xml")}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${
              tab === "xml"
                ? "bg-teal-100 text-teal-900 shadow-sm"
                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            }`}
          >
            <span className="mr-1.5">📄</span> Import XML
          </button>
          <button
            onClick={() => setTab("fic")}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${
              tab === "fic"
                ? "bg-blue-100 text-blue-900 shadow-sm"
                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            }`}
          >
            <span className="mr-1.5">☁️</span> Fatture in Cloud
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: IMPORT XML                                     */}
        {/* ═══════════════════════════════════════════════════ */}
        {tab === "xml" && (
          <div className="space-y-6">
            {/* Dropzone Card */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6">
              <h2 className="text-lg font-bold text-teal-900 font-playfair mb-1">
                Import Fatture XML
              </h2>
              <p className="text-sm text-neutral-500 mb-4">
                Trascina file XML FatturaPA o archivi ZIP (anche con sottocartelle mensili).
                I duplicati vengono scartati automaticamente.
              </p>

              {/* Dropzone */}
              <div
                className={`border-2 rounded-xl px-4 py-8 text-center cursor-pointer transition ${
                  isDragging
                    ? "border-teal-500 bg-teal-50"
                    : "border-dashed border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="text-3xl mb-2 opacity-40">📁</div>
                <p className="text-sm text-neutral-600 font-medium mb-1">
                  Trascina qui file XML o ZIP
                </p>
                <p className="text-xs text-neutral-400 mb-3">
                  oppure clicca per selezionare i file
                </p>
                <input
                  type="file"
                  accept=".xml,.zip"
                  multiple
                  onClick={(e) => { e.target.value = null; }}
                  onChange={handleFileChange}
                  className="block w-full max-w-sm mx-auto text-sm text-neutral-700
                    file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                    file:text-sm file:font-medium file:bg-teal-50 file:text-teal-800
                    hover:file:bg-teal-100"
                />

                {files.length > 0 && (
                  <p className="text-xs text-teal-700 mt-3 font-medium">
                    {files.length === 1 ? files[0].name : `${files.length} file selezionati`}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleUpload}
                  disabled={uploading || !files.length}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition ${
                    uploading || !files.length
                      ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                      : "bg-teal-700 text-white hover:bg-teal-800"
                  }`}
                >
                  {uploading ? "Import in corso..." : "Importa XML"}
                </button>
                {files.length > 0 && !uploading && (
                  <span className="text-xs text-neutral-500">
                    Pronti: <strong>{files.length} file</strong>
                  </span>
                )}
              </div>

              {/* Upload Error */}
              {uploadError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {uploadError}
                </div>
              )}

              {/* Upload Result */}
              {uploadResult && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <p className="font-semibold mb-1">Import completato</p>
                  <p>Nuove fatture: <strong>{uploadResult.importate?.length || 0}</strong></p>
                  {uploadResult.gia_presenti?.length > 0 && (
                    <p className="text-xs mt-1">Saltate (duplicati): <strong>{uploadResult.gia_presenti.length}</strong></p>
                  )}
                  {uploadResult.errori?.length > 0 && (
                    <div className="mt-2 text-xs text-red-700">
                      <p className="font-semibold">Errori ({uploadResult.errori.length}):</p>
                      <ul className="list-disc list-inside mt-1">
                        {uploadResult.errori.map((e, i) => (
                          <li key={i}>{e.filename}: {e.errore}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Stats + Danger Zone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Stats */}
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5">
                <h3 className="text-sm font-bold text-neutral-700 mb-3">Stato attuale</h3>
                {xmlStats ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">Fatture in DB</span>
                      <span className="font-semibold text-neutral-800">{xmlStats.total}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">Importo totale</span>
                      <span className="font-semibold text-neutral-800">{fmt(xmlStats.totale_importo)} €</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-400">Caricamento...</p>
                )}
              </div>

              {/* Danger Zone */}
              <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-5">
                <h3 className="text-sm font-bold text-red-700 mb-3">Zona pericolosa</h3>
                <p className="text-xs text-neutral-500 mb-3">
                  Elimina tutte le fatture importate dal database. Azione irreversibile.
                </p>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                    resetting
                      ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                      : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                  }`}
                >
                  {resetting ? "Eliminazione..." : "Svuota DB fatture"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: FATTURE IN CLOUD                               */}
        {/* ═══════════════════════════════════════════════════ */}
        {tab === "fic" && (
          <div className="space-y-6">
            {ficLoading ? (
              <div className="text-center py-12 text-neutral-500 text-sm">Caricamento...</div>
            ) : !ficStatus?.connected ? (
              /* ── NON COLLEGATO ─────────────────────────── */
              <div className="bg-white rounded-2xl border-2 border-blue-200 p-6 sm:p-8 shadow-sm max-w-xl">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">🔗</span>
                  <h2 className="text-lg font-bold text-blue-900">Collega Fatture in Cloud</h2>
                </div>
                <p className="text-sm text-neutral-600 mb-4">
                  Incolla il <strong>Token Personale</strong> generato su{" "}
                  <a
                    href="https://developers.fattureincloud.it"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline hover:text-blue-900"
                  >
                    developers.fattureincloud.it
                  </a>
                </p>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="a/eyJ0eXA..."
                  className="w-full px-4 py-3 border-2 border-neutral-200 rounded-xl text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                />
                <button
                  onClick={handleConnect}
                  disabled={connecting || !token.trim()}
                  className={`px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition ${
                    connecting || !token.trim()
                      ? "bg-neutral-400 cursor-not-allowed"
                      : "bg-blue-700 hover:bg-blue-800 shadow-md"
                  }`}
                >
                  {connecting ? "Collegamento..." : "Collega"}
                </button>
                {ficStatus?.error && (
                  <p className="mt-3 text-xs text-red-600">Errore: {ficStatus.error}</p>
                )}
              </div>
            ) : (
              /* ── COLLEGATO ──────────────────────────────── */
              <>
                {/* Connection Status */}
                <div className="bg-white rounded-2xl border border-blue-200 p-5 shadow-sm">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm" />
                      <div>
                        <div className="text-sm font-bold text-blue-900">{ficStatus.company_name}</div>
                        <div className="text-xs text-neutral-500">
                          ID: {ficStatus.company_id}
                          {ficStatus.fatture_fic != null && <span className="ml-3">FIC: {ficStatus.fatture_fic}</span>}
                          {ficStatus.fatture_xml != null && <span className="ml-2">XML: {ficStatus.fatture_xml}</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleDisconnect}
                      className="px-3 py-1.5 rounded-lg text-xs text-red-600 hover:bg-red-50 border border-red-200 transition"
                    >
                      Scollega
                    </button>
                  </div>
                </div>

                {/* Sync Options Card */}
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6">
                  <h2 className="text-lg font-bold text-blue-900 font-playfair mb-4">
                    Sincronizzazione
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                    {/* Anno */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Anno</label>
                      <select
                        value={syncAnno}
                        onChange={(e) => setSyncAnno(Number(e.target.value))}
                        className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:ring-blue-400 focus:outline-none focus:ring-2"
                      >
                        {[2026, 2025, 2024, 2023, 2022].map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </div>

                    {/* Mese */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Mese</label>
                      <select
                        value={syncMese}
                        onChange={(e) => setSyncMese(e.target.value)}
                        className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:ring-blue-400 focus:outline-none focus:ring-2"
                      >
                        {MESI.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Solo nuove */}
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={syncSoloNuove}
                          onChange={(e) => setSyncSoloNuove(e.target.checked)}
                          className="w-4 h-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-400"
                        />
                        <span className="text-sm text-neutral-700">Solo nuove fatture</span>
                      </label>
                    </div>
                  </div>

                  {/* Sync Button */}
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className={`px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition ${
                      syncing ? "bg-neutral-400 cursor-not-allowed" : "bg-blue-700 hover:bg-blue-800 shadow-md"
                    }`}
                  >
                    {syncing
                      ? "Sincronizzazione in corso..."
                      : `Sincronizza ${syncAnno}${syncMese ? " — " + MESI.find((m) => m.value === syncMese)?.label : ""}`}
                  </button>

                  <p className="text-xs text-neutral-400 mt-2">
                    Importa header + righe dettaglio, rileva pagamenti e unifica duplicati XML/FIC.
                  </p>
                </div>

                {/* Sync Result */}
                {syncResult && (
                  <div className={`rounded-xl p-4 text-sm border ${
                    syncResult.errori > 0
                      ? "bg-amber-50 border-amber-200"
                      : "bg-emerald-50 border-emerald-200"
                  }`}>
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{syncResult.errori > 0 ? "⚠️" : "✅"}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-neutral-800 mb-1">
                          Sync completata {syncResult.errori > 0 ? "con errori" : ""}
                        </p>
                        <p className="text-neutral-700">
                          {syncResult.nuove} nuove, {syncResult.aggiornate} aggiornate
                          {syncResult.duplicate_xml > 0 && (
                            <span className="text-neutral-500">, {syncResult.duplicate_xml} già da XML</span>
                          )}
                          {syncResult.merged_xml > 0 && (
                            <span className="text-blue-600">, {syncResult.merged_xml} uniti con XML</span>
                          )}
                          {syncResult.righe_importate > 0 && (
                            <span className="text-teal-600">, {syncResult.righe_importate} righe dettaglio</span>
                          )}
                          {" — "}{syncResult.totale_api} totali su FIC
                        </p>

                        {/* Errori dettagliati */}
                        {syncResult.errori > 0 && (
                          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                            <p className="font-semibold text-red-800 text-xs mb-2">
                              {syncResult.errori} {syncResult.errori === 1 ? "errore" : "errori"} durante la sincronizzazione:
                            </p>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {(syncResult.error_details || []).length > 0 ? (
                                syncResult.error_details.map((err, i) => (
                                  <div key={i} className="text-xs text-red-700 bg-white rounded px-2 py-1.5 border border-red-100 font-mono break-all">
                                    {err}
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-red-600 italic">
                                  Nessun dettaglio disponibile. Controlla i log del server.
                                </p>
                              )}
                            </div>
                            {syncResult.error_details?.length >= 50 && (
                              <p className="text-[10px] text-red-500 mt-2">
                                Mostrati i primi 50 errori. Controlla i log del server per la lista completa.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sync Log */}
                {syncLog.length > 0 && (
                  <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5">
                    <h3 className="text-sm font-bold text-neutral-700 mb-3">Storico sincronizzazioni</h3>
                    <div className="space-y-2">
                      {syncLog.map((l) => (
                        <div
                          key={l.id}
                          className="bg-neutral-50 rounded-lg border border-neutral-100 px-4 py-2.5 flex items-center justify-between text-xs"
                        >
                          <span className="text-neutral-600">
                            {l.started_at?.replace("T", " ").slice(0, 16)}
                          </span>
                          <span className="text-neutral-700">
                            +{l.nuove} nuove, ↻{l.aggiornate} agg.
                            {l.errori > 0 && <span className="text-red-600 ml-1">⚠ {l.errori}</span>}
                          </span>
                          <span className="text-neutral-400 max-w-[200px] truncate">{l.note}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
