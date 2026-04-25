// src/pages/vini/SchedaVino.jsx
// @version: v2.0-tabs — Redesign con testa fissa (identita + 4 KPI) + tab bar (anagrafica/giacenze/movimenti/prezzi/stats/note). Sessione 55 (2026-04-24).
// Componente riutilizzabile: scheda vino completa (anagrafica + giacenze + movimenti + storico prezzi + statistiche + note)
// Usato sia inline in MagazzinoVini che come pagina standalone via MagazzinoViniDettaglio

import React, { useEffect, useState, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { API_BASE, apiFetch } from "../../config/api";
import Tooltip from "../../components/Tooltip";
import { isAdminRole } from "../../utils/authHelpers";
import {
  STATO_VENDITA, STATO_RIORDINO, STATO_CONSERVAZIONE,
  STATO_VENDITA_OPTIONS, STATO_RIORDINO_OPTIONS, STATO_CONSERVAZIONE_OPTIONS,
} from "../../config/viniConstants";
import LocationPicker from "./LocationPicker";
import MatricePicker from "./MatricePicker";
import { Btn } from "../../components/ui";

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

// Palette "chiara" per la testa colorata del nuovo layout a tab — una sfumatura
// soft che sfuma verso bianco, per non disturbare il contenuto sottostante.
const TIPOLOGIA_HEADER = {
  ROSSI:       { bg: "bg-gradient-to-b from-red-50 to-white",      border: "border-red-200",    accent: "border-l-red-600",    badge: "bg-red-100 text-red-800 border-red-200",       text: "text-red-900" },
  BIANCHI:     { bg: "bg-gradient-to-b from-amber-50 to-white",    border: "border-amber-200",  accent: "border-l-amber-600",  badge: "bg-amber-100 text-amber-800 border-amber-200", text: "text-amber-900" },
  BOLLICINE:   { bg: "bg-gradient-to-b from-yellow-50 to-white",   border: "border-yellow-200", accent: "border-l-yellow-600", badge: "bg-yellow-100 text-yellow-800 border-yellow-200", text: "text-yellow-900" },
  ROSATI:      { bg: "bg-gradient-to-b from-pink-50 to-white",     border: "border-pink-200",   accent: "border-l-pink-600",   badge: "bg-pink-100 text-pink-800 border-pink-200",   text: "text-pink-900" },
  "PASSITI E VINI DA MEDITAZIONE": { bg: "bg-gradient-to-b from-orange-50 to-white", border: "border-orange-200", accent: "border-l-orange-600", badge: "bg-orange-100 text-orange-800 border-orange-200", text: "text-orange-900" },
  "GRANDI FORMATI": { bg: "bg-gradient-to-b from-purple-50 to-white", border: "border-purple-200", accent: "border-l-purple-600", badge: "bg-purple-100 text-purple-800 border-purple-200", text: "text-purple-900" },
  "VINI ANALCOLICI": { bg: "bg-gradient-to-b from-teal-50 to-white", border: "border-teal-200", accent: "border-l-teal-600", badge: "bg-teal-100 text-teal-800 border-teal-200", text: "text-teal-900" },
  ERRORE:      { bg: "bg-gradient-to-b from-gray-50 to-white",     border: "border-gray-200",   accent: "border-l-gray-600",   badge: "bg-gray-100 text-gray-700 border-gray-200",   text: "text-gray-900" },
};

function getHeaderColors(tipologia) {
  if (!tipologia) return TIPOLOGIA_HEADER.ERRORE;
  const t = tipologia.toUpperCase();
  for (const [key, val] of Object.entries(TIPOLOGIA_HEADER)) {
    if (t.includes(key)) return val;
  }
  return TIPOLOGIA_HEADER.ERRORE;
}

// Linguette del nuovo layout a tab (sessione 2026-04-24: redesign scheda vino).
// L'ordine qui e' quello con cui compaiono nella TabBar.
const TABS = [
  { key: "anagrafica", label: "Anagrafica" },
  { key: "giacenze",   label: "Giacenze" },
  { key: "movimenti",  label: "Movimenti" },
  { key: "prezzi",     label: "Prezzi" },
  { key: "stats",      label: "Statistiche" },
  { key: "note",       label: "Note" },
];

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}

function Input({ label, name, value, onChange, onBlur, type = "text", step, min, max, placeholder, hint }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">{label}</label>
      <input type={type} step={step} min={min} max={max} placeholder={placeholder}
        name={name} value={value ?? ""} onChange={onChange} onBlur={onBlur}
        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
      {hint && <div className="text-[10px] text-neutral-400 mt-0.5">{hint}</div>}
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

  // ── tab attiva (sessione 2026-04-24: layout testa+linguette) ─
  const [activeTab, setActiveTab] = useState("anagrafica");

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

  // ── storico prezzi (Fase 8) ─────────────────────────
  const [prezziStorico, setPrezziStorico]       = useState([]);
  // Statistiche vendita (ritmo bt/mese + serie mensile). Alimenta la sezione
  // "📊 Statistiche vendita" tramite endpoint GET /vini/magazzino/{id}/stats.
  const [vinoStats, setVinoStats]               = useState(null);
  const [statsLoading, setStatsLoading]         = useState(false);
  const [prezziLoading, setPrezziLoading]       = useState(false);
  const [prezziFiltroCampo, setPrezziFiltroCampo] = useState(""); // "" = tutti

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

  // ── fetch statistiche vendita (ritmo + serie mensile) ─
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}/stats`);
      if (r.ok) setVinoStats(await r.json());
    } catch {
      // silenzioso: sezione mostra empty state
    } finally {
      setStatsLoading(false);
    }
  };

  // ── fetch storico prezzi (Fase 8) ───────────────────
  const fetchPrezziStorico = async () => {
    setPrezziLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}/prezzi-storico/`);
      if (r.ok) {
        const data = await r.json();
        setPrezziStorico(Array.isArray(data?.items) ? data.items : []);
      } else if (r.status === 404) {
        // vino non trovato: ignoro (il fetch principale lo gestisce)
        setPrezziStorico([]);
      }
    } catch {
      // silenzioso: se fallisce il fetch, la sezione mostra "Nessun cambio prezzo"
      setPrezziStorico([]);
    } finally {
      setPrezziLoading(false);
    }
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
    setMovimenti([]); setNote([]); setPrezziStorico([]); setVinoStats(null);
    fetchVino();
    fetchMovimenti();
    fetchNote();
    fetchPrezziStorico();
    fetchStats();
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

  // Ricarico = prezzo carta / costo netto fornitore (listino - sconto%).
  // Mostrato come "× 3,3" nell'header fisso; null se non calcolabile.
  const ricarico = useMemo(() => {
    if (!vino) return null;
    const listino = Number(vino.EURO_LISTINO);
    const sconto  = Number(vino.SCONTO) || 0;
    const prezzo  = Number(vino.PREZZO_CARTA);
    if (!Number.isFinite(listino) || listino <= 0) return null;
    if (!Number.isFinite(prezzo)  || prezzo  <= 0) return null;
    const costoNetto = listino * (1 - sconto / 100);
    if (costoNetto <= 0) return null;
    return prezzo / costoNetto;
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

  // Cambio linguetta con check dirty. Se l'utente ha modifiche in corso
  // (anagrafica o giacenze), chiedere conferma prima di cambiare tab e
  // annullare la modalita' edit per evitare stati inconsistenti.
  const handleChangeTab = (newTab) => {
    if (newTab === activeTab) return;
    if (hasPendingChanges()) {
      if (!window.confirm("Hai modifiche non salvate. Vuoi davvero cambiare sezione?")) return;
      if (editMode) setEditMode(false);
      if (giacenzeEdit) setGiacenzeEdit(false);
    }
    setActiveTab(newTab);
  };

  // Sessione 58 (2026-04-25): toggle "bottiglia in mescita".
  // Aggiorna solo il flag BOTTIGLIA_APERTA via PATCH; il vino resta visibile
  // nella carta calici anche con QTA_TOTALE=0 finche' il flag e' 1.
  const [bottigliaSaving, setBottigliaSaving] = useState(false);
  const toggleBottigliaAperta = async () => {
    if (!vino) return;
    const next = vino.BOTTIGLIA_APERTA ? 0 : 1;
    setBottigliaSaving(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ BOTTIGLIA_APERTA: next }),
      });
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      notifyUpdate(await r.json());
    } catch (e) {
      alert(e.message || "Errore");
    } finally {
      setBottigliaSaving(false);
    }
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

  // Auto-calcolo PREZZO_CARTA quando EURO_LISTINO cambia (onBlur).
  // Sessione 58 fix: ricalcola in cascata anche PREZZO_CALICE quando non e'
  // stato impostato manualmente (PREZZO_CALICE_MANUALE=0). Prima del fix il
  // calice si aggiornava solo se l'utente digitava il prezzo carta a mano,
  // perche' il setEditData programmatico non triggera l'onChange dell'input.
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
        setEditData(p => {
          const upd = { ...p, PREZZO_CARTA: data.prezzo_carta };
          // Ricalcola calice solo se non e' stato fissato manualmente.
          if (!p.PREZZO_CALICE_MANUALE) {
            const pf = parseFloat(data.prezzo_carta);
            upd.PREZZO_CALICE = pf > 0 ? (Math.round((pf / 5) * 2) / 2).toFixed(1) : "";
          }
          return upd;
        });
        setPrezzoAutoCalc(true);
        setTimeout(() => setPrezzoAutoCalc(false), 2000);
      }
    } catch {}
  };

  const saveEdit = async () => {
    // Sessione 58: validazioni hard prima del PATCH (annata 4 cifre, grado 0-25%).
    // L'attributo HTML min/max sull'input e' solo indicativo, non blocca submit.
    if (editData.ANNATA != null && editData.ANNATA !== "") {
      const a = String(editData.ANNATA).trim();
      const annoMax = new Date().getFullYear() + 2;
      if (!/^\d{4}$/.test(a) || Number(a) < 1900 || Number(a) > annoMax) {
        setSaveMsg(`❌ Annata non valida: deve essere un anno a 4 cifre tra 1900 e ${annoMax}.`);
        return;
      }
    }
    if (editData.GRADO_ALCOLICO != null && editData.GRADO_ALCOLICO !== "") {
      const g = parseFloat(editData.GRADO_ALCOLICO);
      if (!Number.isFinite(g) || g < 0 || g > 25) {
        setSaveMsg("❌ Grado alcolico non valido: deve essere tra 0 e 25%.");
        return;
      }
    }
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
      fetchPrezziStorico();  // Fase 8: ricarica storico se sono cambiati prezzi
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

  const hdr = vino ? getHeaderColors(vino.TIPOLOGIA) : getHeaderColors(null);
  const ritmoMese = vinoStats?.ritmo_vendita?.bt_mese;
  // Contatori per le linguette
  const tabCount = (key) =>
    key === "movimenti" ? movimenti.length :
    key === "prezzi"    ? prezziStorico.length :
    key === "note"      ? note.length :
    null;

  return (
    <div className={`${inline ? "rounded-2xl shadow-lg" : "rounded-3xl shadow-2xl"} overflow-hidden border border-neutral-200 bg-white`}>

      {loading && <div className="bg-white px-8 py-6"><p className="text-sm text-neutral-500">Caricamento…</p></div>}
      {error && !loading && <div className="bg-white px-8 py-6"><p className="text-sm text-red-600">{error}</p></div>}

      {!loading && !error && vino && (
        <div className={`flex flex-col border-l-4 ${hdr.accent}`} style={{ height: inline ? "78vh" : "88vh" }}>

          {/* ═══════════ TESTA: identita + 4 KPI ═══════════ */}
          <div className={`${hdr.bg} border-b ${hdr.border} px-4 md:px-5 py-3 md:py-4 flex-shrink-0`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {/* Badge identita + stato */}
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-neutral-900 text-white">#{vino.id}</span>
                  {vino.TIPOLOGIA && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${hdr.badge}`}>{vino.TIPOLOGIA}</span>}
                  {vino.CARTA === "SI" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">In carta</span>}
                  {vino.IPRATICO === "SI" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-sky-50 text-sky-700 border-sky-200">iPratico</span>}
                  {vino.VENDITA_CALICE === "SI" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-violet-50 text-violet-700 border-violet-200">Calice</span>}
                  {vino.BIOLOGICO === "SI" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-lime-50 text-lime-700 border-lime-200">Biologico</span>}
                  {vino.STATO_VENDITA && (() => { const s = STATO_VENDITA[vino.STATO_VENDITA]; return s ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${s.color}`}>{s.label}</span> : null; })()}
                </div>
                {/* Nome vino */}
                <h2 className={`text-base md:text-lg font-bold leading-tight ${hdr.text}`}>
                  {vino.DESCRIZIONE}
                  {vino.ANNATA ? <span className="opacity-70 font-semibold"> · {vino.ANNATA}</span> : null}
                  {vino.FORMATO ? <span className="opacity-70 font-normal"> · {vino.FORMATO}</span> : null}
                </h2>
                {/* Sottotitolo: produttore · regione · vitigni · grado */}
                <p className="text-xs text-neutral-600 mt-0.5">
                  {[
                    vino.PRODUTTORE,
                    vino.REGIONE,
                    vino.VITIGNI,
                    vino.GRADO_ALCOLICO ? `${fmtNum(vino.GRADO_ALCOLICO, 1)}%` : null,
                  ].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {onClose && (
                <button type="button" onClick={handleClose} aria-label="Chiudi scheda"
                  className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition text-sm font-semibold">
                  ✕
                </button>
              )}
            </div>

            {/* 3 KPI sempre visibili — giacenza / prezzo carta / ritmo.
                Il ricarico e' stato spostato nella tab Prezzi (sessione 55). */}
            <div className="grid grid-cols-3 gap-2 md:gap-3 mt-3">
              <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Giacenza</div>
                <div className="text-lg md:text-xl font-bold text-neutral-900">
                  {tot}<span className="text-xs font-normal text-neutral-500"> bt</span>
                </div>
              </div>
              <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Prezzo carta</div>
                <div className="text-lg md:text-xl font-bold text-neutral-900">
                  {vino.PREZZO_CARTA != null ? `${fmtNum(vino.PREZZO_CARTA, 0)} €` : "—"}
                </div>
              </div>
              <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Ritmo</div>
                <div className="text-lg md:text-xl font-bold text-neutral-900">
                  {ritmoMese != null
                    ? <>{fmtNum(ritmoMese, 1)}<span className="text-xs font-normal text-neutral-500"> bt/m</span></>
                    : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════ TAB BAR ═══════════ */}
          <div className="flex gap-1 px-2 md:px-4 border-b border-neutral-200 bg-white overflow-x-auto flex-shrink-0">
            {TABS.map(tab => {
              const active = activeTab === tab.key;
              const c = tabCount(tab.key);
              return (
                <button key={tab.key} type="button" onClick={() => handleChangeTab(tab.key)}
                  className={`px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-medium transition whitespace-nowrap flex-shrink-0 ${
                    active
                      ? "text-neutral-900 border-b-2 border-brand-red -mb-px"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}>
                  {tab.label}
                  {c != null && c > 0 && (
                    <span className="ml-1.5 text-[10px] font-normal text-neutral-400">{c}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ═══════════ TAB CONTENT ═══════════ */}
          <div className="flex-1 overflow-y-auto bg-white">

            {/* ── ANAGRAFICA ── */}
            {activeTab === "anagrafica" && (
            <div>
              <SectionHeader title="Anagrafica">
                {saveMsg && <span className="text-xs font-medium">{saveMsg}</span>}
                {!editMode && (
                  <Btn variant="primary" size="sm" type="button" onClick={startEdit}>✎ Modifica</Btn>
                )}
                {editMode && <>
                  <Btn variant="secondary" size="sm" type="button" onClick={cancelEdit}>Annulla</Btn>
                  <Btn variant="primary" size="sm" type="button" onClick={saveEdit} disabled={saving} loading={saving}>{saving ? "Salvo…" : "Salva"}</Btn>
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-neutral-100">
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
                      <Input label="Annata (AAAA)" name="ANNATA" value={editData.ANNATA}
                        onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))}
                        type="number" step="1" min={1900} max={new Date().getFullYear() + 2}
                        placeholder="es. 2019" hint="solo anno a 4 cifre" />
                      <SelectTabellato label="Formato" name="FORMATO" value={editData.FORMATO} valori={tabellaOpts.formati} valueKey="formato" onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                      <Input label="Vitigni" name="VITIGNI" value={editData.VITIGNI} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                      <Input label="Grado alcolico (%)" name="GRADO_ALCOLICO" value={editData.GRADO_ALCOLICO}
                        onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))}
                        type="number" step="0.1" min={0} max={25} placeholder="es. 14.5" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Input label="Produttore" name="PRODUTTORE" value={editData.PRODUTTORE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                      <Input label="Distributore" name="DISTRIBUTORE" value={editData.DISTRIBUTORE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                      <Input label="Rappresentante" name="RAPPRESENTANTE" value={editData.RAPPRESENTANTE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="relative">
                        <Input label={`Prezzo carta €${prezzoAutoCalc ? " ✓ auto" : ""}`} name="PREZZO_CARTA" value={editData.PREZZO_CARTA}
                          onChange={e => {
                            const val = e.target.value;
                            setEditData(p => {
                              const upd = { ...p, PREZZO_CARTA: val };
                              // Auto-calcola calice se non manuale
                              if (!p.PREZZO_CALICE_MANUALE) {
                                const pf = parseFloat(val);
                                upd.PREZZO_CALICE = pf > 0 ? (Math.round((pf / 5) * 2) / 2).toFixed(1) : "";
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
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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

            )}

            {/* ── GIACENZE ── */}
            {activeTab === "giacenze" && (
            <div>
              <SectionHeader title="Giacenze per locazione">
                {!giacenzeEdit && (
                  <Btn variant="primary" size="sm" type="button" onClick={startGiacenze}>✎ Modifica</Btn>
                )}
                {giacenzeEdit && <>
                  <Btn variant="secondary" size="sm" type="button" onClick={cancelGiacenze}>Annulla</Btn>
                  <Btn variant="primary" size="sm" type="button" onClick={saveGiacenze} disabled={giacenzeSaving} loading={giacenzeSaving}>{giacenzeSaving ? "Salvo…" : "Salva"}</Btn>
                </>}
              </SectionHeader>
              <div className="p-5">
                {/* Toggle "Bottiglia in mescita" — visibile solo se vendita al calice abilitata.
                    Quando ON, il vino resta in carta calici anche con QTA_TOTALE=0. */}
                {vino.VENDITA_CALICE === "SI" && (
                  <div className={`mb-4 p-3 rounded-xl border flex items-center justify-between gap-3 ${
                    vino.BOTTIGLIA_APERTA
                      ? "bg-amber-50 border-amber-300"
                      : "bg-neutral-50 border-neutral-200"
                  }`}>
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold ${vino.BOTTIGLIA_APERTA ? "text-amber-900" : "text-neutral-700"}`}>
                        🍷 Bottiglia in mescita {vino.BOTTIGLIA_APERTA ? "— ATTIVA" : "— spenta"}
                      </div>
                      <div className="text-[11px] text-neutral-600 mt-0.5">
                        {vino.BOTTIGLIA_APERTA
                          ? "Il vino resta nella carta calici anche con giacenza 0. Spegni quando i calici finiscono."
                          : "Quando apri una bottiglia per la mescita, accendi il flag così il vino resta in carta anche se la giacenza va a zero."}
                      </div>
                    </div>
                    <button type="button" onClick={toggleBottigliaAperta} disabled={bottigliaSaving}
                      className={`relative shrink-0 w-14 h-8 rounded-full transition-colors disabled:opacity-50 ${
                        vino.BOTTIGLIA_APERTA ? "bg-amber-500" : "bg-neutral-300"
                      }`}>
                      <span className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                        vino.BOTTIGLIA_APERTA ? "translate-x-6" : ""
                      }`} />
                    </button>
                  </div>
                )}
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

            )}

            {/* ── MOVIMENTI ── */}
            {activeTab === "movimenti" && (
            <div>
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
                    <Btn variant="primary" size="md" type="button" onClick={submitMovimento} disabled={submitting} loading={submitting}>
                      {submitting ? "Registro…" : "Registra"}
                    </Btn>
                  </div>
                  <input type="text" placeholder="Note (opzionali)" value={noteMov} onChange={e => setNoteMov(e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  {submitMsg && <p className="text-sm font-medium">{submitMsg}</p>}
                </div>
                <div className="border border-neutral-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
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
                            {canDelete && <td className="px-3 py-2 text-center"><Tooltip label="Elimina"><button type="button" onClick={() => deleteMovimento(m.id)} className="text-xs text-red-400 hover:text-red-600 transition">🗑</button></Tooltip></td>}
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

            )}

            {/* ── STORICO PREZZI (Fase 8) ── */}
            {activeTab === "prezzi" && (
            <div>
              <SectionHeader title="Storico prezzi">
                {prezziLoading && <span className="text-xs text-neutral-400">Aggiornamento…</span>}
                <Btn variant="secondary" size="sm" type="button" onClick={fetchPrezziStorico} disabled={prezziLoading}>
                  ⟳ Aggiorna
                </Btn>
              </SectionHeader>
              <div className="p-5 space-y-4">
                {/* Riepilogo prezzi attuali + ricarico calcolato (sessione 55) */}
                {(() => {
                  const listino = vino.EURO_LISTINO != null ? Number(vino.EURO_LISTINO) : null;
                  const sconto  = vino.SCONTO != null ? Number(vino.SCONTO) : null;
                  const costoNetto = (listino != null && listino > 0)
                    ? listino * (1 - (sconto || 0) / 100)
                    : null;
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
                      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Listino</div>
                        <div className="text-base md:text-lg font-bold text-neutral-900">
                          {listino != null ? `${fmtNum(listino)} €` : "—"}
                        </div>
                      </div>
                      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Sconto</div>
                        <div className="text-base md:text-lg font-bold text-neutral-900">
                          {sconto != null ? `${fmtNum(sconto)} %` : "—"}
                        </div>
                      </div>
                      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Costo netto</div>
                        <div className="text-base md:text-lg font-bold text-neutral-900">
                          {costoNetto != null ? `${fmtNum(costoNetto)} €` : "—"}
                        </div>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                        <div className="text-[10px] text-emerald-700 uppercase tracking-wide">Prezzo carta</div>
                        <div className="text-base md:text-lg font-bold text-emerald-800">
                          {vino.PREZZO_CARTA != null ? `${fmtNum(vino.PREZZO_CARTA)} €` : "—"}
                        </div>
                      </div>
                      <div className={`rounded-lg p-2.5 border ${
                        ricarico == null ? "bg-neutral-50 border-neutral-200" :
                        ricarico >= 3    ? "bg-emerald-50 border-emerald-200" :
                        ricarico >= 2    ? "bg-amber-50 border-amber-200" :
                                           "bg-red-50 border-red-200"
                      }`}>
                        <div className={`text-[10px] uppercase tracking-wide ${
                          ricarico == null ? "text-neutral-500" :
                          ricarico >= 3    ? "text-emerald-700" :
                          ricarico >= 2    ? "text-amber-700"  :
                                             "text-red-700"
                        }`}>Ricarico</div>
                        <div className={`text-base md:text-lg font-bold ${
                          ricarico == null ? "text-neutral-400" :
                          ricarico >= 3    ? "text-emerald-800" :
                          ricarico >= 2    ? "text-amber-800"  :
                                             "text-red-800"
                        }`}>
                          {ricarico != null ? `× ${fmtNum(ricarico, 1)}` : "—"}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {(() => {
                  const CAMPI_LABEL = {
                    EURO_LISTINO:  { label: "Listino",   cls: "bg-teal-50 text-teal-700 border-teal-200" },
                    PREZZO_CARTA:  { label: "Carta",     cls: "bg-amber-50 text-amber-700 border-amber-200" },
                    PREZZO_CALICE: { label: "Calice",    cls: "bg-rose-50 text-rose-700 border-rose-200" },
                    SCONTO:        { label: "Sconto",    cls: "bg-violet-50 text-violet-700 border-violet-200" },
                  };
                  const ORIGINE_LABEL = {
                    "GESTIONALE-EDIT":       { label: "Gestionale",   cls: "bg-blue-50 text-blue-700 border-blue-200" },
                    "SYNC-CARTA":            { label: "Sync carta",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                    "BULK-UPDATE":           { label: "Modifica massiva", cls: "bg-orange-50 text-orange-700 border-orange-200" },
                    "PRICING-CALCOLA":       { label: "Ricalcolo",    cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
                    "PRICING-APPLICA":       { label: "Applica prezzi", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
                  };
                  const filtered = prezziFiltroCampo
                    ? prezziStorico.filter(p => p.campo === prezziFiltroCampo)
                    : prezziStorico;

                  const fmtPrezzo = (val, campo) => {
                    if (val == null) return <span className="text-neutral-300 italic">nessuno</span>;
                    const n = Number(val);
                    if (!Number.isFinite(n)) return String(val);
                    if (campo === "SCONTO") return `${fmtNum(n)} %`;
                    return `${fmtNum(n)} €`;
                  };
                  const fmtDelta = (prima, dopo, campo) => {
                    const p = prima != null ? Number(prima) : null;
                    const d = dopo != null ? Number(dopo) : null;
                    if (p == null || d == null) return null;
                    const diff = d - p;
                    if (Math.abs(diff) < 0.005) return null;
                    const up = diff > 0;
                    const segno = up ? "▲" : "▼";
                    const cls = up ? "text-red-600" : "text-emerald-700";
                    const suffix = campo === "SCONTO" ? " %" : " €";
                    return (
                      <span className={`text-[11px] font-semibold ${cls}`}>
                        {segno} {fmtNum(Math.abs(diff))}{suffix}
                      </span>
                    );
                  };

                  return (
                    <>
                      {/* Filtro per campo */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Filtra:</span>
                        <button
                          type="button"
                          onClick={() => setPrezziFiltroCampo("")}
                          className={`text-xs px-2.5 py-1 rounded-full border transition ${
                            prezziFiltroCampo === ""
                              ? "bg-neutral-800 text-white border-neutral-800"
                              : "bg-white text-neutral-600 border-neutral-300 hover:border-neutral-500"
                          }`}
                        >
                          Tutti ({prezziStorico.length})
                        </button>
                        {Object.entries(CAMPI_LABEL).map(([k, info]) => {
                          const count = prezziStorico.filter(p => p.campo === k).length;
                          if (count === 0) return null;
                          const active = prezziFiltroCampo === k;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setPrezziFiltroCampo(active ? "" : k)}
                              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                                active
                                  ? "bg-neutral-800 text-white border-neutral-800"
                                  : `${info.cls} hover:opacity-80`
                              }`}
                            >
                              {info.label} ({count})
                            </button>
                          );
                        })}
                      </div>

                      {/* Lista */}
                      {!prezziLoading && filtered.length === 0 && (
                        <div className="text-center py-8 text-sm text-neutral-500 bg-neutral-50 rounded-xl border border-neutral-200">
                          {prezziStorico.length === 0
                            ? "Nessun cambio prezzo registrato per questo vino."
                            : "Nessun cambio prezzo corrisponde al filtro."}
                        </div>
                      )}
                      {filtered.length > 0 && (
                        <div className="border border-neutral-200 rounded-xl overflow-x-auto">
                          <table className="w-full text-sm min-w-[720px]">
                            <thead className="bg-neutral-100">
                              <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                                <th className="px-3 py-2 text-left">Data</th>
                                <th className="px-3 py-2 text-center">Campo</th>
                                <th className="px-3 py-2 text-right">Prima</th>
                                <th className="px-3 py-2 text-right">Dopo</th>
                                <th className="px-3 py-2 text-center">Δ</th>
                                <th className="px-3 py-2 text-center">Origine</th>
                                <th className="px-3 py-2 text-left">Utente</th>
                                <th className="px-3 py-2 text-left">Note</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filtered.map(p => {
                                const info   = CAMPI_LABEL[p.campo] || { label: p.campo, cls: "bg-neutral-50 text-neutral-600 border-neutral-200" };
                                const origin = ORIGINE_LABEL[p.origine] || (p.origine ? { label: p.origine, cls: "bg-neutral-50 text-neutral-500 border-neutral-200" } : null);
                                return (
                                  <tr key={p.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition">
                                    <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                                      {p.created_at?.slice(0, 16).replace("T", " ") || "—"}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${info.cls}`}>
                                        {info.label}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs text-neutral-600">
                                      {fmtPrezzo(p.valore_prima, p.campo)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-neutral-900">
                                      {fmtPrezzo(p.valore_dopo, p.campo)}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      {fmtDelta(p.valore_prima, p.valore_dopo, p.campo) || <span className="text-neutral-300">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      {origin ? (
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${origin.cls}`}>
                                          {origin.label}
                                        </span>
                                      ) : (
                                        <span className="text-neutral-300 text-xs">—</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-neutral-500">{p.utente || "—"}</td>
                                    <td className="px-3 py-2 text-xs text-neutral-700" style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {p.note || ""}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            )}

            {/* ── STATISTICHE VENDITA (v1.4) ── */}
            {activeTab === "stats" && (
            <div>
              <SectionHeader title="Statistiche vendita">
                {statsLoading && <span className="text-xs text-neutral-400">Aggiornamento…</span>}
                <Btn variant="secondary" size="sm" type="button" onClick={fetchStats} disabled={statsLoading}>
                  ⟳ Aggiorna
                </Btn>
              </SectionHeader>
              <div className="p-5 space-y-4">
                {!vinoStats ? (
                  <p className="text-sm text-neutral-500">Caricamento statistiche…</p>
                ) : (() => {
                  const rv = vinoStats.ritmo_vendita || {};
                  const tone = rv.color_tone;
                  const ritmoBadgeCls =
                    tone === "emerald"       ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                    : tone === "amber"        ? "bg-amber-100 text-amber-800 border-amber-200"
                    : tone === "neutral-dark" ? "bg-slate-200 text-slate-600 border-slate-300"
                    :                           "bg-neutral-100 text-neutral-700 border-neutral-200";
                  const ritmoBarCls =
                    tone === "emerald"       ? "#10b981"
                    : tone === "amber"        ? "#f59e0b"
                    : tone === "neutral-dark" ? "#94a3b8"
                    :                           "#9ca3af";
                  const ultVen = vinoStats.ultima_vendita
                    ? new Date(vinoStats.ultima_vendita).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })
                    : "mai";
                  // Formatta mese YYYY-MM → "apr 26" per XAxis
                  const MESI_ABBR = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
                  const serie = (vinoStats.vendite_per_mese || []).map(m => {
                    const [y, mm] = m.mese.split("-");
                    return { label: `${MESI_ABBR[parseInt(mm,10) - 1]} ${y.slice(2)}`, qta: m.qta };
                  });
                  return (
                    <>
                      {/* KPI — 4 card compatte */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                          <div className="text-[11px] text-neutral-500 uppercase tracking-wide">Vendite totali</div>
                          <div className="text-xl font-bold text-neutral-800 mt-0.5">{vinoStats.vendite_totali}</div>
                          <div className="text-[11px] text-neutral-400">
                            bottiglie
                            {/* Sessione 58: dettaglio mescita + scarichi se presenti */}
                            {(vinoStats.vendite_calici > 0 || vinoStats.scarichi > 0) && (
                              <span className="block mt-0.5 text-[10px] text-neutral-500">
                                {vinoStats.vendite_calici > 0 && <>di cui mescita {vinoStats.vendite_calici}</>}
                                {vinoStats.vendite_calici > 0 && vinoStats.scarichi > 0 && " · "}
                                {vinoStats.scarichi > 0 && <>scaricate {vinoStats.scarichi}</>}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={`rounded-lg border p-3 ${ritmoBadgeCls}`}>
                          <div className="text-[11px] uppercase tracking-wide opacity-80">Ritmo vendita</div>
                          <div className="text-xl font-bold mt-0.5">
                            {rv.bt_mese != null ? `${rv.bt_mese.toFixed(1)}` : "—"}
                            {rv.bt_mese != null && <span className="text-xs font-normal opacity-80"> bt/mese</span>}
                          </div>
                          <div className="text-[11px] opacity-80">{rv.label || "—"}</div>
                        </div>
                        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                          <div className="text-[11px] text-neutral-500 uppercase tracking-wide">Ultima vendita</div>
                          <div className="text-xl font-bold text-neutral-800 mt-0.5">{ultVen}</div>
                          <div className="text-[11px] text-neutral-400">
                            {vinoStats.ultima_vendita ? `${Math.floor((Date.now() - new Date(vinoStats.ultima_vendita).getTime()) / 86400000)}gg fa` : "—"}
                          </div>
                        </div>
                        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                          <div className="text-[11px] text-neutral-500 uppercase tracking-wide">Storico</div>
                          <div className="text-xl font-bold text-neutral-800 mt-0.5">
                            {rv.mesi_storico != null ? rv.mesi_storico.toFixed(1) : "—"}
                          </div>
                          <div className="text-[11px] text-neutral-400">
                            mesi (dal {vinoStats.data_inizio_storico?.slice(5) || "—"})
                          </div>
                        </div>
                      </div>

                      {/* Grafico vendite per mese */}
                      {serie.length > 0 ? (
                        <div className="bg-white border border-neutral-200 rounded-xl p-4">
                          <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-3">
                            Vendite per mese
                          </div>
                          <div style={{ width: "100%", height: 200 }}>
                            <ResponsiveContainer>
                              <BarChart data={serie} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                                <XAxis dataKey="label" stroke="#6b7280" fontSize={11} />
                                <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                                <RechartsTooltip
                                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                                  formatter={(value) => [`${value} bt`, "Vendute"]}
                                />
                                <Bar dataKey="qta" fill={ritmoBarCls} radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 text-center text-sm text-neutral-500">
                          Nessuna vendita registrata dall'inizio del sistema ({vinoStats.data_inizio_storico}).
                        </div>
                      )}

                      {/* Nota metodologica — solo se storico breve (< 90gg) per trasparenza */}
                      {rv.giorni_storico != null && rv.giorni_storico < 90 && vinoStats.vendite_totali > 0 && (
                        <p className="text-[11px] text-neutral-400 italic">
                          Storico disponibile: {rv.giorni_storico}gg. Il ritmo mensile è una stima, si stabilizza con più dati.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            )}

            {/* ── NOTE ── */}
            {activeTab === "note" && (
            <div>
              <SectionHeader title="Note operative" />
              <div className="p-5 space-y-4">
                <div className="flex gap-2">
                  <textarea value={notaText} onChange={e => setNotaText(e.target.value)} placeholder="Aggiungi una nota operativa…" rows={2}
                    className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
                  <Btn variant="primary" size="md" type="button" onClick={addNota} disabled={!notaText.trim()} className="self-end">
                    Aggiungi
                  </Btn>
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
                      <Tooltip label="Elimina nota"><button type="button" onClick={() => deleteNota(n.id)} className="text-xs text-red-400 hover:text-red-600 transition shrink-0">🗑</button></Tooltip>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            )}

          </div>

          {/* ═══════════ FOOTER AZIONI ═══════════ */}
          <div className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-cream border-t border-neutral-200 flex-shrink-0">
            <Btn variant="secondary" size="md" type="button" onClick={handleDuplica} disabled={duplicating}>
              {duplicating ? "Duplico…" : "Duplica vino"}
            </Btn>
            {saveMsg && <span className="text-xs font-medium text-neutral-600">{saveMsg}</span>}
            <span className="flex-1" />
            {onClose && (
              <Btn variant="secondary" size="md" type="button" onClick={handleClose}>
                Chiudi
              </Btn>
            )}
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
