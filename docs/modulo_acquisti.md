# Modulo Gestione Acquisti — TRGB Gestionale

**Ultimo aggiornamento:** 2026-05-08 (consolidamento docs + assorbita spec proforme)
**Stato:** stabile (proforme in pausa — vedi §11)
**Versione modulo (`versions.jsx`):** acquisti/fatture v2.3
**Sezione top-level:** `/acquisti`
**Backend prefix:** `/contabilita/fe/*`
**Roadmap:** sezione `A.` di `docs/roadmap.md`

---

# 0. Indice

1. Panoramica
2. Funzionalità (menu + dashboard + elenco + dettaglio)
3. Dettaglio fornitore (sidebar colorata + tabs)
4. Import XML + anti-duplicazione
5. Categorie e sottocategorie
6. FattureInCloud (FIC) sync v2
7. Navigazione e routing
8. Backend API
9. Database
10. Frontend (file + struttura)
11. **Pro-forme** (in pausa — spec assorbita 2026-04-13, A.5+A.6 in pausa per priorità)
12. Changelog

---

# 1. Panoramica

Il modulo **Gestione Acquisti** (precedentemente "Fatture Elettroniche XML") è di primo livello, accessibile direttamente dalla Home. Importa fatture elettroniche FatturaPA in XML, sincronizza con FattureInCloud (FIC) API v2, analizza acquisti per fornitore/categoria, gestisce categorizzazione prodotti.

Lavora **in tandem con Ricette/Matching** che legge `fe_righe` per agganciare prezzi (vedi `modulo_ricette_foodcost.md` §6).

---

# 2. Funzionalità

## 2.1 Menu Principale (`/acquisti`)
Hub con mini-KPI (n. fatture, totale spesa, n. fornitori, media mensile), barra di ricerca globale, 5 tile di accesso rapido.

## 2.2 Dashboard Acquisti (`/acquisti/dashboard`)
KPI avanzati, grafici mensili (BarChart), distribuzione categorie (PieChart con donut sottocategorie), confronto annuale stesso periodo, top fornitori, anomalie. Drill-down: click su barra/fetta espande dettaglio con lista fatture. Anno default = current year.

## 2.3 Elenco Fatture (`/acquisti/elenco`)
Lista completa con ricerca full-text (fornitore, P.IVA, numero fattura), filtri (anno, mese, importo min/max, fornitore, categoria), paginazione server-side. Click riga → dettaglio.

## 2.4 Dettaglio Fattura (`/acquisti/dettaglio/:id`)
Info complete: fornitore (nome + P.IVA), importi (imponibile, IVA, totale), righe fattura (descrizione, quantità, prezzo unitario, totale). Editor scadenza/IBAN/modalità pagamento. Link a pagina fornitore.

## 2.5 Elenco Fornitori (`/acquisti/fornitori`)
Layout Cantina: sidebar filtri sx + lista/dettaglio inline dx.
- **Sidebar filtri:** ricerca testo, anno, categoria fornitore (dropdown), stato prodotti (ok/auto/partial/none/empty)
- **Tabella:** tutte le colonne ordinabili (`SortTh`): Fornitore, Cat, P.IVA, Fatture, Totale, Media, Primo, Ultimo
- **Selezione massiva:** checkbox + assegnazione categoria bulk
- **Dettaglio inline:** click su fornitore apre dettaglio senza cambio pagina

## 2.6 Import XML (`/acquisti/import`)
Drag & drop XML multipli o selezione file. Anti-duplicazione SHA-256 (`xml_hash` su `fe_fatture`). Lista fatture importate con dettaglio.

## 2.7 Categorie (`/acquisti/categorie`)
Gestione albero Cat.1/Cat.2 (categorie e sottocategorie). Assegnazione fornitori a categorie. Esclusione fornitori (autofatture, non pertinenti).

## 2.8 FattureInCloud Sync (`/acquisti/impostazioni` tab FIC)
Sincronizzazione automatica fatture ricevute da API v2 FIC. Tracciamento stato (`nuova`/`aggiornata`/`merged_xml`). Lista fatture senza dettaglio (`is_detailed: false`) con warning. **XML enrichment:** se FIC ritorna `is_detailed: false` (no righe), il sistema tenta match con XML importato per aggiungere righe e importi.

---

# 3. Dettaglio fornitore (`FattureFornitoreDettaglio.jsx` v3.2)

Layout due colonne coerente con `FattureDettaglio` e `SchedaVino`: **sidebar colorata 300px** + area principale dx (`grid-cols-1 lg:grid-cols-[300px_1fr]`). Top bar bianca sopra con back button e toggle "Nascondi da acquisti / Ripristina".

## 3.1 Sidebar colorata — stato semantico

Gradiente dinamico:
- **teal** → ATTIVO (default)
- **amber** → IN SOSPESO (fornitore con fatture da pagare)
- **slate** → ESCLUSO (`escluso_acquisti = 1`)

Costante `FORNITORE_SIDEBAR` + helper `getFornitoreSidebar(isExcluded, nDaPagare)`.

**Contenuto sidebar:**
- Header: nome + P.IVA + C.F. + badge stato + contatore fatture
- Box "Totale spesa" + 4 KPI compatti (Imponibile, Media fattura, Prodotti, Pagate/Totali)
- Box rosso "⚠ Da pagare" (se `nDaPagare > 0`) con importo e numero fatture aperte
- Info list: primo + ultimo acquisto
- Sede anagrafica (indirizzo, CAP, città, provincia, nazione) da XML
- Distribuzione categorie (prime 6, pill compatti)
- ID tecnico (P.IVA o nome) in basso

## 3.2 Area principale

Sfondo bianco, sezioni separate da `SectionHeader` uniforme:

- **Banner esclusione** (ambra, solo se escluso)
- **Categoria generica fornitore:** assegnazione con propagazione alle righe senza categoria + pill con distribuzione categorie calcolate
- **Condizioni di pagamento:** preset modalità+giorni, banner "Auto-rilevato" se il sistema ha stimato da fatture passate, note aggiuntive, badge "✓ Default salvato"
- **Tabs Fatture / Prodotti:**
  - **Tab Fatture:** lista ordinabile con stato pagamento, fonte (XML/FIC), badge "≠" se modalità pagamento fattura diverge dal default fornitore. Click riga → **`FattureDettaglio` inline** (unificato, stesso componente del dettaglio standalone): editor scadenza/IBAN/modalità, gestione righe, sync automatico con sidebar (contatore "Da pagare" si aggiorna dopo `Segna pagata`). Selezione massiva per segnare pagate/non pagate in batch.
  - **Tab Prodotti:** lista ordinabile con assegnazione categoria/sottocategoria per riga, filtro (tutti/da assegnare/ereditate/definite), selezione massiva, bulk edit bar teal.

---

# 4. Import XML + anti-duplicazione

## 4.1 Pipeline

1. Drag & drop XML (uno o più) o selezione file
2. Calcolo `xml_hash` SHA-256 sul file
3. Check duplicati: se `xml_hash` già in `fe_fatture` → skip (record già importato)
4. Parsing XML FatturaPA: estrazione header (fornitore, importi) + righe
5. Auto-creazione fornitore in `suppliers` se P.IVA non già presente
6. Insert in `fe_fatture` + `fe_righe`
7. Categorizzazione automatica righe se esiste mapping `fe_prodotto_categoria` o categoria generica fornitore (`categoria_auto=1`)

## 4.2 Auto-fatture

Le auto-fatture (P.IVA fornitore = P.IVA azienda) sono marcate con `is_autofattura=1`. Filtrate fuori dalle stats principali ma visibili nell'elenco con badge.

---

# 5. Categorie e sottocategorie

## 5.1 Schema

- `fe_categorie` — albero piatto: `id`, `nome`, `parent_id` (NULL = categoria, non-NULL = sottocategoria)
- `fe_fornitore_categoria` — assegnazione categoria a fornitore (`fornitore_piva`, `fornitore_nome`, `categoria_id`, `sottocategoria_id`, `escluso`, `escluso_acquisti`)
- `fe_prodotto_categoria` — assegnazione categoria a singolo prodotto (`fornitore_piva`, `descrizione`, `categoria_id`, `sottocategoria_id`)

## 5.2 Regola critica esclusioni

⚠️ **NON mescolare mai i due campi `escluso` (vedi `CLAUDE.md`):**
- `fe_fornitore_categoria.escluso` → SOLO modulo Ricette/Matching
- `fe_fornitore_categoria.escluso_acquisti` → SOLO modulo Acquisti

Confusione tra i due ha già causato un bug critico (sessione 2026-03-28): `_EXCL_JOIN` usava `escluso` nelle query dashboard, escludendo 58 fornitori dai totali acquisti. Fix: `_EXCL_JOIN` ora vuoto, `_EXCL_WHERE` filtra solo autofatture.

---

# 6. FattureInCloud (FIC) Sync v2

## 6.1 Endpoint

| Metodo | Path | Descrizione |
|--------|------|-------------|
| POST | `/contabilita/fe/fic/sync` | Sincronizza fatture ricevute da FIC API v2 (param `force_detail`) |
| GET | `/contabilita/fe/fic/debug-detail/{fic_id}` | Raw FIC response (`is_detailed`, `e_invoice`, `items_list`, ...) |

## 6.2 Flusso

1. POST sync → chiama FIC API v2 endpoint `received_documents`
2. Per ogni fattura ricevuta: check duplicati per `numero_fattura` + `fornitore_piva` + `data_fattura`
3. Se nuova → insert come `fonte='FIC'`, marcata `nuova`
4. Se già presente da XML → marcata `merged_xml` (sovrascrive solo i campi mancanti)
5. Se nuova ma da una fattura aggiornata su FIC → marcata `aggiornata`
6. Se `is_detailed=false` (senza righe) → tentativo XML enrichment: cerca XML con stesso numero+P.IVA → se trovato, copia righe e importi

## 6.3 SyncResult tracking

Risposta sync contiene: `total_processed`, `nuove`, `aggiornate`, `merged`, `senza_dettaglio: [list]`. Lista `senza_dettaglio` mostrata in UI con warning (servirebbe import XML manuale di quelle).

---

# 7. Navigazione e routing

## 7.1 FattureNav

Barra di navigazione persistente su tutte le pagine modulo: **Dashboard, Elenco, Fornitori, Import, Categorie**. Brand link "Acquisti" per tornare al menu, link "Home" in alto a destra.

## 7.2 Routing frontend

```
/acquisti                    — Menu Gestione Acquisti
/acquisti/dashboard          — Dashboard
/acquisti/elenco             — Elenco fatture
/acquisti/dettaglio/:id      — Dettaglio fattura
/acquisti/fornitori          — Elenco fornitori
/acquisti/fornitore/:piva    — Dettaglio fornitore
/acquisti/import             — Import XML
/acquisti/categorie          — Categorie fornitori
/acquisti/impostazioni       — Impostazioni (tab FIC)
```

Eventuale tab futuro `/acquisti/proforme` previsto in spec §11 (in pausa).

---

# 8. Backend API

## 8.1 Router principale

File: `app/routers/fe_import.py`
Prefix: `/contabilita/fe`
Auth: JWT obbligatoria su tutte le route

| Metodo | Path | Descrizione |
|--------|------|-------------|
| POST | `/import` | Import file XML FatturaPA |
| GET | `/fatture` | Elenco con filtri + paginazione |
| GET | `/fatture/{id}` | Dettaglio fattura con righe |
| GET | `/stats/fornitori` | Riepilogo per fornitore |
| GET | `/stats/mensili` | Riepilogo mensile |
| GET | `/stats/categorie` | Distribuzione per categoria (con donut sottocategorie) |
| GET | `/stats/top-fornitori` | Top N fornitori per spesa |
| GET | `/stats/kpi` | KPI globali (n_fatture, totale_spesa, n_fornitori, spesa_media_mensile) |
| GET | `/stats/drill` | Drill-down per anno/mese/categoria |
| GET | `/stats/anomalie` | Anomalie e variazioni anno su anno |
| GET | `/stats/confronto-annuale` | Confronto tra due anni stesso periodo (cutoff `MAX(data_fattura)`) |
| POST | `/fic/sync` | Sync FIC API v2 |
| GET | `/fic/debug-detail/{fic_id}` | Raw FIC response |

## 8.2 Router categorie

Prefix: `/contabilita/fe/categorie`

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/` | Lista categorie con sottocategorie |
| POST | `/` | Crea categoria |
| POST | `/{id}/sottocategorie` | Crea sottocategoria |
| GET | `/fornitori` | Lista fornitori con assegnazioni |
| POST | `/fornitori/assegna` | Assegna categoria a fornitore |
| POST | `/fornitori/escludi` | Toggle esclusione (Ricette/Matching) |
| POST | `/fornitori/escludi-acquisti` | Toggle esclusione acquisti (modulo Acquisti) |
| GET | `/fornitori/{piva}/prodotti` | Prodotti di un fornitore |
| POST | `/fornitori/prodotti/assegna` | Assegna categoria a prodotto |
| GET | `/fornitori/{piva}/stats` | Stats per fornitore |

---

# 9. Database

Posizione: `app/data/foodcost.db` (DB condiviso con Ricette — vedi `modulo_ricette_foodcost.md` §4 per le tabelle ricette).

## 9.1 Tabelle del modulo Acquisti

### `fe_fatture`
`id`, `fornitore_nome`, `fornitore_piva`, `numero_fattura`, `data_fattura`, `imponibile_totale`, `iva_totale`, `totale_fattura`, `valuta`, `xml_hash` (SHA-256), `xml_filename`, `data_import`, `is_autofattura`, `fonte` ('XML'|'FIC'), `fic_id` (se da FIC), `data_scadenza`, `iban`, `modalita_pagamento`, `data_pagamento`.

### `fe_righe`
`id`, `fattura_id` (FK), `numero_linea`, `descrizione`, `quantita`, `unita_misura`, `prezzo_unitario`, `prezzo_totale`, `aliquota_iva`, `categoria_id`, `sottocategoria_id`, `categoria_auto` (0=manuale, 1=ereditata da import).

### `fe_fornitore_categoria`
`fornitore_piva`, `fornitore_nome`, `categoria_id`, `sottocategoria_id`, `escluso` (Ricette), `escluso_acquisti` (Acquisti). Vedi §5.2 per la regola critica.

### `fe_prodotto_categoria`
`fornitore_piva`, `fornitore_nome`, `descrizione`, `categoria_id`, `sottocategoria_id`.

### `fe_categorie`
`id`, `nome`, `parent_id` (NULL=cat, non-NULL=subcat).

## 9.2 Migrazioni significative

- **029** (2026-03-28): reset `categoria_auto` residue (Latini, Risto Team)
- **030** (2026-03-28): aggiunge colonna `escluso_acquisti` a `fe_fornitore_categoria`
- **065** (proforme): pendente — vedi §11

---

# 10. Frontend — file

```
frontend/src/pages/admin/
  FattureMenu.jsx               — Hub principale (/acquisti)
  FattureDashboard.jsx          — Dashboard acquisti
  FattureElenco.jsx             — Elenco fatture
  FattureDettaglio.jsx          — Dettaglio fattura (riusato anche inline)
  FattureFornitoriElenco.jsx    — Elenco fornitori
  FattureFornitoreDettaglio.jsx — Dettaglio fornitore (sidebar colorata v3.2)
  FattureImport.jsx             — Import XML
  FattureCategorie.jsx          — Categorie
  FattureNav.jsx                — Barra navigazione persistente
```

---

# 11. Pro-forme — spec assorbita (in pausa)

> **Stato:** SPEC pronta dal 2026-04-13. Voci A.5 (FE proforme creazione) + A.6 (FE proforme riconciliazione) **in PAUSA** (decisione Marco, Batch 3 roadmap reorganization). Lasciate per priorità più alte. Quando si riprende, partire da qui.

## 11.1 Contesto

Alcuni fornitori emettono una **proforma** prima della fattura definitiva, per ottenere anticipi o per motivi fiscali (le tasse si pagano solo sulla fattura). La proforma non è un documento fiscale: serve solo a tracciare un impegno di pagamento nello scadenziario. Quando arriva la fattura vera (da FIC o XML), la proforma viene riconciliata e scompare.

## 11.2 Requisiti (da Marco)

1. Creazione manuale in Acquisti — campi base: fornitore, importo, scadenza, note
2. Visibile SOLO nello scadenziario (`cg_uscite`) — NON nelle statistiche/dashboard/KPI Acquisti
3. Riconciliazione manuale — quando arriva la fattura, Marco la collega
4. Post-riconciliazione: la proforma viene assorbita/nascosta, la fattura prende tutto
5. Creazione da: ricerca fornitore esistente OPPURE da pagina dettaglio fornitore

## 11.3 Database — `fe_proforme`

```sql
CREATE TABLE IF NOT EXISTS fe_proforme (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    fornitore_piva      TEXT,
    fornitore_nome      TEXT NOT NULL,
    importo             REAL NOT NULL,
    data_scadenza       TEXT NOT NULL,       -- YYYY-MM-DD
    data_emissione      TEXT,                -- opzionale
    numero_proforma     TEXT,                -- riferimento del fornitore (opzionale)
    note                TEXT,
    stato               TEXT NOT NULL DEFAULT 'ATTIVA',
        -- ATTIVA: visibile nello scadenziario
        -- RICONCILIATA: collegata a fattura, nascosta
        -- ANNULLATA: annullata manualmente
    fattura_id          INTEGER,             -- FK → fe_fatture(id), NULL finché non riconciliata
    cg_uscita_id        INTEGER,             -- FK → cg_uscite(id)
    data_riconciliazione TEXT,
    created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fe_proforme_stato ON fe_proforme(stato);
CREATE INDEX IF NOT EXISTS idx_fe_proforme_fornitore ON fe_proforme(fornitore_piva);
CREATE INDEX IF NOT EXISTS idx_fe_proforme_fattura ON fe_proforme(fattura_id);
```

**Migrazione:** `065_fe_proforme.py`.

## 11.4 Integrazione con `cg_uscite` (modulo Banca)

Quando si crea una proforma, si crea **anche** una riga in `cg_uscite` con:
- `tipo_uscita = 'PROFORMA'`
- `fattura_id = NULL`
- `fornitore_nome`, `totale`, `data_scadenza` dalla proforma
- `stato = 'DA_PAGARE'`

Questo fa apparire la proforma nello scadenziario senza toccare le stats fatture (filtrate per `tipo_uscita = 'FATTURA'`).

Quando la proforma viene riconciliata:
1. Riga `cg_uscite` con `tipo_uscita = 'PROFORMA'` viene cancellata (o marcata ANNULLATA)
2. Import fatture normale crea la sua riga `cg_uscite` dalla fattura vera
3. `fe_proforme.fattura_id` punta alla fattura collegata

## 11.5 Backend API

Router: `app/routers/fe_proforme_router.py` (da creare)
Prefix: `/contabilita/fe/proforme`
Auth: JWT obbligatoria

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/` | Lista (filtri: stato, fornitore, da/a) |
| POST | `/` | Crea proforma + riga `cg_uscite` |
| GET | `/{id}` | Dettaglio |
| PUT | `/{id}` | Modifica (solo se ATTIVA) |
| DELETE | `/{id}` | Annulla (stato → ANNULLATA, cancella `cg_uscite`) |
| POST | `/{id}/riconcilia` | Riconcilia con fattura: `{ fattura_id: N }` |
| POST | `/{id}/dissocia` | Annulla riconciliazione (torna ATTIVA, ricrea `cg_uscite`) |
| GET | `/candidates/{id}` | Fatture candidate per riconciliazione |

### Logica `POST /` (creazione)
1. Insert in `fe_proforme`
2. Crea riga in `cg_uscite` con `tipo_uscita='PROFORMA'`
3. Update `fe_proforme.cg_uscita_id`

### Logica `POST /{id}/riconcilia`
1. Verifica `proforma.stato == 'ATTIVA'`
2. Verifica `fattura_id` esista in `fe_fatture`
3. Update `fe_proforme`: `stato='RICONCILIATA'`, `fattura_id=N`, `data_riconciliazione=oggi`
4. Cancella (o marca ANNULLATA) la riga `cg_uscite` collegata alla proforma

## 11.6 Frontend

### Lista Proforme — sottotab in Acquisti
- Nuova voce in `FattureNav.jsx`: **"Pro-forme"**
- Pagina: `FattureProformeElenco.jsx` → `/acquisti/proforme`
- Tabella: fornitore, importo, scadenza, stato, azioni
- Filtro sidebar: stato (Attive / Riconciliate / Tutte), periodo
- Badge contatore "Attive" nella nav
- Riga colorata: ATTIVA = normale, RICONCILIATA = sfumata + link a fattura, ANNULLATA = barrata

### Modale creazione proforma
Richiamabile da:
1. Pulsante "Nuova Proforma" nella lista
2. Pulsante in pagina dettaglio fornitore

Campi:
- **Fornitore:** autocomplete su `fe_fornitore_categoria` (P.IVA + nome). Se creata da dettaglio fornitore, pre-compilato. Se non esiste → toggle "Nuovo fornitore" con: Nome (obbligatorio), P.IVA (consigliato), C.F. (opzionale). Al salvataggio, crea riga in `fe_fornitore_categoria`.
- Importo €
- Data scadenza (datepicker)
- Numero proforma (testo libero opzionale)
- Data emissione (datepicker opzionale)
- Note (textarea)

### Riconciliazione
- Dalla lista: azione "Riconcilia" → modale con fatture candidate (stesso fornitore, ±20% importo, non già collegate) → click conferma → stato RICONCILIATA
- Da `FattureDettaglio.jsx`: se esistono proforme attive dello stesso fornitore, banner "Proforma collegabile" con azione rapida

## 11.7 Impatto su viste esistenti

- **Scadenziario CG Uscite:** righe con `tipo_uscita='PROFORMA'` appaiono normalmente, badge "PROFORMA". Click → dettaglio proforma (non fattura)
- **Dashboard Acquisti / KPI:** NESSUN impatto (query usano `fe_fatture` direttamente, proforme in tabella separata)
- **Stats su `cg_uscite`:** filtrare per `tipo_uscita = 'FATTURA'` o ignorare il campo per non inquinare totali
- **Import uscite:** nessuna modifica

## 11.8 Fasi implementative (quando si riprende)

| Fase | Cosa | Stima |
|------|------|-------|
| 1 | Migrazione DB `065_fe_proforme.py` | XS |
| 2 | Router backend `fe_proforme_router.py` (CRUD + riconciliazione) | M |
| 3 | Frontend `FattureProformeElenco.jsx` + modale creazione | M |
| 4 | Frontend riconciliazione (modale candidati + banner in dettaglio fattura) | M |
| 5 | Integrazione nav (tab `FattureNav`, badge, link da fornitore) | XS |
| 6 | Verifica: proforme visibili in scadenziario CG, NON nelle stats Acquisti | XS |

## 11.9 Decisioni confermate Marco

1. **Pagamento proforma:** scadenziario lo gestisce normalmente (DA_PAGARE → PAGATA). Quando si riconcilia con la fattura, la fattura arriva già "coperta".
2. **Fornitore nuovo:** form di creazione include mini-form "nuovo fornitore" con campi utili al matching FIC/XML (Nome obbligatorio, P.IVA consigliato, C.F. opzionale). Indirizzo e altri dati arriveranno dalla fattura vera al momento della riconciliazione. Il nuovo fornitore viene creato in `fe_fornitore_categoria` così è subito visibile in tutto il modulo Acquisti.

---

# 12. Changelog

## v2.3 — Dettaglio fornitore v3.2 (2026-04-10)
- Refactor grafico `FornitoreDetailView` — layout sidebar colorata 300px + area principale (allineato a `FattureDettaglio` / `SchedaVino`). Top bar bianca con back + toggle esclusione.
- Sidebar colorata stato semantico: teal (ATTIVO) / amber (IN SOSPESO) / slate (ESCLUSO). Helper `getFornitoreSidebar(isExcluded, nDaPagare)`.
- `SectionHeader` locale uniforme per "Categoria generica" e "Condizioni di pagamento".
- Unificazione dettaglio fattura inline: eliminato `FatturaInlineDetail` (~130 righe duplicate), usato `<FattureDettaglio fatturaId inline />`.
- Sync coerente sidebar ↔ tabella su `onSegnaPagata` e `onFatturaUpdated`.
- File header: `v3.2-fornitore-sidebar-colorata`.

## v2.3 (2026-03-28)
- **CRITICO** — Rimosso filtro `escluso` da query acquisti (era usato erroneamente nelle query dashboard, escludeva 58 fornitori). `_EXCL_JOIN` ora vuoto, `_EXCL_WHERE` filtra solo autofatture.
- Filtro categoria sidebar fornitori (dropdown + opzione "Senza categoria")
- Confronto annuale stesso periodo (cutoff `MAX(data_fattura)`)
- Fix anno default dashboard: `fetchAll(selectedYear)` al mount
- Donut sottocategorie: grafico categorie con due anelli (cat interno + sub esterno) + drill-down
- Fix refresh categorie prodotti
- Rimosso pulsante "Escludi fornitore" dal dettaglio (inutile)
- P.IVA + C.F. stessa riga, KPI "Media fattura" e "Da pagare"
- Migrazione 029 (reset `categoria_auto` residue) + 030 (`escluso_acquisti`)
- Backend `stats_fornitori` riscritto con subquery; `_CAT_JOIN` separato da `_EXCL_JOIN`

## v2.1 (2026-03-22)
- FattureInCloud sync v2.0 con `SyncResult` tracking
- XML enrichment: FIC `is_detailed: false` arricchite da XML
- Debug endpoint `/fic/debug-detail/{fic_id}`
- UI senza_dettaglio con warning box
- Anno default = current year (Elenco + Dashboard)
- Backend cleanup: rimosso `escluso` da `/fatture` list
- Infrastructure: nginx `proxy_read_timeout = 600s` per `trgb.tregobbi.it`
- 58 fornitori `escluso=1` (product matching only), zero duplicates

## v2.0 (2026-03-10)
- Promosso a modulo di primo livello ("Gestione Acquisti")
- Route migrate da `/admin/fatture/*` a `/acquisti/*`
- Aggiunte pagine Elenco Fornitori + Elenco Fatture + Dettaglio Fattura
- Navigazione persistente (`FattureNav`) + tab "Fornitori"
- Menu con 5 tile + mini-KPI + ricerca globale
- Dashboard con drill-down interattivo
- Backend `/fatture` con filtri + paginazione

## v1.2 (2025-12-05)
- Prima release operativa: import XML, parsing, anti-duplicazione SHA-256
- Dashboard acquisti (fornitori + mensile)
- Drag & drop import
