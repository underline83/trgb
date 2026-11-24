// @version: v2.3 — stato di stampa di ogni invio, «Ristampa», avviso se la stampa è ferma; 2.0: uscite e chiamate (2026-11-24)
// Modulo: comande
// Quello che è partito verso i reparti e com'è andata la stampa (ponte di stampa, mattone M.M).
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Btn, EmptyState, PageLayout } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import ComandeNav, { BannerProva } from "./ComandeNav";
import { AvvisoStampaFerma } from "./ComandeStampa";
import { api, nomeUscita } from "./comandeApi";

const TIPO = {
  comanda: { label: "Comanda", cls: "bg-rose-100 text-rose-900" },
  storno: { label: "Storno", cls: "bg-red-100 text-red-800" },
};
// Le chiamate su un'uscita già inviata (invii di tipo «via»).
const AZIONE = {
  vai: { label: "Vai con la preparazione", cls: "bg-emerald-100 text-emerald-900" },
  attendi: { label: "Attendi", cls: "bg-blue-100 text-blue-900" },
  sollecito: { label: "Sollecito", cls: "bg-amber-100 text-amber-900" },
};
// Come dire la stampa di un invio (i.stampa = {stato, testo} dal server).
const STAMPA = { stampato: "text-emerald-700", attesa: "text-blue-700", errore: "text-red-700", scaduta: "text-red-700", spenta: "text-neutral-500" };
const RILEGGI_IN_STAMPA_MS = 3000;
const etichetta = (i) => (i.tipo === "via" ? AZIONE[i.azione] || AZIONE.vai : TIPO[i.tipo] || TIPO.comanda);

// Le righe di una comanda raggruppate per uscita, in ordine: [[numero, righe], …]
function perUscita(righe) {
  const m = new Map();
  righe.forEach((r) => {
    const n = r.uscita ?? 0;
    if (!m.has(n)) m.set(n, []);
    m.get(n).push(r);
  });
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

function Riga({ r }) {
  return (
    <li>
      {r.quantita}× {r.nome}
      {r.nota ? <div className="pl-5 text-xs text-neutral-600">📝 {r.nota}</div> : null}
      {r.motivo ? <div className="pl-5 text-xs text-red-700">motivo: {r.motivo}</div> : null}
    </li>
  );
}

export default function ComandeInvii() {
  const [reparti, setReparti] = useState([]);
  const [reparto, setReparto] = useState("");
  const [invii, setInvii] = useState(null);
  const [errore, setErrore] = useState(null);
  const [ponte, setPonte] = useState(null);
  const [ristampo, setRistampo] = useState(null);

  const carica = useCallback(async () => {
    try {
      const q = reparto ? `?reparto=${encodeURIComponent(reparto)}` : "";
      setInvii(await api(`/comande/invii/${q}`));
      setErrore(null);
    } catch (e) {
      setErrore(e.message);
    }
    api("/ponte/stato/").then(setPonte).catch(() => {});
  }, [reparto]);

  // finché un foglio è «in stampa» si rilegge da soli: così si vede quando esce
  const inStampa = (invii || []).some((i) => i.stampa && (i.stampa.stato === "attesa" || i.stampa.stato === "errore"));
  useEffect(() => {
    if (!inStampa) return undefined;
    const t = setInterval(carica, RILEGGI_IN_STAMPA_MS);
    return () => clearInterval(t);
  }, [inStampa, carica]);

  const ristampa = async (i) => {
    setRistampo(i.id);
    try {
      await api(`/comande/invii/${i.id}/ristampa`, { method: "POST" });
      await carica();
    } catch (e) {
      setErrore(e.message);
    } finally {
      setRistampo(null);
    }
  };

  useEffect(() => {
    api("/comande/impostazioni/").then((d) => setReparti(d.reparti || [])).catch(() => {});
  }, []);
  useEffect(() => {
    carica();
  }, [carica]);

  const nomeReparto = (k) => (reparti.find((r) => r.key === k) || {}).nome || k;
  const chip = (on) =>
    `min-h-[44px] rounded-full border px-4 text-sm ${on ? "border-brand-ink bg-brand-ink text-white" : "border-neutral-200 bg-white"}`;

  return (
    <PageLayout
      nav={<ComandeNav current="invii" />}
      title="Invii ai reparti"
      subtitle="Quello che è partito verso i reparti, e se è uscito dalla stampante"
      actions={<Btn variant="secondary" onClick={carica}>↻ Aggiorna</Btn>}
    >
      <BannerProva />
      <AvvisoStampaFerma stato={ponte} />
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button onClick={() => setReparto("")} className={chip(!reparto)}>Tutti</button>
        {reparti.map((r) => (
          <button key={r.key} onClick={() => setReparto(r.key)} className={chip(reparto === r.key)}>
            {r.nome}
          </button>
        ))}
      </div>
      {errore && <div className="mb-3 text-sm text-red-700">{errore}</div>}
      {!invii && !errore && <TrgbLoader />}
      {invii && invii.length === 0 && <EmptyState icon="🧾" title="Ancora nessun invio" />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(invii || []).map((i) => {
          const e = etichetta(i);
          return (
            <div key={i.id} className="rounded-2xl border border-neutral-200 bg-white p-3 font-mono text-sm shadow-sm">
              <div className="mb-1 flex items-center justify-between gap-2 font-sans">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.cls}`}>
                  {e.label}
                  {i.tipo === "via" && i.uscita ? ` · ${nomeUscita(i.uscita)}` : ""}
                </span>
                <span className="text-xs text-neutral-500">
                  {nomeReparto(i.reparto)} · {String(i.creato_at).slice(11, 16)}
                </span>
              </div>
              <Link to={`/comande/conto/${i.conto_id}`} className="font-sans text-base font-bold text-brand-ink">
                Tavolo {i.tavolo} · 👤 {i.coperti}
              </Link>
              {i.tipo === "comanda" ? (
                perUscita(i.righe).map(([n, righe]) => (
                  <div key={n} className="mt-1.5">
                    <div className="font-sans text-xs font-semibold text-neutral-600">
                      {nomeUscita(n)}
                      {righe[0].va === true && <span className="ml-1 text-emerald-700">· va</span>}
                      {righe[0].va === false && <span className="ml-1 text-blue-700">· attende</span>}
                    </div>
                    <ul className="space-y-0.5">
                      {righe.map((r) => <Riga key={r.id} r={r} />)}
                    </ul>
                  </div>
                ))
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {i.righe.map((r) => <Riga key={r.id} r={r} />)}
                </ul>
              )}
              <div className="mt-2 flex items-center gap-2 border-t border-neutral-100 pt-1.5 font-sans text-xs">
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-neutral-500">{i.creato_da || ""} · </span>
                  <span className={`font-semibold ${STAMPA[(i.stampa || {}).stato] || "text-neutral-500"}`}>{(i.stampa || {}).testo || "non stampato"}</span>
                </span>
                {(i.stampa || {}).stato !== "attesa" && (
                  <button
                    onClick={() => ristampa(i)}
                    disabled={ristampo === i.id}
                    className="min-h-[44px] shrink-0 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-brand-ink disabled:opacity-50"
                  >
                    Ristampa
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PageLayout>
  );
}
