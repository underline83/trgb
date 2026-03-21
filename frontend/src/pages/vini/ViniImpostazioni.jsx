// @version: v3.0-sidebar-layout
// Impostazioni Modulo Vini — Layout sidebar + contenuto
// Visibile solo per admin e sommelier

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ViniNav from "./ViniNav";
import {
  STATO_VENDITA, STATO_RIORDINO, STATO_CONSERVAZIONE,
} from "../../config/viniConstants";

// ---------------------------------------------------------------
// COMPONENTE LISTA RIORDINABILE
// ---------------------------------------------------------------
function OrderList({ items, labelKey, onReorder, onRemove, onAdd, addPlaceholder, uppercase = true }) {
  const [newVal, setNewVal] = useState("");
  const move = (idx, dir) => {
    const arr = [...items];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    onReorder(arr);
  };
  const handleAdd = () => {
    const v = uppercase ? newVal.trim().toUpperCase() : newVal.trim();
    if (!v || !onAdd) return;
    onAdd(v);
    setNewVal("");
  };
  return (
    <div className="space-y-1">
      {items.map((item, idx) => {
        const label = typeof item === "string" ? item : item[labelKey];
        return (
          <div key={label || idx}
            className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm">
            <span className="text-neutral-400 font-mono text-xs w-5 text-right">{idx + 1}</span>
            <span className="flex-1 font-medium text-neutral-800">{label}</span>
            <button onClick={() => move(idx, -1)} disabled={idx === 0}
              className="px-1.5 py-0.5 text-xs rounded hover:bg-neutral-200 disabled:opacity-30 transition">▲</button>
            <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1}
              className="px-1.5 py-0.5 text-xs rounded hover:bg-neutral-200 disabled:opacity-30 transition">▼</button>
            {onRemove && <button onClick={() => { if (window.confirm(`Rimuovere "${label}"?`)) onRemove(idx); }}
              className="px-1.5 py-0.5 text-xs rounded text-red-500 hover:bg-red-50 transition">✕</button>}
          </div>
        );
      })}
      {onAdd && (
        <div className="flex items-center gap-2 mt-2">
          <input type="text" value={newVal} onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder={addPlaceholder || "Nuovo valore…"}
            className="flex-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:ring-amber-500 focus:border-amber-500" />
          <button onClick={handleAdd} disabled={!newVal.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition disabled:opacity-40">+ Aggiungi</button>
        </div>
      )}
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
  { key: "markup",      label: "Markup Prezzi",       icon: "💰" },
  { key: "locazioni",   label: "Locazioni Fisiche",   icon: "📍" },
  { key: "stati",       label: "Stati",               icon: "🏷️" },
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
  // --- Backup ---
  const [backupList, setBackupList] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg, setBackupMsg] = useState(null);

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
  const [locNormCampo, setLocNormCampo] = useState("locazione_1"); // sotto-campo per normalizzazione loc1/loc2
  // --- Migrazione matrice ---
  const [matriceOldValues, setMatriceOldValues] = useState(null);
  const [matriceLoading, setMatriceLoading] = useState(false);
  const [matriceImportResult, setMatriceImportResult] = useState(null);
  const [locGiacenzaWarning, setLocGiacenzaWarning] = useState(null); // {vini, toApply} per conferma

  // --- Impostazioni ordinamento ---
  const [tipologie, setTipologie] = useState([]);
  const [nazioni, setNazioni] = useState([]);
  const [selectedNazione, setSelectedNazione] = useState("");
  const [regioni, setRegioni] = useState([]);
  const [formatiList, setFormatiList] = useState([]);
  const [filtri, setFiltri] = useState({ min_qta_stampa: 1, mostra_negativi: false, mostra_senza_prezzo: false });
  const [settingsMsg, setSettingsMsg] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [showOrdinamento, setShowOrdinamento] = useState(false);

  // --- Markup Prezzi ---
  const [markupBP, setMarkupBP] = useState(null);  // [{costo, moltiplicatore}, ...]
  const [markupLoading, setMarkupLoading] = useState(false);
  const [markupSaving, setMarkupSaving] = useState(false);
  const [markupMsg, setMarkupMsg] = useState("");
  const [markupNewCosto, setMarkupNewCosto] = useState("");
  const [markupNewMolt, setMarkupNewMolt] = useState("");
  const [markupPreviewCosto, setMarkupPreviewCosto] = useState("");
  const [markupPreviewResult, setMarkupPreviewResult] = useState(null);
  const [markupRecalcResult, setMarkupRecalcResult] = useState(null);
  const [markupRecalcing, setMarkupRecalcing] = useState(false);

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
  const fetchFormati = useCallback(async () => {
    try { const r = await apiFetch(`${API_BASE}/settings/vini/formati`); if (r.ok) setFormatiList(await r.json()); } catch {}
  }, []);
  const fetchLocConfig = useCallback(async () => {
    try { const r = await apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-config`); if (r.ok) setLocConfig(await r.json()); } catch {}
  }, []);

  useEffect(() => {
    if (activeSection === "ordinamento" && !showOrdinamento) setShowOrdinamento(true);
  }, [activeSection]);

  useEffect(() => {
    if (showOrdinamento) { fetchTipologie(); fetchNazioni(); fetchFiltri(); fetchFormati(); }
  }, [showOrdinamento, fetchTipologie, fetchNazioni, fetchFiltri, fetchFormati]);

  useEffect(() => {
    if (selectedNazione) fetchRegioni(selectedNazione);
  }, [selectedNazione, fetchRegioni]);

  useEffect(() => {
    if (activeSection === "locazioni" && !locConfig) fetchLocConfig();
  }, [activeSection, locConfig, fetchLocConfig]);

  // Carica markup breakpoints quando la sezione è attiva
  const fetchMarkupBP = useCallback(async () => {
    setMarkupLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/pricing/breakpoints`);
      if (r.ok) { const d = await r.json(); setMarkupBP(d.breakpoints || []); }
    } catch {} finally { setMarkupLoading(false); }
  }, []);

  useEffect(() => {
    if (activeSection === "markup" && !markupBP) fetchMarkupBP();
  }, [activeSection, markupBP, fetchMarkupBP]);

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
  const saveFormati = async () => {
    setSettingsLoading(true);
    try { const r = await apiFetch(`${API_BASE}/settings/vini/formati`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formatiList) });
      if (r.ok) flash("Ordine formati salvato"); else throw new Error();
    } catch { flash("Errore salvataggio formati"); } setSettingsLoading(false);
  };

  // -------------------------------------------------------
  // HANDLERS OPERAZIONI
  // -------------------------------------------------------
  // handleSync rimosso in v3.0 (vecchio sync eliminato)
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

  // --- Migrazione matrice ---
  const handleMatriceScan = async () => {
    setMatriceLoading(true); setMatriceOldValues(null); setMatriceImportResult(null);
    try {
      const r = await apiFetch(`${API_BASE}/vini/cantina-tools/matrice/old-values`);
      if (r.ok) setMatriceOldValues(await r.json());
      else setError("Errore caricamento valori matrice");
    } catch { setError("Errore caricamento valori matrice"); }
    setMatriceLoading(false);
  };
  const handleMatriceImport = async () => {
    if (!window.confirm("Importare tutti i valori matrice trovati nel nuovo sistema? I vecchi campi verranno puliti.")) return;
    setMatriceLoading(true); setMatriceImportResult(null);
    try {
      const r = await apiFetch(`${API_BASE}/vini/cantina-tools/matrice/import-old`, { method: "POST" });
      if (r.ok) {
        const data = await r.json();
        setMatriceImportResult(data);
        setMatriceOldValues(null);
        fetchLocConfig();
      } else setError("Errore importazione matrice");
    } catch { setError("Errore importazione matrice"); }
    setMatriceLoading(false);
  };

  // --- Backup ---
  const fetchBackups = async () => {
    setBackupLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/cantina-tools/backup/list`);
      if (r.ok) { const d = await r.json(); setBackupList(d.backups || []); }
    } catch {} finally { setBackupLoading(false); }
  };
  const handleCreateBackup = async () => {
    setBackupLoading(true); setBackupMsg(null);
    try {
      const r = await apiFetch(`${API_BASE}/vini/cantina-tools/backup/create`, { method: "POST" });
      if (r.ok) { const d = await r.json(); setBackupMsg({ ok: true, text: `Backup creato (${d.timestamp})` }); fetchBackups(); }
      else throw new Error("Errore creazione backup");
    } catch (e) { setBackupMsg({ ok: false, text: e.message }); } finally { setBackupLoading(false); }
  };
  const handleRestoreBackup = async (ts) => {
    if (!window.confirm(`Ripristinare il backup del ${ts}? Verrà creato un backup di sicurezza dello stato attuale.`)) return;
    setBackupLoading(true); setBackupMsg(null);
    try {
      const r = await apiFetch(`${API_BASE}/vini/cantina-tools/backup/restore/${ts}`, { method: "POST" });
      if (r.ok) { const d = await r.json(); setBackupMsg({ ok: true, text: d.msg }); fetchBackups(); }
      else throw new Error("Errore ripristino");
    } catch (e) { setBackupMsg({ ok: false, text: e.message }); } finally { setBackupLoading(false); }
  };
  const handleDeleteBackup = async (ts) => {
    if (!window.confirm(`Eliminare definitivamente il backup del ${ts}?`)) return;
    setBackupLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/cantina-tools/backup/${ts}`, { method: "DELETE" });
      if (r.ok) { setBackupMsg({ ok: true, text: "Backup eliminato" }); fetchBackups(); }
    } catch {} finally { setBackupLoading(false); }
  };

  // carica backups quando si apre la sezione manutenzione
  useEffect(() => { if (activeSection === "manutenzione") fetchBackups(); }, [activeSection]);

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
        body: JSON.stringify({ campo: effectiveCampo, mapping: toApply }),
      });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`);
      const data = await resp.json();
      setLocMsg(data.msg);
      handleEstraiValori(effectiveCampo);
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
          body: JSON.stringify({ campo: effectiveCampo, valori: valoriDaSvuotare }),
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
      ? `Applicare ${Object.keys(toApply).length} sostituzioni (di cui ${svuotaCount} svuotamenti) nel campo ${locConfig?.fields?.[effectiveCampo] || effectiveCampo}?`
      : `Applicare ${Object.keys(toApply).length} sostituzioni nel campo ${locConfig?.fields?.[effectiveCampo] || effectiveCampo}?`;
    if (!window.confirm(msg)) return;
    _executeMapping(toApply);
  };

  const handleToggleViniDetail = async (valore) => {
    if (locExpandedVal === valore) { setLocExpandedVal(null); setLocViniDetail([]); setLocViniEdits({}); return; }
    setLocExpandedVal(valore); setLocViniLoading(true); setLocViniEdits({});
    try {
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-vini/${effectiveCampo}?valore=${encodeURIComponent(valore)}`);
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
        body: JSON.stringify({ campo: effectiveCampo, vino_id: vinoId, nuovo_valore: realValue }),
      });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || `Errore: ${resp.status}`);
      // Ricarica dettaglio e valori
      handleToggleViniDetail(locExpandedVal);
      handleEstraiValori(effectiveCampo);
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

      {/* Sezione sync rimossa in v3.0 — vecchio DB eliminato */}

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
            {tipologie.length > 0 ? <OrderList items={tipologie} onReorder={setTipologie}
              onAdd={v => { if (!tipologie.includes(v)) setTipologie(t => [...t, v]); }}
              onRemove={idx => setTipologie(t => t.filter((_, i) => i !== idx))}
              addPlaceholder="Nuova tipologia…" /> : <p className="text-sm text-neutral-400">Caricamento…</p>}
          </div>

          {/* NAZIONI */}
          <div className="border border-neutral-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-neutral-800">Ordine Nazioni</h3>
              <button onClick={saveNazioni} disabled={settingsLoading}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">Salva</button>
            </div>
            {nazioni.length > 0 ? <OrderList items={nazioni} onReorder={setNazioni}
              onAdd={v => { if (!nazioni.includes(v)) setNazioni(n => [...n, v]); }}
              onRemove={idx => setNazioni(n => n.filter((_, i) => i !== idx))}
              addPlaceholder="Nuova nazione…" uppercase={false} /> : <p className="text-sm text-neutral-400">Caricamento…</p>}
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
            {selectedNazione ? (
              <>
                <OrderList items={regioni} labelKey="nome" onReorder={setRegioni}
                  onAdd={v => {
                    if (regioni.some(r => r.nome === v)) return;
                    const code = `${selectedNazione.slice(0,2)}${String(regioni.length + 1).padStart(2, "0")}`;
                    setRegioni(prev => [...prev, { codice: code, nome: v }]);
                  }}
                  onRemove={idx => setRegioni(prev => prev.filter((_, i) => i !== idx))}
                  addPlaceholder="Nuova regione…" uppercase={false} />
                {regioni.length === 0 && <p className="text-sm text-neutral-400 mt-1">Nessuna regione per {selectedNazione}. Usa il campo sopra per aggiungerne.</p>}
              </>
            ) : <p className="text-sm text-neutral-400">Seleziona una nazione.</p>}
          </div>

          {/* FORMATI */}
          <div className="border border-neutral-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-neutral-800">Formati Bottiglia</h3>
              <button onClick={saveFormati} disabled={settingsLoading}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50">Salva</button>
            </div>
            <OrderList
              items={formatiList.map(f => typeof f === "string" ? f : `${f.formato} — ${f.descrizione || ""}${f.litri ? ` (${f.litri}L)` : ""}`)}
              onReorder={(reordered) => {
                // Ricostruisci gli oggetti dall'ordine dei label
                const idxMap = reordered.map(label => {
                  const code = label.split(" — ")[0].trim();
                  return formatiList.findIndex(f => (typeof f === "string" ? f : f.formato) === code);
                });
                setFormatiList(idxMap.map(i => formatiList[i]));
              }}
              onAdd={v => {
                if (formatiList.some(f => (typeof f === "string" ? f : f.formato) === v)) return;
                setFormatiList(f => [...f, { formato: v, descrizione: "", litri: 0, ordine: f.length + 1 }]);
              }}
              onRemove={idx => setFormatiList(f => f.filter((_, i) => i !== idx))}
              addPlaceholder="Nuovo codice formato (es. BT, MG)…" />
            {formatiList.length === 0 && <p className="text-sm text-neutral-400 mt-1">Nessun formato configurato. Usa il campo sopra per aggiungerne.</p>}
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
    { key: "locazione_1", label: "Locazione 1 & 2", icon: "📦" },
    { key: "locazione_3", label: "Matrice", icon: "🔲" },
  ];
  const currentLocItems = locConfig?.[locCampo] || [];
  // Campo effettivo per normalizzazione: se siamo su locazione_1 (tab unificata), usa locNormCampo
  const effectiveCampo = locCampo === "locazione_1" ? locNormCampo : locCampo;
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
                          {item.righe * item.colonne} celle — da (1,1) a ({item.colonne},{item.righe})
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

          {/* PANNELLO MIGRAZIONE MATRICE */}
          {locCampo === "locazione_3" && (
            <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-blue-900 text-sm">Migrazione dati matrice</h4>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Cerca valori matrice (es. "Matrice (6,7)") in tutte le locazioni e li importa nel nuovo sistema a griglia.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={handleMatriceScan} disabled={matriceLoading}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 bg-white text-blue-800 hover:bg-blue-100 transition disabled:opacity-50">
                    {matriceLoading ? "Caricamento..." : "Cerca valori vecchi"}
                  </button>
                </div>
              </div>

              {/* Risultati scan */}
              {matriceOldValues && (
                <div className="space-y-2">
                  {matriceOldValues.length === 0 ? (
                    <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      Nessun valore matrice trovato nei vecchi campi. Tutto a posto!
                    </div>
                  ) : (
                    <>
                      <div className="text-xs font-medium text-blue-800">
                        Trovati {matriceOldValues.length} vini con valori matrice da migrare:
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-1">
                        {matriceOldValues.map(v => (
                          <div key={v.id} className="text-xs bg-white border border-blue-100 rounded-lg px-3 py-2">
                            <span className="font-medium text-neutral-800">#{v.id}</span>
                            <span className="text-neutral-600 ml-2">{v.descrizione}</span>
                            {v.ha_celle_matrice && (
                              <span className="ml-2 text-amber-600 font-medium">
                                (già {v.celle_in_tabella} celle nel nuovo sistema — skip)
                              </span>
                            )}
                            <div className="mt-1 text-neutral-500">
                              {Object.entries(v.campi_con_matrice).map(([campo, info]) => (
                                <div key={campo}>
                                  <span className="font-medium">{campo}:</span> "{info.valore}"
                                  <span className="ml-1 text-neutral-400">(qta: {info.qta ?? "null"})</span>
                                  {info.coordinate.length > 0 && (
                                    <span className="ml-1 text-blue-600">→ celle parsate: {info.coordinate.join(", ")}</span>
                                  )}
                                  {info.coordinate.length === 0 && (
                                    <span className="ml-1 text-red-500">→ nessuna coordinata trovata!</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <button onClick={handleMatriceImport} disabled={matriceLoading}
                        className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50">
                        {matriceLoading ? "Importazione..." : `Importa ${matriceOldValues.filter(v => !v.ha_celle_matrice).length} vini nel nuovo sistema`}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Risultato import */}
              {matriceImportResult && (
                <div className="text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2 space-y-1">
                  <div className="font-medium text-green-800">
                    Migrazione completata: {matriceImportResult.importati} vini importati, {matriceImportResult.skipped} già presenti.
                  </div>
                  {matriceImportResult.dettagli?.length > 0 && (
                    <div className="text-green-700 mt-1">
                      {matriceImportResult.dettagli.map(d => (
                        <div key={d.vino_id}>
                          #{d.vino_id} {d.descrizione} — {d.celle_importate} celle da {d.campi_originali.join(", ")}
                        </div>
                      ))}
                    </div>
                  )}
                  {matriceImportResult.errori?.length > 0 && (
                    <div className="text-red-600 mt-1">
                      Errori: {matriceImportResult.errori.map(e => `#${e.vino_id}: ${e.errori_celle?.join(", ") || e.motivo}`).join("; ")}
                    </div>
                  )}
                </div>
              )}
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
                          ? `Genera ${parseInt(locEditRighe)||0} × ${parseInt(locEditColonne)||0} = ${(parseInt(locEditRighe)||0) * (parseInt(locEditColonne)||0)} celle. Es. "${locEditNome || "Matrice"} - (1,1)", "${locEditNome || "Matrice"} - (${locEditColonne},${locEditRighe})"`
                          : `Ogni cella sarà "${locEditNome || "Matrice"} - (colonna,riga)"`
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
          {/* Sotto-selettore loc1/loc2 quando siamo sulla tab unificata */}
          {locCampo === "locazione_1" && (
            <div className="flex gap-2">
              {[
                { key: "locazione_1", label: "Locazione 1" },
                { key: "locazione_2", label: "Locazione 2" },
              ].map(sub => (
                <button key={sub.key}
                  onClick={() => { setLocNormCampo(sub.key); setLocValori(null); setLocMapping({}); setLocMsg(""); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    locNormCampo === sub.key
                      ? "bg-amber-200 text-amber-900 shadow-sm"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}>
                  {sub.label}
                </button>
              ))}
            </div>
          )}
          {/* ESTRAI VALORI */}
          <div className="flex items-center gap-3">
            <button onClick={() => handleEstraiValori(locCampo === "locazione_1" ? locNormCampo : locCampo)} disabled={locLoading}
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
              Nessun valore trovato nel campo {locConfig?.fields?.[effectiveCampo] || effectiveCampo}.
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

      {/* ── BACKUP / RIPRISTINO ── */}
      <div className="border border-emerald-200 rounded-xl p-5 bg-emerald-50/30">
        <h3 className="font-semibold text-emerald-900 mb-2">Backup e Ripristino</h3>
        <p className="text-sm text-neutral-600 mb-3">Crea copie di sicurezza del database e ripristina versioni precedenti.</p>
        <div className="flex flex-wrap gap-3 mb-4">
          <button onClick={handleCreateBackup} disabled={backupLoading}
            className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${backupLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed" : "bg-emerald-700 text-white hover:bg-emerald-800"}`}>
            {backupLoading ? "In corso…" : "Crea backup adesso"}
          </button>
        </div>
        {backupMsg && (
          <div className={`mb-4 rounded-lg p-3 text-sm border ${backupMsg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
            {backupMsg.text}
          </div>
        )}
        {backupList.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Backup disponibili</h4>
            {backupList.map(b => (
              <div key={b.timestamp} className="flex items-center justify-between bg-white border border-neutral-200 rounded-lg px-4 py-2.5">
                <div>
                  <span className="text-sm font-medium text-neutral-800">{b.date}</span>
                  <span className="ml-3 text-xs text-neutral-400">
                    {b.files.map(f => `${f.base} (${f.size_kb} KB)`).join(" + ")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleRestoreBackup(b.timestamp)} disabled={backupLoading}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-40">
                    Ripristina
                  </button>
                  <button onClick={() => handleDeleteBackup(b.timestamp)} disabled={backupLoading}
                    className="px-3 py-1 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition disabled:opacity-40">
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-400 italic">Nessun backup disponibile.</p>
        )}
      </div>

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

  const renderStatiBlock = (title, statiObj) => (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Object.entries(statiObj).map(([code, cfg]) => (
          <div key={code} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${cfg.color}`}>
            <span className={`w-3 h-3 rounded-full shrink-0 ${cfg.dot}`}></span>
            <span className="font-bold text-sm w-6">{cfg.short}</span>
            <span className="text-sm">{cfg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderStati = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-amber-900 font-playfair">Legenda Stati</h2>
      <p className="text-sm text-neutral-600">
        Codici utilizzati per classificare i vini. Modificabili dalla scheda di ogni vino.
      </p>
      {renderStatiBlock("Stato Vendita", STATO_VENDITA)}
      {renderStatiBlock("Stato Riordino", STATO_RIORDINO)}
      {renderStatiBlock("Stato Conservazione", STATO_CONSERVAZIONE)}
    </div>
  );

  // -------------------------------------------------------
  // MARKUP PREZZI — handler
  // -------------------------------------------------------
  const markupFlash = (msg) => { setMarkupMsg(msg); setTimeout(() => setMarkupMsg(""), 5000); };

  const saveMarkupBP = async () => {
    if (!markupBP || markupBP.length < 2) return;
    setMarkupSaving(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/pricing/breakpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(markupBP),
      });
      if (r.ok) markupFlash("Tabella salvata");
      else throw new Error(`Errore ${r.status}`);
    } catch (e) { markupFlash(`Errore: ${e.message}`); }
    finally { setMarkupSaving(false); }
  };

  const resetMarkupBP = async () => {
    if (!window.confirm("Ripristinare la tabella ai valori predefiniti?")) return;
    try {
      const r = await apiFetch(`${API_BASE}/vini/pricing/breakpoints/reset`, { method: "POST" });
      if (r.ok) { fetchMarkupBP(); markupFlash("Tabella ripristinata ai default"); }
    } catch {}
  };

  const addMarkupRow = () => {
    const c = parseFloat(markupNewCosto);
    const m = parseFloat(markupNewMolt);
    if (isNaN(c) || isNaN(m) || c < 0 || m <= 0) return;
    const updated = [...(markupBP || []), { costo: c, moltiplicatore: m }]
      .sort((a, b) => a.costo - b.costo);
    setMarkupBP(updated);
    setMarkupNewCosto(""); setMarkupNewMolt("");
  };

  const removeMarkupRow = (idx) => {
    setMarkupBP(prev => prev.filter((_, i) => i !== idx));
  };

  const updateMarkupRow = (idx, field, value) => {
    setMarkupBP(prev => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], [field]: parseFloat(value) || 0 };
      return arr;
    });
  };

  const previewMarkupCalc = async () => {
    const val = parseFloat(markupPreviewCosto);
    if (!val || val <= 0) return;
    try {
      const r = await apiFetch(`${API_BASE}/vini/pricing/calcola`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ euro_listino: val }),
      });
      if (r.ok) setMarkupPreviewResult(await r.json());
    } catch {}
  };

  // Ricalcola calici
  const [caliciLoading, setCaliciLoading] = useState(false);
  const [caliciResult, setCaliciResult] = useState(null);
  const ricalcolaCalici = async () => {
    setCaliciLoading(true); setCaliciResult(null);
    try {
      const r = await apiFetch(`${API_BASE}/vini/pricing/ricalcola-calici`, {
        method: "POST", headers: { "Content-Type": "application/json" },
      });
      if (r.ok) setCaliciResult(await r.json());
      else { const e = await r.json().catch(() => ({})); markupFlash(`Errore: ${e.detail || r.status}`); }
    } catch (e) { markupFlash(`Errore: ${e.message}`); }
    finally { setCaliciLoading(false); }
  };

  // Step 1: anteprima (GET preview, non salva nulla)
  const [markupPreviewList, setMarkupPreviewList] = useState(null);
  const [markupPreviewLoading, setMarkupPreviewLoading] = useState(false);
  const [markupSoloSenzaPrezzo, setMarkupSoloSenzaPrezzo] = useState(false);
  // Sorting per tabella anteprima
  const [mkSortKey, setMkSortKey] = useState(null);
  const [mkSortDir, setMkSortDir] = useState("asc");
  // Selezione checkbox per ricalcolo selettivo
  const [mkSelected, setMkSelected] = useState(new Set());
  // Vini a cui flaggare FORZA_PREZZO durante ricalcolo
  const [mkForzaPrezzo, setMkForzaPrezzo] = useState(new Set());

  const handleMkSort = (key) => {
    if (mkSortKey === key) setMkSortDir(d => d === "asc" ? "desc" : "asc");
    else { setMkSortKey(key); setMkSortDir("asc"); }
  };
  const MkSortIcon = ({ col }) => {
    if (mkSortKey !== col) return <span className="text-neutral-300 ml-0.5">↕</span>;
    return <span className="text-amber-600 ml-0.5">{mkSortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const anteprimaRicalcolo = async (soloSenza = false) => {
    setMarkupPreviewLoading(true); setMarkupPreviewList(null); setMarkupRecalcResult(null);
    setMarkupSoloSenzaPrezzo(soloSenza);
    setMkSelected(new Set()); setMkForzaPrezzo(new Set());
    setMkSortKey(null); setMkSortDir("asc");
    try {
      const qs = soloSenza ? "?solo_senza_prezzo=true" : "";
      const r = await apiFetch(`${API_BASE}/vini/pricing/preview${qs}`);
      if (r.ok) {
        const data = await r.json();
        setMarkupPreviewList(data);
      }
    } catch (e) { markupFlash(`Errore: ${e.message}`); }
    finally { setMarkupPreviewLoading(false); }
  };

  // Step 2: applica (POST ricalcola-tutti, salva nel DB)
  const applicaRicalcolo = async () => {
    setMarkupRecalcing(true); setMarkupRecalcResult(null);
    try {
      const body = {
        solo_senza_prezzo: markupSoloSenzaPrezzo,
      };
      if (mkSelected.size > 0) body.ids = [...mkSelected];
      if (mkForzaPrezzo.size > 0) body.forza_prezzo_ids = [...mkForzaPrezzo];
      const r = await apiFetch(`${API_BASE}/vini/pricing/ricalcola-tutti`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const data = await r.json();
        setMarkupRecalcResult(data);
        setMarkupPreviewList(null);
      }
    } catch (e) { markupFlash(`Errore: ${e.message}`); }
    finally { setMarkupRecalcing(false); }
  };

  // -------------------------------------------------------
  // MARKUP PREZZI — render
  // -------------------------------------------------------
  const renderMarkup = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-amber-900 font-playfair">Markup Prezzi</h2>
          <p className="text-sm text-neutral-600 mt-1">
            Tabella breakpoint per il calcolo automatico del PREZZO_CARTA dal costo listino.
            Il moltiplicatore viene interpolato linearmente tra i breakpoint adiacenti,
            poi il risultato viene arrotondato al multiplo di 0,50 piu vicino.
          </p>
        </div>
      </div>

      {/* Messaggi */}
      {markupMsg && (
        <div className={`text-sm font-semibold px-3 py-2 rounded-lg ${markupMsg.startsWith("Errore") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {markupMsg}
        </div>
      )}

      {markupLoading ? (
        <p className="text-neutral-500 text-sm">Caricamento...</p>
      ) : markupBP ? (
        <>
          {/* Tabella breakpoint */}
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="px-3 py-2 text-left font-semibold text-neutral-600 w-12">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-neutral-600">Costo listino</th>
                  <th className="px-3 py-2 text-left font-semibold text-neutral-600">Moltiplicatore</th>
                  <th className="px-3 py-2 text-right font-semibold text-neutral-600">Prezzo risultante</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {markupBP.map((bp, idx) => (
                  <tr key={idx} className="border-b border-neutral-100 hover:bg-amber-50/30">
                    <td className="px-3 py-1.5 text-neutral-400 font-mono text-xs">{idx + 1}</td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="0.01" value={bp.costo}
                        onChange={e => updateMarkupRow(idx, "costo", e.target.value)}
                        className="w-28 border border-neutral-300 rounded px-2 py-1 text-sm focus:ring-amber-400 focus:border-amber-400" />
                      <span className="text-neutral-400 ml-1 text-xs">EUR</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="0.001" value={bp.moltiplicatore}
                        onChange={e => updateMarkupRow(idx, "moltiplicatore", e.target.value)}
                        className="w-24 border border-neutral-300 rounded px-2 py-1 text-sm focus:ring-amber-400 focus:border-amber-400" />
                      <span className="text-neutral-400 ml-1 text-xs">x</span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-neutral-700">
                      {bp.costo > 0 ? `${(Math.round(bp.costo * bp.moltiplicatore * 2) / 2).toFixed(2)} EUR` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button onClick={() => removeMarkupRow(idx)}
                        className="text-red-400 hover:text-red-600 text-xs font-bold" title="Rimuovi">x</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Aggiungi riga */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-neutral-500 font-medium">Aggiungi:</span>
            <input type="number" step="0.01" placeholder="Costo" value={markupNewCosto}
              onChange={e => setMarkupNewCosto(e.target.value)}
              className="w-24 border border-neutral-300 rounded px-2 py-1.5 text-sm focus:ring-amber-400" />
            <input type="number" step="0.001" placeholder="Molt." value={markupNewMolt}
              onChange={e => setMarkupNewMolt(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addMarkupRow()}
              className="w-24 border border-neutral-300 rounded px-2 py-1.5 text-sm focus:ring-amber-400" />
            <button onClick={addMarkupRow} disabled={!markupNewCosto || !markupNewMolt}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40">
              + Aggiungi
            </button>
          </div>

          {/* Bottoni salva / reset */}
          <div className="flex items-center gap-3 pt-2 border-t border-neutral-200">
            <button onClick={saveMarkupBP} disabled={markupSaving}
              className="px-5 py-2 bg-amber-700 text-white rounded-xl font-semibold hover:bg-amber-800 transition disabled:opacity-40 shadow-sm">
              {markupSaving ? "Salvataggio..." : "Salva tabella"}
            </button>
            <button onClick={resetMarkupBP}
              className="px-4 py-2 text-sm border border-neutral-300 rounded-xl hover:bg-neutral-50 transition">
              Ripristina default
            </button>
          </div>

          {/* Simulatore */}
          <div className="mt-4 p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
            <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Simulatore prezzo</h3>
            <div className="flex items-center gap-3">
              <input type="number" step="0.01" placeholder="Costo listino EUR" value={markupPreviewCosto}
                onChange={e => setMarkupPreviewCosto(e.target.value)}
                onKeyDown={e => e.key === "Enter" && previewMarkupCalc()}
                className="w-40 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-amber-400" />
              <button onClick={previewMarkupCalc}
                className="px-4 py-2 bg-neutral-700 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 transition">
                Calcola
              </button>
              {markupPreviewResult && (
                <span className="text-sm font-medium text-neutral-700">
                  x{markupPreviewResult.moltiplicatore?.toFixed(3)} = <span className="text-lg font-bold text-amber-800">{markupPreviewResult.prezzo_carta?.toFixed(2)} EUR</span>
                </span>
              )}
            </div>
          </div>

          {/* Ricalcola calici */}
          <div className="mt-4 p-4 bg-violet-50 border border-violet-200 rounded-xl space-y-3">
            <h3 className="text-sm font-semibold text-violet-800 uppercase tracking-wide">Ricalcolo prezzi calice</h3>
            <p className="text-xs text-violet-700">
              Ricalcola PREZZO_CALICE = PREZZO_CARTA / 5 per tutti i vini in modalità automatica.
              I vini con prezzo calice manuale non vengono toccati.
            </p>
            <div className="flex items-center gap-3">
              <button onClick={ricalcolaCalici} disabled={caliciLoading}
                className="px-5 py-2 bg-violet-700 text-white rounded-xl font-semibold hover:bg-violet-800 transition disabled:opacity-40 shadow-sm">
                {caliciLoading ? "Calcolo..." : "Ricalcola tutti i calici"}
              </button>
              {caliciResult && (
                <button onClick={() => setCaliciResult(null)} className="px-3 py-1.5 text-xs border border-neutral-300 rounded-lg hover:bg-neutral-50">Chiudi</button>
              )}
            </div>
            {caliciResult && (
              <div className="text-sm space-y-1 p-3 bg-white border border-violet-200 rounded-lg">
                <p className="font-semibold text-violet-700">{caliciResult.aggiornati} prezzi calice aggiornati</p>
                <p className="text-neutral-600">
                  {caliciResult.invariati} invariati, {caliciResult.manuali_skip} manuali (non toccati), {caliciResult.senza_prezzo} senza prezzo carta
                </p>
                {caliciResult.dettaglio?.length > 0 && (
                  <div className="mt-2 max-h-[200px] overflow-y-auto border border-neutral-200 rounded bg-neutral-50">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-neutral-100">
                        <tr>
                          <th className="px-2 py-1 text-left">Vino</th>
                          <th className="px-2 py-1 text-right">Carta</th>
                          <th className="px-2 py-1 text-right">Calice prima</th>
                          <th className="px-2 py-1 text-right">Calice nuovo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caliciResult.dettaglio.map(d => (
                          <tr key={d.id} className="border-t border-neutral-100">
                            <td className="px-2 py-0.5 truncate max-w-[200px]">{d.DESCRIZIONE}</td>
                            <td className="px-2 py-0.5 text-right font-mono">{d.PREZZO_CARTA?.toFixed(2)}</td>
                            <td className="px-2 py-0.5 text-right font-mono text-neutral-400">{d.vecchio?.toFixed(2) ?? "—"}</td>
                            <td className="px-2 py-0.5 text-right font-mono font-semibold text-violet-700">{d.nuovo?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Ricalcola tutti — step 1: anteprima, step 2: applica */}
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
            <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wide">Ricalcolo massivo</h3>
            <p className="text-xs text-amber-700">
              Ricalcola PREZZO_CARTA per tutti i vini che hanno EURO_LISTINO impostato.
              Prima viene mostrata un'anteprima di tutte le modifiche, poi puoi confermare.
            </p>

            {/* Bottoni anteprima */}
            {!markupPreviewList && !markupRecalcResult && (
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => anteprimaRicalcolo(true)} disabled={markupPreviewLoading}
                  className="px-5 py-2 bg-emerald-700 text-white rounded-xl font-semibold hover:bg-emerald-800 transition disabled:opacity-40 shadow-sm">
                  {markupPreviewLoading && markupSoloSenzaPrezzo ? "Calcolo..." : "Calcola solo vini senza prezzo"}
                </button>
                <button onClick={() => anteprimaRicalcolo(false)} disabled={markupPreviewLoading}
                  className="px-5 py-2 bg-amber-700 text-white rounded-xl font-semibold hover:bg-amber-800 transition disabled:opacity-40 shadow-sm">
                  {markupPreviewLoading && !markupSoloSenzaPrezzo ? "Calcolo..." : "Ricalcola tutti i prezzi"}
                </button>
              </div>
            )}

            {/* Tabella anteprima */}
            {markupPreviewList && (
              <div className="space-y-3">
                {(() => {
                  const conModifiche = markupPreviewList.filter(d => d.differenza !== null && d.differenza !== 0);
                  const forzati = markupPreviewList.filter(d => d.FORZA_PREZZO);
                  const senzaListino = markupPreviewList.filter(d => !d.EURO_LISTINO || d.EURO_LISTINO <= 0);
                  const invariati = markupPreviewList.filter(d => d.EURO_LISTINO > 0 && (d.differenza === null || d.differenza === 0) && !d.FORZA_PREZZO);

                  // Sorting
                  const sorted = [...conModifiche].sort((a, b) => {
                    if (!mkSortKey) return 0;
                    let va, vb;
                    switch (mkSortKey) {
                      case "id": va = a.id; vb = b.id; break;
                      case "desc": va = (a.DESCRIZIONE || "").toLowerCase(); vb = (b.DESCRIZIONE || "").toLowerCase(); break;
                      case "prod": va = (a.PRODUTTORE || "").toLowerCase(); vb = (b.PRODUTTORE || "").toLowerCase(); break;
                      case "listino": va = a.EURO_LISTINO || 0; vb = b.EURO_LISTINO || 0; break;
                      case "attuale": va = a.PREZZO_CARTA_ATTUALE || 0; vb = b.PREZZO_CARTA_ATTUALE || 0; break;
                      case "nuovo": va = a.PREZZO_CARTA_NUOVO || 0; vb = b.PREZZO_CARTA_NUOVO || 0; break;
                      case "diff": va = a.differenza || 0; vb = b.differenza || 0; break;
                      default: return 0;
                    }
                    if (va < vb) return mkSortDir === "asc" ? -1 : 1;
                    if (va > vb) return mkSortDir === "asc" ? 1 : -1;
                    return 0;
                  });

                  const allIds = conModifiche.map(d => d.id);
                  const allSelected = allIds.length > 0 && allIds.every(id => mkSelected.has(id));
                  const toggleAll = () => {
                    if (allSelected) setMkSelected(new Set());
                    else setMkSelected(new Set(allIds));
                  };
                  const toggleOne = (id) => {
                    setMkSelected(prev => {
                      const s = new Set(prev);
                      s.has(id) ? s.delete(id) : s.add(id);
                      return s;
                    });
                  };
                  const toggleForza = (id) => {
                    setMkForzaPrezzo(prev => {
                      const s = new Set(prev);
                      s.has(id) ? s.delete(id) : s.add(id);
                      return s;
                    });
                  };

                  const countToApply = mkSelected.size > 0 ? mkSelected.size : conModifiche.length;

                  return (
                    <>
                      <div className="flex items-center gap-4 text-sm flex-wrap">
                        <span className="font-semibold text-amber-800">{conModifiche.length} vini da aggiornare</span>
                        <span className="text-neutral-500">{invariati.length} invariati</span>
                        <span className="text-neutral-400">{senzaListino.length} senza listino</span>
                        {forzati.length > 0 && <span className="text-rose-600 font-semibold">{forzati.length} con forza prezzo</span>}
                        {mkSelected.size > 0 && <span className="text-sky-700 font-semibold">{mkSelected.size} selezionati</span>}
                        {mkForzaPrezzo.size > 0 && <span className="text-rose-600 font-semibold">{mkForzaPrezzo.size} da forzare</span>}
                      </div>

                      {conModifiche.length > 0 && (
                        <div className="max-h-[400px] overflow-y-auto border border-neutral-200 rounded-lg bg-white">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-neutral-100 z-10">
                              <tr>
                                <th className="px-2 py-1.5 w-8">
                                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                                    className="accent-amber-600" title="Seleziona tutti" />
                                </th>
                                <th className="px-2 py-1.5 text-left font-semibold cursor-pointer hover:text-amber-700 select-none" onClick={() => handleMkSort("id")}>
                                  ID<MkSortIcon col="id" />
                                </th>
                                <th className="px-2 py-1.5 text-left font-semibold cursor-pointer hover:text-amber-700 select-none" onClick={() => handleMkSort("desc")}>
                                  Vino<MkSortIcon col="desc" />
                                </th>
                                <th className="px-2 py-1.5 text-left font-semibold cursor-pointer hover:text-amber-700 select-none" onClick={() => handleMkSort("prod")}>
                                  Produttore<MkSortIcon col="prod" />
                                </th>
                                <th className="px-2 py-1.5 text-right font-semibold cursor-pointer hover:text-amber-700 select-none" onClick={() => handleMkSort("listino")}>
                                  Listino<MkSortIcon col="listino" />
                                </th>
                                <th className="px-2 py-1.5 text-right font-semibold cursor-pointer hover:text-amber-700 select-none" onClick={() => handleMkSort("attuale")}>
                                  Attuale<MkSortIcon col="attuale" />
                                </th>
                                <th className="px-2 py-1.5 text-right font-semibold cursor-pointer hover:text-amber-700 select-none" onClick={() => handleMkSort("nuovo")}>
                                  Nuovo<MkSortIcon col="nuovo" />
                                </th>
                                <th className="px-2 py-1.5 text-right font-semibold cursor-pointer hover:text-amber-700 select-none" onClick={() => handleMkSort("diff")}>
                                  Diff.<MkSortIcon col="diff" />
                                </th>
                                <th className="px-2 py-1.5 text-center font-semibold" title="Forza Prezzo">FP</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sorted.map(d => {
                                const isForzato = d.FORZA_PREZZO || mkForzaPrezzo.has(d.id);
                                return (
                                  <tr key={d.id} className={`border-t border-neutral-100 ${isForzato ? "bg-rose-50" : "hover:bg-amber-50/40"}`}>
                                    <td className="px-2 py-1 text-center">
                                      <input type="checkbox" checked={mkSelected.has(d.id)} onChange={() => toggleOne(d.id)}
                                        className="accent-amber-600" />
                                    </td>
                                    <td className="px-2 py-1 text-neutral-400 font-mono">{d.id}</td>
                                    <td className="px-2 py-1 max-w-[180px] truncate" title={d.DESCRIZIONE}>{d.DESCRIZIONE}</td>
                                    <td className="px-2 py-1 max-w-[120px] truncate text-neutral-500">{d.PRODUTTORE || "—"}</td>
                                    <td className="px-2 py-1 text-right font-mono">{d.EURO_LISTINO?.toFixed(2)}</td>
                                    <td className="px-2 py-1 text-right font-mono text-neutral-400">{d.PREZZO_CARTA_ATTUALE?.toFixed(2) ?? "—"}</td>
                                    <td className="px-2 py-1 text-right font-mono font-semibold text-amber-800">{d.PREZZO_CARTA_NUOVO?.toFixed(2)}</td>
                                    <td className={`px-2 py-1 text-right font-mono font-semibold ${d.differenza > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                      {d.differenza > 0 ? "+" : ""}{d.differenza?.toFixed(2)}
                                    </td>
                                    <td className="px-2 py-1 text-center">
                                      <input type="checkbox" checked={isForzato} onChange={() => !d.FORZA_PREZZO && toggleForza(d.id)}
                                        disabled={!!d.FORZA_PREZZO}
                                        className="accent-rose-600" title={d.FORZA_PREZZO ? "Forza Prezzo attivo (dal DB)" : "Segna come Forza Prezzo"} />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Vini con FORZA_PREZZO attivo — evidenziati */}
                      {forzati.length > 0 && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                          <h4 className="text-xs font-semibold text-rose-700 uppercase mb-2">Vini con Forza Prezzo attivo (non verranno aggiornati)</h4>
                          <div className="max-h-[200px] overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-rose-200">
                                  <th className="px-2 py-1 text-left font-semibold text-rose-700">Vino</th>
                                  <th className="px-2 py-1 text-right font-semibold text-rose-700">Prezzo attuale</th>
                                  <th className="px-2 py-1 text-right font-semibold text-rose-700">Prezzo calcolato</th>
                                  <th className="px-2 py-1 text-right font-semibold text-rose-700">Differenza</th>
                                </tr>
                              </thead>
                              <tbody>
                                {forzati.map(d => (
                                  <tr key={d.id} className="border-t border-rose-100">
                                    <td className="px-2 py-1" title={d.DESCRIZIONE}>{d.DESCRIZIONE}</td>
                                    <td className="px-2 py-1 text-right font-mono">{d.PREZZO_CARTA_ATTUALE?.toFixed(2) ?? "—"}</td>
                                    <td className="px-2 py-1 text-right font-mono">{d.PREZZO_CARTA_NUOVO?.toFixed(2) ?? "—"}</td>
                                    <td className="px-2 py-1 text-right font-mono font-semibold">
                                      {d.differenza != null ? `${d.differenza > 0 ? "+" : ""}${d.differenza.toFixed(2)}` : "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Bottoni conferma / annulla */}
                      <div className="flex items-center gap-3 pt-2">
                        {conModifiche.length > 0 && (
                          <button onClick={applicaRicalcolo} disabled={markupRecalcing}
                            className="px-5 py-2 bg-emerald-700 text-white rounded-xl font-semibold hover:bg-emerald-800 transition disabled:opacity-40 shadow-sm">
                            {markupRecalcing ? "Applicazione..." : `Conferma — aggiorna ${countToApply} prezzi`}
                          </button>
                        )}
                        <button onClick={() => setMarkupPreviewList(null)}
                          className="px-4 py-2 text-sm border border-neutral-300 rounded-xl hover:bg-neutral-50 transition">
                          Annulla
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Risultato dopo applicazione */}
            {markupRecalcResult && (
              <div className="text-sm space-y-1 mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="font-semibold text-emerald-700">{markupRecalcResult.aggiornati} prezzi aggiornati</p>
                <p className="text-neutral-600">
                  {markupRecalcResult.invariati} invariati, {markupRecalcResult.senza_listino} senza listino
                  {markupRecalcResult.forza_prezzo_skipped > 0 && <span className="text-rose-600 font-semibold ml-2">{markupRecalcResult.forza_prezzo_skipped} con forza prezzo (non aggiornati)</span>}
                </p>
                {/* Dettaglio vini con forza prezzo nel risultato */}
                {markupRecalcResult.dettaglio?.filter(d => d.forza_prezzo).length > 0 && (
                  <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded text-xs">
                    <p className="font-semibold text-rose-700 mb-1">Vini con Forza Prezzo — verifica differenze:</p>
                    {markupRecalcResult.dettaglio.filter(d => d.forza_prezzo).map(d => (
                      <div key={d.id} className="flex justify-between py-0.5 border-b border-rose-100 last:border-0">
                        <span>{d.DESCRIZIONE}</span>
                        <span className="font-mono">{d.vecchio?.toFixed(2) ?? "—"} → {d.nuovo?.toFixed(2)} ({d.differenza > 0 ? "+" : ""}{d.differenza?.toFixed(2)})</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setMarkupRecalcResult(null)}
                  className="mt-2 px-3 py-1 text-xs border border-neutral-300 rounded-lg hover:bg-neutral-50">Chiudi</button>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );

  const sectionRenderers = {
    import: renderImportExport,
    carta: renderCarta,
    ordinamento: renderOrdinamento,
    markup: renderMarkup,
    locazioni: renderLocazioni,
    stati: renderStati,
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
