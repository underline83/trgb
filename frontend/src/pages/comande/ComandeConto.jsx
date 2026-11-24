// @version: v2.2 — tutto lo schermo ai due pannelli (iPad) e a un pannello per volta (telefono); «⋯» sulle uscite; chi è al tavolo anche senza prenotazione (2026-11-24)
// Modulo: comande
// Schermo largo (iPad, computer): a sinistra il catalogo a elenco, a destra la comanda divisa per
// uscite; i due pannelli riempiono lo schermo e scorrono ognuno per conto suo, «Invia comanda»
// resta sempre in vista. Telefono: un pannello per volta («＋ Aggiungi» / «Fatto»), scorre la pagina.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Btn, Modal, PageLayout, TextInput } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import ComandeNav, { ProvaPill } from "./ComandeNav";
import { ScegliOspite, SchedaOspite } from "./ComandePrenotazione";
import { api, euro, nomeUscita, useAltezzaRestante, useSchermoLargo } from "./comandeApi";

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
// Tasti della barra in fondo e della testata: 48 e 44 px, da dito.
const BARRA = "min-h-[48px] rounded-xl px-3 text-sm font-semibold disabled:opacity-50";
const BIANCO = "border border-neutral-300 bg-white text-brand-ink active:bg-neutral-100";
const TESTATA = "min-h-[44px] shrink-0 rounded-xl border px-3 text-sm font-semibold";
const ICONA = "h-11 w-11 shrink-0 rounded-xl text-lg font-semibold";
const nascosta = { scrollbarWidth: "none" }; // strisce che scorrono di lato, senza barra

export default function ComandeConto() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [conto, setConto] = useState(null);
  // Quello che Prenotazioni non ha potuto fare (turno chiuso…): il conto va avanti, ma si dice.
  const [avviso, setAvviso] = useState(() => (location.state && location.state.avviso) || null);
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
  const [legame, setLegame] = useState(false); // finestra «Chi è al tavolo» (prenotazioni del giorno)
  const [menu, setMenu] = useState(false); // telefono: le azioni del tavolo dietro «⋯»
  const largo = useSchermoLargo();
  // iPad: i pannelli sono alti ESATTAMENTE quanto resta. Telefono: ALMENO quanto resta, così la barra
  // (Aggiungi · Uscita · Invia) sta in fondo allo schermo, sotto il pollice, anche a comanda corta.
  const [refPannelli, altezza] = useAltezzaRestante(true);

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
      if (c && c.id) {
        setConto(c);
        setAvviso(c.avviso || null);
      }
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

  // Chi è al tavolo: un prenotato, un walk-in, un cliente che c'è già o uno nuovo (null = nessuno).
  // Prenotazioni la sistema il server: «Seduto» a questo tavolo, o una prenotazione «Walk-in» nuova.
  const mettiAlTavolo = async (scelta) => {
    const ok = await esegui(
      () => api(`/comande/conti/${id}`, { method: "PATCH", body: { ospite: scelta ? scelta.ospite : null } }),
      scelta ? `Al tavolo: ${scelta.info.nome}` : "Nessuno al tavolo"
    );
    if (ok) setLegame(false);
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
    <div key={r.id} className="flex min-h-[46px] items-center gap-2 border-t border-neutral-100 px-2 py-px">
      {r.stato === "da_inviare" && aperto ? (
        <div className="flex shrink-0 items-center gap-1">
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
          <span className="w-5 text-center font-semibold tabular-nums">{r.quantita}</span>
          <button
            aria-label="Uno in più"
            className="h-11 w-11 rounded-lg border border-neutral-300 text-lg"
            onClick={() => esegui(() => api(`/comande/righe/${r.id}`, { method: "PATCH", body: { quantita: r.quantita + 1 } }))}
          >
            +
          </button>
        </div>
      ) : (
        <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{r.quantita}</span>
      )}
      <button
        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left"
        disabled={!aperto || r.stato === "stornata"}
        onClick={() => {
          setNotaRiga(r.nota || "");
          setMotivo("");
          setRigaAperta(r);
        }}
      >
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-medium leading-tight ${r.stato === "stornata" ? "text-neutral-400 line-through" : "text-brand-ink"}`}>
            {r.nome}
          </span>
          {(r.nota || (r.stato === "stornata" && r.motivo_storno)) && (
            <span className="block truncate text-xs text-neutral-500">
              {r.nota ? `📝 ${r.nota}` : ""}
              {r.stato === "stornata" && r.motivo_storno ? `${r.nota ? " · " : ""}${r.motivo_storno}` : ""}
            </span>
          )}
        </span>
        <span className={`shrink-0 text-[11px] ${r.reparto ? "text-neutral-400" : "font-semibold text-amber-700"}`}>
          {r.reparto ? conto.reparti[r.reparto] || r.reparto : "senza reparto"}
        </span>
      </button>
      {(r.stato === "stornata" || (r.stato === "da_inviare" && !uscitaNuova)) && (
        <span className={`shrink-0 rounded-full border px-1.5 text-[10px] ${STATO_RIGA[r.stato].cls}`}>{STATO_RIGA[r.stato].label}</span>
      )}
    </div>
  );

  // Le due metà della pagina. Su schermo largo stanno affiancate e alte quanto lo schermo;
  // su telefono se ne vede una per volta e scorre la pagina.
  const catalogoVisibile = aperto && (largo || vista === "catalogo");
  const comandaVisibile = largo || vista === "conto" || !aperto;

  return (
    <PageLayout nav={<ComandeNav current="tavoli" />} background={false} padded={false} wide>
      <div className="bg-brand-cream px-3 pb-3 pt-2 font-sans sm:px-4">
        {/* Testata su una riga: tavolo, coperti, totale, azioni */}
        <div className="mb-2 flex items-center gap-2">
          <button aria-label="Torna ai tavoli" onClick={() => navigate("/comande")} className={`${ICONA} ${BIANCO}`}>
            ←
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold leading-tight text-brand-ink">Tavolo {conto.tavolo}</h1>
            <div className="truncate text-[11px] leading-tight text-neutral-500">
              {!largo && <span className="font-semibold text-amber-700">in prova · </span>}
              {largo && conto.zona ? `${conto.zona} · ` : ""}
              {largo ? "aperto alle " : ""}
              {ora(conto.aperto_at)}
              {largo && conto.aperto_da ? ` da ${conto.aperto_da}` : ""}
              {aperto ? "" : ` · ${conto.stato}`}
            </div>
          </div>
          {largo && <ProvaPill />}
          <button disabled={!aperto} onClick={apriCoperti} className={`${TESTATA} border-rose-200 bg-rose-50 text-rose-900`}>
            👤 {conto.coperti}
            {largo ? (conto.coperti === 1 ? " coperto" : " coperti") : ""}
            {conto.coperto && conto.coperto.omaggio ? (largo ? " · omaggio" : " ·🎁") : ""}
          </button>
          <span className={`${TESTATA} flex items-center border-neutral-200 bg-white font-bold text-brand-ink`}>{euro(conto.totale)}</span>
          {largo && aperto && (
            <>
              <button onClick={apriSposta} className={`${TESTATA} ${BIANCO}`}>Sposta</button>
              <button onClick={() => setChiudi(true)} className={`${TESTATA} ${BIANCO}`}>Chiudi tavolo</button>
            </>
          )}
          {!largo && aperto && (
            <button aria-label="Azioni del tavolo" onClick={() => setMenu(true)} className={`${ICONA} ${BIANCO}`}>
              ⋯
            </button>
          )}
        </div>
        {errore && (
          <div className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800">{errore}</div>
        )}
        {avviso && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900">
            <span className="min-w-0 flex-1">{avviso}</span>
            <button aria-label="Chiudi l'avviso" className="h-11 w-11 shrink-0 rounded-lg text-lg" onClick={() => setAvviso(null)}>✕</button>
          </div>
        )}

        <div
          ref={refPannelli}
          style={altezza ? (largo ? { height: altezza } : { minHeight: altezza }) : undefined}
          className={
            largo
              ? `grid min-h-0 gap-3 ${aperto ? "grid-cols-[minmax(0,1fr)_minmax(320px,38%)] lg:grid-cols-[minmax(0,1fr)_400px]" : "grid-cols-1"}`
              : "flex flex-col"
          }
        >
          {/* Catalogo a elenco */}
          {catalogoVisibile && (
            <section className={largo ? "flex min-h-0 min-w-0 flex-col" : "flex min-w-0 flex-1 flex-col"}>
              <TextInput value={cerca} onChange={setCerca} placeholder="Cerca un piatto, un vino, un codice…" />
              <div className="my-2 flex shrink-0 items-center gap-2 overflow-x-auto" style={nascosta}>
                <span className="shrink-0 text-xs text-neutral-600">Si aggiunge in</span>
                <span className="shrink-0 rounded-full bg-brand-ink px-3 py-1 text-xs font-bold text-white">{nomeUscita(battuta)}</span>
                {tasti.map((t) => (
                  <button
                    key={t.id}
                    disabled={busy}
                    onClick={() => toccaTasto(t)}
                    className="min-h-[44px] shrink-0 whitespace-nowrap rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900 active:scale-[0.98] disabled:opacity-50"
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
                <div className={`flex flex-col gap-2 lg:flex-row ${largo ? "min-h-0 flex-1" : ""}`}>
                  {!cerca && (
                    <div
                      className="flex shrink-0 gap-1 overflow-x-auto lg:w-40 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden"
                      style={nascosta}
                    >
                      {catalogo.gruppi.map((g) => (
                        <button
                          key={g.nome}
                          onClick={() => setGruppo(g.nome)}
                          className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-xl px-3 text-left text-sm font-semibold lg:whitespace-normal ${
                            gruppo === g.nome ? "bg-brand-ink text-white" : "text-brand-ink hover:bg-white"
                          }`}
                        >
                          {g.nome} <span className="text-xs font-normal opacity-60">{g.n}</span>
                        </button>
                      ))}
                      <button
                        onClick={() => setFuoriCarta({ nome: "", prezzo: "", famiglia: "food" })}
                        className="min-h-[44px] shrink-0 whitespace-nowrap rounded-xl border border-dashed border-neutral-400 px-3 text-left text-sm"
                      >
                        ＋ Fuori carta
                      </button>
                    </div>
                  )}
                  <div
                    className={`min-w-0 divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white ${
                      largo ? "min-h-0 flex-1 overflow-y-auto" : "overflow-hidden"
                    }`}
                  >
                    {articoli.slice(0, 300).map((a) => (
                      <button
                        key={a.codice}
                        disabled={busy}
                        onClick={() => tocca(a)}
                        className="flex min-h-[48px] w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-rose-50 active:bg-rose-100"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold leading-tight text-brand-ink">{a.nome}</span>
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
              )}
              {!largo && (
                <div className="sticky bottom-2 mt-auto pt-2">
                  <button className={`${BARRA} w-full bg-brand-blue text-white shadow-lg`} onClick={() => setVista("conto")}>
                    Fatto{conto.da_inviare ? ` · ${conto.da_inviare} da inviare` : ""}
                  </button>
                </div>
              )}
            </section>
          )}

          {/* La comanda, per uscite */}
          {comandaVisibile && (
            <section className={largo ? "flex min-h-0 min-w-0 flex-col" : "flex min-w-0 flex-1 flex-col"}>
              {conto.prenotazione || conto.ospite ? (
                <SchedaOspite conto={conto} onApri={aperto ? () => setLegame(true) : null} />
              ) : (
                aperto && (
                  <button
                    onClick={() => setLegame(true)}
                    className="mb-2 min-h-[44px] w-full shrink-0 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/60 px-3 text-left text-sm font-semibold text-indigo-900"
                  >
                    ＋ Chi è al tavolo
                  </button>
                )
              )}

              <div className={largo ? "min-h-0 flex-1 space-y-2 overflow-y-auto" : "flex-1 space-y-2"}>
                {rigaCoperto && (
                  <div className="px-1 text-[11px] text-neutral-500">
                    In conto anche {rigaCoperto.quantita} × {rigaCoperto.nome} {euro(rigaCoperto.totale)}
                  </div>
                )}
                {daMostrare.length === 0 && (
                  <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-5 text-center text-sm text-neutral-500">
                    Conto vuoto.
                  </div>
                )}
                {daMostrare.map((u) => {
                  const sue = conto.righe.filter((r) => r.uscita === u.numero && !eCoperto(r));
                  const qui = aperto && u.numero === battuta;
                  const prima = primaInAttesa && u.numero === primaInAttesa.numero;
                  const chiamabile = u.stato === "andata" && u.numero > 0;
                  const haAzioni = aperto && (!qui || chiamabile);
                  return (
                    <div
                      key={u.numero}
                      className={`overflow-hidden rounded-xl border bg-white ${
                        qui ? "border-2 border-brand-ink" : prima ? "border-blue-600" : "border-neutral-200"
                      }`}
                    >
                      <div className={`flex min-h-[44px] items-center gap-1 pl-3 pr-1 text-sm font-bold ${TESTA_USCITA[u.stato]}`}>
                        <span className="min-w-0 flex-1 py-1 leading-tight">
                          {nomeUscita(u.numero)}
                          <span className="font-normal">
                            {u.stato === "andata" && ` · andata${u.andata_at ? ` ${ora(u.andata_at)}` : ""}`}
                            {u.stato === "attende" && " · attende"}
                            {u.stato === "nuova" && (sue.length ? " · da inviare" : " · vuota")}
                            {u.stato !== "nuova" && u.da_inviare > 0 && ` · ${u.da_inviare} da inviare`}
                            {u.solleciti > 0 && ` · sollecitata ${u.solleciti}×`}
                            {qui && " · si aggiunge qui"}
                          </span>
                        </span>
                        {haAzioni && (
                          <button
                            className="h-11 w-11 shrink-0 rounded-lg text-lg"
                            aria-label={`Azioni su ${nomeUscita(u.numero)}`}
                            aria-expanded={azioniDi === u.numero}
                            onClick={() => setAzioniDi(azioniDi === u.numero ? null : u.numero)}
                          >
                            ⋯
                          </button>
                        )}
                      </div>
                      {haAzioni && azioniDi === u.numero && (
                        <div className={`flex flex-wrap gap-2 border-t border-black/5 px-2 py-1.5 ${TESTA_USCITA[u.stato]}`}>
                          {!qui && (
                            <button
                              className={AZ}
                              onClick={() => {
                                setUscitaScelta(u.numero);
                                setAzioniDi(null);
                                if (!largo) setVista("catalogo");
                              }}
                            >
                              ＋ Aggiungi qui
                            </button>
                          )}
                          {chiamabile && (
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
                        <div className="border-t border-neutral-100 p-1.5">
                          <button
                            disabled={busy}
                            onClick={() => chiama(u.numero, "vai", `${nomeUscita(u.numero)}: vai`)}
                            className={`${BARRA} w-full ${prima ? "bg-brand-blue text-white" : BIANCO}`}
                          >
                            Vai con la preparazione
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {conto.invii.length > 0 && (
                  <p className="px-1 text-[11px] text-neutral-500">
                    {conto.invii.length} {conto.invii.length === 1 ? "foglio" : "fogli"} ai reparti · la stampa arriva col ponte
                  </p>
                )}
              </div>

              {aperto && (
                <div
                  className={
                    largo
                      ? "mt-2 flex shrink-0 gap-2"
                      : "sticky bottom-2 mt-2 flex gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-1.5 shadow-lg backdrop-blur"
                  }
                >
                  {!largo && (
                    <button className={`${BARRA} flex-1 ${BIANCO}`} onClick={() => setVista("catalogo")}>＋ Aggiungi</button>
                  )}
                  <button className={`${BARRA} whitespace-nowrap ${BIANCO} ${largo ? "" : "flex-1"}`} onClick={() => setUscitaScelta(prossimaUscita)}>
                    ＋ {largo ? "Nuova uscita" : "Uscita"}
                  </button>
                  <button
                    className={`${BARRA} flex-[1.3] whitespace-nowrap bg-brand-green text-white active:bg-emerald-700`}
                    disabled={!conto.da_inviare || busy}
                    onClick={invia}
                  >
                    {largo ? "Invia comanda" : "Invia"}
                    {conto.da_inviare ? ` · ${conto.da_inviare}` : ""}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
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

      {/* Telefono: azioni del tavolo */}
      <Modal open={menu} onClose={() => setMenu(false)} title={`Tavolo ${conto.tavolo}`} size="sm">
        <div className="flex flex-col gap-2">
          <button className={`${BARRA} ${BIANCO} text-left`} onClick={() => { setMenu(false); setLegame(true); }}>
            Chi è al tavolo{conto.ospite ? `: ${conto.ospite}` : ""}
          </button>
          <button className={`${BARRA} ${BIANCO} text-left`} onClick={() => { setMenu(false); apriSposta(); }}>
            Sposta su un altro tavolo
          </button>
          <button className={`${BARRA} ${BIANCO} text-left`} onClick={() => { setMenu(false); setChiudi(true); }}>
            Chiudi tavolo
          </button>
        </div>
      </Modal>

      {/* Chi è al tavolo */}
      <Modal
        open={legame}
        onClose={() => setLegame(false)}
        title={`Chi è al tavolo ${conto.tavolo}`}
        subtitle={
          imp && imp.prenotazioni_aggiorna
            ? "Prenotazioni si aggiorna da sola: «Seduto» a questo tavolo, o un walk-in nuovo"
            : "Il nome resta sul conto: Prenotazioni non cambia (Impostazioni)"
        }
        size="md"
        footer={
          <>
            {(conto.ospite || conto.prenotazione_id) && (
              <Btn variant="secondary" disabled={busy} onClick={() => mettiAlTavolo(null)}>
                Nessuno al tavolo
              </Btn>
            )}
            <Btn variant="secondary" onClick={() => setLegame(false)}>Chiudi</Btn>
          </>
        }
      >
        {legame && (
          <ScegliOspite
            data={String(conto.aperto_at || "").slice(0, 10)}
            tavolo={conto.tavolo}
            scelta={
              conto.prenotazione_id && !conto.pren_creata
                ? `p${conto.prenotazione_id}`
                : conto.cliente_id
                  ? `c${conto.cliente_id}`
                  : conto.ospite
                    ? "walkin"
                    : null
            }
            onScegli={mettiAlTavolo}
          />
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
          {conto.prenotazione_id && imp && imp.prenotazioni_aggiorna && (
            <span className="mt-2 block">
              In Prenotazioni: con «Chiudi» {conto.ospite || "la prenotazione"} passa a «Completata»; con «Annulla conto»
              torna tutto com'era{conto.pren_creata ? " (il walk-in nato da questo tavolo sparisce)" : ""}.
            </span>
          )}
        </p>
      </Modal>
    </PageLayout>
  );
}
