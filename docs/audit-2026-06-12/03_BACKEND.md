# Audit TRGB 2026-06-12 — 03 BACKEND (qualità codice)

**Data audit:** 2026-06-12 · **Commit:** `1f5f9c17` · **Versione:** 5.24
**Fonti:** `raw_A3.md` (analisi statica), verdetti applicati da `99_VERIFICA_AVVERSARIA.md` (A3-01 confermato; A3-12 SMENTITO e rimosso, vedi §5).

---

## 1. Sintesi area e voto

> ## **Voto area Backend: 74/100**
>
> Criterio: architettura router/servizi solida (51/51 router montati, mattoni M.A/M.C/M.F rispettati ovunque, zero dead router), ma con un HIGH confermato che è un debito di processo (G.8 dichiarato fatto in roadmap ma mai cablato nel codice), ~1.300 righe di dead code che confondono la mappa dei moduli, e una famiglia di problemi sistemici su gestione connessioni SQLite (N+1, conn-per-riga, close fuori da finally, zero rollback nei router soldi).

Il finding in testa è **A3-01**: `stati_pagamento.py`, la single source of truth degli stati pagamento creata per chiudere G.8, **non è importata da nessun file** — le whitelist di stati restano hardcoded in ~10 punti del CG router, esattamente la classe di bug che storicamente ha già causato perdita dati (mig 115 ripara 138 VERIFICARE perse). La roadmap marca G.8 "✅ FATTO": il drift roadmap/codice è reale e confermato dalla verifica avversaria.

Dead code censito: **~1.300 righe** (trio admin_finance_* 603 + liquidita_service 557 + modelli orfani ~122) più gli script one-shot in tools/scripts (noti, T.9).

---

## 2. Metodologia e copertura

- **Router**: 51 file in `app/routers/`. Tutti e 51 verificati per: montaggio in `main.py`, classificazione in `core/moduli/*/module.json`, prefisso e presenza endpoint root `("/")`. Esaminati in dettaglio (lettura codice): chiusure_turno, admin_finance, controllo_gestione_router, banca_router, vini_v2_router, dashboard_router, vini_router (parziale), foodcost_recipes_router (parziale), preventivi_router (mappa route), fe_import (parziale). Gli altri ~41 coperti via grep mirato (except/connect/commit/loop/stringhe locale).
- **Servizi**: tutti i 38 file di `app/services/` verificati per import in entrata. `app/models/` (14 file), `app/repositories/` (3), `app/utils/` (7) idem.
- **Trailing slash**: incrocio completo lista router con root endpoint `("/")` (18 router) ↔ chiamate `${API_BASE}/...` in `frontend/src/`.
- **Limiti**: niente esecuzione, niente DB live, niente misure di latenza reali (coperte da A7). Numeri di riga riferiti al commit corrente.

---

## 3. Finding

```
[A3-01] SEVERITÀ: HIGH — ✅ CONFERMATO da verifica avversaria
Titolo: stati_pagamento.py (single source of truth G.8) esiste ma NESSUNO lo importa — whitelist stati ancora hardcoded ovunque nel CG
Evidenza: grep repo-wide: zero import di app/services/stati_pagamento.py (98 righe, 3,7 KB); unico riferimento è la stringa di errore del trigger in app/migrations/117_stato_check_constraint.py:59,74 (che peraltro punta al path sbagliato, vedi A2-14). Intanto controllo_gestione_router.py mantiene tuple hardcoded: r.724 `stato NOT IN ('PAGATO','PAGATO_MANUALE','PARZIALE')`, r.996, r.1055, r.1153, r.1203, r.1525-1529, r.1853, r.1875, r.1908 (tutte riverificate dalla verifica avversaria). La colonna GENERATED stato_macro (alternativa dichiarata) è usata UNA sola volta (:923, in SELECT) — non sostituisce le whitelist. Lo stesso docstring del service (r.19-24) dichiara che le tuple sparse "inevitabilmente qualcuno veniva dimenticato → bug di distruzione dati". roadmap.md:263 marca G.8 come "✅ FATTO" con "costanti centralizzate".
Impatto: la classe di bug che G.8 doveva eliminare è ancora attiva: il prossimo sotto-stato nuovo (o una modifica a PARZIALE) richiede di ritrovare a mano ~10+ punti nel CG router; storicamente questo ha già causato perdita dati (mig 115 ripara 138 VERIFICARE perse). Inoltre la roadmap dichiara fatto un refactor che nel codice non è cablato.
Fix proposto: importare is_chiuso()/STATI_CHIUSI da stati_pagamento.py nei punti elencati del CG router (o, in alternativa dichiarata, eliminare il service e usare solo stato_macro GENERATED nelle query). Aggiornare roadmap G.8 con lo stato reale. — Effort: M
Modulo: controllo_gestione
```

```
[A3-02] SEVERITÀ: MED
Titolo: Trio di servizi morti admin_finance_db / admin_finance_import / admin_finance_closure_utils (~600 righe)
Evidenza: grep repo-wide (*.py, incl. tools/): nessun import dei tre file fuori da loro stessi (si importano solo a vicenda). Il router vivo app/routers/admin_finance.py importa invece corrispettivi_import/corrispettivi_export (r.17-26). admin_finance_import.py è la v1.0 del parser corrispettivi, superseded.
Impatto: 603 righe (169+297+137) di logica corrispettivi DUPLICATA e divergente dalla versione viva: chi cerca "dove si calcola cash_diff" trova due implementazioni e può fixare quella sbagliata. Contiene anche 4 bare `except:`.
Fix proposto: rimuovere i tre file (in sessione cleanup, non durante R, con grep di conferma pre-delete). — Effort: S
Modulo: cassa
```

```
[A3-03] SEVERITÀ: MED
Titolo: liquidita_service.py (557 righe) morto + import morto nel CG router
Evidenza: app/routers/controllo_gestione_router.py:23 `from app.services.liquidita_service import dashboard_liquidita` — ma `dashboard_liquidita` non è usato in nessun'altra riga del file (grep: solo r.23). L'endpoint /liquidita è stato rimosso (commento r.440-446: "LIQUIDITA' — RIMOSSO 2026-05-16 (audit Marco)"). Nessun altro importatore repo-wide.
Impatto: 557 righe morte che leggono banca/cassa/CG; l'import attivo le carica comunque a ogni boot e le fa sembrare vive. Confonde la mappa del modulo Flussi di Cassa (che è la sostituzione dichiarata).
Fix proposto: rimuovere l'import a r.23 e archiviare/eliminare il service (recupero via git log, come già annotato nel commento). — Effort: S
Modulo: controllo_gestione
```

```
[A3-04] SEVERITÀ: LOW — parz. noto (vini_model: roadmap V-H.I + V-DEBT2)
Titolo: File modello/infra orfani: vini_model.py (noto), models/user.py, models/fe_import.py, core/database.py
Evidenza: app/models/vini_model.py (40 righe) — riferito SOLO in commenti/stringhe (vini_cantina_tools_router.py:47,284; vini_xlsx_v2.py:9,35): NOTO, roadmap V-H.I + V-DEBT2, "non prima del 15 giugno 2026". In più (non tracciati): app/models/user.py (7 righe, "Modello utente simulato", zero import), app/models/fe_import.py (75 righe di modelli SQLAlchemy mai importati in una codebase sqlite3-raw), e app/core/database.py importato unicamente dal morto fe_import.py:18.
Impatto: rumore; SQLAlchemy in models/fe_import.py suggerisce una dipendenza/architettura che non esiste più.
Fix proposto: aggiungere user.py, models/fe_import.py e core/database.py alla lista V-H.I del cleanup batch già pianificato. — Effort: S
Modulo: platform (+ vini per vini_model)
```

```
[A3-05] SEVERITÀ: MED
Titolo: 4 router non classificati in nessun module.json → sempre montati anche a modulo spento (buco nel gating R8)
Evidenza: vini_anagrafiche_router e vini_v2_router montati in main.py:603-604 ma ASSENTI da core/moduli/vini/module.json router_files; banca_carta_router (main.py:650) assente da banca/module.json; piatti_giorno_router (main.py:698) assente da cucina e ricette module.json. app/platform/module_loader.py:142-144: router senza mapping → `return True` ("monta tutto quello che non è esplicitamente classificato"). I 4 file dichiarano il proprio modulo in commento (es. banca_carta_router.py:1 `# Modulo: banca`).
Impatto: un locale che NON compra Vini o Banca si ritrova comunque attivi /vini/v2/* (l'intera cantina v2, che è la UI magazzino corrente), /vini/anagrafiche/* e /banca/carta/*. Il gating per modulo — argomento di vendita del prodotto — è bucato proprio sui router più nuovi.
Fix proposto: aggiungere i 4 router_files ai rispettivi module.json (vini ×2, banca, cucina/ricette per piatti_giorno — chiedere a Marco per quest'ultimo: commento dice "cucina (selezioni)" ma i 4 scelta_* sono in ricette). — Effort: S
Modulo: platform (module_loader) / vini / banca / cucina
Nota: stesso oggetto di A5-01 (area architettura), lì pesato HIGH per il drift di processo già in atto (4 derive in ~1 mese) e confermato dalla verifica avversaria.
```

```
[A3-06] SEVERITÀ: MED
Titolo: GET /admin/finance/shift-closures/ — connessione SQLite nuova PER OGNI RIGA + N+1, su tabella che cresce per sempre
Evidenza: app/routers/chiusure_turno.py:854-868: `for row in rows: conn2 = sqlite3.connect(DB_PATH)` + 3 query (checklist/preconti/spese) per chiusura; chiusura conn a r.868 NON in finally. In più r.831-844: loop su cena_dates con 3 query/data (conn3). L'endpoint (r.745) ha from_date/to_date OPZIONALI e il FE lo chiama senza filtri: frontend/src/pages/banca/FlussiCassaMance.jsx:34 e frontend/src/pages/admin/MancePage.jsx:35 (`.../shift-closures/` nudo).
Impatto: con ~2 turni/giorno la tabella supera le ~700 righe/anno (oggi 168, vedi 02_DATI.md) → centinaia di connect() e migliaia di query per UN caricamento delle pagine Mance, in crescita lineare senza limite. È la fonte classica del "perché questa pagina è diventata lenta?" tra 6 mesi.
Fix proposto: sostituire i loop con 3 query aggregate `WHERE shift_closure_id IN (...)` (o GROUP BY shift_closure_id) su una sola connessione; in subordine default from_date=inizio anno corrente. — Effort: M
Modulo: cassa
```

```
[A3-07] SEVERITÀ: MED
Titolo: N+1 su GET /vini/v2/madri-raggruppate/ (vista principale cantina)
Evidenza: app/routers/vini_v2_router.py:297-318: `for m in madri:` → query annate per ogni madre (r.302). In più 2 subquery correlate per madre nella SELECT principale (r.284-285). conn.close() a r.320 non in finally.
Impatto: con N madri in cantina (centinaia per un'enoteca seria) la vista "Visualizza Madri" e i drill-down Anagrafiche fanno N+1 query a ogni load/filtro. Su SQLite locale regge oggi, degrada con la crescita del catalogo e con più utenti concorrenti (lock).
Fix proposto: una sola query bottiglie `WHERE madre_id IN (...)` (o JOIN) e raggruppamento in Python. — Effort: S
Modulo: vini
```

```
[A3-08] SEVERITÀ: MED
Titolo: /dashboard/home esegue alert engine + task scheduler IN SINCRONO a ogni request (il commento dice "fire-and-forget", ma blocca la risposta)
Evidenza: app/routers/dashboard_router.py:1518-1530: dopo aver costruito la response, `run_all_checks(dry_run=False)` (6 checker registrati in alert_engine.py che scandiscono più DB) e `trigger_scheduler(days_ahead=1)` vengono eseguiti PRIMA del `return response` (r.1532), dentro l'handler sync. Il commento r.1515 li definisce "fire-and-forget".
Impatto: ogni apertura della Home (la pagina più visitata, da ogni dispositivo) paga la latenza di 6 scansioni alert + generazione checklist; il lavoro è ripetuto a ogni request anche se l'anti-duplicato limita solo le notifiche, non le scansioni. Occupa anche un worker del threadpool a ogni Home load.
Fix proposto: spostare i due trigger in BackgroundTasks FastAPI (vero fire-and-forget) e/o aggiungere un cooldown (es. ultimo run < 10 min fa → skip). — Effort: S
Modulo: platform
```

```
[A3-09] SEVERITÀ: MED
Titolo: Saldo cassa contanti (/cash/flow): tre `except Exception: pass` inghiottono errori sul calcolo del saldo iniziale
Evidenza: app/routers/admin_finance.py:2110-2123 (dentro GET /admin/finance/cash/flow, r.2039): `_contanti_fiscali_by_date`, `_sum_spese_contanti_range`, `_sum_versamenti_range` — ognuna in try/except: pass. Se una fallisce (colonna mancante post-migrazione, DB locked, file assente) la componente viene semplicemente OMESSA dal saldo_iniziale.
Impatto: il flusso di cassa contanti può mostrare un saldo SBAGLIATO in silenzio invece di un errore: esattamente il tipo di numero su cui Marco fa quadratura fisica del contante. Un 500 esplicito sarebbe meno dannoso di un numero plausibile ma errato.
Fix proposto: loggare con logger.error e aggiungere alla response un flag `saldo_parziale: true` / warning visibile in UI quando una componente fallisce (o rilanciare HTTPException 500). — Effort: S
Modulo: cassa
```

```
[A3-10] SEVERITÀ: MED
Titolo: Import corrispettivi: celle numeriche malformate → 0.0 silenzioso, date invalide → riga scartata in silenzio
Evidenza: app/services/corrispettivi_import.py (usato dal vivo via admin_finance.py:17): r.89-92 `except: return 0.0` nel parser importi (€); r.252-259 `_num()` idem; r.161-164 + r.171-172 data non parsabile → `continue` senza contatore/segnalazione.
Impatto: una cella sporca nell'Excel del commercialista (es. refuso "1.234,5O") entra come corrispettivo 0 nel DB fiscale, o l'intera giornata sparisce dall'import, senza alcun avviso nel risultato. Errore su dati fiscali scoperto solo (forse) in quadratura mensile.
Fix proposto: accumulare in ImportResult un elenco `righe_scartate` / `celle_azzerate` (data + colonna) e mostrarlo nel toast/report FE post-import. — Effort: M
Modulo: cassa
```

```
[A3-11] SEVERITÀ: MED
Titolo: Pattern sistemico: connessioni SQLite chiuse fuori da try/finally e write-path senza rollback nei router soldi
Evidenza: conteggi grep close() vs finally: vini_v2_router.py 11 close / 0 finally; banca_router.py 50 close / 1 finally / 1 rollback; controllo_gestione_router.py 66 close / 25 finally / 3 rollback; admin_finance.py e chiusure_turno.py 0 rollback. Caso concreto: POST /controllo-gestione/uscite/import (controllo_gestione_router.py:454-823) — commit intermedio r.489, poi ~330 righe di INSERT/UPDATE su cg_uscite senza try/except: un'eccezione a metà lascia il commit parziale del fix-up stipendi, la connessione aperta fino al GC e nessun rollback esplicito.
Impatto: su SQLite in WAL con threadpool FastAPI, una connessione write leaked tiene il lock finché il GC non la raccoglie → "database is locked" intermittenti su altri endpoint dello stesso DB (foodcost.db è condiviso da CG/acquisti/banca). Lo stato resta consistente (rollback implicito a close), ma i sintomi sono erratici e difficilissimi da diagnosticare.
Fix proposto: convenzione unica `try/finally: conn.close()` (o contextmanager condiviso in app/services/) almeno per i write-path di CG, banca, cassa; rollback esplicito nei sync multi-statement. Adottabile in modo incrementale quando si tocca un endpoint. — Effort: M
Modulo: platform (pattern) — manifestazione: controllo_gestione, banca, vini, cassa
```

```
[A3-13] SEVERITÀ: LOW
Titolo: Asset brand "logo_tregobbi.png" hardcoded in 3 router core (i testi passano da t_(), il logo no)
Evidenza: app/routers/vini_router.py:62 `LOGO_PATH = STATIC_DIR / "img" / "logo_tregobbi.png"` e :90 `<img src="/static/img/logo_tregobbi.png">` nell'HTML carta; app/routers/vini_cantina_tools_router.py:73; app/routers/bevande_router.py:70. Le stringhe testuali nello stesso file usano correttamente t_() con fallback (r.83-85) — il path del logo è l'unico residuo non locale-aware.
Impatto: un secondo locale che genera carta vini/bevande PDF o HTML stampa il logo dei Tre Gobbi. Post-R5/R7 questo è l'ultimo brand asset hardcoded trovato in app/.
Fix proposto: risolvere il logo via branding.json del locale (helper analogo a locale_strings), con fallback al file attuale. — Effort: S
Modulo: vini
```

```
[A3-14] SEVERITÀ: LOW — noto, stato: DA FARE (roadmap T.9, bassa priorità)
Titolo: Script one-shot residui in tools/ e scripts/
Evidenza: tools/fix_migration.py, tools/recover_tables.py, tools/rebuild_vini_magazzino.py, tools/import_vini_magazzino.py; scripts/apply_backfill_057.py, scripts/cleanup_vini_duplicati.py, scripts/merge_duplicati.py, scripts/set_dipendente_id.py. roadmap.md:666 (T.9) traccia già "Cleanup file morti".
Impatto: solo rumore + rischio di rilancio accidentale di uno script di rebuild su DB vivo.
Fix proposto: nessuna azione nuova; eventualmente estendere T.9 con la lista esatta sopra. — Effort: S
Modulo: platform
```

```
[A3-15] SEVERITÀ: LOW
Titolo: Solo 13/51 router hanno la dichiarazione "# Modulo:" prevista dalla regola 1 della disciplina modulare
Evidenza: grep -l "# Modulo:" su app/routers/*.py → 13 file (chiusure_turno, dashboard, banca, admin_finance, banca_carta, foodcost_recipes, controllo_gestione, menu_carta, foodcost_matching, vini_anagrafiche, piatti_giorno, vini_v2, vini_settings). I restanti 38 ne sono privi.
Impatto: la regola CLAUDE.md vale "per ogni feature nuova", quindi i file storici non sono in violazione formale — ma il mapping router→modulo vive solo nei module.json e a R8 il commento doveva essere la fonte di raccolta (regola 5). Coerenza parziale.
Fix proposto: batch one-shot: aggiungere l'header ai 38 router mancanti copiando dal module.json (operazione meccanica, zero rischio). — Effort: S
Modulo: platform
```

---

## 4. Verifiche con esito NEGATIVO (nessun finding — vale come copertura positiva)

- **Router non montati / dead router**: ZERO. Tutti i 51 file di app/routers/ risultano montati in main.py via `_mount` (51/51 match, inclusi alias senza suffisso `_router`: admin_finance, chiusure_turno, dipendenti, reparti, fe_import).
- **Mattone M.C (WhatsApp)**: nessuna costruzione `wa.me` a mano. L'unico consumatore FE trovato (DipendentiBustePaga.jsx) importa correttamente `openWhatsApp/WA_TEMPLATES/fillTemplate` da utils/whatsapp (r.8, r.163). Backend: nessun `.replace()` su telefoni fuori da app/utils/whatsapp.py.
- **Mattone M.A (notifiche)**: nessun `INSERT INTO notifiche` fuori da notifiche_service/notifiche_db/migrazioni. `crea_notifica` usato da turni_service e alert_engine.
- **Mattone M.F (alert)**: tutti i 6 `@register_checker` vivono in app/services/alert_engine.py. Nessun checker reimplementato altrove.
- **Trailing slash**: incrociati i 18 router con endpoint root "/" contro frontend/src — **nessun caso reale nelle pagine vive di questo perimetro** (vedi §5 per A3-12 rimosso). `/preventivi?...` è OK perché il backend usa `@router.get("")` senza slash (preventivi_router.py:201). L'unico caso vero confermato dall'intero ciclo di audit è in area frontend: **A4-03** (CambioPIN.jsx:34 → `/auth/users` senza slash, pagina viva, confermato MED dalla verifica avversaria).
- **Stringhe "tregobbi" in app/**: quasi tutte sono default backward-compat di `TRGB_LOCALE` (locale_data.py, locale_strings.py, uploads.py, module_loader.py) o docstring — corrette by design. Unico residuo sostanziale: il logo (A3-13).

---

## 5. Finding rimossi in verifica avversaria

- **[A3-12] Trailing slash mancante su /dipendenti nel FE ("regressione S40-1") — SMENTITO e RIMOSSO.** I due file citati (`pages/admin/DipendentiTurni.jsx`, `pages/admin/DipendentiAnagrafica.jsx`) sono **morti**: App.jsx importa esclusivamente le versioni in `pages/dipendenti/`, che usano lo slash corretto (`${API_BASE}/dipendenti/` a DipendentiTurni.jsx:109 e DipendentiAnagrafica.jsx:200). Il fix S40-1 è vivo e applicato; nessuna regressione nel codice eseguito. Il residuo reale (file morti con pattern vietati, rischio copia) è coperto da A4-04 (LOW, area frontend). Verdetto completo in 99_VERIFICA_AVVERSARIA.md.

---

## 6. Tabella riassuntiva

| Sev | # | Finding |
|---|---|---|
| CRIT | 0 | — |
| HIGH | 1 | A3-01 SSoT stati pagamento mai cablato (whitelist hardcoded nel CG) — confermato |
| MED | 9 | A3-02 trio servizi morti cassa · A3-03 liquidita_service morto · A3-05 4 router fuori dal gating moduli · A3-06 conn-per-riga shift-closures · A3-07 N+1 madri-raggruppate · A3-08 alert engine sincrono in /dashboard/home · A3-09 except-pass su saldo contanti · A3-10 import corrispettivi 0.0 silenzioso · A3-11 conn senza finally/rollback (sistemico) |
| LOW | 4 | A3-04 modelli orfani (vini_model noto) · A3-13 logo hardcoded · A3-14 tools one-shot (noto T.9) · A3-15 header "# Modulo:" 13/51 |
| **Totale** | **14** | (A3-12 rimosso — smentito, vedi §5) |

**Note di coordinamento:**
- A3-05 tocca la readiness prodotto: stesso oggetto di A5-01 (HIGH in area architettura, confermato) — un solo fix chiude entrambi.
- A3-08 si somma a quanto rilevato in A5-02/A7-03 (costo sincrono sulla Home): il fix BackgroundTasks risolve l'intera famiglia.
- Durante l'analisi notato (per area sicurezza): `GET /vini/carta` (vini_router.py:68) senza auth — confermato by-design (carta pubblica QR), censito nell'elenco pubblici di 01_SICUREZZA.md.
- Il CG router legge direttamente tabelle di acquisti/banca (fe_fatture, banca_movimenti, suppliers in controllo_gestione_router.py:494-518) — non sollevato qui come finding perché coperto dalle dipendenze_opzionali dichiarate nel module.json; valutazione di conformità alla regola 4 demandata all'area architettura (A5).
