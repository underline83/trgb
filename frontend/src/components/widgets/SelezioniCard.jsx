// FILE: frontend/src/components/widgets/SelezioniCard.jsx
// @version: v1.0 — Widget unificato "Selezioni del Giorno"
// Sostituisce MacellaioCard/SalumiCard/FormaggiCard separate: un'unica card con 4 mini-blocchi
// (Macellaio, Pescato, Salumi, Formaggi). Click sul blocco → /selezioni/<zona>.
//
// Data shape (da /dashboard/home campo `selezioni`):
//   {
//     macellaio: { disponibili, venduti_oggi, categorie: [...], altre },
//     salumi:    { disponibili, venduti_oggi, categorie: [...], altre },   // disponibili = attivi
//     formaggi:  { disponibili, venduti_oggi, categorie: [...], altre },   // disponibili = attivi
//     pescato:   { disponibili, venduti_oggi, categorie: [...], altre },
//   }

import React from "react";
import { useNavigate } from "react-router-dom";

// ── Config visivo per zona (allineato a zonaConfig.js FE) ──
const ZONE = [
  {
    key: "macellaio",
    label: "Macellaio",
    emoji: "🥩",
    border: "border-red-200",
    tint: "bg-red-50",
    textActive: "text-red-900",
    stato: "venduto", // mostra "disponibili"
  },
  {
    key: "pescato",
    label: "Pescato",
    emoji: "🐟",
    border: "border-sky-200",
    tint: "bg-sky-50",
    textActive: "text-sky-900",
    stato: "venduto",
  },
  {
    key: "salumi",
    label: "Salumi",
    emoji: "🥓",
    border: "border-amber-200",
    tint: "bg-amber-50",
    textActive: "text-amber-900",
    stato: "attivo", // mostra "in carta"
  },
  {
    key: "formaggi",
    label: "Formaggi",
    emoji: "🧀",
    border: "border-yellow-200",
    tint: "bg-yellow-50",
    textActive: "text-yellow-900",
    stato: "attivo",
  },
];

/**
 * @param {object} props
 * @param {object} props.data - oggetto selezioni: { macellaio, pescato, salumi, formaggi }
 */
export default function SelezioniCard({ data }) {
  const navigate = useNavigate();
  const selezioni = data || {};

  // Totale generale "disponibili" (o attivi per salumi/formaggi → stesso campo disponibili nel modello)
  const totale = ZONE.reduce((acc, z) => acc + (selezioni[z.key]?.disponibili ?? 0), 0);

  return (
    <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] border border-[#f0ede8] flex flex-col overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-[#f0ede8]">
        <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#a8a49e]">
          🍽️ Selezioni del Giorno
        </span>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-extrabold text-brand-ink leading-none tabular-nums">
            {totale}
          </span>
          <span className="text-[10px] text-[#a8a49e] font-medium">
            in carta
          </span>
        </div>
      </div>

      {/* 4 mini-blocchi in griglia 2x2 */}
      <div className="grid grid-cols-2 gap-0">
        {ZONE.map((z, i) => {
          const widget = selezioni[z.key] || {};
          const count = widget.disponibili ?? 0;
          const categorie = widget.categorie || [];
          // Top 2 categorie per preview (nome + count), coerente con card classiche
          const preview = categorie.slice(0, 2);

          const isRight = i % 2 === 1;
          const isBottom = i >= 2;

          return (
            <button
              key={z.key}
              onClick={() => navigate(`/selezioni/${z.key}`)}
              className={`text-left ${z.tint} p-3 min-h-[96px] flex flex-col cursor-pointer active:scale-[.99] transition-transform ${
                !isRight ? "border-r border-[#f0ede8]" : ""
              } ${!isBottom ? "border-b border-[#f0ede8]" : ""}`}
            >
              {/* Header mini-blocco */}
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[12px] font-bold ${z.textActive} flex items-center gap-1.5`}>
                  <span className="text-base leading-none">{z.emoji}</span>
                  <span>{z.label}</span>
                </span>
                <span className="text-base font-extrabold text-brand-ink tabular-nums leading-none">
                  {count}
                </span>
              </div>

              {/* Preview categorie (massimo 2) */}
              {preview.length > 0 ? (
                <div className="flex-1 flex flex-col justify-end">
                  {preview.map((c, ci) => (
                    <div
                      key={ci}
                      className="text-[10.5px] text-[#7a766f] leading-tight truncate tabular-nums"
                    >
                      <span className="font-medium">
                        {c.emoji ? `${c.emoji} ` : ""}{c.nome}
                      </span>
                      <span className="text-[#a8a49e]"> · {c.disponibili}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-end">
                  <span className="text-[10.5px] text-[#a8a49e] italic">—</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
