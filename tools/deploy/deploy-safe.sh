#!/bin/bash
set -euo pipefail

PROJECT_ROOT="/home/marco/trgb/trgb"
VENV_DIR="/home/marco/trgb/venv-trgb"
BACKUP_ROOT="/home/marco/trgb/backups"
DATA_DIR="$PROJECT_ROOT/app/data"

TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
BACKUP_FILE="$BACKUP_ROOT/trgb-backup-$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_ROOT"

echo "───────────────────────────────────────────────"
echo "🛡 Deploy SAFE TRGB Gestionale — $TIMESTAMP"
echo "───────────────────────────────────────────────"

cd "$PROJECT_ROOT"

echo "💾 Backup dei DB (app/data) in $BACKUP_FILE..."
tar -czf "$BACKUP_FILE" -C "$PROJECT_ROOT" app/data

echo "📦 Aggiorno repository Git..."
git pull

echo "🐍 Aggiorno dipendenze Python (se necessario)..."
"$VENV_DIR/bin/pip" install -r requirements.txt

echo "🧩 Aggiorno dipendenze frontend (se necessario)..."
cd "$PROJECT_ROOT/frontend"
npm install

cd "$PROJECT_ROOT"

echo "🔁 Riavvio servizi systemd (backend + frontend)..."
sudo systemctl restart trgb-backend
sudo systemctl restart trgb-frontend

echo "✅ Deploy SAFE completato. Backup creato: $BACKUP_FILE"
