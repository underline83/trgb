// @version: v1.0 — etichette accanto al nome del cliente, uguali in Planning e in Servizio (2026-11-26; prima stavano dentro PrenotazioniPlanning.jsx)
// Modulo: prenotazioni
import React from "react";
import Tooltip from "../../../components/Tooltip";
import { Stelle, SegmentoPill } from "../../clienti/ProfiloCliente";

// Bollino cliente come in TheFork Manager (visite fatte PRIMA di quel giorno; soglia in config)
export const BOLLINI = {
  prima:       { label: "Prima visita", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  occasionale: { label: "Occasionale",  cls: "bg-neutral-50 text-neutral-600 border-neutral-200" },
  frequente:   { label: "Frequente",    cls: "bg-amber-50 text-amber-800 border-amber-300" },
};

// Etichette accanto al nome (stelle, segmento, no-show, riconferma, evento, preventivo,
// bollino, allergie, NUOVA, DOPPIONE?): le stesse nella riga del computer e nella scheda del telefono
export default function EtichetteCliente({ pren }) {
  return (
    <>
      {pren.profilo && (
        <>
          <Stelle nere={pren.profilo.stelle_nere} argento={pren.profilo.stelle_argento} oro={pren.profilo.stella_oro} className="text-xs" />
          {pren.profilo.segmento && pren.profilo.segmento !== "mai_venuto" && <SegmentoPill segmento={pren.profilo.segmento} compatto />}
        </>
      )}
      {pren.no_show_totali > 0 && (
        <Tooltip label={`Affidabilità: ${pren.no_show_totali} no-show e ${pren.cancellate_totali || 0} cancellazioni in passato`}>
          <span className="px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 text-[10px] font-semibold rounded-full whitespace-nowrap">
            {pren.no_show_totali} no-show
          </span>
        </Tooltip>
      )}
      {pren.reminder_inviato === 1 && (
        <Tooltip label="Riconferma WhatsApp inviata"><span className="text-emerald-600 text-xs">✓💬</span></Tooltip>
      )}
      {pren.menu_evento && (
        <Tooltip label="Evento confermato: menù nella riga aperta"><span className="text-xs">🍽️</span></Tooltip>
      )}
      {pren.preventivo_attesa && (
        <Tooltip label={`In attesa di conferma preventivo ${pren.preventivo_attesa.numero}${pren.preventivo_attesa.scadenza ? ` — scade il ${(pren.preventivo_attesa.scadenza || "").split("-").reverse().slice(0, 2).join("/")}` : ""}`}>
          <span className={`text-xs ${pren.preventivo_attesa.stato === "scaduto" ? "text-red-600" : "text-amber-600"}`}>⏳</span>
        </Tooltip>
      )}
      {pren.bollino && BOLLINI[pren.bollino] && (
        <Tooltip label={`${pren.visite_precedenti || 0} visite prima di oggi`}>
          <span className={`px-1.5 py-0.5 border text-[10px] font-medium rounded-full whitespace-nowrap ${BOLLINI[pren.bollino].cls}`}>
            {BOLLINI[pren.bollino].label}
          </span>
        </Tooltip>
      )}
      {(pren.allergie || pren.allergie_segnalate) && (
        <Tooltip label={pren.allergie || pren.allergie_segnalate}>
          <span className="text-red-500 text-xs">⚠️</span>
        </Tooltip>
      )}
      {pren.stato === "REQUESTED" && (
        <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded-full">NUOVA</span>
      )}
      {pren.possibili_doppioni && pren.possibili_doppioni.length > 0 && (
        <Tooltip label={pren.possibili_doppioni.map((d) => `Uguale a ${d.ora} ${d.nome} (${d.pax} pax${d.thefork ? ", TheFork" : ", a mano"}): ${d.motivi.join(", ")}`).join(" · ")}>
          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold rounded-full">DOPPIONE?</span>
        </Tooltip>
      )}
    </>
  );
}
