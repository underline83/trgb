// @version: v2.3-xml-fallback-recovery
// Pagina Impostazioni Acquisti — Layout sidebar uniformato a ClientiImpostazioni
import React, { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";
import Tooltip from "../../components/Tooltip";

const FC = `${API_BASE}/fic`;
const FE = `${API_BASE}/contabilita/fe`;

// ── Limiti upload ──
// Max 100 MB lato nginx (client_max_body_size).
// Timeout 10 min lato frontend (AbortController).
// Se si modifica, aggiornare anche: nginx config + backend fe_import.py docstring.
const UPLOAD_MAX_MB = 100;
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minuti

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

// ─── SIDEBAR MENU ────────────────────────────────────────
const CAT_BASE = `${API_BASE}/contabilita/fe/categorie`;

const MENU = [
  { key: "xml",          label: "Import XML",          icon: "📄", desc: "Carica fatture XML (SDI/FE)" },
  { key: "fic",          label: "Fatture in Cloud",    icon: "☁️", desc: "Sync da Fatture in Cloud" },
  { key: "categorie",    label: "Categorie",           icon: "🏷️", desc: "Gestione categorie fornitori" },
  { key: "pagamenti",    label: "Cond. Pagamento",     icon: "💳", desc: "Condizioni pagamento personalizzate" },
  { key: "stato",        label: "Stato Database",      icon: "📊", desc: "Conteggi e statistiche import" },
  { key: "manutenzione", label: "Manutenzione",        icon: "🔧", desc: "Cleanup e reset database" },
];

export default function FattureImpostazioni() {
  const [activeSection, setActiveSection] = useState("xml");

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
  const [syncForceDetail, setSyncForceDetail] = useState(false);
  const [syncLog, setSyncLog] = useState([]);

  // ─── S40-15 DEBUG DETTAGLIO FIC ──────────────────────
  const [debugFicId, setDebugFicId] = useState("");
  const [debugResult, setDebugResult] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState("");

  // ─── S40-15 RECUPERO RIGHE DA XML ────────────────────
  const [refetchSingleId, setRefetchSingleId] = useState("");
  const [refetchSingleRes, setRefetchSingleRes] = useState(null);
  const [refetchSingleLoading, setRefetchSingleLoading] = useState(false);
  const [bulkXmlAnno, setBulkXmlAnno] = useState(new Date().getFullYear());
  const [bulkXmlLimit, setBulkXmlLimit] = useState(50);
  const [bulkXmlRunning, setBulkXmlRunning] = useState(false);
  const [bulkXmlResult, setBulkXmlResult] = useState(null);

  // ─── CATEGORIE STATE ────────────────────────────────
  const [categorie, setCategorie] = useState([]);
  const [catLoading, setCatLoading] = useState(false);

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

  useEffect(() => { fetchXmlStats(); }, [fetchXmlStats]);

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
    const totalMB = files.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
    if (totalMB > UPLOAD_MAX_MB) {
      setUploadError(`File troppo grandi (${totalMB.toFixed(1)} MB). Limite: ${UPLOAD_MAX_MB} MB. Dividi in più upload.`);
      return;
    }
    setUploading(true); setUploadError(null); setUploadResult(null);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
      const res = await apiFetch(`${FE}/import`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || "Errore importazione XML."); }
      const data = await res.json();
      setUploadResult(data);
      setFiles([]);
      fetchXmlStats();
    } catch (e) {
      if (e.name === "AbortError") {
        setUploadError("Timeout: l'importazione ha impiegato troppo tempo. Prova con file più piccoli o riprova.");
      } else {
        setUploadError(e.message);
      }
    }
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
      const r = await apiFetch(`${FC}/sync-log?limit=10`);
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
      if (syncForceDetail) params.append("force_detail", "1");
      // Timeout 10 minuti per sync con molte fatture
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);
      const r = await apiFetch(`${FC}/sync?${params}`, { method: "POST", signal: controller.signal });
      clearTimeout(timeoutId);
      const d = await r.json();
      if (r.ok) { setSyncResult(d); fetchSyncLog(); fetchXmlStats(); }
      else alert(d.detail || "Errore sync");
    } catch (e) {
      if (e.name === "AbortError") alert("Sync timeout (>10 min). Prova mese per mese.");
      else alert("Errore di rete durante sync");
    }
    setSyncing(false);
  };

  // ─── S40-15 DEBUG dettaglio fattura FIC ────────────────
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

  // ─── S40-15 Recupero righe da XML (singolo DB id) ──────
  const handleRefetchSingleXml = async () => {
    const id = (refetchSingleId || "").trim();
    if (!id) return;
    setRefetchSingleLoading(true);
    setRefetchSingleRes(null);
    try {
      const r = await apiFetch(`${FC}/refetch-righe-xml/${id}`, {
        method: "POST",
      });
      const d = await r.json();
      setRefetchSingleRes(d);
    } catch (e) {
      setRefetchSingleRes({ ok: false, error: "Errore di rete" });
    }
    setRefetchSingleLoading(false);
  };

  // ─── S40-15 Bulk refetch XML per tutte le fatture senza righe ─
  // Batch piccolo (default 50) + timeout wallclock 90s lato backend per
  // evitare timeout nginx. Se restano fatture, l'utente rilancia.
  const handleBulkRefetchXml = async () => {
    const anno = String(bulkXmlAnno || "").trim();
    const limit = Math.max(1, Math.min(500, Number(bulkXmlLimit) || 50));
    const ok = window.confirm(
      `Avvio recupero righe da XML SDI per ${anno ? `anno ${anno}` : "tutte le annate"} ` +
      `(max ${limit} fatture con 0 righe in questo batch).\n\n` +
      `Se restano fatture, dopo il batch potrai rilanciare. Procedere?`
    );
    if (!ok) return;
    setBulkXmlRunning(true);
    setBulkXmlResult(null);
    try {
      const qs = new URLSearchParams({
        solo_senza_righe: "true",
        limit: String(limit),
        max_seconds: "90",
      });
      if (anno) qs.append("anno", anno);
      const r = await apiFetch(`${FC}/bulk-refetch-righe-xml?${qs.toString()}`, {
        method: "POST",
      });
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try {
          const err = await r.json();
          msg = err.detail || err.error || msg;
        } catch (_) {}
        setBulkXmlResult({ ok: false, error: msg });
      } else {
        const d = await r.json();
        setBulkXmlResult(d);
      }
    } catch (e) {
      setBulkXmlResult({
        ok: false,
        error: "Errore di rete (timeout nginx/proxy). Riduci il limite a 20-30 fatture per batch.",
      });
    }
    setBulkXmlRunning(false);
  };

  // ═══════════════════════════════════════════════════════
  // SECTION RENDERERS
  // ═══════════════════════════════════════════════════════

  const renderXml = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-teal-900 font-playfair mb-1">Import Fatture XML</h2>
        <p className="text-sm text-neutral-500 mb-4">
          Trascina file XML FatturaPA o archivi ZIP (anche con sottocartelle mensili).
          I duplicati vengono scartati automaticamente.
        </p>
      </div>

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
        <p className="text-sm text-neutral-600 font-medium mb-1">Trascina qui file XML o ZIP</p>
        <p className="text-xs text-neutral-400 mb-3">oppure clicca per selezionare i file</p>
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
      <div className="flex items-center gap-3">
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
            {" "}({(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB)
          </span>
        )}
      </div>

      {/* Upload progress for large files */}
      {uploading && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800 flex items-center gap-3">
          <svg className="animate-spin h-4 w-4 text-teal-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Importazione in corso — per file grossi può richiedere qualche minuto, non chiudere la pagina...</span>
        </div>
      )}

      {/* Upload Error */}
      {uploadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {uploadError}
        </div>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <div className={`rounded-xl p-4 text-sm border ${
          uploadResult.errori?.length > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
        }`}>
          <div className="flex items-start gap-2">
            <span className="text-lg">{uploadResult.errori?.length > 0 ? "⚠️" : "✅"}</span>
            <div className="flex-1">
              <p className="font-semibold text-neutral-800 mb-1">
                Import completato{uploadResult.errori?.length > 0 ? " con errori" : ""}
              </p>
              <p className="text-neutral-700">
                {uploadResult.importate?.length || 0} nuove
                {uploadResult.gia_presenti?.length > 0 && (
                  <span className="text-neutral-500">, {uploadResult.gia_presenti.length} già presenti</span>
                )}
                {uploadResult.arricchite_pagamento > 0 && (
                  <span className="text-blue-600 font-medium">, {uploadResult.arricchite_pagamento} arricchite con dati pagamento</span>
                )}
                {uploadResult.errori?.length > 0 && (
                  <span className="text-red-600">, {uploadResult.errori.length} {uploadResult.errori.length === 1 ? "errore" : "errori"}</span>
                )}
              </p>

              {/* Errori dettagliati */}
              {uploadResult.errori?.length > 0 && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="font-semibold text-red-800 text-xs mb-2">Errori:</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {uploadResult.errori.map((e, i) => (
                      <div key={i} className="text-xs text-red-700 bg-white rounded px-2 py-1.5 border border-red-100 font-mono break-all">
                        {e.filename}: {e.errore}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fatture importate */}
              {(uploadResult.importate?.length > 0) && (
                <div className="mt-3 bg-white border border-neutral-200 rounded-lg p-3">
                  <p className="font-semibold text-neutral-700 text-xs mb-2">
                    Fatture importate ({uploadResult.importate.length}):
                  </p>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-neutral-50">
                        <tr className="text-left text-neutral-500 border-b">
                          <th className="py-1 px-1">Data</th>
                          <th className="py-1 px-1">N.</th>
                          <th className="py-1 px-1">Fornitore</th>
                          <th className="py-1 px-1 text-right">Totale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadResult.importate.map((it, i) => (
                          <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50">
                            <td className="py-1 px-1 text-neutral-600 whitespace-nowrap">{it.data_fattura || "—"}</td>
                            <td className="py-1 px-1 text-neutral-600 font-mono">{it.numero_fattura || "—"}</td>
                            <td className="py-1 px-1 text-neutral-800 truncate max-w-[200px]">{it.fornitore}</td>
                            <td className="py-1 px-1 text-right text-neutral-700 whitespace-nowrap">
                              {it.totale_fattura != null ? `€ ${it.totale_fattura.toLocaleString("it-IT", {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Fatture già presenti (duplicati / arricchite) */}
              {(uploadResult.gia_presenti?.length > 0) && (
                <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="font-semibold text-blue-800 text-xs mb-2">
                    Già presenti ({uploadResult.gia_presenti.length}):
                  </p>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-blue-50">
                        <tr className="text-left text-blue-500 border-b border-blue-200">
                          <th className="py-1 px-1">Data</th>
                          <th className="py-1 px-1">N.</th>
                          <th className="py-1 px-1">Fornitore</th>
                          <th className="py-1 px-1">Nota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadResult.gia_presenti.map((it, i) => (
                          <tr key={i} className="border-b border-blue-100 hover:bg-blue-100/50">
                            <td className="py-1 px-1 text-blue-700 whitespace-nowrap">{it.data_fattura || "—"}</td>
                            <td className="py-1 px-1 text-blue-700 font-mono">{it.numero_fattura || "—"}</td>
                            <td className="py-1 px-1 text-blue-900 truncate max-w-[180px]">{it.fornitore}</td>
                            <td className="py-1 px-1 text-blue-600 text-[10px]">{it.nota || "duplicato"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderFic = () => (
    <div className="space-y-6">
      {ficLoading ? (
        <div className="text-center py-12 text-neutral-500 text-sm">Caricamento...</div>
      ) : !ficStatus?.connected ? (
        /* ── NON COLLEGATO ── */
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🔗</span>
            <h2 className="text-lg font-bold text-blue-900">Collega Fatture in Cloud</h2>
          </div>
          <p className="text-sm text-neutral-600 mb-4">
            Incolla il <strong>Token Personale</strong> generato su{" "}
            <a href="https://developers.fattureincloud.it" target="_blank" rel="noreferrer"
              className="text-blue-700 underline hover:text-blue-900">
              developers.fattureincloud.it
            </a>
          </p>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="a/eyJ0eXA..."
            className="w-full max-w-lg px-4 py-3 border-2 border-neutral-200 rounded-xl text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
          />
          <div>
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
          </div>
          {ficStatus?.error && (
            <p className="mt-3 text-xs text-red-600">Errore: {ficStatus.error}</p>
          )}
        </div>
      ) : (
        /* ── COLLEGATO ── */
        <>
          {/* Connection Status */}
          <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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

          {/* Sync Options */}
          <div>
            <h3 className="text-base font-bold text-blue-900 mb-3">Sincronizzazione</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
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
              <div className="flex flex-col gap-2 justify-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={syncSoloNuove}
                    onChange={(e) => setSyncSoloNuove(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-400"
                  />
                  <span className="text-sm text-neutral-700">Solo nuove fatture</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none" title="Ri-scarica dettaglio per tutte le fatture, ripara numeri mancanti e unifica duplicati XML/FIC">
                  <input
                    type="checkbox"
                    checked={syncForceDetail}
                    onChange={(e) => setSyncForceDetail(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-300 text-amber-600 focus:ring-amber-400"
                  />
                  <span className="text-sm text-neutral-700">Ripara dettagli</span>
                </label>
              </div>
            </div>

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
              syncResult.errori > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
            }`}>
              <div className="flex items-start gap-2">
                <span className="text-lg">{syncResult.errori > 0 ? "⚠️" : "✅"}</span>
                <div className="flex-1">
                  <p className="font-semibold text-neutral-800 mb-1">
                    Sync completata{syncResult.errori > 0 ? " con errori" : ""}
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

                  {/* Lista fatture processate */}
                  {(syncResult.items || []).length > 0 && (
                    <div className="mt-3 bg-white border border-neutral-200 rounded-lg p-3">
                      <p className="font-semibold text-neutral-700 text-xs mb-2">
                        Fatture processate ({syncResult.items.length}):
                      </p>
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0 bg-neutral-50">
                            <tr className="text-left text-neutral-500 border-b">
                              <th className="py-1 px-1">Stato</th>
                              <th className="py-1 px-1">Data</th>
                              <th className="py-1 px-1">N.</th>
                              <th className="py-1 px-1">Fornitore</th>
                              <th className="py-1 px-1 text-right">Totale</th>
                            </tr>
                          </thead>
                          <tbody>
                            {syncResult.items.map((it, i) => (
                              <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50">
                                <td className="py-1 px-1">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    it.stato === "nuova" ? "bg-emerald-100 text-emerald-700" :
                                    it.stato === "aggiornata" ? "bg-blue-100 text-blue-700" :
                                    "bg-purple-100 text-purple-700"
                                  }`}>
                                    {it.stato === "nuova" ? "NUOVA" : it.stato === "aggiornata" ? "AGG." : "MERGE"}
                                  </span>
                                </td>
                                <td className="py-1 px-1 text-neutral-600 whitespace-nowrap">{it.data}</td>
                                <td className="py-1 px-1 text-neutral-600 font-mono">{it.numero || "—"}</td>
                                <td className="py-1 px-1 text-neutral-800 truncate max-w-[200px]">{it.fornitore}</td>
                                <td className="py-1 px-1 text-right text-neutral-700 whitespace-nowrap">€ {(it.totale || 0).toLocaleString("it-IT", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Fatture senza dettaglio prodotti */}
                  {(syncResult.senza_dettaglio || []).length > 0 && (
                    <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <p className="font-semibold text-orange-800 text-xs mb-1">
                        ⚠️ {syncResult.senza_dettaglio.length} {syncResult.senza_dettaglio.length === 1 ? "fattura" : "fatture"} senza dettaglio prodotti
                      </p>
                      <p className="text-[10px] text-orange-700 mb-2">
                        Queste fatture non hanno le righe su Fatture in Cloud. Puoi completarle caricando i file XML dalla sezione Import XML.
                      </p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {syncResult.senza_dettaglio.map((it, i) => (
                          <div key={i} className="text-[11px] bg-white rounded px-2 py-1.5 border border-orange-100 flex items-center gap-2">
                            <span className="text-orange-600 font-mono whitespace-nowrap">{it.data}</span>
                            <span className="text-orange-800 font-semibold truncate">{it.fornitore}</span>
                            <span className="text-orange-600 font-mono">{it.numero || "—"}</span>
                            <span className="ml-auto text-orange-700 whitespace-nowrap">€ {(it.totale || 0).toLocaleString("it-IT", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* S40-15 — Debug dettaglio fattura FIC */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <h3 className="text-sm font-bold text-neutral-700 mb-1 flex items-center gap-2">
              🔬 Debug dettaglio fattura FIC
            </h3>
            <p className="text-xs text-neutral-500 mb-3">
              Interroga direttamente FIC per un singolo <code className="bg-neutral-100 px-1 rounded">fic_id</code> e mostra cosa restituisce il dettaglio (righe, scadenze, numero). Utile per capire perché una fattura arriva senza righe.
            </p>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <input
                type="text"
                value={debugFicId}
                onChange={(e) => setDebugFicId(e.target.value.replace(/\D/g, ""))}
                placeholder="fic_id (es. 405656723)"
                className="px-3 py-2 border border-neutral-200 rounded-lg text-sm w-56 font-mono focus:ring-blue-400 focus:outline-none focus:ring-2"
                onKeyDown={(e) => { if (e.key === "Enter") handleDebugDetail(); }}
              />
              <button
                onClick={handleDebugDetail}
                disabled={debugLoading || !debugFicId.trim()}
                className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition ${
                  debugLoading || !debugFicId.trim()
                    ? "bg-neutral-400 cursor-not-allowed"
                    : "bg-blue-700 hover:bg-blue-800 shadow-sm"
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
                    <strong>Verdict:</strong> FIC restituisce {debugResult.is_detailed ? "is_detailed=true" : "is_detailed=false"} con <code>items_list</code> vuoto.
                    {debugResult.e_invoice && debugResult.attachment_url
                      ? " Fattura elettronica con XML disponibile: possiamo recuperare le righe dal tracciato SDI."
                      : debugResult.e_invoice
                        ? " Fattura elettronica ma attachment_url assente — impossibile recuperare XML."
                        : " Non e' fattura elettronica — nessun XML disponibile."}
                  </div>
                )}
                {debugResult.n_items > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900">
                    <strong>Verdict:</strong> FIC restituisce {debugResult.n_items} righe. Se in DB risultano 0 righe, il bug è nel parser o nella scrittura.
                  </div>
                )}

                {/* Preview parsing XML SDI se disponibile */}
                {debugResult.xml_parse && (
                  <div className={`rounded-lg p-3 text-xs border ${
                    debugResult.xml_parse.ok
                      ? "bg-blue-50 border-blue-200 text-blue-900"
                      : "bg-red-50 border-red-200 text-red-800"
                  }`}>
                    <div className="font-semibold mb-1 flex items-center gap-2">
                      📄 Parsing XML SDI
                      {debugResult.xml_parse.ok && (
                        <span className="font-mono text-[11px] bg-white/60 px-1.5 py-0.5 rounded">
                          {debugResult.xml_parse.n_righe} righe
                        </span>
                      )}
                    </div>
                    {debugResult.xml_parse.ok ? (
                      <div className="space-y-1">
                        <div>
                          Numero XML: <code>{debugResult.xml_parse.numero_xml || "—"}</code> ·
                          Data: <code>{debugResult.xml_parse.data_xml || "—"}</code> ·
                          PIVA: <code>{debugResult.xml_parse.fornitore_piva || "—"}</code>
                        </div>
                        {debugResult.xml_parse.righe_preview?.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer select-none">Prime righe (click)</summary>
                            <div className="mt-1 space-y-1">
                              {debugResult.xml_parse.righe_preview.map((r, i) => (
                                <div key={i} className="font-mono text-[11px] bg-white/60 px-2 py-1 rounded">
                                  #{r.numero_linea} {r.codice_articolo && `[${r.codice_articolo}] `}
                                  {r.descrizione?.slice(0, 60)} — {r.quantita} {r.unita_misura} × {r.prezzo_unitario} = {r.prezzo_totale}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    ) : (
                      <div>Errore parsing XML: <code>{debugResult.xml_parse.error}</code></div>
                    )}
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

          {/* S40-15 — Recupero righe da XML SDI */}
          <div className="bg-white rounded-xl border border-blue-200 p-4">
            <h3 className="text-sm font-bold text-blue-900 mb-1 flex items-center gap-2">
              📥 Recupero righe da XML SDI
            </h3>
            <div className="text-xs text-neutral-600 mb-3 space-y-1.5 bg-blue-50/50 rounded-lg px-3 py-2 border border-blue-100">
              <p className="font-medium text-blue-800">Quando serve?</p>
              <p>
                Durante la sincronizzazione FIC, le righe vengono recuperate automaticamente.
                Questo strumento serve <strong>solo per recuperare l'arretrato</strong>: fatture importate prima
                del fix di aprile 2026 che sono rimaste senza righe di dettaglio.
              </p>
              <p>
                Alcune fatture (affitti, acquisti marketplace) non sono elettroniche e non hanno XML SDI —
                verranno segnalate come "non-FE" e non è possibile recuperarle automaticamente.
              </p>
            </div>

            {/* Singolo */}
            <div className="mb-4 pb-4 border-b border-neutral-100">
              <div className="text-xs font-semibold text-neutral-700 mb-2">
                Singola fattura (per DB id)
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={refetchSingleId}
                  onChange={(e) => setRefetchSingleId(e.target.value.replace(/\D/g, ""))}
                  placeholder="fattura id DB (es. 6892)"
                  className="px-3 py-2 border border-neutral-200 rounded-lg text-sm w-56 font-mono focus:ring-blue-400 focus:outline-none focus:ring-2"
                  onKeyDown={(e) => { if (e.key === "Enter") handleRefetchSingleXml(); }}
                />
                <button
                  onClick={handleRefetchSingleXml}
                  disabled={refetchSingleLoading || !refetchSingleId.trim()}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition ${
                    refetchSingleLoading || !refetchSingleId.trim()
                      ? "bg-neutral-400 cursor-not-allowed"
                      : "bg-blue-700 hover:bg-blue-800 shadow-sm"
                  }`}
                >
                  {refetchSingleLoading ? "Recupero..." : "Recupera righe XML"}
                </button>
              </div>
              {refetchSingleRes && (
                <div className={`mt-3 rounded-lg border p-3 text-xs ${
                  refetchSingleRes.ok
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}>
                  {refetchSingleRes.ok ? (
                    <div>
                      ✅ <strong>{refetchSingleRes.righe} righe</strong> recuperate per
                      fattura #{refetchSingleRes.db_id} {refetchSingleRes.numero && <>(n° <code>{refetchSingleRes.numero}</code>)</>}
                      {refetchSingleRes.fornitore && <> — {refetchSingleRes.fornitore}</>}
                    </div>
                  ) : (
                    <div>⚠ {refetchSingleRes.error || "Errore sconosciuto"}</div>
                  )}
                </div>
              )}
            </div>

            {/* Bulk */}
            <div>
              <div className="text-xs font-semibold text-neutral-700 mb-2">
                Massivo (tutte le fatture FIC senza righe)
              </div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <label className="text-xs text-neutral-600">Anno:</label>
                <input
                  type="number"
                  value={bulkXmlAnno}
                  onChange={(e) => setBulkXmlAnno(e.target.value)}
                  placeholder="es. 2026"
                  className="px-2 py-1.5 border border-neutral-200 rounded-lg text-xs w-24 font-mono focus:ring-blue-400 focus:outline-none focus:ring-2"
                />
                <label className="text-xs text-neutral-600 ml-2">Max fatture:</label>
                <input
                  type="number"
                  value={bulkXmlLimit}
                  onChange={(e) => setBulkXmlLimit(e.target.value)}
                  min={1}
                  max={2000}
                  className="px-2 py-1.5 border border-neutral-200 rounded-lg text-xs w-20 font-mono focus:ring-blue-400 focus:outline-none focus:ring-2"
                />
                <button
                  onClick={handleBulkRefetchXml}
                  disabled={bulkXmlRunning}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition ml-auto ${
                    bulkXmlRunning
                      ? "bg-neutral-400 cursor-not-allowed"
                      : "bg-blue-700 hover:bg-blue-800 shadow-sm"
                  }`}
                >
                  {bulkXmlRunning ? "In esecuzione..." : "Avvia recupero massivo"}
                </button>
              </div>
              {bulkXmlRunning && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 flex items-center gap-2">
                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Recupero in corso, attendere... (gli XML vengono scaricati e parsati uno a uno)
                </div>
              )}
              {bulkXmlResult && !bulkXmlRunning && (
                <div className={`rounded-lg border p-3 text-xs ${
                  bulkXmlResult.ok
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}>
                  {bulkXmlResult.ok ? (
                    <div className="space-y-1">
                      <div className="font-semibold">
                        ✅ Candidate batch: {bulkXmlResult.candidate} · Processate: {bulkXmlResult.processate} ·
                        Ok: {bulkXmlResult.ok_count} · Fail: {bulkXmlResult.fail_count}
                        {bulkXmlResult.skipped_non_fe > 0 && (
                          <span className="text-neutral-500 font-normal"> · {bulkXmlResult.skipped_non_fe} non-FE</span>
                        )}
                        {bulkXmlResult.elapsed_seconds != null && (
                          <span className="text-neutral-600 font-normal"> · {bulkXmlResult.elapsed_seconds}s</span>
                        )}
                      </div>
                      <div>Totale righe recuperate: <strong>{bulkXmlResult.righe_recuperate}</strong></div>
                      {bulkXmlResult.skipped_non_fe > 0 && (
                        <div className="mt-1 px-2 py-1 rounded bg-neutral-100 text-neutral-600 text-xs">
                          ℹ {bulkXmlResult.skipped_non_fe} fatture non elettroniche (affitti, marketplace) — non hanno XML SDI, le righe vanno inserite a mano se servono.
                        </div>
                      )}
                      {bulkXmlResult.stopped_by_timeout && (
                        <div className="mt-1 px-2 py-1 rounded bg-amber-100 text-amber-900">
                          ⏱ Fermato dal time budget (90s). Rilancia per continuare.
                        </div>
                      )}
                      {bulkXmlResult.rimanenti_stima > 0 && (
                        <div className="text-neutral-700">
                          Ancora da processare: <strong>{bulkXmlResult.rimanenti_stima}</strong> fatture elettroniche.
                          {" "}Rilancia il bulk per continuare.
                        </div>
                      )}
                      {bulkXmlResult.rimanenti_stima === 0 && bulkXmlResult.ok_count === 0 && bulkXmlResult.skipped_non_fe > 0 && (
                        <div className="text-green-700 font-medium">
                          ✅ Nessuna fattura elettronica rimasta senza righe. Le {bulkXmlResult.skipped_non_fe} non-FE sono irrecuperabili automaticamente.
                        </div>
                      )}
                      {bulkXmlResult.dettaglio?.length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer select-none">Dettaglio per fattura</summary>
                          <div className="mt-1 max-h-60 overflow-y-auto space-y-1">
                            {bulkXmlResult.dettaglio.map((r, i) => (
                              <div
                                key={i}
                                className={`font-mono text-[11px] px-2 py-1 rounded ${
                                  r.ok ? "bg-white/60" : r.skipped ? "bg-neutral-100/60 text-neutral-500" : "bg-red-100/60 text-red-800"
                                }`}
                              >
                                #{r.db_id} (fic={r.fic_id || "—"}) —
                                {r.ok
                                  ? ` ${r.righe} righe${r.numero ? ` · n° ${r.numero}` : ""}${r.fornitore ? ` · ${r.fornitore}` : ""}`
                                  : r.skipped
                                    ? ` ⏭ ${r.error}`
                                    : ` ⚠ ${r.error}`}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  ) : (
                    <div>⚠ {bulkXmlResult.error || bulkXmlResult.detail || "Errore sconosciuto"}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sync Log */}
          {syncLog.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-neutral-700 mb-2">Storico sincronizzazioni</h3>
              <div className="space-y-1.5">
                {syncLog.map((l) => (
                  <div
                    key={l.id}
                    className="bg-neutral-50 rounded-lg border border-neutral-100 px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <span className="text-neutral-600">
                      {l.started_at?.replace("T", " ").slice(0, 16)}
                    </span>
                    <span className="text-neutral-700">
                      +{l.nuove} nuove, ↻{l.aggiornate} agg.
                      {l.errori > 0 && <span className="text-red-600 ml-1">⚠ {l.errori}</span>}
                    </span>
                    <span className="text-neutral-400 max-w-[180px] truncate">{l.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderStato = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-teal-900 font-playfair mb-1">Stato Database</h2>
        <p className="text-sm text-neutral-500 mb-4">
          Riepilogo dei dati importati nel database fatture.
        </p>
      </div>

      {xmlStats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-4">
            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">Fatture totali</div>
            <div className="text-2xl font-bold text-teal-900">{xmlStats.total}</div>
          </div>
          <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-4">
            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">Importo totale</div>
            <div className="text-2xl font-bold text-teal-900">{fmt(xmlStats.totale_importo)} €</div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-neutral-400">Caricamento statistiche...</p>
      )}

      {ficStatus?.connected && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Fatture in Cloud</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-neutral-500">Azienda: </span>
              <span className="font-semibold text-blue-900">{ficStatus.company_name}</span>
            </div>
            <div>
              <span className="text-neutral-500">ID: </span>
              <span className="font-semibold text-blue-900">{ficStatus.company_id}</span>
            </div>
            {ficStatus.fatture_fic != null && (
              <div>
                <span className="text-neutral-500">Fatture FIC: </span>
                <span className="font-semibold">{ficStatus.fatture_fic}</span>
              </div>
            )}
            {ficStatus.fatture_xml != null && (
              <div>
                <span className="text-neutral-500">Fatture XML: </span>
                <span className="font-semibold">{ficStatus.fatture_xml}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ── Merge duplicati ──
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState(null);
  const [mergeError, setMergeError] = useState(null);

  const handleMergeDuplicati = async () => {
    if (!window.confirm("Unire le fatture duplicate FIC/XML? Le righe XML verranno spostate nelle fatture FIC e le copie XML rimosse.")) return;
    setMerging(true); setMergeError(null); setMergeResult(null);
    try {
      const res = await apiFetch(`${FE}/fatture/merge-duplicati`, { method: "POST" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || "Errore merge"); }
      const data = await res.json();
      setMergeResult(data);
    } catch (e) { setMergeError(e.message); }
    finally { setMerging(false); }
  };

  const renderManutenzione = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-red-800 font-playfair mb-1">Manutenzione</h2>
        <p className="text-sm text-neutral-500 mb-4">
          Operazioni di manutenzione e pulizia del database. Usare con cautela.
        </p>
      </div>

      {/* Merge duplicati FIC/XML */}
      <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
        <h3 className="text-sm font-bold text-amber-800 mb-2">Ripara duplicati FIC / XML</h3>
        <p className="text-xs text-neutral-600 mb-4">
          Trova fatture presenti sia da Fatture in Cloud (senza righe) che da XML (con righe dettaglio),
          unisce i dati nella fattura FIC e rimuove la copia XML. Corregge il conteggio fatture e
          arricchisce le fatture FIC con numero fattura, tipo documento e righe prodotto.
        </p>
        <button
          onClick={handleMergeDuplicati}
          disabled={merging}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
            merging
              ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
              : "bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
          }`}
        >
          {merging ? "Merge in corso..." : "Unisci duplicati"}
        </button>
        {mergeError && (
          <p className="mt-3 text-xs text-red-700">{mergeError}</p>
        )}
        {mergeResult && (
          <div className="mt-3 rounded-lg bg-white border border-amber-200 p-3">
            <p className="text-sm font-semibold text-amber-900">
              {mergeResult.merged > 0
                ? `Uniti ${mergeResult.merged} duplicati`
                : "Nessun duplicato trovato"}
            </p>
            {mergeResult.merged > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto text-xs text-neutral-600 space-y-0.5">
                {mergeResult.dettagli.map((d, i) => (
                  <div key={i}>
                    {d.fornitore} — {d.data} — € {d.totale?.toFixed(2)} — {d.righe_spostate} righe spostate
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reset DB */}
      <div className="bg-red-50 rounded-xl border border-red-200 p-5">
        <h3 className="text-sm font-bold text-red-800 mb-2">Svuota database fatture</h3>
        <p className="text-xs text-neutral-600 mb-4">
          Elimina tutte le fatture importate (sia da XML che da Fatture in Cloud), le righe associate
          e tutti i dati correlati. Questa azione non è reversibile.
        </p>
        <button
          onClick={handleReset}
          disabled={resetting}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
            resetting
              ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
              : "bg-red-600 text-white hover:bg-red-700 shadow-sm"
          }`}
        >
          {resetting ? "Eliminazione in corso..." : "Svuota DB fatture"}
        </button>
        {uploadError && (
          <p className="mt-3 text-xs text-red-700">{uploadError}</p>
        )}
      </div>
    </div>
  );

  // ─── CATEGORIE: fetch + CRUD ───────────────────────────
  const fetchCategorie = useCallback(async () => {
    setCatLoading(true);
    try {
      const r = await apiFetch(CAT_BASE);
      if (r.ok) setCategorie(await r.json());
    } catch (_) {}
    setCatLoading(false);
  }, []);

  useEffect(() => { fetchCategorie(); }, [fetchCategorie]);

  const renderCategorie = () => (
    <CategorieManager categorie={categorie} loading={catLoading} onRefresh={fetchCategorie} />
  );

  const renderPagamenti = () => (
    <PresetPagamentoManager />
  );

  const sectionRenderers = {
    xml: renderXml,
    fic: renderFic,
    categorie: renderCategorie,
    pagamenti: renderPagamenti,
    stato: renderStato,
    manutenzione: renderManutenzione,
  };

  // ─── RENDER ───────────────────────────────────────────
  return (
    <>
      <FattureNav current="impostazioni" />
      <div className="min-h-screen bg-neutral-50 font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex gap-6">

            {/* SIDEBAR */}
            <div className="w-56 flex-shrink-0">
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 px-3">
                Impostazioni Acquisti
              </h2>
              <nav className="space-y-0.5">
                {MENU.map(item => {
                  const active = activeSection === item.key;
                  return (
                    <button key={item.key} onClick={() => setActiveSection(item.key)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition flex items-start gap-2.5 ${
                        active
                          ? "bg-teal-50 text-teal-900 shadow-sm border border-teal-200"
                          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                      }`}>
                      <span className="text-sm mt-0.5">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${active ? "text-teal-900" : ""}`}>{item.label}</div>
                        {item.desc && <div className="text-[11px] text-neutral-400 mt-0.5 leading-tight">{item.desc}</div>}
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* CONTENT */}
            <div className="flex-1 min-w-0">
              <main className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm min-h-[500px]">
                {sectionRenderers[activeSection]?.()}
              </main>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}


// ═══════════════════════════════════════════════════════
// COMPONENTE GESTIONE CATEGORIE (albero CRUD)
// ═══════════════════════════════════════════════════════
function CategorieManager({ categorie, loading, onRefresh }) {
  const [newCatName, setNewCatName] = useState("");
  const [newSubNames, setNewSubNames] = useState({});
  const [editCat, setEditCat] = useState(null);
  const [editSub, setEditSub] = useState(null);
  const [moving, setMoving] = useState(null);

  const addCategoria = async () => {
    if (!newCatName.trim()) return;
    await apiFetch(CAT_BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: newCatName.trim() }) });
    setNewCatName(""); onRefresh();
  };
  const addSottocategoria = async (catId) => {
    const nome = (newSubNames[catId] || "").trim();
    if (!nome) return;
    await apiFetch(`${CAT_BASE}/${catId}/sotto`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome }) });
    setNewSubNames(p => ({ ...p, [catId]: "" })); onRefresh();
  };
  const deleteCat = async (catId, nome) => {
    if (!window.confirm(`Eliminare "${nome}" e tutte le sue sottocategorie?`)) return;
    await apiFetch(`${CAT_BASE}/${catId}`, { method: "DELETE" }); onRefresh();
  };
  const deleteSub = async (subId, nome) => {
    if (!window.confirm(`Eliminare "${nome}"?`)) return;
    await apiFetch(`${CAT_BASE}/sotto/${subId}`, { method: "DELETE" }); onRefresh();
  };
  const moveSub = async (subId, newCatId) => {
    await apiFetch(`${CAT_BASE}/sotto/${subId}/sposta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_categoria_id: newCatId }) });
    setMoving(null); onRefresh();
  };
  const saveCatRename = async () => {
    if (!editCat) return;
    await apiFetch(`${CAT_BASE}/${editCat.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: editCat.nome }) });
    setEditCat(null); onRefresh();
  };
  const saveSubRename = async () => {
    if (!editSub) return;
    await apiFetch(`${CAT_BASE}/sotto/${editSub.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: editSub.nome }) });
    setEditSub(null); onRefresh();
  };

  if (loading) return <p className="text-neutral-500 text-sm">Caricamento categorie...</p>;

  return (
    <div>
      <h2 className="text-lg font-bold text-teal-900 mb-1">Gestione Categorie</h2>
      <p className="text-sm text-neutral-500 mb-4">Crea, modifica e organizza le categorie e sotto-categorie per fornitori e prodotti.</p>

      <div className="space-y-4">
        {categorie.map(cat => (
          <div key={cat.id} className="border border-neutral-200 rounded-2xl p-4 bg-neutral-50">
            <div className="flex items-center gap-2 mb-3">
              {editCat?.id === cat.id ? (
                <>
                  <input value={editCat.nome} onChange={e => setEditCat({ ...editCat, nome: e.target.value })}
                    onKeyDown={e => e.key === "Enter" && saveCatRename()}
                    className="px-2 py-1 border rounded-lg text-sm font-semibold flex-1" autoFocus />
                  <button onClick={saveCatRename} className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-lg">Salva</button>
                  <button onClick={() => setEditCat(null)} className="text-xs px-2 py-1 bg-neutral-200 rounded-lg">Annulla</button>
                </>
              ) : (
                <>
                  <span className="text-base font-bold text-teal-900">{cat.nome}</span>
                  <span className="text-[10px] text-neutral-400">({cat.sottocategorie?.length || 0} sub)</span>
                  <button onClick={() => setEditCat({ id: cat.id, nome: cat.nome })} className="text-xs px-2 py-0.5 text-blue-700 hover:bg-blue-50 rounded-lg">✏️</button>
                  <button onClick={() => deleteCat(cat.id, cat.nome)} className="text-xs px-2 py-0.5 text-red-600 hover:bg-red-50 rounded-lg">🗑️</button>
                </>
              )}
            </div>
            <div className="ml-4 space-y-1">
              {(cat.sottocategorie || []).map(sub => (
                <div key={sub.id} className="flex items-center gap-2">
                  <span className="text-neutral-400 text-xs">├─</span>
                  {editSub?.id === sub.id ? (
                    <>
                      <input value={editSub.nome} onChange={e => setEditSub({ ...editSub, nome: e.target.value })}
                        onKeyDown={e => e.key === "Enter" && saveSubRename()}
                        className="px-2 py-0.5 border rounded text-xs flex-1" autoFocus />
                      <button onClick={saveSubRename} className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-800 rounded">OK</button>
                      <button onClick={() => setEditSub(null)} className="text-[10px] px-1.5 py-0.5 bg-neutral-200 rounded">✕</button>
                    </>
                  ) : moving?.subId === sub.id ? (
                    <>
                      <span className="text-sm font-medium text-teal-700">{sub.nome}</span>
                      <span className="text-[10px] text-neutral-500">→ sposta in:</span>
                      <select className="text-xs border rounded px-1.5 py-0.5" defaultValue=""
                        onChange={e => { if (e.target.value) moveSub(sub.id, Number(e.target.value)); }}>
                        <option value="">— scegli —</option>
                        {categorie.filter(c => c.id !== cat.id).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                      <button onClick={() => setMoving(null)} className="text-[10px] px-1.5 py-0.5 bg-neutral-200 rounded">✕</button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm">{sub.nome}</span>
                      <button onClick={() => setEditSub({ id: sub.id, nome: sub.nome })} className="text-[10px] px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 rounded">✏️</button>
                      <Tooltip label="Sposta in un'altra categoria">
                        <button onClick={() => setMoving({ subId: sub.id, subNome: sub.nome, fromCatId: cat.id })}
                          className="text-[10px] px-1.5 py-0.5 text-teal-600 hover:bg-teal-50 rounded">↗️</button>
                      </Tooltip>
                      <button onClick={() => deleteSub(sub.id, sub.nome)} className="text-[10px] px-1.5 py-0.5 text-red-500 hover:bg-red-50 rounded">🗑️</button>
                    </>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-neutral-400 text-xs">└─</span>
                <input type="text" placeholder="Nuova sotto-categoria..."
                  value={newSubNames[cat.id] || ""}
                  onChange={e => setNewSubNames(p => ({ ...p, [cat.id]: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addSottocategoria(cat.id)}
                  className="px-2 py-1 border border-dashed border-neutral-300 rounded text-xs flex-1" />
                <button onClick={() => addSottocategoria(cat.id)}
                  className="text-xs px-2 py-1 bg-teal-100 text-teal-800 rounded-lg hover:bg-teal-200 transition">+ Aggiungi</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <input type="text" placeholder="Nuova categoria..." value={newCatName}
          onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === "Enter" && addCategoria()}
          className="px-3 py-2 border border-neutral-300 rounded-xl text-sm w-64" />
        <button onClick={addCategoria}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition">+ Nuova Categoria</button>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// COMPONENTE GESTIONE PRESET CONDIZIONI PAGAMENTO
// ═══════════════════════════════════════════════════════
const CG = `${API_BASE}/controllo-gestione`;
const MP_OPTIONS = [
  { code: "MP01", label: "Contanti" },
  { code: "MP02", label: "Assegno" },
  { code: "MP05", label: "Bonifico" },
  { code: "MP08", label: "Carta di credito" },
  { code: "MP09", label: "RID" },
  { code: "MP12", label: "RIBA" },
  { code: "MP16", label: "Domiciliazione bancaria" },
  { code: "MP19", label: "SEPA DD" },
  { code: "MP20", label: "SEPA DD Core" },
];

function PresetPagamentoManager() {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ codice: "", descrizione: "", modalita: "MP12", giorni: 30, calcolo: "DF", rate: 1 });
  const [saving, setSaving] = useState(false);

  const fetchPresets = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${CG}/condizioni-pagamento/preset?solo_attivi=false`);
      if (r.ok) setPresets(await r.json());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  const toggleAttivo = async (p) => {
    await apiFetch(`${CG}/condizioni-pagamento/preset/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attivo: p.attivo ? 0 : 1 }),
    });
    fetchPresets();
  };

  const handleCreate = async () => {
    if (!newForm.codice || !newForm.descrizione) return;
    setSaving(true);
    try {
      await apiFetch(`${CG}/condizioni-pagamento/preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      setShowNew(false);
      setNewForm({ codice: "", descrizione: "", modalita: "MP12", giorni: 30, calcolo: "DF", rate: 1 });
      fetchPresets();
    } catch (_) {}
    setSaving(false);
  };

  const handleDelete = async (p) => {
    if (!confirm(`Eliminare "${p.descrizione}"?`)) return;
    await apiFetch(`${CG}/condizioni-pagamento/preset/${p.id}`, { method: "DELETE" });
    fetchPresets();
  };

  const mpLabel = (code) => MP_OPTIONS.find(m => m.code === code)?.label || code;

  if (loading) return <p className="text-neutral-400 text-sm py-8 text-center">Caricamento preset...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-800">Condizioni di Pagamento</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Preset standard da assegnare ai fornitori. DF = data fattura, FM = fine mese.
          </p>
        </div>
        <button onClick={() => setShowNew(!showNew)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition">
          + Nuovo preset
        </button>
      </div>

      {/* Form nuovo preset */}
      {showNew && (
        <div className="mb-4 p-4 bg-teal-50 border border-teal-200 rounded-xl">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase mb-0.5">Codice</label>
              <input type="text" value={newForm.codice} onChange={e => setNewForm(f => ({...f, codice: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "")}))}
                placeholder="es. RIBA_45_DF" className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase mb-0.5">Descrizione</label>
              <input type="text" value={newForm.descrizione} onChange={e => setNewForm(f => ({...f, descrizione: e.target.value}))}
                placeholder="es. RIBA 45gg DF" className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase mb-0.5">Modalita</label>
              <select value={newForm.modalita} onChange={e => setNewForm(f => ({...f, modalita: e.target.value}))}
                className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs">
                {MP_OPTIONS.map(m => <option key={m.code} value={m.code}>{m.code} — {m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase mb-0.5">Giorni</label>
              <input type="number" value={newForm.giorni} onChange={e => setNewForm(f => ({...f, giorni: parseInt(e.target.value) || 0}))}
                className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase mb-0.5">Calcolo</label>
              <select value={newForm.calcolo} onChange={e => setNewForm(f => ({...f, calcolo: e.target.value}))}
                className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs">
                <option value="DF">DF — Data Fattura</option>
                <option value="FM">FM — Fine Mese</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase mb-0.5">Rate</label>
              <input type="number" min="1" max="12" value={newForm.rate} onChange={e => setNewForm(f => ({...f, rate: parseInt(e.target.value) || 1}))}
                className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleCreate} disabled={saving || !newForm.codice || !newForm.descrizione}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition disabled:opacity-50">
              {saving ? "Salvataggio..." : "Crea preset"}
            </button>
            <button onClick={() => setShowNew(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-neutral-500 hover:bg-neutral-100 transition">Annulla</button>
          </div>
        </div>
      )}

      {/* Tabella preset */}
      <div className="border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-neutral-50 text-neutral-600 text-[10px] uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">Descrizione</th>
              <th className="px-3 py-2 text-left">Modalita</th>
              <th className="px-3 py-2 text-center">Giorni</th>
              <th className="px-3 py-2 text-center">Calcolo</th>
              <th className="px-3 py-2 text-center">Rate</th>
              <th className="px-3 py-2 text-center">Attivo</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {presets.map(p => (
              <tr key={p.id} className={`border-t border-neutral-100 ${p.attivo ? "" : "opacity-40"}`}>
                <td className="px-3 py-2 font-medium text-neutral-800">
                  {p.descrizione}
                  <span className="ml-2 text-[9px] text-neutral-400 font-mono">{p.codice}</span>
                </td>
                <td className="px-3 py-2 text-neutral-600">
                  <span className="font-mono text-[10px]">{p.modalita}</span>
                  <span className="text-neutral-400 ml-1 text-[10px]">{mpLabel(p.modalita)}</span>
                </td>
                <td className="px-3 py-2 text-center font-mono">{p.giorni}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    p.calcolo === "FM" ? "bg-blue-100 text-blue-700" : "bg-neutral-100 text-neutral-600"
                  }`}>{p.calcolo}</span>
                </td>
                <td className="px-3 py-2 text-center font-mono">{p.rate > 1 ? p.rate : "—"}</td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => toggleAttivo(p)}
                    className={`w-8 h-4 rounded-full transition relative ${p.attivo ? "bg-teal-500" : "bg-neutral-300"}`}>
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition ${p.attivo ? "right-0.5" : "left-0.5"}`} />
                  </button>
                </td>
                <td className="px-3 py-2 text-center">
                  <Tooltip label="Elimina">
                    <button onClick={() => handleDelete(p)} className="text-red-400 hover:text-red-600 text-[10px]">x</button>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
