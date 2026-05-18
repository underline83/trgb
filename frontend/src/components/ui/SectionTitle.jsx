// FILE: frontend/src/components/ui/SectionTitle.jsx
// @version: v1.0 — M.I primitive: titolo di sezione dentro form/card TRGB-02
//
// Usato per separare blocchi tematici dentro un form lungo o una card.
// Equivalente "interno" all'h1 di PageLayout.
//
// Slot:
//   children   = testo titolo (string | ReactNode)
//   subtitle   = sottotitolo opzionale (string | ReactNode)
//   right      = ReactNode opzionale allineato a destra (es. count, link aggiuntivo)
//   tone       = "neutral" (default), "amber", "blue", "rose", ecc. (vedi sotto)
//
// Esempi:
//   <SectionTitle>Identificazione</SectionTitle>
//   <SectionTitle subtitle="Campi obbligatori marcati con *">Anagrafica</SectionTitle>
//   <SectionTitle right={<span className="text-xs">3 elementi</span>}>Vitigni</SectionTitle>

import React from "react";

const TONE = {
  neutral: { text: "text-neutral-800",  border: "border-neutral-200"  },
  amber:   { text: "text-amber-900",    border: "border-amber-200"    },
  blue:    { text: "text-blue-900",     border: "border-blue-200"     },
  rose:    { text: "text-rose-900",     border: "border-rose-200"     },
  emerald: { text: "text-emerald-900",  border: "border-emerald-200"  },
  violet:  { text: "text-violet-900",   border: "border-violet-200"   },
};

export default function SectionTitle({
  children,
  subtitle,
  right,
  tone = "neutral",
  className = "",
}) {
  const t = TONE[tone] || TONE.neutral;
  return (
    <div className={`flex items-end justify-between gap-3 border-b ${t.border} pb-1.5 mb-3 ${className}`.trim()}>
      <div className="min-w-0">
        <h3 className={`text-xs font-bold uppercase tracking-wider ${t.text}`}>
          {children}
        </h3>
        {subtitle && (
          <p className="text-[10px] text-neutral-500 mt-0.5">{subtitle}</p>
        )}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}
