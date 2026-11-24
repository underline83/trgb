// frontend/src/utils/etichetteTag.js
// Platform (M.I) — link ed etichette dei tag NFC attaccati ai posti fisici
// (ripiani dei frigo in cucina, scaffali e file della cantina, …).
// @version: v1.0 — estratto da CucinaMobile 1.14 per usarlo anche in cantina (2026-11-24)
//
// Il tag contiene solo un link a una pagina di TRGB: lo si scrive dall'iPhone
// con NFC Tools incollando il link copiato qui (il Mac da solo non scrive NFC;
// Web NFC esiste solo su Chrome Android). Sopra il tag va un'etichetta della
// Brother, rotolo 29×90 come le gift card, nella variante «A» scelta da Marco
// il 2026-11-23: QR a sinistra (stesso link del tag), al centro il posto in
// maiuscolo e il nome grande, a destra il cerchio tratteggiato da 25 mm che
// dice dove sta il tag. Stampa: carta «29x90mm», scala 100%.

import { pdfEtichetteQr, mostraPdf, apriFinestraVuota, larghezzaTesto } from "./pdfEtichetta";

/** Diametro dei tag comprati (Timeskey anti-metallo, tondi 25 mm, NTAG215). */
export const TAG_MM = 25;

/** Copia negli appunti. true se riuscita; se no il chiamante mostra il testo da copiare a mano. */
export async function copiaTesto(testo) {
  try {
    await navigator.clipboard.writeText(testo);
    return true;
  } catch { /* Safari vecchio o permesso negato: si prova alla vecchia */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = testo;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, testo.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

// Spazio per il testo: da 3 + 22 QR + 3 = 28 mm fino al cerchio (90 − 2 − 25 = 63 mm),
// meno 2 mm di stacco ≈ 33 mm ≈ 92 pt.
const MAX_PT = 92;

/**
 * Opzioni di pdfEtichetta per un'etichetta 90×29 (PDF in piedi 29×90, `ruota`).
 * @param {object} e  { link, sopra, titolo, sotto }
 *   link    URL del tag (anche nel QR)
 *   sopra   riga piccola in maiuscolo spaziato (il posto: «Congelatore 1», «Scaffale 3»)
 *   titolo  il nome grande (19 pt, rimpicciolito fino a 10, poi accorciato con «...»:
 *           il carattere «…» non c'è nel font standard del PDF)
 *   sotto   riga facoltativa sotto il titolo («cotto», «5 file»)
 */
export function opzioniEtichettaTag({ link, sopra = "", titolo = "", sotto = null }) {
  let nome = String(titolo);
  let size = 19;
  while (size > 10 && larghezzaTesto(nome, size, true) > MAX_PT) size -= 1;
  if (larghezzaTesto(nome, size, true) > MAX_PT) {
    let corto = nome;
    while (corto.length > 4 && larghezzaTesto(`${corto}...`, size, true) > MAX_PT) corto = corto.slice(0, -1).trimEnd();
    nome = `${corto}...`;
  }
  // il posto in maiuscolo spaziato: se non sta, si stringe
  const posto = String(sopra || "").toUpperCase();
  let sizePosto = 7.5;
  while (sizePosto > 5.5 && larghezzaTesto(posto, sizePosto, true) + [...posto].length > MAX_PT) sizePosto -= 0.5;
  const righe = [
    { testo: posto, sizePt: sizePosto, bold: true, spaziatura: 1 },
    { testo: nome, sizePt: size, bold: true, spazioPrimaMm: 2.4 },
  ];
  if (sotto) righe.push({ testo: String(sotto), sizePt: 8.5, spazioPrimaMm: 2 });
  return {
    ruota: true, wMm: 90, hMm: 29,
    qrText: link, qrMm: 22, margineMm: 3, gapMm: 3, righe,
    bersaglio: { dMm: TAG_MM, margineMm: 2 },
  };
}

/** Un PDF con un'etichetta per pagina; si apre in una scheda nuova (da lì Stampa). */
export function stampaEtichetteTag(lista, nomeFile = "etichette_tag") {
  if (!lista?.length) return;
  const finestra = apriFinestraVuota(); // dentro il clic: Safari blocca le finestre aperte dopo
  const blob = pdfEtichetteQr(lista.map(opzioniEtichettaTag));
  const slug = String(nomeFile).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  mostraPdf(blob, `${slug || "etichette_tag"}.pdf`, finestra);
}
