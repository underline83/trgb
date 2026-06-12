# Audit TRGB 2026-06-12 — 06 INFRASTRUTTURA E OPERATIVITÀ

> **Data:** 2026-06-12 · **Commit:** `1f5f9c17` (main) · **Versione:** 5.24
> **Fonti:** `raw_A6.md` (analisi documentale + codice script) + `raw_A6_live.md` (verifica LIVE VPS eseguita dall'orchestratore, ssh sola lettura + probe HTTP, ~13:10 CEST) + verdetti `99_VERIFICA_AVVERSARIA.md` (A6-13 confermato HIGH).
>
> ## **VOTO AREA INFRA: 58/100**

---

## 1. Metodologia

Il subagente A6 non aveva accesso rete (ssh/curl negati dall'ambiente): il suo report (`raw_A6.md`) era documentale, con la limitazione dichiarata come finding provvisorio A6-01 e una checklist §8 di comandi da rieseguire. **La checklist è stata eseguita integralmente live dall'orchestratore** (`raw_A6_live.md`): A6-01 è quindi **risolto ed eliminato** — l'area A6 è completa, ogni affermazione runtime di questo report è verificata al 2026-06-12.

Verifiche live eseguite (sola lettura): systemctl status/NRestarts, journalctl 7gg, `ss -tlnp`, cert TLS, header HTTP su entrambi i domini, sshd_config, fail2ban, `crontab -l`, status JSON backup, ls LKG/hourly/daily, backup_health.log, df/free/journal, probe `/system/info` e endpoint pubblici.

---

## 2. Stato live del VPS — il quadro

### 2.1 Salute generale: BUONA ✅

- **Backend sano**: `trgb-backend` active (running) da 2026-06-11, **NRestarts=0**, Mem 302MB; journal 7gg: 6 righe error/traceback (fisiologico). VPS up da 10 giorni, load 0.00.
- **Versione allineata**: `GET /system/info` → `{"version":"5.24","commit":"1f5f9c17"}` = HEAD locale. Nessun drift deploy.
- **TLS valido**: cert Let's Encrypt rinnovato 2026-05-31, scadenza **2026-08-29**, certbot.timer funzionante.
- **Risorse**: disco 20G/157G (**13%**), inode 5%, RAM 1.7G/15G, journal 1.0G. Tutto sano.
- **Binding corretti**: uvicorn `127.0.0.1:8000` e Vite `127.0.0.1:5173` solo su loopback. fail2ban **active**.
- TTFB API live: `/system/info` 56ms, `/vini/carta-cliente/data` 89ms — performance di base buona (dettagli in 07_PERFORMANCE).

### 2.2 Backup: TUTTI VERDI ✅ — il grande positivo post-incidente

A un mese dall'incidente S60-INC1 (backup rotti scoperti tardi), **il sistema ricostruito funziona ed è verificato live oggi**:

| Check live (2026-06-12) | Esito |
|---|---|
| `crontab -l` | ✅ **4 job attivi**: hourly (min 0), daily 03:00, daily 18:00, health check ogni 30' (15,45 — sfasamento anti-race applicato) |
| `.last_backup_status.json` (oggi 13:00) | ✅ mode hourly, **15/15 OK, 0 failed** (10 DB + 5 JSON config) |
| `.last_health_status.json` (oggi 12:45) | ✅ **"healthy", issues []** |
| `last_known_good/` | ✅ 14 file, timestamp **oggi 13:00**, dimensioni plausibili (clienti 26.8MB, foodcost 8.2MB, **nessuno stub 4096B**) |
| `daily/` | ✅ retention regolare (20260612030001, 20260611180001, …) |
| `backup_health.log` | ✅ "Sistema di backup SANO", LKG 10/10 integri |

I fix post-incidente sono reali nel codice e verificati riga per riga: `backup_db.sh` v2 (integrity check, LKG mai rotato, min size 8KB, verifica sorgente pre-backup, rotazione sospesa se >50% falliti), `check_backup_health.sh` v1.1 (5 check, sqlite3 -readonly + retry anti-race), notifiche M.A. **Questo è un caso di incidente → lezione → fix → verifica chiuso bene.** Restano aperti i gap di processo: restore mai testato (A6-04) e off-site solo Drive (A6-05).

### 2.3 push.sh / guardiano L1: REALE ✅

`push.sh` v2 (righe 121-336) implementa davvero il guardiano L1 dichiarato: pre-push DB sanity via ssh, controllo stato backup, validazione `.prev` post-download, post-deploy sanity check. Il deploy non è un push cieco.

### 2.4 Le ombre (live)

La verifica live ha però anche trovato ciò che la documentazione non tracciava:

- **Porte 3389 (gnome-remote-desktop/RDP) e 9000/9443 (docker, firma tipica Portainer) esposte su 0.0.0.0** → A6-12 HIGH.
- **`PermitRootLogin yes` + `PasswordAuthentication yes`** espliciti in sshd_config, porta 22 esposta → A6-13 HIGH. Il problema **non era nemmeno censito** in `docs/analisi_hardening_vps.md` (verifica avversaria: grep = 0).
- **Header di sicurezza HTTP assenti** su entrambi i domini (conferma live, anche `server: nginx/1.24.0 (Ubuntu)` esposto con versione) → A6-09 promosso a MED.
- Sul server di produzione girano anche LightDM + desktop GNOME completo + cups + avahi (superficie d'attacco e RAM; nota, non finding autonomo).

---

## 3. Finding

```
[A6-02] SEVERITÀ: HIGH (noto, stato: aperto — roadmap T.1 priorità ALTA)
Titolo: Nessun monitoring/alerting esterno di uptime
Evidenza: roadmap.md:657 "T.1 | Health check endpoint /health + UptimeRobot | S | ALTA" ancora
  aperto; grep repo-wide uptimerobot/healthchecks/statuscake/pingdom → zero implementazioni.
  Le notifiche M.A girano DENTRO l'app: se il backend è giù o zombie non partono — esattamente
  la modalità di fallimento di S60-INC1 (backend zombie che rispondeva 200). Il probe HTTP di
  push.sh scatta solo al momento del push.
Impatto: se il backend muore nessuno avvisa Marco finché un utente non se ne accorge. A ristorante
  aperto = prenotazioni/cassa ferme senza preavviso.
Fix proposto: UptimeRobot/Healthchecks.io gratuito su /system/info + dead man switch sul cron di
  backup (se backup_db.sh non pinga entro 70min → email/SMS). — Effort: S
Modulo: infra
```

```
[A6-03] SEVERITÀ: HIGH (noto, stato: aperto — roadmap T.2b ALTA) — CONFERMATO LIVE
Titolo: Frontend di produzione ancora su Vite dev server
Evidenza: push.sh:544 restart trgb-frontend; nessun npm run build nel flusso di deploy;
  analisi_hardening_vps.md §3.A (severità ALTA, 2026-04-27). CONFERMA LIVE: `ss -tlnp` mostra
  processo node attivo su 127.0.0.1:5173.
Impatto: sorgenti e sourcemap esposti, endpoint HMR pubblici, performance degradate, single point
  of failure (Vite crasha → frontend giù). Vedi anche A4-01 e A7-01 (stesso problema, lente FE/perf).
Fix proposto: eseguire T.2b (build statico in frontend/dist servito da nginx, fallback Vite 24h).
  Già pianificato "primo mercoledì libero". — Effort: M
Modulo: infra
```

```
[A6-04] SEVERITÀ: HIGH (noto, stato: aperto — TODO post-incidente + roadmap T.7)
Titolo: Nessun test di restore mai eseguito sui backup
Evidenza: docs/problemi.md:94 e docs/sicurezza_backup.md:195 "[ ] Restore test" non spuntati;
  roadmap T.7 MEDIA aperta; nessuna evidenza di restore test in changelog/sessione. Lezione 2
  dell'incidente: "Un backup che esiste NON è valido finché non è stato testato per restore".
  La verifica live conferma backup sani ma non può supplire al test di processo.
Impatto: l'intera catena (LKG, Drive) è non provata end-to-end: in un disastro reale il primo
  restore della storia avverrebbe sotto pressione, su 15 file, con WAL e permessi da indovinare.
Fix proposto: una tantum subito: restore manuale di 2 DB (foodcost + vini_magazzino) da Drive in
  dir di prova + integrity + count tabelle chiave; poi script settimanale automatico con notifica
  M.A (T.7). — Effort: M
Modulo: infra
```

```
[A6-12] SEVERITÀ: HIGH (nuovo, da verifica live) — dettaglio completo in 01_SICUREZZA.md
Titolo: Porte 3389 (RDP/gnome-remote-desktop) e 9000/9443 (probabile Portainer) esposte a internet
Rimando: vedi 01_SICUREZZA.md per evidenza e fix completi. In sintesi: `ss -tlnp` live mostra
  3389 (gnome-remote-desktop.service running) e 9000/9443 (docker) in ascolto su 0.0.0.0 su un
  server di produzione con dati personali. Fix: bind su localhost o ufw deny + accesso via tunnel
  SSH. — Effort: S
Modulo: infra
```

```
[A6-13] SEVERITÀ: HIGH (nuovo, da verifica live; CONFERMATO da verifica avversaria) — dettaglio
  completo in 01_SICUREZZA.md
Titolo: PermitRootLogin yes + PasswordAuthentication yes su host internet-facing
Rimando: vedi 01_SICUREZZA.md per evidenza e fix completi. In sintesi: sshd_config con root login
  via password abilitato esplicitamente, porta 22 esposta; il problema NON era censito in
  analisi_hardening_vps.md. fail2ban attivo mitiga ma non elimina. Fix: PermitRootLogin no +
  PasswordAuthentication no (le chiavi sono già in uso: l'alias `ssh trgb` usa key auth). — Effort: S
Modulo: infra
```

```
[A6-05] SEVERITÀ: MED (noto, stato: aperto)
Titolo: Off-site limitato a Google Drive — strategia 3-2-1 incompleta
Evidenza: docs/sicurezza_backup.md:191-196 TODO non spuntati: Aruba snapshot [ ], Backblaze B2 [ ],
  Time Machine Mac [ ]. Unico off-site automatico: rclone → gdrive (stesso account Google per
  daily/lkg/runbook). Live: Drive sync incluso nei job cron attivi.
Impatto: compromissione/blocco dell'account Google (o un `rclone sync` errato — sync propaga le
  delezioni per design) azzererebbe l'unico off-site.
Fix proposto: Backblaze B2 (o secondo remote rclone con `copy` invece di `sync` per il LKG) +
  snapshot Aruba settimanale dal pannello. — Effort: M
Modulo: infra
```

```
[A6-06] SEVERITÀ: MED (noto, stato: aperto)
Titolo: Swagger /docs e /openapi.json esposti in produzione
Evidenza: main.py — nessuna occorrenza di docs_url/redoc_url/openapi_url;
  analisi_hardening_vps.md §3.D lo segnalava già il 2026-04-27 con fix da 30 secondi.
Impatto: mappa completa degli endpoint (inclusi i pubblici no-auth) disponibile a chiunque per
  ricognizione mirata — aggravante per i finding di auth mancante di 01_SICUREZZA (es. /banca/*).
Fix proposto: `docs_url=None if IS_PROD else "/docs"` (idem redoc/openapi) con IS_PROD da env. — Effort: S
Modulo: infra
```

```
[A6-07] SEVERITÀ: MED (noto, stato: aperto)
Titolo: Nessun rate limit su /auth/login
Evidenza: nessuna direttiva limit_req nei template nginx (deploy.md, installazione_nuovo_server.md);
  analisi_hardening_vps.md §3.C aperta da apr 2026; fail2ban copre solo sshd, non l'HTTP.
  Incrocio: A1-04 (01_SICUREZZA) conferma l'assenza di qualsiasi lockout anche applicativo.
Impatto: brute force su POST /auth/login senza alcun freno (PIN 4-6 cifre).
Fix proposto: zona limit_req 5r/m burst 3 sul location /auth/login (4 righe nginx). — Effort: S
Modulo: infra
```

```
[A6-08] SEVERITÀ: MED (nuovo)
Titolo: Watchdog backup con lista DB hardcoded divergente dalla discovery dinamica di backup_db.sh
Evidenza: scripts/backup_db.sh:55-76 (discovery dinamica *.sqlite3/*.db, "ogni DB nuovo viene
  automaticamente preso in carico") vs scripts/check_backup_health.sh:43-54 (array DBS fisso di
  10 nomi). I 5 JSON config backuppati in LKG non sono verificati dal watchdog.
Impatto: un DB aggiunto in futuro (nuovo modulo) verrebbe backuppato ma mai sorvegliato: se il suo
  backup degrada, nessun allarme — replica parziale del pattern S60-INC1 (tasks.sqlite3 nato dopo
  il 28/04 non era backuppato).
Fix proposto: allineare check_backup_health.sh alla stessa discovery dinamica (o leggere la lista
  da .last_backup_status.json) + check size/validità dei 5 JSON in LKG. — Effort: S
Modulo: infra
```

```
[A6-09] SEVERITÀ: MED (promosso da LOW: CONFERMATO LIVE su entrambi i domini)
Titolo: Header di sicurezza HTTP assenti (HSTS, X-Frame-Options, X-Content-Type-Options)
Evidenza: nessun add_header nei template nginx del repo; VERIFICA LIVE (raw_A6_live.md §2):
  nessun HSTS, X-Frame-Options, X-Content-Type-Options su trgb.tregobbi.it NÉ su app.tregobbi.it;
  in più `server: nginx/1.24.0 (Ubuntu)` esposto con versione.
Impatto: senza HSTS un MITM può fare SSL-strip al primo accesso; senza X-Frame-Options l'app è
  inquadrabile in iframe (clickjacking sul pannello gestionale).
Fix proposto: nel server block HTTPS: `add_header Strict-Transport-Security "max-age=31536000"
  always;`, `add_header X-Content-Type-Options nosniff;`, `add_header X-Frame-Options SAMEORIGIN;`
  (+ `server_tokens off;`). — Effort: S
Modulo: infra
```

```
[A6-10] SEVERITÀ: LOW (noto, stato: aperto)
Titolo: CORS lasco — allow_methods/headers "*" con allow_credentials=True
Evidenza: main.py:493-498 — allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
  (origins però in allowlist esplicita di 4 host, che mitiga).
Impatto: superficie marginale; resta il punto aperto §3.E dell'analisi hardening.
Fix proposto: stringere a metodi/header espliciti come da analisi §3.E. — Effort: S
Modulo: infra
```

```
[A6-11] SEVERITÀ: LOW (nuovo) — CONFERMATO LIVE: i 4 cron job SONO attivi, la checkbox è stale
Titolo: Doc drift sullo stato backup: checkbox cron "da fare" stale + scaffold setup fuori sync
Evidenza: docs/problemi.md:87 "[ ] Setup cron del nuovo backup_db.sh + check_backup_health.sh sul
  VPS" NON spuntato, ma la VERIFICA LIVE (crontab -l, 2026-06-12) mostra tutti e 4 i job attivi e
  funzionanti (LKG odierno). Inoltre setup-backup-and-security.sh è dichiarato "scaffold obsoleto,
  fuori sync" (sessione.md:1737): installerebbe solo 2 dei 4 cron e con orario daily sbagliato.
Impatto: chi legge problemi.md crede che i backup non siano schedulati (falso); chi usasse lo
  scaffold su un NUOVO server (istanza trgb.it!) otterrebbe un sistema di backup monco senza
  watchdog — incrocia i finding di readiness prodotto (A9-05).
Fix proposto: spuntare la checkbox con data+evidenza live; allineare setup-backup-and-security.sh
  ai 4 cron canonici di sicurezza_backup.md §2.1-2.2 (rilevante per il runbook nuovo server). — Effort: S
Modulo: infra
```

---

## 4. Tabella riassuntiva

| ID | Sev | Titolo | Noto? | Verifica |
|----|-----|--------|-------|----------|
| A6-02 | HIGH | Nessun monitoring esterno uptime | noto (T.1 ALTA) | documentale |
| A6-03 | HIGH | Frontend prod su Vite dev server | noto (T.2b ALTA) | **live** (node:5173) |
| A6-04 | HIGH | Restore test mai eseguito | noto (T.7) | documentale |
| A6-12 | HIGH | Porte 3389/9000/9443 esposte → vedi 01_SICUREZZA | **nuovo** | **live** |
| A6-13 | HIGH | PermitRootLogin/PasswordAuthentication yes → vedi 01_SICUREZZA | **nuovo** (non tracciato) | **live** |
| A6-05 | MED | Off-site solo Google Drive, 3-2-1 incompleto | noto (TODO) | documentale + live |
| A6-06 | MED | /docs Swagger esposto in prod | noto (§3.D) | codice main.py |
| A6-07 | MED | Nessun rate limit /auth/login | noto (§3.C) | documentale |
| A6-08 | MED | Watchdog backup: lista DB hardcoded vs discovery dinamica | nuovo | codice script |
| A6-09 | MED ↑ | Header sicurezza assenti (confermato live su entrambi i domini) | parz. noto | **live** |
| A6-10 | LOW | CORS lasco con credentials | noto (§3.E) | codice main.py |
| A6-11 | LOW | Doc drift checkbox cron (cron attivi live) + scaffold fuori sync | nuovo | docs + **live** |

**Totali: 0 CRIT · 5 HIGH · 5 MED · 2 LOW.**
(A6-01 "VPS non verificabile" del raw è stato eliminato: la verifica live è stata completata dall'orchestratore.)

**Voto area Infra: 58/100** — il sistema di backup ricostruito post-S60-INC1 è eccellente e verificato verde live (cron, LKG, watchdog, guardiano L1 in push.sh: il pezzo migliore dell'area), e il VPS è in salute con deploy allineato. Ma il resto pesa: dev server Vite in produzione da mesi, zero monitoring esterno nonostante la lezione dell'incidente, restore mai provato, SSH lasco (root+password) e porte di gestione esposte a internet — gli ultimi due scoperti solo grazie alla verifica live perché non tracciati in alcun documento.
