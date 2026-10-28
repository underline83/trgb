// @version: v1.0 — Cucina › Piatti che vanno (IP.1, 2026-10-28): porzioni per tipo dai conti di cassa,
//   confronto col periodo prima, in crescita / in calo / non usciti più, andamento giorno per giorno.
// Dati: GET /cucina/vendite/piatti/ e /cucina/vendite/piatto/ (servizio vendite_conti_service, sola lettura).
// Solo porzioni, niente euro: è una pagina per oste e cuoco.
import React, { useEffect, useState } from "react";
import RicetteNav from "../ricette/RicetteNav";
import { API_BASE, apiFetch } from "../../config/api";

const PERIODI = [
  { giorni: 1, label: "Ieri" },
  { giorni: 7, label: "7 giorni" },
  { giorni: 30, label: "30 giorni" },
  { giorni: 90, label: "3 mesi" },
];
const TURNI = [
  { k: "tutti", label: "Pranzo e cena" },
  { k: "pranzo", label: "Pranzo" },
  { k: "cena", label: "Cena" },
];

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
function dataBreve(iso, conGiorno = false) {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  return `${conGiorno ? GIORNI[d.getDay()] + " " : ""}${d.getDate()} ${MESI[d.getMonth()]}`;
}
const num = (n) => (n == null ? "—" : Number.isInteger(n) ? n.toLocaleString("it-IT") : n.toLocaleString("it-IT", { maximumFractionDigits: 1 }));

function Chip({ attivo, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={attivo}
      className={`min-h-[40px] px-4 rounded-full border text-sm font-semibold transition ${attivo ? "bg-orange-700 border-orange-700 text-white" : "bg-white border-neutral-300 text-neutral-700 hover:border-orange-400"}`}>
      {children}
    </button>
  );
}

function Variazione({ p }) {
  if (p.nuovo) return <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-xs font-bold">nuovo</span>;
  if (p.variazione == null) return null;
  const v = p.variazione;
  if (Math.abs(v) < 10) return <span className="text-xs font-semibold text-neutral-400 tabular-nums">=</span>;
  return (
    <span className={`text-xs font-bold tabular-nums ${v > 0 ? "text-emerald-700" : "text-red-700"}`}>
      {v > 0 ? "↑" : "↓"} {Math.abs(v)}%
    </span>
  );
}

// Andamento di un piatto giorno per giorno (barre semplici)
function Andamento({ nome, dal, al, turno }) {
  const [righe, setRighe] = useState(null);
  useEffect(() => {
    const p = new URLSearchParams({ nome, dal, al });
    if (turno !== "tutti") p.set("turno", turno);
    apiFetch(`${API_BASE}/cucina/vendite/piatto/?${p}`)
      .then((r) => (r.ok ? r.json() : { giorni: [] }))
      .then((d) => {
        const perGiorno = {};
        (d.giorni || []).forEach((g) => { perGiorno[g.giorno] = (perGiorno[g.giorno] || 0) + (g.porzioni || 0); });
        setRighe(Object.entries(perGiorno).map(([giorno, porzioni]) => ({ giorno, porzioni })));
      })
      .catch(() => setRighe([]));
  }, [nome, dal, al, turno]);
  if (righe === null) return <div className="text-xs text-neutral-400 py-2">Carico…</div>;
  if (!righe.length) return <div className="text-xs text-neutral-400 py-2">Nessun dato giorno per giorno.</div>;
  const max = Math.max(...righe.map((r) => r.porzioni), 1);
  return (
    <div className="pt-2 pb-1">
      <div className="flex items-end gap-[3px] h-20" role="img" aria-label={`Porzioni di ${nome} giorno per giorno`}>
        {righe.map((r) => (
          <div key={r.giorno} className="flex-1 min-w-[4px] bg-orange-500/80 rounded-t" style={{ height: `${Math.max(4, (r.porzioni / max) * 100)}%` }}
            title={`${dataBreve(r.giorno, true)}: ${num(r.porzioni)}`} />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-neutral-400 mt-1">
        <span>{dataBreve(righe[0].giorno, true)}</span>
        <span>max {num(max)} al giorno</span>
        <span>{dataBreve(righe[righe.length - 1].giorno, true)}</span>
      </div>
    </div>
  );
}

function Tipo({ g, dal, al, turno, aperto, setAperto }) {
  const top = Math.max(...g.piatti.map((p) => p.porzioni), 1);
  return (
    <section className="rounded-2xl bg-white border border-neutral-200 p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-xs font-bold tracking-wider uppercase text-neutral-500 font-sans">{g.label}</h2>
        <span className="text-sm text-neutral-500"><b className="text-neutral-900 tabular-nums">{num(g.porzioni)}</b> porzioni</span>
      </div>
      <ol className="divide-y divide-neutral-100">
        {g.piatti.map((p, i) => {
          const chiave = `${g.k}|${p.nome}`;
          const isOpen = aperto === chiave;
          return (
            <li key={p.nome}>
              <button type="button" onClick={() => setAperto(isOpen ? null : chiave)} aria-expanded={isOpen}
                className="w-full text-left py-2 min-h-[48px] grid grid-cols-[22px_minmax(0,1fr)_auto] gap-x-2 items-center">
                <span className="text-xs text-neutral-400 tabular-nums text-right">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[15px] text-neutral-900 truncate">{p.nome}</span>
                  <span className="block h-1.5 mt-1 rounded-full bg-neutral-100">
                    <span className="block h-1.5 rounded-full bg-orange-500" style={{ width: `${(p.porzioni / top) * 100}%` }} />
                  </span>
                </span>
                <span className="text-right pl-2">
                  <span className="block text-[15px] font-bold tabular-nums">{num(p.porzioni)}</span>
                  <span className="block leading-none"><Variazione p={p} /></span>
                </span>
              </button>
              {isOpen && (
                <div className="pl-7 pb-2 text-xs text-neutral-500">
                  {num(p.per_servizio)} a servizio · {p.quota}% dei {g.label.toLowerCase()} · prima {num(p.porzioni_prima)}
                  <Andamento nome={p.nome} dal={dal} al={al} turno={turno} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Elenco({ titolo, voci, tono, vuoto, destra }) {
  return (
    <section className="rounded-2xl bg-white border border-neutral-200 p-4">
      <h2 className={`text-xs font-bold tracking-wider uppercase mb-2 font-sans ${tono}`}>{titolo}</h2>
      {voci.length === 0 && <div className="text-sm text-neutral-400">{vuoto}</div>}
      <ul className="space-y-1.5">
        {voci.map((p) => (
          <li key={`${p.categoria}|${p.nome}`} className="flex gap-2 text-[15px]">
            <span className="flex-1 min-w-0 truncate">{p.nome}</span>
            <span className="shrink-0 tabular-nums text-sm">{destra(p)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CucinaPiatti() {
  const [giorni, setGiorni] = useState(7);
  const [turno, setTurno] = useState("tutti");
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState(null);
  const [aperto, setAperto] = useState(null);

  useEffect(() => {
    setD(null); setErrore(null); setAperto(null);
    const p = new URLSearchParams({ giorni: String(giorni) });
    if (turno !== "tutti") p.set("turno", turno);
    apiFetch(`${API_BASE}/cucina/vendite/piatti/?${p}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Errore"); return r.json(); })
      .then(setD)
      .catch((e) => setErrore(e.message));
  }, [giorni, turno]);

  const periodoTesto = d ? (d.dal === d.al ? dataBreve(d.dal, true) : `dal ${dataBreve(d.dal)} al ${dataBreve(d.al)}`) : "";
  const primaTesto = d ? (d.prima_dal === d.prima_al ? dataBreve(d.prima_dal, true) : `${dataBreve(d.prima_dal)} – ${dataBreve(d.prima_al)}`) : "";

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <RicetteNav current="piatti" />
      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 font-playfair">Piatti che vanno</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Porzioni uscite dalla cassa{d ? ` · ${periodoTesto}` : ""}{d?.dati_fino_al ? ` · dati fino a ${dataBreve(d.dati_fino_al, true)}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {PERIODI.map((p) => <Chip key={p.giorni} attivo={giorni === p.giorni} onClick={() => setGiorni(p.giorni)}>{p.label}</Chip>)}
          <span className="w-px bg-neutral-300 mx-1 hidden sm:block" />
          {TURNI.map((t) => <Chip key={t.k} attivo={turno === t.k} onClick={() => setTurno(t.k)}>{t.label}</Chip>)}
        </div>

        {errore && <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3">{errore}</div>}
        {!d && !errore && <div className="py-12 text-center text-sm text-neutral-400">Carico…</div>}

        {d && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                ["Porzioni", num(d.porzioni)],
                ["Servizi", num(d.servizi), d.servizi_prima ? `prima ${d.servizi_prima}` : null],
                ["Coperti", num(d.coperti)],
                ["Porzioni a coperto", num(d.porzioni_per_coperto)],
              ].map(([l, v, sotto]) => (
                <div key={l} className="rounded-xl bg-white border border-neutral-200 px-3 py-2.5">
                  <div className="text-xs font-bold text-neutral-500">{l}</div>
                  <div className="text-2xl font-bold text-neutral-900 tabular-nums">{v}</div>
                  {sotto && <div className="text-xs text-neutral-500">{sotto}</div>}
                </div>
              ))}
            </div>
            <p className="text-xs text-neutral-500">
              Frecce: rispetto a {primaTesto}, a parità di servizi. Tocca un piatto per vederlo giorno per giorno.
            </p>

            {d.porzioni === 0 ? (
              <div className="rounded-2xl bg-white border border-neutral-200 p-6 text-center text-sm text-neutral-500">
                Nessun piatto in questo periodo{turno !== "tutti" ? ` a ${turno}` : ""}.
              </div>
            ) : (
              <>
                {giorni > 1 && (
                  <div className="grid gap-3 md:grid-cols-3">
                    <Elenco titolo="In crescita" tono="text-emerald-700" voci={d.in_crescita} vuoto="Nessun piatto in forte crescita."
                      destra={(p) => <span className="font-bold text-emerald-700">↑ {p.variazione}%</span>} />
                    <Elenco titolo="In calo" tono="text-red-700" voci={d.in_calo} vuoto="Nessun piatto in forte calo."
                      destra={(p) => <span className="font-bold text-red-700">↓ {Math.abs(p.variazione)}%</span>} />
                    <Elenco titolo="Non usciti più" tono="text-neutral-500" voci={d.spariti} vuoto="Tutti i piatti di prima sono usciti ancora."
                      destra={(p) => <span className="text-neutral-500">prima {num(p.porzioni_prima)}</span>} />
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2 items-start">
                  {d.tipi.map((g) => (
                    <Tipo key={g.k} g={g} dal={d.dal} al={d.al} turno={turno} aperto={aperto} setAperto={setAperto} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
