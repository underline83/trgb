// FILE: frontend/src/components/calendar/MonthView.jsx
// @version: v1.0 — Vista mese: griglia 6×7 con eventi come chip/pallini
//
// Interno al mattone M.E Calendar. Non importare direttamente: usa <CalendarView>.

import React from "react";
import {
  monthGrid, sameDay, sameMonth, startOfMonth,
  eventsOnDay, sortEvents,
} from "./calendarUtils";
import { GIORNI_IT_3, GIORNI_IT_1, COLORI_EVENTO, DEFAULT_COLOR } from "./constants";

// Quanti eventi mostrare come chip prima di collassare in "+N altri"
const MAX_CHIPS = 3;

function EventChip({ event, onClick }) {
  const palette = COLORI_EVENTO[event.color] || COLORI_EVENTO[DEFAULT_COLOR];
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick && onClick(event); }}
      className={
        "w-full text-left text-[11px] leading-tight truncate px-1.5 py-0.5 rounded border " +
        palette.soft +
        " hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      }
      aria-label={event.title + (event.subtitle ? ", " + event.subtitle : "")}
      title={event.title + (event.subtitle ? " — " + event.subtitle : "")}
    >
      {event.icon ? <span className="mr-0.5">{event.icon}</span> : null}
      {event.title}
    </button>
  );
}

function DayCell({
  day, isOther, isToday, isSelected, events,
  onSelectDate, onSelectEvent, onDrillDown, renderDayCell, renderEvent,
}) {
  const dayEvents = sortEvents(events);
  const visible = dayEvents.slice(0, MAX_CHIPS);
  const hidden  = dayEvents.length - visible.length;

  const handleCellClick = () => {
    if (onSelectDate) onSelectDate(day);
  };

  // Custom cell renderer (caso turni dipendenti)
  if (renderDayCell) {
    return renderDayCell(day, dayEvents, { isOther, isToday, isSelected });
  }

  const baseBg    = isOther   ? "bg-neutral-50/60" : "bg-white";
  const textMute  = isOther   ? "text-neutral-400" : "text-neutral-800";
  const todayRing = isToday   ? "ring-2 ring-inset ring-brand-blue" : "";
  const selected  = isSelected ? "bg-blue-50" : "";

  return (
    <div
      className={
        "relative flex flex-col border-b border-r border-neutral-200 " +
        "min-h-[4.5rem] md:min-h-[5.5rem] xl:min-h-[6.5rem] " +
        "cursor-pointer select-none " +
        baseBg + " " + selected + " " + todayRing
      }
      role="button"
      tabIndex={0}
      aria-label={`${day.getDate()} — ${dayEvents.length} eventi`}
      onClick={handleCellClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCellClick(); } }}
    >
      {/* Numero giorno */}
      <div className="flex items-center justify-between px-1.5 pt-1">
        <span
          className={
            "text-xs md:text-sm font-medium " + textMute +
            (isToday ? " rounded-full bg-brand-blue text-white w-6 h-6 flex items-center justify-center" : "")
          }
        >
          {day.getDate()}
        </span>
        {dayEvents.length > 0 && !isToday && (
          <span className="text-[10px] text-neutral-400">{dayEvents.length}</span>
        )}
      </div>

      {/* Chips eventi */}
      <div className="flex-1 flex flex-col gap-0.5 px-1 pb-1 mt-0.5 overflow-hidden">
        {visible.map((ev) =>
          renderEvent
            ? <React.Fragment key={ev.id}>{renderEvent(ev, { view: "mese", compact: true })}</React.Fragment>
            : <EventChip key={ev.id} event={ev} onClick={onSelectEvent} />
        )}
        {hidden > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDrillDown && onDrillDown(day); }}
            className="text-[11px] text-brand-blue hover:underline text-left px-1"
          >
            +{hidden} altri
          </button>
        )}
      </div>
    </div>
  );
}

function MonthView({
  currentDate, events, onSelectDate, onSelectEvent,
  selectedDate, renderEvent, renderDayCell, weekStartsOn, onDrillDown,
}) {
  const grid = monthGrid(currentDate, weekStartsOn);
  const focusMonthDate = startOfMonth(currentDate);
  const today = new Date();

  return (
    <div className="flex flex-col h-full">
      {/* Header nomi giorni */}
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50">
        {GIORNI_IT_3.map((lbl, i) => (
          <div
            key={i}
            className={
              "text-xs font-semibold text-neutral-600 uppercase tracking-wide px-2 py-2 text-center border-r border-neutral-200 last:border-r-0 " +
              (i >= 5 ? "text-brand-red/70" : "")
            }
          >
            <span className="hidden sm:inline">{lbl}</span>
            <span className="sm:hidden">{GIORNI_IT_1[i]}</span>
          </div>
        ))}
      </div>

      {/* Griglia 6×7 */}
      <div className="grid grid-cols-7 grid-rows-6 border-l border-t border-neutral-200 flex-1">
        {grid.map((day, i) => {
          const isOther    = !sameMonth(day, focusMonthDate);
          const isToday    = sameDay(day, today);
          const isSelected = selectedDate ? sameDay(day, selectedDate) : false;
          const dayEvents  = eventsOnDay(events, day);

          return (
            <DayCell
              key={i}
              day={day}
              isOther={isOther}
              isToday={isToday}
              isSelected={isSelected}
              events={dayEvents}
              onSelectDate={onSelectDate}
              onSelectEvent={onSelectEvent}
              onDrillDown={onDrillDown}
              renderDayCell={renderDayCell}
              renderEvent={renderEvent}
            />
          );
        })}
      </div>
    </div>
  );
}

export default MonthView;
