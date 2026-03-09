#!/bin/bash
# push.sh — Commit, push e deploy sul VPS in un colpo solo
#
# Uso:
#   ./push.sh "messaggio commit"      → deploy rapido (git pull + restart)
#   ./push.sh "messaggio commit" -f   → deploy completo (pip + npm + restart)

set -euo pipefail

VPS_HOST="marco@trgb.tregobbi.it"
VPS_DIR="/home/marco/trgb/trgb"
VENV="/home/marco/trgb/venv-trgb"

# ── Argomenti ────────────────────────────────────────────
MSG="${1:-}"
MODE="${2:-}"

# ── Commit se ci sono modifiche ──────────────────────────
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git status --porcelain)" ]; then
  if [[ -z "$MSG" ]]; then
    echo "📝 Modifiche rilevate. Messaggio del commit:"
    read -r MSG
  fi

  if [[ -z "$MSG" ]]; then
    echo "❌ Messaggio vuoto. Annullato."
    exit 1
  fi

  git add -A
  git commit -m "$MSG"
else
  echo "ℹ️  Nessuna modifica da committare."
fi

# ── Push ─────────────────────────────────────────────────
echo ""
echo "📤 Git push..."
git push

# ── Deploy sul server via SSH diretta ────────────────────
echo ""

if [[ "$MODE" == "-f" ]]; then
  echo "🚀 Deploy FULL (git pull + pip + npm + restart)..."
  ssh "$VPS_HOST" "
    set -e
    cd $VPS_DIR
    git pull
    $VENV/bin/pip install -r requirements.txt -q
    cd $VPS_DIR/frontend && npm install --silent
    cd $VPS_DIR
    sudo systemctl restart trgb-backend
    sudo systemctl restart trgb-frontend
    echo '✅ Deploy FULL completato'
  "
else
  echo "🚀 Deploy QUICK (git pull + restart)..."
  ssh "$VPS_HOST" "
    set -e
    cd $VPS_DIR
    git pull
    sudo systemctl restart trgb-backend
    sudo systemctl restart trgb-frontend
    echo '✅ Deploy QUICK completato'
  "
fi
