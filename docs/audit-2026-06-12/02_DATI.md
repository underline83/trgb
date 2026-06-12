# Audit TRGB 2026-06-12 — 02 DATI (integrità 10 DB SQLite)

**Data audit:** 2026-06-12 · **Commit:** `1f5f9c17` · **Versione:** 5.24
**Fonti:** `raw_A2.md` (analisi statica schema/migrazioni), `raw_A2_live.md` (PRAGMA eseguiti dall'orchestratore su copie immutable), verdetti applicati da `99_VERIFICA_AVVERSARIA.md`.
**Dati analizzati:** copie locali in `locali/tregobbi/data/` — ultimo download dal VPS **2026-06-08 23:28** (fotografia dati di 4 giorni prima; schema = produzione al commit `1f5f9c17`). Sul VPS live (raw_A6_live.md): backup status 15/15 OK e LKG odierno sano.

---

## 1. Sintesi area e voto

> ## **Voto area Dati: 72/100**
>
> Criterio: **integrità fisica perfetta** (integrity_check 10/10 ok) e **catena backup sana e verificata live** (15/15 OK, LKG integro, cron attivi) — contro: **drift schema garantito su installazioni fresche** (A2-01, ~40 migrazioni skip-and-register), tabella zombie ricreata a ogni boot con 1.240 FK orfane appese (A2-02), orfani FK reali quantificati in 2 DB su 10, e il debito noto K.12 (doppia tabella corrispettivi) che continua a crescere.

I dati di produzione **oggi sono sani**: nessuna corruzione, nessuno stub, backup funzionanti. I problemi sono strutturali e prospettici: il meccanismo migrazioni produce schema incompleti su ogni installazione nuova (rilevante per il prodotto trgb.it), le FK non sono enforced in modo omogeneo e gli orfani si stanno già accumulando in silenzio.

---

## 2. Integrità per DB — PRAGMA eseguiti (live, copie immutable)

> Il subagente A2 non poteva eseguire sqlite3 (permessi sandbox); l'orchestratore ha copiato i 10 DB in /tmp (copie poi cancellate) e li ha aperti in modalità `immutable=1` (zero scritture, zero -wal/-shm creati).

### PRAGMA integrity_check — ✅ 10/10 DB: **ok**

Risultato POSITIVO da mettere agli atti: admin_finance, bevande, clienti, dipendenti, notifiche, tasks, vini, vini_magazzino, vini_settings, foodcost — **tutti `ok`**. Nessuna corruzione fisica in nessun DB di produzione.

### Validazione header e journal mode (file(1))

| DB | Dimensione | Pagine (4 KB) | Header | Journal mode |
|---|---|---|---|---|
| admin_finance.sqlite3 | 356 KB | 87 | ✅ SQLite 3.x valido | WAL |
| bevande.sqlite3 | 36 KB | 9 | ✅ | WAL |
| clienti.sqlite3 | 26,8 MB | 6548 | ✅ (6548×4096 = size ✓) | WAL |
| dipendenti.sqlite3 | 364 KB | 89 | ✅ | WAL |
| foodcost.db | 8,2 MB | 2004 | ✅ | WAL |
| notifiche.sqlite3 | 159 KB | 39 | ✅ | WAL |
| tasks.sqlite3 | 98 KB | 24 | ✅ | WAL |
| vini.sqlite3 | 806 KB | 197 | ✅ | **legacy/rollback (no WAL)** → A2-13 |
| vini_magazzino.sqlite3 | 2,37 MB | 579 | ✅ | WAL |
| vini_settings.sqlite3 | 65 KB | 16 | ✅ | WAL |

Nessun file stub da 4096 byte (il sintomo di S60-INC1): tutte le dimensioni coerenti col page count.

### PRAGMA foreign_key_check — violazioni in 2 DB su 10

**foodcost.db — 1.305 violazioni:**

| Tabella figlia | Parent mancante | Righe orfane |
|---|---|---|
| `ipratico_product_map` | `vini_magazzino` | **1.240** |
| `cg_entrate` | `banca_movimenti` | **65** |

- Le 1.240 di `ipratico_product_map` puntano alla **tabella zombie `vini_magazzino`** (ricreata VUOTA a ogni boot post-cutover mig 133 → A2-02): la mappa iPratico→vini referenzia id che non esistono più (i dati vivi sono in `vini_bottiglie` di vini_magazzino.sqlite3).
- Le 65 di `cg_entrate` → `banca_movimenti`: incassi CG che puntano a movimenti banca cancellati/reimportati — conferma materiale del rischio orfani di A2-04. FK non enforced ⇒ nessun errore runtime, ma **i JOIN perdono righe in silenzio**.

**vini_magazzino.sqlite3 — 57 violazioni:**

| Tabella figlia | Parent mancante | Righe orfane |
|---|---|---|
| `vini_magazzino_movimenti` | `vini_magazzino_legacy_20260518` | 28 |
| `vini_prezzi_storico` | `vini_magazzino_legacy_20260518` | 28 |
| `matrice_celle` | `vini_magazzino_legacy_20260518` | 1 |

FK dichiarate verso la tabella archivio legacy del cutover 18/05 — residuo del rename, da bonificare in una migrazione di pulizia FK.

### Numeri di supporto (live)
- `fe_righe`: **11.392 righe**, `fe_fatture`: 1.573. **Zero indici** su `fe_righe` (`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='fe_righe'` → vuoto) → conferma definitiva di A2-03/A7-02.
- `daily_closures`: **2.191 righe** (max date 2026-12-31 — include calendario futuro), `shift_closures`: **168** (max 2026-06-08) → entrambe le tabelle K.12 vive (vedi §5).

---

## 3. Migrazioni — file vs `schema_migrations`

- File in `app/migrations/`: **150 file numerati `.py`** (numeri 001–146, senza 006 che è `.sql`, con **5 numeri duplicati**: 129, 130, 131, 133, 134) + `migration_runner.py` + `006_fe_import_fatture.sql`.
- `schema_migrations`: registrate **tutte le 150 migrazioni .py**, comprese entrambe le metà di ogni coppia duplicata (129_conto_economico_fase_a + 129_movimenti_prezzo_unitario, 130_×2, 131_×2, 133_×2, 134_×2).
- **Registrate ma file mancante: nessuna.**
- **File mai registrato: solo `006_fe_import_fatture.sql`** — il runner considera solo `.py` (`migration_runner.py:118`); le tabelle `fe_fatture`/`fe_righe` sono coperte dal self-heal di `app/routers/fe_import.py` (CREATE IF NOT EXISTS). Vedi A2-08.
- Il runner usa il **filename completo come chiave** (`migration_runner.py:80,124`), quindi i duplicati non causano doppia esecuzione; l'ordinamento intra-numero è alfabetico (deterministico ma concettualmente arbitrario). Stato: **noto** (audit 2026-05-19 segnalava 129/130/131/133); **nuova coppia 134** comparsa dopo. Vedi A2-06.
- Regola "solo ADD COLUMN nullable + backfill": violazioni storiche deliberate con safety net (133 cutover RENAME con archivio legacy + endpoint rollback; 138 rebuild `ingredient_prices` guardato e idempotente; 111/112/125/126/128 rebuild dichiarati). Incidente noto **CC.5.a / mig 142** (`ADD COLUMN NOT NULL DEFAULT` → NULL su righe esistenti): **safety net mig 143 presente e verificata idempotente** (COALESCE, no-op se già fixato). Lo stesso pattern `NOT NULL DEFAULT` esiste anche in 030/085/087/093/106 (storiche, nessun sintomo noto).
- **Pattern critico skip-and-register**: ~40 migrazioni cross-DB fanno "skip se DB/tabella mancante" ma vengono comunque registrate come applicate → **A2-01 (HIGH, confermato da verifica avversaria)**.

---

## 4. Inventario tabelle per DB (sqlite_master) e conformità prefissi

- **admin_finance.sqlite3** (modulo cassa): `daily_closures`, `shift_closures`, `shift_preconti`, `shift_spese`, `shift_checklist_config`, `shift_checklist_responses`, `cash_deposits`, `cash_expenses`, `cash_expense_categories`, `cash_opening_balance`, `cash_flow_baseline`, `cash_spese_baseline`. Nessuna col prefisso `cassa_` → storiche pre-regola (LOW).
- **bevande.sqlite3**: `bevande_sezioni`, `bevande_voci` — prefisso coerente ✅.
- **clienti.sqlite3**: 15 tabelle `clienti_*` ✅ + `tavoli`, `tavoli_combinazioni`, `tavoli_layout`, `prenotazioni_config`, `prenotazioni_email_log` (modulo prenotazioni, senza prefisso unico — storiche).
- **dipendenti.sqlite3**: `dipendenti*` ✅ + `buste_paga`, `reparti`, `assenze`, `turni_tipi`, `turni_calendario`, `turni_template`, `turni_template_righe`, `prestazioni_occasionali_log` (senza prefisso `dipendenti_` — storiche).
- **foodcost.db**: ~75 tabelle di **almeno 8 moduli diversi**: ricette (`recipes*`, `ingredients*`, `suppliers`), acquisti (`fe_*`), CG (`cg_*`, `f24_versamenti`, `condizioni_pagamento_preset`), banca (`banca_*`, `carta_*`, `carte_credito`, `finanza_*` legacy), cassa/statistiche (`ipratico_*`), menu_carta (`menu_*`), pranzo (`pranzo_*`) ✅, lista_spesa ✅, selezioni giorno (`macellaio_*`, `salumi_*`, `formaggi_*`, `pescato_*`, `piatti_giorno*`), platform (`home_actions`, `schema_migrations`). Concentrazione cross-modulo in un solo DB: tema R8, non bug.
- **notifiche.sqlite3**: `notifiche*`, `comunicazioni*`, `alert_config` — platform, OK.
- **tasks.sqlite3**: `checklist_template/item/instance/execution`, `task_singolo`, `task_alert_log` — la regola direbbe `tasks_*`: nessuna conforme (storiche, LOW).
- **vini.sqlite3**: `vini`, `vini_movimenti`, `vini_note`, **`vini_raw`** (legacy, rimossa dall'uso in vini_router ma tabella ancora nel DB).
- **vini_magazzino.sqlite3**: `vini_bottiglie/madre/denominazioni/produttori/fornitori/vitigni` (v2 live) ✅, `vini_magazzino_movimenti/note`, `vini_ordini_pending`, `vini_prezzi_storico`, `locazioni_config`, `matrice_celle` + **`vini_magazzino` (zombie → A2-02)** + **`vini_magazzino_legacy_20260518`** (archivio safety-net mig 133, da pulire a verifica conclusa).
- **vini_settings.sqlite3**: `codici_order`, `filtri_carta`, `formati_order`, `markup_breakpoints`, `nazioni_order`, `regioni_order`, `tipologia_order`, `vini_widget_settings` — quasi tutte senza prefisso `vini_` (storiche, LOW).

---

## 5. Doppia tabella corrispettivi (K.12) — stato reale verificato

- **Entrambe le tabelle esistono e sono attivamente scritte** — quantificato live: `daily_closures` **2.191 righe** (max date 2026-12-31, include calendario futuro), `shift_closures` **168 righe** (max 2026-06-08).
  - `daily_closures`: scritta da `app/routers/admin_finance.py:476,522,650` (edit manuale) e `app/services/corrispettivi_import.py:293,312` (import Excel) + `app/services/admin_finance_db.py:128,149`.
  - `shift_closures`: scritta da `app/routers/chiusure_turno.py:1161,1204` (chiusure turno staff).
- Lettori con merge: `app/services/vendite_aggregator.py` (shift primario, daily fallback, righe 5–11) e `corrispettivi_export.py` (`_merge_shift_and_daily`); `dashboard_router.py` e `controllo_gestione_router.py` leggono entrambe.
- La **divergenza cresce**: mig 146 (`146_cassa_annulli_resi.py:16`) ha dovuto aggiungere `annulli_resi` a ENTRAMBE, con doppio self-heal (`admin_finance.py:55-60` e `chiusure_turno.py:98-99`).
- Vincolo che complicherà K.12: `shift_closures` ha `CHECK (turno IN ('pranzo','cena'))` nel CREATE (verificato in sqlite_master) → il valore `turno='giornaliero'` previsto da roadmap §K.12 punto 1 **richiede rebuild della tabella** (un CHECK non si modifica con ALTER).
- **Stato: noto, aperto** — roadmap.md:198-216, priorità 🔴 ALTA decisa da Marco 2026-05-21, non ancora implementata. → A2-05.

---

## 6. Finding

```
[A2-01] SEVERITÀ: HIGH — ✅ CONFERMATO da verifica avversaria
Titolo: ~40 migrazioni cross-DB "skip se DB/tabella mancante" vengono comunque registrate come applicate → drift schema permanente su installazioni fresche/recovery
Evidenza: migration_runner.py:71-89 — apply_migration() esegue upgrade(conn) e poi INSERISCE SEMPRE in schema_migrations (l'unico caso di non-registrazione è un'eccezione). Esempi: 134_dipendenti_is_amministratore.py:51-53 ("dipendenti.sqlite3 non trovato — skip" + return → registrata), 081_dipendenti_nickname.py:27-29. Pattern "skip" presente in 66 file migrazione (verifica avversaria; ~40 con skip cross-DB effettivo: 050,060,068,070-081,083-088,096-097,118,121-134,139,146...). Ordine di boot confermato: main.py:202 run_migrations() PRIMA della creazione tabelle nei modelli → su data/ vergine i DB secondari non esistono ancora → skip sistematico. Controprova self-heal: grep nickname|is_amministratore su app/models/dipendenti_db.py = 0 → le colonne non arriverebbero mai.
Impatto: su istanza prodotto pulita (locali/trgb) o dopo disaster recovery con DB ricreati vuoti (successo davvero con tasks/bevande post S60-INC1), le colonne aggiunte da quelle migrazioni non arriveranno MAI (es. dipendenti.nickname, dipendenti.is_amministratore non sono nemmeno nel self-heal di dipendenti_db.py). Endpoint che le selezionano → 500.
Fix proposto: il runner non deve registrare una migrazione il cui upgrade() segnala skip (es. return "SKIPPED" / eccezione dedicata), oppure portare TUTTE le colonne cross-DB nei self-heal dei modelli. Test: boot su cartella data/ vuota e diff schema vs produzione. — Effort: M
Modulo: platform (migrazioni)
```

```
[A2-02] SEVERITÀ: MED — ✅ CONFERMATO da verifica avversaria + quantificato live
Titolo: Tabella zombie `vini_magazzino` ricreata vuota a ogni boot dopo il cutover v2 (mig 133) — con 1.240 FK orfane appese
Evidenza: app/models/vini_magazzino_db.py:111-287 — init_magazzino_database() fa ancora CREATE TABLE IF NOT EXISTS vini_magazzino + 4 CREATE INDEX idx_vm_* + blocchi ALTER, ed è chiamata a ogni boot (vini_magazzino_router.py:283, a import del router). Nel DB convivono: vini_magazzino (ricreata, vuota — grep "FROM|INTO|UPDATE|JOIN vini_magazzino " = 0 usi applicativi, verificato anche dalla verifica avversaria), vini_bottiglie (live, con indici idx_vb2_*) e vini_magazzino_legacy_20260518. Gli indici idx_vm_* reali sono rimasti attaccati alla tabella legacy (sqlite_master: "CREATE INDEX idx_vm_tipologia ON vini_magazzino_legacy_20260518"), quindi i CREATE INDEX del boot no-op-pano per collisione di nome.
QUANTIFICAZIONE LIVE (raw_A2_live.md): PRAGMA foreign_key_check su foodcost.db trova **1.240 righe di `ipratico_product_map` con FK verso la zombie `vini_magazzino`** — la mappa iPratico→vini referenzia id che non esistono più nella tabella vuota (i dati vivi sono in vini_bottiglie).
Impatto: DDL su sqlite_master a ogni boot — esattamente il pattern indicato come rischioso nella RCA S52-1 (problemi.md:117,141); 1.240 mapping iPratico di fatto pendenti nel vuoto; schema confondente; docstring stale (es. vini_magazzino_db.py:2814 dice "join con vini_magazzino" ma il codice usa vini_bottiglie).
Fix proposto: rimuovere il CREATE/INDEX/ALTER legacy da init_magazzino_database() (o guard "SELECT 1 FROM sqlite_master" come già fatto per vini_prezzi_storico a riga 444-455); migrazione di pulizia per droppare la vini_magazzino vuota e ri-puntare/bonificare le 1.240 righe di ipratico_product_map. — Effort: S
Modulo: vini
```

```
[A2-03] SEVERITÀ: MED — confermato live (zero indici, 11.392 righe)
Titolo: Indice mancante su fe_righe(fattura_id) — la colonna di join/filtro più usata del DB più grande
Evidenza: sqlite_master di foodcost.db: fe_righe ha SOLO l'indice implicito della PK. LIVE: `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='fe_righe'` → vuoto; fe_righe = **11.392 righe**, fe_fatture = 1.573. Le query usano sistematicamente fattura_id, incluse subquery correlate negli elenchi: "(SELECT COUNT(*) FROM fe_righe r WHERE r.fattura_id = f.id) AS n_righe" (fe_import.py:962, fattureincloud_router.py). La FOREIGN KEY in SQLite NON crea indice.
Impatto: full scan di 11.392 righe per OGNI fattura in lista (limit default 500) → elenchi fatture O(N×M), ~5,7M confronti di riga per un load. Peggiorerà linearmente con l'import di nuovi anni. (Stesso oggetto di A7-02, confermato HIGH in area performance.)
Fix proposto: migrazione idempotente "CREATE INDEX IF NOT EXISTS idx_fe_righe_fattura ON fe_righe(fattura_id)". — Effort: S
Modulo: acquisti
```

```
[A2-04] SEVERITÀ: MED — quantificato live: 65 orfani reali
Titolo: PRAGMA foreign_keys disomogeneo tra connessioni + merge FIC/XML che cancella fe_fatture senza riallineare cg_uscite.fattura_id → righe orfane (non più solo rischio: censite)
Evidenza: fattureincloud_router.py:49 (sqlite3.connect senza alcun PRAGMA foreign_keys) e fe_import.py:51-54 (WAL+busy_timeout ma niente FK ON), mentre foodcost_db.py:41, banca_router.py:45, controllo_gestione_router.py:41 ecc. mettono FK ON. Nel merge duplicati FIC/XML (fattureincloud_router.py:291-308) il record XML viene cancellato (DELETE FROM fe_fatture WHERE id=?, riga 307) spostando le fe_righe (294-297) ma SENZA aggiornare eventuali cg_uscite.fattura_id che puntavano all'id XML; con FK OFF su quella connessione il delete passa comunque.
QUANTIFICAZIONE LIVE (raw_A2_live.md): PRAGMA foreign_key_check censisce **65 righe `cg_entrate` → `banca_movimenti` orfane** in foodcost.db (incassi CG che puntano a movimenti banca cancellati/reimportati) + **57 violazioni in vini_magazzino.sqlite3** (28 vini_magazzino_movimenti + 28 vini_prezzi_storico + 1 matrice_celle, tutte con FK verso la tabella archivio vini_magazzino_legacy_20260518 — residuo del rename del cutover 18/05).
Impatto: orfani REALI già presenti, non più teorici: FK non enforced ⇒ nessun errore runtime, ma i JOIN perdono righe silenziosamente (incassi che spariscono dai report incrociati CG↔banca). Comportamento FK non deterministico a seconda di quale router tocca il dato; la FK fe_righe ON DELETE CASCADE è di fatto decorativa sulle connessioni senza pragma.
Fix proposto: helper di connessione unico per foodcost.db (FK ON ovunque); nel merge FIC riallineare anche cg_uscite.fattura_id; bonifica una tantum dei 65 orfani cg_entrate + migrazione di pulizia FK in vini_magazzino (ri-puntare le FK da _legacy a vini_bottiglie o droppare i vincoli stale). — Effort: M
Modulo: acquisti / controllo_gestione (+ vini per le 57 FK legacy)
```

```
[A2-05] SEVERITÀ: MED — noto, stato: aperto (roadmap.md:198, 🔴 ALTA, deciso 2026-05-21)
Titolo: K.12 doppia tabella corrispettivi daily_closures/shift_closures — divergenza in crescita, CHECK che bloccherà turno='giornaliero'
Evidenza: vedi §5. Live: daily_closures 2.191 righe / shift_closures 168, entrambe scritte attivamente (admin_finance.py:476,522,650 + corrispettivi_import.py:293,312 su daily; chiusure_turno.py:1161,1204 su shift). Mig 146 ha dovuto toccare entrambe (doppio self-heal). CHECK (turno IN ('pranzo','cena')) nel CREATE di shift_closures in sqlite_master.
Impatto: ogni feature cassa nuova va implementata due volte (annulli_resi docet); i lettori dipendono da logiche di merge duplicate (vendite_aggregator + _merge_shift_and_daily); il CHECK obbliga a un rebuild di shift_closures per la convenzione 'giornaliero' della migrazione storico.
Fix proposto: eseguire K.12 come da roadmap §K.12 (già deciso); in fase di rebuild per iva_10/iva_22 ampliare il CHECK a 'giornaliero'. — Effort: L
Modulo: cassa
```

```
[A2-06] SEVERITÀ: LOW — noto (audit 2026-05-19) per 129-133, stato: persiste; coppia 134 nuova
Titolo: Numerazioni migrazioni duplicate: 129/130/131/133 (note) + NUOVA coppia 134
Evidenza: ls app/migrations/: 134_dipendenti_is_amministratore.py E 134_riallinea_giacenze_da_legacy.py (oltre alle 4 coppie già note). Tutte e 10 le metà risultano registrate in schema_migrations (§3).
Impatto: nessun malfunzionamento oggi (chiave = filename completo), ma l'ordine di esecuzione intra-numero è alfabetico e quindi accidentale; rischio collisione mentale/merge per le prossime migrazioni.
Fix proposto: vietare nuovi duplicati (check in push.sh guardiano L1: "due file con lo stesso NNN" → warning); non rinumerare i file già applicati. — Effort: S
Modulo: platform
```

```
[A2-07] SEVERITÀ: LOW
Titolo: File -wal/-shm e .fuse_hidden orfani in locali/tregobbi/data/ più vecchi dei DB scaricati
Evidenza: ls -la locali/tregobbi/data/: foodcost.db-wal (0 B, 2/6), foodcost.db-shm (32 KB, 7/6), admin_finance.sqlite3-wal (0 B, 8/6 22:37) contro DB scaricati 8/6 23:28; + 4 file .fuse_hidden00000007*/0c* (2/6–8/6). Tutti git-ignorati (.gitignore:189 "locali/*/data/*"), quindi nessun rischio commit.
Impatto: igiene locale: un client SQLite locale aperto in r/w su quei DB può incontrare WAL stantio non appartenente al file principale appena scaricato (lezione 4 di S60-INC1/S52-1: WAL e file principale disallineati). I .fuse_hidden indicano file cancellati mentre erano ancora aperti da un processo (probabile mount FUSE di push.sh).
Fix proposto: push.sh, dopo il download dei DB dal VPS, cancella eventuali *.sqlite3-wal/-shm/.db-wal/-shm e .fuse_hidden* locali. — Effort: S
Modulo: infra
```

```
[A2-08] SEVERITÀ: LOW
Titolo: 006_fe_import_fatture.sql mai eseguita dal runner (file morto)
Evidenza: migration_runner.py:117-118 filtra solo f.endswith(".py"); schema_migrations non contiene alcuna voce 006_* (si passa da 005_add_order_inderx a 007_foodcost_v2). Le tabelle che definisce sono coperte dal self-heal di fe_import.py (CREATE TABLE IF NOT EXISTS fe_fatture/fe_righe).
Impatto: nessuno funzionale; confonde l'inventario migrazioni (un numero "fantasma").
Fix proposto: rimuovere il file o convertirlo in commento storico dentro un README delle migrazioni. — Effort: S
Modulo: acquisti
```

```
[A2-09] SEVERITÀ: LOW
Titolo: Prefissi tabelle non conformi alla regola 3 (tabelle storiche pre-regola) e foodcost.db cross-modulo
Evidenza: inventario completo in §4. Casi principali: admin_finance (shift_*/cash_*/daily_closures senza prefisso cassa_), tasks.sqlite3 (checklist_*/task_singolo senza tasks_), dipendenti (buste_paga, reparti, turni_*, assenze), clienti (tavoli*, prenotazioni_*), vini_settings (codici_order, filtri_carta, ...), foodcost.db che ospita tabelle di ≥8 moduli.
Impatto: nessun bug; attrito per R8 (module_loader e manifesti module.json dovranno mappare nomi storici → modulo, non potranno dedurli dal prefisso).
Fix proposto: nessun rename su DB live (vietato da regole R). In R8 ogni module.json elenchi esplicitamente le proprie tabelle, prefisso o no. — Effort: S (documentale)
Modulo: platform/R8
```

```
[A2-10] SEVERITÀ: LOW
Titolo: Tabelle archive/legacy residue nei DB di produzione
Evidenza: sqlite_master: foodcost.db → fe_fatture_archive_109, fe_fatture_archive_110, cg_uscite_archive_110, cg_uscite_audit_063; vini_magazzino.sqlite3 → vini_magazzino_legacy_20260518 (safety net mig 133/134, referenziata solo da migrazioni — e dalle 57 FK stale censite live, vedi A2-04); vini.sqlite3 → vini_raw (vini_router.py:15 dichiara "CLEAN: rimosso uso di tabella vini_raw").
Impatto: spazio e rumore schema; per legacy_20260518 era pianificato ("si elimina solo dopo verifica conteggi" — pattern roadmap); a oggi nessuna scadenza fissata.
Fix proposto: dopo verifica (conteggi vini_bottiglie vs legacy ok da settimane), migrazione di DROP esplicita e dichiarata, in sessione dedicata — coordinata con la bonifica FK di A2-04. — Effort: S
Modulo: vini / acquisti / controllo_gestione
```

```
[A2-11] SEVERITÀ: LOW — noto (CC.5.a), stato: chiuso con mig 143
Titolo: Incidente mig 142 (ADD COLUMN NOT NULL DEFAULT → NULL) — safety net 143 verificata presente e idempotente
Evidenza: 142_carta_match_settings_cc.py:30-37 (pattern incriminato), 143_carta_match_settings_backfill.py:28-34 (UPDATE COALESCE idempotente, guard su esistenza tabella). Lo stesso pattern NOT NULL DEFAULT esiste anche in 030, 085, 087, 093, 106 (storiche, nessun sintomo noto, già applicate ovunque).
Impatto: nessuno residuo su tregobbi (fix manuale VPS + 143); il pattern resta vietato per il futuro.
Fix proposto: nessuno sul DB; aggiungere al guardiano L1 un grep bloccante su "ADD COLUMN.*NOT NULL" nei nuovi file migrazione. — Effort: S
Modulo: banca
```

```
[A2-12] SEVERITÀ: LOW
Titolo: dashboard_router legge la tabella legacy finanza_movimenti — freschezza dei dati da verificare
Evidenza: dashboard_router.py:1357-1367 (SELECT su finanza_movimenti con commento "il DB reale è finanza_movimenti ... con dare/avere/data"); le tabelle finanza_* (mig 015-019) non risultano scritte da nessun router attuale (grep: solo dashboard_router in lettura + migrazioni).
Impatto: se l'import che popolava finanza_movimenti è stato dismesso a favore di banca_movimenti, il widget dashboard collegato mostra dati fermi.
Fix proposto: verificare MAX(data) di finanza_movimenti vs banca_movimenti sul VPS; se stantia, puntare il widget su banca_movimenti e pianificare dismissione finanza_*. — Effort: S
Modulo: banca / statistiche
```

```
[A2-13] SEVERITÀ: LOW
Titolo: vini.sqlite3 è l'unico DB non in WAL mode
Evidenza: file(1) (§2): tutti i DB riportano "writer version 2, read version 2" (WAL) tranne vini.sqlite3 (header journal legacy/rollback).
Impatto: comportamento di locking diverso dagli altri 9 DB (writer blocca i reader); incoerenza con la policy post-S52-1 che ha standardizzato WAL+synchronous=NORMAL.
Fix proposto: verificare la connessione in vini_model.py/vini router e allineare i PRAGMA (journal_mode=WAL, busy_timeout) come foodcost_db.py:38-40 — solo se il modulo vini.sqlite3 è ancora attivo. — Effort: S
Modulo: vini
```

```
[A2-14] SEVERITÀ: LOW
Titolo: Messaggio dei trigger di guardia su cg_uscite.stato punta a un file inesistente
Evidenza: trigger trg_cg_uscite_stato_valido_insert/update presenti in sqlite_master (creati da mig 117) con messaggio "usare STATI_VALIDI in app/services/stati_pagamento.py" — il file reale è app/services/fatture_stato_service.py (e i suoi STATI_VALIDI riguardano fe_fatture.stato_pagamento minuscoli, non l'enum maiuscolo di cg_uscite). NB: stati_pagamento.py esiste ma non è importato da nessuno (vedi A3-01 in 03_BACKEND.md).
Impatto: cosmetico/diagnostico: chi incontra l'errore viene indirizzato a un path sbagliato.
Fix proposto: nessuna modifica DB necessaria subito; correggere il testo alla prossima migrazione che ricrea i trigger, e documentare in docs/stato_pagamento_unificato.md dove vive l'enum di cg_uscite. — Effort: S
Modulo: controllo_gestione
```

---

## 7. Riepilogo per severità

| Severità | N | Finding |
|---|---|---|
| CRIT | 0 | — |
| HIGH | 1 | A2-01 (confermato) |
| MED | 4 | A2-02 (+1.240 orfani live), A2-03 (confermato live), A2-04 (+65+57 orfani live), A2-05 (noto/K.12) |
| LOW | 9 | A2-06 (noto+nuovo), A2-07, A2-08, A2-09, A2-10, A2-11 (noto/chiuso), A2-12, A2-13, A2-14 |
| **Totale** | **14** | |

**Problemi già noti citati:** S60-INC1 (chiuso con fix 4/5, TODO backup residui — contesto per A2-01/A2-07), S52-1 (chiuso — contesto per A2-02/A2-13), K.12 (aperto — A2-05), duplicati migrazioni 129-133 (audit 2026-05-19 — A2-06), CC.5.a mig 142/143 (chiuso — A2-11).

**Check residui non eseguiti:** misura sovrapposizione daily/shift_closures sulle stesse date (richiede query dedicata); censimento orfani ingredient_prices→ingredients e fe_righe→fe_fatture (il foreign_key_check live non li ha segnalati → presumibilmente puliti, ma le FK su connessioni senza pragma restano non enforced).

**Nota metodo:** il subagente A2 non poteva eseguire sqlite3 (analisi via file/strings/grep in sola lettura, nessun DB del repo aperto con client SQLite); i PRAGMA sono stati eseguiti dall'orchestratore su copie in /tmp aperte `immutable=1`, poi cancellate.
