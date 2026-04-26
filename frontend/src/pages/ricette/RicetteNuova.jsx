// @version: v3.0 — Riorganizzato + ingredienti opzionali (sessione 58 cont., 2026-04-26)
//
// Nuova Ricetta — Food Cost v2.
// Cambiamenti rispetto a v2.1:
//   - Ingredienti OPZIONALI: si puo' creare un piatto "placeholder" senza
//     scheda compilata, utile per piatti che entrano in menu carta o menu
//     pranzo senza ricetta dettagliata (decisione Marco, S58 cont.).
//   - Form riorganizzato in 5 sezioni nette:
//       1. Anagrafica
//       2. Nome cliente & menu (solo se NON e' ricetta base)
//       3. Resa & prezzo
//       4. Composizione (opzionale)
//       5. Note interne
//   - Palette allineata al modulo: bg-neutral-50 + orange-100/-900 per gli
//     stati attivi. Niente amber/shadow-inner (era off-pattern).

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";
import Tooltip from "../../components/Tooltip";
import { Btn } from "../../components/ui";

const FC = `${API_BASE}/foodcost`;
const UNITS = ["kg", "g", "L", "ml", "cl", "pz"];

// ─────────────────────────────────────────────────────────────
// Section wrapper — coerente con RicetteSettings
// ─────────────────────────────────────────────────────────────
function Section({ title, hint, children, accent = "neutral" }) {
  const accentMap = {
    neutral: "border-neutral-200",
    orange: "border-orange-200 bg-orange-50/40",
  };
  return (
    <section className={`bg-neutral-50 border ${accentMap[accent]} rounded-xl p-5 space-y-4`}>
      <div>
        <h2 className="text-base font-semibold text-orange-900 font-playfair">{title}</h2>
        {hint && <p className="text-xs text-neutral-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, required, children, span = 1 }) {
  const colSpan = span === 2 ? "sm:col-span-2" : "";
  return (
    <div className={`space-y-1 ${colSpan}`}>
      <label className="text-xs font-medium text-neutral-700 uppercase tracking-wide">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-neutral-500">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500";

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────
export default function RicetteNuova() {
  const navigate = useNavigate();

  // Data sources
  const [ingredienti, setIngredienti] = useState([]);
  const [basi, setBasi] = useState([]);
  const [categorie, setCategorie] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // Form
  const [form, setForm] = useState({
    name: "",
    category_id: "",
    is_base: false,
    yield_qty: "1",
    yield_unit: "porzioni",
    selling_price: "",
    prep_time: "",
    note: "",
    menu_name: "",
    menu_description: "",
    service_type_ids: [],
    items: [],
  });

  // Caricamento dati
  useEffect(() => {
    const load = async () => {
      try {
        const [rIng, rBasi, rCat, rSt] = await Promise.all([
          apiFetch(`${FC}/ingredients/`),
          apiFetch(`${FC}/ricette/basi`),
          apiFetch(`${FC}/ricette/categorie`),
          apiFetch(`${FC}/service-types`),
        ]);
        if (rIng.ok) setIngredienti(await rIng.json());
        if (rBasi.ok) setBasi(await rBasi.json());
        if (rCat.ok) setCategorie(await rCat.json());
        if (rSt.ok) setServiceTypes(await rSt.json());
      } catch (err) {
        console.error("Errore caricamento dati:", err);
        setErrorMsg("Errore caricamento dati iniziali.");
      }
    };
    load();
  }, []);

  const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const toggleServiceType = (stId) => {
    setForm((p) => {
      const ids = p.service_type_ids || [];
      return {
        ...p,
        service_type_ids: ids.includes(stId)
          ? ids.filter((x) => x !== stId)
          : [...ids, stId],
      };
    });
  };

  // ── Items ──
  const addItem = (tipo) => {
    setForm((p) => ({
      ...p,
      items: [
        ...p.items,
        { tipo, ingredient_id: "", sub_recipe_id: "", qty: "", unit: "g", note: "" },
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
  const removeItem = (idx) =>
    setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  const moveItem = (idx, dir) => {
    setForm((p) => {
      const items = [...p.items];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= items.length) return p;
      [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
      return { ...p, items };
    });
  };

  // ─────────────────────────────────────────────────────────────
  // SALVATAGGIO
  // ─────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!form.name.trim()) {
      setErrorMsg("Nome ricetta obbligatorio.");
      return;
    }

    // Resa: se vuota usa default 1 porzione (placeholder-friendly)
    const yieldQty = form.yield_qty ? parseFloat(form.yield_qty) : 1;
    if (yieldQty <= 0) {
      setErrorMsg("La resa, se valorizzata, deve essere maggiore di zero.");
      return;
    }

    // Items: solo righe valide passano. Lista vuota = piatto placeholder.
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
      yield_qty: yieldQty,
      yield_unit: (form.yield_unit || "porzioni").trim(),
      selling_price: form.selling_price ? parseFloat(form.selling_price) : null,
      prep_time: form.prep_time ? parseInt(form.prep_time) : null,
      note: form.note.trim() || null,
      menu_name: form.menu_name?.trim() || null,
      menu_description: form.menu_description?.trim() || null,
      kind: form.is_base ? "base" : "dish",
      service_type_ids: form.service_type_ids || [],
      items,
    };

    setSaving(true);
    try {
      const resp = await apiFetch(`${FC}/ricette`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const saved = await resp.json();
      navigate(`/ricette/${saved.id}`);
    } catch (err) {
      console.error("Errore salvataggio:", err);
      setErrorMsg(`Errore nel salvataggio: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const isPlaceholder = form.items.length === 0;

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <RicetteNav current="archivio" />
      <div className="min-h-screen bg-brand-cream font-sans">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="bg-white shadow-2xl rounded-3xl p-6 sm:p-8 border border-neutral-200">

            {/* HEADER */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-orange-900 font-playfair">Nuova ricetta</h1>
                <p className="text-sm text-neutral-500 mt-0.5">
                  Compila i campi essenziali. La composizione e' opzionale: puoi salvare un piatto come
                  <span className="font-medium"> placeholder</span> per usarlo nei menu senza scheda.
                </p>
              </div>
              <Btn variant="ghost" size="sm" type="button" onClick={() => navigate("/ricette/archivio")}>
                ← Archivio
              </Btn>
            </div>

            {errorMsg && (
              <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-5">

              {/* ─────────────────────────────────────────
                  1. ANAGRAFICA
                  ─────────────────────────────────────── */}
              <Section title="1. Anagrafica" hint="Identita' interna della ricetta — solo cucina la vede.">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Nome interno" required span={2}>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                      className={inputCls}
                      placeholder="Es. Tartare di manzo Cantabrico v3"
                      required
                      autoFocus
                    />
                  </Field>
                  <Field label="Categoria">
                    <select
                      value={form.category_id}
                      onChange={(e) => set("category_id", e.target.value)}
                      className={inputCls}
                    >
                      <option value="">— Nessuna —</option>
                      {categorie.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={form.is_base}
                    onChange={(e) => set("is_base", e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-300 text-orange-700 focus:ring-orange-500"
                  />
                  <span className="text-sm text-neutral-700">
                    Ricetta <strong>base</strong> (sub-ricetta riusabile, es. fondo, salsa, brodo)
                  </span>
                </label>
              </Section>

              {/* ─────────────────────────────────────────
                  2. NOME CLIENTE & MENU (solo se non base)
                  ─────────────────────────────────────── */}
              {!form.is_base && (
                <Section
                  title="2. Nome cliente & menu"
                  hint="Come il piatto appare al cliente (carta, menu pranzo, preventivi). Queste informazioni sono opzionali."
                  accent="orange"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label="Nome menu"
                      hint={`Sovrascrive il nome interno sul menu cliente. Se vuoto: "${form.name || "nome interno"}"`}
                    >
                      <input
                        type="text"
                        value={form.menu_name}
                        onChange={(e) => set("menu_name", e.target.value)}
                        className={inputCls}
                        placeholder="Es. La Tartare dell'Oste"
                      />
                    </Field>
                    <Field label="Descrizione menu" hint="Allergeni, presentazione, ingredienti chiave.">
                      <textarea
                        value={form.menu_description}
                        onChange={(e) => set("menu_description", e.target.value)}
                        className={inputCls}
                        rows={2}
                      />
                    </Field>
                  </div>

                  <Field
                    label="Tipi servizio"
                    hint="Spunta i contesti dove questo piatto puo' apparire. Es. 'Pranzo di lavoro' lo aggiunge al pool del modulo Menu Pranzo."
                  >
                    {serviceTypes.length === 0 ? (
                      <p className="text-xs text-neutral-500 italic">
                        Nessun tipo servizio configurato. Vai in Impostazioni Cucina · Tipi Servizio.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {serviceTypes.filter((s) => s.active).map((st) => {
                          const selected = (form.service_type_ids || []).includes(st.id);
                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => toggleServiceType(st.id)}
                              className={
                                "px-3 py-1.5 rounded-full text-xs font-medium transition border " +
                                (selected
                                  ? "bg-orange-100 border-orange-300 text-orange-900 shadow-sm"
                                  : "bg-white border-neutral-300 text-neutral-700 hover:bg-orange-50")
                              }
                            >
                              {selected ? "✓ " : ""}{st.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </Field>
                </Section>
              )}

              {/* ─────────────────────────────────────────
                  3. RESA & PREZZO
                  ─────────────────────────────────────── */}
              <Section
                title={form.is_base ? "2. Resa" : "3. Resa & prezzo"}
                hint="Default 1 porzione: cambia se la ricetta produce piu' porzioni o un peso (per il food cost). Per i placeholder lascia 1."
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Field label="Resa (q.tà)">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={form.yield_qty}
                      onChange={(e) => set("yield_qty", e.target.value)}
                      className={inputCls}
                      placeholder="1"
                    />
                  </Field>
                  <Field label="Unità">
                    <input
                      type="text"
                      value={form.yield_unit}
                      onChange={(e) => set("yield_unit", e.target.value)}
                      className={inputCls}
                      placeholder="porzioni"
                    />
                  </Field>
                  {!form.is_base && (
                    <Field label="Prezzo vendita (€)">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.selling_price}
                        onChange={(e) => set("selling_price", e.target.value)}
                        className={inputCls}
                        placeholder="—"
                      />
                    </Field>
                  )}
                  <Field label="Tempo prep. (min)">
                    <input
                      type="number"
                      min="0"
                      value={form.prep_time}
                      onChange={(e) => set("prep_time", e.target.value)}
                      className={inputCls}
                      placeholder="—"
                    />
                  </Field>
                </div>
              </Section>

              {/* ─────────────────────────────────────────
                  4. COMPOSIZIONE (opzionale)
                  ─────────────────────────────────────── */}
              <Section
                title={form.is_base ? "3. Composizione (opzionale)" : "4. Composizione (opzionale)"}
                hint="Lascia vuoto per piatti placeholder. Compila per attivare il calcolo food cost."
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-neutral-600">
                    {isPlaceholder ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full bg-orange-50 border border-orange-200 text-orange-800">
                        ⚠ Piatto placeholder — nessuna scheda
                      </span>
                    ) : (
                      <>{form.items.length} {form.items.length === 1 ? "riga" : "righe"}</>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Btn variant="ghost" size="sm" type="button" onClick={() => addItem("ingrediente")}>+ Ingrediente</Btn>
                    <Btn variant="ghost" size="sm" type="button" onClick={() => addItem("sub_ricetta")}>+ Sub-ricetta</Btn>
                  </div>
                </div>

                {form.items.length > 0 && (
                  <div className="space-y-2">
                    {form.items.map((row, idx) => (
                      <div
                        key={idx}
                        className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-neutral-200 bg-white text-sm"
                      >
                        <span className={
                          "text-[10px] font-bold px-1.5 py-0.5 rounded " +
                          (row.tipo === "sub_ricetta"
                            ? "bg-blue-100 text-blue-800 border border-blue-200"
                            : "bg-orange-100 text-orange-800 border border-orange-200")
                        }>
                          {row.tipo === "sub_ricetta" ? "SUB" : "ING"}
                        </span>

                        <div className="flex-1 min-w-[200px]">
                          {row.tipo === "ingrediente" ? (
                            <select
                              value={row.ingredient_id}
                              onChange={(e) => updateItem(idx, "ingredient_id", e.target.value)}
                              className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm"
                            >
                              <option value="">— ingrediente —</option>
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
                              className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm"
                            >
                              <option value="">— sub-ricetta —</option>
                              {basi.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name} (resa: {b.yield_qty} {b.yield_unit})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={row.qty}
                          onChange={(e) => updateItem(idx, "qty", e.target.value)}
                          className="w-20 border border-neutral-300 rounded px-2 py-1.5 text-sm"
                          placeholder="q.tà"
                        />
                        <select
                          value={row.unit}
                          onChange={(e) => updateItem(idx, "unit", e.target.value)}
                          className="w-20 border border-neutral-300 rounded px-2 py-1.5 text-sm"
                        >
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          <option value="porzioni">porzioni</option>
                        </select>
                        <input
                          type="text"
                          value={row.note || ""}
                          onChange={(e) => updateItem(idx, "note", e.target.value)}
                          className="w-28 border border-neutral-300 rounded px-2 py-1.5 text-sm"
                          placeholder="note"
                        />
                        <div className="flex gap-0.5">
                          <Tooltip label="Sposta su">
                            <button type="button" onClick={() => moveItem(idx, -1)}
                              className="px-1.5 py-1 text-xs border border-neutral-300 rounded hover:bg-neutral-100">↑</button>
                          </Tooltip>
                          <Tooltip label="Sposta giù">
                            <button type="button" onClick={() => moveItem(idx, +1)}
                              className="px-1.5 py-1 text-xs border border-neutral-300 rounded hover:bg-neutral-100">↓</button>
                          </Tooltip>
                          <Tooltip label="Rimuovi">
                            <button type="button" onClick={() => removeItem(idx)}
                              className="px-1.5 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100">×</button>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* ─────────────────────────────────────────
                  5. NOTE
                  ─────────────────────────────────────── */}
              <Section title={form.is_base ? "4. Note interne" : "5. Note interne"} hint="Solo cucina. Tempi forno, allergeni operativi, consigli, ecc.">
                <textarea
                  value={form.note}
                  onChange={(e) => set("note", e.target.value)}
                  className={inputCls}
                  rows={3}
                  placeholder="Note operative, forno, tempi, consigli..."
                />
              </Section>

              {/* FOOTER AZIONI */}
              <div className="flex justify-end gap-3 pt-2">
                <Btn variant="ghost" size="md" type="button" onClick={() => navigate("/ricette/archivio")}>
                  Annulla
                </Btn>
                <Btn size="md" type="submit" disabled={saving} loading={saving}>
                  {saving ? "Salvataggio…" : (isPlaceholder ? "Salva piatto placeholder" : "Salva ricetta")}
                </Btn>
              </div>

            </form>
          </div>
        </div>
      </div>
    </>
  );
}
