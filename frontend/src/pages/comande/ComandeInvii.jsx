// @version: v1.0 — cosa è partito verso i reparti (quello che il ponte stamperà) (2026-11-24)
// Modulo: comande
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Btn, EmptyState, PageLayout } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import ComandeNav, { BannerProva } from "./ComandeNav";
import { api, nomeUscita } from "./comandeApi";

const TIPO = {
  comanda: { label: "Comanda", cls: "bg-rose-100 text-rose-900" },
  via: { label: "Via", cls: "bg-emerald-100 text-emerald-900" },
  storno: { label: "Storno", cls: "bg-red-100 text-red-800" },
};

export default function ComandeInvii() {
  const [reparti, setReparti] = useState([]);
  const [reparto, setReparto] = useState("");
  const [invii, setInvii] = useState(null);
  const [errore, setErrore] = useState(null);

  const carica = useCallback(async () => {
    try {
      const q = reparto ? `?reparto=${encodeURIComponent(reparto)}` : "";
      setInvii(await api(`/comande/invii/${q}`));
      setErrore(null);
    } catch (e) {
      setErrore(e.message);
    }
  }, [reparto]);

  useEffect(() => {
    api("/comande/impostazioni/").then((d) => setReparti(d.reparti || [])).catch(() => {});
  }, []);
  useEffect(() => {
    carica();
  }, [carica]);

  const nomeReparto = (k) => (reparti.find((r) => r.key === k) || {}).nome || k;

  return (
    <PageLayout
      nav={<ComandeNav current="invii" />}
      title="Invii ai reparti"
      subtitle="Quello che uscirà sulle stampanti comande quando ci sarà il ponte"
      actions={<Btn variant="secondary" onClick={carica}>↻ Aggiorna</Btn>}
    >
      <BannerProva />
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => setReparto("")}
          className={`rounded-full border px-3 py-1.5 text-xs ${!reparto ? "border-brand-ink bg-brand-ink text-white" : "border-neutral-200 bg-white"}`}
        >
          Tutti
        </button>
        {reparti.map((r) => (
          <button
            key={r.key}
            onClick={() => setReparto(r.key)}
            className={`rounded-full border px-3 py-1.5 text-xs ${reparto === r.key ? "border-brand-ink bg-brand-ink text-white" : "border-neutral-200 bg-white"}`}
          >
            {r.nome}
          </button>
        ))}
      </div>
      {errore && <div className="mb-3 text-sm text-red-700">{errore}</div>}
      {!invii && !errore && <TrgbLoader />}
      {invii && invii.length === 0 && <EmptyState icon="🧾" title="Ancora nessun invio" />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(invii || []).map((i) => (
          <div key={i.id} className="rounded-2xl border border-neutral-200 bg-white p-3 font-mono text-sm shadow-sm">
            <div className="mb-1 flex items-center justify-between font-sans">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIPO[i.tipo].cls}`}>
                {TIPO[i.tipo].label}
                {i.tipo === "via" && i.uscita ? ` la ${i.uscita}ª` : ""}
              </span>
              <span className="text-xs text-neutral-500">
                {nomeReparto(i.reparto)} · {String(i.creato_at).slice(11, 16)}
              </span>
            </div>
            <Link to={`/comande/conto/${i.conto_id}`} className="font-sans text-base font-bold text-brand-ink">
              Tavolo {i.tavolo} · 👤 {i.coperti}
            </Link>
            <ul className="mt-1 space-y-0.5">
              {i.righe.map((r) => (
                <li key={r.id}>
                  {r.quantita}× {r.nome}
                  {i.tipo === "comanda" && r.uscita > 0 ? ` — ${nomeUscita(r.uscita)}` : ""}
                  {r.nota ? <div className="pl-5 text-xs text-neutral-600">📝 {r.nota}</div> : null}
                  {r.motivo ? <div className="pl-5 text-xs text-red-700">motivo: {r.motivo}</div> : null}
                </li>
              ))}
            </ul>
            <div className="mt-1 font-sans text-[11px] text-neutral-400">
              {i.creato_da || ""}{i.stampato_at ? ` · stampato ${String(i.stampato_at).slice(11, 16)}` : " · non stampato"}
            </div>
          </div>
        ))}
      </div>
    </PageLayout>
  );
}
