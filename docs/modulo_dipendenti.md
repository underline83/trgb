# Modulo Dipendenti — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03
> **Vedi anche:** [modulo_dipendenti_turni.md](modulo_dipendenti_turni.md) (Turni v2), [modulo_intermittenti.md](modulo_intermittenti.md) (chiamate UNI)

**Stato:** operativi Anagrafica (con multi-reparto), Turni v2, Buste Paga (import LUL + ELAB + F24), Scadenze documenti, Costi consuntivi, Allegati, Intermittenti. NON implementati: Presenze (griglia mensile) e Contratti — solo schema DB predisposto.
**Versione modulo (`versions.jsx`):** dipendenti v2.31 (2026-08-03)
**Sezione top-level:** `/dipendenti/*`
**Backend:** 4 router — `dipendenti.py` (prefix `/dipendenti`), `turni_router.py` (prefix `/turni`), `reparti.py` (prefix `/reparti`), `intermittenti_router.py` (prefix `/intermittenti`). Tutti JWT.
**Roadmap:** sezione `D.` di [roadmap.md](roadmap.md)

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

| Sezione | Stato | Note |
|---------|-------|------|
| Anagrafica | ✅ operativa | CRUD completo, codice auto `DIPNNN`, flag intermittente (mig 156/161), multi-reparto (mig 162) |
| Turni v2 (Foglio Settimana) | ✅ operativo | fasi 0-3 e 5-11 fatte, vedi `modulo_dipendenti_turni.md`. Il vecchio Turni v1 sopravvive su `/dipendenti/turni-legacy` |
| Buste Paga | ✅ operativa | import LUL 2-step + ELAB/F24 (G.3 Fase E) + inserimento manuale, scadenze in CG |
| Scadenze documenti | ✅ operativa | CRUD + semaforo + checker M.F `dipendenti_scadenze` (`alert_engine.py:301`) |
| Costi consuntivi | ✅ operativa | `GET /dipendenti/costi-mensili` (ELAB + F24 + crosscheck DM10), UI `DipendentiCosti.jsx` v2.0 |
| Allegati anagrafica | ✅ operativi | upload/lista/download/delete (`dipendenti.py:2410-2548`) |
| Intermittenti (UNI) | ✅ operativa | vedi `modulo_intermittenti.md` |
| Assenze (ferie/malattia/permesso) | ✅ operative | dentro Turni: tabella `assenze` (mig 083), CRUD `/turni/assenze/` — NON è il modulo Presenze pieno |
| Presenze (griglia mensile v2.3) | ⏳ schema-only | tabella `dipendenti_presenze` esiste, nessun endpoint/pagina |
| Contratti | ⏳ schema-only | tabella `dipendenti_contratti` esiste, nessun endpoint/pagina |

**Note Marco (Batch 4 roadmap reorganization, 2026-05-07):** D.4, D.11, D.12, D.15, D.16 **eliminate** dalla roadmap (fuori scope o duplicate). D.3 mantenuta. Le altre voci D.x in `roadmap.md` §D restano.

---

# 3. Struttura navigazione (reale, da `App.jsx:428-456`)

```
/dipendenti                        → ModuleRedirect alla prima sezione permessa (dashboard → turni → …)
/dipendenti/dashboard              → DashboardDipendenti (KPI da /dipendenti/, /scadenze, /buste-paga)
/dipendenti/anagrafica             → Lista + CRUD dipendenti (DipendentiAnagrafica v2.8)
/dipendenti/buste-paga             → Import PDF LUL/ELAB/F24, lista cedolini, scadenze (DipendentiBustePaga v2.3)
/dipendenti/turni                  → Foglio Settimana v2 (FoglioSettimana v1.11, vedi modulo_dipendenti_turni.md)
/dipendenti/turni/mese             → Vista mensile 6×7 (VistaMensile)
/dipendenti/turni/dipendente       → Timeline per dipendente (PerDipendente)
/dipendenti/turni-legacy           → Vecchia griglia turni v1 (DipendentiTurni, ancora raggiungibile)
/dipendenti/intermittenti          → Comunicazione chiamate UNI (Intermittenti.jsx)
/dipendenti/scadenze               → Documenti con scadenza: HACCP, corsi, visite, permessi
/dipendenti/costi                  → Costi mensili consuntivi ELAB + F24 (DipendentiCosti)
/dipendenti/reparti                → CRUD reparti (GestioneReparti)
/dipendenti/impostazioni           → Impostazioni modulo (sezioni: Reparti, Stipendi, Stato import paghe, Intermittenti; previste ma non pronte: Soglie CCNL, Template WA)
/miei-turni                        → Timeline self-service dell'utente loggato (MieiTurni, fuori dal guard modulo)
/admin/dipendenti/*                → redirect a /dipendenti
```

Il "menu hub" a tile previsto all'inizio è stato eliminato (sessione 39): la navigazione è la tab-bar `DipendentiNav.jsx` (Dashboard, Anagrafica, Buste Paga, Turni, Intermittenti, Scadenze, Costi, Impostazioni). Le route `/dipendenti/presenze` e `/dipendenti/contratti` NON esistono. La vecchia tile Amministrazione è stata eliminata come previsto; la gestione utenti vive in `ImpostazioniSistema` (`/impostazioni`).

---

# 4. Database

## 4.1 DB dedicato

`locali/<id>/data/dipendenti.sqlite3` (path tenant-aware da R6.5, via `locale_data_path`) — schema base creato a runtime da `init_dipendenti_db()` (`app/models/dipendenti_db.py`), esteso dalle migrazioni numerate che lavorano cross-DB (071, 072, 073, 077, 081, 083, 118, 132, 134, 156, 161, 162). WAL + busy_timeout attivi su ogni connessione (`get_dipendenti_conn`, fix sessione 52).

## 4.2 Tabelle correnti

### `dipendenti`
Anagrafica: `codice` (UNIQUE, auto `DIPNNN` al create), `nome`, `cognome`, `ruolo`, `telefono`, `email`, indirizzo (via/cap/città/provincia/paese), `iban`, `nickname` (mig 081, usato nelle stampe turni), `note`, `attivo`. Estensioni:
- `costo_orario REAL`, `giorno_paga INTEGER DEFAULT 27` (il default operativo però è il setting `giorno_pagamento_stipendi_default` = 15, mig 118)
- `codice_fiscale`, `data_nascita`, `tipo_rapporto`, `livello`, `qualifica` (popolati dall'import LUL)
- `reparto_id` (FK reparti, principale), `colore` HEX univoco, `a_chiamata` (mig 073: extra pagato a ore)
- `is_amministratore` (mig 134, per il CE: categoria AMMINISTRATORI vs STAFF)
- `intermittente`, `codice_comunicazione` (mig 156; travaso da `trasmissione_telematica` con mig 161 — la colonna vecchia resta nel DB, non più letta)

### `turni_tipi`
`codice` (UNIQUE), `nome`, `ruolo` (= `reparti.codice`: è così che un turno "sa" il suo reparto), `colore_bg/testo`, `ora_inizio/fine`, `ordine`, `attivo` + colonne v2: `categoria` (LAVORO/RIPOSO/ASSENZA, mai seedate le ultime due), `servizio` (PRANZO/CENA/NULL), `ore_lavoro`, `icona`.

### `turni_calendario`
`dipendente_id`, `turno_tipo_id`, `data`, `ora_inizio/fine` (override), `stato` (CONFERMATO / OPZIONALE / ANNULLATO — il vecchio CHIAMATA è stato rinominato OPZIONALE con mig 073), `note` + colonne v2: `ore_effettive`, `origine` (MANUALE/COPIA/TEMPLATE), `origine_ref_id`, `slot_index` (mig 072, posizione colonna nel foglio).

### `reparti` (mig 071)
`codice` UNIQUE, `nome`, `icona`, `colore`, `ordine`, `attivo`, orari standard `pranzo_inizio/fine` + `cena_inizio/fine`, `pausa_pranzo_min`/`pausa_cena_min` (default 30/30). Seed SALA + CUCINA.

### `dipendenti_reparti` (mig 162)
Reparti AGGIUNTIVI oltre al principale: PK `(dipendente_id, reparto_id)`. Vedi §Multi-reparto in `modulo_dipendenti_turni.md`.

### `assenze` (mig 083, sessione 39)
`dipendente_id` + `data` (UNIQUE), `tipo` FERIE/MALATTIA/PERMESSO, `note`. Gestite dai turni (`/turni/assenze/`), mostrate nel Foglio Settimana.

### `dipendenti_allegati`
Attiva: endpoint upload/lista/download/delete in `dipendenti.py` (§5.8). File in dir tenant-aware `uploads/documenti_dipendenti/<dipendente_id>/` (fallback legacy `app/data/documenti_dipendenti/`).

### `dipendenti_settings` (mig 118 + 156)
Chiavi/valori del modulo: `giorno_pagamento_stipendi_default` (15) + i 5 parametri `uni_*` degli intermittenti.

### `dipendenti_costo_consuntivo` (mig 132, G.3 Fase E)
Una riga per (anno, mese, matricola) dall'ELAB del consulente: ore, lordo, contributi, ratei, TFR, costo totale + riga sintetica `AZIENDA` con l'INAIL del mese. UNIQUE (anno, mese, matricola).

### `dipendenti_uni_comunicazioni` + `dipendenti_uni_comunicazioni_righe` (mig 156)
Registro invii UNI-Intermittenti — vedi `modulo_intermittenti.md`.

### `turni_template` + `turni_template_righe` (mig 071 + 077)
Template settimana tipo — vedi `modulo_dipendenti_turni.md` Fase 10.

> Nota cross-DB: `f24_versamenti` (versamenti F24 importati dai PDF) vive in **foodcost.db**, non in dipendenti.sqlite3 (mig 132).

### `buste_paga` — Cedolini importati (ATTIVA, v2.1 fatta)

Schema come sotto + colonna `fonte TEXT DEFAULT 'MANUALE'` ('PDF' per import LUL).

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

### `dipendenti_scadenze` — Documenti/certificazioni con scadenza (ATTIVA, v2.2 fatta)

Campi: `dipendente_id`, `tipo` (HACCP, SICUREZZA_GENERALE, SICUREZZA_SPECIFICA, ANTINCENDIO, PRIMO_SOCCORSO, VISITA_MEDICA, PERMESSO_SOGGIORNO, ALTRO), `descrizione`, `data_rilascio`, `data_scadenza`, `ente_rilascio`, `pdf_filename/path` (non usati dagli endpoint attuali), `stato`, `alert_giorni` (default per tipo, es. HACCP 30, sicurezza 60, permesso soggiorno 90), `note`. Lo stato VALIDO/IN_SCADENZA/SCADUTO è **calcolato dinamicamente** in lettura (`stato_calc`), non dal campo `stato`.

## 4.3 Tabelle predisposte ma NON attive (schema-only)

### `dipendenti_contratti` — Contratti (v2.5, schema predisposto, nessun endpoint)

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

### `dipendenti_presenze` — Registro presenze/assenze (v2.3, schema predisposto, nessun endpoint — le assenze reali stanno in `assenze`, §4.2)

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

## 5.1 Anagrafica

**Stato:** CRUD completo, funzionante (`app/routers/dipendenti.py`).

**Endpoint backend (tutti JWT):**
| Metodo | Path | Funzione |
|--------|------|----------|
| GET | `/dipendenti/` | Lista (query `include_inactive`), include `reparti_extra[]` |
| POST | `/dipendenti/` | Crea — se `codice` vuoto lo genera il backend come progressivo `DIPNNN` (sessione 40) |
| PUT | `/dipendenti/{id}` | Aggiorna — `codice_fiscale` e `codice_comunicazione` con `COALESCE(?, colonna)`: un salvataggio che non li porta non li cancella |
| DELETE | `/dipendenti/{id}` | Soft delete (`attivo=0` + `colore=NULL` per liberare la tinta) |
| GET | `/dipendenti/settings/` | Tutti i settings del modulo come dict |
| PUT | `/dipendenti/settings/{key}` | Upsert di un setting (body `{value}`) |

Il form anagrafica (`DipendentiAnagrafica.jsx`) gestisce anche: reparto principale + reparti extra (checkbox, mig 162), colore, `a_chiamata`, `is_amministratore`, flag `intermittente` + CF + codice comunicazione (unico scrittore di questi campi, vedi `modulo_intermittenti.md` §2-bis), upload documenti allegati.

## 5.2 Buste Paga — v2.1 FATTA (LUL) + G.3 Fase E (ELAB/F24)

**Flusso import LUL (2-step, com'era stato progettato):**
1. Marco carica il PDF LUL del consulente → `POST /dipendenti/buste-paga/anteprima-pdf` (parser `app/utils/parse_lul.py`, pdfplumber): nessuna scrittura, ritorna `abbinati` (match anagrafica per CF → cognome+nome → fuzzy 0.85) e `nuovi` (proposta di creazione), con `conflitti` campo-per-campo (IBAN, CF, livello, qualifica, tipo rapporto)
2. Conferma → `POST /dipendenti/buste-paga/conferma-import` (file + selezione JSON): upsert in `buste_paga` (fonte='PDF'), crea eventuali dipendenti nuovi, aggiorna anagrafica dai conflitti se richiesto, estrae e salva il PDF del singolo cedolino in `app/data/cedolini/<anno>/` (path legacy NON tenant-aware — refactor K-tris tracciato in roadmap), genera scadenza CG

**Endpoint completi:**
| Metodo | Path | Funzione |
|--------|------|----------|
| GET | `/dipendenti/buste-paga` | Lista + riepilogo (filtri `dipendente_id`, `anno`, `mese` = "YYYY-MM" o 1-12) |
| POST | `/dipendenti/buste-paga` | Crea/aggiorna cedolino a mano (+ scadenza CG se `genera_scadenza`) |
| POST | `/dipendenti/buste-paga/anteprima-pdf` | Step 1 import LUL (no scritture) |
| POST | `/dipendenti/buste-paga/conferma-import` | Step 2 import LUL |
| POST | `/dipendenti/buste-paga/test-pdf` | Debug parser (mostra cosa trova, non importa) |
| GET | `/dipendenti/buste-paga/{bp_id}/pdf` | Scarica il PDF del cedolino |
| DELETE | `/dipendenti/buste-paga/{bp_id}` | Elimina cedolino |
| GET | `/dipendenti/buste-paga/scadenze-mancanti` | Diagnostica: buste senza uscita CG (mai generata o cancellata) — nato dal bug "Iryna marzo 2026" |
| POST | `/dipendenti/buste-paga/{bp_id}/rigenera-scadenza` | Rigenera l'uscita CG |
| POST | `/dipendenti/buste-paga/import-paghe-pdf` | G.3 Fase E: 1-N PDF ELAB/F24 anche misti, detect tipo automatico → `dipendenti_costo_consuntivo` / `f24_versamenti` (anti-doppione: UNIQUE per ELAB, DELETE+INSERT per hash per F24) |
| GET | `/dipendenti/buste-paga/stato-import-mensile` | Per ogni mese dell'anno: conteggi LUL / ELAB / ELAB-INAIL / F24 (UI in Impostazioni → Stato import paghe) |
| POST | `/dipendenti/buste-paga/auto-create-mancanti` | Placeholder anagrafica per righe ELAB orfane (`DIP-ELAB-<matricola>`, attivo=0) |
| POST | `/dipendenti/buste-paga/rematch-consuntivo` | Re-match righe ELAB con `dipendente_id IS NULL` |

**Integrazione Scadenzario (CG, cross-DB su foodcost.db):** netto → `cg_uscite` con `tipo_uscita='STIPENDIO'`, `fornitore_nome="Stipendio - {nome cognome}"`, `stato='PROGRAMMATO'` (il vecchio 'DA_PAGARE' è pre-rename mig 114), `periodo_riferimento` in formato `YYYY-MM` (richiesto dal CE). **La scadenza cade nel mese successivo alla competenza**: stipendio di marzo → `giorno_paga` di aprile; se il dipendente non ha `giorno_paga`, vale il setting `giorno_pagamento_stipendi_default` (15, configurabile in Impostazioni → Stipendi).

**UI (`DipendentiBustePaga.jsx` v2.3):** lista per mese, upload con anteprima/conferma, form manuale, carica ELAB/F24.

## 5.3 Presenze e Assenze — v2.3 NON implementata; assenze gestite nei Turni

**Stato reale:** il modulo Presenze (griglia mensile righe=dipendenti × colonne=giorni, tipi PRESENTE/FERIE/…) NON esiste: la tabella `dipendenti_presenze` è schema-only, senza endpoint né pagina.

**Quello che esiste** (sessione 39, superando in parte la decisione 2026-04-14 "niente assenze in Turni"): le assenze FERIE / MALATTIA / PERMESSO si segnano **direttamente dal Foglio Settimana**, vivono nella tabella `assenze` (mig 083, una per persona per giorno) e hanno CRUD dedicato:
- `GET /turni/assenze/tipi` — tipi con emoji/colori/sigla
- `GET /turni/assenze/?da=&a=` (+ filtri `reparto_id`/`dipendente_id`)
- `POST /turni/assenze/` — upsert su (dipendente, data)
- `DELETE /turni/assenze/{id}`

Il payload del foglio (`GET /turni/foglio`) include `assenze[]` per la settimana. Workflow Marco invariato: chi non compare nel foglio = è a casa; l'assenza segnata è un'annotazione in più, non un turno.

> Il testo che segue resta come piano della v2.3 (storico, non implementato): calendario mensile con colori per tipo, totali a destra, pre-popolamento PRESENTE dai turni.

## 5.4 Turni v2 (operativo)

Vedi documento dedicato: **`modulo_dipendenti_turni.md`**.

Riassunto dello stato reale:
- Foglio settimana stile Excel di Marco su `/dipendenti/turni`: righe = giorni lun-dom, colonne = slot servizio (PRANZO 1..N / CENA 1..N), una matrice per reparto con tab
- Tabella `reparti` di prima classe (seed SALA + CUCINA) con CRUD dedicato (`/reparti/`, pagina `GestioneReparti`)
- Stato turno `OPZIONALE` (★, ex "CHIAMATA", rinominato con mig 073) per turno da confermare; `a_chiamata` è invece un flag del dipendente
- Colori dipendenti univoci, chiusure lette da `closures_config.json` (dati di locale), pause staff per reparto
- Copia settimana, template settimana tipo, vista mensile, vista per dipendente, Miei Turni self-service, PDF WeasyPrint, pubblicazione (M.A) + invio WhatsApp (M.C), warning conflitti orari
- Assenze FERIE/MALATTIA/PERMESSO segnabili dal foglio (vedi §5.3)
- Multi-reparto (mig 162): chi lavora in più reparti compare nel foglio di ognuno

Il vecchio Turni v1 (griglia per data su `turni_calendario` senza slot, endpoint `/dipendenti/turni/calendario`) resta raggiungibile su `/dipendenti/turni-legacy`.

## 5.5 Scadenze Documenti — v2.2 FATTA

**Endpoint:** `GET /dipendenti/scadenze` (filtri `dipendente_id`, `tipo`, `stato`; ritorna `stato_calc` dinamico + riepilogo scaduti/in scadenza/validi), `POST /dipendenti/scadenze`, `PUT /dipendenti/scadenze/{id}`, `DELETE /dipendenti/scadenze/{id}` (hard). UI: `DipendentiScadenze.jsx`. L'upload del PDF certificato NON è implementato (colonne `pdf_*` inutilizzate).

**Alert M.F:** checker `dipendenti_scadenze` registrato in `app/services/alert_engine.py:301` — rispetta l'`alert_giorni` del singolo documento (la `soglia_giorni` di config è solo fallback), antidup su `alert_dipendenti_scadenze`.

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

**UI:** semaforo verde (ok) / giallo (in scadenza entro `alert_giorni`) / rosso (scaduto), calcolato dal backend. L'upload del PDF certificato del piano originale non c'è (vedi sopra).

## 5.6 Contratti — v2.5 (futuro, schema predisposto)

Non implementato subito. Si predispone:
- Tabella `dipendenti_contratti` (vedi §4.3)
- Possibilità di caricare PDF contratto dall'anagrafica
- Alert scadenza contratti determinati

## 5.7 Costi — FATTA come "Costi mensili consuntivi" (G.3 Fase E, forma diversa dal piano v2.4)

**Endpoint:** `GET /dipendenti/costi-mensili?anno=&mese=` (`dipendenti.py:3002`) — per il mese: totali consuntivi dall'ELAB (lordo, contributi, ratei, TFR, INAIL, costo totale azienda), lista costo per persona, F24 versato raggruppato per sezione e per delega, **crosscheck** contributi ELAB vs DM10 del F24 (tolleranza 5 €). UI: `DipendentiCosti.jsx` v2.0 su `/dipendenti/costi`.

**Fonte dati reale:** `dipendenti_costo_consuntivo` (ELAB) + `f24_versamenti` (foodcost.db) — non più stime da `costo_orario`/turni come nel piano v2.4. Il piano originale (incidenza % su ricavi, trend 12 mesi, costo orario per ruolo) resta roadmap.

## 5.8 Allegati — FATTI

Endpoint attivi (`dipendenti.py:2410-2548`):
- `GET /dipendenti/{dipendente_id}/documenti` — allegati manuali + cedolini PDF importati dal LUL (voci virtuali `bp_<id>`)
- `POST /dipendenti/{dipendente_id}/documenti` — upload (query `categoria`, `descrizione`); file in dir tenant-aware `documenti_dipendenti/<id>/` (K-bis, sessione 2026-05-04)
- `DELETE /dipendenti/documenti/{doc_id}` — elimina record + file
- `GET /dipendenti/documenti/{doc_id}/download`

UI: sezione documenti nella scheda del dipendente in Anagrafica.

---

# 6. Fasi implementative v2

| Fase | Cosa | Stato |
|------|------|-------|
| **v2.0** | Promozione a modulo top-level, spostamento routes (hub a tile poi sostituito dalla tab-bar `DipendentiNav`) | ✅ FATTA |
| **v2.1** | Buste paga: upload PDF + estrazione + integrazione scadenzario | ✅ FATTA (+ ELAB/F24 in G.3 Fase E) |
| **v2.2** | Scadenze documenti: CRUD + semaforo + alert | ✅ FATTA (senza upload PDF certificato) |
| **v2.3** | Presenze: griglia mensile + totali | ⏳ NON fatta (assenze base coperte dai Turni, §5.3) |
| **v2.4** | Dashboard costi: metriche + grafici | ✅ coperta in forma consuntiva ELAB/F24 (§5.7); incidenza su ricavi e trend restano roadmap |
| **v2.5** | Contratti: schema + CRUD base + alert scadenza | ⏳ solo schema |
| **v2.6** | Allegati: upload PDF generico per dipendente | ✅ FATTA |

Turni v2 completato in parallelo (vedi `modulo_dipendenti_turni.md`). Aggiunte non previste dal piano: Intermittenti (2026-07-30, `modulo_intermittenti.md`) e multi-reparto (2026-08-03).

---

# 7. Impatto su altri moduli

- **Banca / CG Uscite:** buste paga → righe in `cg_uscite` con `tipo_uscita='STIPENDIO'`, `stato='PROGRAMMATO'`, scadenza nel mese successivo alla competenza. `f24_versamenti` vive in foodcost.db. Il CE (G.3) legge `periodo_riferimento` YYYY-MM e `is_amministratore` per la ripartizione AMMINISTRATORI/STAFF.
- **Home / navigazione:** tile "Amministrazione" rimossa, tile "Dipendenti" attiva (`modulesMenu.js`: Dashboard, Anagrafica, Buste Paga, Turni, Scadenze, Costi, Impostazioni — Intermittenti e Reparti si raggiungono dalla tab-bar interna). `/admin/dipendenti/*` → redirect.
- **M.A Notifiche:** usate da `pubblica_settimana` (turni) e dai checker M.F.
- **M.F Alert Engine:** checker attivi `dipendenti_scadenze` (`alert_engine.py:301`) e `intermittenti_non_comunicati` (`alert_engine.py:849`).
- **M.C WhatsApp:** invio riepilogo turni ai dipendenti (Fase 11 turni).
- **M.D Email:** invio comunicazioni UNI; dal 2026-08-03 il canale SMTP si configura da **Impostazioni Sistema → Email** (router platform `GET/PUT /email/config/` + `POST /email/test/` in `app/routers/email_router.py`, config in `email_settings.json` del locale, `.env` come fallback). Vedi `modulo_intermittenti.md` §6.
- **Vendite/Selezioni:** chiusure settimanali lette da `closures_config.json` per i giorni chiusi nel foglio turni. L'incidenza costi su ricavi (piano v2.4) non è implementata.

---

# 8. Note tecniche

- **DB dedicato:** `dipendenti.sqlite3` in `locali/<id>/data/`. Le nuove tabelle del modulo vanno qui (eccezione storica: `f24_versamenti` in foodcost.db, mig 132).
- **PDF parsing:** `pdfplumber` per LUL (`app/utils/parse_lul.py`), ELAB (`app/services/elab_parser.py`), F24 (`app/services/f24_parser.py`). Detect automatico del tipo per keyword (`_detect_pdf_type` in `dipendenti.py:2682`). Il sistema di template/regole configurabili per consulenti diversi non esiste: i parser sono cuciti sul formato del consulente attuale.
- **Percorsi file reali** (diversi dal naming del piano):
  - cedolini singoli: `app/data/cedolini/<anno>/<COGNOME>_<NOME>_<anno>_<mese>.pdf` (legacy, refactor tenant-aware "K-tris" in roadmap)
  - documenti allegati: dir tenant-aware `uploads/documenti_dipendenti/<dipendente_id>/` con fallback `app/data/documenti_dipendenti/`
- **Cross-DB:** due connessioni separate (`get_dipendenti_conn()` + `sqlite3.connect(foodcost)`), join in Python. Niente ATTACH.
- **Pattern WAL:** FATTO — `get_dipendenti_conn()` imposta WAL + `synchronous=NORMAL` + `busy_timeout=30000` (fix sessione 52).
