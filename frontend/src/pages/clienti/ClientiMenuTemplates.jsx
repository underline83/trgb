// @version: v1.0-clienti-menu-templates (mig 080)
// Libreria Menu Template — pagina CRUD riutilizzabile dal composer preventivi.
// Lista a sinistra, dettaglio (metadati + righe) a destra. Le righe si
// modificano con add/remove/sort; il prezzo_persona e sconto sono metadati
// del template (il composer li propone come default quando lo applica).
//
// Montato in Impostazioni Clienti come sezione "menu_templates".

import React, { useState, useEffect, useMemo } from "react";
import { API_BASE, apiFetch } from "../../config/api";

const RIGA_VUOTA = { name: "", description: "", price: 0, category_name: "" };

export default function ClientiMenuTemplates({ embedded = false }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [filterServiceId, setFilterServiceId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [toast, setToast] = useState(null);

  // Aggiunta riga (picker dal ricettario o quick)
  const [showPicker, setShowPicker] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [quick, setQuick] = useState(RIGA_VUOTA);
  const [piatti, setPiatti] = useState([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerService, setPickerService] = useState("");
  const [pickerBusy, setPickerBusy] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load iniziale ──
  useEffect(() => {
    loadServiceTypes();
    loadList();
  }, []);

  // Reload lista su cambio filtri (debounce)
  useEffect(() => {
    const t = setTimeout(() => loadList(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterServiceId, searchText]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId]);

  const loadServiceTypes = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/foodcost/service-types`);
      if (!res.ok) return;
      const data = await res.json();
      setServiceTypes(data.items || data || []);
    } catch {
      setServiceTypes([]);
    }
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterServiceId) qs.set("service_type_id", filterServiceId);
      if (searchText) qs.set("q", searchText);
      const res = await apiFetch(`${API_BASE}/menu-templates/${qs.toString() ? "?" + qs.toString() : ""}`);
      if (!res.ok) throw new Error("Errore caricamento lista");
      const data = await res.json();
      setList(data.items || []);
    } catch (e) {
      showToast(e.message || "Errore", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id) => {
    try {
      const res = await apiFetch(`${API_BASE}/menu-templates/${id}`);
      if (!res.ok) throw new Error("Errore caricamento template");
      const data = await res.json();
      setDetail(data);
    } catch (e) {
      showToast(e.message || "Errore", "error");
      setDetail(null);
    }
  };

  // ── Picker piatti ──
  const loadPiatti = async () => {
    setPickerBusy(true);
    try {
      const qs = new URLSearchParams();
      if (pickerSearch) qs.set("search", pickerSearch);
      if (pickerService) qs.set("service_type_id", pickerService);
      qs.set("kind", "menu");
      const res = await apiFetch(`${API_BASE}/foodcost/ricette/?${qs.toString()}`);
      if (!res.ok) throw new Error("Errore ricettario");
      const data = await res.json();
      setPiatti(data.items || data || []);
    } catch (e) {
      showToast(e.message || "Errore", "error");
      setPiatti([]);
    } finally {
      setPickerBusy(false);
    }
  };

  useEffect(() => {
    if (!showPicker) return;
    const t = setTimeout(() => loadPiatti(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerSearch, pickerService, showPicker]);

  // ── Azioni ──
  const createNew = async () => {
    const nome = window.prompt("Nome del nuovo template:");
    if (!nome || !nome.trim()) return;
    try {
      const res = await apiFetch(`${API_BASE}/menu-templates/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim() }),
      });
      if (!res.ok) throw new Error("Errore creazione");
      const t = await res.json();
      await loadList();
      setSelectedId(t.id);
      showToast("Template creato");
    } catch (e) {
      showToast(e.message || "Errore", "error");
    }
  };

  const duplicate = async (id) => {
    try {
      const res = await apiFetch(`${API_BASE}/menu-templates/${id}/duplica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Errore duplicazione");
      const t = await res.json();
      await loadList();
      setSelectedId(t.id);
      showToast("Duplicato");
    } catch (e) {
      showToast(e.message || "Errore", "error");
    }
  };

  const remove = async (id, nome) => {
    if (!window.confirm(`Eliminare il template "${nome}"? L'operazione è irreversibile.`)) return;
    try {
      const res = await apiFetch(`${API_BASE}/menu-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Errore eliminazione");
      if (selectedId === id) setSelectedId(null);
      await loadList();
      showToast("Template eliminato");
    } catch (e) {
      showToast(e.message || "Errore", "error");
    }
  };

  const updateDetailField = async (field, value) => {
    if (!detail) return;
    try {
      const res = await apiFetch(`${API_BASE}/menu-templates/${detail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      const t = await res.json();
      setDetail(t);
      await loadList();
    } catch (e) {
      showToast(e.message || "Errore", "error");
    }
  };

  const addFromRecipe = async (p) => {
    if (!detail) return;
    try {
      const nome = (p.menu_name || p.name || "").trim();
      const desc = (p.menu_description || "").trim() || null;
      const cat = p.category_name || null;
      const price = parseFloat(p.selling_price || 0);
      const res = await apiFetch(`${API_BASE}/menu-templates/${detail.id}/righe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nome,
          description: desc,
          price,
          category_name: cat,
          recipe_id: p.id,
        }),
      });
      if (!res.ok) throw new Error("Errore aggiunta riga");
      const t = await res.json();
      setDetail(t);
      showToast(`+ ${nome}`);
    } catch (e) {
      showToast(e.message || "Errore", "error");
    }
  };

  const addQuick = async () => {
    if (!detail) return;
    const nome = (quick.name || "").trim();
    if (!nome) { showToast("Nome obbligatorio", "error"); return; }
    try {
      const res = await apiFetch(`${API_BASE}/menu-templates/${detail.id}/righe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nome,
          description: (quick.description || "").trim() || null,
          price: parseFloat(quick.price) || 0,
          category_name: (quick.category_name || "").trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Errore aggiunta riga");
      const t = await res.json();
      setDetail(t);
      setQuick(RIGA_VUOTA);
      setShowQuick(false);
      showToast(`+ ${nome}`);
    } catch (e) {
      showToast(e.message || "Errore", "error");
    }
  };

  const removeRiga = async (rigaId) => {
    if (!detail) return;
    try {
      const res = await apiFetch(`${API_BASE}/menu-templates/${detail.id}/righe/${rigaId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Errore eliminazione riga");
      const t = await res.json();
      setDetail(t);
    } catch (e) {
      showToast(e.message || "Errore", "error");
    }
  };

  const moveRiga = async (idx, dir) => {
    if (!detail) return;
    const righe = [...(detail.righe || [])];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= righe.length) return;
    [righe[idx], righe[newIdx]] = [righe[newIdx], righe[idx]];
    setDetail({ ...detail, righe }); // ottimistico
    try {
      const res = await apiFetch(`${API_BASE}/menu-templates/${detail.id}/righe-ordine`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: righe.map((r) => r.id) }),
      });
      if (!res.ok) throw new Error("Errore riordino");
      const t = await res.json();
      setDetail(t);
    } catch (e) {
      showToast(e.message || "Errore", "error");
      loadDetail(detail.id);
    }
  };

  // Raggruppa righe per category_name per il render
  const righeByCategoria = useMemo(() => {
    const out = new Map();
    (detail?.righe || []).forEach((r, i) => {
      const cat = r.category_name || "— Senza categoria —";
      if (!out.has(cat)) out.set(cat, []);
      out.get(cat).push({ ...r, _idx: i });
    });
    return out;
  }, [detail]);

  return (
    <div className={embedded ? "" : "max-w-6xl mx-auto p-4"}>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm ${
          toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">🍽️ Libreria Menu Template</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Menu riutilizzabili su più preventivi. Le righe sono snapshot: modifiche al template
            non cambiano i preventivi già compilati.
          </p>
        </div>
        <button type="button" onClick={createNew}
          className="text-sm px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 whitespace-nowrap">
          + Nuovo template
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        {/* ── Lista ── */}
        <div className="bg-white border border-neutral-200 rounded-lg flex flex-col max-h-[75vh]">
          <div className="p-3 space-y-2 border-b border-neutral-200">
            <input type="search" value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Cerca template…"
              className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
            <select value={filterServiceId}
              onChange={(e) => setFilterServiceId(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white">
              <option value="">Tutti i tipi servizio</option>
              {serviceTypes.filter((st) => st.active).map((st) => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="p-4 text-center text-sm text-neutral-500">Caricamento…</div>
            ) : list.length === 0 ? (
              <div className="p-4 text-center text-sm text-neutral-500">
                Nessun template.
                <div className="text-xs text-neutral-400 mt-1">
                  Crealo qui o dal composer di un preventivo ("💾 Salva template").
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {list.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setSelectedId(t.id)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-amber-50 transition ${
                        selectedId === t.id ? "bg-amber-50" : ""
                      }`}>
                      <div className="text-sm font-medium text-neutral-900 truncate">{t.nome}</div>
                      <div className="text-xs text-neutral-500 flex flex-wrap gap-x-2 mt-0.5">
                        {t.service_type_name && <span className="text-amber-700">🍽️ {t.service_type_name}</span>}
                        <span>{t.n_righe || 0} righ{t.n_righe === 1 ? "a" : "e"}</span>
                        {t.prezzo_persona > 0 && <span>€ {parseFloat(t.prezzo_persona).toFixed(2)}/pax</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Dettaglio ── */}
        <div className="bg-white border border-neutral-200 rounded-lg p-4 min-h-[400px]">
          {!detail ? (
            <div className="text-center text-sm text-neutral-500 py-12">
              Seleziona un template dalla lista per visualizzarlo e modificarlo.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Testata */}
              <div className="space-y-3 pb-3 border-b border-neutral-100">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Nome *</label>
                  <input type="text" defaultValue={detail.nome} key={`nome-${detail.id}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== detail.nome) updateDetailField("nome", v);
                    }}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Descrizione</label>
                  <textarea defaultValue={detail.descrizione || ""} key={`desc-${detail.id}`}
                    onBlur={(e) => updateDetailField("descrizione", e.target.value)}
                    rows={2}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Tipo servizio</label>
                    <select value={detail.service_type_id || ""}
                      onChange={(e) => updateDetailField(
                        "service_type_id",
                        e.target.value ? parseInt(e.target.value, 10) : null,
                      )}
                      className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white">
                      <option value="">— Nessuno —</option>
                      {serviceTypes.filter((st) => st.active).map((st) => (
                        <option key={st.id} value={st.id}>{st.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">€/persona</label>
                    <input type="number" min="0" step="0.5"
                      defaultValue={detail.prezzo_persona || 0} key={`pp-${detail.id}`}
                      onBlur={(e) => updateDetailField("prezzo_persona", parseFloat(e.target.value) || 0)}
                      className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm text-right" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Sconto (€)</label>
                    <input type="number" min="0" step="0.5"
                      defaultValue={detail.sconto || 0} key={`sc-${detail.id}`}
                      onBlur={(e) => updateDetailField("sconto", parseFloat(e.target.value) || 0)}
                      className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm text-right" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => duplicate(detail.id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-700 hover:bg-neutral-200">
                    ⎘ Duplica
                  </button>
                  <button type="button" onClick={() => remove(detail.id, detail.nome)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200">
                    🗑 Elimina
                  </button>
                </div>
              </div>

              {/* Righe */}
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-neutral-800">Righe del menu</h4>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => { setShowPicker((v) => !v); setShowQuick(false); }}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                      showPicker ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    }`}>
                    {showPicker ? "✕ Chiudi" : "🔎 Dal ricettario"}
                  </button>
                  <button type="button"
                    onClick={() => { setShowQuick((v) => !v); setShowPicker(false); }}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                      showQuick ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                    }`}>
                    {showQuick ? "✕ Annulla" : "⚡ Piatto veloce"}
                  </button>
                </div>
              </div>

              {/* Picker */}
              {showPicker && (
                <div className="bg-indigo-50/40 border border-indigo-200 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-[1fr_200px] gap-2">
                    <input type="search" value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="Cerca piatto…"
                      className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
                    <select value={pickerService}
                      onChange={(e) => setPickerService(e.target.value)}
                      className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white">
                      <option value="">Tutti i tipi servizio</option>
                      {serviceTypes.filter((st) => st.active).map((st) => (
                        <option key={st.id} value={st.id}>{st.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="max-h-48 overflow-auto bg-white rounded-lg border border-indigo-100">
                    {pickerBusy ? (
                      <div className="p-3 text-center text-xs text-neutral-500">Ricerca…</div>
                    ) : piatti.length === 0 ? (
                      <div className="p-3 text-center text-xs text-neutral-500">Nessun piatto</div>
                    ) : (
                      piatti.map((p) => (
                        <button key={p.id} type="button" onClick={() => addFromRecipe(p)}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 border-b border-neutral-100 last:border-b-0">
                          <span className="font-medium">{p.menu_name || p.name}</span>
                          {p.selling_price > 0 && (
                            <span className="text-neutral-500 ml-2">€ {parseFloat(p.selling_price).toFixed(2)}</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Quick */}
              {showQuick && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-[1fr_120px_120px] gap-2">
                    <input type="text" value={quick.name}
                      onChange={(e) => setQuick({ ...quick, name: e.target.value })}
                      placeholder="Nome piatto *"
                      className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                    <input type="text" value={quick.category_name}
                      onChange={(e) => setQuick({ ...quick, category_name: e.target.value })}
                      placeholder="Categoria"
                      className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                    <input type="number" min="0" step="0.5" value={quick.price}
                      onChange={(e) => setQuick({ ...quick, price: e.target.value })}
                      placeholder="€ 0.00"
                      className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm text-right" />
                  </div>
                  <textarea value={quick.description} rows={1}
                    onChange={(e) => setQuick({ ...quick, description: e.target.value })}
                    placeholder="Descrizione (opzionale)"
                    className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setShowQuick(false); setQuick(RIGA_VUOTA); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200">
                      Annulla
                    </button>
                    <button type="button" onClick={addQuick}
                      className="text-xs px-3 py-1.5 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700">
                      Aggiungi
                    </button>
                  </div>
                </div>
              )}

              {/* Lista righe per categoria */}
              {(!detail.righe || detail.righe.length === 0) ? (
                <div className="text-center text-sm text-neutral-400 py-6 border border-dashed border-neutral-200 rounded-lg">
                  Nessuna riga. Aggiungine dal ricettario o usa "Piatto veloce".
                </div>
              ) : (
                <div className="space-y-4">
                  {[...righeByCategoria.entries()].map(([cat, items]) => (
                    <div key={cat}>
                      <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1 px-1">
                        {cat}
                      </div>
                      <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-lg">
                        {items.map((r) => (
                          <div key={r.id} className="flex items-start gap-2 px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-neutral-900 truncate">{r.name}</div>
                              {r.description && (
                                <div className="text-xs text-neutral-500 truncate">{r.description}</div>
                              )}
                            </div>
                            <div className="text-sm text-neutral-700 w-20 text-right">
                              {r.price > 0 ? `€ ${parseFloat(r.price).toFixed(2)}` : "—"}
                            </div>
                            <div className="flex items-center gap-0.5 w-16 justify-end">
                              <button type="button" onClick={() => moveRiga(r._idx, -1)} disabled={r._idx === 0}
                                className="text-neutral-400 hover:text-neutral-700 disabled:opacity-20 text-xs px-1">▲</button>
                              <button type="button" onClick={() => moveRiga(r._idx, 1)} disabled={r._idx === detail.righe.length - 1}
                                className="text-neutral-400 hover:text-neutral-700 disabled:opacity-20 text-xs px-1">▼</button>
                              <button type="button" onClick={() => removeRiga(r.id)}
                                className="text-red-400 hover:text-red-700 text-xs px-1">✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
