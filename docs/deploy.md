# 🚀 TRGB Gestionale — Guida Deploy (VPS & Locale)

Questo documento descrive tutte le procedure di deploy del gestionale TRGB.

---

# 1. Deploy Locale (Mac)

### 1) Attiva venv
```
source ~/trgb/venv-trgb/bin/activate
```

### 2) Avvio backend + frontend
```
python3 trgb/run_server.py
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
/home/marco/trgb/.deploy_env
/home/marco/trgb/trgb/scripts/deploy.sh
/home/marco/trgb/trgb/app/data
```

---

# 3. Script Unico di Deploy — `deploy.sh`

### Quick Deploy (git pull + restart)
```
./scripts/deploy.sh -b
```

### Full Deploy (pip + npm)
```
./scripts/deploy.sh -f
```

### Safe Deploy (backup DB + full)
```
./scripts/deploy.sh -s
```

### Rollback
```
./scripts/deploy.sh -r
```

---

# 4. Servizi systemd

## Backend (`trgb-backend.service`)
```
sudo systemctl start trgb-backend
sudo systemctl status trgb-backend
```

## Frontend (`trgb-frontend.service`)
```
sudo systemctl start trgb-frontend
sudo systemctl status trgb-frontend
```

Abilitazione:
```
sudo systemctl enable trgb-backend trgb-frontend
```

---

# 5. Nginx Reverse Proxy

## Backend
```
proxy_pass http://127.0.0.1:8000;
```

## Frontend
```
proxy_pass http://127.0.0.1:5173;
```

---

# 6. HTTPS (Certbot)
```
sudo certbot --nginx -d trgb.tregobbi.it
sudo certbot --nginx -d app.tregobbi.it
```

---

# 7. Firewall UFW

```
sudo ufw allow 'Nginx Full'
sudo ufw allow in on lo
sudo ufw allow out on lo
sudo ufw reload
```

---

# 8. Test post-deploy

### Backend:
```
curl https://trgb.tregobbi.it
journalctl -u trgb-backend -f
```

### Frontend:
```
curl https://app.tregobbi.it
journalctl -u trgb-frontend -f
```

---

# Fine DEPLOY.md
