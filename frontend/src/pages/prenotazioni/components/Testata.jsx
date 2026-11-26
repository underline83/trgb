// @version: v1.1 — scelta della vista (Servizio / Elenco / Mappa) nella testata (2026-11-26); v1.0 — testata comune delle pagine di Prenotazioni: frecce, titolo del giorno, «Oggi», scelta pranzo/cena (2026-11-26)
// Modulo: prenotazioni
// Marco 2026-11-26: «da un lato certi colori dall'altro diversi, da un lato tasti arrotondati da un altro no».
// Un posto solo per la riga in alto di Servizio, Planning, Mappa Tavoli e Mese: stesse misure (tasti 44 px),
// stessi angoli, titolo in Playfair come da regola di progetto, indaco per ciò che è scelto.
import React from "react";
import { useNavigate } from "react-router-dom";

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

// «+ Nuova prenotazione»: lo stesso tasto in tutte le viste (su schermi stretti resta «+ Nuova», così la riga non va a capo)
export function TastoNuova({ onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="px-4 min-h-[44px] rounded-lg bg-brand-blue text-white text-sm font-semibold hover:bg-blue-700 whitespace-nowrap max-sm:flex-1">
      + Nuova<span className="max-xl:hidden"> prenotazione</span>
    </button>
  );
}

// Le tre viste dello stesso servizio (Marco 2026-11-26: «Planning e Mappa Tavoli diventano visualizzazioni interne a
// Servizio»): non sono più tab della barra, si passa dall'una all'altra da qui restando su giorno e turno.
const VISTE = [["servizio", "Servizio"], ["planning", "Elenco"], ["mappa", "Mappa"]];
export function SceltaVista({ vista, data, turno }) {
  const navigate = useNavigate();
  const vai = (v) => {
    if (v === vista) return;
    if (v === "planning") navigate(`/prenotazioni/planning/${data}`);
    else navigate(`/prenotazioni/${v}/${data}${turno ? `/${turno}` : ""}`);
  };
  return (
    <span className="flex rounded-lg border border-neutral-400 overflow-hidden text-sm" role="group" aria-label="Vista">
      {VISTE.map(([v, etichetta]) => (
        <button key={v} type="button" onClick={() => vai(v)} aria-pressed={vista === v}
          className={`px-3.5 min-h-[44px] ${vista === v ? "bg-indigo-900 text-white font-bold" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}>{etichetta}</button>
      ))}
    </span>
  );
}

// ◀ Giovedì 26 novembre ▶ [Oggi] [pranzo|cena] {children} ……… [Servizio|Elenco|Mappa] {destra}
export default function TestataGiorno({ data, onData, turno, onTurno, vista, corto = false, children, destra }) {
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
      {(destra || vista) && (
        <div className="flex items-center gap-3 flex-wrap max-sm:w-full">
          {vista && <SceltaVista vista={vista} data={data} turno={turno} />}
          {destra}
        </div>
      )}
    </div>
  );
}
