// @version: v1.2 — 👥 su ogni giorno: chi è di turno a pranzo e a cena (capo sala, chef, admin) (2026-11-26); v1.1 — «Pranzo» e «Cena» scritti per intero (P e C solo sul telefono) (2026-11-26); v1.0 — il mese a colpo d'occhio, al posto della vista settimanale (Marco 2026-11-26: «la settimanale serve a poco»)
// Modulo: prenotazioni
// Per ogni giorno: coperti di pranzo e cena sulla capienza (barra), prenotazioni, opzioni, chiusure.
// Un tocco su pranzo o cena apre la vista Servizio di quel turno; il numero del giorno apre il Planning.
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";
import { TastoTestata, TitoloTestata } from "./components/Testata";

const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const giornoLocale = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Turno({ etichetta, count, pax, capienza, chiuso, motivo, onClick }) {
  if (chiuso && !count) {
    return <div className="rounded-md px-1.5 py-1 text-[11px] text-neutral-600 bg-neutral-100 truncate" title={motivo || "Chiuso"}><span className="sm:hidden">{etichetta[0]}</span><span className="hidden sm:inline">{etichetta}</span> · {etichetta === "Cena" ? "chiusa" : "chiuso"}</div>;
  }
  const pct = capienza ? Math.min(100, Math.round((pax / capienza) * 100)) : 0;
  const pieno = capienza > 0 && pax >= capienza;
  return (
    <button type="button" onClick={onClick}
      title={`${etichetta}: ${count} prenotazioni, ${pax} coperti${capienza ? ` su ${capienza}` : ""}`}
      className={`w-full text-left rounded-md border px-1.5 py-1 min-h-[30px] sm:min-h-[34px] transition hover:border-indigo-500 ${
        pax ? "bg-white border-indigo-200" : "bg-white border-neutral-200"}`}>
      <span className="flex items-baseline justify-between gap-1 tabular-nums">
        <span className="text-[10px] sm:text-[11px] font-semibold text-neutral-600"><span className="sm:hidden">{etichetta[0]}</span><span className="hidden sm:inline">{etichetta}</span></span>
        <span className={`text-xs sm:text-[13px] font-semibold ${pax ? (pieno ? "text-red-700" : "text-indigo-900") : "text-neutral-400"}`}>
          {pax || "—"}<span className="hidden sm:inline font-normal text-neutral-500">{pax && capienza ? `/${capienza}` : ""}</span>
        </span>
      </span>
      <span aria-hidden="true" className="block h-1 mt-0.5 rounded-lg bg-neutral-100 overflow-hidden">
        <span className={`block h-full rounded-lg ${pieno ? "bg-red-600" : "bg-indigo-900"}`} style={{ width: `${pct}%` }} />
      </span>
    </button>
  );
}

// Chi può vedere chi è di turno (Marco 2026-11-26): capo sala, chef, admin. Il server controlla comunque.
const VEDE_TURNI = ["admin", "superadmin", "capo_sala", "chef"];

function ColonnaTurni({ titolo, voci, chiuso }) {
  const perReparto = new Map();
  for (const v of voci) { if (!perReparto.has(v.reparto)) perReparto.set(v.reparto, []); perReparto.get(v.reparto).push(v); }
  return (
    <div className="flex-1 min-w-0">
      <div className="text-sm font-bold text-neutral-900 mb-1.5">{titolo} <span className="font-normal text-neutral-500">· {voci.length}</span></div>
      {chiuso && <div className="text-xs text-neutral-600 mb-1.5">Servizio chiuso{typeof chiuso === "string" && chiuso ? ` · ${chiuso}` : ""}</div>}
      {!voci.length ? <div className="text-sm text-neutral-500">Nessuno in turno</div> : [...perReparto.entries()].map(([rep, lista]) => (
        <div key={rep} className="mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-0.5">{rep}</div>
          {lista.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-2 py-1 border-b border-neutral-100 text-sm">
              <span className="flex items-center gap-1.5 min-w-0">
                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: v.colore || "#a3a3a3" }} />
                <span className="truncate text-neutral-900">{v.nome}</span>
                {v.da_confermare && <span className="text-[10px] font-semibold text-amber-700 flex-shrink-0">da confermare</span>}
              </span>
              <span className="tabular-nums text-neutral-600 flex-shrink-0">{v.ora_inizio}{v.ora_fine ? `–${v.ora_fine}` : ""}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TurniDelGiorno({ data, onChiudi }) {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  useEffect(() => {
    apiFetch(`${API_BASE}/turni/giorno?data=${data}`)
      .then(async (r) => { if (r.ok) setDati(await r.json()); else { const e = await r.json().catch(() => ({})); setErrore(e.detail || "Turni non leggibili"); } })
      .catch(() => setErrore("Errore di connessione"));
  }, [data]);
  const titolo = new Date(`${data}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-start justify-center p-0 sm:p-4 overflow-y-auto" onClick={onChiudi}>
      <div role="dialog" aria-label={`Chi è di turno ${titolo}`} className="bg-white w-full sm:max-w-xl sm:rounded-2xl shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Chi è di turno</div>
            <TitoloTestata>{titolo}</TitoloTestata>
          </div>
          <TastoTestata onClick={onChiudi} aria-label="Chiudi">✕</TastoTestata>
        </div>
        {errore ? <div className="text-sm text-red-700">{errore}</div>
          : !dati ? <div className="text-sm text-neutral-500 py-6 text-center">Caricamento…</div>
          : (
            <>
              <div className="flex flex-col sm:flex-row gap-4">
                <ColonnaTurni titolo="Pranzo" voci={dati.pranzo} chiuso={dati.chiuso?.pranzo} />
                <ColonnaTurni titolo="Cena" voci={dati.cena} chiuso={dati.chiuso?.cena} />
              </div>
              {dati.altro?.length > 0 && <div className="mt-3"><ColonnaTurni titolo="Altri turni" voci={dati.altro} /></div>}
            </>
          )}
      </div>
    </div>
  );
}

export default function PrenotazioniMese() {
  const { anno: pAnno, mese: pMese } = useParams();
  const navigate = useNavigate();
  const adesso = new Date();
  const [anno, setAnno] = useState(Number(pAnno) || adesso.getFullYear());
  const [mese, setMese] = useState(Number(pMese) || adesso.getMonth() + 1);
  const [dati, setDati] = useState(null);
  const [loading, setLoading] = useState(true);
  const oggi = giornoLocale();
  const [turniDi, setTurniDi] = useState(null);   // giorno di cui si guardano i turni del personale
  const vedeTurni = VEDE_TURNI.includes(localStorage.getItem("role"));

  useEffect(() => {
    setLoading(true);
    apiFetch(`${API_BASE}/prenotazioni/mese/${anno}/${mese}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setDati(d); setLoading(false); })
      .catch(() => { setDati(null); setLoading(false); });
    navigate(`/prenotazioni/mese/${anno}/${mese}`, { replace: true });
  }, [anno, mese]); // eslint-disable-line react-hooks/exhaustive-deps

  const sposta = (n) => {
    const d = new Date(anno, mese - 1 + n, 1);
    setAnno(d.getFullYear()); setMese(d.getMonth() + 1);
  };
  const titolo = new Date(anno, mese - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const questoMese = anno === adesso.getFullYear() && mese === adesso.getMonth() + 1;

  return (
    <div className="min-h-screen bg-brand-cream">
      <PrenotazioniNav current="mese" />
      <div className="max-w-7xl mx-auto px-2 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <TastoTestata onClick={() => sposta(-1)} aria-label="Mese prima">◀</TastoTestata>
            <TitoloTestata className="min-w-[9.5rem] text-center">{titolo}</TitoloTestata>
            <TastoTestata onClick={() => sposta(1)} aria-label="Mese dopo">▶</TastoTestata>
            {!questoMese && <TastoTestata onClick={() => { setAnno(adesso.getFullYear()); setMese(adesso.getMonth() + 1); }}>Questo mese</TastoTestata>}
          </div>
          {dati && <span className="text-sm text-neutral-700">{dati.totale_prenotazioni} prenotazioni · {dati.totale_coperti} coperti nel mese</span>}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1">
          {GIORNI.map((g) => <div key={g} className="text-center text-[11px] sm:text-xs font-semibold text-neutral-500 uppercase">{g}</div>)}
        </div>

        {loading && !dati ? (
          <div className="text-center py-12 text-neutral-500">Caricamento…</div>
        ) : !dati ? (
          <div className="text-center py-12 text-neutral-500">Errore nel caricamento</div>
        ) : (
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {dati.giorni.map((g) => {
              const eOggi = g.data === oggi;
              const n = Number(g.data.slice(8));
              return (
                <div key={g.data}
                  className={`rounded-lg sm:rounded-xl border p-1 sm:p-2 flex flex-col gap-1 min-h-[92px] sm:min-h-[100px] ${
                    !g.nel_mese ? "bg-transparent border-transparent opacity-40"
                    : g.chiuso ? "bg-neutral-100 border-neutral-200"
                    : eOggi ? "bg-indigo-50 border-indigo-500 ring-2 ring-indigo-200" : "bg-white border-neutral-200"}`}>
                  <div className="flex items-baseline justify-between gap-1">
                    <button type="button" onClick={() => navigate(`/prenotazioni/planning/${g.data}`)} title="Apri il Planning del giorno"
                      className={`text-sm sm:text-base font-bold leading-none px-1 py-0.5 rounded-lg hover:bg-indigo-100 ${eOggi ? "text-indigo-800" : "text-neutral-800"}`}>{n}</button>
                    <span className="flex items-center gap-1 min-w-0">
                      {g.opzione_pax > 0 && <span className="text-[10px] font-semibold text-amber-700 truncate" title="Coperti in opzione: tavolo tenuto, non ancora confermato">+{g.opzione_pax} opz.</span>}
                      {vedeTurni && g.nel_mese && (
                        <button type="button" onClick={() => setTurniDi(g.data)} title="Chi è di turno questo giorno" aria-label={`Chi è di turno il ${n}`}
                          className="w-7 h-7 -my-1 -mr-0.5 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 flex items-center justify-center flex-shrink-0">
                          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17 14.2c2.7.3 4.5 2.4 4.5 5.3" /></svg>
                        </button>
                      )}
                    </span>
                  </div>
                  {g.chiuso && !(g.pranzo_count + g.cena_count) ? (
                    <div className="text-[11px] text-neutral-500 px-1 truncate" title={g.motivo_chiusura || ""}>Chiuso{g.motivo_chiusura ? <span className="hidden sm:inline"> · {g.motivo_chiusura}</span> : ""}</div>
                  ) : (
                    <>
                      <Turno etichetta="Pranzo" count={g.pranzo_count} pax={g.pranzo_pax} capienza={g.capienza_pranzo} chiuso={g.pranzo_chiuso}
                        motivo={g.motivo_chiusura} onClick={() => navigate(`/prenotazioni/servizio/${g.data}/pranzo`)} />
                      <Turno etichetta="Cena" count={g.cena_count} pax={g.cena_pax} capienza={g.capienza_cena} chiuso={g.cena_chiuso}
                        motivo={g.motivo_chiusura} onClick={() => navigate(`/prenotazioni/servizio/${g.data}/cena`)} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 text-xs text-neutral-600">
          Coperti prenotati e barra sulla capienza del turno (rossa quando è pieno). Tocca un turno per aprirlo in «Servizio», il numero del giorno per l'Elenco{vedeTurni ? ", le due figurine per vedere chi è di turno" : ""}.
        </div>
        {turniDi && <TurniDelGiorno data={turniDi} onChiudi={() => setTurniDi(null)} />}
      </div>
    </div>
  );
}
