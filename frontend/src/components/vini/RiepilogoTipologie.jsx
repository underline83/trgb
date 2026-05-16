// src/components/vini/RiepilogoTipologie.jsx
// Modulo: vini
//
// Riepilogo tipologie a chip cliccabili sopra la lista Cantina.
// Replica 1:1 di MagazzinoVini.jsx righe 1320-1351 (riepilogoTipologie + JSX).
//
// Props:
//   - items: array di bottiglie già filtrate dalla sidebar (= viniFiltrati)
//   - riepilogoFilter: stato corrente ("null" | "tipologia:ROSSI" | "esaurite")
//   - setRiepilogoFilter: setter
//   - rightSummary: string opzionale a destra (default: "{n} etichette · {tot} bt")

import React, { useMemo } from "react";

// Helper colori per badge tipologia (replica tipologiaBadgeColor di MagazzinoVini)
function tipoBadgeColor(t) {
  if (!t) return "bg-neutral-100 text-neutral-700 border-neutral-200";
  const k = String(t).toUpperCase();
  if (k.includes("ROSS"))     return "bg-red-100 text-red-800 border-red-200";
  if (k.includes("BIANC"))    return "bg-amber-100 text-amber-800 border-amber-200";
  if (k.includes("BOLLIC"))   return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (k.includes("ROSAT"))    return "bg-pink-100 text-pink-800 border-pink-200";
  if (k.includes("PASS"))     return "bg-orange-100 text-orange-800 border-orange-200";
  if (k.includes("GRANDI"))   return "bg-purple-100 text-purple-800 border-purple-200";
  if (k.includes("ANALCOL"))  return "bg-teal-100 text-teal-800 border-teal-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

export default function RiepilogoTipologie({ items, riepilogoFilter, setRiepilogoFilter, rightSummary }) {
  const { sorted, esaurite, totBotQ } = useMemo(() => {
    const counts = {};
    let totBotQ = 0;
    let esaurite = 0;
    for (const v of items) {
      const tip = v.TIPOLOGIA || "—";
      const q = (v.QTA_TOTALE ?? ((v.QTA_FRIGO ?? 0) + (v.QTA_LOC1 ?? 0) + (v.QTA_LOC2 ?? 0) + (v.QTA_LOC3 ?? 0))) || 0;
      if (!counts[tip]) counts[tip] = { etichette: 0, bottiglie: 0, esaurite: 0 };
      counts[tip].etichette += 1;
      counts[tip].bottiglie += q;
      if (q <= 0) { counts[tip].esaurite += 1; esaurite += 1; }
      totBotQ += q;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1].etichette - a[1].etichette);
    return { sorted, esaurite, totBotQ };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="px-3 py-2 border-b border-neutral-200 bg-white flex flex-wrap gap-1.5 items-center flex-shrink-0">
      <span className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest mr-1">
        {riepilogoFilter ? <span className="text-amber-600">Filtro attivo</span> : "Riepilogo"}
      </span>
      {sorted.map(([tip, data]) => {
        const filterKey = `tipologia:${tip}`;
        const isActive = riepilogoFilter === filterKey;
        return (
          <button key={tip} type="button"
            onClick={() => setRiepilogoFilter(isActive ? null : filterKey)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold transition cursor-pointer ${tipoBadgeColor(tip)} ${isActive ? "ring-2 ring-amber-400 shadow-md" : "hover:shadow-sm"}`}>
            <span>{tip}</span>
            <span className="opacity-60">·</span>
            <span>{data.etichette}</span>
            <span className="opacity-40 font-normal">({data.bottiglie}bt)</span>
            {data.esaurite > 0 && <span className="text-[9px] text-red-600 font-bold ml-0.5">⚠{data.esaurite}</span>}
          </button>
        );
      })}
      {esaurite > 0 && (
        <button type="button"
          onClick={() => setRiepilogoFilter(riepilogoFilter === "esaurite" ? null : "esaurite")}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold transition cursor-pointer bg-red-50 text-red-700 border-red-200 ${riepilogoFilter === "esaurite" ? "ring-2 ring-red-400 shadow-md" : "hover:shadow-sm"}`}>
          🔄 {esaurite}
        </button>
      )}
      <span className="ml-auto text-[10px] text-neutral-500 flex-shrink-0">
        {rightSummary ?? `${items.length} etichette · ${totBotQ} bt`}
      </span>
    </div>
  );
}

// Helper esportato: applica il riepilogoFilter (post-filter sui chip) a una lista già filtrata
export function applyRiepilogoFilter(items, riepilogoFilter) {
  if (!riepilogoFilter) return items;
  if (riepilogoFilter === "esaurite") {
    return items.filter(v => {
      const q = (v.QTA_TOTALE ?? ((v.QTA_FRIGO ?? 0) + (v.QTA_LOC1 ?? 0) + (v.QTA_LOC2 ?? 0) + (v.QTA_LOC3 ?? 0))) || 0;
      return q <= 0;
    });
  }
  if (riepilogoFilter.startsWith("tipologia:")) {
    const tip = riepilogoFilter.replace("tipologia:", "");
    if (tip === "—") return items.filter(v => !v.TIPOLOGIA);
    return items.filter(v => v.TIPOLOGIA === tip);
  }
  return items;
}
