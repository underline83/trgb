# 📦 Modulo Gestione Acquisti — TRGB Gestionale
**Versione:** 2.0
**Stato:** Stabile
**Data ultimo aggiornamento:** 2026-03-10
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
Lista fornitori con ricerca, filtro anno, ordinamento cliccabile su ogni colonna. KPI: n. fornitori, totale spesa, n. fatture, media per fornitore. Click su riga per aprire dettaglio prodotti.

## 2.6 Dettaglio Fornitore (`/acquisti/fornitore/:piva`)
Prodotti acquistati dal fornitore con categorizzazione per riga. Statistiche riepilogative. Assegnazione categoria/sottocategoria per prodotto.

## 2.7 Import XML (`/acquisti/import`)
Drag & drop XML multipli o selezione file. Anti-duplicazione SHA-256. Lista fatture importate con dettaglio.

## 2.8 Categorie (`/acquisti/categorie`)
Gestione albero Cat.1/Cat.2 (categorie e sottocategorie). Assegnazione fornitori a categorie. Esclusione fornitori (autofatture, non pertinenti).

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
id, fattura_id (FK), numero_linea, descrizione, quantita, unita_misura, prezzo_unitario, prezzo_totale, aliquota_iva

### Tabella `fe_fornitore_categoria`
fornitore_piva, fornitore_nome, categoria_id, sottocategoria_id, escluso

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
