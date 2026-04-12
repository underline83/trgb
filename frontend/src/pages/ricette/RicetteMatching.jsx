// @version: v5.1-matching-select-all
// UI Matching Fatture → Ingredienti + Smart Auto-Create + Esclusione Fornitori + Ignora Descrizioni
// Collega righe fatture XML importate agli ingredienti del food cost
// Con analisi intelligente per suggerire e creare ingredienti in blocco

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";
import Tooltip from "../../components/Tooltip";

const FC = `${API_BASE}/foodcost`;

export default function RicetteMatching() {
  const navigate = useNavigate();

  const [pending, setPending] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("pending"); // pending | mappings | smart | fornitori

  // Stato per suggerimenti matching manuale
  const [selectedRiga, setSelectedRiga] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSugg, setLoadingSugg] = useState(false);

  // Auto-match stats
  const [autoResult, setAutoResult] = useState(null);

  // Smart create state
  const [smartSuggestions, setSmartSuggestions] = useState([]);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartSelected, setSmartSelected] = useState({}); // key: suggestedName → editable fields
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Fornitori state
  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliersFilter, setSuppliersFilter] = useState("");
  const [togglingSupplier, setTogglingSupplier] = useState(null); // piva or nome being toggled

  // Ignored descriptions state
  const [ignoredDescs, setIgnoredDescs] = useState([]);
  const [ignoringItem, setIgnoringItem] = useState(null); // suggestedName being ignored
  const [showIgnored, setShowIgnored] = useState(false);

  // Filtro per tab pending
  const [filterText, setFilterText] = useState("");

  // Load data
  const loadPending = async () => {
    try {
      const resp = await apiFetch(`${FC}/matching/pending`);
      if (!resp.ok) throw new Error("Errore caricamento righe pendenti");
      setPending(await resp.json());
    } catch (err) {
      setError(err.message);
    }
  };

  const loadMappings = async () => {
    try {
      const resp = await apiFetch(`${FC}/matching/mappings`);
      if (!resp.ok) throw new Error("Errore caricamento mappings");
      setMappings(await resp.json());
    } catch (err) {
      setError(err.message);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setError("");
    await Promise.all([loadPending(), loadMappings()]);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // Suggerimenti per una riga
  const handleSelectRiga = async (riga) => {
    setSelectedRiga(riga);
    setSuggestions([]);
    setLoadingSugg(true);
    try {
      const resp = await apiFetch(`${FC}/matching/suggest?riga_id=${riga.riga_id}`);
      if (resp.ok) setSuggestions(await resp.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSugg(false);
    }
  };

  // Conferma match manuale
  const handleConfirm = async (rigaId, ingredientId) => {
    setError("");
    try {
      const resp = await apiFetch(`${FC}/matching/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riga_fattura_id: rigaId, ingredient_id: ingredientId }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setSelectedRiga(null);
      setSuggestions([]);
      await loadAll();
    } catch (err) {
      setError(`Errore conferma: ${err.message}`);
    }
  };

  // Auto-match
  const handleAutoMatch = async () => {
    setAutoResult(null);
    setError("");
    try {
      const resp = await apiFetch(`${FC}/matching/auto`, { method: "POST" });
      if (!resp.ok) throw new Error("Errore auto-match");
      const result = await resp.json();
      setAutoResult(result);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  // Elimina mapping
  const handleDeleteMapping = async (mappingId) => {
    if (!window.confirm("Eliminare questo mapping?")) return;
    try {
      await apiFetch(`${FC}/matching/mappings/${mappingId}`, { method: "DELETE" });
      await loadMappings();
    } catch (err) {
      setError("Errore eliminazione mapping.");
    }
  };

  // ─── SMART CREATE ───────────────────────────

  const loadSmartSuggestions = async () => {
    setSmartLoading(true);
    setError("");
    setBulkResult(null);
    try {
      const resp = await apiFetch(`${FC}/matching/smart-suggest`);
      if (!resp.ok) throw new Error("Errore analisi intelligente");
      const data = await resp.json();
      setSmartSuggestions(data);

      // Default: nessuno selezionato – l'utente sceglie manualmente
      setSmartSelected({});
    } catch (err) {
      setError(err.message);
    } finally {
      setSmartLoading(false);
    }
  };

  const toggleSmartItem = (suggestedName, suggestion) => {
    setSmartSelected((prev) => {
      const copy = { ...prev };
      if (copy[suggestedName]) {
        // Toggle off
        delete copy[suggestedName];
      } else {
        // Toggle on
        copy[suggestedName] = {
          name: suggestion.suggested_name,
          unit: suggestion.suggested_unit,
          category: suggestion.suggested_category || "",
          riga_ids: suggestion.riga_ids,
          selected: true,
        };
      }
      return copy;
    });
  };

  const updateSmartItem = (suggestedName, field, value) => {
    setSmartSelected((prev) => ({
      ...prev,
      [suggestedName]: { ...prev[suggestedName], [field]: value },
    }));
  };

  const handleBulkCreate = async () => {
    const items = Object.values(smartSelected)
      .filter((s) => s.selected !== false)
      .map((s) => ({
        name: s.name,
        default_unit: s.unit,
        category_name: s.category || null,
        riga_ids: s.riga_ids,
        note: null,
      }));

    if (items.length === 0) {
      setError("Seleziona almeno un ingrediente da creare.");
      return;
    }

    setBulkLoading(true);
    setError("");
    setBulkResult(null);
    try {
      const resp = await apiFetch(`${FC}/matching/bulk-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const result = await resp.json();
      setBulkResult(result);
      // Ricarica dati
      await loadAll();
      // Ricarica suggerimenti smart
      await loadSmartSuggestions();
    } catch (err) {
      setError(`Errore creazione: ${err.message}`);
    } finally {
      setBulkLoading(false);
    }
  };

  // ─── IGNORA DESCRIZIONI (non ingredienti) ──────────

  const loadIgnoredDescs = async () => {
    try {
      const resp = await apiFetch(`${FC}/matching/ignored-descriptions`);
      if (resp.ok) setIgnoredDescs(await resp.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleIgnoreDescription = async (suggestion) => {
    setIgnoringItem(suggestion.suggested_name);
    setError("");
    try {
      const resp = await apiFetch(`${FC}/matching/ignore-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descrizione_normalizzata: suggestion.suggested_name,
          riga_ids: suggestion.riga_ids,
          motivo: "Non è un ingrediente",
          raw_examples: suggestion.raw_descriptions,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      // Rimuovi dalla lista smart suggestions
      setSmartSuggestions((prev) => prev.filter((s) => s.suggested_name !== suggestion.suggested_name));
      // Rimuovi da selected se c'era
      setSmartSelected((prev) => {
        const copy = { ...prev };
        delete copy[suggestion.suggested_name];
        return copy;
      });
      // Aggiorna pending count e lista ignorati
      await Promise.all([loadPending(), loadIgnoredDescs()]);
    } catch (err) {
      setError(`Errore ignora: ${err.message}`);
    } finally {
      setIgnoringItem(null);
    }
  };

  const handleRestoreIgnored = async (exclusionId) => {
    setError("");
    try {
      const resp = await apiFetch(`${FC}/matching/ignored-descriptions/${exclusionId}`, {
        method: "DELETE",
      });
      if (!resp.ok) throw new Error(await resp.text());
      await Promise.all([loadPending(), loadIgnoredDescs()]);
    } catch (err) {
      setError(`Errore ripristino: ${err.message}`);
    }
  };

  // ─── FORNITORI (Supplier exclusion) ────────────────

  const loadSuppliers = async () => {
    setSuppliersLoading(true);
    try {
      const resp = await apiFetch(`${FC}/matching/suppliers`);
      if (!resp.ok) throw new Error("Errore caricamento fornitori");
      setSuppliers(await resp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setSuppliersLoading(false);
    }
  };

  const handleToggleExclusion = async (supplier) => {
    const key = supplier.fornitore_piva || supplier.fornitore_nome;
    setTogglingSupplier(key);
    setError("");
    try {
      const resp = await apiFetch(`${FC}/matching/suppliers/toggle-exclusion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornitore_nome: supplier.fornitore_nome,
          fornitore_piva: supplier.fornitore_piva || null,
          escluso: supplier.escluso ? 0 : 1,
          motivo_esclusione: supplier.escluso ? null : "Escluso manualmente",
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      // Reload suppliers and pending (exclusion changes pending count)
      await Promise.all([loadSuppliers(), loadPending()]);
    } catch (err) {
      setError(`Errore toggle esclusione: ${err.message}`);
    } finally {
      setTogglingSupplier(null);
    }
  };

  const filteredSuppliers = suppliersFilter
    ? suppliers.filter(
        (s) =>
          (s.fornitore_nome || "").toLowerCase().includes(suppliersFilter.toLowerCase()) ||
          (s.fornitore_piva || "").includes(suppliersFilter)
      )
    : suppliers;

  const excludedCount = suppliers.filter((s) => s.escluso).length;

  const selectedCount = Object.values(smartSelected).filter((s) => s.selected !== false).length;

  // Filtro pending
  const filteredPending = filterText
    ? pending.filter(
        (r) =>
          (r.descrizione || "").toLowerCase().includes(filterText.toLowerCase()) ||
          (r.fornitore_nome || "").toLowerCase().includes(filterText.toLowerCase())
      )
    : pending;

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <RicetteNav current="matching" />
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-orange-900 tracking-wide font-playfair mb-1">
              Matching Fatture
            </h1>
            <p className="text-neutral-600 text-sm">
              Collega le righe delle fatture XML ai tuoi ingredienti per aggiornare automaticamente i prezzi.
            </p>
          </div>
          <div className="flex gap-2 justify-center sm:justify-end flex-wrap">
            <button
              onClick={handleAutoMatch}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-green-700 text-white hover:bg-green-800 shadow transition"
            >
              Auto-match
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {autoResult && (
          <div className="mb-4 rounded-xl border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">
            Auto-match completato: <strong>{autoResult.matched || 0}</strong> righe associate automaticamente.
          </div>
        )}

        {bulkResult && (
          <div className="mb-4 rounded-xl border border-blue-300 bg-blue-50 text-blue-800 px-4 py-3 text-sm">
            Creazione completata: <strong>{bulkResult.created}</strong> ingredienti creati, <strong>{bulkResult.matched}</strong> righe associate.
            {bulkResult.errors?.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer font-semibold text-red-700">Errori ({bulkResult.errors.length})</summary>
                <ul className="list-disc pl-5 text-xs text-red-600 mt-1">
                  {bulkResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* TAB SELECTOR */}
        <div className="flex gap-2 mb-6 border-b border-neutral-200 pb-2">
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
              tab === "pending"
                ? "bg-orange-100 text-orange-900 border border-orange-300 border-b-white -mb-[3px]"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Da associare ({pending.length})
          </button>
          <button
            onClick={() => { setTab("smart"); if (smartSuggestions.length === 0) loadSmartSuggestions(); }}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
              tab === "smart"
                ? "bg-blue-100 text-blue-900 border border-blue-300 border-b-white -mb-[3px]"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Smart Create
          </button>
          <button
            onClick={() => setTab("mappings")}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
              tab === "mappings"
                ? "bg-orange-100 text-orange-900 border border-orange-300 border-b-white -mb-[3px]"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Mappings ({mappings.length})
          </button>
          <button
            onClick={() => { setTab("fornitori"); if (suppliers.length === 0) loadSuppliers(); }}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
              tab === "fornitori"
                ? "bg-purple-100 text-purple-900 border border-purple-300 border-b-white -mb-[3px]"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Fornitori {excludedCount > 0 && `(${excludedCount} esclusi)`}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-neutral-500">Caricamento...</div>
        ) : tab === "pending" ? (
          /* ═══════════ TAB PENDING ═══════════ */
          <div>
            {pending.length === 0 ? (
              <div className="text-center py-12 text-neutral-500">
                Tutte le righe fattura sono state associate!
              </div>
            ) : (
              <>
                {/* Search filter */}
                <div className="mb-4">
                  <input
                    type="text"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="Filtra per descrizione o fornitore..."
                    className="w-full sm:w-96 px-4 py-2 border border-neutral-300 rounded-xl text-sm focus:ring-orange-500 focus:border-orange-500"
                  />
                  {filterText && (
                    <span className="text-xs text-neutral-500 ml-2">
                      {filteredPending.length} di {pending.length} righe
                    </span>
                  )}
                </div>

                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {filteredPending.map((riga) => (
                    <div key={riga.riga_id} className="flex flex-col gap-2">
                      <div
                        onClick={() => handleSelectRiga(riga)}
                        className={`flex flex-wrap items-center gap-4 p-4 rounded-xl border cursor-pointer transition ${
                          selectedRiga?.riga_id === riga.riga_id
                            ? "bg-orange-50 border-orange-300 shadow"
                            : "bg-white border-neutral-200 hover:border-orange-200 hover:bg-orange-50/30"
                        }`}
                      >
                        <div className="flex-1 min-w-[200px]">
                          <div className="font-medium text-neutral-900 text-sm">
                            {riga.descrizione}
                          </div>
                          <div className="text-xs text-neutral-500 mt-0.5">
                            Fornitore: {riga.fornitore_nome || riga.fornitore_piva || "\u2014"}
                          </div>
                        </div>
                        <div className="text-sm text-neutral-700">
                          {riga.quantita} {riga.unita_misura} &middot; {riga.prezzo_unitario != null ? `${Number(riga.prezzo_unitario).toFixed(2)} \u20AC` : "\u2014"}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {riga.data_fattura}
                        </div>
                      </div>

                      {/* Suggerimenti per la riga selezionata */}
                      {selectedRiga?.riga_id === riga.riga_id && (
                        <div className="ml-6 border-l-2 border-orange-300 pl-4 pb-2 space-y-1">
                          {loadingSugg ? (
                            <p className="text-xs text-neutral-500">Caricamento suggerimenti...</p>
                          ) : suggestions.length === 0 ? (
                            <p className="text-xs text-neutral-500">
                              Nessun suggerimento. Usa la tab "Smart Create" per creare l'ingrediente automaticamente.
                            </p>
                          ) : (
                            suggestions.map((s) => (
                              <div
                                key={s.ingredient_id}
                                className="flex items-center justify-between gap-3 bg-white border border-neutral-200 rounded-lg p-3 hover:border-green-300 transition"
                              >
                                <div>
                                  <span className="font-medium text-sm text-neutral-900">
                                    {s.ingredient_name}
                                  </span>
                                  <span className="text-xs text-neutral-500 ml-2">
                                    ({s.default_unit}) &middot; {s.confidence.toFixed(0)}%
                                  </span>
                                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                                    s.reason === "exact_desc" ? "bg-green-100 text-green-700"
                                      : s.reason === "same_supplier" ? "bg-blue-100 text-blue-700"
                                      : "bg-yellow-100 text-yellow-700"
                                  }`}>
                                    {s.reason}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleConfirm(riga.riga_id, s.ingredient_id)}
                                  className="px-3 py-1 text-xs font-semibold bg-green-700 text-white rounded-lg hover:bg-green-800 transition"
                                >
                                  Conferma
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : tab === "smart" ? (
          /* ═══════════ TAB SMART CREATE ═══════════ */
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                onClick={loadSmartSuggestions}
                disabled={smartLoading}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition ${
                  smartLoading
                    ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {smartLoading ? "Analisi in corso..." : "Analizza righe pending"}
              </button>

              {smartSuggestions.length > 0 && (
                <>
                  <button
                    onClick={() => {
                      const sel = {};
                      for (const s of smartSuggestions) {
                        if (!s.existing_match) {
                          sel[s.suggested_name] = {
                            name: s.suggested_name,
                            unit: s.suggested_unit,
                            category: s.suggested_category || "",
                            riga_ids: s.riga_ids,
                            selected: true,
                          };
                        }
                      }
                      setSmartSelected(sel);
                    }}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                  >
                    Seleziona tutti
                  </button>
                  <button
                    onClick={() => setSmartSelected({})}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border border-neutral-300 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 transition"
                  >
                    Deseleziona tutti
                  </button>
                </>
              )}

              {selectedCount > 0 && (
                <button
                  onClick={handleBulkCreate}
                  disabled={bulkLoading}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition ${
                    bulkLoading
                      ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                      : "bg-green-700 text-white hover:bg-green-800"
                  }`}
                >
                  {bulkLoading ? "Creazione..." : `Crea ${selectedCount} ingredienti`}
                </button>
              )}
            </div>

            {smartSuggestions.length === 0 && !smartLoading ? (
              <div className="text-center py-12 text-neutral-500">
                Clicca "Analizza righe pending" per avviare l'analisi intelligente delle fatture.
              </div>
            ) : smartLoading ? (
              <div className="text-center py-12 text-neutral-500">Analisi in corso...</div>
            ) : (
              <>
                <p className="text-sm text-neutral-600 mb-4">
                  Trovati <strong>{smartSuggestions.length}</strong> possibili ingredienti.
                  Seleziona quelli da creare, modifica nome/unità/categoria se necessario, poi clicca "Crea".
                </p>

                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {smartSuggestions.map((s) => {
                    const isSelected = !!smartSelected[s.suggested_name];
                    const editData = smartSelected[s.suggested_name];
                    const hasExisting = !!s.existing_match;

                    return (
                      <div
                        key={s.suggested_name}
                        className={`rounded-xl border p-4 transition ${
                          isSelected
                            ? "bg-blue-50 border-blue-300 shadow-sm"
                            : hasExisting
                            ? "bg-yellow-50/50 border-yellow-200"
                            : "bg-white border-neutral-200"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Checkbox + Ignora */}
                          <div className="mt-1 flex-shrink-0 flex flex-col items-center gap-1">
                            <label>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSmartItem(s.suggested_name, s)}
                                className="w-4 h-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                              />
                            </label>
                            <Tooltip label="Non è un ingrediente — ignora">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleIgnoreDescription(s); }}
                                disabled={ignoringItem === s.suggested_name}
                                className={`px-1.5 py-0.5 text-[10px] font-semibold rounded transition ${
                                  ignoringItem === s.suggested_name
                                    ? "bg-neutral-200 text-neutral-400"
                                    : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                              }`}
                              >
                                {ignoringItem === s.suggested_name ? "..." : "Ignora"}
                              </button>
                            </Tooltip>
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Nome + badges */}
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              {isSelected ? (
                                <input
                                  type="text"
                                  value={editData.name}
                                  onChange={(e) => updateSmartItem(s.suggested_name, "name", e.target.value)}
                                  className="font-semibold text-sm text-neutral-900 border border-blue-300 rounded-lg px-2 py-1 bg-white flex-1 min-w-[200px] focus:ring-blue-500 focus:border-blue-500"
                                />
                              ) : (
                                <span className="font-semibold text-sm text-neutral-900">
                                  {s.suggested_name}
                                </span>
                              )}

                              <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full border border-neutral-200">
                                {s.righe_count} {s.righe_count === 1 ? "riga" : "righe"}
                              </span>

                              {s.has_bio && (
                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">BIO</span>
                              )}
                              {s.has_dop_igp && (
                                <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">DOP/IGP</span>
                              )}
                            </div>

                            {/* Existing match warning */}
                            {hasExisting && (
                              <div className="text-xs text-yellow-700 bg-yellow-100 border border-yellow-200 rounded-lg px-2 py-1 mb-1">
                                Ingrediente simile esistente: <strong>{s.existing_match.name}</strong> (similarità {s.existing_match.score}%)
                              </div>
                            )}

                            {/* Info riga */}
                            <div className="text-xs text-neutral-500 mb-1">
                              Fornitori: {s.fornitori.join(", ")}
                            </div>
                            <div className="text-xs text-neutral-400">
                              Es: {s.raw_descriptions.slice(0, 2).join(" | ")}
                            </div>

                            {/* Edit fields when selected */}
                            {isSelected && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                <select
                                  value={editData.unit}
                                  onChange={(e) => updateSmartItem(s.suggested_name, "unit", e.target.value)}
                                  className="text-xs border border-blue-200 rounded-lg px-2 py-1 bg-white focus:ring-blue-500"
                                >
                                  <option value="kg">kg</option>
                                  <option value="g">g</option>
                                  <option value="L">L</option>
                                  <option value="ml">ml</option>
                                  <option value="cl">cl</option>
                                  <option value="pz">pz</option>
                                </select>
                                <input
                                  type="text"
                                  value={editData.category}
                                  onChange={(e) => updateSmartItem(s.suggested_name, "category", e.target.value)}
                                  placeholder="Categoria (opzionale)"
                                  className="text-xs border border-blue-200 rounded-lg px-2 py-1 bg-white flex-1 min-w-[150px] focus:ring-blue-500"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom action bar */}
                {selectedCount > 0 && (
                  <div className="mt-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <span className="text-sm text-blue-800">
                      <strong>{selectedCount}</strong> ingredienti selezionati per la creazione
                    </span>
                    <button
                      onClick={handleBulkCreate}
                      disabled={bulkLoading}
                      className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
                        bulkLoading
                          ? "bg-neutral-300 text-neutral-500"
                          : "bg-green-700 text-white hover:bg-green-800"
                      }`}
                    >
                      {bulkLoading ? "Creazione..." : "Crea e Associa tutto"}
                    </button>
                  </div>
                )}

                {/* Sezione descrizioni ignorate */}
                <div className="mt-6 border-t border-neutral-200 pt-4">
                  <button
                    onClick={() => { setShowIgnored(!showIgnored); if (!showIgnored && ignoredDescs.length === 0) loadIgnoredDescs(); }}
                    className="text-sm text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
                  >
                    <span>{showIgnored ? "▾" : "▸"}</span>
                    Descrizioni ignorate {ignoredDescs.length > 0 && `(${ignoredDescs.length})`}
                  </button>

                  {showIgnored && (
                    <div className="mt-2 space-y-1">
                      {ignoredDescs.length === 0 ? (
                        <p className="text-xs text-neutral-400">Nessuna descrizione ignorata.</p>
                      ) : (
                        ignoredDescs.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center justify-between bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2"
                          >
                            <div>
                              <span className="text-sm text-neutral-700 font-medium">{d.descrizione_normalizzata}</span>
                              <span className="text-xs text-neutral-400 ml-2">({d.n_righe} righe)</span>
                              {d.raw_examples && (
                                <div className="text-xs text-neutral-400 mt-0.5 truncate max-w-md">
                                  {d.raw_examples}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleRestoreIgnored(d.id)}
                              className="px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 transition"
                            >
                              Ripristina
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : tab === "mappings" ? (
          /* ═══════════ TAB MAPPINGS ═══════════ */
          <div>
            {mappings.length === 0 ? (
              <div className="text-center py-12 text-neutral-500">
                Nessun mapping attivo.
              </div>
            ) : (
              <div className="border border-neutral-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-100 text-neutral-700">
                    <tr>
                      <th className="p-3 text-left font-semibold">Descrizione fornitore</th>
                      <th className="p-3 text-left font-semibold">Fornitore</th>
                      <th className="p-3 text-left font-semibold">Ingrediente</th>
                      <th className="p-3 text-center font-semibold">Fattore conv.</th>
                      <th className="p-3 text-right font-semibold">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((m) => (
                      <tr key={m.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                        <td className="p-3 text-neutral-900">{m.descrizione_fornitore}</td>
                        <td className="p-3 text-neutral-600">{m.fornitore_nome || "\u2014"}</td>
                        <td className="p-3 font-medium text-neutral-900">{m.ingredient_name || "\u2014"}</td>
                        <td className="p-3 text-center text-neutral-600">{m.fattore_conversione || 1}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteMapping(m.id)}
                            className="px-2 py-1 text-xs bg-red-100 text-red-800 border border-red-300 rounded hover:bg-red-200 transition"
                          >
                            Elimina
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* ═══════════ TAB FORNITORI ═══════════ */
          <div>
            <div className="mb-4">
              <p className="text-sm text-neutral-600 mb-3">
                Escludi i fornitori che non vendono ingredienti (servizi, attrezzature, consulenze, ecc.).
                Le loro righe fattura non appariranno nel matching.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={loadSuppliers}
                  disabled={suppliersLoading}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold shadow transition ${
                    suppliersLoading
                      ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                      : "bg-purple-600 text-white hover:bg-purple-700"
                  }`}
                >
                  {suppliersLoading ? "Caricamento..." : "Aggiorna lista"}
                </button>
                <input
                  type="text"
                  value={suppliersFilter}
                  onChange={(e) => setSuppliersFilter(e.target.value)}
                  placeholder="Filtra per nome o P.IVA..."
                  className="w-full sm:w-72 px-4 py-2 border border-neutral-300 rounded-xl text-sm focus:ring-purple-500 focus:border-purple-500"
                />
                {suppliersFilter && (
                  <span className="text-xs text-neutral-500">
                    {filteredSuppliers.length} di {suppliers.length}
                  </span>
                )}
              </div>
            </div>

            {suppliersLoading ? (
              <div className="text-center py-12 text-neutral-500">Caricamento fornitori...</div>
            ) : suppliers.length === 0 ? (
              <div className="text-center py-12 text-neutral-500">
                Nessun fornitore trovato nelle righe fattura pendenti.
              </div>
            ) : (
              <div className="border border-neutral-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-100 text-neutral-700">
                    <tr>
                      <th className="p-3 text-left font-semibold">Fornitore</th>
                      <th className="p-3 text-left font-semibold">P.IVA</th>
                      <th className="p-3 text-left font-semibold">Categoria</th>
                      <th className="p-3 text-center font-semibold">Righe pending</th>
                      <th className="p-3 text-center font-semibold">Stato</th>
                      <th className="p-3 text-right font-semibold">Azione</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuppliers.map((s) => {
                      const key = s.fornitore_piva || s.fornitore_nome;
                      const isToggling = togglingSupplier === key;
                      return (
                        <tr
                          key={key}
                          className={`border-t border-neutral-100 transition ${
                            s.escluso ? "bg-red-50/50" : "hover:bg-neutral-50"
                          }`}
                        >
                          <td className="p-3 text-neutral-900 font-medium">{s.fornitore_nome || "\u2014"}</td>
                          <td className="p-3 text-neutral-600 text-xs font-mono">{s.fornitore_piva || "\u2014"}</td>
                          <td className="p-3 text-neutral-600 text-xs">{s.categoria_nome || "\u2014"}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                              s.n_righe_pending > 50
                                ? "bg-orange-100 text-orange-800"
                                : s.n_righe_pending > 10
                                ? "bg-blue-100 text-blue-800"
                                : "bg-neutral-100 text-neutral-600"
                            }`}>
                              {s.n_righe_pending}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {s.escluso ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                                Escluso
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                                Attivo
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleToggleExclusion(s)}
                              disabled={isToggling}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                isToggling
                                  ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                                  : s.escluso
                                  ? "bg-green-100 text-green-800 border border-green-300 hover:bg-green-200"
                                  : "bg-red-100 text-red-800 border border-red-300 hover:bg-red-200"
                              }`}
                            >
                              {isToggling ? "..." : s.escluso ? "Riattiva" : "Escludi"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {excludedCount > 0 && (
              <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm text-purple-800">
                <strong>{excludedCount}</strong> fornitor{excludedCount === 1 ? "e" : "i"} esclus{excludedCount === 1 ? "o" : "i"} dal matching.
                Le loro righe fattura non vengono considerate.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
