# Modulo Dipendenti — TRGB Gestionale

**Ultimo aggiornamento:** 2026-05-08 (consolidato modulo_dipendenti.md + modulo_dipendenti_v2.md)
**Stato:** Anagrafica + Turni operativi. Buste Paga / Presenze / Scadenze / Contratti / Costi → roadmap (vedi `roadmap.md` §D).
**Versione modulo (`versions.jsx`):** dipendenti v2.x (top-level)
**Sezione top-level:** `/dipendenti/*`
**Backend prefix:** `/dipendenti/*`
**Roadmap:** sezione `D.` di `docs/roadmap.md`
**Documenti correlati:** `modulo_dipendenti_turni.md` (Turni v2.0 design)

---

# 0. Indice

1. Panoramica e visione v2 (top-level)
2. Stato attuale vs roadmap
3. Struttura navigazione (`/dipendenti/*`)
4. Database — tabelle correnti + tabelle nuove (v2.x)
5. Sezioni del modulo (dettaglio)
6. Fasi implementative v2
7. Impatto su altri moduli
8. Note tecniche (PDF parsing, upload, cross-DB)

---

# 1. Panoramica e visione v2

Il modulo **Dipendenti** è stato promosso a **modulo top-level** (non più sotto Amministrazione). Gestisce il personale a 360°: anagrafica, buste paga, contratti, scadenze documenti, presenze, costi, dashboard.

**Stato pre-v2:** modulo sotto `/admin/dipendenti/*` con anagrafica + turni + costi. Allegati schema-only.

**Visione v2:** modulo di primo livello come Vini, Acquisti, Banca. Aggiunge:
- **Buste Paga** — import PDF cedolini con parsing automatico, generazione scadenze in CG Uscite
- **Presenze** — calendario giornaliero con tipi (presente, ferie, malattia, permesso, straordinario)
- **Scadenze documenti** — HACCP, sicurezza, visite mediche, permessi soggiorno con alert
- **Contratti** (futuro) — tipo, livello CCNL, RAL, allegati PDF
- **Dashboard costi** — costo personale vs ricavi, incidenza %, trend

---

# 2. Stato attuale vs roadmap

| Sezione | Stato | Versione |
|---------|-------|----------|
| Anagrafica | ✅ operativa | v1+ (CRUD completo) |
| Turni (v1 vecchio) | ✅ operativo | da migrare a v2 (vedi `modulo_dipendenti_turni.md`) |
| Costi (vecchio) | ✅ operativo | da rifare in dashboard v2.4 |
| Allegati anagrafica | ⏳ schema-only | endpoint da implementare (D.* roadmap) |
| Buste Paga | ⏳ TODO | v2.1 (priorità Alta) |
| Scadenze documenti | ⏳ TODO | v2.2 |
| Presenze | ⏳ TODO | v2.3 |
| Dashboard costi v2 | ⏳ TODO | v2.4 |
| Contratti | ⏳ TODO | v2.5 (Bassa priorità) |
| Allegati generici | ⏳ TODO | v2.6 |

**Note Marco (Batch 4 roadmap reorganization, 2026-05-07):** D.4, D.11, D.12, D.15, D.16 **eliminate** dalla roadmap (fuori scope o duplicate). D.3 mantenuta. Le altre voci D.x in `roadmap.md` §D restano.

---

# 3. Struttura navigazione

```
/dipendenti                        → Menu Hub (tile con le sezioni)
/dipendenti/anagrafica             → Lista + CRUD dipendenti
/dipendenti/buste-paga             → Import PDF, lista cedolini, generazione scadenze
/dipendenti/presenze               → Ferie, malattie, permessi, straordinari
/dipendenti/turni                  → Calendario turni v2 (vedi modulo_dipendenti_turni.md)
/dipendenti/scadenze               → Documenti con scadenza: HACCP, corsi, visite, permessi
/dipendenti/contratti              → Tipo contratto, date, allegati PDF (futuro)
/dipendenti/costi                  → Dashboard costo personale vs ricavi
```

L'attuale **Amministrazione** viene eliminato come tile separata. La gestione utenti (`ImpostazioniSistema`) si sposta come sezione accessibile dalla Home o da un ingranaggio nel header.

---

# 4. Database

## 4.1 DB dedicato

`app/data/dipendenti.sqlite3` — creato a runtime da `init_dipendenti_db()`.

> **TODO (D.* roadmap):** creare migrazione dedicata (`schema_migrations` tracciata) per `dipendenti.sqlite3`. Oggi schema runtime, schema drift potenziale dev↔prod (vedi `inventario_pulizia.md` §"Migrazioni unificate").

## 4.2 Tabelle esistenti (v1)

### `dipendenti`
Anagrafica completa: `codice`, `nome`, `cognome`, `ruolo`, `IBAN`, `indirizzo`, `data_nascita`, `data_assunzione`, `is_active`. Da estendere v2 con:
- `costo_orario REAL` — costo azienda orario
- `giorno_paga INTEGER DEFAULT 27` — giorno mese pagamento stipendio

### `turni_tipi`
Definizioni turno: `nome`, `ora_inizio`, `ora_fine`, `ore_lavoro`, `colore`. ⚠ La v2 dei turni cambia drasticamente lo schema (`reparti` di prima classe, slot variabili, colori dipendenti) — vedi `modulo_dipendenti_turni.md`.

### `turni_calendario`
Assegnazione turni: `dipendente_id`, `turno_tipo_id`, `data`, `note`. Anche questa cambia in v2 (matrice settimanale per reparto).

### `dipendenti_allegati`
Schema esiste ma nessun endpoint né frontend. Da attivare (sezione 5.6).

## 4.3 Nuove tabelle v2

### `buste_paga` — Cedolini importati da PDF (v2.1)

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
    pdf_filename    TEXT,
    pdf_path        TEXT,
    note            TEXT,
    importato_il    TEXT DEFAULT (datetime('now')),
    -- Collegamento scadenzario
    uscita_netto_id INTEGER,                    -- FK → cg_uscite (scadenza stipendio netto)
    -- Stato
    stato           TEXT DEFAULT 'IMPORTATO',   -- IMPORTATO, VERIFICATO, PAGATO
    UNIQUE(dipendente_id, mese, anno)
);
```

### `dipendenti_contratti` — Contratti (v2.5, schema predisposto)

```sql
CREATE TABLE IF NOT EXISTS dipendenti_contratti (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dipendente_id   INTEGER NOT NULL REFERENCES dipendenti(id),
    tipo            TEXT NOT NULL,              -- INDETERMINATO, DETERMINATO, APPRENDISTATO, STAGIONALE, COLLABORAZIONE
    livello         TEXT,                       -- livello CCNL (es. "4° livello")
    ccnl            TEXT DEFAULT 'TURISMO',
    data_inizio     TEXT NOT NULL,
    data_fine       TEXT,                       -- NULL = indeterminato
    data_prova_fine TEXT,
    ore_settimanali REAL DEFAULT 40,
    ral             REAL,                       -- retribuzione annua lorda
    pdf_filename    TEXT,
    pdf_path        TEXT,
    note            TEXT,
    attivo          INTEGER DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now'))
);
```

### `dipendenti_scadenze` — Documenti/certificazioni con scadenza (v2.2)

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
    ente_rilascio   TEXT,
    pdf_filename    TEXT,
    pdf_path        TEXT,
    stato           TEXT DEFAULT 'VALIDO',      -- VALIDO, IN_SCADENZA, SCADUTO
    alert_giorni    INTEGER DEFAULT 30,         -- giorni prima della scadenza per alert
    note            TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);
```

### `dipendenti_presenze` — Registro presenze/assenze (v2.3)

```sql
CREATE TABLE IF NOT EXISTS dipendenti_presenze (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dipendente_id   INTEGER NOT NULL REFERENCES dipendenti(id),
    data            TEXT NOT NULL,
    tipo            TEXT NOT NULL,              -- PRESENTE, FERIE, MALATTIA, PERMESSO,
                                                -- STRAORDINARIO, RIPOSO, INGIUSTIFICATA
    ore             REAL,
    turno_tipo_id   INTEGER REFERENCES turni_tipi(id),
    note            TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(dipendente_id, data)
);
```

---

# 5. Sezioni del modulo — Dettaglio

## 5.1 Anagrafica (esistente, miglioramenti v2)

**Stato:** CRUD completo, funzionante.

**Endpoint backend:**
| Metodo | Path | Funzione |
|--------|------|----------|
| GET | `/dipendenti/` | Lista (con filtri) |
| POST | `/dipendenti/` | Crea |
| PUT | `/dipendenti/{id}` | Aggiorna |
| DELETE | `/dipendenti/{id}` | Soft delete |

**Miglioramenti v2:**
- Aggiungere campi `costo_orario` e `giorno_paga`
- Card riassuntiva per dipendente: foto opzionale, ruolo, stato contratto, prossime scadenze
- Attivare endpoint per `dipendenti_allegati`

## 5.2 Buste Paga — v2.1 PRIORITÀ 1

**Flusso:**
1. Marco carica PDF cedolino ricevuto dal consulente
2. Sistema estrae dati con tabular extraction (`pdfplumber`)
3. Marco verifica/corregge in form di conferma
4. Conferma → salva in `buste_paga` + genera scadenza netto in `cg_uscite` (modulo Banca)

**Estrazione PDF — campi target:**
- Nome dipendente (per match automatico con anagrafica)
- Mese/anno di competenza
- Retribuzione lorda
- Netto in busta
- Contributi INPS
- Ritenuta IRPEF
- TFR maturato
- Ore lavorate e straordinario

**Integrazione Scadenzario (modulo Banca):**
- Netto dipendente → `cg_uscite` con:
  - `tipo_uscita = 'STIPENDIO'`
  - `fornitore_nome = "Stipendio - {nome cognome}"`
  - `data_scadenza = {anno}-{mese}-{giorno_paga del dipendente}`
  - `totale = netto`
  - `stato = 'DA_PAGARE'`

**UI:**
- Vista tabellare: lista cedolini per mese, filtro dipendente/periodo
- Upload: drag & drop PDF, anteprima dati estratti, conferma
- Dettaglio: visualizza PDF inline + dati estratti

## 5.3 Presenze e Assenze — v2.3

**Flusso:** calendario mensile, per ogni dipendente segna il tipo giornata.

**Vista:**
- Griglia mese: righe = dipendenti, colonne = giorni
- Colori per tipo: verde (presente), blu (ferie), arancione (malattia), viola (permesso), rosso (ingiustificata)
- Totali a destra: giorni presenti, ferie usate, malattie, permessi

**Integrazione turni:** se il turno è già assegnato nel calendario turni v2, la presenza viene pre-popolata come PRESENTE con le ore del turno.

> **Nota cross-modulo Turni v2:** la decisione del 2026-04-14 è stata di NON mettere ferie/malattia/permesso dentro Turni v2 — passano qui in Presenze v2.3. Workflow Marco: chi non compare nel foglio settimana = è a casa. Vedi `modulo_dipendenti_turni.md`.

## 5.4 Turni v2 (esistente con refactor v2 in corso)

Vedi documento dedicato: **`modulo_dipendenti_turni.md`** (33KB di dettaglio).

Riassunto:
- Foglio settimana stile Excel di Marco: righe = giorni lun-dom, colonne = slot servizio (PRANZO 1..N / CENA 1..N)
- Una matrice per ogni reparto (SALA, CUCINA), tab per passare da uno all'altro
- Tabella `reparti` di prima classe (seed SALA + CUCINA, estendibile)
- Slot per servizio variabile 2-6 (default 4)
- Stato `CHIAMATA` (asterisco "*" nel nome) per turno tentativo da confermare
- Colori dipendenti univoci (palette 14 tinte) — cella colorata col colore-dipendente
- Chiusura settimanale letta da `closures_config.json` (modulo Vendite/Selezioni)
- Pause staff (30 min pranzo + 30 cena) configurabili per reparto
- Copia settimana come feature killer (85% delle settimane è uguale alla precedente)
- Assenze NON in turni — passano a Presenze v2.3

Spostamento route da `/admin/dipendenti/turni` a `/dipendenti/turni`.

## 5.5 Scadenze Documenti — v2.2

**Tipi predefiniti (ristorazione):**
| Tipo | Scadenza tipica | Alert default |
|------|----------------|---------------|
| HACCP | Variabile (formazione) | 30gg |
| Sicurezza generale | 5 anni | 60gg |
| Sicurezza specifica (rischio medio) | 5 anni | 60gg |
| Antincendio | 5 anni | 60gg |
| Primo Soccorso | 3 anni | 60gg |
| Visita medica | 1-2 anni | 30gg |
| Permesso di soggiorno | Variabile | 90gg |

**UI:**
- Dashboard con semaforo: verde (ok), giallo (in scadenza entro N giorni), rosso (scaduto)
- Alert nel menu hub del modulo e nella Home (M.A notifiche)
- Upload PDF certificato associato

**Integrazione M.F Alert Engine:** checker dedicato `dipendenti_scadenze_imminenti` da implementare quando arriva v2.2.

## 5.6 Contratti — v2.5 (futuro, schema predisposto)

Non implementato subito. Si predispone:
- Tabella `dipendenti_contratti` (vedi §4.3)
- Possibilità di caricare PDF contratto dall'anagrafica
- Alert scadenza contratti determinati

## 5.7 Dashboard Costi — v2.4

**Metriche:**
- Costo personale mensile totale (somma netti + contributi + IRPEF)
- Costo per dipendente / per ruolo
- Incidenza % su ricavi (integrazione modulo Vendite/Selezioni)
- Trend 12 mesi
- Costo orario medio vs costo orario per ruolo

**Fonti dati:** `buste_paga` (dati reali), `dipendenti.costo_orario` (stima), `turni_calendario` (ore pianificate), `daily_closures` (per calcolo incidenza ricavi).

## 5.8 Allegati generici — v2.6 (Bassa priorità)

Tabella `dipendenti_allegati` esistente, schema OK ma senza endpoint. Da attivare con upload PDF generico (CV, documenti d'identità, ecc.).

---

# 6. Fasi implementative v2

| Fase | Cosa | Priorità | Stato |
|------|------|----------|-------|
| **v2.0** | Promozione a modulo top-level, nuovo menu hub, spostamento routes | Alta | ✅ FATTA |
| **v2.1** | Buste paga: upload PDF + estrazione + integrazione scadenzario | Alta | ⏳ |
| **v2.2** | Scadenze documenti: CRUD + semaforo + alert | Media | ⏳ |
| **v2.3** | Presenze: griglia mensile + totali | Media | ⏳ |
| **v2.4** | Dashboard costi: metriche + grafici | Media | ⏳ |
| **v2.5** | Contratti: schema + CRUD base + alert scadenza | Bassa | ⏳ |
| **v2.6** | Allegati: upload PDF generico per dipendente | Bassa | ⏳ |

Turni v2 procede in parallelo (vedi `modulo_dipendenti_turni.md`).

---

# 7. Impatto su altri moduli

- **Banca / CG Uscite:** l'import buste paga (v2.1) genera righe in `cg_uscite` con `tipo_uscita='STIPENDIO'`. Flusso: Dipendenti → Buste Paga → genera scadenza → appare nello Scadenzario.
- **Home:** tile "Amministrazione" rimossa. Nuova tile "Dipendenti". Gestione utenti (`ImpostazioniSistema`) accessibile da icona ingranaggio nel header globale.
- **`modules.json`:** rimuovere `admin`, aggiungere `dipendenti` e `impostazioni` (o inline nel header).
- **`App.jsx`:** nuove routes `/dipendenti/*`, rimuovere `/admin/dipendenti/*` (tranne redirect).
- **M.A Notifiche:** alert su scadenze documenti imminenti.
- **M.F Alert Engine:** checker `dipendenti_scadenze_imminenti`.
- **Vendite/Selezioni:** dashboard costi (v2.4) cross-query con `daily_closures` per incidenza %.

---

# 8. Note tecniche

- **DB dedicato:** `dipendenti.sqlite3` rimane il database del modulo. Le nuove tabelle vanno qui (non in `foodcost.db`).
- **PDF parsing:** usiamo `pdfplumber` (Python) per estrarre tabelle dai cedolini. Il formato varia per consulente — prevediamo un sistema di template/regole configurabili.
- **Upload PDF:** i file vanno salvati in `app/data/uploads/dipendenti/{dipendente_id}/` con naming:
  - `cedolino_{anno}_{mese}.pdf`
  - `contratto_{id}.pdf`
  - `scadenza_{tipo}_{id}.pdf`
- **Cross-DB:** le query che incrociano `dipendenti.sqlite3` con `foodcost.db` (per `cg_uscite`) usano `ATTACH DATABASE` o due connessioni separate con join in Python.
- **Pattern WAL:** da applicare a `dipendenti.sqlite3` (oggi non WAL — voce TODO in `inventario_pulizia.md` §"WAL mode").
