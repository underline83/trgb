# Modulo Statistiche — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-15
**Stato:** beta
**Router:** `app/routers/statistiche_router.py` v1.0
**DB:** `foodcost.db` (tabelle `ipratico_*`, migration 018)

---

# 1. Obiettivo del modulo

Il modulo **Statistiche** gestisce l'import e l'analisi dei dati di vendita esportati dal gestionale cassa **iPratico**.

Funzionalita' principali:

- Import mensile degli export iPratico (file .xls che sono in realta' HTML)
- Dashboard con KPI fatturato, pezzi venduti, categorie
- Classifica top prodotti per fatturato
- Trend mensile a barre
- Dettaglio prodotti con filtri e ricerca testuale
- Storico import con possibilita' di eliminare un mese

---

# 2. Flusso dati

```
Export iPratico (.xls HTML)
    │
    ▼
ipratico_parser.py
    │  pd.read_html() → 2 tabelle
    │  Tabella 0: categorie (Categoria, Quantita', Totale cent)
    │  Tabella 1: prodotti (Categoria, Prodotto, Quantita', Totale cent, PLU, Barcode)
    │
    ▼
statistiche_router.py POST /import-ipratico
    │  DELETE existing → INSERT categorie + prodotti + log
    │  Upsert semantico: reimportare sovrascrive
    │
    ▼
foodcost.db
    │  ipratico_imports    — 1 riga per mese importato
    │  ipratico_categorie  — N righe per mese (una per categoria)
    │  ipratico_prodotti   — N righe per mese (una per prodotto)
    │
    ▼
Frontend Dashboard / Prodotti
    │  GET /categorie, /prodotti, /top-prodotti, /trend
    │  Filtri: anno, mese, categoria, ricerca testo
```

---

# 3. Endpoint

| # | Metodo | Endpoint | Ruolo | Descrizione |
|---|--------|----------|-------|-------------|
| 1 | POST | `/statistiche/import-ipratico?anno=&mese=` | admin | Import export iPratico (upsert) |
| 2 | GET | `/statistiche/mesi` | auth | Lista mesi importati (log) |
| 3 | GET | `/statistiche/categorie?anno=&mese=` | auth | Riepilogo categorie aggregato |
| 4 | GET | `/statistiche/prodotti?anno=&mese=&categoria=&q=&limit=&offset=` | auth | Dettaglio prodotti con paginazione |
| 5 | GET | `/statistiche/top-prodotti?anno=&mese=&n=` | auth | Top N prodotti per fatturato |
| 6 | GET | `/statistiche/trend?anno=&categoria=&prodotto=` | auth | Trend mensile |
| 7 | DELETE | `/statistiche/mese/{anno}/{mese}` | admin | Elimina dati di un mese |

### Note sugli endpoint

**Import (1):** riceve file via `multipart/form-data` + query params `anno` e `mese`. Salva il file in temp, lo parsa, elimina i dati precedenti per quel mese, inserisce i nuovi. Ritorna conteggio categorie, prodotti e totale euro.

**Categorie (3):** aggregazione per categoria. Se anno+mese: dati singolo mese. Se solo anno: aggregato annuale. Se niente: aggregato totale. Ordinato per fatturato decrescente.

**Prodotti (4):** aggregazione per prodotto con GROUP BY categoria+prodotto. Supporta ricerca testo (LIKE case-insensitive), filtro categoria, paginazione con LIMIT/OFFSET.

**Top prodotti (5):** come prodotti ma senza paginazione, ordinato per fatturato DESC, limitato a N (default 20).

**Trend (6):** raggruppa per anno+mese. Tre modalita': trend totale, trend per categoria, trend per prodotto specifico.

---

# 4. Schema DB (migration 018)

### `ipratico_imports` — log import

| Colonna | Tipo | Note |
|---------|------|------|
| id | INTEGER PK | auto |
| anno | INTEGER | UNIQUE(anno, mese) |
| mese | INTEGER | 1-12 |
| filename | TEXT | nome file originale |
| n_categorie | INTEGER | conteggio |
| n_prodotti | INTEGER | conteggio |
| totale_euro | REAL | totale in euro |
| imported_at | TEXT | datetime auto |

### `ipratico_categorie` — riepilogo categorie per mese

| Colonna | Tipo | Note |
|---------|------|------|
| id | INTEGER PK | auto |
| anno | INTEGER | UNIQUE(anno, mese, categoria) |
| mese | INTEGER | 1-12 |
| categoria | TEXT | es. "Bevande", "Primi" |
| quantita | INTEGER | pezzi venduti |
| totale_cent | INTEGER | totale in centesimi |

### `ipratico_prodotti` — dettaglio prodotti per mese

| Colonna | Tipo | Note |
|---------|------|------|
| id | INTEGER PK | auto |
| anno | INTEGER | UNIQUE(anno, mese, categoria, prodotto) |
| mese | INTEGER | 1-12 |
| categoria | TEXT | |
| prodotto | TEXT | es. "Margherita", "Birra Moretti 66cl" |
| quantita | INTEGER | pezzi venduti |
| totale_cent | INTEGER | totale in centesimi |
| plu | TEXT | codice PLU (nullable) |
| barcode | TEXT | codice barcode (nullable) |

### Indici
- `idx_ipratico_cat_anno_mese` su `ipratico_categorie(anno, mese)`
- `idx_ipratico_prod_anno_mese` su `ipratico_prodotti(anno, mese)`

---

# 5. Parser iPratico (`ipratico_parser.py`)

iPratico esporta i dati come file `.xls` ma il contenuto e' in realta' HTML con `<table>`. Il parser usa `pd.read_html()` per estrarre le 2 tabelle.

### Formato input

- **Tabella 0 (categorie):** colonne Categoria, Quantita', Totale
- **Tabella 1 (prodotti):** colonne Categoria, Prodotto, Quantita', Totale, PLU, Barcode

### Gestione encoding

iPratico usa encoding variabile per "Quantita'" (a volte UTF-8, a volte Latin-1). Il parser normalizza i nomi colonna cercando sottostringhe (`"quant"`, `"categ"`, `"total"`, `"prodot"`, `"plu"`, `"barco"`).

### Valori

- I totali sono in **centesimi** (interi)
- Il router li converte in euro (÷100) nelle risposte API
- Quantita' sono interi

---

# 6. Frontend

### Pagine

| Pagina | Path | Componente | Descrizione |
|--------|------|------------|-------------|
| Menu | `/statistiche` | `StatisticheMenu.jsx` | Tile colorate: Dashboard, Prodotti, Import |
| Dashboard | `/statistiche/dashboard` | `StatisticheDashboard.jsx` | KPI, categorie con barre, top 15, trend |
| Prodotti | `/statistiche/prodotti` | `StatisticheProdotti.jsx` | Tabella filtri + ricerca + paginazione |
| Import | `/statistiche/import` | `StatisticheImport.jsx` | Upload .xls + storico + delete |

### Navigazione

`StatisticheNav.jsx` — tab navigation (Dashboard, Prodotti, Import). Import visibile solo per admin. Tema colore: rose.

### Dashboard

- **KPI cards:** fatturato totale, pezzi venduti, numero categorie
- **Categorie:** lista con barra percentuale relativa alla categoria con piu' fatturato
- **Top 15:** tabella con prodotto, categoria, quantita', totale, prezzo medio
- **Trend mensile:** barre CSS con altezza proporzionale al fatturato
- **Filtro periodo:** Anno / Mese / Tutto

### Import

- Selettore anno + mese (dropdown)
- Upload file .xls / .xlsx
- Messaggio successo con conteggio categorie/prodotti/totale
- Tabella storico import con possibilita' di eliminare un mese

---

# 7. Configurazione

- `modules.json` — modulo `statistiche`, visibile a `admin` e `viewer`
- `versions.jsx` — `statistiche: v1.0 beta`
- `Home.jsx` — tile rosa nella home
- `main.py` — `include_router(statistiche_router.router)`

---

# 8. Procedura import

Marco esporta i dati da iPratico mese per mese:

1. Accedere a iPratico → Export → Dettaglio Categoria
2. Selezionare il periodo (1 mese)
3. Scaricare il file .xls
4. Nel gestionale: Statistiche → Import iPratico
5. Selezionare anno e mese
6. Caricare il file

L'import e' idempotente: reimportare lo stesso mese sovrascrive i dati precedenti.

---

# 9. Roadmap

| Task | Stato |
|------|-------|
| Import mensile base | Fatto |
| Dashboard categorie + top prodotti | Fatto |
| Trend mensile bar chart | Fatto |
| Dettaglio prodotti con filtri | Fatto |
| Confronto anno su anno | Da fare |
| Export CSV/Excel dei dati aggregati | Da fare |
| Grafici con libreria (recharts) | Da fare |
| Matching prodotti iPratico → ingredienti foodcost | Da fare |
| Margine per prodotto (incrocio con food cost) | Da fare |
