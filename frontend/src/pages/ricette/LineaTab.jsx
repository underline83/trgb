// Modulo: cucina (scheda mostrata dentro la ricetta)
// LineaTab — scheda «Linea» di una ricetta (spec_linea_cucina.md, fase L1, mig 202)
//
// Mostra l'articolo di Frigoriferi e scorte che la ricetta E' (se e' una
// preparazione tenuta in frigo/gelo) e quelli degli elementi della ricetta
// (preparazioni e componenti), con: minimo frigo, minimo gelo, quantita' di
// riordino/produzione e la dotazione IN LINEA per partita.
// Dati: GET /cucina/scorte/linea/ricetta/{id}. Scritture: articoli + linea.
import React, { useCallback, useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";

const PARTITE = ["antipasti", "primi", "secondi", "contorni", "dolci", "generale"];

async function call(url, opts) {
  const res = await apiFetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

const numOrNull = (v) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));

function ArticoloCard({ art, onChanged, setErr }) {
  const [f, setF] = useState({
    scorta_min_frigo: art.scorta_min_frigo ?? "",
    scorta_min_gelo: art.scorta_min_gelo ?? "",
    qta_riordino: art.qta_riordino ?? "",
  });
  const [nuova, setNuova] = useState({ partita: "", linea_qta: "", linea_note: "" });
  const [busy, setBusy] = useState(false);
  const cambiato =
    String(f.scorta_min_frigo) !== String(art.scorta_min_frigo ?? "") ||
    String(f.scorta_min_gelo) !== String(art.scorta_min_gelo ?? "") ||
    String(f.qta_riordino) !== String(art.qta_riordino ?? "");

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await onChanged(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const salvaParametri = () => run(() => call(`${API_BASE}/cucina/scorte/articoli/${art.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      scorta_min_frigo: numOrNull(f.scorta_min_frigo),
      scorta_min_gelo: numOrNull(f.scorta_min_gelo),
      qta_riordino: numOrNull(f.qta_riordino),
    }),
  }));
  const aggiungiLinea = () => {
    if (!nuova.partita) { setErr("Scegli la partita"); return; }
    run(async () => {
      await call(`${API_BASE}/cucina/scorte/linea/`, {
        method: "POST",
        body: JSON.stringify({ articolo_id: art.id, ...nuova }),
      });
      setNuova({ partita: "", linea_qta: "", linea_note: "" });
    });
  };
  const aggiornaLinea = (id, patch) => run(() => call(`${API_BASE}/cucina/scorte/linea/${id}`, {
    method: "PATCH", body: JSON.stringify(patch),
  }));
  const togliLinea = (id) => run(() => call(`${API_BASE}/cucina/scorte/linea/${id}`, { method: "DELETE" }));

  const fmt = (v) => (v == null ? "—" : String(v).replace(".", ","));
  const um = (art.um || "").toLowerCase();

  return (
    <div className="border border-neutral-200 rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="font-semibold text-brand-ink">{art.nome}</div>
        <div className="text-xs text-neutral-500">
          In frigo: <b>{fmt(art.giacenza_frigo)}</b> {um} · In gelo: <b>{fmt(art.giacenza_gelo)}</b> {um}
          {!art.ripiano_casa_id && <span className="ml-2 text-amber-700">· nessun ripiano di casa</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
        {[
          ["scorta_min_frigo", "Minimo frigo"],
          ["scorta_min_gelo", "Minimo gelo"],
          ["qta_riordino", "Riordino / produzione"],
        ].map(([k, label]) => (
          <label key={k} className="text-xs text-neutral-600">
            {label} ({um})
            <input
              inputMode="decimal"
              value={f[k]}
              onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 min-h-[44px] text-sm"
              placeholder="—"
            />
          </label>
        ))}
        <Btn variant="primary" size="md" disabled={!cambiato || busy} onClick={salvaParametri}>
          Salva
        </Btn>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">In linea</div>
        {art.linea.length === 0 && (
          <div className="text-xs text-neutral-500 mb-2">Non è ancora in nessuna linea.</div>
        )}
        <div className="space-y-2">
          {art.linea.map((l) => (
            <RigaLinea key={l.id} l={l} busy={busy}
                       onSave={(patch) => aggiornaLinea(l.id, patch)}
                       onRemove={() => togliLinea(l.id)} />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr_1fr_auto] gap-2 mt-2">
          <select value={nuova.partita} onChange={(e) => setNuova((x) => ({ ...x, partita: e.target.value }))}
                  className="border rounded-lg px-3 py-2 min-h-[44px] text-sm">
            <option value="">Partita…</option>
            {PARTITE.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={nuova.linea_qta} onChange={(e) => setNuova((x) => ({ ...x, linea_qta: e.target.value }))}
                 placeholder="In linea (es. GN 1/9 + 1 pentolino)"
                 className="border rounded-lg px-3 py-2 min-h-[44px] text-sm" />
          <input value={nuova.linea_note} onChange={(e) => setNuova((x) => ({ ...x, linea_note: e.target.value }))}
                 placeholder="Nota (es. a metà, scongelarne un altro)"
                 className="border rounded-lg px-3 py-2 min-h-[44px] text-sm" />
          <Btn variant="chip" tone="red" size="md" disabled={busy} onClick={aggiungiLinea}>+ Linea</Btn>
        </div>
      </div>
    </div>
  );
}

function RigaLinea({ l, busy, onSave, onRemove }) {
  const [qta, setQta] = useState(l.linea_qta || "");
  const [note, setNote] = useState(l.linea_note || "");
  const cambiato = qta !== (l.linea_qta || "") || note !== (l.linea_note || "");
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr_1fr_auto_auto] gap-2 items-center">
      <span className="text-sm font-medium capitalize">{l.partita}</span>
      <input value={qta} onChange={(e) => setQta(e.target.value)}
             className="border rounded-lg px-3 py-2 min-h-[44px] text-sm" />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota"
             className="border rounded-lg px-3 py-2 min-h-[44px] text-sm" />
      <Btn variant="secondary" size="sm" disabled={!cambiato || busy}
           onClick={() => onSave({ linea_qta: qta, linea_note: note })}>Salva</Btn>
      <label className="text-xs text-neutral-600 inline-flex items-center gap-1.5 sm:col-start-2"
             title="Nel gruppo «Generale» della checklist della partita: c'è sempre, anche se nessun piatto in carta lo usa">
        <input type="checkbox" checked={!!l.generale} disabled={busy}
               onChange={(e) => onSave({ generale: e.target.checked })} />
        in «Generale» della partita
      </label>
      <Btn variant="chip" tone="red" size="sm" disabled={busy} onClick={onRemove}
           title="Toglie l'elemento da questa linea">Togli</Btn>
    </div>
  );
}

export default function LineaTab({ r }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await call(`${API_BASE}/cucina/scorte/linea/ricetta/${r.id}`));
      setErr("");
    } catch (e) { setErr(e.message); }
  }, [r.id]);
  useEffect(() => { load(); }, [load]);

  // Crea l'articolo in Scorte per una preparazione o un componente.
  const creaArticolo = async ({ nome, recipe_id, ingredient_id, preparazione }) => {
    setBusy(true);
    try {
      await call(`${API_BASE}/cucina/scorte/articoli/`, {
        method: "POST",
        body: JSON.stringify({
          nome,
          recipe_id: recipe_id || null,
          ingredient_id: ingredient_id || null,
          // Preparazioni: buste e vaschette si contano. Componenti: si parte
          // dal semaforo, che costa zero disciplina (modulo_scorte_cucina §3).
          regime: preparazione ? "MOVIMENTI" : "SEMAFORO",
          natura: preparazione ? "SEMILAVORATO" : null,
          um: "PZ",
        }),
      });
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!data) {
    return <div className="text-sm text-neutral-500">{err || "Carico…"}</div>;
  }

  return (
    <div className="space-y-6">
      {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{err}</div>}

      <p className="text-xs text-neutral-500">
        Da qui si scrivono le checklist di linea: per ogni piatto in carta che usa questa
        ricetta, la voce di linea (semaforo) e, una volta per partita, la scorta di frigo e
        gelo da confermare. Se cambi qualcosa, le checklist «dal menu» si aggiornano da sole.
        Le giacenze vengono da Frigoriferi e scorte.
      </p>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-3">
          Questa ricetta in frigo e in linea
        </h2>
        {data.articoli.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-600 flex items-center justify-between gap-3 flex-wrap">
            <span>Non è ancora un articolo in Frigoriferi e scorte.</span>
            <Btn variant="secondary" size="md" disabled={busy}
                 onClick={() => creaArticolo({ nome: r.name, recipe_id: r.id, preparazione: true })}>
              Crea articolo
            </Btn>
          </div>
        ) : (
          <div className="space-y-3">
            {data.articoli.map((a) => <ArticoloCard key={a.id} art={a} onChanged={load} setErr={setErr} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-3">
          Elementi della ricetta
        </h2>
        {data.elementi.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-4 text-sm text-neutral-600">
            La ricetta non ha ancora righe. Aggiungi preparazioni e componenti in «Modifica»:
            da lì arrivano gli elementi della linea.
          </div>
        ) : (
          <div className="space-y-3">
            {data.elementi.map((el, i) => (
              <div key={i} className="space-y-2">
                <div className="text-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wide px-2 py-0.5 rounded-full border mr-2 bg-white">
                    {el.tipo}
                  </span>
                  <b>{el.nome}</b>
                </div>
                {el.articoli.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-600 flex items-center justify-between gap-3 flex-wrap">
                    <span>Nessun articolo in Frigoriferi e scorte.</span>
                    <Btn variant="secondary" size="sm" disabled={busy}
                         onClick={() => creaArticolo({
                           nome: el.nome, recipe_id: el.recipe_id, ingredient_id: el.ingredient_id,
                           preparazione: el.tipo === "preparazione",
                         })}>
                      Crea articolo
                    </Btn>
                  </div>
                ) : (
                  el.articoli.map((a) => <ArticoloCard key={a.id} art={a} onChanged={load} setErr={setErr} />)
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
