/// @version: v1.3-ingredienti-ui-foodcost
// Gestione Ingredienti — foodcost.db (anagrafica + primo prezzo)

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://127.0.0.1:8000";

// Unità di misura standardizzate
const UNITS = ["kg", "g", "L", "ml", "pz", "confezione", "vaschetta", "bottiglia"];

export default function RicetteIngredienti() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  const [loadingList, setLoadingList] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // Form ingrediente + eventuale primo prezzo
  const [form, setForm] = useState({
    name: "",
    category_id: "",
    category_name: "",
    default_unit: "kg",
    allergeni: "",
    note: "",
    supplier_id: "",
    unit_price: "",
    quantity: "",
    unit: "",
  });

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // ─────────────────────────────
  //  LOAD DATA
  // ─────────────────────────────

  const loadIngredients = async () => {
    setLoadingList(true);
    setErrorMsg("");

    try {
      const resp = await fetch(`${API_BASE}/foodcost/ingredients`);
      if (!resp.ok) throw new Error("Errore caricamento ingredienti");
      const data = await resp.json();
      setItems(data || []);
    } catch (err) {
      console.error("Errore caricamento ingredienti:", err);
      setErrorMsg("Impossibile caricare gli ingredienti (vedi console backend).");
    } finally {
      setLoadingList(false);
    }
  };

  const loadCategories = async () => {
    try {
      const resp = await fetch(`${API_BASE}/foodcost/categories`);
      if (!resp.ok) return;
      const data = await resp.json();
      setCategories(data || []);
    } catch (err) {
      console.error("Errore caricamento categorie:", err);
    }
  };

  const loadSuppliers = async () => {
    try {
      const resp = await fetch(`${API_BASE}/foodcost/suppliers`);
      if (!resp.ok) return;
      const data = await resp.json();
      setSuppliers(data || []);
    } catch (err) {
      console.error("Errore caricamento fornitori:", err);
    }
  };

  useEffect(() => {
    loadIngredients();
    loadCategories();
    loadSuppliers();
  }, []);

  // ─────────────────────────────
  //  SALVATAGGIO INGREDIENTE (+ prezzo opzionale)
  // ─────────────────────────────

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const payloadIngredient = {
      name: form.name.trim(),
      default_unit: form.default_unit || "kg",
      category_id: form.category_id ? parseInt(form.category_id, 10) : undefined,
      category_name: form.category_name.trim() || undefined,
      allergeni: form.allergeni.trim() || undefined,
      note: form.note.trim() || undefined,
      is_active: true,
    };

    if (!payloadIngredient.name) {
      alert("Nome ingrediente obbligatorio.");
      return;
    }

    try {
      // 1) CREA INGREDIENTE
      const respIng = await fetch(`${API_BASE}/foodcost/ingredients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadIngredient),
      });

      if (!respIng.ok) {
        const txt = await respIng.text();
        console.error("Errore salvataggio ingrediente:", respIng.status, txt);
        throw new Error("Errore salvataggio ingrediente");
      }

      const newIng = await respIng.json();

      // 2) SE HO FORNITORE E PREZZO → CREA RECORD PREZZO
      if (form.supplier_id && form.unit_price) {
        const payloadPrice = {
          ingredient_id: newIng.id,
          supplier_id: parseInt(form.supplier_id, 10),
          unit_price: parseFloat(form.unit_price),
          quantity: form.quantity ? parseFloat(form.quantity) : undefined,
          unit: form.unit || newIng.default_unit,
          note: `Inserimento iniziale da UI ingredienti`,
        };

        const respPrice = await fetch(`${API_BASE}/foodcost/prices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadPrice),
        });

        if (!respPrice.ok) {
          const txt = await respPrice.text();
          console.error("Errore salvataggio prezzo:", respPrice.status, txt);
          // non blocco tutto, ma lo segnalo
        }
      }

      // reset form
      setForm({
        name: "",
        category_id: "",
        category_name: "",
        default_unit: "kg",
        allergeni: "",
        note: "",
        supplier_id: "",
        unit_price: "",
        quantity: "",
        unit: "",
      });

      await loadIngredients();
    } catch (err) {
      console.error("Errore generale salvataggio:", err);
      setErrorMsg("Errore nel salvataggio (vedi console backend).");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        {/* HEADER + BACK */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🧾 Ingredienti — Food Cost
            </h1>
            <p className="text-neutral-600">
              Anagrafica ingredienti collegata a fornitori e storico prezzi.
            </p>
          </div>
          <div className="flex gap-2 justify-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate("/ricette")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Torna al Menu Ricette
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* FORM NUOVO INGREDIENTE */}
          <form
            onSubmit={handleSave}
            className="bg-neutral-50 border border-neutral-300 rounded-2xl p-6 shadow-inner space-y-4"
          >
            <h2 className="text-xl font-semibold font-playfair mb-2">
              ➕ Nuovo ingrediente
            </h2>

            {/* NOME */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-neutral-700">
                Nome ingrediente *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="Es. Panna fresca 35%"
                required
              />
            </div>

            {/* CATEGORIA */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">
                  Categoria (esistente)
                </label>
                <select
                  value={form.category_id}
                  onChange={(e) => handleChange("category_id", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">— Nessuna / nuova —</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">
                  Nuova categoria (se non in elenco)
                </label>
                <input
                  type="text"
                  value={form.category_name}
                  onChange={(e) => handleChange("category_name", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Es. Latticini, Carne, Verdure…"
                />
              </div>
            </div>

            {/* UNITÀ + ALLERGENI */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">
                  Unità di misura base
                </label>
                <select
                  value={form.default_unit}
                  onChange={(e) => handleChange("default_unit", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">
                  Allergeni (testo libero)
                </label>
                <input
                  type="text"
                  value={form.allergeni}
                  onChange={(e) => handleChange("allergeni", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="latte, glutine, uovo…"
                />
              </div>
            </div>

            {/* NOTE */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-neutral-700">
                Note
              </label>
              <textarea
                value={form.note}
                onChange={(e) => handleChange("note", e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                rows={3}
                placeholder="Es. solo per dessert, prodotto bio, DOP, ecc."
              />
            </div>

            {/* BLOCCO PREZZO INIZIALE (OPZIONALE) */}
            <div className="mt-4 border-t border-neutral-300 pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-neutral-800">
                Prezzo iniziale (opzionale)
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-neutral-700">
                    Fornitore
                  </label>
                  <select
                    value={form.supplier_id}
                    onChange={(e) => handleChange("supplier_id", e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="">— Nessuno —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-neutral-700">
                    Prezzo unitario (€/unità base)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={form.unit_price}
                    onChange={(e) => handleChange("unit_price", e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="Es. 7.50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-neutral-700">
                    Quantità confezione
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={form.quantity}
                    onChange={(e) => handleChange("quantity", e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="Es. 1, 5, 10"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-neutral-700">
                    Unità confezione
                  </label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => handleChange("unit", e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="kg, L, pz… (default = unità base)"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="mt-4 px-6 py-2.5 rounded-xl bg-amber-700 text-white text-sm font-semibold shadow hover:bg-amber-800 transition"
            >
              💾 Salva ingrediente
            </button>
          </form>

          {/* LISTA INGREDIENTI */}
          <div className="bg-white border border-neutral-300 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold font-playfair">
                Archivio ingredienti
              </h2>
              {loadingList && (
                <span className="text-xs text-neutral-500">
                  Caricamento…
                </span>
              )}
            </div>

            <div className="max-h-[420px] overflow-auto divide-y divide-neutral-200">
              {items.length === 0 && !loadingList && (
                <div className="py-6 text-sm text-neutral-500 text-center">
                  Nessun ingrediente presente.
                </div>
              )}

              {items.map((ing) => (
                <div key={ing.id} className="py-3 text-sm flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="font-medium text-neutral-900">
                      {ing.name}
                    </span>
                    {ing.last_price != null && (
                      <span className="text-neutral-700">
                        {Number(ing.last_price).toFixed(2)} €/ {ing.default_unit}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-neutral-600">
                    <span>
                      {ing.category_name || "—"} · {ing.default_unit}
                    </span>
                    {!ing.is_active && (
                      <span className="text-red-500">DISATTIVATO</span>
                    )}
                  </div>
                  {ing.allergeni && (
                    <div className="text-xs text-neutral-500">
                      Allergeni: {ing.allergeni}
                    </div>
                  )}
                  {ing.note && (
                    <div className="text-xs text-neutral-500 italic">
                      {ing.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}