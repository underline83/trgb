// frontend/src/pages/vini/CantinaMobile.jsx
// Modulo: vini
// @version: v1.0 — "Cantina da iPhone" fase 1 «trova la bottiglia» (2026-07-20)
//
// Pagina mobile-first, pensata per l'uso col telefono in mano tra gli
// scaffali. Fase 1 (V.9): SOLO CONSULTAZIONE, nessuna scrittura.
//
// Due modi + dettaglio:
//   · CERCA — ricerca testo + filtro per categoria di locazione
//     (Scaffali / Frigo / Matrice / Altro).
//   · PER SCAFFALE — vista inversa: scegli la locazione, vedi cosa contiene
//     (comodo quando rimetti a posto o fai il giro di controllo).
//   · SCHEDA (/:id) — dettaglio read-first: identità, «Dove si trova» in
//     evidenza (con griglia matrice), anagrafica, movimenti collassabili.
//
// Fonte dati (endpoint esistenti, nessuna modifica backend):
//   GET /vini/v2/bottiglie/?only_positive_stock=true&limit=10000   lista in giacenza
//   GET /vini/v2/bottiglie/{id}                                    dettaglio
//   GET /vini/magazzino/{id}/movimenti?limit=8                     movimenti recenti
//
// Le righe rimandano a /vini/cantina-mobile/{id} (scheda mobile), NON alla
// scheda gestionale densa: l'esperienza sul telefono resta coerente.
// Le fasi 2 (correggi giacenze +/−) e 3 (conta inventario) si innestano su
// questa base — la card «Dove si trova» è già predisposta.
//
// Stile osteria (Cormorant Garamond, palette beige/marrone/terracotta),
// coerente con CartaStaff/CartaClienti. Prefisso classi: cm-.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { t } from "../../utils/localeStrings";

const REFRESH_MS = 90_000;

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

// ─────────────────────────────────────────────────────────────
// CSS (token osteria)
// ─────────────────────────────────────────────────────────────
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&display=swap');
.cm-root{font-family:"Cormorant Garamond","Times New Roman",serif;background:#fdf8f0;color:#2b2118;min-height:100vh;-webkit-font-smoothing:antialiased}
.cm-wrap{max-width:640px;margin:0 auto;padding-bottom:40px}

.cm-top{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid #d8c8a8;padding:12px 16px 10px}
.cm-top-row{display:flex;align-items:center;gap:10px}
.cm-back{font-size:24px;color:#5a4634;background:none;border:none;line-height:1;padding:0 4px 0 0;cursor:pointer;font-family:inherit}
.cm-title{font-size:20px;font-weight:700;letter-spacing:.03em}
.cm-sub{font-size:10.5px;color:#5a4634;letter-spacing:.14em;text-transform:uppercase}
.cm-live{margin-left:auto;font-size:10.5px;color:#2e7d4f;font-style:italic;white-space:nowrap}
.cm-live-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#2e7d4f;margin-right:4px;animation:cm-p 2s infinite}
@keyframes cm-p{0%,100%{opacity:1}50%{opacity:.3}}
.cm-refresh{font-family:inherit;font-size:13px;background:#fff;border:1px solid #c5a97a;color:#5a4634;border-radius:8px;padding:5px 10px;cursor:pointer;min-height:34px}

.cm-modes{display:flex;gap:6px;background:#efe6d6;border-radius:11px;padding:4px;margin-top:12px}
.cm-modes button{flex:1;font-family:inherit;font-size:14px;border:none;background:transparent;color:#5a4634;padding:9px 0;border-radius:8px;font-weight:600;min-height:42px;cursor:pointer}
.cm-modes button.cm-on{background:#2b2118;color:#f5ead3}

.cm-searchbar{padding:12px 16px 6px}
.cm-search{width:100%;font-family:inherit;font-size:17px;padding:12px 15px;border:1.5px solid #c5a97a;border-radius:11px;background:#fff;color:#2b2118;box-sizing:border-box}
.cm-search::placeholder{font-style:italic;color:#b5a488}

.cm-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 16px 4px;scrollbar-width:none}
.cm-chips::-webkit-scrollbar{display:none}
.cm-chip{flex:0 0 auto;font-family:inherit;font-size:13px;padding:8px 14px;border-radius:16px;border:1px solid #c5a97a;background:#fff;color:#5a4634;white-space:nowrap;min-height:38px;cursor:pointer}
.cm-chip.cm-on{background:#2b2118;color:#f5ead3;border-color:#2b2118}
.cm-chip .cm-n{opacity:.55;font-size:11px;margin-left:4px}

.cm-count{font-size:11.5px;color:#8a7a65;font-style:italic;padding:8px 16px 2px;letter-spacing:.03em}

.cm-card{background:#fff;margin:8px 12px;border:1px solid #e2d4b8;border-radius:13px;padding:12px 14px;position:relative;cursor:pointer}
.cm-card:active{background:#fbf3e4}
.cm-nome{font-size:16.5px;font-weight:600;line-height:1.2;padding-right:48px}
.cm-nome em{font-style:italic;font-weight:500}
.cm-ann{color:#8a7a65;font-weight:400;font-size:14px;margin-left:5px}
.cm-meta{font-size:12px;color:#5a4634;margin-top:2px}
.cm-qtatot{position:absolute;top:12px;right:14px;text-align:right}
.cm-qtatot b{font-size:20px;font-weight:700;color:#2b2118;font-variant-numeric:tabular-nums;display:block;line-height:1}
.cm-qtatot small{font-size:10px;color:#8a7a65}
.cm-flags{margin-top:7px}
.cm-flag{display:inline-block;font-size:10px;font-style:italic;padding:2px 8px;border-radius:8px;border:1px solid #d8c8a8;margin-right:5px}
.cm-flag.cm-mescita{background:#fff8ec;color:#a04000}
.cm-flag.cm-ultima{background:#f5d7c8;color:#5b2c1a}
.cm-flag.cm-scarsa{background:#f5ead3;color:#7a5b1a}
.cm-flag.cm-magnum{background:#efe6d6;color:#5a4634}
.cm-locline{margin-top:9px;padding-top:9px;border-top:1px dashed #ece0c8;font-size:14px;line-height:1.6}
.cm-pin{color:#a04000;font-weight:700}
.cm-locbadge{display:inline-block;background:#faf1df;border:1px solid #e2d4b8;border-radius:8px;padding:2px 9px;margin:2px 5px 0 0;font-size:13px}
.cm-locbadge b{color:#a04000}
.cm-locbadge.cm-frigo{background:#eef4fb;border-color:#cfe0f0}

.cm-empty{text-align:center;padding:50px 20px;color:#8a7a65;font-style:italic;font-size:14px}
.cm-loading{text-align:center;padding:70px 20px;color:#8a7a65;font-style:italic;font-size:16px}
.cm-hint{text-align:center;font-size:12.5px;color:#8a7a65;font-style:italic;padding:12px 20px}

/* per scaffale */
.cm-shelf-head{background:#2b2118;color:#f5ead3;margin:10px 12px 0;border-radius:11px 11px 0 0;padding:11px 15px;display:flex;justify-content:space-between;align-items:baseline}
.cm-shelf-nome{font-size:16.5px;font-weight:700;letter-spacing:.02em}
.cm-shelf-n{font-size:12px;font-style:italic;opacity:.8}
.cm-shelf-body{background:#fff;margin:0 12px 6px;border:1px solid #e2d4b8;border-top:none;border-radius:0 0 11px 11px;overflow:hidden}
.cm-shelf-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 15px;border-bottom:1px solid #f2e9d6;font-size:15px;cursor:pointer}
.cm-shelf-row:last-child{border-bottom:none}
.cm-shelf-row:active{background:#fbf3e4}
.cm-shelf-row .cm-sr-sub{font-size:12px;color:#8a7a65;font-weight:400}
.cm-shelf-row .cm-sr-q{font-weight:700;color:#a04000;font-variant-numeric:tabular-nums;white-space:nowrap}

/* ---------- scheda dettaglio ---------- */
.cm-hero{background:#fff;padding:14px 16px 16px;border-bottom:1px solid #efe6d6}
.cm-tipo{display:inline-block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f10;border:1px solid #e0b9ac;background:#fbeee9;border-radius:7px;padding:2px 9px;margin-bottom:7px}
.cm-hero h2{font-size:22px;font-weight:700;line-height:1.15;margin:0}
.cm-hero h2 em{font-style:italic;font-weight:500}
.cm-hero .cm-hann{color:#8a7a65;font-weight:400;font-size:18px;margin-left:6px}
.cm-hero .cm-prod{font-size:14px;color:#5a4634;margin-top:3px;font-style:italic}
.cm-badges{margin-top:9px;display:flex;gap:6px;flex-wrap:wrap}
.cm-badge{font-size:11px;font-style:italic;padding:3px 10px;border-radius:9px;border:1px solid #d8c8a8}
.cm-badge.cm-b-carta{background:#eef4ec;color:#2e7d4f;border-color:#bfe0c8}
.cm-badge.cm-b-mescita{background:#fff8ec;color:#a04000;border-color:#eed9a8}
.cm-badge.cm-b-off{background:#f3e9d4;color:#8a7a65}

.cm-stats{display:flex;background:#faf4e8;border-bottom:1px solid #efe6d6}
.cm-stat{flex:1;text-align:center;padding:12px 6px;border-right:1px solid #efe6d6}
.cm-stat:last-child{border-right:none}
.cm-stat .cm-k{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#8a7a65}
.cm-stat .cm-v{font-size:21px;font-weight:700;color:#2b2118;font-variant-numeric:tabular-nums;line-height:1.1;margin-top:2px}
.cm-stat .cm-v small{font-size:12px;color:#8a7a65;font-weight:400}

.cm-sec{background:#fff;margin:10px 12px;border:1px solid #e2d4b8;border-radius:13px;overflow:hidden}
.cm-sec-h{display:flex;align-items:center;gap:8px;padding:11px 15px;background:#faf4e8;border-bottom:1px solid #efe6d6}
.cm-sec-h .cm-t{font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#5a4634}
.cm-sec-h .cm-r{margin-left:auto;font-size:12px;color:#8a7a65;font-style:italic}
.cm-loc{display:flex;align-items:center;gap:12px;padding:13px 15px;border-bottom:1px solid #f2e9d6}
.cm-loc:last-child{border-bottom:none}
.cm-loc .cm-ico{font-size:20px;width:26px;text-align:center}
.cm-loc .cm-lnome{flex:1;font-size:16px;font-weight:600}
.cm-loc .cm-lnome small{display:block;font-size:11.5px;color:#8a7a65;font-weight:400;font-style:italic}
.cm-loc .cm-lq{font-size:20px;font-weight:700;color:#a04000;font-variant-numeric:tabular-nums;white-space:nowrap}
.cm-loc .cm-lq small{font-size:11px;color:#8a7a65;font-weight:400}
.cm-loctot{display:flex;justify-content:space-between;padding:11px 15px;background:#f7f0e2;font-weight:700;font-size:15px}
.cm-loctot .cm-lq{color:#2b2118;font-variant-numeric:tabular-nums}
.cm-phase2{padding:9px 15px;background:#fffdf5;font-size:12px;color:#8a7a65;font-style:italic;border-top:1px dashed #ece0c8}
.cm-phase2 b{color:#5a4634}

.cm-matrice{padding:13px 15px}
.cm-matrice-lbl{font-size:13px;color:#5a4634;margin-bottom:8px}
.cm-grid{display:inline-grid;gap:4px}
.cm-cell{width:24px;height:24px;border-radius:5px;background:#f0e7d4;border:1px solid #e2d4b8}
.cm-cell.cm-cellon{background:#a04000;border-color:#7a1f10;box-shadow:inset 0 0 0 2px #fdf8f0}
.cm-matrice-cap{font-size:11.5px;color:#8a7a65;font-style:italic;margin-top:8px}

.cm-facts{display:grid;grid-template-columns:1fr 1fr}
.cm-fact{padding:10px 15px;border-bottom:1px solid #f2e9d6;border-right:1px solid #f2e9d6}
.cm-fact:nth-child(2n){border-right:none}
.cm-fact .cm-k{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#8a7a65}
.cm-fact .cm-v{font-size:15px;font-weight:600;margin-top:1px}

.cm-det details{background:#fff;margin:10px 12px;border:1px solid #e2d4b8;border-radius:13px;overflow:hidden}
.cm-det summary{list-style:none;cursor:pointer;padding:13px 15px;background:#faf4e8;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#5a4634;display:flex;align-items:center}
.cm-det summary::-webkit-details-marker{display:none}
.cm-det summary::after{content:"▸";margin-left:auto;color:#a04000;transition:transform .2s}
.cm-det details[open] summary::after{transform:rotate(90deg)}
.cm-mv{display:flex;justify-content:space-between;gap:8px;padding:10px 15px;border-bottom:1px solid #f2e9d6;font-size:14px}
.cm-mv:last-child{border-bottom:none}
.cm-mv .cm-d{color:#8a7a65;font-size:12.5px}
.cm-mv .cm-tp{font-weight:600}
.cm-mv .cm-tp.cm-tv{color:#7a1f10}
.cm-mv .cm-tp.cm-tc{color:#2e7d4f}
.cm-openfull{display:block;margin:14px 12px 6px;text-align:center;font-family:inherit;font-size:14px;background:#fff;border:1.5px solid #c5a97a;color:#5a4634;border-radius:10px;padding:12px;cursor:pointer;width:calc(100% - 24px)}
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
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ v, qta: l.qta });
    }
    // ordina: Scaffale…, poi Frigo…, poi il resto, alfabetico dentro i gruppi
    const rank = (nome) => (/^scaffale/i.test(nome) ? 0 : isFrigo(nome) ? 1 : /matrice/i.test(nome) ? 3 : 2);
    return [...map.entries()]
      .sort((a, b) => (rank(a[0]) - rank(b[0])) || a[0].localeCompare(b[0], "it"))
      .map(([nome, items]) => ({ nome, items: items.sort((x, y) => (x.v.DESCRIZIONE || "").localeCompare(y.v.DESCRIZIONE || "", "it")) }));
  }, [vini]);

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
        {!loading && error && <div className="cm-empty" style={{ color: "#a04000" }}>{error}</div>}

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
            <div className="cm-hint">Tocca uno scaffale per vedere cosa c'è — comodo quando rimetti a posto o fai il giro di controllo.</div>
            {shelves.map((s, i) => (
              <div key={i}>
                <div className="cm-shelf-head">
                  <span className="cm-shelf-nome">{s.nome}</span>
                  <span className="cm-shelf-n">{s.items.length} {s.items.length === 1 ? "etichetta" : "etichette"}</span>
                </div>
                <div className="cm-shelf-body">
                  {s.items.map(({ v, qta }, j) => (
                    <div key={j} className="cm-shelf-row" onClick={() => openScheda(v.id)}>
                      <span>
                        {v.DESCRIZIONE}
                        {v.ANNATA ? ` ${v.ANNATA}` : ""}
                        <span className="cm-sr-sub"> — {nomeProduttore(v)}</span>
                      </span>
                      <span className="cm-sr-q">{qta} bt</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCHEDA dettaglio (read-only)
// ─────────────────────────────────────────────────────────────
function Scheda({ id }) {
  const navigate = useNavigate();
  const [v, setV] = useState(null);
  const [movimenti, setMovimenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/vini/v2/bottiglie/${id}`);
        if (!r.ok) throw new Error(`Errore ${r.status}`);
        const data = await r.json();
        if (alive) setV(data);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
      try {
        const rm = await apiFetch(`${API_BASE}/vini/magazzino/${id}/movimenti?limit=8`);
        if (rm.ok) { const m = await rm.json(); if (alive) setMovimenti(Array.isArray(m) ? m : []); }
      } catch { /* movimenti opzionali */ }
    })();
    return () => { alive = false; };
  }, [id]);

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
        <div className="cm-empty" style={{ color: "#a04000" }}>{error || "Vino non trovato"}</div>
      </div>
    </div>
  );

  const st = statoVino(v);
  const locs = buildLocations(v);
  const den = nomeDenominazione(v);
  const matrice = parseMatrice(v.LOCAZIONE_3);
  const calice = (num(v.VENDITA_CALICE) || st.mescita) ? v.PREZZO_CALICE : null;
  const tipoLabel = (v.TIPOLOGIA || "").charAt(0) + (v.TIPOLOGIA || "").slice(1).toLowerCase();

  const fmtDataMov = (s) => {
    if (!s) return "";
    const iso = String(s).replace(" ", "T");
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(s).slice(0, 16).replace("T", " ");
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) + " " +
      d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  };
  const tpCls = (tp) => tp === "VENDITA" || tp === "SCARICO" ? "cm-tv" : tp === "CARICO" ? "cm-tc" : "";

  return (
    <div className="cm-root cm-det">
      <style>{STYLE}</style>
      <div className="cm-wrap">
        <div className="cm-top">
          <div className="cm-top-row">
            <button className="cm-back" onClick={() => navigate("/vini/cantina-mobile")}>‹</button>
            <div><div className="cm-sub">Cantina · scheda</div></div>
            <span className="cm-live" style={{ color: "#8a7a65", fontStyle: "normal", fontWeight: 700 }}>#{v.id}</span>
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
          {locs.map((l, i) => (
            <div key={i} className="cm-loc">
              <span className="cm-ico">{isFrigo(l.nome) ? "🧊" : l.slot === "loc3" ? "🔳" : "🍷"}</span>
              <span className="cm-lnome">
                {l.slot === "loc3" ? "Scaffale a matrice" : l.nome}
                <small>{isFrigo(l.nome) ? "pronto al servizio" : l.slot === "loc3" ? "posizione a griglia" : "scorta"}</small>
              </span>
              <span className="cm-lq">{l.qta}<small> bt</small></span>
            </div>
          ))}
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

          <div className="cm-phase2">Funzione 2 (in arrivo): qui comparirà un <b>−/+</b> per correggere la giacenza di ogni posto, senza aprire il gestionale.</div>
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
            <div className="cm-fact"><div className="cm-k">Denominazione</div><div className="cm-v" style={{ fontSize: 13 }}>{den || "—"}</div></div>
          </div>
          {v.NOTE && (
            <div style={{ padding: "10px 15px", borderTop: "1px solid #f2e9d6" }}>
              <div className="cm-k" style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "#8a7a65" }}>Note interne</div>
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap", marginTop: 2 }}>{v.NOTE}</div>
            </div>
          )}
        </div>

        {/* MOVIMENTI (collassato) */}
        <details>
          <summary>Movimenti recenti{movimenti.length ? ` (${movimenti.length})` : ""}</summary>
          {movimenti.length === 0
            ? <div className="cm-phase2" style={{ borderTop: "none" }}>Nessun movimento registrato.</div>
            : movimenti.map((m, i) => (
              <div key={i} className="cm-mv">
                <span><span className="cm-d">{fmtDataMov(m.data_mov)}</span> · <span className={`cm-tp ${tpCls(m.tipo)}`}>{(m.tipo || "").toLowerCase()}</span></span>
                <span>{m.tipo === "RETTIFICA" ? `→ ${m.qta}` : `${m.tipo === "CARICO" ? "+" : "−"}${m.qta}`}{m.locazione ? ` · ${m.locazione}` : ""}</span>
              </div>
            ))}
        </details>

        {/* Link alla scheda gestionale completa (desktop) */}
        <button className="cm-openfull" onClick={() => navigate(`/vini/v2/bottiglia/${v.id}`)}>
          Apri la scheda gestionale completa →
        </button>
      </div>
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
