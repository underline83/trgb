// @version: v2.0-matching-fatture
// UI Matching Fatture → Ingredienti
// Collega righe fatture XML importate agli ingredienti del food cost

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";

const FC = `${API_BASE}/foodcost`;

export default function RicetteMatching() {
  const navigate = useNavigate();

  const [pending, setPending] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("pending"); // pending | mappings

  // Stato per suggerimenti matching
  const [selectedRiga, setSelectedRiga] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSugg, setLoadingSugg] = useState(false);

  // Auto-match stats
  const [autoResult, setAutoResult] = useState(null);

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

  // Conferma match
  const handleConfirm = async (rigaId, ingredientId) => {
    setError("");
    try {
      const resp = await apiFetch(`${FC}/matching/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riga_id: rigaId, ingredient_id: ingredientId }),
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

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <RicetteNav current="matching" />
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 sm:p-12 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-1">
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

        {/* TAB SELECTOR */}
        <div className="flex gap-2 mb-6 border-b border-neutral-200 pb-2">
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
              tab === "pending"
                ? "bg-amber-100 text-amber-900 border border-amber-300 border-b-white -mb-[3px]"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Da associare ({pending.length})
          </button>
          <button
            onClick={() => setTab("mappings")}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
              tab === "mappings"
                ? "bg-amber-100 text-amber-900 border border-amber-300 border-b-white -mb-[3px]"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Mappings attivi ({mappings.length})
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-neutral-500">Caricamento...</div>
        ) : tab === "pending" ? (
          /* TAB PENDING */
          <div>
            {pending.length === 0 ? (
              <div className="text-center py-12 text-neutral-500">
                Tutte le righe fattura sono state associate. Ottimo!
              </div>
            ) : (
              <div className="space-y-2">
                {pending.map((riga) => (
                  <div key={riga.riga_id} className="flex flex-col gap-2">
                    <div
                      onClick={() => handleSelectRiga(riga)}
                      className={`flex flex-wrap items-center gap-4 p-4 rounded-xl border cursor-pointer transition ${
                        selectedRiga?.riga_id === riga.riga_id
                          ? "bg-amber-50 border-amber-300 shadow"
                          : "bg-white border-neutral-200 hover:border-amber-200 hover:bg-amber-50/30"
                      }`}
                    >
                      <div className="flex-1 min-w-[200px]">
                        <div className="font-medium text-neutral-900 text-sm">
                          {riga.descrizione}
                        </div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          Fornitore: {riga.fornitore_nome || riga.fornitore_piva || "\u2014"}
                          {riga.codice_articolo && ` \u00B7 Cod: ${riga.codice_articolo}`}
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
                      <div className="ml-6 border-l-2 border-amber-300 pl-4 pb-2 space-y-1">
                        {loadingSugg ? (
                          <p className="text-xs text-neutral-500">Caricamento suggerimenti...</p>
                        ) : suggestions.length === 0 ? (
                          <p className="text-xs text-neutral-500">
                            Nessun suggerimento trovato. Crea prima l'ingrediente nella sezione Ingredienti.
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
                                  ({s.default_unit}) &middot; Score: {(s.score * 100).toFixed(0)}%
                                </span>
                                {s.match_type && (
                                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                                    s.match_type === "exact" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                                  }`}>
                                    {s.match_type}
                                  </span>
                                )}
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
            )}
          </div>
        ) : (
          /* TAB MAPPINGS */
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
                        <td className="p-3 text-neutral-600">{m.supplier_name || "\u2014"}</td>
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
        )}

      </div>
    </div>
  );
}
