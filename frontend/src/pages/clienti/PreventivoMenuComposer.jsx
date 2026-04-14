// @version: v2.1-preventivo-menu-composer (libreria template — mig 080)
// Pannello "Componi menu" per preventivi con supporto N menu alternativi.
// Un preventivo puo' avere 1..N menu che il cliente sceglie: i prezzi sono
// sempre a persona; il backend decide il totale (0 menu → solo extra,
// 1 menu → menu×pax + extra, ≥2 menu → niente totale aggregato).
//
// Tab in alto: per ogni menu nome editabile, ▲▼ riordino, ✕ elimina, + aggiungi,
// "Duplica menu" duplica il menu attivo (righe incluse).
//
// v1.1 (sess 36): supporto preventivoId=null con onEnsureSaved() → bozza auto.
// v2.0 (sess 39): refactor completo per menu multipli.
// v2.1 (sess 39): "💾 Salva come template" + "📂 Carica template" (mig 080).

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { API_BASE, apiFetch } from "../../config/api";

const RIGA_QUICK_VUOTA = { name: "", description: "", price: 0, category_name: "" };

export default function PreventivoMenuComposer({
  preventivoId,
  nPersone,
  onEnsureSaved,       // async () => pid | null
  onTotaleMenuChange,  // callback({menu_subtotale, menu_sconto, menu_prezzo_persona, n_menu})
  onToast,
}) {
  // ── Stato menu multipli ──
  const [menus, setMenus] = useState([]); // [{id, nome, sort_order, sconto, subtotale, prezzo_persona, righe:[...]}]
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Editing nome tab ──
  const [editingNameId, setEditingNameId] = useState(null);

  // ── Sconto local (per menu attivo) ──
  const [scontoLocal, setScontoLocal] = useState(0);
  const scontoTimer = useRef(null);

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
  const [editingPrice, setEditingPrice] = useState(null);

  // ── Dialog Salva come template (mig 080) ──
  const [showSaveTpl, setShowSaveTpl] = useState(false);
  const [saveTplNome, setSaveTplNome] = useState("");
  const [saveTplDescrizione, setSaveTplDescrizione] = useState("");
  const [saveTplServiceId, setSaveTplServiceId] = useState("");

  // ── Dialog Carica template ──
  const [showLoadTpl, setShowLoadTpl] = useState(false);
  const [tplList, setTplList] = useState([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplFilterServiceId, setTplFilterServiceId] = useState("");
  const [tplSearchText, setTplSearchText] = useState("");
  const [tplSostituisci, setTplSostituisci] = useState(true);

  // ── Refs parent callbacks ──
  const onToastRef = useRef(onToast);
  const onTotaleMenuChangeRef = useRef(onTotaleMenuChange);
  const onEnsureSavedRef = useRef(onEnsureSaved);
  useEffect(() => { onToastRef.current = onToast; }, [onToast]);
  useEffect(() => { onTotaleMenuChangeRef.current = onTotaleMenuChange; }, [onTotaleMenuChange]);
  useEffect(() => { onEnsureSavedRef.current = onEnsureSaved; }, [onEnsureSaved]);

  const toast = useCallback((msg, isError = false) => {
    if (onToastRef.current) onToastRef.current(msg, isError);
  }, []);

  // ── Derivate ──
  const activeMenu = useMemo(() => {
    if (!menus || menus.length === 0) return null;
    return menus.find((m) => m.id === activeMenuId) || menus[0];
  }, [menus, activeMenuId]);

  const righe = useMemo(() => (activeMenu?.righe || []), [activeMenu]);
  const subtotale = parseFloat(activeMenu?.subtotale || 0);
  const prezzoPersona = Math.max(0, subtotale - (parseFloat(scontoLocal) || 0));

  const notifyParent = useCallback((menusList) => {
    const primary = (menusList || [])[0];
    if (onTotaleMenuChangeRef.current) {
      onTotaleMenuChangeRef.current({
        n_menu: (menusList || []).length,
        menu_subtotale: primary ? parseFloat(primary.subtotale || 0) : 0,
        menu_sconto: primary ? parseFloat(primary.sconto || 0) : 0,
        menu_prezzo_persona: primary ? parseFloat(primary.prezzo_persona || 0) : 0,
        menus: (menusList || []).map((m) => ({
          id: m.id, nome: m.nome, prezzo_persona: parseFloat(m.prezzo_persona || 0),
        })),
      });
    }
  }, []);

  // ── Carica preventivo + menu_list ──
  const loadWithId = useCallback(async (pid) => {
    if (!pid) { setLoading(false); return; }
    try {
      const rPrev = await apiFetch(`${API_BASE}/preventivi/${pid}`).then((r) => r.json());
      const list = Array.isArray(rPrev?.menu_list) ? rPrev.menu_list : [];
      list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
      setMenus(list);
      // Seleziona primo menu se niente attivo
      setActiveMenuId((curr) => {
        if (curr && list.find((m) => m.id === curr)) return curr;
        return list[0]?.id || null;
      });
      // Allinea sconto locale col menu attivo (o primo)
      const current = list.find((m) => m.id === activeMenuId) || list[0];
      setScontoLocal(parseFloat(current?.sconto || 0));
      notifyParent(list);
    } catch {
      toast("Errore caricamento menu", true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, notifyParent]);

  useEffect(() => {
    if (!preventivoId) { setLoading(false); return; }
    loadWithId(preventivoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preventivoId]);

  // Sincronizza scontoLocal quando cambia il menu attivo (via click tab)
  useEffect(() => {
    if (activeMenu) setScontoLocal(parseFloat(activeMenu.sconto || 0));
  }, [activeMenuId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Risolvi pid (con eventuale bozza auto) ──
  const resolvePid = useCallback(async () => {
    if (preventivoId) return preventivoId;
    if (onEnsureSavedRef.current) return await onEnsureSavedRef.current();
    return null;
  }, [preventivoId]);

  // ── Garantisce esistenza di almeno un menu (usato al primo add riga) ──
  const ensureActiveMenu = useCallback(async (pid) => {
    if (activeMenu) return activeMenu.id;
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${pid}/menu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Errore creazione menu");
      const data = await res.json();
      setMenus((curr) => [...curr, { ...data, righe: data.righe || [] }]);
      setActiveMenuId(data.id);
      return data.id;
    } catch (e) {
      toast(e.message, true);
      return null;
    }
  }, [activeMenu, toast]);

  // ── Tipi servizio per picker ──
  useEffect(() => {
    apiFetch(`${API_BASE}/foodcost/service-types`)
      .then((r) => r.json())
      .then((data) => setServiceTypes(Array.isArray(data) ? data : []))
      .catch(() => setServiceTypes([]));
  }, []);

  // ── Ricerca piatti ──
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
          const list = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
          setPiatti(list);
        })
        .catch(() => setPiatti([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [showPicker, filterServiceId, searchText]);

  // ── CRUD MENU ──
  const addMenu = async () => {
    const pid = await resolvePid();
    if (!pid) { toast("Impossibile creare bozza", true); return; }
    try {
      const nome = (menus.length === 0) ? "Menu" : `Opzione ${String.fromCharCode(65 + menus.length)}`;
      const res = await apiFetch(`${API_BASE}/preventivi/${pid}/menu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      if (!res.ok) throw new Error("Errore creazione menu");
      await loadWithId(pid);
      const data = await res.json();
      setActiveMenuId(data.id);
      toast(`+ ${nome}`);
    } catch (e) {
      toast(e.message, true);
    }
  };

  const renameMenu = async (menuId, nuovoNome) => {
    if (!preventivoId || !menuId) return;
    const nome = (nuovoNome || "").trim() || "Menu";
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu/${menuId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      if (!res.ok) throw new Error("Errore rinomina");
      setEditingNameId(null);
      await loadWithId(preventivoId);
    } catch (e) {
      toast(e.message, true);
    }
  };

  const deleteMenu = async (menuId) => {
    if (!preventivoId || !menuId) return;
    const m = menus.find((x) => x.id === menuId);
    const nome = m?.nome || "Menu";
    const nRighe = (m?.righe || []).length;
    const confirmMsg = nRighe > 0
      ? `Elimino "${nome}" con ${nRighe} piatti? L'azione non si puo' annullare.`
      : `Elimino "${nome}"?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu/${menuId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Errore eliminazione menu");
      // Se elimino l'attivo, fallback al primo rimasto
      if (activeMenuId === menuId) setActiveMenuId(null);
      await loadWithId(preventivoId);
      toast(`− ${nome}`);
    } catch (e) {
      toast(e.message, true);
    }
  };

  const duplicateActiveMenu = async () => {
    if (!preventivoId || !activeMenu) return;
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu/${activeMenu.id}/duplica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Errore duplicazione");
      const data = await res.json();
      await loadWithId(preventivoId);
      setActiveMenuId(data.id);
      toast(`+ ${data.nome || "copia"}`);
    } catch (e) {
      toast(e.message, true);
    }
  };

  // ── Templates (mig 080) ──
  const openSaveTplDialog = () => {
    if (!activeMenu) return;
    const defaultName = activeMenu.nome && activeMenu.nome !== "Menu"
      ? activeMenu.nome
      : "";
    setSaveTplNome(defaultName);
    setSaveTplDescrizione("");
    setSaveTplServiceId("");
    setShowSaveTpl(true);
  };

  const confirmSaveTpl = async () => {
    if (!preventivoId || !activeMenu) return;
    const nome = (saveTplNome || "").trim();
    if (!nome) {
      toast("Nome template obbligatorio", true);
      return;
    }
    try {
      const res = await apiFetch(
        `${API_BASE}/preventivi/${preventivoId}/menu/${activeMenu.id}/salva-come-template`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome,
            descrizione: (saveTplDescrizione || "").trim() || null,
            service_type_id: saveTplServiceId ? parseInt(saveTplServiceId, 10) : null,
          }),
        },
      );
      if (!res.ok) throw new Error("Errore salvataggio template");
      const t = await res.json();
      setShowSaveTpl(false);
      toast(`💾 Template salvato: ${t.nome}`);
    } catch (e) {
      toast(e.message || "Errore salvataggio template", true);
    }
  };

  const openLoadTplDialog = async () => {
    setShowLoadTpl(true);
    await reloadTplList();
  };

  const reloadTplList = async () => {
    setTplLoading(true);
    try {
      const qs = new URLSearchParams();
      if (tplFilterServiceId) qs.set("service_type_id", tplFilterServiceId);
      if (tplSearchText) qs.set("q", tplSearchText);
      const url = `${API_BASE}/menu-templates/${qs.toString() ? "?" + qs.toString() : ""}`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error("Errore caricamento template");
      const data = await res.json();
      setTplList(data.items || []);
    } catch (e) {
      toast(e.message || "Errore caricamento template", true);
      setTplList([]);
    } finally {
      setTplLoading(false);
    }
  };

  useEffect(() => {
    if (!showLoadTpl) return;
    const t = setTimeout(() => { reloadTplList(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplFilterServiceId, tplSearchText, showLoadTpl]);

  const applyTpl = async (templateId) => {
    const pid = await resolvePid();
    if (!pid || !activeMenu) {
      toast("Crea prima un menu per caricare un template", true);
      return;
    }
    try {
      const res = await apiFetch(
        `${API_BASE}/preventivi/${pid}/menu/${activeMenu.id}/carica-template`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template_id: templateId,
            sostituisci_righe: tplSostituisci,
            aggiorna_nome: tplSostituisci, // se appendo non sovrascrivo il nome
            aggiorna_prezzo: tplSostituisci,
          }),
        },
      );
      if (!res.ok) throw new Error("Errore applicazione template");
      await loadWithId(pid);
      setShowLoadTpl(false);
      toast(tplSostituisci ? "📂 Template caricato" : "➕ Righe template aggiunte");
    } catch (e) {
      toast(e.message || "Errore applicazione template", true);
    }
  };

  const moveMenu = async (idx, dir) => {
    if (!preventivoId) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= menus.length) return;
    const reordered = [...menus];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setMenus(reordered); // ottimistico
    try {
      await apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu-ordine`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: reordered.map((m) => m.id) }),
      });
      await loadWithId(preventivoId);
    } catch {
      toast("Errore riordino menu", true);
      loadWithId(preventivoId);
    }
  };

  // ── Sconto menu attivo ──
  const pushSconto = (val) => {
    setScontoLocal(val);
    if (scontoTimer.current) clearTimeout(scontoTimer.current);
    scontoTimer.current = setTimeout(async () => {
      const pid = await resolvePid();
      if (!pid || !activeMenu) return;
      try {
        const res = await apiFetch(`${API_BASE}/preventivi/${pid}/menu/${activeMenu.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sconto: parseFloat(val) || 0 }),
        });
        if (!res.ok) throw new Error("Errore sconto");
        await loadWithId(pid);
      } catch {
        toast("Errore salvataggio sconto", true);
      }
    }, 400);
  };

  // ── Aggiungi da ricetta ──
  const addFromRecipe = async (recipe) => {
    const pid = await resolvePid();
    if (!pid) { toast("Impossibile creare bozza", true); return; }
    const mid = await ensureActiveMenu(pid);
    if (!mid) return;
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${pid}/menu/${mid}/righe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe_id: recipe.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore aggiunta");
      }
      await loadWithId(pid);
      toast(`+ ${recipe.menu_name || recipe.name}`);
    } catch (e) {
      toast(e.message, true);
    }
  };

  // ── Piatto veloce ──
  const addQuick = async () => {
    if (!quick.name.trim()) { toast("Nome obbligatorio", true); return; }
    const pid = await resolvePid();
    if (!pid) { toast("Impossibile creare bozza", true); return; }
    const mid = await ensureActiveMenu(pid);
    if (!mid) return;
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${pid}/menu/${mid}/righe`, {
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
      await loadWithId(pid);
      toast("Piatto aggiunto");
    } catch (e) {
      toast(e.message, true);
    }
  };

  // ── Rimuovi riga ──
  const removeRiga = async (riga) => {
    if (!preventivoId) return;
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu-righe/${riga.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Errore eliminazione");
      await loadWithId(preventivoId);
    } catch (e) {
      toast(e.message, true);
    }
  };

  // ── Aggiorna prezzo riga ──
  const updatePrice = async (riga, newPrice) => {
    if (!preventivoId) return;
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu-righe/${riga.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: parseFloat(newPrice) || 0 }),
      });
      if (!res.ok) throw new Error("Errore aggiornamento");
      setEditingPrice(null);
      await loadWithId(preventivoId);
    } catch (e) {
      toast(e.message, true);
    }
  };

  // ── Riordina righe (nel menu attivo) ──
  const sposta = async (idx, dir) => {
    if (!preventivoId || !activeMenu) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= righe.length) return;
    const reordered = [...righe];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    // ottimistico: aggiorna menus locale
    setMenus((curr) =>
      curr.map((m) => (m.id === activeMenu.id ? { ...m, righe: reordered } : m))
    );
    try {
      await apiFetch(`${API_BASE}/preventivi/${preventivoId}/menu/${activeMenu.id}/righe-ordine`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: reordered.map((r) => r.id) }),
      });
    } catch {
      toast("Errore riordino", true);
      loadWithId(preventivoId);
    }
  };

  // ── Rendering raggruppato per categoria ──
  const gruppi = righe.reduce((acc, r) => {
    const key = r.category_name || "— Senza categoria —";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});
  const gruppoKeys = Object.keys(gruppi);

  const hasMultipleMenus = menus.length >= 2;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-neutral-700">🪄 Componi menu dal ricettario</h3>
          <p className="text-[11px] text-neutral-400">
            I piatti aggiunti sono snapshot: eventuali modifiche in Cucina NON cambieranno questo preventivo.
            {hasMultipleMenus && (
              <span className="text-indigo-600"> Hai {menus.length} menu alternativi: il cliente ne sceglie uno.</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={() => { setShowPicker((v) => !v); setShowQuick(false); }}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${showPicker ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}>
            {showPicker ? "✕ Chiudi ricerca" : "🔎 Aggiungi dal ricettario"}
          </button>
          <button type="button" onClick={() => { setShowQuick((v) => !v); setShowPicker(false); }}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${showQuick ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}>
            {showQuick ? "✕ Annulla" : "⚡ Piatto veloce"}
          </button>
          <button type="button" onClick={openLoadTplDialog}
            title="Carica un menu salvato in libreria"
            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition">
            📂 Carica template
          </button>
        </div>
      </div>

      {/* ── TAB MENU ALTERNATIVI ── */}
      <div className="flex items-stretch gap-1 flex-wrap border-b border-neutral-200 pb-0 -mx-1 px-1">
        {menus.map((m, idx) => {
          const isActive = m.id === (activeMenu?.id || null);
          const isEditing = editingNameId === m.id;
          return (
            <div key={m.id}
              className={`group flex items-center gap-0.5 rounded-t-lg border border-b-0 min-h-[40px]
                ${isActive
                  ? "bg-white border-neutral-300 text-neutral-900 relative -mb-px"
                  : "bg-neutral-50 border-neutral-200 text-neutral-500 hover:bg-neutral-100"}`}>
              {/* Tab nome */}
              {isEditing ? (
                <input autoFocus type="text" defaultValue={m.nome}
                  onBlur={(e) => renameMenu(m.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") renameMenu(m.id, e.target.value);
                    if (e.key === "Escape") setEditingNameId(null);
                  }}
                  className="text-sm px-2 py-1.5 rounded border border-indigo-300 w-32 bg-white" />
              ) : (
                <button type="button" onClick={() => setActiveMenuId(m.id)}
                  onDoubleClick={() => setEditingNameId(m.id)}
                  title={isActive ? "Doppio click per rinominare" : "Clicca per selezionare"}
                  className={`text-sm px-3 py-1.5 font-medium whitespace-nowrap ${isActive ? "text-neutral-900" : ""}`}>
                  {m.nome || "Menu"}
                  {(m.righe || []).length > 0 && (
                    <span className={`ml-1.5 text-[10px] ${isActive ? "text-indigo-600" : "text-neutral-400"}`}>
                      {(m.righe || []).length}
                    </span>
                  )}
                </button>
              )}

              {/* Controlli (solo se attivo) */}
              {isActive && !isEditing && (
                <div className="flex items-center gap-0 pr-1">
                  <button type="button" onClick={() => setEditingNameId(m.id)}
                    title="Rinomina"
                    className="text-neutral-400 hover:text-indigo-600 text-xs px-1 py-1 leading-none">✎</button>
                  <button type="button" onClick={() => moveMenu(idx, -1)} disabled={idx === 0}
                    title="Sposta a sinistra"
                    className="text-neutral-400 hover:text-neutral-700 disabled:opacity-20 text-xs px-1 leading-none">◀</button>
                  <button type="button" onClick={() => moveMenu(idx, +1)} disabled={idx === menus.length - 1}
                    title="Sposta a destra"
                    className="text-neutral-400 hover:text-neutral-700 disabled:opacity-20 text-xs px-1 leading-none">▶</button>
                  <button type="button" onClick={() => deleteMenu(m.id)}
                    title="Elimina menu"
                    className="text-red-300 hover:text-red-600 text-sm px-1 leading-none">✕</button>
                </div>
              )}
            </div>
          );
        })}

        {/* Bottone + aggiungi menu */}
        <button type="button" onClick={addMenu}
          title="Aggiungi menu alternativo"
          className="text-sm px-3 py-1.5 rounded-t-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium min-h-[40px] border border-b-0 border-indigo-200">
          + {menus.length === 0 ? "Menu" : "Aggiungi"}
        </button>

        {/* Azioni menu attivo: Salva template + Duplica */}
        {activeMenu && (menus.length > 0) && (
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={openSaveTplDialog}
              title="Salva questo menu nella libreria per riusarlo su altri preventivi"
              disabled={!righe || righe.length === 0}
              className="text-xs px-2 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-medium min-h-[40px] border border-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed">
              💾 Salva template
            </button>
            <button type="button" onClick={duplicateActiveMenu}
              title="Duplica menu attivo (nome + righe)"
              className="text-xs px-2 py-1.5 rounded-lg bg-neutral-100 text-neutral-700 hover:bg-neutral-200 font-medium min-h-[40px] border border-neutral-200">
              ⎘ Duplica menu
            </button>
          </div>
        )}
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

      {/* ── Righe del menu attivo ── */}
      {loading ? (
        <div className="text-xs text-neutral-400 text-center py-4">Caricamento...</div>
      ) : !activeMenu ? (
        <div className="text-center py-6 text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-lg">
          Nessun menu. Aggiungi piatti o crea un menu alternativo con "+".
        </div>
      ) : righe.length === 0 ? (
        <div className="text-center py-6 text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-lg">
          "{activeMenu.nome}" vuoto. Aggiungi piatti dal ricettario o crea un "Piatto veloce".
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

      {/* ── Riepilogo prezzi (menu attivo) ── */}
      {activeMenu && (
        <div className="pt-3 border-t border-neutral-200 space-y-1 text-sm">
          <div className="flex justify-between text-neutral-600">
            <span>Subtotale "{activeMenu.nome}" ({righe.length} {righe.length === 1 ? "piatto" : "piatti"}, per 1 persona)</span>
            <span className="font-medium">€{subtotale.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center">
            <label className="text-neutral-600">Sconto menu (€)</label>
            <input type="number" min="0" step="0.5" value={scontoLocal}
              onChange={(e) => pushSconto(e.target.value)}
              className="w-28 border border-neutral-300 rounded-lg px-2 py-1 text-sm text-right" />
          </div>
          <div className="flex justify-between text-base font-semibold text-neutral-900 pt-1 border-t border-neutral-100">
            <span>Prezzo "{activeMenu.nome}" a persona</span>
            <span className="text-indigo-700">€{prezzoPersona.toFixed(2)}</span>
          </div>
          {nPersone ? (
            <div className="flex justify-between text-sm font-semibold text-neutral-900 pt-1">
              <span>Totale "{activeMenu.nome}" × {nPersone} coperti</span>
              <span className="text-indigo-700">€{(prezzoPersona * Number(nPersone)).toFixed(2)}</span>
            </div>
          ) : (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Imposta "N. persone" in testata per calcolare il totale del menu per tutti i coperti.
            </p>
          )}
          {hasMultipleMenus && (
            <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 mt-1">
              Con {menus.length} menu alternativi il totale del preventivo non viene sommato:
              sul PDF compaiono le opzioni A, B, C… e il cliente sceglie quella che preferisce.
            </p>
          )}
        </div>
      )}

      {/* ── Dialog: Salva come template ── */}
      {showSaveTpl && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-neutral-900">💾 Salva menu come template</h3>
              <p className="text-xs text-neutral-500 mt-1">
                Le righe di "{activeMenu?.nome}" verranno copiate nella libreria come snapshot.
                Potrai riusarle su altri preventivi.
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-neutral-700">Nome template *</label>
              <input type="text" value={saveTplNome}
                onChange={(e) => setSaveTplNome(e.target.value)}
                placeholder="Es. Menu banchetto estate 2026"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
              <label className="block text-xs font-medium text-neutral-700 mt-2">Descrizione (opzionale)</label>
              <textarea value={saveTplDescrizione}
                onChange={(e) => setSaveTplDescrizione(e.target.value)}
                rows={2}
                placeholder="Note interne, cosa rende questo menu speciale…"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
              <label className="block text-xs font-medium text-neutral-700 mt-2">Tipo servizio</label>
              <select value={saveTplServiceId}
                onChange={(e) => setSaveTplServiceId(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">— Nessuno —</option>
                {serviceTypes.filter((st) => st.active).map((st) => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowSaveTpl(false)}
                className="text-sm px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200">
                Annulla
              </button>
              <button type="button" onClick={confirmSaveTpl}
                disabled={!saveTplNome.trim()}
                className="text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
                💾 Salva
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog: Carica template ── */}
      {showLoadTpl && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5 space-y-3 max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-neutral-900">📂 Carica template</h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Scegli un menu dalla libreria. Le righe verranno copiate come snapshot nel menu
                  "{activeMenu?.nome || "corrente"}".
                </p>
              </div>
              <button type="button" onClick={() => setShowLoadTpl(false)}
                className="text-sm px-2 py-1 rounded hover:bg-neutral-100">✕</button>
            </div>

            <div className="grid grid-cols-[1fr_220px] gap-2">
              <input type="search" value={tplSearchText}
                onChange={(e) => setTplSearchText(e.target.value)}
                placeholder="Cerca per nome o descrizione…"
                className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
              <select value={tplFilterServiceId}
                onChange={(e) => setTplFilterServiceId(e.target.value)}
                className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white">
                <option value="">Tutti i tipi servizio</option>
                {serviceTypes.filter((st) => st.active).map((st) => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-neutral-700">
              <input type="checkbox" checked={tplSostituisci}
                onChange={(e) => setTplSostituisci(e.target.checked)} />
              Sostituisci righe correnti (se deselezionato: aggiunge in coda)
            </label>

            <div className="flex-1 overflow-auto border border-neutral-200 rounded-lg">
              {tplLoading ? (
                <div className="p-6 text-center text-sm text-neutral-500">Caricamento…</div>
              ) : tplList.length === 0 ? (
                <div className="p-6 text-center text-sm text-neutral-500">
                  Nessun template trovato.
                  <div className="text-xs text-neutral-400 mt-1">
                    Salva un menu come template dal pulsante "💾 Salva template" per popolare la libreria.
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {tplList.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => applyTpl(t.id)}
                        className="w-full text-left px-3 py-2.5 hover:bg-amber-50 transition flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-neutral-900 truncate">{t.nome}</div>
                          <div className="text-xs text-neutral-500 flex flex-wrap gap-x-2">
                            {t.service_type_name && (
                              <span className="text-amber-700">🍽️ {t.service_type_name}</span>
                            )}
                            <span>{t.n_righe || 0} righ{t.n_righe === 1 ? "a" : "e"}</span>
                            {t.prezzo_persona > 0 && (
                              <span>€ {parseFloat(t.prezzo_persona).toFixed(2)}/pax</span>
                            )}
                          </div>
                          {t.descrizione && (
                            <div className="text-[11px] text-neutral-400 truncate mt-0.5">{t.descrizione}</div>
                          )}
                        </div>
                        <span className="text-xs text-amber-700 self-center">Applica →</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
