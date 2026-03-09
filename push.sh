#!/bin/bash
# push.sh — Commit, push e deploy sul VPS in un colpo solo
# Uso: ./push.sh        → deploy rapido (git pull + restart)
#      ./push.sh -f     → deploy completo (pip install + npm install + restart)

set -euo pipefail

VPS_HOST="marco@trgb.tregobbi.it"
VPS_DIR="/home/marco/trgb/trgb"

MODE="${1:-}"

if [[ "$MODE" == "-f" ]]; then
  DEPLOY_FLAG="-a"
  LABEL="FULL (pip + npm + restart)"
else
  DEPLOY_FLAG="-b"
  LABEL="QUICK (git pull + restart)"
fi

# ── Controlla se ci sono modifiche da committare ──────────
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git status --porcelain)" ]; then
  echo "📝 Modifiche rilevate. Messaggio del commit:"
  read -r MSG

  if [[ -z "$MSG" ]]; then
    echo "❌ Messaggio vuoto. Annullato."
    exit 1
  fi

  git add -A
  git commit -m "$MSG"
else
  echo "ℹ️  Nessuna modifica da committare."
fi

# ── Push ──────────────────────────────────────────────────
echo ""
echo "📤 Git push..."
git push

# ── Deploy sul server ────────────────────────────────────
echo ""
echo "🚀 Deploy $LABEL sul server..."
ssh "$VPS_HOST" "cd $VPS_DIR && ./scripts/deploy.sh $DEPLOY_FLAG"
