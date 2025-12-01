# 🚀 TRGB Gestionale — README Ufficiale  
**Versione: 2025.12 – GitHub Premium Edition**

Documentazione completa del gestionale interno dell’Osteria Tre Gobbi.  
Include architettura, deploy, servizi systemd, configurazioni VPS, flussi tecnici e roadmap.

---

# 📚 Table of Contents  
_(clicca per saltare alle sezioni)_

- [1. Panoramica del Progetto](#1-panoramica-del-progetto)
- [2. Struttura delle Cartelle](#2-struttura-delle-cartelle-locale--vps)
- [3. File .env](#3-file-env-frontend)
- [4. Avvio Locale](#4-avvio-locale-mac)
- [5. Deploy su VPS](#5-deploy-su-vps-produzione)
- [6. Script Unico di Deploy](#6-script-unico-di-deploy--deploysh)
- [7. Servizi systemd](#7-servizi-systemd)
- [8. NGINX Reverse Proxy + HTTPS](#8-nginx--reverse-proxy--https)
- [9. Firewall UFW](#9-firewall-ufw)
- [10. Sistema Vini (Architettura)](#10-sistema-vini--architettura-completa)
- [11. Roadmap Tecnica](#11-roadmap-tecnica-2026)
- [12. Stato Produzione](#12-stato-produzione-dicembre-2025)

---

# 1. Panoramica del Progetto

TRGB Gestionale è un **ecosistema software modulare** composto da:

### 🧰 Stack Tecnologico
- **Backend**: FastAPI + Uvicorn (Python 3.12)  
- **Frontend**: React + Vite  
- **Database SQLite**:
  - `vini.sqlite3`
  - `vini_settings.sqlite3`
  - `foodcost.db`
  - `ricette.db` (in sviluppo)  
- **Deploy**: script `deploy.sh` (Quick / Full / Safe / Rollback)
- **Infrastruttura**:
  - VPS Aruba Ubuntu
  - Nginx reverse proxy
  - HTTPS Certbot automatico
  - systemd per servizi permanenti
  - Firewall UFW sicuro

### ✨ Funzionalità attuali
- Import Excel → normalizzazione → salva DB  
- Carta Vini (HTML, PDF, DOCX)  
- Filtri + ordinamenti dinamici carta  
- Modulo Foodcost: ingredienti, prezzi, ricette collegate  
- Frontend moderno: https://app.tregobbi.it  

### 🔮 In sviluppo
- Build statica (eliminazione vite-dev)  
- Dashboard statistiche TRGB  
- Magazzino vini + movimentazioni  
- CI/CD GitHub Actions  
- Nuovo modulo ricette professionali  

---

# 2. Struttura delle Cartelle (Locale + VPS)

```
trgb/
├── trgb/
│   ├── app/                    ← Backend FastAPI
│   │   ├── routers/
│   │   ├── models/
│   │   ├── repositories/
│   │   ├── core/
│   │   ├── services/
│   │   ├── schemas/
│   │   ├── static/             ← CSS, font, template PDF
│   │   └── data/               ← DB SQLite
│   │
│   ├── frontend/               ← React + Vite
│   │   ├── src/
│   │   ├── .env.development
│   │   ├── .env.production
│   │   ├── .env.vps
│   │   └── vite.config.js
│   │
│   ├── scripts/
│   │   └── deploy.sh           ← Deploy unico
│   │
│   ├── run_server.py
│   ├── run_server_vps.sh
│   ├── run_frontend_vps.sh
│   ├── run_backend_prod.sh
│   └── run_frontend_prod.sh
│
└── venv-trgb/                  ← Virtualenv Python
```

File VPS:
```
/home/marco/trgb/.deploy_env
/etc/systemd/system/trgb-backend.service
/etc/systemd/system/trgb-frontend.service
/etc/nginx/sites-available/*.conf
```

---

# 3. File .env (Frontend)

### 🟦 Sviluppo locale — `frontend/.env.development`
```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### 🟩 Produzione — `frontend/.env.production`
```
VITE_API_BASE_URL=https://trgb.tregobbi.it
```

### 🟧 VPS (dev interno) — `frontend/.env.vps`
```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

---

# 4. Avvio Locale (Mac)

### 1) Attiva virtualenv
```
source ~/trgb/venv-trgb/bin/activate
```

### 2) Avvia backend + frontend
```
python3 trgb/run_server.py
```

- Backend → http://127.0.0.1:8000  
- Frontend → http://127.0.0.1:5173  

---

# 5. Deploy su VPS (Produzione)

## 5.1 File di configurazione VPS  
`/home/marco/trgb/.deploy_env`

```bash
PROJECT_ROOT="/home/marco/trgb/trgb"
VENV_DIR="/home/marco/trgb/venv-trgb"
BACKUP_ROOT="/home/marco/trgb/backups"
DATA_DIR="/home/marco/trgb/trgb/app/data"
LOG_FILE="/home/marco/trgb/deploy.log"
```

---

# 6. Script Unico di Deploy — `deploy.sh`

Percorso:
```
/home/marco/trgb/trgb/scripts/deploy.sh
```

### 6.1 Modalità

#### ⚡ Deploy Quick (veloce + restart)
```
./scripts/deploy.sh -b
```

#### 🛠️ Deploy Full (pip + npm + restart)
```
./scripts/deploy.sh -f
```

#### 🛡️ Deploy Safe (backup + full deploy)
```
./scripts/deploy.sh -s
```

#### ⏪ Rollback
```
./scripts/deploy.sh -r
```

---

# 7. Servizi systemd

## 7.1 Backend — `/etc/systemd/system/trgb-backend.service`
```
ExecStart=/home/marco/trgb/run_backend_prod.sh
Restart=always
```

## 7.2 Frontend — `/etc/systemd/system/trgb-frontend.service`
```
ExecStart=/usr/bin/npm run dev -- --host 127.0.0.1 --port 5173 --mode vps
Restart=always
```

Abilitazione:
```
sudo systemctl daemon-reload
sudo systemctl enable trgb-backend trgb-frontend
sudo systemctl start trgb-backend trgb-frontend
```

---

# 8. NGINX — Reverse Proxy + HTTPS

## Backend — `trgb.tregobbi.it`
```
proxy_pass http://127.0.0.1:8000;
```

## Frontend — `app.tregobbi.it`
```
proxy_pass http://127.0.0.1:5173;
```

### Certbot:
```
sudo certbot --nginx -d trgb.tregobbi.it
sudo certbot --nginx -d app.tregobbi.it
```

---

# 9. Firewall UFW

```
sudo ufw allow 'Nginx Full'
sudo ufw allow in on lo
sudo ufw allow out on lo
sudo ufw reload
```

---

# 10. Sistema Vini — Architettura Completa

> **Sezione invariata**:
> - Schema DB  
> - Settings carta vini  
> - Import Excel → normalize + insert  
> - Repository  
> - Router  
> - CSS PDF WeasyPrint  
> - Troubleshooting & roadmap  

---

# 11. Roadmap Tecnica 2026

- React build statico + hosting Nginx  
- Pipeline GitHub Actions  
- Backup automatici DB con retention  
- Telegram Bot per deploy  
- Dashboard vendite/magazzino  
- Nuova UI Ingredienti + Ricette  
- Drag&Drop ordinamenti carta vini  

---

# 12. Stato Produzione (Dicembre 2025)

✔ Backend online → https://trgb.tregobbi.it  
✔ Frontend online → https://app.tregobbi.it  
✔ Nginx reverse proxy attivo  
✔ Certificati HTTPS auto-renew  
✔ Servizi systemd stabili  
✔ Deploy centralizzato (`deploy.sh`)  
✔ Database persistenti  

---

# 🏁 FINE README (GitHub Premium Edition)
