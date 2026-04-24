// @version: v3.0-tabs — Redesign sessione 56 (2026-04-25): testa fissa colorata
// soft + 4 KPI (Totale/Imponibile/IVA/Da pagare) + 3 tab (Riepilogo/Pagamenti/Righe)
// al posto della vecchia sidebar scura. Aggiunta prop `breadcrumb` opzionale per
// l'apertura via FattureFornitoriElenco senza nesting matrioska.
// Componente riutilizzabile: dettaglio fattura singola. Usato come pagina
// standalone (route /acquisti/dettaglio/:id) e inline dentro FattureElenco,
// FattureFornitoriElenco (con breadcrumb), ControlloGestioneUscite.
import React, { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";
import Tooltip from "../../components/Tooltip";
import { Btn } from "../../components/ui";

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

// Palette "soft" per la testa del nuovo layout a tab (sessione 55, redesign).
// Affianca FATTURA_SIDEBAR (palette scura) ma e' il nuovo default.
const FATTURA_HEADER = {
  PAGATA:         { bg: "bg-gradient-to-b from-emerald-50 to-white", border: "border-emerald-200", accent: "border-l-emerald-600", badge: "bg-emerald-100 text-emerald-800 border-emerald-200", text: "text-emerald-900" },
  PAGATA_MANUALE: { bg: "bg-gradient-to-b from-teal-50 to-white",    border: "border-teal-200",    accent: "border-l-teal-600",    badge: "bg-teal-100 text-teal-800 border-teal-200",       text: "text-teal-900" },
  DA_PAGARE:      { bg: "bg-gradient-to-b from-amber-50 to-white",   border: "border-amber-200",   accent: "border-l-amber-600",   badge: "bg-amber-100 text-amber-800 border-amber-200",    text: "text-amber-900" },
  SCADUTA:        { bg: "bg-gradient-to-b from-red-50 to-white",     border: "border-red-200",     accent: "border-l-red-600",     badge: "bg-red-100 text-red-800 border-red-200",          text: "text-red-900" },
  PARZIALE:       { bg: "bg-gradient-to-b from-blue-50 to-white",    border: "border-blue-200",    accent: "border-l-blue-600",    badge: "bg-blue-100 text-blue-800 border-blue-200",       text: "text-blue-900" },
  RATEIZZATA:     { bg: "bg-gradient-to-b from-purple-50 to-white",  border: "border-purple-200",  accent: "border-l-purple-600",  badge: "bg-purple-100 text-purple-800 border-purple-200", text: "text-purple-900" },
  DEFAULT:        { bg: "bg-gradient-to-b from-slate-50 to-white",   border: "border-slate-200",   accent: "border-l-slate-600",   badge: "bg-slate-100 text-slate-700 border-slate-200",    text: "text-slate-900" },
};

function getFatturaHeader(stato, isRateizzata) {
  if (isRateizzata) return FATTURA_HEADER.RATEIZZATA;
  return FATTURA_HEADER[stato] || FATTURA_HEADER.DEFAULT;
}

// Linguette del nuovo layout a tab (sessione 55).
const TABS = [
  { key: "riepilogo",  label: "Riepilogo" },
  { key: "pagamenti",  label: "Pagamenti" },
  { key: "righe",      label: "Righe" },
];

// Calcolo dei giorni mancanti/trascorsi rispetto a una data ISO (YYYY-MM-DD).
// Ritorna null se la data non e' valida.
function daysFromToday(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
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
  { fatturaId: fatturaIdProp, inline = false, onClose, onFatturaUpdated, onSegnaPagata, breadcrumb = null } = {},
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

  // Tab attiva (sessione 55: layout testa fissa + linguette)
  const [activeTab, setActiveTab] = useState("riepilogo");
  const handleChangeTab = (newTab) => {
    if (newTab === activeTab) return;
    if (editingScadenza || editingIban || editingMp) {
      if (!window.confirm("Hai modifiche non salvate. Vuoi davvero cambiare sezione?")) return;
      setEditingScadenza(false);
      setEditingIban(false);
      setEditingMp(false);
    }
    setActiveTab(newTab);
  };

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
      <div className="min-h-screen bg-brand-cream font-sans">
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
      <div className="min-h-screen bg-brand-cream font-sans">
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
  // CORPO del dettaglio — layout testa fissa + linguette (sessione 55)
  // ─────────────────────────────────────────────────────────────────────
  const hdr = getFatturaHeader(statoUscita, isRateizzata);

  // "Giorni alla scadenza" per il KPI in testa: negativo = scaduta, 0 = oggi.
  const gg = daysFromToday(scadenzaEff);
  const ggLabel = fattura.pagato || statoUscita === "PAGATA" || statoUscita === "PAGATA_MANUALE"
    ? "Pagata"
    : isRateizzata
      ? "Rateizzata"
      : gg == null
        ? "—"
        : gg < 0
          ? `scaduta ${Math.abs(gg)} gg`
          : gg === 0
            ? "oggi"
            : `${gg} gg`;
  const ggClass =
    (fattura.pagato || statoUscita === "PAGATA" || statoUscita === "PAGATA_MANUALE") ? "text-emerald-700" :
    isRateizzata                              ? "text-purple-700" :
    gg == null                                ? "text-neutral-400" :
    gg < 0                                    ? "text-red-700"    :
    gg <= 7                                   ? "text-amber-700"  :
                                                "text-neutral-900";

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

      <div className={`flex flex-col border-l-4 ${hdr.accent}`} style={gridHeight}>

        {/* ═══════════ BREADCRUMB (solo se passato dal parent — anti-matrioska) ═══════════ */}
        {Array.isArray(breadcrumb) && breadcrumb.length > 0 && (
          <div className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-cream border-b border-neutral-200 flex-shrink-0 overflow-x-auto">
            <div className="flex items-center gap-1.5 text-xs min-w-0">
              {breadcrumb.map((b, i) => {
                const last = i === breadcrumb.length - 1;
                return (
                  <React.Fragment key={i}>
                    {b.onClick && !last ? (
                      <button type="button" onClick={b.onClick}
                        className="px-2 py-1 rounded-md bg-white border border-neutral-300 hover:bg-neutral-50 transition whitespace-nowrap font-medium text-neutral-700">
                        {b.label}
                      </button>
                    ) : (
                      <span className={`px-2 py-1 rounded-md font-medium whitespace-nowrap ${
                        last ? `${hdr.badge} border` : "text-neutral-600"
                      }`}>
                        {b.label}
                      </span>
                    )}
                    {!last && <span className="text-neutral-400 flex-shrink-0">›</span>}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════ TESTA: identita + 4 KPI ═══════════ */}
        <div className={`${hdr.bg} border-b ${hdr.border} px-4 md:px-5 py-3 md:py-4 flex-shrink-0`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Badge identita + stato */}
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-neutral-900 text-white">
                  FT {fattura.numero_fattura || `#${fattura.id}`}
                </span>
                {statoUscita && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${hdr.badge}`}>
                    {statoUscita}
                  </span>
                )}
                {isRateizzata && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-purple-100 text-purple-800 border-purple-200">
                    Rateizzata
                  </span>
                )}
                {uscita?.batch_titolo && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-indigo-100 text-indigo-800 border-indigo-200">
                    Batch: {uscita.batch_titolo}
                  </span>
                )}
                {uscita?.banca_movimento_id && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-emerald-100 text-emerald-800 border-emerald-200">
                    ✓ Riconciliata
                  </span>
                )}
              </div>
              {/* Titolo: fornitore */}
              <h2 className={`text-base md:text-lg font-bold leading-tight ${hdr.text}`}>
                {fattura.fornitore_nome || "—"}
              </h2>
              {/* Sottotitolo: p.iva · data fattura · scadenza */}
              <p className="text-xs text-neutral-600 mt-0.5 flex flex-wrap gap-x-1.5">
                {fattura.fornitore_piva && <span className="font-mono">P.IVA {fattura.fornitore_piva}</span>}
                {fattura.data_fattura && <><span>·</span><span>emessa {fattura.data_fattura}</span></>}
                {scadenzaEff && <><span>·</span><span>scad. {scadenzaEff}</span></>}
              </p>
            </div>
            {onClose && !Array.isArray(breadcrumb) && (
              <button type="button" onClick={onClose} aria-label="Chiudi dettaglio"
                className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition text-sm font-semibold">
                ✕
              </button>
            )}
          </div>

          {/* 4 KPI sempre visibili — 2x2 su portrait, 1x4 da md */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mt-3">
            <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Totale</div>
              <div className="text-lg md:text-xl font-bold text-neutral-900 tabular-nums">€ {fmt(fattura.totale_fattura)}</div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Imponibile</div>
              <div className="text-lg md:text-xl font-bold text-neutral-900 tabular-nums">€ {fmt(fattura.imponibile_totale)}</div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide">IVA</div>
              <div className="text-lg md:text-xl font-bold text-neutral-900 tabular-nums">€ {fmt(fattura.iva_totale)}</div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Da pagare</div>
              <div className={`text-lg md:text-xl font-bold ${ggClass}`}>{ggLabel}</div>
            </div>
          </div>
        </div>

        {/* ═══════════ TAB BAR ═══════════ */}
        <div className="flex gap-1 px-2 md:px-4 border-b border-neutral-200 bg-white overflow-x-auto flex-shrink-0">
          {TABS.map(tab => {
            const active = activeTab === tab.key;
            const c = tab.key === "righe" && righe.length > 0 ? righe.length : null;
            return (
              <button key={tab.key} type="button" onClick={() => handleChangeTab(tab.key)}
                className={`px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-medium transition whitespace-nowrap flex-shrink-0 ${
                  active
                    ? "text-neutral-900 border-b-2 border-brand-blue -mb-px"
                    : "text-neutral-500 hover:text-neutral-800"
                }`}>
                {tab.label}
                {c != null && <span className="ml-1.5 text-[10px] font-normal text-neutral-400">{c}</span>}
              </button>
            );
          })}
        </div>

        {/* ═══════════ TAB CONTENT ═══════════ */}
        <div className="flex-1 overflow-y-auto bg-white">

          {/* ── RIEPILOGO (nuovo, sessione 55) ── */}
          {activeTab === "riepilogo" && (
          <div className="p-5 space-y-5">
            {isRateizzata && (
              <div className="p-3 bg-purple-100/60 border border-purple-300 rounded-lg text-sm text-purple-900">
                Questa fattura è stata rateizzata nella spesa fissa{" "}
                <span className="font-semibold">{fattura.rateizzata_sf_titolo || `#${fattura.rateizzata_in_spesa_fissa_id}`}</span>.
                Le uscite effettive vivono nel piano rate di quella spesa fissa.
                <button type="button" onClick={() => goToSpesaFissa(fattura.rateizzata_in_spesa_fissa_id)}
                  className="ml-2 underline font-medium hover:text-purple-700">
                  Vai alla spesa fissa →
                </button>
              </div>
            )}

            {/* Dati testata — read only */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Scadenza effettiva</div>
                <div className="text-sm font-semibold text-neutral-900 tabular-nums">{scadenzaEff || "—"}</div>
                {hasScadenzaOverride && scadenzaXml && (
                  <div className="text-[10px] text-neutral-400 mt-0.5">XML: <span className="tabular-nums">{scadenzaXml}</span></div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Modalità pagamento</div>
                <div className="text-sm font-semibold text-neutral-900">{mpEff || "—"}</div>
                {mpLabel && mpLabel !== mpEff && <div className="text-[10px] text-neutral-500 mt-0.5">{mpLabel}</div>}
              </div>
              <div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Pagata il</div>
                <div className="text-sm font-semibold text-neutral-900 tabular-nums">{fattura.data_effettiva_pagamento || uscita?.data_pagamento || "—"}</div>
                {uscita?.metodo_pagamento && <div className="text-[10px] text-neutral-500 mt-0.5">Metodo: {uscita.metodo_pagamento}</div>}
              </div>
            </div>

            {/* IBAN full-width */}
            {ibanEff && (
              <div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">IBAN beneficiario</div>
                <div className="text-sm font-mono font-semibold text-neutral-900 break-all">{ibanEff}</div>
                {hasIbanOverride && <div className="text-[10px] text-amber-700 mt-0.5">override attivo</div>}
              </div>
            )}

            {/* Info meta */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-neutral-100">
              <div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Importato il</div>
                <div className="text-xs text-neutral-700 tabular-nums">{fattura.data_import || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">ID interno</div>
                <div className="text-xs text-neutral-700 font-mono">{fattura.id}</div>
              </div>
              {uscita?.batch_titolo && (
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Batch</div>
                  <div className="text-xs text-neutral-700">{uscita.batch_titolo} <span className="text-neutral-400">({uscita.batch_stato})</span></div>
                </div>
              )}
            </div>

            {/* Link rapido: anagrafica fornitore */}
            {fattura.fornitore_piva && (
              <div className="pt-3 border-t border-neutral-100">
                <button type="button" onClick={goToFornitoreAnagrafica}
                  className="text-xs font-semibold text-brand-blue hover:underline">
                  ✎ Modifica anagrafica fornitore →
                </button>
              </div>
            )}
          </div>
          )}

          {/* ── PAGAMENTI & SCADENZE ── */}
          {activeTab === "pagamenti" && (
          <div>
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

          )}

          {/* ── RIGHE FATTURA ── */}
          {activeTab === "righe" && (
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
          )}

        </div>

        {/* ═══════════ FOOTER AZIONI ═══════════ */}
        <div className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-cream border-t border-neutral-200 flex-shrink-0 flex-wrap">
          {onSegnaPagata && !fattura.pagato && statoUscita !== "PAGATA" && !isRateizzata && (
            <Btn variant="primary" size="md" type="button" onClick={handleSegnaPagata}>
              ✓ Segna pagata
            </Btn>
          )}
          {fattura.fornitore_piva && (
            <Tooltip label="Apri l'anagrafica del fornitore nell'elenco fornitori">
              <Btn variant="secondary" size="md" type="button" onClick={goToFornitoreAnagrafica}>
                ✎ Modifica anagrafica fornitore
              </Btn>
            </Tooltip>
          )}
          <span className="flex-1" />
          {onClose && (
            <Btn variant="secondary" size="md" type="button" onClick={onClose}>
              Chiudi
            </Btn>
          )}
        </div>

      </div>
    </div>
  );

  // ── Rendering INLINE (dentro ControlloGestioneUscite) ──
  if (inline) return body;

  // ── Rendering STANDALONE (pagina /acquisti/dettaglio/:id) ──
  return (
    <div className="min-h-screen bg-brand-cream font-sans">
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
