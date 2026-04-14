// @version: v1.2-print-dropdown (dipendenti → dropdown + tasto Stampa con @media print friendly)
// Vista Per Dipendente Turni v2 — TRGB Gestionale
//
// Timeline di un singolo dipendente su N settimane (default 4) per rispondere
// alla domanda "quando lavoro il prossimo mese?".
//
// - Tab reparti + select dipendente (filtrato sul reparto, con nome+cognome)
// - Navigatore settimana inizio (← Oggi →)
// - Select "Settimane": 4 / 8 / 12
// - Per ogni settimana: Lun..Dom con blocchi turno colorati, ore lorde/nette,
//   semaforo CCNL, giorni lavorati/riposi, badge chiusura/opzionale
// - Totali periodo in alto (ore, giorni, riposi, chiusure, opzionali)
// - Deep-link: click su intestazione settimana → apre Foglio Settimana filtrato
//
// Touch target 48pt, mobile-aware (griglia collassa a card-per-giorno sotto 768px).

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import DipendentiNav from "./DipendentiNav";

// ---- UTIL DATE ------------------------------------------------------------
function pad(n) { return n < 10 ? `0${n}` : `${n}`; }

const MESI_ABBR = [
  "gen", "feb", "mar", "apr", "mag", "giu",
  "lug", "ago", "set", "ott", "nov", "dic",
];
const GIORNI_SETT_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const GIORNI_SETT_FULL = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

// ISO week helpers
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(wk)}`;
}

// shift ISO week of N settimane (può wrappare l'anno)
function shiftIsoWeek(iso, delta) {
  const m = /^(\d{4})-W(\d{2})$/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]); const w = Number(m[2]);
  // Usa il lunedì come punto di ancoraggio (1 gen -> trova lunedì W1 di iso)
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4day = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(jan4);
  mondayW1.setUTCDate(jan4.getUTCDate() - (jan4day - 1));
  const target = new Date(mondayW1);
  target.setUTCDate(mondayW1.getUTCDate() + (w - 1 + delta) * 7);
  return isoWeek(target);
}

function labelWeekRange(isoSett) {
  const m = /^(\d{4})-W(\d{2})$/.exec(isoSett);
  if (!m) return isoSett;
  const y = Number(m[1]); const w = Number(m[2]);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4day = jan4.getUTCDay() || 7;
  const mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - (jan4day - 1) + (w - 1) * 7);
  const dom = new Date(mon);
  dom.setUTCDate(mon.getUTCDate() + 6);
  const mesiEqual = mon.getUTCMonth() === dom.getUTCMonth();
  if (mesiEqual) {
    return `${mon.getUTCDate()}–${dom.getUTCDate()} ${MESI_ABBR[mon.getUTCMonth()]} ${mon.getUTCFullYear()}`;
  }
  return `${mon.getUTCDate()} ${MESI_ABBR[mon.getUTCMonth()]} – ${dom.getUTCDate()} ${MESI_ABBR[dom.getUTCMonth()]} ${mon.getUTCFullYear()}`;
}

function formatDayShort(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = GIORNI_SETT_SHORT[(dt.getDay() + 6) % 7];
  return `${wd} ${d}/${pad(m)}`;
}

function formatDayFull(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = GIORNI_SETT_FULL[(dt.getDay() + 6) % 7];
  return `${wd} ${d} ${MESI_ABBR[m - 1]} ${y}`;
}

function oggiIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function textOn(hex) {
  if (!hex) return "#111";
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? "#111" : "#fff";
}

const SEMAFORO_STYLE = {
  verde:  { label: "≤ 40h",  bg: "#16a34a", fg: "#fff" },
  giallo: { label: "≤ 48h",  bg: "#ca8a04", fg: "#fff" },
  rosso:  { label: "> 48h",  bg: "#dc2626", fg: "#fff" },
};

// ---- COMPONENTE PRINCIPALE ------------------------------------------------
export default function PerDipendente() {
  const navigate = useNavigate();

  const [reparti, setReparti] = useState([]);
  const [repartoId, setRepartoId] = useState(() => {
    const last = Number(localStorage.getItem("turni_last_reparto"));
    return last || null;
  });

  const [allDipendenti, setAllDipendenti] = useState([]); // tutti gli attivi
  const [dipendenteId, setDipendenteId] = useState(() => {
    const last = Number(localStorage.getItem("turni_last_dipendente"));
    return last || null;
  });

  const [settimanaInizio, setSettimanaInizio] = useState(() => {
    const last = localStorage.getItem("turni_perdip_settimana");
    if (last && /^\d{4}-W\d{2}$/.test(last)) return last;
    return isoWeek(new Date());
  });
  const [numSettimane, setNumSettimane] = useState(() => {
    const last = Number(localStorage.getItem("turni_perdip_n"));
    return last && [4, 8, 12].includes(last) ? last : 4;
  });

  const [vista, setVista] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  // --- LOAD TUTTI I DIPENDENTI ATTIVI (una volta sola, filtriamo lato FE per reparto) ---
  useEffect(() => {
    apiFetch(`${API_BASE}/dipendenti/`)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        list.sort((a, b) => {
          const ka = `${a.cognome || ""} ${a.nome || ""}`.toLowerCase();
          const kb = `${b.cognome || ""} ${b.nome || ""}`.toLowerCase();
          return ka.localeCompare(kb);
        });
        setAllDipendenti(list);
      })
      .catch(() => setError("Impossibile caricare i dipendenti"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dipendenti del reparto corrente (derivato)
  const dipendenti = useMemo(
    () => allDipendenti.filter(d => d.reparto_id === repartoId),
    [allDipendenti, repartoId],
  );

  // Se cambia il reparto e il dipendente scelto non appartiene più, seleziona il primo
  useEffect(() => {
    if (dipendenti.length === 0) {
      if (dipendenteId !== null) setDipendenteId(null);
      return;
    }
    const found = dipendenti.find(d => d.id === dipendenteId);
    if (!found) setDipendenteId(dipendenti[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dipendenti]);

  // Persistenza scelte
  useEffect(() => {
    if (repartoId) localStorage.setItem("turni_last_reparto", String(repartoId));
  }, [repartoId]);
  useEffect(() => {
    if (dipendenteId) localStorage.setItem("turni_last_dipendente", String(dipendenteId));
  }, [dipendenteId]);
  useEffect(() => {
    localStorage.setItem("turni_perdip_settimana", settimanaInizio);
  }, [settimanaInizio]);
  useEffect(() => {
    localStorage.setItem("turni_perdip_n", String(numSettimane));
  }, [numSettimane]);

  // --- LOAD VISTA ---
  const caricaVista = useCallback(async () => {
    if (!dipendenteId) { setVista(null); return; }
    setLoading(true); setError(null);
    try {
      const url = `${API_BASE}/turni/dipendente?dipendente_id=${dipendenteId}`
        + `&settimana_inizio=${encodeURIComponent(settimanaInizio)}`
        + `&num_settimane=${numSettimane}`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`GET /turni/dipendente ${res.status}`);
      setVista(await res.json());
    } catch (e) {
      setError(e.message || "Errore caricamento timeline");
      setVista(null);
    } finally {
      setLoading(false);
    }
  }, [dipendenteId, settimanaInizio, numSettimane]);

  useEffect(() => { caricaVista(); }, [caricaVista]);

  const reparto = useMemo(
    () => reparti.find(r => r.id === repartoId) || null,
    [reparti, repartoId],
  );

  // ---- NAVIGAZIONE --------------------------------------------------------
  function vaiOggi() {
    setSettimanaInizio(isoWeek(new Date()));
  }

  function shiftSettimane(delta) {
    setSettimanaInizio(s => shiftIsoWeek(s, delta));
  }

  function apriSettimanaInFoglio(isoSett) {
    localStorage.setItem("turni_last_settimana", isoSett);
    if (repartoId) localStorage.setItem("turni_last_reparto", String(repartoId));
    navigate("/dipendenti/turni");
  }

  // ---- RENDER -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-brand-cream">
      <div className="print:hidden"><DipendentiNav current="turni" /></div>
      <div className="p-4 sm:p-6">
      <div className="max-w-[1400px] mx-auto">
        {/* HEADER — stile iOS: left (nav) / center (segmented) / right (# settimane)
            Titolo rimosso (sess. 39): il menu modulo in alto gia' indica Turni. */}
        <div className="mb-4">
          {/* Intestazione PRINT-ONLY */}
          <div className="hidden print:block mb-3 border-b border-neutral-300 pb-2">
            <div className="text-lg font-bold">
              Timeline Dipendente — {vista?.dipendente ? `${vista.dipendente.nome} ${vista.dipendente.cognome}` : ""}
            </div>
            <div className="text-sm text-neutral-700">
              {reparto ? `${reparto.icona || ""} ${reparto.nome} · ` : ""}
              {labelWeekRange(settimanaInizio)} · {numSettimane} settimane
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap print:hidden">
            {/* LEFT: navigazione periodo */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => shiftSettimane(-numSettimane)}
                className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50"
                title="Periodo precedente">◀</button>
              <div className="min-h-[44px] px-3 flex items-center bg-white border border-neutral-300 rounded-lg text-sm gap-2">
                <span className="text-neutral-900">{labelWeekRange(settimanaInizio)}</span>
                <span className="text-neutral-400 font-mono text-xs">· {numSettimane}w</span>
              </div>
              <button onClick={() => shiftSettimane(numSettimane)}
                className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50"
                title="Periodo successivo">▶</button>
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
                  onClick={() => navigate("/dipendenti/turni/mese")}
                  className="min-h-[38px] px-4 rounded-md text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-white/60"
                  title="Vista mese">
                  Mese
                </button>
                <button
                  className="min-h-[38px] px-4 rounded-md text-sm font-medium bg-white text-neutral-900 shadow-sm cursor-default"
                  title="Vista per dipendente (corrente)">
                  Per dipendente
                </button>
              </div>
            </div>

            {/* RIGHT: selettore numero settimane + stampa */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <select
                value={numSettimane}
                onChange={e => setNumSettimane(Number(e.target.value))}
                className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded-lg text-sm hover:bg-neutral-50"
                title="Numero settimane visualizzate">
                <option value={4}>4 settimane</option>
                <option value={8}>8 settimane</option>
                <option value={12}>12 settimane</option>
              </select>
              <button onClick={() => window.print()}
                disabled={!vista}
                className="min-h-[44px] px-3 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 text-sm disabled:opacity-50"
                title="Stampa questa timeline (usa il dialog nativo del browser per PDF/stampante)">
                🖨️ Stampa
              </button>
            </div>
          </div>
        </div>

        {/* TAB REPARTI */}
        <div className="flex gap-2 mb-3 flex-wrap print:hidden">
          {reparti.map(r => {
            const active = r.id === repartoId;
            return (
              <button key={r.id} onClick={() => setRepartoId(r.id)}
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

        {/* SELETTORE DIPENDENTE — dropdown con pallino colore */}
        <div className="mb-4 print:hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-neutral-500">Dipendente:</label>
            {dipendenti.length === 0 ? (
              <span className="text-sm text-neutral-400">Nessun dipendente attivo in questo reparto</span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="inline-block w-4 h-4 rounded-full border border-neutral-300 flex-shrink-0"
                  style={{
                    backgroundColor: dipendenti.find(d => d.id === dipendenteId)?.colore || "#6b7280",
                  }}
                  title="Colore dipendente"></span>
                <select
                  value={dipendenteId || ""}
                  onChange={(e) => setDipendenteId(Number(e.target.value))}
                  className="min-h-[44px] px-3 bg-white border-2 border-neutral-300 rounded-lg text-sm hover:bg-neutral-50 font-semibold min-w-[220px]"
                  title="Seleziona dipendente">
                  {dipendenti.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.nome} {d.cognome}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-neutral-400">
                  ({dipendenti.length} nel reparto)
                </span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        {loading && <div className="text-center py-10 text-neutral-500">Caricamento…</div>}

        {!loading && !dipendenteId && (
          <div className="text-center py-10 text-neutral-500">
            Seleziona un dipendente per vedere la sua timeline.
          </div>
        )}

        {!loading && vista && (
          <>
            {/* TOTALI PERIODO */}
            <TotaliPeriodo vista={vista} />

            {/* TIMELINE SETTIMANE */}
            <div className="grid grid-cols-1 gap-4 mt-4 print:gap-2">
              {vista.settimane.map(sett => (
                <div key={sett.iso} style={{ breakInside: "avoid" }}>
                  <CardSettimana
                    settimana={sett}
                    reparto={reparto}
                    dipendente={vista.dipendente}
                    onApriInFoglio={() => apriSettimanaInFoglio(sett.iso)}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}


// ---- TOTALI PERIODO -------------------------------------------------------
function TotaliPeriodo({ vista }) {
  const t = vista.totali;
  const dip = vista.dipendente;
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-neutral-500">Periodo</div>
          <div className="font-semibold">
            {vista.settimana_inizio} → {vista.settimana_fine}
            <span className="ml-2 text-neutral-400 text-sm">({vista.num_settimane} sett.)</span>
          </div>
        </div>
        <div>
          <div className="text-sm text-neutral-500">Dipendente</div>
          <div className="font-semibold flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: dip.colore || "#6b7280" }}></span>
            {dip.nome} {dip.cognome}
            <span className="text-xs text-neutral-500">· {dip.reparto_nome}</span>
            {dip.a_chiamata && (
              <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide">
                a chiamata
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mt-4">
        <Metric label="Ore lorde" value={`${t.ore_lorde.toFixed(1)}h`} />
        <Metric label="Ore nette" value={`${t.ore_nette.toFixed(1)}h`} accent />
        <Metric label="Giorni lavorati" value={t.giorni_lavorati} />
        <Metric label="Riposi" value={t.riposi} />
        <Metric label="Chiusure" value={t.chiusure} />
        <Metric label="Opzionali" value={t.opzionali} />
      </div>
    </div>
  );
}

function Metric({ label, value, accent = false }) {
  return (
    <div className={`rounded-lg border p-2 ${accent ? "bg-brand-blue/5 border-brand-blue/30" : "bg-neutral-50 border-neutral-200"}`}>
      <div className="text-[11px] text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold ${accent ? "text-brand-blue" : "text-neutral-800"}`}>{value}</div>
    </div>
  );
}


// ---- CARD SETTIMANA -------------------------------------------------------
function CardSettimana({ settimana, reparto, dipendente, onApriInFoglio }) {
  const sem = SEMAFORO_STYLE[settimana.semaforo] || SEMAFORO_STYLE.verde;
  const oggi = oggiIso();

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      {/* Header settimana */}
      <div className="px-4 py-3 bg-neutral-50 border-b flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="font-semibold text-sm">
            {labelWeekRange(settimana.iso)}
            <span className="text-neutral-400 ml-2 text-xs font-mono">{settimana.iso}</span>
          </div>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: sem.bg, color: sem.fg }}
            title={`Semaforo CCNL: ${sem.label}`}>
            {settimana.ore_nette.toFixed(1)}h · {sem.label}
          </span>
          <span className="text-xs text-neutral-500">
            {settimana.giorni_lavorati} lav · {settimana.riposi} riposi · {settimana.chiusure.length} chiusure
          </span>
        </div>
        <button onClick={onApriInFoglio}
          className="min-h-[40px] px-3 text-sm bg-brand-blue text-white rounded-lg hover:opacity-90 print:hidden">
          ✏️ Apri settimana
        </button>
      </div>

      {/* Griglia 7 giorni: desktop-first, mobile card-stack */}
      <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x">
        {settimana.giorni.map(iso => {
          const cel = settimana.per_giorno[iso] || { turni: [], ore_lorde: 0, ore_nette: 0, is_chiusura: false, is_riposo: false };
          const isToday = iso === oggi;
          return (
            <CellaGiornoTimeline
              key={iso}
              iso={iso}
              dato={cel}
              isToday={isToday}
              reparto={reparto}
              dipendente={dipendente}
            />
          );
        })}
      </div>
    </div>
  );
}


// ---- CELLA GIORNO TIMELINE -----------------------------------------------
function CellaGiornoTimeline({ iso, dato, isToday, reparto, dipendente }) {
  const chiuso = dato.is_chiusura;
  const riposo = dato.is_riposo;

  const bg = chiuso ? "bg-neutral-100" : (isToday ? "bg-brand-blue/5" : "bg-white");
  const borderToday = isToday ? "ring-2 ring-inset ring-brand-blue" : "";

  // Raggruppa per servizio per allineare visivamente pranzo sopra / cena sotto
  // fra tutte le celle della settimana (placeholder invisibile se manca uno dei due).
  const allTurni = [...(dato.turni || [])];
  const pranziTurni = allTurni
    .filter(t => (t.servizio || "").toUpperCase() === "PRANZO")
    .sort((a, b) => (a.slot_index || 0) - (b.slot_index || 0));
  const ceneTurni = allTurni
    .filter(t => (t.servizio || "").toUpperCase() === "CENA")
    .sort((a, b) => (a.slot_index || 0) - (b.slot_index || 0));
  const altriTurni = allTurni
    .filter(t => {
      const s = (t.servizio || "").toUpperCase();
      return s !== "PRANZO" && s !== "CENA";
    })
    .sort((a, b) => (a.slot_index || 0) - (b.slot_index || 0));
  const hasAnyTurno = pranziTurni.length + ceneTurni.length + altriTurni.length > 0;

  return (
    <div className={`${bg} ${borderToday} p-3 min-h-[140px] flex flex-col`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-neutral-700">
          {formatDayShort(iso)}
        </div>
        {isToday && (
          <span className="text-[10px] bg-brand-blue text-white px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide">
            Oggi
          </span>
        )}
      </div>

      {chiuso && (
        <div className="flex-1 flex items-center justify-center text-xs text-neutral-500">
          🚪 Chiuso
        </div>
      )}

      {!chiuso && riposo && (
        <div className="flex-1 flex items-center justify-center text-xs text-neutral-400 italic">
          Riposo
        </div>
      )}

      {!chiuso && !riposo && hasAnyTurno && (
        <div className="flex-1 flex flex-col gap-1">
          {/* Slot PRANZO — sempre in alto. Placeholder se assente, così cena resta allineata. */}
          <div className="flex flex-col gap-1">
            {pranziTurni.length > 0
              ? pranziTurni.map(t => (
                  <BloccoTurno key={t.id} turno={t} dipendenteColore={dipendente?.colore} />
                ))
              : <SlotPlaceholder />}
          </div>
          {/* Slot CENA — sempre in basso. Placeholder se assente, così pranzo resta allineato. */}
          <div className="flex flex-col gap-1">
            {ceneTurni.length > 0
              ? ceneTurni.map(t => (
                  <BloccoTurno key={t.id} turno={t} dipendenteColore={dipendente?.colore} />
                ))
              : <SlotPlaceholder />}
          </div>
          {/* Eventuali turni senza servizio classificato: coda */}
          {altriTurni.map(t => (
            <BloccoTurno key={t.id} turno={t} dipendenteColore={dipendente?.colore} />
          ))}
        </div>
      )}

      {/* Footer ore giorno */}
      {!chiuso && (dato.ore_lorde > 0 || dato.ore_nette > 0) && (
        <div className="mt-2 pt-2 border-t text-[11px] flex items-center justify-between text-neutral-500">
          <span>Lordo: <span className="font-semibold text-neutral-700">{dato.ore_lorde.toFixed(1)}h</span></span>
          <span>Netto: <span className="font-semibold text-brand-blue">{dato.ore_nette.toFixed(1)}h</span></span>
        </div>
      )}
    </div>
  );
}


// ---- PLACEHOLDER SLOT ----------------------------------------------------
// Mantiene lo spazio di un BloccoTurno per allineare pranzi/cene fra le celle.
function SlotPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="rounded-md px-2 py-1 text-xs border border-transparent invisible"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">·</span>
        <span className="tabular-nums text-[10px]">00:00</span>
      </div>
    </div>
  );
}


// ---- BLOCCO TURNO --------------------------------------------------------
function BloccoTurno({ turno, dipendenteColore }) {
  const bg = turno.colore_bg || dipendenteColore || "#6b7280";
  const fg = turno.colore_testo || textOn(bg);
  const servizio = (turno.servizio || "").toUpperCase();
  const icon = servizio === "PRANZO" ? "☀️" : servizio === "CENA" ? "🌙" : "•";
  const stato = (turno.stato || "CONFERMATO").toUpperCase();
  const isOpz = stato === "OPZIONALE";
  const isAnn = stato === "ANNULLATO";

  const ora = (turno.ora_inizio || "").slice(0, 5);
  const fine = (turno.ora_fine || "").slice(0, 5);

  return (
    <div
      className="rounded-md px-2 py-1 text-xs border"
      style={{
        backgroundColor: bg,
        color: fg,
        borderColor: bg,
        opacity: isAnn ? 0.4 : 1,
        textDecoration: isAnn ? "line-through" : "none",
      }}
      title={[turno.turno_nome, turno.note, stato].filter(Boolean).join(" — ")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">
          {isOpz && <span title="Opzionale">★ </span>}
          {icon} {turno.turno_nome || (servizio || "Turno")}
        </span>
        <span className="tabular-nums text-[10px] opacity-90">
          {ora}–{fine}
        </span>
      </div>
      {turno.note && (
        <div className="text-[10px] opacity-80 truncate">{turno.note}</div>
      )}
    </div>
  );
}
