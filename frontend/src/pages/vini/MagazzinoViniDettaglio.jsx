// src/pages/vini/MagazzinoViniDettaglio.jsx
// @version: v2.0-edit-note-giacenze
// Dettaglio vino magazzino — edit mode, note operative, giacenze per locazione

import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

// ─────────────────────────────────────────
// Helper campo edit
// ─────────────────────────────────────────
function Field({ label, value }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">
        {label}
      </div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}

function Input({ label, name, value, onChange, type = "text", step }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">
        {label}
      </label>
      <input
        type={type}
        step={step}
        name={name}
        value={value ?? ""}
        onChange={onChange}
        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
      />
    </div>
  );
}

function Select({ label, name, value, onChange, options }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">
        {label}
      </label>
      <select
        name={name}
        value={value ?? ""}
        onChange={onChange}
        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─────────────────────────────────────────
// Componente principale
// ─────────────────────────────────────────
export default function MagazzinoViniDettaglio() {
  const navigate = useNavigate();
  const { id } = useParams();
  const role = localStorage.getItem("role");

  const [vino, setVino] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // edit mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // note
  const [note, setNote] = useState([]);
  const [notaText, setNotaText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);

  // giacenze edit
  const [giacenzeEdit, setGiacenzeEdit] = useState(false);
  const [giacenzeData, setGiacenzeData] = useState({});
  const [giacenzeSaving, setGiacenzeSaving] = useState(false);

  // ── Fetch vino ───────────────────────────────────────────
  const fetchVino = async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/${id}`);
      if (resp.status === 404) { setError("Vino non trovato."); return; }
      if (!resp.ok) throw new Error(`Errore server: ${resp.status}`);
      const data = await resp.json();
      setVino(data);
    } catch (err) {
      setError(err.message || "Errore di caricamento.");
    } finally {
      setLoading(false);
    }
  };

  // ── Fetch note ───────────────────────────────────────────
  const fetchNote = async () => {
    setNoteLoading(true);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/${id}/note`);
      if (resp.ok) setNote(await resp.json());
    } finally {
      setNoteLoading(false);
    }
  };

  useEffect(() => {
    if (!id || id === "undefined") {
      navigate("/vini/magazzino");
      return;
    }
    fetchVino();
    fetchNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const tot = useMemo(() => {
    if (!vino) return 0;
    return (
      vino.QTA_TOTALE ??
      (vino.QTA_FRIGO ?? 0) +
        (vino.QTA_LOC1 ?? 0) +
        (vino.QTA_LOC2 ?? 0) +
        (vino.QTA_LOC3 ?? 0)
    );
  }, [vino]);

  // ── Edit mode ────────────────────────────────────────────
  const startEdit = () => {
    setEditData({
      TIPOLOGIA: vino.TIPOLOGIA ?? "",
      NAZIONE: vino.NAZIONE ?? "",
      CODICE: vino.CODICE ?? "",
      REGIONE: vino.REGIONE ?? "",
      DESCRIZIONE: vino.DESCRIZIONE ?? "",
      DENOMINAZIONE: vino.DENOMINAZIONE ?? "",
      ANNATA: vino.ANNATA ?? "",
      VITIGNI: vino.VITIGNI ?? "",
      GRADO_ALCOLICO: vino.GRADO_ALCOLICO ?? "",
      FORMATO: vino.FORMATO ?? "",
      PRODUTTORE: vino.PRODUTTORE ?? "",
      DISTRIBUTORE: vino.DISTRIBUTORE ?? "",
      PREZZO_CARTA: vino.PREZZO_CARTA ?? "",
      EURO_LISTINO: vino.EURO_LISTINO ?? "",
      SCONTO: vino.SCONTO ?? "",
      NOTE_PREZZO: vino.NOTE_PREZZO ?? "",
      CARTA: vino.CARTA ?? "NO",
      IPRATICO: vino.IPRATICO ?? "NO",
      STATO_VENDITA: vino.STATO_VENDITA ?? "",
      NOTE_STATO: vino.NOTE_STATO ?? "",
      NOTE: vino.NOTE ?? "",
    });
    setEditMode(true);
    setSaveMsg("");
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditData((prev) => ({ ...prev, [name]: value }));
  };

  const saveEdit = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      // Pulisce stringhe vuote → null per i campi numerici
      const payload = { ...editData };
      ["GRADO_ALCOLICO", "PREZZO_CARTA", "EURO_LISTINO", "SCONTO"].forEach((k) => {
        if (payload[k] === "" || payload[k] === null) payload[k] = null;
        else payload[k] = parseFloat(payload[k]);
      });

      const resp = await apiFetch(`${API_BASE}/vini/magazzino/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${resp.status}`);
      }

      const updated = await resp.json();
      setVino(updated);
      setEditMode(false);
      setSaveMsg("✅ Salvato.");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (err) {
      setSaveMsg(`❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Giacenze edit ────────────────────────────────────────
  const startGiacenze = () => {
    setGiacenzeData({
      FRIGORIFERO: vino.FRIGORIFERO ?? "",
      QTA_FRIGO: vino.QTA_FRIGO ?? 0,
      LOCAZIONE_1: vino.LOCAZIONE_1 ?? "",
      QTA_LOC1: vino.QTA_LOC1 ?? 0,
      LOCAZIONE_2: vino.LOCAZIONE_2 ?? "",
      QTA_LOC2: vino.QTA_LOC2 ?? 0,
      LOCAZIONE_3: vino.LOCAZIONE_3 ?? "",
      QTA_LOC3: vino.QTA_LOC3 ?? 0,
    });
    setGiacenzeEdit(true);
  };

  const handleGiacenzeChange = (e) => {
    const { name, value } = e.target;
    setGiacenzeData((prev) => ({ ...prev, [name]: value }));
  };

  const saveGiacenze = async () => {
    setGiacenzeSaving(true);
    try {
      const payload = {
        FRIGORIFERO: giacenzeData.FRIGORIFERO || null,
        QTA_FRIGO: parseInt(giacenzeData.QTA_FRIGO, 10) || 0,
        LOCAZIONE_1: giacenzeData.LOCAZIONE_1 || null,
        QTA_LOC1: parseInt(giacenzeData.QTA_LOC1, 10) || 0,
        LOCAZIONE_2: giacenzeData.LOCAZIONE_2 || null,
        QTA_LOC2: parseInt(giacenzeData.QTA_LOC2, 10) || 0,
        LOCAZIONE_3: giacenzeData.LOCAZIONE_3 || null,
        QTA_LOC3: parseInt(giacenzeData.QTA_LOC3, 10) || 0,
      };

      const resp = await apiFetch(`${API_BASE}/vini/magazzino/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) throw new Error(`Errore ${resp.status}`);
      const updated = await resp.json();
      setVino(updated);
      setGiacenzeEdit(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setGiacenzeSaving(false);
    }
  };

  // ── Note ─────────────────────────────────────────────────
  const addNota = async () => {
    if (!notaText.trim()) return;
    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/${id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota: notaText.trim() }),
      });
      if (!resp.ok) throw new Error(`Errore ${resp.status}`);
      setNote(await resp.json());
      setNotaText("");
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteNota = async (notaId) => {
    if (!window.confirm("Eliminare questa nota?")) return;
    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/${id}/note/${notaId}`, {
        method: "DELETE",
      });
      if (!resp.ok) throw new Error(`Errore ${resp.status}`);
      setNote(await resp.json());
    } catch (err) {
      alert(err.message);
    }
  };

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🍷 Dettaglio Vino
            </h1>
            <p className="text-neutral-600">Scheda vino magazzino.</p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Magazzino
            </button>
            <button
              type="button"
              onClick={() => navigate(`/vini/magazzino/${id}/movimenti`)}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition"
            >
              📦 Movimenti
            </button>
          </div>
        </div>

        {/* SUBMENU */}
        <div className="mb-6">
          <MagazzinoSubMenu showDettaglio />
        </div>

        {loading && <p className="text-sm text-neutral-600">Caricamento…</p>}
        {error && !loading && <p className="text-sm text-red-600 font-medium">{error}</p>}

        {!loading && !error && vino && (
          <div className="space-y-6">

            {/* ── SEZIONE ANAGRAFICA ─────────────────────── */}
            <div className="border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-neutral-50 border-b border-neutral-200">
                <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">
                  Anagrafica
                </h2>
                <div className="flex gap-2 items-center">
                  {saveMsg && (
                    <span className="text-xs font-medium">{saveMsg}</span>
                  )}
                  {!editMode ? (
                    <button
                      type="button"
                      onClick={startEdit}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition"
                    >
                      ✏️ Modifica
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditMode(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 bg-white hover:bg-neutral-100 transition"
                      >
                        Annulla
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 transition disabled:opacity-50"
                      >
                        {saving ? "Salvo…" : "💾 Salva"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="p-5">
                {!editMode ? (
                  // VIEW MODE
                  <div className="space-y-4">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-neutral-400">#{vino.id}</span>
                      <h3 className="text-lg font-bold text-neutral-900">{vino.DESCRIZIONE}</h3>
                    </div>

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

                    <div className="grid grid-cols-3 gap-4 pt-2 border-t border-neutral-100">
                      <Field label="Prezzo carta" value={vino.PREZZO_CARTA != null ? `${Number(vino.PREZZO_CARTA).toFixed(2)} €` : null} />
                      <Field label="Listino" value={vino.EURO_LISTINO != null ? `${Number(vino.EURO_LISTINO).toFixed(2)} €` : null} />
                      <Field label="Sconto" value={vino.SCONTO != null ? `${Number(vino.SCONTO).toFixed(2)}%` : null} />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-100">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${vino.CARTA === "SI" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-neutral-50 text-neutral-500 border-neutral-200"}`}>
                        CARTA: {vino.CARTA || "NO"}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${vino.IPRATICO === "SI" ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-neutral-50 text-neutral-500 border-neutral-200"}`}>
                        iPratico: {vino.IPRATICO || "NO"}
                      </span>
                      {vino.STATO_VENDITA && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-amber-50 text-amber-800 border-amber-200">
                          Stato: {vino.STATO_VENDITA}
                          {vino.NOTE_STATO ? ` — ${vino.NOTE_STATO}` : ""}
                        </span>
                      )}
                    </div>

                    {vino.NOTE && (
                      <div className="pt-2 border-t border-neutral-100">
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">Note interne</div>
                        <p className="text-sm text-neutral-800 whitespace-pre-wrap">{vino.NOTE}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  // EDIT MODE
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input label="Descrizione *" name="DESCRIZIONE" value={editData.DESCRIZIONE} onChange={handleEditChange} />
                      <Input label="Denominazione" name="DENOMINAZIONE" value={editData.DENOMINAZIONE} onChange={handleEditChange} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Input label="Tipologia *" name="TIPOLOGIA" value={editData.TIPOLOGIA} onChange={handleEditChange} />
                      <Input label="Nazione *" name="NAZIONE" value={editData.NAZIONE} onChange={handleEditChange} />
                      <Input label="Regione" name="REGIONE" value={editData.REGIONE} onChange={handleEditChange} />
                      <Input label="Codice" name="CODICE" value={editData.CODICE} onChange={handleEditChange} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Input label="Annata" name="ANNATA" value={editData.ANNATA} onChange={handleEditChange} />
                      <Input label="Formato" name="FORMATO" value={editData.FORMATO} onChange={handleEditChange} />
                      <Input label="Vitigni" name="VITIGNI" value={editData.VITIGNI} onChange={handleEditChange} />
                      <Input label="Grado alcolico" name="GRADO_ALCOLICO" value={editData.GRADO_ALCOLICO} onChange={handleEditChange} type="number" step="0.1" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input label="Produttore" name="PRODUTTORE" value={editData.PRODUTTORE} onChange={handleEditChange} />
                      <Input label="Distributore" name="DISTRIBUTORE" value={editData.DISTRIBUTORE} onChange={handleEditChange} />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <Input label="Prezzo carta €" name="PREZZO_CARTA" value={editData.PREZZO_CARTA} onChange={handleEditChange} type="number" step="0.01" />
                      <Input label="Listino €" name="EURO_LISTINO" value={editData.EURO_LISTINO} onChange={handleEditChange} type="number" step="0.01" />
                      <Input label="Sconto %" name="SCONTO" value={editData.SCONTO} onChange={handleEditChange} type="number" step="0.01" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Select label="In carta" name="CARTA" value={editData.CARTA} onChange={handleEditChange}
                        options={[{ value: "SI", label: "SI" }, { value: "NO", label: "NO" }]} />
                      <Select label="iPratico" name="IPRATICO" value={editData.IPRATICO} onChange={handleEditChange}
                        options={[{ value: "SI", label: "SI" }, { value: "NO", label: "NO" }]} />
                      <Input label="Stato vendita" name="STATO_VENDITA" value={editData.STATO_VENDITA} onChange={handleEditChange} />
                      <Input label="Note stato" name="NOTE_STATO" value={editData.NOTE_STATO} onChange={handleEditChange} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">
                        Note interne
                      </label>
                      <textarea
                        name="NOTE"
                        value={editData.NOTE ?? ""}
                        onChange={handleEditChange}
                        rows={2}
                        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── SEZIONE GIACENZE ───────────────────────── */}
            <div className="border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-neutral-50 border-b border-neutral-200">
                <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">
                  Giacenze per locazione
                </h2>
                <div className="flex gap-2">
                  {!giacenzeEdit ? (
                    <button
                      type="button"
                      onClick={startGiacenze}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition"
                    >
                      ✏️ Modifica
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => setGiacenzeEdit(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 bg-white hover:bg-neutral-100 transition">
                        Annulla
                      </button>
                      <button type="button" onClick={saveGiacenze} disabled={giacenzeSaving}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 transition disabled:opacity-50">
                        {giacenzeSaving ? "Salvo…" : "💾 Salva"}
                      </button>
                    </>
                  )}
                </div>
              </div>

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
                        <span className="text-neutral-600">{label}: <span className="text-neutral-800">{loc || "—"}</span></span>
                        <span className="font-semibold">{qta} bt</span>
                      </div>
                    ))}
                    <div className="py-2 flex justify-between text-sm font-bold border-t border-neutral-300 mt-1 pt-3">
                      <span>Totale</span>
                      <span>{tot} bt</span>
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
                        <div className="col-span-2">
                          <Input label={label} name={locField} value={giacenzeData[locField]} onChange={handleGiacenzeChange} />
                        </div>
                        <Input label="Qtà bt" name={qtaField} value={giacenzeData[qtaField]} onChange={handleGiacenzeChange} type="number" />
                      </div>
                    ))}
                    <p className="text-xs text-neutral-500 mt-1">
                      ⚠️ Questo aggiorna le giacenze per locazione direttamente, senza registrare un movimento.
                      Usa i <strong>Movimenti</strong> per lo storico operativo.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ── SEZIONE NOTE ───────────────────────────── */}
            <div className="border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-200">
                <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">
                  Note operative
                </h2>
              </div>

              <div className="p-5 space-y-4">
                {/* Add nota */}
                <div className="flex gap-2">
                  <textarea
                    value={notaText}
                    onChange={(e) => setNotaText(e.target.value)}
                    placeholder="Aggiungi una nota operativa…"
                    rows={2}
                    className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                  />
                  <button
                    type="button"
                    onClick={addNota}
                    disabled={!notaText.trim()}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 transition disabled:opacity-40 self-end"
                  >
                    Aggiungi
                  </button>
                </div>

                {/* Lista note */}
                {noteLoading && <p className="text-xs text-neutral-500">Caricamento note…</p>}
                {!noteLoading && note.length === 0 && (
                  <p className="text-sm text-neutral-500">Nessuna nota.</p>
                )}
                <div className="space-y-2">
                  {note.map((n) => (
                    <div
                      key={n.id}
                      className="flex gap-3 items-start bg-amber-50 border border-amber-100 rounded-xl px-4 py-3"
                    >
                      <div className="flex-1">
                        <p className="text-sm text-neutral-900 whitespace-pre-wrap">{n.nota}</p>
                        <p className="text-[11px] text-neutral-500 mt-1">
                          {n.autore && <span className="font-medium">{n.autore} — </span>}
                          {n.created_at?.slice(0, 16).replace("T", " ")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteNota(n.id)}
                        className="text-xs text-red-400 hover:text-red-600 transition shrink-0"
                        title="Elimina nota"
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
