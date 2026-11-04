// FILE: frontend/src/components/widgets/AzioniRapideStrip.jsx
// @version: v1.0 — striscia azioni rapide della Home v10 (2026-11-04)
// Modulo: platform (Home)
//
// Le azioni rapide (Impostazioni → Home per ruolo) in una striscia in testa
// alla pagina: su iPad/desktop in una riga, su telefono in griglia 2×, così
// sono la prima cosa che si tocca. `extra` = blocchi in coda sulla stessa
// riga (i numeri di cassa nella Home admin).

import React from "react";

export default function AzioniRapideStrip({ actions = [], onGo, extra = null }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-none lg:grid-flow-col lg:auto-cols-fr gap-2.5 flex-shrink-0">
      {actions.map((a) => (
        <button
          key={a.id ?? a.key}
          type="button"
          onClick={() => onGo(a.route)}
          title={a.sub || a.label}
          className={`min-h-[48px] min-w-0 rounded-[14px] border text-left cursor-pointer active:scale-[.97] transition-transform flex items-center gap-2.5 px-3 py-2.5 lg:flex-col lg:items-start lg:gap-1 lg:px-2.5 lg:py-2 ${a.color || ""}`}
          style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}
        >
          <span className="text-xl lg:text-lg leading-none flex-shrink-0">{a.emoji}</span>
          <span className="text-[13px] lg:text-[12px] font-bold leading-tight line-clamp-2 min-w-0 max-w-full">{a.label}</span>
        </button>
      ))}
      {extra}
    </div>
  );
}
