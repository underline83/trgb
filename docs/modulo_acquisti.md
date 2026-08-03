# Modulo Gestione Acquisti — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03
> **Vedi anche:** [modulo_fatture_xml.md](modulo_fatture_xml.md) (import SDI), [modulo_fatture_in_cloud.md](modulo_fatture_in_cloud.md) (sync FIC), [modulo_ricette_foodcost.md](modulo_ricette_foodcost.md) (matching)

**Stato:** stabile · proforme attive end-to-end (creazione + riconciliazione UI, vedi §11)
**Versione modulo (`versions.jsx`):** acquisti/fatture v3.1 (chiave `fatture`, label "Gestione Acquisti")
**Sezione top-level:** `/acquisti`
**Backend prefix:** `/contabilita/fe/*` (fe_import, categorie, proforme) + `/fic/*` (FattureInCloud, senza `/contabilita/` — vedi §6)
**Roadmap:** sezione `A.` di `docs/roadmap.md`

---

# 0. Indice

1. Panoramica
2. Funzionalità (dashboard + elenco + dettaglio + fornitori + impostazioni)
3. Dettaglio fornitore (testa fissa + tab, v4.0)
4. Import XML + anti-duplicazione
5. Categorie e sottocategorie
6. FattureInCloud (FIC) sync
7. Navigazione e routing
8. Backend API
9. Database
10. Frontend (file + struttura)
11. **Pro-forme** — spec assorbita 2026-04-13, A.5+A.6 ✅ implementate (`FattureProformeElenco.jsx`, route `/acquisti/proforme`)
12. Changelog

---

# 1. Panoramica

Il modulo **Gestione Acquisti** (precedentemente "Fatture Elettroniche XML") è di primo livello, accessibile direttamente dalla Home. Importa fatture elettroniche FatturaPA in XML, sincronizza con FattureInCloud (FIC) API v2, analizza acquisti per fornitore/categoria, gestisce categorizzazione prodotti.

Lavora **in tandem con Ricette/Matching** che legge `fe_righe` per agganciare prezzi (vedi `modulo_ricette_foodcost.md` §6).

---

# 2. Funzionalità

## 2.1 Entry point `/acquisti`
`/acquisti` è un **redirect a `/acquisti/dashboard`** (`App.jsx:349`). Il vecchio hub "Menu Gestione Acquisti" con tile e mini-KPI (`FattureMenu.jsx`) è stato rimosso: il file non esiste più nel repo. *(storico, superato dal redesign nav v2.0)*

## 2.2 Dashboard Acquisti (`/acquisti/dashboard`)
`FattureDashboard.jsx` (v3.1): KPI (`/stats/kpi` con delta vs anno precedente stesso periodo), grafici mensili (BarChart), distribuzione categorie (PieChart con donut sottocategorie, da `/stats/per-categoria`), confronto annuale (`/stats/confronto-annuale`), top 10 fornitori (`/stats/top-fornitori`), anomalie (`/stats/anomalie?soglia_pct=30`). Drill-down: click su barra/fetta chiama `/stats/drill` ed espande la lista fatture. Anno default = current year.

## 2.3 Elenco Fatture (`/acquisti/fatture`)
`FattureElenco.jsx` (v3.3). Path canonico `/acquisti/fatture`; il vecchio `/acquisti/elenco` è un redirect. Layout Cantina: sidebar filtri sx + lista dx. Il fetch è unico (`GET /fatture?limit=10000`) e **filtri/ordinamento/paginazione sono lato client** (50 righe per pagina), non server-side. Filtri: ricerca testo, numero, anno, mese, fornitore, P.IVA, fonte (xml/fic), stato pagamento, importo (range/soglia), tipo (autofatture), toggle "mostra esclusi" (`escluso_acquisti`). Click riga → **dettaglio inline** con il componente riusabile `FattureDettaglio`.

## 2.4 Dettaglio Fattura (`/acquisti/dettaglio/:id`)
`FattureDettaglio.jsx` (v3.1-3D) — componente riutilizzabile: pagina standalone e inline in `FattureElenco`, `FattureFornitoriElenco` (con breadcrumb anti-matrioska) e `ControlloGestioneUscite`. Testa fissa colorata soft in base allo stato + 4 tab: **Riepilogo / Pagamenti / Righe / Conto Economico**.
- Stato: chip **D1+D2 separato da D3** secondo il modello 3-dimensioni (`StatoPagamentoBadge` + `StatoScadenzaBadge`, vedi `stato_pagamento_unificato.md` §15).
- Tab Pagamenti: azioni stato (segna pagata manuale / da verificare / riporta a da pagare), editor override scadenza prevista, IBAN beneficiario, modalità pagamento (dropdown codici MP01..MP23).
- Tab Conto Economico (C.2): impatto P&L via `GET /fatture/{id}/ce-impatto`, editor competenza override (G.3.1b) e spalmatura su N mesi (C1/G.3.2), chip read-only in header.

## 2.5 Elenco Fornitori (`/acquisti/fornitori`)
`FattureFornitoriElenco.jsx` (v4.0-tabs). Layout Cantina: sidebar filtri sx + lista/dettaglio inline dx.
- **Sidebar filtri:** ricerca testo, anno, categoria fornitore (dropdown), stato prodotti (`cat_status`: ok/auto/partial/none/empty), stato dati pagamento (`pag_status`: ok/partial/default/none), toggle "mostra esclusi"
- **Tabella:** colonne ordinabili (`SortTh`): Fornitore, Cat, Pag, Fatture, Totale €, Media, Primo, Ultimo (`FattureFornitoriElenco.jsx:566-574`). P.IVA è una colonna semplice non ordinabile, nascosta su schermi stretti
- **Selezione massiva:** checkbox + assegnazione categoria bulk (bulk edit bar)
- **Dettaglio inline:** click su fornitore apre il dettaglio senza cambio pagina (vedi §3)

## 2.6 Import XML (Impostazioni → sezione "Import XML")
La vecchia route `/acquisti/import` è ora un **redirect a `/acquisti/impostazioni`**: l'import vive nella pagina Impostazioni (`FattureImpostazioni.jsx`, sezione `xml`). Drag & drop o selezione di XML multipli **e ZIP** (anche ZIP annidati un livello). Anti-duplicazione SHA-256 (`xml_hash` UNIQUE su `fe_fatture`). Limiti infrastruttura: upload max 100 MB (nginx), timeout 10 min (AbortController FE). Endpoint: `POST /contabilita/fe/import`.

## 2.7 Categorie (Impostazioni → sezione "Categorie")
La vecchia route `/acquisti/categorie` è ora un **redirect a `/acquisti/impostazioni`** (sezione `categorie`): CRUD categorie/sottocategorie (due tabelle `fe_categorie` + `fe_sottocategorie`, vedi §5), rinomina, elimina, sposta sottocategoria sotto un'altra categoria. L'assegnazione fornitore→categoria e le esclusioni si fanno dalle pagine Fornitori.

## 2.8 Impostazioni (`/acquisti/impostazioni`)
`FattureImpostazioni.jsx` (v2.4) — pagina admin con sidebar a 6 sezioni: **Import XML** (§2.6), **Fatture in Cloud** (connessione token, sync, debug dettaglio, recupero righe da XML singolo/bulk — vedi §6 e `modulo_fatture_in_cloud.md`), **Categorie** (§2.7), **Cond. Pagamento** (preset condizioni via `/controllo-gestione/condizioni-pagamento/preset`), **Stato Database** (conteggi import), **Manutenzione** (merge duplicati FIC+XML, svuota DB fatture).

---

# 3. Dettaglio fornitore (`FornitoreDetailView` in `FattureFornitoriElenco.jsx`, v4.0-tabs)

Redesign sessione 56 (2026-04-25). Il dettaglio fornitore vive **inline dentro `FattureFornitoriElenco.jsx`** (componente `FornitoreDetailView`); il file `FattureFornitoreDettaglio.jsx` (v4.0-redirect) è ridotto a uno stub che fa redirect a `/acquisti/fornitori` (la route `/acquisti/fornitore/:piva` esiste ancora ma rimanda alla lista).

## 3.1 Layout attuale (v4.0)

- **Testa fissa "soft"** colorata in base allo stato (palette `FORNITORE_HEADER`): teal = ATTIVO, amber = IN SOSPESO (fatture da pagare), slate = ESCLUSO (`escluso_acquisti = 1`). Helper `getFornitoreHeader(isExcluded, nDaPagare)`.
- **4 KPI** in testa: Totale spesa / Fatture pagate / Media fattura / Da pagare.
- **Top bar** con back, link **"+ Proforma"** (porta a `/acquisti/proforme?fornitore=NOME` — nota: la pagina proforme oggi NON legge il query param, quindi niente prefiltro automatico) e toggle "Nascondi da acquisti / Ripristina".
- **3 tab: Anagrafica / Fatture / Prodotti**
  - **Anagrafica:** sede da XML (`GET /fornitori/{key}/anagrafica`), categoria generica con propagazione alle righe senza categoria, condizioni di pagamento (preset modalità+giorni, banner "Auto-rilevato", badge "✓ Default salvato").
  - **Fatture:** lista ordinabile con stato pagamento, fonte (xml/fic), badge "≠" se la modalità pagamento della fattura diverge dal default fornitore. Click riga → **`FattureDettaglio` a tutta pagina** con prop `breadcrumb` cliccabile (Fornitori › Nome › FT numero) — pattern "anti-matrioska": lo state della fattura aperta sale al container. Selezione massiva per segnare pagate/non pagate in batch.
  - **Prodotti:** lista ordinabile con assegnazione categoria/sottocategoria per riga, filtro (tutti/da assegnare/ereditate/definite), selezione massiva, bulk edit bar teal.

## 3.2 Layout precedente v3.2 *(storico, superato dal redesign v4.0)*

Sidebar colorata scura 300px + area principale (`FORNITORE_SIDEBAR` + `getFornitoreSidebar`, ancora presenti nel codice come palette legacy). Sostituito dal pattern testa fissa + tab descritto sopra.

---

# 4. Import XML + anti-duplicazione

## 4.1 Pipeline (`POST /contabilita/fe/import`, `fe_import.py:675`)

1. Upload XML (uno o più) **o ZIP** contenenti XML (anche ZIP annidati un livello, `__MACOSX` ignorato)
2. Calcolo `xml_hash` SHA-256 sul contenuto
3. Check duplicati: se `xml_hash` già in `fe_fatture` → skip; se però alla fattura esistente manca `data_scadenza`, l'import **arricchisce** i dati pagamento (`arricchita_pagamento`)
4. Parsing XML FatturaPA namespace-agnostic: header (tipo documento, fornitore con anagrafica completa da `CedentePrestatore`: CF, indirizzo, CAP, città, provincia, nazione), importi, blocco `DatiPagamento` (condizioni TP01-03, modalità MP01-23, prima scadenza, importo pagamento) + righe `DettaglioLinee`
5. **Dedup cross-fonte con FIC**: se la fattura esiste già con `fonte='fic'` (match `piva+numero+data`, fallback `piva+data+totale` ±0,02 €, fallback singola FIC senza numero per `piva+data`), il record FIC viene arricchito con hash, metadati, importi XML e — se privo di righe — con le righe dal `DettaglioLinee`
6. Altrimenti INSERT in `fe_fatture` (`fonte='xml'`) + `fe_righe`
7. Auto-categorizzazione righe (`auto_categorize_righe` in `fe_categorie_router.py:43`): prima il mapping prodotto `fe_prodotto_categoria_map` (`categoria_auto=0`), poi il default fornitore `fe_fornitore_categoria` sulle righe rimaste scoperte (`categoria_auto=1`)

Nota: l'import **non crea** righe in `suppliers` — la tabella `suppliers` è letta solo per i default di pagamento del fornitore (IBAN, modalità, giorni).

## 4.2 Auto-fatture

Le auto-fatture sono riconosciute dal `TipoDocumento` FatturaPA (TD16-TD21, TD27) e marcate con `is_autofattura=1`. Filtrate fuori dalle stats principali ma visibili nell'elenco con badge.

---

# 5. Categorie e sottocategorie

## 5.1 Schema

Due tabelle separate per i due livelli (NON un albero piatto con `parent_id`):

- `fe_categorie` — livello 1: `id`, `nome`, `ordine`, `attiva`
- `fe_sottocategorie` — livello 2: `id`, `categoria_id` (FK), `nome`, `ordine`, `attiva`
- `fe_fornitore_categoria` — assegnazione categoria a fornitore: `id`, `fornitore_piva`, `fornitore_nome`, `categoria_id`, `sottocategoria_id`, `note`, `escluso`, `motivo_esclusione`, `alias_di`, `escluso_acquisti`
- `fe_prodotto_categoria_map` — assegnazione categoria a singolo prodotto: `id`, `fornitore_piva`, `fornitore_nome`, `descrizione_norm` (descrizione normalizzata lowercase/trim), `categoria_id`, `sottocategoria_id`. Usata anche per l'auto-categorizzazione degli import futuri.

## 5.2 Regola critica esclusioni

⚠️ **NON mescolare mai i due campi `escluso` (vedi `CLAUDE.md`):**
- `fe_fornitore_categoria.escluso` → SOLO modulo Ricette/Matching
- `fe_fornitore_categoria.escluso_acquisti` → SOLO modulo Acquisti

Confusione tra i due ha già causato un bug critico (sessione 2026-03-28): le query dashboard filtravano su `escluso`, escludendo 58 fornitori dai totali acquisti. Il fix dell'epoca tolse `escluso` dalle query. **Stato attuale** (`fe_import.py:1890-1902`): `_EXCL_JOIN` fa il LEFT JOIN su `fe_fornitore_categoria` e `_EXCL_WHERE` filtra autofatture **e** `escluso_acquisti` (il campo corretto per Acquisti); li usano le stats dashboard (kpi, mensili, top-fornitori, confronto-annuale, anomalie). `stats/fornitori` invece esclude solo le autofatture e riporta `escluso_acquisti` come flag: il filtro lo applica la UI col toggle "mostra esclusi".

---

# 6. FattureInCloud (FIC) Sync

> Doc dedicato: [modulo_fatture_in_cloud.md](modulo_fatture_in_cloud.md). Il sync FIC vive nel router dedicato `app/routers/fattureincloud_router.py` con **prefix `/fic/*`** (17 endpoint, senza `/contabilita/`), separato dai router `/contabilita/fe/*`.

## 6.1 Endpoint principali (estratto)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| POST | `/fic/sync` | Sincronizza fatture ricevute da FIC API v2 (query `anno`, `force_detail`) |
| GET | `/fic/debug-detail/{fic_id}` | Raw FIC response (`is_detailed`, `e_invoice`, `items_list`, ...) |

Lista completa dei 17 endpoint in `modulo_fatture_in_cloud.md` §2.

## 6.2 Flusso

1. `POST /fic/sync` → chiama FIC API v2 `received_documents` in due fasi (Fase 1 lista paginata, Fase 2 dettaglio)
2. Deduplica: per `fic_id` se già presente da FIC (→ update header, `aggiornata`); per `fornitore_piva + numero_fattura + data_fattura` se già presente da XML (→ aggancia `fic_id` al record XML, `merged_xml`)
3. Se nuova → insert con `fonte='fic'` (minuscolo), marcata `nuova`
4. Documenti FIC senza numero E senza P.IVA (prima nota mascherata) → skippati con warning `non_fattura` in `fic_sync_warnings` (mig 061+062)
5. Fase 2 dettaglio: righe da `items_list`; se assente ma `e_invoice=true` con `attachment_url` → **XML enrichment**: scarica e parsa l'XML SDI allegato (`fatturapa_parser.download_and_parse`) e popola `fe_righe`
6. Stato pagamento FIC → salvato in `fe_fatture.fic_pagato_raw` e propagato a `cg_uscite` come `PAGATO_MANUALE` (mai sovrascrivendo `PAGATO` da riconciliazione banca)

## 6.3 SyncResult tracking

Risposta sync (`SyncResult`): `nuove`, `aggiornate`, `duplicate_xml`, `merged_xml`, `errori`, `righe_importate`, `totale_api`, `note`, `error_details` (max 50), `items[]` (stato per documento: nuova/aggiornata/merged_xml/skipped_non_fattura), `senza_dettaglio[]`. Lista `senza_dettaglio` mostrata in UI con warning; per quelle si usa il recupero righe da XML (`/fic/refetch-righe-xml/{db_id}` o bulk).

---

# 7. Navigazione e routing

## 7.1 FattureNav (v2.0-refactored-nav)

Barra di navigazione persistente su tutte le pagine modulo, 5 tab: **Dashboard, Fatture, Fornitori, Pro-forme, Impostazioni**. Brand link "Acquisti" → `/acquisti/dashboard`, link "← Home" a destra. Nel dropdown header (`modulesMenu.js:30`) le voci Pro-forme e Impostazioni sono `check: "admin"`.

## 7.2 Routing frontend (`App.jsx:349-360`)

```
/acquisti                    — redirect → /acquisti/dashboard
/acquisti/dashboard          — Dashboard (FattureDashboard)
/acquisti/fatture            — Elenco fatture (FattureElenco)
/acquisti/dettaglio/:id      — Dettaglio fattura (FattureDettaglio)
/acquisti/fornitori          — Elenco fornitori + dettaglio inline (FattureFornitoriElenco)
/acquisti/fornitore/:piva    — stub: redirect → /acquisti/fornitori
/acquisti/proforme           — Pro-forme (FattureProformeElenco, vedi §11)
/acquisti/impostazioni       — Impostazioni (FattureImpostazioni)

Redirect legacy:
/acquisti/elenco             → /acquisti/fatture
/acquisti/import             → /acquisti/impostazioni
/acquisti/categorie          → /acquisti/impostazioni
/acquisti/fic                → /acquisti/impostazioni
```

---

# 8. Backend API

## 8.1 Router principale — 20 endpoint

File: `app/routers/fe_import.py`
Prefix: `/contabilita/fe`
Auth: JWT a livello router (`dependencies=[Depends(get_current_user)]`, riga 37)

| Metodo | Path | Descrizione | Riga |
|--------|------|-------------|------|
| POST | `/import` | Import file XML e/o ZIP FatturaPA (vedi §4.1) | 675 |
| POST | `/fatture/merge-duplicati` | Unisce duplicati FIC+XML: sposta righe da XML a FIC e cancella la copia XML | 740 |
| DELETE | `/fatture` | Svuota tutte le fatture (reset completo, sezione Manutenzione) | 851 |
| GET | `/fatture` | Elenco con filtri (search, year, month, fornitore, piva, importo, categoria) + limit/offset; legge dalla VIEW `fe_fatture_with_stato` | 870 |
| POST | `/fatture/segna-pagate` | Segna N fatture pagate manualmente (scrive `cg_uscite` PAGATO_MANUALE; skip se PAGATO banca) | 983 |
| PUT | `/fatture/{id}/stato-pagamento` | Cambia stato D1 (`da_pagare`/`da_verificare`/`pagato_manuale`; `pagato` solo da riconciliazione banca) via `fatture_stato_service.set_stato` | 1067 |
| POST | `/fatture/segna-non-pagate` | Riporta N fatture a non pagate (PROGRAMMATO o SCADUTO in base alla scadenza) | 1142 |
| GET | `/fatture/{id}` | Dettaglio con righe + uscita `cg_uscite` collegata + campi effettivi (scadenza/MP/IBAN con chain di fallback) + competenza/spalmatura + aggregato categorie per tab CE | 1220 |
| GET | `/fatture/{id}/ce-impatto` | Impatto P&L della fattura (mese/i competenza, importo per mese, % su ricavi e su categoria) | 1425 |
| GET | `/stats/fornitori` | Riepilogo per fornitore + `cat_status`/`pag_status` | 1643 |
| GET | `/fornitori/{key}/anagrafica` | Anagrafica fornitore estratta dagli XML (P.IVA o nome) | 1797 |
| GET | `/stats/mensili` | Riepilogo mensile | 1842 |
| GET | `/stats/drill` | Drill-down per anno/mese/categoria/sottocategoria | 1905 |
| GET | `/stats/kpi` | KPI globali + delta % vs anno precedente stesso periodo | 2039 |
| GET | `/stats/per-categoria` | Distribuzione per categoria da `fe_righe` (donut con sottocategorie) | 2113 |
| GET | `/stats/top-fornitori` | Top N fornitori per spesa (default 10) | 2191 |
| GET | `/stats/confronto-annuale` | Confronto mese per mese anno vs precedente | 2241 |
| GET | `/stats/anomalie` | Nuovi/scomparsi/variazioni > soglia (cutoff `MAX(data_fattura)`) | 2288 |
| PUT | `/fatture/{id}/spalmatura` | Imposta/cancella spalmatura competenza su N mesi (C1/G.3.2, mig 135) | 2394 |
| PUT | `/fatture/{id}/competenza` | Imposta/cancella competenza P&L override YYYY-MM (G.3.1b, mig 133) | 2481 |

## 8.2 Router categorie — 16 endpoint

File: `app/routers/fe_categorie_router.py`
Prefix: `/contabilita/fe/categorie` · Auth: JWT a livello router

| Metodo | Path | Descrizione | Riga |
|--------|------|-------------|------|
| GET | `` (root, senza slash) | Lista categorie con sottocategorie | 129 |
| POST | `` (root) | Crea categoria (nome forzato UPPERCASE) | 155 |
| PUT | `/{cat_id}` | Modifica categoria (nome/ordine/attiva) | 173 |
| DELETE | `/{cat_id}` | Elimina categoria + sottocategorie | 198 |
| POST | `/{cat_id}/sotto` | Crea sottocategoria | 211 |
| PUT | `/sotto/{sub_id}` | Modifica sottocategoria | 235 |
| DELETE | `/sotto/{sub_id}` | Elimina sottocategoria | 260 |
| POST | `/sotto/{sub_id}/sposta` | Sposta sottocategoria sotto altra categoria (aggiorna mapping fornitori, prodotti, righe) | 273 |
| GET | `/fornitori` | Lista fornitori con assegnazioni | 328 |
| POST | `/fornitori/assegna` | Assegna categoria a fornitore + propagazione alle righe senza categoria | 368 |
| POST | `/fornitori/escludi` | Toggle `escluso` (SOLO Ricette/Matching) | 433 |
| POST | `/fornitori/escludi-acquisti` | Toggle `escluso_acquisti` (SOLO modulo Acquisti) | 494 |
| GET | `/fornitori/{piva}/prodotti` | Prodotti unici di un fornitore con categoria | 565 |
| POST | `/fornitori/prodotti/assegna` | Assegna categoria a prodotto + salva mapping in `fe_prodotto_categoria_map` | 640 |
| GET | `/fornitori/{piva}/stats` | Breakdown spesa per categoria del fornitore | 695 |
| GET | `/stats` | Riepilogo spesa per Cat.1/Cat.2 (per categoria fornitore) | 724 |

## 8.3 Router proforme — 9 endpoint

File: `app/routers/fe_proforme_router.py` · Prefix: `/contabilita/fe/proforme` · Auth JWT a livello router. Dettaglio in §11.5.

## 8.4 Router FattureInCloud — 17 endpoint

File: `app/routers/fattureincloud_router.py` · Prefix: **`/fic`** (senza `/contabilita/`) · Auth JWT. Vedi [modulo_fatture_in_cloud.md](modulo_fatture_in_cloud.md) §2.

---

# 9. Database

Posizione: `locali/tregobbi/data/foodcost.db` (path tenant-aware via `locale_data_path`, R6.5; `app/data/` è solo fallback legacy vuoto). DB condiviso con Ricette — vedi `modulo_ricette_foodcost.md` §4 per le tabelle ricette.

## 9.1 Tabelle del modulo Acquisti

### `fe_fatture`
`id`, `fornitore_nome`, `fornitore_piva`, `numero_fattura`, `data_fattura`, `imponibile_totale`, `iva_totale`, `totale_fattura`, `valuta`, `xml_hash` (SHA-256, UNIQUE), `xml_filename`, `data_import`, `tipo_documento` (TD01, TD04, ...), `is_autofattura`, `fonte` (**'xml'|'fic'**, minuscolo), `fic_id` (se da FIC), anagrafica fornitore da XML (`fornitore_cf`, `fornitore_indirizzo`, `fornitore_cap`, `fornitore_citta`, `fornitore_provincia`, `fornitore_nazione`), dati pagamento (`condizioni_pagamento`, `modalita_pagamento`, `data_scadenza`, `importo_pagamento`), override pianificazione (mig 056: `data_prevista_pagamento`, `data_effettiva_pagamento`, `iban_beneficiario`, `modalita_pagamento_override`), `rateizzata_in_spesa_fissa_id` (mig 055), `note_mig110`, `fic_pagato_raw` (flag pagato dichiarato da FIC, mig 111), `competenza_anno_mese` (mig 133), `spalmatura_mesi` + `spalmatura_data_inizio` (mig 135).

⚠️ Le ex colonne `pagato` e `stato_pagamento` sono state **rimosse** (mig 112, G.5): la fonte di verità dello stato pagamento è `cg_uscite.stato`. Le letture passano dalla VIEW `fe_fatture_with_stato`, che le ricostruisce via JOIN con `cg_uscite`. Le scritture passano da `app/services/fatture_stato_service.py` (solo D1+D2 — vedi `stato_pagamento_unificato.md` §15).

### `fe_righe`
`id`, `fattura_id` (FK), `numero_linea`, `descrizione`, `quantita`, `unita_misura`, `prezzo_unitario`, `prezzo_totale`, `aliquota_iva`, `categoria_grezza`, `note_analisi`, `categoria_id`, `sottocategoria_id`, `codice_articolo`, campi FIC (`fic_item_id`, `fic_product_id`, `detraibilita_iva`, `stock`), `categoria_auto` (0=manuale/mapping prodotto, 1=ereditata dal default fornitore). Indice `idx_fe_righe_fattura` su `fattura_id` (mig 147).

### `fe_fornitore_categoria`
`id`, `fornitore_piva`, `fornitore_nome`, `categoria_id`, `sottocategoria_id`, `note`, `escluso` (Ricette), `motivo_esclusione`, `alias_di`, `escluso_acquisti` (Acquisti). Vedi §5.2 per la regola critica.

### `fe_prodotto_categoria_map`
`id`, `fornitore_piva`, `fornitore_nome`, `descrizione_norm`, `categoria_id`, `sottocategoria_id`.

### `fe_categorie` / `fe_sottocategorie`
`fe_categorie(id, nome, ordine, attiva)` + `fe_sottocategorie(id, categoria_id, nome, ordine, attiva)` — vedi §5.1.

### `fe_proforme`
Vedi §11.3 (mig 065 + `iban` da mig 066).

### Tabelle FIC (stesso DB)
`fic_config` (1 riga: token + company), `fic_sync_log`, `fic_sync_warnings` (mig 062) — vedi `modulo_fatture_in_cloud.md`. `fic_fatture` (mig 023) è **legacy**: il sync scrive nella tabella unificata `fe_fatture`, nessun codice la alimenta più.

### Altre
VIEW `fe_fatture_with_stato` (mig 112/116); `fe_fatture_archive_109` / `fe_fatture_archive_110` (archivi delle bonifiche mig 109/110).

## 9.2 Migrazioni significative

- **006**: tabelle base import FE · **011**: `tipo_documento` + autofatture · **023**: tabelle FIC · **024**: `fonte`/`fic_id` · **026**: campi FIC su `fe_righe` · **027**: `categoria_auto`
- **029** (2026-03-28): reset `categoria_auto` residue (Latini, Risto Team)
- **030** (2026-03-28): aggiunge colonna `escluso_acquisti` a `fe_fornitore_categoria`
- **055/056**: rateizzata + campi pianificazione pagamento · **061/062**: filtro non-fatture FIC + `fic_sync_warnings`
- **065/066**: `fe_proforme` + colonna `iban` — vedi §11
- **103, 109-117**: saga unificazione stato pagamento (G.5/G.6) fino a DROP `pagato`/`stato_pagamento` + VIEW (112) — doc canonico `stato_pagamento_unificato.md`
- **133** (`133_fe_fatture_competenza_override`): `competenza_anno_mese` · **135**: spalmatura · **147**: indice `fe_righe(fattura_id)`

---

# 10. Frontend — file

Attivi (con route):

```
frontend/src/pages/admin/
  FattureDashboard.jsx          — Dashboard acquisti (v3.1)
  FattureElenco.jsx             — Elenco fatture + dettaglio inline (v3.3)
  FattureDettaglio.jsx          — Dettaglio fattura riutilizzabile, 4 tab (v3.1-3D)
  FattureFornitoriElenco.jsx    — Elenco fornitori + FornitoreDetailView inline (v4.0-tabs)
  FattureFornitoreDettaglio.jsx — stub redirect → /acquisti/fornitori (v4.0-redirect)
  FattureImpostazioni.jsx       — Impostazioni: XML/FIC/Categorie/Pagamenti/Stato/Manutenzione (v2.4)
  FattureProformeElenco.jsx     — Pro-forme: lista + modali crea/riconcilia (v1.1)
  FattureNav.jsx                — Barra navigazione persistente 5 tab (v2.0)
```

Legacy senza route (candidati a pulizia): `FattureImport.jsx` e `FattureInCloud.jsx` sono ancora lazy-importati in `App.jsx` (righe 70, 76) ma nessuna route li monta (le rispettive route sono redirect a Impostazioni); `FattureElettroniche.jsx` e `FattureCategorie.jsx` non sono importati da nessuno. `FattureMenu.jsx` (ex hub) non esiste più.

---

# 11. Pro-forme — implementate end-to-end

> **Stato:** ✅ ATTIVE in produzione. A.5 (creazione FE) e A.6 (riconciliazione FE) sono entrambe implementate.
> - Backend: `app/routers/fe_proforme_router.py` (mig 065 `fe_proforme` + mig 066 colonna `iban` + 9 endpoint REST sotto `/contabilita/fe/proforme`)
> - Frontend: `frontend/src/pages/admin/FattureProformeElenco.jsx` → route `/acquisti/proforme` (link in `FattureNav.jsx`)
> - Modali: creazione "Nuova Proforma" con ricerca fornitore + form completo (incl. IBAN); "Riconcilia" mostra candidate (GET `/{id}/candidates`) e collega via POST `/{id}/riconcilia` → cancella la riga `cg_uscite` ombra e marca la proforma RICONCILIATA. Reversibile via `/{id}/dissocia`.
>
> **Aggiornamento storico:** SPEC pronta dal 2026-04-13, marcata "in PAUSA" durante "Batch 3 roadmap reorganization". L'implementazione è stata fatta in seguito senza aggiornare questo doc fino al 2026-06-30 (correzione retroattiva — vedi lezione in memoria: "i docs vanno aggiornati ad ogni chiusura, sono lo strumento di check ufficiale").

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
    fornitore_cf        TEXT,                -- allineato ai campi FIC per il matching
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
    updated_at          TEXT DEFAULT CURRENT_TIMESTAMP,
    iban                TEXT                 -- mig 066: dove pagare la proforma
);

CREATE INDEX IF NOT EXISTS idx_fe_proforme_stato ON fe_proforme(stato);
CREATE INDEX IF NOT EXISTS idx_fe_proforme_fornitore ON fe_proforme(fornitore_piva);
CREATE INDEX IF NOT EXISTS idx_fe_proforme_fattura ON fe_proforme(fattura_id);
```

**Migrazioni:** `065_fe_proforme.py` + `066_fe_proforme_iban.py`.

## 11.4 Integrazione con `cg_uscite` (modulo Banca)

Quando si crea una proforma, si crea **anche** una riga in `cg_uscite` con:
- `tipo_uscita = 'PROFORMA'`
- `fattura_id = NULL`
- `fornitore_nome`, `fornitore_piva`, `totale`, `data_scadenza` dalla proforma
- `stato = 'PROGRAMMATO'` (o `'SCADUTO'` se la scadenza è già passata) — `fe_proforme_router.py:306`

Questo fa apparire la proforma nello scadenziario senza toccare le stats fatture (filtrate per `tipo_uscita = 'FATTURA'`).

Quando la proforma viene riconciliata:
1. La riga `cg_uscite` con `tipo_uscita = 'PROFORMA'` viene cancellata (DELETE secco, `fe_proforme_router.py:531-536`)
2. Import fatture normale crea la sua riga `cg_uscite` dalla fattura vera
3. `fe_proforme.fattura_id` punta alla fattura collegata

## 11.5 Backend API — 9 endpoint

Router: `app/routers/fe_proforme_router.py` (✅ implementato)
Prefix: `/contabilita/fe/proforme`
Auth: JWT a livello router

| Metodo | Path | Descrizione | Riga |
|--------|------|-------------|------|
| GET | `/fornitori/search` | Ricerca fornitori per autocomplete (da `fe_fornitore_categoria`, esclusi `escluso_acquisti=1`) | 92 |
| GET | `` (root) | Lista (filtri: stato, fornitore, da/a) + contatori attive/importo per badge | 144 |
| GET | `/{id}` | Dettaglio con dati fattura collegata | 214 |
| POST | `` (root) | Crea proforma + riga `cg_uscite` (+ eventuale fornitore se `crea_fornitore=true`) | 245 |
| PUT | `/{id}` | Modifica (solo se ATTIVA, sync campi su `cg_uscite`) | 349 |
| DELETE | `/{id}` | Annulla (stato → ANNULLATA, cancella riga `cg_uscite`) | 434 |
| POST | `/{id}/riconcilia` | Riconcilia con fattura: `{ fattura_id: N }` | 484 |
| POST | `/{id}/dissocia` | Annulla riconciliazione (torna ATTIVA, ricrea `cg_uscite`) | 555 |
| GET | `/{id}/candidates` | Fatture candidate per riconciliazione (stesso fornitore, importo ±30%, no autofatture/TD04, non già collegate) | 624 |

### Logica `POST /` (creazione)
1. Insert in `fe_proforme`
2. Crea riga in `cg_uscite` con `tipo_uscita='PROFORMA'`
3. Update `fe_proforme.cg_uscita_id`

### Logica `POST /{id}/riconcilia`
1. Verifica `proforma.stato == 'ATTIVA'`
2. Verifica `fattura_id` esista in `fe_fatture`
3. Update `fe_proforme`: `stato='RICONCILIATA'`, `fattura_id=N`, `data_riconciliazione=oggi`
4. Cancella la riga `cg_uscite` collegata alla proforma

## 11.6 Frontend

### Lista Proforme — sottotab in Acquisti
- Voce in `FattureNav.jsx`: **"Pro-forme"** (senza badge contatore — il contatore "N attive — € X in scadenziario" è mostrato nell'header della pagina)
- Pagina: `FattureProformeElenco.jsx` → `/acquisti/proforme`
- Tabella: fornitore, importo, scadenza, stato, azioni (Riconcilia/Modifica/Annulla per le ATTIVE, Dissocia per le RICONCILIATE)
- Filtro stato a chip: Attive / Riconciliate / Annullate / Tutte (nessun filtro periodo in UI; il backend lo supporterebbe con `da`/`a`)
- Stato colorato: ATTIVA = amber (+ evidenza se scaduta), RICONCILIATA = verde + link a fattura, ANNULLATA = grigia

### Modale creazione proforma
Richiamabile da:
1. Pulsante "Nuova Proforma" nella lista
2. Link "+ Proforma" nel top bar del dettaglio fornitore (`FattureFornitoriElenco.jsx:1062`) → porta a `/acquisti/proforme?fornitore=NOME`. **Nota:** la pagina proforme oggi non legge il query param, quindi il fornitore NON risulta pre-compilato/prefiltrato.

Campi (modale `ProformaModal`):
- **Fornitore:** autocomplete su `fe_fornitore_categoria` via `GET /fornitori/search` (P.IVA + nome + C.F.). Se non esiste → toggle "Nuovo fornitore" con: Nome (obbligatorio), P.IVA (consigliato), C.F. (opzionale). Al salvataggio con `crea_fornitore=true` crea riga in `fe_fornitore_categoria`.
- Importo €
- Data scadenza (datepicker)
- Numero proforma (testo libero opzionale)
- Data emissione (datepicker opzionale)
- IBAN (mig 066)
- Note (textarea)

### Riconciliazione
- Dalla lista: azione "Riconcilia" → modale con fatture candidate (stesso fornitore, importo **±30%**, non già collegate, no autofatture/TD04) → click conferma → stato RICONCILIATA
- ~~Da `FattureDettaglio.jsx`: banner "Proforma collegabile"~~ — previsto dalla spec ma **non implementato**: in `FattureDettaglio.jsx` non c'è alcun riferimento alle proforme. La riconciliazione parte solo dalla lista proforme.

## 11.7 Impatto su viste esistenti

- **Scadenziario CG Uscite:** righe con `tipo_uscita='PROFORMA'` appaiono normalmente, badge "PROFORMA". Click → dettaglio proforma (non fattura)
- **Dashboard Acquisti / KPI:** NESSUN impatto (query usano `fe_fatture` direttamente, proforme in tabella separata)
- **Stats su `cg_uscite`:** filtrare per `tipo_uscita = 'FATTURA'` o ignorare il campo per non inquinare totali
- **Import uscite:** nessuna modifica

## 11.8 Fasi implementative *(storico, completate — resta fuori solo il banner in dettaglio fattura, vedi §11.6)*

| Fase | Cosa | Stima |
|------|------|-------|
| 1 | Migrazione DB `065_fe_proforme.py` | XS ✅ |
| 2 | Router backend `fe_proforme_router.py` (CRUD + riconciliazione) | M ✅ |
| 3 | Frontend `FattureProformeElenco.jsx` + modale creazione | M ✅ |
| 4 | Frontend riconciliazione (modale candidati ✅ + banner in dettaglio fattura ❌ non fatto) | M |
| 5 | Integrazione nav (tab `FattureNav` ✅, link da fornitore ✅ senza prefill, badge contatore in nav ❌) | XS |
| 6 | Verifica: proforme visibili in scadenziario CG, NON nelle stats Acquisti | XS ✅ |

## 11.9 Decisioni confermate Marco

1. **Pagamento proforma:** scadenziario lo gestisce normalmente (DA_PAGARE → PAGATA). Quando si riconcilia con la fattura, la fattura arriva già "coperta".
2. **Fornitore nuovo:** form di creazione include mini-form "nuovo fornitore" con campi utili al matching FIC/XML (Nome obbligatorio, P.IVA consigliato, C.F. opzionale). Indirizzo e altri dati arriveranno dalla fattura vera al momento della riconciliazione. Il nuovo fornitore viene creato in `fe_fornitore_categoria` così è subito visibile in tutto il modulo Acquisti.

---

# 12. Changelog

## v3.0 → v3.1 — Redesign tabs + modello 3D + CE (apr-mag 2026, ricostruito da codice 2026-08-03)
- **v3.0-tabs (sessione 55/56, 2026-04-25):** `FattureDettaglio` e dettaglio fornitore passano al pattern "testa fissa soft + KPI + tab". `FattureFornitoreDettaglio.jsx` ridotto a redirect (dettaglio inline in `FattureFornitoriElenco`), pattern anti-matrioska con breadcrumb. `FattureNav` v2.0 (Dashboard/Fatture/Fornitori/Pro-forme/Impostazioni); Import, Categorie e FIC confluiti nella pagina unica `FattureImpostazioni` (route legacy → redirect).
- **v3.1-3D (2026-05-18):** zona chip e tab Pagamenti secondo il modello 3 dimensioni (`StatoPagamentoBadge` D1+D2 separato da `StatoScadenzaBadge` D3, vedi `stato_pagamento_unificato.md` §15).
- **C.2 (2026-05-18):** tab "Conto Economico" nel dettaglio fattura + endpoint `GET /fatture/{id}/ce-impatto`; editor inline categorie righe.
- **G.3.1b (2026-05-16) / C1-G.3.2:** override competenza P&L (`PUT /fatture/{id}/competenza`, mig 133) e spalmatura su N mesi (`PUT /fatture/{id}/spalmatura`, mig 135).
- **G.5/G.6 (mig 103-117):** stato pagamento unificato su `cg_uscite.stato`; DROP `fe_fatture.pagato`/`stato_pagamento` + VIEW `fe_fatture_with_stato` (mig 112).
- Sync FIC nel router dedicato `fattureincloud_router.py` (prefix `/fic/*`, 17 endpoint) con warnings (mig 062) e recupero righe da XML.

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
