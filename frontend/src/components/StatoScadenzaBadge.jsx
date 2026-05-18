// frontend/src/components/StatoScadenzaBadge.jsx
// @version: v1.0 — modello 3-dimensioni (2026-05-18)
//
// IMPORTANTE — leggere docs/stato_pagamento_unificato.md §15 + CLAUDE.md.
//
// Questo badge gestisce SOLO la dimensione D3 (stato SCADENZA / TEMPO).
// La dimensione D1+D2 (pagamento) vive in `StatoPagamentoBadge`.
//
// D3 — stato scadenza (4 valori):
//   - "in_scadenza"  → grigio neutro       (data nel futuro)
//   - "scaduta"      → rosso forte         (data nel passato)
//   - "rateizzata"   → viola + 📆          (più date — gestita da spesa fissa)
//   - "spostata"     → fuchsia + ↩         (rinegoziata singolarmente — G.7)
//
// Helper deriveStatoScadenza(uscitaStato, scadenzaISO):
//   Dato `cg_uscite.stato` raw uppercase + la data effettiva di scadenza,
//   ritorna la chiave D3. Se la fattura è PAGATA/PAGATO_MANUALE/PARZIALE
//   ritorna null (D3 è irrilevante quando il pagamento è chiuso o parziale).
//
// Uso tipico nell'header di FattureDettaglio:
//   <StatoPagamentoBadge stato={uscita.stato} />     // D1+D2 (sempre)
//   {scadenza && (
//     <span>Scade il {scadenza}</span>
//     <StatoScadenzaBadge stato={statoD3} giorni={gg} />
//   )}
//
// Convenzione: il badge NON ha override "scaduta" — la chiave è esplicita.
// La label include "fra Ngg" / "da Ngg" se `giorni` è passato.

import React from "react";

export const STATI_SCADENZA = {
  in_scadenza: {
    label: "In scadenza",
    color: "bg-slate-100 text-slate-700 border-slate-300",
    icon: "💤",
    desc: "Scadenza nel futuro",
  },
  scaduta: {
    label: "Scaduta",
    color: "bg-red-100 text-red-800 border-red-400",
    icon: "⚠",
    desc: "Scadenza passata, fattura ancora aperta",
  },
  rateizzata: {
    label: "Rateizzata",
    color: "bg-purple-100 text-purple-800 border-purple-300",
    icon: "📆",
    desc: "Più date di pagamento — gestite da spesa fissa",
  },
  spostata: {
    label: "Scadenza spostata",
    color: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
    icon: "↩",
    desc: "Data di scadenza rinegoziata (G.7)",
  },
};

// Mappa cg_uscite.stato uppercase → chiave D3 (quando il pagamento è APERTO).
// Per stati chiusi (PAGATO/PAGATO_MANUALE/PARZIALE) → null (D3 irrilevante).
const CG_TO_D3 = {
  PROGRAMMATO: "in_scadenza",
  SCADUTO:     "scaduta",
  RATEIZZATO:  "rateizzata",
  SPOSTATO:    "spostata",
  VERIFICARE:  "in_scadenza",  // ambiguo: l'utente ha dubbio, default a in_scadenza
  // PAGATO / PAGATO_MANUALE / PARZIALE → null (gestiti dalla logica chiamante)
};

/**
 * Deriva la chiave D3 da cg_uscite.stato raw + data scadenza (per fallback).
 * @param {string|null} uscitaStato - cg_uscite.stato uppercase
 * @param {string|null} scadenzaISO - data effettiva YYYY-MM-DD (per derivare in_scadenza/scaduta se serve)
 * @returns {string|null} chiave di STATI_SCADENZA, o null se D3 irrilevante (fattura chiusa/parziale)
 */
export function deriveStatoScadenza(uscitaStato, scadenzaISO = null) {
  if (!uscitaStato) {
    // Senza stato: usa solo la data
    if (!scadenzaISO) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(scadenzaISO); d.setHours(0, 0, 0, 0);
    return d < today ? "scaduta" : "in_scadenza";
  }
  if (["PAGATO", "PAGATO_MANUALE", "PARZIALE"].includes(uscitaStato)) {
    return null;  // D3 irrilevante: il pagamento è chiuso o in corso
  }
  return CG_TO_D3[uscitaStato] || "in_scadenza";
}

/**
 * Calcola "fra Ngg" / "da Ngg" da una data ISO. Ritorna stringa o null.
 */
export function giorniLabel(scadenzaISO) {
  if (!scadenzaISO) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(scadenzaISO); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return "oggi";
  if (diff > 0) return `fra ${diff}gg`;
  return `da ${Math.abs(diff)}gg`;
}

export default function StatoScadenzaBadge({
  stato,
  giorni = null,
  size = "sm",
  showIcon = true,
  className = "",
}) {
  if (!stato) return null;
  const cfg = STATI_SCADENZA[stato];
  if (!cfg) return null;

  // Label dinamica: aggiungi "fra Ngg" / "da Ngg" se passato
  let labelText = cfg.label;
  if (giorni && (stato === "in_scadenza" || stato === "scaduta")) {
    labelText = stato === "scaduta" ? `Scaduta ${giorni}` : `${cfg.label} ${giorni}`;
  }

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
      <span>{labelText}</span>
    </span>
  );
}
