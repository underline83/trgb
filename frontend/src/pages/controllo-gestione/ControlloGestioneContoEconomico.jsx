// @version: v1.0 — G.3 Fase C, 2026-05-14
// Conto Economico Completo: Ricavi → Costo merce → Margine lordo →
// Costi operativi (per categoria) → Utile Netto. Toggle Competenza/Cassa.
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
  const margineLordo = data.margine_lordo || 0;
  const marginePct = data.margine_lordo_pct;
  const costiOp = data.costi_operativi?.totale || 0;
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
                          detail={`${data.costo_merce?.per_categoria?.length || 0} categorie`} />

            {/* = Margine lordo (subtotale, sky) */}
            <WaterfallRow label="Margine Lordo" value={margineLordo}
                          color="sky" tipo="subtotale"
                          pct={marginePct} />

            {/* - Costi operativi (negativo, ambra) */}
            <WaterfallRow label="Costi operativi" value={-costiOp}
                          color="amber" tipo="costo"
                          detail={`${data.costi_operativi?.per_categoria?.length || 0} categorie`} />

            {/* = Utile Netto (totale, viola/rosso) */}
            <WaterfallRow label="Utile Netto" value={utileNetto}
                          color={isUtilePositivo ? "violet" : "red"}
                          tipo="totale"
                          pct={utilePct} />
          </div>
        </div>

        {/* COSTO MERCE: breakdown per categoria/sottocategoria */}
        {costoMerce > 0 && (
          <CategoriaBreakdown
            titolo="Costo merce (food cost)"
            icona="🥩"
            colore="red"
            categorie={data.costo_merce?.per_categoria || []}
            totale={costoMerce}
            expanded={expandedCat}
            toggle={toggleCat}
          />
        )}

        {/* COSTI OPERATIVI: breakdown per categoria/sottocategoria */}
        {costiOp > 0 && (
          <CategoriaBreakdown
            titolo="Costi operativi"
            icona="📋"
            colore="amber"
            categorie={data.costi_operativi?.per_categoria || []}
            totale={costiOp}
            expanded={expandedCat}
            toggle={toggleCat}
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
// SUB-COMPONENT: breakdown per categoria con sottocategorie espandibili
// ─────────────────────────────────────────────────────────────────
function CategoriaBreakdown({ titolo, icona, colore, categorie, totale, expanded, toggle }) {
  if (!categorie || categorie.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
      <div className={`px-5 py-3 border-b border-neutral-200 bg-${colore}-50`}>
        <h2 className={`text-sm font-bold text-${colore}-900 uppercase tracking-wider`}>
          {icona} {titolo} — € {totale.toLocaleString("it-IT", {
            minimumFractionDigits: 2, maximumFractionDigits: 2,
          })}
        </h2>
      </div>
      <div className="divide-y divide-neutral-100">
        {categorie.map((cat) => {
          const isOpen = expanded.has(cat.categoria);
          const catColor = CATEGORIA_COLORE[cat.categoria] || "neutral";
          const pctSulTotale = totale > 0 ? (cat.importo / totale) * 100 : 0;

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
                      {cat.sottocategorie?.length || 0} sottocategorie · {pctSulTotale.toFixed(1)}% del totale
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
                  {cat.sottocategorie?.map((sub, i) => (
                    <div key={i} className="flex items-center justify-between pl-14 pr-5 py-2">
                      <div className="text-sm text-neutral-700">
                        {sub.nome}
                        {sub.num > 0 && (
                          <span className="text-xs text-neutral-400 ml-2">
                            ({sub.num})
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-sm text-neutral-700">
                        € {sub.importo.toLocaleString("it-IT", {
                          minimumFractionDigits: 2, maximumFractionDigits: 2,
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
