// @version: v2.1-mattoni — M.I primitives (Btn, StatusBadge)
// Dettaglio Ricetta — visualizzazione con food cost calcolato
// Mostra: header, ingredienti con costi, totale, % food cost

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";
import { Btn, StatusBadge } from "../../components/ui";

const FC = `${API_BASE}/foodcost`;

function FcBadge({ pct }) {
  if (pct == null) return <span className="text-neutral-400">n/d</span>;
  let color = "bg-green-100 text-green-800 border-green-300";
  if (pct > 35) color = "bg-yellow-100 text-yellow-800 border-yellow-300";
  if (pct > 45) color = "bg-red-100 text-red-800 border-red-300";
  return (
    <span className={`text-sm font-bold px-3 py-1 rounded-full border ${color}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

export default function RicetteDettaglio() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ricetta, setRicetta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await apiFetch(`${FC}/ricette/${id}`);
      if (!resp.ok) throw new Error("Ricetta non trovata");
      setRicetta(await resp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <p className="text-neutral-500">Caricamento...</p>
      </div>
    );
  }

  if (error || !ricetta) {
    return (
      <div className="min-h-screen bg-brand-cream p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-2xl p-10 border">
          <p className="text-red-600 mb-4">{error || "Ricetta non trovata"}</p>
          <Btn variant="secondary" size="md" onClick={() => navigate("/ricette/archivio")}>
            ← Torna all'archivio
          </Btn>
        </div>
      </div>
    );
  }

  const r = ricetta;

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <RicetteNav current="archivio" />
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-8 sm:p-12 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-sm font-mono bg-slate-700 text-white px-2 py-0.5 rounded">
                R{String(r.id).padStart(3, "0")}
              </span>
              <h1 className="text-3xl sm:text-4xl font-bold text-orange-900 font-playfair">
                {r.name}
              </h1>
              {r.is_base && (
                <StatusBadge tone="brand" size="sm">Base</StatusBadge>
              )}
            </div>
            <p className="text-neutral-600 text-sm">
              {r.category_name || "Senza categoria"} &middot; Resa: {r.yield_qty} {r.yield_unit}
              {r.prep_time ? ` \u00B7 Prep: ${r.prep_time} min` : ""}
            </p>
          </div>
          <div className="flex gap-2 justify-center sm:justify-end flex-wrap">
            <Btn variant="primary" size="md" onClick={() => navigate(`/ricette/modifica/${r.id}`)}>
              Modifica
            </Btn>
          </div>
        </div>

        {r.note && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 text-sm text-orange-900">
            {r.note}
          </div>
        )}

        {/* RIEPILOGO FOOD COST */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-center">
            <div className="text-xs text-neutral-500 mb-1">Costo totale</div>
            <div className="text-xl font-bold text-neutral-900">
              {r.total_cost != null ? `${r.total_cost.toFixed(2)} \u20AC` : "\u2014"}
            </div>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-center">
            <div className="text-xs text-neutral-500 mb-1">Costo / {r.yield_unit || "unit\u00E0"}</div>
            <div className="text-xl font-bold text-neutral-900">
              {r.cost_per_unit != null ? `${r.cost_per_unit.toFixed(2)} \u20AC` : "\u2014"}
            </div>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-center">
            <div className="text-xs text-neutral-500 mb-1">Prezzo vendita</div>
            <div className="text-xl font-bold text-neutral-900">
              {r.selling_price != null ? `${r.selling_price.toFixed(2)} \u20AC` : "\u2014"}
            </div>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-center">
            <div className="text-xs text-neutral-500 mb-1">Food Cost %</div>
            <div className="text-xl">
              <FcBadge pct={r.food_cost_pct} />
            </div>
          </div>
        </div>

        {/* TABELLA INGREDIENTI */}
        <h2 className="text-lg font-semibold font-playfair text-neutral-800 mb-3">
          Composizione ({r.items.length} righe)
        </h2>

        <div className="border border-neutral-200 rounded-2xl overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-700">
              <tr>
                <th className="p-3 text-left font-semibold">#</th>
                <th className="p-3 text-left font-semibold">Ingrediente / Sub-ricetta</th>
                <th className="p-3 text-right font-semibold">Q.t\u00E0</th>
                <th className="p-3 text-left font-semibold">Unit\u00E0</th>
                <th className="p-3 text-right font-semibold">Costo unit.</th>
                <th className="p-3 text-right font-semibold">Costo riga</th>
                <th className="p-3 text-left font-semibold">Note</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((item, idx) => (
                <tr key={item.id} className={`border-t border-neutral-100 ${item.sub_recipe_id ? "bg-blue-50/30" : ""}`}>
                  <td className="p-3 text-neutral-500">{idx + 1}</td>
                  <td className="p-3 font-medium text-neutral-900">
                    {item.sub_recipe_id ? (
                      <span className="flex items-center gap-2">
                        <span className="text-xs bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded font-bold">SUB</span>
                        {item.sub_recipe_name || `Ricetta #${item.sub_recipe_id}`}
                      </span>
                    ) : (
                      item.ingredient_name || `Ing. #${item.ingredient_id}`
                    )}
                  </td>
                  <td className="p-3 text-right">{item.qty}</td>
                  <td className="p-3 text-neutral-600">{item.unit}</td>
                  <td className="p-3 text-right text-neutral-600">
                    {item.unit_cost != null ? `${item.unit_cost.toFixed(4)} \u20AC` : "\u2014"}
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {item.line_cost != null ? `${item.line_cost.toFixed(2)} \u20AC` : "\u2014"}
                  </td>
                  <td className="p-3 text-neutral-500 text-xs">{item.note || ""}</td>
                </tr>
              ))}
            </tbody>
            {r.total_cost != null && (
              <tfoot className="bg-orange-50 border-t-2 border-orange-300">
                <tr>
                  <td colSpan={5} className="p-3 text-right font-semibold text-orange-900">
                    TOTALE
                  </td>
                  <td className="p-3 text-right font-bold text-orange-900 text-base">
                    {r.total_cost.toFixed(2)} \u20AC
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* INFO AGGIUNTIVE */}
        <div className="text-xs text-neutral-400 text-right">
          Creata: {r.created_at || "\u2014"} &middot; Aggiornata: {r.updated_at || "\u2014"}
        </div>

      </div>
    </div>
  );
}
