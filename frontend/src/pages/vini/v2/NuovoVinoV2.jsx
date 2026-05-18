// Modulo: vini
// src/pages/vini/v2/NuovoVinoV2.jsx
//
// M2.7 (2026-05-16) — Wizard "Nuovo Vino" 3-step (preview-only).
//
// Sostituisce lo stub placeholder con il flusso strutturato:
//   Step 1 — Produttore   (autocomplete + "+ Nuovo")
//   Step 2 — Vino madre   (lista madri del produttore + "+ Nuovo madre")
//   Step 3 — Annata       (tutti i campi specifici dell'annata)
//
// PREVIEW-ONLY (deciso con Marco 2026-05-16): al submit non viene scritto nulla
// sul DB. Mostra una modale finale con riassunto strutturato di cosa sarebbe
// stato creato. Serve a iterare l'UX del flusso prima del cutover (Fase 10),
// quando questo diventerà il vero entry point per la creazione di un vino in
// Cantina 2 (sostituirà MagazzinoViniNuovo classico).
//
// Endpoint usati (tutti read durante preview):
//   GET /vini/anagrafiche/produttori/?search=
//   GET /vini/anagrafiche/madre/?produttore_id=
//   GET /vini/anagrafiche/denominazioni/?search=&nazione=
//   GET /vini/anagrafiche/vitigni/?search=
//   GET /vini/anagrafiche/fornitori/
//   GET /settings/vini/valori-tabellati
//   GET /vini/cantina-tools/locazioni-config

import React, { useEffect, useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../../../config/api";
// Versioni "long" (solo label parlanti, senza codici corti tipo "1 — ").
// Coerente con la riflessione UX di Marco (2026-05-16): nei form di input del
// ramo v2 i codici Excel non aggiungono informazione — restano nei badge tabella.
import {
  STATO_VENDITA_OPTIONS_LONG as STATO_VENDITA_OPTIONS,
  STATO_RIORDINO_OPTIONS_LONG as STATO_RIORDINO_OPTIONS,
  STATO_CONSERVAZIONE_OPTIONS_LONG as STATO_CONSERVAZIONE_OPTIONS,
} from "../../../config/viniConstants";

const STEPS = [
  { key: 1, label: "Produttore",  icon: "🏛️" },
  { key: 2, label: "Vino madre",  icon: "🍷" },
  { key: 3, label: "Annata",      icon: "📅" },
];

// =====================================================================
// COMPONENTE PRINCIPALE
// =====================================================================
export default function NuovoVinoV2() {
  const [step, setStep] = useState(1);
  const [produttore, setProduttore] = useState(null);
  const [madre, setMadre] = useState(null);
  const [annata, setAnnata] = useState(() => emptyAnnata());
  const [showPreview, setShowPreview] = useState(false);

  const reset = () => {
    setProduttore(null);
    setMadre(null);
    setAnnata(emptyAnnata());
    setStep(1);
    setShowPreview(false);
  };

  const canAdvance = useMemo(() => {
    if (step === 1) return !!produttore;
    if (step === 2) return !!madre;
    if (step === 3) return !!(annata.ANNATA || "").toString().trim();
    return false;
  }, [step, produttore, madre, annata]);

  const goNext = () => {
    if (step < 3) setStep(step + 1);
    else setShowPreview(true);
  };
  const goBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSelectProduttore = (p) => {
    setProduttore(p);
    // Se cambio produttore esistente con uno diverso, resetto il madre selezionato
    // (era del produttore precedente).
    if (madre && !madre._new && p?.id && madre.produttore_id && madre.produttore_id !== p.id) {
      setMadre(null);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto p-3 md:p-4">
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden flex flex-col"
           style={{ height: "calc(100vh - 130px)" }}>

        {/* Header sticky con Stepper + bottoni avanzamento (duplicati del footer
            così sono sempre a portata di mano anche con finestra grande). */}
        <div className="border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white flex-shrink-0 flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <Stepper currentStep={step} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={goBack} disabled={step === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed">
              ← Indietro
            </button>
            <button onClick={goNext} disabled={!canAdvance}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-40 disabled:cursor-not-allowed">
              {step === 3 ? "✓ Conferma" : "Avanti →"}
            </button>
          </div>
        </div>
        <Crumbs produttore={produttore} madre={madre} step={step} />

        <div className="flex-1 overflow-auto bg-neutral-50">
          {step === 1 && <Step1Produttore produttore={produttore} onSelect={handleSelectProduttore} />}
          {step === 2 && <Step2Madre produttore={produttore} madre={madre} onSelect={setMadre} />}
          {step === 3 && <Step3Annata annata={annata} setAnnata={setAnnata} />}
        </div>

        <div className="px-4 py-3 border-t border-neutral-200 bg-white flex items-center gap-3 flex-shrink-0">
          <button onClick={reset}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition">
            ↺ Ricomincia
          </button>
          <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md inline-flex items-center gap-1 whitespace-nowrap">
            <span>🧪</span><strong>PREVIEW</strong> · nessuna scrittura su DB
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={goBack} disabled={step === 1}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed">
              ← Indietro
            </button>
            <button onClick={goNext} disabled={!canAdvance}
              className="px-5 py-1.5 rounded-lg text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-40 disabled:cursor-not-allowed">
              {step === 3 ? "✓ Conferma (preview)" : "Avanti →"}
            </button>
          </div>
        </div>
      </div>

      {showPreview && (
        <PreviewModal
          produttore={produttore}
          madre={madre}
          annata={annata}
          onClose={() => setShowPreview(false)}
          onReset={reset}
        />
      )}
    </div>
  );
}


// =====================================================================
// STEPPER VISIVO
// =====================================================================
function Stepper({ currentStep }) {
  // NB: il wrapper esterno (padding, sfondo, border) è ora nell'header del
  // wizard (NuovoVinoV2) per allineare il Stepper ai bottoni Indietro/Avanti.
  return (
    <div>
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const done = s.key < currentStep;
          const active = s.key === currentStep;
          return (
            <React.Fragment key={s.key}>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition ${
                active ? "bg-amber-700 text-white shadow-sm" :
                done ? "bg-emerald-100 text-emerald-800" :
                "bg-neutral-100 text-neutral-500"
              }`}>
                <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                  active ? "bg-white text-amber-900" :
                  done ? "bg-emerald-700 text-white" :
                  "bg-neutral-300 text-neutral-700"
                }`}>
                  {done ? "✓" : s.key}
                </span>
                <span className="text-xs font-semibold">{s.icon} {s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 ${s.key < currentStep ? "bg-emerald-300" : "bg-neutral-200"}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}


// =====================================================================
// CRUMBS — riassunto delle selezioni precedenti
// =====================================================================
function Crumbs({ produttore, madre, step }) {
  if (step === 1) return null;
  return (
    <div className="px-4 py-2 border-b border-neutral-200 bg-neutral-50 flex items-center gap-3 text-xs flex-shrink-0 overflow-x-auto">
      {produttore && (
        <span className="inline-flex items-center gap-1.5 bg-white border border-amber-300 px-2 py-1 rounded-md whitespace-nowrap">
          <span className="text-amber-700 font-semibold">🏛️</span>
          <strong className="text-neutral-900">{produttore.nome}</strong>
          {produttore._new && <span className="text-[10px] bg-amber-200 text-amber-900 px-1 rounded">NUOVO</span>}
          {!produttore._new && produttore.id && <span className="text-neutral-400 text-[10px]">#{produttore.id}</span>}
        </span>
      )}
      {madre && step >= 3 && (
        <span className="inline-flex items-center gap-1.5 bg-white border border-rose-300 px-2 py-1 rounded-md whitespace-nowrap">
          <span className="text-rose-700 font-semibold">🍷</span>
          <strong className="text-neutral-900">{madre.descrizione}</strong>
          {madre.tipologia && <span className="text-[10px] text-neutral-500">· {madre.tipologia}</span>}
          {madre._new && <span className="text-[10px] bg-rose-200 text-rose-900 px-1 rounded">NUOVO</span>}
          {!madre._new && madre.id && <span className="text-neutral-400 text-[10px]">#{madre.id}</span>}
        </span>
      )}
    </div>
  );
}


// =====================================================================
// STEP 1 — PRODUTTORE
// =====================================================================
function Step1Produttore({ produttore, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newData, setNewData] = useState({ nome: "", nazione: "Italia", regione: "", provincia: "", citta: "" });

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await apiFetch(`${API_BASE}/vini/anagrafiche/produttori/?search=${encodeURIComponent(query)}`);
        if (r.ok && !cancelled) setResults((await r.json()).slice(0, 30));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const confirmNew = () => {
    if (!newData.nome.trim() || !newData.nazione.trim()) {
      alert("Nome e Nazione sono obbligatori"); return;
    }
    onSelect({ _new: true, ...newData });
    setShowNewForm(false);
  };

  return (
    <div className="p-4 md:p-6">
      <h2 className="text-lg font-bold text-neutral-900 mb-1">Step 1 — Scegli o crea il produttore</h2>
      <p className="text-xs text-neutral-600 mb-4">Cerca un produttore esistente. Se non lo trovi, creane uno nuovo.</p>

      <div className="space-y-3">
        <div className="relative">
          <input
            type="text"
            placeholder="Cerca produttore per nome (min 2 caratteri)…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            className="w-full px-4 py-2 rounded-lg border-2 border-amber-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
          />
          {loading && <span className="absolute right-3 top-2.5 text-xs text-neutral-400">cerca…</span>}
        </div>

        {results.length > 0 && (
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-3 py-1.5 bg-neutral-50 border-b border-neutral-200 text-[10px] uppercase tracking-wide text-neutral-500">
              {results.length} risultati
            </div>
            <div className="max-h-[40vh] overflow-y-auto">
              {results.map(p => {
                const selected = produttore && !produttore._new && produttore.id === p.id;
                return (
                  <button key={p.id} onClick={() => onSelect(p)}
                    className={`w-full text-left px-3 py-2 border-b border-neutral-100 transition ${
                      selected ? "bg-amber-100 border-l-4 border-l-amber-600" : "hover:bg-amber-50"
                    }`}>
                    <div className="font-semibold text-neutral-900">{p.nome}</div>
                    <div className="text-[11px] text-neutral-600">
                      {[p.citta, p.provincia, p.regione, p.nazione].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {query.trim().length >= 2 && !loading && results.length === 0 && (
          <div className="text-xs text-neutral-500 italic px-2">Nessun produttore trovato per "{query}".</div>
        )}

        {produttore && (
          <div className="border-2 border-emerald-300 rounded-xl bg-emerald-50 p-3">
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">
              ✓ Produttore selezionato {produttore._new && <span className="bg-amber-200 text-amber-900 px-1 rounded ml-1">DA CREARE</span>}
            </div>
            <div className="text-base font-bold text-neutral-900">{produttore.nome}</div>
            <div className="text-xs text-neutral-700">
              {[produttore.citta, produttore.provincia, produttore.regione, produttore.nazione].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
        )}

        {!showNewForm && (
          <button onClick={() => setShowNewForm(true)}
            className="w-full px-4 py-2 rounded-lg border-2 border-dashed border-amber-300 text-amber-800 text-sm font-semibold hover:bg-amber-50 transition">
            + Nuovo produttore
          </button>
        )}

        {showNewForm && (
          <div className="border-2 border-amber-300 rounded-xl bg-amber-50 p-4 space-y-2">
            <div className="text-xs font-semibold text-amber-900 mb-2">🆕 Nuovo produttore</div>
            <div className="grid grid-cols-2 gap-2">
              <FieldLabel label="Nome *">
                <input type="text" value={newData.nome}
                  onChange={e => setNewData(d => ({ ...d, nome: e.target.value }))}
                  placeholder="es. Marchesi di Barolo"
                  className="w-full px-2 py-1.5 rounded border border-amber-300 text-sm bg-white" />
              </FieldLabel>
              <FieldLabel label="Nazione *">
                <input type="text" value={newData.nazione}
                  onChange={e => setNewData(d => ({ ...d, nazione: e.target.value }))}
                  className="w-full px-2 py-1.5 rounded border border-amber-300 text-sm bg-white" />
              </FieldLabel>
              <FieldLabel label="Regione">
                <input type="text" value={newData.regione}
                  onChange={e => setNewData(d => ({ ...d, regione: e.target.value }))}
                  placeholder="es. Piemonte"
                  className="w-full px-2 py-1.5 rounded border border-amber-300 text-sm bg-white" />
              </FieldLabel>
              <FieldLabel label="Provincia">
                <input type="text" value={newData.provincia}
                  onChange={e => setNewData(d => ({ ...d, provincia: e.target.value }))}
                  placeholder="es. CN"
                  className="w-full px-2 py-1.5 rounded border border-amber-300 text-sm bg-white" />
              </FieldLabel>
              <FieldLabel label="Città">
                <input type="text" value={newData.citta}
                  onChange={e => setNewData(d => ({ ...d, citta: e.target.value }))}
                  placeholder="es. Barolo"
                  className="w-full px-2 py-1.5 rounded border border-amber-300 text-sm bg-white" />
              </FieldLabel>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowNewForm(false)}
                className="px-3 py-1 text-xs rounded border border-neutral-300 hover:bg-neutral-50">
                Annulla
              </button>
              <button onClick={confirmNew}
                className="px-3 py-1 text-xs rounded bg-amber-700 text-white font-semibold hover:bg-amber-800">
                Usa questo produttore
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// =====================================================================
// STEP 2 — VINO MADRE
// =====================================================================
function Step2Madre({ produttore, madre, onSelect }) {
  const [madri, setMadri] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const [newM, setNewM] = useState({
    descrizione: "",
    tipologia: "",
    nazione: produttore?.nazione || "Italia",
    regione: produttore?.regione || "",
    grado_alcolico_tipico: "",
    denominazione_id: null,
    denominazione_label: "",
    fornitore_id: null,
    fornitore_label: "",
    vitigni: [],
    abbinamenti: "",
    note_madre: "",
  });

  const [tipologie, setTipologie] = useState([]);
  const [fornitori, setFornitori] = useState([]);

  const [denoQ, setDenoQ] = useState("");
  const [denoResults, setDenoResults] = useState([]);
  const [vitignoQ, setVitignoQ] = useState("");
  const [vitignoResults, setVitignoResults] = useState([]);

  useEffect(() => {
    if (!produttore || produttore._new) {
      setMadri([]); return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const r = await apiFetch(`${API_BASE}/vini/anagrafiche/madre/?produttore_id=${produttore.id}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (!cancelled) setMadri(await r.json());
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [produttore]);

  useEffect(() => {
    (async () => {
      try {
        const [rTab, rForn] = await Promise.all([
          apiFetch(`${API_BASE}/settings/vini/valori-tabellati`),
          apiFetch(`${API_BASE}/vini/anagrafiche/fornitori/`),
        ]);
        if (rTab.ok) {
          const tab = await rTab.json();
          setTipologie(tab.tipologie || []);
        }
        if (rForn.ok) setFornitori(await rForn.json());
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (denoQ.trim().length < 2) { setDenoResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set("search", denoQ);
        if (newM.nazione) params.set("nazione", newM.nazione);
        const r = await apiFetch(`${API_BASE}/vini/anagrafiche/denominazioni/?${params}`);
        if (r.ok && !cancelled) setDenoResults((await r.json()).slice(0, 10));
      } catch {}
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [denoQ, newM.nazione]);

  useEffect(() => {
    if (vitignoQ.trim().length < 2) { setVitignoResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch(`${API_BASE}/vini/anagrafiche/vitigni/?search=${encodeURIComponent(vitignoQ)}`);
        if (r.ok && !cancelled) setVitignoResults((await r.json()).slice(0, 10));
      } catch {}
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [vitignoQ]);

  const addVitigno = (v) => {
    if (newM.vitigni.length >= 5) { alert("Massimo 5 vitigni per vino"); return; }
    if (newM.vitigni.find(x => x.vitigno_id === v.id)) { setVitignoQ(""); return; }
    setNewM(prev => ({ ...prev, vitigni: [...prev.vitigni, { vitigno_id: v.id, vitigno_label: v.nome, pct: "" }] }));
    setVitignoQ("");
    setVitignoResults([]);
  };

  const updateVitignoPct = (vid, pct) => {
    setNewM(prev => ({
      ...prev,
      vitigni: prev.vitigni.map(v => v.vitigno_id === vid ? { ...v, pct } : v),
    }));
  };

  const removeVitigno = (vid) => {
    setNewM(prev => ({ ...prev, vitigni: prev.vitigni.filter(v => v.vitigno_id !== vid) }));
  };

  const confirmNewMadre = () => {
    if (!newM.descrizione.trim()) { alert("Descrizione obbligatoria"); return; }
    if (!newM.tipologia) { alert("Tipologia obbligatoria"); return; }
    onSelect({ _new: true, ...newM });
    setShowNewForm(false);
  };

  return (
    <div className="p-4 md:p-6">
      <h2 className="text-lg font-bold text-neutral-900 mb-1">Step 2 — Scegli o crea il vino madre</h2>
      <p className="text-xs text-neutral-600 mb-4">
        {produttore?._new
          ? "Il produttore è nuovo: crea direttamente il primo vino madre."
          : `Seleziona un'etichetta esistente di ${produttore?.nome}, oppure creane una nuova.`}
      </p>

      {!produttore?._new && (
        <>
          {loading && <div className="text-sm text-neutral-500 py-4">Carico…</div>}
          {error && <div className="text-sm text-red-700 py-2">{error}</div>}
          {!loading && madri.length === 0 && (
            <div className="text-sm text-neutral-500 italic py-3 px-2 border border-dashed border-neutral-300 rounded-lg">
              Nessun vino madre per {produttore?.nome}. Crea il primo qui sotto.
            </div>
          )}
          {!loading && madri.length > 0 && (
            <div className="border border-neutral-200 rounded-xl overflow-hidden mb-3">
              <div className="px-3 py-1.5 bg-neutral-50 border-b border-neutral-200 text-[10px] uppercase tracking-wide text-neutral-500">
                {madri.length} vini madre esistenti
              </div>
              <div className="max-h-[40vh] overflow-y-auto">
                {madri.map(m => {
                  const selected = madre && !madre._new && madre.id === m.id;
                  return (
                    <button key={m.id} onClick={() => onSelect(m)}
                      className={`w-full text-left px-3 py-2 border-b border-neutral-100 transition ${
                        selected ? "bg-rose-100 border-l-4 border-l-rose-600" : "hover:bg-rose-50"
                      }`}>
                      <div className="font-semibold text-neutral-900">{m.descrizione}</div>
                      <div className="text-[11px] text-neutral-600">
                        {[m.tipologia, m.regione].filter(Boolean).join(" · ") || "—"}
                        {m.denominazione_id && <span className="text-neutral-400 ml-1">· denom. #{m.denominazione_id}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {madre && (
        <div className="border-2 border-emerald-300 rounded-xl bg-emerald-50 p-3 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">
            ✓ Vino madre selezionato {madre._new && <span className="bg-rose-200 text-rose-900 px-1 rounded ml-1">DA CREARE</span>}
          </div>
          <div className="text-base font-bold text-neutral-900">{madre.descrizione}</div>
          <div className="text-xs text-neutral-700">
            {[madre.tipologia, madre.regione].filter(Boolean).join(" · ")}
            {madre.denominazione_label && ` · ${madre.denominazione_label}`}
          </div>
        </div>
      )}

      {!showNewForm && (
        <button onClick={() => setShowNewForm(true)}
          className="w-full px-4 py-2 rounded-lg border-2 border-dashed border-rose-300 text-rose-800 text-sm font-semibold hover:bg-rose-50 transition">
          + Nuovo vino madre
        </button>
      )}

      {showNewForm && (
        <div className="border-2 border-rose-300 rounded-xl bg-rose-50 p-4 space-y-3">
          <div className="text-xs font-semibold text-rose-900">🆕 Nuovo vino madre</div>

          <div className="grid grid-cols-2 gap-2">
            <FieldLabel label="Descrizione * (nome del vino)">
              <input type="text" value={newM.descrizione}
                onChange={e => setNewM(d => ({ ...d, descrizione: e.target.value }))}
                placeholder="es. Barolo Castiglione"
                className="w-full px-2 py-1.5 rounded border border-rose-300 text-sm bg-white" />
            </FieldLabel>
            <FieldLabel label="Tipologia *">
              <select value={newM.tipologia}
                onChange={e => setNewM(d => ({ ...d, tipologia: e.target.value }))}
                className="w-full px-2 py-1.5 rounded border border-rose-300 text-sm bg-white">
                <option value="">— seleziona —</option>
                {tipologie.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FieldLabel>
            <FieldLabel label="Nazione">
              <input type="text" value={newM.nazione}
                onChange={e => setNewM(d => ({ ...d, nazione: e.target.value }))}
                className="w-full px-2 py-1.5 rounded border border-rose-300 text-sm bg-white" />
            </FieldLabel>
            <FieldLabel label="Regione">
              <input type="text" value={newM.regione}
                onChange={e => setNewM(d => ({ ...d, regione: e.target.value }))}
                className="w-full px-2 py-1.5 rounded border border-rose-300 text-sm bg-white" />
            </FieldLabel>
            <FieldLabel label="Grado alcolico tipico (%)">
              <input type="number" step="0.1" value={newM.grado_alcolico_tipico}
                onChange={e => setNewM(d => ({ ...d, grado_alcolico_tipico: e.target.value }))}
                placeholder="13.5"
                className="w-full px-2 py-1.5 rounded border border-rose-300 text-sm bg-white" />
            </FieldLabel>
            <FieldLabel label="Distributore">
              <select value={newM.fornitore_id || ""}
                onChange={e => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  const f = fornitori.find(x => x.id === id);
                  setNewM(d => ({ ...d, fornitore_id: id, fornitore_label: f?.nome || "" }));
                }}
                className="w-full px-2 py-1.5 rounded border border-rose-300 text-sm bg-white">
                <option value="">— nessuno —</option>
                {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </FieldLabel>
          </div>

          <div>
            <FieldLabel label="Denominazione">
              {newM.denominazione_id ? (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-violet-300 rounded">
                  <span className="text-sm flex-1">{newM.denominazione_label}</span>
                  <button type="button" onClick={() => setNewM(d => ({ ...d, denominazione_id: null, denominazione_label: "" }))}
                    className="text-xs text-red-600 hover:text-red-800">✕</button>
                </div>
              ) : (
                <div>
                  <input type="text" placeholder="Cerca denominazione (min 2 caratteri)…"
                    value={denoQ} onChange={e => setDenoQ(e.target.value)}
                    className="w-full px-2 py-1.5 rounded border border-rose-300 text-sm bg-white" />
                  {denoResults.length > 0 && (
                    <div className="mt-1 border border-neutral-200 rounded bg-white shadow-sm max-h-40 overflow-y-auto">
                      {denoResults.map(d => (
                        <div key={d.id}
                          onClick={() => {
                            setNewM(prev => ({ ...prev, denominazione_id: d.id, denominazione_label: `${d.nome} ${d.tipo}` }));
                            setDenoQ("");
                          }}
                          className="px-2 py-1 text-xs cursor-pointer hover:bg-violet-50">
                          <strong>{d.nome} {d.tipo}</strong> · {d.nazione}{d.regione ? ` · ${d.regione}` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </FieldLabel>
          </div>

          <div>
            <FieldLabel label="Vitigni (max 5 con % opzionale)">
              <div>
                {newM.vitigni.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {newM.vitigni.map(v => (
                      <div key={v.vitigno_id} className="flex items-center gap-2 px-2 py-1 bg-white border border-emerald-300 rounded">
                        <span className="text-sm flex-1">🍇 {v.vitigno_label}</span>
                        <input type="number" min="0" max="100" placeholder="%" value={v.pct}
                          onChange={e => updateVitignoPct(v.vitigno_id, e.target.value)}
                          className="w-16 px-1.5 py-0.5 rounded border border-neutral-300 text-xs" />
                        <button type="button" onClick={() => removeVitigno(v.vitigno_id)}
                          className="text-xs text-red-600 hover:text-red-800">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {newM.vitigni.length < 5 && (
                  <div>
                    <input type="text" placeholder="Cerca vitigno (min 2 caratteri)…"
                      value={vitignoQ} onChange={e => setVitignoQ(e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-rose-300 text-sm bg-white" />
                    {vitignoResults.length > 0 && (
                      <div className="mt-1 border border-neutral-200 rounded bg-white shadow-sm max-h-40 overflow-y-auto">
                        {vitignoResults.map(v => (
                          <div key={v.id}
                            onClick={() => addVitigno(v)}
                            className="px-2 py-1 text-xs cursor-pointer hover:bg-emerald-50">
                            🍇 {v.nome}{v.note && <span className="text-neutral-500 ml-1">· {v.note.slice(0, 50)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </FieldLabel>
          </div>

          <FieldLabel label="Abbinamenti consigliati">
            <textarea rows={2} value={newM.abbinamenti}
              onChange={e => setNewM(d => ({ ...d, abbinamenti: e.target.value }))}
              placeholder="es. arrosti, formaggi stagionati, brasati"
              className="w-full px-2 py-1.5 rounded border border-rose-300 text-sm bg-white" />
          </FieldLabel>

          <FieldLabel label="Note vino madre">
            <textarea rows={2} value={newM.note_madre}
              onChange={e => setNewM(d => ({ ...d, note_madre: e.target.value }))}
              className="w-full px-2 py-1.5 rounded border border-rose-300 text-sm bg-white" />
          </FieldLabel>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowNewForm(false)}
              className="px-3 py-1 text-xs rounded border border-neutral-300 hover:bg-neutral-50">
              Annulla
            </button>
            <button onClick={confirmNewMadre}
              className="px-3 py-1 text-xs rounded bg-rose-700 text-white font-semibold hover:bg-rose-800">
              Usa questo vino madre
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// =====================================================================
// STEP 3 — ANNATA (form completo)
// =====================================================================
function Step3Annata({ annata, setAnnata }) {
  const [formati, setFormati] = useState([]);
  const [opzioniFrigo, setOpzioniFrigo] = useState([]);
  const [opzioniLoc1, setOpzioniLoc1] = useState([]);
  const [opzioniLoc2, setOpzioniLoc2] = useState([]);
  const [opzioniLoc3, setOpzioniLoc3] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const rTab = await apiFetch(`${API_BASE}/settings/vini/valori-tabellati`);
        if (rTab.ok) setFormati((await rTab.json()).formati || []);
        const rLoc = await apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-config`);
        if (rLoc.ok) {
          const data = await rLoc.json();
          setOpzioniFrigo(data.opzioni_frigo || []);
          setOpzioniLoc1(data.opzioni_locazione_1 || []);
          setOpzioniLoc2(data.opzioni_locazione_2 || []);
          setOpzioniLoc3(data.opzioni_locazione_3 || []);
        }
      } catch {}
    })();
  }, []);

  const upd = (k, v) => setAnnata(prev => ({ ...prev, [k]: v }));

  return (
    <div className="p-4 md:p-6">
      <h2 className="text-lg font-bold text-neutral-900 mb-1">Step 3 — Dati dell'annata</h2>
      <p className="text-xs text-neutral-600 mb-4">
        Compila i campi specifici dell'annata. I campi anagrafici (produttore, descrizione,
        tipologia, denominazione, vitigni) sono ereditati dai passi precedenti.
      </p>

      <Section title="Identificazione annata">
        <Grid cols={3}>
          <FieldLabel label="Annata *">
            <input type="text" value={annata.ANNATA} onChange={e => upd("ANNATA", e.target.value)}
              placeholder="2021 / NV" className={fieldCls} autoFocus />
          </FieldLabel>
          <FieldLabel label="Formato">
            <select value={annata.FORMATO} onChange={e => upd("FORMATO", e.target.value)} className={fieldCls}>
              {formati.length === 0 && <option value="BT">BT</option>}
              {formati.map((f, i) => {
                // L'API può ritornare stringhe o oggetti {formato, descrizione, litri}.
                // Label parlante senza codice (M2 v2 design choice): "Bottiglia (0.75L)"
                // invece di "BT — Bottiglia (0.75L)". Il codice corto resta sul value.
                const fmt = typeof f === "string" ? f : f.formato;
                const desc = typeof f === "string" ? "" : f.descrizione;
                const litri = typeof f === "string" ? "" : f.litri;
                const label = desc
                  ? `${desc}${litri ? ` (${litri}L)` : ""}`
                  : fmt;
                return <option key={fmt || i} value={fmt}>{label}</option>;
              })}
            </select>
          </FieldLabel>
          <FieldLabel label="Grado alcolico (%)">
            <input type="number" step="0.1" value={annata.GRADO_ALCOLICO}
              onChange={e => upd("GRADO_ALCOLICO", e.target.value)} placeholder="13.5" className={fieldCls} />
          </FieldLabel>
        </Grid>
      </Section>

      <Section title="Prezzi">
        <Grid cols={3}>
          <FieldLabel label="Listino acquisto (€)">
            <input type="number" step="0.01" value={annata.EURO_LISTINO}
              onChange={e => upd("EURO_LISTINO", e.target.value)} className={fieldCls} />
          </FieldLabel>
          <FieldLabel label="Sconto (%)">
            <input type="number" step="0.1" value={annata.SCONTO}
              onChange={e => upd("SCONTO", e.target.value)} className={fieldCls} />
          </FieldLabel>
          <FieldLabel label="Prezzo carta (€)">
            <input type="number" step="0.01" value={annata.PREZZO_CARTA}
              onChange={e => upd("PREZZO_CARTA", e.target.value)} className={fieldCls} />
          </FieldLabel>
          <FieldLabel label="Prezzo calice (€)">
            <input type="number" step="0.01" value={annata.PREZZO_CALICE}
              onChange={e => upd("PREZZO_CALICE", e.target.value)} className={fieldCls} />
          </FieldLabel>
          <FieldLabel label="Forza prezzo carta">
            <BoolToggle value={annata.FORZA_PREZZO} onChange={v => upd("FORZA_PREZZO", v)} />
          </FieldLabel>
          <FieldLabel label="Note prezzo">
            <input type="text" value={annata.NOTE_PREZZO} onChange={e => upd("NOTE_PREZZO", e.target.value)} className={fieldCls} />
          </FieldLabel>
        </Grid>
      </Section>

      <Section title="Flag presentazione">
        <Grid cols={4}>
          <FieldLabel label="In carta">
            <BoolToggle value={annata.CARTA} onChange={v => upd("CARTA", v)} />
          </FieldLabel>
          <FieldLabel label="Vendita al calice">
            <BoolToggle value={annata.VENDITA_CALICE} onChange={v => upd("VENDITA_CALICE", v)} />
          </FieldLabel>
          <FieldLabel label="Biologico">
            <BoolToggle value={annata.BIOLOGICO} onChange={v => upd("BIOLOGICO", v)} />
          </FieldLabel>
          <FieldLabel label="Sync iPratico">
            <BoolToggle value={annata.IPRATICO} onChange={v => upd("IPRATICO", v)} />
          </FieldLabel>
        </Grid>
      </Section>

      <Section title="Stati gestione">
        <Grid cols={3}>
          <FieldLabel label="Stato vendita">
            <select value={annata.STATO_VENDITA ?? ""} onChange={e => upd("STATO_VENDITA", e.target.value)} className={fieldCls}>
              <option value="">— seleziona —</option>
              {STATO_VENDITA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldLabel>
          <FieldLabel label="Stato riordino">
            <select value={annata.STATO_RIORDINO ?? ""} onChange={e => upd("STATO_RIORDINO", e.target.value)} className={fieldCls}>
              <option value="">— seleziona —</option>
              {STATO_RIORDINO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldLabel>
          <FieldLabel label="Stato conservazione">
            <select value={annata.STATO_CONSERVAZIONE ?? ""} onChange={e => upd("STATO_CONSERVAZIONE", e.target.value)} className={fieldCls}>
              <option value="">— seleziona —</option>
              {STATO_CONSERVAZIONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldLabel>
          <div className="col-span-3">
            <FieldLabel label="Note stato">
              <input type="text" value={annata.NOTE_STATO} onChange={e => upd("NOTE_STATO", e.target.value)} className={fieldCls} />
            </FieldLabel>
          </div>
        </Grid>
      </Section>

      <Section title="Locazioni e giacenza iniziale">
        <Grid cols={4}>
          <FieldLabel label="Frigorifero">
            <LocSelect value={annata.FRIGORIFERO} onChange={v => upd("FRIGORIFERO", v)} options={opzioniFrigo} />
          </FieldLabel>
          <FieldLabel label="Qtà frigo">
            <input type="number" value={annata.QTA_FRIGO} onChange={e => upd("QTA_FRIGO", e.target.value)} className={fieldCls} />
          </FieldLabel>
          <FieldLabel label="Locazione 1">
            <LocSelect value={annata.LOCAZIONE_1} onChange={v => upd("LOCAZIONE_1", v)} options={opzioniLoc1} />
          </FieldLabel>
          <FieldLabel label="Qtà loc.1">
            <input type="number" value={annata.QTA_LOC1} onChange={e => upd("QTA_LOC1", e.target.value)} className={fieldCls} />
          </FieldLabel>
          <FieldLabel label="Locazione 2">
            <LocSelect value={annata.LOCAZIONE_2} onChange={v => upd("LOCAZIONE_2", v)} options={opzioniLoc2} />
          </FieldLabel>
          <FieldLabel label="Qtà loc.2">
            <input type="number" value={annata.QTA_LOC2} onChange={e => upd("QTA_LOC2", e.target.value)} className={fieldCls} />
          </FieldLabel>
          <FieldLabel label="Locazione 3">
            <LocSelect value={annata.LOCAZIONE_3} onChange={v => upd("LOCAZIONE_3", v)} options={opzioniLoc3} />
          </FieldLabel>
          <FieldLabel label="Qtà loc.3">
            <input type="number" value={annata.QTA_LOC3} onChange={e => upd("QTA_LOC3", e.target.value)} className={fieldCls} />
          </FieldLabel>
        </Grid>
        <p className="text-[10px] text-neutral-500 mt-2 italic">
          La quantità totale (QTA_TOTALE) viene calcolata come somma delle 4 colonne, non si imposta manualmente.
        </p>
      </Section>

      <Section title="Note">
        <FieldLabel label="Note generali">
          <textarea rows={3} value={annata.NOTE} onChange={e => upd("NOTE", e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-neutral-300 text-sm bg-white" />
        </FieldLabel>
      </Section>
    </div>
  );
}


// =====================================================================
// PREVIEW MODAL — riassunto finale (no scrittura)
// =====================================================================
function PreviewModal({ produttore, madre, annata, onClose, onReset }) {
  const qtaTot = Number(annata.QTA_FRIGO || 0) + Number(annata.QTA_LOC1 || 0)
    + Number(annata.QTA_LOC2 || 0) + Number(annata.QTA_LOC3 || 0);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-rose-200 bg-gradient-to-r from-rose-50 to-amber-50 flex-shrink-0">
          <h3 className="text-base font-bold text-neutral-900">🧪 Preview — cosa verrebbe creato</h3>
          <p className="text-[11px] text-rose-800 mt-1">
            <strong>Nessuna scrittura su DB.</strong> Questo è un riepilogo strutturato del nuovo vino.
            Per creare davvero si usa il "+ Nuovo Vino" della Cantina classica (oggi) — al cutover Fase 10
            questo wizard sostituirà quel flusso.
          </p>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <PreviewBlock title="🏛️ Produttore" highlight={produttore?._new ? "DA CREARE" : `esistente #${produttore?.id}`}>
            <PreviewRow label="Nome" value={produttore?.nome} />
            <PreviewRow label="Nazione" value={produttore?.nazione} />
            <PreviewRow label="Regione" value={produttore?.regione} />
            <PreviewRow label="Provincia" value={produttore?.provincia} />
            <PreviewRow label="Città" value={produttore?.citta} />
          </PreviewBlock>

          <PreviewBlock title="🍷 Vino madre" highlight={madre?._new ? "DA CREARE" : `esistente #${madre?.id}`}>
            <PreviewRow label="Descrizione" value={madre?.descrizione} />
            <PreviewRow label="Tipologia" value={madre?.tipologia} />
            <PreviewRow label="Nazione · Regione" value={[madre?.nazione, madre?.regione].filter(Boolean).join(" · ")} />
            <PreviewRow label="Grado alcolico tipico" value={madre?.grado_alcolico_tipico ? `${madre.grado_alcolico_tipico}%` : null} />
            <PreviewRow label="Denominazione" value={madre?._new ? madre?.denominazione_label : (madre?.denominazione_id ? `#${madre.denominazione_id}` : null)} />
            <PreviewRow label="Distributore" value={madre?._new ? madre?.fornitore_label : (madre?.fornitore_id ? `#${madre.fornitore_id}` : null)} />
            {madre?._new && madre.vitigni?.length > 0 && (
              <PreviewRow label="Vitigni" value={madre.vitigni.map(v => `${v.vitigno_label}${v.pct ? ` ${v.pct}%` : ""}`).join(", ")} />
            )}
            <PreviewRow label="Abbinamenti" value={madre?.abbinamenti} />
            <PreviewRow label="Note madre" value={madre?.note_madre} />
          </PreviewBlock>

          <PreviewBlock title="📅 Annata (nuova bottiglia)" highlight="DA CREARE">
            <PreviewRow label="Annata · Formato" value={`${annata.ANNATA || "?"} · ${annata.FORMATO || "BT"}`} />
            <PreviewRow label="Grado alcolico" value={annata.GRADO_ALCOLICO ? `${annata.GRADO_ALCOLICO}%` : null} />
            <PreviewRow label="Listino · Sconto" value={annata.EURO_LISTINO ? `€ ${annata.EURO_LISTINO}${annata.SCONTO ? ` − ${annata.SCONTO}%` : ""}` : null} />
            <PreviewRow label="Prezzo carta" value={annata.PREZZO_CARTA ? `€ ${annata.PREZZO_CARTA}` : null} />
            <PreviewRow label="Prezzo calice" value={annata.PREZZO_CALICE ? `€ ${annata.PREZZO_CALICE}` : null} />
            <PreviewRow label="Flag" value={[
              annata.CARTA ? "in carta" : null,
              annata.VENDITA_CALICE ? "al calice" : null,
              annata.BIOLOGICO ? "biologico" : null,
              annata.IPRATICO ? "iPratico" : null,
              annata.FORZA_PREZZO ? "prezzo forzato" : null,
            ].filter(Boolean).join(" · ") || null} />
            <PreviewRow label="Stato vendita"        value={labelOf(STATO_VENDITA_OPTIONS, annata.STATO_VENDITA)} />
            <PreviewRow label="Stato riordino"       value={labelOf(STATO_RIORDINO_OPTIONS, annata.STATO_RIORDINO)} />
            <PreviewRow label="Stato conservazione"  value={labelOf(STATO_CONSERVAZIONE_OPTIONS, annata.STATO_CONSERVAZIONE)} />
            <PreviewRow label="Locazioni" value={[
              annata.FRIGORIFERO && `${annata.FRIGORIFERO}: ${annata.QTA_FRIGO || 0}`,
              annata.LOCAZIONE_1 && `${annata.LOCAZIONE_1}: ${annata.QTA_LOC1 || 0}`,
              annata.LOCAZIONE_2 && `${annata.LOCAZIONE_2}: ${annata.QTA_LOC2 || 0}`,
              annata.LOCAZIONE_3 && `${annata.LOCAZIONE_3}: ${annata.QTA_LOC3 || 0}`,
            ].filter(Boolean).join(" · ") || null} />
            <PreviewRow label="Qtà totale calcolata" value={`${qtaTot} bottiglie`} />
            <PreviewRow label="Note" value={annata.NOTE} />
          </PreviewBlock>
        </div>

        <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onReset}
            className="px-4 py-1.5 rounded-lg border border-neutral-300 text-sm hover:bg-neutral-50">
            ↺ Ricomincia
          </button>
          <button onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-neutral-700 text-white text-sm font-semibold hover:bg-neutral-800">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}


// =====================================================================
// COMPONENTI UI HELPER (interni a questo file)
// =====================================================================
const fieldCls = "w-full px-2 py-1.5 rounded border border-neutral-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300";

function FieldLabel({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-neutral-700 uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2 border-b border-amber-200 pb-1">{title}</h3>
      {children}
    </div>
  );
}

function Grid({ cols = 2, children }) {
  const colsClass = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[cols] || "grid-cols-2";
  return <div className={`grid ${colsClass} gap-2`}>{children}</div>;
}

function BoolToggle({ value, onChange }) {
  const on = !!value && Number(value) !== 0;
  return (
    <button type="button" onClick={() => onChange(on ? 0 : 1)}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition w-full ${
        on
          ? "bg-emerald-100 border-2 border-emerald-400 text-emerald-900"
          : "bg-neutral-100 border-2 border-neutral-300 text-neutral-600 hover:bg-neutral-200"
      }`}>
      {on ? "✓ Sì" : "○ No"}
    </button>
  );
}

function LocSelect({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={fieldCls}>
      <option value="">—</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function PreviewBlock({ title, highlight, children }) {
  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-900">{title}</span>
        {highlight && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
            highlight.startsWith("DA") ? "bg-amber-200 text-amber-900" : "bg-emerald-100 text-emerald-800"
          }`}>{highlight}</span>
        )}
      </div>
      <div className="p-3 space-y-1 text-xs">
        {children}
      </div>
    </div>
  );
}

// Cerca la label parlante di un'opzione dropdown dato il value, restituisce null
// se vuoto / non trovato (così il PreviewRow non mostra la riga).
function labelOf(options, value) {
  if (value === "" || value == null) return null;
  const opt = options.find(o => String(o.value) === String(value));
  return opt && opt.value !== "" ? opt.label : null;
}

function PreviewRow({ label, value }) {
  if (value == null || value === "" || value === undefined) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-neutral-500 min-w-[140px]">{label}:</span>
      <span className="font-medium text-neutral-900">{value}</span>
    </div>
  );
}

// =====================================================================
// HELPER: stato iniziale annata vuoto
// =====================================================================
function emptyAnnata() {
  return {
    ANNATA: "",
    FORMATO: "BT",
    GRADO_ALCOLICO: "",
    EURO_LISTINO: "",
    SCONTO: "",
    PREZZO_CARTA: "",
    PREZZO_CALICE: "",
    NOTE_PREZZO: "",
    CARTA: 1,
    VENDITA_CALICE: 0,
    BIOLOGICO: 0,
    IPRATICO: 0,
    FORZA_PREZZO: 0,
    STATO_VENDITA: "",
    STATO_RIORDINO: "",
    STATO_CONSERVAZIONE: "",
    NOTE_STATO: "",
    FRIGORIFERO: "",
    QTA_FRIGO: "",
    LOCAZIONE_1: "",
    QTA_LOC1: "",
    LOCAZIONE_2: "",
    QTA_LOC2: "",
    LOCAZIONE_3: "",
    QTA_LOC3: "",
    NOTE: "",
  };
}
