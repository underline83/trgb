// @version: v1.1-mattoni — M.I primitives (Btn) su navigazione settimana
// Agenda settimanale Cucina (MVP, sessione 41)
// Tabella 7 colonne (lun-dom) con istanze + task per giorno.
// Navigazione settimana avanti/indietro. Click giorno → /cucina/agenda?data=X

import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import CucinaNav from "./CucinaNav";
import { Btn } from "../../components/ui";

const GIORNI = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"];

const STATO_DOT = {
  APERTA:     "bg-neutral-400",
  IN_CORSO:   "bg-blue-500",
  COMPLETATA: "bg-green-500",
  SCADUTA:    "bg-red-600",
  SALTATA:    "bg-neutral-300",
};

const TASK_DOT = {
  APERTO:     "bg-neutral-400",
  IN_CORSO:   "bg-blue-500",
  COMPLETATO: "bg-green-500",
  SCADUTO:    "bg-red-600",
  ANNULLATO:  "bg-neutral-300",
};

const PRIO_CLS = {
  ALTA:  "bg-red-100 text-red-800",
  MEDIA: "bg-amber-100 text-amber-800",
  BASSA: "bg-neutral-100 text-neutral-700",
};

function lunediDi(iso) {
  const d = new Date(iso + "T00:00:00");
  const dow = d.getDay() || 7; // 1=lun, 7=dom
  d.setDate(d.getDate() - (dow - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function oggiISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function labelSettimana(isoLun) {
  const d1 = new Date(isoLun + "T00:00:00");
  const d2 = new Date(d1); d2.setDate(d1.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return `${fmt(d1)} — ${fmt(d2)}`;
}

export default function CucinaAgendaSettimana() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [dataInizio, setDataInizio] = useState(lunediDi(params.get("data_inizio") || oggiISO()));
  const [settimana, setSettimana] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`${API_BASE}/cucina/agenda/settimana?data_inizio=${dataInizio}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setSettimana)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [dataInizio]);

  useEffect(() => {
    load();
    const next = new URLSearchParams();
    next.set("data_inizio", dataInizio);
    setParams(next, { replace: true });
  }, [dataInizio]);

  const giorni = settimana?.giorni || [];
  const today = oggiISO();

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <CucinaNav current="settimana" />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Controlli */}
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Btn
              variant="secondary"
              size="md"
              onClick={() => setDataInizio(shiftISO(dataInizio, -7))}
              title="Settimana precedente"
            >
              ← Settimana prec.
            </Btn>
            <Btn
              variant="chip"
              tone="red"
              size="md"
              onClick={() => setDataInizio(lunediDi(oggiISO()))}
            >
              Questa settimana
            </Btn>
            <Btn
              variant="secondary"
              size="md"
              onClick={() => setDataInizio(shiftISO(dataInizio, 7))}
              title="Settimana successiva"
            >
              Settimana succ. →
            </Btn>
            <div className="flex-1" />
            <input
              type="date"
              value={dataInizio}
              onChange={e => setDataInizio(lunediDi(e.target.value))}
              className="border rounded-lg px-3 py-2 min-h-[44px]"
            />
          </div>
          <div className="mt-3 text-lg font-playfair font-bold text-red-900">
            Settimana {labelSettimana(dataInizio)}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading && <div className="text-center py-8 text-neutral-500">Caricamento...</div>}

        {!loading && settimana && (
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-x-auto">
            <div className="grid grid-cols-7 min-w-[900px]">
              {giorni.map((g, i) => {
                const isToday = g.data === today;
                const d = new Date(g.data + "T00:00:00");
                const dayNum = d.getDate();
                const istanze = g.instances || [];
                const tasks = g.tasks || [];

                return (
                  <div
                    key={g.data}
                    className={
                      "border-r border-neutral-100 last:border-r-0 min-h-[260px] p-2 " +
                      (isToday ? "bg-red-50/40" : "")
                    }
                  >
                    {/* Header giorno */}
                    <button
                      onClick={() => navigate(`/cucina/agenda?data=${g.data}`)}
                      className={
                        "w-full text-left p-2 rounded-lg mb-2 transition " +
                        (isToday
                          ? "bg-red-600 text-white"
                          : "bg-brand-cream hover:bg-red-50 text-neutral-800")
                      }
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-bold uppercase tracking-wide">
                          {GIORNI[i]}
                        </span>
                        <span className="text-xl font-bold">{dayNum}</span>
                      </div>
                    </button>

                    {/* Istanze */}
                    {istanze.length > 0 && (
                      <div className="space-y-1 mb-2">
                        <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wide">
                          Checklist
                        </div>
                        {istanze.map(i => (
                          <div
                            key={i.id}
                            className="flex items-center gap-1.5 text-xs p-1.5 rounded bg-white border border-neutral-200 cursor-pointer hover:bg-red-50"
                            onClick={() => navigate(`/cucina/instances/${i.id}`)}
                            title={`${i.template_nome} — ${i.stato}`}
                          >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATO_DOT[i.stato] || "bg-neutral-300"}`} />
                            <span className="truncate flex-1">{i.template_nome}</span>
                            {i.turno && (
                              <span className="text-[9px] text-neutral-500">{i.turno.slice(0, 3)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tasks */}
                    {tasks.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wide">
                          Task
                        </div>
                        {tasks.map(t => (
                          <div
                            key={t.id}
                            className="flex items-center gap-1.5 text-xs p-1.5 rounded bg-white border border-neutral-200"
                            title={`${t.titolo} · ${t.priorita} · ${t.stato}`}
                          >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TASK_DOT[t.stato] || "bg-neutral-300"}`} />
                            <span className="truncate flex-1">{t.titolo}</span>
                            <span className={`text-[9px] font-bold px-1 rounded ${PRIO_CLS[t.priorita] || ""}`}>
                              {t.priorita.slice(0, 1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {istanze.length === 0 && tasks.length === 0 && (
                      <div className="text-xs text-neutral-400 text-center pt-8">
                        —
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legenda */}
        <div className="bg-white rounded-2xl border border-red-100 p-3 text-xs text-neutral-600">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-semibold">Stato:</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-neutral-400" /> Aperta</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> In corso</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Completata</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600" /> Scaduta</span>
            <span className="text-neutral-400">·</span>
            <span>Clicca un giorno per l'agenda dettagliata.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
