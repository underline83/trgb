# Modulo Gestione Acquisti — TRGB Gestionale
**Versione:** 2.3 (dettaglio fornitore v3.2 — sidebar colorata + FattureDettaglio inline unificato)
**Stato:** Stabile
**Data ultimo aggiornamento:** 2026-04-10
**Dominio funzionale:** Acquisti, Fatture Elettroniche, Controllo di Gestione

---

# 1. Panoramica

Il modulo **Gestione Acquisti** (precedentemente "Fatture Elettroniche XML") e' un modulo di primo livello del gestionale, accessibile direttamente dalla Home. Consente di importare fatture elettroniche FatturaPA in formato XML, analizzare gli acquisti per fornitore e categoria, e gestire la categorizzazione dei prodotti.

**Sezione top-level:** `/acquisti`
**Backend API:** `/contabilita/fe/*`

---

# 2. Funzionalita'

## 2.1 Menu Principale (`/acquisti`)
Hub con mini-KPI (n. fatture, totale spesa, n. fornitori, media mensile), barra di ricerca globale e 5 tile di accesso rapido.

## 2.2 Dashboard Acquisti (`/acquisti/dashboard`)
KPI avanzati, grafici mensili (BarChart), distribuzione categorie (PieChart), confronto annuale, top fornitori, anomalie. Drill-down interattivo: click su barra/fetta per espandere il dettaglio con lista fatture.

## 2.3 Elenco Fatture (`/acquisti/elenco`)
Lista completa con ricerca full-text (fornitore, P.IVA, numero fattura), filtri (anno, mese, importo min/max, fornitore, categoria), paginazione server-side. Click su riga per aprire il dettaglio.

## 2.4 Dettaglio Fattura (`/acquisti/dettaglio/:id`)
Info complete: fornitore (nome + P.IVA), importi (imponibile, IVA, totale), righe fattura con descrizione, quantita', prezzo unitario e totale. Link a pagina fornitore.

## 2.5 Elenco Fornitori (`/acquisti/fornitori`)
Layout Cantina: sidebar filtri a sinistra + lista/dettaglio inline a destra.
- **Sidebar filtri**: ricerca testo, anno, categoria fornitore (dropdown), stato prodotti (ok/auto/partial/none/empty)
- **Tabella**: tutte le colonne ordinabili con SortTh (Fornitore, Cat, P.IVA, Fatture, Totale, Media, Primo, Ultimo)
- **Selezione massiva**: checkbox + assegnazione categoria bulk
- **Dettaglio inline**: click su fornitore per aprire dettaglio senza cambio pagina

## 2.6 Dettaglio Fornitore (inline in `/acquisti/fornitori`)
Layout due colonne coerente con `FattureDettaglio` e `SchedaVino`: **sidebar colorata a sinistra** (300px) + area principale a destra (`grid-cols-1 lg:grid-cols-[300px_1fr]`). Sopra la griglia, una top bar bianca con pulsante "← Torna alla lista" e toggle "Nascondi da acquisti / Ripristina".

- **Sidebar colorata con stato semantico** — gradiente dinamico: **teal** (ATTIVO, default), **amber** (IN SOSPESO, quando il fornitore ha fatture da pagare), **slate** (ESCLUSO, quando `escluso_acquisti = 1`). Costante `FORNITORE_SIDEBAR` + helper `getFornitoreSidebar(isExcluded, nDaPagare)` scelgono la palette. Contenuto della sidebar:
  - Header: nome + P.IVA + C.F. + badge stato in alto + contatore fatture
  - Box grande "Totale spesa" + 4 KPI compatti (Imponibile, Media fattura, Prodotti, Pagate/Totali)
  - Box rosso "⚠ Da pagare" (solo se `nDaPagare > 0`) con importo e numero fatture aperte
  - Info list: primo e ultimo acquisto
  - Sede anagrafica (indirizzo, CAP, città, provincia, nazione) da XML
  - Distribuzione categorie (prime 6, come pill compatti)
  - ID tecnico (P.IVA o nome) in basso
- **Area principale** (sfondo bianco) con sezioni separate da `SectionHeader` uniforme:
  - Banner esclusione (ambra, solo se escluso)
  - **Categoria generica fornitore**: assegnazione con propagazione alle righe senza categoria + pill con distribuzione categorie calcolate
  - **Condizioni di pagamento**: preset modalità+giorni, banner "Auto-rilevato" se il sistema ha stimato da fatture passate, note aggiuntive, badge "✓ Default salvato"
  - **Tabs Fatture / Prodotti**:
    - **Tab Fatture**: lista ordinabile con stato pagamento, fonte (XML/FIC), badge "≠" se modalità pagamento fattura diverge dal default fornitore. Click su riga → **`FattureDettaglio` inline** (unificato, stesso componente del dettaglio fattura standalone): editor scadenza/IBAN/modalità, gestione righe, sync automatico con la sidebar colorata (il contatore "Da pagare" si aggiorna dopo `Segna pagata`). Selezione massiva per segnare pagate/non pagate in batch.
    - **Tab Prodotti**: lista ordinabile con assegnazione categoria/sottocategoria per riga, filtro (tutti/da assegnare/ereditate/definite), selezione massiva, bulk edit bar teal.

## 2.7 Import XML (`/acquisti/import`)
Drag & drop XML multipli o selezione file. Anti-duplicazione SHA-256. Lista fatture importate con dettaglio.

## 2.8 Categorie (`/acquisti/categorie`)
Gestione albero Cat.1/Cat.2 (categorie e sottocategorie). Assegnazione fornitori a categorie. Esclusione fornitori (autofatture, non pertinenti).

## 2.9 FattureInCloud (FIC) Sync (`/acquisti/impostazioni` tab FIC)
Sincronizzazione automatica fatture ricevute da API v2 FIC. Tracciamento stato (nuova/aggiornata/merged_xml), lista fatture senza dettaglio (senza_dettaglio) con warning. XML enrichment: se FIC ritorna `is_detailed: false` (no righe), il sistema tenta match con XML importato per aggiungere righe e importi.

---

# 3. Navigazione

**FattureNav** — barra di navigazione persistente su tutte le pagine del modulo con 5 tab: Dashboard, Elenco, Fornitori, Import, Categorie. Brand link "Acquisti" per tornare al menu, link "Home" in alto a destra.

---

# 4. API Backend

Router: `app/routers/fe_import.py`
Prefix: `/contabilita/fe`
Auth: JWT (tutte le route richiedono token)

### Endpoint principali

| Metodo | Path | Descrizione |
|--------|------|-------------|
| POST | `/import` | Import file XML FatturaPA |
| GET | `/fatture` | Elenco fatture con filtri e paginazione |
| GET | `/fatture/{id}` | Dettaglio fattura con righe |
| GET | `/stats/fornitori` | Riepilogo per fornitore |
| GET | `/stats/mensili` | Riepilogo mensile |
| GET | `/stats/categorie` | Distribuzione per categoria |
| GET | `/stats/top-fornitori` | Top N fornitori per spesa |
| GET | `/stats/kpi` | KPI globali (n_fatture, totale_spesa, n_fornitori, spesa_media_mensile) |
| GET | `/stats/drill` | Drill-down per anno/mese/categoria |
| GET | `/stats/anomalie` | Anomalie e variazioni anno su anno |
| GET | `/stats/confronto-annuale` | Confronto tra due anni |
| POST | `/fic/sync` | Sincronizza fatture da FattureInCloud API v2 (con `force_detail` param) |
| GET | `/fic/debug-detail/{fic_id}` | Ritorna raw FIC API response (is_detailed, e_invoice, items_list, etc.) |

### Endpoint categorie (`/contabilita/fe/categorie`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/` | Lista categorie con sottocategorie |
| POST | `/` | Crea categoria |
| POST | `/{id}/sottocategorie` | Crea sottocategoria |
| GET | `/fornitori` | Lista fornitori con assegnazioni |
| POST | `/fornitori/assegna` | Assegna categoria a fornitore |
| POST | `/fornitori/escludi` | Toggle esclusione fornitore |
| GET | `/fornitori/{piva}/prodotti` | Prodotti di un fornitore |
| POST | `/fornitori/prodotti/assegna` | Assegna categoria a prodotto |
| GET | `/fornitori/{piva}/stats` | Stats per fornitore |

---

# 5. Database

Posizione: `app/data/foodcost.db`

### Tabella `fe_fatture`
id, fornitore_nome, fornitore_piva, numero_fattura, data_fattura, imponibile_totale, iva_totale, totale_fattura, valuta, xml_hash (SHA-256), xml_filename, data_import, is_autofattura

### Tabella `fe_righe`
id, fattura_id (FK), numero_linea, descrizione, quantita, unita_misura, prezzo_unitario, prezzo_totale, aliquota_iva, categoria_id, sottocategoria_id, categoria_auto (0=manuale, 1=ereditata da import)

### Tabella `fe_fornitore_categoria`
fornitore_piva, fornitore_nome, categoria_id, sottocategoria_id, escluso, escluso_acquisti
> **NOTA**: `escluso` e' usato SOLO dal modulo Ricette/Matching. `escluso_acquisti` e' usato SOLO dal modulo Acquisti. Non mescolare mai i due campi!

### Tabella `fe_prodotto_categoria`
fornitore_piva, fornitore_nome, descrizione, categoria_id, sottocategoria_id

### Tabella `fe_categorie`
id, nome, parent_id (NULL=categoria, non-NULL=sottocategoria)

---

# 6. Frontend — File

```
frontend/src/pages/admin/
  FattureMenu.jsx           — Hub principale (/acquisti)
  FattureDashboard.jsx      — Dashboard acquisti (/acquisti/dashboard)
  FattureElenco.jsx         — Elenco fatture (/acquisti/elenco)
  FattureDettaglio.jsx      — Dettaglio fattura (/acquisti/dettaglio/:id)
  FattureFornitoriElenco.jsx — Elenco fornitori (/acquisti/fornitori)
  FattureFornitoreDettaglio.jsx — Dettaglio fornitore (/acquisti/fornitore/:piva)
  FattureImport.jsx         — Import XML (/acquisti/import)
  FattureCategorie.jsx      — Categorie (/acquisti/categorie)
  FattureNav.jsx            — Barra navigazione persistente
```

---

# 7. Routing Frontend

```
/acquisti                    — Menu Gestione Acquisti
/acquisti/dashboard          — Dashboard
/acquisti/elenco             — Elenco fatture
/acquisti/dettaglio/:id      — Dettaglio fattura
/acquisti/fornitori          — Elenco fornitori
/acquisti/fornitore/:piva    — Dettaglio fornitore
/acquisti/import             — Import XML
/acquisti/categorie          — Categorie fornitori
```

---

# 8. Changelog

## v2.3 — Dettaglio fornitore v3.2 (2026-04-10)
- **Refactor grafico `FornitoreDetailView`** — allineato al pattern `FattureDettaglio` / `SchedaVino`: layout due colonne con sidebar colorata (300px) a sinistra e area principale a destra. Top bar bianca sopra con back button e toggle esclusione.
- **Sidebar colorata a stato semantico** — gradiente teal (ATTIVO) / amber (IN SOSPESO, con fatture aperte) / slate (ESCLUSO). Costante `FORNITORE_SIDEBAR` + helper `getFornitoreSidebar(isExcluded, nDaPagare)`. La sidebar contiene totale spesa + 4 KPI compatti, box "Da pagare" rosso se ci sono fatture aperte, info list primo/ultimo acquisto, sede anagrafica, distribuzione categorie.
- **`SectionHeader` locale** — helper uniforme a `FattureDettaglio`/`SchedaVino`, usato per "Categoria generica fornitore" e "Condizioni di pagamento".
- **Unificazione dettaglio fattura inline** — eliminato il subcomponente `FatturaInlineDetail` (~130 righe duplicate) e sostituito con `<FattureDettaglio fatturaId inline />`: riusa il componente canonico già testato (editor scadenza/IBAN/modalità, gestione banca e righe). Cleanup state: rimosse `fatturaDetail` / `fatturaDetLoading`, semplificato `openFattura(id)` a semplice toggle.
- **Sync coerente** — `onSegnaPagata` e `onFatturaUpdated` passati al componente figlio triggerano `reloadFatture()` + `handleFatturaUpdatedInline()` per aggiornare sia il badge "Da pagare N" nella sidebar colorata sia la riga nella tabella.
- File header: `v3.2-fornitore-sidebar-colorata`. versions.jsx: `fatture` bumped a v2.3.

## v2.3 (2026-03-28)
- **CRITICO — Rimosso filtro `escluso` da query acquisti**: il campo `fe_fornitore_categoria.escluso` e' SOLO per il modulo Ricette/Matching. Era usato erroneamente nelle query dashboard/stats, escludendo 58 fornitori dai totali acquisti. `_EXCL_JOIN` ora vuoto, `_EXCL_WHERE` filtra solo autofatture.
- **Filtro categoria sidebar fornitori**: aggiunto dropdown "Categoria fornitore" nella sidebar filtri di `/acquisti/fornitori` (include opzione "Senza categoria")
- **Confronto annuale stesso periodo**: dashboard YoY ora confronta solo lo stesso periodo (es. gen-mar 2026 vs gen-mar 2025) usando MAX(data_fattura) come cutoff
- **Fix anno default dashboard**: `fetchAll(selectedYear)` al mount, non piu' `fetchAll("all")`
- **Donut sottocategorie**: grafico categorie dashboard ora ha due anelli — interno categorie, esterno sottocategorie. Legenda espandibile con drill-down sottocategorie.
- **Fix refresh categorie prodotti**: rimosso `setDetailData(null)` intermedio in `refreshDetail` che causava crash
- **Rimosso pulsante "Escludi fornitore"** dal dettaglio fornitore (era inutile in acquisti)
- **Dettaglio fornitore migliorato**: P.IVA + C.F. sulla stessa riga, KPI "Media fattura" e "Da pagare"
- **Prop `onReloadList`**: fix aggiornamento lista fornitori dopo salvataggio categoria generica
- **Migrazione 029**: reset `categoria_auto` residue (Latini, Risto Team)
- **Backend**: `stats_fornitori` riscritto con subquery, `stats_per_categoria` include sottocategorie, `_CAT_JOIN` separato da `_EXCL_JOIN`
- **Esclusione fornitori da acquisti** (`escluso_acquisti`): nuovo campo dedicato in `fe_fornitore_categoria`, separato da `escluso` (Ricette/Matching). Toggle nel dettaglio fornitore ("Nascondi da acquisti"). Fornitori esclusi rimossi da dashboard/KPI/grafici ma visibili nell'elenco con badge "escluso". Checkbox "Mostra esclusi" nella sidebar. Endpoint POST `/categorie/fornitori/escludi-acquisti`.
- **Migrazione 030**: aggiunge colonna `escluso_acquisti` a `fe_fornitore_categoria`

## v2.1 (2026-03-22)
- **FattureInCloud (FIC) sync v2.0**: sincronizzazione API v2 con SyncResult tracking (items + senza_dettaglio list)
- **XML enrichment**: FIC fatture con `is_detailed: false` vengono arricchite da XML importati (righe + importi)
- **Debug endpoint**: GET `/fic/debug-detail/{fic_id}` per troubleshooting FIC API responses
- **UI FattureImpostazioni**: lista fatture processate in tabella con badges (NUOVA/AGG./MERGE), warning box per senza_dettaglio
- **UI FattureElenco**: rimosso filtro "Escluse", badge "Escluso" (il flag è solo per product matching). Solo "Autofatture" badge rimane. Anno default = current year.
- **UI FattureDashboard**: anno default = current year
- **Backend cleanup**: rimosso `escluso` field da query `/fatture` list, rimosso LEFT JOIN con `fe_fornitore_categoria`. `_EXCL_JOIN` e `_EXCL_WHERE` ora specifici per autofatture.
- **Infrastructure**: nginx proxy_read_timeout = 600s per trgb.tregobbi.it
- **Database notes**: 58 fornitori `escluso=1` (product matching only), fresh FIC-only import, zero duplicates

## v2.0 (2026-03-10)
- Promosso a modulo di primo livello ("Gestione Acquisti")
- Route migrate da `/admin/fatture/*` a `/acquisti/*`
- Aggiunta pagina Elenco Fornitori con ricerca, ordinamento, KPI
- Aggiunta pagina Elenco Fatture con ricerca, filtri, paginazione
- Aggiunta pagina Dettaglio Fattura
- Aggiunta navigazione persistente (FattureNav)
- Aggiunto tab "Fornitori" al menu e alla navigazione
- Menu con 5 tile + mini-KPI + ricerca globale
- Dashboard con drill-down interattivo (click su barra/fetta)
- Backend: endpoint /fatture con filtri avanzati + paginazione

## v1.2 (2025-12-05)
- Prima release operativa
- Import XML, parsing, anti-duplicazione
- Dashboard acquisti (fornitori + mensile)
- Drag & drop import
