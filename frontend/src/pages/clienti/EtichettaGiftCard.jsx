// frontend/src/pages/clienti/EtichettaGiftCard.jsx
// Modulo: clienti — Gift Card
// @version: v1.3 — rotolo 29×90: etichetta 90×29 orizzontale, PDF in piedi; v1.2 — prova verticale 29×62; v1.1 — etichetta come PDF 62×29 (Safari ignorava la misura e stampava A4); v1.0 2026-10-25
//
// Etichetta 90×29 mm (Brother QL-820NWB, rotolo 29×90) da incollare nel
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
  // Rotolo montato: 29×90,3 mm (misurato da Marco il 2026-10-26).
  // Incollata in orizzontale nel riquadro 122×36 del buono: 90×29, QR a
  // sinistra e testo a destra. Il PDF esce in piedi 29×90 (`ruota`), nel verso
  // della carta «29x90» del driver: niente rotazione automatica, niente riduzione.
  const blob = pdfEtichettaQr({
    ruota: true,
    centra: true, // QR + testo centrati nell'etichetta (richiesta Marco 2026-10-26)
    wMm: 90,
    hMm: 29,
    qrText: urlRegalo(e.token),
    qrMm: 25,
    margineMm: 3,
    gapMm: 3,
    righe: [
      { testo: "GIFT CARD", sizePt: 7.5, bold: true, spaziatura: 1 },
      { testo: e.codice, sizePt: 20, bold: true, spazioPrimaMm: 2.4 },
      { testo: e.data_scadenza ? `valida fino al ${fmtData(e.data_scadenza)}` : "senza scadenza", sizePt: 8.5, spazioPrimaMm: 2.4 },
      { testo: "inquadra il QR", sizePt: 7, spazioPrimaMm: 1.8 },
    ],
  });
  mostraPdf(blob, `etichetta_${String(e.codice).replace(/\s/g, "_")}.pdf`, finestra);
}
