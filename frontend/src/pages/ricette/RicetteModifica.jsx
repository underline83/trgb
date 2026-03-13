// @version: v2.0-ricette-modifica
// Modifica Ricetta — carica dati esistenti e salva con PUT
// Supporta ingredienti + sub-ricette come RicetteNuova

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";

const FC = `${API_BASE}/foodcost`;
const UNITS = ["kg", "g", "L", "ml", "cl", "pz"];

export default function RicetteModifica() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ingredienti, setIngredienti] = useState([]);
  const [basi, setBasi] = useState([]);
  const [categorie, setCategorie] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);

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

  // Caricamento iniziale
  useEffect(() => {
    const load = async () => {
      try {
        const [rIng, rBasi, rCat, rRicetta] = await Promise.all([
          apiFetch(`${FC}/ingredients`),
          apiFetch(`${FC}/ricette/basi`),
          apiFetch(`${FC}/ricette/categorie`),
          apiFetch(`${FC}/ricette/${id}`),
        ]);

        if (rIng.ok) setIngredienti(await rIng.json());
        if (rBasi.ok) setBasi(await rBasi.json());
        if (rCat.ok) setCategorie(await rCat.json());

        if (!rRicetta.ok) throw new Error("Ricetta non trovata");
        const r = await rRicetta.json();

        // Popola form con dati esistenti
        setForm({
          name: r.name || "",
          category_id: r.category_id ? String(r.category_id) : "",
          is_base: r.is_base || false,
          yield_qty: r.yield_qty != null ? String(r.yield_qty) : "",
          yield_unit: r.yield_unit || "porzioni",
          selling_price: r.selling_price != null ? String(r.selling_price) : "",
          prep_time: r.prep_time != null ? String(r.prep_time) : "",
          note: r.note || "",
          items: (r.items || []).map((it) => ({
            tipo: it.sub_recipe_id ? "sub_ricetta" : "ingrediente",
            ingredient_id: it.ingredient_id ? String(it.ingredient_id) : "",
            sub_recipe_id: it.sub_recipe_id ? String(it.sub_recipe_id) : "",
            qty: String(it.qty),
            unit: it.unit || "g",
            note: it.note || "",
          })),
        });
      } catch (err) {
        setErrorMsg(err.message);
      } finally {
        setLoadingInit(false);
      }
    };
    load();
  }, [id]);

  // Handler
  const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const addItem = (tipo) => {
    setForm((p) => ({
      ...p,
      items: [...p.items, { tipo, ingredient_id: "", sub_recipe_id: "", qty: "", unit: "g", note: "" }],
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
    setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
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

  // Salvataggio (PUT)
  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!form.name.trim()) { setErrorMsg("Nome obbligatorio."); return; }
    if (!form.yield_qty || parseFloat(form.yield_qty) <= 0) { setErrorMsg("Resa obbligatoria."); return; }

    const items = form.items
      .filter((it) => (it.tipo === "ingrediente" ? it.ingredient_id : it.sub_recipe_id) && it.qty)
      .map((it) => ({
        ingredient_id: it.tipo === "ingrediente" ? parseInt(it.ingredient_id) : null,
        sub_recipe_id: it.tipo === "sub_ricetta" ? parseInt(it.sub_recipe_id) : null,
        qty: parseFloat(it.qty),
        unit: it.unit || "g",
        note: it.note || null,
      }));

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
      const resp = await apiFetch(`${FC}/ricette/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(await resp.text());
      navigate(`/ricette/${id}`);
    } catch (err) {
      setErrorMsg(`Errore: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loadingInit) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <p className="text-neutral-500">Caricamento ricetta...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <RicetteNav current="archivio" />
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 sm:p-12 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-1">
              Modifica ricetta
            </h1>
            <p className="text-neutral-600 text-sm">
              Modifica "{form.name}" e ricalcola il food cost.
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

          {/* DATI BASE — stessa struttura di RicetteNuova */}
          <div className="bg-neutral-50 border border-neutral-300 rounded-2xl p-6 shadow-inner space-y-4">
            <h2 className="text-lg font-semibold font-playfair text-neutral-800">Informazioni generali</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Nome ricetta *</label>
                <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Categoria</label>
                <select value={form.category_id} onChange={(e) => set("category_id", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
                  <option value="">— Nessuna —</option>
                  {categorie.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Resa *</label>
                <input type="number" step="0.01" min="0.01" value={form.yield_qty}
                  onChange={(e) => set("yield_qty", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Unit\u00E0 resa</label>
                <input type="text" value={form.yield_unit} onChange={(e) => set("yield_unit", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Vendita (\u20AC)</label>
                <input type="number" step="0.01" min="0" value={form.selling_price}
                  onChange={(e) => set("selling_price", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">Prep (min)</label>
                <input type="number" min="0" value={form.prep_time}
                  onChange={(e) => set("prep_time", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_base} onChange={(e) => set("is_base", e.target.checked)}
                className="w-4 h-4 rounded border-neutral-300 text-amber-700 focus:ring-amber-500" />
              <span className="text-sm text-neutral-700 font-medium">Ricetta base (sub-ricetta)</span>
            </label>

            <div className="space-y-1">
              <label className="text-sm font-medium text-neutral-700">Note</label>
              <textarea value={form.note} onChange={(e) => set("note", e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" rows={2} />
            </div>
          </div>

          {/* ITEMS */}
          <div className="bg-white border border-neutral-300 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold font-playfair text-neutral-800">Composizione ricetta</h2>
              <div className="flex gap-2">
                <button type="button" onClick={() => addItem("ingrediente")}
                  className="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold shadow hover:bg-amber-800 transition">
                  + Ingrediente
                </button>
                <button type="button" onClick={() => addItem("sub_ricetta")}
                  className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold shadow hover:bg-blue-800 transition">
                  + Sub-ricetta
                </button>
              </div>
            </div>

            {form.items.length === 0 && (
              <p className="text-sm text-neutral-500 py-4 text-center">Nessun ingrediente.</p>
            )}

            <div className="space-y-2">
              {form.items.map((row, idx) => (
                <div key={idx} className={`flex flex-wrap items-center gap-2 p-3 rounded-xl border text-sm ${
                  row.tipo === "sub_ricetta" ? "bg-blue-50/50 border-blue-200" : "bg-neutral-50 border-neutral-200"
                }`}>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    row.tipo === "sub_ricetta" ? "bg-blue-200 text-blue-800" : "bg-amber-200 text-amber-800"
                  }`}>
                    {row.tipo === "sub_ricetta" ? "SUB" : "ING"}
                  </span>

                  <div className="flex-1 min-w-[200px]">
                    {row.tipo === "ingrediente" ? (
                      <select value={row.ingredient_id} onChange={(e) => updateItem(idx, "ingredient_id", e.target.value)}
                        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500">
                        <option value="">— Seleziona —</option>
                        {ingredienti.map((ing) => (
                          <option key={ing.id} value={ing.id}>{ing.name} ({ing.default_unit})</option>
                        ))}
                      </select>
                    ) : (
                      <select value={row.sub_recipe_id} onChange={(e) => updateItem(idx, "sub_recipe_id", e.target.value)}
                        className="w-full border border-blue-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">— Seleziona base —</option>
                        {basi.map((b) => (
                          <option key={b.id} value={b.id}>{b.name} ({b.yield_qty} {b.yield_unit})</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <input type="number" step="0.001" min="0" value={row.qty}
                    onChange={(e) => updateItem(idx, "qty", e.target.value)}
                    className="w-20 border border-neutral-300 rounded-lg px-2 py-1.5" placeholder="q.t\u00E0" />

                  <select value={row.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)}
                    className="w-20 border border-neutral-300 rounded-lg px-2 py-1.5">
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    <option value="porzioni">porzioni</option>
                  </select>

                  <input type="text" value={row.note || ""} onChange={(e) => updateItem(idx, "note", e.target.value)}
                    className="w-28 border border-neutral-300 rounded-lg px-2 py-1.5" placeholder="note" />

                  <div className="flex gap-1">
                    <button type="button" onClick={() => moveItem(idx, -1)}
                      className="px-1.5 py-1 text-xs border border-neutral-300 rounded hover:bg-neutral-100">&uarr;</button>
                    <button type="button" onClick={() => moveItem(idx, 1)}
                      className="px-1.5 py-1 text-xs border border-neutral-300 rounded hover:bg-neutral-100">&darr;</button>
                    <button type="button" onClick={() => removeItem(idx)}
                      className="px-1.5 py-1 text-xs bg-red-100 text-red-700 border border-red-300 rounded hover:bg-red-200">&times;</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SALVA */}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => navigate(`/ricette/${id}`)}
              className="px-5 py-2.5 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 transition">
              Annulla
            </button>
            <button type="submit" disabled={saving}
              className="px-7 py-2.5 rounded-xl bg-amber-700 text-white text-sm font-semibold shadow hover:bg-amber-800 transition disabled:opacity-50">
              {saving ? "Salvataggio..." : "Salva modifiche"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
