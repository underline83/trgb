// @version: v2.0-bulk-sort
// Pagina dettaglio fornitore: lista prodotti con bulk edit, ordinamento colonne
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const CAT_BASE = `${API_BASE}/contabilita/fe/categorie`;

// ── HELPER: Sortable header ─────────────────────────────────────
function SortTh({ label, field, sort, setSort, align }) {
  const active = sort.field === field;
  const arrow = active ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th className={`px-3 py-2 cursor-pointer select-none hover:text-amber-800 transition ${align === "right" ? "text-right" : "text-left"}`}
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


export default function FattureFornitoreDettaglio() {
  const { piva } = useParams();
  const navigate = useNavigate();

  const [prodotti, setProdotti] = useState([]);
  const [categorie, setCategorie] = useState([]);
  const [statsFornitore, setStatsFornitore] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [filter, setFilter] = useState("tutti");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ field: "totale_spesa", dir: "desc" });
  const [selected, setSelected] = useState(new Set());
  const [bulkCatId, setBulkCatId] = useState("");
  const [bulkSubId, setBulkSubId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resProd, resCat, resStats] = await Promise.all([
        apiFetch(`${CAT_BASE}/fornitori/${encodeURIComponent(piva)}/prodotti`),
        apiFetch(CAT_BASE),
        apiFetch(`${CAT_BASE}/fornitori/${encodeURIComponent(piva)}/stats`),
      ]);
      if (resProd.ok) setProdotti(await resProd.json());
      if (resCat.ok) setCategorie(await resCat.json());
      if (resStats.ok) setStatsFornitore(await resStats.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [piva]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fornNome = prodotti.length > 0 ? (prodotti[0].fornitore_nome || piva) : piva;

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

  // Filtro
  let filtered = prodotti;
  if (filter === "assegnati") filtered = filtered.filter(p => p.categoria_id);
  if (filter === "non_assegnati") filtered = filtered.filter(p => !p.categoria_id);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(p => p.descrizione?.toLowerCase().includes(q));
  }

  // Add computed fields for sort
  filtered = filtered.map(p => ({
    ...p,
    categoria_nome_sort: p.categoria_nome || "",
    sottocategoria_nome_sort: p.sottocategoria_nome || "",
  }));
  filtered = sortRows(filtered, sort);

  const nAssegnati = prodotti.filter(p => p.categoria_id).length;
  const nTotali = prodotti.length;
  const totaleSpesa = prodotti.reduce((s, p) => s + (p.totale_spesa || 0), 0);

  const toggleSelect = (key) => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.descrizione)));
  };

  const bulkCat = categorie.find(c => c.id === Number(bulkCatId));
  const bulkSubcats = bulkCat?.sottocategorie || [];

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="categorie" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
      <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-amber-900 font-playfair mb-1">
              Prodotti — {loading ? "..." : fornNome}
            </h1>
            <p className="text-neutral-500 text-sm">
              Categorizza i singoli prodotti acquistati da questo fornitore.
            </p>
          </div>
        </div>

        {/* STATS RIEPILOGO */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 text-center">
              <div className="text-2xl font-bold text-amber-900">{nTotali}</div>
              <div className="text-xs text-neutral-600">Prodotti unici</div>
            </div>
            <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
              <div className="text-2xl font-bold text-green-800">{nAssegnati}</div>
              <div className="text-xs text-neutral-600">Categorizzati</div>
            </div>
            <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center">
              <div className="text-2xl font-bold text-red-700">{nTotali - nAssegnati}</div>
              <div className="text-xs text-neutral-600">Da assegnare</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-center">
              <div className="text-2xl font-bold text-blue-900">
                {totaleSpesa.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-neutral-600">Totale spesa €</div>
            </div>
          </div>
        )}

        {/* BREAKDOWN PER CATEGORIA (mini) */}
        {statsFornitore.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {statsFornitore.map((s, i) => (
              <span key={i} className={`text-xs px-2 py-1 rounded-full border ${
                s.categoria === "(Non categorizzato)"
                  ? "bg-neutral-100 border-neutral-300 text-neutral-600"
                  : "bg-amber-50 border-amber-200 text-amber-800"
              }`}>
                {s.categoria}{s.sottocategoria ? ` > ${s.sottocategoria}` : ""}
                <span className="ml-1 font-semibold">
                  {s.totale_spesa?.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€
                </span>
              </span>
            ))}
          </div>
        )}

        {/* FILTRI */}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <input type="text" placeholder="Cerca prodotto..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-xl text-sm w-64" />
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-xl text-sm">
            <option value="tutti">Tutti ({nTotali})</option>
            <option value="non_assegnati">Da assegnare ({nTotali - nAssegnati})</option>
            <option value="assegnati">Assegnati ({nAssegnati})</option>
          </select>
          <span className="text-xs text-neutral-500">
            {nAssegnati}/{nTotali} categorizzati ({nTotali > 0 ? Math.round(nAssegnati / nTotali * 100) : 0}%)
          </span>
        </div>

        {/* BULK EDIT BAR */}
        {selected.size > 0 && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-amber-900">{selected.size} selezionati</span>
            <select value={bulkCatId} onChange={e => { setBulkCatId(e.target.value); setBulkSubId(""); }}
              className="px-2 py-1 border border-amber-300 rounded-lg text-xs">
              <option value="">— Categoria —</option>
              {categorie.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select value={bulkSubId} onChange={e => setBulkSubId(e.target.value)}
              disabled={!bulkCatId}
              className="px-2 py-1 border border-amber-300 rounded-lg text-xs">
              <option value="">— Sotto-cat. —</option>
              {bulkSubcats.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            <button onClick={handleBulkAssign} disabled={!bulkCatId || bulkSaving}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-50">
              {bulkSaving ? "Salvataggio..." : "Assegna a tutti"}
            </button>
            <button onClick={() => setSelected(new Set())}
              className="px-2 py-1 rounded-lg text-xs text-neutral-500 hover:bg-neutral-100 transition">Deseleziona</button>
          </div>
        )}

        {loading ? (
          <p className="text-neutral-500 text-sm">Caricamento prodotti...</p>
        ) : filtered.length === 0 ? (
          <p className="text-neutral-500 text-sm">Nessun prodotto trovato.</p>
        ) : (
          <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-600 sticky top-0 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-2 py-2 w-8 text-center">
                      <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                        onChange={toggleAll} className="accent-amber-600" />
                    </th>
                    <SortTh label="Descrizione" field="descrizione" sort={sort} setSort={setSort} />
                    <SortTh label="Righe" field="n_righe" sort={sort} setSort={setSort} align="right" />
                    <SortTh label="Q.tà tot" field="quantita_totale" sort={sort} setSort={setSort} align="right" />
                    <SortTh label="€ medio" field="prezzo_medio" sort={sort} setSort={setSort} align="right" />
                    <SortTh label="€ totale" field="totale_spesa" sort={sort} setSort={setSort} align="right" />
                    <SortTh label="Categoria" field="categoria_nome_sort" sort={sort} setSort={setSort} />
                    <SortTh label="Sotto-cat." field="sottocategoria_nome_sort" sort={sort} setSort={setSort} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, idx) => {
                    const selCat = categorie.find(c => c.id === p.categoria_id);
                    const subcats = selCat?.sottocategorie || [];
                    const isSaving = saving === p.descrizione;
                    const isSelected = selected.has(p.descrizione);
                    return (
                      <tr key={idx}
                        className={`border-t border-neutral-200 ${!p.categoria_id ? "bg-amber-50/30" : ""} ${isSelected ? "bg-amber-100/60" : ""}`}>
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.descrizione)} className="accent-amber-600" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-xs leading-tight" title={p.descrizione}>
                            {p.descrizione?.length > 80
                              ? p.descrizione.substring(0, 80) + "..."
                              : p.descrizione}
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
                        <td className="px-3 py-2 text-right font-medium">
                          {p.totale_spesa?.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2">
                          <select value={p.categoria_id || ""} disabled={isSaving}
                            onChange={e => handleAssign(p, e.target.value ? Number(e.target.value) : null, null)}
                            className="px-1 py-0.5 border border-neutral-300 rounded text-xs w-full">
                            <option value="">—</option>
                            {categorie.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select value={p.sottocategoria_id || ""} disabled={isSaving || !p.categoria_id}
                            onChange={e => handleAssign(p, p.categoria_id, e.target.value ? Number(e.target.value) : null)}
                            className="px-1 py-0.5 border border-neutral-300 rounded text-xs w-full">
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
      </div>
    </div>
  );
}
