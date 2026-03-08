#!/bin/bash
# ============================================================
# setup_git_server.sh
# Configura il VPS come server git con deploy automatico.
# Eseguire UNA SOLA VOLTA sul VPS.
#
# Cosa fa:
#   1. Crea il bare repo in /home/marco/trgb/trgb.git
#   2. Crea il post-receive hook (deploy automatico al push)
#   3. Stampa i comandi da eseguire su Mac e Windows
#
# Uso:
#   chmod +x scripts/setup_git_server.sh
#   ./scripts/setup_git_server.sh
# ============================================================

set -euo pipefail

TRGB_BASE="/home/marco/trgb"
BARE_REPO="$TRGB_BASE/trgb.git"
WORKING_DIR="$TRGB_BASE/trgb"
DEPLOY_ENV="$TRGB_BASE/.deploy_env"
HOOK_FILE="$BARE_REPO/hooks/post-receive"

echo ""
echo "🔧 TRGB — Setup Git Server"
echo "────────────────────────────────────────────"

# ── 1. Verifica pre-requisiti ─────────────────────────────
echo ""
echo "▶ Verifica pre-requisiti..."

if [[ ! -d "$WORKING_DIR/.git" ]]; then
  echo "❌ ERRORE: $WORKING_DIR non è un repo git."
  exit 1
fi

if [[ ! -f "$DEPLOY_ENV" ]]; then
  echo "❌ ERRORE: $DEPLOY_ENV non trovato."
  exit 1
fi

source "$DEPLOY_ENV"

if [[ ! -d "$VENV_DIR" ]]; then
  echo "❌ ERRORE: venv non trovato in $VENV_DIR"
  exit 1
fi

echo "   ✔ Working dir: $WORKING_DIR"
echo "   ✔ Deploy env:  $DEPLOY_ENV"
echo "   ✔ Venv:        $VENV_DIR"

# ── 2. Crea bare repo ─────────────────────────────────────
echo ""
echo "▶ Creazione bare repo..."

if [[ -d "$BARE_REPO" ]]; then
  echo "   ℹ️  $BARE_REPO esiste già — salto la creazione."
else
  git clone --bare "$WORKING_DIR" "$BARE_REPO"
  echo "   ✔ Bare repo creato in $BARE_REPO"
fi

# ── 3. Crea post-receive hook ─────────────────────────────
echo ""
echo "▶ Creazione post-receive hook..."

cat > "$HOOK_FILE" << 'HOOK'
#!/bin/bash
# post-receive hook — deploy automatico TRGB

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

# Aggiorna il working tree dal bare repo
echo "▶ Aggiornamento codice..."
git --git-dir="$BARE_REPO" --work-tree="$WORKING_DIR" checkout -f main
git --git-dir="$BARE_REPO" --work-tree="$WORKING_DIR" clean -fd

# Controlla se requirements.txt è cambiato nell'ultimo commit
PREV=$(git --git-dir="$BARE_REPO" rev-parse HEAD~1 2>/dev/null || echo "")
CURR=$(git --git-dir="$BARE_REPO" rev-parse HEAD)

NEEDS_PIP=false
NEEDS_NPM=false

if [[ -n "$PREV" ]]; then
  git --git-dir="$BARE_REPO" diff --name-only "$PREV" "$CURR" | grep -q "requirements.txt" && NEEDS_PIP=true || true
  git --git-dir="$BARE_REPO" diff --name-only "$PREV" "$CURR" | grep -q "frontend/package.json" && NEEDS_NPM=true || true
else
  NEEDS_PIP=true
  NEEDS_NPM=true
fi

# pip install (solo se requirements.txt cambiato)
if [[ "$NEEDS_PIP" == "true" ]]; then
  echo "▶ pip install (requirements.txt aggiornato)..."
  "$VENV_DIR/bin/pip" install -r "$WORKING_DIR/requirements.txt" -q
else
  echo "▶ pip install — nessuna modifica, salto."
fi

# npm install (solo se package.json cambiato)
if [[ "$NEEDS_NPM" == "true" ]]; then
  echo "▶ npm install (package.json aggiornato)..."
  cd "$WORKING_DIR/frontend"
  npm install --silent
  cd "$WORKING_DIR"
else
  echo "▶ npm install — nessuna modifica, salto."
fi

# Restart servizi
echo "▶ Restart servizi..."
sudo systemctl restart trgb-backend trgb-frontend

echo "✅ Deploy completato."
echo ""

# Log
{
  echo "[$TIMESTAMP] deploy OK — commit $CURR"
} >> "$LOG_FILE"
HOOK

chmod +x "$HOOK_FILE"
echo "   ✔ Hook creato: $HOOK_FILE"

# ── 4. Configura sudo per systemctl senza password ────────
echo ""
echo "▶ Verifica sudoers per systemctl..."

SUDOERS_LINE="marco ALL=(ALL) NOPASSWD: /bin/systemctl restart trgb-backend, /bin/systemctl restart trgb-frontend"
if sudo grep -q "trgb-backend" /etc/sudoers 2>/dev/null; then
  echo "   ℹ️  Sudoers già configurato."
else
  echo "   ⚠️  Aggiungi questa riga a /etc/sudoers (con visudo):"
  echo ""
  echo "   $SUDOERS_LINE"
  echo ""
  echo "   Comando: sudo visudo"
fi

# ── 5. Istruzioni finali ──────────────────────────────────
echo ""
echo "────────────────────────────────────────────"
echo "✅ Setup completato!"
echo ""
echo "📌 Ora aggiorna il remote su MAC:"
echo ""
echo "   cd ~/trgb"
echo "   git remote set-url origin marco@80.211.131.156:/home/marco/trgb/trgb.git"
echo "   git push origin main"
echo ""
echo "📌 Aggiorna il remote su WINDOWS:"
echo ""
echo "   git remote set-url origin marco@80.211.131.156:/home/marco/trgb/trgb.git"
echo "   git pull origin main"
echo ""
echo "📌 Da ora in poi, ogni git push dal Mac:"
echo "   → aggiorna il codice sul VPS"
echo "   → pip/npm install se necessario"
echo "   → riavvia i servizi automaticamente"
echo ""
echo "   Niente più deploy.sh manuale! 🎉"
echo "────────────────────────────────────────────"
