# Sicurezza e Backup — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-11-24
> **Vedi anche:** [deploy.md](deploy.md), [analisi_hardening_vps.md](analisi_hardening_vps.md), [installazione_nuovo_server.md](installazione_nuovo_server.md)

> **Documento creato**: 4 maggio 2026 dopo l'incidente di corruzione silente DB
> (R6.5 push 1) che ha causato la perdita di ~36h di dati operativi.
>
> **Scopo**: descrivere il sistema di sicurezza/backup TRGB nel suo nuovo stato
> post-incidente e le regole operative per non ripetere lo scenario.

---

## 1. L'incidente del 3 maggio 2026 (riassunto)

**Cronologia:**
- **2 maggio sera (20:30 circa)**: deploy di R6.5 push 1 sul VPS. Introdotto
  `app/utils/locale_data.py::locale_data_path()` con fallback automatico
  (`locali/<id>/data/<file>` → `app/data/<file>` se il primo non esiste).
- **3 maggio 00:00**: il backend, post-restart o post-init di un singolo modulo,
  ha aperto connessioni SQLite verso path inconsistenti. Risultato: file stub
  da 4096 byte (1 page SQLite) sono stati creati in path nuovi mentre WAL era
  attivo su path vecchi. Lo stato in-memory del backend è restato corretto, ma
  i file su disco sono diventati inutilizzabili.
- **3 maggio 03:30 e dopo**: `backup_db.sh` ha continuato a girare, ha copiato
  i file stub (4096 byte) come "backup buoni", ha ruotato i backup vecchi
  integri. In meno di 24 ore la storia integra è scomparsa.
- **3-4 maggio**: continuata l'attività di sviluppo (R8a/b/c, K-bis) senza
  accorgersi che il sistema era zombie. Backend rispondeva 200 OK ai probe HTTP
  perché aveva la cache in memoria.
- **4 maggio mattina**: scoperta della corruzione durante R6.5 push 2 (tentativo
  di consolidamento fisico DB).

**Recovery:**
- 7 DB recuperati al 2 maggio 23:00 (ultimo hourly integro): admin_finance,
  clienti, dipendenti, foodcost, vini, vini_magazzino + vini_settings (al 03:30)
- `notifiche.sqlite3` recuperato al 28/04 dal backup manuale Mac di Marco
- `tasks.sqlite3` e `bevande.sqlite3` ricreati vuoti dalle migrazioni
- `users.json` ricreato a mano (utenti staff persi, va ricreato dall'app)
- **Persi definitivamente**: dati operativi del 3 maggio (chiusure fiscali,
  prenotazioni, modifiche), task templates, tutti gli utenti staff oltre admin

**Root cause analysis** (fallimenti del sistema esistente):
1. `locale_data_path()` con fallback automatico → race con WAL.
2. `backup_db.sh` non validava integrità → ha copiato stub come buoni.
3. Rotazione backup automatica → ha distrutto storia integra.
4. Push.sh L1 sanity check → solo HTTP probe, non interrogava DB.
5. Skill `/guardiano` → audit di codice, non di stato runtime.
6. 3-2-1 backup violato in tutti i punti.

---

## 2. Architettura post-incidente

### 2.1 Layer 1 — `backup_db.sh` v2 (post-incidente)

File: `scripts/backup_db.sh`

**Cosa fa di nuovo:**
- **Verifica integrità su ogni file** prima di considerarlo backup valido:
  - Magic bytes SQLite (`SQLite format 3`)
  - Dimensione minima (`MIN_SIZE_BYTES = 8192`, sotto = stub/svuotato)
  - `PRAGMA integrity_check` deve tornare `ok`
- **Se integrity fallisce, NON sostituisce nulla**: backup non rotato, stub
  scartato (`rm -f`), il fallimento viene registrato.
- **Cartella `last_known_good/`**: contiene SEMPRE 1 backup integro per ogni
  DB e ogni JSON config. NON viene MAI rotata. Se l'ultimo backup fallisce,
  la copia integra qui resta. Sopravvive a settimane di backup falliti.
- **Rotazione condizionata**: se >50% dei backup fallisce, la rotazione vecchi
  viene SOSPESA (così non perdiamo backup integri vecchi mentre i nuovi
  falliscono).
- **Status file** `backups/.last_backup_status.json`: contiene esito ultimo
  run (mode, timestamp, ok/failed/warnings, lista DB falliti). Leggibile da
  monitor esterni e dalla skill `/guardiano`.
- **Notifica via M.A** (`notifiche_service.crea_notifica`) se uno o più backup
  falliscono, con `urgenza='alta'` e `dest_ruolo='superadmin'`.
- **Lista DB dinamica** (dal 15/5/2026): ogni `*.sqlite3` e `*.db` della cartella
  dati entra nel backup da solo, senza toccare lo script. Al 24/11/2026 sono
  17 (i 10 di maggio + accessi, cassa_conti, comande, connettore, email,
  pratiche, sito). L'elenco coi moduli è in [database.md](database.md) §1.
- **JSON config**: i 5 «core» (users.json, modules.json, modules.runtime.json,
  modules.runtime.meta.json, closures_config.json) più, dalla v2.3, ogni altro
  `*.json` della cartella dati (auth_settings, email_settings, email_caselle…).
  Validati come JSON prima di accettarli; soglia minima 20 byte per i core.
- **File caricati** (v2.3, 24/11/2026) — nel ciclo `--daily`:
  `/home/marco/trgb_uploads/` (documenti dipendenti, CV, allegati pratiche, F24,
  export iPratico, foto menu, listini) e `locali/tregobbi/data/uploads/`
  (bollette utenze, XML intermittenti) vengono copiati in
  `app/data/backups/uploads/{trgb_uploads,locale_data_uploads}/` con `cp -a -u`
  e su Drive con `rclone copy`. La copia è **additiva**: un file cancellato sul
  VPS resta nel backup e su Drive. Prima della v2.3 questi file non erano in
  nessun backup. Se la copia fallisce è un fallimento vero (notifica M.A).
- **Dual path** (locale-aware): cerca prima in `locali/tregobbi/data/`, poi
  fallback a `app/data/`. Se trova entrambi (durante migrazione) usa quello
  con dimensione maggiore.
- **Sync Drive separato per `last_known_good/`** (oltre al daily): copia
  separata su `gdrive:TRGB-Backup/db-lkg` così nemmeno se Drive daily diventa
  corrotto perdiamo l'LKG.
- **v2.2 / v2.2.1 (2 lug 2026) — anti falsi positivi da lock**: i check `PRAGMA
  integrity_check` sulla sorgente ora aprono con `-readonly` + `.timeout`
  15s + retry-once dopo 3s; il comando `.backup` ha `.timeout` 30s +
  retry-once e lo stderr viene loggato (prima finiva in `/dev/null`).
  ⚠️ v2.2.1: usare SEMPRE il dot-command `.timeout`, MAI `-cmd "PRAGMA
  busy_timeout=..."` — il PRAGMA stampa il valore in stdout e rompe il parsing
  del risultato (`head -1`), incidente "10 file FALLITI" del 2 lug. Motivo:
  i DB più scritti (admin_finance, bevande) fallivano saltuariamente il backup
  per un semplice write lock transitorio del backend, generando falsi
  `source_corrupted` / `backup_failed` in notifica (giu–lug 2026).

**Politica retention (aggiornata 4 mag 2026 dopo richiesta Marco):**
- **Hourly** (`backup_db.sh` senza arg) — 10 backup PER DB → ~10 ore di copertura
  con cron orario. Più robusto del "mtime > N ore" perché se cron resta fermo,
  rimangono comunque gli ultimi 10 (anche se sono di una settimana fa).
- **Daily** (`backup_db.sh --daily`) — 14 cartelle daily totali → 1 settimana
  di copertura con 2 sync/giorno (alle 03:00 e 18:00).
- **Last_known_good** — 1 copia per file, MAI ruotata se backup nuovo fallisce.
- **Drive** — sync incrementale, retention allineata al locale (rclone sync rimuove
  file dal remote che non sono più nel locale).

**Politica sync Drive (aggiornata 4 mag 2026):**
2 sync/giorno scelti per non interferire col servizio dell'osteria:
- **03:00** — osteria sicuramente chiusa (notte profonda)
- **18:00** — finestra morta tra fine pranzo (16:00) e inizio cena (19:30)

Ogni sync `--daily` invia 4 cose distinte su Drive:
1. `gdrive:TRGB-Backup/db-daily/` — backup DB di questo ciclo (retention 14)
2. `gdrive:TRGB-Backup/db-lkg/` — last_known_good cumulativa (1 copia integra/file)
3. `gdrive:TRGB-Backup/db-uploads/` — file caricati (v2.3; `rclone copy`, mai cancellazioni)
4. `gdrive:TRGB-Backup/db-runbook/` — script + push.sh + docs + CLAUDE.md + locali/
   (lo "userbook di recovery"; permette di ricostruire il sistema da zero anche
   senza accesso a GitHub). Dalla v2.3 `locali/*/data/` è esclusa: portava su
   Drive i DB vivi copiati a caldo, doppione non atomico di db-daily. Le copie
   vecchie già su Drive in `db-runbook/locali/tregobbi/data/` non vengono
   cancellate dallo script: si possono togliere a mano.

**Quanto pesa e cosa si cancella (stima del 24/11/2026 dai DB scaricati):** un
giro completo dei 17 DB pesa circa 89 MB. Le copie NON si sommano all'infinito:
hourly tiene le ultime 10 per DB (~0,9 GB), daily le ultime 14 cartelle
(~1,25 GB), LKG una copia sola (~0,1 GB). Totale sul VPS circa 2,3 GB su 157
(disco al 17%), e cresce solo se crescono i DB. Su Drive `db-daily` è lo
specchio del daily locale (stessa rotazione). L'unica parte che si accumula per
scelta sono i file caricati (21 MB al 24/11).

**Cron consigliato:**
```
# Hourly backup ogni ora (rotazione 10 ultimi per DB, NO Drive)
0 * * * * /home/marco/trgb/trgb/scripts/backup_db.sh >> /home/marco/trgb/backup.log 2>&1

# Daily backup — 03:00 (osteria chiusa) + Drive sync
0 3 * * * /home/marco/trgb/trgb/scripts/backup_db.sh --daily >> /home/marco/trgb/backup.log 2>&1

# Daily backup — 18:00 (tra pranzo finito 16 e cena 19:30) + Drive sync
0 18 * * * /home/marco/trgb/trgb/scripts/backup_db.sh --daily >> /home/marco/trgb/backup.log 2>&1
```

### 2.2 Layer 2 — `check_backup_health.sh` (post-incidente)

File: `scripts/check_backup_health.sh`

**Cosa fa:**
- Gira via cron OGNI 30 MINUTI, ai minuti 15 e 45 (sfasato dai backup)
- Verifica 6 cose:
  1. Backup orario fresco (< 70 min)
  2. Backup daily fresco (< 25 ore)
  3. Drive sync fresco (< 25 ore)
  4. `last_known_good/` contiene tutti i DB della cartella dati con
     size+integrity OK. **v1.3 (24/11/2026): lista dinamica** come il backup
     (prima erano i 10 fissi di maggio, i 7 DB nati dopo non erano sorvegliati).
     Un DB nato da meno di 70 minuti non è un allarme. L'integrity check apre
     le copie con `immutable=1` e non lascia più `-shm`/`-wal` accanto ai file
     (se l'apertura immutable non dà `ok` ricade sul `-readonly` di prima).
  5. Status file `.last_backup_status.json` riporta `failed_count: 0`
  6. Copia dei file caricati (v1.3): stamp `.last_uploads_backup` < 25 ore
- Scrive esito in `backups/.last_health_status.json`
- Se 1+ check fallisce → notifica via M.A con urgenza alta a `superadmin`
- **v1.2 (2 lug 2026) — dedupe notifiche**: notifica solo se il set di issues
  è cambiato rispetto all'ultima notifica (firma senza cifre in
  `backups/.last_health_notified`), oppure re-remind dopo 6h se il problema
  persiste. Quando il sistema torna sano la firma si azzera. Prima lo stesso
  `last_run_failed:1` veniva ri-notificato ogni 30 min fino al run successivo.

**Perché esiste:**
backup_db.sh può smettere di girare (cron disabilitato, errore systemd, disco
pieno) e nessuno se ne accorge. Il check separato dice "ehi, sono passate 2 ore
dall'ultimo backup, qualcosa non va". È il watchdog del watchdog.

**Cron:**
```
15,45 * * * * /home/marco/trgb/trgb/scripts/check_backup_health.sh >> /home/marco/trgb/backup_health.log 2>&1
```

Crontab verificato sul VPS il 24/11/2026: le 4 righe (orario, 03:00, 18:00,
watchdog 15,45) sono quelle di questa pagina.

La card in Impostazioni › Backup (`/system/backup-health`, `main.py`) dal
24/11/2026 usa la stessa lista dinamica.

### 2.3 Layer 3 — `push.sh` v2 (post-incidente)

File: `push.sh` (sezione "Modulo Guardiano L1")

**Cosa fa di nuovo:**
- **Pre-push DB sanity check** sul VPS via SSH:
  - Per ogni DB nella lista, controlla magic bytes + size + integrity_check
  - Se trova STUB (size < 8KB) o CORRUPT (integrity != ok), BLOCCA con conferma
    esplicita (`Pushare COMUNQUE? [y/N]`)
  - Default = abort
- **Stato ultimo backup** letto da `.last_backup_status.json`:
  - Se `failed_count > 0` o ultimo backup > 25h fa, warning
- **Validation post-download** delle copie locali:
  - Confronta dimensione DB nuovo vs `.prev`
  - Se < 50% del precedente → REGRESSO, warning + conferma
  - Se < 8KB (stub) → ripristina automaticamente `.prev` per non perdere la copia integra locale
- **Post-deploy sanity check** (nuovo):
  - Dopo restart backend, ripete il sanity check sul VPS
  - Se trova problemi → ALLARME ROSSO + notifica via M.A

### 2.4 Layer 4 — Skill `/guardiano` (post-incidente)

File: `~/.claude/skills/guardiano/SKILL.md` (vedi `docs/skill_guardiano_patch_post_incidente.md`)

**Cosa fa di nuovo:**
- Step 5b post-audit: lancia il DB sanity check sul VPS via SSH e BLOCCA se trova
  problemi (no update docs, no "push completato")
- Step 5c post-audit: legge `.last_health_status.json` e riporta a Marco lo stato
  del sistema backup. Se UNHEALTHY, allarme rosso nella risposta.
- Sub-comando `/guardiano backup-status`: dashboard rapida solo dello stato backup.

### 2.5 Backup multipli (3-2-1 reale)

**Ora abbiamo 4 livelli locali + 4 destinazioni Drive** (più la copia dei file
caricati in `app/data/backups/uploads/`, v2.3):
1. **Hourly** in `app/data/backups/hourly/` (10 ultimi per DB)
2. **Daily** in `app/data/backups/daily/<TIMESTAMP>/` (14 cartelle = 1 settimana
   con 2 sync/giorno)
3. **Last_known_good** in `app/data/backups/last_known_good/` (mai rotato se
   nuovo backup fallisce; sempre 1 copia integra per file)
4. **Drive remote** (3 destinazioni):
   - `gdrive:TRGB-Backup/db-daily/` — backup completi giornalieri (rotazione 14)
   - `gdrive:TRGB-Backup/db-lkg/` — last_known_good cumulativo (1 copia integra/file)
   - `gdrive:TRGB-Backup/db-uploads/` — file caricati (additivo)
   - `gdrive:TRGB-Backup/db-runbook/` — script + push.sh + docs + CLAUDE.md +
     locali/ senza `data/` (codice di recovery indipendente da git/GitHub)

**Da fare ancora (TODO):**
- [ ] Aruba snapshot manuale settimanale (Marco lo fa dal pannello)
- [ ] Backblaze B2 sync alternativa a Drive (ridondanza geografica)
- [ ] Time Machine attivo sul Mac di Marco
- [ ] Restore test settimanale automatico (lancia un `.backup` di prova,
  compara dimensione/integrity, notifica via M.A se fallisce) — T.7 in
  [roadmap.md](roadmap.md). Al 24/11/2026 un restore non è mai stato provato.
- [ ] Capire i due buchi di 10-12 ore senza backup orario del 1/6 e 1/8/2026
  (notifiche `hourly_stale_584min` e `_764min`, tutti e due il primo del mese)

---

## 3. Notifiche M.A integrate

Tutti gli alarm passano per `app/services/notifiche_service.py::crea_notifica`
con questi parametri standard:

```python
crea_notifica(
    tipo='backup',           # categoria
    titolo='...',           # breve, visibile nella campanella
    messaggio='...',        # dettagli
    urgenza='alta',         # bassa | normale | alta
    modulo='platform',      # categoria modulo
    dest_ruolo='superadmin', # solo superadmin riceve allarmi backup
    icona='🩺',             # icona widget (opzionale)
)
```

I superadmin (Marco) vedono la notifica nella campanella in alto a destra
appena entrano nel sistema. Le notifiche persistono in `notifiche.sqlite3`
finché non vengono dismissate.

---

## 4. Disciplina operativa post-incidente

### Regole inderogabili

1. **Mai introdurre fallback automatici sui path di file persistenti.** Se un
   file deve migrare da posto A a posto B, fai una migrazione esplicita
   one-shot con copia + verifica + switch atomico, MAI un fallback runtime
   che apre il file in un posto se non esiste nell'altro.

2. **Mai considerare un push "andato bene" senza il post-deploy DB sanity check.**
   Backend UP ≠ DB integri. WAL nasconde la corruzione per ore o giorni.

3. **Mai rotare backup vecchi se il backup nuovo non è verificato integro.**
   Un backup non verificato è teatro della sicurezza.

4. **Mai modificare un file `.sqlite3` direttamente sul VPS** senza:
   - Backup atomico via `sqlite3 .backup` PRIMA della modifica
   - Verifica integrity dopo la modifica
   - Aggiornamento `last_known_good/`

5. **Sempre tenere `last_known_good/` invariato** se l'ultimo backup è fallito.
   È l'ancora di salvezza in caso di corruzione persistente.

### Cosa fare se il check backup health alarma

1. Aprire `/home/marco/trgb/trgb/app/data/backups/.last_health_status.json`
2. Identificare la issue (es. `hourly_stale_75min`)
3. Investigare la causa:
   - cron disabilitato? `systemctl status cron`
   - disco pieno? `df -h`
   - backup_db.sh in errore? `tail -50 /home/marco/trgb/backup.log`
   - DB sorgente corrotto? `sqlite3 app/data/<db> 'PRAGMA integrity_check'`
4. Se serve restore: usare `last_known_good/` come fonte (e PRIMA testare con
   `sqlite3 .recover` o `sqlite3 .dump | sqlite3 nuovo.db` per verificare)
5. Documentare in `docs/problemi.md`

---

## 5. Roadmap futura della sicurezza

- ~~**R6.5 push 2**~~ — ✅ fatto a maggio 2026 (push 2 del 4/5 e push 3 del 5/5):
  DB in `locali/tregobbi/data/`, fallback di `locale_data_path()` rimosso.
- **Restore test automatico settimanale** — script che ogni domenica notte
  fa un restore di prova in `/tmp/restore_test/`, lancia integrity_check,
  notifica via M.A.
- **Backblaze B2 ridondante** — alternativa a Drive con CLI restore facile e
  versioning 30 giorni gratuito. Costa pochi euro al mese.
- **Aruba snapshot infrastrutturale** — automatizzare snapshot settimanale via
  API Aruba (se disponibile) o script che chiede a Marco di farlo manuale ogni
  domenica.
- **Documentazione runbook recovery** — passi precisi per restore da ogni livello
  in caso di prossimo incidente. Niente più "cerchiamo insieme".
