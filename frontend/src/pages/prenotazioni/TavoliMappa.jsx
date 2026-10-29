// @version: v2.5-sposta — tavoli trascinabili per il turno (in assegnazione o con «✋ Sposta»), «↺ Sala com'era»; v2.4-unioni — «🔗 Unisci» (anche assegnando): tavoli uniti per il turno disegnati come un rettangolo unico, «Stacca»; uniti anche i tavoli di una stessa prenotazione; v2.3-menu-nei-bordi — menu del tavolo sempre dentro la mappa; v2.2-dividi — tavoli dividibili spezzati in A/B per il turno; v2.1-menu-tavolo — clic su tavolo libero: aggiungi prenotazione / blocca tavolo (come TheFork Manager)
// Modulo: prenotazioni
// Mappa serale tavoli — vista operativa con assegnazione, Fase 2 Prenotazioni
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";
import StatoBadge from "./components/StatoBadge";
import PrenotazioniForm from "./PrenotazioniForm";
import { Btn } from "../../components/ui";
import { CANVAS_W, CANVAS_H, COLORE_TAVOLO, FormaTavolo, FormaElemento, SchedeSale } from "./components/Piantina";

const COLORI_STATO = {
  LIBERO:    { fill: COLORE_TAVOLO, stroke: "#9fbfba", text: "#1f2937" }, // verde salvia (come TheFork)
  RECORDED:  { fill: "#c7d2fe", stroke: "#6366f1", text: "#312e81" }, // indigo (prenotato)
  ARRIVED:   { fill: "#fde68a", stroke: "#f59e0b", text: "#78350f" }, // amber
  SEATED:    { fill: "#a7f3d0", stroke: "#10b981", text: "#064e3b" }, // emerald
  LEFT:      { fill: "#e5e7eb", stroke: "#6b7280", text: "#374151" }, // gray
  BILL:      { fill: "#bfdbfe", stroke: "#3b82f6", text: "#1e3a5a" }, // blue
  NO_SHOW:   { fill: "#fecaca", stroke: "#ef4444", text: "#7f1d1d" }, // red
  CANCELED:  { fill: "#e5e7eb", stroke: "#9ca3af", text: "#6b7280" }, // gray
  REQUESTED: { fill: "#ddd6fe", stroke: "#8b5cf6", text: "#4c1d95" }, // violet
  BLOCCATO:  { fill: "#e5e7eb", stroke: "#6b7280", text: "#6b7280" }, // grigio tratteggiato
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
  const [sala, setSala] = useState(null);
  const [menuTavolo, setMenuTavolo] = useState(null);   // tavolo libero/bloccato cliccato
  const [formTavolo, setFormTavolo] = useState(null);   // nome tavolo per nuova prenotazione
  const [unendo, setUnendo] = useState(null);           // {ids:[], nomi:[], prolunghe} — «🔗 Unisci» in corso
  const [spostando, setSpostando] = useState(false);    // «✋ Sposta»: la sala si modifica per questo turno
  const [trascina, setTrascina] = useState(null);       // {id, ox, oy, x, y, mosso}
  const appenaTrascinato = useRef(false);
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

  // ── Blocca / sblocca tavolo per questo turno ──
  const bloccaTavolo = async (t) => {
    const motivo = window.prompt(`Blocco il tavolo ${t.nome} per ${turno} del ${data.split("-").reverse().join("/")}.\nMotivo (facoltativo):`, "");
    if (motivo === null) return;
    setMenuTavolo(null);
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/blocchi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, turno, tavolo_id: t.id, motivo }),
      });
      const d = await r.json();
      if (r.ok) { flash("ok", d.message); loadMappa(); } else flash("err", d.detail || "Errore");
    } catch {
      flash("err", "Errore di connessione");
    }
  };

  const sbloccaTavolo = async (t) => {
    setMenuTavolo(null);
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/blocchi/${t.blocco.id}`, { method: "DELETE" });
      const d = await r.json();
      if (r.ok) { flash("ok", `Tavolo ${t.nome} di nuovo disponibile`); loadMappa(); } else flash("err", d.detail || "Errore");
    } catch {
      flash("err", "Errore di connessione");
    }
  };

  // ── Dividi / riunisci tavolo per questo turno ──
  const dividiTavolo = async (t) => {
    setMenuTavolo(null);
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/divisioni`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, turno, tavolo_id: t.id }),
      });
      const d = await r.json();
      if (r.ok) { flash("ok", d.message); loadMappa(); } else flash("err", d.detail || "Errore");
    } catch {
      flash("err", "Errore di connessione");
    }
  };

  const riunisciTavolo = async (t) => {
    setMenuTavolo(null);
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/divisioni/${t.divisione_id}`, { method: "DELETE" });
      const d = await r.json();
      if (r.ok) { flash("ok", d.message); loadMappa(); } else flash("err", d.detail || "Errore");
    } catch {
      flash("err", "Errore di connessione");
    }
  };

  // ── Unisci tavoli per questo turno (anche mentre si assegna una prenotazione) ──
  const toccaPerUnire = (t) => {
    const i = unendo.ids.indexOf(t.id);
    if (i >= 0) setUnendo({ ...unendo, ids: unendo.ids.filter((_, k) => k !== i), nomi: unendo.nomi.filter((_, k) => k !== i) });
    else setUnendo({ ...unendo, ids: [...unendo.ids, t.id], nomi: [...unendo.nomi, t.nome] });
  };
  const confermaUnione = async () => {
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/unioni`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, turno, tavoli_ids: unendo.ids, prolunghe: unendo.prolunghe || 0 }),
      });
      const d = await r.json();
      if (!r.ok) { flash("err", d.detail || "Errore"); return; }
      setUnendo(null);
      if (assegnando) await assegnaTavolo(assegnando, d.unione.nome);
      else { flash("ok", d.message); loadMappa(); }
    } catch {
      flash("err", "Errore di connessione");
    }
  };
  const staccaUnione = async (t) => {
    setMenuTavolo(null);
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/unioni/${t.unione_id}`, { method: "DELETE" });
      const d = await r.json();
      if (r.ok) { flash("ok", d.message); loadMappa(); } else flash("err", d.detail || "Errore");
    } catch {
      flash("err", "Errore di connessione");
    }
  };

  // ── Trascina i tavoli (solo per questo turno): in assegnazione o con «✋ Sposta» ──
  const modificaSala = !!assegnando || spostando;
  const puntoSvg = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    const src = e.touches ? e.touches[0] : e.changedTouches ? e.changedTouches[0] : e;
    pt.x = src.clientX; pt.y = src.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  const iniziaTrascina = (e, t) => {
    if (!modificaSala) return;
    const p = puntoSvg(e);
    setTrascina({ id: t.id, ox: p.x - t.posizione_x, oy: p.y - t.posizione_y, x: t.posizione_x, y: t.posizione_y, w: t.larghezza, h: t.altezza, mosso: false, p0: p });
  };
  const muoviTrascina = (e) => {
    if (!trascina) return;
    const p = puntoSvg(e);
    const mosso = trascina.mosso || Math.hypot(p.x - trascina.p0.x, p.y - trascina.p0.y) > 6;
    if (!mosso) return;
    if (e.cancelable) e.preventDefault();
    setTrascina({ ...trascina, mosso,
      x: Math.max(0, Math.min(CANVAS_W - trascina.w, Math.round((p.x - trascina.ox) / 5) * 5)),
      y: Math.max(0, Math.min(CANVAS_H - trascina.h, Math.round((p.y - trascina.oy) / 5) * 5)) });
  };
  const fineTrascina = async () => {
    const t = trascina;
    setTrascina(null);
    if (!t || !t.mosso) return;
    appenaTrascinato.current = true;   // il clic che segue non è un clic
    setTimeout(() => { appenaTrascinato.current = false; }, 300);
    setMappaData(md => md && ({ ...md, tavoli: md.tavoli.map(x => (x.id === t.id ? { ...x, posizione_x: t.x, posizione_y: t.y } : x)) }));
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/posizioni-turno/sposta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, turno, chiave: String(t.id), x: t.x, y: t.y }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); flash("err", d.detail || "Errore"); }
    } catch {
      flash("err", "Errore di connessione");
    }
  };
  const rimettiSala = async () => {
    if (!window.confirm("Rimetto i tavoli dove stanno nella piantina? (le unioni restano)")) return;
    const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/posizioni-turno/${data}/${turno}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    flash(r.ok ? "ok" : "err", d.message || d.detail || "Errore");
    loadMappa();
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

  const tuttiTavoli = mappaData?.tavoli || [];
  const sale = mappaData?.sale?.length ? mappaData.sale : [...new Set(tuttiTavoli.map(t => t.zona || "sala"))];
  const salaAttiva = sala && sale.includes(sala) ? sala : sale[0];
  const tavoli = tuttiTavoli.filter(t => (t.zona || "sala") === salaAttiva);
  const elementi = (mappaData?.elementi || []).filter(e => (e.zona || "sala") === salaAttiva);
  const occupatiPerSala = Object.fromEntries(sale.map(s => [s, `${tuttiTavoli.filter(t => (t.zona || "sala") === s && t.occupato).length}/${tuttiTavoli.filter(t => (t.zona || "sala") === s).length}`]));
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
            <Btn variant="secondary" size="sm" onClick={prevDay}>◀</Btn>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm" />
            <Btn variant="secondary" size="sm" onClick={nextDay}>▶</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setData(today)}>Oggi</Btn>
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
          {assegnando && !unendo && (
            <div className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-medium">
              <span className="animate-pulse">Clicca su un tavolo libero per assegnare (puoi anche trascinare i tavoli)</span>
              <button onClick={() => setUnendo({ ids: [], nomi: [], prolunghe: 0 })}
                className="ml-2 px-2 py-0.5 rounded bg-white border border-amber-300 hover:bg-amber-50">🔗 Unisci tavoli</button>
              <button onClick={() => setAssegnando(null)} className="ml-2 text-amber-600 hover:text-amber-800">✕</button>
            </div>
          )}
          {!assegnando && !unendo && (
            <button onClick={() => setSpostando(!spostando)}
              title="Trascina i tavoli per questo turno (la piantina dell'Editor non cambia)"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${spostando ? "bg-indigo-600 text-white border-indigo-600" : "border-indigo-300 text-indigo-700 bg-white hover:bg-indigo-50"}`}>
              ✋ {spostando ? "Fine spostamenti" : "Sposta"}</button>
          )}
          {modificaSala && (
            <button onClick={rimettiSala} className="px-2 py-1.5 rounded-lg text-xs text-neutral-500 hover:text-neutral-800">↺ Sala com'era</button>
          )}
          {!assegnando && !unendo && (
            <button onClick={() => { setMenuTavolo(null); setUnendo({ ids: [], nomi: [], prolunghe: 0 }); }}
              title="Unisci dei tavoli per questo turno: tocca i tavoli, poi Unisci"
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-300 text-indigo-700 bg-white hover:bg-indigo-50">🔗 Unisci</button>
          )}
          {unendo && (
            <div className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg text-xs font-medium flex items-center gap-2 flex-wrap">
              <span>{unendo.nomi.length ? `Unisci ${unendo.nomi.join("+")}` : "Tocca i tavoli da unire"}</span>
              <label className="flex items-center gap-1">prolunghe
                <input type="number" min={0} max={9} value={unendo.prolunghe}
                  onChange={e => setUnendo({ ...unendo, prolunghe: Math.max(0, +e.target.value || 0) })}
                  className="w-10 px-1 py-0.5 border rounded" />
              </label>
              <button disabled={unendo.ids.length < 2 && !(unendo.ids.length === 1 && unendo.prolunghe > 0)} onClick={confermaUnione}
                className="px-2 py-0.5 rounded bg-indigo-600 text-white disabled:opacity-40">{assegnando ? "Unisci e assegna" : "Unisci"}</button>
              <button onClick={() => setUnendo(null)} className="text-indigo-500 hover:text-indigo-800">Annulla</button>
            </div>
          )}
        </div>

        <SchedeSale sale={sale} attiva={salaAttiva} onChange={setSala} conteggi={occupatiPerSala} />

        <div className="flex gap-4">
          {/* ── Canvas Mappa ── */}
          <div className="flex-1 bg-white rounded-xl border border-neutral-200 overflow-hidden relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              className="w-full"
              style={{ minHeight: 400, cursor: trascina?.mosso ? "grabbing" : undefined, touchAction: modificaSala ? "none" : undefined }}
              onMouseMove={muoviTrascina} onMouseUp={fineTrascina} onMouseLeave={fineTrascina}
              onTouchMove={muoviTrascina} onTouchEnd={fineTrascina}
            >
              {/* Sfondo */}
              <rect width={CANVAS_W} height={CANVAS_H} fill="#fafafa" />

              {/* Elementi non prenotabili */}
              {elementi.map(e => <FormaElemento key={`e${e.id}`} e={e} />)}

              {/* Tavoli */}
              {tavoli.map(t0 => {
                const t = trascina?.mosso && trascina.id === t0.id ? { ...t0, posizione_x: trascina.x, posizione_y: trascina.y } : t0;
                const stato = t.stato_tavolo || "LIBERO";
                const colori = COLORI_STATO[stato] || COLORI_STATO.LIBERO;
                const pren = t.prenotazione;
                const scelto = unendo && unendo.ids.includes(t.id);
                const isClickable = (assegnando || unendo) && stato === "LIBERO" && !(unendo && t.legato);
                const bloccato = stato === "BLOCCATO";

                return (
                  <g
                    key={t.id}
                    onMouseDown={(e) => iniziaTrascina(e, t)}
                    onTouchStart={(e) => iniziaTrascina(e, t)}
                    onClick={() => {
                      if (appenaTrascinato.current) return;
                      if (unendo) {
                        if (stato === "LIBERO" && !t.legato) toccaPerUnire(t);
                      } else if (assegnando && stato === "LIBERO") {
                        assegnaTavolo(assegnando, t.nome);
                      } else if (pren) {
                        setMenuTavolo(null);
                        setSelectedPren(pren);
                        setSelectedTavolo(t);
                      } else if (!assegnando) {
                        setMenuTavolo(menuTavolo?.id === t.id ? null : t);
                      }
                    }}
                    style={{ cursor: spostando ? "grab" : isClickable ? "crosshair" : assegnando ? "grab" : "pointer" }}
                  >
                    <FormaTavolo t={t} fill={scelto ? "#c7d2fe" : colori.fill}
                      stroke={scelto ? "#4f46e5" : t.non_ci_sta ? "#dc2626" : isClickable ? "#f59e0b" : colori.stroke}
                      strokeWidth={scelto || isClickable || menuTavolo?.id === t.id ? 3 : 1.5}
                      dash={isClickable || bloccato ? "4 2" : "none"} />
                    {t.non_ci_sta && (
                      <text x={t.posizione_x + t.larghezza / 2} y={t.posizione_y + t.altezza - 6}
                        textAnchor="middle" fontSize="8" fill="#dc2626" className="select-none pointer-events-none">
                        non ci sta{t.sopra?.length ? ` (${t.sopra.join(", ")})` : ""}
                      </text>
                    )}
                    {bloccato && (
                      <text
                        x={t.posizione_x + t.larghezza / 2}
                        y={t.posizione_y + t.altezza / 2 + 12}
                        textAnchor="middle" dominantBaseline="middle" fontSize="8"
                        fill={colori.text} className="select-none pointer-events-none"
                      >
                        🚫 bloccato
                      </text>
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

            {/* Menu del tavolo (come TheFork Manager) */}
            {menuTavolo && (
              <div
                className="absolute z-10 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 text-sm min-w-[200px]"
                style={(() => {
                  // Il menu resta dentro la mappa: ai bordi si allinea al tavolo invece di centrarsi
                  const t = menuTavolo;
                  const centro = (t.posizione_x + t.larghezza / 2) / CANVAS_W;
                  const sotto = (t.posizione_y + t.altezza) / CANVAS_H;
                  const pct = (v) => `${v * 100}%`;
                  const [left, tx] = centro < 0.3 ? [pct(t.posizione_x / CANVAS_W), "0"]
                    : centro > 0.7 ? [pct((t.posizione_x + t.larghezza) / CANVAS_W), "-100%"]
                    : [pct(centro), "-50%"];
                  const [top, ty] = sotto > 0.65 ? [pct(t.posizione_y / CANVAS_H), "calc(-100% - 6px)"]
                    : [pct(sotto), "6px"];
                  return { left, top, transform: `translate(${tx}, ${ty})` };
                })()}
              >
                <div className="px-3 py-1 text-[11px] text-neutral-400 flex justify-between">
                  <span>Tavolo {menuTavolo.nome} · {menuTavolo.posti_min}-{menuTavolo.posti_max}p</span>
                  <button onClick={() => setMenuTavolo(null)} className="hover:text-neutral-600">✕</button>
                </div>
                {menuTavolo.blocco ? (
                  <>
                    <div className="px-3 py-1 text-xs text-neutral-500">
                      🚫 Bloccato{menuTavolo.blocco.motivo ? `: ${menuTavolo.blocco.motivo}` : ""}
                      {menuTavolo.blocco.creato_da ? ` (${menuTavolo.blocco.creato_da})` : ""}
                    </div>
                    <button onClick={() => sbloccaTavolo(menuTavolo)}
                      className="w-full text-left px-3 py-2 hover:bg-neutral-50">✅ Sblocca questo tavolo</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setFormTavolo(menuTavolo.nome); setMenuTavolo(null); }}
                      className="w-full text-left px-3 py-2 hover:bg-neutral-50">➕ Aggiungi una prenotazione</button>
                    {menuTavolo.legato ? (
                      menuTavolo.unione_id ? (
                        <button onClick={() => staccaUnione(menuTavolo)}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-50">✂️ Stacca {menuTavolo.membri_nomi?.join(" e ")}</button>
                      ) : null
                    ) : menuTavolo.diviso_da ? (
                      <button onClick={() => riunisciTavolo(menuTavolo)}
                        className="w-full text-left px-3 py-2 hover:bg-neutral-50">🔗 Riunisci il tavolo {String(menuTavolo.nome).slice(0, -1)}</button>
                    ) : (
                      <>
                        {menuTavolo.dividibile === 1 && (
                          <button onClick={() => dividiTavolo(menuTavolo)}
                            className="w-full text-left px-3 py-2 hover:bg-neutral-50">✂️ Dividi in due ({(menuTavolo.nomi_meta || "").includes(",") ? menuTavolo.nomi_meta.replace(",", " +") : `${menuTavolo.nome}A + ${menuTavolo.nome}B`})</button>
                        )}
                        <button onClick={() => bloccaTavolo(menuTavolo)}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-50">🚫 Blocca questo tavolo</button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Legenda */}
            <div className="absolute bottom-2 left-2 flex gap-2 text-[10px]">
              {[
                { label: "Libero", color: COLORE_TAVOLO },
                { label: "Prenotato", color: "#c7d2fe" },
                { label: "Arrivato", color: "#fde68a" },
                { label: "Seduto", color: "#a7f3d0" },
                { label: "No-show", color: "#fecaca" },
                { label: "Bloccato", color: "#e5e7eb" },
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
                  <div className="text-lg font-bold text-neutral-800">{tavoli.filter(t => !t.occupato && !t.blocco).length}</div>
                  <div className="text-neutral-500">Liberi</div>
                </div>
                <div className="text-center p-2 bg-neutral-50 rounded">
                  <div className="text-lg font-bold text-amber-600">{senzaTavolo.length}</div>
                  <div className="text-neutral-500">Senza tavolo</div>
                </div>
                <div className="text-center p-2 bg-neutral-50 rounded">
                  <div className="text-lg font-bold text-neutral-800">{tavoli.length}</div>
                  <div className="text-neutral-500">Tavoli in {salaAttiva}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {formTavolo && (
        <PrenotazioniForm
          defaultData={data}
          defaultTurno={turno}
          defaultTavolo={formTavolo}
          onClose={() => setFormTavolo(null)}
          onSuccess={() => { setFormTavolo(null); flash("ok", "Prenotazione inserita"); loadMappa(); }}
        />
      )}
    </div>
  );
}
