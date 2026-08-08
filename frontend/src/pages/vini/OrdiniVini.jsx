// Modulo: vini (ordini ai fornitori) — [core]
// @version: v1.1-O6 (2026-08-02) — Pagina Ordini fornitore-centrica.
//   v1.1: bottone "⛔ Annulla" sugli ordini in viaggio. L'endpoint e il modello
//   c'erano dalla v1.0, mancava solo il modo di premerli.
//
// Sostituisce il lavoro che prima si faceva su DUE widget sovrapposti della
// dashboard ("Riordini per fornitore" e "Vini in carta senza giacenza"), che
// avevano entrambi "+ ordina" ed entrambi il raggruppamento per distributore.
//
// Layout master-detail, pensato per i due momenti in cui Marco ordina davvero
// (2026-08-02): col rappresentante davanti, oppure mandando un WhatsApp.
//   Sinistra: fornitori, quanti vini da ordinare, che ordini sono in giro.
//   Destra:   il fornitore selezionato — da ordinare / carrello / storico.
//
// Vedi `docs/modulo_vini_ordini.md`.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ViniNav from "./ViniNav";
import useToast from "../../hooks/useToast";
import { Btn, Modal, Textarea } from "../../components/ui";
import { fillTemplate, buildWaLink, normalizePhone } from "../../utils/whatsapp";

const STATI = {
  bozza:     { label: "In preparazione", icon: "📝", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  inviato:   { label: "Inviato",         icon: "📤", cls: "bg-sky-100 text-sky-800 border-sky-200" },
  parziale:  { label: "Arrivato in parte", icon: "📦", cls: "bg-orange-100 text-orange-800 border-orange-200" },
  chiuso:    { label: "Completato",      icon: "✅", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  annullato: { label: "Annullato",       icon: "⛔", cls: "bg-neutral-100 text-neutral-500 border-neutral-200" },
};

// RD.1 (2026-08-08) — Il widget della dashboard e' il primo selettore del
// riordino: Marco flagga lì e ritrova il segnale qui. Solo i due stati che
// contano in questa pagina: 'A' e 'X' non arrivano nemmeno (query backend).
// Colori allineati a viniConstants.STATO_RIORDINO, non reinventati.
const SEGNALE_RIORDINO = {
  D: { label: "da ordinare", icon: "📝", chip: "bg-orange-100 text-orange-800 border-orange-200",
       row: "border-l-4 border-orange-400 bg-orange-50/40" },
  O: { label: "da ordinare", icon: "📝", chip: "bg-orange-100 text-orange-800 border-orange-200",
       row: "border-l-4 border-orange-400 bg-orange-50/40" },
  "0": { label: "segnato ordinato", icon: "📦", chip: "bg-sky-100 text-sky-800 border-sky-200",
       row: "border-l-4 border-sky-400 bg-sky-50/40" },
};

const TIPOLOGIE = [
  { key: "tutti",     label: "Tutti",     match: () => true },
  { key: "rossi",     label: "Rossi",     match: t => /ROSS/i.test(t || "") },
  { key: "bianchi",   label: "Bianchi",   match: t => /BIANC/i.test(t || "") },
  { key: "bollicine", label: "Bollicine", match: t => /(BOLL|SPUMANT|CHAMPAGNE)/i.test(t || "") },
  { key: "rosati",    label: "Rosati",    match: t => /ROSAT/i.test(t || "") },
];

const fmtEur = (n) =>
  n == null ? null : `${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const fmtData = (iso) =>
  !iso ? "" : new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });

const giorniDa = (iso) =>
  !iso ? null : Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export default function OrdiniVini() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const role = (typeof localStorage !== "undefined" ? localStorage.getItem("role") : "") || "";
  const canEdit = ["admin", "superadmin", "sommelier"].includes(role);

  // La dashboard linka qui con ?fornitore=<nome>: chi clicca "+ ordina" su un
  // vino deve atterrare sul distributore giusto, non sul primo della lista.
  const [searchParams] = useSearchParams();
  const fornitoreDaUrl = searchParams.get("fornitore");

  const [fornitori, setFornitori] = useState([]);
  const [sel, setSel] = useState(fornitoreDaUrl || null);   // fornitore_nome selezionato
  const [loadingForn, setLoadingForn] = useState(true);
  const [cercaForn, setCercaForn] = useState("");
  // mig 160: i distributori con cui non si lavora più sono nascosti. Restano
  // visibili lo stesso se hanno un ordine aperto (lo dice il backend).
  const [mostraInattivi, setMostraInattivi] = useState(false);

  const [daOrdinare, setDaOrdinare] = useState([]);
  const [ordini, setOrdini] = useState([]);
  const [loadingDett, setLoadingDett] = useState(false);
  const [errore, setErrore] = useState("");

  const [cerca, setCerca] = useState("");
  const [tipologia, setTipologia] = useState("tutti");
  const [settings, setSettings] = useState(null);
  const [sogliaFermo, setSogliaFermo] = useState(30);
  const [waOrdine, setWaOrdine] = useState(null);   // ordine per cui è aperto il modale WA
  const [ricevendo, setRicevendo] = useState(null); // ordine in ricezione
  const [busy, setBusy] = useState(false);

  // ── Caricamenti ───────────────────────────────────────────
  const caricaFornitori = useCallback(async () => {
    setLoadingForn(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/ordini/fornitori/?includi_inattivi=${mostraInattivi}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setFornitori(data);
      setSel(prev => {
        if (prev && data.some(f => f.fornitore_nome === prev)) return prev;
        // Il nome che arriva dall'URL può non essere fra quelli "con lavoro"
        // (es. distributore senza niente da ordinare): in quel caso lo tengo
        // comunque, la colonna destra sa mostrare una lista vuota.
        if (prev) return prev;
        return data[0]?.fornitore_nome ?? null;
      });
    } catch (e) {
      setErrore(`Non riesco a caricare i fornitori: ${e.message}`);
    } finally {
      setLoadingForn(false);
    }
  }, [mostraInattivi]);

  // Guardia di sequenza: cliccando in fretta A poi B, la risposta di A puo'
  // arrivare dopo quella di B e lasciare i dati di A sotto l'intestazione di B,
  // in modo permanente. Scarto tutto quello che non e' l'ultima richiesta.
  const reqRef = useRef(0);

  const caricaDettaglio = useCallback(async (fornitore) => {
    if (!fornitore) return;
    const mio = ++reqRef.current;
    setLoadingDett(true); setErrore("");
    // Svuoto subito: meglio uno scheletro vuoto per mezzo secondo che il
    // carrello del fornitore precedente sotto il nome di quello nuovo.
    setDaOrdinare([]); setOrdini([]);
    try {
      const q = encodeURIComponent(fornitore);
      const [rD, rO] = await Promise.all([
        apiFetch(`${API_BASE}/vini/ordini/da-ordinare/?fornitore_nome=${q}`),
        apiFetch(`${API_BASE}/vini/ordini/?fornitore_nome=${q}&limit=20`),
      ]);
      if (mio !== reqRef.current) return;          // sorpassata da una più recente
      if (!rD.ok) throw new Error(`HTTP ${rD.status} (da ordinare)`);
      const [dOrd, dOrdini] = [await rD.json(), rO.ok ? await rO.json() : []];
      if (mio !== reqRef.current) return;
      setDaOrdinare(dOrd);
      setOrdini(dOrdini);
    } catch (e) {
      if (mio !== reqRef.current) return;
      setErrore(String(e.message || e));
      setDaOrdinare([]); setOrdini([]);
    } finally {
      if (mio === reqRef.current) setLoadingDett(false);
    }
  }, []);

  useEffect(() => { caricaFornitori(); }, [caricaFornitori]);
  useEffect(() => { caricaDettaglio(sel); setCerca(""); setTipologia("tutti"); }, [sel, caricaDettaglio]);

  // Template WhatsApp: serve solo quando si invia, ma è una chiamata sola.
  // L'endpoint torna { chiave: {value, tipo, descrizione, ...} }, non valori
  // piatti: appiattisco qui una volta invece che in ogni punto d'uso.
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/settings/vini/widget/`);
        if (!r.ok) return;
        const raw = await r.json();
        setSettings(
          Object.fromEntries(
            Object.entries(raw || {}).map(([k, v]) => [k, v && typeof v === "object" ? v.value : v])
          )
        );
      } catch { /* il modale userà i default */ }
    })();
    // La soglia "ordine fermo" la espone il riepilogo, non la lista fornitori.
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/vini/ordini/riepilogo/`);
        if (r.ok) {
          const d = await r.json();
          if (d?.soglia_fermo_giorni) setSogliaFermo(d.soglia_fermo_giorni);
        }
      } catch { /* resta il default 30 */ }
    })();
  }, []);

  // ── Derivati ──────────────────────────────────────────────
  const fornitoriVisibili = useMemo(() => {
    const q = cercaForn.trim().toLowerCase();
    return q ? fornitori.filter(f => f.fornitore_nome.toLowerCase().includes(q)) : fornitori;
  }, [fornitori, cercaForn]);

  const fornitoreSel = useMemo(
    () => fornitori.find(f => f.fornitore_nome === sel) || null,
    [fornitori, sel]
  );

  const bozza = useMemo(() => ordini.find(o => o.stato === "bozza") || null, [ordini]);
  const inViaggio = useMemo(() => ordini.filter(o => ["inviato", "parziale"].includes(o.stato)), [ordini]);
  const storico = useMemo(
    () => ordini.filter(o => ["chiuso", "annullato"].includes(o.stato)).slice(0, 5),
    [ordini]
  );

  const daOrdinareFiltrati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const tf = TIPOLOGIE.find(t => t.key === tipologia) || TIPOLOGIE[0];
    return daOrdinare.filter(v =>
      tf.match(v.TIPOLOGIA) &&
      (!q ||
        (v.DESCRIZIONE || "").toLowerCase().includes(q) ||
        (v.PRODUTTORE || "").toLowerCase().includes(q))
    );
  }, [daOrdinare, cerca, tipologia]);

  // ── Azioni ────────────────────────────────────────────────
  const ricarica = useCallback(async () => {
    await Promise.all([caricaFornitori(), caricaDettaglio(sel)]);
  }, [caricaFornitori, caricaDettaglio, sel]);

  const ordina = async (vino, qta) => {
    const n = parseInt(qta, 10);
    if (!Number.isFinite(n) || n <= 0) { toast("Quantità non valida", { kind: "warn" }); return; }
    setBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/ordini/riga/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vino_id: vino.id, qta: n }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(e.detail || `HTTP ${r.status}`);
      }
      await ricarica();
    } catch (e) {
      toast(`Non sono riuscito ad aggiungere: ${e.message}`, { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const togliRiga = async (riga) => {
    setBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/ordini/riga/${riga.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await ricarica();
    } catch (e) {
      toast(`Errore: ${e.message}`, { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const annullaOrdine = async (ordine) => {
    const gg = giorniDa(ordine.data_invio);
    if (!window.confirm(
      `Annullare l'ordine #${ordine.id} a ${sel}?\n\n` +
      `${ordine.n_righe} vini, ${ordine.qta_totale} bottiglie` +
      (ordine.data_invio ? `, inviato il ${fmtData(ordine.data_invio)}${gg != null ? ` (${gg} giorni fa)` : ""}` : "") +
      `.\n\nL'ordine resta nello storico come annullato. Le giacenze non vengono toccate.`
    )) return;
    setBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/ordini/${ordine.id}/annulla`, { method: "POST" });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(e.detail || `HTTP ${r.status}`);
      }
      await ricarica();
      toast("Ordine annullato", { kind: "success" });
    } catch (e) {
      toast(`Non sono riuscito ad annullare: ${e.message}`, { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const segnaInviato = async (ordineId, canale) => {
    setBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/ordini/${ordineId}/invia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canale }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(e.detail || `HTTP ${r.status}`);
      }
      await ricarica();
      return true;
    } catch (e) {
      toast(`Errore: ${e.message}`, { kind: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-brand-cream">
      <ViniNav current="ordini" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6">

        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-amber-900 font-playfair">📦 Ordini ai fornitori</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Scegli un distributore a sinistra: cosa ordinargli, il carrello aperto e gli ultimi ordini.
          </p>
        </div>

        {errore && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{errore}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">

          {/* ══ SINISTRA — FORNITORI ══════════════════════ */}
          <aside className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden self-start">
            <div className="px-3 py-2 border-b border-neutral-200 bg-amber-50">
              <input
                value={cercaForn}
                onChange={e => setCercaForn(e.target.value)}
                placeholder="Cerca distributore…"
                className="w-full px-2 py-1.5 rounded-lg border border-amber-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                style={{ fontSize: "16px" }}
              />
              <label className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-900 cursor-pointer select-none">
                <input type="checkbox" checked={mostraInattivi}
                       onChange={e => setMostraInattivi(e.target.checked)} />
                Mostra anche quelli non attivi
              </label>
            </div>
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-neutral-100">
              {loadingForn && <div className="p-6 text-center text-sm text-neutral-500">Carico…</div>}
              {!loadingForn && fornitoriVisibili.length === 0 && (
                <div className="p-6 text-center text-sm text-neutral-500">Nessun distributore.</div>
              )}
              {fornitoriVisibili.map(f => {
                const attivo = f.fornitore_nome === sel;
                return (
                  <button
                    key={f.fornitore_nome}
                    onClick={() => setSel(f.fornitore_nome)}
                    className={`w-full text-left px-3 py-2.5 transition ${
                      attivo ? "bg-amber-100/70 border-l-4 border-amber-600" : "hover:bg-amber-50/50 border-l-4 border-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-sm truncate ${attivo ? "font-bold text-amber-900" : "font-medium text-neutral-800"} ${f.attivo === false ? "italic text-neutral-500" : ""}`}>
                        {f.fornitore_nome}
                      </span>
                      {f.da_ordinare > 0 && (
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 tabular-nums">
                          {f.da_ordinare}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {f.bozza > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900">
                          📝 carrello
                        </span>
                      )}
                      {f.in_viaggio > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800">
                          📤 {f.in_viaggio} in arrivo
                        </span>
                      )}
                      {f.attivo === false && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-600">
                          non attivo
                        </span>
                      )}
                      {!f.ha_telefono && f.fornitore_id && (
                        <span className="text-[10px] text-neutral-400" title="Manca il telefono del rappresentante">
                          ☎️ —
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ══ DESTRA — FORNITORE SELEZIONATO ════════════ */}
          <main className="space-y-4 min-w-0">
            {!sel && <div className="bg-white rounded-2xl border p-8 text-center text-sm text-neutral-500">Scegli un distributore.</div>}

            {sel && (
              <>
                {/* Testata fornitore */}
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm px-5 py-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-neutral-900 font-playfair truncate">🚚 {sel}</h2>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {fornitoreSel?.rappresentante_nome || <span className="text-neutral-400">rappresentante non indicato</span>}
                        {fornitoreSel && !fornitoreSel.ha_telefono && fornitoreSel.fornitore_id && (
                          <>
                            {" · "}
                            <button onClick={() => navigate("/vini/anagrafiche")}
                                    className="text-amber-700 hover:underline">
                              manca il telefono, aggiungilo
                            </button>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold text-neutral-900 tabular-nums">{daOrdinare.length}</div>
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500">da ordinare</div>
                    </div>
                  </div>
                </div>

                {/* ── CARRELLO ─────────────────────────── */}
                {/* Gated su loadingDett: senza, il carrello del fornitore
                    precedente resta a schermo sotto il nome di quello nuovo,
                    con la ✕ attiva — si cancella la riga sbagliata. */}
                {!loadingDett && bozza && (
                  <Carrello
                    ordine={bozza}
                    canEdit={canEdit}
                    busy={busy}
                    onTogli={togliRiga}
                    onInviaWa={() => setWaOrdine(bozza)}
                    onSegnaInviato={(canale) => segnaInviato(bozza.id, canale)}
                    fornitore={fornitoreSel}
                  />
                )}

                {/* ── ORDINI IN VIAGGIO ────────────────── */}
                {!loadingDett && inViaggio.map(o => (
                  <OrdineInViaggio
                    key={o.id}
                    ordine={o}
                    soglia={sogliaFermo}
                    canEdit={canEdit}
                    busy={busy}
                    onRicevi={() => setRicevendo(o)}
                    onAnnulla={() => annullaOrdine(o)}
                  />
                ))}

                {/* ── DA ORDINARE ──────────────────────── */}
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-neutral-200 flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">Da ordinare</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        value={cerca}
                        onChange={e => setCerca(e.target.value)}
                        placeholder="Cerca vino o produttore…"
                        className="px-2 py-1 rounded-lg border border-neutral-300 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        style={{ fontSize: "16px" }}
                      />
                      <div className="flex gap-1">
                        {TIPOLOGIE.map(t => (
                          <button key={t.key} onClick={() => setTipologia(t.key)}
                            className={`px-2 py-1 rounded-full text-[11px] font-medium border transition ${
                              tipologia === t.key
                                ? "bg-amber-600 text-white border-amber-700"
                                : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50"
                            }`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {loadingDett && <div className="p-8 text-center text-sm text-neutral-500">Carico…</div>}
                  {!loadingDett && daOrdinareFiltrati.length === 0 && (
                    <div className="p-8 text-center text-sm text-neutral-500">
                      {daOrdinare.length === 0
                        ? "Niente da ordinare a questo distributore."
                        : "Nessun vino con questi filtri."}
                    </div>
                  )}
                  {!loadingDett && daOrdinareFiltrati.length > 0 && (
                    <div className="max-h-[55vh] overflow-y-auto divide-y divide-neutral-100">
                      {daOrdinareFiltrati.map(v => (
                        <RigaDaOrdinare
                          key={v.id}
                          vino={v}
                          canEdit={canEdit}
                          busy={busy}
                          onOrdina={(q) => ordina(v, q)}
                          onApri={() => navigate(`/vini/v2/bottiglia/${v.id}`)}
                        />
                      ))}
                    </div>
                  )}
                  {!loadingDett && daOrdinare.length > daOrdinareFiltrati.length && (
                    <div className="px-5 py-2 text-[11px] text-neutral-400 border-t border-neutral-100">
                      {daOrdinareFiltrati.length} di {daOrdinare.length} — il resto è nascosto dai filtri.
                    </div>
                  )}
                </div>

                {/* ── STORICO ──────────────────────────── */}
                {storico.length > 0 && (
                  <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-neutral-200">
                      <h3 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">Ultimi ordini</h3>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Quello che serve quando il rappresentante chiede "l'ultima volta cosa ti avevo portato?"
                      </p>
                    </div>
                    <div className="divide-y divide-neutral-100">
                      {storico.map(o => <RigaStorico key={o.id} ordine={o} />)}
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {waOrdine && (
        <ModaleWhatsApp
          ordine={waOrdine}
          settings={settings}
          onClose={() => setWaOrdine(null)}
          onInviato={async (canale) => {
            const ok = await segnaInviato(waOrdine.id, canale);
            if (ok) { setWaOrdine(null); toast("Ordine segnato come inviato", { kind: "success" }); }
          }}
        />
      )}

      {ricevendo && (
        <ModaleRicezione
          ordineId={ricevendo.id}
          onClose={() => setRicevendo(null)}
          onFatto={async () => { setRicevendo(null); await ricarica(); toast("Arrivo registrato", { kind: "success" }); }}
          onErrore={(m) => toast(m, { kind: "error" })}
        />
      )}
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// RIGA "DA ORDINARE"
// ════════════════════════════════════════════════════════════
function RigaDaOrdinare({ vino: v, canEdit, busy, onOrdina, onApri }) {
  // Precompilo con la quantità suggerita: nel 90% dei casi è quella giusta e
  // si preme solo Invio. Se non c'è storico vendite resta vuoto.
  const [qta, setQta] = useState(v.in_bozza ?? v.qta_suggerita ?? "");
  useEffect(() => { setQta(v.in_bozza ?? v.qta_suggerita ?? ""); }, [v.in_bozza, v.qta_suggerita]);

  const rv = v.ritmo_vendita || {};
  const ritmoCls =
    rv.color_tone === "emerald" ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : rv.color_tone === "amber" ? "bg-amber-50 text-amber-800 border-amber-200"
    : "bg-neutral-100 text-neutral-500 border-neutral-200";

  // RD.1 — tono della riga. Il carrello vince su tutto (è la decisione più
  // recente), poi il segnale messo dal widget, poi la giacenza.
  const segnale = SEGNALE_RIORDINO[v.STATO_RIORDINO] || null;
  const rowTone = v.in_bozza
    ? "border-l-4 border-amber-400 bg-amber-50/40"
    : segnale
      ? `${segnale.row} hover:bg-neutral-50/60`
      : (Number(v.QTA_TOTALE) || 0) === 0
        ? "border-l-4 border-red-300 hover:bg-neutral-50"
        : "border-l-4 border-transparent hover:bg-neutral-50";

  return (
    <div className={`px-5 py-2.5 flex items-center gap-3 flex-wrap transition ${rowTone}`}>
      <div className="min-w-0 flex-1">
        <button onClick={onApri} className="text-left block max-w-full">
          <span className="text-sm font-semibold text-neutral-800 hover:text-amber-800 hover:underline">
            {v.DESCRIZIONE}
          </span>
          {v.ANNATA && <span className="text-xs text-neutral-400 ml-1.5">{v.ANNATA}</span>}
        </button>
        <div className="text-[11px] text-neutral-500 truncate">
          {v.PRODUTTORE || "—"}
          {v.EURO_LISTINO ? <span className="text-neutral-400"> · {fmtEur(v.EURO_LISTINO)}</span> : null}
        </div>
      </div>

      {/* RD.1 — giacenza + copertura: 2 bt di un vino che gira è un buco fra
          nove giorni, 2 bt di uno fermo non è niente. Il numero da solo non
          basta a decidere. */}
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border tabular-nums ${
        (v.QTA_TOTALE || 0) === 0 ? "bg-red-50 text-red-700 border-red-200"
        : v.copertura_giorni != null ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-neutral-50 text-neutral-600 border-neutral-200"
      }`}
        title={(v.QTA_TOTALE || 0) === 0
          ? "Esaurito"
          : v.copertura_giorni != null
            ? `Al ritmo attuale finiscono in ~${v.copertura_giorni} giorni`
            : "Nessuna vendita nel periodo: giacenza ferma"}>
        {v.QTA_TOTALE || 0} bt
        {(v.QTA_TOTALE || 0) > 0 && v.copertura_giorni != null ? ` · ~${v.copertura_giorni}gg` : ""}
      </span>

      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${ritmoCls}`} title={rv.label || ""}>
        {rv.categoria === "top" || rv.categoria === "medio"
          ? `${Number(rv.bt_mese).toFixed(1)}/m`
          : rv.categoria === "poco" ? "poco" : "mai"}
      </span>

      {/* Segnale arrivato dal widget dashboard. Serve a distinguere "l'ho
          scelto io" da "ci è finito per la giacenza": sono due liste diverse
          mescolate nella stessa tabella. */}
      {segnale && !v.in_bozza && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${segnale.chip}`}
              title="Stato riordino impostato dalla dashboard">
          {segnale.icon} {segnale.label}
        </span>
      )}

      {/* Difesa contro il doppio ordine: finché la merce non arriva la
          giacenza resta 0, quindi il vino continua a comparire qui. Senza
          questo badge si riordina la stessa cosa a distanza di giorni. */}
      {v.gia_ordinato && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200 whitespace-nowrap"
              title={`Ordine #${v.gia_ordinato.ordine_id}${v.gia_ordinato.data_invio ? ` del ${fmtData(v.gia_ordinato.data_invio)}` : ""}`}>
          📤 già ordinate {v.gia_ordinato.qta}
        </span>
      )}
      {v.pending_legacy && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap"
              title="Ordine del vecchio sistema, ancora aperto">
          ⚠️ pending {v.pending_legacy}
        </span>
      )}

      {canEdit && (
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number" min="1" value={qta}
            onChange={e => setQta(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && qta) onOrdina(qta); }}
            placeholder="—"
            disabled={busy}
            className="w-16 px-2 py-1 rounded-lg border border-neutral-300 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400"
            style={{ fontSize: "16px", minHeight: "34px" }}
            title={v.qta_suggerita ? `Suggerito ${v.qta_suggerita} (storico vendite)` : "Nessun suggerimento: mai venduto"}
          />
          <Btn variant={v.in_bozza ? "secondary" : v.gia_ordinato ? "secondary" : "warning"} size="sm"
               disabled={busy || !qta}
               onClick={() => {
                 if (v.gia_ordinato && !v.in_bozza &&
                     !window.confirm(
                       `«${v.DESCRIZIONE}»: ne hai già ordinate ${v.gia_ordinato.qta} ` +
                       `con l'ordine #${v.gia_ordinato.ordine_id}, non ancora arrivate.\n\n` +
                       `Vuoi ordinarne altre ${qta}?`)) return;
                 onOrdina(qta);
               }}>
            {v.in_bozza ? `nel carrello: ${v.in_bozza}` : v.gia_ordinato ? "ordina ancora" : "+ ordina"}
          </Btn>
        </div>
      )}
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// CARRELLO (ordine in bozza)
// ════════════════════════════════════════════════════════════
function Carrello({ ordine, canEdit, busy, onTogli, onInviaWa, onSegnaInviato, fornitore }) {
  const [dettaglio, setDettaglio] = useState(null);
  const [erroreRighe, setErroreRighe] = useState("");
  const [aperto, setAperto] = useState(true);

  useEffect(() => {
    let vivo = true;
    // Azzero PRIMA di rifare la fetch: altrimenti restano visibili le righe
    // dell'ordine precedente finché la nuova risposta non arriva.
    setDettaglio(null); setErroreRighe("");
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/vini/ordini/${ordine.id}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (vivo) setDettaglio(d);
      } catch (e) {
        // Un catch muto lasciava "Carico le righe…" per sempre, senza dire
        // niente e senza modo di riprovare.
        if (vivo) setErroreRighe(String(e.message || e));
      }
    })();
    return () => { vivo = false; };
  }, [ordine.id, ordine.n_righe, ordine.qta_totale]);

  const righe = dettaglio?.righe || [];
  const haTelefono = !!(dettaglio?.rappresentante_telefono && normalizePhone(dettaglio.rappresentante_telefono));

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => setAperto(a => !a)} className="flex items-center gap-2 text-left">
          <span className="text-sm font-bold text-amber-900">📝 Carrello aperto</span>
          <span className="text-xs text-amber-700 tabular-nums">
            {ordine.n_righe} vini · {ordine.qta_totale} bottiglie
            {ordine.totale_eur ? ` · ${fmtEur(ordine.totale_eur)}` : ""}
          </span>
          <span className="text-amber-500 text-xs">{aperto ? "▲" : "▼"}</span>
        </button>
        {canEdit && (
          <div className="flex items-center gap-2">
            {haTelefono ? (
              <Btn variant="primary" size="sm" onClick={onInviaWa} disabled={busy}>💬 Invia su WhatsApp</Btn>
            ) : (
              <Btn variant="secondary" size="sm" onClick={onInviaWa} disabled={busy} title="Nessun telefono: potrai copiare il testo">
                📋 Prepara messaggio
              </Btn>
            )}
            <Btn variant="secondary" size="sm" onClick={() => onSegnaInviato("rappresentante")} disabled={busy}
                 title="Ordinato a voce col rappresentante: registra senza mandare niente">
              🤝 Ordinato a voce
            </Btn>
          </div>
        )}
      </div>

      {aperto && (
        <div className="divide-y divide-neutral-100">
          {erroreRighe && (
            <div className="px-5 py-3 text-sm text-red-700 bg-red-50">
              Non riesco a leggere le righe ({erroreRighe}).
            </div>
          )}
          {!erroreRighe && righe.length === 0 && (
            <div className="px-5 py-4 text-sm text-neutral-500">Carico le righe…</div>
          )}
          {righe.map(r => (
            <div key={r.id} className="px-5 py-2 flex items-center gap-3">
              <span className="text-sm font-bold text-amber-900 tabular-nums w-10 shrink-0">{r.qta_ordinata}×</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-neutral-800 truncate">{r.descrizione}</div>
                {r.annata && <div className="text-[11px] text-neutral-400">{r.annata}</div>}
              </div>
              <span className="text-xs text-neutral-500 tabular-nums shrink-0">
                {r.totale_riga ? fmtEur(r.totale_riga) : <span className="text-neutral-300">no prezzo</span>}
              </span>
              {canEdit && (
                <button onClick={() => onTogli(r)} disabled={busy}
                        className="shrink-0 w-7 h-7 rounded-full text-neutral-400 hover:text-red-600 hover:bg-red-50 transition"
                        title="Togli dal carrello">✕</button>
              )}
            </div>
          ))}
          {dettaglio?.righe_senza_prezzo > 0 && (
            <div className="px-5 py-2 text-[11px] text-amber-700 bg-amber-50/50">
              ⚠️ {dettaglio.righe_senza_prezzo} vini senza prezzo di listino: il totale è parziale.
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// ORDINE IN VIAGGIO
// ════════════════════════════════════════════════════════════
function OrdineInViaggio({ ordine, soglia, canEdit, busy, onRicevi, onAnnulla }) {
  const gg = giorniDa(ordine.data_invio);
  const fermo = gg != null && gg > (soglia || 30);
  const st = STATI[ordine.stato] || STATI.inviato;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm px-5 py-3 ${fermo ? "border-red-300" : "border-neutral-200"}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>
              {st.icon} {st.label}
            </span>
            <span className="text-xs text-neutral-500">
              #{ordine.id} · inviato il {fmtData(ordine.data_invio)}
              {gg != null && ` (${gg}gg fa)`}
            </span>
            {fermo && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                ⏰ fermo da {gg} giorni
              </span>
            )}
          </div>
          <div className="text-xs text-neutral-600 mt-1 tabular-nums">
            {ordine.n_righe} vini · {ordine.qta_ricevuta}/{ordine.qta_totale} bottiglie arrivate
            {ordine.totale_eur ? ` · ${fmtEur(ordine.totale_eur)}` : ""}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 shrink-0">
            <Btn variant="success" size="sm" onClick={onRicevi} disabled={busy}>📥 È arrivato</Btn>
            {/* Annullare NON tocca le giacenze: la merce non è mai arrivata.
                L'ordine resta a storico, non si cancella (è il motivo per cui
                esiste lo stato 'annullato' invece di una DELETE). */}
            <button
              type="button"
              onClick={onAnnulla}
              disabled={busy}
              title="Annulla l'ordine: resta nello storico, le giacenze non cambiano"
              className="px-2 py-1 rounded-lg text-xs font-medium text-neutral-500 border border-neutral-300 hover:text-red-700 hover:border-red-300 hover:bg-red-50 transition disabled:opacity-50"
            >
              ⛔ Annulla
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// RIGA STORICO
// ════════════════════════════════════════════════════════════
function RigaStorico({ ordine }) {
  const [aperto, setAperto] = useState(false);
  const [dett, setDett] = useState(null);
  const st = STATI[ordine.stato] || STATI.chiuso;

  const apri = async () => {
    setAperto(a => !a);
    if (!dett) {
      try {
        const r = await apiFetch(`${API_BASE}/vini/ordini/${ordine.id}`);
        if (r.ok) setDett(await r.json());
      } catch { /* resta chiuso */ }
    }
  };

  // Lead time: quanto ci ha messo davvero ad arrivare. È il dato che nessuno
  // aveva prima, perché l'ordine veniva cancellato all'arrivo.
  const lead = ordine.data_invio && ordine.data_chiusura
    ? Math.max(0, Math.round((new Date(ordine.data_chiusura) - new Date(ordine.data_invio)) / 86400000))
    : null;

  return (
    <div>
      <button onClick={apri} className="w-full px-5 py-2.5 flex items-center justify-between gap-3 hover:bg-neutral-50 transition text-left">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.icon}</span>
          <span className="text-sm text-neutral-700">
            {fmtData(ordine.data_invio || ordine.created_at)}
          </span>
          <span className="text-xs text-neutral-500 tabular-nums">
            {ordine.n_righe} vini · {ordine.qta_totale} bt
            {ordine.totale_eur ? ` · ${fmtEur(ordine.totale_eur)}` : ""}
          </span>
          {lead != null && (
            <span className="text-[10px] text-neutral-400">consegnato in {lead}gg</span>
          )}
        </div>
        <span className="text-neutral-400 text-xs shrink-0">{aperto ? "▲" : "▼"}</span>
      </button>
      {aperto && dett && (
        <div className="px-5 pb-3 space-y-1 bg-neutral-50/50">
          {dett.righe.map(r => (
            <div key={r.id} className="text-xs text-neutral-600 flex justify-between gap-2">
              <span className="truncate">{r.qta_ordinata}× {r.descrizione}{r.annata ? ` ${r.annata}` : ""}</span>
              <span className="tabular-nums shrink-0 text-neutral-400">
                {r.qta_ricevuta !== r.qta_ordinata ? `ricevute ${r.qta_ricevuta}` : ""}
                {r.totale_riga ? ` ${fmtEur(r.totale_riga)}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// MODALE WHATSAPP
// ════════════════════════════════════════════════════════════
const WA_TEMPLATE_DEFAULT = "Ciao {rappresentante}, ordine {locale} del {data}:\n\n{righe}\n\nGrazie!";
const WA_RIGA_DEFAULT = "• {qta} × {descrizione}";

function ModaleWhatsApp({ ordine, settings, onClose, onInviato }) {
  const [dett, setDett] = useState(null);
  const [testo, setTesto] = useState("");
  const [copiato, setCopiato] = useState(false);
  const [inviando, setInviando] = useState(false);
  const composto = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/vini/ordini/${ordine.id}`);
        if (r.ok) setDett(await r.json());
      } catch { /* niente */ }
    })();
  }, [ordine.id]);

  // Compongo il testo UNA volta sola: se ricomponessi a ogni render
  // cancellerei le modifiche a mano dell'utente.
  useEffect(() => {
    if (!dett || composto.current) return;
    composto.current = true;
    const s = settings || {};
    const tplRiga = s.ordine_wa_riga_template || WA_RIGA_DEFAULT;
    const righe = (dett.righe || [])
      .map(r => fillTemplate(tplRiga, {
        qta: r.qta_ordinata,
        descrizione: r.descrizione,
        annata: r.annata || "",
        prezzo: r.prezzo_unit ? fmtEur(r.prezzo_unit) : "",
      }))
      .join("\n");
    setTesto(fillTemplate(s.ordine_wa_template || WA_TEMPLATE_DEFAULT, {
      rappresentante: dett.rappresentante_nome || "",
      fornitore: dett.fornitore_nome || "",
      locale: s.ordine_wa_locale || "Osteria Tre Gobbi",
      data: new Date().toLocaleDateString("it-IT"),
      righe,
      totale: dett.totale_eur ? fmtEur(dett.totale_eur) : "",
    }));
  }, [dett, settings]);

  const telefono = dett?.rappresentante_telefono;
  const link = telefono ? buildWaLink(telefono, testo) : null;

  const copia = async () => {
    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch { /* alcuni browser lo negano senza https */ }
  };

  return (
    <Modal open onClose={onClose} title="💬 Invia l'ordine al rappresentante" tone="amber" size="lg"
      footer={
        <>
          <Btn variant="secondary" size="md" onClick={onClose} disabled={inviando}>Annulla</Btn>
          <Btn variant="secondary" size="md" onClick={copia}>{copiato ? "✓ Copiato" : "📋 Copia testo"}</Btn>
          {/* `inviando` evita il secondo clic: la seconda POST tornerebbe 400
              "L'ordine è già in stato inviato" e mostrerebbe un errore per
              un'operazione in realtà riuscita. */}
          {link ? (
            <Btn variant="primary" size="md" loading={inviando} disabled={inviando}
                 onClick={() => {
                   setInviando(true);
                   window.open(link, "_blank", "noopener");
                   Promise.resolve(onInviato("whatsapp")).finally(() => setInviando(false));
                 }}>
              Apri WhatsApp e segna inviato
            </Btn>
          ) : (
            <Btn variant="primary" size="md" loading={inviando} disabled={inviando}
                 onClick={() => {
                   setInviando(true);
                   Promise.resolve(onInviato("manuale")).finally(() => setInviando(false));
                 }}>
              Segna come inviato
            </Btn>
          )}
        </>
      }
    >
      {!dett && <div className="text-sm text-neutral-500">Preparo il messaggio…</div>}
      {dett && (
        <div className="space-y-3">
          <div className="text-xs text-neutral-600">
            A: <strong>{dett.rappresentante_nome || dett.fornitore_nome}</strong>
            {telefono ? <span className="text-neutral-400"> · {telefono}</span> : (
              <span className="text-amber-700"> · nessun telefono in anagrafica: puoi copiare il testo</span>
            )}
          </div>
          <Textarea rows={12} value={testo} onChange={setTesto} />
          <p className="text-[11px] text-neutral-500">
            Puoi modificare il messaggio prima di mandarlo. Il modello si cambia in Impostazioni Vini.
            {" "}Appena lo mandi l'ordine passa a <strong>inviato</strong>: se poi non parte, si corregge.
          </p>
        </div>
      )}
    </Modal>
  );
}


// ════════════════════════════════════════════════════════════
// MODALE RICEZIONE
// ════════════════════════════════════════════════════════════
function ModaleRicezione({ ordineId, onClose, onFatto, onErrore }) {
  const [dett, setDett] = useState(null);
  const [qta, setQta] = useState({});      // riga_id -> quantità arrivata ORA
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/vini/ordini/${ordineId}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        setDett(d);
        // Default: è arrivato tutto quello che manca. È il caso normale;
        // chi riceve solo una parte corregge i numeri.
        setQta(Object.fromEntries(d.righe.map(x => [x.id, x.mancanti])));
      } catch (e) {
        onErrore(`Non riesco a caricare l'ordine: ${e.message}`);
        onClose();
      }
    })();
  }, [ordineId, onClose, onErrore]);

  const totale = Object.values(qta).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);

  const conferma = async () => {
    const righe = Object.entries(qta)
      .map(([riga_id, q]) => ({ riga_id: Number(riga_id), qta: parseInt(q, 10) || 0 }))
      .filter(r => r.qta > 0);
    if (!righe.length) { onErrore("Non hai indicato nessuna bottiglia arrivata"); return; }
    setSalvando(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/ordini/${ordineId}/ricevi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ righe }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(e.detail || `HTTP ${r.status}`);
      }
      onFatto();
    } catch (e) {
      onErrore(`Errore: ${e.message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal open onClose={salvando ? () => {} : onClose} title="📥 Registra l'arrivo" tone="amber" size="lg"
      footer={
        <>
          {/* Annulla disabilitato mentre salva: chiudere con la POST in volo
              lascia credere che non sia successo niente, si riclicca "È
              arrivato" e la merce viene caricata due volte. */}
          <Btn variant="secondary" size="md" onClick={onClose} disabled={salvando}>Annulla</Btn>
          <Btn variant="success" size="md" onClick={conferma} loading={salvando} disabled={salvando || totale === 0}>
            {salvando ? "Registro…" : `Carica ${totale} bottiglie`}
          </Btn>
        </>
      }
    >
      {!dett && <div className="text-sm text-neutral-500">Carico…</div>}
      {dett && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-600">
            Correggi le quantità se è arrivato solo in parte: il resto resta in attesa e l'ordine
            passa a <strong>arrivato in parte</strong>. Le bottiglie vengono caricate in cantina
            e registrate come movimento di carico.
          </p>
          {dett.righe.map(r => (
            <div key={r.id} className="flex items-center gap-3 py-1.5 border-b border-neutral-100 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-neutral-800 truncate">{r.descrizione}{r.annata ? ` · ${r.annata}` : ""}</div>
                <div className="text-[11px] text-neutral-500 tabular-nums">
                  ordinate {r.qta_ordinata}
                  {r.qta_ricevuta > 0 && ` · già arrivate ${r.qta_ricevuta}`}
                  {r.mancanti > 0 ? ` · mancano ${r.mancanti}` : " · complete"}
                </div>
              </div>
              <input
                type="number" min="0" max={999}
                value={qta[r.id] ?? 0}
                onChange={e => setQta(p => ({ ...p, [r.id]: e.target.value }))}
                className="w-20 px-2 py-1 rounded-lg border border-neutral-300 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400"
                style={{ fontSize: "16px", minHeight: "36px" }}
              />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
