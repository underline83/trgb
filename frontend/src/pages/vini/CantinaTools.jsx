// @version: v2.0-cantina-tools
// Strumenti Cantina — Sync, Import/Export, Genera Carta, Impostazioni ordinamento
// Solo admin

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

// ---------------------------------------------------------------
// COMPONENTE LISTA RIORDINABILE (frecce ▲ ▼)
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
          <button
            onClick={() => move(idx, -1)}
            disabled={idx === 0}
            className="px-1.5 py-0.5 text-xs rounded hover:bg-neutral-200 disabled:opacity-30 transition"
          >▲</button>
          <button
            onClick={() => move(idx, 1)}
            disabled={idx === items.length - 1}
            className="px-1.5 py-0.5 text-xs rounded hover:bg-neutral-200 disabled:opacity-30 transition"
          >▼</button>
        </div>
      ))}
    </div>
  );
}

// ===============================================================
// MAIN COMPONENT
// ===============================================================
export default function CantinaTools() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAdmin = role === "admin";

  // --- Stati operazioni ---
  const [syncResult, setSyncResult] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState("");
  const [forzaGiacenze, setForzaGiacenze] = useState(false);
  const [showCartaPreview, setShowCartaPreview] = useState(false);

  // --- Stati impostazioni ---
  const [tipologie, setTipologie] = useState([]);
  const [nazioni, setNazioni] = useState([]);
  const [selectedNazione, setSelectedNazione] = useState("");
  const [regioni, setRegioni] = useState([]);
  const [filtri, setFiltri] = useState({ min_qta_stampa: 1, mostra_negativi: false, mostra_senza_prezzo: false });
  const [settingsMsg, setSettingsMsg] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // -------------------------------------------------------
  // FETCH IMPOSTAZIONI
  // -------------------------------------------------------
  const fetchTipologie = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/settings/vini/tipologie`);
      if (r.ok) {
        const data = await r.json();
        setTipologie(data.map((d) => d.nome));
      }
    } catch {}
  }, []);

  const fetchNazioni = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/settings/vini/nazioni`);
      if (r.ok) {
        const data = await r.json();
        setNazioni(data.map((d) => d.nazione));
      }
    } catch {}
  }, []);

  const fetchRegioni = useCallback(async (naz) => {
    if (!naz) { setRegioni([]); return; }
    try {
      const r = await apiFetch(`${API_BASE}/settings/vini/regioni/${encodeURIComponent(naz)}`);
      if (r.ok) {
        const data = await r.json();
        setRegioni(data);
      }
    } catch {}
  }, []);

  const fetchFiltri = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/settings/vini/filtri`);
      if (r.ok) setFiltri(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (showSettings) {
      fetchTipologie();
      fetchNazioni();
      fetchFiltri();
    }
  }, [showSettings, fetchTipologie, fetchNazioni, fetchFiltri]);

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
      if (r.ok) flash("Ordine tipologie salvato");
      else throw new Error();
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
      if (r.ok) flash("Ordine nazioni salvato");
      else throw new Error();
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
      if (r.ok) flash(`Ordine regioni ${selectedNazione} salvato`);
      else throw new Error();
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
      if (r.ok) flash("Filtri salvati");
      else throw new Error();
    } catch { flash("Errore salvataggio filtri"); }
    setSettingsLoading(false);
  };

  // -------------------------------------------------------
  // ACCESS CHECK
  // -------------------------------------------------------
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 font-sans flex items-center justify-center">
        <div className="bg-white shadow-xl rounded-2xl p-10 text-center max-w-md">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">Accesso riservato</h2>
          <p className="text-neutral-600 text-sm mb-4">
            Questa sezione è disponibile solo per gli amministratori.
          </p>
          <button
            onClick={() => navigate("/vini")}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
          >
            ← Menu Vini
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // HANDLERS OPERAZIONI
  // -------------------------------------------------------
  const handleSync = async () => {
    setSyncLoading(true); setError(""); setSyncResult(null);
    try {
      const url = `${API_BASE}/vini/cantina-tools/sync-from-excel?forza_giacenze=${forzaGiacenze}`;
      const resp = await apiFetch(url, { method: "POST" });
      if (!resp.ok) { const txt = await resp.text().catch(() => ""); throw new Error(txt || `Errore server: ${resp.status}`); }
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
      if (!resp.ok) { const txt = await resp.text().catch(() => ""); throw new Error(txt || `Errore server: ${resp.status}`); }
      setImportResult(await resp.json());
    } catch (e) { setError(e?.message || "Errore import."); }
    finally { setImportLoading(false); }
  };

  const handleExport = () => {
    const token = localStorage.getItem("token");
    window.open(`${API_BASE}/vini/cantina-tools/export-excel?token=${token}`, "_blank");
  };

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------
  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🔧 Strumenti Cantina
            </h1>
            <p className="text-neutral-600">
              Sincronizzazione, import/export, ordinamento carta e generazione.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
              ← Cantina
            </button>
            <button onClick={() => navigate("/vini")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
              Menu Vini
            </button>
          </div>
        </div>

        {/* ACCESSO RAPIDO */}
        <div className="mb-8 flex flex-wrap gap-3">
          <button onClick={() => navigate("/vini/magazzino/registro")}
            className="px-6 py-3 rounded-2xl text-sm font-semibold bg-purple-700 text-white hover:bg-purple-800 shadow transition flex items-center gap-2">
            📜 Registro Movimenti
          </button>
          <button onClick={() => navigate("/vini/magazzino/admin")}
            className="px-6 py-3 rounded-2xl text-sm font-semibold bg-purple-700 text-white hover:bg-purple-800 shadow transition flex items-center gap-2">
            📋 Modifica Massiva
          </button>
        </div>

        <hr className="border-neutral-200 mb-8" />

        {/* ERRORE GLOBALE */}
        {error && (
          <div className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>
        )}

        {/* ============================================= */}
        {/* SEZIONE 1: SINCRONIZZAZIONE */}
        {/* ============================================= */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-amber-900 font-playfair mb-3">
            🔄 Sincronizza Excel → Cantina
          </h2>
          <p className="text-sm text-neutral-600 mb-4">
            Prende i dati dal vecchio DB e li sincronizza nel DB cantina.
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
            className={`px-6 py-3 rounded-2xl text-sm font-semibold shadow transition ${
              syncLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                : forzaGiacenze ? "bg-red-700 text-white hover:bg-red-800"
                : "bg-amber-700 text-white hover:bg-amber-800"
            }`}>
            {syncLoading ? "Sincronizzazione in corso…" : forzaGiacenze ? "Avvia sincronizzazione (con giacenze)" : "Avvia sincronizzazione"}
          </button>

          {syncResult && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
              <p className="font-semibold text-green-800 mb-1">{syncResult.msg}</p>
              <div className="text-green-700 space-y-1">
                <p>Totale vini nell'Excel: <strong>{syncResult.totale_excel}</strong></p>
                <p>Nuovi inseriti: <strong>{syncResult.inseriti}</strong></p>
                <p>Aggiornati: <strong>{syncResult.aggiornati}</strong></p>
                {syncResult.forza_giacenze && <p>Giacenze sovrascritte: <strong>{syncResult.giacenze_forzate}</strong></p>}
                {syncResult.errori?.length > 0 && (
                  <div className="mt-2">
                    <p className="font-semibold text-red-700">Errori ({syncResult.errori.length}):</p>
                    <ul className="list-disc pl-5 text-red-600 text-xs mt-1">
                      {syncResult.errori.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <hr className="border-neutral-200 mb-8" />

        {/* ============================================= */}
        {/* SEZIONE 2: IMPORT / EXPORT */}
        {/* ============================================= */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-amber-900 font-playfair mb-3">
            📥 Import / Export Excel
          </h2>
          <p className="text-sm text-neutral-600 mb-4">
            Import diretto di un Excel nella cantina, oppure esporta per lavorare offline.
          </p>

          <div className="flex flex-wrap gap-3">
            <label className={`px-6 py-3 rounded-2xl text-sm font-semibold shadow transition cursor-pointer text-center ${
              importLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
            }`}>
              {importLoading ? "Importazione…" : "📤 Importa Excel → Cantina"}
              <input type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => handleImportExcel(e.target.files?.[0])} disabled={importLoading} />
            </label>

            <button onClick={handleExport}
              className="px-6 py-3 rounded-2xl text-sm font-semibold border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 shadow transition">
              📥 Esporta Cantina → Excel
            </button>
          </div>

          {importResult && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
              <p className="font-semibold text-green-800 mb-1">{importResult.msg}</p>
              <div className="text-green-700 space-y-1">
                <p>Righe nell'Excel: <strong>{importResult.righe_excel}</strong></p>
                <p>Nuovi inseriti: <strong>{importResult.inseriti}</strong></p>
                <p>Aggiornati: <strong>{importResult.aggiornati}</strong></p>
                {importResult.errori?.length > 0 && (
                  <div className="mt-2">
                    <p className="font-semibold text-red-700">Errori ({importResult.errori.length}):</p>
                    <ul className="list-disc pl-5 text-red-600 text-xs mt-1">
                      {importResult.errori.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <hr className="border-neutral-200 mb-8" />

        {/* ============================================= */}
        {/* SEZIONE 3: GENERA CARTA */}
        {/* ============================================= */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-amber-900 font-playfair mb-3">
            📜 Genera Carta dei Vini (da Cantina)
          </h2>
          <p className="text-sm text-neutral-600 mb-4">
            Genera la carta dei vini leggendo dal DB cantina con le impostazioni correnti.
          </p>

          <div className="flex flex-wrap gap-3 mb-4">
            <button onClick={() => setShowCartaPreview((p) => !p)}
              className="px-6 py-3 rounded-2xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow transition">
              {showCartaPreview ? "Chiudi anteprima" : "👁 Anteprima HTML"}
            </button>
            <button onClick={() => {
                const token = localStorage.getItem("token");
                window.open(`${API_BASE}/vini/cantina-tools/carta-cantina/pdf?token=${token}`, "_blank");
              }}
              className="px-6 py-3 rounded-2xl text-sm font-semibold border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow transition">
              📄 Scarica PDF
            </button>
            <button onClick={() => {
                const token = localStorage.getItem("token");
                window.open(`${API_BASE}/vini/cantina-tools/carta-cantina/docx?token=${token}`, "_blank");
              }}
              className="px-6 py-3 rounded-2xl text-sm font-semibold border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow transition">
              📝 Scarica Word
            </button>
          </div>

          {showCartaPreview && (
            <div className="border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-neutral-100 border-b border-neutral-200">
                <div className="text-sm font-semibold text-neutral-800">Anteprima Carta Vini (da Cantina)</div>
                <div className="text-xs text-neutral-500">Generata dal database cantina con le impostazioni correnti.</div>
              </div>
              <iframe src={`${API_BASE}/vini/cantina-tools/carta-cantina`} title="Carta Vini da Cantina"
                className="w-full" style={{ height: "70vh", border: "none" }} />
            </div>
          )}
        </div>

        <hr className="border-neutral-200 mb-8" />

        {/* ============================================= */}
        {/* SEZIONE 4: IMPOSTAZIONI ORDINAMENTO CARTA */}
        {/* ============================================= */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-amber-900 font-playfair">
              ⚙️ Impostazioni Ordinamento Carta
            </h2>
            <button onClick={() => setShowSettings((p) => !p)}
              className="text-sm text-amber-700 hover:text-amber-900 underline transition">
              {showSettings ? "Chiudi" : "Apri impostazioni"}
            </button>
          </div>
          <p className="text-sm text-neutral-600 mb-4">
            Ordine di tipologie, nazioni, regioni e filtri per la generazione della carta.
          </p>

          {/* FLASH MESSAGGIO */}
          {settingsMsg && (
            <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 transition">
              {settingsMsg}
            </div>
          )}

          {showSettings && (
            <div className="space-y-6">

              {/* --- TIPOLOGIE --- */}
              <div className="border border-neutral-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-neutral-800">Ordine Tipologie</h3>
                  <button onClick={saveTipologie} disabled={settingsLoading}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">
                    Salva ordine
                  </button>
                </div>
                {tipologie.length > 0 ? (
                  <OrderList items={tipologie} onReorder={setTipologie} />
                ) : (
                  <p className="text-sm text-neutral-400">Caricamento…</p>
                )}
              </div>

              {/* --- NAZIONI --- */}
              <div className="border border-neutral-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-neutral-800">Ordine Nazioni</h3>
                  <button onClick={saveNazioni} disabled={settingsLoading}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">
                    Salva ordine
                  </button>
                </div>
                {nazioni.length > 0 ? (
                  <OrderList items={nazioni} onReorder={setNazioni} />
                ) : (
                  <p className="text-sm text-neutral-400">Caricamento…</p>
                )}
              </div>

              {/* --- REGIONI (per nazione) --- */}
              <div className="border border-neutral-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-neutral-800">Ordine Regioni</h3>
                  <button onClick={saveRegioni} disabled={settingsLoading || !selectedNazione}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">
                    Salva ordine
                  </button>
                </div>
                <div className="mb-3">
                  <select value={selectedNazione} onChange={(e) => setSelectedNazione(e.target.value)}
                    className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-amber-500 focus:border-amber-500">
                    <option value="">— Seleziona nazione —</option>
                    {nazioni.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                {selectedNazione && regioni.length > 0 ? (
                  <OrderList items={regioni} labelKey="nome" onReorder={setRegioni} />
                ) : selectedNazione ? (
                  <p className="text-sm text-neutral-400">Caricamento regioni…</p>
                ) : (
                  <p className="text-sm text-neutral-400">Seleziona una nazione per vedere le regioni.</p>
                )}
              </div>

              {/* --- FILTRI CARTA --- */}
              <div className="border border-neutral-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-neutral-800">Filtri Carta</h3>
                  <button onClick={saveFiltri} disabled={settingsLoading}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">
                    Salva filtri
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
        </div>

        {/* INFO */}
        <div className="mt-6 text-xs text-neutral-500 bg-neutral-50 rounded-xl p-4 border border-neutral-200">
          <p className="font-semibold mb-1">Come funziona il flusso:</p>
          <p>1. Importa l'Excel nel vecchio sistema (Carta dei Vini → Importa file Excel)</p>
          <p>2. Clicca "Avvia sincronizzazione" qui per portare i dati nella cantina</p>
          <p>3. Oppure: importa direttamente un Excel nella cantina (salta il vecchio sistema)</p>
          <p>4. Esporta la cantina in Excel per lavorare offline</p>
          <p>5. Configura l'ordinamento e i filtri nella sezione Impostazioni</p>
          <p>6. Genera la carta da qui oppure usa "Genera Carta PDF" dal menu Cantina</p>
        </div>
      </div>
    </div>
  );
}
