// FILE: frontend/src/components/ui/EmptyState.jsx
// @version: v1.0 — Mattone UI condiviso: stato vuoto con watermark gobbette
//
// Usato quando una lista/tab è vuota. Mostra icona (emoji o SVG),
// titolo, descrizione e un'azione opzionale (es. "+ Nuovo ..."),
// con watermark gobbette R/G/B sfumate sullo sfondo per identità brand.
//
// Esempio:
//   <EmptyState
//     icon="📭"
//     title="Nessuna prenotazione"
//     description="Non ci sono prenotazioni per questa data."
//     action={<Btn onClick={creaNuova}>+ Nuova prenotazione</Btn>}
//   />

import React from "react";

/**
 * Watermark gobbette: tre curve RGB molto sfumate dietro il contenuto.
 * Decorativo — aria-hidden.
 */
function GobbetteWatermark() {
  return (
    <svg
      viewBox="0 0 1024 1024"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <g opacity="0.08">
        <path
          d="M 180 560 Q 300 380 420 560"
          stroke="#E8402B" strokeWidth="22" strokeLinecap="round" fill="none"
        />
        <path
          d="M 420 560 Q 540 380 660 560"
          stroke="#2EB872" strokeWidth="22" strokeLinecap="round" fill="none"
        />
        <path
          d="M 660 560 Q 780 380 900 560"
          stroke="#2E7BE8" strokeWidth="22" strokeLinecap="round" fill="none"
        />
      </g>
    </svg>
  );
}

export default function EmptyState({
  icon,               // string (emoji) | ReactNode
  title,              // string
  description,        // string | ReactNode
  action,             // ReactNode (bottone/link)
  watermark = true,   // true → gobbette sullo sfondo
  compact = false,    // true → padding ridotto (per pannelli piccoli)
  className = "",
}) {
  const pad = compact ? "py-8" : "py-14";

  return (
    <div
      className={`relative overflow-hidden bg-white border border-neutral-200 rounded-2xl ${pad} px-6 text-center ${className}`.trim()}
    >
      {watermark && <GobbetteWatermark />}
      <div className="relative z-10 max-w-md mx-auto">
        {icon && (
          <div className={`${compact ? "text-3xl" : "text-5xl"} mb-3`}>
            {icon}
          </div>
        )}
        {title && (
          <h3 className="text-base sm:text-lg font-semibold text-brand-ink mb-1">
            {title}
          </h3>
        )}
        {description && (
          <p className="text-sm text-neutral-500 mb-4 leading-relaxed">
            {description}
          </p>
        )}
        {action && <div className="flex items-center justify-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
