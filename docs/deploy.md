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
| **Repo git VPS** | `/home/marco/trgb/trgb` |

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

> ⚠️ Va eseguito **dalla VPS** (non da remoto via ssh "..."), altrimenti sudo non funziona.

### Quick Deploy — git pull + restart servizi
```
./scripts/deploy.sh -b
```
Usalo per: modifiche al codice senza nuove dipendenze.

### Full Deploy — git pull + pip install + npm + restart
```
./scripts/deploy.sh -a
```
Usalo per: nuove dipendenze Python o npm (es. dopo aver modificato `requirements.txt` o `package.json`).

### Safe Deploy — backup DB + full deploy
```
./scripts/deploy.sh -c
```
Usalo per: deploy rischiosi o prima di modifiche ai database.

### Rollback — ripristina dall'ultimo backup
```
./scripts/deploy.sh -d
```

---

# 4. Workflow git completo (Mac → VPS → Windows)

```
1. Cowork modifica i file in ~/trgb
2. Dal terminale Mac:
     git add <file>
     git commit -m "descrizione"
     git push origin main
3. Sul VPS:
     ssh marco@80.211.131.156
     cd /home/marco/trgb/trgb
     ./scripts/deploy.sh -b      ← o -a se servono nuove dipendenze
4. Su Windows VS Code:
     git pull
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
