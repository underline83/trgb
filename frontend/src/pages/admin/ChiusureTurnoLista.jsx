// src/pages/admin/ChiusureTurnoLista.jsx
// @version: v1.0-lista-chiusure
// Lista completa chiusure turno — solo admin
// Mostra tutte le chiusure con dettagli completi, chi le ha inserite, stato quadratura

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import VenditeNav from "./VenditeNav";

const API = import.meta.env.VITE_API_BASE_URL;

function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return "";
  const parts = d.split("-");
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function ChiusureTurnoLista() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  const [closures, setClosures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTurno, setFiltroTurno] = useState("tutti");
  const [expandedId, setExpandedId] = useState(null);

  // Default: last 30 days
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (role !== "admin") return;
    setLoading(true);
    let url = `${API}/admin/finance/shift-closures?from_date=${fromDate}&to_date=${toDate}`;
    if (filtroTurno !== "tutti") url += `&turno=${filtroTurno}`;

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then(data => setClosures(data))
      .catch(() => setClosures([]))
      .finally(() => setLoading(false));
  }, [fromDate, toDate, filtroTurno, token, role]);

  if (role !== "admin") {
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

  const totals = useMemo(() => {
    return closures.reduce((acc, c) => ({
      incassi: acc.incassi + (c.totale_incassi || 0),
      preconto: acc.preconto + (c.preconto || 0),
      coperti: acc.coperti + (c.coperti || 0),
      spese: acc.spese + (c.spese || []).reduce((s, sp) => s + sp.importo, 0),
    }), { incassi: 0, preconto: 0, coperti: 0, spese: 0 });
  }, [closures]);

  return (
    <div className="min-h-screen bg-neutral-100">
      <VenditeNav current="chiusure" />
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">

        {/* HEADER */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-indigo-900 font-playfair">
                📋 Lista chiusure turno
              </h1>
              <p className="text-neutral-500 text-sm mt-1">
                Storico chiusure pranzo e cena compilate dallo staff
              </p>
            </div>
            <button onClick={() => navigate("/vendite/fine-turno")}
              className="px-4 py-2 bg-indigo-700 text-white rounded-xl text-sm font-semibold hover:bg-indigo-800 transition">
              + Nuova chiusura
            </button>
          </div>
        </div>

        {/* FILTRI */}
        <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase">Da</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="border border-neutral-300 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase">A</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="border border-neutral-300 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-1">
              {["tutti", "pranzo", "cena"].map(t => (
                <button key={t} onClick={() => setFiltroTurno(t)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                    filtroTurno === t
                      ? "bg-indigo-100 text-indigo-800 border-indigo-300"
                      : "bg-neutral-50 text-neutral-500 border-neutral-200 hover:border-neutral-300"
                  }`}>
                  {t === "tutti" ? "Tutti" : t === "pranzo" ? "☀️ Pranzo" : "🌙 Cena"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* TOTALI PERIODO */}
        {closures.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 border border-neutral-200 text-center">
              <div className="text-[10px] font-semibold text-neutral-400 uppercase mb-1">Chiusure</div>
              <div className="text-lg font-bold text-neutral-800">{closures.length}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-neutral-200 text-center">
              <div className="text-[10px] font-semibold text-neutral-400 uppercase mb-1">Tot. incassi</div>
              <div className="text-lg font-bold text-neutral-800">€ {fmt(totals.incassi)}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-neutral-200 text-center">
              <div className="text-[10px] font-semibold text-neutral-400 uppercase mb-1">Tot. coperti</div>
              <div className="text-lg font-bold text-neutral-800">{totals.coperti}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-neutral-200 text-center">
              <div className="text-[10px] font-semibold text-red-400 uppercase mb-1">Tot. spese</div>
              <div className="text-lg font-bold text-red-700">€ {fmt(totals.spese)}</div>
            </div>
          </div>
        )}

        {/* LISTA */}
        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-neutral-400 animate-pulse">Caricamento...</div>
        ) : closures.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-neutral-400">
            Nessuna chiusura trovata nel periodo selezionato.
          </div>
        ) : (
          <div className="space-y-3">
            {closures.map(c => {
              const totSpese = (c.spese || []).reduce((s, sp) => s + sp.importo, 0);
              const totPreconti = (c.preconti || []).reduce((s, p) => s + p.importo, 0);
              // Quadratura: entrate − giustificato
              const entrate = (c.totale_incassi || 0) + (c.fondo_cassa_inizio || 0) - (c.fondo_cassa_fine || 0);
              const giustificato = (c.preconto || 0) + totPreconti + totSpese + (c.fatture || 0);
              const diff = entrate - giustificato;
              const quadra = Math.abs(diff) < 0.5;
              const isExpanded = expandedId === c.id;

              return (
                <div key={c.id} className="bg-white rounded-2xl shadow border border-neutral-200 overflow-hidden">
                  {/* Riga principale — click per espandere */}
                  <button type="button" onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    className="w-full text-left p-4 hover:bg-neutral-50 transition">
                    <div className="flex items-center gap-3">
                      {/* Turno badge */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                        c.turno === "pranzo" ? "bg-indigo-100" : "bg-indigo-100"
                      }`}>
                        {c.turno === "pranzo" ? "☀️" : "🌙"}
                      </div>

                      {/* Data + turno + autore */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-neutral-800">{fmtDate(c.date)}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            c.turno === "pranzo" ? "bg-indigo-100 text-indigo-700" : "bg-indigo-100 text-indigo-700"
                          }`}>
                            {c.turno}
                          </span>
                          <span className={`w-2 h-2 rounded-full ${quadra ? "bg-emerald-500" : "bg-red-500"}`} title={quadra ? "Quadra" : "Non quadra"} />
                        </div>
                        <div className="text-xs text-neutral-400 mt-0.5">
                          Inserita da <span className="font-medium text-neutral-600">{c.created_by || "—"}</span>
                          {c.updated_at && <span className="ml-2">(agg. {c.updated_at.slice(0, 16).replace("T", " ")})</span>}
                        </div>
                      </div>

                      {/* Totali rapidi */}
                      <div className="hidden md:flex items-center gap-4 text-right">
                        <div>
                          <div className="text-[10px] text-neutral-400 uppercase">Chiusura</div>
                          <div className="text-sm font-bold text-neutral-800">€ {fmt(c.preconto)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-neutral-400 uppercase">Incassi</div>
                          <div className="text-sm font-bold text-neutral-800">€ {fmt(c.totale_incassi)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-neutral-400 uppercase">Coperti</div>
                          <div className="text-sm font-bold text-neutral-800">{c.coperti || 0}</div>
                        </div>
                        {totSpese > 0 && (
                          <div>
                            <div className="text-[10px] text-red-400 uppercase">Spese</div>
                            <div className="text-sm font-bold text-red-700">€ {fmt(totSpese)}</div>
                          </div>
                        )}
                        <div title="Entrate − Giustificato (chiusura + preconti + spese + fatture)">
                          <div className="text-[10px] text-neutral-400 uppercase">Quadr.</div>
                          <div className={`text-sm font-bold ${quadra ? "text-emerald-600" : "text-red-600"}`}>
                            {diff >= 0 ? "+" : ""}{fmt(diff)}
                          </div>
                        </div>
                      </div>

                      <span className={`text-neutral-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</span>
                    </div>
                  </button>

                  {/* Dettagli espansi */}
                  {isExpanded && (
                    <div className="border-t border-neutral-200 p-4 bg-neutral-50 space-y-4">
                      {/* Incassi dettagliati */}
                      <div>
                        <div className="text-xs font-semibold text-neutral-500 uppercase mb-2">Dettaglio incassi</div>
                        <div className="grid grid-cols-3 md:grid-cols-4 gap-2 text-sm">
                          {[
                            ["Contanti", c.contanti],
                            ["POS BPM", c.pos_bpm],
                            ["POS Sella", c.pos_sella],
                            ["TheFork Pay", c.theforkpay],
                            ["Stripe/PayPal", c.other_e_payments],
                            ["Bonifici", c.bonifici],
                            ["Mance", c.mance],
                            ["Fatture", c.fatture],
                          ].filter(([, v]) => v > 0).map(([label, val]) => (
                            <div key={label} className="bg-white rounded-lg p-2 border border-neutral-200">
                              <div className="text-[10px] text-neutral-400">{label}</div>
                              <div className="font-medium">€ {fmt(val)}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Fondo cassa */}
                      {(c.fondo_cassa_inizio > 0 || c.fondo_cassa_fine > 0) && (
                        <div>
                          <div className="text-xs font-semibold text-neutral-500 uppercase mb-2">Fondo cassa</div>
                          <div className="flex gap-4 text-sm">
                            <span>Inizio: <strong>€ {fmt(c.fondo_cassa_inizio)}</strong></span>
                            <span>Fine: <strong>€ {fmt(c.fondo_cassa_fine)}</strong></span>
                          </div>
                        </div>
                      )}

                      {/* Pre-conti */}
                      {c.preconti && c.preconti.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-neutral-500 uppercase mb-2">Pre-conti ({c.preconti.length})</div>
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
                          <div className="text-xs font-semibold text-red-500 uppercase mb-2">Spese ({c.spese.length}) — Tot. € {fmt(totSpese)}</div>
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
                        <div>
                          <div className="text-xs font-semibold text-neutral-500 uppercase mb-1">Note</div>
                          <div className="text-sm text-neutral-600 bg-white rounded-lg p-2 border border-neutral-200">
                            {c.note}
                          </div>
                        </div>
                      )}

                      {/* Azioni */}
                      <div className="flex gap-2 pt-2">
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
    </div>
  );
}
