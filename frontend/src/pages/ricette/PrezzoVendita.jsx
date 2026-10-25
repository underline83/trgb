// @version: v1.0 — Prezzo usato per il food cost, con etichetta «pranzo» (2026-10-25, mig 212)
// Modulo: ricette
//
// Il backend restituisce `prezzo_riferimento` + `prezzo_fonte`:
//   "ricetta" → prezzo di vendita della ricetta
//   "pranzo"  → piatto del pranzo di lavoro senza prezzo suo: valore di
//               Impostazioni → Menu Pranzo («Valore vendita piatto»)
// Usato da archivio, dashboard Food Cost e scheda ricetta: un solo posto per
// l'etichetta, così si legge uguale ovunque.

import React from "react";

const fmt = (v) => `${Number(v).toFixed(2)} €`;

export const TITOLO_PRANZO =
  "Piatto del pranzo di lavoro senza prezzo suo: il food cost usa il valore " +
  "di Impostazioni → Menu Pranzo (Valore vendita piatto).";

export function EtichettaPranzo({ valore }) {
  return (
    <span
      className="inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-orange-50 text-orange-800 border-orange-200 align-middle"
      title={TITOLO_PRANZO}
    >
      pranzo{valore != null ? ` ${Number(valore).toFixed(0)} €` : ""}
    </span>
  );
}

export default function PrezzoVendita({ r }) {
  if (r?.prezzo_fonte === "pranzo" && r.prezzo_riferimento != null) {
    return (
      <span title={TITOLO_PRANZO} className="whitespace-nowrap">
        <span className="text-neutral-400">{fmt(r.prezzo_riferimento)}</span>{" "}
        <EtichettaPranzo />
      </span>
    );
  }
  const p = r?.selling_price;
  return p != null && p > 0 ? fmt(p) : "—";
}
