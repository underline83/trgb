// @version: v3.2-fornitore-sidebar-colorata
// Elenco fornitori — Layout Cantina: Filtri SX + Lista/Dettaglio inline DX
// v3.1: supporto deep-link ?piva=xxx per auto-aprire un fornitore specifico
//       (usato dal bottone "Modifica anagrafica fornitore" in FattureDettaglio).
// v3.2: FornitoreDetailView refactorato sul pattern SchedaVino/FattureDettaglio
//       (sidebar colorata + SectionHeader). Sostituito FatturaInlineDetail con
//       FattureDettaglio (unification: terzo target).
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";
import FattureDettaglio from "./FattureDettaglio";
import Tooltip from "../../components/Tooltip";

const FE = `${API_BASE}/contabilita/fe`;
const CAT_BASE = `${API_BASE}/contabilita/fe/categorie`;
const fmt = (v) =>
  v != null
    ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";

// ── Stili filtri ──
const fLbl = "block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5";
const fInp = "w-full border border-neutral-300 rounded-md px-2.5 py-2.5 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-teal-300";
const fSel = fInp;

// ── Sidebar colors fornitore — uniforme a FattureDettaglio/SchedaVino ──
const FORNITORE_SIDEBAR = {
  ATTIVO:     { bg: "bg-gradient-to-b from-teal-700 to-teal-900",   accent: "bg-teal-500/30",   text: "text-teal-100" },
  IN_SOSPESO: { bg: "bg-gradient-to-b from-amber-700 to-amber-900", accent: "bg-amber-500/30",  text: "text-amber-100" },
  ESCLUSO:    { bg: "bg-gradient-to-b from-slate-700 to-slate-900", accent: "bg-slate-500/30",  text: "text-slate-100" },
};
function getFornitoreSidebar(isExcluded, nDaPagare) {
  if (isExcluded) return FORNITORE_SIDEBAR.ESCLUSO;
  if (nDaPagare > 0) return FORNITORE_SIDEBAR.IN_SOSPESO;
  return FORNITORE_SIDEBAR.ATTIVO;
}

// ── SectionHeader uniforme a FattureDettaglio/SchedaVino ──
function SectionHeader({ title, children }) {
  return (
    <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between gap-3 flex-wrap">
      <h3 className="text-sm font-bold text-neutral-800">{title}</h3>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

// ── Sortable header ──
function SortTh({ label, field, sort, setSort, align }) {
  const active = sort.field === field;
  const arrow = active ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th className={`px-3 py-2 cursor-pointer select-none hover:text-teal-800 transition ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => setSort(prev => ({ field, dir: prev.field === field && prev.dir === "asc" ? "desc" : "asc" }))}>
      {label}{arrow}
    </th>
  );
}

function sortRows(rows, sort) {
  if (!sort.field) return rows;
  return [...rows].sort((a, b) => {
    let va = a[sort.field], vb = b[sort.field];
    if (va == null) va = "";
    if (vb == null) vb = "";
    if (typeof va === "number" && typeof vb === "number") return sort.dir === "asc" ? va - vb : vb - va;
    return sort.dir === "asc" ? String(va).localeCompare(String(vb), "it") : String(vb).localeCompare(String(va), "it");
  });
}

export default function FattureFornitoriElenco() {
  // ── Dati lista ──
  const [fornitori, setFornitori] = useState([]);
  const [categorie, setCategorie] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Filtri ──
  const [searchText, setSearchText] = useState("");
  const [annoSel, setAnnoSel] = useState(String(new Date().getFullYear()));
  const [categoriaSel, setCategoriaSel] = useState(""); // "ok" | "partial" | "none" | "empty" | ""
  const [catNomeSel, setCatNomeSel] = useState(""); // filtro per nome categoria fornitore
  const [mostraEsclusi, setMostraEsclusi] = useState(false); // mostra fornitori esclusi da acquisti
  const [pagSel, setPagSel] = useState(""); // filtro pagamento: "ok" | "partial" | "default" | "none" | "da_fare"
  const [fornSort, setFornSort] = useState({ field: "totale_fatture", dir: "desc" });

  // ── Selezione massiva ──
  const [selected, setSelected] = useState(new Set());
  const [bulkCatId, setBulkCatId] = useState("");
  const [bulkSubId, setBulkSubId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  // ── Dettaglio inline ──
  const [openKey, setOpenKey] = useState(null);      // piva || nome del fornitore aperto
  const [detailData, setDetailData] = useState(null); // { fatture, prodotti, stats, fornNome, fornPiva }
  const [detLoading, setDetLoading] = useState(false);

  // ── Deep-link ?piva=xxx (da FattureDettaglio → "Modifica anagrafica") ──
  const [searchParams, setSearchParams] = useSearchParams();
  const pivaDeepLink = searchParams.get("piva");
  // Evita di riaprire continuamente lo stesso deep-link dopo il primo match
  const deepLinkHandled = useRef(null);

  // ── Fetch lista ──
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [resForn, resCat] = await Promise.all([
        apiFetch(`${FE}/stats/fornitori${annoSel ? `?year=${annoSel}` : ""}`),
        apiFetch(CAT_BASE),
      ]);
      if (resForn.ok) setFornitori(await resForn.json());
      if (resCat.ok) setCategorie(await resCat.json());
    } catch (e) {
      console.error("[FornitoriElenco]", e);
    } finally {
      setLoading(false);
    }
  }, [annoSel]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Anni disponibili ──
  const anniOptions = useMemo(() => {
    const set = new Set();
    fornitori.forEach((f) => {
      if (f.primo_acquisto) set.add(f.primo_acquisto.substring(0, 4));
      if (f.ultimo_acquisto) set.add(f.ultimo_acquisto.substring(0, 4));
    });
    return [...set].sort().reverse();
  }, [fornitori]);

  // ── Filtra + Ordina ──
  const filtered = useMemo(() => {
    let list = [...fornitori];
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(f =>
        f.fornitore_nome?.toLowerCase().includes(q) ||
        f.fornitore_piva?.toLowerCase().includes(q)
      );
    }
    if (categoriaSel) {
      if (categoriaSel === "da_fare") {
        list = list.filter(f => f.cat_status === "none" || f.cat_status === "auto" || f.cat_status === "partial");
      } else {
        list = list.filter(f => f.cat_status === categoriaSel);
      }
    }
    if (catNomeSel) {
      if (catNomeSel === "__none__") {
        list = list.filter(f => !f.categoria_nome);
      } else {
        list = list.filter(f => f.categoria_nome === catNomeSel);
      }
    }
    // Nascondi fornitori esclusi da acquisti (default), mostra se toggle attivo
    if (!mostraEsclusi) {
      list = list.filter(f => !f.escluso_acquisti);
    }
    // Filtro pagamento
    if (pagSel) {
      if (pagSel === "da_fare") {
        list = list.filter(f => f.pag_status === "none" || f.pag_status === "partial");
      } else {
        list = list.filter(f => f.pag_status === pagSel);
      }
    }
    // Aggiungi campi di sort calcolati
    const catOrd = { none: 0, auto: 1, partial: 2, ok: 3, empty: 4 };
    const pagOrd = { none: 0, partial: 1, default: 2, ok: 3 };
    list = list.map(f => ({
      ...f,
      cat_sort: catOrd[f.cat_status] ?? 4,
      pag_sort: pagOrd[f.pag_status] ?? 4,
      media_fattura: f.numero_fatture > 0 ? f.totale_fatture / f.numero_fatture : 0,
    }));
    return sortRows(list, fornSort);
  }, [fornitori, searchText, fornSort, categoriaSel, catNomeSel, mostraEsclusi, pagSel]);

  // ── KPI ──
  const totFornitori = filtered.length;
  const totSpesa = filtered.reduce((s, f) => s + (f.totale_fatture || 0), 0);
  const totFatture = filtered.reduce((s, f) => s + (f.numero_fatture || 0), 0);

  // ── Contatori filtri attivi ──
  const activeFilters = [searchText, annoSel, categoriaSel, catNomeSel, pagSel, fornSort.field !== "totale_fatture" ? "x" : ""].filter(Boolean).length;
  const clearFilters = () => {
    setSearchText(""); setAnnoSel(""); setCategoriaSel(""); setCatNomeSel(""); setPagSel(""); setMostraEsclusi(false); setFornSort({ field: "totale_fatture", dir: "desc" });
  };

  // ── Selezione massiva: toggle ──
  const toggleSelect = (key) => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(f => f.fornitore_piva || f.fornitore_nome)));
  };

  const bulkCat = categorie.find(c => c.id === Number(bulkCatId));
  const bulkSubcats = bulkCat?.sottocategorie || [];

  const handleBulkAssign = async () => {
    if (selected.size === 0) return;
    setBulkSaving(true);
    const catId = bulkCatId ? Number(bulkCatId) : null;
    const subId = bulkSubId ? Number(bulkSubId) : null;
    try {
      for (const key of selected) {
        const forn = fornitori.find(f => (f.fornitore_piva || f.fornitore_nome) === key);
        if (forn) {
          await apiFetch(`${CAT_BASE}/fornitori/assegna`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fornitore_piva: forn.fornitore_piva,
              fornitore_nome: forn.fornitore_nome,
              categoria_id: catId,
              sottocategoria_id: subId,
            }),
          });
        }
      }
      setSelected(new Set());
      setBulkCatId(""); setBulkSubId("");
      await fetchAll();
    } catch (_) {} finally { setBulkSaving(false); }
  };

  // ── Apri dettaglio inline ──
  const openDetail = async (forn) => {
    const key = forn.fornitore_piva || forn.fornitore_nome;
    if (openKey === key) { setOpenKey(null); setDetailData(null); return; }
    setOpenKey(key);
    setDetLoading(true);
    try {
      const enc = encodeURIComponent(key);
      const [resFatt, resProd, resStats, resAnag] = await Promise.all([
        apiFetch(`${FE}/fatture?fornitore_piva=${enc}&limit=10000`),
        apiFetch(`${CAT_BASE}/fornitori/${enc}/prodotti`),
        apiFetch(`${CAT_BASE}/fornitori/${enc}/stats`),
        apiFetch(`${FE}/fornitori/${enc}/anagrafica`),
      ]);
      const fatture = resFatt.ok ? (await resFatt.json()).fatture || [] : [];
      const prodotti = resProd.ok ? await resProd.json() : [];
      const stats = resStats.ok ? await resStats.json() : [];
      const anagrafica = resAnag.ok ? await resAnag.json() : {};
      setDetailData({
        fatture, prodotti, stats, anagrafica,
        fornNome: forn.fornitore_nome || key,
        fornPiva: forn.fornitore_piva || null,
        escluso_acquisti: forn.escluso_acquisti || 0,
      });
    } catch (e) {
      console.error(e);
      setDetailData(null);
    } finally {
      setDetLoading(false);
    }
  };

  // ── Auto-apertura da deep-link ?piva=xxx ──
  // Quando l'utente arriva qui dal bottone "Modifica anagrafica fornitore"
  // in FattureDettaglio, apre automaticamente il fornitore corrispondente.
  // La ricerca avviene appena `fornitori` è disponibile.
  useEffect(() => {
    if (!pivaDeepLink) return;
    if (!fornitori.length) return;
    if (deepLinkHandled.current === pivaDeepLink) return;
    const forn = fornitori.find(f => (f.fornitore_piva || "") === pivaDeepLink);
    if (!forn) {
      // Fornitore non trovato (può succedere se l'anno selezionato non contiene
      // fatture di questo fornitore). Azzeriamo l'anno per mostrare tutti.
      if (annoSel) {
        setAnnoSel("");
        return;
      }
      // Anche senza filtro anno non c'è: scartiamo il deep-link per evitare loop
      deepLinkHandled.current = pivaDeepLink;
      return;
    }
    deepLinkHandled.current = pivaDeepLink;
    openDetail(forn);
    // Pulisce il parametro dalla URL (senza reload) così che un refresh non
    // forzi di nuovo l'apertura
    const next = new URLSearchParams(searchParams);
    next.delete("piva");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivaDeepLink, fornitori, annoSel]);

  // ── Callback per refresh dettaglio dopo modifica prodotti ──
  const refreshDetail = async () => {
    if (!openKey) return;
    const enc = encodeURIComponent(openKey);
    try {
      const [resProd, resStats] = await Promise.all([
        apiFetch(`${CAT_BASE}/fornitori/${enc}/prodotti`),
        apiFetch(`${CAT_BASE}/fornitori/${enc}/stats`),
      ]);
      const prodotti = resProd.ok ? await resProd.json() : detailData?.prodotti || [];
      const stats = resStats.ok ? await resStats.json() : detailData?.stats || [];
      setDetailData(prev => ({ ...prev, prodotti, stats }));
    } catch (_) {}
  };

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <FattureNav current="fornitori" />

      <div className="flex" style={{ height: "calc(100vh - 48px)" }}>

        {/* ═══════ SIDEBAR FILTRI ═══════ */}
        <div className="w-sidebar min-w-sidebar border-r border-neutral-200 bg-neutral-50 overflow-y-auto flex-shrink-0">
          <div className="p-2.5 space-y-2">

            <div className="bg-white rounded-lg p-2.5 border border-neutral-200 shadow-sm">
              <div className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest mb-1.5">Ricerca</div>
              <div>
                <label className={fLbl}>Fornitore / P.IVA</label>
                <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                  placeholder="Nome fornitore o P.IVA..." className={fInp} />
              </div>
            </div>

            <div className="bg-teal-50/50 rounded-lg p-2.5 border border-teal-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-teal-600 uppercase tracking-widest mb-1.5">Periodo</div>
              <div>
                <label className={fLbl}>Anno</label>
                <select value={annoSel} onChange={e => setAnnoSel(e.target.value)} className={fSel}>
                  <option value="">Tutti gli anni</option>
                  {anniOptions.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-amber-50/50 rounded-lg p-2.5 border border-amber-100 shadow-sm space-y-2">
              <div className="text-[9px] font-extrabold text-amber-600 uppercase tracking-widest mb-1.5">Categorie</div>
              <div>
                <label className={fLbl}>Categoria fornitore</label>
                <select value={catNomeSel} onChange={e => setCatNomeSel(e.target.value)} className={fSel}>
                  <option value="">Tutte le categorie</option>
                  <option value="__none__">— Senza categoria —</option>
                  {categorie.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                </select>
              </div>
              {fornitori.some(f => f.escluso_acquisti) && (
                <label className="flex items-center gap-2 text-[10px] text-neutral-600 cursor-pointer mt-1">
                  <input type="checkbox" checked={mostraEsclusi} onChange={e => setMostraEsclusi(e.target.checked)}
                    className="accent-amber-600" />
                  Mostra esclusi ({fornitori.filter(f => f.escluso_acquisti).length})
                </label>
              )}
              <div>
                <label className={fLbl}>Stato prodotti</label>
                <select value={categoriaSel} onChange={e => setCategoriaSel(e.target.value)} className={fSel}>
                  <option value="">Tutti</option>
                  <option value="da_fare">Da verificare (✗ + C + ◐)</option>
                  <option value="ok">✓ Definite manualmente</option>
                  <option value="auto">C Ereditate da fornitore</option>
                  <option value="partial">◐ Parziale</option>
                  <option value="none">✗ Non categorizzato</option>
                  <option value="empty">— Senza righe</option>
                </select>
              </div>
            </div>

            <div className="bg-blue-50/50 rounded-lg p-2.5 border border-blue-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest mb-1.5">Pagamento</div>
              <div>
                <label className={fLbl}>Dati scadenza</label>
                <select value={pagSel} onChange={e => setPagSel(e.target.value)} className={fSel}>
                  <option value="">Tutti</option>
                  <option value="da_fare">Da configurare (✗ + ◐)</option>
                  <option value="ok">✓ Tutte con scadenza</option>
                  <option value="partial">◐ Parziale</option>
                  <option value="default">D Solo default fornitore</option>
                  <option value="none">✗ Senza dati pagamento</option>
                </select>
              </div>
            </div>

            <div className="flex gap-1.5 pt-1">
              <button onClick={clearFilters}
                className="flex-1 px-2.5 py-2.5 rounded-lg text-[11px] font-semibold border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 transition">
                ✕ Pulisci {activeFilters > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[9px]">{activeFilters}</span>}
              </button>
              <button onClick={fetchAll}
                className="flex-1 px-2.5 py-2.5 rounded-lg text-[11px] font-semibold border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-800 transition">
                ⟳ Ricarica
              </button>
            </div>

          </div>
        </div>

        {/* ═══════ CONTENUTO PRINCIPALE DX ═══════ */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Riepilogo bar ── */}
          <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-4 py-2 flex items-center gap-3 text-xs flex-wrap">
            <span className="font-bold text-teal-900">{totFornitori} fornitori</span>
            <span className="text-neutral-400">|</span>
            <span className="text-neutral-500">{totFatture} fatture</span>
            <span className="text-neutral-400">|</span>
            <span className="text-neutral-500">Totale: <strong className="text-teal-800">€ {fmt(totSpesa)}</strong></span>
            {totFornitori > 0 && (
              <>
                <span className="text-neutral-400">|</span>
                <span className="text-neutral-500">Media: <strong className="text-teal-800">€ {fmt(totSpesa / totFornitori)}</strong>/forn.</span>
              </>
            )}
          </div>

          {loading ? (
            <div className="text-center py-20 text-neutral-400">Caricamento fornitori...</div>
          ) : openKey && (detailData || detLoading) ? (
            /* ═══════ VISTA DETTAGLIO INLINE ═══════ */
            <FornitoreDetailView
              data={detailData}
              setDetailData={setDetailData}
              loading={detLoading}
              categorie={categorie}
              openKey={openKey}
              onClose={() => { setOpenKey(null); setDetailData(null); }}
              onRefresh={refreshDetail}
              onExclude={() => { setOpenKey(null); setDetailData(null); fetchAll(); }}
              onReloadList={fetchAll}
            />
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-neutral-400">
              {fornitori.length === 0 ? "Nessun fornitore trovato." : "Nessun risultato per i filtri selezionati."}
            </div>
          ) : (
            /* ═══════ LISTA TABELLA CON SELEZIONE ═══════ */
            <>
              {/* Bulk edit bar */}
              {selected.size > 0 && (
                <div className="sticky top-[41px] z-[8] bg-teal-50 border-b border-teal-300 px-4 py-2 flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold text-teal-900">{selected.size} selezionati</span>
                  <select value={bulkCatId} onChange={e => { setBulkCatId(e.target.value); setBulkSubId(""); }}
                    className="px-2 py-1 border border-teal-300 rounded-lg text-xs">
                    <option value="">— Categoria —</option>
                    {categorie.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <select value={bulkSubId} onChange={e => setBulkSubId(e.target.value)} disabled={!bulkCatId}
                    className="px-2 py-1 border border-teal-300 rounded-lg text-xs">
                    <option value="">— Sotto-cat. —</option>
                    {bulkSubcats.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                  <button onClick={handleBulkAssign} disabled={!bulkCatId || bulkSaving}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition disabled:opacity-50">
                    {bulkSaving ? "Salvataggio..." : "Assegna categoria"}
                  </button>
                  <button onClick={() => setSelected(new Set())}
                    className="px-2 py-1 rounded-lg text-xs text-neutral-500 hover:bg-neutral-100 transition">Deseleziona</button>
                </div>
              )}

              <table className="w-full text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-[41px] z-[5]"
                  style={selected.size > 0 ? { top: "77px" } : undefined}>
                  <tr>
                    <th className="px-2 py-2 w-8 text-center">
                      <input type="checkbox"
                        checked={selected.size === filtered.length && filtered.length > 0}
                        onChange={toggleAll}
                        className="accent-teal-600" />
                    </th>
                    <SortTh label="Fornitore" field="fornitore_nome" sort={fornSort} setSort={setFornSort} />
                    <SortTh label="Cat" field="cat_sort" sort={fornSort} setSort={setFornSort} align="right" />
                    <SortTh label="Pag" field="pag_sort" sort={fornSort} setSort={setFornSort} align="right" />
                    <th className="px-3 py-2 text-left hidden sm:table-cell">P.IVA</th>
                    <SortTh label="Fatture" field="numero_fatture" sort={fornSort} setSort={setFornSort} align="right" />
                    <SortTh label="Totale €" field="totale_fatture" sort={fornSort} setSort={setFornSort} align="right" />
                    <SortTh label="Media" field="media_fattura" sort={fornSort} setSort={setFornSort} align="right" />
                    <SortTh label="Primo" field="primo_acquisto" sort={fornSort} setSort={setFornSort} />
                    <SortTh label="Ultimo" field="ultimo_acquisto" sort={fornSort} setSort={setFornSort} />
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f, idx) => {
                    const key = f.fornitore_piva || f.fornitore_nome;
                    const isSelected = selected.has(key);
                    return (
                      <tr key={idx}
                        className={`border-b border-neutral-100 cursor-pointer transition ${
                          isSelected ? "bg-teal-100/60" : openKey === key ? "bg-teal-50" : "hover:bg-teal-50/40"
                        }`}
                        onClick={() => openDetail(f)}>
                        <td className="px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected}
                            onChange={() => toggleSelect(key)}
                            className="accent-teal-600" />
                        </td>
                        <td className="px-3 py-2.5 font-medium text-neutral-900">
                          {f.fornitore_nome || "—"}
                          {!!f.escluso_acquisti && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-amber-100 text-amber-700 uppercase">escluso</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {f.cat_status === "ok" && (
                            <Tooltip label={`${f.righe_categorizzate}/${f.righe_totali} — tutte definite`}>
                              <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700">✓</span>
                            </Tooltip>
                          )}
                          {f.cat_status === "auto" && (
                            <Tooltip label={`${f.righe_auto}/${f.righe_totali} categorie ereditate da fornitore`}>
                              <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold bg-amber-100 text-amber-700">C</span>
                            </Tooltip>
                          )}
                          {f.cat_status === "partial" && (
                            <Tooltip label={`${f.righe_categorizzate}/${f.righe_totali} categorizzati`}>
                              <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold bg-orange-100 text-orange-700">
                                {f.righe_categorizzate}/{f.righe_totali}
                              </span>
                            </Tooltip>
                          )}
                          {f.cat_status === "none" && f.righe_totali > 0 && (
                            <Tooltip label={`0/${f.righe_totali} — nessuna categoria`}>
                              <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold bg-red-100 text-red-600">✗</span>
                            </Tooltip>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {f.pag_status === "ok" && (
                            <Tooltip label={`${f.fat_con_scadenza}/${f.fat_totali_pag} — tutte con scadenza`}>
                              <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700">✓</span>
                            </Tooltip>
                          )}
                          {f.pag_status === "partial" && (
                            <Tooltip label={`${f.fat_con_scadenza}/${f.fat_totali_pag} con scadenza`}>
                              <span className="inline-flex items-center justify-center min-w-[24px] h-5 rounded text-[9px] font-bold bg-orange-100 text-orange-700 px-1">
                                {f.fat_con_scadenza}/{f.fat_totali_pag}
                              </span>
                            </Tooltip>
                          )}
                          {f.pag_status === "default" && (
                            <Tooltip label="Default fornitore configurato, nessuna scadenza da fatture">
                              <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold bg-blue-100 text-blue-700">D</span>
                            </Tooltip>
                          )}
                          {f.pag_status === "none" && (
                            <Tooltip label="Nessun dato pagamento">
                              <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold bg-red-100 text-red-600">✗</span>
                            </Tooltip>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-neutral-500 text-[10px] hidden sm:table-cell font-mono">{f.fornitore_piva || "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{f.numero_fatture}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-teal-900">€ {fmt(f.totale_fatture)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-neutral-500">€ {fmt(f.media_fattura)}</td>
                        <td className="px-3 py-2.5 text-left text-[10px] text-neutral-500">{f.primo_acquisto || "—"}</td>
                        <td className="px-3 py-2.5 text-left text-[10px] text-neutral-500">{f.ultimo_acquisto || "—"}</td>
                        <td className="px-3 py-2.5 text-center text-neutral-400">→</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// COMPONENTE DETTAGLIO FORNITORE (inline)
// ═══════════════════════════════════════════════════════
function FornitoreDetailView({ data, setDetailData, loading, categorie, openKey, onClose, onRefresh, onReloadList }) {
  const [tab, setTab] = useState("fatture"); // "fatture" | "prodotti"

  // ── Dettaglio fattura inline ──
  const [openFatturaId, setOpenFatturaId] = useState(null);
  // fatturaDetail/fatturaDetLoading non servono più: FattureDettaglio gestisce
  // il proprio fetch. Manteniamo solo openFatturaId per decidere se mostrare
  // la lista o il dettaglio inline.
  const [fattSort, setFattSort] = useState({ field: "data_fattura", dir: "desc" });

  // ── Selezione fatture per pagamento ──
  const [selFatt, setSelFatt] = useState(new Set());
  const [markingPaid, setMarkingPaid] = useState(false);
  const [metodoPag, setMetodoPag] = useState("CONTO_CORRENTE");

  // ── Esclusione acquisti ──
  const [togglingExcl, setTogglingExcl] = useState(false);
  const [localExcl, setLocalExcl] = useState(false);

  // ── Categoria generica fornitore ──
  const [catGenericaId, setCatGenericaId] = useState("");
  const [subGenericaId, setSubGenericaId] = useState("");
  const [savingGenerica, setSavingGenerica] = useState(false);

  // ── Condizioni pagamento fornitore ──
  const [pagMp, setPagMp] = useState("");
  const [pagGiorni, setPagGiorni] = useState("");
  const [pagNote, setPagNote] = useState("");
  const [pagPreset, setPagPreset] = useState("");
  const [pagPresets, setPagPresets] = useState([]);
  const [pagLoading, setPagLoading] = useState(false);
  const [pagSaving, setPagSaving] = useState(false);
  const [pagSaved, setPagSaved] = useState(false);
  const [pagAutoDetected, setPagAutoDetected] = useState(null);
  const [pagHasManual, setPagHasManual] = useState(false);

  // ── Prodotti: filtri e bulk ──
  const [prodSearch, setProdSearch] = useState("");
  const [prodFilter, setProdFilter] = useState("tutti");
  const [prodSort, setProdSort] = useState({ field: "totale_spesa", dir: "desc" });
  const [selected, setSelected] = useState(new Set());
  const [bulkCatId, setBulkCatId] = useState("");
  const [bulkSubId, setBulkSubId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [saving, setSaving] = useState(null);

  // Reset state on fornitore change
  useEffect(() => {
    setTab("fatture");
    setProdSearch(""); setProdFilter("tutti");
    setProdSort({ field: "totale_spesa", dir: "desc" });
    setSelected(new Set());
    setBulkCatId(""); setBulkSubId("");
    setCatGenericaId(""); setSubGenericaId("");
    setOpenFatturaId(null); setSelFatt(new Set());
    setPagMp(""); setPagGiorni(""); setPagNote(""); setPagPreset(""); setPagSaved(false); setPagAutoDetected(null); setPagHasManual(false);
    setLocalExcl(false);
  }, [openKey]);

  // Sync esclusione con data
  useEffect(() => {
    if (data?.escluso_acquisti != null) setLocalExcl(!!data.escluso_acquisti);
  }, [data?.escluso_acquisti]);

  // Carica dati pagamento fornitore + preset
  useEffect(() => {
    if (!data?.fornPiva) { setPagLoading(false); return; }
    let cancelled = false;
    const loadPag = async () => {
      try {
        setPagLoading(true);
        const [r, rPresets] = await Promise.all([
          apiFetch(`${API_BASE}/controllo-gestione/fornitore/${encodeURIComponent(data.fornPiva)}/pagamento`),
          apiFetch(`${API_BASE}/controllo-gestione/condizioni-pagamento/preset`),
        ]);
        if (cancelled) return;
        if (rPresets.ok) setPagPresets(await rPresets.json());
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) {
            setPagHasManual(!!d.has_manual);
            setPagAutoDetected(d.auto_detected || null);
            setPagPreset(d.preset_codice || "");
            if (d.has_manual) {
              setPagMp(d.modalita_pagamento_default || "");
              setPagGiorni(d.giorni_pagamento != null ? String(d.giorni_pagamento) : "");
              setPagNote(d.note_pagamento || "");
              if (!d.preset_codice && d.auto_detected?.preset_suggerito) {
                // Suggerisci il preset ma non selezionarlo
              }
            } else if (d.auto_detected?.preset_suggerito) {
              setPagPreset(d.auto_detected.preset_suggerito.codice || "");
              setPagMp(d.auto_detected.modalita_pagamento || "");
              setPagGiorni(d.auto_detected.giorni_pagamento != null ? String(d.auto_detected.giorni_pagamento) : "");
              setPagNote("");
            } else if (d.auto_detected) {
              setPagMp(d.auto_detected.modalita_pagamento || "");
              setPagGiorni(d.auto_detected.giorni_pagamento != null ? String(d.auto_detected.giorni_pagamento) : "");
              setPagNote("");
            } else {
              setPagMp(""); setPagGiorni(""); setPagNote("");
            }
          }
        }
      } catch {
        // Endpoint non disponibile
      } finally {
        if (!cancelled) setPagLoading(false);
      }
    };
    loadPag();
    return () => { cancelled = true; };
  }, [data?.fornPiva]);

  const handleSavePagamento = async () => {
    if (!data?.fornPiva) return;
    setPagSaving(true);
    setPagSaved(false);
    try {
      await apiFetch(`${API_BASE}/controllo-gestione/fornitore/${data.fornPiva}/pagamento`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modalita_pagamento_default: pagMp || null,
          giorni_pagamento: pagGiorni ? parseInt(pagGiorni) : null,
          note_pagamento: pagNote || null,
          preset_codice: pagPreset || null,
        }),
      });
      setPagHasManual(true);
      setPagSaved(true);
      setTimeout(() => setPagSaved(false), 2000);
    } catch (e) {
      console.error("Errore salvataggio pagamento:", e);
    } finally {
      setPagSaving(false);
    }
  };

  // ── Segna fatture come pagate ──
  const [markMsg, setMarkMsg] = useState(null);

  const reloadFatture = async () => {
    const key = data?.fornPiva || data?.fornNome;
    if (!key) return;
    const enc = encodeURIComponent(key);
    const res = await apiFetch(`${FE}/fatture?fornitore_piva=${enc}&limit=10000`);
    if (res.ok) {
      const d = await res.json();
      setDetailData(prev => ({ ...prev, fatture: d.fatture || [] }));
    }
  };

  const handleMarkPaid = async () => {
    if (selFatt.size === 0) return;
    setMarkingPaid(true);
    setMarkMsg(null);
    try {
      const r = await apiFetch(`${FE}/fatture/segna-pagate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fattura_ids: [...selFatt], metodo_pagamento: metodoPag }),
      });
      const result = await r.json();
      if (result.ok) {
        const n = selFatt.size;
        setSelFatt(new Set());
        setMarkMsg({ type: "ok", text: `${n} fatture segnate come pagate (${metodoPag === "CONTO_CORRENTE" ? "Conto Corrente" : metodoPag === "CARTA" ? "Carta" : "Contanti"})` });
        setTimeout(() => setMarkMsg(null), 4000);
        if (onReloadList) onReloadList();
        await reloadFatture();
      } else {
        setMarkMsg({ type: "err", text: result.error || "Errore" });
      }
    } catch (e) {
      console.error(e);
      setMarkMsg({ type: "err", text: "Errore di rete" });
    }
    setMarkingPaid(false);
  };

  const handleMarkUnpaid = async () => {
    if (selFatt.size === 0) return;
    setMarkingPaid(true);
    setMarkMsg(null);
    try {
      const r = await apiFetch(`${FE}/fatture/segna-non-pagate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fattura_ids: [...selFatt] }),
      });
      const result = await r.json();
      if (result.ok) {
        const n = selFatt.size;
        setSelFatt(new Set());
        setMarkMsg({ type: "ok", text: `${n} fatture riportate a non pagate` });
        setTimeout(() => setMarkMsg(null), 4000);
        if (onReloadList) onReloadList();
        await reloadFatture();
      } else {
        setMarkMsg({ type: "err", text: result.error || "Errore" });
      }
    } catch (e) {
      console.error(e);
      setMarkMsg({ type: "err", text: "Errore di rete" });
    }
    setMarkingPaid(false);
  };

  const toggleFattSel = (id) => setSelFatt(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleAllFatt = () => {
    const nonPagate = fatture.filter(f => !f.pagato);
    if (selFatt.size === nonPagate.length) setSelFatt(new Set());
    else setSelFatt(new Set(nonPagate.map(f => f.id)));
  };

  // ── Apri / chiudi dettaglio fattura inline ──
  // FattureDettaglio gestisce il proprio fetch; qui serve solo il toggle dell'id.
  const openFattura = (id) => {
    if (openFatturaId === id) { setOpenFatturaId(null); return; }
    setOpenFatturaId(id);
  };

  // ── Segna pagata manuale (CG) ──
  // Usata come prop onSegnaPagata di FattureDettaglio: il componente interno
  // esegue poi il proprio refetch per aggiornare la sidebar colorata.
  const segnaPagataManuale = async (id) => {
    if (!window.confirm("Segnare questa fattura come pagata (in attesa di riconciliazione banca)?")) return;
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/fattura/${id}/segna-pagata-manuale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metodo_pagamento: "CONTO_CORRENTE" }),
      });
      const d = await res.json();
      if (!d.ok) { alert(d.error || "Errore"); return; }
      // Aggiorna lista fatture del fornitore e KPI sidebar
      await reloadFatture();
      if (onReloadList) onReloadList();
    } catch { alert("Errore di rete"); }
  };

  // Sync della riga fattura modificata dentro il componente FattureDettaglio
  // (scadenza, IBAN, modalità) — aggiorna la lista locale per coerenza badge.
  const handleFatturaUpdatedInline = (f) => {
    if (!f || !f.id) return;
    setDetailData(prev => prev ? {
      ...prev,
      fatture: (prev.fatture || []).map(x => x.id === f.id ? { ...x, ...f } : x),
    } : prev);
  };

  if (loading) return <div className="text-center py-20 text-neutral-400">Caricamento dettaglio...</div>;
  if (!data) return <div className="text-center py-20 text-neutral-400">Errore caricamento</div>;

  const { fatture, prodotti, stats, anagrafica = {}, fornNome, fornPiva, escluso_acquisti: excAcqProp = 0 } = data;
  const anag = anagrafica || {};
  const isExcluded = localExcl;

  const handleToggleExcl = async () => {
    setTogglingExcl(true);
    try {
      const newVal = !isExcluded;
      await apiFetch(`${CAT_BASE}/fornitori/escludi-acquisti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornitore_piva: fornPiva || null,
          fornitore_nome: fornNome,
          escluso_acquisti: newVal,
        }),
      });
      setLocalExcl(newVal);
      if (onReloadList) onReloadList();
    } catch (e) { console.error(e); }
    finally { setTogglingExcl(false); }
  };

  // ── KPI ──
  const totFatture = fatture.length;
  const totSpesa = fatture.reduce((s, f) => s + (f.totale_fattura || 0), 0);
  const totImponibile = fatture.reduce((s, f) => s + (f.imponibile_totale || 0), 0);
  const primoAcquisto = fatture.length > 0
    ? fatture.reduce((min, f) => (!min || (f.data_fattura || "") < min) ? f.data_fattura : min, null) : null;
  const ultimoAcquisto = fatture.length > 0
    ? fatture.reduce((max, f) => (!max || (f.data_fattura || "") > max) ? f.data_fattura : max, null) : null;

  const nProdotti = prodotti.length;
  const nAssegnati = prodotti.filter(p => p.categoria_id).length;
  const nEreditate = prodotti.filter(p => p.categoria_id && p.categoria_auto).length;
  const nPagate = fatture.filter(f => f.pagato).length;
  const nDaPagare = totFatture - nPagate;
  const totDaPagare = fatture.filter(f => !f.pagato).reduce((s, f) => s + (f.totale_fattura || 0), 0);

  // ── Prodotti filtrati ──
  let filteredProd = [...prodotti];
  if (prodFilter === "assegnati") filteredProd = filteredProd.filter(p => p.categoria_id && !p.categoria_auto);
  if (prodFilter === "non_assegnati") filteredProd = filteredProd.filter(p => !p.categoria_id);
  if (prodFilter === "ereditate") filteredProd = filteredProd.filter(p => p.categoria_id && p.categoria_auto);
  if (prodSearch.trim()) {
    const q = prodSearch.toLowerCase();
    filteredProd = filteredProd.filter(p => p.descrizione?.toLowerCase().includes(q));
  }
  // cat_stato_sort: 0 = non definita (✗), 1 = ereditata (C), 2 = definita (✓)
  filteredProd = filteredProd.map(p => ({
    ...p,
    categoria_nome_sort: p.categoria_nome || "",
    sottocategoria_nome_sort: p.sottocategoria_nome || "",
    cat_stato_sort: !p.categoria_id ? 0 : p.categoria_auto ? 1 : 2,
  }));
  filteredProd = sortRows(filteredProd, prodSort);

  const toggleSelect = (key) => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleAll = () => {
    if (selected.size === filteredProd.length) setSelected(new Set());
    else setSelected(new Set(filteredProd.map(p => p.descrizione)));
  };

  const bulkCat = categorie.find(c => c.id === Number(bulkCatId));
  const bulkSubcats = bulkCat?.sottocategorie || [];
  const genCat = categorie.find(c => c.id === Number(catGenericaId));
  const genSubcats = genCat?.sottocategorie || [];

  // ── Handlers ──
  const handleSaveGenerica = async () => {
    setSavingGenerica(true);
    try {
      await apiFetch(`${CAT_BASE}/fornitori/assegna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornitore_piva: fornPiva || openKey,
          fornitore_nome: fornNome,
          categoria_id: catGenericaId ? Number(catGenericaId) : null,
          sottocategoria_id: subGenericaId ? Number(subGenericaId) : null,
        }),
      });
      // Ricarica dettaglio + lista fornitori per aggiornare badge
      onRefresh();
      if (onReloadList) onReloadList();
    } catch (e) { console.error(e); }
    finally { setSavingGenerica(false); }
  };

  const handleAssign = async (prod, catId, subId) => {
    setSaving(prod.descrizione);
    try {
      await apiFetch(`${CAT_BASE}/fornitori/prodotti/assegna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornitore_piva: fornPiva || openKey,
          fornitore_nome: fornNome,
          descrizione: prod.descrizione,
          categoria_id: catId || null,
          sottocategoria_id: subId || null,
        }),
      });
      onRefresh();
    } catch (e) { console.error(e); }
    finally { setSaving(null); }
  };

  const handleBulkAssign = async () => {
    if (selected.size === 0) return;
    setBulkSaving(true);
    const catId = bulkCatId ? Number(bulkCatId) : null;
    const subId = bulkSubId ? Number(bulkSubId) : null;
    try {
      for (const desc of selected) {
        const prod = prodotti.find(p => p.descrizione === desc);
        if (prod) {
          await apiFetch(`${CAT_BASE}/fornitori/prodotti/assegna`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fornitore_piva: fornPiva || openKey,
              fornitore_nome: fornNome,
              descrizione: prod.descrizione,
              categoria_id: catId,
              sottocategoria_id: subId,
            }),
          });
        }
      }
      setSelected(new Set());
      setBulkCatId(""); setBulkSubId("");
      onRefresh();
    } catch (_) {} finally { setBulkSaving(false); }
  };

  const tabCls = (t) =>
    `px-4 py-2 text-xs font-semibold border-b-2 transition ${
      tab === t
        ? "border-teal-600 text-teal-800"
        : "border-transparent text-neutral-500 hover:text-neutral-700"
    }`;

  // ── Sidebar color + tag stato ──
  const sbc = getFornitoreSidebar(isExcluded, nDaPagare);
  const statoLabel = isExcluded ? "ESCLUSO" : nDaPagare > 0 ? "IN SOSPESO" : "ATTIVO";

  return (
    <div className="h-full flex flex-col bg-neutral-50">

      {/* ══════ TOP BAR (back + stato esclusione) ══════ */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 bg-white flex-shrink-0">
        <button onClick={onClose}
          className="text-xs text-teal-700 hover:text-teal-900 font-medium transition">
          ← Torna alla lista
        </button>
        <button onClick={handleToggleExcl} disabled={togglingExcl}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border transition disabled:opacity-50 ${
            isExcluded
              ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
          }`}>
          {togglingExcl ? "..." : isExcluded ? "✕ Escluso — Ripristina" : "Nascondi da acquisti"}
        </button>
      </div>

      {/* ══════ LAYOUT SIDEBAR + MAIN ══════ */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[300px_1fr] overflow-hidden min-h-0">

        {/* ═══════════ SIDEBAR COLORATA ═══════════ */}
        <div className={`${sbc.bg} text-white flex flex-col h-full overflow-hidden`}>

          {/* Header fisso */}
          <div className="p-4 pb-3 flex-shrink-0">
            <p className="text-[9px] opacity-60 uppercase tracking-wider mb-0.5">Fornitore</p>
            <h2 className="text-base font-bold leading-tight font-playfair">
              {fornNome || "—"}
            </h2>
            {fornPiva && (
              <p className="text-[10px] opacity-70 mt-0.5 font-mono">P.IVA {fornPiva}</p>
            )}
            {anag.fornitore_cf && anag.fornitore_cf !== fornPiva && (
              <p className="text-[10px] opacity-60 font-mono">C.F. {anag.fornitore_cf}</p>
            )}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="inline-flex items-center bg-white/20 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                {statoLabel}
              </span>
              {totFatture > 0 && (
                <span className="inline-flex items-center bg-white/10 text-[10px] px-2 py-0.5 rounded tabular-nums">
                  {totFatture} fatt.
                </span>
              )}
            </div>
          </div>

          {/* Contenuto scrollabile */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">

            {/* Stat principale — Totale spesa */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className={`${sbc.accent} rounded-lg p-2.5 text-center col-span-2`}>
                <div className="text-[8px] uppercase opacity-60 tracking-wider">Totale spesa</div>
                <div className="text-2xl font-bold font-playfair tabular-nums">
                  € {fmt(totSpesa)}
                </div>
              </div>
              <div className={`${sbc.accent} rounded-lg p-2 text-center`}>
                <div className="text-[8px] uppercase opacity-60 tracking-wider">Imponibile</div>
                <div className="text-sm font-bold tabular-nums">
                  € {fmt(totImponibile)}
                </div>
              </div>
              <div className={`${sbc.accent} rounded-lg p-2 text-center`}>
                <div className="text-[8px] uppercase opacity-60 tracking-wider">Media fatt.</div>
                <div className="text-sm font-bold tabular-nums">
                  € {fmt(totFatture > 0 ? totSpesa / totFatture : 0)}
                </div>
              </div>
              <div className={`${sbc.accent} rounded-lg p-2 text-center`}>
                <div className="text-[8px] uppercase opacity-60 tracking-wider">Prodotti</div>
                <div className="text-sm font-bold tabular-nums">{nProdotti}</div>
              </div>
              <div className={`${sbc.accent} rounded-lg p-2 text-center`}>
                <div className="text-[8px] uppercase opacity-60 tracking-wider">Pagate</div>
                <div className="text-sm font-bold tabular-nums">{nPagate}/{totFatture}</div>
              </div>
            </div>

            {/* Box "Da pagare" evidenziato se ci sono scadute */}
            {nDaPagare > 0 && (
              <div className="mb-3 rounded-lg p-2.5 bg-red-500/25 border border-red-300/40">
                <div className="text-[9px] uppercase opacity-80 tracking-wider mb-0.5">⚠ Da pagare</div>
                <div className="text-lg font-bold tabular-nums">€ {fmt(totDaPagare)}</div>
                <div className="text-[10px] opacity-80">{nDaPagare} fatture aperte</div>
              </div>
            )}

            {/* Info list */}
            <ul className="text-[11px] space-y-0 mb-3">
              {[
                ["Primo acquisto", primoAcquisto],
                ["Ultimo acquisto", ultimoAcquisto],
              ].filter(([, v]) => v).map(([label, val]) => (
                <li key={label} className="flex justify-between py-1.5 border-b border-white/10 gap-2">
                  <span className="opacity-60 flex-shrink-0">{label}</span>
                  <span className="font-medium text-right">{val}</span>
                </li>
              ))}
            </ul>

            {/* Sede anagrafica */}
            {(anag.fornitore_indirizzo || anag.fornitore_citta) && (
              <div className="mb-3 pb-2 border-b border-white/10">
                <div className="text-[9px] opacity-60 uppercase tracking-wider mb-1">Sede</div>
                <div className="text-[10px] space-y-0.5">
                  {anag.fornitore_indirizzo && <div className="font-medium">{anag.fornitore_indirizzo}</div>}
                  {(anag.fornitore_cap || anag.fornitore_citta) && (
                    <div className="opacity-80">
                      {[anag.fornitore_cap, anag.fornitore_citta, anag.fornitore_provincia ? `(${anag.fornitore_provincia})` : null]
                        .filter(Boolean).join(" ")}
                    </div>
                  )}
                  {anag.fornitore_nazione && anag.fornitore_nazione !== "IT" && (
                    <div className="opacity-60">{anag.fornitore_nazione}</div>
                  )}
                </div>
              </div>
            )}

            {/* Stats breakdown categorie (compatto) */}
            {stats && stats.length > 0 && (
              <div className="mb-3 pb-2 border-b border-white/10">
                <div className="text-[9px] opacity-60 uppercase tracking-wider mb-1">Distribuzione categorie</div>
                <div className="flex flex-wrap gap-1">
                  {stats.slice(0, 6).map((s, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 border border-white/15 leading-tight">
                      {s.categoria === "(Non categorizzato)" ? "N/A" : s.categoria}
                      <span className="ml-1 font-semibold">
                        {s.totale_spesa?.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ID tecnico */}
            <div className="text-[9px] opacity-40 mt-2">
              ID: {fornPiva || fornNome}
            </div>
          </div>
        </div>

        {/* ═══════════ MAIN CONTENT ═══════════ */}
        <div className="bg-white overflow-y-auto min-w-0">

          {/* Banner esclusione */}
          {isExcluded && (
            <div className="mx-5 mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Questo fornitore è escluso dalle statistiche acquisti (dashboard, KPI, grafici). Le categorie restano editabili.
            </div>
          )}

          {/* ── CATEGORIA GENERICA ── */}
          <div className="border-b border-neutral-200">
            <SectionHeader title="Categoria generica fornitore" />
            <div className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <select value={catGenericaId} onChange={e => { setCatGenericaId(e.target.value); setSubGenericaId(""); }}
                  className="px-2 py-1.5 border border-neutral-300 rounded-lg text-xs">
                  <option value="">— Nessuna categoria —</option>
                  {categorie.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <select value={subGenericaId} onChange={e => setSubGenericaId(e.target.value)}
                  disabled={!catGenericaId}
                  className="px-2 py-1.5 border border-neutral-300 rounded-lg text-xs disabled:bg-neutral-50 disabled:text-neutral-400">
                  <option value="">— Sotto-cat. —</option>
                  {genSubcats.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
                <button onClick={handleSaveGenerica} disabled={savingGenerica}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition disabled:opacity-50">
                  {savingGenerica ? "Salvataggio..." : "Salva"}
                </button>
              </div>
              {stats && stats.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {stats.map((s, i) => (
                    <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      s.categoria === "(Non categorizzato)"
                        ? "bg-neutral-100 border-neutral-300 text-neutral-600"
                        : "bg-teal-50 border-teal-200 text-teal-800"
                    }`}>
                      {s.categoria}{s.sottocategoria ? ` > ${s.sottocategoria}` : ""}
                      <span className="ml-1 font-semibold">
                        {s.totale_spesa?.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── CONDIZIONI PAGAMENTO ── */}
          {fornPiva && (
            <div className="border-b border-neutral-200">
              <SectionHeader title="Condizioni di pagamento">
                {pagHasManual && (
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                    ✓ Default salvato
                  </span>
                )}
              </SectionHeader>
              <div className="px-5 py-4">
                {pagLoading ? (
                  <p className="text-xs text-neutral-400">Caricamento...</p>
                ) : (
                  <>
                    {/* Banner auto-rilevato */}
                    {pagAutoDetected && !pagHasManual && (
                      <div className="mb-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-blue-700">
                          <strong>Auto-rilevato</strong> da {pagAutoDetected.fatture_analizzate} fatture:
                          {pagAutoDetected.modalita_pagamento && <> {pagAutoDetected.modalita_pagamento}</>}
                          {pagAutoDetected.giorni_pagamento != null && <> ~{pagAutoDetected.giorni_pagamento}gg</>}
                          {" "}{pagAutoDetected.calcolo === "FM" ? "Fine Mese" : "Data Fattura"}
                          {pagAutoDetected.preset_suggerito && (
                            <span className="ml-1 font-semibold">→ {pagAutoDetected.preset_suggerito.descrizione}</span>
                          )}
                        </span>
                        <button onClick={handleSavePagamento}
                          className="ml-auto px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition">
                          Conferma
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-[220px]">
                        <span className="text-[10px] text-neutral-400 block mb-0.5 uppercase tracking-wide">Condizione di pagamento</span>
                        <select value={pagPreset} onChange={e => {
                          const cod = e.target.value;
                          setPagPreset(cod);
                          const p = pagPresets.find(p => p.codice === cod);
                          if (p) {
                            setPagMp(p.modalita);
                            setPagGiorni(String(p.giorni));
                          } else {
                            setPagMp(""); setPagGiorni("");
                          }
                        }}
                          className="px-2 py-1.5 border border-neutral-300 rounded-lg text-xs w-full">
                          <option value="">— Seleziona condizione —</option>
                          {pagPresets.map(p => (
                            <option key={p.codice} value={p.codice}>{p.descrizione}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24">
                        <span className="text-[10px] text-neutral-400 block mb-0.5 uppercase tracking-wide">Modalità</span>
                        <input type="text" value={pagMp} readOnly
                          className="px-2 py-1.5 border border-neutral-200 rounded-lg text-xs w-full bg-neutral-50 text-neutral-500" />
                      </div>
                      <div className="w-16">
                        <span className="text-[10px] text-neutral-400 block mb-0.5 uppercase tracking-wide">Giorni</span>
                        <input type="text" value={pagGiorni} readOnly
                          className="px-2 py-1.5 border border-neutral-200 rounded-lg text-xs w-full bg-neutral-50 text-neutral-500" />
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <span className="text-[10px] text-neutral-400 block mb-0.5 uppercase tracking-wide">Note</span>
                        <input type="text" value={pagNote} onChange={e => setPagNote(e.target.value)}
                          placeholder="Note aggiuntive..."
                          className="px-2 py-1.5 border border-neutral-300 rounded-lg text-xs w-full" />
                      </div>
                      <button onClick={handleSavePagamento} disabled={pagSaving}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 transition disabled:opacity-50">
                        {pagSaving ? "..." : pagSaved ? "✓ Salvato" : "Salva"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── TABS ── */}
          <div className="border-b border-neutral-200 bg-neutral-50 px-3 flex-shrink-0">
            <div className="flex gap-1">
              <button className={tabCls("fatture")} onClick={() => setTab("fatture")}>
                Fatture ({totFatture})
              </button>
              <button className={tabCls("prodotti")} onClick={() => setTab("prodotti")}>
                Prodotti ({nProdotti})
                {nProdotti > 0 && nAssegnati < nProdotti && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold">
                    {nProdotti - nAssegnati}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ═══════ TAB FATTURE ═══════ */}
          {tab === "fatture" && (
            fatture.length === 0 ? (
              <p className="text-neutral-400 text-sm py-8 text-center">Nessuna fattura trovata.</p>
            ) : openFatturaId ? (
              /* ── Dettaglio fattura inline via FattureDettaglio unificato ── */
              <div className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <button
                    onClick={() => setOpenFatturaId(null)}
                    className="text-xs text-teal-700 hover:text-teal-900 font-medium transition">
                    ← Torna alle fatture del fornitore
                  </button>
                  <span className="text-[10px] text-neutral-400">ID: {openFatturaId}</span>
                </div>
                <FattureDettaglio
                  fatturaId={openFatturaId}
                  inline={true}
                  onClose={() => setOpenFatturaId(null)}
                  onSegnaPagata={segnaPagataManuale}
                  onFatturaUpdated={handleFatturaUpdatedInline}
                />
              </div>
            ) : (
          <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white shadow-sm">
            {/* Feedback messaggio */}
            {markMsg && (
              <div className={`px-4 py-2 text-xs font-medium ${markMsg.type === "ok" ? "bg-emerald-50 text-emerald-700 border-b border-emerald-200" : "bg-red-50 text-red-700 border-b border-red-200"}`}>
                {markMsg.type === "ok" ? "✓ " : "✗ "}{markMsg.text}
              </div>
            )}
            {/* Barra azioni selezione */}
            {selFatt.size > 0 && (
              <div className="bg-sky-50 border-b border-sky-200 px-4 py-2 flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-sky-900">{selFatt.size} selezionate</span>
                <span className="text-[10px] text-sky-600">
                  Totale: € {fmt(fatture.filter(f => selFatt.has(f.id)).reduce((s, f) => s + (f.totale_fattura || 0), 0))}
                </span>
                {fatture.filter(f => selFatt.has(f.id)).some(f => !f.pagato) && (
                  <>
                    <select value={metodoPag} onChange={e => setMetodoPag(e.target.value)}
                      className="px-2 py-1 rounded-lg text-[10px] border border-sky-200 bg-white text-sky-800 font-medium">
                      <option value="CONTO_CORRENTE">Conto Corrente</option>
                      <option value="CARTA">Carta di Credito</option>
                      <option value="CONTANTI">Contanti</option>
                    </select>
                    <button onClick={handleMarkPaid} disabled={markingPaid}
                      className="px-3 py-1 rounded-lg text-[10px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50">
                      {markingPaid ? "..." : "Segna pagate"}
                    </button>
                  </>
                )}
                {fatture.filter(f => selFatt.has(f.id)).some(f => f.pagato) && (
                  <button onClick={handleMarkUnpaid} disabled={markingPaid}
                    className="px-3 py-1 rounded-lg text-[10px] font-semibold bg-red-500 text-white hover:bg-red-600 transition disabled:opacity-50">
                    {markingPaid ? "..." : "Segna non pagate"}
                  </button>
                )}
                <button onClick={() => setSelFatt(new Set())}
                  className="px-2 py-1 rounded-lg text-[10px] text-neutral-500 hover:bg-neutral-100 transition ml-auto">Deseleziona</button>
              </div>
            )}
            <div className="max-h-[50vh] overflow-y-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-neutral-50 text-neutral-600 sticky top-0 text-[10px] uppercase tracking-wide">
                  <tr>
                    <th className="px-2 py-2 w-8 text-center">
                      <input type="checkbox"
                        checked={selFatt.size > 0 && selFatt.size === fatture.filter(f => !f.pagato).length}
                        onChange={toggleAllFatt} className="accent-sky-600" />
                    </th>
                    <SortTh label="Data" field="data_fattura" sort={fattSort} setSort={setFattSort} />
                    <SortTh label="N. Fattura" field="numero_fattura" sort={fattSort} setSort={setFattSort} />
                    <SortTh label="Imponibile" field="imponibile_totale" sort={fattSort} setSort={setFattSort} align="right" />
                    <SortTh label="IVA" field="iva_totale" sort={fattSort} setSort={setFattSort} align="right" />
                    <SortTh label="Totale" field="totale_fattura" sort={fattSort} setSort={setFattSort} align="right" />
                    <SortTh label="Scadenza" field="data_scadenza" sort={fattSort} setSort={setFattSort} />
                    <SortTh label="Righe" field="n_righe" sort={fattSort} setSort={setFattSort} align="right" />
                    <SortTh label="Stato" field="pagato_sort" sort={fattSort} setSort={setFattSort} />
                    <th className="px-3 py-2 text-center">Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {sortRows(fatture.map(f => ({ ...f, pagato_sort: f.pagato ? 1 : 0 })), fattSort).map(f => (
                    <tr key={f.id}
                      onClick={() => openFattura(f.id)}
                      className={`border-t border-neutral-100 cursor-pointer transition ${
                        selFatt.has(f.id) ? "bg-sky-50" : openFatturaId === f.id ? "bg-teal-50" : "hover:bg-teal-50/30"
                      }`}>
                      <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selFatt.has(f.id)}
                          onChange={() => toggleFattSel(f.id)} className="accent-sky-600" />
                      </td>
                      <td className="px-3 py-2 tabular-nums text-neutral-700">{f.data_fattura || "—"}</td>
                      <td className="px-3 py-2 text-neutral-600 font-mono text-[10px] max-w-[140px] truncate">{f.numero_fattura || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-700">€ {fmt(f.imponibile_totale)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-400 text-[10px]">€ {fmt(f.iva_totale)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-900">€ {fmt(f.totale_fattura)}</td>
                      <td className="px-3 py-2 tabular-nums text-[10px]">
                        {f.data_scadenza ? (
                          <span className="text-emerald-700">
                            {f.data_scadenza}
                            {pagMp && f.modalita_pagamento && f.modalita_pagamento !== pagMp && (
                              <Tooltip label={`Modalità diversa: ${f.modalita_pagamento} (default: ${pagMp})`}>
                                <span className="ml-1 px-1 py-0.5 rounded text-[7px] font-bold bg-amber-100 text-amber-700">≠</span>
                              </Tooltip>
                            )}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-red-100 text-red-600">MANCA</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {f.n_righe > 0 ? <span className="text-teal-700 font-medium">{f.n_righe}</span> : <span className="text-neutral-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {f.pagato
                          ? <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-700">Pagata</span>
                          : <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-50 text-red-600">Da pagare</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                          f.fonte === "fic" ? "bg-teal-50 text-teal-700" : "bg-neutral-100 text-neutral-600"
                        }`}>{(f.fonte || "xml").toUpperCase()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ═══════ TAB PRODOTTI ═══════ */}
      {tab === "prodotti" && (
        <div className="space-y-3">
          {/* Filtri */}
          <div className="flex flex-wrap gap-3 items-center">
            <input type="text" placeholder="Cerca prodotto..."
              value={prodSearch} onChange={e => setProdSearch(e.target.value)}
              className="px-3 py-1.5 border border-neutral-300 rounded-xl text-xs w-56 focus:outline-none focus:ring-2 focus:ring-teal-300" />
            <select value={prodFilter} onChange={e => setProdFilter(e.target.value)}
              className="px-3 py-1.5 border border-neutral-300 rounded-xl text-xs">
              <option value="tutti">Tutti ({nProdotti})</option>
              <option value="non_assegnati">Da assegnare ({nProdotti - nAssegnati})</option>
              <option value="ereditate">Ereditate ({nEreditate})</option>
              <option value="assegnati">Definite ({nAssegnati - nEreditate})</option>
            </select>
            <span className="text-[10px] text-neutral-500 ml-auto">
              {nAssegnati}/{nProdotti} categorizzati ({nProdotti > 0 ? Math.round(nAssegnati / nProdotti * 100) : 0}%)
            </span>
          </div>

          {/* Bulk edit bar */}
          {selected.size > 0 && (
            <div className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-2.5 flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-teal-900">{selected.size} selezionati</span>
              <select value={bulkCatId} onChange={e => { setBulkCatId(e.target.value); setBulkSubId(""); }}
                className="px-2 py-1 border border-teal-300 rounded-lg text-xs">
                <option value="">— Categoria —</option>
                {categorie.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <select value={bulkSubId} onChange={e => setBulkSubId(e.target.value)} disabled={!bulkCatId}
                className="px-2 py-1 border border-teal-300 rounded-lg text-xs">
                <option value="">— Sotto-cat. —</option>
                {bulkSubcats.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <button onClick={handleBulkAssign} disabled={!bulkCatId || bulkSaving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition disabled:opacity-50">
                {bulkSaving ? "Salvataggio..." : "Assegna a tutti"}
              </button>
              <button onClick={() => setSelected(new Set())}
                className="px-2 py-1 rounded-lg text-xs text-neutral-500 hover:bg-neutral-100 transition">Deseleziona</button>
            </div>
          )}

          {/* Tabella prodotti */}
          {filteredProd.length === 0 ? (
            <p className="text-neutral-400 text-sm py-8 text-center">Nessun prodotto trovato.</p>
          ) : (
            <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="max-h-[50vh] overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-neutral-50 text-neutral-600 sticky top-0 text-[10px] uppercase tracking-wide">
                    <tr>
                      <th className="px-2 py-2 w-8 text-center">
                        <input type="checkbox" checked={selected.size === filteredProd.length && filteredProd.length > 0}
                          onChange={toggleAll} className="accent-teal-600" />
                      </th>
                      <SortTh label="Descrizione" field="descrizione" sort={prodSort} setSort={setProdSort} />
                      <SortTh label="Righe" field="n_righe" sort={prodSort} setSort={setProdSort} align="right" />
                      <SortTh label="Q.tà tot" field="quantita_totale" sort={prodSort} setSort={setProdSort} align="right" />
                      <SortTh label="€ medio" field="prezzo_medio" sort={prodSort} setSort={setProdSort} align="right" />
                      <SortTh label="€ totale" field="totale_spesa" sort={prodSort} setSort={setProdSort} align="right" />
                      <SortTh label="Categoria" field="categoria_nome_sort" sort={prodSort} setSort={setProdSort} />
                      <SortTh label="Sotto-cat." field="sottocategoria_nome_sort" sort={prodSort} setSort={setProdSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProd.map((p, idx) => {
                      const selCat = categorie.find(c => c.id === p.categoria_id);
                      const subcats = selCat?.sottocategorie || [];
                      const isSaving = saving === p.descrizione;
                      const isSelected = selected.has(p.descrizione);
                      return (
                        <tr key={idx}
                          className={`border-t border-neutral-100 ${!p.categoria_id ? "bg-teal-50/30" : ""} ${isSelected ? "bg-teal-100/60" : ""}`}>
                          <td className="px-2 py-2 text-center">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.descrizione)} className="accent-teal-600" />
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-[11px] leading-tight" title={p.descrizione}>
                              {p.descrizione?.length > 80 ? p.descrizione.substring(0, 80) + "..." : p.descrizione}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-neutral-500">{p.n_righe}</td>
                          <td className="px-3 py-2 text-right text-neutral-500">
                            {p.quantita_totale?.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                            {p.unita_misura ? ` ${p.unita_misura}` : ""}
                          </td>
                          <td className="px-3 py-2 text-right text-neutral-500">
                            {p.prezzo_medio?.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {p.totale_spesa?.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2">
                            <select value={p.categoria_id || ""} disabled={isSaving}
                              onChange={e => handleAssign(p, e.target.value ? Number(e.target.value) : null, null)}
                              className="px-1 py-0.5 border border-neutral-300 rounded text-[10px] w-full">
                              <option value="">—</option>
                              {categorie.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select value={p.sottocategoria_id || ""} disabled={isSaving || !p.categoria_id}
                              onChange={e => handleAssign(p, p.categoria_id, e.target.value ? Number(e.target.value) : null)}
                              className="px-1 py-0.5 border border-neutral-300 rounded text-[10px] w-full">
                              <option value="">—</option>
                              {subcats.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
        </div>{/* /main content */}
      </div>{/* /grid sidebar+main */}
    </div>
  );
}

