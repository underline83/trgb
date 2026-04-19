// FILE: frontend/src/components/calendar/DayView.jsx
// @version: v1.0 — Vista giorno: lista verticale eventi ordinati
//
// Interno al mattone M.E Calendar. Non importare direttamente: usa <CalendarView>.

import React from "react";
import { EmptyState } from "../ui";
import { eventsOnDay, sortEvents, formatTime } from "./calendarUtils";
import { COLORI_EVENTO, DEFAULT_COLOR } from "./constants";

function EventCard({ event, onClick }) {
  const palette = COLORI_EVENTO[event.color] || COLORI_EVENTO[DEFAULT_COLOR];
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick && onClick(event); }}
      className={
        "w-full flex items-start gap-3 text-left px-3 py-2.5 rounded-lg border " +
        palette.soft +
        " hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue min-h-[48px]"
      }
      aria-label={event.title + (event.subtitle ? ", " + event.subtitle : "")}
    >
      {/* Colonna orario */}
      <div className="flex-shrink-0 w-16 text-right">
        {event.allDay ? (
          <span className="text-[10px] uppercase tracking-wide font-semibold text-neutral-500">
            Tutto il giorno
          </span>
        ) : (
          <span className="text-sm font-semibold">{formatTime(event.start)}</span>
        )}
      </div>

      {/* Colonna contenuto */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {event.icon ? <span>{event.icon}</span> : null}
          <span className="font-medium truncate">{event.title}</span>
        </div>
        {event.subtitle && (
          <div className="text-xs text-neutral-600 mt-0.5">{event.subtitle}</div>
        )}
        {!event.allDay && event.end && event.end > event.start && (
          <div className="text-[11px] text-neutral-500 mt-0.5">
            → {formatTime(event.end)}
          </div>
        )}
      </div>
    </button>
  );
}

function DayView({
  currentDate, events, onSelectEvent, renderEvent, emptyLabel,
}) {
  const dayEvents = sortEvents(eventsOnDay(events, currentDate));
  const allDay = dayEvents.filter((e) => e.allDay);
  const timed  = dayEvents.filter((e) => !e.allDay);

  if (dayEvents.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon="📅"
          title={emptyLabel || "Nessun evento"}
          description="Nessun evento per questa data."
          compact
        />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-4 flex flex-col gap-2 max-w-3xl mx-auto">
      {allDay.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] uppercase font-semibold tracking-wide text-neutral-500 px-1">
            Tutto il giorno
          </div>
          {allDay.map((ev) =>
            renderEvent
              ? <React.Fragment key={ev.id}>{renderEvent(ev, { view: "giorno", compact: false })}</React.Fragment>
              : <EventCard key={ev.id} event={ev} onClick={onSelectEvent} />
          )}
        </div>
      )}

      {timed.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          {allDay.length > 0 && (
            <div className="text-[10px] uppercase font-semibold tracking-wide text-neutral-500 px-1">
              Orari
            </div>
          )}
          {timed.map((ev) =>
            renderEvent
              ? <React.Fragment key={ev.id}>{renderEvent(ev, { view: "giorno", compact: false })}</React.Fragment>
              : <EventCard key={ev.id} event={ev} onClick={onSelectEvent} />
          )}
        </div>
      )}
    </div>
  );
}

export default DayView;
