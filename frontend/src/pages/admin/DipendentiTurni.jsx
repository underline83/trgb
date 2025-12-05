import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

function formatDateISO(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function addDays(dateObj, days) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + days);
  return d;
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday, 1 = Monday
  const diff = (day === 0 ? -6 : 1) - day; // shift so that Monday is first
  return addDays(date, diff);
}

const weekdayLabels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export default function DipendentiTurni() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [viewMode, setViewMode] = useState("week"); // "week" | "month"
  const [referenceDate, setReferenceDate] = useState(
    formatDateISO(new Date())
  );

  const [dipendenti, setDipendenti] = useState([]);
  const [turniTipi, setTurniTipi] = useState([]);
  const [turni, setTurni] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedRoleFilter, setSelectedRoleFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [modalData, setModalData] = useState({
    dipendente_id: "",
    turno_tipo_id: "",
    data: "",
    note: "",
  });

  // -----------------------------------
  // Helper per intervalli date (settimana/mese)
  // -----------------------------------
  const currentWeekRange = useMemo(() => {
    const base = new Date(referenceDate);
    const monday = getMonday(base);
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(monday, i);
      days.push({
        date: d,
        iso: formatDateISO(d),
        label: weekdayLabels[i],
      });
    }
    return days;
  }, [referenceDate]);

  const currentMonthRange = useMemo(() => {
    const base = new Date(referenceDate);
    const year = base.getFullYear();
    const month = base.getMonth(); // 0-11

    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);

    const days = [];
    let d = new Date(first);
    while (d <= last) {
      days.push({
        date: new Date(d),
        iso: formatDateISO(d),
        dayNumber: d.getDate(),
      });
      d = addDays(d, 1);
    }
    return { year, month, days };
  }, [referenceDate]);

  const roleOptions = useMemo(() => {
    const roles = new Set();
    dipendenti.forEach((d) => {
      if (d.ruolo) roles.add(d.ruolo);
    });
    return Array.from(roles).sort();
  }, [dipendenti]);

  // -----------------------------------
  // Fetch dipendenti + tipi turno + turni nel periodo
  // -----------------------------------
  const fetchDipendenti = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/dipendenti?include_inactive=false`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.detail || "Errore nel caricamento dei dipendenti."
        );
      }
      const data = await res.json();
      setDipendenti(data || []);
    } catch (e) {
      throw e;
    }
  };

  const fetchTurniTipi = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/dipendenti/turni/tipi?include_inactive=false`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.detail || "Errore nel caricamento dei tipi di turno."
        );
      }
      const data = await res.json();
      setTurniTipi(data || []);
    } catch (e) {
      throw e;
    }
  };

  const fetchTurni = async () => {
    setLoading(true);
    setError(null);

    try {
      let fromISO;
      let toISO;

      if (viewMode === "week") {
        const weekDays = currentWeekRange;
        fromISO = weekDays[0].iso;
        toISO = weekDays[weekDays.length - 1].iso;
      } else {
        const { days } = currentMonthRange;
        if (days.length === 0) {
          setTurni([]);
          setLoading(false);
          return;
        }
        fromISO = days[0].iso;
        toISO = days[days.length - 1].iso;
      }

      const params = new URLSearchParams();
      params.set("from", fromISO);
      params.set("to", toISO);
      if (selectedRoleFilter !== "all") {
        params.set("ruolo", selectedRoleFilter);
      }

      const res = await fetch(
        `${API_BASE}/dipendenti/turni/calendario?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.detail || "Errore nel caricamento del calendario turni."
        );
      }

      const data = await res.json();
      setTurni(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const initData = async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchDipendenti();
      await fetchTurniTipi();
      await fetchTurni();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // ricarico i turni quando cambia vista / periodo / filtro ruolo
    fetchTurni();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, referenceDate, selectedRoleFilter]);

  // -----------------------------------
  // Turni indicizzati per accesso rapido
  // -----------------------------------
  const turniByEmployeeAndDate = useMemo(() => {
    const map = {};
    turni.forEach((t) => {
      const key = `${t.dipendente_id}|${t.data}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [turni]);

  const turniByDate = useMemo(() => {
    const map = {};
    turni.forEach((t) => {
      const key = t.data;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [turni]);

  // -----------------------------------
  // Gestione modal per nuovo turno
  // -----------------------------------
  const openModalForCell = (dipendenteId, isoDate) => {
    setModalError(null);
    setModalData({
      dipendente_id: dipendenteId ? String(dipendenteId) : "",
      turno_tipo_id: "",
      data: isoDate || "",
      note: "",
    });
    setModalOpen(true);
  };

  const handleModalChange = (e) => {
    const { name, value } = e.target;
    setModalData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCreateTurno = async (e) => {
    e.preventDefault();
    setModalError(null);

    if (!modalData.dipendente_id || !modalData.turno_tipo_id || !modalData.data) {
      setModalError("Seleziona dipendente, tipo di turno e data.");
      return;
    }

    const payload = {
      dipendente_id: Number(modalData.dipendente_id),
      turno_tipo_id: Number(modalData.turno_tipo_id),
      data: modalData.data,
      note: modalData.note?.trim() || null,
    };

    try {
      const res = await fetch(`${API_BASE}/dipendenti/turni/calendario`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore nella creazione del turno.");
      }

      await fetchTurni();
      setModalOpen(false);
    } catch (e) {
      setModalError(e.message);
    }
  };

  const handleDeleteTurno = async (turnoId) => {
    if (!window.confirm("Vuoi eliminare questo turno dal calendario?")) return;

    try {
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
        throw new Error(err.detail || "Errore nell'eliminazione del turno.");
      }

      await fetchTurni();
    } catch (e) {
      setError(e.message);
    }
  };

  // -----------------------------------
  // RENDER
  // -----------------------------------
  const weekDays = currentWeekRange;
  const { year, month, days: monthDays } = currentMonthRange;

  const visibleDipendenti =
    selectedRoleFilter === "all"
      ? dipendenti
      : dipendenti.filter((d) => d.ruolo === selectedRoleFilter);

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📅 Turni Dipendenti
            </h1>
            <p className="text-neutral-600 text-sm sm:text-base">
              Vista settimanale e mensile dei turni, filtrata per ruolo.
              Assegna i turni cliccando sulle celle del calendario.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => navigate("/admin/dipendenti")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 shadow-sm transition"
            >
              👥 Vai all&apos;anagrafica dipendenti
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate("/admin")}
                className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
              >
                ← Amministrazione
              </button>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-200 bg-white hover:bg-neutral-50 shadow-sm transition"
              >
                ← Home
              </button>
            </div>
          </div>
        </div>

        {/* CONTROLLI */}
        <section className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-600">Vista:</span>
              <div className="inline-flex rounded-xl border border-neutral-300 bg-neutral-50 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("week")}
                  className={`px-3 py-1.5 ${
                    viewMode === "week"
                      ? "bg-amber-600 text-white"
                      : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  Settimana
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("month")}
                  className={`px-3 py-1.5 ${
                    viewMode === "month"
                      ? "bg-amber-600 text-white"
                      : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  Mese
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-600">
                Data di riferimento:
              </span>
              <input
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
                className="border border-neutral-300 rounded-xl px-3 py-1 text-xs shadow-sm bg-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-600">Ruolo:</span>
              <select
                value={selectedRoleFilter}
                onChange={(e) => setSelectedRoleFilter(e.target.value)}
                className="border border-neutral-300 rounded-xl px-3 py-1 text-xs shadow-sm bg-white"
              >
                <option value="all">Tutti</option>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading && (
            <span className="text-xs text-neutral-500">
              Caricamento calendario…
            </span>
          )}
        </section>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* CALENDARIO */}
        {viewMode === "week" ? (
          <section className="mb-8">
            <h2 className="text-lg font-semibold font-playfair text-amber-900 mb-3">
              Settimana:{" "}
              {weekDays[0].iso} → {weekDays[weekDays.length - 1].iso}
            </h2>

            <div className="overflow-x-auto rounded-2xl border border-neutral-200">
              <table className="min-w-full text-xs sm:text-sm">
                <thead className="bg-neutral-50 text-neutral-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Dipendente</th>
                    {weekDays.map((d) => (
                      <th
                        key={d.iso}
                        className="px-3 py-2 text-center whitespace-nowrap"
                      >
                        <div>{d.label}</div>
                        <div className="text-[10px] text-neutral-500">
                          {d.iso}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleDipendenti.length === 0 && (
                    <tr>
                      <td
                        colSpan={1 + weekDays.length}
                        className="px-3 py-4 text-center text-neutral-500"
                      >
                        Nessun dipendente attivo per il filtro selezionato.
                      </td>
                    </tr>
                  )}

                  {visibleDipendenti.map((d) => (
                    <tr
                      key={d.id}
                      className="border-t border-neutral-100 hover:bg-neutral-50"
                    >
                      <td className="px-3 py-2 whitespace-nowrap align-top">
                        <div className="font-medium">
                          {d.nome} {d.cognome}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          {d.ruolo}
                        </div>
                      </td>
                      {weekDays.map((day) => {
                        const key = `${d.id}|${day.iso}`;
                        const list = turniByEmployeeAndDate[key] || [];
                        return (
                          <td
                            key={day.iso}
                            className="px-2 py-2 align-top min-w-[120px]"
                          >
                            <div className="flex flex-col gap-1">
                              {list.map((t) => (
                                <div
                                  key={t.id}
                                  className="flex items-center justify-between gap-1 rounded-xl px-2 py-1 text-[11px] shadow-sm"
                                  style={{
                                    backgroundColor: t.colore_bg || "#E5E7EB",
                                    color: t.colore_testo || "#111827",
                                  }}
                                >
                                  <div>
                                    <div className="font-semibold">
                                      {t.turno_nome}
                                    </div>
                                    <div className="text-[10px] opacity-90">
                                      {t.ora_inizio}–{t.ora_fine}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTurno(t.id)}
                                    className="text-[10px] font-bold px-1 rounded-full border border-white/40 hover:bg-white/20"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() =>
                                  openModalForCell(d.id, day.iso)
                                }
                                className="mt-1 text-[11px] text-amber-700 hover:underline"
                              >
                                + Aggiungi turno
                              </button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="mb-8">
            <h2 className="text-lg font-semibold font-playfair text-amber-900 mb-3">
              Mese:{" "}
              {month + 1 < 10 ? `0${month + 1}` : month + 1}/{year}
            </h2>

            <div className="grid grid-cols-7 gap-2 text-xs sm:text-sm">
              {weekdayLabels.map((lbl) => (
                <div
                  key={lbl}
                  className="text-center font-medium text-neutral-600"
                >
                  {lbl}
                </div>
              ))}

              {/* Celle vuote prima del 1 del mese */}
              {(() => {
                const first = monthDays[0]?.date || new Date(year, month, 1);
                const weekday = getMonday(first); // Monday baseline
                const diff =
                  first.getDay() === 0 ? 6 : first.getDay() - 1; // 0..6
                const blanks = [];
                for (let i = 0; i < diff; i += 1) {
                  blanks.push(
                    <div key={`blank-${i}`} className="h-24 rounded-xl" />
                  );
                }
                return blanks;
              })()}

              {monthDays.map((d) => {
                const list = turniByDate[d.iso] || [];
                return (
                  <div
                    key={d.iso}
                    className="h-28 rounded-2xl border border-neutral-200 bg-neutral-50 px-2 py-1 flex flex-col"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-neutral-700">
                        {d.dayNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => openModalForCell(null, d.iso)}
                        className="text-[11px] text-amber-700 hover:underline"
                      >
                        + turno
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1">
                      {list.length === 0 && (
                        <div className="text-[10px] text-neutral-400">
                          Nessun turno
                        </div>
                      )}
                      {list.slice(0, 3).map((t) => (
                        <div
                          key={t.id}
                          className="rounded-xl px-2 py-1 text-[10px] shadow-sm"
                          style={{
                            backgroundColor: t.colore_bg || "#E5E7EB",
                            color: t.colore_testo || "#111827",
                          }}
                        >
                          <div className="font-semibold truncate">
                            {t.dipendente_nome} {t.dipendente_cognome}
                          </div>
                          <div className="truncate">
                            {t.turno_nome} ({t.ora_inizio}–{t.ora_fine})
                          </div>
                        </div>
                      ))}
                      {list.length > 3 && (
                        <div className="text-[10px] text-neutral-500">
                          + {list.length - 3} altri turni…
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* MODAL NUOVO TURNO */}
        {modalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-6 border border-neutral-200">
              <h3 className="text-lg font-semibold font-playfair text-amber-900 mb-3">
                Aggiungi turno al calendario
              </h3>

              {modalError && (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {modalError}
                </div>
              )}

              <form onSubmit={handleCreateTurno} className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Dipendente
                  </label>
                  <select
                    name="dipendente_id"
                    value={modalData.dipendente_id}
                    onChange={handleModalChange}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    <option value="">Seleziona dipendente…</option>
                    {dipendenti.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nome} {d.cognome} — {d.ruolo}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Tipo di turno
                  </label>
                  <select
                    name="turno_tipo_id"
                    value={modalData.turno_tipo_id}
                    onChange={handleModalChange}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    <option value="">Seleziona tipo turno…</option>
                    {turniTipi.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome} ({t.ora_inizio}–{t.ora_fine}) — {t.ruolo}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Data
                  </label>
                  <input
                    type="date"
                    name="data"
                    value={modalData.data}
                    onChange={handleModalChange}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Note
                  </label>
                  <textarea
                    name="note"
                    value={modalData.note}
                    onChange={handleModalChange}
                    rows={2}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-amber-700 px-5 py-2 text-xs font-semibold text-white shadow hover:bg-amber-800"
                  >
                    Salva turno
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
