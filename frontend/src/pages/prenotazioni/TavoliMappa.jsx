// @version: v1.0-tavoli-mappa
// Mappa serale tavoli — vista operativa con assegnazione, Fase 2 Prenotazioni
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";
import StatoBadge from "./components/StatoBadge";

const CANVAS_W = 900;
const CANVAS_H = 600;

const COLORI_STATO = {
  LIBERO:    { fill: "#e5e7eb", stroke: "#9ca3af", text: "#6b7280" }, // gray
  RECORDED:  { fill: "#c7d2fe", stroke: "#6366f1", text: "#312e81" }, // indigo (prenotato)
  ARRIVED:   { fill: "#fde68a", stroke: "#f59e0b", text: "#78350f" }, // amber
  SEATED:    { fill: "#a7f3d0", stroke: "#10b981", text: "#064e3b" }, // emerald
  LEFT:      { fill: "#e5e7eb", stroke: "#6b7280", text: "#374151" }, // gray
  BILL:      { fill: "#bfdbfe", stroke: "#3b82f6", text: "#1e3a5a" }, // blue
  NO_SHOW:   { fill: "#fecaca", stroke: "#ef4444", text: "#7f1d1d" }, // red
  CANCELED:  { fill: "#e5e7eb", stroke: "#9ca3af", text: "#6b7280" }, // gray
  REQUESTED: { fill: "#ddd6fe", stroke: "#8b5cf6", text: "#4c1d95" }, // violet
};

export default function TavoliMappa() {
  const { data: paramData, turno: paramTurno } = useParams();
  const navigate = useNavigate();

  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(paramData || today);
  const [turno, setTurno] = useState(paramTurno || "cena");
  const [mappaData, setMappaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTavolo, setSelectedTavolo] = useState(null);
  const [selectedPren, setSelectedPren] = useState(null);
  const [assegnando, setAssegnando] = useState(null); // pren_id da assegnare
  const [toast, setToast] = useState(null);
  const svgRef = useRef(null);
  const refreshTimer = useRef(null);

  const flash = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Carica mappa ──
  const loadMappa = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/mappa/${data}/${turno}`);
      const d = await r.json();
      setMappaData(d);
    } catch {
      flash("err", "Errore caricamento mappa");
    }
    setLoading(false);
  }, [data, turno]);

  useEffect(() => {
    setLoading(true);
    loadMappa();
  }, [loadMappa]);

  // Auto-refresh ogni 30s
  useEffect(() => {
    refreshTimer.current = setInterval(loadMappa, 30000);
    return () => clearInterval(refreshTimer.current);
  }, [loadMappa]);

  // ── Assegna tavolo ──
  const assegnaTavolo = async (prenId, nometavolo) => {
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/assegna/${prenId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tavolo: nometavolo }),
      });
      if (r.ok) {
        flash("ok", `Tavolo ${nometavolo} assegnato`);
        setAssegnando(null);
        loadMappa();
      }
    } catch {
      flash("err", "Errore assegnazione");
    }
  };

  // ── Cambio stato rapido ──
  const cambiaStato = async (prenId, nuovoStato) => {
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/${prenId}/stato`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: nuovoStato }),
      });
      if (r.ok) {
        flash("ok", `Stato aggiornato: ${nuovoStato}`);
        setSelectedPren(null);
        loadMappa();
      } else {
        const err = await r.json();
        flash("err", err.detail || "Errore");
      }
    } catch {
      flash("err", "Errore di connessione");
    }
  };

  // ── Libera tavolo ──
  const liberaTavolo = async (prenId) => {
    await assegnaTavolo(prenId, "");
  };

  // Navigazione data
  const prevDay = () => {
    const d = new Date(data);
    d.setDate(d.getDate() - 1);
    setData(d.toISOString().slice(0, 10));
  };
  const nextDay = () => {
    const d = new Date(data);
    d.setDate(d.getDate() + 1);
    setData(d.toISOString().slice(0, 10));
  };

  const tavoli = mappaData?.tavoli || [];
  const senzaTavolo = mappaData?.senza_tavolo || [];

  if (loading && !mappaData) return (
    <div className="min-h-screen bg-neutral-50">
      <PrenotazioniNav current="mappa" />
      <div className="text-center py-12 text-neutral-400">Caricamento mappa...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50">
      <PrenotazioniNav current="mappa" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        {toast && (
          <div className={`mb-3 px-4 py-2 rounded-lg text-sm font-medium ${
            toast.type === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
          }`}>{toast.text}</div>
        )}

        {/* Header: data + turno */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button onClick={prevDay} className="px-2 py-1 rounded border hover:bg-neutral-100 text-sm">◀</button>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm" />
            <button onClick={nextDay} className="px-2 py-1 rounded border hover:bg-neutral-100 text-sm">▶</button>
            <button onClick={() => setData(today)}
              className="px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg">
              Oggi
            </button>
          </div>
          <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-0.5">
            <button
              onClick={() => setTurno("pranzo")}
              className={`px-3 py-1 text-sm rounded-md transition ${
                turno === "pranzo" ? "bg-white shadow-sm font-medium text-indigo-700" : "text-neutral-500"
              }`}
            >
              Pranzo
            </button>
            <button
              onClick={() => setTurno("cena")}
              className={`px-3 py-1 text-sm rounded-md transition ${
                turno === "cena" ? "bg-white shadow-sm font-medium text-indigo-700" : "text-neutral-500"
              }`}
            >
              Cena
            </button>
          </div>
          {assegnando && (
            <div className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-medium animate-pulse">
              Clicca su un tavolo libero per assegnare
              <button onClick={() => setAssegnando(null)} className="ml-2 text-amber-600 hover:text-amber-800">✕</button>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          {/* ── Canvas Mappa ── */}
          <div className="flex-1 bg-white rounded-xl border border-neutral-200 overflow-hidden relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              className="w-full"
              style={{ minHeight: 400 }}
            >
              {/* Sfondo */}
              <rect width={CANVAS_W} height={CANVAS_H} fill="#fafafa" />

              {/* Tavoli */}
              {tavoli.map(t => {
                const stato = t.stato_tavolo || "LIBERO";
                const colori = COLORI_STATO[stato] || COLORI_STATO.LIBERO;
                const pren = t.prenotazione;
                const isClickable = assegnando && stato === "LIBERO";

                return (
                  <g
                    key={t.id}
                    onClick={() => {
                      if (assegnando && stato === "LIBERO") {
                        assegnaTavolo(assegnando, t.nome);
                      } else if (pren) {
                        setSelectedPren(pren);
                        setSelectedTavolo(t);
                      }
                    }}
                    style={{ cursor: isClickable ? "crosshair" : pren ? "pointer" : "default" }}
                  >
                    {t.forma === "circle" ? (
                      <ellipse
                        cx={t.posizione_x + t.larghezza / 2}
                        cy={t.posizione_y + t.altezza / 2}
                        rx={t.larghezza / 2}
                        ry={t.altezza / 2}
                        fill={colori.fill}
                        stroke={isClickable ? "#f59e0b" : colori.stroke}
                        strokeWidth={isClickable ? 3 : 1.5}
                        strokeDasharray={isClickable ? "4 2" : "none"}
                      />
                    ) : (
                      <rect
                        x={t.posizione_x}
                        y={t.posizione_y}
                        width={t.larghezza}
                        height={t.altezza}
                        rx={6}
                        fill={colori.fill}
                        stroke={isClickable ? "#f59e0b" : colori.stroke}
                        strokeWidth={isClickable ? 3 : 1.5}
                        strokeDasharray={isClickable ? "4 2" : "none"}
                      />
                    )}
                    {/* Nome tavolo */}
                    <text
                      x={t.posizione_x + t.larghezza / 2}
                      y={t.posizione_y + (pren ? t.altezza / 2 - 10 : t.altezza / 2)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="11"
                      fontWeight="bold"
                      fill={colori.text}
                      className="select-none pointer-events-none"
                    >
                      {t.nome}
                    </text>
                    {/* Info prenotazione se occupato */}
                    {pren && (
                      <>
                        <text
                          x={t.posizione_x + t.larghezza / 2}
                          y={t.posizione_y + t.altezza / 2 + 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="9"
                          fill={colori.text}
                          className="select-none pointer-events-none"
                        >
                          {(pren.cognome || "").slice(0, 8)} ({pren.pax})
                        </text>
                        <text
                          x={t.posizione_x + t.larghezza / 2}
                          y={t.posizione_y + t.altezza / 2 + 14}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="8"
                          fill={colori.text}
                          opacity="0.7"
                          className="select-none pointer-events-none"
                        >
                          {(pren.ora_pasto || "").slice(0, 5)}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Legenda */}
            <div className="absolute bottom-2 left-2 flex gap-2 text-[10px]">
              {[
                { label: "Libero", color: "#e5e7eb" },
                { label: "Prenotato", color: "#c7d2fe" },
                { label: "Arrivato", color: "#fde68a" },
                { label: "Seduto", color: "#a7f3d0" },
                { label: "No-show", color: "#fecaca" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: l.color }}></div>
                  <span className="text-neutral-500">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Sidebar: prenotazioni senza tavolo + dettaglio ── */}
          <div className="w-72 flex-shrink-0 space-y-4">
            {/* Dettaglio prenotazione selezionata */}
            {selectedPren && (
              <div className="bg-white rounded-xl border border-indigo-200 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-indigo-900 text-sm">
                    {selectedPren.nome} {selectedPren.cognome}
                  </h3>
                  <button onClick={() => { setSelectedPren(null); setSelectedTavolo(null); }}
                    className="text-neutral-400 hover:text-neutral-600 text-xs">✕</button>
                </div>
                <div className="text-xs space-y-1 text-neutral-600">
                  <div>Ora: <strong>{(selectedPren.ora_pasto || "").slice(0, 5)}</strong> — Pax: <strong>{selectedPren.pax}</strong></div>
                  {selectedTavolo && <div>Tavolo: <strong>{selectedTavolo.nome}</strong> ({selectedTavolo.zona})</div>}
                  {selectedPren.telefono && <div>Tel: {selectedPren.telefono}</div>}
                  {selectedPren.allergie && (
                    <div className="px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-800">
                      Allergie: {selectedPren.allergie}
                    </div>
                  )}
                  {selectedPren.nota_ristorante && <div className="italic text-neutral-500">Note: {selectedPren.nota_ristorante}</div>}
                  <div className="mt-1"><StatoBadge stato={selectedPren.stato} /></div>
                </div>
                {/* Azioni */}
                <div className="flex flex-wrap gap-1 pt-2 border-t border-neutral-100">
                  {selectedPren.stato === "RECORDED" && (
                    <>
                      <button onClick={() => cambiaStato(selectedPren.id, "SEATED")}
                        className="px-2 py-1 text-[10px] bg-emerald-600 text-white rounded font-medium">Seduto</button>
                      <button onClick={() => cambiaStato(selectedPren.id, "NO_SHOW")}
                        className="px-2 py-1 text-[10px] bg-red-600 text-white rounded font-medium">No-show</button>
                    </>
                  )}
                  {selectedPren.stato === "ARRIVED" && (
                    <button onClick={() => cambiaStato(selectedPren.id, "SEATED")}
                      className="px-2 py-1 text-[10px] bg-emerald-600 text-white rounded font-medium">Seduto</button>
                  )}
                  {(selectedPren.stato === "SEATED" || selectedPren.stato === "BILL") && (
                    <button onClick={() => cambiaStato(selectedPren.id, "LEFT")}
                      className="px-2 py-1 text-[10px] bg-neutral-600 text-white rounded font-medium">Andato via</button>
                  )}
                  {selectedTavolo && selectedPren.stato !== "LEFT" && (
                    <button onClick={() => liberaTavolo(selectedPren.id)}
                      className="px-2 py-1 text-[10px] border border-neutral-300 text-neutral-600 rounded">Libera tavolo</button>
                  )}
                </div>
              </div>
            )}

            {/* Lista senza tavolo */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="font-semibold text-neutral-800 text-sm mb-2">
                Senza tavolo
                {senzaTavolo.length > 0 && (
                  <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                    {senzaTavolo.length}
                  </span>
                )}
              </h3>
              {senzaTavolo.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">Tutti hanno un tavolo assegnato</p>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {senzaTavolo.map(p => (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-sm border transition ${
                        assegnando === p.id
                          ? "bg-amber-50 border-amber-300"
                          : "bg-neutral-50 border-neutral-100 hover:bg-neutral-100"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-neutral-800 text-xs truncate">
                          {p.nome} {p.cognome}
                          {p.vip === 1 && <span className="ml-1">⭐</span>}
                          {p.allergie && <span className="ml-1 text-red-500">⚠️</span>}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          {(p.ora_pasto || "").slice(0, 5)} — {p.pax}p
                        </div>
                      </div>
                      <button
                        onClick={() => setAssegnando(assegnando === p.id ? null : p.id)}
                        className={`px-2 py-1 text-[10px] rounded font-medium transition ${
                          assegnando === p.id
                            ? "bg-amber-500 text-white"
                            : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                        }`}
                      >
                        {assegnando === p.id ? "Annulla" : "Assegna"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="font-semibold text-neutral-800 text-sm mb-2">Riepilogo</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-center p-2 bg-neutral-50 rounded">
                  <div className="text-lg font-bold text-neutral-800">{tavoli.filter(t => t.occupato).length}</div>
                  <div className="text-neutral-500">Occupati</div>
                </div>
                <div className="text-center p-2 bg-neutral-50 rounded">
                  <div className="text-lg font-bold text-neutral-800">{tavoli.filter(t => !t.occupato).length}</div>
                  <div className="text-neutral-500">Liberi</div>
                </div>
                <div className="text-center p-2 bg-neutral-50 rounded">
                  <div className="text-lg font-bold text-amber-600">{senzaTavolo.length}</div>
                  <div className="text-neutral-500">Senza tavolo</div>
                </div>
                <div className="text-center p-2 bg-neutral-50 rounded">
                  <div className="text-lg font-bold text-neutral-800">{tavoli.length}</div>
                  <div className="text-neutral-500">Tavoli totali</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
