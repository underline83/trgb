# TRGB — Architettura a Mattoni Condivisi
**Creato:** 2026-04-13 (sessione 31)
**Ultimo aggiornamento:** 2026-04-16 (sessione 40 — M.F Alert engine implementato)
**Scopo:** Mappa delle dipendenze tra moduli e servizi condivisi. Guida l'ordine di sviluppo.

**Stato mattoni:**
- ✅ M.A Notifiche (sessione 31)
- ✅ M.C WA composer (sessione 31)
- ✅ **M.B PDF brand** (sessione 34) — `app/services/pdf_brand.py`, template in `app/templates/pdf/`. Sblocca 10.3 ✅, 4.2 ✅, inventario ✅. Da sblocco: 4.5 P&L, 3.8 cash flow, 6.2 cedolini, 7.3 carta vini NO (motore separato)
- ✅ **M.F Alert engine** (sessione 40) — `app/services/alert_engine.py` + `app/routers/alerts_router.py`. 3 checker: fatture scadenza, dipendenti documenti, vini sottoscorta. Trigger automatico da dashboard, anti-duplicato 12-24h. Genera notifiche via M.A.
- ⏳ M.D Email service, M.E Calendar, M.G Permessi, M.H Import engine — DA FARE

**Regola critica:** il PDF della Carta Vini (`carta_vini_service.py` + endpoints `/vini/carta/pdf*`) ha un motore dedicato e NON deve essere sostituito con M.B. Ha requisiti specifici (TOC, layout calici) che giustificano il motore separato.

---

## Mattoni identificati

Servizi/componenti riutilizzabili che piu' moduli richiedono. Costruirli PRIMA evita rework.

### M.A — Notifiche (backend + frontend)

**Cosa:** sistema centralizzato di notifiche in-app.
**Backend:** `app/services/notifiche.py` → `crea_notifica(destinatari, tipo, titolo, testo, link, urgenza)`
**DB:** tabella `notifiche` (id, destinatario_id, destinatario_ruolo, tipo, titolo, testo, link, urgenza, letta, created_at)
**Frontend:** hook `useNotifiche()` + `<NotificaBadge>` in Header + `<NotifichePanel>` dropdown
**Effort:** M (1 sessione)
**Roadmap:** 9.1

**Chi lo usa:**
| ID | Modulo | Come |
|----|--------|------|
| 9.2 | Bacheca staff | Comunicazioni fissate = notifiche speciali con flag `broadcast` |
| 9.3 | Preventivi | Stato cambiato → notifica staff |
| 9.4 | Prenotazioni | Nuova prenotazione, no-show, cancellazione |
| 9.5 | Dipendenti | Scadenza documento imminente |
| 9.6 | Cantina | Vino sotto scorta |
| 4.6 | FoodCost | Ricetta supera soglia % |
| 3.7 | Flussi | Scadenza fattura/F24/rata |
| 2.7 | Prenotazioni | Lista d'attesa — posto liberato |
| Home | Widget Attenzione | Aggrega notifiche non lette per tipo |

---

### M.B — PDF brand service (backend)

**Cosa:** generatore PDF con branding TRGB (header logo, footer, stili uniformi).
**Backend:** `app/services/pdf_brand.py` → `genera_pdf(tipo, dati, titolo)` che restituisce bytes o file path
**Template:** header con logo gobbette + dati osteria, corpo parametrico, footer con numero documento + data
**Libreria:** reportlab (gia' nel progetto) o weasyprint
**Effort:** M (1 sessione per il servizio base + 1 template dimostrativo)
**Roadmap:** 8.5

**Chi lo usa:**
| ID | Modulo | Documento |
|----|--------|-----------|
| 10.3 | Preventivi | PDF preventivo con righe, totale, condizioni |
| 7.3 | Cantina | Carta vini con TOC cliccabile |
| 4.2 | FoodCost | Scheda ricetta con costi ingredienti |
| 4.5 | CG | P&L mensile esportabile |
| 6.2 | Dipendenti | Busta paga/cedolino allegato |
| 3.8 | Flussi | Report cash flow previsionale |

---

### M.C — WA composer (frontend)

**Cosa:** utility centralizzata per comporre e aprire messaggi WhatsApp.
**Frontend:** `utils/whatsapp.js` → `openWhatsApp(telefono, testo)` + `composeFromTemplate(template, variabili)`
**Config:** template WA editabili in Impostazioni per modulo (gia' parziale in Dipendenti cedolini)
**Effort:** S (mezza sessione — la logica esiste sparsa, va consolidata)
**Roadmap:** nuovo, trasversale

**Chi lo usa:**
| ID | Modulo | Messaggio |
|----|--------|-----------|
| 5.2 | CRM | Link rapido da scheda cliente |
| 5.3 | CRM | Auguri compleanno |
| 6.1 | Dipendenti | Invio cedolino (gia' fatto, da migrare al composer) |
| 2.4 | Prenotazioni | Conferma prenotazione |
| 2.7 | Prenotazioni | Notifica posto libero (lista attesa) |
| 10.3 | Preventivi | Invio preventivo PDF |

---

### M.D — Email service brand (backend)

**Cosa:** servizio invio email con template HTML brandizzato.
**Backend:** `app/services/email.py` → `invia_email(destinatario, oggetto, template, dati)`
**Config:** SMTP settings in .env, template base HTML con header/footer TRGB
**Effort:** M (1 sessione — SMTP + template engine + template base)
**Roadmap:** 8.6 (parziale)

**Chi lo usa:**
| ID | Modulo | Email |
|----|--------|-------|
| 2.4 | Prenotazioni | Conferma/reminder prenotazione |
| 10.3 | Preventivi | Invio preventivo |
| 5.3 | CRM | Auguri compleanno |
| 5.1 | CRM | (Mailchimp gestisce il bulk, ma single email servono) |

---

### M.E — Calendar component (frontend)

**Cosa:** componente React calendario riutilizzabile (giorno/settimana/mese) con eventi colorati.
**Frontend:** `components/shared/CalendarView.jsx` — riceve `events[]` con data, label, colore, onClick
**Effort:** M (1 sessione — componente ricco con 3 viste)
**Roadmap:** nuovo, trasversale

**Chi lo usa:**
| ID | Modulo | Vista |
|----|--------|-------|
| 3.7 | Flussi | Scadenziario: fatture, rate, stipendi, F24 |
| 6.4 | Dipendenti | Calendario turni settimanale/mensile |
| 6.5 | Dipendenti | Scadenze documenti |
| 2.1 | Prenotazioni | Mini-calendario nell'agenda (gia' previsto) |

---

### M.F — Alert engine (backend) ✅

**Stato:** IMPLEMENTATO sessione 40 (2026-04-16)
**Cosa:** motore che controlla soglie/scadenze e genera notifiche automatiche via M.A.
**Backend:** `app/services/alert_engine.py` → `run_all_checks()` / `run_check(name)`
**Router:** `app/routers/alerts_router.py` → `GET /alerts/check/` (dry-run), `POST /alerts/run/` (con notifiche)
**Logica:** registry di checker con decoratore `@register_checker(name)`. Anti-duplicato integrato (max 1 notifica ogni 12-24h per tipo).
**Trigger:** automatico da `GET /dashboard/home` (ogni apertura Home). Anche manuale da endpoint.
**Dipende da:** M.A (notifiche)
**Effort:** S (mezza sessione)
**Roadmap:** nuovo, trasversale

**Checker implementati:**
| Checker | Modulo | Cosa controlla | Anti-duplicato |
|---------|--------|----------------|----------------|
| `fatture_scadenza` | Acquisti | Fatture non pagate scadute o in scadenza 7gg | 12h |
| `dipendenti_scadenze` | Dipendenti | Documenti in scadenza entro alert_giorni (default 30) | 24h |
| `vini_sottoscorta` | Vini | Vini con qta < scorta_minima (resiliente se colonna manca) | 24h |

**Checker futuri (da aggiungere):**
| ID | Modulo | Check |
|----|--------|-------|
| 4.6 | FoodCost | Ricette sopra soglia % |
| 3.7 | Flussi | Rate in scadenza |

---

### M.G — Sistema permessi (backend + frontend)

**Cosa:** matrice centralizzata ruolo × azione, sostituisce i check hardcoded per componente.
**Backend:** middleware `check_permission(azione)` + tabella/config matrice permessi
**Frontend:** hook `usePermissions()` + componente `<CanDo action="modulo.azione">` wrapper
**Effort:** M (1 sessione)
**Roadmap:** 8.7

**Chi lo usa:** TUTTI i moduli. Oggi ogni componente ha il suo `if (ruolo === 'admin')`. Con M.G si centralizza e diventa configurabile senza toccare il codice.

---

### M.H — Import/diff engine (backend)

**Cosa:** pattern riutilizzabile per import dati esterni con coda di revisione differenze.
**Backend:** gia' implementato in `clienti_router.py` per TheFork. Da estrarre in servizio generico.
**Pattern:** upload file → parser → match con dati esistenti → coda diff → risolvi accept/reject
**Effort:** S (estrazione da codice esistente)
**Roadmap:** nuovo, trasversale

**Chi lo usa:**
| ID | Modulo | Import |
|----|--------|--------|
| 5.11 | CRM | Clienti da TheFork CSV |
| 7.5 | Cantina | Listino Excel con diff interattivo |
| 3.4 | Flussi | Movimenti carta di credito |
| 3.9 | Flussi | Movimenti banca CSV/PSD2 |

---

### M.I — UI primitives TRGB-02 (frontend) ✅

**Cosa:** set di componenti React riutilizzabili che applicano la palette TRGB-02 e uniformano il look&feel di ogni pagina. Sostituiscono decine di duplicazioni di classi Tailwind (bottoni, badge, header pagina, empty state).
**Dove:** `frontend/src/components/ui/`
**Stato:** pronti, opt-in. Le pagine esistenti continuano a funzionare, le nuove usano i mattoni.

**Componenti:**
| Nome | Props principali | Uso |
|------|------------------|-----|
| `<Btn>` | `variant` (primary/secondary/success/danger/warning/ghost/chip), `size` (sm/md/lg), `tone` (per chip), `loading`, `as` | Bottone unificato con focus ring brand-blue, touch target 44pt su `md/lg`, spinner inline su `loading` |
| `<PageLayout>` | `title`, `subtitle`, `actions`, `toolbar`, `nav`, `wide`, `background`, `padded` | Wrapper pagina: bg-brand-cream + container max-w-7xl + header standard (h1+subtitle+azioni) + slot opzionali sub-nav e toolbar |
| `<StatusBadge>` | `tone` (success/warning/danger/info/neutral/brand/violet), `size` (sm/md/lg), `dot` | Badge compatto di stato, sostituisce la scrittura ripetitiva `bg-xxx-100 text-xxx-700 border` |
| `<EmptyState>` | `icon` (emoji), `title`, `description`, `action`, `watermark`, `compact` | Stato vuoto con watermark gobbette R/G/B sfumate sullo sfondo (roadmap 8.1) |

**Import:**
```jsx
import { Btn, PageLayout, StatusBadge, EmptyState } from "../../components/ui";
```

**Regola di migrazione:** quando si tocca una pagina per altro motivo, sostituire i pattern hardcoded con i mattoni se non aggiunge rischio. Niente refactor massivo one-shot (memoria "no blocchi accoppiati").

**Effort iniziale:** S (già fatto, sessione 2026-04-18)
**Effort migrazione pagine esistenti:** M, diluito sul tempo

**Chi li usa / userà:**
| Pagina | Priorità |
|--------|----------|
| Pagine nuove (roadmap) | SEMPRE |
| Pagine refactorate | opportunistico |
| Home, Login | già uniformi, no refactor |

---

## Mappa dipendenze: chi dipende da chi

```
LAYER 0 — Mattoni fondazione (nessuna dipendenza tra loro)
═══════════════════════════════════════════════════════════
  M.A Notifiche          M.B PDF brand       M.C WA composer
  M.D Email service      M.G Permessi        M.H Import engine

LAYER 1 — Servizi composti (usano 1+ mattone di Layer 0)
═══════════════════════════════════════════════════════════
  M.E Calendar ─────────── standalone, ma si arricchisce con M.A
  M.F Alert engine ─────── dipende da M.A (genera notifiche)
  9.2 Bacheca staff ────── dipende da M.A (tipo speciale di notifica)

LAYER 2 — Moduli che usano i mattoni
═══════════════════════════════════════════════════════════
  (ogni modulo elenca i mattoni che usa)
```

---

## Cascata per modulo — chi usa cosa

### Prenotazioni (§2)
```
2.1 Agenda ─────────── M.E (calendar), M.G (permessi)
2.2 Mappa tavoli ───── nessun mattone
2.3 Widget pubblico ── nessun mattone (e' un form standalone)
2.4 Conferme ───────── M.C (WA), M.D (email)
2.5 Distacco TF ────── M.H (import engine)
2.6 No-show ────────── M.A (notifiche), M.F (alert)
2.7 Lista attesa ───── M.A (notifiche), M.C (WA)
2.8 Report coperti ─── nessun mattone
```

### Flussi di Cassa (§3)
```
3.1 Bug storni ─────── nessun mattone
3.2 Riconciliazione ── nessun mattone
3.3 Multi-conto ────── nessun mattone
3.4 Carta credito ──── M.H (import engine)
3.5 Contanti ───────── nessun mattone
3.6 Dashboard ──────── nessun mattone
3.7 Scadenziario ───── M.E (calendar), M.A (notifiche), M.F (alert)
3.8 Cash flow ──────── M.B (PDF per export)
3.9 Import banca ───── M.H (import engine)
```

### Controllo Gestione / FoodCost (§4)
```
4.1 Note credito ───── nessun mattone
4.2 PDF ricette ────── M.B (PDF brand)
4.3 Dashboard FC ───── nessun mattone
4.4 Storico costi ──── nessun mattone
4.5 P&L mensile ────── M.B (PDF per export)
4.6 Alert soglia ───── M.A (notifiche), M.F (alert engine)
4.7 Margine piatto ─── nessun mattone
```

### Clienti / CRM (§5)
```
5.1 Mailchimp ──────── nessun mattone (usa API Mailchimp)
5.2 WA link ────────── M.C (WA composer)
5.3 Compleanni ─────── M.C (WA), M.D (email)
5.4 Note rapide ────── nessun mattone
5.5 Merge preview ──── nessun mattone
5.6 Filtri campagne ── nessun mattone
5.7 Audit log ──────── nessun mattone
5.8 Google Contacts ── nessun mattone
5.9 RFM ────────────── nessun mattone
5.10 Timeline ──────── nessun mattone (componente UI, ma beneficia di dati da tutti i moduli)
5.11 Import TF ─────── M.H (import engine)
```

### Dipendenti (§6)
```
6.1 Template WA ────── M.C (WA composer — migrare codice esistente)
6.2 PDF cedolino ───── M.B (PDF brand)
6.3 Checklist turno ── nessun mattone
6.4 Calendario turni ─ M.E (calendar)
6.5 Scadenze alert ─── M.A (notifiche), M.F (alert engine)
6.6 Costo orario ───── nessun mattone
```

### Cantina / Vini (§7)
```
7.1 Discontinuato UI ─ nessun mattone
7.2 Carta pubblica ─── nessun mattone (pagina web)
7.3 PDF carta ──────── M.B (PDF brand)
7.4 iPratico test ──── nessun mattone
7.5 Import Excel ───── M.H (import engine)
7.6 Alert sottoscorta ─ M.A (notifiche), M.F (alert engine)
7.7 Storico prezzi ─── nessun mattone
7.8 Inventario iPad ── nessun mattone
```

### Preventivi (§10)
```
10.1 CRUD base ─────── nessun mattone
10.2 Template+righe ── nessun mattone
10.3 PDF + invio ───── M.B (PDF brand), M.C (WA), M.D (email)
10.4 Versioning ────── M.A (notifiche per staff)
```

---

## Ordine di sviluppo consigliato — 4 Wave

### Wave 0 — Mattoni fondazione (~2-3 sessioni)

Obiettivo: costruire i servizi condivisi. Nessun modulo nuovo, ma tutto quello che viene dopo va piu' veloce.

| Sessione | Cosa | Mattoni |
|----------|------|---------|
| S1 | Notifiche infrastruttura + Bacheca staff | M.A + 9.1 + 9.2 |
| S2 | PDF brand service + WA composer centralizzato | M.B + M.C + 8.5 |
| S3 (opz.) | Email service brand + Alert engine | M.D + M.F |

> M.G (permessi) e M.H (import engine) e M.E (calendar) si possono fare on-demand quando servono al primo modulo che li richiede. Non bloccano nulla.

### Wave 1 — Preventivi + CRM quick wins (~2-3 sessioni)

Primo modulo che sfrutta TUTTI i mattoni della Wave 0.

| Sessione | Cosa | Usa |
|----------|------|-----|
| S4 | Preventivi fase A+B (CRUD + template + righe) | 10.1 + 10.2 |
| S5 | Preventivi fase C+D (PDF + WA + versioning + notifiche) | 10.3 + 10.4 → M.B + M.C + M.A |
| S6 | CRM: WA links + compleanni + note rapide | 5.2 + 5.3 + 5.4 → M.C |

### Wave 2 — Prenotazioni (~4-5 sessioni)

Modulo piu' grande, ma i mattoni sono gia' pronti.

| Sessione | Cosa | Usa |
|----------|------|-----|
| S7-S8 | Agenda + mini-calendario | 2.1 → (M.E se serve) |
| S9-S10 | Mappa tavoli | 2.2 |
| S11 | Widget pubblico + conferme | 2.3 + 2.4 → M.C + M.D |

### Wave 3 — Moduli esistenti potenziati (ordine libero)

Ogni modulo ora puo' agganciare i mattoni senza lavoro extra.

| Cosa | Usa | Effort |
|------|-----|--------|
| 7.3 PDF carta vini | M.B | S |
| 4.2 PDF ricette | M.B | S |
| 6.2 PDF cedolini | M.B | S |
| 6.5 Scadenze alert | M.A + M.F | S |
| 7.6 Sottoscorta alert | M.A + M.F | S |
| 4.6 FoodCost alert | M.A + M.F | S |
| 3.7 Scadenziario | M.E + M.A + M.F | M |
| 6.4 Calendario turni | M.E | M |
| 5.10 Timeline unificata | aggrega dati da tutti | S |
| Hook notifiche 9.3-9.6 | M.A | S cad. |

> In Wave 3 ogni sessione produce 2-3 feature perche' i mattoni sono gia' li'. Una sessione che prima costava M ora costa S.

---

## Riepilogo benefici

**Senza mattoni:** ogni modulo reimplementa PDF, WA, notifiche, alert → 76 punti, ciascuno autonomo, effort totale alto, inconsistenze UI/UX.

**Con mattoni:** ~2-3 sessioni in piu' all'inizio, ma:
- Wave 3 dimezza i tempi (S invece di M su quasi tutto)
- Zero duplicazione codice
- UX coerente (stessi PDF, stesse notifiche, stesso WA ovunque)
- Ogni nuovo modulo futuro parte gia' con l'infrastruttura

---

## Note per Claude futuro

- Prima di sviluppare un punto della roadmap, controllare in questa mappa se usa mattoni
- Se il mattone non esiste ancora, valutare con Marco se costruirlo prima o fare inline e rifattorizzare dopo
- I mattoni hanno test isolati: ogni servizio ha i suoi unit test prima di essere usato dai moduli
- I mattoni vivono in `app/services/` (backend) e `components/shared/` + `utils/` (frontend)
