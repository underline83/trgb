// @version: v1.0-stato-riconciliazione-badge
// Badge compatto 4 stati per la riconciliazione banca di una cg_uscite.
// Palette "minimal dot" (palette C del mockup) + nomi "tecnici semaforici" (palette A):
//   ● Riconciliata   — banca_movimento_id != null (manuale o auto, indistintamente)
//   ● Automatica     — riservato futuro (matcher auto), oggi non appare
//   ● Da collegare   — stato PAGATA_MANUALE ma senza banca_movimento_id
//   ● Aperta         — DA_PAGARE / SCADUTA / nessuna uscita ancora generata
//
// Uso:
//   import StatoRiconciliazioneBadge, { derivaStatoRiconciliazione } from "..."
//   const stato = derivaStatoRiconciliazione({ uscita_stato, banca_movimento_id });
//   <StatoRiconciliazioneBadge stato={stato} />
//
// Oppure passando direttamente il record con shape { uscita_stato, banca_movimento_id, riconciliazione_auto? }:
//   <StatoRiconciliazioneBadge row={rata} />

import React from "react";

// ── Deriva lo stato di riconciliazione da un record cg_uscite ──
// Input: { uscita_stato, banca_movimento_id, riconciliazione_auto? }
// Output: "riconciliata" | "automatica" | "da_collegare" | "aperta"
export function derivaStatoRiconciliazione(row) {
  if (!row) return "aperta";
  const s = row.uscita_stato || row.stato || null;
  const hasMov = row.banca_movimento_id != null;
  const isAuto = !!row.riconciliazione_auto; // placeholder per futuro matcher

  // Nessuna uscita ancora generata (piano rate con rata futura senza cg_uscite)
  if (s == null) return "aperta";

  if (hasMov) {
    return isAuto ? "automatica" : "riconciliata";
  }

  if (s === "PAGATA_MANUALE") return "da_collegare";
  if (s === "PAGATA" || s === "PARZIALE") return "riconciliata"; // fallback: PAGATA senza movimento è raro
  return "aperta"; // DA_PAGARE, SCADUTA, RATEIZZATA, etc.
}

// ── Definizione dei 4 stati ──
const STATI = {
  riconciliata: {
    label: "Riconciliata",
    dot: "bg-emerald-500",
    text: "text-neutral-700",
    tooltip: "Pagamento collegato a un movimento bancario",
  },
  automatica: {
    label: "Automatica",
    dot: "bg-sky-500",
    text: "text-neutral-700",
    tooltip: "Riconciliata automaticamente dal sistema",
  },
  da_collegare: {
    label: "Da collegare",
    dot: "bg-amber-500",
    text: "text-neutral-700",
    tooltip: "Pagamento dichiarato ma nessun movimento bancario collegato",
  },
  aperta: {
    label: "Aperta",
    dot: "bg-neutral-300",
    text: "text-neutral-500",
    tooltip: "Non ancora pagata",
  },
};

// ── Componente principale ──
export default function StatoRiconciliazioneBadge({ stato, row, size = "sm", showLabel = true }) {
  const key = stato || derivaStatoRiconciliazione(row);
  const def = STATI[key] || STATI.aperta;

  const dotSize = size === "xs" ? "w-1.5 h-1.5" : "w-2 h-2";
  const textSize = size === "xs" ? "text-[10px]" : "text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${textSize} font-medium ${def.text}`}
      title={def.tooltip}
    >
      <span className={`inline-block ${dotSize} rounded-full ${def.dot}`}></span>
      {showLabel && <span>{def.label}</span>}
    </span>
  );
}

// Esporta anche la lista stati per usi esterni (filtri, legend, ecc.)
export const STATI_RICONCILIAZIONE = STATI;
