// @version: v1.1-mattoni — M.I primitives (Btn) su CTA + item add/remove
// Editor template checklist (MVP, sessione 41) — solo admin
// Modalità: /cucina/templates/nuovo (create) o /cucina/templates/:id (edit).
// Form template + items riordinabili con pulsanti su/giù (drag nice-to-have V1).
// Tipi item: CHECKBOX, NUMERICO, TEMPERATURA, TESTO.

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { REPARTI, LIVELLI_CUCINA } from "../../config/reparti";
import Nav from "./Nav";
import { Btn } from "../../components/ui";

const TURNI = ["", "APERTURA", "PRANZO", "POMERIGGIO", "CENA", "CHIUSURA", "GIORNATA"];
const TIPI = ["CHECKBOX", "NUMERICO", "TEMPERATURA", "TESTO"];

const EMPTY_ITEM = {
  titolo: "",
  tipo: "CHECKBOX",
  obbligatorio: true,
  min_valore: null,
  max_valore: null,
  unita_misura: null,
  note: null,
};

function emptyTemplate() {
  return {
    nome: "",
    reparto: "cucina",
    frequenza: "GIORNALIERA",
    turno: "",
    ora_scadenza_entro: "",
    attivo: false,
    note: "",
    livello_cucina: "",
    items: [],
  };
}

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "nuovo";
  const role = (typeof localStorage !== "undefined" && localStorage.getItem("role")) || "";
  // Phase A.3 — anti-escalation FE: sous_chef/commis vedono solo il proprio
  // livello. Backend e' fonte di verita' (create/update template richiede
  // comunque admin, ma il dropdown resta coerente se la pagina si apre).
  const livelliOptions = role === "sous_chef"
    ? LIVELLI_CUCINA.filter(l => l.key === "sous_chef")
    : role === "commis"
      ? LIVELLI_CUCINA.filter(l => l.key === "commis")
      : LIVELLI_CUCINA;
  const [tpl, setTpl] = useState(emptyTemplate());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    apiFetch(`${API_BASE}/tasks/templates/${id}`)
      .then(r => {
        if (r.status === 404) throw new Error("Template non trovato");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => setTpl({
        ...data,
        turno: data.turno || "",
        ora_scadenza_entro: data.ora_scadenza_entro || "",
        note: data.note || "",
        livello_cucina: data.livello_cucina || "",
        items: (data.items || []).map(it => ({
          titolo: it.titolo,
          tipo: it.tipo,
          obbligatorio: it.obbligatorio,
          min_valore: it.min_valore,
          max_valore: it.max_valore,
          unita_misura: it.unita_misura,
          note: it.note,
        })),
      }))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const setField = (k, v) => setTpl(t => ({ ...t, [k]: v }));

  const addItem = () => setTpl(t => ({ ...t, items: [...t.items, { ...EMPTY_ITEM }] }));
  const removeItem = (idx) => setTpl(t => ({ ...t, items: t.items.filter((_, i) => i !== idx) }));
  const moveItem = (idx, dir) => setTpl(t => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= t.items.length) return t;
    const items = [...t.items];
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    return { ...t, items };
  });
  const updateItem = (idx, k, v) => setTpl(t => ({
    ...t,
    items: t.items.map((it, i) => i === idx ? { ...it, [k]: v } : it),
  }));

  const validate = () => {
    if (!tpl.nome.trim()) return "Nome obbligatorio";
    if (tpl.items.length === 0) return "Aggiungi almeno un item";
    for (const [i, it] of tpl.items.entries()) {
      if (!it.titolo.trim()) return `Item #${i + 1}: titolo mancante`;
      if (it.tipo === "TEMPERATURA" && (it.min_valore == null || it.max_valore == null)) {
        return `Item #${i + 1} (TEMPERATURA): min_valore e max_valore obbligatori`;
      }
      if (it.min_valore != null && it.max_valore != null && Number(it.min_valore) > Number(it.max_valore)) {
        return `Item #${i + 1}: min > max`;
      }
    }
    if (tpl.ora_scadenza_entro && !/^\d{2}:\d{2}$/.test(tpl.ora_scadenza_entro)) {
      return "ora_scadenza_entro: formato HH:MM";
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { setError(err); return; }

    setSaving(true);
    setError("");

    // Normalizza: turno "" → null, ora_scadenza "" → null, unita_misura "" → null
    const payload = {
      nome: tpl.nome.trim(),
      reparto: tpl.reparto,
      frequenza: tpl.frequenza,
      turno: tpl.turno || null,
      ora_scadenza_entro: tpl.ora_scadenza_entro || null,
      attivo: !!tpl.attivo,
      note: tpl.note?.trim() || null,
      livello_cucina: tpl.reparto === "cucina" ? (tpl.livello_cucina || null) : null,
      items: tpl.items.map(it => ({
        titolo: it.titolo.trim(),
        tipo: it.tipo,
        obbligatorio: !!it.obbligatorio,
        min_valore: it.min_valore === "" || it.min_valore == null ? null : Number(it.min_valore),
        max_valore: it.max_valore === "" || it.max_valore == null ? null : Number(it.max_valore),
        unita_misura: it.unita_misura?.trim() || null,
        note: it.note?.trim() || null,
      })),
    };

    try {
      const url = isNew
        ? `${API_BASE}/tasks/templates/`
        : `${API_BASE}/tasks/templates/${id}`;
      const method = isNew ? "POST" : "PUT";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      navigate("/tasks/templates");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-cream font-sans">
        <Nav current="templates" />
        <div className="max-w-3xl mx-auto p-6 text-center text-neutral-500">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <Nav current="templates" />

      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
        <button
          onClick={() => navigate("/tasks/templates")}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          ← Lista template
        </button>

        <h1 className="text-2xl font-playfair font-bold text-red-900">
          {isNew ? "Nuovo template" : `Modifica: ${tpl.nome}`}
        </h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Dati template */}
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Reparto *">
              <select
                value={tpl.reparto || "cucina"}
                onChange={e => {
                  setField("reparto", e.target.value);
                  if (e.target.value !== "cucina") setField("livello_cucina", "");
                }}
                className="w-full border rounded-lg px-3 py-2 min-h-[44px]"
              >
                {REPARTI.map(r => (
                  <option key={r.key} value={r.key}>
                    {r.icon} {r.label}
                  </option>
                ))}
              </select>
            </Field>
            {/* Phase A.2: livello cucina con transition */}
            <div
              className="overflow-hidden transition-all duration-200 ease-in-out"
              style={{
                maxHeight: tpl.reparto === "cucina" ? 90 : 0,
                opacity: tpl.reparto === "cucina" ? 1 : 0,
              }}
            >
              <Field label="Livello (opzionale)">
                <select
                  value={tpl.livello_cucina || ""}
                  onChange={e => setField("livello_cucina", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 min-h-[44px]"
                >
                  <option value="">Tutta la brigata</option>
                  {livelliOptions.map(l => (
                    <option key={l.key} value={l.key}>
                      {l.icon} {l.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Nome *">
              <input
                type="text"
                value={tpl.nome}
                onChange={e => setField("nome", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 min-h-[44px]"
                placeholder="es. Apertura cucina"
              />
            </Field>
            <Field label="Turno">
              <select
                value={tpl.turno}
                onChange={e => setField("turno", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 min-h-[44px]"
              >
                {TURNI.map(t => <option key={t} value={t}>{t || "— non vincolato —"}</option>)}
              </select>
            </Field>
            <Field label="Frequenza">
              <select
                value={tpl.frequenza}
                onChange={e => setField("frequenza", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 min-h-[44px]"
                disabled
              >
                <option value="GIORNALIERA">GIORNALIERA</option>
              </select>
              <div className="text-xs text-neutral-500 mt-1">
                In MVP solo giornaliera. Settimanale/mensile in V1.
              </div>
            </Field>
            <Field label="Ora scadenza entro (HH:MM)">
              <input
                type="text"
                placeholder="10:30"
                pattern="\d{2}:\d{2}"
                value={tpl.ora_scadenza_entro}
                onChange={e => setField("ora_scadenza_entro", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 min-h-[44px]"
              />
              <div className="text-xs text-neutral-500 mt-1">
                Orari 00:00–03:59 interpretati come giorno successivo.
              </div>
            </Field>
            <Field label="Attivo">
              <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={!!tpl.attivo}
                  onChange={e => setField("attivo", e.target.checked)}
                  className="w-5 h-5"
                />
                <span className="text-sm">Genera istanze giornaliere automaticamente</span>
              </label>
            </Field>
          </div>

          <Field label="Note (opzionali)">
            <textarea
              value={tpl.note}
              onChange={e => setField("note", e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              rows={2}
              placeholder="Istruzioni generali, riferimenti HACCP..."
            />
          </Field>
        </div>

        {/* Items */}
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-red-900">
              Items ({tpl.items.length})
            </h2>
            <Btn variant="chip" tone="red" size="md" onClick={addItem}>
              + Aggiungi item
            </Btn>
          </div>

          {tpl.items.length === 0 && (
            <div className="text-center py-6 text-neutral-500 border border-dashed rounded-lg">
              Nessun item. Aggiungine almeno uno.
            </div>
          )}

          <div className="space-y-3">
            {tpl.items.map((it, idx) => (
              <ItemRow
                key={idx}
                idx={idx}
                total={tpl.items.length}
                item={it}
                onUpdate={(k, v) => updateItem(idx, k, v)}
                onRemove={() => removeItem(idx)}
                onMove={(dir) => moveItem(idx, dir)}
              />
            ))}
          </div>
        </div>

        {/* Azioni */}
        <div className="sticky bottom-0 bg-brand-cream pt-3 pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 border-t border-red-200 flex gap-2 flex-wrap">
          <Btn variant="success" size="lg" onClick={save} disabled={saving} loading={saving} className="flex-1 min-w-[200px]">
            {saving ? "Salvataggio..." : (isNew ? "✓ Crea template" : "✓ Salva modifiche")}
          </Btn>
          <Btn variant="ghost" size="lg" onClick={() => navigate("/tasks/templates")}>
            Annulla
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ItemRow({ idx, total, item, onUpdate, onRemove, onMove }) {
  const needsRange = item.tipo === "NUMERICO" || item.tipo === "TEMPERATURA";

  // Auto-riempimento range per TEMPERATURA (primo set)
  const handleTipoChange = (tipo) => {
    onUpdate("tipo", tipo);
    if (tipo === "TEMPERATURA" && item.min_valore == null && item.max_valore == null) {
      onUpdate("min_valore", 0);
      onUpdate("max_valore", 4);
      onUpdate("unita_misura", "°C");
    }
  };

  return (
    <div className="border border-neutral-200 rounded-xl p-3 bg-brand-cream/30">
      <div className="flex items-start gap-2">
        {/* Ordine + move */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <button
            onClick={() => onMove(-1)}
            disabled={idx === 0}
            className="text-neutral-500 hover:text-red-700 disabled:opacity-20 text-lg leading-none"
            title="Sposta su"
          >
            ▲
          </button>
          <span className="text-xs font-bold text-neutral-600">{idx + 1}</span>
          <button
            onClick={() => onMove(1)}
            disabled={idx === total - 1}
            className="text-neutral-500 hover:text-red-700 disabled:opacity-20 text-lg leading-none"
            title="Sposta giu"
          >
            ▼
          </button>
        </div>

        {/* Contenuto */}
        <div className="flex-1 space-y-2">
          <input
            type="text"
            value={item.titolo}
            onChange={e => onUpdate("titolo", e.target.value)}
            placeholder="Titolo item (es. Controllo temperatura frigo)"
            className="w-full border rounded-lg px-3 py-2 min-h-[44px] font-medium"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={item.tipo}
              onChange={e => handleTipoChange(e.target.value)}
              className="border rounded-lg px-3 py-2 min-h-[44px]"
            >
              {TIPI.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <label className="flex items-center gap-2 px-3 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={!!item.obbligatorio}
                onChange={e => onUpdate("obbligatorio", e.target.checked)}
                className="w-5 h-5"
              />
              <span className="text-sm">Obbligatorio</span>
            </label>

            <Btn variant="chip" tone="red" size="md" onClick={onRemove}>
              × Rimuovi
            </Btn>
          </div>

          {needsRange && (
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                step="0.1"
                value={item.min_valore ?? ""}
                onChange={e => onUpdate("min_valore", e.target.value === "" ? null : e.target.value)}
                placeholder="min"
                className="border rounded-lg px-3 py-2 min-h-[44px]"
              />
              <input
                type="number"
                step="0.1"
                value={item.max_valore ?? ""}
                onChange={e => onUpdate("max_valore", e.target.value === "" ? null : e.target.value)}
                placeholder="max"
                className="border rounded-lg px-3 py-2 min-h-[44px]"
              />
              <input
                type="text"
                value={item.unita_misura ?? ""}
                onChange={e => onUpdate("unita_misura", e.target.value)}
                placeholder={item.tipo === "TEMPERATURA" ? "°C" : "kg, ml..."}
                className="border rounded-lg px-3 py-2 min-h-[44px]"
              />
            </div>
          )}

          {item.note != null && (
            <input
              type="text"
              value={item.note || ""}
              onChange={e => onUpdate("note", e.target.value)}
              placeholder="Nota item (opzionale)"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          )}
          {item.note == null && (
            <button
              onClick={() => onUpdate("note", "")}
              className="text-xs text-neutral-500 hover:text-red-700"
            >
              + Aggiungi nota
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
