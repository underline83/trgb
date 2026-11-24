// @version: v1.1 — coperto in conto da solo (con omaggio), tasti rapidi a 0 € (2026-11-24)
// Modulo: comande
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Btn, Modal, PageLayout, TextInput } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import ComandeNav, { BannerProva } from "./ComandeNav";
import { api, euro, nomeUscita } from "./comandeApi";

const STATO = {
  da_inviare: { label: "da inviare", cls: "bg-amber-100 text-amber-900 border-amber-200" },
  inviata: { label: "inviata", cls: "bg-emerald-100 text-emerald-900 border-emerald-200" },
  stornata: { label: "stornata", cls: "bg-neutral-100 text-neutral-500 border-neutral-200 line-through" },
};
// Il coperto non è una riga da inviare: segue i coperti e si cambia da lì.
const eCoperto = (r) => r.articolo_tipo === "coperto";
const BADGE_COPERTO = "bg-rose-50 text-rose-900 border-rose-200";
const FAMIGLIE_FUORI_CARTA = [
  { key: "food", label: "Cucina" },
  { key: "beverage", label: "Da bere" },
  { key: "servizio", label: "Servizio" },
];

export default function ComandeConto() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [conto, setConto] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [imp, setImp] = useState(null);
  const [errore, setErrore] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  const [catAperto, setCatAperto] = useState(false);
  const [uscitaScelta, setUscitaScelta] = useState(null); // null = quella proposta per il tipo di articolo
  const [cerca, setCerca] = useState("");
  const [gruppo, setGruppo] = useState(null);

  const [prezzoPer, setPrezzoPer] = useState(null); // articolo a prezzo libero
  const [prezzo, setPrezzo] = useState("");
  const [fuoriCarta, setFuoriCarta] = useState(null); // {nome, prezzo, famiglia}
  const [rigaAperta, setRigaAperta] = useState(null); // riga da modificare o stornare
  const [notaRiga, setNotaRiga] = useState("");
  const [motivo, setMotivo] = useState("");
  const [copertiEdit, setCopertiEdit] = useState(null);
  const [omaggioEdit, setOmaggioEdit] = useState(false);
  const [chiudi, setChiudi] = useState(false);

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
  }, [carica]);

  const apriCatalogo = async () => {
    setCatAperto(true);
    if (!catalogo) {
      try {
        setCatalogo(await api("/comande/catalogo/"));
      } catch (e) {
        setErrore(e.message);
      }
    }
  };

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

  const uscitaPer = (a) => {
    if (uscitaScelta !== null) return uscitaScelta;
    const v = imp && imp.config ? Number(imp.config[`uscita_${a.famiglia}`]) : NaN;
    return Number.isFinite(v) ? v : a.famiglia === "food" ? 1 : 0;
  };

  const aggiungi = (a, prezzoLibero) => {
    const uscita = uscitaPer(a);
    // stesso articolo, stessa uscita, senza note: si alza la quantità invece di fare una riga nuova
    const uguale =
      !a.prezzo_libero &&
      conto.righe.find(
        (r) =>
          r.stato === "da_inviare" && r.articolo_codice === a.codice && r.uscita === uscita &&
          !r.nota && (!r.varianti || r.varianti.length === 0)
      );
    if (uguale) {
      return esegui(
        () => api(`/comande/righe/${uguale.id}`, { method: "PATCH", body: { quantita: uguale.quantita + 1 } }),
        `${a.nome} ×${uguale.quantita + 1}`
      );
    }
    const riga = { codice: a.codice, quantita: 1, uscita };
    if (a.prezzo_libero) riga.prezzo = prezzoLibero;
    return esegui(
      () => api(`/comande/conti/${id}/righe`, { method: "POST", body: { righe: [riga] } }),
      `+ ${a.nome}`
    );
  };

  // Tasto rapido («Stuzzico», «Pane»): 0 €, quantità proposta dai coperti; un secondo tocco ne aggiunge uno.
  const toccaTasto = (t) => {
    const uguale = conto.righe.find(
      (r) => r.stato === "da_inviare" && r.articolo_codice === t.codice && !r.nota
    );
    if (uguale) {
      return esegui(
        () => api(`/comande/righe/${uguale.id}`, { method: "PATCH", body: { quantita: uguale.quantita + 1 } }),
        `${t.nome} ×${uguale.quantita + 1}`
      );
    }
    return esegui(
      () => api(`/comande/conti/${id}/righe`, { method: "POST", body: { righe: [{ tasto: t.id }] } }),
      `+ ${t.nome} ×${t.quantita}`
    );
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

  const tocca = (a) => {
    if (a.prezzo_libero) {
      setPrezzo(a.prezzo ? String(a.prezzo) : "");
      setPrezzoPer(a);
    } else {
      aggiungi(a);
    }
  };

  const articoli = useMemo(() => {
    if (!catalogo) return [];
    const q = cerca.trim().toLowerCase();
    return catalogo.articoli.filter((a) => {
      if (q) return `${a.nome} ${a.dettaglio} ${a.codice}`.toLowerCase().includes(q);
      return !gruppo || a.gruppo === gruppo;
    });
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
  // Prezzo del coperto a prezzo pieno: quello della riga, o delle Impostazioni se ora è in omaggio.
  const prezzoCoperto = !conto.coperto
    ? null
    : !conto.coperto.omaggio
      ? conto.coperto.prezzo
      : imp && imp.coperto ? imp.coperto.prezzo : null;
  const uscite = Array.from(new Set(conto.righe.map((r) => r.uscita))).sort((a, b) => a - b);
  const usciteVia = Array.from(
    new Set(conto.righe.filter((r) => r.stato === "inviata" && r.uscita >= 1 && r.reparto).map((r) => r.uscita))
  ).sort((a, b) => a - b);
  const sceltaUscite = [0, ...Array.from({ length: conto.uscite_numero || 4 }, (_, i) => i + 1)];

  return (
    <PageLayout
      nav={<ComandeNav current="tavoli" />}
      title={`Tavolo ${conto.tavolo}`}
      subtitle={`${conto.zona || ""} · aperto alle ${String(conto.aperto_at).slice(11, 16)}${
        conto.aperto_da ? ` da ${conto.aperto_da}` : ""
      }${aperto ? "" : ` · ${conto.stato}`}`}
      actions={<Btn variant="secondary" onClick={() => navigate("/comande")}>← Tavoli</Btn>}
    >
      <BannerProva />
      {errore && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{errore}</div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          disabled={!aperto}
          onClick={apriCoperti}
          className="min-h-[44px] rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900"
        >
          👤 {conto.coperti} coperti{conto.coperto && conto.coperto.omaggio ? " · coperto omaggio" : ""}
        </button>
        <span className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink">
          Totale {euro(conto.totale)}
        </span>
        {conto.uscita_corrente > 0 && (
          <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Via fino alla {conto.uscita_corrente}ª
          </span>
        )}
      </div>

      {aperto && tasti.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {tasti.map((t) => (
            <button
              key={t.id}
              disabled={busy}
              onClick={() => toccaTasto(t)}
              className="min-h-[44px] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 active:scale-[0.98] disabled:opacity-50"
            >
              {t.nome} <span className="font-normal opacity-70">×{t.quantita}</span>
            </button>
          ))}
          <span className="text-xs text-neutral-500">a 0 €, partono col prossimo «Invia»</span>
        </div>
      )}

      {conto.righe.length === 0 && (
        <div className="mb-4 rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
          Ancora niente. Tocca «＋ Aggiungi».
        </div>
      )}

      {uscite.map((u) => (
        <section key={u} className="mb-4">
          <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-neutral-500">{nomeUscita(u)}</h2>
          <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {conto.righe
              .filter((r) => r.uscita === u)
              .map((r) => (
                <div key={r.id} className="flex items-center gap-2 px-3 py-2.5">
                  {r.stato === "da_inviare" && aperto ? (
                    <div className="flex items-center gap-1">
                      <button
                        className="h-9 w-9 rounded-lg border border-neutral-300 text-lg"
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
                        className="h-9 w-9 rounded-lg border border-neutral-300 text-lg"
                        onClick={() => esegui(() => api(`/comande/righe/${r.id}`, { method: "PATCH", body: { quantita: r.quantita + 1 } }))}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <span className="w-[5.5rem] text-center font-semibold tabular-nums">{r.quantita}×</span>
                  )}
                  <button
                    className="min-w-0 flex-1 text-left"
                    disabled={!aperto || r.stato === "stornata"}
                    onClick={() => {
                      if (eCoperto(r)) return apriCoperti();
                      setNotaRiga(r.nota || "");
                      setMotivo("");
                      setRigaAperta(r);
                    }}
                  >
                    <div className={`truncate text-sm font-medium ${r.stato === "stornata" ? "text-neutral-400 line-through" : "text-brand-ink"}`}>
                      {r.nome}
                    </div>
                    <div className="truncate text-xs text-neutral-500">
                      {r.nota ? `📝 ${r.nota} · ` : ""}
                      {eCoperto(r)
                        ? "segue i coperti · tocca per cambiarli"
                        : r.reparto ? (conto.reparti[r.reparto] || r.reparto) : "nessun reparto"}
                      {r.stato === "stornata" && r.motivo_storno ? ` · ${r.motivo_storno}` : ""}
                    </div>
                  </button>
                  <div className="text-right">
                    <div className="text-sm tabular-nums">{euro(r.totale)}</div>
                    {eCoperto(r) && r.stato !== "stornata" ? (
                      <span className={`rounded-full border px-1.5 text-[10px] ${BADGE_COPERTO}`}>coperto</span>
                    ) : (
                      <span className={`rounded-full border px-1.5 text-[10px] ${STATO[r.stato].cls}`}>{STATO[r.stato].label}</span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}

      {conto.invii.length > 0 && (
        <p className="mb-2 text-xs text-neutral-500">
          {conto.invii.length} {conto.invii.length === 1 ? "invio" : "invii"} ai reparti · la stampa sulle comande arriva col ponte
        </p>
      )}

      {aperto && <div className="h-28" aria-hidden="true" />}

      {aperto && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-3 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
            <Btn variant="secondary" size="lg" onClick={apriCatalogo}>＋ Aggiungi</Btn>
            <Btn
              variant="success"
              size="lg"
              disabled={!conto.da_inviare || busy}
              onClick={() => esegui(() => api(`/comande/conti/${id}/invia`, { method: "POST" }), "Inviata")}
            >
              Invia{conto.da_inviare ? ` (${conto.da_inviare})` : ""}
            </Btn>
            {usciteVia.map((u) => (
              <Btn
                key={u}
                variant={u === conto.uscita_corrente + 1 ? "primary" : "secondary"}
                size="lg"
                disabled={busy}
                onClick={() => esegui(() => api(`/comande/conti/${id}/via`, { method: "POST", body: { uscita: u } }), `Via la ${u}ª`)}
              >
                Via la {u}ª
              </Btn>
            ))}
            <Btn variant="ghost" size="lg" className="ml-auto" onClick={() => setChiudi(true)}>Chiudi tavolo</Btn>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-brand-ink px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Catalogo */}
      <Modal open={catAperto} onClose={() => setCatAperto(false)} title="Aggiungi" tone="rose" size="xl"
        subtitle={catalogo && catalogo.carta ? `Carta ${catalogo.carta}` : ""}>
        <div className="mb-2 flex flex-wrap gap-1.5">
          <span className="self-center text-xs text-neutral-500">Uscita:</span>
          <button
            onClick={() => setUscitaScelta(null)}
            className={`rounded-full border px-3 py-1.5 text-xs ${uscitaScelta === null ? "border-rose-300 bg-rose-100 text-rose-900" : "border-neutral-200 bg-white"}`}
          >
            Automatica
          </button>
          {sceltaUscite.map((u) => (
            <button
              key={u}
              onClick={() => setUscitaScelta(u)}
              className={`rounded-full border px-3 py-1.5 text-xs ${uscitaScelta === u ? "border-rose-300 bg-rose-100 text-rose-900" : "border-neutral-200 bg-white"}`}
            >
              {u === 0 ? "Subito" : `${u}ª`}
            </button>
          ))}
        </div>
        <TextInput value={cerca} onChange={setCerca} placeholder="Cerca un piatto, un vino, un codice…" />
        {catalogo && catalogo.avvisi && catalogo.avvisi.length > 0 && (
          <div className="mt-2 text-xs text-amber-800">{catalogo.avvisi.join(" · ")}</div>
        )}
        {!catalogo ? (
          <TrgbLoader />
        ) : (
          <>
            {!cerca && (
              <div className="my-2 flex gap-1.5 overflow-x-auto pb-1">
                <button
                  onClick={() => setGruppo(null)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${!gruppo ? "border-brand-ink bg-brand-ink text-white" : "border-neutral-200 bg-white"}`}
                >
                  Tutto
                </button>
                {catalogo.gruppi.map((g) => (
                  <button
                    key={g.nome}
                    onClick={() => setGruppo(g.nome)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${gruppo === g.nome ? "border-brand-ink bg-brand-ink text-white" : "border-neutral-200 bg-white"}`}
                  >
                    {g.nome} <span className="opacity-60">{g.n}</span>
                  </button>
                ))}
                <button
                  onClick={() => setFuoriCarta({ nome: "", prezzo: "", famiglia: "food" })}
                  className="shrink-0 rounded-full border border-dashed border-neutral-400 px-3 py-1.5 text-xs"
                >
                  ＋ Fuori carta
                </button>
              </div>
            )}
            <div className="mt-2 max-h-[55vh] divide-y divide-neutral-100 overflow-y-auto rounded-xl border border-neutral-200">
              {articoli.slice(0, 200).map((a) => (
                <button
                  key={a.codice}
                  disabled={busy}
                  onClick={() => tocca(a)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-rose-50 active:bg-rose-100"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-brand-ink">{a.nome}</div>
                    <div className="truncate text-xs text-neutral-500">
                      {cerca || !gruppo ? `${a.gruppo}` : ""}
                      {a.dettaglio ? `${cerca || !gruppo ? " · " : ""}${a.dettaglio}` : ""}
                    </div>
                  </div>
                  <span className="text-sm tabular-nums text-neutral-700">
                    {a.prezzo_libero ? "prezzo?" : euro(a.prezzo)}
                  </span>
                  <span className="text-lg text-rose-700">＋</span>
                </button>
              ))}
              {articoli.length === 0 && <div className="p-4 text-center text-sm text-neutral-500">Niente trovato</div>}
            </div>
          </>
        )}
      </Modal>

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
              disabled={!(Number(String(prezzo).replace(",", ".")) >= 0) || prezzo === ""}
              onClick={async () => {
                const ok = await aggiungi(prezzoPer, Number(String(prezzo).replace(",", ".")));
                if (ok) setPrezzoPer(null);
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
        size="sm"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setFuoriCarta(null)}>Annulla</Btn>
            <Btn
              disabled={!fuoriCarta || !fuoriCarta.nome.trim() || fuoriCarta.prezzo === ""}
              onClick={async () => {
                const f = fuoriCarta;
                const p = Number(String(f.prezzo).replace(",", "."));
                const u = uscitaPer({ famiglia: f.famiglia });
                const ok = await esegui(
                  () => api(`/comande/conti/${id}/righe`, {
                    method: "POST",
                    body: { righe: [{ nome: f.nome.trim(), prezzo: p, famiglia: f.famiglia, quantita: 1, uscita: u }] },
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
            <div className="flex gap-1.5">
              {FAMIGLIE_FUORI_CARTA.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFuoriCarta({ ...fuoriCarta, famiglia: f.key })}
                  className={`rounded-full border px-3 py-1.5 text-xs ${fuoriCarta.famiglia === f.key ? "border-rose-300 bg-rose-100 text-rose-900" : "border-neutral-200 bg-white"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Riga: modifica (non inviata) o storno (inviata) */}
      <Modal
        open={!!rigaAperta}
        onClose={() => setRigaAperta(null)}
        title={rigaAperta ? rigaAperta.nome : ""}
        subtitle={rigaAperta ? `${nomeUscita(rigaAperta.uscita)} · ${STATO[rigaAperta.stato].label}` : ""}
        size="sm"
        footer={
          rigaAperta && rigaAperta.stato === "inviata" ? (
            <>
              <Btn variant="secondary" onClick={() => setRigaAperta(null)}>Annulla</Btn>
              <Btn
                variant="danger"
                disabled={!motivo.trim()}
                onClick={async () => {
                  const ok = await esegui(
                    () => api(`/comande/righe/${rigaAperta.id}/storna`, { method: "POST", body: { motivo } }),
                    "Stornata"
                  );
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
            <TextInput value={notaRiga} onChange={setNotaRiga} placeholder="Nota per il reparto (es. ben cotta)" />
            <div>
              <div className="mb-1 text-xs text-neutral-500">Uscita</div>
              <div className="flex flex-wrap gap-1.5">
                {sceltaUscite.map((u) => (
                  <button
                    key={u}
                    onClick={async () => {
                      const ok = await esegui(() => api(`/comande/righe/${rigaAperta.id}`, { method: "PATCH", body: { uscita: u } }));
                      if (ok) setRigaAperta({ ...rigaAperta, uscita: u });
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs ${rigaAperta.uscita === u ? "border-rose-300 bg-rose-100 text-rose-900" : "border-neutral-200 bg-white"}`}
                  >
                    {u === 0 ? "Subito" : `${u}ª`}
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
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={omaggioEdit}
              onChange={(e) => setOmaggioEdit(e.target.checked)}
            />
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
