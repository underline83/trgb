// src/pages/vini/SchedaVino.jsx
// @version: v1.0
// Componente riutilizzabile: scheda vino completa (anagrafica + giacenze + movimenti + note)
// Usato sia inline in MagazzinoVini che come pagina standalone via MagazzinoViniDettaglio

import React, { useEffect, useState, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import {
  STATO_VENDITA, STATO_RIORDINO, STATO_CONSERVAZIONE,
  STATO_VENDITA_OPTIONS, STATO_RIORDINO_OPTIONS, STATO_CONSERVAZIONE_OPTIONS,
} from "../../config/viniConstants";
import LocationPicker from "./LocationPicker";
import MatricePicker from "./MatricePicker";

const TIPO_LABELS = {
  CARICO:    { label: "Carico",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  SCARICO:   { label: "Scarico",   cls: "bg-red-50 text-red-700 border-red-200" },
  VENDITA:   { label: "Vendita",   cls: "bg-blue-50 text-blue-700 border-blue-200" },
  RETTIFICA: { label: "Rettifica", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}

function Input({ label, name, value, onChange, type = "text", step }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">{label}</label>
      <input type={type} step={step} name={name} value={value ?? ""} onChange={onChange}
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

function SelectTabellato({ label, name, value, onChange, valori, placeholder = "— seleziona —" }) {
  // Assicura che il valore corrente sia nelle opzioni (anche se non torna dal DB)
  const opts = valori.includes(value) || !value ? valori : [value, ...valori];
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">{label}</label>
      <select name={name} value={value ?? ""} onChange={onChange}
        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300">
        <option value="">{placeholder}</option>
        {opts.map(v => <option key={v} value={v}>{v}</option>)}
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
  const canDelete = role === "admin" || role === "sommelier" || role === "sala";
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
    tipologie: [], nazioni: [], regioni: [], codici: [], formati: [],
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
          codici: d.codici || [], formati: d.formati || [],
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
      CODICE: vino.CODICE ?? "", REGIONE: vino.REGIONE ?? "",
      DESCRIZIONE: vino.DESCRIZIONE ?? "", DENOMINAZIONE: vino.DENOMINAZIONE ?? "",
      ANNATA: vino.ANNATA ?? "", VITIGNI: vino.VITIGNI ?? "",
      GRADO_ALCOLICO: vino.GRADO_ALCOLICO ?? "", FORMATO: vino.FORMATO ?? "",
      PRODUTTORE: vino.PRODUTTORE ?? "", DISTRIBUTORE: vino.DISTRIBUTORE ?? "",
      PREZZO_CARTA: vino.PREZZO_CARTA ?? "", EURO_LISTINO: vino.EURO_LISTINO ?? "",
      SCONTO: vino.SCONTO ?? "", NOTE_PREZZO: vino.NOTE_PREZZO ?? "",
      CARTA: vino.CARTA ?? "NO", IPRATICO: vino.IPRATICO ?? "NO",
      STATO_VENDITA: vino.STATO_VENDITA ?? "",
      STATO_RIORDINO: vino.STATO_RIORDINO ?? "",
      STATO_CONSERVAZIONE: vino.STATO_CONSERVAZIONE ?? "",
      NOTE_STATO: vino.NOTE_STATO ?? "",
      NOTE: vino.NOTE ?? "",
    });
    setEditMode(true); setSaveMsg("");
  };

  const saveEdit = async () => {
    setSaving(true); setSaveMsg("");
    try {
      const payload = { ...editData };
      ["GRADO_ALCOLICO","PREZZO_CARTA","EURO_LISTINO","SCONTO"].forEach(k => {
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

  return (
    <div className="space-y-0">

      {/* HEADER */}
      <div className={`bg-white ${inline ? "shadow-lg rounded-t-2xl" : "shadow-2xl rounded-t-3xl"} px-6 sm:px-8 pt-6 pb-4 border border-neutral-200 border-b-0`}>
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h2 className={`${inline ? "text-xl" : "text-3xl"} font-bold text-amber-900 tracking-wide font-playfair truncate`}>
                {vino ? vino.DESCRIZIONE : "Scheda Vino"}
              </h2>
              {vino && (
                <span className="inline-flex items-center bg-slate-700 text-white text-[11px] font-bold px-2 py-0.5 rounded font-mono tracking-tight shrink-0">
                  #{vino.id}
                </span>
              )}
            </div>
            {vino && (
              <p className="text-neutral-500 text-sm">
                {vino.TIPOLOGIA} · {vino.NAZIONE}{vino.REGIONE ? ` / ${vino.REGIONE}` : ""}
                {vino.ANNATA ? ` · ${vino.ANNATA}` : ""}
                {vino.PRODUTTORE ? ` · ${vino.PRODUTTORE}` : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {vino && (
              <div className="text-right">
                <div className="text-xs text-neutral-500">Giacenza totale</div>
                <div className="text-2xl font-bold text-amber-900">{tot} bt</div>
              </div>
            )}
            <button type="button" onClick={handleDuplica} disabled={duplicating}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 shadow-sm transition disabled:opacity-50">
              {duplicating ? "Duplico…" : "Duplica"}
            </button>
            {onClose && (
              <button type="button" onClick={handleClose}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
                ✕ Chiudi
              </button>
            )}
          </div>
        </div>
      </div>

      {loading && <div className="bg-white px-8 py-6 border border-neutral-200 border-t-0 rounded-b-3xl"><p className="text-sm text-neutral-500">Caricamento…</p></div>}
      {error && !loading && <div className="bg-white px-8 py-6 border border-neutral-200 border-t-0 rounded-b-3xl"><p className="text-sm text-red-600">{error}</p></div>}

      {!loading && !error && vino && (<>

        {/* ── ANAGRAFICA ──────────────────────────────── */}
        <div className="bg-white border border-neutral-200 border-t-0">
          <SectionHeader title="Anagrafica">
            {saveMsg && <span className="text-xs font-medium">{saveMsg}</span>}
            {!editMode
              ? <button type="button" onClick={startEdit} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition">✏️ Modifica</button>
              : <>
                  <button type="button" onClick={cancelEdit} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 bg-white hover:bg-neutral-100 transition">Annulla</button>
                  <button type="button" onClick={saveEdit} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 transition disabled:opacity-50">{saving ? "Salvo…" : "💾 Salva"}</button>
                </>
            }
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
                  <Field label="Codice" value={vino.CODICE} />
                  <Field label="Vitigni" value={vino.VITIGNI} />
                  <Field label="Grado alcolico" value={vino.GRADO_ALCOLICO ? `${vino.GRADO_ALCOLICO}%` : null} />
                </div>
                <div className="grid grid-cols-3 gap-4 pt-3 border-t border-neutral-100">
                  <Field label="Prezzo carta" value={vino.PREZZO_CARTA != null ? `${Number(vino.PREZZO_CARTA).toFixed(2)} €` : null} />
                  <Field label="Listino" value={vino.EURO_LISTINO != null ? `${Number(vino.EURO_LISTINO).toFixed(2)} €` : null} />
                  <Field label="Sconto" value={vino.SCONTO != null ? `${Number(vino.SCONTO).toFixed(2)}%` : null} />
                </div>
                {/* ── Flag + Stati operativi ── */}
                <div className="pt-3 border-t border-neutral-100 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${vino.CARTA === "SI" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-neutral-50 text-neutral-500 border-neutral-200"}`}>
                      CARTA: {vino.CARTA || "NO"}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${vino.IPRATICO === "SI" ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-neutral-50 text-neutral-500 border-neutral-200"}`}>
                      iPratico: {vino.IPRATICO || "NO"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {vino.STATO_VENDITA && (() => {
                      const s = STATO_VENDITA[vino.STATO_VENDITA];
                      return s ? (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${s.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                          {s.label}
                        </span>
                      ) : null;
                    })()}
                    {vino.STATO_RIORDINO && (() => {
                      const s = STATO_RIORDINO[vino.STATO_RIORDINO];
                      return s ? (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${s.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                          Riordino: {s.label}
                        </span>
                      ) : null;
                    })()}
                    {vino.STATO_CONSERVAZIONE && (() => {
                      const s = STATO_CONSERVAZIONE[vino.STATO_CONSERVAZIONE];
                      return s ? (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${s.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                          Conservazione: {s.label}
                        </span>
                      ) : null;
                    })()}
                    {vino.NOTE_STATO && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-neutral-50 text-neutral-600 border-neutral-200">
                        {vino.NOTE_STATO}
                      </span>
                    )}
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SelectTabellato label="Tipologia *" name="TIPOLOGIA" value={editData.TIPOLOGIA} valori={tabellaOpts.tipologie} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                  <SelectTabellato label="Nazione *" name="NAZIONE" value={editData.NAZIONE} valori={tabellaOpts.nazioni} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                  <SelectTabellato label="Regione" name="REGIONE" value={editData.REGIONE} valori={tabellaOpts.regioni} placeholder="— nessuna —" onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                  <SelectTabellato label="Codice" name="CODICE" value={editData.CODICE} valori={tabellaOpts.codici} placeholder="— nessuno —" onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Input label="Annata" name="ANNATA" value={editData.ANNATA} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                  <SelectTabellato label="Formato" name="FORMATO" value={editData.FORMATO} valori={tabellaOpts.formati} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                  <Input label="Vitigni" name="VITIGNI" value={editData.VITIGNI} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                  <Input label="Grado alcolico" name="GRADO_ALCOLICO" value={editData.GRADO_ALCOLICO} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} type="number" step="0.1" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Produttore" name="PRODUTTORE" value={editData.PRODUTTORE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                  <Input label="Distributore" name="DISTRIBUTORE" value={editData.DISTRIBUTORE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Input label="Prezzo carta €" name="PREZZO_CARTA" value={editData.PREZZO_CARTA} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} type="number" step="0.01" />
                  <Input label="Listino €" name="EURO_LISTINO" value={editData.EURO_LISTINO} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} type="number" step="0.01" />
                  <Input label="Sconto %" name="SCONTO" value={editData.SCONTO} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} type="number" step="0.01" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select label="In carta" name="CARTA" value={editData.CARTA} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} options={[{value:"SI",label:"SI"},{value:"NO",label:"NO"}]} />
                  <Select label="iPratico" name="IPRATICO" value={editData.IPRATICO} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} options={[{value:"SI",label:"SI"},{value:"NO",label:"NO"}]} />
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

        {/* ── GIACENZE ─────────────────────────────────── */}
        <div className="bg-white border border-neutral-200 border-t-0">
          <SectionHeader title="Giacenze per locazione">
            {!giacenzeEdit
              ? <button type="button" onClick={startGiacenze} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition">✏️ Modifica</button>
              : <>
                  <button type="button" onClick={cancelGiacenze} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 bg-white hover:bg-neutral-100 transition">Annulla</button>
                  <button type="button" onClick={saveGiacenze} disabled={giacenzeSaving} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 transition disabled:opacity-50">{giacenzeSaving ? "Salvo…" : "💾 Salva"}</button>
                </>
            }
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
                {/* Matrice (Locazione 3) — read-only */}
                <div className="py-2">
                  <MatricePicker vinoId={vino.id} disabled={true} />
                </div>
                <div className="py-2 flex justify-between text-sm font-bold border-t border-neutral-300 mt-1 pt-3">
                  <span>Totale</span><span>{tot} bt</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Frigorifero */}
                <div className="grid grid-cols-3 gap-3 items-end">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Frigorifero</label>
                    <LocationPicker options={opzioniFrigo} value={giacenzeData.FRIGORIFERO ?? ""}
                      onChange={val => setGiacenzeData(p => ({...p, FRIGORIFERO: val}))} placeholder="Cerca frigorifero…" />
                  </div>
                  <Input label="Qtà bt" name="QTA_FRIGO" value={giacenzeData.QTA_FRIGO} onChange={e => setGiacenzeData(p => ({...p, [e.target.name]: e.target.value}))} type="number" />
                </div>
                {/* Locazione 1 */}
                <div className="grid grid-cols-3 gap-3 items-end">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Locazione 1</label>
                    <LocationPicker options={opzioniLoc1} value={giacenzeData.LOCAZIONE_1 ?? ""}
                      onChange={val => setGiacenzeData(p => ({...p, LOCAZIONE_1: val}))} placeholder="Cerca locazione 1…" />
                  </div>
                  <Input label="Qtà bt" name="QTA_LOC1" value={giacenzeData.QTA_LOC1} onChange={e => setGiacenzeData(p => ({...p, [e.target.name]: e.target.value}))} type="number" />
                </div>
                {/* Locazione 2 */}
                <div className="grid grid-cols-3 gap-3 items-end">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Locazione 2</label>
                    <LocationPicker options={opzioniLoc2} value={giacenzeData.LOCAZIONE_2 ?? ""}
                      onChange={val => setGiacenzeData(p => ({...p, LOCAZIONE_2: val}))} placeholder="Cerca locazione 2…" />
                  </div>
                  <Input label="Qtà bt" name="QTA_LOC2" value={giacenzeData.QTA_LOC2} onChange={e => setGiacenzeData(p => ({...p, [e.target.name]: e.target.value}))} type="number" />
                </div>
                {/* Matrice (Locazione 3) — gestita direttamente dal MatricePicker */}
                <div className="border-t border-neutral-200 pt-3">
                  <MatricePicker vinoId={vinoId} onVinoUpdated={notifyUpdate} />
                </div>
                <p className="text-xs text-neutral-500 mt-1">Frigo e Locazioni: modifica e salva. Matrice: le celle si salvano immediatamente al click.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── MOVIMENTI ────────────────────────────────── */}
        <div className="bg-white border border-neutral-200 border-t-0">
          <SectionHeader title="Movimenti cantina">
            {movLoading && <span className="text-xs text-neutral-400">Aggiornamento…</span>}
            {!canDelete && <span className="text-[11px] text-neutral-400">Elimina: solo admin/sommelier/sala</span>}
          </SectionHeader>
          <div className="p-5 space-y-5">
            {/* form */}
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
                  {vino?.LOCAZIONE_3 && <option value="loc3">{vino.LOCAZIONE_3} ({vino.QTA_LOC3 ?? 0} bt)</option>}
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
            {/* storico */}
            <div className="border border-neutral-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-100">
                  <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-center">Tipo</th>
                    <th className="px-3 py-2 text-center">Qtà</th>
                    <th className="px-3 py-2 text-left">Locazione</th>
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
                        <td className="px-3 py-2 text-center font-semibold">{m.qta}</td>
                        <td className="px-3 py-2 text-xs text-neutral-600">{m.locazione || "—"}</td>
                        <td className="px-3 py-2 text-xs text-neutral-700">{m.note || ""}</td>
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

        {/* ── NOTE ─────────────────────────────────────── */}
        <div className={`bg-white border border-neutral-200 border-t-0 ${inline ? "rounded-b-2xl shadow-lg" : "rounded-b-3xl shadow-2xl"}`}>
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

      </>)}
    </div>
  );
});

export default SchedaVino;
