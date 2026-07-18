// @version: v1.0 — Gestione sotto-categorie carta bevande (sessione 2026-07-18)
// Blocco per Impostazioni → Ordinamento Carta: edita le options del select
// 'tipologia' delle sezioni bevande che ce l'hanno (oggi: Distillati, Tè).
// L'ordine della lista = ordine dei gruppi in carta (FE BevTabella4Col e
// BE _render_tabella_4col leggono entrambi dallo schema — zero hardcode).
//
// Salvataggio: PUT /bevande/sezioni/{key}/tipologie {options, renames}.
// - Rinomina: propagata dal backend alle voci esistenti (lezione rename-stati).
// - Elimina: il backend blocca con 409 se la tipologia è usata da voci.

import React, { useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";

// Estrae il campo tipologia (select) dallo schema di una sezione, se c'è
function tipFieldOf(sezione) {
  const fields = sezione?.schema_form?.fields;
  if (!Array.isArray(fields)) return null;
  return (
    fields.find(
      (f) => (f.key ?? f.name) === "tipologia" && f.type === "select"
    ) || null
  );
}

function rowsFromField(field) {
  return (field.options || []).map((o) => {
    const value = typeof o === "object" && o !== null ? o.value : o;
    const label = typeof o === "object" && o !== null ? o.label || value : o;
    return { value: String(value ?? ""), label: String(label ?? ""), orig: String(value ?? "") };
  });
}

function SezioneTipologie({ sezione, onSaved }) {
  const [rows, setRows] = useState(() => rowsFromField(tipFieldOf(sezione)));
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [newVal, setNewVal] = useState("");
  const [msg, setMsg] = useState(null); // {kind: 'ok'|'err', text}
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => {
    const orig = rowsFromField(tipFieldOf(sezione));
    if (orig.length !== rows.length) return true;
    return rows.some((r, i) => r.value !== orig[i].value);
  }, [rows, sezione]);

  const move = (idx, delta) => {
    setRows((prev) => {
      const next = [...prev];
      const j = idx + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const startEdit = (idx) => {
    setEditIdx(idx);
    setEditVal(rows[idx].value);
  };

  const confirmEdit = () => {
    const v = editVal.trim();
    if (!v) return;
    setRows((prev) => {
      if (prev.some((r, i) => i !== editIdx && r.value === v)) return prev; // no duplicati
      const next = [...prev];
      next[editIdx] = { ...next[editIdx], value: v, label: v };
      return next;
    });
    setEditIdx(null);
    setEditVal("");
  };

  const remove = (idx) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const add = () => {
    const v = newVal.trim();
    if (!v || rows.some((r) => r.value === v)) return;
    setRows((prev) => [...prev, { value: v, label: v, orig: null }]);
    setNewVal("");
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        options: rows.map((r) => ({ value: r.value, label: r.label || r.value })),
        renames: rows
          .filter((r) => r.orig && r.orig !== r.value)
          .map((r) => ({ old: r.orig, new: r.value })),
      };
      const res = await apiFetch(`${API_BASE}/bevande/sezioni/${sezione.key}/tipologie`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail || `HTTP ${res.status}`);
      }
      const n = data?.voci_rinominate || 0;
      setMsg({
        kind: "ok",
        text: n > 0 ? `Salvato — ${n} voci rinominate` : "Salvato",
      });
      // Riallinea gli orig al nuovo stato server
      setRows((prev) => prev.map((r) => ({ ...r, orig: r.value })));
      onSaved?.();
    } catch (e) {
      setMsg({ kind: "err", text: String(e.message || e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-neutral-200 rounded-xl p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-neutral-800">{sezione.nome}</div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition disabled:opacity-50"
        >
          {saving ? "Salvo…" : "Salva"}
        </button>
      </div>
      {msg && (
        <div
          className={`text-xs rounded-lg px-2.5 py-1.5 mb-2 border ${
            msg.kind === "ok"
              ? "text-green-700 bg-green-50 border-green-200"
              : "text-red-700 bg-red-50 border-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}
      <ul className="space-y-1">
        {rows.map((r, idx) => (
          <li
            key={`${r.orig ?? "new"}-${idx}`}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50"
          >
            <span className="flex flex-col">
              <button onClick={() => move(idx, -1)} disabled={idx === 0}
                className="text-[10px] leading-none text-neutral-500 hover:text-neutral-800 disabled:opacity-30">▲</button>
              <button onClick={() => move(idx, +1)} disabled={idx === rows.length - 1}
                className="text-[10px] leading-none text-neutral-500 hover:text-neutral-800 disabled:opacity-30">▼</button>
            </span>
            {editIdx === idx ? (
              <>
                <input
                  autoFocus
                  value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") setEditIdx(null); }}
                  className="flex-1 px-2 py-1 border border-amber-400 rounded-md text-sm bg-white focus:outline-none"
                />
                <button onClick={confirmEdit} className="text-xs font-semibold text-green-700 px-1.5">OK</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-neutral-800">
                  {r.value}
                  {r.orig && r.orig !== r.value && (
                    <span className="text-[11px] text-amber-700 ml-1.5">(era: {r.orig})</span>
                  )}
                  {!r.orig && <span className="text-[11px] text-green-700 ml-1.5">(nuova)</span>}
                </span>
                <button onClick={() => startEdit(idx)} title="Rinomina (propagata alle voci)"
                  className="text-xs text-neutral-500 hover:text-neutral-800 px-1">✏️</button>
                <button onClick={() => remove(idx)} title="Elimina (bloccata se usata da voci)"
                  className="text-xs text-neutral-500 hover:text-red-700 px-1">🗑️</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2 mt-2">
        <input
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Nuova sotto-categoria…"
          className="flex-1 px-2.5 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white focus:ring-amber-500 focus:border-amber-500"
        />
        <button onClick={add} disabled={!newVal.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-200 text-neutral-800 hover:bg-neutral-300 transition disabled:opacity-50">
          + Aggiungi
        </button>
      </div>
    </div>
  );
}

export default function TipologieBevEditor({ sezioni, onSaved }) {
  const conTipologie = (sezioni || []).filter((s) => tipFieldOf(s));
  if (conTipologie.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        Nessuna sezione bevande con sotto-categorie (campo tipologia).
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {conTipologie.map((s) => (
        <SezioneTipologie key={s.key} sezione={s} onSaved={onSaved} />
      ))}
    </div>
  );
}
