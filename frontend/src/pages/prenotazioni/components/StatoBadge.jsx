// @version: v1.2 — «Confermato» per le prenotate che il cliente ha riconfermato (2026-11-26); v1.1 — etichette e colori dalla tabella stati (In opzione, Lista d'attesa) (2026-11-13); v1.0
// Modulo: prenotazioni
// Badge colorato per stato prenotazione
import React from "react";
import usePrenotazioniStati, { TONI } from "./statiPrenotazioni";

export default function StatoBadge({ stato, conEmoji = false, riconfermata = false }) {
  const { info } = usePrenotazioniStati();
  // «Confermato» (mig 250): prenotata e il cliente ha confermato che viene. Non è uno stato a sé.
  const s = stato === "RECORDED" && riconfermata ? { etichetta: "Confermato", emoji: "👍", tono: "teal" } : info(stato);
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${TONI[s.tono] || TONI.neutral}`}>
      {conEmoji && s.emoji ? `${s.emoji} ` : ""}{s.etichetta}
    </span>
  );
}
