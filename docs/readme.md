# 🚀 TRGB Gestionale
Sistema gestionale interno dell'Osteria Tre Gobbi (Bergamo)
**Versione:** 2026.03.08

---

# 1. Panoramica del Progetto

TRGB Gestionale è un'applicazione web interna composta da:

- **Backend** FastAPI (Python 3.12) — API REST, autenticazione JWT, SQLite
- **Frontend** React 18 + Vite + TailwindCSS
- **Deploy** VPS Ubuntu 22.04 (Aruba), Nginx, systemd, HTTPS Certbot

Moduli attivi: Carta Vini, Magazzino Vini, Corrispettivi, Fatture Elettroniche XML, FoodCost, Dipendenti & Turni.

---

# 2. Struttura delle Cartelle

```
trgb/
├── app/
│   ├── core/           — Config, JWT, security
│   ├── routers/        — Endpoints API (un file per modulo)
│   ├── services/       — Logica applicativa
│   ├── models/         — Schema DB + CRUD
│   ├── repositories/   — Query ordinate
│   ├── migrations/     — Migrazioni foodcost.db
│   └── data/           — Database SQLite
├── frontend/
│   ├── src/
│   │   ├── App.jsx, main.jsx
│   │   ├── components/
│   │   ├── pages/
│   │   └── config/api.js
│   ├── .env.development
│   └── .env.production
├── static/             — CSS, font, asset statici
├── docs/               — Documentazione tecnica
├── scripts/
│   └── deploy.sh       — Script deploy VPS
└── main.py             — Entry point FastAPI
```

---

# 3. File .env

### `.env.development`
```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### `.env.production`
```
VITE_API_BASE_URL=http://80.211.131.156:8000
```
⚠️ Da aggiornare a `https://trgb.tregobbi.it` (task #2 Roadmap)

---

# 4. Avvio Locale (Mac)

```bash
# Doppio click su run_servers.command
# oppure manualmente:

source ~/trgb/venv-trgb/bin/activate
uvicorn main:app --reload --port 8000

cd frontend && npm run dev
```

Endpoints locali:
- Backend → `http://127.0.0.1:8000`
- Frontend → `http://127.0.0.1:5173`

---

# 5. Deploy su VPS

```bash
ssh marco@80.211.131.156
cd /home/marco/trgb/trgb
./scripts/deploy.sh -b    # quick (solo restart)
./scripts/deploy.sh -a    # full (pip + npm + restart)
./scripts/deploy.sh -c    # safe (backup DB + full)
```

Per dettagli completi → `docs/deploy.md`

---

# 6. Servizi systemd

```bash
sudo systemctl status trgb-backend
sudo systemctl status trgb-frontend
journalctl -u trgb-backend -f
```

---

# 7. NGINX & HTTPS

Dominio backend: `https://trgb.tregobbi.it` → `127.0.0.1:8000`
Dominio frontend: `https://app.tregobbi.it` → `127.0.0.1:5173`

---

# 8. Moduli

### Carta Vini
Import Excel → normalizzazione → DB → generazione HTML/PDF/DOCX.
Documentazione: `docs/Modulo_Vini.md`, `docs/Database_Vini.md`

### Magazzino Vini
Giacenze vini, locazioni, prezzi carta/listino, import SAFE/FORCE.
Documentazione: `docs/Modulo_MagazzinoVini.md`

### Corrispettivi
Import Excel corrispettivi, chiusure giornaliere, statistiche mensili/annuali, dashboard.
Documentazione: `docs/Modulo_Corrispettivi.md`

### Fatture Elettroniche (XML)
Import FatturaPA XML, anti-duplicazione SHA-256, statistiche acquisti.
Documentazione: `docs/Modulo_FattureXML.md`

### FoodCost
Ingredienti, fornitori, storico prezzi, ricette.
Documentazione: `docs/Modulo_FoodCost.md`, `docs/Database_FoodCost.md`

### Dipendenti & Turni
Anagrafica, tipologie turno, calendario.
Documentazione: `docs/Modulo_Dipendenti.md`

---

# 9. Documentazione completa

Indice → `docs/Index.md`

---

# 10. Roadmap

Task prioritari aperti → `docs/Roadmap.md`

Stato attuale (2026-03-08):
- ⚠️ Auth mock con password in chiaro (task #1)
- ⚠️ Endpoint finanziari senza autenticazione (task #3)
- ⚠️ `.env.production` usa HTTP, non HTTPS (task #2)
- 🔄 Fix bug corrispettivi deployati (task #5 ✅)
