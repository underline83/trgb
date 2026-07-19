// @version: v2.0 — Storie Instagram pranzo, serie da 2 (canvas client-side, 2026-07-19)
// Modulo: cucina (sub-modulo pranzo) — [locale:tregobbi] (grafica Tre Gobbi)
//
// Disegna DUE storie IG 1080×1920 in stile "menu A5" (bianco carta):
//   1. Copertina — logo osteria, claim, blocco Menù Business (una/due/tre
//      portate), note e recapiti da pranzo_settings.
//   2. Menù — piatti della settimana raggruppati per categoria con etichette
//      a filetti, font adattivo CON a-capo (i nomi lunghi vanno su più righe,
//      mai fuori dai bordi come nella v1.0 antracite).
// Niente dipendenze server: i PNG nascono client-side. Font Cormorant
// Garamond + Courier Prime caricati da Google Fonts al primo utilizzo
// (fallback serif/monospace se offline). Recapiti (ig_telefono,
// ig_indirizzo) da Impostazioni Cucina · Menu Pranzo: se vuoti, la riga
// sparisce — niente dati inventati.

import React, { useEffect, useRef, useState } from "react";
import { Btn } from "../../components/ui";
import logoOsteria from "../../assets/brand/logo-osteria-trim.png";

const W = 1080, H = 1920;
const BG = "#fdfcfa", INK = "#1a1a1a", GRIGIO = "#8a8a8a", NOTE = "#555555",
  FILETTO = "#c9c9c9", FOOT = "#777777";
const LOGO_RATIO = 2154 / 4719; // h/w del PNG trim

const ORDINE_CAT = { antipasto: 1, primo: 2, secondo: 3, contorno: 4, dolce: 5, altro: 6 };
const LABEL_CAT = {
  antipasto: "ANTIPASTI", primo: "PRIMI", secondo: "SECONDI",
  contorno: "CONTORNI", dolce: "DOLCI", altro: "DAL MERCATO",
};

const FONT_LINK_ID = "pranzo-story-fonts";
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Courier+Prime:wght@700&display=swap";

function ensureFonts() {
  let link = document.getElementById(FONT_LINK_ID);
  const wait = [];
  if (!link) {
    link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
    wait.push(new Promise((res) => {
      link.onload = res;
      setTimeout(res, 3000); // offline: si va di fallback
    }));
  }
  return Promise.all(wait).then(() =>
    Promise.all([
      document.fonts.load("italic 400 58px 'Cormorant Garamond'"),
      document.fonts.load("400 36px 'Cormorant Garamond'"),
      document.fonts.load("600 36px 'Cormorant Garamond'"),
      document.fonts.load("700 44px 'Courier Prime'"),
    ]).catch(() => {})
  );
}

function loadLogo() {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = logoOsteria;
  });
}

function fmtPrezzo(p) {
  if (p == null) return "";
  return Number(p).toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

// Testo centrato con spaziatura lettera-per-lettera (canvas non ha
// letterSpacing affidabile cross-browser).
function trackedCenter(ctx, text, cx, y, spacing) {
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + spacing;
  total -= spacing;
  let x = cx - total / 2;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = prev;
}

function trackedWidth(ctx, text, spacing) {
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + spacing;
  return total - spacing;
}

// A-capo per parole: mai oltre maxW (fix del difetto storico della v1.0).
function wrapTracked(ctx, text, maxW, spacing) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (cur && trackedWidth(ctx, test, spacing) > maxW) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Etichetta categoria con filetti laterali (come il PDF A5).
function catLabel(ctx, text, cx, y, fontPx) {
  ctx.font = `400 ${fontPx}px 'Cormorant Garamond', serif`;
  ctx.fillStyle = GRIGIO;
  const spacing = fontPx * 0.4;
  trackedCenter(ctx, text, cx, y, spacing);
  const tw = trackedWidth(ctx, text, spacing);
  const gap = 30, margine = 70, lineY = y - fontPx * 0.32;
  ctx.strokeStyle = FILETTO;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margine, lineY);
  ctx.lineTo(cx - tw / 2 - gap, lineY);
  ctx.moveTo(cx + tw / 2 + gap, lineY);
  ctx.lineTo(W - margine, lineY);
  ctx.stroke();
}

function drawLogo(ctx, img, cx, topY, width) {
  if (!img) return topY; // niente logo se il PNG non carica
  const h = width * LOGO_RATIO;
  // 'multiply': il fondo bianco del PNG sparisce sul fondo carta
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(img, cx - width / 2, topY, width, h);
  ctx.globalCompositeOperation = prev;
  return topY + h;
}

function righeMenu(menu) {
  return (menu?.righe || [])
    .filter((r) => (r.nome || "").trim())
    .sort((a, b) =>
      (ORDINE_CAT[a.categoria] || 99) - (ORDINE_CAT[b.categoria] || 99) ||
      (a.ordine ?? 0) - (b.ordine ?? 0));
}

// ---------------------------------------------------------------- copertina
export function disegnaCopertina(canvas, { settings, logoImg }) {
  const ctx = canvas.getContext("2d");
  canvas.width = W; canvas.height = H;
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  const cx = W / 2;

  const logoBottom = drawLogo(ctx, logoImg, cx, 330, 600);

  // Claim: "oggi a pranzo" + sottotitolo da settings
  const sotto = (settings?.sottotitolo_default || "la cucina del mercato").trim();
  ctx.fillStyle = INK;
  ctx.font = "italic 400 58px 'Cormorant Garamond', serif";
  let y = (logoImg ? logoBottom : 430) + 175;
  ctx.fillText("oggi a pranzo", cx, y);
  ctx.fillText(sotto, cx, y + 76);

  // Blocco business ancorato in basso
  const titoloBiz = (settings?.titolo_business || "Menù Business").toUpperCase();
  catLabel(ctx, titoloBiz, cx, 1085, 36);

  const rows = [
    ["UNA PORTATA", fmtPrezzo(settings?.prezzo_1_default ?? 15)],
    ["DUE PORTATE", fmtPrezzo(settings?.prezzo_2_default ?? 25)],
    ["TRE PORTATE", fmtPrezzo(settings?.prezzo_3_default ?? 35)],
  ];
  ctx.font = "700 40px 'Courier Prime', 'Courier New', monospace";
  ctx.fillStyle = INK;
  let ry = 1200;
  for (const [nome, prezzo] of rows) {
    ctx.textAlign = "left";
    ctx.fillText(nome, 220, ry);
    ctx.textAlign = "right";
    ctx.fillText(prezzo, 860, ry);
    ry += 80;
  }
  ctx.textAlign = "center";

  // Note (footer_default) + recapiti da settings — righe vuote saltate
  const note = (settings?.footer_default || "acqua, coperto e servizio inclusi\nda lunedì a venerdì")
    .split("\n").map((r) => r.trim()).filter(Boolean);
  const indirizzo = (settings?.ig_indirizzo || "").trim();
  const tel = (settings?.ig_telefono || "").trim();
  const contatti = [indirizzo, tel].filter(Boolean).join(" · ");
  if (contatti) note.push(contatti);

  ctx.fillStyle = NOTE;
  ctx.font = "italic 400 36px 'Cormorant Garamond', serif";
  let ny = 1490;
  for (const riga of note.slice(0, 4)) {
    ctx.fillText(riga, cx, ny);
    ny += 60;
  }
}

// -------------------------------------------------------------------- menù
export function disegnaMenu(canvas, { menu, settings, logoImg }) {
  const ctx = canvas.getContext("2d");
  canvas.width = W; canvas.height = H;
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  const cx = W / 2;

  const logoBottom = drawLogo(ctx, logoImg, cx, 240, 400);
  ctx.fillStyle = "#333333";
  ctx.font = "italic 400 38px 'Cormorant Garamond', serif";
  const claimY = (logoImg ? logoBottom : 300) + 72;
  ctx.fillText("oggi a pranzo", cx, claimY);

  const righe = righeMenu(menu);
  const areaTop = claimY + 60;
  const footerY = H - 265;
  const areaBottom = footerY - 60;

  if (righe.length === 0) {
    ctx.fillStyle = GRIGIO;
    ctx.font = "italic 400 40px 'Cormorant Garamond', serif";
    ctx.fillText("menù in preparazione", cx, (areaTop + areaBottom) / 2);
  } else {
    // Font adattivo CON wrapping: parte da 43px e scende finché il blocco
    // (piatti a capo inclusi) sta nell'area. Minimo 28px.
    const maxW = 940, spacing = 1.5;
    const catFont = 29, catSopra = 46, catSotto = 40;

    const misura = (fs) => {
      ctx.font = `700 ${fs}px 'Courier Prime', 'Courier New', monospace`;
      const lh = fs * 1.28 + 12;
      let hTot = 0;
      let lastCat = null;
      const blocchi = [];
      for (const r of righe) {
        if (r.categoria !== lastCat) {
          hTot += (lastCat === null ? 0 : catSopra) + catFont + catSotto;
          blocchi.push({ cat: LABEL_CAT[r.categoria] || r.categoria.toUpperCase() });
          lastCat = r.categoria;
        }
        const lines = wrapTracked(ctx, r.nome.trim().toUpperCase(), maxW, spacing);
        hTot += lines.length * lh + 14;
        blocchi.push({ lines });
      }
      return { hTot, blocchi, lh };
    };

    let fs = 43, mis = misura(fs);
    while (fs > 28 && mis.hTot > areaBottom - areaTop) {
      fs -= 1;
      mis = misura(fs);
    }

    let y = areaTop + Math.max(0, (areaBottom - areaTop - mis.hTot) / 2);
    for (const b of mis.blocchi) {
      if (b.cat) {
        y += (y > areaTop + 1 ? catSopra : 0) + catFont;
        catLabel(ctx, b.cat, cx, y, catFont);
        y += catSotto;
      } else {
        ctx.font = `700 ${fs}px 'Courier Prime', 'Courier New', monospace`;
        ctx.fillStyle = INK;
        for (const line of b.lines) {
          y += fs;
          trackedCenter(ctx, line, cx, y, spacing);
          y += mis.lh - fs;
        }
        y += 14;
      }
    }
  }

  // Footer
  const p1 = fmtPrezzo(settings?.prezzo_1_default ?? 15);
  const p2 = fmtPrezzo(settings?.prezzo_2_default ?? 25);
  const p3 = fmtPrezzo(settings?.prezzo_3_default ?? 35);
  ctx.fillStyle = FOOT;
  ctx.font = "italic 400 30px 'Cormorant Garamond', serif";
  ctx.fillText(`menù business ${p1} · ${p2} · ${p3} — da lunedì a venerdì`, cx, footerY);
}

export default function PranzoStoryCanvas({ menu, settings, onClose }) {
  const coverRef = useRef(null);
  const menuRef = useRef(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let alive = true;
    const render = async () => {
      const [, logoImg] = await Promise.all([ensureFonts(), loadLogo()]);
      try { await document.fonts.ready; } catch { /* ignore */ }
      if (!alive || !coverRef.current || !menuRef.current) return;
      disegnaCopertina(coverRef.current, { settings, logoImg });
      disegnaMenu(menuRef.current, { menu, settings, logoImg });
      setPronto(true);
    };
    render();
    return () => { alive = false; };
  }, [menu, settings]);

  const scaricaCanvas = (canvas, nome) =>
    new Promise((res) => {
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = nome;
        a.click();
        URL.revokeObjectURL(url);
        res();
      }, "image/png");
    });

  const scarica = async () => {
    const d = new Date().toISOString().slice(0, 10);
    if (coverRef.current) await scaricaCanvas(coverRef.current, `pranzo-tregobbi-${d}-1-copertina.png`);
    if (menuRef.current) await scaricaCanvas(menuRef.current, `pranzo-tregobbi-${d}-2-menu.png`);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="bg-white rounded-2xl p-4 max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-orange-900 font-playfair">📱 Storie Instagram (2)</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-lg">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100">
            <canvas ref={coverRef} style={{ width: "100%", height: "auto", display: "block" }} />
          </div>
          <div className="rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100">
            <canvas ref={menuRef} style={{ width: "100%", height: "auto", display: "block" }} />
          </div>
        </div>
        <p className="text-[11px] text-neutral-500 mt-2">
          1080×1920, pronte per le Storie: prima la copertina, poi il menù.
          I recapiti si impostano in Impostazioni Cucina · Menu Pranzo.
        </p>
        <div className="flex gap-2 mt-3">
          <Btn variant="success" size="md" onClick={scarica} disabled={!pronto}>⬇ Scarica PNG (2)</Btn>
          <Btn variant="ghost" size="md" onClick={onClose}>Chiudi</Btn>
        </div>
      </div>
    </div>
  );
}
