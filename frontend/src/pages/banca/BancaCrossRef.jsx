// @version: v5.2-bulk-parcheggia-senza-match (S40-12) — tab Parcheggiati, azioni bulk
// Riconciliazione — match movimenti bancari ↔ fatture, spese fisse, registrazione diretta
// v5: multi-link (bonifici multi-fattura), ricerca entrate (storni), dedup, matching migliorato
// v5.1: chiusura manuale riconciliazione n-a-1 (mig 059) per N/C, bonifici multipli, fattura+rata
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FlussiCassaNav from "./FlussiCassaNav";
import Tooltip from "../../components/Tooltip";

const FC = `${API_BASE}/banca`;

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
  } catch { return d; }
};

const TIPO_LABELS = {
  FATTURA: "Fattura",
  SPESA_FISSA: "Spesa fissa",
  AFFITTO: "Affitto",
  TASSA: "Tassa",
  STIPENDIO: "Stipendio",
  PRESTITO: "Prestito",
  RATEIZZAZIONE: "Rata",
  ASSICURAZIONE: "Assicurazione",
  ALTRO: "Altro",
  SPESA_BANCARIA: "Spese bancarie",
  COMMISSIONE_POS: "Comm. POS",
  IMPOSTA_BOLLO: "Bollo",
  CARTA_CREDITO: "Carta credito",
  MUTUO: "Mutuo",
  EFFETTI: "Effetti/RIBA",
  SDD: "SDD",
  ALTRO_USCITA: "Altra uscita",
  INCASSO_POS: "Incasso POS",
  INCASSO_CONTANTI: "Contanti",
  BONIFICO_ENTRATA: "Bonifico",
  ALTRO_ENTRATA: "Altra entrata",
};

const TIPO_COLORS = {
  FATTURA: "bg-blue-100 text-blue-700 border-blue-200",
  SPESA_FISSA: "bg-violet-100 text-violet-700 border-violet-200",
  AFFITTO: "bg-amber-100 text-amber-700 border-amber-200",
  TASSA: "bg-red-100 text-red-700 border-red-200",
  STIPENDIO: "bg-emerald-100 text-emerald-700 border-emerald-200",
  PRESTITO: "bg-orange-100 text-orange-700 border-orange-200",
  RATEIZZAZIONE: "bg-orange-100 text-orange-700 border-orange-200",
  ASSICURAZIONE: "bg-sky-100 text-sky-700 border-sky-200",
  SPESA_BANCARIA: "bg-slate-100 text-slate-700 border-slate-200",
  COMMISSIONE_POS: "bg-slate-100 text-slate-700 border-slate-200",
  IMPOSTA_BOLLO: "bg-slate-100 text-slate-700 border-slate-200",
  CARTA_CREDITO: "bg-pink-100 text-pink-700 border-pink-200",
  MUTUO: "bg-rose-100 text-rose-700 border-rose-200",
  EFFETTI: "bg-indigo-100 text-indigo-700 border-indigo-200",
  SDD: "bg-purple-100 text-purple-700 border-purple-200",
  ALTRO_USCITA: "bg-neutral-100 text-neutral-600 border-neutral-200",
  INCASSO_POS: "bg-teal-100 text-teal-700 border-teal-200",
  INCASSO_CONTANTI: "bg-lime-100 text-lime-700 border-lime-200",
  BONIFICO_ENTRATA: "bg-cyan-100 text-cyan-700 border-cyan-200",
  ALTRO_ENTRATA: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

const CAT_USCITA_DEFAULT = [
  { key: "SPESA_BANCARIA", label: "Spese bancarie" },
  { key: "ALTRO_USCITA", label: "Altra uscita" },
];
const CAT_ENTRATA_DEFAULT = [
  { key: "INCASSO_POS", label: "Incasso POS" },
  { key: "ALTRO_ENTRATA", label: "Altra entrata" },
];

const tipoBadge = (tipo) => (
  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${TIPO_COLORS[tipo] || "bg-neutral-100 text-neutral-600 border-neutral-200"}`}>
    {TIPO_LABELS[tipo] || tipo}
  </span>
);

const TABS = [
  { key: "suggerimenti", label: "Suggerimenti",  icon: "💡", desc: "Match automatici" },
  { key: "senza",        label: "Senza match",   icon: "❓", desc: "Ricerca manuale" },
  { key: "parcheggiati", label: "Parcheggiati",  icon: "🅿️", desc: "In attesa di analisi" },
  { key: "collegati",    label: "Collegati",      icon: "✅", desc: "Già riconciliati" },
];

// ── Tipi di link selezionabili nel filtro sidebar ──
const TIPO_LINK_OPTIONS = [
  { key: "FATTURA",      label: "Fattura",        group: "out" },
  { key: "SPESA_FISSA",  label: "Spesa fissa",    group: "out" },
  { key: "AFFITTO",      label: "Affitto",        group: "out" },
  { key: "STIPENDIO",    label: "Stipendio",      group: "out" },
  { key: "TASSA",        label: "Tassa",          group: "out" },
  { key: "RATEIZZAZIONE",label: "Rata",           group: "out" },
  { key: "ASSICURAZIONE",label: "Assicurazione",  group: "out" },
  { key: "ENTRATA",      label: "Entrate reg.",   group: "in" },
  { key: "NESSUNO",      label: "Nessun link",    group: "none" },
];

// ── Filtri di default ──
const DEFAULT_FILTERS = {
  datePreset: "all",   // 'mese' | 'trim' | 'anno' | 'all' | 'custom'
  dateFrom: "",
  dateTo: "",
  importoMin: "",
  importoMax: "",
  direzione: "all",    // 'all' | 'uscite' | 'entrate'
  tipoLink: [],        // subset di TIPO_LINK_OPTIONS keys
  searchText: "",
};

// Converte datePreset + custom range in {from, to} YYYY-MM-DD
function resolveDateRange({ datePreset, dateFrom, dateTo }) {
  const today = new Date();
  const iso = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  if (datePreset === "mese") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: iso(from), to: iso(today) };
  }
  if (datePreset === "trim") {
    const from = new Date(today);
    from.setMonth(from.getMonth() - 3);
    return { from: iso(from), to: iso(today) };
  }
  if (datePreset === "anno") {
    const from = new Date(today.getFullYear(), 0, 1);
    return { from: iso(from), to: iso(today) };
  }
  if (datePreset === "custom") {
    return { from: dateFrom || "", to: dateTo || "" };
  }
  return { from: "", to: "" }; // all
}

// ═══════════════════════════════════════════════════════════════
// FilterPanel — pannello filtri riutilizzabile (sidebar + mobile)
// ═══════════════════════════════════════════════════════════════
function FilterPanel({ filters, update, reset, toggleTipoLink, activeCount, compact = false }) {
  const btnBase = "px-2 py-1 rounded-md text-[11px] font-medium border transition";
  const btnOn   = "bg-emerald-600 text-white border-emerald-600 shadow-sm";
  const btnOff  = "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50";

  return (
    <div className="space-y-4">
      {/* Header con clear */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Filtri</span>
          {activeCount > 0 && (
            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full px-2 py-0.5">
              {activeCount} {activeCount === 1 ? "attivo" : "attivi"}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button onClick={reset}
            className="text-[10px] text-red-500 hover:text-red-700 font-medium underline-offset-2 hover:underline">
            Pulisci tutti
          </button>
        )}
      </div>

      {/* Ricerca testuale */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 block mb-1">Cerca</label>
        <div className="relative">
          <input type="text" value={filters.searchText}
            onChange={(e) => update({ searchText: e.target.value })}
            placeholder="Descrizione, fornitore, importo..."
            className="w-full px-3 py-2 pr-8 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          {filters.searchText && (
            <button onClick={() => update({ searchText: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-sm">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Periodo */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 block mb-1">Periodo</label>
        <div className="flex flex-wrap gap-1">
          {[
            { k: "all",  l: "Tutto" },
            { k: "mese", l: "Mese" },
            { k: "trim", l: "3 mesi" },
            { k: "anno", l: "Anno" },
            { k: "custom", l: "Custom" },
          ].map(o => (
            <button key={o.k} onClick={() => update({ datePreset: o.k })}
              className={`${btnBase} ${filters.datePreset === o.k ? btnOn : btnOff}`}>
              {o.l}
            </button>
          ))}
        </div>
        {filters.datePreset === "custom" && (
          <div className="grid grid-cols-2 gap-1 mt-2">
            <input type="date" value={filters.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })}
              className="px-2 py-1 rounded-md border border-neutral-300 text-[11px] focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            <input type="date" value={filters.dateTo} onChange={(e) => update({ dateTo: e.target.value })}
              className="px-2 py-1 rounded-md border border-neutral-300 text-[11px] focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          </div>
        )}
      </div>

      {/* Direzione */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 block mb-1">Direzione</label>
        <div className="flex gap-1">
          {[
            { k: "all",     l: "Tutti" },
            { k: "uscite",  l: "Uscite" },
            { k: "entrate", l: "Entrate" },
          ].map(o => (
            <button key={o.k} onClick={() => update({ direzione: o.k })}
              className={`${btnBase} flex-1 ${filters.direzione === o.k ? btnOn : btnOff}`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {/* Range importo */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 block mb-1">Importo (€)</label>
        <div className="grid grid-cols-2 gap-1">
          <input type="number" value={filters.importoMin} onChange={(e) => update({ importoMin: e.target.value })}
            placeholder="min" inputMode="decimal"
            className="px-2 py-1 rounded-md border border-neutral-300 text-[11px] focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          <input type="number" value={filters.importoMax} onChange={(e) => update({ importoMax: e.target.value })}
            placeholder="max" inputMode="decimal"
            className="px-2 py-1 rounded-md border border-neutral-300 text-[11px] focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
      </div>

      {/* Tipo link */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 block mb-1">Tipo link</label>
        <div className="flex flex-wrap gap-1">
          {TIPO_LINK_OPTIONS.map(o => {
            const active = filters.tipoLink.includes(o.key);
            return (
              <button key={o.key} onClick={() => toggleTipoLink(o.key)}
                className={`${btnBase} ${active ? btnOn : btnOff}`}>
                {o.label}
              </button>
            );
          })}
        </div>
        {filters.tipoLink.length > 0 && (
          <button onClick={() => update({ tipoLink: [] })}
            className="text-[10px] text-neutral-400 hover:text-neutral-700 mt-1">
            Deseleziona tutti
          </button>
        )}
      </div>
    </div>
  );
}

function SortTh({ label, field, sort, onSort, className = "" }) {
  const active = sort.field === field;
  const arrow = active ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th onClick={() => onSort(field)}
      className={`px-3 py-2 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-800 whitespace-nowrap ${className}`}>
      {label}{arrow}
    </th>
  );
}

function sortRows(rows, sort) {
  if (!sort.field) return rows;
  return [...rows].sort((a, b) => {
    let va = a[sort.field], vb = b[sort.field];
    if (sort.field === "importo") {
      va = Math.abs(va || 0); vb = Math.abs(vb || 0);
    }
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return sort.dir === "asc" ? va - vb : vb - va;
    return sort.dir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
}

export default function BancaCrossRef() {
  const [movimenti, setMovimenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("suggerimenti");
  const [linking, setLinking] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [searchId, setSearchId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  // ── Filtri (oggetto unico) ──
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchDebounced, setSearchDebounced] = useState("");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false); // mobile drawer
  const [sort, setSort] = useState({ field: "data_contabile", dir: "desc" });
  const [dismissed, setDismissed] = useState(new Set());
  const [registraId, setRegistraId] = useState(null);
  const [registraCat, setRegistraCat] = useState("");
  const [registering, setRegistering] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkCat, setBulkCat] = useState("");
  const [bulkRegistering, setBulkRegistering] = useState(false);
  // S40-13 — descrizioni espanse (tap-to-expand su iPad)
  const [expandedDesc, setExpandedDesc] = useState(() => new Set());
  const toggleDesc = (id) => setExpandedDesc(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const [catUscita, setCatUscita] = useState(CAT_USCITA_DEFAULT);
  const [catEntrata, setCatEntrata] = useState(CAT_ENTRATA_DEFAULT);
  // Duplicati
  const [dupGroups, setDupGroups] = useState([]);
  const [showDup, setShowDup] = useState(false);
  const [dupDeleting, setDupDeleting] = useState(false);
  const debounceRef = useRef(null);

  // ── Chiave query per i filtri server-side (trigger reload) ──
  const serverParams = useMemo(() => {
    const p = new URLSearchParams();
    const { from, to } = resolveDateRange(filters);
    if (from) p.set("data_da", from);
    if (to)   p.set("data_a", to);
    if (filters.importoMin !== "" && !isNaN(Number(filters.importoMin))) {
      p.set("importo_min", String(Number(filters.importoMin)));
    }
    if (filters.importoMax !== "" && !isNaN(Number(filters.importoMax))) {
      p.set("importo_max", String(Number(filters.importoMax)));
    }
    if (filters.direzione !== "all") p.set("direzione", filters.direzione);
    return p.toString();
  }, [filters.datePreset, filters.dateFrom, filters.dateTo, filters.importoMin, filters.importoMax, filters.direzione]);

  // Debounce text search (200ms)
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(filters.searchText), 200);
    return () => clearTimeout(t);
  }, [filters.searchText]);

  // Carica categorie e duplicati una volta
  useEffect(() => { loadCategorie(); loadDuplicati(); }, []);

  // Ricarica movimenti quando cambiano i filtri server-side
  useEffect(() => { loadData(); }, [serverParams]);

  const loadCategorie = async () => {
    try {
      const resp = await apiFetch(`${FC}/cross-ref/categorie`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.uscita) setCatUscita(Object.entries(data.uscita).map(([key, label]) => ({ key, label })));
      if (data.entrata) setCatEntrata(Object.entries(data.entrata).map(([key, label]) => ({ key, label })));
    } catch (_) {}
  };

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const qs = serverParams ? `?${serverParams}` : "";
      const resp = await apiFetch(`${FC}/cross-ref${qs}`);
      if (!resp.ok) throw new Error("Errore caricamento");
      setMovimenti(await resp.json());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // ── Helpers per aggiornare i filtri ──
  const updateFilter = (patch) => setFilters(f => ({ ...f, ...patch }));
  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  const toggleTipoLink = (key) => {
    setFilters(f => {
      const has = f.tipoLink.includes(key);
      return { ...f, tipoLink: has ? f.tipoLink.filter(k => k !== key) : [...f.tipoLink, key] };
    });
  };

  // Conteggio filtri attivi (esclude "all")
  const activeFiltersCount = useMemo(() => {
    let n = 0;
    if (filters.datePreset !== "all") n++;
    if (filters.importoMin !== "" || filters.importoMax !== "") n++;
    if (filters.direzione !== "all") n++;
    if (filters.tipoLink.length > 0) n++;
    if (filters.searchText.trim()) n++;
    return n;
  }, [filters]);

  const loadDuplicati = async () => {
    try {
      const resp = await apiFetch(`${FC}/duplicati`);
      if (resp.ok) setDupGroups(await resp.json());
    } catch (_) {}
  };

  // ── Helpers: un movimento è "completamente collegato" se ha links e residuo < 1 ──
  // oppure se è stato marcato come "riconciliazione chiusa manualmente" (mig 059)
  const isFullyLinked = (m) => !!m.riconciliazione_chiusa || ((m.links?.length > 0) && Math.abs(m.residuo ?? 0) < 1.0);
  const isPartiallyLinked = (m) => !m.riconciliazione_chiusa && (m.links?.length > 0) && Math.abs(m.residuo ?? 0) >= 1.0;

  const handleLink = async (movimentoId, source, sourceId) => {
    setLinking(movimentoId);
    try {
      const body = { movimento_id: movimentoId };
      if (source === "fattura") body.fattura_id = sourceId;
      else if (source === "uscita") body.uscita_id = sourceId;
      else if (source === "entrata") body.entrata_id = sourceId;
      const resp = await apiFetch(`${FC}/cross-ref/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.detail || "Errore collegamento"); }
      setSearchId(null); setSearchQuery(""); setSearchResults([]); setExpandedId(null);
      await loadData();
    } catch (err) { setError(err.message); }
    finally { setLinking(null); }
  };

  const handleDismiss = (movId) => {
    setDismissed(prev => new Set(prev).add(movId));
    setExpandedId(null);
    setTab("senza");
    setSearchId(movId);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleUndismiss = (movId) => {
    setDismissed(prev => { const s = new Set(prev); s.delete(movId); return s; });
    setSearchId(null);
  };

  const handleUnlink = async (linkId) => {
    try {
      await apiFetch(`${FC}/cross-ref/link/${linkId}`, { method: "DELETE" });
      await loadData();
    } catch (_) {}
  };

  // ── Chiusura manuale riconciliazione (mig 059) ──
  const handleChiudiRiconciliazione = async (movId) => {
    const note = window.prompt(
      "Chiudi riconciliazione manualmente.\n" +
      "Es. 'N/C sconto', 'bonifico F1+F2', 'fattura + rata'.\n" +
      "(Nota opzionale, puoi lasciare vuoto)",
      ""
    );
    if (note === null) return; // annullato
    try {
      const resp = await apiFetch(`${FC}/cross-ref/chiudi/${movId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note || null }),
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.detail || "Errore chiusura");
      }
      await loadData();
    } catch (err) { setError(err.message); }
  };

  const handleRiapriRiconciliazione = async (movId) => {
    if (!window.confirm("Riaprire la riconciliazione di questo movimento? Tornerà tra i suggerimenti.")) return;
    try {
      const resp = await apiFetch(`${FC}/cross-ref/riapri/${movId}`, { method: "POST" });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.detail || "Errore riapertura");
      }
      await loadData();
    } catch (err) { setError(err.message); }
  };

  // ── Registra spesa/entrata ──
  const openRegistra = (movId) => {
    const mov = movimenti.find(m => m.id === movId);
    const autoCat = mov?.auto_categoria || (mov?.importo >= 0 ? "INCASSO_POS" : "SPESA_BANCARIA");
    setRegistraId(movId);
    setRegistraCat(autoCat);
  };

  const handleRegistra = async () => {
    if (!registraId || !registraCat) return;
    setRegistering(true);
    try {
      const resp = await apiFetch(`${FC}/cross-ref/registra`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimento_id: registraId, categoria: registraCat }),
      });
      if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.detail || "Errore"); }
      setRegistraId(null);
      setRegistraCat("");
      await loadData();
    } catch (err) { setError(err.message); }
    finally { setRegistering(false); }
  };

  // ── Selezione multipla (bulk) ──
  const toggleBulk = (movId) => {
    setBulkSelected(prev => {
      const s = new Set(prev);
      s.has(movId) ? s.delete(movId) : s.add(movId);
      return s;
    });
  };

  const selectAllVisible = () => {
    const ids = sorted.map(m => m.id);
    setBulkSelected(new Set(ids));
  };

  const deselectAll = () => setBulkSelected(new Set());

  const handleBulkRegistra = async () => {
    if (bulkSelected.size === 0 || !bulkCat) return;
    setBulkRegistering(true);
    try {
      const resp = await apiFetch(`${FC}/cross-ref/registra-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimento_ids: [...bulkSelected], categoria: bulkCat }),
      });
      if (!resp.ok) throw new Error("Errore registrazione bulk");
      const data = await resp.json();
      setBulkSelected(new Set());
      setBulkCat("");
      await loadData();
      if (data.saltati > 0) setError(`Registrati ${data.registrati}, saltati ${data.saltati} (già collegati)`);
    } catch (err) { setError(err.message); }
    finally { setBulkRegistering(false); }
  };

  // ── S40-12: Parcheggia bulk (stato persistente "in attesa") ──
  const handleBulkParcheggia = async () => {
    if (bulkSelected.size === 0) return;
    setBulkRegistering(true);
    try {
      const resp = await apiFetch(`${FC}/cross-ref/parcheggia-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimento_ids: [...bulkSelected] }),
      });
      if (!resp.ok) throw new Error("Errore parcheggio");
      setBulkSelected(new Set());
      await loadData();
    } catch (err) { setError(err.message); }
    finally { setBulkRegistering(false); }
  };

  // ── S40-12: Flagga bulk come "senza match" (client-side dismiss multiplo) ──
  const handleBulkDismiss = () => {
    if (bulkSelected.size === 0) return;
    setDismissed(prev => {
      const s = new Set(prev);
      bulkSelected.forEach(id => s.add(id));
      return s;
    });
    setBulkSelected(new Set());
    setTab("senza");
  };

  // ── S40-12: Disparcheggia un singolo movimento ──
  const handleDisparcheggia = async (movId) => {
    try {
      const resp = await apiFetch(`${FC}/cross-ref/disparcheggia/${movId}`, { method: "POST" });
      if (!resp.ok) throw new Error("Errore");
      await loadData();
    } catch (err) { setError(err.message); }
  };

  useEffect(() => {
    if (bulkSelected.size > 0 && !bulkCat) {
      const first = movimenti.find(m => bulkSelected.has(m.id));
      if (first) {
        setBulkCat(first.auto_categoria || (first.importo >= 0 ? "INCASSO_POS" : "SPESA_BANCARIA"));
      }
    }
    if (bulkSelected.size === 0) setBulkCat("");
  }, [bulkSelected]);

  // ── Duplicati: elimina ──
  const handleDeleteDup = async (keepId, deleteIds) => {
    setDupDeleting(true);
    try {
      const resp = await apiFetch(
        `${FC}/duplicati/${keepId}?delete_ids=${deleteIds.join(",")}`,
        { method: "DELETE" }
      );
      if (!resp.ok) throw new Error("Errore eliminazione");
      await Promise.all([loadData(), loadDuplicati()]);
    } catch (err) { setError(err.message); }
    finally { setDupDeleting(false); }
  };

  // Ricerca manuale
  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const resp = await apiFetch(`${FC}/cross-ref/search?q=${encodeURIComponent(q)}`);
      if (resp.ok) setSearchResults(await resp.json());
    } catch (_) {}
    setSearchLoading(false);
  }, []);

  const onSearchChange = (q) => {
    setSearchQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 350);
  };

  const onSort = (field) => {
    setSort(prev => prev.field === field
      ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { field, dir: field === "data_contabile" ? "desc" : "asc" }
    );
  };

  // ── Filtra per tab ──
  // linked = completamente collegato (residuo < 1)
  // partial = ha link ma residuo >= 1 → va nei suggerimenti o senza match
  // parcheggiati = stato "in attesa" persistente (sparisce dagli altri tab)
  const parcheggiati = useMemo(() => movimenti.filter(m => !!m.parcheggiato), [movimenti]);
  const linked   = useMemo(() => movimenti.filter(m => !m.parcheggiato && isFullyLinked(m)), [movimenti]);
  const unlinked = useMemo(() => movimenti.filter(m => !m.parcheggiato && !isFullyLinked(m)), [movimenti]);
  const withSugg = useMemo(() => unlinked.filter(m => m.possibili_match?.length > 0 && !dismissed.has(m.id)), [unlinked, dismissed]);
  const noMatch  = useMemo(() => unlinked.filter(m => !m.possibili_match?.length || dismissed.has(m.id)), [unlinked, dismissed]);

  const listMap = { collegati: linked, suggerimenti: withSugg, senza: noMatch, parcheggiati: parcheggiati };
  let currentList = listMap[tab] || [];

  // ── Filtro client-side: tipo link ──
  if (filters.tipoLink.length > 0) {
    currentList = currentList.filter(m => {
      const links = m.links || [];
      if (links.length === 0) {
        return filters.tipoLink.includes("NESSUNO");
      }
      return links.some(l => {
        if (filters.tipoLink.includes("ENTRATA") && l.source === "entrata") return true;
        return filters.tipoLink.includes(l.tipo);
      });
    });
  }

  // ── Filtro client-side: text search (debounced) ──
  if (searchDebounced.trim()) {
    const ft = searchDebounced.toLowerCase().trim();
    // se è un numero, match anche su valore assoluto con tolleranza formato italiano
    const numGuess = ft.replace(",", ".");
    const isNum = !isNaN(Number(numGuess)) && numGuess !== "";
    currentList = currentList.filter(m => {
      if ((m.descrizione || "").toLowerCase().includes(ft)) return true;
      if ((m.links || []).some(l => (l.fornitore_nome || "").toLowerCase().includes(ft))) return true;
      if ((m.categoria_banca || "").toLowerCase().includes(ft)) return true;
      if ((m.sottocategoria_banca || "").toLowerCase().includes(ft)) return true;
      if (isNum) {
        const absImp = Math.abs(m.importo || 0);
        if (String(absImp).includes(numGuess) || absImp.toFixed(2).includes(numGuess)) return true;
      }
      return false;
    });
  }

  const sorted = sortRows(currentList, sort);

  // ── Helpers stipendio ──
  const stipendioLabel = (s) => {
    if (s.periodo_riferimento) {
      const parts = s.periodo_riferimento.split(" ");
      return `Paga di ${parts[0].toLowerCase()}`;
    }
    return "";
  };
  const stipendioNome = (fornitore) => {
    if (!fornitore) return "";
    return fornitore.replace(/^Stipendio\s*-\s*/i, "");
  };

  // ── Render un singolo link ──
  const renderLink = (lk, showUnlink = true) => {
    const isStip = lk.tipo === "STIPENDIO";
    const nome = isStip ? stipendioNome(lk.fornitore_nome) : lk.fornitore_nome;
    const dettaglio = isStip
      ? (lk.periodo_riferimento ? `Paga di ${lk.periodo_riferimento.split(" ")[0].toLowerCase()}` : "")
      : `${lk.numero_fattura ? `${lk.numero_fattura} ` : ""}${lk.data ? `· ${fmtDate(lk.data)}` : ""}`;

    return (
      <div key={lk.link_id} className="flex items-center gap-2 text-xs">
        {tipoBadge(lk.tipo)}
        <span className="font-medium text-neutral-800 truncate">{nome}</span>
        <span className="text-neutral-400">{dettaglio}</span>
        <span className="font-mono font-semibold text-neutral-600">€ {fmt(lk.totale)}</span>
        {showUnlink && (
          <button onClick={() => handleUnlink(lk.link_id)}
            className="px-1.5 py-0.5 rounded text-[9px] border border-red-200 text-red-400 hover:bg-red-50 ml-1">
            ✕
          </button>
        )}
      </div>
    );
  };

  // ── Render match option (fattura, uscita, o entrata) ──
  const renderMatchOption = (s, movId) => {
    const isStipendio = s.tipo === "STIPENDIO";
    const nome = isStipendio ? stipendioNome(s.fornitore_nome) : s.fornitore_nome;
    const dettaglio = isStipendio
      ? stipendioLabel(s)
      : `${s.numero_fattura ? `${s.numero_fattura} ` : ""}${fmtDate(s.data_ref)}`;

    return (
    <div key={`${s.source}-${s.source_id}`}
      className="flex items-center justify-between bg-white rounded-lg border border-neutral-200 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {tipoBadge(s.tipo)}
        <span className="text-sm font-medium text-neutral-800 truncate">{nome}</span>
        <span className="text-xs text-neutral-400 whitespace-nowrap">{dettaglio}</span>
        {s.source === "entrata" && (
          <span className="text-[9px] bg-cyan-100 text-cyan-700 border border-cyan-200 px-1 rounded">ENTRATA</span>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
        <span className="text-sm font-mono font-semibold text-neutral-700">€ {fmt(s.totale)}</span>
        <button onClick={() => handleLink(movId, s.source, s.source_id)}
          disabled={linking === movId}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-40">
          {linking === movId ? "..." : "Collega"}
        </button>
      </div>
    </div>
  );
  };

  // Colonne tabella
  // senza: checkbox + data + importo + descr + azioni = 5
  // suggerimenti: checkbox + data + importo + descr + match = 5
  // parcheggiati: checkbox + data + importo + descr + parcheggiato + azioni = 6
  const colSpan = tab === "collegati" ? 6 : tab === "senza" ? 5 : tab === "suggerimenti" ? 5 : tab === "parcheggiati" ? 6 : 4;

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <FlussiCassaNav current="crossref" />
      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 mt-2">
        <div className="flex gap-4 lg:gap-6">

          {/* ═══ Sidebar filtri SX (desktop / iPad landscape) ═══ */}
          <aside className="hidden lg:block w-60 flex-shrink-0">
            <div className="bg-white shadow-sm rounded-2xl p-4 border border-neutral-200 sticky top-4">
              <FilterPanel
                filters={filters}
                update={updateFilter}
                reset={resetFilters}
                toggleTipoLink={toggleTipoLink}
                activeCount={activeFiltersCount}
              />
            </div>
          </aside>

          {/* ═══ Drawer filtri mobile ═══ */}
          {filterPanelOpen && (
            <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setFilterPanelOpen(false)}>
              <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl p-5 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-neutral-800">Filtri</h3>
                  <button onClick={() => setFilterPanelOpen(false)}
                    className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200">✕</button>
                </div>
                <FilterPanel
                  filters={filters}
                  update={updateFilter}
                  reset={resetFilters}
                  toggleTipoLink={toggleTipoLink}
                  activeCount={activeFiltersCount}
                />
              </div>
            </div>
          )}

          {/* ═══ Main content ═══ */}
          <div className="flex-1 min-w-0">
            <div className="bg-white shadow-2xl rounded-3xl p-6 sm:p-8 border border-neutral-200">
              <div className="flex items-start justify-between gap-3 mb-1">
                <h1 className="text-3xl font-bold text-emerald-900 tracking-wide font-playfair">
                  Riconciliazione
                </h1>
                {/* Pulsante apri drawer su mobile */}
                <button onClick={() => setFilterPanelOpen(true)}
                  className="lg:hidden inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-300 text-sm text-neutral-700 hover:bg-neutral-50">
                  <span>⚙</span>
                  <span>Filtri</span>
                  {activeFiltersCount > 0 && (
                    <span className="text-[10px] font-bold bg-emerald-600 text-white rounded-full px-1.5 py-0.5">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
              </div>
              <p className="text-neutral-500 text-sm mb-5">
                Collega o registra ogni movimento bancario — uscite e entrate — per un quadro completo.
              </p>

          {/* ── Avviso duplicati ── */}
          {dupGroups.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-amber-600 text-lg">⚠️</span>
                  <span className="text-sm font-semibold text-amber-800">
                    {dupGroups.length} gruppo{dupGroups.length > 1 ? "i" : ""} di possibili duplicati
                  </span>
                  <span className="text-xs text-amber-600">
                    (stessa data + stesso importo)
                  </span>
                </div>
                <button onClick={() => setShowDup(!showDup)}
                  className="px-3 py-1 rounded-lg text-xs font-medium border border-amber-300 text-amber-700 hover:bg-amber-100 transition">
                  {showDup ? "Nascondi" : "Mostra"}
                </button>
              </div>
              {showDup && (
                <div className="mt-3 space-y-3">
                  {dupGroups.map((g, gi) => (
                    <div key={gi} className="bg-white rounded-lg border border-amber-200 p-3">
                      <div className="text-xs font-semibold text-neutral-700 mb-2">
                        {fmtDate(g.data)} — € {fmt(g.importo)} — {g.count} movimenti
                      </div>
                      {g.movimenti.map((m, mi) => (
                        <div key={m.id} className="flex items-center gap-3 py-1.5 border-b border-neutral-100 last:border-0">
                          <span className="text-[10px] text-neutral-400 font-mono">#{m.id}</span>
                          <span className="text-xs text-neutral-700 flex-1 truncate">{m.descrizione}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.has_links ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
                            {m.has_links ? "collegato" : "libero"}
                          </span>
                          {mi > 0 && !m.has_links && (
                            <button
                              onClick={() => handleDeleteDup(g.movimenti[0].id, [m.id])}
                              disabled={dupDeleting}
                              className="px-2 py-1 rounded text-[10px] font-medium border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40">
                              Elimina
                            </button>
                          )}
                          {mi === 0 && (
                            <span className="text-[10px] text-emerald-600 font-medium">mantieni</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab ── */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {TABS.map(t => {
              const count = t.key === "collegati" ? linked.length : t.key === "suggerimenti" ? withSugg.length : t.key === "parcheggiati" ? parcheggiati.length : noMatch.length;
              const active = tab === t.key;
              return (
                <button key={t.key} onClick={() => { setTab(t.key); setExpandedId(null); setSearchId(null); setRegistraId(null); setBulkSelected(new Set()); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition flex items-center gap-2 ${
                    active ? "bg-emerald-100 border-emerald-300 text-emerald-800 shadow-sm" : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  }`}>
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${active ? "bg-white/60" : "bg-neutral-100"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Filtri attivi — chip summary (su desktop la sidebar già li mostra; qui solo se attivi) */}
          {activeFiltersCount > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                {activeFiltersCount} {activeFiltersCount === 1 ? "filtro attivo" : "filtri attivi"}:
              </span>
              {filters.datePreset !== "all" && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                  {({ mese: "Mese corrente", trim: "Ultimi 3 mesi", anno: "Anno in corso", custom: "Custom" })[filters.datePreset]}
                  <button onClick={() => updateFilter({ datePreset: "all", dateFrom: "", dateTo: "" })} className="text-emerald-500 hover:text-emerald-800">✕</button>
                </span>
              )}
              {filters.direzione !== "all" && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                  {filters.direzione === "uscite" ? "Solo uscite" : "Solo entrate"}
                  <button onClick={() => updateFilter({ direzione: "all" })} className="text-emerald-500 hover:text-emerald-800">✕</button>
                </span>
              )}
              {(filters.importoMin !== "" || filters.importoMax !== "") && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                  €{filters.importoMin || "0"} – {filters.importoMax || "∞"}
                  <button onClick={() => updateFilter({ importoMin: "", importoMax: "" })} className="text-emerald-500 hover:text-emerald-800">✕</button>
                </span>
              )}
              {filters.tipoLink.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                  {filters.tipoLink.length} tipi link
                  <button onClick={() => updateFilter({ tipoLink: [] })} className="text-emerald-500 hover:text-emerald-800">✕</button>
                </span>
              )}
              {filters.searchText.trim() && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                  "{filters.searchText}"
                  <button onClick={() => updateFilter({ searchText: "" })} className="text-emerald-500 hover:text-emerald-800">✕</button>
                </span>
              )}
              <button onClick={resetFilters}
                className="text-[10px] text-red-500 hover:text-red-700 font-medium underline-offset-2 hover:underline ml-auto">
                Pulisci tutti
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
          )}

          {/* ── Barra bulk — tab senza/suggerimenti/parcheggiati ── */}
          {(tab === "senza" || tab === "suggerimenti" || tab === "parcheggiati") && bulkSelected.size > 0 && (
            <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-indigo-800">
                  {bulkSelected.size} selezionati
                  {(() => {
                    const tot = [...bulkSelected].reduce((s, id) => {
                      const m = movimenti.find(x => x.id === id);
                      return s + Math.abs(m?.importo || 0);
                    }, 0);
                    return ` — € ${fmt(tot)}`;
                  })()}
                </span>

                {/* Registra come categoria — solo su tab senza */}
                {tab === "senza" && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {(() => {
                        const firstMov = movimenti.find(m => bulkSelected.has(m.id));
                        const cats = firstMov && firstMov.importo >= 0 ? catEntrata : catUscita;
                        return cats.map(c => (
                          <button key={c.key} onClick={() => setBulkCat(c.key)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                              bulkCat === c.key
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-white border-neutral-200 text-neutral-700 hover:bg-indigo-50"
                            }`}>
                            {c.label}
                          </button>
                        ));
                      })()}
                    </div>
                    <button onClick={handleBulkRegistra} disabled={!bulkCat || bulkRegistering}
                      className="px-4 py-1.5 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition">
                      {bulkRegistering ? "..." : `Registra ${bulkSelected.size}`}
                    </button>
                  </>
                )}

                {/* S40-12: Parcheggia bulk — su senza/suggerimenti */}
                {(tab === "senza" || tab === "suggerimenti") && (
                  <button onClick={handleBulkParcheggia} disabled={bulkRegistering}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 disabled:opacity-40 transition">
                    🅿️ Parcheggia {bulkSelected.size}
                  </button>
                )}

                {/* S40-12: Flagga senza match bulk — solo su suggerimenti */}
                {tab === "suggerimenti" && (
                  <button onClick={handleBulkDismiss}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-neutral-100 text-neutral-700 border border-neutral-300 hover:bg-neutral-200 transition">
                    ❓ Flagga senza match
                  </button>
                )}

                {/* S40-12: Disparcheggia bulk — solo su parcheggiati */}
                {tab === "parcheggiati" && (
                  <button
                    onClick={async () => {
                      for (const id of bulkSelected) {
                        await handleDisparcheggia(id);
                      }
                      setBulkSelected(new Set());
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 transition">
                    ↩ Disparcheggia {bulkSelected.size}
                  </button>
                )}

                <button onClick={deselectAll} className="px-3 py-1.5 rounded-lg text-xs text-neutral-500 hover:text-neutral-700 border border-neutral-200 ml-auto">
                  Deseleziona
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-neutral-500">Caricamento...</div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-neutral-400">
              {activeFiltersCount > 0 ? (
                <>
                  <div>Nessun risultato con i filtri attivi.</div>
                  <button onClick={resetFilters}
                    className="mt-2 text-xs text-emerald-600 hover:text-emerald-800 underline underline-offset-2">
                    Pulisci i filtri
                  </button>
                </>
              ) :
               tab === "collegati" ? "Nessun movimento riconciliato." :
               tab === "suggerimenti" ? "Nessun suggerimento disponibile." :
               "Tutti i movimenti hanno almeno un suggerimento."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200">
                    {(tab === "senza" || tab === "suggerimenti" || tab === "parcheggiati") && (
                      <th className="px-2 py-2 w-8">
                        <input type="checkbox"
                          checked={sorted.length > 0 && sorted.every(m => bulkSelected.has(m.id))}
                          onChange={() => sorted.every(m => bulkSelected.has(m.id)) ? deselectAll() : selectAllVisible()}
                          className="accent-indigo-600" />
                      </th>
                    )}
                    <SortTh label="Data" field="data_contabile" sort={sort} onSort={onSort} />
                    <SortTh label="Importo" field="importo" sort={sort} onSort={onSort} className="text-right" />
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Descrizione</th>
                    {tab === "collegati" && (
                      <>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Collegamento</th>
                        <th className="px-3 py-2 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider w-20"></th>
                      </>
                    )}
                    {tab === "suggerimenti" && (
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Match</th>
                    )}
                    {tab === "senza" && (
                      <th className="px-3 py-2 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider w-24"></th>
                    )}
                    {tab === "parcheggiati" && (
                      <>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Parcheggiato</th>
                        <th className="px-3 py-2 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider w-28"></th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(m => {
                    const isExpanded = expandedId === m.id;
                    const isSearching = searchId === m.id;
                    const hasSugg = m.possibili_match?.length > 0;
                    const links = m.links || [];
                    const partial = isPartiallyLinked(m);

                    return (
                      <React.Fragment key={m.id}>
                        <tr className={`border-b border-neutral-100 hover:bg-neutral-50 transition ${
                          isExpanded || isSearching ? "bg-neutral-50" : ""
                        } ${bulkSelected.has(m.id) ? "bg-indigo-50/50" : ""}`}>
                          {(tab === "senza" || tab === "suggerimenti" || tab === "parcheggiati") && (
                            <td className="px-2 py-2.5 w-8">
                              <input type="checkbox" checked={bulkSelected.has(m.id)}
                                onChange={() => toggleBulk(m.id)} className="accent-indigo-600" />
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-xs text-neutral-600 whitespace-nowrap">{fmtDate(m.data_contabile)}</td>
                          <td className={`px-3 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap ${
                            m.importo >= 0 ? "text-emerald-600" : "text-red-600"
                          }`}>
                            € {fmt(m.importo)}
                          </td>
                          <td className="px-3 py-2.5 max-w-xs cursor-pointer select-none"
                              onClick={() => toggleDesc(m.id)}
                              title={expandedDesc.has(m.id) ? "Tocca per comprimere" : "Tocca per leggere tutto"}>
                            <div className={`text-xs text-neutral-800 ${
                              expandedDesc.has(m.id)
                                ? "whitespace-normal break-words"
                                : "truncate"
                            }`}>
                              {m.descrizione}
                            </div>
                            {m.categoria_banca && (
                              <div className="text-[10px] text-neutral-400">{m.categoria_banca}{m.sottocategoria_banca ? ` — ${m.sottocategoria_banca}` : ""}</div>
                            )}
                            {/* Indicatore link parziale nei tab suggerimenti/senza */}
                            {partial && tab !== "collegati" && (
                              <div className="mt-1 text-[10px] text-amber-600 font-medium">
                                ⚡ Parziale: € {fmt(m.totale_collegato)} su € {fmt(Math.abs(m.importo))} — residuo € {fmt(m.residuo)}
                              </div>
                            )}
                          </td>

                          {/* ── Tab collegati ── */}
                          {tab === "collegati" && (
                            <>
                              <td className="px-3 py-2.5">
                                <div className="space-y-1">
                                  {links.map(lk => renderLink(lk, false))}
                                  {links.length > 1 && (
                                    <div className="text-[10px] font-semibold text-emerald-600 mt-1">
                                      Totale: € {fmt(m.totale_collegato)}
                                    </div>
                                  )}
                                  {m.riconciliazione_chiusa ? (
                                    <div className="mt-1 text-[10px]">
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 font-medium">
                                        🔒 Chiusa manuale
                                      </span>
                                      {Math.abs(m.residuo ?? 0) >= 1.0 && (
                                        <span className="ml-1 text-neutral-500">
                                          (residuo € {fmt(m.residuo)})
                                        </span>
                                      )}
                                      {m.riconciliazione_chiusa_note && (
                                        <div className="text-[10px] text-neutral-500 italic mt-0.5">
                                          "{m.riconciliazione_chiusa_note}"
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="space-y-1">
                                  {links.map(lk => (
                                    <button key={lk.link_id} onClick={() => handleUnlink(lk.link_id)}
                                      className="block px-2 py-1 rounded text-[10px] border border-red-200 text-red-500 hover:bg-red-50 w-full">
                                      Scollega
                                    </button>
                                  ))}
                                  {m.riconciliazione_chiusa && (
                                    <Tooltip label="Riapri la riconciliazione manuale">
                                      <button onClick={() => handleRiapriRiconciliazione(m.id)}
                                        className="block px-2 py-1 rounded text-[10px] border border-amber-200 text-amber-600 hover:bg-amber-50 w-full">
                                        Riapri
                                      </button>
                                    </Tooltip>
                                  )}
                                </div>
                              </td>
                            </>
                          )}

                          {/* ── Tab suggerimenti: pulsante espandi + chiudi manuale ── */}
                          {tab === "suggerimenti" && (
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button onClick={() => setExpandedId(isExpanded ? null : m.id)}
                                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                                    isExpanded ? "bg-amber-100 border-amber-300 text-amber-800" : "border-amber-200 text-amber-700 hover:bg-amber-50"
                                  }`}>
                                  {isExpanded ? "Chiudi" : `${m.possibili_match?.length} possibili`}
                                </button>
                                {partial && (
                                  <Tooltip label="Chiudi la riconciliazione manualmente (es. N/C, bonifico multiplo, fattura+rata)">
                                    <button onClick={() => handleChiudiRiconciliazione(m.id)}
                                      className="px-2 py-1 rounded-lg text-xs font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition">
                                      ✓ Chiudi
                                    </button>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                          )}

                          {/* ── Tab senza match: pulsante cerca + storno + registra ── */}
                          {tab === "senza" && (
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center gap-1.5 justify-center flex-wrap">
                                {/* Per uscite: cerca fattura/spesa */}
                                {m.importo < 0 && (
                                  <button onClick={() => {
                                    if (isSearching) { setSearchId(null); setSearchQuery(""); setSearchResults([]); }
                                    else { setSearchId(m.id); setExpandedId(null); setSearchQuery(""); setSearchResults([]); setRegistraId(null); }
                                  }}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                                      isSearching ? "bg-teal-100 border-teal-300 text-teal-800" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                                    }`}>
                                    {isSearching ? "Chiudi" : "🔍 Cerca"}
                                  </button>
                                )}
                                {/* Per entrate: "Storno" apre ricerca con importo pre-compilato */}
                                {m.importo > 0 && (
                                  <button onClick={() => {
                                    if (isSearching) {
                                      setSearchId(null); setSearchQuery(""); setSearchResults([]);
                                    } else {
                                      setSearchId(m.id); setExpandedId(null); setRegistraId(null);
                                      // Pre-compila con l'importo per trovare la fattura/uscita originale
                                      const impStr = Math.abs(m.importo).toFixed(2).replace(".", ",");
                                      setSearchQuery(impStr);
                                      doSearch(impStr);
                                    }
                                  }}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                                      isSearching ? "bg-cyan-100 border-cyan-300 text-cyan-800" : "border-cyan-300 text-cyan-700 hover:bg-cyan-50"
                                    }`}>
                                    {isSearching ? "Chiudi" : "↩ Storno"}
                                  </button>
                                )}
                                <button onClick={() => {
                                  if (registraId === m.id) { setRegistraId(null); }
                                  else { openRegistra(m.id); setSearchId(null); }
                                }}
                                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                                    registraId === m.id ? "bg-indigo-100 border-indigo-300 text-indigo-800" : "border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                                  }`}>
                                  {registraId === m.id ? "Annulla" : "📋 Registra"}
                                </button>
                                {dismissed.has(m.id) && (
                                  <Tooltip label="Torna ai suggerimenti automatici">
                                    <button onClick={() => handleUndismiss(m.id)}
                                      className="px-2 py-1 rounded-lg text-[10px] font-medium border border-amber-200 text-amber-600 hover:bg-amber-50 transition">
                                      💡
                                    </button>
                                  </Tooltip>
                                )}
                                {partial && (
                                  <Tooltip label="Chiudi la riconciliazione manualmente (es. N/C, bonifico multiplo, fattura+rata)">
                                    <button onClick={() => handleChiudiRiconciliazione(m.id)}
                                      className="px-2 py-1 rounded-lg text-xs font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition">
                                      ✓ Chiudi
                                    </button>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                          )}

                          {/* ── Tab parcheggiati: timestamp + disparcheggia ── */}
                          {tab === "parcheggiati" && (
                            <>
                              <td className="px-3 py-2.5 text-xs text-neutral-500 whitespace-nowrap">
                                {m.parcheggiato_at ? fmtDate(m.parcheggiato_at) : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <Tooltip label="Rimetti il movimento tra quelli da analizzare">
                                  <button onClick={() => handleDisparcheggia(m.id)}
                                    className="px-3 py-1 rounded-lg text-xs font-medium border border-amber-300 text-amber-700 hover:bg-amber-50 transition">
                                    ↩ Disparcheggia
                                  </button>
                                </Tooltip>
                              </td>
                            </>
                          )}
                        </tr>

                        {/* ── Riga espansa: link parziali esistenti ── */}
                        {(isExpanded || isSearching) && partial && (
                          <tr>
                            <td colSpan={colSpan} className="px-3 py-2 bg-sky-50/30">
                              <div className="text-[10px] font-semibold text-sky-600 uppercase tracking-wide mb-1">
                                Già collegati (parziale — residuo € {fmt(m.residuo)})
                              </div>
                              <div className="space-y-1">
                                {links.map(lk => renderLink(lk))}
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* ── Riga espansa: suggerimenti auto ── */}
                        {isExpanded && hasSugg && (
                          <tr>
                            <td colSpan={colSpan} className="px-3 py-3 bg-amber-50/30">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">
                                  Possibili corrispondenze {partial ? `(per residuo € ${fmt(m.residuo)})` : ""}
                                </span>
                                <button onClick={() => handleDismiss(m.id)}
                                  className="px-3 py-1 rounded-lg text-[11px] font-medium border border-neutral-300 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition">
                                  Nessuno di questi → cerca manuale
                                </button>
                              </div>
                              <div className="space-y-1.5">
                                {m.possibili_match.map(s => renderMatchOption(s, m.id))}
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* ── Riga espansa: ricerca manuale ── */}
                        {isSearching && (
                          <tr>
                            <td colSpan={colSpan} className="px-3 py-3 bg-teal-50/30">
                              <div className="text-[10px] font-semibold text-teal-600 uppercase tracking-wide mb-1">
                                {m.importo > 0
                                  ? "Storno — cerca la fattura o spesa originale da chiudere"
                                  : "Cerca fattura, spesa o entrata per fornitore, tipo o importo"}
                              </div>
                              {m.importo > 0 && (
                                <div className="text-[10px] text-teal-500 mb-2">
                                  Collega questo accredito (€ {fmt(m.importo)}) alla fattura/spesa che ha generato lo storno
                                </div>
                              )}
                              <input type="text" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)}
                                placeholder={m.importo > 0 ? "Cerca per importo, fornitore o numero fattura..." : "es. Compagnia del Vino, affitto, 1077..."}
                                autoFocus
                                className="w-full sm:w-96 px-3 py-2 rounded-lg border border-teal-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 mb-2" />
                              {searchLoading && <div className="text-xs text-neutral-500 py-1">Ricerca...</div>}
                              {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
                                <div className="text-xs text-neutral-400 py-1">Nessun risultato tra fatture, uscite e entrate non collegate.</div>
                              )}
                              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                                {searchResults.map(s => renderMatchOption(s, m.id))}
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* ── Riga espansa: registra spesa/entrata ── */}
                        {registraId === m.id && (
                          <tr>
                            <td colSpan={colSpan} className="px-3 py-3 bg-indigo-50/30">
                              <div className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide mb-2">
                                {m.importo >= 0 ? "Registra entrata" : "Registra uscita"} — scegli categoria
                              </div>
                              <div className="flex flex-wrap gap-2 mb-3">
                                {(m.importo >= 0 ? catEntrata : catUscita).map(c => (
                                  <button key={c.key} onClick={() => setRegistraCat(c.key)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                                      registraCat === c.key
                                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                        : "bg-white border-neutral-200 text-neutral-700 hover:bg-indigo-50 hover:border-indigo-300"
                                    }`}>
                                    {c.label}
                                  </button>
                                ))}
                              </div>
                              <div className="flex items-center gap-3">
                                <button onClick={handleRegistra} disabled={!registraCat || registering}
                                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-40">
                                  {registering ? "..." : `Registra come ${TIPO_LABELS[registraCat] || registraCat}`}
                                </button>
                                <button onClick={() => setRegistraId(null)}
                                  className="px-3 py-2 rounded-lg text-xs text-neutral-500 hover:text-neutral-700">
                                  Annulla
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Riepilogo ── */}
          {!loading && (
            <div className="mt-4 pt-3 border-t border-neutral-200 flex flex-wrap gap-4 text-xs text-neutral-500">
              <span>{movimenti.length} movimenti totali</span>
              <span>•</span>
              <span className="text-emerald-600 font-medium">{linked.length} riconciliati</span>
              <span>•</span>
              <span className="text-amber-600">{withSugg.length} con suggerimenti</span>
              <span>•</span>
              <span>{noMatch.length} senza match</span>
              {movimenti.some(m => isPartiallyLinked(m)) && (
                <>
                  <span>•</span>
                  <span className="text-sky-600">
                    {movimenti.filter(m => isPartiallyLinked(m)).length} parziali
                  </span>
                </>
              )}
            </div>
          )}
            </div>{/* /bg-white card */}
          </div>{/* /flex-1 min-w-0 main */}
        </div>{/* /flex gap layout */}
      </div>{/* /max-w container */}
    </div>
  );
}
