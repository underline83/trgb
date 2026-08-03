# Modulo Statistiche — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03 (vs codice)
> **Vedi anche:** [modulo_vendite.md](modulo_vendite.md) (chiusure turno, corrispettivi) · [modulo_controllo_gestione.md](modulo_controllo_gestione.md) (ripartizione venduto iPratico nel Conto Economico)

**Stato:** beta
**Router:** `app/routers/statistiche_router.py` **v1.2.1** (`# @version` riga 1), registrato in `main.py:687` via `_mount`
**DB:** `foodcost.db` in `locali/tregobbi/data/` (tabelle `ipratico_*`, migration 018) + `admin_finance.sqlite3` in **sola lettura** `mode=ro` (daily_closures, shift_closures — `shift_preconti` NON viene letto: escluso per scelta, vedi §1)

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

Gli endpoint 8, 9, 10 e 12 leggono `admin_finance.sqlite3` (modulo cassa/banca) tramite l'helper condiviso `_storico_daily_rows()` (`statistiche_router.py:462-535`) con connessione SQLite `mode=ro` aperta in `_get_finance_conn_ro()` (`statistiche_router.py:451-459`, URI `file:...?mode=ro`): qualsiasi scrittura accidentale fallisce. È l'eccezione prevista dalle regole modulari (statistiche = aggregatore read-only). Il router non esegue alcuna scrittura fuori dalle proprie tabelle `ipratico_*` di foodcost.db.

**Cucitura storica (pre-K.12):** `daily_closures` copre 2021 → cutover, `shift_closures` dal cutover in poi. Il **cutover è dinamico** = `MIN(date)` di shift_closures (`statistiche_router.py:470`; oggi 2026-03-01, verificato sul DB live il 2026-08-03), quindi il codice sopravvive al refactor K.12 (futuro: quando daily_closures verrà dismessa il ramo daily restituirà 0 righe). Il ramo daily filtra `corrispettivi_tot > 0` e `date < cutover`; il ramo shift aggrega in Python per gestire la semantica cumulativa. Coperti e split pranzo/cena esistono solo nell'era shift.

**⚠️ SEMANTICA CUMULATIVA shift_closures (v1.2.1, verificata sui dati):** la riga CENA contiene la **chiusura RT cumulativa di giornata** (la Z del registratore include il pranzo); la riga PRANZO è il parziale pranzo. Prova: nell'overlap 1-10 marzo 2026 `cena.preconto + fatture(giorno) == daily_closures.corrispettivi_tot` in 8/8 giorni; 0 violazioni `cena<pranzo` su 102 giorni a 2 turni; marzo/giugno coincidono con il venduto iPratico a ±70€. Quindi:

- fatturato giorno = `cena.preconto + SUM(fatture)` — **MAI pranzo+cena** (raddoppia il pranzo, bug v1.2 segnalato da Marco)
- fatturato pranzo = `pranzo.preconto + pranzo.fatture`; fatturato cena = `(cena.preconto − pranzo.preconto) + cena.fatture`
- i **coperti sono reali per turno** e si sommano normalmente
- `shift_preconti` NON si somma: per omogeneità con la metrica daily-era (`corrispettivi_tot` = RT + fatture) i bonifici/preconti gruppo sono esclusi in entrambe le ere
- **NB (aggiornato 2026-08-03):** `/admin/finance/shift-closures/stats/daily` (modulo cassa, fonte primaria della pagina Coperti) **non ha più la doppia conta pranzo+cena**: oggi gestisce la semantica cumulativa (`fatt_cena = (cena.preconto − pranzo.preconto) + cena.fatture + preconti`, `app/routers/chiusure_turno.py:471-491`). Resta però una **differenza metodologica**: stats/daily **include** i preconti gruppo di `shift_preconti` nel fatturato (`chiusure_turno.py:436-455,475`), mentre la cucitura statistiche li **esclude** → nei giorni con preconti gruppo la pagina Coperti mostra incassi leggermente superiori a Storico/YoY. Uniformare le due metriche è contesto K.12. (Il docstring di `statistiche_router.py:47-48` parla ancora di doppia conta: commento rimasto indietro rispetto al fix.)

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

Tutti gli endpoint richiedono JWT (`Depends(get_current_user)`); "admin" = check aggiuntivo `_require_admin` (`statistiche_router.py:82-92`, 403 per gli altri; superadmin passa via `is_admin`). Riferimenti riga = `app/routers/statistiche_router.py`.

| # | Metodo | Endpoint | Ruolo | Rif. | Descrizione |
|---|--------|----------|-------|------|-------------|
| 1 | POST | `/statistiche/import-ipratico?anno=&mese=` | admin | :98 | Import export iPratico (upsert) |
| 2 | GET | `/statistiche/mesi` | auth | :180 | Lista mesi importati (log) |
| 3 | GET | `/statistiche/categorie?anno=&mese=` | auth | :196 | Riepilogo categorie aggregato |
| 4 | GET | `/statistiche/prodotti?anno=&mese=&categoria=&q=&limit=&offset=` | auth | :246 | Dettaglio prodotti con paginazione |
| 5 | GET | `/statistiche/top-prodotti?anno=&mese=&n=` | auth | :307 | Top N prodotti per fatturato (default n=20, max 100) |
| 6 | GET | `/statistiche/trend?anno=&categoria=&prodotto=` | auth | :358 | Trend mensile |
| 7 | DELETE | `/statistiche/mese/{anno}/{mese}` | admin | :424 | Elimina dati di un mese |
| 8 | GET | `/statistiche/storico/yoy` | auth | :541 | Storico incassi pluriennale: annuale + matrice mese×anno (v1.2) |
| 9 | GET | `/statistiche/storico/weekday?anno=` | auth | :601 | Media incassi/coperti per giorno settimana, split pranzo/cena (v1.2) |
| 10 | GET | `/statistiche/coperto?anno=` | auth | :694 | €/coperto e pezzi/coperto per categoria iPratico, mese per mese (v1.2; `anno` obbligatorio) |
| 11 | GET | `/statistiche/movimenti?anno=&mese=&min_euro=&n=` | auth | :762 | Prodotti in crescita/calo/nuovi/spariti vs mese precedente importato (v1.2; `anno`+`mese` obbligatori) |
| 12 | GET | `/statistiche/storico/giorni?anno=&mese=` | auth | :662 | Incassi giornalieri di un mese dalla cucitura daily+shift — fallback pre-cutover per la pagina Coperti (v1.2.1; `anno`+`mese` obbligatori) |

### Note sugli endpoint

**Import (1):** riceve file via `multipart/form-data` + query params `anno` e `mese`. Salva il file in temp, lo parsa, elimina i dati precedenti per quel mese, inserisce i nuovi. Ritorna conteggio categorie, prodotti e totale euro.

**Categorie (3):** aggregazione per categoria. Se anno+mese: dati singolo mese. Se solo anno: aggregato annuale. Se niente: aggregato totale. Ordinato per fatturato decrescente.

**Prodotti (4):** aggregazione per prodotto con GROUP BY categoria+prodotto. Supporta ricerca testo (LIKE case-insensitive), filtro categoria, paginazione con LIMIT/OFFSET.

**Top prodotti (5):** come prodotti ma senza paginazione, ordinato per fatturato DESC, limitato a N (default 20).

**Trend (6):** raggruppa per anno+mese. Tre modalita': trend totale, trend per categoria, trend per prodotto specifico.

**Storico YoY (8):** ritorna `cutover`, `annuale[]` (fatturato, giorni aperti, media/giorno, coperti se disponibili) e `mensile[]` (matrice mese×anno). Fonte: daily_closures + shift_closures cuciti al cutover.

**Storico weekday (9):** media fatturato per giorno della settimana calcolata sui giorni aperti; `anno` opzionale (vuoto = tutta la storia). Campi per turno (`coperti_medio`, `fatt_pranzo_medio`, ecc.) calcolati solo sui giorni con fonte shift_closures (`giorni_turni`).

**Coperto (10):** per ogni mese dell'anno: coperti e fatturato da shift_closures, scontrino medio, e per ogni categoria iPratico `per_coperto` (€) e `pezzi_per_coperto`. I mesi senza chiusure turno hanno `coperti: null`.

**Movimenti (11):** confronta (anno, mese) con l'import immediatamente precedente in `ipratico_imports`. Filtra il rumore con `min_euro` (default 50, parametro esposto): considera solo prodotti sopra soglia in almeno uno dei due mesi. Ritorna `up`, `down`, `nuovi`, `spariti`, ciascuno limitato a `n` (default 10; la Dashboard chiama con `n=8`).

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

### Tabelle correlate e consumatori esterni

- **`ipratico_categoria_tipo`** (migration 149) — mapping categoria iPratico → tipo gestionale per il Conto Economico. È gestita dal modulo **Controllo Gestione** (GET/PUT `/controllo-gestione/ipratico-tipi`, `controllo_gestione_router.py:444-487`), non dal router statistiche: vive in foodcost.db con prefisso `ipratico_` ma la sua capability è documentata in [modulo_controllo_gestione.md](modulo_controllo_gestione.md).
- Il **Conto Economico** legge `ipratico_prodotti` in sola lettura per la ripartizione del venduto per tipo (`app/services/conto_economico.py:773-804`, `_ripartizione_vendite`). Nessun modulo esterno **scrive** nelle tabelle `ipratico_*` di import: le uniche scritture restano gli endpoint 1 e 7 di questo router.
- **⚠️ File orfani nel data dir:** in `locali/tregobbi/data/` esistono `ipratico.sqlite3` e `statistiche.sqlite3`, entrambi **vuoti (0 byte) e non referenziati da nessun codice** (verificato 2026-08-03): probabili stub creati per errore. Le tabelle vere del modulo stanno in `foodcost.db`.

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

### Aggregazione duplicati

iPratico può esportare lo stesso prodotto più volte nella stessa categoria (es. stesso nome con prezzi diversi). Il parser somma quantità e totale per chiave (categoria, prodotto) prima di restituire la lista (`ipratico_parser.py:91-114`), per rispettare il vincolo `UNIQUE(anno, mese, categoria, prodotto)`.

---

# 6. Frontend

### Pagine

Componenti in `frontend/src/pages/statistiche/`. Route registrate in `App.jsx:414-426` (lazy import `App.jsx:169-173`).

| Pagina | Path | Componente | Descrizione |
|--------|------|------------|-------------|
| (redirect) | `/statistiche` | `ModuleRedirect` | Nessuna pagina menu: redirect al primo target permesso tra dashboard (sub) → coperti (sub) → prodotti → import (`App.jsx:414-420`) |
| Dashboard | `/statistiche/dashboard` | `StatisticheDashboard.jsx` | KPI, categorie con barre, top 15, movimenti, trend |
| Prodotti | `/statistiche/prodotti` | `StatisticheProdotti.jsx` | Tabella filtri + ricerca + paginazione (50/pagina) + modal trend prodotto |
| Coperti | `/statistiche/coperti` | `StatisticheCoperti.jsx` | Coperti & incassi giornalieri + spesa per coperto per categoria. **Fonte primaria: `/admin/finance/shift-closures/stats/daily` (modulo cassa)**; per i mesi senza chiusure turno (gen/feb 2026 e prima) fallback su endpoint 12: solo incassi giornalieri dal registro corrispettivi, con banner esplicativo (v1.2.1) |
| Storico | `/statistiche/storico` | `StatisticheStorico.jsx` | YoY pluriennale + giorno della settimana (v1.2) |
| Import | `/statistiche/import` | `StatisticheImport.jsx` | Upload .xls + storico + delete |

Le route Dashboard e Coperti hanno permesso di **sotto-modulo** (`ProtectedRoute sub="dashboard"` / `sub="coperti"`, `App.jsx:422,425`), allineato ai `sub` di modules.json (§7); Prodotti, Storico e Import richiedono solo l'accesso al modulo.

> **Storico, superato:** la pagina "Menu" (`StatisticheMenu.jsx` con tile colorate) non esiste più nel codice; `/statistiche` è oggi il redirect qui sopra. Resta invece nel repo un **file orfano** `pages/statistiche/CucinaMenu.jsx` ("Statistiche Cucina"), mai importato da App.jsx e con link a route `/statistiche/cucina/*` inesistenti — residuo da ripulire.

### Navigazione

`StatisticheNav.jsx` — tab navigation (Dashboard, Prodotti, Coperti & Incassi, Storico, Import iPratico + "soon" disabilitati: Cantina, Personale). Import visibile solo per admin (superadmin eredita, `StatisticheNav.jsx:21`). Tema colore: rose.

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

- `modules.json` — modulo `statistiche`, ruoli **`superadmin` + `admin`** (niente viewer), con due sotto-moduli a permesso dedicato: `dashboard` e `coperti` (seed `app/data/modules.json:105-115`; a runtime il backend legge seed+runtime da `locali/<id>/data/` via `modules_router.py:27-29`)
- `versions.jsx` — chiave `statistiche` **v1.2.1**, status beta (`frontend/src/config/versions.jsx:129-146`)
- Home / menu header — card e dropdown da `modulesMenu.js:106-117` (icona 📈, tema rose, 5 sub; Import iPratico con `check: "admin"`); righe dati fallback della card in `Home.jsx:28`
- `main.py:687` — `_mount("statistiche_router", statistiche_router.router)`

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
