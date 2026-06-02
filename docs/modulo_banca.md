# Modulo Banca — TRGB Gestionale

**Ultimo aggiornamento:** 2026-05-08 (creato in consolidamento docs Batch 7)
**Stato:** Operativo. Doc canonico nuovo (prima sparso tra `modulo_controllo_gestione.md` e altri).
**Versione modulo (`versions.jsx`):** banca v1.x · flussi_cassa v1.x
**Sezione top-level:** `/banca` (e `/flussi-cassa` per Contanti/Mance — modulo affiliato)
**Backend prefix:** `/banca/*` + `/flussi-cassa/*`
**DB:** `app/data/cg.sqlite3` (condiviso con Controllo Gestione) + `admin_finance.sqlite3` (condiviso con Vendite/Cassa)
**Roadmap:** sezione `B.` di `docs/roadmap.md`
**Documenti correlati:**
- `modulo_controllo_gestione.md` — usa Banca come fonte di verità per pagamenti
- `modulo_acquisti.md` — fatture XML/FIC che generano scadenze
- `modulo_vendite.md` — Chiusure turno, contanti come residuo (ex `modulo_selezioni.md`)

---

# 0. Indice

1. Panoramica e scopo
2. Cross-modulo: chi parla con Banca
3. Architettura
4. Estratti conto bancari
5. Movimenti bancari + matching scadenze
6. Riconciliazione automatica
7. Gestione Contanti (sub-modulo `/flussi-cassa/contanti`)
8. Mance (sub-modulo `/flussi-cassa/mance`)
9. Scadenzario uscite (CG Uscite, vedi `modulo_controllo_gestione.md`)
10. Frontend
11. Roadmap

---

# 1. Panoramica e scopo

Il modulo **Banca** è il punto di verità per:

- **Estratti conto bancari** — import CSV/MT940/PDF da banca BPM e/o Sella
- **Movimenti bancari** — lista con filtri (data, importo, descrizione, conto)
- **Matching scadenze** — collegamento movimenti ↔ `cg_uscite` per marcare fatture come pagate
- **Riconciliazione automatica** — match per importo + data ravvicinata + descrizione
- **Saldo banca corrente** — calcolato live da movimenti
- **Sub-modulo Contanti** (`/flussi-cassa/contanti`) — entrate/uscite di cassa contante (separato da banca)
- **Sub-modulo Mance** (`/flussi-cassa/mance`) — gestione cumulativo mance staff

**NON è** il modulo che importa fatture (quello è Acquisti) né quello che importa corrispettivi (quello è Selezioni). Banca **legge il flusso** del denaro che esce dal conto e lo abbina alle uscite previste.

---

# 2. Cross-modulo: chi parla con Banca

**Acquisti → Banca:** ogni fattura XML/FIC importata genera (o aggiorna) una riga in `cg_uscite` con `tipo_uscita='FATTURA'`. Banca ne ignora il flag `pagato` di FIC.

**Dipendenti → Banca (futuro):** import busta paga genera riga `cg_uscite` con `tipo_uscita='STIPENDIO'` e scadenza calcolata da `dipendenti.giorno_paga`.

**Acquisti Proforme → Banca (in pausa):** creazione proforma crea riga `cg_uscite` con `tipo_uscita='PROFORMA'`. Riconciliazione cancella la proforma quando arriva la fattura.

**Selezioni → Banca:**
- I pagamenti elettronici (POS BPM, POS Sella, TheForkPay, bonifici) inseriti in `shift_closures` sono compatibili con i movimenti bancari (entrata).
- Cross-check possibile: somma POS BPM in `shift_closures` per data X = accredito su BPM in giorno X+1/X+2 (a seconda della banca).

**Controllo Gestione ← Banca:** il modulo CG **legge** Banca come fonte di verità per pagamenti, ignorando il campo `fe_fatture.pagato` di FIC. Vedi `modulo_controllo_gestione.md` §2.2.

---

# 3. Architettura

## 3.1 DB

`app/data/cg.sqlite3` (condiviso con Controllo Gestione):

| Tabella | Scopo |
|---------|-------|
| `cg_movimenti_banca` | Movimenti bancari (data, importo, descrizione, conto, segno) |
| `cg_estratti_conto` | Metadati import estratti conto (file, data import, hash) |
| `cg_uscite` | Scadenzario uscite (vedi `modulo_controllo_gestione.md`) |
| `cg_match_movimenti_uscite` | Mapping movimento ↔ uscita (M:N teorico, 1:1 in pratica) |

`app/data/flussi_cassa.sqlite3` (separato):

| Tabella | Scopo |
|---------|-------|
| `cassa_movimenti` | Entrate/uscite contante (manuali) |
| `mance_giorni` | Mance per giorno per dipendente |
| `mance_distribuzioni` | Distribuzioni cumulativo (settimana/mese) |

## 3.2 Router

| Router | File | Prefix |
|--------|------|--------|
| Banca | `app/routers/banca_router.py` | `/banca` |
| Flussi Cassa Contanti | `app/routers/flussi_cassa_contanti_router.py` | `/flussi-cassa/contanti` |
| Flussi Cassa Mance | `app/routers/flussi_cassa_mance_router.py` | `/flussi-cassa/mance` |
| CG Uscite | `app/routers/controllo_gestione_router.py` | `/controllo-gestione` |

> ⚠️ **Nota nomenclatura:** alcuni router potrebbero essere effettivamente nominati diversamente nel codice. Da verificare al primo intervento. Questo doc riflette la convenzione attesa post-refactor monorepo.

---

# 4. Estratti conto bancari

## 4.1 Formati supportati

- **CSV BPM** — formato proprietario (data, importo, descrizione, valuta, saldo)
- **CSV Sella** — formato proprietario (simile a BPM ma colonne in ordine diverso)
- **PDF estratto conto** — parsing tabular con `pdfplumber` (futuro, dipende da M.B PDF skills)

## 4.2 Import

UI: pagina `BancaImport.jsx` con drag & drop o selezione file. Preview righe parsate, anti-duplicazione (`xml_hash`-style su contenuto file), conferma → insert in `cg_movimenti_banca`.

Endpoint: `POST /banca/estratti-conto/import` (multipart, query param `conto=BPM|SELLA`).

---

# 5. Movimenti bancari + matching scadenze

## 5.1 Lista movimenti — `BancaMovimenti.jsx`

| Colonna | Note |
|---------|------|
| Data valuta | dal CSV banca |
| Conto | BPM / SELLA / altro |
| Importo | + entrate, − uscite |
| Descrizione | testo banca (es. "BONIFICO A FAVORE DI MOLINO SPADONI") |
| Stato match | NON_ABBINATO / ABBINATO_A_USCITA_N |
| Azioni | Abbina a uscita / Crea uscita |

Filtri sidebar: data range, conto, importo min/max, stato match, ricerca descrizione.

## 5.2 Match manuale

Click su movimento NON_ABBINATO → modale con:
- Lista uscite candidate (stesso importo ±1€, fornitore simile, data scadenza ravvicinata)
- Selezione manuale uscita
- Conferma → insert in `cg_match_movimenti_uscite` + update `cg_uscite.stato='PAGATA'`

## 5.3 Endpoint

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/banca/movimenti/` | Lista con filtri |
| GET | `/banca/movimenti/{id}` | Dettaglio |
| POST | `/banca/movimenti/{id}/abbina` | `{ uscita_id }` → match |
| POST | `/banca/movimenti/{id}/crea-uscita` | Crea uscita inline + match |
| DELETE | `/banca/match/{match_id}` | Rimuove abbinamento |

---

# 6. Riconciliazione automatica

## 6.1 Algoritmo (proposto, in roadmap)

Per ogni movimento NON_ABBINATO:

1. Filtra `cg_uscite` con `stato='DA_PAGARE'` e `totale = movimento.importo` (segno opposto)
2. Se 1 candidato unico → match automatico
3. Se >1 candidati → ranking per:
   - Distanza da `data_scadenza` ↓
   - Match fuzzy descrizione movimento ↔ `fornitore_nome` ↓
4. Suggerisci top-3 in UI per conferma manuale
5. Soglia configurabile per auto-match (es. score > 0.8 → auto)

**Stato:** algoritmo da implementare. Voce roadmap B.x.

## 6.2 Casi edge

- **Bonifici cumulativi** — Marco fa un bonifico unico per più fatture dello stesso fornitore. Servirebbe match 1:N (un movimento abbinato a N uscite con `sum(totali) = importo`).
- **Spese ricorrenti senza fattura** — affitto, utilities. Da gestire come `cg_uscite` con `tipo_uscita='SPESA_RICORRENTE'` e import preventivo.
- **Stipendi** — riga `cg_uscite` generata da modulo Dipendenti (vedi `modulo_dipendenti.md` §5.2).

---

# 7. Gestione Contanti (`/flussi-cassa/contanti`)

> Sub-modulo separato. Spostato qui dal modulo Vendite/Selezioni nel 2026-03-30.

## 7.1 Scopo

Tracciare entrate/uscite di **cassa contante** non legate a chiusure turno:
- Versamento contanti in banca
- Prelievo contanti da banca per fondo cassa
- Pagamento fornitore in contanti
- Restituzione cliente

## 7.2 DB — `cassa_movimenti`

`id`, `data`, `tipo` ('ENTRATA'|'USCITA'), `importo`, `causale`, `fornitore_nome`, `note`, `created_by`, `created_at`.

## 7.3 UI

Pagina `FlussiCassaContanti.jsx`:
- Saldo cassa corrente in alto (calcolato da somma movimenti)
- Lista movimenti con filtri (data, tipo, importo)
- Form nuovo movimento (modal)

## 7.4 Endpoint

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/flussi-cassa/contanti/` | Lista |
| POST | `/flussi-cassa/contanti/` | Crea movimento |
| PUT | `/flussi-cassa/contanti/{id}` | Modifica |
| DELETE | `/flussi-cassa/contanti/{id}` | Elimina |
| GET | `/flussi-cassa/contanti/saldo` | Saldo corrente |

---

# 8. Mance (`/flussi-cassa/mance`)

> Sub-modulo separato. Spostato qui dal modulo Vendite nel 2026-03-30.

## 8.1 Scopo

Gestire la distribuzione cumulativo delle mance staff. Le mance vengono raccolte giorno per giorno (in `shift_closures.mance` o inserite manualmente) e distribuite settimanalmente/mensilmente tra i dipendenti.

## 8.2 DB

- `mance_giorni` — `data`, `importo`, `note`
- `mance_distribuzioni` — `periodo_inizio`, `periodo_fine`, `dipendente_id`, `quota`, `note`, `data_distribuzione`

## 8.3 UI

Pagina `FlussiCassaMance.jsx`:
- Cumulativo mance del periodo selezionato
- Lista giorni con importo
- Form distribuzione: seleziona dipendenti + quota (% o fissa)
- Storico distribuzioni

---

# 9. Scadenzario uscite (CG Uscite)

Vedi `modulo_controllo_gestione.md` §3.3 "Tabellone Uscite".

Riepilogo:
- Tabella `cg_uscite` popolata da Acquisti (import fatture), Dipendenti (busta paga, futuro), CG (spese ricorrenti)
- 4 stati: DA_PAGARE / PAGATA / SCADUTA / SENZA_SCADENZA
- 4 tipi: FATTURA / STIPENDIO / PROFORMA / SPESA_RICORRENTE
- Banca legge `cg_uscite` per matching movimenti

---

# 10. Frontend

```
frontend/src/pages/banca/
├── BancaMenu.jsx                  -- /banca, hub con KPI
├── BancaNav.jsx                   -- nav con tab (Movimenti, Estratti, Riconciliazione, Impostazioni)
├── BancaMovimenti.jsx             -- /banca/movimenti
├── BancaEstratti.jsx              -- /banca/estratti
├── BancaImport.jsx                -- /banca/import
├── BancaRiconciliazione.jsx       -- /banca/riconciliazione (vista matching auto)
└── BancaImpostazioni.jsx          -- /banca/impostazioni (conti, mappature, soglie)

frontend/src/pages/flussi-cassa/
├── FlussiCassaMenu.jsx            -- /flussi-cassa, hub
├── FlussiCassaContanti.jsx        -- /flussi-cassa/contanti
└── FlussiCassaMance.jsx           -- /flussi-cassa/mance
```

> ⚠️ **Nota:** la struttura sopra riflette la convenzione canonica. Da verificare al primo intervento se la cartella si chiama `pages/banca/` o `pages/admin/` (per pre-refactor).

## 10.1 Colore tema

- Banca: **sky/cyan** (acqua, denaro, fluidità) — coordinato con Controllo Gestione
- Flussi Cassa: **emerald** (contanti = verde tradizionale)

---

# 11. Roadmap modulo (sintesi — dettaglio in `roadmap.md` §B)

| ID | Cosa | Priorità |
|----|------|----------|
| B.1 | Import CSV BPM + Sella | ✅ FATTO |
| B.2 | Anti-duplicazione import | ✅ FATTO |
| B.3 | Match manuale movimento ↔ uscita | ✅ FATTO |
| B.4 | Algoritmo matching automatico | ⏳ |
| B.5 | Match 1:N (bonifici cumulativi) | ⏳ |
| B.6 | Import PDF estratto conto (parsing) | ⏳ (vedi CC.* per la carta) |
| B.7 | Dashboard Banca (saldo, trend, top movimenti) | ⏳ |
| B.8 | Cross-check POS chiusure turno ↔ accrediti banca | ⏳ |

## 11.1 Sub-modulo Carta di Credito (CC.*)

**Sessione CC, aperta 2026-06-02.** Backend in produzione, UI ancora scheletro.

**Convenzione storage:** i movimenti carta vivono dentro `banca_movimenti` con `banca = 'CARTA_<EMITT>_<ULT3>'` (es. `CARTA_BPM_623`). Vanno **esclusi** dal saldo CC via `WHERE banca NOT LIKE 'CARTA_%'`. Decisione architetturale 2026-06-02: riuso vs nuova tabella `carta_movimenti` → riuso, con colonne carta-specifiche aggiunte via mig 140.

**Nuove tabelle (mig 140):**
- `carte_credito` — anagrafica multi-carta (oggi 1, predisposto N). PK funzionale: `codice_posizione` (UNIQUE).
- `carta_estratti` — un record per PDF importato. PK contenuto: `pdf_sha256` (UNIQUE, dedup re-upload).

**Nuove colonne su `banca_movimenti`:**
`carta_codice_riferimento` (23 cifre BPM, dedup naturale UNIQUE), `carta_mcc` (8 cifre merchant category), `carta_estratto_id` (FK), `valuta_estera`, `importo_estero`, `cambio_valuta`, `magg_circuito`, `magg_cambio`.

**Due livelli di riconciliazione (vedi CC.4, CC.5):**
- **Livello A** — singolo movimento carta ↔ uscita CG con `metodo_pagamento='CARTA'` e `banca_movimento_id IS NULL`. Quando matchato, l'uscita passa da `PAGATO_MANUALE` a `PAGATO`.
- **Livello B** — l'estratto carta (mensile) ↔ movimento `banca_movimenti` sul CC bancario che rappresenta l'addebito unico dell'emittente. Match su `addebito_totale_cc` + `data_valuta_addebito`. Si registra in `carta_estratti.banca_movimento_id`.

| ID | Cosa | Stato |
|----|------|-------|
| CC.1 | Parser PDF estratto carta Banco BPM | ✅ FATTO (2026-06-02, `app/services/carta_pdf_parser.py`) |
| CC.2 | Schema DB + endpoint backend carta | ✅ FATTO (2026-06-02, mig 140, `app/routers/banca_carta_router.py`) |
| CC.3 | UI CartaCreditoPage (lista carte/estratti/movimenti, upload PDF) | ⏳ |
| CC.4 | Riconciliazione livello A (movimento carta ↔ uscita CG) | ⏳ |
| CC.5 | Riconciliazione livello B (estratto ↔ addebito CC) + riepilogo mensile | ⏳ |

**Endpoint attivi (`/banca/carta/*`):**
- `POST /banca/carta/upload` — upload PDF Banco BPM, parse via `carta_pdf_parser`, insert in `carta_estratti` + N righe in `banca_movimenti`. Dedup su `pdf_sha256`. Sanity check quadratura ai centesimi; 422 se non quadra.
- `GET /banca/carta/carte` — lista carte attive con conteggio estratti/movimenti.
- `GET /banca/carta/carte/{id}` — dettaglio singola carta.
- `GET /banca/carta/estratti?carta_id=` — lista estratti.
- `GET /banca/carta/estratti/{id}` — dettaglio estratto + movimenti.
- `DELETE /banca/carta/estratti/{id}` — rollback import (bloccato se ci sono `banca_fatture_link` attivi).

**Parser PDF — formato supportato (Banco BPM):**
PDF testuale 4 pagine. Riga normale: `[cod_rif 23] [mcc 8] [data_op] [data_reg] [descrizione] [importo]`. Movimenti esteri: 2 righe (riga principale con `[imp_estero] [VAL] [cambio]` + riga successiva `MAGG. CIRCUITO € X MAGG. CAMBIO € Y`). Validato sui 5 estratti gen-mag 2026: 127 movimenti, quadratura ai centesimi su totale movimenti e su addebito CC. Dipendenza runtime: `pdftotext` (poppler-utils).

> **Note Marco (Batch 3 roadmap reorganization):** voci B.x specifiche da approfondire al prossimo passaggio. Lasciato segnaposto qui.
