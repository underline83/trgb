// @version: v3.0-testa-tab — pattern uniforme testa fissa + tab (Modulo E, 2026-04-27)
// Dettaglio Ricetta — coerente con SchedaVino (S55) e MenuCartaDettaglio (S57)
//
// Pattern:
//   - Testa fissa sticky orange con badge identità + 4 KPI in grid 2x2/1x4
//   - Tab bar: Composizione | Servizi | Note | Storico
//   - Footer azioni primarie nella testa (Modifica + Disattiva)
//
// La sezione Allergeni vive dentro il tab Composizione (è un dato della
// composizione: deriva ricorsivamente dagli ingredienti).

import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "./RicetteNav";
import { Btn, StatusBadge } from "../../components/ui";

const FC = `${API_BASE}/foodcost`;

const TABS = [
  { key: "composizione", label: "Composizione" },
  { key: "servizi",      label: "Servizi" },
  { key: "note",         label: "Note" },
  { key: "storico",      label: "Storico" },
];

// ─────────────────────────────────────────
// Helpers UI
// ─────────────────────────────────────────
function FcBadge({ pct }) {
  if (pct == null) return <span className="text-neutral-400 text-sm">n/d</span>;
  let color = "bg-green-100 text-green-800 border-green-300";
  if (pct > 35) color = "bg-yellow-100 text-yellow-800 border-yellow-300";
  if (pct > 45) color = "bg-red-100 text-red-800 border-red-300";
  return (
    <span className={`text-sm font-bold px-2 py-0.5 rounded-full border inline-block ${color}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

function AllergeneBadge({ name }) {
  return (
    <span className="inline-block text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
      {name}
    </span>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg px-3 py-2">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-lg md:text-xl font-bold text-brand-ink">{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────
// COMPONENT PRINCIPALE
// ─────────────────────────────────────────
export default function RicetteDettaglio() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ricetta, setRicetta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("composizione");
  const [recalcLoading, setRecalcLoading] = useState(false);
  // F.2: storico FC
  const [storico, setStorico] = useState(null);
  const [storicoLoading, setStoricoLoading] = useState(false);
  const [storicoFinestra, setStoricoFinestra] = useState(180); // giorni

  const loadStorico = async (giorni = storicoFinestra) => {
    if (!ricetta) return;
    setStoricoLoading(true);
    try {
      const r = await apiFetch(`${FC}/ricette/${ricetta.id}/storico-fc?giorni=${giorni}&intervallo=mese`);
      if (r.ok) setStorico(await r.json());
      else setStorico(null);
    } catch {
      setStorico(null);
    } finally {
      setStoricoLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "storico" && ricetta && !storico) {
      loadStorico();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ricetta]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await apiFetch(`${FC}/ricette/${id}`);
      if (!resp.ok) throw new Error("Ricetta non trovata");
      setRicetta(await resp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const ricalcolaAllergeni = async () => {
    if (!ricetta) return;
    setRecalcLoading(true);
    try {
      const r = await apiFetch(`${FC}/ricette/${ricetta.id}/ricalcola-allergeni`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setRicetta((prev) => ({ ...prev, allergeni_calcolati: data.allergeni_calcolati }));
    } catch (e) {
      alert(`Ricalcolo allergeni fallito: ${e.message}`);
    } finally {
      setRecalcLoading(false);
    }
  };

  const handleDisattiva = async () => {
    if (!ricetta) return;
    if (!window.confirm(`Disattivare "${ricetta.name}"?\n\nLa ricetta non sarà più visibile in archivio ma resterà in DB per integrità storica.`)) return;
    try {
      const resp = await apiFetch(`${FC}/ricette/${ricetta.id}`, { method: "DELETE" });
      if (!resp.ok) throw new Error("Errore");
      navigate("/ricette/archivio");
    } catch (err) {
      alert("Errore nella disattivazione.");
    }
  };

  // ── States di errore/loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-brand-cream">
        <RicetteNav current="archivio" />
        <div className="flex items-center justify-center py-20">
          <p className="text-neutral-500">Caricamento ricetta…</p>
        </div>
      </div>
    );
  }

  if (error || !ricetta) {
    return (
      <div className="min-h-screen bg-brand-cream">
        <RicetteNav current="archivio" />
        <div className="max-w-3xl mx-auto p-6 mt-6">
          <div className="bg-white rounded-2xl shadow border border-neutral-200 p-8">
            <p className="text-red-600 mb-4">{error || "Ricetta non trovata"}</p>
            <Btn variant="secondary" size="md" onClick={() => navigate("/ricette/archivio")}>
              ← Torna all'archivio
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  const r = ricetta;

  return (
    <div className="min-h-screen bg-brand-cream">
      <RicetteNav current="archivio" />
      <div className="max-w-6xl mx-auto">

        {/* ═══ TESTA FISSA ═══ */}
        <div className="bg-gradient-to-b from-white to-brand-cream border-b-2 border-orange-200 px-4 md:px-6 py-4 md:py-5 sticky top-0 z-10">
          <div className="flex items-center gap-2 mb-2 text-xs">
            <Link to="/ricette/archivio" className="text-orange-700 hover:text-orange-900 hover:underline">
              ← Archivio ricette
            </Link>
          </div>

          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-mono bg-slate-700 text-white px-1.5 py-0.5 rounded">
                  R{String(r.id).padStart(3, "0")}
                </span>
                {r.is_base ? (
                  <StatusBadge tone="brand" size="sm">Base</StatusBadge>
                ) : (
                  <StatusBadge tone="warning" size="sm">Piatto</StatusBadge>
                )}
                {r.category_name && (
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                    {r.category_name}
                  </span>
                )}
                {!r.is_active && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-neutral-100 text-neutral-600 border-neutral-300 uppercase">
                    Disattivata
                  </span>
                )}
              </div>
              <h1 className="text-xl md:text-3xl font-bold text-orange-900 leading-tight font-playfair">
                {r.name}
              </h1>
              {r.menu_name && r.menu_name !== r.name && (
                <p className="text-xs text-neutral-600 italic mt-1">"{r.menu_name}"</p>
              )}
              <p className="text-xs text-neutral-600 mt-1">
                Resa: {r.yield_qty} {r.yield_unit}
                {r.prep_time ? ` · Prep: ${r.prep_time} min` : ""}
              </p>
            </div>

            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <Btn variant="primary" size="sm" onClick={() => navigate(`/ricette/modifica/${r.id}`)}>
                Modifica
              </Btn>
              {r.is_active && (
                <Btn variant="chip" tone="red" size="sm" onClick={handleDisattiva}>
                  Disattiva
                </Btn>
              )}
            </div>
          </div>

          {/* 4 KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <Kpi
              label="Costo totale"
              value={r.total_cost != null ? `${r.total_cost.toFixed(2)} €` : "—"}
            />
            <Kpi
              label={`Costo / ${r.yield_unit || "unità"}`}
              value={r.cost_per_unit != null ? `${r.cost_per_unit.toFixed(2)} €` : "—"}
            />
            <Kpi
              label="Prezzo vendita"
              value={r.selling_price != null ? `${r.selling_price.toFixed(2)} €` : "—"}
            />
            <Kpi
              label="Food Cost"
              value={<FcBadge pct={r.food_cost_pct} />}
            />
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mt-4 border-b border-neutral-200 overflow-x-auto -mb-1">
            {TABS.map((t) => {
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-3 md:px-4 py-2 text-xs md:text-sm font-medium whitespace-nowrap transition ${
                    active
                      ? "text-orange-900 border-b-2 border-orange-500 -mb-px"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══ TAB CONTENT ═══ */}
        <div className="px-4 md:px-6 py-5">
          {activeTab === "composizione" && (
            <CompositionTab r={r} ricalcolaAllergeni={ricalcolaAllergeni} recalcLoading={recalcLoading} />
          )}
          {activeTab === "servizi" && <ServiziTab r={r} />}
          {activeTab === "note" && <NoteTab r={r} />}
          {activeTab === "storico" && (
            <StoricoTab
              r={r}
              storico={storico}
              storicoLoading={storicoLoading}
              storicoFinestra={storicoFinestra}
              setStoricoFinestra={setStoricoFinestra}
              onReload={loadStorico}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// TAB: Composizione (allergeni + tabella ingredienti)
// ─────────────────────────────────────────
function CompositionTab({ r, ricalcolaAllergeni, recalcLoading }) {
  return (
    <div className="space-y-6">
      {/* Allergeni (Modulo C, calcolati ricorsivamente) */}
      <div className="bg-amber-50/40 border border-amber-200 rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-amber-900 flex items-center gap-2">
              ⚠️ Allergeni
            </h2>
            <p className="text-xs text-neutral-600 mt-0.5">
              Calcolati ricorsivamente da ingredienti e sub-ricette. Si aggiornano al salvataggio.
            </p>
          </div>
          <Btn variant="secondary" size="sm" onClick={ricalcolaAllergeni} loading={recalcLoading}>
            {recalcLoading ? "Ricalcolo…" : "↻ Ricalcola"}
          </Btn>
        </div>
        {r.allergeni_calcolati ? (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {r.allergeni_calcolati.split(",").filter(Boolean).map((a) => (
              <AllergeneBadge key={a} name={a.trim()} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500 italic mt-2">
            Nessun allergene rilevato dagli ingredienti dichiarati.
            {r.items.length === 0 && " (Aggiungi gli ingredienti per popolare il calcolo.)"}
          </p>
        )}
      </div>

      {/* Tabella composizione */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-3">
          Ingredienti ({r.items.length})
        </h2>
        {r.items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center text-sm text-neutral-500">
            Nessun ingrediente collegato. Modifica la ricetta per aggiungerli.
          </div>
        ) : (
          <div className="border border-neutral-200 rounded-2xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-100 text-neutral-700">
                  <tr>
                    <th className="p-3 text-left font-semibold">#</th>
                    <th className="p-3 text-left font-semibold">Ingrediente / Sub-ricetta</th>
                    <th className="p-3 text-right font-semibold">Q.tà</th>
                    <th className="p-3 text-left font-semibold">Unità</th>
                    <th className="p-3 text-right font-semibold">Costo unit.</th>
                    <th className="p-3 text-right font-semibold">Costo riga</th>
                    <th className="p-3 text-left font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={`border-t border-neutral-100 ${item.sub_recipe_id ? "bg-blue-50/30 hover:bg-blue-50/60" : "hover:bg-neutral-50"} transition`}
                    >
                      <td className="p-3 text-neutral-500">{idx + 1}</td>
                      <td className="p-3 font-medium text-neutral-900">
                        {item.sub_recipe_id ? (
                          <Link
                            to={`/ricette/${item.sub_recipe_id}`}
                            className="flex items-center gap-2 group"
                            title="Apri sub-ricetta"
                          >
                            <span className="text-xs bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded font-bold">SUB</span>
                            <span className="group-hover:text-blue-700 group-hover:underline transition">
                              {item.sub_recipe_name || `Ricetta #${item.sub_recipe_id}`}
                            </span>
                            <span className="text-blue-500 opacity-0 group-hover:opacity-100 transition text-xs">→</span>
                          </Link>
                        ) : item.ingredient_id ? (
                          <Link
                            to={`/ricette/ingredienti/${item.ingredient_id}/prezzi`}
                            className="hover:text-orange-700 hover:underline transition"
                            title="Apri storico prezzi ingrediente"
                          >
                            {item.ingredient_name || `Ing. #${item.ingredient_id}`}
                          </Link>
                        ) : (
                          <span className="text-neutral-400 italic">{item.ingredient_name || "—"}</span>
                        )}
                      </td>
                      <td className="p-3 text-right">{item.qty}</td>
                      <td className="p-3 text-neutral-600">{item.unit}</td>
                      <td className="p-3 text-right text-neutral-600">
                        {item.unit_cost != null ? `${item.unit_cost.toFixed(4)} €` : "—"}
                      </td>
                      <td className="p-3 text-right font-semibold">
                        {item.line_cost != null ? `${item.line_cost.toFixed(2)} €` : "—"}
                      </td>
                      <td className="p-3 text-neutral-500 text-xs">{item.note || ""}</td>
                    </tr>
                  ))}
                </tbody>
                {r.total_cost != null && (
                  <tfoot className="bg-orange-50 border-t-2 border-orange-300">
                    <tr>
                      <td colSpan={5} className="p-3 text-right font-semibold text-orange-900">
                        TOTALE
                      </td>
                      <td className="p-3 text-right font-bold text-orange-900 text-base">
                        {r.total_cost.toFixed(2)} €
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// TAB: Servizi (tipi servizio collegati)
// ─────────────────────────────────────────
function ServiziTab({ r }) {
  const services = r.service_types || [];
  if (services.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center">
        <div className="text-3xl mb-2">🍽️</div>
        <p className="text-sm text-neutral-700 font-medium mb-1">Nessun tipo servizio collegato</p>
        <p className="text-xs text-neutral-500 mb-3">
          La ricetta non è associata ad alcun contesto di servizio (Alla carta, Banchetto, Pranzo lavoro, Aperitivo…).
        </p>
        <Link to={`/ricette/modifica/${r.id}`} className="text-xs text-orange-700 hover:underline font-medium">
          Modifica ricetta per assegnare servizi →
        </Link>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-3">
        Tipi servizio ({services.length})
      </h2>
      <p className="text-xs text-neutral-600 mb-3">
        La ricetta è disponibile per i seguenti contesti. Configurabili da Impostazioni Cucina → Tipi Servizio.
      </p>
      <div className="flex flex-wrap gap-2">
        {services.map((st) => (
          <span
            key={st.id}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-900 border border-orange-200 text-sm"
          >
            🍽️ {st.name}
            {!st.active && (
              <span className="text-[10px] uppercase text-neutral-500 ml-1">(disattivo)</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// TAB: Note (interne + menu_name + menu_description)
// ─────────────────────────────────────────
function NoteTab({ r }) {
  const hasContent = r.note || r.menu_name || r.menu_description;
  if (!hasContent) {
    return (
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center text-sm text-neutral-500">
        Nessuna nota o descrizione. Modifica la ricetta per aggiungerle.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {r.note && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-3">
            Note interne (cucina)
          </h2>
          <p className="text-sm text-neutral-800 whitespace-pre-wrap">{r.note}</p>
        </div>
      )}

      {r.menu_name && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-3">
            Nome menu (per stampa cliente)
          </h2>
          <p className="text-base text-neutral-800 italic font-playfair">"{r.menu_name}"</p>
        </div>
      )}

      {r.menu_description && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-3">
            Descrizione menu (per stampa cliente)
          </h2>
          <p className="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">{r.menu_description}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// TAB: Storico (grafico FC + audit metadati)
// ─────────────────────────────────────────
function StoricoTab({ r, storico, storicoLoading, storicoFinestra, setStoricoFinestra, onReload }) {
  const datiGrafico = (storico?.snapshots || []).map((s) => ({
    label: s.label,
    fc: s.food_cost_pct,
    cost: s.cost_per_unit,
    completezza: s.completezza_pct,
  }));
  const haDati = datiGrafico.some((d) => d.fc != null);
  const delta30 = storico?.delta_30gg;
  const delta90 = storico?.delta_90gg;

  const finestreLabel = { 90: "3 mesi", 180: "6 mesi", 365: "1 anno" };

  return (
    <div className="space-y-4">
      {/* GRAFICO STORICO FOOD COST (Modulo F.2) */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5">
        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700">
              📈 Storico Food Cost
            </h2>
            <p className="text-[11px] text-neutral-600">
              FC% ricostruito retroattivamente dai prezzi storici degli ingredienti.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={storicoFinestra}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setStoricoFinestra(v);
                onReload(v);
              }}
              className="border border-neutral-300 rounded-lg px-2 py-1 text-xs bg-white"
            >
              {Object.entries(finestreLabel).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
            <button
              onClick={() => onReload()}
              className="text-xs text-orange-700 hover:text-orange-900 underline"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Delta KPI */}
        {(delta30 || delta90) && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {delta30 && <DeltaKpi label="Δ 30 giorni" delta={delta30} />}
            {delta90 && <DeltaKpi label="Δ 90 giorni" delta={delta90} />}
          </div>
        )}

        {/* Grafico Recharts */}
        {storicoLoading ? (
          <div className="h-64 flex items-center justify-center text-sm text-neutral-500">
            Calcolo storico FC…
          </div>
        ) : !haDati ? (
          <div className="h-64 flex flex-col items-center justify-center text-sm text-neutral-500 border border-dashed border-neutral-300 rounded-lg">
            <p className="mb-1">📊 Storico non disponibile</p>
            <p className="text-xs text-neutral-400 max-w-md text-center">
              Per ricostruire lo storico FC serve almeno un prezzo per ogni ingrediente nella finestra temporale.
              I prezzi si popolano automaticamente dal matching delle fatture XML.
            </p>
          </div>
        ) : (
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={datiGrafico} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  label={{ value: "FC %", angle: -90, position: "insideLeft", fontSize: 11 }}
                />
                <RechartsTooltip
                  formatter={(value, name) => {
                    if (name === "fc") return [value != null ? `${value.toFixed(1)}%` : "n/d", "Food Cost"];
                    if (name === "cost") return [value != null ? `${value.toFixed(2)} €` : "n/d", "Costo unit."];
                    return [value, name];
                  }}
                />
                <ReferenceLine y={30} stroke="#10b981" strokeDasharray="4 4" label={{ value: "30%", fontSize: 10, fill: "#10b981" }} />
                <ReferenceLine y={45} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "45%", fontSize: 10, fill: "#ef4444" }} />
                <Line
                  type="monotone"
                  dataKey="fc"
                  stroke="#2E7BE8"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#2E7BE8" }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                  name="fc"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {haDati && (
          <p className="text-[10px] text-neutral-400 mt-2">
            Linea verde: soglia FC buono (30%). Linea rossa: soglia critica (45%).
            Punti mancanti = ingredienti senza prezzo nel periodo.
          </p>
        )}
      </div>

      {/* AUDIT & METADATI */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-4">
          Audit & metadati
        </h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4 text-sm">
          <div>
            <dt className="text-[11px] text-neutral-500 uppercase tracking-wide">ID interno</dt>
            <dd className="text-neutral-800 font-mono text-xs mt-0.5">R{String(r.id).padStart(3, "0")}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-neutral-500 uppercase tracking-wide">Tipo</dt>
            <dd className="text-neutral-800 mt-0.5">{r.kind || (r.is_base ? "base" : "dish")}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-neutral-500 uppercase tracking-wide">Stato</dt>
            <dd className="text-neutral-800 mt-0.5">{r.is_active ? "Attiva" : "Disattivata"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-neutral-500 uppercase tracking-wide">Categoria</dt>
            <dd className="text-neutral-800 mt-0.5">{r.category_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-neutral-500 uppercase tracking-wide">Creata il</dt>
            <dd className="text-neutral-800 font-mono text-xs mt-0.5">{r.created_at || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-neutral-500 uppercase tracking-wide">Ultimo aggiornamento</dt>
            <dd className="text-neutral-800 font-mono text-xs mt-0.5">{r.updated_at || "—"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function DeltaKpi({ label, delta }) {
  const positivo = delta.delta_pct > 0;
  const alert = delta.alert;
  const bg = alert ? "bg-red-50 border-red-300" : positivo ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200";
  const txt = alert ? "text-red-800" : positivo ? "text-amber-800" : "text-green-800";
  const arrow = positivo ? "↑" : delta.delta_pct < 0 ? "↓" : "→";
  return (
    <div className={`border rounded-lg px-3 py-2 ${bg}`}>
      <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className={`text-base font-bold ${txt}`}>
        {arrow} {Math.abs(delta.delta_pct).toFixed(1)}%
        {alert && <span className="text-[10px] ml-2 font-normal">⚠ Alert</span>}
      </div>
      <div className="text-[10px] text-neutral-500">
        {delta.prima.toFixed(1)}% → {delta.dopo.toFixed(1)}%
      </div>
    </div>
  );
}
