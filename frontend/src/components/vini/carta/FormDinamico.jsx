// @version: v1.2 — aggiunto type "checkbox" (mig 106 birre: flag gluten_free).
// v1.1 — fix: accetta sia `f.name` che `f.key` come identificatore campo.
// Il seed backend usa `key` (app/models/bevande_db.py); prima il FE leggeva solo
// `f.name` → tutti i campi condividevano chiave `undefined` nello state e
// digitare in uno li compilava tutti. Ora uso `fieldId(f)` ovunque.
//
// Schema atteso (JSON): { fields: [ {key|name, label, type, required, options?, placeholder?, help?}, ... ] }
// Tipi supportati: text, number, textarea, select, checkbox
// Persisto stringhe a video per text/number/textarea/select, boolean per checkbox.
// La normalizzazione (number → float, checkbox → 0/1) è fatta dal chiamante
// (CartaSezioneEditor.normalizeValues) prima di POST.

import React from "react";

// Helper: identificatore campo — preferisce `name`, cade su `key` (seed DB usa `key`)
const fieldId = (f) => f?.name ?? f?.key;

// Riconosce un valore "checked" sia in stato boolean (after click) sia in stato
// stringa "1"/"0" (after openEdit che fa String(voce.gluten_free)).
const isChecked = (v) =>
  v === true || v === 1 || v === "1" || v === "true" || v === "on";

export default function FormDinamico({ schema, values, onChange, errors = {} }) {
  if (!schema || !Array.isArray(schema.fields)) {
    return (
      <div className="text-sm text-neutral-500 italic p-4 border border-dashed border-neutral-300 rounded-xl">
        Schema form non disponibile per questa sezione.
      </div>
    );
  }

  const setField = (name, v) => {
    onChange({ ...values, [name]: v });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
      {schema.fields.map((f) => {
        const id = fieldId(f);
        const val = values[id] ?? "";
        const err = errors[id];
        const commonCls =
          "w-full px-3 py-2 border rounded-lg text-sm bg-white min-h-[40px] " +
          "focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue " +
          (err ? "border-red-400" : "border-neutral-300");
        const fullWidth = f.type === "textarea" || f.fullWidth;

        // Checkbox ha layout proprio: label sulla destra dello switch, no input full-width
        if (f.type === "checkbox") {
          const checked = isChecked(val);
          return (
            <div key={id} className={fullWidth ? "md:col-span-2" : ""}>
              <label
                className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border min-h-[44px] cursor-pointer transition select-none ${
                  checked
                    ? "bg-emerald-50 border-emerald-300"
                    : "bg-white border-neutral-300 hover:bg-neutral-50"
                } ${err ? "border-red-400" : ""}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 accent-brand-green"
                  checked={checked}
                  onChange={(e) => setField(id, e.target.checked)}
                />
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-neutral-800">
                    {f.label || id}
                    {f.required && <span className="text-red-500 ml-0.5">*</span>}
                  </span>
                  {f.help && !err && (
                    <span className="block text-[11px] text-neutral-500 mt-0.5">{f.help}</span>
                  )}
                  {err && (
                    <span className="block text-[11px] text-red-600 mt-0.5 font-semibold">{err}</span>
                  )}
                </span>
              </label>
            </div>
          );
        }

        return (
          <div key={id} className={fullWidth ? "md:col-span-2" : ""}>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              {f.label || id}
              {f.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {f.type === "textarea" ? (
              <textarea
                className={commonCls + " min-h-[80px]"}
                rows={f.rows || 3}
                value={val}
                onChange={(e) => setField(id, e.target.value)}
                placeholder={f.placeholder || ""}
              />
            ) : f.type === "select" ? (
              <select
                className={commonCls}
                value={val}
                onChange={(e) => setField(id, e.target.value)}
              >
                <option value="">— seleziona —</option>
                {(f.options || []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === "number" ? "number" : "text"}
                step={f.type === "number" ? "any" : undefined}
                className={commonCls}
                value={val}
                onChange={(e) => setField(id, e.target.value)}
                placeholder={f.placeholder || ""}
              />
            )}
            {f.help && !err && (
              <div className="text-[11px] text-neutral-500 mt-1">{f.help}</div>
            )}
            {err && (
              <div className="text-[11px] text-red-600 mt-1 font-semibold">{err}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
