// FILE: frontend/src/components/ui/StatusBadge.jsx
// @version: v1.0 — Mattone UI condiviso: badge di stato TRGB-02
//
// Badge compatto per stati: successo/warning/errore/info/neutro.
// Sostituisce la scrittura ripetitiva di `bg-xxx-100 text-xxx-700 border border-xxx-300`
// che appare in decine di pagine.
//
// Esempi:
//   <StatusBadge tone="success">Pagata</StatusBadge>
//   <StatusBadge tone="warning" size="md">In attesa</StatusBadge>
//   <StatusBadge tone="danger" dot>Scaduto</StatusBadge>

import React from "react";

// `tone` = {success|warning|danger|info|neutral|brand}
const TONE = {
  success: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200", dot: "bg-emerald-500" },
  warning: { bg: "bg-amber-100",   text: "text-amber-800",   border: "border-amber-200",   dot: "bg-amber-500" },
  danger:  { bg: "bg-red-100",     text: "text-red-700",     border: "border-red-200",     dot: "bg-red-500" },
  info:    { bg: "bg-sky-100",     text: "text-sky-700",     border: "border-sky-200",     dot: "bg-sky-500" },
  neutral: { bg: "bg-neutral-100", text: "text-neutral-600", border: "border-neutral-200", dot: "bg-neutral-400" },
  brand:   { bg: "bg-blue-100",    text: "text-blue-800",    border: "border-blue-200",    dot: "bg-brand-blue" },
  violet:  { bg: "bg-violet-100",  text: "text-violet-700",  border: "border-violet-200",  dot: "bg-violet-500" },
};

const SIZE = {
  sm: "text-[10px] px-1.5 py-0.5 rounded-md",
  md: "text-xs px-2 py-0.5 rounded-md",
  lg: "text-sm px-2.5 py-1 rounded-lg",
};

export default function StatusBadge({
  tone = "neutral",
  type,            // alias di tone per retrocompatibilità
  size = "md",
  dot = false,     // se true mostra pallino colorato
  className = "",
  children,
  ...rest
}) {
  const t = TONE[type || tone] || TONE.neutral;
  const s = SIZE[size] || SIZE.md;

  return (
    <span
      className={`inline-flex items-center gap-1 border font-medium whitespace-nowrap ${t.bg} ${t.text} ${t.border} ${s} ${className}`}
      {...rest}
    >
      {dot && <span className={`inline-block w-1.5 h-1.5 rounded-full ${t.dot}`} aria-hidden="true" />}
      {children}
    </span>
  );
}
