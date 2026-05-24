// @version: v2.0 — pagina ingredienti rifatta: lista a tutta larghezza con
// ricerca / filtri / ordinamento; form nuovo ingrediente in modale.
// Modulo: ricette
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";
import { Btn } from "../../components/ui";

const FC = `${API_BASE}/foodcost`;
const ING = `${FC}/ingredients`;
const UNITS = ["kg", "g", "L", "ml", "pz", "confezione", "vaschetta", "bottiglia"];

function fmtPrice(v) {
  if (v == null || isNaN(v)) return null;
  const n = Number(v);
  const dec = Math.abs(n) < 1 ? 4 : 2;
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: dec });
}

export default function RicetteIngredienti() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const canMatch = ["admin", "sommelier", "superadmin"].includes(role);

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // ricerca / filtri / ordinamento
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [soloPlaceholder, setSoloPlaceholder] = useState(false);
  const [senzaPrezzo, setSenzaPrezzo] = useState(false);
  const [soloSospetti, setSoloSospetti] = useState(false);
  const [mostraDisattivati, setMostraDisattivati] = useState(false);
  const [sortBy, setSortBy] = useState("nome");

  // form nuovo ingrediente (in modale)
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", category_id: "", category_name: "", default_unit: "kg",
    allergeni: "", note: "", supplier_id: "", unit_price: "", quantity: "", unit: "",
  });
  const handleChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));
  const resetForm = () => setForm({
    name: "", category_id: "", category_name: "", default_unit: "kg",
    allergeni: "", note: "", supplier_id: "", unit_price: "", quantity: "", unit: "",
  });

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

      resetForm();
      setShowForm(false);
      await loadIngredients(mostraDisattivati);
    } catch (err) {
      console.error("Errore salvataggio:", err);
      setErrorMsg("Errore nel salvataggio dell'ingrediente.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Lista filtrata + ordinata ───────────────────────────────
  const nPlaceholder = items.filter((i) => i.placeholder).length;
  const nSenzaPrezzo = items.filter((i) => i.last_price == null).length;
  const nSospetti = items.filter((i) => i.conversione_da_verificare).length;

  let visibleItems = items;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    visibleItems = visibleItems.filter((i) => (i.name || "").toLowerCase().includes(q));
  }
  if (catFilter) visibleItems = visibleItems.filter((i) => (i.category_name || "") === catFilter);
  if (soloPlaceholder) visibleItems = visibleItems.filter((i) => i.placeholder);
  if (senzaPrezzo) visibleItems = visibleItems.filter((i) => i.last_price == null);
  if (soloSospetti) visibleItems = visibleItems.filter((i) => i.conversione_da_verificare);
  visibleItems = [...visibleItems].sort((a, b) => {
    if (sortBy === "prezzo") {
      const pa = a.last_price == null ? -1 : a.last_price;
      const pb = b.last_price == null ? -1 : b.last_price;
      return pb - pa;
    }
    return (a.name || "").localeCompare(b.name || "", "it", { sensitivity: "base" });
  });

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <RicetteNav current="ingredienti" />
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-5">
          <div>
            <h1 className="text-3xl font-bold text-orange-900 font-playfair mb-1">
              Ingredienti
            </h1>
            <p className="text-sm text-neutral-600">
              {items.length} ingredienti in archivio
              {nPlaceholder > 0 && <> · <span className="text-amber-700">{nPlaceholder} da completare</span></>}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {canMatch && (
              <Btn variant="secondary" size="md" onClick={() => navigate("/ricette/matching")}>
                🔗 Matching fatture
              </Btn>
            )}
            <Btn variant="primary" size="md" onClick={() => { resetForm(); setShowForm(true); }}>
              + Nuovo ingrediente
            </Btn>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {/* TOOLBAR ricerca / filtri / ordinamento */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca ingrediente…"
            className="flex-1 min-w-[200px] border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500"
          />
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Tutte le categorie</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="nome">Ordina: nome</option>
            <option value="prezzo">Ordina: prezzo</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {nPlaceholder > 0 && (
            <button
              onClick={() => setSoloPlaceholder((v) => !v)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                soloPlaceholder
                  ? "bg-amber-100 text-amber-900 border-amber-300"
                  : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
              }`}
            >
              {soloPlaceholder ? "✓ " : ""}Da completare ({nPlaceholder})
            </button>
          )}
          {nSenzaPrezzo > 0 && (
            <button
              onClick={() => setSenzaPrezzo((v) => !v)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                senzaPrezzo
                  ? "bg-blue-100 text-blue-900 border-blue-300"
                  : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              }`}
            >
              {senzaPrezzo ? "✓ " : ""}Senza prezzo ({nSenzaPrezzo})
            </button>
          )}
          {nSospetti > 0 && (
            <button
              onClick={() => setSoloSospetti((v) => !v)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                soloSospetti
                  ? "bg-rose-100 text-rose-900 border-rose-300"
                  : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
              }`}
            >
              {soloSospetti ? "✓ " : ""}⚠ Conversione da verificare ({nSospetti})
            </button>
          )}
          <button
            onClick={() => setMostraDisattivati((v) => !v)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
              mostraDisattivati
                ? "bg-neutral-700 text-white border-neutral-700"
                : "bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100"
            }`}
          >
            {mostraDisattivati ? "✓ Disattivati" : "Disattivati"}
          </button>
          <span className="text-xs text-neutral-500 ml-auto">
            {visibleItems.length} {visibleItems.length === 1 ? "ingrediente" : "ingredienti"}
            {visibleItems.length !== items.length && ` di ${items.length}`}
          </span>
        </div>

        {/* LISTA */}
        {loadingList ? (
          <div className="py-12 text-center text-neutral-500 text-sm">Caricamento…</div>
        ) : visibleItems.length === 0 ? (
          <div className="py-12 text-center text-neutral-500 text-sm">
            Nessun ingrediente trovato.
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-2xl overflow-hidden">
            {visibleItems.map((ing) => (
              <div
                key={ing.id}
                onClick={() => navigate(`/ricette/ingredienti/${ing.id}/prezzi`)}
                className="px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-orange-50 transition"
                title="Apri la scheda dell'ingrediente"
              >
                <div className="flex-1 min-w-0">
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
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {ing.category_name || "senza categoria"} · {ing.default_unit}
                    {ing.allergeni && <> · allergeni: {ing.allergeni}</>}
                  </div>
                </div>
                <div className="text-sm text-right flex-shrink-0">
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
                </div>
                <span className="text-neutral-300 flex-shrink-0">›</span>
              </div>
            ))}
          </div>
        )}
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
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500"
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
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500"
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
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500"
                  placeholder="latte, glutine, uovo…"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-neutral-700">Note</label>
              <textarea
                value={form.note} rows={2}
                onChange={(e) => handleChange("note", e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500"
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
                  className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-orange-500"
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
