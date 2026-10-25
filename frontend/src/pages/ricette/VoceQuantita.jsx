// @version: v1.0 — quantità + unità di una voce ricetta, con «qb» (2026-10-25)
// Modulo: ricette
//
// Una voce «qb» (quanto basta: sale, pepe, olio a crudo…) non ha quantità: si
// salva con qty 0 e unit "qb", resta nell'elenco e negli allergeni, ed è fuori
// dal food cost. Il backend (RecipeItemIn._qty_o_qb, stesso _is_qb dell'import)
// accetta qty 0 solo con "qb". Usato da RicetteModifica e RicetteNuova.

import React from "react";

export const QB = "qb";
export const UNITA_VOCE = ["kg", "g", "L", "ml", "cl", "pz", "n", "porzioni"];

export const isQb = (u) => (u || "").trim().toLowerCase() === QB;

// Voce dall'API → riga del form (qb: quantità vuota)
export function rigaDaVoce(it) {
  const qb = isQb(it.unit);
  return {
    qty: qb ? "" : String(it.qty ?? ""),
    unit: qb ? QB : (it.unit || "g"),
  };
}

// Righe del form → voci per l'API. Le righe senza ingrediente/sotto-ricetta
// si ignorano (righe vuote). Una riga scelta senza quantità non sparisce più in
// silenzio: torna un errore da mostrare.
export function vociDaSalvare(rows, nomeRiga = () => "") {
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const it = rows[i];
    const scelto = it.tipo === "ingrediente" ? it.ingredient_id : it.sub_recipe_id;
    if (!scelto) continue;
    const qb = isQb(it.unit);
    const qty = qb ? 0 : parseFloat(String(it.qty).replace(",", "."));
    if (!qb && !(qty > 0)) {
      const nome = nomeRiga(it);
      return {
        items: null,
        errore: `Riga ${i + 1}${nome ? ` (${nome})` : ""}: manca la quantità. Scrivila, oppure scegli «qb» se è quanto basta.`,
      };
    }
    items.push({
      ingredient_id: it.tipo === "ingrediente" ? parseInt(it.ingredient_id) : null,
      sub_recipe_id: it.tipo === "sub_ricetta" ? parseInt(it.sub_recipe_id) : null,
      qty,
      unit: qb ? QB : (it.unit || "g"),
      note: it.note || null,
    });
  }
  return { items, errore: null };
}

// Campo quantità + tendina unità. Con «qb» la quantità è vuota e disattivata.
// Un'unità che non è in elenco (es. "porzione" da un import) resta visibile.
export default function VoceQuantita({ row, onChange, inputClassName = "" }) {
  const qb = isQb(row.unit);
  const extra = row.unit && !qb && !UNITA_VOCE.includes(row.unit) ? [row.unit] : [];
  return (
    <>
      <input
        type="number"
        step="0.001"
        min="0"
        value={qb ? "" : row.qty}
        disabled={qb}
        onChange={(e) => onChange("qty", e.target.value)}
        className={`w-20 ${inputClassName} ${qb ? "bg-neutral-100 text-neutral-400 cursor-not-allowed" : ""}`}
        placeholder={qb ? "—" : "q.tà"}
        title={qb ? "Quanto basta: niente quantità, fuori dal food cost" : undefined}
      />
      <select
        value={qb ? QB : row.unit}
        onChange={(e) => {
          const u = e.target.value;
          onChange("unit", u);
          if (isQb(u)) onChange("qty", "");
        }}
        className={`w-20 ${inputClassName}`}
      >
        {[...UNITA_VOCE, ...extra].map((u) => <option key={u} value={u}>{u}</option>)}
        <option value={QB}>qb (quanto basta)</option>
      </select>
    </>
  );
}
