// src/components/vini/BulkActionBar.jsx
//
// Barra fissa in basso per azioni di selezione multipla (replica di
// MagazzinoVini.jsx righe 1681-1714). Riusabile.
//
// Props:
//   - count: number di righe selezionate
//   - onClear: () => void — deseleziona tutto
//   - actions: array di { label, icon?, onClick, disabled?, loading?, tooltip?, variant? }
//     variant: "primary" (bianco/violet), "blue", "emerald", "red" (default primary)
//
// Esempio:
//   <BulkActionBar
//     count={sel.count}
//     onClear={sel.clear}
//     actions={[
//       { label: "Modifica", icon: "✏️", onClick: openEdit, variant: "primary" },
//       { label: "Duplica",  icon: "📋", onClick: dup, variant: "blue", loading: dupRunning },
//       { label: "Stampa",   icon: "🖨️", onClick: print, variant: "emerald" },
//     ]}
//   />

import React from "react";

const VARIANTS = {
  primary: "bg-white text-violet-800 hover:bg-violet-50",
  blue:    "bg-blue-400 text-blue-900 hover:bg-blue-300",
  emerald: "bg-emerald-400 text-emerald-900 hover:bg-emerald-300",
  red:     "bg-red-400 text-red-900 hover:bg-red-300",
};

export default function BulkActionBar({ count, onClear, actions = [] }) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-violet-700 text-white shadow-2xl border-t-2 border-violet-400">
      <div className="max-w-[1100px] mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold">
          {count} selezionat{count === 1 ? "o" : "i"}
        </span>
        <div className="flex items-center gap-2">
          {actions.map((a, i) => {
            const cls = VARIANTS[a.variant || "primary"];
            const btn = (
              <button
                key={i}
                onClick={a.onClick}
                disabled={a.disabled || a.loading}
                title={a.tooltip || ""}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition shadow ${cls} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {a.loading ? "…" : (
                  <>{a.icon && <span className="mr-1">{a.icon}</span>}{a.label}</>
                )}
              </button>
            );
            return btn;
          })}
          {onClear && (
            <button
              onClick={onClear}
              className="px-3 py-1.5 rounded-lg text-[10px] font-medium border border-violet-400 text-violet-100 hover:bg-violet-600 transition"
            >
              Deseleziona
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
