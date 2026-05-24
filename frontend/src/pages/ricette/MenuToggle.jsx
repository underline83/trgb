// @version: v1.0 — toggle tra le viste del Menu (Pranzo / Carta / Selezioni)
// Modulo: ricette
import React from "react";
import { useNavigate } from "react-router-dom";

const SEZIONI = [
  { key: "pranzo", label: "🥙 Menu Pranzo", path: "/pranzo" },
  { key: "carta", label: "📜 Menu Carta", path: "/menu-carta" },
  { key: "selezioni", label: "🍽️ Selezioni del giorno", path: "/selezioni/macellaio" },
];

export default function MenuToggle({ current }) {
  const navigate = useNavigate();
  return (
    <div className="px-4 sm:px-6 pt-4">
      <div className="inline-flex flex-wrap gap-1 bg-white border border-neutral-200 rounded-xl p-1 shadow-sm">
        {SEZIONI.map((s) => (
          <button
            key={s.key}
            onClick={() => navigate(s.path)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
              current === s.key
                ? "bg-orange-100 text-orange-900"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
