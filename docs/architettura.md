# 🧱 TRGB Gestionale — Architettura Tecnica

Documento che descrive la struttura del progetto e la logica dei moduli.

---

# 1. Panorama generale

TRGB Gestionale è composto da:

- Backend FastAPI
- Frontend React + Vite
- Moduli dedicati (vini, foodcost, ricette)
- DB SQLite multipli
- Deploy automatizzato
- Servizi systemd
- Reverse proxy Nginx

---

# 2. Struttura del Backend

```
app/
├── routers/        ← Endpoints API
├── models/         ← Schemi DB + dataclass
├── repositories/   ← Logica accesso DB
├── services/       ← Servizi applicativi
├── core/           ← Configurazioni globali
├── static/         ← CSS / font / PDF
└── data/           ← DB SQLite
```

---

# 3. Struttura del Frontend

```
frontend/
├── src/
├── .env.*
└── vite.config.js
```

---

# 4. Database SQLite

## vini.sqlite3
- tabella vini
- colonne normalizzate
- quantità per frigo/locazioni
- prezzi, anni, formati…

## vini_settings.sqlite3
- ordine tipologie
- ordine nazioni
- ordine regioni
- filtri carta vini

## foodcost.db
- ingredienti
- fornitori
- prezzi
- ricette collegate

---

# 5. Script del progetto

```
run_server.py
run_server_vps.sh
run_frontend_vps.sh
run_backend_prod.sh
run_frontend_prod.sh
scripts/deploy.sh
```

---

# 6. Servizi Permanenti

- `trgb-backend.service`
- `trgb-frontend.service`

---

# 7. Architettura di Rete

Utente → Nginx HTTPS →  
→ Frontend Vite (127.0.0.1:5173)  
→ Backend FastAPI (127.0.0.1:8000)  

---

# Fine ARCHITETTURA.md
