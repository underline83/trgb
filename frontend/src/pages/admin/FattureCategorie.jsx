// @version: v1.0-categorie-fornitori
// Pagina gestione categorie fornitori — 2 tab: Impostazioni albero + Assegnazione fornitori
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const CAT_BASE = `${API_BASE}/contabilita/fe/categorie`;

export default function FattureCategorie() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("fornitori"); // "fornitori" | "impostazioni"

  // ── shared state ──
  const [categorie, setCategorie] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCategorie = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(CAT_BASE);
      if (!res.ok) throw new Error("Errore caricamento categorie");
      setCategorie(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategorie(); }, [fetchCategorie]);

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-amber-900 font-playfair mb-1">
              🏷️ Categorie Fornitori
            </h1>
            <p className="text-neutral-600 text-sm">
              Assegna una categoria a ogni fornitore e gestisci l'albero delle categorie.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <button onClick={() => navigate("/admin/fatture")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
              ← Menu Fatture
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="flex gap-1 mb-6 border-b border-neutral-200">
          {[
            { key: "fornitori", label: "Assegna Fornitori" },
            { key: "impostazioni", label: "Impostazioni Categorie" },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl transition ${
                tab === t.key
                  ? "bg-amber-50 text-amber-900 border border-b-0 border-amber-200"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        {loading ? (
          <p className="text-neutral-500 text-sm">Caricamento...</p>
        ) : tab === "fornitori" ? (
          <TabFornitori categorie={categorie} onRefresh={fetchCategorie} />
        ) : (
          <TabImpostazioni categorie={categorie} onRefresh={fetchCategorie} />
        )}
      </div>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB 1: ASSEGNAZIONE FORNITORI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabFornitori({ categorie, onRefresh }) {
  const [fornitori, setFornitori] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("tutti"); // tutti | assegnati | non_assegnati
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(null); // piva being saved

  const fetchFornitori = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${CAT_BASE}/fornitori`);
      if (!res.ok) throw new Error("Errore caricamento fornitori");
      setFornitori(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFornitori(); }, []);

  const handleAssign = async (forn, catId, subId) => {
    const key = forn.fornitore_piva || forn.fornitore_nome;
    setSaving(key);
    try {
      await apiFetch(`${CAT_BASE}/fornitori/assegna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornitore_piva: forn.fornitore_piva,
          fornitore_nome: forn.fornitore_nome,
          categoria_id: catId || null,
          sottocategoria_id: subId || null,
        }),
      });
      await fetchFornitori();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(null);
    }
  };

  // filtro
  let filtered = fornitori;
  if (filter === "assegnati") filtered = filtered.filter((f) => f.categoria_id);
  if (filter === "non_assegnati") filtered = filtered.filter((f) => !f.categoria_id);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter((f) => f.fornitore_nome?.toLowerCase().includes(q));
  }

  const nAssegnati = fornitori.filter((f) => f.categoria_id).length;
  const nTotali = fornitori.length;

  if (loading) return <p className="text-neutral-500 text-sm">Caricamento fornitori...</p>;

  return (
    <div>
      {/* BARRA FILTRI */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          type="text" placeholder="Cerca fornitore..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-neutral-300 rounded-xl text-sm w-64"
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 border border-neutral-300 rounded-xl text-sm">
          <option value="tutti">Tutti ({nTotali})</option>
          <option value="non_assegnati">Da assegnare ({nTotali - nAssegnati})</option>
          <option value="assegnati">Assegnati ({nAssegnati})</option>
        </select>
        <span className="text-xs text-neutral-500">
          {nAssegnati}/{nTotali} categorizzati ({nTotali > 0 ? Math.round(nAssegnati / nTotali * 100) : 0}%)
        </span>
      </div>

      {/* TABELLA */}
      <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Fornitore</th>
                <th className="px-3 py-2 text-right">Fatture</th>
                <th className="px-3 py-2 text-right">Totale €</th>
                <th className="px-3 py-2 text-left">Categoria</th>
                <th className="px-3 py-2 text-left">Sotto-categoria</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const key = f.fornitore_piva || f.fornitore_nome;
                const selCat = categorie.find((c) => c.id === f.categoria_id);
                const subcats = selCat?.sottocategorie || [];
                return (
                  <tr key={key} className={`border-t border-neutral-200 ${!f.categoria_id ? "bg-amber-50/40" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{f.fornitore_nome}</div>
                      {f.fornitore_piva && (
                        <div className="text-[10px] text-neutral-400 font-mono">{f.fornitore_piva}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{f.n_fatture}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {f.totale_spesa?.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={f.categoria_id || ""}
                        disabled={saving === key}
                        onChange={(e) => {
                          const newCatId = e.target.value ? Number(e.target.value) : null;
                          handleAssign(f, newCatId, null);
                        }}
                        className="px-2 py-1 border border-neutral-300 rounded-lg text-xs w-full"
                      >
                        <option value="">— seleziona —</option>
                        {categorie.map((c) => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={f.sottocategoria_id || ""}
                        disabled={saving === key || !f.categoria_id}
                        onChange={(e) => {
                          const newSubId = e.target.value ? Number(e.target.value) : null;
                          handleAssign(f, f.categoria_id, newSubId);
                        }}
                        className="px-2 py-1 border border-neutral-300 rounded-lg text-xs w-full"
                      >
                        <option value="">— nessuna —</option>
                        {subcats.map((s) => (
                          <option key={s.id} value={s.id}>{s.nome}</option>
                        ))}
                      </select>
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
// TAB 2: IMPOSTAZIONI CATEGORIE (albero)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabImpostazioni({ categorie, onRefresh }) {
  const [newCatName, setNewCatName] = useState("");
  const [newSubNames, setNewSubNames] = useState({}); // { catId: "name" }
  const [editCat, setEditCat] = useState(null); // { id, nome }
  const [editSub, setEditSub] = useState(null); // { id, nome }

  const addCategoria = async () => {
    if (!newCatName.trim()) return;
    await apiFetch(CAT_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: newCatName.trim() }),
    });
    setNewCatName("");
    onRefresh();
  };

  const addSottocategoria = async (catId) => {
    const nome = (newSubNames[catId] || "").trim();
    if (!nome) return;
    await apiFetch(`${CAT_BASE}/${catId}/sotto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    setNewSubNames((prev) => ({ ...prev, [catId]: "" }));
    onRefresh();
  };

  const deleteCat = async (catId, nome) => {
    if (!window.confirm(`Eliminare la categoria "${nome}" e tutte le sue sottocategorie?`)) return;
    await apiFetch(`${CAT_BASE}/${catId}`, { method: "DELETE" });
    onRefresh();
  };

  const deleteSub = async (subId, nome) => {
    if (!window.confirm(`Eliminare la sottocategoria "${nome}"?`)) return;
    await apiFetch(`${CAT_BASE}/sotto/${subId}`, { method: "DELETE" });
    onRefresh();
  };

  const saveCatRename = async () => {
    if (!editCat) return;
    await apiFetch(`${CAT_BASE}/${editCat.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: editCat.nome }),
    });
    setEditCat(null);
    onRefresh();
  };

  const saveSubRename = async () => {
    if (!editSub) return;
    await apiFetch(`${CAT_BASE}/sotto/${editSub.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: editSub.nome }),
    });
    setEditSub(null);
    onRefresh();
  };

  return (
    <div>
      <p className="text-sm text-neutral-600 mb-4">
        Gestisci le categorie e sotto-categorie. Le modifiche si applicano immediatamente.
      </p>

      {/* ALBERO CATEGORIE */}
      <div className="space-y-4">
        {categorie.map((cat) => (
          <div key={cat.id} className="border border-neutral-200 rounded-2xl p-4 bg-neutral-50">
            {/* HEADER CATEGORIA */}
            <div className="flex items-center gap-2 mb-3">
              {editCat?.id === cat.id ? (
                <>
                  <input value={editCat.nome}
                    onChange={(e) => setEditCat({ ...editCat, nome: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && saveCatRename()}
                    className="px-2 py-1 border rounded-lg text-sm font-semibold flex-1"
                    autoFocus />
                  <button onClick={saveCatRename}
                    className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-lg">Salva</button>
                  <button onClick={() => setEditCat(null)}
                    className="text-xs px-2 py-1 bg-neutral-200 rounded-lg">Annulla</button>
                </>
              ) : (
                <>
                  <span className="text-base font-bold text-amber-900">{cat.nome}</span>
                  <span className="text-[10px] text-neutral-400">({cat.sottocategorie.length} sub)</span>
                  <button onClick={() => setEditCat({ id: cat.id, nome: cat.nome })}
                    className="text-xs px-2 py-0.5 text-blue-700 hover:bg-blue-50 rounded-lg">✏️</button>
                  <button onClick={() => deleteCat(cat.id, cat.nome)}
                    className="text-xs px-2 py-0.5 text-red-600 hover:bg-red-50 rounded-lg">🗑️</button>
                </>
              )}
            </div>

            {/* SOTTOCATEGORIE */}
            <div className="ml-4 space-y-1">
              {cat.sottocategorie.map((sub) => (
                <div key={sub.id} className="flex items-center gap-2">
                  <span className="text-neutral-400 text-xs">├─</span>
                  {editSub?.id === sub.id ? (
                    <>
                      <input value={editSub.nome}
                        onChange={(e) => setEditSub({ ...editSub, nome: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && saveSubRename()}
                        className="px-2 py-0.5 border rounded text-xs flex-1" autoFocus />
                      <button onClick={saveSubRename}
                        className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-800 rounded">OK</button>
                      <button onClick={() => setEditSub(null)}
                        className="text-[10px] px-1.5 py-0.5 bg-neutral-200 rounded">✕</button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm">{sub.nome}</span>
                      <button onClick={() => setEditSub({ id: sub.id, nome: sub.nome })}
                        className="text-[10px] px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 rounded">✏️</button>
                      <button onClick={() => deleteSub(sub.id, sub.nome)}
                        className="text-[10px] px-1.5 py-0.5 text-red-500 hover:bg-red-50 rounded">🗑️</button>
                    </>
                  )}
                </div>
              ))}

              {/* AGGIUNGI SOTTOCATEGORIA */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-neutral-400 text-xs">└─</span>
                <input
                  type="text" placeholder="Nuova sotto-categoria..."
                  value={newSubNames[cat.id] || ""}
                  onChange={(e) => setNewSubNames((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addSottocategoria(cat.id)}
                  className="px-2 py-1 border border-dashed border-neutral-300 rounded text-xs flex-1"
                />
                <button onClick={() => addSottocategoria(cat.id)}
                  className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition">
                  + Aggiungi
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* AGGIUNGI CATEGORIA */}
      <div className="mt-6 flex items-center gap-3">
        <input
          type="text" placeholder="Nuova categoria..."
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCategoria()}
          className="px-3 py-2 border border-neutral-300 rounded-xl text-sm w-64"
        />
        <button onClick={addCategoria}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 transition">
          + Nuova Categoria
        </button>
      </div>
    </div>
  );
}
