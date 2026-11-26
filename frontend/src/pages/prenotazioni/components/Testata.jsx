// @version: v1.2 — il giorno nel titolo si tocca e apre un mese piccolo per saltare a un altro giorno (2026-11-26); v1.1 — scelta della vista (Servizio / Elenco / Mappa) nella testata (2026-11-26); v1.0 — testata comune delle pagine di Prenotazioni: frecce, titolo del giorno, «Oggi», scelta pranzo/cena (2026-11-26)
// Modulo: prenotazioni
// Marco 2026-11-26: «da un lato certi colori dall'altro diversi, da un lato tasti arrotondati da un altro no».
// Un posto solo per la riga in alto di Servizio, Planning, Mappa Tavoli e Mese: stesse misure (tasti 44 px),
// stessi angoli, titolo in Playfair come da regola di progetto, indaco per ciò che è scelto.
import React, { useEffect, useRef, useState } from "react";
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

// Il mese piccolo che si apre toccando il giorno (Marco 2026-11-26: «per scegliere un altro giorno senza scorrere
// tutte le date»). Settimana da lunedì; il giorno scelto è pieno, oggi ha il bordo; le frecce cambiano mese.
const GIORNI_SETT = ["L", "M", "M", "G", "V", "S", "D"];
function MiniMese({ data, onScegli, onChiudi }) {
  const [mese, setMese] = useState(() => { const d = new Date(`${data}T12:00:00`); return { a: d.getFullYear(), m: d.getMonth() }; });
  const oggi = giornoLocale();
  const primo = new Date(mese.a, mese.m, 1, 12);
  const vuoti = (primo.getDay() + 6) % 7;
  const quanti = new Date(mese.a, mese.m + 1, 0).getDate();
  const celle = [...Array(vuoti).fill(null), ...Array.from({ length: quanti }, (_, i) => `${mese.a}-${pad(mese.m + 1)}-${pad(i + 1)}`)];
  const sposta = (n) => setMese(({ a, m }) => { const d = new Date(a, m + n, 1); return { a: d.getFullYear(), m: d.getMonth() }; });
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onChiudi(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onChiudi]);
  return (
    <div role="dialog" aria-label="Scegli il giorno"
      className="absolute left-1/2 -translate-x-1/2 max-sm:-left-12 max-sm:translate-x-0 top-full mt-2 z-50 w-[20.5rem] max-w-[calc(100vw-1.5rem)] rounded-xl border border-neutral-300 bg-white shadow-xl p-2.5">
      <div className="flex items-center justify-between mb-1">
        <TastoTestata onClick={() => sposta(-1)} aria-label="Mese prima" className="border-transparent">◀</TastoTestata>
        <span className="font-bold text-neutral-900 capitalize">{primo.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</span>
        <TastoTestata onClick={() => sposta(1)} aria-label="Mese dopo" className="border-transparent">▶</TastoTestata>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-neutral-500">
        {GIORNI_SETT.map((g, i) => <span key={i} className="py-1">{g}</span>)}
      </div>
      <div className="grid grid-cols-7">
        {celle.map((g, i) => g ? (
          <button key={g} type="button" onClick={() => onScegli(g)} aria-current={g === data ? "date" : undefined}
            className={`min-h-[44px] rounded-lg text-sm ${g === data ? "bg-indigo-900 text-white font-bold"
              : g === oggi ? "border-2 border-indigo-700 text-indigo-900 font-bold hover:bg-indigo-50" : "text-neutral-800 hover:bg-neutral-100"}`}>
            {Number(g.slice(8))}
          </button>
        ) : <span key={`v${i}`} />)}
      </div>
      {data !== oggi && (
        <button type="button" onClick={() => onScegli(oggi)} className="mt-1 w-full min-h-[44px] rounded-lg text-sm font-semibold text-indigo-800 hover:bg-indigo-50">Vai a oggi</button>
      )}
    </div>
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
  const [mini, setMini] = useState(false);
  const zona = useRef(null);
  useEffect(() => {
    if (!mini) return undefined;
    const fuori = (e) => { if (zona.current && !zona.current.contains(e.target)) setMini(false); };
    document.addEventListener("pointerdown", fuori);
    return () => document.removeEventListener("pointerdown", fuori);
  }, [mini]);
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <TastoTestata onClick={() => onData(spostaGiorno(data, -1))} aria-label="Giorno prima">◀</TastoTestata>
        <span ref={zona} className="relative">
          <button type="button" onClick={() => setMini((v) => !v)} aria-expanded={mini} aria-haspopup="dialog" title="Scegli un altro giorno"
            className="min-h-[44px] px-2 rounded-lg hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue">
            <TitoloTestata className="sm:min-w-[14rem] text-center">{titolo}<span className="ml-1.5 text-sm text-neutral-500 align-middle">▾</span></TitoloTestata>
          </button>
          {mini && <MiniMese data={data} onChiudi={() => setMini(false)} onScegli={(g) => { setMini(false); if (g !== data) onData(g); }} />}
        </span>
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
