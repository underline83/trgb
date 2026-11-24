// @version: v2.0 — chi è al tavolo: un prenotato, un walk-in, un cliente che c'è già o uno nuovo (2026-11-24)
// Modulo: comande
// La scelta va al conto come `ospite` ({tipo, …}); è il conto che poi sistema Prenotazioni
// (walk-in creato, «Seduto», tavolo), con le funzioni del Planning. Qui si legge soltanto.
import React, { useEffect, useMemo, useState } from "react";
import { TextInput } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import { api } from "./comandeApi";

const NOME_TURNO = { pranzo: "Pranzo", cena: "Cena" };
// Stati che non serve scrivere: una prenotazione confermata è il caso normale.
const STATI_NORMALI = ["RECORDED"];
const CERCA_DA = 2; // lettere da cui si cercano anche i clienti (come nel form di una prenotazione)
const stessoTavolo = (p, tavolo) =>
  !!tavolo && (p.tavoli || []).includes(String(tavolo).trim().toUpperCase());
const RAPIDO = "min-h-[44px] rounded-xl border px-3 text-sm font-semibold";

export const etichettaPrenotazione = (p) => `${p.ora} · ${p.nome} · ${p.pax}`;

// Le scelte, nella forma che vuole il conto (`ospite`) più ciò che serve a mostrarle (`info`).
export const sceltaPrenotazione = (p) => ({
  ospite: { tipo: "prenotazione", prenotazione_id: p.id },
  info: { chiave: `p${p.id}`, nome: p.nome, pax: p.pax, allergie: p.allergie, etichetta: etichettaPrenotazione(p) },
});
export const SCELTA_WALKIN = {
  ospite: { tipo: "walkin" },
  info: { chiave: "walkin", nome: "Walk-in", etichetta: "🚶 Walk-in" },
};
const sceltaCliente = (c) => ({
  ospite: { tipo: "cliente", cliente_id: c.id, etichetta: c.nome },
  info: { chiave: `c${c.id}`, nome: c.nome, allergie: c.allergie, etichetta: `👤 ${c.nome}` },
});

// `tavolo` = il tavolo per cui si sceglie: chi è già seduto a un ALTRO tavolo si vede ma non si
// sceglie (una prenotazione sta su un conto solo: si sposta il conto, non la si sdoppia).
function RigaPrenotazione({ p, tavolo, scelta, onScegli }) {
  const on = scelta === `p${p.id}`;
  const altrove = !!p.conto && p.conto.tavolo !== tavolo;
  return (
    <button
      onClick={() => onScegli(sceltaPrenotazione(p))}
      aria-pressed={on}
      disabled={altrove}
      className={`flex min-h-[52px] w-full items-center gap-3 px-3 py-1.5 text-left ${
        on ? "bg-indigo-50" : altrove ? "" : "hover:bg-neutral-50"
      } ${p.stato === "LEFT" || p.servita || altrove ? "opacity-60" : ""}`}
    >
      <span className="w-12 shrink-0 text-base font-bold tabular-nums text-brand-ink">{p.ora}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-tight text-brand-ink">
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

function RigaCliente({ c, scelta, onScegli }) {
  const on = scelta === `c${c.id}`;
  return (
    <button
      onClick={() => onScegli(sceltaCliente(c))}
      aria-pressed={on}
      className={`flex min-h-[52px] w-full items-center gap-3 px-3 py-1.5 text-left ${on ? "bg-indigo-50" : "hover:bg-neutral-50"}`}
    >
      <span className="w-12 shrink-0 text-center text-lg">👤</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-tight text-brand-ink">
          {c.nome}
          {c.vip ? " ★" : ""}
        </span>
        <span className="block truncate text-xs text-neutral-600">
          {c.visite} {c.visite === 1 ? "visita" : "visite"}
          {c.telefono ? ` · tel. ${c.telefono}` : ""}
          {c.allergie ? " · ⚠ allergie" : ""}
        </span>
      </span>
      {on && <span className="shrink-0 text-lg font-bold text-indigo-700">✓</span>}
    </button>
  );
}

// Chi è al tavolo. In cima le due strade di chi non ha prenotato (walk-in, cliente nuovo); la
// ricerca guarda insieme i prenotati del giorno e i clienti. `scelta` = chiave di ciò che è
// già scelto («p12», «c7», «walkin»). `onScegli({ospite, info})`. `walkin={false}` toglie il tasto
// Walk-in a chi lo mostra già per conto suo (l'apertura del tavolo).
export function ScegliOspite({ data, tavolo, scelta = null, onScegli, walkin = true }) {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [cerca, setCerca] = useState("");
  const [clienti, setClienti] = useState([]);
  const [nuovo, setNuovo] = useState(null); // {cognome, nome, telefono} mentre si scrive un cliente nuovo

  useEffect(() => {
    let vivo = true;
    api(`/comande/prenotazioni/${data ? `?data=${encodeURIComponent(data)}` : ""}`)
      .then((d) => vivo && setDati(d))
      .catch((e) => vivo && setErrore(e.message));
    return () => {
      vivo = false;
    };
  }, [data]);

  // I clienti si cercano mentre si scrive, con un attimo di attesa fra un tasto e l'altro.
  useEffect(() => {
    const q = cerca.trim();
    if (q.length < CERCA_DA) {
      setClienti([]);
      return undefined;
    }
    let vivo = true;
    const t = setTimeout(() => {
      api(`/comande/clienti/?q=${encodeURIComponent(q)}`)
        .then((r) => vivo && setClienti(r))
        .catch(() => vivo && setClienti([]));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [cerca]);

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
      { titolo: "Prenotati su questo tavolo", righe: qui },
      { titolo: `Prenotati · ${NOME_TURNO[dati.turno] || dati.turno}`, righe: altre.filter((p) => p.turno === dati.turno) },
      { titolo: `Prenotati · ${NOME_TURNO[altroTurno] || altroTurno}`, righe: altre.filter((p) => p.turno !== dati.turno) },
    ].filter((g) => g.righe.length > 0);
  }, [dati, cerca, tavolo]);

  if (errore) return <div className="text-sm text-red-700">{errore}</div>;
  if (!dati) return <TrgbLoader />;

  if (nuovo) {
    const pronto = nuovo.cognome.trim().length > 0;
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold text-brand-ink">Cliente nuovo</div>
        <TextInput value={nuovo.cognome} onChange={(v) => setNuovo({ ...nuovo, cognome: v })} placeholder="Cognome" />
        <TextInput value={nuovo.nome} onChange={(v) => setNuovo({ ...nuovo, nome: v })} placeholder="Nome (se lo sai)" />
        <TextInput value={nuovo.telefono} onChange={(v) => setNuovo({ ...nuovo, telefono: v })} placeholder="Telefono (se lo dà)" inputMode="tel" />
        {clienti.length > 0 && (
          <p className="text-xs text-amber-800">
            Guarda prima se c'è già: {clienti.slice(0, 3).map((c) => c.nome).join(", ")}
            {clienti.length > 3 ? "…" : ""}
          </p>
        )}
        <div className="flex gap-2">
          <button className={`${RAPIDO} border-neutral-300 bg-white text-brand-ink`} onClick={() => setNuovo(null)}>Indietro</button>
          <button
            disabled={!pronto}
            className={`${RAPIDO} flex-1 border-brand-blue bg-brand-blue text-white disabled:opacity-50`}
            onClick={() => {
              const cognome = nuovo.cognome.trim();
              const nome = nuovo.nome.trim();
              onScegli({
                ospite: { tipo: "nuovo", cognome, nome: nome || null, telefono: nuovo.telefono.trim() || null },
                info: { chiave: "nuovo", nome: `${cognome} ${nome}`.trim(), etichetta: `👤 ${cognome} ${nome}`.trim() },
              });
            }}
          >
            Crea il cliente e mettilo al tavolo
          </button>
        </div>
      </div>
    );
  }

  const vuoto = gruppi.length === 0 && clienti.length === 0;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {walkin && (
          <button
            aria-pressed={scelta === "walkin"}
            className={`${RAPIDO} ${scelta === "walkin" ? "border-brand-ink bg-brand-ink text-white" : "border-neutral-300 bg-white text-brand-ink"}`}
            onClick={() => onScegli(SCELTA_WALKIN)}
          >
            🚶 Walk-in
          </button>
        )}
        {dati.aggiorna && (
          <button
            className={`${RAPIDO} border-neutral-300 bg-white text-brand-ink`}
            onClick={() => setNuovo({ cognome: cerca.trim(), nome: "", telefono: "" })}
          >
            ＋ Cliente nuovo
          </button>
        )}
      </div>
      <TextInput value={cerca} onChange={setCerca} placeholder="Cerca un prenotato o un cliente" />
      <div className="mt-2 max-h-[44vh] overflow-y-auto rounded-2xl border border-neutral-200 bg-white">
        {vuoto && (
          <div className="p-4 text-center text-sm text-neutral-500">
            {cerca.trim() ? "Nessun prenotato e nessun cliente con questo nome" : "Nessuna prenotazione per questo giorno"}
          </div>
        )}
        {gruppi.map((g) => (
          <div key={g.titolo}>
            <div className="sticky top-0 bg-neutral-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-600">
              {g.titolo} · {g.righe.length}
            </div>
            <div className="divide-y divide-neutral-100">
              {g.righe.map((p) => (
                <RigaPrenotazione key={p.id} p={p} tavolo={tavolo} scelta={scelta} onScegli={onScegli} />
              ))}
            </div>
          </div>
        ))}
        {clienti.length > 0 && (
          <div>
            <div className="sticky top-0 bg-neutral-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-600">
              Clienti, senza prenotazione · {clienti.length}
            </div>
            <div className="divide-y divide-neutral-100">
              {clienti.map((c) => (
                <RigaCliente key={c.id} c={c} scelta={scelta} onScegli={onScegli} />
              ))}
            </div>
          </div>
        )}
      </div>
      {!cerca.trim() && (
        <p className="mt-1 text-[11px] text-neutral-500">Si cerca per nome, telefono o tavolo. Per un cliente che non ha prenotato, scrivi il nome.</p>
      )}
    </div>
  );
}

// Chi è al tavolo, con quello che la sala deve sapere: allergie in evidenza, note, occasione.
// `conto` porta la prenotazione riletta dal server (`prenotazione`), il nome scritto sul conto
// (`ospite`) e se la prenotazione è nata dal conto (`pren_creata`: è entrato senza prenotare).
export function SchedaOspite({ conto, onApri }) {
  const p = conto.prenotazione;
  if (!p && !conto.ospite) return null;
  const senzaPrenotare = !!conto.pren_creata || !conto.prenotazione_id;
  return (
    <div className="mb-2 shrink-0 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-950">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 leading-tight">
          <span className="font-semibold">
            {conto.ospite || (p ? p.nome : "")}
            {p && p.vip ? " ★" : ""}
          </span>
          {senzaPrenotare ? (
            <span> · senza prenotazione{p ? `, dalle ${p.ora}` : ""}</span>
          ) : p ? (
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
