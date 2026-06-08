// @version: v1.0 — Generatore Storia Instagram pranzo (canvas client-side, 2026-06-08)
// Modulo: cucina (sub-modulo pranzo) — [locale:tregobbi] (grafica Tre Gobbi)
//
// Disegna la storia IG 1080×1920 "oggi a pranzo" (variante Antracite) su un
// <canvas> nel browser e la offre come PNG da scaricare. Niente dipendenze
// server: il PNG nasce client-side. I piatti vengono dal menu della settimana
// corrente, prezzi e recapiti da pranzo_settings.

import React, { useEffect, useRef, useState } from "react";
import { Btn } from "../../components/ui";

const W = 1080, H = 1920;
const SAFE_TOP = 250, SAFE_BOTTOM = 250;  // aree coperte dalla UI Instagram
const BG = "#161513", INK = "#f2efe8", MUTED = "#b6b0a4", DIM = "#9c968a";

const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno",
  "luglio","agosto","settembre","ottobre","novembre","dicembre"];
const GIORNI = ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];

const ORDINE_CAT = { antipasto: 1, primo: 2, secondo: 3, contorno: 4, dolce: 5, altro: 6 };

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

// Le tre gobbette (stessi path del logo) centrate.
function drawGobbette(ctx, cx, topY, width, color) {
  const s = width / 110, ox = cx - width / 2, oy = topY;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.4 * s;
  ctx.lineCap = "round";
  const archi = [[6,26,18,4,34,22],[40,26,52,4,68,22],[74,26,86,4,102,22]];
  for (const [x0,y0,cxx,cyy,x1,y1] of archi) {
    ctx.beginPath();
    ctx.moveTo(ox + x0*s, oy + y0*s);
    ctx.quadraticCurveTo(ox + cxx*s, oy + cyy*s, ox + x1*s, oy + y1*s);
    ctx.stroke();
  }
}

function piattiOrdinati(menu) {
  const righe = (menu?.righe || [])
    .filter((r) => (r.nome || "").trim())
    .sort((a, b) =>
      (ORDINE_CAT[a.categoria] || 99) - (ORDINE_CAT[b.categoria] || 99) ||
      (a.ordine ?? 0) - (b.ordine ?? 0));
  return righe.map((r) => r.nome.trim().toUpperCase());
}

export function disegnaStoria(canvas, { menu, settings }) {
  const ctx = canvas.getContext("2d");
  canvas.width = W; canvas.height = H;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  const cx = W / 2;
  const oggi = new Date();
  const dataStr = `${GIORNI[oggi.getDay()].toUpperCase()} ${oggi.getDate()} ${MESI[oggi.getMonth()].toUpperCase()}`;

  // Gobbette + brand
  drawGobbette(ctx, cx, SAFE_TOP + 70, 360, INK);
  ctx.fillStyle = MUTED;
  ctx.font = "300 30px 'Inter', sans-serif";
  trackedCenter(ctx, "OSTERIA TRE GOBBI", cx, SAFE_TOP + 235, 10);

  // Data + oggi a pranzo
  ctx.fillStyle = DIM;
  ctx.font = "400 34px 'Inter', sans-serif";
  trackedCenter(ctx, `${dataStr} · OGGI A PRANZO`, cx, SAFE_TOP + 360, 6);

  // Piatti — font adattivo per far entrare il più lungo in maxW
  const piatti = piattiOrdinati(menu).slice(0, 6);
  const maxW = 940;
  let fs = 56;
  const fit = (size) => {
    ctx.font = `700 ${size}px 'Courier New', monospace`;
    return piatti.every((p) => {
      let w = 0; for (const ch of p) w += ctx.measureText(ch).width + 2;
      return w <= maxW;
    });
  };
  while (fs > 26 && !fit(fs)) fs -= 2;
  const lh = fs * 1.7;

  const areaTop = SAFE_TOP + 430;
  const areaBottom = H - SAFE_BOTTOM - 330;
  const blocco = piatti.length * lh;
  let y = areaTop + Math.max(0, (areaBottom - areaTop - blocco) / 2) + fs;
  ctx.fillStyle = INK;
  ctx.font = `700 ${fs}px 'Courier New', monospace`;
  if (piatti.length === 0) {
    ctx.fillStyle = DIM;
    ctx.font = "italic 36px 'Playfair Display', serif";
    trackedCenter(ctx, "menù in preparazione", cx, (areaTop + areaBottom) / 2, 2);
  } else {
    for (const p of piatti) {
      ctx.font = `700 ${fs}px 'Courier New', monospace`;
      trackedCenter(ctx, p, cx, y, 2);
      y += lh;
    }
  }

  // Menù business
  const p1 = fmtPrezzo(settings?.prezzo_1_default ?? 15);
  const p2 = fmtPrezzo(settings?.prezzo_2_default ?? 25);
  const p3 = fmtPrezzo(settings?.prezzo_3_default ?? 35);
  ctx.fillStyle = "#d8cfc0";
  ctx.font = "italic 38px 'Playfair Display', serif";
  trackedCenter(ctx, `menù business  ${p1} · ${p2} · ${p3}`, cx, H - SAFE_BOTTOM - 250, 1);

  // Recapiti (CTA)
  const tel = (settings?.ig_telefono || "").trim();
  const indirizzo = (settings?.ig_indirizzo || "").trim();
  ctx.fillStyle = MUTED;
  ctx.font = "400 30px 'Inter', sans-serif";
  const cta = tel ? `VIENI A TROVARCI · ${tel}` : "VIENI A TROVARCI";
  trackedCenter(ctx, cta, cx, H - SAFE_BOTTOM - 150, 4);
  if (indirizzo) {
    ctx.fillStyle = DIM;
    ctx.font = "italic 30px 'Playfair Display', serif";
    trackedCenter(ctx, indirizzo, cx, H - SAFE_BOTTOM - 100, 1);
  }
  ctx.fillStyle = DIM;
  ctx.font = "italic 28px 'Playfair Display', serif";
  trackedCenter(ctx, "da lunedì a venerdì", cx, H - SAFE_BOTTOM - 50, 1);
}

export default function PranzoStoryCanvas({ menu, settings, onClose }) {
  const canvasRef = useRef(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let alive = true;
    const render = async () => {
      try { await document.fonts.ready; } catch { /* ignore */ }
      if (!alive || !canvasRef.current) return;
      disegnaStoria(canvasRef.current, { menu, settings });
      setPronto(true);
    };
    render();
    return () => { alive = false; };
  }, [menu, settings]);

  const scarica = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const d = new Date().toISOString().slice(0, 10);
      a.href = url; a.download = `pranzo-tregobbi-${d}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="bg-white rounded-2xl p-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-orange-900 font-playfair">📱 Storia Instagram</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-lg">✕</button>
        </div>
        <div className="rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100">
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>
        <p className="text-[11px] text-neutral-500 mt-2">
          1080×1920, pronta per le Storie. I recapiti si impostano in
          Impostazioni Cucina · Menu Pranzo.
        </p>
        <div className="flex gap-2 mt-3">
          <Btn variant="success" size="md" onClick={scarica} disabled={!pronto}>⬇ Scarica PNG</Btn>
          <Btn variant="ghost" size="md" onClick={onClose}>Chiudi</Btn>
        </div>
      </div>
    </div>
  );
}
