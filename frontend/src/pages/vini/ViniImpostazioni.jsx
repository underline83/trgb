// @version: v3.0-sidebar-layout
// Impostazioni Modulo Vini — Layout sidebar + contenuto
// Visibile solo per admin e sommelier

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ViniNav from "./ViniNav";

// ---------------------------------------------------------------
// COMPONENTE LISTA RIORDINABILE
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
        <div key={typeof item === "string" ? item : item[labelKey] || idx}
          className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm">
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

// ---------------------------------------------------------------
// SIDEBAR MENU ITEMS
// ---------------------------------------------------------------
const MENU = [
  { key: "import",      label: "Import / Export",     icon: "📥" },
  { key: "carta",       label: "Carta dei Vini",      icon: "📜" },
  { key: "ordinamento", label: "Ordinamento Carta",   icon: "📋" },
  { key: "locazioni",   label: "Locazioni Fisiche",   icon: "📍" },
  { key: "manutenzione",label: "Manutenzione",        icon: "🔧" },
];

// ===============================================================
// MAIN COMPONENT
// ===============================================================
export default function ViniImpostazioni() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAllowed = role === "admin" || role === "sommelier";

  const [activeSection, setActiveSection] = useState("import");

  // --- Sync / Import / Export ---
  const [syncResult, setSyncResult] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState("");
  const [forzaGiacenze, setForzaGiacenze] = useState(false);
  const [showCartaPreview, setShowCartaPreview] = useState(false);

  // --- Manutenzione ---
  const [cleanupResult, setCleanupResult] = useState(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  // --- Locazioni ---
  const [locConfig, setLocConfig] = useState(null);
  const [locCampo, setLocCampo] = useState("frigorifero");
  const [locValori, setLocValori] = useState(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locMapping, setLocMapping] = useState({});   // {vecchio_valore: nuovo_valore}
  const [locSaving, setLocSaving] = useState(false);
  const [locMsg, setLocMsg] = useState("");
  const [locEditMode, setLocEditMode] = useState(false);  // config vs normalizza
  const [locEditItem, setLocEditItem] = useState(null);    // item in editing
  const [locEditNome, setLocEditNome] = useState("");
  const [locEditSpaziText, setLocEditSpaziText] = useState(""); // "Fila 1, Fila 2, ..."
  const [locEditTipo, setLocEditTipo] = useState("standard"); // "standard" | "matrice"
  const [locEditRighe, setLocEditRighe] = useState("");
  const [locEditColonne, setLocEditColonne] = useState("");
  const [locConfigSaving, setLocConfigSaving] = useState(false);
  const [locExpandedVal, setLocExpandedVal] = useState(null);
  const [locViniDetail, setLocViniDetail] = useState([]);
  const [locViniLoading, setLocViniLoading] = useState(false);
  const [locViniEdits, setLocViniEdits] = useState({});
  const [locGiacenzaWarning, setLocGiacenzaWarning] = useState(null); // {vini, toApply} per conferma

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
  // FETCH
  // -------------------------------------------------------
  const fetchTipologie = useCallback(async () => {
    try { const r = await apiFetch(`${API_BASE}/settings/vini/tipologie`); if (r.ok) setTipologie((await r.json()).map(d => d.nome)); } catch {}
  }, []);
  const fetchNazioni = useCallback(async () => {
    try { const r = await apiFetch(`${API_BASE}/settings/vini/nazioni`); if (r.ok) setNazioni((await r.json()).map(d => d.nazione)); } catch {}
  }, []);
  const fetchRegioni = useCallback(async (naz) => {
    if (!naz) { setRegioni([]); return; }
    try { const r = await apiFetch(`${API_BASE}/settings/vini/regioni/${encodeURIComponent(naz)}`); if (r.ok) setRegioni(await r.json()); } catch {}
  }, []);
  const fetchFiltri = useCallback(async () => {
    try { const r = await apiFetch(`${API_BASE}/settings/vini/filtri`); if (r.ok) setFiltri(await r.json()); } catch {}
  }, []);
  const fetchLocConfig = useCallback(async () => {
    try { const r = await apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-config`); if (r.ok) setLocConfig(await r.json()); } catch {}
  }, []);

  useEffect(() => {
    if (activeSection === "ordinamento" && !showOrdinamento) setShowOrdinamento(true);
  }, [activeSection]);

  useEffect(() => {
    if (showOrdinamento) { fetchTipologie(); fetchNazioni(); fetchFiltri(); }
  }, [showOrdinamento, fetchTipologie, fetchNazioni, fetchFiltri]);

  useEffect(() => {
    if (selectedNazione) fetchRegioni(selectedNazione);
  }, [selectedNazione, fetchRegioni]);

  useEffect(() => {
    if (activeSection === "locazioni" && !locConfig) fetchLocConfig();
  }, [activeSection, locConfig, fetchLocConfig]);

  // -------------------------------------------------------
  // SALVA IMPOSTAZIONI
  // -------------------------------------------------------
  const flash = (msg) => { setSettingsMsg(msg); setTimeout(() => setSettingsMsg(""), 3000); };

  const saveTipologie = async () => {
    setSettingsLoading(true);
    try { const r = await apiFetch(`${API_BASE}/settings/vini/tipologie`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tipologie) });
      if (r.ok) flash("Ordine tipologie salvato"); else throw new Error();
    } catch { flash("Errore salvataggio tipologie"); } setSettingsLoading(false);
  };
  const saveNazioni = async () => {
    setSettingsLoading(true);
    try { const r = await apiFetch(`${API_BASE}/settings/vini/nazioni`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nazioni) });
      if (r.ok) flash("Ordine nazioni salvato"); else throw new Error();
    } catch { flash("Errore salvataggio nazioni"); } setSettingsLoading(false);
  };
  const saveRegioni = async () => {
    if (!selectedNazione) return; setSettingsLoading(true);
    try { const payload = regioni.map(r => ({ codice: r.codice, nome: r.nome }));
      const r = await apiFetch(`${API_BASE}/settings/vini/regioni/${encodeURIComponent(selectedNazione)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (r.ok) flash(`Ordine regioni ${selectedNazione} salvato`); else throw new Error();
    } catch { flash("Errore salvataggio regioni"); } setSettingsLoading(false);
  };
  const saveFiltri = async () => {
    setSettingsLoading(true);
    try { const r = await apiFetch(`${API_BASE}/settings/vini/filtri`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(filtri) });
      if (r.ok) flash("Filtri salvati"); else throw new Error();
    } catch { flash("Errore salvataggio filtri"); } setSettingsLoading(false);
  };

  // -------------------------------------------------------
  // HANDLERS OPERAZIONI
  // -------------------------------------------------------
  const handleSync = async () => {
    setSyncLoading(true); setError(""); setSyncResult(null);
    try { const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/sync-from-excel?forza_giacenze=${forzaGiacenze}`, { method: "POST" });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`); setSyncResult(await resp.json());
    } catch (e) { setError(e?.message || "Errore sincronizzazione."); } finally { setSyncLoading(false); }
  };
  const handleImportExcel = async (file) => {
    if (!file) return; setImportLoading(true); setError(""); setImportResult(null);
    try { const form = new FormData(); form.append("file", file);
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/import-excel`, { method: "POST", body: form });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`); setImportResult(await resp.json());
    } catch (e) { setError(e?.message || "Errore import."); } finally { setImportLoading(false); }
  };
  const handleExport = () => {
    const token = localStorage.getItem("token");
    window.open(`${API_BASE}/vini/cantina-tools/export-excel?token=${token}`, "_blank");
  };
  const handleResetAndReimport = async (file) => {
    if (!file) return;
    setResetLoading(true); setError(""); setResetResult(null); setImportResult(null);
    try { const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/reset-database`, { method: "POST" });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore reset: ${resp.status}`); setResetResult(await resp.json());
    } catch (e) { setError(e?.message || "Errore reset database."); setResetLoading(false); return; }
    setResetLoading(false); setImportLoading(true);
    try { const form = new FormData(); form.append("file", file);
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/import-excel`, { method: "POST", body: form });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore import: ${resp.status}`); setImportResult(await resp.json());
    } catch (e) { setError(e?.message || "Errore import dopo reset."); } finally { setImportLoading(false); }
  };
  const handleCleanupDuplicates = async (dryRun) => {
    setCleanupLoading(true); setError(""); setCleanupResult(null);
    try { const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/cleanup-duplicates?dry_run=${dryRun}`, { method: "POST" });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`); setCleanupResult(await resp.json());
    } catch (e) { setError(e?.message || "Errore pulizia duplicati."); } finally { setCleanupLoading(false); }
  };
  // --- Locazioni config CRUD ---
  const handleSaveLocItem = async () => {
    if (!locEditNome.trim()) { setError("Il nome è obbligatorio."); return; }
    if (locEditTipo === "matrice") {
      const r = parseInt(locEditRighe, 10);
      const c = parseInt(locEditColonne, 10);
      if (!r || !c || r < 1 || c < 1) { setError("Per una matrice, inserisci righe e colonne valide (>= 1)."); return; }
    } else {
      const spazi = locEditSpaziText.split(",").map(s => s.trim()).filter(Boolean);
      if (spazi.length === 0 && locEditSpaziText.trim() !== "") { setError("Formato spazi non valido."); return; }
    }
    setLocConfigSaving(true); setError("");
    try {
      const body = { nome: locEditNome.trim(), tipo: locEditTipo, ordine: 0 };
      if (locEditTipo === "matrice") {
        body.righe = parseInt(locEditRighe, 10);
        body.colonne = parseInt(locEditColonne, 10);
        body.spazi = [];
      } else {
        body.spazi = locEditSpaziText.split(",").map(s => s.trim()).filter(Boolean);
      }
      if (locEditItem?.id) body.id = locEditItem.id;
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-config/${locCampo}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`);
      setLocEditItem(null); setLocEditNome(""); setLocEditSpaziText("");
      setLocEditTipo("standard"); setLocEditRighe(""); setLocEditColonne("");
      fetchLocConfig(); // ricarica
    } catch (e) { setError(e?.message || "Errore salvataggio configurazione."); } finally { setLocConfigSaving(false); }
  };
  const handleDeleteLocItem = async (itemId) => {
    if (!window.confirm("Eliminare questa locazione dalla configurazione?")) return;
    setError("");
    try {
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-config/${locCampo}/${itemId}`, { method: "DELETE" });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`);
      fetchLocConfig();
    } catch (e) { setError(e?.message || "Errore eliminazione."); }
  };
  const startEditLocItem = (item) => {
    setLocEditItem(item);
    setLocEditNome(item.nome);
    setLocEditTipo(item.tipo || "standard");
    setLocEditRighe(item.righe ?? "");
    setLocEditColonne(item.colonne ?? "");
    setLocEditSpaziText(item.tipo === "matrice" ? "" : item.spazi.join(", "));
  };
  const startNewLocItem = () => {
    setLocEditItem({});
    setLocEditNome("");
    setLocEditTipo("standard");
    setLocEditRighe("");
    setLocEditColonne("");
    setLocEditSpaziText(locCampo === "frigorifero" ? "Fila 1, Fila 2, Fila 3" : "");
  };

  const handleEstraiValori = async (campo) => {
    setLocLoading(true); setError(""); setLocValori(null); setLocMapping({}); setLocMsg("");
    try {
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-valori/${campo}`);
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`);
      const data = await resp.json();
      setLocValori(data);
      // Pre-popola il mapping con i suggerimenti AI dove disponibili
      const initialMapping = {};
      for (const v of data.valori) {
        if (!v.ok && v.suggerimento) initialMapping[v.valore] = v.suggerimento;
      }
      setLocMapping(initialMapping);
    } catch (e) { setError(e?.message || "Errore estrazione valori."); } finally { setLocLoading(false); }
  };
  const SVUOTA = "__SVUOTA__";

  const _buildToApply = () => {
    const toApply = {};
    for (const [k, v] of Object.entries(locMapping)) {
      if (v === SVUOTA) toApply[k] = "";
      else if (v && v.trim()) toApply[k] = v.trim();
    }
    return toApply;
  };

  const _executeMapping = async (toApply) => {
    setLocSaving(true); setError(""); setLocMsg(""); setLocGiacenzaWarning(null);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-normalizza`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campo: locCampo, mapping: toApply }),
      });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`);
      const data = await resp.json();
      setLocMsg(data.msg);
      handleEstraiValori(locCampo);
    } catch (e) { setError(e?.message || "Errore applicazione mapping."); } finally { setLocSaving(false); }
  };

  const handleApplicaMapping = async () => {
    const toApply = _buildToApply();
    if (Object.keys(toApply).length === 0) { setLocMsg("Nessuna sostituzione da applicare."); return; }

    // Controlla se ci sono svuotamenti
    const valoriDaSvuotare = Object.entries(toApply).filter(([, v]) => v === "").map(([k]) => k);

    if (valoriDaSvuotare.length > 0) {
      // Pre-check giacenze
      try {
        const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-check-giacenze`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campo: locCampo, valori: valoriDaSvuotare }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.totale > 0) {
            // Mostra il pannello warning con i vini
            setLocGiacenzaWarning({ vini: data.vini_con_giacenza, toApply });
            return; // non procedere, aspetta conferma dall'utente
          }
        }
      } catch { /* se il check fallisce, procedi comunque con confirm */ }
    }

    // Nessun problema di giacenza: conferma semplice
    const svuotaCount = valoriDaSvuotare.length;
    const msg = svuotaCount > 0
      ? `Applicare ${Object.keys(toApply).length} sostituzioni (di cui ${svuotaCount} svuotamenti) nel campo ${locConfig?.fields?.[locCampo] || locCampo}?`
      : `Applicare ${Object.keys(toApply).length} sostituzioni nel campo ${locConfig?.fields?.[locCampo] || locCampo}?`;
    if (!window.confirm(msg)) return;
    _executeMapping(toApply);
  };

  const handleToggleViniDetail = async (valore) => {
    if (locExpandedVal === valore) { setLocExpandedVal(null); setLocViniDetail([]); setLocViniEdits({}); return; }
    setLocExpandedVal(valore); setLocViniLoading(true); setLocViniEdits({});
    try {
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-vini/${locCampo}?valore=${encodeURIComponent(valore)}`);
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setLocViniDetail(data.vini);
    } catch { setLocViniDetail([]); } finally { setLocViniLoading(false); }
  };
  const handleUpdateSingleVino = async (vinoId, nuovoValore) => {
    // Se si sta svuotando, controlla giacenza
    const realValue = nuovoValore === SVUOTA ? "" : nuovoValore;
    if (!realValue || realValue === "") {
      const vino = locViniDetail.find(v => v.id === vinoId);
      if (vino && vino.quantita > 0) {
        if (!window.confirm(`Attenzione: "${vino.descrizione}" ha giacenza ${vino.quantita} in questa locazione. Vuoi davvero svuotare la locazione?`)) return;
      }
    }
    try {
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-vino-update`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campo: locCampo, vino_id: vinoId, nuovo_valore: realValue }),
      });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`);
      // Ricarica dettaglio e valori
      handleToggleViniDetail(locExpandedVal);
      handleEstraiValori(locCampo);
      setLocMsg("Locazione aggiornata.");
    } catch (e) { setError(e?.message || "Errore aggiornamento."); }
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
          <p className="text-neutral-600 text-sm mb-4">Questa sezione è disponibile solo per amministratori e sommelier.</p>
          <button onClick={() => navigate("/vini")}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">← Menu Vini</button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // RENDER SECTIONS
  // -------------------------------------------------------

  const renderImportExport = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-amber-900 font-playfair">Import / Export</h2>

      {/* SYNC */}
      <div className="border border-neutral-200 rounded-xl p-5">
        <h3 className="font-semibold text-neutral-800 mb-2">Sincronizza Excel → Cantina</h3>
        <p className="text-sm text-neutral-600 mb-3">Prende i dati dal DB carta (vini.sqlite3) e li sincronizza nella cantina.</p>
        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={forzaGiacenze} onChange={e => setForzaGiacenze(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-300 text-amber-700 focus:ring-amber-500" />
            <span className="text-sm font-medium text-neutral-700">Forza aggiornamento giacenze</span>
          </label>
          {forzaGiacenze && <span className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded">Sovrascrive quantità</span>}
        </div>
        <button onClick={handleSync} disabled={syncLoading}
          className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${syncLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed" : forzaGiacenze ? "bg-red-700 text-white hover:bg-red-800" : "bg-amber-700 text-white hover:bg-amber-800"}`}>
          {syncLoading ? "Sincronizzazione…" : "Avvia sincronizzazione"}
        </button>
        {syncResult && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 text-sm">
            <p className="font-semibold text-green-800">{syncResult.msg}</p>
            <p className="text-green-700">Totale: <strong>{syncResult.totale_excel}</strong> — Nuovi: <strong>{syncResult.inseriti}</strong> — Aggiornati: <strong>{syncResult.aggiornati}</strong></p>
          </div>
        )}
      </div>

      {/* IMPORT / EXPORT / RESET */}
      <div className="border border-neutral-200 rounded-xl p-5">
        <h3 className="font-semibold text-neutral-800 mb-2">Import / Export diretto</h3>
        <p className="text-sm text-neutral-600 mb-3">Import diretto di un Excel nella cantina, oppure esporta per lavorare offline.</p>
        <div className="flex flex-wrap gap-3">
          <label className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition cursor-pointer text-center ${importLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
            {importLoading ? "Importazione…" : "Importa Excel"}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleImportExcel(e.target.files?.[0])} disabled={importLoading} />
          </label>
          <button onClick={handleExport}
            className="px-5 py-2 rounded-xl text-sm font-semibold border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 shadow transition">
            Esporta Excel
          </button>
          <label className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition cursor-pointer text-center ${resetLoading || importLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed" : "bg-red-600 text-white hover:bg-red-700"}`}>
            {resetLoading ? "Reset…" : importLoading ? "Importazione…" : "Azzera e Ricarica"}
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const file = e.target.files?.[0]; if (file && window.confirm("ATTENZIONE: Cancellerà TUTTI i vini, movimenti e note, poi importerà il file Excel.\n\nContinuare?")) handleResetAndReimport(file); e.target.value = ""; }}
              disabled={resetLoading || importLoading} />
          </label>
        </div>
        {resetResult && <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">{resetResult.msg}</div>}
        {importResult && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 text-sm">
            <p className="font-semibold text-green-800">{importResult.msg}</p>
            <p className="text-green-700">Righe: <strong>{importResult.righe_excel}</strong> — Nuovi: <strong>{importResult.inseriti}</strong> — Aggiornati: <strong>{importResult.aggiornati}</strong></p>
          </div>
        )}
      </div>
    </div>
  );

  const renderCarta = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-amber-900 font-playfair">Genera Carta dei Vini</h2>
      <p className="text-sm text-neutral-600">Genera la carta dei vini dal database cantina con le impostazioni correnti.</p>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => setShowCartaPreview(p => !p)}
          className="px-5 py-2 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow transition">
          {showCartaPreview ? "Chiudi anteprima" : "Anteprima HTML"}
        </button>
        <button onClick={() => { const token = localStorage.getItem("token"); window.open(`${API_BASE}/vini/cantina-tools/carta-cantina/pdf?token=${token}`, "_blank"); }}
          className="px-5 py-2 rounded-xl text-sm font-semibold border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow transition">
          Scarica PDF
        </button>
        <button onClick={() => { const token = localStorage.getItem("token"); window.open(`${API_BASE}/vini/cantina-tools/carta-cantina/docx?token=${token}`, "_blank"); }}
          className="px-5 py-2 rounded-xl text-sm font-semibold border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow transition">
          Scarica Word
        </button>
      </div>
      {showCartaPreview && (
        <div className="border border-neutral-200 rounded-2xl overflow-hidden">
          <iframe src={`${API_BASE}/vini/cantina-tools/carta-cantina`} title="Carta Vini da Cantina"
            className="w-full" style={{ height: "70vh", border: "none" }} />
        </div>
      )}
    </div>
  );

  const renderOrdinamento = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-amber-900 font-playfair">Ordinamento Carta</h2>
      <p className="text-sm text-neutral-600">Ordine di tipologie, nazioni, regioni e filtri per la generazione della carta.</p>

      {settingsMsg && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">{settingsMsg}</div>}

      {!showOrdinamento ? (
        <button onClick={() => setShowOrdinamento(true)}
          className="px-5 py-2 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow transition">
          Carica impostazioni
        </button>
      ) : (
        <div className="space-y-5">
          {/* TIPOLOGIE */}
          <div className="border border-neutral-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-neutral-800">Ordine Tipologie</h3>
              <button onClick={saveTipologie} disabled={settingsLoading}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">Salva</button>
            </div>
            {tipologie.length > 0 ? <OrderList items={tipologie} onReorder={setTipologie} /> : <p className="text-sm text-neutral-400">Caricamento…</p>}
          </div>

          {/* NAZIONI */}
          <div className="border border-neutral-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-neutral-800">Ordine Nazioni</h3>
              <button onClick={saveNazioni} disabled={settingsLoading}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">Salva</button>
            </div>
            {nazioni.length > 0 ? <OrderList items={nazioni} onReorder={setNazioni} /> : <p className="text-sm text-neutral-400">Caricamento…</p>}
          </div>

          {/* REGIONI */}
          <div className="border border-neutral-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-neutral-800">Ordine Regioni</h3>
              <button onClick={saveRegioni} disabled={settingsLoading || !selectedNazione}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">Salva</button>
            </div>
            <select value={selectedNazione} onChange={e => setSelectedNazione(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-amber-500 focus:border-amber-500 mb-3">
              <option value="">— Seleziona nazione —</option>
              {nazioni.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {selectedNazione && regioni.length > 0 ? <OrderList items={regioni} labelKey="nome" onReorder={setRegioni} />
              : selectedNazione ? <p className="text-sm text-neutral-400">Caricamento…</p>
              : <p className="text-sm text-neutral-400">Seleziona una nazione.</p>}
          </div>

          {/* FILTRI */}
          <div className="border border-neutral-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-neutral-800">Filtri Carta</h3>
              <button onClick={saveFiltri} disabled={settingsLoading}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">Salva</button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm text-neutral-700 w-48">Quantità minima stampa:</label>
                <input type="number" value={filtri.min_qta_stampa}
                  onChange={e => setFiltri(f => ({ ...f, min_qta_stampa: parseInt(e.target.value) || 0 }))}
                  className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm w-20 focus:ring-amber-500 focus:border-amber-500" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={filtri.mostra_negativi} onChange={e => setFiltri(f => ({ ...f, mostra_negativi: e.target.checked }))}
                  className="w-4 h-4 rounded border-neutral-300 text-amber-700 focus:ring-amber-500" />
                <span className="text-sm text-neutral-700">Mostra vini con giacenza negativa</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={filtri.mostra_senza_prezzo} onChange={e => setFiltri(f => ({ ...f, mostra_senza_prezzo: e.target.checked }))}
                  className="w-4 h-4 rounded border-neutral-300 text-amber-700 focus:ring-amber-500" />
                <span className="text-sm text-neutral-700">Mostra vini senza prezzo</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const LOC_TABS = [
    { key: "frigorifero", label: "Frigorifero", icon: "🧊" },
    { key: "locazione_1", label: "Locazione 1", icon: "📦" },
    { key: "locazione_2", label: "Locazione 2", icon: "📦" },
  ];
  const currentLocItems = locConfig?.[locCampo] || [];
  const currentOpzioni = locValori?.opzioni_valide || (locCampo === "frigorifero" ? locConfig?.opzioni_frigo : []) || [];
  const pendingMappings = locValori ? locValori.valori.filter(v => locMapping[v.valore] === SVUOTA || (locMapping[v.valore]?.trim())).length : 0;

  const renderLocazioni = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-amber-900 font-playfair">Locazioni Fisiche</h2>
      <p className="text-sm text-neutral-600">
        Configura le locazioni per ogni campo, poi normalizza i valori esistenti nel database.
      </p>

      {/* TAB SELEZIONE CAMPO */}
      <div className="flex gap-1 border-b border-neutral-200">
        {LOC_TABS.map(tab => (
          <button key={tab.key}
            onClick={() => { setLocCampo(tab.key); setLocValori(null); setLocMapping({}); setLocMsg(""); setLocEditItem(null); }}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              locCampo === tab.key
                ? "border-amber-700 text-amber-900 bg-amber-50/50"
                : "border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
            }`}>
            <span className="mr-1.5">{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      {/* MESSAGGIO */}
      {locMsg && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">{locMsg}</div>}

      {/* SUB-TAB: Configura / Normalizza */}
      <div className="flex gap-2">
        <button onClick={() => setLocEditMode(false)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition ${!locEditMode ? "bg-amber-100 text-amber-900 shadow-sm" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
          Configura locazioni
        </button>
        <button onClick={() => setLocEditMode(true)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition ${locEditMode ? "bg-amber-100 text-amber-900 shadow-sm" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
          Normalizza valori
        </button>
      </div>

      {/* ============ CONFIGURA ============ */}
      {!locEditMode && (
        <div className="space-y-4">
          {/* LOCAZIONI CONFIGURATE */}
          {currentLocItems.length > 0 ? (
            <div className="space-y-2">
              {currentLocItems.map(item => (
                <div key={item.id} className="border border-neutral-200 rounded-xl p-4 bg-neutral-50 flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-semibold text-neutral-800 text-sm">
                      {item.nome}
                      {item.tipo === "matrice" && (
                        <span className="ml-2 px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 rounded-full uppercase">
                          Matrice {item.righe}×{item.colonne}
                        </span>
                      )}
                    </div>
                    {item.tipo === "matrice" ? (
                      <div className="mt-2">
                        <p className="text-xs text-neutral-500">
                          {item.righe * item.colonne} celle — da ({1},{1}) a ({item.righe},{item.colonne})
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.spazi.map(spazio => (
                            <span key={spazio} className="px-2.5 py-1 text-xs font-medium bg-white border border-neutral-200 rounded-lg text-neutral-700">
                              {spazio}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-neutral-500 mt-1">
                          {item.spazi.length === 0 ? "Spazio unico (nessun sotto-spazio)" : `${item.spazi.length} spazi configurati`}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEditLocItem(item)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 transition">
                      Modifica
                    </button>
                    <button onClick={() => handleDeleteLocItem(item.id)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition">
                      Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-neutral-50 border border-dashed border-neutral-300 rounded-xl p-6 text-center text-sm text-neutral-500">
              Nessuna locazione configurata per {locConfig?.fields?.[locCampo] || locCampo}.
            </div>
          )}

          {/* FORM AGGIUNGI/MODIFICA */}
          {locEditItem !== null ? (
            <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/50">
              <h4 className="font-semibold text-neutral-800 text-sm mb-3">
                {locEditItem?.id ? `Modifica "${locEditItem.nome}"` : "Aggiungi nuova locazione"}
              </h4>
              <div className="space-y-3">
                {/* TIPO LOCAZIONE */}
                <div>
                  <label className="text-xs font-medium text-neutral-600 mb-1 block">Tipo</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setLocEditTipo("standard")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                        locEditTipo === "standard" ? "bg-amber-100 border-amber-300 text-amber-800" : "bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                      }`}>Standard</button>
                    <button type="button" onClick={() => setLocEditTipo("matrice")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                        locEditTipo === "matrice" ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                      }`}>Matrice (griglia)</button>
                  </div>
                </div>
                {/* NOME */}
                <div>
                  <label className="text-xs font-medium text-neutral-600 mb-1 block">Nome</label>
                  <input type="text" value={locEditNome} onChange={e => setLocEditNome(e.target.value)}
                    placeholder={locEditTipo === "matrice" ? "Es. Matrice" : "Es. Frigo 1, Scaffale A, Cantina..."}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-amber-500 focus:border-amber-500" />
                </div>
                {/* SPAZI (standard) O RIGHE/COLONNE (matrice) */}
                {locEditTipo === "matrice" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-neutral-600 mb-1 block">Righe</label>
                      <input type="number" min="1" value={locEditRighe} onChange={e => setLocEditRighe(e.target.value)}
                        placeholder="Es. 10"
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-amber-500 focus:border-amber-500" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-neutral-600 mb-1 block">Colonne</label>
                      <input type="number" min="1" value={locEditColonne} onChange={e => setLocEditColonne(e.target.value)}
                        placeholder="Es. 8"
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-amber-500 focus:border-amber-500" />
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-neutral-500">
                        {locEditRighe && locEditColonne
                          ? `Genera ${parseInt(locEditRighe)||0} × ${parseInt(locEditColonne)||0} = ${(parseInt(locEditRighe)||0) * (parseInt(locEditColonne)||0)} celle. Es. "${locEditNome || "Matrice"} - (1,1)", "${locEditNome || "Matrice"} - (${locEditRighe},${locEditColonne})"`
                          : `Ogni cella sarà "${locEditNome || "Matrice"} - (riga,colonna)"`
                        }
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-neutral-600 mb-1 block">
                      Spazi (separati da virgola) — lascia vuoto per locazione senza sotto-spazi
                    </label>
                    <input type="text" value={locEditSpaziText} onChange={e => setLocEditSpaziText(e.target.value)}
                      placeholder="Es. Fila 1, Fila 2, Fila 3, Fila 4..."
                      className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-amber-500 focus:border-amber-500" />
                    <p className="text-xs text-neutral-500 mt-1">
                      {locEditSpaziText.trim()
                        ? `Ogni spazio diventa un'opzione: "${locEditNome || "Nome"} - ${locEditSpaziText.split(",")[0]?.trim() || "Fila 1"}"`
                        : `Senza spazi, il valore sarà solo "${locEditNome || "Nome"}"`
                      }
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={handleSaveLocItem} disabled={locConfigSaving}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold shadow transition ${locConfigSaving ? "bg-neutral-300 text-neutral-500" : "bg-amber-700 text-white hover:bg-amber-800"}`}>
                    {locConfigSaving ? "Salvataggio…" : locEditItem?.id ? "Salva modifiche" : "Aggiungi"}
                  </button>
                  <button onClick={() => { setLocEditItem(null); setLocEditNome(""); setLocEditSpaziText(""); setLocEditTipo("standard"); setLocEditRighe(""); setLocEditColonne(""); }}
                    className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-white hover:bg-neutral-50 transition">
                    Annulla
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={startNewLocItem}
              className="px-4 py-2 rounded-xl text-sm font-semibold border-2 border-dashed border-amber-300 text-amber-700 hover:bg-amber-50 transition w-full">
              + Aggiungi locazione
            </button>
          )}
        </div>
      )}

      {/* ============ NORMALIZZA ============ */}
      {locEditMode && (
        <div className="space-y-4">
          {/* ESTRAI VALORI */}
          <div className="flex items-center gap-3">
            <button onClick={() => handleEstraiValori(locCampo)} disabled={locLoading}
              className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${locLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed" : "bg-amber-700 text-white hover:bg-amber-800"}`}>
              {locLoading ? "Caricamento…" : `Estrai valori`}
            </button>
            {locValori && (
              <span className="text-xs text-neutral-500">
                {locValori.totale_distinti} valori distinti, {locValori.totale_record} record totali
              </span>
            )}
          </div>

          {currentOpzioni.length === 0 && !locLoading && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
              Nessuna locazione configurata. Vai alla tab "Configura locazioni" per definire gli spazi validi prima di normalizzare.
            </div>
          )}

          {/* TABELLA VALORI CON MAPPING */}
          {locValori && locValori.valori.length > 0 && (
            <div className="border border-neutral-200 rounded-xl overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-neutral-100">
                    <tr className="text-neutral-700 text-xs">
                      <th className="border-b border-neutral-200 px-3 py-2 text-left">Valore nel DB</th>
                      <th className="border-b border-neutral-200 px-2 py-2 text-center w-16">N.</th>
                      <th className="border-b border-neutral-200 px-3 py-2 text-left">Sostituisci con</th>
                      <th className="border-b border-neutral-200 px-2 py-2 text-center w-16">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locValori.valori.map((v, i) => (
                      <React.Fragment key={i}>
                        <tr className={`border-b border-neutral-100 ${v.ok ? "bg-green-50/50" : ""} ${locExpandedVal === v.valore ? "bg-amber-50/50" : ""}`}>
                          <td className="px-3 py-2">
                            <button onClick={() => handleToggleViniDetail(v.valore)}
                              className="font-mono text-xs text-left hover:text-amber-700 hover:underline transition flex items-center gap-1.5 w-full">
                              <span className={`text-[10px] transition-transform ${locExpandedVal === v.valore ? "rotate-90" : ""}`}>▶</span>
                              {v.valore}
                            </button>
                          </td>
                          <td className="px-2 py-2 text-center text-xs text-neutral-500 font-medium">{v.conteggio}</td>
                          <td className="px-3 py-2">
                            {currentOpzioni.length > 0 ? (
                              <select
                                value={locMapping[v.valore] || ""}
                                onChange={e => setLocMapping(m => ({ ...m, [v.valore]: e.target.value }))}
                                className={`w-full border rounded-lg px-2 py-1.5 text-xs bg-white focus:ring-amber-500 focus:border-amber-500 ${v.ok && !locMapping[v.valore] ? "border-green-300" : "border-neutral-300"}`}>
                                <option value="">{v.ok ? "✓ Corretto — non modificare" : "— Non modificare —"}</option>
                                <option value={SVUOTA} className="text-red-600">✕ Svuota locazione</option>
                                {currentOpzioni.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <div className="flex gap-1">
                                <input type="text" value={locMapping[v.valore] === SVUOTA ? "" : (locMapping[v.valore] || "")}
                                  onChange={e => setLocMapping(m => ({ ...m, [v.valore]: e.target.value }))}
                                  placeholder={v.ok ? "Corretto — cambia se necessario" : "Valore normalizzato…"}
                                  className="flex-1 border border-neutral-300 rounded-lg px-2 py-1.5 text-xs focus:ring-amber-500 focus:border-amber-500" />
                                <button onClick={() => setLocMapping(m => ({ ...m, [v.valore]: SVUOTA }))}
                                  title="Svuota locazione"
                                  className={`px-2 py-1 rounded-lg text-xs border transition ${locMapping[v.valore] === SVUOTA ? "bg-red-100 border-red-300 text-red-700" : "border-neutral-300 text-neutral-500 hover:bg-red-50"}`}>
                                  ✕
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {locMapping[v.valore] === SVUOTA ? <span className="text-red-500 text-base">✕</span>
                              : locMapping[v.valore]?.trim() ? <span className="text-amber-600 text-base">→</span>
                              : v.ok ? <span className="text-green-600 text-base">✓</span>
                              : <span className="text-neutral-300 text-base">–</span>}
                          </td>
                        </tr>
                        {/* RIGA ESPANSA: dettaglio vini */}
                        {locExpandedVal === v.valore && (
                          <tr>
                            <td colSpan={4} className="p-0">
                              <div className="bg-neutral-50 border-t border-b border-amber-200 px-4 py-3">
                                {locViniLoading ? (
                                  <p className="text-xs text-neutral-500">Caricamento vini…</p>
                                ) : locViniDetail.length === 0 ? (
                                  <p className="text-xs text-neutral-500">Nessun vino trovato.</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    <p className="text-xs font-semibold text-neutral-700 mb-2">
                                      {locViniDetail.length} vin{locViniDetail.length === 1 ? "o" : "i"} con "{v.valore}":
                                    </p>
                                    {locViniDetail.map(vino => (
                                      <div key={vino.id} className="flex items-center gap-2 bg-white border border-neutral-200 rounded-lg px-3 py-2 text-xs">
                                        <div className="flex-1 min-w-0">
                                          <span className="font-medium text-neutral-800 truncate block">
                                            {vino.descrizione}
                                          </span>
                                          <span className="text-neutral-500">
                                            {vino.produttore}{vino.annata ? ` · ${vino.annata}` : ""}{vino.formato ? ` · ${vino.formato}` : ""}
                                            {vino.quantita != null ? ` · Qta: ${vino.quantita}` : ""}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          {currentOpzioni.length > 0 ? (
                                            <select
                                              value={locViniEdits[vino.id] ?? vino.locazione ?? ""}
                                              onChange={e => setLocViniEdits(ed => ({ ...ed, [vino.id]: e.target.value }))}
                                              className="border border-neutral-300 rounded-lg px-2 py-1 text-xs bg-white w-48">
                                              <option value={SVUOTA} className="text-red-600">✕ Svuota locazione</option>
                                              {currentOpzioni.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                              ))}
                                            </select>
                                          ) : (
                                            <input type="text"
                                              value={(locViniEdits[vino.id] ?? vino.locazione) === SVUOTA ? "" : (locViniEdits[vino.id] ?? vino.locazione ?? "")}
                                              onChange={e => setLocViniEdits(ed => ({ ...ed, [vino.id]: e.target.value }))}
                                              placeholder="Vuoto = rimuovi"
                                              className="border border-neutral-300 rounded-lg px-2 py-1 text-xs w-48" />
                                          )}
                                          {locViniEdits[vino.id] !== undefined && locViniEdits[vino.id] !== vino.locazione && (
                                            <button onClick={() => handleUpdateSingleVino(vino.id, locViniEdits[vino.id])}
                                              className={`px-2 py-1 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                                                locViniEdits[vino.id] === SVUOTA
                                                  ? "bg-red-600 text-white hover:bg-red-700"
                                                  : "bg-blue-600 text-white hover:bg-blue-700"
                                              }`}>
                                              {locViniEdits[vino.id] === SVUOTA ? "Svuota" : "Salva"}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* WARNING GIACENZE */}
              {locGiacenzaWarning && (
                <div className="border-t border-red-300 bg-red-50 px-4 py-4">
                  <div className="flex items-start gap-2 mb-3">
                    <span className="text-lg">⚠️</span>
                    <div>
                      <p className="text-sm font-semibold text-red-800">
                        Attenzione: {locGiacenzaWarning.vini.length} vin{locGiacenzaWarning.vini.length === 1 ? "o ha" : "i hanno"} ancora giacenza in questa locazione
                      </p>
                      <p className="text-xs text-red-700 mt-0.5">Svuotando la locazione, questi vini perderanno il riferimento alla posizione fisica.</p>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto mb-3 space-y-1">
                    {locGiacenzaWarning.vini.map(vino => (
                      <div key={vino.id} className="flex items-center justify-between bg-white border border-red-200 rounded-lg px-3 py-1.5 text-xs">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-neutral-800">{vino.descrizione}</span>
                          <span className="text-neutral-500 ml-1">
                            {vino.produttore}{vino.annata ? ` · ${vino.annata}` : ""}
                          </span>
                        </div>
                        <div className="shrink-0 ml-2 flex items-center gap-2">
                          <span className="text-xs text-neutral-500">{vino.locazione}</span>
                          <span className="font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">Qta: {vino.quantita}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => _executeMapping(locGiacenzaWarning.toApply)}
                      disabled={locSaving}
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 shadow transition">
                      {locSaving ? "Applicazione…" : "Procedi comunque"}
                    </button>
                    <button onClick={() => setLocGiacenzaWarning(null)}
                      className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-white hover:bg-neutral-50 transition">
                      Annulla
                    </button>
                  </div>
                </div>
              )}

              {/* APPLICA */}
              {!locGiacenzaWarning && (
                <div className="bg-neutral-50 border-t border-neutral-200 px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-neutral-600">
                    {pendingMappings > 0
                      ? `${pendingMappings} sostituzion${pendingMappings === 1 ? "e" : "i"} da applicare`
                      : "Nessuna sostituzione impostata"}
                  </span>
                  <button onClick={handleApplicaMapping} disabled={locSaving || pendingMappings === 0}
                    className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
                      locSaving || pendingMappings === 0
                        ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}>
                    {locSaving ? "Salvataggio…" : `Applica ${pendingMappings} sostituzion${pendingMappings === 1 ? "e" : "i"}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {locValori && locValori.valori.length === 0 && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 text-sm text-neutral-500 text-center">
              Nessun valore trovato nel campo {locConfig?.fields?.[locCampo] || locCampo}.
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderManutenzione = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-amber-900 font-playfair">Manutenzione</h2>
      <p className="text-sm text-neutral-600">Strumenti di pulizia e manutenzione del database cantina.</p>

      <div className="border border-neutral-200 rounded-xl p-5">
        <h3 className="font-semibold text-neutral-800 mb-2">Pulizia duplicati</h3>
        <p className="text-sm text-neutral-600 mb-3">Trova e rimuove vini duplicati (stessa descrizione, produttore, annata e formato).</p>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => handleCleanupDuplicates(true)} disabled={cleanupLoading}
            className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${cleanupLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed" : "bg-amber-700 text-white hover:bg-amber-800"}`}>
            {cleanupLoading ? "Analisi…" : "Analizza duplicati"}
          </button>
          {cleanupResult?.gruppi_duplicati > 0 && cleanupResult.dry_run && (
            <button onClick={() => { if (window.confirm(`Eliminare ${cleanupResult.vini_da_eliminare} duplicati?`)) handleCleanupDuplicates(false); }}
              disabled={cleanupLoading}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 shadow transition">
              Elimina {cleanupResult.vini_da_eliminare} duplicati
            </button>
          )}
        </div>
        {cleanupResult && (
          <div className={`mt-3 rounded-xl p-4 text-sm border ${cleanupResult.gruppi_duplicati === 0 ? "bg-green-50 border-green-200" : cleanupResult.dry_run ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"}`}>
            <p className={`font-semibold mb-2 ${cleanupResult.gruppi_duplicati === 0 ? "text-green-800" : cleanupResult.dry_run ? "text-yellow-800" : "text-green-800"}`}>{cleanupResult.msg}</p>
            {cleanupResult.duplicati?.length > 0 && (
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-xs border-collapse">
                  <thead><tr className="bg-neutral-100 text-neutral-700">
                    <th className="border border-neutral-200 px-2 py-1 text-left">Descrizione</th>
                    <th className="border border-neutral-200 px-2 py-1 text-left">Produttore</th>
                    <th className="border border-neutral-200 px-2 py-1">Annata</th>
                    <th className="border border-neutral-200 px-2 py-1">Copie</th>
                  </tr></thead>
                  <tbody>{cleanupResult.duplicati.map((d, i) => (
                    <tr key={i} className="hover:bg-yellow-50">
                      <td className="border border-neutral-200 px-2 py-1">{d.descrizione}</td>
                      <td className="border border-neutral-200 px-2 py-1">{d.produttore}</td>
                      <td className="border border-neutral-200 px-2 py-1 text-center">{d.annata}</td>
                      <td className="border border-neutral-200 px-2 py-1 text-center font-semibold text-red-600">x{d.copie}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const sectionRenderers = {
    import: renderImportExport,
    carta: renderCarta,
    ordinamento: renderOrdinamento,
    locazioni: renderLocazioni,
    manutenzione: renderManutenzione,
  };

  // -------------------------------------------------------
  // RENDER MAIN
  // -------------------------------------------------------
  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <ViniNav current="settings" />
      <div className="max-w-6xl mx-auto p-4 sm:p-6">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair">
              Impostazioni Vini
            </h1>
            <p className="text-neutral-600 mt-1">Configurazione, import/export, ordinamento e manutenzione.</p>
          </div>
          <div className="flex gap-2 items-start">
            <button onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">Cantina</button>
            <button onClick={() => navigate("/vini/magazzino/registro")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">Registro</button>
          </div>
        </div>

        {/* ERRORE GLOBALE */}
        {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}

        {/* SIDEBAR + CONTENT */}
        <div className="flex flex-col md:flex-row gap-6">

          {/* SIDEBAR */}
          <nav className="md:w-56 shrink-0">
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
              {MENU.map(item => (
                <button key={item.key} onClick={() => setActiveSection(item.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-left transition border-l-3 ${
                    activeSection === item.key
                      ? "bg-amber-50 text-amber-900 border-l-amber-700"
                      : "text-neutral-600 hover:bg-neutral-50 border-l-transparent hover:text-neutral-800"
                  }`}>
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* CONTENT */}
          <main className="flex-1 bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm min-h-[500px]">
            {sectionRenderers[activeSection]?.()}
          </main>

        </div>
      </div>
    </div>
  );
}
