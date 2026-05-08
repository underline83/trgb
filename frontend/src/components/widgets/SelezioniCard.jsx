// FILE: frontend/src/components/widgets/SelezioniCard.jsx
// @version: v1.4 — Widget unificato "Selezioni del Giorno"
//   - v1.0 (sessione 50): card unica con 4 mini-blocchi (preview categorie + count).
//   - v1.1: per zone "attivo" (Salumi, Formaggi) preview con NOMI prodotto;
//     zone "venduto" (Macellaio, Pescato) preview con categorie + count.
//   - v1.2: scelta esplicita per zona (mode + max), ma hardcoded nel componente.
//   - v1.3 (2026-05-08): config-driven via /XXX/config/.
//   - v1.4 (2026-05-08): aggiunta modalità "tutto" — header categoria + nomi
//     prodotto sotto. Utile quando l'oste vuole vedere a colpo d'occhio sia
//     come è strutturata l'offerta (categorie) sia i nomi specifici.
//       · mode "categorie" → emoji + nome cat + count
//       · mode "tagli"     → solo nomi prodotto (appiattisce le categorie)
//       · mode "tutto"     → header categoria + sotto i nomi dei suoi tagli
//       · max              → max categorie (categorie/tutto) o max nomi (tagli)
//     min-height del mini-blocco calcolato in base a mode + max.
// Click sul blocco → /selezioni/<zona>.
//
// Data shape (da /dashboard/home campo `selezioni`):
//   {
//     macellaio: { disponibili, venduti_oggi, categorie: [...], altre, preview: {mode, max} },
//     salumi:    { disponibili, venduti_oggi, categorie: [...], altre, preview: {mode, max} },
//     formaggi:  { disponibili, venduti_oggi, categorie: [...], altre, preview: {mode, max} },
//     pescato:   { disponibili, venduti_oggi, categorie: [...], altre, preview: {mode, max} },
//   }

import React from "react";
import { useNavigate } from "react-router-dom";

// ── Config visiva per zona (solo presentazione, no logica preview) ──
const ZONE = [
  { key: "macellaio", label: "Macellaio", emoji: "🥩", tint: "bg-red-50",    textActive: "text-red-900" },
  { key: "pescato",   label: "Pescato",   emoji: "🐟", tint: "bg-sky-50",    textActive: "text-sky-900" },
  { key: "salumi",    label: "Salumi",    emoji: "🥓", tint: "bg-amber-50",  textActive: "text-amber-900" },
  { key: "formaggi",  label: "Formaggi",  emoji: "🧀", tint: "bg-yellow-50", textActive: "text-yellow-900" },
];

// Default core (usato se il backend non ritorna `preview` per qualche motivo)
const DEFAULT_PREVIEW = { mode: "categorie", max: 3 };

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

      {/* 4 mini-blocchi in griglia 2x2. min-h dinamico in base al numero
          di righe richieste dalla config: ~14px per riga + 64px overhead
          (header + padding). Le celle in stessa riga si allineano sull'altezza
          maggiore, quindi se una zona vuole più spazio l'altra la segue. */}
      <div className="grid grid-cols-2 gap-0">
        {ZONE.map((z, i) => {
          const widget = selezioni[z.key] || {};
          const count = widget.disponibili ?? 0;
          const categorie = widget.categorie || [];

          // Preview config dal backend (config-driven, settabile da Impostazioni)
          const previewCfg = widget.preview || DEFAULT_PREVIEW;
          const mode = previewCfg.mode || DEFAULT_PREVIEW.mode;
          const max = Math.max(1, previewCfg.max || DEFAULT_PREVIEW.max);

          // Per mode "tutto" il render è strutturato (header cat + tagli sotto).
          // Per "categorie" e "tagli" è una semplice lista flat.
          let previewItems = []; // mode="categorie"|"tagli": [{label, sub?}]
          let previewGroups = []; // mode="tutto": [{header, sub, tagli:[nome,...]}]

          if (mode === "tutto") {
            previewGroups = categorie.slice(0, max).map(c => ({
              header: `${c.emoji ? `${c.emoji} ` : ""}${c.nome}`,
              sub: ` · ${c.disponibili}`,
              tagli: (c.tagli || []).map(t => t.nome),
            }));
          } else if (mode === "tagli") {
            // Appiattisce cat.tagli in lista nomi, fino a `max`
            for (const c of categorie) {
              for (const t of (c.tagli || [])) {
                previewItems.push({ label: t.nome, sub: null });
                if (previewItems.length >= max) break;
              }
              if (previewItems.length >= max) break;
            }
          } else {
            // mode "categorie": emoji + nome + " · count"
            previewItems = categorie.slice(0, max).map(c => ({
              label: `${c.emoji ? `${c.emoji} ` : ""}${c.nome}`,
              sub: ` · ${c.disponibili}`,
            }));
          }

          const isRight = i % 2 === 1;
          const isBottom = i >= 2;
          // min-h calcolato in base a mode:
          //  - categorie/tagli: 64 + max*14 (1 riga per item)
          //  - tutto: 64 + max*42 (header cat + ~2 tagli sotto per cat)
          // Cap inferiore a 96px (look compatto v1.0).
          const rowsHeight = mode === "tutto" ? max * 42 : max * 14;
          const minH = Math.max(96, 64 + rowsHeight);

          return (
            <button
              key={z.key}
              onClick={() => navigate(`/selezioni/${z.key}`)}
              style={{ minHeight: `${minH}px` }}
              className={`text-left ${z.tint} p-3 flex flex-col cursor-pointer active:scale-[.99] transition-transform ${
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

              {/* Preview: 3 modalità — categorie / tagli / tutto.
                  Contenuto ancorato in alto subito sotto l'header (justify-start);
                  lo spazio vuoto eventuale resta in basso. Le celle vuote mostrano
                  un placeholder centrato verticalmente. */}
              {mode === "tutto" ? (
                previewGroups.length > 0 ? (
                  <div className="flex-1 flex flex-col gap-2 mt-1">
                    {previewGroups.map((g, gi) => (
                      <div key={gi} className="flex flex-col gap-[1px]">
                        <div className={`text-[11px] font-bold ${z.textActive} truncate leading-tight`}>
                          <span>{g.header}</span>
                          <span className="text-[#a8a49e] font-medium">{g.sub}</span>
                        </div>
                        {g.tagli.map((nome, ti) => (
                          <div
                            key={ti}
                            className="text-[10.5px] text-[#7a766f] leading-tight truncate pl-2"
                          >
                            {nome}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-[10.5px] text-[#a8a49e] italic">—</span>
                  </div>
                )
              ) : previewItems.length > 0 ? (
                <div className="flex-1 flex flex-col gap-[1px] mt-1">
                  {previewItems.map((p, ci) => (
                    <div
                      key={ci}
                      className="text-[10.5px] text-[#7a766f] leading-tight truncate tabular-nums"
                    >
                      <span className="font-medium">{p.label}</span>
                      {p.sub && <span className="text-[#a8a49e]">{p.sub}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
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
