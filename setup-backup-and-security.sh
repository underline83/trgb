#!/bin/bash
# setup-backup-and-security.sh
# Da eseguire UNA VOLTA sul server come root (o con sudo)
# Configura:
#   1. Cron per backup giornaliero alle 3:00
#   2. Fail2ban whitelist per evitare auto-blocco
#   3. Directory backup

set -euo pipefail

TRGB_DIR="/home/marco/trgb/trgb"
BACKUP_DIR="/home/marco/trgb/backups"

echo "═══════════════════════════════════════════"
echo "🔧 Setup backup e sicurezza"
echo "═══════════════════════════════════════════"

# ── 1. Crea directory backup ──
echo ""
echo "📁 Creazione directory backup..."
mkdir -p "$BACKUP_DIR"
chown marco:marco "$BACKUP_DIR"
echo "  ✅ $BACKUP_DIR creata"

# ── 2. Rendi eseguibile lo script backup ──
chmod +x "$TRGB_DIR/backup.sh"
echo "  ✅ backup.sh reso eseguibile"

# ── 3. Configura cron per marco ──
echo ""
echo "⏰ Configurazione cron backup giornaliero..."
CRON_LINE="0 3 * * * $TRGB_DIR/backup.sh >> $BACKUP_DIR/backup.log 2>&1"

# Aggiungi solo se non esiste già
if crontab -u marco -l 2>/dev/null | grep -qF "backup.sh"; then
  echo "  ⏭️ Cron già configurato, skip"
else
  (crontab -u marco -l 2>/dev/null || true; echo "$CRON_LINE") | crontab -u marco -
  echo "  ✅ Cron aggiunto: backup ogni notte alle 3:00"
fi

# ── 4. Configura fail2ban whitelist ──
echo ""
echo "🛡️ Configurazione fail2ban..."

if command -v fail2ban-client &>/dev/null; then
  # Crea override locale per sshd
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
echo "🧪 Esecuzione backup di test..."
su - marco -c "$TRGB_DIR/backup.sh"

echo ""
echo "═══════════════════════════════════════════"
echo "✅ Setup completato!"
echo ""
echo "Riepilogo:"
echo "  📦 Backup: ogni notte alle 3:00 → $BACKUP_DIR"
echo "  📋 Log: $BACKUP_DIR/backup.log"
echo "  🗑️ Retention: 30 giorni"
echo "  🛡️ Fail2ban: whitelist reti private, ban 10min"
echo ""
echo "Per un backup manuale:"
echo "  $TRGB_DIR/backup.sh"
echo "═══════════════════════════════════════════"
