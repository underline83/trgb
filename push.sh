#!/bin/bash
# push.sh — Commit, push e deploy sul VPS in un colpo solo
#
# Uso:
#   ./push.sh "messaggio commit"               → deploy locale tregobbi (default)
#   ./push.sh -l <locale> "messaggio commit"   → deploy locale specifico (R4, sessione 60)
#   ./push.sh "messaggio commit" -f            → deploy + pip install + npm install
#   ./push.sh "messaggio commit" -m            → deploy + sync modules.json locale → VPS (forzato)
#                                                NB: l'auto-detect attiva -m da solo se il
#                                                modules.json locale differisce da quello sul VPS.
#   ./push.sh "messaggio commit" -d            → deploy + sync codice su Google Drive
#   ./push.sh "messaggio commit" -q            → output compatto (default: verbose)
#
# Locali supportati:
#   tregobbi (default)  → osteria di Marco, su trgb.tregobbi.it
#   trgb                → istanza prodotto pulita, futuro deploy su trgb.it
#   <altri>             → richiede locali/<id>/deploy/env.production
#
# Remote:
#   origin → VPS bare repo (deploy)
#   github → GitHub (backup)

set -euo pipefail

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

# ── R4 (sessione 60): Pre-parsing flag -l <locale> ─────────
# Default tregobbi per backward compat. Estrae -l/--locale da $@ prima
# del parsing dei flag boolean (-f, -m, -d, -q) e del messaggio.
LOCALE="${TRGB_LOCALE:-tregobbi}"
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    -l|--locale)
      if [ -z "${2:-}" ]; then
        fail "-l richiede un argomento (es. -l tregobbi)"
        exit 1
      fi
      LOCALE="$2"
      shift 2
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done
set -- "${ARGS[@]+"${ARGS[@]}"}"

# ── R4: Source del file env.production del locale ──────────
ENV_FILE="locali/$LOCALE/deploy/env.production"
if [ ! -f "$ENV_FILE" ]; then
  fail "File env non trovato: $ENV_FILE"
  echo "  Locale '$LOCALE' non configurato."
  echo "  Per crearlo: cp -r locali/_template locali/$LOCALE && editare deploy/env.production"
  exit 1
fi
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

# ── Variabili derivate (post-source env) ───────────────────
DB_LOCAL="app/data"
DB_REMOTE="$VPS_DIR/app/data"

# ── Argomenti rimanenti (messaggio + flag boolean) ─────────
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

# ── R4: banner locale corrente ─────────────────────────────
echo -e "${CYAN}${BOLD}🏠 Deploy locale:${NC} ${BOLD}$LOCALE${NC}  ${DIM}($DOMAIN → $VPS_HOST:$VPS_DIR)${NC}"

# ── Modulo Guardiano L1 — Pre-push checks ──────────────────
# Aggiunto 2026-04-25 (sessione 57 cont.) per ridurre il rischio di:
#  - SIGTERM al backend mentre utenti scrivono (causa corruzioni SQLite S51-S53)
#  - Doppio push ravvicinato (= restart durante init_*_database())
# I check sono SOFT: non bloccano mai con exit 1, solo chiedono conferma.

step "Guardiano: pre-push checks"

LAST_PUSH_FILE="${LAST_PUSH_FILE:-.last_push}"
PUSH_DEBOUNCE_SECONDS="${PUSH_DEBOUNCE_SECONDS:-30}"

# Debounce: blocca se ultimo push <30s fa (prevent doppio push accidentale)
if [ -f "$LAST_PUSH_FILE" ]; then
  LAST_PUSH_TS=$(cat "$LAST_PUSH_FILE" 2>/dev/null || echo "0")
  NOW_TS=$(date +%s)
  ELAPSED=$((NOW_TS - LAST_PUSH_TS))
  if [ "$ELAPSED" -lt "$PUSH_DEBOUNCE_SECONDS" ]; then
    warn "ultimo push ${ELAPSED}s fa (<${PUSH_DEBOUNCE_SECONDS}s)"
    echo -e "  ${YELLOW}Doppio push ravvicinato = rischio SIGTERM mid-write durante init DB.${NC}"
    echo -en "  ${BOLD}Continuare lo stesso? [y/N]${NC} "
    read -r CONFIRM
    case "$CONFIRM" in
      y|Y|s|S) ok "OK, procedo" ;;
      *) fail "Annullato dall'utente."; exit 0 ;;
    esac
  fi
fi

# Probe HTTP soft: qualunque risposta 1xx/2xx/3xx/4xx = backend VIVO (anche 401/403/404/405).
# Solo 5xx o ERR (timeout/curl mancante) = sospetto. FastAPI risponde 405 a HEAD "/" perche'
# non c'e' handler HEAD sulla root, ma il servizio e' attivo: NON e' un caso di down.
PROBE_URL="${PROBE_URL:-https://trgb.tregobbi.it/}"
PROBE_OUT=$(curl -sI -o /dev/null -w "%{http_code}" --max-time 4 "$PROBE_URL" 2>/dev/null || echo "ERR")
# Considera vivo se prima cifra e' 1, 2, 3 o 4 (5xx = errore server, ERR = irraggiungibile)
if [[ "$PROBE_OUT" =~ ^[1234][0-9][0-9]$ ]]; then
  $VERBOSE && ok "Servizio UP ($PROBE_URL → HTTP $PROBE_OUT)"
  # Tenta lettura accessi ultimi 60s da nginx access log su VPS (best effort, non bloccante)
  RECENT_HITS=$(ssh -q -o ConnectTimeout=4 "$VPS_HOST" \
    "sudo awk -v cutoff=\$(date -u +%s -d '60 seconds ago' 2>/dev/null) '
      { gsub(/\[|\]/, \"\", \$4); split(\$4, dt, \":\"); if (dt[1]) ts=mktime(gensub(/-|\\//, \" \", \"g\", dt[1])\" \"dt[2]\" \"dt[3]\" \"dt[4]); if (ts >= cutoff) c++ } END { print c+0 }
      ' /var/log/nginx/access.log 2>/dev/null" 2>/dev/null || echo "")
  if [ -n "$RECENT_HITS" ] && [ "$RECENT_HITS" -gt 0 ] 2>/dev/null; then
    warn "rilevati ${RECENT_HITS} accessi nginx negli ultimi 60s — qualcuno sta usando il gestionale ORA"
    echo -en "  ${BOLD}Pushare comunque? [y/N]${NC} "
    read -r CONFIRM
    case "$CONFIRM" in
      y|Y|s|S) ok "OK, procedo" ;;
      *) fail "Annullato dall'utente."; exit 0 ;;
    esac
  else
    $VERBOSE && ok "Nessun accesso recente (clear to push)"
  fi
elif [ "$PROBE_OUT" = "ERR" ]; then
  $VERBOSE && warn "Probe HTTP non eseguibile (timeout o curl mancante) — skip"
else
  # 5xx = backend in errore (probabile down)
  $VERBOSE && warn "Probe HTTP ha tornato $PROBE_OUT (errore server) — backend potrebbe essere down"
fi

# ── Sync DB dal VPS ────────────────────────────────────────
step "Sync database dal VPS"

DBS="vini_magazzino.sqlite3 vini.sqlite3 vini_settings.sqlite3 foodcost.db admin_finance.sqlite3 clienti.sqlite3 dipendenti.sqlite3 notifiche.sqlite3"
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

# ── Auto-detect cambio modules.json ────────────────────────
# Se modules.json locale differisce da quello sul VPS, attiva -m da solo.
# Evita la classe di bug "ho aggiunto un modulo nuovo ma non appare in produzione
# perché ho dimenticato il flag -m".
if ! $SYNC_MODULES; then
  if [ -f "$DB_LOCAL/modules.json" ]; then
    LOCAL_HASH=$(sha256sum "$DB_LOCAL/modules.json" 2>/dev/null | awk '{print $1}')
    REMOTE_HASH=$(ssh -q "$VPS_HOST" "sha256sum '$DB_REMOTE/modules.json' 2>/dev/null" | awk '{print $1}')
    if [ -n "$LOCAL_HASH" ] && [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
      SYNC_MODULES=true
      step "Auto-sync modules.json"
      warn "modules.json locale differisce dal VPS → attivo -m automaticamente"
    fi
  fi
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

# ── Modulo Guardiano L1 — Stamp .last_push per debounce ───
date +%s > "$LAST_PUSH_FILE" 2>/dev/null || true

# ── Riepilogo finale ──────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}━━━ Done ━━━${NC}"
