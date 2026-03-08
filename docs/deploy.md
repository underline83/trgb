# 🚀 TRGB Gestionale — Guida Deploy (VPS & Locale)

Questo documento descrive tutte le procedure di deploy del gestionale TRGB.

---

# 0. Infrastruttura — Riferimenti server

| Voce | Valore |
|------|--------|
| **IP VPS** | `80.211.131.156` |
| **Provider** | Aruba |
| **OS** | Ubuntu 22.04 LTS |
| **Utente SSH** | `marco` (Mac: `underline83`, Windows: `mcarm`) |
| **Connessione** | `ssh marco@80.211.131.156` |
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

## 4.1 Flusso automatico (NUOVO — dal 2026-03-08)

Il VPS ospita un **bare repository** (`/home/marco/trgb/trgb.git`) con un **post-receive hook** che esegue il deploy automaticamente ad ogni push.

```
1. Cowork modifica i file in ~/trgb
2. Dal terminale Mac:
     git add <file>
     git commit -m "fix: #N descrizione"
     git push
     # → il VPS aggiorna il codice, pip/npm se serve, riavvia i servizi
3. Su Windows VS Code:
     git pull
```

Il remote su Mac e Windows punta al bare repo:
```
origin → marco@80.211.131.156:/home/marco/trgb/trgb.git
```

### Prerequisiti VPS (una tantum)
Il hook ha bisogno di poter riavviare i servizi senza password. Aggiungere via `sudo visudo`:
```
marco ALL=(ALL) NOPASSWD: /bin/systemctl restart trgb-backend, /bin/systemctl restart trgb-frontend
```

### Aggiornare il remote (se ancora vecchio)
```bash
# Mac
git remote set-url origin marco@80.211.131.156:/home/marco/trgb/trgb.git

# Windows
git remote set-url origin marco@80.211.131.156:/home/marco/trgb/trgb.git
git pull origin main
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

# Fine DEPLOY.md
