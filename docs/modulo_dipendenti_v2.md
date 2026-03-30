# Modulo Dipendenti v2.0 — Design Document

> Modulo top-level (non più sotto Amministrazione). Gestisce il personale a 360°:
> anagrafica, buste paga, contratti, scadenze documenti, presenze, costi, dashboard.

## 1. Struttura Navigazione

Il modulo diventa **primo livello** nella Home, come Vini, Acquisti, Banca ecc.

```
/dipendenti                        → Menu Hub (tile con le sezioni)
/dipendenti/anagrafica             → Lista + CRUD dipendenti
/dipendenti/buste-paga             → Import PDF, lista cedolini, generazione scadenze
/dipendenti/presenze               → Ferie, malattie, permessi, straordinari
/dipendenti/turni                  → Calendario turni (già esistente, da spostare)
/dipendenti/scadenze               → Documenti con scadenza: HACCP, corsi, visite, permessi
/dipendenti/contratti              → Tipo contratto, date, allegati PDF (futuro)
/dipendenti/costi                  → Dashboard costo personale vs ricavi
```

L'attuale `Amministrazione` viene eliminato. La gestione utenti (ImpostazioniSistema)
si sposta come sezione accessibile dalla Home o da un ingranaggio nel header.


## 2. Database

### 2.1 Tabelle esistenti (da mantenere, in dipendenti.sqlite3)

- `dipendenti` — anagrafica (già completa: codice, nome, cognome, ruolo, IBAN, indirizzo, ecc.)
- `turni_tipi` — definizioni turni
- `turni_calendario` — assegnazione turni
- `dipendenti_allegati` — schema esiste ma nessun endpoint (da attivare)

### 2.2 Nuove tabelle

#### `buste_paga` — Cedolini importati da PDF
```sql
CREATE TABLE IF NOT EXISTS buste_paga (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dipendente_id   INTEGER NOT NULL REFERENCES dipendenti(id),
    mese            INTEGER NOT NULL,           -- 1-12
    anno            INTEGER NOT NULL,
    -- Importi estratti dal PDF
    lordo           REAL,
    netto           REAL NOT NULL,              -- importo da pagare al dipendente
    contributi_inps REAL,                       -- quota INPS dipendente + azienda
    irpef           REAL,                       -- ritenuta IRPEF
    addizionali     REAL,                       -- addizionali regionali/comunali
    tfr_maturato    REAL,                       -- TFR del mese
    ore_lavorate    REAL,
    ore_straordinario REAL,
    -- Metadati
    pdf_filename    TEXT,                       -- nome file PDF originale
    pdf_path        TEXT,                       -- path relativo su disco
    note            TEXT,
    importato_il    TEXT DEFAULT (datetime('now')),
    -- Collegamento scadenzario
    uscita_netto_id INTEGER,                    -- FK → cg_uscite (scadenza stipendio netto)
    -- Stato
    stato           TEXT DEFAULT 'IMPORTATO',   -- IMPORTATO, VERIFICATO, PAGATO
    UNIQUE(dipendente_id, mese, anno)
);
```

#### `dipendenti_contratti` — Contratti (futuro, predisponiamo schema)
```sql
CREATE TABLE IF NOT EXISTS dipendenti_contratti (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dipendente_id   INTEGER NOT NULL REFERENCES dipendenti(id),
    tipo            TEXT NOT NULL,              -- INDETERMINATO, DETERMINATO, APPRENDISTATO, STAGIONALE, COLLABORAZIONE
    livello         TEXT,                       -- livello CCNL (es. "4° livello")
    ccnl            TEXT DEFAULT 'TURISMO',     -- contratto collettivo
    data_inizio     TEXT NOT NULL,
    data_fine       TEXT,                       -- NULL = indeterminato
    data_prova_fine TEXT,                       -- fine periodo di prova
    ore_settimanali REAL DEFAULT 40,
    ral             REAL,                       -- retribuzione annua lorda
    pdf_filename    TEXT,
    pdf_path        TEXT,
    note            TEXT,
    attivo          INTEGER DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now'))
);
```

#### `dipendenti_scadenze` — Documenti/certificazioni con scadenza
```sql
CREATE TABLE IF NOT EXISTS dipendenti_scadenze (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dipendente_id   INTEGER NOT NULL REFERENCES dipendenti(id),
    tipo            TEXT NOT NULL,              -- HACCP, SICUREZZA_GENERALE, SICUREZZA_SPECIFICA,
                                                -- VISITA_MEDICA, PERMESSO_SOGGIORNO, ANTINCENDIO,
                                                -- PRIMO_SOCCORSO, ALTRO
    descrizione     TEXT,
    data_rilascio   TEXT,
    data_scadenza   TEXT NOT NULL,
    ente_rilascio   TEXT,                       -- chi ha rilasciato il documento
    pdf_filename    TEXT,
    pdf_path        TEXT,
    stato           TEXT DEFAULT 'VALIDO',      -- VALIDO, IN_SCADENZA, SCADUTO
    alert_giorni    INTEGER DEFAULT 30,         -- giorni prima della scadenza per alert
    note            TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);
```

#### `dipendenti_presenze` — Registro presenze/assenze
```sql
CREATE TABLE IF NOT EXISTS dipendenti_presenze (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dipendente_id   INTEGER NOT NULL REFERENCES dipendenti(id),
    data            TEXT NOT NULL,
    tipo            TEXT NOT NULL,              -- PRESENTE, FERIE, MALATTIA, PERMESSO,
                                                -- STRAORDINARIO, RIPOSO, INGIUSTIFICATA
    ore             REAL,                       -- ore lavorate/assenza
    turno_tipo_id   INTEGER REFERENCES turni_tipi(id),
    note            TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(dipendente_id, data)
);
```

### 2.3 Modifica a tabelle esistenti

- `dipendenti`: aggiungere colonne per contratto base:
  - `costo_orario REAL` — costo azienda orario (calcolato o manuale)
  - `giorno_paga INTEGER DEFAULT 27` — giorno del mese in cui viene pagato lo stipendio


## 3. Sezioni del modulo — Dettaglio

### 3.1 Anagrafica (già esistente, miglioramenti)

**Stato attuale**: CRUD completo, funzionante.

**Miglioramenti previsti**:
- Aggiungere campi `costo_orario` e `giorno_paga`
- Card riassuntiva per ogni dipendente (foto opzionale, ruolo, stato contratto, prossime scadenze)
- Attivare endpoint per allegati (`dipendenti_allegati`)

### 3.2 Buste Paga — PRIORITÀ 1

**Flusso**:
1. Marco carica il PDF del cedolino ricevuto dal consulente
2. Il sistema estrae i dati con parsing del PDF (tabular extraction con pdfplumber)
3. Marco verifica/corregge i dati estratti in un form di conferma
4. Al conferma: salva in `buste_paga` + genera scadenza netto in `cg_uscite`

**Estrazione PDF cedolino** — Campi target:
- Nome dipendente (per match automatico con anagrafica)
- Mese/anno di competenza
- Retribuzione lorda
- Netto in busta
- Contributi INPS
- Ritenuta IRPEF
- TFR maturato
- Ore lavorate e straordinario

**Integrazione Scadenzario**:
- Netto dipendente → `cg_uscite` con:
  - `tipo_uscita = 'STIPENDIO'`
  - `fornitore_nome = "Stipendio - {nome cognome}"`
  - `data_scadenza = {anno}-{mese}-{giorno_paga del dipendente}`
  - `totale = netto`
  - `stato = 'DA_PAGARE'`

**UI**:
- Vista tabellare: lista cedolini per mese, filtro dipendente/periodo
- Upload: drag & drop PDF, anteprima dati estratti, conferma
- Dettaglio: visualizza PDF inline + dati estratti

### 3.3 Presenze e Assenze

**Flusso**: calendario mensile, per ogni dipendente segna il tipo giornata.

**Vista**:
- Griglia mese: righe = dipendenti, colonne = giorni
- Colori per tipo: verde (presente), blu (ferie), arancione (malattia), viola (permesso), rosso (ingiustificata)
- Totali a destra: giorni presenti, ferie usate, malattie, permessi

**Integrazione turni**: se il turno è già assegnato nel calendario turni, la presenza
viene pre-popolata come PRESENTE con le ore del turno.

### 3.4 Turni (già esistente)

Spostamento da `/admin/dipendenti/turni` a `/dipendenti/turni`. Nessuna modifica funzionale.

### 3.5 Scadenze Documenti

**Tipi predefiniti** (ristorazione):
| Tipo | Scadenza tipica | Alert |
|------|----------------|-------|
| HACCP | Variabile (formazione) | 30gg |
| Sicurezza generale | 5 anni | 60gg |
| Sicurezza specifica (rischio medio) | 5 anni | 60gg |
| Antincendio | 5 anni | 60gg |
| Primo Soccorso | 3 anni | 60gg |
| Visita medica | 1-2 anni | 30gg |
| Permesso di soggiorno | Variabile | 90gg |

**UI**:
- Dashboard con semaforo: verde (ok), giallo (in scadenza entro N giorni), rosso (scaduto)
- Alert nel menu hub del modulo e nella Home
- Upload PDF certificato associato

### 3.6 Contratti (futuro — solo schema)

Non implementiamo subito. Predisponiamo:
- Tabella DB
- Possibilità di caricare PDF contratto dall'anagrafica
- Alert scadenza contratti determinati

### 3.7 Dashboard Costi

**Metriche**:
- Costo personale mensile totale (somma netti + contributi + IRPEF)
- Costo per dipendente / per ruolo
- Incidenza % su ricavi (integrazione con modulo Vendite)
- Trend 12 mesi
- Costo orario medio vs costo orario per ruolo

**Fonti dati**: `buste_paga` (dati reali), `dipendenti.costo_orario` (stima),
`turni_calendario` (ore pianificate), vendite (per calcolo incidenza).


## 4. Roadmap implementazione

| Fase | Cosa | Priorità |
|------|------|----------|
| **v2.0** | Promozione a modulo top-level, nuovo menu hub, spostamento routes | Alta |
| **v2.1** | Buste paga: upload PDF + estrazione + integrazione scadenzario | Alta |
| **v2.2** | Scadenze documenti: CRUD + semaforo + alert | Media |
| **v2.3** | Presenze: griglia mensile + totali | Media |
| **v2.4** | Dashboard costi: metriche + grafici | Media |
| **v2.5** | Contratti: schema + CRUD base + alert scadenza | Bassa |
| **v2.6** | Allegati: upload PDF generico per dipendente | Bassa |


## 5. Impatto su altri moduli

- **Controllo Gestione**: l'import buste paga genera righe in `cg_uscite` (tipo STIPENDIO).
  Il flusso è: Dipendenti → Buste Paga → genera scadenza → appare nello Scadenzario.
- **Home**: tile "Amministrazione" → rimossa. Nuova tile "Dipendenti".
  Gestione utenti (ImpostazioniSistema) diventa accessibile da icona ingranaggio nel header globale.
- **modules.json**: rimuovere `admin`, aggiungere `dipendenti` e `impostazioni` (o inline nel header).
- **App.jsx**: nuove routes `/dipendenti/*`, rimuovere `/admin/dipendenti/*`.


## 6. Note tecniche

- **DB**: `dipendenti.sqlite3` rimane il database dedicato. Le nuove tabelle vanno qui.
- **PDF parsing**: usiamo `pdfplumber` (Python) per estrarre tabelle dai cedolini.
  Il formato varia per consulente — prevediamo un sistema di template/regole configurabili.
- **Upload PDF**: i file vanno salvati in `app/data/uploads/dipendenti/{dipendente_id}/`
  con naming: `cedolino_{anno}_{mese}.pdf`, `contratto_{id}.pdf`, `scadenza_{tipo}_{id}.pdf`.
- **Cross-DB**: le query che incrociano `dipendenti.sqlite3` con `foodcost.db` (per cg_uscite)
  usano ATTACH DATABASE o due connessioni separate con join in Python.
