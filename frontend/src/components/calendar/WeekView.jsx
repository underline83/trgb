// FILE: frontend/src/components/calendar/WeekView.jsx
// @version: v1.0 — Vista settimana: 7 colonne con lista eventi per giorno
//
// Interno al mattone M.E Calendar. Non importare direttamente: usa <CalendarView>.

import React from "react";
import {
  weekDays, sameDay, eventsOnDay, sortEvents, formatTime,
} from "./calendarUtils";
import { GIORNI_IT_3, COLORI_EVENTO, DEFAULT_COLOR } from "./constants";

function EventRow({ event, onClick }) {
  const palette = COLORI_EVENTO[event.color] || COLORI_EVENTO[DEFAULT_COLOR];
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick && onClick(event); }}
      className={
        "w-full text-left text-xs px-2 py-1 rounded border " + palette.soft +
        " hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      }
      aria-label={event.title + (event.subtitle ? ", " + event.subtitle : "")}
    >
      {!event.allDay && (
        <span className="font-semibold mr-1">{formatTime(event.start)}</span>
      )}
      {event.icon ? <span className="mr-0.5">{event.icon}</span> : null}
      <span className="truncate">{event.title}</span>
      {event.subtitle && (
        <div className="text-[10px] text-neutral-600 truncate">{event.subtitle}</div>
      )}
    </button>
  );
}

function DayColumn({
  day, isToday, isWeekend, events,
  onSelectDate, onSelectEvent, renderDayCell, renderEvent,
}) {
  if (renderDayCell) {
    return renderDayCell(day, events, { view: "settimana", isToday, isWeekend });
  }
  const sorted = sortEvents(events);
  return (
    <div
      className={
        "flex flex-col border-r border-neutral-200 last:border-r-0 min-h-full " +
        (isWeekend ? "bg-brand-cream/30" : "bg-white")
      }
      onClick={() => onSelectDate && onSelectDate(day)}
    >
      <div
        className={
          "flex flex-col items-center py-2 border-b border-neutral-200 sticky top-0 z-10 " +
          (isWeekend ? "bg-brand-cream/60" : "bg-neutral-50")
        }
      >
        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">
          {GIORNI_IT_3[(day.getDay() + 6) % 7]}
        </span>
        <span
          className={
            "mt-0.5 text-lg font-playfair " +
            (isToday
              ? "rounded-full bg-brand-blue text-white w-8 h-8 flex items-center justify-center"
              : "text-sky-900")
          }
        >
          {day.getDate()}
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-1 p-1.5 min-h-[11rem]">
        {sorted.length === 0 ? (
          <div className="text-[11px] text-neutral-300 text-center py-4">—</div>
        ) : (
          sorted.map((ev) =>
            renderEvent
              ? <React.Fragment key={ev.id}>{renderEvent(ev, { view: "settimana", compact: false })}</React.Fragment>
              : <EventRow key={ev.id} event={ev} onClick={onSelectEvent} />
          )
        )}
      </div>
    </div>
  );
}

function WeekView({
  currentDate, events, onSelectDate, onSelectEvent,
  renderEvent, renderDayCell, weekStartsOn,
}) {
  const days = weekDays(currentDate, weekStartsOn);
  const today = new Date();

  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-7 min-w-[40rem]">
        {days.map((day, i) => {
          const isToday = sameDay(day, today);
          const dow = (day.getDay() + 6) % 7;
          const isWeekend = dow >= 5;
          const dayEvents = eventsOnDay(events, day);
          return (
            <DayColumn
              key={i}
              day={day}
              isToday={isToday}
              isWeekend={isWeekend}
              events={dayEvents}
              onSelectDate={onSelectDate}
              onSelectEvent={onSelectEvent}
              renderDayCell={renderDayCell}
              renderEvent={renderEvent}
            />
          );
        })}
      </div>
    </div>
  );
}

export default WeekView;
