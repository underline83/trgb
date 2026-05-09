# Modulo Controllo di Gestione — TRGB Gestionale
**Versione:** 1.0
**Stato:** Beta
**Data ultimo aggiornamento:** 2026-03-29
**Dominio funzionale:** Controllo di gestione, Uscite, Scadenze, Spese ricorrenti

---

# 1. Panoramica

Il modulo **Controllo di Gestione** e' un modulo di primo livello del gestionale, integra le funzionalità del modulo Finanza (rimosso v1.0). Il suo scopo e' incrociare i dati provenienti da Acquisti, Banca e Vendite per dare una visione completa della situazione finanziaria del ristorante.

A differenza degli altri moduli che leggono ciascuno i propri dati, Controllo di Gestione **importa e popola** dati propri partendo dalle altre fonti, creando un layer autonomo che non dipende da query live.

**Sezione top-level:** `/controllo-gestione`
**Backend API:** `/controllo-gestione/*`
**Colore tema:** Sky/Cyan
**Icona:** 🎯

---

# 2. Concetti chiave

## 2.1 Uscite

Le uscite sono divise in categorie:

**A) Fatture da pagare (USCITE CORRENTI)** — Fatture importate dal modulo Acquisti la cui scadenza e' in una data futura. La scadenza viene calcolata in ordine di priorita':
1. Dal blocco `DatiPagamento` dell'XML FatturaPA (campo `DataScadenzaPagamento`)
2. Dal default del fornitore (`suppliers.giorni_pagamento` → data_fattura + N giorni)
3. Se nessuno dei due e' disponibile → la fattura va negli avvisi "senza scadenza"

**B) Arretrati (SCADUTE)** — Fatture la cui data di scadenza e' passata e non risultano pagate.

**C) Rateizzazioni** — TODO (fase successiva). Saranno gestite nella sezione Spese Fisse.

**D) Prestiti** — TODO (fase successiva). Saranno gestiti nella sezione Spese Fisse.

**E) Spese senza fattura** — Affitti, tasse, stipendi e altre spese ricorrenti che non hanno una fattura XML associata. Gestite interamente dentro Controllo Gestione nella sezione Spese Fisse.

**F) Tasse** — TODO. Sezione dedicata dentro Spese Fisse.

**G) Stipendi** — TODO. Sezione dedicata dentro Spese Fisse.

## 2.2 Pagamenti

Il sistema di pagamento e' autonomo e non dipende da Fatture in Cloud:
- Il campo `fe_fatture.pagato` (popolato da FIC) viene **ignorato** dal Controllo di Gestione
- Lo stato pagamento e' gestito internamente tramite matching con i movimenti bancari (Banca)
- Futuro: matching anche con gestione contanti

## 2.3 Condizioni di pagamento fornitore

Ogni fornitore puo' avere condizioni di pagamento di default configurate nella sua scheda (modulo Acquisti):
- `modalita_pagamento_default` — codice FatturaPA (MP01=contanti, MP05=bonifico, ecc.)
- `giorni_pagamento` — giorni dalla data fattura per calcolare la scadenza
- `note_pagamento` — note libere (es. "fine mese", "30gg data fattura")

Queste condizioni vengono usate come fallback quando l'XML della fattura non contiene il blocco DatiPagamento.

---

# 3. Funzionalita'

## 3.1 Menu Principale (`/controllo-gestione`)
Hub con 4 tile di accesso rapido: Dashboard, Tabellone Uscite, Confronto Periodi, Spese Fisse (in lavorazione).

## 3.2 Dashboard (`/controllo-gestione/dashboard`)
Panorama completo con:
- **6 KPI cards**: Vendite mese, Acquisti mese, Margine lordo, Saldo banca, Uscite programmate (TODO), Rateizzazioni (TODO)
- **Andamento annuale**: grafico a barre orizzontali Vendite vs Acquisti per mese con margine
- **Top fornitori**: classifica per spesa nel mese selezionato
- **Categorie acquisti**: distribuzione per categoria nel mese

Filtro anno/mese con selettori. Confronto con mese precedente (variazione %).

## 3.3 Tabellone Uscite (`/controllo-gestione/uscite`)
Vista tabellare di tutte le uscite (fatture importate) con:
- **Import da Acquisti**: bottone che importa/aggiorna le fatture da `fe_fatture` → `cg_uscite`
- **4 KPI cards cliccabili**: Da pagare, Arretrati, Pagate, Senza scadenza (filtro rapido)
- **Filtri**: stato, fornitore (ricerca testo), ordinamento (scadenza, importo, fornitore, data)
- **Tabella**: Stato, Fornitore, N. Fattura, Data, Importo, Scadenza (con giorni residui), Modalita' pagamento, Pagato, Residuo
- **Badge scadenza**: indica se la scadenza proviene da XML o da default fornitore
- **Badge giorni**: colore variabile (rosso se scaduta, ambra se < 7gg, neutro altrimenti)

## 3.4 Confronto Periodi (`/controllo-gestione/confronto`)
Confronta due periodi (mesi o anni interi) su: vendite, acquisti, margine, banca entrate/uscite. Calcola variazioni percentuali.

## 3.5 Spese Fisse (`/controllo-gestione/spese-fisse`) — IMPLEMENTATO

Sezione per gestire spese ricorrenti senza fattura. Pagina `ControlloGestioneSpeseFisse.jsx`, già in produzione con dati reali (22 spese fisse + 274 rate al 2026-05-08).

- **Tipi**: AFFITTO, TASSA, STIPENDIO, PRESTITO, RATEIZZAZIONE, ASSICURAZIONE, ALTRO
- **Frequenze**: MENSILE, BIMESTRALE, TRIMESTRALE, SEMESTRALE, ANNUALE, UNA_TANTUM
- **CRUD completo** con data inizio/fine, giorno scadenza, importo, note, IBAN, importo_originale, spese_legali
- **Wizard guidati**: Affitto, Prestito/Mutuo, Assicurazione, Tasse/F24 (template), Rateizzazione (da fatture)
- **Piano rate** (`cg_piano_rate`): rate variabili per prestiti alla francese, rateizzazioni con date irregolari
- **Storico** (modale): lista addebiti passati per spese senza piano rate (affitti, utenze)
- **Riconciliazione banca per uscita** (modale "Cerca banca"): match rata ↔ movimento bancario

### 3.5.1 Import CSV piano rate (G.1.5, 2026-05-08)

Per piani di rateizzazione **Abaco / Agenzia delle Entrate / PagoPA / F24 rateizzato** che arrivano come file CSV:

**Endpoint:** `POST /controllo-gestione/spese-fisse/import-csv` (multipart)

**Body multipart:**
- `file` — CSV con header `Numero,Identificativo,Scadenza,Importo,Stato`
- `titolo` — string libera (es. "Rateizzazione Abaco — atto 0075330")
- `tipo` — uno di {AFFITTO, ASSICURAZIONE, PRESTITO, RATEIZZAZIONE, TASSA, ALTRO} — default `TASSA`
- `note` — opzionale
- `iban` — opzionale
- `force` — bool, default `false`. Set `true` per bypass duplicate detection.

**Mapping CSV → DB:**
| CSV | DB |
|-----|----|
| `Numero` | `cg_piano_rate.numero_rata` |
| `Identificativo` (RAV/IUV/atto) | `cg_piano_rate.codice_pagamento` (mig 108) |
| `Scadenza` (DD/MM/YYYY) | `cg_piano_rate.data_scadenza_specifica` (mig 108, ISO YYYY-MM-DD) + `cg_piano_rate.periodo` (YYYY-MM) |
| `Importo` | `cg_piano_rate.importo` |
| `Stato` (Pagata/Da pagare) | tracciato in `cg_piano_rate.note`. Le `cg_uscite` sono sempre create DA_PAGARE/SCADUTA — la riconciliazione vera dal modulo Banca evita doppia contabilizzazione. |

**Encoding/delimiter:** auto-detect UTF-8/UTF-8 BOM/cp1252/latin1 + `,` o `;`. Importi accettano formato IT (`211,00`) e EN (`211.00` o `1,234.56`).

**Duplicate detection (light):** se almeno 1 dei primi 3 `codice_pagamento` matcha un piano esistente → `409 Conflict` con dettaglio piani esistenti. UI mostra modale "Crea comunque (duplicato)" / "Annulla". Niente merge intelligente: per riscrivere un piano AdE modificato, l'utente cancella + reimporta.

**Date irregolari (chiave AdE/PagoPA):** il proiettore `cg_uscite` (in `import_uscite()`) controlla `cg_piano_rate.data_scadenza_specifica`: se valorizzata, la usa direttamente in `cg_uscite.data_scadenza`. Altrimenti calcolo standard `{anno}-{mese}-{giorno_scadenza}` clampato. Backward-compat totale: rate pre-mig 108 funzionano come prima.

### 3.5.2 Delete spesa fissa con rate riconciliate (G.1.5)

`DELETE /controllo-gestione/spese-fisse/{id}` ora fa **cascade** su `cg_piano_rate` + `cg_uscite`. Se la spesa ha rate già riconciliate (`banca_movimento_id NOT NULL` o stato PAGATA/PAGATA_MANUALE/PARZIALE), ritorna **409** con conteggio. Solo con `?confirm_riconciliate=true` procede comunque (i movimenti banca tornano "non abbinati"). UI mostra warning esplicito: *"X rate riconciliate, eliminandole la riconciliazione si rompe — continuare?"*

### 3.5.3 Template CSV scaricabile (G.1.5, 2026-05-09)

`GET /controllo-gestione/spese-fisse/template-csv` (auth) restituisce un CSV preformattato col nostro standard, con BOM UTF-8 (Excel italiano lo apre bene), 3 righe di esempio e righe `#` di intestazione che spiegano i formati. L'utente lo scarica, lo compila in Excel/Numbers, lo salva come CSV e lo ricarica via wizard "Importa CSV piano rate".

**Importante (parser):** il parser CSV ignora ora anche le righe che iniziano con `#` — usato per i commenti del template, ma utile in generale.

**Posizionamento route:** registrato PRIMA di `/spese-fisse/{spesa_id}` per evitare il match parametrico (FastAPI valuta in ordine di definizione; con `spesa_id: int` il path `/spese-fisse/template-csv` darebbe altrimenti 422).

UI:
- Pannello creazione spese fisse: terzo bottone (ambra) "📋 Scarica template CSV" accanto a "Inserimento manuale" e "Importa CSV piano rate"
- Wizard import (step 1): link "Non hai un CSV? 📋 Scarica il template — compilalo in Excel/Numbers e ricaricalo qui"

### 3.5.4 Visualizzazione Pagato/Residuo + Totale piano (G.1.5, 2026-05-09)

In `ControlloGestioneSpeseFisse.jsx` la barra Pagato/Residuo + bar di progresso ora si mostra ogni volta che `s.n_rate_totali > 0`, indipendente dal `tipo`. Prima era limitata a `PRESTITO`/`RATEIZZAZIONE`: una rateizzazione importata come `TASSA` (es. cartelle Abaco) non vedeva la barra. Aggiunta riga "Totale piano: € X — N rate" che usa `s.importo_originale` (popolato all'import CSV o al wizard prestito).

### 3.6 Alert scadenze pagamenti (G.2.A, 2026-05-09)

Implementati su mattone **M.F Alert engine** (`app/services/alert_engine.py`) e mattone **M.A Notifiche**. Tre checker distinti, soglie indipendenti configurabili da Impostazioni → Notifiche, range esclusivi.

| Checker | Default | Urgenza | Range scadenza (rispetto a oggi) |
|---|---|---|---|
| `cg_scadenze_imminenti` | 7 gg | "urgente" (banda rossa) | tutto ciò che è ≤ oggi+7gg, **incluse scadute non riconciliate** |
| `cg_scadenze_avvicinamento` | 15 gg | "normale" | `> oggi+soglia_imminente` AND `≤ oggi+soglia_avvicinamento` |
| `cg_scadenze_pianificazione` | 30 gg | "normale" | `> oggi+soglia_avvicinamento` AND `≤ oggi+soglia_pianificazione` |

**Filtro comune:** `cg_uscite.stato IN ('DA_PAGARE','SCADUTA')` AND `banca_movimento_id IS NULL` AND `data_scadenza NOT NULL`.

**Anti-dup:** una sola notifica AGGREGATA per livello (tipo `alert_cg_scadenze_imminenti` / `_avvicinamento` / `_pianificazione`). Anti-dup di N ore (config `antidup_ore`, default 12/24/48). I tipi distinti permettono notifiche separate quando una rata "transita" tra livelli (es. da pianificazione a avvicinamento col passare del tempo).

**Coerenza soglie:** se l'utente imposta avvicinamento ≤ imminente o pianificazione ≤ avvicinamento, il checker affetto ritorna `skipped` con errore esplicito anziché fare query degenerate.

**Configurazione UI:** pagina `/admin/notifiche-impostazioni` (ImpostazioniSistema → tab Notifiche). I 3 checker compaiono automaticamente perché la UI fa GET dinamico su `/alerts/config/`. Per ogni checker: on/off, soglia giorni, antidup ore, destinatari (ruolo + lista username), canali (in-app, WhatsApp, email — quest'ultimo placeholder M.D).

**Trigger esecuzione:** stesso scheduler M.F (cron interno). Test manuale via `POST /alerts/run/cg_scadenze_imminenti/` o "Esegui" dalla UI Impostazioni.

**Path UI per il deep-link:** `link="/controllo-gestione/uscite"` (lo Scadenziario Unificato), così cliccando la notifica si arriva alla lista filtrata per scadenza.

**Cosa non fa (per scelta):**
- Non manda email (M.D non implementato — segnale stub solo log)
- Non fa pagamenti automatici
- Non sostituisce M.A campana — la notifica vive lì come tutte le altre

**Roadmap successiva (G.2.B):** vista calendario scadenze (`<CalendarView>` di M.E) come tab dedicato sotto `/controllo-gestione/calendario` + widget mini-timeline nella dashboard CG.

---

# 4. Navigazione

**ControlloGestioneNav** — barra di navigazione persistente con 3 tab: Dashboard, Uscite, Confronto. Brand link "Controllo Gestione" per tornare al menu, link "Home" in alto a destra.

---

# 5. API Backend

Router: `app/routers/controllo_gestione_router.py`
Prefix: `/controllo-gestione`
Auth: JWT (tutte le route richiedono token)

### Endpoint principali

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/dashboard` | Dashboard unificata (vendite, acquisti, banca, margine, andamento) |
| GET | `/confronto` | Confronto due periodi |
| POST | `/uscite/import` | Importa fatture da Acquisti → cg_uscite |
| GET | `/uscite` | Tabellone uscite con filtri |
| GET | `/uscite/senza-scadenza` | Fatture senza data scadenza |
| GET | `/fornitore/{piva}/pagamento` | Condizioni pagamento di un fornitore |
| PUT | `/fornitore/{piva}/pagamento` | Aggiorna condizioni pagamento fornitore |
| GET | `/mp-labels` | Mapping codici modalita' pagamento → label |

### Parametri endpoint `/uscite`

| Param | Tipo | Descrizione |
|-------|------|-------------|
| stato | string | Filtro: DA_PAGARE, SCADUTA, PAGATA, PARZIALE |
| fornitore | string | Ricerca testo nel nome fornitore |
| da | string | Data scadenza minima (YYYY-MM-DD) |
| a | string | Data scadenza massima (YYYY-MM-DD) |
| ordine | string | scadenza_asc, scadenza_desc, importo_asc, importo_desc, fornitore, data_fattura |

### Parametri endpoint `/dashboard`

| Param | Tipo | Descrizione |
|-------|------|-------------|
| anno | int | Anno di riferimento (default: corrente) |
| mese | int | Mese di riferimento (default: corrente) |

---

# 6. Database

Posizione: `app/data/foodcost.db`

### Tabella `cg_uscite` (Migration 032)
Uscite importate dalle fatture acquisti.

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| id | INTEGER PK | Auto-increment |
| fattura_id | INTEGER FK | Riferimento a fe_fatture.id |
| fornitore_nome | TEXT | Nome fornitore |
| fornitore_piva | TEXT | P.IVA fornitore |
| numero_fattura | TEXT | Numero fattura |
| data_fattura | TEXT | Data fattura (YYYY-MM-DD) |
| totale | REAL | Importo totale fattura |
| data_scadenza | TEXT | Data scadenza calcolata (YYYY-MM-DD) |
| importo_pagato | REAL | Importo effettivamente pagato |
| data_pagamento | TEXT | Data del pagamento |
| stato | TEXT | DA_PAGARE, SCADUTA, PAGATA, PARZIALE |
| banca_movimento_id | INTEGER | FK futuro per matching con Banca |
| note | TEXT | Note libere |

**Indici**: UNIQUE su fattura_id (una uscita per fattura), stato, data_scadenza.

### Tabella `cg_spese_fisse` (Migration 032)
Spese ricorrenti senza fattura.

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| id | INTEGER PK | Auto-increment |
| tipo | TEXT | AFFITTO, TASSA, STIPENDIO, PRESTITO, RATEIZZAZIONE, ALTRO |
| titolo | TEXT | Titolo della spesa |
| descrizione | TEXT | Descrizione |
| importo | REAL | Importo |
| frequenza | TEXT | MENSILE, BIMESTRALE, TRIMESTRALE, SEMESTRALE, ANNUALE, UNA_TANTUM |
| giorno_scadenza | INTEGER | Giorno del mese in cui scade |
| data_inizio | TEXT | Data inizio (YYYY-MM-DD) |
| data_fine | TEXT | Data fine (YYYY-MM-DD, NULL=indefinita) |
| attiva | INTEGER | 1=attiva, 0=disattivata |

### Tabella `cg_uscite_log` (Migration 032)
Log di ogni operazione di import per tracciabilita'.

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| tipo | TEXT | Tipo operazione (IMPORT_FATTURE) |
| fatture_importate | INTEGER | Nuove fatture importate |
| fatture_aggiornate | INTEGER | Fatture con stato aggiornato |
| fatture_saltate | INTEGER | Fatture gia' presenti senza modifiche |

### Campi aggiunti a `fe_fatture` (Migration 031)

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| condizioni_pagamento | TEXT | Codice FatturaPA (TP01=a rate, TP02=completo) |
| modalita_pagamento | TEXT | Codice FatturaPA (MP01, MP05, MP08...) |
| data_scadenza | TEXT | Estratta da DatiPagamento XML |
| importo_pagamento | REAL | Importo dal dettaglio pagamento XML |

### Campi aggiunti a `suppliers` (Migration 031)

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| modalita_pagamento_default | TEXT | Modalita' default quando XML non la contiene |
| giorni_pagamento | INTEGER | Giorni dalla data fattura per calcolo scadenza |
| note_pagamento | TEXT | Note sulle condizioni di pagamento |

---

# 7. Frontend — File

```
frontend/src/pages/controllo-gestione/
  ControlloGestioneMenu.jsx        — Hub principale (/controllo-gestione)
  ControlloGestioneDashboard.jsx   — Dashboard unificata (/controllo-gestione/dashboard)
  ControlloGestioneUscite.jsx      — Tabellone uscite (/controllo-gestione/uscite)
  ControlloGestioneConfronto.jsx   — Confronto periodi (/controllo-gestione/confronto)
  ControlloGestioneNav.jsx         — Barra navigazione persistente
```

### Componente condizioni pagamento (in modulo Acquisti)

In `FattureFornitoriElenco.jsx` (dettaglio fornitore inline) e' stata aggiunta la sezione "Condizioni di pagamento" con:
- Dropdown modalita' pagamento (MP01-MP19)
- Campo giorni pagamento (numerico)
- Campo note (testo libero)
- Bottone salva con feedback

---

# 8. Routing Frontend

```
/controllo-gestione                    — Menu Controllo di Gestione
/controllo-gestione/dashboard          — Dashboard unificata
/controllo-gestione/uscite             — Tabellone uscite
/controllo-gestione/confronto          — Confronto periodi
/controllo-gestione/spese-fisse        — Spese fisse (TODO)
```

---

# 9. Flusso operativo

## 9.1 Import uscite
1. Marco va in Controllo Gestione → Tabellone Uscite
2. Clicca "Importa da Acquisti"
3. Il sistema legge tutte le fatture da `fe_fatture` (escluse autofatture e note credito)
4. Per ogni fattura calcola la data di scadenza:
   - Priorita' 1: `fe_fatture.data_scadenza` (estratta da XML al momento dell'import fattura)
   - Priorita' 2: `suppliers.giorni_pagamento` del fornitore → data_fattura + N giorni
   - Se nessuno dei due e' disponibile → la fattura viene importata senza scadenza
5. Calcola lo stato: SCADUTA se data_scadenza < oggi, DA_PAGARE altrimenti
6. Fatture gia' importate: aggiorna stato/scadenza se cambiati; non tocca PAGATA/PARZIALE
7. Mostra riepilogo: N importate, N aggiornate, N saltate, N senza scadenza

## 9.2 Gestire fatture senza scadenza
1. Il KPI "Senza scadenza" nel tabellone mostra quante fatture mancano di data scadenza
2. Per risolvere: andare in Acquisti → Fornitori → selezionare il fornitore
3. Nella sezione "Condizioni di pagamento" impostare i giorni pagamento (es. 30, 60, 90)
4. Tornare in Controllo Gestione e reimportare → le fatture del fornitore avranno ora la scadenza

## 9.3 Matching pagamenti (FUTURO)
1. Cross-reference tra movimenti banca (uscite) e fatture in cg_uscite
2. Match per importo + fornitore/causale
3. Quando trovato: stato → PAGATA, importo_pagato = importo, data_pagamento = data movimento banca
4. Match parziali → stato PARZIALE

## 9.4 Gestione contanti (FUTURO)
1. Pagamenti in contanti saranno gestiti tramite il modulo Gestione Contanti
2. Cross-reference simile al matching banca ma su movimenti cassa

---

# 10. Codici Modalita' Pagamento FatturaPA

| Codice | Descrizione |
|--------|-------------|
| MP01 | Contanti |
| MP02 | Assegno |
| MP03 | Assegno circolare |
| MP05 | Bonifico |
| MP08 | Carta di pagamento |
| MP09 | RID |
| MP12 | RIBA |
| MP16 | Domiciliazione bancaria |
| MP19 | SEPA Direct Debit |
| MP23 | PagoPA |

Codici completi nel mapping `MP_LABELS` in `controllo_gestione_router.py`.

---

# 11. Relazioni con altri moduli

| Modulo | Relazione | Direzione |
|--------|-----------|-----------|
| Acquisti | Import fatture → cg_uscite | Acquisti → CG |
| Acquisti | Condizioni pagamento fornitore | CG scrive in suppliers |
| Banca | Matching pagamenti (futuro) | Banca → CG |
| Vendite | Lettura corrispettivi per dashboard | Vendite → CG (read-only) |
| Gestione Contanti | Matching pagamenti cash (futuro) | Contanti → CG |

> **IMPORTANTE**: Finanza rimosso — le sue funzionalità sono state integrate in Controllo Gestione.

---

# 12. Roadmap

## v1.0 (attuale) — 2026-03-29
- Modulo top-level con menu, dashboard, tabellone uscite, confronto periodi
- Import fatture da Acquisti con calcolo scadenza automatico
- Estrazione DatiPagamento da XML FatturaPA
- Condizioni pagamento default per fornitore
- Avviso fatture senza scadenza
- Integrazione funzionalità precedentemente in Finanza (rimosso v1.0)

## v1.1 (pianificata)
- Matching pagamenti con Banca (punto 5 piano originale)
- Aggiornamento automatico stato uscite su match
- Sezione Spese Fisse (affitti, tasse, stipendi)

## v1.2 (pianificata)
- Matching pagamenti contanti (gestione contanti)
- Rateizzazioni e prestiti in Spese Fisse
- Dashboard con previsioni cash flow

## v2.0 (futuro)
- Budget vs consuntivo
- Alert automatici scadenze imminenti
- Report PDF esportabili

---

# 13. Changelog

## v1.0 (2026-03-29)
- **Nuovo modulo**: Controllo di Gestione — modulo top-level separato da Finanza
- **Dashboard unificata**: KPI vendite/acquisti/banca/margine, andamento annuale, top fornitori, categorie
- **Tabellone Uscite**: import fatture da Acquisti, calcolo scadenze, filtri, ordinamento, KPI
- **Estrazione DatiPagamento**: parser XML arricchito per estrarre condizioni, modalita', scadenza, importo dal blocco DatiPagamento FatturaPA
- **Condizioni pagamento fornitore**: nuova sezione nella scheda fornitore (Acquisti) per impostare default modalita'/giorni/note
- **Migration 031**: campi pagamento su fe_fatture e suppliers
- **Migration 032**: tabelle cg_uscite, cg_spese_fisse, cg_uscite_log
- **Confronto Periodi**: confronto due mesi/anni con variazioni percentuali
