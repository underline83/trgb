// @version: v1.0-prenotazioni-settimana
// Vista settimanale riepilogativa — modulo Prenotazioni TRGB
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";

const GIORNI_LABEL = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const GIORNI_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function shiftWeek(iso, weeks) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function getLunedi(iso) {
  const d = new Date(iso + "T12:00:00");
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function PrenotazioniSettimana() {
  const { data: dataParam } = useParams();
  const navigate = useNavigate();
  const oggi = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(getLunedi(dataParam || oggi));
  const [settimana, setSettimana] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`${API_BASE}/prenotazioni/settimana/${data}`)
      .then((r) => r.json())
      .then((d) => { setSettimana(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [data]);

  useEffect(() => {
    const lunedi = getLunedi(dataParam || oggi);
    if (lunedi !== data) setData(lunedi);
  }, [dataParam]);

  const nav = (weeks) => {
    const nuova = shiftWeek(data, weeks);
    setData(nuova);
    navigate(`/prenotazioni/settimana/${nuova}`, { replace: true });
  };

  const goPlanning = (giorno) => {
    navigate(`/prenotazioni/planning/${giorno}`);
  };

  // Range settimana
  const lunD = new Date(data + "T12:00:00");
  const domD = new Date(data + "T12:00:00");
  domD.setDate(domD.getDate() + 6);
  const rangeLabel = `${lunD.getDate()}/${lunD.getMonth()+1} — ${domD.getDate()}/${domD.getMonth()+1}/${domD.getFullYear()}`;

  return (
    <div className="min-h-screen bg-brand-cream">
      <PrenotazioniNav current="settimana" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => nav(-1)} className="p-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 text-lg">◀</button>
            <div className="text-center">
              <div className="text-lg font-bold text-neutral-800">Settimana</div>
              <div className="text-sm text-neutral-500">{rangeLabel}</div>
            </div>
            <button onClick={() => nav(1)} className="p-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 text-lg">▶</button>
            <button
              onClick={() => { setData(getLunedi(oggi)); navigate(`/prenotazioni/settimana/${getLunedi(oggi)}`, { replace: true }); }}
              className="px-3 py-1 text-xs bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium"
            >
              Questa settimana
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-neutral-400">Caricamento...</div>
        ) : settimana ? (
          <div className="grid grid-cols-7 gap-3">
            {settimana.giorni.map((g, i) => {
              const d = new Date(g.data + "T12:00:00");
              const isOggi = g.data === oggi;
              const tot = g.pranzo_count + g.cena_count;
              const totPax = g.pranzo_pax + g.cena_pax;

              return (
                <div
                  key={g.data}
                  onClick={() => !g.chiuso && goPlanning(g.data)}
                  className={`rounded-xl border p-4 transition ${
                    g.chiuso
                      ? "bg-neutral-100 border-neutral-200 opacity-50 cursor-default"
                      : isOggi
                        ? "bg-indigo-50 border-indigo-300 cursor-pointer hover:shadow-md ring-2 ring-indigo-200"
                        : "bg-white border-neutral-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5"
                  }`}
                >
                  <div className="text-center mb-2">
                    <div className={`text-xs font-semibold ${isOggi ? "text-indigo-600" : "text-neutral-500"}`}>
                      {GIORNI_SHORT[i]}
                    </div>
                    <div className={`text-2xl font-bold ${isOggi ? "text-indigo-700" : "text-neutral-800"}`}>
                      {d.getDate()}
                    </div>
                  </div>

                  {g.chiuso ? (
                    <div className="text-center text-xs text-neutral-400 font-medium">CHIUSO</div>
                  ) : (
                    <div className="space-y-1.5">
                      {/* Pranzo */}
                      <div className="text-center">
                        <div className="text-[10px] text-neutral-400 uppercase">Pranzo</div>
                        <div className="text-sm font-semibold text-neutral-700">
                          {g.pranzo_count > 0 ? `${g.pranzo_count} · ${g.pranzo_pax}p` : "—"}
                        </div>
                      </div>
                      {/* Cena */}
                      <div className="text-center">
                        <div className="text-[10px] text-neutral-400 uppercase">Cena</div>
                        <div className="text-sm font-semibold text-neutral-700">
                          {g.cena_count > 0 ? `${g.cena_count} · ${g.cena_pax}p` : "—"}
                        </div>
                      </div>
                      {/* Totale */}
                      {tot > 0 && (
                        <div className="text-center pt-1 border-t border-neutral-100">
                          <span className="text-xs font-bold text-indigo-600">{tot} pren · {totPax} pax</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-neutral-400">Errore nel caricamento</div>
        )}
      </div>
    </div>
  );
}
