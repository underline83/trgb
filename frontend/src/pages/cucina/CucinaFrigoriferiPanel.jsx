// frontend/src/pages/cucina/CucinaFrigoriferiPanel.jsx
// Modulo: cucina
// @version: v1.0 — configurazione frigoriferi, ripiani e dotazione (2026-09-08)
//
// Vive dentro RicetteSettings (sidebar Impostazioni Cucina, sezione «Frigoriferi»).
// È il pannello di SETUP: la sotto-app /cucina/mobile consuma, questa configura.
//
// Perché sta al computer e non sul telefono: dire cosa sta su ventiquattro
// ripiani è lavoro da tastiera, si fa una volta e non si rifà. Sul telefono
// resta il gesto quotidiano — il pallino.
//
// Tre cose, in quest'ordine, che è anche l'ordine in cui vanno fatte:
//   1. i POSTI      — frigo, cella, dispensa: nome, tipo, soglie di temperatura
//   2. i RIPIANI    — codice locale (1,2,3…) e destinazione d'uso crudo/cotto/…
//   3. la DOTAZIONE — cosa ci sta di norma, incollando una lista di righe
//
// Il punto 3 usa POST /cucina/scorte/dotazione/testo, che ha l'anteprima
// OBBLIGATORIA: prima mostra riga per riga se l'articolo esiste già, se è nuovo
// o se assomiglia a uno che c'è (il caso «pancetta arrotolata» vs «pancetta
// stesa»). Un'anagrafica sporca il primo giorno resta sporca per anni.

import React, { useCallback, useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";

const TIPI = [
  { v: "FRIGO", l: "Frigorifero", e: "🧊", refrig: true },
  { v: "CELLA", l: "Cella", e: "❄️", refrig: true },
  { v: "FREEZER", l: "Freezer", e: "🧊", refrig: true },
  { v: "ABBATTITORE", l: "Abbattitore", e: "🔥", refrig: true },
  { v: "DISPENSA", l: "Dispensa", e: "🗄️", refrig: false },
  { v: "SCAFFALE", l: "Scaffale", e: "🗄️", refrig: false },
  { v: "BANCO", l: "Banco", e: "🍽️", refrig: false },
  { v: "ALTRO", l: "Altro", e: "📦", refrig: false },
];

const DESTINAZIONI = [
  { v: "", l: "— nessuna —" },
  { v: "CRUDO", l: "Crudo" },
  { v: "COTTO", l: "Cotto" },
  { v: "SEMILAVORATI", l: "Semilavorati" },
  { v: "PRONTI", l: "Pronti" },
  { v: "NON_FOOD", l: "Non alimentare" },
  { v: "MISTO", l: "Misto (non giudica)" },
];

const DEST_COLORE = {
  CRUDO: "bg-red-50 text-red-800 border-red-200",
  COTTO: "bg-blue-50 text-blue-800 border-blue-200",
  SEMILAVORATI: "bg-amber-50 text-amber-800 border-amber-200",
  PRONTI: "bg-green-50 text-green-800 border-green-200",
  NON_FOOD: "bg-neutral-100 text-neutral-700 border-neutral-200",
  MISTO: "bg-neutral-100 text-neutral-700 border-neutral-200",
};

const tipoInfo = (v) => TIPI.find((t) => t.v === v) || TIPI[0];

const VUOTO = {
  nome: "", tipo: "FRIGO", temp_min: "", temp_max: "",
  marca: "", modello: "", anno: "", ordine: 0, n_ripiani: 4, note: "",
};

export default function CucinaFrigoriferiPanel() {
  const [posti, setPosti] = useState(null);
  const [sel, setSel] = useState(null);          // ubicazione aperta (dettaglio)
  const [nuovo, setNuovo] = useState(null);      // form nuovo posto
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [incolla, setIncolla] = useState(null);  // {ripiano, testo, anteprima}

  const avviso = (tipo, text) => { setMsg({ tipo, text }); setTimeout(() => setMsg(null), 6000); };

  // ── Caricamento ──────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/cucina/ubicazioni/?reparto=cucina&solo_attive=false&con_stato=false`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setPosti(d.ubicazioni || []);
    } catch (e) { avviso("err", `Non riesco a leggere i posti: ${e.message}`); }
  }, []);

  const apri = useCallback(async (id) => {
    try {
      const res = await apiFetch(`${API_BASE}/cucina/ubicazioni/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setSel(d.ubicazione);
    } catch (e) { avviso("err", e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Posti ────────────────────────────────────────────────
  async function creaPosto() {
    if (!nuovo.nome.trim()) return;
    setBusy(true);
    try {
      const body = {
        nome: nuovo.nome.trim(),
        tipo: nuovo.tipo,
        reparto: "cucina",
        temp_min: nuovo.temp_min === "" ? null : Number(nuovo.temp_min),
        temp_max: nuovo.temp_max === "" ? null : Number(nuovo.temp_max),
        marca: nuovo.marca.trim() || null,
        modello: nuovo.modello.trim() || null,
        anno: nuovo.anno === "" ? null : Number(nuovo.anno),
        ordine: Number(nuovo.ordine) || 0,
        note: nuovo.note.trim() || null,
        n_ripiani: Math.max(1, Number(nuovo.n_ripiani) || 1),
      };
      const res = await apiFetch(`${API_BASE}/cucina/ubicazioni/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      const d = await res.json();
      setNuovo(null);
      await load();
      await apri(d.ubicazione.id);
      avviso("ok", `«${body.nome}» creato con ${body.n_ripiani} ripiani.`);
    } catch (e) { avviso("err", e.message); }
    finally { setBusy(false); }
  }

  async function salvaPosto(campi) {
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/ubicazioni/${sel.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campi),
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      await load(); await apri(sel.id);
      avviso("ok", "Salvato.");
    } catch (e) { avviso("err", e.message); }
    finally { setBusy(false); }
  }

  async function disattivaPosto() {
    if (!window.confirm(`Togliere «${sel.nome}» dal giro?\n\nNon si cancella: temperature, guasti e storia restano. Si può riattivare.`)) return;
    setBusy(true);
    try {
      await apiFetch(`${API_BASE}/cucina/ubicazioni/${sel.id}`, { method: "DELETE" });
      setSel(null); await load();
      avviso("ok", "Tolto dal giro.");
    } catch (e) { avviso("err", e.message); }
    finally { setBusy(false); }
  }

  // ── Ripiani ──────────────────────────────────────────────
  async function aggiungiRipiano() {
    const usati = (sel.ripiani || []).map((r) => r.codice);
    let n = 1; while (usati.includes(String(n))) n++;
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/ubicazioni/${sel.id}/ripiani`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codice: String(n), ordine: (sel.ripiani || []).length }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      await apri(sel.id);
    } catch (e) { avviso("err", e.message); }
    finally { setBusy(false); }
  }

  async function salvaRipiano(rid, campi) {
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/ubicazioni/${sel.id}/ripiani/${rid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campi),
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      await apri(sel.id);
    } catch (e) { avviso("err", e.message); }
    finally { setBusy(false); }
  }

  async function togliRipiano(r) {
    if (!window.confirm(`Togliere il ripiano ${r.codice}?`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/ubicazioni/${sel.id}/ripiani/${r.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      await apri(sel.id);
      avviso("ok", `Ripiano ${r.codice} tolto.`);
    } catch (e) { avviso("err", e.message); }
    finally { setBusy(false); }
  }

  // ── Dotazione a incolla-testo ────────────────────────────
  async function anteprima() {
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/scorte/dotazione/testo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ripiano_id: incolla.ripiano.id, testo: incolla.testo, conferma: false }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      setIncolla({ ...incolla, anteprima: await res.json() });
    } catch (e) { avviso("err", e.message); }
    finally { setBusy(false); }
  }

  async function confermaDotazione() {
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/scorte/dotazione/testo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ripiano_id: incolla.ripiano.id, testo: incolla.testo, conferma: true }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      const d = await res.json();
      setIncolla(null);
      await apri(sel.id);
      avviso("ok", `${d.righe_in_dotazione} righe messe sul ripiano, ${d.articoli_creati} articoli creati.`);
    } catch (e) { avviso("err", e.message); }
    finally { setBusy(false); }
  }

  async function togliDallaDotazione(art) {
    if (!window.confirm(`Togliere «${art.nome}» da questo ripiano?`)) return;
    setBusy(true);
    try {
      const p = new URLSearchParams({ articolo_id: art.articolo_id, ripiano_id: incolla ? incolla.ripiano.id : art.ripiano_id });
      const res = await apiFetch(`${API_BASE}/cucina/scorte/dotazione/?${p}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      await apri(sel.id);
    } catch (e) { avviso("err", e.message); }
    finally { setBusy(false); }
  }

  // ─────────────────────────────────────────────────────────
  if (posti === null) return <div className="text-sm text-neutral-500 p-4">Carico…</div>;

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-xl font-bold" style={{ fontFamily: "'Playfair Display',serif" }}>
          🧊 Frigoriferi &amp; Ripiani
        </h2>
        <p className="text-sm text-neutral-600 mt-1 max-w-2xl leading-relaxed">
          Qui si configura il magazzino di cucina: i posti, i loro ripiani e cosa ci sta di norma.
          È lavoro da fare una volta. Poi in servizio si usa <b>Cucina da iPhone</b>, dove
          basta toccare un pallino.
        </p>
      </header>

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${
          msg.tipo === "ok" ? "bg-green-50 border-green-200 text-green-800"
                            : "bg-red-50 border-red-200 text-red-800"}`}>
          {msg.text}
        </div>
      )}

      {/* ── Elenco posti ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {posti.map((u) => {
          const ti = tipoInfo(u.tipo);
          return (
            <button key={u.id} onClick={() => apri(u.id)}
                    className={`text-left rounded-2xl border p-4 transition ${
                      sel?.id === u.id ? "border-brand-blue bg-blue-50/40 shadow-sm"
                                       : "bg-white border-neutral-200 hover:border-neutral-300"}
                      ${u.attivo ? "" : " opacity-55"}`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{ti.e}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{u.nome}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {ti.l}
                    {ti.refrig && (u.temp_min != null || u.temp_max != null)
                      && ` · ${u.temp_min ?? "?"} / ${u.temp_max ?? "?"} °C`}
                    {!u.attivo && " · fuori dal giro"}
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        <button onClick={() => setNuovo({ ...VUOTO, ordine: posti.length })}
                className="rounded-2xl border-2 border-dashed border-neutral-300 p-4 text-neutral-500
                           hover:border-brand-blue hover:text-brand-blue transition min-h-[84px]">
          <div className="text-2xl">＋</div>
          <div className="text-sm font-semibold mt-1">Aggiungi un posto</div>
        </button>
      </div>

      {posti.length === 0 && !nuovo && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          <b>Non c'è ancora niente.</b> Comincia dal frigo che apri più spesso: dagli un nome,
          di' quanti ripiani ha, e poi incolla cosa ci sta dentro. Gli altri vengono dopo.
        </div>
      )}

      {/* ── Nuovo posto ── */}
      {nuovo && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
          <h3 className="font-bold">Nuovo posto</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome" hint="Come lo chiami tu: «Frigo carne», «Cella»">
              <input className={INPUT} value={nuovo.nome} autoFocus
                     onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })} />
            </Campo>
            <Campo label="Tipo">
              <select className={INPUT} value={nuovo.tipo}
                      onChange={(e) => setNuovo({ ...nuovo, tipo: e.target.value })}>
                {TIPI.map((t) => <option key={t.v} value={t.v}>{t.e} {t.l}</option>)}
              </select>
            </Campo>
            {tipoInfo(nuovo.tipo).refrig && (
              <>
                <Campo label="Temperatura minima °C" hint="Sotto questa, il sistema segnala">
                  <input className={INPUT} type="number" step="0.1" value={nuovo.temp_min}
                         onChange={(e) => setNuovo({ ...nuovo, temp_min: e.target.value })} />
                </Campo>
                <Campo label="Temperatura massima °C">
                  <input className={INPUT} type="number" step="0.1" value={nuovo.temp_max}
                         onChange={(e) => setNuovo({ ...nuovo, temp_max: e.target.value })} />
                </Campo>
              </>
            )}
            <Campo label="Quanti ripiani" hint="Nascono numerati 1, 2, 3… Se ne aggiunge o toglie dopo">
              <input className={INPUT} type="number" min="1" max="40" value={nuovo.n_ripiani}
                     onChange={(e) => setNuovo({ ...nuovo, n_ripiani: e.target.value })} />
            </Campo>
            <Campo label="Posizione nel giro" hint="0 = primo che controlli">
              <input className={INPUT} type="number" value={nuovo.ordine}
                     onChange={(e) => setNuovo({ ...nuovo, ordine: e.target.value })} />
            </Campo>
          </div>
          <div className="flex gap-2">
            <Btn variant="primary" onClick={creaPosto} disabled={busy || !nuovo.nome.trim()}>
              Crea
            </Btn>
            <Btn variant="ghost" onClick={() => setNuovo(null)}>Annulla</Btn>
          </div>
        </div>
      )}

      {/* ── Dettaglio posto selezionato ── */}
      {sel && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold" style={{ fontFamily: "'Playfair Display',serif" }}>
                {tipoInfo(sel.tipo).e} {sel.nome}
              </h3>
              <div className="text-xs text-neutral-500 mt-0.5">
                {(sel.ripiani || []).length} ripiani ·{" "}
                {(sel.ripiani || []).reduce((s, r) => s + (r.dotazione || []).length, 0)} articoli in dotazione
              </div>
            </div>
            <div className="flex gap-2">
              {!sel.attivo && (
                <Btn variant="chip" tone="emerald" onClick={() => salvaPosto({ attivo: true })} disabled={busy}>
                  Rimetti nel giro
                </Btn>
              )}
              {sel.attivo && (
                <Btn variant="chip" tone="red" onClick={disattivaPosto} disabled={busy}>
                  Togli dal giro
                </Btn>
              )}
              <Btn variant="ghost" onClick={() => setSel(null)}>Chiudi</Btn>
            </div>
          </div>

          {/* Anagrafica del posto */}
          <details className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
            <summary className="cursor-pointer text-sm font-semibold">Nome, tipo, soglie e scheda macchina</summary>
            <FormPosto sel={sel} onSalva={salvaPosto} busy={busy} />
          </details>

          {/* Ripiani */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm">Ripiani, dall'alto in basso</h4>
              <Btn variant="chip" tone="blue" size="sm" onClick={aggiungiRipiano} disabled={busy}>
                ＋ Aggiungi ripiano
              </Btn>
            </div>
            <p className="text-xs text-neutral-500 mb-3 max-w-2xl leading-relaxed">
              Il codice è <b>locale a questo posto</b>: il «2» di questo frigo e il «2» della dispensa
              non si pestano. La destinazione d'uso non è decorazione — se dichiari un ripiano
              «cotto» e ci finisce del crudo, la sotto-app lo segnala (non lo blocca: in servizio
              un blocco fa smettere la gente di usare l'app).
            </p>

            <div className="space-y-2">
              {(sel.ripiani || []).map((r) => (
                <Ripiano key={r.id} r={r} busy={busy}
                         onSalva={(campi) => salvaRipiano(r.id, campi)}
                         onTogli={() => togliRipiano(r)}
                         onIncolla={() => setIncolla({ ripiano: r, testo: "", anteprima: null })}
                         onTogliArt={togliDallaDotazione} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modale incolla-testo ── */}
      {incolla && (
        <Incolla stato={incolla} setStato={setIncolla} busy={busy}
                 onAnteprima={anteprima} onConferma={confermaDotazione}
                 ubicazione={sel?.nome} />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
const INPUT = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white " +
              "focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue";

function Campo({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-neutral-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-neutral-500 mt-1">{hint}</span>}
    </label>
  );
}

function FormPosto({ sel, onSalva, busy }) {
  const [f, setF] = useState({
    nome: sel.nome, tipo: sel.tipo,
    temp_min: sel.temp_min ?? "", temp_max: sel.temp_max ?? "",
    marca: sel.marca ?? "", modello: sel.modello ?? "", anno: sel.anno ?? "",
    ordine: sel.ordine ?? 0,
  });
  useEffect(() => {
    setF({
      nome: sel.nome, tipo: sel.tipo, temp_min: sel.temp_min ?? "", temp_max: sel.temp_max ?? "",
      marca: sel.marca ?? "", modello: sel.modello ?? "", anno: sel.anno ?? "", ordine: sel.ordine ?? 0,
    });
  }, [sel]);

  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Nome">
          <input className={INPUT} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </Campo>
        <Campo label="Tipo">
          <select className={INPUT} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            {TIPI.map((t) => <option key={t.v} value={t.v}>{t.e} {t.l}</option>)}
          </select>
        </Campo>
        {tipoInfo(f.tipo).refrig && (
          <>
            <Campo label="Temp. minima °C"><input className={INPUT} type="number" step="0.1"
              value={f.temp_min} onChange={(e) => setF({ ...f, temp_min: e.target.value })} /></Campo>
            <Campo label="Temp. massima °C"><input className={INPUT} type="number" step="0.1"
              value={f.temp_max} onChange={(e) => setF({ ...f, temp_max: e.target.value })} /></Campo>
          </>
        )}
        <Campo label="Marca"><input className={INPUT} value={f.marca}
          onChange={(e) => setF({ ...f, marca: e.target.value })} /></Campo>
        <Campo label="Modello"><input className={INPUT} value={f.modello}
          onChange={(e) => setF({ ...f, modello: e.target.value })} /></Campo>
        <Campo label="Anno"><input className={INPUT} type="number" value={f.anno}
          onChange={(e) => setF({ ...f, anno: e.target.value })} /></Campo>
        <Campo label="Posizione nel giro"><input className={INPUT} type="number" value={f.ordine}
          onChange={(e) => setF({ ...f, ordine: e.target.value })} /></Campo>
      </div>
      <Btn variant="primary" size="sm" disabled={busy} onClick={() => onSalva({
        nome: f.nome.trim(), tipo: f.tipo,
        temp_min: f.temp_min === "" ? null : Number(f.temp_min),
        temp_max: f.temp_max === "" ? null : Number(f.temp_max),
        marca: f.marca.trim() || null, modello: f.modello.trim() || null,
        anno: f.anno === "" ? null : Number(f.anno), ordine: Number(f.ordine) || 0,
      })}>Salva</Btn>
    </div>
  );
}

function Ripiano({ r, busy, onSalva, onTogli, onIncolla, onTogliArt }) {
  const [apri, setApri] = useState(false);
  const dot = r.dotazione || [];
  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <span className="w-8 h-8 rounded-lg bg-neutral-900 text-white grid place-items-center
                         font-bold text-sm shrink-0"
              style={{ fontFamily: "'Playfair Display',serif" }}>{r.codice}</span>

        <input className="rounded-lg border border-neutral-200 px-2 py-1 text-sm w-36"
               placeholder={`Ripiano ${r.codice}`} defaultValue={r.nome || ""}
               onBlur={(e) => { const v = e.target.value.trim();
                                if (v !== (r.nome || "")) onSalva({ nome: v || null }); }} />

        <select className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                  DEST_COLORE[r.destinazione] || "bg-white border-neutral-200 text-neutral-600"}`}
                value={r.destinazione || ""} disabled={busy}
                onChange={(e) => onSalva({ destinazione: e.target.value || null })}>
          {DESTINAZIONI.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
        </select>

        <button className="text-xs text-neutral-500 hover:text-neutral-800 ml-auto"
                onClick={() => setApri(!apri)}>
          {dot.length} articoli {apri ? "▲" : "▼"}
        </button>
        <Btn variant="chip" tone="blue" size="sm" onClick={onIncolla} disabled={busy}>
          📋 Cosa ci sta
        </Btn>
        <button className="text-neutral-400 hover:text-red-600 text-lg px-1"
                onClick={onTogli} disabled={busy} title="Togli il ripiano">×</button>
      </div>

      {apri && (
        <div className="border-t border-neutral-100 bg-neutral-50/60 px-3 py-2">
          {dot.length === 0 && (
            <div className="text-xs text-neutral-500 py-2">
              Ripiano vuoto. «Cosa ci sta» per incollare la lista.
            </div>
          )}
          {dot.map((a) => (
            <div key={a.giacenza_id} className="flex items-center gap-2 py-1.5 text-sm border-b border-neutral-100 last:border-0">
              <span className="flex-1 truncate">{a.nome}</span>
              <span className="text-xs text-neutral-500">{a.um}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-white border border-neutral-200">
                {(a.regime || "").toLowerCase()}
              </span>
              {a.fuori_posto && (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  ⚠ fuori posto
                </span>
              )}
              <button className="text-neutral-400 hover:text-red-600 px-1"
                      onClick={() => onTogliArt({ ...a, ripiano_id: r.id })}
                      title="Togli dalla dotazione">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ESITO = {
  ESISTE: { c: "bg-green-500", s: "✓", t: "già in anagrafica" },
  NUOVO: { c: "bg-blue-500", s: "+", t: "articolo nuovo, lo creo io" },
  SIMILE: { c: "bg-amber-500", s: "?", t: "forse è un doppione" },
};

function Incolla({ stato, setStato, busy, onAnteprima, onConferma, ubicazione }) {
  const a = stato.anteprima;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
         onClick={(e) => { if (e.target === e.currentTarget) setStato(null); }}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[88vh] overflow-y-auto p-6 space-y-4">
        <div>
          <h3 className="text-lg font-bold" style={{ fontFamily: "'Playfair Display',serif" }}>
            Cosa sta sul ripiano {stato.ripiano.codice}
          </h3>
          <div className="text-xs text-neutral-500 mt-0.5">
            {ubicazione}
            {stato.ripiano.destinazione && ` · ${stato.ripiano.destinazione.toLowerCase()}`}
          </div>
        </div>

        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          <b>Una riga per articolo.</b> Il nome basta; se aggiungi quantità e unità le prendo,
          altrimenti parte da zero.<br />
          <span className="font-mono text-xs">costata di manzo 4,2 kg · guanciale · riso 12 pz</span>
        </div>

        <textarea className="w-full min-h-[160px] rounded-xl border border-neutral-300 p-3
                             font-mono text-sm leading-relaxed"
                  placeholder={"costata di manzo 4,2 kg\npetto d'anatra 6 pz\nguanciale"}
                  value={stato.testo}
                  onChange={(e) => setStato({ ...stato, testo: e.target.value, anteprima: null })} />

        {!a && (
          <div className="flex gap-2">
            <Btn variant="primary" onClick={onAnteprima} disabled={busy || !stato.testo.trim()}>
              Vedi cosa succede
            </Btn>
            <Btn variant="ghost" onClick={() => setStato(null)}>Annulla</Btn>
          </div>
        )}

        {a && (
          <>
            <div className="text-sm font-semibold">
              Anteprima · {a.righe.length} righe
              <span className="font-normal text-neutral-500 ml-2">
                {a.riepilogo.esistenti} già in anagrafica · {a.riepilogo.nuovi} nuovi
                {a.riepilogo.simili > 0 && ` · ${a.riepilogo.simili} da controllare`}
              </span>
            </div>

            {a.riepilogo.simili > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                <b>Guarda le righe gialle prima di confermare.</b> Se una è davvero lo stesso
                articolo che hai già, correggi il nome nel testo qui sopra perché combaci —
                altrimenti creo un doppione, e un doppione in anagrafica resta lì per anni.
              </div>
            )}

            <div className="space-y-1.5">
              {a.righe.map((r, i) => {
                const e = ESITO[r.esito] || ESITO.NUOVO;
                return (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2">
                    <span className={`w-5 h-5 rounded-full ${e.c} text-white text-xs font-bold grid place-items-center shrink-0`}>
                      {e.s}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {r.nome}{r.qta != null && ` · ${r.qta} ${r.um || ""}`}
                      </div>
                      <div className="text-[11px] text-neutral-500">{r.nota || e.t}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-1">
              <Btn variant="success" onClick={onConferma} disabled={busy}>
                Metti le {a.righe.length} righe sul ripiano
              </Btn>
              <Btn variant="ghost" onClick={() => setStato({ ...stato, anteprima: null })}>
                Torna al testo
              </Btn>
              <Btn variant="ghost" onClick={() => setStato(null)}>Annulla</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
