// frontend/src/pages/vini/CantinaMobile.jsx
// Modulo: vini
// @version: v1.2 — fase 2 «muovi la bottiglia»: movimentazione in scheda (2026-08-21)
// @version: v1.1 — filtro locazione nel modo «Per scaffale» (2026-08-21)
// @version: v1.0 — "Cantina da iPhone" fase 1 «trova la bottiglia» (2026-07-20)
//
// Pagina mobile-first, pensata per l'uso col telefono in mano tra gli
// scaffali. Fase 1 (V.9): consultazione. Fase 2 (v1.2): la scheda registra
// movimenti — vendita, carico, scarico, conta — con Annulla a portata di
// pollice. Chi può scrivere: admin/superadmin/sommelier.
//
// Due modi + dettaglio:
//   · CERCA — ricerca testo + filtro per categoria di locazione
//     (Scaffali / Frigo / Matrice / Altro).
//   · PER SCAFFALE — vista inversa: scegli la locazione, vedi cosa contiene
//     (comodo quando rimetti a posto o fai il giro di controllo). Filtro
//     dedicato: testo sul nome locazione (matcha anche le etichette dentro)
//     + chip categoria; le locazioni sono un accordion, una aperta per volta.
//   · SCHEDA (/:id) — identità, «Dove si trova» in evidenza (con griglia
//     matrice) e MOVIMENTAZIONE: barra azioni fissa in fondo, righe locazione
//     toccabili, timeline movimenti aperta con giacenza risultante.
//
// Fonte dati (endpoint esistenti, nessuna modifica backend):
//   GET    /vini/v2/bottiglie/?only_positive_stock=true&limit=10000  lista in giacenza
//   GET    /vini/v2/bottiglie/{id}                                   dettaglio
//   GET    /vini/magazzino/{id}/movimenti?limit=20                   timeline
//   POST   /vini/magazzino/{id}/movimenti                            registra movimento
//   DELETE /vini/magazzino/movimenti/{mov_id}                        annulla (undo)
//   PATCH  /vini/magazzino/{id}/bottiglia-aperta                     toggle mescita
//
// Le righe rimandano a /vini/cantina-mobile/{id} (scheda mobile), NON alla
// scheda gestionale densa: l'esperienza sul telefono resta coerente.
// Le fasi 2 (correggi giacenze +/−) e 3 (conta inventario) si innestano su
// questa base — la card «Dove si trova» è già predisposta.
//
// Stile osteria (Cormorant Garamond, palette beige/marrone/terracotta),
// coerente con CartaStaff/CartaClienti. Prefisso classi: cm-.

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { t } from "../../utils/localeStrings";
import { isViniManagerRole } from "../../utils/authHelpers";

const REFRESH_MS = 90_000;
/** Finestra dell'«Annulla» dopo un movimento. Stessa di CartaStaff: in
 *  servizio il tempo di accorgersi dell'errore e togliere le dita. */
const UNDO_MS = 8000;
const ORIGINE = "CANTINA-MOBILE";

// ─────────────────────────────────────────────────────────────
// Helpers dati
// ─────────────────────────────────────────────────────────────
function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }

function fmtPrezzo(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Locazioni con giacenza > 0. loc3 = matrice (LOCAZIONE_3 è la stringa celle). */
function buildLocations(v) {
  const out = [];
  const push = (nome, qta, slot) => { const q = num(qta); if (q > 0 && nome) out.push({ nome, qta: q, slot }); };
  push(v.FRIGORIFERO, v.QTA_FRIGO, "frigo");
  push(v.LOCAZIONE_1, v.QTA_LOC1, "loc1");
  push(v.LOCAZIONE_2, v.QTA_LOC2, "loc2");
  const q3 = num(v.QTA_LOC3);
  if (q3 > 0) out.push({ nome: "Scaffale a matrice", qta: q3, slot: "loc3", matrice: v.LOCAZIONE_3 });
  return out;
}

/** Tutti i posti DEFINITI per una bottiglia, anche a giacenza 0: servono al
 *  carico («dove la metto?»). La matrice (loc3) è esclusa di proposito —
 *  muoverla richiede di scegliere le celle, e farlo dal telefono senza
 *  griglia porterebbe QTA_LOC3 e `matrice_celle` fuori sincrono. Dalla
 *  cantina mobile la matrice si legge, non si tocca. */
function slotsOperabili(v) {
  const defs = [
    { slot: "frigo", nome: v.FRIGORIFERO, qta: v.QTA_FRIGO },
    { slot: "loc1", nome: v.LOCAZIONE_1, qta: v.QTA_LOC1 },
    { slot: "loc2", nome: v.LOCAZIONE_2, qta: v.QTA_LOC2 },
  ];
  return defs
    .filter(d => (d.nome || "").trim())
    .map(d => ({ slot: d.slot, nome: String(d.nome).trim(), qta: num(d.qta) }));
}

function isFrigo(nome) { return /frigo/i.test(nome || ""); }
/** Categoria fisica di una locazione: scaffale | frigo | matrice | altro.
 *  Usata dal filtro per categoria del finder (Scaffali / Frigo / Matrice). */
function locCategory(l) {
  if (l.slot === "loc3") return "matrice";
  if (isFrigo(l.nome)) return "frigo";
  if (/scaffal/i.test(l.nome)) return "scaffale";
  return "altro";
}
const CAT_LABEL = { scaffale: "Scaffali", frigo: "Frigo", matrice: "Matrice", altro: "Altro" };
const CAT_DEFS = [
  { k: "scaffale", label: "Scaffali", icon: "🗄️" },
  { k: "frigo", label: "Frigo", icon: "🧊" },
  { k: "matrice", label: "Matrice", icon: "🔳" },
  { k: "altro", label: "Altro", icon: "📦" },
];
function isMagnum(v) {
  if ((v.TIPOLOGIA || "") === "GRANDI FORMATI") return true;
  return /magnum|jeroboam|litr/i.test(`${v.FORMATO || ""} ${v.DESCRIZIONE || ""}`);
}
function nomeProduttore(v) { return v.PRODUTTORE || v.p_nome || ""; }
function nomeRegione(v) { return v.REGIONE || v.p_regione || ""; }
function nomeDenominazione(v) { return v.DENOMINAZIONE || v.d_display || ""; }

function statoVino(v) {
  const qta = num(v.QTA_TOTALE);
  return {
    mescita: !!num(v.BOTTIGLIA_APERTA),
    ultima: qta === 1,
    scarsa: qta > 1 && qta <= 2,
    magnum: isMagnum(v),
    qta,
  };
}

/** Giacenza TOTALE risultante dopo ogni movimento, ricostruita a ritroso dal
 *  totale attuale (i movimenti arrivano dal più recente al più vecchio).
 *  Sotto una RETTIFICA la catena si chiude: il valore che c'era prima non è
 *  ricostruibile, quindi si smette di mostrare il saldo invece di inventarlo. */
function saldiMovimenti(movs, qtaAttuale) {
  const out = new Array(movs.length).fill(null);
  let after = num(qtaAttuale);
  let attendibile = true;
  for (let i = 0; i < movs.length; i++) {
    const m = movs[i];
    const q = num(m.qta);
    if (m.tipo === "RETTIFICA") { out[i] = q; attendibile = false; continue; }
    if (!attendibile) continue;
    out[i] = after;
    if (m.tipo === "CARICO") after -= q;
    else if (m.tipo === "SCARICO" || m.tipo === "VENDITA") after += q;
    // MODIFICA: evento senza effetto sulla giacenza
  }
  return out;
}

/** "Oggi" / "Ieri" / "lun 18 agosto" per raggruppare la timeline. */
function giornoLabel(s) {
  if (!s) return "—";
  const d = new Date(String(s).replace(" ", "T"));
  if (isNaN(d.getTime())) return String(s).slice(0, 10);
  const gg = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const oggi = gg(new Date());
  const diff = Math.round((oggi - gg(d)) / 86400000);
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Ieri";
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long" });
}

/** Parsa LOCAZIONE_3 "(3,6), (3,7)…" → {set, bounds, n}. Convenzione (colonna, riga). */
function parseMatrice(str) {
  if (!str) return null;
  const pairs = [...String(str).matchAll(/\((\d+)\s*,\s*(\d+)\)/g)].map(m => [Number(m[1]), Number(m[2])]);
  if (!pairs.length) return null;
  const cols = pairs.map(p => p[0]);
  const rigas = pairs.map(p => p[1]);
  const minC = Math.min(...cols), maxC = Math.max(...cols);
  const minR = Math.min(...rigas), maxR = Math.max(...rigas);
  const set = new Set(pairs.map(p => `${p[0]}-${p[1]}`));
  return { set, minC, maxC, minR, maxR, n: pairs.length };
}

/** Celle di LOCAZIONE_3 come coppie [colonna, riga], ordinate per colonna
 *  poi riga (come su Excel: il primo numero è la colonna). */
function celleMatrice(str) {
  if (!str) return [];
  return [...String(str).matchAll(/\((\d+)\s*,\s*(\d+)\)/g)]
    .map(m => [Number(m[1]), Number(m[2])])
    .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
}
/** "(3,6)" · "(3,6) (3,7)" · "(3,6) (3,7) (4,1) +2" — max 3 celle a vista. */
function celleLabel(celle) {
  if (!celle.length) return "";
  const vis = celle.slice(0, 3).map(([c, r]) => `(${c},${r})`).join(" ");
  return celle.length > 3 ? `${vis} +${celle.length - 3}` : vis;
}

// ─────────────────────────────────────────────────────────────
// CSS (token osteria)
// ─────────────────────────────────────────────────────────────
// Tipografia: il Cormorant Garamond ha occhio piccolo, sull'iPhone in cantina
// (luce bassa, telefono a mezzo braccio) i corpi vanno tenuti alti — i valori
// qui sotto sono ~2px sopra il web classico. Colori: il testo secondario è
// #6b5c46 (contrasto ~6:1 sul crema) e non più #8a7a65, che sotto le luci
// calde della cantina spariva.
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&display=swap');
.cm-root{font-family:"Cormorant Garamond","Times New Roman",serif;background:#fdf8f0;color:#241b13;min-height:100vh;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;font-size:17px}
.cm-wrap{max-width:640px;margin:0 auto;padding-bottom:40px}

.cm-top{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid #d8c8a8;padding:12px 16px 10px}
.cm-top-row{display:flex;align-items:center;gap:10px}
.cm-back{font-size:30px;color:#5a4634;background:none;border:none;line-height:1;padding:0 10px 0 0;cursor:pointer;font-family:inherit;min-height:44px}
.cm-title{font-size:22px;font-weight:700;letter-spacing:.03em}
.cm-sub{font-size:11.5px;color:#5a4634;letter-spacing:.14em;text-transform:uppercase}
.cm-live{margin-left:auto;font-size:11.5px;color:#276b45;font-style:italic;white-space:nowrap}
.cm-live-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#2e7d4f;margin-right:4px;animation:cm-p 2s infinite}
@keyframes cm-p{0%,100%{opacity:1}50%{opacity:.3}}
.cm-refresh{font-family:inherit;font-size:13px;background:#fff;border:1px solid #c5a97a;color:#5a4634;border-radius:8px;padding:5px 10px;cursor:pointer;min-height:34px}

.cm-modes{display:flex;gap:6px;background:#efe6d6;border-radius:11px;padding:4px;margin-top:12px}
.cm-modes button{flex:1;font-family:inherit;font-size:16px;border:none;background:transparent;color:#5a4634;padding:10px 0;border-radius:8px;font-weight:600;min-height:46px;cursor:pointer}
.cm-modes button.cm-on{background:#2b2118;color:#f5ead3}

.cm-searchbar{padding:12px 16px 6px}
.cm-search{width:100%;font-family:inherit;font-size:18px;padding:13px 15px;border:1.5px solid #c5a97a;border-radius:11px;background:#fff;color:#241b13;box-sizing:border-box;min-height:48px}
.cm-search::placeholder{font-style:italic;color:#a2907a}

.cm-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 16px 4px;scrollbar-width:none}
.cm-chips::-webkit-scrollbar{display:none}
.cm-chip{flex:0 0 auto;font-family:inherit;font-size:15px;padding:9px 15px;border-radius:16px;border:1px solid #c5a97a;background:#fff;color:#5a4634;white-space:nowrap;min-height:44px;cursor:pointer}
.cm-chip.cm-on{background:#2b2118;color:#f5ead3;border-color:#2b2118}
.cm-chip .cm-n{opacity:.6;font-size:13px;margin-left:5px}

.cm-count{font-size:13px;color:#6b5c46;font-style:italic;padding:8px 16px 2px;letter-spacing:.03em}

.cm-card{background:#fff;margin:8px 12px;border:1px solid #e2d4b8;border-radius:13px;padding:12px 14px;position:relative;cursor:pointer}
.cm-card:active{background:#fbf3e4}
.cm-nome{font-size:18px;font-weight:600;line-height:1.22;padding-right:54px}
.cm-nome em{font-style:italic;font-weight:500}
.cm-ann{color:#6b5c46;font-weight:400;font-size:15.5px;margin-left:5px}
.cm-meta{font-size:14px;color:#5a4634;margin-top:3px}
.cm-qtatot{position:absolute;top:11px;right:14px;text-align:right}
.cm-qtatot b{font-size:25px;font-weight:700;color:#241b13;font-variant-numeric:tabular-nums;display:block;line-height:1}
.cm-qtatot small{font-size:11.5px;color:#6b5c46}
.cm-flags{margin-top:8px}
.cm-flag{display:inline-block;font-size:12px;font-style:italic;padding:3px 9px;border-radius:8px;border:1px solid #d8c8a8;margin-right:5px}
.cm-flag.cm-mescita{background:#fff5e4;color:#8f3800}
.cm-flag.cm-ultima{background:#f5d7c8;color:#5b2c1a}
.cm-flag.cm-scarsa{background:#f5ead3;color:#6d5010}
.cm-flag.cm-magnum{background:#efe6d6;color:#5a4634}
.cm-locline{margin-top:10px;padding-top:10px;border-top:1px dashed #ece0c8;font-size:15.5px;line-height:1.7}
.cm-pin{color:#8f3800;font-weight:700}
.cm-locbadge{display:inline-block;background:#faf1df;border:1px solid #e2d4b8;border-radius:8px;padding:3px 10px;margin:2px 5px 0 0;font-size:15px}
.cm-locbadge b{color:#8f3800}
.cm-locbadge.cm-frigo{background:#eaf1f9;border-color:#c2d7ec}

.cm-empty{text-align:center;padding:50px 20px;color:#6b5c46;font-style:italic;font-size:16px}
.cm-loading{text-align:center;padding:70px 20px;color:#6b5c46;font-style:italic;font-size:17px}
.cm-hint{text-align:center;font-size:14px;color:#6b5c46;font-style:italic;padding:12px 20px;line-height:1.45}

/* per scaffale */
.cm-shelf-head{width:calc(100% - 24px);box-sizing:border-box;font-family:inherit;text-align:left;border:none;cursor:pointer;background:#2b2118;color:#f5ead3;margin:10px 12px 0;border-radius:11px;padding:12px 15px;display:flex;justify-content:space-between;align-items:baseline;gap:10px;min-height:46px}
.cm-shelf-head.cm-open{border-radius:11px 11px 0 0}
.cm-shelf-nome{font-size:18px;font-weight:700;letter-spacing:.02em}
.cm-shelf-caret{display:inline-block;width:16px;opacity:.75;font-size:14px}
.cm-shelf-n{font-size:13.5px;font-style:italic;opacity:.85}
.cm-shelf-body{background:#fff;margin:0 12px 6px;border:1px solid #e2d4b8;border-top:none;border-radius:0 0 11px 11px;overflow:hidden}
.cm-shelf-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid #f2e9d6;font-size:16.5px;line-height:1.3;cursor:pointer;min-height:46px}
.cm-shelf-row:last-child{border-bottom:none}
.cm-shelf-row:active{background:#fbf3e4}
.cm-shelf-row .cm-sr-sub{font-size:13.5px;color:#6b5c46;font-weight:400}
.cm-shelf-row .cm-sr-cella{display:inline-block;margin-right:8px;font-size:14px;font-weight:700;color:#8f3800;font-variant-numeric:tabular-nums;white-space:nowrap}
.cm-shelf-row .cm-sr-q{font-weight:700;color:#8f3800;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:17px}

/* ---------- scheda dettaglio ---------- */
.cm-hero{background:#fff;padding:14px 16px 16px;border-bottom:1px solid #efe6d6}
.cm-tipo{display:inline-block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f10;border:1px solid #e0b9ac;background:#fbeee9;border-radius:7px;padding:3px 10px;margin-bottom:8px}
.cm-hero h2{font-size:25px;font-weight:700;line-height:1.15;margin:0}
.cm-hero h2 em{font-style:italic;font-weight:500}
.cm-hero .cm-hann{color:#6b5c46;font-weight:400;font-size:20px;margin-left:6px}
.cm-hero .cm-prod{font-size:15.5px;color:#5a4634;margin-top:4px;font-style:italic}
.cm-badges{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.cm-badge{font-size:13px;font-style:italic;padding:4px 11px;border-radius:9px;border:1px solid #d8c8a8}
.cm-badge.cm-b-carta{background:#e9f2ea;color:#276b45;border-color:#b3d8c0}
.cm-badge.cm-b-mescita{background:#fff5e4;color:#8f3800;border-color:#e8ce97}
.cm-badge.cm-b-off{background:#f3e9d4;color:#6b5c46}
/* toggle mescita: azione di servizio, sta accanto ai badge */
.cm-mesc-btn{font-family:inherit;font-size:13.5px;padding:7px 13px;border-radius:9px;border:1.5px solid #c5a97a;background:#fff;color:#5a4634;cursor:pointer;min-height:38px;margin-left:auto}
.cm-mesc-btn.cm-on{background:#8f3800;border-color:#8f3800;color:#fff5e4}

.cm-stats{display:flex;background:#faf4e8;border-bottom:1px solid #efe6d6}
.cm-stat{flex:1;text-align:center;padding:13px 6px;border-right:1px solid #efe6d6}
.cm-stat:last-child{border-right:none}
.cm-stat .cm-k{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6b5c46}
.cm-stat .cm-v{font-size:26px;font-weight:700;color:#241b13;font-variant-numeric:tabular-nums;line-height:1.1;margin-top:3px}
.cm-stat .cm-v small{font-size:13px;color:#6b5c46;font-weight:400}

.cm-sec{background:#fff;margin:10px 12px;border:1px solid #e2d4b8;border-radius:13px;overflow:hidden}
.cm-sec-h{display:flex;align-items:center;gap:8px;padding:12px 15px;background:#faf4e8;border-bottom:1px solid #efe6d6}
.cm-sec-h .cm-t{font-size:14px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#5a4634}
.cm-sec-h .cm-r{margin-left:auto;font-size:13px;color:#6b5c46;font-style:italic}
.cm-loc{display:flex;align-items:center;gap:12px;padding:14px 15px;border-bottom:1px solid #f2e9d6;width:100%;box-sizing:border-box;background:none;border-left:none;border-right:none;border-top:none;font-family:inherit;text-align:left;color:inherit;min-height:56px}
.cm-loc:last-of-type{border-bottom:none}
.cm-loc.cm-tap{cursor:pointer}
.cm-loc.cm-tap:active{background:#fbf3e4}
.cm-loc .cm-ico{font-size:22px;width:28px;text-align:center}
.cm-loc .cm-lnome{flex:1;font-size:17.5px;font-weight:600}
.cm-loc .cm-lnome small{display:block;font-size:13px;color:#6b5c46;font-weight:400;font-style:italic}
.cm-loc .cm-lq{font-size:23px;font-weight:700;color:#8f3800;font-variant-numeric:tabular-nums;white-space:nowrap}
.cm-loc .cm-lq small{font-size:12px;color:#6b5c46;font-weight:400}
.cm-loc .cm-chev{color:#c5a97a;font-size:20px;margin-left:2px}
.cm-loctot{display:flex;justify-content:space-between;padding:12px 15px;background:#f7f0e2;font-weight:700;font-size:16.5px}
.cm-loctot .cm-lq{color:#241b13;font-variant-numeric:tabular-nums}
.cm-phase2{padding:10px 15px;background:#fffdf5;font-size:13.5px;color:#6b5c46;font-style:italic;border-top:1px dashed #ece0c8;line-height:1.45}
.cm-phase2 b{color:#5a4634}

.cm-matrice{padding:13px 15px}
.cm-matrice-lbl{font-size:14.5px;color:#5a4634;margin-bottom:8px}
.cm-grid{display:inline-grid;gap:4px}
.cm-cell{width:24px;height:24px;border-radius:5px;background:#f0e7d4;border:1px solid #e2d4b8}
.cm-cell.cm-cellon{background:#8f3800;border-color:#7a1f10;box-shadow:inset 0 0 0 2px #fdf8f0}
.cm-matrice-cap{font-size:13px;color:#6b5c46;font-style:italic;margin-top:8px}

.cm-facts{display:grid;grid-template-columns:1fr 1fr}
.cm-fact{padding:11px 15px;border-bottom:1px solid #f2e9d6;border-right:1px solid #f2e9d6}
.cm-fact:nth-child(2n){border-right:none}
.cm-fact .cm-k{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:#6b5c46}
.cm-fact .cm-v{font-size:16.5px;font-weight:600;margin-top:2px}

/* ---------- timeline movimenti ---------- */
.cm-day{padding:9px 15px 5px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6b5c46;background:#fdfaf3;border-bottom:1px solid #f2e9d6}
.cm-mv{display:flex;align-items:center;gap:11px;padding:12px 15px;border-bottom:1px solid #f2e9d6}
.cm-mv:last-child{border-bottom:none}
.cm-mv .cm-mv-ico{font-size:19px;width:26px;text-align:center}
.cm-mv .cm-mv-body{flex:1;min-width:0}
.cm-mv .cm-mv-t{font-size:16px;font-weight:600;line-height:1.25}
.cm-mv .cm-mv-t b{font-variant-numeric:tabular-nums}
.cm-mv .cm-mv-s{font-size:13px;color:#6b5c46;margin-top:2px;line-height:1.35}
.cm-mv .cm-mv-q{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.cm-mv .cm-mv-q b{display:block;font-size:19px;font-weight:700;line-height:1}
.cm-mv .cm-mv-q small{font-size:12px;color:#6b5c46}
.cm-mv.cm-out .cm-mv-q b{color:#7a1f10}
.cm-mv.cm-in .cm-mv-q b{color:#276b45}
.cm-mv.cm-fix .cm-mv-q b{color:#5a4634}
.cm-mv-undo{font-family:inherit;font-size:13.5px;background:#fff;border:1.5px solid #c5a97a;color:#5a4634;border-radius:9px;padding:7px 12px;cursor:pointer;min-height:38px;margin-left:4px}

.cm-openfull{display:block;margin:14px 12px 6px;text-align:center;font-family:inherit;font-size:16px;background:#fff;border:1.5px solid #c5a97a;color:#5a4634;border-radius:10px;padding:14px;cursor:pointer;width:calc(100% - 24px);min-height:50px}

/* ---------- barra azioni (zona pollice) ---------- */
.cm-actionpad{height:calc(84px + env(safe-area-inset-bottom))}
.cm-actions{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:rgba(253,248,240,.97);border-top:1px solid #d8c8a8;backdrop-filter:blur(6px);max-width:640px;margin:0 auto}
.cm-act{flex:1;font-family:inherit;font-size:16px;font-weight:700;border-radius:12px;padding:14px 8px;min-height:56px;cursor:pointer;border:1.5px solid #c5a97a;background:#fff;color:#5a4634;line-height:1.15}
.cm-act.cm-primary{flex:1.5;background:#7a1f10;border-color:#7a1f10;color:#fff5ea}
.cm-act:disabled{opacity:.5}
.cm-act small{display:block;font-size:11.5px;font-weight:400;font-style:italic;opacity:.8;margin-top:2px}

/* ---------- bottom sheet ---------- */
.cm-sheet-bg{position:fixed;inset:0;z-index:50;background:rgba(36,27,19,.45);display:flex;align-items:flex-end;justify-content:center}
.cm-sheet{width:100%;max-width:640px;background:#fdf8f0;border-radius:18px 18px 0 0;padding:8px 16px calc(18px + env(safe-area-inset-bottom));max-height:88vh;overflow-y:auto;box-shadow:0 -8px 30px rgba(36,27,19,.25)}
.cm-sheet-grip{width:42px;height:5px;border-radius:3px;background:#d8c8a8;margin:6px auto 12px}
.cm-sheet h3{font-size:20px;font-weight:700;margin:0 0 3px;line-height:1.2}
.cm-sheet .cm-sheet-sub{font-size:14px;color:#6b5c46;font-style:italic;margin-bottom:12px;line-height:1.4}
.cm-opt{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;font-family:inherit;text-align:left;background:#fff;border:1.5px solid #e2d4b8;border-radius:13px;padding:14px 15px;margin-bottom:9px;cursor:pointer;min-height:58px;color:#241b13}
.cm-opt:active{background:#fbf3e4}
.cm-opt .cm-ico{font-size:22px;width:28px;text-align:center}
.cm-opt .cm-otxt{flex:1;font-size:17px;font-weight:600}
.cm-opt .cm-otxt small{display:block;font-size:13px;color:#6b5c46;font-weight:400;font-style:italic;margin-top:1px}
.cm-opt .cm-oq{font-size:20px;font-weight:700;color:#8f3800;font-variant-numeric:tabular-nums}
.cm-opt.cm-danger{border-color:#e0b9ac;background:#fdf3f0}
.cm-sheet-cancel{width:100%;font-family:inherit;font-size:16px;background:none;border:none;color:#6b5c46;padding:14px;cursor:pointer;min-height:50px}

/* stepper quantità */
.cm-step{display:flex;align-items:center;gap:14px;justify-content:center;margin:6px 0 14px}
.cm-step button{font-family:inherit;font-size:30px;line-height:1;width:66px;height:66px;border-radius:50%;border:1.5px solid #c5a97a;background:#fff;color:#5a4634;cursor:pointer}
.cm-step button:disabled{opacity:.4}
.cm-step input{width:104px;text-align:center;font-family:inherit;font-size:38px;font-weight:700;font-variant-numeric:tabular-nums;border:1.5px solid #c5a97a;border-radius:13px;padding:8px 4px;background:#fff;color:#241b13}
.cm-step-lbl{text-align:center;font-size:14px;color:#6b5c46;font-style:italic;margin-bottom:10px}
.cm-confirm{width:100%;font-family:inherit;font-size:18px;font-weight:700;background:#2b2118;color:#f5ead3;border:none;border-radius:13px;padding:16px;min-height:58px;cursor:pointer}
.cm-confirm:disabled{opacity:.45}
.cm-delta{text-align:center;font-size:15px;color:#5a4634;margin:2px 0 12px}
.cm-delta b{color:#8f3800}

/* ---------- toast undo ---------- */
.cm-toast{position:fixed;left:12px;right:12px;bottom:calc(96px + env(safe-area-inset-bottom));z-index:60;max-width:616px;margin:0 auto;background:#241b13;color:#f5ead3;border-radius:13px;padding:14px 16px;display:flex;align-items:center;gap:12px;font-size:15.5px;box-shadow:0 6px 22px rgba(36,27,19,.35)}
.cm-toast.cm-err{background:#7a1f10}
.cm-toast button{font-family:inherit;font-size:15px;font-weight:700;background:none;border:1.5px solid rgba(245,234,211,.55);color:#f5ead3;border-radius:9px;padding:9px 14px;cursor:pointer;min-height:42px;white-space:nowrap}
`;

// ─────────────────────────────────────────────────────────────
// CARD lista (riusata da Cerca e ricerca)
// ─────────────────────────────────────────────────────────────
function VinoCard({ v, onOpen }) {
  const st = statoVino(v);
  const locs = buildLocations(v);
  const den = nomeDenominazione(v);
  const magnum = st.magnum;
  return (
    <div className="cm-card" onClick={() => onOpen(v.id)}>
      <div className="cm-qtatot"><b>{st.qta}</b><small>bt</small></div>
      <div className="cm-nome">
        {den && !magnum ? <><em>{den}</em>{" · "}</> : null}
        {v.DESCRIZIONE}
        {v.ANNATA ? <span className="cm-ann">{v.ANNATA}</span> : null}
      </div>
      <div className="cm-meta">
        {[nomeProduttore(v), nomeRegione(v), v.GRADO_ALCOLICO ? `${Number(v.GRADO_ALCOLICO).toFixed(1)}%` : null]
          .filter(Boolean).join(" · ")}
      </div>
      {(magnum || st.mescita || st.ultima || st.scarsa) && (
        <div className="cm-flags">
          {magnum && <span className="cm-flag cm-magnum">grande formato</span>}
          {st.mescita && <span className="cm-flag cm-mescita">🥂 in mescita</span>}
          {st.ultima && <span className="cm-flag cm-ultima">ultima bottiglia</span>}
          {st.scarsa && <span className="cm-flag cm-scarsa">scarsa</span>}
        </div>
      )}
      <div className="cm-locline">
        <span className="cm-pin">📍</span>{" "}
        {locs.length > 0 ? locs.map((l, i) => (
          <span key={i} className={`cm-locbadge ${isFrigo(l.nome) ? "cm-frigo" : ""}`}>
            {l.slot === "loc3" ? "in matrice" : l.nome} <b>{l.qta}</b>
          </span>
        )) : <span style={{ color: "#c5a97a", fontStyle: "italic" }}>locazione non indicata</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FINDER (modo Cerca + Per scaffale)
// ─────────────────────────────────────────────────────────────
function Finder() {
  const navigate = useNavigate();
  const [vini, setVini] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("cerca");     // "cerca" | "scaffale"
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState("tutti");
  // Modo «Per scaffale»: filtro sul nome della locazione + categoria, e
  // accordion (una locazione aperta per volta) per non srotolare tutto.
  const [shelfQ, setShelfQ] = useState("");
  const [shelfCat, setShelfCat] = useState("tutti");
  const [openShelf, setOpenShelf] = useState(null);

  const fetchVini = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/vini/v2/bottiglie/?only_positive_stock=true&limit=10000`);
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      const data = await r.json();
      setVini(Array.isArray(data) ? data : (data.items || data.bottiglie || []));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = t("page.title_cantina_mobile", "Cantina · Tre Gobbi");
    fetchVini();
    const id = setInterval(fetchVini, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchVini]);

  const openScheda = (id) => navigate(`/vini/cantina-mobile/${id}`);

  // Chip per CATEGORIA di locazione: Scaffali / Frigo / Matrice / Altro.
  // Conta quante etichette hanno almeno una locazione in quella categoria
  // (una bottiglia multi-posto può comparire in più categorie).
  const chips = useMemo(() => {
    const counts = {};
    for (const v of vini) {
      const cats = new Set(buildLocations(v).map(locCategory));
      for (const c of cats) counts[c] = (counts[c] || 0) + 1;
    }
    return [
      { k: "tutti", label: "Tutti", icon: "", n: vini.length },
      ...CAT_DEFS.filter(c => counts[c.k]).map(c => ({ ...c, n: counts[c.k] })),
    ];
  }, [vini]);

  const viniFiltered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return vini.filter(v => {
      if (chip !== "tutti") {
        const has = buildLocations(v).some(l => locCategory(l) === chip);
        if (!has) return false;
      }
      if (q) {
        const blob = `${v.DESCRIZIONE || ""} ${nomeDenominazione(v)} ${nomeProduttore(v)} ${nomeRegione(v)} ${v.TIPOLOGIA || ""} ${v.ANNATA || ""} ${v.VITIGNI || ""}`;
        if (!blob.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [vini, search, chip]);

  // Per scaffale: mappa locazione → bottiglie
  const shelves = useMemo(() => {
    const map = new Map();
    for (const v of vini) for (const l of buildLocations(v)) {
      const key = l.slot === "loc3" ? "Matrice (scaffale a griglia)" : l.nome;
      if (!map.has(key)) map.set(key, { nome: key, cat: locCategory(l), items: [], bt: 0 });
      const g = map.get(key);
      g.items.push({ v, qta: l.qta, celle: l.slot === "loc3" ? celleMatrice(l.matrice) : null });
      g.bt += l.qta;
    }
    // ordina: Scaffale…, poi Frigo…, poi il resto, alfabetico dentro i gruppi.
    // Eccezione matrice: dentro si va per posizione — colonna, poi riga (la
    // prima cella occupata dal vino), così la lista segue il giro fisico dello
    // scaffale. Vini senza celle leggibili in fondo, alfabetici.
    const rank = (nome) => (/^scaffale/i.test(nome) ? 0 : isFrigo(nome) ? 1 : /matrice/i.test(nome) ? 3 : 2);
    const alfa = (x, y) => (x.v.DESCRIZIONE || "").localeCompare(y.v.DESCRIZIONE || "", "it");
    const perCella = (x, y) => {
      const a = x.celle?.[0], b = y.celle?.[0];
      if (!a || !b) return (a ? -1 : b ? 1 : 0) || alfa(x, y);
      return (a[0] - b[0]) || (a[1] - b[1]) || alfa(x, y);
    };
    return [...map.values()]
      .sort((a, b) => (rank(a.nome) - rank(b.nome)) || a.nome.localeCompare(b.nome, "it"))
      .map(g => ({ ...g, items: g.items.sort(g.cat === "matrice" ? perCella : alfa) }));
  }, [vini]);

  // Chip categoria per il modo «Per scaffale»: conta le LOCAZIONI, non le etichette.
  const shelfChips = useMemo(() => {
    const counts = {};
    for (const s of shelves) counts[s.cat] = (counts[s.cat] || 0) + 1;
    return [
      { k: "tutti", label: "Tutti", icon: "", n: shelves.length },
      ...CAT_DEFS.filter(c => counts[c.k]).map(c => ({ ...c, n: counts[c.k] })),
    ];
  }, [shelves]);

  // Filtro: nome locazione (testo) + categoria. Cerca anche dentro le etichette
  // contenute, così «barbera» mostra gli scaffali dove sta la barbera.
  const shelvesFiltered = useMemo(() => {
    const q = shelfQ.toLowerCase().trim();
    return shelves.filter(s => {
      if (shelfCat !== "tutti" && s.cat !== shelfCat) return false;
      if (!q) return true;
      if (s.nome.toLowerCase().includes(q)) return true;
      return s.items.some(({ v }) =>
        `${v.DESCRIZIONE || ""} ${nomeProduttore(v)}`.toLowerCase().includes(q));
    });
  }, [shelves, shelfQ, shelfCat]);

  const totBt = useMemo(() => vini.reduce((s, v) => s + num(v.QTA_TOTALE), 0), [vini]);

  return (
    <div className="cm-root">
      <style>{STYLE}</style>
      <div className="cm-wrap">
        <div className="cm-top">
          <div className="cm-top-row">
            <button className="cm-back" onClick={() => navigate("/vini")} title="Torna ai Vini">‹</button>
            <div>
              <div className="cm-title">In cantina</div>
              <div className="cm-sub">{vini.length} etichette · {totBt} bottiglie</div>
            </div>
            <span className="cm-live"><span className="cm-live-dot"></span>live</span>
          </div>
          <div className="cm-modes">
            <button className={mode === "cerca" ? "cm-on" : ""} onClick={() => setMode("cerca")}>🔍 Cerca vino</button>
            <button className={mode === "scaffale" ? "cm-on" : ""} onClick={() => setMode("scaffale")}>📍 Per scaffale</button>
          </div>
        </div>

        {loading && <div className="cm-loading">Caricamento cantina…</div>}
        {!loading && error && <div className="cm-empty" style={{ color: "#8f3800" }}>{error}</div>}

        {!loading && !error && mode === "cerca" && (
          <>
            <div className="cm-searchbar">
              <input
                className="cm-search" type="text" autoComplete="off"
                placeholder="vino, produttore, regione, annata…"
                value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="cm-chips">
              {chips.map(c => (
                <button key={c.k} className={`cm-chip ${chip === c.k ? "cm-on" : ""}`} onClick={() => setChip(c.k)}>
                  {c.icon ? `${c.icon} ` : ""}{c.label}<span className="cm-n">{c.n}</span>
                </button>
              ))}
            </div>
            <div className="cm-count">
              {viniFiltered.length} {viniFiltered.length === 1 ? "bottiglia" : "etichette"}
              {chip !== "tutti" ? ` · ${CAT_LABEL[chip] || chip}` : ""}
            </div>
            {viniFiltered.length === 0
              ? <div className="cm-hint">Nessuna bottiglia. Prova un altro nome o scaffale.</div>
              : viniFiltered.map(v => <VinoCard key={v.id} v={v} onOpen={openScheda} />)}
          </>
        )}

        {!loading && !error && mode === "scaffale" && (
          <>
            <div className="cm-searchbar">
              <input
                className="cm-search" type="text" autoComplete="off"
                placeholder="quale scaffale? (nome locazione o vino)"
                value={shelfQ} onChange={e => setShelfQ(e.target.value)}
              />
            </div>
            <div className="cm-chips">
              {shelfChips.map(c => (
                <button key={c.k} className={`cm-chip ${shelfCat === c.k ? "cm-on" : ""}`} onClick={() => setShelfCat(c.k)}>
                  {c.icon ? `${c.icon} ` : ""}{c.label}<span className="cm-n">{c.n}</span>
                </button>
              ))}
            </div>
            <div className="cm-count">
              {shelvesFiltered.length} {shelvesFiltered.length === 1 ? "locazione" : "locazioni"}
              {shelfCat !== "tutti" ? ` · ${CAT_LABEL[shelfCat] || shelfCat}` : ""}
            </div>
            {shelvesFiltered.length === 0
              ? <div className="cm-hint">Nessuna locazione con questo nome.</div>
              : <div className="cm-hint">Tocca uno scaffale per vedere cosa c'è — comodo quando rimetti a posto o fai il giro di controllo.</div>}
            {shelvesFiltered.map((s, i) => {
              // una sola locazione a video → già aperta, niente tap in più
              const isOpen = openShelf === s.nome || shelvesFiltered.length === 1;
              return (
                <div key={i}>
                  <button
                    type="button"
                    className={`cm-shelf-head ${isOpen ? "cm-open" : ""}`}
                    onClick={() => setOpenShelf(isOpen && shelvesFiltered.length > 1 ? null : s.nome)}
                  >
                    <span className="cm-shelf-nome">
                      <span className="cm-shelf-caret">{isOpen ? "▾" : "▸"}</span>
                      {s.nome}
                    </span>
                    <span className="cm-shelf-n">
                      {s.items.length} {s.items.length === 1 ? "etichetta" : "etichette"} · {s.bt} bt
                    </span>
                  </button>
                  {isOpen && (
                    <div className="cm-shelf-body">
                      {s.items.map(({ v, qta, celle }, j) => (
                        <div key={j} className="cm-shelf-row" onClick={() => openScheda(v.id)}>
                          <span>
                            {celle?.length > 0 && <span className="cm-sr-cella">{celleLabel(celle)}</span>}
                            {v.DESCRIZIONE}
                            {v.ANNATA ? ` ${v.ANNATA}` : ""}
                            <span className="cm-sr-sub"> — {nomeProduttore(v)}</span>
                          </span>
                          <span className="cm-sr-q">{qta} bt</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCHEDA dettaglio + movimentazione
//
// Scrittura riservata a admin/superadmin/sommelier (specchio di
// `is_vini_manager` lato backend). Gli altri ruoli vedono la scheda in sola
// lettura; la sala mantiene il toggle mescita, che è azione di servizio e il
// backend le concede già (PATCH /bottiglia-aperta).
//
// Movimenti registrati: VENDITA (bottiglia uscita e venduta, entra nelle
// statistiche), SCARICO (rotta/omaggio/assaggio: esce senza contare come
// vendita), CARICO (arrivo). La conta corregge SEMPRE per delta sul posto —
// mai con RETTIFICA — perché la RETTIFICA è un valore assoluto GLOBALE che
// non tocca le QTA per locazione: usarla dal telefono sfaserebbe il totale
// dalla somma dei posti. La matrice (loc3) resta di sola lettura: muoverla
// richiede di scegliere le celle, e senza griglia si sfaserebbero QTA_LOC3
// e `matrice_celle`.
// ─────────────────────────────────────────────────────────────
const MOV_ICO = { CARICO: "📥", VENDITA: "🍷", SCARICO: "📤", RETTIFICA: "✏️", MODIFICA: "🔁" };
const MOV_LABEL = { CARICO: "Carico", VENDITA: "Venduta", SCARICO: "Scarico", RETTIFICA: "Rettifica", MODIFICA: "Modifica" };

/** Nome leggibile di uno slot (frigo/loc1/loc2/loc3) per questa bottiglia. */
function slotNome(v, slot) {
  if (!slot) return "";
  const s = String(slot).toLowerCase();
  if (s === "frigo") return v.FRIGORIFERO || "frigo";
  if (s === "loc1") return v.LOCAZIONE_1 || "locazione 1";
  if (s === "loc2") return v.LOCAZIONE_2 || "locazione 2";
  if (s === "loc3") return "scaffale a matrice";
  return s;
}

function Scheda({ id }) {
  const navigate = useNavigate();
  const [v, setV] = useState(null);
  const [movimenti, setMovimenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);   // {msg, movId?, err?}
  const [sheet, setSheet] = useState(null);   // {kind:"posto"|"qta"|"azioni", ...}
  const toastTid = useRef(null);
  // Guardia sul doppio tap: `busy` è stato React e si aggiorna al render
  // successivo, quindi due tap nello stesso frame passerebbero entrambi
  // (= due vendite). La ref si alza subito, prima di partire con la fetch.
  const busyRef = useRef(false);

  const role = useMemo(() => localStorage.getItem("role") || "", []);
  const canWrite = isViniManagerRole(role);
  const canMescita = canWrite || role === "sala";

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/vini/v2/bottiglie/${id}`);
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      setV(await r.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    try {
      const rm = await apiFetch(`${API_BASE}/vini/magazzino/${id}/movimenti?limit=20`);
      if (rm.ok) { const m = await rm.json(); setMovimenti(Array.isArray(m) ? m : []); }
    } catch { /* movimenti opzionali: la scheda resta utile anche senza */ }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => clearTimeout(toastTid.current), []);

  function showToast(next) {
    clearTimeout(toastTid.current);
    setToast(next);
    toastTid.current = setTimeout(() => setToast(null), next.err ? 6000 : UNDO_MS);
  }

  /** Un solo punto di scrittura: POST movimento, aggiorna vino + timeline,
   *  arma l'Annulla sul movimento appena creato. */
  async function postMovimento({ tipo, qta, loc, note, msg }) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${id}/movimenti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo, qta, origine: ORIGINE, note,
          ...(loc ? { locazione: loc.slot } : {}),
        }),
      });
      if (!r.ok) {
        let detail = `Errore ${r.status}`;
        try { detail = (await r.json()).detail || detail; } catch { /* noop */ }
        throw new Error(detail);
      }
      const data = await r.json();
      // `data.vino` è la riga grezza di vini_bottiglie: non ha i campi in join
      // della vista v2 (produttore, regione, denominazione) che l'hero mostra.
      // Quindi si ricarica dalla stessa fonte del primo caricamento.
      const mov = (data.movimenti || []).find(m => m.tipo === tipo);
      setSheet(null);
      await load();
      showToast({ msg, movId: mov ? mov.id : null });
    } catch (e) {
      showToast({ msg: `Non registrato: ${e.message}`, err: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function annullaMovimento(movId) {
    clearTimeout(toastTid.current);
    setToast(null);
    if (!movId || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/movimenti/${movId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      await load();
    } catch (e) {
      showToast({ msg: `Annulla non riuscito: ${e.message}`, err: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function toggleMescita() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${id}/bottiglia-aperta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ BOTTIGLIA_APERTA: num(v.BOTTIGLIA_APERTA) ? 0 : 1 }),
      });
      if (!r.ok) {
        let detail = `Errore ${r.status}`;
        try { detail = (await r.json()).detail || detail; } catch { /* noop */ }
        throw new Error(detail);
      }
      await load();
    } catch (e) {
      showToast({ msg: `Mescita non aggiornata: ${e.message}`, err: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // ── Avvio azioni ──────────────────────────────────────────
  // Un posto solo → si va dritti (in cantina ogni tap in più è un tap di
  // troppo). Più posti → sheet «da dove?», che è anche la domanda che il
  // backend impone: per VENDITA e SCARICO la locazione è obbligatoria.
  function avviaVendita() {
    const cand = slotsOperabili(v).filter(s => s.qta > 0);
    if (!cand.length) return showToast({ msg: "Nessuna giacenza nei posti gestibili dal telefono.", err: true });
    if (cand.length === 1) return vendiDa(cand[0]);
    setSheet({ kind: "posto", action: "vendita" });
  }
  function avviaCarico() {
    const cand = slotsOperabili(v);
    if (!cand.length) return showToast({ msg: "Nessuna locazione impostata: assegnala dal gestionale.", err: true });
    if (cand.length === 1) return setSheet({ kind: "qta", action: "carico", loc: cand[0], val: 1 });
    setSheet({ kind: "posto", action: "carico" });
  }
  function avviaConta() {
    const cand = slotsOperabili(v);
    if (!cand.length) return showToast({ msg: "Nessuna locazione impostata: assegnala dal gestionale.", err: true });
    if (cand.length === 1) return setSheet({ kind: "qta", action: "conta", loc: cand[0], val: cand[0].qta });
    setSheet({ kind: "posto", action: "conta" });
  }

  function vendiDa(loc) {
    postMovimento({
      tipo: "VENDITA", qta: 1, loc,
      note: `Vendita registrata dalla cantina mobile (${loc.nome})`,
      msg: `−1 bt venduta · ${loc.nome}`,
    });
  }

  /** Scelto il posto: la vendita parte subito, le altre passano dallo stepper. */
  function scegliPosto(loc) {
    const a = sheet.action;
    if (a === "vendita") return vendiDa(loc);
    if (a === "conta") return setSheet({ kind: "qta", action: "conta", loc, val: loc.qta });
    setSheet({ kind: "qta", action: a, loc, val: 1 });
  }

  function confermaQta() {
    const { action, loc, val } = sheet;
    const q = Math.max(0, Math.round(num(val)));
    if (action === "carico") {
      if (q < 1) return;
      return postMovimento({
        tipo: "CARICO", qta: q, loc,
        note: `Carico dalla cantina mobile (${loc.nome})`,
        msg: `+${q} bt · ${loc.nome}`,
      });
    }
    if (action === "scarico") {
      if (q < 1) return;
      return postMovimento({
        tipo: "SCARICO", qta: q, loc,
        note: `Scarico dalla cantina mobile (${loc.nome})`,
        msg: `−${q} bt scaricate · ${loc.nome}`,
      });
    }
    // conta: correzione per DELTA sul posto, mai RETTIFICA globale
    const delta = q - num(loc.qta);
    if (delta === 0) {
      setSheet(null);
      return showToast({ msg: `Contate ${q} bt in ${loc.nome}: giacenza confermata.` });
    }
    const nota = `[CONTA] contate ${q} bt in ${loc.nome} (erano ${loc.qta})`;
    return postMovimento({
      tipo: delta > 0 ? "CARICO" : "SCARICO",
      qta: Math.abs(delta), loc, note: nota,
      msg: `${loc.nome}: ${loc.qta} → ${q} bt`,
    });
  }

  if (loading) return (
    <div className="cm-root"><style>{STYLE}</style>
      <div className="cm-wrap"><div className="cm-loading">Caricamento scheda…</div></div>
    </div>
  );
  if (error || !v) return (
    <div className="cm-root"><style>{STYLE}</style>
      <div className="cm-wrap">
        <div className="cm-top"><div className="cm-top-row">
          <button className="cm-back" onClick={() => navigate("/vini/cantina-mobile")}>‹</button>
          <div className="cm-title">Scheda</div>
        </div></div>
        <div className="cm-empty" style={{ color: "#8f3800" }}>{error || "Vino non trovato"}</div>
      </div>
    </div>
  );

  const st = statoVino(v);
  const locs = buildLocations(v);
  const den = nomeDenominazione(v);
  const matrice = parseMatrice(v.LOCAZIONE_3);
  const calice = (num(v.VENDITA_CALICE) || st.mescita) ? v.PREZZO_CALICE : null;
  const tipoLabel = (v.TIPOLOGIA || "").charAt(0) + (v.TIPOLOGIA || "").slice(1).toLowerCase();

  const operabili = slotsOperabili(v);
  const saldi = saldiMovimenti(movimenti, st.qta);

  const fmtOra = (s) => {
    if (!s) return "";
    const d = new Date(String(s).replace(" ", "T"));
    if (isNaN(d.getTime())) return String(s).slice(11, 16);
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  };
  const mvCls = (tp) => (tp === "VENDITA" || tp === "SCARICO") ? "cm-out" : tp === "CARICO" ? "cm-in" : "cm-fix";
  const mvSegno = (m) => {
    if (m.tipo === "CARICO") return `+${m.qta}`;
    if (m.tipo === "VENDITA" || m.tipo === "SCARICO") return `−${m.qta}`;
    if (m.tipo === "RETTIFICA") return `= ${m.qta}`;
    return "·";
  };

  return (
    <div className="cm-root cm-det">
      <style>{STYLE}</style>
      <div className="cm-wrap">
        <div className="cm-top">
          <div className="cm-top-row">
            <button className="cm-back" onClick={() => navigate("/vini/cantina-mobile")}>‹</button>
            <div><div className="cm-sub">Cantina · scheda</div></div>
            <span className="cm-live" style={{ color: "#6b5c46", fontStyle: "normal", fontWeight: 700 }}>#{v.id}</span>
          </div>
        </div>

        {/* HERO */}
        <div className="cm-hero">
          {v.TIPOLOGIA && <span className="cm-tipo">{tipoLabel}</span>}
          <h2>
            {den && !st.magnum ? <em>{den} · </em> : null}
            {v.DESCRIZIONE}
            {v.ANNATA ? <span className="cm-hann">{v.ANNATA}</span> : null}
          </h2>
          <div className="cm-prod">
            {[nomeProduttore(v), nomeRegione(v), v.VITIGNI].filter(Boolean).join(" · ")}
          </div>
          <div className="cm-badges">
            {num(v.CARTA) ? <span className="cm-badge cm-b-carta">in carta</span> : <span className="cm-badge cm-b-off">fuori carta</span>}
            {st.mescita && <span className="cm-badge cm-b-mescita">🥂 in mescita</span>}
            {st.ultima && <span className="cm-badge" style={{ background: "#f5d7c8", color: "#5b2c1a" }}>ultima bottiglia</span>}
            {canMescita && (
              <button
                type="button"
                className={`cm-mesc-btn ${st.mescita ? "cm-on" : ""}`}
                disabled={busy}
                onClick={toggleMescita}
              >
                {st.mescita ? "Chiudi mescita" : "🥂 Apri in mescita"}
              </button>
            )}
          </div>
        </div>

        {/* STATS */}
        <div className="cm-stats">
          <div className="cm-stat"><div className="cm-k">Giacenza</div><div className="cm-v">{st.qta}<small> bt</small></div></div>
          <div className="cm-stat"><div className="cm-k">Bottiglia</div><div className="cm-v">{fmtPrezzo(v.PREZZO_CARTA)}<small> €</small></div></div>
          <div className="cm-stat"><div className="cm-k">Calice</div><div className="cm-v">{calice != null ? <>{fmtPrezzo(calice)}<small> €</small></> : "—"}</div></div>
        </div>

        {/* DOVE SI TROVA */}
        <div className="cm-sec">
          <div className="cm-sec-h"><span className="cm-t">📍 Dove si trova</span><span className="cm-r">{locs.length} {locs.length === 1 ? "posto" : "posti"}</span></div>
          {locs.length === 0 && <div className="cm-phase2" style={{ borderTop: "none" }}>Nessuna locazione con giacenza indicata.</div>}
          {locs.map((l, i) => {
            // La riga diventa operativa se è un posto che il telefono può
            // muovere (frigo/loc1/loc2) e l'utente ha i permessi.
            const op = operabili.find(s => s.slot === l.slot);
            const tap = canWrite && !!op;
            const inner = (
              <>
                <span className="cm-ico">{isFrigo(l.nome) ? "🧊" : l.slot === "loc3" ? "🔳" : "🍷"}</span>
                <span className="cm-lnome">
                  {l.slot === "loc3" ? "Scaffale a matrice" : l.nome}
                  <small>{isFrigo(l.nome) ? "pronto al servizio" : l.slot === "loc3" ? "posizione a griglia" : "scorta"}</small>
                </span>
                <span className="cm-lq">{l.qta}<small> bt</small></span>
                {tap && <span className="cm-chev">›</span>}
              </>
            );
            return tap
              ? <button key={i} type="button" className="cm-loc cm-tap" onClick={() => setSheet({ kind: "azioni", loc: op })}>{inner}</button>
              : <div key={i} className="cm-loc">{inner}</div>;
          })}
          {locs.length > 0 && <div className="cm-loctot"><span>Totale</span><span className="cm-lq">{st.qta} bt</span></div>}

          {matrice && (
            <div className="cm-matrice">
              <div className="cm-matrice-lbl">Posizione sullo scaffale a matrice:</div>
              <div className="cm-grid" style={{ gridTemplateColumns: `repeat(${matrice.maxC - matrice.minC + 1}, 24px)` }}>
                {Array.from({ length: matrice.maxR - matrice.minR + 1 }).flatMap((_, ri) =>
                  Array.from({ length: matrice.maxC - matrice.minC + 1 }).map((__, ci) => {
                    const col = matrice.minC + ci, riga = matrice.minR + ri;
                    const on = matrice.set.has(`${col}-${riga}`);
                    return <div key={`${col}-${riga}`} className={`cm-cell ${on ? "cm-cellon" : ""}`} />;
                  })
                )}
              </div>
              <div className="cm-matrice-cap">
                {matrice.n} {matrice.n === 1 ? "cella occupata" : "celle occupate"} — colonn{matrice.minC === matrice.maxC ? `a ${matrice.minC}` : `e ${matrice.minC}–${matrice.maxC}`}, fil{matrice.minR === matrice.maxR ? `a ${matrice.minR}` : `e ${matrice.minR}–${matrice.maxR}`}.
              </div>
            </div>
          )}

          {canWrite && operabili.length > 0 && (
            <div className="cm-phase2">
              Tocca un posto per <b>vendere, scaricare, caricare o contare</b> le bottiglie che ci sono lì.
              {matrice ? " La matrice si sposta solo dal gestionale: servono le celle." : ""}
            </div>
          )}
          {canWrite && operabili.length === 0 && (
            <div className="cm-phase2">Nessuna locazione impostata su questa bottiglia: assegnala dal gestionale e poi la muovi da qui.</div>
          )}
          {!canWrite && (
            <div className="cm-phase2">Sola lettura: i movimenti di cantina li registrano <b>oste e sommelier</b>.</div>
          )}
        </div>

        {/* ANAGRAFICA */}
        <div className="cm-sec">
          <div className="cm-sec-h"><span className="cm-t">Anagrafica</span></div>
          <div className="cm-facts">
            <div className="cm-fact"><div className="cm-k">Formato</div><div className="cm-v">{v.FORMATO || "—"}</div></div>
            <div className="cm-fact"><div className="cm-k">Grado</div><div className="cm-v">{v.GRADO_ALCOLICO ? `${Number(v.GRADO_ALCOLICO).toFixed(1)}%` : "—"}</div></div>
            <div className="cm-fact"><div className="cm-k">Annata</div><div className="cm-v">{v.ANNATA || "—"}</div></div>
            <div className="cm-fact"><div className="cm-k">Vitigni</div><div className="cm-v">{v.VITIGNI || "—"}</div></div>
            <div className="cm-fact"><div className="cm-k">Listino</div><div className="cm-v">{v.EURO_LISTINO ? `${fmtPrezzo(v.EURO_LISTINO)} €` : "—"}</div></div>
            <div className="cm-fact"><div className="cm-k">Denominazione</div><div className="cm-v" style={{ fontSize: 14.5 }}>{den || "—"}</div></div>
          </div>
          {v.NOTE && (
            <div style={{ padding: "10px 15px", borderTop: "1px solid #f2e9d6" }}>
              <div className="cm-k" style={{ fontSize: 11.5, letterSpacing: ".08em", textTransform: "uppercase", color: "#6b5c46" }}>Note interne</div>
              <div style={{ fontSize: 15.5, whiteSpace: "pre-wrap", marginTop: 3, lineHeight: 1.45 }}>{v.NOTE}</div>
            </div>
          )}
        </div>

        {/* MOVIMENTI — aperti: in cantina la domanda vera è «chi l'ha toccata
            e quante ne restavano», non «apri il pannello». */}
        <div className="cm-sec">
          <div className="cm-sec-h">
            <span className="cm-t">Movimenti</span>
            <span className="cm-r">{movimenti.length ? `ultimi ${movimenti.length}` : "nessuno"}</span>
          </div>
          {movimenti.length === 0
            ? <div className="cm-phase2" style={{ borderTop: "none" }}>Nessun movimento registrato per questa bottiglia.</div>
            : movimenti.map((m, i) => {
              const giorno = giornoLabel(m.data_mov);
              const nuovoGiorno = i === 0 || giorno !== giornoLabel(movimenti[i - 1].data_mov);
              const saldo = saldi[i];
              const loc = slotNome(v, m.locazione);
              const chi = [m.utente, m.origine && m.origine !== "GESTIONALE" ? m.origine.toLowerCase() : null]
                .filter(Boolean).join(" · ");
              return (
                <React.Fragment key={m.id || i}>
                  {nuovoGiorno && <div className="cm-day">{giorno}</div>}
                  <div className={`cm-mv ${mvCls(m.tipo)}`}>
                    <span className="cm-mv-ico">{MOV_ICO[m.tipo] || "•"}</span>
                    <span className="cm-mv-body">
                      <span className="cm-mv-t">
                        {MOV_LABEL[m.tipo] || m.tipo}
                        {loc ? <> · <b>{loc}</b></> : null}
                      </span>
                      <span className="cm-mv-s">
                        {fmtOra(m.data_mov)}{chi ? ` · ${chi}` : ""}
                        {m.note && /\[CONTA\]/.test(m.note) ? " · conta" : ""}
                      </span>
                    </span>
                    <span className="cm-mv-q">
                      <b>{mvSegno(m)}</b>
                      {saldo != null && <small>restano {saldo} bt</small>}
                    </span>
                    {canWrite && i === 0 && m.tipo !== "MODIFICA" && (
                      <button
                        type="button" className="cm-mv-undo" disabled={busy}
                        onClick={() => annullaMovimento(m.id)}
                      >
                        annulla
                      </button>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
        </div>

        {/* Link alla scheda gestionale completa (desktop) */}
        <button className="cm-openfull" onClick={() => navigate(`/vini/v2/bottiglia/${v.id}`)}>
          Apri la scheda gestionale completa →
        </button>

        {/* spazio per non far coprire l'ultima riga dalla barra fissa */}
        {canWrite && <div className="cm-actionpad" />}
      </div>

      {/* BARRA AZIONI — zona pollice, sempre raggiungibile */}
      {canWrite && (
        <div className="cm-actions">
          <button className="cm-act cm-primary" disabled={busy} onClick={avviaVendita}>
            🍷 Venduta −1
          </button>
          <button className="cm-act" disabled={busy} onClick={avviaCarico}>➕<small>carico</small></button>
          <button className="cm-act" disabled={busy} onClick={avviaConta}>✏️<small>conta</small></button>
        </div>
      )}

      {/* TOAST con Annulla */}
      {toast && (
        <div className={`cm-toast ${toast.err ? "cm-err" : ""}`}>
          <span style={{ flex: 1 }}>{toast.msg}</span>
          {toast.movId
            ? <button type="button" onClick={() => annullaMovimento(toast.movId)}>Annulla</button>
            : <button type="button" onClick={() => { clearTimeout(toastTid.current); setToast(null); }}>ok</button>}
        </div>
      )}

      {/* BOTTOM SHEET */}
      {sheet && (
        <div className="cm-sheet-bg" onClick={() => !busy && setSheet(null)}>
          <div className="cm-sheet" onClick={e => e.stopPropagation()}>
            <div className="cm-sheet-grip" />

            {sheet.kind === "azioni" && (
              <>
                <h3>{sheet.loc.nome}</h3>
                <div className="cm-sheet-sub">{sheet.loc.qta} bt in questo posto · {v.DESCRIZIONE}</div>
                <button className="cm-opt" disabled={busy || sheet.loc.qta < 1} onClick={() => vendiDa(sheet.loc)}>
                  <span className="cm-ico">🍷</span>
                  <span className="cm-otxt">Venduta<small>−1 bt, conta come vendita</small></span>
                </button>
                <button className="cm-opt" disabled={busy || sheet.loc.qta < 1}
                  onClick={() => setSheet({ kind: "qta", action: "scarico", loc: sheet.loc, val: 1 })}>
                  <span className="cm-ico">📤</span>
                  <span className="cm-otxt">Scarico<small>rotta, omaggio, assaggio: esce senza vendita</small></span>
                </button>
                <button className="cm-opt" disabled={busy}
                  onClick={() => setSheet({ kind: "qta", action: "carico", loc: sheet.loc, val: 1 })}>
                  <span className="cm-ico">📥</span>
                  <span className="cm-otxt">Carico<small>bottiglie arrivate o rimesse qui</small></span>
                </button>
                <button className="cm-opt" disabled={busy}
                  onClick={() => setSheet({ kind: "qta", action: "conta", loc: sheet.loc, val: sheet.loc.qta })}>
                  <span className="cm-ico">✏️</span>
                  <span className="cm-otxt">Conta<small>quante ce ne sono davvero qui</small></span>
                </button>
                <button className="cm-sheet-cancel" onClick={() => setSheet(null)}>Chiudi</button>
              </>
            )}

            {sheet.kind === "posto" && (
              <>
                <h3>{sheet.action === "vendita" ? "Da dove la prendi?" : sheet.action === "carico" ? "Dove la metti?" : "Quale posto conti?"}</h3>
                <div className="cm-sheet-sub">{v.DESCRIZIONE}{v.ANNATA ? ` ${v.ANNATA}` : ""}</div>
                {operabili
                  .filter(s => sheet.action !== "vendita" || s.qta > 0)
                  .map(s => (
                    <button key={s.slot} className="cm-opt" disabled={busy} onClick={() => scegliPosto(s)}>
                      <span className="cm-ico">{isFrigo(s.nome) ? "🧊" : "🍷"}</span>
                      <span className="cm-otxt">{s.nome}<small>{isFrigo(s.nome) ? "pronto al servizio" : "scorta"}</small></span>
                      <span className="cm-oq">{s.qta}</span>
                    </button>
                  ))}
                <button className="cm-sheet-cancel" onClick={() => setSheet(null)}>Annulla</button>
              </>
            )}

            {sheet.kind === "qta" && (() => {
              const val = num(sheet.val);
              const min = sheet.action === "conta" ? 0 : 1;
              const conta = sheet.action === "conta";
              const delta = conta ? val - num(sheet.loc.qta) : 0;
              return (
                <>
                  <h3>
                    {conta ? "Quante ce ne sono?" : sheet.action === "carico" ? "Quante ne carichi?" : "Quante ne scarichi?"}
                  </h3>
                  <div className="cm-sheet-sub">{sheet.loc.nome} · ora {sheet.loc.qta} bt</div>
                  <div className="cm-step">
                    <button type="button" disabled={val <= min} onClick={() => setSheet(s => ({ ...s, val: Math.max(min, num(s.val) - 1) }))}>−</button>
                    <input
                      type="number" inputMode="numeric" pattern="[0-9]*" min={min}
                      value={String(val)}
                      onChange={e => setSheet(s => ({ ...s, val: e.target.value === "" ? "" : Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                    />
                    <button type="button" onClick={() => setSheet(s => ({ ...s, val: num(s.val) + 1 }))}>+</button>
                  </div>
                  <div className="cm-step-lbl">bottiglie</div>
                  {conta && (
                    <div className="cm-delta">
                      {delta === 0
                        ? "Coincide con quello che risulta a sistema."
                        : <>Correzione: <b>{delta > 0 ? `+${delta}` : delta}</b> bt su questo posto</>}
                    </div>
                  )}
                  <button className="cm-confirm" disabled={busy || (!conta && val < 1)} onClick={confermaQta}>
                    {busy ? "Registro…" : conta ? "Conferma la conta" : sheet.action === "carico" ? `Carica ${val} bt` : `Scarica ${val} bt`}
                  </button>
                  <button className="cm-sheet-cancel" onClick={() => setSheet(null)}>Annulla</button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Entry point: /:id → scheda, altrimenti finder
// ─────────────────────────────────────────────────────────────
export default function CantinaMobile() {
  const { id } = useParams();
  return id ? <Scheda id={id} /> : <Finder />;
}
