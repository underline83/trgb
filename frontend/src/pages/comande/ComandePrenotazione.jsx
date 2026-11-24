// @version: v1.0 — chi è al tavolo: scelta fra le prenotazioni del giorno e scheda di quella legata (2026-11-24)
// Modulo: comande
// Le prenotazioni si leggono soltanto (GET /comande/prenotazioni/): legare un tavolo non cambia
// niente nel modulo Prenotazioni.
import React, { useEffect, useMemo, useState } from "react";
import { TextInput } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import { api } from "./comandeApi";

const NOME_TURNO = { pranzo: "Pranzo", cena: "Cena" };
// Stati che non serve scrivere: una prenotazione confermata è il caso normale.
const STATI_NORMALI = ["RECORDED"];
const stessoTavolo = (p, tavolo) =>
  !!tavolo && (p.tavoli || []).includes(String(tavolo).trim().toUpperCase());

export const etichettaPrenotazione = (p) => `${p.ora} · ${p.nome} · ${p.pax}`;

function Riga({ p, scelta, onScegli }) {
  const on = scelta === p.id;
  return (
    <button
      onClick={() => onScegli(p)}
      aria-pressed={on}
      className={`flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left ${
        on ? "bg-indigo-50" : "hover:bg-neutral-50"
      } ${p.stato === "LEFT" || p.servita ? "opacity-60" : ""}`}
    >
      <span className="w-12 shrink-0 text-base font-bold tabular-nums text-brand-ink">{p.ora}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-brand-ink">
          {p.nome}
          {p.vip ? " ★" : ""}
        </span>
        <span className="block truncate text-xs text-neutral-600">
          {p.pax} {p.pax === 1 ? "persona" : "persone"}
          {p.tavolo ? ` · tavolo ${p.tavolo}` : " · senza tavolo"}
          {!STATI_NORMALI.includes(p.stato) ? ` · ${p.stato_etichetta}` : ""}
          {p.allergie ? " · ⚠ allergie" : ""}
        </span>
      </span>
      {p.conto && (
        <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-900">
          al tavolo {p.conto.tavolo}
        </span>
      )}
      {p.servita && (
        <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-600">
          conto chiuso
        </span>
      )}
      {on && <span className="shrink-0 text-lg font-bold text-indigo-700">✓</span>}
    </button>
  );
}

// Elenco delle prenotazioni di un giorno: prima quelle scritte su questo tavolo, poi il turno
// in corso, poi l'altro. `scelta` = id della prenotazione già legata (se c'è).
export function ScegliPrenotazione({ data, tavolo, scelta = null, onScegli }) {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [cerca, setCerca] = useState("");

  useEffect(() => {
    let vivo = true;
    api(`/comande/prenotazioni/${data ? `?data=${encodeURIComponent(data)}` : ""}`)
      .then((d) => vivo && setDati(d))
      .catch((e) => vivo && setErrore(e.message));
    return () => {
      vivo = false;
    };
  }, [data]);

  const gruppi = useMemo(() => {
    if (!dati) return [];
    const q = cerca.trim().toLowerCase();
    const tutte = dati.prenotazioni.filter(
      (p) => !q || `${p.nome} ${p.tavolo} ${p.ora}`.toLowerCase().includes(q)
    );
    const qui = tutte.filter((p) => stessoTavolo(p, tavolo));
    const altre = tutte.filter((p) => !stessoTavolo(p, tavolo));
    const altroTurno = dati.turno === "pranzo" ? "cena" : "pranzo";
    return [
      { titolo: `Su questo tavolo`, righe: qui },
      { titolo: NOME_TURNO[dati.turno] || dati.turno, righe: altre.filter((p) => p.turno === dati.turno) },
      { titolo: NOME_TURNO[altroTurno] || altroTurno, righe: altre.filter((p) => p.turno !== dati.turno) },
    ].filter((g) => g.righe.length > 0);
  }, [dati, cerca, tavolo]);

  if (errore) return <div className="text-sm text-red-700">{errore}</div>;
  if (!dati) return <TrgbLoader />;
  if (dati.prenotazioni.length === 0) {
    return <p className="text-sm text-neutral-600">Nessuna prenotazione per questo giorno.</p>;
  }
  return (
    <div>
      <TextInput value={cerca} onChange={setCerca} placeholder="Cerca per nome, ora o tavolo…" />
      <div className="mt-2 max-h-[46vh] overflow-y-auto rounded-2xl border border-neutral-200 bg-white">
        {gruppi.length === 0 && <div className="p-4 text-center text-sm text-neutral-500">Niente trovato</div>}
        {gruppi.map((g) => (
          <div key={g.titolo}>
            <div className="sticky top-0 bg-neutral-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-600">
              {g.titolo} · {g.righe.length}
            </div>
            <div className="divide-y divide-neutral-100">
              {g.righe.map((p) => (
                <Riga key={p.id} p={p} scelta={scelta} onScegli={onScegli} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Chi è al tavolo, con quello che la sala deve sapere: allergie in evidenza, note, occasione.
// `p` è la prenotazione riletta dal server; se non c'è più resta il nome scritto sul conto.
export function SchedaPrenotazione({ p, ospite, onApri }) {
  if (!p && !ospite) return null;
  return (
    <div className="mb-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="font-semibold">
            {p ? p.nome : ospite}
            {p && p.vip ? " ★" : ""}
          </span>
          {p ? (
            <span>
              {" "}· prenotato alle {p.ora} per {p.pax}
              {!STATI_NORMALI.includes(p.stato) ? ` · ${p.stato_etichetta}` : ""}
            </span>
          ) : (
            <span> · la prenotazione non c'è più</span>
          )}
        </div>
        {onApri && (
          <button
            onClick={onApri}
            className="min-h-[44px] shrink-0 rounded-lg border border-indigo-300 bg-white px-3 text-xs font-semibold text-indigo-900"
          >
            Cambia
          </button>
        )}
      </div>
      {p && p.allergie && (
        <div className="mt-1 rounded-lg bg-red-100 px-2 py-1 font-semibold text-red-900">⚠ Allergie: {p.allergie}</div>
      )}
      {p && p.nota && <div className="mt-1">📝 {p.nota}</div>}
      {p && p.nota_cliente && <div className="mt-1">💬 Dal cliente: {p.nota_cliente}</div>}
      {p && (p.occasione || p.seggioloni > 0) && (
        <div className="mt-1 text-xs">
          {p.occasione ? `Occasione: ${p.occasione}` : ""}
          {p.occasione && p.seggioloni > 0 ? " · " : ""}
          {p.seggioloni > 0 ? `${p.seggioloni} ${p.seggioloni === 1 ? "seggiolone" : "seggioloni"}` : ""}
        </div>
      )}
    </div>
  );
}
