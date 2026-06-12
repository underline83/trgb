# Audit TRGB 2026-06-12 — 07 PERFORMANCE

> **Data:** 2026-06-12 · **Commit:** `1f5f9c17` (main) · **Versione:** 5.24
> **Fonti:** `raw_A7.md` (analisi statica codice/migrazioni/config) + `raw_A2_live.md` (conteggi righe DB via copie immutable) + `raw_A6_live.md` §6 (timing live) + verdetti `99_VERIFICA_AVVERSARIA.md` (A7-02 confermato HIGH; A7-05 ridimensionato MED→LOW).
>
> ## **VOTO AREA PERFORMANCE: 68/100**

---

## 1. Metodologia

Il subagente A7 ha lavorato in modalità statica (rete e sqlite3 negati dalla sandbox): query dal codice + presenza/assenza di indici nelle migrazioni, con dimensioni file DB come proxy del volume. Le lacune sono state colmate dall'orchestratore: **probe HTTP live** (raw_A6_live.md §6) e **conteggi righe reali** sui DB copiati in modalità `immutable=1` (raw_A2_live.md). Dove un'affermazione resta una stima, è marcata [stima]. La verifica avversaria ha rilevato che le stime statiche di A7 tendevano al pessimismo (A7-05 ricalibrato sui dati live).

**Volumi reali (live/misurati):**

| Dato | Valore |
|---|---|
| `fe_righe` | **11.392 righe — ZERO indici** (`sqlite_master`: nessun indice sulla tabella) |
| `fe_fatture` | 1.573 righe |
| `daily_closures` / `shift_closures` | 2.191 / 168 righe |
| `clienti.sqlite3` | 26 MB (il DB più grande) |
| `foodcost.db` | 8,6 MB |
| `vini_magazzino.sqlite3` | 3,2 MB |

---

## 2. Timing live (probe 2026-06-12, GET non distruttivi)

| Endpoint | TTFB | Size | Note |
|---|---|---|---|
| `GET https://trgb.tregobbi.it/system/info` | **56 ms** | piccolo | valori cached al boot (main.py:145-151) ✅ |
| `GET /vini/carta-cliente/data` | **89 ms** | **67,9 KB** | pubblico (QR), nessuna cache — vedi A7-05 |
| `GET https://app.tregobbi.it/` (index FE) | **56 ms** | 7,6 KB | servito dal dev server Vite — vedi A7-01 |
| `GET /carta` su trgb.tregobbi.it | 404 | — | la carta pubblica vive su app.tregobbi.it/carta (200); trgb.tregobbi.it = API, app.tregobbi.it = FE |

**Lettura:** la performance live di base è **buona** (TTFB API sotto i 100ms, VPS scarico: load 0.00, RAM 1.7/15G). I finding di quest'area non descrivono lentezza percepita oggi, ma **colli di bottiglia strutturali che crescono linearmente col dato** (fe_righe, elenchi non paginati) e il costo nascosto del dev server in produzione (centinaia di moduli ES non bundlati, invisibile al TTFB dell'index ma dominante sul tempo di pagina completa su 4G).

**Valutazione cache endpoint pubblici:** `/system/info`, `/system/modules` cached al boot ✅; `/locale/branding.json` cache in-process (_BRANDING_CACHE) ✅ ma senza header Cache-Control (assorbito in A7-07); `/locale/strings.json` cache TTL 60s ✅; `/vini/carta-cliente/data` nessuna cache (A7-05).

---

## 3. Finding

```
[A7-01] SEVERITÀ: HIGH (noto — roadmap T.2b ALTA; stesso tema di A4-01/A6-03, qui la lente performance)
Titolo: Frontend di produzione servito dal dev server Vite (npm run dev), non da una build statica
Evidenza: analisi_hardening_vps.md:15,60; deploy.md:231 (proxy_pass 127.0.0.1:5173); nessun
  "npm run build" in scripts/deploy.sh né nell'hook post-receive; vite.config.js:150
  allowedHosts: ["app.tregobbi.it"] nel blocco server. CONFERMA LIVE: processo node su 5173 attivo.
Impatto: nessuna minificazione né bundling: ogni pagina scarica centinaia di moduli ES singoli
  trasformati on-demand. L'intero lavoro di code-splitting (React.lazy + manualChunks) NON ha
  alcun effetto in produzione. Collo di bottiglia n.1 percepito, in particolare sulla carta vini
  via QR su 4G. Costo CPU/RAM costante del processo Vite sul VPS.
Fix proposto: npm run build nel deploy + nginx serve frontend/dist/ con gzip e Cache-Control
  immutable sugli asset hashati (template pronto in deploy/sites/trgb.it/nginx.conf:42-56);
  eliminare trgb-frontend.service. — Effort: M
Modulo: infra
```

```
[A7-02] SEVERITÀ: HIGH — CONFERMATO da verifica avversaria e QUANTIFICATO live
Titolo: fe_righe (11.392 righe) senza alcun indice — la tabella più interrogata di foodcost.db va
  sempre in SCAN
Evidenza: NUMERI LIVE (raw_A2_live.md): fe_righe = 11.392 righe, fe_fatture = 1.573;
  `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='fe_righe'` → VUOTO (zero indici,
  nemmeno su fattura_id). Creazione tabella: fe_import.py:106-119 (solo PK; la FOREIGN KEY in
  SQLite NON crea indice). Verifica avversaria: grep CREATE INDEX su tutto app/ e su tutte le
  migrazioni filtrato per fe_righe = 0 (doppia conferma indipendente da A2-03).
  Consumatori: fe_import.py:962 — subquery correlata `(SELECT COUNT(*) FROM fe_righe r WHERE
  r.fattura_id = f.id)` eseguita PER OGNI fattura della lista (limit default 500 → 500 scan
  completi da 11.392 righe = ~5,7M righe esaminate per UNA chiamata a GET /fe/fatture);
  conto_economico.py:236 (JOIN); foodcost_matching_router.py:296,340,453,605,990,1158,1672,1896.
Impatto: costo O(N_fatture × N_righe) su elenco fatture, conto economico CG e matching ricette;
  degrada linearmente con ogni nuova fattura importata (~10 nuove righe fe_righe a fattura).
Fix proposto: migrazione idempotente `CREATE INDEX IF NOT EXISTS idx_fe_righe_fattura ON
  fe_righe(fattura_id);` (solo ADD, compatibile con le regole R). Il fix a più alto rapporto
  beneficio/costo dell'intera area. — Effort: S
Modulo: acquisti
```

```
[A7-03] SEVERITÀ: MED
Titolo: GET /dashboard/home esegue alert engine completo + task scheduler in modo SINCRONO a ogni
  apertura della Home
Evidenza: dashboard_router.py:1515-1530 — il commento dice "fire-and-forget" ma run_all_checks
  (dry_run=False) e trigger_scheduler(days_ahead=1) sono chiamate inline nel corpo della request
  (nessun BackgroundTasks/thread). run_all_checks esegue 6 checker su DB diversi. L'anti-duplicato
  (alert_engine.py:139) evita solo lo spam di notifiche, NON il costo delle query: scansione
  completa a OGNI load della Home, per ogni utente.
Impatto: TTFB della pagina più aperta dell'app gonfiato da ~10+ query cross-DB non necessarie alla
  risposta. (Stesso punto di codice del finding architetturale A5-02: qui il costo, lì il gating moduli.)
Fix proposto: spostare i due trigger in BackgroundTasks di FastAPI + throttle in-process
  (max 1 run ogni 10 min). — Effort: S
Modulo: platform
```

```
[A7-04] SEVERITÀ: MED
Titolo: Matching ricette — query "righe pending" senza LIMIT con 3 sub-select NOT IN e JOIN con
  condizione OR
Evidenza: foodcost_matching_router.py:282-317 — SELECT su fe_righe (11.392 righe, senza indici:
  vedi A7-02) JOIN fe_fatture con LEFT JOIN su condizione OR (impedisce l'uso di indici → nested
  loop), tre filtri NOT IN (SELECT ...) e UPPER(TRIM(r.descrizione)) NOT IN (funzioni su colonna →
  non indicizzabile), nessun LIMIT: ritorna TUTTE le righe non matchate.
Impatto: la pagina RicetteMatching paga a ogni load una query quadratica sulla tabella più grande
  di foodcost.db + serializzazione JSON di tutte le righe pending. Peggiora a ogni import.
Fix proposto: paginazione (LIMIT/OFFSET + count separato); riscrivere gli OR-join in UNION o
  normalizzare fornitore_key; beneficia anche dell'indice A7-02. — Effort: M
Modulo: ricette
```

```
[A7-06] SEVERITÀ: MED
Titolo: Endpoint elenco senza paginazione (full table scan + serializzazione completa a ogni chiamata)
Evidenza (i peggiori):
  1. GET /vini/magazzino/ → vini_magazzino_db.py:1234-1240: SELECT * ORDER BY 5 colonne, nessun
     LIMIT [stima 1-3k righe, DB 3,2 MB; tutte le colonne incluse note/locazioni].
  2. GET /cg/uscite → controllo_gestione_router.py:840-915+: triple JOIN (cg_uscite + fe_fatture
     + fe_fornitore_categoria) senza LIMIT — l'intero scadenzario storico a ogni load.
  3. GET /foodcost/ingredients/ → foodcost_ingredients_router.py:328-402: nessun LIMIT + 2 subquery
     correlate per ingrediente (su tabella indicizzata, mitigato).
  4. GET /fe/fatture → fe_import.py:877: paginato ma `limit le=50000` — il client può chiedere
     l'intero archivio (1.573 fatture × subquery A7-02) in una risposta sola.
  5. /vini/carta-staff/ full-list (accettabile, è la carta); movimenti-globali paginato ✅.
Impatto: pagine elenco che rallentano linearmente con la crescita dei dati; su VPS single-process
  ogni richiesta grossa blocca un worker e gonfia il transfer (vedi A7-07).
Fix proposto: limit/offset di default (200, cap 2000) sui 3 endpoint non paginati; abbassare il
  cap di /fe/fatture a 2000. — Effort: M (FE da adeguare)
Modulo: vini / controllo_gestione / ricette / acquisti
```

```
[A7-05] SEVERITÀ: LOW (ridimensionato da MED in verifica avversaria sui dati live)
Titolo: /vini/carta-cliente/data (pubblico, dietro QR ai tavoli) ricostruisce l'intera carta a ogni
  request, senza cache in-process né Cache-Control
Evidenza: vini_router.py:132-293 — a ogni GET: load_vini_calici() + load_vini_ordinati() (carta
  completa), raggruppamento nested in Python, più tutte le sezioni bevande (:253-281). Nessuna
  cache (a differenza di branding/strings). Unico Cache-Control in tutto il backend: un no-store
  in turni_router.py:853. Il FE pubblico fetcha a ogni mount (CartaClienti.jsx:529).
  RICALIBRAZIONE LIVE: payload reale 67,9 KB (la stima statica "centinaia di KB" era
  sovradimensionata 3-4×), TTFB 89 ms — performance attuale buona. Il rischio residuo (burst nelle
  ore di servizio su processo singolo, 4G) è speculativo e in larga parte assorbito da A7-01, il
  vero collo di bottiglia della pagina QR.
Impatto: rigenerazione evitabile per ogni cliente che inquadra il QR; oggi non misurabile come
  problema, diventa rilevante solo sotto burst.
Fix proposto (comunque sensato, costo minimo): cache in-process TTL 60-300s (stesso pattern di
  _BRANDING_CACHE) invalidata sulle mutazioni vini + header Cache-Control: public, max-age=300.
  — Effort: S
Modulo: vini
```

```
[A7-07] SEVERITÀ: LOW
Titolo: Nessuna compressione applicativa dei JSON e gzip nginx incompleto per application/json
Evidenza: nessun GZipMiddleware in main.py (middleware presenti: CORS + ReadOnlyViewerMiddleware).
  La config nginx di produzione non è versionata nel repo; l'unica versionata
  (deploy/sites/trgb.it/nginx.conf:43) ha gzip_types SENZA application/json: se la prod è analoga,
  le risposte API (inclusi i 67,9 KB della carta-cliente e gli elenchi di A7-06) viaggiano non
  compresse.
Impatto: payload JSON 3-8x più grandi del necessario su mobile/4G.
Fix proposto: aggiungere application/json a gzip_types nella config prod (e nel template repo),
  oppure GZipMiddleware(minimum_size=1000) in main.py. Verifica rapida:
  `curl -sI -H "Accept-Encoding: gzip" https://trgb.tregobbi.it/locale/strings.json`. — Effort: S
Modulo: infra
```

```
[A7-08] SEVERITÀ: LOW
Titolo: Filtri e aggregazioni su substr(data_fattura) non indicizzabili — full scan di fe_fatture
  su ogni dashboard/stats
Evidenza: fe_import.py:894-900 (substr(f.data_fattura,1,4) = ?, substr(...,6,2) = ?) e pattern
  analoghi negli endpoint /fe/stats/* (:2033, :2107, :2185, :2235); funzione su colonna → SQLite
  non può usare un eventuale indice.
Impatto: scan completo di fe_fatture (1.573 righe → oggi millisecondi) per ogni filtro anno/mese e
  ogni widget stats; cresce linearmente. Bassa perché fe_fatture è ~7× più piccola di fe_righe.
Fix proposto: range sargable (data_fattura >= 'YYYY-01-01' AND < ...) + indice su data_fattura. — Effort: S
Modulo: acquisti
```

```
[A7-09] SEVERITÀ: LOW
Titolo: _ensure_tables() eseguito a ogni request del router fatture (DDL + probe + commit per ogni GET)
Evidenza: fe_import.py:58-123 — 2 CREATE TABLE IF NOT EXISTS + SELECT-probe colonne + conn.commit();
  chiamato in 19 endpoint (incluso list_fatture :881).
Impatto: overhead fisso (parse DDL + lock schema + commit) su ogni chiamata API del modulo acquisti;
  ridondante visto che le migrazioni girano al boot.
Fix proposto: spostare _ensure_tables in startup del modulo (una volta per processo, flag
  module-level). — Effort: S
Modulo: acquisti
```

```
[A7-10] SEVERITÀ: LOW
Titolo: clienti.sqlite3 = 26 MB (3x foodcost.db) — probabile bloat da misurare
Evidenza: il DB più grande del sistema. Tabelle candidate (da clienti_db.py): prenotazioni_email_log
  (:382 — corpi email), clienti_import_diff (:230 — diff di ogni import), clienti_prenotazioni
  (storico completo). Breakdown per tabella non ancora eseguito.
Impatto: query CRM/prenotazioni e backup più lenti del necessario se il grosso è log storico;
  26 MB restano gestibili, ma il trend va misurato.
Fix proposto: `sqlite3 clienti.sqlite3 "SELECT name, SUM(pgsize) FROM dbstat GROUP BY name ORDER BY
  2 DESC LIMIT 10;"`; se è email_log/import_diff → retention 12 mesi + VACUUM. — Effort: S (analisi) / M (retention)
Modulo: clienti
```

---

## 4. Punti VERDI (verificati, nessun finding)

| Area | Evidenza |
|---|---|
| **Performance live di base buona** | TTFB /system/info 56ms, carta-cliente 89ms, index FE 56ms/7,6KB; VPS scarico (load 0.00) |
| Code splitting FE ben progettato | React.lazy + Suspense per ~150 pagine; manualChunks (vendor-react/charts/router, module-*) — **ma inefficace finché vige A7-01** |
| Dipendenze FE sobrie | 6 dependencies; recharts isolata in vendor-charts; niente xlsx/moment/lodash |
| branding/strings cached | _BRANDING_CACHE (main.py:433-466), strings TTL 60s |
| Paginazione corretta dove conta | banca /movimenti (le=2000), clienti (limit ovunque), statistiche /prodotti (le=500) |
| Indici presenti su tabelle calde (escluso fe_righe) | ingredient_prices, banca_movimenti, ipratico_prodotti, cg_uscite, clienti |
| /system/info, /system/modules | valori letti al boot e cached |

---

## 5. Tabella riassuntiva

| ID | Sev | Titolo breve | Modulo | Effort |
|---|---|---|---|---|
| A7-01 | HIGH | Vite dev server in produzione (no build statica) | infra | M |
| A7-02 | HIGH | fe_righe 11.392 righe, ZERO indici → SCAN ovunque | acquisti | S |
| A7-03 | MED | Alert engine + scheduler sincroni in GET /dashboard/home | platform | S |
| A7-04 | MED | Matching /pending: query OR-join + 3 NOT IN, no LIMIT | ricette | M |
| A7-06 | MED | Elenchi senza paginazione (vini magazzino, cg uscite, ingredienti; cap 50k) | misti | M |
| A7-05 | LOW ↓ | carta-cliente/data senza cache (live: 67,9 KB / 89 ms — impatto ricalibrato) | vini | S |
| A7-07 | LOW | gzip_types senza application/json, nessun GZipMiddleware | infra | S |
| A7-08 | LOW | substr(data_fattura) non sargable nelle stats fatture | acquisti | S |
| A7-09 | LOW | _ensure_tables (DDL+commit) a ogni request fe_import | acquisti | S |
| A7-10 | LOW | clienti.sqlite3 26 MB, bloat da misurare | clienti | S |

**Totali: 0 CRIT · 2 HIGH · 3 MED · 5 LOW.**

**Priorità:** A7-02 è il quick win assoluto (una migrazione da 1 riga elimina milioni di righe esaminate per chiamata su elenco fatture, conto economico e matching); A7-01 è il fix strutturale a maggior impatto percepito (carta QR su 4G). Insieme coprono la quota dominante della latenza prospettica.

**Voto area Performance: 68/100** — performance live attuale buona (TTFB <100ms, VPS scarico) e pattern corretti dove conta (cache boot, paginazione banca/clienti, code splitting progettato bene); pesano i due HIGH strutturali — un indice mancante sulla tabella più interrogata e un dev server in produzione che vanifica tutto il lavoro di bundling — più il debito degli elenchi non paginati che crescerà col dato.
