#!/bin/bash
# check_backup_health.sh — Health check del sistema di backup TRGB
#
# Creato 2026-05-04 dopo l'incidente del 3 maggio: il backup_db.sh continuava
# a girare ma backuppava 0-byte. Nessun allarme. Servono check ESTERNI che
# verifichino che il backup esista, sia recente, sia integro, sia copiato fuori.
#
# Cosa controlla (tutti via M.A notifiche se falliscono):
#   1. backup_db.sh hourly: ultima esecuzione < 70 minuti fa
#   2. backup_db.sh daily:  ultima esecuzione < 25 ore fa
#   3. Drive sync daily:    ultimo sync < 25 ore fa
#   4. last_known_good/:    contiene tutti i DB con size > 8KB e integrity ok
#   5. Backup hourly count: almeno N backup recenti per ogni DB
#
# v1.1 (2026-05-07): integrity_check ora apre i file LKG con `sqlite3 -readonly`
# e retry-once dopo 3 secondi se la prima passata fallisce. Motivo: il check
# girava al minuto :00 in concomitanza con `backup_db.sh` orario, scontrandosi
# col `cp -f` di `update_lkg()` sui 3 DB più grandi (foodcost/vini/clienti) →
# vedeva file troncati a metà → falsi "lkg_corrupt". Fix mirato + sfasare il
# cron del check da `*/30` a `15,45 * * * *` (vedi commit log per crontab edit).
#
# Cron suggerito (ogni 30 min, sfasato per non scontrarsi coi backup orari/daily):
#   15,45 * * * * /home/marco/trgb/trgb/scripts/check_backup_health.sh \
#                   >> /home/marco/trgb/backup_health.log 2>&1

set -uo pipefail

PROJECT_DIR="/home/marco/trgb/trgb"
DATA_DIR="$PROJECT_DIR/app/data"
BACKUP_DIR="$DATA_DIR/backups"
LKG_DIR="$BACKUP_DIR/last_known_good"
HOURLY_DIR="$BACKUP_DIR/hourly"
STATUS_FILE="$BACKUP_DIR/.last_backup_status.json"
DRIVE_SYNC_STAMP="$BACKUP_DIR/.last_drive_sync"
HEALTH_STATUS_FILE="$BACKUP_DIR/.last_health_status.json"
VENV_PYTHON="/home/marco/trgb/venv-trgb/bin/python"

MIN_SIZE_BYTES=8192
HOURLY_MAX_AGE_MIN=70    # backup orario deve essere < 70 min (60+10 grace)
DAILY_MAX_AGE_HOURS=25   # backup daily deve essere < 25 ore (24+1 grace)
DRIVE_MAX_AGE_HOURS=25   # sync Drive deve essere < 25 ore

DBS=(
    "foodcost.db"
    "admin_finance.sqlite3"
    "vini.sqlite3"
    "vini_magazzino.sqlite3"
    "vini_settings.sqlite3"
    "dipendenti.sqlite3"
    "clienti.sqlite3"
    "notifiche.sqlite3"
    "tasks.sqlite3"
    "bevande.sqlite3"
)

NOW=$(date +%s)
ISSUES=()

# ── Funzione helper: invia notifica via M.A ─────────────────────────────────
notify() {
    local urgenza="$1"
    local titolo="$2"
    local messaggio="$3"

    if [ ! -x "$VENV_PYTHON" ]; then return 0; fi
    cd "$PROJECT_DIR" || return 0
    PYTHONPATH="$PROJECT_DIR" "$VENV_PYTHON" -c "
try:
    from app.services.notifiche_service import crea_notifica
    crea_notifica(
        tipo='backup',
        titolo='''$titolo''',
        messaggio='''$messaggio''',
        urgenza='$urgenza',
        modulo='platform',
        dest_ruolo='superadmin',
        icona='🩺',
    )
except Exception as e:
    print(f'Notify failed: {e}')
" 2>&1 || true
}

# ── 1. backup_db.sh hourly: ultima esecuzione recente? ──────────────────────
echo "[$(date)] Health check backup avviato"
echo ""
echo "--- Check 1: backup orario recente ---"
LAST_HOURLY_FILE=$(find "$HOURLY_DIR" -type f \( -name "*.sqlite3" -o -name "*.db" \) -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | awk '{print $2}')
if [ -z "$LAST_HOURLY_FILE" ]; then
    ISSUES+=("hourly_dir_vuota")
    echo "❌ Nessun backup orario presente"
else
    LAST_HOURLY_EPOCH=$(stat -c%Y "$LAST_HOURLY_FILE")
    AGE_MIN=$(( (NOW - LAST_HOURLY_EPOCH) / 60 ))
    if [ "$AGE_MIN" -gt "$HOURLY_MAX_AGE_MIN" ]; then
        ISSUES+=("hourly_stale_${AGE_MIN}min")
        echo "❌ Ultimo backup orario è di ${AGE_MIN} min fa (soglia $HOURLY_MAX_AGE_MIN min)"
    else
        echo "✅ Ultimo backup orario: ${AGE_MIN} min fa"
    fi
fi

# ── 2. backup_db.sh daily: ultima esecuzione recente? ───────────────────────
echo ""
echo "--- Check 2: backup daily recente ---"
LAST_DAILY_DIR=$(find "$BACKUP_DIR/daily" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | awk '{print $2}')
if [ -z "$LAST_DAILY_DIR" ]; then
    ISSUES+=("daily_dir_vuota")
    echo "❌ Nessun backup daily presente"
else
    LAST_DAILY_EPOCH=$(stat -c%Y "$LAST_DAILY_DIR")
    AGE_H=$(( (NOW - LAST_DAILY_EPOCH) / 3600 ))
    if [ "$AGE_H" -gt "$DAILY_MAX_AGE_HOURS" ]; then
        ISSUES+=("daily_stale_${AGE_H}h")
        echo "❌ Ultimo backup daily è di ${AGE_H}h fa (soglia $DAILY_MAX_AGE_HOURS h)"
    else
        echo "✅ Ultimo backup daily: ${AGE_H}h fa"
    fi
fi

# ── 3. Drive sync: ultimo upload recente? ───────────────────────────────────
echo ""
echo "--- Check 3: Drive sync recente ---"
if [ -f "$DRIVE_SYNC_STAMP" ]; then
    LAST_DRIVE_EPOCH=$(cat "$DRIVE_SYNC_STAMP" 2>/dev/null || echo 0)
    AGE_H=$(( (NOW - LAST_DRIVE_EPOCH) / 3600 ))
    if [ "$AGE_H" -gt "$DRIVE_MAX_AGE_HOURS" ]; then
        ISSUES+=("drive_sync_stale_${AGE_H}h")
        echo "❌ Drive sync di ${AGE_H}h fa (soglia $DRIVE_MAX_AGE_HOURS h)"
    else
        echo "✅ Drive sync: ${AGE_H}h fa"
    fi
else
    ISSUES+=("drive_sync_never")
    echo "❌ Drive sync mai eseguito (.last_drive_sync mancante)"
fi

# ── 4. last_known_good: tutti i DB presenti, integri, recenti? ──────────────
echo ""
echo "--- Check 4: last_known_good integro ---"
LKG_OK=0
LKG_MISSING=0
LKG_STUB=0
LKG_CORRUPT=0
LKG_OLD=0

# Helper: integrity check su un file LKG con read-only e retry.
# - sqlite3 -readonly evita di creare i file -shm/-wal accidentali (il
#   default è RW e SQLite, vedendo journal_mode=WAL ereditato dal source,
#   crea -shm/-wal anche se non scriviamo nulla).
# - retry-once dopo 3s gestisce la race con `cp -f` di update_lkg() che
#   gira al minuto :00 (backup orario): se beccato a metà copia, il primo
#   check vede un file troncato → "Error: file is not a database" o simili.
#   Tre secondi dopo, il cp è quasi sicuramente terminato.
# Output: stampa "ok" se passa, altrimenti la prima riga di errore.
check_lkg_integrity() {
    local file="$1"
    local result
    result=$(sqlite3 -readonly "$file" "PRAGMA integrity_check;" 2>&1 | head -1)
    if [ "$result" = "ok" ]; then
        echo "ok"
        return 0
    fi
    # Retry: aspetto 3s, poi riprovo. Se ancora fallisce, è corruption vera.
    sleep 3
    result=$(sqlite3 -readonly "$file" "PRAGMA integrity_check;" 2>&1 | head -1)
    echo "$result"
}

for db in "${DBS[@]}"; do
    f="$LKG_DIR/$db"
    if [ ! -f "$f" ]; then
        LKG_MISSING=$((LKG_MISSING + 1))
        ISSUES+=("lkg_missing:$db")
        continue
    fi
    SZ=$(stat -c%s "$f" 2>/dev/null || echo 0)
    if [ "$SZ" -lt "$MIN_SIZE_BYTES" ]; then
        LKG_STUB=$((LKG_STUB + 1))
        ISSUES+=("lkg_stub:$db")
        continue
    fi
    INTEG=$(check_lkg_integrity "$f")
    if [ "$INTEG" != "ok" ]; then
        LKG_CORRUPT=$((LKG_CORRUPT + 1))
        ISSUES+=("lkg_corrupt:$db")
        continue
    fi
    LKG_AGE_H=$(( (NOW - $(stat -c%Y "$f")) / 3600 ))
    # Se l'LKG ha più di 7 giorni, segnalo: significa che da 1 settimana
    # tutti i backup falliscono e l'LKG non viene aggiornato.
    if [ "$LKG_AGE_H" -gt 168 ]; then
        LKG_OLD=$((LKG_OLD + 1))
        ISSUES+=("lkg_stale:$db:${LKG_AGE_H}h")
    fi
    LKG_OK=$((LKG_OK + 1))
done
echo "  OK: $LKG_OK / ${#DBS[@]}"
[ "$LKG_MISSING" -gt 0 ] && echo "  ❌ Mancanti: $LKG_MISSING"
[ "$LKG_STUB" -gt 0 ] && echo "  ❌ Stub: $LKG_STUB"
[ "$LKG_CORRUPT" -gt 0 ] && echo "  ❌ Corrotti: $LKG_CORRUPT"
[ "$LKG_OLD" -gt 0 ] && echo "  ⚠️  Vecchi >7gg: $LKG_OLD"

# ── 5. status JSON dell'ultima esecuzione ───────────────────────────────────
echo ""
echo "--- Check 5: stato ultima esecuzione backup_db.sh ---"
if [ -f "$STATUS_FILE" ]; then
    LAST_FAILED=$(grep -o '"failed_count": [0-9]*' "$STATUS_FILE" | grep -o '[0-9]*' | head -1)
    if [ -n "$LAST_FAILED" ] && [ "$LAST_FAILED" -gt 0 ]; then
        ISSUES+=("last_run_failed:$LAST_FAILED")
        echo "❌ Ultima esecuzione: $LAST_FAILED fallimenti"
    else
        echo "✅ Ultima esecuzione: nessun fallimento"
    fi
else
    echo "⚠️  Nessuno status file (backup_db.sh v2 non ancora deployato?)"
fi

# ── Riepilogo + notifica se issues ──────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
if [ ${#ISSUES[@]} -eq 0 ]; then
    echo "✅ Sistema di backup SANO"
    echo "{\"status\":\"healthy\",\"timestamp\":\"$(date -Iseconds)\",\"epoch\":$NOW,\"issues\":[]}" > "$HEALTH_STATUS_FILE"
else
    echo "❌ ISSUES RILEVATE: ${#ISSUES[@]}"
    for i in "${ISSUES[@]}"; do echo "  - $i"; done
    ISSUES_JSON=$(printf '"%s",' "${ISSUES[@]}" | sed 's/,$//')
    echo "{\"status\":\"unhealthy\",\"timestamp\":\"$(date -Iseconds)\",\"epoch\":$NOW,\"issues\":[${ISSUES_JSON}]}" > "$HEALTH_STATUS_FILE"
    notify "alta" "🩺 Backup health check FALLITO (${#ISSUES[@]} issues)" "$(printf '%s\n' "${ISSUES[@]}" | head -10 | tr '\n' ',')"
fi

# Exit code per cron monitor
[ ${#ISSUES[@]} -eq 0 ] && exit 0 || exit 1
