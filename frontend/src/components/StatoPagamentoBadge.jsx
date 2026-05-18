// frontend/src/components/StatoPagamentoBadge.jsx
// @version: v1.3 — modello 3-dimensioni granitico (2026-05-18)
//
// IMPORTANTE — leggere docs/stato_pagamento_unificato.md §15 + CLAUDE.md.
//
// Questo badge gestisce SOLO la dimensione D1 (stato PAGAMENTO) + i modificatori D2
// (tecnici: *, ?). La dimensione D3 (scadenza/tempo: rateizzata/spostata/in_scadenza/scaduta)
// vive in un componente separato `StatoScadenzaBadge` (da creare).
//
// D1 — stato pagamento (3 valori business):
//   - "non_pagata"    → rosso pallido         (= D1 NON PAGATA, default)
//   - "pagata"        → verde solido + 🔒     (= D1 PAGATA, riconciliata banca)
//   - "parziale"      → amber + ◐             (= D1 PARZIALMENTE PAGATA)
//
// D2 — modificatori tecnici (CG-only, annotazione sopra D1):
//   - "pagata_non_riconciliata" → verde chiaro + *  (D1=PAGATA + D2=non riconciliata)
//   - "da_verificare"           → ambra + ?         (D1=NON PAGATA + D2=dubbio)
//
// Compatibilità con valori storici già usati nel codice (alias):
//   - "da_pagare"      → alias di "non_pagata"
//   - "pagato"         → alias di "pagata"
//   - "pagato_manuale" → alias di "pagata_non_riconciliata"
//
// NON gestiti più da qui (sono D3 — usare StatoScadenzaBadge):
//   - RATEIZZATO, SPOSTATO     → caratteristiche della scadenza
//   - SCADUTO, PROGRAMMATO     → tempo della scadenza
//
// Override visivo "scaduta": SE D1=non_pagata AND flag scaduta=true → palette rosso forte
// e label "Scaduto". Compatibile col passato — molti consumer lo usano già così.
//
// Uso:
//   // legacy lowercase (fe_fatture.stato_pagamento via VIEW lossy):
//   <StatoPagamentoBadge stato={f.stato_pagamento} />
//   // raw uppercase (cg_uscite.stato), passa direttamente:
//   <StatoPagamentoBadge stato={uscita.stato} scaduta={isScaduta}/>
//   // Per CG (Uscite/Scadenzario) si può unire D1+D3 in un solo badge — vedi
//   // ControlloGestioneUscite.jsx STATO_STYLE che ha la sua palette completa.

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
    desc: "Pagamento parziale registrato — manca differenza (D1=parziale)",
  },
};

// Mappa namespace CG (cg_uscite.stato uppercase) → namespace D1+D2 (lowercase)
// IMPORTANTE: questo badge gestisce SOLO D1 (pagamento) + D2 (modificatori tecnici).
// I valori D3 (RATEIZZATO/SPOSTATO/PROGRAMMATO/SCADUTO) sono PROIETTATI su D1 perché
// per quei sotto-stati D1 vale "non pagata". L'informazione D3 va mostrata da un
// componente separato (StatoScadenzaBadge) o dal STATO_STYLE locale di CG.
const CG_TO_STANDARD = {
  PROGRAMMATO:    "da_pagare",        // D1=non pagata, D3=in scadenza
  SCADUTO:        "da_pagare",        // D1=non pagata, D3=scaduta (override via prop scaduta)
  VERIFICARE:     "da_verificare",    // D1=non pagata + D2=dubbio
  PAGATO_MANUALE: "pagato_manuale",   // D1=pagata + D2=* non riconciliata
  PAGATO:         "pagato",           // D1=pagata (riconciliata)
  PARZIALE:       "parziale",         // D1=parziale
  RATEIZZATO:     "da_pagare",        // D1=non pagata; D3=rateizzata → StatoScadenzaBadge
  SPOSTATO:       "da_pagare",        // D1=non pagata; D3=spostata → StatoScadenzaBadge
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
