// @version: v3.2 — ricerca raggruppata per articolo + collega multi-selezione
// Modulo: ricette
// Dettaglio ingrediente: completa/unisci placeholder + storico prezzi + conversioni unità.
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";
import { Btn } from "../../components/ui";

const FC = `${API_BASE}/foodcost`;
const ING = `${FC}/ingredients`;
const MATCH = `${FC}/matching`;
const UNITA = ["kg", "g", "L", "ml", "cl", "pz"];
const oggi = () => new Date().toISOString().slice(0, 10);

function fmtPrezzo(v) {
  if (v == null || isNaN(v)) return "—";
  const n = Number(v);
  const dec = Math.abs(n) < 1 ? 4 : 2;
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: dec });
}

// Raggruppa le righe fattura per ARTICOLO: solo righe IDENTICHE (stesso
// fornitore + stessa descrizione esatta) finiscono nello stesso gruppo.
function groupArticoli(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const key = `${r.fornitore_nome || ""}|||${r.descrizione || ""}`;
    if (!map.has(key)) {
      map.set(key, { key, fornitore: r.fornitore_nome, descrizione: r.descrizione, righe: [] });
    }
    map.get(key).righe.push(r);
  }
  return [...map.values()]
    .map((a) => {
      const prezzi = a.righe.map((r) => r.prezzo_unitario).filter((p) => p != null);
      const date = a.righe.map((r) => r.data_fattura).filter(Boolean).sort();
      return {
        ...a,
        n: a.righe.length,
        rigaIds: a.righe.map((r) => r.riga_id),
        pmin: prezzi.length ? Math.min(...prezzi) : null,
        pmax: prezzi.length ? Math.max(...prezzi) : null,
        ultima: date.length ? date[date.length - 1] : null,
      };
    })
    .sort((a, b) => b.n - a.n);
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

  // collegamenti fattura (un ingrediente può averne più d'uno: uno per fornitore)
  const [mappings, setMappings] = useState([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [selArt, setSelArt] = useState({}); // articoli selezionati (key -> bool)
  const searchInit = useRef(false);

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

      const [pr, cv, cat, sup, ings, mp] = await Promise.all([
        apiFetch(`${ING}/${id}/prezzi`),
        apiFetch(`${ING}/${id}/conversions`),
        apiFetch(`${ING}/categories`),
        apiFetch(`${ING}/suppliers`),
        apiFetch(`${ING}/`),
        apiFetch(`${MATCH}/mappings?ingredient_id=${id}`),
      ]);
      if (pr.ok) setPrezzi(await pr.json());
      if (cv.ok) setConversions(await cv.json());
      if (cat.ok) setCategorie(await cat.json());
      if (sup.ok) setSuppliers(await sup.json());
      if (ings.ok) setAllIngredients(await ings.json());
      if (mp.ok) setMappings(await mp.json());

      // Prima apertura: precompila la ricerca col nome ingrediente e cerca
      if (!searchInit.current) {
        searchInit.current = true;
        setSearchQ(d.name || "");
        doSearch(d.name || "");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Ricarica solo prezzi + collegamenti (dopo collega/scollega, senza flash)
  const refreshPrezziMappings = async () => {
    const [pr, mp] = await Promise.all([
      apiFetch(`${ING}/${id}/prezzi`),
      apiFetch(`${MATCH}/mappings?ingredient_id=${id}`),
    ]);
    if (pr.ok) setPrezzi(await pr.json());
    if (mp.ok) setMappings(await mp.json());
  };

  // Cerca righe fattura non ancora collegate, per descrizione
  const doSearch = async (q) => {
    const query = (q || "").trim();
    if (!query) { setSearchResults([]); setSearchDone(false); return; }
    setSearching(true);
    setSearchDone(false);
    try {
      const r = await apiFetch(`${MATCH}/pending?q=${encodeURIComponent(query)}&escludi_collegati=1`);
      if (r.ok) setSearchResults(await r.json());
      else setSearchResults([]);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
      setSearchDone(true);
    }
  };

  // Collega gli articoli selezionati a QUESTO ingrediente (aggiunge match,
  // non sostituisce — un ingrediente può avere più collegamenti)
  const handleCollegaSelezionati = async (articoli) => {
    const rigaIds = articoli
      .filter((a) => selArt[a.key])
      .flatMap((a) => a.rigaIds);
    if (rigaIds.length === 0) {
      setError("Spunta almeno un articolo da collegare.");
      return;
    }
    setError(""); setMsg("");
    try {
      const r = await apiFetch(`${MATCH}/collega-multiplo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredient_id: Number(id), riga_ids: rigaIds }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      let range = "";
      if (data.prezzo_min != null) {
        range = data.prezzo_min === data.prezzo_max
          ? `${fmtPrezzo(data.prezzo_min)} €/${data.default_unit}`
          : `${fmtPrezzo(data.prezzo_min)}–${fmtPrezzo(data.prezzo_max)} €/${data.default_unit}`;
      }
      setMsg(
        `${data.righe_collegate} righe fattura collegate${range ? ` · ${range}` : ""}.`
      );
      setSelArt({});
      await refreshPrezziMappings();
      await doSearch(searchQ); // gli articoli collegati spariscono dai risultati
    } catch (e) {
      setError(`Errore collegamento: ${e.message}`);
    }
  };

  // Rimuove un collegamento (i prezzi già registrati restano nello storico)
  const handleScollega = async (mappingId) => {
    if (!window.confirm("Rimuovere questo collegamento? I prezzi già registrati restano nello storico.")) return;
    setError("");
    try {
      const r = await apiFetch(`${MATCH}/mappings/${mappingId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      await refreshPrezziMappings();
    } catch (e) {
      setError(`Errore: ${e.message}`);
    }
  };

  // Disattiva / riattiva l'ingrediente (resta in archivio, esce dall'uso)
  const handleToggleAttivo = async () => {
    if (!ing) return;
    const nuovo = ing.is_active === 0 ? 1 : 0;
    if (nuovo === 0 && !window.confirm(
      `Disattivare "${ing.name}"?\n\nResta nel database (storico e ricette intatti) ` +
      `ma esce dalla lista ingredienti. Potrai riattivarlo.`
    )) return;
    setError(""); setMsg("");
    try {
      const r = await apiFetch(`${ING}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nuovo }),
      });
      if (!r.ok) throw new Error(await r.text());
      setMsg(nuovo ? "Ingrediente riattivato." : "Ingrediente disattivato.");
      await load();
    } catch (e) {
      setError(`Errore: ${e.message}`);
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
  const isPlaceholder = !!(ing && ing.placeholder);
  const isAttivo = !ing || ing.is_active !== 0;
  const articoli = groupArticoli(searchResults);
  const selCount = Object.values(selArt).filter(Boolean).length;

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
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-orange-900 font-playfair">
                {ing ? ing.name : "Ingrediente"}
              </h1>
              {isPlaceholder && (
                <span className="text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                  da completare
                </span>
              )}
              {!isAttivo && (
                <span className="text-xs font-semibold bg-neutral-200 text-neutral-600 border border-neutral-300 px-2 py-0.5 rounded">
                  disattivato
                </span>
              )}
            </div>
            {ing && (
              <p className="text-sm text-neutral-600">
                Unità base: <span className="font-medium">{ing.default_unit}</span>
                {ing.category_name && <> · Categoria: <span className="font-medium">{ing.category_name}</span></>}
              </p>
            )}
          </div>
          {ing && (
            <Btn
              variant="chip"
              tone={isAttivo ? "red" : "emerald"}
              size="sm"
              onClick={handleToggleAttivo}
            >
              {isAttivo ? "Disattiva" : "Riattiva"}
            </Btn>
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

        {/* ═══ COLLEGAMENTI FATTURA ═══ */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-1">
            Collegamenti fattura
          </h2>
          <p className="text-xs text-neutral-500 mb-3">
            Collega questo ingrediente alle righe delle fatture: il prezzo entra in automatico.
            Un ingrediente può avere più collegamenti — uno per ogni fornitore.
          </p>

          {mappings.length > 0 && (
            <div className="space-y-2 mb-4">
              {mappings.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-neutral-900">{m.fornitore_nome || "—"}</span>
                    <span className="text-xs text-neutral-500 ml-2">{m.descrizione_fornitore}</span>
                  </div>
                  <Btn variant="chip" tone="red" size="sm" onClick={() => handleScollega(m.id)}>
                    Scollega
                  </Btn>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch(searchQ)}
              placeholder="Cerca nelle righe fattura…"
              className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
            <Btn variant="chip" tone="blue" size="md" onClick={() => doSearch(searchQ)} loading={searching}>
              {searching ? "Cerco…" : "Cerca"}
            </Btn>
          </div>

          {searchDone && articoli.length === 0 && (
            <p className="text-sm text-neutral-400 italic">
              Nessuna riga fattura non collegata trovata.
            </p>
          )}
          {articoli.length > 0 && (
            <>
              <p className="text-xs text-neutral-500 mb-2">
                Le righe identiche (stesso fornitore + stessa descrizione) sono raggruppate
                in un articolo. Spunta gli articoli da collegare — anche più d'uno, se sai
                che sono lo stesso prodotto (es. lotti diversi).
              </p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto mb-3">
                {articoli.map((a) => {
                  const checked = !!selArt[a.key];
                  return (
                    <label
                      key={a.key}
                      className={`flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer transition ${
                        checked ? "bg-blue-50 border-blue-300" : "bg-neutral-50 border-neutral-200 hover:border-blue-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelArt((s) => ({ ...s, [a.key]: !s[a.key] }))}
                        className="w-4 h-4 flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-neutral-900 truncate">{a.descrizione}</div>
                        <div className="text-xs text-neutral-500">
                          {a.fornitore || "—"} · {a.n} {a.n === 1 ? "fattura" : "fatture"}
                          {a.pmin != null && (
                            ` · ${a.pmin === a.pmax ? fmtPrezzo(a.pmin) : `${fmtPrezzo(a.pmin)}–${fmtPrezzo(a.pmax)}`} €`
                          )}
                          {a.ultima && ` · ultima ${a.ultima}`}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <Btn
                variant="success"
                size="md"
                onClick={() => handleCollegaSelezionati(articoli)}
                disabled={selCount === 0}
              >
                Collega selezionati{selCount > 0 ? ` (${selCount})` : ""}
              </Btn>
            </>
          )}
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
