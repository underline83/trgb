// frontend/src/utils/etichettaLotto.js
// Modulo: cucina — Produzioni e codice lotto
// @version: v1.0 — etichetta lotto 90×29 in due varianti (2026-11-26)
//
// Etichetta del lotto di produzione sul rotolo Brother 29×90 (lo stesso delle gift
// card), senza QR. Due varianti scelte da Marco il 2026-11-26:
//   "codice"   solo «LOTTO» e il codice, centrati: per i prodotti che hanno già
//              la loro etichetta di tipografia;
//   "completa" nome, scadenza (solo se c'è) e «L codice»: per barattoli e
//              contenitori senza altra etichetta.
// Data di produzione, persona e numero NON compaiono mai: stanno solo nel codice.
//
// Il PDF lo fa il mattone utils/pdfEtichetta.js (misura esatta, pagina in piedi
// 29×90 con `ruota`): Stampa → Brother QL-820NWB, carta «29x90mm», scala 100%.

import { pdfEtichetteQr, mostraPdf, larghezzaTesto } from "./pdfEtichetta";

const W_MM = 90, H_MM = 29, MARGINE_MM = 4;
const PT_PER_MM = 72 / 25.4;

function fmtData(iso) {
  if (!iso) return "";
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}

const LARG_MAX = (W_MM - 2 * MARGINE_MM) * PT_PER_MM;
const sta = (testo, pt) => larghezzaTesto(testo, pt, true) <= LARG_MAX;

// Il nome su una riga, il più grande che ci sta (da 15 pt a 9). Se a 9 pt non ci
// sta ancora va su due righe, e la seconda si tronca coi puntini.
function righeNome(nome) {
  for (let pt = 15; pt >= 9; pt -= 0.5) {
    if (sta(nome, pt)) return [{ testo: nome, sizePt: pt, bold: true }];
  }
  const pt = 9;
  const parole = nome.split(" ");
  let prima = "";
  while (parole.length && sta(prima ? `${prima} ${parole[0]}` : parole[0], pt)) {
    prima = prima ? `${prima} ${parole.shift()}` : parole.shift();
  }
  if (!prima) prima = parole.shift(); // una parola sola più larga dell'etichetta
  let seconda = parole.join(" ");
  if (!sta(seconda, pt)) {
    while (seconda.length > 1 && !sta(`${seconda}...`, pt)) seconda = seconda.slice(0, -1);
    seconda = `${seconda.trimEnd()}...`;
  }
  return [{ testo: prima, sizePt: pt, bold: true }, { testo: seconda, sizePt: pt, bold: true, spazioPrimaMm: 1.2 }];
}

function opzioni(p, variante) {
  const base = { wMm: W_MM, hMm: H_MM, ruota: true, qrText: "", qrMm: 0, margineMm: MARGINE_MM };
  if (variante === "codice") {
    return {
      ...base,
      centra: true,
      righe: [
        { testo: "LOTTO", sizePt: 8, bold: true, spaziatura: 1.6 },
        { testo: p.codice, sizePt: 30, bold: true, spaziatura: 2.5, spazioPrimaMm: 2.6 },
      ],
    };
  }
  const righe = righeNome(p.nome);
  if (p.data_scadenza) righe.push({ testo: `Scad. ${fmtData(p.data_scadenza)}`, sizePt: 9, spazioPrimaMm: 2.2 });
  righe.push({ testo: `L ${p.codice}`, sizePt: 12, bold: true, spaziatura: 1, spazioPrimaMm: 2.4 });
  return { ...base, righe };
}

/** p = produzione (codice, nome, data_scadenza); finestra = scheda già aperta dentro al clic. */
export function stampaEtichetteLotto(p, variante, copie, finestra) {
  const n = Math.max(1, Number(copie) || 1);
  const blob = pdfEtichetteQr(Array.from({ length: n }, () => opzioni(p, variante)));
  mostraPdf(blob, `lotto-${p.codice}.pdf`, finestra);
}
