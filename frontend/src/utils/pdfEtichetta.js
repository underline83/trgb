// frontend/src/utils/pdfEtichetta.js
// Platform (M.I) — PDF vettoriale di un'etichetta con QR, della misura esatta del rotolo.
// @version: v1.0 (2026-10-25)
//
// PERCHE' UN PDF E NON window.print() della pagina:
//   Safari (Mac e iPad) ignora @page size: stampa la pagina in A4 sulla
//   stampante predefinita, con intestazioni e piè di pagina. Un PDF di 62×29 mm
//   invece porta con sé la misura: mandato alla Brother QL-820NWB (anche via
//   AirPrint da iPad) prende il rotolo giusto, e non c'è nulla da impostare
//   oltre alla stampante, che Mac e iPad ricordano dopo la prima volta.
//
// Scritto a mano (niente librerie): una pagina, QR come rettangoli pieni,
// testo in Helvetica / Helvetica-Bold (font standard PDF, non si incorporano).
// QR da utils/vendor/qrcode.js, in locale.

import qrcode from "./vendor/qrcode";

const PT = 72 / 25.4; // punti per mm

// Larghezze Helvetica / Helvetica-Bold (AFM Adobe, /1000 em) per i caratteri ASCII stampabili 32..126
const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

/** Larghezza di un testo in punti (lettere accentate ≈ la lettera base). */
export function larghezzaTesto(testo, sizePt, bold = false) {
  const w = bold ? W_BOLD : W_REG;
  let tot = 0;
  for (const ch of testo) {
    const base = ch.normalize("NFD")[0];
    const c = base.charCodeAt(0);
    tot += c >= 32 && c <= 126 ? w[c - 32] : 556;
  }
  return (tot * sizePt) / 1000;
}

// Stringa PDF in WinAnsi: ASCII com'è, Latin-1 (à è é ò ù …) in ottale, il resto «?»
function strPdf(testo) {
  let out = "";
  for (const ch of testo) {
    const c = ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (c >= 32 && c <= 126) out += ch;
    else if (c >= 160 && c <= 255) out += "\\" + c.toString(8).padStart(3, "0");
    else out += "?";
  }
  return `(${out})`;
}

function n(v) { return (Math.round(v * 1000) / 1000).toString(); }

/**
 * Etichetta: QR a sinistra, righe di testo a destra centrate in verticale.
 * @param {object} o
 *   wMm, hMm      misura dell'etichetta (es. 62, 29)
 *   qrText        contenuto del QR (URL)
 *   qrMm          lato del QR compresa la zona di rispetto
 *   margineMm     margine sinistro/destro (default 1.5)
 *   gapMm         spazio fra QR e testo (default 2)
 *   righe         [{ testo, sizePt, bold, spazioPrimaMm, spaziatura }]
 *                 spaziatura = tracking in punti fra le lettere (es. 0.8)
 * @returns {Blob} application/pdf
 */
export function pdfEtichettaQr({ wMm, hMm, qrText, qrMm, margineMm = 1.5, gapMm = 2, righe = [] }) {
  const W = wMm * PT, H = hMm * PT;
  const ops = ["0 g"];

  // QR: righe di moduli scuri unite in rettangoli orizzontali
  const qr = qrcode(0, "M");
  qr.addData(qrText);
  qr.make();
  const count = qr.getModuleCount();
  const tot = count + 4; // 2 moduli di zona di rispetto per lato
  const lato = qrMm * PT;
  const mod = lato / tot;
  const x0 = margineMm * PT;
  const y0 = (H - lato) / 2;
  for (let r = 0; r < count; r++) {
    let c = 0;
    while (c < count) {
      if (!qr.isDark(r, c)) { c++; continue; }
      let fine = c;
      while (fine < count && qr.isDark(r, fine)) fine++;
      const x = x0 + (c + 2) * mod;
      const y = y0 + lato - (r + 3) * mod; // PDF: origine in basso
      ops.push(`${n(x)} ${n(y)} ${n((fine - c) * mod)} ${n(mod)} re`);
      c = fine;
    }
  }
  ops.push("f");

  // Testo: blocco centrato in verticale nello spazio a destra del QR
  const xt = x0 + lato + gapMm * PT;
  const altezze = righe.map((r, i) => (i ? (r.spazioPrimaMm || 0) * PT : 0) + r.sizePt * 0.72);
  const blocco = altezze.reduce((a, b) => a + b, 0);
  let y = (H + blocco) / 2;
  righe.forEach((r, i) => {
    y -= altezze[i];
    ops.push(`BT /${r.bold ? "F2" : "F1"} ${n(r.sizePt)} Tf ${n(r.spaziatura || 0)} Tc ${n(xt)} ${n(y)} Td ${strPdf(r.testo)} Tj ET`);
  });

  const contenuto = ops.join("\n");
  const oggetti = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(W)} ${n(H)}] /Contents 4 0 R ` +
      "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${contenuto.length} >>\nstream\n${contenuto}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  oggetti.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // tutto è ASCII (il testo è già in ottale): un byte per carattere
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

/**
 * Apre il PDF in una scheda nuova (Mac e iPad: da lì Condividi/Stampa).
 * Safari blocca le finestre aperte dopo un'attesa: chi chiama apre PRIMA,
 * dentro il clic, con `apriFinestraVuota()` e poi passa la finestra qui.
 * Se la finestra non c'è (bloccata) si scarica il file.
 */
export function apriFinestraVuota() {
  try { return window.open("", "_blank"); } catch { return null; }
}

export function mostraPdf(blob, nomeFile, finestra) {
  const url = URL.createObjectURL(blob);
  if (finestra && !finestra.closed) {
    finestra.location.href = url;
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
