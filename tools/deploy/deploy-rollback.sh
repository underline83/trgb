#!/bin/bash
set -euo pipefail

PROJECT_ROOT="/home/marco/trgb/trgb"
BACKUP_ROOT="/home/marco/trgb/backups"
DATA_DIR="$PROJECT_ROOT/app/data"

LATEST_BACKUP=$(ls -t "$BACKUP_ROOT"/trgb-backup-*.tar.gz 2>/dev/null | head -n 1 || true)

if [[ -z "$LATEST_BACKUP" ]]; then
  echo "❌ Nessun backup trovato in $BACKUP_ROOT"
  exit 1
fi

echo "───────────────────────────────────────────────"
echo "♻️  Rollback TRGB Gestionale"
echo "📦 Ultimo backup: $LATEST_BACKUP"
echo "───────────────────────────────────────────────"

read -p "Confermi il ripristino di questo backup? (yes/no): " CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
  echo "Annullato. Nessun file modificato."
  exit 0
fi

cd "$PROJECT_ROOT"

echo "🛑 Stop servizi backend/frontend..."
sudo systemctl stop trgb-backend || true
sudo systemctl stop trgb-frontend || true

echo "🧹 Pulizia app/data corrente..."
rm -rf "$DATA_DIR"

echo "📦 Estrazione backup..."
tar -xzf "$LATEST_BACKUP" -C "$PROJECT_ROOT"

echo "🔁 Riavvio servizi..."
sudo systemctl start trgb-backend
sudo systemctl start trgb-frontend

echo "✅ Rollback completato da $LATEST_BACKUP"
