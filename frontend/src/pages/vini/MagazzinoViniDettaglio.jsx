// src/pages/vini/MagazzinoViniDettaglio.jsx
// @version: v3.0-tutto-in-uno
// Scheda vino completa: anagrafica + giacenze + movimenti + note

import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

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

function SectionHeader({ title, children }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 bg-neutral-50 border-b border-neutral-200">
      <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">{title}</h2>
      <div className="flex gap-2 items-center">{children}</div>
    </div>
  );
}

export default function MagazzinoViniDettaglio() {
  const navigate = useNavigate();
  const { id } = useParams();
  const role = localStorage.getItem("role");
  const canDelete = role === "admin" || role === "sommelier";

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

  // ── fetch vino ──────────────────────────────────────
  const fetchVino = async () => {
    setLoading(true); setError("");
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${id}`);
      if (r.status === 404) { setError("Vino non trovato."); return; }
      if (!r.ok) throw new Error(`Errore server: ${r.status}`);
      setVino(await r.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ── fetch movimenti ─────────────────────────────────
  const fetchMovimenti = async () => {
    setMovLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${id}/movimenti`);
      if (r.ok) setMovimenti(await r.json());
    } finally { setMovLoading(false); }
  };

  // ── fetch note ──────────────────────────────────────
  const fetchNote = async () => {
    setNoteLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${id}/note`);
      if (r.ok) setNote(await r.json());
    } finally { setNoteLoading(false); }
  };

  useEffect(() => {
    if (!id || id === "undefined") { navigate("/vini/magazzino"); return; }
    fetchVino();
    fetchMovimenti();
    fetchNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const tot = useMemo(() => {
    if (!vino) return 0;
    return vino.QTA_TOTALE ??
      (vino.QTA_FRIGO ?? 0) + (vino.QTA_LOC1 ?? 0) +
      (vino.QTA_LOC2 ?? 0) + (vino.QTA_LOC3 ?? 0);
  }, [vino]);

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
      STATO_VENDITA: vino.STATO_VENDITA ?? "", NOTE_STATO: vino.NOTE_STATO ?? "",
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
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `Errore ${r.status}`); }
      setVino(await r.json());
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
      LOCAZIONE_3: vino.LOCAZIONE_3 ?? "", QTA_LOC3: vino.QTA_LOC3 ?? 0,
    });
    setGiacenzeEdit(true);
  };

  const saveGiacenze = async () => {
    setGiacenzeSaving(true);
    try {
      const payload = {
        FRIGORIFERO: giacenzeData.FRIGORIFERO || null,
        QTA_FRIGO:   parseInt(giacenzeData.QTA_FRIGO,  10) || 0,
        LOCAZIONE_1: giacenzeData.LOCAZIONE_1 || null,
        QTA_LOC1:    parseInt(giacenzeData.QTA_LOC1, 10) || 0,
        LOCAZIONE_2: giacenzeData.LOCAZIONE_2 || null,
        QTA_LOC2:    parseInt(giacenzeData.QTA_LOC2, 10) || 0,
        LOCAZIONE_3: giacenzeData.LOCAZIONE_3 || null,
        QTA_LOC3:    parseInt(giacenzeData.QTA_LOC3, 10) || 0,
      };
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      setVino(await r.json());
      setGiacenzeEdit(false);
      fetchMovimenti(); // aggiorna storico (potrebbe esserci nuova rettifica)
    } catch (e) { alert(e.message); }
    finally { setGiacenzeSaving(false); }
  };

  // ── movimenti ────────────────────────────────────────
  const submitMovimento = async () => {
    const qtaNum = Number(qtaMov);
    if (!qtaMov || qtaNum <= 0) { alert("Inserisci una quantità valida (> 0)."); return; }
    setSubmitting(true); setSubmitMsg("");
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${id}/movimenti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: tipoMov, qta: qtaNum, locazione: locMov || null, note: noteMov || null }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `Errore ${r.status}`); }
      const data = await r.json();
      if (data.vino) setVino(data.vino);
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
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${id}/note`, {
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
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${id}/note/${notaId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      setNote(await r.json());
    } catch (e) { alert(e.message); }
  };

  // ── render ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-0">

        {/* HEADER */}
        <div className="bg-white shadow-2xl rounded-t-3xl px-8 pt-8 pb-4 border border-neutral-200 border-b-0">
          <div className="flex flex-col lg:flex-row justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-3xl font-bold text-amber-900 tracking-wide font-playfair">
                  🍷 {vino ? vino.DESCRIZIONE : "Scheda Vino"}
                </h1>
                {vino && (
                  <span className="inline-flex items-center bg-amber-900 text-white text-[11px] font-bold px-2 py-0.5 rounded font-mono tracking-tight">
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
            <div className="flex items-center gap-3">
              {vino && (
                <div className="text-right">
                  <div className="text-xs text-neutral-500">Giacenza totale</div>
                  <div className="text-2xl font-bold text-amber-900">{tot} bt</div>
                </div>
              )}
              <button type="button" onClick={() => navigate("/vini/magazzino")}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
                ← Lista
              </button>
            </div>
          </div>
          <MagazzinoSubMenu showDettaglio />
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
                    <button type="button" onClick={() => setEditMode(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 bg-white hover:bg-neutral-100 transition">Annulla</button>
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
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-neutral-100">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${vino.CARTA === "SI" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-neutral-50 text-neutral-500 border-neutral-200"}`}>CARTA: {vino.CARTA || "NO"}</span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${vino.IPRATICO === "SI" ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-neutral-50 text-neutral-500 border-neutral-200"}`}>iPratico: {vino.IPRATICO || "NO"}</span>
                    {vino.STATO_VENDITA && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-amber-50 text-amber-800 border-amber-200">Stato: {vino.STATO_VENDITA}{vino.NOTE_STATO ? ` — ${vino.NOTE_STATO}` : ""}</span>}
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
                    <Input label="Tipologia *" name="TIPOLOGIA" value={editData.TIPOLOGIA} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                    <Input label="Nazione *" name="NAZIONE" value={editData.NAZIONE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                    <Input label="Regione" name="REGIONE" value={editData.REGIONE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                    <Input label="Codice" name="CODICE" value={editData.CODICE} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Input label="Annata" name="ANNATA" value={editData.ANNATA} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                    <Input label="Formato" name="FORMATO" value={editData.FORMATO} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Select label="In carta" name="CARTA" value={editData.CARTA} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} options={[{value:"SI",label:"SI"},{value:"NO",label:"NO"}]} />
                    <Select label="iPratico" name="IPRATICO" value={editData.IPRATICO} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} options={[{value:"SI",label:"SI"},{value:"NO",label:"NO"}]} />
                    <Input label="Stato vendita" name="STATO_VENDITA" value={editData.STATO_VENDITA} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                    <Input label="Note stato" name="NOTE_STATO" value={editData.NOTE_STATO} onChange={e => setEditData(p => ({...p, [e.target.name]: e.target.value}))} />
                  </div>
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
                    <button type="button" onClick={() => setGiacenzeEdit(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 bg-white hover:bg-neutral-100 transition">Annulla</button>
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
                    { loc: vino.LOCAZIONE_3, qta: vino.QTA_LOC3 ?? 0, label: "Locazione 3" },
                  ].map(({ loc, qta, label }) => (
                    <div key={label} className="py-2 flex justify-between text-sm">
                      <span className="text-neutral-600">{label}: <span className="text-neutral-800 font-medium">{loc || "—"}</span></span>
                      <span className="font-semibold">{qta} bt</span>
                    </div>
                  ))}
                  <div className="py-2 flex justify-between text-sm font-bold border-t border-neutral-300 mt-1 pt-3">
                    <span>Totale</span><span>{tot} bt</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {[
                    { locField: "FRIGORIFERO", qtaField: "QTA_FRIGO", label: "Frigorifero" },
                    { locField: "LOCAZIONE_1", qtaField: "QTA_LOC1", label: "Locazione 1" },
                    { locField: "LOCAZIONE_2", qtaField: "QTA_LOC2", label: "Locazione 2" },
                    { locField: "LOCAZIONE_3", qtaField: "QTA_LOC3", label: "Locazione 3" },
                  ].map(({ locField, qtaField, label }) => (
                    <div key={label} className="grid grid-cols-3 gap-3 items-end">
                      <div className="col-span-2"><Input label={label} name={locField} value={giacenzeData[locField]} onChange={e => setGiacenzeData(p => ({...p, [e.target.name]: e.target.value}))} /></div>
                      <Input label="Qtà bt" name={qtaField} value={giacenzeData[qtaField]} onChange={e => setGiacenzeData(p => ({...p, [e.target.name]: e.target.value}))} type="number" />
                    </div>
                  ))}
                  <p className="text-xs text-neutral-500 mt-1">⚠️ Aggiorna le giacenze direttamente. Usa i <strong>Movimenti</strong> qui sotto per l&apos;operatività quotidiana.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── MOVIMENTI ────────────────────────────────── */}
          <div className="bg-white border border-neutral-200 border-t-0">
            <SectionHeader title="Movimenti cantina">
              {movLoading && <span className="text-xs text-neutral-400">Aggiornamento…</span>}
              {!canDelete && <span className="text-[11px] text-neutral-400">Elimina: solo admin/sommelier</span>}
            </SectionHeader>
            <div className="p-5 space-y-5">
              {/* form */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <select value={tipoMov} onChange={e => setTipoMov(e.target.value)}
                    className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300">
                    <option value="CARICO">Carico</option>
                    <option value="SCARICO">Scarico</option>
                    <option value="VENDITA">Vendita</option>
                    <option value="RETTIFICA">Rettifica</option>
                  </select>
                  <input type="number" placeholder="Quantità *" min={1} value={qtaMov} onChange={e => setQtaMov(e.target.value)}
                    className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  <input type="text" placeholder="Locazione (opz.)" value={locMov} onChange={e => setLocMov(e.target.value)}
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
          <div className="bg-white border border-neutral-200 border-t-0 rounded-b-3xl shadow-2xl">
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
    </div>
  );
}
