# Modulo Prenotazioni — TRGB Gestionale
**Versione target:** 1.0 (Fase 1 — Agenda)
**Stato:** In progettazione
**Data creazione:** 2026-04-06
**Data ultimo aggiornamento:** 2026-04-06
**Dominio funzionale:** Gestione prenotazioni, planning serale, tavoli, widget pubblico
**Autore analisi:** Claude + Marco

---

# 0. Contesto e obiettivo strategico

## Situazione attuale
- Marco gestisce TUTTE le prenotazioni tramite **TheFork Manager** (TFM), incluse quelle telefoniche/WhatsApp che inserisce come "Offline"
- TheFork ha un costo: **abbonamento fisso + commissione per prenotazione** via portale/widget
- Il widget "Booking Module" di TheFork e' embeddato sul sito tregobbi.it e genera ~2.150 prenotazioni (7% del totale storico)
- Il CRM TRGB ha gia' 31.279 prenotazioni importate e 24.445 clienti con storico completo

## Obiettivo finale
Eliminare la dipendenza da TheFork Manager, mantenendo TheFork solo come **vetrina/portale** per visibilita'.
TRGB diventa il sistema unico per:
- Inserire e gestire prenotazioni dirette (telefono, WhatsApp, walk-in)
- Visualizzare prenotazioni TheFork importate
- Offrire un widget pubblico sul sito (sostituisce Booking Module TF)
- Gestire tavoli e planning serale
- Inviare conferme al cliente (email + WhatsApp)

## ROI atteso
- Risparmio commissioni su prenotazioni dirette e widget proprio
- Dati completamente in casa (no dipendenza da export TF)
- CRM integrato: ogni prenotazione ha lo storico cliente, allergie, preferenze, segmento
- Personalizzazione totale dell'esperienza di prenotazione

---

# 1. Dati reali del locale (da analisi DB)

## Volumi
- ~450-540 prenotazioni/mese nei mesi pieni (inverno/primavera)
- ~300 in mesi piu' calmi (estate a parte esterno)
- 64% cena, 36% pranzo
- 56% delle prenotazioni sono da 2 persone
- Chiuso il mercoledi'

## Canali attuali (storico 31k prenotazioni)
| Canale | % | Note |
|--------|---|------|
| Offline (tel/WA/persona) | 60% | Inserite manualmente su TFM |
| TheFork (portale) | 24% | Arrivano da ricerca su TheFork |
| Walk-in | 7.5% | Clienti senza prenotazione |
| Booking Module (widget TF) | 7% | Widget su sito tregobbi.it |
| TripAdvisor | 2% | Via partnership TF |
| Michelin | <0.1% | Sporadico |

## Tavoli fisici
- **14 tavoli interni** (sala principale + bottiglieria)
- **20 tavoli esterni** (stagionali)
- **~20 combinazioni** interne possibili (es. 4+5, 4+5+6)
- Layout cambia **spesso**: stagionale + eventi + gruppi

## Orari piu' richiesti
| Orario | Prenotazioni | Fascia |
|--------|-------------|--------|
| 20:00 | 4.481 | Cena |
| 20:30 | 4.116 | Cena |
| 13:00 | 3.276 | Pranzo |
| 19:30 | 3.025 | Cena |
| 12:30 | 2.571 | Pranzo |
| 21:00 | 2.281 | Cena |

## Tasso no-show e cancellazioni (ultimi 12 mesi)
- No-show: 0.7% (molto basso)
- Cancellazioni: 12.5%
- Non serve sistema anti-no-show aggressivo

## Informazioni per prenotazione (campi usati)
Dati gia' presenti in `clienti_prenotazioni`:
- data_pasto, ora_pasto, pax, tavolo
- stato (RECORDED, ARRIVED, SEATED, LEFT, NO_SHOW, CANCELED, REFUSED, REQUESTED)
- canale, prenotato_da, data_prenotazione
- nota_ristorante, nota_cliente
- occasione (compleanno, anniversario, laurea...)
- allergie_segnalate
- tavolo_esterno (0/1), seggioloni
- menu_preset, degustazione
- offerta_speciale, yums, imprint (dati TheFork-specifici)
- thefork_booking_id, thefork_customer_id (link a TF)

---

# 2. Architettura generale

## Principio guida
Il modulo Prenotazioni NON duplica i dati. Usa la stessa tabella `clienti_prenotazioni` gia' esistente, aggiungendo i campi necessari per la gestione interna. Le prenotazioni TheFork importate e quelle inserite manualmente convivono nella stessa tabella.

## Stack tecnico
- **Backend**: FastAPI, nuovo router `prenotazioni_router.py`
- **Frontend**: React + Tailwind, nuova sezione `/prenotazioni`
- **DB**: `clienti.sqlite3` (stesso DB del CRM)
- **Widget**: pagina pubblica servita da FastAPI, no auth

## Fasi di sviluppo

| Fase | Nome | Sessioni stimate | Dipendenze |
|------|------|-------------------|------------|
| 1 | Agenda Prenotazioni | 2 | CRM esistente |
| 2 | Mappa Tavoli | 2 | Fase 1 |
| 3 | Widget Pubblico | 1-2 | Fase 1, config tavoli da Fase 2 |
| 4 | Conferme e Notifiche | 1 | Fase 1 |
| 5 | Distacco da TheFork Manager | 1 | Fasi 1-4 |

Ogni fase produce un modulo **utilizzabile indipendentemente**.

---

# 3. FASE 1 — Agenda Prenotazioni

## 3.1 Obiettivo
Sostituire l'agenda di TheFork Manager per le prenotazioni dirette. Una vista giornaliera dove Marco e lo staff vedono tutte le prenotazioni della giornata, ne inseriscono di nuove, e gestiscono il flusso serale.

## 3.2 Utenti e ruoli
| Ruolo | Puo' fare |
|-------|----------|
| Marco (admin) | Tutto: inserire, modificare, cancellare, configurare |
| Staff sala | Inserire walk-in, segnare arrivi, consultare planning |
| Ospite | Solo consultare (sola lettura) |

## 3.3 Vista principale — Planning Giornaliero

### Layout
```
+------------------------------------------------------------------+
| [<] Lun 7 Aprile 2026 [>]  [Oggi]  [📅 Calendario]  [+ Nuova]  |
+------------------------------------------------------------------+
| PRANZO (12:00-15:00)                              8 pren / 28 pax|
+------------------------------------------------------------------+
| Ora   | Cliente        | Pax | Tavolo | Note          | Stato    |
|-------|----------------|-----|--------|---------------|----------|
| 12:30 | Rossi Marco    |  4  |   5    | celiaco x1    | ✅ Seduto|
| 12:30 | Bianchi Anna   |  2  |   -    | compleanno    | 🟡 Conf.|
| 13:00 | [Walk-in]      |  3  |  11    |               | ✅ Seduto|
| 13:00 | Verdi Luigi    |  2  |   -    | 🍴 TheFork   | ⏳ Atteso|
+------------------------------------------------------------------+
| CENA (19:00-23:00)                               22 pren / 64 pax|
+------------------------------------------------------------------+
| Ora   | Cliente        | Pax | Tavolo | Note          | Stato    |
|-------|----------------|-----|--------|---------------|----------|
| 19:30 | Neri Paolo     |  6  | 4+5    | menu degust.  | 🟡 Conf.|
| 20:00 | Colombo Sara   |  2  |   7    | VIP ⭐        | 🟡 Conf.|
| 20:00 | Martinez Juan  |  4  |   -    | 🍴 TheFork   | 🟡 Conf.|
| ...   | ...            | ... |  ...   | ...           |  ...     |
+------------------------------------------------------------------+
| Riepilogo: 30 prenotazioni, 92 coperti | 2 senza tavolo          |
+------------------------------------------------------------------+
```

### Comportamenti
- **Click su riga** → espande dettagli (telefono, allergie, storico visite, note)
- **Click su nome cliente** → apre scheda CRM in nuovo tab
- **Click su stato** → cicla: Confermata → Arrivato → Seduto → Andato via
- **Click su tavolo** → dropdown assegnazione (o link a mappa se Fase 2 attiva)
- **Badge canale**: icona TheFork (🍴), telefono (📞), WhatsApp (💬), walk-in (🚶), widget (🌐)
- **Badge VIP**: stella per clienti VIP
- **Badge allergie**: icona rossa se il cliente ha allergie nel CRM
- **Ordinamento**: per ora (default), per stato, per tavolo

### Indicatori visivi
- Riga verde chiaro = seduto/completato
- Riga amber = confermata, in attesa arrivo
- Riga rossa = in ritardo (> 15 min dall'ora prenotata, non ancora arrivato)
- Riga grigia = cancellata / no-show
- Riga azzurra = appena confermata dal widget (nuova, da gestire)

### Contatori nel header
- Totale prenotazioni pranzo/cena
- Totale coperti pranzo/cena
- Prenotazioni senza tavolo assegnato
- Walk-in della giornata

## 3.4 Form Nuova Prenotazione

### Campi
| Campo | Tipo | Obbligatorio | Note |
|-------|------|-------------|------|
| Data | date | Si' | Default: data corrente vista |
| Turno | select | Si' | Pranzo / Cena (auto da ora) |
| Ora | time/select | Si' | Slot predefiniti + orario libero |
| Pax | number | Si' | Default: 2, min 1, max 30 |
| Cliente | autocomplete | Si' | Cerca in CRM per nome/cognome/telefono |
| Tavolo | select | No | Assegnabile dopo, dropdown tavoli liberi |
| Note ristorante | textarea | No | Note interne (cucina, sala) |
| Note cliente | textarea | No | Richieste del cliente |
| Occasione | select/text | No | Compleanno, anniversario, ecc. |
| Canale | select | Si' | Telefono, WhatsApp, Walk-in, Email, Altro |
| Seggioloni | number | No | Default: 0 |
| Tavolo esterno | checkbox | No | Preferenza esterno |

### Autocomplete cliente
- Cerca per: nome, cognome, telefono, email
- Mostra: nome completo + telefono + n. visite + segmento
- Se il cliente non esiste → pulsante "Crea nuovo" inline
- Nuovo cliente: nome, cognome, telefono (minimo) → creato nel CRM con `canale_acquisizione = "Diretto"`
- Se il cliente ha allergie/preferenze → box giallo di avviso sotto il campo

### Slot orari predefiniti
Configurabili in Impostazioni:
- Pranzo: 12:00, 12:15, 12:30, 12:45, 13:00, 13:15, 13:30, 14:00
- Cena: 19:00, 19:30, 19:45, 20:00, 20:15, 20:30, 21:00, 21:30
- Possibilita' di inserire orario libero

## 3.5 Gestione stati

### Flusso standard
```
RECORDED ──→ ARRIVED ──→ SEATED ──→ LEFT
    │
    ├──→ CANCELED (cancellata)
    └──→ NO_SHOW (non presentato)
```

### Azioni rapide nella lista
- Pulsante "Arrivato" (RECORDED → ARRIVED → SEATED in due click)
- Pulsante "No-show" (RECORDED → NO_SHOW, solo dopo l'ora prevista)
- Pulsante "Cancella" (RECORDED → CANCELED, chiede conferma)
- Il passaggio SEATED → LEFT avviene quando si libera il tavolo (Fase 2) o manualmente

### Compatibilita' stati TheFork
Gli stati TRGB mappano 1:1 con quelli TheFork gia' in DB:
RECORDED, ARRIVED, SEATED, LEFT, CANCELED, NO_SHOW, REFUSED, REQUESTED, BILL, PARTIALLY_ARRIVED

Nuovo stato solo per widget:
- `REQUESTED` → prenotazione dal widget, in attesa di conferma staff

## 3.6 Mini-calendario laterale

- Calendario mensile compatto nella sidebar o nel header
- Badge numerico sui giorni con prenotazioni
- Colore badge: verde = poche, amber = molte, rosso = quasi pieno
- Click su giorno → naviga a quel giorno
- Utile per visione d'insieme della settimana

## 3.7 Vista settimanale (opzionale Fase 1)

Griglia 7 giorni con riassunto per giorno:
```
| Lun 7 | Mar 8 | Mer 9 | Gio 10 | Ven 11 | Sab 12 | Dom 13 |
|  ---  | 12 pr |CHIUSO |  8 pr  | 18 pr  | 24 pr  | 16 pr  |
|       | 38 pax|       | 22 pax | 52 pax | 68 pax | 48 pax |
```
Click su giorno → va alla vista giorno.

---

# 4. FASE 2 — Mappa Tavoli

## 4.1 Obiettivo
Visualizzazione grafica della sala con tavoli posizionabili, assegnazione visuale, gestione combinazioni.

## 4.2 Editor Piantina (in Impostazioni)

### Concetti
- **Tavolo**: entita' singola con nome, zona, posti min/max, posizione (x, y)
- **Zona**: raggruppamento logico (Sala, Bottiglieria, Esterno, Privata)
- **Layout**: configurazione salvata dei tavoli (posizioni + quali tavoli sono attivi)
- **Combinazione**: unione di 2+ tavoli con nome e capacita' risultante

### Editor drag & drop
- Canvas con griglia di sfondo (snap-to-grid)
- Tavoli come rettangoli/cerchi trascinabili
- Sidebar con proprieta' tavolo selezionato (nome, zona, posti)
- Pulsante "Aggiungi tavolo" → appare un nuovo tavolo al centro
- Pulsante "Elimina tavolo" → rimuove (con conferma)
- Zoom + pan sul canvas

### Layout salvabili
```
Layout "Inverno"     → 14 tavoli interni attivi, 0 esterni
Layout "Estate"      → 14 interni + 20 esterni attivi
Layout "Evento sala" → 8 tavoli grandi (combinati), bottiglieria chiusa
```
- Pulsante "Salva layout" / "Carica layout"
- Un layout e' attivo alla volta, si cambia con un click

### Combinazioni predefinite
- Marco definisce le combinazioni possibili (es. "4+5" = 6 posti, "4+5+6" = 10 posti)
- Ogni combinazione ha un nome e la lista dei tavoli che la compongono
- In fase di assegnazione, selezionando una combinazione → tutti i tavoli componenti risultano occupati

## 4.3 Vista serale (Planning con mappa)

### Layout
```
+---------------------------------------------+------------------+
|              MAPPA SALA                      |  LISTA PRENO.    |
|                                              |                  |
|   [4]  [5]  [6]  [7]                        | 19:30 Neri (6)   |
|   🟢   🟡   🟡   ⬜                         | 20:00 Colombo(2) |
|                                              | 20:00 Martinez(4)|
|   [8]  [9]  [10] [11]                       | 20:30 ...        |
|   ⬜   ⬜   🟢   🟡                         |                  |
|                                              | -- SENZA TAVOLO--|
|   --- BOTTIGLIERIA ---                       | 20:00 Bianchi(2) |
|   [B1] [B2] [B3]                            | 21:00 Russo (4)  |
|   ⬜   🟡   ⬜                               |                  |
+---------------------------------------------+------------------+
```

### Interazioni
- **Hover su tavolo** → tooltip con nome cliente, ora, pax
- **Click su tavolo libero** → apre dialog per assegnare una prenotazione dalla lista
- **Click su tavolo occupato** → mostra dettagli prenotazione con azioni (libera, segna LEFT)
- **Drag da lista → tavolo** → assegna prenotazione a quel tavolo (se capiente)
- **Ctrl+click su piu' tavoli** → "Unisci per stasera" (combinazione temporanea)

### Colori tavoli
| Colore | Stato | Tailwind |
|--------|-------|----------|
| Grigio | Libero | `bg-gray-200` |
| Teal | Prenotato, non ancora arrivato | `bg-teal-400` |
| Amber | In ritardo (>15 min) | `bg-amber-400` |
| Emerald | Seduto, occupato | `bg-emerald-500` |
| Red | No-show | `bg-red-400` |
| Slate | Disattivato/non disponibile | `bg-slate-300` |

## 4.4 Responsivita' tablet
- La mappa tavoli deve funzionare su tablet (lo staff in sala)
- Touch: tap = click, long-press = hover/tooltip
- Lista prenotazioni scorre sotto la mappa su schermi piccoli (non affiancata)
- Azioni rapide con pulsanti grandi (touch-friendly)

---

# 5. FASE 3 — Widget Pubblico

## 5.1 Obiettivo
Pagina web pubblica su `tregobbi.it/prenota` che permette ai clienti di prenotare direttamente. Sostituisce il widget "Booking Module" di TheFork.

## 5.2 Flusso utente

### Step 1: Data e turno
- Calendario per scegliere la data (non prima di domani, non oltre X giorni)
- Selezione Pranzo / Cena
- Numero persone (1-10, oltre → messaggio "contattaci")

### Step 2: Orario
- **Cena**: slot precisi (19:30, 20:00, 20:30, 21:00, 21:30)
- **Pranzo**: fascia generica ("Ti aspettiamo tra le 12:00 e le 14:00")
- Slot non disponibili (pieno) → grigi e non selezionabili
- Indicatore "Quasi pieno" quando rimangono pochi coperti

### Step 3: Dati personali
- Nome e cognome (obbligatorio)
- Telefono (obbligatorio, validazione formato italiano)
- Email (opzionale ma consigliata per conferma)
- Note / richieste (textarea libero)
- Allergie / intolleranze (textarea o checkbox comuni: celiaco, lattosio, vegetariano)
- Occasione (dropdown: nessuna, compleanno, anniversario, evento aziendale, altro)
- Checkbox GDPR / privacy

### Step 4: Conferma
- Riepilogo completo: data, ora, pax, nome, note
- Pulsante "Conferma prenotazione"
- Pagina di ringraziamento con riepilogo + numero di riferimento
- Email di conferma (se email fornita)
- La prenotazione entra nel planning con stato `REQUESTED`

## 5.3 Calcolo disponibilita'

### Logica semplificata (Fase 3)
```
disponibilita = capienza_turno - coperti_gia_prenotati
```
- `capienza_turno` e' configurabile (es. 50 cena, 35 pranzo)
- `coperti_gia_prenotati` = SUM(pax) delle prenotazioni con stato NOT IN ('CANCELED', 'NO_SHOW', 'REFUSED')
- Non calcola per singolo tavolo (quello lo gestisce Marco dalla mappa)
- Se disponibilita < 20% della capienza → "Quasi pieno"
- Se disponibilita <= 0 → "Pieno, contattaci per disponibilita'"

### Logica avanzata (futura, opzionale)
- Calcolo per fascia oraria (slot 19:30 pieno ma 21:00 libero)
- Basata su tavoli reali + durata media permanenza
- Richiede integrazione forte con Fase 2

## 5.4 Protezione anti-spam
- **Rate limiting**: max 3 prenotazioni per IP per ora
- **CAPTCHA**: Turnstile di Cloudflare (gratuito, leggero, rispettoso privacy)
- **Validazione telefono**: formato +39 / 3xx obbligatorio, cifre min 10
- **Finestra prenotazione**: min 2 ore prima, max 60 giorni avanti
- **Conferma email**: opzionale, link "Conferma la tua prenotazione" nella email

## 5.5 Design e branding
- Pagina standalone, responsive (mobile-first)
- Logo Tre Gobbi in alto, colori coerenti col sito
- Font pulito (system font o Google Fonts leggero)
- Nessun framework pesante: React minimale o vanilla JS
- Servita come pagina statica da FastAPI/Nginx
- URL: `app.tregobbi.it/prenota` o `tregobbi.it/prenota` (tramite Nginx proxy)

## 5.6 Gestione prenotazioni dal widget (lato staff)

Le prenotazioni `REQUESTED` appaiono nel planning con badge "Nuova" blu:
- **Conferma** → stato diventa `RECORDED`, email/WA di conferma inviata
- **Rifiuta** → stato diventa `REFUSED`, email di rifiuto inviata (con messaggio opzionale)
- **Modifica** → cambia orario/tavolo prima di confermare
- Notifica sonora / visiva nel planning quando arriva una nuova prenotazione widget

---

# 6. FASE 4 — Conferme e Notifiche

## 6.1 Email transazionali
- **Conferma prenotazione**: data, ora, pax, riepilogo, link cancellazione
- **Reminder** (giorno prima, ore 10): "Vi aspettiamo domani alle 20:00"
- **Cancellazione**: conferma avvenuta cancellazione
- **Rifiuto**: "Siamo al completo, vi invitiamo a provare un'altra data"

### Tecnico
- SMTP dal VPS (postfix o servizio esterno tipo Brevo/Mailgun tier gratuito)
- Template HTML semplici con logo e colori Tre Gobbi
- Tabella `prenotazioni_email_log` per tracciamento

## 6.2 WhatsApp
### Fase iniziale (no costi)
- Link `wa.me/{telefono}?text={messaggio_precompilato}` generato dal sistema
- Lo staff clicca → si apre WhatsApp con messaggio pronto, basta inviare
- Template messaggi configurabili in impostazioni

### Fase futura (WhatsApp Business API)
- Invio automatico conferme/reminder via API (costo ~0.05 EUR/messaggio)
- Richiede: account WhatsApp Business, provider API (360dialog, Twilio, Meta diretto)
- Da valutare ROI: ~500 messaggi/mese = ~25 EUR/mese

---

# 7. FASE 5 — Distacco da TheFork Manager

## 7.1 Cosa serve
- Import automatico prenotazioni TheFork → TRGB (gia' funzionante via XLSX)
- Eventuale scraping TheFork Manager o API (se disponibile) per sync quasi-real-time
- Tutte le prenotazioni gestite da TRGB, TheFork resta solo vetrina

## 7.2 Rischi
- TheFork non ha API pubblica documentata per i ristoratori
- Lo scraping potrebbe violare i TOS
- Alternativa pragmatica: import XLSX giornaliero (1 click) + widget proprio per dirette

---

# 8. Schema DB

## 8.1 Modifiche a `clienti_prenotazioni` (colonne nuove)

```sql
-- Nuovi campi da aggiungere con migrazione
ALTER TABLE clienti_prenotazioni ADD COLUMN turno TEXT;         -- 'pranzo' / 'cena', calcolato da ora
ALTER TABLE clienti_prenotazioni ADD COLUMN fonte TEXT;         -- 'manuale' / 'thefork' / 'widget'
ALTER TABLE clienti_prenotazioni ADD COLUMN creato_da TEXT;     -- username TRGB che ha inserito
ALTER TABLE clienti_prenotazioni ADD COLUMN conferma_inviata INTEGER DEFAULT 0;
ALTER TABLE clienti_prenotazioni ADD COLUMN reminder_inviato INTEGER DEFAULT 0;
ALTER TABLE clienti_prenotazioni ADD COLUMN token_cancellazione TEXT;  -- per link cancellazione widget
ALTER TABLE clienti_prenotazioni ADD COLUMN updated_at TEXT;
```

## 8.2 Tabella `tavoli`

```sql
CREATE TABLE IF NOT EXISTS tavoli (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,           -- "4", "B2", "T1"
    zona TEXT NOT NULL DEFAULT 'sala',   -- sala, bottiglieria, esterno, privata
    posti_min INTEGER NOT NULL DEFAULT 2,
    posti_max INTEGER NOT NULL DEFAULT 4,
    combinabile INTEGER NOT NULL DEFAULT 1,
    posizione_x REAL DEFAULT 0,
    posizione_y REAL DEFAULT 0,
    larghezza REAL DEFAULT 60,
    altezza REAL DEFAULT 60,
    forma TEXT DEFAULT 'rect',           -- rect, circle
    attivo INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    ordine INTEGER DEFAULT 0            -- per ordinamento in dropdown
);
```

## 8.3 Tabella `tavoli_combinazioni`

```sql
CREATE TABLE IF NOT EXISTS tavoli_combinazioni (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,                  -- "4+5", "4+5+6"
    tavoli_ids TEXT NOT NULL,            -- JSON: "[4, 5, 6]"
    posti INTEGER NOT NULL,
    uso_frequente INTEGER DEFAULT 0,     -- 1 = mostrata come preset
    note TEXT
);
```

## 8.4 Tabella `tavoli_layout`

```sql
CREATE TABLE IF NOT EXISTS tavoli_layout (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,           -- "Inverno", "Estate", "Evento sala"
    descrizione TEXT,
    tavoli_attivi TEXT NOT NULL,         -- JSON: "[1, 2, 3, 5, ...]" (id tavoli attivi)
    posizioni TEXT,                      -- JSON: {"1": {"x": 10, "y": 20}, ...} override posizioni
    attivo INTEGER DEFAULT 0,           -- 1 = layout corrente
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

## 8.5 Tabella `prenotazioni_config`

```sql
CREATE TABLE IF NOT EXISTS prenotazioni_config (
    chiave TEXT PRIMARY KEY,
    valore TEXT NOT NULL,
    descrizione TEXT
);

-- Valori default
INSERT OR IGNORE INTO prenotazioni_config VALUES
    ('capienza_pranzo', '35', 'Coperti massimi pranzo'),
    ('capienza_cena', '50', 'Coperti massimi cena'),
    ('slot_pranzo', '["12:00","12:15","12:30","12:45","13:00","13:15","13:30","14:00"]', 'Slot orari pranzo'),
    ('slot_cena', '["19:00","19:30","19:45","20:00","20:15","20:30","21:00","21:30"]', 'Slot orari cena'),
    ('soglia_pranzo_cena', '15:00', 'Ora che separa pranzo da cena'),
    ('giorni_anticipo_max', '60', 'Max giorni in avanti per widget'),
    ('giorni_anticipo_min_ore', '2', 'Min ore prima per widget'),
    ('giorno_chiusura', '3', 'Giorno settimanale chiuso (0=dom, 3=mer)'),
    ('durata_media_tavolo_min', '90', 'Durata media permanenza in minuti'),
    ('widget_attivo', '0', 'Widget pubblico attivato (0/1)'),
    ('widget_messaggio_pieno', 'Siamo al completo. Contattaci al 035/XXXXXX per verificare disponibilita.', 'Messaggio quando pieno'),
    ('template_wa_conferma', 'Ciao {nome}, confermiamo la prenotazione per {pax} persone il {data} alle {ora}. Vi aspettiamo! - Osteria Tre Gobbi', 'Template WA conferma'),
    ('template_wa_reminder', 'Ciao {nome}, vi ricordiamo la prenotazione per domani alle {ora} ({pax} persone). A presto! - Osteria Tre Gobbi', 'Template WA reminder');
```

## 8.6 Tabella `prenotazioni_email_log` (Fase 4)

```sql
CREATE TABLE IF NOT EXISTS prenotazioni_email_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prenotazione_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,        -- 'conferma', 'reminder', 'cancellazione', 'rifiuto'
    destinatario TEXT,
    inviata_at TEXT,
    errore TEXT,
    FOREIGN KEY (prenotazione_id) REFERENCES clienti_prenotazioni(id)
);
```

---

# 9. API Endpoints

## 9.1 Fase 1 — Agenda

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/prenotazioni/planning/{data}` | Planning giornaliero (pranzo + cena) |
| GET | `/prenotazioni/settimana/{data}` | Riepilogo settimanale (7 giorni) |
| GET | `/prenotazioni/calendario/{anno}/{mese}` | Conteggi per mini-calendario |
| POST | `/prenotazioni/` | Nuova prenotazione manuale |
| PUT | `/prenotazioni/{id}` | Modifica prenotazione |
| PATCH | `/prenotazioni/{id}/stato` | Cambio stato rapido |
| DELETE | `/prenotazioni/{id}` | Cancella (soft: stato → CANCELED) |
| GET | `/prenotazioni/config` | Configurazione corrente |
| PUT | `/prenotazioni/config` | Aggiorna configurazione |

## 9.2 Fase 2 — Tavoli

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/prenotazioni/tavoli` | Lista tavoli con stato corrente |
| POST | `/prenotazioni/tavoli` | Crea tavolo |
| PUT | `/prenotazioni/tavoli/{id}` | Modifica tavolo (nome, posti, posizione) |
| DELETE | `/prenotazioni/tavoli/{id}` | Disattiva tavolo |
| GET | `/prenotazioni/tavoli/layout` | Lista layout salvati |
| POST | `/prenotazioni/tavoli/layout` | Salva nuovo layout |
| PUT | `/prenotazioni/tavoli/layout/{id}/attiva` | Attiva un layout |
| GET | `/prenotazioni/tavoli/combinazioni` | Lista combinazioni |
| POST | `/prenotazioni/tavoli/combinazioni` | Crea combinazione |
| GET | `/prenotazioni/tavoli/mappa/{data}/{turno}` | Stato tavoli per mappa serale |
| PUT | `/prenotazioni/{id}/tavolo` | Assegna tavolo a prenotazione |

## 9.3 Fase 3 — Widget pubblico (NO AUTH)

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/public/prenotazioni/disponibilita` | Disponibilita per data/turno/pax |
| POST | `/public/prenotazioni/prenota` | Crea prenotazione da widget |
| GET | `/public/prenotazioni/{token}/cancella` | Cancella via link email |
| GET | `/public/prenotazioni/{token}/conferma` | Conferma via link email |

## 9.4 Fase 4 — Notifiche

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| POST | `/prenotazioni/{id}/conferma-email` | Invia email conferma |
| POST | `/prenotazioni/{id}/reminder` | Invia reminder |
| GET | `/prenotazioni/{id}/wa-link` | Genera link WA precompilato |
| POST | `/prenotazioni/batch/reminder` | Invia reminder per domani (cron) |

---

# 10. Frontend — Componenti

## 10.1 Struttura file

```
frontend/src/pages/prenotazioni/
├── PrenotazioniMenu.jsx          -- entry point /prenotazioni
├── PrenotazioniNav.jsx           -- navigazione (Planning, Settimana, Tavoli, Impostazioni)
├── PrenotazioniPlanning.jsx      -- vista giornaliera principale
├── PrenotazioniSettimana.jsx     -- vista settimanale
├── PrenotazioniForm.jsx          -- form nuova/modifica prenotazione
├── PrenotazioniDettaglio.jsx     -- dettaglio espandibile nella riga
├── PrenotazioniImpostazioni.jsx  -- config: slot, capienza, template, layout
├── TavoliMappa.jsx               -- mappa visuale tavoli (Fase 2)
├── TavoliEditor.jsx              -- editor piantina (Fase 2, in Impostazioni)
└── components/
    ├── MiniCalendario.jsx        -- calendario mensile compatto
    ├── SlotPicker.jsx            -- selettore orario per form
    ├── ClienteAutocomplete.jsx   -- autocomplete con ricerca CRM
    ├── StatoBadge.jsx            -- badge colorato per stato
    ├── CanaleBadge.jsx           -- icona canale (TheFork, tel, WA...)
    └── TavoloChip.jsx            -- chip tavolo con colore stato
```

## 10.2 Navigazione

```
/prenotazioni                     → redirect a /prenotazioni/planning/oggi
/prenotazioni/planning/:data      → vista giornaliera
/prenotazioni/settimana/:data     → vista settimanale
/prenotazioni/tavoli              → mappa tavoli serale (Fase 2)
/prenotazioni/impostazioni        → configurazione
/prenotazioni/impostazioni/:section → sezione specifica (slot, tavoli, layout, notifiche)
```

## 10.3 Colore tema
- **Primario**: Indigo (`indigo-600`) — distinto da teal (CRM) e sky (CG)
- **Icona menu**: 📅 o 🗓️

---

# 11. Rischi e mitigazioni

| Rischio | Impatto | Mitigazione |
|---------|---------|-------------|
| Doppia gestione TFM + TRGB nella transizione | Confusione, prenotazioni perse | Fase 1 in parallelo a TFM, migrazione graduale |
| Widget spam/prenotazioni fake | Planning inquinato | CAPTCHA + rate limiting + stato REQUESTED |
| Layout sala cambia e mappa non aggiornata | Tavoli sbagliati | Layout salvabili, switch rapido, alert se layout vecchio |
| Staff non usa il sistema (troppo complesso) | Ritorno a carta | UI semplicissima, azioni minime, ottimizzata tablet |
| TheFork cambia export XLSX | Import rotto | Parser resiliente, alert su campi mancanti |
| Email vanno in spam | Cliente non riceve conferma | Configurazione SPF/DKIM su dominio, fallback WA |

---

# 12. Metriche di successo

Dopo 1 mese di utilizzo in produzione:
- **80%+ prenotazioni dirette** inserite da TRGB (non piu' da TFM)
- **Zero prenotazioni perse** nella transizione
- **Staff usa il planning** senza tornare all'agenda cartacea
- **Widget genera prenotazioni** (sostituzione Booking Module)
- **Tempo medio inserimento** prenotazione < 30 secondi

---

# 13. Note di implementazione

## Pattern da seguire
- Stesso pattern embedded dei moduli CRM (componenti con prop `embedded`)
- `SortTh` / `sortRows` per tabelle ordinabili
- Toast per feedback azioni
- `API_BASE` + `apiFetch()` per tutte le chiamate
- JWT con `Depends(get_current_user)` su endpoint protetti
- Endpoint pubblici (widget) SENZA auth ma con rate limiting

## Cose da NON fare
- NON creare un nuovo DB — tutto in `clienti.sqlite3`
- NON duplicare dati prenotazioni — stessa tabella `clienti_prenotazioni`
- NON complicare la mappa tavoli — SVG semplice, no Canvas/WebGL
- NON automatizzare WhatsApp senza valutare costi — iniziare con link manuali
