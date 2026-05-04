# Inventario Google Drive `osteriatregobbi@gmail.com` — backup TRGB

> Ricognizione del 2026-05-04 19:50 CET. Solo lettura, **niente eliminato**.
> Ambito: tutto l'ecosistema "backup TRGB" presente nel Drive (My Drive root + sotto-alberi).

---

## 1. Mappa attuale

```
Il mio Drive (osteriatregobbi@gmail.com)
│
├── 📁 TRGB-Backup/                           ← creata 2026-03-20, riorganizzata OGGI
│   │
│   ├── 📁 db-runbook/                        ✅ CREATA OGGI (4/5) — la struttura "buona"
│   │   ├── 📁 locali/
│   │   │   ├── 📁 trgb/    (R1 monorepo: branding, locale, moduli_attivi, strings, README, deploy/, data/)
│   │   │   └── 📁 tregobbi/ (R1 monorepo: idem + seeds/, assets/splash/)
│   │   ├── 📁 scripts/     (10 file: backup_db.sh, check_backup_health.sh + 8 utility .py/.sh)
│   │   └── 📁 docs/        (~70 file .md di docs progetto + 1 .docx + 1 .pdf vuoto + 1 .html + mockups/)
│   │
│   ├── 📁 db-lkg/          ✅ CREATA OGGI 19:13, ricopiata 19:36 — Last Known Good
│   │   └── 15 file: foodcost.db (7.4 MB) + 9 sqlite3 + 5 json — ~36 MB totali
│   │
│   ├── 📁 db-daily/        ✅ CREATA 2026-04-10 — backup giornaliero automatico
│   │   ├── 20260504213620/  (oggi 21:36, manuale) — 15 file, ~36 MB ✓
│   │   ├── 20260504211244/  (oggi 21:12, manuale) — 15 file, ~36 MB ✓ DUPLICATO
│   │   ├── 20260504211019/  (oggi 21:10, manuale) — 15 file, ~36 MB ✓ DUPLICATO
│   │   ├── 20260504210534/  (oggi 21:05, manuale) — 15 file, ~36 MB ✓ DUPLICATO
│   │   ├── 20260504_033001/ (oggi 03:30, cron)    — 7 file da 4096 byte ⚠️ CRON FALLITO
│   │   ├── 20260503_033001/ (3/5 03:30, cron)     — 7 file da 4096 byte ⚠️ CRON FALLITO
│   │   ├── 20260502_033001/ (2/5 03:30, cron)     — 7 file, ~36 MB ✓ (script vecchio, vedi A7)
│   │   ├── 20260501_033001/ (1/5 03:30, cron)     — 7 file ✓ (script vecchio)
│   │   ├── 20260430_033001/ (30/4 03:30, cron)    — 7 file ✓ (script vecchio)
│   │   ├── 20260429_033002/ (29/4 03:30, cron)    — 7 file ✓ (script vecchio)
│   │   └── 20260428_033001/ (28/4 03:30, cron)    — 7 file ✓ (script vecchio)
│   │
│   ├── 📁 app-code/        ⚠️ ORFANA — snapshot codebase di MARZO, non aggiornata
│   │   ├── 📁 app/         (Python: routers, services, models, migrations, repositories, sql, schemas, core)
│   │   │   └── 📁 data/    (foodcost.db marzo + 4 sqlite3 + 4 json + cartella backups/)
│   │   │       └── 📁 backups/  (6 file: vini_magazzino_*.sqlite3 + vini_settings_*.sqlite3, marzo 2026)
│   │   └── 📁 scripts_backup_20251201-211601/ (1 file: deploy.sh)
│   │
│   ├── 📁 scripts/         ⚠️ VECCHI — marzo 2026 (backup.sh, push.sh, setup-backup-and-security.sh)
│   │
│   └── 📄 2026-03-20_1337.tar.gz  (1 MB, marzo, orfano)
│
├── 📁 trgb-backups/        ⚠️ ISOLATA in root, FUORI dalla struttura TRGB-Backup
│   └── 📄 pre-upgrade-noble-20260427-2350.tar.gz  (604 MB, 27/4)
│
└── 📊 TreGobbi ft.n. 1733.xlsx  (2017, fattura — non c'entra coi backup)
```

---

## 2. Anomalie identificate

### 🔴 A1 — Detriti dell'incidente S60-INC1 (3-4 maggio mattina)
**Cosa**: le cartelle `20260503_033001/` e `20260504_033001/` contengono 7 file SQLite di **4096 byte ciascuno** (solo header SQLite, nessun contenuto).

**Causa (NOTA)**: NON è cron failure. È la scia documentata in `docs/problemi.md` come **S60-INC1** — il backend zombie restato 36h con `locale_data_path` fallback ha svuotato i SQLite sul VPS. Il cron `backup_db.sh` ha fatto correttamente il suo lavoro: ha copiato fedelmente quello che trovava nel SOURCE, ovvero stub da 4096 byte. Bug di stato del DB sorgente, non del backup.

**Stato fix**: già risolto. Il nuovo `backup_db.sh` v2 (attualmente in `db-runbook/scripts/`) introduce **integrity check sul SOURCE prima del copy**: se un DB sorgente è stub, va in `RUN_FAILED` e non produce cartella su Drive. Quindi questa anomalia non si ripeterà.

**Azione consigliata Drive**: eliminare le 2 cartelle stub — sono detriti dell'incidente, non recuperi utilizzabili.

### 🟡 A2 — Quattro backup nello stesso 31 minuti (oggi 21:05-21:36)
**Cosa**: dentro `db-daily/` ci sono 4 cartelle di backup completo create oggi tra le 21:05:34 e le 21:36:20. Stessi 14 file, dimensioni identiche, modifiedTime identici → contenuto identico × 4. Spreco: 3 × 36 MB = ~108 MB.

**Probabile causa**: Marco stava testando o impostando manualmente il sistema (oggi è il giorno della riorganizzazione `db-runbook/` + `db-lkg/`).

**Azione consigliata**: tenere solo l'ultima delle 4 (`20260504213620`). Le 3 precedenti sono sicuramente sostituibili dato che `db-lkg/` contiene già lo stato delle 19:36.

### 🟡 A3 — Cartella `app-code/` orfana (snapshot codebase marzo)
**Cosa**: copia della codebase Python di marzo 2026 dentro `TRGB-Backup/app-code/` con sotto-cartelle `app/{routers,services,models,migrations,repositories,sql,schemas,core,data/}` + `scripts_backup_20251201-211601/`.

**Diagnosi**: codice di marzo, non più aggiornato. La codebase reale vive sul VPS e nel repo locale `/Users/underline83/trgb`. Tenerlo qui non è un backup della codebase (è solo uno snapshot scaduto).

**Azione consigliata**: archiviare in un .tar.gz unico ("snapshot-codebase-20260320.tar.gz") o eliminare. Non perde nulla — il codice attuale è altrove.

### 🟡 A4 — Cartella `scripts/` vecchia + tar.gz `2026-03-20_1337.tar.gz` orfani in root di TRGB-Backup
**Cosa**: 3 script di marzo (`backup.sh`, `push.sh`, `setup-backup-and-security.sh`) e un tar di 1 MB del 20 marzo, fuori da qualunque sotto-cartella organizzata.

**Diagnosi**: pre-riorganizzazione di oggi. La nuova `db-runbook/scripts/` ha le versioni aggiornate.

**Azione consigliata**: spostare in archivio o eliminare.

### 🟡 A5 — `trgb-backups/` (in root del Drive) separata da `TRGB-Backup/`
**Cosa**: cartella `trgb-backups/` nominata in lower-case, parallela a `TRGB-Backup/` nella root del Drive, contiene solo `pre-upgrade-noble-20260427-2350.tar.gz` (604 MB).

**Diagnosi**: 2 cartelle "TRGB" nella root creano confusione e dispersione. Il tar pre-upgrade Noble è prezioso (snapshot pre-OS-upgrade) ma starebbe meglio dentro `TRGB-Backup/snapshots-server/` o simile.

**Azione consigliata**: spostare il tar dentro `TRGB-Backup/` (es. nuova sottocartella `snapshots-server/`) e cancellare la cartella `trgb-backups/` vuota.

### 🟢 A6 — `TreGobbi ft.n. 1733.xlsx` (2017) in root
**Cosa**: fattura del 2017 in root del Drive, sopravvissuta. Niente a che fare coi backup.

**Azione consigliata**: lasciare stare — è un documento storico, decide Marco se vuole archiviarlo separato.

### 🟡 A7 — Backup script aggiornato oggi: cron giornaliero ancora con la versione vecchia
**Cosa**: confronto tra backup vecchi (cron 28/4-2/5) e backup nuovi (manuali di stasera + db-lkg):

| File | cron 28/4-2/5 | manuale 4/5 sera + db-lkg |
|---|:---:|:---:|
| `foodcost.db` | ✓ | ✓ |
| `clienti.sqlite3` | ✓ | ✓ |
| `dipendenti.sqlite3` | ✓ | ✓ |
| `vini_magazzino.sqlite3` | ✓ | ✓ |
| `vini_settings.sqlite3` | ✓ | ✓ |
| `vini.sqlite3` | ✓ | ✓ |
| `admin_finance.sqlite3` | ✓ | ✓ |
| `bevande.sqlite3` | — | ✓ NUOVO |
| `tasks.sqlite3` | — | ✓ NUOVO |
| `notifiche.sqlite3` | — | ✓ NUOVO |
| `closures_config.json` | — | ✓ NUOVO |
| `modules.json` | — | ✓ NUOVO |
| `modules.runtime.json` | — | ✓ NUOVO |
| `modules.runtime.meta.json` | — | ✓ NUOVO |
| `users.json` | — | ✓ NUOVO |

Il cron giornaliero (`backup_db.sh` versione che ha girato fino al 2/5) salva **solo i 7 DB core**. Lo script aggiornato di oggi salva **15 file**, includendo bevande, tasks, notifiche e i config JSON.

**Diagnosi**: Marco oggi ha aggiornato `backup_db.sh` ma il cron sul VPS sta ancora puntando alla versione vecchia (oppure il deploy del nuovo script al VPS non è ancora avvenuto). Se domani il cron 03:30 parte con la versione nuova in produzione, il backup di domani sarà completo a 15 file.

**Azione consigliata**: verificare che il `backup_db.sh` aggiornato sia stato copiato sul VPS e che il cron lo trovi al path giusto. Domani 5/5 alle 03:30 il primo cron della versione nuova ci dirà se è OK. Lato Drive: nulla da fare.

---

## 3. Stima spazio occupato e recuperabile

| Sezione | Stato | Dimensione stimata |
|---|---|---:|
| `db-daily/` 9 backup buoni (28/4-2/5 + oggi 21:36) | mantenere | ~324 MB |
| `db-daily/` 3 backup duplicati di oggi (21:05/21:10/21:12) | **eliminabili** | ~108 MB |
| `db-daily/` 2 cartelle cron rotto (3 e 4 mattina) | **eliminabili** | ~56 KB |
| `db-lkg/` Last Known Good | mantenere | ~36 MB |
| `trgb-backups/pre-upgrade-noble-...tar.gz` | da spostare | 604 MB |
| `TRGB-Backup/2026-03-20_1337.tar.gz` (marzo) | **eliminabile** | 1 MB |
| `TRGB-Backup/scripts/` (marzo) | **eliminabile** | ~10 KB |
| `TRGB-Backup/app-code/` (marzo, codebase + DB marzo + backup vini marzo) | **eliminabile** | ~30-40 MB stimato |
| `db-runbook/docs/` (~70 .md) | mantenere | ~1.5 MB |
| `db-runbook/scripts/` | mantenere | ~70 KB |
| `db-runbook/locali/{trgb,tregobbi}/` (R1 monorepo) | mantenere | ~30 KB |
| **TOTALE STIMATO ATTUALE** | | **~1.0 GB** |
| **RECUPERABILE con pulizia conservativa (P1+P2+P3)** | | **~150 MB** |

---

## 4. Proposta di pulizia (per gruppi, da approvare)

Marco approva singolarmente ciascun gruppo. Niente parte senza un OK esplicito.

### Gruppo P1 — Eliminazione duplicati di oggi (rischio: nullo)
Eliminare 3 delle 4 cartelle backup di stasera, tenendo l'ultima:
- ❌ `db-daily/20260504210534/` (14 file)
- ❌ `db-daily/20260504211019/` (14 file)
- ❌ `db-daily/20260504211244/` (14 file)
- ✅ `db-daily/20260504213620/` (la più recente — TENERE)

Rationale: stesso contenuto, già coperto da `db-lkg/`. Recuperati ~108 MB.

### Gruppo P2 — Eliminazione backup cron rotti (rischio: nullo)
- ❌ `db-daily/20260504_033001/` (7 file da 4096 byte)
- ❌ `db-daily/20260503_033001/` (7 file da 4096 byte)

Rationale: dump troncati, non recuperabili. Da indagare separatamente in VPS perché il cron `backup_db.sh` è fallito due giorni di fila.

### Gruppo P3 — Archiviazione roba vecchia di marzo (rischio: basso)
- ❌ `TRGB-Backup/2026-03-20_1337.tar.gz` (1 MB, marzo)
- ❌ `TRGB-Backup/scripts/` (3 script marzo, sostituiti da `db-runbook/scripts/`)
- ❌ `TRGB-Backup/app-code/` intera (codebase marzo, ~50-100 MB)
  - **prima** valutare se Marco vuole conservare uno snapshot. Opzione: archiviare in unico tar.gz `app-code-20260320.tar.gz` e tenere quello.

### Gruppo P4 — Consolidamento root del Drive (rischio: nullo, solo riorganizzazione)
- 📦 Spostare `trgb-backups/pre-upgrade-noble-20260427-2350.tar.gz` dentro `TRGB-Backup/snapshots-server/` (cartella nuova da creare).
- ❌ Eliminare la cartella vuota `trgb-backups/`.

Rationale: una sola cartella "TRGB" in root del Drive. La cartella `snapshots-server/` accoglie in futuro altri tar pre-upgrade del VPS.

### Gruppo P5 — Retention policy futura (proposta, da decidere)
Per evitare crescita illimitata di `db-daily/`, suggerimento di policy:
- mantenere ultimi 7 giorni in `db-daily/`
- 4 backup mensili (uno al mese a fine mese)
- snapshot pre-upgrade in `snapshots-server/` con nome esplicito

Implementazione: aggiungere un blocchetto a `db-runbook/scripts/check_backup_health.sh` che cancella le cartelle `db-daily/AAAAMMGG_*` più vecchie di 7 giorni e che NON sono "fine mese". Da fare in una sessione dedicata, non oggi.

---

## 5. Cose che NON vanno toccate (ricapitolo)

- ✅ `TRGB-Backup/db-runbook/docs/` — documentazione progetto attiva
- ✅ `TRGB-Backup/db-runbook/scripts/` — script backup correnti
- ✅ `TRGB-Backup/db-runbook/locali/{trgb,tregobbi}/` — seed monorepo R1
- ✅ `TRGB-Backup/db-lkg/` — Last Known Good
- ✅ Backup giornalieri buoni in `db-daily/` (28/4-2/5 + ultimo di oggi)
- ✅ `pre-upgrade-noble-20260427-2350.tar.gz` (solo da spostare, non da eliminare)
- ✅ `TreGobbi ft.n. 1733.xlsx` (documento storico, non backup)

---

## 6. Note di indagine separata

Rinviato a sessione futura (non oggi):

1. **Retention `db-daily/`**: senza policy, in 6 mesi la cartella esploderà. Pianificare gruppo P5.

2. **Naming uniforme cartelle backup**: `backup_db.sh` cron usa `AAAAMMGG_HHMMSS` (underscore), il manuale usa `AAAAMMGGHHMMSS` (senza underscore). Cosa minore, da uniformare quando si tocca lo script.

A1 è stato chiuso da S60-INC1 + `backup_db.sh` v2 con integrity check sul source, non richiede più indagine.
