// @version: v1.0-extracted (Modulo F+, 2026-04-27)
// IngredientPicker condiviso — typeahead con quick-create.
//
// Estratto da RicetteNuova v3.1 e reso riutilizzabile per RicetteModifica
// (e futuri form). Marco aveva segnalato che la "select gigante" era ancora
// presente in RicetteModifica → ora entrambi i form usano questo picker.
//
// Esporta:
//   - IngredientPicker (default)
//   - QuickCreateIngrediente (named) — modal di creazione al volo

import React, { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";

const FC = `${API_BASE}/foodcost`;
const UNITS = ["kg", "g", "L", "ml", "cl", "pz"];

const inputCls =
  "w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500";

// ─────────────────────────────────────────
// IngredientPicker — typeahead con quick-create
// ─────────────────────────────────────────
export default function IngredientPicker({ ingredienti, value, onChange, onCreateRequest }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(
    () => ingredienti.find((i) => String(i.id) === String(value)) || null,
    [ingredienti, value]
  );

  // Chiudi su click fuori
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return ingredienti.slice(0, 12);
    return ingredienti
      .filter((i) => (i.name || "").toLowerCase().includes(ql))
      .slice(0, 12);
  }, [ingredienti, q]);

  const exact = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return null;
    return ingredienti.find((i) => (i.name || "").toLowerCase() === ql) || null;
  }, [ingredienti, q]);

  // Stato "selezionato non in editing" → pill cliccabile
  if (selected && !open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setQ("");
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full text-left border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white hover:bg-neutral-50 flex items-center justify-between gap-2"
        title="Cambia ingrediente"
      >
        <span className="truncate">
          {selected.name}
          <span className="text-neutral-400 ml-1">({selected.default_unit})</span>
        </span>
        <span className="text-neutral-400 text-xs flex-shrink-0">▾</span>
      </button>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Cerca ingrediente…"
        className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
      />
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {list.length === 0 && !q.trim() && (
            <div className="px-3 py-2 text-xs text-neutral-500 italic">
              Inizia a digitare il nome dell'ingrediente.
            </div>
          )}
          {list.map((i) => (
            <button
              key={i.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(i.id, i.default_unit);
                setOpen(false);
                setQ("");
              }}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-orange-50"
            >
              {i.name}
              <span className="text-neutral-400 ml-1">({i.default_unit})</span>
            </button>
          ))}
          {q.trim() && !exact && onCreateRequest && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onCreateRequest(q.trim());
                setOpen(false);
                setQ("");
              }}
              className="block w-full text-left px-3 py-2 text-sm border-t border-neutral-200 bg-orange-50/40 text-orange-900 hover:bg-orange-100"
            >
              + Crea “{q.trim()}” come nuovo ingrediente
            </button>
          )}
          {q.trim() && list.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-neutral-500 italic border-t border-neutral-100">
              Nessun ingrediente esistente corrisponde
              {onCreateRequest ? " — usa il pulsante qui sopra per crearlo." : "."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────
// QuickCreateIngrediente — modal mini-create
// ─────────────────────────────────────────
export function QuickCreateIngrediente({ defaultName, categorie, onCancel, onCreated }) {
  const [name, setName] = useState(defaultName || "");
  const [defaultUnit, setDefaultUnit] = useState("g");
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const salva = async (e) => {
    e?.preventDefault();
    if (!name.trim()) { setErr("Nome obbligatorio."); return; }
    if (!defaultUnit.trim()) { setErr("Unità obbligatoria."); return; }
    setSaving(true); setErr("");
    try {
      const res = await apiFetch(`${FC}/ingredients/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          default_unit: defaultUnit,
          category_id: categoryId ? parseInt(categoryId) : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      onCreated(created);
    } catch (e2) {
      setErr(`Errore: ${e2.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200 max-w-md w-full p-5">
        <h3 className="text-base font-semibold text-orange-900 font-playfair mb-1">
          Nuovo ingrediente
        </h3>
        <p className="text-xs text-neutral-500 mb-4">
          Crea l'ingrediente al volo. Categoria e prezzi si aggiungono dopo dalla pagina ingredienti.
        </p>
        {err && (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 text-red-800 px-3 py-2 text-xs">
            {err}
          </div>
        )}
        <form onSubmit={salva} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-neutral-700 uppercase tracking-wide">Nome <span className="text-red-600">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              autoFocus
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-neutral-700 uppercase tracking-wide">Unità default <span className="text-red-600">*</span></label>
              <select
                value={defaultUnit}
                onChange={(e) => setDefaultUnit(e.target.value)}
                className={inputCls}
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <p className="text-[10px] text-neutral-500 mt-0.5">g/kg per peso · L/ml per volume · pz a numero</p>
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-700 uppercase tracking-wide">Categoria</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={inputCls}
              >
                <option value="">— Nessuna —</option>
                {(categorie || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" size="md" type="button" onClick={onCancel} disabled={saving}>Annulla</Btn>
            <Btn size="md" type="submit" loading={saving}>Crea ingrediente</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}
