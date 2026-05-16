// src/pages/vini/v2/CantinaV2.jsx
// Modulo: vini (V.6+V.7+V.8 — Modulo Gestione Vino 2)
//
// Cantina v2 read-only. Usa i mattoni condivisi:
//   - useCantinaFilters (hook): state filtri + applyFilters(items)
//   - <CantinaFiltri />: sidebar JSX identica a MagazzinoVini
//   - <RiepilogoTipologie /> + applyRiepilogoFilter: chip in cima
//
// Differenza dal classico: legge da `/vini/v2/*` (tabelle `_v2`), niente
// scritture/checkbox/bulk. Tutto il resto del comportamento filtri è IDENTICO.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../../config/api";
import {
  STATO_VENDITA,
  STATO_VENDITA_OPTIONS,
  STATO_RIORDINO_OPTIONS,
  STATO_CONSERVAZIONE_OPTIONS,
} from "../../../config/viniConstants";
import useCantinaFilters from "../../../hooks/useCantinaFilters";
import CantinaFiltri from "../../../components/vini/CantinaFiltri";
import RiepilogoTipologie, { applyRiepilogoFilter } from "../../../components/vini/RiepilogoTipologie";
import groupByMadre from "../../../utils/vini/groupByMadre";

// ──────────────────────────────────────────────
// Helpers stile (replica MagazzinoVini)
// ──────────────────────────────────────────────
const TIPO_ROW_BG = {
  ROSSI:     "bg-red-50/30",
  BIANCHI:   "bg-amber-50/30",
  BOLLICINE: "bg-yellow-50/30",
  ROSATI:    "bg-pink-50/30",
};
const TIPO_BORDER_L = {
  ROSSI:     "border-l-red-600",
  BIANCHI:   "border-l-amber-600",
  BOLLICINE: "border-l-yellow-600",
  ROSATI:    "border-l-pink-600",
};
const TIPO_BADGE = {
  ROSSI:     "bg-red-100 text-red-800 border-red-200",
  BIANCHI:   "bg-amber-100 text-amber-800 border-amber-200",
  BOLLICINE: "bg-yellow-100 text-yellow-800 border-yellow-200",
  ROSATI:    "bg-pink-100 text-pink-800 border-pink-200",
};
function pickByTipo(t, map, fallback = "") {
  if (!t) return fallback;
  const k = String(t).toUpperCase();
  for (const [key, v] of Object.entries(map)) if (k.includes(key)) return v;
  return fallback;
}
function fmtEuro(v) {
  if (v == null || v === "") return "—";
  return `€${Number(v).toLocaleString("it-IT", { minimumFractionDigits: 0 })}`;
}

export default function CantinaV2() {
  const navigate = useNavigate();
  const [vista, setVista] = useState("bottiglie"); // "bottiglie" | "madri"
  const [bottiglie, setBottiglie] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locConfig, setLocConfig] = useState({ frigorifero: [], locazione_1: [], locazione_2: [], locazione_3: [] });
  const [riepilogoFilter, setRiepilogoFilter] = useState(null);

  // ── Hook condiviso filtri ──
  const f = useCantinaFilters({ locConfig });

  // ── Fetch dati v2 (un solo fetch — la vista Madri raggruppa client-side) ──
  const fetchData = async () => {
    setLoading(true); setError("");
    try {
      const r = await apiFetch(`${API_BASE}/vini/v2/bottiglie/?limit=10000`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setBottiglie(await r.json());
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line

  // ── Carica locConfig (stessa fonte di MagazzinoVini) ──
  useEffect(() => {
    apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setLocConfig({
            frigorifero: data.frigorifero || [],
            locazione_1: data.locazione_1 || [],
            locazione_2: data.locazione_2 || [],
            locazione_3: data.locazione_3 || [],
          });
        }
      })
      .catch(() => {});
  }, []);

  // ── opts per i select anagrafica (distinct dai dati come MagazzinoVini) ──
  const opts = useMemo(() => {
    const distinct = (key) => [...new Set(bottiglie.map(v => v[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "it"));
    return {
      tipologie: distinct("TIPOLOGIA"),
      nazioni: distinct("NAZIONE"),
      regioni: distinct("REGIONE"),
      produttori: distinct("PRODUTTORE"),
      distributori: distinct("DISTRIBUTORE"),
      rappresentanti: distinct("RAPPRESENTANTE"),
    };
  }, [bottiglie]);

  // ── Pipeline filtri unica (vale per Bottiglie e Madri) ──
  // 1) applyFilters dei filtri sidebar → bottiglieFiltrate
  // 2) applyRiepilogoFilter dei chip in cima → bottiglieVisibili
  // 3) groupByMadre delle visibili → madriVisibili (solo per vista madri)
  const bottiglieFiltrate = useMemo(() => f.applyFilters(bottiglie), [f, bottiglie]);
  const bottiglieVisibili = useMemo(() => applyRiepilogoFilter(bottiglieFiltrate, riepilogoFilter), [bottiglieFiltrate, riepilogoFilter]);
  const madriVisibili = useMemo(() => groupByMadre(bottiglieVisibili), [bottiglieVisibili]);

  return (
    <div className="flex" style={{ minHeight: "calc(100vh - 200px)" }}>

      {/* SIDEBAR FILTRI (condivisa) */}
      <aside className="w-sidebar min-w-sidebar border-r border-neutral-200 bg-neutral-50 overflow-y-auto flex-shrink-0">
        <CantinaFiltri
          f={f}
          opts={opts}
          statoVenditaOptions={STATO_VENDITA_OPTIONS}
          statoRiordinoOptions={STATO_RIORDINO_OPTIONS}
          statoConservazioneOptions={STATO_CONSERVAZIONE_OPTIONS}
          loading={loading}
          onReload={fetchData}
          error={error}
        />
      </aside>

      {/* CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header + toggle vista */}
        <div className="px-3 py-2 bg-white border-b border-neutral-200 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-amber-900">🍷 Cantina v2</h2>
            <span className="text-[10px] text-neutral-500">Read-only — test parallelo</span>
          </div>
          <div className="flex border border-neutral-300 rounded-lg overflow-hidden">
            <button onClick={() => setVista("bottiglie")}
              className={`px-3 py-1.5 text-xs font-semibold transition ${vista === "bottiglie" ? "bg-amber-700 text-white" : "bg-white text-neutral-700 hover:bg-neutral-100"}`}>🍾 Bottiglie</button>
            <button onClick={() => setVista("madri")}
              className={`px-3 py-1.5 text-xs font-semibold transition ${vista === "madri" ? "bg-amber-700 text-white" : "bg-white text-neutral-700 hover:bg-neutral-100"}`}>🍷 Madri</button>
          </div>
        </div>

        {/* Riepilogo tipologie chip — sempre sulle bottigliefiltrate (=stessa pipeline) */}
        <RiepilogoTipologie
          items={bottiglieFiltrate}
          riepilogoFilter={riepilogoFilter}
          setRiepilogoFilter={setRiepilogoFilter}
          rightSummary={vista === "bottiglie"
            ? `${bottiglieVisibili.length} di ${bottiglie.length} bottiglie`
            : `${madriVisibili.length} madri · ${bottiglieVisibili.length} annate`}
        />

        {/* Contenuto */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading && <div className="p-6 text-center text-sm text-neutral-500">Carico…</div>}
          {error && !loading && <div className="p-6 text-center text-sm text-red-600">Errore: {error}</div>}

          {/* ── VISTA BOTTIGLIE ── */}
          {!loading && !error && vista === "bottiglie" && (
            <table className="w-full text-[11px]">
              <thead className="bg-neutral-100 sticky top-0 z-10">
                <tr className="text-[9px] text-neutral-600 uppercase tracking-wide select-none">
                  <th className="px-2 py-2 text-left w-12">ID</th>
                  <th className="px-2 py-2 text-left">Vino</th>
                  <th className="px-2 py-2 text-left w-20">Produttore</th>
                  <th className="px-2 py-2 text-left w-16">Origine</th>
                  <th className="px-2 py-2 text-center w-10">Qta</th>
                  <th className="px-2 py-2 text-center w-14">Prezzo</th>
                  <th className="px-2 py-2 text-center w-20">Flag</th>
                </tr>
              </thead>
              <tbody>
                {bottiglieVisibili.map(v => {
                  const tip = v.TIPOLOGIA || v.m_tipologia;
                  const denom = v.DENOMINAZIONE || v.d_display;
                  return (
                    <tr key={v.id}
                      className={`cursor-pointer border-b border-neutral-100 hover:bg-amber-50/70 ${pickByTipo(tip, TIPO_ROW_BG, "bg-white")}`}
                      onClick={() => navigate(`/vini/v2/bottiglia/${v.id}`)}>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className="inline-flex items-center bg-slate-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">#{v.id}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-semibold text-neutral-900 truncate max-w-[260px]">
                          {v.DESCRIZIONE || v.m_descrizione}
                          {v.ANNATA && <span className="text-neutral-500 font-normal"> · {v.ANNATA}</span>}
                          {v.FORMATO && <span className="text-neutral-500 font-normal"> · {v.FORMATO}</span>}
                        </div>
                        {denom && <div className="text-[10px] text-neutral-500 truncate max-w-[260px]">{denom}</div>}
                      </td>
                      <td className="px-2 py-1.5 text-neutral-700 truncate max-w-[100px]">{v.PRODUTTORE || v.p_nome || "—"}</td>
                      <td className="px-2 py-1.5 text-[10px] text-neutral-600 truncate max-w-[90px]">
                        {v.NAZIONE || v.p_nazione}{(v.REGIONE || v.p_regione) ? ` / ${v.REGIONE || v.p_regione}` : ""}
                      </td>
                      <td className="px-2 py-1.5 text-center font-bold text-neutral-900">{v.QTA_TOTALE || 0}</td>
                      <td className="px-2 py-1.5 text-center text-[10px] text-neutral-600">{fmtEuro(v.PREZZO_CARTA)}</td>
                      <td className="px-1 py-1.5 text-center">
                        <div className="flex flex-wrap gap-0.5 justify-center">
                          {v.CARTA === 1 && <span title="In carta" className="inline-block px-1 py-0 rounded text-[8px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">C</span>}
                          {v.IPRATICO === 1 && <span title="iPratico" className="inline-block px-1 py-0 rounded text-[8px] font-bold bg-sky-100 text-sky-700 border border-sky-200">I</span>}
                          {v.BIOLOGICO === 1 && <span title="Biologico" className="inline-block px-1 py-0 rounded text-[8px] font-bold bg-lime-100 text-lime-700 border border-lime-200">B</span>}
                          {v.VENDITA_CALICE === 1 && <span title="Calice" className="inline-block px-1 py-0 rounded text-[8px] font-bold bg-violet-100 text-violet-700 border border-violet-200">K</span>}
                          {v.STATO_VENDITA != null && (() => {
                            const s = STATO_VENDITA[v.STATO_VENDITA];
                            return s ? <span title={s.label} className={`inline-block px-1 py-0 rounded text-[8px] font-bold border ${s.color}`}>{v.STATO_VENDITA}</span> : null;
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {bottiglieVisibili.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-neutral-500">Nessun vino con i filtri correnti.</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* ── VISTA MADRI ── 1 annata inline / N annate compatte */}
          {!loading && !error && vista === "madri" && (
            <div className="p-2 space-y-1.5">
              {madriVisibili.map(m => {
                const tip = m.tipologia;
                const borderColor = pickByTipo(tip, TIPO_BORDER_L, "border-l-neutral-400");
                const sottotitolo = [m.produttore_nome, m.regione, m.denominazione_display].filter(Boolean).join(" · ");
                const isSingle = m.annate.length === 1;

                if (isSingle) {
                  const a = m.annate[0];
                  const loc = [
                    a.FRIGORIFERO && `Frigo: ${a.QTA_FRIGO || 0}`,
                    a.LOCAZIONE_1 && `${a.LOCAZIONE_1}: ${a.QTA_LOC1 || 0}`,
                    a.LOCAZIONE_2 && `${a.LOCAZIONE_2}: ${a.QTA_LOC2 || 0}`,
                  ].filter(Boolean).join(" · ");
                  return (
                    <div key={m.id} onClick={() => navigate(`/vini/v2/bottiglia/${a.id}`)}
                      className={`bg-white rounded-lg border border-neutral-200 shadow-sm hover:bg-amber-50/40 cursor-pointer border-l-4 ${borderColor} flex items-center gap-2 px-3 py-1.5`}>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">M{String(m.id).padStart(4, "0")}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${pickByTipo(tip, TIPO_BADGE)} hidden md:inline`}>{tip}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[13px] text-neutral-900 truncate leading-tight">{m.descrizione}</div>
                        {sottotitolo && <div className="text-[10px] text-neutral-500 truncate leading-tight">{sottotitolo}</div>}
                      </div>
                      <div className="flex items-center gap-2.5 text-[11px] flex-shrink-0">
                        <span className="font-semibold text-neutral-700 w-12 text-right">{a.ANNATA || "NV"}</span>
                        <span className="text-neutral-500 w-8 text-center">{a.FORMATO || "BT"}</span>
                        <span className="font-semibold text-neutral-700 w-14 text-right tabular-nums">{fmtEuro(a.PREZZO_CARTA)}</span>
                        <span className="font-bold text-neutral-900 w-12 text-center tabular-nums">{a.QTA_TOTALE || 0}<span className="text-[9px] text-neutral-400 font-normal"> bt</span></span>
                        {a.STATO_VENDITA != null && (() => {
                          const s = STATO_VENDITA[a.STATO_VENDITA];
                          return s ? <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border w-20 text-center ${s.color}`}>{s.label}</span> : <span className="w-20 inline-block" />;
                        })()}
                        {loc && <span className="text-[10px] text-neutral-500 hidden lg:inline w-44 truncate">{loc}</span>}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={m.id} className={`bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden border-l-4 ${borderColor}`}>
                    <div className="px-3 py-1.5 flex items-center gap-2 border-b border-neutral-100">
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 flex-shrink-0">M{String(m.id).padStart(4, "0")}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${pickByTipo(tip, TIPO_BADGE)} flex-shrink-0 hidden md:inline`}>{tip}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[13px] text-neutral-900 truncate leading-tight">{m.descrizione}</div>
                        {sottotitolo && <div className="text-[10px] text-neutral-500 truncate leading-tight">{sottotitolo}</div>}
                      </div>
                      <span className="text-[10px] text-neutral-500 whitespace-nowrap flex-shrink-0">{m.n_annate} annate · {m.qta_tot} bt</span>
                    </div>
                    <table className="w-full text-[11px]">
                      <tbody>
                        {m.annate.map(a => {
                          const loc = [
                            a.FRIGORIFERO && `Frigo: ${a.QTA_FRIGO || 0}`,
                            a.LOCAZIONE_1 && `${a.LOCAZIONE_1}: ${a.QTA_LOC1 || 0}`,
                            a.LOCAZIONE_2 && `${a.LOCAZIONE_2}: ${a.QTA_LOC2 || 0}`,
                          ].filter(Boolean).join(" · ");
                          return (
                            <tr key={a.id} onClick={() => navigate(`/vini/v2/bottiglia/${a.id}`)}
                              className="cursor-pointer border-t border-neutral-100 hover:bg-amber-50/70">
                              <td className="pl-3 pr-2 py-1 font-semibold w-16 text-right">{a.ANNATA || "NV"}</td>
                              <td className="px-2 py-1 text-neutral-600 w-10 text-center">{a.FORMATO || "BT"}</td>
                              <td className="px-2 py-1 text-right font-semibold w-16 tabular-nums">{fmtEuro(a.PREZZO_CARTA)}</td>
                              <td className="px-2 py-1 text-center font-bold w-12 tabular-nums">{a.QTA_TOTALE || 0}</td>
                              <td className="px-2 py-1 w-24">
                                {a.STATO_VENDITA != null && (() => {
                                  const s = STATO_VENDITA[a.STATO_VENDITA];
                                  return s ? <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${s.color}`}>{s.label}</span> : null;
                                })()}
                              </td>
                              <td className="px-2 py-1 text-[10px] text-neutral-500 truncate">{loc}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {madriVisibili.length === 0 && (
                <div className="p-8 text-center text-sm text-neutral-500">Nessun vino madre con i filtri correnti.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
