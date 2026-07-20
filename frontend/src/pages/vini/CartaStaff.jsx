// frontend/src/pages/vini/CartaStaff.jsx
// Modulo: vini
// @version: v2.0 — "banco di servizio" (2026-07-20)
//
// Ripensamento completo della vista sommelier (Marco: "rivediamone il senso,
// così è inutilizzata"). Da elenco read-only a pagina OPERATIVA con due
// momenti d'uso:
//
//   · PREPARAZIONE (pre-servizio): checklist calcolata client-side dagli
//     stessi dati — vini in carta ma esauriti/ultima bottiglia da non
//     proporre al tavolo, calici in mescita stasera, frigo da rifornire
//     (scorta frigo bassa con stock disponibile altrove).
//   · SERVIZIO: ricerca + riga vino con locazione in evidenza ("prendi da")
//     e azioni one-tap: Vendi −1 (registra movimento VENDITA dalla
//     locazione scelta, annullabile per 10s) e toggle mescita 🥂.
//
// Endpoint usati (tutti esistenti):
//   GET    /vini/magazzino/carta-staff/            lista (v3.72: locazioni con `slot`)
//   POST   /vini/magazzino/{id}/movimenti          VENDITA qta=1 locazione=slot
//   DELETE /vini/magazzino/movimenti/{mov_id}      undo vendita (delta inverso)
//   PATCH  /vini/magazzino/{id}/bottiglia-aperta   toggle mescita (admin/sommelier/sala)
//
// Nota loc3/matrice: la vendita one-tap da loc3 è volutamente ESCLUSA
// (decrementerebbe QTA_LOC3 senza svuotare le celle di matrice_celle →
// drift). Se lo stock è solo in matrice il bottone porta alla scheda
// bottiglia (/vini/v2/bottiglia/:id), dove c'è il MatricePicker.
//
// Stile osteria (Cormorant Garamond, palette beige/marrone/terracotta),
// coerente con CartaClienti.jsx. Auto-refresh 60s (in pausa mentre il
// toast-undo è visibile, per non far sparire l'annulla sotto le dita).

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ViniNav from "./ViniNav";
import { t } from "../../utils/localeStrings";  // R5: helper stringhe locale-aware

// ─────────────────────────────────────────────────────────────
// Costanti operative
// ─────────────────────────────────────────────────────────────
const UNDO_MS = 10_000;          // finestra annulla vendita
const REFRESH_MS = 60_000;       // auto-refresh dati
const SOGLIA_FRIGO = 2;          // "frigo da rifornire" se qta frigo <= soglia
const SOGLIA_ULTIMA = 1;         // "ultima bottiglia"

// ─────────────────────────────────────────────────────────────
// CSS (token osteria — coerente con CartaClienti.jsx)
// ─────────────────────────────────────────────────────────────
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&display=swap');

.cs-root {
  font-family: "Cormorant Garamond", "Times New Roman", serif;
  background: #fdf8f0;
  color: #2b2118;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.cs-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 14px 16px 90px;
  box-sizing: border-box;
}

/* ---------- header ---------- */
.cs-header {
  background: #ffffff;
  border: 1px solid #c5a97a;
  border-radius: 6px;
  padding: 12px 18px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.cs-header-title { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; margin: 0; }
.cs-header-sub {
  font-size: 11px; color: #5a4634; letter-spacing: 0.18em;
  text-transform: uppercase; margin-top: 1px;
}
.cs-live { font-size: 11px; color: #2e7d4f; font-style: italic; white-space: nowrap; }
.cs-live-dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  background: #2e7d4f; margin-right: 5px; animation: cs-pulse 2s infinite;
}
@keyframes cs-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

/* ---------- switch modalità ---------- */
.cs-mode {
  display: flex; gap: 6px; background: #efe6d6; border-radius: 10px; padding: 4px;
}
.cs-mode button {
  font-family: inherit; font-size: 14px; cursor: pointer;
  border: none; background: transparent; color: #5a4634;
  padding: 8px 16px; border-radius: 8px; min-height: 40px; font-weight: 600;
}
.cs-mode button.active { background: #2b2118; color: #f5ead3; }
.cs-mode .cs-mode-count {
  display: inline-block; min-width: 18px; margin-left: 6px; font-size: 11px;
  background: #a04000; color: #fff; border-radius: 9px; padding: 1px 6px;
  font-style: normal; vertical-align: 1px;
}

/* ---------- toolbar servizio ---------- */
.cs-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.cs-search {
  flex: 1; min-width: 220px; font-family: inherit; font-size: 17px;
  padding: 10px 16px; border: 1.5px solid #c5a97a; border-radius: 8px;
  background: #fff; color: #2b2118; box-sizing: border-box;
}
.cs-search::placeholder { font-style: italic; color: #b5a488; }
.cs-chip {
  font-family: inherit; font-size: 13px; cursor: pointer;
  padding: 7px 14px; border-radius: 16px; min-height: 36px;
  border: 1px solid #c5a97a; background: #fff; color: #5a4634;
  white-space: nowrap;
}
.cs-chip-active { background: #2b2118; color: #f5ead3; border-color: #2b2118; }

/* ---------- tabella servizio ---------- */
.cs-table-wrap {
  background: #ffffff; border: 1px solid #c5a97a; border-radius: 6px; overflow: hidden;
}
.cs-section-title {
  font-size: 11.5px; letter-spacing: 0.2em; text-transform: uppercase;
  color: #8a7a65; padding: 12px 16px 5px; font-weight: 600;
  background: #faf4e8; border-bottom: 1px solid #efe6d6;
}
.cs-row {
  padding: 11px 16px; border-bottom: 1px solid #efe6d6;
  display: grid; grid-template-columns: 1fr 110px 190px; gap: 6px 12px;
  align-items: start; transition: background .4s;
}
.cs-row-flash { background: #e9f5ec; }
.cs-row-vino-nome { font-size: 16.5px; font-weight: 600; line-height: 1.25; cursor: pointer; }
.cs-row-vino-nome em { font-style: italic; font-weight: 500; }
.cs-row-vino-annata { font-weight: 400; color: #8a7a65; margin-left: 6px; font-size: 14px; }
.cs-row-vino-meta { font-size: 12px; color: #5a4634; margin-top: 1px; }
.cs-row-loc { font-size: 13.5px; line-height: 1.45; grid-column: 1 / -1; margin-top: 2px; }
.cs-row-loc b { font-weight: 700; color: #a04000; }
.cs-row-loc .cs-loc-qta { color: #8a7a65; }
.cs-row-loc-empty { color: #c5a97a; font-style: italic; }
.cs-row-prezzi { text-align: right; font-size: 13px; color: #5a4634; font-variant-numeric: tabular-nums; }
.cs-row-prezzo-bot { font-weight: 700; font-size: 15px; color: #2b2118; }
.cs-row-prezzo-cal { font-size: 12px; font-style: italic; }
.cs-row-prezzo-cal::before { content: "🥂 "; font-style: normal; }
.cs-azioni { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }

.cs-btn {
  font-family: inherit; cursor: pointer; border-radius: 8px; font-size: 14px;
  padding: 8px 12px; border: 1.5px solid #c5a97a; background: #fff; color: #2b2118;
  min-height: 44px; min-width: 52px; font-weight: 600;
}
.cs-btn:active { transform: scale(.96); }
.cs-btn:disabled { opacity: .35; cursor: default; transform: none; }
.cs-btn-vendi { background: #5b2c1a; border-color: #5b2c1a; color: #f5ead3; min-width: 88px; }
.cs-btn-mescita { font-size: 17px; }
.cs-btn-mescita.cs-on { background: #fff3da; border-color: #a04000; }
.cs-btn-loc {
  display: block; width: 100%; text-align: left; margin-top: 5px;
  background: #faf4e8; font-weight: 500; font-size: 13.5px;
}

/* picker locazione inline */
.cs-locpicker {
  grid-column: 1 / -1; background: #fdf8f0; border: 1px dashed #c5a97a;
  border-radius: 8px; padding: 8px 12px; margin-top: 6px; font-size: 13px; color: #5a4634;
}

.cs-badge {
  display: inline-block; font-size: 10px; padding: 2px 8px;
  border: 1px solid #d8c8a8; border-radius: 8px; font-style: italic;
  letter-spacing: 0.04em; white-space: nowrap; margin-left: 8px; vertical-align: 2px;
}
.cs-badge-mescita { background: #fff8ec; color: #a04000; }
.cs-badge-scarsa { background: #f5d7c8; color: #5b2c1a; border-color: #c5a97a; }
.cs-badge-esaurita { background: #f3e9d4; color: #8a7a65; }

.cs-empty { text-align: center; padding: 60px 20px; color: #8a7a65; font-style: italic; font-size: 14px; }
.cs-loading { text-align: center; padding: 80px 20px; color: #8a7a65; font-style: italic; font-size: 16px; }
.cs-footer-note {
  text-align: center; padding: 10px 14px; background: #f3e9d4;
  border-top: 1px solid #c5a97a; font-size: 11px; color: #5a4634; font-style: italic;
}

/* ---------- preparazione ---------- */
.cs-prep-card {
  background: #fff; border: 1px solid #c5a97a; border-radius: 6px;
  margin-bottom: 12px; overflow: hidden;
}
.cs-prep-head {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px;
  background: #faf4e8; border-bottom: 1px solid #efe6d6;
}
.cs-prep-ico { font-size: 21px; }
.cs-prep-title { flex: 1; }
.cs-prep-t1 { font-size: 16.5px; font-weight: 700; }
.cs-prep-t2 { font-size: 12.5px; color: #5a4634; font-style: italic; }
.cs-prep-stato {
  font-size: 12px; font-style: italic; padding: 3px 12px; border-radius: 10px; white-space: nowrap;
}
.cs-st-ok { background: #e9f5ec; color: #2e7d4f; border: 1px solid #bfe0c8; }
.cs-st-warn { background: #fff3da; color: #a04000; border: 1px solid #eed9a8; }
.cs-st-alert { background: #f5d7c8; color: #5b2c1a; border: 1px solid #d8b39a; }
.cs-prep-riga {
  display: flex; gap: 10px; align-items: center; justify-content: space-between;
  padding: 9px 16px; border-bottom: 1px solid #f5efe2; font-size: 14px;
}
.cs-prep-riga:last-child { border-bottom: none; }
.cs-prep-nome { cursor: pointer; }
.cs-prep-nome:hover { text-decoration: underline; }
.cs-prep-dett { font-size: 12.5px; color: #8a7a65; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cs-prep-dett b { color: #a04000; }
.cs-prep-empty { padding: 12px 16px; font-size: 13px; color: #8a7a65; font-style: italic; }

/* ---------- toast undo ---------- */
.cs-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: #2b2118; color: #f5ead3; font-size: 15px; padding: 12px 20px;
  border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,.35);
  display: flex; gap: 14px; align-items: center; z-index: 60; max-width: 92vw;
}
.cs-toast-err { background: #7a1f10; }
.cs-toast button {
  font-family: inherit; background: none; border: 1px solid #c5a97a; color: #f0c987;
  border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 14px; min-height: 36px;
}

/* ---------- responsive ---------- */
@media (max-width: 820px) {
  .cs-row { grid-template-columns: 1fr 96px 150px; gap: 6px 8px; padding: 10px 12px; }
}
@media (max-width: 600px) {
  .cs-row { grid-template-columns: 1fr; }
  .cs-row-prezzi { text-align: left; display: flex; gap: 12px; align-items: baseline; }
  .cs-azioni { justify-content: flex-start; }
}
`;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function fmtPrezzo(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function matchSearch(testo, query) {
  if (!query) return true;
  return (testo || "").toLowerCase().includes(query.toLowerCase().trim());
}
/** Locazioni da cui è possibile la vendita one-tap (loc3 = matrice esclusa). */
function locVendibili(v) {
  return (v.locazioni || []).filter(l => l.qta > 0 && l.slot && l.slot !== "loc3");
}
function locMatrice(v) {
  return (v.locazioni || []).find(l => l.slot === "loc3" && l.qta > 0) || null;
}
const STATUS_CFG = {
  in_mescita: { label: "in mescita", cls: "cs-badge-mescita" },
  scarsa:     { label: "scarsa",     cls: "cs-badge-scarsa" },
  in_carta:   { label: "in carta",   cls: "" },
  esaurita:   { label: "esaurita",   cls: "cs-badge-esaurita" },
};

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────
export default function CartaStaff() {
  const navigate = useNavigate();
  const [vini, setVini] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("servizio");   // "prep" | "servizio"
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("tutti");
  const [pickerId, setPickerId] = useState(null); // riga con scelta locazione aperta
  const [busyId, setBusyId] = useState(null);     // riga con chiamata in corso
  const [flashId, setFlashId] = useState(null);   // feedback visivo post-vendita
  const [toast, setToast] = useState(null);       // {msg, movId?, err?}
  const toastTid = useRef(null);
  const toastVisible = useRef(false);
  toastVisible.current = !!toast;

  const fetchVini = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/carta-staff/`);
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      setVini(await r.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // R5: title letto da locali/<locale>/strings.json (key: page.title_carta_staff)
    document.title = t("page.title_carta_staff", "Vista sommelier · Tre Gobbi");
    fetchVini();
    const tid = setInterval(() => {
      // Non refetchare mentre il toast-undo è visibile: un refresh sotto
      // le dita mentre stai per premere "Annulla" è il peggio in servizio.
      if (!toastVisible.current) fetchVini();
    }, REFRESH_MS);
    return () => clearInterval(tid);
  }, [fetchVini]);

  function showToast(next) {
    clearTimeout(toastTid.current);
    setToast(next);
    toastTid.current = setTimeout(() => setToast(null), next.err ? 6000 : UNDO_MS);
  }

  // ── Azioni ────────────────────────────────────────────────
  async function vendi(vino, loc) {
    if (busyId) return;
    setPickerId(null);
    setBusyId(vino.id);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vino.id}/movimenti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "VENDITA",
          qta: 1,
          locazione: loc.slot,
          origine: "CARTA-STAFF",
          note: `Vendita dal banco sommelier (${loc.nome})`,
        }),
      });
      if (!r.ok) {
        let detail = `Errore ${r.status}`;
        try { detail = (await r.json()).detail || detail; } catch { /* noop */ }
        throw new Error(detail);
      }
      const data = await r.json();
      const mov = (data.movimenti || []).find(m => m.tipo === "VENDITA");
      setFlashId(vino.id);
      setTimeout(() => setFlashId(null), 800);
      showToast({
        msg: `−1 bt · ${vino.descrizione || vino.produttore} (da ${loc.nome})`,
        movId: mov ? mov.id : null,
      });
      await fetchVini();
    } catch (e) {
      showToast({ msg: `Vendita non registrata: ${e.message}`, err: true });
    } finally {
      setBusyId(null);
    }
  }

  async function annullaVendita() {
    const movId = toast && toast.movId;
    clearTimeout(toastTid.current);
    setToast(null);
    if (!movId) return;
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/movimenti/${movId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      await fetchVini();
    } catch (e) {
      showToast({ msg: `Annulla non riuscito: ${e.message}`, err: true });
    }
  }

  async function toggleMescita(vino) {
    if (busyId) return;
    setBusyId(vino.id);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vino.id}/bottiglia-aperta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ BOTTIGLIA_APERTA: vino.in_mescita ? 0 : 1 }),
      });
      if (!r.ok) {
        let detail = `Errore ${r.status}`;
        try { detail = (await r.json()).detail || detail; } catch { /* noop */ }
        throw new Error(detail);
      }
      await fetchVini();
    } catch (e) {
      showToast({ msg: `Mescita non aggiornata: ${e.message}`, err: true });
    } finally {
      setBusyId(null);
    }
  }

  // Click sul bottone Vendi: 1 locazione → vendita diretta; più di una → picker.
  function onVendiClick(vino) {
    const locs = locVendibili(vino);
    if (locs.length === 1) vendi(vino, locs[0]);
    else if (locs.length > 1) setPickerId(pickerId === vino.id ? null : vino.id);
    // 0 vendibili: bottone disabilitato (o "Scheda →" se c'è matrice)
  }

  // ── Dati derivati ─────────────────────────────────────────
  const tipologie = useMemo(() => {
    const set = new Set(vini.map(v => v.tipologia).filter(Boolean));
    return Array.from(set);
  }, [vini]);

  const viniFiltered = useMemo(() => {
    return vini.filter(v => {
      if (filtro === "in_mescita" && !v.in_mescita) return false;
      if (filtro === "calici" && !v.vendita_calice && !v.in_mescita) return false;
      if (filtro === "scarsa" && v.status !== "scarsa" && v.status !== "esaurita") return false;
      if (filtro !== "tutti" && filtro !== "in_mescita" && filtro !== "calici" && filtro !== "scarsa") {
        if (v.tipologia !== filtro) return false;
      }
      if (search) {
        const blob = `${v.codice ?? ""} ${v.descrizione ?? ""} ${v.produttore ?? ""} ${v.regione ?? ""} ${v.tipologia ?? ""} ${v.annata ?? ""} ${v.vitigni ?? ""}`;
        if (!matchSearch(blob, search)) return false;
      }
      return true;
    });
  }, [vini, search, filtro]);

  // Raggruppamento per "Tipologia · Nazione · Regione"
  const sezioni = useMemo(() => {
    const map = new Map();
    const order = [];
    for (const v of viniFiltered) {
      const key = `${v.tipologia || "—"}|${v.nazione || "—"}|${v.regione || "—"}`;
      if (!map.has(key)) {
        map.set(key, { tipologia: v.tipologia || "—", nazione: v.nazione || "—", regione: v.regione || "—", vini: [] });
        order.push(key);
      }
      map.get(key).vini.push(v);
    }
    return order.map(k => map.get(k));
  }, [viniFiltered]);

  const counts = useMemo(() => ({
    tutti: vini.length,
    in_mescita: vini.filter(v => v.in_mescita).length,
    calici: vini.filter(v => v.vendita_calice || v.in_mescita).length,
    scarsa: vini.filter(v => v.status === "scarsa" || v.status === "esaurita").length,
  }), [vini]);

  // ── Checklist pre-servizio (tutta client-side sugli stessi dati) ──
  const prep = useMemo(() => {
    // 1. In carta ma da non proporre: esauriti o ultima bottiglia
    const nonProporre = vini
      .filter(v => v.qta_totale <= SOGLIA_ULTIMA)
      .sort((a, b) => a.qta_totale - b.qta_totale);
    // 2. Calici in mescita stasera
    const calici = vini.filter(v => v.in_mescita);
    // 3. Frigo da rifornire: vino da calice/mescita con frigo sotto soglia
    //    e stock disponibile in un'altra locazione da cui attingere.
    const frigo = vini
      .map(v => {
        const fr = (v.locazioni || []).find(l => l.slot === "frigo");
        const qFrigo = fr ? fr.qta : 0;
        const altre = (v.locazioni || []).filter(l => l.slot !== "frigo" && l.qta > 0);
        return { v, qFrigo, altre };
      })
      .filter(x =>
        (x.v.in_mescita || x.v.vendita_calice) &&
        x.qFrigo <= SOGLIA_FRIGO &&
        x.altre.length > 0
      )
      .sort((a, b) => a.qFrigo - b.qFrigo);
    return { nonProporre, calici, frigo };
  }, [vini]);

  const prepCount = prep.nonProporre.length + prep.frigo.length;

  // ── Render ────────────────────────────────────────────────
  const apriScheda = (id) => navigate(`/vini/v2/bottiglia/${id}`);

  function renderAzioni(v) {
    const locs = locVendibili(v);
    const matrice = locMatrice(v);
    const soloMatrice = locs.length === 0 && !!matrice;
    return (
      <div className="cs-azioni">
        <button
          type="button"
          className={`cs-btn cs-btn-mescita ${v.in_mescita ? "cs-on" : ""}`}
          title={v.in_mescita ? "Chiudi mescita" : "Apri in mescita"}
          disabled={busyId === v.id}
          onClick={() => toggleMescita(v)}
        >🥂</button>
        {soloMatrice ? (
          <button
            type="button"
            className="cs-btn"
            title="Stock solo in matrice: vendita dalla scheda (scelta celle)"
            onClick={() => apriScheda(v.id)}
          >Scheda →</button>
        ) : (
          <button
            type="button"
            className="cs-btn cs-btn-vendi"
            disabled={busyId === v.id || locs.length === 0}
            onClick={() => onVendiClick(v)}
          >{busyId === v.id ? "…" : "Vendi −1"}</button>
        )}
      </div>
    );
  }

  function renderRiga(v) {
    const sCfg = STATUS_CFG[v.status] || STATUS_CFG.in_carta;
    const locs = locVendibili(v);
    const matrice = locMatrice(v);
    return (
      <div key={v.id} className={`cs-row ${flashId === v.id ? "cs-row-flash" : ""}`}>
        <div>
          <div className="cs-row-vino-nome" onClick={() => apriScheda(v.id)} title="Apri scheda bottiglia">
            {v.denominazione && <em>{v.denominazione}</em>}
            {v.denominazione && v.descrizione ? " · " : ""}
            {v.descrizione}
            {v.annata && <span className="cs-row-vino-annata">{v.annata}</span>}
            {sCfg.label !== "in carta" && <span className={`cs-badge ${sCfg.cls}`}>{sCfg.label}</span>}
            {v.qta_totale === SOGLIA_ULTIMA && <span className="cs-badge cs-badge-scarsa">ultima bt</span>}
          </div>
          <div className="cs-row-vino-meta">
            {[v.produttore, v.vitigni, v.grado_alcolico ? `${Number(v.grado_alcolico).toFixed(1)}%` : null]
              .filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="cs-row-prezzi">
          <div className="cs-row-prezzo-bot">{v.prezzo_carta != null ? `${fmtPrezzo(v.prezzo_carta)} €` : "—"}</div>
          {v.prezzo_calice != null && <div className="cs-row-prezzo-cal">{fmtPrezzo(v.prezzo_calice)} €</div>}
        </div>
        {renderAzioni(v)}
        <div className="cs-row-loc">
          {v.locazioni && v.locazioni.length > 0 ? (
            <>
              📍 prendi da: {v.locazioni.map((l, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {i === 0 ? <b>{l.nome}</b> : l.nome}
                  {" "}<span className="cs-loc-qta">({l.qta}{l.slot === "loc3" ? " in matrice" : ""})</span>
                </span>
              ))}
            </>
          ) : v.in_mescita ? (
            <span className="cs-row-loc-empty">solo la bottiglia aperta in mescita</span>
          ) : (
            <span className="cs-row-loc-empty">nessuna locazione con stock</span>
          )}
        </div>
        {pickerId === v.id && locs.length > 1 && (
          <div className="cs-locpicker">
            da quale locazione?
            {locs.map((l, i) => (
              <button key={i} type="button" className="cs-btn cs-btn-loc" onClick={() => vendi(v, l)}>
                −1 da {l.nome} <span className="cs-loc-qta">({l.qta} bt)</span>
              </button>
            ))}
            {matrice && (
              <button type="button" className="cs-btn cs-btn-loc" onClick={() => apriScheda(v.id)}>
                da {matrice.nome} (matrice) → scheda
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderPrep() {
    const { nonProporre, calici, frigo } = prep;
    return (
      <>
        {/* 1 — da non proporre */}
        <div className="cs-prep-card">
          <div className="cs-prep-head">
            <span className="cs-prep-ico">⚠️</span>
            <div className="cs-prep-title">
              <div className="cs-prep-t1">In carta ma da non proporre</div>
              <div className="cs-prep-t2">esauriti o ultima bottiglia — meglio saperlo prima del tavolo</div>
            </div>
            <span className={`cs-prep-stato ${nonProporre.length ? "cs-st-alert" : "cs-st-ok"}`}>
              {nonProporre.length ? `${nonProporre.length} vini` : "tutto ok"}
            </span>
          </div>
          {nonProporre.length === 0 && <div className="cs-prep-empty">Nessun vino in carta sotto scorta.</div>}
          {nonProporre.map(v => (
            <div key={v.id} className="cs-prep-riga">
              <span className="cs-prep-nome" onClick={() => apriScheda(v.id)}>
                {v.descrizione} {v.annata || ""} <span style={{ color: "#8a7a65" }}>— {v.produttore}</span>
              </span>
              <span className="cs-prep-dett">
                {v.qta_totale === 0
                  ? (v.in_mescita ? <><b>0 bt</b> · resta solo la mescita</> : <><b>0 bt</b></>)
                  : <><b>1 bt</b> · ultima</>}
              </span>
            </div>
          ))}
        </div>

        {/* 2 — calici di stasera */}
        <div className="cs-prep-card">
          <div className="cs-prep-head">
            <span className="cs-prep-ico">🥂</span>
            <div className="cs-prep-title">
              <div className="cs-prep-t1">Calici di stasera</div>
              <div className="cs-prep-t2">bottiglie aperte in mescita — chiudi da qui quelle finite</div>
            </div>
            <span className={`cs-prep-stato ${calici.length ? "cs-st-ok" : "cs-st-warn"}`}>
              {calici.length ? `${calici.length} aperte` : "nessuna aperta"}
            </span>
          </div>
          {calici.length === 0 && <div className="cs-prep-empty">Nessuna bottiglia in mescita: aprile dalla modalità Servizio (bottone 🥂).</div>}
          {calici.map(v => (
            <div key={v.id} className="cs-prep-riga">
              <span className="cs-prep-nome" onClick={() => apriScheda(v.id)}>
                {v.descrizione} {v.annata || ""} <span style={{ color: "#8a7a65" }}>— {v.produttore}</span>
              </span>
              <span className="cs-prep-dett">
                {v.prezzo_calice != null && <>🥂 {fmtPrezzo(v.prezzo_calice)} € · </>}
                <button
                  type="button" className="cs-btn" style={{ minHeight: 34, padding: "4px 10px", fontSize: 12 }}
                  disabled={busyId === v.id}
                  onClick={() => toggleMescita(v)}
                >chiudi</button>
              </span>
            </div>
          ))}
        </div>

        {/* 3 — frigo da rifornire */}
        <div className="cs-prep-card">
          <div className="cs-prep-head">
            <span className="cs-prep-ico">🧊</span>
            <div className="cs-prep-title">
              <div className="cs-prep-t1">Frigo da rifornire</div>
              <div className="cs-prep-t2">vini da calice/mescita con scorta frigo ≤ {SOGLIA_FRIGO} e stock altrove</div>
            </div>
            <span className={`cs-prep-stato ${frigo.length ? "cs-st-warn" : "cs-st-ok"}`}>
              {frigo.length ? `${frigo.length} da fare` : "tutto ok"}
            </span>
          </div>
          {frigo.length === 0 && <div className="cs-prep-empty">Frigo a posto per i vini in mescita/calice.</div>}
          {frigo.map(({ v, qFrigo, altre }) => (
            <div key={v.id} className="cs-prep-riga">
              <span className="cs-prep-nome" onClick={() => apriScheda(v.id)}>
                {v.descrizione} {v.annata || ""} <span style={{ color: "#8a7a65" }}>— {v.produttore}</span>
              </span>
              <span className="cs-prep-dett">
                frigo <b>{qFrigo}</b> · prendi da {altre[0].nome} ({altre[0].qta} bt)
              </span>
            </div>
          ))}
        </div>

        <div className="cs-footer-note" style={{ border: "1px solid #c5a97a", borderRadius: 6 }}>
          Checklist calcolata sui dati live della cantina · pronta? passa alla modalità Servizio ↑
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLE}</style>
      <div className="cs-root">
        <ViniNav current="carta-staff" />
        <div className="cs-container">

          {/* Header */}
          <div className="cs-header">
            <div style={{ flex: 1, minWidth: 180 }}>
              <h1 className="cs-header-title">Vista sommelier</h1>
              <div className="cs-header-sub">{mode === "prep" ? "preparazione turno" : "banco di servizio"}</div>
            </div>
            <div className="cs-mode">
              <button type="button" className={mode === "prep" ? "active" : ""} onClick={() => setMode("prep")}>
                Preparazione
                {prepCount > 0 && <span className="cs-mode-count">{prepCount}</span>}
              </button>
              <button type="button" className={mode === "servizio" ? "active" : ""} onClick={() => setMode("servizio")}>
                Servizio
              </button>
            </div>
            <span className="cs-live"><span className="cs-live-dot"></span>live</span>
          </div>

          {loading && <div className="cs-loading">Caricamento…</div>}
          {!loading && error && <div className="cs-empty" style={{ color: "#a04000" }}>{error}</div>}

          {!loading && !error && mode === "prep" && renderPrep()}

          {!loading && !error && mode === "servizio" && (
            <>
              {/* Toolbar */}
              <div className="cs-toolbar">
                <input
                  type="text"
                  className="cs-search"
                  placeholder="cerca vino, produttore, regione, codice…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <button type="button" className={`cs-chip ${filtro === "tutti" ? "cs-chip-active" : ""}`}
                  onClick={() => setFiltro("tutti")}>Tutti {counts.tutti}</button>
                <button type="button" className={`cs-chip ${filtro === "in_mescita" ? "cs-chip-active" : ""}`}
                  onClick={() => setFiltro("in_mescita")}>🥂 In mescita {counts.in_mescita}</button>
                <button type="button" className={`cs-chip ${filtro === "calici" ? "cs-chip-active" : ""}`}
                  onClick={() => setFiltro("calici")}>Calici {counts.calici}</button>
                <button type="button" className={`cs-chip ${filtro === "scarsa" ? "cs-chip-active" : ""}`}
                  onClick={() => setFiltro("scarsa")}>Scarsa giacenza {counts.scarsa}</button>
                {tipologie.map(tip => (
                  <button key={tip} type="button"
                    className={`cs-chip ${filtro === tip ? "cs-chip-active" : ""}`}
                    onClick={() => setFiltro(tip)}>
                    {tip.charAt(0) + tip.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>

              {/* Tabella */}
              <div className="cs-table-wrap">
                {viniFiltered.length === 0 && <div className="cs-empty">Nessun vino corrisponde ai filtri.</div>}
                {sezioni.map((sez, idx) => (
                  <div key={`${sez.tipologia}-${sez.nazione}-${sez.regione}-${idx}`}>
                    <div className="cs-section-title">{sez.tipologia} · {sez.nazione} · {sez.regione}</div>
                    {sez.vini.map(renderRiga)}
                  </div>
                ))}
                {viniFiltered.length > 0 && (
                  <div className="cs-footer-note">
                    {viniFiltered.length} vin{viniFiltered.length === 1 ? "o" : "i"} ·
                    {" "}Vendi −1 registra un movimento VENDITA (annullabile {UNDO_MS / 1000}s) · nome vino → scheda
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Toast vendita / errore */}
      {toast && (
        <div className={`cs-toast ${toast.err ? "cs-toast-err" : ""}`}>
          <span>{toast.msg}</span>
          {toast.movId
            ? <button type="button" onClick={annullaVendita}>Annulla</button>
            : <button type="button" onClick={() => { clearTimeout(toastTid.current); setToast(null); }}>Ok</button>}
        </div>
      )}
    </>
  );
}
