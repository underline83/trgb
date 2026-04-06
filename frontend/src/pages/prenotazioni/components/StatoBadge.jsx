// @version: v1.0
// Badge colorato per stato prenotazione
import React from "react";

const STATI = {
  RECORDED:   { label: "Confermata", color: "bg-indigo-100 text-indigo-700" },
  REQUESTED:  { label: "Da confermare", color: "bg-blue-100 text-blue-700" },
  ARRIVED:    { label: "Arrivato", color: "bg-teal-100 text-teal-700" },
  SEATED:     { label: "Seduto", color: "bg-emerald-100 text-emerald-700" },
  LEFT:       { label: "Completata", color: "bg-neutral-100 text-neutral-600" },
  BILL:       { label: "Al conto", color: "bg-amber-100 text-amber-700" },
  CANCELED:   { label: "Cancellata", color: "bg-neutral-200 text-neutral-500" },
  NO_SHOW:    { label: "No-show", color: "bg-red-100 text-red-600" },
  REFUSED:    { label: "Rifiutata", color: "bg-red-100 text-red-500" },
  PARTIALLY_ARRIVED: { label: "Parziale", color: "bg-amber-100 text-amber-700" },
};

export default function StatoBadge({ stato }) {
  const s = STATI[stato] || { label: stato, color: "bg-neutral-100 text-neutral-600" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}
