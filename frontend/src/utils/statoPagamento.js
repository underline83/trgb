// frontend/src/utils/statoPagamento.js
// Modulo: controllo_gestione (mirror di app/services/stati_pagamento.py)
//
// Tassonomia stati pagamento a 2 livelli (G.8, 2026-05-11).
//
//   MACRO       SOTTO              Significato
//   ──────────────────────────────────────────────────────────────
//   CHIUSO      PAGATO             Riconciliato banca
//   CHIUSO      PAGATO_MANUALE     Pagato dichiarato, da riconciliare
//
//   APERTO      PROGRAMMATO        Scadenza futura
//   APERTO      SCADUTO            Scadenza passata
//   APERTO      VERIFICARE         Dubbio sul pagamento
//   APERTO      SPOSTATO           Scadenza rinegoziata
//   APERTO      RATEIZZATO         Piano rate aperto
//   APERTO      PARZIALE           Pagato in parte
//
// Usare le costanti / helper invece di hardcodare tuple IN list. Backend
// espone già `stato_macro` nella response (mig 116, GENERATED VIRTUAL): se
// disponibile usarla direttamente; se no, `deriveMacro(stato)` fa la
// stessa cosa lato JS.

export const STATI_CHIUSI = Object.freeze([
  "PAGATO",
  "PAGATO_MANUALE",
]);

export const STATI_APERTI = Object.freeze([
  "PROGRAMMATO",
  "SCADUTO",
  "VERIFICARE",
  "SPOSTATO",
  "RATEIZZATO",
  "PARZIALE",
]);

/** True se lo stato è uno dei CHIUSI (PAGATO/PAGATO_MANUALE). */
export function isChiuso(stato) {
  return STATI_CHIUSI.includes(stato);
}

/** True se lo stato è uno degli APERTI. Default per stati ignoti: true. */
export function isAperto(stato) {
  if (stato == null) return true;
  return !STATI_CHIUSI.includes(stato);
}

/** Ritorna 'CHIUSO' se stato in STATI_CHIUSI, altrimenti 'APERTO'.
 *  Equivalente lato JS della GENERATED column cg_uscite.stato_macro. */
export function deriveMacro(stato) {
  return STATI_CHIUSI.includes(stato) ? "CHIUSO" : "APERTO";
}

/** Helper per pattern "è pagato a fini KPI" che storicamente include PARZIALE.
 *  Distinto da isChiuso() perché PARZIALE è APERTO ma viene contato come
 *  pagato nei totalizzatori UI (è "in pagamento", non da programmare). */
export const STATI_PAGATO_KPI = Object.freeze([
  "PAGATO",
  "PAGATO_MANUALE",
  "PARZIALE",
]);

export function isPagatoKpi(stato) {
  return STATI_PAGATO_KPI.includes(stato);
}
