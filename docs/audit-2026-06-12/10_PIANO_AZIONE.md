# 10 — Piano d'azione consolidato

**Data:** 2026-06-12 · **Commit:** `1f5f9c17` · **Versione prodotto:** 5.24
**Fonti:** raw_A1…raw_A9 + raw_A2_live + raw_A6_live + 99_VERIFICA_AVVERSARIA (correzioni applicate).

## 0. Correzioni post-verifica applicate al consolidato

| Correzione | Motivo |
|---|---|
| **A3-12 RIMOSSO** | Smentito dall'avversaria: i file citati sono morti (mai importati); il codice vivo in `pages/dipendenti/` ha lo slash corretto, fix S40-1 applicato. Residuo coperto da A4-04 (LOW) |
| **A6-01 RIMOSSO** | Risolto live: l'orchestratore ha rieseguito tutta la checklist §8 via ssh (`raw_A6_live.md`) — VPS sano, backup 15/15 OK, versione allineata |
| **A1-03: HIGH → MED** | Live: sul VPS tregobbi esiste `.env` con SECRET* → fallback non attivo in produzione osteria. Resta il design fail-open da fixare; rischio sistemico coperto da A9-02 |
| **A5-02: HIGH → MED** | Impatto interamente prospettico (nessun locale con moduli parziali in prod); costo sync già contato in A3-08/A7-03 |
| **A7-05: MED → LOW** | Live: payload 67 KB / TTFB 89 ms — stima impatto sovradimensionata; collo di bottiglia reale è A7-01 |
| **A6-09: LOW → MED** | Confermato live: header sicurezza ASSENTI su entrambi i domini (+ versione nginx esposta) |
| **A6-12 NUOVO (HIGH)** | Live: porte **3389 (RDP)** e **9000/9443 (probabile Portainer)** esposte su 0.0.0.0 su server di produzione con dati personali |
| **A6-13 NUOVO (HIGH)** | Live: `sshd_config` con **PermitRootLogin yes + PasswordAuthentication yes** espliciti, porta 22 esposta (fail2ban attivo mitiga, non elimina). Mai censito nemmeno in analisi_hardening_vps.md |
| **A9-02: impatto riformulato** | Vale per le NUOVE installazioni da runbook (e per il demo trgb.it), non per tregobbi che ha `.env`. Resta CRIT per la readiness prodotto |

> ## Conteggio consolidato finale: **3 CRIT · 18 HIGH · 46 MED · 43 LOW = 110 finding**
> Affidabilità verificata avversarialmente su 22 campioni (3 CRIT + 14 HIGH + 5 MED): 95% sostanzialmente fondati, 1 solo smentito.

---

## 1. Tabella master (ordinata per priorità)

### 🔴 CRIT (3)

| ID | Titolo | Modulo | Effort | Area |
|---|---|---|---|---|
| **A1-01** | Modulo Banca senza autenticazione — **confermato live: 929 movimenti bancari reali leggibili/modificabili senza token** (fix: 1 riga `dependencies=`) | banca | **S** | Sicurezza |
| **A9-01** | Mig 047/048 inseriscono i prestiti BPM reali di Marco in ogni DB nuovo (non flaggate TRGB_SPECIFIC) | controllo_gestione / platform | **S** | Prodotto |
| **A9-02** | SECRET_KEY default hardcoded, il runbook non la setta → ogni NUOVA installazione firma JWT con chiave pubblica nota (tregobbi salva da `.env`) | platform | **S** | Prodotto |

### 🟠 HIGH (18)

| ID | Titolo | Modulo | Effort | Area |
|---|---|---|---|---|
| A6-13 | SSH: PermitRootLogin yes + PasswordAuthentication yes su host internet-facing (chiavi già in uso) | infra | S | Infra (live) |
| A6-12 | Porte 3389 (RDP) e 9000/9443 (Portainer) esposte a internet sul server di produzione | infra | S | Infra (live) |
| A1-02 | iPratico products senza auth: upload pubblico che scrive su disco + export | vini | S | Sicurezza |
| A1-04 | Login PIN 4-6 cifre senza rate limit/lockout + manuale che promette un "blocco 60s" inesistente; /auth/tiles enumera gli utenti | platform | M | Sicurezza |
| A9-03 | VITE_API_BASE_URL hardcoded → la build di qualsiasi cliente punta al backend dell'osteria | platform | S | Prodotto |
| A9-04 | Runbook con schemi config sbagliati: esempio moduli_attivi attiva TUTTI i moduli | docs/platform | M | Prodotto |
| A9-05 | Script backup hardcoded /home/marco + tregobbi → per il cliente #1 i backup non girano | infra | M | Prodotto |
| A9-06 | push.sh -l: 4 punti restano hardcoded (con -m riavvierebbe il backend dell'osteria) | infra | S | Prodotto |
| A2-01 | ~40-66 migrazioni "skip se DB mancante" registrate comunque → drift schema permanente su installazioni fresche/recovery | platform | M | Dati |
| A5-01 | 4 router post-R8 (vini_anagrafiche, vini_v2, banca_carta, piatti_giorno) fuori da ogni module.json → sempre montati (≅ A3-05) | platform | S | Architettura |
| A3-01 | stati_pagamento.py (SSoT G.8) mai importato: whitelist stati hardcoded in ~10 punti del CG; roadmap dichiara G.8 "FATTO" | controllo_gestione | M | Backend |
| A7-02 | fe_righe (11.392 righe, **zero indici** — confermato live) senza indice su fattura_id: SCAN su elenco fatture, CE, matching (≅ A2-03) | acquisti | S | Performance |
| A7-01 | Frontend di produzione su Vite dev server, non build statica (T.2b) — stesso fix di A4-01 e A6-03 | infra | M | Performance |
| A4-01 | (idem A7-01, prospettiva FE: sourcemap esposti, code-splitting inefficace) | platform | M | Frontend |
| A6-03 | (idem A7-01, prospettiva infra: single point of failure, HMR esposto) | infra | M | Infra |
| A6-02 | Nessun monitoring/alerting esterno di uptime (T.1) — la modalità di fallimento di S60-INC1 | infra | S | Infra |
| A6-04 | Restore test MAI eseguito sui backup (T.7) — catena LKG/Drive non provata end-to-end | infra | M | Infra |
| A8-02 | Giornata Ricette 23/05 (16 commit, 2 migrazioni, 1 fix critico) non documentata da nessuna parte | ricette | M | Docs |

### 🟡 MED (46)

| ID | Titolo breve | Modulo | Effort |
|---|---|---|---|
| A1-03 | SECRET_KEY fallback hardcoded nel repo (design fail-open; prod tregobbi salva da .env) ⬇ da HIGH | platform | S |
| A1-05 | /foodcost/ingredienti senza auth (leak prezzi acquisto) | ricette | S |
| A1-06 | Path traversal potenziale: file.filename non sanitizzato in admin_finance upload | cassa | S |
| A1-07 | Endpoint sensibili (stipendi, PII clienti, import fatture, carta) senza controllo di RUOLO: ogni utente loggato vede tutto | trasversale | M |
| A1-08 | JWT in query string (?token=) sui 7 download PDF vini → leak in log/history/referer | vini | M |
| A2-02 | Tabella zombie vini_magazzino ricreata vuota a ogni boot + **1.240 FK orfane** di ipratico_product_map (live) | vini | S |
| A2-03 | Indice mancante fe_righe(fattura_id) — stesso fix di A7-02 | acquisti | S |
| A2-04 | FK pragma disomogeneo + merge FIC che cancella fe_fatture senza riallineare cg_uscite → **65 cg_entrate orfane confermate live** | acquisti/CG | M |
| A2-05 | K.12 doppia tabella corrispettivi (daily 2.191 righe / shift 168, entrambe vive — live); CHECK che blocca turno='giornaliero' | cassa | L |
| A3-02 | Trio servizi morti admin_finance_* (~600 righe duplicate e divergenti) | cassa | S |
| A3-03 | liquidita_service.py (557 righe) morto + import morto nel CG router | controllo_gestione | S |
| A3-05 | 4 router fuori dal gating moduli — stesso fix di A5-01 | platform | S |
| A3-06 | GET shift-closures/: connessione SQLite per RIGA + N+1, senza filtro date di default | cassa | M |
| A3-07 | N+1 su /vini/v2/madri-raggruppate/ (vista principale cantina) | vini | S |
| A3-08 | Alert engine + task scheduler SINCRONI in /dashboard/home (stesso fix di A7-03) | platform | S |
| A3-09 | Tre `except: pass` sul calcolo saldo cassa contanti → numero sbagliato in silenzio | cassa | S |
| A3-10 | Import corrispettivi: celle malformate → 0.0 silenzioso, date invalide → riga scartata senza avviso | cassa | M |
| A3-11 | Pattern sistemico: conn SQLite senza try/finally e write-path senza rollback nei router soldi | trasversale | M |
| A4-02 | 57 fetch() raw senza apiFetch (~45 in pagine autenticate): niente redirect su 401 | trasversale | M |
| A4-03 | Trailing slash mancante: CambioPIN → /auth/users (pagina viva, errore mascherato da .catch) | platform | S |
| A4-05 | Touch target ~26px sulle 5 azioni stato di PrenotazioniPlanning (uso sala su tablet) | prenotazioni | S |
| A5-02 | /dashboard/home ignora i moduli attivi: legge tutto e SCRIVE per moduli spenti ⬇ da HIGH | platform | M |
| A5-03 | Alert engine M.F non module-aware: 6 checker girano anche per moduli spenti | platform | S |
| A5-04 | Route FE non filtrate: URL diretto apre la pagina di un modulo spento (pagina rotta) | platform | M |
| A5-05 | turni_service importa un router di cassa (unico import cross-modulo) | dipendenti | S |
| A5-06 | SQL diretto cross-modulo nei router senza servizio-ponte né guard (scritture incluse) | trasversale | L |
| A5-07 | logo_tregobbi.png hardcoded in 3 router core; branding.json ignorato (+ headline "OSTERIA TRE GOBBI" in 2 file) — con A3-13 | vini | S/M |
| A6-05 | Off-site limitato a Google Drive (stesso account): 3-2-1 incompleto; rclone sync propaga delezioni | infra | M |
| A6-06 | Swagger /docs e /openapi.json esposti in produzione | infra | S |
| A6-07 | Nessun rate limit nginx su /auth/login (con A1-04) | infra | S |
| A6-08 | Watchdog backup con lista 10 DB hardcoded vs discovery dinamica: un DB nuovo non sarebbe sorvegliato (pattern S60-INC1) | infra | S |
| A6-09 | Header sicurezza HTTP assenti (HSTS, XFO, XCTO) — **confermato live su entrambi i domini** ⬆ da LOW | infra | S |
| A7-03 | Alert engine sincrono in Home — stesso fix di A3-08 | platform | S |
| A7-04 | Matching ricette: query pending con OR-join + 3 NOT IN, senza LIMIT | ricette | M |
| A7-06 | Elenchi senza paginazione (vini magazzino, cg uscite, ingredienti; cap /fe/fatture 50k) | misti | M |
| A8-01 | modulo_task_manager.md / modulo_haccp.md non esistono (unico CRIT docs 19/5 senza stub — DH.5) | task_manager | S |
| A8-03 | Cassa annulli_resi (mig 146) assente dal doc canonico modulo_vendite.md | cassa | S |
| A8-04 | changelog.md senza entry per 3 blocchi di rilasci (Carta CC.*, ricette 3.13-29, vini 3.54-59) | docs | S |
| A8-05 | roadmap.md stantia da 24 giorni: B.7 fatta non spuntata, B-DEBT1 obsoleto | docs | S |
| A8-06 | CLAUDE.md dichiara M.B PDF e M.E Calendar "DA FARE" ma esistono da aprile | platform | S |
| A9-07 | Vhost nginx del runbook incompatibile con le chiamate API reali del FE | docs/infra | S |
| A9-08 | Fallback branding/strings → tregobbi: locale mal configurato mostra "Osteria Tre Gobbi" | platform | S |
| A9-09 | Dual-locale stesso VPS: frontend/dist unico + hook che riavvia solo tregobbi (blocca go-live trgb.it) | infra | M |
| A9-10 | Router unmapped attivi di default per tutti i locali (enforcement DH.7 mancante) | platform | S |
| A9-11 | GDPR: zero documenti per trattare dati personali di un cliente pagante | docs | L (elapsed) |
| A9-12 | PII reali (stipendi, locatori) hardcoded nei docstring di 3 migrazioni distribuite | platform | S |

### 🟢 LOW (43) — raggruppati per tema (tutti gli ID citati)

| Tema | Finding | Note |
|---|---|---|
| **Pulizia dead code / file legacy** (7) | A3-04 (modelli orfani user.py, fe_import.py, core/database.py + vini_model noto V-H.I) · A3-14 (tools/scripts one-shot, noto T.9) · A4-04 (3 pagine morte pages/admin/Dipendenti* — assorbe l'ex A3-12) · A4-10 (axios mai usato) · A2-06 (numerazioni mig duplicate, nuova coppia 134) · A2-08 (006.sql mai eseguita) · A2-10 (tabelle archive/legacy residue nei DB) | Sessione cleanup post-15/6 (V-H.I) |
| **Igiene DB minore** (6) | A2-07 (wal/shm/.fuse_hidden orfani in data/ locale) · A2-09 (prefissi tabelle non conformi — documentale R8) · A2-11 (mig 142: noto, CHIUSO con 143; resta grep guardiano) · A2-12 (dashboard legge finanza_movimenti legacy — freschezza da verificare) · A2-13 (vini.sqlite3 unico non-WAL) · A2-14 (messaggio trigger cg_uscite punta a file inesistente) | In coda alla sessione Igiene DB |
| **Sicurezza minore** (4) | A1-09 (CORS wildcard methods/headers con credentials) · A1-10 (/menu/ pubblico legacy) · A1-11 (JWT 8h senza revoca; sha256_crypt vs bcrypt) · A6-10 (CORS lasco, duplica A1-09 lato infra) | + osservazione trasversale A1: nessun limite dimensione upload |
| **Performance minore** (5) | A7-05 (cache carta-cliente ⬇ da MED: live 67KB/89ms) · A7-07 (gzip senza application/json) · A7-08 (substr non sargable nelle stats fatture) · A7-09 (_ensure_tables DDL a ogni request) · A7-10 (clienti.sqlite3 26MB, bloat da misurare) | |
| **Rifiniture FE** (5) | A4-06 (6 pagine post-M.I senza primitives) · A4-07 (SortTh/sortRows duplicati in 5 pagine) · A4-08 (7 sfondi bg-neutral-50 vs cream) · A4-09 (a11y: 631 input / 71 label associate) · A4-11 (QR carta via servizio esterno) | Opportunistico al tocco del file |
| **Docs da allineare** (6) | A8-07 (header versioni stantii) · A8-08 (checkbox problemi.md stale) · A8-09 (PDF ricette "futuro" ma esiste) · A8-10 (storia IG pranzo) · A8-11 (20 MED + 7 MIN del 19/5 tutti aperti) · A6-11 (checkbox cron stale — **conferma live: i 4 job sono ATTIVI** — + scaffold setup fuori sync) | Sessione Docs catch-up |
| **Disciplina modulare / processo** (5) | A5-08 (commento `# Modulo:` 22/50 router) · A3-15 (idem, 13/51 nel conteggio A3) · A5-09 (cash_deposits in 2 manifesti; ownership piatti_giorno ambigua) · A5-10 (path app/data cedolini — K-tris noto) · A5-11 (3 commit G.3 senza tag, conformità 96,6%) | |
| **Prodotto minore** (5) | A9-13 (licenza/contratto assenti) · A9-14 (scaffold dimentica moduli_attivi) · A9-15 (CORS hardcoded tregobbi) · A9-16 (catena onboarding mai testata — S.2) · A3-13 (logo hardcoded, stesso fix di A5-07) | |

---

## 2. Sessioni di lavoro proposte (~1 sera ciascuna, in ordine raccomandato)

### Sessione 1 — "Tappare i buchi di sicurezza" 🔴 FARE SUBITO
**Finding:** A1-01 (auth banca, 1 riga) · A1-02 (auth ipratico, 1 riga) · A1-05 (auth foodcost, 1 riga) · A1-06 (sanitizzare filename upload, 1 regex come dipendenti.py:2378) · A1-03 + parte tecnica di A9-02 (SECRET_KEY: fail-loud al boot se manca in prod + env esplicita documentata + voce nel runbook/template) · A6-13 (sshd: `PermitRootLogin no` + `PasswordAuthentication no` — le chiavi sono già in uso) · A6-12 (porte 3389/9000-9443: bind su localhost o ufw deny, accesso via tunnel SSH) · A6-09 (3 `add_header` nginx).
**Effort totale: S** (la più alta densità beneficio/sforzo dell'intero audit: si chiude 1 CRIT confermato live, si disinnesca l'altro CRIT di piattaforma e 3 HIGH, quasi tutto in righe singole).
**Beneficio:** l'estratto conto dell'osteria smette di essere pubblico su internet; il VPS smette di esporre RDP/Portainer e root-login a password.

### Sessione 2 — "Login robusto"
**Finding:** A1-04 (lockout per-utente/IP con backoff, o slowapi; PIN minimo 6 cifre per admin/contabile — decisione PO §3.9) · A6-07 (zona `limit_req` nginx 5r/m su /auth/login, 4 righe) · allineamento manuale utente (rimuovere o implementare davvero il "blocco 60s" promesso) · A4-03 (slash su /auth/users/ in CambioPIN, 1 riga) · valutazione A1-11 (durata token 8h / refresh rotation).
**Effort totale: M.** **Beneficio:** chiude il vettore brute-force su un login a PIN con utenti enumerabili, e una promessa di sicurezza falsa nel manuale.

### Sessione 3 — "Igiene DB"
**Finding:** A7-02/A2-03 (migrazione `CREATE INDEX IF NOT EXISTS idx_fe_righe_fattura` — 11.392 righe senza indice, confermato live) · A2-04 (helper connessione unico FK ON per foodcost.db + riallineo cg_uscite nel merge FIC + bonifica dei **65 orfani cg_entrate** censiti live) · A2-02 (rimuovere CREATE legacy da init_magazzino_database + DROP della zombie + bonifica **1.240 FK orfane** ipratico_product_map) · migrazione pulizia FK verso `vini_magazzino_legacy_20260518` (57 violazioni live) · A2-13 (WAL su vini.sqlite3) · A2-07 (cleanup wal/shm in push.sh) · A2-12 (verifica MAX(data) finanza_movimenti) · A2-14 (testo trigger, documentale).
**Effort totale: M.** **Beneficio:** elenco fatture/CE/matching più veloci da subito; si chiudono TUTTE le 1.362 violazioni FK trovate live; si elimina il DDL-a-ogni-boot (pattern RCA S52-1).

### Sessione 4 — "Module gating completo"
**Finding:** A5-01/A3-05 (4 router nei rispettivi module.json — per piatti_giorno serve decisione PO §3.7) · A5-02 (dashboard module-aware: filtra `_moduli_summary` + condiziona i trigger) · A5-03 (campo `module_id` su `@register_checker`, skip se modulo spento) · A5-04 (guard component `<ModuleRoute>` sulle route FE) · A9-10 (warning al boot per router non classificati + check guardiano L1 DH.7) · A5-09 (allineare manifesti dopo le decisioni ownership).
**Effort totale: M.** **Beneficio:** il claim di vendita "compri solo Vini → il resto non esiste" diventa vero end-to-end; il drift "nuovo router → manifesto dimenticato" (già 4 volte in un mese) prende un enforcement.

### Sessione 5 — "Readiness prodotto: fix bloccanti"
**Finding:** A9-01 (TRGB_SPECIFIC su 047/048 + ri-audit delle 44 migrazioni con INSERT) · A9-03 (VITE_API_BASE_URL → window.location.origin o build per-locale) · A9-05 (parametrizzare backup_db.sh / check_backup_health.sh / setup script) · A9-06 (4 punti push.sh → variabili $BACKEND_SERVICE ecc.) · A5-07/A3-13 (logo + headline da branding.json nei 3 router carta) · A9-08 (fallback branding/strings → `locali/trgb/`).
**Effort totale: M.** **Beneficio:** chiude i 2 CRIT prodotto e 3 HIGH; dopo questa sessione un'installazione nuova non eredita più dati, chiavi, brand e backup dell'osteria.

### Sessione 6 — "Installazione pulita e runbook" (può richiedere 2 sere)
**Finding:** A2-01 (runner: non registrare le migrazioni skippate, o portare le colonne nei self-heal; test boot su data/ vuota) · A9-04 (runbook §4.2 riallineato agli schemi reali + validazione `moduli_attivi.json` al boot) · A9-07 (config nginx reale nel runbook) · A9-14 (rename moduli_attivi nello scaffold) · A9-15 (CORS dal locale) · A9-12 (policy no-PII nelle migrazioni) · **A9-16: eseguire S.2 — test end-to-end su locale fittizio, DB da zero, boot, smoke moduli** (la prova generale che chiude il cerchio, e l'occasione per decidere A9-09).
**Effort totale: M-L (1-2 sere).** **Beneficio:** il primo test della catena di onboarding NON avviene a casa del cliente #1.

### Sessione 7 — "Operatività"
**Finding:** A6-02 (UptimeRobot/Healthchecks.io su /system/info + dead-man-switch sul cron backup) · A6-04 (**primo restore test della storia**: 2 DB da Drive in dir di prova + integrity + count; poi script settimanale T.7) · A6-03/A4-01/A7-01 (T.2b: `npm run build` in push.sh, nginx serve dist/, fallback Vite 24h — già stimato 3-4h in roadmap) · A6-08 (watchdog → stessa discovery dinamica di backup_db.sh) · A6-05 (secondo off-site: Backblaze B2 o remote rclone `copy`).
**Effort totale: M.** **Beneficio:** elimina il single point of failure FE, dà l'allarme esterno che mancava a S60-INC1 e prova che i backup sono restorabili. T.2b da sola è anche il più grande salto di performance percepita dell'app.

### Sessione 8 — "CG e cassa robusti"
**Finding:** A3-01 (cablare `is_chiuso()`/STATI_CHIUSI nei ~10 punti del CG router + correggere stato G.8 in roadmap) · A3-09 (logger.error + flag `saldo_parziale` al posto dei 3 except-pass sul saldo contanti) · A3-10 (ImportResult con `righe_scartate`/`celle_azzerate` + report nel toast) · A3-11 (avvio convenzione try/finally + rollback sui write-path CG/banca/cassa, incrementale).
**Effort totale: M.** **Beneficio:** i numeri su cui Marco fa quadratura fisica smettono di poter sbagliare in silenzio; si chiude davvero G.8 (la classe di bug che ha già perso dati con mig 115).

### Sessione 9 — "Performance percepita" (dopo la Sessione 7: T.2b cambia la baseline)
**Finding:** A3-08/A7-03 (trigger Home in BackgroundTasks + cooldown 10 min) · A3-06 (3 query aggregate al posto di conn-per-riga su shift-closures) · A3-07 (query unica madri+annate) · A7-04 (paginazione matching pending) · A7-06 (limit/offset default sui 3 elenchi + cap fe/fatture 2000) · A7-05 (cache TTL carta-cliente + Cache-Control) · A7-07 (gzip application/json) · A7-09 (_ensure_tables a startup) · A7-10 (misura bloat clienti.sqlite3 con dbstat).
**Effort totale: M.** **Beneficio:** Home, Mance, Cantina e Matching smettono di degradare linearmente con la crescita dei dati.

### Sessione 10 — "Docs catch-up"
**Finding:** A8-02 (giornata Ricette 23/05: sezioni import JSON + procedimento + matching nel doc, entry changelog cumulativa) · A8-03 (annulli_resi in modulo_vendite + mapping 11 endpoint DH.4) · A8-04 (3 entry changelog retroattive) · A8-05 (riconciliazione roadmap: B.7 ✅, B-DEBT1 via, V-H.I deciso) · A8-06 (CLAUDE.md mattoni M.B/M.E ✅) · A8-08 + A6-11 (checkbox problemi.md spuntate con evidenza live del 12/06) · A8-01 (split DH.5 task_manager/HACCP) · minori A8-07/09/10 · in coda: estensione guardiano L1 (DH.7 router-senza-doc, grep "ADD COLUMN NOT NULL" da A2-11, check numerazione mig duplicata da A2-06, regex tag commit da A5-11).
**Effort totale: M.** **Beneficio:** changelog/roadmap di nuovo affidabili + l'enforcement che impedisce al drift docs di riformarsi.

### Sessione 11 — "Pulizia dead code" (dopo il 15/6, vincolo V-H.I)
**Finding:** A3-02 (trio admin_finance_* ~600 righe) · A3-03 (liquidita_service 557 righe + import morto) · A3-04 (user.py, models/fe_import.py, core/database.py, vini_model) · A3-14 (tools/scripts one-shot, T.9) · A4-04 (3 pagine morte Dipendenti* + header path sbagliato nel file vivo) · A4-10 (axios) · A2-08 (006.sql) · A2-10 (tabelle archive: DROP dichiarato di legacy_20260518, fe_fatture_archive_*, vini_raw) · A5-08/A3-15 (batch header `# Modulo:` sui router mancanti).
**Effort totale: S-M.** **Beneficio:** ~2.000 righe morte in meno; niente più doppie implementazioni in cui fixare quella sbagliata. Con grep di conferma pre-delete, fuori da sessioni R.

### Backlog senza sessione assegnata (pianificare con il PO)
- **A2-05 / K.12** (unificazione corrispettivi) — effort **L**, già deciso 🔴 ALTA il 21/5: serve una finestra dedicata (rebuild shift_closures per il CHECK). Vedi §3.1.
- **A1-07** (matrice ruolo→modulo: stipendi/PII/fatture non per tutti i loggati) — effort M, merita sessione propria dopo la decisione §3.8.
- **A1-08** (token in query string sui download) — dopo la decisione §3.10.
- **A5-05 + A5-06** (servizi-ponte cross-modulo) — effort L, incrementale al tocco degli endpoint.
- **A5-10 / K-tris** (cedolini fuori da app/data) — al primo cliente con modulo dipendenti.
- **A9-11 + A9-13** (pacchetto legale) — track parallelo non-dev col consulente, 1-2 settimane elapsed: **da avviare SUBITO** perché è il percorso critico verso il cliente #1.
- **A4-02, A4-05/06/07/08/09** (fetch→apiFetch, touch target, M.I, palette, a11y) — opportunistici al tocco di ciascun file, tranne A4-05 (PrenotazioniPlanning) che vale un fix puntuale presto: è usato dalla sala nel momento di punta.

---

## 3. Decisioni per il PO (Marco)

Ambiguità non bloccanti emerse dai raw: nessuna ferma le sessioni 1-3, ma vanno decise per le successive.

1. **K.12 — quando?** Entrambe le tabelle corrispettivi sono vive (daily 2.191 righe, shift 168) e ogni feature cassa va fatta due volte (annulli_resi docet). Il CHECK `turno IN ('pranzo','cena')` obbliga a un rebuild di shift_closures. Deciso 🔴 ALTA il 21/5, mai calendarizzato: serve una data. (A2-05)
2. **Swagger /docs in produzione: tenere o spegnere?** Fix da 30 secondi (`docs_url=None if IS_PROD`), ma se Marco lo usa per debug dal telefono va tenuto consapevolmente (magari dietro auth). (A6-06)
3. **Porte 3389 e 9000/9443: servono davvero esposte?** RDP (gnome-remote-desktop) e probabile Portainer raggiungibili da internet. Se servono → tunnel SSH; se no → chiudere. Collegato: sul VPS girano LightDM + GNOME + cups + avahi — un desktop completo su un server di produzione. Disinstallare? (A6-12)
4. **Turni vecchio vs v2** (MORT-2/MED-13): il rinvio del 19/5 resta valido o si pianifica la dismissione del vecchio? Incide anche sui docs (marker deprecated).
5. **GDPR e legale per il cliente #1**: quale consulente, quando partire (è il percorso critico: 1-2 settimane elapsed), e decisioni a corredo — Drive di Marco o del cliente per i backup? Cifratura backup (rclone crypt)? Retention dati personali? (A9-11, A9-13)
6. **Cleanup legacy V-H.I**: la scadenza "non prima del 15/6" è raggiunta. Si parte con la Sessione 11? Include il DROP di `vini_magazzino_legacy_20260518` (i conteggi v2 sono ok da settimane). (A2-10, A3-04, MORT-1)
7. **Ownership ambigue nei manifesti**: `piatti_giorno` è cucina (dice il commento) o ricette (dicono CLAUDE.md e i docs)? `cash_deposits` è di cassa o banca (oggi dichiarata da entrambi)? Serve per la Sessione 4. (A5-09, A5-01)
8. **Matrice ruoli**: oggi QUALSIASI utente loggato (sala, commis) può vedere buste paga, costi personale, PII clienti, import fatture. Quali ruoli vedono cosa? Senza questa mappa A1-07 non si può implementare. (A1-07)
9. **Politica PIN**: imporre minimo 6 cifre per admin/contabile? (con la Sessione 2 — A1-04)
10. **Download PDF con ?token=**: scegliere tra token monouso breve, fetch+blob, o accettare il rischio documentandolo. (A1-08)
11. **Endpoint /menu/ pubblico legacy**: proteggere per coerenza o confermare "nel cassetto" come da decisione 19/5? (A1-10)
12. **Fallback branding → `locali/trgb/`** invece di tregobbi: conferma della scelta (consigliata: il fallback diventa il brand del PRODOTTO, non dell'osteria). (A9-08)
13. **Topologia trgb.it**: demo sul VPS condiviso (richiede risolvere dist-per-locale + hook, A9-09) o VPS separato (più pulito, costa di più)? Da decidere prima del go-live demo.
14. **daily_closures con righe fino al 2026-12-31** (visto live): calendario precompilato by-design o residuo di import da pulire? Incide su K.12.
15. **Widget dashboard su finanza_movimenti** (tabella legacy non più scritta?): verificare freschezza e decidere se puntarlo su banca_movimenti. (A2-12)
16. **Regola `# Modulo:`**: backfill batch sui ~28 router storici o ridurre formalmente la regola ai soli file nuovi (il manifesto come fonte)? (A5-08, A3-15)
17. **Login.jsx con bg-neutral-50**: scelta voluta o da uniformare a brand-cream? (A4-08)
18. **Cap /fe/fatture (oggi limit ≤ 50.000)**: abbassare a 2000 rompe qualche export usato da Marco? (A7-06)

---

*Fine del piano. Ordine consigliato di esecuzione: Sessione 1 questa settimana (1 sera, chiude il CRIT live); legale (track parallelo) avviato subito; poi 2→7 nell'ordine; 8-11 a seguire. Le decisioni §3.1-3.8 sbloccano rispettivamente K.12, le sessioni 2, 4 e il backlog ruoli.*
