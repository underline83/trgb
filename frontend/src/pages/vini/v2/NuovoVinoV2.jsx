// Modulo: vini
// src/pages/vini/v2/NuovoVinoV2.jsx
//
// M2.8 (2026-05-16) — Refactor con primitive M.I (Btn, Card, Modal, Stepper,
// TextInput, Select, Textarea, FieldLabel, SectionTitle). Palette amber
// unificata per tutto il modulo Vini (decisione architettura_pattern §3-bis).
//
// Wizard "Nuovo Vino" 3-step preview-only:
//   Step 1 — Produttore   (autocomplete + "+ Nuovo")
//   Step 2 — Vino madre   (lista madri del produttore + "+ Nuovo madre")
//   Step 3 — Annata       (campi annata-specifici)
//
// PREVIEW-ONLY: al submit nessuna scrittura. Modale finale con riassunto.

import React, { useEffect, useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../../../config/api";
import {
  Btn, Card, Modal, Stepper, TextInput, Select, Textarea,
  FieldLabel, SectionTitle,
} from "../../../components/ui";
// M2.9: composizione automatica descrizione (denom + nome + vitigni + grado).
import componiDescrizione, { vitigniToString } from "../../../utils/vini/componiDescrizione";
// M2.9-ter (2026-05-18): riuso del componente matrice esistente in modalità "draft"
// (vinoId=null + pendingCells controllato) — l'utente può preselezionare le celle
// scaffali già in creazione. La scrittura su matrice_celle avverrà al cutover.
import MatricePicker from "../MatricePicker";
// STATO_RIORDINO non è usato dal wizard (Marco 2026-05-16: non ha senso in creazione).
import {
  STATO_VENDITA_OPTIONS_LONG as STATO_VENDITA_OPTIONS,
  STATO_CONSERVAZIONE_OPTIONS_LONG as STATO_CONSERVAZIONE_OPTIONS,
} from "../../../config/viniConstants";

const STEPS = [
  { key: 1, label: "Produttore",  icon: "🏛️" },
  { key: 2, label: "Vino madre",  icon: "🍷" },
  { key: 3, label: "Annata",      icon: "📅" },
  { key: 4, label: "Giacenze",    icon: "📦" },
];

const TONE = "amber"; // Modulo Vini = amber sempre

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
    if (step === 4) {
      // Almeno una locazione con quantità > 0 (come Cantina classica)
      const qtaSum = Number(annata.QTA_FRIGO || 0) + Number(annata.QTA_LOC1 || 0)
        + Number(annata.QTA_LOC2 || 0) + Number(annata.QTA_LOC3 || 0);
      return qtaSum > 0;
    }
    return false;
  }, [step, produttore, madre, annata]);

  const goNext = () => {
    if (step < 4) setStep(step + 1);
    else setShowPreview(true);
  };
  const goBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSelectProduttore = (p) => {
    setProduttore(p);
    if (madre && !madre._new && p?.id && madre.produttore_id && madre.produttore_id !== p.id) {
      setMadre(null);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto p-3 md:p-4">
      <Card padded={false} className="flex flex-col" style={{ height: "calc(100vh - 130px)" }}>

        {/* Header sticky: stepper + bottoni avanzamento (duplicati del footer) */}
        <div className="border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white flex-shrink-0 flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <Stepper current={step} steps={STEPS} tone={TONE} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Btn variant="secondary" size="sm" onClick={goBack} disabled={step === 1}>
              ← Indietro
            </Btn>
            <Btn variant="warning" size="sm" onClick={goNext} disabled={!canAdvance}>
              {step === 4 ? "✓ Conferma" : "Avanti →"}
            </Btn>
          </div>
        </div>

        {/* Crumbs */}
        <Crumbs produttore={produttore} madre={madre} step={step} />

        {/* Body */}
        <div className="flex-1 overflow-auto bg-neutral-50">
          {step === 1 && <Step1Produttore produttore={produttore} onSelect={handleSelectProduttore} />}
          {step === 2 && <Step2Madre produttore={produttore} madre={madre} onSelect={setMadre} />}
          {step === 3 && <Step3Annata annata={annata} setAnnata={setAnnata} produttore={produttore} madre={madre} setMadre={setMadre} />}
          {step === 4 && <Step4Giacenze annata={annata} setAnnata={setAnnata} produttore={produttore} madre={madre} />}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-neutral-200 bg-white flex items-center gap-3 flex-shrink-0">
          <Btn variant="ghost" size="sm" onClick={reset}>↺ Ricomincia</Btn>
          <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md inline-flex items-center gap-1 whitespace-nowrap">
            <span>🧪</span><strong>PREVIEW</strong> · nessuna scrittura su DB
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Btn variant="secondary" size="md" onClick={goBack} disabled={step === 1}>← Indietro</Btn>
            <Btn variant="warning" size="md" onClick={goNext} disabled={!canAdvance}>
              {step === 4 ? "✓ Conferma (preview)" : "Avanti →"}
            </Btn>
          </div>
        </div>
      </Card>

      <PreviewModal
        open={showPreview}
        produttore={produttore}
        madre={madre}
        annata={annata}
        onClose={() => setShowPreview(false)}
        onReset={reset}
      />
    </div>
  );
}


// =====================================================================
// CRUMBS — riassunto selezioni precedenti
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
        <span className="inline-flex items-center gap-1.5 bg-white border border-amber-300 px-2 py-1 rounded-md whitespace-nowrap">
          <span className="text-amber-700 font-semibold">🍷</span>
          <strong className="text-neutral-900">{madre.descrizione}</strong>
          {madre.tipologia && <span className="text-[10px] text-neutral-500">· {madre.tipologia}</span>}
          {madre._new && <span className="text-[10px] bg-amber-200 text-amber-900 px-1 rounded">NUOVO</span>}
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
    <div className="p-4 md:p-6 space-y-3">
      <div>
        <h2 className="text-lg font-bold text-neutral-900 mb-1">Step 1 — Scegli o crea il produttore</h2>
        <p className="text-xs text-neutral-600">Cerca un produttore esistente. Se non lo trovi, creane uno nuovo.</p>
      </div>

      <div className="relative">
        <TextInput
          size="lg"
          value={query}
          onChange={setQuery}
          placeholder="Cerca produttore per nome (min 2 caratteri)…"
          autoFocus
        />
        {loading && <span className="absolute right-3 top-3 text-xs text-neutral-400">cerca…</span>}
      </div>

      {results.length > 0 && (
        <Card radius="2xl" shadow="sm" padded={false}>
          <div className="px-3 py-1.5 bg-neutral-50 border-b border-neutral-200 text-[10px] uppercase tracking-wide text-neutral-500">
            {results.length} risultati
          </div>
          <div className="max-h-[40vh] overflow-y-auto">
            {results.map(p => {
              const selected = produttore && !produttore._new && produttore.id === p.id;
              return (
                <button key={p.id} type="button" onClick={() => onSelect(p)}
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
        </Card>
      )}

      {query.trim().length >= 2 && !loading && results.length === 0 && (
        <p className="text-xs text-neutral-500 italic px-2">Nessun produttore trovato per "{query}".</p>
      )}

      {produttore && (
        <Card tone="success" radius="2xl" padding="sm">
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">
            ✓ Produttore selezionato {produttore._new && <span className="bg-amber-200 text-amber-900 px-1 rounded ml-1">DA CREARE</span>}
          </div>
          <div className="text-base font-bold text-neutral-900">{produttore.nome}</div>
          <div className="text-xs text-neutral-700">
            {[produttore.citta, produttore.provincia, produttore.regione, produttore.nazione].filter(Boolean).join(" · ") || "—"}
          </div>
        </Card>
      )}

      {!showNewForm && (
        <button type="button" onClick={() => setShowNewForm(true)}
          className="w-full px-4 py-2 rounded-xl border-2 border-dashed border-amber-300 text-amber-800 text-sm font-semibold hover:bg-amber-50 transition">
          + Nuovo produttore
        </button>
      )}

      {showNewForm && (
        <Card tone="amber" radius="2xl">
          <div className="text-xs font-semibold text-amber-900 mb-3">🆕 Nuovo produttore</div>
          <div className="grid grid-cols-2 gap-2">
            <FieldLabel label="Nome" required>
              <TextInput value={newData.nome} onChange={v => setNewData(d => ({ ...d, nome: v }))} placeholder="es. Marchesi di Barolo" />
            </FieldLabel>
            <FieldLabel label="Nazione" required>
              <TextInput value={newData.nazione} onChange={v => setNewData(d => ({ ...d, nazione: v }))} />
            </FieldLabel>
            <FieldLabel label="Regione">
              <TextInput value={newData.regione} onChange={v => setNewData(d => ({ ...d, regione: v }))} placeholder="es. Piemonte" />
            </FieldLabel>
            <FieldLabel label="Provincia">
              <TextInput value={newData.provincia} onChange={v => setNewData(d => ({ ...d, provincia: v }))} placeholder="es. CN" />
            </FieldLabel>
            <FieldLabel label="Città" className="col-span-2">
              <TextInput value={newData.citta} onChange={v => setNewData(d => ({ ...d, citta: v }))} placeholder="es. Barolo" />
            </FieldLabel>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Btn variant="secondary" size="sm" onClick={() => setShowNewForm(false)}>Annulla</Btn>
            <Btn variant="warning" size="sm" onClick={confirmNew}>Usa questo produttore</Btn>
          </div>
        </Card>
      )}
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

  // M2.9 (2026-05-16): la descrizione del madre non si scrive più a mano.
  // Si compone automaticamente da denominazione + nome_etichetta + vitigni +
  // grado_alcolico_tipico. Il campo "nome_etichetta" (NEW, mig 130) è
  // l'unico "nome aggiuntivo" che l'utente inserisce (cru, fantasia, etc).
  const [newM, setNewM] = useState({
    nome_etichetta: "",         // NEW: cru o nome di fantasia. Opzionale.
    descrizione: "",            // Composta automaticamente — non si edita mai.
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
    if (!produttore || produttore._new) { setMadri([]); return; }
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
        if (rTab.ok) setTipologie((await rTab.json()).tipologie || []);
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

  // Anteprima descrizione composta (live). I vitigni con % vengono formattati,
  // il grado_alcolico_tipico è usato come "grado del madre".
  const descrizioneComposta = useMemo(() => componiDescrizione({
    denominazione:  newM.denominazione_label,
    nome_etichetta: newM.nome_etichetta,
    vitigni:        vitigniToString(newM.vitigni),
    grado:          newM.grado_alcolico_tipico,
  }), [newM.denominazione_label, newM.nome_etichetta, newM.vitigni, newM.grado_alcolico_tipico]);

  const confirmNewMadre = () => {
    // Validazione minima: serve almeno la denominazione (così la descrizione
    // ha un anchor) e la tipologia. Il nome_etichetta resta opzionale.
    if (!newM.denominazione_id) {
      alert("Seleziona una denominazione (necessaria per comporre la descrizione)"); return;
    }
    if (!newM.tipologia) { alert("Tipologia obbligatoria"); return; }
    // La descrizione viene composta automaticamente — la passo a Step 3 come
    // valore proposto. Sarà ricalcolata anche lato bottiglia con i vitigni
    // dell'annata reale (che possono cambiare tra annate).
    onSelect({
      _new: true,
      ...newM,
      descrizione: descrizioneComposta,  // valore composto al momento della creazione
      descrizione_auto: 1,                // flag mig 130: descrizione gestita automaticamente
    });
    setShowNewForm(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-3">
      <div>
        <h2 className="text-lg font-bold text-neutral-900 mb-1">Step 2 — Scegli o crea il vino madre</h2>
        <p className="text-xs text-neutral-600">
          {produttore?._new
            ? "Il produttore è nuovo: crea direttamente il primo vino madre."
            : `Seleziona un'etichetta esistente di ${produttore?.nome}, oppure creane una nuova.`}
        </p>
      </div>

      {!produttore?._new && (
        <>
          {loading && <p className="text-sm text-neutral-500 py-4">Carico…</p>}
          {error && <p className="text-sm text-red-700 py-2">{error}</p>}
          {!loading && madri.length === 0 && (
            <p className="text-sm text-neutral-500 italic py-3 px-2 border border-dashed border-neutral-300 rounded-xl">
              Nessun vino madre per {produttore?.nome}. Crea il primo qui sotto.
            </p>
          )}
          {!loading && madri.length > 0 && (
            <Card radius="2xl" shadow="sm" padded={false}>
              <div className="px-3 py-1.5 bg-neutral-50 border-b border-neutral-200 text-[10px] uppercase tracking-wide text-neutral-500">
                {madri.length} vini madre esistenti
              </div>
              <div className="max-h-[40vh] overflow-y-auto">
                {madri.map(m => {
                  const selected = madre && !madre._new && madre.id === m.id;
                  // M2.9-bis: madri legacy (descrizione_auto=0) ricevono un badge OLD
                  // che ricorda all'utente di promuoverli alla descrizione composta.
                  // I madri nuovi/composti (descrizione_auto=1) sono lo standard → nessun badge.
                  const isLegacy = (m.descrizione_auto || 0) === 0;
                  return (
                    <button key={m.id} type="button" onClick={() => onSelect(m)}
                      className={`w-full text-left px-3 py-2 border-b border-neutral-100 transition ${
                        selected ? "bg-amber-100 border-l-4 border-l-amber-600" : "hover:bg-amber-50"
                      }`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-neutral-900">{m.descrizione}</span>
                        {isLegacy && (
                          <span
                            title="Vino madre in formato legacy — sistemalo per ottenere la descrizione composta automaticamente"
                            className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-orange-100 text-orange-800 border-orange-300"
                          >
                            📜 OLD
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-600">
                        {[m.tipologia, m.regione].filter(Boolean).join(" · ") || "—"}
                        {m.denominazione_id && <span className="text-neutral-400 ml-1">· denom. #{m.denominazione_id}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

      {madre && (
        <Card tone="success" radius="2xl" padding="sm">
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1 flex items-center gap-1 flex-wrap">
            ✓ Vino madre selezionato
            {madre._new && (
              <span className="bg-amber-200 text-amber-900 px-1 rounded ml-1">DA CREARE</span>
            )}
            {!madre._new && (madre.descrizione_auto || 0) === 0 && (
              <span
                title="Vino madre legacy: la descrizione è un testo unico, non i 4 ingredienti separati. Nel prossimo step potrai sistemarlo."
                className="bg-orange-100 text-orange-800 border border-orange-300 px-1 rounded ml-1 normal-case"
              >
                📜 OLD
              </span>
            )}
          </div>
          <div className="text-base font-bold text-neutral-900">{madre.descrizione}</div>
          <div className="text-xs text-neutral-700">
            {[madre.tipologia, madre.regione].filter(Boolean).join(" · ")}
            {madre.denominazione_label && ` · ${madre.denominazione_label}`}
          </div>
        </Card>
      )}

      {!showNewForm && (
        <button type="button" onClick={() => setShowNewForm(true)}
          className="w-full px-4 py-2 rounded-xl border-2 border-dashed border-amber-300 text-amber-800 text-sm font-semibold hover:bg-amber-50 transition">
          + Nuovo vino madre
        </button>
      )}

      {showNewForm && (
        <Card tone="amber" radius="2xl">
          <div className="text-xs font-semibold text-amber-900 mb-3">🆕 Nuovo vino madre</div>

          <div className="grid grid-cols-2 gap-2">
            <FieldLabel label="Nome etichetta / Cru"
                        hint="Opzionale. Es. 'Castiglione', 'Sorì Tildin', 'Bricco delle Viole'. Se vuoto, la descrizione sarà composta solo dalla denominazione.">
              <TextInput value={newM.nome_etichetta}
                onChange={v => setNewM(d => ({ ...d, nome_etichetta: v }))}
                placeholder="es. Castiglione" />
            </FieldLabel>
            <FieldLabel label="Tipologia" required>
              <Select value={newM.tipologia} onChange={v => setNewM(d => ({ ...d, tipologia: v }))}
                options={tipologie} placeholder="— seleziona —" />
            </FieldLabel>
            <FieldLabel label="Nazione">
              <TextInput value={newM.nazione} onChange={v => setNewM(d => ({ ...d, nazione: v }))} />
            </FieldLabel>
            <FieldLabel label="Regione">
              <TextInput value={newM.regione} onChange={v => setNewM(d => ({ ...d, regione: v }))} />
            </FieldLabel>
            <FieldLabel label="Grado alcolico tipico (%)">
              <TextInput type="number" step="0.1" value={newM.grado_alcolico_tipico}
                onChange={v => setNewM(d => ({ ...d, grado_alcolico_tipico: v }))} placeholder="13.5" />
            </FieldLabel>
            <FieldLabel label="Distributore">
              <Select value={newM.fornitore_id || ""}
                onChangeEvent={e => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  const f = fornitori.find(x => x.id === id);
                  setNewM(d => ({ ...d, fornitore_id: id, fornitore_label: f?.nome || "" }));
                }}
                options={fornitori.map(f => ({ value: f.id, label: f.nome }))}
                placeholder="— nessuno —" />
            </FieldLabel>
          </div>

          {/* Denominazione */}
          <FieldLabel label="Denominazione" className="mt-3">
            {newM.denominazione_id ? (
              <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-amber-300 rounded-lg">
                <span className="text-sm flex-1">{newM.denominazione_label}</span>
                <button type="button" onClick={() => setNewM(d => ({ ...d, denominazione_id: null, denominazione_label: "" }))}
                  className="text-xs text-red-600 hover:text-red-800">✕</button>
              </div>
            ) : (
              <div>
                <TextInput placeholder="Cerca denominazione (min 2 caratteri)…"
                  value={denoQ} onChange={setDenoQ} />
                {denoResults.length > 0 && (
                  <div className="mt-1 border border-neutral-200 rounded-lg bg-white shadow-sm max-h-40 overflow-y-auto">
                    {denoResults.map(d => (
                      <div key={d.id}
                        onClick={() => {
                          setNewM(prev => ({ ...prev, denominazione_id: d.id, denominazione_label: `${d.nome} ${d.tipo}` }));
                          setDenoQ("");
                        }}
                        className="px-2 py-1 text-xs cursor-pointer hover:bg-amber-50">
                        <strong>{d.nome} {d.tipo}</strong> · {d.nazione}{d.regione ? ` · ${d.regione}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </FieldLabel>

          {/* Vitigni */}
          <FieldLabel label="Vitigni (max 5 con % opzionale)" className="mt-3">
            <div>
              {newM.vitigni.length > 0 && (
                <div className="space-y-1 mb-2">
                  {newM.vitigni.map(v => (
                    <div key={v.vitigno_id} className="flex items-center gap-2 px-2 py-1 bg-white border border-amber-300 rounded-lg">
                      <span className="text-sm flex-1">🍇 {v.vitigno_label}</span>
                      <TextInput type="number" min="0" max="100" size="sm"
                        value={v.pct} onChange={pct => updateVitignoPct(v.vitigno_id, pct)}
                        className="!w-16" placeholder="%" />
                      <button type="button" onClick={() => removeVitigno(v.vitigno_id)}
                        className="text-xs text-red-600 hover:text-red-800">✕</button>
                    </div>
                  ))}
                </div>
              )}
              {newM.vitigni.length < 5 && (
                <div>
                  <TextInput placeholder="Cerca vitigno (min 2 caratteri)…"
                    value={vitignoQ} onChange={setVitignoQ} />
                  {vitignoResults.length > 0 && (
                    <div className="mt-1 border border-neutral-200 rounded-lg bg-white shadow-sm max-h-40 overflow-y-auto">
                      {vitignoResults.map(v => (
                        <div key={v.id}
                          onClick={() => addVitigno(v)}
                          className="px-2 py-1 text-xs cursor-pointer hover:bg-amber-50">
                          🍇 {v.nome}{v.note && <span className="text-neutral-500 ml-1">· {v.note.slice(0, 50)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </FieldLabel>

          <FieldLabel label="Abbinamenti consigliati" className="mt-3">
            <Textarea rows={2} value={newM.abbinamenti}
              onChange={v => setNewM(d => ({ ...d, abbinamenti: v }))}
              placeholder="es. arrosti, formaggi stagionati, brasati" />
          </FieldLabel>

          <FieldLabel label="Note vino madre" className="mt-3">
            <Textarea rows={2} value={newM.note_madre} onChange={v => setNewM(d => ({ ...d, note_madre: v }))} />
          </FieldLabel>

          {/* Anteprima descrizione composta — live, si aggiorna mentre digiti.
              È quello che diventerà il "nome" della bottiglia. */}
          <div className="mt-4 p-3 rounded-xl border-2 border-amber-300 bg-white">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-1">
              📜 Descrizione composta (anteprima)
            </div>
            <div className="text-sm font-semibold text-neutral-900">
              {descrizioneComposta || <span className="text-neutral-400 italic">— scegli denominazione e nome per vedere l'anteprima —</span>}
            </div>
            <div className="text-[10px] text-neutral-500 mt-1.5 italic">
              Si compone come: <code className="font-mono">denominazione + nome + (vitigni) + grado%</code>.
              Si aggiorna automaticamente nelle annate quando cambi vitigni o grado.
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Btn variant="secondary" size="sm" onClick={() => setShowNewForm(false)}>Annulla</Btn>
            <Btn variant="warning" size="sm" onClick={confirmNewMadre}>Usa questo vino madre</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}


// =====================================================================
// STEP 3 — ANNATA, prezzi, flag, stati (NO Riordino — decisione Marco)
// Pattern di layout/dimensioni replicato da MagazzinoViniNuovo (Cantina 1)
// per coerenza estetica: form a sezioni separate da border-top, niente
// card annidate, flag come toggle iOS-style.
// =====================================================================
function Step3Annata({ annata, setAnnata, produttore, madre, setMadre }) {
  const [formati, setFormati] = useState([]);
  // M2.9-bis (2026-05-18): modal di promozione madre legacy → composto.
  const [showPromote, setShowPromote] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rTab = await apiFetch(`${API_BASE}/settings/vini/valori-tabellati`);
        if (rTab.ok) setFormati((await rTab.json()).formati || []);
      } catch {}
    })();
  }, []);

  const upd = (k, v) => setAnnata(prev => ({ ...prev, [k]: v }));

  // Callback dopo promozione riuscita: aggiorna lo state del madre nel parent.
  const handleMadrePromosso = (madreAggiornato) => {
    if (madreAggiornato && setMadre) {
      setMadre({ ...madre, ...madreAggiornato });
    }
    setShowPromote(false);
  };

  // M2.9: descrizione della BOTTIGLIA. Due strade:
  //  - Madre "composto" (descrizione_auto=1, tipicamente i nuovi via wizard):
  //    componi live da denominazione + nome_etichetta + vitigni + grado.
  //  - Madre "legacy" (descrizione_auto=0 OR campi mancanti, tipicamente i 1287
  //    importati da Excel): la descrizione è un TESTO UNICO già pronto sul madre
  //    (es. "Langhe DOC Rossj-Bass (100% chardonnay)") — uso quella così com'è
  //    e ci appendo solo il grado se l'utente lo cambia per l'annata.
  const isMadreComposto = madre?._new || madre?.descrizione_auto === 1;
  const descrizioneBottiglia = useMemo(() => {
    if (isMadreComposto) {
      // M2.9-bis fix (2026-05-18): leggo i vitigni preferendo `vitigni_list`
      // (decorata dal backend con i nomi via JOIN dopo promote/get_madre),
      // poi `vitigni` per il caso madre._new del wizard Step 2.
      const vitigniMadre = madre?.vitigni_list || madre?.vitigni || [];
      return componiDescrizione({
        denominazione:  madre?.denominazione_label || "",
        nome_etichetta: madre?.nome_etichetta || "",
        vitigni:        annata.VITIGNI || vitigniToString(vitigniMadre),
        grado:          annata.GRADO_ALCOLICO || madre?.grado_alcolico_tipico,
      });
    }
    // Madre legacy: la descrizione del madre è il testo originale immutato.
    // Se l'utente specifica un grado per QUESTA annata diverso, lo appendo.
    return (madre?.descrizione || "").trim();
  }, [isMadreComposto, madre, annata.VITIGNI, annata.GRADO_ALCOLICO]);

  // Adatta i formati dal backend a {value,label} per Select
  const formatiOptions = useMemo(() => formati.map((f) => {
    const fmt = typeof f === "string" ? f : f.formato;
    const desc = typeof f === "string" ? "" : f.descrizione;
    const litri = typeof f === "string" ? "" : f.litri;
    return { value: fmt, label: desc ? `${desc}${litri ? ` (${litri}L)` : ""}` : fmt };
  }), [formati]);

  // Auto-calcolo prezzo calice = round((prezzoCarta/5)*2)/2, se non manuale.
  // Replica esatta della logica di MagazzinoViniNuovo (Cantina 1, riga ~540).
  const onPrezzoCartaChange = (val) => {
    setAnnata(prev => {
      const upd_ = { ...prev, PREZZO_CARTA: val };
      if (!prev.PREZZO_CALICE_MANUALE) {
        const pf = parseFloat(val);
        upd_.PREZZO_CALICE = pf > 0 ? (Math.round((pf / 5) * 2) / 2).toFixed(1) : "";
      }
      return upd_;
    });
  };
  const onPrezzoCaliceChange = (val) => {
    setAnnata(prev => ({ ...prev, PREZZO_CALICE: val, PREZZO_CALICE_MANUALE: 1 }));
  };

  // STATO_VENDITA / STATO_CONSERVAZIONE: niente opzione "— nessuna indicazione —"
  // (i default 2 e "3" sono sempre validi a creazione, decisione Marco 2026-05-16).
  const statoVenditaOptions = STATO_VENDITA_OPTIONS.filter(o => o.value !== "");
  const statoConservazioneOptions = STATO_CONSERVAZIONE_OPTIONS.filter(o => o.value !== "");

  // M2.9-bis: il madre è "legacy" (descrizione_auto=0) se viene dal DB e non
  // è ancora stato promosso al modello composto. Mostriamo un banner che invita
  // a sistemarlo prima di proseguire, senza bloccare il flusso.
  const isMadreLegacy = madre && !madre._new && (madre.descrizione_auto || 0) === 0;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Banner madre legacy — invito (non bloccante) a promuovere */}
      {isMadreLegacy && (
        <div className="rounded-2xl border-2 border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3 flex items-start gap-3 shadow-sm">
          <div className="text-2xl flex-shrink-0">📜</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-orange-100 text-orange-800 border-orange-300">
                OLD
              </span>
              <strong className="text-sm text-orange-900">Vino madre in formato legacy</strong>
            </div>
            <p className="text-xs text-orange-800 mt-1 leading-relaxed">
              La descrizione è un testo unico, non scomposta nei 4 ingredienti (denominazione, nome
              etichetta, vitigni, grado). Puoi sistemarlo ora — il sistema ricostruirà la descrizione
              automaticamente e il badge OLD sparirà. Non è obbligatorio: puoi proseguire e la
              descrizione attuale resterà valida ovunque (stampa carta, PDF…).
            </p>
          </div>
          <div className="flex-shrink-0">
            <Btn variant="warning" size="sm" onClick={() => setShowPromote(true)}>
              🔧 Sistema il madre
            </Btn>
          </div>
        </div>
      )}

      {/* Anteprima descrizione composta (live, banner principale) */}
      <DescrizioneAnteprima testo={descrizioneBottiglia} sub="Nome di questa bottiglia. Si aggiorna se modifichi i vitigni o il grado." />

      {/* Box "Vino madre" — campi ereditati, read-only (conferma visiva). */}
      <MadreReadOnlyBox produttore={produttore} madre={madre} />

      {/* Modal promozione madre legacy → composto */}
      {showPromote && (
        <PromuoviMadreModal
          madre={madre}
          onClose={() => setShowPromote(false)}
          onSuccess={handleMadrePromosso}
        />
      )}

      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-200">
          <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">Annata · Prezzi · Flag · Stati</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Dati specifici dell'annata. Le giacenze si compilano nel prossimo step.</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Identificazione */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FieldLabel label="Annata" required>
              <TextInput value={annata.ANNATA} onChange={v => upd("ANNATA", v)} placeholder="es. 2019" autoFocus />
            </FieldLabel>
            <FieldLabel label="Formato">
              <Select value={annata.FORMATO} onChange={v => upd("FORMATO", v)} options={formatiOptions} />
            </FieldLabel>
            <FieldLabel label="Vitigni">
              <TextInput value={annata.VITIGNI} onChange={v => upd("VITIGNI", v)} placeholder="es. Nebbiolo 100%" />
            </FieldLabel>
            <FieldLabel label="Grado alcolico">
              <TextInput type="number" step="0.1" value={annata.GRADO_ALCOLICO}
                onChange={v => upd("GRADO_ALCOLICO", v)} placeholder="13.5" />
            </FieldLabel>
          </div>

          {/* Prezzi (auto-calc carta→calice come Cantina 1) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-neutral-100">
            <FieldLabel label="Prezzo carta €">
              <TextInput type="number" step="0.50" value={annata.PREZZO_CARTA} onChange={onPrezzoCartaChange} />
            </FieldLabel>
            <FieldLabel label={`Calice €${annata.PREZZO_CALICE_MANUALE ? " ✎" : " (auto)"}`}>
              <TextInput type="number" step="0.50" value={annata.PREZZO_CALICE} onChange={onPrezzoCaliceChange} />
            </FieldLabel>
            <FieldLabel label="Listino €">
              <TextInput type="number" step="0.01" value={annata.EURO_LISTINO} onChange={v => upd("EURO_LISTINO", v)} />
            </FieldLabel>
            <FieldLabel label="Sconto %">
              <TextInput type="number" step="0.01" value={annata.SCONTO} onChange={v => upd("SCONTO", v)} />
            </FieldLabel>
          </div>

          {/* Flag toggle (iOS-style come Cantina 1) */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-4 pt-3 border-t border-neutral-100">
            <FlagToggle label="Carta Vini"   value={annata.CARTA}          onChange={v => upd("CARTA", v)} />
            <FlagToggle label="iPratico"     value={annata.IPRATICO}       onChange={v => upd("IPRATICO", v)} />
            <FlagToggle label="Calice"       value={annata.VENDITA_CALICE} onChange={v => upd("VENDITA_CALICE", v)} />
            <FlagToggle label="Biologico"    value={annata.BIOLOGICO}      onChange={v => upd("BIOLOGICO", v)} />
            <FlagToggle label="Forza Prezzo" value={annata.FORZA_PREZZO}   onChange={v => upd("FORZA_PREZZO", v)} />
          </div>

          {/* Stati (no Riordino — decisione Marco: non ha senso a creazione) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-neutral-100">
            <FieldLabel label="Stato vendita" hint="Default: Vendere">
              <Select value={annata.STATO_VENDITA} onChange={v => upd("STATO_VENDITA", v)}
                options={statoVenditaOptions} />
            </FieldLabel>
            <FieldLabel label="Stato conservazione" hint="Default: Perfetta">
              <Select value={annata.STATO_CONSERVAZIONE} onChange={v => upd("STATO_CONSERVAZIONE", v)}
                options={statoConservazioneOptions} />
            </FieldLabel>
          </div>

          {/* Note prezzo / stato / interne */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-neutral-100">
            <FieldLabel label="Note stato">
              <TextInput value={annata.NOTE_STATO} onChange={v => upd("NOTE_STATO", v)} />
            </FieldLabel>
            <FieldLabel label="Note prezzo">
              <TextInput value={annata.NOTE_PREZZO} onChange={v => upd("NOTE_PREZZO", v)} />
            </FieldLabel>
          </div>

          <FieldLabel label="Note interne">
            <Textarea rows={2} value={annata.NOTE} onChange={v => upd("NOTE", v)} />
          </FieldLabel>
        </div>
      </div>
    </div>
  );
}


// =====================================================================
// STEP 4 — GIACENZE per locazione (replica Cantina 1: locCard 2x2)
// =====================================================================
function Step4Giacenze({ annata, setAnnata, produttore, madre }) {
  const [opzioniFrigo, setOpzioniFrigo] = useState([]);
  const [opzioniLoc1, setOpzioniLoc1] = useState([]);
  const [opzioniLoc2, setOpzioniLoc2] = useState([]);
  const [opzioniLoc3, setOpzioniLoc3] = useState([]);

  // Descrizione bottiglia (stessa logica dello Step 3 — madre composto vs legacy).
  const isMadreComposto = madre?._new || madre?.descrizione_auto === 1;
  const descrizioneBottiglia = useMemo(() => {
    if (isMadreComposto) {
      // M2.9-bis fix: vitigni_list (backend decorato) o vitigni (madre._new wizard)
      const vitigniMadre = madre?.vitigni_list || madre?.vitigni || [];
      return componiDescrizione({
        denominazione:  madre?.denominazione_label || "",
        nome_etichetta: madre?.nome_etichetta || "",
        vitigni:        annata.VITIGNI || vitigniToString(vitigniMadre),
        grado:          annata.GRADO_ALCOLICO || madre?.grado_alcolico_tipico,
      });
    }
    return (madre?.descrizione || "").trim();
  }, [isMadreComposto, madre, annata.VITIGNI, annata.GRADO_ALCOLICO]);

  useEffect(() => {
    (async () => {
      try {
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

  const qtaTot = Number(annata.QTA_FRIGO || 0) + Number(annata.QTA_LOC1 || 0)
    + Number(annata.QTA_LOC2 || 0) + Number(annata.QTA_LOC3 || 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Banner descrizione composta + box madre (stessa conferma visiva di Step 3) */}
      <DescrizioneAnteprima testo={descrizioneBottiglia} sub="Bottiglia che stai per inserire in cantina." />
      <MadreReadOnlyBox produttore={produttore} madre={madre} />

      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">Giacenze per locazione</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Obbligatorio almeno una locazione con quantità &gt; 0.</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase text-neutral-500">Totale</div>
            <div className="text-lg font-bold text-amber-900 tabular-nums">{qtaTot} bt</div>
          </div>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LocCard title="Frigorifero" options={opzioniFrigo}
              loc={annata.FRIGORIFERO} onLoc={v => upd("FRIGORIFERO", v)}
              qta={annata.QTA_FRIGO} onQta={v => upd("QTA_FRIGO", v)} />
            <LocCard title="Locazione 1" options={opzioniLoc1}
              loc={annata.LOCAZIONE_1} onLoc={v => upd("LOCAZIONE_1", v)}
              qta={annata.QTA_LOC1} onQta={v => upd("QTA_LOC1", v)} />
            <LocCard title="Locazione 2" options={opzioniLoc2}
              loc={annata.LOCAZIONE_2} onLoc={v => upd("LOCAZIONE_2", v)}
              qta={annata.QTA_LOC2} onQta={v => upd("QTA_LOC2", v)} />
            <LocCard title="Locazione 3" options={opzioniLoc3}
              loc={annata.LOCAZIONE_3} onLoc={v => upd("LOCAZIONE_3", v)}
              qta={annata.QTA_LOC3} onQta={v => upd("QTA_LOC3", v)} />
          </div>
          {/* M2.9-ter: posizione scaffali (matrice) — opzionale, draft.
              Stesso componente di SchedaVino → tab Giacenze (MatricePicker),
              usato in modalità draft (vinoId=null + pendingCells controllato):
              click su una cella la pre-seleziona, niente scrittura DB. La
              persistenza vera avverrà al cutover del wizard. */}
          <div className="mt-4 p-3 rounded-xl bg-amber-50/40 border border-amber-200">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                🗄️ Posizione scaffali <span className="text-neutral-500 font-normal normal-case">(opzionale)</span>
              </h3>
              <span className="text-[10px] text-neutral-500 italic">
                puoi anche compilarla dopo dalla scheda → Giacenze
              </span>
            </div>
            <MatricePicker
              vinoId={null}
              pendingCells={annata.MATRICE_CELLE || []}
              onPendingChange={cells => upd("MATRICE_CELLE", cells)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}


// =====================================================================
// PREVIEW MODAL — riassunto finale (no scrittura)
// =====================================================================
function PreviewModal({ open, produttore, madre, annata, onClose, onReset }) {
  const qtaTot = Number(annata.QTA_FRIGO || 0) + Number(annata.QTA_LOC1 || 0)
    + Number(annata.QTA_LOC2 || 0) + Number(annata.QTA_LOC3 || 0);

  // Descrizione finale della bottiglia (composta — è il "nome" da inserire).
  const vitigniMadreFinale = madre?.vitigni_list || madre?.vitigni || [];
  const descrizioneFinale = componiDescrizione({
    denominazione:  madre?.denominazione_label || "",
    nome_etichetta: madre?.nome_etichetta || "",
    vitigni:        annata.VITIGNI || vitigniToString(vitigniMadreFinale),
    grado:          annata.GRADO_ALCOLICO || madre?.grado_alcolico_tipico,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🧪 Preview — cosa verrebbe creato"
      subtitle="Nessuna scrittura su DB. Riepilogo strutturato del nuovo vino. Per crearlo davvero, usa il + Nuovo Vino della Cantina classica (al cutover Fase 10 questo wizard prenderà quel posto)."
      tone="amber"
      size="xl"
      footer={
        <>
          <Btn variant="secondary" size="md" onClick={onReset}>↺ Ricomincia</Btn>
          <Btn variant="dark" size="md" onClick={onClose}>Chiudi</Btn>
        </>
      }
    >
      <div className="space-y-4">
        <PreviewBlock title="🏛️ Produttore" highlight={produttore?._new ? "DA CREARE" : `esistente #${produttore?.id}`}>
          <PreviewRow label="Nome" value={produttore?.nome} />
          <PreviewRow label="Nazione" value={produttore?.nazione} />
          <PreviewRow label="Regione" value={produttore?.regione} />
          <PreviewRow label="Provincia" value={produttore?.provincia} />
          <PreviewRow label="Città" value={produttore?.citta} />
        </PreviewBlock>

        <PreviewBlock title="🍷 Vino madre" highlight={madre?._new ? "DA CREARE" : `esistente #${madre?.id}`}>
          <PreviewRow label="Denominazione" value={madre?._new ? madre?.denominazione_label : (madre?.denominazione_id ? `#${madre.denominazione_id}` : null)} />
          <PreviewRow label="Nome etichetta / Cru" value={madre?.nome_etichetta} />
          <PreviewRow label="Descrizione (auto)" value={madre?.descrizione} />
          <PreviewRow label="Tipologia" value={madre?.tipologia} />
          <PreviewRow label="Nazione · Regione" value={[madre?.nazione, madre?.regione].filter(Boolean).join(" · ")} />
          <PreviewRow label="Grado alcolico tipico" value={madre?.grado_alcolico_tipico ? `${madre.grado_alcolico_tipico}%` : null} />
          <PreviewRow label="Distributore" value={madre?._new ? madre?.fornitore_label : (madre?.fornitore_id ? `#${madre.fornitore_id}` : null)} />
          {madre?._new && madre.vitigni?.length > 0 && (
            <PreviewRow label="Vitigni" value={madre.vitigni.map(v => `${v.vitigno_label}${v.pct ? ` ${v.pct}%` : ""}`).join(", ")} />
          )}
          <PreviewRow label="Abbinamenti" value={madre?.abbinamenti} />
          <PreviewRow label="Note madre" value={madre?.note_madre} />
        </PreviewBlock>

        <PreviewBlock title="📅 Annata (nuova bottiglia)" highlight="DA CREARE">
          <PreviewRow label="📜 Descrizione (auto)" value={descrizioneFinale || null} />
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
          <PreviewRow label="Stato vendita" value={labelOf(STATO_VENDITA_OPTIONS, annata.STATO_VENDITA)} />
          {/* Stato riordino NON è gestito dal wizard (decisione Marco 2026-05-16). */}
          <PreviewRow label="Stato conservazione" value={labelOf(STATO_CONSERVAZIONE_OPTIONS, annata.STATO_CONSERVAZIONE)} />
          <PreviewRow label="Locazioni" value={[
            annata.FRIGORIFERO && `${annata.FRIGORIFERO}: ${annata.QTA_FRIGO || 0}`,
            annata.LOCAZIONE_1 && `${annata.LOCAZIONE_1}: ${annata.QTA_LOC1 || 0}`,
            annata.LOCAZIONE_2 && `${annata.LOCAZIONE_2}: ${annata.QTA_LOC2 || 0}`,
            annata.LOCAZIONE_3 && `${annata.LOCAZIONE_3}: ${annata.QTA_LOC3 || 0}`,
          ].filter(Boolean).join(" · ") || null} />
          <PreviewRow label="🗄️ Posizione scaffali" value={
            (annata.MATRICE_CELLE && annata.MATRICE_CELLE.length > 0)
              ? annata.MATRICE_CELLE.map(c => `(${c.colonna},${c.riga})`).join(" · ")
              : null
          } />
          <PreviewRow label="Qtà totale calcolata" value={`${qtaTot} bottiglie`} />
          <PreviewRow label="Note" value={annata.NOTE} />
        </PreviewBlock>
      </div>
    </Modal>
  );
}


// =====================================================================
// HELPERS INTERNI
// =====================================================================

// FlagToggle: switch iOS-style (12pt × 24px) replicato fedelmente da
// MagazzinoViniNuovo (Cantina 1, funzione flagToggle riga ~657) per coerenza
// estetica tra wizard v2 e form classico. I valori sono INTEGER 0/1.
function FlagToggle({ label, value, onChange }) {
  const on = value === 1 || value === "SI" || value === true;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wide">{label}</span>
      <button type="button" onClick={() => onChange(on ? 0 : 1)}
        className={`w-12 h-6 rounded-full relative transition-colors ${on ? "bg-amber-500" : "bg-neutral-300"}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? "left-6" : "left-0.5"}`} />
      </button>
      <span className={`text-[10px] font-medium ${on ? "text-amber-700" : "text-neutral-400"}`}>{on ? "Sì" : "No"}</span>
    </div>
  );
}

// Anteprima descrizione — banner visibile in Step 3 e Step 4. Distingue 2 casi:
//  - composta=true   → "📜 Descrizione composta (auto)" — si aggiorna con vitigni/grado
//  - composta=false  → "📜 Descrizione (testo ereditato dal madre)" — testo storico immutato
function DescrizioneAnteprima({ testo, composta = true, sub }) {
  const titolo = composta
    ? "📜 Descrizione composta (auto)"
    : "📜 Descrizione (ereditata dal madre)";
  const subTesto = sub || (composta
    ? "Nome di questa bottiglia. Si aggiorna se modifichi i vitigni o il grado."
    : "Testo storico del madre, non si ricompone. Per cambiarlo modifica il vino madre.");
  return (
    <div className="p-3 md:p-4 rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-white shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">{titolo}</div>
      <div className="text-base md:text-lg font-bold text-neutral-900">
        {testo || <span className="text-neutral-400 italic">— manca {composta ? "denominazione/vitigni/grado" : "descrizione sul madre"} —</span>}
      </div>
      <div className="text-[11px] text-neutral-600 mt-1">{subTesto}</div>
    </div>
  );
}

// Box "Vino madre selezionato" — i campi del madre come read-only, per dare
// conferma visiva di stare lavorando sul madre giusto (Marco 2026-05-16).
function MadreReadOnlyBox({ produttore, madre }) {
  if (!madre) return null;
  const nomeEt = madre.nome_etichetta || "";
  return (
    <div className="bg-white border border-amber-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-2.5 bg-gradient-to-r from-amber-50 to-white border-b border-amber-200 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
          🍷 Vino madre {madre._new
            ? <span className="ml-2 text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-semibold">DA CREARE</span>
            : <span className="ml-2 text-[10px] text-neutral-500 font-mono">#{madre.id}</span>}
        </h3>
        <span className="text-[10px] text-neutral-500 italic">i campi del madre sono read-only</span>
      </div>
      <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <ReadOnlyField label="Produttore" value={produttore?.nome} />
        <ReadOnlyField label="Denominazione" value={madre.denominazione_label || (madre.denominazione_id ? `#${madre.denominazione_id}` : null)} />
        <ReadOnlyField label="Nome etichetta" value={nomeEt} placeholder="—" />
        <ReadOnlyField label="Tipologia" value={madre.tipologia} />
        <ReadOnlyField label="Nazione" value={madre.nazione || produttore?.nazione} />
        <ReadOnlyField label="Regione" value={madre.regione || produttore?.regione} />
      </div>
    </div>
  );
}

// =====================================================================
// MODAL PROMOZIONE MADRE LEGACY → COMPOSTO (M2.9-bis, 2026-05-18)
// =====================================================================
// Mostrato quando l'utente clicca "Sistema il madre" in Step 3, su un madre
// con descrizione_auto = 0 (legacy). Permette di compilare i 4 ingredienti
// (denominazione, nome etichetta, vitigni con %, grado alcolico) e di
// ricomporre automaticamente la descrizione del madre. Una volta promosso,
// il madre diventa "standard" (descrizione_auto = 1) e il badge OLD sparisce.
//
// L'operazione è admin-only sul backend. Su errore di permesso, il modal
// mostra il messaggio del backend invece di chiudersi.
function PromuoviMadreModal({ madre, onClose, onSuccess }) {
  // Stato locale del form: precarico i campi già presenti sul madre,
  // così l'utente vede subito cosa "già c'è" e cosa manca.
  const [denoLabel, setDenoLabel] = useState(madre?.denominazione_label || "");
  const [denoId, setDenoId] = useState(madre?.denominazione_id || null);
  const [denoQ, setDenoQ] = useState("");
  const [denoResults, setDenoResults] = useState([]);
  const [nomeEtichetta, setNomeEtichetta] = useState(madre?.nome_etichetta || "");
  const [grado, setGrado] = useState(madre?.grado_alcolico_tipico || "");
  // M2.9-bis (mig 131): se il madre ha già vitigni_list precaricati (es. da
  // backfill o da promozione precedente), li mostriamo come stato iniziale.
  const [vitigniList, setVitigniList] = useState(
    (madre?.vitigni_list || []).map(v => ({
      vitigno_id: v.vitigno_id,
      vitigno_label: v.vitigno_label,
      pct: v.pct ?? "",
    }))
  );
  const [vitignoQ, setVitignoQ] = useState("");
  const [vitignoResults, setVitignoResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Autocomplete denominazioni
  useEffect(() => {
    if (denoQ.trim().length < 2) { setDenoResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch(`${API_BASE}/vini/anagrafiche/denominazioni/?search=${encodeURIComponent(denoQ)}`);
        if (r.ok && !cancelled) setDenoResults((await r.json()).slice(0, 10));
      } catch {}
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [denoQ]);

  // Autocomplete vitigni
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
    if (vitigniList.length >= 5) { alert("Massimo 5 vitigni"); return; }
    if (vitigniList.find(x => x.vitigno_id === v.id)) { setVitignoQ(""); return; }
    setVitigniList(prev => [...prev, { vitigno_id: v.id, vitigno_label: v.nome, pct: "" }]);
    setVitignoQ("");
    setVitignoResults([]);
  };
  const removeVitigno = (vid) => setVitigniList(prev => prev.filter(v => v.vitigno_id !== vid));
  const updateVitignoPct = (vid, pct) => {
    setVitigniList(prev => prev.map(v => v.vitigno_id === vid ? { ...v, pct } : v));
  };

  // Preview live della nuova descrizione composta — gemello del backend.
  const vitigniString = useMemo(() => vitigniToString(vitigniList), [vitigniList]);
  const nuovaDescrizione = useMemo(() => componiDescrizione({
    denominazione:  denoLabel,
    nome_etichetta: nomeEtichetta,
    vitigni:        vitigniString,
    grado:          grado,
  }), [denoLabel, nomeEtichetta, vitigniString, grado]);

  const handleSubmit = async () => {
    if (!nuovaDescrizione.trim()) {
      setError("La descrizione composta sarebbe vuota. Compila almeno la denominazione.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        denominazione_id: denoId,
        nome_etichetta: nomeEtichetta || null,
        grado_alcolico_tipico: grado === "" ? null : parseFloat(String(grado).replace(",", ".")),
        // M2.9-bis (mig 131): vitigni strutturati per persistenza negli slot.
        // Backend ricalcola anche la stringa per la descrizione composta.
        vitigni: vitigniList
          .filter(v => !!v.vitigno_id)
          .map(v => ({
            vitigno_id: v.vitigno_id,
            pct: v.pct === "" || v.pct == null ? null : parseFloat(String(v.pct).replace(",", ".")),
          })),
      };
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/madre/${madre.id}/promote-composto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const t = await r.text();
        let msg = `Errore ${r.status}`;
        try { msg = JSON.parse(t).detail || msg; } catch {}
        throw new Error(msg);
      }
      const updated = await r.json();
      onSuccess?.(updated);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose}
           title="🔧 Sistema il vino madre"
           subtitle="Promozione da descrizione legacy a descrizione composta automatica"
           size="lg" tone="amber">
      <div className="space-y-4">
        {/* Descrizione attuale (legacy) */}
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-orange-700 mb-1">
            📜 Descrizione attuale (legacy)
          </div>
          <div className="text-sm font-medium text-neutral-800">
            {madre?.descrizione || <span className="italic text-neutral-400">— vuota —</span>}
          </div>
          <div className="text-[11px] text-orange-700 mt-1">
            Questa è la descrizione storica del madre come testo unico. Sotto, compila i 4
            ingredienti separati per ricomporla strutturata.
          </div>
        </div>

        {/* Form ingredienti */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Denominazione */}
          <div className="md:col-span-2">
            <FieldLabel label="Denominazione" required
                        hint="Es. Barolo DOCG, Langhe DOC, Chianti Classico DOCG…">
              <TextInput value={denoQ || denoLabel}
                onChange={v => { setDenoQ(v); if (!v) { setDenoId(null); setDenoLabel(""); } }}
                placeholder="cerca denominazione…" />
            </FieldLabel>
            {denoResults.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto border border-neutral-200 rounded-lg bg-white">
                {denoResults.map(d => (
                  <button key={d.id} type="button"
                    onClick={() => {
                      const label = `${d.nome} ${d.tipo}`.trim();
                      setDenoId(d.id);
                      setDenoLabel(label);
                      setDenoQ("");
                      setDenoResults([]);
                    }}
                    className="block w-full text-left px-2 py-1.5 text-xs hover:bg-amber-50 border-b border-neutral-100">
                    <strong>{d.nome} {d.tipo}</strong>
                    {d.regione && <span className="text-neutral-500"> · {d.regione}</span>}
                  </button>
                ))}
              </div>
            )}
            {denoLabel && !denoQ && (
              <div className="text-[11px] text-emerald-700 mt-1">✓ Selezionata: {denoLabel}</div>
            )}
          </div>

          {/* Nome etichetta */}
          <FieldLabel label="Nome etichetta / Cru"
                      hint="Opzionale. Es. Castiglione, Sorì Tildin, Rossj-Bass…">
            <TextInput value={nomeEtichetta}
              onChange={setNomeEtichetta}
              placeholder="es. Castiglione" />
          </FieldLabel>

          {/* Grado */}
          <FieldLabel label="Grado alcolico tipico"
                      hint="Es. 13.5. Il grado specifico dell'annata sta sulla bottiglia.">
            <TextInput type="number" step="0.1" value={grado}
              onChange={setGrado} placeholder="13.5" />
          </FieldLabel>

          {/* Vitigni */}
          <div className="md:col-span-2">
            <FieldLabel label="Vitigni"
                        hint="Cerca e aggiungi. Es. Nebbiolo 100% oppure Nebbiolo 95% + Barbera 5%.">
              <TextInput value={vitignoQ} onChange={setVitignoQ} placeholder="cerca vitigno…" />
            </FieldLabel>
            {vitignoResults.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto border border-neutral-200 rounded-lg bg-white">
                {vitignoResults.map(v => (
                  <button key={v.id} type="button" onClick={() => addVitigno(v)}
                    className="block w-full text-left px-2 py-1.5 text-xs hover:bg-amber-50 border-b border-neutral-100">
                    {v.nome}
                  </button>
                ))}
              </div>
            )}
            {vitigniList.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {vitigniList.map(v => (
                  <div key={v.vitigno_id} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                    <span className="text-xs font-semibold text-neutral-800 flex-1">{v.vitigno_label}</span>
                    <TextInput type="number" step="1" value={v.pct}
                      onChange={(val) => updateVitignoPct(v.vitigno_id, val)}
                      placeholder="%" className="!w-20" />
                    <span className="text-xs text-neutral-500">%</span>
                    <button type="button" onClick={() => removeVitigno(v.vitigno_id)}
                      className="text-red-600 hover:text-red-800 px-1 text-sm font-bold" title="Rimuovi">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Preview nuova descrizione */}
        <div className="rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-white p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1">
            ✨ Nuova descrizione (anteprima)
          </div>
          <div className="text-base font-bold text-neutral-900">
            {nuovaDescrizione || <span className="text-neutral-400 italic">— compila gli ingredienti sopra —</span>}
          </div>
          <div className="text-[11px] text-emerald-700 mt-1">
            Composta automaticamente dai 4 ingredienti. Salvando, sostituirà la descrizione storica
            su tutte le bottiglie collegate (la stampa carta e il PDF resteranno coerenti).
          </div>
        </div>

        {/* Errore */}
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            ⚠️ {error}
          </div>
        )}

        {/* Azioni */}
        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
          <Btn variant="secondary" size="md" onClick={onClose} disabled={saving}>Annulla</Btn>
          <Btn variant="warning" size="md" onClick={handleSubmit}
               disabled={saving || !nuovaDescrizione.trim()}
               loading={saving}>
            {saving ? "Salvataggio…" : "💾 Promuovi a composto"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}


// Campo read-only stilizzato come gli altri input ma disabilitato + colore neutro.
function ReadOnlyField({ label, value, placeholder = "—" }) {
  const empty = value == null || value === "";
  return (
    <div>
      <label className="block text-[10px] font-semibold text-neutral-600 uppercase tracking-wider mb-1">{label}</label>
      <div className={`px-2 py-1.5 rounded-lg border text-sm bg-neutral-50 ${
        empty ? "text-neutral-400 italic border-neutral-200" : "text-neutral-800 border-neutral-300"
      }`}>
        {empty ? placeholder : value}
      </div>
    </div>
  );
}

// LocCard: card singola locazione + quantità (replica Cantina 1 funzione locCard
// riga ~674). Usata nello Step 4 del wizard.
function LocCard({ title, options, loc, onLoc, qta, onQta }) {
  return (
    <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
      <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">{title}</div>
      <Select value={loc} onChange={onLoc} options={options} placeholder="— nessuna —" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-600">Quantità</span>
        <TextInput type="number" value={qta} onChange={onQta} placeholder="0" className="!w-24" />
        <span className="text-xs text-neutral-500">bt</span>
      </div>
    </div>
  );
}

function labelOf(options, value) {
  if (value === "" || value == null) return null;
  const opt = options.find(o => String(o.value) === String(value));
  return opt && opt.value !== "" ? opt.label : null;
}

function PreviewBlock({ title, highlight, children }) {
  return (
    <Card padded={false} radius="2xl" shadow="sm">
      <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-900">{title}</span>
        {highlight && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
            highlight.startsWith("DA") ? "bg-amber-200 text-amber-900" : "bg-emerald-100 text-emerald-800"
          }`}>{highlight}</span>
        )}
      </div>
      <div className="p-3 space-y-1 text-xs">{children}</div>
    </Card>
  );
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

function emptyAnnata() {
  return {
    ANNATA: "", FORMATO: "BT", VITIGNI: "", GRADO_ALCOLICO: "",
    EURO_LISTINO: "", SCONTO: "", PREZZO_CARTA: "", PREZZO_CALICE: "",
    PREZZO_CALICE_MANUALE: 0, NOTE_PREZZO: "",
    CARTA: 1, VENDITA_CALICE: 0, BIOLOGICO: 0, IPRATICO: 0, FORZA_PREZZO: 0,
    // Defaults sensati per nuovi vini (Marco 2026-05-16):
    //  - STATO_VENDITA = 2 ("Vendere") — il nuovo vino è subito vendibile
    //  - STATO_CONSERVAZIONE = "3" ("Perfetta — non urgente") — appena entrato in cantina
    //  - STATO_RIORDINO NON è presente nel wizard (non ha senso a creazione)
    STATO_VENDITA: 2, STATO_CONSERVAZIONE: "3", NOTE_STATO: "",
    FRIGORIFERO: "", QTA_FRIGO: "", LOCAZIONE_1: "", QTA_LOC1: "",
    LOCAZIONE_2: "", QTA_LOC2: "", LOCAZIONE_3: "", QTA_LOC3: "",
    // M2.9-ter: posizione scaffali matrice (draft) — lista [{riga, colonna}]
    // raccolta nel wizard. Persistenza su `matrice_celle` al cutover scrittura.
    MATRICE_CELLE: [],
    NOTE: "",
  };
}
