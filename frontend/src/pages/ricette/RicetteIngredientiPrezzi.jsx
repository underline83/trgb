// @version: v3.0 — pagina ingrediente ristrutturata
// Modulo: ricette
// Dettaglio ingrediente: completa/unisci placeholder + storico prezzi + conversioni unità.
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";
import { Btn } from "../../components/ui";

const FC = `${API_BASE}/foodcost`;
const ING = `${FC}/ingredients`;
const UNITA = ["kg", "g", "L", "ml", "cl", "pz"];
const oggi = () => new Date().toISOString().slice(0, 10);

function fmtPrezzo(v) {
  if (v == null || isNaN(v)) return "—";
  const n = Number(v);
  const dec = Math.abs(n) < 1 ? 4 : 2;
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: dec });
}

export default function RicetteIngredientiPrezzi() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [ing, setIng] = useState(null);
  const [prezzi, setPrezzi] = useState([]);
  const [conversions, setConversions] = useState([]);
  const [categorie, setCategorie] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [allIngredients, setAllIngredients] = useState([]);

  // form "completa placeholder"
  const [compl, setCompl] = useState({ name: "", category_id: "", default_unit: "kg", allergeni: "" });
  // form "unisci"
  const [mergeTarget, setMergeTarget] = useState("");
  const [merging, setMerging] = useState(false);

  // form nuovo prezzo
  const [pForm, setPForm] = useState({ supplier_id: "", unit_price: "", price_date: oggi(), note: "" });

  // conversioni
  const [showConv, setShowConv] = useState(false);
  const [conv, setConv] = useState({ from_unit: "pz", to_unit: "kg", factor: "", note: "" });

  // ─── Caricamento ────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const dResp = await apiFetch(`${ING}/${id}`);
      if (!dResp.ok) throw new Error("Ingrediente non trovato");
      const d = await dResp.json();
      setIng(d);
      setCompl({
        name: d.name || "",
        category_id: d.category_id ? String(d.category_id) : "",
        default_unit: d.default_unit || "kg",
        allergeni: d.allergeni || "",
      });

      const [pr, cv, cat, sup, ings] = await Promise.all([
        apiFetch(`${ING}/${id}/prezzi`),
        apiFetch(`${ING}/${id}/conversions`),
        apiFetch(`${ING}/categories`),
        apiFetch(`${ING}/suppliers`),
        apiFetch(`${ING}/`),
      ]);
      if (pr.ok) setPrezzi(await pr.json());
      if (cv.ok) setConversions(await cv.json());
      if (cat.ok) setCategorie(await cat.json());
      if (sup.ok) setSuppliers(await sup.json());
      if (ings.ok) setAllIngredients(await ings.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  // ─── Completa placeholder ───────────────────────────────────
  const handleCompleta = async () => {
    setError(""); setMsg("");
    if (!compl.name.trim()) { setError("Il nome è obbligatorio."); return; }
    try {
      const resp = await apiFetch(`${ING}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: compl.name.trim(),
          category_id: compl.category_id ? Number(compl.category_id) : null,
          default_unit: compl.default_unit,
          allergeni: compl.allergeni.trim() || null,
          placeholder: 0,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setMsg("Ingrediente completato — non è più un placeholder.");
      await load();
    } catch (e) {
      setError(`Errore: ${e.message}`);
    }
  };

  // ─── Unisci a un ingrediente esistente ──────────────────────
  const handleUnisci = async () => {
    if (!mergeTarget) { setError("Scegli l'ingrediente su cui unire."); return; }
    const tgt = allIngredients.find((a) => String(a.id) === String(mergeTarget));
    if (!window.confirm(
      `Unire "${ing.name}" in "${tgt ? tgt.name : "?"}"?\n\n` +
      `Le voci ricetta verranno spostate e "${ing.name}" verrà eliminato.`
    )) return;
    setMerging(true); setError("");
    try {
      const resp = await apiFetch(`${ING}/${id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: Number(mergeTarget) }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const r = await resp.json();
      navigate(`/ricette/ingredienti/${r.target_id}/prezzi`);
    } catch (e) {
      setError(`Errore unione: ${e.message}`);
      setMerging(false);
    }
  };

  // ─── Prezzi ─────────────────────────────────────────────────
  const handleAddPrezzo = async () => {
    setError(""); setMsg("");
    if (!pForm.supplier_id || !pForm.unit_price) {
      setError("Scegli il fornitore e inserisci il prezzo.");
      return;
    }
    try {
      const resp = await apiFetch(`${ING}/${id}/prezzi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: Number(pForm.supplier_id),
          unit_price: parseFloat(pForm.unit_price),
          price_date: pForm.price_date || null,
          note: pForm.note.trim() || null,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setPForm({ supplier_id: "", unit_price: "", price_date: oggi(), note: "" });
      await load();
    } catch (e) {
      setError(`Errore: ${e.message}`);
    }
  };

  const handleDelPrezzo = async (pid) => {
    if (!window.confirm("Eliminare questo prezzo dallo storico?")) return;
    await apiFetch(`${ING}/prezzi/${pid}`, { method: "DELETE" });
    await load();
  };

  // ─── Conversioni ────────────────────────────────────────────
  const handleAddConv = async () => {
    if (!conv.factor || parseFloat(conv.factor) <= 0) {
      setError("Inserisci un fattore di conversione valido.");
      return;
    }
    try {
      const resp = await apiFetch(`${ING}/${id}/conversions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_unit: conv.from_unit,
          to_unit: conv.to_unit,
          factor: parseFloat(conv.factor),
          note: conv.note.trim() || null,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setConv({ from_unit: "pz", to_unit: "kg", factor: "", note: "" });
      await load();
    } catch (e) {
      setError(`Errore: ${e.message}`);
    }
  };

  const handleDelConv = async (cid) => {
    if (!window.confirm("Eliminare questa conversione?")) return;
    await apiFetch(`${ING}/conversions/${cid}`, { method: "DELETE" });
    await load();
  };

  // ─── Derivati ───────────────────────────────────────────────
  const ultimoPrezzo = prezzi.length ? prezzi[0].unit_price : null;
  const mediaPrezzo = prezzi.length
    ? prezzi.reduce((s, p) => s + (p.unit_price || 0), 0) / prezzi.length
    : null;
  const isPlaceholder = ing && ing.placeholder;

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-cream">
        <RicetteNav current="ingredienti" />
        <div className="text-center py-20 text-neutral-500">Caricamento ingrediente…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <RicetteNav current="ingredienti" />
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">

        <div className="mb-5">
          <Btn variant="ghost" size="sm" onClick={() => navigate("/ricette/ingredienti")}>
            ← Ingredienti
          </Btn>
        </div>

        {/* HEADER */}
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-orange-900 font-playfair">
              {ing ? ing.name : "Ingrediente"}
            </h1>
            {isPlaceholder ? (
              <span className="text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                da completare
              </span>
            ) : null}
          </div>
          {ing && (
            <p className="text-sm text-neutral-600">
              Unità base: <span className="font-medium">{ing.default_unit}</span>
              {ing.category_name && <> · Categoria: <span className="font-medium">{ing.category_name}</span></>}
            </p>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
        )}
        {msg && (
          <div className="mb-4 rounded-xl border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">{msg}</div>
        )}

        {/* ═══ PANNELLO PLACEHOLDER ═══ */}
        {isPlaceholder && (
          <div className="mb-8 rounded-2xl border border-amber-300 bg-amber-50/60 p-5">
            <h2 className="text-base font-bold text-amber-900 mb-1">Ingrediente da completare</h2>
            <p className="text-xs text-amber-800 mb-4">
              Questo ingrediente è stato creato come placeholder durante un import.
              Puoi completarlo con i dati reali, oppure unirlo a un ingrediente già in archivio se è un doppione.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* COMPLETA */}
              <div className="bg-white rounded-xl border border-neutral-200 p-4">
                <h3 className="text-sm font-semibold text-neutral-800 mb-3">Completa l'ingrediente</h3>
                <div className="space-y-2">
                  <input
                    type="text" value={compl.name}
                    onChange={(e) => setCompl({ ...compl, name: e.target.value })}
                    placeholder="Nome ingrediente"
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <select
                    value={compl.category_id}
                    onChange={(e) => setCompl({ ...compl, category_id: e.target.value })}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">— Categoria —</option>
                    {categorie.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select
                    value={compl.default_unit}
                    onChange={(e) => setCompl({ ...compl, default_unit: e.target.value })}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {UNITA.map((u) => <option key={u} value={u}>Unità base: {u}</option>)}
                  </select>
                  <input
                    type="text" value={compl.allergeni}
                    onChange={(e) => setCompl({ ...compl, allergeni: e.target.value })}
                    placeholder="Allergeni (opzionale)"
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <Btn variant="success" size="md" onClick={handleCompleta}>
                    Completa ingrediente
                  </Btn>
                </div>
              </div>

              {/* UNISCI */}
              <div className="bg-white rounded-xl border border-neutral-200 p-4">
                <h3 className="text-sm font-semibold text-neutral-800 mb-3">Unisci a un ingrediente esistente</h3>
                <p className="text-xs text-neutral-500 mb-2">
                  Se questo è un doppione, scegli l'ingrediente giusto: le voci ricetta verranno spostate lì.
                </p>
                <select
                  value={mergeTarget}
                  onChange={(e) => setMergeTarget(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white mb-2"
                >
                  <option value="">— Scegli ingrediente —</option>
                  {allIngredients
                    .filter((a) => String(a.id) !== String(id))
                    .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <Btn variant="secondary" size="md" onClick={handleUnisci} loading={merging} disabled={merging}>
                  {merging ? "Unione…" : "Unisci"}
                </Btn>
              </div>
            </div>
          </div>
        )}

        {/* ═══ RIEPILOGO PREZZI ═══ */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
            <div className="text-xs text-neutral-600 mb-1">Prezzo medio storico</div>
            <div className="text-xl font-bold text-orange-900">
              {mediaPrezzo != null ? `${fmtPrezzo(mediaPrezzo)} €/${ing?.default_unit || ""}` : "—"}
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
            <div className="text-xs text-neutral-600 mb-1">Ultimo prezzo registrato</div>
            <div className="text-xl font-bold text-green-900">
              {ultimoPrezzo != null ? `${fmtPrezzo(ultimoPrezzo)} €/${ing?.default_unit || ""}` : "—"}
            </div>
          </div>
        </div>

        {/* ═══ AGGIUNGI PREZZO ═══ */}
        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-3">Aggiungi prezzo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
            <select
              value={pForm.supplier_id}
              onChange={(e) => setPForm({ ...pForm, supplier_id: e.target.value })}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— Fornitore —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input
              type="number" step="0.0001" min="0" placeholder="Prezzo €/unità"
              value={pForm.unit_price}
              onChange={(e) => setPForm({ ...pForm, unit_price: e.target.value })}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="date" value={pForm.price_date}
              onChange={(e) => setPForm({ ...pForm, price_date: e.target.value })}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="text" placeholder="Note (opzionale)"
              value={pForm.note}
              onChange={(e) => setPForm({ ...pForm, note: e.target.value })}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <Btn variant="chip" tone="amber" size="md" onClick={handleAddPrezzo}>Salva prezzo</Btn>
          {suppliers.length === 0 && (
            <p className="text-xs text-neutral-400 mt-2">
              Nessun fornitore disponibile: i fornitori arrivano dalle fatture importate.
            </p>
          )}
        </div>

        {/* ═══ STORICO PREZZI ═══ */}
        <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-3">Storico prezzi</h2>
        {prezzi.length === 0 ? (
          <div className="text-sm text-neutral-500 italic mb-6">Nessun prezzo registrato per questo ingrediente.</div>
        ) : (
          <div className="border border-neutral-200 rounded-2xl overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-700">
                <tr>
                  <th className="p-3 text-left font-semibold">Data</th>
                  <th className="p-3 text-left font-semibold">Fornitore</th>
                  <th className="p-3 text-right font-semibold">Prezzo €/unità</th>
                  <th className="p-3 text-left font-semibold">Note</th>
                  <th className="p-3 text-right font-semibold">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {prezzi.map((p) => (
                  <tr key={p.id} className="border-t border-neutral-100">
                    <td className="p-3">{p.price_date || "—"}</td>
                    <td className="p-3">{p.supplier_name || "—"}</td>
                    <td className="p-3 text-right font-medium">{fmtPrezzo(p.unit_price)} €</td>
                    <td className="p-3 text-neutral-500 text-xs">{p.note || "—"}</td>
                    <td className="p-3 text-right">
                      <Btn variant="chip" tone="red" size="sm" onClick={() => handleDelPrezzo(p.id)}>Elimina</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ═══ CONVERSIONI ═══ */}
        <div className="border-t border-neutral-200 pt-5">
          <button
            onClick={() => setShowConv((v) => !v)}
            className="text-sm font-bold uppercase tracking-wider text-orange-700 flex items-center gap-2"
          >
            <span>{showConv ? "▾" : "▸"}</span>
            Conversioni unità personalizzate
            {conversions.length > 0 && (
              <span className="text-xs font-normal bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                {conversions.length}
              </span>
            )}
          </button>
          <p className="text-xs text-neutral-500 mt-1">
            Equivalenze tra unità per questo ingrediente (es. 1 pz = 0,06 kg). Le conversioni standard
            (kg↔g, L↔ml↔cl) funzionano già da sole.
          </p>

          {showConv && (
            <div className="mt-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-3 flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-neutral-600 block mb-1">1 ×</label>
                  <select
                    value={conv.from_unit}
                    onChange={(e) => setConv({ ...conv, from_unit: e.target.value })}
                    className="border border-blue-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                  >
                    {["pz", "mazzetto", "bottiglia", "lattina", "confezione", "kg", "g", "L", "ml", "cl"]
                      .map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <span className="text-sm text-neutral-500 pb-2">=</span>
                <div>
                  <label className="text-xs text-neutral-600 block mb-1">Quantità</label>
                  <input
                    type="number" step="0.001" min="0" placeholder="0,06"
                    value={conv.factor}
                    onChange={(e) => setConv({ ...conv, factor: e.target.value })}
                    className="border border-blue-200 rounded-lg px-2 py-1.5 text-sm w-24 bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-600 block mb-1">Unità</label>
                  <select
                    value={conv.to_unit}
                    onChange={(e) => setConv({ ...conv, to_unit: e.target.value })}
                    className="border border-blue-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                  >
                    {UNITA.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <Btn variant="chip" tone="blue" size="md" onClick={handleAddConv}>Aggiungi</Btn>
              </div>

              {conversions.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">Nessuna conversione personalizzata.</p>
              ) : (
                <div className="space-y-2">
                  {conversions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between bg-white border border-neutral-200 rounded-xl px-4 py-2.5">
                      <span className="text-sm text-neutral-900">
                        1 {c.from_unit} = {c.factor} {c.to_unit}
                        {c.note && <span className="text-xs text-neutral-400 ml-2">({c.note})</span>}
                      </span>
                      <Btn variant="chip" tone="red" size="sm" onClick={() => handleDelConv(c.id)}>Elimina</Btn>
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
