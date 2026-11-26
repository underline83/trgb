// Modulo: prenotazioni
// @version: v1.0 — segno della prenotazione presa in TRGB rispetto a TheFork (2026-11-26)
// «su TheFork» (mandata da TRGB), «da mandare» (orario chiuso online, si riprova da solo),
// «solo TRGB» (non può partire), errore. Niente segno se TheFork non c'entra.
import React from "react";
import Tooltip from "../../../components/Tooltip";

const STILI = {
  inviata: { testo: "su TheFork", cls: "bg-emerald-50 text-emerald-800 border-emerald-200", tip: "Mandata a TheFork da TRGB" },
  da_mandare: { testo: "da mandare", cls: "bg-amber-50 text-amber-800 border-amber-200", tip: "Non ancora su TheFork: TRGB riprova da solo" },
  no: { testo: "solo TRGB", cls: "bg-neutral-100 text-neutral-600 border-neutral-200", tip: "Resta solo in TRGB" },
  errore: { testo: "TheFork: rifiutata", cls: "bg-red-50 text-red-700 border-red-200", tip: "TheFork non l'ha accettata" },
};

export default function TheForkInvioBadge({ pren }) {
  const s = STILI[pren?.thefork_invio];
  if (!s) return null;
  const daConfermare = pren.thefork_invio === "inviata" && /confermare/i.test(pren.thefork_invio_nota || "");
  return (
    <Tooltip label={pren.thefork_invio_nota || s.tip}>
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap ${daConfermare ? "bg-amber-50 text-amber-800 border-amber-200" : s.cls}`}>
        {daConfermare ? "da confermare su TheFork" : s.testo}
      </span>
    </Tooltip>
  );
}
