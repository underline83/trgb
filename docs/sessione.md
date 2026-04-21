# TRGB — Briefing sessione

**Ultimo aggiornamento:** 2026-04-22 (sessione 54 — Flussi cassa contanti: filtro data da/a + tab "Flusso contanti" + baseline saldo iniziale + unificazione Pre-conti/Spese varie)
**Documenti collegati:** [`docs/roadmap.md`](./roadmap.md) · [`docs/problemi.md`](./problemi.md) · [`docs/changelog.md`](./changelog.md) · [`docs/architettura_mattoni.md`](./architettura_mattoni.md) · [`docs/home_per_ruolo.md`](./home_per_ruolo.md) · [`docs/mattone_calendar.md`](./mattone_calendar.md) · [`docs/deploy.md`](./deploy.md)
**Storico mini-sessioni dettagliato:** [`docs/sessione_archivio_39.md`](./sessione_archivio_39.md)

---

## SESSIONE 54 (2026-04-22) — FLUSSI CASSA CONTANTI: filtro data + tab Flusso contanti

### Modifiche
1. **Filtro data da/a** sui tab esistenti `Pagamenti spese` e `Versamenti in banca` (Flussi di cassa → Contanti).
   - BE: `/controllo-gestione/movimenti-contanti` accetta `data_da`/`data_a` (override su anno/mese).
   - BE: `/admin/finance/cash/daily` accetta `data_da`/`data_a`, `_aggregate_shift_closures_by_date` esteso con `date_from`/`date_to`.
   - FE: due input date "da"/"a" + pulsante "✕ pulisci" sotto la nav mese. Se valorizzati, disabilitano la nav mese.
2. **Nuovo tab "📊 Flusso contanti"** dentro Movimenti Contanti.
   - BE nuovo endpoint `/admin/finance/cash/flow` (admin_finance.py): eventi cronologici con saldo cumulativo riportato dal periodo precedente.
     - Entrata = contanti fiscali giornalieri (corrispettivi − elettronici).
     - Uscita  = `cg_uscite` con `metodo_pagamento = 'CONTANTI'`.
     - Giorni senza entrate né uscite non compaiono.
     - Saldo iniziale = somma entrate storiche − somma uscite contanti storiche prima del periodo (non tiene conto dei versamenti in banca, per volontà di Marco).
   - FE componente `SubFlussoContanti` in `GestioneContanti.jsx`: KPI (saldo iniziale / entrate / uscite / saldo finale) + tabella con cumulativo.

### File toccati
- `app/routers/controllo_gestione_router.py` → `get_movimenti_contanti` +data_da/data_a
- `app/routers/admin_finance.py` → `_aggregate_shift_closures_by_date` esteso + `get_cash_daily` +data_da/data_a + helper `_contanti_fiscali_by_date` + endpoint `/cash/flow` + `CashDailyResponse` con year/month/data_da/data_a Optional + import `timedelta`
- `frontend/src/pages/admin/GestioneContanti.jsx` → filtro data in `SubPagamentiContanti` + `SubVersamentiContanti` + nuovo `SubFlussoContanti` + sub-tab switcher a 3 voci

### Da verificare dopo push
- che il saldo iniziale del flusso sia sensato (può essere molto alto: tutti gli incassi contanti storici meno tutte le spese contanti storiche — è l'importo netto teorico generato in cassa dall'origine dei dati).
- che filtro data da/a funzioni anche con uno solo dei due campi compilato (es. solo "da" = "dalla data in poi").

### Iterazione 2 (stessa sessione 54)
Marco: "sottrai i versamenti così diventa una cassa contanti effettiva; però visto che non abbiamo caricato tutti i dati storici della banca, il numero risulterà troppo sbagliato. In impostazioni aggiungi la possibilità di settare una data iniziale con un valore iniziale".

Implementato:
1. **BE**: `/admin/finance/cash/flow` ora sottrae anche i **versamenti** (cash_deposits) dal saldo iniziale storico e li mostra come terzo tipo di evento nella tabella (type=`versamento`, icona 🏦, colonna Uscita).
2. **BE**: nuova tabella `cash_flow_baseline` (single row, id=1) in `admin_finance.sqlite3` con `baseline_date`, `baseline_value`, `note`.
3. **BE**: endpoints `GET /admin/finance/cash/flow/baseline` e `PUT /admin/finance/cash/flow/baseline` (PUT solo admin/superadmin).
4. **BE**: logica `/cash/flow` — se baseline attivo e `period_start >= baseline_date`: parte da `baseline_value` alla `baseline_date`, poi applica entrate − spese − versamenti tra baseline_date e giorno prima del periodo. Altrimenti fallback storico completo.
5. **FE BancaImpostazioni**: nuova voce menu "💰 Saldo cassa contanti" con tab dedicata (`TabCashBaseline`): data + valore iniziale + nota + Save/Reset, con spiegazione in basso.
6. **FE SubFlussoContanti**: rendering del tipo `versamento` (badge 🏦 Versamento sky), footer che distingue spese+versamenti, nota esplicativa che si adatta a baseline attivo/non attivo.

### File toccati (iter 2)
- `app/routers/admin_finance.py` → tabella+helper+2 endpoints baseline + helper `_sum_versamenti_range`, `_sum_spese_contanti_range` + `/cash/flow` riscritto con baseline logic + versamenti come eventi + nuovi campi response (`baseline_applicato`, `baseline_date`, `baseline_value`, `totale_versamenti`).
- `frontend/src/pages/banca/BancaImpostazioni.jsx` → voce menu "cash-baseline" + componente `TabCashBaseline`.
- `frontend/src/pages/admin/GestioneContanti.jsx` → `SubFlussoContanti` rendering versamento + footer/nota aggiornati.

### Verifiche sintassi
- `python3 -m py_compile admin_finance.py` → OK.
- esbuild su entrambi i .jsx → OK.

### Iterazione 3 (stessa sessione 54)
Marco: "Sistemiamo anche la parte di pre-conti e di spese varie; unendole in una sola categoria con 3 tab; come nome della categoria teniamo Spese varie, all'interno 3 tab: Pre-conti, Spese varie; Flusso Spese fa da totale sommando le due".

Implementato (FE only — nessuna modifica BE):
1. **Sidebar `GestioneContantiContent`**: rimossa voce separata `Pre-conti`. Ora il menu ha 3 voci: `Movimenti Contanti`, `Spese turno`, `Spese varie` (quest'ultima solo `superOnly`).
2. **Nuovo wrapper `SezioneSpeseUnificata`** con 3 sub-tab pill:
   - `📥 Pre-conti` → render `<SezionePreconti />` (invariato).
   - `💸 Spese varie` → render `<SezioneSpeseVarie />` (invariato).
   - `📊 Flusso spese` → nuovo componente `SubFlussoSpese`.
3. **Nuovo componente `SubFlussoSpese`**: aggrega cronologicamente preconti (entrate) + spese varie (uscite).
   - Fetch parallelo `/admin/finance/shift-closures/preconti` + `/admin/finance/cash/expenses` + `/admin/finance/cash/expense-categories` + `/admin/finance/cash/opening-balance/{year}`.
   - KPI: `Saldo inizio anno`, `Pre-conti entrate`, `Spese varie uscite`, `Saldo periodo` (entrate − uscite).
   - Tabella: Data / Tipo (badge `📥 Pre-conto` emerald o `💸 <categoria>` con colore dinamico da `COLOR_MAP`) / Descrizione / Entrata / Uscita / Cumulativo.
   - Cumulativo parte da 0 all'inizio del periodo (non ancorato: il saldo ancorato all'opening balance vive già in `SezioneSpeseVarie`). Nota esplicativa in fondo.
   - Nav mese + filtro data da/a speculari a `SubFlussoContanti`.
4. Le funzioni `SezionePreconti` e `SezioneSpeseVarie` sono rimaste invariate: solo `MENU_BASE` e il wrapper sono cambiati.

### File toccati (iter 3)
- `frontend/src/pages/admin/GestioneContanti.jsx` → `MENU_BASE` 4→3 voci, render `SezioneSpeseUnificata` sul key `spese-varie`, nuovi componenti `SezioneSpeseUnificata` + `SubFlussoSpese`.

### Verifiche sintassi (iter 3)
- esbuild `GestioneContanti.jsx` → OK.
- esbuild `BancaImpostazioni.jsx` → OK (non modificato, doppio check).

---

## SESSIONE 53 cont. (2026-04-21 pomeriggio) — VETTORE CORRUZIONE IDENTIFICATO + FIX IN PRODUZIONE

### Diagnosi (dopo richiamo di Marco a non cercare colpe esterne)
Riesame profondo di tutto il lavoro del 20/04: il vettore reale era nel commit `c31d70c` (20/04 19:23 — Vini v3.19 Fase 6 storico prezzi BE, *non* nel push S52 scagionato a metà giornata). Tre problemi cumulati nello stesso commit:
1. `init_magazzino_database()` apriva una scrittura su `sqlite_master` ad ogni boot del router (`CREATE TABLE IF NOT EXISTS vini_prezzi_storico` + `CREATE INDEX IF NOT EXISTS idx_vps_vino_data` con CHECK constraint).
2. `upsert_vino_from_carta()` e `update_vino()` accorpavano in **una singola transazione lunga** l'UPDATE/UPSERT su `vini_magazzino` + l'INSERT log su `vini_prezzi_storico`, con commit finale unico (commit intermedio rimosso).

Quando il push FE-only `da9b605` delle 22:29 ha riavviato il backend, il SIGTERM è arrivato mentre c'erano frame WAL misti su una transazione aperta → fsync interrotto → `sqlite_master` inconsistente → `malformed database schema`. Le 3 corruzioni successive (22:51, 23:16, 00:53) sono lo stesso pattern ripetuto durante la finestra di debug attivo con push concorrenti.

### Fix applicato (file unico `app/models/vini_magazzino_db.py`)
1. **`init_magazzino_database()`**: `SELECT 1 FROM sqlite_master` prima di `CREATE TABLE/INDEX` → zero scritture su sqlite_master a ogni boot.
2. **`upsert_vino_from_carta()`**: `conn.commit()` SUBITO dopo l'UPSERT principale; log storico in transazione separata best-effort (try/rollback).
3. **`update_vino()`**: stesso pattern.
4. `bulk_update_vini` lasciato com'è (atomicità voluta per ricalcolo-tutti, usato solo in operazioni manuali — finestra di esposizione molto stretta).

Sintassi verificata con `ast.parse()` → OK. Diff: +56/-29 righe su un solo file.

### Stato post-push
- S52-1 spostato in **osservazione** (declassabile a chiuso dopo 24-48h di servizio reale senza re-manifestazione).
- Da fare: riavviare monitor forense (`/tmp/trgb_monitor.sh`) in occasione del prossimo servizio pranzo/cena per validare sotto carico reale.
- Push S52 definitivamente scagionato: il danno era già nel codice 19:23 del 20/04, S52 ha solo propagato lo stato corrotto scaricato dal VPS.

### Lezione di metodo (per Claude)
Quando inseguo un vettore di corruzione SQLite e l'ipotesi 1 non regge: **non saltare a una nuova ipotesi esterna**, ma rifare un riesame *delle modifiche del codice già fatte nella sessione*, transazione per transazione. La causa più probabile è una scrittura su `sqlite_master` o una transazione lunga interrotta da SIGTERM, generata da uno dei miei commit recenti.

---

## SESSIONE 53 (2026-04-21 ~12:00-12:55) — 5ª CORRUZIONE + RECOVERY DA `.prev` LOCALE

### Contesto
Marco ha pushato il deliverable di sessione 52 (hardening 1.11.2 + cleanup `vini_db` + anti-conflitto). Al rientro: backend in **crash loop, 530+ restart in ~50 minuti** (Restart=on-failure, RestartSec=5). Stesso pattern: `malformed database schema (idx_vm_tipologia) - index ... already exists` su `vini_magazzino.sqlite3`. **5ª corruzione consecutiva.**

### Indagine (corretta dopo richiamo di Marco)
Inizialmente ho perso tempo facendo forensics VPS-side (`.recover` → solo `lost_and_found`, dati strutturalmente persi). Marco ha richiamato all'ordine: `push.sh` salva `cp $db → ${db}.prev` **prima** di scaricare il DB dal VPS, quindi il **backup sano della push precedente è già nel workspace locale**.

Verifica `.prev` (Python sqlite3 dopo `cp` su `/tmp` ext4 — FUSE workspace blocca SQLite I/O):
- 8 tabelle integre, `vini_magazzino`: **1261 righe**, `vini_magazzino_movimenti`: 267 righe
- `MAX(updated_at) = 2026-04-20T20:34:31` (= ultimo write reale prima della 1ª corruzione delle 22:43 di ieri)

### Recovery #5 (12:49:58 CEST) — eseguita da Marco
1. Mac: `scp app/data/vini_magazzino.sqlite3.prev trgb:/tmp/vini_magazzino.RESTORE.sqlite3` (652KB)
2. VPS: `systemctl stop trgb-backend` → backup corrotto come `CORROTTO-5-20260421-*` → `cp RESTORE → vini_magazzino.sqlite3` → chown marco:marco → `rm -f vini_magazzino.sqlite3-wal vini_magazzino.sqlite3-shm` → `systemctl start trgb-backend`
3. **Servizio UP alle 12:49:58 CEST** (PID 3232683, 115.4MB), `quick_check = ok`

### Verità forense importante (da non perdere)
**Il push di sessione 52 NON è il vettore di corruzione.** Cronologia:
- 20/04 22:43 → 1ª corruzione (sessione 51, recovery #1)
- 20/04 22:51 → 2ª corruzione
- 20/04 23:16 → 3ª corruzione
- 21/04 00:53 → 4ª corruzione (sessione 51 cont., recovery #4)
- 21/04 ~mattina → DB locale `.sqlite3` viene scaricato dal VPS già corrotto durante push di sessione 52
- 21/04 12:00 ca. → 5ª manifestazione (in realtà è il riapparire della 4ª, perché `.prev` mostra MAX(updated_at)=20:34 di ieri = stato **prima** della 1ª corruzione)

**Conseguenza:** la finestra reale da indagare è **20/04 22:00 → 21/04 02:00** (4 corruzioni in 2.5h durante debug attivo + push concorrenti). Il push S52 ha solo *propagato* lo stato corrotto.

### Perdita dati
Tutti i write di `vini_magazzino` tra **20/04 20:34 e 21/04 12:49** sono persi dal DB ufficiale. Per il servizio cena del 20/04 (20:34 → 22:43, ~2h), c'è una possibilità di recupero parziale dal file VPS `vini_magazzino.BACKUP-20260420-223719.sqlite3` (corrotto solo per `idx_vm_tipologia` duplicato, dati probabilmente intatti — da verificare con `.recover` o riprovare `.dump` ignorando il primo errore).

### Lezione di metodo (per Claude — già in memoria)
Quando il backend va giù dopo un push e c'è una `.sqlite3.prev` nel workspace locale: **aprire `.prev` PRIMA di fare qualsiasi forensica VPS-side**. La diagnostica VPS serve solo dopo aver verificato lo stato del backup di partenza.

### Pendenze sessione 53
1. **S52-1 NON declassabile**: il vettore vero non è ancora chiaro. Va aperta la finestra journalctl 20/04 22:00 → 21/04 02:00.
2. Decidere se tentare recupero delta cena 20:34-22:43 da `BACKUP-20260420-223719`.
3. Aggiornare `problemi.md` (S52-1 con manifestazione #5) e `changelog.md`.
4. Eventuale unificazione 1.14.a (anti-conflitto soft-check) con Level 1 del mattone housekeeping (proposto da audit S51).

---

## SESSIONE 52 (2026-04-21 mattina) — HARDENING POST 4° CORRUZIONE + METODO ANTI-CONFLITTO

### Contesto
Fix 1.11 (WAL + `.gitignore` `*.sqlite3-wal`/`-shm`) **non ha chiuso** il problema:
alle 00:53 è avvenuta una **quarta corruzione** di `vini_magazzino.sqlite3` **prima** del push
delle 00:54 → la causa radice iniziale (push → `git clean -fd` → WAL cancellato) spiega
solo parte degli eventi. Esiste un secondo vettore di corruzione ancora ignoto.

Dopo recovery #4 (01:12, da backup hourly 22:00 + WAL + synchronous=NORMAL + VACUUM) il
backend è rimasto **UP per 9.5h consecutive** con monitor forense attivo (`/tmp/trgb_monitor.sh`):
oltre 1000 letture `PRAGMA quick_check` ogni 30s, **tutte `ok`**. DB stabile a 659456 bytes,
nessun file `-wal` creato (nessuno ha scritto sul DB stanotte = non test di carico vero).

### Indagine codice (stamattina)
1. **Commit sospetto c31d70c** ("Vini v3.19: widget riordini Fase 6 — storico prezzi BE") ispezionato a fondo: `CREATE TABLE IF NOT EXISTS vini_prezzi_storico` + `CREATE INDEX IF NOT EXISTS idx_vps_vino_data` sono idempotenti. Gli hook in `update_vino` / `bulk_update_vini` / `upsert_vino_from_carta` fanno **solo INSERT**, nessun DDL runtime. **Commit scagionato dal ruolo di colpevole diretto.**
2. **Import rotti `vini_db`** — trovati 3 riferimenti a `from app.models import vini_db` (modulo inesistente) in `dashboard_router.py:739`, `dashboard_router.py:806`, `alert_engine.py:404`. L'errore `cannot import name 'vini_db' from 'app.models'` visto nel log 00:36 si origina da qui. Non causa direttamente corruzione sqlite_master, ma è codice morto che va pulito.
3. **`init_magazzino_database()`** è chiamata a import-time del router (`vini_magazzino_router.py:249`): idempotente per i `CREATE ... IF NOT EXISTS`. Il blocco migration MODIFICA (linee 471-518) è pericoloso solo alla PRIMA esecuzione dopo upgrade (già passata).

### Teoria di lavoro residua
Il pattern delle 4 corruzioni (22:29, 22:51, 23:16, 00:53 — 20-25 min di intervallo
durante finestra di debug attivo con push concorrenti) e il silenzio delle 9.5h
successive (zero push, zero uso) suggeriscono **SIGTERM al backend mid-write concorrente
a write pendenti nel WAL**. La fix 1.11 (WAL persistente + `.gitignore` protetto +
`synchronous=NORMAL` + `busy_timeout=30000`) **dovrebbe** aver ridotto la finestra di
vulnerabilità, ma il test vero è oggi sotto carico reale + push.

### Piano sessione 52 (questa sessione)
| Blocco | Cosa | Effort | Stato |
|--------|------|--------|-------|
| **A** | Fix 3 import morti `vini_db` → `vini_magazzino_db` | XS | ▶️ in corso |
| **B** | Fix 1.11.2: WAL + `synchronous=NORMAL` + `busy_timeout=30000` sui DB rimanenti (`bevande`, `clienti`, `tasks`, `settings`, `dipendenti`, `admin_finance`, `core/database.py`) | S | ▶️ in corso |
| **C** | Monitor forense resta attivo oggi — se corruzione ricapita sotto carico reale avremo timestamp ±30s correlabile a journalctl | — | attivo |
| **D** | Metodo anti-conflitto push ↔ uso attivo (vedi sotto + `docs/deploy.md`) | S | ▶️ in corso |

### Deliverable pronti per push (atomico)
- `app/routers/dashboard_router.py` (2 fix import)
- `app/services/alert_engine.py` (1 fix import)
- `app/models/bevande_db.py` / `clienti_db.py` / `tasks_db.py` / ecc. (PRAGMA WAL)
- `app/core/database.py` (PRAGMA WAL)
- `docs/deploy.md` (sezione 6 — anti-conflitto)
- `docs/sessione.md`, `docs/problemi.md`, `docs/roadmap.md`, `docs/changelog.md`

**Commit suggerito:** `./push.sh "Hardening 1.11.2: WAL esteso a tutti DB + fix import vini_db morti + metodo anti-conflitto push/uso documentato"`

---

## SESSIONE 51 cont. (2026-04-21 00:55) — POST-MORTEM CORRUZIONI: causa radice trovata + fix 1.11 applicato

### Contesto
La sessione 51 (20/04) si era chiusa con due recovery SQLite e passaggio manuale a WAL.
Durante l'aggiornamento docs post-sessione ho fatto il terzo push della serata (23:13).
Al mio rientro per check log (21/04 ~00:30), il backend era in **crash loop da ~2h**
con la stessa corruzione (restart counter 646). Terzo incidente dello stesso tipo.

### Causa radice (trovata dopo il terzo recovery)
**Bug nel `.gitignore`.** Il file aveva:
```
app/data/*.db-wal    ← protegge foodcost
app/data/*.db-shm    ← protegge foodcost
app/data/*.sqlite3   ← vini, notifiche, clienti, ecc.
# MANCAVA: app/data/*.sqlite3-wal
# MANCAVA: app/data/*.sqlite3-shm
```

Flusso corruzione a ogni push:
1. DB in WAL → nascono `vini_magazzino.sqlite3-wal` e `-shm`
2. `push.sh` → post-receive VPS → **`git clean -fd`** → cancella i due file non gitignored
3. `systemctl restart trgb-backend` → SQLite riapre senza WAL → sqlite_master corrotto

Match perfetto log deploy: 22:29, 22:51, 23:13 (+ 23:16) = push = corruzioni.
Foodcost salvo perché i suoi `-wal`/`-shm` erano gia' gitignored.

### Fix 1.11 applicato (commit successivo a questo doc)
1. **`.gitignore`**: aggiunte `app/data/*.sqlite3-wal` e `*.sqlite3-shm` con commento storico.
2. **`app/models/vini_magazzino_db.py`** → v1.6-wal-protected: `PRAGMA journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=30000` in `get_magazzino_connection()`.
3. **`app/models/notifiche_db.py`** → v1.1-wal-protected: stessi 3 PRAGMA.
4. **`app/models/foodcost_db.py`**: aggiunto `synchronous=NORMAL` (WAL gia' presente).

### Recovery #3 (00:32)
- Preservato corrotto attuale come `CORROTTO-3-003238.sqlite3`
- `.dump` da `BACKUP-20260420-223719.sqlite3` → 647KB pulito
- `PRAGMA journal_mode=WAL; synchronous=NORMAL; VACUUM;`
- COUNT 1261 vini ✅, integrity ok ✅, swap + restart ok
- Backend `active (running)` alle 00:32:47, endpoint HTTP 200/401 ✅

### Deliverable pronto per push (atomico, critico)
- `.gitignore` (2 righe + commento)
- `app/models/vini_magazzino_db.py` (v1.6)
- `app/models/foodcost_db.py`
- `app/models/notifiche_db.py` (v1.1)
- `docs/changelog.md` (entry post-mortem)
- `docs/problemi.md` (S51-1 ora con causa radice)
- `docs/roadmap.md` (1.11 ✅, 1.11.2 nuovo, 1.12 downgrade priorita')
- `docs/sessione.md` (questa sezione)

### Follow-up aperti
- **1.11.2** coprire con WAL anche: `bevande`, `clienti`, `tasks`, `settings`, `dipendenti`, `admin_finance`, `core/database.py`
- **1.12** `push.sh` debounce anti-doppio-push (priorità ora media, il bug principale è risolto)
- **1.13** cleanup backup forensi quando stabile: ora ci sono anche `CORROTTO-3-*` e `FORENSE-2251`

### Comando push (atomico)
```
./push.sh "fix 1.11: WAL + .gitignore -wal/-shm — risolve corruzioni SQLite sessione 51 (post-mortem)"
```

⚠️ **ATTENZIONE AL PRIMO PUSH DOPO QUESTO FIX**: verificare che il backend torni UP
con `systemctl status trgb-backend` e `curl https://trgb.tregobbi.it/`. Se il DB è gia'
in WAL (lo è: abbiamo fatto recovery #3), il push NON dovrebbe corrompere, perché:
- Le nuove righe `.gitignore` escludono `-wal`/`-shm` da `git clean -fd`
- Il codice PRAGMA assicura che anche un DB ricreato da zero parta in WAL

---

## SESSIONE 51 — Vini v3.20 Fase 7 + v3.21 Fase 8 + TRIPLO recovery SQLite + WAL ✅ (testato OK)

Serata lunga: completate le ultime due fasi del refactor widget "📦 Riordini per fornitore" (v3.20 Fase 7 listino inline, v3.21 Fase 8 storico prezzi in SchedaVino), intervallate da **due crash del backend per corruzione di `sqlite_master`** su `vini_magazzino.sqlite3`. Entrambe recuperate col pattern dump+restore documentato nella memoria `feedback_sqlite_corruption_recovery.md`.

**Lato feature — v3.20 Fase 7 (listino inline in DashboardVini):**
- `frontend/src/pages/vini/DashboardVini.jsx` → colonna "Listino" editabile click-per-click (come già era per Prezzo Carta in Fase 5).
- Invio POST `/vini/magazzino/{id}/` con `origine="GESTIONALE-EDIT"`: l'hook Fase 6 logga automaticamente la variazione in `vini_prezzi_storico`.
- Feedback: spinner inline + toast successo/errore.

**Lato feature — v3.21 Fase 8 (sezione "Storico prezzi" in SchedaVino):**
- `frontend/src/pages/vini/SchedaVino.jsx` → header `v1.3-riordini-fase8`.
- Nuovo state: `prezziStorico`, `prezziLoading`, `prezziFiltroCampo` (listino / acquisto / ricarico / tutti).
- `fetchPrezziStorico()` → `GET /vini/magazzino/{id}/prezzi-storico/` → chiamato al mount e dopo ogni `saveEdit()` (riflette subito le modifiche locali).
- UI: pill di filtro + tabella con colonne Data · Campo · Prima · Dopo · Δ · Origine · Utente · Note. Δ visualizzato con ▲ rosso / ▼ verde (tolleranza 0.005), mapping amichevole di campo e origine (`GESTIONALE-EDIT`, `IMPORT-CSV`, `SCANNER-OCR`…).
- Nessuna modifica BE: endpoint già presente da Fase 6.

**Lato infrastruttura — doppio recovery SQLite:**

**Incidente #1 (22:37–22:43):**
- Push di Fase 6 aveva lasciato `sqlite_master` con duplicati su `locazioni_config`, `matrice_celle`, tutti gli `idx_vm_*`.
- Errore ciclico: `sqlite3.DatabaseError: malformed database schema (idx_vm_tipologia) - index already exists`.
- `PRAGMA integrity_check` fallisce; `REINDEX` fallisce con lo stesso errore (corruzione a livello catalogo).
- **Recovery:** `sqlite3 vini_magazzino.sqlite3 ".dump" | sqlite3 vini_magazzino_NEW.sqlite3` — gli errori `UNIQUE constraint` sono ATTESI (sono i duplicati scartati). File risultante 647KB, 1261 vini intatti.
- Backend UP alle 22:43.

**Incidente #2 (22:51–23:07):**
- Secondo `./push.sh` lanciato a 5 minuti dal primo → SIGTERM al backend mentre stava scrivendo schema (senza WAL, write atomic non garantito).
- Corruzione più grave: `malformed database schema (?)` — entry in `sqlite_master` con nome NULL.
- **PATH A (`.recover` sul file corrotto):** fallito — il DB recuperato (978KB) era privo della tabella `vini_magazzino`. Il `.recover` di SQLite non è riuscito a ricostruire la tabella principale.
- **PATH B (`.dump` dal `BACKUP-20260420-223719`):** successo — file 647KB con full schema, 1261 vini, `integrity_check = ok`, stessi errori UNIQUE attesi come incidente #1.
- Accettata micro-perdita dati nella finestra 22:29–22:51 (trascurabile: backend in crash loop quasi tutto il tempo, Marco ha confermato che nessuno ha usato l'app in quella finestra).
- **Recovery PATH B + switch a WAL:** `VACUUM` + `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;` prima dello swap. Backend UP alle 23:07, HTTP 200 su backend e frontend, WAL attivo → protezione contro SIGTERM mid-write in futuro.

**Deliverable:**
- FE: `DashboardVini.jsx` (Fase 7), `SchedaVino.jsx` v1.3-riordini-fase8 (Fase 8), `versions.jsx` vini 3.19 → 3.20 → 3.21.
- BE: nessuna modifica (endpoint Fase 6 già esistente).
- Docs: `changelog.md` (entry v3.20 + v3.21), `sessione.md` (questa sezione).
- Memoria: nuova entry `feedback_sqlite_corruption_recovery.md` in auto-memory, referenziata in `MEMORY.md`.
- VPS: `vini_magazzino.sqlite3` ora in WAL mode (file 647KB pulito, 1261 vini). Backup forensi conservati: `CORROTTO-20260420-224312` (incidente #1), `CORROTTO-2.20260420-230727` (incidente #2), `FORENSE-2251`, `BACKUP-20260420-223719`.

**Testato OK post-recovery (Marco ha confermato tutti i test):**
1. DashboardVini → colonna Listino editabile inline, salva con hook Fase 6 → entry in storico.
2. SchedaVino → sezione "Storico prezzi" popolata, filtri pill funzionanti, Δ colorato correttamente.
3. Modifica listino da dashboard → refresh scheda → storico aggiornato.
4. Backend stabile su WAL, frontend HTTP 200.

**Follow-up da fare in push dedicato (NON urgente, quando si tocca backend vini):**
- Aggiungere `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;` dentro `init_magazzino_database()` in `app/models/vini_magazzino_db.py`, così anche se il file viene ricreato da zero parte in WAL. Da replicare in init di `foodcost.db` e `notifiche.sqlite3` per simmetria.
- Considerare debounce in `push.sh`: se l'ultimo push è < 30 secondi fa → blocca con messaggio. Evita doppio push accidentale che manda SIGTERM mentre il backend sta facendo `init_*_database()`.
- Pulizia backup forensi: tra 1-2 giorni, tenere solo `CORROTTO-2.20260420-230727.sqlite3` come evidenza e rimuovere gli altri.

**Comandi push già eseguiti (storici):**
```
./push.sh "Vini v3.20: widget riordini Fase 7 — listino inline edit in DashboardVini"
./push.sh "Vini v3.21: widget riordini Fase 7 + SchedaVino Fase 8 — listino inline edit + sezione storico prezzi"
```

**Stato refactor widget "📦 Riordini per fornitore":** CHIUSO ✅ (tutte le 8 fasi in produzione da v3.21).

---

## SESSIONE 50quinquies — Vini v3.14: Ordine Categorie + TOC macro D.3 + skip vuote + numeri pagina ✅ (da testare post-push)

Quattro fix convergenti sulla Carta Bevande:

**1. Frecce ↑↓ via dalla sidebar, Ordine Categorie in Impostazioni**
- Marco: *"La gestione dell'ordinamento che vive nella pagina carta non mi piace per nulla"*. Le frecce admin in sidebar erano incoerenti col resto della UI ordinamento (Impostazioni Vini > Ordinamento Carta).
- `CartaBevande.jsx` → v2.3-shell: rimosse frecce, `moveSezione()`, role/isAdmin. Sidebar = sola navigazione.
- `ViniImpostazioni.jsx` → tab "Ordinamento Carta" guadagna come **prima zona** "Ordine Categorie", cornice ambra uniforme alle altre zone. Usa `OrderList` + `POST /bevande/sezioni/reorder` (endpoint gia' esistente).

**2. TOC PDF — macro-sezioni leggibili (variante D.3)**
- Marco: *"nell'indice la macro categoria (vini, amari…) e' veramente poco visibile"*. Prima le macro ("Vini", "Aperitivi", "Amari di Casa") usavano `.toc-tipologia` identica alle sotto-voci ("Rossi", "Bianchi").
- Iterazione a 3 round di mockup (in `docs/mockups/mockup_toc_macro.html`): R1 decorativo → rifiutato ("terribile, gioca col testo"); R2 5 varianti solo tipografia → scelta variante D (grande ma light); R3 D × 3 colori reali → scelta **D.3**.
- Aggiunta classe `.toc-macro` in `static/css/carta_pdf.css`: 18pt · peso 400 · uppercase · tracking 0.32em · colore `#5a4634` (marrone-terra, stesso delle nazioni).
- `build_toc_html` in `carta_bevande_service.py` emette `.toc-macro` per le macro (sia "Vini" che le 7 sezioni bevande standard); `.toc-tipologia` resta per il sotto-indice vini (Rossi/Bianchi/Bollicine).

**3. Skip sezioni vuote da TOC e corpo**
- Marco: *"compaiono ancora le categorie vuote, riusciamo a nasconderle?"*. Sezioni senza voci attive (es. "Tisane" senza record) apparivano come `<h2>` vuoto nel corpo e nell'indice.
- `build_carta_bevande_html` in `carta_bevande_service.py`: salta il blocco vini se `vini_rows` + `calici_rows` sono entrambi vuoti; salta le sezioni standard se `_load_voci_attive(key)` torna lista vuota.
- TOC era già coerente via `counts.attive` — ora i due builder (TOC + corpo) applicano lo stesso filtro.

**4. Numeri di pagina nell'indice PDF (WeasyPrint target-counter)**
- Marco: *"volevo chiederti se riusciamo a gestire i numeri pagine nell'indice"*.
- Aggiunte ancore nel corpo:
  - `build_section_html` → `<section id='sez-<key>'>` per ogni sezione bevande
  - `build_carta_bevande_html` → `<section id='sez-vini'>` sul blocco vini
  - `build_carta_body_html` in `carta_vini_service.py` → `<h2 id='vini-tip-<slug>'>` per ogni tipologia
- `build_toc_html` e `build_carta_toc_html` ora emettono ancore `<a class='toc-macro|toc-tipologia' href='#…'>` con struttura `<span class='toc-name'>…</span><span class='toc-leader'></span><span class='toc-pn'></span>`.
- CSS `carta_pdf.css`:
  - `.toc-macro`/`.toc-tipologia` convertiti a flex-anchor (display:flex, align-items:baseline, text-decoration:none)
  - `.toc-leader` → flex:1 con border-bottom dotted `#b89b6d` (leader a punti nello stile carta)
  - `.toc-pn::after` → `content: target-counter(attr(href url), page)` — WeasyPrint legge l'href e sostituisce col numero di pagina reale
- Effetto: ogni macro (Vini, Aperitivi, Amari di Casa…) e ogni tipologia vini (Rossi, Bianchi, Bollicine…) nell'indice ora ha linea dotted + numero pagina a destra. Comportamento da carta stampata professionale.

**Deliverable:**
- FE: `CartaBevande.jsx` v2.3-shell, `ViniImpostazioni.jsx` (+ zona Ordine Categorie), `versions.jsx` vini 3.13 → 3.14.
- BE:
  - `carta_bevande_service.py` → `build_toc_html` emette `.toc-macro` come ancora; `build_section_html` aggiunge `id='sez-<key>'`; `build_carta_bevande_html` aggiunge `id='sez-vini'` e skippa sezioni/vini vuoti.
  - `carta_vini_service.py` → `build_carta_toc_html` emette `.toc-tipologia` come ancora; `build_carta_body_html` aggiunge `id='vini-tip-<slug>'`.
  - `static/css/carta_pdf.css` → `.toc-macro`/`.toc-tipologia` flex-anchor + `.toc-leader` dotted + `.toc-pn::after` con `target-counter`.
- Docs: mockup conservato in `docs/mockups/mockup_toc_macro.html`, changelog, sessione.

**Da testare post-push (Ctrl+Shift+R):**
1. `/vini/carta/aperitivi` → sidebar pulita, nessuna freccia ↑↓.
2. `/vini/impostazioni/ordinamento-carta` → prima zona "Ordine Categorie" con le 8 sezioni (vini + 7 bevande). Drag/up/down riordina, "Salva" persiste.
3. Dopo save: refresh → ordine persiste sia qui sia nella sidebar di `/vini/carta`.
4. Export PDF (`📄 PDF`) da `/vini/carta/*` → aprire → indice: "VINI"/"APERITIVI"/"AMARI DI CASA"/… in uppercase grande chiaro, ben staccate dalle sotto-voci Rossi/Bianchi.
5. Ordine nell'indice PDF rispetta il nuovo "Ordine Categorie".
6. **NUOVO** — indice PDF: ogni macro (e ogni tipologia vini) ha linea dotted + numero pagina a destra. I numeri corrispondono alla pagina dove compare effettivamente la sezione nel corpo.
7. **NUOVO** — sezioni senza voci attive (es. "Tisane", "Distillati" se vuoti) NON compaiono più né nell'indice né nel corpo.
8. PDF Staff e Word: stesso comportamento (Word usa il suo template DOCX, solo PDF è impattato dal CSS).

**Comando push:**
```
./push.sh "Vini v3.14: Ordine Categorie in Impostazioni + TOC macro D.3 + skip sezioni vuote + numeri pagina nell'indice"
```

---

## SESSIONE 50quater — Home v3.6: Selezioni sotto "Gestione Cucina" ✅ (da testare post-push)

Marco: *"il modulo selezioni vive in cucina, non deve avere tile suo in home"*.

Cambio di mental model UI: Selezioni del Giorno non e' un modulo autonomo ma una funzione della cucina (preparata dai cuochi, letta da sala/sommelier). Sparisce come tile a se' stante, resta un widget in Home pagina 1 e diventa una sub-voce di "Gestione Cucina".

**Modifiche:**
- `frontend/src/pages/Home.jsx` — `visibleModules` esclude `m.key === "selezioni"`. Il widget `SelezioniCard` in pagina 1 (quello con 4 mini-blocchi: macellaio/pescato/salumi/formaggi) rimane invariato.
- `frontend/src/config/modulesMenu.js` — rimossa voce top-level `selezioni`. Aggiunte 4 sotto-voci `Selezioni · <zona>` dentro `ricette.sub` (Gestione Cucina). Route invariate (`/selezioni/<zona>`).
- `frontend/src/components/Header.jsx` — `currentModule` ora matcha anche `sub.go` del menu (non solo il prefix di `cfg.go`). Cosi' navigando a `/selezioni/*` l'header mostra "Gestione Cucina" come modulo attivo. Pattern generale, utile per futuri sub-menu cross-modulo.
- `frontend/src/config/versions.jsx` — home 3.5 → 3.6.

**Invarianti:**
- Route `/selezioni/*` non cambiano (no impatto bookmark/cronologia).
- Permessi da `modules.json` invariati (la sezione `selezioni` resta nel DB, solo la UI cambia).
- Widget SelezioniCard in Home pagina 1 resta.

**Da testare post-push (Ctrl+Shift+R):**
1. Home pagina 2 "Moduli" → non c'e' piu' la tile Selezioni.
2. Header dropdown → non c'e' piu' "Selezioni" come voce top-level.
3. Header dropdown → "Gestione Cucina" contiene le 4 voci `Selezioni · Macellaio/Pescato/Salumi/Formaggi`.
4. Clic su una voce Selezioni → naviga correttamente a `/selezioni/<zona>`.
5. Mentre si e' su `/selezioni/*` → Header mostra "📘 Gestione Cucina" come modulo corrente (non "Menu").
6. Widget SelezioniCard in Home pagina 1 invariato.

**Comando push:** `./push.sh "Home v3.6: Selezioni sotto Gestione Cucina, via tile top-level"`

---

## SESSIONE 50ter — Carta delle Bevande: fix form + riordino sezioni + fix auth export ✅ (da testare post-push)

Tre follow-up sulla shell sidebar (50bis):

**1. Bug form "un campo scrive su tutti"** — inserendo una nuova voce in una sezione, digitare nel campo "nome" popolava anche "ingredienti" e "note". Root cause: il seed backend usa `{"key": "nome", …}` mentre il FE leggeva `f.name` (undefined) → tutti i campi condividevano chiave `undefined` nello state. Fix lato FE: helper `fieldId(f) = f?.name ?? f?.key` in `FormDinamico.jsx` + `CartaSezioneEditor.jsx` (`validate`, `emptyFromSchema`, `importColumns`). Retro-compat con entrambe le convention, zero migrazioni.

**2. Riordino sezioni (gap UI)** — il backend ha sempre avuto `POST /bevande/sezioni/reorder` ma nessun punto UI lo usava. Aggiunte frecce ↑↓ nella sidebar della shell, visibili solo a admin/superadmin. `moveSezione(index, direction)` swappa col vicino, rinumera 10/20/30/…, POST batch, rollback ottimistico su errore. Stesso pattern del riordino voci dentro l'editor.

**3. Fix auth anteprima/export (bug segnalato da Marco mid-session)** — cliccando "Anteprima sezione" in una sezione (es. birre), il tab nuovo mostrava "Not authenticated". `window.open(url)` non inoltra l'header `Authorization: Bearer`. Stesso bug latente su PDF/PDF Staff/Word nell'header shell. Creato helper `frontend/src/utils/authFetch.js` con `openAuthedInNewTab(url, opts)`: apre subito un tab placeholder (bypass popup blocker), poi fa fetch con token, crea blob URL, lo carica nel tab. Usato in `CartaSezioneEditor` (anteprima sezione) e `CartaBevande` (PDF/PDF Staff/Word).

**Deliverable:**
- FE: `FormDinamico.jsx` v1.1, `CartaSezioneEditor.jsx` v1.2-panel, `CartaBevande.jsx` v2.2-shell, nuovo `utils/authFetch.js`, `versions.jsx` vini 3.12 → 3.13.
- Docs: changelog + questo file.

**Da testare post-push (Ctrl+Shift+R):**
1. `/vini/carta/aperitivi` → clic "+ Nuova voce" → scrivere in "nome" NON popola gli altri campi.
2. Ripetere test per altre 6 sezioni (birre, amari_casa, amari_liquori, distillati, tisane, te).
3. Frecce ↑↓ in sidebar visibili SOLO per admin/superadmin.
4. Clic ↑ sulla seconda sezione → swap con la prima, toast verde, sidebar si riordina.
5. Clic ↓ sull'ultima → freccia disabilitata.
6. F5 dopo riordino → ordine persiste (DB aggiornato).
7. Export PDF/HTML/Word rispetta il nuovo ordine sezioni.
8. Clic "👁 Anteprima sezione" in birre → apre tab con HTML della sezione, NIENTE 401.
9. PDF / PDF Staff / Word nell'header shell → aprono correttamente.

**Comando push:**
```
./push.sh "Carta Bevande: fix form (key/name) + riordino sezioni admin + fix auth anteprima/export (vini v3.13)"
```

---

## SESSIONE 50bis — Carta delle Bevande: shell con sidebar 8 sezioni ✅ (da testare post-push)

Dopo aver visto funzionare la shell di Selezioni del Giorno, Marco ha chiesto lo stesso pattern per la pagina `/vini/carta`. Prima era un hub-griglia con 8 card (Vini + 7 sezioni bevande); ora è una shell con sidebar a sinistra (8 voci sezione) e pannello a destra che cambia in base a `:sezione` nell'URL. Stesso layout di `SelezioniDelGiorno` e `ViniImpostazioni`.

**Decisioni:**
- Shell `/vini/carta/:sezione` rimpiazza l'hub-griglia.
- `CartaVini` e `CartaSezioneEditor` trasformati in **panel senza wrapper** (niente `min-h-screen`, niente `<ViniNav>`, niente bottone "← Carta"): ora sono blocchi renderizzati dentro la shell.
- `CartaSezioneEditor` riceve la sezione da prop `sezioneKey` invece che da `useParams()`.
- Default redirect `/vini/carta` → `/vini/carta/vini` (niente schermata intermedia).
- Redirect legacy `/vini/carta/sezione/:key` → `/vini/carta/:key`.
- Export buttons (PDF / PDF Staff / Word) e Btn "👁 Anteprima" vivono nell'header della shell, visibili per tutte le sezioni.
- `ViniNav` renderizzato una sola volta dalla shell, i panel non lo includono più.
- `CartaVini` e `CartaSezioneEditor` importati staticamente in `CartaBevande` (rimossi lazy imports doppi in App.jsx).

**Deliverable:**
- FE: `CartaBevande.jsx` v2.0-shell, `CartaVini.jsx` v3.6-panel, `CartaSezioneEditor.jsx` v1.1-panel, `App.jsx` nuove route + RedirectLegacySezione, `versions.jsx` vini 3.11 → 3.12.
- Docs: changelog + questo file.

**Da testare post-push (Ctrl+Shift+R):**
1. `/vini/carta` redirige immediatamente a `/vini/carta/vini` — no schermata intermedia hub-griglia.
2. Sidebar mostra 8 sezioni con icone e contatori. Click su sezione cambia URL e pannello senza ricaricare.
3. Sezione "Vini" mostra anteprima embedded + 4 Btn (Aggiorna Anteprima / HTML / PDF / Word) dedicati.
4. Sezioni editabili (es. "Aperitivi") mostrano tabella + Btn "+ Nuova voce" + modal form + import testo.
5. Vecchi link `/vini/carta/sezione/aperitivi` redirigono a `/vini/carta/aperitivi`.
6. Btn "👁 Anteprima" in header shell apre `/vini/carta/anteprima` (pagina separata).
7. Btn PDF / PDF Staff / Word in header aprono i download bevande.
8. ViniNav in cima alla pagina con tab "Carta" evidenziata, una sola volta (no doppio nav).

---

## SESSIONE 50 — Selezioni del Giorno: 4 zone unificate ✅ (da testare post-push)

Refactor del lavoro fatto poco prima (Scelta del Macellaio + Scelta dei Salumi + Scelta dei Formaggi) in un **modulo unico "Selezioni del Giorno"** con 4 zone (Macellaio, Pescato, Salumi, Formaggi). Marco voleva una sola voce di menu con sidebar di navigazione fra le 4 zone, stile uniformato alle pagine "Impostazioni" gia' usate (ViniImpostazioni / ClientiImpostazioni).

**Decisioni architetturali:**
- **Aggiunta quarta zona "Pescato"** (modello macellaio + campo `zona_fao`). Categorie seed Crudo/Cotto/Crostacei/Molluschi.
- **Salumi/Formaggi: nuovo modello stato** "attivo/archiviato" (toggle in carta ↔ archivio) al posto del modello venduto/disponibile. Niente piu' grammatura/prezzo nella UI nuova. Mantenute le colonne legacy `venduto`/`venduto_at` per retrocompat. PATCH `/venduto` deprecato (alias che setta entrambi).
- **Pagina shell unica `/selezioni/:zona`** con sidebar a sinistra (stile ViniImpostazioni: `w-56 flex-shrink-0`, nav space-y-0.5, accent attivo per zona) + content area che monta `<ZonaPanel zona={zona} />` generico guidato da `ZONA_CONFIG`. Una sola pagina, 4 comportamenti via config.
- **Widget Home unificato `SelezioniCard`**: 2x2 con 4 mini-blocchi colorati (rosso/azzurro/ambra/giallo). Sostituisce le 3 card separate `MacellaioCard`/`SalumiCard`/`FormaggiCard` in Home e DashboardSala. Click su mini-blocco → `/selezioni/<zona>`.
- **modules_router**: nuovo modulo top-level `selezioni` con sub `macellaio/pescato/salumi/formaggi`; sub equivalenti rimossi dal modulo `ricette`.
- **Redirect legacy**: `/macellaio`, `/salumi`, `/formaggi`, `/pescato` → `/selezioni/<zona>`.

**Deliverable:**
- BE: migrazione 094 (pescato), router `scelta_pescato_router.py`, refactor `scelta_salumi_router` e `scelta_formaggi_router` (v1.1 attivo/archiviato), `dashboard_router` con `_pescato_widget` + `SelezioniWidget` raggruppato, `modules_router` con nuovo modulo `selezioni`.
- FE: `pages/selezioni/zonaConfig.js` (4 config), `ZonaPanel.jsx` (CRUD generico), `SelezioniDelGiorno.jsx` (shell + sidebar), `components/widgets/SelezioniCard.jsx` (widget 2x2 unificato). App.jsx con nuova route + redirect legacy. modulesMenu.js con voce unica. Home.jsx + DashboardSala.jsx aggiornati. versions.jsx con `selezioni v1.0 beta`.
- Docs: changelog + questo file.

**Da testare post-push:**
1. Migrazione 094: log avvio backend deve creare `pescato_tagli`, `pescato_categorie`, `pescato_config` con i 4 seed.
2. Push con `-m`: auto-detect dovrebbe attivarsi (modules_router cambia hash JSON moduli).
3. Login admin → dropdown deve mostrare "Selezioni del Giorno" 🍽️ con 4 sub (Macellaio, Pescato, Salumi, Formaggi). Le voci vecchie sotto Gestione Cucina devono sparire.
4. Click su "Macellaio" → URL `/selezioni/macellaio`, sidebar con 4 zone, accent rosso sulla zona attiva. Switch fra zone via sidebar deve cambiare URL e contenuto.
5. Aggiungere un pescato con `zona_fao` "FAO 37.2.1 Adriatico" → controllare che il campo extra sia salvato e mostrato nella tabella.
6. Aggiungere un salume e un formaggio nuovi (form senza grammatura/prezzo); toggle "Archivia" → deve passare in tab "Archivio".
7. Tornare in Home → un solo widget `SelezioniCard` con 4 mini-blocchi colorati. Conteggio totale in header. Click su un blocco → naviga alla zona corrispondente.
8. Bookmark legacy: aprire direttamente `/macellaio` deve fare redirect a `/selezioni/macellaio`. Idem per `/salumi`, `/formaggi`, `/pescato`.
9. DashboardSala (login utente sala) → deve mostrare `SelezioniCard` al posto di `MacellaioCard`.

**Push suggerito:** `./push.sh "Selezioni del Giorno: modulo unico 4 zone (macellaio/pescato/salumi/formaggi) con sidebar + widget Home unificato"`

---

## SESSIONE 50 — Scelta dei Salumi e Scelta dei Formaggi ✅ (da testare post-push)

Duplicato il pattern di "Scelta del Macellaio" su due nuovi moduli: **Scelta dei Salumi** e **Scelta dei Formaggi**, sottomoduli di Gestione Cucina. Marco voleva pagine in cui registrare gli articoli disponibili descrivendoli per la sala (testo lungo "narrabile" da raccontare al cliente). Scelta architettonica: 3 moduli completamente separati (no tabella unica con `tipo`), 3 widget Home distinti.

**Schema dati**: ogni modulo ha `*_tagli` (con `nome, categoria, grammatura_g, prezzo_euro, produttore, stagionatura, territorio, descrizione, note, venduto, venduto_at` + `origine_animale` per salumi / `latte` per formaggi), `*_categorie` (CRUD da Impostazioni futura), `*_config` (chiave/valore — almeno `widget_max_categorie=4`).

**UI lista**: card collassata con badge sintetico (produttore · stagionatura · origine/latte · territorio) + bottone "▼ Mostra dettagli" che apre la `descrizione` per la sala in un box colorato. Separa scheda interna (note operative) da narrazione cliente (descrizione).

**Deliverable:**
- BE: migrazioni 091 (salumi) + 092 (formaggi), 2 router con CRUD completo, registrazione in `main.py` e in `modules_router.py` (sub `salumi` + `formaggi` su `ricette`, ruoli admin/chef/sala/sommelier/superadmin), estensione `dashboard_router.py` con `_salumi_widget()` e `_formaggi_widget()` e nuovi modelli `SalumiWidget`/`FormaggiWidget`.
- FE: 2 pagine (`SceltaSalumi.jsx` + `SceltaFormaggi.jsx`) con form 2-col + datalist origine/latte + lista espandibile, 2 widget Home (`SalumiCard` border amber-200 🥓, `FormaggiCard` border yellow-200 🧀) impilati dopo `MacellaioCard`, route `/salumi` e `/formaggi` in App.jsx con `ProtectedRoute module="ricette" sub="salumi"|"formaggi"`, voci dropdown in `modulesMenu.js`, versions.jsx con `salumi` e `formaggi` v1.0 beta.
- Docs: changelog + questo file.

**Da testare post-push:**
1. Migrazioni 091 e 092: controllare log avvio backend, devono creare 6 tabelle (`salumi_tagli`, `salumi_categorie`, `salumi_config`, `formaggi_tagli`, `formaggi_categorie`, `formaggi_config`) e i seed delle categorie.
2. Push con `-m` (auto-detect dovrebbe attivarsi grazie alla modifica di `modules_router.py` che cambia hash del JSON moduli).
3. Login admin → vedere `/salumi` e `/formaggi` nel dropdown Gestione Cucina.
4. Aggiungere 2-3 salumi e 2-3 formaggi con descrizione lunga, controllare che la card si espanda e mostri la descrizione in box colorato.
5. Tornare in Home → verificare che i 3 widget (macellaio, salumi, formaggi) siano impilati nella colonna laterale con count corretto.
6. PATCH venduto: tap "Venduto" su un articolo → deve diventare grigio + count widget cala + count "venduti oggi" sale.
7. Login con utente sala → deve poter accedere alle 3 pagine, ma vedere solo i taglieri (non l'editor categorie).

**Comando push:**
```
./push.sh "feat: scelta salumi e formaggi - 2 nuovi moduli con widget home dedicati"
```

---

## SESSIONE 49 — Home per ruolo configurabile ✅ (da testare post-push)

Spostata la config dei pulsanti rapidi Home (prima hardcoded negli array `ADMIN_ACTIONS` di Home.jsx e `SALA_ACTIONS` di DashboardSala.jsx) nel DB. Admin può ora scegliere quali pulsanti mostrare nella Home di ciascun ruolo, in che ordine, con che emoji/colore/route, dall'interfaccia Impostazioni → "🏠 Home per ruolo". Supporta 9 ruoli (admin, superadmin, contabile, sommelier, chef, sous_chef, commis, sala, viewer). Fallback FE statico garantisce zero regressioni se il BE è giù.

**Deliverable:**
- BE: migration 090 (tabella `home_actions` in foodcost.db) + router CRUD+reorder+reset + seed defaults centralizzato in `app/services/home_actions_defaults.py`.
- FE: hook `useHomeActions()` con fallback statico, refactor Home.jsx/DashboardSala.jsx per leggere dal hook invece degli array hardcoded, tab "Home per ruolo" in Impostazioni con selettore ruolo, lista riordinabile (▲/▼), toggle attivo, modal edit/new con tendina route estratta da `modulesMenu.js`, reset defaults per ruolo.
- Docs: `home_per_ruolo.md` spec, changelog + questo file + versions.jsx bump home 3.4 → 3.5.

**Da testare post-push:**
1. Migration: controllare log avvio backend che crei la tabella + 44 righe seed.
2. Home admin: stessi 5 pulsanti di prima (chiusura turno, prenotazioni, cantina, food cost, CG).
3. DashboardSala: stessi 4 pulsanti di prima.
4. Impostazioni → Home per ruolo: selettore ruolo funziona, riordino persiste, toggle attivo/disattivo funziona, aggiungi/modifica/elimina funziona, reset defaults ripristina seed.
5. Creare un pulsante custom per un ruolo, rifare login con quell'account → appare.

---

## SESSIONE 48 — Mattone M.E Calendar ✅ (deployato + testato OK)

Implementato in autonomia il mattone condiviso **M.E — componente calendario React riutilizzabile**. Push 2026-04-19, test manuali su VPS verificati OK (tutte le 3 viste, tastiera, drill-down, responsive iPad). Sblocca tre consumer roadmap (2.1 Agenda prenotazioni, 3.7 Scadenziario flussi, 6.4 Calendario turni, 6.5 Scadenze documenti) senza che ogni modulo debba riscriversi il proprio calendario. Zero dipendenze esterne (pure React + Tailwind), stateless controllato, 3 viste (mese/settimana/giorno), palette brand, tastiera built-in, render prop escape hatches.

**Demo admin-only:** URL diretto `/calendario-demo` (NON linkato da menu), `~20` eventi finti che coprono tutti i 4 casi d'uso (prenotazioni blu, scadenze fatture rosse/amber, turni verde, checklist viola, scadenze documenti slate).

**File nuovi:**
- `frontend/src/components/calendar/CalendarView.jsx` (componente pubblico)
- `frontend/src/components/calendar/MonthView.jsx` + `WeekView.jsx` + `DayView.jsx`
- `frontend/src/components/calendar/calendarUtils.js` (helpers date)
- `frontend/src/components/calendar/constants.js` (MESI_IT, COLORI_EVENTO, VIEWS)
- `frontend/src/components/calendar/index.js` (barrel)
- `frontend/src/pages/admin/CalendarDemo.jsx` (vetrina demo)
- `docs/mattone_calendar.md` (spec completa)

**File modificati:**
- `frontend/src/App.jsx` — lazy import + rotta `/calendario-demo` (module="impostazioni")
- `docs/architettura_mattoni.md` — M.E marcato ✅ con snippet d'uso
- `docs/roadmap.md` — header mattoni aggiornato + sezione Completati sessione 48
- `docs/changelog.md` — entry 2026-04-19 (Mattone M.E)

**Limiti v1 (espliciti):**
- No drag&drop (può essere aggiunto nel `renderEvent` del consumer)
- No creazione inline (il click emette callback; modale è del consumer)
- No eventi multi-giorno con span continuo (allDay su più giorni → mostrato su ogni giornata)
- No fusi orari multipli, no i18n

**Prossimi consumer (nell'ordine del backlog Wave 2+):**
- 3.7 Scadenziario flussi (use case più diretto: fatture + rate + stipendi già in DB)
- 2.1 Agenda prenotazioni (integrazione con il planning esistente)
- 6.4 Calendario turni (useremo `renderDayCell` per linee colorate per ruolo)

---

## SESSIONE 47 — Carta Bevande v1.0 Fase 3 ✅

Estensione Carta Vini a 7 sezioni bevande (Aperitivi, Birre, Amari casa, Amari & Liquori, Distillati, Tisane, Tè). Nuovo service `carta_bevande_service.py` con 3 layout dispatcher (`tabella_4col` / `scheda_estesa` / `nome_badge_desc`) + sezione `vini_dinamico` delegata a `carta_vini_service`. Router `bevande_router.py` v1.1 con 5 endpoint (HTML preview, PDF cliente, PDF staff, DOCX, preview per-sezione). CSS `.bev-*` allineato HTML/PDF con page-break-avoid. Retro-compat assoluta: endpoint `/vini/carta*` invariati, DB `bevande.sqlite3` isolato. Resta Fase 4 (popolamento voci — task Marco).

---

## SESSIONE 46 — Phase A.3: Brigata Cucina ✅

Resi `sous_chef` e `commis` ruoli utente reali, con parità moduli col chef attuale e filtro task auto server-side (chef vede tutto; sous_chef vede `sous_chef+NULL`; commis vede `commis+NULL`). Anti-escalation sia in lettura sia in scrittura. Backward-compat totale per utenti chef esistenti.

**File toccati:**
- `app/services/auth_service.py` — `VALID_ROLES` esteso + nuovo helper `is_cucina_brigade`.
- `app/routers/modules_router.py` — stessa estensione `VALID_ROLES` (duplicazione pre-esistente, allineata).
- `app/data/modules.json` — ovunque `"chef"` → aggiunti `"sous_chef"` e `"commis"` (Ricette, Flussi/mance, Task Manager, Dipendenti/turni). `modules.runtime.json` NON toccato (auto-sync via `_seed_hash`).
- `app/routers/tasks_router.py` — helper `_livello_auto_for_role`, `_allowed_livelli_for_role`, `_enforce_livello_write`, `_check_instance_visibility`. Filtro auto su letture (`/tasks/tasks/`, `/agenda/`, `/agenda/settimana`, `/templates/`, `/instances/{id}`, `/templates/{id}`). Anti-escalation su write (create_task, update_task, completa_task, delete_task, assegna/completa/salta_instance, check_item).
- `frontend/src/pages/admin/GestioneUtenti.jsx` — `ROLES`+`ROLE_LABELS` estesi.
- `frontend/src/components/LoginForm.jsx` — palette orange-500/yellow-500 coordinata con `LIVELLI_CUCINA`.
- `frontend/src/pages/tasks/TaskList.jsx` — dropdown livello nascosto per sous_chef/commis + hint orange.
- `frontend/src/pages/tasks/TaskNuovo.jsx` + `TemplateEditor.jsx` — opzioni dropdown livello limitate al ruolo.
- `frontend/src/config/versions.jsx` — bump `tasks` 1.2 → 1.3.
- `docs/changelog.md` + `docs/sessione.md` + `docs/spec_brigata_cucina.md` (spec di riferimento).

**Spec:** `docs/spec_brigata_cucina.md` (single source of truth). Vincoli: worktree `.claude/worktrees/brigata-cucina` su branch `feat/brigata-cucina`; `users.json` NON toccato (è file con hash, backward-compat garantita dall'estensione — non restrizione — di `VALID_ROLES`).

---

## SESSIONE 46 — Phase A.2: Livelli Cucina ✅

Aggiunto campo `livello_cucina` (chef/sous_chef/commis/NULL) su task_singolo, checklist_template, checklist_instance. Attivo solo se reparto='cucina'. NULL = tutta la brigata. Backward-compat garantita.

**File toccati:**
- `app/migrations/088_livello_cucina.py` (NUOVO)
- `app/schemas/tasks_schema.py`
- `app/routers/tasks_router.py`
- `app/services/tasks_scheduler.py`
- `frontend/src/config/reparti.js`
- `frontend/src/pages/tasks/TaskNuovo.jsx`
- `frontend/src/pages/tasks/TemplateEditor.jsx`
- `frontend/src/pages/tasks/TaskList.jsx`
- `frontend/src/components/tasks/TaskSheet.jsx`
- `docs/changelog.md`
- `docs/sessione.md`
- `docs/spec_livelli_cucina.md` (spec di riferimento)

**Spec:** `docs/spec_livelli_cucina.md` (single source of truth)

---

## SESSIONE 43 — Modulo Cucina MVP ✅

Primo rilascio del modulo **Cucina**: checklist ricorrenti HACCP-friendly + task singoli per chef/sala. Ispirato a prompt Cowork (`docs/modulo_cucina_mvp_prompt.md`). Scopo: sostituire il registro cartaceo con un sistema tap-to-complete iPad-ready.

**Naming ambiguity risolta**: il modulo "Ricette/FoodCost" aveva già label "Gestione Cucina" in `modulesMenu.js`. Marco ha scelto label semplice **"Cucina"** (🍳) per il nuovo modulo, label "Gestione Cucina" rimane al modulo ricette per ora — pianificata unificazione futura.

**Backend** (5 file nuovi + 3 modificati):
- Migrazione `084_cucina_mvp.py` → nuovo DB dedicato `cucina.sqlite3` con 6 tabelle (checklist_template, checklist_item, checklist_instance, checklist_execution, task_singolo, cucina_alert_log scaffold V1) + 3 template seed disattivi (Apertura, Chiusura, Pulizia bar).
- `app/models/cucina_db.py` → `get_cucina_conn()` + `init_cucina_db()` difensivo al boot del router.
- `app/schemas/cucina_schema.py` → Pydantic models + costanti enum (FREQUENZE/REPARTI/TURNI/ITEM_TIPI/STATI).
- `app/routers/cucina_router.py` → **18 endpoint** su prefix `/cucina/`: CRUD template (6), agenda (3), instance/execution (5), task (5), scheduler (2). Trailing slash rispettato su tutti i root dei gruppi.
- `app/services/cucina_scheduler.py` → `genera_istanze_per_data` (INSERT OR IGNORE idempotente), `check_scadenze` (UPDATE WHERE scadenza_at < now), `calcola_score_compliance` (% item OK), `trigger_scheduler` fire-and-forget.
- **Aggancio dashboard_router**: lo scheduler gira lazy su ogni `GET /dashboard/home` (pattern M.F). Zero cron esterno.
- **Main.py**: import + include_router cucina.

**Frontend** (8 file nuovi + 4 modificati):
- `CucinaHome.jsx` — dashboard entry con 4 KPI card + lista istanze oggi per turno + task oggi.
- `CucinaNav.jsx` — nav top condivisa con VersionBadge e 5 voci.
- `CucinaAgendaGiornaliera.jsx` — navigazione data ←/→/oggi, filtro turno, KPI 4 mini-card, istanze raggruppate per turno, click → instance detail.
- `CucinaInstanceDetail.jsx` — **tap-to-complete** con 3 bottoni OK/FAIL/N.A. per item. **Numpad touch-friendly** per TEMPERATURA/NUMERICO (tasti 60pt). Range atteso mostrato ("0°..4° °C"), fuori range forza FAIL automatico con nota. Prompt testo per tipo TESTO. Progress bar, bottoni Completa/Salta sticky in fondo, assegna utente popover.
- `CucinaTemplateList.jsx` — lista admin raggruppata per reparto+turno, filtri, azioni toggle-attiva / modifica / duplica / elimina (con conferma cascade).
- `CucinaTemplateEditor.jsx` — form create/edit con items riordinabili ▲▼, auto-preset 0..4°C per primo TEMPERATURA, validazione client (nome, titolo, range min≤max, HH:MM).
- `CucinaTaskList.jsx` — tabella task con filtri user/data/stato, azioni inline Completa/Riapri/Annulla/Elimina.
- `CucinaTaskNuovo.jsx` — modal create/edit (riusato).
- `CucinaAgendaSettimana.jsx` — grid 7 colonne lun-dom, oggi evidenziato, pallini colorati per stato + abbreviazione turno, click giorno → agenda dettagliata. Scroll-x mobile.

**Config**:
- `modules.json` → entry `cucina` con ruoli (admin/chef pieno, sala limitato, viewer read-only).
- `modulesMenu.js` → voce `cucina` 🍳 con colori rossi (bg-red-50) — non collide con altri moduli.
- `versions.jsx` → `cucina v1.0 beta`.
- `.gitignore` → `app/data/cucina/` per futura cartella runtime (uploads V1).

**Workflow gotcha**: iniziato in worktree `claude/sharp-almeida-9d4785`, rilevato dopo 2 push inutili che `push.sh` dalla main dir non vede i commit (branch diverso). Switch a lavorare direttamente su `/Users/underline83/trgb/` main dallo step 5 in poi. Backend Step 1-4 copiato dal worktree al main via `cp` in blocco, frontend Step 5-8 scritto direttamente.

**Commit points** (uno per step come da feedback "no blocchi accoppiati"):
1. `cucina: migrazione MVP + 6 tabelle + 3 template seed`
2. `cucina: API CRUD template e items`
3. `cucina: scheduler + agenda + esecuzione checklist`
4. `cucina: backend MVP completo (DB + template CRUD + scheduler + agenda + task)`
5. `cucina: voce menu + home modulo`
6. `cucina: agenda giornaliera + esecuzione tap-to-complete`
7. `cucina: editor template admin`
8. `cucina: task singoli + agenda settimana`

**Test effettuati (backend)**: CRUD completo via chiamate dirette a funzioni router, validazione reparto/turno/tipo item, TEMPERATURA richiede min+max, permessi (chef bloccato su POST, sala 403, viewer read-only via middleware), idempotenza scheduler (2a chiamata = 0 creati), check_scadenze con ora futura, tap-to-complete APERTA→IN_CORSO→COMPLETATA, score compliance 100 e 50 su test-case, doppia completa 400, check su completata 400, salta con motivo, auto-scadenza task.

**Test effettuati (frontend)**: `vite build` clean su ogni step (858 moduli, 0 errori JSX/import).

**Non fatto (V1)**: foto/firma, integrazione M.F Alert Engine (scaffold `cucina_alert_log` pronto), dashboard KPI, PDF export, checker `@register_checker`, corrective action automatico, frequenze settimanale/mensile.

**Version bump**: nuovo modulo `cucina v1.0 beta` in `versions.jsx`.

---

## SESSIONE 42b — CG Liquidita' v2.10: tassonomia uscite ✅

Follow-up immediato di v2.9: la tassonomia custom esisteva solo per le entrate, mentre il ~38% delle uscite (135 movimenti su 351 negli ultimi 12 mesi) arrivava dal feed BPM con `categoria_banca=''` e finiva in un generico "Non categorizzato". Classificate ora con pattern matching su descrizione + categoria + sottocategoria.

**Backend** — `liquidita_service.py v1.1`:
- Nuova `classify_uscita(row)` con 11 tag ordinati per specificita': Fornitori, Stipendi, Affitti e Mutui, Utenze, Tasse, Carta, Banca, Assicurazioni, Bonifici, Servizi, Altro.
- Regole: `cat='Risorse Umane'` → Stipendi, `'effetti ritirati'/'add.effetto'` → Fornitori (RiBa), `'mutuo'/'rimborso finanz'` → Affitti e Mutui, `'imposta'/'f24'/'agenzia entrate'/'pag telemat'` → Tasse, `'cartimpronta'/'debit pagamento'` → Carta, `'comm su'/'commissioni'` → Banca, `'vostra disposizione'/'vs.disp'` → Bonifici (spesso fornitori non classificati), `'addebito diretto sdd'/'sdd core'` → Servizi.
- Nuove funzioni `uscite_mensili_anno(conn, anno)` e `ultime_uscite(conn, limit=15)` simmetriche alle entrate.
- `dashboard_liquidita()` ora restituisce `uscite_per_tipo`, `uscite_mensili`, `uscite_tags`, `ultime_uscite`.

**Frontend** — `ControlloGestioneLiquidita.jsx v1.1`:
- Palette `USCITA_COLORS` con 11 colori coerenti (ambra/viola/teal/blu/rosso/arancio).
- Nuova RIGA 3 simmetrica alla RIGA 2: PieChart uscite per tipo (1 col) + BarChart stacked "Uscite mensili {anno}" (2 col).
- Rimossa sezione barre CSS rosse per categoria (superata dal Pie).
- RIGA 5 ora ha tabelle gemelle "Ultime entrate" + "Ultime uscite" con badge colorato per tipo.
- Layout totale: 5 righe (KPI, Trend+PieE, PieU+MensiliU, MensiliE+YoY, TabE+TabU).

**Smoke test** (produzione 17 apr 2026):
- **Distribuzione finale v1.2 su 351 uscite 12m: Banca 101 / Fornitori 74 / Servizi 61 / Bonifici 41 / Carta 28 / Utenze 13 / Stipendi 12 / Affitti 10 / Tasse 9 / Assicurazioni 2 / Altro 0.** Zero residui non classificati.
- v1.1 iniziale aveva 35 residui in "Altro": 32 erano commissioni `comm.su bonifici` (pattern `"comm su"` non matchava il punto), 2 addebiti M.AV./R.AV., 1 `int. e comp. - competenze`. v1.2 aggiunge i pattern mancanti → 0 residui.

**Follow-up tracciati** (rimangono aperti):
- I "Bonifici" generici (32 casi/mese in media) sono quasi tutti fornitori non categorizzati; con lookup su `fe_fornitori` si potrebbero promuovere a Fornitori.

**Version bump:** Controllo Gestione 2.9 → 2.10.

---

## SESSIONE 42 — CG Liquidita' (principio di cassa) ✅

Follow-up diretto della sessione 41: quando Marco aveva chiesto di leggere le entrate dalla banca avevamo deciso di tenere la dashboard CG sul **principio di competenza** (vendite attribuite al giorno in cui sono fatte) e promettere una sezione dedicata al **principio di cassa** (entrate/uscite quando toccano il conto). Questa e' quella sezione.

**Backend** — nuovo service `app/services/liquidita_service.py`:
- `saldo_attuale(conn)` — saldo cumulativo + data ultimo movimento.
- `kpi_mese(conn, anno, mese)` — entrate/uscite/delta + breakdown entrate per tipo (POS/Contanti/Bonifici/Altro) + uscite per `categoria_banca`.
- `kpi_periodo_90gg(conn, data_riferimento)` — finestra rolling 90 giorni.
- `trend_saldo(conn, giorni=90)` — serie giornaliera saldo cumulativo.
- `entrate_mensili_anno(conn, anno)` — 12 mesi, breakdown per tipo (stacked bar).
- `confronto_yoy(conn, anno)` — anno corrente vs precedente.
- `ultime_entrate(conn, limit=15)` — tabella.
- `dashboard_liquidita(conn, anno, mese)` — entry point unico.

**Classificazione entrate custom** (`classify_entrata`): il feed banca BPM lascia molti POS senza `categoria_banca` quindi classifichiamo anche per pattern su descrizione (`inc.pos`, `incas. tramite p.o.s`, `vers. contanti`) + `sottocategoria_banca`. 4 bucket: POS / Contanti / Bonifici / Altro.

**Endpoint** — `GET /controllo-gestione/liquidita?anno=&mese=` in `controllo_gestione_router.py`.

**Frontend** — nuova pagina `ControlloGestioneLiquidita.jsx`:
- 6 KPI cards (saldo attuale, entrate mese, uscite mese, delta mese, entrate 90gg, media/giorno).
- LineChart trend saldo 90gg (colore `#2E7BE8`).
- PieChart entrate mese per tipo.
- Stacked BarChart entrate mensili anno.
- BarChart YoY (anno corrente vs precedente).
- Sezione uscite per categoria (barre CSS rosse).
- Tabella ultime 15 entrate con badge tipo colorato.
- Tab "🏦 Liquidita'" aggiunta in `ControlloGestioneNav` tra Dashboard e Uscite.
- Voce aggiunta in `modulesMenu.js` per il dropdown header.
- Rotta registrata in `App.jsx`.

**Smoke test** con dati reali (15 apr 2026): saldo €4.078,81 · Apr entrate €27.633 (POS 23.2k + Cash 4k) · 90gg entrate €159k uscite €151k delta +€7.855.

**Versione** `controlloGestione` 2.8 → 2.9.

**Nota architetturale** — `liquidita_service.py` e' un nuovo "mattone" disciplinato come `vendite_aggregator.py`: unica sorgente di verita' sulla liquidita', qualsiasi altra vista futura (es. cash flow previsionale 3.8) dovra' passare da qui.

**Follow-up possibili** (tracked, non urgenti):
- Tassonomia custom uscite (come abbiamo fatto per entrate) — molte uscite di Aprile sono `categoria_banca=''` nel feed.
- Integrazione scadenzario previsto (3.7) per proiezione cash flow 30/60/90gg.

---

## SESSIONE 41 — Fix CG vendite: shift_closures primario + daily fallback ✅

Marco: _"a marzo vedo pochissime entrate che in banca sono molto di più"_.

**Diagnosi.** Dashboard Controllo Gestione leggeva le vendite solo da `daily_closures` (tabella legacy, alimentata dall'import Excel mensile). Dal 4 marzo Marco ha iniziato a chiudere in-app via `shift_closures` (turni pranzo/cena) → il CG mostrava KPI troncati. Marzo: 20.265 € sulla dashboard vs 65.275,80 € reali. Stessa patch era già stata applicata al servizio export corrispettivi (2025, `_merge_shift_and_daily`) ma il CG non era stato aggiornato.

**Fix.** Nuovo service `app/services/vendite_aggregator.py` con `giorni_merged`, `totali_periodo`, `totali_mensili_anno` — merge shift (primario) + daily (fallback). Il router CG ora passa da qui per tutte e 3 le letture vendite (KPI mese, andamento annuale, confronto). Versione bump `2.7 → 2.8`.

**Discussione architetturale.** Marco ha proposto di leggere direttamente da banca. Abbiamo concordato: la dashboard attuale mostra **principio di competenza** (analitico, vendite attribuite al giorno in cui sono fatte → POS di marzo su marzo anche se accreditati ad aprile). Il **principio di cassa** (finanziario, entrate quando arrivano sul conto) meriterà una sezione "Liquidità" separata nella dashboard CG, da progettare in sessione dedicata.

**Cleanup collaterale.** Cancellato `app/services/admin_finance_stats.py`: era codice morto (nessun import lo usava) con 6 funzioni che leggevano solo `daily_closures`. Puliti i riferimenti in `docs/architettura.md`, `docs/design_gestione_vendite.md`, `docs/modulo_corrispettivi.md`. Verificato che `dashboard_router.py` legge già da `shift_closures` → nessun bug lì.

**Fuori scope (tracked per v2.9).** Progettare "sezione Liquidità" sulla dashboard CG per il principio di cassa (entrate banca, POS in arrivo, trend saldo).

---

## SESSIONE 40 — Assenze (Ferie / Malattia / Permesso) ✅

Marco: _"bisogna prevedere il concetto di 'ferie' — gente che mi avvisa che non c'è"_.

- ✅ **Migrazione 083**: tabella `assenze` in `dipendenti.sqlite3` con UNIQUE `(dipendente_id, data)`. Tre tipi: FERIE, MALATTIA, PERMESSO.
- ✅ **Backend CRUD**: `GET/POST /turni/assenze/`, `DELETE /turni/assenze/{id}`, `GET /turni/assenze/tipi`. POST fa upsert. I 3 builder (foglio, mese, dipendente) arricchiti con assenze.
- ✅ **FoglioSettimana**: OrePanel con mini-settimana 7 cerchietti clickabili per creare/eliminare assenze. Mini-popover scelta tipo.
- ✅ **VistaMensile**: pillole colorate in cella giorno + sezione "Assenze" nel PannelloGiorno.
- ✅ **PerDipendente**: banner pieno con emoji+label nel blocco giorno + metrica "Assenze" nei totali periodo.
- `versions.jsx`: dipendenti `2.25 → 2.26`.

---

## SESSIONE 40 — M.F Alert Engine + Pagina Impostazioni Notifiche ✅

Mattone M.F costruito mentre Marco è via dal PC, poi esteso con pagina configurazione su richiesta.

**Backend:**
- `app/services/alert_engine.py` — registry checker, config da DB (`alert_config`), anti-duplicato, dry-run, notifiche multi-canale
- `app/routers/alerts_router.py` — esecuzione checker + CRUD config (`GET/PUT /alerts/config/`)
- `app/models/notifiche_db.py` — nuova tabella `alert_config` con seed automatico per 3 checker

**3 checker:** `fatture_scadenza`, `dipendenti_scadenze`, `vini_sottoscorta`. Tutti configurabili da UI.

**Frontend:** `NotificheImpostazioni.jsx` — nuovo tab "🔔 Notifiche" in Impostazioni Sistema. Per ogni checker: toggle on/off, soglia giorni, anti-duplicato ore, destinatario ruolo, canali (in-app ✅, WhatsApp ✅, email 🔜). Bottone "Testa ora" per esecuzione manuale.

**Trigger:** fire-and-forget da `GET /dashboard/home`. Anche manuale da UI.

**Nota:** il codice inline in `dashboard_router._alerts()` (righe 370-442) resta — produce gli `AlertItem` per la UI Home. L'engine M.F crea le notifiche persistenti dettagliate. Refactoring futuro: usare engine in dry-run per i conteggi dashboard.

---

## SESSIONE 40 — S40-15 CHIUSO (FIC righe via XML SDI fallback) ✅

Marco ha segnalato che da fine marzo le fatture FIC di alcuni fornitori arrivano senza righe in `fe_righe`. Casi verificati: OROBICA PESCA 201969/FTM (2026-03-31, €7425,24, `fic_id=405656723`, DB id=6892), FABRIZIO MILESI 2026/300.

**Diagnosi** — via nuovo `GET /fic/debug-detail/{fic_id}` (sessione precedente, poi esteso in questa): FIC ritorna `is_detailed=false, items_list=[], e_invoice=true, attachment_url=(pre-signed url temporaneo)`. Significa che la fattura su FIC e' stata registrata come "Spesa" senza dettaglio strutturato, quindi le righe esistono SOLO dentro il tracciato XML SDI. Verificato sullo schema OpenAPI ufficiale (`fattureincloud/openapi-fattureincloud/models/schemas/ReceivedDocument.yaml`): `items_list` e' popolato solo in modalita' detailed; l'unico accesso al file firmato e' `attachment_url`. Non esiste endpoint dedicato al download XML (gli endpoint `/received_documents/pending` di marzo 2026 sono solo per documenti NON ancora registrati — non applicabile qui).

**Soluzione — fallback XML SDI**

1. **Nuovo mattone** `app/utils/fatturapa_parser.py`: parser riusabile che normalizza bytes → XML (zip/p7m/plain/utf-16 + fallback `openssl cms -verify`), estrae `DettaglioLinee` da FatturaPA. Nessuna nuova dipendenza Python. Test su XML sintetico OK (namespace `p:`, virgola decimale, sconto SC, `CodiceTipo=INTERNO`).
2. **Sync FIC** (`_fetch_detail_and_righe`): quando `items_list` e' vuoto ma `e_invoice + attachment_url` presenti → scarica XML via `download_and_parse()` → popola `fe_righe` da `DettaglioLinee` → auto-categorizza. Exception swallow rimosso, ora `traceback.print_exc()` esplicito.
3. **Recovery retroattivo**: `POST /fic/refetch-righe-xml/{db_id}` per singolo, `POST /fic/bulk-refetch-righe-xml?anno=&solo_senza_righe=true&limit=N` per bulk. Entrambi ritornano contatori + dettaglio per-fattura.
4. **UI** Fatture › Impostazioni › FIC (v2.3): card debug ora mostra `xml_parse` (preview righe dal tracciato SDI), nuova card "📥 Recupero righe da XML SDI" con singolo + bulk (conferma, spinner, report dettagliato).

**File toccati**
- NEW `app/utils/fatturapa_parser.py`.
- `app/routers/fattureincloud_router.py` (fallback XML, debug-detail esteso, 2 endpoint recovery).
- `frontend/src/pages/admin/FattureImpostazioni.jsx` v2.3.

**v2 fix (stesso giorno)**: schema SQL sbagliato (`fornitore_denominazione` → `fornitore_nome`). Preflight PRAGMA table_info su tutto il router. Bulk ridotto a batch=50, time budget 90s, `stopped_by_timeout` + `rimanenti_stima`. **v3 skipped_non_fe**: il bulk ora distingue fatture non-FE (`e_invoice=false`) come `skipped` anziche' `fail`. UI: contatore separato, banner esplicativo, righe non-FE in grigio con ⏭, messaggio "rilancia" appare solo se restano FE vere.

**Verifica completezza import marzo 2026**: confronto export FIC vs DB → 66/66 fatture presenti. Panoramica 2025-2026: 52 fatture senza righe di cui 32 affitti mensili + 18 Amazon marketplace (tutte non-FE), 2 FE vere (OROBICA+MILESI, risolte col bulk).

---

## SESSIONE 40 — Wave 1 + Wave 2 + Wave 3 (CHIUSE ✅)

Marco ha aperto con una lista di 17 bug distribuiti su 6 moduli: Dipendenti (5), UI generica (2), Acquisti (2), Controllo Gestione (2), Flussi di Cassa (4), Statistiche (2). Triage: 3 wave ordinate per impatto × sforzo, dettaglio completo in `problemi.md` (punti `S40-1 ... S40-17`).

### Wave 1 completata — 3 fix bloccanti

- **S40-1 Dipendenti crash al save** (`DipendentiAnagrafica` v2.6) — mancava trailing slash sul POST, ennesima occorrenza dello stesso pattern documentato in CLAUDE.md.
- **S40-2 "+ Nuovo reparto" non fa nulla** (`GestioneReparti` v1.2) — flag `isCreating` mancante, allineato al pattern di `DipendentiAnagrafica`.
- **S40-3 Campanello iPad click non apre** (`Tooltip` v1.2 + `Header`) — nuova prop `disableOnTouch` sul Tooltip, applicata a 🔔 e 🔑 per evitare il double-tap friction su icone universali.

### Wave 2 completata — 6 fix UX su Dipendenti, CG, Flussi

- **S40-4 Soft-delete dipendente libera colore** (`dipendenti.py` DELETE) — `UPDATE … SET attivo=0, colore=NULL` invece di lasciare il colore "occupato" nel picker.
- **S40-5 Auto-ID dipendente progressivo** (`dipendenti.py` POST + `DipendentiAnagrafica` v2.7) — generatore `_genera_codice_dipendente` produce `DIPNNN` con padding a 3 cifre. Codice ora optional in pydantic e nel form.
- **S40-6 Nickname per stampe turno** (migrazione 081 + tutto il path turni) — colonna `nickname TEXT` su `dipendenti.sqlite3`, esposta in tutte le SELECT (4 in `dipendenti.py`, 2 in `turni_router.py`, 4 in `turni_service.py`). Cell label foglio settimana, OrePanel, PDF e composer WA usano nickname con fallback al nome. Saluto WA: "Ciao Pace, ecco i tuoi turni…".
- **S40-9 Default filtri Uscite CG** (`ControlloGestioneUscite` v3.1) — apre con `{DA_PAGARE, SCADUTA, PAGATA}` su mese corrente invece di "tutto da inizio anno".
- **S40-10 Somma residuo Excel-style** (stesso file) — `useMemo sommaSelezionati` mostra il totale residuo nella bulk action bar.
- **S40-11 Finestra _score_match** (`banca_router.py`) — cutoff duro a 180 giorni + penalita' progressiva oltre 30gg, evita di suggerire match SDD-08apr26 vs Amazon-11ago25.

### Wave 3 completata — 4 fix UX su CG, Acquisti, Flussi, iPad

- **S40-7 CG tab bar uniformata** (Dashboard/Confronto/Uscite/Riconciliazione) — wrapper esterno senza padding → Nav full-width + contenuto wrappato `<div className="px-4 sm:px-6 pb-6">`. Riconciliazione passa da `bg-neutral-50` a `bg-brand-cream`, titoli `font-playfair text-sky-900`. Uscite importa ora `ControlloGestioneNav` (rimosso back button custom duplicato).
- **S40-8 Acquisti nascondi fornitori ignorati** (`fe_import.py` + `FattureElenco` v3.2) — LEFT JOIN `fe_fornitore_categoria fc_excl` in `GET /fatture`, FE filtra `!f.escluso_acquisti` di default. Toggle "Mostra anche ignorati" nella sidebar (visibile solo se esistono escluse), badge ambra "ESCLUSO" sulla riga quando visibili.
- **S40-12 Flussi workbench bulk Parcheggia/senza match** (migrazione 082 + `banca_router.py` + `BancaCrossRef` v5.2) — colonne `parcheggiato` + `parcheggiato_at` su `banca_movimenti`, nuovi endpoint `POST /cross-ref/parcheggia-bulk` e `POST /cross-ref/disparcheggia/{id}`. Nuovo tab "Parcheggiati 🅿️", toolbar bulk estesa a senza/suggerimenti/parcheggiati, "❓ Flagga senza match" bulk (client-side che estende il Set `dismissed`), riga parcheggiata con timestamp + bottone "↩ Disparcheggia" individuale.
- **S40-13 Flussi iPad descrizione** (stesso file) — tap-to-expand: state `expandedDesc: Set<movId>` + handler `toggleDesc`, cella `truncate` ↔ `whitespace-normal break-words`, `cursor-pointer select-none` per chiarezza touch.

### Rimangono in indagine

- **S40-14 Duplicati Sogegros €597,08** — servono ID `banca_movimenti` da Marco per decidere regola dedup.
- **S40-15 Acquisti FIC righe mancanti** — serve fattura di riferimento.
- **S40-16 "Import iPratico sparito" Statistiche** — serve chiarimento da Marco se intendeva l'iPratico Vini (spostato in Vini → Impostazioni sessione 39) o davvero quello delle Statistiche (tab esiste ancora).
- **S40-17 "menu con più opzioni sparito"** — serve sapere quale menu esattamente.

### Versioni bump sessione 40

- `dipendenti` 2.23 → 2.25 (Wave 1 + Wave 2: trailing slash, soft-delete colore, auto-ID, nickname)
- `fatture` 2.5 → 2.6 (Wave 3: escluso_acquisti default)
- `controlloGestione` 2.5 → 2.7 (Wave 2: filtri default + somma selezione — Wave 3: nav uniformato)
- `flussiCassa` 1.9 → 1.11 (Wave 2: cutoff finestra _score_match — Wave 3: parcheggia + tap-to-expand)
- `sistema` 5.8 → 5.11 (Wave 1: Tooltip disableOnTouch — Wave 2: migrazione 081 — Wave 3: migrazione 082)

---

## SESSIONE 39 — Navigazione diretta ai moduli (CHIUSA ✅)

### Cosa è stato fatto
- **Eliminazione hub `*Menu.jsx`**: cliccando un modulo dall'header o dalla Home si entra direttamente nella vista principale (Dashboard o equivalente), niente più pagina intermedia.
- **Redirect role-aware**: nuovo componente `ModuleRedirect.jsx` sceglie la prima rotta accessibile in base a ruolo/permessi `useModuleAccess`. Se nessuna rotta è accessibile → pagina "non hai privilegi" coerente col tema del modulo.
- **Default per modulo**: Vini→Dashboard, Ricette→Archivio, Vendite→Dashboard, Acquisti→Dashboard, Flussi Cassa→Dashboard, Controllo Gestione→Dashboard, Statistiche→Cucina, Clienti→Anagrafica, Dipendenti→Dashboard (NUOVA), Prenotazioni→Planning (data odierna).
- **`DashboardDipendenti.jsx` nuova**: placeholder viola con KPI reali (headcount attivo, scadenze documenti, buste paga mese corrente) + 4 shortcut (anagrafica, turni, buste paga, scadenze). Nessun nuovo endpoint, riusa quelli esistenti.
- **Vini — Impostazioni unificate**: sotto-menu riordinato `Dashboard → Cantina → Carta → Vendite → Impostazioni`. Il sync iPratico è stato integrato dentro `ViniImpostazioni` (via `IPraticoSync embedded=true`) invece di una voce separata "iPratico".
- **DipendentiNav**: voce "Dashboard" aggiunta come prima tab.
- **12 hub `*Menu.jsx` eliminati**: vini, ricette, corrispettivi, fatture, dipendenti, admin, flussi-cassa, controllo-gestione, statistiche, prenotazioni, clienti (+ AdminMenu).
- **`modulesMenu.js`**: aggiunta voce "Dashboard" nel sotto-menu Dipendenti.
- **Versioni bump** (in `versions.jsx`): vini 3.11, ricette 3.4, corrispettivi 4.4, fatture 2.5, flussi-cassa 1.9, dipendenti 2.23, statistiche 1.1, controllo-gestione 2.5, clienti 2.9, prenotazioni 2.1, sistema 5.8.
- **iPad tooltip fix**: bell (🔔) e key (🔑) nell'Header ora usano `placement="bottom"` → si aprono verso il basso su iPad senza essere tagliati dalla statusbar.

### Decisioni tecniche da ricordare
- **`IPraticoSync` accetta prop `embedded`**: evita di duplicare 673 righe di workflow unificato. Deviazione consapevole dalla richiesta "due voci separate Import/Export".
- **Redirect "nessun privilegio"**: pagina standard colorata con palette del modulo, call-to-action verso Home.
- **Archivio diario**: mini-sessioni 39/36/35/34/32 spostate in `sessione_archivio_39.md` per tenere `sessione.md` leggibile. Le sezioni stabili (priorità, rules, storico rilasci) restano qui sotto.

### Follow-up emersi dalla sessione
1. **Dashboard Cucina** — rivedere (era "Ricette Menu" / "Home Cucina"?): oggi è Ricette→Archivio di default, valutare se promuovere una vera Dashboard Cucina.
2. **Link "← Home"** — valutare se aggiungere un link consistente in tutti i `*Nav.jsx` per tornare alla Home rapidamente (oggi si passa dal logo header).
3. **`DashboardDipendenti` v2** — estendere il placeholder con grafici (costo mensile, storico ore, trend scadenze) e widget su presenze/assenze del giorno.
4. **`IPraticoSync` refactor** — valutare estrazione di una versione davvero "embeddable" più snella (oggi è solo un flag, la UI resta la stessa).
5. **Pulsante "reset to seed"** — UX-level, non solo via API.
6. **`useModuleAccess` auto-refresh** — se un admin cambia i permessi, gli utenti devono vedere l'update senza logout (oggi servirebbe reload).

---

## PIANO PROSSIMI PASSI (ordine consigliato)

> Ordinato per valore/urgenza. Numeri ID rimandano a [`roadmap.md`](./roadmap.md).

### 🔴 Urgenze (fix concreti)
- **D1 — Storni flussi di cassa difettosi** (`problemi.md`) — serve caso concreto riproducibile da Marco. Bloccato finché non arriva.

### 🟠 Evoluzioni strategiche (prossimi 2-3 blocchi di sessioni)
1. **Prenotazioni Fase 1 — Agenda (§2.1)** — modulo nuovo L, obiettivo strategico **eliminare TheFork Manager**. Docs pronti: `docs/modulo_prenotazioni.md` + `docs/prenotazioni_todo.md`. Wave start: backend CRUD + planning giorno + form con CRM + stati + mini-calendario. Usa M.E calendar + M.G permessi.
2. **Preventivi 10.3 PDF + 10.4 versioning (§10)** — 10.1/10.2 chiusi sessione 32, 10.3 PDF brand chiuso sessione 34, v1.1 revisioni sessione 35. Prossimo: 10.4 (versioning PDF + link prenotazione + badge "N in attesa") e 10.5 (menu strutturato nel template `preventivo.html`).
3. **Home v3 — F.1→F.6** — Fase 0 completata sessioni 29-30. Prossimo: F.1 endpoint backend `/dashboard/home`, poi F.2 infrastruttura frontend.

### 🟡 Evoluzioni modulo per modulo
4. **Dipendenti v2 (§6)** — 6.1 template WA buste paga + 6.4 calendario turni drag&drop + 6.5 scadenze con alert. Completare anche `DashboardDipendenti` con grafici reali.
5. **Flussi di Cassa (§3)** — 3.2 riconciliazione smarter, 3.4 carta di credito (usa M.H), 3.7 scadenziario calendario (M.E + M.A + M.F), 3.8 cash flow previsionale.
6. **CG / FoodCost (§4)** — 4.1 note di credito XML, 4.5 P&L mensile, 4.7 margine per piatto.
7. **Cantina / Vini (§7)** — 7.1 flag DISCONTINUATO UI (DB già pronto), 7.6 alert sottoscorta, 7.8 inventario rapido iPad.
8. **Clienti / CRM (§5)** — 5.1 Mailchimp sync, 5.2/5.3 compleanni con WA (M.C pronto), 5.5 merge side-by-side, 5.9 segmentazione RFM, 5.10 timeline cliente.

### 🟢 Infrastruttura & brand
9. **Notifiche & Comunicazioni (§9)** — 9.3 hook su preventivi (M.A pronto). 9.4-9.6 bloccati da altri moduli.
10. **Brand / UX (§8)** — 8.7 permessi centralizzati (hook `usePermissions`), 8.8 Command Palette Cmd+K, 8.12 deep search globale dal dropdown header, 8.14 tool di personalizzazione stampe M.B.
11. **Infra (§1)** — 1.4 migrazioni dipendenti.sqlite3, 1.6 snapshot Aruba, 1.8 Web Push, 1.9 health check + uptime monitor, 1.10 banner nuova versione.

### ⚪ Debito tecnico da sessione 39
- Refactor `IPraticoSync` per renderlo davvero modulare.
- `useModuleAccess` auto-refresh sui cambi permessi.
- Pulsante UI "reset to seed" (non solo API).
- `DashboardCucina` dedicata (oggi Ricette→Archivio).
- Link "← Home" consistente in tutti i `*Nav.jsx`.

---

---

## PRIORITÀ — Leggere SUBITO insieme a `docs/problemi.md` e `docs/roadmap.md`

> Questa sezione è il punto di partenza di ogni sessione. Non serve che Marco la ripeta.
> Roadmap completa con 76 punti su 10 sezioni: **`docs/roadmap.md`**. Bug e anomalie: **`docs/problemi.md`**.

### Urgenze / Bugfix
1. **D1 — Storni flussi di cassa difettosi** (problemi.md) — serve caso concreto da Marco per riprodurre
2. ~~D4 — PWA service worker~~ ✅ già in produzione (commit f194870, sessione 28). Nessun crash segnalato
3. ~~C.3 — useAppHeight~~ → declassato a debito tecnico bassa priorità (sessione 31). Il problema `100vh` su iOS è risolto con `100dvh` (sessione 28). L'hook resta sul disco come orfano per uso futuro (banner dinamici, header variabile), ma oggi il beneficio (eliminare magic number altezze) non giustifica il rischio (crash sessione 26 mai debuggato)

### Evoluzioni — prossimi passi attivi
1. **Home v3 — F.1→F.6** — Fase 0 completata (sessione 29/30). Prossimo: F.1 endpoint backend `/dashboard/home`, poi F.2 frontend infrastruttura
2. **Prenotazioni — 2.1→2.8** (roadmap §2) — modulo nuovo, 5 fasi, obiettivo eliminare TheFork Manager. Docs pronti: `docs/modulo_prenotazioni.md`, `docs/prenotazioni_todo.md`
3. **Flussi di Cassa — 3.2→3.9** (roadmap §3) — riconciliazione smarter, multi-conto, carta di credito, scadenziario calendario, cash flow previsionale
4. **CG / FoodCost — 4.1→4.7** (roadmap §4) — note di credito XML, P&L mensile, margine per piatto
5. **CRM — 5.1→5.11** (roadmap §5) — Mailchimp sync, WA compleanni, merge side-by-side, segmentazione RFM, timeline cliente
6. **Dipendenti — 6.1→6.6** (roadmap §6) — calendario turni, scadenze documenti, costo orario
7. **Cantina — 7.1→7.8** (roadmap §7) — flag discontinuato UI, carta vini pubblica, inventario iPad
8. **Brand/UX — 8.1→8.11** (roadmap §8) — permessi centralizzati, Command Palette, dark mode (futuro)
9. **Infra — 1.4→1.10** (roadmap §1) — notifiche push, health check, banner aggiornamento, snapshot Aruba
10. **Notifiche & Comunicazioni — 9.1→9.7** (roadmap §9) — infrastruttura notifiche, bacheca staff broadcast, hook su tutti i moduli. Pre-requisito per preventivi e alert
11. **Preventivi — ~~10.1~~ ~~10.2~~ ~~10.3~~ 10.4→10.5** (roadmap §10) — 10.1+10.2 (sessione 32), 10.3 PDF brand (sessione 34), v1.1 revisioni cliente inline + luoghi + menu ristorante (sessione 35). Prossimo: 10.4 versioning + link prenotazioni, 10.5 PDF preventivo con menu strutturato (rendering `menu_nome` + `menu_descrizione` nel template `preventivo.html`)

---

## HOME v3 REDESIGN — Piano implementazione (sessione 29)

> Redesign approvato da Marco il 2026-04-12. Mockup interattivo: `mockup-home-v3.html` nella root.

### Concept
- **Due pagine con swipe** (dot indicator, touch gesture): pagina 1 = widget, pagina 2 = moduli
- **Widget programmabili**: al lancio fissi, futura configurabilità per ruolo (admin sceglie)
- **Tile moduli senza emoji**: icone SVG stroke 1.5 monocromatiche su tintina, colori smorzati, linea gobbetta R/G/B in alto
- **Estetica raffinata**: Playfair Display per titoli, palette muted (non più colori sparati), card bianche su cream, ombre minime, respiro generoso

### Widget al lancio (v1 — fissi per tutti i ruoli)
1. **Attenzione** — alert aggregati: fatture da registrare, scadenze imminenti, vini sotto scorta. Icona SVG modulo + testo + chevron. Dati da: `fe_fatture`, `dipendenti_scadenze`, stock vini
2. **Prenotazioni oggi** — lista compatta orario/nome/pax/stato + totale pax header. Dati da: `clienti_prenotazioni` filtrate per data odierna
3. **Incasso ieri** — cifra grande + delta % vs media. Dati da: `shift_closures` giorno precedente
4. **Coperti mese** — cifra + confronto anno precedente. Dati da: `shift_closures` aggregati mese corrente
5. **Azioni rapide** — griglia 2×2: Chiusura Turno, Nuova Prenotazione, Cerca Vino, Food Cost. Link diretti, configurabili in futuro

### Widget futuri (v2 — dopo il lancio)
- Turni dipendenti oggi
- Meteo (per prenotazioni outdoor)
- Obiettivo incasso settimanale con progress bar
- Widget personalizzabili per ruolo (cuoco vede ordini, sala vede prenotazioni)

### Fasi implementazione
- **Fase 0** ✅ Docs + specifiche + regole design (questa sessione Cowork)
- **Fase 1** — Backend: endpoint `GET /dashboard/home` aggregatore (query su prenotazioni, shift_closures, fe_fatture)
- **Fase 2** — Frontend infrastruttura: hook `useHomeWidgets()`, componente `WidgetCard`, file `icons.jsx` con set SVG moduli
- **Fase 3** — Frontend pagina widget (pagina 1): riscrittura Home.jsx con swipe container + 5 widget
- **Fase 4** — Frontend pagina moduli (pagina 2): componente `ModuleTile`, griglia 3col iPad / 2col iPhone
- **Fase 5** — Navigazione: adattamento Header, aggiornamento DashboardSala con stile v3
- **Fase 6** — Polish: aggiornamento styleguide.md, test iPad/iPhone viewport, versioning

### Regole design Home v3 (per tutti gli agenti)
- **Sfondo**: `bg-brand-cream` (#F4F1EC) — invariato
- **Card/Widget**: bg bianco, border-radius 14px, `box-shadow: 0 1px 3px rgba(0,0,0,.04)`, NO bordi visibili pesanti
- **Icone moduli**: SVG stroke 1.5, monocromatiche nel colore accent del modulo, su fondo tintina chiaro (accent + 08 opacity)
- **Colori moduli**: palette SMORZATA (es. Vini #B8860B non #F59E0B, Acquisti #2D8F7B non #14B8A6). Tinte: bianco sporco, non pastelli saturi
- **Gobbetta brand**: linea sottile 2px in alto su ogni tile, cicla R/G/B (#E8402B/#2EB872/#2E7BE8), opacity .5
- **Titoli**: Playfair Display 700 per titoli pagina (saluto, "Moduli"), font sistema per tutto il resto
- **Label widget**: 10px uppercase letter-spacing 1.2px, colore `#a8a49e` (warm gray)
- **NO emoji** nei moduli — solo icone SVG. Emoji ammesse SOLO in contesti testuali (note, alert)
- **Touch target**: minimo 44pt, bottoni 48pt, righe lista ≥ 44pt
- **Proporzioni iPad**: padding 32px, griglia widget 1.5fr + .5fr per prenotazioni+stats
- **Proporzioni iPhone**: padding 18px, widget impilati 1 colonna, tile moduli 2 colonne

---

## PROBLEMI APERTI — LEGGERE SUBITO

> 📋 Lista bug/anomalie segnalati da Marco in attesa di intervento: **`docs/problemi.md`**
> Da leggere a inizio sessione insieme a questo file. Se Marco chiede "cosa c'è da fare?", la priorità è quella lista.

---

## REGOLE OPERATIVE — LEGGERE PRIMA DI TUTTO

### Git & Deploy
- **NON fare `git commit`**. Le modifiche le fai nei file, ma il commit lo gestisce `push.sh` che lancia Marco dal suo terminale. Se committi tu, push.sh non chiede piu' il messaggio e Marco si confonde.
- **NON fare `git push`**. L'ambiente Cowork non ha accesso alla rete (SSH/internet). Il push fallira' sempre.
- **NON fare `git add -A`**. Rischi di includere file sensibili. Lascia che push.sh faccia tutto.
- **Workflow corretto**: tu modifichi i file → scrivi a Marco il testo suggerito per il commit → lui lancia `./push.sh "testo"` dal suo terminale.
- **Suggerisci SEMPRE il testo del commit** quando dici a Marco di fare il push. Formato: una riga breve in italiano/inglese che descrive cosa cambia.
- Se devi annullare le tue modifiche a un file: `git checkout -- <file>` (ma chiedi prima).

### Ambiente Cowork
- Non hai accesso alla rete. Niente curl, wget, npm install da remoto, pip install da remoto, push, fetch.
- I database `.sqlite3` e `.db` sono nella cartella `app/data/`. Puoi leggerli con sqlite3 per debug.
- push.sh scarica i DB dal VPS prima di committare, quindi i DB locali sono aggiornati solo dopo un push.

### Comunicazione con Marco
- Marco parla in italiano. Rispondi in italiano.
- Marco usa spesso CAPS LOCK per enfasi, non si sta arrabbiando.
- Quando Marco dice "caricato" significa che ha fatto il push e il VPS e' aggiornato.
- Se qualcosa non funziona dopo il push, chiedi a Marco di refreshare la pagina (Ctrl+Shift+R).

### Stile codice
- Frontend: React + Tailwind CSS, no CSS separati. Componenti funzionali con hooks.
- Backend: FastAPI + SQLite. Migrazioni numerate in `app/migrations/`.
- Pattern UI consolidati: `SortTh`/`sortRows` per colonne ordinabili, toast per feedback, sidebar filtri a sinistra.
- Colori: palette TRGB-02 in `tailwind.config.js` sotto `brand.*`. Sfondo pagine: `bg-brand-cream`. Azioni primarie: `brand-blue`. Errori: `brand-red`. Successo: `brand-green`. Testo: `brand-ink`. Colori ruolo invariati (amber/cyan/purple/rose/emerald/slate).

### Migrazioni DB
- Le migrazioni sono in `app/migrations/NNN_nome.py` e vengono tracciate in `schema_migrations`.
- Una migrazione gia' eseguita NON verra' rieseguita. Se serve correggere, crea una nuova migrazione.
- Controlla sempre se la colonna esiste prima di ALTER TABLE (try/except).

---

## Chi sei e dove sei

Sei l'assistente AI che lavora sul gestionale interno dell'**Osteria Tre Gobbi (Bergamo)**.
Il progetto si chiama **TRGB Gestionale** — un'app web FastAPI + React in produzione su VPS Aruba.
L'utente si chiama **Marco** (mac: `underline83`, win: `mcarm`).

La cartella di lavoro e' selezionata come workspace Cowork. Puoi leggere e scrivere direttamente tutti i file del progetto.

---

## Cosa abbiamo fatto nella sessione 28 (2026-04-12) — Brand TRGB-02 integrazione completa

### P0 — Fondamenta
- **Asset copiati**: favicon/icone PWA in `public/icons/`, 10 SVG brand in `src/assets/brand/`, OG image
- **Palette Tailwind**: `brand-red/green/blue/ink/cream/night` in `tailwind.config.js`
- **index.html**: theme-color cream, OG image, body `bg-brand-cream`
- **manifest.webmanifest**: colori aggiornati a cream
- **index.css**: variabili CSS aggiornate alla palette TRGB-02, link da amber a blue
- **Header.jsx v5.0**: icona SVG gobbette+T, sfondo cream, testo ink
- **LoginForm.jsx**: wordmark composto (gobbette SVG inline + testo HTML)

### P1 — Coerenza visiva
- **Home.jsx v4.0**: wordmark composto centrato flexbox, gobbette strip decorativa, TrgbLoader, card con bordo sinistro RGB a rotazione, sfondo cream
- **TrgbLoader.jsx** (nuovo): tre gobbette animate pulse sfalsato, props size/label/className
- **Grafici Recharts** (3 dashboard): colori serie da indigo/teal a brand-blue, CAT_COLORS con brand
- **TrgbLoader inserito** in 6 loading principali (Home, Vendite, Acquisti, Statistiche, CG, Annuale)
- **Sfondo cream globale**: 90 pagine `bg-neutral-100`/`bg-gray-50` → `bg-brand-cream` via sed

### Fix intermedi
- viewBox gobbette strip SVG (era 600x60, contenuto solo a sinistra → croppato a 155x28)
- Wordmark da SVG con `<text>` (non centrato per variabilità font) → composizione HTML flex

### TODO brand residuo (P2-P3)
- **P2.9** Pattern gobbette in empty state / watermark decorativo
- **P2.13** Editor tavoli: colori zone mappati su brand (verde=libero, blue=prenotato, rosso=occupato)
- **P2.14** Sezione About/version panel con logo
- **P3.8** Dark mode (asset dark pronti, serve switch `dark:` su tutto il FE)
- **P3.10** Widget pubblico prenotazioni (bloccato da Fase 3)
- **P3.11** PDF/export con header brand (backend Python)
- **P3.12** Email template Brevo (bloccato da Fase 4 SMTP)

---

## Cosa abbiamo fatto nella sessione 27 (2026-04-11 pomeriggio → 2026-04-12 notte) — **B.1 + B.3 + B.2 Block 1 CG completo + fix Tooltip iPad ✓✓✓**

Sessione lunga, partita come "solo B.1" e finita con sette commit isolati. **Il protocollo post-mortem cap. 10 funziona**: sette push consecutivi, zero rollback, ogni singolo file testato su Mac + iPad reale prima del successivo.

### Cosa è stato fatto e lasciato in produzione (ordine cronologico dei push)

**1. B.1 — Header touch-compatibile** (`frontend/src/components/Header.jsx` da v4.2 → v4.3):
- Detection touch via `matchMedia("(hover: none) and (pointer: coarse)")` con listener `change` (regge anche il toggle Device Mode di Chrome DevTools)
- Tap-toggle sul row del modulo: su touch + modulo con sotto-voci, primo tap apre il flyout (`activateHover(key)`), secondo tap sullo stesso row naviga al path principale (`goTo(cfg.go)`). Moduli senza sotto-voci navigano al primo tap
- Click-outside esteso a `touchstart` oltre `mousedown` → tap fuori dal dropdown lo chiude su iPad
- `onMouseEnter`/`onMouseLeave` di row, container lista, flyout sub-menu e "ponte invisibile" condizionali su `!isTouch` → evita che gli eventi mouse sintetici post-touch dei browser mobile inneschino l'intent-detection desktop
- Desktop completamente invariato (intent-detection, hover safe-zone, intent timer 80ms tutti preservati)

**2. B.3 — Input font-size 16px su touch** (`frontend/src/index.css`):
- Media query `@media (pointer: coarse) { input, textarea, select { font-size: 16px; } }` aggiunta in coda al file.
- Risolve il saltello zoom automatico di iOS Safari al focus di un input con font-size < 16px. Mac invariato, iPad reale conferma che tap su sidebar filtri (Anno, Mese, Cerca fornitore) non zooma più. 5 minuti netti.

**3. B.2 componente `Tooltip.jsx` v1.0 + integrazione Header** (`frontend/src/components/Tooltip.jsx` NUOVO, `frontend/src/components/Header.jsx`):
- Componente wrapper touch-compatible che sostituisce l'attributo `title=` nativo HTML.
- Desktop: hover con delay 400ms → popup.
- Touch: primo tap mostra il tooltip MA blocca il click del child via `onClickCapture` con `preventDefault` + `stopPropagation` in fase capture. Secondo tap lascia passare l'azione. Auto-close 2.5s su touch, click/touch fuori chiude.
- Prima integrazione in Header: span "Modalità gestione" amber dot + bottone "🔑 Cambia PIN".
- Testato e verde Mac + iPad.

**4. B.2 fix Tooltip v1.0 → v1.1 iPad** (`frontend/src/components/Tooltip.jsx`):
- Dopo i primi test su CG Uscite su iPad, Marco ha scoperto che i KPI "Da riconciliare" / "Riconciliate" aprivano direttamente al primo tap invece di mostrare il tooltip. **Causa**: iPadOS 13+ di default è in modalità "Desktop Website", che fa riportare a Safari `hover: hover` e `pointer: fine`. La detection v1.0 basata su `matchMedia("(hover: none) and (pointer: coarse)")` tornava `false`, `isTouch` restava `false`, `handleClickCapture` faceva return, il click passava al child button.
- **Fix 1 (detection):** `navigator.maxTouchPoints > 0` come rilevatore primario (iPad restituisce 5 anche in desktop mode) + `(any-pointer: coarse)` come fallback + vecchia query mantenuta.
- **Fix 2 (long-press zoom):** aggiunto `style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}` sullo span wrapper del Tooltip → blocca menu callout iOS e selezione testo che causavano lo zoom su long-press.
- Testato e verde su iPad reale dopo il push.

**5. B.2 KPI ControlloGestioneUscite → Tooltip** (`frontend/src/pages/controllo-gestione/ControlloGestioneUscite.jsx`):
- **Fix vero del bug iPad sui KPI** (il punto 4 era necessario ma non sufficiente). Il componente `function KPI` interno al file usava `<button title={title}>` nativo HTML. Il fix Tooltip v1.1 non poteva toccarlo perché il KPI non passava dal componente Tooltip. Riscritta la funzione: se viene passato `title`, il bottone interno viene wrappato in `<Tooltip label={title}>`; se no, resta nudo (nessuna regressione sui KPI Programmato/Scaduto/Pagato che non hanno title).
- Aggiunto `import Tooltip from "../../components/Tooltip";`
- Testato iPad: primo tap su "Da riconciliare"/"Riconciliate" mostra il tooltip, secondo tap apre il workbench / crossref.

**6. B.2 Block 1 CG — ControlloGestioneUscite.jsx title= → Tooltip** (9 wrapping totali):
- Sidebar filtri: ✕ "Azzera selezione stato", ✕ "Rimuovi periodo", bottone "Mostra escluse" con spiegazione lunga FIC (`className="w-full"` passato al Tooltip per preservare larghezza).
- Barra bulk: bottone "Stampa / Metti in pagamento".
- Dettaglio fattura inline: frecce `‹` `›` navigazione prev/next con label dinamico (nome fornitore).
- Tabella righe: badge "In pagamento" con label dinamico `Batch: ...`, icone banca per riga Riconciliata/Collega (scollega/apri riconciliazione).
- **Esclusi per regole B.2**: `<input type="checkbox">` "seleziona tutte non pagate", `<th>` banca, `<tr>` con title dinamico (struttura tabella).
- Test critico superato: icone banca per riga dentro `<td onClick={e => e.stopPropagation()}>` → il capture del Tooltip intercetta il click PRIMA del button.onClick e il td.stopPropagation non interferisce.

**7. B.2 Block 1 CG — ControlloGestioneSpeseFisse.jsx title= → Tooltip** (4 wrapping):
- `↻ Ricarica fatture` nel wizard rateizzazione.
- `Piano` / `Storico` / `Adegua` nella tabella spese fisse attive (label dinamici condizionali sul tipo spesa).
- **Esclusi**: 5 `WizardPanel title=...` (prop component, non HTML), 1 `<input title={...}>` in cella rata, **2 span informativi** della tabella storico rate con `title={banca_descrizione}` lasciati deliberatamente con `title=` nativo perché non hanno onClick e il label può essere stringa vuota.

**8. B.2 Block 1 CG — ControlloGestioneRiconciliazione.jsx title= → Tooltip** (1 wrapping):
- Solo bottone `↻ Ricarica` in alto a destra. Unico `title=` nel file, nessun residuo dopo.

### Cosa NON è stato toccato (di proposito, per rispettare il protocollo)
- `useAppHeight` → resta orfano, C.3 ancora da bisezionare
- I 6 file pagina responsive → restano `calc(100vh - Npx)` originali
- Service Worker / `main.jsx` → resta il blocco difensivo unregister
- Nessun file di Acquisti, Cantina, Dipendenti, Clienti, Contanti, Prenotazioni, Ricette, Banca, FlussiCassa (rimandati a Block 2-6 sessione 28)

### Casino worktree Claude Code — lezione importante
Durante il lavoro sul Block 1 CG avevo inizialmente provato a far eseguire le migrazioni a Claude Code in un worktree `.claude/worktrees/gracious-liskov/`. Code ha lavorato bene, io ho "verificato" le sue modifiche dentro al worktree con grep, e ho detto "ok Block 1 integro" — ma **il worktree non è mai stato mergiato in main**. Siamo passati a parlare dei bug iPad Tooltip credendo che Block 1 fosse in main, ho fixato il Tooltip component v1.0 → v1.1, Marco ha pushato e testato → bug ancora presente. Motivo: il KPI in main usava ancora `title=` nativo, Block 1 viveva solo nel worktree. Dopo aver capito l'errore ho fatto il fix KPI direttamente in main e siamo ripartiti con la disciplina "sempre in main, mai più worktree".

**Aggravante**: il worktree è registrato con path host (`/Users/underline83/trgb/.claude/worktrees/gracious-liskov`) e dalla sandbox `/sessions/...` i comandi git dentro al worktree falliscono con "not a git repository" perché il path non esiste sulla sandbox. Quindi anche a voler recuperare le modifiche di Code dopo, non posso nemmeno usare `git log`/`git diff` sul worktree — devo leggere i file raw dal mount e fare diff a mano, fragile.

**Regola ferrea aggiornata in memoria** (`feedback_worktree_no_trust.md`): un worktree NON è in main finché non faccio merge esplicito verificato con `git log --oneline` sul branch main. Mai più dire "Block X verificato" basandomi solo su grep nel worktree. Per i refactoring massivi meglio lavorare direttamente in main un file alla volta — più lento ma zero confusione, e visto che comunque ora testiamo ogni singolo push il rischio è basso.

### Test eseguiti in sessione
- **Mac desktop** Chrome/Safari: tutti i tooltip hover invariati vs `title=` nativo (popup più pulito di Tooltip.jsx, estetica OK)
- **iPad reale Marco**: tap-toggle funzionante su tutti gli 8 elementi della sezione Header + 14 wrapping CG (KPI + 9 Uscite + 4 SpeseFisse + 1 Riconciliazione)
- **iPad reale Marco**: long-press niente più zoom/callout iOS
- Zero regressioni segnalate, zero rollback

### Stato scaletta B/C/D/E dopo sessione 27
Vedi "Scaletta lavori" più sotto nella sezione sessione 26 (master list aggiornata inline: B.1 ✓, B.2 parziale (Block 1 CG), B.3 ✓).

### Lezione di sessione
Il protocollo cap. 10 funziona anche su sessioni lunghe con tante sigle. Sette file diversi, sette push, sette test, zero regressioni. Il pattern da replicare in sessione 28 e per tutte le prossime migrazioni è: **un file per commit, testo di commit preciso, Marco testa tra un push e l'altro**. Per sessione 28 si riprende da Block 2 di B.2 (Acquisti) con stessa disciplina.

---

## Cosa abbiamo fatto nella sessione 26 (2026-04-11) — **App Apple roadmap + tentativo PWA Fase 0 + tentativo Punto 1 useAppHeight (entrambi rollback)**

Sessione "ambiziosa che è esplosa". Aperta con l'analisi sull'evoluzione di TRGB in app Apple, finita con due rollback in produzione e una lezione operativa importante sul commit a blocchi accoppiati. Stato finale: codice in produzione **identico a fine sessione 25** + qualche file di docs/scaffold mai attivato + un blocco difensivo in `main.jsx` per ripulire eventuali service worker registrati.

### Cosa è stato lavorato e LASCIATO IN PRODUZIONE
- **`docs/analisi_app_apple.md`** (NUOVO, 331 righe) — analisi completa dello sforzo per portare TRGB su Apple. 5 scenari (A-E), pitfall Apple Review Guidelines 4.2 e 2.5.2, stime costi/tempi
- **`docs/roadmap.md` §33 "App Apple standalone"** (NUOVO) — Fase 0 PWA + Fase 1 Capacitor + Fase 2 SwiftUI. Vedi nota più sotto: la checklist Fase 0 è da rivedere perché contrassegnata "x" su cose poi rollbackate
- **`docs/piano_responsive_3target.md`** (NUOVO, riscritto due volte) — piano in 7 punti per ottimizzare Mac+iPad. Marco ha messo iPhone esplicitamente FUORI SCOPE: "la voglio vedere a progetto quasi finito, pensarci ora e poi cambiare architettura non ha senso". Il piano è ancora valido come riferimento futuro per **B.1-B.6**, ma il **Punto 1 va rivisto** (vedi sotto)
- **`frontend/src/main.jsx`** — blocco difensivo `serviceWorker.getRegistrations().then(unregister)` + `caches.delete()`. Lasciato attivo perché ripulisce automaticamente client (Mac/iPad) dove era stato registrato il sw.js durante il tentativo PWA. Si può togliere quando saremo sicuri che nessun client ha più SW vecchio (qualche giorno)
- **`frontend/src/hooks/useAppHeight.js`** (NUOVO) — file presente sul disco ma **non importato da nessuna parte**. Lasciato per riutilizzo dopo debug. Non è in produzione, non viene compilato nel bundle perché orfano

### Cosa è stato fatto e poi ROLLBACKATO

**Tentativo 1 — PWA Fase 0** (manifest, sw.js, icone, meta iOS):
- Implementato in pieno: 19 icone Apple/PWA generate da `logo_tregobbi.png` 5000x5000 in `frontend/public/icons/`, `manifest.webmanifest`, `sw.js` con strategia stale-while-revalidate per app shell + bypass per cross-origin API, meta tag Apple in `index.html`, fix `.gitignore` per il pattern `Icon?` che match-ava silenziosamente `/icons/`
- Caricato sul VPS (push #1)
- Sintomo: su iPad crash aprendo Cantina (MagazzinoVini) e Nuova Ricetta (RicetteNuova). Su Mac inizialmente OK
- Diagnosi sospetta: cache stale-while-revalidate del sw.js servita male da iOS Safari al primo deploy, oppure incoerenza tra index.html nuovo e chunk Vite vecchi
- **Rollback (push #3):** registrazione SW disabilitata in `main.jsx`, sostituita con blocco unregister difensivo. **Manifest, icone, meta tag iOS, .gitignore fix RIMASTI sul disco** ma inerti senza il SW

**Tentativo 2 — Punto 1 piano responsive (`useAppHeight` hook)**:
- Hook creato in `src/hooks/useAppHeight.js`: misura `window.innerHeight - <header>.offsetHeight`, setta `--app-h` su `<html>`, ricalcola su resize/orientationchange/ResizeObserver del banner viewer
- Importato + chiamato in `App.jsx` prima del return condizionale (per rispettare regole hook React)
- 6 file pagina convertiti da `calc(100vh - Npx)` a `var(--app-h, 100dvh)` con eventuali sottrazioni per sub-nav locali (FattureElenco, FattureFornitoriElenco, ControlloGestioneUscite, DipendentiAnagrafica, MagazzinoVini, ControlloGestioneRiconciliazione)
- Caricato sul VPS (push #1, insieme alla PWA)
- Sintomo dopo rollback PWA: Cantina **continuava a crashare anche su Mac**, anche dopo rollback puntuale di MagazzinoVini al `calc(100vh - 88px)` originale. RicetteNuova (che non era stata toccata dal Punto 1!) crashava lo stesso → la causa era l'hook globale, non il CSS pagina-per-pagina
- Ipotesi mai verificata: ResizeObserver loop sul `<header>` o interazione con tabelle `position: sticky` di MagazzinoVini su iOS WebKit
- **Rollback (push #4):** import + chiamata `useAppHeight` rimossi da `App.jsx`, tutti i 6 file pagina ripristinati ai valori originali `calc(100vh - Npx)`. Il file `useAppHeight.js` rimane sul disco come orfano per riutilizzo dopo debug

### Lezione di sessione — workflow per tentativi futuri di useAppHeight e PWA
**Mai più commit a blocchi accoppiati su modifiche infrastrutturali rischiose.** Il tentativo di oggi mescolava 3 cambiamenti incrociati (PWA SW + hook globale + 6 file CSS) in un push solo. Quando è esploso non c'era modo di bisezionare la causa senza rollback completo. Strategia per la prossima volta (vedi C.3 e D.4 nella scaletta più sotto):

**Per il `useAppHeight`** (C.3):
1. Commit isolato 1 — solo `useAppHeight.js` + chiamata in `App.jsx`. NESSUN file pagina toccato. L'hook setta `--app-h` ma nessuno lo usa. Marco testa: tutte le pagine devono andare come prima. Se crasha qui → bug nell'hook stesso (sospetto: ResizeObserver loop, fallback iOS Safari < 15.4 senza dvh, race header non ancora montato)
2. Commit isolato 2 — UNA pagina sostituita, la più semplice (DipendentiAnagrafica, struttura piatta senza sub-nav)
3. Commit 3-7 — una pagina alla volta nell'ordine: FattureElenco → FattureFornitoriElenco → ControlloGestioneUscite → ControlloGestioneRiconciliazione → MagazzinoVini (la più complessa per ultima)

**Per la PWA Fase 0** (D.4):
- Riprogettare `sw.js` con strategia diversa: `CACHE_NAME` legato a `BUILD_VERSION` (cache buster automatico a ogni deploy), strategia network-first per app shell (no SWR), nessun precache di chunk Vite
- Testare prima in dev tools desktop con throttling network e modalità "Offline" prima di toccare il VPS
- Su iPad: testare con Safari devtools collegato (Mac → Safari → Develop → iPad) per vedere errori console reali

### Stato file dopo questa sessione

| File | Stato | Note |
|---|---|---|
| `docs/analisi_app_apple.md` | ✅ in produzione | Riferimento Fase 0/1/2 Apple |
| `docs/piano_responsive_3target.md` | ✅ in produzione | Piano 7 punti, valido per B.1-B.6, **Punto 1 da rifare con bisezione** |
| `docs/roadmap.md §33` | ⚠️ da rivedere | Checklist Fase 0 marca [x] cose poi rollbackate |
| `frontend/public/manifest.webmanifest` | 🟡 sul disco ma inerte | Nessuno lo carica perché meta link manifest in index.html è ancora attivo ma il SW è disabilitato |
| `frontend/public/icons/` (19 file) | 🟡 sul disco ma non usati | Verranno usati quando rifaremo la PWA |
| `frontend/public/sw.js` | 🟡 sul disco ma non registrato | Lasciato come riferimento, ma il file ha il bug originale, da riscrivere |
| `frontend/src/main.jsx` | ⚠️ con blocco difensivo unregister SW | Tenere finché non si è certi che nessun client ha SW vecchio (qualche giorno), poi semplificare |
| `frontend/src/hooks/useAppHeight.js` | 🟡 orfano sul disco | Da reinvestigare con C.3 prima di reimportare |
| `frontend/src/App.jsx` | ⚠️ ha import commentato `// import useAppHeight ...` | Riga 12, riga 130 |
| 6 file pagina (FattureElenco, FattureFornitoriElenco, CGUscite, DipendentiAnagrafica, MagazzinoVini, CGRiconciliazione) | ✅ identici a sessione 25 | Tutti tornati a `calc(100vh - Npx)` originale |

### Scaletta lavori per le prossime sessioni (master list)

**B — Piano responsive Mac+iPad (resto, dopo aver risolto C.3)**
- ~~B.1~~ ✅ **FATTA SESSIONE 27** — Header touch-compatibile: `matchMedia("(hover: none) and (pointer: coarse)")`, tap-toggle flyout, click-outside esteso a touchstart, handler mouse condizionali su `!isTouch`. File toccato: `Header.jsx` v4.2 → v4.3. Testato Mac + iPad reale, tutto verde
- **B.2 Punto 3 — Tooltip popover componente — PARZIALE (sessione 27)**:
  - ✅ Componente `Tooltip.jsx` v1.1 creato (con fix iPad Desktop-mode via `navigator.maxTouchPoints` + no long-press callout)
  - ✅ Header.jsx integrato (2 wrapping)
  - ✅ Block 1 CG completo: `ControlloGestioneUscite.jsx` (KPI fix + 9 wrapping), `ControlloGestioneSpeseFisse.jsx` (4 wrapping), `ControlloGestioneRiconciliazione.jsx` (1 wrapping)
  - ⏳ **Block 2-6 da fare sessione 28**, sempre un file per commit direttamente in main:
    - **B.2.B2 Acquisti** (`pages/acquisti/*` — fatture elenco, dettaglio, fornitori elenco, dettaglio fornitore, ecc.)
    - **B.2.B3 Cantina** (`pages/cantina/*` — MagazzinoVini, SchedaVino, stocks, movimenti)
    - **B.2.B4 Dipendenti** (`pages/dipendenti/*` — anagrafica, cedolini, contratti)
    - **B.2.B5 Clienti + GestioneContanti**
    - **B.2.B6 Prenotazioni + Ricette + Banca + FlussiCassa**
  - ⚠️ **Regola operativa sessione 28**: sempre direttamente in main, mai più worktree `.claude/worktrees/*`. Un file per commit, Marco testa tra un push e l'altro. Regole di esclusione costanti: NO `<input>`, NO `<th>`/`<tr>` struct tabella, NO `<label>`, NO prop `title` di component custom (WizardPanel, SectionHeader, Section, ecc.). Span informativi con label dinamico eventualmente vuoto possono essere lasciati con `title=` nativo (come fatto in SpeseFisse storico)
- ~~B.3~~ ✅ **FATTA SESSIONE 27** — Input font-size 16px su touch (`@media (pointer: coarse)` in `index.css`). File toccato: `frontend/src/index.css`. Testato iPad reale, no zoom al focus
- B.4 Punto 5 — Tap target 40-44px su sidebar filtri (~30-40 sostituzioni Tailwind). ⏱ ~45 min, rischio basso
- B.5 Punto 6 (opzionale) — Sidebar width → variabile `w-sidebar` in `tailwind.config.js`. ⏱ 15 min
- B.6 Punto 7 (CONDIZIONALE) — Tabelle critiche `hidden xl:table-cell` su colonne secondarie. SOLO se test iPad reale conferma scroll orizzontale dopo B.1-B.4. Approvazione tabella per tabella

**C — Debito tecnico**
- C.1 `FattureDettaglio.jsx:253` `inline ? "78vh" : "88vh"` — viewer dentro dialog. Da migrare a `var(--app-h)` quando avremo certezza che è sicuro
- C.2 `SchedaVino.jsx:523` — gemello di C.1, stesso pattern
- **C.3 (NUOVO) Reinvestigare `useAppHeight`**: bisezione step-by-step come descritto sopra. Pre-requisito per qualunque uso di `var(--app-h)`. Probabili sospetti: ResizeObserver loop, race header non montato, fallback iOS < 15.4 senza dvh, interazione con tabelle sticky di MagazzinoVini

**D — App Apple roadmap §33**
- D.1 Test PWA Fase 0 su iPad reale — **bloccato fino a D.4**
- D.2 Decisione Fase 1 Capacitor (richiede iscrizione Apple Developer $99/anno)
- D.3 Versione iPhone lite — **bloccato fino a "progetto quasi finito"** per decisione esplicita di Marco (sessione 26)
- **D.4 (NUOVO) Re-implementare PWA Fase 0** con strategia cache safe per iOS: CACHE_NAME legato a BUILD_VERSION, network-first per app shell, no precache di chunk Vite, test in dev tools prima di pushare. Pre-requisito di D.1

**E — Backlog generale (preesistente)**
- E.1 Mailchimp sync (vedi `project_backlog.md` in memoria)
- E.2 Google Contacts API
- E.3 Modulo Prenotazioni — 5 fasi, obiettivo eliminare TF Manager (`docs/modulo_prenotazioni.md`, `docs/prenotazioni_todo.md`)

**F — Home v3 Redesign (NUOVO sessione 29)**
- ✅ F.0 Docs + specifiche + regole design + mockup approvato
- ⏳ F.1 Backend endpoint `GET /dashboard/home` aggregatore widget
- ⏳ F.2 Frontend infrastruttura: `useHomeWidgets()` hook, `WidgetCard` component, `icons.jsx` set SVG
- ⏳ F.3 Frontend pagina 1 (widget): riscrittura Home.jsx con swipe + 5 widget
- ⏳ F.4 Frontend pagina 2 (moduli): `ModuleTile` component, griglia responsive
- ⏳ F.5 Navigazione: adattamento Header + DashboardSala stile v3
- ⏳ F.6 Polish: styleguide.md aggiornato, test viewport iPad/iPhone, versions.jsx

---

## Cosa abbiamo fatto nella sessione 23 (2026-04-10 notte) — **Incident backup + refactor FattureDettaglio + Scadenzario sidebar**

Sessione di "pulizia e cleanup" dopo la chiusura della v2.0 CG aggregatore. Partita come piccolo giro di refactor, finita come sessione lunga con un incident backup critico risolto + 3 refactor UX importanti + fix infrastrutturale permanente.

### Incident backup — fermo da 12 giorni, risolto e blindato
- **Scoperta** — `scripts/backup_db.sh` aveva perso il bit `+x` (quasi certamente dopo un push.sh precedente: git non sempre preserva la mode bit quando il file viene riscritto). Il cron hourly+daily falliva con `Permission denied` senza entrare nello script. Ultimo backup hourly riuscito: 2026-03-29 22:33. La cartella `daily/` era completamente vuota
- **Fix immediato** — `chmod +x` sul VPS, test con `--daily`: tutti i DB backuppati, rotazione OK, sync Google Drive OK
- **Architettura — `backup_router.py` v2** — scoperto che il router leggeva da `/home/marco/trgb/backups/*.tar.gz` (Sistema B, residuo morto) mentre il cron vero scrive in `/home/marco/trgb/trgb/app/data/backups/daily/YYYYMMDD_HHMMSS/` (Sistema A). Riscritto per puntare al sistema reale, nuova helper `_list_daily_snapshots()`, download on-the-fly via tarfile in memoria, nuovo campo `last_backup_age_hours`
- **UX — banner warning 3 livelli** in `TabBackup`: verde ≤30h, amber 30-48h, red >48h. Se il bit `+x` sparisce di nuovo Marco lo vede subito invece di accorgersene settimane dopo
- **Bug fix — `clienti.sqlite3` escluso dal backup da sempre** — trovato durante la verifica UI. Né `backup_db.sh` né `backup_router.py` lo elencavano. Aggiunto in entrambi
- **Cleanup** — rimosso `backup.sh` orfano dalla root, riscritto `setup-backup-and-security.sh` con le crontab corrette, aggiornati `docs/deploy.md` + `docs/GUIDA-RAPIDA.md` + questo file
- **Fix permanente idempotente** — aggiunto step "Verifica bit +x script critici" dentro `push.sh` che itera un array `EXEC_SCRIPTS=("scripts/backup_db.sh" "push.sh")` e se il mode letto da `git ls-files --stage` non è `100755` esegue `git update-index --chmod=+x`. Idempotente: quando tutto è ok non fa nulla. Così è impossibile rilasciare una versione con gli script critici non eseguibili

### Acquisti v2.2 → v2.3 — Unificazione FattureDettaglio (Fase H)
- **Fine dei "due moduli fatture"** — prima di oggi il dettaglio fattura aveva due implementazioni parallele: il componente riutilizzabile `FattureDettaglio` (usato in `/acquisti/dettaglio/:id` e nello split-pane dello Scadenzario) e un `DetailView` locale dentro `FattureElenco.jsx` (~130 righe) con stile suo proprio. La nuova grafica "sidebar colorata + SectionHeader" di v2.1b non appariva in Acquisti → Fatture perché quella vista continuava a usare la vecchia DetailView
- **`FattureElenco.jsx` riscritto** — `DetailView` locale eliminato. Il ramo "dettaglio aperto" ora renderizza `<FattureDettaglio fatturaId={openId} inline={true} onClose={...} onSegnaPagata={...} onFatturaUpdated={...}>`. State locale semplificato: rimossi `dettaglio` e `detLoading`, resta solo `openId`
- **Nuova prop `onSegnaPagata`** in `FattureDettaglio` — se passata, la sidebar colorata mostra il bottone "✓ Segna pagata" in ambra (solo se non pagata/non rateizzata/stato ≠ PAGATA). Il componente chiama la callback del parent e poi esegue `refetch()` automaticamente. Funzionalità "segna pagata manuale" preservata dal vecchio DetailView ma ora disponibile ovunque

### Dettaglio Fornitore v3.2 — Sidebar colorata + FattureDettaglio inline (Acquisti v2.3)
- **Refactor grafico `FornitoreDetailView`** — allineato a `FattureDettaglio`/`SchedaVino`. Nuovo layout due colonne `grid-cols-1 lg:grid-cols-[300px_1fr]` con sidebar colorata a sinistra. Top bar ("Torna alla lista", "Nascondi da acquisti / Ripristina") sopra, fuori dalla griglia
- **Sidebar colorata con stato semantico** — gradiente teal (ATTIVO), amber (IN SOSPESO se `nDaPagare > 0`), slate (ESCLUSO se `fornitore_escluso = 1`). Costante `FORNITORE_SIDEBAR` + helper `getFornitoreSidebar()`. Contenuti: header (nome+P.IVA+CF+badge), box totale spesa grande, 4 KPI compatti, box "Da pagare" (rosso se scadute), info list primo/ultimo acquisto, sede, distribuzione categorie, ID tecnico
- **`SectionHeader` uniforme** — helper locale per delimitare "Categoria generica fornitore" e "Condizioni di pagamento" nell'area principale
- **Unificazione — dettaglio fattura inline usa FattureDettaglio** — eliminato il subcomponente `FatturaInlineDetail` (~130 righe) che duplicava il rendering. Sostituito da `<FattureDettaglio fatturaId={openFatturaId} inline={true} ... />`. Cleanup state (`fatturaDetail`/`fatturaDetLoading` rimossi), `openFattura(id)` ora è un semplice toggle. `onSegnaPagata`/`onFatturaUpdated` triggerano `reloadFatture()` + `handleFatturaUpdatedInline()` per sync sidebar+tabella

### Controllo Gestione v2.1c — Rewrite sidebar Scadenzario
- **Problemi identificati** — 7 palette diverse nei blocchi filtro (white/sky/indigo/purple/amber/violet/neutral) = rumore visivo; filtri impilati verticalmente sprecavano spazio (Stato: 4 bottoni × ~28px = 112px); pulsanti Pulisci/Aggiorna dentro il flusso scrollabile, sparivano appena scorrevi
- **Nuova struttura flat 240px** — outer `flex flex-col` con body `flex-1 overflow-y-auto` + footer sticky `flex-shrink-0`. Una sola palette neutra con accenti semantici solo dove servono. Sezioni separate da `border-b border-neutral-100`, header `text-[10px] uppercase tracking-wider`
- **Stato come griglia 2×2** — `grid-cols-2 gap-1.5`, ogni stato assume il suo colore semantico quando attivo (Tutti neutral-800, Da pagare amber-100, Scadute red-100, Pagate emerald-100)
- **Tipo come segment control** — pill group orizzontale `flex rounded-md bg-neutral-50 p-0.5`, pill attivo `bg-white shadow-sm`. Molto più compatto
- **Periodo preset in 3 colonne** + Da/A date inline nella riga sotto
- **Filtri speciali fusi** — Rateizzate + Solo in pagamento come toggle con dot-indicator, "Gestisci batch" come dashed-border nello stesso blocco, Riconciliazione come badge violet condizionale
- **Footer sticky** con Pulisci (disabled quando nessun filtro attivo) + Aggiorna sempre visibili

### Versioning
- **`versions.jsx`** — `fatture` v2.2 → v2.3 (unificazione + dettaglio fornitore v3.2), `controlloGestione` v2.1b → v2.1c (sidebar Scadenzario)

### Workflow lessons apprese
- **Bit +x è un single point of failure infrastrutturale** — perdere il bit eseguibile su uno script cron significa zero allerta e zero backup finché qualcuno non guarda manualmente. Soluzione: fix idempotente dentro `push.sh` + banner warning nella UI
- **"Due implementazioni parallele di X" è un debito da estinguere subito** — appena ci si rende conto che un componente locale e un componente riutilizzabile fanno la stessa cosa con stile diverso, bisogna eliminare il locale. Altrimenti ogni miglioria fatta sul riutilizzabile non arriva mai all'altra vista
- **Sidebar con 7 colori diversi è peggio di una con 1 colore** — il colore deve veicolare informazione (stato semantico), non "fare carino". Flat + spazio bianco + accenti mirati batte sempre il carnevale

---

## Cosa abbiamo fatto nella sessione 22 (2026-04-10) — **v2.0 CG aggregatore completata**

Sessione lunga (mattina → notte). Divisa in due tempi: backfill sospeso al pomeriggio, poi ripreso e completato con tutta la parte backend + frontend v2.0.

### v2.0 CG aggregatore — Fase A (schema + backfill)

1. **Mig 055** `fe_fatture.rateizzata_in_spesa_fissa_id` + indice parziale — APPLICATA
2. **Mig 056** `fe_fatture.data_prevista_pagamento`, `data_effettiva_pagamento`, `iban_beneficiario`, `modalita_pagamento_override` + 4 indici — APPLICATA
3. **Mig 057** dry-run CSV del backfill rateizzazioni — APPLICATA
4. **`scripts/apply_backfill_057.py`** — backup automatico + transazione atomica. **Backfill applicato: 43/43 fatture flaggate** (compreso Metro Italia risolto con `find_metro.py`)
5. **`docs/v2.0-decisioni.md`** — consolidate le decisioni architetturali (F4 insight: analitico vs finanziario, 3 campi data)

### v2.0 CG aggregatore — Fase B (backend)

- **B.1** — `GET /controllo-gestione/uscite` riscritto come vista JOIN su `fe_fatture`. COALESCE chain per `data_scadenza_effettiva`, `modalita_pagamento_effettiva`, `iban_beneficiario_effettivo`. CASE per normalizzare stato → `RATEIZZATA`/`PAGATA`. Query param `includi_rateizzate` (default OFF) che nasconde le 43 righe rateizzate. Retrocompat piena sul payload JSON
- **B.1.1** — toggle sidebar "Mostra rateizzate" nello Scadenzario + sfondo viola righe RATEIZZATA + badge permanente `STATO_STYLE.RATEIZZATA`
- **B.2** — `PUT /uscite/{id}/scadenza` riscritto come **smart dispatcher 2-rami**: FATTURA con `fattura_id` → `fe_fatture.data_prevista_pagamento`; altro → `cg_uscite.data_scadenza` (legacy). Delta calcolato da `fe_fatture.data_scadenza` XML per fatture v2. **Nota**: `cg_piano_rate` non ha `data_scadenza`, quindi dispatcher 2-rami (non 3 come in roadmap originaria). Frontend `apriModaleScadenza` inietta `data_scadenza_originale` semantica (XML per fatture, cg_uscite per il resto)
- **B.3** — nuovi endpoint `PUT /uscite/{id}/iban` e `PUT /uscite/{id}/modalita-pagamento` (dispatcher). FATTURA → `fe_fatture.iban_beneficiario` / `fe_fatture.modalita_pagamento_override`; SPESA_FISSA → `cg_spese_fisse.iban`; altri → 422. Helper `_normalize_iban` (upper+strip), `_normalize_mp_code`. Risposta con `fonte_modifica` per tracciamento

### v2.0 CG aggregatore — Fase D (FattureDettaglio arricchito)

- **`GET /contabilita/fe/fatture/{id}` esteso** con tutti i campi v2.0 (scadenze, IBAN, mp override, rateizzata flag, sub-oggetto `uscita` con batch) + COALESCE chain Python-side
- **`FattureDettaglio.jsx`** — nuova card "Pagamenti & Scadenze" tra header e righe con:
  - Badge stato uscita + badge rateizzata/batch
  - Banner viola + link alla spesa fissa se rateizzata
  - 3 tile editabili (Scadenza / Modalità / IBAN) con flag "override", edit inline → endpoint B.2/B.3
  - Modifica bloccata se PAGATA o RATEIZZATA
  - Breadcrumb `?from=scadenzario` → "Torna allo Scadenzario"
  - Toast feedback emerald/red

### v2.0 CG aggregatore — Fase E (Scadenzario click-through)

- **`handleRowClick` intelligente** nello Scadenzario: FATTURA → FattureDettaglio; SPESA_FISSA → SpeseFisse con highlight; altri → modale legacy. Tooltip dinamico
- **`ControlloGestioneSpeseFisse.jsx`** supporta `?highlight=<id>&from=scadenzario`: scrollIntoView + `animate-pulse ring-amber`, param rimosso dopo 4s, bottone "← Torna allo Scadenzario" teal in header

### Workflow lessons apprese

- **push.sh SOLO dal main working dir** (`/Users/underline83/trgb`). MAI dai worktree `.claude/worktrees/*` — committa sul branch sbagliato e il push non arriva in main (salvato come memory `feedback_push_sh_cwd.md`)
- **VPS git status sporco è cosmetico**: il post-receive hook usa `--git-dir=$BARE --work-tree=$WORKING_DIR checkout -f` che scrive i file ma non aggiorna il `.git/` locale. L'indicatore vero del deploy è `deploy.log` sul VPS (salvato come memory `project_vps_cosmetic_git.md`)
- **Non fidarsi del titolo del commit**: quando B.1 era "già pushato" secondo il messaggio, in realtà il commit conteneva solo i docs. Il router era in un worktree non committato. Lezione: sempre `git show --stat <hash>` per verificare

---

## Cosa abbiamo fatto nella sessione 21 (2026-04-06)

### Gestione Clienti v1.1: Merge duplicati, protezione dati, export
1. **Merge duplicati** — UI 3-step (principale → secondari → conferma), batch merge, trasferimento prenotazioni/note/tag/alias
2. **Filtri duplicati** — 3 modalità: telefono, email, nome+cognome; esclusione "non sono duplicati"
3. **Protezione dati CRM** — campo `protetto`, tag `auto/manual`, alias merge per import sicuro
4. **Import intelligente** — protetti: riempimento campi vuoti + aggiornamento rank/spending; non protetti: sovrascrittura completa
5. **Export Google Contacts** — CSV per Gmail con nome, email, telefoni, compleanno, allergie, tag come gruppi
6. **push.sh refactoring** — flag -f/-m/-d, aggiunto clienti.sqlite3 a sync DB

### Sessione 20: Gestione Clienti v1.0 (CRM completo)
1. **DB dedicato** `clienti.sqlite3` — 7 tabelle con trigger e indici
2. **Backend completo** `clienti_router.py` (~1200 righe) — tutti gli endpoint CRM
3. **Import TheFork** — clienti (30 colonne XLSX) + prenotazioni (37 colonne XLSX)
4. **Anagrafica (Lista)** — tabella ordinabile, sidebar filtri, paginazione
5. **Scheda cliente** — layout 3 colonne, edit inline, tag toggle, diario note, storico prenotazioni
6. **Dashboard CRM** — KPI, compleanni, top clienti, distribuzione, andamento mensile
7. **Dashboard CRM** — 8 KPI card, compleanni 7gg, top 20 clienti, rank/tag/canale distribution, andamento mensile 12 mesi, copertura contatti
8. **Vista Prenotazioni** — tabella globale con filtri (stato, canale, date), badge colorati, paginazione
9. **Import UI** — due sezioni (clienti + prenotazioni) con istruzioni step-by-step, drag & drop XLSX

### Sessione 19 (2026-04-05)
10. Vendite v4.2: turni chiusi parziali, fix DELETE chiusura
11. Sistema v5.3: logging strutturato, centralizzazione DB, error handler globale

### Sessione 18 (2026-04-01/02)
12. Vendite v4.1, Controllo Gestione v1.4, Flussi di Cassa v1.3-1.4, Dipendenti v2.1

---

## Cosa abbiamo fatto nella sessione 17 (2026-03-29)

### Controllo Gestione v1.0: Nuovo modulo, dashboard, tabellone uscite

#### Nuovo modulo Controllo Gestione
1. **Modulo top-level** integra Finanza (rimosso) — colore sky/cyan, icona 🎯
2. **Dashboard unificata** — KPI vendite/acquisti/banca/margine, andamento annuale, top fornitori, categorie acquisti
3. **Tabellone Uscite** — importa fatture da Acquisti, calcola scadenze, gestisce stati (DA_PAGARE, SCADUTA, PAGATA, PARZIALE)
4. **Confronto Periodi** — placeholder per confronto mesi/anni

#### Estrazione DatiPagamento da XML FatturaPA
5. **fe_import.py** — aggiunta funzione `_extract_dati_pagamento()` che estrae DatiPagamento/DettaglioPagamento (condizioni, modalità, scadenza, importo) dall'XML
6. **Migration 031** — aggiunge `condizioni_pagamento`, `modalita_pagamento`, `data_scadenza`, `importo_pagamento` a `fe_fatture` + `modalita_pagamento_default`, `giorni_pagamento`, `note_pagamento` a `suppliers`

#### Tabelle Controllo Gestione
7. **Migration 032** — crea `cg_uscite` (fatture importate con stato pagamento), `cg_spese_fisse` (affitti, tasse, stipendi), `cg_uscite_log`

#### Import uscite e logica scadenze
8. **POST /controllo-gestione/uscite/import** — importa fatture da fe_fatture → cg_uscite, calcola scadenza (XML > default fornitore > NULL), aggiorna stati
9. **GET /controllo-gestione/uscite** — tabellone con filtri (stato, fornitore, range date, ordinamento)
10. **GET /controllo-gestione/uscite/senza-scadenza** — fatture senza scadenza (da configurare)

#### Condizioni pagamento fornitore
11. **FattureFornitoriElenco.jsx** — aggiunta sezione "Condizioni di pagamento" nella scheda fornitore (modalità, giorni, note)
12. **PUT /controllo-gestione/fornitore/{piva}/pagamento** — salva condizioni pagamento default per fornitore

#### Ancora da fare (prossime sessioni)
- **Punto 5**: Cross-ref pagamenti con Banca (matching uscite ↔ movimenti)
- **Spese Fisse**: sezione per affitti, tasse, stipendi, prestiti, rateizzazioni
- **Gestione contanti**: matching pagamenti cash
- Finanza: RIMOSSO in sessione 18

---

## Cosa abbiamo fatto nella sessione 15 (2026-03-28)

### Acquisti v2.2: Filtro categoria sidebar, fix fornitori mancanti, dettaglio migliorato

#### Fix fornitori mancanti (sessione 14+15)
1. **stats_fornitori query riscritta** — il vecchio LEFT JOIN con `escluso` filter nel WHERE nascondeva fornitori legittimi. Ora usa NOT EXISTS subquery per esclusione + JOIN separato per categoria
2. **forn_key fix** — COALESCE non gestiva fornitore_piva="" (empty string vs NULL). Ora usa CASE WHEN

#### Filtro categoria sidebar
3. **FattureFornitoriElenco.jsx** — aggiunto dropdown "Categoria fornitore" nella sidebar sinistra (filtra per categoria assegnata al fornitore, oppure "Senza categoria")
4. **stats_fornitori** — ora ritorna `categoria_id` e `categoria_nome` dal JOIN con fe_fornitore_categoria + fe_categorie

#### Dettaglio fornitore migliorato
5. **KPI arricchiti** — aggiunto "Media fattura" e "Da pagare" (importo rosso, solo se ci sono fatture non pagate)
6. **Layout header** — P.IVA e C.F. su stessa riga, piu' compatto
7. **Pulsante "Escludi" ridisegnato** — grigio discreto, diventa rosso solo al hover

#### Sessione 14 (2026-03-25/27) — riepilogo
8. **Toast feedback** per azioni massive in MagazzinoVini.jsx
9. **Categoria fornitore propagata** ai prodotti (con flag `categoria_auto`)
10. **Righe descrittive nascoste** (prezzo_totale=0 filtrate da prodotti e cat_status)
11. **Colonne ordinabili** sia nella tabella fornitori che nella tab fatture del dettaglio
12. **Esclusione fornitori** (Cattaneo/Bana come affitti) con filtro in stats_fornitori
13. **Migrazione 027** (fe_righe.categoria_auto) + **028** (reset valori errati)

---

## Cosa abbiamo fatto nella sessione 13 (2026-03-23)

### Gestione Vendite v4.0: Dashboard unificata 3 modalita', chiusure configurabili, cleanup fiscale
- Fix home page vuota per superadmin (modules.json + Home.jsx)
- Pre-conti nascosti in Impostazioni (solo superadmin)
- Dashboard fiscale pulita: contanti come residuo, rimossi alert/differenze
- Confronto YoY con smart cutoff (giorno corrente se mese in corso)
- Chiusure configurabili: closures_config.json + CalendarioChiusure.jsx
- Dashboard unificata 3 modalita' (Mensile/Trimestrale/Annuale) in una pagina

---

## Cosa abbiamo fatto nella sessione 12 (2026-03-22)

### Gestione Acquisti v2.1: FIC API v2 enrichment, SyncResult tracking, fix UI escluso

#### Backend — fe_import.py (fatture list/import)
1. **Rimosso `escluso` field da query `/fatture`** — il flag e' solo per product matching module, non per acquisti
2. **Rimosso LEFT JOIN con `fe_fornitore_categoria`** dalla list endpoint e stats (fornitori, mensili)
3. **Import XML arricchisce fatture FIC** — quando import XML matcha una fattura FIC esistente, aggiunge le righe XML se FIC ritorna `is_detailed: false`
4. **Import XML aggiorna importi** — da XML SdI: imponibile, IVA, totale quando arricchisce

#### Backend — fattureincloud_router.py (FIC sync)
5. **SyncResult tracking v2.0** — include `items` list e `senza_dettaglio` list
6. **Debug endpoint** — `GET /fic/debug-detail/{fic_id}`
7. **Phase 2 XML preservation** — se FIC `items_list` vuoto, righe da XML non vengono cancellate

#### Frontend
8. **FattureElenco.jsx** — rimosso badge/filtro "Escluse", anno default = current year
9. **FattureImpostazioni.jsx** — sync result table + warning box + 10-min timeout
10. **FattureDashboard.jsx** — anno default = current year

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-20, sessione 11)

### Infrastruttura: backup, sicurezza, multi-PC, Google Drive

1. **ChiusuraTurno.jsx** — autosave localStorage completo
2. **ChiusureTurnoLista.jsx** — fix formula quadratura
3. **VPS Recovery** — fail2ban whitelist, backup automatico notturno
4. **Git ibrido** — origin=VPS + github=GitHub, push.sh
5. **Windows configurato** — SSH + Git + VS Code
6. **backup_router.py** — download backup on-demand dall'app
7. **rclone + Google Drive** — upload automatico backup

---

## Sessioni precedenti (3-11)

| # | Data | Tema |
|---|------|------|
| 10 | 2026-03-16 | Cantina & Vini v4.0 — filtro unificato, stampa selezionati, SchedaVino sidebar |
| 9 | 2026-03-15c | Modulo Statistiche v1.0 — import iPratico + analytics vendite |
| 8 | 2026-03-15b | Unificazione loader carta + DOCX tabelle + fix cancellazione movimenti |
| 7 | 2026-03-15 | Eliminazione vecchio DB vini.sqlite3 + fix carta PDF/HTML |
| 6 | 2026-03-14 | Chiusure Turno — modulo completo + Cambio PIN |
| 5c | 2026-03-14a | Cantina & Vini v3.7 — filtri locazione gerarchici |
| 5b | 2026-03-13 | Modulo Banca v1.0 + Conversioni unita' + Smart Create UX |

---

## Stato attuale del codice — cose critiche da sapere

### Backup & Sicurezza (CONFIGURATO)
- **Backup notturno** alle 3:00 → `/home/marco/trgb/backups/` + upload Google Drive (`TRGB-Backup/`)
- **Download dall'app**: Admin → Impostazioni → tab Backup
- **fail2ban**: whitelist reti private, bantime 10 minuti
- **Snapshot Aruba**: da configurare settimanalmente dal pannello

### Git & Deploy (CONFIGURATO)
- **Mac** (`~/trgb`): origin=VPS, github=GitHub, push.sh
- **Windows** (`C:\Users\mcarm\trgb`): origin=VPS, github=GitHub
- **VPS**: bare repo + post-receive hook per deploy automatico
- **Flusso**: `./push.sh "msg"` oppure `git push origin main && git push github main`

### Modulo Chiusure Turno
- **Backend**: `chiusure_turno.py` con endpoint POST/GET per chiusure + pre-conti + spese
- **Frontend**: `ChiusuraTurno.jsx` (form con autosave localStorage), `ChiusureTurnoLista.jsx` (lista admin con quadratura corretta)
- **DB**: `admin_finance.sqlite3` con tabelle shift_closures, shift_preconti, shift_spese

### Dashboard Vendite v4.0
- **3 modalita'**: Mensile / Trimestrale / Annuale in un'unica pagina
- **Confronto YoY smart**: cutoff al giorno corrente se periodo in corso
- **Dati fiscali puliti**: solo corrispettivi, contanti come residuo
- **Chiusure configurabili**: giorno settimanale + festivi in closures_config.json

### Cambio PIN
- **Frontend**: `CambioPIN.jsx` a `/cambio-pin`
- **Backend**: usa endpoint esistente `PUT /auth/users/{username}/password`

### Modulo Acquisti — Fornitori (v2.2)
- **Categorizzazione a 3 livelli**: prodotto manuale > fornitore manuale > import automatico
- **`auto_categorize_righe()`** in `fe_categorie_router.py`: shared helper usato da import XML e FIC sync
- **`categoria_auto` flag** su `fe_righe`: 0=manuale, 1=ereditata da import
- **Badge cat_status**: ok (tutte manuali), auto (ha ereditate), partial, none, empty
- **Filtri sidebar**: ricerca testo, anno, categoria fornitore, stato prodotti
- **Pattern UI**: SortTh/sortRows su tutte le tabelle, toast per feedback

### REGOLA CRITICA: campi `escluso` e `escluso_acquisti` in fe_fornitore_categoria
- `escluso` → usato SOLO dal modulo **Ricette/Matching** (RicetteMatching.jsx). Nasconde fornitori irrilevanti dal matching fatture-ingredienti.
- `escluso_acquisti` → usato SOLO dal modulo **Acquisti**. Nasconde fornitori da dashboard/KPI/grafici (es. affitti Cattaneo/Bana).
- **NON mescolare mai i due campi**. Ogni modulo usa il suo.
- Le query acquisti (`_EXCL_WHERE`) filtrano: `is_autofattura = 0 AND escluso_acquisti = 0`
- Toggle nel dettaglio fornitore: "Nascondi da acquisti" / "Ripristina"
- Nell'elenco fornitori: esclusi nascosti di default, checkbox "Mostra esclusi" nella sidebar

### FORCE IMPORT SENZA CHECK RUOLO
`vini_magazzino_router.py` riga ~403: commento `# per ora nessun controllo di ruolo`.

---

## Mappa versioni moduli

Fonte di verita': `frontend/src/config/versions.jsx`

| Modulo | Versione | Stato |
|--------|----------|-------|
| Cantina & Vini | v3.8 | stabile |
| Gestione Acquisti | v2.3 | stabile |
| Ricette & Food Cost | v3.0 | beta |
| Gestione Vendite | v4.2 | stabile |
| Statistiche | v1.0 | beta |
| Flussi di Cassa | v1.5 | beta |
| Controllo Gestione | v2.1c | beta |
| Gestione Clienti | v2.0 | beta |
| Prenotazioni | v2.0 | beta |
| Dipendenti | v2.1 | stabile |
| Login & Ruoli | v2.0 | stabile |
| Sistema | v5.3 | stabile |

---

## Task aperti prioritizzati

Vai su `docs/roadmap.md` per la lista completa.

| # | Task | Stato |
|---|------|-------|
| 26 | Checklist fine turno configurabile | Da fare |
| 20 | Carta Vini pagina web pubblica | Da fare |
| 25 | Sistema permessi centralizzato | TODO |
| 28 | Riconciliazione banca migliorata | Da fare |
| 17 | Flag DISCONTINUATO UI per vini | Da fare |
| 29 | DNS dinamico rete casa (DDNS) | In standby |
| 30 | Snapshot Aruba settimanale | Da configurare |

---

## Prossima sessione — TODO

1. **Completare refactoring DB** — Code ha saltato ipratico_products_router (2 conn), corrispettivi_export (1 conn), dipendenti (1 conn)
2. **Testare wizard rateizzazione** — creare una rateizzazione di prova con spese legali e rate variabili
3. **Configurare snapshot Aruba settimanale** dal pannello
4. **DNS dinamico casa** (DDNS) — rimandato
5. **Checklist fine turno** — seed dati default pranzo/cena, UI configurazione
6. **Flag DISCONTINUATO** — UI edit + filtro in dashboard vini

---

## File chiave — dove trovare le cose

```
main.py                                — entry point, include tutti i router
app/services/auth_service.py           — auth PIN sha256_crypt
app/data/users.json                    — store utenti (marco/iryna/paolo/ospite)

# --- BACKUP ---
app/routers/backup_router.py           — download backup on-demand, lista, info, age warning
scripts/backup_db.sh                   — backup orario + giornaliero (cron) + sync Google Drive
setup-backup-and-security.sh           — setup cron + fail2ban (one-time)

# --- CHIUSURE TURNO ---
app/routers/chiusure_turno.py          — backend, prefix /chiusure-turno
frontend/src/pages/admin/ChiusuraTurno.jsx  — form fine servizio (con autosave)
frontend/src/pages/admin/ChiusureTurnoLista.jsx — lista chiusure admin (quadratura corretta)

# --- VENDITE ---
app/routers/admin_finance.py              — corrispettivi legacy + stats + chiusure configurabili
app/routers/closures_config_router.py     — GET/PUT config chiusure
app/data/closures_config.json             — config giorno settimanale + giorni chiusi
frontend/src/pages/admin/VenditeNav.jsx   — navigazione (senza tab Annuale)
frontend/src/pages/admin/CorrispettiviDashboard.jsx — dashboard unificata 3 modalita'
frontend/src/pages/admin/CorrispettiviImport.jsx    — impostazioni sidebar (chiusure + import)
frontend/src/pages/admin/CalendarioChiusure.jsx     — UI calendario chiusure

# --- VINI ---
app/routers/vini_router.py               — carta vini + movimenti (v3.0, solo magazzino)
app/routers/vini_magazzino_router.py     — magazzino vini CRUD
app/routers/vini_cantina_tools_router.py — strumenti cantina (v3.1, loader unificato)
app/models/vini_magazzino_db.py          — DB unico vini + fix delete_movimento
app/services/carta_vini_service.py       — builder HTML/PDF/DOCX carta vini
app/repositories/vini_repository.py      — load_vini_ordinati() da magazzino (usato da tutti)

# --- ACQUISTI (FATTURE ELETTRONICHE) ---
app/routers/fe_import.py                    — import XML/ZIP, stats fornitori, dashboard, drill
app/routers/fe_categorie_router.py          — categorie, assegnazione prodotti/fornitori, auto_categorize
app/routers/fattureincloud_router.py        — sync FIC API v2
frontend/src/pages/admin/FattureFornitoriElenco.jsx — lista fornitori con sidebar filtri + dettaglio inline
frontend/src/pages/admin/FattureDashboard.jsx       — dashboard acquisti
frontend/src/pages/admin/FattureElenco.jsx          — lista fatture
frontend/src/pages/admin/FattureCategorie.jsx       — gestione categorie
frontend/src/pages/admin/FattureImpostazioni.jsx    — import + sync settings

# --- RICETTE & FOOD COST ---
app/routers/foodcost_recipes_router.py    — ricette + calcolo food cost
app/routers/foodcost_matching_router.py   — matching fatture → ingredienti
app/routers/foodcost_ingredients_router.py — ingredienti + conversioni

# --- STATISTICHE ---
app/routers/statistiche_router.py        — import iPratico + analytics (v1.0)
app/services/ipratico_parser.py          — parser export .xls (HTML)
frontend/src/pages/statistiche/          — Menu, Nav, Dashboard, Prodotti, Import

# --- BANCA ---
app/routers/banca_router.py              — movimenti, dashboard, categorie, cross-ref

# --- IMPOSTAZIONI ---
frontend/src/pages/admin/ImpostazioniSistema.jsx — tab Utenti + Moduli + Backup (standalone, /impostazioni)

# --- CLIENTI CRM ---
app/models/clienti_db.py                 — init DB clienti.sqlite3 (5 tabelle, trigger, indici)
app/routers/clienti_router.py            — CRUD + import TheFork + dashboard + prenotazioni (~900 righe)
frontend/src/pages/clienti/              — Menu, Nav, Lista, Scheda, Dashboard, Import, Prenotazioni

# --- FRONTEND ---
frontend/src/App.jsx                   — tutte le route (50+), /admin redirect a /impostazioni
frontend/src/config/api.js             — API_BASE + apiFetch()
frontend/src/config/versions.jsx       — versioni moduli
frontend/src/config/modulesMenu.js     — config moduli/sotto-menu (usata da Home + Header)
frontend/src/components/Header.jsx     — header flyout v4.1 + cambio PIN
frontend/src/pages/Home.jsx            — home con card moduli (usa modulesMenu.js)
frontend/src/pages/CambioPIN.jsx       — self-service + admin reset
```

---

## DB — mappa rapida

| Database | Moduli |
|----------|--------|
| ~~`vini.sqlite3`~~ | ELIMINATO v3.0 — carta ora da magazzino |
| `vini_magazzino.sqlite3` | Cantina moderna |
| `vini_settings.sqlite3` | Settings carta |
| `foodcost.db` | FoodCost + FE XML + Ricette + Banca + Statistiche + CG (migraz. 001-049, include cg_entrate, cg_piano_rate) |
| `admin_finance.sqlite3` | Vendite + Chiusure turno |
| `clienti.sqlite3` | Clienti CRM (anagrafica, tag, note, prenotazioni) |
| `dipendenti.sqlite3` | Dipendenti (runtime) |

### Backup database
- **Automatico orario**: ogni ora al minuto 0 → `app/data/backups/hourly/YYYYMMDD_HHMMSS/` (retention 48h)
- **Automatico giornaliero**: ore 03:30 → `app/data/backups/daily/YYYYMMDD_HHMMSS/` + sync Google Drive `TRGB-Backup/db-daily` (retention 7gg)
- **Script**: `scripts/backup_db.sh --hourly | --daily` — usa `sqlite3 .backup` (copia atomica)
- **Manuale da app**: Admin → Impostazioni → tab Backup (banner rosso se ultimo backup > 48h)
- **Manuale da CLI**: `ssh trgb "/home/marco/trgb/trgb/scripts/backup_db.sh --daily"`
- ⚠️ **Attenzione**: il bit `+x` sullo script può sparire dopo un push.sh. Fix: `chmod +x scripts/backup_db.sh`.

---

## Deploy — PROCEDURA OBBLIGATORIA

> **IMPORTANTE PER CLAUDE:** Dopo ogni commit, ricorda SEMPRE a Marco di fare il deploy
> con `push.sh`. Lo script nella root del progetto fa TUTTO automaticamente.

```bash
./push.sh "messaggio commit"       # deploy rapido
./push.sh "messaggio commit" -f    # deploy completo (pip + npm)
```

### NOTA: Claude NON puo' eseguire push.sh
Lo script richiede accesso SSH al VPS. Marco deve lanciarlo dal terminale del Mac o Windows.

---

## Aggiorna questo file a fine sessione

Sostituisci la sezione "Cosa abbiamo fatto" con i task completati oggi.
Aggiorna la tabella dei task se ne hai chiusi.
