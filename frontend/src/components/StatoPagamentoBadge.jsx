// frontend/src/components/StatoPagamentoBadge.jsx
// @version: v1.1 — Modulo M.3 (2026-04-27): supporto valori CG (cg_uscite.stato)
//
// Badge condiviso per visualizzare gli stati pagamento (4+ stati).
//
// Namespace supportati:
//
//   FATTURE (Modulo M.2, fe_fatture.stato_pagamento, lowercase):
//     - da_pagare      → grigio neutro
//     - da_verificare  → ambra (attenzione)
//     - pagato_manuale → verde chiaro con * (in attesa di riconciliazione)
//     - pagato         → verde solido con 🔒 (immutabile, da banca)
//
//   CG / RATE (Modulo M.3, cg_uscite.stato, uppercase):
//     - DA_PAGARE       → mappato a "da_pagare"
//     - SCADUTA         → mappato a "da_pagare" + flag scadutaModifier
//     - DA_VERIFICARE   → mappato a "da_verificare"
//     - PAGATA_MANUALE  → mappato a "pagato_manuale"
//     - PAGATA          → mappato a "pagato"
//     - PARZIALE        → 5° stato dedicato (caso edge rate, non in fatture)
//
// Uso:
//   <StatoPagamentoBadge stato={f.stato_pagamento} />              // fatture (lowercase)
//   <StatoPagamentoBadge stato={uscita.stato} scaduta={isScaduta}/> // CG (uppercase)

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
  parziale: {
    label: "Parziale",
    color: "bg-amber-100 text-amber-800 border-amber-400",
    icon: "◐",
    desc: "Pagamento parziale registrato — manca differenza",
  },
};

// Mappa namespace CG (cg_uscite.stato uppercase) → namespace fatture (lowercase)
const CG_TO_STANDARD = {
  DA_PAGARE: "da_pagare",
  SCADUTA: "da_pagare",       // SCADUTA = da_pagare con scadenza < oggi
  DA_VERIFICARE: "da_verificare",
  PAGATA_MANUALE: "pagato_manuale",
  PAGATA: "pagato",
  PARZIALE: "parziale",
};

export function normalizeStato(stato) {
  if (!stato) return "da_pagare";
  // Già lowercase (fatture)
  if (STATI_PAGAMENTO[stato]) return stato;
  // Uppercase (CG) → traduci
  if (CG_TO_STANDARD[stato]) return CG_TO_STANDARD[stato];
  return "da_pagare";
}

export default function StatoPagamentoBadge({ stato, scaduta = false, size = "sm", showIcon = true, className = "" }) {
  const key = normalizeStato(stato);
  const cfg = STATI_PAGAMENTO[key] || STATI_PAGAMENTO.da_pagare;
  // Scaduta override visivo: se da_pagare + scaduta, dipingo rosso più forte
  const isScadutaVisive = scaduta && key === "da_pagare";
  const colorOverride = isScadutaVisive
    ? "bg-red-100 text-red-800 border-red-400"
    : cfg.color;
  const labelOverride = isScadutaVisive ? "Scaduto" : cfg.label;

  const sz = size === "lg"
    ? "px-2.5 py-1 text-xs"
    : size === "md"
    ? "px-2 py-0.5 text-[10px]"
    : "px-1.5 py-0.5 text-[9px]";
  return (
    <span
      title={cfg.desc + (isScadutaVisive ? " (scaduto)" : "")}
      className={`inline-flex items-center gap-1 rounded-full font-semibold border ${colorOverride} ${sz} ${className}`}
    >
      {showIcon && cfg.icon && <span>{cfg.icon}</span>}
      <span>{labelOverride}</span>
    </span>
  );
}
