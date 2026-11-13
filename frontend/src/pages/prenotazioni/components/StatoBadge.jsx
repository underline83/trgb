// @version: v1.1 — etichette e colori dalla tabella stati (In opzione, Lista d'attesa) (2026-11-13); v1.0
// Modulo: prenotazioni
// Badge colorato per stato prenotazione
import React from "react";
import usePrenotazioniStati, { TONI } from "./statiPrenotazioni";

export default function StatoBadge({ stato, conEmoji = false }) {
  const { info } = usePrenotazioniStati();
  const s = info(stato);
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${TONI[s.tono] || TONI.neutral}`}>
      {conEmoji && s.emoji ? `${s.emoji} ` : ""}{s.etichetta}
    </span>
  );
}
