// @version: v1.0 — forme della piantina condivise da Editor Tavoli e Mappa Tavoli
// Modulo: prenotazioni
import React from "react";

export const CANVAS_W = 1000;
export const CANVAS_H = 600;
export const COLORE_TAVOLO = "#c5dcd9"; // verde salvia, come la piantina di TheFork Manager
export const COLORE_ELEMENTO = "#e2e2e2";

// Tavolo: rettangolo, cerchio o rombo dentro il suo riquadro (x, y, larghezza, altezza)
export function FormaTavolo({ t, fill = COLORE_TAVOLO, stroke = "none", strokeWidth = 0, dash = "none" }) {
  const { posizione_x: x, posizione_y: y, larghezza: w, altezza: h } = t;
  const comune = { fill, stroke, strokeWidth, strokeDasharray: dash };
  if (t.forma === "circle") {
    return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...comune} />;
  }
  if (t.forma === "diamond") {
    const pts = `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
    return <polygon points={pts} strokeLinejoin="round" {...comune} />;
  }
  return <rect x={x} y={y} width={w} height={h} rx={6} {...comune} />;
}

// Elemento non prenotabile (bancone, colonna, scala, fioriera)
export function FormaElemento({ e, stroke = "none", strokeWidth = 0 }) {
  const fill = e.colore || COLORE_ELEMENTO;
  const { posizione_x: x, posizione_y: y, larghezza: w, altezza: h } = e;
  return (
    <g>
      {e.forma === "circle"
        ? <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        : <rect x={x} y={y} width={w} height={h} rx={2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />}
      {e.etichetta && w > 40 && (
        <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="middle"
          fontSize="10" fill="#6b7280" className="select-none pointer-events-none">{e.etichetta}</text>
      )}
    </g>
  );
}

// Schede delle sale (Osteria / Dehor / Veranda…)
export function SchedeSale({ sale, attiva, onChange, conteggi = {} }) {
  if (!sale || sale.length === 0) return null;
  return (
    <div className="flex gap-1 border-b border-neutral-200 mb-3 overflow-x-auto">
      {sale.map((s) => (
        <button key={s} onClick={() => onChange(s)}
          className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px min-h-[44px] transition ${
            attiva === s ? "border-brand-ink text-neutral-900 font-semibold" : "border-transparent text-neutral-500 hover:text-neutral-800"
          }`}>
          {s}{conteggi[s] != null && <span className="ml-1 text-xs text-neutral-400">{conteggi[s]}</span>}
        </button>
      ))}
    </div>
  );
}
