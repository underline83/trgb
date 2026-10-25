// frontend/src/pages/clienti/EtichettaGiftCard.jsx
// Modulo: clienti — Gift Card
// @version: v1.1 — etichetta come PDF 62×29 (Safari ignorava la misura e stampava A4); v1.0 2026-10-25
//
// Etichetta 62×29 mm (Brother QL-820NWB, rotolo DK-11209) da incollare nel
// riquadro «Codice Gift-Card» del buono (122×36 mm): QR a sinistra, codice e
// scadenza a destra.
//
// Il QR punta a /regalo/<token_pubblico>, NON al codice: B126-354 si indovina
// in sequenza, la chiave no. Stesso QR, due risposte (pages/public/Regalo.jsx):
// il cliente vede cosa gli hanno regalato, lo staff loggato la card con Scarica.
//
// Esce un PDF della misura esatta (utils/pdfEtichetta.js) che si apre in una
// scheda: Stampa → Brother QL-820NWB. Vale da Mac e da iPad (AirPrint).

import { pdfEtichettaQr, mostraPdf } from "../../utils/pdfEtichetta";

export function urlRegalo(token) {
  return `${window.location.origin}/regalo/${token}`;
}

function fmtData(iso) {
  if (!iso) return "";
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}

/** e = risposta di GET /clienti/giftcard/{id}/etichetta; finestra = scheda già aperta nel clic */
export function stampaEtichettaGiftCard(e, finestra) {
  const blob = pdfEtichettaQr({
    wMm: 62,
    hMm: 29,
    qrText: urlRegalo(e.token),
    qrMm: 25,
    margineMm: 1.5,
    gapMm: 2,
    righe: [
      { testo: "GIFT CARD", sizePt: 6.5, bold: true, spaziatura: 0.8 },
      { testo: e.codice, sizePt: 15, bold: true, spazioPrimaMm: 2.2 },
      { testo: e.data_scadenza ? `valida fino al ${fmtData(e.data_scadenza)}` : "senza scadenza", sizePt: 7, spazioPrimaMm: 2 },
      { testo: "inquadra il QR", sizePt: 6, spazioPrimaMm: 1.6 },
    ],
  });
  mostraPdf(blob, `etichetta_${String(e.codice).replace(/\s/g, "_")}.pdf`, finestra);
}
