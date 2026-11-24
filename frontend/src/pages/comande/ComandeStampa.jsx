// @version: v1.0 — la stampa delle comande: stato del ponte, token, stampanti, tempi, foglio di prova (2026-11-24)
// Modulo: comande (parla col mattone M.M, ponte di stampa: /ponte/…)
import React, { useCallback, useEffect, useState } from "react";
import { Btn, TextInput } from "../../components/ui";
import { api, durata } from "./comandeApi";

const VALORI = [
  { k: "ogni_secondi", label: "Il ponte chiede se c'è da stampare ogni", unita: "secondi" },
  { k: "avviso_minuti", label: "La stampa si dice ferma dopo", unita: "minuti di silenzio del ponte" },
  { k: "scadenza_minuti", label: "Un foglio non esce più da solo dopo", unita: "minuti (poi si ristampa a mano)" },
];

// Una riga che dice come sta il ponte. `stato` è la risposta di GET /ponte/stato/.
export function testoPonte(stato) {
  if (!stato) return { tono: "grigio", testo: "…" };
  if (!stato.token) return { tono: "grigio", testo: "Il ponte non ha ancora un token" };
  if (stato.secondi_fa === null || stato.secondi_fa === undefined) return { tono: stato.ferma ? "rosso" : "grigio", testo: "Il ponte non si è mai fatto sentire" };
  const da = stato.secondi_fa < 60 ? `${stato.secondi_fa} s` : durata(Math.floor(stato.secondi_fa / 60));
  const chi = stato.ponte_nome ? ` (${stato.ponte_nome})` : "";
  if (stato.collegato) return { tono: "verde", testo: `Ponte collegato${chi}, sentito ${da} fa` };
  return { tono: stato.ferma ? "rosso" : "grigio", testo: `Ponte fermo${chi}: non si fa sentire da ${da}` };
}
const TONO = { verde: "bg-emerald-500", rosso: "bg-red-600", grigio: "bg-neutral-400" };

// Avviso su una riga per chi prende le comande: compare solo se una stampante è accesa e il ponte tace.
export function AvvisoStampaFerma({ stato }) {
  if (!stato || !stato.ferma) return null;
  return (
    <div role="alert" className="mb-2 truncate rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-900">
      <strong>Stampa ferma.</strong> {testoPonte(stato).testo}: le comande non escono sulle stampanti.
    </div>
  );
}

// Sezione delle Impostazioni (solo admin). `onStampanti(lista)` avvisa la pagina quando le stampanti cambiano.
export default function SezioneStampa({ onStampanti }) {
  const [dati, setDati] = useState(null);
  const [stampanti, setStampanti] = useState([]);
  const [valori, setValori] = useState({});
  const [msg, setMsg] = useState(null);
  const [token, setToken] = useState(null);
  const [chiedoToken, setChiedoToken] = useState(false);
  const [busy, setBusy] = useState(false);

  const riempi = useCallback((d) => {
    setDati(d);
    setStampanti(d.stampanti.map((s) => ({ ...s })));
    setValori({ ...d.valori });
    if (onStampanti) onStampanti(d.stampanti);
  }, [onStampanti]);

  useEffect(() => {
    api("/ponte/impostazioni/").then(riempi).catch((e) => setMsg(e.message));
  }, [riempi]);
  // lo stato del ponte si rilegge da solo: così si vede quando si collega
  useEffect(() => {
    const t = setInterval(() => {
      api("/ponte/stato/").then((s) => setDati((d) => (d ? { ...d, stato: s } : d))).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const fai = async (fn, fatto) => {
    setBusy(true);
    try {
      await fn();
      setMsg(fatto || null);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  const salva = () => fai(async () => riempi(await api("/ponte/impostazioni/", { method: "PUT", body: { stampanti, valori } })), "Stampa salvata");
  const creaToken = () => fai(async () => {
    const r = await api("/ponte/token/", { method: "POST" });
    setToken(r.token);
    setChiedoToken(false);
    setDati((d) => (d ? { ...d, stato: r.stato } : d));
  });
  const prova = (s) => fai(async () => {
    const r = await api("/ponte/prova/", { method: "POST", body: { stampante: s.chiave } });
    setDati((d) => (d ? { ...d, stato: r.stato } : d));
  }, `Foglio di prova in coda per ${s.nome}: esce appena il ponte lo viene a prendere`);
  const cambia = (i, campo, v) => setStampanti(stampanti.map((x, j) => (j === i ? { ...x, [campo]: v } : x)));
  const copia = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setMsg("Token copiato");
    } catch {
      setMsg("Copia a mano il token qui sotto");
    }
  };

  const p = testoPonte(dati && dati.stato);
  return (
    <section className="mb-5 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 font-semibold text-brand-ink">Stampa</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Le comande escono sulle stampanti tramite il «ponte», un programma acceso su un computer nella rete del locale.
        Ogni stampante nasce spenta: finché è spenta, da TRGB non esce niente.
      </p>
      {msg && <div className="mb-3 rounded-xl border border-neutral-200 bg-brand-cream px-3 py-2 text-sm">{msg}</div>}
      {!dati && <p className="text-sm text-neutral-500">Carico…</p>}
      {dati && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${TONO[p.tono]}`} />
            <span className="mr-auto">{p.testo}</span>
            {!chiedoToken && (
              <Btn variant="secondary" disabled={busy} onClick={() => (dati.stato.token ? setChiedoToken(true) : creaToken())}>
                {dati.stato.token ? "Crea un token nuovo" : "Crea il token"}
              </Btn>
            )}
          </div>
          {chiedoToken && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span className="mr-auto">Un token nuovo spegne quello di adesso: il ponte acceso smette di stampare finché non gli dai il nuovo.</span>
              <Btn variant="secondary" onClick={() => setChiedoToken(false)}>Lascia stare</Btn>
              <Btn loading={busy} onClick={creaToken}>Crea</Btn>
            </div>
          )}
          {token && (
            <div className="mb-3 rounded-xl border border-indigo-300 bg-indigo-50 p-3 text-sm text-indigo-950">
              <div className="mb-1 font-semibold">Token del ponte: si vede solo adesso</div>
              <code className="block select-all break-all rounded-lg bg-white px-2 py-2 font-mono text-xs">{token}</code>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Btn variant="secondary" onClick={copia}>Copia</Btn>
                <span className="text-xs">Incollalo nel ponte quando lo chiede (prima volta che lo avvii).</span>
              </div>
            </div>
          )}

          {stampanti.map((s, i) => (
            <div key={s.chiave} className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 p-2">
              <div className="w-32"><TextInput value={s.nome} onChange={(v) => cambia(i, "nome", v)} placeholder="Nome" /></div>
              <div className="w-44"><TextInput value={s.host || ""} onChange={(v) => cambia(i, "host", v.trim())} placeholder="Indirizzo" inputMode="decimal" /></div>
              <div className="w-24"><TextInput value={String(s.porta ?? 9100)} onChange={(v) => cambia(i, "porta", v.replace(/\D/g, ""))} placeholder="Porta" inputMode="numeric" /></div>
              <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="h-5 w-5" checked={!!s.attiva} onChange={(e) => cambia(i, "attiva", e.target.checked)} />
                accesa
              </label>
              <span className="ml-auto" />
              <Btn variant="secondary" disabled={busy || !s.host} onClick={() => prova(s)}>Foglio di prova</Btn>
            </div>
          ))}
          <p className="mb-3 text-[11px] text-neutral-500">
            Il foglio di prova esce anche su una stampante spenta: serve a provarla prima di accenderla. Salva prima di provare un indirizzo nuovo.
          </p>

          <div className="space-y-2">
            {VALORI.map((v) => (
              <label key={v.k} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-72">{v.label}</span>
                <span className="w-20">
                  <TextInput value={String(valori[v.k] ?? "")} inputMode="numeric"
                    onChange={(x) => setValori({ ...valori, [v.k]: x.replace(/\D/g, "") })} />
                </span>
                <span className="text-neutral-600">{v.unita}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Btn loading={busy} onClick={salva}>Salva la stampa</Btn>
          </div>
        </>
      )}
    </section>
  );
}
