// FILE: frontend/src/components/ui/Textarea.jsx
// @version: v1.0 — M.I primitive: textarea multi-riga TRGB-02
//
// Coerente con TextInput: stessa palette focus, stesso pattern onChange(value).
//
// Esempi:
//   <Textarea rows={3} value={note} onChange={setNote} placeholder="Note libere…" />

import React from "react";

const SIZE = {
  sm: "px-2 py-1 text-xs rounded-md",
  md: "px-3 py-1.5 text-sm rounded-lg",
  lg: "px-4 py-2.5 text-base rounded-xl",
};

export default function Textarea({
  size = "md",
  value,
  onChange,
  onChangeEvent,
  rows = 3,
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
    "w-full bg-white border transition outline-none resize-y " +
    "placeholder:text-neutral-400 " +
    "focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue " +
    "disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed";

  const stateBorder = error
    ? "border-brand-red focus:border-brand-red focus:ring-brand-red/30"
    : "border-neutral-300";

  return (
    <textarea
      value={value ?? ""}
      onChange={handle}
      rows={rows}
      placeholder={placeholder}
      disabled={disabled}
      className={`${base} ${SIZE[size] || SIZE.md} ${stateBorder} ${className}`.trim()}
      {...rest}
    />
  );
}
