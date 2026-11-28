// @version: v1.0 — la sala dentro il form «Nuova prenotazione»: i tavoli all'ora e per le persone scelte, il tavolo si sceglie toccandolo (2026-11-28)
// Modulo: prenotazioni
// Legge quello che legge la vista Servizio: /prenotazioni/tavoli/mappa/{data}/{turno} (disegno) e
// /prenotazioni/planning/{data} (chi c'è); gli intervalli arrivano dal form (carico.intervalli).
import React, { useEffect, useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../../../config/api";
import usePrenotazioniStati from "./statiPrenotazioni";
import { CANVAS_W, CANVAS_H, FormaTavolo, FormaElemento, SchedeSale } from "./Piantina";

const minuti = (hhmm) => { const [h, m] = String(hhmm || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
const nomiTavolo = (t) => String(t || "").replace(/,/g, "+").split("+").map((x) => x.trim()).filter(Boolean);

export default function SalaForm({ data, turno, ora, pax, durataMin, carico, escludiId, scelti = [], proposti = new Set(), onToggle }) {
  const { gruppo } = usePrenotazioniStati();
  const [mappa, setMappa] = useState(null);
  const [righe, setRighe] = useState([]);
  const [sala, setSala] = useState(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      apiFetch(`${API_BASE}/prenotazioni/tavoli/mappa/${data}/${turno}`).then((r) => (r.ok ? r.json() : null)),
      apiFetch(`${API_BASE}/prenotazioni/planning/${data}`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([m, p]) => { if (vivo) { setMappa(m); setRighe((p && p[turno]) || []); } }).catch(() => {});
    return () => { vivo = false; };
  }, [data, turno]);

  // Chi tiene ogni tavolo nell'intervallo della prenotazione che sto scrivendo
  const fuori = gruppo("fuori");
  const occupati = useMemo(() => {
    const da = minuti(ora);
    const out = {};
    if (da == null) return out;
    const a = da + (Number(durataMin) || carico?.durata_regola || 1);
    for (const p of righe) {
      if (fuori.includes(p.stato) || p.stato === "WAITLIST" || p.stato === "LEFT" || p.id === escludiId) continue;
      const iv = (carico?.intervalli || {})[String(p.id)];
      if (!iv || !(iv[0] < a && da < iv[1])) continue;
      for (const n of nomiTavolo(p.tavolo)) if (!out[n]) out[n] = p;
    }
    return out;
  }, [righe, ora, durataMin, carico, escludiId, fuori.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mappa) return <div className="text-sm text-neutral-500 py-6 text-center">Carico la sala…</div>;

  // I tavoli uno per uno: qui si sceglie, e un'unione si fa toccandone due
  const tutti = (mappa.tavoli || []).flatMap((t) => (t.pezzi?.length ? t.pezzi : [t]));
  const sale = mappa.sale?.length ? mappa.sale : [...new Set(tutti.map((t) => t.zona || "sala"))];
  const aperte = Object.fromEntries((mappa.sale_stato || []).map((x) => [x.zona, !!x.aperta]));
  const salaAttiva = sala && sale.includes(sala) ? sala : (sale.find((s) => aperte[s]) || sale[0]);
  const tavoli = tutti.filter((t) => (t.zona || "sala") === salaAttiva);
  const elementi = (mappa.elementi || []).filter((e) => (e.zona || "sala") === salaAttiva);
  const riquadro = (() => {
    const pezzi = [...tavoli, ...elementi];
    if (!pezzi.length) return `0 0 ${CANVAS_W} ${CANVAS_H}`;
    const x1 = Math.min(...pezzi.map((p) => p.posizione_x)), y1 = Math.min(...pezzi.map((p) => p.posizione_y));
    const x2 = Math.max(...pezzi.map((p) => p.posizione_x + p.larghezza)), y2 = Math.max(...pezzi.map((p) => p.posizione_y + p.altezza));
    const m = 20;
    return `${Math.round(x1 - m)} ${Math.round(y1 - m)} ${Math.round(x2 - x1 + m * 2)} ${Math.round(y2 - y1 + m * 2)}`;
  })();

  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <SchedeSale sale={sale} attiva={salaAttiva} onChange={setSala} aperte={aperte} />
        <span className="text-xs text-neutral-600 pb-4 whitespace-nowrap">alle <strong className="text-neutral-900">{ora}</strong> per <strong className="text-neutral-900">{pax}</strong></span>
      </div>
      <div className="bg-white border border-neutral-200 rounded-xl p-2">
        <svg viewBox={riquadro} className="w-full h-auto max-h-[46vh]" role="group" aria-label={`Sala ${salaAttiva}`}>
          {elementi.map((e) => <FormaElemento key={`e${e.id}`} e={e} />)}
          {tavoli.map((t) => {
            const scelto = scelti.includes(t.nome);
            const chi = occupati[t.nome];
            const bloccato = t.stato_tavolo === "BLOCCATO";
            const fermo = (chi || bloccato) && !scelto;
            const adatto = !fermo && (proposti.has(t.nome) || (t.posti_max || 0) >= pax);
            const stile = scelto ? { fill: "#312e81", stroke: "#312e81", strokeWidth: 2 }
              : fermo ? { fill: "#e5e5e5", stroke: "#a3a3a3", strokeWidth: 1 }
              : adatto ? { fill: proposti.has(t.nome) ? "#ecfdf5" : "#ffffff", stroke: "#047857", strokeWidth: 2.5 }
              : { fill: "#ffffff", stroke: "#737373", strokeWidth: 1.5, dash: "5 4" };
            const testo = scelto ? "#ffffff" : fermo ? "#525252" : adatto ? "#065f46" : "#404040";
            const sotto = scelto ? "scelto" : bloccato ? "bloccato" : chi ? (chi.cognome || chi.nome || "occupato") : adatto ? (proposti.has(t.nome) ? "proposto" : `fino a ${t.posti_max}`) : `da ${t.posti_max || "?"}`;
            const cx = t.posizione_x + t.larghezza / 2, cy = t.posizione_y + t.altezza / 2;
            const tocca = () => { if (!fermo) onToggle(t.nome); };
            return (
              <g key={t.id} role="button" tabIndex={fermo ? -1 : 0} aria-disabled={fermo} aria-pressed={scelto}
                aria-label={`Tavolo ${t.nome}, ${sotto}`} onClick={tocca}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tocca(); } }}
                style={{ cursor: fermo ? "default" : "pointer" }}>
                <FormaTavolo t={t} {...stile} />
                <text x={cx} y={cy - 3} textAnchor="middle" fontSize="15" fontWeight="700" fill={testo} className="select-none pointer-events-none">{t.nome}</text>
                <text x={cx} y={cy + 11} textAnchor="middle" fontSize="9" fill={testo} className="select-none pointer-events-none">{String(sotto).slice(0, 10)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
        <span><strong className="text-emerald-800">Bordo verde</strong> libero e adatto a {pax}</span>
        <span><strong>Tratteggiato</strong> libero ma piccolo</span>
        <span><strong>Grigio</strong> occupato a quell'ora</span>
        <span><strong className="text-indigo-900">Indaco</strong> scelto: un altro tocco su un vicino li unisce</span>
      </div>
    </div>
  );
}
