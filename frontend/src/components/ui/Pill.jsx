// FILE: frontend/src/components/ui/Pill.jsx
// @version: v1.0 — M.I primitive: pulsante "pill" toggle/radio TRGB-02
//
// Usato per gruppi di toggle radio-like (Bottiglie/Madri/Per Produttore,
// chip filtri tipologia, ecc.). Differenza da <Btn>: visivamente più
// "etichetta" che CTA, con stato attivo molto evidente.
//
// Solid quando attivo, outline quando inattivo. Il "tone" definisce il
// colore del modulo (amber per Vini, etc.). Usare PillGroup per gestire
// la selezione singola in modo dichiarativo.
//
// Esempi:
//   <Pill active onClick={...}>🍾 Bottiglie</Pill>
//   <Pill onClick={...}>🍷 Madri</Pill>
//
//   <PillGroup value={vista} onChange={setVista} options={[
//     { value: "bottiglie", label: "🍾 Bottiglie" },
//     { value: "madri",     label: "🍷 Madri" },
//   ]} />

import React from "react";

const SIZE = {
  sm: "px-2 py-1 text-[10px] rounded-md",
  md: "px-2.5 py-1.5 text-xs rounded-lg",
  lg: "px-3 py-2 text-sm rounded-lg",
};

const TONE = {
  // Per ogni tone definiamo: active (solid) e inactive (outline ghost-like)
  amber: {
    active:   "bg-amber-700 text-white shadow-sm border border-amber-700",
    inactive: "bg-white text-neutral-700 border border-neutral-300 hover:bg-amber-50 hover:border-amber-300",
  },
  blue: {
    active:   "bg-brand-blue text-white shadow-sm border border-brand-blue",
    inactive: "bg-white text-neutral-700 border border-neutral-300 hover:bg-blue-50 hover:border-blue-300",
  },
  emerald: {
    active:   "bg-emerald-700 text-white shadow-sm border border-emerald-700",
    inactive: "bg-white text-neutral-700 border border-neutral-300 hover:bg-emerald-50 hover:border-emerald-300",
  },
  rose: {
    active:   "bg-rose-700 text-white shadow-sm border border-rose-700",
    inactive: "bg-white text-neutral-700 border border-neutral-300 hover:bg-rose-50 hover:border-rose-300",
  },
  violet: {
    active:   "bg-violet-700 text-white shadow-sm border border-violet-700",
    inactive: "bg-white text-neutral-700 border border-neutral-300 hover:bg-violet-50 hover:border-violet-300",
  },
  neutral: {
    active:   "bg-neutral-800 text-white shadow-sm border border-neutral-800",
    inactive: "bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-50",
  },
};

export function Pill({
  active = false,
  size = "md",
  tone = "amber",
  disabled = false,
  onClick,
  className = "",
  children,
  ...rest
}) {
  const t = TONE[tone] || TONE.amber;
  const state = active ? t.active : t.inactive;
  const base = "inline-flex items-center gap-1 font-semibold transition whitespace-nowrap select-none " +
               "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 " +
               "disabled:opacity-40 disabled:cursor-not-allowed";
  const cls = [base, SIZE[size] || SIZE.md, state, className].filter(Boolean).join(" ");
  return (
    <button type="button" onClick={onClick} disabled={disabled}
            className={cls} aria-pressed={active} {...rest}>
      {children}
    </button>
  );
}

/**
 * Gruppo dichiarativo di pill — selezione singola.
 * options = [{value, label, icon?, disabled?}]
 */
export function PillGroup({
  value,
  onChange,
  options = [],
  size = "md",
  tone = "amber",
  className = "",
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`.trim()}>
      {options.map(opt => (
        <Pill
          key={opt.value}
          active={value === opt.value}
          size={size}
          tone={tone}
          disabled={opt.disabled}
          onClick={() => onChange?.(opt.value)}
        >
          {opt.icon && <span>{opt.icon}</span>}
          {opt.label}
        </Pill>
      ))}
    </div>
  );
}

// Default export per compatibilità import
export default Pill;
