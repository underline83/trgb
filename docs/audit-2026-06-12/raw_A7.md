# Audit A7 — Performance (2026-06-12)

> Subagente A7 dell'audit completo TRGB. Scope: performance live (non distruttivo) + analisi statica.
> Repo: `/Users/underline83/trgb` @ commit `1f5f9c17` (main). Produzione: `https://trgb.tregobbi.it` (backend) / `https://app.tregobbi.it` (frontend).

---

## 0. Metodologia e LIMITI DI CAMPIONAMENTO (onestà)

**Cosa era previsto:** probe HTTP GET con timing (curl -w), copia dei DB SQLite in `/tmp/audit_a7/` per conteggi righe ed EXPLAIN QUERY PLAN.

**Cosa è stato possibile:** la sandbox di questa sessione ha negato:
- **qualsiasi accesso di rete** (`curl`, `WebFetch`) — coerente con CLAUDE.md ("Niente accesso alla rete"). → **Nessun probe live eseguito. La tabella timing del §1 è N/D.**
- **qualsiasi scrittura fuori dal repo** (`mkdir`/`cp` in `/tmp` e `$TMPDIR` negati) → impossibile copiare i DB.
- **`sqlite3` e `python3`** come comandi → impossibile contare righe o fare EXPLAIN QUERY PLAN anche su copie.

**Adattamento:** audit interamente **statico** (lettura codice, migrazioni, config deploy, docs) + dimensioni file DB come proxy grossolano del volume dati. Tutti i finding citano `file:linea` verificabili. Dove un'affermazione dipende dal volume dati reale (non misurabile), è marcata **[stima]**. L'analisi "SCAN su tabelle >10k righe" del punto 5 è stata ricostruita staticamente: query dal codice + presenza/assenza di indici nelle migrazioni (un indice assente garantisce SCAN, indipendentemente dal conteggio esatto).

**Dimensioni DB (proxy volume — `du -sh locali/tregobbi/data/`):**

| DB | Dimensione | Contenuto principale |
|---|---|---|
| `clienti.sqlite3` | **26 MB** | clienti, prenotazioni, preventivi, email log |
| `foodcost.db` | **8,6 MB** | fe_fatture, **fe_righe**, ingredienti, ricette, cg_*, ipratico_* |
| `vini_magazzino.sqlite3` | 3,2 MB | vini_bottiglie, movimenti |
| `vini.sqlite3` | 788 KB | anagrafiche |
| `dipendenti.sqlite3` | 392 KB | — |
| `admin_finance.sqlite3` | 348 KB | chiusure |
| altri (notifiche, tasks, bevande, vini_settings) | < 210 KB | — |

---

## 1. Live timing — NON ESEGUIBILE

| Endpoint | TTFB mediana | Size | Note |
|---|---|---|---|
| `GET /` (index) | N/D | N/D | rete negata dalla sandbox |
| `GET /system/info` | N/D | N/D | idem |
| `GET /system/modules` | N/D | N/D | idem |
| `GET /locale/branding.json` | N/D | N/D | idem |
| `GET /locale/strings.json` | N/D | N/D | idem |
| `GET /carta` (pagina pubblica) | N/D | N/D | idem |
| `GET /vini/carta-cliente/data` | N/D | N/D | **verificato nel codice: è pubblico, senza auth** (`vini_router.py:132`, nessun `Depends(get_current_user)`) |
| asset statico baseline | N/D | N/D | idem |

**Valutazione statica sostitutiva degli endpoint pubblici:**
- `/system/info`, `/system/modules`: payload piccoli, valori cached al boot (`main.py:145-151`). OK.
- `/locale/branding.json`: cache in-process (`_BRANDING_CACHE`, `main.py:433-466`). OK lato backend; **nessun header `Cache-Control`** → il client lo riscarica a ogni load (payload piccolo → LOW, assorbito in A7-07).
- `/locale/strings.json`: cache in-process TTL 60s (`app/utils/locale_strings.py:24-58`). OK.
- `/vini/carta-cliente/data`: **nessuna cache di alcun tipo**, ricostruzione completa a ogni request → finding A7-05.
- `/carta` (HTML React): servito dal **dev server Vite in produzione** → finding A7-01 (il peggiore in assoluto per la UX cliente al tavolo).

---

## 2. Finding

```
[A7-01] SEVERITÀ: HIGH
Titolo: Frontend di produzione servito dal dev server Vite (npm run dev), non da una build statica
Evidenza: docs/analisi_hardening_vps.md:15 ("app.tregobbi.it → nginx → 127.0.0.1:5173 → Vite dev server (servizio trgb-frontend, lancia npm run dev)") e :60 ("npm run dev -- --host 127.0.0.1 --port 5173 --mode vps"); docs/deploy.md:231 ("proxy_pass http://127.0.0.1:5173 ← frontend"); nessun "npm run build" in scripts/deploy.sh (solo npm install, riga 67-69) né nell'hook post-receive (scripts/setup_git_server.sh:115-122); vite.config.js riga 150 "allowedHosts: [\"app.tregobbi.it\"]" nel blocco server (conferma che il dev server è esposto in prod).
Impatto: nessuna minificazione, nessun bundling: ogni pagina scarica centinaia di moduli ES singoli trasformati on-demand. L'intero lavoro di code-splitting (React.lazy in App.jsx v5.2 + manualChunks in vite.config.js:120-142) NON ha alcun effetto in produzione. È il collo di bottiglia n.1 percepito, in particolare sulla carta vini via QR su 4G (riconosciuto dal progetto stesso in analisi_hardening_vps.md §3.A). Costo CPU/RAM costante del processo Vite sul VPS.
Fix proposto: `npm run build` nel deploy (push.sh full o hook) + nginx serve `frontend/dist/` statico con gzip e Cache-Control immutable sugli asset hashati (template già pronto in deploy/sites/trgb.it/nginx.conf:42-56); eliminare trgb-frontend.service. — Effort: M
Modulo: infra
```

```
[A7-02] SEVERITÀ: HIGH
Titolo: fe_righe senza indice su fattura_id — la tabella più interrogata di foodcost.db va sempre in SCAN
Evidenza: creazione tabella in app/routers/fe_import.py:106-119 (solo PK, FOREIGN KEY non crea indice in SQLite); grep "CREATE INDEX" su tutto app/ (233 occorrenze): nessuna su fe_righe. Consumatori: fe_import.py:962 — subquery correlata `(SELECT COUNT(*) FROM fe_righe r WHERE r.fattura_id = f.id)` eseguita PER OGNI fattura della lista (default limit=500 → 500 scan completi per una chiamata a GET /fe/fatture); app/services/conto_economico.py:236 `JOIN fe_righe r ON r.fattura_id = f.id` (conto economico CG); foodcost_matching_router.py:296,340,453,605,990,1158,1672,1896 (matching ricette). fe_righe = righe di tutte le fatture importate dal 2024 [stima: decine di migliaia di righe; foodcost.db = 8,6 MB; conteggio esatto non misurabile in sandbox].
Impatto: costo O(N_fatture × N_righe) su elenco fatture, conto economico e matching; degrada linearmente con ogni nuova fattura importata.
Fix proposto: migrazione idempotente `CREATE INDEX IF NOT EXISTS idx_fe_righe_fattura ON fe_righe(fattura_id);` (solo ADD, compatibile con le regole R). — Effort: S
Modulo: acquisti
```

```
[A7-03] SEVERITÀ: MED
Titolo: GET /dashboard/home esegue alert engine completo + task scheduler in modo SINCRONO a ogni apertura della Home
Evidenza: app/routers/dashboard_router.py:1515-1530 — il commento dice "fire-and-forget" ma `run_all_checks(dry_run=False)` e `trigger_scheduler(days_ahead=1)` sono chiamate inline nel corpo della request (nessun BackgroundTasks/thread). run_all_checks (app/services/alert_engine.py:130-132) esegue 6 checker registrati (fatture_scadenza, dipendenti_scadenze, vini_sottoscorta, cg_scadenze_imminenti/avvicinamento/pianificazione) ognuno con query su DB diversi. L'anti-duplicato (alert_engine.py:139) evita solo lo spam di notifiche, NON il costo delle query: la scansione completa avviene a OGNI load della Home, per ogni utente.
Impatto: TTFB della Home (la pagina più aperta dell'app) gonfiato dal costo cumulativo di ~10+ query cross-DB non necessarie alla risposta; il payload restituito non dipende da quei trigger.
Fix proposto: spostare i due trigger in `BackgroundTasks` di FastAPI (o starlette `response background`) + throttle in-process (es. max 1 run ogni 10 min). — Effort: S
Modulo: platform
```

```
[A7-04] SEVERITÀ: MED
Titolo: Matching ricette — query "righe pending" senza LIMIT con 3 sub-select NOT IN e JOIN con condizione OR
Evidenza: app/routers/foodcost_matching_router.py:282-317 — SELECT su fe_righe JOIN fe_fatture con `LEFT JOIN fe_fornitore_categoria ON (... = ...) OR (... = ...)` (l'OR nella condizione di join impedisce l'uso di indici → nested loop), tre filtri `NOT IN (SELECT ...)` e `UPPER(TRIM(r.descrizione)) NOT IN (...)` (funzioni su colonna → non indicizzabile), nessun LIMIT: ritorna TUTTE le righe non matchate.
Impatto: la pagina RicetteMatching paga a ogni load una query quadratica sulla tabella più grande di foodcost.db + serializzazione JSON di tutte le righe pending [stima: migliaia di righe dopo ogni import mensile]. Peggiora a ogni fattura importata e non matchata.
Fix proposto: aggiungere paginazione (LIMIT/OFFSET + count separato); riscrivere gli OR-join in UNION o normalizzare fornitore_key; beneficia anche dell'indice A7-02. — Effort: M
Modulo: ricette
```

```
[A7-05] SEVERITÀ: MED
Titolo: /vini/carta-cliente/data (pubblico, dietro QR ai tavoli) ricostruisce l'intera carta a ogni request, senza cache in-process né Cache-Control
Evidenza: app/routers/vini_router.py:132-293 — a ogni GET: load_vini_calici() + load_vini_ordinati() (carta completa), raggruppamento nested tipologia→nazione→regione→produttore in Python, più caricamento di tutte le sezioni/voci bevande (righe 253-281). Nessuna cache (a differenza di branding/strings che ce l'hanno). Nessun header Cache-Control in tutto il backend tranne un no-store (grep "Cache-Control" su app/: solo turni_router.py:853). Endpoint senza auth → chiunque/ogni tavolo lo richiama; il FE pubblico lo fetcha a ogni mount (frontend/src/pages/public/CartaClienti.jsx:529).
Impatto: payload JSON dell'intera carta (vini + bevande) rigenerato per ogni cliente che inquadra il QR [stima: centinaia di KB non compressi]; burst nelle ore di servizio sullo stesso processo uvicorn che serve la sala.
Fix proposto: cache in-process con TTL 60-300s (stesso pattern di _BRANDING_CACHE) invalidata sulle mutazioni vini + header `Cache-Control: public, max-age=300`. — Effort: S
Modulo: vini
```

```
[A7-06] SEVERITÀ: MED
Titolo: Endpoint elenco senza paginazione (full table scan + serializzazione completa a ogni chiamata)
Evidenza (i peggiori, con stima volume):
  1. GET /vini/magazzino/ → app/routers/vini_magazzino_router.py:289-309 → db.search_vini → app/models/vini_magazzino_db.py:1234-1240: `SELECT * FROM vini_bottiglie ... ORDER BY 5 colonne`, nessun LIMIT [stima 1-3k righe, DB 3,2 MB; tutte le colonne, incluse note/locazioni].
  2. GET /cg/uscite → app/routers/controllo_gestione_router.py:840-915+: triple JOIN (cg_uscite + fe_fatture + fe_fornitore_categoria) senza LIMIT — il tabellone scarica l'intero scadenzario storico [stima: migliaia di righe, cresce con ogni fattura].
  3. GET /foodcost/ingredients/ → app/routers/foodcost_ingredients_router.py:328-402: nessun LIMIT + 2 subquery correlate per ingrediente su ingredient_prices (indicizzata, mitigato) + lettura completa di ingredient_supplier_map e dei prezzi in finestra a ogni chiamata.
  4. GET /fe/fatture → fe_import.py:877: paginato ma `limit le=50000` — il client può chiedere l'intero archivio in una risposta sola.
  5. GET /vini/carta-staff/ e /vini/magazzino/movimenti-globali: il secondo è paginato, il primo full-list (accettabile, è la carta).
Impatto: pagine elenco che rallentano linearmente con la crescita dei dati; su VPS single-process ogni richiesta grossa blocca un worker thread e gonfia il transfer (vedi anche A7-07 compressione).
Fix proposto: introdurre limit/offset di default (es. 200, cap 2000) sui 3 endpoint non paginati; abbassare il cap di /fe/fatture a 2000. — Effort: M (FE da adeguare)
Modulo: vini / controllo_gestione / ricette / acquisti
```

```
[A7-07] SEVERITÀ: LOW
Titolo: Nessuna compressione applicativa dei JSON e gzip nginx non verificabile/incompleto per application/json
Evidenza: nessun GZipMiddleware in main.py (grep "GZip" → 0 risultati; middleware presenti: CORS + ReadOnlyViewerMiddleware, main.py:493-541). La config nginx di produzione (trgb.tregobbi.it) NON è versionata nel repo (docs/deploy.md:236 ne mostra solo un frammento); l'unica config versionata, deploy/sites/trgb.it/nginx.conf:43, ha `gzip_types text/plain text/css text/javascript application/javascript image/svg+xml` — manca `application/json`: se la config prod è analoga, le risposte API (incluse carta-cliente e gli elenchi di A7-06) viaggiano NON compresse.
Impatto: payload JSON 3-8x più grandi del necessario su mobile/4G. Non verificabile live dalla sandbox (rete negata) — da confermare con `curl -sI -H "Accept-Encoding: gzip" https://trgb.tregobbi.it/locale/strings.json`.
Fix proposto: aggiungere `application/json` a gzip_types nella config prod (e in deploy/sites/trgb.it/nginx.conf), oppure GZipMiddleware(minimum_size=1000) in main.py. — Effort: S
Modulo: infra
```

```
[A7-08] SEVERITÀ: LOW
Titolo: Filtri e aggregazioni su substr(data_fattura) non indicizzabili — full scan di fe_fatture su ogni dashboard/stats
Evidenza: app/routers/fe_import.py:894-900 (`substr(f.data_fattura, 1, 4) = ?`, `substr(f.data_fattura, 6, 2) = ?`) e pattern analoghi negli endpoint /fe/stats/* (kpi:2033, per-categoria:2107, top-fornitori:2185, confronto-annuale:2235); funzione su colonna → SQLite non può usare un eventuale indice su data_fattura.
Impatto: scan completo di fe_fatture per ogni filtro anno/mese e per ogni widget stats [stima: migliaia di righe → oggi millisecondi, cresce linearmente]. Severità bassa perché fe_fatture è di un ordine di grandezza più piccola di fe_righe.
Fix proposto: sostituire con range sargable (`data_fattura >= 'YYYY-01-01' AND < 'YYYY+1-01-01'`) + indice su data_fattura. — Effort: S
Modulo: acquisti
```

```
[A7-09] SEVERITÀ: LOW
Titolo: _ensure_tables() eseguito a ogni request del router fatture (DDL + probe + commit per ogni GET)
Evidenza: app/routers/fe_import.py:58-123 — 2 CREATE TABLE IF NOT EXISTS + SELECT-probe colonne + conn.commit(); chiamato in 19 endpoint (righe 687,745,855,881,999,...,2294), incluso list_fatture (881).
Impatto: overhead fisso (parse DDL + lock schema + commit) su ogni chiamata API del modulo acquisti; pattern ridondante visto che le migrazioni girano al boot.
Fix proposto: spostare _ensure_tables in startup del modulo (una volta per processo, flag module-level). — Effort: S
Modulo: acquisti
```

```
[A7-10] SEVERITÀ: LOW
Titolo: clienti.sqlite3 = 26 MB (3x foodcost.db) — probabile bloat non analizzabile dalla sandbox
Evidenza: du -sh locali/tregobbi/data/clienti.sqlite3 → 26 MB, il DB più grande del sistema. Tabelle candidate al bloat (da app/models/clienti_db.py): prenotazioni_email_log (riga 382 — corpi email), clienti_import_diff (riga 230 — diff di ogni import), clienti_prenotazioni (storico completo). Conteggio righe per tabella NON eseguibile (sqlite3 negato in sandbox).
Impatto: query CRM/prenotazioni e backup più lenti del necessario se il grosso è log storico; 26 MB restano gestibili, ma il trend va misurato.
Fix proposto: sul VPS (o post-push in locale): `sqlite3 clienti.sqlite3 "SELECT name, SUM(pgsize) FROM dbstat GROUP BY name ORDER BY 2 DESC LIMIT 10;"`; se è email_log/import_diff → retention (es. 12 mesi) + VACUUM. — Effort: S (analisi) / M (retention)
Modulo: clienti
```

---

## 3. Punti VERDI (verificati, nessun finding)

| Area | Evidenza |
|---|---|
| Code splitting FE ben progettato | App.jsx v5.2: React.lazy + Suspense per ~150 pagine; vite.config.js:120-142 manualChunks (vendor-react / vendor-charts / vendor-router / module-*) — **ma inefficace finché vige A7-01** |
| Dipendenze FE sobrie | package.json: 6 dependencies; recharts (la più pesante) usata in 8 pagine e isolata in vendor-charts; niente xlsx/moment/lodash |
| branding/strings cached | main.py:433-466 (_BRANDING_CACHE), locale_strings.py:24-58 (TTL 60s) |
| Paginazione corretta dove conta | banca /movimenti (le=2000, banca_router.py:406), clienti (limit ovunque, clienti_router.py:1124-2012), statistiche /prodotti (le=500, statistiche_router.py:215) |
| Indici presenti su tabelle calde (escluso fe_righe) | ingredient_prices (mig 004:182-184), banca_movimenti (mig 014:54-59), ipratico_prodotti (mig 018:60-64), cg_uscite (mig 032:46-51, 111:58), clienti (clienti_db.py:394-398) |
| /system/info, /system/modules | valori letti al boot e cached (main.py:145-151) |

---

## 4. Tabella riassuntiva

| ID | Sev | Titolo breve | Modulo | Effort |
|---|---|---|---|---|
| A7-01 | HIGH | Vite dev server in produzione (no build statica) | infra | M |
| A7-02 | HIGH | fe_righe senza indice su fattura_id (SCAN ovunque) | acquisti | S |
| A7-03 | MED | Alert engine + scheduler sincroni in GET /dashboard/home | platform | S |
| A7-04 | MED | Matching /pending: query OR-join + 3 NOT IN, no LIMIT | ricette | M |
| A7-05 | MED | carta-cliente/data pubblico senza cache né Cache-Control | vini | S |
| A7-06 | MED | Elenchi senza paginazione (vini magazzino, cg uscite, ingredienti; cap 50k fatture) | misti | M |
| A7-07 | LOW | Compressione JSON assente/non verificabile (gzip_types senza application/json) | infra | S |
| A7-08 | LOW | substr(data_fattura) non sargable nelle stats fatture | acquisti | S |
| A7-09 | LOW | _ensure_tables (DDL+commit) a ogni request fe_import | acquisti | S |
| A7-10 | LOW | clienti.sqlite3 26 MB, bloat da misurare | clienti | S |

**Totale: 0 CRIT, 2 HIGH, 4 MED, 4 LOW.**

Nota di priorità: A7-01 + A7-02 + A7-05 insieme coprono [stima] la quota dominante della latenza percepita (Home, elenco fatture, carta vini cliente). A7-01 era già auto-diagnosticato dal progetto in `docs/analisi_hardening_vps.md` §3.A e mai eseguito.
