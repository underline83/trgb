// frontend/src/components/StatoPagamentoBadge.jsx
// @version: v1.0 — Modulo M.2, 2026-04-27
//
// Badge condiviso per visualizzare i 4 stati pagamento fattura.
//   - da_pagare      → grigio neutro
//   - da_verificare  → ambra (attenzione)
//   - pagato_manuale → verde chiaro con * (in attesa di riconciliazione)
//   - pagato         → verde solido con 🔒 (immutabile, da banca)
//
// Uso:
//   <StatoPagamentoBadge stato={f.stato_pagamento} />
//   <StatoPagamentoBadge stato="pagato_manuale" size="lg" />

import React from "react";

export const STATI_PAGAMENTO = {
  da_pagare: {
    label: "Da pagare",
    color: "bg-red-50 text-red-700 border-red-200",
    icon: "",
    desc: "Fattura aperta, da gestire",
  },
  da_verificare: {
    label: "Da verificare",
    color: "bg-amber-50 text-amber-800 border-amber-300",
    icon: "❓",
    desc: "Forse pagata, controllare estratto conto",
  },
  pagato_manuale: {
    label: "Pagato*",
    color: "bg-emerald-50 text-emerald-700 border-emerald-300",
    icon: "",
    desc: "Dichiarata pagata dall'utente, in attesa di riconciliazione bancaria",
  },
  pagato: {
    label: "Pagato",
    color: "bg-emerald-100 text-emerald-900 border-emerald-500",
    icon: "🔒",
    desc: "Certificata da riconciliazione bancaria — immutabile",
  },
};

export default function StatoPagamentoBadge({ stato, size = "sm", showIcon = true, className = "" }) {
  const cfg = STATI_PAGAMENTO[stato] || STATI_PAGAMENTO.da_pagare;
  const sz = size === "lg"
    ? "px-2.5 py-1 text-xs"
    : size === "md"
    ? "px-2 py-0.5 text-[10px]"
    : "px-1.5 py-0.5 text-[9px]";
  return (
    <span
      title={cfg.desc}
      className={`inline-flex items-center gap-1 rounded-full font-semibold border ${cfg.color} ${sz} ${className}`}
    >
      {showIcon && cfg.icon && <span>{cfg.icon}</span>}
      <span>{cfg.label}</span>
    </span>
  );
}
