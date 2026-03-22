// @version: v3.0-cantina-inline
// Elenco fornitori — Layout Cantina: Filtri SX + Lista/Dettaglio inline DX
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const FE = `${API_BASE}/contabilita/fe`;
const CAT_BASE = `${API_BASE}/contabilita/fe/categorie`;
const fmt = (v) =>
  v != null
    ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";

// ── Stili filtri ──
const fLbl = "block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5";
const fInp = "w-full border border-neutral-300 rounded-md px-2 py-1.5 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-teal-300";
const fSel = fInp;

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
  const [categoriaSel, setCategoriaSel] = useState("");
  const [ordineSel, setOrdineSel] = useState("totale_desc");

  // ── Selezione massiva ──
  const [selected, setSelected] = useState(new Set());
  const [bulkCatId, setBulkCatId] = useState("");
  const [bulkSubId, setBulkSubId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  // ── Dettaglio inline ──
  const [openKey, setOpenKey] = useState(null);      // piva || nome del fornitore aperto
  const [detailData, setDetailData] = useState(null); // { fatture, prodotti, stats, fornNome, fornPiva }
  const [detLoading, setDetLoading] = useState(false);

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
    list.sort((a, b) => {
      switch (ordineSel) {
        case "totale_desc": return (b.totale_fatture || 0) - (a.totale_fatture || 0);
        case "totale_asc": return (a.totale_fatture || 0) - (b.totale_fatture || 0);
        case "fatture_desc": return (b.numero_fatture || 0) - (a.numero_fatture || 0);
        case "fatture_asc": return (a.numero_fatture || 0) - (b.numero_fatture || 0);
        case "nome_asc": return (a.fornitore_nome || "").localeCompare(b.fornitore_nome || "", "it");
        case "nome_desc": return (b.fornitore_nome || "").localeCompare(a.fornitore_nome || "", "it");
        case "ultimo_desc": return (b.ultimo_acquisto || "").localeCompare(a.ultimo_acquisto || "");
        case "ultimo_asc": return (a.ultimo_acquisto || "").localeCompare(b.ultimo_acquisto || "");
        default: return 0;
      }
    });
    return list;
  }, [fornitori, searchText, ordineSel]);

  // ── KPI ──
  const totFornitori = filtered.length;
  const totSpesa = filtered.reduce((s, f) => s + (f.totale_fatture || 0), 0);
  const totFatture = filtered.reduce((s, f) => s + (f.numero_fatture || 0), 0);

  // ── Contatori filtri attivi ──
  const activeFilters = [searchText, annoSel, categoriaSel, ordineSel !== "totale_desc" ? "x" : ""].filter(Boolean).length;
  const clearFilters = () => {
    setSearchText(""); setAnnoSel(""); setCategoriaSel(""); setOrdineSel("totale_desc");
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
      });
    } catch (e) {
      console.error(e);
      setDetailData(null);
    } finally {
      setDetLoading(false);
    }
  };

  // ── Callback per refresh dettaglio dopo modifica prodotti ──
  const refreshDetail = async () => {
    if (!openKey) return;
    const enc = encodeURIComponent(openKey);
    try {
      const [resProd, resStats] = await Promise.all([
        apiFetch(`${CAT_BASE}/fornitori/${enc}/prodotti`),
        apiFetch(`${CAT_BASE}/fornitori/${enc}/stats`),
      ]);
      setDetailData(prev => ({
        ...prev,
        prodotti: resProd.ok ? null : prev.prodotti,
        stats: resStats.ok ? null : prev.stats,
      }));
      // Need to await json
      const prodotti = resProd.ok ? await resProd.json() : detailData?.prodotti || [];
      const stats = resStats.ok ? await resStats.json() : detailData?.stats || [];
      setDetailData(prev => ({ ...prev, prodotti, stats }));
    } catch (_) {}
  };

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="fornitori" />

      <div className="flex" style={{ height: "calc(100vh - 48px)" }}>

        {/* ═══════ SIDEBAR FILTRI ═══════ */}
        <div className="w-[280px] min-w-[280px] border-r border-neutral-200 bg-neutral-50 overflow-y-auto flex-shrink-0">
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

            <div className="bg-blue-50/40 rounded-lg p-2.5 border border-blue-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest mb-1.5">Ordinamento</div>
              <div>
                <label className={fLbl}>Ordina per</label>
                <select value={ordineSel} onChange={e => setOrdineSel(e.target.value)} className={fSel}>
                  <option value="totale_desc">Spesa totale (alto → basso)</option>
                  <option value="totale_asc">Spesa totale (basso → alto)</option>
                  <option value="fatture_desc">N. fatture (alto → basso)</option>
                  <option value="fatture_asc">N. fatture (basso → alto)</option>
                  <option value="nome_asc">Nome (A → Z)</option>
                  <option value="nome_desc">Nome (Z → A)</option>
                  <option value="ultimo_desc">Ultimo acquisto (recente)</option>
                  <option value="ultimo_asc">Ultimo acquisto (vecchio)</option>
                </select>
              </div>
            </div>

            <div className="flex gap-1.5 pt-1">
              <button onClick={clearFilters}
                className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 transition">
                ✕ Pulisci {activeFilters > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[9px]">{activeFilters}</span>}
              </button>
              <button onClick={fetchAll}
                className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-800 transition">
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
              loading={detLoading}
              categorie={categorie}
              openKey={openKey}
              onClose={() => { setOpenKey(null); setDetailData(null); }}
              onRefresh={refreshDetail}
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
                    <th className="px-3 py-2 text-left">Fornitore</th>
                    <th className="px-3 py-2 text-left hidden sm:table-cell">P.IVA</th>
                    <th className="px-3 py-2 text-right">Fatture</th>
                    <th className="px-3 py-2 text-right">Totale €</th>
                    <th className="px-3 py-2 text-right hidden md:table-cell">Media/Fatt.</th>
                    <th className="px-3 py-2 text-center hidden md:table-cell">Primo</th>
                    <th className="px-3 py-2 text-center hidden md:table-cell">Ultimo</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f, idx) => {
                    const media = f.numero_fatture > 0 ? f.totale_fatture / f.numero_fatture : 0;
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
                        <td className="px-3 py-2.5 font-medium text-neutral-900">{f.fornitore_nome || "—"}</td>
                        <td className="px-3 py-2.5 text-neutral-500 text-[10px] hidden sm:table-cell font-mono">{f.fornitore_piva || "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{f.numero_fatture}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-teal-900">€ {fmt(f.totale_fatture)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-neutral-500 hidden md:table-cell">€ {fmt(media)}</td>
                        <td className="px-3 py-2.5 text-center text-[10px] text-neutral-500 hidden md:table-cell">{f.primo_acquisto || "—"}</td>
                        <td className="px-3 py-2.5 text-center text-[10px] text-neutral-500 hidden md:table-cell">{f.ultimo_acquisto || "—"}</td>
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
function FornitoreDetailView({ data, loading, categorie, openKey, onClose, onRefresh }) {
  const [tab, setTab] = useState("fatture"); // "fatture" | "prodotti"

  // ── Categoria generica fornitore ──
  const [catGenericaId, setCatGenericaId] = useState("");
  const [subGenericaId, setSubGenericaId] = useState("");
  const [savingGenerica, setSavingGenerica] = useState(false);

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
  }, [openKey]);

  if (loading) return <div className="text-center py-20 text-neutral-400">Caricamento dettaglio...</div>;
  if (!data) return <div className="text-center py-20 text-neutral-400">Errore caricamento</div>;

  const { fatture, prodotti, stats, anagrafica = {}, fornNome, fornPiva } = data;
  const anag = anagrafica || {};

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

  // ── Prodotti filtrati ──
  let filteredProd = [...prodotti];
  if (prodFilter === "assegnati") filteredProd = filteredProd.filter(p => p.categoria_id);
  if (prodFilter === "non_assegnati") filteredProd = filteredProd.filter(p => !p.categoria_id);
  if (prodSearch.trim()) {
    const q = prodSearch.toLowerCase();
    filteredProd = filteredProd.filter(p => p.descrizione?.toLowerCase().includes(q));
  }
  filteredProd = filteredProd.map(p => ({
    ...p,
    categoria_nome_sort: p.categoria_nome || "",
    sottocategoria_nome_sort: p.sottocategoria_nome || "",
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

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Nav bar */}
      <div className="flex items-center justify-between">
        <button onClick={onClose}
          className="text-xs text-teal-700 hover:text-teal-900 font-medium transition">
          ← Torna alla lista
        </button>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5">
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-4">
          <div className="flex-1">
            <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider mb-1">Fornitore</p>
            <h2 className="text-xl font-bold text-teal-900 font-playfair">{fornNome}</h2>
            {fornPiva && <p className="text-xs text-neutral-500 font-mono mt-0.5">P.IVA: {fornPiva}</p>}
            {anag.fornitore_cf && anag.fornitore_cf !== fornPiva && (
              <p className="text-xs text-neutral-500 font-mono mt-0.5">C.F.: {anag.fornitore_cf}</p>
            )}
          </div>
          {/* Anagrafica sede */}
          {(anag.fornitore_indirizzo || anag.fornitore_citta) && (
            <div className="md:text-right text-xs text-neutral-600 space-y-0.5">
              {anag.fornitore_indirizzo && <p>{anag.fornitore_indirizzo}</p>}
              <p>
                {[anag.fornitore_cap, anag.fornitore_citta, anag.fornitore_provincia ? `(${anag.fornitore_provincia})` : null]
                  .filter(Boolean).join(" ")}
              </p>
              {anag.fornitore_nazione && anag.fornitore_nazione !== "IT" && (
                <p className="text-neutral-400">{anag.fornitore_nazione}</p>
              )}
            </div>
          )}
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
          <div className="bg-teal-50 rounded-xl p-2.5 border border-teal-200 text-center">
            <p className="text-lg font-bold text-teal-900 tabular-nums">{totFatture}</p>
            <p className="text-[9px] text-neutral-500 uppercase">Fatture</p>
          </div>
          <div className="bg-green-50 rounded-xl p-2.5 border border-green-200 text-center">
            <p className="text-lg font-bold text-green-900 tabular-nums">€ {fmt(totSpesa)}</p>
            <p className="text-[9px] text-neutral-500 uppercase">Tot. spesa</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-200 text-center">
            <p className="text-lg font-bold text-blue-900 tabular-nums">€ {fmt(totImponibile)}</p>
            <p className="text-[9px] text-neutral-500 uppercase">Imponibile</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-2.5 border border-purple-200 text-center">
            <p className="text-lg font-bold text-purple-900 tabular-nums">{nProdotti}</p>
            <p className="text-[9px] text-neutral-500 uppercase">Prodotti</p>
          </div>
          <div className="bg-neutral-50 rounded-xl p-2.5 border border-neutral-200 text-center">
            <p className="text-sm font-bold text-neutral-900">{primoAcquisto || "—"}</p>
            <p className="text-[9px] text-neutral-500 uppercase">Primo acq.</p>
          </div>
          <div className="bg-neutral-50 rounded-xl p-2.5 border border-neutral-200 text-center">
            <p className="text-sm font-bold text-neutral-900">{ultimoAcquisto || "—"}</p>
            <p className="text-[9px] text-neutral-500 uppercase">Ultimo acq.</p>
          </div>
        </div>

        {/* Categoria generica fornitore */}
        <div className="border-t border-neutral-100 pt-3">
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-2">Categoria generica fornitore</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={catGenericaId} onChange={e => { setCatGenericaId(e.target.value); setSubGenericaId(""); }}
              className="px-2 py-1.5 border border-neutral-300 rounded-lg text-xs">
              <option value="">— Nessuna categoria —</option>
              {categorie.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select value={subGenericaId} onChange={e => setSubGenericaId(e.target.value)}
              disabled={!catGenericaId}
              className="px-2 py-1.5 border border-neutral-300 rounded-lg text-xs">
              <option value="">— Sotto-cat. —</option>
              {genSubcats.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            <button onClick={handleSaveGenerica} disabled={savingGenerica}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition disabled:opacity-50">
              {savingGenerica ? "Salvataggio..." : "Salva"}
            </button>
          </div>

          {/* Stats breakdown */}
          {stats.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-200">
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

      {/* ═══════ TAB FATTURE ═══════ */}
      {tab === "fatture" && (
        fatture.length === 0 ? (
          <p className="text-neutral-400 text-sm py-8 text-center">Nessuna fattura trovata.</p>
        ) : (
          <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="max-h-[50vh] overflow-y-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-neutral-50 text-neutral-600 sticky top-0 text-[10px] uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">N. Fattura</th>
                    <th className="px-3 py-2 text-right">Imponibile</th>
                    <th className="px-3 py-2 text-right">IVA</th>
                    <th className="px-3 py-2 text-right">Totale</th>
                    <th className="px-3 py-2 text-center">Righe</th>
                    <th className="px-3 py-2 text-center">Stato</th>
                    <th className="px-3 py-2 text-center">Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {fatture.map(f => (
                    <tr key={f.id} className="border-t border-neutral-100 hover:bg-teal-50/30 transition">
                      <td className="px-3 py-2 tabular-nums text-neutral-700">{f.data_fattura || "—"}</td>
                      <td className="px-3 py-2 text-neutral-600 font-mono text-[10px] max-w-[140px] truncate">{f.numero_fattura || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-700">€ {fmt(f.imponibile_totale)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-400 text-[10px]">€ {fmt(f.iva_totale)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-900">€ {fmt(f.totale_fattura)}</td>
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
              <option value="assegnati">Assegnati ({nAssegnati})</option>
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
    </div>
  );
}
