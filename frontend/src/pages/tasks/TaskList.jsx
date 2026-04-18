// CucinaTaskList — mobile-first iPhone (P2-BIS, sessione 44)
// Mockup: docs/mockups/cucina_tasks_iphone_mockup.html
//
// Layout:
//  - Mobile (<sm): header Playfair + FAB 56pt galleggiante, toggle "I miei/Tutti",
//    pills stato scroll orizzontale, card full-width con bordo sinistro priorita',
//    swipe-left rivela "✓ Fatto", tap apre TaskSheet.
//  - sm+: pulsante inline nell'header, pills/toggle inline, lista a card sempre.
//
// Nessun window.prompt/confirm/alert — tutte le conferme via TaskSheet o toast.
// Endpoint backend invariati (/cucina/tasks/... con trailing slash su root).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { REPARTI, getReparto } from "../../config/reparti";
import useToast from "../../hooks/useToast";
import Nav from "./Nav";
import TaskNuovo from "./TaskNuovo";
import TaskSheet from "../../components/tasks/TaskSheet";

// ── Costanti ───────────────────────────────────────────────────

// Pills stato: ordine visivo mobile
const PILL_STATI = [
  { key: "APERTO",     label: "Aperti" },
  { key: "IN_CORSO",   label: "In corso" },
  { key: "SCADUTO",    label: "Scaduti" },
  { key: "COMPLETATO", label: "Completati" },
];

const STATO_CHIP = {
  APERTO:     "bg-[#fdf3dc] text-[#8a5a00]",
  IN_CORSO:   "bg-[#e1ecfc] text-[#1a4fa0]",
  COMPLETATO: "bg-[#e1f2e8] text-[#1a7549]",
  SCADUTO:    "bg-[#fbe6e2] text-[#9c1f10]",
  ANNULLATO:  "bg-[#EFEBE3] text-neutral-500",
};
const STATO_LABEL = {
  APERTO: "Aperto", IN_CORSO: "In corso", COMPLETATO: "Completato",
  SCADUTO: "Scaduto", ANNULLATO: "Annullato",
};
const PRIO_CHIP = {
  ALTA:  "bg-[#fbe6e2] text-[#9c1f10]",
  MEDIA: "bg-[#fdf3dc] text-[#8a5a00]",
  BASSA: "bg-[#f0ede6] text-neutral-600",
};
const PRIO_LEFT = {
  ALTA:  "border-l-brand-red",
  MEDIA: "border-l-amber-500",
  BASSA: "border-l-[#b9b4aa]",
};

// ── Component ──────────────────────────────────────────────────

export default function TaskList() {
  const { toast } = useToast();

  const role = (typeof localStorage !== "undefined" && localStorage.getItem("role")) || "";
  const username = (typeof localStorage !== "undefined" && localStorage.getItem("username")) || "";
  const canDelete = ["admin", "superadmin", "chef"].includes(role);

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState("");

  // UI state
  const [scope, setScope] = useState("miei");           // miei | tutti
  const [statoFilter, setStatoFilter] = useState("APERTO"); // "" = tutti | key stato
  const [repartoFilter, setRepartoFilter] = useState(""); // "" = tutti reparti | key reparto
  const [sheetFor, setSheetFor] = useState(null);       // task object
  const [editor, setEditor] = useState(null);           // null | "new" | task
  const [swipedId, setSwipedId] = useState(null);       // id della card attualmente rivelata

  // ── load ────────────────────────────────────────────────────

  const load = useCallback(() => {
    setLoading(true);
    setErrorBanner("");
    // Lo stato e' filtrato client-side per counts istantanei.
    // Il reparto va server-side per performance sulle liste grandi.
    const qs = new URLSearchParams();
    if (repartoFilter) qs.set("reparto", repartoFilter);
    const url = qs.toString()
      ? `${API_BASE}/tasks/tasks/?${qs.toString()}`
      : `${API_BASE}/tasks/tasks/`;
    apiFetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setList)
      .catch(e => setErrorBanner(e.message))
      .finally(() => setLoading(false));
  }, [repartoFilter]);

  useEffect(() => { load(); }, [load]);

  // ── filtered + counts ───────────────────────────────────────

  const scopedList = useMemo(() => {
    if (scope === "miei" && username) {
      return list.filter(t => t.assegnato_user === username);
    }
    return list;
  }, [list, scope, username]);

  const counts = useMemo(() => {
    const c = { APERTO: 0, IN_CORSO: 0, SCADUTO: 0, COMPLETATO: 0, ANNULLATO: 0 };
    scopedList.forEach(t => { c[t.stato] = (c[t.stato] || 0) + 1; });
    return c;
  }, [scopedList]);

  const visibleList = useMemo(() => {
    if (!statoFilter) return scopedList;
    return scopedList.filter(t => t.stato === statoFilter);
  }, [scopedList, statoFilter]);

  // Subcount per subline del header
  const subText = useMemo(() => {
    const parts = [];
    if (counts.APERTO)   parts.push(`${counts.APERTO} ${counts.APERTO === 1 ? "aperto" : "aperti"}`);
    if (counts.SCADUTO)  parts.push(`${counts.SCADUTO} ${counts.SCADUTO === 1 ? "scaduto" : "scaduti"}`);
    if (counts.IN_CORSO) parts.push(`${counts.IN_CORSO} in corso`);
    if (!parts.length && counts.COMPLETATO) parts.push(`${counts.COMPLETATO} completati`);
    return parts.join(" · ") || "nessun task";
  }, [counts]);

  // ── quick-complete (da swipe) ───────────────────────────────

  async function quickComplete(task) {
    try {
      const res = await apiFetch(`${API_BASE}/tasks/tasks/${task.id}/completa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_completamento: null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      toast("✓ Fatto", { kind: "success" });
      setSwipedId(null);
      load();
    } catch (e) {
      toast(e.message, { kind: "error", duration: 2800 });
    }
  }

  // ── render ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <Nav current="tasks" />

      {/* Mobile: sticky header stacked; sm+: non sticky (c'e' gia' la top-nav) */}
      <div className="sm:static sticky top-0 z-20 bg-brand-cream border-b border-[#e6e1d8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 sm:pt-4 pb-2 sm:pb-3">
          {/* Row 1: titolo + counter + bottone new (sm+) */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-playfair font-bold text-brand-ink leading-tight">
                Task
              </h1>
              <div className="text-[13px] text-neutral-500 mt-0.5 truncate">
                {subText}
              </div>
            </div>

            {/* Bottone + su sm+ (sul mobile c'e' il FAB) */}
            <button
              onClick={() => setEditor("new")}
              className="hidden sm:inline-flex items-center gap-2 bg-brand-red text-white px-4 py-2.5 rounded-xl font-semibold hover:brightness-95 min-h-[48px]"
              type="button"
            >
              + Nuovo task
            </button>
          </div>

          {/* Row 2: toggle I miei/Tutti (mostro solo se username presente) */}
          {username && (
            <div
              className="mt-2.5 grid grid-cols-2 w-full rounded-xl p-0.5 bg-[#EFEBE3]"
              role="tablist"
            >
              <button
                type="button"
                role="tab"
                aria-selected={scope === "miei"}
                onClick={() => setScope("miei")}
                className={
                  "min-h-[40px] rounded-lg text-sm font-semibold transition-colors " +
                  (scope === "miei" ? "bg-white text-brand-ink shadow-sm" : "text-neutral-500")
                }
              >
                I miei
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scope === "tutti"}
                onClick={() => setScope("tutti")}
                className={
                  "min-h-[40px] rounded-lg text-sm font-semibold transition-colors " +
                  (scope === "tutti" ? "bg-white text-brand-ink shadow-sm" : "text-neutral-500")
                }
              >
                Tutti
              </button>
            </div>
          )}

          {/* Row 3: pills REPARTO — mobile scroll x, sm+ wrap */}
          <div
            className="mt-2.5 flex gap-2 overflow-x-auto sm:flex-wrap sm:overflow-x-visible pb-1"
            style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
            role="tablist"
            aria-label="Filtri reparto"
          >
            <Pill
              active={repartoFilter === ""}
              onClick={() => setRepartoFilter("")}
            >
              Tutti
            </Pill>
            {REPARTI.map(r => (
              <RepartoPill
                key={r.key}
                reparto={r}
                active={repartoFilter === r.key}
                onClick={() => setRepartoFilter(r.key)}
              />
            ))}
          </div>

          {/* Row 4: pills stato scrollabili orizzontalmente */}
          <div
            className="mt-2.5 flex gap-2 overflow-x-auto pb-1"
            style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
            role="tablist"
            aria-label="Filtri stato"
          >
            {PILL_STATI.map(p => (
              <Pill
                key={p.key}
                active={statoFilter === p.key}
                onClick={() => setStatoFilter(p.key)}
                count={counts[p.key]}
              >
                {p.label}
              </Pill>
            ))}
            <Pill active={statoFilter === ""} onClick={() => setStatoFilter("")}>
              Tutti
            </Pill>
          </div>
        </div>
      </div>

      {/* Error banner globale */}
      {errorBanner && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-3">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl text-sm">
            {errorBanner}
          </div>
        </div>
      )}

      {/* Lista task */}
      <div
        className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-[calc(160px+env(safe-area-inset-bottom))] sm:pb-12 flex flex-col gap-2.5"
      >
        {loading && (
          <div className="text-center py-8 text-neutral-500">Caricamento...</div>
        )}

        {!loading && visibleList.length === 0 && (
          <EmptyState
            scope={scope}
            hasScope={!!username}
            onSwitchToAll={() => { setScope("tutti"); }}
            onCreate={() => setEditor("new")}
          />
        )}

        {!loading && visibleList.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            revealed={swipedId === task.id}
            onReveal={() => setSwipedId(task.id)}
            onHide={() => setSwipedId(null)}
            onOpen={() => { setSwipedId(null); setSheetFor(task); }}
            onQuickComplete={() => quickComplete(task)}
          />
        ))}
      </div>

      {/* FAB 56pt mobile-only: sopra la tab-bar con safe-area */}
      <button
        onClick={() => setEditor("new")}
        className="sm:hidden fixed right-4 z-[25] w-14 h-14 rounded-full bg-brand-red text-white text-2xl font-bold flex items-center justify-center active:scale-95"
        style={{
          bottom: "calc(84px + env(safe-area-inset-bottom))",
          boxShadow: "0 8px 20px rgba(232,64,43,.35)",
        }}
        aria-label="Nuovo task"
        type="button"
      >
        +
      </button>

      {/* TaskSheet dettaglio */}
      {sheetFor && (
        <TaskSheet
          task={sheetFor}
          onClose={() => setSheetFor(null)}
          onRefresh={load}
          canDelete={canDelete}
          onEdit={(t) => { setSheetFor(null); setEditor(t); }}
        />
      )}

      {/* Nuovo / modifica task */}
      {editor && (
        <TaskNuovo
          task={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Pill filtro ────────────────────────────────────────────────

function Pill({ active, onClick, count, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "flex-shrink-0 px-3.5 py-2 rounded-full text-[13px] font-semibold border transition-colors min-h-[40px] " +
        (active
          ? "bg-brand-red text-white border-brand-red"
          : "bg-white text-neutral-600 border-[#e6e1d8] hover:bg-[#EFEBE3]")
      }
      style={{ scrollSnapAlign: "start" }}
    >
      {children}
      {count != null && count > 0 && (
        <span className={"ml-1.5 font-medium " + (active ? "opacity-90" : "opacity-55")}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Pill reparto (colorata brand-coordinato quando attivo) ─────

function RepartoPill({ reparto, active, onClick }) {
  // Quando attivo: mostra con il color scheme del reparto (bg-*-50 border-*-300)
  // Quando inattivo: bianco neutro con solo icona+label.
  const activeCls = {
    cucina:       "bg-red-100 text-red-900 border-red-400",
    bar:          "bg-amber-100 text-amber-900 border-amber-400",
    sala:         "bg-rose-100 text-rose-900 border-rose-400",
    pulizia:      "bg-emerald-100 text-emerald-900 border-emerald-400",
    manutenzione: "bg-slate-100 text-slate-900 border-slate-400",
  }[reparto.key] || "bg-red-100 text-red-900 border-red-400";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "flex-shrink-0 inline-flex items-center gap-1 px-3.5 py-2 rounded-full text-[13px] font-semibold border transition-colors min-h-[40px] " +
        (active ? activeCls : "bg-white text-neutral-700 border-[#e6e1d8] hover:bg-[#EFEBE3]")
      }
      style={{ scrollSnapAlign: "start" }}
    >
      <span aria-hidden="true">{reparto.icon}</span>
      <span>{reparto.label}</span>
    </button>
  );
}

// ── Badge reparto inline (icona + label corto) ─────────────────

export function RepartoBadge({ reparto }) {
  const r = getReparto(reparto);
  // Label corto max 6 char — "Manutenzione" → "Manut.", "Pulizia" → "Pulizia"
  const short = r.label.length > 6 ? r.label.slice(0, 5) + "." : r.label;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border ${r.color}`}
      title={r.label}
    >
      <span aria-hidden="true">{r.icon}</span>
      <span>{short}</span>
    </span>
  );
}

// ── TaskRow con swipe-to-complete ──────────────────────────────

const SWIPE_THRESHOLD = 50;   // px — soglia attivazione swipe
const SWIPE_REVEAL   = 96;   // px — larghezza azione "✓ Fatto"
const AXIS_LOCK      = 8;    // px — distinzione scroll vert vs swipe horiz

function TaskRow({ task, revealed, onReveal, onHide, onOpen, onQuickComplete }) {
  const chiuso = task.stato === "COMPLETATO" || task.stato === "ANNULLATO";
  const canSwipe = !chiuso;

  // Touch state
  const startRef = useRef(null);
  const axisRef = useRef(null);   // "x" | "y" | null
  const [liveX, setLiveX] = useState(0);

  const handleTouchStart = (e) => {
    if (!canSwipe) return;
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    axisRef.current = null;
    setLiveX(revealed ? -SWIPE_REVEAL : 0);
  };

  const handleTouchMove = (e) => {
    if (!canSwipe || !startRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;

    // Asse lock: una volta deciso, lo rispetto
    if (axisRef.current === null) {
      if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
      axisRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (axisRef.current !== "x") return;

    // Gesture orizzontale attiva: blocchi scroll verticale
    // (evita che la pagina scrolli mentre sto facendo swipe)
    if (e.cancelable) e.preventDefault();

    let offset = dx + (revealed ? -SWIPE_REVEAL : 0);
    // Clamp: non oltre 0 a destra, non oltre -SWIPE_REVEAL*1.5 a sinistra
    if (offset > 0) offset = 0;
    if (offset < -SWIPE_REVEAL * 1.5) offset = -SWIPE_REVEAL * 1.5;
    setLiveX(offset);
  };

  const handleTouchEnd = (e) => {
    if (!canSwipe || !startRef.current) { startRef.current = null; axisRef.current = null; return; }
    const t = (e.changedTouches && e.changedTouches[0]) || null;
    const dx = t ? t.clientX - startRef.current.x : 0;

    // Se era tap (asse non deciso o movimento trascurabile): onOpen
    if (axisRef.current === null || Math.abs(dx) < AXIS_LOCK) {
      setLiveX(revealed ? -SWIPE_REVEAL : 0);
      startRef.current = null;
      // Tap su revealed → chiudi reveal; tap altrove → apri sheet
      if (revealed) onHide(); else onOpen();
      return;
    }

    if (axisRef.current === "x") {
      // Snap
      if (!revealed && dx < -SWIPE_THRESHOLD) {
        setLiveX(-SWIPE_REVEAL);
        onReveal();
      } else if (revealed && dx > SWIPE_THRESHOLD) {
        setLiveX(0);
        onHide();
      } else {
        // torna allo stato precedente
        setLiveX(revealed ? -SWIPE_REVEAL : 0);
      }
    }
    startRef.current = null;
    axisRef.current = null;
  };

  // Se "revealed" cambia esternamente (chiusura altri), sync live
  useEffect(() => {
    setLiveX(revealed ? -SWIPE_REVEAL : 0);
  }, [revealed]);

  const prioLabel = task.priorita ? task.priorita.charAt(0) + task.priorita.slice(1).toLowerCase() : "—";
  const stLabel = STATO_LABEL[task.stato] || task.stato;

  // Classe bg per scaduto / completato
  const extraCardCls =
    task.stato === "SCADUTO"     ? "bg-gradient-to-r from-[#fbe6e2] to-white"
    : task.stato === "COMPLETATO" ? "opacity-65"
    : "bg-white";

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ touchAction: "pan-y" }}>
      {/* Action sottostante (verde) */}
      {canSwipe && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onQuickComplete(); }}
          className="absolute top-0 right-0 bottom-0 w-[96px] bg-brand-green text-white font-bold text-sm flex items-center justify-center"
          aria-label="Completa rapidamente"
          style={{ zIndex: 0 }}
        >
          ✓ Fatto
        </button>
      )}

      {/* Card principale (traslata sopra l'action) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          // Fallback click desktop: se non c'e' stato touch, apre sheet
          if (startRef.current === null && axisRef.current === null && liveX === 0) {
            if (revealed) onHide(); else onOpen();
          }
        }}
        className={
          "relative z-[1] border border-[#e6e1d8] border-l-4 rounded-2xl px-4 py-3.5 min-h-[72px] " +
          "cursor-pointer select-none " +
          (PRIO_LEFT[task.priorita] || "border-l-[#b9b4aa]") + " " +
          extraCardCls
        }
        style={{
          transform: `translateX(${liveX}px)`,
          transition: startRef.current ? "none" : "transform .2s ease",
        }}
      >
        <div className={
          "font-playfair font-bold text-[16px] leading-tight tracking-tight text-brand-ink " +
          (task.stato === "COMPLETATO" ? "line-through decoration-[#b9b4aa]" : "")
        }>
          {task.titolo}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-neutral-500">
          <RepartoBadge reparto={task.reparto} />
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${STATO_CHIP[task.stato] || ""}`}>
            {stLabel}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${PRIO_CHIP[task.priorita] || ""}`}>
            {prioLabel}
          </span>
          {task.data_scadenza && (
            <span>⏱ {formatDueRelative(task.data_scadenza, task.ora_scadenza)}</span>
          )}
          {task.assegnato_user && (
            <span className="inline-flex items-center gap-1.5">
              <AvatarInitial name={task.assegnato_user} />
              {task.assegnato_user}
            </span>
          )}
        </div>

        {(task.descrizione || task.note_completamento) && (
          <div className="mt-1 text-[12px] text-neutral-600 italic truncate">
            {task.note_completamento
              ? `"${task.note_completamento}"`
              : task.descrizione}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────

function EmptyState({ scope, hasScope, onSwitchToAll, onCreate }) {
  const isMiei = hasScope && scope === "miei";
  return (
    <div className="bg-white border border-dashed border-[#e6e1d8] rounded-2xl p-8 text-center mt-3">
      <div className="text-5xl mb-2">🧑‍🍳</div>
      <div className="font-playfair font-bold text-brand-ink text-lg">
        Nessun task in questa categoria
      </div>
      <div className="text-sm text-neutral-500 mt-1 mb-4">
        {isMiei
          ? "Nessun task assegnato a te qui. Prova a vedere 'Tutti'."
          : "Crea un task per tracciare un'attivita' operativa."}
      </div>
      <div className="flex gap-2 justify-center flex-wrap">
        {isMiei && (
          <button
            onClick={onSwitchToAll}
            type="button"
            className="min-h-[44px] px-4 rounded-xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink hover:bg-[#EFEBE3]"
          >
            Vedi tutti
          </button>
        )}
        <button
          onClick={onCreate}
          type="button"
          className="min-h-[44px] px-4 rounded-xl bg-brand-red text-white font-semibold"
          style={{ boxShadow: "0 6px 14px rgba(232,64,43,.25)" }}
        >
          + Crea il primo task
        </button>
      </div>
    </div>
  );
}

// ── Mini avatar 18pt ──────────────────────────────────────────

function AvatarInitial({ name }) {
  const n = (name || "").toLowerCase();
  const hash = [...n].reduce((a, c) => a + c.charCodeAt(0), 0);
  const palette = ["bg-brand-red", "bg-brand-green", "bg-brand-blue"];
  const color = palette[hash % palette.length];
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-white text-[10px] font-playfair font-bold ${color}`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

// ── Format scadenza relativa ───────────────────────────────────

function formatDueRelative(data, ora) {
  if (!data) return "";
  try {
    const d = new Date(data + "T00:00:00");
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = Math.round((d - today) / 86400000);
    const base = diff === 0 ? "oggi"
              : diff === -1 ? "ieri"
              : diff === 1 ? "domani"
              : diff < 0 ? `${-diff} giorni fa`
              : diff <= 6 ? `tra ${diff} giorni`
              : `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
    return ora ? `${base} ${ora}` : base;
  } catch {
    return ora ? `${data} ${ora}` : data;
  }
}
