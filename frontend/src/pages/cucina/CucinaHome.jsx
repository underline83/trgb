// Dashboard entry del modulo Cucina (MVP, sessione 41)
// 4 card: Agenda, Settimana, Task, Template (admin/chef only)
// Pattern: red = cucina (fornelli/fuoco). KPI caricati da /cucina/agenda/ + /cucina/tasks/

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import CucinaNav from "./CucinaNav";

function oggiISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CucinaHome() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "";
  const isAdminOrChef = ["admin", "superadmin", "chef"].includes(role);

  const [agenda, setAgenda] = useState(null);      // { data, turni: [...], tasks: [...] }
  const [tasksCount, setTasksCount] = useState(null); // { aperti, scaduti, oggi }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);

    const oggi = oggiISO();

    Promise.allSettled([
      apiFetch(`${API_BASE}/cucina/agenda/?data=${oggi}`).then(r => r.json()),
      apiFetch(`${API_BASE}/cucina/tasks/`).then(r => r.json()),
    ])
      .then(([rAg, rTk]) => {
        if (!alive) return;
        if (rAg.status === "fulfilled") setAgenda(rAg.value);
        if (rTk.status === "fulfilled") {
          const list = Array.isArray(rTk.value) ? rTk.value : [];
          const aperti = list.filter(t => t.stato === "APERTO" || t.stato === "IN_CORSO").length;
          const scaduti = list.filter(t => t.stato === "SCADUTO").length;
          const oggiCount = list.filter(t => t.data_scadenza === oggi && t.stato !== "COMPLETATO" && t.stato !== "ANNULLATO").length;
          setTasksCount({ aperti, scaduti, oggi: oggiCount });
        }
      })
      .catch(e => { if (alive) setError(e.message || "Errore caricamento"); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, []);

  // Derive KPI agenda
  const agendaKpi = (() => {
    if (!agenda) return null;
    const all = (agenda.turni || []).flatMap(t => t.instances || []);
    const totale = all.length;
    const completate = all.filter(i => i.stato === "COMPLETATA").length;
    const aperte = all.filter(i => i.stato === "APERTA" || i.stato === "IN_CORSO").length;
    const scadute = all.filter(i => i.stato === "SCADUTA").length;
    return { totale, completate, aperte, scadute };
  })();

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <CucinaNav current="home" />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-red-900 font-playfair">
            Cucina — Dashboard
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            Checklist giornaliere, task operativi e agenda settimanale.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Agenda oggi */}
          <button
            onClick={() => navigate("/cucina/agenda")}
            className="bg-white border border-red-200 rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition min-h-[140px]"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                Agenda oggi
              </span>
              <span className="text-2xl">📋</span>
            </div>
            {loading ? (
              <div className="text-3xl font-bold text-neutral-400">…</div>
            ) : agendaKpi ? (
              <div>
                <div className="text-3xl font-bold text-red-900">
                  {agendaKpi.completate}/{agendaKpi.totale}
                </div>
                <div className="text-xs text-neutral-600 mt-1">
                  {agendaKpi.scadute > 0 && (
                    <span className="text-red-700 font-semibold">{agendaKpi.scadute} scadute · </span>
                  )}
                  {agendaKpi.aperte} aperte
                </div>
              </div>
            ) : (
              <div className="text-3xl font-bold text-neutral-400">—</div>
            )}
          </button>

          {/* Settimana */}
          <button
            onClick={() => navigate("/cucina/agenda/settimana")}
            className="bg-white border border-red-200 rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition min-h-[140px]"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                Agenda settimana
              </span>
              <span className="text-2xl">🗓️</span>
            </div>
            <div className="text-base font-semibold text-neutral-700 mt-2">
              Vista 7 giorni
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              Pianifica la settimana in corso
            </div>
          </button>

          {/* Task */}
          <button
            onClick={() => navigate("/cucina/tasks")}
            className="bg-white border border-red-200 rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition min-h-[140px]"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                Task operativi
              </span>
              <span className="text-2xl">✅</span>
            </div>
            {loading ? (
              <div className="text-3xl font-bold text-neutral-400">…</div>
            ) : tasksCount ? (
              <div>
                <div className="flex items-baseline gap-3">
                  <div className="text-3xl font-bold text-red-900">
                    {tasksCount.aperti}
                  </div>
                  <div className="text-sm text-neutral-600">aperti</div>
                </div>
                {tasksCount.scaduti > 0 && (
                  <div className="flex items-baseline gap-3 mt-1">
                    <div className="text-xl font-semibold text-red-700">
                      {tasksCount.scaduti}
                    </div>
                    <div className="text-sm text-neutral-600">scaduti</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-3xl font-bold text-neutral-400">—</div>
            )}
          </button>

          {/* Template (solo admin/chef) */}
          {isAdminOrChef && (
            <button
              onClick={() => navigate("/cucina/templates")}
              className="bg-white border border-red-200 rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition min-h-[140px]"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-neutral-500">
                  Template checklist
                </span>
                <span className="text-2xl">🧩</span>
              </div>
              <div className="text-base font-semibold text-neutral-700 mt-2">
                Configurazione
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                Apertura, chiusura, HACCP...
              </div>
            </button>
          )}
        </div>

        {/* Lista istanze di oggi, raggruppate per turno */}
        {agenda && (agenda.turni || []).length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-red-900 font-playfair">
              Oggi — {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
            </h2>
            {agenda.turni.map(bucket => (
              <div key={bucket.turno} className="bg-white rounded-2xl shadow-sm border border-red-100 p-4">
                <div className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-2">
                  {bucket.turno}
                </div>
                <div className="space-y-2">
                  {bucket.instances.map(inst => (
                    <button
                      key={inst.id}
                      onClick={() => navigate(`/cucina/instances/${inst.id}`)}
                      className="w-full flex items-center justify-between text-left p-3 rounded-lg border border-neutral-200 hover:bg-red-50 transition min-h-[48px]"
                    >
                      <div className="flex items-center gap-3">
                        <StatoBadge stato={inst.stato} />
                        <div>
                          <div className="font-medium text-neutral-900">{inst.template_nome}</div>
                          <div className="text-xs text-neutral-500">
                            {inst.reparto}
                            {inst.scadenza_at && ` · entro ${inst.scadenza_at.slice(11, 16)}`}
                            {inst.assegnato_user && ` · @${inst.assegnato_user}`}
                            {inst.score_compliance != null && ` · score ${inst.score_compliance}%`}
                          </div>
                        </div>
                      </div>
                      <span className="text-neutral-400">→</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Task di oggi */}
        {agenda && agenda.tasks && agenda.tasks.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-red-900 font-playfair">
              Task di oggi
            </h2>
            <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-4 space-y-2">
              {agenda.tasks.map(t => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded border border-neutral-100">
                  <div className="flex items-center gap-2">
                    <PrioritaBadge priorita={t.priorita} />
                    <span className="font-medium">{t.titolo}</span>
                    {t.assegnato_user && (
                      <span className="text-xs text-neutral-500">@{t.assegnato_user}</span>
                    )}
                  </div>
                  <StatoBadge stato={t.stato} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vuoto */}
        {!loading && agenda && (agenda.turni || []).length === 0 && (!agenda.tasks || agenda.tasks.length === 0) && (
          <div className="bg-white border border-dashed border-red-200 rounded-2xl p-8 text-center">
            <div className="text-5xl mb-2">🧑‍🍳</div>
            <div className="text-neutral-700 font-semibold">Nessuna checklist programmata per oggi</div>
            <div className="text-sm text-neutral-500 mt-1">
              {isAdminOrChef
                ? "Attiva uno dei template seed da Configurazione → Template."
                : "Chiedi a un responsabile di attivare i template."}
            </div>
            {isAdminOrChef && (
              <button
                onClick={() => navigate("/cucina/templates")}
                className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 min-h-[48px]"
              >
                Vai ai Template
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatoBadge({ stato }) {
  const map = {
    APERTA:     "bg-brand-cream text-neutral-800 border-neutral-300",
    IN_CORSO:   "bg-blue-50 text-blue-800 border-blue-300",
    COMPLETATA: "bg-green-50 text-green-800 border-green-300",
    SCADUTA:    "bg-red-100 text-red-800 border-red-400",
    SALTATA:    "bg-neutral-100 text-neutral-600 border-neutral-300",
    APERTO:     "bg-brand-cream text-neutral-800 border-neutral-300",
    COMPLETATO: "bg-green-50 text-green-800 border-green-300",
    SCADUTO:    "bg-red-100 text-red-800 border-red-400",
    ANNULLATO:  "bg-neutral-100 text-neutral-500 border-neutral-300 line-through",
  };
  const cls = map[stato] || "bg-neutral-50 text-neutral-700 border-neutral-300";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {stato}
    </span>
  );
}

function PrioritaBadge({ priorita }) {
  const map = {
    ALTA:  "bg-red-100 text-red-800",
    MEDIA: "bg-amber-100 text-amber-800",
    BASSA: "bg-neutral-100 text-neutral-700",
  };
  return (
    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${map[priorita] || "bg-neutral-100"}`}>
      {priorita}
    </span>
  );
}
