// @version: v3.0-full-detail
// Dettaglio fornitore: fatture, categoria generica, prodotti con categorizzazione
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const FE = `${API_BASE}/contabilita/fe`;
const CAT_BASE = `${API_BASE}/contabilita/fe/categorie`;

const fmt = (v) =>
  v != null
    ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";

// ── Sortable header helper ──
function SortTh({ label, field, sort, setSort, align }) {
  const active = sort.field === field;
  const arrow = active ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none hover:text-teal-800 transition ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() =>
        setSort((prev) => ({
          field,
          dir: prev.field === field && prev.dir === "asc" ? "desc" : "asc",
        }))
      }
    >
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
    if (typeof va === "number" && typeof vb === "number")
      return sort.dir === "asc" ? va - vb : vb - va;
    return sort.dir === "asc"
      ? String(va).localeCompare(String(vb), "it")
      : String(vb).localeCompare(String(va), "it");
  });
}

export default function FattureFornitoreDettaglio() {
  const { piva } = useParams();
  const navigate = useNavigate();

  // ── Tab attivo ──
  const [tab, setTab] = useState("fatture"); // "fatture" | "prodotti"

  // ── Dati ──
  const [fatture, setFatture] = useState([]);
  const [prodotti, setProdotti] = useState([]);
  const [categorie, setCategorie] = useState([]);
  const [statsFornitore, setStatsFornitore] = useState([]);
  const [fornitoreInfo, setFornitoreInfo] = useState(null); // categoria generica dal fe_fornitore_categoria
  const [loading, setLoading] = useState(true);

  // ── Categoria generica fornitore ──
  const [catGenericaId, setCatGenericaId] = useState("");
  const [subGenericaId, setSubGenericaId] = useState("");
  const [savingGenerica, setSavingGenerica] = useState(false);

  // ── Prodotti: filtri e bulk ──
  const [prodSearch, setProdSearch] = useState("");
  const [prodFilter, setProdFilter] = useState("tutti"); // "tutti" | "assegnati" | "non_assegnati"
  const [prodSort, setProdSort] = useState({ field: "totale_spesa", dir: "desc" });
  const [selected, setSelected] = useState(new Set());
  const [bulkCatId, setBulkCatId] = useState("");
  const [bulkSubId, setBulkSubId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [saving, setSaving] = useState(null);

  // ── Fetch dati ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resFatt, resProd, resCat, resStats] = await Promise.all([
        apiFetch(`${FE}/fatture?fornitore_piva=${encodeURIComponent(piva)}&limit=10000`),
        apiFetch(`${CAT_BASE}/fornitori/${encodeURIComponent(piva)}/prodotti`),
        apiFetch(CAT_BASE),
        apiFetch(`${CAT_BASE}/fornitori/${encodeURIComponent(piva)}/stats`),
      ]);
      if (resFatt.ok) {
        const data = await resFatt.json();
        setFatture(data.fatture || []);
      }
      if (resProd.ok) setProdotti(await resProd.json());
      if (resCat.ok) setCategorie(await resCat.json());
      if (resStats.ok) setStatsFornitore(await resStats.json());
    } catch (e) {
      console.error("[FornitoreDettaglio]", e);
    } finally {
      setLoading(false);
    }
  }, [piva]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Recupera info categoria generica fornitore ──
  useEffect(() => {
    (async () => {
      try {
        // Fetch all fornitore-categoria mappings and find ours
        const res = await apiFetch(`${CAT_BASE}/fornitori/${encodeURIComponent(piva)}/stats`);
        // We also need the fornitore_categoria mapping — use the fatture to get the name
      } catch (_) {}
    })();
  }, [piva]);

  // Derive fornitore nome from first available source
  const fornNome = useMemo(() => {
    if (fatture.length > 0) return fatture[0].fornitore_nome || piva;
    if (prodotti.length > 0) return prodotti[0].fornitore_nome || piva;
    return piva;
  }, [fatture, prodotti, piva]);

  // ── KPI ──
  const totFatture = fatture.length;
  const totSpesa = fatture.reduce((s, f) => s + (f.totale_fattura || 0), 0);
  const totImponibile = fatture.reduce((s, f) => s + (f.imponibile_totale || 0), 0);
  const primoAcquisto = fatture.length > 0
    ? fatture.reduce((min, f) => (!min || (f.data_fattura || "") < min) ? f.data_fattura : min, null)
    : null;
  const ultimoAcquisto = fatture.length > 0
    ? fatture.reduce((max, f) => (!max || (f.data_fattura || "") > max) ? f.data_fattura : max, null)
    : null;

  const nProdotti = prodotti.length;
  const nAssegnati = prodotti.filter(p => p.categoria_id).length;

  // ── Categoria generica: salva ──
  const handleSaveGenerica = async () => {
    setSavingGenerica(true);
    try {
      await apiFetch(`${CAT_BASE}/fornitori/assegna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornitore_piva: piva,
          fornitore_nome: fornNome,
          categoria_id: catGenericaId ? Number(catGenericaId) : null,
          sottocategoria_id: subGenericaId ? Number(subGenericaId) : null,
        }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSavingGenerica(false);
    }
  };

  // ── Prodotti: assign singolo ──
  const handleAssign = async (prod, catId, subId) => {
    setSaving(prod.descrizione);
    try {
      await apiFetch(`${CAT_BASE}/fornitori/prodotti/assegna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornitore_piva: piva,
          fornitore_nome: fornNome,
          descrizione: prod.descrizione,
          categoria_id: catId || null,
          sottocategoria_id: subId || null,
        }),
      });
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(null);
    }
  };

  // ── Prodotti: bulk assign ──
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
              fornitore_piva: piva,
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
      await fetchData();
    } catch (_) {} finally { setBulkSaving(false); }
  };

  // ── Prodotti filtrati + ordinati ──
  const filteredProd = useMemo(() => {
    let list = [...prodotti];
    if (prodFilter === "assegnati") list = list.filter(p => p.categoria_id);
    if (prodFilter === "non_assegnati") list = list.filter(p => !p.categoria_id);
    if (prodSearch.trim()) {
      const q = prodSearch.toLowerCase();
      list = list.filter(p => p.descrizione?.toLowerCase().includes(q));
    }
    list = list.map(p => ({
      ...p,
      categoria_nome_sort: p.categoria_nome || "",
      sottocategoria_nome_sort: p.sottocategoria_nome || "",
    }));
    return sortRows(list, prodSort);
  }, [prodotti, prodSearch, prodFilter, prodSort]);

  // ── Selezione prodotti ──
  const toggleSelect = (key) => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleAll = () => {
    if (selected.size === filteredProd.length) setSelected(new Set());
    else setSelected(new Set(filteredProd.map(p => p.descrizione)));
  };

  const bulkCat = categorie.find(c => c.id === Number(bulkCatId));
  const bulkSubcats = bulkCat?.sottocategorie || [];

  const genCat = categorie.find(c => c.id === Number(catGenericaId));
  const genSubcats = genCat?.sottocategorie || [];

  // Tab button style
  const tabCls = (t) =>
    `px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition ${
      tab === t
        ? "border-teal-600 text-teal-800 bg-white"
        : "border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
    }`;

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="fornitori" />

      <div className="max-w-7xl mx-auto p-4 sm:p-6">

        {/* ── BACK + HEADER ── */}
        <div className="mb-4">
          <button
            onClick={() => navigate("/acquisti/fornitori")}
            className="text-xs text-teal-700 hover:text-teal-900 font-medium transition mb-2 inline-block"
          >
            ← Torna ai fornitori
          </button>
          <h1 className="text-2xl font-bold text-teal-900 font-playfair">
            {loading ? "..." : fornNome}
          </h1>
          {!loading && fatture.length > 0 && fatture[0].fornitore_piva && (
            <p className="text-neutral-500 text-xs font-mono mt-0.5">
              P.IVA: {fatture[0].fornitore_piva}
            </p>
          )}
        </div>

        {/* ── KPI CARDS ── */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-5">
            <div className="bg-teal-50 rounded-xl p-3 border border-teal-200">
              <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Fatture</p>
              <p className="text-lg font-bold text-teal-900 tabular-nums">{totFatture}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 border border-green-200">
              <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Totale spesa</p>
              <p className="text-lg font-bold text-green-900 tabular-nums">€ {fmt(totSpesa)}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
              <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Imponibile</p>
              <p className="text-lg font-bold text-blue-900 tabular-nums">€ {fmt(totImponibile)}</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 border border-purple-200">
              <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Prodotti</p>
              <p className="text-lg font-bold text-purple-900 tabular-nums">{nProdotti}</p>
            </div>
            <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
              <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Primo acq.</p>
              <p className="text-sm font-bold text-neutral-900">{primoAcquisto || "—"}</p>
            </div>
            <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
              <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Ultimo acq.</p>
              <p className="text-sm font-bold text-neutral-900">{ultimoAcquisto || "—"}</p>
            </div>
          </div>
        )}

        {/* ── CATEGORIA GENERICA FORNITORE ── */}
        {!loading && (
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 mb-5">
            <h2 className="text-sm font-bold text-neutral-800 mb-2">Categoria generica fornitore</h2>
            <div className="flex flex-wrap items-center gap-3">
              <select value={catGenericaId} onChange={e => { setCatGenericaId(e.target.value); setSubGenericaId(""); }}
                className="px-2 py-1.5 border border-neutral-300 rounded-lg text-xs">
                <option value="">— Nessuna categoria —</option>
                {categorie.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <select value={subGenericaId} onChange={e => setSubGenericaId(e.target.value)}
                disabled={!catGenericaId}
                className="px-2 py-1.5 border border-neutral-300 rounded-lg text-xs">
                <option value="">— Sotto-categoria —</option>
                {genSubcats.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <button onClick={handleSaveGenerica} disabled={savingGenerica}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition disabled:opacity-50">
                {savingGenerica ? "Salvataggio..." : "Salva categoria"}
              </button>
            </div>

            {/* Breakdown categorie prodotti */}
            {statsFornitore.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {statsFornitore.map((s, i) => (
                  <span key={i} className={`text-xs px-2 py-1 rounded-full border ${
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
        )}

        {/* ── TABS ── */}
        <div className="flex gap-1 mb-0 border-b border-neutral-200">
          <button className={tabCls("fatture")} onClick={() => setTab("fatture")}>
            Fatture ({totFatture})
          </button>
          <button className={tabCls("prodotti")} onClick={() => setTab("prodotti")}>
            Prodotti ({nProdotti})
            {nProdotti > 0 && nAssegnati < nProdotti && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold">
                {nProdotti - nAssegnati} da assegnare
              </span>
            )}
          </button>
        </div>

        {/* ── TAB CONTENT ── */}
        <div className="bg-white rounded-b-2xl rounded-tr-2xl border border-t-0 border-neutral-200 shadow-sm">

          {/* ═══════ TAB FATTURE ═══════ */}
          {tab === "fatture" && (
            <div className="p-4">
              {loading ? (
                <p className="text-neutral-500 text-sm py-8 text-center">Caricamento fatture...</p>
              ) : fatture.length === 0 ? (
                <p className="text-neutral-500 text-sm py-8 text-center">Nessuna fattura trovata per questo fornitore.</p>
              ) : (
                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                  <div className="max-h-[55vh] overflow-y-auto">
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
                        {fatture.map((f) => (
                          <tr key={f.id} className="border-t border-neutral-100 hover:bg-teal-50/30 transition">
                            <td className="px-3 py-2 tabular-nums text-neutral-700">{f.data_fattura || "—"}</td>
                            <td className="px-3 py-2 text-neutral-600 font-mono text-[10px] max-w-[140px] truncate">{f.numero_fattura || "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-neutral-700">€ {fmt(f.imponibile_totale)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-neutral-400 text-[10px]">€ {fmt(f.iva_totale)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-900">€ {fmt(f.totale_fattura)}</td>
                            <td className="px-3 py-2 text-center">
                              {f.n_righe > 0
                                ? <span className="text-teal-700 font-medium">{f.n_righe}</span>
                                : <span className="text-neutral-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {f.pagato
                                ? <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-700">Pagata</span>
                                : <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-50 text-red-600">Da pagare</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                                f.fonte === "fic" ? "bg-teal-50 text-teal-700" : "bg-neutral-100 text-neutral-600"
                              }`}>
                                {(f.fonte || "xml").toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════ TAB PRODOTTI ═══════ */}
          {tab === "prodotti" && (
            <div className="p-4">
              {/* Filtri prodotti */}
              <div className="flex flex-wrap gap-3 mb-3 items-center">
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
                <div className="mb-3 rounded-xl border border-teal-300 bg-teal-50 px-4 py-2.5 flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold text-teal-900">{selected.size} selezionati</span>
                  <select value={bulkCatId} onChange={e => { setBulkCatId(e.target.value); setBulkSubId(""); }}
                    className="px-2 py-1 border border-teal-300 rounded-lg text-xs">
                    <option value="">— Categoria —</option>
                    {categorie.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <select value={bulkSubId} onChange={e => setBulkSubId(e.target.value)}
                    disabled={!bulkCatId}
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

              {loading ? (
                <p className="text-neutral-500 text-sm py-8 text-center">Caricamento prodotti...</p>
              ) : filteredProd.length === 0 ? (
                <p className="text-neutral-500 text-sm py-8 text-center">Nessun prodotto trovato.</p>
              ) : (
                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                  <div className="max-h-[55vh] overflow-y-auto">
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
      </div>
    </div>
  );
}
