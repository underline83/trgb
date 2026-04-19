// FILE: frontend/src/components/calendar/calendarUtils.js
// @version: v1.0 — Helper date M.E Calendar (zero dipendenze, Date nativo)
//
// Tutte le funzioni operano in TIMEZONE LOCALE.
// Convenzione: weekStartsOn=1 → lunedì primo (default IT). 0 → domenica.

import { MESI_IT, GIORNI_IT } from "./constants";

// ── Confronto / costruzione ─────────────────────────────────────────────

export const sameDay = (a, b) =>
  a && b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth()    === b.getMonth() &&
  a.getDate()     === b.getDate();

export const sameMonth = (a, b) =>
  a && b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth()    === b.getMonth();

export const startOfDay = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

export const endOfDay = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export const startOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth(), 1);

export const endOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0);

export const addDays = (d, n) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const addMonths = (d, n) =>
  new Date(d.getFullYear(), d.getMonth() + n, d.getDate());

// dow JS: 0=Dom..6=Sab. Mappa su offset "lunedì primo".
const dowMondayFirst = (d) => (d.getDay() + 6) % 7; // Lun=0..Dom=6

export const startOfWeek = (d, weekStartsOn = 1) => {
  const offset = weekStartsOn === 1 ? dowMondayFirst(d) : d.getDay();
  return addDays(startOfDay(d), -offset);
};

export const endOfWeek = (d, weekStartsOn = 1) =>
  addDays(startOfWeek(d, weekStartsOn), 6);

// ── Griglia mese (sempre 42 celle, 6 righe × 7 colonne) ─────────────────

export const monthGrid = (date, weekStartsOn = 1) => {
  const first = startOfMonth(date);
  const start = startOfWeek(first, weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};

export const weekDays = (date, weekStartsOn = 1) => {
  const start = startOfWeek(date, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

// ── Format italiani ─────────────────────────────────────────────────────

export const formatMonthYear = (date) =>
  `${MESI_IT[date.getMonth()]} ${date.getFullYear()}`;

export const formatDateLong = (date) => {
  const dow = (date.getDay() + 6) % 7; // Lun=0..Dom=6
  return `${GIORNI_IT[dow]} ${date.getDate()} ${MESI_IT[date.getMonth()]} ${date.getFullYear()}`;
};

export const formatDateShort = (date) =>
  `${date.getDate()} ${MESI_IT[date.getMonth()].slice(0, 3)}`;

export const formatTime = (date) => {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

export const formatWeekRange = (date, weekStartsOn = 1) => {
  const a = startOfWeek(date, weekStartsOn);
  const b = endOfWeek(date, weekStartsOn);
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} – ${b.getDate()} ${MESI_IT[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
  }
  return `${formatDateShort(a)} – ${formatDateShort(b)} ${b.getFullYear()}`;
};

// ── Filtri eventi ───────────────────────────────────────────────────────

// Eventi che insistono sul giorno `day` (start o range che lo contiene).
export const eventsOnDay = (events, day) => {
  const sd = startOfDay(day).getTime();
  const ed = endOfDay(day).getTime();
  return events.filter((ev) => {
    if (!ev || !ev.start) return false;
    const evStart = ev.start.getTime();
    const evEnd = (ev.end || ev.start).getTime();
    return evStart <= ed && evEnd >= sd;
  });
};

// Ordina per start ascendente, allDay prima.
export const sortEvents = (events) =>
  [...events].sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return a.start - b.start;
  });
