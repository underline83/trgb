// frontend/src/pages/cucina/CucinaProduzioni.jsx
// Modulo: cucina — Produzioni e codice lotto
// @version: v1.0 — elenco, nuova produzione, scheda con stampa etichetta, leggi un codice (2026-11-26)
//
// Il giro approvato da Marco il 2026-11-26 (artifact «TRGB · Cucina › Produzioni e
// codice lotto (proposta)»): 1 elenco di oggi · 2 nuova produzione · 3 registrata,
// si stampa · 4 leggi un codice.
//
// Il codice lotto (6 caratteri) lo fa il backend: dice data, persona e numero
// produzione, ma solo a TRGB. Per questo data, persona e numero dopo NON si
// correggono (sono dentro al codice): si annulla e si registra di nuovo.
//
// Endpoint: /cucina/produzioni/ (router cucina_produzioni_router). Permessi dalla
// matrice Moduli: ricette/produzioni.

import React, { useCallback, useEffect, useRef, useState } from "react";
import RicetteNav from "../ricette/RicetteNav";
import { API_BASE, apiFetch } from "../../config/api";
import { apriFinestraVuota } from "../../utils/pdfEtichetta";
import { stampaEtichetteLotto } from "../../utils/etichettaLotto";

const BASE = `${API_BASE}/cucina/produzioni`;

async function j(r) {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof d.detail === "string" ? d.detail : "Qualcosa non ha funzionato, riprova.");
  return d;
}
const get = (path) => apiFetch(`${BASE}${path}`).then(j);
const manda = (path, method, body) =>
  apiFetch(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(j);

function fmtData(iso) {
  if (!iso) return "";
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}
function giornoLungo(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
const due = (n) => String(n).padStart(2, "0");

const campo = "w-full h-12 rounded-xl border border-neutral-300 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-blue";
const etichetta = "block text-xs font-bold text-neutral-600 mb-1.5";
const btnRosso = "w-full h-14 rounded-2xl bg-brand-red text-white text-base font-bold disabled:opacity-50 active:opacity-80";
const btnBianco = "w-full h-12 rounded-2xl bg-white border border-neutral-300 text-neutral-900 text-base font-semibold active:bg-neutral-50";

function Errore({ testo }) {
  if (!testo) return null;
  return <div role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3">{testo}</div>;
}

function Indietro({ onClick, children = "Produzioni" }) {
  return <button type="button" onClick={onClick} className="text-sm font-semibold text-brand-blue min-h-[44px] -my-2">‹ {children}</button>;
}

function Contatore({ valore, onChange, label }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white border border-neutral-200 pl-4 pr-2 py-2">
      <span className="text-base font-semibold">{label}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="Una in meno" onClick={() => onChange(Math.max(1, valore - 1))}
          className="w-11 h-11 rounded-lg border border-neutral-300 bg-brand-cream text-xl">−</button>
        <span className="w-10 text-center text-lg font-bold tabular-nums">{valore}</span>
        <button type="button" aria-label="Una in più" onClick={() => onChange(valore + 1)}
          className="w-11 h-11 rounded-lg border border-neutral-300 bg-brand-cream text-xl">+</button>
      </div>
    </div>
  );
}

function Riga({ p, onApri }) {
  return (
    <button type="button" onClick={() => onApri(p)}
      className={`w-full text-left rounded-2xl bg-white border border-neutral-200 px-4 py-3 flex items-center justify-between gap-3 min-h-[60px] ${p.annullata ? "opacity-50" : ""}`}>
      <span className="min-w-0">
        <span className={`block text-base font-bold truncate ${p.annullata ? "line-through" : ""}`}>{p.nome}</span>
        <span className="block text-sm text-neutral-600">
          {p.persona_nome || "?"} · produzione {due(p.numero)} · {p.etichette} {p.etichette === 1 ? "etichetta" : "etichette"}{p.annullata ? " · annullata" : ""}
        </span>
      </span>
      <span className="font-mono text-base font-bold tracking-wider shrink-0">{p.codice}</span>
    </button>
  );
}

// ── 1 · Elenco ────────────────────────────────────────────────
function Elenco({ dati, errore, onNuova, onLeggi, onApri }) {
  const gruppi = [];
  (dati?.produzioni || []).forEach((p) => {
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.data === p.data) ultimo.righe.push(p); else gruppi.push({ data: p.data, righe: [p] });
  });
  const titolo = (g) => {
    if (g.data === dati.oggi) return `Oggi · ${g.righe.length} ${g.righe.length === 1 ? "produzione" : "produzioni"}`;
    return giornoLungo(g.data);
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 font-playfair">Produzioni</h1>
        {dati && <p className="text-sm text-neutral-600 mt-1">{giornoLungo(dati.oggi)}</p>}
      </div>
      <button type="button" className={btnRosso} onClick={onNuova}>+ Nuova produzione</button>
      <Errore testo={errore} />
      {!dati && !errore && <div className="py-10 text-center text-sm text-neutral-500">Carico…</div>}
      {dati && gruppi.length === 0 && (
        <div className="rounded-2xl bg-white border border-neutral-200 p-5 text-sm text-neutral-600">
          Negli ultimi giorni non è stata registrata nessuna produzione.
        </div>
      )}
      {gruppi.map((g) => (
        <section key={g.data} className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-600">{titolo(g)}</h2>
          {g.righe.map((p) => <Riga key={p.id} p={p} onApri={onApri} />)}
        </section>
      ))}
      {dati && gruppi.length > 0 && <p className="text-sm text-neutral-600">Tocca una riga per ristampare l'etichetta o correggere.</p>}
      <button type="button" className={btnBianco} onClick={onLeggi}>Leggi un codice</button>
    </div>
  );
}

// ── 2 · Nuova produzione ──────────────────────────────────────
function Nuova({ oggi, onFatto, onIndietro }) {
  const [nome, setNome] = useState("");
  const [recipeId, setRecipeId] = useState(null);
  const [proposte, setProposte] = useState([]);
  const [persone, setPersone] = useState([]);
  const [persona, setPersona] = useState("");
  const [data, setData] = useState(oggi);
  const [scadenza, setScadenza] = useState("");
  const [etichette, setEtichette] = useState(1);
  const [numero, setNumero] = useState(null);
  const [errore, setErrore] = useState(null);
  const [invio, setInvio] = useState(false);
  const scelto = useRef(false);

  useEffect(() => {
    get("/persone/").then((d) => {
      setPersone(d.persone);
      if (d.persone.some((p) => p.username === d.io)) setPersona(d.io);
    }).catch((e) => setErrore(e.message));
  }, []);

  useEffect(() => {
    setNumero(null);
    get(`/prossimo-numero/?data=${encodeURIComponent(data)}`).then((d) => setNumero(d.numero)).catch(() => {});
  }, [data]);

  // Suggerimenti mentre si scrive (non subito dopo aver scelto una proposta)
  useEffect(() => {
    if (scelto.current) { scelto.current = false; return undefined; }
    const q = nome.trim();
    if (q.length < 2) { setProposte([]); return undefined; }
    const t = setTimeout(() => {
      get(`/suggerimenti/?q=${encodeURIComponent(q)}`).then(setProposte).catch(() => setProposte([]));
    }, 250);
    return () => clearTimeout(t);
  }, [nome]);

  const scegli = (s) => { scelto.current = true; setNome(s.nome); setRecipeId(s.recipe_id || null); setProposte([]); };

  const registra = () => {
    setErrore(null); setInvio(true);
    manda("/", "POST", { nome, persona, data, data_scadenza: scadenza || null, etichette, recipe_id: recipeId })
      .then(onFatto)
      .catch((e) => setErrore(e.message))
      .finally(() => setInvio(false));
  };

  return (
    <div className="space-y-4">
      <div>
        <Indietro onClick={onIndietro} />
        <h1 className="text-3xl font-bold text-neutral-900 font-playfair">Nuova produzione</h1>
      </div>

      <div>
        <label htmlFor="prod-cosa" className={etichetta}>Cosa hai prodotto</label>
        <input id="prod-cosa" type="text" autoComplete="off" value={nome} maxLength={80}
          onChange={(e) => { setNome(e.target.value); setRecipeId(null); }} className={campo} />
        {proposte.length > 0 && (
          <div className="mt-1.5 rounded-xl bg-white border border-neutral-200 divide-y divide-neutral-100">
            {proposte.map((s) => (
              <button key={`${s.origine}-${s.nome}`} type="button" onClick={() => scegli(s)}
                className="w-full text-left px-3.5 min-h-[46px] text-base">
                <span className="font-semibold">{s.nome}</span>
                <span className="text-neutral-600"> · {s.origine === "ricette" ? "dalle ricette" : "già prodotto"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className={etichetta}>Chi l'ha prodotto</span>
        <div className="flex flex-wrap gap-2">
          {persone.map((p) => {
            const on = persona === p.username;
            return (
              <button key={p.username} type="button" aria-pressed={on} onClick={() => setPersona(p.username)}
                className={`h-12 px-4 rounded-full text-base ${on ? "bg-brand-ink text-white font-bold border-2 border-brand-ink" : "bg-white border border-neutral-300"}`}>
                {p.nome}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="prod-data" className={etichetta}>Data di produzione</label>
          <input id="prod-data" type="date" value={data} max={oggi} onChange={(e) => setData(e.target.value || oggi)} className={campo} />
        </div>
        <div>
          <label htmlFor="prod-scad" className={etichetta}>Scadenza (se serve)</label>
          <input id="prod-scad" type="date" value={scadenza} min={data} onChange={(e) => setScadenza(e.target.value)} className={campo} />
        </div>
      </div>

      <Contatore label="Etichette da stampare" valore={etichette} onChange={setEtichette} />

      {numero != null && (
        <p className="text-sm text-neutral-600">
          Il numero produzione lo assegna TRGB: sarà la <strong className="text-neutral-900">{due(numero)}</strong> {data === oggi ? "di oggi" : `del ${fmtData(data)}`}.
        </p>
      )}
      <p className="text-sm text-neutral-600">Data, persona e numero finiscono dentro al codice: dopo non si correggono.</p>

      <Errore testo={errore} />
      <button type="button" className={btnRosso} disabled={invio || !nome.trim() || !persona} onClick={registra}>
        {invio ? "Registro…" : "Registra"}
      </button>
    </div>
  );
}

// ── 3 · Scheda: appena registrata, oppure riaperta dall'elenco ─
function Scheda({ produzione, nuova, onCambia, onIndietro, onNuova }) {
  const [p, setP] = useState(produzione);
  const [variante, setVariante] = useState("completa");
  const [copie, setCopie] = useState(produzione.etichette || 1);
  const [modifica, setModifica] = useState(false);
  const [nome, setNome] = useState(produzione.nome);
  const [scadenza, setScadenza] = useState(produzione.data_scadenza || "");
  const [chiedeAnnullo, setChiedeAnnullo] = useState(false);
  const [errore, setErrore] = useState(null);

  const aggiorna = (nuovo) => { setP(nuovo); onCambia(); };

  const stampa = () => {
    const finestra = apriFinestraVuota(); // dentro al clic, o Safari la blocca
    try {
      stampaEtichetteLotto(p, variante, copie, finestra);
    } catch (e) {
      if (finestra) finestra.close();
      setErrore("Non sono riuscito a preparare l'etichetta.");
      return;
    }
    if (copie !== p.etichette) manda(`/${p.id}`, "PATCH", { etichette: copie }).then(aggiorna).catch(() => {});
  };

  const salva = () => {
    setErrore(null);
    manda(`/${p.id}`, "PATCH", { nome, data_scadenza: scadenza || null, togli_scadenza: !scadenza })
      .then((n) => { aggiorna(n); setModifica(false); })
      .catch((e) => setErrore(e.message));
  };

  const annulla = () => {
    manda(`/${p.id}/annulla`, "POST").then((n) => { aggiorna(n); setChiedeAnnullo(false); }).catch((e) => setErrore(e.message));
  };

  const dato = (k, v) => (
    <div className="flex justify-between gap-3"><span className="text-neutral-600">{k}</span><strong className="text-right">{v}</strong></div>
  );

  return (
    <div className="space-y-4">
      <div>
        <Indietro onClick={onIndietro} />
        <h1 className="text-3xl font-bold text-neutral-900 font-playfair">{nuova ? "Registrata" : p.nome}</h1>
      </div>

      <div className="rounded-2xl bg-white border border-neutral-200 p-5 space-y-3">
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-wider text-neutral-600">Codice lotto</div>
          <div className={`font-mono text-5xl font-bold tracking-widest mt-1 ${p.annullata ? "line-through opacity-50" : ""}`}>{p.codice}</div>
          {p.annullata && <div className="text-sm font-semibold text-red-800 mt-2">Produzione annullata</div>}
        </div>
        <div className="border-t border-neutral-100 pt-3 space-y-1.5 text-base">
          {dato("Cosa", p.nome)}
          {dato("Quando", giornoLungo(p.data))}
          {dato("Chi", p.persona_nome || "?")}
          {dato("Produzione", due(p.numero))}
          {p.data_scadenza && dato("Scadenza", fmtData(p.data_scadenza))}
        </div>
      </div>

      <Errore testo={errore} />

      {!p.annullata && !modifica && (
        <>
          <div>
            <span className={etichetta}>Etichetta 90 × 29 mm</span>
            <div className="grid grid-cols-2 gap-2">
              {[["completa", "Nome, scadenza e codice"], ["codice", "Solo il codice"]].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={variante === k} onClick={() => setVariante(k)}
                  className={`min-h-[48px] px-3 rounded-xl text-sm ${variante === k ? "bg-brand-ink text-white font-bold border-2 border-brand-ink" : "bg-white border border-neutral-300"}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="mt-2 mx-auto bg-white border border-neutral-900 rounded flex flex-col justify-center gap-1 px-4"
              style={{ width: "min(100%, 324px)", aspectRatio: "90 / 29" }} aria-label="Anteprima dell'etichetta">
              {variante === "codice" ? (
                <div className="text-center">
                  <div className="text-[10px] font-bold tracking-[0.14em]">LOTTO</div>
                  <div className="text-3xl font-bold tracking-widest">{p.codice}</div>
                </div>
              ) : (
                <>
                  <div className="text-base font-bold truncate">{p.nome}</div>
                  {p.data_scadenza && <div className="text-xs">Scad. {fmtData(p.data_scadenza)}</div>}
                  <div className="text-sm font-bold tracking-wider">L {p.codice}</div>
                </>
              )}
            </div>
            <p className="text-sm text-neutral-600 mt-2">Data di produzione, persona e numero non compaiono: stanno solo nel codice.</p>
          </div>
          <Contatore label="Copie" valore={copie} onChange={setCopie} />
          <button type="button" className={btnRosso} onClick={stampa}>
            Stampa {copie} {copie === 1 ? "etichetta" : "etichette"}
          </button>
          {nuova && <button type="button" className={btnBianco} onClick={onNuova}>Un'altra produzione</button>}
          <div className="flex gap-2">
            <button type="button" className={btnBianco} onClick={() => setModifica(true)}>Correggi</button>
            <button type="button" className={`${btnBianco} text-red-800`} onClick={() => setChiedeAnnullo(true)}>Annulla produzione</button>
          </div>
        </>
      )}

      {modifica && (
        <div className="rounded-2xl bg-white border border-neutral-200 p-4 space-y-3">
          <div>
            <label htmlFor="cor-nome" className={etichetta}>Cosa hai prodotto</label>
            <input id="cor-nome" type="text" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="cor-scad" className={etichetta}>Scadenza (vuota = nessuna)</label>
            <input id="cor-scad" type="date" value={scadenza} min={p.data} onChange={(e) => setScadenza(e.target.value)} className={campo} />
          </div>
          <p className="text-sm text-neutral-600">Data, persona e numero non si correggono: sono dentro al codice. Se sono sbagliati, annulla la produzione e registrane un'altra.</p>
          <div className="flex gap-2">
            <button type="button" className={btnBianco} onClick={() => { setModifica(false); setNome(p.nome); setScadenza(p.data_scadenza || ""); }}>Lascia com'è</button>
            <button type="button" className="w-full h-12 rounded-2xl bg-brand-ink text-white text-base font-bold" onClick={salva}>Salva</button>
          </div>
        </div>
      )}

      {chiedeAnnullo && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 space-y-3">
          <p className="text-sm text-red-900">
            Annullo la produzione <strong>{p.codice}</strong>? Resta nel registro segnata come annullata, e il numero {due(p.numero)} non viene riusato. Le etichette già stampate vanno tolte a mano.
          </p>
          <div className="flex gap-2">
            <button type="button" className={btnBianco} onClick={() => setChiedeAnnullo(false)}>No, lascia</button>
            <button type="button" className="w-full h-12 rounded-2xl bg-red-700 text-white text-base font-bold" onClick={annulla}>Sì, annulla</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 4 · Leggi un codice ───────────────────────────────────────
function Leggi({ onIndietro, onApri }) {
  const [codice, setCodice] = useState("");
  const [esito, setEsito] = useState(null);
  const [errore, setErrore] = useState(null);

  const leggi = (e) => {
    e.preventDefault();
    setEsito(null); setErrore(null);
    get(`/leggi/?codice=${encodeURIComponent(codice)}`).then(setEsito).catch((er) => setErrore(er.message));
  };
  const dato = (k, v) => (
    <div className="flex justify-between gap-3"><span className="text-neutral-600">{k}</span><strong className="text-right">{v}</strong></div>
  );

  return (
    <div className="space-y-4">
      <div>
        <Indietro onClick={onIndietro} />
        <h1 className="text-3xl font-bold text-neutral-900 font-playfair">Leggi un codice</h1>
        <p className="text-sm text-neutral-600 mt-1">Scrivi il codice che c'è sull'etichetta.</p>
      </div>
      <form onSubmit={leggi} className="space-y-3">
        <div>
          <label htmlFor="leggi-cod" className={etichetta}>Codice lotto</label>
          <input id="leggi-cod" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12}
            value={codice} onChange={(e) => setCodice(e.target.value.toUpperCase())}
            className="w-full h-16 rounded-xl border-2 border-brand-ink bg-white px-4 font-mono text-3xl font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-blue" />
        </div>
        <button type="submit" className={btnRosso} disabled={!codice.trim()}>Leggi</button>
      </form>

      {errore && (
        <div role="alert" className="rounded-xl bg-white border border-red-700 p-4">
          <div className="font-mono text-lg font-bold tracking-wider">{codice}</div>
          <div className="text-sm font-semibold text-red-800 mt-1">{errore}</div>
        </div>
      )}

      {esito && (
        <div className="rounded-2xl bg-white border border-neutral-200 p-5 space-y-3">
          <div>
            <div className="text-xl font-bold">{esito.nome || "Produzione non a registro"}</div>
            {esito.a_registro
              ? <div className={`text-sm font-semibold ${esito.annullata ? "text-red-800" : "text-green-800"}`}>{esito.annullata ? "Produzione annullata" : "Codice valido, trovato nel registro"}</div>
              : <div className="text-sm font-semibold text-amber-800">Il codice è valido ma nel registro non c'è: ti dico solo quello che contiene.</div>}
          </div>
          <div className="border-t border-neutral-100 pt-3 space-y-2 text-base">
            {dato("Prodotto il", giornoLungo(esito.data))}
            {dato("Da", esito.persona_nome || `persona n. ${esito.persona_numero}`)}
            {dato("Produzione", `${due(esito.numero)} del giorno`)}
            {esito.a_registro && esito.data_scadenza && dato("Scadenza", fmtData(esito.data_scadenza))}
            {esito.a_registro && dato("Etichette stampate", esito.etichette)}
          </div>
          {esito.a_registro && <button type="button" className={btnBianco} onClick={() => onApri(esito)}>Apri la produzione</button>}
        </div>
      )}
    </div>
  );
}

// ── Pagina ────────────────────────────────────────────────────
export default function CucinaProduzioni() {
  const [vista, setVista] = useState({ k: "elenco" });
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);

  const carica = useCallback(() => {
    get("/?giorni=7").then((d) => { setDati(d); setErrore(null); }).catch((e) => setErrore(e.message));
  }, []);
  useEffect(() => { carica(); }, [carica]);

  const elenco = () => { setVista({ k: "elenco" }); carica(); };

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <RicetteNav current="produzioni" />
      <div className="max-w-xl mx-auto px-4 py-5 pb-16">
        {vista.k === "elenco" && (
          <Elenco dati={dati} errore={errore}
            onNuova={() => setVista({ k: "nuova" })} onLeggi={() => setVista({ k: "leggi" })}
            onApri={(p) => setVista({ k: "scheda", p, nuova: false })} />
        )}
        {vista.k === "nuova" && (
          <Nuova oggi={dati?.oggi || new Date().toLocaleDateString("sv-SE")}
            onFatto={(p) => { carica(); setVista({ k: "scheda", p, nuova: true }); }} onIndietro={elenco} />
        )}
        {vista.k === "scheda" && (
          <Scheda key={vista.p.id} produzione={vista.p} nuova={vista.nuova} onCambia={carica}
            onIndietro={elenco} onNuova={() => setVista({ k: "nuova" })} />
        )}
        {vista.k === "leggi" && <Leggi onIndietro={elenco} onApri={(p) => setVista({ k: "scheda", p, nuova: false })} />}
      </div>
    </div>
  );
}
