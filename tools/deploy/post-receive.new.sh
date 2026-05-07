#!/bin/bash
# post-receive hook — deploy automatico TRGB
#
# v2.0 (2026-05-05) — FIX issue 0.1.1: il working dir resta a HEAD vecchio
# perché `git --git-dir=BARE --work-tree=WD checkout -f main` aggiorna i FILE
# ma NON `.git/HEAD` del working dir (che è un repo standalone con .git/
# proprio). Conseguenza: `git rev-parse HEAD` (letto da main.py per
# /system/info commit) torna stantio anche dopo deploy riusciti.
#
# Soluzione: cd nel working dir + fetch + reset --hard + clean. Il working dir
# ha già `origin = /home/marco/trgb/trgb.git` (path locale), quindi fetch
# funziona senza rete. In più scrivo DEPLOYED_COMMIT.txt come fallback safe.
#
# Per applicare il fix:
#   ssh trgb
#   cp /home/marco/trgb/trgb.git/hooks/post-receive /home/marco/trgb/trgb.git/hooks/post-receive.bak
#   cp /home/marco/trgb/trgb/tools/deploy/post-receive.new.sh /home/marco/trgb/trgb.git/hooks/post-receive
#   chmod +x /home/marco/trgb/trgb.git/hooks/post-receive
# Poi un test push qualsiasi conferma il fix.

set -euo pipefail

TRGB_BASE="/home/marco/trgb"
BARE_REPO="$TRGB_BASE/trgb.git"
WORKING_DIR="$TRGB_BASE/trgb"
DEPLOY_ENV="$TRGB_BASE/.deploy_env"
LOG_FILE="$TRGB_BASE/deploy.log"

source "$DEPLOY_ENV"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo ""
echo "[$TIMESTAMP] 🚀 Push ricevuto — avvio deploy..."

# ── Aggiorna il working tree dal bare repo (post-fix 0.1.1) ─────────────────
# CRITICO: unset GIT_DIR / GIT_WORK_TREE perché il post-receive eredita queste
# env var dal contesto del bare repo. Senza unset, `git fetch` proverebbe a
# fetchare DENTRO il bare invece che nel working dir.
echo "▶ Aggiornamento codice (fetch + reset --hard)..."
cd "$WORKING_DIR"
unset GIT_DIR
unset GIT_WORK_TREE
git fetch origin main
git reset --hard origin/main
git clean -fd

CURR=$(git rev-parse HEAD)
PREV=$(git rev-parse HEAD~1 2>/dev/null || echo "")

# ── Scrivi DEPLOYED_COMMIT.txt come autorevole per main.py ──────────────────
# main.py legge questo file PRIMA di provare git rev-parse. Garantisce che
# /system/info `commit` resti coerente anche se in futuro qualcosa rompesse
# git rev-parse (es. detached HEAD, .git corrotto, ecc.).
echo "$CURR" > "$WORKING_DIR/DEPLOYED_COMMIT.txt"

NEEDS_PIP=false
NEEDS_NPM=false

if [[ -n "$PREV" ]]; then
  git diff --name-only "$PREV" "$CURR" | grep -q "^requirements.txt$" && NEEDS_PIP=true || true
  git diff --name-only "$PREV" "$CURR" | grep -q "^frontend/package.json$" && NEEDS_NPM=true || true
else
  NEEDS_PIP=true
  NEEDS_NPM=true
fi

# ── pip install (solo se requirements.txt cambiato) ─────────────────────────
if [[ "$NEEDS_PIP" == "true" ]]; then
  echo "▶ pip install (requirements.txt aggiornato)..."
  "$VENV_DIR/bin/pip" install -r "$WORKING_DIR/requirements.txt" -q
else
  echo "▶ pip install — nessuna modifica, salto."
fi

# ── npm install (solo se package.json cambiato) ─────────────────────────────
if [[ "$NEEDS_NPM" == "true" ]]; then
  echo "▶ npm install (package.json aggiornato)..."
  cd "$WORKING_DIR/frontend"
  npm install --silent
  cd "$WORKING_DIR"
else
  echo "▶ npm install — nessuna modifica, salto."
fi

# ── Restart servizi ─────────────────────────────────────────────────────────
echo "▶ Restart servizi..."
sudo /bin/systemctl restart trgb-backend && sudo /bin/systemctl restart trgb-frontend

echo "✅ Deploy completato. Commit: ${CURR:0:8}"
echo ""

# Log
{
  echo "[$TIMESTAMP] deploy OK — commit $CURR"
} >> "$LOG_FILE"
