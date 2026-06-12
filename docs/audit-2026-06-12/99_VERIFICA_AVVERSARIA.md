# A10 — Verifica avversaria (2026-06-12)

> Subagente A10. Mandato: tentare di SMENTIRE i finding degli altri subagenti rileggendo le evidenze
> direttamente nel codice al commit `1f5f9c17`. Nessuna modifica a codice/DB/config. Le evidenze live
> (ssh/curl) sono quelle già acquisite dall'orchestratore in `raw_A6_live.md`.

---

## 1. Metodo e campione

**Metodo per ogni finding:** (a) rilettura dell'evidenza citata (`file:linea`) direttamente nel sorgente; (b) ricerca attiva della smentita: grep per usi alternativi, middleware globali in `main.py`, dependencies nel mount (`_mount`), config di deploy, fallback/override; (c) verifica di coerenza interna per i finding basati su probe live; (d) verdetto motivato.

**Campione (22 finding):**
- **Tutti e 3 i CRIT** (obbligatori): A1-01, A9-01, A9-02.
- **14 HIGH**: A1-02, A1-03, A1-04, A2-01, A3-01, A5-01, A5-02, A6-13, A7-02, A8-02, A9-03, A9-04, A9-05, A9-06.
- **5 MED a campione, uno per area diversa** (criterio dichiarato: copertura trasversale + un caso di possibile contraddizione tra report):
  - **A3-12** (backend/FE) — scelto perché in apparente CONFLITTO con A4-04: cita file che A4 dichiara morti.
  - **A4-03** (frontend) — stesso tema trailing slash, per controprova del metodo di A4.
  - **A2-02** (integrità dati) — claim "tabella zombie ricreata a ogni boot", verificabile al 100% staticamente.
  - **A5-05** (architettura) — unico import cross-modulo dichiarato: se fosse sbagliato, invaliderebbe il censimento "completo" di A5.
  - **A7-05** (performance) — incrocia un dato live (probe carta-cliente) con una stima statica: buon test della calibrazione delle stime di A7.

---

## 2. Verifiche per finding

### CRIT

**[A1-01] Banca senza autenticazione — CONFERMATO (CRIT)**
Claim: tutti i 28 endpoint `/banca/*` senza auth, leggibili/scrivibili da chiunque.
Verificato: `app/routers/banca_router.py:39` `router = APIRouter(prefix="/banca", tags=["banca"])` — nessun `dependencies=`; `grep get_current_user` sul file = 0 occorrenze. Mount: `main.py:649` `_mount("banca_router", banca_router.router)` senza kwargs; `_mount()` (main.py:589-595) non aggiunge dependencies. Smentite cercate: nessun middleware auth globale (`ReadOnlyViewerMiddleware`, main.py:515-538, blocca solo scritture di token *validi* con ruolo viewer; richiesta senza token passa al router). **Conferma live**: `GET /banca/movimenti` senza token → 200, 929 movimenti reali (raw_A6_live.md §6). Severità CRIT corretta.

**[A9-01] Mig 047/048 inseriscono prestiti BPM reali, non flaggate TRGB_SPECIFIC — CONFERMATO (CRIT)**
Verificato: `047_prestiti_bpm.py` fa `INSERT INTO cg_spese_fisse` + INSERT in loop su `cg_uscite` con dati reali ("Prestito BPM 1/2", 72+120 rate); `048_cg_piano_rate.py:32` popola da quei prestiti. `grep TRGB_SPECIFIC` su 047/048 = 0; flag presente solo in 097/099/100. Il runner (`migration_runner.py:127`) salta SOLO le flaggate quando `locale != tregobbi`. Smentita cercata: nessun guard interno alle 047/048 che le limiti per locale; girano su `foodcost.db`, l'unico DB che il runner processa, quindi su un'istanza nuova le rate finiscono nel CG del cliente. Severità CRIT corretta (leak dati personali + contabilità sporcata dal giorno 1).

**[A9-02] SECRET_KEY default hardcoded, non settata dal runbook — CONFERMATO (CRIT, con correzione di un dettaglio)**
Verificato: `app/core/config.py:4` `SECRET_KEY = os.getenv("SECRET_KEY", "trgb_secret_key_2025")`; unit systemd del runbook (`installazione_nuovo_server.md:248-249`) setta solo PYTHONPATH e TRGB_LOCALE; grep `SECRET_KEY` su `locali/` e su tutto il runbook = 0; nessuna menzione di creare un `.env`. `main.py:6-9` carica `load_dotenv()` se presente.
**Correzione doverosa**: il claim "tutte le installazioni (osteria, demo, futuri clienti) firmano con la stessa chiave" è SMENTITO per l'osteria — il live (raw_A6_live.md §6) mostra che sul VPS tregobbi esiste `.env` con una riga `SECRET*` → la chiave in produzione tregobbi è quasi certamente custom. Il cuore del finding però regge intatto: ogni installazione che segue il runbook alla lettera firma JWT con la chiave di default presente nel repo pubblico → token superadmin forgiabili. Per readiness prodotto resta CRIT (bloccante pre-cliente #1), con impatto da riformulare: "ogni NUOVA installazione da runbook", non "tutte".

### HIGH

**[A1-02] iPratico senza auth — CONFERMATO (HIGH), 404 del probe spiegato**
Il mandato chiedeva di chiarire il 404 live su `/vini/ipratico/products`. Verificato: il router (`ipratico_products_router.py:30`, prefix `/vini/ipratico`) NON ha un endpoint `/products` — gli endpoint reali sono `/upload` (POST, :111), `/mappings` (:206), `/trgb-wines` (:302), `/export` (POST, :328), `/missing`, `/sync-log`, `/stats`, `/export-defaults` ecc. Il 404 del probe è quindi un **path sbagliato nel probe**, non una smentita. `grep -c get_current_user` sul file = **0**; router montato (`main.py:667`) e attivo su tregobbi (mappato in `vini/module.json:15`, modulo attivo con wildcard). Upload pubblico che scrive su disco confermato. HIGH corretta.

**[A1-03] SECRET_KEY runtime tregobbi — RIDIMENSIONATO (HIGH → MED)**
Il finding stesso diceva "il fallback hardcoded è *probabilmente* attivo in produzione" perché `env.production` non contiene SECRET_KEY. Il live ha smentito la parte probabilistica: `python-dotenv` installato nel venv VPS + `.env` da 76 byte con riga `SECRET*` + `main.py:6-9` che fa `load_dotenv()` → in produzione tregobbi la chiave è settata. Resta vero e da fixare il design fail-open (fallback noto committato invece di fail-loud al boot), ma l'impatto immediato sull'osteria non c'è. Il rischio sistemico è già coperto (e correttamente pesato) da A9-02. Nuova severità per A1-03: **MED**.

**[A1-04] Login senza rate limit + promessa "blocco 60s" falsa nel manuale — CONFERMATO (HIGH)**
Verificato: grep `limiter|slowapi|RateLimit|lockout|tentativ` su `auth_router.py`, `auth_service.py`, `main.py`, `requirements.txt` = 0 occorrenze; `LoginForm.jsx:69,105-108` accetta PIN 4-6 cifre; `GET /auth/tiles` pubblico (`auth_router.py:11-14`, summary dichiara "pubblico") espone gli username. Il manuale (`04_MANUALE_UTENTE.md:56`) promette davvero "Dopo 3 errori il login si blocca per 60 secondi (anti-bruteforce)" — meccanismo inesistente nel codice. Smentita cercata: nessun `limit_req` nginx documentato (coerente con A6-07); fail2ban copre solo sshd. HIGH corretta.

**[A2-01] Migrazioni skip-if-missing registrate comunque — CONFERMATO (HIGH)**
Verificato: `migration_runner.py:71-89` — `apply_migration()` esegue `upgrade(conn)` e poi INSERISCE SEMPRE in `schema_migrations` (l'unico caso di non-registrazione è un'eccezione). `134_dipendenti_is_amministratore.py:51-53` e `081_dipendenti_nickname.py:28-29` fanno `print("...skip")` + `return` → registrate come applicate. Ordine di boot confermato: `main.py:202` `run_migrations()` "prima di creare l'app" (commento esplicito) → su data/ vergine i DB secondari non esistono ancora → skip sistematico. Controprova del self-heal: grep `nickname|is_amministratore` su `app/models/dipendenti_db.py` = 0 → le colonne non arriverebbero mai. Pattern "skip" presente in 66 file migrazione (ordine di grandezza compatibile col "~40" dichiarato). HIGH corretta.

**[A3-01] stati_pagamento.py mai importato — CONFERMATO (HIGH)**
Verificato: il file esiste (`app/services/stati_pagamento.py`, 3,7 KB); grep repo-wide `from app.services.stati_pagamento|import stati_pagamento` su `app/` e `main.py` = **0 risultati**. Le tuple hardcoded nel CG router ci sono tutte (verificate :724, :996, :1055, :1153, :1203, :1525-1529, :1853, :1875). Smentita cercata: la colonna GENERATED `stato_macro` (alternativa dichiarata nel fix proposto) è usata UNA sola volta (:923, in SELECT) — non sostituisce le whitelist. `roadmap.md:263` marca G.8 "✅ FATTO" citando il service "con costanti centralizzate" → il drift roadmap/codice è reale. HIGH corretta.

**[A5-01] 4 router fuori da module.json sempre montati — CONFERMATO (HIGH)**
Verificato: grep `vini_anagrafiche_router|vini_v2_router|banca_carta_router|piatti_giorno_router` su `core/moduli/*/module.json` = **0 risultati**; `module_loader.py:142-144` → router senza mapping `return True`; i 4 sono montati incondizionatamente (main.py:603-604, 650, 698). La severità HIGH è difendibile: oltre all'effetto su locali parziali (oggi solo prospettico), dimostra che il processo "nuovo router → manifesto" non ha enforcement ed è già derivato 4 volte in ~1 mese — il gating è il claim di vendita del prodotto. CONFERMATO.

**[A5-02] /dashboard/home legge/scrive per moduli spenti — RIDIMENSIONATO (HIGH → MED)**
Evidenza verificata e corretta: `dashboard_router.py` non importa mai `module_loader` (grep = 0); `run_all_checks(dry_run=False)` (:1519-1520) e `trigger_scheduler` (:1527-1528) eseguiti incondizionatamente prima del return (:1532); `_moduli_summary` incondizionato. MA l'impatto è interamente prospettico: oggi NESSUN locale in produzione ha moduli parziali (tregobbi = wildcard, come il finding stesso ammette: "su tregobbi impatto zero"); le "scritture per moduli spenti" avverrebbero su DB vuoti del locale stesso (notifiche/istanze checklist, nessuna perdita dati, nessuna esposizione). Il costo sincrono sulla Home è già contato due volte altrove (A3-08, A7-03). A parità di profilo di rischio con i MED di A5 (A5-03 alert engine, A5-04 route FE), HIGH è sproporzionato: **MED**, da fixare prima del cliente #1 modulare insieme ad A5-03/A5-04.

**[A6-13] PermitRootLogin yes + PasswordAuthentication yes — CONFERMATO (HIGH)**
Finding nato dal live: `sshd_config` con `PermitRootLogin yes` e `PasswordAuthentication yes` espliciti, porta 22 esposta, fail2ban attivo. Verifica documentale incrociata richiesta dal mandato: `grep PermitRootLogin|PasswordAuthentication` su `docs/analisi_hardening_vps.md` = **0 risultati** — il documento di hardening (2026-04-27) copre fail2ban/UFW/Vite/CORS/docs ma NON ha mai censito la config sshd → il problema non era nemmeno tracciato come noto (il live diceva "parzialmente noto — verificarne la sezione": in realtà la sezione non esiste). Coerenza interna del live ok (porta 22 in `ss -tlnp`, fail2ban active, alias `ssh trgb` via chiave). Root login con password su host internet-facing con dati personali: HIGH corretta (fail2ban mitiga, non elimina).

**[A7-02] fe_righe senza indice su fattura_id — CONFERMATO (HIGH)**
Mandato: verificare che l'indice NON esista in migrazioni/schema. Verificato: grep `CREATE INDEX` su tutto `app/` filtrato per `fe_righe` = 0; grep `idx_fe_righe|ON fe_righe` su tutte le migrazioni (inclusa `006_fe_import_fatture.sql`, mai eseguita dal runner) = 0; CREATE TABLE in `fe_import.py:106-119` ha solo PK + FOREIGN KEY (che in SQLite NON crea indice). Consumatore confermato: subquery correlata `(SELECT COUNT(*) FROM fe_righe r WHERE r.fattura_id = f.id)` a `fe_import.py:962`, eseguita per ogni fattura in lista (limit default 500). Doppia conferma indipendente da A2-03 (sqlite_master estratto via strings: nessun indice). HIGH corretta.

**[A8-02] Giornata Ricette 23/05 non documentata — CONFERMATO (HIGH per l'area docs)**
Verificato: `git log --since=2026-05-23 --until=2026-05-24` → 11+ commit reali (3.17 procedimento+stampa scheda, 3.21-3.28 ingredienti/matching, mig 138 "fix critico FK che bloccava ogni salvataggio prezzo" in `361e84a2`); grep `tracciato` e `procedimento` su `modulo_ricette_foodcost.md` = 0+0; `changelog.md` salta da 2026-05-21 (riga 167+) a 2026-05-24 (riga 147); `sessione.md` ha entry 24/05 (solo 3.30) e poi 30/05 — il buco 23/05 esiste. Violazione tripla della disciplina docs confermata. HIGH corretta nel contesto A8 (è il degrado più grosso del delta).

**[A9-03] VITE_API_BASE_URL hardcoded → build cliente punta all'osteria — CONFERMATO (HIGH)**
Verificato: `frontend/.env.production:1` = `VITE_API_BASE_URL=https://trgb.tregobbi.it` (unica riga); `config/api.js:2` la usa direttamente, nessun fallback a `window.location.origin`; runbook §3.3 (righe 130-136) fa solo `npm install && npm run build` senza override; grep `VITE_API` su `vite.config.js` e `push.sh` = 0 → nessun meccanismo per-locale esistente. Smentita cercata: non esiste `.env.production` alternativo né `--mode` per locale. HIGH corretta.

**[A9-04] Runbook con chiave "modules" vs "moduli" → tutti i moduli attivi — CONFERMATO (HIGH)**
Verificato: runbook righe 205-211 esempio `{"modules": [...], "platform_extras": [...]}`; `module_loader.py:78` legge `data.get("moduli", ["*"])` → con chiave "modules" il default è wildcard e :86-87 attiva TUTTO. Vendita modulare vanificata seguendo il doc. Controllati anche gli schemi reali nei `.template`: incompatibilità confermata. HIGH corretta.

**[A9-05] Script backup hardcoded /home/marco + tregobbi — CONFERMATO (HIGH)**
Verificato: `backup_db.sh:28-30` `PROJECT_DIR="/home/marco/trgb/trgb"` + `LOCALE_DATA_DIR=".../locali/tregobbi/data"` (assegnazioni secche, NON `${VAR:-default}` → nessun override via env possibile); `check_backup_health.sh:28-36` idem incluso `VENV_PYTHON=/home/marco/...`. Per un VPS cliente con user/locale diversi i backup non girano o backuppano la dir sbagliata — scenario S60-INC1 senza rete di salvataggio. HIGH corretta.

**[A9-06] push.sh -l: 4 sezioni restano hardcoded — CONFERMATO (HIGH)**
Verificato riga per riga: :416+:422 auto-detect modules.json su `locali/tregobbi/data/` (locale e remoto, hardcoded anche con `-l cliente_x`); :498+:511 `cd $VPS_DIR/app/data` per il restore runtime; :528 `systemctl restart trgb-backend` fisso con `-m`; :543-544 `trgb-backend`/`trgb-frontend` fissi con `-f`; :194-195 stato backup da `$VPS_DIR/app/data/backups/` legacy. Controprova: il meccanismo `-l` + source `env.production` (:41-84) funziona davvero e definisce le variabili giuste (`$BACKEND_SERVICE` ecc. disponibili post-source) — sono proprio i 4 punti citati a non usarle. HIGH corretta (con `-l cliente_x -m` su VPS condiviso si riavvierebbe il backend dell'osteria).

### MED (campione)

**[A3-12] Trailing slash /dipendenti mancante, "regressione S40-1" — SMENTITO**
Claim: `pages/admin/DipendentiTurni.jsx:107` e `pages/admin/DipendentiAnagrafica.jsx:141` chiamano `/dipendenti` senza slash → rischio 401 su pagine vive.
Smentita trovata: **i due file citati sono MORTI**. `App.jsx` importa esclusivamente le versioni in `pages/dipendenti/` (App.jsx:78-79,86; route :427,:431,:434); grep repo-wide per import di `admin/DipendentiTurni|admin/DipendentiAnagrafica|admin/DipendentiCosti` = zero call-site. Le versioni VIVE sono conformi: `pages/dipendenti/DipendentiTurni.jsx:109` → `${API_BASE}/dipendenti/` (con slash), `pages/dipendenti/DipendentiAnagrafica.jsx:200` → POST su `${API_BASE}/dipendenti/` (con slash). Nessuna regressione S40-1 nel codice eseguito; il fix S40-1 è vivo e applicato. Il residuo reale (file morti con pattern vietati, rischio copia) è già correttamente coperto da **A4-04 (LOW)** — che peraltro aveva esplicitamente identificato la natura morta dei file, dimostrando maggior accuratezza di A3 su questo punto. A3-12 va eliminato dal report consolidato (o assorbito in A4-04). Cade anche la nota A3 §4 "severità sale a HIGH se il POST fallisce in prod".

**[A4-03] CambioPIN chiama /auth/users senza slash — CONFERMATO (MED)**
Verificato: `CambioPIN.jsx:34` `fetch(\`${API}/auth/users\`...)` senza slash; backend `users_router.py:22` prefix `/auth/users` + `:50 @router.get("/")` → 307 redirect con rischio perdita header Auth (regola CLAUDE.md). Le altre due chiamate del file (:60, :85) hanno path con segmenti extra → non affette. Pagina viva (App.jsx route /cambio-pin). Controprova incrociata col caso A3-12: qui il file È importato e vivo. MED corretta.

**[A2-02] Tabella zombie vini_magazzino ricreata a ogni boot — CONFERMATO (MED)**
Verificato: `vini_magazzino_db.py:118` `CREATE TABLE IF NOT EXISTS vini_magazzino` dentro `init_magazzino_database()`, chiamata a import del router (`vini_magazzino_router.py:283`) → a ogni boot. Grep `FROM|INTO|UPDATE|JOIN vini_magazzino ` (spazio finale, esclude _legacy e migrazioni) su `app/` = **0 usi applicativi** → tabella davvero zombie. DDL a ogni boot = pattern segnalato rischioso nella RCA S52-1. MED corretta.

**[A5-05] turni_service importa router di cassa — CONFERMATO (MED)**
Verificato: `turni_service.py:655` `from app.routers.closures_config_router import get_closures_config` (import lazy dentro funzione, con fallback); `closures_config_router` appartiene a cassa (`cassa/module.json:12`), `turni_router` a dipendenti (`dipendenti/module.json:12`). Violazione regola 2/4 reale, mitigata dal try/except. MED corretta.

**[A7-05] carta-cliente/data senza cache — RIDIMENSIONATO (MED → LOW)**
Evidenza statica corretta: grep `_CACHE|Cache-Control|lru_cache` su `vini_router.py` = 0 per l'endpoint :132 (a differenza di branding/strings che la cache ce l'hanno). MA il live (raw_A6_live.md §6) smentisce la calibrazione dell'impatto: payload reale **67.852 byte** (il finding stimava "centinaia di KB"), TTFB **89 ms** — performance attuale buona. Il rischio residuo (burst ore di servizio su processo singolo, 4G) è speculativo e in larga parte assorbito da A7-01 (Vite dev server), che è il vero collo di bottiglia della pagina QR. Fix comunque sensato e a costo S, ma come **LOW**.

---

## 3. Tabella riassuntiva

| ID | Area | Sev. originale | Verdetto | Nuova sev. |
|---|---|---|---|---|
| A1-01 | Sicurezza | CRIT | **CONFERMATO** | CRIT |
| A9-01 | Readiness | CRIT | **CONFERMATO** | CRIT |
| A9-02 | Readiness | CRIT | **CONFERMATO** (correggere claim: vale per nuove installazioni, non per l'osteria) | CRIT |
| A1-02 | Sicurezza | HIGH | **CONFERMATO** (404 live = path probe inesistente, non smentita) | HIGH |
| A1-03 | Sicurezza | HIGH | **RIDIMENSIONATO** (live: .env con SECRET* sul VPS tregobbi) | MED |
| A1-04 | Sicurezza | HIGH | **CONFERMATO** | HIGH |
| A2-01 | Dati | HIGH | **CONFERMATO** | HIGH |
| A3-01 | Backend | HIGH | **CONFERMATO** | HIGH |
| A5-01 | Architettura | HIGH | **CONFERMATO** | HIGH |
| A5-02 | Architettura | HIGH | **RIDIMENSIONATO** (impatto solo prospettico, nessun locale parziale in prod; costo sync già contato in A3-08/A7-03) | MED |
| A6-13 | Infra (live) | HIGH | **CONFERMATO** (e il problema NON era tracciato in analisi_hardening_vps.md) | HIGH |
| A7-02 | Performance | HIGH | **CONFERMATO** | HIGH |
| A8-02 | Docs | HIGH | **CONFERMATO** | HIGH |
| A9-03 | Readiness | HIGH | **CONFERMATO** | HIGH |
| A9-04 | Readiness | HIGH | **CONFERMATO** | HIGH |
| A9-05 | Readiness | HIGH | **CONFERMATO** | HIGH |
| A9-06 | Readiness | HIGH | **CONFERMATO** | HIGH |
| A3-12 | Backend | MED | **SMENTITO** (file citati morti; codice vivo conforme, fix S40-1 applicato) | — (assorbire in A4-04 LOW) |
| A4-03 | Frontend | MED | **CONFERMATO** | MED |
| A2-02 | Dati | MED | **CONFERMATO** | MED |
| A5-05 | Architettura | MED | **CONFERMATO** | MED |
| A7-05 | Performance | MED | **RIDIMENSIONATO** (live: 67 KB / 89 ms TTFB; stima impatto sovradimensionata) | LOW |

## 4. Tasso di conferma e valutazione complessiva

- **Campionati: 22** (3 CRIT, 14 HIGH, 5 MED).
- **Confermati pieni: 18/22 = 82%.**
- **Ridimensionati: 3/22 = 14%** (A1-03, A5-02, A7-05 — tutti VERI nel merito, severità da abbassare di un gradino).
- **Smentiti: 1/22 = 4%** (A3-12).
- **Tasso di "sostanzialmente fondati" (confermati + ridimensionati): 21/22 = 95%.**

**Valutazione affidabilità dell'audit: ALTA.** Le evidenze `file:linea` sono risultate accurate in 21 casi su 22 (e anche nel caso smentito i numeri di riga erano corretti: l'errore era non aver verificato che i file fossero importati). I 3 CRIT reggono tutti alla verifica avversaria e sono i fix giusti da fare per primi. Pattern osservati:
1. **Le verifiche incrociate tra aree funzionano**: l'unico smentito (A3-12) era già contraddetto da A4-04 nello stesso ciclo di audit — nel consolidato, in caso di conflitto tra report, A4 era quello accurato.
2. **Le stime d'impatto senza dati live tendono al pessimismo** (A7-05 payload sovrastimato 3-4×, A1-03 "probabilmente attivo" smentito): dove il live esiste, va sempre preferito alla deduzione.
3. **I finding A5 in ottica prodotto vanno letti con la lente "prospettico vs attuale"**: A5-01/A5-02 hanno la stessa classe di impatto ma severità diverse; suggerita uniformazione (A5-01 HIGH per il drift di processo già in atto, A5-02 MED).
4. **Probe live con path sbagliato** (A1-02): il 404 su `/vini/ipratico/products` era un falso negativo del probe, non del finding — per i retest usare i path reali (`/vini/ipratico/upload`, `/trgb-wines`, `/stats`).
