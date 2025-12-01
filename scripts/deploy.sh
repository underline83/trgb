#!/bin/bash
set -euo pipefail

### -----------------------------------------------------------
### 1. Carico configurazione macchina (solo VPS)
### -----------------------------------------------------------

DEPLOY_ENV="/home/marco/trgb/.deploy_env"

if [[ ! -f "$DEPLOY_ENV" ]]; then
  echo "❌ ERRORE: File $DEPLOY_ENV non trovato."
  echo "Crea questo file sulla VPS con i percorsi corretti."
  exit 1
fi

source "$DEPLOY_ENV"


### -----------------------------------------------------------
### 2. Funzioni comuni
### -----------------------------------------------------------

function log_msg() {
  echo -e "$1"
}

function restart_services() {
  log_msg "🔁 Riavvio servizi systemd..."
  sudo systemctl restart trgb-backend
  sudo systemctl restart trgb-frontend
}

function health_check() {
  local label="$1"

  BACK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://trgb.tregobbi.it || echo "000")
  APP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://app.tregobbi.it || echo "000")

  log_msg "🌐 Backend  → HTTP ${BACK_STATUS}"
  log_msg "🌐 Frontend → HTTP ${APP_STATUS}"

  {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $label";
    echo "  backend:  $BACK_STATUS";
    echo "  frontend: $APP_STATUS";
    echo "----------------------------------------";
  } >> "$LOG_FILE"
}


### -----------------------------------------------------------
### 3. Modalità deploy
### -----------------------------------------------------------

function deploy_full() {
  log_msg "🚀 Deploy COMPLETO (FULL)"
  log_msg "───────────────────────────────────────────────"

  cd "$PROJECT_ROOT"

  log_msg "📦 git pull..."
  git pull

  log_msg "🐍 pip install..."
  "$VENV_DIR/bin/pip" install -r requirements.txt

  log_msg "🧩 npm install..."
  cd "$PROJECT_ROOT/frontend"
  npm install

  cd "$PROJECT_ROOT"
  restart_services

  log_msg "✅ COMPLETATO ✔"
  health_check "DEPLOY FULL"
}

function deploy_quick() {
  log_msg "⚡ Deploy QUICK (git pull + restart)"
  log_msg "───────────────────────────────────────────────"

  cd "$PROJECT_ROOT"
  git pull
  restart_services

  log_msg "✅ COMPLETATO ✔"
  health_check "DEPLOY QUICK"
}

function deploy_safe() {
  log_msg "🛡 Deploy SAFE (backup + full)"
  log_msg "───────────────────────────────────────────────"

  TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
  BACKUP_FILE="$BACKUP_ROOT/trgb-backup-$TIMESTAMP.tar.gz"

  cd "$PROJECT_ROOT"

  log_msg "💾 Backup DB → $BACKUP_FILE"
  tar -czf "$BACKUP_FILE" -C "$PROJECT_ROOT" app/data

  deploy_full

  log_msg "📂 Backup salvato: $BACKUP_FILE"
}

function rollback() {
  log_msg "♻️ Rollback all’ultimo backup"
  log_msg "───────────────────────────────────────────────"

  LATEST_BACKUP=$(ls -t "$BACKUP_ROOT"/trgb-backup-*.tar.gz 2>/dev/null | head -n 1 || true)

  if [[ -z "$LATEST_BACKUP" ]]; then
    log_msg "❌ Nessun backup trovato."
    exit 1
  fi

  log_msg "📦 Ultimo backup: $LATEST_BACKUP"

  read -p "Confermi il ripristino? (yes/no): " CONFIRM
  [[ "$CONFIRM" != "yes" ]] && { log_msg "Annullato."; exit 0; }

  sudo systemctl stop trgb-backend || true
  sudo systemctl stop trgb-frontend || true

  rm -rf "$DATA_DIR"

  tar -xzf "$LATEST_BACKUP" -C "/home/marco/trgb/trgb"

  sudo systemctl start trgb-backend
  sudo systemctl start trgb-frontend

  log_msg "✅ ROLLBACK COMPLETATO ✔"
  health_check "ROLLBACK da $LATEST_BACKUP"
}


### -----------------------------------------------------------
### 4. Controller argomenti
### -----------------------------------------------------------

case "${1:-}" in
  -a)
    deploy_full      # COMPLETO
    ;;
  -b)
    deploy_quick     # QUICK
    ;;
  -c)
    deploy_safe      # SAFE
    ;;
  -d)
    rollback         # ROLLBACK
    ;;
  *)
    echo "Uso:"
    echo "  ./deploy.sh -a   → deploy completo (FULL)"
    echo "  ./deploy.sh -b   → deploy rapido (QUICK)"
    echo "  ./deploy.sh -c   → deploy SAFE con backup"
    echo "  ./deploy.sh -d   → rollback dall’ultimo backup"
    exit 1
    ;;
esac