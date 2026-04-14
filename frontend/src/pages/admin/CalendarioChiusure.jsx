// src/pages/admin/CalendarioChiusure.jsx
// @version: v2.0-turni-chiusi
// Configurazione giorni di chiusura: giorno settimanale + ferie/festivi + turni chiusi
// Incluso dentro la pagina Impostazioni Vendite

import React, { useState, useEffect, useMemo } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import Tooltip from "../../components/Tooltip";

const GIORNI_SETTIMANA = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

function fmtDateIT(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function CalendarioChiusure() {
  const [config, setConfig] = useState({ giorno_chiusura_settimanale: null, giorni_chiusi: [], turni_chiusi: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // Form nuovo turno chiuso
  const [nuovoData, setNuovoData] = useState("");
  const [nuovoTurno, setNuovoTurno] = useState("cena");
  const [nuovoMotivo, setNuovoMotivo] = useState("");

  // Calendario navigazione
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth()); // 0-indexed

  // Carica config
  useEffect(() => {
    apiFetch(`${API_BASE}/settings/closures-config/`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setConfig({ ...data, turni_chiusi: data.turni_chiusi || [] }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Salva
  const save = async (newConfig) => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch(`${API_BASE}/settings/closures-config/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig({ ...data, turni_chiusi: data.turni_chiusi || [] });
        setMsg({ type: "ok", text: "Salvato" });
        setTimeout(() => setMsg(null), 2000);
      } else {
        const err = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: err.detail || "Errore" });
      }
    } catch {
      setMsg({ type: "err", text: "Errore di rete" });
    } finally {
      setSaving(false);
    }
  };

  // Cambio giorno settimanale
  const handleGiornoSettimanale = (val) => {
    const v = val === "" ? null : parseInt(val);
    const newConfig = { ...config, giorno_chiusura_settimanale: v };
    setConfig(newConfig);
    save(newConfig);
  };

  // Toggle giorno chiuso
  const toggleGiornoChiuso = (dateStr) => {
    const set = new Set(config.giorni_chiusi);
    if (set.has(dateStr)) set.delete(dateStr);
    else set.add(dateStr);
    const newConfig = { ...config, giorni_chiusi: [...set].sort() };
    setConfig(newConfig);
    save(newConfig);
  };

  // Rimuovi giorno chiuso dalla lista
  const removeGiornoChiuso = (dateStr) => {
    const newConfig = { ...config, giorni_chiusi: config.giorni_chiusi.filter(d => d !== dateStr) };
    setConfig(newConfig);
    save(newConfig);
  };

  // ── Turni chiusi ──
  const addTurnoChiuso = () => {
    if (!nuovoData) return;
    const exists = (config.turni_chiusi || []).some(t => t.data === nuovoData && t.turno === nuovoTurno);
    if (exists) {
      setMsg({ type: "err", text: "Questo turno chiuso esiste già" });
      setTimeout(() => setMsg(null), 2000);
      return;
    }
    const nuovi = [...(config.turni_chiusi || []), { data: nuovoData, turno: nuovoTurno, motivo: nuovoMotivo }];
    nuovi.sort((a, b) => a.data.localeCompare(b.data) || a.turno.localeCompare(b.turno));
    const newConfig = { ...config, turni_chiusi: nuovi };
    setConfig(newConfig);
    save(newConfig);
    setNuovoData("");
    setNuovoMotivo("");
  };

  const removeTurnoChiuso = (data, turno) => {
    const nuovi = (config.turni_chiusi || []).filter(t => !(t.data === data && t.turno === turno));
    const newConfig = { ...config, turni_chiusi: nuovi };
    setConfig(newConfig);
    save(newConfig);
  };

  // Calendario griglia
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    const offset = (firstDay.getDay() + 6) % 7; // 0=Lun
    const days = [];
    for (let i = 0; i < offset; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dt = new Date(calYear, calMonth, d);
      const weekdayIdx = (dt.getDay() + 6) % 7; // 0=Lun..6=Dom
      days.push({ day: d, iso, weekdayIdx });
    }
    return days;
  }, [calYear, calMonth]);

  const giornoChiusuraSet = useMemo(() => new Set(config.giorni_chiusi), [config.giorni_chiusi]);

  // Set turni chiusi per lookup veloce nel calendario
  const turniChiusiMap = useMemo(() => {
    const m = {};
    for (const tc of (config.turni_chiusi || [])) {
      if (!m[tc.data]) m[tc.data] = new Set();
      m[tc.data].add(tc.turno);
    }
    return m;
  }, [config.turni_chiusi]);

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  if (loading) return <div className="text-neutral-400 text-sm animate-pulse py-4">Caricamento...</div>;

  return (
    <div className="space-y-6">
      {/* GIORNO SETTIMANALE */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider mb-3">
          Giorno di chiusura settimanale
        </h3>
        <p className="text-xs text-neutral-500 mb-3">
          Se il giorno selezionato ha corrispettivi e incassi a zero, viene automaticamente considerato chiuso nelle statistiche.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleGiornoSettimanale("")}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition ${
              config.giorno_chiusura_settimanale === null
                ? "bg-indigo-100 border-indigo-300 text-indigo-800"
                : "bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            Nessuno
          </button>
          {GIORNI_SETTIMANA.map((g, idx) => (
            <button
              key={idx}
              onClick={() => handleGiornoSettimanale(idx)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition ${
                config.giorno_chiusura_settimanale === idx
                  ? "bg-red-100 border-red-300 text-red-800"
                  : "bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* CALENDARIO FERIE / GIORNI CHIUSI */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider mb-1">
          Ferie e chiusure straordinarie
        </h3>
        <p className="text-xs text-neutral-500 mb-4">
          Clicca su un giorno per segnarlo come chiuso (ferie, festivi, chiusure straordinarie). Clicca di nuovo per rimuoverlo.
        </p>

        {/* Nav mese */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <button onClick={prevMonth} className="w-8 h-8 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 flex items-center justify-center text-neutral-600 font-bold">‹</button>
          <div className="text-sm font-bold text-neutral-800 min-w-[150px] text-center">
            {MESI[calMonth]} {calYear}
          </div>
          <button onClick={nextMonth} className="w-8 h-8 rounded-lg border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 flex items-center justify-center text-neutral-600 font-bold">›</button>
        </div>

        {/* Griglia */}
        <div className="grid grid-cols-7 text-xs text-neutral-400 font-semibold mb-1 text-center">
          {["Lun","Mar","Mer","Gio","Ven","Sab","Dom"].map(d => <span key={d}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((cell, idx) => {
            if (!cell) return <div key={idx} />;

            const isChiuso = giornoChiusuraSet.has(cell.iso);
            const isGiornoSettimanale = config.giorno_chiusura_settimanale === cell.weekdayIdx;
            const hasTurnoChiuso = !!turniChiusiMap[cell.iso];
            const isPast = new Date(cell.iso + "T00:00:00") < new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");

            return (
              <Tooltip
                key={idx}
                className="w-full"
                label={
                  isChiuso ? `${cell.iso} — CHIUSO (clicca per rimuovere)`
                  : isGiornoSettimanale ? `${cell.iso} — Giorno chiusura settimanale`
                  : hasTurnoChiuso ? `${cell.iso} — Turno parziale chiuso`
                  : `${cell.iso} — Clicca per chiudere`
                }
              >
                <button
                  onClick={() => toggleGiornoChiuso(cell.iso)}
                  className={`relative w-full rounded-lg border text-xs h-9 font-medium transition ${
                    isChiuso
                      ? "bg-red-500 border-red-600 text-white"
                      : isGiornoSettimanale
                        ? "bg-red-50 border-red-200 text-red-400"
                        : hasTurnoChiuso
                          ? "bg-amber-50 border-amber-300 text-amber-700"
                          : isPast
                            ? "bg-neutral-50 border-neutral-100 text-neutral-400"
                            : "bg-white border-neutral-200 text-neutral-700 hover:bg-indigo-50 hover:border-indigo-300"
                  }`}
                >
                  {cell.day}
                  {hasTurnoChiuso && !isChiuso && (
                    <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>

        {/* Legenda */}
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-neutral-500">
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-red-500" />
            <span>Chiuso manualmente (ferie)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-200" />
            <span>Giorno chiusura settimanale</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-amber-50 border border-amber-300" />
            <span>Turno parziale chiuso</span>
          </div>
        </div>
      </div>

      {/* LISTA GIORNI CHIUSI */}
      {config.giorni_chiusi.length > 0 && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider mb-3">
            Giorni chiusi impostati ({config.giorni_chiusi.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {config.giorni_chiusi.map(d => (
              <span key={d} className="inline-flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1 text-xs text-red-800">
                {fmtDateIT(d)}
                <button onClick={() => removeGiornoChiuso(d)} className="ml-1 text-red-400 hover:text-red-700 font-bold">×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* TURNI SINGOLI CHIUSI */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider mb-1">
          Turni singoli chiusi
        </h3>
        <p className="text-xs text-neutral-500 mb-4">
          Per chiusure parziali: es. Pasqua aperto solo a pranzo, vigilia solo a cena.
        </p>

        {/* Form aggiunta */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-[10px] font-semibold text-neutral-400 uppercase mb-1">Data</label>
            <input
              type="date"
              value={nuovoData}
              onChange={e => setNuovoData(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-200 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-neutral-400 uppercase mb-1">Turno</label>
            <select
              value={nuovoTurno}
              onChange={e => setNuovoTurno(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-200 outline-none"
            >
              <option value="pranzo">Pranzo</option>
              <option value="cena">Cena</option>
            </select>
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[10px] font-semibold text-neutral-400 uppercase mb-1">Motivo (opzionale)</label>
            <input
              type="text"
              value={nuovoMotivo}
              onChange={e => setNuovoMotivo(e.target.value)}
              placeholder="es. Pasqua, evento privato..."
              className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-200 outline-none"
            />
          </div>
          <button
            onClick={addTurnoChiuso}
            disabled={!nuovoData || saving}
            className="px-4 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Aggiungi
          </button>
        </div>

        {/* Tabella turni chiusi */}
        {(config.turni_chiusi || []).length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-neutral-400 uppercase">Data</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-neutral-400 uppercase">Turno</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-neutral-400 uppercase">Motivo</th>
                  <th className="px-3 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {(config.turni_chiusi || []).map((tc, i) => (
                  <tr key={`${tc.data}-${tc.turno}`} className={i % 2 === 0 ? "bg-white" : "bg-neutral-50"}>
                    <td className="px-3 py-2 font-medium text-neutral-800">{fmtDateIT(tc.data)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        tc.turno === "pranzo"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-indigo-100 text-indigo-700"
                      }`}>
                        {tc.turno}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-600">{tc.motivo || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => removeTurnoChiuso(tc.data, tc.turno)}
                        className="px-2 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition border border-red-200"
                      >
                        Elimina
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-neutral-400 italic">Nessun turno chiuso configurato.</p>
        )}
      </div>

      {/* Feedback */}
      {msg && (
        <div className={`text-xs font-medium px-3 py-1.5 rounded-lg ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}
      {saving && <div className="text-xs text-neutral-400 animate-pulse">Salvataggio...</div>}
    </div>
  );
}
