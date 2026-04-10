// @version: v2.2b-dettaglio-fattura-riutilizzabile
// Componente riutilizzabile: dettaglio fattura singola con sidebar colorata
// + main content, layout uniformato a SchedaVino (stesso pattern estetico di
// MagazzinoVini → SchedaVino). Usato sia come pagina standalone (route
// /acquisti/dettaglio/:id) sia inline dentro ControlloGestioneUscite.
import React, { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const FE = `${API_BASE}/contabilita/fe`;
const CG = `${API_BASE}/controllo-gestione`;
const fmt = (v) =>
  v != null
    ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";

// Codici SEPA MP più comuni per il dropdown override
const MP_OPTIONS = [
  { code: "", label: "— nessun override —" },
  { code: "MP01", label: "MP01 — Contanti" },
  { code: "MP02", label: "MP02 — Assegno" },
  { code: "MP05", label: "MP05 — Bonifico" },
  { code: "MP08", label: "MP08 — Carta di pagamento" },
  { code: "MP12", label: "MP12 — RIBA" },
  { code: "MP19", label: "MP19 — SEPA Direct Debit" },
  { code: "MP23", label: "MP23 — PagoPA" },
];

const MP_LABELS = {
  MP01: "Contanti", MP02: "Assegno", MP03: "Assegno circolare",
  MP04: "Contanti presso Tesoreria", MP05: "Bonifico", MP06: "Vaglia cambiario",
  MP08: "Carta di pagamento", MP09: "RID", MP10: "RID utenze",
  MP11: "RID veloce", MP12: "RIBA", MP13: "MAV", MP14: "Quietanza erario",
  MP15: "Giroconto su conti di contabilità speciale", MP16: "Domiciliazione bancaria",
  MP17: "Domiciliazione postale", MP18: "Bollettino postale",
  MP19: "SEPA Direct Debit", MP20: "SEPA Direct Debit CORE",
  MP21: "SEPA Direct Debit B2B", MP22: "Trattenuta su somme già riscosse",
  MP23: "PagoPA",
};

const STATO_BADGE = {
  DA_PAGARE:      "bg-amber-100 text-amber-800 border-amber-200",
  SCADUTA:        "bg-red-100 text-red-800 border-red-200",
  PAGATA:         "bg-emerald-100 text-emerald-800 border-emerald-200",
  PAGATA_MANUALE: "bg-sky-100 text-sky-800 border-sky-200",
  PARZIALE:       "bg-blue-100 text-blue-800 border-blue-200",
  RATEIZZATA:     "bg-purple-100 text-purple-800 border-purple-200",
};

// Sidebar colors in base allo stato fattura — stesso stile di TIPOLOGIA_SIDEBAR in SchedaVino
const FATTURA_SIDEBAR = {
  PAGATA:         { bg: "bg-gradient-to-b from-emerald-700 to-emerald-900",  accent: "bg-emerald-500/30", text: "text-emerald-100" },
  PAGATA_MANUALE: { bg: "bg-gradient-to-b from-teal-700 to-teal-900",        accent: "bg-teal-500/30",    text: "text-teal-100" },
  DA_PAGARE:      { bg: "bg-gradient-to-b from-amber-700 to-amber-900",      accent: "bg-amber-500/30",   text: "text-amber-100" },
  SCADUTA:        { bg: "bg-gradient-to-b from-red-700 to-red-900",          accent: "bg-red-500/30",     text: "text-red-100" },
  PARZIALE:       { bg: "bg-gradient-to-b from-blue-700 to-blue-900",        accent: "bg-blue-500/30",    text: "text-blue-100" },
  RATEIZZATA:     { bg: "bg-gradient-to-b from-purple-700 to-purple-900",    accent: "bg-purple-500/30",  text: "text-purple-100" },
  DEFAULT:        { bg: "bg-gradient-to-b from-slate-700 to-slate-900",      accent: "bg-slate-500/30",   text: "text-slate-100" },
};

function getFatturaSidebar(stato, isRateizzata) {
  if (isRateizzata) return FATTURA_SIDEBAR.RATEIZZATA;
  return FATTURA_SIDEBAR[stato] || FATTURA_SIDEBAR.DEFAULT;
}

// SectionHeader uniforme a SchedaVino
function SectionHeader({ title, children }) {
  return (
    <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between gap-3 flex-wrap">
      <h3 className="text-sm font-bold text-neutral-800">{title}</h3>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

/**
 * FattureDettaglio — componente riutilizzabile.
 *
 * Props:
 *   - fatturaId: number (opzionale) — se passato, sovrascrive useParams().id
 *   - inline: boolean (default false) — se true, rende in modo compatto
 *     senza FattureNav e senza wrapper full-screen (pattern SchedaVino)
 *   - onClose: function (opzionale) — callback quando l'utente chiude/torna
 *   - onFatturaUpdated: function (opzionale) — callback chiamato dopo save,
 *     riceve l'oggetto fattura aggiornato (serve al parent per refresh lista)
 *   - onSegnaPagata: function (opzionale) — callback (fatturaId) chiamato
 *     quando l'utente clicca "Segna pagata" dalla sidebar. Se passato, il
 *     pulsante appare solo se la fattura NON è già pagata. Dopo la callback,
 *     il componente esegue automaticamente refetch.
 */
const FattureDettaglio = forwardRef(function FattureDettaglio(
  { fatturaId: fatturaIdProp, inline = false, onClose, onFatturaUpdated, onSegnaPagata } = {},
  ref
) {
  const { id: idFromParams } = useParams();
  const id = fatturaIdProp != null ? fatturaIdProp : idFromParams;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromScadenzario = !inline && searchParams.get("from") === "scadenzario";

  const [fattura, setFattura] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stato per override IBAN/modalità/scadenza
  const [editingScadenza, setEditingScadenza] = useState(false);
  const [editingIban, setEditingIban] = useState(false);
  const [editingMp, setEditingMp] = useState(false);
  const [draftScadenza, setDraftScadenza] = useState("");
  const [draftIban, setDraftIban] = useState("");
  const [draftMp, setDraftMp] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Esponi hasPendingChanges al parent (pattern SchedaVino)
  useImperativeHandle(ref, () => ({
    hasPendingChanges: () => editingScadenza || editingIban || editingMp,
  }));

  const showToast = (msg, kind = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const refetch = async () => {
    try {
      const res = await apiFetch(`${FE}/fatture/${id}`);
      if (!res.ok) throw new Error("refresh failed");
      const j = await res.json();
      setFattura(j);
      if (onFatturaUpdated) onFatturaUpdated(j);
    } catch (e) {
      console.error("refresh:", e);
    }
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setError(null);
      // reset editing state quando cambio fattura
      setEditingScadenza(false);
      setEditingIban(false);
      setEditingMp(false);
      try {
        const res = await apiFetch(`${FE}/fatture/${id}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Fattura non trovata");
        }
        setFattura(await res.json());
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Save helpers per i tre dispatcher v2.0 ──
  const saveScadenza = async () => {
    if (!fattura?.uscita?.uscita_id || !draftScadenza) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${CG}/uscite/${fattura.uscita.uscita_id}/scadenza`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_scadenza: draftScadenza }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Errore");
      showToast("Scadenza aggiornata");
      setEditingScadenza(false);
      await refetch();
    } catch (e) {
      showToast(e.message || "Errore di rete", "err");
    } finally {
      setSaving(false);
    }
  };

  const saveIban = async () => {
    if (!fattura?.uscita?.uscita_id) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${CG}/uscite/${fattura.uscita.uscita_id}/iban`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iban: draftIban || null }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Errore");
      showToast(draftIban ? "IBAN aggiornato" : "Override IBAN rimosso");
      setEditingIban(false);
      await refetch();
    } catch (e) {
      showToast(e.message || "Errore di rete", "err");
    } finally {
      setSaving(false);
    }
  };

  const saveMp = async () => {
    if (!fattura?.uscita?.uscita_id) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${CG}/uscite/${fattura.uscita.uscita_id}/modalita-pagamento`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modalita_pagamento: draftMp || null }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Errore");
      showToast(draftMp ? "Modalità aggiornata" : "Override modalità rimosso");
      setEditingMp(false);
      await refetch();
    } catch (e) {
      showToast(e.message || "Errore di rete", "err");
    } finally {
      setSaving(false);
    }
  };

  // Nav alla spesa fissa rateizzata — in modalità inline chiude prima lo split
  const goToSpesaFissa = (sfId) => {
    if (inline && onClose) onClose();
    navigate(`/controllo-gestione/spese-fisse?highlight=${sfId}`);
  };

  // Nav all'anagrafica del fornitore — porta direttamente all'elenco fornitori
  // con il fornitore corrente già aperto (useSearchParams ?piva=xxx)
  const goToFornitoreAnagrafica = () => {
    if (!fattura?.fornitore_piva) return;
    if (inline && onClose) onClose();
    navigate(`/acquisti/fornitori?piva=${encodeURIComponent(fattura.fornitore_piva)}`);
  };

  // Wrapper per "Segna pagata": chiama callback del parent poi refresh locale
  const handleSegnaPagata = async () => {
    if (!onSegnaPagata || !fattura?.id) return;
    try {
      await onSegnaPagata(fattura.id);
      await refetch();
    } catch (e) {
      console.error("segnaPagata:", e);
    }
  };

  // ── Wrapper loading / error (shape identico a SchedaVino) ──
  const wrapperClass = `${inline ? "rounded-2xl shadow-lg" : "rounded-3xl shadow-2xl"} overflow-hidden border border-neutral-200 bg-white`;
  const gridHeight = { height: inline ? "78vh" : "88vh" };

  if (loading) {
    const loadingBody = (
      <div className={wrapperClass}>
        <div className="bg-white px-8 py-6">
          <p className="text-sm text-neutral-500">Caricamento fattura…</p>
        </div>
      </div>
    );
    if (inline) return loadingBody;
    return (
      <div className="min-h-screen bg-neutral-100 font-sans">
        <FattureNav current="elenco" />
        <div className="max-w-6xl mx-auto p-4 sm:p-6">{loadingBody}</div>
      </div>
    );
  }

  if (error || !fattura) {
    const errorBody = (
      <div className={wrapperClass}>
        <div className="bg-white px-8 py-6 text-center">
          <p className="text-sm text-red-600 font-medium mb-4">{error || "Fattura non trovata"}</p>
          {inline && onClose ? (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-white hover:bg-neutral-50 transition"
            >
              ← Chiudi
            </button>
          ) : (
            <button
              onClick={() => navigate("/acquisti/elenco")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-white hover:bg-neutral-50 transition"
            >
              ← Torna all'elenco
            </button>
          )}
        </div>
      </div>
    );
    if (inline) return errorBody;
    return (
      <div className="min-h-screen bg-neutral-100 font-sans">
        <FattureNav current="elenco" />
        <div className="max-w-6xl mx-auto p-4 sm:p-6">{errorBody}</div>
      </div>
    );
  }

  const righe = fattura.righe || [];
  const totaleRighe = righe.reduce((s, r) => s + (r.prezzo_totale || 0), 0);

  // Valori "effettivi" v2.0 (già calcolati dal backend)
  const scadenzaEff = fattura.data_scadenza_effettiva;
  const scadenzaXml = fattura.data_scadenza_xml;
  const hasScadenzaOverride = !!fattura.data_prevista_pagamento && fattura.data_prevista_pagamento !== scadenzaXml;
  const ibanEff = fattura.iban_effettivo;
  const hasIbanOverride = !!fattura.iban_beneficiario;
  const mpEff = fattura.modalita_pagamento_effettiva;
  const mpLabel = mpEff ? (MP_LABELS[mpEff] || mpEff) : null;
  const hasMpOverride = !!fattura.modalita_pagamento_override;
  const isRateizzata = fattura.is_rateizzata;
  const uscita = fattura.uscita;
  const statoUscita = uscita?.uscita_stato || (fattura.pagato ? "PAGATA" : null);
  const statoBadgeClass = statoUscita ? STATO_BADGE[statoUscita] || "bg-neutral-100 text-neutral-700 border-neutral-200" : null;
  const sbc = getFatturaSidebar(statoUscita, isRateizzata);

  // ─────────────────────────────────────────────────────────────────────
  // CORPO del dettaglio con layout sidebar + main (uniformato a SchedaVino)
  // ─────────────────────────────────────────────────────────────────────
  const body = (
    <div className={wrapperClass}>
      {/* TOAST */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
          toast.kind === "err" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]" style={gridHeight}>

        {/* ═══════════ SIDEBAR ═══════════ */}
        <div className={`${sbc.bg} text-white flex flex-col h-full`}>

          {/* Header fisso */}
          <div className="p-4 pb-3">
            <p className="text-[9px] opacity-60 uppercase tracking-wider mb-0.5">Fornitore</p>
            <h2 className="text-base font-bold leading-tight font-playfair">
              {fattura.fornitore_nome || "—"}
            </h2>
            {fattura.fornitore_piva && (
              <p className="text-[10px] opacity-70 mt-0.5 font-mono">P.IVA {fattura.fornitore_piva}</p>
            )}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="inline-flex items-center bg-white/20 text-[10px] font-bold px-2 py-0.5 rounded font-mono">
                FT {fattura.numero_fattura || `#${fattura.id}`}
              </span>
              {fattura.data_fattura && (
                <span className="inline-flex items-center bg-white/10 text-[10px] px-2 py-0.5 rounded">
                  {fattura.data_fattura}
                </span>
              )}
            </div>
          </div>

          {/* Contenuto scrollabile */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">

            {/* Stats 2x2 */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className={`${sbc.accent} rounded-lg p-2.5 text-center col-span-2`}>
                <div className="text-[8px] uppercase opacity-60 tracking-wider">Totale fattura</div>
                <div className="text-2xl font-bold font-playfair tabular-nums">
                  € {fmt(fattura.totale_fattura)}
                </div>
              </div>
              <div className={`${sbc.accent} rounded-lg p-2 text-center`}>
                <div className="text-[8px] uppercase opacity-60 tracking-wider">Imponibile</div>
                <div className="text-sm font-bold tabular-nums">
                  € {fmt(fattura.imponibile_totale)}
                </div>
              </div>
              <div className={`${sbc.accent} rounded-lg p-2 text-center`}>
                <div className="text-[8px] uppercase opacity-60 tracking-wider">IVA</div>
                <div className="text-sm font-bold tabular-nums">
                  € {fmt(fattura.iva_totale)}
                </div>
              </div>
            </div>

            {/* Stato + badge */}
            {(statoUscita || isRateizzata) && (
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                {statoUscita && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 border border-white/30">
                    {statoUscita}
                  </span>
                )}
                {isRateizzata && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 border border-white/30">
                    Rateizzata
                  </span>
                )}
                {uscita?.batch_titolo && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/15 border border-white/20">
                    Batch: {uscita.batch_titolo}
                  </span>
                )}
              </div>
            )}

            {/* Info list */}
            <ul className="text-[11px] space-y-0 mb-3">
              {[
                ["Scadenza eff.", scadenzaEff],
                hasScadenzaOverride ? ["Scadenza XML", scadenzaXml] : null,
                ["Mod. pagamento", mpEff ? (mpLabel && mpLabel !== mpEff ? `${mpEff} — ${mpLabel}` : mpEff) : null],
                ["Pagata il", fattura.data_effettiva_pagamento || uscita?.data_pagamento],
                uscita?.metodo_pagamento ? ["Metodo", uscita.metodo_pagamento] : null,
                ["Importato il", fattura.data_import],
                ["ID interno", fattura.id],
              ].filter(Boolean).map(([label, val]) => (
                <li key={label} className="flex justify-between py-1.5 border-b border-white/10 gap-2">
                  <span className="opacity-60 flex-shrink-0">{label}</span>
                  <span className="font-medium text-right truncate">{val || "—"}</span>
                </li>
              ))}
            </ul>

            {/* IBAN full-width (può essere lungo) */}
            {ibanEff && (
              <div className="mb-3 pb-2 border-b border-white/10">
                <div className="text-[9px] opacity-60 uppercase tracking-wider mb-0.5">IBAN beneficiario</div>
                <div className="text-[10px] font-mono font-semibold break-all">{ibanEff}</div>
                {hasIbanOverride && (
                  <div className="text-[8px] opacity-60 mt-0.5">override attivo</div>
                )}
              </div>
            )}

            {/* Azioni sidebar */}
            <div className="space-y-2">
              {/* Segna pagata — visibile solo se il parent passa onSegnaPagata
                  e la fattura non risulta già pagata */}
              {onSegnaPagata && !fattura.pagato && statoUscita !== "PAGATA" && !isRateizzata && (
                <button
                  type="button"
                  onClick={handleSegnaPagata}
                  className="w-full px-3 py-2 rounded-lg text-[11px] font-bold bg-amber-400/90 text-amber-950 hover:bg-amber-300 transition text-center shadow-sm"
                >
                  ✓ Segna pagata
                </button>
              )}

              {/* Modifica anagrafica fornitore */}
              {fattura.fornitore_piva && (
                <button
                  type="button"
                  onClick={goToFornitoreAnagrafica}
                  className="w-full px-3 py-2 rounded-lg text-[10px] font-semibold bg-white/10 hover:bg-white/20 transition text-center"
                  title="Apri l'anagrafica del fornitore nell'elenco fornitori"
                >
                  ✎ Modifica anagrafica fornitore →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════ MAIN CONTENT ═══════════ */}
        <div className="bg-white overflow-y-auto">

          {/* ── PAGAMENTI & SCADENZE ── */}
          <div className="border-b border-neutral-200">
            <SectionHeader title="Pagamenti & Scadenze">
              {statoBadgeClass && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statoBadgeClass}`}>
                  {statoUscita}
                </span>
              )}
              {isRateizzata && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-purple-100 text-purple-800 border-purple-200">
                  Rateizzata
                </span>
              )}
              {uscita?.batch_titolo && (
                <span className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1">
                  Batch: <span className="font-semibold">{uscita.batch_titolo}</span> ({uscita.batch_stato})
                </span>
              )}
            </SectionHeader>

            <div className={`p-5 ${isRateizzata ? "bg-purple-50/40" : ""}`}>
              {isRateizzata && (
                <div className="mb-4 p-3 bg-purple-100/60 border border-purple-300 rounded-lg text-sm text-purple-900">
                  Questa fattura è stata rateizzata nella spesa fissa{" "}
                  <span className="font-semibold">{fattura.rateizzata_sf_titolo || `#${fattura.rateizzata_in_spesa_fissa_id}`}</span>.
                  Le uscite effettive vivono nel piano rate di quella spesa fissa — la modifica di scadenza/IBAN/modalità qui non ha effetto diretto sulle rate.
                  <button
                    type="button"
                    onClick={() => goToSpesaFissa(fattura.rateizzata_in_spesa_fissa_id)}
                    className="ml-2 underline font-medium hover:text-purple-700"
                  >
                    Vai alla spesa fissa →
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* SCADENZA */}
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Scadenza effettiva</p>
                    {hasScadenzaOverride && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">override</span>
                    )}
                  </div>
                  {editingScadenza ? (
                    <div className="space-y-2">
                      <input
                        type="date"
                        value={draftScadenza}
                        onChange={(e) => setDraftScadenza(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveScadenza}
                          disabled={saving || !draftScadenza}
                          className="flex-1 px-2 py-1 text-xs font-medium bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
                        >
                          Salva
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingScadenza(false)}
                          className="px-2 py-1 text-xs border border-neutral-300 rounded hover:bg-neutral-100"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold text-neutral-900 tabular-nums">{scadenzaEff || "—"}</p>
                      {hasScadenzaOverride && scadenzaXml && (
                        <p className="text-[10px] text-neutral-400 mt-0.5">XML: <span className="tabular-nums">{scadenzaXml}</span></p>
                      )}
                      {!isRateizzata && uscita?.uscita_id && statoUscita !== "PAGATA" && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftScadenza(scadenzaEff || "");
                            setEditingScadenza(true);
                          }}
                          className="mt-2 text-[10px] text-teal-700 hover:text-teal-900 font-medium underline"
                        >
                          Modifica
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* MODALITÀ PAGAMENTO */}
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Modalità pagamento</p>
                    {hasMpOverride && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">override</span>
                    )}
                  </div>
                  {editingMp ? (
                    <div className="space-y-2">
                      <select
                        value={draftMp}
                        onChange={(e) => setDraftMp(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-400"
                      >
                        {MP_OPTIONS.map((o) => (
                          <option key={o.code || "_empty"} value={o.code}>{o.label}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveMp}
                          disabled={saving}
                          className="flex-1 px-2 py-1 text-xs font-medium bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
                        >
                          Salva
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingMp(false)}
                          className="px-2 py-1 text-xs border border-neutral-300 rounded hover:bg-neutral-100"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold text-neutral-900">{mpEff || "—"}</p>
                      {mpLabel && mpLabel !== mpEff && (
                        <p className="text-[10px] text-neutral-500 mt-0.5">{mpLabel}</p>
                      )}
                      {hasMpOverride && fattura.modalita_pagamento_xml && (
                        <p className="text-[10px] text-neutral-400 mt-0.5">XML: {fattura.modalita_pagamento_xml}</p>
                      )}
                      {!isRateizzata && uscita?.uscita_id && statoUscita !== "PAGATA" && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftMp(fattura.modalita_pagamento_override || "");
                            setEditingMp(true);
                          }}
                          className="mt-2 text-[10px] text-teal-700 hover:text-teal-900 font-medium underline"
                        >
                          Modifica
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* IBAN */}
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">IBAN beneficiario</p>
                    {hasIbanOverride && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">override</span>
                    )}
                  </div>
                  {editingIban ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={draftIban}
                        onChange={(e) => setDraftIban(e.target.value.toUpperCase().replace(/\s/g, ""))}
                        placeholder="IT60X..."
                        className="w-full px-2 py-1 text-xs font-mono border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveIban}
                          disabled={saving}
                          className="flex-1 px-2 py-1 text-xs font-medium bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
                        >
                          Salva
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingIban(false)}
                          className="px-2 py-1 text-xs border border-neutral-300 rounded hover:bg-neutral-100"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-mono font-semibold text-neutral-900 break-all">{ibanEff || "—"}</p>
                      {hasIbanOverride && fattura.iban_fornitore && fattura.iban_fornitore !== ibanEff && (
                        <p className="text-[9px] text-neutral-400 mt-0.5 font-mono break-all">Fornitore: {fattura.iban_fornitore}</p>
                      )}
                      {!isRateizzata && uscita?.uscita_id && statoUscita !== "PAGATA" && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftIban(fattura.iban_beneficiario || "");
                            setEditingIban(true);
                          }}
                          className="mt-2 text-[10px] text-teal-700 hover:text-teal-900 font-medium underline"
                        >
                          Modifica
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Info pagamento effettivo / riconciliazione */}
              {(fattura.data_effettiva_pagamento || uscita?.data_pagamento || uscita?.banca_movimento_id) && (
                <div className="mt-4 pt-3 border-t border-neutral-200 text-xs text-neutral-600 flex gap-4 flex-wrap">
                  {(fattura.data_effettiva_pagamento || uscita?.data_pagamento) && (
                    <span>
                      Pagata il: <span className="font-semibold text-neutral-900">{fattura.data_effettiva_pagamento || uscita?.data_pagamento}</span>
                    </span>
                  )}
                  {uscita?.metodo_pagamento && (
                    <span>
                      Metodo: <span className="font-semibold text-neutral-900">{uscita.metodo_pagamento}</span>
                    </span>
                  )}
                  {uscita?.banca_movimento_id && (
                    <span className="text-emerald-700">✓ Riconciliata con banca</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHE FATTURA ── */}
          <div>
            <SectionHeader title={`Righe fattura (${righe.length})`}>
              <span className="text-xs text-neutral-400">
                Totale righe: € {fmt(totaleRighe)}
              </span>
            </SectionHeader>

            {righe.length === 0 ? (
              <div className="text-center py-10 text-neutral-400 text-sm">
                Nessuna riga presente per questa fattura
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium w-8">#</th>
                      <th className="px-4 py-2 text-left font-medium">Descrizione</th>
                      <th className="px-4 py-2 text-right font-medium">Q.tà</th>
                      <th className="px-4 py-2 text-right font-medium">U.M.</th>
                      <th className="px-4 py-2 text-right font-medium">Prezzo Unit.</th>
                      <th className="px-4 py-2 text-right font-medium">Totale</th>
                      <th className="px-4 py-2 text-right font-medium">IVA %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {righe.map((r, i) => (
                      <tr key={r.id || i} className="border-b border-neutral-100 hover:bg-neutral-50/50">
                        <td className="px-4 py-2 text-neutral-400 tabular-nums">{r.numero_linea || i + 1}</td>
                        <td className="px-4 py-2 text-neutral-800 font-medium">
                          <div className="max-w-md">
                            {r.descrizione || "-"}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-neutral-700">
                          {r.quantita != null ? fmt(r.quantita) : "-"}
                        </td>
                        <td className="px-4 py-2 text-right text-neutral-500">{r.unita_misura || ""}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-neutral-700">
                          {r.prezzo_unitario != null ? `€ ${fmt(r.prezzo_unitario)}` : "-"}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-neutral-900">
                          {r.prezzo_totale != null ? `€ ${fmt(r.prezzo_totale)}` : "-"}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-neutral-500">
                          {r.aliquota_iva != null ? `${r.aliquota_iva}%` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-teal-50/50 border-t-2 border-teal-200">
                      <td colSpan={5} className="px-4 py-2 text-right text-xs font-bold text-teal-900 uppercase tracking-wide">
                        Totale righe
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-bold text-teal-900 text-sm">
                        € {fmt(totaleRighe)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );

  // ── Rendering INLINE (dentro ControlloGestioneUscite) ──
  if (inline) return body;

  // ── Rendering STANDALONE (pagina /acquisti/dettaglio/:id) ──
  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="elenco" />
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* BACK */}
        <button
          onClick={() => fromScadenzario ? navigate("/controllo-gestione/uscite") : navigate(-1)}
          className="text-xs text-neutral-500 hover:text-teal-700 mb-3 transition"
        >
          ← {fromScadenzario ? "Torna allo Scadenzario" : "Torna indietro"}
        </button>
        {body}
      </div>
    </div>
  );
});

export default FattureDettaglio;
