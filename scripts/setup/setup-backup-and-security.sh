#!/bin/bash
# setup-backup-and-security.sh
# Da eseguire UNA VOLTA sul server come root (o con sudo)
# Configura:
#   1. Cron orario + giornaliero tramite scripts/backup_db.sh
#   2. Fail2ban whitelist per evitare auto-blocco
#   3. Permessi eseguibili sullo script di backup
#
# Nota: il vecchio backup.sh (root del repo) è stato rimosso in v2.2.
# Il sistema di backup ufficiale è ora scripts/backup_db.sh, che salva
# in $TRGB_DIR/app/data/backups/{hourly,daily}/ e sincronizza su Drive.

set -euo pipefail

TRGB_DIR="/home/marco/trgb/trgb"
BACKUP_SCRIPT="$TRGB_DIR/scripts/backup_db.sh"
LOG_DIR="/home/marco/trgb/backups"   # ospita solo backup.log

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
echo "  ✅ $BACKUP_SCRIPT reso eseguibile"

# ── 3. Configura cron per marco ──
echo ""
echo "⏰ Configurazione cron backup (orario + giornaliero)..."
CRON_HOURLY="0 * * * * $BACKUP_SCRIPT --hourly >> $LOG_DIR/backup.log 2>&1"
CRON_DAILY="30 3 * * * $BACKUP_SCRIPT --daily >> $LOG_DIR/backup.log 2>&1"

CURRENT_CRON="$(crontab -u marco -l 2>/dev/null || true)"

ADD_HOURLY=true
ADD_DAILY=true
if echo "$CURRENT_CRON" | grep -qF "backup_db.sh --hourly"; then
  ADD_HOURLY=false
  echo "  ⏭️ Cron hourly già presente"
fi
if echo "$CURRENT_CRON" | grep -qF "backup_db.sh --daily"; then
  ADD_DAILY=false
  echo "  ⏭️ Cron daily già presente"
fi

if $ADD_HOURLY || $ADD_DAILY; then
  NEW_CRON="$CURRENT_CRON"
  $ADD_HOURLY && NEW_CRON="$NEW_CRON"$'\n'"$CRON_HOURLY"
  $ADD_DAILY  && NEW_CRON="$NEW_CRON"$'\n'"$CRON_DAILY"
  echo "$NEW_CRON" | crontab -u marco -
  $ADD_HOURLY && echo "  ✅ Cron hourly aggiunto (ogni ora al minuto 0)"
  $ADD_DAILY  && echo "  ✅ Cron daily  aggiunto (03:30)"
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
