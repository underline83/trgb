// @version: v1.0-preventivo-menu-composer
// Pannello "Componi menu" per preventivi: pesca piatti dal Ricettario (Cucina),
// snapshotta sul preventivo, permette quick-create ("Piatto veloce"), gestisce sconto
// e ricalcola prezzo/persona lato backend. Le righe salvate sono IMMUTABILI rispetto
// a modifiche future in Cucina (mig 075).
import React, { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE, apiFetch } from "../../config/api";

const RIGA_QUICK_VUOTA = { name: "", description: "", price: 0, category_name: "" };

export default function PreventivoMenuComposer({
  preventivoId,
  nPersone,
  onTotaleMenuChange, // callback({menu_subtotale, menu_sconto, menu_prezzo_persona})
  onToast,
}) {
  const [righe, setRighe] = useState([]);
  const [subtotale, setSubtotale] = useState(0);
  const [scontoLocal, setScontoLocal] = useState(0); // input controllato
  const [prezzoPersona, setPrezzoPersona] = useState(0);
  const [loading, setLoading] = useState(true);

  // Picker piatti
  const [showPicker, setShowPicker] = useState(false);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [filterServiceId, setFilterServiceId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [piatti, setPiatti] = useState([]);
  const [searching, setSearching] = useState(false);

  // Dialog piatto veloce
  const [showQuick, setShowQuick] = useState(false);
  const [quick, setQuick] = useState(RIGA_QUICK_VUOTA);

  // Edit inline prezzo
  const [editingPrice, setEditingPrice] = useState(null); // riga_id | null

  const scontoTimer = useRef(null);

  const toast = useCallback((msg, isError = false) => {
    if (onToast) onToast(msg, isError);
  }, [onToast]);

  // ── Carica righe + testata (per sconto/subtotale salvato) ──
  const loadState = useCallback(async () => {
    if (!preventivoId) return;
    try {
      const [rMenu, rPrev] = await Promise.all([
        apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu-righe`).then((r) => r.json()),
        apiFetch(`${API_BASE}/preventivi/${preventivoId}`).then((r) => r.json()),
      ]);
      const items = Array.isArray(rMenu?.items) ? rMenu.items : [];
      setRighe(items);
      setSubtotale(parseFloat(rPrev?.menu_subtotale || 0));
      setScontoLocal(parseFloat(rPrev?.menu_sconto || 0));
      setPrezzoPersona(parseFloat(rPrev?.menu_prezzo_persona || 0));
      if (onTotaleMenuChange) onTotaleMenuChange({
        menu_subtotale: parseFloat(rPrev?.menu_subtotale || 0),
        menu_sconto: parseFloat(rPrev?.menu_sconto || 0),
        menu_prezzo_persona: parseFloat(rPrev?.menu_prezzo_persona || 0),
      });
    } catch {
      toast("Errore caricamento menu", true);
    } finally {
      setLoading(false);
    }
  }, [preventivoId, onTotaleMenuChange, toast]);

  useEffect(() => { loadState(); }, [loadState]);

  // ── Carica tipi servizio ──
  useEffect(() => {
    apiFetch(`${API_BASE}/foodcost/service-types`)
      .then((r) => r.json())
      .then((data) => setServiceTypes(Array.isArray(data) ? data : []))
      .catch(() => setServiceTypes([]));
  }, []);

  // ── Ricerca piatti (quando picker aperto) ──
  useEffect(() => {
    if (!showPicker) return;
    setSearching(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams({ kind: "dish" });
      if (filterServiceId) params.append("service_type_id", filterServiceId);
      if (searchText.trim()) params.append("search", searchText.trim());
      apiFetch(`${API_BASE}/foodcost/ricette?${params.toString()}`)
        .then((r) => r.json())
        .then((data) => {
          // endpoint ritorna array o {items: [...]}
          const list = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
          setPiatti(list);
        })
        .catch(() => setPiatti([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [showPicker, filterServiceId, searchText]);

  // ── Debounce sconto → PUT ──
  const pushSconto = (val) => {
    setScontoLocal(val);
    if (scontoTimer.current) clearTimeout(scontoTimer.current);
    scontoTimer.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu-sconto`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sconto: parseFloat(val) || 0 }),
        });
        if (!res.ok) throw new Error("Errore sconto");
        const data = await res.json();
        setSubtotale(parseFloat(data.menu_subtotale || 0));
        setPrezzoPersona(parseFloat(data.menu_prezzo_persona || 0));
        if (onTotaleMenuChange) onTotaleMenuChange(data);
      } catch {
        toast("Errore salvataggio sconto", true);
      }
    }, 400);
  };

  // ── Aggiungi da ricetta ──
  const addFromRecipe = async (recipe) => {
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu-righe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe_id: recipe.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore aggiunta");
      }
      await loadState();
      toast(`+ ${recipe.menu_name || recipe.name}`);
    } catch (e) {
      toast(e.message, true);
    }
  };

  // ── Piatto veloce ──
  const addQuick = async () => {
    if (!quick.name.trim()) { toast("Nome obbligatorio", true); return; }
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu-righe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: quick.name.trim(),
          description: (quick.description || "").trim() || null,
          price: parseFloat(quick.price) || 0,
          category_name: (quick.category_name || "").trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore aggiunta");
      }
      setQuick(RIGA_QUICK_VUOTA);
      setShowQuick(false);
      await loadState();
      toast("Piatto aggiunto");
    } catch (e) {
      toast(e.message, true);
    }
  };

  // ── Rimuovi riga ──
  const removeRiga = async (riga) => {
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu-righe/${riga.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Errore eliminazione");
      await loadState();
    } catch (e) {
      toast(e.message, true);
    }
  };

  // ── Aggiorna prezzo riga (quick edit) ──
  const updatePrice = async (riga, newPrice) => {
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu-righe/${riga.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: parseFloat(newPrice) || 0 }),
      });
      if (!res.ok) throw new Error("Errore aggiornamento");
      setEditingPrice(null);
      await loadState();
    } catch (e) {
      toast(e.message, true);
    }
  };

  // ── Riordina (sposta su/giu) ──
  const sposta = async (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= righe.length) return;
    const reordered = [...righe];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setRighe(reordered); // ottimistico
    try {
      await apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu-righe`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: reordered.map((r) => r.id) }),
      });
    } catch {
      toast("Errore riordino", true);
      loadState();
    }
  };

  // Raggruppa per categoria (mantiene sort_order dentro)
  const gruppi = righe.reduce((acc, r) => {
    const key = r.category_name || "— Senza categoria —";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});
  const gruppoKeys = Object.keys(gruppi);

  const totaleMenu = Math.max(0, subtotale - (parseFloat(scontoLocal) || 0));

  if (!preventivoId) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        Salva prima il preventivo per poter comporre il menu dalla cucina.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-700">🪄 Componi menu dal ricettario</h3>
          <p className="text-[11px] text-neutral-400">
            I piatti aggiunti sono snapshot: eventuali modifiche in Cucina NON cambieranno questo preventivo.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setShowPicker((v) => !v); setShowQuick(false); }}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${showPicker ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}>
            {showPicker ? "✕ Chiudi ricerca" : "🔎 Aggiungi dal ricettario"}
          </button>
          <button type="button" onClick={() => { setShowQuick((v) => !v); setShowPicker(false); }}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${showQuick ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}>
            {showQuick ? "✕ Annulla" : "⚡ Piatto veloce"}
          </button>
        </div>
      </div>

      {/* ── Picker piatti ── */}
      {showPicker && (
        <div className="bg-indigo-50/40 border border-indigo-200 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-[1fr_200px] gap-2">
            <input type="search" value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Cerca per nome piatto..."
              className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
            <select value={filterServiceId} onChange={(e) => setFilterServiceId(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white">
              <option value="">Tutti i tipi servizio</option>
              {serviceTypes.filter((st) => st.active).map((st) => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>
          </div>
          <div className="max-h-60 overflow-y-auto bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
            {searching ? (
              <div className="px-3 py-4 text-xs text-neutral-400 text-center">Ricerca...</div>
            ) : piatti.length === 0 ? (
              <div className="px-3 py-4 text-xs text-neutral-400 text-center">
                Nessun piatto trovato. Prova "⚡ Piatto veloce" per creare al volo.
              </div>
            ) : piatti.map((p) => (
              <button key={p.id} type="button" onClick={() => addFromRecipe(p)}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm flex items-center justify-between gap-3 min-h-[44px]">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-neutral-900 truncate">{p.menu_name || p.name}</div>
                  {p.menu_description && (
                    <div className="text-[11px] text-neutral-500 truncate">{p.menu_description}</div>
                  )}
                  {p.category_name && (
                    <div className="text-[10px] text-neutral-400 uppercase tracking-wide mt-0.5">{p.category_name}</div>
                  )}
                </div>
                <div className="text-sm font-semibold text-indigo-700 whitespace-nowrap">
                  €{(parseFloat(p.selling_price) || 0).toFixed(2)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Dialog piatto veloce ── */}
      {showQuick && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-[1fr_140px_120px] gap-2">
            <input type="text" value={quick.name}
              onChange={(e) => setQuick({ ...quick, name: e.target.value })}
              placeholder="Nome piatto *"
              className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
            <input type="text" value={quick.category_name}
              onChange={(e) => setQuick({ ...quick, category_name: e.target.value })}
              placeholder="Categoria"
              className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
            <input type="number" min="0" step="0.5" value={quick.price}
              onChange={(e) => setQuick({ ...quick, price: e.target.value })}
              placeholder="Prezzo €"
              className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white text-right" />
          </div>
          <textarea value={quick.description}
            onChange={(e) => setQuick({ ...quick, description: e.target.value })}
            placeholder="Descrizione (opzionale)"
            rows={2}
            className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white resize-y" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setShowQuick(false); setQuick(RIGA_QUICK_VUOTA); }}
              className="text-xs px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-50">
              Annulla
            </button>
            <button type="button" onClick={addQuick}
              className="text-xs px-3 py-1.5 bg-neutral-800 text-white rounded-lg font-medium hover:bg-neutral-900">
              + Aggiungi al menu
            </button>
          </div>
          <p className="text-[11px] text-neutral-400">
            Non salva il piatto nel ricettario — solo sul preventivo. Se vuoi riusarlo, crealo da Cucina.
          </p>
        </div>
      )}

      {/* ── Righe raggruppate ── */}
      {loading ? (
        <div className="text-xs text-neutral-400 text-center py-4">Caricamento...</div>
      ) : righe.length === 0 ? (
        <div className="text-center py-6 text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-lg">
          Menu vuoto. Aggiungi piatti dal ricettario o crea un "Piatto veloce".
        </div>
      ) : (
        <div className="space-y-3">
          {gruppoKeys.map((cat) => (
            <div key={cat} className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 border-b border-neutral-200 pb-1">
                {cat}
              </div>
              {gruppi[cat].map((r) => {
                const idxGlobal = righe.findIndex((x) => x.id === r.id);
                return (
                  <div key={r.id} className="flex items-start gap-2 py-1.5 border-b border-neutral-100 last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-neutral-900">{r.name}</div>
                      {r.description && (
                        <div className="text-[11px] text-neutral-500">{r.description}</div>
                      )}
                      {!r.recipe_id && (
                        <span className="inline-block text-[9px] uppercase tracking-wider text-neutral-400 mt-0.5">⚡ veloce</span>
                      )}
                    </div>
                    <div className="w-20 text-right">
                      {editingPrice === r.id ? (
                        <input type="number" min="0" step="0.5" defaultValue={r.price}
                          autoFocus
                          onBlur={(e) => updatePrice(r, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") updatePrice(r, e.target.value); if (e.key === "Escape") setEditingPrice(null); }}
                          className="w-full border border-indigo-300 rounded px-2 py-1 text-sm text-right" />
                      ) : (
                        <button type="button" onClick={() => setEditingPrice(r.id)}
                          className="text-sm font-semibold text-neutral-900 hover:text-indigo-700 whitespace-nowrap">
                          €{(parseFloat(r.price) || 0).toFixed(2)}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 w-16 justify-end">
                      <button type="button" onClick={() => sposta(idxGlobal, -1)} disabled={idxGlobal === 0}
                        className="text-neutral-300 hover:text-neutral-500 disabled:opacity-30 text-sm px-1">▲</button>
                      <button type="button" onClick={() => sposta(idxGlobal, 1)} disabled={idxGlobal === righe.length - 1}
                        className="text-neutral-300 hover:text-neutral-500 disabled:opacity-30 text-sm px-1">▼</button>
                      <button type="button" onClick={() => removeRiga(r)}
                        className="text-red-300 hover:text-red-600 text-sm px-1">✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Riepilogo prezzi ── */}
      <div className="pt-3 border-t border-neutral-200 space-y-1 text-sm">
        <div className="flex justify-between text-neutral-600">
          <span>Subtotale menu ({righe.length} {righe.length === 1 ? "piatto" : "piatti"})</span>
          <span className="font-medium">€{subtotale.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center">
          <label className="text-neutral-600">Sconto menu (€)</label>
          <input type="number" min="0" step="0.5" value={scontoLocal}
            onChange={(e) => pushSconto(e.target.value)}
            className="w-28 border border-neutral-300 rounded-lg px-2 py-1 text-sm text-right" />
        </div>
        <div className="flex justify-between text-base font-semibold text-neutral-900 pt-1 border-t border-neutral-100">
          <span>Totale menu</span>
          <span className="text-indigo-700">€{totaleMenu.toFixed(2)}</span>
        </div>
        {nPersone ? (
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Prezzo a persona ({nPersone} coperti)</span>
            <span>€{prezzoPersona.toFixed(2)}</span>
          </div>
        ) : (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Imposta "N. persone" in testata per calcolare il prezzo a persona.
          </p>
        )}
      </div>
    </div>
  );
}
