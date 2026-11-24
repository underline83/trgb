// Modulo: platform (mattone M.A notifiche — push sui dispositivi) — [core]
// @version: v1.0 (2026-11-24) — riquadro «Notifiche su questo dispositivo» nel pannello del campanello
//
// Fase 1: ognuno attiva le notifiche sul proprio dispositivo, le prova e le spegne.
// Tutta la logica sta in utils/push.js (l'unico punto che parla con le push).

import React, { useCallback, useEffect, useState } from "react";
import { Btn } from "./ui";
import { statoPush, attivaPush, disattivaPush, provaPush, togliDispositivo } from "../utils/push";

const PERCHE_NO = {
  home: "Su iPhone e iPad apri TRGB dall'icona sulla schermata Home: da lì si possono attivare.",
  non_supportate: "Questo browser non supporta le notifiche.",
  bloccate: "Le notifiche di TRGB sono bloccate nelle impostazioni di questo dispositivo.",
};

function quando(testo) {
  if (!testo) return null;
  const d = new Date(testo.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("it-IT", { day: "numeric", month: "numeric" });
}

export default function NotifichePush() {
  const [stato, setStato] = useState(null);
  const [lavoro, setLavoro] = useState(false);
  const [messaggio, setMessaggio] = useState(null); // { tono: "ok" | "errore", testo }
  const [aperto, setAperto] = useState(false);

  // «Vedi come»: si sta guardando l'app con gli occhi di un altro utente, il dispositivo
  // finirebbe registrato a suo nome.
  const vediCome = !!localStorage.getItem("vedi_come");

  const carica = useCallback(async () => {
    try {
      setStato(await statoPush());
    } catch (e) {
      setStato({ attive: false, motivo: "errore", errore: e.message, dispositivi: [], questo: null });
    }
  }, []);

  useEffect(() => {
    if (!vediCome) carica();
  }, [carica, vediCome]);

  const fai = async (azione, fatto) => {
    setLavoro(true);
    setMessaggio(null);
    try {
      const esito = await azione();
      const testo = typeof fatto === "function" ? fatto(esito) : fatto;
      if (testo) setMessaggio(testo);
    } catch (e) {
      setMessaggio({ tono: "errore", testo: e.message || "Non riuscito." });
    }
    await carica();
    setLavoro(false);
  };

  const dopoProva = (e) => {
    if (!e || e.dispositivi === 0) return { tono: "errore", testo: "Nessun dispositivo acceso a cui mandarla." };
    if (e.mandate > 0 && e.fallite === 0) {
      return { tono: "ok", testo: `Mandata a ${e.mandate} ${e.mandate === 1 ? "dispositivo" : "dispositivi"}: arriva fra qualche secondo.` };
    }
    const primo = e.errori && e.errori[0] ? ` (${e.errori[0].errore})` : "";
    return { tono: "errore", testo: `Mandate ${e.mandate}, non riuscite ${e.fallite}${primo}.` };
  };

  if (vediCome || !stato) return null;

  const altri = (stato.dispositivi || []).filter((d) => !stato.questo || d.id !== stato.questo.id);
  const spiegazione = stato.motivo === "server" || stato.motivo === "errore" ? stato.errore : PERCHE_NO[stato.motivo];

  return (
    <div className="border-t border-neutral-100 px-4 py-3 bg-brand-cream/60">
      <div className="flex items-center gap-2">
        <span className="text-sm" aria-hidden="true">📲</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-brand-ink">Notifiche su questo dispositivo</div>
          <div className={`text-[11px] ${stato.attive ? "text-brand-green" : "text-neutral-500"}`}>
            {stato.attive ? "Attive" : "Spente"}
          </div>
        </div>
        {!stato.motivo && !stato.attive && (
          <Btn size="sm" loading={lavoro} onClick={() => fai(() => attivaPush(), { tono: "ok", testo: "Attivate. Tocca «Prova» per vederne una." })}>
            Attiva
          </Btn>
        )}
        {stato.attive && (
          <>
            <Btn size="sm" variant="secondary" loading={lavoro} onClick={() => fai(provaPush, dopoProva)}>
              Prova
            </Btn>
            <Btn size="sm" variant="ghost" disabled={lavoro} onClick={() => fai(disattivaPush, null)}>
              Spegni
            </Btn>
          </>
        )}
      </div>

      {spiegazione && <div className="text-[11px] text-neutral-500 mt-1.5">{spiegazione}</div>}
      {messaggio && (
        <div className={`text-[11px] mt-1.5 ${messaggio.tono === "ok" ? "text-brand-green" : "text-brand-red"}`}>
          {messaggio.testo}
        </div>
      )}

      {altri.length > 0 && (
        <div className="mt-1.5">
          <button onClick={() => setAperto((v) => !v)} className="text-[11px] text-brand-blue hover:underline">
            {aperto ? "Nascondi" : `Altri miei dispositivi (${altri.length})`}
          </button>
          {aperto && altri.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-[11px] text-neutral-600 mt-1">
              <span className="flex-1 min-w-0 truncate">
                {d.nome}
                <span className="text-neutral-400">
                  {d.attivo ? "" : " · spento"}
                  {quando(d.ultimo_ok) ? ` · ultima il ${quando(d.ultimo_ok)}` : ""}
                </span>
              </span>
              <button
                disabled={lavoro}
                onClick={() => fai(() => togliDispositivo(d.id), null)}
                className="text-neutral-400 hover:text-brand-red"
              >
                Togli
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
