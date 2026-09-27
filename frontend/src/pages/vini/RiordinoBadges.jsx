// Modulo: vini — [core]
// @version: v1.0 (2026-09-27) — Badge condivisi del riordino.
//
// Nati dentro il widget alert della dashboard (VinoRow) e portati fuori perché
// la pagina Ordini ne aveva una versione più povera: stessa informazione, due
// grafiche diverse. Adesso li usano entrambe (dashboard + /vini/ordini).
//
//   GiacenzaChip       — «🍷 2 bt · ~9gg»: giacenza + giorni di copertura
//   RitmoVenditaBadge  — «🛒 Vende · 3.2 bt/mese · venduto 4gg fa»
//   UltimoAcquistoBadge— «📥 comprato ~5 mesi fa» (qualunque annata)
//
// I campi arrivano già calcolati dal backend (vini_riordino_service /
// vini_metrics): qui solo resa, nessuna soglia.

import React from "react";

export const giorniDa = (iso) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
};

// Mirror delle categorie di app/utils/vini_metrics.py::calcola_ritmo_vendita
const RITMO_CLS = {
  "emerald":      "bg-emerald-50 text-emerald-800 border-emerald-200",
  "amber":        "bg-amber-50 text-amber-800 border-amber-200",
  "neutral":      "bg-neutral-100 text-neutral-600 border-neutral-200",
  "neutral-dark": "bg-slate-100 text-slate-500 border-slate-300",
};

/**
 * Giacenza + copertura. Rosso se esaurito, ambra se il vino gira (ha una
 * copertura), neutro se è fermo (nessuna vendita nella finestra).
 * size="lg" per la pagina Ordini, dove è il numero su cui si decide.
 */
export function GiacenzaChip({ qta, copertura, sogliaGg, size = "sm" }) {
  const q = Number(qta) || 0;
  const esaurito = q <= 0;
  const cls = esaurito
    ? "bg-red-100 text-red-800 border-red-200"
    : copertura != null
      ? "bg-amber-100 text-amber-900 border-amber-300"
      : "bg-neutral-100 text-neutral-700 border-neutral-300";
  const sz = size === "lg"
    ? "text-xs px-2.5 py-0.5"
    : "text-[10px] px-1.5 py-0.5";
  const title = esaurito
    ? "Esaurito"
    : copertura != null
      ? `Ne restano ${q}: al ritmo attuale finiscono in ~${copertura} giorni${sogliaGg ? ` (soglia ${sogliaGg}gg)` : ""}`
      : `Ne restano ${q} — nessuna vendita recente, giacenza ferma`;
  return (
    <span className={`inline-flex items-center font-bold rounded-full border tabular-nums whitespace-nowrap ${sz} ${cls}`}
          title={title}>
      {esaurito ? "🍷 esaurito" : `🍷 ${q} bt${copertura != null ? ` · ~${copertura}gg` : ""}`}
    </span>
  );
}

/**
 * Ritmo di vendita + quando è uscita l'ultima bottiglia.
 * «finito» solo se la giacenza è a zero, altrimenti «venduto».
 */
export function RitmoVenditaBadge({ ritmo, ultimaVendita, esaurito }) {
  const r = ritmo || {};
  const cls = RITMO_CLS[r.color_tone] || RITMO_CLS.neutral;
  const gg = giorniDa(ultimaVendita);
  const mostra = r.categoria !== "mai" && gg != null;
  const verbo = esaurito ? "finito" : "venduto";
  const quando =
    gg == null ? null
    : gg === 0 ? `${verbo} oggi`
    : gg === 1 ? `${verbo} ieri`
    :            `${verbo} ${gg}gg fa`;
  const title = [
    r.vendite_totali != null ? `${r.vendite_totali} bt vendute in ${r.giorni_storico}gg di storico (dal 01/03/2026)` : null,
    ultimaVendita ? `Ultima vendita: ${new Date(ultimaVendita).toLocaleDateString("it-IT")}` : null,
  ].filter(Boolean).join(" — ");
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}
          title={title}>
      🛒 {r.label || "—"}
      {mostra && <span className="font-normal opacity-75">· {quando}</span>}
    </span>
  );
}

/**
 * Da quanto non si compra il vino (ultimo CARICO su qualunque annata).
 * Se l'ultimo carico è lontano conviene chiedere l'annata nuova.
 * `ultimoCaricoAnnata` (opzionale) = ultimo carico di QUESTA annata, in tooltip.
 */
export function UltimoAcquistoBadge({ iso, ultimoCaricoAnnata }) {
  const gg = giorniDa(iso);
  const title = gg != null
    ? `Ultimo carico di questo vino (qualunque annata): ${new Date(iso).toLocaleDateString("it-IT")}` +
      (ultimoCaricoAnnata && ultimoCaricoAnnata !== iso
        ? ` — di questa annata: ${new Date(ultimoCaricoAnnata).toLocaleDateString("it-IT")}` : "")
    : "Nessun carico registrato nel gestionale (i carichi si tracciano dal 03/2026): l'acquisto può essere anteriore";
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border bg-white text-neutral-500 border-neutral-200"
          title={title}>
      📥 {gg == null
        ? "nessun carico registrato"
        : gg < 60
          ? `comprato ${gg}gg fa`
          : `comprato ~${Math.round(gg / 30)} mesi fa`}
    </span>
  );
}
