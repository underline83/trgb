// Agenda giornaliera Cucina (MVP, sessione 41)
// Mostra istanze checklist raggruppate per turno + task del giorno.
// Navigazione data avanti/indietro. Click su istanza → /cucina/instances/:id

import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { REPARTI, getReparto } from "../../config/reparti";
import CucinaNav from "./CucinaNav";
import { RepartoBadge } from "./CucinaTaskList";

function oggiISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatGiorno(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

const STATO_CLS = {
  APERTA:     "bg-brand-cream text-neutral-800 border-neutral-300",
  IN_CORSO:   "bg-blue-50 text-blue-800 border-blue-300",
  COMPLETATA: "bg-green-50 text-green-800 border-green-300",
  SCADUTA:    "bg-red-100 text-red-900 border-red-400",
  SALTATA:    "bg-neutral-100 text-neutral-500 border-neutral-300 line-through",
};

const TASK_STATO_CLS = {
  APERTO:     "bg-brand-cream text-neutral-800 border-neutral-300",
  IN_CORSO:   "bg-blue-50 text-blue-800 border-blue-300",
  COMPLETATO: "bg-green-50 text-green-800 border-green-300",
  SCADUTO:    "bg-red-100 text-red-900 border-red-400",
  ANNULLATO:  "bg-neutral-100 text-neutral-500 border-neutral-300 line-through",
};

export default function CucinaAgendaGiornaliera() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(params.get("data") || oggiISO());
  const [turno, setTurno] = useState(params.get("turno") || "");
  const [reparto, setReparto] = useState(params.get("reparto") || "");
  const [agenda, setAgenda] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAgenda = useCallback(() => {
    setLoading(true);
    setError("");
    const qs = new URLSearchParams({ data });
    if (turno) qs.set("turno", turno);
    if (reparto) qs.set("reparto", reparto);
    apiFetch(`${API_BASE}/cucina/agenda/?${qs.toString()}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setAgenda)
      .catch(e => setError(e.message || "Errore caricamento agenda"))
      .finally(() => setLoading(false));
  }, [data, turno, reparto]);

  useEffect(() => {
    loadAgenda();
    // Sync query string
    const next = new URLSearchParams();
    next.set("data", data);
    if (turno) next.set("turno", turno);
    if (reparto) next.set("reparto", reparto);
    setParams(next, { replace: true });
  }, [data, turno, reparto]);

  const istanze = (agenda?.turni || []).flatMap(b => b.instances);
  const kpi = {
    totale: istanze.length,
    completate: istanze.filter(i => i.stato === "COMPLETATA").length,
    aperte: istanze.filter(i => i.stato === "APERTA" || i.stato === "IN_CORSO").length,
    scadute: istanze.filter(i => i.stato === "SCADUTA").length,
  };

  const tasks = agenda?.tasks || [];

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <CucinaNav current="agenda" />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Controlli: data + filtro turno */}
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setData(shiftDate(data, -1))}
              className="px-3 py-2 border rounded-lg hover:bg-red-50 min-h-[44px]"
              title="Giorno precedente"
            >
              ←
            </button>
            <input
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="border rounded-lg px-3 py-2 min-h-[44px]"
            />
            <button
              onClick={() => setData(shiftDate(data, 1))}
              className="px-3 py-2 border rounded-lg hover:bg-red-50 min-h-[44px]"
              title="Giorno successivo"
            >
              →
            </button>
            <button
              onClick={() => setData(oggiISO())}
              className="px-3 py-2 border border-red-200 bg-red-50 text-red-900 rounded-lg hover:bg-red-100 min-h-[44px] text-sm font-medium"
            >
              Oggi
            </button>
            <div className="flex-1" />
            <select
              value={turno}
              onChange={e => setTurno(e.target.value)}
              className="border rounded-lg px-3 py-2 min-h-[44px]"
            >
              <option value="">Tutti i turni</option>
              <option value="APERTURA">Apertura</option>
              <option value="PRANZO">Pranzo</option>
              <option value="POMERIGGIO">Pomeriggio</option>
              <option value="CENA">Cena</option>
              <option value="CHIUSURA">Chiusura</option>
            </select>
          </div>
          <div className="mt-3 text-lg font-playfair font-bold text-red-900 capitalize">
            {formatGiorno(data)}
          </div>
        </div>

        {/* Pills REPARTO — mobile scroll x, sm+ wrap */}
        <div
          className="flex gap-2 overflow-x-auto sm:flex-wrap sm:overflow-x-visible pb-1"
          style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
          role="tablist"
          aria-label="Filtri reparto"
        >
          <PillBasic
            active={reparto === ""}
            onClick={() => setReparto("")}
          >
            Tutti
          </PillBasic>
          {REPARTI.map(r => (
            <PillReparto
              key={r.key}
              reparto={r}
              active={reparto === r.key}
              onClick={() => setReparto(r.key)}
            />
          ))}
        </div>

        {/* KPI sintetici */}
        {!loading && agenda && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiMini label="Totale" value={kpi.totale} color="text-neutral-900" />
            <KpiMini label="Completate" value={kpi.completate} color="text-green-700" />
            <KpiMini label="Aperte" value={kpi.aperte} color="text-blue-700" />
            <KpiMini label="Scadute" value={kpi.scadute} color="text-red-700" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading && <div className="text-center py-8 text-neutral-500">Caricamento...</div>}

        {/* Istanze raggruppate per turno */}
        {!loading && agenda && (agenda.turni || []).map(bucket => (
          <div key={bucket.turno} className="bg-white rounded-2xl shadow-sm border border-red-100 p-4">
            <div className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>🕐</span>
              <span>{bucket.turno}</span>
              <span className="text-xs text-neutral-400 font-normal">
                ({bucket.instances.length} checklist)
              </span>
            </div>
            <div className="space-y-2">
              {bucket.instances.map(inst => (
                <button
                  key={inst.id}
                  onClick={() => navigate(`/cucina/instances/${inst.id}`)}
                  className={
                    "w-full flex items-center justify-between text-left p-3 rounded-lg border transition min-h-[56px] " +
                    (STATO_CLS[inst.stato] || "border-neutral-200") +
                    " hover:brightness-95"
                  }
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className={"text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap " + (STATO_CLS[inst.stato] || "")}>
                      {inst.stato}
                    </span>
                    <RepartoBadge reparto={inst.reparto} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-neutral-900 truncate">{inst.template_nome}</div>
                      <div className="text-xs text-neutral-600 truncate">
                        {inst.scadenza_at && `entro ${inst.scadenza_at.slice(11, 16)}`}
                        {inst.assegnato_user && ` · @${inst.assegnato_user}`}
                        {inst.score_compliance != null && ` · score ${inst.score_compliance}%`}
                      </div>
                    </div>
                  </div>
                  <span className="text-neutral-400 text-lg ml-2">→</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Task del giorno */}
        {!loading && tasks.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-4">
            <div className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>✅</span>
              <span>Task operativi</span>
              <span className="text-xs text-neutral-400 font-normal">({tasks.length})</span>
            </div>
            <div className="space-y-2">
              {tasks.map(t => (
                <div
                  key={t.id}
                  className={
                    "flex items-center justify-between p-3 rounded-lg border min-h-[48px] " +
                    (TASK_STATO_CLS[t.stato] || "border-neutral-200")
                  }
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <PrioritaBadge priorita={t.priorita} />
                    <RepartoBadge reparto={t.reparto} />
                    <span className="font-medium truncate">{t.titolo}</span>
                    {t.assegnato_user && (
                      <span className="text-xs text-neutral-500 whitespace-nowrap">@{t.assegnato_user}</span>
                    )}
                    {t.ora_scadenza && (
                      <span className="text-xs text-neutral-500 whitespace-nowrap">· {t.ora_scadenza}</span>
                    )}
                  </div>
                  <span className="text-xs font-semibold uppercase">{t.stato}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-100">
              <button
                onClick={() => navigate("/cucina/tasks")}
                className="text-sm text-red-700 hover:text-red-900 font-medium"
              >
                Gestisci tutti i task →
              </button>
            </div>
          </div>
        )}

        {/* Stato vuoto */}
        {!loading && agenda && (agenda.turni || []).length === 0 && tasks.length === 0 && (
          <div className="bg-white border border-dashed border-red-200 rounded-2xl p-8 text-center">
            <div className="text-5xl mb-2">🧑‍🍳</div>
            <div className="text-neutral-700 font-semibold">Nessuna attività per questa data</div>
            <div className="text-sm text-neutral-500 mt-1">
              Attiva i template da Configurazione o crea un task operativo.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiMini({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-red-100 p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs uppercase tracking-wide text-neutral-500 mt-1">{label}</div>
    </div>
  );
}

function PrioritaBadge({ priorita }) {
  const map = {
    ALTA:  "bg-red-100 text-red-800",
    MEDIA: "bg-amber-100 text-amber-800",
    BASSA: "bg-neutral-100 text-neutral-700",
  };
  return (
    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${map[priorita] || "bg-neutral-100"}`}>
      {priorita}
    </span>
  );
}

// Pill "Tutti" neutra — uso la stessa estetica della TaskList per coerenza
function PillBasic({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "flex-shrink-0 px-3.5 py-2 rounded-full text-[13px] font-semibold border transition-colors min-h-[40px] " +
        (active
          ? "bg-brand-red text-white border-brand-red"
          : "bg-white text-neutral-600 border-[#e6e1d8] hover:bg-[#EFEBE3]")
      }
      style={{ scrollSnapAlign: "start" }}
    >
      {children}
    </button>
  );
}

// Pill reparto colorata quando attiva (replica di RepartoPill di TaskList)
function PillReparto({ reparto, active, onClick }) {
  const activeCls = {
    cucina:       "bg-red-100 text-red-900 border-red-400",
    bar:          "bg-amber-100 text-amber-900 border-amber-400",
    sala:         "bg-rose-100 text-rose-900 border-rose-400",
    pulizia:      "bg-emerald-100 text-emerald-900 border-emerald-400",
    manutenzione: "bg-slate-100 text-slate-900 border-slate-400",
  }[reparto.key] || "bg-red-100 text-red-900 border-red-400";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "flex-shrink-0 inline-flex items-center gap-1 px-3.5 py-2 rounded-full text-[13px] font-semibold border transition-colors min-h-[40px] " +
        (active ? activeCls : "bg-white text-neutral-700 border-[#e6e1d8] hover:bg-[#EFEBE3]")
      }
      style={{ scrollSnapAlign: "start" }}
    >
      <span aria-hidden="true">{reparto.icon}</span>
      <span>{reparto.label}</span>
    </button>
  );
}
