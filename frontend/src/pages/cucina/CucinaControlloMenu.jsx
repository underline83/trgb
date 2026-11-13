// Modulo: cucina
// @version: v1.3 — libro mastro: grammatura, scheda articolo (nome, unità, minimi, riordino, linea), «Crea in Scorte», link a ricetta/ingrediente/articolo · v1.2 — giacenze correggibili ripiano per ripiano (POST …/conta → RETTIFICA), pagina solo admin · v1.1 — spunta «dal gelo diretto» (mig 234) · v1.0 — Cucina › Controllo menu (2026-11-13, mig 233): per ogni piatto in carta quante
//   porzioni si fanno con quello che c'è in casa. Due numeri: «subito» (frigo e dispensa) e
//   «con il gelo». Il collo di bottiglia, cosa manca per un conto completo, il semaforo di linea di oggi.
// Dati: GET /cucina/scorte/controllo-menu (servizio controllo_menu, sola lettura);
//   PUT /cucina/scorte/controllo-menu/elemento scrive «porzioni per pezzo» (per piatto) e «non limita».
// Spec: docs/spec_linea_cucina.md §10.
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import RicetteNav from "../ricette/RicetteNav";
import { API_BASE, apiFetch } from "../../config/api";

const num = (n) => (n == null ? "—" : Number(n).toLocaleString("it-IT", { maximumFractionDigits: 2 }));
const ora = (iso) => (iso ? iso.slice(11, 16) : "");
// «13 nov 22:04 · aryn»: quando e chi ha fatto l'ultimo controllo
function controllo(iso, chi) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  const giorno = d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return `${giorno} ${iso.slice(11, 16)}${chi ? ` · ${chi}` : ""}`;
}
const STATO = {
  ZERO: { testo: "text-red-700", bordo: "border-l-red-500" },
  POCHE: { testo: "text-amber-700", bordo: "border-l-amber-400" },
  OK: { testo: "text-emerald-700", bordo: "border-l-emerald-500" },
  SENZA_DATO: { testo: "text-neutral-400", bordo: "border-l-neutral-200" },
};
const LINEA = {
  VERDE: { c: "bg-emerald-500", t: "Linea di oggi: a posto" },
  GIALLO: { c: "bg-amber-400", t: "Linea di oggi: da rifornire" },
  ROSSO: { c: "bg-red-500", t: "Linea di oggi: manca la merce" },
};
const FILTRI = [
  { k: "tutti", label: "Tutti" },
  { k: "guardare", label: "Da guardare" },
  { k: "incompleti", label: "Conto incompleto" },
];

function Chip({ attivo, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={attivo}
      className={`min-h-[40px] px-4 rounded-full border text-sm font-semibold transition ${attivo ? "bg-orange-700 border-orange-700 text-white" : "bg-white border-neutral-300 text-neutral-700 hover:border-orange-400"}`}>
      {children}
    </button>
  );
}

function Pallino({ colore }) {
  const l = LINEA[colore];
  if (!l) return null;
  return <span className={`inline-block shrink-0 w-2.5 h-2.5 rounded-full ${l.c}`} title={l.t} role="img" aria-label={l.t} />;
}

// Una riga della ricetta: quanto ce n'è, quante porzioni dà un pezzo, quante porzioni ne escono
// Le giacenze di un articolo, ripiano per ripiano: si correggono qui. Salvando parte una RETTIFICA per ripiano.
function Giacenze({ a, conNome, ripiani, conta, occupato }) {
  const [valori, setValori] = useState({});       // ripiano_id → testo scritto
  const [nuovo, setNuovo] = useState("");          // ripiano da aggiungere
  const chiave = a.posti.map((p) => `${p.ripiano_id}:${p.qta}`).join("|");
  useEffect(() => { setValori({}); setNuovo(""); }, [chiave]);

  const righe = [...a.posti];
  if (nuovo) {
    const r = ripiani.find((x) => String(x.ripiano_id) === nuovo);
    if (r && !righe.some((p) => p.ripiano_id === r.ripiano_id)) righe.push({ ...r, qta: null, nuovo: true });
  }
  const scritti = Object.entries(valori).filter(([, v]) => v.trim() !== "");
  const numeri = scritti.map(([rid, v]) => ({ ripiano_id: Number(rid), qta: Number(v.trim().replace(",", ".")) }));
  const validi = numeri.length > 0 && numeri.every((c) => Number.isFinite(c.qta) && c.qta >= 0);
  const liberi = ripiani.filter((x) => !righe.some((p) => p.ripiano_id === x.ripiano_id));

  return (
    <div className="mt-1 space-y-1">
      {conNome && <div className="text-[11px] font-semibold text-neutral-500">{a.nome}</div>}
      {righe.map((p) => (
        <label key={p.ripiano_id} className="flex items-center gap-1.5 text-xs">
          <input type="text" inputMode="decimal" disabled={occupato}
            value={valori[p.ripiano_id] ?? ""} placeholder={p.qta == null ? "?" : num(p.qta)}
            onChange={(ev) => setValori({ ...valori, [p.ripiano_id]: ev.target.value })}
            aria-label={`Quantità di ${a.nome} in ${p.ubicazione}, ${p.ripiano}`}
            className="w-16 min-h-[36px] border border-neutral-300 rounded-lg px-2 py-1 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-blue" />
          <span className={p.gelo ? "text-sky-700" : "text-neutral-600"}>
            {a.um} · {p.ubicazione} › {p.ripiano}
            <span className="block text-[11px] text-neutral-400">{p.aggiornato_at ? controllo(p.aggiornato_at, p.aggiornato_da) : (p.nuovo ? "ripiano nuovo" : "mai contato")}</span>
          </span>
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {!nuovo && liberi.length > 0 && (
          <select value="" disabled={occupato} onChange={(ev) => setNuovo(ev.target.value)} aria-label={`Aggiungi un ripiano per ${a.nome}`}
            className="min-h-[36px] max-w-[190px] border border-neutral-300 rounded-lg px-2 py-1 text-xs text-neutral-600 bg-white">
            <option value="">+ altro ripiano…</option>
            {liberi.map((x) => <option key={x.ripiano_id} value={x.ripiano_id}>{x.ubicazione} › {x.ripiano}{x.gelo ? " (gelo)" : ""}</option>)}
          </select>
        )}
        {scritti.length > 0 && (
          <button type="button" disabled={occupato || !validi} onClick={() => conta({ articolo_id: a.id, conteggi: numeri })}
            className="min-h-[36px] px-3 rounded-lg bg-orange-700 text-white text-xs font-semibold disabled:opacity-50">
            Salva conteggio
          </button>
        )}
      </div>
    </div>
  );
}

// Un campo che si salva quando si esce (o con Invio), solo se è cambiato. tipo "num": vuoto = nessun valore.
function Campo({ valore, tipo = "testo", onSalva, etichetta, larghezza = "w-16", occupato, segnaposto = "—" }) {
  const iniziale = valore == null ? "" : (tipo === "num" ? String(valore).replace(".", ",") : String(valore));
  const [testo, setTesto] = useState(iniziale);
  useEffect(() => { setTesto(iniziale); }, [iniziale]);
  const esci = () => {
    const t = testo.trim();
    if (t === iniziale.trim()) return;
    if (tipo === "num") {
      const n = t === "" ? null : Number(t.replace(",", "."));
      if (n !== null && (!Number.isFinite(n) || n < 0)) { setTesto(iniziale); return; }
      onSalva(n);
    } else {
      onSalva(t);
    }
  };
  return (
    <input type="text" inputMode={tipo === "num" ? "decimal" : "text"} value={testo} disabled={occupato}
      placeholder={segnaposto} aria-label={etichetta}
      onChange={(ev) => setTesto(ev.target.value)} onBlur={esci}
      onKeyDown={(ev) => { if (ev.key === "Enter") ev.currentTarget.blur(); }}
      className={`${larghezza} min-h-[36px] border border-neutral-300 rounded-lg px-2 py-1 text-xs ${tipo === "num" ? "text-right tabular-nums" : ""} focus:outline-none focus:ring-2 focus:ring-brand-blue`} />
  );
}

const UNITA = ["PZ", "CF", "KG", "G", "L", "ML"];

// La scheda dell'articolo dentro il libro mastro: nome, unità, minimi, riordino, dotazione di linea.
// Ogni campo scrive sull'articolo (gli stessi endpoint di Frigoriferi e scorte e della scheda Linea).
function SchedaArticolo({ a, azione, occupato }) {
  const art = (corpo) => azione("PATCH", `articoli/${a.id}`, corpo);
  const Etichetta = ({ children }) => <span className="text-[11px] text-neutral-500">{children}</span>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-neutral-50 border border-neutral-200 px-2.5 py-2">
      <Link to={`/cucina/mobile/scorte/${a.id}`} className="text-[11px] font-bold uppercase tracking-wider text-orange-800 underline" title="Apri in Frigoriferi e scorte">Articolo</Link>
      <Campo valore={a.nome} larghezza="w-44" occupato={occupato} etichetta={`Nome dell'articolo ${a.nome}`}
        onSalva={(v) => v && art({ nome: v })} />
      <label className="flex items-center gap-1"><Etichetta>unità</Etichetta>
        <select value={a.um_codice} disabled={occupato} onChange={(ev) => art({ um: ev.target.value })} aria-label={`Unità di ${a.nome}`}
          className="min-h-[36px] border border-neutral-300 rounded-lg px-1.5 py-1 text-xs bg-white">
          {UNITA.map((u) => <option key={u} value={u}>{u.toLowerCase()}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1"><Etichetta>min frigo</Etichetta>
        <Campo tipo="num" valore={a.scorta_min_frigo} occupato={occupato} etichetta={`Minimo frigo di ${a.nome}`} onSalva={(v) => art({ scorta_min_frigo: v })} /></label>
      <label className="flex items-center gap-1"><Etichetta>min gelo</Etichetta>
        <Campo tipo="num" valore={a.scorta_min_gelo} occupato={occupato} etichetta={`Minimo gelo di ${a.nome}`} onSalva={(v) => art({ scorta_min_gelo: v })} /></label>
      <label className="flex items-center gap-1"><Etichetta>min dispensa</Etichetta>
        <Campo tipo="num" valore={a.scorta_min_dispensa} occupato={occupato} etichetta={`Minimo dispensa di ${a.nome}`} onSalva={(v) => art({ scorta_min_dispensa: v })} /></label>
      <label className="flex items-center gap-1"><Etichetta>riordino</Etichetta>
        <Campo tipo="num" valore={a.qta_riordino} occupato={occupato} etichetta={`Quantità di riordino di ${a.nome}`} onSalva={(v) => art({ qta_riordino: v })} /></label>
      {a.linea.map((l) => (
        <label key={l.id} className="flex items-center gap-1"><Etichetta>linea {l.partita}</Etichetta>
          <Campo valore={l.linea_qta} larghezza="w-44" occupato={occupato} etichetta={`Dotazione di linea ${l.partita} di ${a.nome}`}
            onSalva={(v) => azione("PATCH", `linea/${l.id}`, { linea_qta: v || null, linea_qta_num: null })} /></label>
      ))}
    </div>
  );
}

function Elemento({ e, recipeId, salva, conta, azione, grammatura, ripiani, occupato }) {
  // nel campo sta il numero scritto (sull'articolo o solo per il piatto); quello ricavato dalle unità è il segnaposto
  const scritto = e.porzioni_scritta != null ? String(e.porzioni_scritta).replace(".", ",") : "";
  const [testo, setTesto] = useState(scritto);
  useEffect(() => { setTesto(scritto); }, [scritto]);

  const conferma = () => {
    const pulito = testo.trim().replace(",", ".");
    const nuovo = pulito === "" ? null : Number(pulito);
    if (nuovo !== null && (!Number.isFinite(nuovo) || nuovo <= 0)) { setTesto(""); return; }
    if (nuovo === (e.porzioni_scritta ?? null)) return;
    salva({ recipe_id: recipeId, tipo: e.tipo, ref_id: e.ref_id, porzioni_per_pezzo: nuovo });
  };
  const um = e.um || "pz";
  const haArticolo = e.articoli.length > 0;

  // dove porta il nome: la preparazione alla sua ricetta, il componente ai suoi prezzi
  const versoOrigine = e.tipo === "R" ? `/ricette/${e.ref_id}` : `/ricette/ingredienti/${e.ref_id}/prezzi`;
  const creaArticolo = () => azione("POST", "articoli/", {
    nome: e.nome.slice(0, 160), um: "PZ", ...(e.tipo === "R" ? { recipe_id: e.ref_id } : { ingredient_id: e.ref_id }),
  });

  return (
    <>
    <tr className={`border-t border-neutral-100 align-top ${e.non_limita ? "text-neutral-400" : ""}`}>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <Pallino colore={e.linea} />
          <Link to={versoOrigine} className={`text-sm underline decoration-neutral-300 underline-offset-2 hover:decoration-orange-600 ${e.non_limita ? "" : "text-neutral-900"}`}
            title={e.tipo === "R" ? "Apri la ricetta della preparazione" : "Apri i prezzi dell'ingrediente"}>{e.nome}</Link>
        </div>
        <div className="text-xs text-neutral-500 flex flex-wrap items-center gap-1 mt-0.5">
          {e.item_id ? (
            <>
              <Campo tipo="num" valore={e.qty} larghezza="w-14" occupato={occupato} etichetta={`Grammatura a porzione di ${e.nome}`}
                onSalva={(v) => v != null && grammatura({ item_id: e.item_id, qty: v, unit: e.unit || "g" })} />
              <Campo valore={e.unit} larghezza="w-14" occupato={occupato} etichetta={`Unità della grammatura di ${e.nome}`}
                onSalva={(v) => v && grammatura({ item_id: e.item_id, qty: e.qty ?? 0, unit: v })} />
              <span>a porzione</span>
            </>
          ) : (
            <span>{e.pronto ? "il piatto già pronto" : (e.qty != null ? `${num(e.qty)} ${e.unit || ""} a porzione` : "grammatura dentro una preparazione: si corregge dalla ricetta")}</span>
          )}
          {e.motivo && <span className="ml-1 font-semibold text-amber-700">· {e.motivo}</span>}
          {e.da_verificare && <span className="ml-1 font-semibold text-amber-700">· conta vecchia</span>}
        </div>
        <div className={`text-xs ${e.da_verificare ? "text-amber-700" : "text-neutral-500"}`}>
          {e.aggiornato_at ? <>ultimo controllo: {controllo(e.aggiornato_at, e.aggiornato_da)}</> : (haArticolo ? "mai controllato" : "")}
        </div>
      </td>
      <td className="py-2 pr-3 text-sm tabular-nums">
        <div className="whitespace-nowrap">
          {e.subito == null ? <span className="text-neutral-400">—</span> : (
            <>
              <b>{num(e.subito)}</b> {um}
              {e.gelo > 0 && <span className="text-sky-700"> + {num(e.gelo)} gelo</span>}
            </>
          )}
        </div>
        {e.articoli.map((a) => (
          <Giacenze key={a.id} a={a} conNome={e.articoli.length > 1} ripiani={ripiani} conta={conta} occupato={occupato} />
        ))}
      </td>
      <td className="py-2 pr-3 whitespace-nowrap">
        {haArticolo ? (
          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-neutral-500">1 {um} =</span>
            <input type="text" inputMode="decimal" value={testo} disabled={occupato}
              onChange={(ev) => setTesto(ev.target.value)} onBlur={conferma}
              onKeyDown={(ev) => { if (ev.key === "Enter") ev.currentTarget.blur(); }}
              placeholder={e.porzioni_origine === "auto" ? num(e.porzioni_per_pezzo) : "?"}
              aria-label={`Porzioni per ${um} di ${e.nome}`}
              className="w-20 min-h-[40px] border border-neutral-300 rounded-lg px-2 py-1 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            <span className="text-neutral-500">porz.</span>
          </label>
        ) : (
          <button type="button" disabled={occupato} onClick={creaArticolo}
            className="min-h-[40px] px-3 rounded-lg border border-orange-300 bg-orange-50 text-orange-900 text-xs font-semibold disabled:opacity-50">
            + Crea in Scorte
          </button>
        )}
        {haArticolo && (
          <div className="text-[11px] text-neutral-500 mt-0.5">
            {e.porzioni_origine === "articolo" && e.contenuto && <>sull'articolo: 1 {um} = {num(e.contenuto.qta)} {e.contenuto.um === "porz" ? "porzioni" : e.contenuto.um} · vale per tutti i piatti</>}
            {e.porzioni_origine === "piatto" && <>solo per questo piatto</>}
            {e.porzioni_origine === "auto" && <>dalla grammatura in ricetta</>}
            {!e.porzioni_origine && (e.collegabile ? <>si salva sull'articolo, vale per tutti i piatti</> : <>vale solo per questo piatto (riga senza grammatura)</>)}
          </div>
        )}
      </td>
      <td className="py-2 pr-3 text-sm tabular-nums whitespace-nowrap text-right">
        {e.porzioni_subito == null ? <span className="text-neutral-400">—</span> : (
          <>
            <b>{num(e.porzioni_subito)}</b>
            {e.porzioni_con_gelo !== e.porzioni_subito && <span className="text-sky-700"> / {num(e.porzioni_con_gelo)}</span>}
          </>
        )}
      </td>
      <td className="py-2 text-right">
        <label className="inline-flex items-center gap-1.5 text-xs text-neutral-600 min-h-[40px] cursor-pointer">
          <input type="checkbox" checked={e.non_limita} disabled={occupato} className="w-4 h-4 accent-orange-700"
            onChange={(ev) => salva({ recipe_id: 0, tipo: e.tipo, ref_id: e.ref_id, non_limita: ev.target.checked })} />
          non limita
        </label>
        {haArticolo && (
          <label className="flex items-center justify-end gap-1.5 text-xs text-sky-800 min-h-[40px] cursor-pointer whitespace-nowrap"
            title="Si usa direttamente dal congelatore: il gelo conta già nel numero «subito»">
            <input type="checkbox" checked={!!e.gelo_diretto} disabled={occupato} className="w-4 h-4 accent-sky-700"
              onChange={(ev) => salva({ recipe_id: 0, tipo: e.tipo, ref_id: e.ref_id, gelo_diretto: ev.target.checked })} />
            dal gelo diretto
          </label>
        )}
      </td>
    </tr>
    {haArticolo && (
      <tr>
        <td colSpan={5} className="pb-3 space-y-1.5">
          {e.articoli.map((a) => <SchedaArticolo key={a.id} a={a} azione={azione} occupato={occupato} />)}
        </td>
      </tr>
    )}
    </>
  );
}

function Piatto({ p, aperto, apri, salva, conta, azione, grammatura, ripiani, occupato }) {
  const s = STATO[p.stato] || STATO.SENZA_DATO;
  const nMancanti = p.mancanti.length;
  return (
    <li>
      {/* il colore sta su un div: divide-y della lista riscrive il colore dei bordi dei <li> */}
      <div className={`border-l-4 ${s.bordo}`}>
      <button type="button" onClick={apri} aria-expanded={aperto}
        className="w-full text-left pl-3 pr-1 py-2.5 min-h-[56px] grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 items-center hover:bg-orange-50/50">
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <Pallino colore={p.linea} />
            <span className="text-[15px] text-neutral-900 truncate">{p.nome}</span>
          </span>
          <span className="block text-xs text-neutral-500 truncate">
            {p.avviso ? <span className="text-amber-700 font-semibold">{p.avviso}</span> : (
              <>
                {p.collo_subito && <>ferma: <b className="font-semibold text-neutral-700">{p.collo_subito}</b>{p.collo_controllo_at ? ` (contato ${controllo(p.collo_controllo_at, p.collo_controllo_da)})` : ""}</>}
                {nMancanti > 0 && <span className="text-amber-700 font-semibold">{p.collo_subito ? " · " : ""}{nMancanti === 1 ? "manca 1 dato" : `mancano ${nMancanti} dati`}</span>}
                {p.da_verificare.length > 0 && <span className="text-amber-700"> · conte vecchie</span>}
              </>
            )}
          </span>
        </span>
        <span className="text-right">
          <span className={`block text-2xl font-bold tabular-nums leading-none ${s.testo}`}>{num(p.porzioni_subito)}</span>
          <span className="block text-[11px] text-neutral-500">subito</span>
        </span>
        <span className="text-right w-16">
          <span className="block text-lg font-bold tabular-nums leading-none text-sky-700">{num(p.porzioni_con_gelo)}</span>
          <span className="block text-[11px] text-neutral-500">con il gelo</span>
        </span>
      </button>
      {aperto && (
        <div className="pl-3 pr-1 pb-3">
          {p.elementi.length === 0 ? (
            <div className="text-sm text-neutral-500 py-2">
              {p.avviso}. <Link to={`/ricette/${p.recipe_id}`} className="text-orange-800 underline">Apri la ricetta</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500">
                    <th className="py-1 pr-3 font-bold">Elemento e grammatura</th>
                    <th className="py-1 pr-3 font-bold">In casa (per ripiano)</th>
                    <th className="py-1 pr-3 font-bold">Porzioni per pezzo</th>
                    <th className="py-1 pr-3 font-bold text-right">Porzioni</th>
                    <th className="py-1 font-bold" />
                  </tr>
                </thead>
                <tbody>
                  {p.elementi.map((e) => (
                    <Elemento key={`${e.tipo}${e.ref_id}`} e={e} recipeId={p.recipe_id} salva={salva} conta={conta} azione={azione} grammatura={grammatura} ripiani={ripiani} occupato={occupato} />
                  ))}
                </tbody>
              </table>
              <div className="text-xs text-neutral-500 mt-2">
                <Link to={`/ricette/${p.recipe_id}`} className="text-orange-800 underline">Apri la ricetta</Link>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </li>
  );
}

export default function CucinaControlloMenu() {
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState(null);
  const [filtro, setFiltro] = useState("tutti");
  const [aperto, setAperto] = useState(null);
  const [occupato, setOccupato] = useState(false);

  const carica = useCallback(() => {
    setErrore(null);
    apiFetch(`${API_BASE}/cucina/scorte/controllo-menu`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Errore"); return r.json(); })
      .then(setD)
      .catch((e) => setErrore(e.message));
  }, []);
  useEffect(() => { carica(); }, [carica]);

  const scrivi = (percorso, metodo, corpo) => {
    setOccupato(true); setErrore(null);
    apiFetch(`${API_BASE}/cucina/scorte/controllo-menu/${percorso}`, {
      method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
    })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Non salvato"); return r.json(); })
      .then(setD)
      .catch((e) => setErrore(typeof e.message === "string" ? e.message : "Non salvato"))
      .finally(() => setOccupato(false));
  };
  const salva = (corpo) => scrivi("elemento", "PUT", corpo);     // porzioni per pezzo, non limita, gelo diretto
  const conta = (corpo) => scrivi("conta", "POST", corpo);       // giacenza per ripiano → RETTIFICA in Scorte
  const grammatura = (corpo) => scrivi("grammatura", "PUT", corpo); // grammatura a porzione → riga della ricetta
  // scheda articolo e dotazione di linea: gli endpoint di Frigoriferi e scorte, poi si rifà il conto
  const azione = (metodo, percorso, corpo) => {
    setOccupato(true); setErrore(null);
    apiFetch(`${API_BASE}/cucina/scorte/${percorso}`, {
      method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
    })
      .then(async (r) => {
        if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(typeof j.detail === "string" ? j.detail : "Non salvato"); }
        return apiFetch(`${API_BASE}/cucina/scorte/controllo-menu`);
      })
      .then((r) => r.json())
      .then(setD)
      .catch((e) => setErrore(e.message || "Non salvato"))
      .finally(() => setOccupato(false));
  };

  const passa = (p) => filtro === "tutti" || (filtro === "guardare" ? (p.stato === "ZERO" || p.stato === "POCHE") : !p.completo);
  const r = d?.riassunto;

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <RicetteNav current="controllo-menu" />
      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 font-playfair">Controllo menu</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Quante porzioni si fanno con quello che c'è in casa{d?.edizione ? ` · ${d.edizione}` : ""}{d ? ` · conto delle ${ora(d.calcolato_at)}` : ""}
            </p>
          </div>
          <button type="button" onClick={carica}
            className="min-h-[44px] px-4 rounded-lg border border-neutral-300 bg-white text-sm font-semibold text-neutral-800 hover:border-orange-400">
            Rifai il conto
          </button>
        </div>

        {errore && <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3">{errore}</div>}
        {!d && !errore && <div className="py-12 text-center text-sm text-neutral-400">Carico…</div>}

        {d && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                ["A zero", r.zero, "text-red-700", "non si fa, subito"],
                ["Poche", r.poche, "text-amber-700", `fino a ${d.soglia_poche} porzioni`],
                ["A posto", r.ok, "text-emerald-700", null],
                ["Senza conto", r.senza_dato, "text-neutral-500", "mancano i dati"],
              ].map(([l, v, tono, sotto]) => (
                <div key={l} className="rounded-xl bg-white border border-neutral-200 px-3 py-2.5">
                  <div className="text-xs font-bold text-neutral-500">{l}</div>
                  <div className={`text-2xl font-bold tabular-nums ${tono}`}>{v}</div>
                  {sotto && <div className="text-xs text-neutral-500">{sotto}</div>}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {FILTRI.map((f) => <Chip key={f.k} attivo={filtro === f.k} onClick={() => setFiltro(f.k)}>{f.label}</Chip>)}
            </div>

            <p className="text-xs text-neutral-500">
              <b>Subito</b> = frigo e dispensa (più il gelo per gli elementi segnati «dal gelo diretto»). <b>Con il gelo</b> = aggiungendo quello che è in congelatore. Ogni piatto è contato da solo:
              due piatti con lo stesso fondo non se lo dividono. Il numero vale per i dati che ci sono: gli elementi senza dato non lo fermano,
              ma il piatto li segnala. Tocca un piatto per vedere gli elementi e scrivere quante porzioni dà un pezzo: il numero si salva sull'articolo
              (come contenuto del pezzo) e aggiorna tutti i piatti che lo usano.
              Le quantità si correggono qui, ripiano per ripiano: «Salva conteggio» scrive il movimento in Frigoriferi e scorte.
              Da qui si correggono anche grammature, nome e unità dell'articolo, minimi, riordino e dotazione di linea: ogni campo si salva uscendo.
              Il pallino è il semaforo di linea di oggi.
            </p>

            {r.piatti === 0 && (
              <div className="rounded-2xl bg-white border border-neutral-200 p-6 text-center text-sm text-neutral-500">
                Nessun piatto con ricetta nella carta in corso.
              </div>
            )}

            {d.sezioni.map((s) => {
              const piatti = s.piatti.filter(passa);
              if (!piatti.length) return null;
              return (
                <section key={s.k} className="rounded-2xl bg-white border border-neutral-200 p-4">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-neutral-500 font-sans mb-2">{s.label}</h2>
                  <ul className="divide-y divide-neutral-100">
                    {piatti.map((p) => (
                      <Piatto key={p.pub_id} p={p} aperto={aperto === p.pub_id}
                        apri={() => setAperto(aperto === p.pub_id ? null : p.pub_id)} salva={salva} conta={conta} azione={azione} grammatura={grammatura}
                        ripiani={d.ripiani || []} occupato={occupato} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
