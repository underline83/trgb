#!/bin/bash
# backup_db.sh — Backup atomico di tutti i database TRGB
#
# Uso:
#   ./backup_db.sh              → backup orario (rotazione 48h)
#   ./backup_db.sh --daily      → backup giornaliero + sync Drive (rotazione 7gg)
#
# Cron suggerito:
#   0 * * * *   /home/marco/trgb/trgb/scripts/backup_db.sh >> /home/marco/trgb/backup.log 2>&1
#   30 3 * * *  /home/marco/trgb/trgb/scripts/backup_db.sh --daily >> /home/marco/trgb/backup.log 2>&1

set -euo pipefail

# ── Config ──
DATA_DIR="/home/marco/trgb/trgb/app/data"
BACKUP_HOURLY="$DATA_DIR/backups/hourly"
BACKUP_DAILY="$DATA_DIR/backups/daily"
RCLONE_CONF="/home/marco/.config/rclone/rclone.conf"
DRIVE_PATH="gdrive:TRGB-Backup/db-daily"

RETAIN_HOURS=48
RETAIN_DAYS=7

# Database da backuppare
DBS=(
    "foodcost.db"
    "admin_finance.sqlite3"
    "vini.sqlite3"
    "vini_magazzino.sqlite3"
    "vini_settings.sqlite3"
    "dipendenti.sqlite3"
)

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MODE="${1:-hourly}"

echo "[$TIMESTAMP] Backup $MODE avviato"

# ── Crea cartelle ──
mkdir -p "$BACKUP_HOURLY" "$BACKUP_DAILY"

# ── Funzione: backup atomico con .backup di sqlite3 ──
do_backup() {
    local src="$1"
    local dest="$2"
    local db_name=$(basename "$src")

    if [ ! -f "$src" ]; then
        echo "  ⚠️  $db_name non trovato, skip"
        return
    fi

    # .backup di sqlite3 è atomico e gestisce WAL correttamente
    sqlite3 "$src" ".backup '$dest'"

    if [ $? -eq 0 ]; then
        local size=$(du -h "$dest" | cut -f1)
        echo "  ✅ $db_name → $(basename $dest) ($size)"
    else
        echo "  ❌ $db_name backup fallito!"
    fi
}

# ── Backup orario ──
if [ "$MODE" != "--daily" ]; then
    echo "📦 Backup orario..."
    for db in "${DBS[@]}"; do
        src="$DATA_DIR/$db"
        name="${db%.*}"
        ext="${db##*.}"
        dest="$BACKUP_HOURLY/${name}_${TIMESTAMP}.${ext}"
        do_backup "$src" "$dest"
    done

    # Rotazione: elimina backup più vecchi di RETAIN_HOURS ore
    echo "🔄 Rotazione (elimino backup > ${RETAIN_HOURS}h)..."
    find "$BACKUP_HOURLY" -type f \( -name "*.db" -o -name "*.sqlite3" \) -mmin +$((RETAIN_HOURS * 60)) -delete -print | while read f; do
        echo "  🗑️  Rimosso: $(basename $f)"
    done

    count=$(find "$BACKUP_HOURLY" -type f \( -name "*.db" -o -name "*.sqlite3" \) | wc -l)
    echo "📊 Backup orari presenti: $count file"
fi

# ── Backup giornaliero + Drive ──
if [ "$MODE" == "--daily" ]; then
    echo "📦 Backup giornaliero..."
    DAY_DIR="$BACKUP_DAILY/$TIMESTAMP"
    mkdir -p "$DAY_DIR"

    for db in "${DBS[@]}"; do
        do_backup "$DATA_DIR/$db" "$DAY_DIR/$db"
    done

    # Rotazione locale: elimina cartelle più vecchie di RETAIN_DAYS giorni
    echo "🔄 Rotazione giornaliera (elimino > ${RETAIN_DAYS}gg)..."
    find "$BACKUP_DAILY" -mindepth 1 -maxdepth 1 -type d -mtime +$RETAIN_DAYS -exec rm -rf {} \; -print | while read d; do
        echo "  🗑️  Rimosso: $(basename $d)"
    done

    # Sync su Google Drive
    echo "☁️  Sync su Google Drive..."
    if [ -f "$RCLONE_CONF" ]; then
        rclone sync "$BACKUP_DAILY" "$DRIVE_PATH" \
            --config "$RCLONE_CONF" \
            2>&1

        if [ $? -eq 0 ]; then
            echo "  ✅ Drive sync completato"
        else
            echo "  ⚠️  Drive sync fallito (non bloccante)"
        fi
    else
        echo "  ⚠️  rclone.conf non trovato, skip Drive sync"
    fi

    count=$(find "$BACKUP_DAILY" -mindepth 1 -maxdepth 1 -type d | wc -l)
    echo "📊 Backup giornalieri presenti: $count"
fi

echo "[$TIMESTAMP] Backup $MODE completato"
echo ""
