// @version: v2.0-bulk-sort-move
// Pagina gestione categorie fornitori — bulk edit, ordinamento, spostamento sottocategorie
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const CAT_BASE = `${API_BASE}/contabilita/fe/categorie`;

export default function FattureCategorie() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("fornitori");
  const [categorie, setCategorie] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCategorie = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(CAT_BASE);
      if (!res.ok) throw new Error("Errore caricamento categorie");
      setCategorie(await res.json());
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCategorie(); }, [fetchCategorie]);

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="categorie" />
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-neutral-200">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-amber-900 font-playfair mb-1">Categorie Fornitori</h1>
          <p className="text-neutral-500 text-sm">Assegna una categoria a ogni fornitore e gestisci l'albero delle categorie.</p>
        </div>
        <div className="flex gap-1 mb-6 border-b border-neutral-200">
          {[{ key: "fornitori", label: "Assegna Fornitori" }, { key: "impostazioni", label: "Impostazioni Categorie" }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl transition ${tab === t.key ? "bg-amber-50 text-amber-900 border border-b-0 border-amber-200" : "text-neutral-500 hover:text-neutral-800"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {loading ? <p className="text-neutral-500 text-sm">Caricamento...</p>
          : tab === "fornitori" ? <TabFornitori categorie={categorie} onRefresh={fetchCategorie} />
          : <TabImpostazioni categorie={categorie} onRefresh={fetchCategorie} />}
      </div>
      </div>
    </div>
  );
}


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


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB 1: ASSEGNAZIONE FORNITORI (con bulk edit + sort)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabFornitori({ categorie, onRefresh }) {
  const nav = useNavigate();
  const [fornitori, setFornitori] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("tutti");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(null);
  const [showEsclusi, setShowEsclusi] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkCatId, setBulkCatId] = useState("");
  const [bulkSubId, setBulkSubId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [sort, setSort] = useState({ field: "totale_spesa", dir: "desc" });

  const fetchFornitori = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${CAT_BASE}/fornitori`);
      if (!res.ok) throw new Error("Errore");
      setFornitori(await res.json());
    } catch (_) {} finally { setLoading(false); }
  };
  useEffect(() => { fetchFornitori(); }, []);

  const handleAssign = async (forn, catId, subId) => {
    const key = forn.fornitore_piva || forn.fornitore_nome;
    setSaving(key);
    try {
      await apiFetch(`${CAT_BASE}/fornitori/assegna`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fornitore_piva: forn.fornitore_piva, fornitore_nome: forn.fornitore_nome, categoria_id: catId || null, sottocategoria_id: subId || null }),
      });
      await fetchFornitori();
    } catch (_) {} finally { setSaving(null); }
  };

  const handleEscludi = async (forn, escluso, motivo) => {
    const key = forn.fornitore_piva || forn.fornitore_nome;
    setSaving(key);
    try {
      await apiFetch(`${CAT_BASE}/fornitori/escludi`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fornitore_piva: forn.fornitore_piva, fornitore_nome: forn.fornitore_nome, escluso, motivo_esclusione: motivo }),
      });
      await fetchFornitori();
    } catch (_) {} finally { setSaving(null); }
  };

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
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fornitore_piva: forn.fornitore_piva, fornitore_nome: forn.fornitore_nome, categoria_id: catId, sottocategoria_id: subId }),
          });
        }
      }
      setSelected(new Set());
      setBulkCatId(""); setBulkSubId("");
      await fetchFornitori();
    } catch (_) {} finally { setBulkSaving(false); }
  };

  const nEsclusi = fornitori.filter(f => f.escluso).length;
  const nAutofatture = fornitori.filter(f => f.is_autofattura && !f.escluso).length;
  const attivi = fornitori.filter(f => !f.escluso && !f.is_autofattura);
  const nAssegnati = attivi.filter(f => f.categoria_id).length;
  const nTotali = attivi.length;

  let filtered = showEsclusi ? fornitori.filter(f => f.escluso || f.is_autofattura) : attivi;
  if (!showEsclusi) {
    if (filter === "assegnati") filtered = filtered.filter(f => f.categoria_id);
    if (filter === "non_assegnati") filtered = filtered.filter(f => !f.categoria_id);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(f => f.fornitore_nome?.toLowerCase().includes(q) || f.fornitore_piva?.includes(q));
  }

  // Add computed fields for sort
  filtered = filtered.map(f => ({
    ...f,
    categoria_nome_sort: f.categoria_nome || "",
    sottocategoria_nome_sort: f.sottocategoria_nome || "",
  }));
  filtered = sortRows(filtered, sort);

  const toggleSelect = (key) => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(f => f.fornitore_piva || f.fornitore_nome)));
  };

  const bulkCat = categorie.find(c => c.id === Number(bulkCatId));
  const bulkSubcats = bulkCat?.sottocategorie || [];

  if (loading) return <p className="text-neutral-500 text-sm">Caricamento fornitori...</p>;

  return (
    <div>
      {/* FILTRI */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input type="text" placeholder="Cerca fornitore o P.IVA..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-neutral-300 rounded-xl text-sm w-64" />
        {!showEsclusi && (
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-xl text-sm">
            <option value="tutti">Tutti ({nTotali})</option>
            <option value="non_assegnati">Da assegnare ({nTotali - nAssegnati})</option>
            <option value="assegnati">Assegnati ({nAssegnati})</option>
          </select>
        )}
        <button onClick={() => { setShowEsclusi(!showEsclusi); setSelected(new Set()); }}
          className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${showEsclusi ? "bg-red-50 text-red-800 border-red-200" : "bg-neutral-50 text-neutral-600 border-neutral-300 hover:bg-neutral-100"}`}>
          {showEsclusi ? `Esclusi (${nEsclusi + nAutofatture}) — torna` : `Esclusi / Autofatture (${nEsclusi + nAutofatture})`}
        </button>
        {!showEsclusi && <span className="text-xs text-neutral-500">{nAssegnati}/{nTotali} categorizzati ({nTotali > 0 ? Math.round(nAssegnati / nTotali * 100) : 0}%)</span>}
      </div>

      {/* BULK EDIT BAR */}
      {!showEsclusi && selected.size > 0 && (
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

      {showEsclusi && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Questi fornitori sono esclusi dalle analisi. Le <strong>autofatture</strong> (TD16-TD19, reverse charge)
          vengono escluse automaticamente. I fornitori marcati manualmente possono essere ripristinati.
        </div>
      )}

      {/* TABELLA */}
      <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600 sticky top-0 text-xs uppercase tracking-wide">
              <tr>
                {!showEsclusi && (
                  <th className="px-2 py-2 w-8 text-center">
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll} className="accent-amber-600" />
                  </th>
                )}
                <SortTh label="Fornitore" field="fornitore_nome" sort={sort} setSort={setSort} />
                <SortTh label="Fatture" field="n_fatture" sort={sort} setSort={setSort} align="right" />
                <SortTh label="Totale €" field="totale_spesa" sort={sort} setSort={setSort} align="right" />
                {showEsclusi ? (
                  <><th className="px-3 py-2 text-left">Motivo</th><th className="px-3 py-2 text-center">Azioni</th></>
                ) : (
                  <>
                    <SortTh label="Categoria" field="categoria_nome_sort" sort={sort} setSort={setSort} />
                    <SortTh label="Sotto-cat." field="sottocategoria_nome_sort" sort={sort} setSort={setSort} />
                    <th className="px-3 py-2 text-center">Azioni</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => {
                const key = f.fornitore_piva || f.fornitore_nome;
                const selCat = categorie.find(c => c.id === f.categoria_id);
                const subcats = selCat?.sottocategorie || [];
                const isSaving = saving === key;

                if (showEsclusi) {
                  const isAuto = f.is_autofattura;
                  return (
                    <tr key={key} className={`border-t border-neutral-200 ${isAuto ? "bg-orange-50/30" : "bg-red-50/30"}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-neutral-500 line-through">{f.fornitore_nome}</div>
                        {f.fornitore_piva && <div className="text-[10px] text-neutral-400 font-mono">{f.fornitore_piva}</div>}
                      </td>
                      <td className="px-3 py-2 text-right text-neutral-400">{f.n_fatture}</td>
                      <td className="px-3 py-2 text-right text-neutral-400">{f.totale_spesa?.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${isAuto ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                          {isAuto ? "autofattura" : (f.motivo_esclusione || "escluso")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!isAuto && (
                          <button disabled={isSaving} onClick={() => handleEscludi(f, false, null)}
                            className="px-2 py-1 rounded-lg text-[10px] font-medium bg-green-50 text-green-800 border border-green-200 hover:bg-green-100 transition disabled:opacity-50">
                            Ripristina
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={key} className={`border-t border-neutral-200 ${!f.categoria_id ? "bg-amber-50/40" : ""} ${selected.has(key) ? "bg-amber-100/60" : ""}`}>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelect(key)} className="accent-amber-600" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{f.fornitore_nome}</div>
                      {f.fornitore_piva && <div className="text-[10px] text-neutral-400 font-mono">{f.fornitore_piva}</div>}
                    </td>
                    <td className="px-3 py-2 text-right">{f.n_fatture}</td>
                    <td className="px-3 py-2 text-right font-medium">{f.totale_spesa?.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2">
                      <select value={f.categoria_id || ""} disabled={isSaving}
                        onChange={e => handleAssign(f, e.target.value ? Number(e.target.value) : null, null)}
                        className="px-2 py-1 border border-neutral-300 rounded-lg text-xs w-full">
                        <option value="">— seleziona —</option>
                        {categorie.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select value={f.sottocategoria_id || ""} disabled={isSaving || !f.categoria_id}
                        onChange={e => handleAssign(f, f.categoria_id, e.target.value ? Number(e.target.value) : null)}
                        className="px-2 py-1 border border-neutral-300 rounded-lg text-xs w-full">
                        <option value="">— nessuna —</option>
                        {subcats.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        {f.fornitore_piva && (
                          <button onClick={() => nav(`/acquisti/fornitore/${encodeURIComponent(f.fornitore_piva)}`)}
                            className="px-2 py-1 rounded-lg text-[10px] font-medium bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100 transition">
                            Prodotti
                          </button>
                        )}
                        <button disabled={isSaving}
                          onClick={() => { const m = window.prompt("Motivo esclusione:\n• auto-fattura\n• duplicato\n• test\n• altro", "auto-fattura"); if (m !== null) handleEscludi(f, true, m); }}
                          className="px-2 py-1 rounded-lg text-[10px] font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition disabled:opacity-50">
                          Escludi
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB 2: IMPOSTAZIONI CATEGORIE (albero + spostamento)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabImpostazioni({ categorie, onRefresh }) {
  const [newCatName, setNewCatName] = useState("");
  const [newSubNames, setNewSubNames] = useState({});
  const [editCat, setEditCat] = useState(null);
  const [editSub, setEditSub] = useState(null);
  const [moving, setMoving] = useState(null);

  const addCategoria = async () => {
    if (!newCatName.trim()) return;
    await apiFetch(CAT_BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: newCatName.trim() }) });
    setNewCatName(""); onRefresh();
  };
  const addSottocategoria = async (catId) => {
    const nome = (newSubNames[catId] || "").trim();
    if (!nome) return;
    await apiFetch(`${CAT_BASE}/${catId}/sotto`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome }) });
    setNewSubNames(p => ({ ...p, [catId]: "" })); onRefresh();
  };
  const deleteCat = async (catId, nome) => {
    if (!window.confirm(`Eliminare "${nome}" e tutte le sue sottocategorie?`)) return;
    await apiFetch(`${CAT_BASE}/${catId}`, { method: "DELETE" }); onRefresh();
  };
  const deleteSub = async (subId, nome) => {
    if (!window.confirm(`Eliminare "${nome}"?`)) return;
    await apiFetch(`${CAT_BASE}/sotto/${subId}`, { method: "DELETE" }); onRefresh();
  };
  const moveSub = async (subId, newCatId) => {
    await apiFetch(`${CAT_BASE}/sotto/${subId}/sposta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_categoria_id: newCatId }) });
    setMoving(null); onRefresh();
  };
  const saveCatRename = async () => {
    if (!editCat) return;
    await apiFetch(`${CAT_BASE}/${editCat.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: editCat.nome }) });
    setEditCat(null); onRefresh();
  };
  const saveSubRename = async () => {
    if (!editSub) return;
    await apiFetch(`${CAT_BASE}/sotto/${editSub.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: editSub.nome }) });
    setEditSub(null); onRefresh();
  };

  return (
    <div>
      <p className="text-sm text-neutral-600 mb-4">Gestisci le categorie e sotto-categorie. Le modifiche si applicano immediatamente.</p>
      <div className="space-y-4">
        {categorie.map(cat => (
          <div key={cat.id} className="border border-neutral-200 rounded-2xl p-4 bg-neutral-50">
            <div className="flex items-center gap-2 mb-3">
              {editCat?.id === cat.id ? (
                <>
                  <input value={editCat.nome} onChange={e => setEditCat({ ...editCat, nome: e.target.value })}
                    onKeyDown={e => e.key === "Enter" && saveCatRename()}
                    className="px-2 py-1 border rounded-lg text-sm font-semibold flex-1" autoFocus />
                  <button onClick={saveCatRename} className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-lg">Salva</button>
                  <button onClick={() => setEditCat(null)} className="text-xs px-2 py-1 bg-neutral-200 rounded-lg">Annulla</button>
                </>
              ) : (
                <>
                  <span className="text-base font-bold text-amber-900">{cat.nome}</span>
                  <span className="text-[10px] text-neutral-400">({cat.sottocategorie.length} sub)</span>
                  <button onClick={() => setEditCat({ id: cat.id, nome: cat.nome })} className="text-xs px-2 py-0.5 text-blue-700 hover:bg-blue-50 rounded-lg">✏️</button>
                  <button onClick={() => deleteCat(cat.id, cat.nome)} className="text-xs px-2 py-0.5 text-red-600 hover:bg-red-50 rounded-lg">🗑️</button>
                </>
              )}
            </div>
            <div className="ml-4 space-y-1">
              {cat.sottocategorie.map(sub => (
                <div key={sub.id} className="flex items-center gap-2">
                  <span className="text-neutral-400 text-xs">├─</span>
                  {editSub?.id === sub.id ? (
                    <>
                      <input value={editSub.nome} onChange={e => setEditSub({ ...editSub, nome: e.target.value })}
                        onKeyDown={e => e.key === "Enter" && saveSubRename()}
                        className="px-2 py-0.5 border rounded text-xs flex-1" autoFocus />
                      <button onClick={saveSubRename} className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-800 rounded">OK</button>
                      <button onClick={() => setEditSub(null)} className="text-[10px] px-1.5 py-0.5 bg-neutral-200 rounded">✕</button>
                    </>
                  ) : moving?.subId === sub.id ? (
                    <>
                      <span className="text-sm font-medium text-amber-700">{sub.nome}</span>
                      <span className="text-[10px] text-neutral-500">→ sposta in:</span>
                      <select className="text-xs border rounded px-1.5 py-0.5" defaultValue=""
                        onChange={e => { if (e.target.value) moveSub(sub.id, Number(e.target.value)); }}>
                        <option value="">— scegli —</option>
                        {categorie.filter(c => c.id !== cat.id).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                      <button onClick={() => setMoving(null)} className="text-[10px] px-1.5 py-0.5 bg-neutral-200 rounded">✕</button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm">{sub.nome}</span>
                      <button onClick={() => setEditSub({ id: sub.id, nome: sub.nome })} className="text-[10px] px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 rounded">✏️</button>
                      <button onClick={() => setMoving({ subId: sub.id, subNome: sub.nome, fromCatId: cat.id })}
                        className="text-[10px] px-1.5 py-0.5 text-amber-600 hover:bg-amber-50 rounded" title="Sposta in un'altra categoria">↗️</button>
                      <button onClick={() => deleteSub(sub.id, sub.nome)} className="text-[10px] px-1.5 py-0.5 text-red-500 hover:bg-red-50 rounded">🗑️</button>
                    </>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-neutral-400 text-xs">└─</span>
                <input type="text" placeholder="Nuova sotto-categoria..."
                  value={newSubNames[cat.id] || ""}
                  onChange={e => setNewSubNames(p => ({ ...p, [cat.id]: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addSottocategoria(cat.id)}
                  className="px-2 py-1 border border-dashed border-neutral-300 rounded text-xs flex-1" />
                <button onClick={() => addSottocategoria(cat.id)}
                  className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition">+ Aggiungi</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-3">
        <input type="text" placeholder="Nuova categoria..." value={newCatName}
          onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === "Enter" && addCategoria()}
          className="px-3 py-2 border border-neutral-300 rounded-xl text-sm w-64" />
        <button onClick={addCategoria}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 transition">+ Nuova Categoria</button>
      </div>
    </div>
  );
}
