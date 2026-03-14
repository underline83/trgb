// @version: v2.0-impostazioni-completa
// Impostazioni Modulo Vini — Unifica CantinaTools + Impostazioni
// Visibile solo per admin e sommelier

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ViniNav from "./ViniNav";

// ---------------------------------------------------------------
// COMPONENTE LISTA RIORDINABILE (frecce)
// ---------------------------------------------------------------
function OrderList({ items, labelKey, onReorder }) {
  const move = (idx, dir) => {
    const arr = [...items];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    onReorder(arr);
  };

  return (
    <div className="space-y-1">
      {items.map((item, idx) => (
        <div
          key={typeof item === "string" ? item : item[labelKey] || idx}
          className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm"
        >
          <span className="text-neutral-400 font-mono text-xs w-5 text-right">{idx + 1}</span>
          <span className="flex-1 font-medium text-neutral-800">
            {typeof item === "string" ? item : item[labelKey]}
          </span>
          <button onClick={() => move(idx, -1)} disabled={idx === 0}
            className="px-1.5 py-0.5 text-xs rounded hover:bg-neutral-200 disabled:opacity-30 transition">▲</button>
          <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1}
            className="px-1.5 py-0.5 text-xs rounded hover:bg-neutral-200 disabled:opacity-30 transition">▼</button>
        </div>
      ))}
    </div>
  );
}

// ===============================================================
// SEZIONE COLLASSABILE
// ===============================================================
function Section({ title, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-neutral-200 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 bg-neutral-50 hover:bg-neutral-100 transition text-left">
        <h2 className="text-lg font-semibold text-amber-900 font-playfair">
          {icon} {title}
        </h2>
        <span className="text-neutral-400 text-lg">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="px-6 py-5 border-t border-neutral-200">{children}</div>}
    </div>
  );
}

// ===============================================================
// MAIN COMPONENT
// ===============================================================
export default function ViniImpostazioni() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAllowed = role === "admin" || role === "sommelier";

  // --- Sync / Import / Export ---
  const [syncResult, setSyncResult] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [normResult, setNormResult] = useState(null);
  const [normLoading, setNormLoading] = useState(false);
  const [error, setError] = useState("");
  const [forzaGiacenze, setForzaGiacenze] = useState(false);
  const [showCartaPreview, setShowCartaPreview] = useState(false);

  // --- Impostazioni ordinamento ---
  const [tipologie, setTipologie] = useState([]);
  const [nazioni, setNazioni] = useState([]);
  const [selectedNazione, setSelectedNazione] = useState("");
  const [regioni, setRegioni] = useState([]);
  const [filtri, setFiltri] = useState({ min_qta_stampa: 1, mostra_negativi: false, mostra_senza_prezzo: false });
  const [settingsMsg, setSettingsMsg] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [showOrdinamento, setShowOrdinamento] = useState(false);

  // -------------------------------------------------------
  // FETCH IMPOSTAZIONI
  // -------------------------------------------------------
  const fetchTipologie = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/settings/vini/tipologie`);
      if (r.ok) setTipologie((await r.json()).map((d) => d.nome));
    } catch {}
  }, []);

  const fetchNazioni = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/settings/vini/nazioni`);
      if (r.ok) setNazioni((await r.json()).map((d) => d.nazione));
    } catch {}
  }, []);

  const fetchRegioni = useCallback(async (naz) => {
    if (!naz) { setRegioni([]); return; }
    try {
      const r = await apiFetch(`${API_BASE}/settings/vini/regioni/${encodeURIComponent(naz)}`);
      if (r.ok) setRegioni(await r.json());
    } catch {}
  }, []);

  const fetchFiltri = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/settings/vini/filtri`);
      if (r.ok) setFiltri(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (showOrdinamento) { fetchTipologie(); fetchNazioni(); fetchFiltri(); }
  }, [showOrdinamento, fetchTipologie, fetchNazioni, fetchFiltri]);

  useEffect(() => {
    if (selectedNazione) fetchRegioni(selectedNazione);
  }, [selectedNazione, fetchRegioni]);

  // -------------------------------------------------------
  // SALVA IMPOSTAZIONI
  // -------------------------------------------------------
  const flash = (msg) => { setSettingsMsg(msg); setTimeout(() => setSettingsMsg(""), 3000); };

  const saveTipologie = async () => {
    setSettingsLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/settings/vini/tipologie`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tipologie),
      });
      if (r.ok) flash("Ordine tipologie salvato"); else throw new Error();
    } catch { flash("Errore salvataggio tipologie"); }
    setSettingsLoading(false);
  };

  const saveNazioni = async () => {
    setSettingsLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/settings/vini/nazioni`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nazioni),
      });
      if (r.ok) flash("Ordine nazioni salvato"); else throw new Error();
    } catch { flash("Errore salvataggio nazioni"); }
    setSettingsLoading(false);
  };

  const saveRegioni = async () => {
    if (!selectedNazione) return;
    setSettingsLoading(true);
    try {
      const payload = regioni.map((r) => ({ codice: r.codice, nome: r.nome }));
      const r = await apiFetch(`${API_BASE}/settings/vini/regioni/${encodeURIComponent(selectedNazione)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) flash(`Ordine regioni ${selectedNazione} salvato`); else throw new Error();
    } catch { flash("Errore salvataggio regioni"); }
    setSettingsLoading(false);
  };

  const saveFiltri = async () => {
    setSettingsLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/settings/vini/filtri`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filtri),
      });
      if (r.ok) flash("Filtri salvati"); else throw new Error();
    } catch { flash("Errore salvataggio filtri"); }
    setSettingsLoading(false);
  };

  // -------------------------------------------------------
  // HANDLERS OPERAZIONI
  // -------------------------------------------------------
  const handleSync = async () => {
    setSyncLoading(true); setError(""); setSyncResult(null);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/sync-from-excel?forza_giacenze=${forzaGiacenze}`, { method: "POST" });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`);
      setSyncResult(await resp.json());
    } catch (e) { setError(e?.message || "Errore sincronizzazione."); }
    finally { setSyncLoading(false); }
  };

  const handleImportExcel = async (file) => {
    if (!file) return;
    setImportLoading(true); setError(""); setImportResult(null);
    try {
      const form = new FormData(); form.append("file", file);
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/import-excel`, { method: "POST", body: form });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`);
      setImportResult(await resp.json());
    } catch (e) { setError(e?.message || "Errore import."); }
    finally { setImportLoading(false); }
  };

  const handleExport = () => {
    const token = localStorage.getItem("token");
    window.open(`${API_BASE}/vini/cantina-tools/export-excel?token=${token}`, "_blank");
  };

  const handleCleanupDuplicates = async (dryRun) => {
    setCleanupLoading(true); setError(""); setCleanupResult(null);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/cleanup-duplicates?dry_run=${dryRun}`, { method: "POST" });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`);
      setCleanupResult(await resp.json());
    } catch (e) { setError(e?.message || "Errore pulizia duplicati."); }
    finally { setCleanupLoading(false); }
  };

  const handleNormalizzaLocazioni = async (dryRun) => {
    setNormLoading(true); setError(""); setNormResult(null);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/normalizza-locazioni?dry_run=${dryRun}`, { method: "POST" });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`);
      setNormResult(await resp.json());
    } catch (e) { setError(e?.message || "Errore normalizzazione."); }
    finally { setNormLoading(false); }
  };

  const handleResetDatabase = async () => {
    setResetLoading(true); setError(""); setResetResult(null);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/reset-database`, { method: "POST" });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`);
      setResetResult(await resp.json());
    } catch (e) { setError(e?.message || "Errore reset database."); }
    finally { setResetLoading(false); }
  };

  const handleResetAndReimport = async (file) => {
    if (!file) return;
    setResetLoading(true); setError(""); setResetResult(null); setImportResult(null);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/reset-database`, { method: "POST" });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore reset: ${resp.status}`);
      setResetResult(await resp.json());
    } catch (e) { setError(e?.message || "Errore reset database."); setResetLoading(false); return; }
    setResetLoading(false);
    setImportLoading(true);
    try {
      const form = new FormData(); form.append("file", file);
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/import-excel`, { method: "POST", body: form });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore import: ${resp.status}`);
      setImportResult(await resp.json());
    } catch (e) { setError(e?.message || "Errore import dopo reset."); }
    finally { setImportLoading(false); }
  };

  // -------------------------------------------------------
  // ACCESS CHECK
  // -------------------------------------------------------
  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 font-sans flex items-center justify-center">
        <div className="bg-white shadow-xl rounded-2xl p-10 text-center max-w-md">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">Accesso riservato</h2>
          <p className="text-neutral-600 text-sm mb-4">
            Questa sezione è disponibile solo per amministratori e sommelier.
          </p>
          <button onClick={() => navigate("/vini")}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
            ← Menu Vini
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------
  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <ViniNav current="settings" />
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair">
              Impostazioni Vini
            </h1>
            <p className="text-neutral-600 mt-1">
              Sincronizzazione, import/export, ordinamento carta, manutenzione.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
              Cantina
            </button>
            <button onClick={() => navigate("/vini/magazzino/registro")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
              Registro Movimenti
            </button>
            <button onClick={() => navigate("/vini/magazzino/admin")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
              Modifica Massiva
            </button>
          </div>
        </div>

        {/* ERRORE GLOBALE */}
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>
        )}

        {/* ============================================= */}
        {/* SEZIONE 1: SYNC EXCEL → CANTINA */}
        {/* ============================================= */}
        <Section title="Sincronizza Excel → Cantina" icon="🔄">
          <p className="text-sm text-neutral-600 mb-4">
            Prende i dati dal DB carta (vini.sqlite3) e li sincronizza nella cantina.
          </p>
          <div className="flex items-center gap-3 mb-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={forzaGiacenze} onChange={(e) => setForzaGiacenze(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-300 text-amber-700 focus:ring-amber-500" />
              <span className="text-sm font-medium text-neutral-700">Forza aggiornamento giacenze da Excel</span>
            </label>
            {forzaGiacenze && (
              <span className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded">
                Sovrascrive le quantità in cantina
              </span>
            )}
          </div>
          <button onClick={handleSync} disabled={syncLoading}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition ${
              syncLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                : forzaGiacenze ? "bg-red-700 text-white hover:bg-red-800"
                : "bg-amber-700 text-white hover:bg-amber-800"
            }`}>
            {syncLoading ? "Sincronizzazione…" : "Avvia sincronizzazione"}
          </button>
          {syncResult && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
              <p className="font-semibold text-green-800 mb-1">{syncResult.msg}</p>
              <div className="text-green-700 space-y-0.5">
                <p>Totale Excel: <strong>{syncResult.totale_excel}</strong> — Nuovi: <strong>{syncResult.inseriti}</strong> — Aggiornati: <strong>{syncResult.aggiornati}</strong></p>
                {syncResult.ricollegati > 0 && <p>Ricollegati per chiave naturale: <strong>{syncResult.ricollegati}</strong></p>}
                {syncResult.forza_giacenze && <p>Giacenze sovrascritte: <strong>{syncResult.giacenze_forzate}</strong></p>}
                {syncResult.errori?.length > 0 && (
                  <details className="mt-2">
                    <summary className="font-semibold text-red-700 cursor-pointer">Errori ({syncResult.errori.length})</summary>
                    <ul className="list-disc pl-5 text-red-600 text-xs mt-1">
                      {syncResult.errori.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          )}
        </Section>

        {/* ============================================= */}
        {/* SEZIONE 2: IMPORT / EXPORT */}
        {/* ============================================= */}
        <Section title="Import / Export Excel" icon="📥">
          <p className="text-sm text-neutral-600 mb-4">
            Import diretto di un Excel nella cantina, oppure esporta per lavorare offline.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition cursor-pointer text-center ${
              importLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
            }`}>
              {importLoading ? "Importazione…" : "Importa Excel → Cantina"}
              <input type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => handleImportExcel(e.target.files?.[0])} disabled={importLoading} />
            </label>
            <button onClick={handleExport}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 shadow transition">
              Esporta Cantina → Excel
            </button>
            <label className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition cursor-pointer text-center ${
              resetLoading || importLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed" : "bg-red-600 text-white hover:bg-red-700"
            }`}>
              {resetLoading ? "Reset in corso…" : importLoading ? "Importazione…" : "Azzera e Ricarica da Excel"}
              <input type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && window.confirm(
                    "ATTENZIONE: Questo cancellerà TUTTI i vini, movimenti e note dalla cantina, poi importerà il file Excel selezionato.\n\nContinuare?"
                  )) {
                    handleResetAndReimport(file);
                  }
                  e.target.value = "";
                }}
                disabled={resetLoading || importLoading} />
            </label>
          </div>
          {resetResult && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
              {resetResult.msg}
            </div>
          )}
          {importResult && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
              <p className="font-semibold text-green-800 mb-1">{importResult.msg}</p>
              <p className="text-green-700">
                Righe Excel: <strong>{importResult.righe_excel}</strong> — Nuovi: <strong>{importResult.inseriti}</strong> — Aggiornati: <strong>{importResult.aggiornati}</strong>
              </p>
              {importResult.errori?.length > 0 && (
                <details className="mt-2">
                  <summary className="font-semibold text-red-700 cursor-pointer">Errori ({importResult.errori.length})</summary>
                  <ul className="list-disc pl-5 text-red-600 text-xs mt-1">
                    {importResult.errori.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </Section>

        {/* ============================================= */}
        {/* SEZIONE 3: GENERA CARTA */}
        {/* ============================================= */}
        <Section title="Genera Carta dei Vini" icon="📜">
          <p className="text-sm text-neutral-600 mb-4">
            Genera la carta dei vini dal database cantina con le impostazioni correnti.
          </p>
          <div className="flex flex-wrap gap-3 mb-4">
            <button onClick={() => setShowCartaPreview((p) => !p)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow transition">
              {showCartaPreview ? "Chiudi anteprima" : "Anteprima HTML"}
            </button>
            <button onClick={() => {
                const token = localStorage.getItem("token");
                window.open(`${API_BASE}/vini/cantina-tools/carta-cantina/pdf?token=${token}`, "_blank");
              }}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow transition">
              Scarica PDF
            </button>
            <button onClick={() => {
                const token = localStorage.getItem("token");
                window.open(`${API_BASE}/vini/cantina-tools/carta-cantina/docx?token=${token}`, "_blank");
              }}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow transition">
              Scarica Word
            </button>
          </div>
          {showCartaPreview && (
            <div className="border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-neutral-100 border-b border-neutral-200">
                <div className="text-sm font-semibold text-neutral-800">Anteprima Carta Vini (da Cantina)</div>
              </div>
              <iframe src={`${API_BASE}/vini/cantina-tools/carta-cantina`} title="Carta Vini da Cantina"
                className="w-full" style={{ height: "70vh", border: "none" }} />
            </div>
          )}
        </Section>

        {/* ============================================= */}
        {/* SEZIONE 4: ORDINAMENTO CARTA */}
        {/* ============================================= */}
        <Section title="Ordinamento Carta" icon="📋">
          <p className="text-sm text-neutral-600 mb-4">
            Ordine di tipologie, nazioni, regioni e filtri per la generazione della carta.
          </p>

          {settingsMsg && (
            <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
              {settingsMsg}
            </div>
          )}

          {!showOrdinamento ? (
            <button onClick={() => setShowOrdinamento(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow transition">
              Carica impostazioni
            </button>
          ) : (
            <div className="space-y-5">
              {/* TIPOLOGIE */}
              <div className="border border-neutral-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-neutral-800">Ordine Tipologie</h3>
                  <button onClick={saveTipologie} disabled={settingsLoading}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">
                    Salva
                  </button>
                </div>
                {tipologie.length > 0 ? <OrderList items={tipologie} onReorder={setTipologie} /> : <p className="text-sm text-neutral-400">Caricamento…</p>}
              </div>

              {/* NAZIONI */}
              <div className="border border-neutral-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-neutral-800">Ordine Nazioni</h3>
                  <button onClick={saveNazioni} disabled={settingsLoading}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">
                    Salva
                  </button>
                </div>
                {nazioni.length > 0 ? <OrderList items={nazioni} onReorder={setNazioni} /> : <p className="text-sm text-neutral-400">Caricamento…</p>}
              </div>

              {/* REGIONI */}
              <div className="border border-neutral-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-neutral-800">Ordine Regioni</h3>
                  <button onClick={saveRegioni} disabled={settingsLoading || !selectedNazione}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">
                    Salva
                  </button>
                </div>
                <select value={selectedNazione} onChange={(e) => setSelectedNazione(e.target.value)}
                  className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-amber-500 focus:border-amber-500 mb-3">
                  <option value="">— Seleziona nazione —</option>
                  {nazioni.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {selectedNazione && regioni.length > 0 ? (
                  <OrderList items={regioni} labelKey="nome" onReorder={setRegioni} />
                ) : selectedNazione ? (
                  <p className="text-sm text-neutral-400">Caricamento regioni…</p>
                ) : (
                  <p className="text-sm text-neutral-400">Seleziona una nazione.</p>
                )}
              </div>

              {/* FILTRI */}
              <div className="border border-neutral-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-neutral-800">Filtri Carta</h3>
                  <button onClick={saveFiltri} disabled={settingsLoading}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">
                    Salva
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-neutral-700 w-48">Quantità minima stampa:</label>
                    <input type="number" value={filtri.min_qta_stampa}
                      onChange={(e) => setFiltri((f) => ({ ...f, min_qta_stampa: parseInt(e.target.value) || 0 }))}
                      className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm w-20 focus:ring-amber-500 focus:border-amber-500" />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={filtri.mostra_negativi}
                      onChange={(e) => setFiltri((f) => ({ ...f, mostra_negativi: e.target.checked }))}
                      className="w-4 h-4 rounded border-neutral-300 text-amber-700 focus:ring-amber-500" />
                    <span className="text-sm text-neutral-700">Mostra vini con giacenza negativa</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={filtri.mostra_senza_prezzo}
                      onChange={(e) => setFiltri((f) => ({ ...f, mostra_senza_prezzo: e.target.checked }))}
                      className="w-4 h-4 rounded border-neutral-300 text-amber-700 focus:ring-amber-500" />
                    <span className="text-sm text-neutral-700">Mostra vini senza prezzo</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* ============================================= */}
        {/* SEZIONE 5: MANUTENZIONE */}
        {/* ============================================= */}
        <Section title="Manutenzione" icon="🔧">
          <p className="text-sm text-neutral-600 mb-4">
            Pulizia duplicati e strumenti di manutenzione del database cantina.
          </p>

          <div className="flex flex-wrap gap-3">
            <button onClick={() => handleCleanupDuplicates(true)} disabled={cleanupLoading}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition ${
                cleanupLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                  : "bg-amber-700 text-white hover:bg-amber-800"
              }`}>
              {cleanupLoading ? "Analisi…" : "Analizza duplicati"}
            </button>
            {cleanupResult && cleanupResult.gruppi_duplicati > 0 && cleanupResult.dry_run && (
              <button onClick={() => {
                  if (window.confirm(`Eliminare ${cleanupResult.vini_da_eliminare} vini duplicati?`)) {
                    handleCleanupDuplicates(false);
                  }
                }}
                disabled={cleanupLoading}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 shadow transition">
                Elimina {cleanupResult.vini_da_eliminare} duplicati
              </button>
            )}
          </div>

          {cleanupResult && (
            <div className={`mt-4 rounded-xl p-4 text-sm border ${
              cleanupResult.gruppi_duplicati === 0 ? "bg-green-50 border-green-200"
                : cleanupResult.dry_run ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"
            }`}>
              <p className={`font-semibold mb-2 ${
                cleanupResult.gruppi_duplicati === 0 ? "text-green-800" : cleanupResult.dry_run ? "text-yellow-800" : "text-green-800"
              }`}>{cleanupResult.msg}</p>
              {cleanupResult.duplicati?.length > 0 && (
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-neutral-100 text-neutral-700">
                        <th className="border border-neutral-200 px-2 py-1 text-left">Descrizione</th>
                        <th className="border border-neutral-200 px-2 py-1 text-left">Produttore</th>
                        <th className="border border-neutral-200 px-2 py-1">Annata</th>
                        <th className="border border-neutral-200 px-2 py-1">Copie</th>
                        <th className="border border-neutral-200 px-2 py-1">ID mantenuto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cleanupResult.duplicati.map((d, i) => (
                        <tr key={i} className="hover:bg-yellow-50">
                          <td className="border border-neutral-200 px-2 py-1">{d.descrizione}</td>
                          <td className="border border-neutral-200 px-2 py-1">{d.produttore}</td>
                          <td className="border border-neutral-200 px-2 py-1 text-center">{d.annata}</td>
                          <td className="border border-neutral-200 px-2 py-1 text-center font-semibold text-red-600">x{d.copie}</td>
                          <td className="border border-neutral-200 px-2 py-1 text-center">{d.keep_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ============================================= */}
        {/* SEZIONE 6: NORMALIZZAZIONE LOCAZIONI */}
        {/* ============================================= */}
        <Section title="Normalizza Locazioni Frigo" icon="📍">
          <p className="text-sm text-neutral-600 mb-4">
            Converte i valori nel campo Frigorifero al formato standard (es. "Frigo-1-3" → "Frigo 1 - Fila 3").
          </p>

          <div className="flex flex-wrap gap-3">
            <button onClick={() => handleNormalizzaLocazioni(true)} disabled={normLoading}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition ${
                normLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                  : "bg-amber-700 text-white hover:bg-amber-800"
              }`}>
              {normLoading ? "Analisi…" : "Analizza locazioni"}
            </button>
            {normResult && normResult.da_normalizzare > 0 && normResult.dry_run && (
              <button onClick={() => {
                  if (window.confirm(`Normalizzare ${normResult.da_normalizzare} valori locazione?`)) {
                    handleNormalizzaLocazioni(false);
                  }
                }}
                disabled={normLoading}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow transition">
                Normalizza {normResult.da_normalizzare} valori
              </button>
            )}
          </div>

          {normResult && (
            <div className={`mt-4 rounded-xl p-4 text-sm border ${
              normResult.da_normalizzare === 0 && normResult.non_riconosciuti === 0
                ? "bg-green-50 border-green-200"
                : normResult.dry_run ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"
            }`}>
              <p className={`font-semibold mb-2 ${
                normResult.da_normalizzare === 0 && normResult.non_riconosciuti === 0 ? "text-green-800"
                  : normResult.dry_run ? "text-yellow-800" : "text-green-800"
              }`}>{normResult.msg}</p>
              <p className="text-neutral-600 mb-2">
                Totale con frigo: <strong>{normResult.totale_con_frigo}</strong> —
                Già OK: <strong>{normResult.gia_ok}</strong> —
                Da normalizzare: <strong>{normResult.da_normalizzare}</strong> —
                Non riconosciuti: <strong>{normResult.non_riconosciuti}</strong>
              </p>
              {normResult.changes?.length > 0 && (
                <div className="max-h-48 overflow-y-auto mb-2">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-neutral-100 text-neutral-700">
                        <th className="border border-neutral-200 px-2 py-1">ID</th>
                        <th className="border border-neutral-200 px-2 py-1 text-left">Vecchio</th>
                        <th className="border border-neutral-200 px-2 py-1 text-left">Nuovo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {normResult.changes.map((ch, i) => (
                        <tr key={i} className="hover:bg-yellow-50">
                          <td className="border border-neutral-200 px-2 py-1 text-center">{ch.id}</td>
                          <td className="border border-neutral-200 px-2 py-1 text-red-600 line-through">{ch.old}</td>
                          <td className="border border-neutral-200 px-2 py-1 text-green-700 font-medium">{ch.new}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {normResult.unknown?.length > 0 && (
                <div className="max-h-48 overflow-y-auto">
                  <p className="text-xs font-semibold text-red-700 mb-1">Valori non riconosciuti (da correggere manualmente):</p>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-red-50 text-red-700">
                        <th className="border border-red-200 px-2 py-1">ID</th>
                        <th className="border border-red-200 px-2 py-1 text-left">Valore</th>
                      </tr>
                    </thead>
                    <tbody>
                      {normResult.unknown.map((u, i) => (
                        <tr key={i}>
                          <td className="border border-red-200 px-2 py-1 text-center">{u.id}</td>
                          <td className="border border-red-200 px-2 py-1">{u.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* INFO */}
        <div className="text-xs text-neutral-500 bg-neutral-50 rounded-xl p-4 border border-neutral-200">
          <p className="font-semibold mb-1">Flusso operativo:</p>
          <p>1. Importa l'Excel nel sistema carta (pagina Carta → Importa file)</p>
          <p>2. Sincronizza i dati nella cantina (sezione Sync qui sopra)</p>
          <p>3. Oppure importa direttamente un Excel nella cantina (sezione Import)</p>
          <p>4. Configura ordinamento e filtri, poi genera la carta</p>
        </div>

      </div>
    </div>
  );
}
