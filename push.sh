#!/bin/bash
# push.sh — Commit, push e deploy sul VPS in un colpo solo
#
# Uso:
#   ./push.sh "messaggio commit"      → deploy (via post-receive hook)
#   ./push.sh "messaggio commit" -f   → deploy + pip install + npm install
#   ./push.sh "messaggio commit" -m   → deploy + sync modules.json locale → VPS
#   ./push.sh "messaggio commit" -d   → deploy + sync codice su Google Drive
#   ./push.sh "messaggio commit" -q   → output compatto (default: verbose)
#
# Remote:
#   origin → VPS bare repo (deploy)
#   github → GitHub (backup)

set -euo pipefail

VPS_HOST="trgb"
VPS_DIR="/home/marco/trgb/trgb"
VENV="/home/marco/trgb/venv-trgb"
DB_LOCAL="app/data"
DB_REMOTE="$VPS_DIR/app/data"

# ── Colori e simboli ───────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
step() { echo -e "\n${CYAN}${BOLD}▸ $1${NC}"; }

# ── Argomenti ──────────────────────────────────────────────
MSG="${1:-}"
SYNC_FULL=false
SYNC_MODULES=false
SYNC_DRIVE=false
VERBOSE=true
shift || true
for arg in "$@"; do
  case "$arg" in
    -f) SYNC_FULL=true ;;
    -m) SYNC_MODULES=true ;;
    -d) SYNC_DRIVE=true ;;
    -v) VERBOSE=true ;;
    -q) VERBOSE=false ;;
  esac
done

# ── Sync DB dal VPS ────────────────────────────────────────
step "Sync database dal VPS"

DBS="vini_magazzino.sqlite3 vini.sqlite3 vini_settings.sqlite3 foodcost.db admin_finance.sqlite3 clienti.sqlite3 dipendenti.sqlite3"
DB_OK=0
DB_FAIL=0

for db in $DBS; do
  [ -f "$DB_LOCAL/$db" ] && cp "$DB_LOCAL/$db" "$DB_LOCAL/${db}.prev" 2>/dev/null || true
  if ssh -q "$VPS_HOST" "sqlite3 '$DB_REMOTE/$db' \".backup '/tmp/trgb_$db'\"" 2>/dev/null \
    && scp -q "$VPS_HOST:/tmp/trgb_$db" "$DB_LOCAL/$db" 2>/dev/null \
    && ssh -q "$VPS_HOST" "rm -f '/tmp/trgb_$db'" 2>/dev/null; then
    DB_OK=$((DB_OK + 1))
    $VERBOSE && ok "$db"
  else
    DB_FAIL=$((DB_FAIL + 1))
    $VERBOSE && warn "$db non trovato"
  fi
done

if [ "$DB_FAIL" -eq 0 ]; then
  ok "${DB_OK} database scaricati ${DIM}(copie .prev salvate)${NC}"
else
  warn "${DB_OK} ok, ${DB_FAIL} non trovati (non bloccante)"
fi

# ── Bit +x script critici (idempotente) ────────────────────
# Alcuni script devono restare eseguibili sul VPS (li lancia cron o systemd).
# Git a volte "dimentica" il mode bit quando il file viene riscritto: registriamo
# il bit DENTRO l'index così ogni checkout lato VPS ripristina 100755 da solo.
# Noop se il bit è già corretto. Se cambia, finisce nel commit di questo push.
step "Verifica bit +x script critici"
EXEC_SCRIPTS=(
  "scripts/backup_db.sh"
  "push.sh"
)
FIXED=0
for s in "${EXEC_SCRIPTS[@]}"; do
  if [ ! -f "$s" ]; then
    continue
  fi
  MODE=$(git ls-files --stage -- "$s" 2>/dev/null | awk '{print $1}')
  if [ -z "$MODE" ]; then
    continue  # file non tracciato, skip
  fi
  if [ "$MODE" != "100755" ]; then
    git update-index --chmod=+x -- "$s"
    chmod +x "$s" 2>/dev/null || true
    warn "$s mode era $MODE → forzato 100755 (sarà nel commit)"
    FIXED=$((FIXED + 1))
  fi
done
if [ "$FIXED" -eq 0 ]; then
  ok "tutti gli script eseguibili hanno già 100755"
fi

# ── Commit ─────────────────────────────────────────────────
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git status --porcelain)" ]; then
  if [[ -z "$MSG" ]]; then
    echo ""
    echo -e "${BOLD}📝 Messaggio del commit:${NC}"
    read -r MSG
  fi

  if [[ -z "$MSG" ]]; then
    fail "Messaggio vuoto. Annullato."
    exit 1
  fi

  step "Commit"
  git add -A
  COMMIT_OUT=$(git commit -m "$MSG" 2>&1)
  # Estrai solo hash abbreviato e stats
  HASH=$(echo "$COMMIT_OUT" | head -1 | sed -n 's/.*\([a-f0-9]\{7\}\).*/\1/p' | head -1)
  STATS=$(echo "$COMMIT_OUT" | tail -1)
  ok "${HASH:-commit} — ${STATS}"
else
  step "Commit"
  echo -e "  ${DIM}Nessuna modifica da committare${NC}"
fi

# ── Rimuovi files runtime dal tracking se necessario ───────
if git ls-files --error-unmatch app/data/users.json &>/dev/null; then
  git rm --cached app/data/users.json app/data/modules.json 2>/dev/null || true
  git commit -m "chore: rimuove users.json e modules.json dal tracking" 2>/dev/null
  ok "Rimossi users.json e modules.json dal tracking"
fi

# ── Backup files runtime VPS ───────────────────────────────
ssh -q "$VPS_HOST" "
  cd $VPS_DIR/app/data
  for f in users.json modules.json closures_config.json; do
    [ -f \"\$f\" ] && cp \"\$f\" \"/tmp/trgb_\${f}.runtime\" 2>/dev/null || true
  done
" 2>/dev/null || true

# ── Push VPS ───────────────────────────────────────────────
step "Push → VPS"
PUSH_OUT=$(git push origin main 2>&1)
# Cattura il messaggio del deploy dal post-receive hook
if echo "$PUSH_OUT" | grep -q "Deploy completato"; then
  ok "Deploy completato"
elif echo "$PUSH_OUT" | grep -q "Everything up-to-date"; then
  echo -e "  ${DIM}Già aggiornato${NC}"
else
  ok "Push riuscito"
fi
# Mostra righe ▶ del deploy; con -v mostra tutto l'output remoto
if $VERBOSE; then
  echo "$PUSH_OUT" | grep "^remote:" | sed 's/^remote: //' | while read -r line; do
    echo -e "  ${DIM}${line}${NC}"
  done
else
  echo "$PUSH_OUT" | grep "remote:.*▶" | sed 's/.*remote: //' | while read -r line; do
    echo -e "  ${DIM}${line}${NC}"
  done
fi

# ── Push GitHub ────────────────────────────────────────────
if git remote | grep -q github; then
  step "Push → GitHub"
  if git push github main 2>/dev/null; then
    ok "Backup aggiornato"
  else
    warn "Push GitHub fallito (non bloccante)"
  fi
fi

sleep 3

# ── Sync modules.json (solo con -m) ───────────────────────
if $SYNC_MODULES; then
  step "Sync modules.json → VPS"
  if scp -q "$DB_LOCAL/modules.json" "$VPS_HOST:$DB_REMOTE/modules.json"; then
    ok "modules.json copiato"
  else
    warn "Copia fallita"
  fi
fi

# ── Ripristino files runtime ──────────────────────────────
RUNTIME_RESTORED=0
if $SYNC_MODULES; then
  RESTORE_OUT=$(ssh -q "$VPS_HOST" "
    cd $VPS_DIR/app/data
    for f in users.json closures_config.json; do
      if [ -f \"/tmp/trgb_\${f}.runtime\" ]; then
        cp \"/tmp/trgb_\${f}.runtime\" \"\$f\"
        rm -f \"/tmp/trgb_\${f}.runtime\"
        echo \"OK \$f\"
      fi
    done
    rm -f /tmp/trgb_modules.json.runtime
  " 2>/dev/null) || true
else
  RESTORE_OUT=$(ssh -q "$VPS_HOST" "
    cd $VPS_DIR/app/data
    for f in users.json modules.json closures_config.json; do
      if [ -f \"/tmp/trgb_\${f}.runtime\" ]; then
        cp \"/tmp/trgb_\${f}.runtime\" \"\$f\"
        rm -f \"/tmp/trgb_\${f}.runtime\"
        echo \"OK \$f\"
      fi
    done
  " 2>/dev/null) || true
fi
RUNTIME_RESTORED=$(echo "$RESTORE_OUT" | grep -c "^OK" 2>/dev/null || echo 0)
if [ "$RUNTIME_RESTORED" -gt 0 ]; then
  ok "${RUNTIME_RESTORED} file runtime ripristinati"
fi

# ── Restart backend se -m ─────────────────────────────────
if $SYNC_MODULES; then
  step "Restart backend"
  if ssh -q "$VPS_HOST" "sudo /bin/systemctl restart trgb-backend"; then
    ok "trgb-backend riavviato"
  else
    warn "Restart fallito"
  fi
fi

# ── Deploy FULL (solo se -f) ──────────────────────────────
if $SYNC_FULL; then
  step "Deploy FULL (pip + npm)"
  FULL_OUT=$(ssh "$VPS_HOST" "
    set -e
    cd $VPS_DIR
    $VENV/bin/pip install -r requirements.txt -q 2>&1 | tail -1
    cd $VPS_DIR/frontend && npm install --silent 2>&1 | tail -1
    sudo /bin/systemctl restart trgb-backend
    sudo /bin/systemctl restart trgb-frontend
    echo 'OK'
  " 2>&1)
  if echo "$FULL_OUT" | grep -q "OK"; then
    ok "pip + npm + restart completato"
  else
    warn "Deploy full con errori"
  fi
fi

# ── Sync Google Drive (solo se -d) ────────────────────────
if $SYNC_DRIVE; then
  step "Sync → Google Drive"
  if ssh "$VPS_HOST" "
    rclone sync $VPS_DIR gdrive:TRGB-Backup/app-code/ \
      --exclude '.git/**' \
      --exclude 'node_modules/**' \
      --exclude 'venv/**' \
      --exclude '__pycache__/**' \
      --exclude '*.pyc' \
      --config /home/marco/.config/rclone/rclone.conf \
      2>&1
  "; then
    ok "Codice sincronizzato su Drive"
  else
    warn "Sync Drive fallito (non bloccante)"
  fi
fi

# ── Riepilogo finale ──────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}━━━ Done ━━━${NC}"
