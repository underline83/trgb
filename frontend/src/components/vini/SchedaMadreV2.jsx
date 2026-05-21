// src/components/vini/SchedaMadreV2.jsx
// Modulo: vini (V.6+V.7+V.8 — Modulo Gestione Vino 2)
//
// Scheda completa del Vino Madre: stile fedele a SchedaVino classica
// (header gradient tipologia + 3 KPI + TabBar). Read-only.
//
// Tab:
//   - Anagrafica: campi madre (tipologia/denominazione/produttore/distributore/etc.)
//                 + grado alcolico medio + riassunto locazioni per annata + lista annate
//   - Prezzi:     analisi prezzi delle annate (carta/listino/calice) + storico cumulativo
//   - Movimenti:  aggregato di TUTTE le bottiglie collegate, con colonna Annata
//   - Statistiche: KPI aggregati (vendite totali, ricavo, ritmo, prima/ultima vendita)
//   - Note:       note_madre
//
// Backend: 3 endpoint v2 nuovi (movimenti / stats / prezzi-storico) + dati madre
// passati come prop (già in memoria da groupByMadre in CantinaV2).

import React, { useEffect, useState, useMemo } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { STATO_VENDITA } from "../../config/viniConstants";
import { isAdminRole } from "../../utils/authHelpers";
import { MadreEditModal } from "./MadreEditModal";

// ─────────────────────────────────────────────
// Stile coordinato a SchedaVino classica (riga 57-66)
// ─────────────────────────────────────────────
const TIPOLOGIA_HEADER = {
  ROSSI:     { bg: "bg-gradient-to-b from-red-50 to-white",    border: "border-red-200",    accent: "border-l-red-600",    badge: "bg-red-100 text-red-800 border-red-200",       text: "text-red-900" },
  BIANCHI:   { bg: "bg-gradient-to-b from-amber-50 to-white",  border: "border-amber-200",  accent: "border-l-amber-600",  badge: "bg-amber-100 text-amber-800 border-amber-200", text: "text-amber-900" },
  BOLLICINE: { bg: "bg-gradient-to-b from-yellow-50 to-white", border: "border-yellow-200", accent: "border-l-yellow-600", badge: "bg-yellow-100 text-yellow-800 border-yellow-200", text: "text-yellow-900" },
  ROSATI:    { bg: "bg-gradient-to-b from-pink-50 to-white",   border: "border-pink-200",   accent: "border-l-pink-600",   badge: "bg-pink-100 text-pink-800 border-pink-200",   text: "text-pink-900" },
  "PASSITI E VINI DA MEDITAZIONE": { bg: "bg-gradient-to-b from-orange-50 to-white", border: "border-orange-200", accent: "border-l-orange-600", badge: "bg-orange-100 text-orange-800 border-orange-200", text: "text-orange-900" },
  "GRANDI FORMATI": { bg: "bg-gradient-to-b from-purple-50 to-white", border: "border-purple-200", accent: "border-l-purple-600", badge: "bg-purple-100 text-purple-800 border-purple-200", text: "text-purple-900" },
  "VINI ANALCOLICI": { bg: "bg-gradient-to-b from-teal-50 to-white", border: "border-teal-200", accent: "border-l-teal-600", badge: "bg-teal-100 text-teal-800 border-teal-200", text: "text-teal-900" },
  ERRORE: { bg: "bg-gradient-to-b from-gray-50 to-white", border: "border-gray-200", accent: "border-l-gray-600", badge: "bg-gray-100 text-gray-700 border-gray-200", text: "text-gray-900" },
};
function getHeaderColors(t) {
  if (!t) return TIPOLOGIA_HEADER.ERRORE;
  const k = String(t).toUpperCase();
  for (const [key, val] of Object.entries(TIPOLOGIA_HEADER)) if (k.includes(key)) return val;
  return TIPOLOGIA_HEADER.ERRORE;
}

const TABS = [
  { key: "anagrafica", label: "Anagrafica" },
  { key: "prezzi",     label: "Prezzi" },
  { key: "movimenti",  label: "Movimenti" },
  { key: "stats",      label: "Statistiche" },
  { key: "note",       label: "Note" },
];

function fmtEuro(v) {
  if (v == null || v === "" || Number(v) === 0) return "—";
  return `€ ${Number(v).toLocaleString("it-IT", { minimumFractionDigits: 0 })}`;
}
function fmtDate(s) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return s; }
}
function fmtNum(v, decimals = 0) {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function Field({ label, value, mono = false }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">{label}</div>
      <div className={`text-sm text-neutral-900 ${mono ? "font-mono tabular-nums" : ""}`}>
        {value || <span className="text-neutral-400">—</span>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// COMPONENTE PRINCIPALE
// ──────────────────────────────────────────────────────────
export default function SchedaMadreV2({ madre, onOpenAnnata, onClose, onMadreSaved }) {
  const [activeTab, setActiveTab] = useState("anagrafica");
  // Modifica madre direttamente dalla Cantina (vista raggruppata per madre).
  // Riusa MadreEditModal del modulo Anagrafiche. Gated: admin/superadmin/sommelier.
  const [editing, setEditing] = useState(false);
  const _role = localStorage.getItem("role");
  const isViniManager = isAdminRole(_role) || _role === "sommelier";
  const [movimenti, setMovimenti] = useState([]);
  const [stats, setStats] = useState(null);
  const [prezziStorico, setPrezziStorico] = useState([]);
  const [loadingMov, setLoadingMov] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingPrezzi, setLoadingPrezzi] = useState(false);

  // Header colors per tipologia
  const hdr = useMemo(() => getHeaderColors(madre?.tipologia), [madre?.tipologia]);

  // Fetch lazy per tab (carica solo quando si apre)
  useEffect(() => {
    if (!madre?.id) return;
    if (activeTab === "movimenti" && movimenti.length === 0 && !loadingMov) {
      setLoadingMov(true);
      apiFetch(`${API_BASE}/vini/v2/madre/${madre.id}/movimenti`)
        .then(r => r.ok ? r.json() : [])
        .then(setMovimenti)
        .finally(() => setLoadingMov(false));
    }
    if (activeTab === "stats" && !stats && !loadingStats) {
      setLoadingStats(true);
      apiFetch(`${API_BASE}/vini/v2/madre/${madre.id}/stats`)
        .then(r => r.ok ? r.json() : null)
        .then(setStats)
        .finally(() => setLoadingStats(false));
    }
    if (activeTab === "prezzi" && prezziStorico.length === 0 && !loadingPrezzi) {
      setLoadingPrezzi(true);
      apiFetch(`${API_BASE}/vini/v2/madre/${madre.id}/prezzi-storico`)
        .then(r => r.ok ? r.json() : [])
        .then(setPrezziStorico)
        .finally(() => setLoadingPrezzi(false));
    }
    // Stats serve anche per il KPI Vendite 60gg nell'header → carica subito
    if (!stats && !loadingStats) {
      setLoadingStats(true);
      apiFetch(`${API_BASE}/vini/v2/madre/${madre.id}/stats`)
        .then(r => r.ok ? r.json() : null)
        .then(setStats)
        .finally(() => setLoadingStats(false));
    }
  }, [activeTab, madre?.id]); // eslint-disable-line

  if (!madre) return null;

  // Aggregato locazioni per annata (per il tab Anagrafica)
  const locazioniPerAnnata = useMemo(() => {
    return (madre.annate || []).map(a => {
      const slots = [
        { nome: a.FRIGORIFERO, qta: a.QTA_FRIGO },
        { nome: a.LOCAZIONE_1, qta: a.QTA_LOC1 },
        { nome: a.LOCAZIONE_2, qta: a.QTA_LOC2 },
        { nome: a.LOCAZIONE_3, qta: a.QTA_LOC3 },
      ].filter(s => s.nome);
      return { annata: a.ANNATA || "NV", formato: a.FORMATO || "BT", slots, totale: a.QTA_TOTALE || 0, id: a.id };
    });
  }, [madre.annate]);

  // Altezza fissa a 78vh per coerenza con SchedaVino classica in modalità inline
  // (vedi pages/vini/SchedaVino.jsx). In questo modo header + TabBar restano
  // sticky in alto e il contenuto tab scrolla nel suo riquadro interno.
  return (
    <>
    <div className="rounded-2xl shadow-lg overflow-hidden border border-neutral-200 bg-white">
      <div className={`flex flex-col border-l-4 ${hdr.accent}`} style={{ height: "78vh" }}>

        {/* ═══════════ HEADER ═══════════ */}
        <div className={`${hdr.bg} border-b ${hdr.border} px-4 md:px-5 py-3 md:py-4 flex-shrink-0`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">M{String(madre.id).padStart(4, "0")}</span>
                {madre.tipologia && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${hdr.badge}`}>{madre.tipologia}</span>}
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-purple-100 text-purple-800 border-purple-200">
                  {madre.n_annate} annat{madre.n_annate === 1 ? "a" : "e"}
                </span>
                {!isViniManager && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-rose-50 text-rose-700 border-rose-200">🔒 READ-ONLY</span>
                )}
              </div>
              <h2 className={`text-base md:text-lg font-bold leading-tight ${hdr.text}`}>
                🍷 {madre.descrizione}
              </h2>
              <p className="text-xs text-neutral-600 mt-0.5">
                {[madre.produttore_nome, madre.regione, madre.denominazione_display].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isViniManager && (
                <button type="button" onClick={() => setEditing(true)}
                  className="px-3 h-8 md:h-9 rounded-lg border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200 transition text-xs font-semibold whitespace-nowrap">
                  ✎ Modifica
                </button>
              )}
              {onClose && (
                <button type="button" onClick={onClose}
                  className="w-8 h-8 md:w-9 md:h-9 rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition text-sm font-semibold">
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* 3 KPI aggregati */}
          <div className="grid grid-cols-3 gap-2 md:gap-3 mt-3">
            <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Giacenza totale</div>
              <div className="text-lg md:text-xl font-bold text-neutral-900">
                {madre.qta_tot}<span className="text-xs font-normal text-neutral-500"> bt</span>
              </div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Valore carta</div>
              <div className="text-lg md:text-xl font-bold text-neutral-900">
                {stats ? fmtEuro(stats.valore_carta_attuale) : "…"}
              </div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Vendite 60gg</div>
              <div className="text-lg md:text-xl font-bold text-neutral-900">
                {stats ? `${stats.bt_60gg}` : "…"}<span className="text-xs font-normal text-neutral-500"> bt</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════ TabBar ═══════════ */}
        <div className="flex border-b border-neutral-200 bg-neutral-50">
          {TABS.map(t => {
            const active = activeTab === t.key;
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 text-xs font-semibold transition border-b-2 ${
                  active ? "border-amber-500 bg-white text-amber-900" : "border-transparent text-neutral-600 hover:bg-white"
                }`}>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ═══════════ Contenuto tab ═══════════ */}
        {/* flex-1 + min-h-0 → il contenuto tab prende tutto lo spazio rimanente
            dentro il flex-col genitore e scrolla internamente. min-h-0 è
            indispensabile per far funzionare l'overflow su flex children. */}
        <div className="flex-1 overflow-auto min-h-0">

          {/* TAB ANAGRAFICA */}
          {activeTab === "anagrafica" && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Tipologia" value={madre.tipologia} />
                <Field label="Denominazione" value={madre.denominazione_display} />
                <Field label="Nazione" value={madre.nazione} />
                <Field label="Regione" value={madre.regione} />
                <Field label="Produttore" value={madre.produttore_nome} />
                <Field label="Distributore" value={madre.fornitore_nome} />
                <Field label="Rappresentante" value={madre.rappresentante_nome} />
                <Field
                  label="Grado alcolico medio"
                  value={stats?.grado_alcolico_medio ? `${fmtNum(stats.grado_alcolico_medio, 1)}%` : null}
                />
              </div>

              {madre.abbinamenti && (
                <div className="pt-3 border-t border-neutral-100">
                  <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-1">🍽️ Abbinamenti consigliati</div>
                  <p className="text-sm text-neutral-800 whitespace-pre-wrap">{madre.abbinamenti}</p>
                </div>
              )}

              {/* Riassunto locazioni per annata */}
              <div className="pt-3 border-t border-neutral-100">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">📦 Locazioni per annata</div>
                <div className="bg-neutral-50 rounded-lg border border-neutral-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-100 text-[10px] uppercase tracking-wider text-neutral-500">
                      <tr>
                        <th className="px-3 py-1.5 text-left w-20">Annata</th>
                        <th className="px-3 py-1.5 text-left w-16">Formato</th>
                        <th className="px-3 py-1.5 text-center w-12">Qta</th>
                        <th className="px-3 py-1.5 text-left">Locazioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locazioniPerAnnata.map(r => (
                        <tr key={r.id} className="border-t border-neutral-100 hover:bg-amber-50/70 cursor-pointer"
                          onClick={() => onOpenAnnata?.(r.id)}>
                          <td className="px-3 py-1 font-semibold">{r.annata}</td>
                          <td className="px-3 py-1 text-neutral-600">{r.formato}</td>
                          <td className="px-3 py-1 text-center font-bold">{r.totale}</td>
                          <td className="px-3 py-1 text-[11px] text-neutral-600">
                            {r.slots.map((s, i) => (
                              <span key={i} className="inline-block mr-3">
                                <span className="text-neutral-500">{s.nome}:</span> <strong>{s.qta || 0}</strong>
                              </span>
                            ))}
                            {r.slots.length === 0 && <span className="text-neutral-400">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Lista annate cliccabili */}
              <div className="pt-3 border-t border-neutral-100">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">🍾 Annate in cantina — clicca per aprire la scheda bottiglia</div>
                <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-100 text-[10px] uppercase tracking-wider text-neutral-500">
                      <tr>
                        <th className="px-3 py-1.5 text-left w-16">ID</th>
                        <th className="px-3 py-1.5 text-left w-20">Annata</th>
                        <th className="px-3 py-1.5 text-left w-16">Formato</th>
                        <th className="px-3 py-1.5 text-right w-24">Prezzo carta</th>
                        <th className="px-3 py-1.5 text-right w-24">Listino</th>
                        <th className="px-3 py-1.5 text-center w-12">Qta</th>
                        <th className="px-3 py-1.5 text-left">Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {madre.annate.map(a => (
                        <tr key={a.id} className="border-t border-neutral-100 hover:bg-amber-50/70 cursor-pointer"
                          onClick={() => onOpenAnnata?.(a.id)}>
                          <td className="px-3 py-1">
                            <span className="inline-flex items-center bg-slate-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">#{a.id}</span>
                          </td>
                          <td className="px-3 py-1 font-semibold">{a.ANNATA || "NV"}</td>
                          <td className="px-3 py-1 text-neutral-600">{a.FORMATO || "BT"}</td>
                          <td className="px-3 py-1 text-right font-semibold tabular-nums">{fmtEuro(a.PREZZO_CARTA)}</td>
                          <td className="px-3 py-1 text-right text-neutral-500 tabular-nums">{fmtEuro(a.EURO_LISTINO)}</td>
                          <td className="px-3 py-1 text-center font-bold">{a.QTA_TOTALE || 0}</td>
                          <td className="px-3 py-1">
                            {a.STATO_VENDITA != null && (() => {
                              const s = STATO_VENDITA[a.STATO_VENDITA];
                              return s ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${s.color}`}>{s.label}</span> : null;
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB PREZZI */}
          {activeTab === "prezzi" && (
            <div className="p-5 space-y-4">
              {loadingPrezzi && <div className="text-sm text-neutral-500">Carico storico prezzi…</div>}
              {!loadingPrezzi && prezziStorico.length === 0 && (
                <div className="text-sm text-neutral-500">Nessuna annata trovata.</div>
              )}
              {!loadingPrezzi && prezziStorico.length > 0 && (() => {
                // KPI prezzo: medio, min, max
                const prezzi = prezziStorico.map(p => Number(p.PREZZO_CARTA) || 0).filter(x => x > 0);
                const medio = prezzi.length ? prezzi.reduce((s, x) => s + x, 0) / prezzi.length : 0;
                const min = prezzi.length ? Math.min(...prezzi) : 0;
                const max = prezzi.length ? Math.max(...prezzi) : 0;
                return (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <div className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">Prezzo medio</div>
                        <div className="text-lg font-bold text-emerald-900">{fmtEuro(medio)}</div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="text-[10px] uppercase tracking-wide text-blue-700 font-semibold">Min</div>
                        <div className="text-lg font-bold text-blue-900">{fmtEuro(min)}</div>
                      </div>
                      <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                        <div className="text-[10px] uppercase tracking-wide text-rose-700 font-semibold">Max</div>
                        <div className="text-lg font-bold text-rose-900">{fmtEuro(max)}</div>
                      </div>
                    </div>

                    {/* Tabella prezzi per annata */}
                    <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-neutral-100 text-[10px] uppercase tracking-wider text-neutral-500">
                          <tr>
                            <th className="px-3 py-1.5 text-left w-16">ID</th>
                            <th className="px-3 py-1.5 text-left w-20">Annata</th>
                            <th className="px-3 py-1.5 text-left w-16">Formato</th>
                            <th className="px-3 py-1.5 text-right">Carta</th>
                            <th className="px-3 py-1.5 text-right">Listino</th>
                            <th className="px-3 py-1.5 text-right">Calice</th>
                            <th className="px-3 py-1.5 text-right">Sconto</th>
                            <th className="px-3 py-1.5 text-right">Storico</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prezziStorico.map(p => (
                            <tr key={p.id} className="border-t border-neutral-100 hover:bg-amber-50/70 cursor-pointer"
                              onClick={() => onOpenAnnata?.(p.id)}>
                              <td className="px-3 py-1">
                                <span className="inline-flex items-center bg-slate-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">#{p.id}</span>
                              </td>
                              <td className="px-3 py-1 font-semibold">{p.ANNATA || "NV"}</td>
                              <td className="px-3 py-1 text-neutral-600">{p.FORMATO || "BT"}</td>
                              <td className="px-3 py-1 text-right font-semibold tabular-nums">{fmtEuro(p.PREZZO_CARTA)}</td>
                              <td className="px-3 py-1 text-right text-neutral-500 tabular-nums">{fmtEuro(p.EURO_LISTINO)}</td>
                              <td className="px-3 py-1 text-right text-violet-700 tabular-nums">{fmtEuro(p.PREZZO_CALICE)}{p.PREZZO_CALICE_MANUALE ? " ✎" : ""}</td>
                              <td className="px-3 py-1 text-right text-neutral-500 tabular-nums">{p.SCONTO ? `${fmtNum(p.SCONTO, 0)}%` : "—"}</td>
                              <td className="px-3 py-1 text-right text-[10px] text-neutral-500">{(p.storico?.length || 0)} variazion{p.storico?.length === 1 ? "e" : "i"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Storico variazioni cumulativo */}
                    {prezziStorico.some(p => p.storico?.length > 0) && (
                      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden mt-3">
                        <div className="bg-neutral-100 px-3 py-1.5 text-[10px] uppercase tracking-wider text-neutral-600 font-semibold">
                          Variazioni prezzo recenti (tutte le annate)
                        </div>
                        <table className="w-full text-xs">
                          <thead className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500">
                            <tr>
                              <th className="px-3 py-1.5 text-left">Data</th>
                              <th className="px-3 py-1.5 text-left w-20">Annata</th>
                              <th className="px-3 py-1.5 text-right">Carta da</th>
                              <th className="px-3 py-1.5 text-right">a</th>
                              <th className="px-3 py-1.5 text-right">Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prezziStorico.flatMap(p =>
                              (p.storico || []).map(s => ({ ...s, annata: p.ANNATA, bid: p.id }))
                            ).sort((a, b) => String(b.data_modifica || "").localeCompare(String(a.data_modifica || ""))).slice(0, 30).map((s, i) => {
                              const vec = Number(s.prezzo_carta_vecchio) || 0;
                              const nuo = Number(s.prezzo_carta_nuovo) || 0;
                              const delta = nuo - vec;
                              return (
                                <tr key={i} className="border-t border-neutral-100">
                                  <td className="px-3 py-1 text-[11px] text-neutral-600">{fmtDate(s.data_modifica)}</td>
                                  <td className="px-3 py-1 font-semibold">{s.annata || "NV"}</td>
                                  <td className="px-3 py-1 text-right text-neutral-500 tabular-nums">{fmtEuro(vec)}</td>
                                  <td className="px-3 py-1 text-right font-semibold tabular-nums">{fmtEuro(nuo)}</td>
                                  <td className={`px-3 py-1 text-right font-bold tabular-nums ${delta > 0 ? "text-emerald-700" : delta < 0 ? "text-rose-700" : "text-neutral-500"}`}>
                                    {delta > 0 ? "+" : ""}{fmtEuro(delta)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* TAB MOVIMENTI */}
          {activeTab === "movimenti" && (
            <div className="p-5">
              {loadingMov && <div className="text-sm text-neutral-500">Carico movimenti…</div>}
              {!loadingMov && movimenti.length === 0 && (
                <div className="text-sm text-neutral-500">Nessun movimento registrato per le annate di questo vino.</div>
              )}
              {!loadingMov && movimenti.length > 0 && (
                <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-100 text-[10px] uppercase tracking-wider text-neutral-500">
                      <tr>
                        <th className="px-3 py-1.5 text-left w-24">Data</th>
                        <th className="px-3 py-1.5 text-left w-24">Tipo</th>
                        <th className="px-3 py-1.5 text-left w-20">Annata</th>
                        <th className="px-3 py-1.5 text-center w-12">Qta</th>
                        <th className="px-3 py-1.5 text-right w-20">€/bt</th>
                        <th className="px-3 py-1.5 text-right w-24">Totale</th>
                        <th className="px-3 py-1.5 text-left w-32">Locazione</th>
                        <th className="px-3 py-1.5 text-left">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimenti.map(m => {
                        const tipo = (m.tipo || "").toUpperCase();
                        const tipoColor =
                          tipo === "VENDITA" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                          tipo === "CARICO"  ? "bg-blue-100 text-blue-800 border-blue-200" :
                          tipo === "SCARICO" ? "bg-rose-100 text-rose-800 border-rose-200" :
                          "bg-neutral-100 text-neutral-700 border-neutral-200";
                        // Mig 129 (2026-05-16): usa snapshot prezzo_unitario.
                        // Fallback a prezzo_carta_attuale solo se NULL (record pre-mig non backfillati).
                        const prezzoReale = m.prezzo_unitario != null ? Number(m.prezzo_unitario) : null;
                        const prezzoFallback = m.prezzo_carta_attuale != null ? Number(m.prezzo_carta_attuale) : null;
                        const prezzoEff = prezzoReale != null ? prezzoReale : prezzoFallback;
                        const isStima = prezzoReale == null && prezzoFallback != null;
                        const totale = (prezzoEff != null && tipo !== "MODIFICA" && tipo !== "RETTIFICA")
                          ? (Number(m.qta) || 0) * prezzoEff : null;
                        return (
                          <tr key={m.id} className="border-t border-neutral-100">
                            <td className="px-3 py-1 text-[11px] text-neutral-600">{fmtDate(m.data_mov)}</td>
                            <td className="px-3 py-1">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${tipoColor}`}>{tipo}</span>
                            </td>
                            <td className="px-3 py-1 font-semibold">{m.ANNATA || "NV"}{m.FORMATO ? ` · ${m.FORMATO}` : ""}</td>
                            <td className="px-3 py-1 text-center font-bold">{m.qta}</td>
                            <td className="px-3 py-1 text-right tabular-nums text-[11px]"
                                title={isStima ? "Stima: prezzo carta attuale (nessuno snapshot disponibile)" : "Snapshot al momento del movimento"}>
                              {prezzoEff != null ? (
                                <span className={isStima ? "text-neutral-400 italic" : "text-neutral-700"}>
                                  {fmtEuro(prezzoEff)}{isStima ? "*" : ""}
                                </span>
                              ) : <span className="text-neutral-300">—</span>}
                            </td>
                            <td className="px-3 py-1 text-right font-semibold tabular-nums">
                              {totale != null
                                ? <span className={isStima ? "text-neutral-500 italic" : ""}>{fmtEuro(totale)}</span>
                                : <span className="text-neutral-300">—</span>}
                            </td>
                            <td className="px-3 py-1 text-[11px] text-neutral-600 truncate">{m.locazione || ""}</td>
                            <td className="px-3 py-1 text-[11px] text-neutral-600 truncate max-w-xs">{m.note || ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="bg-neutral-50 border-t border-neutral-200 px-3 py-1.5 text-[10px] text-neutral-500 text-center">
                    {movimenti.length} movimenti totali
                    {movimenti.some(m => m.prezzo_unitario == null && m.prezzo_carta_attuale != null) && (
                      <span className="ml-2 italic">· * = stima (prezzo carta attuale, snapshot non disponibile per movimento pre-mig 129)</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB STATISTICHE */}
          {activeTab === "stats" && (
            <div className="p-5 space-y-4">
              {loadingStats && <div className="text-sm text-neutral-500">Carico statistiche…</div>}
              {!loadingStats && !stats && <div className="text-sm text-neutral-500">Nessuna statistica disponibile.</div>}
              {!loadingStats && stats && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <div className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">Vendite totali (storiche)</div>
                      <div className="text-xl font-bold text-emerald-900">{stats.vendite_totali}<span className="text-xs font-normal text-emerald-700"> bt</span></div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold">Ricavo totale</div>
                      <div className="text-xl font-bold text-amber-900">{fmtEuro(stats.ricavo_totale)}</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="text-[10px] uppercase tracking-wide text-blue-700 font-semibold">Vendite 60gg</div>
                      <div className="text-xl font-bold text-blue-900">{stats.bt_60gg}<span className="text-xs font-normal text-blue-700"> bt</span></div>
                    </div>
                    <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
                      <div className="text-[10px] uppercase tracking-wide text-violet-700 font-semibold">Ritmo medio</div>
                      <div className="text-xl font-bold text-violet-900">{fmtNum(stats.bt_mese_medio, 1)}<span className="text-xs font-normal text-violet-700"> bt/mese</span></div>
                    </div>
                  </div>
                  {/* Riga acquisti + margine (mig 129) — visibile solo se ci sono dati acquisto */}
                  {(stats.qta_acquisti > 0 || stats.costo_acquisti_totale > 0) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                      <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                        <div className="text-[10px] uppercase tracking-wide text-sky-700 font-semibold">Acquistate (storiche)</div>
                        <div className="text-xl font-bold text-sky-900">{stats.qta_acquisti || 0}<span className="text-xs font-normal text-sky-700"> bt</span></div>
                      </div>
                      <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                        <div className="text-[10px] uppercase tracking-wide text-rose-700 font-semibold">Costo acquisti</div>
                        <div className="text-xl font-bold text-rose-900">{fmtEuro(stats.costo_acquisti_totale || 0)}</div>
                      </div>
                      <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                        <div className="text-[10px] uppercase tracking-wide text-teal-700 font-semibold">Margine lordo</div>
                        <div className="text-xl font-bold text-teal-900">
                          {fmtEuro((stats.ricavo_totale || 0) - (stats.costo_acquisti_totale || 0))}
                        </div>
                      </div>
                      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
                        <div className="text-[10px] uppercase tracking-wide text-neutral-600 font-semibold">Ricarico %</div>
                        <div className="text-xl font-bold text-neutral-900">
                          {stats.costo_acquisti_totale > 0
                            ? `${fmtNum(((stats.ricavo_totale || 0) / stats.costo_acquisti_totale - 1) * 100, 0)}%`
                            : "—"}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-neutral-100">
                    <Field label="Prima vendita" value={fmtDate(stats.prima_vendita)} />
                    <Field label="Ultima vendita" value={fmtDate(stats.ultima_vendita)} />
                    <Field
                      label="Grado alcolico medio"
                      value={stats.grado_alcolico_medio ? `${fmtNum(stats.grado_alcolico_medio, 1)}%` : null}
                    />
                    <Field label="Valore carta attuale" value={fmtEuro(stats.valore_carta_attuale)} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB NOTE */}
          {activeTab === "note" && (
            <div className="p-5">
              {madre.note_madre
                ? <p className="text-sm text-neutral-800 whitespace-pre-wrap">{madre.note_madre}</p>
                : <p className="text-sm text-neutral-500">Nessuna nota registrata sul vino madre.</p>
              }
            </div>
          )}

        </div>
      </div>
    </div>

    {/* Modale modifica madre — riusa MadreEditModal del modulo Anagrafiche.
        Al salvataggio chiude e notifica il parent (CantinaV2 → fetchData). */}
    {editing && (
      <MadreEditModal
        madre={madre}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); onMadreSaved?.(); }}
      />
    )}
    </>
  );
}
