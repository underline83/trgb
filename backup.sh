#!/bin/bash
# backup.sh — Backup giornaliero di tutti i database SQLite
# Eseguito da cron ogni notte alle 3:00
# Mantiene gli ultimi 30 giorni di backup
#
# Installazione cron (eseguire una volta):
#   crontab -e
#   0 3 * * * /home/marco/trgb/trgb/backup.sh >> /home/marco/trgb/backups/backup.log 2>&1

set -euo pipefail

# ── Configurazione ──
APP_DIR="/home/marco/trgb/trgb/app/data"
BACKUP_BASE="/home/marco/trgb/backups"
RETENTION_DAYS=30
DATE=$(date +%Y-%m-%d_%H%M)
BACKUP_DIR="$BACKUP_BASE/$DATE"

# ── Crea directory backup ──
mkdir -p "$BACKUP_DIR"

echo "═══════════════════════════════════════════"
echo "🔒 Backup database — $(date)"
echo "═══════════════════════════════════════════"

# ── Backup di ogni database con sqlite3 .backup (safe, no lock issues) ──
DATABASES=(
  "admin_finance.sqlite3"
  "vini.sqlite3"
  "vini_settings.sqlite3"
  "vini_magazzino.sqlite3"
  "ingredients.sqlite3"
  "vini.db"
  "foodcost.db"
)

ERRORS=0
for DB in "${DATABASES[@]}"; do
  SRC="$APP_DIR/$DB"
  if [ -f "$SRC" ]; then
    DST="$BACKUP_DIR/$DB"
    # Usa sqlite3 .backup per una copia consistente (non cp!)
    if sqlite3 "$SRC" ".backup '$DST'" 2>/dev/null; then
      SIZE=$(du -h "$DST" | cut -f1)
      echo "  ✅ $DB → $SIZE"
    else
      # Fallback: copia diretta se sqlite3 non disponibile
      cp "$SRC" "$DST"
      echo "  ⚠️ $DB → copiato (fallback cp)"
    fi
  else
    echo "  ⏭️ $DB — non trovato, skip"
  fi
done

# ── Comprimi il backup del giorno ──
cd "$BACKUP_BASE"
tar -czf "${DATE}.tar.gz" "$DATE" && rm -rf "$DATE"
ARCHIVE_SIZE=$(du -h "${DATE}.tar.gz" | cut -f1)
echo ""
echo "📦 Archivio: ${DATE}.tar.gz ($ARCHIVE_SIZE)"

# ── Rimuovi backup più vecchi di $RETENTION_DAYS giorni ──
DELETED=$(find "$BACKUP_BASE" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "🗑️ Rimossi $DELETED backup vecchi (>$RETENTION_DAYS giorni)"
fi

echo ""
echo "✅ Backup completato — $(date)"
echo ""
