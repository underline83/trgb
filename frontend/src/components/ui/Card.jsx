// FILE: frontend/src/components/ui/Card.jsx
// @version: v1.0 — M.I primitive: card contenitore TRGB-02
//
// Wrapper standard per "blocco contenuto". Coerente con la specifica §9-bis
// punto 6 di architettura_pattern.md:
//   "wrapper bg-brand-cream + card shadow-2xl rounded-3xl"
//
// Varianti:
//  - tone: neutral (default, bianco), info, success, warning, danger,
//          amber|emerald|blue|violet|rose (per evidenze contestuali)
//  - shadow: "lg" (default = shadow-2xl come da spec), "md" (shadow-sm) per
//            card interne in liste, "none" per usi flat
//  - radius: "3xl" (default da spec), "2xl" per sub-card più piccole
//
// Esempi:
//   <Card>...</Card>                          // bianca, ombra grande, raggio 3xl
//   <Card tone="amber">...</Card>             // evidenza modulo Vini
//   <Card tone="success">✓ Salvato</Card>    // banner conferma
//   <Card shadow="md" radius="2xl" padded={false}>...</Card>  // sub-card

import React from "react";

const TONE = {
  neutral: "bg-white border border-neutral-200",
  // Stati semantici
  info:    "bg-blue-50    border border-blue-200",
  success: "bg-emerald-50 border border-emerald-200",
  warning: "bg-amber-50   border border-amber-200",
  danger:  "bg-rose-50    border border-rose-200",
  // Tonali (per evidenze contestuali — usare con parsimonia)
  amber:   "bg-amber-50   border border-amber-200",
  emerald: "bg-emerald-50 border border-emerald-200",
  blue:    "bg-blue-50    border border-blue-200",
  violet:  "bg-violet-50  border border-violet-200",
  rose:    "bg-rose-50    border border-rose-200",
  ghost:   "bg-neutral-50 border border-neutral-200",
};

const SHADOW = {
  none: "",
  sm:   "shadow-sm",
  md:   "shadow-md",
  lg:   "shadow-2xl",  // ← default da spec (testa+tab pattern §4)
};

const RADIUS = {
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",  // ← default da spec
};

const PADDING = {
  none: "",
  sm:   "p-3",
  md:   "p-4",
  lg:   "p-5",
};

export default function Card({
  tone = "neutral",
  shadow = "lg",
  radius = "3xl",
  padding = "md",
  padded,                  // shorthand: padded={false} → padding="none"
  className = "",
  as = "div",
  children,
  ...rest
}) {
  const Tag = as;
  const pad = padded === false ? "none" : padding;
  const classes = [
    TONE[tone] || TONE.neutral,
    SHADOW[shadow] ?? SHADOW.lg,
    RADIUS[radius] || RADIUS["3xl"],
    PADDING[pad] || PADDING.md,
    "overflow-hidden",
    className,
  ].filter(Boolean).join(" ");
  return <Tag className={classes} {...rest}>{children}</Tag>;
}
