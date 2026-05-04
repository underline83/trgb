# Patch alla skill `/guardiano` post-incidente 4 maggio 2026

> **Perché questo file esiste:** la skill è in path read-only dal workspace
> Cowork (sotto `~/.claude/skills/guardiano/SKILL.md`). Le modifiche vanno
> applicate manualmente da Marco aprendo il file con un editor.
>
> **Path della skill:** `/var/folders/vm/ygkdd1hx05zbc1h7wwqwntf40000gn/T/claude-hostloop-plugins/0a18d6752c1a06e5/skills/guardiano/SKILL.md`
> (su altri Mac potrebbe variare il prefisso `claude-hostloop-plugins`).

---

## Modifica #1 — Sostituire Step 5 (Post-audit) con versione estesa

**Trovare nella skill:**

```markdown
### Step 5 — Post-audit
Dopo il push completato:
1. Probe HTTP: `curl -sI -o /dev/null -w "%{http_code}" --max-time 5 https://trgb.tregobbi.it/` → atteso 1xx/2xx/3xx/4xx.
2. Per i file che hanno toccato endpoint critici, fai un curl mirato sull'endpoint specifico (con auth dummy se serve) e riporta status code + tempo.
3. Verifica che `git log -1 --oneline` rifletta il commit appena fatto.
```

**Sostituire con:**

```markdown
### Step 5 — Post-audit
Dopo il push completato:
1. Probe HTTP: `curl -sI -o /dev/null -w "%{http_code}" --max-time 5 https://trgb.tregobbi.it/` → atteso 1xx/2xx/3xx/4xx.
2. Per i file che hanno toccato endpoint critici, fai un curl mirato sull'endpoint specifico (con auth dummy se serve) e riporta status code + tempo.
3. Verifica che `git log -1 --oneline` rifletta il commit appena fatto.

### Step 5b — DB SANITY CHECK post-deploy (CRITICO, post-incidente 4 maggio)

Aggiunto dopo l'incidente 4 maggio 2026: il backend zombie può rispondere 200
OK ai probe HTTP mentre i DB sul disco sono già svuotati. Il probe HTTP da solo
non basta. Per ogni push, dopo il restart, fai questo check sul VPS:

\`\`\`bash
ssh trgb "cd /home/marco/trgb/trgb && for db in foodcost.db admin_finance.sqlite3 vini.sqlite3 vini_magazzino.sqlite3 vini_settings.sqlite3 dipendenti.sqlite3 clienti.sqlite3 notifiche.sqlite3 tasks.sqlite3 bevande.sqlite3; do
    SRC=''
    for p in \"locali/tregobbi/data/\$db\" \"app/data/\$db\"; do
        [ -f \"\$p\" ] && SRC=\"\$p\" && break
    done
    [ -z \"\$SRC\" ] && continue
    SZ=\$(stat -c%s \"\$SRC\")
    INTEG=\$(sqlite3 \"\$SRC\" 'PRAGMA integrity_check;' 2>&1 | head -1)
    if [ \"\$SZ\" -lt 8192 ] || [ \"\$INTEG\" != 'ok' ]; then
        echo \"FAIL \$db: size=\$SZ integ=\$INTEG\"
    fi
done"
\`\`\`

Se trovi righe con `FAIL`:
- ALLARME ROSSO. NON considerare il push come "andato bene".
- Riferisci IMMEDIATAMENTE a Marco con i nomi dei DB problematici.
- Non aggiornare i docs (sessione/changelog) come se fosse stato un push regolare.
- Suggerisci di NON fare altri push e di aprire una sessione di indagine.

### Step 5c — Stato sistema backup (informativo)

Prima di chiudere il post-audit, leggi lo stato del check backup health:

\`\`\`bash
ssh trgb "cat /home/marco/trgb/trgb/app/data/backups/.last_health_status.json 2>/dev/null"
ssh trgb "cat /home/marco/trgb/trgb/app/data/backups/.last_backup_status.json 2>/dev/null"
\`\`\`

Se `status: unhealthy` o `failed_count > 0`, riporta a Marco:
- Lista delle issues
- Età ultima esecuzione backup hourly e daily
- Età ultimo Drive sync
- Stato della cartella `last_known_good/`

Se invece tutto OK, una riga sintetica basta:
\`\`\`
🩺 Backup: hourly OK (Xmin), daily OK (Xh), Drive sync OK (Xh), LKG 10/10 integri
\`\`\`
```

---

## Modifica #2 — Aggiungere sub-comando `backup-status`

**Trovare nella skill:**

```markdown
## Sub-comando: `status` (mini-dashboard)
```

**Aggiungere PRIMA di quel header:**

```markdown
## Sub-comando: `backup-status` (post-incidente 4 maggio)

Quando Marco scrive `/guardiano backup-status` o `/guardiano backup`:

### Step 1 — Leggi i file di stato sul VPS
\`\`\`bash
ssh trgb "cat /home/marco/trgb/trgb/app/data/backups/.last_health_status.json 2>/dev/null"
ssh trgb "cat /home/marco/trgb/trgb/app/data/backups/.last_backup_status.json 2>/dev/null"
ssh trgb "ls -la /home/marco/trgb/trgb/app/data/backups/last_known_good/"
ssh trgb "find /home/marco/trgb/trgb/app/data/backups/hourly -type f -newer /tmp -printf '%TY-%Tm-%Td %TH:%TM %s %f\\n' | sort -r | head -20"
\`\`\`

### Step 2 — Costruisci dashboard
\`\`\`
🩺 Stato Backup TRGB (<data>)

📊 Sintesi:
   Hourly:    ultimo X min fa (totale Y file in finestra 48h)
   Daily:     ultimo Xh fa  (totale Y giorni in retention)
   Drive:     ultimo Xh fa
   LKG:       N/10 DB integri, J/5 JSON integri
   Health:    ✅ HEALTHY / 🚨 UNHEALTHY (N issues)

📁 Last_known_good per file:
   foodcost.db          7.1 MB   2026-05-04 03:30   ✅ integro
   clienti.sqlite3      26 MB    2026-05-04 03:30   ✅ integro
   ...

⚠️  Issues attive:
   - [se ci sono]

→ Vuoi che indaghi qualche file specifico?
\`\`\`

### Step 3 — Suggerimenti se UNHEALTHY
Se trovi issues:
- `hourly_stale_*`: cron disabilitato? `systemctl status cron`. Disco pieno? `df -h`.
- `drive_sync_stale_*`: rclone token scaduto? Riautorizzare con `rclone config reconnect gdrive:`
- `lkg_corrupt:*`: il DB di `last_known_good/` è corrotto. Investigare con `sqlite3 ... 'PRAGMA integrity_check'`
- `last_run_failed:*`: `tail -200 /home/marco/trgb/backup.log` per vedere gli errori

```

---

## Modifica #3 — Aggiungere ad "Anti-pattern (cose da NON fare)"

**Trovare nella skill:**

```markdown
- ❌ Toccare i .sqlite3 in `/Users/underline83/trgb/app/data/` (sono backup locali del VPS, modificarli è non senso).
```

**Aggiungere SUBITO DOPO:**

```markdown
- ❌ Considerare un push "completato" senza il DB sanity check post-deploy (Step 5b). Backend UP non significa DB integri (vedi incidente 4 maggio: backend zombie con DB svuotati).
- ❌ Aggiornare docs/sessione.md o docs/changelog.md per un push se il sanity check post-deploy ha fallito. Prima si indaga, poi si scrive.
- ❌ Introdurre fallback automatici sui path di file persistenti (es. "se il file non esiste in path A leggilo da path B"). Le migrazioni di storage devono essere esplicite, atomiche, verificate. Vedi `docs/sicurezza_backup.md` §4 regola #1.
```

---

## Modifica #4 — Aggiornare la description (frontmatter)

**Trovare in cima alla skill:**

```yaml
description: Audit pre/post deploy del progetto TRGB Gestionale (osteria di Marco Carminati). Da invocare ogni volta che Marco scrive "/guardiano", "guardiano", "audit", "check guardiano", "controllo prima del push", oppure quando chiede di pushare modifiche al gestionale ("pusha", "commit", "deploy", "push.sh"). La skill esegue un controllo intelligente prima del deploy (legge git diff, verifica coerenza con roadmap/problemi/controllo_design, controlla regressioni potenziali, suggerisce commit message), orchestra l'esecuzione di push.sh, fa il post-audit (probe HTTP, verifica restart, aggiornamento docs di sessione/changelog/roadmap/problemi). È il complemento intelligente del modulo guardiano L1 già implementato in push.sh — qui aggiunge il livello semantico che bash non sa fare.
```

**Sostituire con:**

```yaml
description: Audit pre/post deploy del progetto TRGB Gestionale (osteria di Marco Carminati). Da invocare ogni volta che Marco scrive "/guardiano", "guardiano", "audit", "check guardiano", "controllo prima del push", "backup-status", oppure quando chiede di pushare modifiche al gestionale ("pusha", "commit", "deploy", "push.sh") oppure di verificare lo stato del sistema backup. La skill esegue un controllo intelligente prima del deploy (legge git diff, verifica coerenza con roadmap/problemi/controllo_design, controlla regressioni potenziali, suggerisce commit message), orchestra l'esecuzione di push.sh, fa il post-audit (probe HTTP, DB sanity check via SSH PRAGMA integrity_check post-restart, lettura .last_health_status.json del backup, aggiornamento docs di sessione/changelog/roadmap/problemi). Sub-comando "backup-status" per dashboard salute backup. È il complemento intelligente del modulo guardiano L1 già implementato in push.sh — qui aggiunge il livello semantico che bash non sa fare. Post-incidente 4 maggio 2026 con DB sanity check obbligatorio.
```

---

## Come applicare il patch

1. Apri il file: `open /var/folders/vm/ygkdd1hx05zbc1h7wwqwntf40000gn/T/claude-hostloop-plugins/0a18d6752c1a06e5/skills/guardiano/SKILL.md` (in TextEdit o `nano`)
2. Applica le 4 modifiche descritte sopra (cerca il testo "Trovare", sostituisci con "Sostituire con")
3. Salva il file
4. La prossima invocazione di `/guardiano` userà la versione aggiornata

In alternativa, se preferisci, lo posso fare io in una sessione di sviluppo — devi solo darmi accesso al folder con `request_cowork_directory`. Ma è 5 minuti a mano e non richiede una sessione dedicata.
