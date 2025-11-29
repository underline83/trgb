// @version: v1.0-prezzi-ingredienti
// Storico prezzi ingrediente (multi-fornitore, media, ultimo prezzo)

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const API_BASE = "http://127.0.0.1:8000/foodcost";

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

  const loadPrezzi = async () => {
    setLoading(true);
    const r = await fetch(`${API_BASE}/ingredienti/${id}/prezzi`);
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

    await fetch(`${API_BASE}/ingredienti/${id}/prezzi`, {
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

    await fetch(`${API_BASE}/prezzi/${prezzoId}`, {
      method: "DELETE",
    });

    await loadPrezzi();
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">

        {/* BACK */}
        <div className="flex justify-between mb-6">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-xl text-sm border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 transition shadow-sm"
          >
            ← Torna a Ingredienti
          </button>

          <button
            onClick={() => navigate("/ricette")}
            className="px-4 py-2 rounded-xl text-sm border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 transition shadow-sm"
          >
            Menu Ricette
          </button>
        </div>

        {/* HEADER */}
        <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
          💶 Prezzi — {ingrediente ? ingrediente.nome : "Ingrediente"}
        </h1>

        {ingrediente && (
          <p className="text-neutral-600 mb-6">
            Unità: <span className="font-semibold">{ingrediente.unita || "–"}</span>{" "}
            {ingrediente.categoria && (
              <>• Categoria: <span className="font-semibold">{ingrediente.categoria}</span></>
            )}
          </p>
        )}

        {/* RIEPILOGO PREZZI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-inner">
            <div className="text-sm text-neutral-600 mb-1">Prezzo medio storico</div>
            <div className="text-2xl font-bold text-amber-900">
              {mediaPrezzo != null ? `${mediaPrezzo.toFixed(2)} €/unità` : "—"}
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 shadow-inner">
            <div className="text-sm text-neutral-600 mb-1">Ultimo prezzo registrato</div>
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

          <button
            onClick={addPrezzo}
            className="px-6 py-3 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-semibold shadow transition"
          >
            Salva prezzo
          </button>
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
                      <button
                        className="px-3 py-1 text-xs bg-red-100 text-red-800 border border-red-300 rounded"
                        onClick={() => deletePrezzo(p.id)}
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
    </div>
  );
}