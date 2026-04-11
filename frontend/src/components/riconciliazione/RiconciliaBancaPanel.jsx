// @version: v1.0-riconcilia-banca-panel
// Pannello riutilizzabile per riconciliare UNA cg_uscita a un movimento bancario.
// Usato in tre contesti:
//   1. Modale "Cerca banca" nel piano rate spese fisse (prestiti + storico)
//   2. Pane destro del workbench split-pane in ControlloGestioneRiconciliazione
//   3. Modale di sostituzione del vecchio modaleBanca nello scadenzario uscite
//
// Due tab:
//   🎯 Auto    → GET /controllo-gestione/uscite/{id}/candidati-banca   (matching automatico ±10% importo, ±15gg)
//   🔍 Ricerca → GET /controllo-gestione/uscite/{id}/ricerca-banca     (filtri liberi: testo, data, importo)
//
// Collega: POST /controllo-gestione/uscite/{id}/riconcilia { banca_movimento_id }
//
// Props:
//   uscitaId      : number (obbligatorio)
//   contextLabel  : string — testo sopra i candidati (es: "PESCE FRESCO · € 892 · 18/03/2026")
//   dataRif       : YYYY-MM-DD opzionale (prefill ricerca libera ±60gg)
//   importo       : float opzionale (prefill ricerca libera ±30%)
//   onLinked      : (mov_id) => void chiamato dopo successo collegamento
//   onClose       : () => void opzionale (solo se usato dentro modale)
//   compact       : bool — layout più denso per embedding in split-pane

import React, { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";

const CG = `${API_BASE}/controllo-gestione`;

const fmt = (n) => Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT") : "—";
const iso = (d) => d.toISOString().slice(0, 10);

function addDays(isoStr, days) {
  if (!isoStr) return "";
  const d = new Date(isoStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return iso(d);
}

export default function RiconciliaBancaPanel({
  uscitaId,
  contextLabel,
  dataRif,
  importo,
  onLinked,
  onClose,
  compact = false,
}) {
  const [tab, setTab] = useState("auto"); // "auto" | "ricerca"
  const [linkingId, setLinkingId] = useState(null);
  const [error, setError] = useState(null);

  // ── Tab AUTO ──
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoCandidati, setAutoCandidati] = useState([]);

  const loadAuto = useCallback(async () => {
    if (!uscitaId) return;
    setAutoLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${CG}/uscite/${uscitaId}/candidati-banca`);
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      setAutoCandidati(json.candidati || []);
    } catch (e) {
      console.error("Errore candidati banca:", e);
      setError("Errore caricamento candidati");
    } finally {
      setAutoLoading(false);
    }
  }, [uscitaId]);

  useEffect(() => { loadAuto(); }, [loadAuto]);

  // ── Tab RICERCA LIBERA ──
  const initialDaAmount = importo ? (Number(importo) * 0.7).toFixed(2) : "";
  const initialAAmount  = importo ? (Number(importo) * 1.3).toFixed(2) : "";
  const [filtri, setFiltri] = useState({
    q: "",
    data_da: dataRif ? addDays(dataRif, -60) : "",
    data_a:  dataRif ? addDays(dataRif, +60) : "",
    importo_min: initialDaAmount,
    importo_max: initialAAmount,
  });
  const [ricercaLoading, setRicercaLoading] = useState(false);
  const [ricercaResults, setRicercaResults] = useState([]);
  const [ricercaTotal, setRicercaTotal] = useState(0);
  const [ricercaFatta, setRicercaFatta] = useState(false);

  const runRicerca = async () => {
    if (!uscitaId) return;
    setRicercaLoading(true);
    setRicercaFatta(false);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (filtri.q) qs.set("q", filtri.q);
      if (filtri.data_da) qs.set("data_da", filtri.data_da);
      if (filtri.data_a) qs.set("data_a", filtri.data_a);
      if (filtri.importo_min) qs.set("importo_min", filtri.importo_min);
      if (filtri.importo_max) qs.set("importo_max", filtri.importo_max);
      qs.set("limit", "50");
      const res = await apiFetch(`${CG}/uscite/${uscitaId}/ricerca-banca?${qs.toString()}`);
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      setRicercaResults(json.results || []);
      setRicercaTotal(json.total || 0);
      setRicercaFatta(true);
    } catch (e) {
      console.error("Errore ricerca libera:", e);
      setError("Errore durante la ricerca");
    } finally {
      setRicercaLoading(false);
    }
  };

  const resetFiltri = () => {
    setFiltri({
      q: "",
      data_da: dataRif ? addDays(dataRif, -60) : "",
      data_a:  dataRif ? addDays(dataRif, +60) : "",
      importo_min: initialDaAmount,
      importo_max: initialAAmount,
    });
    setRicercaResults([]);
    setRicercaFatta(false);
  };

  // ── Azione: collega movimento ──
  const collega = async (banca_movimento_id) => {
    if (!uscitaId) return;
    setLinkingId(banca_movimento_id);
    setError(null);
    try {
      const res = await apiFetch(`${CG}/uscite/${uscitaId}/riconcilia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banca_movimento_id }),
      });
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      if (json.ok !== false) {
        if (onLinked) onLinked(banca_movimento_id);
      } else {
        setError(json.error || "Errore nel collegamento");
      }
    } catch (e) {
      console.error("Errore riconciliazione:", e);
      setError("Errore di rete");
    } finally {
      setLinkingId(null);
    }
  };

  // ── Render ──
  const padX = compact ? "px-3" : "px-4";
  const padY = compact ? "py-2" : "py-3";

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header con context + tab switcher */}
      <div className={`${padX} ${padY} border-b border-neutral-200 bg-violet-50`}>
        {contextLabel && (
          <div className="text-[11px] text-violet-900 font-semibold mb-2 truncate" title={contextLabel}>
            {contextLabel}
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("auto")}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition ${
              tab === "auto"
                ? "bg-violet-600 text-white shadow-sm"
                : "bg-white border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            🎯 Auto {!autoLoading && autoCandidati.length > 0 && `(${autoCandidati.length})`}
          </button>
          <button
            onClick={() => setTab("ricerca")}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition ${
              tab === "ricerca"
                ? "bg-violet-600 text-white shadow-sm"
                : "bg-white border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            🔍 Ricerca libera
          </button>
          <div className="flex-1" />
          {onClose && (
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-600 text-lg leading-none px-1"
              title="Chiudi"
            >&times;</button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-[11px] text-red-700">
          {error}
        </div>
      )}

      {/* Body — cambia in base al tab */}
      <div className="flex-1 overflow-y-auto">
        {tab === "auto" ? (
          <AutoTab
            loading={autoLoading}
            candidati={autoCandidati}
            onLink={collega}
            linkingId={linkingId}
            padX={padX}
          />
        ) : (
          <RicercaTab
            filtri={filtri}
            setFiltri={setFiltri}
            loading={ricercaLoading}
            results={ricercaResults}
            total={ricercaTotal}
            fatta={ricercaFatta}
            onRun={runRicerca}
            onReset={resetFiltri}
            onLink={collega}
            linkingId={linkingId}
            padX={padX}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Tab AUTO: i candidati pre-calcolati dal backend
// ─────────────────────────────────────────────────────────
function AutoTab({ loading, candidati, onLink, linkingId, padX }) {
  if (loading) return <div className="text-center py-8 text-neutral-400 text-xs">Ricerca movimenti...</div>;
  if (candidati.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="text-neutral-400 text-sm mb-1">Nessun match automatico</div>
        <div className="text-[10px] text-neutral-300">
          Criteri: importo ±10%, data ±15 giorni.
          <br />Prova la tab <b>Ricerca libera</b> per allargare i filtri.
        </div>
      </div>
    );
  }
  return (
    <div className={`${padX} py-2 space-y-1.5`}>
      <div className="text-[10px] text-neutral-500 mb-1">
        {candidati.length} moviment{candidati.length === 1 ? "o" : "i"} compatibil{candidati.length === 1 ? "e" : "i"}
      </div>
      {candidati.map((c) => (
        <MovimentoCard key={c.id} mov={c} onLink={onLink} linkingId={linkingId} showMatch />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Tab RICERCA: filtri liberi + risultati
// ─────────────────────────────────────────────────────────
function RicercaTab({ filtri, setFiltri, loading, results, total, fatta, onRun, onReset, onLink, linkingId, padX }) {
  const up = (k) => (e) => setFiltri({ ...filtri, [k]: e.target.value });

  return (
    <div>
      {/* Form filtri */}
      <div className={`${padX} py-3 border-b border-neutral-200 bg-neutral-50 space-y-2`}>
        <input
          type="text"
          placeholder="Testo (descrizione, ragione sociale, causale)"
          value={filtri.q}
          onChange={up("q")}
          onKeyDown={(e) => e.key === "Enter" && onRun()}
          className="w-full px-2 py-1 text-[11px] border border-neutral-300 rounded bg-white"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] text-neutral-500 mb-0.5">Data da</label>
            <input type="date" value={filtri.data_da} onChange={up("data_da")}
              className="w-full px-1.5 py-1 text-[10px] border border-neutral-300 rounded bg-white" />
          </div>
          <div>
            <label className="block text-[9px] text-neutral-500 mb-0.5">Data a</label>
            <input type="date" value={filtri.data_a} onChange={up("data_a")}
              className="w-full px-1.5 py-1 text-[10px] border border-neutral-300 rounded bg-white" />
          </div>
          <div>
            <label className="block text-[9px] text-neutral-500 mb-0.5">Importo min €</label>
            <input type="number" step="0.01" value={filtri.importo_min} onChange={up("importo_min")}
              className="w-full px-1.5 py-1 text-[10px] border border-neutral-300 rounded bg-white tabular-nums text-right" />
          </div>
          <div>
            <label className="block text-[9px] text-neutral-500 mb-0.5">Importo max €</label>
            <input type="number" step="0.01" value={filtri.importo_max} onChange={up("importo_max")}
              className="w-full px-1.5 py-1 text-[10px] border border-neutral-300 rounded bg-white tabular-nums text-right" />
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={onRun}
            disabled={loading}
            className="flex-1 px-3 py-1.5 rounded bg-violet-600 text-white text-[10px] font-semibold hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? "Cerca..." : "🔍 Cerca"}
          </button>
          <button
            onClick={onReset}
            className="px-2 py-1.5 rounded border border-neutral-300 bg-white text-neutral-600 text-[10px] hover:bg-neutral-50"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Risultati */}
      <div className={`${padX} py-2`}>
        {loading ? (
          <div className="text-center py-6 text-neutral-400 text-xs">Ricerca in corso...</div>
        ) : !fatta ? (
          <div className="text-center py-6 text-neutral-400 text-[11px]">
            Inserisci i filtri e premi <b>Cerca</b> per esplorare i movimenti bancari.
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-neutral-400 text-xs">Nessun movimento trovato</div>
            <div className="text-[10px] text-neutral-300 mt-1">Prova ad allargare i filtri</div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="text-[10px] text-neutral-500">
              {results.length} di {total} risultat{total === 1 ? "o" : "i"}
              {total > results.length && <span className="italic"> (ne vedi max 50)</span>}
            </div>
            {results.map((c) => (
              <MovimentoCard key={c.id} mov={c} onLink={onLink} linkingId={linkingId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Card movimento: layout comune a entrambe le tab
// ─────────────────────────────────────────────────────────
function MovimentoCard({ mov, onLink, linkingId, showMatch = false }) {
  const importoAbs = mov.importo_abs != null ? mov.importo_abs : Math.abs(mov.importo || 0);
  const matchPct = mov.match_pct;
  return (
    <div className="border border-neutral-200 rounded-md p-2 hover:border-violet-300 hover:bg-violet-50/30 transition">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-neutral-800 truncate" title={mov.descrizione || ""}>
            {mov.descrizione || "Movimento senza descrizione"}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[9px] text-neutral-500 flex-wrap">
            <span className="tabular-nums">{fmtDate(mov.data_contabile)}</span>
            <span className="font-semibold text-neutral-700 tabular-nums">€ {fmt(importoAbs)}</span>
            {showMatch && matchPct != null && (
              matchPct >= 99 ? (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Match esatto</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{matchPct}% match</span>
              )
            )}
            {mov.ragione_sociale && (
              <span className="text-neutral-400 truncate">{mov.ragione_sociale}</span>
            )}
          </div>
          {mov.categoria_banca && (
            <div className="text-[9px] text-neutral-400 mt-0.5">{mov.categoria_banca}</div>
          )}
        </div>
        <button
          onClick={() => onLink(mov.id)}
          disabled={linkingId === mov.id}
          className="px-2.5 py-1 rounded bg-violet-600 text-white text-[10px] font-semibold hover:bg-violet-700 disabled:opacity-50 flex-shrink-0"
        >
          {linkingId === mov.id ? "..." : "Collega"}
        </button>
      </div>
    </div>
  );
}
