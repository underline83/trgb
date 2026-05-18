// frontend/src/components/StatoPagamentoBadge.jsx
// @version: v1.2 — Step A redesign fatture (2026-05-18): + rateizzato, spostato
//
// Badge condiviso per visualizzare gli stati pagamento (7 chip + override scaduta).
//
// Namespace supportati:
//
//   FATTURE (Modulo M.2, fe_fatture.stato_pagamento, lowercase) — legacy lossy:
//     - da_pagare      → rosso pallido
//     - da_verificare  → ambra (attenzione)
//     - pagato_manuale → verde chiaro con * (in attesa di riconciliazione)
//     - pagato         → verde solido con 🔒 (immutabile, da banca)
//
//   CG / RATE (Modulo M.3, cg_uscite.stato, uppercase) — tassonomia full 8 stati:
//     - PROGRAMMATO     → "da_pagare"
//     - SCADUTO         → "da_pagare" + flag scadutaModifier (rosso forte + "Scaduto")
//     - VERIFICARE      → "da_verificare"
//     - PAGATO_MANUALE  → "pagato_manuale"
//     - PAGATO          → "pagato"
//     - PARZIALE        → "parziale" (◐ amber)
//     - RATEIZZATO      → "rateizzato" (📆 purple) — NEW v1.2
//     - SPOSTATO        → "spostato" (↩ fuchsia) — NEW v1.2
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
  rateizzato: {
    label: "Rateizzata",
    color: "bg-purple-100 text-purple-800 border-purple-300",
    icon: "📆",
    desc: "Piano rate aperto — la spesa fissa gestisce le scadenze",
  },
  spostato: {
    label: "Scadenza spostata",
    color: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
    icon: "↩",
    desc: "Scadenza rinegoziata singolarmente (G.7)",
  },
};

// Mappa namespace CG (cg_uscite.stato uppercase) → namespace fatture (lowercase)
const CG_TO_STANDARD = {
  PROGRAMMATO: "da_pagare",
  SCADUTO: "da_pagare",       // SCADUTO = da_pagare con scadenza < oggi (override via prop scaduta)
  VERIFICARE: "da_verificare",
  PAGATO_MANUALE: "pagato_manuale",
  PAGATO: "pagato",
  PARZIALE: "parziale",
  RATEIZZATO: "rateizzato",   // v1.2: chip dedicato (prima → da_pagare)
  SPOSTATO: "spostato",       // v1.2: chip dedicato (prima → da_pagare)
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
