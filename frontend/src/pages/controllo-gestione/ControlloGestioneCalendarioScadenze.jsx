// Modulo: controllo_gestione
// G.2.B (2026-05-09) — Calendario Scadenze pagamenti.
// Vista mensile dei pagamenti in arrivo / scaduti non riconciliati, basata su <CalendarView> di M.E.
//
// Sorgente dati: GET /controllo-gestione/scadenze?da=&a= → { scadenze: [...], count, totale, range }
// Ogni scadenza ha già il `livello` derivato dal backend (urgente/avvicinamento/pianificazione/...).
//
// Filtri (sidebar sinistra):
//   - tipo_uscita (fattura, spesa fissa, stipendio, ...)
//   - importo_min
//   - includi_pagate (toggle)
//
// Click su evento → pannello laterale destro con dettaglio rata + deep-link a Scadenziario.
// Persistenza filtri: localStorage["cg_calendario_filters"].

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ControlloGestioneNav from "./ControlloGestioneNav";
import CalendarView from "../../components/calendar/CalendarView";
import { Btn } from "../../components/ui";

const CG = `${API_BASE}/controllo-gestione`;
const FILTERS_KEY = "cg_calendario_filters";

// Mapping livello backend → preset M.E
const LIVELLO_COLOR = {
  scaduta: "red",
  urgente: "red",
  avvicinamento: "amber",
  pianificazione: "blue",
  futuro: "slate",
  pagata: "green",
  parziale: "violet",
};

const LIVELLO_LABEL = {
  scaduta: "Scaduta",
  urgente: "Urgente (≤7gg)",
  avvicinamento: "Avvicinamento (≤15gg)",
  pianificazione: "Pianificazione (≤30gg)",
  futuro: "Futura (>30gg)",
  pagata: "Pagata",
  parziale: "Parziale",
};

const TIPI_USCITA = [
  { v: "", lbl: "Tutti i tipi" },
  { v: "FATTURA", lbl: "💰 Fatture" },
  { v: "SPESA_FISSA", lbl: "🏠 Spese fisse" },
  { v: "STIPENDIO", lbl: "👤 Stipendi" },
  { v: "SPESA_BANCARIA", lbl: "🏦 Spese bancarie" },
  { v: "IMPOSTA_BOLLO", lbl: "📜 Imposte/bolli" },
  { v: "COMMISSIONE_POS", lbl: "💳 Commissioni POS" },
  { v: "PROFORMA", lbl: "📋 Proforma" },
  { v: "ALTRO_USCITA", lbl: "✏️ Altro" },
];

function fmtEuro(n) {
  return Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateIT(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function loadFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { tipo_uscita: "", importo_min: "", includi_pagate: false };
}

function saveFilters(f) {
  try { localStorage.setItem(FILTERS_KEY, JSON.stringify(f)); } catch (_) {}
}

// Convert ISO YYYY-MM-DD → Date (a mezzogiorno per evitare TZ shift)
function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export default function ControlloGestioneCalendarioScadenze() {
  const navigate = useNavigate();
  const [view, setView] = useState("mese");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [scadenze, setScadenze] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [filters, setFilters] = useState(loadFilters);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Persistenza filtri
  useEffect(() => { saveFilters(filters); }, [filters]);

  // Calcola range della query in base alla view
  const { da, a } = useMemo(() => {
    const d = currentDate;
    let start, end;
    if (view === "mese") {
      // Includi anche i giorni "sbordo" del calendario (settimana prima/dopo)
      start = new Date(d.getFullYear(), d.getMonth() - 1, 20, 12);
      end = new Date(d.getFullYear(), d.getMonth() + 1, 10, 12);
    } else if (view === "settimana") {
      start = new Date(d); start.setDate(d.getDate() - 7);
      end = new Date(d);   end.setDate(d.getDate() + 7);
    } else {
      start = new Date(d); start.setDate(d.getDate() - 1);
      end = new Date(d);   end.setDate(d.getDate() + 1);
    }
    const fmt = (x) => x.toISOString().slice(0, 10);
    return { da: fmt(start), a: fmt(end) };
  }, [currentDate, view]);

  const loadScadenze = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams({ da, a });
      if (filters.tipo_uscita) params.set("tipo_uscita", filters.tipo_uscita);
      if (filters.importo_min) params.set("importo_min", filters.importo_min);
      if (filters.includi_pagate) params.set("includi_pagate", "true");
      const res = await apiFetch(`${CG}/scadenze?${params}`);
      if (!res.ok) {
        setErr(`Errore caricamento: ${res.status}`);
        setScadenze([]);
        return;
      }
      const data = await res.json();
      setScadenze(data.scadenze || []);
    } catch (e) {
      console.error("[scadenze]", e);
      setErr("Errore di rete");
      setScadenze([]);
    } finally {
      setLoading(false);
    }
  }, [da, a, filters]);

  useEffect(() => { loadScadenze(); }, [loadScadenze]);

  // Mappa scadenze → eventi M.E
  // title compatto: "€XXX · Nome" con titolo_breve dal backend (max 26 char)
  const events = useMemo(() => scadenze.map((s) => ({
    id: s.id,
    start: isoToDate(s.data_scadenza),
    allDay: true,
    title: `€${fmtEuro(s.totale)} · ${s.titolo_breve || s.titolo}`,
    subtitle: LIVELLO_LABEL[s.livello] || "",
    color: LIVELLO_COLOR[s.livello] || "blue",
    icon: s.livello === "scaduta" ? "⚠️" : (s.livello === "urgente" ? "🔴" : null),
    payload: s,
  })), [scadenze]);

  // Riepilogo per livello (count + €)
  const summary = useMemo(() => {
    const init = (n = 0, eur = 0) => ({ n, eur });
    const m = {
      scaduta: init(), urgente: init(), avvicinamento: init(),
      pianificazione: init(), futuro: init(), pagata: init(), parziale: init(),
    };
    let totale = 0;
    scadenze.forEach((s) => {
      const eur = s.totale || 0;
      if (m[s.livello]) {
        m[s.livello].n += 1;
        m[s.livello].eur += eur;
      }
      totale += eur;
    });
    return { ...m, totale };
  }, [scadenze]);

  return (
    <div className="min-h-screen bg-brand-cream">
      <ControlloGestioneNav current="calendario" />

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
          <div>
            <h1 className="text-2xl font-bold text-sky-900 font-playfair">📅 Calendario Scadenze</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Pagamenti in arrivo, scaduti non riconciliati, con vista mese/settimana/giorno
            </p>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" onClick={() => navigate("/controllo-gestione/uscite")}>
              💸 Vai a Scadenziario
            </Btn>
            <Btn variant="primary" size="sm" onClick={loadScadenze} loading={loading}>
              🔄 Aggiorna
            </Btn>
          </div>
        </div>

        {/* RIEPILOGO — 4 card vive + footer compatto */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
          <SummaryCard color="red"   label="Scadute"        agg={summary.scaduta}       sub="non riconciliate" />
          <SummaryCard color="red"   label="Urgenti"        agg={summary.urgente}       sub="≤ 7 giorni" />
          <SummaryCard color="amber" label="Avvicinamento"  agg={summary.avvicinamento} sub="8 – 15 giorni" />
          <SummaryCard color="blue"  label="Pianificazione" agg={summary.pianificazione} sub="16 – 30 giorni" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 px-1 text-xs text-neutral-600">
          <div>
            <span className="text-neutral-400 mr-1">Future (oltre 30gg):</span>
            <span className="font-semibold text-slate-700 tabular-nums">{summary.futuro.n}</span>
            {summary.futuro.eur > 0 && (
              <span className="text-neutral-500 ml-1 tabular-nums">· € {fmtEuro(summary.futuro.eur)}</span>
            )}
          </div>
          <div className="flex items-center gap-1 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
            <span className="text-emerald-600">Totale periodo:</span>
            <span className="font-bold text-emerald-800 tabular-nums">€ {fmtEuro(summary.totale)}</span>
            <span className="text-emerald-500 text-[10px]">({scadenze.length})</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          {/* SIDEBAR FILTRI */}
          <aside className="bg-white border border-neutral-200 rounded-xl p-4 h-fit">
            <h3 className="text-xs font-bold text-neutral-700 uppercase tracking-wide mb-3">Filtri</h3>

            <div className="mb-3">
              <label className="block text-xs text-neutral-500 mb-1">Tipo</label>
              <select
                value={filters.tipo_uscita}
                onChange={(e) => setFilters((f) => ({ ...f, tipo_uscita: e.target.value }))}
                className="w-full px-2 py-1.5 border border-neutral-300 rounded text-sm"
              >
                {TIPI_USCITA.map((t) => <option key={t.v} value={t.v}>{t.lbl}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-neutral-500 mb-1">Importo minimo (€)</label>
              <input
                type="number" min="0" step="10" placeholder="0"
                value={filters.importo_min}
                onChange={(e) => setFilters((f) => ({ ...f, importo_min: e.target.value }))}
                className="w-full px-2 py-1.5 border border-neutral-300 rounded text-sm"
              />
            </div>

            <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filters.includi_pagate}
                onChange={(e) => setFilters((f) => ({ ...f, includi_pagate: e.target.checked }))}
              />
              <span>Mostra anche pagate</span>
            </label>

            {(filters.tipo_uscita || filters.importo_min || filters.includi_pagate) && (
              <button
                onClick={() => setFilters({ tipo_uscita: "", importo_min: "", includi_pagate: false })}
                className="mt-3 text-xs text-brand-blue hover:underline"
              >
                Reset filtri
              </button>
            )}

            {/* Legenda */}
            <div className="mt-5 pt-4 border-t border-neutral-200">
              <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-2">Legenda</h4>
              <div className="space-y-1 text-[11px]">
                <LegendItem dot="bg-brand-red" label="Scadute / Urgenti" />
                <LegendItem dot="bg-amber-500" label="Avvicinamento (≤15gg)" />
                <LegendItem dot="bg-brand-blue" label="Pianificazione (≤30gg)" />
                <LegendItem dot="bg-slate-500" label="Future (>30gg)" />
                {filters.includi_pagate && <>
                  <LegendItem dot="bg-brand-green" label="Pagate" />
                  <LegendItem dot="bg-violet-500" label="Parziali" />
                </>}
              </div>
            </div>
          </aside>

          {/* CALENDARIO */}
          <div className="space-y-4">
            {err && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{err}</div>
            )}

            <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
              <CalendarView
                view={view}
                onViewChange={setView}
                currentDate={currentDate}
                onDateChange={setCurrentDate}
                events={events}
                onSelectEvent={(ev) => setSelectedEvent(ev)}
                loading={loading}
                emptyLabel="Nessuna scadenza nel periodo"
                weekStartsOn={1}
              />
            </div>

            {/* PANNELLO DETTAGLIO RATA SELEZIONATA */}
            {selectedEvent && (
              <DettaglioRata
                ev={selectedEvent}
                onClose={() => setSelectedEvent(null)}
                onGotoUscite={() => navigate("/controllo-gestione/uscite")}
                onGotoSpesaFissa={(spesaId) => navigate(`/controllo-gestione/spese-fisse?highlight=${spesaId}`)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ color, label, agg, sub }) {
  const palette = {
    red:    "bg-red-50 border-red-200 text-red-800",
    amber:  "bg-amber-50 border-amber-200 text-amber-800",
    blue:   "bg-blue-50 border-blue-200 text-blue-800",
    slate:  "bg-slate-50 border-slate-200 text-slate-700",
    emerald:"bg-emerald-50 border-emerald-200 text-emerald-800",
  }[color] || "bg-neutral-50 border-neutral-200 text-neutral-700";

  const isEmpty = !agg?.n;
  // Card "spenta" quando count=0 → diventa rumore, la rendiamo discreta
  const dim = isEmpty ? "opacity-40" : "";

  return (
    <div className={`rounded-lg border ${palette} ${dim} px-3 py-2 flex items-center gap-3 transition-opacity`}>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wide opacity-70 truncate">{label}</div>
        {sub && <div className="text-[10px] opacity-60 truncate">{sub}</div>}
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold tabular-nums leading-none">{agg?.n ?? 0}</div>
        {!isEmpty && agg?.eur > 0 && (
          <div className="text-[10px] opacity-70 tabular-nums mt-0.5">€ {fmtEuro(agg.eur)}</div>
        )}
      </div>
    </div>
  );
}

function LegendItem({ dot, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
      <span className="text-neutral-700">{label}</span>
    </div>
  );
}

function DettaglioRata({ ev, onClose, onGotoUscite, onGotoSpesaFissa }) {
  const s = ev.payload || {};
  // Pillola colorata in base al livello
  const livColor = {
    scaduta: "bg-red-100 text-red-700 border-red-300",
    urgente: "bg-red-100 text-red-700 border-red-300",
    avvicinamento: "bg-amber-100 text-amber-800 border-amber-300",
    pianificazione: "bg-blue-100 text-blue-700 border-blue-300",
    futuro: "bg-slate-100 text-slate-700 border-slate-300",
    pagata: "bg-emerald-100 text-emerald-700 border-emerald-300",
    parziale: "bg-violet-100 text-violet-700 border-violet-300",
  }[s.livello] || "bg-neutral-100 text-neutral-700 border-neutral-300";

  return (
    <div className="bg-white border border-neutral-200 rounded-xl px-4 py-3 shadow-sm flex items-center gap-3 flex-wrap">
      {/* Livello badge */}
      <span className={`inline-block text-[10px] font-bold uppercase tracking-wide border rounded-full px-2 py-0.5 ${livColor}`}>
        {LIVELLO_LABEL[s.livello] || s.livello}
      </span>

      {/* Titolo + meta inline */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-neutral-900 truncate" title={s.titolo}>{s.titolo || ev.title}</div>
        <div className="text-xs text-neutral-500 flex items-center gap-2 flex-wrap">
          <span>📅 <span className="tabular-nums">{fmtDateIT(s.data_scadenza)}</span></span>
          <span>·</span>
          <span className="font-semibold tabular-nums text-neutral-700">€ {fmtEuro(s.totale)}</span>
          {s.tipo_uscita && <><span>·</span><span>{s.tipo_uscita}</span></>}
          {s.fornitore_nome && s.fornitore_nome !== s.titolo && (
            <><span>·</span><span className="truncate">{s.fornitore_nome}</span></>
          )}
        </div>
      </div>

      {/* Azioni */}
      <div className="flex items-center gap-2">
        <Btn size="sm" variant="primary" onClick={onGotoUscite}>💸 Scadenziario</Btn>
        {s.spesa_fissa_id && (
          <Btn size="sm" variant="chip" tone="violet" onClick={() => onGotoSpesaFissa(s.spesa_fissa_id)}>
            🏠 Spesa Fissa
          </Btn>
        )}
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none px-1" aria-label="Chiudi">×</button>
      </div>
    </div>
  );
}
