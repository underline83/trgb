// src/components/vini/MadreEditModal.jsx
// Modulo: vini
//
// Modale di modifica del Vino Madre (etichetta stabile, indipendente dall'annata).
// Estratto da AnagraficheVini.jsx (2026-05-21, vini 3.60) per essere riusato sia
// dal modulo Anagrafiche sia dalla scheda madre in Cantina (SchedaMadreV2) senza
// creare un import circolare.
//
// Self-fetch: all'apertura ricarica il madre completo via GET /madre/{id} e
// ripopola il form da lì — così funziona anche se il `madre` prop arriva
// parziale (es. da groupByMadre in Cantina, privo di produttore_id/ecc.).
//
// Props: { madre (serve almeno .id), onClose, onSaved }

import React, { useState, useEffect, useMemo } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import componiDescrizione, { vitigniToString } from "../../utils/vini/componiDescrizione";

export function MadreEditModal({ madre, onClose, onSaved }) {
  const [form, setForm] = useState({
    descrizione: madre.descrizione || "",
    tipologia: madre.tipologia || "",
    produttore_id: madre.produttore_id || "",
    fornitore_id: madre.fornitore_id || "",
    denominazione_id: madre.denominazione_id || "",
    nazione: madre.nazione || "",
    regione: madre.regione || "",
    grado_alcolico_tipico: madre.grado_alcolico_tipico ?? "",
    abbinamenti: madre.abbinamenti || "",
    note_madre: madre.note_madre || "",
    // M2.9-bis: campi della descrizione composta
    nome_etichetta: madre.nome_etichetta || "",
    descrizione_auto: madre.descrizione_auto ?? 0,
  });
  const [produttori, setProduttori] = useState([]);
  const [fornitori, setFornitori] = useState([]);
  const [denoSearch, setDenoSearch] = useState("");
  const [denoResults, setDenoResults] = useState([]);
  const [currentDeno, setCurrentDeno] = useState(null);  // denominazione attualmente assegnata
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // M2.9-bis (mig 131): vitigni "tipici" del madre come lista dinamica.
  // Caricati via GET /madre/{id} (che restituisce vitigni_list già risolto).
  // UI: autocomplete + righe compatte con % e bottone rimuovi, max 5.
  const [vitigniList, setVitigniList] = useState([]);
  const [vitignoQ, setVitignoQ] = useState("");
  const [vitignoResults, setVitignoResults] = useState([]);

  useEffect(() => {
    (async () => {
      const [pr, fr] = await Promise.all([
        apiFetch(`${API_BASE}/vini/anagrafiche/produttori/`).then(r => r.json()),
        apiFetch(`${API_BASE}/vini/anagrafiche/fornitori/`).then(r => r.json()),
      ]);
      setProduttori(pr); setFornitori(fr);
    })();
  }, []);

  // Carica vitigni_list dal backend (decorato con nomi via JOIN)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/vini/anagrafiche/madre/${madre.id}`);
        if (r.ok && !cancelled) {
          const data = await r.json();
          const list = (data.vitigni_list || []).map(v => ({
            vitigno_id: v.vitigno_id,
            vitigno_label: v.vitigno_label,
            pct: v.pct ?? "",
          }));
          setVitigniList(list);
          // GET /madre/{id} è la fonte autoritativa: ripopolo il form da qui.
          // Necessario quando il `madre` prop arriva parziale (es. da groupByMadre
          // nella Cantina, che non porta produttore_id/denominazione_id/ecc.).
          setForm({
            descrizione: data.descrizione || "",
            tipologia: data.tipologia || "",
            produttore_id: data.produttore_id || "",
            fornitore_id: data.fornitore_id || "",
            denominazione_id: data.denominazione_id || "",
            nazione: data.nazione || "",
            regione: data.regione || "",
            grado_alcolico_tipico: data.grado_alcolico_tipico ?? "",
            abbinamenti: data.abbinamenti || "",
            note_madre: data.note_madre || "",
            nome_etichetta: data.nome_etichetta || "",
            descrizione_auto: data.descrizione_auto ?? 0,
          });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [madre.id]);

  // Autocomplete vitigni
  useEffect(() => {
    if (vitignoQ.trim().length < 2) { setVitignoResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch(`${API_BASE}/vini/anagrafiche/vitigni/?search=${encodeURIComponent(vitignoQ)}`);
        if (r.ok && !cancelled) setVitignoResults((await r.json()).slice(0, 10));
      } catch {}
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [vitignoQ]);

  const addVitigno = (v) => {
    if (vitigniList.length >= 5) { alert("Massimo 5 vitigni"); return; }
    if (vitigniList.find(x => x.vitigno_id === v.id)) { setVitignoQ(""); return; }
    setVitigniList(prev => [...prev, { vitigno_id: v.id, vitigno_label: v.nome, pct: "" }]);
    setVitignoQ("");
    setVitignoResults([]);
  };
  const removeVitigno = (vid) => setVitigniList(prev => prev.filter(v => v.vitigno_id !== vid));
  const updateVitignoPct = (vid, pct) => {
    setVitigniList(prev => prev.map(v => v.vitigno_id === vid ? { ...v, pct } : v));
  };

  // Carica la denominazione corrente quando il madre arriva con denominazione_id già settato
  useEffect(() => {
    if (!form.denominazione_id) { setCurrentDeno(null); return; }
    // Se l'ho già caricata (stesso id), skip
    if (currentDeno && currentDeno.id === Number(form.denominazione_id)) return;
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/vini/anagrafiche/denominazioni/${form.denominazione_id}`);
        if (r.ok) setCurrentDeno(await r.json());
        else setCurrentDeno(null);
      } catch { setCurrentDeno(null); }
    })();
  }, [form.denominazione_id]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Ricerca denominazioni live
  useEffect(() => {
    if (!denoSearch || denoSearch.length < 2) { setDenoResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await apiFetch(
        `${API_BASE}/vini/anagrafiche/denominazioni/?search=${encodeURIComponent(denoSearch)}${form.nazione ? "&nazione=" + form.nazione : ""}`
      );
      if (r.ok && !cancelled) setDenoResults((await r.json()).slice(0, 10));
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [denoSearch, form.nazione]);

  // La denominazione attualmente visualizzata: prima cerca tra i risultati search,
  // poi nel valore caricato all'aperture del modale (currentDeno).
  const selectedDeno =
    denoResults.find(d => d.id === Number(form.denominazione_id))
    || (currentDeno && currentDeno.id === Number(form.denominazione_id) ? currentDeno : null);

  // M2.9-bis: preview live della descrizione composta dai 4 ingredienti.
  // I vitigni ora vivono strutturati sul madre (mig 131), quindi entrano
  // nella composizione della descrizione del madre stesso.
  const denoLabel = selectedDeno ? `${selectedDeno.nome} ${selectedDeno.tipo}`.trim() : "";
  const vitigniString = useMemo(() => vitigniToString(vitigniList), [vitigniList]);
  const descrizioneComposta = useMemo(() => componiDescrizione({
    denominazione:  denoLabel,
    nome_etichetta: form.nome_etichetta,
    vitigni:        vitigniString,
    grado:          form.grado_alcolico_tipico,
  }), [denoLabel, form.nome_etichetta, vitigniString, form.grado_alcolico_tipico]);

  // "Modalità composta": il madre è già auto OPPURE l'utente ha riempito gli ingredienti
  // base (denominazione + qualcosa). In modalità composta, la descrizione testuale viene
  // sostituita dalla composizione automatica al save.
  const isCompostaMode =
    (form.descrizione_auto === 1)
    || (!!form.denominazione_id && (!!form.nome_etichetta || !!form.grado_alcolico_tipico || vitigniList.length > 0));

  const handleSave = async () => {
    setError(""); setSaving(true);
    try {
      const payload = { ...form };
      // Coerce: stringhe vuote a null per FK
      ["fornitore_id", "denominazione_id"].forEach(k => {
        if (payload[k] === "" || payload[k] === null) delete payload[k];
        else payload[k] = Number(payload[k]);
      });
      if (payload.grado_alcolico_tipico === "" || payload.grado_alcolico_tipico === null) {
        delete payload.grado_alcolico_tipico;
      } else {
        payload.grado_alcolico_tipico = Number(payload.grado_alcolico_tipico);
      }
      payload.produttore_id = Number(payload.produttore_id);
      // M2.9-bis: se in modalità composta, ricompongo la descrizione e setto il flag.
      // Altrimenti lascio la descrizione testuale così com'è (legacy invariato).
      if (isCompostaMode && descrizioneComposta) {
        payload.descrizione = descrizioneComposta;
        payload.descrizione_auto = 1;
      }
      // M2.9-bis (mig 131): esplodo la lista vitigniList nei 10 slot.
      // Slot non usati → null esplicito (così uno "rimosso" viene davvero cancellato).
      for (let i = 0; i < 5; i++) {
        const slot = vitigniList[i];
        payload[`vitigno_${i+1}_id`] = slot ? slot.vitigno_id : null;
        payload[`vitigno_${i+1}_pct`] =
          slot && slot.pct !== "" && slot.pct != null
            ? parseFloat(String(slot.pct).replace(",", "."))
            : null;
      }
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/madre/${madre.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.detail || "errore");
      }
      onSaved();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5"
           onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-1 text-neutral-900 flex items-center gap-2 flex-wrap">
          Vino madre #{madre.id}
          {(form.descrizione_auto === 0) && (
            <span
              title="Vino madre in formato legacy. Compila denominazione + nome etichetta o grado per promuoverlo a descrizione composta."
              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-orange-100 text-orange-800 border-orange-300"
            >
              📜 OLD
            </span>
          )}
          {(form.descrizione_auto === 1) && (
            <span
              title="Descrizione composta automaticamente dai 4 ingredienti"
              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-emerald-100 text-emerald-800 border-emerald-300"
            >
              ✓ COMPOSTA
            </span>
          )}
        </h3>
        <p className="text-xs text-neutral-500 mb-4">Modifica anagrafica del vino (etichetta stabile, indipendente dall'annata)</p>

        {/* M2.9-bis: preview descrizione composta — visibile solo se gli ingredienti sono in atto */}
        {isCompostaMode && descrizioneComposta && (
          <div className="mb-4 rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-white p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1">
              ✨ Descrizione composta (anteprima)
            </div>
            <div className="text-sm font-bold text-neutral-900">{descrizioneComposta}</div>
            <div className="text-[11px] text-emerald-700 mt-1">
              Al salvataggio, sostituirà la descrizione testuale qui sotto e il madre diventerà
              <strong> COMPOSTA</strong>.
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label={isCompostaMode ? "Descrizione (verrà ricomposta al salvataggio)" : "Descrizione"} required>
            <input type="text" value={form.descrizione}
              onChange={e => setForm(p => ({ ...p, descrizione: e.target.value }))}
              disabled={isCompostaMode}
              className={`w-full px-2 py-1 border rounded ${isCompostaMode ? "bg-neutral-100 text-neutral-500 italic" : ""}`} />
          </Field>
          <Field label="Nome etichetta / Cru">
            <input type="text" value={form.nome_etichetta}
              onChange={e => setForm(p => ({ ...p, nome_etichetta: e.target.value }))}
              placeholder="opzionale — es. Castiglione"
              className="w-full px-2 py-1 border rounded" />
          </Field>
          <Field label="Tipologia" required>
            <select value={form.tipologia} onChange={e => setForm(p => ({ ...p, tipologia: e.target.value }))}
              className="w-full px-2 py-1 border rounded">
              {["BOLLICINE","BIANCHI","ROSSI","ROSATI","GRANDI FORMATI","PASSITI E VINI DA MEDITAZIONE","VINI ANALCOLICI","ERRORE"].map(t =>
                <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Produttore" required>
            <select value={form.produttore_id} onChange={e => setForm(p => ({ ...p, produttore_id: e.target.value }))}
              className="w-full px-2 py-1 border rounded">
              <option value="">— seleziona —</option>
              {produttori.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Field>
          <Field label="Fornitore (distributore)">
            <select value={form.fornitore_id} onChange={e => setForm(p => ({ ...p, fornitore_id: e.target.value }))}
              className="w-full px-2 py-1 border rounded">
              <option value="">— nessuno —</option>
              {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Field>
          <Field label="Nazione">
            <input type="text" value={form.nazione}
              onChange={e => setForm(p => ({ ...p, nazione: e.target.value }))}
              className="w-full px-2 py-1 border rounded" />
          </Field>
          <Field label="Regione">
            <input type="text" value={form.regione}
              onChange={e => setForm(p => ({ ...p, regione: e.target.value }))}
              className="w-full px-2 py-1 border rounded" />
          </Field>
          <Field label="Grado alcolico tipico">
            <input type="number" step="0.1" value={form.grado_alcolico_tipico}
              onChange={e => setForm(p => ({ ...p, grado_alcolico_tipico: e.target.value }))}
              className="w-full px-2 py-1 border rounded" />
          </Field>
          <Field label="Denominazione">
            {form.denominazione_id && selectedDeno ? (
              <div className="flex items-center gap-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded">
                <span className="flex-1 text-xs">
                  <strong>{selectedDeno.nome} {selectedDeno.tipo}</strong> · {selectedDeno.nazione}
                  {selectedDeno.regione && ` · ${selectedDeno.regione}`}
                </span>
                <button type="button"
                  onClick={() => { setForm(p => ({ ...p, denominazione_id: "" })); setDenoSearch(""); setCurrentDeno(null); }}
                  className="text-xs px-2 py-0.5 border border-red-300 text-red-700 rounded hover:bg-red-50">
                  Rimuovi
                </button>
              </div>
            ) : form.denominazione_id && !selectedDeno ? (
              <div className="text-xs text-neutral-500 italic">#{form.denominazione_id} (caricamento…)</div>
            ) : (
              <div className="space-y-1">
                <input type="text" placeholder="Cerca denominazione (min 2 caratteri)…"
                  value={denoSearch} onChange={e => setDenoSearch(e.target.value)}
                  className="w-full px-2 py-1 border rounded" />
                {denoResults.length > 0 && (
                  <div className="border rounded max-h-32 overflow-y-auto bg-white shadow-sm">
                    {denoResults.map(d => (
                      <div key={d.id}
                        onClick={() => { setForm(p => ({ ...p, denominazione_id: d.id })); setDenoSearch(""); }}
                        className="px-2 py-1 text-xs cursor-pointer hover:bg-amber-50">
                        <strong>{d.nome} {d.tipo}</strong> · {d.nazione}
                        {d.regione && ` · ${d.regione}`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Field>
        </div>

        {/* M2.9-bis (mig 131): vitigni "tipici" del madre — UI dinamica.
            Niente 10 campi fissi: si aggiungono righe via autocomplete fino a 5. */}
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-semibold text-neutral-700 uppercase tracking-wider">
              🍇 Vitigni tipici <span className="text-neutral-400 font-normal normal-case">(max 5)</span>
            </label>
            <span className="text-[10px] text-neutral-500">
              {vitigniList.length}/5
            </span>
          </div>

          {/* Righe vitigni già aggiunti */}
          {vitigniList.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {vitigniList.map(v => (
                <div key={v.vitigno_id} className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-2 py-1.5">
                  <span className="text-xs font-semibold text-neutral-800 flex-1 truncate">{v.vitigno_label}</span>
                  <input type="number" step="1" min="0" max="100"
                    value={v.pct}
                    onChange={e => updateVitignoPct(v.vitigno_id, e.target.value)}
                    placeholder="%"
                    className="w-16 px-1.5 py-0.5 border border-neutral-300 rounded text-xs text-right" />
                  <span className="text-xs text-neutral-500">%</span>
                  <button type="button" onClick={() => removeVitigno(v.vitigno_id)}
                    className="text-red-600 hover:text-red-800 px-1 text-sm font-bold leading-none" title="Rimuovi">×</button>
                </div>
              ))}
            </div>
          )}

          {/* Autocomplete per aggiungere un vitigno (visibile finché non si arriva a 5) */}
          {vitigniList.length < 5 && (
            <div>
              <input type="text" placeholder={vitigniList.length === 0 ? "Cerca e aggiungi un vitigno…" : "+ Aggiungi un altro vitigno…"}
                value={vitignoQ} onChange={e => setVitignoQ(e.target.value)}
                className="w-full px-2 py-1 border border-neutral-300 rounded text-xs" />
              {vitignoResults.length > 0 && (
                <div className="mt-1 max-h-32 overflow-y-auto border border-neutral-200 rounded-lg bg-white shadow-sm">
                  {vitignoResults.map(v => (
                    <button key={v.id} type="button" onClick={() => addVitigno(v)}
                      className="block w-full text-left px-2 py-1.5 text-xs hover:bg-amber-50 border-b border-neutral-100">
                      {v.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {vitigniList.length === 0 && (
            <p className="text-[10px] text-neutral-500 italic mt-1">
              Nessun vitigno collegato. Aggiungi i vitigni con la loro % per rendere il vino più ricercabile e per la composizione automatica della descrizione.
            </p>
          )}
        </div>

        <div className="mt-3">
          <Field label="Abbinamenti consigliati">
            <textarea value={form.abbinamenti}
              onChange={e => setForm(p => ({ ...p, abbinamenti: e.target.value }))}
              rows={2}
              className="w-full px-2 py-1 border rounded text-sm" />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Note madre">
            <textarea value={form.note_madre}
              onChange={e => setForm(p => ({ ...p, note_madre: e.target.value }))}
              rows={2}
              className="w-full px-2 py-1 border rounded text-sm" />
          </Field>
        </div>

        {error && <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-neutral-300 text-sm hover:bg-neutral-50">Annulla</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-1.5 rounded-lg bg-amber-700 text-white text-sm font-semibold hover:bg-amber-800 disabled:opacity-40">
            {saving ? "Salvo…" : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Piccolo helper per i campi del form
function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-700 uppercase tracking-wider mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
