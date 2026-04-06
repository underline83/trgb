#!/bin/bash
# push.sh — Commit, push e deploy sul VPS in un colpo solo
#
# Uso:
#   ./push.sh "messaggio commit"      → deploy (via post-receive hook)
#   ./push.sh "messaggio commit" -f   → deploy + pip install + npm install
#   ./push.sh "messaggio commit" -m   → deploy + sync modules.json locale → VPS
#   ./push.sh "messaggio commit" -d   → deploy + sync codice su Google Drive
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

# ── Argomenti (supporta flags combinati: -f -m -d in qualsiasi ordine) ──
MSG="${1:-}"
SYNC_FULL=false
SYNC_MODULES=false
SYNC_DRIVE=false
shift || true
for arg in "$@"; do
  case "$arg" in
    -f) SYNC_FULL=true ;;
    -m) SYNC_MODULES=true ;;
    -d) SYNC_DRIVE=true ;;
  esac
done

# ── Sync DB dal VPS (backup atomico con .backup) ────────
echo "📦 Scarico database dal VPS (backup atomico)..."

# Prima: ruota la copia precedente (tiene 1 storico)
for db in vini_magazzino.sqlite3 vini.sqlite3 vini_settings.sqlite3 foodcost.db admin_finance.sqlite3 clienti.sqlite3; do
  if [ -f "$DB_LOCAL/$db" ]; then
    cp "$DB_LOCAL/$db" "$DB_LOCAL/${db}.prev" 2>/dev/null || true
  fi
done

# Poi: scarica con .backup atomico (gestisce WAL correttamente)
for db in vini_magazzino.sqlite3 vini.sqlite3 vini_settings.sqlite3 foodcost.db admin_finance.sqlite3 clienti.sqlite3; do
  ssh -q "$VPS_HOST" "sqlite3 '$DB_REMOTE/$db' \".backup '/tmp/trgb_$db'\"" 2>/dev/null \
    && scp -q "$VPS_HOST:/tmp/trgb_$db" "$DB_LOCAL/$db" 2>/dev/null \
    && ssh -q "$VPS_HOST" "rm -f '/tmp/trgb_$db'" 2>/dev/null \
    && echo "  ✅ $db" \
    || echo "  ⚠️  $db non trovato (non bloccante)"
done
echo "  ℹ️  Copie precedenti salvate come *.prev"
echo ""

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

# ── Rimuovi users.json dal tracking se ancora tracciato ──
if git ls-files --error-unmatch app/data/users.json &>/dev/null; then
  echo "🔒 Rimuovo users.json dal tracking git (dati runtime)..."
  git rm --cached app/data/users.json app/data/modules.json 2>/dev/null || true
  git commit -m "chore: rimuove users.json e modules.json dal tracking (dati runtime)"
fi

# ── Proteggi files runtime sul VPS (PRIMA del push) ─────
echo "🔒 Backup files runtime..."
ssh -q "$VPS_HOST" "
  cd $VPS_DIR/app/data
  for f in users.json modules.json closures_config.json; do
    [ -f \"\$f\" ] && cp \"\$f\" \"/tmp/trgb_\${f}.runtime\" 2>/dev/null || true
  done
" 2>/dev/null || true

# ── Push al VPS (deploy) ────────────────────────────────
echo ""
echo "📤 Push al VPS (origin)..."
git push origin main

# ── Push a GitHub (backup) ──────────────────────────────
if git remote | grep -q github; then
  echo "📤 Push a GitHub (backup)..."
  git push github main 2>/dev/null || echo "⚠️  Push GitHub fallito (non bloccante)"
fi

# Attendi che il post-receive hook completi il checkout
sleep 3

# ── Sync modules.json locale → VPS (solo con -m) ───────
if $SYNC_MODULES; then
  echo ""
  echo "📋 Sync modules.json locale → VPS..."
  scp -q "$DB_LOCAL/modules.json" "$VPS_HOST:$DB_REMOTE/modules.json" \
    && echo "  ✅ modules.json copiato sul VPS" \
    || echo "  ⚠️  Copia modules.json fallita"
fi

# Ripristina i files runtime dopo il checkout
# Se -m è attivo, modules.json NON viene ripristinato (usa la versione locale)
echo "🔒 Ripristino files runtime..."
if $SYNC_MODULES; then
  # Con -m: ripristina solo users.json e closures_config.json, modules.json resta quello nuovo dal push
  ssh -q "$VPS_HOST" "
    cd $VPS_DIR/app/data
    for f in users.json closures_config.json; do
      if [ -f \"/tmp/trgb_\${f}.runtime\" ]; then
        cp \"/tmp/trgb_\${f}.runtime\" \"\$f\"
        rm -f \"/tmp/trgb_\${f}.runtime\"
        echo \"  ✅ \$f ripristinato\"
      else
        echo \"  ⚠️  \$f — nessun backup trovato\"
      fi
    done
    rm -f /tmp/trgb_modules.json.runtime
    echo \"  📋 modules.json aggiornato dal repo (flag -m)\"
  " 2>/dev/null || true
else
  ssh -q "$VPS_HOST" "
    cd $VPS_DIR/app/data
    for f in users.json modules.json closures_config.json; do
      if [ -f \"/tmp/trgb_\${f}.runtime\" ]; then
        cp \"/tmp/trgb_\${f}.runtime\" \"\$f\"
        rm -f \"/tmp/trgb_\${f}.runtime\"
        echo \"  ✅ \$f ripristinato\"
      else
        echo \"  ⚠️  \$f — nessun backup trovato\"
      fi
    done
  " 2>/dev/null || true
fi

# ── Restart backend se modules.json aggiornato ─────────
if $SYNC_MODULES; then
  echo ""
  echo "🔄 Restart backend (modules.json aggiornato)..."
  ssh -q "$VPS_HOST" "sudo /bin/systemctl restart trgb-backend" \
    && echo "  ✅ trgb-backend riavviato" \
    || echo "  ⚠️  Restart fallito"
fi

# ── Deploy extra (solo se -f per pip/npm) ──────────────
# Il deploy base (git checkout + restart) è gestito dal post-receive hook.
# Qui facciamo solo pip/npm se richiesto con -f.
if $SYNC_FULL; then
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
if $SYNC_DRIVE; then
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
