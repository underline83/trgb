// FILE: frontend/src/components/ui/Stepper.jsx
// @version: v1.0 — M.I primitive: stepper per wizard multi-step TRGB-02
//
// Stepper orizzontale per flussi multi-step (es. wizard nuovo vino).
// Mostra i passi come pill numerate con stato done/active/pending.
//
// L'API è dichiarativa: passi `steps` e `current`. La logica di abilitazione
// (canAdvance, ecc.) vive nel componente padre — qui solo visivo.
//
// Esempio:
//   <Stepper
//     current={2}
//     steps={[
//       { key: 1, label: "Produttore", icon: "🏛️" },
//       { key: 2, label: "Vino madre", icon: "🍷" },
//       { key: 3, label: "Annata",     icon: "📅" },
//     ]}
//     tone="amber"
//   />

import React from "react";

const TONE = {
  amber: {
    active:  "bg-amber-700 text-white shadow-sm",
    done:    "bg-emerald-100 text-emerald-800",
    pending: "bg-neutral-100 text-neutral-500",
    badgeActive: "bg-white text-amber-900",
    badgeDone:   "bg-emerald-700 text-white",
    badgePending:"bg-neutral-300 text-neutral-700",
    barDone:     "bg-emerald-300",
    barPending:  "bg-neutral-200",
  },
  blue: {
    active:  "bg-brand-blue text-white shadow-sm",
    done:    "bg-emerald-100 text-emerald-800",
    pending: "bg-neutral-100 text-neutral-500",
    badgeActive: "bg-white text-blue-900",
    badgeDone:   "bg-emerald-700 text-white",
    badgePending:"bg-neutral-300 text-neutral-700",
    barDone:     "bg-emerald-300",
    barPending:  "bg-neutral-200",
  },
};

export default function Stepper({
  current = 1,
  steps = [],
  tone = "amber",
  className = "",
}) {
  const t = TONE[tone] || TONE.amber;
  return (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      {steps.map((s, i) => {
        const done = s.key < current;
        const active = s.key === current;
        const pillCls = active ? t.active : done ? t.done : t.pending;
        const badgeCls = active ? t.badgeActive : done ? t.badgeDone : t.badgePending;
        const barCls = s.key < current ? t.barDone : t.barPending;
        return (
          <React.Fragment key={s.key}>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition ${pillCls}`}>
              <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${badgeCls}`}>
                {done ? "✓" : s.key}
              </span>
              <span className="text-xs font-semibold whitespace-nowrap">
                {s.icon && <span className="mr-1">{s.icon}</span>}{s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 ${barCls}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
