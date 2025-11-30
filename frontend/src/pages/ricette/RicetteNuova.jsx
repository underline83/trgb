// @version: v1.3-ricette-nuova
// Nuova Ricetta — base: info + collegamento ingredienti (foodcost.db)

import React, { useEffect, useState } from "react";
import { API_BASE } from "../../config/api";

export default function RicetteNuova() {
  const [ingredienti, setIngredienti] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [ricetta, setRicetta] = useState({
    name: "",
    category: "",
    yield_qty: "",
    yield_unit: "porzioni",
    notes: "",
    items: [],
  });

  // ─────────────────────────────────────────────
  // CARICAMENTO INGREDIENTI DAL BACKEND
  // ─────────────────────────────────────────────
  const loadIngredienti = async () => {
    setErrorMsg("");
    try {
      const resp = await fetch(`${API_BASE}/foodcost/ingredients`);
      if (!resp.ok) {
        const txt = await resp.text();
        console.error("Errore /foodcost/ingredients:", resp.status, txt);
        throw new Error("Errore caricamento ingredienti");
      }
      const data = await resp.json();
      setIngredienti(data || []);
    } catch (err) {
      console.error("Errore caricamento ingredienti:", err);
      setErrorMsg("Impossibile caricare gli ingredienti (vedi console backend).");
    }
  };

  useEffect(() => {
    loadIngredienti();
  }, []);

  // ─────────────────────────────────────────────
  // HANDLER CAMPI BASE
  // ─────────────────────────────────────────────
  const handleChange = (field, value) => {
    setRicetta((prev) => ({ ...prev, [field]: value }));
  };

  // ─────────────────────────────────────────────
  // HANDLER RIGHE INGREDIENTI
  // ─────────────────────────────────────────────
  const handleAddItem = () => {
    setRicetta((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          ingredient_id: "",
          qty: "",
          unit: "",
          note: "",
        },
      ],
    }));
  };

  const handleItemChange = (index, field, value) => {
    setRicetta((prev) => {
      const copy = [...prev.items];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, items: copy };
    });
  };

  // ─────────────────────────────────────────────
  // SALVATAGGIO RICETTA → /foodcost/ricette
  // ─────────────────────────────────────────────
  const handleSaveRicetta = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const payload = {
      name: ricetta.name.trim(),
      category: ricetta.category.trim() || null,
      yield_qty: ricetta.yield_qty ? parseFloat(ricetta.yield_qty) : null,
      yield_unit: ricetta.yield_unit || null,
      notes: ricetta.notes.trim() || null,
      items: ricetta.items
        .filter((it) => it.ingredient_id && it.qty)
        .map((it) => ({
          ingredient_id: parseInt(it.ingredient_id, 10),
          qty: parseFloat(it.qty),
          unit: it.unit || null,
          note: it.note || null,
        })),
    };

    if (!payload.name) {
      alert("Nome ricetta obbligatorio.");
      return;
    }

    console.log(">>> DEBUG RICETTA DA SALVARE", payload);

    try {
      const resp = await fetch(`${API_BASE}/foodcost/ricette`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.error("Errore salvataggio ricetta:", resp.status, txt);
        throw new Error("Errore salvataggio ricetta.");
      }

      const saved = await resp.json();
      console.log(">>> SALVATA RICETTA:", saved);
      alert("Ricetta salvata correttamente.");
      // TODO: reset form o redirect all'archivio
    } catch (err) {
      console.error("Errore salvataggio ricetta:", err);
      setErrorMsg("Errore nel salvataggio ricetta (vedi console backend).");
    }
  };

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              ✏️ Nuova ricetta
            </h1>
            <p className="text-neutral-600">
              Crea una ricetta collegando ingredienti dal database.
            </p>
          </div>
          <div className="flex gap-2 justify-center sm:justify-end">
            <button
              type="button"
              onClick={() => (window.location.href = "/ricette")}
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

        <form onSubmit={handleSaveRicetta} className="space-y-6">
          {/* DATI BASE */}
          <div className="bg-neutral-50 border border-neutral-300 rounded-2xl p-6 shadow-inner space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">
                  Nome ricetta *
                </label>
                <input
                  type="text"
                  value={ricetta.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Es. Panna Cotta"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">
                  Categoria
                </label>
                <input
                  type="text"
                  value={ricetta.category}
                  onChange={(e) => handleChange("category", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Es. DOLCE, PRIMO, SECONDO…"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">
                  Resa quantità
                </label>
                <input
                  type="number"
                  value={ricetta.yield_qty}
                  onChange={(e) => handleChange("yield_qty", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Es. 16"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-neutral-700">
                  Unità
                </label>
                <input
                  type="text"
                  value={ricetta.yield_unit}
                  onChange={(e) => handleChange("yield_unit", e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="porzioni, kg, ecc."
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-neutral-700">
                Note / descrizione
              </label>
              <textarea
                value={ricetta.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                rows={3}
                placeholder="Note operative, forno, tempi, ecc."
              />
            </div>
          </div>

          {/* INGREDIENTI COLLEGATI */}
          <div className="bg-white border border-neutral-300 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold font-playfair">
                Ingredienti della ricetta
              </h2>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-4 py-2 rounded-xl bg-amber-700 text-white text-sm font-semibold shadow hover:bg-amber-800 transition"
              >
                ➕ Aggiungi ingrediente
              </button>
            </div>

            {ricetta.items.length === 0 && (
              <p className="text-sm text-neutral-500">
                Nessun ingrediente aggiunto. Usa il pulsante qui sopra.
              </p>
            )}

            <div className="space-y-3">
              {ricetta.items.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center text-sm"
                >
                  <div className="col-span-5">
                    <select
                      value={row.ingredient_id}
                      onChange={(e) =>
                        handleItemChange(idx, "ingredient_id", e.target.value)
                      }
                      className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">— Seleziona ingrediente —</option>
                      {ingredienti.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <input
                      type="number"
                      value={row.qty}
                      onChange={(e) =>
                        handleItemChange(idx, "qty", e.target.value)
                      }
                      className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      placeholder="q.tà"
                    />
                  </div>

                  <div className="col-span-2">
                    <input
                      type="text"
                      value={row.unit}
                      onChange={(e) =>
                        handleItemChange(idx, "unit", e.target.value)
                      }
                      className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      placeholder="unità"
                    />
                  </div>

                  <div className="col-span-3">
                    <input
                      type="text"
                      value={row.note || ""}
                      onChange={(e) =>
                        handleItemChange(idx, "note", e.target.value)
                      }
                      className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      placeholder="note"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SALVA */}
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-7 py-2.5 rounded-xl bg-amber-700 text-white text-sm font-semibold shadow hover:bg-amber-800 transition"
            >
              💾 Salva ricetta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}