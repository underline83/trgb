#!/bin/bash
set -euo pipefail

PROJECT_ROOT="/home/marco/trgb/trgb"

echo "───────────────────────────────────────────────"
echo "⚡ Deploy QUICK TRGB Gestionale — $(date '+%Y-%m-%d %H:%M:%S')"
echo "───────────────────────────────────────────────"

cd "$PROJECT_ROOT"

echo "📦 Aggiorno repository Git (senza pip/npm)..."
git pull

echo "🔁 Riavvio servizi systemd (backend + frontend)..."
sudo systemctl restart trgb-backend
sudo systemctl restart trgb-frontend

echo "✅ Deploy QUICK completato. Stato servizi:"
systemctl --no-pager --full status trgb-backend trgb-frontend || true
