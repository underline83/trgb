// @version: v2.0-ricette-nuova
// Nuova Ricetta — Food Cost v2
// Supporta: categorie DB, is_base, sub-ricette, prezzo vendita, prep_time

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";

const FC = `${API_BASE}/foodcost`;
const UNITS = ["kg", "g", "L", "ml", "cl", "pz"];

export default function RicetteNuova() {
  const navigate = useNavigate();

  // Data sources
  const [ingredienti, setIngredienti] = useState([]);
  const [basi, setBasi] = useState([]);         // sub-ricette selezionabili
  const [categorie, setCategorie] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // Form ricetta
  const [form, setForm] = useState({
    name: "",
    category_id: "",
    is_base: false,
    yield_qty: "",
    yield_unit: "porzioni",
    selling_price: "",
    prep_time: "",
    note: "",
    items: [],
  });

  // Caricamento dati
  useEffect(() => {
    const load = async () => {
      try {
        const [rIng, rBasi, rCat] = await Promise.all([
          apiFetch(`${FC}/ingredients`),
          apiFetch(`${FC}/ricette/basi`),
          apiFetch(`${FC}/ricette/categorie`),
        ]);
        if (rIng.ok) setIngredienti(await rIng.json());
        if (rBasi.ok) setBasi(await rBasi.json());
        if (rCat.ok) setCategorie(await rCat.json());
      } catch (err) {
        console.error("Errore caricamento dati:", err);
        setErrorMsg("Errore caricamento dati iniziali.");
      }
    };
    load();
  }, []);

  // Handler generici
  const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  // ─────────────────────────────────────────────
  // GESTIONE RIGHE (items)
  // ─────────────────────────────────────────────
  const addItem = (tipo) => {
    setForm((p) => ({
      ...p,
      items: [
        ...p.items,
        {
          tipo, // "ingrediente" | "sub_ricetta"
          ingredient_id: "",
          sub_recipe_id: "",
          qty: "",
          unit: "g",
          note: "",
        },
      ],
    }));
  };

  const updateItem = (idx, field, value) => {
    setForm((p) => {
      const copy = [...p.items];
      copy[idx] = { ...copy[idx], [field]: value };
      return { ...p, items: copy };
    });
  };

  const removeItem = (idx) => {
    setForm((p) => ({
      ...p,
      items: p.items.filter((_, i) => i !== idx),
    }));
  };

  const moveItem = (idx, dir) => {
    setForm((p) => {
      const items = [...p.items];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= items.length) return p;
      [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
      return { ...p, items };
    });
  };

  // ─────────────────────────────────────────────
  // SALVATAGGIO
  // ─────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!form.name.trim()) {
      setErrorMsg("Nome ricetta obbligatorio.");
      return;
    }
    if (!form.yield_qty || parseFloat(form.yield_qty) <= 0) {
      setErrorMsg("Resa quantit\u00E0 obbligatoria e > 0.");
      return;
    }
    if (form.items.length === 0) {
      setErrorMsg("Aggiungi almeno un ingrediente o sub-ricetta.");
      return;
    }

    // Mappa items per il backend
    const items = form.items
      .filter((it) => (it.tipo === "ingrediente" ? it.ingredient_id : it.sub_recipe_id) && it.qty)
      .map((it) => ({
        ingredient_id: it.tipo === "ingrediente" ? parseInt(it.ingredient_id) : null,
        sub_recipe_id: it.tipo === "sub_ricetta" ? parseInt(it.sub_recipe_id) : null,
        qty: parseFloat(it.qty),
        unit: it.unit || "g",
        note: it.note || null,
      }));

    if (items.length === 0) {
      setErrorMsg("Nessuna riga valida. Compila almeno un ingrediente con quantit\u00E0.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      category_id: form.category_id ? parseInt(form.category_id) : null,
      is_base: form.is_base,
      yield_qty: parseFloat(form.yield_qty),
      yield_unit: form.yield_unit || "porzioni",
      selling_price: form.selling_price ? parseFloat(form.selling_price) : null,
      prep_time: form.prep_time ? parseInt(form.prep_time) : null,
      note: form.note.trim() || null,
      items,
    };

    setSaving(true);
    try {
      const resp = await apiFetch(`${FC}/ricette`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt);
      }

      const saved = await resp.json();
      navigate(`/ricette/${saved.id}`);
    } catch (err) {
      console.error("Errore salvataggio:", err);
      setErrorMsg(`Errore nel salvataggio: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <RicetteNav current="archivio" />
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 sm:p-12 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-orange-900 tracking-wide font-playfair mb-1">
              Nuova ricetta
            </h1>
            <p className="text-neutral-600 text-sm">
              Crea una ricetta collegando ingredienti e sub-ricette. Il food cost viene calcolato automaticamente.
            </p>
          </div>
          <div className="flex gap-2 justify-center sm:justify-end">
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">

          {/* DATI BASE */}
          <div className="bg-neutral-50 border border-neutral-300 rounded-2xl p-6 shadow-inner space-y-4">
            <h2 className="text-lg font-semibold font-playfair text-neutral-800">Informazioni generali</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Nome ricetta *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="Es. Cr\u00E8me Br\u00FBl\u00E9e"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Categoria</label>
                <select
                  value={form.category_id}
                  onChange={(e) => set("category_id", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  <option value="">— Nessuna —</option>
                  {categorie.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Resa (q.t\u00E0) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.yield_qty}
                  onChange={(e) => set("yield_qty", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="16"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Unit\u00E0 resa</label>
                <input
                  type="text"
                  value={form.yield_unit}
                  onChange={(e) => set("yield_unit", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="porzioni, kg, L..."
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Prezzo vendita (\u20AC)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.selling_price}
                  onChange={(e) => set("selling_price", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="12.00"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Tempo prep. (min)</label>
                <input
                  type="number"
                  min="0"
                  value={form.prep_time}
                  onChange={(e) => set("prep_time", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="45"
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_base}
                  onChange={(e) => set("is_base", e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-orange-700 focus:ring-orange-500"
                />
                <span className="text-sm text-neutral-700 font-medium">
                  Ricetta base (utilizzabile come sub-ricetta)
                </span>
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-neutral-700">Note</label>
              <textarea
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                rows={2}
                placeholder="Note operative, forno, tempi, consigli..."
              />
            </div>
          </div>

          {/* INGREDIENTI / SUB-RICETTE */}
          <div className="bg-white border border-neutral-300 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold font-playfair text-neutral-800">
                Composizione ricetta
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => addItem("ingrediente")}
                  className="px-3 py-1.5 rounded-lg bg-orange-700 text-white text-xs font-semibold shadow hover:bg-orange-800 transition"
                >
                  + Ingrediente
                </button>
                <button
                  type="button"
                  onClick={() => addItem("sub_ricetta")}
                  className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold shadow hover:bg-blue-800 transition"
                >
                  + Sub-ricetta
                </button>
              </div>
            </div>

            {form.items.length === 0 && (
              <p className="text-sm text-neutral-500 py-4 text-center">
                Nessun ingrediente aggiunto. Usa i pulsanti qui sopra.
              </p>
            )}

            <div className="space-y-2">
              {form.items.map((row, idx) => (
                <div
                  key={idx}
                  className={`flex flex-wrap items-center gap-2 p-3 rounded-xl border text-sm ${
                    row.tipo === "sub_ricetta"
                      ? "bg-blue-50/50 border-blue-200"
                      : "bg-neutral-50 border-neutral-200"
                  }`}
                >
                  {/* Indicatore tipo */}
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    row.tipo === "sub_ricetta"
                      ? "bg-blue-200 text-blue-800"
                      : "bg-orange-200 text-orange-800"
                  }`}>
                    {row.tipo === "sub_ricetta" ? "SUB" : "ING"}
                  </span>

                  {/* Selettore */}
                  <div className="flex-1 min-w-[200px]">
                    {row.tipo === "ingrediente" ? (
                      <select
                        value={row.ingredient_id}
                        onChange={(e) => updateItem(idx, "ingredient_id", e.target.value)}
                        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      >
                        <option value="">— Seleziona ingrediente —</option>
                        {ingredienti.map((ing) => (
                          <option key={ing.id} value={ing.id}>
                            {ing.name} ({ing.default_unit})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={row.sub_recipe_id}
                        onChange={(e) => updateItem(idx, "sub_recipe_id", e.target.value)}
                        className="w-full border border-blue-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">— Seleziona ricetta base —</option>
                        {basi.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} (resa: {b.yield_qty} {b.yield_unit})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Quantit\u00E0 */}
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={row.qty}
                    onChange={(e) => updateItem(idx, "qty", e.target.value)}
                    className="w-20 border border-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    placeholder="q.t\u00E0"
                  />

                  {/* Unit\u00E0 */}
                  <select
                    value={row.unit}
                    onChange={(e) => updateItem(idx, "unit", e.target.value)}
                    className="w-20 border border-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                    <option value="porzioni">porzioni</option>
                  </select>

                  {/* Note */}
                  <input
                    type="text"
                    value={row.note || ""}
                    onChange={(e) => updateItem(idx, "note", e.target.value)}
                    className="w-28 border border-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    placeholder="note"
                  />

                  {/* Azioni riga */}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveItem(idx, -1)}
                      className="px-1.5 py-1 text-xs border border-neutral-300 rounded hover:bg-neutral-100"
                      title="Sposta su"
                    >
                      &uarr;
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(idx, 1)}
                      className="px-1.5 py-1 text-xs border border-neutral-300 rounded hover:bg-neutral-100"
                      title="Sposta gi\u00F9"
                    >
                      &darr;
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="px-1.5 py-1 text-xs bg-red-100 text-red-700 border border-red-300 rounded hover:bg-red-200"
                      title="Rimuovi"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SALVA */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate("/ricette/archivio")}
              className="px-5 py-2.5 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 transition"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-7 py-2.5 rounded-xl bg-orange-700 text-white text-sm font-semibold shadow hover:bg-orange-800 transition disabled:opacity-50"
            >
              {saving ? "Salvataggio..." : "Salva ricetta"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
