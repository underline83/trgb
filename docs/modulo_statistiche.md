# Modulo Statistiche — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** parziale · **Ultima verifica:** 2026-07-02
> **Vedi anche:** [modulo_vendite.md](modulo_vendite.md) (chiusure turno, corrispettivi)

**Stato:** beta
**Router:** `app/routers/statistiche_router.py` v1.2
**DB:** `foodcost.db` (tabelle `ipratico_*`, migration 018) + `admin_finance.sqlite3` in **sola lettura** (daily_closures, shift_closures, shift_preconti)

---

# 1. Obiettivo del modulo

Il modulo **Statistiche** gestisce l'import e l'analisi dei dati di vendita esportati dal gestionale cassa **iPratico**, e da v1.2 è l'**aggregatore cross-modulo read-only** che unisce vendite iPratico e chiusure di cassa (coperti, incassi storici).

Funzionalita' principali:

- Import mensile degli export iPratico (file .xls che sono in realta' HTML)
- Dashboard con KPI fatturato, pezzi venduti, categorie + movimenti prodotti (crescita/calo vs mese precedente)
- Classifica top prodotti per fatturato
- Trend mensile a barre; trend per singolo prodotto (click su riga in Prodotti)
- Dettaglio prodotti con filtri e ricerca testuale
- Storico import con possibilita' di eliminare un mese
- **Storico incassi pluriennale** (YoY 2021→oggi) e media per giorno della settimana
- **Spesa per coperto per categoria** (incrocio venduto iPratico ÷ coperti chiusure turno)

### Lettura cross-modulo (v1.2)

Gli endpoint storico/coperto leggono `admin_finance.sqlite3` (modulo cassa/banca) con connessione SQLite `mode=ro`: qualsiasi scrittura accidentale fallisce. È l'eccezione prevista dalle regole modulari (statistiche = aggregatore read-only).

**Cucitura storica (pre-K.12):** `daily_closures` copre 2021 → cutover, `shift_closures` dal cutover in poi. Il **cutover è dinamico** = `MIN(date)` di shift_closures (oggi 2026-03-01), quindi il codice sopravvive al refactor K.12. Coperti e split pranzo/cena esistono solo nell'era shift.

**⚠️ SEMANTICA CUMULATIVA shift_closures (v1.2.1, verificata sui dati):** la riga CENA contiene la **chiusura RT cumulativa di giornata** (la Z del registratore include il pranzo); la riga PRANZO è il parziale pranzo. Prova: nell'overlap 1-10 marzo 2026 `cena.preconto + fatture(giorno) == daily_closures.corrispettivi_tot` in 8/8 giorni; 0 violazioni `cena<pranzo` su 102 giorni a 2 turni; marzo/giugno coincidono con il venduto iPratico a ±70€. Quindi:

- fatturato giorno = `cena.preconto + SUM(fatture)` — **MAI pranzo+cena** (raddoppia il pranzo, bug v1.2 segnalato da Marco)
- fatturato pranzo = `pranzo.preconto + pranzo.fatture`; fatturato cena = `(cena.preconto − pranzo.preconto) + cena.fatture`
- i **coperti sono reali per turno** e si sommano normalmente
- `shift_preconti` NON si somma: per omogeneità con la metrica daily-era (`corrispettivi_tot` = RT + fatture) i bonifici/preconti gruppo sono esclusi in entrambe le ere
- **NB:** `/admin/finance/shift-closures/stats/daily` (modulo cassa, pagina Coperti) somma ancora pranzo+cena+preconti nei campi `fatt_*` → stessa doppia conta, da rivedere con Marco (contesto K.12)

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
| 8 | GET | `/statistiche/storico/yoy` | auth | Storico incassi pluriennale: annuale + matrice mese×anno (v1.2) |
| 9 | GET | `/statistiche/storico/weekday?anno=` | auth | Media incassi/coperti per giorno settimana, split pranzo/cena (v1.2) |
| 10 | GET | `/statistiche/coperto?anno=` | auth | €/coperto e pezzi/coperto per categoria iPratico, mese per mese (v1.2) |
| 11 | GET | `/statistiche/movimenti?anno=&mese=&min_euro=&n=` | auth | Prodotti in crescita/calo/nuovi/spariti vs mese precedente importato (v1.2) |
| 12 | GET | `/statistiche/storico/giorni?anno=&mese=` | auth | Incassi giornalieri di un mese dalla cucitura daily+shift — fallback pre-cutover per la pagina Coperti (v1.2.1) |

### Note sugli endpoint

**Import (1):** riceve file via `multipart/form-data` + query params `anno` e `mese`. Salva il file in temp, lo parsa, elimina i dati precedenti per quel mese, inserisce i nuovi. Ritorna conteggio categorie, prodotti e totale euro.

**Categorie (3):** aggregazione per categoria. Se anno+mese: dati singolo mese. Se solo anno: aggregato annuale. Se niente: aggregato totale. Ordinato per fatturato decrescente.

**Prodotti (4):** aggregazione per prodotto con GROUP BY categoria+prodotto. Supporta ricerca testo (LIKE case-insensitive), filtro categoria, paginazione con LIMIT/OFFSET.

**Top prodotti (5):** come prodotti ma senza paginazione, ordinato per fatturato DESC, limitato a N (default 20).

**Trend (6):** raggruppa per anno+mese. Tre modalita': trend totale, trend per categoria, trend per prodotto specifico.

**Storico YoY (8):** ritorna `cutover`, `annuale[]` (fatturato, giorni aperti, media/giorno, coperti se disponibili) e `mensile[]` (matrice mese×anno). Fonte: daily_closures + shift_closures cuciti al cutover.

**Storico weekday (9):** media fatturato per giorno della settimana calcolata sui giorni aperti; `anno` opzionale (vuoto = tutta la storia). Campi per turno (`coperti_medio`, `fatt_pranzo_medio`, ecc.) calcolati solo sui giorni con fonte shift_closures (`giorni_turni`).

**Coperto (10):** per ogni mese dell'anno: coperti e fatturato da shift_closures, scontrino medio, e per ogni categoria iPratico `per_coperto` (€) e `pezzi_per_coperto`. I mesi senza chiusure turno hanno `coperti: null`.

**Movimenti (11):** confronta (anno, mese) con l'import immediatamente precedente in `ipratico_imports`. Filtra il rumore con `min_euro` (default 50, parametro esposto): considera solo prodotti sopra soglia in almeno uno dei due mesi. Ritorna `up`, `down`, `nuovi`, `spariti`.

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
| Dashboard | `/statistiche/dashboard` | `StatisticheDashboard.jsx` | KPI, categorie con barre, top 15, movimenti, trend |
| Prodotti | `/statistiche/prodotti` | `StatisticheProdotti.jsx` | Tabella filtri + ricerca + paginazione + modal trend prodotto |
| Coperti | `/statistiche/coperti` | `StatisticheCoperti.jsx` | Coperti & incassi giornalieri + spesa per coperto per categoria. Per i mesi pre-cutover (gen/feb 2026 e prima) fallback su endpoint 12: solo incassi giornalieri dal registro corrispettivi, con banner esplicativo (v1.2.1) |
| Storico | `/statistiche/storico` | `StatisticheStorico.jsx` | YoY pluriennale + giorno della settimana (v1.2) |
| Import | `/statistiche/import` | `StatisticheImport.jsx` | Upload .xls + storico + delete |

### Navigazione

`StatisticheNav.jsx` — tab navigation (Dashboard, Prodotti, Coperti & Incassi, Storico, Import + "soon": Cantina, Personale). Import visibile solo per admin. Tema colore: rose.

### Dashboard

- **KPI cards:** fatturato totale, pezzi venduti, numero categorie
- **Categorie:** lista con barra percentuale relativa alla categoria con piu' fatturato
- **Top 15:** tabella con prodotto, categoria, quantita', totale, prezzo medio
- **Movimenti (v1.2):** solo in vista Mese — due card "In crescita"/"In calo" vs mese precedente importato (endpoint 11, n=8)
- **Trend mensile:** barre CSS con altezza proporzionale al fatturato
- **Filtro periodo:** Anno / Mese / Tutto

### Storico (v1.2)

- **Fatturato per anno:** barre con delta % anno su anno, anno corrente in brand-blue, media €/giorno
- **Matrice mese×anno:** fatturato per mese con delta % vs stesso mese anno precedente + riga "Parziale" (YTD omogeneo, fino all'ultimo mese completo)
- **Giorno della settimana:** barre media incassi per weekday con filtro anno; tabella coperti medi e split pranzo/cena (solo era shift_closures)

### Coperti — sezione "Cosa consuma un coperto" (v1.2)

Tabella per categoria iPratico del mese selezionato: venduto €, €/coperto, pezzi/coperto, delta €/coperto vs mese precedente disponibile nello stesso anno. Compare solo se il mese iPratico è importato e ci sono coperti da chiusure turno.

### Prodotti — trend per prodotto (v1.2)

Click su una riga → modal con barre mensili (tutti gli anni importati), quantità e totali. Usa l'endpoint 6 con `prodotto=`.

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
| Confronto anno su anno (incassi, ST.3 parziale) | Fatto 2026-07-02 (v1.2) |
| Vendite per giorno della settimana su incassi/coperti (ST.2) | Fatto 2026-07-02 (v1.2) |
| Spesa per coperto per categoria | Fatto 2026-07-02 (v1.2) |
| Movimenti prodotti mese su mese + trend per prodotto | Fatto 2026-07-02 (v1.2) |
| Confronto YoY sui singoli prodotti (ST.3 pieno — servono 2 anni di import iPratico) | Da fare |
| Export CSV/Excel dei dati aggregati (ST.4, mattone M.B) | Da fare |
| Grafici con libreria (recharts) | Da fare |
| Matching prodotti iPratico → ingredienti foodcost | Da fare |
| Margine per prodotto (incrocio con food cost) | Da fare |
| Post-K.12: rimuovere ramo daily_closures dalla cucitura storico | Da fare (dopo K.12) |
