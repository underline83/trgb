# Interventi Cucina — post-MVP (sessione 44)

**Data:** 2026-04-17
**Contesto:** Il modulo Cucina MVP è in produzione (sessione 43). Il mockup di riferimento per il nuovo stile visivo è `docs/mockups/cucina_instance_mockup.html`. Questo documento elenca gli interventi in ordine di priorità da girare a Claude Code come prompt separati o in blocchi logici.

**Regole trasversali per Code**:
- NON fare `git commit` né `git push`. Lasciare i file modificati, suggerire testo commit a Marco.
- Trailing slash obbligatorio su endpoint root (FastAPI 307 → 401).
- Palette: solo brand-* (brand-red #E8402B, brand-cream #F4F1EC, brand-green #2EB872, brand-blue #2E7BE8, brand-ink #111).
- Tipografia: Playfair Display solo su titoli/nomi item/valori numerici; system font per meta e UI chrome.
- Touch target minimo 44pt, bottoni azione 48-56pt, numpad 60pt.
- Nessun `window.prompt()` / `window.confirm()` / `window.alert()`: modal in stile brand.

**⚠ Regola critica — doppio target device:**
- **iPad** (landscape 1024-1366px) = flusso checklist/istanza (apertura, chiusura, HACCP): si fa al banco, dispositivo fisso.
- **iPhone** (portrait 375-430px) = flusso task singoli + consultazione veloce agenda: i cuochi useranno l'iPhone in tasca, mentre cucinano. **Tutto ciò che riguarda i task DEVE essere mobile-first**, non solo "responsive che funziona".
- Breakpoint Tailwind: progettare mobile-first, aggiungere `sm:` (≥640) e `md:` (≥768) per iPad/desktop.
- Safe-area-inset-bottom obbligatoria su tutti i footer/fab fissi.
- Swipe gesture accettati su iPhone dove presenti su iOS nativo (es. swipe-to-complete task). Fallback: bottone esplicito.

---

## Priorità 1 — CucinaInstanceDetail.jsx: refactor UX tap-to-complete

**File:** `frontend/src/pages/cucina/CucinaInstanceDetail.jsx`
**Mockup riferimento:** `docs/mockups/cucina_instance_mockup.html`
**Motivo:** è la pagina su cui si gioca l'adozione reale da parte del personale (iPad in cucina con mani unte). Oggi usa `window.prompt` per testo/motivo salto e `window.confirm` per conferma mancanti: inaccettabile su iPad e fuori brand.

### Cosa fare

1. **Rimuovere tutti i `window.prompt` / `window.confirm`** sostituendoli con 4 modali brand-style (componenti locali al file, non serve libreria):
   - `<ModalTesto>` — per item TESTO, con `<textarea>` focus auto. Bottoni "Annulla" / "Salva". Se testo vuoto al salva → setta item come SKIPPED.
   - `<ModalSalta>` — per salto checklist (solo admin/chef), motivo obbligatorio in `<textarea>`. Bottone disabilitato finché motivo vuoto.
   - `<ModalMancanti>` — per conferma completamento con voci PENDING. Mostra lista puntata delle voci mancanti, segnala le obbligatorie in rosso. Bottoni "Torna alla lista" / "Completa comunque" (le PENDING diventano SKIPPED lato FE prima della chiamata `completa`).
   - `<ModalAssegna>` — al posto del `<AssegnaForm>` popover esistente: lista bottoni-persona con avatar iniziale colorato. Per MVP username libero ma precompilare lista con: operatori dipendenti attivi se `/dipendenti/` risponde, altrimenti fallback a 3 bottoni demo "Giulia (chef) / Marco (admin) / Ivan (sala)".

2. **Progress ring 84px** nell'header card (in alto a destra) che sostituisce la `progress bar` attuale piazzata sotto:
   - SVG inline, raggio 36, stroke-width 8.
   - Verde TRGB `#2EB872` al 100%.
   - Numero completati in Playfair 22 al centro (es. "3"), slash e totale in small (es. "/7").
   - `stroke-dashoffset` animato in transizione 350ms.
   - Sotto alla ring scritta "completati" in uppercase tracking-wide.

3. **Nuova state-bar segmentata** sotto l'header: barra orizzontale spessa 10px che mostra OK in verde + FAIL in rosso sovrapposto (non più "progresso totale"). A destra micro-testo `{ok} OK · {fail} FAIL · {pending} da fare`.

4. **Item cards ridisegnate** (fondamentale):
   - Bordo sinistro colorato 4px per stato (verde=OK, rosso=FAIL, grigio+line-through=SKIPPED, neutro=PENDING).
   - Background gradient sfumato solo a sinistra (es. `from-green-50/60 to-white`) — non full tinted.
   - Nome item in **Playfair Display 16-17px** (600/700), serif. È l'elemento che il cuoco legge di sfuggita.
   - Ordinale (`1.`, `2.`, ...) in Playfair muted a sinistra del nome.
   - Chip tipo (CHECKBOX / TEMPERATURA / NUMERICO / TESTO) con palette differenziata (vedi mockup).
   - Chip "obbligatoria" in red-50/red-ink al posto del testo "Obbligatorio" corrente.
   - Range atteso in `font-mono` dentro pill grigio, non più dentro il TipoBadge.
   - Valore compilato mostrato SOTTO in Playfair 22 bold, con unità in small muted (es. `2,4 °C`). Se FAIL → colore `brand-red`.
   - Riga "who/when" con avatar tondo iniziale colorata (rosso per chef/admin, blu per sala).
   - Nota in `<div class="it-note">` con bordo sinistro grigio + background cream-2, italic.

5. **Azioni per item** (a destra del main):
   - Per CHECKBOX: 3 bottoni grandi 56×56 tondeggianti (`rounded-2xl`): ✓ (verde se selezionato), ✗ (rosso se selezionato), N.A. (grigio).
   - Per TEMP/NUM: un bottone-pill 56pt a sfondo bianco e **bordo tratteggiato rosso** con icona 🔢 e valore corrente (o "Inserisci…"), più bottone N.A. 56×56 a fianco.
   - Per TESTO: bottone-pill "✎ Scrivi…" / "✎ Modifica" + bottone N.A.
   - Bottoni disabilitati (`disabled={!canTap}`) mantengono proporzioni, solo opacità 40%.

6. **Numpad modal aggiornato**:
   - Display in alto con valore in Playfair 36px bold, unità 16 muted, text-align right.
   - Box **"range atteso"** in amber-50 sopra il display.
   - Live warning "⚠ Fuori range — sarà registrato come FAIL con nota automatica" che appare in red-50 SOTTO il display quando il valore digitato esce dal range (prima ancora del submit).
   - Quando fuori range → display stesso colora in `brand-red` per feedback visivo immediato.
   - Griglia 3×5 tasti 60pt: `7 8 9 / 4 5 6 / 1 2 3 / ± 0 , / C ⌫ ✓`.
   - Tasto ✓ (submit) verde pieno.
   - Tasto `,` digita il punto decimale (in IT si scrive con virgola).
   - Tasti in Playfair 24px bold (tranne C in rosso sans, ⌫ sans).

7. **Footer azioni**:
   - Posizione: `fixed bottom-0 left-0 right-0`, background cream translucido + backdrop-filter, padding bottom con `env(safe-area-inset-bottom)` per iPad.
   - Struttura: `[👤 Assegna (ghost)] [Salta… (secondary, solo admin/chef)] [✓ Completa checklist (primary red pieno, flex-1)]`.
   - Se ci sono mancanti obbligatorie il testo del primary diventa `✓ Completa — {N} obbligatorie da confermare`.
   - Bottone primary con shadow `0 10px 22px rgba(232,64,43,.25)`, 56pt min-height.
   - Primo padding sotto al contenuto deve compensare la footbar (`pb-28` sul wrapper interno).

8. **Breadcrumb top**: Cucina › Agenda oggi › **{template_nome}** in riga separata sopra la head-card. Link indietro su "Agenda oggi".

9. **Gobbette decorative** nell'angolo alto-destra della head-card (inline SVG 180×46, opacità 0.9). Vedi il mockup per il path semplificato: `<path d="M 20 50 Q 37 18 55 42" stroke="#E8402B" />` × 3 stroke.

10. **Micro-toast brand** (utility): componente `<Toast>` con `context` o prop, shown top-center, ink bg, white text, rounded-xl, auto-hide 1800ms. Usare per:
    - ✓ Segnato OK / ✗ Segnato FAIL / N.A. registrato
    - ✓ Registrato (su numpad submit OK) / ⚠ FAIL — fuori range
    - ✓ Nota salvata
    - ✓ Checklist completata — score {N}%

### Criteri accettazione
- Su iPad (simulatore Chrome DevTools "iPad Pro 11" landscape) tutta la pagina è usabile senza pinch-zoom.
- Nessun `window.prompt`/`confirm`/`alert` in tutto il file.
- Completamento di una checklist con tutte OK mostra toast "score 100%".
- Completamento con 2 voci PENDING non obbligatorie apre modale mancanti, poi le segna SKIPPED e chiama `/completa`.
- Item TEMPERATURA con range 0-4°C e valore 5.1 genera FAIL automatico con nota "Fuori range (0..4 °C)" (già presente, da preservare).
- Viewer: tutti i bottoni azione sono disabilitati, nessuna modale apribile, tap silenzioso con toast "Sola lettura".

### Suggerimento commit
```
./push.sh "cucina: refactor InstanceDetail con modali brand, progress ring, item cards Playfair"
```

---

## Priorità 2 — CucinaHome.jsx: allineamento visivo + fix stato APERTA

**File:** `frontend/src/pages/cucina/CucinaHome.jsx`
**Motivo:** oggi APERTA usa `bg-brand-cream text-neutral-800` (uguale allo sfondo pagina) → un item urgente "sparisce" sulla Home; COMPLETATA invece è verde pieno. Gerarchia invertita: il grido deve stare sull'urgente, non sul fatto.

### Cosa fare

1. **StatoBadge rivisto** (sia qui che estratto in componente condiviso `components/cucina/StatoBadge.jsx` se comodo):
   - `APERTA` → `bg-amber-50 text-amber-800 border-amber-300` + pallino 🟡 animato pulse (attende azione).
   - `IN_CORSO` → `bg-blue-50 text-blue-700 border-blue-300`.
   - `COMPLETATA` → `bg-green-50 text-green-700 border-green-300` (stesso stile di oggi, solo più soft).
   - `SCADUTA` → `bg-red-100 text-red-800 border-red-400` (invariato).
   - `SALTATA` → `bg-neutral-100 text-neutral-500 border-neutral-300 line-through`.
   - Task: `APERTO`/`COMPLETATO`/`SCADUTO`/`ANNULLATO` → mapping equivalente.
   - Usare componente sia in `CucinaHome`, `CucinaAgendaGiornaliera`, `CucinaAgendaSettimana`, `CucinaTaskList`, `CucinaInstanceDetail`.

2. **KPI cards armonizzate**:
   - Mantenere il layout 4-col ma usare Playfair Display (700) per il numero grande (es. "3/7") — già è 3xl bold, passare a `font-playfair`.
   - Bordo `border-red-200` OK, ma aggiungere accento interno: sottile barra decorativa gobbette in alto (usare lo strip SVG `TRGB-gobbette-strip.svg` al 20% opacità come `background-image` nella card). Opzionale — se implementato rende la Home più "calda".
   - Card "Task operativi": se `scaduti > 0` cambia bordo in `border-red-400` e mostra badge "⚠ scaduti" in alto.

3. **Lista istanze oggi raggruppata per turno**:
   - Usare stesso item-card style leggero del InstanceDetail (bordo-left colorato, Playfair sul nome template).
   - Rimuovere il banale "→" a destra e sostituire con chip score (se completata) o chip scadenza (se aperta): `entro 10:30` in amber / `⏱ in ritardo` in red.

### Criteri accettazione
- Una istanza APERTA è visivamente più "calda" di una COMPLETATA.
- Tutti i badge stato del modulo usano lo stesso componente condiviso.

### Suggerimento commit
```
./push.sh "cucina: StatoBadge condiviso, fix gerarchia urgenza su Home"
```

---

## Priorità 2-BIS — TaskList + TaskNuovo: mobile-first iPhone (**flusso critico**)

**File:**
- `frontend/src/pages/cucina/CucinaTaskList.jsx`
- `frontend/src/pages/cucina/CucinaTaskNuovo.jsx`
- `frontend/src/pages/cucina/CucinaNav.jsx` (responsive)

**Mockup riferimento:** `docs/mockups/cucina_tasks_iphone_mockup.html`

**Motivo:** i cuochi useranno l'**iPhone** per i task. La vista desktop attuale non è usabile a 375px: nav laterale schiaccia il contenuto, bottoni troppo piccoli, modali non ottimizzate. Questo blocco è più importante di Priorità 3 "allineamento visivo": è un blocco **di esperienza**, non di stile.

### Cosa fare

1. **CucinaNav responsive**:
   - Su `< sm` (< 640px): nav a **bottom tab bar** iOS-style con 4 tab (🍳 Oggi, 📅 Settimana, ✅ Task, ⚙️ Menu). Bottom fissa, `safe-area-inset-bottom` rispettata. Label piccolo sotto l'icona.
   - Su `>= sm`: nav orizzontale top attuale.
   - Il tab "Menu" su mobile apre uno sheet con: Template (se admin/chef), Scheduler admin, torna Home generale.
   - Tab attivo in `brand-red`, inattivi in `neutral-500`.

2. **TaskList mobile-first**:
   - Header compatto: titolo "Task" in Playfair 24 + bottone "+" 48pt in alto a destra (rosso pieno, per creare task). Su mobile sostituisce il bottone "Nuovo task" sparso.
   - Filtri stato (APERTO / IN_CORSO / SCADUTO / COMPLETATO) come **pills scrollabili orizzontalmente** in riga fissa sotto l'header (overflow-x-auto, no wrap, touch scroll). Attiva ha `bg-brand-red text-white`.
   - Filtro "i miei" vs "tutti" come toggle compatto.
   - Lista task: ogni task è una **card full-width** con:
     - Bordo sinistro 4px colorato per priorità (ALTA=red, MEDIA=amber, BASSA=neutral).
     - Riga 1: titolo in Playfair 17 bold (`text-base font-playfair font-bold`).
     - Riga 2: chip stato + (se presente) data scadenza con icona ⏱ + (se presente) `@assegnato_user`.
     - Se note_completamento: riga 3 `truncate` 1 linea.
     - Min-height 72pt (pollice-friendly).
   - **Swipe gesture**: swipe-left su una card APERTO/IN_CORSO rivela bottone verde "✓ Completa" (56pt pieno). Usare libreria già presente se c'è `react-swipeable` (altrimenti implementazione minimale con `touchstart`/`touchmove`/`touchend`). Tap su card (no swipe) → apre dettaglio task in bottom-sheet.
   - Bottone primary "Completa" ALSO accessibile via tap su card che apre bottom-sheet con dettaglio + pulsanti grandi — non fidarsi dello swipe come unica via.
   - FAB "+" galleggiante in basso a destra su mobile (56pt tondo, rosso pieno, shadow), che apre `CucinaTaskNuovo` in full-screen modal (non popover). Su `sm+` torna al pulsante inline in header.

3. **CucinaTaskNuovo come full-screen modal mobile**:
   - Su `< sm`: `fixed inset-0 bg-brand-cream z-50` — occupa tutto lo schermo.
   - Header con freccia ← (chiude) e titolo "Nuovo task" in Playfair 20.
   - Campi:
     - Titolo (obbligatorio) — input grande, `text-lg`, 48pt min-height.
     - Priorità — 3 pill toccabili 48pt (ALTA/MEDIA/BASSA) con colori corrispondenti.
     - Scadenza — input `type="date"` (iOS nativo).
     - Assegnato a — bottone che apre lista dipendenti in bottom-sheet.
     - Note — textarea 3 righe.
   - Footer fisso in basso con bottone primary "Crea task" full-width 56pt + `safe-area-inset-bottom`.
   - Su `sm+`: modale centrata stile desktop (max-w-md).

4. **Dettaglio task bottom-sheet** (nuovo componente `<TaskSheet>`):
   - Animazione slide-up da bottom su tap su card.
   - Header con icona priorità + titolo Playfair + chip stato.
   - Corpo: metadata (scadenza, assegnato, origine, created_at).
   - Note / note_completamento visibili.
   - Azioni in footer (in base allo stato):
     - APERTO → "Inizia" (primary blu) + "Completa" (primary verde).
     - IN_CORSO → "Completa" (primary verde).
     - SCADUTO → "Completa in ritardo" + motivazione.
     - COMPLETATO/ANNULLATO → sola lettura + "Riapri" solo per admin/chef.
   - Drag handle in alto (la classica barretta grigia centrale 40×4 rounded).
   - Tap fuori o swipe-down → chiude.

5. **Completa task con note opzionali**:
   - Tap "Completa" → bottom-sheet rapido con textarea `note_completamento` + bottone primary "Conferma".
   - Se textarea vuota → comunque accettata (backend ammette vuoto). Non bloccare.
   - Skip textarea con bottone "Completa senza note" (secondary).
   - Su swipe-gesture da TaskList: salta la textarea e chiude direttamente (quick action).

6. **Empty state mobile**:
   - Se nessun task nel filtro attivo: illustrazione ASCII emoji 🧑‍🍳 + messaggio "Nessun task in questa categoria" + link "Crea il primo task" che apre il modal nuovo.

### Criteri accettazione
- Test Chrome DevTools "iPhone 14 Pro" portrait 393×852: tutto usabile senza zoom, FAB accessibile, bottom-tab visibile, swipe funzionante.
- Test iPad landscape: layout ritorna "desktop-like" con nav top, niente bottom-tab, niente FAB.
- Ogni touch target ≥ 44pt, quelli azione ≥ 48pt, FAB 56pt.
- `safe-area-inset-bottom` rispettata sia per bottom-tab sia per bottom-sheet sia per footer modali.
- Nessun orizzontal scroll sulla pagina principale a 375px.
- Swipe-to-complete va in fallback graceful: se fallisce lo swipe si apre il sheet normale.

### Suggerimento commit
```
./push.sh "cucina: TaskList mobile-first iPhone con bottom-tab e swipe-to-complete"
```

---

## Priorità 3 — CucinaAgendaSettimana: allineamento + vista mobile

**File:** `frontend/src/pages/cucina/CucinaAgendaSettimana.jsx`

### Cosa fare

1. **Pallini colorati per istanze**: usare stesso `STATO_INST_CLS` del InstanceDetail refactorato. Oggi evidenziato con bordo `brand-red` e sfondo `red-50/40`.
2. **Vista desktop/iPad**: griglia 7 giorni come oggi ma con gerarchia tipografica Playfair sui nomi giorno e numero data.
3. **Vista mobile (< sm)**: griglia 7-col non è utilizzabile. Trasformare in **lista verticale** dei prossimi 7 giorni, con ogni giorno come accordion-card che mostra il count per stato (es. "3/4 completate · 1 aperta") e si espande al tap per mostrare gli item.
4. Chiamare il componente `<SettimanaCompact>` per mobile e `<SettimanaGrid>` per desktop, switch con `md:hidden` / `hidden md:block`.

### Criteri accettazione
- A 375px la settimana si legge in modo confortevole, nessun overflow orizzontale.
- A 1024px+ la griglia 7×N è invariata nella struttura, solo con stili aggiornati.

### Suggerimento commit
```
./push.sh "cucina: AgendaSettimana responsive e allineamento visivo"
```

---

## Priorità 4 — Toast hook condiviso

**File nuovo:** `frontend/src/components/Toast.jsx` + hook `frontend/src/hooks/useToast.js`

### Cosa fare

- Provider `<ToastProvider>` in `App.jsx`.
- Hook `const { toast } = useToast()` con API: `toast(msg, { kind: 'info'|'success'|'error', duration: 1800 })`.
- Rendering: top-center, ink background, rounded-xl, shadow, transizione opacity+translateY.
- Coda di toast gestita FIFO max 3 visibili impilati.
- Sostituire nelle pagine Cucina tutti i `setError(...)` di natura transitoria (non bloccante) con `toast(..., { kind: 'error' })`. I veri errori bloccanti restano in banner inline.

### Criteri accettazione
- Toast funziona globalmente e non dipende da React Router.
- Nessun `alert()` residuo in `frontend/src/`.

### Suggerimento commit
```
./push.sh "ui: Toast hook globale e provider"
```

---

## Priorità 5 — Micro-celebration su score 100%

**File:** `frontend/src/pages/cucina/CucinaInstanceDetail.jsx`

### Cosa fare

Al return del POST `/cucina/instances/:id/completa`, se `score_compliance === 100`:
- Overlay temporaneo (1500ms) brand-cream semi-trasparente che mostra:
  - Gobbette animate (3 path SVG con `stroke-dasharray` + transizione che "disegna" le gobbette in 700ms).
  - Testo Playfair 32 "Ottimo lavoro" + subtitle "Checklist chiusa al 100%".
  - Auto-dismiss.
- Non confetti — coerente con il brand sobrio.

### Criteri accettazione
- Appare solo su score 100 esatto, non su 80 o 95.
- Chiude da sola senza interazione.

### Suggerimento commit
```
./push.sh "cucina: micro-celebration score 100 con gobbette animate"
```

---

## Priorità 6 — Backend: verifica fuso orario scadenza_at

**File:** `app/services/cucina_scheduler.py`
**Motivo:** lo scheduler calcola `scadenza_at` combinando data + `ora_scadenza_entro`. La regola "orari 00:00-03:59 → giorno dopo" è già implementata. Verificare che il timestamp salvato sia **locale Europe/Rome naive** (come il resto del gestionale: `datetime.now().isoformat(sep=' ')`), non UTC. Se già corretto → nessun intervento, solo test.

### Cosa fare

1. Aggiungere `app/tests/test_cucina_scheduler.py` con casi:
   - Template ora_scadenza 10:30, data 2026-04-17 → scadenza_at = `2026-04-17 10:30:00`.
   - Template ora_scadenza 00:30, data 2026-04-17 → scadenza_at = `2026-04-18 00:30:00`.
   - Template ora_scadenza 23:45, data 2026-04-17 → scadenza_at = `2026-04-17 23:45:00`.
   - Idempotenza `genera_istanze_per_data` su doppia invocazione.
   - `check_scadenze` marca SCADUTA solo istanze con scadenza_at < now e stato APERTA/IN_CORSO.
   - `calcola_score_compliance` con 3 OK, 1 FAIL, 1 SKIPPED su 5 → score 60.

### Criteri accettazione
- `pytest app/tests/test_cucina_scheduler.py -v` passa tutto.

### Suggerimento commit
```
./push.sh "cucina: test scheduler (fuso locale, idempotenza, score)"
```

---

## Priorità 7 — Aggiornare documentazione

**File:**
- `docs/modulo_cucina.md`: aggiungere sezione "Interventi post-MVP sessione 44" con elenco dei punti implementati.
- `docs/changelog.md`: entry data 2026-04-17 "Cucina — refactor UX + celebration + test scheduler".
- `docs/sessione.md`: chiusura sessione 44.
- `frontend/src/config/versions.jsx`: bump `cucina` a `v1.1 beta` (UX polish, non breaking).

### Suggerimento commit
```
./push.sh "docs: sessione 44 chiusa, cucina v1.1 beta"
```

---

## Fuori scope (rimandati a V1 dedicata)

Questi punti erano in roadmap V1 (vedi `docs/modulo_cucina.md` § Roadmap) e **NON vanno toccati** in questo giro:

- Foto + firma digitale su item FAIL.
- Integrazione M.F Alert Engine (checker `cucina_checklist_pending`).
- Frequenze settimanale/mensile.
- Corrective action automatica (FAIL temperatura → task singolo auto-generato).
- Dropdown `assegnato_user` da anagrafica dipendenti.
- Endpoint `GET /cucina/stats` per dashboard KPI storica.
- PDF export registro HACCP mensile.

Se durante un intervento emerge che uno di questi sblocca il lavoro, fermarsi e chiedere a Marco.

---

## Ordine suggerito di esecuzione

1. **P1** (InstanceDetail refactor iPad) — il grosso del valore per iPad, una sessione intera dedicata.
2. **P4** (Toast hook) — serve sia al P1 pulito sia al resto.
3. **P2-BIS** (TaskList mobile-first iPhone + bottom-tab) — **CRITICO** per adozione cuochi. Una sessione intera dedicata. Mockup di riferimento: `docs/mockups/cucina_tasks_iphone_mockup.html`.
4. **P2** (Home + StatoBadge condiviso) — una sessione media.
5. **P3** (AgendaSettimana responsive) — mezza sessione.
6. **P5** (celebration) — piccola, divertente, di chiusura.
7. **P6** (test scheduler) — indipendente, può stare in parallelo.
8. **P7** (docs) — chiusura sessione.

**Accoppiate minime**:
- Se Code ha budget per una sola sessione e Marco dà priorità all'iPad: **P1 + P4**.
- Se priorità all'iPhone dei cuochi: **P2-BIS + P4** (sposta subito l'adozione sul device principale degli operatori).
- Best compromise due sessioni: **P1** poi **P2-BIS**.
