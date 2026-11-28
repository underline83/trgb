// @version: v1.1 — etichetta «libera entro HH:MM» (primo turno) e «2° turno» (2026-11-28); v1.0 — etichette accanto al nome del cliente, uguali in Planning e in Servizio (2026-11-26; prima stavano dentro PrenotazioniPlanning.jsx)
// Modulo: prenotazioni
import React from "react";
import Tooltip from "../../../components/Tooltip";
import { Stelle, SegmentoPill } from "../../clienti/ProfiloCliente";

// «HH:MM» entro cui il tavolo va liberato, se la prenotazione ha una durata sua più corta di tutto il turno
export const liberaEntro = (pren) => {
  const d = Number(pren?.durata_min);
  const [h, m] = String(pren?.ora_pasto || "").split(":").map(Number);
  if (!d || d >= 1440 || !Number.isFinite(h)) return null;
  const t = h * 60 + (m || 0) + d;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

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
      {pren.reminder_stato === "mandata" && (
        <Tooltip label="Riconferma WhatsApp inviata"><span className="text-emerald-600 text-xs">✓💬</span></Tooltip>
      )}
      {pren.reminder_stato === "aperta" && (
        <Tooltip label="WhatsApp aperto per la riconferma, ma il messaggio non risulta mandato"><span className="text-amber-600 text-xs">?💬</span></Tooltip>
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
      {/* Limitazione del tavolo scelta nel form («Durata»): primo turno = libera entro un'ora, secondo = fino a chiusura (Marco 2026-11-28) */}
      {liberaEntro(pren) && (
        <Tooltip label="Primo turno: il tavolo va liberato entro quest'ora">
          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-400 text-[10px] font-bold rounded-full whitespace-nowrap">libera entro {liberaEntro(pren)}</span>
        </Tooltip>
      )}
      {Number(pren.durata_min) >= 1440 && (
        <Tooltip label="Secondo turno: il tavolo resta suo fino a chiusura">
          <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-900 border border-indigo-300 text-[10px] font-bold rounded-full whitespace-nowrap">2° turno</span>
        </Tooltip>
      )}
      {pren.stato === "REQUESTED" && (
        <span className="px-1.5 py-0.5 bg-neutral-800 text-white text-[10px] font-bold rounded-full">NUOVA</span>
      )}
      {pren.possibili_doppioni && pren.possibili_doppioni.length > 0 && (
        <Tooltip label={pren.possibili_doppioni.map((d) => `Uguale a ${d.ora} ${d.nome} (${d.pax} pax${d.thefork ? ", TheFork" : ", a mano"}): ${d.motivi.join(", ")}`).join(" · ")}>
          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold rounded-full">DOPPIONE?</span>
        </Tooltip>
      )}
    </>
  );
}
