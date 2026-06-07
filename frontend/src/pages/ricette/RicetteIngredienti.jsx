// @version: v4.0 — lista ingredienti stile Cantina: chip categorie sopra,
// sidebar filtri a sinistra, tabella ordinabile. Modulo: ricette
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";
import { Btn } from "../../components/ui";
import useSortableTable from "../../hooks/useSortableTable";

const FC = `${API_BASE}/foodcost`;
const ING = `${FC}/ingredients`;
const UNITS = ["kg", "g", "L", "ml", "pz", "n", "confezione", "vaschetta", "bottiglia"];

function fmtPrice(v) {
  if (v == null || isNaN(v)) return null;
  const n = Number(v);
  const dec = Math.abs(n) < 1 ? 4 : 2;
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: dec });
}

// Checkbox di filtro nella sidebar
function FilterCheck({ label, count, checked, onChange, tone }) {
  const dot = {
    amber: "bg-amber-400", blue: "bg-blue-500", rose: "bg-rose-500", neutral: "bg-neutral-400",
  }[tone] || "bg-neutral-400";
  return (
    <label className="flex items-center gap-2 py-1 cursor-pointer text-sm text-neutral-700 hover:text-neutral-900">
      <input type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4 rounded" />
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span className="flex-1">{label}</span>
      <span className="text-xs text-neutral-400">{count}</span>
    </label>
  );
}

export default function RicetteIngredienti() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const canMatch = ["admin", "sommelier", "superadmin"].includes(role);
  const sort = useSortableTable("nome", "asc");

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // ricerca / filtri
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");        // categoria singola, "" = tutte
  const [unitFilter, setUnitFilter] = useState("");      // unità base, "" = tutte
  const [fPlaceholder, setFPlaceholder] = useState(false);
  const [fSenzaPrezzo, setFSenzaPrezzo] = useState(false);
  const [fSospetti, setFSospetti] = useState(false);
  const [mostraDisattivati, setMostraDisattivati] = useState(false);

  // form nuovo ingrediente (in modale)
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const emptyForm = {
    name: "", category_id: "", category_name: "", default_unit: "kg",
    allergeni: "", note: "", supplier_id: "", unit_price: "", quantity: "", unit: "",
  };
  const [form, setForm] = useState(emptyForm);
  const handleChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  // ─── Caricamento dati ────────────────────────────────────────
  const loadIngredients = async (inattivi) => {
    setLoadingList(true);
    setErrorMsg("");
    try {
      const resp = await apiFetch(`${ING}/${inattivi ? "?inattivi=1" : ""}`);
      if (!resp.ok) throw new Error("Errore caricamento ingredienti");
      setItems((await resp.json()) || []);
    } catch (err) {
      console.error("Errore caricamento ingredienti:", err);
      setErrorMsg("Impossibile caricare gli ingredienti.");
    } finally {
      setLoadingList(false);
    }
  };

  const loadCategories = async () => {
    try {
      const resp = await apiFetch(`${ING}/categories`);
      if (resp.ok) setCategories((await resp.json()) || []);
    } catch (err) { console.error(err); }
  };

  const loadSuppliers = async () => {
    try {
      const resp = await apiFetch(`${ING}/suppliers`);
      if (resp.ok) setSuppliers((await resp.json()) || []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    loadCategories();
    loadSuppliers();
  }, []);

  useEffect(() => {
    loadIngredients(mostraDisattivati);
  }, [mostraDisattivati]);

  // ─── Salvataggio nuovo ingrediente (+ prezzo opzionale) ──────
  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    if (!form.name.trim()) { alert("Nome ingrediente obbligatorio."); return; }
    setSaving(true);
    try {
      const respIng = await apiFetch(`${ING}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          default_unit: form.default_unit || "kg",
          category_id: form.category_id ? parseInt(form.category_id, 10) : undefined,
          category_name: form.category_name.trim() || undefined,
          allergeni: form.allergeni.trim() || undefined,
          note: form.note.trim() || undefined,
          is_active: true,
        }),
      });
      if (!respIng.ok) throw new Error(await respIng.text());
      const newIng = await respIng.json();

      if (form.supplier_id && form.unit_price) {
        await apiFetch(`${ING}/${newIng.id}/prezzi`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplier_id: parseInt(form.supplier_id, 10),
            unit_price: parseFloat(form.unit_price),
            quantity: form.quantity ? parseFloat(form.quantity) : undefined,
            unit: form.unit || newIng.default_unit,
            note: "Inserimento iniziale da UI ingredienti",
          }),
        }).catch(() => {});
      }

      setForm(emptyForm);
      setShowForm(false);
      await loadIngredients(mostraDisattivati);
    } catch (err) {
      console.error("Errore salvataggio:", err);
      setErrorMsg("Errore nel salvataggio dell'ingrediente.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Conteggi ────────────────────────────────────────────────
  const nPlaceholder = items.filter((i) => i.placeholder).length;
  const nSenzaPrezzo = items.filter((i) => i.last_price == null).length;
  const nSospetti = items.filter((i) => i.conversione_da_verificare).length;

  // Categorie con conteggio (per i chip in cima)
  const catChips = useMemo(() => {
    const m = new Map();
    for (const i of items) {
      const c = i.category_name || "Senza categoria";
      m.set(c, (m.get(c) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "it"));
  }, [items]);

  // Unità base presenti (per il select nella sidebar)
  const unitOptions = useMemo(
    () => [...new Set(items.map((i) => i.default_unit).filter(Boolean))].sort(),
    [items]
  );

  // ─── Lista filtrata + ordinata ───────────────────────────────
  const visibleItems = useMemo(() => {
    let v = items;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      v = v.filter((i) =>
        (i.name || "").toLowerCase().includes(q) ||
        (i.category_name || "").toLowerCase().includes(q) ||
        (i.last_supplier_name || "").toLowerCase().includes(q)
      );
    }
    if (catFilter) {
      v = v.filter((i) => (i.category_name || "Senza categoria") === catFilter);
    }
    if (unitFilter) v = v.filter((i) => i.default_unit === unitFilter);
    if (fPlaceholder) v = v.filter((i) => i.placeholder);
    if (fSenzaPrezzo) v = v.filter((i) => i.last_price == null);
    if (fSospetti) v = v.filter((i) => i.conversione_da_verificare);
    return sort.sortRows(v, {
      nome: (i) => (i.name || "").toLowerCase(),
      categoria: (i) => (i.category_name || "zzz").toLowerCase(),
      unita: (i) => (i.default_unit || "").toLowerCase(),
      prezzo: (i) => (i.last_price == null ? -1 : i.last_price),
    });
  }, [items, search, catFilter, unitFilter, fPlaceholder, fSenzaPrezzo, fSospetti, sort]);

  const hasFiltri = search.trim() || catFilter || unitFilter || fPlaceholder || fSenzaPrezzo || fSospetti;
  const resetFiltri = () => {
    setSearch(""); setCatFilter(""); setUnitFilter("");
    setFPlaceholder(false); setFSenzaPrezzo(false); setFSospetti(false);
  };

  return (
    <div className="min-h-screen bg-brand-cream p-4 sm:p-6 font-sans">
      <RicetteNav current="ingredienti" />
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl border border-neutral-200 mt-4 overflow-hidden">

        {/* ═══════════ HEADER ═══════════ */}
        <div className="flex flex-col sm:flex-row justify-between gap-3 px-5 sm:px-7 py-4 border-b border-neutral-200 bg-orange-50">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-orange-900 font-playfair leading-tight">
              Ingredienti
            </h1>
            <p className="text-xs text-neutral-600 mt-0.5">
              {items.length} {items.length === 1 ? "ingrediente" : "ingredienti"} in archivio
              {mostraDisattivati && " — vista disattivati"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-start">
            {canMatch && (
              <Btn variant="secondary" size="md" onClick={() => navigate("/ricette/matching")}>
                Matching fatture
              </Btn>
            )}
            <Btn variant="primary" size="md" onClick={() => { setForm(emptyForm); setShowForm(true); }}>
              + Nuovo ingrediente
            </Btn>
          </div>
        </div>

        {/* ═══════════ SIDEBAR + CONTENUTO ═══════════ */}
        <div className="flex flex-col md:flex-row">

          {/* SIDEBAR FILTRI (sinistra) */}
          <aside className="md:w-56 md:flex-shrink-0 border-b md:border-b-0 md:border-r border-neutral-200 bg-neutral-50 px-4 py-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Filtri</h2>
              {hasFiltri && (
                <button onClick={resetFiltri} className="text-[11px] font-medium text-orange-700 hover:underline">
                  Azzera
                </button>
              )}
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca…"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 mb-4"
            />

            <div className="mb-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Categorie</div>
              <div className="space-y-0.5 max-h-64 overflow-y-auto">
                <button
                  onClick={() => setCatFilter("")}
                  className={`w-full flex items-center justify-between text-sm px-2 py-1 rounded-lg transition ${
                    !catFilter ? "bg-orange-600 text-white" : "text-neutral-700 hover:bg-orange-50"
                  }`}
                >
                  <span>Tutte</span>
                  <span className={!catFilter ? "opacity-80" : "text-neutral-400"}>{items.length}</span>
                </button>
                {catChips.map(([cat, n]) => (
                  <button
                    key={cat}
                    onClick={() => setCatFilter((c) => (c === cat ? "" : cat))}
                    className={`w-full flex items-center justify-between gap-2 text-sm px-2 py-1 rounded-lg transition ${
                      catFilter === cat ? "bg-orange-600 text-white" : "text-neutral-700 hover:bg-orange-50"
                    }`}
                  >
                    <span className="truncate text-left">{cat}</span>
                    <span className={catFilter === cat ? "opacity-80" : "text-neutral-400"}>{n}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Da sistemare</div>
              <FilterCheck
                label="Da completare" count={nPlaceholder} tone="amber"
                checked={fPlaceholder} onChange={() => setFPlaceholder((v) => !v)}
              />
              <FilterCheck
                label="Senza prezzo" count={nSenzaPrezzo} tone="blue"
                checked={fSenzaPrezzo} onChange={() => setFSenzaPrezzo((v) => !v)}
              />
              <FilterCheck
                label="Conversione da verificare" count={nSospetti} tone="rose"
                checked={fSospetti} onChange={() => setFSospetti((v) => !v)}
              />
            </div>

            <div className="mb-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Unità base</div>
              <select
                value={unitFilter}
                onChange={(e) => setUnitFilter(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white"
              >
                <option value="">Tutte le unità</option>
                {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Archivio</div>
              <label className="flex items-center gap-2 py-1 cursor-pointer text-sm text-neutral-700">
                <input
                  type="checkbox" checked={mostraDisattivati}
                  onChange={() => setMostraDisattivati((v) => !v)}
                  className="w-4 h-4 rounded"
                />
                <span>Mostra disattivati</span>
              </label>
            </div>
          </aside>

          {/* CONTENUTO */}
          <div className="flex-1 min-w-0">
            <div className="px-5 sm:px-7 py-2.5 border-b border-neutral-100 flex items-center justify-between">
              <span className="text-xs text-neutral-500">
                {visibleItems.length} {visibleItems.length === 1 ? "ingrediente" : "ingredienti"}
                {visibleItems.length !== items.length && ` di ${items.length}`}
              </span>
            </div>

            {errorMsg && (
              <div className="m-5 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
                {errorMsg}
              </div>
            )}

            {loadingList ? (
              <div className="py-16 text-center text-neutral-500 text-sm">Caricamento…</div>
            ) : visibleItems.length === 0 ? (
              <div className="py-16 text-center text-neutral-500 text-sm">
                {items.length === 0
                  ? "Nessun ingrediente in archivio."
                  : "Nessun ingrediente corrisponde ai filtri."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-100 text-neutral-600 sticky top-0">
                  <tr className="text-[11px] uppercase tracking-wide select-none">
                    <th className="px-4 py-2.5 text-left cursor-pointer hover:text-orange-700" onClick={() => sort.handleSort("nome")}>
                      Ingrediente <sort.SortIcon col="nome" />
                    </th>
                    <th className="px-3 py-2.5 text-left cursor-pointer hover:text-orange-700 hidden sm:table-cell" onClick={() => sort.handleSort("categoria")}>
                      Categoria <sort.SortIcon col="categoria" />
                    </th>
                    <th className="px-3 py-2.5 text-center cursor-pointer hover:text-orange-700 w-20" onClick={() => sort.handleSort("unita")}>
                      Unità <sort.SortIcon col="unita" />
                    </th>
                    <th className="px-4 py-2.5 text-right cursor-pointer hover:text-orange-700 w-36" onClick={() => sort.handleSort("prezzo")}>
                      Ultimo prezzo <sort.SortIcon col="prezzo" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((ing) => (
                    <tr
                      key={ing.id}
                      onClick={() => navigate(`/ricette/ingredienti/${ing.id}/prezzi`)}
                      className="border-t border-neutral-100 cursor-pointer hover:bg-orange-50 transition"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-neutral-900">{ing.name}</span>
                          {ing.placeholder && (
                            <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">
                              da completare
                            </span>
                          )}
                          {ing.conversione_da_verificare && (
                            <span className="text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.5 rounded">
                              ⚠ conversione
                            </span>
                          )}
                          {!ing.is_active && (
                            <span className="text-[10px] font-semibold bg-neutral-200 text-neutral-600 px-1.5 py-0.5 rounded">
                              disattivato
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-400 mt-0.5 sm:hidden">
                          {ing.category_name || "senza categoria"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-neutral-600 hidden sm:table-cell">
                        {ing.category_name || <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center text-neutral-500">{ing.default_unit}</td>
                      <td className="px-4 py-2.5 text-right">
                        {ing.last_price != null ? (
                          <>
                            <span className="font-semibold text-neutral-900">
                              {fmtPrice(ing.last_price)} €/{ing.default_unit}
                            </span>
                            {ing.last_supplier_name && (
                              <div className="text-[11px] text-neutral-400">{ing.last_supplier_name}</div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-neutral-400 italic">senza prezzo</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ═══ MODALE NUOVO INGREDIENTE ═══ */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50 overflow-y-auto"
          onClick={() => setShowForm(false)}
        >
          <form
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-neutral-200 w-full max-w-2xl p-6 my-8 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-orange-900 font-playfair">Nuovo ingrediente</h2>
              <button type="button" onClick={() => setShowForm(false)}
                className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-neutral-700">Nome ingrediente *</label>
              <input
                type="text" value={form.name} required
                onChange={(e) => handleChange("name", e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                placeholder="Es. Panna fresca 35%"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Categoria (esistente)</label>
                <select
                  value={form.category_id}
                  onChange={(e) => handleChange("category_id", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">— Nessuna / nuova —</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Nuova categoria</label>
                <input
                  type="text" value={form.category_name}
                  onChange={(e) => handleChange("category_name", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  placeholder="Se non in elenco"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Unità di misura base</label>
                <select
                  value={form.default_unit}
                  onChange={(e) => handleChange("default_unit", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Allergeni</label>
                <input
                  type="text" value={form.allergeni}
                  onChange={(e) => handleChange("allergeni", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  placeholder="latte, glutine, uovo…"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-neutral-700">Note</label>
              <textarea
                value={form.note} rows={2}
                onChange={(e) => handleChange("note", e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                placeholder="Es. solo per dessert, prodotto bio, ecc."
              />
            </div>

            <div className="border-t border-neutral-200 pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-neutral-800">Prezzo iniziale (opzionale)</h3>
              <div className="grid grid-cols-2 gap-4">
                <select
                  value={form.supplier_id}
                  onChange={(e) => handleChange("supplier_id", e.target.value)}
                  className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">— Fornitore —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input
                  type="number" step="0.0001" value={form.unit_price}
                  onChange={(e) => handleChange("unit_price", e.target.value)}
                  className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  placeholder="Prezzo €/unità base"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" size="md" type="button" onClick={() => setShowForm(false)}>
                Annulla
              </Btn>
              <Btn variant="primary" size="md" type="submit" loading={saving}>
                {saving ? "Salvataggio…" : "Salva ingrediente"}
              </Btn>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
