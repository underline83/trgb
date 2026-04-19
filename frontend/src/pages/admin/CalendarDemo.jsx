// FILE: frontend/src/pages/admin/CalendarDemo.jsx
// @version: v1.0 — Pagina demo M.E Calendar (admin only)
//
// Vetrina del mattone <CalendarView> con eventi finti che coprono
// i 4 casi d'uso roadmap: Prenotazioni, Scadenze fatture, Turni
// dipendenti, Checklist cucina. Non linkata da menu — accessibile
// solo via URL diretto /calendario-demo.
//
// Scopo: validare look&feel + comportamento switch vista, prima
// dell'integrazione nei moduli reali.

import React, { useMemo, useState } from "react";
import { CalendarView } from "../../components/calendar";
import { PageLayout, Btn, StatusBadge } from "../../components/ui";

// Helper inline per costruire date relative a oggi senza dover
// caricare libs. Restituisce Date locali pulite a HH:MM specificati.
function dt(daysFromToday, hh = 0, mm = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hh, mm, 0, 0);
  return d;
}

function buildDemoEvents() {
  return [
    // ── Prenotazioni (blu) ────────────────────────────────────────────
    { id: "p1", start: dt(0, 13, 0),  end: dt(0, 14, 30), title: "Carminati",   subtitle: "4 cop · sala", color: "blue", icon: "🍽️", meta: { tipo: "prenotazione" } },
    { id: "p2", start: dt(0, 20, 0),  end: dt(0, 22, 0),  title: "Verdi",       subtitle: "6 cop · cena", color: "blue", icon: "🍽️" },
    { id: "p3", start: dt(0, 20, 30), end: dt(0, 22, 30), title: "Bianchi",     subtitle: "2 cop · cena", color: "blue", icon: "🍽️" },
    { id: "p4", start: dt(0, 21, 0),  end: dt(0, 23, 0),  title: "Rossi",       subtitle: "8 cop · cena", color: "blue", icon: "🍽️" },
    { id: "p5", start: dt(1, 19, 30), end: dt(1, 22, 0),  title: "Famiglia Galli", subtitle: "5 cop · cena", color: "blue", icon: "🍽️" },
    { id: "p6", start: dt(3, 13, 0),  end: dt(3, 15, 0),  title: "Gruppo aziendale", subtitle: "12 cop · pranzo", color: "blue", icon: "🍽️" },
    { id: "p7", start: dt(7, 20, 0),  end: dt(7, 22, 30), title: "Compleanno Bianchi", subtitle: "10 cop · cena", color: "blue", icon: "🎂" },

    // ── Scadenze fatture / F24 / rate (rosso, allDay) ─────────────────
    { id: "s1", start: dt(1),  allDay: true, title: "Fattura OROBICA", subtitle: "€ 7.425,24", color: "red",   icon: "💸" },
    { id: "s2", start: dt(5),  allDay: true, title: "F24 marzo",       subtitle: "€ 3.120,00", color: "red",   icon: "📑" },
    { id: "s3", start: dt(12), allDay: true, title: "Rata mutuo",      subtitle: "€ 1.850,00", color: "red",   icon: "🏦" },
    { id: "s4", start: dt(15), allDay: true, title: "Stipendio Mario", subtitle: "€ 1.420,00", color: "amber", icon: "👤" },
    { id: "s5", start: dt(20), allDay: true, title: "Affitto locale",  subtitle: "€ 2.400,00", color: "red",   icon: "🏢" },

    // ── Turni dipendenti (verde) ──────────────────────────────────────
    { id: "t1", start: dt(2, 16, 0),  end: dt(2, 23, 0),  title: "Chef — Marco",   subtitle: "Cena", color: "green", icon: "👨‍🍳" },
    { id: "t2", start: dt(2, 18, 0),  end: dt(2, 23, 30), title: "Sala — Luca",    subtitle: "Cena", color: "green", icon: "🧍" },
    { id: "t3", start: dt(4, 11, 30), end: dt(4, 15, 0),  title: "Cucina — Anna",  subtitle: "Pranzo", color: "green", icon: "👩‍🍳" },

    // ── Checklist cucina (viola) ──────────────────────────────────────
    { id: "c1", start: dt(0, 8, 0),  end: dt(0, 8, 30), title: "Apertura", subtitle: "Temperature frigo + check HACCP", color: "violet", icon: "✅" },
    { id: "c2", start: dt(0, 23, 0), end: dt(0, 23, 30), title: "Chiusura", subtitle: "Pulizie + spegnimento", color: "violet", icon: "🌙" },
    { id: "c3", start: dt(2, 8, 0),  end: dt(2, 8, 30), title: "Apertura", color: "violet", icon: "✅" },

    // ── Scadenze documenti dipendenti (slate) ─────────────────────────
    { id: "d1", start: dt(10), allDay: true, title: "HACCP scade — Luca", color: "slate", icon: "📄" },
    { id: "d2", start: dt(25), allDay: true, title: "Visita medica — Anna", color: "slate", icon: "🩺" },
  ];
}

export default function CalendarDemo() {
  const [view, setView] = useState("mese");
  const [date, setDate] = useState(new Date());
  const [selected, setSelected] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);

  const events = useMemo(() => buildDemoEvents(), []);

  const eventCount = events.length;
  const allDayCount = events.filter((e) => e.allDay).length;

  return (
    <PageLayout
      title="Calendario — Demo M.E"
      subtitle="Vetrina del mattone condiviso prima dell'integrazione nei moduli reali. Eventi finti."
    >
      {/* Riga info / azioni */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <StatusBadge tone="info">v1.0 mattone</StatusBadge>
        <span className="text-neutral-600">{eventCount} eventi finti ({allDayCount} allDay)</span>
        <span className="flex-1" />
        <Btn variant="ghost" size="sm" onClick={() => setSelected(null)}>Reset selezione</Btn>
      </div>

      {/* Componente */}
      <CalendarView
        view={view}
        onViewChange={setView}
        currentDate={date}
        onDateChange={setDate}
        events={events}
        selectedDate={selected}
        onSelectDate={(d) => { setSelected(d); }}
        onSelectEvent={(ev) => { setLastEvent(ev); }}
      />

      {/* Pannello debug — utile per sviluppo */}
      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-3 text-sm">
          <div className="font-semibold mb-1 text-sky-900">Stato corrente</div>
          <ul className="space-y-0.5 text-neutral-700">
            <li><b>Vista:</b> {view}</li>
            <li><b>Data centro:</b> {date.toLocaleDateString("it-IT")}</li>
            <li><b>Giorno selezionato:</b> {selected ? selected.toLocaleDateString("it-IT") : "—"}</li>
          </ul>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-3 text-sm">
          <div className="font-semibold mb-1 text-sky-900">Ultimo evento cliccato</div>
          {lastEvent ? (
            <pre className="text-xs bg-neutral-50 rounded p-2 overflow-auto">
{JSON.stringify({
  id: lastEvent.id,
  title: lastEvent.title,
  start: lastEvent.start.toLocaleString("it-IT"),
  end: lastEvent.end?.toLocaleString("it-IT"),
  allDay: !!lastEvent.allDay,
  color: lastEvent.color,
  meta: lastEvent.meta,
}, null, 2)}
            </pre>
          ) : (
            <span className="text-neutral-500">— nessun evento cliccato —</span>
          )}
        </div>
      </div>

      {/* Cheat tastiera */}
      <div className="mt-4 text-xs text-neutral-500">
        <b>Tastiera</b> (focus sul calendario): <kbd>←</kbd> / <kbd>→</kbd> nav · <kbd>T</kbd> oggi · <kbd>M</kbd>/<kbd>S</kbd>/<kbd>G</kbd> cambia vista
      </div>
    </PageLayout>
  );
}
