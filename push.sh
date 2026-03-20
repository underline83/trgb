#!/bin/bash
# push.sh — Commit, push e deploy sul VPS in un colpo solo
#
# Uso:
#   ./push.sh "messaggio commit"      → deploy (via post-receive hook)
#   ./push.sh "messaggio commit" -f   → deploy + pip install + npm install
#   ./push.sh "messaggio commit" -d   → deploy + sync codice su Google Drive
#
# Remote:
#   origin → VPS bare repo (deploy)
#   github → GitHub (backup)

set -euo pipefail

VPS_HOST="trgb"
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

# ── Push al VPS (deploy) ────────────────────────────────
echo ""
echo "📤 Push al VPS (origin)..."
git push origin main

# ── Push a GitHub (backup) ──────────────────────────────
if git remote | grep -q github; then
  echo "📤 Push a GitHub (backup)..."
  git push github main 2>/dev/null || echo "⚠️  Push GitHub fallito (non bloccante)"
fi

# ── Deploy extra (solo se -f per pip/npm) ──────────────
# Il deploy base (git checkout + restart) è gestito dal post-receive hook.
# Qui facciamo solo pip/npm se richiesto con -f.
if [[ "$MODE" == "-f" ]]; then
  echo ""
  echo "🚀 Deploy FULL (pip + npm)..."
  ssh "$VPS_HOST" "
    set -e
    cd $VPS_DIR
    $VENV/bin/pip install -r requirements.txt -q
    cd $VPS_DIR/frontend && npm install --silent
    sudo /bin/systemctl restart trgb-backend
    sudo /bin/systemctl restart trgb-frontend
    echo '✅ Deploy FULL completato (pip + npm + restart)'
  "
fi

# ── Sync su Google Drive (opzionale con -d) ────────────
if [[ "$MODE" == "-d" ]] || [[ "${3:-}" == "-d" ]]; then
  echo ""
  echo "☁️ Sync codice su Google Drive..."
  ssh "$VPS_HOST" "
    rclone sync $VPS_DIR gdrive:TRGB-Backup/app-code/ \
      --exclude '.git/**' \
      --exclude 'node_modules/**' \
      --exclude 'venv/**' \
      --exclude '__pycache__/**' \
      --exclude '*.pyc' \
      --config /home/marco/.config/rclone/rclone.conf \
      2>&1
  " && echo "  ✅ Codice sincronizzato su Drive" \
    || echo "  ⚠️ Sync Drive fallito (non bloccante)"
fi
