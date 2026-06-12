# Audit A6 — Infrastruttura VPS (2026-06-12)

> Area: A6 — Infrastruttura VPS, SOLA LETTURA.
> Auditor: subagente Claude (audit completo TRGB).
> Repo locale: `/Users/underline83/trgb` — HEAD `1f5f9c17`, `VERSION` = 5.24.

---

## 0. LIMITAZIONE CRITICA DI METODO — VPS NON RAGGIUNGIBILE DALL'AMBIENTE DI AUDIT

**Tutti i canali di rete sono stati negati dal sistema di permessi di questo ambiente subagente:**

| Tentativo | Esito |
|---|---|
| `ssh trgb uptime` (anche con sandbox disabilitata) | ❌ Permission denied dall'harness |
| `ssh trgb 'systemctl list-units ...'` | ❌ Permission denied |
| `curl https://trgb.tregobbi.it/system/info` | ❌ Permission denied |
| `echo \| openssl s_client -connect trgb.tregobbi.it:443` | ❌ Permission denied |
| Tool `WebFetch` su `/system/info` e `/system/modules` | ❌ Permission denied |

Coerente con la regola CLAUDE.md "Niente accesso alla rete", ma in contrasto con il mandato dell'orchestratore ("ssh trgb alias funzionante, già verificato" — evidentemente verificato in un ambiente con permessi diversi).

**Conseguenza:** TUTTE le verifiche runtime (punti 1–7 del mandato: systemd, nginx -T, ss -tlnp, fail2ban, sshd_config, crontab -l, ls dei backup, df/free, journalctl, probe HTTP, scadenza cert) sono **[NON VERIFICATE — accesso rete/ssh negato all'ambiente]**.

L'audit è stato quindi condotto in modalità **best-effort documentale**: lettura degli script di backup, di `push.sh`, di `main.py`, e dei documenti canonici (`docs/problemi.md`, `docs/sicurezza_backup.md`, `docs/analisi_hardening_vps.md`, `docs/deploy.md`, `docs/installazione_nuovo_server.md`, `docs/sessione.md`, `docs/roadmap.md`, `docs/changelog.md`). Dove esistono evidenze documentali datate dello stato VPS, sono citate con la data. Severità assegnate in modo conservativo.

**Raccomandazione all'orchestratore:** rieseguire i comandi live elencati in §8 da un ambiente con ssh funzionante (o farli eseguire a Marco) prima di chiudere l'area A6.

---

## 1. Servizio backend

- **Unit note (da docs, non verificate live):** `trgb-backend.service` (uvicorn FastAPI su `127.0.0.1:8000`) e `trgb-frontend.service` (Vite su `127.0.0.1:5173`). Fonte: `docs/deploy.md` §5, `docs/analisi_hardening_vps.md` §1.
- Status, NRestarts, journal ultimi 7 giorni: **[NON VERIFICATO — serve ssh]**.
- Precedente storico rilevante: incidente S52-1 (apr 2026) con 530+ restart del backend — risolto, ma dimostra che il conteggio restart è un segnale da monitorare.

## 2. Nginx / TLS / porte

- Reverse proxy nginx → `127.0.0.1:8000` (backend) e `127.0.0.1:5173` (frontend dev server Vite). `client_max_body_size 100M`, `proxy_read_timeout 600s` (`docs/deploy.md` §6). Binding documentato su loopback ⇒ uvicorn non dovrebbe essere esposto direttamente, ma `ss -tlnp` **[NON VERIFICATO]**.
- UFW: solo `Nginx Full` + loopback (documentato 2026-04-27, `analisi_hardening_vps.md` §1) — **[NON RIVERIFICATO live]**.
- TLS: certbot su `trgb.tregobbi.it` e `app.tregobbi.it`, rinnovo via `certbot.timer`. **Scadenza cert attuale [NON VERIFICATA]** (openssl bloccato).
- **Header di sicurezza (HSTS, X-Frame-Options, X-Content-Type-Options): nessuna traccia in alcun config/doc del repo** (`deploy.md`, `installazione_nuovo_server.md` — i template nginx non contengono `add_header`). Quasi certamente assenti → finding A6-09.
- Rate limit nginx: nessuna `limit_req` in alcun template/doc → noto (`analisi_hardening_vps.md` §3.C), stato: **aperto** → finding A6-07.

## 3. Hardening

- **fail2ban**: documentato attivo su jail `sshd` (maxretry 5, bantime 600s, whitelist reti private) al 2026-04-27. Stato odierno **[NON VERIFICATO]**.
- **sshd_config** (PasswordAuthentication, PermitRootLogin, Port): **[NON VERIFICATO — serve ssh]**. Nessuna evidenza documentale nel repo.
- Utenti con shell, aggiornamenti di sicurezza pendenti: **[NON VERIFICATO]**.
- `/docs` FastAPI: **ancora esposto** — `main.py` non passa `docs_url=None` (verificato sul codice: nessuna occorrenza di `docs_url/redoc_url/openapi_url`). Noto (`analisi_hardening_vps.md` §3.D), stato: **aperto** → finding A6-06.
- CORS: `main.py:493-498` — `allow_credentials=True` + `allow_methods=["*"]` + `allow_headers=["*"]` (origins però in allowlist esplicita: localhost, app.tregobbi.it, trgb.tregobbi.it). Noto (§3.E), stato: **aperto** → finding A6-10.
- **Frontend in produzione = Vite dev server**: `push.sh:544` fa ancora `sudo /bin/systemctl restart trgb-frontend`; roadmap T.2b "Frontend statico (Vite dev → build) in produzione" è ancora **ALTA / da fare**. Noto (`analisi_hardening_vps.md` §3.A, severità ALTA), stato: **aperto** → finding A6-03.

## 4. Backup (area critica — incidente noto S60-INC1)

### Stato dei fix post-incidente (3-4 mag 2026)

| Item | Noto da | Stato verificato |
|---|---|---|
| `backup_db.sh` v2 (integrity check, LKG mai rotato, status JSON, notifiche M.A, min size 8KB, verifica SORGENTE pre-backup, rotazione sospesa se >50% falliti) | problemi.md fix 1 | ✅ **Presente nel repo** (`scripts/backup_db.sh`, 580 righe, v2.0/v2.1 — codice verificato riga per riga, implementa tutto il dichiarato) |
| `check_backup_health.sh` watchdog (5 check: hourly <70min, daily <25h, Drive <25h, LKG integri, status failed_count) | problemi.md fix 2 | ✅ **Presente nel repo** (v1.1 del 2026-05-07 con `sqlite3 -readonly` + retry anti-race) |
| `push.sh` v2 guardiano L1 (pre-push DB sanity via ssh, stato backup, validazione .prev post-download, post-deploy sanity) | problemi.md fix 3 | ✅ **Presente nel repo** (`push.sh:121-336`) |
| **Cron sul VPS (4 job: hourly, daily 03:00, daily 18:00, health check /30min)** | problemi.md TODO "[ ] Setup cron" (NON spuntato) | ⚠️ **Checkbox stale**: `docs/sessione.md:1786` (sessione 2026-05-07, diagnosi via ssh) attesta "Crontab: tutti e 4 i job attivi. OK". Quindi il cron FU installato. Stato ODIERNO (12 giu) **[NON VERIFICATO]** — vedi A6-11 e §8 |
| Sfasamento health check a `15,45 * * * *` (anti-race con backup orario) | changelog 2026-05-07 | ⚠️ Raccomandato a Marco via `crontab -e` manuale — **[NON VERIFICATO se applicato]** |
| Drive sync (db-daily + lkg + runbook, 3 destinazioni rclone) | sicurezza_backup.md §2.5 | ✅ in codice; ultimo sync reale **[NON VERIFICATO]**. Ultima evidenza: 2026-05-07 18:00 "Drive sync OK (DB + LKG + runbook)" |
| Aruba snapshot settimanale | TODO `[ ]` | ❌ **Aperto** (roadmap T.10 BASSA, "Marco gestisce manuale") |
| Backblaze B2 (ridondanza geografica) | TODO `[ ]` | ❌ **Aperto** (sicurezza_backup.md §TODO) |
| Time Machine sul Mac | TODO `[ ]` | ❌ **Aperto** |
| **Restore test (anche solo una volta)** | TODO `[ ]` + roadmap T.7 MEDIA | ❌ **Nessuna evidenza in tutto il repo che un restore sia MAI stato testato** → finding A6-04 |

### Osservazioni sul codice backup (nuove, da lettura script)

1. **Divergenza liste DB**: `backup_db.sh` v2 usa discovery **dinamica** (tutti i `*.sqlite3`/`*.db` in `locali/tregobbi/data` + `app/data`), mentre `check_backup_health.sh` ha una lista **hardcoded di 10 DB** (righe 43-54). Un DB aggiunto in futuro verrebbe backuppato ma NON sorvegliato dal watchdog (missing/stub/corrupt non rilevati). Inoltre il watchdog non verifica i 5 JSON config in LKG. → finding A6-08.
2. Ultimi backup reali sul VPS (`ls -la hourly/ daily/ last_known_good/`, dimensioni, `.last_backup_status.json`, `.last_health_status.json`): **[NON VERIFICATI — serve ssh]**. Ultima evidenza documentale di sistema sano: 2026-05-07 (15 OK / 0 falliti, LKG 10 DB + 5 JSON, daily 14 cartelle).
3. Off-site: la catena 3-2-1 oggi è VPS (hourly/daily/LKG) + Google Drive (3 destinazioni) + copie locali Mac scaricate da push.sh (`.prev`). NON è "tutto solo sul VPS" ⇒ niente CRIT automatico, ma l'unico off-site automatico è Drive (stesso account Google = single point) → finding A6-05.

## 5. Risorse (disco, RAM, log)

- `df -h`, `df -i`, `free -h`, `du -sh /var/log`, `journalctl --disk-usage`, logrotate nginx/journald: **[NON VERIFICATO — serve ssh]**.
- Rischio specifico da tenere d'occhio quando verificabile: i backup hourly (15 file × 10 retention) + daily (14 cartelle complete) vivono in `app/data/backups/` sullo **stesso disco** dei DB live — un disco pieno fermerebbe sia il servizio sia i backup. Dimensioni attuali non note.

## 6. Monitoring / alerting esterno

- **Non esiste alcun monitoraggio esterno di uptime.** Evidenza: roadmap `T.1 | Health check endpoint /health + UptimeRobot | S | ALTA | Monitor esterno` ancora aperta; grep repo-wide per `uptimerobot|healthchecks.io|statuscake|pingdom|betterstack|cronitor` → zero hit operativi.
- Le notifiche esistenti (M.A) girano DENTRO l'app: se il backend è giù o zombie, le notifiche non partono o non vengono lette — esattamente la modalità di fallimento dell'incidente S60-INC1 (backend zombie che rispondeva 200). Il probe HTTP di `push.sh` scatta solo al momento del push. → finding A6-02 (HIGH, vista la storia).

## 7. Probe HTTP da locale (punto 7 del mandato)

**Tutti [NON VERIFICATI]** — curl/WebFetch negati. Non posso confermare quale versione/commit gira su `trgb.tregobbi.it` (`/system/info`), né lo stato di `/system/modules`, `/locale/branding.json`, login, `/carta`. Nota per il confronto quando il probe sarà possibile: locale `VERSION` = 5.24, HEAD = `1f5f9c17`; `docs/sessione.md` (2026-06-09) marca l'ultimo lavoro come "Da pushare" ⇒ è plausibile che il VPS sia 1 commit indietro (normale).

---

## FINDING

```
[A6-01] SEVERITÀ: HIGH
Titolo: Stato runtime del VPS non verificabile dall'ambiente di audit — area A6 incompleta
Evidenza: `ssh trgb uptime`, `curl https://trgb.tregobbi.it/system/info`, `openssl s_client`, tool WebFetch → tutti "Permission denied" dall'harness (anche con sandbox disabilitata). Nessun comando dei punti 1-7 del mandato eseguito live.
Impatto: tutte le affermazioni runtime di questo report si basano su evidenze documentali (le più recenti: 2026-05-07 per i backup). Lo stato REALE odierno di cron, backup, cert, fail2ban, disco è ignoto: 5 settimane sono più che sufficienti perché un cron si fermi in silenzio (è già successo: bit +x perso a fine marzo 2026, deploy.md §nota).
Fix proposto: rieseguire la checklist comandi §8 da una sessione con ssh (orchestratore o Marco) e integrare il report. — Effort: S
Modulo: infra
```

```
[A6-02] SEVERITÀ: HIGH
Titolo: Nessun monitoring/alerting esterno di uptime (noto, stato: aperto — roadmap T.1 priorità ALTA)
Evidenza: docs/roadmap.md:657 "T.1 | Health check endpoint /health + UptimeRobot | S | ALTA" ancora aperto; grep repo-wide per uptimerobot/healthchecks/statuscake/pingdom → zero implementazioni. Le notifiche M.A girano dentro l'app stessa.
Impatto: se il backend muore o diventa zombie (scenario REALE di S60-INC1: rispondeva 200 con dati corrotti) nessuno avvisa Marco finché un utente non se ne accorge. A ristorante aperto = prenotazioni/cassa ferme senza preavviso.
Fix proposto: UptimeRobot/Healthchecks.io gratuito su /system/info + ping cron "dead man switch" (healthchecks.io anche sul cron di backup: se backup_db.sh non pinga entro 70min → email/SMS). — Effort: S
Modulo: infra
```

```
[A6-03] SEVERITÀ: HIGH
Titolo: Frontend di produzione ancora su Vite dev server (noto, stato: aperto — roadmap T.2b ALTA)
Evidenza: push.sh:544 `sudo /bin/systemctl restart trgb-frontend`; analisi_hardening_vps.md §3.A ("npm run dev in produzione, severità ALTA", 2026-04-27); roadmap T.2b ancora da fare; nessun `npm run build`/dist nel flusso di deploy.
Impatto: sorgenti e sourcemap esposti, endpoint HMR (/@vite/client) pubblici, performance degradate, single point of failure (vite crasha → frontend giù).
Fix proposto: eseguire T.2b come pianificato (build statico in frontend/dist servito da nginx, fallback Vite 24h). Già pianificato "primo mercoledì libero". — Effort: M
Modulo: infra
```

```
[A6-04] SEVERITÀ: HIGH
Titolo: Nessun test di restore mai eseguito sui backup (noto, stato: aperto — TODO post-incidente + roadmap T.7)
Evidenza: docs/problemi.md:94 "[ ] Restore test settimanale automatico" non spuntato; docs/sicurezza_backup.md:195 idem; roadmap T.7 MEDIA aperta; nessuna evidenza di restore test in changelog/sessione. Lezione 2 dell'incidente: "Un backup che esiste NON è valido finché non è stato testato per restore".
Impatto: l'intera catena di backup (LKG, Drive) è non provata end-to-end: in un disastro reale il primo restore della storia avverrebbe sotto pressione, su 15 file, con WAL e permessi da indovinare.
Fix proposto: una tantum subito: restore manuale di 2 DB (foodcost + vini_magazzino) da Drive in una dir di prova + integrity + count tabelle chiave; poi script settimanale automatico con notifica M.A (T.7). — Effort: M
Modulo: infra
```

```
[A6-05] SEVERITÀ: MED
Titolo: Off-site limitato a Google Drive — 3-2-1 incompleto (noto, stato: aperto)
Evidenza: docs/sicurezza_backup.md:191-196 TODO non spuntati: Aruba snapshot settimanale [ ], Backblaze B2 [ ], Time Machine Mac [ ]. Unico off-site automatico: rclone → gdrive (stesso account Google per daily/lkg/runbook).
Impatto: compromissione o blocco dell'account Google (o un `rclone sync` errato, che CANCELLA i file remoti non più presenti in locale) azzererebbe l'unico off-site. Il sync `rclone sync` propaga le delezioni per design.
Fix proposto: attivare Backblaze B2 (o secondo remote rclone con `copy` invece di `sync` per il LKG) + snapshot Aruba settimanale dal pannello. — Effort: M
Modulo: infra
```

```
[A6-06] SEVERITÀ: MED
Titolo: Swagger /docs e /openapi.json esposti in produzione (noto, stato: aperto)
Evidenza: main.py — nessuna occorrenza di `docs_url`/`redoc_url`/`openapi_url` (grep verificato); analisi_hardening_vps.md §3.D lo segnalava già il 2026-04-27 con fix da 30 secondi.
Impatto: mappa completa degli endpoint del gestionale (incl. quelli pubblici no-auth come /vini/carta-cliente/data) disponibile a chiunque per ricognizione mirata.
Fix proposto: `docs_url=None if IS_PROD else "/docs"` (idem redoc/openapi) con `IS_PROD` da env, come da analisi §3.D. — Effort: S
Modulo: infra
```

```
[A6-07] SEVERITÀ: MED
Titolo: Nessun rate limit su /auth/login (noto, stato: aperto)
Evidenza: nessuna direttiva `limit_req` nei template nginx di docs/deploy.md e docs/installazione_nuovo_server.md; analisi_hardening_vps.md §3.C aperta da apr 2026; fail2ban copre solo sshd, non l'HTTP.
Impatto: brute force su POST /auth/login senza alcun freno (password utenti potenzialmente deboli; il doc installazione mostra perfino l'hash di default "1234" per il primo utente).
Fix proposto: zona `limit_req` 5r/m burst 3 sul location /auth/login come da analisi §3.C (4 righe nginx). — Effort: S
Modulo: infra
```

```
[A6-08] SEVERITÀ: MED
Titolo: Watchdog backup con lista DB hardcoded divergente dalla discovery dinamica di backup_db.sh
Evidenza: scripts/backup_db.sh:55-76 (discovery dinamica *.sqlite3/*.db, "ogni DB nuovo viene automaticamente preso in carico") vs scripts/check_backup_health.sh:43-54 (array DBS fisso di 10 nomi). I 5 JSON config backuppati in LKG non sono verificati dal watchdog.
Impatto: un DB aggiunto in futuro (es. nuovo modulo) verrebbe backuppato ma mai sorvegliato: se il suo backup degrada (stub/corrotto/mancante in LKG) nessun allarme — replica parziale del pattern S60-INC1 (tasks.sqlite3 nato dopo il 28/04 non era backuppato).
Fix proposto: allineare check_backup_health.sh alla stessa discovery dinamica (o leggere la lista da .last_backup_status.json) + check size/validità dei 5 JSON in LKG. — Effort: S
Modulo: infra
```

```
[A6-09] SEVERITÀ: LOW
Titolo: Header di sicurezza HTTP assenti dai config nginx di riferimento (HSTS, X-Frame-Options, X-Content-Type-Options)
Evidenza: nessun `add_header` nei template nginx in docs/deploy.md §6 e docs/installazione_nuovo_server.md §6; nessuna menzione HSTS nel repo. Config live [NON VERIFICATA] ma con ogni probabilità identica ai template.
Impatto: senza HSTS un MITM può fare SSL-strip al primo accesso; senza X-Frame-Options l'app è inquadrabile in iframe (clickjacking su pannello gestionale).
Fix proposto: aggiungere al server block HTTPS: `add_header Strict-Transport-Security "max-age=31536000" always;`, `add_header X-Content-Type-Options nosniff;`, `add_header X-Frame-Options SAMEORIGIN;`. — Effort: S
Modulo: infra
```

```
[A6-10] SEVERITÀ: LOW
Titolo: CORS lasco — allow_methods/headers "*" con allow_credentials=True (noto, stato: aperto)
Evidenza: main.py:493-498 — `allow_credentials=True, allow_methods=["*"], allow_headers=["*"]` (origins però in allowlist esplicita di 4 host, che mitiga).
Impatto: superficie marginale (l'allowlist origins regge il grosso), ma resta il punto aperto §3.E dell'analisi hardening.
Fix proposto: stringere a metodi/header espliciti come da analisi §3.E. — Effort: S
Modulo: infra
```

```
[A6-11] SEVERITÀ: LOW
Titolo: Doc drift sullo stato backup: checkbox cron "da fare" stale + scaffold setup fuori sync
Evidenza: docs/problemi.md:87 "[ ] Setup cron del nuovo backup_db.sh + check_backup_health.sh sul VPS" NON spuntato, ma docs/sessione.md:1786 (2026-05-07, diagnosi via ssh) attesta "Crontab: tutti e 4 i job attivi. OK". Inoltre `setup-backup-and-security.sh` dichiarato "scaffold obsoleto, fuori sync" (sessione.md:1737) — installerebbe solo 2 dei 4 cron e con orario daily sbagliato (03:30 vs 03:00+18:00).
Impatto: chi legge problemi.md crede che i backup non siano schedulati (falso al 7/5); chi usasse lo scaffold su un nuovo server (istanza trgb.it!) otterrebbe un sistema di backup monco senza watchdog.
Fix proposto: spuntare la checkbox con data+evidenza; allineare setup-backup-and-security.sh ai 4 cron canonici di sicurezza_backup.md §2.1-2.2 (rilevante per S.2 runbook nuovo server). — Effort: S
Modulo: infra
```

---

## 8. Checklist comandi da rieseguire live (per orchestratore / Marco)

```bash
# 1. Backend
ssh trgb 'systemctl status trgb-backend --no-pager; systemctl show trgb-backend -p NRestarts; uptime'
ssh trgb 'journalctl -u trgb-backend --since "7 days ago" --no-pager | grep -icE "error|traceback|critical"'
# 2. Nginx / TLS / porte
ssh trgb 'sudo nginx -T 2>/dev/null | grep -E "add_header|limit_req|listen|server_name" | head -40'
ssh trgb 'ss -tlnp'
echo | openssl s_client -connect trgb.tregobbi.it:443 2>/dev/null | openssl x509 -noout -dates
# 3. Hardening
ssh trgb 'sudo fail2ban-client status sshd; grep -E "PasswordAuthentication|PermitRootLogin|^Port" /etc/ssh/sshd_config'
ssh trgb 'apt list --upgradable 2>/dev/null | head'
# 4. Backup — IL PIÙ IMPORTANTE
ssh trgb 'crontab -l'
ssh trgb 'cat /home/marco/trgb/trgb/app/data/backups/.last_backup_status.json /home/marco/trgb/trgb/app/data/backups/.last_health_status.json'
ssh trgb 'ls -la /home/marco/trgb/trgb/app/data/backups/last_known_good/ | head -25'
ssh trgb 'ls -lat /home/marco/trgb/trgb/app/data/backups/hourly/ | head -10; ls -lat /home/marco/trgb/trgb/app/data/backups/daily/ | head -5'
ssh trgb 'tail -30 /home/marco/trgb/backup_health.log'
# 5. Risorse
ssh trgb 'df -h; df -i /; free -h; journalctl --disk-usage; du -sh /var/log 2>/dev/null'
# 7. Versione deployata
curl -s https://trgb.tregobbi.it/system/info
```

## 9. Tabella riassuntiva

| ID | Sev | Titolo | Noto? | Verifica |
|----|-----|--------|-------|----------|
| A6-01 | HIGH | VPS non verificabile dall'ambiente di audit | no | n/a |
| A6-02 | HIGH | Nessun monitoring esterno uptime | noto (T.1 ALTA) | documentale |
| A6-03 | HIGH | Frontend prod su Vite dev server | noto (T.2b ALTA) | codice push.sh |
| A6-04 | HIGH | Restore test mai eseguito | noto (T.7) | documentale |
| A6-05 | MED | Off-site solo Google Drive, 3-2-1 incompleto | noto (TODO) | documentale |
| A6-06 | MED | /docs Swagger esposto in prod | noto (§3.D) | codice main.py |
| A6-07 | MED | Nessun rate limit /auth/login | noto (§3.C) | documentale |
| A6-08 | MED | Watchdog backup: lista DB hardcoded vs discovery dinamica | nuovo | codice script |
| A6-09 | LOW | Header sicurezza nginx assenti | parz. noto | template config |
| A6-10 | LOW | CORS lasco con credentials | noto (§3.E) | codice main.py |
| A6-11 | LOW | Doc drift checkbox cron + scaffold setup fuori sync | nuovo | docs |

**Conteggio: 0 CRIT · 4 HIGH · 4 MED · 3 LOW.**

Nessun CRIT assegnato perché: (a) i backup NON vivono solo sul VPS (Drive + copie locali Mac via push.sh, evidenza in codice), (b) i fix v2 post-incidente sono reali nel codice e il cron risultava attivo all'ultima verifica documentata (2026-05-07). MA: se la riesecuzione live di §8 trovasse cron fermo o backup stale, A6-02/A6-04 vanno promossi a CRIT immediatamente.
