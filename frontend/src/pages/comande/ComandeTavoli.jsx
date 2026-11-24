// @version: v2.1 — i tavoli prenotati e chi c'è seduto; all'apertura si lega la prenotazione (2026-11-24)
// Modulo: comande
// La mappa riusa le forme della piantina di Prenotazioni: stessi tavoli, stesso disegno
// (li disegna l'Editor Tavoli; qui si leggono dal servizio platform tavoli_sala_service).
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Btn, EmptyState, Modal, PageLayout } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import { CANVAS_W, CANVAS_H, FormaElemento, FormaTavolo, SchedeSale } from "../prenotazioni/components/Piantina";
import ComandeNav, { BannerProva } from "./ComandeNav";
import { ScegliPrenotazione, etichettaPrenotazione } from "./ComandePrenotazione";
import { api, durata, euro, utenteCorrente } from "./comandeApi";

const AGGIORNA_OGNI_MS = 20000;
const CHIAVE_VISTA = "comande.tavoli.vista";

// Un tavolo aperto: niente ancora partito (rosa), un'uscita attende la chiamata (blu),
// tutto quello che è stato inviato è andato (verde). Gli stessi colori del conto.
const TINTE = {
  libero: { card: "border-neutral-200 bg-white hover:bg-neutral-50", fill: "#ffffff", stroke: "#d4d4d4", ink: "#525252" },
  // libero ma con una prenotazione del turno scritta sopra: indaco, il colore di Prenotazioni
  prenotato: { card: "border-indigo-300 bg-white hover:bg-indigo-50", fill: "#ffffff", stroke: "#6366f1", ink: "#3730a3" },
  aperto: { card: "border-rose-300 bg-rose-50 text-rose-900", fill: "#ffe4e6", stroke: "#fb7185", ink: "#881337" },
  attende: { card: "border-blue-300 bg-blue-50 text-blue-900", fill: "#dbeafe", stroke: "#2E7BE8", ink: "#1e3a8a" },
  andata: { card: "border-emerald-300 bg-emerald-50 text-emerald-900", fill: "#d1fae5", stroke: "#2EB872", ink: "#064e3b" },
};
const LEGENDA = [
  { key: "prenotato", label: "prenotato" },
  { key: "aperto", label: "aperto, niente partito" },
  { key: "attende", label: "un'uscita attende" },
  { key: "andata", label: "tutto andato" },
];
const statoTavolo = (c) => (!c ? "libero" : c.uscita_attende ? "attende" : c.uscita_andata ? "andata" : "aperto");

// Di un tavolo libero: la prenotazione del turno più vicina a adesso fra quelle non ancora sedute
// (`prossima`), quante altre ce ne sono e — se sono tutte già a un altro tavolo, cioè tavoli
// uniti — con chi sta (`unita`). I minuti li conta il server (tra_minuti).
function prenotato(t) {
  const tutte = t.prenotazioni || [];
  const libere = tutte
    .filter((p) => !p.conto)
    .sort((a, b) => Math.abs(a.tra_minuti ?? 0) - Math.abs(b.tra_minuti ?? 0));
  return {
    prossima: libere[0] || null,
    altre: Math.max(0, libere.length - 1),
    unita: libere.length ? null : tutte[0] || null,
  };
}
const statoDi = (t) => (t.conto ? statoTavolo(t.conto) : prenotato(t).prossima ? "prenotato" : "libero");
const corto = (testo, n) => (String(testo || "").length > n ? `${String(testo).slice(0, n - 1)}…` : String(testo || ""));

// «Uscita 2 di 5 · 12 min»: l'ultima andata, la più alta inviata, da quanto è partita.
function rigaUscite(c) {
  if (!c.uscite_tot) return c.da_inviare ? "da inviare" : "";
  if (!c.uscita_andata) return `Uscita ${c.uscita_attende} di ${c.uscite_tot} · attende`;
  const m = c.minuti_andata ?? null;
  return `Uscita ${c.uscita_andata} di ${c.uscite_tot}${m === null ? "" : ` · ${durata(m)}`}`;
}
// In mappa c'è poco posto: «3/4 · 17′» = andata la 3 di 4, da 17 minuti (il colore dice se una attende).
function rigaUsciteCorta(c) {
  if (!c.uscite_tot) return c.da_inviare ? "da inviare" : "aperto";
  const m = c.minuti_andata ?? null;
  return `${c.uscita_andata || 0}/${c.uscite_tot}${m === null ? "" : ` · ${m}′`}`;
}

// Il riquadro da inquadrare: tavoli ed elementi della sala più un margine, così la mappa
// riempie lo schermo invece di lasciare vuota mezza tela.
const MARGINE = 28;
function riquadro(cose) {
  if (cose.length === 0) return `0 0 ${CANVAS_W} ${CANVAS_H}`;
  const x0 = Math.max(0, Math.min(...cose.map((c) => c.posizione_x)) - MARGINE);
  const y0 = Math.max(0, Math.min(...cose.map((c) => c.posizione_y)) - MARGINE);
  const x1 = Math.min(CANVAS_W, Math.max(...cose.map((c) => c.posizione_x + c.larghezza)) + MARGINE);
  const y1 = Math.min(CANVAS_H, Math.max(...cose.map((c) => c.posizione_y + c.altezza)) + MARGINE);
  return `${x0} ${y0} ${x1 - x0} ${y1 - y0}`;
}

const inPianta = (t) => [t.posizione_x, t.posizione_y, t.larghezza, t.altezza].every((v) => typeof v === "number");
const pill = (on) =>
  `min-h-[44px] rounded-full border px-4 text-sm font-semibold ${
    on ? "border-brand-ink bg-brand-ink text-white" : "border-neutral-300 bg-white text-brand-ink"
  }`;

function vistaSalvata() {
  try {
    return localStorage.getItem(CHIAVE_VISTA) === "mappa" ? "mappa" : "elenco";
  } catch {
    return "elenco";
  }
}

// La sala disegnata: ogni tavolo col suo stato, un tocco apre il tavolo o il suo conto.
function Mappa({ sala, elementi, onTocca, spento }) {
  const fuori = sala.tavoli.filter((t) => !inPianta(t));
  const disegnati = sala.tavoli.filter(inPianta);
  const fissi = elementi.filter((e) => (e.zona || "Sala") === sala.zona && inPianta(e));
  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
        {/* alta quanto resta dello schermo sotto intestazione e schede, così la sala si vede intera */}
        <svg viewBox={riquadro([...disegnati, ...fissi])} className="w-full" style={{ minHeight: 320, maxHeight: "calc(100vh - 320px)" }}>
          {fissi.map((e) => (
            <FormaElemento key={`e${e.id}`} e={e} />
          ))}
          {disegnati.map((t) => {
            const c = t.conto;
            const pr = c ? null : prenotato(t);
            const tinta = TINTE[statoDi(t)];
            const cx = t.posizione_x + t.larghezza / 2;
            const cy = t.posizione_y + t.altezza / 2;
            // in un rombo piccolo la seconda riga non ci sta: va sotto il tavolo
            const dentro = t.forma !== "diamond" || t.larghezza >= 60;
            // seconda riga: a che uscita è (aperto), a che ora è prenotato, o con che tavolo è unito
            const riga2 = c ? rigaUsciteCorta(c) : pr.prossima ? pr.prossima.ora : pr.unita ? `con ${pr.unita.conto.tavolo}` : "";
            // sotto il tavolo: chi c'è seduto, o chi lo ha prenotato
            const chi = c ? c.ospite : pr.prossima ? pr.prossima.nome : "";
            const sotto = t.posizione_y + t.altezza + 9;
            return (
              <g
                key={t.id}
                role="button"
                tabIndex={0}
                aria-label={`Tavolo ${t.nome}${
                  c
                    ? `, ${rigaUscite(c) || "aperto"}${c.ospite ? `, ${c.ospite}` : ""}`
                    : pr.prossima
                      ? `, prenotato alle ${pr.prossima.ora} da ${pr.prossima.nome}`
                      : ", libero"
                }`}
                onClick={() => onTocca(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onTocca(t);
                }}
                opacity={spento(t) ? 0.3 : 1}
                style={{ cursor: "pointer" }}
              >
                <FormaTavolo t={t} fill={tinta.fill} stroke={tinta.stroke} strokeWidth={c ? 2.5 : 1.5} />
                <text x={cx} y={riga2 && dentro ? cy - 6 : cy} textAnchor="middle" dominantBaseline="middle" fontSize="13"
                  fontWeight="bold" fill={tinta.ink} className="pointer-events-none select-none">
                  {t.nome}
                </text>
                {riga2 && (
                  <text x={cx} y={dentro ? cy + 9 : sotto} textAnchor="middle"
                    dominantBaseline="middle" fontSize={dentro ? "8.5" : "9.5"} fill={tinta.ink}
                    stroke="#fafafa" strokeWidth={dentro ? 0 : 3} paintOrder="stroke"
                    className="pointer-events-none select-none">
                    {riga2}
                  </text>
                )}
                {chi && (
                  <text x={cx} y={dentro ? sotto : sotto + 11} textAnchor="middle" dominantBaseline="middle"
                    fontSize="9.5" fontWeight="600" fill={tinta.ink} stroke="#fafafa" strokeWidth="3"
                    paintOrder="stroke" className="pointer-events-none select-none">
                    {corto(chi, 12)}
                  </text>
                )}
                {c && c.da_inviare > 0 && (
                  <circle cx={t.posizione_x + t.larghezza - 3} cy={t.posizione_y + 3} r="6" fill="#E8402B" />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {fuori.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">Non in piantina:</span>
          {fuori.map((t) => (
            <Btn key={t.id} variant="secondary" onClick={() => onTocca(t)}>{t.nome}</Btn>
          ))}
        </div>
      )}
    </>
  );
}

export default function ComandeTavoli() {
  const navigate = useNavigate();
  const io = utenteCorrente();
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [vista, setVista] = useState(vistaSalvata);
  const [sala, setSala] = useState(null);
  const [soloMiei, setSoloMiei] = useState(false);
  const [daAprire, setDaAprire] = useState(null); // tavolo
  const [coperti, setCoperti] = useState(2);
  const [apro, setApro] = useState(false);
  const [prenScelta, setPrenScelta] = useState(null); // prenotazione da legare all'apertura
  const [altra, setAltra] = useState(false); // elenco di tutte le prenotazioni del giorno

  const carica = useCallback(async () => {
    try {
      setDati(await api("/comande/tavoli/"));
      setErrore(null);
    } catch (e) {
      setErrore(e.message);
    }
  }, []);

  useEffect(() => {
    carica();
    const t = setInterval(carica, AGGIORNA_OGNI_MS);
    return () => clearInterval(t);
  }, [carica]);

  const cambiaVista = (v) => {
    setVista(v);
    try {
      localStorage.setItem(CHIAVE_VISTA, v);
    } catch {
      /* senza memoria del browser si riparte dall'elenco */
    }
  };

  const tocca = (t) => {
    if (t.conto) return navigate(`/comande/conto/${t.conto.id}`);
    // Una sola prenotazione possibile su questo tavolo: la propongo già scelta, coi suoi coperti.
    // Se sono di più (o nessuna) non indovino: sceglie chi apre.
    const possibili = (t.prenotazioni || []).filter((p) => !p.conto);
    const sola = possibili.length === 1 ? possibili[0] : null;
    setPrenScelta(sola);
    setAltra(false);
    setCoperti(sola && sola.pax > 0 ? sola.pax : Math.max(1, t.posti_min || 2));
    setDaAprire(t);
  };

  const scegliPren = (p) => {
    setPrenScelta(p);
    setAltra(false);
    if (p && p.pax > 0) setCoperti(p.pax);
  };

  const apri = async () => {
    setApro(true);
    try {
      const body = { tavolo_id: daAprire.id, coperti };
      if (prenScelta) body.prenotazione_id = prenScelta.id;
      const c = await api("/comande/conti/", { method: "POST", body });
      navigate(`/comande/conto/${c.id}`);
    } catch (e) {
      setErrore(e.message);
      setDaAprire(null);
      carica();
    } finally {
      setApro(false);
    }
  };

  const sale = dati ? dati.sale : [];
  const conti = sale.flatMap((s) => s.tavoli.filter((t) => t.conto).map((t) => t.conto));
  const attendono = conti.filter((c) => c.uscita_attende).length;
  const mio = (t) => !!t.conto && t.conto.aperto_da === io;
  const salaAttiva = sale.find((s) => s.zona === sala) || sale[0];
  const conteggi = Object.fromEntries(
    sale.map((s) => [s.zona, `${s.tavoli.filter((t) => t.conto).length}/${s.tavoli.length}`])
  );
  // In elenco «Miei» lascia solo i tavoli che ho aperto io; in mappa spegne quelli aperti da altri.
  const saleElenco = soloMiei
    ? sale.map((s) => ({ ...s, tavoli: s.tavoli.filter(mio) })).filter((s) => s.tavoli.length > 0)
    : sale;

  return (
    <PageLayout
      wide={vista === "mappa"}
      nav={<ComandeNav current="tavoli" />}
      title="Tavoli"
      subtitle={
        dati
          ? `${conti.length} ${conti.length === 1 ? "tavolo aperto" : "tavoli aperti"}${
              attendono ? ` · ${attendono} con un'uscita che attende` : ""
            }`
          : ""
      }
      actions={<Btn variant="secondary" size="md" onClick={carica}>↻ Aggiorna</Btn>}
    >
      <BannerProva />
      {errore && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{errore}</div>
      )}
      {!dati && !errore && <TrgbLoader />}
      {dati && sale.length === 0 && (
        <EmptyState icon="🍽️" title="Nessun tavolo" description="I tavoli si disegnano in Prenotazioni › Editor Tavoli." />
      )}

      {dati && sale.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button className={pill(vista === "elenco")} onClick={() => cambiaVista("elenco")}>Elenco</button>
          <button className={pill(vista === "mappa")} onClick={() => cambiaVista("mappa")}>Mappa</button>
          {io && (
            <button className={pill(soloMiei)} aria-pressed={soloMiei} onClick={() => setSoloMiei((v) => !v)}>
              Miei
            </button>
          )}
          <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-neutral-600">
            {LEGENDA.map((l) => (
              <span key={l.key} className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border" style={{ background: TINTE[l.key].fill, borderColor: TINTE[l.key].stroke }} />
                {l.label}
              </span>
            ))}
          </span>
        </div>
      )}

      {dati && vista === "mappa" && salaAttiva && (
        <>
          <SchedeSale sale={sale.map((s) => s.zona)} attiva={salaAttiva.zona} onChange={setSala} conteggi={conteggi} />
          <Mappa
            sala={salaAttiva}
            elementi={dati.elementi || []}
            onTocca={tocca}
            spento={(t) => soloMiei && !!t.conto && !mio(t)}
          />
        </>
      )}

      {dati && vista === "elenco" && soloMiei && saleElenco.length === 0 && (
        <EmptyState icon="🍽️" title="Nessun tavolo aperto da te" />
      )}
      {dati && vista === "elenco" &&
        saleElenco.map((s) => (
          <section key={s.zona} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">{s.zona}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {s.tavoli.map((t) => {
                const c = t.conto;
                const pr = c ? null : prenotato(t);
                return (
                  <button
                    key={t.id}
                    onClick={() => tocca(t)}
                    className={`min-h-[96px] rounded-2xl border p-2.5 text-left shadow-sm transition active:scale-[0.98] ${TINTE[statoDi(t)].card}`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-lg font-bold text-brand-ink">{t.nome}</span>
                      {c && c.da_inviare > 0 && (
                        <span className="rounded-full bg-brand-red px-1.5 text-xs font-semibold text-white">
                          {c.da_inviare}
                        </span>
                      )}
                    </div>
                    {c ? (
                      <div className="mt-1 text-xs leading-snug">
                        {c.ospite && <div className="truncate font-semibold text-brand-ink">{c.ospite}</div>}
                        <div>👤 {c.coperti} · {durata(c.minuti_aperto)}</div>
                        <div className="font-semibold">{rigaUscite(c) || "aperto"}</div>
                        <div className="flex items-center justify-between">
                          <span>{euro(c.totale)}</span>
                          {c.sollecitata && <span className="font-semibold text-amber-800">sollecitata</span>}
                        </div>
                      </div>
                    ) : pr.prossima ? (
                      <div className="mt-1 text-xs leading-snug text-indigo-950">
                        <div className="truncate font-semibold">{pr.prossima.ora} · {pr.prossima.nome}</div>
                        <div>
                          {pr.prossima.pax} {pr.prossima.pax === 1 ? "persona" : "persone"}
                          {pr.prossima.allergie ? " · ⚠ allergie" : ""}
                        </div>
                        {pr.altre > 0 && <div className="text-indigo-700">+{pr.altre} dopo</div>}
                      </div>
                    ) : pr.unita ? (
                      <div className="mt-1 text-xs leading-snug text-neutral-500">
                        <div className="truncate">{pr.unita.nome}</div>
                        <div>con il tavolo {pr.unita.conto.tavolo}</div>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-neutral-400">{t.posti_min}–{t.posti_max} posti</div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

      {dati && dati.altri_conti.length > 0 && (
        <section className="my-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Conti su tavoli tolti</h2>
          <div className="flex flex-wrap gap-2">
            {dati.altri_conti.map((c) => (
              <Btn key={c.id} variant="secondary" onClick={() => navigate(`/comande/conto/${c.id}`)}>
                {c.tavolo} · {euro(c.totale)}
              </Btn>
            ))}
          </div>
        </section>
      )}

      <Modal
        open={!!daAprire}
        onClose={() => setDaAprire(null)}
        title={daAprire ? `Apri il tavolo ${daAprire.nome}` : ""}
        subtitle={daAprire ? daAprire.zona : ""}
        tone="rose"
        size="md"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDaAprire(null)}>Annulla</Btn>
            <Btn variant="primary" loading={apro} onClick={apri}>Apri</Btn>
          </>
        }
      >
        <div className="py-2 text-center">
          <div className="mb-2 text-sm text-neutral-600">Coperti</div>
          <div className="flex items-center justify-center gap-4">
            <Btn variant="secondary" size="lg" onClick={() => setCoperti((n) => Math.max(0, n - 1))}>−</Btn>
            <span className="w-14 text-4xl font-bold tabular-nums text-brand-ink">{coperti}</span>
            <Btn variant="secondary" size="lg" onClick={() => setCoperti((n) => Math.min(200, n + 1))}>+</Btn>
          </div>
        </div>
        {daAprire && (
          <div className="mt-3 border-t border-neutral-100 pt-3">
            <div className="mb-2 text-sm text-neutral-600">Chi è al tavolo</div>
            <div className="flex flex-wrap gap-2">
              {[
                ...(daAprire.prenotazioni || []),
                ...(prenScelta && !(daAprire.prenotazioni || []).some((p) => p.id === prenScelta.id) ? [prenScelta] : []),
              ].map((p) => (
                <button key={p.id} className={pill(!!prenScelta && prenScelta.id === p.id)} onClick={() => scegliPren(p)}>
                  {etichettaPrenotazione(p)}
                  {p.conto ? ` (al tavolo ${p.conto.tavolo})` : ""}
                </button>
              ))}
              <button className={pill(!prenScelta)} onClick={() => scegliPren(null)}>Senza prenotazione</button>
              <button className={pill(false)} aria-expanded={altra} onClick={() => setAltra((v) => !v)}>
                Un'altra…
              </button>
            </div>
            {prenScelta && prenScelta.allergie && (
              <div className="mt-2 rounded-lg bg-red-100 px-2 py-1 text-sm font-semibold text-red-900">
                ⚠ Allergie: {prenScelta.allergie}
              </div>
            )}
            {altra && (
              <div className="mt-3">
                <ScegliPrenotazione tavolo={daAprire.nome} scelta={prenScelta ? prenScelta.id : null} onScegli={scegliPren} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </PageLayout>
  );
}
