// @version: v1.0 — schermo di cucina: un foglietto per tavolo, scritto come il foglio stampato (2026-11-24)
// Modulo: comande
// Marco, 24/11/2026: «mentalmente deve ricordare molto il foglietto per avere una visione di tutto».
// Pagina a tutto schermo (copre la testata di TRGB) da lasciare aperta su un iPad in cucina.
// Sola lettura: mostra, come la carta. Non segna «pronta» (da decidere con Marco).
// Un foglietto nuovo o cambiato resta bordato di giallo finché non lo si tocca («visto», solo
// su questo schermo). Rilegge da solo; se può tiene acceso lo schermo.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, durata } from "./comandeApi";

// Ogni quanto rilegge. Fisso nel codice come in Tavoli (AGGIORNA_OGNI_MS): se serve va in Impostazioni.
const RILEGGI_OGNI_MS = 10000;
const CARTA = { fontFamily: "'Courier Prime', 'Courier New', Courier, monospace" };

const nomeUscita = (n) => (n === 0 ? "SUBITO" : `USCITA ${n}`);
// Cosa c'è scritto su un foglietto: se cambia, il foglietto è «da guardare»
const firma = (f) =>
  JSON.stringify([f.coperti, f.allergie, f.uscite.map((u) => [u.numero, u.fase, u.solleciti, u.righe.map((r) => [r.id, r.quantita, r.annullata, r.nota, r.varianti])])]);

function Piatto({ r, spento }) {
  const aggiunte = [...(r.varianti || []), r.nota].filter((x) => x && String(x).trim());
  return (
    <div className={`px-3 pt-1.5 ${spento ? "text-neutral-500" : ""}`}>
      <div className={`flex gap-2 font-bold leading-tight ${spento ? "text-[15px]" : "text-[19px]"} ${r.annullata ? "line-through text-neutral-500" : ""}`}>
        <span className="min-w-[1.5rem]">{r.quantita}</span>
        <span className="break-words min-w-0">{r.nome}</span>
      </div>
      {!r.annullata && aggiunte.map((a, i) => (
        <div key={i} className="pl-8 text-[14px] font-bold">** {a}</div>
      ))}
      {r.annullata && (
        <div className="pl-8 text-[13px] font-bold">ANNULLA{r.motivo ? ` · ${r.motivo}` : " · da non fare più"}</div>
      )}
    </div>
  );
}

function Uscita({ u }) {
  const va = u.fase === "va";
  return (
    <div>
      <div className="mx-3 mt-2 border-t-2 border-dashed border-neutral-900" />
      {va ? (
        <div className="bg-neutral-900 text-white text-center font-bold text-[16px] py-1 mt-1.5">{nomeUscita(u.numero)} - VA ADESSO</div>
      ) : u.fase === "attende" ? (
        <div className="text-center font-bold text-[14px] pt-1.5">--- {nomeUscita(u.numero)} attende ---</div>
      ) : u.fase === "annullata" ? (
        <div className="text-center font-bold text-[14px] pt-1.5 text-neutral-500">{nomeUscita(u.numero)} · annullata</div>
      ) : (
        <div className="text-center font-bold text-[14px] pt-1.5 text-neutral-500">{nomeUscita(u.numero)} · andata{u.andata_ora ? ` ${u.andata_ora}` : ""}</div>
      )}
      {va && u.solleciti > 0 && (
        <div className="bg-amber-400 text-neutral-900 text-center font-bold text-[14px] py-1">
          SOLLECITO{u.solleciti > 1 ? ` n. ${u.solleciti}` : ""}{u.sollecitata_ora ? ` · ${u.sollecitata_ora}` : ""}
        </div>
      )}
      {u.righe.map((r) => <Piatto key={r.id} r={r} spento={u.fase === "prima" || u.fase === "annullata"} />)}
    </div>
  );
}

function Foglietto({ f, nuovo, onVisto }) {
  return (
    <button type="button" onClick={onVisto} style={CARTA}
      className={`relative w-[270px] shrink-0 bg-white text-left text-neutral-900 shadow-lg pb-3 ${
        f.sollecito ? "outline outline-4 outline-amber-400" : nuovo ? "outline outline-4 outline-yellow-300" : ""}`}>
      {f.prova && <div className="bg-neutral-900 text-white text-center font-bold text-[13px] py-0.5">PROVA - NON PREPARARE</div>}
      <div className="relative">
        {f.minuti !== null && f.minuti !== undefined && (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-neutral-200 px-2 py-0.5 font-sans text-[12px] font-bold text-neutral-700">{durata(f.minuti)}</span>
        )}
        {nuovo && (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-yellow-300 px-2 py-0.5 font-sans text-[11px] font-bold text-neutral-900">{nuovo}</span>
        )}
        <div className="text-center font-bold text-[44px] leading-none pt-3 break-words px-12">{f.tavolo}</div>
      </div>
      <div className="text-center text-[14px] pt-1">{[f.zona, `${f.coperti} ${f.coperti === 1 ? "coperto" : "coperti"}`].filter(Boolean).join(" · ")}</div>
      <div className="flex justify-between text-[13px] px-3 pt-0.5"><span>{f.chi || ""}</span><span>{f.ora}</span></div>
      {f.allergie && (
        <>
          <div className="bg-neutral-900 text-white text-center font-bold text-[15px] py-1 mt-1.5">ALLERGIE AL TAVOLO</div>
          <div className="text-center font-bold text-[15px] px-3 pt-1 break-words">{f.allergie}</div>
        </>
      )}
      {f.uscite.map((u) => <Uscita key={u.numero} u={u} />)}
    </button>
  );
}

export default function ComandeSchermo() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const reparto = params.get("reparto") || "";
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState("");
  const [visti, setVisti] = useState(null);     // conto_id → firma vista; null = prima lettura
  const riquadro = useRef(null);

  const carica = useCallback(async () => {
    try {
      const d = await api(`/comande/schermo/${reparto ? `?reparto=${encodeURIComponent(reparto)}` : ""}`);
      setDati(d);
      setErrore("");
      // alla prima lettura tutto è già «visto»: si segnala solo ciò che arriva dopo
      setVisti((v) => v || Object.fromEntries(d.foglietti.map((f) => [f.conto_id, firma(f)])));
    } catch (e) {
      setErrore(e.message || "Errore di connessione");
    }
  }, [reparto]);

  useEffect(() => { setVisti(null); setDati(null); }, [reparto]);
  useEffect(() => {
    carica();
    const t = setInterval(() => { if (document.visibilityState === "visible") carica(); }, RILEGGI_OGNI_MS);
    const torna = () => { if (document.visibilityState === "visible") carica(); };
    document.addEventListener("visibilitychange", torna);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", torna); };
  }, [carica]);

  // Schermo sempre acceso, dove il browser lo permette (Safari 16.4+): si richiede a ogni ritorno in primo piano
  useEffect(() => {
    let blocco = null;
    const tieni = async () => {
      try { if (navigator.wakeLock && document.visibilityState === "visible") blocco = await navigator.wakeLock.request("screen"); } catch { /* niente: lo schermo segue le impostazioni dell'iPad */ }
    };
    tieni();
    document.addEventListener("visibilitychange", tieni);
    return () => { document.removeEventListener("visibilitychange", tieni); try { blocco && blocco.release(); } catch { /* già rilasciato */ } };
  }, []);

  const tuttoSchermo = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (riquadro.current?.requestFullscreen) await riquadro.current.requestFullscreen();
    } catch { /* iPad: si usa «Aggiungi a Home» */ }
  };

  const fogli = dati?.foglietti || [];
  // "" = già visto · «NUOVO» = tavolo mai visto su questo schermo · «CAMBIATO» = qualcosa è cambiato
  const eNuovo = (f) => (!visti || visti[f.conto_id] === firma(f) ? "" : visti[f.conto_id] === undefined ? "NUOVO" : "CAMBIATO");
  const visto = (f) => setVisti((v) => ({ ...(v || {}), [f.conto_id]: firma(f) }));
  const vanno = fogli.filter((f) => f.uscita_va !== null && f.uscita_va !== undefined).length;
  const solleciti = fogli.filter((f) => f.sollecito).length;

  return (
    <div ref={riquadro} className="fixed inset-0 z-[90] flex flex-col bg-[#3A3732]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="flex items-center justify-between gap-3 bg-neutral-900 px-4 py-2 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl font-bold whitespace-nowrap">{dati?.reparto_nome || "Schermo cucina"}</span>
          {(dati?.reparti || []).length > 1 && (
            <div className="flex gap-1">
              {dati.reparti.map((r) => (
                <button key={r.key} type="button" onClick={() => setParams(r.key === dati.reparti[0].key ? {} : { reparto: r.key }, { replace: true })}
                  className={`min-h-[40px] rounded-lg px-3 text-sm font-semibold ${r.key === dati.reparto ? "bg-white text-neutral-900" : "bg-neutral-700 text-neutral-200"}`}>
                  {r.nome}
                </button>
              ))}
            </div>
          )}
          <span className="hidden md:inline truncate text-sm text-neutral-300">
            {fogli.length} {fogli.length === 1 ? "tavolo" : "tavoli"} · {vanno} in corso{solleciti > 0 ? ` · ${solleciti} ${solleciti === 1 ? "sollecito" : "solleciti"}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {errore && <span className="rounded bg-red-600 px-2 py-1 text-xs font-semibold">Non aggiornato: {errore}</span>}
          <span className="text-xl font-bold tabular-nums">{dati?.ora || ""}</span>
          <button type="button" onClick={tuttoSchermo} className="hidden sm:block min-h-[40px] rounded-lg bg-neutral-700 px-3 text-sm font-semibold">Tutto schermo</button>
          <button type="button" onClick={() => navigate("/comande")} className="min-h-[40px] rounded-lg bg-neutral-700 px-3 text-sm font-semibold">Esci</button>
        </div>
      </div>

      {!dati && !errore ? (
        <div className="flex flex-1 items-center justify-center text-neutral-300">Caricamento…</div>
      ) : fogli.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-lg text-neutral-300">
          Nessuna comanda aperta{dati?.reparto_nome ? ` per ${dati.reparto_nome.toLowerCase()}` : ""}.
        </div>
      ) : (
        <div className="flex flex-1 items-start gap-4 overflow-auto p-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          {fogli.map((f) => <Foglietto key={f.conto_id} f={f} nuovo={eNuovo(f)} onVisto={() => visto(f)} />)}
        </div>
      )}
    </div>
  );
}
