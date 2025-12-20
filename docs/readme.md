# 🚀 TRGB Gestionale  
Sistema gestionale interno dell’Osteria Tre Gobbi (Bergamo)  
![Version](https://img.shields.io/badge/TRGB_Gestionale-2025.12.05-blue?style=for-the-badge)

Documentazione versione: **2025-12-05**

Per la mappa completa delle versioni dei moduli →  
👉 [`docs/VERSION_MAP.md`](docs/VERSION_MAP.md)

---

# 📚 Table of Contents

- [1. Panoramica del Progetto](#1-panoramica-del-progetto)
- [2. Struttura delle Cartelle](#2-struttura-delle-cartelle-locale--vps)
- [3. File .env](#3-file-env-frontend)
- [4. Avvio Locale](#4-avvio-locale-mac)
- [5. Deploy su VPS](#5-deploy-su-vps-produzione)
- [6. Script Unico di Deploy](#6-script-unico-di-deploy--deploysh)
- [7. Servizi systemd](#7-servizi-systemd)
- [8. NGINX Reverse Proxy + HTTPS](#8-nginx--reverse-proxy--https)
- [9. Firewall UFW](#9-firewall-ufw)
- [10. Moduli Applicativi](#10-moduli-applicativi)
- [11. Roadmap Tecnica](#11-roadmap-tecnica-2026)
- [12. Stato Produzione](#12-stato-produzione-dicembre-2025)

---

# 1. Panoramica del Progetto

TRGB Gestionale è un **ecosistema software modulare** sviluppato per la gestione operativa dell’Osteria Tre Gobbi.

**Stack tecnologico**
- Backend: FastAPI + Uvicorn (Python)
- Frontend: React + Vite
- Database: SQLite
- Infrastruttura: VPS Aruba Ubuntu, Nginx, HTTPS, systemd

---

# 2. Struttura delle Cartelle (Locale + VPS)

```
trgb/
├── trgb/
│   ├── app/
│   │   ├── routers/
│   │   ├── models/
│   │   ├── repositories/
│   │   ├── services/
│   │   ├── schemas/
│   │   ├── static/
│   │   └── data/
│   ├── frontend/
│   │   ├── src/
│   │   ├── .env.*
│   │   └── vite.config.js
│   ├── scripts/
│   │   └── deploy.sh
│   ├── run_server.py
│   ├── run_backend_prod.sh
│   └── run_frontend_prod.sh
└── venv-trgb/
```

---

# 3. File .env (Frontend)

- `.env.development` → sviluppo locale  
- `.env.production` → produzione  
- `.env.vps` → dev interno VPS  

---

# 4. Avvio Locale (Mac)

```
source ~/trgb/venv-trgb/bin/activate
python3 trgb/run_server.py
```

---

# 5. Deploy su VPS (Produzione)

Configurazione in:
```
/home/marco/trgb/.deploy_env
```

Deploy tramite:
```
./scripts/deploy.sh
```

---

# 6. Script Unico di Deploy — `deploy.sh`

Modalità:
- `-b` quick
- `-f` full
- `-s` safe (backup)
- `-r` rollback

---

# 7. Servizi systemd

- `trgb-backend.service`
- `trgb-frontend.service`

Avvio automatico all’avvio del server.

---

# 8. NGINX — Reverse Proxy + HTTPS

- Backend → `https://trgb.tregobbi.it`
- Frontend → `https://app.tregobbi.it`

HTTPS gestito via Certbot.

---

# 9. Firewall UFW

Esposte solo:
- 22 (SSH)
- 80 / 443 (Nginx)

---

# 10. Moduli Applicativi

## 10.1 Modulo Magazzino Vini (Carta + Operativo)

**Modulo unico che gestisce l’intero ciclo di vita del vino**, includendo:

- Carta Vini (editoriale)
- Magazzino Vini (gestionale)
- Movimenti cantina
- Evoluzioni future (dashboard, integrazioni)

📄 Documentazione completa:  
👉 `docs/Modulo_Magazzino_Vini.md`

---

## 10.2 Modulo Fatture Elettroniche (XML)

Gestione fatture elettroniche XML per:
- analisi acquisti
- controllo di gestione
- integrazione futura con ingredienti e magazzino

📄 Documentazione completa:  
👉 `docs/Modulo_FattureXML.md`

---

## 10.3 Modulo FoodCost

Ingredienti, fornitori, storico prezzi, ricette collegate.

📄 Documentazione completa:  
👉 `docs/Modulo_FoodCost.md`

---

# 11. Roadmap Tecnica 2026

- Build frontend statica
- CI/CD
- Dashboard avanzate
- Integrazioni magazzino / fatture / foodcost

---

# 12. Stato Produzione (Dicembre 2025)

✔ Backend online  
✔ Frontend online  
✔ HTTPS attivo  
✔ Deploy stabile  
✔ DB persistenti  

---

# 🏁 FINE README