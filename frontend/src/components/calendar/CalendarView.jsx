// FILE: frontend/src/components/calendar/CalendarView.jsx
// @version: v1.0 — Mattone M.E: componente calendario condiviso (3 viste)
//
// Componente STATELESS e CONTROLLATO.
// Il chiamante gestisce currentDate / view / events e reagisce ai callback.
//
// Esempio minimo:
//   <CalendarView
//     view={view}
//     onViewChange={setView}
//     currentDate={date}
//     onDateChange={setDate}
//     events={events}
//     onSelectDate={(d) => console.log("click giorno", d)}
//     onSelectEvent={(ev) => console.log("click evento", ev)}
//   />
//
// Per API completa, props, shape evento e limiti v1 vedi docs/mattone_calendar.md

import React, { useEffect, useRef } from "react";
import { Btn } from "../ui";
import {
  addDays, addMonths, startOfMonth,
  formatMonthYear, formatWeekRange, formatDateLong,
} from "./calendarUtils";
import { VIEWS } from "./constants";
import MonthView from "./MonthView";
import WeekView from "./WeekView";
import DayView from "./DayView";

const VIEW_LABELS = { mese: "Mese", settimana: "Settimana", giorno: "Giorno" };

function CalendarView({
  view = "mese",
  onViewChange,
  currentDate,
  onDateChange,
  events = [],
  onSelectDate,
  onSelectEvent,
  selectedDate = null,
  renderEvent,
  renderDayCell,
  weekStartsOn = 1,
  minHeight = "28rem",
  loading = false,
  emptyLabel = "Nessun evento",
  showToolbar = true,
  className = "",
}) {
  // Fallback: se il chiamante non passa currentDate usiamo oggi (interno, non persistito).
  const today = React.useMemo(() => new Date(), []);
  const date = currentDate || today;

  const rootRef = useRef(null);

  // ── Navigazione ───────────────────────────────────────────────────────
  const stepForView = (dir) => {
    if (!onDateChange) return;
    if (view === "mese")      onDateChange(addMonths(date, dir));
    else if (view === "settimana") onDateChange(addDays(date, 7 * dir));
    else                       onDateChange(addDays(date, dir));
  };

  const goToday = () => onDateChange && onDateChange(new Date());

  // Scorciatoie tastiera (attive solo quando il root ha focus per evitare interferenze)
  const onKeyDown = (e) => {
    if (e.defaultPrevented) return;
    // Evita di catturare se l'utente sta digitando in un input figlio
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    switch (e.key) {
      case "ArrowLeft":  stepForView(-1); break;
      case "ArrowRight": stepForView(+1); break;
      case "t": case "T": goToday(); break;
      case "m": case "M": onViewChange && onViewChange("mese"); break;
      case "s": case "S": onViewChange && onViewChange("settimana"); break;
      case "g": case "G": onViewChange && onViewChange("giorno"); break;
      default: return;
    }
  };

  // ── Titolo toolbar ────────────────────────────────────────────────────
  const title =
    view === "mese"      ? formatMonthYear(date) :
    view === "settimana" ? formatWeekRange(date, weekStartsOn) :
                           formatDateLong(date);

  // ── Body ──────────────────────────────────────────────────────────────
  const bodyProps = {
    currentDate: date,
    events,
    onSelectDate,
    onSelectEvent,
    selectedDate,
    renderEvent,
    renderDayCell,
    weekStartsOn,
    emptyLabel,
    // Per il drill-down "+N altri" o click data → vista giorno.
    onDrillDown: (d) => {
      if (onViewChange) {
        onDateChange && onDateChange(d);
        onViewChange("giorno");
      } else {
        onSelectDate && onSelectDate(d);
      }
    },
  };

  return (
    <div
      ref={rootRef}
      className={`relative flex flex-col bg-white border border-neutral-200 rounded-xl shadow-sm focus:outline-none ${className}`}
      style={{ minHeight }}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="region"
      aria-label="Calendario"
    >
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-neutral-200 bg-brand-cream/50 rounded-t-xl">
          {onDateChange && (
            <div className="flex items-center gap-1">
              <Btn
                variant="secondary"
                size="sm"
                onClick={() => stepForView(-1)}
                aria-label="Precedente"
              >
                ◀
              </Btn>
              <Btn
                variant="secondary"
                size="sm"
                onClick={goToday}
              >
                Oggi
              </Btn>
              <Btn
                variant="secondary"
                size="sm"
                onClick={() => stepForView(+1)}
                aria-label="Successivo"
              >
                ▶
              </Btn>
            </div>
          )}

          <h2 className="flex-1 text-center font-playfair text-lg text-sky-900 truncate px-2">
            {title}
          </h2>

          {onViewChange && (
            <div className="inline-flex rounded-lg border border-neutral-300 overflow-hidden text-sm">
              {VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onViewChange(v)}
                  className={
                    "px-3 py-1.5 min-h-[40px] font-medium transition-colors " +
                    (view === v
                      ? "bg-brand-blue text-white"
                      : "bg-white text-neutral-700 hover:bg-neutral-50")
                  }
                  aria-pressed={view === v}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Body: vista attiva ──────────────────────────────────────────── */}
      <div className="flex-1 relative">
        {view === "mese"      && <MonthView  {...bodyProps} />}
        {view === "settimana" && <WeekView   {...bodyProps} />}
        {view === "giorno"    && <DayView    {...bodyProps} />}

        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
            <div className="h-8 w-8 rounded-full border-2 border-brand-blue border-t-transparent animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

export default CalendarView;
