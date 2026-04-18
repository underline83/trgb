// @version: v2.1-mattoni — M.I primitives (Btn) su back/save/delete/conversioni
// Storico prezzi ingrediente + conversioni unità personalizzate

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";
import { Btn } from "../../components/ui";

const FOODCOST_BASE = `${API_BASE}/foodcost`;
const FC = FOODCOST_BASE;

export default function RicetteIngredientiPrezzi() {
  const navigate = useNavigate();
  const { id } = useParams(); // id ingrediente

  const [loading, setLoading] = useState(true);
  const [ingrediente, setIngrediente] = useState(null);
  const [prezzi, setPrezzi] = useState([]);

  const [mediaPrezzo, setMediaPrezzo] = useState(null);
  const [ultimoPrezzo, setUltimoPrezzo] = useState(null);

  // form nuovo prezzo
  const [fornitore, setFornitore] = useState("");
  const [prezzo, setPrezzo] = useState("");
  const [data, setData] = useState(
    new Date().toISOString().slice(0, 10) // yyyy-mm-dd
  );
  const [note, setNote] = useState("");

  // Conversioni personalizzate
  const [conversions, setConversions] = useState([]);
  const [showConversions, setShowConversions] = useState(false);
  const [convFromUnit, setConvFromUnit] = useState("pz");
  const [convToUnit, setConvToUnit] = useState("kg");
  const [convFactor, setConvFactor] = useState("");
  const [convNote, setConvNote] = useState("");

  const loadPrezzi = async () => {
    setLoading(true);
    const r = await apiFetch(`${FOODCOST_BASE}/ingredienti/${id}/prezzi`);
    if (!r.ok) {
      setLoading(false);
      return;
    }
    const dataJson = await r.json();

    setIngrediente(dataJson.ingrediente);
    setPrezzi(dataJson.prezzi || []);
    setMediaPrezzo(dataJson.media_prezzo ?? null);
    setUltimoPrezzo(dataJson.ultimo_prezzo ?? null);
    setLoading(false);
  };

  useEffect(() => {
    loadPrezzi();
  }, [id]);

  const addPrezzo = async () => {
    if (!fornitore.trim() || !prezzo) {
      alert("Inserisci almeno fornitore e prezzo.");
      return;
    }

    await apiFetch(`${FOODCOST_BASE}/ingredienti/${id}/prezzi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fornitore_nome: fornitore,
        prezzo_unitario: parseFloat(prezzo),
        data_riferimento: data || null,
        note: note || null,
      }),
    });

    setFornitore("");
    setPrezzo("");
    setNote("");
    await loadPrezzi();
  };

  const deletePrezzo = async (prezzoId) => {
    if (!window.confirm("Eliminare questo prezzo dallo storico?")) return;

    await apiFetch(`${FOODCOST_BASE}/prezzi/${prezzoId}`, {
      method: "DELETE",
    });

    await loadPrezzi();
  };

  // ─── CONVERSIONI PERSONALIZZATE ──────────────

  const loadConversions = async () => {
    try {
      const resp = await apiFetch(`${FC}/ingredients/${id}/conversions`);
      if (resp.ok) setConversions(await resp.json());
    } catch (err) {
      console.error(err);
    }
  };

  const addConversion = async () => {
    if (!convFactor || parseFloat(convFactor) <= 0) {
      alert("Inserisci un fattore di conversione valido.");
      return;
    }
    try {
      const resp = await apiFetch(`${FC}/ingredients/${id}/conversions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_unit: convFromUnit,
          to_unit: convToUnit,
          factor: parseFloat(convFactor),
          note: convNote || null,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        alert(`Errore: ${err}`);
        return;
      }
      setConvFactor("");
      setConvNote("");
      await loadConversions();
    } catch (err) {
      alert(`Errore: ${err.message}`);
    }
  };

  const deleteConversion = async (convId) => {
    if (!window.confirm("Eliminare questa conversione?")) return;
    await apiFetch(`${FC}/ingredients/conversions/${convId}`, { method: "DELETE" });
    await loadConversions();
  };

  useEffect(() => {
    if (showConversions && conversions.length === 0) loadConversions();
  }, [showConversions]);

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <RicetteNav current="ingredienti" />
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">

        {/* BACK */}
        <div className="flex justify-between mb-6">
          <Btn variant="ghost" size="md" onClick={() => navigate(-1)}>
            ← Torna a Ingredienti
          </Btn>
        </div>

        {/* HEADER */}
        <h1 className="text-3xl sm:text-4xl font-bold text-orange-900 tracking-wide font-playfair mb-2">
          💶 Prezzi — {ingrediente ? ingrediente.nome : "Ingrediente"}
        </h1>

        {ingrediente && (
          <p className="text-neutral-600 mb-6">
            Unità:{" "}
            <span className="font-semibold">{ingrediente.unita || "–"}</span>{" "}
            {ingrediente.categoria && (
              <>
                • Categoria:{" "}
                <span className="font-semibold">{ingrediente.categoria}</span>
              </>
            )}
          </p>
        )}

        {/* RIEPILOGO PREZZI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 shadow-inner">
            <div className="text-sm text-neutral-600 mb-1">
              Prezzo medio storico
            </div>
            <div className="text-2xl font-bold text-orange-900">
              {mediaPrezzo != null ? `${mediaPrezzo.toFixed(2)} €/unità` : "—"}
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 shadow-inner">
            <div className="text-sm text-neutral-600 mb-1">
              Ultimo prezzo registrato
            </div>
            <div className="text-2xl font-bold text-green-900">
              {ultimoPrezzo != null ? `${ultimoPrezzo.toFixed(2)} €/unità` : "—"}
            </div>
          </div>
        </div>

        {/* FORM NUOVO PREZZO */}
        <div className="bg-neutral-50 border border-neutral-300 rounded-2xl p-6 shadow-inner mb-10">
          <h2 className="text-xl font-semibold font-playfair mb-4">
            ➕ Aggiungi prezzo
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
            <input
              type="text"
              placeholder="Fornitore"
              className="border p-2 rounded"
              value={fornitore}
              onChange={(e) => setFornitore(e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Prezzo unitario (€)"
              className="border p-2 rounded"
              value={prezzo}
              onChange={(e) => setPrezzo(e.target.value)}
            />
            <input
              type="date"
              className="border p-2 rounded"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
            <input
              type="text"
              placeholder="Note (opzionale)"
              className="border p-2 rounded"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <Btn variant="chip" tone="amber" size="md" onClick={addPrezzo}>
            Salva prezzo
          </Btn>
        </div>

        {/* STORICO PREZZI */}
        <h2 className="text-2xl font-playfair font-semibold mb-4">
          📚 Storico prezzi
        </h2>

        {loading ? (
          <div className="text-neutral-600 py-8 text-center">
            Caricamento storico prezzi…
          </div>
        ) : prezzi.length === 0 ? (
          <div className="text-neutral-500 italic">
            Nessun prezzo registrato per questo ingrediente.
          </div>
        ) : (
          <div className="border border-neutral-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100">
                <tr>
                  <th className="p-3 text-left">Data</th>
                  <th className="p-3 text-left">Fornitore</th>
                  <th className="p-3 text-left">Prezzo €/unità</th>
                  <th className="p-3 text-left">Note</th>
                  <th className="p-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {prezzi.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3">
                      {p.data_riferimento || "—"}
                    </td>
                    <td className="p-3">{p.fornitore_nome}</td>
                    <td className="p-3">
                      {p.prezzo_unitario != null
                        ? `${p.prezzo_unitario.toFixed(2)} €`
                        : "—"}
                    </td>
                    <td className="p-3">{p.note || "—"}</td>
                    <td className="p-3 text-right">
                      <Btn variant="chip" tone="red" size="sm" onClick={() => deletePrezzo(p.id)}>
                        Elimina
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ═══════════ CONVERSIONI PERSONALIZZATE ═══════════ */}
        <div className="mt-10 border-t border-neutral-200 pt-6">
          <button
            onClick={() => setShowConversions(!showConversions)}
            className="text-lg font-playfair font-semibold text-orange-900 hover:text-orange-700 flex items-center gap-2"
          >
            <span>{showConversions ? "▾" : "▸"}</span>
            Conversioni unità personalizzate
            {conversions.length > 0 && (
              <span className="text-xs font-mono font-normal bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                {conversions.length}
              </span>
            )}
          </button>

          <p className="text-sm text-neutral-500 mt-1 mb-4">
            Definisci equivalenze tra unità per questo ingrediente (es. 1 pz = 0.06 kg per le uova, 1 mazzetto = 0.03 kg).
            Le conversioni standard (kg↔g, L↔ml↔cl) funzionano già automaticamente.
          </p>

          {showConversions && (
            <div>
              {/* Form nuova conversione */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-4">
                <h3 className="text-sm font-semibold text-blue-800 mb-3">Aggiungi conversione</h3>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-xs text-neutral-600 block mb-1">1 x</label>
                    <select
                      value={convFromUnit}
                      onChange={(e) => setConvFromUnit(e.target.value)}
                      className="border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="pz">pz</option>
                      <option value="mazzetto">mazzetto</option>
                      <option value="bottiglia">bottiglia</option>
                      <option value="lattina">lattina</option>
                      <option value="confezione">confezione</option>
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="L">L</option>
                      <option value="ml">ml</option>
                      <option value="cl">cl</option>
                    </select>
                  </div>
                  <div className="text-sm text-neutral-500 pb-2">=</div>
                  <div>
                    <label className="text-xs text-neutral-600 block mb-1">Equivale a</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.06"
                      value={convFactor}
                      onChange={(e) => setConvFactor(e.target.value)}
                      className="border border-blue-200 rounded-lg px-3 py-2 text-sm w-28 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 block mb-1">Unità dest.</label>
                    <select
                      value={convToUnit}
                      onChange={(e) => setConvToUnit(e.target.value)}
                      className="border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="L">L</option>
                      <option value="ml">ml</option>
                      <option value="cl">cl</option>
                      <option value="pz">pz</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 block mb-1">Note</label>
                    <input
                      type="text"
                      placeholder="(opzionale)"
                      value={convNote}
                      onChange={(e) => setConvNote(e.target.value)}
                      className="border border-blue-200 rounded-lg px-3 py-2 text-sm w-36 bg-white"
                    />
                  </div>
                  <Btn variant="chip" tone="blue" size="md" onClick={addConversion}>
                    Aggiungi
                  </Btn>
                </div>
              </div>

              {/* Lista conversioni esistenti */}
              {conversions.length === 0 ? (
                <p className="text-sm text-neutral-400 italic">
                  Nessuna conversione personalizzata. Le conversioni standard (kg↔g, L↔ml) sono già attive.
                </p>
              ) : (
                <div className="space-y-2">
                  {conversions.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between bg-white border border-neutral-200 rounded-xl px-4 py-3"
                    >
                      <div>
                        <span className="font-medium text-sm text-neutral-900">
                          1 {c.from_unit} = {c.factor} {c.to_unit}
                        </span>
                        {c.note && (
                          <span className="text-xs text-neutral-400 ml-2">({c.note})</span>
                        )}
                      </div>
                      <Btn variant="chip" tone="red" size="sm" onClick={() => deleteConversion(c.id)}>
                        Elimina
                      </Btn>
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