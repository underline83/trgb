// @version: v2.0 — conto a elenco con le uscite che vanno o attendono, come lavora la sala (2026-11-24)
// Modulo: comande
// A sinistra il catalogo a elenco (categorie in colonna, voci in lista), a destra la comanda divisa
// per uscite. Su telefono le due metà si alternano («＋ Aggiungi» / «Fatto»).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Btn, Modal, PageLayout, TextInput } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import ComandeNav, { BannerProva } from "./ComandeNav";
import { api, euro, nomeUscita } from "./comandeApi";

const STATO_RIGA = {
  da_inviare: { label: "da inviare", cls: "bg-amber-100 text-amber-900 border-amber-200" },
  inviata: { label: "inviata", cls: "bg-emerald-100 text-emerald-900 border-emerald-200" },
  stornata: { label: "stornata", cls: "bg-neutral-100 text-neutral-500 border-neutral-200 line-through" },
};
const FAMIGLIE_FUORI_CARTA = [
  { key: "food", label: "Cucina" },
  { key: "beverage", label: "Da bere" },
  { key: "servizio", label: "Servizio" },
];
// Un'uscita inviata o è andata o attende la chiamata; «nuova» = non ancora inviata.
const TESTA_USCITA = {
  andata: "bg-emerald-50 text-emerald-900",
  attende: "bg-blue-50 text-blue-900",
  nuova: "bg-neutral-100 text-neutral-800",
};
const eCoperto = (r) => r.articolo_tipo === "coperto";
const ora = (ts) => (ts ? String(ts).slice(11, 16) : "");
const numero = (v) => Number(String(v).replace(",", "."));
const pill = (on) =>
  `min-h-[44px] rounded-full border px-4 text-sm font-semibold ${
    on ? "border-brand-ink bg-brand-ink text-white" : "border-neutral-300 bg-white text-brand-ink"
  }`;
const AZ = "min-h-[44px] rounded-lg border border-current px-2.5 text-xs font-semibold disabled:opacity-50";

export default function ComandeConto() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [conto, setConto] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [imp, setImp] = useState(null);
  const [errore, setErrore] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  const [vista, setVista] = useState("conto"); // su telefono: "conto" o "catalogo"
  const [uscitaScelta, setUscitaScelta] = useState(null); // null = la propone la pagina
  const [cerca, setCerca] = useState("");
  const [gruppo, setGruppo] = useState(null);

  const [prezzoPer, setPrezzoPer] = useState(null); // articolo a prezzo libero
  const [prezzo, setPrezzo] = useState("");
  const [fuoriCarta, setFuoriCarta] = useState(null); // {nome, prezzo, famiglia}
  const [rigaAperta, setRigaAperta] = useState(null);
  const [notaRiga, setNotaRiga] = useState("");
  const [motivo, setMotivo] = useState("");
  const [copertiEdit, setCopertiEdit] = useState(null);
  const [omaggioEdit, setOmaggioEdit] = useState(false);
  const [chiudi, setChiudi] = useState(false);
  const [sposta, setSposta] = useState(null); // sale coi tavoli liberi, mentre si sceglie dove spostare
  const [azioniDi, setAzioniDi] = useState(null); // uscita andata di cui si vedono le azioni (⋯)

  const mostra = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const carica = useCallback(async () => {
    try {
      setConto(await api(`/comande/conti/${id}`));
      setErrore(null);
    } catch (e) {
      setErrore(e.message);
    }
  }, [id]);

  useEffect(() => {
    carica();
    api("/comande/impostazioni/").then(setImp).catch(() => setImp(null));
    api("/comande/catalogo/")
      .then((c) => {
        setCatalogo(c);
        setGruppo((g) => g || (c.gruppi[0] && c.gruppi[0].nome) || null);
      })
      .catch((e) => setErrore(e.message));
  }, [carica]);

  const esegui = async (fn, okMsg) => {
    setBusy(true);
    try {
      const c = await fn();
      if (c && c.id) setConto(c);
      if (okMsg) mostra(okMsg);
      setErrore(null);
      return true;
    } catch (e) {
      setErrore(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const articoli = useMemo(() => {
    if (!catalogo) return [];
    const q = cerca.trim().toLowerCase();
    return catalogo.articoli.filter((a) =>
      q ? `${a.nome} ${a.dettaglio} ${a.codice}`.toLowerCase().includes(q) : !gruppo || a.gruppo === gruppo
    );
  }, [catalogo, cerca, gruppo]);

  if (!conto) {
    return (
      <PageLayout nav={<ComandeNav current="tavoli" />} title="Conto">
        {errore ? <div className="text-sm text-red-700">{errore}</div> : <TrgbLoader />}
      </PageLayout>
    );
  }

  const aperto = conto.stato === "aperto";
  const tasti = conto.tasti_rapidi || [];
  const uscite = conto.uscite || [];
  const maxUscita = uscite.reduce((m, u) => Math.max(m, u.numero), 0);
  // Le uscite tenute dai tasti rapidi (lo stuzzico nella 1, il pane nella 2): un tasto battuto
  // lì non sposta il punto in cui si batte, e «Nuova uscita» le salta.
  const fissi = new Set(tasti.filter((t) => t.uscita).map((t) => `${t.codice}@${t.uscita}`));
  const maxRiservata = tasti.reduce((m, t) => Math.max(m, t.uscita || 0), 0);
  // Dove si batte: l'ultima uscita nuova che ha già un piatto; se non ce n'è, la 1 a tavolo
  // appena aperto, una nuova dopo le inviate quando la comanda è già partita.
  const conPiatti = uscite.filter(
    (u) =>
      u.stato === "nuova" &&
      conto.righe.some(
        (r) => r.uscita === u.numero && r.stato === "da_inviare" && !eCoperto(r) && !fissi.has(`${r.articolo_codice}@${r.uscita}`)
      )
  );
  const inviate = uscite.filter((u) => u.stato !== "nuova");
  const proposta = conPiatti.length
    ? Math.max(...conPiatti.map((u) => u.numero))
    : inviate.length
      ? Math.max(...inviate.map((u) => u.numero)) + 1
      : 1;
  const battuta = uscitaScelta ?? proposta;
  const prossimaUscita = Math.max(maxUscita, battuta, maxRiservata) + 1;
  const daMostrare = uscite.some((u) => u.numero === battuta) || !aperto
    ? uscite
    : [...uscite, { numero: battuta, stato: "nuova", da_inviare: 0, solleciti: 0 }].sort((a, b) => a.numero - b.numero);
  const primaInAttesa = uscite.find((u) => u.stato === "attende");
  const scelteUscita = Array.from({ length: Math.max(maxUscita, battuta) + 1 }, (_, i) => i + 1);
  // Prezzo del coperto a prezzo pieno: quello della riga, o delle Impostazioni se ora è in omaggio.
  const prezzoCoperto = !conto.coperto
    ? null
    : !conto.coperto.omaggio
      ? conto.coperto.prezzo
      : imp && imp.coperto ? imp.coperto.prezzo : null;
  const rigaCoperto = conto.righe.find((r) => eCoperto(r) && r.stato !== "stornata");

  const aggiungi = (a, prezzoLibero) => {
    const uguale =
      !a.prezzo_libero &&
      conto.righe.find(
        (r) =>
          r.stato === "da_inviare" && r.articolo_codice === a.codice && r.uscita === battuta &&
          !r.nota && (!r.varianti || r.varianti.length === 0)
      );
    if (uguale) {
      return esegui(
        () => api(`/comande/righe/${uguale.id}`, { method: "PATCH", body: { quantita: uguale.quantita + 1 } }),
        `${a.nome} ×${uguale.quantita + 1}`
      );
    }
    const nuova = { codice: a.codice, quantita: 1, uscita: battuta };
    if (a.prezzo_libero) nuova.prezzo = prezzoLibero;
    return esegui(
      () => api(`/comande/conti/${id}/righe`, { method: "POST", body: { righe: [nuova] } }),
      `+ ${a.nome} · ${nomeUscita(battuta)}`
    );
  };

  const tocca = (a) => {
    if (a.prezzo_libero) {
      setPrezzo(a.prezzo ? String(a.prezzo) : "");
      setPrezzoPer(a);
    } else {
      aggiungi(a);
    }
  };

  // Tasto rapido («Stuzzico», «Pane»): 0 €, nella sua uscita se ne ha una, se no dove si batte.
  const toccaTasto = (t) => {
    const u = t.uscita || battuta;
    const uguale = conto.righe.find(
      (r) => r.stato === "da_inviare" && r.articolo_codice === t.codice && r.uscita === u && !r.nota
    );
    if (uguale) {
      return esegui(
        () => api(`/comande/righe/${uguale.id}`, { method: "PATCH", body: { quantita: uguale.quantita + 1 } }),
        `${t.nome} ×${uguale.quantita + 1}`
      );
    }
    return esegui(
      () => api(`/comande/conti/${id}/righe`, { method: "POST", body: { righe: [{ tasto: t.id, uscita: u }] } }),
      `+ ${t.nome} ×${t.quantita} · ${nomeUscita(u)}`
    );
  };

  const chiama = async (u, azione, msg) => {
    const ok = await esegui(() => api(`/comande/conti/${id}/uscite/${u}/${azione}`, { method: "POST" }), msg);
    if (ok) setAzioniDi(null);
  };

  const invia = async () => {
    const ok = await esegui(() => api(`/comande/conti/${id}/invia`, { method: "POST" }), "Comanda inviata");
    if (ok) setUscitaScelta(null);
  };

  // «Sposta su un altro tavolo»: si sceglie fra i tavoli senza conto aperto.
  const apriSposta = async () => {
    try {
      const d = await api("/comande/tavoli/");
      setSposta(
        d.sale
          .map((s) => ({ zona: s.zona, tavoli: s.tavoli.filter((t) => !t.conto) }))
          .filter((s) => s.tavoli.length > 0)
      );
      setErrore(null);
    } catch (e) {
      setErrore(e.message);
    }
  };

  const spostaSu = async (t) => {
    const ok = await esegui(
      () => api(`/comande/conti/${id}`, { method: "PATCH", body: { tavolo_id: t.id } }),
      `Spostato al tavolo ${t.nome}`
    );
    if (ok) setSposta(null);
  };

  const apriCoperti = () => {
    setCopertiEdit(conto.coperti);
    setOmaggioEdit(!!(conto.coperto && conto.coperto.omaggio));
  };

  const salvaCoperti = async () => {
    let ok = true;
    if (copertiEdit !== conto.coperti) {
      ok = await esegui(() => api(`/comande/conti/${id}`, { method: "PATCH", body: { coperti: copertiEdit } }));
    }
    if (ok && conto.coperto && copertiEdit > 0 && omaggioEdit !== conto.coperto.omaggio) {
      ok = await esegui(
        () => api(`/comande/conti/${id}/coperto`, { method: "POST", body: { omaggio: omaggioEdit } }),
        omaggioEdit ? "Coperto in omaggio" : "Coperto a prezzo"
      );
    }
    if (ok) setCopertiEdit(null);
  };

  const rigaConto = (r, uscitaNuova) => (
    <div key={r.id} className="flex items-center gap-2 border-t border-neutral-100 px-3 py-2">
      {r.stato === "da_inviare" && aperto ? (
        <div className="flex items-center gap-1">
          <button
            aria-label="Uno in meno"
            className="h-11 w-11 rounded-lg border border-neutral-300 text-lg"
            onClick={() =>
              r.quantita > 1
                ? esegui(() => api(`/comande/righe/${r.id}`, { method: "PATCH", body: { quantita: r.quantita - 1 } }))
                : esegui(() => api(`/comande/righe/${r.id}`, { method: "DELETE" }), "Tolta")
            }
          >
            −
          </button>
          <span className="w-6 text-center font-semibold tabular-nums">{r.quantita}</span>
          <button
            aria-label="Uno in più"
            className="h-11 w-11 rounded-lg border border-neutral-300 text-lg"
            onClick={() => esegui(() => api(`/comande/righe/${r.id}`, { method: "PATCH", body: { quantita: r.quantita + 1 } }))}
          >
            +
          </button>
        </div>
      ) : (
        <span className="w-8 text-right font-semibold tabular-nums">{r.quantita}</span>
      )}
      <button
        className="min-w-0 flex-1 py-1 text-left"
        disabled={!aperto || r.stato === "stornata"}
        onClick={() => {
          setNotaRiga(r.nota || "");
          setMotivo("");
          setRigaAperta(r);
        }}
      >
        <div className={`text-sm font-medium ${r.stato === "stornata" ? "text-neutral-400 line-through" : "text-brand-ink"}`}>
          {r.nome}
        </div>
        <div className="truncate text-xs text-neutral-500">
          {r.nota ? `📝 ${r.nota} · ` : ""}
          {r.reparto ? conto.reparti[r.reparto] || r.reparto : "nessun reparto"}
          {r.stato === "stornata" && r.motivo_storno ? ` · ${r.motivo_storno}` : ""}
        </div>
      </button>
      {(r.stato === "stornata" || (r.stato === "da_inviare" && !uscitaNuova)) && (
        <span className={`rounded-full border px-1.5 text-[10px] ${STATO_RIGA[r.stato].cls}`}>{STATO_RIGA[r.stato].label}</span>
      )}
    </div>
  );

  return (
    <PageLayout
      wide
      nav={<ComandeNav current="tavoli" />}
      title={`Tavolo ${conto.tavolo}`}
      subtitle={`${conto.zona || ""} · aperto alle ${ora(conto.aperto_at)}${conto.aperto_da ? ` da ${conto.aperto_da}` : ""}${
        aperto ? "" : ` · ${conto.stato}`
      }`}
      actions={
        <>
          {aperto && <Btn variant="secondary" onClick={apriSposta}>Sposta</Btn>}
          {aperto && <Btn variant="secondary" onClick={() => setChiudi(true)}>Chiudi tavolo</Btn>}
          <Btn variant="secondary" onClick={() => navigate("/comande")}>← Tavoli</Btn>
        </>
      }
    >
      <BannerProva />
      {errore && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{errore}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Catalogo a elenco */}
        {aperto && (
          <section className={`min-w-0 ${vista === "catalogo" ? "" : "hidden lg:block"}`}>
            <TextInput value={cerca} onChange={setCerca} placeholder="Cerca un piatto, un vino, un codice…" />
            <div className="my-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-600">Si batte in</span>
              <span className="rounded-full bg-brand-ink px-3 py-1 text-xs font-bold text-white">{nomeUscita(battuta)}</span>
              {tasti.map((t) => (
                <button
                  key={t.id}
                  disabled={busy}
                  onClick={() => toccaTasto(t)}
                  className="min-h-[44px] rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900 active:scale-[0.98] disabled:opacity-50"
                >
                  {t.nome} <span className="font-normal">×{t.quantita}</span>
                </button>
              ))}
            </div>
            {catalogo && catalogo.avvisi && catalogo.avvisi.length > 0 && (
              <div className="mb-2 text-xs text-amber-800">{catalogo.avvisi.join(" · ")}</div>
            )}
            {!catalogo ? (
              <TrgbLoader />
            ) : (
              <div className="flex flex-col gap-3 lg:flex-row">
                {!cerca && (
                  <div className="flex shrink-0 gap-1 overflow-x-auto pb-1 lg:max-h-[64vh] lg:w-44 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0">
                    {catalogo.gruppi.map((g) => (
                      <button
                        key={g.nome}
                        onClick={() => setGruppo(g.nome)}
                        className={`min-h-[44px] shrink-0 rounded-xl px-3 text-left text-sm font-semibold ${
                          gruppo === g.nome ? "bg-brand-ink text-white" : "text-brand-ink hover:bg-white"
                        }`}
                      >
                        {g.nome} <span className="text-xs font-normal opacity-60">{g.n}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => setFuoriCarta({ nome: "", prezzo: "", famiglia: "food" })}
                      className="min-h-[44px] shrink-0 rounded-xl border border-dashed border-neutral-400 px-3 text-left text-sm"
                    >
                      ＋ Fuori carta
                    </button>
                  </div>
                )}
                <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                  <div className="max-h-[64vh] divide-y divide-neutral-100 overflow-y-auto">
                    {articoli.slice(0, 300).map((a) => (
                      <button
                        key={a.codice}
                        disabled={busy}
                        onClick={() => tocca(a)}
                        className="flex min-h-[54px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-rose-50 active:bg-rose-100"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold text-brand-ink">{a.nome}</span>
                          {(a.dettaglio || cerca) && (
                            <span className="block truncate text-xs text-neutral-500">
                              {cerca ? `${a.gruppo}${a.dettaglio ? " · " : ""}` : ""}
                              {a.dettaglio}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-[15px] font-bold tabular-nums">
                          {a.prezzo_libero ? "prezzo?" : euro(a.prezzo)}
                        </span>
                      </button>
                    ))}
                    {articoli.length === 0 && <div className="p-4 text-center text-sm text-neutral-500">Niente trovato</div>}
                  </div>
                </div>
              </div>
            )}
            <div className="sticky bottom-2 mt-3 lg:hidden">
              <Btn size="lg" className="w-full shadow-lg" onClick={() => setVista("conto")}>
                Fatto{conto.da_inviare ? ` · ${conto.da_inviare} da inviare` : ""}
              </Btn>
            </div>
          </section>
        )}

        {/* La comanda, per uscite. Su schermo largo sta tutta nello schermo (intestazione compresa)
            e scorre per conto suo, così «Invia comanda» si vede senza scorrere la pagina. */}
        <section
          className={`min-w-0 lg:sticky lg:top-3 lg:max-h-[calc(100vh-13rem)] lg:self-start lg:overflow-y-auto ${
            vista === "conto" || !aperto ? "" : "hidden lg:block"
          }`}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              disabled={!aperto}
              onClick={apriCoperti}
              className="min-h-[44px] rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-900"
            >
              👤 {conto.coperti} coperti{conto.coperto && conto.coperto.omaggio ? " · omaggio" : ""}
            </button>
            <span className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-bold text-brand-ink">
              {euro(conto.totale)}
            </span>
            {rigaCoperto && (
              <span className="text-xs text-neutral-600">
                di cui {rigaCoperto.quantita} × {rigaCoperto.nome} {euro(rigaCoperto.totale)}
              </span>
            )}
          </div>

          <div className="space-y-2">
            {daMostrare.length === 0 && (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
                Conto vuoto.
              </div>
            )}
            {daMostrare.map((u) => {
              const sue = conto.righe.filter((r) => r.uscita === u.numero && !eCoperto(r));
              const qui = aperto && u.numero === battuta;
              const prima = primaInAttesa && u.numero === primaInAttesa.numero;
              return (
                <div
                  key={u.numero}
                  className={`overflow-hidden rounded-2xl border bg-white ${
                    qui ? "border-2 border-brand-ink" : prima ? "border-blue-600" : "border-neutral-200"
                  }`}
                >
                  <div className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm font-bold ${TESTA_USCITA[u.stato]}`}>
                    <span className="flex-1">
                      {nomeUscita(u.numero)}
                      <span className="font-normal">
                        {u.stato === "andata" && ` · andata${u.andata_at ? ` ${ora(u.andata_at)}` : ""}`}
                        {u.stato === "attende" && " · attende"}
                        {u.stato === "nuova" && (sue.length ? " · da inviare" : " · vuota")}
                        {u.stato !== "nuova" && u.da_inviare > 0 && ` · ${u.da_inviare} da inviare`}
                        {u.solleciti > 0 && ` · sollecitata ${u.solleciti}×`}
                        {qui && " · si batte qui"}
                      </span>
                    </span>
                    {aperto && !qui && u.stato !== "andata" && (
                      <button className={AZ} onClick={() => setUscitaScelta(u.numero)}>Batti qui</button>
                    )}
                    {aperto && u.stato === "andata" && (
                      <button
                        className={`${AZ} min-w-[44px] text-base`}
                        aria-label={`Azioni su ${nomeUscita(u.numero)}`}
                        aria-expanded={azioniDi === u.numero}
                        onClick={() => setAzioniDi(azioniDi === u.numero ? null : u.numero)}
                      >
                        ⋯
                      </button>
                    )}
                  </div>
                  {aperto && u.stato === "andata" && azioniDi === u.numero && (
                    <div className="flex flex-wrap gap-2 border-t border-emerald-100 bg-emerald-50/60 px-3 py-2 text-emerald-900">
                      {!qui && (
                        <button className={AZ} onClick={() => { setUscitaScelta(u.numero); setAzioniDi(null); }}>Batti qui</button>
                      )}
                      {u.numero > 0 && (
                        <>
                          <button disabled={busy} className={AZ} onClick={() => chiama(u.numero, "sollecita", `${nomeUscita(u.numero)} sollecitata`)}>
                            Invia sollecito
                          </button>
                          <button disabled={busy} className={AZ} onClick={() => chiama(u.numero, "attendi", `${nomeUscita(u.numero)} attende`)}>
                            Attendi
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {sue.map((r) => rigaConto(r, u.stato === "nuova"))}
                  {aperto && u.stato === "attende" && (
                    <div className="border-t border-neutral-100 p-2">
                      <Btn
                        variant={prima ? "primary" : "secondary"}
                        size="lg"
                        className="w-full"
                        disabled={busy}
                        onClick={() => chiama(u.numero, "vai", `${nomeUscita(u.numero)}: vai`)}
                      >
                        Vai con la preparazione
                      </Btn>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {conto.invii.length > 0 && (
            <p className="mt-2 text-xs text-neutral-500">
              {conto.invii.length} {conto.invii.length === 1 ? "foglio" : "fogli"} ai reparti · la stampa arriva col ponte
            </p>
          )}

          {aperto && (
            <div className="sticky bottom-2 mt-3 flex flex-wrap gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-2 shadow-lg backdrop-blur">
              <Btn variant="secondary" size="lg" className="flex-1 lg:hidden" onClick={() => setVista("catalogo")}>＋ Aggiungi</Btn>
              <Btn variant="secondary" size="lg" className="flex-1 whitespace-nowrap lg:flex-none" onClick={() => setUscitaScelta(prossimaUscita)}>＋ Nuova uscita</Btn>
              <Btn variant="success" size="lg" className="w-full lg:w-auto lg:flex-1" disabled={!conto.da_inviare || busy} onClick={invia}>
                Invia comanda{conto.da_inviare ? ` · ${conto.da_inviare}` : ""}
              </Btn>
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-brand-ink px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Prezzo per gli articoli a voce */}
      <Modal
        open={!!prezzoPer}
        onClose={() => setPrezzoPer(null)}
        title={prezzoPer ? prezzoPer.nome : ""}
        subtitle={prezzoPer ? prezzoPer.dettaglio : ""}
        size="sm"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPrezzoPer(null)}>Annulla</Btn>
            <Btn
              disabled={prezzo === "" || !(numero(prezzo) >= 0)}
              onClick={async () => {
                if (await aggiungi(prezzoPer, numero(prezzo))) setPrezzoPer(null);
              }}
            >
              Aggiungi
            </Btn>
          </>
        }
      >
        <TextInput value={prezzo} onChange={setPrezzo} placeholder="Prezzo in euro" inputMode="decimal" />
      </Modal>

      {/* Fuori carta */}
      <Modal
        open={!!fuoriCarta}
        onClose={() => setFuoriCarta(null)}
        title="Fuori carta"
        subtitle={nomeUscita(battuta)}
        size="sm"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setFuoriCarta(null)}>Annulla</Btn>
            <Btn
              disabled={!fuoriCarta || !fuoriCarta.nome.trim() || fuoriCarta.prezzo === ""}
              onClick={async () => {
                const f = fuoriCarta;
                const ok = await esegui(
                  () => api(`/comande/conti/${id}/righe`, {
                    method: "POST",
                    body: { righe: [{ nome: f.nome.trim(), prezzo: numero(f.prezzo), famiglia: f.famiglia, quantita: 1, uscita: battuta }] },
                  }),
                  `+ ${f.nome.trim()}`
                );
                if (ok) setFuoriCarta(null);
              }}
            >
              Aggiungi
            </Btn>
          </>
        }
      >
        {fuoriCarta && (
          <div className="space-y-3">
            <TextInput value={fuoriCarta.nome} onChange={(v) => setFuoriCarta({ ...fuoriCarta, nome: v })} placeholder="Nome" />
            <TextInput value={fuoriCarta.prezzo} onChange={(v) => setFuoriCarta({ ...fuoriCarta, prezzo: v })} placeholder="Prezzo in euro" inputMode="decimal" />
            <div className="flex gap-2">
              {FAMIGLIE_FUORI_CARTA.map((f) => (
                <button key={f.key} onClick={() => setFuoriCarta({ ...fuoriCarta, famiglia: f.key })} className={pill(fuoriCarta.famiglia === f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Riga: nota e uscita (non inviata) o storno (inviata) */}
      <Modal
        open={!!rigaAperta}
        onClose={() => setRigaAperta(null)}
        title={rigaAperta ? rigaAperta.nome : ""}
        subtitle={rigaAperta ? `${nomeUscita(rigaAperta.uscita)} · ${STATO_RIGA[rigaAperta.stato].label}` : ""}
        size="sm"
        footer={
          rigaAperta && rigaAperta.stato === "inviata" ? (
            <>
              <Btn variant="secondary" onClick={() => setRigaAperta(null)}>Annulla</Btn>
              <Btn
                variant="danger"
                disabled={!motivo.trim()}
                onClick={async () => {
                  const ok = await esegui(() => api(`/comande/righe/${rigaAperta.id}/storna`, { method: "POST", body: { motivo } }), "Stornata");
                  if (ok) setRigaAperta(null);
                }}
              >
                Storna
              </Btn>
            </>
          ) : (
            <>
              <Btn
                variant="danger"
                onClick={async () => {
                  const ok = await esegui(() => api(`/comande/righe/${rigaAperta.id}`, { method: "DELETE" }), "Tolta");
                  if (ok) setRigaAperta(null);
                }}
              >
                Togli
              </Btn>
              <Btn
                onClick={async () => {
                  const ok = await esegui(() => api(`/comande/righe/${rigaAperta.id}`, { method: "PATCH", body: { nota: notaRiga } }));
                  if (ok) setRigaAperta(null);
                }}
              >
                Salva
              </Btn>
            </>
          )
        }
      >
        {rigaAperta && rigaAperta.stato === "inviata" && (
          <div className="space-y-2">
            <p className="text-sm text-neutral-600">La riga è già partita: se la storni, il reparto riceve l'avviso.</p>
            <TextInput value={motivo} onChange={setMotivo} placeholder="Motivo (es. cliente ha cambiato idea)" />
          </div>
        )}
        {rigaAperta && rigaAperta.stato === "da_inviare" && (
          <div className="space-y-3">
            <TextInput value={notaRiga} onChange={setNotaRiga} placeholder="Nota per il reparto (es. ben cotta, divisa in due)" />
            <div>
              <div className="mb-1 text-xs text-neutral-600">Uscita</div>
              <div className="flex flex-wrap gap-2">
                {scelteUscita.map((u) => (
                  <button
                    key={u}
                    onClick={async () => {
                      const ok = await esegui(() => api(`/comande/righe/${rigaAperta.id}`, { method: "PATCH", body: { uscita: u } }));
                      if (ok) setRigaAperta({ ...rigaAperta, uscita: u });
                    }}
                    className={pill(rigaAperta.uscita === u)}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Coperti */}
      <Modal
        open={copertiEdit !== null}
        onClose={() => setCopertiEdit(null)}
        title="Coperti"
        size="sm"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setCopertiEdit(null)}>Annulla</Btn>
            <Btn disabled={busy} onClick={salvaCoperti}>Salva</Btn>
          </>
        }
      >
        <div className="flex items-center justify-center gap-4 py-2">
          <Btn variant="secondary" size="lg" onClick={() => setCopertiEdit((n) => Math.max(0, n - 1))}>−</Btn>
          <span className="w-14 text-center text-4xl font-bold tabular-nums text-brand-ink">{copertiEdit}</span>
          <Btn variant="secondary" size="lg" onClick={() => setCopertiEdit((n) => Math.min(200, n + 1))}>+</Btn>
        </div>
        {conto.coperto && copertiEdit > 0 && (
          <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={omaggioEdit} onChange={(e) => setOmaggioEdit(e.target.checked)} />
            <span>
              Coperto in omaggio
              <span className="block text-xs text-neutral-500">
                {omaggioEdit
                  ? "In conto a 0 €"
                  : prezzoCoperto !== null
                    ? `In conto: ${copertiEdit} × ${euro(prezzoCoperto)}`
                    : "In conto al prezzo delle Impostazioni"}
              </span>
            </span>
          </label>
        )}
      </Modal>

      {/* Sposta su un altro tavolo */}
      <Modal
        open={!!sposta}
        onClose={() => setSposta(null)}
        title={`Sposta il tavolo ${conto.tavolo}`}
        subtitle="Il conto passa intero al tavolo che scegli"
        size="md"
        footer={<Btn variant="secondary" onClick={() => setSposta(null)}>Annulla</Btn>}
      >
        {sposta && sposta.length === 0 && <p className="text-sm text-neutral-600">Non ci sono tavoli liberi.</p>}
        {(sposta || []).map((s) => (
          <div key={s.zona} className="mb-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{s.zona}</div>
            <div className="flex flex-wrap gap-2">
              {s.tavoli.map((t) => (
                <button
                  key={t.id}
                  disabled={busy}
                  onClick={() => spostaSu(t)}
                  className="min-h-[48px] min-w-[56px] rounded-xl border border-neutral-300 bg-white px-3 text-base font-bold text-brand-ink hover:bg-neutral-50 disabled:opacity-50"
                >
                  {t.nome}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Modal>

      {/* Chiudi */}
      <Modal
        open={chiudi}
        onClose={() => setChiudi(false)}
        title={`Chiudi il tavolo ${conto.tavolo}`}
        size="sm"
        footer={
          <>
            <Btn
              variant="danger"
              onClick={async () => {
                const ok = await esegui(() => api(`/comande/conti/${id}/chiudi`, { method: "POST", body: { annulla: true } }));
                if (ok) navigate("/comande");
              }}
            >
              Annulla conto
            </Btn>
            <Btn
              disabled={conto.da_inviare > 0}
              onClick={async () => {
                const ok = await esegui(() => api(`/comande/conti/${id}/chiudi`, { method: "POST", body: { annulla: false } }));
                if (ok) navigate("/comande");
              }}
            >
              Chiudi
            </Btn>
          </>
        }
      >
        <p className="text-sm text-neutral-600">
          È un conto di prova: chiudendolo il tavolo torna libero. Il conto vero si batte su iPratico.
          {conto.da_inviare > 0 && " Prima invia o togli le righe non inviate."}
        </p>
      </Modal>
    </PageLayout>
  );
}
