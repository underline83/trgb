# TRGB Gestionale
Sistema gestionale interno dell'Osteria Tre Gobbi (Bergamo)
**Versione:** 2026.03.14 — Sistema v4.3

---

# 1. Panoramica del Progetto

TRGB Gestionale e' un'applicazione web interna composta da:

- **Backend** FastAPI (Python 3.12) — API REST, autenticazione JWT con PIN, SQLite
- **Frontend** React 18 + Vite + TailwindCSS
- **Deploy** VPS Ubuntu 22.04 (Aruba), Nginx, systemd, HTTPS Certbot
- **Deploy automatico** via `git push` → post-receive hook su VPS

Moduli attivi: Cantina & Vini (v3.7), Gestione Acquisti (v2.0), Ricette & Food Cost (v3.0), Gestione Vendite (v2.0) con Chiusure Turno, Banca (v1.0), Finanza (v1.0), Dipendenti & Turni (v1.0).

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
│   ├── migrations/     — Migrazioni foodcost.db (001–017)
│   └── data/           — Database SQLite (6 file)
├── frontend/
│   ├── src/
│   │   ├── App.jsx, main.jsx
│   │   ├── components/
│   │   ├── pages/
│   │   └── config/api.js, versions.jsx
│   ├── .env.development
│   └── .env.production
├── static/             — CSS, font, asset statici
├── docs/               — Documentazione tecnica
├── scripts/
│   ├── deploy.sh       — Script deploy VPS (fallback manuale)
│   └── push.sh         — Deploy automatico (commit + push + restart)
└── main.py             — Entry point FastAPI
```

---

# 3. Configurazione Ambiente

### `.env` (backend, gitignored)
```
SECRET_KEY=<chiave-segreta-jwt>
```

### `.env.development` (frontend)
```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### `.env.production` (frontend)
```
VITE_API_BASE_URL=https://trgb.tregobbi.it
```

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

### Deploy automatico (metodo principale)
```bash
./push.sh "messaggio commit"       # quick (git pull + restart)
./push.sh "messaggio commit" -f    # full (+ pip + npm install)
```

### Deploy manuale (fallback)
```bash
ssh marco@80.211.131.156
cd /home/marco/trgb/trgb
./scripts/deploy.sh -b    # quick
./scripts/deploy.sh -a    # full
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

### Cantina & Vini (v3.7)
Magazzino vini con locazioni gerarchiche, movimenti, dashboard KPI, vendite bottiglia/calici. Carta Vini con generazione HTML/PDF/DOCX. Strumenti cantina: sync Excel, import/export, modifica massiva.
Docs: `docs/modulo_vini.md`, `docs/modulo_magazzino_vini.md`

### Gestione Acquisti (v2.0)
Import FatturaPA XML, dashboard acquisti con drill-down, elenco fornitori, categorie a 2 livelli, esclusioni fornitori.
Docs: `docs/Modulo_Acquisti.md`

### Ricette & Food Cost (v3.0)
Ingredienti, fornitori, storico prezzi, ricette con sub-ricette, calcolo food cost ricorsivo, matching fatture con Smart Create, conversioni unita' personalizzate.
Docs: `docs/modulo_foodcost.md`

### Gestione Vendite (v2.0)
Import Excel corrispettivi, chiusure giornaliere, chiusure turno (pranzo/cena con logica cumulativa), pre-conti, spese dinamiche, fondo cassa, riepilogo mensile, dashboard, confronto annuale.
Docs: `docs/modulo_corrispettivi.md`

### Banca (v1.0)
Import CSV Banco BPM, movimenti con categorie custom, dashboard, cross-reference con fatture XML, andamento temporale.

### Finanza (v1.0)
Import Excel movimenti finanziari, scadenzario pagamenti, categorie a doppia classificazione.

### Dipendenti & Turni (v1.0)
Anagrafica, tipologie turno, calendario. Allegati predisposti nel DB ma non ancora implementati.
Docs: `docs/modulo_dipendenti.md`

---

# 9. Autenticazione

- Login via PIN numerico (4+ cifre) con selezione utente tile-based
- JWT token (HS256, 60 min scadenza)
- 4 utenti: marco (admin), iryna (sala), paolo (sala), ospite (viewer)
- 5 ruoli: admin, chef, sommelier, sala, viewer
- Cambio PIN self-service + reset admin da Header
- Middleware ReadOnlyViewer blocca scritture per ruolo "viewer"

---

# 10. Database

6 file SQLite in `app/data/`:

| File | Moduli |
|------|--------|
| `vini.sqlite3` | Carta Vini (legacy Excel) |
| `vini_magazzino.sqlite3` | Cantina (magazzino vini moderno) |
| `vini_settings.sqlite3` | Ordinamenti e filtri carta |
| `foodcost.db` | FoodCost, Fatture XML, Ricette, Banca, Finanza (migrazioni 001–017) |
| `admin_finance.sqlite3` | Vendite, Chiusure turno |
| `dipendenti.sqlite3` | Dipendenti e turni (creato a runtime) |

Schema dettagliato → `docs/database.md`

---

# 11. Documentazione completa

| File | Contenuto |
|------|-----------|
| `docs/architettura.md` | Architettura tecnica completa |
| `docs/database.md` | Schema tutti i database |
| `docs/deploy.md` | Guida deploy VPS e locale |
| `docs/changelog.md` | Storico rilasci |
| `docs/roadmap.md` | Task aperti e pianificati |
| `docs/sessione.md` | Briefing per sessioni Claude |
| `docs/modulo_*.md` | Documentazione per modulo |

---

# 12. Versioni Moduli

Fonte di verita': `frontend/src/config/versions.jsx`

| Modulo | Versione | Stato |
|--------|----------|-------|
| Cantina & Vini | v3.7 | stabile |
| Gestione Acquisti | v2.0 | stabile |
| Ricette & Food Cost | v3.0 | beta |
| Gestione Vendite | v2.0 | stabile |
| Banca | v1.0 | beta |
| Finanza | v1.0 | beta |
| Dipendenti | v1.0 | stabile |
| Login & Ruoli | v2.0 | stabile |
| Sistema | v4.3 | stabile |

---

# 13. Roadmap

Task prioritari aperti → `docs/roadmap.md`
