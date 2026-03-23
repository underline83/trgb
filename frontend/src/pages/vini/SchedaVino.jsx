// src/pages/vini/SchedaVino.jsx
// @version: v1.1-modifica-log
// Componente riutilizzabile: scheda vino completa (anagrafica + giacenze + movimenti + note)
// Usato sia inline in MagazzinoVini che come pagina standalone via MagazzinoViniDettaglio

import React, { useEffect, useState, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { isAdminRole } from "../../utils/authHelpers";
import {
  STATO_VENDITA, STATO_RIORDINO, STATO_CONSERVAZIONE,
  STATO_VENDITA_OPTIONS, STATO_RIORDINO_OPTIONS, STATO_CONSERVAZIONE_OPTIONS,
} from "../../config/viniConstants";
import LocationPicker from "./LocationPicker";
import MatricePicker from "./MatricePicker";

/** Formatta un numero con la virgola come separatore decimale */
function fmtNum(val, decimals = 2) {
  if (val == null) return null;
  return Number(val).toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const TIPO_LABELS = {
  CARICO:    { label: "Carico",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  SCARICO:   { label: "Scarico",   cls: "bg-red-50 text-red-700 border-red-200" },
  VENDITA:   { label: "Vendita",   cls: "bg-blue-50 text-blue-700 border-blue-200" },
  RETTIFICA: { label: "Rettifica", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  MODIFICA:  { label: "Modifica",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
};

// Colori sidebar in base a TIPOLOGIA vino
const TIPOLOGIA_SIDEBAR = {
  ROSSI:       { bg: "bg-gradient-to-b from-red-700 to-red-900",       accent: "bg-red-600/30",    text: "text-red-100" },
  BIANCHI:     { bg: "bg-gradient-to-b from-amber-600 to-amber-800",   accent: "bg-amber-500/30",  text: "text-amber-100" },
  BOLLICINE:   { bg: "bg-gradient-to-b from-yellow-600 to-yellow-800", accent: "bg-yellow-500/30", text: "text-yellow-100" },
  ROSATI:      { bg: "bg-gradient-to-b from-pink-600 to-pink-800",     accent: "bg-pink-500/30",   text: "text-pink-100" },
  "PASSITI E VINI DA MEDITAZIONE": { bg: "bg-gradient-to-b from-orange-600 to-orange-800", accent: "bg-orange-500/30", text: "text-orange-100" },
  "GRANDI FORMATI": { bg: "bg-gradient-to-b from-purple-700 to-purple-900", accent: "bg-purple-500/30", text: "text-purple-100" },
  "VINI ANALCOLICI": { bg: "bg-gradient-to-b from-teal-600 to-teal-800", accent: "bg-teal-500/30", text: "text-teal-100" },
  ERRORE:      { bg: "bg-gradient-to-b from-gray-600 to-gray-800",     accent: "bg-gray-500/30",   text: "text-gray-100" },
};

function getSidebarColors(tipologia) {
  if (!tipologia) return TIPOLOGIA_SIDEBAR.ERRORE;
  const t = tipologia.toUpperCase();
  for (const [key, val] of Object.entries(TIPOLOGIA_SIDEBAR)) {
    if (t.includes(key)) return val;
  }
  return TIPOLOGIA_SIDEBAR.ERRORE;
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}

function Input({ label, name, value, onChange, onBlur, type = "text", step }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">{label}</label>
      <input type={type} step={step} name={name} value={value ?? ""} onChange={onChange} onBlur={onBlur}
        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
    </div>
  );
}

function Select({ label, name, value, onChange, options }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">{label}</label>
      <select name={name} value={value ?? ""} onChange={onChange}
        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function SelectTabellato({ label, name, value, onChange, valori, placeholder = "— seleziona —", valueKey, labelFn }) {
  // Supporta sia array di stringhe che array di oggetti
  const getVal = (item) => typeof item === "string" ? item : (valueKey ? item[valueKey] : item.formato || item.nome || String(item));
  const getLabel = (item) => {
    if (labelFn) return labelFn(item);
    if (typeof item === "string") return item;
    if (item.descrizione) return `${getVal(item)} — ${item.descrizione}${item.litri ? ` (${item.litri}L)` : ""}`;
    return getVal(item);
  };
  // Assicura che il valore corrente sia nelle opzioni (anche se non torna dal DB)
  const vals = valori.map(getVal);
  const opts = vals.includes(value) || !value ? valori : [value, ...valori];
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">{label}</label>
      <select name={name} value={value ?? ""} onChange={onChange}
        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300">
        <option value="">{placeholder}</option>
        {opts.map(v => <option key={getVal(v)} value={getVal(v)}>{getLabel(v)}</option>)}
      </select>
    </div>
  );
}

function SectionHeader({ title, children }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 bg-neutral-50 border-b border-neutral-200">
      <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">{title}</h2>
      <div className="flex gap-2 items-center">{children}</div>
    </div>
  );
}

/**
 * SchedaVino — scheda completa modificabile di un vino.
 * Props:
 *   - vinoId: number (obbligatorio) — id del vino da caricare
 *   - onClose: function (opzionale) — callback per chiudere la scheda (mostra pulsante ✕)
 *   - onVinoUpdated: function(vino) (opzionale) — notifica il parent quando il vino viene aggiornato
 *   - inline: boolean (opzionale) — se true, non mostra header con titolone (usato dentro MagazzinoVini)
 */
const SchedaVino = forwardRef(function SchedaVino({ vinoId, onClose, onVinoUpdated, inline = false }, ref) {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const canDelete = isAdminRole(role) || role === "sommelier" || role === "sala";
  const [duplicating, setDuplicating] = useState(false);

  // ── stato base ───────────────────────────────────────
  const [vino, setVino]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // ── anagrafica edit ──────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState("");

  // ── giacenze edit ────────────────────────────────────
  const [giacenzeEdit, setGiacenzeEdit]     = useState(false);
  const [giacenzeData, setGiacenzeData]     = useState({});
  const [giacenzeSaving, setGiacenzeSaving] = useState(false);

  // ── refs per dirty-check (accessibili dal useEffect) ──
  const editModeRef = useRef(false);
  const editDataRef = useRef({});
  const giacenzeEditRef = useRef(false);
  const giacenzeDataRef = useRef({});
  const vinoRef = useRef(null);
  // Sync refs
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);
  useEffect(() => { editDataRef.current = editData; }, [editData]);
  useEffect(() => { giacenzeEditRef.current = giacenzeEdit; }, [giacenzeEdit]);
  useEffect(() => { giacenzeDataRef.current = giacenzeData; }, [giacenzeData]);
  useEffect(() => { vinoRef.current = vino; }, [vino]);

  // ── movimenti ────────────────────────────────────────
  const [movimenti, setMovimenti]     = useState([]);
  const [movLoading, setMovLoading]   = useState(false);
  const [tipoMov, setTipoMov]         = useState("CARICO");
  const [qtaMov, setQtaMov]           = useState("");
  const [locMov, setLocMov]           = useState("");
  const [noteMov, setNoteMov]         = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [submitMsg, setSubmitMsg]     = useState("");

  // ── note ────────────────────────────────────────────
  const [note, setNote]           = useState([]);
  const [notaText, setNotaText]   = useState("");
  const [noteLoading, setNoteLoading] = useState(false);

  // ── opzioni locazioni ──────────────────────────────
  const [opzioniFrigo, setOpzioniFrigo] = useState([]);
  const [opzioniLoc1, setOpzioniLoc1] = useState([]);
  const [opzioniLoc2, setOpzioniLoc2] = useState([]);
  const [opzioniLoc3, setOpzioniLoc3] = useState([]);

  // ── valori tabellati per edit ──────────────────────
  const [tabellaOpts, setTabellaOpts] = useState({
    tipologie: [], nazioni: [], regioni: [], formati: [],
  });
  // regioni complete con nazione per cascading
  const [allRegioniTab, setAllRegioniTab] = useState([]); // [{codice, nome, nazione}]

  // ── fetch vino ──────────────────────────────────────
  const fetchVino = async () => {
    setLoading(true); setError("");
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}`);
      if (r.status === 404) { setError("Vino non trovato."); return; }
      if (!r.ok) throw new Error(`Errore server: ${r.status}`);
      const data = await r.json();
      setVino(data);
      if (onVinoUpdated) onVinoUpdated(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ── fetch movimenti ─────────────────────────────────
  const fetchMovimenti = async () => {
    setMovLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}/movimenti`);
      if (r.ok) setMovimenti(await r.json());
    } finally { setMovLoading(false); }
  };

  // ── fetch note ──────────────────────────────────────
  const fetchNote = async () => {
    setNoteLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}/note`);
      if (r.ok) setNote(await r.json());
    } finally { setNoteLoading(false); }
  };

  const fetchOpzioniLocazioni = async () => {
    try {
      const r = await apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-config`);
      if (r.ok) {
        const data = await r.json();
        setOpzioniFrigo(data.opzioni_frigo || []);
        setOpzioniLoc1(data.opzioni_locazione_1 || []);
        setOpzioniLoc2(data.opzioni_locazione_2 || []);
        setOpzioniLoc3(data.opzioni_locazione_3 || []);
      }
    } catch {}
  };

  const fetchTabellaOpts = async () => {
    try {
      const r = await apiFetch(`${API_BASE}/settings/vini/valori-tabellati`);
      if (r.ok) {
        const d = await r.json();
        const regioniAll = d.regioni || []; // [{codice, nome, nazione}]
        setAllRegioniTab(regioniAll);
        setTabellaOpts({
          tipologie: d.tipologie || [], nazioni: d.nazioni || [],
          regioni: regioniAll.map(r => r.nome), // default: tutte
          formati: d.formati || [], // [{formato, descrizione, litri}]
        });
      }
    } catch {}
  };

  useEffect(() => {
    if (!vinoId) return;
    // Reset state when vinoId changes
    setVino(null); setEditMode(false); setGiacenzeEdit(false);
    setMovimenti([]); setNote([]);
    fetchVino();
    fetchMovimenti();
    fetchNote();
    fetchOpzioniLocazioni();
    fetchTabellaOpts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinoId]);

  // Cascading: filtra regioni in base a NAZIONE selezionata in edit mode
  useEffect(() => {
    if (!editMode || allRegioniTab.length === 0) return;
    const naz = editData.NAZIONE;
    if (!naz) {
      setTabellaOpts(prev => ({ ...prev, regioni: allRegioniTab.map(r => r.nome) }));
      return;
    }
    const filtered = allRegioniTab.filter(r => r.nazione === naz).map(r => r.nome);
    setTabellaOpts(prev => ({ ...prev, regioni: filtered }));
    // Se la regione corrente non è fra quelle della nazione, resettala
    if (editData.REGIONE && !filtered.includes(editData.REGIONE)) {
      setEditData(prev => ({ ...prev, REGIONE: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editData.NAZIONE, editMode, allRegioniTab]);

  const tot = useMemo(() => {
    if (!vino) return 0;
    return vino.QTA_TOTALE ??
      (vino.QTA_FRIGO ?? 0) + (vino.QTA_LOC1 ?? 0) +
      (vino.QTA_LOC2 ?? 0) + (vino.QTA_LOC3 ?? 0);
  }, [vino]);

  // ── helper: notifica parent di aggiornamento ───────
  const notifyUpdate = (updatedVino) => {
    setVino(updatedVino);
    if (onVinoUpdated) onVinoUpdated(updatedVino);
  };

  // ── dirty check helpers ─────────────────────────────
  const hasEditChanges = () => {
    if (!editMode || !vino) return false;
    return Object.keys(editData).some(k => {
      const orig = vino[k] ?? "";
      const cur = editData[k] ?? "";
      return String(orig) !== String(cur);
    });
  };
  const hasGiacenzeChanges = () => {
    if (!giacenzeEdit || !vino) return false;
    const fields = ["FRIGORIFERO","QTA_FRIGO","LOCAZIONE_1","QTA_LOC1","LOCAZIONE_2","QTA_LOC2"];
    return fields.some(k => {
      const orig = vino[k] ?? (k.startsWith("QTA") ? 0 : "");
      const cur = giacenzeData[k] ?? (k.startsWith("QTA") ? 0 : "");
      return String(orig) !== String(cur);
    });
  };
  const hasPendingChanges = () => hasEditChanges() || hasGiacenzeChanges();

  // Esponi hasPendingChanges al parent via ref
  useImperativeHandle(ref, () => ({ hasPendingChanges }));

  // Chiusura scheda con check dirty
  const handleClose = () => {
    if (hasPendingChanges()) {
      if (!window.confirm("Hai modifiche non salvate. Vuoi davvero chiudere la scheda?")) return;
    }
    if (onClose) onClose();
  };

  const handleDuplica = async () => {
    if (!window.confirm("Vuoi duplicare questo vino? Verrà creata una copia con giacenze a zero.")) return;
    setDuplicating(true);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}/duplica`, { method: "POST" });
      if (!resp.ok) throw new Error("Errore durante la duplicazione");
      const data = await resp.json();
      navigate(`/vini/magazzino/${data.id}`);
    } catch (err) {
      alert(err.message || "Errore durante la duplicazione");
    } finally {
      setDuplicating(false);
    }
  };

  const cancelEdit = () => {
    if (hasEditChanges()) {
      if (!window.confirm("Hai modifiche non salvate nell'anagrafica. Vuoi davvero annullare?")) return;
    }
    setEditMode(false); setSaveMsg("");
  };
  const cancelGiacenze = () => {
    if (hasGiacenzeChanges()) {
      if (!window.confirm("Hai modifiche non salvate nelle giacenze. Vuoi davvero annullare?")) return;
    }
    setGiacenzeEdit(false);
  };

  // ── anagrafica save ──────────────────────────────────
  const startEdit = () => {
    setEditData({
      TIPOLOGIA: vino.TIPOLOGIA ?? "", NAZIONE: vino.NAZIONE ?? "",
      REGIONE: vino.REGIONE ?? "",
      DESCRIZIONE: vino.DESCRIZIONE ?? "", DENOMINAZIONE: vino.DENOMINAZIONE ?? "",
      ANNATA: vino.ANNATA ?? "", VITIGNI: vino.VITIGNI ?? "",
      GRADO_ALCOLICO: vino.GRADO_ALCOLICO ?? "", FORMATO: vino.FORMATO ?? "",
      PRODUTTORE: vino.PRODUTTORE ?? "", DISTRIBUTORE: vino.DISTRIBUTORE ?? "", RAPPRESENTANTE: vino.RAPPRESENTANTE ?? "",
      PREZZO_CARTA: vino.PREZZO_CARTA ?? "", PREZZO_CALICE: vino.PREZZO_CALICE ?? "",
      PREZZO_CALICE_MANUALE: vino.PREZZO_CALICE_MANUALE ?? 0,
      EURO_LISTINO: vino.EURO_LISTINO ?? "",
      SCONTO: vino.SCONTO ?? "", NOTE_PREZZO: vino.NOTE_PREZZO ?? "",
      CARTA: vino.CARTA ?? "NO", IPRATICO: vino.IPRATICO ?? "NO",
      BIOLOGICO: vino.BIOLOGICO ?? "NO", VENDITA_CALICE: vino.VENDITA_CALICE ?? "NO",
      FORZA_PREZZO: vino.FORZA_PREZZO ?? 0,
      STATO_VENDITA: vino.STATO_VENDITA ?? "",
      STATO_RIORDINO: vino.STATO_RIORDINO ?? "",
      STATO_CONSERVAZIONE: vino.STATO_CONSERVAZIONE ?? "",
      NOTE_STATO: vino.NOTE_STATO ?? "",
      NOTE: vino.NOTE ?? "",
    });
    setEditMode(true); setSaveMsg("");
  };

  // Auto-calcolo PREZZO_CARTA quando EURO_LISTINO cambia (onBlur)
  const [prezzoAutoCalc, setPrezzoAutoCalc] = useState(false);
  const autoCalcPrezzo = async (euroListino) => {
    const val = parseFloat(euroListino);
    if (!val || val <= 0) return;
    try {
      const r = await apiFetch(`${API_BASE}/vini/pricing/calcola`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ euro_listino: val }),
      });
      if (r.ok) {
        const data = await r.json();
        setEditData(p => ({ ...p, PREZZO_CARTA: data.prezzo_carta }));
        setPrezzoAutoCalc(true);
        setTimeout(() => setPrezzoAutoCalc(false), 2000);
      }
    } catch {}
  };

  const saveEdit = async () => {
    setSaving(true); setSaveMsg("");
    try {
      const payload = { ...editData };
      ["GRADO_ALCOLICO","PREZZO_CARTA","PREZZO_CALICE","EURO_LISTINO","SCONTO"].forEach(k => {
        payload[k] = payload[k] === "" || payload[k] === null ? null : parseFloat(payload[k]);
      });
      // Converti stringhe vuote in null per i campi con CHECK constraint
      ["STATO_VENDITA","STATO_RIORDINO","STATO_CONSERVAZIONE","DISCONTINUATO"].forEach(k => {
        if (payload[k] === "") payload[k] = null;
      });
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `Errore ${r.status}`); }
      notifyUpdate(await r.json());
      setEditMode(false); setSaveMsg("✅ Salvato.");
      fetchMovimenti();  // Ricarica movimenti per mostrare la MODIFICA
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (e) { setSaveMsg(`❌ ${e.message}`); }
    finally { setSaving(false); }
  };

  // ── giacenze save ────────────────────────────────────
  const startGiacenze = () => {
    setGiacenzeData({
      FRIGORIFERO: vino.FRIGORIFERO ?? "", QTA_FRIGO: vino.QTA_FRIGO ?? 0,
      LOCAZIONE_1: vino.LOCAZIONE_1 ?? "", QTA_LOC1: vino.QTA_LOC1 ?? 0,
      LOCAZIONE_2: vino.LOCAZIONE_2 ?? "", QTA_LOC2: vino.QTA_LOC2 ?? 0,
    });
    setGiacenzeEdit(true);
  };

  const saveGiacenze = async () => {
    setGiacenzeSaving(true);
    try {
      // NB: LOCAZIONE_3 e QTA_LOC3 sono gestiti dalla matrice (MatricePicker)
      const payload = {
        FRIGORIFERO: giacenzeData.FRIGORIFERO || null,
        QTA_FRIGO:   parseInt(giacenzeData.QTA_FRIGO,  10) || 0,
        LOCAZIONE_1: giacenzeData.LOCAZIONE_1 || null,
        QTA_LOC1:    parseInt(giacenzeData.QTA_LOC1, 10) || 0,
        LOCAZIONE_2: giacenzeData.LOCAZIONE_2 || null,
        QTA_LOC2:    parseInt(giacenzeData.QTA_LOC2, 10) || 0,
      };
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      notifyUpdate(await r.json());
      setGiacenzeEdit(false);
      fetchMovimenti();
    } catch (e) { alert(e.message); }
    finally { setGiacenzeSaving(false); }
  };

  // ── movimenti ────────────────────────────────────────
  const submitMovimento = async () => {
    const qtaNum = Number(qtaMov);
    if (!qtaMov || qtaNum <= 0) { alert("Inserisci una quantità valida (> 0)."); return; }
    if ((tipoMov === "VENDITA" || tipoMov === "SCARICO") && !locMov) {
      alert("Seleziona la locazione da cui scalare."); return;
    }
    setSubmitting(true); setSubmitMsg("");
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}/movimenti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: tipoMov, qta: qtaNum, locazione: locMov || null, note: noteMov || null }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `Errore ${r.status}`); }
      const data = await r.json();
      if (data.vino) notifyUpdate(data.vino);
      if (data.movimenti) setMovimenti(data.movimenti);
      setQtaMov(""); setLocMov(""); setNoteMov("");
      setSubmitMsg("✅ Registrato."); setTimeout(() => setSubmitMsg(""), 3000);
    } catch (e) { setSubmitMsg(`❌ ${e.message}`); }
    finally { setSubmitting(false); }
  };

  const deleteMovimento = async (movId) => {
    if (!window.confirm("Eliminare questo movimento? La giacenza verrà ricalcolata.")) return;
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/movimenti/${movId}`, { method: "DELETE" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `Errore ${r.status}`); }
      fetchVino(); fetchMovimenti();
    } catch (e) { alert(e.message); }
  };

  // ── note ────────────────────────────────────────────
  const addNota = async () => {
    if (!notaText.trim()) return;
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota: notaText.trim() }),
      });
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      setNote(await r.json()); setNotaText("");
    } catch (e) { alert(e.message); }
  };

  const deleteNota = async (notaId) => {
    if (!window.confirm("Eliminare questa nota?")) return;
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}/note/${notaId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      setNote(await r.json());
    } catch (e) { alert(e.message); }
  };

  // ── render ───────────────────────────────────────────
  if (!vinoId) return null;

  const sbc = vino ? getSidebarColors(vino.TIPOLOGIA) : getSidebarColors(null);

  return (
    <div className={`${inline ? "rounded-2xl shadow-lg" : "rounded-3xl shadow-2xl"} overflow-hidden border border-neutral-200`}>

      {loading && <div className="bg-white px-8 py-6"><p className="text-sm text-neutral-500">Caricamento…</p></div>}
      {error && !loading && <div className="bg-white px-8 py-6"><p className="text-sm text-red-600">{error}</p></div>}

      {!loading && !error && vino && (
        <div className={`grid grid-cols-1 lg:grid-cols-[260px_1fr]`} style={{ height: inline ? "78vh" : "88vh" }}>

          {/* ═══════════ SIDEBAR ═══════════ */}
          <div className={`${sbc.bg} text-white flex flex-col h-full`}>

            {/* ── Header fisso (nome + pulsanti) ── */}
            <div className="p-4 pb-3">
              <h2 className="text-base font-bold leading-tight">{vino.DESCRIZIONE}</h2>
              <p className="text-xs opacity-70 mt-0.5">{vino.PRODUTTORE || "—"} {vino.ANNATA ? `· ${vino.ANNATA}` : ""}</p>
              <span className="inline-flex items-center mt-1.5 bg-white/20 text-[10px] font-bold px-2 py-0.5 rounded font-mono">#{vino.id}</span>

              {/* Pulsanti azione — subito sotto il nome */}
              <div className="flex gap-1.5 mt-3">
                <button type="button" onClick={startEdit}
                  className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold bg-white text-neutral-800 hover:bg-neutral-100 transition text-center leading-tight">
                  Modifica<br/>anagrafica
                </button>
                <button type="button" onClick={startGiacenze}
                  className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold bg-white/15 hover:bg-white/25 transition text-center leading-tight">
                  Modifica<br/>giacenze
                </button>
                <button type="button" onClick={handleDuplica} disabled={duplicating}
                  className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold bg-white/15 hover:bg-white/25 transition text-center leading-tight disabled:opacity-50">
                  {duplicating ? "Duplico…" : <>{`Duplica`}<br/>{`vino`}</>}
                </button>
              </div>
            </div>

            {/* ── Contenuto scrollabile ── */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className={`${sbc.accent} rounded-lg p-2.5 text-center`}>
                  <div className="text-[8px] uppercase opacity-60 tracking-wider">Bottiglie</div>
                  <div className="text-xl font-bold">{tot}</div>
                </div>
                <div className={`${sbc.accent} rounded-lg p-2.5 text-center`}>
                  <div className="text-[8px] uppercase opacity-60 tracking-wider">Prezzo</div>
                  <div className="text-xl font-bold">{vino.PREZZO_CARTA != null ? fmtNum(vino.PREZZO_CARTA, 0) : "—"}<span className="text-xs font-normal opacity-60"> €</span></div>
                </div>
                <div className={`${sbc.accent} rounded-lg p-2.5 text-center`}>
                  <div className="text-[8px] uppercase opacity-60 tracking-wider">Listino</div>
                  <div className="text-lg font-bold">{vino.EURO_LISTINO != null ? fmtNum(vino.EURO_LISTINO, 0) : "—"}<span className="text-[10px] font-normal opacity-60"> €</span></div>
                </div>
                <div className={`${sbc.accent} rounded-lg p-2.5 text-center`}>
                  <div className="text-[8px] uppercase opacity-60 tracking-wider">Formato</div>
                  <div className="text-lg font-bold">{vino.FORMATO || "—"}</div>
                </div>
              </div>

              {/* Info list */}
              <ul className="text-[11px] space-y-0 mb-3">
                {[
                  ["Tipologia", vino.TIPOLOGIA],
                  ["Nazione", vino.NAZIONE],
                  ["Regione", vino.REGIONE],
                  ["Carta Vini", vino.CARTA || "NO"],
                  ["Calice", vino.VENDITA_CALICE || "NO"],
                  ["Biologico", vino.BIOLOGICO || "NO"],
                  ["Forza Prezzo", vino.FORZA_PREZZO ? "SI" : "NO"],
                  ["Vendita", (() => { const s = STATO_VENDITA[vino.STATO_VENDITA]; return s ? s.label : vino.STATO_VENDITA || "—"; })()],
                  ["Riordino", (() => { const s = STATO_RIORDINO[vino.STATO_RIORDINO]; return s ? s.label : vino.STATO_RIORDINO || "—"; })()],
                  ["Conservazione", (() => { const s = STATO_CONSERVAZIONE[vino.STATO_CONSERVAZIONE]; return s ? s.label : vino.STATO_CONSERVAZIONE || "—"; })()],
                ].map(([label, val]) => (
                  <li key={label} className="flex justify-between py-1.5 border-b border-white/10">
                    <span className="opacity-60">{label}</span>
                    <span className="font-medium">{val || "—"}</span>
                  </li>
                ))}
              </ul>

              {/* Chiudi */}
              {onClose && (
                <button type="button" onClick={handleClose}
                  className="w-full mt-2 px-3 py-2 rounded-lg text-[10px] font-semibold bg-white/10 hover:bg-white/20 transition text-center">
                  Chiudi
                </button>
              )}
            </div>
          </div>

          {/* ═══════════ MAIN CONTENT ═══════════ */}
          <div className="bg-white overflow-y-auto">

            {/* ── ANAGRAFICA ── */}
            <div className="border-b border-neutral-200">
              <SectionHeader title="Anagrafica">
                {saveMsg && <span className="text-xs font-medium">{saveMsg}</span>}
                {editMode && <>
                  <button type="button" onClick={cancelEdit} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 bg-white hover:bg-neutral-100 transition">Annulla</button>
                  <button type="button" onClick={saveEdit} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 transition disabled:opacity-50">{saving ? "Salvo…" : "Salva"}</button>
                </>}
              </SectionHeader>
              <div className="p-5">
                {!editMode ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <Field label="Tipologia" value={vino.TIPOLOGIA} />
                      <Field label="Nazione" value={vino.NAZIONE} />
                      <Field label="Regione" value={vino.REGIONE} />
                      <Field label="Denominazione" value={vino.DENOMINAZIONE} />
                      <Field label="Annata" value={vino.ANNATA} />
                      <Field label="Formato" value={vino.FORMATO} />
                      <Field label="Produttore" value={vino.PRODUTTORE} />
                      <Field label="Distributore" value={vino.DISTRIBUTORE} />
                      <Field label="Rappresentante" value={vino.RAPPRESENTANTE} />
                      <Field label="Vitigni" value={vino.VITIGNI} />
                      <Field label="Grado alcolico" value={vino.GRADO_ALCOLICO ? `${fmtNum(vino.GRADO_ALCOLICO, 1)}%` : null} />
                    </div>
                    <div className="grid grid-cols-4 gap-4 pt-3 border-t border-neutral-100">
                      <Field label="Prezzo carta" value={vino.PREZZO_CARTA != null ? `${fmtNum(vino.PREZZO_CARTA)} €` : null} />
                      <Field label="Prezzo calice" value={vino.PREZZO_CALICE != null ? `${fmtNum(vino.PREZZO_CALICE)} €${vino.PREZZO_CALICE_MANUALE ? " ✎" : ""}` : null} />
                      <Field label="Listino" value={vino.EURO_LISTINO != null ? `${fmtNum(vino.EURO_LISTINO)} €` : null} />
                      <Field label="Sconto" value={vino.SCONTO != null ? `${fmtNum(vino.SCONTO)}%` : null} />
                    </div>
                    <div className="pt-3 border-t border-neutral-100 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <FlagBadge active={vino.CARTA === "SI"} label="Carta Vini" activeColor="bg-emerald-50 text-emerald-700 border-emerald-200" />
                        <FlagBadge active={vino.IPRATICO === "SI"} label="iPratico" activeColor="bg-sky-50 text-sky-700 border-sky-200" />
                        <FlagBadge active={vino.VENDITA_CALICE === "SI"} label="Calice" activeColor="bg-violet-50 text-violet-700 border-violet-200" />
                        <FlagBadge active={vino.BIOLOGICO === "SI"} label="Biologico" activeColor="bg-lime-50 text-lime-700 border-lime-200" />
                        <FlagBadge active={!!vino.FORZA_PREZZO} label="Forza Prezzo" activeColor="bg-rose-50 text-rose-700 border-rose-200" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {vino.STATO_VENDITA && (() => { const s = STATO_VENDITA[vino.STATO_VENDITA]; return s ? <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${s.color}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}</span> : null; })()}
                        {vino.STATO_RIORDINO && (() => { const s = STATO_RIORDINO[vino.STATO_RIORDINO]; return s ? <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${s.color}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />Riordino: {s.label}</span> : null; })()}
                        {vino.STATO_CONSERVAZIONE && (() => { const s = STATO_CONSERVAZIONE[vino.STATO_CONSERVAZIONE]; return s ? <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${s.color}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />Conservazione: {s.label}</span> : null; })()}
                        {vino.NOTE_STATO && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-neutral-50 text-neutral-600 border-neutral-200">{vino.NOTE_STATO}</span>}
                      </div>
                    </div>
                    {vino.NOTE && <div className="pt-3 border-t border-neutral-100"><div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">Note interne</div><p className="text-sm text-neutral-800 whitespace-pre-wrap">{vino.NOTE}</p></div>}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input label="Descrizione *" name="DESCRIZIONE" value={editData.DESCRIZIONE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                      <Input label="Denominazione" name="DENOMINAZIONE" value={editData.DENOMINAZIONE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <SelectTabellato label="Tipologia *" name="TIPOLOGIA" value={editData.TIPOLOGIA} valori={tabellaOpts.tipologie} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                      <SelectTabellato label="Nazione *" name="NAZIONE" value={editData.NAZIONE} valori={tabellaOpts.nazioni} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                      <SelectTabellato label="Regione" name="REGIONE" value={editData.REGIONE} valori={tabellaOpts.regioni} placeholder="— nessuna —" onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Input label="Annata" name="ANNATA" value={editData.ANNATA} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                      <SelectTabellato label="Formato" name="FORMATO" value={editData.FORMATO} valori={tabellaOpts.formati} valueKey="formato" onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                      <Input label="Vitigni" name="VITIGNI" value={editData.VITIGNI} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                      <Input label="Grado alcolico" name="GRADO_ALCOLICO" value={editData.GRADO_ALCOLICO} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} type="number" step="0.1" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Input label="Produttore" name="PRODUTTORE" value={editData.PRODUTTORE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                      <Input label="Distributore" name="DISTRIBUTORE" value={editData.DISTRIBUTORE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                      <Input label="Rappresentante" name="RAPPRESENTANTE" value={editData.RAPPRESENTANTE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="relative">
                        <Input label={`Prezzo carta €${prezzoAutoCalc ? " ✓ auto" : ""}`} name="PREZZO_CARTA" value={editData.PREZZO_CARTA}
                          onChange={e => {
                            const val = e.target.value;
                            setEditData(p => {
                              const upd = { ...p, PREZZO_CARTA: val };
                              // Auto-calcola calice se non manuale
                              if (!p.PREZZO_CALICE_MANUALE) {
                                const pf = parseFloat(val);
                                upd.PREZZO_CALICE = pf > 0 ? Math.round(pf / 5 * 100) / 100 : "";
                              }
                              return upd;
                            });
                          }} type="number" step="0.50" />
                      </div>
                      <Input label={`Calice €${editData.PREZZO_CALICE_MANUALE ? " ✎" : " (auto)"}`} name="PREZZO_CALICE" value={editData.PREZZO_CALICE}
                        onChange={e => setEditData(p => ({...p, PREZZO_CALICE: e.target.value, PREZZO_CALICE_MANUALE: 1}))} type="number" step="0.50" />
                      <Input label="Listino €" name="EURO_LISTINO" value={editData.EURO_LISTINO} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} onBlur={e => autoCalcPrezzo(e.target.value)} type="number" step="0.01" />
                      <Input label="Sconto %" name="SCONTO" value={editData.SCONTO} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} type="number" step="0.01" />
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <FlagToggle label="Carta Vini" name="CARTA" value={editData.CARTA} onChange={v => setEditData(p => ({...p, CARTA: v}))} />
                      <FlagToggle label="iPratico" name="IPRATICO" value={editData.IPRATICO} onChange={v => setEditData(p => ({...p, IPRATICO: v}))} />
                      <FlagToggle label="Calice" name="VENDITA_CALICE" value={editData.VENDITA_CALICE} onChange={v => setEditData(p => ({...p, VENDITA_CALICE: v}))} />
                      <FlagToggle label="Biologico" name="BIOLOGICO" value={editData.BIOLOGICO} onChange={v => setEditData(p => ({...p, BIOLOGICO: v}))} />
                      <FlagToggle label="Forza Prezzo" name="FORZA_PREZZO" value={editData.FORZA_PREZZO ? "SI" : "NO"} onChange={v => setEditData(p => ({...p, FORZA_PREZZO: v === "SI" ? 1 : 0}))} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-neutral-100">
                      <Select label="Stato vendita" name="STATO_VENDITA" value={editData.STATO_VENDITA} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} options={STATO_VENDITA_OPTIONS} />
                      <Select label="Stato riordino" name="STATO_RIORDINO" value={editData.STATO_RIORDINO} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} options={STATO_RIORDINO_OPTIONS} />
                      <Select label="Stato conservazione" name="STATO_CONSERVAZIONE" value={editData.STATO_CONSERVAZIONE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} options={STATO_CONSERVAZIONE_OPTIONS} />
                    </div>
                    <Input label="Note stato" name="NOTE_STATO" value={editData.NOTE_STATO} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Note interne</label>
                      <textarea name="NOTE" value={editData.NOTE ?? ""} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} rows={2} className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── GIACENZE ── */}
            <div className="border-b border-neutral-200">
              <SectionHeader title="Giacenze per locazione">
                {giacenzeEdit && <>
                  <button type="button" onClick={cancelGiacenze} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 bg-white hover:bg-neutral-100 transition">Annulla</button>
                  <button type="button" onClick={saveGiacenze} disabled={giacenzeSaving} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 transition disabled:opacity-50">{giacenzeSaving ? "Salvo…" : "Salva"}</button>
                </>}
              </SectionHeader>
              <div className="p-5">
                {!giacenzeEdit ? (
                  <div className="divide-y divide-neutral-100">
                    {[
                      { loc: vino.FRIGORIFERO, qta: vino.QTA_FRIGO ?? 0, label: "Frigorifero" },
                      { loc: vino.LOCAZIONE_1, qta: vino.QTA_LOC1 ?? 0, label: "Locazione 1" },
                      { loc: vino.LOCAZIONE_2, qta: vino.QTA_LOC2 ?? 0, label: "Locazione 2" },
                    ].map(({ loc, qta, label }) => (
                      <div key={label} className="py-2 flex justify-between text-sm">
                        <span className="text-neutral-600">{label}: <span className="text-neutral-800 font-medium">{loc || "—"}</span></span>
                        <span className="font-semibold">{qta} bt</span>
                      </div>
                    ))}
                    <div className="py-2">
                      <MatricePicker vinoId={vino.id} disabled={true} />
                    </div>
                    <div className="py-2 flex justify-between text-sm font-bold border-t border-neutral-300 mt-1 pt-3">
                      <span>Totale</span><span>{tot} bt</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3 items-end">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Frigorifero</label>
                        <LocationPicker options={opzioniFrigo} value={giacenzeData.FRIGORIFERO ?? ""}
                          onChange={val => setGiacenzeData(p => ({...p, FRIGORIFERO: val}))} placeholder="Cerca frigorifero…" />
                      </div>
                      <Input label="Qtà bt" name="QTA_FRIGO" value={giacenzeData.QTA_FRIGO} onChange={e => setGiacenzeData(p => ({...p, [e.target.name]: e.target.value}))} type="number" />
                    </div>
                    <div className="grid grid-cols-3 gap-3 items-end">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Locazione 1</label>
                        <LocationPicker options={opzioniLoc1} value={giacenzeData.LOCAZIONE_1 ?? ""}
                          onChange={val => setGiacenzeData(p => ({...p, LOCAZIONE_1: val}))} placeholder="Cerca locazione 1…" />
                      </div>
                      <Input label="Qtà bt" name="QTA_LOC1" value={giacenzeData.QTA_LOC1} onChange={e => setGiacenzeData(p => ({...p, [e.target.name]: e.target.value}))} type="number" />
                    </div>
                    <div className="grid grid-cols-3 gap-3 items-end">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Locazione 2</label>
                        <LocationPicker options={opzioniLoc2} value={giacenzeData.LOCAZIONE_2 ?? ""}
                          onChange={val => setGiacenzeData(p => ({...p, LOCAZIONE_2: val}))} placeholder="Cerca locazione 2…" />
                      </div>
                      <Input label="Qtà bt" name="QTA_LOC2" value={giacenzeData.QTA_LOC2} onChange={e => setGiacenzeData(p => ({...p, [e.target.name]: e.target.value}))} type="number" />
                    </div>
                    <div className="border-t border-neutral-200 pt-3">
                      <MatricePicker vinoId={vinoId} onVinoUpdated={notifyUpdate} />
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">Frigo e Locazioni: modifica e salva. Matrice: le celle si salvano immediatamente al click.</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── MOVIMENTI ── */}
            <div className="border-b border-neutral-200">
              <SectionHeader title="Movimenti cantina">
                {movLoading && <span className="text-xs text-neutral-400">Aggiornamento…</span>}
              </SectionHeader>
              <div className="p-5 space-y-5">
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <select value={tipoMov} onChange={e => { setTipoMov(e.target.value); if (e.target.value === "RETTIFICA") setLocMov(""); }}
                      className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300">
                      <option value="CARICO">Carico</option>
                      <option value="SCARICO">Scarico</option>
                      <option value="VENDITA">Vendita</option>
                      <option value="RETTIFICA">Rettifica</option>
                    </select>
                    <select value={locMov} onChange={e => setLocMov(e.target.value)}
                      disabled={tipoMov === "RETTIFICA"}
                      className={`border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                        (tipoMov === "VENDITA" || tipoMov === "SCARICO") && !locMov ? "border-red-300" : "border-neutral-300"
                      } ${tipoMov === "RETTIFICA" ? "opacity-40 cursor-not-allowed" : ""}`}>
                      <option value="">— Locazione{tipoMov === "VENDITA" || tipoMov === "SCARICO" ? " *" : ""} —</option>
                      {vino?.FRIGORIFERO && <option value="frigo">{vino.FRIGORIFERO} ({vino.QTA_FRIGO ?? 0} bt)</option>}
                      {!vino?.FRIGORIFERO && <option value="frigo">Frigo ({vino?.QTA_FRIGO ?? 0} bt)</option>}
                      {vino?.LOCAZIONE_1 && <option value="loc1">{vino.LOCAZIONE_1} ({vino.QTA_LOC1 ?? 0} bt)</option>}
                      {!vino?.LOCAZIONE_1 && <option value="loc1">Loc 1 ({vino?.QTA_LOC1 ?? 0} bt)</option>}
                      {vino?.LOCAZIONE_2 && <option value="loc2">{vino.LOCAZIONE_2} ({vino.QTA_LOC2 ?? 0} bt)</option>}
                      {!vino?.LOCAZIONE_2 && <option value="loc2">Loc 2 ({vino?.QTA_LOC2 ?? 0} bt)</option>}
                      {vino?.LOCAZIONE_3 && <option value="loc3">{/^\(\d+,\d+\)/.test((vino.LOCAZIONE_3||"").trim()) ? "Matrice" : vino.LOCAZIONE_3} ({vino.QTA_LOC3 ?? 0} bt)</option>}
                      {!vino?.LOCAZIONE_3 && <option value="loc3">Loc 3 ({vino?.QTA_LOC3 ?? 0} bt)</option>}
                    </select>
                    <input type="number" placeholder="Qtà *" min={1} value={qtaMov} onChange={e => setQtaMov(e.target.value)}
                      className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
                    <button type="button" onClick={submitMovimento} disabled={submitting}
                      className="bg-amber-700 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-amber-800 transition disabled:opacity-50">
                      {submitting ? "Registro…" : "Registra"}
                    </button>
                  </div>
                  <input type="text" placeholder="Note (opzionali)" value={noteMov} onChange={e => setNoteMov(e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  {submitMsg && <p className="text-sm font-medium">{submitMsg}</p>}
                </div>
                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-100">
                      <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-center">Tipo</th>
                        <th className="px-3 py-2 text-center">Qtà</th>
                        <th className="px-3 py-2 text-left">Loc.</th>
                        <th className="px-3 py-2 text-left">Note</th>
                        <th className="px-3 py-2 text-left">Utente</th>
                        {canDelete && <th className="px-3 py-2" />}
                      </tr>
                    </thead>
                    <tbody>
                      {movimenti.map(m => {
                        const t = TIPO_LABELS[m.tipo] ?? { label: m.tipo, cls: "" };
                        return (
                          <tr key={m.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition">
                            <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">{m.data_mov?.slice(0,16).replace("T"," ")}</td>
                            <td className="px-3 py-2 text-center"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${t.cls}`}>{t.label}</span></td>
                            <td className="px-3 py-2 text-center font-semibold">{m.tipo === "MODIFICA" ? "—" : m.qta}</td>
                            <td className="px-3 py-2 text-xs text-neutral-600">{m.tipo === "MODIFICA" ? "—" : (m.locazione || "—")}</td>
                            <td className="px-3 py-2 text-xs text-neutral-700" style={{maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis"}}>{m.note || ""}</td>
                            <td className="px-3 py-2 text-xs text-neutral-500">{m.utente || "—"}</td>
                            {canDelete && <td className="px-3 py-2 text-center"><button type="button" onClick={() => deleteMovimento(m.id)} className="text-xs text-red-400 hover:text-red-600 transition" title="Elimina">🗑</button></td>}
                          </tr>
                        );
                      })}
                      {movimenti.length === 0 && (
                        <tr><td colSpan={canDelete ? 7 : 6} className="px-4 py-5 text-center text-sm text-neutral-500">Nessun movimento registrato.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ── NOTE ── */}
            <div>
              <SectionHeader title="Note operative" />
              <div className="p-5 space-y-4">
                <div className="flex gap-2">
                  <textarea value={notaText} onChange={e => setNotaText(e.target.value)} placeholder="Aggiungi una nota operativa…" rows={2}
                    className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
                  <button type="button" onClick={addNota} disabled={!notaText.trim()}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 transition disabled:opacity-40 self-end">
                    Aggiungi
                  </button>
                </div>
                {noteLoading && <p className="text-xs text-neutral-500">Caricamento…</p>}
                {!noteLoading && note.length === 0 && <p className="text-sm text-neutral-500">Nessuna nota.</p>}
                <div className="space-y-2">
                  {note.map(n => (
                    <div key={n.id} className="flex gap-3 items-start bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                      <div className="flex-1">
                        <p className="text-sm text-neutral-900 whitespace-pre-wrap">{n.nota}</p>
                        <p className="text-[11px] text-neutral-500 mt-1">{n.autore && <span className="font-medium">{n.autore} — </span>}{n.created_at?.slice(0,16).replace("T"," ")}</p>
                      </div>
                      <button type="button" onClick={() => deleteNota(n.id)} className="text-xs text-red-400 hover:text-red-600 transition shrink-0" title="Elimina nota">🗑</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
});

/* ─── Flag helpers ─────────────────────────────────────────── */
function FlagBadge({ active, label, activeColor }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
      active ? activeColor : "bg-neutral-50 text-neutral-400 border-neutral-200"
    }`}>
      {label}
    </span>
  );
}

function FlagToggle({ label, name, value, onChange }) {
  const on = value === "SI";
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-1">{label}</label>
      <button type="button" onClick={() => onChange(on ? "NO" : "SI")}
        className={`relative w-12 h-6 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-neutral-300"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? "translate-x-6" : ""}`} />
      </button>
    </div>
  );
}

export default SchedaVino;
