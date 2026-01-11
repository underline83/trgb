#!/bin/bash
set -euo pipefail

PROJECT_ROOT="/home/marco/trgb/trgb"
VENV_DIR="/home/marco/trgb/venv-trgb"
BACKUP_ROOT="/home/marco/trgb/backups"
DATA_DIR="$PROJECT_ROOT/app/data"
LOG_FILE="/home/marco/trgb/deploy.log"

mkdir -p "$BACKUP_ROOT"

function log() {
  echo -e "$1"
}

function health_check() {
  local label="$1"

  BACK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://trgb.tregobbi.it || echo "000")
  APP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://app.tregobbi.it || echo "000")

  log "🌐 Check backend  (trgb.tregobbi.it)  → HTTP ${BACK_STATUS}"
  log "🌐 Check frontend (app.tregobbi.it) → HTTP ${APP_STATUS}"

  {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $label";
    echo "  backend:  $BACK_STATUS";
    echo "  frontend: $APP_STATUS";
    echo "----------------------------------------";
  } >> "$LOG_FILE"
}

function restart_services() {
  log "🔁 Riavvio servizi systemd (backend + frontend)..."
  sudo systemctl restart trgb-backend
  sudo systemctl restart trgb-frontend
}

function deploy_full() {
  log "🚀 Deploy COMPLETO (FULL)"
  log "───────────────────────────────────────────────"

  cd "$PROJECT_ROOT"

  log "📦 git pull..."
  git pull

  log "🐍 pip install -r requirements.txt..."
  "$VENV_DIR/bin/pip" install -r requirements.txt

  log "🧩 npm install (frontend)..."
  cd "$PROJECT_ROOT/frontend"
  npm install

  cd "$PROJECT_ROOT"
  restart_services

  log "✅ Deploy FULL completato."
  health_check "DEPLOY FULL"
}

function deploy_quick() {
  log "⚡ Deploy QUICK (solo git pull + restart)"
  log "───────────────────────────────────────────────"

  cd "$PROJECT_ROOT"

  log "📦 git pull..."
  git pull

  cd "$PROJECT_ROOT"
  restart_services

  log "✅ Deploy QUICK completato."
  health_check "DEPLOY QUICK"
}

function deploy_safe() {
  log "🛡 Deploy SAFE (backup + full deploy)"
  log "───────────────────────────────────────────────"

  TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
  BACKUP_FILE="$BACKUP_ROOT/trgb-backup-$TIMESTAMP.tar.gz"

  cd "$PROJECT_ROOT"

  log "💾 Backup DB (app/data) → $BACKUP_FILE"
  tar -czf "$BACKUP_FILE" -C "$PROJECT_ROOT" app/data

  deploy_full

  log "📂 Backup creato: $BACKUP_FILE"
}

function rollback() {
  log "♻️ Rollback all'ultimo backup disponibile"
  log "───────────────────────────────────────────────"

  LATEST_BACKUP=$(ls -t "$BACKUP_ROOT"/trgb-backup-*.tar.gz 2>/dev/null | head -n 1 || true)

  if [[ -z "$LATEST_BACKUP" ]]; then
    log "❌ Nessun backup trovato in $BACKUP_ROOT"
    exit 1
  fi

  log "📦 Ultimo backup: $LATEST_BACKUP"

  read -p "Confermi il ripristino di questo backup? (yes/no): " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    log "Annullato. Nessun file modificato."
    exit 0
  fi

  cd "$PROJECT_ROOT"

  log "🛑 Stop servizi backend/frontend..."
  sudo systemctl stop trgb-backend || true
  sudo systemctl stop trgb-frontend || true

  log "🧹 Pulizia cartella dati: $DATA_DIR"
  rm -rf "$DATA_DIR"

  log "📦 Estrazione backup..."
  tar -xzf "$LATEST_BACKUP" -C "$PROJECT_ROOT"

  log "🔁 Riavvio servizi..."
  sudo systemctl start trgb-backend
  sudo systemctl start trgb-frontend

  log "✅ Rollback completato."
  health_check "ROLLBACK da $LATEST_BACKUP"
}

case "${1:-}" in
  -a)
    deploy_full      # COMPLETO
    ;;
  -b)
    deploy_quick     # QUICK
    ;;
  -c)
    deploy_safe      # SAFE (backup + FULL)
    ;;
  -d)
    rollback         # ROLLBACK ultimo backup
    ;;
  *)
    echo "Uso:"
    echo "  ./deploy.sh -a   → deploy completo (FULL: git + pip + npm + restart)"
    echo "  ./deploy.sh -b   → deploy rapido (QUICK: git + restart)"
    echo "  ./deploy.sh -c   → deploy SAFE (backup DB + FULL)"
    echo "  ./deploy.sh -d   → ROLLBACK dall'ultimo backup"
    exit 1
    ;;
esac
