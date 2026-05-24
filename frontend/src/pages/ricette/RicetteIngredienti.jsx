// @version: v3.0 — lista ingredienti in stile TRGB: testa + KPI-filtro + toolbar + lista.
// Modulo: ricette
import React, { useEffect, useMemo, useState } from "react";
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

// Card KPI cliccabile che fa anche da filtro rapido.
function StatCard({ label, value, tone, active, onClick }) {
  const tones = {
    neutral: { on: "bg-neutral-800 text-white border-neutral-800", off: "bg-white text-neutral-900 border-neutral-200 hover:border-neutral-300" },
    amber: { on: "bg-amber-500 text-white border-amber-500", off: "bg-amber-50 text-amber-800 border-amber-200 hover:border-amber-300" },
    blue: { on: "bg-blue-600 text-white border-blue-600", off: "bg-blue-50 text-blue-800 border-blue-200 hover:border-blue-300" },
    rose: { on: "bg-rose-600 text-white border-rose-600", off: "bg-rose-50 text-rose-800 border-rose-200 hover:border-rose-300" },
  };
  const c = tones[tone] || tones.neutral;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border p-3 transition ${active ? c.on : c.off}`}
    >
      <div className="text-2xl font-bold leading-none">{value}</div>
      <div className={`text-[11px] mt-1 ${active ? "opacity-90" : "opacity-80"}`}>{label}</div>
    </button>
  );
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
  const [quickFilter, setQuickFilter] = useState(""); // "" | placeholder | senzaPrezzo | sospetti
  const [mostraDisattivati, setMostraDisattivati] = useState(false);
  const [sortBy, setSortBy] = useState("nome");

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
    if (catFilter) v = v.filter((i) => (i.category_name || "") === catFilter);
    if (quickFilter === "placeholder") v = v.filter((i) => i.placeholder);
    if (quickFilter === "senzaPrezzo") v = v.filter((i) => i.last_price == null);
    if (quickFilter === "sospetti") v = v.filter((i) => i.conversione_da_verificare);
    v = [...v].sort((a, b) => {
      if (sortBy === "prezzo") {
        const pa = a.last_price == null ? -1 : a.last_price;
        const pb = b.last_price == null ? -1 : b.last_price;
        return pb - pa;
      }
      if (sortBy === "categoria") {
        return (a.category_name || "zzz").localeCompare(b.category_name || "zzz", "it") ||
          (a.name || "").localeCompare(b.name || "", "it");
      }
      return (a.name || "").localeCompare(b.name || "", "it", { sensitivity: "base" });
    });
    return v;
  }, [items, search, catFilter, quickFilter, sortBy]);

  const toggleQuick = (f) => setQuickFilter((cur) => (cur === f ? "" : f));
  const hasFiltri = search.trim() || catFilter || quickFilter;

  return (
    <div className="min-h-screen bg-brand-cream p-4 sm:p-6 font-sans">
      <RicetteNav current="ingredienti" />
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl border border-neutral-200 mt-4 overflow-hidden border-l-4 border-l-orange-400">

        {/* ═══════════ TESTA ═══════════ */}
        <div className="bg-orange-50 border-b border-neutral-200 px-5 sm:px-8 pt-5 pb-5">
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-orange-900 font-playfair leading-tight">
                Ingredienti
              </h1>
              <p className="text-xs text-neutral-600 mt-1">
                {items.length} {items.length === 1 ? "ingrediente" : "ingredienti"} in archivio
                {mostraDisattivati && " — vista disattivati"}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
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

          {/* KPI / filtri rapidi */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
            <StatCard
              label="Tutti gli ingredienti" value={items.length} tone="neutral"
              active={!quickFilter} onClick={() => setQuickFilter("")}
            />
            <StatCard
              label="Da completare" value={nPlaceholder} tone="amber"
              active={quickFilter === "placeholder"} onClick={() => toggleQuick("placeholder")}
            />
            <StatCard
              label="Senza prezzo" value={nSenzaPrezzo} tone="blue"
              active={quickFilter === "senzaPrezzo"} onClick={() => toggleQuick("senzaPrezzo")}
            />
            <StatCard
              label="Conversione da verificare" value={nSospetti} tone="rose"
              active={quickFilter === "sospetti"} onClick={() => toggleQuick("sospetti")}
            />
          </div>
        </div>

        {/* ═══════════ TOOLBAR ═══════════ */}
        <div className="px-5 sm:px-8 py-4 border-b border-neutral-100 bg-white">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per nome, categoria o fornitore…"
                className="w-full border border-neutral-300 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-sm"
                  aria-label="Pulisci ricerca"
                >×</button>
              )}
            </div>
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
              <option value="categoria">Ordina: categoria</option>
              <option value="prezzo">Ordina: prezzo</option>
            </select>
            <button
              onClick={() => setMostraDisattivati((v) => !v)}
              className={`text-sm font-medium px-3 py-2 rounded-lg border transition ${
                mostraDisattivati
                  ? "bg-neutral-800 text-white border-neutral-800"
                  : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50"
              }`}
            >
              {mostraDisattivati ? "✓ Disattivati" : "Disattivati"}
            </button>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-neutral-500">
              {visibleItems.length} {visibleItems.length === 1 ? "ingrediente" : "ingredienti"}
              {visibleItems.length !== items.length && ` di ${items.length}`}
            </span>
            {hasFiltri && (
              <button
                onClick={() => { setSearch(""); setCatFilter(""); setQuickFilter(""); }}
                className="text-xs font-medium text-orange-700 hover:underline"
              >
                Azzera filtri
              </button>
            )}
          </div>
        </div>

        {/* ═══════════ LISTA ═══════════ */}
        <div className="px-5 sm:px-8 py-5">
          {errorMsg && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          {loadingList ? (
            <div className="py-12 text-center text-neutral-500 text-sm">Caricamento…</div>
          ) : visibleItems.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 text-sm">
              {items.length === 0
                ? "Nessun ingrediente in archivio."
                : "Nessun ingrediente corrisponde ai filtri."}
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
                      {ing.category_name || "senza categoria"} · unità {ing.default_unit}
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
