// ============================================================
// FILE: frontend/src/pages/admin/DipendentiTurni.jsx
// Calendario turni — vista settimanale + mensile, CRUD base
// ============================================================

// @version: v1.0-dipendenti-turni
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

function toISODate(d) {
  const copy = new Date(d.getTime());
  copy.setHours(12, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function getWeekRange(anchor) {
  const d = new Date(anchor.getTime());
  const day = d.getDay(); // 0=dom, 1=lun, ...
  const diffToMonday = (day + 6) % 7; // 0 se lunedì
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(12, 0, 0, 0);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(d.getTime());
    dd.setDate(d.getDate() + i);
    days.push(dd);
  }

  return {
    from: toISODate(days[0]),
    to: toISODate(days[6]),
    days,
  };
}

function getMonthRange(anchor) {
  const d = new Date(anchor.getTime());
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-11

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  first.setHours(12, 0, 0, 0);
  last.setHours(12, 0, 0, 0);

  return {
    from: toISODate(first),
    to: toISODate(last),
    year,
    month,
  };
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function formatDayLabel(dateObj) {
  const d = new Date(dateObj.getTime());
  const dayIdx = d.getDay(); // 0 dom ... 6 sab
  const weekday = WEEKDAY_LABELS[(dayIdx + 6) % 7];
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${weekday} ${day}/${month}`;
}

function formatISOToItalian(iso) {
  if (!iso) return "";
  const [yy, mm, dd] = iso.split("-");
  return `${dd}/${mm}/${yy}`;
}

export default function DipendentiTurni() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [viewMode, setViewMode] = useState("week"); // "week" | "month"
  const [anchorDate, setAnchorDate] = useState(() => new Date());

  const [dipendenti, setDipendenti] = useState([]);
  const [turniTipi, setTurniTipi] = useState([]);
  const [turni, setTurni] = useState([]);

  const [loadingTurni, setLoadingTurni] = useState(false);
  const [errorTurni, setErrorTurni] = useState(null);

  const [selectedDipendenteId, setSelectedDipendenteId] = useState("");
  const [selectedRuolo, setSelectedRuolo] = useState("");

  // Form "nuovo turno"
  const [newDate, setNewDate] = useState(() => toISODate(new Date()));
  const [newDipendenteId, setNewDipendenteId] = useState("");
  const [newTurnoTipoId, setNewTurnoTipoId] = useState("");
  const [newNote, setNewNote] = useState("");
  const [creating, setCreating] = useState(false);

  // --------------------------------------------------
  // Carico anagrafica e tipi turno all'inizio
  // --------------------------------------------------
  useEffect(() => {
    const loadBase = async () => {
      try {
        // Dipendenti
        {
          const res = await fetch(`${API_BASE}/dipendenti`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Errore nel caricamento dipendenti.");
          }
          const data = await res.json();
          setDipendenti(data || []);
        }

        // Tipi di turno
        {
          const res = await fetch(`${API_BASE}/dipendenti/turni/tipi`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Errore nel caricamento tipi di turno.");
          }
          const data = await res.json();
          setTurniTipi(data || []);
        }
      } catch (e) {
        console.error(e);
      }
    };

    if (token) {
      loadBase();
    }
  }, [token]);

  // --------------------------------------------------
  // Calcolo range date corrente
  // --------------------------------------------------
  const weekInfo = useMemo(() => getWeekRange(anchorDate), [anchorDate]);
  const monthInfo = useMemo(() => getMonthRange(anchorDate), [anchorDate]);

  const { fromDate, toDate, daysForWeek } = useMemo(() => {
    if (viewMode === "week") {
      const r = getWeekRange(anchorDate);
      return { fromDate: r.from, toDate: r.to, daysForWeek: r.days };
    }
    const r = getMonthRange(anchorDate);
    return { fromDate: r.from, toDate: r.to, daysForWeek: getWeekRange(anchorDate).days };
  }, [viewMode, anchorDate]);

  // --------------------------------------------------
  // Carico turni ogni volta che cambia periodo / filtri
  // --------------------------------------------------
  useEffect(() => {
    const loadTurni = async () => {
      if (!token) return;
      setLoadingTurni(true);
      setErrorTurni(null);

      try {
        let url = `${API_BASE}/dipendenti/turni/calendario?from=${fromDate}&to=${toDate}`;
        if (selectedDipendenteId) {
          url += `&dipendente_id=${selectedDipendenteId}`;
        }
        if (selectedRuolo) {
          url += `&ruolo=${encodeURIComponent(selectedRuolo)}`;
        }

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Errore nel caricamento dei turni.");
        }

        const data = await res.json();
        setTurni(data || []);
      } catch (e) {
        console.error(e);
        setErrorTurni(e.message);
      } finally {
        setLoadingTurni(false);
      }
    };

    if (fromDate && toDate) {
      loadTurni();
    }
  }, [token, fromDate, toDate, selectedDipendenteId, selectedRuolo]);

  // --------------------------------------------------
  // Mappe per rendering
  // --------------------------------------------------
  const turniByKey = useMemo(() => {
    const map = {};
    (turni || []).forEach((t) => {
      const key = `${t.dipendente_id}-${t.data}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [turni]);

  const ruoliDisponibili = useMemo(() => {
    const set = new Set();
    dipendenti.forEach((d) => {
      if (d.ruolo) set.add(d.ruolo);
    });
    return Array.from(set).sort();
  }, [dipendenti]);

  const turniRaggruppatiPerData = useMemo(() => {
    const map = {};
    (turni || []).forEach((t) => {
      if (!map[t.data]) map[t.data] = [];
      map[t.data].push(t);
    });
    const entries = Object.entries(map);
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return entries;
  }, [turni]);

  // --------------------------------------------------
  // Navigazione periodo
  // --------------------------------------------------
  const goToday = () => setAnchorDate(new Date());

  const goPrev = () => {
    setAnchorDate((prev) => {
      const d = new Date(prev.getTime());
      if (viewMode === "week") {
        d.setDate(d.getDate() - 7);
      } else {
        d.setMonth(d.getMonth() - 1);
      }
      return d;
    });
  };

  const goNext = () => {
    setAnchorDate((prev) => {
      const d = new Date(prev.getTime());
      if (viewMode === "week") {
        d.setDate(d.getDate() + 7);
      } else {
        d.setMonth(d.getMonth() + 1);
      }
      return d;
    });
  };

  // --------------------------------------------------
  // Creazione turno
  // --------------------------------------------------
  const handleCreateTurno = async (e) => {
    e.preventDefault();
    if (!newDate || !newDipendenteId || !newTurnoTipoId) {
      alert("Compila data, dipendente e tipo turno.");
      return;
    }

    try {
      setCreating(true);
      const payload = {
        dipendente_id: parseInt(newDipendenteId, 10),
        turno_tipo_id: parseInt(newTurnoTipoId, 10),
        data: newDate,
        nota: undefined,
        note: newNote || null,
      };

      const res = await fetch(`${API_BASE}/dipendenti/turni/calendario`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore nella creazione del turno.");
      }

      // Ricarico i turni sul periodo corrente
      const created = await res.json();
      setTurni((prev) => [...prev, created]);
      // reset solo note
      setNewNote("");
    } catch (err) {
      console.error(err);
      alert(err.message || "Errore nella creazione del turno.");
    } finally {
      setCreating(false);
    }
  };

  // --------------------------------------------------
  // Cancellazione turno
  // --------------------------------------------------
  const handleDeleteTurno = async (turnoId) => {
    if (!window.confirm("Vuoi davvero cancellare questo turno?")) return;

    try:
      const res = await fetch(
        `${API_BASE}/dipendenti/turni/calendario/${turnoId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore nella cancellazione del turno.");
      }

      setTurni((prev) => prev.filter((t) => t.id !== turnoId));
    } catch (err) {
      console.error(err);
      alert(err.message || "Errore nella cancellazione del turno.");
    }
  };

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------
  const currentMonthLabel =
    viewMode === "week"
      ? `${formatISOToItalian(fromDate)} → ${formatISOToItalian(toDate)}`
      : (() => {
          const d = new Date(anchorDate.getTime());
          const mese = d.toLocaleString("it-IT", { month: "long" });
          return `${mese} ${d.getFullYear()}`;
        })();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair">
              📅 Turni Dipendenti
            </h1>
            <p className="text-neutral-600 mt-1">
              Calendario turni settimanale e mensile del personale.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => navigate("/admin/dipendenti")}
              className="px-4 py-2 rounded-xl text-sm border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Moduli Dipendenti
            </button>
            <button
              onClick={() => navigate("/admin")}
              className="px-4 py-2 rounded-xl text-xs border border-neutral-200 text-neutral-600 bg-white hover:bg-neutral-50 transition"
            >
              ← Amministrazione
            </button>
          </div>
        </div>

        {/* CONTROLLI PERIODO + VISTA */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              className="px-3 py-2 rounded-xl border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm"
            >
              ←
            </button>
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium">
              {currentMonthLabel}
            </div>
            <button
              type="button"
              onClick={goNext}
              className="px-3 py-2 rounded-xl border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-sm"
            >
              →
            </button>
            <button
              type="button"
              onClick={goToday}
              className="ml-2 px-3 py-2 rounded-xl border border-amber-300 bg-white hover:bg-amber-50 text-xs sm:text-sm text-amber-900"
            >
              Oggi
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm border ${
                viewMode === "week"
                  ? "bg-amber-600 text-white border-amber-700"
                  : "bg-neutral-50 text-neutral-700 border-neutral-300"
              }`}
            >
              Vista settimanale
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm border ${
                viewMode === "month"
                  ? "bg-amber-600 text-white border-amber-700"
                  : "bg-neutral-50 text-neutral-700 border-neutral-300"
              }`}
            >
              Vista mensile (lista)
            </button>
          </div>
        </div>

        {/* FILTRI DIPENDENTE / RUOLO */}
        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <label className="block text-neutral-600 mb-1">Dipendente</label>
              <select
                value={selectedDipendenteId}
                onChange={(e) => setSelectedDipendenteId(e.target.value)}
                className="w-full border border-neutral-300 rounded-xl px-3 py-2 bg-white"
              >
                <option value="">Tutti</option>
                {dipendenti.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.cognome} {d.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-neutral-600 mb-1">Ruolo</label>
              <select
                value={selectedRuolo}
                onChange={(e) => setSelectedRuolo(e.target.value)}
                className="w-full border border-neutral-300 rounded-xl px-3 py-2 bg-white"
              >
                <option value="">Tutti</option>
                {ruoliDisponibili.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-neutral-600 mb-1">
                Data nuovo turno
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full border border-neutral-300 rounded-xl px-3 py-2 bg-white"
              />
            </div>
          </div>
        </div>

        {/* FORM NUOVO TURNO */}
        <form
          onSubmit={handleCreateTurno}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6"
        >
          <h2 className="text-sm font-semibold text-amber-900 mb-3">
            Nuovo turno rapido
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <label className="block text-amber-900/90 mb-1">Dipendente</label>
              <select
                value={newDipendenteId}
                onChange={(e) => setNewDipendenteId(e.target.value)}
                className="w-full border border-amber-300 rounded-xl px-3 py-2 bg-white"
              >
                <option value="">Seleziona…</option>
                {dipendenti.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.cognome} {d.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-amber-900/90 mb-1">Tipo turno</label>
              <select
                value={newTurnoTipoId}
                onChange={(e) => setNewTurnoTipoId(e.target.value)}
                className="w-full border border-amber-300 rounded-xl px-3 py-2 bg-white"
              >
                <option value="">Seleziona…</option>
                {turniTipi.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({t.ora_inizio}-{t.ora_fine})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-amber-900/90 mb-1">Note</label>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Es. sostituzione, cambio turno, ecc."
                className="w-full border border-amber-300 rounded-xl px-3 py-2 bg-white"
              />
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 shadow-sm disabled:opacity-60"
            >
              {creating ? "Salvataggio..." : "Aggiungi turno"}
            </button>
          </div>
        </form>

        {/* STATO CARICAMENTO */}
        {loadingTurni && (
          <div className="mb-4 text-sm text-neutral-600">
            Caricamento turni in corso…
          </div>
        )}
        {errorTurni && (
          <div className="mb-4 text-sm text-red-600">
            Errore: {errorTurni}
          </div>
        )}

        {/* VISTA CALENDARIO */}
        {viewMode === "week" ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-neutral-700 font-semibold border-b border-neutral-200 w-48">
                    Dipendente
                  </th>
                  {daysForWeek.map((d) => (
                    <th
                      key={d.toISOString()}
                      className="px-3 py-2 text-center text-neutral-700 font-semibold border-b border-neutral-200"
                    >
                      {formatDayLabel(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dipendenti.map((d) => {
                  const full = `${d.cognome} ${d.nome}`;
                  return (
                    <tr key={d.id} className="border-b border-neutral-100">
                      <td className="px-3 py-2 align-top text-neutral-800">
                        <div className="font-medium">{full}</div>
                        <div className="text-xs text-neutral-500">
                          {d.ruolo}
                        </div>
                      </td>
                      {daysForWeek.map((day) => {
                        const iso = toISODate(day);
                        const key = `${d.id}-${iso}`;
                        const list = turniByKey[key] || [];
                        return (
                          <td
                            key={iso}
                            className="px-2 py-2 align-top min-w-[120px]"
                          >
                            <div className="flex flex-col gap-1">
                              {list.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => handleDeleteTurno(t.id)}
                                  className="relative rounded-lg px-2 py-1 text-[11px] text-left shadow-sm"
                                  style={{
                                    backgroundColor:
                                      t.colore_bg || "rgba(180, 198, 252, 0.9)",
                                    color: t.colore_testo || "#111827",
                                  }}
                                  title="Clic per cancellare il turno"
                                >
                                  <div className="font-semibold">
                                    {t.turno_nome}
                                  </div>
                                  <div className="text-[10px] opacity-90">
                                    {t.ora_inizio?.slice(0, 5)} -{" "}
                                    {t.ora_fine?.slice(0, 5)}
                                  </div>
                                  {t.note && (
                                    <div className="text-[10px] opacity-90">
                                      {t.note}
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Vista mensile: lista per data */
          <div className="space-y-3">
            {turniRaggruppatiPerData.length === 0 && (
              <div className="text-sm text-neutral-500">
                Nessun turno nel periodo selezionato.
              </div>
            )}

            {turniRaggruppatiPerData.map(([dataIso, lista]) => (
              <div
                key={dataIso}
                className="border border-neutral-200 rounded-2xl p-3 bg-neutral-50"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-neutral-800">
                    {formatISOToItalian(dataIso)}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {lista.length} turno{lista.length !== 1 ? "i" : ""}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {lista.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleDeleteTurno(t.id)}
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-xs shadow-sm"
                      style={{
                        backgroundColor:
                          t.colore_bg || "rgba(180, 198, 252, 0.9)",
                        color: t.colore_testo || "#111827",
                      }}
                      title="Clic per cancellare il turno"
                    >
                      <div className="flex flex-col text-left">
                        <span className="font-semibold">
                          {t.dipendente_cognome} {t.dipendente_nome}
                        </span>
                        <span className="opacity-90">
                          {t.turno_nome} —{" "}
                          {t.ora_inizio?.slice(0, 5)} -{" "}
                          {t.ora_fine?.slice(0, 5)}
                        </span>
                        {t.note && (
                          <span className="opacity-90">{t.note}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// FINE FILE
// ============================================================
