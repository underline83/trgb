// @version: v3.2-nav-uniformato (S40-7) — tab bar CG sempre visibile
// Scadenzario Uscite — layout Cantina: filtri SX, KPI in alto, tabella sticky sortable
// + Riconciliazione Banca: match uscite ↔ movimenti bancari
// v3.2 (sessione 40 Wave 3):
//  - Aggiunto ControlloGestioneNav per tab bar uniforme con altri moduli
// v3.1 (sessione 40):
//  - Default filtri all'apertura: stati Programmato+Scaduto+Pagato e periodo mese corrente
//  - Barra bulk mostra la somma dei totali delle righe selezionate (Excel-style)
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureDettaglio from "../admin/FattureDettaglio";
import Tooltip from "../../components/Tooltip";
import ControlloGestioneNav from "./ControlloGestioneNav";

const fmt = (n) => n != null ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) : null;
const fmtDateFull = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" }) : null;
const giorniA = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;
const cleanFatt = (s) => s && s !== "&mdash;" && s !== "—" && s.trim() ? s : null;

const STATO_STYLE = {
  DA_PAGARE:       { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200", label: "Programmato" },
  SCADUTA:         { bg: "bg-red-100",   text: "text-red-800",   border: "border-red-200",   label: "Scaduto" },
  PAGATA:          { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200", label: "Pagato" },
  PAGATA_MANUALE:  { bg: "bg-teal-100",  text: "text-teal-800",  border: "border-teal-200",  label: "Pagato *" },
  PARZIALE:        { bg: "bg-blue-100",  text: "text-blue-800",  border: "border-blue-200",  label: "Parziale" },
  RATEIZZATA:      { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-200", label: "Rateizzato" },
};

const TIPO_USCITA_STYLE = {
  FATTURA:      { label: "Fattura", color: "bg-sky-50 text-sky-700 border-sky-200" },
  SPESA_FISSA:  { label: "Spesa fissa", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  STIPENDIO:    { label: "Stipendio", color: "bg-purple-50 text-purple-700 border-purple-200" },
  PROFORMA:     { label: "Proforma", color: "bg-amber-50 text-amber-700 border-amber-200" },
};

// ── Sort helper ──
function sortRows(rows, sortCol, sortDir) {
  if (!sortCol) return rows;
  return [...rows].sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
    va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    return sortDir === "asc" ? va.localeCompare(vb, "it") : vb.localeCompare(va, "it");
  });
}

export default function ControlloGestioneUscite() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const importDone = useRef(false);

  // ── Filtri (locali, no API) ──
  const [search, setSearch] = useState("");
  // filtroStato: Set di stati selezionati. Vuoto = "tutti".
  // Valori possibili: "DA_PAGARE", "SCADUTA", "PAGATA" (include anche PAGATA_MANUALE), "PARZIALE"
  //
  // v3.1 (sessione 40): DEFAULT = Programmato + Scaduto + Pagato.
  // Marco entra nella pagina e vede subito il quadro completo del mese in corso
  // (niente Parziale di default perché è rumore raro, va cercato esplicitamente).
  const [filtroStato, setFiltroStato] = useState(() => new Set(["DA_PAGARE", "SCADUTA", "PAGATA"]));
  const [filtroTipo, setFiltroTipo] = useState(""); // FATTURA | SPESA_FISSA | ""
  // v3.1: DEFAULT periodo = mese corrente (primo giorno → ultimo giorno).
  // Stesso vantaggio: chi apre la pagina ha già la vista "mese" come in Excel.
  const [filtroDa, setFiltroDa] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  });
  const [filtroA, setFiltroA] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  });
  const [sortCol, setSortCol] = useState("data_scadenza");
  const [sortDir, setSortDir] = useState("asc");

  // Helper: toggle di uno stato nel Set filtroStato (multi-select)
  const toggleStato = useCallback((val) => {
    setFiltroStato(prev => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  }, []);

  // ── Selezione multipla + bulk payment ──
  const [selected, setSelected] = useState(new Set());
  const [bulkMetodo, setBulkMetodo] = useState("CONTO_CORRENTE");
  const [bulkSaving, setBulkSaving] = useState(false);

  // ── Batch di pagamento / stampa ──
  const [stampaModal, setStampaModal] = useState(false); // {} when open
  const [batchTitolo, setBatchTitolo] = useState("");
  const [batchNote, setBatchNote] = useState("");
  const [batchSaving, setBatchSaving] = useState(false);

  // ── Filtro "solo in pagamento" ──
  const [filtroInPagamento, setFiltroInPagamento] = useState(false);

  // ── v2.0: filtro rateizzate (server-side, passato come query param) ──
  const [includiRateizzate, setIncludiRateizzate] = useState(false);

  // ── Filtro "mostra anche escluse" (fornitori con escluso_acquisti=1, es. affitti FIC) ──
  const [includiEscluse, setIncludiEscluse] = useState(false);

  // ── Gestione batch (lista + delete) ──
  const [gestioneBatchOpen, setGestioneBatchOpen] = useState(false);
  const [batchList, setBatchList] = useState([]);
  const [loadingBatchList, setLoadingBatchList] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState(null);

  // ── Modale modifica scadenza ──
  const [modaleScadenza, setModaleScadenza] = useState(null); // { id, fornitore_nome, totale, data_scadenza, data_scadenza_originale, stato }
  const [nuovaScadenza, setNuovaScadenza] = useState("");
  const [savingScadenza, setSavingScadenza] = useState(false);

  // ── Modale riconciliazione ──
  const [modaleBanca, setModaleBanca] = useState(null); // { uscita_id, fornitore, totale }
  const [candidati, setCandidati] = useState([]);
  const [loadingCandidati, setLoadingCandidati] = useState(false);
  const [linkingId, setLinkingId] = useState(null);

  // ── v2.1 Split-pane inline: dettaglio fattura dentro lo scadenzario ──
  // Pattern identico a MagazzinoVini/SchedaVino: click su riga FATTURA →
  // setOpenFatturaId → la lista viene sostituita dal componente dettaglio.
  const [openFatturaId, setOpenFatturaId] = useState(null);
  const fatturaInlineRef = useRef(null);      // ref per scroll al wrapper
  const fatturaCompRef = useRef(null);        // ref al componente (hasPendingChanges)

  // ── Auto-import + fetch ──
  const fetchData = useCallback(async (doImport = false) => {
    setLoading(true);
    try {
      if (doImport) {
        try {
          await apiFetch(`${API_BASE}/controllo-gestione/uscite/import`, { method: "POST" });
        } catch (importErr) {
          console.warn("Import non riuscito (i dati esistenti verranno comunque caricati):", importErr);
        }
      }
      // v2.0: passa includi_rateizzate + includi_escluse come query params
      const qsParts = [];
      if (includiRateizzate) qsParts.push("includi_rateizzate=true");
      if (includiEscluse) qsParts.push("includi_escluse=true");
      const qs = qsParts.length ? `?${qsParts.join("&")}` : "";
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite${qs}`);
      if (!res.ok) throw new Error("Errore API");
      setData(await res.json());
    } catch (e) {
      console.error("Errore caricamento uscite:", e);
    } finally {
      setLoading(false);
    }
  }, [includiRateizzate, includiEscluse]);

  useEffect(() => {
    // Auto-import al primo caricamento, poi rifetch al cambio di includiRateizzate
    if (!importDone.current) {
      importDone.current = true;
      fetchData(true);
    } else {
      fetchData(false);
    }
  }, [fetchData]); // eslint-disable-line

  // Reset ordinamento al cambio tab stato:
  // - Programmato / Scaduto → data_scadenza ASC (le più vecchie/urgenti prima)
  // - Pagato (selezionato da solo) → data_scadenza DESC (le più recenti prima)
  useEffect(() => {
    setSortCol("data_scadenza");
    const soloPagate = filtroStato.size === 1 && filtroStato.has("PAGATA");
    setSortDir(soloPagate ? "desc" : "asc");
  }, [filtroStato]);

  const allUscite = data?.uscite || [];
  const rig = data?.riepilogo || {};

  // ── Filtraggio locale ──
  const filtered = useMemo(() => {
    let rows = allUscite;
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(u =>
        (u.fornitore_nome || "").toLowerCase().includes(s) ||
        (u.numero_fattura || "").toLowerCase().includes(s) ||
        (u.note || "").toLowerCase().includes(s) ||
        (u.periodo_riferimento || "").toLowerCase().includes(s) ||
        (u.sf_tipo_label || "").toLowerCase().includes(s) ||
        (u.data_scadenza || "").includes(s) ||
        String(u.totale || "").includes(s)
      );
    }
    if (filtroStato.size > 0) {
      rows = rows.filter(u => {
        // PAGATA del filtro include sia PAGATA che PAGATA_MANUALE
        if (filtroStato.has("PAGATA") && (u.stato === "PAGATA" || u.stato === "PAGATA_MANUALE")) return true;
        return filtroStato.has(u.stato);
      });
    }
    if (filtroTipo) rows = rows.filter(u => (u.tipo_uscita || "FATTURA") === filtroTipo);
    if (filtroDa) rows = rows.filter(u => u.data_scadenza && u.data_scadenza >= filtroDa);
    if (filtroA) rows = rows.filter(u => u.data_scadenza && u.data_scadenza <= filtroA);
    if (filtroInPagamento) rows = rows.filter(u => !!u.in_pagamento_at);
    return rows;
  }, [allUscite, search, filtroStato, filtroTipo, filtroDa, filtroA, filtroInPagamento]);

  // ── Sorting locale ──
  const sorted = useMemo(() => sortRows(filtered, sortCol, sortDir), [filtered, sortCol, sortDir]);

  // ── KPI calcolati sui filtrati ──
  const kpi = useMemo(() => {
    const dp = filtered.filter(u => u.stato === "DA_PAGARE");
    const sc = filtered.filter(u => u.stato === "SCADUTA");
    const pg = filtered.filter(u => u.stato === "PAGATA" || u.stato === "PAGATA_MANUALE" || u.stato === "PARZIALE");
    return {
      da_pagare: dp.reduce((s, u) => s + (u.totale - u.importo_pagato), 0),
      n_da_pagare: dp.length,
      scadute: sc.reduce((s, u) => s + (u.totale - u.importo_pagato), 0),
      n_scadute: sc.length,
      pagate: pg.reduce((s, u) => s + u.importo_pagato, 0),
      n_pagate: pg.length,
      totale: filtered.length,
    };
  }, [filtered]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span className="text-neutral-300 ml-0.5">{"\u2195"}</span>;
    return <span className="text-sky-600 ml-0.5">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>;
  };

  // ── Riconciliazione: apri modale ──
  const apriRiconciliazione = async (uscita) => {
    setModaleBanca({ id: uscita.id, fornitore: uscita.fornitore_nome, totale: uscita.totale });
    setCandidati([]);
    setLoadingCandidati(true);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite/${uscita.id}/candidati-banca`);
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      setCandidati(json.candidati || []);
    } catch (e) {
      console.error("Errore candidati banca:", e);
    } finally {
      setLoadingCandidati(false);
    }
  };

  // ── Riconciliazione: collega ──
  const collegaMovimento = async (banca_movimento_id) => {
    if (!modaleBanca) return;
    setLinkingId(banca_movimento_id);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite/${modaleBanca.id}/riconcilia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banca_movimento_id }),
      });
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      if (json.ok) {
        setModaleBanca(null);
        fetchData(false); // Refresh tabella
      } else {
        alert(json.error || "Errore");
      }
    } catch (e) {
      console.error("Errore riconciliazione:", e);
      alert("Errore di rete");
    } finally {
      setLinkingId(null);
    }
  };

  // ── Riconciliazione: scollega ──
  const scollegaMovimento = async (uscita_id) => {
    if (!confirm("Scollegare il movimento bancario? Lo stato tornerà a 'Pagato *'")) return;
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite/${uscita_id}/riconcilia`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Errore API");
      fetchData(false);
    } catch (e) {
      console.error("Errore scollega:", e);
      alert("Errore di rete");
    }
  };

  // ── Modifica scadenza ──
  const apriModaleScadenza = (u) => {
    // Non aprire per righe riconciliate via banca
    if (u.stato === "PAGATA") return;
    // v2.0: per fatture la "data originale" semantica è quella XML (f.data_scadenza).
    // Per spese fisse / manuali resta cg_uscite.data_scadenza_originale.
    const isFatturaV2 = !!u.fattura_id;
    const originale = isFatturaV2
      ? (u.data_scadenza_xml || u.data_scadenza_originale || u.data_scadenza)
      : (u.data_scadenza_originale || u.data_scadenza);
    setModaleScadenza({ ...u, data_scadenza_originale: originale });
    setNuovaScadenza(u.data_scadenza || "");
  };

  // ── v2.1 Fase E + split-pane inline: click-through intelligente su riga ──
  // FATTURA con fattura_id  → dettaglio INLINE (split-pane stile MagazzinoVini)
  // SPESA_FISSA             → pagina spese fisse (highlight della riga)
  // STIPENDIO/ALTRO/altre   → modale modifica scadenza (comportamento legacy)
  const handleRowClick = (u) => {
    // Riconciliata via banca → non succede niente (comportamento pre-esistente)
    if (u.stato === "PAGATA") return;

    const tipo = u.tipo_uscita || "FATTURA";

    // 0) PROFORMA → vai alla pagina proforme
    if (tipo === "PROFORMA") {
      navigate("/acquisti/proforme");
      return;
    }

    // 1) FATTURA con collegamento → dettaglio INLINE nello stesso pagina
    //    (pattern SchedaVino in MagazzinoVini, niente navigazione)
    if (tipo === "FATTURA" && u.fattura_id) {
      // Se c'è già una fattura aperta con modifiche pendenti, chiedi conferma
      if (
        openFatturaId &&
        openFatturaId !== u.fattura_id &&
        fatturaCompRef.current?.hasPendingChanges?.()
      ) {
        if (!window.confirm("Hai modifiche non salvate sulla fattura corrente. Vuoi passare a un'altra?")) return;
      }
      setOpenFatturaId(u.fattura_id);
      setTimeout(() => {
        fatturaInlineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      return;
    }

    // 2) Rateizzata anche senza spesa_fissa_id diretta → se c'è una fattura, vai lì inline
    if (u.stato === "RATEIZZATA" && u.fattura_id) {
      setOpenFatturaId(u.fattura_id);
      setTimeout(() => {
        fatturaInlineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      return;
    }

    // 3) SPESA_FISSA / rata di rateizzazione → pagina spese fisse con highlight
    if ((tipo === "SPESA_FISSA" || u.spesa_fissa_id) && u.spesa_fissa_id) {
      navigate(`/controllo-gestione/spese-fisse?highlight=${u.spesa_fissa_id}&from=scadenzario`);
      return;
    }

    // 4) STIPENDIO / ALTRO / SPESA_BANCARIA / fatture orfane → modale scadenza legacy
    apriModaleScadenza(u);
  };
  const salvaScadenza = async () => {
    if (!modaleScadenza || !nuovaScadenza) return;
    setSavingScadenza(true);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite/${modaleScadenza.id}/scadenza`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_scadenza: nuovaScadenza }),
      });
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      if (json.ok) {
        setModaleScadenza(null);
        fetchData(false);
      } else {
        alert(json.error || "Errore");
      }
    } catch (e) {
      console.error("Errore modifica scadenza:", e);
      alert("Errore di rete");
    } finally {
      setSavingScadenza(false);
    }
  };

  // ── Selezione multipla helpers ──
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // v3.1 (sessione 40): somma Excel-style dei totali netti delle righe selezionate.
  // Usiamo `totale - importo_pagato` cosi' su uscite parziali mostriamo solo il residuo,
  // coerente con le KPI della pagina. Calcolato su `allUscite` per evitare discrepanze
  // quando un filtro nasconde una riga gia' selezionata.
  const sommaSelezionati = useMemo(() => {
    if (selected.size === 0) return 0;
    return allUscite
      .filter(u => selected.has(u.id))
      .reduce((s, u) => s + ((u.totale || 0) - (u.importo_pagato || 0)), 0);
  }, [allUscite, selected]);
  const selezionabili = useMemo(() =>
    sorted.filter(u => ["DA_PAGARE", "SCADUTA", "PARZIALE"].includes(u.stato)).map(u => u.id),
    [sorted]
  );
  const allSelected = selezionabili.length > 0 && selezionabili.every(id => selected.has(id));
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selezionabili));
    }
  };

  // ── Bulk payment ──
  const segnaPagateBulk = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Segnare ${selected.size} uscit${selected.size === 1 ? "a" : "e"} come pagate (${bulkMetodo.replace("_", " ")})?`)) return;
    setBulkSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite/segna-pagate-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], metodo_pagamento: bulkMetodo }),
      });
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      if (json.ok) {
        setSelected(new Set());
        fetchData(false);
      } else {
        alert(json.error || "Errore");
      }
    } catch (e) {
      console.error("Errore bulk payment:", e);
      alert("Errore di rete");
    } finally {
      setBulkSaving(false);
    }
  };

  // ── Gestione batch: apri modale lista ──
  const apriGestioneBatch = async () => {
    setGestioneBatchOpen(true);
    await caricaBatchList();
  };

  const caricaBatchList = async () => {
    setLoadingBatchList(true);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/pagamenti-batch`);
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      setBatchList(json.batch || []);
    } catch (e) {
      console.error("Errore caricamento batch:", e);
      alert("Errore caricamento batch");
    } finally {
      setLoadingBatchList(false);
    }
  };

  const eliminaBatch = async (batch) => {
    if (!window.confirm(
      `Eliminare il batch "${batch.titolo}"?\n\n` +
      `${batch.n_uscite} uscite torneranno al loro stato originale (non verranno cancellate).`
    )) return;
    setDeletingBatchId(batch.id);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/pagamenti-batch/${batch.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Errore API");
      await caricaBatchList();
      fetchData(false); // ricarica uscite per aggiornare il flag in_pagamento
    } catch (e) {
      console.error("Errore eliminazione batch:", e);
      alert("Errore eliminazione batch");
    } finally {
      setDeletingBatchId(null);
    }
  };

  // ── Batch di pagamento: apri modale conferma ──
  const apriStampaBatch = () => {
    if (selected.size === 0) return;
    const oggi = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    setBatchTitolo(`Pagamenti ${oggi}`);
    setBatchNote("");
    setStampaModal(true);
  };

  // ── Conferma: crea batch via API e apre la finestra di stampa ──
  const confermaStampaBatch = async () => {
    if (selected.size === 0) return;
    setBatchSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite/batch-pagamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [...selected],
          titolo: batchTitolo.trim() || undefined,
          note: batchNote.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      if (!json.ok) {
        alert(json.error || "Errore creazione batch");
        return;
      }
      // Apri la stampa con il batch ricevuto
      apriFinestraStampa(json.batch);
      // Reset UI
      setStampaModal(false);
      setSelected(new Set());
      fetchData(false);
    } catch (e) {
      console.error("Errore batch pagamento:", e);
      alert("Errore di rete");
    } finally {
      setBatchSaving(false);
    }
  };

  // ── Template HTML per la stampa (apre nuova finestra) ──
  const apriFinestraStampa = (batch) => {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) {
      alert("Impossibile aprire la finestra di stampa. Controlla i popup del browser.");
      return;
    }
    const righe = (batch.uscite || []).map((u, i) => {
      const iban = u.fornitore_iban || u.sf_iban || u.proforma_iban || "";
      const desc = u.tipo_uscita === "PROFORMA"
        ? (u.note || "Proforma")
        : u.numero_fattura && u.numero_fattura !== "—"
          ? u.numero_fattura
          : (u.periodo_riferimento || u.sf_titolo || "");
      const dataScad = u.data_scadenza
        ? new Date(u.data_scadenza + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "—";
      const importo = Number(u.totale - u.importo_pagato).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const stato = u.stato === "SCADUTA" ? "SCADUTA" : "";
      return `
        <tr class="${stato === "SCADUTA" ? "scaduta" : ""}">
          <td class="num">${i + 1}</td>
          <td class="scad">${dataScad}${stato ? ` <span class="tag">${stato}</span>` : ""}</td>
          <td class="forn">
            <div class="forn-nome">${escapeHtml(u.fornitore_nome || "—")}</div>
            ${desc ? `<div class="forn-desc">${escapeHtml(desc)}</div>` : ""}
            ${u.note ? `<div class="forn-note">${escapeHtml(u.note)}</div>` : ""}
          </td>
          <td class="iban">${iban ? escapeHtml(iban) : '<span class="mute">—</span>'}</td>
          <td class="imp">&euro; ${importo}</td>
          <td class="check"></td>
        </tr>
      `;
    }).join("");

    const totale = Number(batch.totale || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dataBatch = new Date(batch.created_at || Date.now()).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

    const html = `
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(batch.titolo || "Elenco pagamenti")}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 20px; font-size: 11pt; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 16px; }
  .brand { font-size: 14pt; font-weight: 700; color: #0f766e; letter-spacing: 0.5px; }
  .brand-sub { font-size: 9pt; color: #666; margin-top: 2px; }
  .meta { text-align: right; font-size: 9pt; color: #444; }
  .meta .tit { font-size: 13pt; font-weight: 700; color: #1a1a1a; margin-bottom: 2px; }
  .note { margin: 10px 0; padding: 8px 12px; background: #fef3c7; border-left: 3px solid #f59e0b; font-size: 10pt; color: #78350f; border-radius: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  thead th { background: #f1f5f9; color: #0f172a; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; padding: 6px 8px; text-align: left; border-bottom: 2px solid #94a3b8; }
  thead th.r { text-align: right; }
  thead th.c { text-align: center; width: 30px; }
  tbody td { padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 10pt; vertical-align: top; }
  tbody td.num { color: #94a3b8; font-size: 9pt; width: 26px; text-align: center; }
  tbody td.scad { white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5pt; width: 100px; }
  tbody td.scad .tag { display: inline-block; margin-left: 4px; padding: 1px 5px; background: #dc2626; color: white; font-size: 7.5pt; font-weight: 700; border-radius: 3px; letter-spacing: 0.3px; }
  tbody tr.scaduta td.scad { color: #b91c1c; font-weight: 600; }
  tbody td.forn .forn-nome { font-weight: 600; color: #0f172a; }
  tbody td.forn .forn-desc { font-size: 9pt; color: #64748b; margin-top: 2px; }
  tbody td.forn .forn-note { font-size: 8.5pt; color: #94a3b8; margin-top: 2px; font-style: italic; }
  tbody td.iban { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9pt; color: #475569; letter-spacing: 0.3px; max-width: 220px; word-break: break-all; }
  tbody td.iban .mute { color: #cbd5e1; }
  tbody td.imp { text-align: right; font-weight: 600; white-space: nowrap; font-size: 10.5pt; }
  tbody td.check { width: 28px; border: 1px solid #cbd5e1; }
  tfoot td { padding: 10px 8px; font-weight: 700; font-size: 11pt; border-top: 2px solid #0f172a; background: #f8fafc; }
  tfoot td.label { text-align: right; }
  tfoot td.tot { text-align: right; color: #0f766e; font-size: 13pt; }
  .footer { margin-top: 24px; display: flex; justify-content: space-between; font-size: 9pt; color: #64748b; padding-top: 12px; border-top: 1px solid #e2e8f0; }
  .firm { width: 40%; }
  .firm-label { text-transform: uppercase; font-size: 8pt; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 28px; }
  .firm-line { border-top: 1px solid #475569; padding-top: 3px; text-align: center; font-size: 8.5pt; color: #475569; }
  .toolbar { position: fixed; top: 10px; right: 10px; display: flex; gap: 6px; }
  .toolbar button { background: #0f766e; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 10pt; font-weight: 600; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }
  .toolbar button:hover { background: #115e59; }
  .toolbar button.sec { background: #64748b; }
  @media print {
    .toolbar { display: none; }
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨 Stampa / Salva PDF</button>
    <button class="sec" onclick="window.close()">Chiudi</button>
  </div>

  <div class="header">
    <div>
      <div class="brand">OSTERIA TRE GOBBI</div>
      <div class="brand-sub">Elenco pagamenti da effettuare</div>
    </div>
    <div class="meta">
      <div class="tit">${escapeHtml(batch.titolo || "Pagamenti")}</div>
      <div>Emesso il ${dataBatch}</div>
      <div>Batch #${batch.id} &middot; ${batch.n_uscite} uscit${batch.n_uscite === 1 ? "a" : "e"}</div>
    </div>
  </div>

  ${batch.note ? `<div class="note">${escapeHtml(batch.note)}</div>` : ""}

  <table>
    <thead>
      <tr>
        <th class="c">#</th>
        <th>Scadenza</th>
        <th>Fornitore / Descrizione</th>
        <th>IBAN / Coordinate</th>
        <th class="r">Importo</th>
        <th class="c">OK</th>
      </tr>
    </thead>
    <tbody>
      ${righe}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" class="label">TOTALE DA PAGARE</td>
        <td class="tot">&euro; ${totale}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <div class="firm">
      <div class="firm-label">Preparato da</div>
      <div class="firm-line">Marco</div>
    </div>
    <div class="firm">
      <div class="firm-label">Eseguito da</div>
      <div class="firm-line">Data e firma</div>
    </div>
  </div>
</body>
</html>
    `;

    w.document.open();
    w.document.write(html);
    w.document.close();
    // Stampa auto dopo un breve delay per il rendering
    w.addEventListener("load", () => {
      setTimeout(() => w.focus(), 100);
    });
  };

  // Escape HTML per il template stampa
  const escapeHtml = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // filtroStato è un Set: conta come 1 filtro attivo se contiene almeno un valore
  const activeFilters = [
    search,
    filtroStato.size > 0,
    filtroTipo,
    filtroDa,
    filtroA,
    filtroInPagamento,
    includiRateizzate,
    includiEscluse,
  ].filter(Boolean).length;
  const clearFilters = () => {
    setSearch("");
    setFiltroStato(new Set());
    setFiltroTipo("");
    setFiltroDa("");
    setFiltroA("");
    setFiltroInPagamento(false);
    setIncludiRateizzate(false);
    setIncludiEscluse(false);
  };

  const fLbl = "block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5";
  const fSel = "w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-300";
  const fInp = fSel;

  return (
    <div className="min-h-screen bg-brand-cream">
      <ControlloGestioneNav current="uscite" />

      {/* SUB-HEADER BAR */}
      <div className="bg-white border-b border-neutral-200 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-sky-900 font-playfair">Scadenzario Uscite</h1>
          <span className="text-[10px] text-neutral-400">{loading ? "Caricamento..." : `${sorted.length} righe`}</span>
        </div>
        <button onClick={() => navigate("/controllo-gestione/spese-fisse")}
          className="px-3 py-1 text-xs rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50">
          Gestisci Spese Fisse
        </button>
      </div>

      {/* LAYOUT: Filtri SX + Contenuto DX (Nav 48px + sub-header 49px = 97px) */}
      <div className="flex" style={{ height: "calc(100dvh - 97px)" }}>

        {/* ══════ SIDEBAR FILTRI v2 (compatta, flat, sticky actions) ══════ */}
        <div className="w-sidebar-sm min-w-sidebar-sm border-r border-neutral-200 bg-white flex flex-col flex-shrink-0">

          {/* ── BODY SCROLLABILE ── */}
          <div className="flex-1 overflow-y-auto">

            {/* Ricerca */}
            <div className="px-3 pt-3 pb-2">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cerca fornitore, fattura…"
                className="w-full border border-neutral-300 rounded-md px-2.5 py-2.5 text-xs bg-neutral-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 placeholder:text-neutral-400" />
            </div>

            {/* Stato — multi-select (si sommano in OR) */}
            <div className="px-3 pb-3 border-b border-neutral-100">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Stato</div>
                {filtroStato.size > 0 && (
                  <Tooltip label="Azzera selezione stato">
                    <button onClick={() => setFiltroStato(new Set())}
                      className="text-[9px] text-neutral-400 hover:text-red-600">✕</button>
                  </Tooltip>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { value: "DA_PAGARE", label: "Programmato", n: allUscite.filter(u => u.stato === "DA_PAGARE").length, act: "bg-amber-100 text-amber-900 border-amber-300" },
                  { value: "SCADUTA",   label: "Scaduto",     n: allUscite.filter(u => u.stato === "SCADUTA").length,   act: "bg-red-100 text-red-900 border-red-300" },
                  { value: "PAGATA",    label: "Pagato",      n: allUscite.filter(u => u.stato === "PAGATA" || u.stato === "PAGATA_MANUALE").length, act: "bg-emerald-100 text-emerald-900 border-emerald-300" },
                  { value: "PARZIALE",  label: "Parziale",    n: allUscite.filter(u => u.stato === "PARZIALE").length,  act: "bg-blue-100 text-blue-900 border-blue-300" },
                ].map(o => {
                  const active = filtroStato.has(o.value);
                  return (
                    <button key={o.value} onClick={() => toggleStato(o.value)}
                      className={`px-2 py-1.5 rounded-md text-[11px] font-medium border transition flex flex-col items-start leading-tight ${
                        active ? o.act : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
                      }`}>
                      <span className="truncate w-full text-left">{o.label}</span>
                      <span className={`text-[9px] font-semibold tabular-nums ${active ? "opacity-70" : "text-neutral-400"}`}>{o.n}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tipo — segment control orizzontale */}
            <div className="px-3 py-3 border-b border-neutral-100">
              <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Tipo</div>
              <div className="flex rounded-md border border-neutral-200 bg-neutral-50 p-0.5">
                {[
                  { value: "", label: "Tutti" },
                  { value: "FATTURA", label: "Fatture" },
                  { value: "SPESA_FISSA", label: "Fisse" },
                  { value: "PROFORMA", label: "Proforme" },
                ].map(o => {
                  const active = filtroTipo === o.value;
                  return (
                    <button key={o.value} onClick={() => setFiltroTipo(active ? "" : o.value)}
                      className={`flex-1 px-2 py-2 rounded text-[11px] font-medium transition ${
                        active ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                      }`}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Periodo */}
            <div className="px-3 py-3 border-b border-neutral-100">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Periodo scadenza</div>
                {(filtroDa || filtroA) && (
                  <Tooltip label="Rimuovi periodo">
                    <button onClick={() => { setFiltroDa(""); setFiltroA(""); }}
                      className="text-[9px] text-neutral-400 hover:text-red-600">✕</button>
                  </Tooltip>
                )}
              </div>
              {/* Preset rapidi */}
              <div className="grid grid-cols-3 gap-1 mb-2">
                {(() => {
                  const oggi = new Date();
                  const y = oggi.getFullYear();
                  const m = oggi.getMonth();
                  const pad = (n) => String(n).padStart(2, "0");
                  const primoMese = `${y}-${pad(m + 1)}-01`;
                  const ultimoMese = `${y}-${pad(m + 1)}-${new Date(y, m + 1, 0).getDate()}`;
                  const meseProssimo1 = m + 1 > 11 ? `${y + 1}-01-01` : `${y}-${pad(m + 2)}-01`;
                  const meseProssimo2 = m + 1 > 11
                    ? `${y + 1}-01-${new Date(y + 1, 1, 0).getDate()}`
                    : `${y}-${pad(m + 2)}-${new Date(y, m + 2, 0).getDate()}`;
                  const inizioTrim = `${y}-${pad(m - (m % 3) + 1)}-01`;
                  const fineTrimM = m - (m % 3) + 3;
                  const fineTrim = fineTrimM > 12
                    ? `${y + 1}-01-${new Date(y + 1, 1, 0).getDate()}`
                    : `${y}-${pad(fineTrimM)}-${new Date(y, fineTrimM, 0).getDate()}`;
                  const oggiStr = oggi.toISOString().slice(0, 10);
                  const fra7 = new Date(oggi.getTime() + 7 * 86400000).toISOString().slice(0, 10);
                  const fra30 = new Date(oggi.getTime() + 30 * 86400000).toISOString().slice(0, 10);
                  const MESI_IT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
                  const isActive = (da, a) => filtroDa === da && filtroA === a;
                  const toggle = (da, a) => {
                    if (isActive(da, a)) { setFiltroDa(""); setFiltroA(""); }
                    else { setFiltroDa(da); setFiltroA(a); }
                  };
                  const cls = (active) => `px-2 py-2 rounded text-[10px] font-medium border transition truncate ${
                    active ? "bg-amber-100 text-amber-900 border-amber-300" : "bg-white text-neutral-600 border-neutral-200 hover:border-amber-200 hover:bg-amber-50/50"
                  }`;
                  return (
                    <>
                      <button onClick={() => toggle(oggiStr, fra7)} className={cls(isActive(oggiStr, fra7))}>7 gg</button>
                      <button onClick={() => toggle(oggiStr, fra30)} className={cls(isActive(oggiStr, fra30))}>30 gg</button>
                      <button onClick={() => toggle(primoMese, ultimoMese)} className={cls(isActive(primoMese, ultimoMese))}>{MESI_IT[m]}</button>
                      <button onClick={() => toggle(meseProssimo1, meseProssimo2)} className={cls(isActive(meseProssimo1, meseProssimo2))}>{MESI_IT[(m + 1) % 12]}</button>
                      <button onClick={() => toggle(inizioTrim, fineTrim)} className={cls(isActive(inizioTrim, fineTrim))}>Trim.</button>
                      <button onClick={() => toggle(`${y}-01-01`, `${y}-12-31`)} className={cls(isActive(`${y}-01-01`, `${y}-12-31`))}>{y}</button>
                    </>
                  );
                })()}
              </div>
              {/* Date Da / A inline */}
              <div className="flex gap-1">
                <div className="flex-1 min-w-0">
                  <label className="block text-[9px] text-neutral-400 mb-0.5">Da</label>
                  <input type="date" value={filtroDa} onChange={e => setFiltroDa(e.target.value)}
                    className="w-full border border-neutral-200 rounded px-2 py-1.5 text-[11px] bg-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-[9px] text-neutral-400 mb-0.5">A</label>
                  <input type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)}
                    className="w-full border border-neutral-200 rounded px-2 py-1.5 text-[11px] bg-white" />
                </div>
              </div>
            </div>

            {/* Filtri speciali — Rateizzate + Batch Pagamenti fusi */}
            <div className="px-3 py-3 border-b border-neutral-100">
              <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Filtri speciali</div>
              <div className="space-y-1">
                {/* Rateizzate */}
                <button onClick={() => setIncludiRateizzate(v => !v)}
                  className={`w-full flex items-center justify-between px-2.5 py-2.5 rounded-md text-[11px] transition border ${
                    includiRateizzate
                      ? "bg-purple-50 border-purple-200 text-purple-900"
                      : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  }`}>
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block w-2 h-2 rounded-full ${includiRateizzate ? "bg-purple-500" : "bg-neutral-300"}`}></span>
                    <span>Mostra rateizzate</span>
                  </span>
                </button>
                {/* Escluse (fornitori con escluso_acquisti=1) */}
                <Tooltip
                  label="Mostra le fatture di fornitori esclusi dagli acquisti (es. affitti importati da FIC). Di default sono nascoste per evitare doppio conteggio con le spese fisse CG."
                  className="w-full"
                >
                  <button onClick={() => setIncludiEscluse(v => !v)}
                    className={`w-full flex items-center justify-between px-2.5 py-2.5 rounded-md text-[11px] transition border ${
                      includiEscluse
                        ? "bg-amber-50 border-amber-200 text-amber-900"
                        : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                    }`}>
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-block w-2 h-2 rounded-full ${includiEscluse ? "bg-amber-500" : "bg-neutral-300"}`}></span>
                      <span>Mostra escluse</span>
                    </span>
                  </button>
                </Tooltip>
                {/* Solo in pagamento */}
                <button onClick={() => setFiltroInPagamento(v => !v)}
                  className={`w-full flex items-center justify-between px-2.5 py-2.5 rounded-md text-[11px] transition border ${
                    filtroInPagamento
                      ? "bg-indigo-50 border-indigo-200 text-indigo-900"
                      : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  }`}>
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block w-2 h-2 rounded-full ${filtroInPagamento ? "bg-indigo-500" : "bg-neutral-300"}`}></span>
                    <span>Solo in pagamento</span>
                  </span>
                  <span className={`text-[9px] tabular-nums ${filtroInPagamento ? "text-indigo-500" : "text-neutral-400"}`}>
                    {allUscite.filter(u => u.in_pagamento_at).length}
                  </span>
                </button>
                {/* Gestisci batch */}
                <button onClick={apriGestioneBatch}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-[11px] text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 transition border border-dashed border-neutral-300">
                  <span>⚙</span>
                  <span>Gestisci batch…</span>
                </button>
              </div>
            </div>

            {/* Riconciliazione — badge info */}
            {rig.num_da_riconciliare > 0 && (
              <div className="mx-3 my-3 px-2.5 py-2 rounded-md bg-violet-50 border border-violet-200">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-violet-800 tabular-nums leading-none">{rig.num_da_riconciliare}</span>
                  <span className="text-[10px] text-violet-700 uppercase tracking-wide">da riconciliare</span>
                </div>
                {rig.num_riconciliate > 0 && (
                  <div className="text-[9px] text-violet-500 mt-0.5">
                    {rig.num_riconciliate} già verificate in banca
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── FOOTER STICKY: AZIONI ── */}
          <div className="flex gap-1.5 p-2 border-t border-neutral-200 bg-neutral-50 flex-shrink-0">
            <button onClick={clearFilters} disabled={activeFilters === 0}
              className="flex-1 px-2.5 py-2.5 rounded-md text-[11px] font-semibold border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition">
              Pulisci{activeFilters > 0 && <span className="ml-1 text-sky-600">({activeFilters})</span>}
            </button>
            <button onClick={() => fetchData(true)} disabled={loading}
              className="flex-1 px-2.5 py-2.5 rounded-md text-[11px] font-semibold bg-sky-700 text-white hover:bg-sky-800 disabled:opacity-50 transition">
              {loading ? "..." : "Aggiorna"}
            </button>
          </div>

        </div>

        {/* ══════ COLONNA DESTRA: KPI + TABELLA ══════ */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* KPI BAR */}
          <div className="px-3 py-2 border-b border-neutral-200 bg-white flex flex-wrap gap-2 items-center flex-shrink-0">
            <KPI label="Programmato" value={kpi.da_pagare} n={kpi.n_da_pagare} color="amber"
              active={filtroStato.has("DA_PAGARE")} onClick={() => toggleStato("DA_PAGARE")} />
            <KPI label="Scaduto" value={kpi.scadute} n={kpi.n_scadute} color="red"
              active={filtroStato.has("SCADUTA")} onClick={() => toggleStato("SCADUTA")} />
            <KPI label="Pagato" value={kpi.pagate} n={kpi.n_pagate} color="emerald"
              active={filtroStato.has("PAGATA")} onClick={() => toggleStato("PAGATA")} />
            {/* KPI "Da riconciliare" — clic apre il workbench split-pane */}
            {rig.num_da_riconciliare > 0 && (
              <KPI
                label="Da riconciliare"
                n={rig.num_da_riconciliare}
                color="amber"
                dot
                onClick={() => navigate("/controllo-gestione/riconciliazione")}
                title="Apri il workbench riconciliazione"
              />
            )}
            {/* KPI "Riconciliate" — clic apre il cross-ref di Flussi di Cassa (tab collegati) */}
            {rig.num_riconciliate > 0 && (
              <KPI
                label="Riconciliate"
                n={rig.num_riconciliate}
                color="violet"
                dot
                onClick={() => navigate("/flussi-cassa/cc/crossref")}
                title="Vedi i movimenti bancari collegati"
              />
            )}
            <span className="ml-auto text-[10px] text-neutral-400 flex-shrink-0">
              {sorted.length} / {allUscite.length} righe
            </span>
          </div>

          {/* ── BARRA AZIONI BULK ── */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-teal-50 border-b border-teal-200 flex-shrink-0">
              <span className="text-xs font-semibold text-teal-800">
                {selected.size} selezionat{selected.size === 1 ? "a" : "e"}
              </span>
              {/* v3.1 (sessione 40): somma Excel-style del residuo sulle righe selezionate */}
              <span className="text-xs text-teal-700 tabular-nums">
                <span className="opacity-70">Somma:</span>{" "}
                <span className="font-bold text-teal-900">€ {fmt(sommaSelezionati)}</span>
              </span>
              <div className="h-5 w-px bg-teal-300 mx-0.5" />
              {/* Stampa + batch */}
              <Tooltip label="Crea un batch di pagamento, apre una stampa e marca le uscite come messe in pagamento">
                <button onClick={apriStampaBatch}
                  className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 flex items-center gap-1.5">
                  <span>🖨</span>
                  <span>Stampa / Metti in pagamento</span>
                </button>
              </Tooltip>
              <div className="h-5 w-px bg-teal-300 mx-1" />
              {/* Segna pagate */}
              <select value={bulkMetodo} onChange={e => setBulkMetodo(e.target.value)}
                className="border border-teal-300 rounded-lg px-2 py-1 text-xs bg-white">
                <option value="CONTO_CORRENTE">Conto corrente</option>
                <option value="CARTA">Carta</option>
                <option value="CONTANTI">Contanti</option>
                <option value="ASSEGNO">Assegno</option>
                <option value="BONIFICO">Bonifico</option>
              </select>
              <button onClick={segnaPagateBulk} disabled={bulkSaving}
                className="px-3 py-1 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50">
                {bulkSaving ? "Salvataggio..." : "Segna pagate"}
              </button>
              <button onClick={() => setSelected(new Set())}
                className="px-2 py-1 rounded-lg text-xs text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 ml-auto">
                Deseleziona
              </button>
            </div>
          )}

          {/* TABELLA SCROLLABILE con STICKY HEADER — o dettaglio fattura inline (v2.1) */}
          <div className="flex-1 overflow-auto min-h-0" ref={fatturaInlineRef}>
            {openFatturaId ? (() => {
              // Pattern split-pane stile MagazzinoVini/SchedaVino:
              // la lista è sostituita dal dettaglio, con barra di navigazione prev/next.
              const fatturePrev = sorted.filter(u => (u.tipo_uscita || "FATTURA") === "FATTURA" && u.fattura_id);
              const curIdx = fatturePrev.findIndex(u => u.fattura_id === openFatturaId);
              const prevFatt = curIdx > 0 ? fatturePrev[curIdx - 1] : null;
              const nextFatt = curIdx >= 0 && curIdx < fatturePrev.length - 1 ? fatturePrev[curIdx + 1] : null;
              const goTo = (u) => {
                if (fatturaCompRef.current?.hasPendingChanges?.()) {
                  if (!window.confirm("Hai modifiche non salvate. Vuoi passare a un'altra fattura?")) return;
                }
                setOpenFatturaId(u.fattura_id);
              };
              return (
                <div className="flex flex-col h-full">
                  {/* Barra navigazione inline */}
                  <div className="px-3 py-2 bg-sky-50 border-b border-sky-200 flex items-center gap-2 flex-shrink-0 sticky top-0 z-10">
                    <button onClick={() => {
                      if (fatturaCompRef.current?.hasPendingChanges?.()) {
                        if (!window.confirm("Hai modifiche non salvate. Vuoi tornare allo scadenzario?")) return;
                      }
                      setOpenFatturaId(null);
                      // ricarica i dati per riflettere eventuali modifiche salvate
                      fetchData(false);
                    }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-neutral-300 hover:bg-neutral-50 transition shadow-sm">
                      ← Lista
                    </button>
                    <div className="flex items-center gap-1 ml-2">
                      <Tooltip label={prevFatt ? `← ${prevFatt.fornitore_nome || ""}` : "Prima fattura"}>
                        <button onClick={() => prevFatt && goTo(prevFatt)} disabled={!prevFatt}
                          className="px-2 py-1 rounded-md text-xs font-bold bg-white border border-neutral-300 hover:bg-sky-100 transition shadow-sm disabled:opacity-30 disabled:cursor-not-allowed">
                          ‹
                        </button>
                      </Tooltip>
                      <span className="text-[10px] text-sky-700 font-medium min-w-[60px] text-center">
                        {curIdx >= 0 ? `${curIdx + 1} / ${fatturePrev.length}` : "—"}
                      </span>
                      <Tooltip label={nextFatt ? `→ ${nextFatt.fornitore_nome || ""}` : "Ultima fattura"}>
                        <button onClick={() => nextFatt && goTo(nextFatt)} disabled={!nextFatt}
                          className="px-2 py-1 rounded-md text-xs font-bold bg-white border border-neutral-300 hover:bg-sky-100 transition shadow-sm disabled:opacity-30 disabled:cursor-not-allowed">
                          ›
                        </button>
                      </Tooltip>
                    </div>
                    <span className="text-xs text-sky-800 font-medium ml-2">
                      Fattura #{openFatturaId}
                    </span>
                  </div>
                  {/* Contenuto dettaglio */}
                  <div className="flex-1 p-3 bg-neutral-50">
                    <FattureDettaglio
                      ref={fatturaCompRef}
                      fatturaId={openFatturaId}
                      inline={true}
                      onClose={() => { setOpenFatturaId(null); fetchData(false); }}
                      onFatturaUpdated={() => { /* refetch della lista lato parent al close */ }}
                    />
                  </div>
                </div>
              );
            })() : loading ? (
              <div className="text-center py-20 text-neutral-400">Caricamento...</div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-20 text-neutral-400 text-sm">
                {allUscite.length === 0 ? "Nessuna uscita. Verranno importate automaticamente." : "Nessun risultato per i filtri selezionati."}
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="bg-neutral-100 sticky top-0 z-10">
                  <tr className="text-[9px] text-neutral-600 uppercase tracking-wide select-none">
                    <th className="px-2 py-2 text-center w-8">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll}
                        className="rounded border-neutral-300 text-teal-600 focus:ring-teal-500"
                        title="Seleziona/deseleziona tutte le non pagate" />
                    </th>
                    <th className="px-3 py-2 text-left cursor-pointer hover:text-sky-700" onClick={() => handleSort("data_scadenza")}>
                      Scadenza <SortIcon col="data_scadenza" />
                    </th>
                    <th className="px-3 py-2 text-left cursor-pointer hover:text-sky-700" onClick={() => handleSort("fornitore_nome")}>
                      Fornitore <SortIcon col="fornitore_nome" />
                    </th>
                    <th className="px-3 py-2 text-left cursor-pointer hover:text-sky-700" onClick={() => handleSort("numero_fattura")}>
                      Fattura / Descrizione <SortIcon col="numero_fattura" />
                    </th>
                    <th className="px-3 py-2 text-right cursor-pointer hover:text-sky-700" onClick={() => handleSort("totale")}>
                      Importo <SortIcon col="totale" />
                    </th>
                    <th className="px-3 py-2 text-center cursor-pointer hover:text-sky-700" onClick={() => handleSort("stato")}>
                      Stato <SortIcon col="stato" />
                    </th>
                    <th className="px-3 py-2 text-left cursor-pointer hover:text-sky-700" onClick={() => handleSort("tipo_uscita")}>
                      Categoria <SortIcon col="tipo_uscita" />
                    </th>
                    <th className="px-3 py-2 text-center hidden xl:table-cell" title="Riconciliazione banca">
                      Banca
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((u) => {
                    const st = STATO_STYLE[u.stato] || STATO_STYLE.DA_PAGARE;
                    const residuo = (u.totale || 0) - (u.importo_pagato || 0);
                    const isSF = (u.tipo_uscita || "FATTURA") === "SPESA_FISSA";
                    const isStipendio = u.tipo_uscita === "STIPENDIO";
                    const isProforma = u.tipo_uscita === "PROFORMA";
                    const isRiconciliata = !!u.banca_movimento_id;
                    const puoRiconciliare = u.stato === "PAGATA_MANUALE" && !isRiconciliata;
                    const puoSelezionare = ["DA_PAGARE", "SCADUTA", "PARZIALE"].includes(u.stato);
                    const inPagamento = !!u.in_pagamento_at;

                    return (
                      <tr key={u.id}
                        onClick={() => handleRowClick(u)}
                        title={
                          (u.tipo_uscita || "FATTURA") === "FATTURA" && u.fattura_id
                            ? "Clicca per aprire il dettaglio fattura"
                            : (u.spesa_fissa_id ? "Clicca per aprire la spesa fissa" : "Clicca per modificare la scadenza")
                        }
                        className={`border-b border-neutral-100 hover:bg-sky-50/50 transition cursor-pointer ${
                        selected.has(u.id) ? "bg-teal-50/60" :
                        inPagamento ? "bg-indigo-50/50" :
                        u.stato === "RATEIZZATA" ? "bg-purple-50/40" :
                        u.stato === "SCADUTA" ? "bg-red-50/30" : isSF ? "bg-indigo-50/20" : isStipendio ? "bg-violet-50/20" : isProforma ? "bg-amber-50/20" : "bg-white"
                      }`}>
                        {/* CHECKBOX */}
                        <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                          {puoSelezionare ? (
                            <input type="checkbox" checked={selected.has(u.id)}
                              onChange={() => toggleSelect(u.id)}
                              className="rounded border-neutral-300 text-teal-600 focus:ring-teal-500" />
                          ) : (
                            <span className="text-neutral-200">{"\u00B7"}</span>
                          )}
                        </td>
                        {/* SCADENZA */}
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          {u.data_scadenza ? (
                            <span className={u.stato === "SCADUTA" ? "text-red-700 font-bold" : "text-neutral-700"}>
                              {fmtDateFull(u.data_scadenza)}
                            </span>
                          ) : (
                            <span className="text-neutral-300 italic">&mdash;</span>
                          )}
                        </td>
                        {/* FORNITORE */}
                        <td className="px-3 py-1.5">
                          <div className="font-medium text-neutral-800 truncate max-w-[180px]">{u.fornitore_nome}</div>
                        </td>
                        {/* FATTURA / DESCRIZIONE */}
                        <td className="px-3 py-1.5">
                          {isSF ? (
                            <span className="text-neutral-500 italic">
                              {u.periodo_riferimento || "&mdash;"}
                              {u.sf_frequenza && <span className="ml-1 text-[9px] text-neutral-400">({u.sf_frequenza.toLowerCase()})</span>}
                            </span>
                          ) : isStipendio ? (
                            <span className="text-violet-600 italic">
                              {cleanFatt(u.numero_fattura) || u.periodo_riferimento || "Stipendio"}
                            </span>
                          ) : isProforma ? (
                            <span className="text-amber-700 italic">
                              {u.note || "Proforma"}
                            </span>
                          ) : (
                            <>
                              <span className="text-neutral-700">{cleanFatt(u.numero_fattura) || "—"}</span>
                              {u.data_fattura && (
                                <span className="ml-1.5 text-[9px] text-neutral-400">{fmtDateFull(u.data_fattura)}</span>
                              )}
                            </>
                          )}
                        </td>
                        {/* IMPORTO */}
                        <td className="px-3 py-1.5 text-right">
                          <span className="font-semibold text-neutral-800">&euro; {fmt(u.totale)}</span>
                          {residuo > 0 && residuo < u.totale && (
                            <div className="text-[9px] text-amber-600">res. &euro; {fmt(residuo)}</div>
                          )}
                        </td>
                        {/* STATO */}
                        <td className="px-3 py-1.5 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text} ${st.border} border`}>
                              {st.label}
                            </span>
                            {inPagamento && (
                              <Tooltip label={u.batch_titolo ? `Batch: ${u.batch_titolo}` : "In pagamento"}>
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                                  <span>🖨</span>
                                  <span>In pagamento</span>
                                </span>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                        {/* CATEGORIA */}
                        <td className="px-3 py-1.5">
                          {isSF ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 font-medium">
                              {u.sf_tipo_label || "Spesa fissa"}
                            </span>
                          ) : isStipendio ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 font-medium">
                              Stipendio
                            </span>
                          ) : isProforma ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                              Proforma
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                              Fattura
                            </span>
                          )}
                        </td>
                        {/* BANCA (riconciliazione) — nascosta su iPad (<1280px) */}
                        <td className="px-3 py-1.5 text-center hidden xl:table-cell" onClick={e => e.stopPropagation()}>
                          {isRiconciliata ? (
                            <Tooltip label="Riconciliata — click per scollegare">
                              <button onClick={() => scollegaMovimento(u.id)}
                                className="inline-flex items-center gap-0.5 text-emerald-600 hover:text-red-500 transition">
                                <BancaCheckIcon size={14} />
                              </button>
                            </Tooltip>
                          ) : puoRiconciliare ? (
                            <Tooltip label="Collega a movimento bancario">
                              <button onClick={() => apriRiconciliazione(u)}
                                className="inline-flex items-center gap-0.5 text-violet-500 hover:text-violet-700 transition hover:scale-110">
                                <BancaLinkIcon size={14} />
                              </button>
                            </Tooltip>
                          ) : u.stato === "PAGATA" && u.banca_movimento_id ? (
                            <BancaCheckIcon size={14} className="text-emerald-400" />
                          ) : (
                            <span className="text-neutral-200">&mdash;</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>

      {/* ══════ MODALE GESTIONE BATCH (lista + delete) ══════ */}
      {gestioneBatchOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setGestioneBatchOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-neutral-200 bg-indigo-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                <span>⚙</span>
                <span>Gestione Batch Pagamenti</span>
              </h3>
              <button onClick={() => setGestioneBatchOpen(false)}
                className="text-neutral-500 hover:text-neutral-900 text-xl leading-none">×</button>
            </div>

            <div className="px-5 py-3 text-[11px] text-neutral-600 bg-amber-50 border-b border-amber-100">
              Eliminare un batch <strong>non cancella</strong> le uscite collegate: vengono solo scollegate dal batch e tornano
              al loro stato originale (DA_PAGARE / SCADUTA / PAGATA). Utile per ripulire test o annullare un invio sbagliato.
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingBatchList ? (
                <div className="p-8 text-center text-neutral-500 text-sm">Caricamento…</div>
              ) : batchList.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 text-sm">Nessun batch presente.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-neutral-50 text-neutral-600 uppercase text-[10px] tracking-wide">
                    <tr>
                      <th className="text-left px-3 py-2">Titolo</th>
                      <th className="text-left px-3 py-2">Creato</th>
                      <th className="text-right px-3 py-2">Uscite</th>
                      <th className="text-right px-3 py-2">Totale</th>
                      <th className="text-center px-3 py-2">Stato</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {batchList.map(b => {
                      const created = b.created_at
                        ? new Date(b.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "—";
                      const totale = Number(b.totale || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      const statoColors = {
                        IN_PAGAMENTO: "bg-indigo-100 text-indigo-800",
                        INVIATO_CONTABILE: "bg-amber-100 text-amber-800",
                        CHIUSO: "bg-emerald-100 text-emerald-800",
                      };
                      return (
                        <tr key={b.id} className="hover:bg-neutral-50">
                          <td className="px-3 py-2">
                            <div className="font-semibold text-neutral-800">{b.titolo || "—"}</div>
                            {b.note && <div className="text-[10px] text-neutral-500 mt-0.5">{b.note}</div>}
                          </td>
                          <td className="px-3 py-2 text-neutral-600">{created}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{b.n_uscite}</td>
                          <td className="px-3 py-2 text-right tabular-nums">€ {totale}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${statoColors[b.stato] || "bg-neutral-100 text-neutral-700"}`}>
                              {b.stato}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => eliminaBatch(b)}
                              disabled={deletingBatchId === b.id}
                              className="px-2 py-1 rounded-md text-[11px] font-semibold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 disabled:opacity-50">
                              {deletingBatchId === b.id ? "Elimino…" : "🗑 Elimina"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex justify-end">
              <button onClick={() => setGestioneBatchOpen(false)}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-neutral-200 hover:bg-neutral-300 text-neutral-800">
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODALE CONFERMA STAMPA / BATCH PAGAMENTO ══════ */}
      {stampaModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !batchSaving && setStampaModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-neutral-200 bg-indigo-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                    <span>🖨</span> Crea batch di pagamento
                  </h3>
                  <p className="text-[11px] text-indigo-600 mt-0.5">
                    {selected.size} uscit{selected.size === 1 ? "a" : "e"} selezionat{selected.size === 1 ? "a" : "e"} — verranno marcate come "In pagamento"
                  </p>
                </div>
                <button onClick={() => setStampaModal(false)} disabled={batchSaving}
                  className="text-neutral-400 hover:text-neutral-600 text-lg leading-none">&times;</button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-neutral-600 block mb-1">Titolo batch</label>
                <input type="text" value={batchTitolo}
                  onChange={e => setBatchTitolo(e.target.value)}
                  placeholder="Pagamenti del ..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
                <p className="text-[10px] text-neutral-400 mt-1">Comparirà in stampa e sarà visibile nella futura dashboard contabile</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-600 block mb-1">Note (opzionale)</label>
                <textarea value={batchNote}
                  onChange={e => setBatchNote(e.target.value)}
                  placeholder="Istruzioni o note per chi esegue i pagamenti..."
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none resize-none" />
              </div>
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg px-3 py-2 text-[11px] text-indigo-700 space-y-1">
                <div className="flex items-center gap-2"><span>✔</span> Si aprirà una finestra di stampa pronta (A4)</div>
                <div className="flex items-center gap-2"><span>✔</span> Le uscite vengono marcate <strong>"In pagamento"</strong> nello scadenzario</div>
                <div className="flex items-center gap-2"><span>✔</span> Il batch resta tracciato per future consegne al contabile</div>
              </div>
            </div>
            <div className="px-5 py-3 bg-neutral-50 border-t border-neutral-200 flex justify-end gap-2">
              <button onClick={() => setStampaModal(false)} disabled={batchSaving}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-neutral-700 hover:bg-neutral-200">
                Annulla
              </button>
              <button onClick={confermaStampaBatch} disabled={batchSaving}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {batchSaving ? "Creazione batch..." : "Crea batch e stampa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODALE MODIFICA SCADENZA ══════ */}
      {modaleScadenza && (() => {
        const orig = modaleScadenza.data_scadenza_originale || modaleScadenza.data_scadenza;
        let deltaGG = 0;
        if (orig && nuovaScadenza) {
          try {
            deltaGG = Math.round((new Date(nuovaScadenza) - new Date(orig)) / 86400000);
          } catch (_) {}
        }
        const isArretrato = Math.abs(deltaGG) > 10;
        const cambiata = nuovaScadenza !== (modaleScadenza.data_scadenza || "");
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={() => setModaleScadenza(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="px-5 py-3 border-b border-neutral-200 bg-sky-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-sky-900">Modifica Scadenza</h3>
                    <p className="text-[11px] text-sky-600 mt-0.5">
                      {modaleScadenza.fornitore_nome} — € {fmt(modaleScadenza.totale)}
                    </p>
                  </div>
                  <button onClick={() => setModaleScadenza(null)}
                    className="text-neutral-400 hover:text-neutral-600 text-lg leading-none">&times;</button>
                </div>
              </div>
              <div className="p-5 space-y-4">
                {/* Info attuale */}
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-neutral-500">Scadenza attuale: </span>
                    <span className="font-semibold text-neutral-800">{fmtDateFull(modaleScadenza.data_scadenza) || "—"}</span>
                  </div>
                  {orig && orig !== modaleScadenza.data_scadenza && (
                    <div>
                      <span className="text-neutral-400">Originale: </span>
                      <span className="text-neutral-600">{fmtDateFull(orig)}</span>
                    </div>
                  )}
                </div>

                {/* Input nuova data */}
                <div>
                  <label className="text-xs font-semibold text-neutral-600 block mb-1">Nuova scadenza</label>
                  <input type="date" value={nuovaScadenza} onChange={e => setNuovaScadenza(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-300 focus:outline-none" />
                </div>

                {/* Indicatore delta */}
                {cambiata && nuovaScadenza && (
                  <div className={`rounded-lg px-3 py-2 text-xs ${
                    isArretrato
                      ? "bg-amber-50 border border-amber-200 text-amber-800"
                      : "bg-emerald-50 border border-emerald-200 text-emerald-800"
                  }`}>
                    {deltaGG > 0 ? `+${deltaGG}` : deltaGG} giorni rispetto all'originale
                    {isArretrato
                      ? " — diventerà arretrato"
                      : " — resta spesa corrente"}
                  </div>
                )}

                {/* Stato uscita */}
                <div className="text-[10px] text-neutral-400">
                  Stato: <span className="font-medium text-neutral-600">{(STATO_STYLE[modaleScadenza.stato] || {}).label || modaleScadenza.stato}</span>
                  {modaleScadenza.numero_fattura && <span className="ml-2">Fatt. {modaleScadenza.numero_fattura}</span>}
                </div>
              </div>
              <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex justify-end gap-2">
                <button onClick={() => setModaleScadenza(null)}
                  className="px-4 py-1.5 rounded-lg border border-neutral-300 text-neutral-600 text-xs hover:bg-neutral-100">
                  Annulla
                </button>
                <button onClick={salvaScadenza} disabled={savingScadenza || !cambiata || !nuovaScadenza}
                  className="px-4 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-50">
                  {savingScadenza ? "Salvataggio..." : "Salva"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════ MODALE RICONCILIAZIONE ══════ */}
      {modaleBanca && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setModaleBanca(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden"
            onClick={e => e.stopPropagation()}>

            {/* Header modale */}
            <div className="px-5 py-3 border-b border-neutral-200 bg-violet-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-violet-900">Riconcilia con Banca</h3>
                  <p className="text-[11px] text-violet-600 mt-0.5">
                    {modaleBanca.fornitore} &mdash; &euro; {fmt(modaleBanca.totale)}
                  </p>
                </div>
                <button onClick={() => setModaleBanca(null)}
                  className="text-neutral-400 hover:text-neutral-600 text-lg leading-none">&times;</button>
              </div>
            </div>

            {/* Body modale */}
            <div className="p-5 overflow-y-auto max-h-[60vh]">
              {loadingCandidati ? (
                <div className="text-center py-8 text-neutral-400">Ricerca movimenti...</div>
              ) : candidati.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-neutral-400 text-sm">Nessun movimento bancario compatibile trovato</div>
                  <div className="text-[10px] text-neutral-300 mt-1">
                    Criteri: importo &plusmn;10%, data &plusmn;15 giorni
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[10px] text-neutral-500 mb-2">
                    {candidati.length} moviment{candidati.length === 1 ? "o" : "i"} compatibil{candidati.length === 1 ? "e" : "i"}
                  </div>
                  {candidati.map((c) => (
                    <div key={c.id}
                      className="border border-neutral-200 rounded-lg p-3 hover:border-violet-300 hover:bg-violet-50/30 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-neutral-800 truncate">
                            {c.descrizione || "Movimento senza descrizione"}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-neutral-500">
                            <span>{fmtDateFull(c.data_contabile)}</span>
                            <span className="font-semibold text-neutral-700">&euro; {fmt(c.importo_abs)}</span>
                            {c.match_pct >= 99 ? (
                              <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                                Match esatto
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                {c.match_pct}% match
                              </span>
                            )}
                          </div>
                          {c.categoria_banca && (
                            <div className="text-[9px] text-neutral-400 mt-0.5">{c.categoria_banca}</div>
                          )}
                        </div>
                        <button
                          onClick={() => collegaMovimento(c.id)}
                          disabled={linkingId === c.id}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 flex-shrink-0">
                          {linkingId === c.id ? "..." : "Collega"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function KPI({ label, value, n, color, active, onClick, dot = false, title }) {
  const cm = {
    amber:   "border-amber-200 bg-amber-50 text-amber-800",
    red:     "border-red-200 bg-red-50 text-red-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    violet:  "border-violet-200 bg-violet-50 text-violet-800",
    sky:     "border-sky-200 bg-sky-50 text-sky-800",
  };
  const dotColor = {
    amber: "bg-amber-500", red: "bg-red-500",
    emerald: "bg-emerald-500", violet: "bg-violet-500", sky: "bg-sky-500",
  };
  const btn = (
    <button onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${cm[color] || ""} ${active ? "ring-2 ring-sky-400 shadow-md" : "hover:shadow-sm"}`}>
      {dot && <span className={`inline-block w-2 h-2 rounded-full ${dotColor[color] || "bg-neutral-400"}`}></span>}
      <span>{label}</span>
      {value != null && <span className="font-bold">&euro; {fmt(value)}</span>}
      {n != null && <span className="opacity-50 font-normal text-[9px]">({n})</span>}
    </button>
  );
  // Se c'è un title usiamo il componente <Tooltip> (touch-friendly con
  // tap-toggle su iPad); altrimenti rendiamo solo il bottone nudo.
  return title ? <Tooltip label={title}>{btn}</Tooltip> : btn;
}


// ── Icone SVG inline ──
function BancaCheckIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="7" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M2 10h16" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 14l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 7V5a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function BancaLinkIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="7" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M2 10h16" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 7V5a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="10" cy="14" r="1.5" fill="currentColor" />
    </svg>
  );
}
