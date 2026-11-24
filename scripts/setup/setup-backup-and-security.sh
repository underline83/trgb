#!/bin/bash
# setup-backup-and-security.sh
# Da eseguire UNA VOLTA sul server come root (o con sudo)
# Configura:
#   1. Cron orario + 2 giornalieri (03:00, 18:00) + watchdog, come in
#      docs/sicurezza_backup.md (allineato il 2026-11-24: prima installava
#      il cron vecchio con --hourly, daily solo 03:30 e nessun watchdog)
#   2. Fail2ban whitelist per evitare auto-blocco
#   3. Permessi eseguibili sullo script di backup
#
# Nota: il vecchio backup.sh (root del repo) è stato rimosso in v2.2.
# Il sistema di backup ufficiale è ora scripts/backup_db.sh, che salva
# in $TRGB_DIR/app/data/backups/{hourly,daily}/ e sincronizza su Drive.

set -euo pipefail

TRGB_DIR="/home/marco/trgb/trgb"
BACKUP_SCRIPT="$TRGB_DIR/scripts/backup_db.sh"
HEALTH_SCRIPT="$TRGB_DIR/scripts/check_backup_health.sh"
LOG_DIR="/home/marco/trgb"           # backup.log e backup_health.log

echo "═══════════════════════════════════════════"
echo "🔧 Setup backup e sicurezza"
echo "═══════════════════════════════════════════"

# ── 1. Assicura directory log ──
echo ""
echo "📁 Preparazione directory log..."
mkdir -p "$LOG_DIR"
chown marco:marco "$LOG_DIR"
echo "  ✅ $LOG_DIR pronta (per backup.log)"

# ── 2. Bit eseguibile sullo script backup ──
if [ ! -f "$BACKUP_SCRIPT" ]; then
  echo "  ❌ $BACKUP_SCRIPT non esiste. Fai prima un push.sh."
  exit 1
fi
chmod +x "$BACKUP_SCRIPT"
[ -f "$HEALTH_SCRIPT" ] && chmod +x "$HEALTH_SCRIPT"
echo "  ✅ script di backup e watchdog resi eseguibili"

# ── 3. Configura cron per marco ──
echo ""
echo "⏰ Configurazione cron backup (orario + giornaliero)..."
CRON_LINES=(
  "0 * * * * $BACKUP_SCRIPT >> $LOG_DIR/backup.log 2>&1"
  "0 3 * * * $BACKUP_SCRIPT --daily >> $LOG_DIR/backup.log 2>&1"
  "0 18 * * * $BACKUP_SCRIPT --daily >> $LOG_DIR/backup.log 2>&1"
  "15,45 * * * * $HEALTH_SCRIPT >> $LOG_DIR/backup_health.log 2>&1"
)

CURRENT_CRON="$(crontab -u marco -l 2>/dev/null || true)"
NEW_CRON="$CURRENT_CRON"
ADDED=0
for line in "${CRON_LINES[@]}"; do
  if echo "$CURRENT_CRON" | grep -qF "$line"; then
    echo "  ⏭️ già presente: $line"
  else
    NEW_CRON="$NEW_CRON"$'\n'"$line"
    ADDED=$((ADDED + 1))
    echo "  ✅ aggiunto: $line"
  fi
done
if [ "$ADDED" -gt 0 ]; then
  echo "$NEW_CRON" | crontab -u marco -
fi

# ── 4. Configura fail2ban whitelist ──
echo ""
echo "🛡️ Configurazione fail2ban..."

if command -v fail2ban-client &>/dev/null; then
  F2B_LOCAL="/etc/fail2ban/jail.local"

  if [ ! -f "$F2B_LOCAL" ] || ! grep -q "ignoreip" "$F2B_LOCAL" 2>/dev/null; then
    cat >> "$F2B_LOCAL" <<'FAIL2BAN'

# ── Personalizzazioni TRGB ──
[sshd]
enabled = true
port = ssh
filter = sshd
maxretry = 5
bantime = 600
findtime = 600
# Whitelist: localhost + reti private italiane comuni
ignoreip = 127.0.0.1/8 ::1 10.0.0.0/8 192.168.0.0/16 172.16.0.0/12
FAIL2BAN
    systemctl restart fail2ban
    echo "  ✅ Fail2ban: whitelist reti private aggiunta"
    echo "  ℹ️  Bantime ridotto a 10 minuti (era default)"
  else
    echo "  ⏭️ Fail2ban già configurato"
  fi

  # Mostra IP attualmente bannati
  echo ""
  echo "  📋 IP attualmente bannati in sshd:"
  fail2ban-client status sshd 2>/dev/null | grep "Banned IP" || echo "  (nessuno)"
else
  echo "  ⚠️ fail2ban non installato"
fi

# ── 5. Test backup ──
echo ""
echo "🧪 Esecuzione backup --daily di test..."
su - marco -c "$BACKUP_SCRIPT --daily"

echo ""
echo "═══════════════════════════════════════════"
echo "✅ Setup completato!"
echo ""
echo "Riepilogo:"
echo "  📦 Backup hourly: ogni ora → $TRGB_DIR/app/data/backups/hourly/"
echo "  📦 Backup daily:  03:30     → $TRGB_DIR/app/data/backups/daily/"
echo "  📋 Log: $LOG_DIR/backup.log"
echo "  🛡️ Fail2ban: whitelist reti private, ban 10min"
echo ""
echo "Per un backup manuale:"
echo "  $BACKUP_SCRIPT --daily"
echo "═══════════════════════════════════════════"
