// FILE: frontend/src/components/widgets/KpiMini.jsx
// @version: v1.0 — Incasso ieri + Coperti del mese, compatti (Home v10, 2026-11-04)
// Modulo: platform (Home) — dati da /dashboard/home (incasso_ieri, coperti_mese)

import React from "react";

const CARD = "bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] border px-3.5 py-2.5 min-h-[48px] flex flex-col justify-center";

export function KpiIncasso({ incasso }) {
  const delta = incasso?.delta_pct;
  return (
    <div className={`${CARD} border-indigo-200`}>
      <div className="text-[9px] font-bold uppercase tracking-wider text-[#a8a49e]">💵 Incasso ieri</div>
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[17px] font-extrabold text-brand-ink leading-tight tracking-tight tabular-nums whitespace-nowrap">
          € {(incasso?.totale || 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
        {delta != null && (
          <span className={`text-[11px] font-semibold whitespace-nowrap ${delta >= 0 ? "text-[#2EB872]" : "text-brand-red"}`}>
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  );
}

export function KpiCoperti({ coperti }) {
  return (
    <div className={`${CARD} border-rose-200`}>
      <div className="text-[9px] font-bold uppercase tracking-wider text-[#a8a49e]">
        📈 Coperti {new Date().toLocaleString("it-IT", { month: "short" })}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[17px] font-extrabold text-brand-ink leading-tight tracking-tight tabular-nums whitespace-nowrap">
          {coperti?.totale || 0}
        </span>
        {coperti?.anno_precedente > 0 && (
          <span className="text-[11px] font-semibold text-[#2E7BE8]">vs {coperti.anno_precedente}</span>
        )}
      </div>
    </div>
  );
}
