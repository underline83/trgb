# M.E — Calendar component (frontend)

**Stato:** spec v1 (in review con Marco) · **Autore:** Claude · **Data:** 2026-04-19

Mattone riusabile per rendering calendario. Scopo: evitare di reinventare griglia mese / timeline settimana / lista giorno in 3+ moduli diversi (Prenotazioni 2.1, Scadenziario Flussi 3.7, Turni Dipendenti 6.4, Scadenze documenti 6.5).

---

## Decisioni di design (filo rosso)

1. **Pure-FE, stateless, controllato.** Nessuna chiamata API dentro il componente. Il chiamante passa `events[]` già caricati e reagisce a eventi emessi (click giorno, click evento, cambio mese).
2. **Zero dipendenze esterne.** Nessuna lib (no `date-fns`, no `react-big-calendar`). Solo `Date` nativo + helper inline. Mantiene il bundle leggero e coerente col resto.
3. **Tailwind + palette TRGB-02.** Niente CSS files separati. Touch target 44pt su iPad (celle giorno min h-16 vista mese, righe settimana h-11).
4. **Localizzazione IT hardcoded** (mesi, giorni, lunedì primo). Non serve i18n full.
5. **Opt-in su M.I primitives** per bottoni nav (◀ ▶ oggi).
6. **Rendering eventi minimalista** di default, ma con override via `renderEvent` prop per casi custom (es. una prenotazione che mostra numero coperti).

---

## Consumer previsti

| ID roadmap | Modulo | Vista primaria | Note uso |
|------------|--------|----------------|----------|
| 2.1 | Prenotazioni — Agenda | `mese` + `giorno` | Pallini colorati per fascia oraria, drill-down su giorno |
| 3.7 | Flussi — Scadenziario | `mese` | Scadenze fatture/rate/F24/stipendi come eventi allDay, colore per tipo |
| 6.4 | Dipendenti — Turni | `settimana` | 7 colonne × dipendente in riga (layout custom via `renderEvent`) |
| 6.5 | Dipendenti — Scadenze docs | `mese` | HACCP/contratti/visite, colore per gravità (30/15/7gg) |

---

## Struttura file

```
frontend/src/components/calendar/
├── CalendarView.jsx      # componente pubblico (dispatcher view)
├── MonthView.jsx         # griglia 6×7
├── WeekView.jsx          # 7 colonne + lista eventi giornaliera
├── DayView.jsx           # lista eventi di un giorno
├── calendarUtils.js      # helpers date (startOfMonth, addDays, sameDay, ...)
├── constants.js          # MESI_IT, GIORNI_IT, colori preset
└── index.js              # barrel: export { CalendarView }
```

Import d'uso:
```jsx
import { CalendarView } from "../../components/calendar";
```

---

## API pubblica — `<CalendarView>`

### Props

| Prop | Tipo | Default | Descrizione |
|------|------|---------|-------------|
| `view` | `"mese" \| "settimana" \| "giorno"` | `"mese"` | Vista corrente (controllata). |
| `onViewChange` | `(view) => void` | — | Chiamato quando l'utente tocca il selettore vista. Se omesso, il selettore vista non viene renderizzato (componente "view-locked"). |
| `currentDate` | `Date` | oggi | Data di riferimento (il mese/settimana/giorno mostrato). Controllata. |
| `onDateChange` | `(date) => void` | — | Chiamato dai bottoni ◀ ▶ oggi. Obbligatorio se il componente naviga. Se omesso, nav nascosta. |
| `events` | `Event[]` | `[]` | Eventi da renderizzare (shape sotto). |
| `onSelectDate` | `(date) => void` | — | Click su una cella giorno (anche vuota). |
| `onSelectEvent` | `(event) => void` | — | Click su un evento renderizzato. |
| `selectedDate` | `Date \| null` | `null` | Giorno evidenziato (ring brand-blue). |
| `renderEvent` | `(event, ctx) => ReactNode` | default | Override rendering singolo evento. `ctx = { view, compact }`. |
| `renderDayCell` | `(date, events, ctx) => ReactNode` | default | Override cella giorno (vista mese). Usato raramente, per casi tipo turni. |
| `weekStartsOn` | `1 \| 0` | `1` | Lun (ISO) o dom. Default italiano lunedì. |
| `minHeight` | `string` | `"28rem"` | Altezza minima container, utile per layout sticky. |
| `loading` | `boolean` | `false` | Mostra skeleton/loader sovrapposto. |
| `emptyLabel` | `string` | `"Nessun evento"` | Label empty in DayView. |
| `showToolbar` | `boolean` | `true` | Se `false`, niente header con titolo mese + nav. Il chiamante rende la propria toolbar. |
| `className` | `string` | — | Classi extra sul root. |

### Shape evento

```ts
{
  id: string | number,        // obbligatorio (key React)
  start: Date,                // obbligatorio
  end?: Date,                 // default: start (evento "puntuale")
  allDay?: boolean,           // default: false. Se true, end viene ignorato per posizionamento
  title: string,              // testo principale
  subtitle?: string,          // riga secondaria (es. "20:00 · 6 coperti")
  color?: string,             // preset: "blue" | "red" | "green" | "amber" | "violet" | "slate". Default "blue"
  tone?: "solid" | "soft",    // default "soft" (bg tinted + border)
  icon?: string,              // emoji opzionale (es. "🍽️")
  meta?: any,                 // dati liberi, non usati dal componente, passati a onSelectEvent
}
```

Preset colori mappano su palette brand:
- `blue` → `bg-brand-blue/10 border-brand-blue/30 text-brand-blue` (solid: `bg-brand-blue text-white`)
- `red` → brand-red
- `green` → brand-green
- `amber` → amber-500 (warning)
- `violet` → violet-500 (sommelier/cucina)
- `slate` → neutrale

---

## Comportamenti

### Vista mese
- Griglia 7 colonne × 6 righe (sempre 42 celle per layout stabile anche su mesi corti).
- Header con nomi giorni abbreviati (Lun/Mar/... su desktop, L/M/... su mobile).
- Celle fuori mese: grigio tenue, cliccabili (`onSelectDate` le propaga).
- Oggi: ring `brand-blue` + pallino a destra del numero.
- Eventi: max **3** pallini/chip; se di più → pill `+N altri` che su click apre drill-down giorno (se `onViewChange` fornito → switch a "giorno" con `currentDate = giorno cliccato`; altrimenti emette `onSelectDate`).
- Vista `allDay` vs temporizzata: indistinguibile in vista mese (entrambi puntini).

### Vista settimana
- 7 colonne, altezza cella fissa (touch-friendly: `h-11` per riga evento).
- Se `renderEvent` è default → lista impilata per giorno.
- Se chiamante vuole timeline/schedule → fornisce `renderDayCell` custom (use case turni dipendenti).
- Header con data compatta: "Lun 14", "Mar 15", ...

### Vista giorno
- Lista verticale eventi ordinati per `start`.
- AllDay in cima con pill, poi eventi temporizzati con orario.
- Empty → `<EmptyState>` con `emptyLabel`.

### Navigazione
- Toolbar default:
  - A sinistra: `◀` / `Oggi` / `▶` (tasti M.I `<Btn size="sm" variant="secondary">`).
  - Centro: titolo (es. "Aprile 2026", "14 – 20 Apr 2026", "Lun 14 Apr 2026").
  - A destra (se `onViewChange`): segmented `Mese | Settimana | Giorno`.
- Tastiera (quando componente ha focus): `←` prev, `→` next, `T` oggi, `M/S/G` cambio vista.

### Responsive iPad
- Portrait 768–1024: mese con celle 56×56, label giorni singola lettera.
- Landscape ≥1024: celle 80×80, label giorni estesa.
- Mobile <640 (fallback): vista mese compatta, titolo evento troncato.

---

## Accessibilità

- Ogni cella giorno è un `<button>` con `aria-label="Venerdì 17 aprile, 3 eventi"`.
- Navigazione tastiera nel mese: frecce spostano focus cella per cella (Google Calendar-style), `Enter` = `onSelectDate`.
- Eventi: `role="button"` + `aria-label="Prenotazione Carminati 20:00, 6 coperti"`.
- Focus ring coerente con M.I (`focus-visible:ring-2 focus-visible:ring-brand-blue`).

---

## Non-goals (esplicitamente FUORI v1)

- ❌ **Drag & drop** per spostare eventi (rimandato a v1.1 quando serve al calendario turni).
- ❌ **Timeline orario** con slot 30min/1h (rimandato: per ora una lista ordinata basta).
- ❌ **Ricorrenze** (RRULE). Il chiamante deve pre-espandere gli eventi.
- ❌ **Multi-day event a barra** (barra che copre più giorni in vista mese). V1 mostra solo sul giorno di start.
- ❌ **Localizzazione multipla** (solo IT, lunedì primo).
- ❌ **API interna state** — tutto controllato.

Queste limitazioni sono compatibili con i 4 consumer previsti. Se Prenotazioni richiederà il D&D, estendiamo M.E in un secondo round.

---

## Demo page

Rotta `/calendario-demo` (visibile solo `admin/superadmin`, non linkata da menu) con:
- 3 eventi tipo prenotazione blu (oggi, domani, +3gg)
- 2 scadenze rosse (allDay, +1gg, +5gg)
- 1 evento verde turno (settimana prossima)
- 1 evento viola checklist cucina (oggi 08:00)
- Toolbar completa, switch vista live

Serve a Marco per validare il look prima di integrare nei moduli reali.

---

## Non tocca

- ❌ Backend (zero endpoint nuovi)
- ❌ DB
- ❌ `modules.json` (il componente non è un modulo, è infrastruttura FE)
- ❌ Nav esistenti

---

## Version bump previsto

Nessun bump modulo: il componente è infrastruttura condivisa. Sarà visibile via `package.json` frontend o entry dedicata in `versions.jsx` sezione "mattoni" se Marco lo vuole tracciato lì.

---

## Plan implementativo (ordine commit)

| # | Cosa | Commit message |
|---|------|----------------|
| 1 | Spec + scaffold file vuoti + utils date | `M.E Calendar — spec + scaffold componente condiviso` |
| 2 | MonthView funzionante + toolbar + nav | `M.E Calendar — vista mese + navigazione` |
| 3 | WeekView + DayView + switch | `M.E Calendar — viste settimana e giorno` |
| 4 | Pagina demo `/calendario-demo` + route admin-only | `M.E Calendar — pagina demo eventi finti` |
| 5 | Aggiornamento docs (roadmap + architettura + changelog) | `M.E Calendar — docs: mattone passa a IMPLEMENTATO` |

Ogni step: `./push.sh "messaggio"` separato. No blocchi accoppiati (feedback memoria).

---

## Domande aperte per Marco

1. **Layout turni dipendenti** — nella tua testa il calendario turni è "7 colonne × dipendenti in riga" (foglio settimana attuale) o "calendario classico con un evento per turno"? Se è il primo, consider che M.E non copre 1:1 quel layout — meglio tenere `FoglioSettimana` com'è e usare M.E solo per la vista mensile riepilogativa. *Risposta proposta:* M.E SOLO per vista mensile, FoglioSettimana resta il workhorse settimanale.
2. **Orari di apertura** — in vista giorno delle Prenotazioni devo evidenziare la fascia 19:00–23:00 (cena) come "slot attivi"? *Risposta proposta:* NO in v1, rimandato al modulo Prenotazioni quando decidiamo layout definitivo.
3. **Tracking versione** — nuova entry in `versions.jsx` sotto una sezione "mattoni"? Oppure lasciamo implicito? *Risposta proposta:* implicito per ora, mattoni tracciati solo in `architettura_mattoni.md`.
