// @version: v1.3-minimale — variante 3: pill Pranzo/Cena con etichetta + orario, no totali, no semaforo, no ore lorde/nette
// Pagina "I miei turni" — TRGB Gestionale
//
// Vista self-service accessibile a TUTTI i ruoli autenticati:
// il backend risolve l'utente loggato -> dipendente_id (tramite users.json).
// Mostra la timeline N settimane dei PROPRI turni.
//
// Entry point delle notifiche "turni pubblicati" per dipendenti che non
// hanno accesso al Foglio Settimana completo (modulo dipendenti).
//
// Admin/superadmin vedono in cima un bottone per aprire il Foglio Settimana
// completo (stessa settimana).

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";

// ---- UTIL DATE ------------------------------------------------------------
function pad(n) { return n < 10 ? `0${n}` : `${n}`; }

const MESI_ABBR = [
  "gen", "feb", "mar", "apr", "mag", "giu",
  "lug", "ago", "set", "ott", "nov", "dic",
];
const GIORNI_SETT_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(wk)}`;
}

function shiftIsoWeek(iso, delta) {
  const m = /^(\d{4})-W(\d{2})$/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]); const w = Number(m[2]);
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

function oggiIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Variante 3: i blocchi turno usano palette PER SERVIZIO (pranzo=amber / cena=indigo),
// non piu' il colore del dipendente. Il tema resta in linea con Tailwind brand.
const SERVIZIO_STYLE = {
  PRANZO: {
    label: "Pranzo",
    icon:  "\u2600\uFE0F",  // ☀️
    cls:   "bg-amber-50 border-amber-200 text-amber-900",
  },
  CENA: {
    label: "Cena",
    icon:  "\uD83C\uDF19",  // 🌙
    cls:   "bg-indigo-50 border-indigo-200 text-indigo-900",
  },
  ALTRO: {
    label: "Turno",
    icon:  "\u2022",        // •
    cls:   "bg-neutral-100 border-neutral-200 text-neutral-700",
  },
};

// ---- COMPONENTE PRINCIPALE ------------------------------------------------
export default function MieiTurni() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = localStorage.getItem("role") || "";
  const isAdmin = role === "admin" || role === "superadmin";

  // Settimana: priorità URL query ?settimana=YYYY-Www, poi localStorage, poi corrente
  const [settimanaInizio, setSettimanaInizio] = useState(() => {
    const fromUrl = searchParams.get("settimana");
    if (fromUrl && /^\d{4}-W\d{2}$/.test(fromUrl)) return fromUrl;
    const last = localStorage.getItem("turni_mieituri_settimana");
    if (last && /^\d{4}-W\d{2}$/.test(last)) return last;
    return isoWeek(new Date());
  });
  const [numSettimane, setNumSettimane] = useState(() => {
    const last = Number(localStorage.getItem("turni_mieituri_n"));
    return last && [4, 8, 12].includes(last) ? last : 4;
  });

  const [vista, setVista] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notLinked, setNotLinked] = useState(false);

  // Persistenza
  useEffect(() => {
    localStorage.setItem("turni_mieituri_settimana", settimanaInizio);
  }, [settimanaInizio]);
  useEffect(() => {
    localStorage.setItem("turni_mieituri_n", String(numSettimane));
  }, [numSettimane]);

  // Sincronizza settimana nell'URL (utile per condividere/refresh)
  useEffect(() => {
    const current = searchParams.get("settimana");
    if (current !== settimanaInizio) {
      const p = new URLSearchParams(searchParams);
      p.set("settimana", settimanaInizio);
      setSearchParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settimanaInizio]);

  // --- LOAD VISTA ---
  const caricaVista = useCallback(async () => {
    setLoading(true); setError(null); setNotLinked(false);
    try {
      const url = `${API_BASE}/turni/miei-turni`
        + `?settimana_inizio=${encodeURIComponent(settimanaInizio)}`
        + `&num_settimane=${numSettimane}`;
      const res = await apiFetch(url);
      if (res.status === 404) {
        const body = await res.json().catch(() => ({}));
        const detail = body.detail || "";
        // Caso specifico "utente non collegato a un dipendente"
        if (/non è collegato|non e' collegato|non collegato/i.test(detail)) {
          setNotLinked(true);
        } else {
          setError(detail || "Dati non disponibili");
        }
        setVista(null);
        return;
      }
      if (!res.ok) throw new Error(`GET /turni/miei-turni ${res.status}`);
      setVista(await res.json());
    } catch (e) {
      setError(e.message || "Errore caricamento timeline");
      setVista(null);
    } finally {
      setLoading(false);
    }
  }, [settimanaInizio, numSettimane]);

  useEffect(() => { caricaVista(); }, [caricaVista]);

  function vaiOggi() {
    setSettimanaInizio(isoWeek(new Date()));
  }

  function shiftSettimane(delta) {
    setSettimanaInizio(s => shiftIsoWeek(s, delta));
  }

  function apriInFoglio(isoSett) {
    // Solo admin/superadmin — il click naviga al Foglio Settimana completo
    localStorage.setItem("turni_last_settimana", isoSett);
    if (vista?.dipendente?.reparto_id) {
      localStorage.setItem("turni_last_reparto", String(vista.dipendente.reparto_id));
    }
    navigate("/dipendenti/turni");
  }

  // ---- RENDER -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-brand-cream p-4 sm:p-6">
      <div className="max-w-[1400px] mx-auto">
        {/* HEADER */}
        <div className="mb-4">
          <div className="mb-2 print:hidden">
            <button onClick={() => navigate("/")}
              className="text-sm text-neutral-500 hover:text-neutral-700">← Home</button>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1">🗓️ I miei turni</h1>
            <div className="text-sm text-neutral-500 mt-0.5">
              Vista personale — solo i tuoi turni
            </div>
          </div>

          {/* Intestazione PRINT-ONLY */}
          <div className="hidden print:block mb-3 border-b border-neutral-300 pb-2">
            <div className="text-lg font-bold">
              I miei turni — {vista?.dipendente ? `${vista.dipendente.nome} ${vista.dipendente.cognome}` : ""}
            </div>
            <div className="text-sm text-neutral-700">
              {labelWeekRange(settimanaInizio)} · {numSettimane} settimane
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap print:hidden">
            {/* LEFT: navigazione periodo — doppio scorrimento mese + settimana */}
            <div className="flex items-center gap-1 flex-shrink-0 bg-white border border-neutral-300 rounded-lg p-1">
              <button onClick={() => shiftSettimane(-4)}
                className="min-h-[40px] px-2.5 text-neutral-600 hover:bg-neutral-100 rounded-md text-sm font-semibold"
                title="Mese precedente (-4 settimane)">⏪ mese</button>
              <button onClick={() => shiftSettimane(-1)}
                className="min-h-[40px] px-2.5 text-neutral-600 hover:bg-neutral-100 rounded-md text-sm font-semibold"
                title="Settimana precedente">◀ sett</button>
              <button onClick={vaiOggi}
                className="min-h-[40px] px-3 text-sm font-semibold text-brand-blue hover:bg-brand-blue/5 rounded-md"
                title="Vai a oggi">Oggi</button>
              <button onClick={() => shiftSettimane(1)}
                className="min-h-[40px] px-2.5 text-neutral-600 hover:bg-neutral-100 rounded-md text-sm font-semibold"
                title="Settimana successiva">sett ▶</button>
              <button onClick={() => shiftSettimane(4)}
                className="min-h-[40px] px-2.5 text-neutral-600 hover:bg-neutral-100 rounded-md text-sm font-semibold"
                title="Mese successivo (+4 settimane)">mese ⏩</button>
            </div>

            <div className="min-h-[44px] px-3 flex items-center bg-white border border-neutral-300 rounded-lg text-sm gap-2 flex-shrink-0">
              <span className="text-neutral-900">{labelWeekRange(settimanaInizio)}</span>
              <span className="text-neutral-400 font-mono text-xs">· {numSettimane}w</span>
            </div>

            <div className="flex-1"></div>

            {/* RIGHT: stampa + (admin) foglio completo */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <Btn
                variant="secondary"
                size="md"
                onClick={() => window.print()}
                disabled={!vista}
                title="Stampa i tuoi turni (usa il dialog nativo del browser per PDF/stampante)"
              >
                🖨️ Stampa
              </Btn>
              {isAdmin && (
                <Btn
                  variant="primary"
                  size="md"
                  onClick={() => apriInFoglio(settimanaInizio)}
                  title="Apri il Foglio Settimana completo (solo admin)"
                >
                  📋 Foglio Settimana
                </Btn>
              )}
            </div>
          </div>
        </div>

        {/* UTENTE NON COLLEGATO A DIPENDENTE */}
        {notLinked && !loading && (
          <div className="bg-white rounded-xl shadow p-6 text-center">
            <div className="text-4xl mb-2">🔗</div>
            <div className="text-lg font-semibold mb-1">Utente non collegato</div>
            <div className="text-sm text-neutral-600 max-w-md mx-auto">
              Il tuo utente non è ancora collegato a un dipendente in anagrafica.
              Chiedi all'amministratore di associare il tuo account al dipendente
              corrispondente per poter vedere i tuoi turni qui.
            </div>
            {isAdmin && (
              <div className="mt-4 inline-block">
                <Btn variant="primary" size="md" onClick={() => navigate("/dipendenti")}>
                  → Vai a Dipendenti
                </Btn>
              </div>
            )}
          </div>
        )}

        {error && !notLinked && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        {loading && <div className="text-center py-10 text-neutral-500">Caricamento…</div>}

        {!loading && !notLinked && vista && (
          <>
            <DipendenteHeader vista={vista} />

            <div className="grid grid-cols-1 gap-4 mt-4 print:gap-2">
              {vista.settimane.map(sett => (
                <div key={sett.iso} style={{ breakInside: "avoid" }}>
                  <CardSettimana
                    settimana={sett}
                    dipendente={vista.dipendente}
                    isAdmin={isAdmin}
                    onApriInFoglio={() => apriInFoglio(sett.iso)}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ---- DIPENDENTE HEADER (minimale, senza totali) --------------------------
// Variante 3: rimosso il blocco "Totali periodo" con 6 metric cards (ore lorde/nette,
// giorni lavorati, riposi, chiusure, opzionali). Per il dipendente quei numeri
// sono rumore da back-office. Lasciato solo: nome + reparto + badge "a chiamata".
function DipendenteHeader({ vista }) {
  const dip = vista.dipendente;
  return (
    <div className="bg-white rounded-xl shadow px-4 py-3 flex items-center gap-2 flex-wrap">
      <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dip.colore || "#6b7280" }}></span>
      <span className="font-semibold text-neutral-900">{dip.nome} {dip.cognome}</span>
      <span className="text-xs text-neutral-500">· {dip.reparto_nome}</span>
      {dip.a_chiamata && (
        <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide">
          a chiamata
        </span>
      )}
    </div>
  );
}


// ---- CARD SETTIMANA -------------------------------------------------------
// Variante 3: header snello. Tolti semaforo CCNL, badge ore nette,
// codice ISO e contatori lav/riposi/chiusure. Resta il label periodo.
function CardSettimana({ settimana, dipendente, isAdmin, onApriInFoglio }) {
  const oggi = oggiIso();

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="px-4 py-3 bg-neutral-50 border-b flex items-center justify-between flex-wrap gap-2">
        <div className="font-semibold text-sm text-neutral-900">
          {labelWeekRange(settimana.iso)}
        </div>
        {isAdmin && (
          <div className="print:hidden">
            <Btn
              variant="primary"
              size="sm"
              onClick={onApriInFoglio}
              title="Apri nel Foglio Settimana (solo admin)"
            >
              ✏️ Apri settimana
            </Btn>
          </div>
        )}
      </div>

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
              dipendente={dipendente}
            />
          );
        })}
      </div>
    </div>
  );
}


// ---- CELLA GIORNO TIMELINE -----------------------------------------------
// Variante 3: rimosso il footer Lordo/Netto, rimossa la pill "Oggi" (sostituita
// dal testo " · oggi" in brand-blue accanto al nome del giorno + ring 2px).
function CellaGiornoTimeline({ iso, dato, isToday /* dipendente: piu' usato in v3 */ }) {
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
      <div className="flex items-center justify-center mb-2">
        <div className={`text-xs font-semibold ${isToday ? "text-brand-blue" : "text-neutral-700"}`}>
          {formatDayShort(iso)}{isToday && <span className="ml-1 opacity-80">· oggi</span>}
        </div>
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
        <div className="flex-1 flex flex-col gap-1.5">
          {/* Slot PRANZO — sempre in alto. Placeholder se assente, così cena resta allineata. */}
          <div className="flex flex-col gap-1.5">
            {pranziTurni.length > 0
              ? pranziTurni.map(t => (
                  <BloccoTurno key={t.id} turno={t} servizio="PRANZO" />
                ))
              : <SlotPlaceholder />}
          </div>
          {/* Slot CENA — sempre in basso. Placeholder se assente, così pranzo resta allineato. */}
          <div className="flex flex-col gap-1.5">
            {ceneTurni.length > 0
              ? ceneTurni.map(t => (
                  <BloccoTurno key={t.id} turno={t} servizio="CENA" />
                ))
              : <SlotPlaceholder />}
          </div>
          {/* Eventuali turni senza servizio classificato: coda */}
          {altriTurni.map(t => (
            <BloccoTurno key={t.id} turno={t} servizio="ALTRO" />
          ))}
        </div>
      )}
    </div>
  );
}


// ---- PLACEHOLDER SLOT ----------------------------------------------------
// Mantiene lo spazio di un BloccoTurno per allineare pranzi/cene fra le celle.
// Altezza coerente col nuovo blocco 2-righe (label + orario).
function SlotPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="rounded-md px-2 py-1 border border-transparent invisible"
    >
      <div className="text-[10px] leading-tight">·</div>
      <div className="text-[11px] tabular-nums leading-tight">00:00–00:00</div>
    </div>
  );
}


// ---- BLOCCO TURNO --------------------------------------------------------
// Variante 3: due righe — label "Pranzo"/"Cena" (piccola) + orario inizio-fine.
// Palette per servizio (amber/indigo), non piu' per dipendente.
// OPZIONALE e ANNULLATO preservati (★ + opacity/line-through).
function BloccoTurno({ turno, servizio }) {
  const cfg = SERVIZIO_STYLE[servizio] || SERVIZIO_STYLE.ALTRO;
  const stato = (turno.stato || "CONFERMATO").toUpperCase();
  const isOpz = stato === "OPZIONALE";
  const isAnn = stato === "ANNULLATO";

  const ora = (turno.ora_inizio || "").slice(0, 5);
  const fine = (turno.ora_fine || "").slice(0, 5);

  return (
    <div
      className={`rounded-md border px-2 py-1 text-center ${cfg.cls}`}
      style={{
        opacity: isAnn ? 0.4 : 1,
        textDecoration: isAnn ? "line-through" : "none",
      }}
      title={[turno.turno_nome, turno.note, stato].filter(Boolean).join(" — ")}
    >
      <div className="text-[10px] leading-tight">
        {isOpz && <span title="Opzionale">★ </span>}
        {cfg.icon} {cfg.label}
      </div>
      <div className="text-[11px] font-semibold leading-tight tabular-nums">
        {ora && fine ? `${ora}–${fine}` : (turno.turno_nome || "—")}
      </div>
      {turno.note && (
        <div className="text-[10px] opacity-70 truncate mt-0.5">{turno.note}</div>
      )}
    </div>
  );
}
