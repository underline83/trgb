// FILE: frontend/src/components/ui/Select.jsx
// @version: v1.0 — M.I primitive: select dropdown TRGB-02
//
// Wrapper standard per <select>. Accetta `options` come array di
//   - stringhe: `["Italia", "Francia"]`
//   - oppure oggetti `{value, label, disabled?}`
//
// Per UI nuove (M2 v2): le label dovrebbero essere parlanti (no codici Excel).
// Vedi STATO_*_OPTIONS_LONG in viniConstants.js per il pattern.
//
// Esempi:
//   <Select value={x} onChange={setX} options={["A","B","C"]} placeholder="—" />
//   <Select value={statoVendita} onChange={setStatoVendita} options={STATO_VENDITA_OPTIONS_LONG} />

import React from "react";

const SIZE = {
  sm: "px-2 py-1 text-xs rounded-md",
  md: "px-3 py-1.5 text-sm rounded-lg min-h-[40px]",
  lg: "px-4 py-2.5 text-base rounded-xl min-h-[48px]",
};

export default function Select({
  size = "md",
  value,
  onChange,
  onChangeEvent,
  options = [],
  placeholder,            // opzionale: aggiunge un'opzione "value=''" come primo elemento
  includeEmpty = false,   // true: aggiunge un'opzione vuota; placeholder è il label di quella
  disabled = false,
  error = false,
  className = "",
  ...rest
}) {
  const handle = (e) => {
    if (onChangeEvent) onChangeEvent(e);
    if (onChange) onChange(e.target.value);
  };

  const base =
    "w-full bg-white border transition outline-none cursor-pointer " +
    "focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue " +
    "disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed";

  const stateBorder = error
    ? "border-brand-red focus:border-brand-red focus:ring-brand-red/30"
    : "border-neutral-300";

  const showEmpty = includeEmpty || !!placeholder;

  return (
    <select
      value={value ?? ""}
      onChange={handle}
      disabled={disabled}
      className={`${base} ${SIZE[size] || SIZE.md} ${stateBorder} ${className}`.trim()}
      {...rest}
    >
      {showEmpty && <option value="">{placeholder || "—"}</option>}
      {options.map((opt, i) => {
        // Stringhe semplici
        if (typeof opt === "string" || typeof opt === "number") {
          return <option key={opt + "_" + i} value={opt}>{opt}</option>;
        }
        // Oggetti {value, label, disabled}
        return (
          <option key={opt.value + "_" + i} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}
