// @version: v1.0
// Pagina impostazioni modulo finanza — gestione albero categorie + link acquisti
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FinanzaNav from "./FinanzaNav";

const FC = `${API_BASE}/finanza`;

export default function FinanzaImpostazioni() {
  const navigate = useNavigate();
  const [albero, setAlbero] = useState({ A: [], F: [] });
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState("A"); // tab: A=analitico, F=finanziario

  const fetchAlbero = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${FC}/albero-categorie`);
      if (r.ok) setAlbero(await r.json());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchAlbero(); }, [fetchAlbero]);

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FinanzaNav current="impostazioni" />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-neutral-200">
          <h1 className="text-2xl font-bold text-violet-900 font-playfair mb-1">Impostazioni</h1>
          <p className="text-neutral-500 text-sm mb-6">
            Gestisci le categorie gerarchiche (Cat.1 → Cat.2) per la classificazione dei movimenti.
          </p>

          {/* Link a categorie acquisti */}
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-amber-900">Categorie Acquisti (Fornitori)</div>
              <div className="text-xs text-amber-700">Gestisci le categorie di primo livello del modulo Acquisti.</div>
            </div>
            <button onClick={() => navigate("/acquisti/categorie")}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 shadow transition">
              Vai alle Categorie Acquisti →
            </button>
          </div>

          {/* Tab vista */}
          <div className="flex gap-1 mb-5 border-b border-neutral-200">
            {[
              { key: "A", label: "Categorie Analitiche (competenza)" },
              { key: "F", label: "Categorie Finanziarie (cassa)" },
            ].map(t => (
              <button key={t.key} onClick={() => setVista(t.key)}
                className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl transition -mb-px ${
                  vista === t.key
                    ? "bg-violet-50 text-violet-900 border border-b-0 border-violet-200"
                    : "text-neutral-500 hover:text-neutral-800"
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-neutral-500 text-sm py-8 text-center">Caricamento...</p>
          ) : (
            <AlberoCategorie
              categorie={albero[vista] || []}
              allCategorie={albero[vista] || []}
              vista={vista}
              onRefresh={fetchAlbero}
            />
          )}
        </div>
      </div>
    </div>
  );
}


function AlberoCategorie({ categorie, allCategorie, vista, onRefresh }) {
  const [newCatName, setNewCatName] = useState("");
  const [newSubNames, setNewSubNames] = useState({});
  const [editCat, setEditCat] = useState(null);
  const [editSub, setEditSub] = useState(null);
  const [moving, setMoving] = useState(null); // { subId, subNome, fromCatId }

  const addCat = async () => {
    if (!newCatName.trim()) return;
    await apiFetch(`${API_BASE}/finanza/albero-categorie`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: newCatName.trim(), vista }),
    });
    setNewCatName("");
    onRefresh();
  };

  const addSub = async (catId) => {
    const nome = (newSubNames[catId] || "").trim();
    if (!nome) return;
    await apiFetch(`${API_BASE}/finanza/albero-categorie/${catId}/sotto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    setNewSubNames(p => ({ ...p, [catId]: "" }));
    onRefresh();
  };

  const renameCat = async () => {
    if (!editCat) return;
    await apiFetch(`${API_BASE}/finanza/albero-categorie/${editCat.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: editCat.nome }),
    });
    setEditCat(null);
    onRefresh();
  };

  const renameSub = async () => {
    if (!editSub) return;
    await apiFetch(`${API_BASE}/finanza/albero-categorie/sotto/${editSub.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: editSub.nome }),
    });
    setEditSub(null);
    onRefresh();
  };

  const deleteCat = async (id, nome) => {
    if (!window.confirm(`Eliminare "${nome}" e tutte le sue sottocategorie?`)) return;
    await apiFetch(`${API_BASE}/finanza/albero-categorie/${id}`, { method: "DELETE" });
    onRefresh();
  };

  const deleteSub = async (id, nome) => {
    if (!window.confirm(`Eliminare "${nome}"?`)) return;
    await apiFetch(`${API_BASE}/finanza/albero-categorie/sotto/${id}`, { method: "DELETE" });
    onRefresh();
  };

  const moveSub = async (subId, newCatId) => {
    await apiFetch(`${API_BASE}/finanza/albero-categorie/sotto/${subId}/sposta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_cat_id: newCatId }),
    });
    setMoving(null);
    onRefresh();
  };

  return (
    <div>
      <p className="text-sm text-neutral-600 mb-4">
        Gestisci le categorie e sotto-categorie. Rinominare o spostare propaga automaticamente a tutti i movimenti e regole.
      </p>

      <div className="space-y-4">
        {categorie.map(cat => (
          <div key={cat.id} className="border border-neutral-200 rounded-2xl p-4 bg-neutral-50">
            {/* HEADER CATEGORIA */}
            <div className="flex items-center gap-2 mb-3">
              {editCat?.id === cat.id ? (
                <>
                  <input value={editCat.nome}
                    onChange={e => setEditCat({ ...editCat, nome: e.target.value })}
                    onKeyDown={e => e.key === "Enter" && renameCat()}
                    className="px-2 py-1 border rounded-lg text-sm font-semibold flex-1" autoFocus />
                  <button onClick={renameCat}
                    className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-lg">Salva</button>
                  <button onClick={() => setEditCat(null)}
                    className="text-xs px-2 py-1 bg-neutral-200 rounded-lg">Annulla</button>
                </>
              ) : (
                <>
                  <span className="text-base font-bold text-violet-900">{cat.nome}</span>
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
              {cat.sottocategorie.map(sub => (
                <div key={sub.id} className="flex items-center gap-2">
                  <span className="text-neutral-400 text-xs">├─</span>
                  {editSub?.id === sub.id ? (
                    <>
                      <input value={editSub.nome}
                        onChange={e => setEditSub({ ...editSub, nome: e.target.value })}
                        onKeyDown={e => e.key === "Enter" && renameSub()}
                        className="px-2 py-0.5 border rounded text-xs flex-1" autoFocus />
                      <button onClick={renameSub}
                        className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-800 rounded">OK</button>
                      <button onClick={() => setEditSub(null)}
                        className="text-[10px] px-1.5 py-0.5 bg-neutral-200 rounded">✕</button>
                    </>
                  ) : moving?.subId === sub.id ? (
                    <>
                      <span className="text-sm font-medium text-violet-700">{sub.nome}</span>
                      <span className="text-[10px] text-neutral-500">→ sposta in:</span>
                      <select
                        className="text-xs border rounded px-1.5 py-0.5"
                        defaultValue=""
                        onChange={e => {
                          if (e.target.value) moveSub(sub.id, Number(e.target.value));
                        }}
                      >
                        <option value="">— scegli —</option>
                        {allCategorie.filter(c => c.id !== cat.id).map(c => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                      <button onClick={() => setMoving(null)}
                        className="text-[10px] px-1.5 py-0.5 bg-neutral-200 rounded">✕</button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm">{sub.nome}</span>
                      <button onClick={() => setEditSub({ id: sub.id, nome: sub.nome })}
                        className="text-[10px] px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 rounded">✏️</button>
                      <button onClick={() => setMoving({ subId: sub.id, subNome: sub.nome, fromCatId: cat.id })}
                        className="text-[10px] px-1.5 py-0.5 text-violet-600 hover:bg-violet-50 rounded"
                        title="Sposta in un'altra categoria">↗️</button>
                      <button onClick={() => deleteSub(sub.id, sub.nome)}
                        className="text-[10px] px-1.5 py-0.5 text-red-500 hover:bg-red-50 rounded">🗑️</button>
                    </>
                  )}
                </div>
              ))}

              {/* AGGIUNGI SOTTO */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-neutral-400 text-xs">└─</span>
                <input type="text" placeholder="Nuova sotto-categoria..."
                  value={newSubNames[cat.id] || ""}
                  onChange={e => setNewSubNames(p => ({ ...p, [cat.id]: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addSub(cat.id)}
                  className="px-2 py-1 border border-dashed border-neutral-300 rounded text-xs flex-1" />
                <button onClick={() => addSub(cat.id)}
                  className="text-xs px-2 py-1 bg-violet-100 text-violet-800 rounded-lg hover:bg-violet-200 transition">
                  + Aggiungi
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* AGGIUNGI CATEGORIA */}
      <div className="mt-6 flex items-center gap-3">
        <input type="text" placeholder="Nuova categoria..."
          value={newCatName}
          onChange={e => setNewCatName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addCat()}
          className="px-3 py-2 border border-neutral-300 rounded-xl text-sm w-64" />
        <button onClick={addCat}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition">
          + Nuova Categoria
        </button>
      </div>
    </div>
  );
}
