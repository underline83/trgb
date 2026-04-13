# Modulo Preventivi — Specifica Tecnica
**Creato:** 2026-04-13 (sessione 31)
**Roadmap:** sezione 10 (10.1–10.4)
**Collegato a:** Clienti/CRM, Prenotazioni

---

## Obiettivo

Aggregare i preventivi per eventi privati, cene aziendali e gruppi oggi sparsi tra email, WhatsApp e telefono. Tracciare stato, versioni, importi. Collegare al CRM e alle prenotazioni.

## Contesto d'uso

- Marco riceve richieste via WA/email/telefono (cene aziendali, compleanni, gruppi)
- Quota un menu fisso a persona, a volte con voci aggiuntive (vini, allestimento, torta)
- Oggi risponde "a corpo" nel messaggio — nessun tracciamento
- In mesi caldi (dicembre) fino a 20 preventivi in ballo contemporaneamente
- Il preventivo spesso cambia: cliente chiede modifiche, Marco rimanda versione aggiornata
- Quando confermato → diventa una prenotazione con data/pax bloccati
- Lo staff deve sapere dei preventivi confermati (usa mattone M.A notifiche)

## Fasi implementazione

| Fase | Cosa | Effort | Dipendenze |
|------|------|--------|------------|
| A (10.1) | DB + CRUD backend + lista/scheda frontend | M | nessuna |
| B (10.2) | Template riutilizzabili + righe editabili + totale live | S | 10.1 |
| C (10.3) | Generazione PDF brandizzato + invio WA/email | M | M.B PDF brand + M.C WA + M.D Email |
| D (10.4) | Versioning + collegamento prenotazione + badge menu | S | M.A notifiche |

---

## Database — tabelle in clienti.sqlite3

### clienti_preventivi (testata)

```sql
CREATE TABLE IF NOT EXISTS clienti_preventivi (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    numero            TEXT NOT NULL,             -- progressivo annuale: PRE-2026-001
    cliente_id        INTEGER,                   -- FK clienti (nullable per preventivi senza cliente CRM)
    
    -- Evento
    titolo            TEXT NOT NULL,              -- es. "Cena aziendale Natale Rossi"
    tipo              TEXT NOT NULL DEFAULT 'cena_privata',  -- cena_privata|aperitivo|degustazione|catering|altro
    data_evento       TEXT,                       -- YYYY-MM-DD
    ora_evento        TEXT,                       -- HH:MM
    n_persone         INTEGER,
    luogo             TEXT DEFAULT 'sala',        -- sala|terrazza|esterno|altro
    
    -- Stato
    stato             TEXT NOT NULL DEFAULT 'bozza',  -- bozza|inviato|in_attesa|confermato|prenotato|completato|fatturato|rifiutato|scaduto
    versione          INTEGER NOT NULL DEFAULT 1,
    
    -- Note
    note_interne      TEXT,                       -- visibili solo a staff
    note_cliente      TEXT,                       -- vanno nel PDF/messaggio
    condizioni        TEXT,                       -- acconto, conferma entro, cancellazione
    
    -- Scadenza
    scadenza_conferma TEXT,                       -- data entro cui il cliente deve rispondere
    
    -- Canale origine
    canale            TEXT DEFAULT 'telefono',    -- whatsapp|email|telefono|di_persona|sito
    
    -- Link prenotazione (quando confermato)
    prenotazione_id   INTEGER,                    -- FK clienti_prenotazioni (nullable)
    
    -- Template usato come base
    template_id       INTEGER,                    -- FK clienti_preventivi_template (nullable)
    
    -- Totale (calcolato dal backend come somma righe)
    totale_calcolato  REAL DEFAULT 0,
    
    -- Meta
    creato_da         TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    
    FOREIGN KEY (cliente_id) REFERENCES clienti(id) ON DELETE SET NULL
);
```

### clienti_preventivi_righe (voci del preventivo)

```sql
CREATE TABLE IF NOT EXISTS clienti_preventivi_righe (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    preventivo_id   INTEGER NOT NULL,
    ordine          INTEGER NOT NULL DEFAULT 0,
    
    descrizione     TEXT NOT NULL,          -- es. "Menu degustazione 5 portate"
    qta             REAL DEFAULT 1,
    prezzo_unitario REAL DEFAULT 0,
    totale_riga     REAL DEFAULT 0,         -- qta * prezzo_unitario (calcolato)
    
    tipo_riga       TEXT DEFAULT 'voce',    -- voce|sconto|supplemento|nota
    
    FOREIGN KEY (preventivo_id) REFERENCES clienti_preventivi(id) ON DELETE CASCADE
);
```

### clienti_preventivi_template (menu riutilizzabili)

```sql
CREATE TABLE IF NOT EXISTS clienti_preventivi_template (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nome            TEXT NOT NULL,           -- es. "Degustazione 5 portate"
    tipo            TEXT DEFAULT 'cena_privata',
    righe_json      TEXT,                    -- JSON array di righe [{descrizione, qta, prezzo_unitario, tipo_riga}]
    condizioni_default TEXT,                 -- testo condizioni precompilato
    attivo          INTEGER DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

### Indici

```sql
CREATE INDEX IF NOT EXISTS idx_prev_cliente ON clienti_preventivi(cliente_id);
CREATE INDEX IF NOT EXISTS idx_prev_stato ON clienti_preventivi(stato);
CREATE INDEX IF NOT EXISTS idx_prev_data ON clienti_preventivi(data_evento);
CREATE INDEX IF NOT EXISTS idx_prev_numero ON clienti_preventivi(numero);
CREATE INDEX IF NOT EXISTS idx_prev_righe_prev ON clienti_preventivi_righe(preventivo_id);
```

---

## API Endpoint

### CRUD Preventivi

| Metodo | Path | Descrizione | Ruoli |
|--------|------|-------------|-------|
| GET | /preventivi | Lista con filtri (stato, mese, cliente, tipo) + paginazione | admin, sala |
| GET | /preventivi/stats | Contatori: in_ballo, confermati_mese, valore_totale | admin |
| GET | /preventivi/{id} | Dettaglio con righe | admin, sala |
| POST | /preventivi | Crea nuovo (con righe) | admin |
| PUT | /preventivi/{id} | Aggiorna testata + righe | admin |
| DELETE | /preventivi/{id} | Elimina | admin |
| POST | /preventivi/{id}/stato | Cambia stato (con logica transizioni) | admin |
| POST | /preventivi/{id}/duplica | Duplica preventivo come bozza | admin |

### Template

| Metodo | Path | Descrizione | Ruoli |
|--------|------|-------------|-------|
| GET | /preventivi/template | Lista template attivi | admin |
| POST | /preventivi/template | Crea template | admin |
| PUT | /preventivi/template/{id} | Modifica template | admin |
| DELETE | /preventivi/template/{id} | Disattiva template | admin |

### Numero progressivo

Formato: `PRE-{anno}-{NNN}` (es. PRE-2026-001). Il backend calcola il prossimo numero disponibile per l'anno corrente.

---

## Transizioni di stato

```
bozza → inviato → in_attesa → confermato → prenotato → completato → fatturato
                            ↘ rifiutato
                            ↘ scaduto (automatico se scadenza_conferma superata)
```

- **bozza → inviato**: Marco ha mandato il preventivo al cliente
- **inviato → in_attesa**: cliente ha visto, sta decidendo
- **in_attesa → confermato**: cliente ha accettato
- **confermato → prenotato**: Marco ha creato la prenotazione collegata
- **prenotato → completato**: evento avvenuto
- **completato → fatturato**: fattura emessa
- **in_attesa → rifiutato**: cliente ha rifiutato
- **in_attesa → scaduto**: scadenza_conferma superata senza risposta

---

## Frontend — Pagine

### 1. Lista Preventivi (/clienti/preventivi)

- Filtri: stato, mese/anno, cliente, tipo
- Colonne: numero, titolo, cliente, data_evento, pax, totale, stato, scadenza
- Badge colorati per stato
- Contatori in alto: tot in ballo, tot confermati mese, valore totale mese
- Colonna "scade tra X giorni" evidenziata se < 3 giorni
- Azioni rapide: cambia stato, duplica

### 2. Scheda Preventivo (/clienti/preventivi/:id)

- **Header**: numero + stato badge + titolo
- **Form testata**: cliente (autocomplete CRM), tipo, data/ora, pax, luogo, canale, scadenza
- **Griglia righe**: tabella editabile con descrizione, qta, prezzo, totale. Aggiungi/rimuovi/riordina. Tipi: voce, sconto, supplemento, nota
- **Totale live**: somma righe aggiornata in tempo reale
- **Note**: tab note interne (staff) e note cliente
- **Condizioni**: textarea con testo default da template
- **Sidebar azioni**: Salva bozza, Cambia stato, Duplica, (futuro: Genera PDF, Invia WA, Invia Email)
- **Crea da template**: select template → precompila righe + condizioni

### 3. Tab nella scheda cliente

- In ClientiScheda.jsx, nuovo tab "Preventivi" accanto a "Prenotazioni"
- Mostra storico preventivi per quel cliente con importi e stati

### 4. Template (in Impostazioni CRM)

- Sezione in ClientiImpostazioni.jsx
- Lista template, crea/modifica con righe precompilate e condizioni default

---

## Colori e UX

- Colore modulo: **indigo** (coerente con prenotazioni, stesso ecosistema clienti)
- Badge stati: bozza (gray), inviato (blue), in_attesa (amber), confermato (green), prenotato (indigo), completato (emerald), fatturato (neutral), rifiutato (red), scaduto (orange)
- Touch target: minimo 44pt (regola iPad)
- Sfondo: `bg-brand-cream`

---

## Note per implementazione

- Le righe vengono salvate/aggiornate in blocco (array nel body POST/PUT), non una alla volta
- Il totale viene ricalcolato server-side ad ogni salvataggio (non fidarsi del frontend)
- Il numero progressivo e' generato dal backend al momento della creazione
- I template salvano le righe come JSON per semplicita' (non tabella separata)
- La Fase D (versioning) non serve subito — il campo `versione` c'e' nel DB, la logica viene dopo
