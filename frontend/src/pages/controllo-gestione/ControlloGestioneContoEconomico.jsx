// @version: v1.1 — G.3 Fase C, 2026-05-16
// Conto Economico Completo: Ricavi → Costo merce → Margine lordo →
// Costi operativi (per categoria) → Utile Netto. Toggle Competenza/Cassa.
//
// v1.1 (2026-05-16): drill-down 3 livelli (cat → sottocat → righe singole)
//   + percentuali Costo Merce / Costi Operativi sui RICAVI (convenzione
//   ristorazione: food cost % = costo merce / ricavi, NON sulle spese).
//   + click su una riga apre la pagina dettaglio (fattura / spesa fissa /
//   buste paga) per andare a sistemarla.
//
// Decisioni di prodotto (Marco 2026-05-14): imponibile no IVA, stipendi solo
// netto v1 (v1.1 lordo+contributi+TFR), TD04/autofatture escluse, cassa v1.1.
// Vedi docs/roadmap.md §G.3, app/services/conto_economico.py.

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ControlloGestioneNav from "./ControlloGestioneNav";
import TrgbLoader from "../../components/TrgbLoader";
import { EmptyState } from "../../components/ui";

const CG = `${API_BASE}/controllo-gestione`;

// ── Formatters ──────────────────────────────────────────────────
const fmtEur = (n) => {
  if (n == null) return "—";
  return `€ ${Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
};

const fmtPct = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

const MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

// Colore semantico per categoria (UI breakdown costi operativi)
const CATEGORIA_COLORE = {
  "STAFF":             "purple",
  "AMMINISTRATORI":    "violet",
  "AFFITTI":           "amber",
  "UTENZE":            "yellow",
  "SERVIZI":           "blue",
  "ATTREZZATURE":      "slate",
  "MANUTENZIONE":      "stone",
  "TASSE E IMPOSTE":   "red",
  "ASSICURAZIONI":     "pink",
  "FINANZIARI":        "indigo",
  "Non categorizzato": "neutral",
};

// ─────────────────────────────────────────────────────────────────
export default function ControlloGestioneContoEconomico() {
  const navigate = useNavigate();
  const oggi = new Date();
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth() + 1);
  const [modalita, setModalita] = useState("competenza");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Espansione tabella: set di categorie aperte
  const [expandedCat, setExpandedCat] = useState(new Set());
  // Espansione 3° livello: set di "<categoria>::<sottocategoria>" aperti
  const [expandedSub, setExpandedSub] = useState(new Set());

  useEffect(() => { load(); }, [anno, mese, modalita]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const url = `${CG}/conto-economico?anno=${anno}&mese=${mese}&modalita=${modalita}`;
      const r = await apiFetch(url);
      if (!r.ok) throw new Error(`Errore caricamento (HTTP ${r.status})`);
      setData(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCat = (catNome) => {
    setExpandedCat((prev) => {
      const next = new Set(prev);
      if (next.has(catNome)) next.delete(catNome);
      else next.add(catNome);
      return next;
    });
  };

  const toggleSub = (catNome, subNome) => {
    const key = `${catNome}::${subNome}`;
    setExpandedSub((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Sub-component: KPI hero card ──────────────────────────────
  const KpiHero = ({ label, value, sub, color = "sky", emphasis = false }) => (
    <div
      className={`rounded-2xl border p-5 transition ${
        emphasis
          ? `border-${color}-400 bg-${color}-100 shadow-lg`
          : `border-${color}-200 bg-${color}-50`
      }`}
    >
      <div className={`text-xs uppercase tracking-wider font-semibold mb-1 text-${color}-700`}>
        {label}
      </div>
      <div className={`font-bold text-${color}-900 ${emphasis ? "text-3xl" : "text-2xl"}`}>
        {value}
      </div>
      {sub != null && (
        <div className={`text-xs mt-1 text-${color}-600`}>{sub}</div>
      )}
    </div>
  );

  // ── Loading / error / empty ──────────────────────────────────
  if (loading && !data) {
    return (
      <div className="min-h-screen bg-brand-cream">
        <ControlloGestioneNav current="conto-economico" />
        <TrgbLoader size={48} label="Calcolo Conto Economico…"
                    className="max-w-7xl mx-auto mt-4 py-20" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-brand-cream">
        <ControlloGestioneNav current="conto-economico" />
        <div className="max-w-7xl mx-auto mt-4 text-center py-20 text-red-600">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const ricavi = data.ricavi?.totale || 0;
  const costoMerce = data.costo_merce?.totale || 0;
  const costoMercePctRicavi = data.costo_merce?.pct_su_ricavi;
  const margineLordo = data.margine_lordo || 0;
  const marginePct = data.margine_lordo_pct;
  const costiOp = data.costi_operativi?.totale || 0;
  const costiOpPctRicavi = data.costi_operativi?.pct_su_ricavi;
  const totaleSpese = data.totale_spese || 0;
  const utileNetto = data.utile_netto || 0;
  const utilePct = data.utile_netto_pct;
  const warnings = data._meta?.warnings || [];

  const isUtilePositivo = utileNetto > 0;

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-brand-cream pb-20">
      <ControlloGestioneNav current="conto-economico" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* HEADER: titolo + selettori periodo + toggle modalità */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-sky-900 font-playfair">
              💼 Conto Economico
            </h1>
            <div className="text-sm text-neutral-600 mt-0.5">
              {data.periodo_label} — modalità{" "}
              <span className="font-medium text-sky-700">
                {data.modalita === "competenza" ? "competenza" : "cassa"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle modalità */}
            <div className="flex bg-white rounded-lg border border-sky-300 overflow-hidden">
              {["competenza", "cassa"].map((m) => (
                <button
                  key={m}
                  onClick={() => setModalita(m)}
                  className={`px-3 py-1.5 text-xs font-medium transition ${
                    modalita === m
                      ? "bg-sky-100 text-sky-900"
                      : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {m === "competenza" ? "Competenza" : "Cassa"}
                </button>
              ))}
            </div>

            <select
              value={mese}
              onChange={(e) => setMese(+e.target.value)}
              className="border border-sky-300 rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              {MESI.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>

            <select
              value={anno}
              onChange={(e) => setAnno(+e.target.value)}
              className="border border-sky-300 rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              {[...Array(6)].map((_, i) => {
                const y = oggi.getFullYear() - 3 + i;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
        </div>

        {/* WARNING BANNER (se _meta.warnings non vuoto) */}
        {warnings.length > 0 && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1">
              ⚠ Note
            </div>
            <ul className="text-sm text-amber-700 space-y-1">
              {warnings.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          </div>
        )}

        {/* KPI HERO — 3 card primarie */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <KpiHero
            label="Ricavi"
            value={fmtEur(ricavi)}
            sub={`Corrispettivi ${data.periodo_label}`}
            color="emerald"
          />
          <KpiHero
            label="Margine Lordo"
            value={fmtEur(margineLordo)}
            sub={marginePct != null ? `${marginePct.toFixed(1)}% sui ricavi` : null}
            color="sky"
          />
          <KpiHero
            label="Utile Netto"
            value={fmtEur(utileNetto)}
            sub={utilePct != null ? `${utilePct.toFixed(1)}% sui ricavi` : null}
            color={isUtilePositivo ? "violet" : "red"}
            emphasis
          />
        </div>

        {/* WATERFALL — step della catena P&L (tabellare elegante) */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50">
            <h2 className="text-sm font-bold text-neutral-700 uppercase tracking-wider">
              Catena del Conto Economico
            </h2>
          </div>
          <div className="divide-y divide-neutral-100">

            {/* Ricavi (positivo, verde) */}
            <WaterfallRow label="Ricavi" value={ricavi}
                          color="emerald" tipo="ricavo" />

            {/* - Costo merce (negativo, rosso scuro) */}
            <WaterfallRow label="Costo merce" value={-costoMerce}
                          color="red" tipo="costo"
                          detail={`${data.costo_merce?.per_categoria?.length || 0} categorie · food cost`}
                          pct={costoMercePctRicavi} />

            {/* = Margine lordo (subtotale, sky) */}
            <WaterfallRow label="Margine Lordo" value={margineLordo}
                          color="sky" tipo="subtotale"
                          pct={marginePct} />

            {/* - Costi operativi (negativo, ambra) */}
            <WaterfallRow label="Costi operativi" value={-costiOp}
                          color="amber" tipo="costo"
                          detail={`${data.costi_operativi?.per_categoria?.length || 0} categorie`}
                          pct={costiOpPctRicavi} />

            {/* = Utile Netto (totale, viola/rosso) */}
            <WaterfallRow label="Utile Netto" value={utileNetto}
                          color={isUtilePositivo ? "violet" : "red"}
                          tipo="totale"
                          pct={utilePct} />
          </div>
        </div>

        {/* RIPARTIZIONE DEI RICAVI: barra orizzontale (costo merce · costi op · utile) */}
        {ricavi > 0 && (
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-bold text-neutral-700 uppercase tracking-wider">
                Ripartizione dei ricavi
              </h2>
              <div className="text-sm font-mono text-neutral-700">
                € {ricavi.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="px-5 py-4">
              {utileNetto >= 0 ? (
                // Caso normale: 3 fette (merce + op + utile) = 100% dei ricavi
                <div className="flex h-7 rounded-md overflow-hidden border border-neutral-200">
                  <div className="bg-red-400 flex items-center justify-center text-xs font-semibold text-white"
                       style={{ width: `${costoMercePctRicavi || 0}%` }}
                       title={`Costo merce: ${fmtEur(costoMerce)}`}>
                    {costoMercePctRicavi != null && costoMercePctRicavi >= 8 && `${costoMercePctRicavi.toFixed(1)}%`}
                  </div>
                  <div className="bg-amber-400 flex items-center justify-center text-xs font-semibold text-white"
                       style={{ width: `${costiOpPctRicavi || 0}%` }}
                       title={`Costi operativi: ${fmtEur(costiOp)}`}>
                    {costiOpPctRicavi != null && costiOpPctRicavi >= 8 && `${costiOpPctRicavi.toFixed(1)}%`}
                  </div>
                  <div className="bg-violet-400 flex items-center justify-center text-xs font-semibold text-white"
                       style={{ width: `${utilePct || 0}%` }}
                       title={`Utile netto: ${fmtEur(utileNetto)}`}>
                    {utilePct != null && utilePct >= 8 && `${utilePct.toFixed(1)}%`}
                  </div>
                </div>
              ) : (
                // Caso perdita: spese > ricavi. Mostro 2 fette + nota
                <div>
                  <div className="flex h-7 rounded-md overflow-hidden border border-red-200">
                    <div className="bg-red-400 flex items-center justify-center text-xs font-semibold text-white"
                         style={{ width: `${Math.min(100, costoMercePctRicavi || 0)}%` }}
                         title={`Costo merce: ${fmtEur(costoMerce)}`}>
                      {costoMercePctRicavi >= 8 && `${costoMercePctRicavi.toFixed(1)}%`}
                    </div>
                    <div className="bg-amber-400 flex items-center justify-center text-xs font-semibold text-white"
                         style={{ width: `${Math.min(100 - (costoMercePctRicavi || 0), costiOpPctRicavi || 0)}%` }}
                         title={`Costi operativi: ${fmtEur(costiOp)}`}>
                      {costiOpPctRicavi >= 8 && `${costiOpPctRicavi.toFixed(1)}%`}
                    </div>
                  </div>
                  <div className="text-xs text-red-700 mt-2 font-medium">
                    ⚠ Perdita del mese: {fmtEur(-utileNetto)} ({utilePct != null && `${Math.abs(utilePct).toFixed(1)}% dei ricavi`})
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-xs mt-2 text-neutral-600">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block"></span>
                  Costo merce {costoMercePctRicavi != null && <span className="text-neutral-400">({costoMercePctRicavi.toFixed(1)}%)</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block"></span>
                  Costi operativi {costiOpPctRicavi != null && <span className="text-neutral-400">({costiOpPctRicavi.toFixed(1)}%)</span>}
                </div>
                {utileNetto >= 0 && utilePct != null && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-violet-400 inline-block"></span>
                    Utile netto <span className="text-neutral-400">({utilePct.toFixed(1)}%)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* COSTO MERCE: breakdown per categoria/sottocategoria/righe */}
        {costoMerce > 0 && (
          <CategoriaBreakdown
            titolo="Costo merce (food cost)"
            icona="🥩"
            colore="red"
            categorie={data.costo_merce?.per_categoria || []}
            totale={costoMerce}
            pctSulRicavi={costoMercePctRicavi}
            expanded={expandedCat}
            toggle={toggleCat}
            expandedSub={expandedSub}
            toggleSub={toggleSub}
          />
        )}

        {/* COSTI OPERATIVI: breakdown per categoria/sottocategoria/righe */}
        {costiOp > 0 && (
          <CategoriaBreakdown
            titolo="Costi operativi"
            icona="📋"
            colore="amber"
            categorie={data.costi_operativi?.per_categoria || []}
            totale={costiOp}
            pctSulRicavi={costiOpPctRicavi}
            expanded={expandedCat}
            toggle={toggleCat}
            expandedSub={expandedSub}
            toggleSub={toggleSub}
          />
        )}

        {/* META: conteggi (per debug/trasparenza) */}
        <div className="text-xs text-neutral-400 text-center mt-4">
          Fonti aggregate: {data._meta?.fatture_count || 0} fatture acquisti
          {", "}{data._meta?.spese_fisse_count || 0} spese fisse
          {", "}{data._meta?.stipendi_count || 0} stipendi
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SUB-COMPONENT: riga della catena waterfall
// ─────────────────────────────────────────────────────────────────
function WaterfallRow({ label, value, color, tipo, detail, pct }) {
  const isPositivo = value >= 0;
  const isSubtotale = tipo === "subtotale" || tipo === "totale";
  const isCosto = tipo === "costo";

  const sign = isCosto ? "−" : isSubtotale ? "=" : "+";
  const valoreAssoluto = Math.abs(value);

  return (
    <div className={`flex items-center justify-between px-5 py-3.5 ${
      isSubtotale ? `bg-${color}-50` : "bg-white"
    }`}>
      <div className="flex items-center gap-3">
        <span className={`text-lg font-bold text-${color}-700 w-6 text-center`}>
          {sign}
        </span>
        <div>
          <div className={`font-semibold ${isSubtotale ? `text-${color}-900 text-base` : "text-neutral-700 text-sm"}`}>
            {label}
          </div>
          {detail && <div className="text-xs text-neutral-500 mt-0.5">{detail}</div>}
        </div>
      </div>
      <div className="text-right">
        <div className={`font-mono font-bold ${
          isSubtotale ? `text-${color}-900 text-xl` :
          isPositivo ? `text-${color}-700 text-base` :
                       `text-${color}-700 text-base`
        }`}>
          {(isCosto ? "− " : "") + `€ ${valoreAssoluto.toLocaleString("it-IT", {
            minimumFractionDigits: 2, maximumFractionDigits: 2,
          })}`}
        </div>
        {pct != null && (
          <div className={`text-xs font-medium text-${color}-600 mt-0.5`}>
            {pct.toFixed(1)}% dei ricavi
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SUB-COMPONENT: breakdown 3 livelli (categoria → sottocat → righe)
// ─────────────────────────────────────────────────────────────────
function CategoriaBreakdown({ titolo, icona, colore, categorie, totale,
                              pctSulRicavi,
                              expanded, toggle, expandedSub, toggleSub }) {
  if (!categorie || categorie.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
      <div className={`px-5 py-3 border-b border-neutral-200 bg-${colore}-50 flex items-center justify-between flex-wrap gap-2`}>
        <h2 className={`text-sm font-bold text-${colore}-900 uppercase tracking-wider`}>
          {icona} {titolo}
        </h2>
        <div className={`text-sm font-mono font-bold text-${colore}-900`}>
          € {totale.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          {pctSulRicavi != null && (
            <span className={`ml-2 text-xs font-medium text-${colore}-700`}>
              · {pctSulRicavi.toFixed(1)}% dei ricavi
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-neutral-100">
        {categorie.map((cat) => {
          const isOpen = expanded.has(cat.categoria);
          const catColor = CATEGORIA_COLORE[cat.categoria] || "neutral";
          const pctSulTotale = totale > 0 ? (cat.importo / totale) * 100 : 0;
          const numRighe = cat.num ?? (cat.sottocategorie || []).reduce((s, x) => s + (x.num || 0), 0);

          return (
            <div key={cat.categoria}>
              <button
                onClick={() => toggle(cat.categoria)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-neutral-50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs w-5 h-5 rounded-full bg-${catColor}-100 text-${catColor}-700 flex items-center justify-center transition-transform ${
                    isOpen ? "rotate-90" : ""
                  }`}>
                    ▶
                  </span>
                  <div className="text-left">
                    <div className="font-semibold text-sm text-neutral-800">
                      {cat.categoria}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {cat.sottocategorie?.length || 0} sottocat · {numRighe} voci · {pctSulTotale.toFixed(1)}% del blocco
                    </div>
                  </div>
                </div>
                <div className="font-mono font-bold text-sm text-neutral-800">
                  € {cat.importo.toLocaleString("it-IT", {
                    minimumFractionDigits: 2, maximumFractionDigits: 2,
                  })}
                </div>
              </button>

              {/* Sottocategorie espanse */}
              {isOpen && (
                <div className="bg-neutral-50 border-t border-neutral-100 divide-y divide-neutral-200">
                  {cat.sottocategorie?.map((sub, i) => {
                    const subKey = `${cat.categoria}::${sub.nome}`;
                    const isSubOpen = expandedSub?.has(subKey);
                    const hasRighe = (sub.righe || []).length > 0;
                    return (
                      <div key={i}>
                        <button
                          onClick={() => hasRighe && toggleSub(cat.categoria, sub.nome)}
                          className={`w-full flex items-center justify-between pl-10 pr-5 py-2 text-left ${
                            hasRighe ? "hover:bg-neutral-100 cursor-pointer" : "cursor-default"
                          } transition`}
                        >
                          <div className="flex items-center gap-2 text-sm text-neutral-700">
                            {hasRighe ? (
                              <span className={`text-[10px] w-4 h-4 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center transition-transform ${
                                isSubOpen ? "rotate-90" : ""
                              }`}>
                                ▶
                              </span>
                            ) : (
                              <span className="w-4 h-4 inline-block" />
                            )}
                            <span className="font-medium">{sub.nome}</span>
                            {sub.num > 0 && (
                              <span className="text-xs text-neutral-400">
                                ({sub.num} {sub.num === 1 ? "voce" : "voci"})
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-sm text-neutral-700">
                            € {sub.importo.toLocaleString("it-IT", {
                              minimumFractionDigits: 2, maximumFractionDigits: 2,
                            })}
                          </div>
                        </button>

                        {/* Righe singole (livello 3) */}
                        {isSubOpen && hasRighe && (
                          <div className="bg-white border-t border-neutral-200 divide-y divide-neutral-100">
                            {sub.righe.map((r, j) => (
                              <RigaDettaglio key={j} riga={r} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SUB-COMPONENT: riga di dettaglio (3° livello)
// ─────────────────────────────────────────────────────────────────
const TIPO_RIGA_LABEL = {
  fattura: { label: "Fattura", color: "text-blue-700 bg-blue-50 border-blue-200" },
  spesa_fissa: { label: "Spesa fissa", color: "text-amber-700 bg-amber-50 border-amber-200" },
  stipendio: { label: "Stipendio", color: "text-green-700 bg-green-50 border-green-200" },
};

function RigaDettaglio({ riga }) {
  const navigate = useNavigate();
  const meta = TIPO_RIGA_LABEL[riga.tipo_riga] || {
    label: "Altro", color: "text-neutral-700 bg-neutral-50 border-neutral-200"
  };
  const dataFmt = riga.data
    ? new Date(riga.data + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short" })
    : "—";

  // Deep-link a seconda della fonte della riga.
  //  - fattura: pagina dettaglio fattura acquisti (route /acquisti/dettaglio/:id)
  //  - spesa_fissa: lista Spese Fisse con highlight (cg_spese_fisse.id)
  //  - stipendio: lista Buste Paga del mese
  let target = null;
  if (riga.tipo_riga === "fattura" && riga.id) {
    target = `/acquisti/dettaglio/${riga.id}`;
  } else if (riga.tipo_riga === "spesa_fissa" && riga.spesa_fissa_id) {
    target = `/controllo-gestione/spese-fisse?highlight=${riga.spesa_fissa_id}`;
  } else if (riga.tipo_riga === "stipendio") {
    target = `/dipendenti/buste-paga`;
  }
  const clickable = !!target;

  const go = () => { if (target) navigate(target); };

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? go : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter") go(); } : undefined}
      className={`flex items-center justify-between pl-16 pr-5 py-2 transition ${
        clickable ? "hover:bg-sky-50 cursor-pointer" : "hover:bg-neutral-50"
      }`}
      title={clickable ? "Apri per modificare" : undefined}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ${meta.color}`}>
          {meta.label}
        </span>
        <span className="shrink-0 text-xs text-neutral-500 font-mono w-14">{dataFmt}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-neutral-800 truncate flex items-center gap-1.5">
            {riga.ref}
            {clickable && (
              <span className="text-neutral-400 text-xs" aria-hidden>↗</span>
            )}
          </div>
          <div className="text-xs text-neutral-500 truncate">{riga.descrizione}</div>
        </div>
      </div>
      <div className="shrink-0 font-mono text-sm text-neutral-800 ml-3">
        € {riga.importo.toLocaleString("it-IT", {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        })}
      </div>
    </div>
  );
}
