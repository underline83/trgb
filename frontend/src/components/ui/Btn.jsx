// FILE: frontend/src/components/ui/Btn.jsx
// @version: v1.0 — Mattone UI condiviso: bottone TRGB-02
//
// Primitivo bottone con varianti e taglie uniformi.
// Le pagine esistenti continuano a usare le loro classi custom;
// le pagine nuove (o refactor) usano <Btn>.
//
// Esempi:
//   <Btn>Salva</Btn>                           // primary md
//   <Btn variant="danger" size="sm">Elimina</Btn>
//   <Btn variant="chip" tone="emerald">WA</Btn>  // pastello riutilizzabile
//   <Btn as="a" href="/foo" variant="ghost">Annulla</Btn>
//   <Btn loading>Invia</Btn>                   // mostra spinner, disabilita

import React from "react";

// ── Taglie (touch target 44pt min su md/lg — regola mobile-aware) ──────
const SIZE = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-4 py-2 text-sm rounded-xl min-h-[40px]",
  lg: "px-5 py-3 text-base rounded-xl min-h-[48px]",
};

// ── Varianti "solid" (bottoni CTA) ─────────────────────────────────────
const SOLID = {
  primary:   "bg-brand-blue  text-white  hover:bg-blue-700    active:bg-blue-800    border border-brand-blue",
  success:   "bg-brand-green text-white  hover:bg-emerald-700 active:bg-emerald-800 border border-brand-green",
  danger:    "bg-brand-red   text-white  hover:bg-red-700     active:bg-red-800     border border-brand-red",
  warning:   "bg-amber-500   text-white  hover:bg-amber-600   active:bg-amber-700   border border-amber-500",
  dark:      "bg-brand-ink   text-white  hover:bg-neutral-800 active:bg-neutral-900 border border-brand-ink",
};

// ── Varianti "outline / neutre" ────────────────────────────────────────
const OUTLINE = {
  secondary: "bg-white text-neutral-800 border border-neutral-300 hover:bg-neutral-50 active:bg-neutral-100",
  ghost:     "bg-transparent text-neutral-700 border border-transparent hover:bg-neutral-100 active:bg-neutral-200",
};

// ── Chip tonali (filtri, azioni marketing pastello) ────────────────────
// Usa `tone` separato da variant: <Btn variant="chip" tone="emerald">…</Btn>
const CHIP_TONE = {
  emerald: "bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200",
  sky:     "bg-sky-100     text-sky-700     border border-sky-200     hover:bg-sky-200",
  amber:   "bg-amber-100   text-amber-700   border border-amber-200   hover:bg-amber-200",
  red:     "bg-red-100     text-red-700     border border-red-200     hover:bg-red-200",
  violet:  "bg-violet-100  text-violet-700  border border-violet-200  hover:bg-violet-200",
  neutral: "bg-neutral-100 text-neutral-700 border border-neutral-200 hover:bg-neutral-200",
  blue:    "bg-blue-100    text-blue-700    border border-blue-200    hover:bg-blue-200",
};

function variantClass(variant, tone) {
  if (variant === "chip") return CHIP_TONE[tone] || CHIP_TONE.neutral;
  if (OUTLINE[variant]) return OUTLINE[variant];
  return SOLID[variant] || SOLID.primary;
}

// Spinner inline (tailwind puro, no import)
function Spinner({ size = 14 }) {
  return (
    <svg
      className="animate-spin -ml-0.5 mr-1 inline-block"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export default function Btn({
  variant = "primary",
  size = "md",
  tone,
  as = "button",
  type,
  disabled = false,
  loading = false,
  className = "",
  children,
  ...rest
}) {
  const Tag = as;
  const base =
    "inline-flex items-center justify-center gap-1.5 font-semibold transition select-none " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-1 " +
    "disabled:opacity-50 disabled:cursor-not-allowed shadow-sm";

  const classes = `${base} ${SIZE[size] || SIZE.md} ${variantClass(variant, tone)} ${className}`.trim();

  const aria = loading ? { "aria-busy": "true" } : null;

  // Solo <button> ha il prop `type` nativo
  const tagProps =
    as === "button"
      ? { type: type || "button", disabled: disabled || loading, ...aria }
      : { "aria-disabled": disabled || loading, ...aria };

  return (
    <Tag className={classes} {...tagProps} {...rest}>
      {loading && <Spinner />}
      {children}
    </Tag>
  );
}
