// @version: v4.0 — scheda ingrediente ridisegnata: testa + KPI + 5 tab (stile scheda vini)
// Modulo: ricette
// Scheda ingrediente: Prezzi · Collegamenti · Conversioni · Ricette · Anagrafica.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";
import { Btn } from "../../components/ui";

const FC = `${API_BASE}/foodcost`;
const ING = `${FC}/ingredients`;
const MATCH = `${FC}/matching`;
const UNITA = ["kg", "g", "L", "ml", "cl", "pz"];
const oggi = () => new Date().toISOString().slice(0, 10);

// Colori serie grafico prezzi (palette TRGB-02 + accenti)
const CHART_COLORS = ["#2E7BE8", "#2EB872", "#BA7517", "#E8402B", "#7F77DD", "#0F6E56"];

// Tinta della testa in base alla categoria (fallback neutro arancio = modulo ricette)
function categoriaTinta(nome) {
  const s = (nome || "").toLowerCase();
  if (/ortagg|verdur|frutt|legum/.test(s))
    return { head: "bg-green-50", accent: "border-l-green-500", badge: "bg-green-100 text-green-800 border-green-200" };
  if (/carne|macell|salum/.test(s))
    return { head: "bg-red-50", accent: "border-l-red-500", badge: "bg-red-100 text-red-800 border-red-200" };
  if (/pesc|ittic|mare/.test(s))
    return { head: "bg-blue-50", accent: "border-l-blue-500", badge: "bg-blue-100 text-blue-800 border-blue-200" };
  if (/latt|formagg|casear|uova/.test(s))
    return { head: "bg-amber-50", accent: "border-l-amber-500", badge: "bg-amber-100 text-amber-800 border-amber-200" };
  return { head: "bg-orange-50", accent: "border-l-orange-400", badge: "bg-orange-100 text-orange-800 border-orange-200" };
}

function fmtPrezzo(v) {
  if (v == null || isNaN(v)) return "—";
  const n = Number(v);
  const dec = Math.abs(n) < 1 ? 4 : 2;
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: dec });
}

function meseLabel(ym) {
  const [a, m] = (ym || "").split("-");
  const nomi = ["", "gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  return m ? `${nomi[Number(m)] || m} ${(a || "").slice(2)}` : ym;
}

// Famiglia dell'unità — per segnalare collegamenti con conversione incerta.
function unitFamily(u) {
  const s = (u || "").trim().toLowerCase();
  if (!s) return null;
  if (/^(kg|kgm|g|gr|grm|grammi|mg|chilo|kilo)$/.test(s)) return "peso";
  if (/^(l|lt|ltr|litri|litro|ml|mlt|cl)$/.test(s)) return "volume";
  if (/^(pz|pezzi|pezzo|nr)$/.test(s)) return "pz";
  return null;
}
// Un collegamento è "sospetto" quando l'unità di fattura è di una famiglia
// diversa dall'unità base (es. PZ vs g) E NON è ancora stato impostato un
// fattore di conversione reale. Appena l'utente corregge la conversione
// (fattore ≠ 1) il collegamento smette di essere sospetto.
function collegamentoSospetto(unitaFornitore, baseUnit, fattore) {
  const fa = unitFamily(unitaFornitore);
  const fb = unitFamily(baseUnit);
  if (!fa || !fb) return false;
  if (fa === fb) return false;
  const f = Number(fattore);
  return !(f && f !== 1);
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

const TABS = [
  { key: "prezzi", label: "Prezzi" },
  { key: "collegamenti", label: "Collegamenti" },
  { key: "conversioni", label: "Conversioni" },
  { key: "ricette", label: "Ricette" },
  { key: "anagrafica", label: "Anagrafica" },
];

export default function RicetteIngredientiPrezzi() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [activeTab, setActiveTab] = useState("prezzi");

  const [ing, setIng] = useState(null);
  const [prezzi, setPrezzi] = useState([]);
  const [conversions, setConversions] = useState([]);
  const [categorie, setCategorie] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [allIngredients, setAllIngredients] = useState([]);
  const [ricette, setRicette] = useState([]);

  // collegamenti fattura (un ingrediente può averne più d'uno: uno per fornitore)
  const [mappings, setMappings] = useState([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [selArt, setSelArt] = useState({});
  const [collegaReview, setCollegaReview] = useState(null);
  const [correggiDraft, setCorreggiDraft] = useState(null);
  const searchInit = useRef(false);

  // form anagrafica / completa placeholder
  const [form, setForm] = useState({ name: "", category_id: "", default_unit: "kg", allergeni: "", codice_interno: "", note: "" });
  const [editAnag, setEditAnag] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [merging, setMerging] = useState(false);

  // form nuovo prezzo
  const [pForm, setPForm] = useState({ supplier_id: "", unit_price: "", price_date: oggi(), note: "" });
  const [showAddPrezzo, setShowAddPrezzo] = useState(false);

  // conversioni
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
      setForm({
        name: d.name || "",
        category_id: d.category_id ? String(d.category_id) : "",
        default_unit: d.default_unit || "kg",
        allergeni: d.allergeni || "",
        codice_interno: d.codice_interno || "",
        note: d.note || "",
      });

      const [pr, cv, cat, sup, ings, mp, rc] = await Promise.all([
        apiFetch(`${ING}/${id}/prezzi`),
        apiFetch(`${ING}/${id}/conversions`),
        apiFetch(`${ING}/categories`),
        apiFetch(`${ING}/suppliers`),
        apiFetch(`${ING}/`),
        apiFetch(`${MATCH}/mappings?ingredient_id=${id}`),
        apiFetch(`${FC}/ricette/per-ingrediente/${id}`),
      ]);
      if (pr.ok) setPrezzi(await pr.json());
      if (cv.ok) setConversions(await cv.json());
      if (cat.ok) setCategorie(await cat.json());
      if (sup.ok) setSuppliers(await sup.json());
      if (ings.ok) setAllIngredients(await ings.json());
      if (mp.ok) setMappings(await mp.json());
      if (rc.ok) setRicette(await rc.json());

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

  const refreshPrezziMappings = async () => {
    const [pr, mp] = await Promise.all([
      apiFetch(`${ING}/${id}/prezzi`),
      apiFetch(`${MATCH}/mappings?ingredient_id=${id}`),
    ]);
    if (pr.ok) setPrezzi(await pr.json());
    if (mp.ok) setMappings(await mp.json());
  };

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

  const handleCollegaSelezionati = async (articoli) => {
    const sel = articoli.filter((a) => selArt[a.key]);
    if (sel.length === 0) {
      setError("Spunta almeno un articolo da collegare.");
      return;
    }
    setError("");
    const review = [];
    for (const a of sel) {
      let g = { factor: 1, detail: "", safe: false };
      try {
        const r = await apiFetch(`${MATCH}/fattore?riga_id=${a.righe[0].riga_id}&ingredient_id=${id}`);
        if (r.ok) g = await r.json();
      } catch { /* fallback */ }
      review.push({
        art: a,
        unita: g.unita_fattura || a.unita || "conf.",
        factor: String(g.factor ?? 1),
        detail: g.detail || "",
        safe: g.safe !== false,
      });
    }
    setCollegaReview(review);
  };

  const handleConfermaCollega = async () => {
    if (!collegaReview) return;
    for (const it of collegaReview) {
      const f = parseFloat(String(it.factor).replace(",", "."));
      if (!f || f <= 0) {
        setError(`Imposta un fattore valido per "${it.art.descrizione}".`);
        return;
      }
    }
    setError(""); setMsg("");
    try {
      let totRighe = 0;
      for (const it of collegaReview) {
        const f = parseFloat(String(it.factor).replace(",", "."));
        const r = await apiFetch(`${MATCH}/collega-multiplo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ingredient_id: Number(id),
            riga_ids: it.art.rigaIds,
            fattore_conversione: f,
          }),
        });
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        totRighe += data.righe_collegate || 0;
      }
      setMsg(`${totRighe} righe fattura collegate.`);
      setCollegaReview(null);
      setSelArt({});
      await refreshPrezziMappings();
      await doSearch(searchQ);
    } catch (e) {
      setError(`Errore collegamento: ${e.message}`);
    }
  };

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

  const handleCorreggi = async () => {
    if (!correggiDraft) return;
    const f = parseFloat(String(correggiDraft.factor).replace(",", "."));
    if (!f || f <= 0) {
      setError("Il fattore di conversione deve essere maggiore di zero.");
      return;
    }
    setError(""); setMsg("");
    try {
      const r = await apiFetch(`${MATCH}/correggi-conversione`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping_id: correggiDraft.mapping_id, fattore_conversione: f }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const pm = data.prezzo_min, pM = data.prezzo_max;
      const det = pm != null
        ? (pm === pM
            ? ` Nuovo prezzo: ${fmtPrezzo(pm)} €/${baseUnit}.`
            : ` Nuovi prezzi: ${fmtPrezzo(pm)}–${fmtPrezzo(pM)} €/${baseUnit}.`)
        : "";
      setMsg(`Conversione corretta — ${data.prezzi_aggiornati} prezzi ricalcolati.${det}`);
      setCorreggiDraft(null);
      await refreshPrezziMappings();
    } catch (e) {
      setError(`Errore: ${e.message}`);
    }
  };

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

  // ─── Anagrafica: salva / completa ───────────────────────────
  const salvaAnagrafica = async (completaPlaceholder) => {
    setError(""); setMsg("");
    if (!form.name.trim()) { setError("Il nome è obbligatorio."); return; }
    try {
      const body = {
        name: form.name.trim(),
        category_id: form.category_id ? Number(form.category_id) : null,
        default_unit: form.default_unit,
        allergeni: form.allergeni.trim() || null,
        codice_interno: form.codice_interno.trim() || null,
        note: form.note.trim() || null,
      };
      if (completaPlaceholder) body.placeholder = 0;
      const resp = await apiFetch(`${ING}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setMsg(completaPlaceholder ? "Ingrediente completato — non è più un placeholder." : "Anagrafica salvata.");
      setEditAnag(false);
      await load();
    } catch (e) {
      setError(`Errore: ${e.message}`);
    }
  };

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
      setShowAddPrezzo(false);
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
  const baseUnit = ing?.default_unit || "";
  const ultimoPrezzo = prezzi.length ? prezzi[0].unit_price : null;
  const prezziVal = prezzi.map((p) => p.unit_price).filter((v) => v != null && !isNaN(v));
  const mediaPrezzo = prezziVal.length ? prezziVal.reduce((s, v) => s + v, 0) / prezziVal.length : null;
  const pMin = prezziVal.length ? Math.min(...prezziVal) : null;
  const pMax = prezziVal.length ? Math.max(...prezziVal) : null;
  const sospettiCount = mappings.filter((m) => collegamentoSospetto(m.unita_fornitore, baseUnit, m.fattore_conversione)).length;
  const isPlaceholder = !!(ing && ing.placeholder);
  const isAttivo = !ing || ing.is_active !== 0;
  const articoli = groupArticoli(searchResults);
  const selCount = Object.values(selArt).filter(Boolean).length;
  const tinta = categoriaTinta(ing?.category_name);

  // Collegamenti raggruppati per fornitore
  const mappingsByForn = useMemo(() => {
    const m = new Map();
    for (const x of mappings) {
      const k = x.fornitore_nome || "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return [...m.entries()];
  }, [mappings]);

  // Serie grafico prezzi: media mensile per fornitore
  const chart = useMemo(() => {
    const byMonth = {};
    const forn = new Set();
    for (const p of prezzi) {
      if (!p.price_date || p.unit_price == null) continue;
      const ym = p.price_date.slice(0, 7);
      const s = p.supplier_name || "—";
      forn.add(s);
      byMonth[ym] = byMonth[ym] || {};
      (byMonth[ym][s] = byMonth[ym][s] || []).push(p.unit_price);
    }
    const mesi = Object.keys(byMonth).sort();
    const fornitori = [...forn];
    const rows = mesi.map((ym) => {
      const r = { ym, mese: meseLabel(ym) };
      for (const s of fornitori) {
        const a = byMonth[ym][s];
        if (a) r[s] = a.reduce((x, y) => x + y, 0) / a.length;
      }
      return r;
    });
    return { rows, fornitori };
  }, [prezzi]);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-cream">
        <RicetteNav current="ingredienti" />
        <div className="text-center py-20 text-neutral-500">Caricamento ingrediente…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream p-4 sm:p-6 font-sans">
      <RicetteNav current="ingredienti" />
      <div className={`max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl border border-neutral-200 mt-4 overflow-hidden border-l-4 ${tinta.accent}`}>

        {/* ═══════════ TESTA ═══════════ */}
        <div className={`${tinta.head} border-b border-neutral-200 px-5 sm:px-8 pt-5 pb-5`}>
          <button
            onClick={() => navigate("/ricette/ingredienti")}
            className="text-xs font-semibold text-neutral-500 hover:text-neutral-800 mb-3"
          >
            ← Ingredienti
          </button>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {ing?.category_name && (
                  <span className={`text-[10px] font-semibold uppercase tracking-wide border px-2 py-0.5 rounded ${tinta.badge}`}>
                    {ing.category_name}
                  </span>
                )}
                <span className={`text-[10px] font-semibold uppercase tracking-wide border px-2 py-0.5 rounded ${
                  isAttivo ? "bg-green-100 text-green-800 border-green-200" : "bg-neutral-200 text-neutral-600 border-neutral-300"
                }`}>
                  {isAttivo ? "Attivo" : "Disattivato"}
                </span>
                {isPlaceholder && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                    da completare
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-orange-900 font-playfair leading-tight">
                {ing ? ing.name : "Ingrediente"}
              </h1>
              <p className="text-xs text-neutral-600 mt-1">
                Unità base: <span className="font-medium">{baseUnit}</span>
                {` · ${mappings.length} collegamenti fattura`}
              </p>
            </div>
            {ing && (
              <Btn variant="chip" tone={isAttivo ? "red" : "emerald"} size="sm" onClick={handleToggleAttivo}>
                {isAttivo ? "Disattiva" : "Riattiva"}
              </Btn>
            )}
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
            <div className="bg-white border border-neutral-200 rounded-xl p-3">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Prezzo attuale</div>
              <div className="text-lg font-bold text-green-800">
                {ultimoPrezzo != null ? <>{fmtPrezzo(ultimoPrezzo)}<span className="text-[11px] font-normal text-neutral-500"> €/{baseUnit}</span></> : "—"}
              </div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-xl p-3">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Medio storico</div>
              <div className="text-lg font-bold text-neutral-900">
                {mediaPrezzo != null ? <>{fmtPrezzo(mediaPrezzo)}<span className="text-[11px] font-normal text-neutral-500"> €/{baseUnit}</span></> : "—"}
              </div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-xl p-3">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Oscillazione</div>
              <div className="text-sm font-bold text-neutral-900 pt-1">
                {pMin != null ? `${fmtPrezzo(pMin)}–${fmtPrezzo(pMax)}` : "—"}
              </div>
            </div>
            {sospettiCount > 0 ? (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3">
                <div className="text-[10px] text-amber-700 uppercase tracking-wide">Da correggere</div>
                <div className="text-lg font-bold text-amber-800">
                  {sospettiCount}<span className="text-[11px] font-normal"> collegam.</span>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-neutral-200 rounded-xl p-3">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Collegamenti</div>
                <div className="text-lg font-bold text-neutral-900">{mappings.length}</div>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════ TAB BAR ═══════════ */}
        <div className="flex gap-1 px-2 sm:px-5 border-b border-neutral-200 bg-white overflow-x-auto">
          {TABS.map((t) => {
            const active = activeTab === t.key;
            const badge =
              t.key === "collegamenti" && sospettiCount > 0 ? sospettiCount :
              t.key === "ricette" && ricette.length > 0 ? ricette.length : null;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium whitespace-nowrap transition ${
                  active ? "text-neutral-900 border-b-2 border-brand-red -mb-px" : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {t.label}
                {badge != null && (
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                    t.key === "collegamenti" ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-500"
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ═══════════ CONTENUTO ═══════════ */}
        <div className="px-5 sm:px-8 py-6">

          {error && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
          )}
          {msg && (
            <div className="mb-4 rounded-xl border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">{msg}</div>
          )}

          {/* Banner placeholder — sempre visibile sopra il contenuto */}
          {isPlaceholder && (
            <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50/70 p-5">
              <h2 className="text-base font-bold text-amber-900 mb-1">Ingrediente da completare</h2>
              <p className="text-xs text-amber-800 mb-4">
                Creato come placeholder durante un import. Completalo con i dati reali nella tab
                <strong> Anagrafica</strong>, oppure unirlo a un ingrediente già in archivio se è un doppione.
              </p>
              <div className="bg-white rounded-xl border border-neutral-200 p-4">
                <h3 className="text-sm font-semibold text-neutral-800 mb-2">Unisci a un ingrediente esistente</h3>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(e.target.value)}
                    className="flex-1 min-w-[200px] border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
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

          {/* ─────────── TAB PREZZI ─────────── */}
          {activeTab === "prezzi" && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-brand-red mb-1">
                Andamento prezzo
              </h2>
              <p className="text-xs text-neutral-500 mb-3">
                Media mensile del prezzo per unità base, per fornitore.
              </p>

              {chart.rows.length < 2 ? (
                <div className="text-sm text-neutral-400 italic bg-neutral-50 border border-neutral-200 rounded-2xl p-6 text-center mb-6">
                  Servono almeno due rilevazioni di prezzo per disegnare l'andamento.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3 mb-2">
                    {chart.fornitori.map((f, i) => (
                      <span key={f} className="flex items-center gap-1.5 text-xs text-neutral-600">
                        <span className="inline-block w-4 h-[3px] rounded" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        {f}
                      </span>
                    ))}
                  </div>
                  <div className="bg-white border border-neutral-200 rounded-2xl p-3 mb-6" style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chart.rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                        <CartesianGrid stroke="#f0ede6" />
                        <XAxis dataKey="mese" tick={{ fontSize: 11, fill: "#8A877F" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#8A877F" }} width={56}
                          tickFormatter={(v) => fmtPrezzo(v)} />
                        <RTooltip
                          formatter={(v) => [`${fmtPrezzo(v)} €/${baseUnit}`]}
                          labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12 }}
                        />
                        {chart.fornitori.map((f, i) => (
                          <Line key={f} type="monotone" dataKey={f} name={f}
                            stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2}
                            dot={{ r: 3 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-brand-red">Storico prezzi</h2>
                <Btn variant="chip" tone="amber" size="sm" onClick={() => setShowAddPrezzo((v) => !v)}>
                  {showAddPrezzo ? "Chiudi" : "+ Aggiungi prezzo"}
                </Btn>
              </div>

              {showAddPrezzo && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 mb-4">
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
                </div>
              )}

              {prezzi.length === 0 ? (
                <div className="text-sm text-neutral-500 italic">Nessun prezzo registrato per questo ingrediente.</div>
              ) : (
                <div className="border border-neutral-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-100 text-neutral-700">
                      <tr>
                        <th className="p-3 text-left font-semibold">Data</th>
                        <th className="p-3 text-left font-semibold">Fornitore</th>
                        <th className="p-3 text-right font-semibold">Prezzo €/{baseUnit}</th>
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
            </div>
          )}

          {/* ─────────── TAB COLLEGAMENTI ─────────── */}
          {activeTab === "collegamenti" && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-brand-red mb-1">Collegamenti fattura</h2>
              <p className="text-xs text-neutral-500 mb-3">
                Collega questo ingrediente alle righe delle fatture: il prezzo entra in automatico.
                Un ingrediente può avere più collegamenti — uno per ogni fornitore.
              </p>

              {sospettiCount > 0 && (
                <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
                  ⚠ {sospettiCount} {sospettiCount === 1 ? "collegamento ha" : "collegamenti hanno"} una
                  conversione da verificare. Le righe con unità diversa dall'unità base sporcano il prezzo
                  medio finché non correggi il fattore.
                </div>
              )}

              {mappingsByForn.length > 0 && (
                <div className="space-y-4 mb-5">
                  {mappingsByForn.map(([forn, righe]) => (
                    <div key={forn}>
                      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">
                        {forn} <span className="font-normal lowercase">· {righe.length} {righe.length === 1 ? "riga" : "righe"}</span>
                      </div>
                      <div className="space-y-2">
                        {righe.map((m) => {
                          const sospetto = collegamentoSospetto(m.unita_fornitore, baseUnit, m.fattore_conversione);
                          const inCorrezione = correggiDraft && correggiDraft.mapping_id === m.id;
                          return (
                            <div
                              key={m.id}
                              className={`border rounded-xl px-3 py-2 ${
                                sospetto ? "bg-amber-50 border-amber-300" : "bg-green-50 border-green-200"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <span className="text-sm font-medium text-neutral-900">{m.descrizione_fornitore}</span>
                                  {sospetto && !inCorrezione && (
                                    <div className="text-[11px] text-amber-700 mt-0.5">
                                      ⚠ unità "{m.unita_fornitore}" diversa da "{baseUnit}" — correggi la conversione
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-1.5 flex-shrink-0">
                                  {sospetto && !inCorrezione && (
                                    <Btn variant="chip" tone="amber" size="sm" onClick={() => setCorreggiDraft({
                                      mapping_id: m.id,
                                      unita: m.unita_fornitore || "conf.",
                                      factor: String(m.fattore_conversione || 1),
                                    })}>
                                      Correggi
                                    </Btn>
                                  )}
                                  <Btn variant="chip" tone="red" size="sm" onClick={() => handleScollega(m.id)}>
                                    Scollega
                                  </Btn>
                                </div>
                              </div>
                              {inCorrezione && (
                                <div className="mt-2 pt-2 border-t border-amber-200 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
                                    <span>1</span>
                                    <span className="font-medium">{correggiDraft.unita}</span>
                                    <span>=</span>
                                    <input
                                      type="number" step="any" min="0" value={correggiDraft.factor}
                                      onChange={(e) => setCorreggiDraft((d) => ({ ...d, factor: e.target.value }))}
                                      className="w-24 border border-amber-300 rounded-lg px-2 py-1 text-sm"
                                    />
                                    <span className="font-medium">{baseUnit}</span>
                                  </div>
                                  <p className="text-[11px] text-neutral-500">
                                    I prezzi già registrati di questo collegamento verranno ricalcolati
                                    dal prezzo originale di fattura.
                                  </p>
                                  <div className="flex gap-2">
                                    <Btn variant="success" size="sm" onClick={handleCorreggi}>Salva e ricalcola</Btn>
                                    <Btn variant="ghost" size="sm" onClick={() => setCorreggiDraft(null)}>Annulla</Btn>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {collegaReview ? (
                <div className="border-t border-neutral-200 pt-4">
                  <p className="text-sm text-neutral-700 mb-3">
                    Conferma la conversione per ogni articolo — quante <strong>{baseUnit}</strong> in 1 unità di fattura:
                  </p>
                  <div className="space-y-2 mb-3">
                    {collegaReview.map((it, idx) => (
                      <div
                        key={it.art.key}
                        className={`border rounded-lg px-3 py-2 ${
                          it.safe ? "bg-neutral-50 border-neutral-200" : "bg-amber-50 border-amber-300"
                        }`}
                      >
                        <div className="text-sm font-medium text-neutral-900">{it.art.descrizione}</div>
                        <div className="text-xs text-neutral-500 mb-2">
                          {it.art.fornitore || "—"} · {it.art.n} {it.art.n === 1 ? "riga" : "righe"}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span>1</span>
                          <span className="font-medium">{it.unita}</span>
                          <span>=</span>
                          <input
                            type="number" step="any" min="0" value={it.factor}
                            onChange={(e) => setCollegaReview((r) =>
                              r.map((x, i) => (i === idx ? { ...x, factor: e.target.value } : x)))}
                            className="w-24 border border-neutral-300 rounded-lg px-2 py-1 text-sm"
                          />
                          <span className="font-medium">{baseUnit}</span>
                        </div>
                        <div className={`text-xs mt-1 ${it.safe ? "text-neutral-500" : "text-amber-700"}`}>
                          {it.safe ? "Stima: " : "⚠ "}
                          {it.detail || "unità non convertibile da sola — imposta tu il fattore"}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Btn variant="success" size="md" onClick={handleConfermaCollega}>Conferma collegamento</Btn>
                    <Btn variant="ghost" size="md" onClick={() => setCollegaReview(null)}>Annulla</Btn>
                  </div>
                </div>
              ) : (
                <div className="border-t border-neutral-200 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
                    Collega una nuova riga fattura
                  </h3>
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
                    <p className="text-sm text-neutral-400 italic">Nessuna riga fattura non collegata trovata.</p>
                  )}
                  {articoli.length > 0 && (
                    <>
                      <p className="text-xs text-neutral-500 mb-2">
                        Le righe identiche (stesso fornitore + stessa descrizione) sono raggruppate in un articolo.
                        Spunta gli articoli da collegare — anche più d'uno, se sai che sono lo stesso prodotto
                        (es. lotti diversi).
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
              )}
            </div>
          )}

          {/* ─────────── TAB CONVERSIONI ─────────── */}
          {activeTab === "conversioni" && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-brand-red mb-1">Conversioni unità</h2>
              <p className="text-xs text-neutral-500 mb-3">
                Equivalenze tra unità per questo ingrediente (es. 1 pz = 0,06 kg). Le conversioni standard
                (kg↔g, L↔ml↔cl) funzionano già da sole.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
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
                <p className="text-sm text-neutral-400 italic">Nessuna conversione personalizzata.</p>
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

          {/* ─────────── TAB RICETTE ─────────── */}
          {activeTab === "ricette" && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-brand-red mb-1">
                Ricette che usano questo ingrediente
              </h2>
              <p className="text-xs text-neutral-500 mb-3">
                Quantità impiegata e quanto incide sul food cost del piatto.
              </p>
              {ricette.length === 0 ? (
                <p className="text-sm text-neutral-400 italic">
                  Nessuna ricetta usa ancora questo ingrediente.
                </p>
              ) : (
                <div className="border border-neutral-200 rounded-2xl overflow-hidden">
                  {ricette.map((r) => {
                    const pct = r.incidenza_pct;
                    const tone = pct == null ? "text-neutral-400"
                      : pct < 10 ? "text-green-700"
                      : pct < 20 ? "text-amber-700" : "text-red-700";
                    return (
                      <button
                        key={r.recipe_id}
                        onClick={() => navigate(`/ricette/${r.recipe_id}`)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 border-t border-neutral-100 first:border-t-0 hover:bg-neutral-50 text-left transition"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-neutral-900 truncate">
                            {r.recipe_name}
                            {r.is_active === 0 && (
                              <span className="ml-2 text-[10px] font-semibold bg-neutral-200 text-neutral-600 px-1.5 py-0.5 rounded">
                                non attiva
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {fmtPrezzo(r.qty)} {r.unit} impiegati
                            {r.line_cost != null && ` · costo ${fmtPrezzo(r.line_cost)} €`}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-sm font-bold ${tone}`}>
                            {pct != null ? `${fmtPrezzo(pct)}%` : "—"}
                          </div>
                          <div className="text-[10px] text-neutral-400">del food cost</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─────────── TAB ANAGRAFICA ─────────── */}
          {activeTab === "anagrafica" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-brand-red">Dati anagrafici</h2>
                {!editAnag && (
                  <Btn variant="chip" tone="blue" size="sm" onClick={() => setEditAnag(true)}>Modifica</Btn>
                )}
              </div>

              {editAnag ? (
                <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide block mb-1">Nome</label>
                    <input
                      type="text" value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide block mb-1">Categoria</label>
                      <select
                        value={form.category_id}
                        onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                      >
                        <option value="">— Categoria —</option>
                        {categorie.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide block mb-1">Unità base</label>
                      <select
                        value={form.default_unit}
                        onChange={(e) => setForm({ ...form, default_unit: e.target.value })}
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                      >
                        {UNITA.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide block mb-1">Allergeni</label>
                      <input
                        type="text" value={form.allergeni}
                        onChange={(e) => setForm({ ...form, allergeni: e.target.value })}
                        placeholder="opzionale"
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide block mb-1">Codice interno</label>
                      <input
                        type="text" value={form.codice_interno}
                        onChange={(e) => setForm({ ...form, codice_interno: e.target.value })}
                        placeholder="opzionale"
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide block mb-1">Note</label>
                    <textarea
                      value={form.note} rows={2}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Btn variant="success" size="md" onClick={() => salvaAnagrafica(isPlaceholder)}>
                      {isPlaceholder ? "Completa ingrediente" : "Salva"}
                    </Btn>
                    <Btn variant="ghost" size="md" onClick={() => { setEditAnag(false); load(); }}>Annulla</Btn>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    {[
                      ["Nome", ing?.name],
                      ["Categoria", ing?.category_name || "—"],
                      ["Unità base", baseUnit],
                      ["Stato", isAttivo ? "Attivo" : "Disattivato"],
                      ["Allergeni", ing?.allergeni || "—"],
                      ["Codice interno", ing?.codice_interno || "—"],
                      ["Da completare", isPlaceholder ? "Sì" : "No"],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5">{k}</div>
                        <div className="text-sm text-neutral-900">{v}</div>
                      </div>
                    ))}
                    <div className="sm:col-span-2">
                      <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5">Note</div>
                      <div className="text-sm text-neutral-900">{ing?.note || "—"}</div>
                    </div>
                  </div>
                  <div className="border-t border-neutral-100 mt-5 pt-4 flex gap-2">
                    <Btn variant="chip" tone="blue" size="md" onClick={() => setEditAnag(true)}>
                      Modifica anagrafica
                    </Btn>
                    <Btn variant="chip" tone={isAttivo ? "red" : "emerald"} size="md" onClick={handleToggleAttivo}>
                      {isAttivo ? "Disattiva ingrediente" : "Riattiva ingrediente"}
                    </Btn>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
