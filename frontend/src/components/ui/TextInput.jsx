// FILE: frontend/src/components/ui/TextInput.jsx
// @version: v1.0 — M.I primitive: input testo/number/email/etc. TRGB-02
//
// Primitivo input con:
//  - size sm/md/lg coerente con Btn
//  - stato error (border rosso)
//  - touch target 40pt+ su size md (regola mobile-aware)
//  - focus ring brand-blue (palette TRGB-02)
//
// L'API è semplificata rispetto a <input> nativo: `onChange` riceve il VALORE,
// non l'evento. Per casi avanzati passare `onChangeEvent` invece.
//
// Esempi:
//   <TextInput value={nome} onChange={setNome} placeholder="Es. Marco" />
//   <TextInput type="number" step="0.01" value={prezzo} onChange={setPrezzo} />
//   <TextInput value={x} onChange={setX} error size="lg" />

import React from "react";

const SIZE = {
  sm: "px-2 py-1 text-xs rounded-md",
  md: "px-3 py-1.5 text-sm rounded-lg min-h-[40px]",
  lg: "px-4 py-2.5 text-base rounded-xl min-h-[48px]",
};

export default function TextInput({
  type = "text",
  size = "md",
  value,
  onChange,
  onChangeEvent,
  placeholder,
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
    "w-full bg-white border transition outline-none " +
    "placeholder:text-neutral-400 " +
    "focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue " +
    "disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed";

  const stateBorder = error
    ? "border-brand-red focus:border-brand-red focus:ring-brand-red/30"
    : "border-neutral-300";

  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={handle}
      placeholder={placeholder}
      disabled={disabled}
      className={`${base} ${SIZE[size] || SIZE.md} ${stateBorder} ${className}`.trim()}
      {...rest}
    />
  );
}
