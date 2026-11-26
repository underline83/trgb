// @version: v1.0 — testata comune delle pagine di Prenotazioni: frecce, titolo del giorno, «Oggi», scelta pranzo/cena (2026-11-26)
// Modulo: prenotazioni
// Marco 2026-11-26: «da un lato certi colori dall'altro diversi, da un lato tasti arrotondati da un altro no».
// Un posto solo per la riga in alto di Servizio, Planning, Mappa Tavoli e Mese: stesse misure (tasti 44 px),
// stessi angoli, titolo in Playfair come da regola di progetto, indaco per ciò che è scelto.
import React from "react";

const pad = (n) => String(n).padStart(2, "0");
export const giornoLocale = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const spostaGiorno = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return giornoLocale(d); };

const TASTO = "min-w-[44px] min-h-[44px] px-3 rounded-lg border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 flex items-center justify-center text-sm font-medium";

export function TastoTestata({ children, className = "", ...props }) {
  return <button type="button" className={`${TASTO} ${className}`} {...props}>{children}</button>;
}

export function TitoloTestata({ children, className = "" }) {
  return <h1 className={`text-xl sm:text-2xl font-bold text-neutral-900 capitalize ${className}`} style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{children}</h1>;
}

export function SceltaTurno({ turno, onChange }) {
  return (
    <span className="flex rounded-lg border border-neutral-400 overflow-hidden text-sm">
      {["pranzo", "cena"].map((t) => (
        <button key={t} type="button" onClick={() => onChange(t)} aria-pressed={turno === t}
          className={`px-3.5 min-h-[44px] capitalize ${turno === t ? "bg-indigo-900 text-white font-bold" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}>{t}</button>
      ))}
    </span>
  );
}

// ◀ Giovedì 26 novembre ▶ [Oggi] [pranzo|cena] {children} ……… {destra}
export default function TestataGiorno({ data, onData, turno, onTurno, corto = false, children, destra }) {
  const d = new Date(`${data}T12:00:00`);
  const oggi = giornoLocale();
  const altroAnno = d.getFullYear() !== new Date().getFullYear();
  const titolo = d.toLocaleDateString("it-IT", corto
    ? { weekday: "short", day: "numeric", month: "short", ...(altroAnno ? { year: "numeric" } : {}) }
    : { weekday: "long", day: "numeric", month: "long", ...(altroAnno ? { year: "numeric" } : {}) });
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <TastoTestata onClick={() => onData(spostaGiorno(data, -1))} aria-label="Giorno prima">◀</TastoTestata>
        <TitoloTestata className="sm:min-w-[15rem] text-center">{titolo}</TitoloTestata>
        <TastoTestata onClick={() => onData(spostaGiorno(data, 1))} aria-label="Giorno dopo">▶</TastoTestata>
        {data !== oggi && <TastoTestata onClick={() => onData(oggi)}>Oggi</TastoTestata>}
        {turno && onTurno && <SceltaTurno turno={turno} onChange={onTurno} />}
        {children}
      </div>
      {destra && <div className="flex items-center gap-3 flex-wrap max-sm:w-full">{destra}</div>}
    </div>
  );
}
