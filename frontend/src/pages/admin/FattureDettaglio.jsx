// @version: v3.1-3D — Modello 3-dimensioni (2026-05-18, vedi §15)
// v3.1: zona chip header e tab Pagamenti riscritte secondo modello D1/D2/D3:
//   - D1+D2 stato pagamento via <StatoPagamentoBadge>
//   - D3 stato scadenza via <StatoScadenzaBadge> (nuovo componente)
//   - Tolti chip duplicati ("CG: PROGRAMMATO" + "Rateizzata" sparsi + raw uppercase)
//   - STATO_BADGE dict rimosso (sostituito dai componenti badge)
// v3.0-tabs (2026-04-25): testa fissa colorata soft + 4 KPI + 3 tab.
// Aggiunta prop `breadcrumb` opzionale per FattureFornitoriElenco anti-matrioska.
// Componente riutilizzabile: dettaglio fattura singola. Usato come pagina
// standalone (route /acquisti/dettaglio/:id) e inline dentro FattureElenco,
// FattureFornitoriElenco (con breadcrumb), ControlloGestioneUscite.
import React, { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";
import Tooltip from "../../components/Tooltip";
import { Btn } from "../../components/ui";
import StatoPagamentoBadge from "../../components/StatoPagamentoBadge";
import StatoScadenzaBadge, { deriveStatoScadenza, giorniLabel } from "../../components/StatoScadenzaBadge";
import { isChiuso } from "../../utils/statoPagamento";

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

// STATO_BADGE rimosso 2026-05-18 — sostituito da <StatoPagamentoBadge> + <StatoScadenzaBadge>
// che applicano il modello 3D (vedi docs/stato_pagamento_unificato.md §15).

// Sidebar colors in base allo stato fattura — stesso stile di TIPOLOGIA_SIDEBAR in SchedaVino
const FATTURA_SIDEBAR = {
  PAGATO:         { bg: "bg-gradient-to-b from-emerald-700 to-emerald-900",  accent: "bg-emerald-500/30", text: "text-emerald-100" },
  PAGATO_MANUALE: { bg: "bg-gradient-to-b from-teal-700 to-teal-900",        accent: "bg-teal-500/30",    text: "text-teal-100" },
  PROGRAMMATO:      { bg: "bg-gradient-to-b from-amber-700 to-amber-900",      accent: "bg-amber-500/30",   text: "text-amber-100" },
  SCADUTO:        { bg: "bg-gradient-to-b from-red-700 to-red-900",          accent: "bg-red-500/30",     text: "text-red-100" },
  PARZIALE:       { bg: "bg-gradient-to-b from-blue-700 to-blue-900",        accent: "bg-blue-500/30",    text: "text-blue-100" },
  RATEIZZATO:     { bg: "bg-gradient-to-b from-purple-700 to-purple-900",    accent: "bg-purple-500/30",  text: "text-purple-100" },
  DEFAULT:        { bg: "bg-gradient-to-b from-slate-700 to-slate-900",      accent: "bg-slate-500/30",   text: "text-slate-100" },
};

function getFatturaSidebar(stato, isRateizzata) {
  if (isRateizzata) return FATTURA_SIDEBAR.RATEIZZATO;
  return FATTURA_SIDEBAR[stato] || FATTURA_SIDEBAR.DEFAULT;
}

// Palette "soft" per la testa del nuovo layout a tab (sessione 55, redesign).
// Affianca FATTURA_SIDEBAR (palette scura) ma e' il nuovo default.
const FATTURA_HEADER = {
  PAGATO:         { bg: "bg-gradient-to-b from-emerald-50 to-white", border: "border-emerald-200", accent: "border-l-emerald-600", badge: "bg-emerald-100 text-emerald-800 border-emerald-200", text: "text-emerald-900" },
  PAGATO_MANUALE: { bg: "bg-gradient-to-b from-teal-50 to-white",    border: "border-teal-200",    accent: "border-l-teal-600",    badge: "bg-teal-100 text-teal-800 border-teal-200",       text: "text-teal-900" },
  PROGRAMMATO:      { bg: "bg-gradient-to-b from-amber-50 to-white",   border: "border-amber-200",   accent: "border-l-amber-600",   badge: "bg-amber-100 text-amber-800 border-amber-200",    text: "text-amber-900" },
  SCADUTO:        { bg: "bg-gradient-to-b from-red-50 to-white",     border: "border-red-200",     accent: "border-l-red-600",     badge: "bg-red-100 text-red-800 border-red-200",          text: "text-red-900" },
  PARZIALE:       { bg: "bg-gradient-to-b from-blue-50 to-white",    border: "border-blue-200",    accent: "border-l-blue-600",    badge: "bg-blue-100 text-blue-800 border-blue-200",       text: "text-blue-900" },
  RATEIZZATO:     { bg: "bg-gradient-to-b from-purple-50 to-white",  border: "border-purple-200",  accent: "border-l-purple-600",  badge: "bg-purple-100 text-purple-800 border-purple-200", text: "text-purple-900" },
  DEFAULT:        { bg: "bg-gradient-to-b from-slate-50 to-white",   border: "border-slate-200",   accent: "border-l-slate-600",   badge: "bg-slate-100 text-slate-700 border-slate-200",    text: "text-slate-900" },
};

function getFatturaHeader(stato, isRateizzata) {
  if (isRateizzata) return FATTURA_HEADER.RATEIZZATO;
  return FATTURA_HEADER[stato] || FATTURA_HEADER.DEFAULT;
}

// Linguette del nuovo layout a tab (sessione 55, +CE in C.2 2026-05-18).
const TABS = [
  { key: "riepilogo",       label: "Riepilogo" },
  { key: "pagamenti",       label: "Pagamenti" },
  { key: "righe",           label: "Righe" },
  { key: "conto-economico", label: "Conto Economico" },
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
  { fatturaId: fatturaIdProp, inline = false, onClose, onFatturaUpdated, onSegnaPagata, onSegnaNonPagata, onCambiaStato, breadcrumb = null } = {},
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
  // C.2 (2026-05-18): dati CE-impatto, fetch lazy al primo click su tab "conto-economico"
  const [ceImpatto, setCeImpatto] = useState(null);
  const [ceLoading, setCeLoading] = useState(false);
  // C.2 (2026-05-18): lista categorie/sottocategorie per editor inline righe.
  // Fetch lazy al primo apertura tab CE (riusa endpoint di fe_categorie_router).
  const [categorie, setCategorie] = useState(null);
  const [savingRigaId, setSavingRigaId] = useState(null);
  const handleChangeTab = (newTab) => {
    if (newTab === activeTab) return;
    if (editingScadenza || editingIban || editingMp) {
      if (!window.confirm("Hai modifiche non salvate. Vuoi davvero cambiare sezione?")) return;
      setEditingScadenza(false);
      setEditingIban(false);
      setEditingMp(false);
    }
    setActiveTab(newTab);
    // C.2: fetch lazy dei dati CE-impatto al primo accesso al tab
    if (newTab === "conto-economico" && id && ceImpatto == null && !ceLoading) {
      setCeLoading(true);
      apiFetch(`${FE}/fatture/${id}/ce-impatto`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error("ce-impatto fetch failed")))
        .then(j => setCeImpatto(j))
        .catch(e => console.error("ce-impatto:", e))
        .finally(() => setCeLoading(false));
    }
    // C.2: fetch lazy della lista categorie/sottocategorie per editor inline
    if (newTab === "conto-economico" && categorie == null) {
      apiFetch(`${API_BASE}/contabilita/fe/categorie`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error("categorie fetch failed")))
        .then(j => setCategorie(Array.isArray(j) ? j : []))
        .catch(e => console.error("categorie:", e));
    }
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
      // C.2: reset cache ce-impatto (sarà ri-fetched al click sul tab)
      setCeImpatto(null);
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

  // Wrapper per "Segna NON pagata" — toggle inverso (2026-04-27)
  const handleSegnaNonPagata = async () => {
    if (!onSegnaNonPagata || !fattura?.id) return;
    try {
      await onSegnaNonPagata(fattura.id);
      await refetch();
    } catch (e) {
      console.error("segnaNonPagata:", e);
    }
  };

  // Modulo M.2 (2026-04-27): cambio stato pagamento esplicito
  const handleCambiaStato = async (nuovoStato) => {
    if (!onCambiaStato || !fattura?.id) return;
    try {
      await onCambiaStato(fattura.id, nuovoStato);
      await refetch();
    } catch (e) {
      console.error("cambiaStato:", e);
    }
  };

  // ─── C.2 (2026-05-18): handlers competenza P&L + spalmatura ───
  // Estratti dai bottoni inline del header (rimossi in C.2) — ora vivono
  // nel tab "Conto Economico" come azioni esplicite.
  const handleSpostaCompetenza = async () => {
    if (!fattura) return;
    const current = fattura.competenza_anno_mese;
    const promptMsg = current
      ? `Competenza attuale: ${current}\n\nNuovo mese di competenza P&L (formato YYYY-MM, vuoto per rimuovere e usare data fattura):`
      : `Data fattura: ${fattura.data_fattura}\n\nMese di competenza P&L (formato YYYY-MM, es. "2026-01" per spostare a gennaio):`;
    const val = prompt(promptMsg, current || "");
    if (val === null) return;
    let body;
    if (val.trim() === "") {
      body = { anno: null, mese: null };
    } else {
      const m = val.match(/^(\d{4})-(\d{2})$/);
      if (!m) { alert("Formato non valido: usa YYYY-MM (es. 2026-01)"); return; }
      body = { anno: parseInt(m[1], 10), mese: parseInt(m[2], 10) };
    }
    try {
      const res = await apiFetch(`${FE}/fatture/${fattura.id}/competenza`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { alert(`Errore: ${(await res.text()).slice(0, 200)}`); return; }
      setCeImpatto(null);  // invalida cache
      await refetch();
    } catch (e) {
      alert("Errore di rete");
    }
  };

  const handleSpalmatura = async () => {
    if (!fattura) return;
    const hasSpalm = !!fattura.spalmatura_mesi;
    const promptMsg = hasSpalm
      ? `Spalmatura attuale: ${fattura.spalmatura_mesi} mesi da ${fattura.spalmatura_data_inizio}\n\nNumero mesi (3/6/12/24/36 o custom; vuoto per RIMUOVERE la spalmatura):`
      : `Data fattura: ${fattura.data_fattura}\n\nSpalma il costo su quanti mesi? (3/6/12/24/36 o custom)\n\nEsempio: assicurazione annuale → 12 mesi`;
    const valMesi = prompt(promptMsg, hasSpalm ? String(fattura.spalmatura_mesi) : "12");
    if (valMesi === null) return;
    if (valMesi.trim() === "") {
      try {
        const res = await apiFetch(`${FE}/fatture/${fattura.id}/spalmatura`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mesi: null, data_inizio: null }),
        });
        if (!res.ok) { alert(`Errore: ${(await res.text()).slice(0, 200)}`); return; }
        setCeImpatto(null);
        await refetch();
      } catch { alert("Errore di rete"); }
      return;
    }
    const nMesi = parseInt(valMesi, 10);
    if (!Number.isInteger(nMesi) || nMesi < 1 || nMesi > 120) {
      alert("Numero mesi non valido (1-120)");
      return;
    }
    const defaultStart = fattura.spalmatura_data_inizio
      ? fattura.spalmatura_data_inizio.slice(0, 7)
      : (fattura.data_fattura || "").slice(0, 7);
    const valData = prompt(
      `Primo mese coperto dalla spalmatura (formato YYYY-MM):\n\nEsempio: 2026-01 per spalmare a partire da gennaio.`,
      defaultStart
    );
    if (valData === null) return;
    const m = valData.trim().match(/^(\d{4})-(\d{2})$/);
    if (!m) { alert("Formato data non valido: usa YYYY-MM (es. 2026-01)"); return; }
    try {
      const res = await apiFetch(`${FE}/fatture/${fattura.id}/spalmatura`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mesi: nMesi, data_inizio: `${m[1]}-${m[2]}-01` }),
      });
      if (!res.ok) { alert(`Errore: ${(await res.text()).slice(0, 200)}`); return; }
      setCeImpatto(null);
      await refetch();
    } catch { alert("Errore di rete"); }
  };

  // ─── C.2 (2026-05-18): cambio categoria/sottocategoria su una riga ───
  // BIDIREZIONALE — usa lo STESSO endpoint di FattureFornitoriElenco
  // (POST /contabilita/fe/categorie/fornitori/prodotti/assegna):
  //   - Aggiorna fe_righe.categoria_id su TUTTE le righe con quella
  //     descrizione di quel fornitore (anche in altre fatture)
  //   - Salva mapping in fe_prodotto_categoria_map per i futuri import
  // Quindi cambiare qui = cambiare anche in vista Fornitori + import futuri.
  const handleAssignRiga = async (riga, newCatId, newSubId) => {
    if (!fattura || !riga) return;
    setSavingRigaId(riga.id);
    try {
      const res = await apiFetch(`${API_BASE}/contabilita/fe/categorie/fornitori/prodotti/assegna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornitore_piva: fattura.fornitore_piva,
          fornitore_nome: fattura.fornitore_nome,
          descrizione: riga.descrizione,
          categoria_id: newCatId || null,
          sottocategoria_id: newSubId || null,
        }),
      });
      if (!res.ok) { alert(`Errore: ${(await res.text()).slice(0, 200)}`); return; }
      setCeImpatto(null);  // invalida cache impatto P&L
      await refetch();
      showToast("Categoria aggiornata (anche su Fornitori)");
    } catch (e) {
      showToast("Errore di rete", "err");
    } finally {
      setSavingRigaId(null);
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
  const statoUscita = uscita?.uscita_stato || (fattura.pagato ? "PAGATO" : null);
  const sbc = getFatturaSidebar(statoUscita, isRateizzata);

  // ─────────────────────────────────────────────────────────────────────
  // CORPO del dettaglio — layout testa fissa + linguette (sessione 55)
  // ─────────────────────────────────────────────────────────────────────
  const hdr = getFatturaHeader(statoUscita, isRateizzata);

  // "Giorni alla scadenza" per il KPI in testa: negativo = scaduta, 0 = oggi.
  // G.8: il check "è pagata?" usa isChiuso() centralizzato invece di IN list.
  const gg = daysFromToday(scadenzaEff);
  const isFatturaChiusa = fattura.pagato || isChiuso(statoUscita);
  const ggLabel = isFatturaChiusa
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
    isFatturaChiusa                           ? "text-emerald-700" :
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
              {/* Badge identita + stato — modello 3D (vedi docs/stato_pagamento_unificato.md §15)
                  Zona 1: FT identità
                  Zona 2: D1+D2 pagamento (StatoPagamentoBadge) — sempre presente
                  Zona 3: D3 scadenza (StatoScadenzaBadge) — solo se aperta
                  Annotazioni: batch + riconciliazione (D2 implicito)
              */}
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-neutral-900 text-white">
                  FT {fattura.numero_fattura || `#${fattura.id}`}
                </span>
                {/* D1 + D2 — stato PAGAMENTO */}
                <StatoPagamentoBadge stato={statoUscita || "da_pagare"} size="md" />
                {/* D3 — stato SCADENZA (solo se non chiusa) */}
                {(() => {
                  // Priorità: se la fattura è rateizzata in spesa fissa → chip "Rateizzata"
                  // a prescindere dallo stato cg_uscite (può essere PROGRAMMATO sulla madre)
                  if (isRateizzata) {
                    return <StatoScadenzaBadge stato="rateizzata" size="md" />;
                  }
                  const d3 = deriveStatoScadenza(statoUscita, scadenzaEff);
                  if (!d3) return null;
                  const gg = d3 === "in_scadenza" || d3 === "scaduta" ? giorniLabel(scadenzaEff) : null;
                  return <StatoScadenzaBadge stato={d3} giorni={gg} size="md" />;
                })()}
                {/* Annotazioni di pagamento */}
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
              {/* Sottotitolo: p.iva · data fattura · scadenza · competenza override */}
              <p className="text-xs text-neutral-600 mt-0.5 flex flex-wrap gap-x-1.5 items-center">
                {fattura.fornitore_piva && <span className="font-mono">P.IVA {fattura.fornitore_piva}</span>}
                {fattura.data_fattura && <><span>·</span><span>emessa {fattura.data_fattura}</span></>}
                {scadenzaEff && <><span>·</span><span>scad. {scadenzaEff}</span></>}
                {/* G.3.1b / C0a: competenza override (mese singolo) */}
                {fattura.competenza_anno_mese && !fattura.spalmatura_mesi && (
                  <>
                    <span>·</span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold border border-amber-200"
                          title="Mese di competenza override per il Conto Economico (diverso dalla data fattura)">
                      P&L competenza {fattura.competenza_anno_mese}
                    </span>
                  </>
                )}
                {/* C1 / G.3.2: spalmatura su N mesi (priorità su competenza) */}
                {fattura.spalmatura_mesi && (
                  <>
                    <span>·</span>
                    <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 text-[10px] font-semibold border border-violet-200"
                          title={`Spalmatura attiva: il costo è distribuito su ${fattura.spalmatura_mesi} mesi a partire da ${fattura.spalmatura_data_inizio || "—"}`}>
                      📆 Spalmata {fattura.spalmatura_mesi} mesi da {(fattura.spalmatura_data_inizio || "").slice(0, 7)}
                    </span>
                  </>
                )}
                {/* C.2: bottoni "sposta competenza" / "spalma" rimossi dal header.
                    Spostati nel tab "Conto Economico" come azioni esplicite.
                    I chip read-only sopra (P&L competenza · Spalmata) restano
                    come segnale rapido se un override è attivo. */}
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
              {/* Modello 3D: D1+D2 (pagamento) + D3 (scadenza) come 2 chip separati.
                  Niente più chip raw "CG: PROGRAMMATO" — confondeva l'utente.
                  Vedi docs/stato_pagamento_unificato.md §15 */}
              <StatoPagamentoBadge stato={statoUscita || fattura.stato_pagamento || "da_pagare"} size="md" />
              {(() => {
                if (isRateizzata) return <StatoScadenzaBadge stato="rateizzata" size="md" />;
                const d3 = deriveStatoScadenza(statoUscita, scadenzaEff);
                if (!d3) return null;
                const gg = d3 === "in_scadenza" || d3 === "scaduta" ? giorniLabel(scadenzaEff) : null;
                return <StatoScadenzaBadge stato={d3} giorni={gg} size="md" />;
              })()}
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

              {/* ─── RIQUADRO STATO PAGAMENTO (D1+D2, 2026-05-18) ───
                  Spostato dal footer per chiarezza: stato attuale + azioni di
                  cambio in un unico posto, dentro il tab Pagamenti (sua casa
                  naturale). Per fatture rateizzate è solo read-only — le
                  scadenze vivono nella spesa fissa target. */}
              {!isRateizzata && (
                <div className="mb-4 bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1.5">Stato pagamento attuale</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatoPagamentoBadge stato={statoUscita || fattura.stato_pagamento || "da_pagare"} size="lg" />
                        {uscita?.banca_movimento_id && (
                          <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 font-medium">
                            ✓ Riconciliata con banca
                          </span>
                        )}
                      </div>
                    </div>
                    {fattura.stato_pagamento === "pagato" ? (
                      <div className="text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-300 px-3 py-2 rounded-lg max-w-xs">
                        🔒 Stato definitivo (riconciliazione banca).
                        <br/>Per cambiarlo annulla la riconciliazione.
                      </div>
                    ) : (
                      onCambiaStato && (
                        <div>
                          <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1.5">Cambia stato →</div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {fattura.stato_pagamento !== "da_pagare" && (
                              <Btn variant="chip" tone="neutral" size="sm" type="button"
                                onClick={() => handleCambiaStato("da_pagare")}
                                title="Riporta lo stato a 'Da pagare'">
                                Da pagare
                              </Btn>
                            )}
                            {fattura.stato_pagamento !== "da_verificare" && (
                              <Btn variant="chip" tone="amber" size="sm" type="button"
                                onClick={() => handleCambiaStato("da_verificare")}
                                title="Marca come 'Da verificare' (forse pagata, controllare estratto conto)">
                                ❓ Da verificare
                              </Btn>
                            )}
                            {fattura.stato_pagamento !== "pagato_manuale" && (
                              <Btn variant="chip" tone="emerald" size="sm" type="button"
                                onClick={() => handleCambiaStato("pagato_manuale")}
                                title="Marca come pagata (in attesa di riconciliazione bancaria)">
                                Pagato*
                              </Btn>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-400 mt-1.5 max-w-xs leading-tight">
                            "Pagato" definitivo si attiva solo dalla riconciliazione bancaria.
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* SCADENZA — G.7: 2 sotto-celle affiancate "Iniziale" + "Programmata" */}
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 md:col-span-1">
                  <div className="grid grid-cols-2 gap-2">
                    {/* INIZIALE — read-only (dall'XML/FIC) */}
                    <div>
                      <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider mb-0.5">Scadenza iniziale</p>
                      <p className="text-xs font-bold text-neutral-700 tabular-nums">{scadenzaXml || "—"}</p>
                      <p className="text-[9px] text-neutral-400 mt-0.5">da fattura</p>
                    </div>
                    {/* PROGRAMMATA — editabile */}
                    <div>
                      <div className="flex items-center gap-1 mb-0.5">
                        <p className="text-[10px] text-fuchsia-700 font-medium uppercase tracking-wider">Programmata</p>
                        {statoUscita === "SPOSTATO" && (
                          <span className="text-[8px] px-1 py-0 rounded bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200">spost.</span>
                        )}
                      </div>
                      {editingScadenza ? (
                        <div className="space-y-1">
                          <input
                            type="date"
                            value={draftScadenza}
                            onChange={(e) => setDraftScadenza(e.target.value)}
                            className="w-full px-1 py-0.5 text-[11px] border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={saveScadenza}
                              disabled={saving || !draftScadenza}
                              className="flex-1 px-1 py-0.5 text-[10px] font-medium bg-fuchsia-600 text-white rounded hover:bg-fuchsia-700 disabled:opacity-50"
                            >
                              Sposta
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingScadenza(false)}
                              className="px-1 py-0.5 text-[10px] border border-neutral-300 rounded hover:bg-neutral-100"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs font-bold text-neutral-900 tabular-nums">{scadenzaEff || "—"}</p>
                          {!isRateizzata && uscita?.uscita_id && statoUscita !== "PAGATO" && (
                            <div className="mt-1 flex flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setDraftScadenza(scadenzaEff || "");
                                  setEditingScadenza(true);
                                }}
                                className="text-[10px] text-fuchsia-700 hover:text-fuchsia-900 font-medium underline text-left"
                              >
                                {statoUscita === "SPOSTATO" ? "Modifica" : "Sposta data"}
                              </button>
                              {statoUscita === "SPOSTATO" && uscita?.uscita_id && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!window.confirm("Ripristinare la scadenza originale?")) return;
                                    setSaving(true);
                                    try {
                                      const res = await apiFetch(
                                        `${CG}/uscite/${uscita.uscita_id}/ripristina-data`,
                                        { method: "PUT" }
                                      );
                                      const data = await res.json();
                                      if (data.ok) {
                                        showToast("Scadenza ripristinata");
                                        await refetch();
                                      } else {
                                        showToast(data.error || "Errore", "err");
                                      }
                                    } catch (e) {
                                      showToast("Errore di rete", "err");
                                    } finally {
                                      setSaving(false);
                                    }
                                  }}
                                  className="text-[10px] text-neutral-500 hover:text-neutral-700 underline text-left"
                                >
                                  Ripristina originale
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
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
                      {!isRateizzata && uscita?.uscita_id && statoUscita !== "PAGATO" && (
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
                      {!isRateizzata && uscita?.uscita_id && statoUscita !== "PAGATO" && (
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

          {/* ── CONTO ECONOMICO (C.2, 2026-05-18) ── */}
          {activeTab === "conto-economico" && (
          <div className="p-5 space-y-4">
            {/* Banner se la fattura è esclusa dal CE */}
            {fattura.escluso_acquisti && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-900">
                ⚠ Questa fattura è <strong>esclusa dal Conto Economico</strong> perché il fornitore
                ha il flag <code className="text-[11px] bg-amber-100 px-1 rounded">escluso_acquisti</code> attivo.
                Per includerla, modifica l'anagrafica del fornitore.
              </div>
            )}

            {/* ─── SEZIONE 1: COMPETENZA P&L ─── */}
            <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-neutral-800">📅 Competenza P&L</h4>
                <span className="text-[10px] text-neutral-500">Quando questa fattura impatta il CE</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Mese singolo */}
                <div className="bg-white border border-neutral-200 rounded-lg p-3">
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1">Mese singolo</div>
                  <div className="text-base font-bold text-neutral-900">
                    {fattura.competenza_anno_mese || (fattura.data_fattura || "").slice(0, 7) || "—"}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {fattura.competenza_anno_mese
                      ? "override attivo"
                      : "default: data fattura"}
                  </div>
                  <Btn variant="secondary" size="sm" type="button"
                    onClick={handleSpostaCompetenza}
                    className="mt-2 text-xs">
                    {fattura.competenza_anno_mese ? "✏️ Modifica competenza" : "📅 Sposta competenza"}
                  </Btn>
                </div>
                {/* Spalmatura */}
                <div className="bg-white border border-neutral-200 rounded-lg p-3">
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1">Spalmatura su N mesi</div>
                  {fattura.spalmatura_mesi ? (
                    <>
                      <div className="text-base font-bold text-violet-900">
                        {fattura.spalmatura_mesi} mesi
                      </div>
                      <div className="text-[10px] text-violet-600 mt-0.5">
                        da {(fattura.spalmatura_data_inizio || "").slice(0, 7) || "—"}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-base font-bold text-neutral-400">Non attiva</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">
                        es. assicurazione annuale → 12 mesi
                      </div>
                    </>
                  )}
                  <Btn variant="secondary" size="sm" type="button"
                    onClick={handleSpalmatura}
                    className="mt-2 text-xs">
                    {fattura.spalmatura_mesi ? "✏️ Modifica spalmatura" : "📆 Spalma su N mesi"}
                  </Btn>
                </div>
              </div>
            </div>

            {/* ─── SEZIONE 2: CATEGORIA NEL CE ─── */}
            <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
              <h4 className="text-sm font-semibold text-neutral-800 mb-3">🏷 Categoria nel Conto Economico</h4>

              {/* 2a — Aggregato (read-only) */}
              <div className="bg-white border border-neutral-200 rounded-lg p-3 mb-3">
                {fattura.categoria_aggregata && fattura.categoria_aggregata.length > 0 ? (
                  <>
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1.5">
                      Aggregazione per categoria{fattura.categoria_aggregata.length > 1 ? ` (${fattura.categoria_aggregata.length} categorie diverse)` : ""}
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-neutral-500 border-b border-neutral-100">
                          <th className="text-left font-medium py-1">Categoria</th>
                          <th className="text-left font-medium py-1">Sottocategoria</th>
                          <th className="text-right font-medium py-1">Righe</th>
                          <th className="text-right font-medium py-1">Importo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fattura.categoria_aggregata.map((c, i) => (
                          <tr key={i} className="border-b border-neutral-50">
                            <td className="py-1.5 font-semibold text-neutral-800">{c.categoria}</td>
                            <td className="py-1.5 text-neutral-600">{c.sottocategoria}</td>
                            <td className="py-1.5 text-right text-neutral-500 tabular-nums">{c.righe_count}</td>
                            <td className="py-1.5 text-right font-semibold text-neutral-900 tabular-nums">€ {fmt(c.importo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <div className="text-sm text-neutral-500">Nessuna riga da categorizzare</div>
                )}
              </div>

              {/* 2b — Editor inline per riga (BIDIREZIONALE con vista Fornitori) */}
              {righe.length > 0 && (
                <div className="bg-white border border-neutral-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wide">
                      Modifica per riga
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      Le modifiche si riflettono in <span className="font-semibold text-neutral-600">Fornitori → {fattura.fornitore_nome}</span> (stessa descrizione)
                    </div>
                  </div>

                  {categorie == null ? (
                    <div className="text-xs text-neutral-500 italic py-2">Caricamento categorie…</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-neutral-500 border-b border-neutral-100">
                            <th className="text-left font-medium py-1.5 pr-2 w-8">#</th>
                            <th className="text-left font-medium py-1.5 pr-2">Descrizione</th>
                            <th className="text-left font-medium py-1.5 pr-2 w-40">Categoria</th>
                            <th className="text-left font-medium py-1.5 pr-2 w-40">Sottocategoria</th>
                            <th className="text-right font-medium py-1.5 w-20">Importo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {righe.map((r) => {
                            const isSaving = savingRigaId === r.id;
                            const selCat = categorie.find(c => c.id === r.categoria_id);
                            const subOpts = selCat?.sottocategorie || [];
                            const isEreditata = r.categoria_id && r.categoria_auto;
                            const isVuota = !r.categoria_id;
                            return (
                              <tr key={r.id}
                                className={`border-b border-neutral-50 ${isVuota ? "bg-amber-50/30" : ""}`}>
                                <td className="py-1.5 pr-2 text-neutral-400 tabular-nums">{r.numero_linea || ""}</td>
                                <td className="py-1.5 pr-2 text-neutral-800">
                                  <div className="max-w-sm truncate" title={r.descrizione}>{r.descrizione || "—"}</div>
                                  {isEreditata && (
                                    <div className="text-[9px] text-neutral-400 italic">ereditata dal fornitore</div>
                                  )}
                                </td>
                                <td className="py-1 pr-2">
                                  <select
                                    value={r.categoria_id || ""}
                                    disabled={isSaving}
                                    onChange={e => {
                                      const newCat = e.target.value ? Number(e.target.value) : null;
                                      handleAssignRiga(r, newCat, null);  // reset sotto al cambio cat
                                    }}
                                    className="w-full text-xs border border-neutral-300 rounded px-1.5 py-1 bg-white">
                                    <option value="">— scegli —</option>
                                    {categorie.map(c => (
                                      <option key={c.id} value={c.id}>{c.nome}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-1 pr-2">
                                  <select
                                    value={r.sottocategoria_id || ""}
                                    disabled={isSaving || !r.categoria_id}
                                    onChange={e => {
                                      const newSub = e.target.value ? Number(e.target.value) : null;
                                      handleAssignRiga(r, r.categoria_id, newSub);
                                    }}
                                    className="w-full text-xs border border-neutral-300 rounded px-1.5 py-1 bg-white disabled:bg-neutral-100">
                                    <option value="">{r.categoria_id ? "— scegli —" : "—"}</option>
                                    {subOpts.map(s => (
                                      <option key={s.id} value={s.id}>{s.nome}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-1.5 text-right tabular-nums font-semibold text-neutral-900">
                                  € {fmt(r.prezzo_totale)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="text-[10px] text-neutral-500 mt-2 leading-tight">
                    Gerarchia: categoria_riga &gt; categoria_fornitore &gt; "Non categorizzato".
                    Modificando una riga, l'endpoint aggiorna anche tutte le altre righe (passate e future) con la stessa descrizione di questo fornitore.
                  </div>
                </div>
              )}
            </div>

            {/* ─── SEZIONE 3: DOVE APPARE NEL CE ─── */}
            <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
              <h4 className="text-sm font-semibold text-neutral-800 mb-3">📊 Dove appare nel Conto Economico</h4>
              {ceLoading && (
                <div className="text-sm text-neutral-500 italic">Calcolo dell'impatto P&L in corso…</div>
              )}
              {!ceLoading && ceImpatto && (
                <div className="bg-white border border-neutral-200 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-start text-xs">
                    <span className="text-neutral-500">Mese di competenza</span>
                    <span className="font-semibold text-neutral-900 text-right">
                      {ceImpatto.mese_label}
                      {ceImpatto.modalita === "spalmatura" && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200 text-[9px]">
                          spalmata
                        </span>
                      )}
                      {ceImpatto.modalita === "competenza_override" && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 text-[9px]">
                          override
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-500">
                      Importo P&L{ceImpatto.modalita === "spalmatura" ? " (per mese)" : ""}
                    </span>
                    <span className="font-bold text-neutral-900 tabular-nums">€ {fmt(ceImpatto.importo_pl_per_mese)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-500">Categoria principale</span>
                    <span className="font-semibold text-neutral-900">
                      {ceImpatto.categoria_principale}
                      {ceImpatto.sottocategoria_principale && ceImpatto.sottocategoria_principale !== "—" && (
                        <span className="text-neutral-400"> › {ceImpatto.sottocategoria_principale}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-500">% sui ricavi del mese</span>
                    <span className="font-semibold text-neutral-900 tabular-nums">
                      {ceImpatto.perc_su_ricavi != null ? `${fmt(ceImpatto.perc_su_ricavi)}%` : "—"}
                      <span className="text-[10px] text-neutral-400 ml-1">su € {fmt(ceImpatto.ricavi_mese_riferimento)}</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-500">% sulla categoria</span>
                    <span className="font-semibold text-neutral-900 tabular-nums">
                      {ceImpatto.perc_su_categoria != null ? `${fmt(ceImpatto.perc_su_categoria)}%` : "—"}
                      <span className="text-[10px] text-neutral-400 ml-1">su € {fmt(ceImpatto.totale_categoria_mese)}</span>
                    </span>
                  </div>
                  <div className="pt-2 mt-2 border-t border-neutral-100">
                    <a href={ceImpatto.link_ce}
                      onClick={(e) => { e.preventDefault(); if (inline && onClose) onClose(); navigate(ceImpatto.link_ce); }}
                      className="text-xs font-semibold text-brand-blue hover:underline">
                      Apri Conto Economico {ceImpatto.mese_label} →
                    </a>
                  </div>
                </div>
              )}
              {!ceLoading && !ceImpatto && (
                <div className="text-sm text-neutral-500 italic">Impossibile calcolare l'impatto P&L (riprova)</div>
              )}
            </div>
          </div>
          )}

        </div>

        {/* ═══════════ FOOTER AZIONI ═══════════ */}
        <div className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-cream border-t border-neutral-200 flex-shrink-0 flex-wrap">
          {/* C.2 (2026-05-18): bottoni cambio stato spostati nel tab "Pagamenti"
              dentro il nuovo riquadro "Stato pagamento attuale".
              Il footer resta pulito con solo le azioni globali (anagrafica, chiudi). */}
          {/* Legacy: bottoni pre-Modulo M (preservati per compat se onCambiaStato non passato) */}
          {!onCambiaStato && onSegnaPagata && !fattura.pagato && statoUscita !== "PAGATO" && !isRateizzata && (
            <Btn variant="primary" size="md" type="button" onClick={handleSegnaPagata}>
              ✓ Segna pagata
            </Btn>
          )}
          {!onCambiaStato && onSegnaNonPagata && (fattura.pagato || statoUscita === "PAGATO_MANUALE") && (
            <Btn variant="chip" tone="red" size="md" type="button" onClick={handleSegnaNonPagata}>
              ✗ Segna NON pagata
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
