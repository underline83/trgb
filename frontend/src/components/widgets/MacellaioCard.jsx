// FILE: frontend/src/components/widgets/MacellaioCard.jsx
// @version: v1.0 — Widget Scelta del Macellaio per Home e DashboardSala
// Mostra count tagli disponibili + preview primi 4 tagli. Click → /macellaio.

import React from "react";
import { useNavigate } from "react-router-dom";

// ── Icona tipologia (emoji) ──
const TIPO_EMOJI = {
  bovino:      "🐂",
  suino:       "🐖",
  agnello:     "🐑",
  vitello:     "🐄",
  selvaggina:  "🦌",
  pollame:     "🐓",
  altro:       "🥩",
};

function formatPrezzo(p) {
  if (p == null) return "";
  return `€ ${Number(p).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatGrammi(g) {
  if (g == null) return "";
  if (g >= 1000) return `${(g / 1000).toFixed(1).replace(/\.0$/, "")} kg`;
  return `${g} g`;
}

/**
 * Widget Scelta del Macellaio.
 *
 * Props:
 *   data: { disponibili, venduti_oggi, tagli: [{nome, tipologia, grammatura_g, prezzo_euro}] }
 */
export default function MacellaioCard({ data }) {
  const navigate = useNavigate();
  const disp = data?.disponibili ?? 0;
  const venduti = data?.venduti_oggi ?? 0;
  const tagli = data?.tagli || [];

  return (
    <div
      onClick={() => navigate("/macellaio")}
      className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] border border-red-200 flex flex-col overflow-hidden cursor-pointer active:scale-[.99] transition-transform flex-shrink-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#a8a49e]">
          🥩 Scelta del macellaio
        </span>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-extrabold text-brand-ink leading-none tabular-nums">
            {disp}
          </span>
          <span className="text-[10px] text-[#a8a49e] font-medium">
            {disp === 1 ? "taglio" : "tagli"}
          </span>
        </div>
      </div>

      {/* Sub-header: venduti oggi */}
      {venduti > 0 && (
        <div className="px-4 pb-1 text-[11px] text-[#a8a49e] font-medium">
          {venduti} vendut{venduti === 1 ? "o" : "i"} oggi
        </div>
      )}

      {/* Lista tagli */}
      {tagli.length > 0 ? (
        <div className="border-t border-[#f0ede8]">
          {tagli.map((t, i) => (
            <div
              key={i}
              className={`flex items-center gap-2.5 px-4 py-2 ${i < tagli.length - 1 ? "border-b border-[#f8f6f2]" : ""}`}
            >
              <span className="text-base flex-shrink-0" aria-hidden="true">
                {TIPO_EMOJI[t.tipologia] || "🥩"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-brand-ink leading-tight truncate">
                  {t.nome}
                </div>
                {(t.grammatura_g || t.tipologia) && (
                  <div className="text-[11px] text-[#a8a49e] mt-0.5 truncate">
                    {t.tipologia}{t.grammatura_g ? ` · ${formatGrammi(t.grammatura_g)}` : ""}
                  </div>
                )}
              </div>
              {t.prezzo_euro != null && (
                <span className="text-[13px] font-bold text-brand-ink tabular-nums flex-shrink-0">
                  {formatPrezzo(t.prezzo_euro)}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="border-t border-[#f0ede8] px-4 py-5 text-center text-[12px] text-[#a8a49e]">
          Nessun taglio disponibile
        </div>
      )}
    </div>
  );
}
