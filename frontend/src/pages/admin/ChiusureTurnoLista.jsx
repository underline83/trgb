// src/pages/admin/ChiusureTurnoLista.jsx
// @version: v2.0-grouped-by-day
// Lista chiusure turno raggruppate per giorno — solo admin
// Ogni giorno mostra riepilogo giornaliero + dettagli pranzo/cena espandibili

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { isAdminRole } from "../../utils/authHelpers";
import VenditeNav from "./VenditeNav";

const API = import.meta.env.VITE_API_BASE_URL;

function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

function fmtDateLong(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// Nome mese italiano
const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

export default function ChiusureTurnoLista() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  const [closures, setClosures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState(null);
  const [expandedTurno, setExpandedTurno] = useState(null); // "date|turno"

  // Filtro mese: default = mese corrente
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  // Calcola range date dal mese selezionato
  const fromDate = useMemo(() => `${year}-${String(month).padStart(2, "0")}-01`, [year, month]);
  const toDate = useMemo(() => {
    const last = new Date(year, month, 0); // ultimo giorno del mese
    return last.toISOString().slice(0, 10);
  }, [year, month]);

  useEffect(() => {
    if (!isAdminRole(role)) return;
    setLoading(true);
    const url = `${API}/admin/finance/shift-closures?from_date=${fromDate}&to_date=${toDate}`;

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then(data => { setClosures(data); setExpandedDay(null); setExpandedTurno(null); })
      .catch(() => setClosures([]))
      .finally(() => setLoading(false));
  }, [fromDate, toDate, token, role]);

  if (!isAdminRole(role)) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <VenditeNav current="chiusure" />
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-700">
            Accesso riservato agli amministratori.
          </div>
        </div>
      </div>
    );
  }

  // ── Raggruppa per giorno ──
  const days = useMemo(() => {
    const map = {};
    for (const c of closures) {
      if (!map[c.date]) map[c.date] = { date: c.date, pranzo: null, cena: null };
      map[c.date][c.turno] = c;
    }
    // Ordina per data decrescente
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [closures]);

  // ── Totali periodo ──
  const totals = useMemo(() => {
    // Per i totali giornalieri, usa la cena se presente (è giornaliera), altrimenti pranzo
    let incassi = 0, copertiTot = 0, speseTot = 0, giorniCount = 0;
    for (const day of days) {
      giorniCount++;
      const best = day.cena || day.pranzo;
      if (best) incassi += best.totale_incassi || 0;
      // Coperti: somma pranzo + cena separatamente
      if (day.pranzo) copertiTot += day.pranzo.coperti || 0;
      if (day.cena) copertiTot += day.cena.coperti || 0;
      // Spese: somma pranzo + cena
      for (const t of [day.pranzo, day.cena]) {
        if (t && t.spese) speseTot += t.spese.reduce((s, sp) => s + sp.importo, 0);
      }
    }
    return { incassi, coperti: copertiTot, spese: speseTot, giorni: giorniCount };
  }, [days]);

  // ── Nav mese ──
  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  // ── Render dettaglio turno ──
  const renderTurnoDetail = (c) => {
    if (!c) return null;
    const totSpese = (c.spese || []).reduce((s, sp) => s + sp.importo, 0);
    return (
      <div className="space-y-3">
        {/* Incassi dettagliati */}
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2 text-sm">
          {[
            ["Contanti", c.contanti],
            ["POS BPM", c.pos_bpm],
            ["POS Sella", c.pos_sella],
            ["TheFork Pay", c.theforkpay],
            ["Stripe/PayPal", c.other_e_payments],
            ["Bonifici", c.bonifici],
            ["Mance POS", c.mance],
            ["Fatture", c.fatture],
          ].filter(([, v]) => v > 0).map(([label, val]) => (
            <div key={label} className="bg-white rounded-lg p-2 border border-neutral-200">
              <div className="text-[10px] text-neutral-400">{label}</div>
              <div className="font-medium">€ {fmt(val)}</div>
            </div>
          ))}
        </div>

        {/* Fondo cassa */}
        {(c.fondo_cassa_inizio > 0 || c.fondo_cassa_fine > 0) && (
          <div className="flex gap-4 text-sm">
            <span className="text-neutral-500">Fondo cassa:</span>
            <span>Inizio <strong>€ {fmt(c.fondo_cassa_inizio)}</strong></span>
            <span>Fine <strong>€ {fmt(c.fondo_cassa_fine)}</strong></span>
          </div>
        )}

        {/* Pre-conti */}
        {c.preconti && c.preconti.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-neutral-500 uppercase mb-1">Pre-conti ({c.preconti.length})</div>
            <div className="flex flex-wrap gap-2">
              {c.preconti.map((p, i) => (
                <span key={i} className="bg-orange-50 border border-orange-200 rounded-lg px-2 py-1 text-xs">
                  {p.tavolo}: <strong>€ {fmt(p.importo)}</strong>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Spese */}
        {c.spese && c.spese.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-red-500 uppercase mb-1">Spese ({c.spese.length}) — Tot. € {fmt(totSpese)}</div>
            <div className="space-y-1">
              {c.spese.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
                    s.tipo === "scontrino" ? "bg-neutral-100 text-neutral-600" :
                    s.tipo === "fattura" ? "bg-blue-50 text-blue-600" :
                    s.tipo === "personale" ? "bg-purple-50 text-purple-600" :
                    "bg-neutral-100 text-neutral-500"
                  }`}>{s.tipo}</span>
                  <span className="flex-1 text-neutral-700">{s.descrizione}</span>
                  <span className="font-medium text-red-700">€ {fmt(s.importo)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Note */}
        {c.note && (
          <div className="text-sm text-neutral-600 bg-white rounded-lg p-2 border border-neutral-200">
            <span className="text-xs font-semibold text-neutral-400 uppercase">Note: </span>{c.note}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-100">
      <VenditeNav current="chiusure" />
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">

        {/* HEADER */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-indigo-900 font-playfair">
                Lista chiusure turno
              </h1>
              <p className="text-neutral-500 text-sm mt-1">
                Riepilogo giornaliero con dettaglio pranzo e cena
              </p>
            </div>
            <button onClick={() => navigate("/vendite/fine-turno")}
              className="px-4 py-2 bg-indigo-700 text-white rounded-xl text-sm font-semibold hover:bg-indigo-800 transition">
              + Nuova chiusura
            </button>
          </div>
        </div>

        {/* FILTRO MESE */}
        <div className="bg-white rounded-2xl shadow p-4 border border-neutral-200">
          <div className="flex items-center justify-center gap-3">
            <button onClick={prevMonth}
              className="w-9 h-9 rounded-xl border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 flex items-center justify-center text-neutral-600 font-bold transition">
              ‹
            </button>
            <div className="text-center min-w-[180px]">
              <div className="text-lg font-bold text-neutral-800">{MESI[month - 1]} {year}</div>
            </div>
            <button onClick={nextMonth} disabled={isCurrentMonth}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold transition ${
                isCurrentMonth
                  ? "border-neutral-200 bg-neutral-50 text-neutral-300 cursor-not-allowed"
                  : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-neutral-600"
              }`}>
              ›
            </button>
          </div>
        </div>

        {/* TOTALI PERIODO */}
        {days.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 border border-neutral-200 text-center">
              <div className="text-[10px] font-semibold text-neutral-400 uppercase mb-1">Giorni</div>
              <div className="text-lg font-bold text-neutral-800">{totals.giorni}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-neutral-200 text-center">
              <div className="text-[10px] font-semibold text-neutral-400 uppercase mb-1">Tot. incassi</div>
              <div className="text-lg font-bold text-neutral-800">€ {fmt(totals.incassi)}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-neutral-200 text-center">
              <div className="text-[10px] font-semibold text-neutral-400 uppercase mb-1">Tot. coperti</div>
              <div className="text-lg font-bold text-neutral-800">{totals.coperti}</div>
            </div>
            {totals.spese > 0 && (
              <div className="bg-white rounded-xl p-4 border border-neutral-200 text-center">
                <div className="text-[10px] font-semibold text-red-400 uppercase mb-1">Tot. spese</div>
                <div className="text-lg font-bold text-red-700">€ {fmt(totals.spese)}</div>
              </div>
            )}
          </div>
        )}

        {/* LISTA PER GIORNO */}
        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-neutral-400 animate-pulse">Caricamento...</div>
        ) : days.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-neutral-400">
            Nessuna chiusura trovata per {MESI[month - 1]} {year}.
          </div>
        ) : (
          <div className="space-y-3">
            {days.map(day => {
              const { pranzo, cena } = day;
              const isDayExpanded = expandedDay === day.date;

              // Totali giorno: usa cena se presente (è giornaliera), altrimenti pranzo
              const best = cena || pranzo;
              const dayIncassi = best?.totale_incassi || 0;
              const dayChiusuraRT = best?.preconto || 0;
              const dayCopertiP = pranzo?.coperti || 0;
              const dayCopertiC = cena?.coperti || 0;
              const dayCoperti = dayCopertiP + dayCopertiC;

              // Saldo giorno: usa il saldo della cena (è giornaliero), oppure pranzo
              const daySaldo = cena?.saldo ?? pranzo?.saldo ?? 0;
              const dayQuadra = Math.abs(daySaldo) < 0.5;

              // Turni presenti
              const hasBoth = pranzo && cena;
              const onlyPranzo = pranzo && !cena;
              const onlyCena = !pranzo && cena;

              return (
                <div key={day.date} className="bg-white rounded-2xl shadow border border-neutral-200 overflow-hidden">
                  {/* ── Riga giorno ── */}
                  <button type="button" onClick={() => setExpandedDay(isDayExpanded ? null : day.date)}
                    className="w-full text-left p-4 hover:bg-neutral-50 transition">
                    <div className="flex items-center gap-3">
                      {/* Indicatore quadratura */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${
                        dayQuadra ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                      }`}>
                        {new Date(day.date + "T00:00:00").getDate()}
                      </div>

                      {/* Data + turni presenti */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-neutral-800 capitalize">{fmtDate(day.date)}</span>
                          {pranzo && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">pranzo</span>}
                          {cena && <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">cena</span>}
                          {(onlyPranzo || onlyCena) && (
                            <span className="text-[10px] text-neutral-400">(solo {onlyPranzo ? "pranzo" : "cena"})</span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-400 mt-0.5">
                          {best?.created_by && <>Inserita da <span className="font-medium text-neutral-600">{best.created_by}</span></>}
                        </div>
                      </div>

                      {/* KPI giornalieri */}
                      <div className="hidden md:flex items-center gap-4 text-right">
                        <div>
                          <div className="text-[10px] text-neutral-400 uppercase">Chiusura RT</div>
                          <div className="text-sm font-bold text-neutral-800">€ {fmt(dayChiusuraRT)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-neutral-400 uppercase">Incassi</div>
                          <div className="text-sm font-bold text-neutral-800">€ {fmt(dayIncassi)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-neutral-400 uppercase">Coperti</div>
                          <div className="text-sm font-bold text-neutral-800">{dayCoperti}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-neutral-400 uppercase">Saldo</div>
                          <div className={`text-sm font-bold ${dayQuadra ? "text-emerald-600" : "text-red-600"}`}>
                            {daySaldo >= 0 ? "+" : ""}{fmt(daySaldo)}
                          </div>
                        </div>
                      </div>

                      <span className={`text-neutral-400 transition-transform ${isDayExpanded ? "rotate-180" : ""}`}>▼</span>
                    </div>

                    {/* KPI mobile (sotto la riga) */}
                    <div className="flex md:hidden items-center gap-3 mt-2 text-xs text-neutral-500">
                      <span>RT € {fmt(dayChiusuraRT)}</span>
                      <span>Inc. € {fmt(dayIncassi)}</span>
                      <span>Cop. {dayCoperti}</span>
                      <span className={dayQuadra ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                        {daySaldo >= 0 ? "+" : ""}{fmt(daySaldo)}
                      </span>
                    </div>
                  </button>

                  {/* ── Dettaglio giorno espanso ── */}
                  {isDayExpanded && (
                    <div className="border-t border-neutral-200">
                      {/* Turni */}
                      {["pranzo", "cena"].map(turno => {
                        const c = day[turno];
                        if (!c) return null;
                        const turnoKey = `${day.date}|${turno}`;
                        const isTurnoExpanded = expandedTurno === turnoKey;
                        const totSpese = (c.spese || []).reduce((s, sp) => s + sp.importo, 0);
                        const saldo = c.saldo ?? 0;
                        const turnoQuadra = Math.abs(saldo) < 0.5;

                        return (
                          <div key={turno} className={`${turno === "cena" && day.pranzo ? "border-t border-neutral-100" : ""}`}>
                            {/* Header turno */}
                            <button type="button"
                              onClick={() => setExpandedTurno(isTurnoExpanded ? null : turnoKey)}
                              className="w-full text-left px-5 py-3 hover:bg-neutral-50 transition">
                              <div className="flex items-center gap-3">
                                <span className="text-lg">{turno === "pranzo" ? "☀️" : "🌙"}</span>
                                <span className="font-semibold text-neutral-700 capitalize flex-1">{turno}</span>

                                <div className="flex items-center gap-3 text-xs text-neutral-500">
                                  <span>RT € {fmt(c.preconto)}</span>
                                  <span>Inc. € {fmt(c.totale_incassi)}</span>
                                  <span>Cop. {c.coperti || 0}</span>
                                  {totSpese > 0 && <span className="text-red-600">Spese € {fmt(totSpese)}</span>}
                                  <span className={`font-bold ${turnoQuadra ? "text-emerald-600" : "text-red-600"}`}>
                                    {saldo >= 0 ? "+" : ""}{fmt(saldo)}
                                  </span>
                                  <span className="text-neutral-400">di {c.created_by || "—"}</span>
                                </div>

                                <span className={`text-neutral-300 text-xs transition-transform ${isTurnoExpanded ? "rotate-180" : ""}`}>▼</span>
                              </div>
                            </button>

                            {/* Dettaglio turno espanso */}
                            {isTurnoExpanded && (
                              <div className="px-5 pb-4 bg-neutral-50">
                                {renderTurnoDetail(c)}
                                <div className="flex gap-2 pt-3">
                                  <button onClick={() => navigate(`/vendite/fine-turno?date=${c.date}&turno=${c.turno}`)}
                                    className="px-3 py-1.5 bg-indigo-100 text-indigo-800 rounded-lg text-xs font-semibold hover:bg-indigo-200 transition">
                                    Modifica
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
