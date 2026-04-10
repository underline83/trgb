# TRGB — Guida Rapida Comandi

## Connessione al server
```bash
ssh trgb
```

## Deploy (commit + push + deploy)
```bash
./push.sh "descrizione modifica"       # deploy rapido
./push.sh "descrizione modifica" -f    # deploy completo (pip + npm)
```

## Backup manuale database
```bash
ssh trgb "/home/marco/trgb/trgb/scripts/backup_db.sh --daily"
```
Il backup giornaliero viene anche sincronizzato automaticamente su Google Drive (cartella `TRGB-Backup/db-daily`).

Se il cron sembra fermo, controllare prima il bit eseguibile:
```bash
ssh trgb "ls -la /home/marco/trgb/trgb/scripts/backup_db.sh && chmod +x /home/marco/trgb/trgb/scripts/backup_db.sh"
```

## Download backup dall'app
Admin → Impostazioni → tab **Backup** → "Scarica backup completo"

## Vedere log servizi
```bash
ssh trgb "journalctl -u trgb-backend -f"     # backend
ssh trgb "journalctl -u trgb-frontend -f"    # frontend
```

## Riavvio servizi
```bash
ssh trgb "sudo systemctl restart trgb-backend && sudo systemctl restart trgb-frontend"
```

## Se SSH non funziona (IP bannato)
1. Connettiti all'hotspot del telefono
2. `ssh trgb`
3. `sudo fail2ban-client set sshd unbanip IL_TUO_IP_CASA`

## Se non ricordi la password
1. Pannello Aruba → cloud.aruba.it → VPS → Gestisci → ACCEDI CONSOLE
2. Nella console SPICE → Send Ctrl-Alt-Delete
3. Durante il boot tieni premuto Shift → GRUB → Advanced → Recovery mode → root shell
4. `mount -o remount,rw /` poi `passwd marco`

---

## Setup nuovo PC (una tantum)

### 1. Chiave SSH
```bash
# Se non hai una chiave:
ssh-keygen -t ed25519

# Copia la chiave sul server:
ssh-copy-id -i ~/.ssh/id_ed25519 marco@trgb.tregobbi.it
```

### 2. Config SSH
Aggiungi a `~/.ssh/config`:
```
Host trgb
  HostName trgb.tregobbi.it
  User marco
  IdentityFile ~/.ssh/id_ed25519
```

### 3. Clone del repo
```bash
git clone marco@trgb.tregobbi.it:/home/marco/trgb/trgb.git trgb
cd trgb
git remote add github git@github.com:underline83/trgb.git
```

### 4. Verifica
```bash
ssh trgb              # deve entrare senza password
git remote -v         # origin=VPS, github=GitHub
./push.sh             # deve fare deploy
```

---

## Sincronizzare tra Mac e Windows
```bash
git pull origin main     # SEMPRE prima di iniziare a lavorare sull'altro PC
```

## Google Drive (backup off-site)
```bash
# Verifica backup su Drive
ssh trgb "rclone ls gdrive:TRGB-Backup/ --max-depth 1"

# Upload manuale
ssh trgb "rclone copy /home/marco/trgb/backups/NOMEFILE.tar.gz gdrive:TRGB-Backup/"
```

## Postazioni configurate
| PC | Cartella | SSH config |
|----|----------|------------|
| Mac (underline83) | `~/trgb` | `~/.ssh/config` con alias `trgb` |
| Windows (mcarm) | `C:\Users\mcarm\trgb` | `C:\Users\mcarm\.ssh\config` con alias `trgb` |
