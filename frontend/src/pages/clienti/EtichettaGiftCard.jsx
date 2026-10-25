// frontend/src/pages/clienti/EtichettaGiftCard.jsx
// Modulo: clienti — Gift Card
// @version: v1.0 — etichetta QR per il buono stampato (2026-10-25)
//
// Etichetta 62×29 mm (Brother QL-820NWB, rotolo DK-11209) da incollare nel
// riquadro «Codice Gift-Card» del buono (122×36 mm). QR a sinistra, codice e
// scadenza a destra.
//
// Il QR punta a /regalo/<token_pubblico>, NON al codice: B126-354 si indovina
// in sequenza, la chiave no. Stesso QR, due risposte (pages/public/Regalo.jsx):
// il cliente vede cosa gli hanno regalato, lo staff loggato la card con Scarica.
//
// Stampa dal browser come le etichette dei vini: @page della misura
// dell'etichetta; nel dialogo QL-820NWB, carta 29 × 62 mm, margini nessuno, 100%.

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import QrSvg from "../../components/QrSvg";

export function urlRegalo(token) {
  return `${window.location.origin}/regalo/${token}`;
}

function fmtData(iso) {
  if (!iso) return "";
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}

export function EtichettaGiftCard({ e }) {
  return (
    <div className="egc-lbl">
      <QrSvg text={urlRegalo(e.token)} sizeMm={25} />
      <div className="egc-txt">
        <div className="egc-tit">Gift card</div>
        <div className="egc-cod">{e.codice}</div>
        <div className="egc-scad">{e.data_scadenza ? `valida fino al ${fmtData(e.data_scadenza)}` : "senza scadenza"}</div>
        <div className="egc-hint">inquadra il QR</div>
      </div>
    </div>
  );
}

const CSS = `
.egc-lbl{box-sizing:border-box;width:62mm;height:29mm;display:flex;align-items:center;gap:2mm;padding:1.5mm 2.5mm 1.5mm 1.5mm;background:#fff;color:#000;overflow:hidden;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif}
.egc-txt{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;height:100%}
.egc-tit{font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.12em}
.egc-cod{font-size:15pt;font-weight:800;line-height:1.05;margin:.8mm 0 .6mm;white-space:nowrap}
.egc-scad{font-size:7pt;font-weight:500}
.egc-hint{font-size:6pt;font-weight:500;margin-top:1.2mm;color:#333}
#egc-print-root{display:none}
@media print{
  @page{size:62mm 29mm;margin:0}
  html,body{margin:0!important;padding:0!important;background:#fff!important}
  body>*:not(#egc-print-root){display:none!important}
  #egc-print-root{display:block!important}
}`;

/**
 * Monta l'etichetta fuori pagina e apre il dialogo di stampa.
 * `onFine` si chiama a stampa chiusa (stampata o annullata).
 */
export default function StampaEtichettaGiftCard({ e, onFine }) {
  // onFine in un ref: il genitore lo passa inline, e rilanciare l'effetto a
  // ogni suo render riaprirebbe il dialogo di stampa.
  const fineRef = useRef(onFine);
  fineRef.current = onFine;
  useEffect(() => {
    const fine = () => fineRef.current?.();
    window.addEventListener("afterprint", fine, { once: true });
    const t = setTimeout(() => window.print(), 150); // lascia disegnare il QR
    return () => { clearTimeout(t); window.removeEventListener("afterprint", fine); };
  }, [e]);

  return (
    <>
      <style>{CSS}</style>
      {createPortal(<div id="egc-print-root"><EtichettaGiftCard e={e} /></div>, document.body)}
    </>
  );
}
