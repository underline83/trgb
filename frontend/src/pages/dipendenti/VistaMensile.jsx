// @version: v1.2-print (tasto Stampa con @media print + print:hidden toolbar/sidebar + intestazione print-only)
// Vista Mensile Turni v2 — TRGB Gestionale
//
// Griglia calendario 6 righe × 7 colonne (Lun..Dom), sola lettura.
// - Tab reparti, selettore mese ← MMM YYYY → + Oggi
// - Ogni cella giorno: numero giorno, badge compatti (iniziali colorate) per PRANZO/CENA
// - Giorni fuori mese corrente: opacity ridotta
// - Giorni chiusi: sfondo grigio + "chiuso"
// - Oggi: bordo brand-blue
// - Click cella → pannello destro con lista turni dettagliata + bottone "Apri settimana"
// - Toggle verso FoglioSettimana (vista settimana) mantiene reparto via localStorage
//
// Touch target 44pt, mobile-aware (griglia compatta, pannello scrollable).

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

// ---- UTIL DATE ------------------------------------------------------------
function pad(n) { return n < 10 ? `0${n}` : `${n}`; }

const MESI_LUN = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const GIORNI_SETT_LUN = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const GIORNI_SETT_FULL = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

function shiftMese({ anno, mese }, delta) {
  const idx = (anno * 12 + (mese - 1)) + delta;
  return { anno: Math.floor(idx / 12), mese: (idx % 12) + 1 };
}

function oggiIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ISO week — per passare la settimana corretta a FoglioSettimana
function isoWeekFromDateStr(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(wk)}`;
}

function formatDataCompleta(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${GIORNI_SETT_FULL[(dt.getDay() + 6) % 7]} ${d} ${MESI_LUN[m - 1]} ${y}`;
}

// Contrasto bianco/nero su background HEX (condiviso con FoglioSettimana)
function textOn(hex) {
  if (!hex) return "#111";
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? "#111" : "#fff";
}

function iniziali(nome, cognome) {
  const n = (nome || "").trim().charAt(0).toUpperCase();
  const c = (cognome || "").trim().charAt(0).toUpperCase();
  return `${n}${c}` || "?";
}

// ---- COMPONENTE PRINCIPALE ------------------------------------------------
export default function VistaMensile() {
  const navigate = useNavigate();

  const oggi = new Date();
  const [anno, setAnno] = useState(() => {
    const last = Number(localStorage.getItem("turni_mese_anno"));
    return last || oggi.getFullYear();
  });
  const [mese, setMese] = useState(() => {
    const last = Number(localStorage.getItem("turni_mese_mese"));
    return last || (oggi.getMonth() + 1);
  });

  const [reparti, setReparti] = useState([]);
  const [repartoId, setRepartoId] = useState(() => {
    const last = Number(localStorage.getItem("turni_last_reparto"));
    return last || null;
  });
  const [vista, setVista] = useState(null);   // { giorni, dipendenti, turni, chiusure, ... }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedDate, setSelectedDate] = useState(null);  // YYYY-MM-DD o null

  // --- LOAD REPARTI ---
  useEffect(() => {
    apiFetch(`${API_BASE}/reparti/`)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setReparti(list);
        if (list.length && !list.find(r => r.id === repartoId)) {
          setRepartoId(list[0].id);
        }
      })
      .catch(() => setError("Impossibile caricare i reparti"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persisti reparto scelto (shared con FoglioSettimana)
  useEffect(() => {
    if (repartoId) localStorage.setItem("turni_last_reparto", String(repartoId));
  }, [repartoId]);

  useEffect(() => {
    localStorage.setItem("turni_mese_anno", String(anno));
    localStorage.setItem("turni_mese_mese", String(mese));
  }, [anno, mese]);

  // --- LOAD VISTA MESE ---
  const caricaVista = useCallback(async () => {
    if (!repartoId) return;
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(
        `${API_BASE}/turni/mese?reparto_id=${repartoId}&anno=${anno}&mese=${mese}`,
      );
      if (!res.ok) throw new Error(`GET /turni/mese ${res.status}`);
      setVista(await res.json());
    } catch (e) {
      setError(e.message || "Errore caricamento vista mensile");
    } finally {
      setLoading(false);
    }
  }, [repartoId, anno, mese]);

  useEffect(() => { caricaVista(); }, [caricaVista]);

  const reparto = useMemo(
    () => reparti.find(r => r.id === repartoId) || null,
    [reparti, repartoId],
  );

  // Indicizza i turni per data per accesso O(1) nel render
  const turniByDate = useMemo(() => {
    const out = {};
    if (!vista) return out;
    for (const t of vista.turni) {
      if (!out[t.data]) out[t.data] = [];
      out[t.data].push(t);
    }
    // Ordina dentro ogni giorno: prima PRANZO poi CENA, per slot_index
    for (const k of Object.keys(out)) {
      out[k].sort((a, b) => {
        const sa = (a.servizio || "").toUpperCase();
        const sb = (b.servizio || "").toUpperCase();
        if (sa !== sb) return sa === "PRANZO" ? -1 : 1;
        return (a.slot_index || 0) - (b.slot_index || 0);
      });
    }
    return out;
  }, [vista]);

  const chiusi = useMemo(() => new Set(vista?.chiusure || []), [vista]);

  // ---- NAVIGAZIONE ---------------------------------------------------------
  function vaiOggi() {
    const d = new Date();
    setAnno(d.getFullYear());
    setMese(d.getMonth() + 1);
    setSelectedDate(oggiIso());
  }

  function shiftMeseRel(delta) {
    const { anno: a, mese: m } = shiftMese({ anno, mese }, delta);
    setAnno(a); setMese(m);
    setSelectedDate(null);
  }

  function apriSettimanaPerData(iso) {
    const isoSett = isoWeekFromDateStr(iso);
    localStorage.setItem("turni_last_settimana", isoSett);
    if (repartoId) localStorage.setItem("turni_last_reparto", String(repartoId));
    navigate("/dipendenti/turni");
  }

  // ---- RENDER --------------------------------------------------------------
  return (
    <div className="min-h-screen bg-brand-cream p-4 sm:p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* HEADER — stile iOS: left (nav) / center (segmented) / right (azioni) */}
        <div className="mb-4">
          <div className="mb-2 print:hidden">
            <button onClick={() => navigate("/dipendenti")}
              className="text-sm text-neutral-500 hover:text-neutral-700">← Dipendenti</button>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1">🗓 Vista Mensile</h1>
          </div>

          {/* Intestazione PRINT-ONLY */}
          <div className="hidden print:block mb-3 border-b border-neutral-300 pb-2">
            <div className="text-lg font-bold">
              Vista Mensile Turni — {MESI_LUN[mese - 1]} {anno}
            </div>
            <div className="text-sm text-neutral-700">
              {reparto ? `${reparto.icona || ""} ${reparto.nome}` : ""}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap print:hidden">
            {/* LEFT: navigazione mese */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => shiftMeseRel(-1)}
                className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50"
                title="Mese precedente">◀</button>
              <div className="min-h-[44px] px-3 flex items-center bg-white border border-neutral-300 rounded-lg text-sm">
                <span className="text-neutral-900 font-medium">{MESI_LUN[mese - 1]} {anno}</span>
              </div>
              <button onClick={() => shiftMeseRel(1)}
                className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50"
                title="Mese successivo">▶</button>
              <button onClick={vaiOggi}
                className="min-h-[44px] px-3 text-sm text-neutral-700 hover:text-brand-blue hover:bg-neutral-50 rounded-lg"
                title="Vai a oggi">Oggi</button>
            </div>

            {/* CENTER: segmented control viste */}
            <div className="flex-1 flex justify-center min-w-[260px]">
              <div className="inline-flex bg-neutral-200 rounded-lg p-1 gap-1">
                <button
                  onClick={() => navigate("/dipendenti/turni")}
                  className="min-h-[38px] px-4 rounded-md text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-white/60"
                  title="Vista settimana (matrice editabile)">
                  Settimana
                </button>
                <button
                  className="min-h-[38px] px-4 rounded-md text-sm font-medium bg-white text-neutral-900 shadow-sm cursor-default"
                  title="Vista mese (corrente)">
                  Mese
                </button>
                <button
                  onClick={() => navigate("/dipendenti/turni/dipendente")}
                  className="min-h-[38px] px-4 rounded-md text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-white/60"
                  title="Timeline per singolo dipendente su 4/8/12 settimane">
                  Per dipendente
                </button>
              </div>
            </div>

            {/* RIGHT: azioni condivisione */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => window.print()}
                disabled={!vista}
                className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 text-sm disabled:opacity-50"
                title="Stampa vista mensile (usa il dialog nativo del browser per PDF/stampante)">
                🖨️ Stampa
              </button>
            </div>
          </div>
        </div>

        {/* TAB REPARTI */}
        <div className="flex gap-2 mb-4 flex-wrap print:hidden">
          {reparti.map(r => {
            const active = r.id === repartoId;
            return (
              <button key={r.id} onClick={() => { setRepartoId(r.id); setSelectedDate(null); }}
                style={{
                  borderColor: active ? r.colore : "transparent",
                  backgroundColor: active ? r.colore : "white",
                  color: active ? "white" : "#111",
                }}
                className="min-h-[44px] px-4 rounded-lg border-2 font-semibold transition hover:opacity-90">
                {r.icona} {r.nome}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        {loading && <div className="text-center py-10 text-neutral-500">Caricamento…</div>}

        {!loading && vista && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 print:block">
            {/* GRIGLIA 6×7 */}
            <div className="bg-white rounded-xl shadow overflow-hidden print:shadow-none print:rounded-none">
              <GrigliaMensile
                vista={vista}
                turniByDate={turniByDate}
                chiusi={chiusi}
                mese={mese}
                selectedDate={selectedDate}
                onDateClick={setSelectedDate}
              />
            </div>

            {/* PANNELLO DETTAGLIO GIORNO */}
            <div className="print:hidden">
              <PannelloGiorno
                selectedDate={selectedDate}
                turni={selectedDate ? (turniByDate[selectedDate] || []) : []}
                chiuso={selectedDate ? chiusi.has(selectedDate) : false}
                reparto={reparto}
                onClose={() => setSelectedDate(null)}
                onApriSettimana={() => selectedDate && apriSettimanaPerData(selectedDate)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ---- GRIGLIA MENSILE ------------------------------------------------------
function GrigliaMensile({ vista, turniByDate, chiusi, mese, selectedDate, onDateClick }) {
  const today = oggiIso();
  const giorni = vista.giorni;  // 42 date ISO

  return (
    <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
      <thead>
        <tr className="bg-neutral-50">
          {GIORNI_SETT_LUN.map((g, idx) => (
            <th key={g} className={`px-2 py-2 border-b text-[11px] font-semibold uppercase tracking-wide
                                     ${idx >= 5 ? "text-brand-red" : "text-neutral-600"}`}>
              {g}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 6 }).map((_, rowIdx) => (
          <tr key={rowIdx}>
            {Array.from({ length: 7 }).map((_, colIdx) => {
              const iso = giorni[rowIdx * 7 + colIdx];
              const [yy, mm] = iso.split("-").map(Number);
              const isOfMonth = mm === mese;
              const isToday = iso === today;
              const isSelected = iso === selectedDate;
              const chiuso = chiusi.has(iso);
              const turni = turniByDate[iso] || [];
              return (
                <CellaGiorno
                  key={iso}
                  iso={iso}
                  isOfMonth={isOfMonth}
                  isToday={isToday}
                  isSelected={isSelected}
                  chiuso={chiuso}
                  turni={turni}
                  onClick={() => onDateClick(iso)}
                />
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}


// ---- CELLA GIORNO ---------------------------------------------------------
function CellaGiorno({ iso, isOfMonth, isToday, isSelected, chiuso, turni, onClick }) {
  const [, , d] = iso.split("-").map(Number);

  // Separa per servizio per raggruppare i badge nella cella
  const pranzo = turni.filter(t => (t.servizio || "").toUpperCase() === "PRANZO");
  const cena = turni.filter(t => (t.servizio || "").toUpperCase() === "CENA");

  // Stili cella
  const bgChiuso = chiuso ? "bg-neutral-100" : "bg-white";
  const textMuted = isOfMonth ? "" : "opacity-40";
  const borderSel = isSelected
    ? "ring-2 ring-brand-blue"
    : isToday
    ? "ring-2 ring-brand-blue/60"
    : "";

  return (
    <td className={`align-top border border-neutral-200 p-1 cursor-pointer hover:bg-blue-50 transition
                    ${bgChiuso} ${textMuted} ${borderSel}`}
        style={{ height: 110, minHeight: 110 }}
        onClick={onClick}>
      <div className="flex items-start justify-between mb-1">
        <div className={`text-sm font-semibold leading-none ${isToday ? "text-brand-blue" : "text-neutral-700"}`}>
          {d}
        </div>
        {chiuso && <div className="text-[9px] text-red-500 font-semibold">CHIUSO</div>}
      </div>

      {!chiuso && (
        <div className="flex flex-col gap-0.5">
          {pranzo.length > 0 && (
            <RigaBadge etichetta="☀" turni={pranzo} />
          )}
          {cena.length > 0 && (
            <RigaBadge etichetta="🌙" turni={cena} />
          )}
        </div>
      )}
    </td>
  );
}


// ---- RIGA BADGE (compatti) ------------------------------------------------
function RigaBadge({ etichetta, turni }) {
  const MAX = 6;
  const mostrati = turni.slice(0, MAX);
  const nascosti = turni.length - mostrati.length;

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      <span className="text-[10px] leading-none mr-0.5">{etichetta}</span>
      {mostrati.map(t => <BadgeTurno key={t.id} turno={t} />)}
      {nascosti > 0 && (
        <span className="text-[9px] text-neutral-500 bg-neutral-100 rounded px-1 py-0.5">
          +{nascosti}
        </span>
      )}
    </div>
  );
}


// ---- BADGE TURNO (iniziali colorate) --------------------------------------
function BadgeTurno({ turno }) {
  const stato = (turno.stato || "").toUpperCase();
  const opzionale = stato === "OPZIONALE";
  const annullato = stato === "ANNULLATO";
  const bg = turno.dipendente_colore || "#d1d5db";
  const tone = textOn(bg);
  const label = iniziali(turno.dipendente_nome, turno.dipendente_cognome);
  const tooltip = `${turno.dipendente_nome || ""} ${turno.dipendente_cognome || ""} ` +
                  `${(turno.ora_inizio || "").slice(0, 5)}-${(turno.ora_fine || "").slice(0, 5)}` +
                  (opzionale ? " (opzionale)" : annullato ? " (annullato)" : "");

  return (
    <span
      className="inline-flex items-center justify-center rounded text-[10px] font-bold relative"
      style={{
        backgroundColor: bg,
        color: tone,
        opacity: annullato ? 0.4 : 1,
        width: 22,
        height: 18,
        lineHeight: "18px",
      }}
      title={tooltip}
    >
      {label}
      {opzionale && (
        <span className="absolute -top-1 -right-1 text-yellow-400 text-[10px] leading-none drop-shadow">★</span>
      )}
    </span>
  );
}


// ---- PANNELLO DETTAGLIO GIORNO --------------------------------------------
function PannelloGiorno({ selectedDate, turni, chiuso, reparto, onClose, onApriSettimana }) {
  if (!selectedDate) {
    return (
      <div className="bg-white rounded-xl shadow p-4 h-fit sticky top-4 text-center">
        <div className="py-10 text-neutral-400">
          <div className="text-3xl mb-2">👆</div>
          <div className="text-sm">Tocca un giorno per vedere i turni</div>
        </div>
      </div>
    );
  }

  const pranzo = turni.filter(t => (t.servizio || "").toUpperCase() === "PRANZO");
  const cena = turni.filter(t => (t.servizio || "").toUpperCase() === "CENA");

  return (
    <div className="bg-white rounded-xl shadow p-4 h-fit sticky top-4">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0">
          <div className="text-xs text-neutral-500 uppercase tracking-wide">
            {reparto ? `${reparto.icona || ""} ${reparto.nome || ""}` : ""}
          </div>
          <h3 className="font-semibold text-base leading-tight truncate">
            {formatDataCompleta(selectedDate)}
          </h3>
        </div>
        <button onClick={onClose}
          className="text-neutral-400 hover:text-neutral-700 text-xl leading-none shrink-0"
          title="Chiudi dettaglio">×</button>
      </div>

      {chiuso ? (
        <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-center text-neutral-500 text-sm">
          🚪 Osteria chiusa
        </div>
      ) : turni.length === 0 ? (
        <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-center text-neutral-400 text-sm">
          Nessun turno assegnato
        </div>
      ) : (
        <>
          <SezioneServizio etichetta="☀️ Pranzo" reparto={reparto} servizio="PRANZO" turni={pranzo} />
          <SezioneServizio etichetta="🌙 Cena"  reparto={reparto} servizio="CENA"   turni={cena} />
        </>
      )}

      <button onClick={onApriSettimana}
        className="mt-4 w-full min-h-[44px] px-3 bg-brand-blue text-white rounded-lg hover:opacity-90 text-sm font-semibold">
        ✏️ Apri settimana per modificare
      </button>
      <div className="mt-2 text-[10px] text-neutral-400 text-center">
        La vista mensile è di sola lettura.
      </div>
    </div>
  );
}


// ---- SEZIONE SERVIZIO (dentro il pannello) --------------------------------
function SezioneServizio({ etichetta, servizio, turni, reparto }) {
  if (turni.length === 0) return null;
  const defOrarioIni = servizio === "PRANZO" ? (reparto?.pranzo_inizio || "") : (reparto?.cena_inizio || "");
  const defOrarioFin = servizio === "PRANZO" ? (reparto?.pranzo_fine || "") : (reparto?.cena_fine || "");
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">{etichetta}</div>
        {(defOrarioIni && defOrarioFin) && (
          <div className="text-[10px] text-neutral-400 font-mono">
            {defOrarioIni}–{defOrarioFin}
          </div>
        )}
      </div>
      <div className="space-y-1">
        {turni.map(t => <RigaDettaglio key={t.id} turno={t} />)}
      </div>
    </div>
  );
}


function RigaDettaglio({ turno }) {
  const stato = (turno.stato || "").toUpperCase();
  const opzionale = stato === "OPZIONALE";
  const annullato = stato === "ANNULLATO";
  const bg = turno.dipendente_colore || "#d1d5db";
  const tone = textOn(bg);

  return (
    <div className="flex items-center gap-2 py-1 border-b last:border-0"
         style={{ opacity: annullato ? 0.5 : 1 }}>
      <span className="inline-flex items-center justify-center rounded text-[10px] font-bold shrink-0"
            style={{ backgroundColor: bg, color: tone, width: 30, height: 24 }}>
        {iniziali(turno.dipendente_nome, turno.dipendente_cognome)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate">
          {turno.dipendente_nome} {turno.dipendente_cognome}
          {turno.dipendente_a_chiamata && (
            <span className="ml-1 text-[9px] px-1 rounded bg-amber-100 text-amber-700 border border-amber-200"
                  title="A chiamata">📞</span>
          )}
        </div>
        <div className="text-[11px] text-neutral-500 font-mono">
          {(turno.ora_inizio || "").slice(0, 5)}–{(turno.ora_fine || "").slice(0, 5)}
          {opzionale && <span className="ml-1 text-yellow-500" title="Opzionale">★</span>}
          {annullato && <span className="ml-1 text-red-500" title="Annullato">✕</span>}
        </div>
        {turno.note && (
          <div className="text-[10px] text-neutral-400 truncate italic">“{turno.note}”</div>
        )}
      </div>
    </div>
  );
}
