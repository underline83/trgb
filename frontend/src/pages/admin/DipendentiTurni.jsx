


// FILE: frontend/src/pages/admin/DipendentiTurni.jsx
// @version: v1.0-dipendenti-turni
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

export default function DipendentiTurni() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState("week"); // "week" | "month"
  const [turni, setTurni] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const token = localStorage.getItem("token");
  const authHeaders = token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};

  const computeRange = () => {
    const today = new Date();
    if (viewMode === "week") {
      const day = today.getDay(); // 0=dom
      const diffToMonday = (day + 6) % 7; // lun=0
      const monday = new Date(today);
      monday.setDate(today.getDate() - diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        from: monday.toISOString().slice(0, 10),
        to: sunday.toISOString().slice(0, 10),
      };
    } else {
      const year = today.getFullYear();
      const month = today.getMonth(); // 0..11
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      return {
        from: first.toISOString().slice(0, 10),
        to: last.toISOString().slice(0, 10),
      };
    }
  };

  const loadTurni = async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = computeRange();
      const res = await fetch(
        `${API_BASE}/dipendenti/turni/calendario?from=${from}&to=${to}`,
        { headers: authHeaders }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore nel caricamento dei turni.");
      }
      const data = await res.json();
      setTurni(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTurni();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const groupByDate = () => {
    const mappa = {};
    for (const t of turni) {
      if (!mappa[t.data]) mappa[t.data] = [];
      mappa[t.data].push(t);
    }
    return mappa;
  };

  const grouped = groupByDate();
  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair">
              📅 Turni dipendenti
            </h1>
            <p className="text-neutral-600 mt-1">
              Vista base dei turni impostati a calendario (settimana o mese).
              In una seconda fase potremo aggiungere drag&amp;drop e
              pianificazione avanzata.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => navigate("/admin")}
              className="px-4 py-2 rounded-full border border-neutral-300 text-sm text-neutral-700 hover:bg-neutral-100 transition"
            >
              ← Torna al menu Amministrazione
            </button>

            <div className="inline-flex items-center rounded-full bg-neutral-100 p-1 border border-neutral-200">
              <button
                onClick={() => setViewMode("week")}
                className={`px-3 py-1 text-xs rounded-full ${
                  viewMode === "week"
                    ? "bg-amber-900 text-amber-50 shadow"
                    : "text-neutral-700"
                }`}
              >
                Settimana
              </button>
              <button
                onClick={() => setViewMode("month")}
                className={`px-3 py-1 text-xs rounded-full ${
                  viewMode === "month"
                    ? "bg-amber-900 text-amber-50 shadow"
                    : "text-neutral-700"
                }`}
              >
                Mese
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="border border-neutral-200 rounded-2xl bg-neutral-50 p-4">
          {loading ? (
            <div className="text-sm text-neutral-600">
              Caricamento turni...
            </div>
          ) : sortedDates.length === 0 ? (
            <div className="text-sm text-neutral-600">
              Nessun turno trovato per il periodo selezionato.
            </div>
          ) : (
            <div className="space-y-4">
              {sortedDates.map((data) => (
                <div key={data} className="bg-white rounded-xl p-3 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-neutral-800">
                      {data}
                    </h2>
                    <span className="text-[11px] text-neutral-500">
                      {grouped[data].length} turni
                    </span>
                  </div>
                  <div className="border border-neutral-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-100 text-neutral-700">
                        <tr>
                          <th className="px-2 py-1 text-left">Dipendente</th>
                          <th className="px-2 py-1 text-left">Ruolo</th>
                          <th className="px-2 py-1 text-left">Turno</th>
                          <th className="px-2 py-1 text-left">Orario</th>
                          <th className="px-2 py-1 text-left">Stato</th>
                          <th className="px-2 py-1 text-left">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouped[data].map((t) => (
                          <tr
                            key={t.id}
                            className="border-t border-neutral-200"
                          >
                            <td className="px-2 py-1">
                              {t.dipendente_cognome} {t.dipendente_nome}
                            </td>
                            <td className="px-2 py-1">
                              {t.dipendente_ruolo}
                            </td>
                            <td className="px-2 py-1">{t.turno_nome}</td>
                            <td className="px-2 py-1">
                              {t.ora_inizio} – {t.ora_fine}
                            </td>
                            <td className="px-2 py-1">
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] bg-emerald-100 text-emerald-800">
                                {t.stato}
                              </span>
                            </td>
                            <td className="px-2 py-1">
                              {t.note || (
                                <span className="text-neutral-400">
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 text-[11px] text-neutral-500">
          Questa è una vista di lettura. In una versione successiva possiamo
          aggiungere: planning grafico, duplicazione settimana, regole per
          copertura minima sala/cucina, ecc.
        </div>
      </div>
    </div>
  );
}
