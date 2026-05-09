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
  // G.2.B-fix8 — modale elenco scadenze per livello (click su card riepilogo)
  const [livelloModale, setLivelloModale] = useState(null); // 'scaduta' | 'urgente' | 'avvicinamento' | 'pianificazione' | null

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
  // 2 righe: title = importo (bold), subtitle = nome (max 26 char dal backend)
  // EventChip mostra: [icon] €XXX (riga 1, prominente)
  //                   nome fornitore (riga 2, ~10px, truncate)
  const events = useMemo(() => scadenze.map((s) => ({
    id: s.id,
    start: isoToDate(s.data_scadenza),
    allDay: true,
    title: `€${fmtEuro(s.totale)}`,
    subtitle: s.titolo_breve || s.titolo,
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

        {/* RIEPILOGO — 4 card vive cliccabili (apre modale con elenco) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
          <SummaryCard color="red"   label="Scadute"        agg={summary.scaduta}       sub="non riconciliate" onClick={() => summary.scaduta.n > 0 && setLivelloModale("scaduta")} />
          <SummaryCard color="red"   label="Urgenti"        agg={summary.urgente}       sub="≤ 7 giorni"      onClick={() => summary.urgente.n > 0 && setLivelloModale("urgente")} />
          <SummaryCard color="amber" label="Avvicinamento"  agg={summary.avvicinamento} sub="8 – 15 giorni"   onClick={() => summary.avvicinamento.n > 0 && setLivelloModale("avvicinamento")} />
          <SummaryCard color="blue"  label="Pianificazione" agg={summary.pianificazione} sub="16 – 30 giorni" onClick={() => summary.pianificazione.n > 0 && setLivelloModale("pianificazione")} />
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

        {/* G.2.B-fix8 — Modale elenco scadenze per livello */}
        {livelloModale && (
          <ModaleElencoLivello
            livello={livelloModale}
            scadenze={scadenze.filter((s) => s.livello === livelloModale)}
            onClose={() => setLivelloModale(null)}
            onGotoUscite={() => navigate("/controllo-gestione/uscite")}
            onGotoSpesaFissa={(id) => navigate(`/controllo-gestione/spese-fisse?highlight=${id}`)}
          />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ color, label, agg, sub, onClick }) {
  const palette = {
    red:    "bg-red-50 border-red-200 text-red-800",
    amber:  "bg-amber-50 border-amber-200 text-amber-800",
    blue:   "bg-blue-50 border-blue-200 text-blue-800",
    slate:  "bg-slate-50 border-slate-200 text-slate-700",
    emerald:"bg-emerald-50 border-emerald-200 text-emerald-800",
  }[color] || "bg-neutral-50 border-neutral-200 text-neutral-700";

  const isEmpty = !agg?.n;
  const dim = isEmpty ? "opacity-40 cursor-default" : "cursor-pointer hover:brightness-95 hover:shadow-sm";

  const Element = onClick && !isEmpty ? "button" : "div";

  return (
    <Element
      type={Element === "button" ? "button" : undefined}
      onClick={onClick}
      className={`rounded-lg border ${palette} ${dim} px-3 py-2 flex items-center gap-3 transition w-full text-left`}
    >
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
    </Element>
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

// G.2.B-fix8 — Modale: elenco scadenze del livello cliccato (Scadute / Urgenti / ...)
function ModaleElencoLivello({ livello, scadenze, onClose, onGotoUscite, onGotoSpesaFissa }) {
  // Lock scroll body mentre la modale è aperta
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Esc per chiudere
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const colorMap = {
    scaduta: { hdr: "bg-red-50 border-red-200", text: "text-red-800", dot: "bg-brand-red" },
    urgente: { hdr: "bg-red-50 border-red-200", text: "text-red-800", dot: "bg-brand-red" },
    avvicinamento: { hdr: "bg-amber-50 border-amber-200", text: "text-amber-800", dot: "bg-amber-500" },
    pianificazione: { hdr: "bg-blue-50 border-blue-200", text: "text-blue-800", dot: "bg-brand-blue" },
  };
  const cm = colorMap[livello] || colorMap.pianificazione;

  // Ordina per data scadenza ascendente
  const items = [...scadenze].sort((a, b) => (a.data_scadenza || "").localeCompare(b.data_scadenza || ""));
  const totale = items.reduce((s, x) => s + (x.totale || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8 sm:my-0 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`${cm.hdr} border-b rounded-t-2xl px-5 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-3 h-3 rounded-full ${cm.dot}`} />
            <h3 className={`text-lg font-bold ${cm.text} truncate`}>
              {LIVELLO_LABEL[livello] || livello}
            </h3>
            <span className={`text-sm ${cm.text} opacity-80 ml-2 whitespace-nowrap`}>
              {items.length} scadenz{items.length === 1 ? "a" : "e"} · € {fmtEuro(totale)}
            </span>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-800 text-2xl leading-none px-2" aria-label="Chiudi">×</button>
        </div>

        {/* Lista scrollabile */}
        <div className="overflow-y-auto flex-1">
          {items.length === 0 ? (
            <div className="text-center text-neutral-400 py-12 text-sm">Nessuna scadenza</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">Data</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">Titolo</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">Tipo</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">Importo</th>
                  <th className="text-center px-4 py-2 text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap text-neutral-700">{fmtDateIT(s.data_scadenza)}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-neutral-900">{s.titolo || "—"}</div>
                      {s.fornitore_nome && s.fornitore_nome !== s.titolo && (
                        <div className="text-[11px] text-neutral-500 truncate max-w-[260px]">{s.fornitore_nome}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-neutral-500">{s.tipo_uscita || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-neutral-900">€ {fmtEuro(s.totale)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        <button
                          onClick={() => onGotoUscite()}
                          className="text-[11px] px-2 py-1 rounded bg-sky-100 text-sky-700 hover:bg-sky-200 border border-sky-200 whitespace-nowrap"
                        >
                          💸 Scadenziario
                        </button>
                        {s.spesa_fissa_id && (
                          <button
                            onClick={() => onGotoSpesaFissa(s.spesa_fissa_id)}
                            className="text-[11px] px-2 py-1 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 border border-violet-200 whitespace-nowrap"
                          >
                            🏠 Spesa fissa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-200 px-5 py-3 flex items-center justify-between bg-neutral-50 rounded-b-2xl">
          <div className="text-sm text-neutral-600">
            Totale: <span className="font-bold text-neutral-900 tabular-nums">€ {fmtEuro(totale)}</span>
          </div>
          <Btn size="sm" variant="ghost" onClick={onClose}>Chiudi</Btn>
        </div>
      </div>
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
