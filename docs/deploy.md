# 🚀 TRGB Gestionale — Guida Deploy (VPS & Locale)

Questo documento descrive tutte le procedure di deploy del gestionale TRGB.

---

# 0. Infrastruttura — Riferimenti server

| Voce | Valore |
|------|--------|
| **IP VPS** | `80.211.131.156` |
| **Dominio VPS** | `trgb.tregobbi.it` |
| **Provider** | Aruba Cloud (account ARU-339384) |
| **OS** | Ubuntu 22.04 LTS |
| **Utente SSH** | `marco` (Mac: `underline83`, Windows: `mcarm`) |
| **Connessione** | `ssh trgb` (alias configurato in `~/.ssh/config`) |
| **Backend URL (prod)** | `https://trgb.tregobbi.it` |
| **Frontend URL (prod)** | `https://app.tregobbi.it` |
| **Backend porta interna** | `8000` |
| **Frontend porta interna** | `5173` |
| **Repo git locale (Mac)** | `~/trgb` |
| **Repo git locale (Win)** | `C:\Users\mcarm\progetti\trgb` |
| **Repo git VPS (working dir)** | `/home/marco/trgb/trgb` |
| **Repo git VPS (bare server)** | `/home/marco/trgb/trgb.git` |

---

# 1. Deploy Locale (Mac)

### 1) Attiva venv
```
source ~/trgb/venv-trgb/bin/activate
```

### 2) Avvio backend + frontend
```
python3 run_server.py
```

### Endpoints
- Backend → http://127.0.0.1:8000
- Frontend → http://127.0.0.1:5173

---

# 2. Deploy su VPS Aruba (Produzione)

## 2.1 Connettersi alla VPS
```
ssh marco@80.211.131.156
```

## 2.2 Percorsi principali
```
/home/marco/trgb/trgb/             ← root progetto
/home/marco/trgb/trgb/scripts/deploy.sh
/home/marco/trgb/trgb/app/data     ← database SQLite
```

---

# 3. Script Unico di Deploy — `deploy.sh`

> ⚠️ Con il nuovo flusso automatico (sez. 4.1), `deploy.sh` non serve più per i deploy normali.
> Va usato solo come **fallback manuale** dalla VPS.

| Opzione | Uso |
|---------|-----|
| `-b` | Quick: checkout + restart servizi (no pip/npm) |
| `-a` | Full: + pip install + npm build (nuove dipendenze) |
| `-c` | Safe: + backup DB prima del deploy |
| `-d` | Rollback: ripristina dall'ultimo backup |

---

# 4. Workflow git completo (Mac → VPS → Windows)

## 4.1 Flusso automatico (aggiornato 2026-03-20)

Il VPS ospita un **bare repository** (`/home/marco/trgb/trgb.git`) con un **post-receive hook** che esegue il deploy automaticamente ad ogni push.

### Architettura Git (3 copie del codice)

```
Mac/Windows (sviluppo)
  │
  ├── git push origin  →  VPS bare repo (/home/marco/trgb/trgb.git)
  │                          └── post-receive hook → deploy automatico
  │
  └── git push github  →  GitHub (git@github.com:underline83/trgb.git)
                             └── backup off-site del codice
```

### Remote configurati su Mac e Windows
```
origin → marco@trgb.tregobbi.it:/home/marco/trgb/trgb.git   (deploy)
github → git@github.com:underline83/trgb.git                 (backup)
```

### Remote configurato sul server (working directory)
```
origin → /home/marco/trgb/trgb.git   (bare repo locale)
```

### Flusso di lavoro quotidiano
```
1. Cowork/VS Code modifica i file
2. Dal terminale:
     ./push.sh "descrizione modifica"
     # → commit + push VPS (deploy) + push GitHub (backup)
3. Sull'altro PC:
     git pull
```

### Prerequisiti VPS (una tantum)
Il hook ha bisogno di poter riavviare i servizi senza password. Aggiungere via `sudo visudo`:
```
marco ALL=(ALL) NOPASSWD: /bin/systemctl restart trgb-backend, /bin/systemctl restart trgb-frontend
```

### SSH config (su Mac e Windows, in ~/.ssh/config)
```
Host trgb
  HostName trgb.tregobbi.it
  User marco
  IdentityFile ~/.ssh/id_ed25519
```

---

## 4.2 Deploy manuale sul VPS (fallback se hook non funziona)

> Usare solo se il deploy automatico fallisce.

```bash
ssh marco@80.211.131.156
cd /home/marco/trgb/trgb
./scripts/deploy.sh -b      # quick: checkout + restart servizi
./scripts/deploy.sh -a      # full: + pip install + npm build
./scripts/deploy.sh -c      # safe: + backup DB prima del deploy
```

---

# 5. Servizi systemd

## Backend (`trgb-backend.service`)
```
sudo systemctl start trgb-backend
sudo systemctl stop trgb-backend
sudo systemctl status trgb-backend
journalctl -u trgb-backend -f
```

## Frontend (`trgb-frontend.service`)
```
sudo systemctl start trgb-frontend
sudo systemctl stop trgb-frontend
sudo systemctl status trgb-frontend
journalctl -u trgb-frontend -f
```

Abilitazione all'avvio:
```
sudo systemctl enable trgb-backend trgb-frontend
```

---

# 6. Nginx Reverse Proxy

```
proxy_pass http://127.0.0.1:8000;   ← backend
proxy_pass http://127.0.0.1:5173;   ← frontend
```

Test configurazione:
```
sudo nginx -t
sudo systemctl reload nginx
```

---

# 7. HTTPS (Certbot)

```
sudo certbot --nginx -d trgb.tregobbi.it
sudo certbot --nginx -d app.tregobbi.it
```

Rinnovo manuale:
```
sudo certbot renew
```

---

# 8. Firewall UFW

```
sudo ufw allow 'Nginx Full'
sudo ufw allow in on lo
sudo ufw allow out on lo
sudo ufw reload
```

---

# 9. Test post-deploy

```
curl -o /dev/null -s -w "%{http_code}" https://app.tregobbi.it
curl -o /dev/null -s -w "%{http_code}" https://trgb.tregobbi.it
```

Risposta attesa: `200`

---

---

# 6. Troubleshooting

## Backend non risponde
```bash
curl https://trgb.tregobbi.it
journalctl -u trgb-backend -f
```

## Frontend non carica
```bash
curl https://app.tregobbi.it
journalctl -u trgb-frontend -f
```

## Porta occupata (8000 o 5173)
```bash
sudo lsof -ti:8000 | xargs sudo kill -9
sudo lsof -ti:5173 | xargs sudo kill -9
```

## Nginx errore
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## HTTPS scaduto
```bash
sudo certbot renew
```

## Hook post-receive non esegue restart
Verificare che il sudoers sia configurato correttamente:
```bash
sudo grep marco /etc/sudoers
which systemctl   # verificare il percorso corretto
```
Il percorso nel sudoers deve corrispondere esattamente all'output di `which systemctl`.

---

# 10. Backup e Sicurezza

## 10.1 Backup giornaliero database (automatico)

Lo script `backup.sh` viene eseguito ogni notte alle 3:00 via cron.
Salva tutti i database SQLite in `/home/marco/trgb/backups/` con retention 30 giorni.

```bash
# Backup manuale
/home/marco/trgb/trgb/backup.sh

# Vedere i backup esistenti
ls -la /home/marco/trgb/backups/

# Log backup
cat /home/marco/trgb/backups/backup.log
```

## 10.2 Snapshot Aruba (settimanale)

Dal pannello Aruba Cloud → VPS → Gestisci → Snapshot.
Salva un'immagine completa del disco. Consigliato: 1 snapshot settimanale.

## 10.3 Fail2ban

SSH è protetto da fail2ban. Se il tuo IP viene bannato:
```bash
# Da un IP diverso (es. hotspot telefono):
ssh trgb
sudo fail2ban-client set sshd unbanip IL_TUO_IP

# Vedere IP bannati:
sudo fail2ban-client status sshd
```

Reti private sono in whitelist. Bantime: 10 minuti.

## 10.4 Setup iniziale backup e sicurezza

```bash
sudo bash /home/marco/trgb/trgb/setup-backup-and-security.sh
```

---

# Fine DEPLOY.md
