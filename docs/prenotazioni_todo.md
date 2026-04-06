# Modulo Prenotazioni — Task List Implementativa
> Checklist operativa per Claude e Marco. Spuntare man mano.
> Riferimento architettura: `docs/modulo_prenotazioni.md`
> Ultimo aggiornamento: 2026-04-06

---

## FASE 1A — Backend Agenda (sessione target: 22)

### DB e migrazioni
- [ ] Migrazione: aggiungere colonne a `clienti_prenotazioni` (turno, fonte, creato_da, conferma_inviata, reminder_inviato, token_cancellazione, updated_at)
- [ ] Migrazione: creare tabella `prenotazioni_config` con valori default
- [ ] Migrazione: creare tabella `tavoli` (struttura base, senza posizioni mappa)
- [ ] Migrazione: creare tabella `tavoli_combinazioni`
- [ ] Script seed: popolare `tavoli` con i 14 interni + 20 esterni reali di Marco
- [ ] Backfill: calcolare `turno` e `fonte` per le 31k prenotazioni esistenti

### Router `prenotazioni_router.py`
- [ ] Struttura base: import, router prefix, DB connection helper
- [ ] `GET /prenotazioni/planning/{data}` — query prenotazioni del giorno + join clienti per nome/telefono/allergie/vip
- [ ] `GET /prenotazioni/settimana/{data}` — conteggi per 7 giorni
- [ ] `GET /prenotazioni/calendario/{anno}/{mese}` — conteggi giornalieri per mini-calendario
- [ ] `POST /prenotazioni/` — inserimento nuova prenotazione (validazione, link a cliente CRM, calcolo turno)
- [ ] `PUT /prenotazioni/{id}` — modifica prenotazione
- [ ] `PATCH /prenotazioni/{id}/stato` — cambio stato rapido (con validazione transizioni)
- [ ] `DELETE /prenotazioni/{id}` — soft delete (stato → CANCELED)
- [ ] `GET /prenotazioni/config` — leggi configurazione
- [ ] `PUT /prenotazioni/config` — aggiorna configurazione
- [ ] `GET /prenotazioni/clienti/search?q=` — autocomplete clienti per form (riusa logica CRM)

### Registrazione router
- [ ] Aggiungere `prenotazioni_router` a `main.py`

---

## FASE 1B — Frontend Agenda (sessione target: 22-23)

### Struttura e navigazione
- [ ] Creare cartella `frontend/src/pages/prenotazioni/`
- [ ] `PrenotazioniMenu.jsx` — entry point con icona e titolo
- [ ] `PrenotazioniNav.jsx` — tabs: Planning, Settimana, Impostazioni
- [ ] Aggiungere route in `App.jsx`
- [ ] Aggiungere modulo in `modulesMenu.js` (icona 📅, colore indigo)
- [ ] Aggiungere versione in `versions.jsx`

### Planning giornaliero (`PrenotazioniPlanning.jsx`)
- [ ] Layout base: header con navigazione data + contatori
- [ ] Sezione Pranzo con tabella prenotazioni
- [ ] Sezione Cena con tabella prenotazioni
- [ ] Riga prenotazione: ora, nome (link CRM), pax, tavolo, note troncate, badge stato
- [ ] Badge canale (icona TheFork/telefono/WA/walk-in/widget)
- [ ] Badge VIP (stella) e allergie (⚠️ rosso) se presenti nel CRM
- [ ] Espansione riga: dettagli completi (telefono, allergie, storico visite, note full)
- [ ] Azioni rapide per riga: Arrivato, Seduto, No-show, Cancella
- [ ] Colorazione righe per stato (verde/amber/rosso/grigio/azzurro)
- [ ] Ordinamento: per ora (default), per stato, per tavolo
- [ ] Riepilogo footer: totale prenotazioni, totale coperti, senza tavolo
- [ ] Bottone "+ Nuova Prenotazione" nel header

### Form nuova prenotazione (`PrenotazioniForm.jsx`)
- [ ] Dialog/modal per inserimento
- [ ] Campo data con default giorno corrente della vista
- [ ] Selezione ora: slot predefiniti (da config) + orario libero
- [ ] Campo pax con +/- buttons
- [ ] Autocomplete cliente (`ClienteAutocomplete.jsx`)
- [ ] Creazione cliente inline se non trovato (nome + cognome + telefono minimo)
- [ ] Box avviso allergie/preferenze se cliente trovato
- [ ] Dropdown tavolo (lista tavoli liberi per quel turno/ora)
- [ ] Campi: note ristorante, note cliente, occasione, canale, seggioloni, esterno
- [ ] Validazione e submit
- [ ] Toast conferma

### Mini-calendario (`MiniCalendario.jsx`)
- [ ] Calendario mensile compatto
- [ ] Badge numerico sui giorni con prenotazioni
- [ ] Colore badge per saturazione (verde/amber/rosso)
- [ ] Click giorno → naviga

### Vista settimanale (`PrenotazioniSettimana.jsx`)
- [ ] Griglia 7 giorni con conteggi pranzo/cena
- [ ] Giorno chiuso evidenziato
- [ ] Click su giorno → va a planning

### Impostazioni (`PrenotazioniImpostazioni.jsx`)
- [ ] Sezione Slot orari (edit slot pranzo/cena)
- [ ] Sezione Capienza (max coperti pranzo/cena)
- [ ] Sezione Generale (giorno chiusura, soglia pranzo/cena)
- [ ] Sezione Template messaggi (WA conferma/reminder)

---

## FASE 1 — Collaudo e rilascio

- [ ] Test manuale: inserire 5 prenotazioni manuali per domani
- [ ] Test: prenotazioni TheFork importate appaiono nel planning
- [ ] Test: autocomplete cliente trova clienti CRM
- [ ] Test: cambio stato funziona (tutti i passaggi)
- [ ] Test: navigazione date (avanti/indietro/oggi/calendario)
- [ ] Test: mobile/tablet responsive
- [ ] Aggiornare `docs/changelog.md`
- [ ] Aggiornare `docs/sessione.md`
- [ ] Push e test in produzione

---

## FASE 2A — Backend Tavoli (sessione target: 24)

### DB e migrazioni
- [ ] Migrazione: creare tabella `tavoli_layout`
- [ ] Aggiungere campi posizione/forma alla tabella `tavoli` (se non gia' presenti)

### Endpoint tavoli
- [ ] `GET /prenotazioni/tavoli` — lista con stato corrente (occupato/libero per turno)
- [ ] `POST /prenotazioni/tavoli` — crea tavolo
- [ ] `PUT /prenotazioni/tavoli/{id}` — modifica (nome, posti, posizione, zona)
- [ ] `DELETE /prenotazioni/tavoli/{id}` — disattiva
- [ ] `GET /prenotazioni/tavoli/layout` — lista layout salvati
- [ ] `POST /prenotazioni/tavoli/layout` — salva layout
- [ ] `PUT /prenotazioni/tavoli/layout/{id}/attiva` — attiva layout
- [ ] `GET /prenotazioni/tavoli/combinazioni` — lista combinazioni
- [ ] `POST /prenotazioni/tavoli/combinazioni` — crea combinazione
- [ ] `DELETE /prenotazioni/tavoli/combinazioni/{id}` — elimina combinazione
- [ ] `GET /prenotazioni/tavoli/mappa/{data}/{turno}` — stato completo per mappa
- [ ] `PUT /prenotazioni/{id}/tavolo` — assegna tavolo a prenotazione

---

## FASE 2B — Frontend Mappa Tavoli (sessione target: 24-25)

### Editor piantina (`TavoliEditor.jsx`)
- [ ] Canvas SVG con griglia di sfondo
- [ ] Tavoli come rect/circle draggabili
- [ ] Snap-to-grid nel drag
- [ ] Panel proprietà tavolo selezionato (nome, zona, posti min/max, forma)
- [ ] Aggiungi / rimuovi tavolo
- [ ] Zoom e pan
- [ ] Definizione zone (rettangoli sfondo colorati)
- [ ] Salva/carica layout
- [ ] Gestione combinazioni (seleziona multipli → "Crea combinazione")

### Mappa serale (`TavoliMappa.jsx`)
- [ ] Rendering SVG tavoli colorati per stato
- [ ] Tooltip hover: nome cliente, ora, pax
- [ ] Click tavolo libero → dialog assegnazione
- [ ] Click tavolo occupato → dettaglio prenotazione + azioni
- [ ] Lista prenotazioni senza tavolo (sidebar o sotto)
- [ ] Drag prenotazione → tavolo (se spazio sufficiente)
- [ ] Ctrl+click multi-selezione → "Unisci per stasera"
- [ ] Indicatore visivo combinazioni attive
- [ ] Auto-refresh periodico (ogni 30s)

### Responsive tablet
- [ ] Touch: tap = click, long-press = tooltip
- [ ] Layout verticale su schermi piccoli (mappa sopra, lista sotto)
- [ ] Pulsanti grandi touch-friendly

### Collaudo Fase 2
- [ ] Test: editor posiziona 14 tavoli interni
- [ ] Test: salva layout "Inverno", crea layout "Estate" con esterni
- [ ] Test: assegnazione tavolo da mappa
- [ ] Test: combinazione tavoli funziona (blocca singoli)
- [ ] Test: tablet touch funziona
- [ ] Aggiornare docs

---

## FASE 3 — Widget Pubblico (sessione target: 25-26)

### Backend
- [ ] Endpoint `GET /public/prenotazioni/disponibilita?data=&turno=&pax=` (no auth, rate limited)
- [ ] Endpoint `POST /public/prenotazioni/prenota` (no auth, CAPTCHA, rate limited)
- [ ] Endpoint `GET /public/prenotazioni/{token}/cancella` (link da email)
- [ ] Logica calcolo disponibilita' (capienza turno - coperti prenotati)
- [ ] Generazione token_cancellazione unico per ogni prenotazione widget
- [ ] Rate limiting: max 3 prenotazioni/IP/ora
- [ ] Validazione CAPTCHA (Cloudflare Turnstile)
- [ ] Matching cliente esistente (per telefono/email) o creazione nuovo

### Frontend widget
- [ ] Pagina standalone `/prenota` servita da FastAPI
- [ ] Step 1: selezione data + turno + pax (calendario, no date passate)
- [ ] Step 2: selezione orario (slot precisi cena, fascia pranzo)
- [ ] Step 3: dati personali (nome, tel, email, note, allergie, occasione)
- [ ] Step 4: riepilogo + conferma + CAPTCHA
- [ ] Pagina ringraziamento con numero di riferimento
- [ ] Design responsive mobile-first, branding Tre Gobbi
- [ ] Gestione errori (pieno, troppo tardi, rate limit)

### Integrazione planning
- [ ] Prenotazioni widget appaiono con badge "Nuova 🌐" e stato REQUESTED
- [ ] Pulsanti Conferma / Rifiuta nel planning
- [ ] Notifica visiva (badge, suono opzionale) per nuove REQUESTED

### Configurazione Nginx
- [ ] Proxy `/prenota` → pagina widget
- [ ] Proxy `/api/public/` → endpoint pubblici
- [ ] Headers CORS se necessari

### Collaudo Fase 3
- [ ] Test: widget mostra disponibilita' corretta
- [ ] Test: prenotazione da widget arriva nel planning
- [ ] Test: conferma/rifiuto da staff funziona
- [ ] Test: link cancellazione da email funziona
- [ ] Test: rate limiting blocca spam
- [ ] Test: CAPTCHA funziona
- [ ] Test: mobile responsive

---

## FASE 4 — Conferme e Notifiche (sessione target: 26-27)

### Email
- [ ] Configurazione SMTP (Brevo free tier o postfix VPS)
- [ ] Template HTML email conferma (logo, colori, dati prenotazione, link cancellazione)
- [ ] Template HTML email reminder
- [ ] Template HTML email cancellazione/rifiuto
- [ ] Endpoint `POST /prenotazioni/{id}/conferma-email`
- [ ] Endpoint `POST /prenotazioni/batch/reminder` (batch per domani)
- [ ] Tabella `prenotazioni_email_log` e logging invii
- [ ] Cron job o scheduled task per reminder giornaliero

### WhatsApp (link manuali)
- [ ] Endpoint `GET /prenotazioni/{id}/wa-link` — genera link wa.me con testo precompilato
- [ ] Bottone "WhatsApp" nel planning → apre link
- [ ] Template messaggi configurabili in Impostazioni

### Collaudo Fase 4
- [ ] Test: email conferma arriva (non spam)
- [ ] Test: reminder inviato giorno prima
- [ ] Test: link WA apre WhatsApp con messaggio corretto
- [ ] Configurazione SPF/DKIM su dominio

---

## FASE 5 — Distacco TheFork Manager (sessione target: 27-28)

- [ ] Valutare opzioni: import XLSX giornaliero vs API/scraping
- [ ] Automatizzare import prenotazioni TheFork (se fattibile)
- [ ] Periodo parallelo: 2 settimane TFM + TRGB in parallelo
- [ ] Disattivare Booking Module TF sul sito → sostituire con widget TRGB
- [ ] Disdetta TheFork Manager (mantenendo profilo portale)
- [ ] Documentazione finale

---

## NOTE

### Decisioni prese (2026-04-06)
- Tutto in `clienti.sqlite3`, stessa tabella `clienti_prenotazioni`
- Colore tema: indigo
- Widget: slot precisi cena, fascia generica pranzo
- Utenti: Marco (admin) + staff sala (inserimento + arrivi)
- Conferme: email + link WA manuale, poi eventuale WA Business API
- Layout sala cambia spesso → layout salvabili obbligatori
- 14 interni + 20 esterni + ~20 combinazioni interne

### File di riferimento
- Specifica: `docs/modulo_prenotazioni.md`
- Questa checklist: `docs/prenotazioni_todo.md`
- DB: `app/data/clienti.sqlite3`
- Backend: `app/routers/prenotazioni_router.py` (da creare)
- Frontend: `frontend/src/pages/prenotazioni/` (da creare)
