# TRGB Gestionale
Sistema gestionale interno dell'Osteria Tre Gobbi (Bergamo)
**Versione:** 2026.04.10 — Sistema v5.3

---

# 1. Panoramica del Progetto

TRGB Gestionale e' un'applicazione web interna composta da:

- **Backend** FastAPI (Python 3.12) — API REST, autenticazione JWT con PIN, SQLite
- **Frontend** React 18 + Vite + TailwindCSS
- **Deploy** VPS Ubuntu 22.04 (Aruba), Nginx, systemd, HTTPS Certbot
- **Deploy automatico** via `./push.sh "msg"` → git push bare repo → post-receive hook su VPS

Moduli attivi: Cantina & Vini (v3.8), Gestione Acquisti (v2.3), Ricette & Food Cost (v3.0), Gestione Vendite (v4.2), Flussi di Cassa (v1.5), Controllo Gestione (v2.1c), Gestione Clienti (v2.0), Prenotazioni (v2.0), Dipendenti (v2.1).

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
│   ├── migrations/     — Migrazioni foodcost.db (001–057+)
│   └── data/           — Database SQLite (7 file) + backups/{hourly,daily}
├── frontend/
│   ├── src/
│   │   ├── App.jsx, main.jsx
│   │   ├── components/
│   │   ├── pages/
│   │   └── config/api.js, versions.jsx, modulesMenu.js
│   ├── .env.development
│   └── .env.production
├── static/             — CSS, font, asset statici
├── docs/               — Documentazione tecnica
├── scripts/
│   ├── backup_db.sh    — Backup hourly/daily + sync Google Drive (cron)
│   └── deploy.sh       — Script deploy VPS (fallback manuale)
├── push.sh             — Deploy automatico (commit + push + restart) con fix +x idempotente
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
./push.sh "messaggio commit" -m    # solo migrazioni DB
./push.sh "messaggio commit" -d    # dry-run (no push)
```

`push.sh` esegue automaticamente: sync DB dal VPS → verifica bit +x su script critici (fix idempotente via `git update-index --chmod=+x`) → commit → push → attesa deploy via post-receive hook → restart servizi.

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

# 8. Backup

- **Hourly** — ogni ora al minuto 0 → `app/data/backups/hourly/YYYYMMDD_HHMMSS/` (retention 48h)
- **Daily** — ogni notte alle 03:30 → `app/data/backups/daily/YYYYMMDD_HHMMSS/` + sync Google Drive `TRGB-Backup/db-daily` (retention 7 giorni)
- **Script**: `scripts/backup_db.sh --hourly | --daily` (usa `sqlite3 .backup` per copia atomica)
- **Dall'app**: Admin → Impostazioni → tab Backup (download on-demand, banner warning 3 livelli se ultimo backup >30h/>48h)
- ⚠️ **Fix +x automatico** — `push.sh` verifica ad ogni push che `backup_db.sh` e `push.sh` stesso abbiano mode `100755` in git index, altrimenti lo forza con `git update-index --chmod=+x`. Inserito dopo l'incident del 2026-04-10 (backup fermo 12 giorni per bit +x perso)

---

# 9. Moduli

### Cantina & Vini (v3.8)
Magazzino vini con locazioni gerarchiche, movimenti, dashboard KPI, vendite bottiglia/calici. Carta Vini con generazione HTML/PDF/DOCX (legge solo da magazzino, vecchio DB eliminato v3.0). Strumenti cantina: import/export Excel, modifica massiva, filtro unificato, stampa selezionati, SchedaVino con sidebar.
Docs: `docs/modulo_vini.md`, `docs/modulo_magazzino_vini.md`

### Gestione Acquisti (v2.3)
Import FatturaPA XML + sync FattureInCloud API v2 con enrichment, dashboard acquisti con drill-down, elenco fornitori con sidebar filtri + dettaglio inline, categorie a 2 livelli, esclusioni fornitori, condizioni di pagamento. Dettaglio fornitore v3.2 con sidebar colorata (teal/amber/slate) e FattureDettaglio inline unificato (fine delle "due implementazioni parallele").
Docs: `docs/Modulo_Acquisti.md`

### Ricette & Food Cost (v3.0)
Ingredienti, fornitori, storico prezzi, ricette con sub-ricette, calcolo food cost ricorsivo, matching fatture con Smart Create, conversioni unita' personalizzate.
Docs: `docs/modulo_foodcost.md`

### Gestione Vendite (v4.2)
Import Excel corrispettivi, chiusure giornaliere, chiusure turno (pranzo/cena con logica cumulativa + chiusure parziali), pre-conti, spese dinamiche, fondo cassa, dashboard unificata 3 modalita' (Mensile/Trimestrale/Annuale), confronto YoY smart. Contanti e Mance spostati in Flussi di Cassa dalla v1.0.
Docs: `docs/modulo_corrispettivi.md`, `docs/design_gestione_vendite.md`

### Flussi di Cassa (v1.5)
Hub finanziario unificato: conti correnti (import CSV Banco BPM, movimenti, cross-ref fatture), carta di credito, gestione contanti (pagamenti spese e versamenti in banca, pre-conti, spese turno, spese varie), mance. Route: `/flussi-cassa/*` con redirect da `/banca/*`.
Docs: `docs/modulo_flussi_cassa.md`

### Controllo Gestione (v2.1c)
Dashboard unificata vendite/acquisti/banca/margine. **v2.0 CG aggregatore (2026-04-10)**: lo Scadenzario legge direttamente da `fe_fatture` + `cg_spese_fisse` via JOIN (nessuna duplicazione dati), con smart dispatcher per edit scadenza/IBAN/modalita pagamento (2 rami: FATTURA → `fe_fatture`, altro → legacy). Rateizzazioni tracciate via `fe_fatture.rateizzata_in_spesa_fissa_id`. **v2.1c (2026-04-10 notte)**: rewrite sidebar Scadenzario con layout flat 240px, stato in griglia 2×2, tipo come segment control, periodo preset 3-col, footer sticky. FattureDettaglio arricchito con card "Pagamenti & Scadenze". Click-through intelligente Scadenzario → FattureDettaglio/SpeseFisse.
Docs: `docs/Modulo_ControlloGestione.md`, `docs/v2.0-decisioni.md`

### Gestione Clienti (v2.0)
CRM completo con DB dedicato `clienti.sqlite3`. Anagrafica con tabella ordinabile + sidebar filtri, scheda cliente layout 3 colonne, diario note, tag toggle, storico prenotazioni. Dashboard CRM con 8 KPI card, compleanni 7gg, top clienti, distribuzioni (rank/tag/canale), andamento mensile. Import TheFork (clienti + prenotazioni), merge duplicati 3-step, export Google Contacts, protezione dati con alias merge.
Docs: `docs/modulo_clienti.md`

### Prenotazioni (v2.0)
Modulo prenotazioni basato su `clienti.sqlite3`, obiettivo eliminare TheFork Manager. Vista tabella globale con filtri (stato, canale, date), badge colorati, paginazione.
Docs: `docs/modulo_prenotazioni.md`

### Dipendenti & Turni (v2.1)
Anagrafica, tipologie turno, calendario.
Docs: `docs/modulo_dipendenti.md`

---

# 10. Autenticazione

- Login via PIN numerico (4+ cifre) con selezione utente tile-based
- JWT token (HS256, 60 min scadenza)
- 4 utenti: marco (admin), iryna (sala), paolo (sala), ospite (viewer)
- 5 ruoli: admin, chef, sommelier, sala, viewer
- Cambio PIN self-service + reset admin da Header
- Middleware ReadOnlyViewer blocca scritture per ruolo "viewer"

---

# 11. Database

7 file SQLite attivi in `app/data/` (+ 1 eliminato):

| File | Moduli |
|------|--------|
| ~~`vini.sqlite3`~~ | **ELIMINATO v3.0** — carta ora da vini_magazzino.sqlite3 |
| `vini_magazzino.sqlite3` | Cantina (magazzino vini moderno) |
| `vini_settings.sqlite3` | Ordinamenti e filtri carta |
| `foodcost.db` | FoodCost, Fatture XML, Ricette, Flussi di Cassa (Banca), Controllo Gestione, Statistiche (migrazioni 001–057+) |
| `admin_finance.sqlite3` | Vendite, Chiusure turno |
| `clienti.sqlite3` | Clienti CRM + Prenotazioni (anagrafica, tag, note, prenotazioni, alias) |
| `dipendenti.sqlite3` | Dipendenti e turni |

Schema dettagliato → `docs/database.md`

---

# 12. Documentazione completa

| File | Contenuto |
|------|-----------|
| `docs/architettura.md` | Architettura tecnica completa |
| `docs/database.md` | Schema tutti i database |
| `docs/deploy.md` | Guida deploy VPS e locale |
| `docs/changelog.md` | Storico rilasci |
| `docs/roadmap.md` | Task aperti e pianificati |
| `docs/sessione.md` | Briefing per sessioni Claude |
| `docs/GUIDA-RAPIDA.md` | Guida rapida operativa |
| `docs/v2.0-decisioni.md` | Decisioni architetturali CG aggregatore |
| `docs/Modulo_*.md` | Documentazione per modulo |

---

# 13. Versioni Moduli

Fonte di verita': `frontend/src/config/versions.jsx`

| Modulo | Versione | Stato |
|--------|----------|-------|
| Cantina & Vini | v3.8 | stabile |
| Gestione Acquisti | v2.3 | stabile |
| Ricette & Food Cost | v3.0 | beta |
| Gestione Vendite | v4.2 | stabile |
| Statistiche | v1.0 | beta |
| Flussi di Cassa | v1.5 | beta |
| Controllo Gestione | v2.1c | beta |
| Gestione Clienti | v2.0 | beta |
| Prenotazioni | v2.0 | beta |
| Dipendenti | v2.1 | stabile |
| Login & Ruoli | v2.0 | stabile |
| Sistema | v5.3 | stabile |

---

# 14. Roadmap

Task prioritari aperti → `docs/roadmap.md`
