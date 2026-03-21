// @version: v2.1-violet-flat-header
// Pagina impostazioni modulo finanza — gestione albero categorie + link acquisti + lista movimenti
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
        <h1 className="text-2xl sm:text-3xl font-bold text-violet-900 font-playfair tracking-wide mt-4 mb-1">Impostazioni</h1>
        <p className="text-neutral-600 text-sm mb-8">
          Gestisci le categorie gerarchiche (Cat.1 → Cat.2) per la classificazione dei movimenti.
        </p>
        {/* Link a categorie acquisti */}
        <div className="mb-8 rounded-2xl border-2 border-violet-200 bg-violet-50 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm hover:shadow-md transition">
          <div>
            <div className="text-sm font-bold text-violet-950">Categorie Acquisti (Fornitori)</div>
            <div className="text-xs text-violet-800 mt-1">Gestisci le categorie di primo livello del modulo Acquisti.</div>
          </div>
          <button onClick={() => navigate("/acquisti/categorie")}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-700 text-white hover:bg-violet-800 shadow-md hover:shadow-lg transition whitespace-nowrap">
            Vai alle Categorie Acquisti →
          </button>
        </div>

        {/* Tab vista - More polished */}
        <div className="mb-8">
          <div className="inline-flex gap-2 p-1.5 bg-white rounded-2xl border border-neutral-200 shadow-sm">
            {[
              { key: "A", label: "Analitiche (competenza)" },
              { key: "F", label: "Finanziarie (cassa)" },
            ].map(t => (
              <button key={t.key} onClick={() => setVista(t.key)}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
                  vista === t.key
                    ? "bg-violet-100 text-violet-900 border border-violet-300 shadow-sm"
                    : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-neutral-500 text-sm">Caricamento...</p>
          </div>
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
  );
}


function AlberoCategorie({ categorie, allCategorie, vista, onRefresh }) {
  const [newCatName, setNewCatName] = useState("");
  const [newSubNames, setNewSubNames] = useState({});
  const [editCat, setEditCat] = useState(null);
  const [editSub, setEditSub] = useState(null);
  const [moving, setMoving] = useState(null); // { subId, subNome, fromCatId }
  const [expandedMovements, setExpandedMovements] = useState(null); // { type: "cat"|"sub", id, nome, parentNome? }
  const [movements, setMovements] = useState({});
  const [loadingMovements, setLoadingMovements] = useState({});

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

  const [feedback, setFeedback] = useState(null); // { type: "ok"|"merge"|"error", text }

  const renameCat = async (forceMerge = false) => {
    if (!editCat) return;
    const url = `${API_BASE}/finanza/albero-categorie/${editCat.id}${forceMerge ? "?merge=true" : ""}`;
    const resp = await apiFetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: editCat.nome }),
    });
    if (resp.status === 409) {
      const err = await resp.json();
      if (window.confirm(err.detail)) {
        return renameCat(true);
      }
      return; // annullato
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      setFeedback({ type: "error", text: err.detail || "Errore rinomina" });
      return;
    }
    const data = await resp.json();
    setEditCat(null);
    setFeedback(data.merged
      ? { type: "merge", text: `"${editCat.nome.toUpperCase()}" unita con successo — movimenti riallineati.` }
      : { type: "ok", text: `Categoria rinominata in "${data.nome}".` }
    );
    onRefresh();
  };

  const renameSub = async (forceMerge = false) => {
    if (!editSub) return;
    const url = `${API_BASE}/finanza/albero-categorie/sotto/${editSub.id}${forceMerge ? "?merge=true" : ""}`;
    const resp = await apiFetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: editSub.nome }),
    });
    if (resp.status === 409) {
      const err = await resp.json();
      if (window.confirm(err.detail)) {
        return renameSub(true);
      }
      return;
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      setFeedback({ type: "error", text: err.detail || "Errore rinomina" });
      return;
    }
    const data = await resp.json();
    setEditSub(null);
    setFeedback(data.merged
      ? { type: "merge", text: `"${editSub.nome.toUpperCase()}" unita con successo — movimenti riallineati.` }
      : { type: "ok", text: `Sotto-categoria rinominata in "${data.nome}".` }
    );
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

  // Load movements for a category or subcategory
  const loadMovements = async (type, id, nome, parentNome = null) => {
    const key = `${type}-${id}`;
    if (movements[key]) {
      // Already loaded, toggle
      if (expandedMovements?.id === id && expandedMovements?.type === type) {
        setExpandedMovements(null);
      } else {
        setExpandedMovements({ type, id, nome, parentNome });
      }
      return;
    }

    setLoadingMovements(p => ({ ...p, [key]: true }));
    try {
      const vistaParam = vista === "A" ? "analitico" : "finanziario";
      let url = `${FC}/movimenti?vista=${vistaParam}&limit=50`;
      if (type === "cat") {
        url += `&cat1=${encodeURIComponent(nome)}`;
      } else {
        url += `&cat1=${encodeURIComponent(parentNome)}&cat2=${encodeURIComponent(nome)}`;
      }
      const resp = await apiFetch(url);
      if (resp.ok) {
        const data = await resp.json();
        setMovements(p => ({ ...p, [key]: data.movimenti || [] }));
        setExpandedMovements({ type, id, nome, parentNome });
      }
    } catch (_) {
      setFeedback({ type: "error", text: "Errore nel caricamento dei movimenti" });
    }
    setLoadingMovements(p => ({ ...p, [key]: false }));
  };

  const formatEUR = (value) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div>
      <p className="text-sm text-neutral-600 mb-6 p-4 bg-white rounded-xl border border-neutral-200">
        Gestisci le categorie e sotto-categorie. Rinominare propaga a tutti i movimenti e regole.
        Se rinomini con un nome già esistente, le due voci verranno <strong>unite automaticamente</strong>.
        Clicca sul badge dei movimenti per visualizzarne il dettaglio.
      </p>

      {feedback && (
        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm flex items-center justify-between ${
          feedback.type === "error"
            ? "border-red-300 bg-red-50 text-red-800"
            : feedback.type === "merge"
            ? "border-violet-300 bg-violet-50 text-violet-800"
            : "border-emerald-300 bg-emerald-50 text-emerald-800"
        }`}>
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="ml-2 text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="space-y-5">
        {categorie.map(cat => (
          <div key={cat.id} className="rounded-2xl border-2 border-violet-100 bg-white shadow-sm hover:shadow-md transition overflow-hidden">
            {/* HEADER CATEGORIA */}
            <div className="bg-violet-50 px-5 py-4 border-b border-violet-100">
              <div className="flex items-center gap-3 mb-3">
                {editCat?.id === cat.id ? (
                  <>
                    <input value={editCat.nome}
                      onChange={e => setEditCat({ ...editCat, nome: e.target.value })}
                      onKeyDown={e => e.key === "Enter" && renameCat()}
                      className="px-3 py-1.5 border border-violet-300 rounded-lg text-sm font-semibold flex-1 focus:outline-none focus:ring-2 focus:ring-violet-400" autoFocus />
                    <button onClick={renameCat}
                      className="text-xs px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 font-medium">Salva</button>
                    <button onClick={() => setEditCat(null)}
                      className="text-xs px-3 py-1.5 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 font-medium">Annulla</button>
                  </>
                ) : (
                  <>
                    <span className="text-lg font-bold text-violet-950">{cat.nome}</span>
                    <span className="text-[11px] text-neutral-500 font-medium bg-neutral-100 px-2 py-1 rounded-full">
                      {cat.sottocategorie.length} sub
                    </span>
                    {cat.n_mov > 0 && (
                      <button
                        onClick={() => loadMovements("cat", cat.id, cat.nome)}
                        className="text-[11px] px-2.5 py-1 bg-violet-200 text-violet-900 rounded-full font-semibold hover:bg-violet-300 transition cursor-pointer shadow-sm"
                        title="Clicca per visualizzare i movimenti">
                        {cat.n_mov} mov.
                      </button>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <button onClick={() => setEditCat({ id: cat.id, nome: cat.nome })}
                        className="text-sm px-2.5 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition">✏️</button>
                      <button onClick={() => deleteCat(cat.id, cat.nome)}
                        className="text-sm px-2.5 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition">🗑️</button>
                    </div>
                  </>
                )}
              </div>

              {/* SOTTOCATEGORIE */}
              <div className="ml-2 space-y-2">
                {cat.sottocategorie.map(sub => (
                  <div key={sub.id} className="flex items-center gap-3 text-sm pl-2 border-l-2 border-violet-200">
                    <span className="text-neutral-400 text-xs">└</span>
                    {editSub?.id === sub.id ? (
                      <>
                        <input value={editSub.nome}
                          onChange={e => setEditSub({ ...editSub, nome: e.target.value })}
                          onKeyDown={e => e.key === "Enter" && renameSub()}
                          className="px-2.5 py-1 border border-violet-300 rounded-lg text-xs flex-1 focus:outline-none focus:ring-2 focus:ring-violet-400" autoFocus />
                        <button onClick={renameSub}
                          className="text-[10px] px-2 py-1 bg-emerald-100 text-emerald-800 rounded font-medium">OK</button>
                        <button onClick={() => setEditSub(null)}
                          className="text-[10px] px-2 py-1 bg-neutral-200 rounded font-medium">✕</button>
                      </>
                    ) : moving?.subId === sub.id ? (
                      <>
                        <span className="font-medium text-violet-900">{sub.nome}</span>
                        <span className="text-[10px] text-neutral-500">→ sposta in:</span>
                        <select
                          className="text-xs border border-violet-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-400"
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
                          className="text-[10px] px-2 py-1 bg-neutral-200 rounded font-medium">✕</button>
                      </>
                    ) : (
                      <>
                        <span className="text-neutral-800">{sub.nome}</span>
                        {sub.n_mov > 0 && (
                          <button
                            onClick={() => loadMovements("sub", sub.id, sub.nome, cat.nome)}
                            className="text-[10px] px-2 py-0.5 bg-neutral-200 text-neutral-700 rounded-full hover:bg-neutral-300 transition cursor-pointer font-medium"
                            title="Clicca per visualizzare i movimenti">
                            {sub.n_mov}
                          </button>
                        )}
                        <div className="ml-auto flex items-center gap-0.5">
                          <button onClick={() => setEditSub({ id: sub.id, nome: sub.nome })}
                            className="text-xs px-1.5 py-1 text-blue-600 hover:bg-blue-50 rounded transition">✏️</button>
                          <button onClick={() => setMoving({ subId: sub.id, subNome: sub.nome, fromCatId: cat.id })}
                            className="text-xs px-1.5 py-1 text-violet-600 hover:bg-violet-50 rounded transition"
                            title="Sposta in un'altra categoria">↗️</button>
                          <button onClick={() => deleteSub(sub.id, sub.nome)}
                            className="text-xs px-1.5 py-1 text-red-600 hover:bg-red-50 rounded transition">🗑️</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* AGGIUNGI SOTTO */}
                <div className="flex items-center gap-3 mt-3 pl-2 text-sm border-l-2 border-violet-200">
                  <span className="text-neutral-400 text-xs">└</span>
                  <input type="text" placeholder="Nuova sotto-categoria..."
                    value={newSubNames[cat.id] || ""}
                    onChange={e => setNewSubNames(p => ({ ...p, [cat.id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addSub(cat.id)}
                    className="px-2.5 py-1 border border-dashed border-neutral-300 rounded-lg text-xs flex-1 focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  <button onClick={() => addSub(cat.id)}
                    className="text-xs px-3 py-1 bg-violet-100 text-violet-800 rounded-lg hover:bg-violet-200 transition font-medium">
                    + Aggiungi
                  </button>
                </div>
              </div>
            </div>

            {/* MOVEMENTS LIST SECTION */}
            {expandedMovements?.id === cat.id && expandedMovements?.type === "cat" && (
              <MovementsList
                movements={movements[`cat-${cat.id}`] || []}
                loading={loadingMovements[`cat-${cat.id}`] || false}
                onClose={() => setExpandedMovements(null)}
              />
            )}
            {expandedMovements?.id && expandedMovements?.type === "sub" && (
              <div className="border-t border-violet-100">
                {cat.sottocategorie.map(sub =>
                  expandedMovements.id === sub.id && (
                    <MovementsList
                      key={sub.id}
                      movements={movements[`sub-${sub.id}`] || []}
                      loading={loadingMovements[`sub-${sub.id}`] || false}
                      onClose={() => setExpandedMovements(null)}
                    />
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* AGGIUNGI CATEGORIA */}
      <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <input type="text" placeholder="Nuova categoria..."
          value={newCatName}
          onChange={e => setNewCatName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addCat()}
          className="px-4 py-2.5 border-2 border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 flex-1 sm:flex-none sm:w-64" />
        <button onClick={addCat}
          className="px-5 py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-xl hover:bg-violet-800 shadow-md hover:shadow-lg transition">
          + Nuova Categoria
        </button>
      </div>
    </div>
  );
}

function MovementsList({ movements, loading, onClose }) {
  if (loading) {
    return (
      <div className="px-5 py-6 bg-violet-50 border-t border-violet-100 flex items-center justify-center">
        <p className="text-sm text-neutral-600">Caricamento movimenti...</p>
      </div>
    );
  }

  if (!movements.length) {
    return (
      <div className="px-5 py-6 bg-violet-50 border-t border-violet-100 flex items-center justify-between">
        <p className="text-sm text-neutral-500">Nessun movimento trovato</p>
        <button onClick={onClose} className="text-sm px-3 py-1 text-neutral-600 hover:bg-white rounded-lg transition">
          Chiudi
        </button>
      </div>
    );
  }

  const formatEUR = (value) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getStatoBadge = (stato) => {
    const colors = {
      "bozza": "bg-slate-100 text-slate-700",
      "confermato": "bg-emerald-100 text-emerald-700",
      "archiviato": "bg-neutral-200 text-neutral-700",
    };
    return colors[stato] || "bg-neutral-100 text-neutral-700";
  };

  return (
    <div className="px-5 py-6 bg-violet-50 border-t border-violet-100">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-violet-950">Movimenti ({movements.length})</h4>
        <button onClick={onClose} className="text-sm px-3 py-1 text-neutral-600 hover:bg-white rounded-lg transition font-medium">
          Chiudi
        </button>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {movements.map((mov) => (
          <div key={mov.id} className="bg-white rounded-lg p-3 border border-neutral-200 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-900">{mov.descrizione}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatoBadge(mov.stato)}`}>
                {mov.stato}
              </span>
            </div>
            <div className="flex items-center justify-between text-neutral-600">
              <span className="text-[10px]">{mov.data ? new Date(mov.data).toLocaleDateString("it-IT") : "—"}</span>
              <div className="flex gap-3">
                {mov.dare > 0 && <span className="font-semibold text-red-600">Dare: {formatEUR(mov.dare)}</span>}
                {mov.avere > 0 && <span className="font-semibold text-emerald-600">Avere: {formatEUR(mov.avere)}</span>}
                {!mov.dare && !mov.avere && <span className="text-neutral-400">—</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
