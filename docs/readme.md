# TRGB Gestionale
Sistema gestionale interno dell'Osteria Tre Gobbi (Bergamo)
**Versione:** 2026.05.08 — Sistema v5.x (vedi `VERSION` in root + `/system/info`)

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

### Cantina & Vini (v4.x)
Magazzino vini con locazioni gerarchiche, movimenti, dashboard KPI con widget riordini per fornitore (8 fasi) e widget alert "vini in carta senza giacenza" (6 fasi A-F), vendite bottiglia/calici. Carta Vini con generazione HTML/PDF/DOCX. Carta Bevande sub-module (7 sezioni: aperitivi, birre, amari fatti in casa, amari & liquori, distillati, tisane, tè) con editor + export master. Strumenti cantina: import/export Excel, modifica massiva, filtro unificato, stampa selezionati, SchedaVino con sidebar colorata per tipologia. Sync iPratico per match diretto codici.
Docs: `docs/modulo_vini.md`, `docs/modulo_vini_widget_dashboard.md`

### Gestione Acquisti (v2.3)
Import FatturaPA XML + sync FattureInCloud API v2 con enrichment, dashboard acquisti con drill-down, elenco fornitori con sidebar filtri + dettaglio inline, categorie a 2 livelli, esclusioni fornitori, condizioni di pagamento. Dettaglio fornitore v3.2 con sidebar colorata (teal/amber/slate) e FattureDettaglio inline unificato. Pro-forme spec assorbita (in pausa).
Docs: `docs/modulo_acquisti.md`

### Ricette & Food Cost (v3.0)
Ingredienti, fornitori, storico prezzi multi-fornitore, ricette con sub-ricette, calcolo food cost ricorsivo con cycle detection, matching fatture XML → ingredienti con Smart Create, conversioni unità personalizzate (3 livelli: custom + standard + chain).
Docs: `docs/modulo_ricette_foodcost.md`

### Selezioni / Gestione Vendite (v4.x)
Import Excel corrispettivi, chiusure giornaliere, chiusure turno (pranzo/cena con logica cumulativa + chiusure parziali), pre-conti, spese dinamiche, fondo cassa, dashboard unificata 3 modalità (Mensile/Trimestrale/Annuale), confronto YoY smart. Contanti e Mance spostati in Flussi di Cassa.
Docs: `docs/modulo_selezioni.md`

### Banca + Flussi di Cassa (v1.x)
Estratti conto BPM/Sella, movimenti bancari con matching scadenze (manuale + automatico in roadmap), riconciliazione, gestione contanti separata, mance con distribuzione cumulativo.
Docs: `docs/modulo_banca.md`

### Controllo Gestione (v2.1c)
Dashboard unificata vendite/acquisti/banca/margine. CG aggregatore: Scadenzario legge da `fe_fatture` + `cg_spese_fisse` via JOIN, smart dispatcher per edit scadenza/IBAN/modalità pagamento. Rateizzazioni tracciate via `fe_fatture.rateizzata_in_spesa_fissa_id`. FattureDettaglio arricchito con card "Pagamenti & Scadenze". Click-through Scadenzario → FattureDettaglio/SpeseFisse.
Docs: `docs/modulo_controllo_gestione.md`

### Cucina (MVP + Phase A.2/A.3)
Checklist ricorrenti HACCP/apertura/chiusura/pulizie, task singoli non ricorrenti, scheduler giornaliero idempotente, score di compliance. Phase A.2 livelli cucina (chef/sous_chef/commis), Phase A.3 brigata cucina ruoli utente reali con filtro auto.
Docs: `docs/modulo_cucina.md` + `docs/modulo_pranzo.md` + `docs/modulo_menu_carta.md`

### Gestione Clienti / CRM (v1.x)
CRM completo con DB dedicato `clienti.sqlite3`. Anagrafica con sidebar filtri, scheda cliente con tab (anagrafica, prenotazioni, preventivi, note), tag, segmenti marketing, RFM. Sync Mailchimp con merge fields + tag automatici per segmento.
Docs: `docs/modulo_clienti_crm.md`

### Prenotazioni (v2.0)
Modulo prenotazioni basato su `clienti.sqlite3`, obiettivo eliminare TheFork Manager. Planning giornaliero, vista settimanale, autocomplete cliente CRM, mappa tavoli (Fase 2 in roadmap), widget pubblico (Fase 3 in roadmap).
Docs: `docs/modulo_prenotazioni.md`

### Preventivi
Aggregare preventivi per eventi privati, cene aziendali, gruppi. Numero progressivo annuale, stati con transizioni, template riutilizzabili, righe editabili con totale live, link a prenotazione confermata.
Docs: `docs/modulo_preventivi.md`

### Dipendenti & Turni (v2.x)
Anagrafica + Turni v2 (foglio settimana stile Excel) operativi. In roadmap: Buste paga (PDF parsing → cg_uscite), Presenze, Scadenze documenti (HACCP/sicurezza/visite), Contratti, Dashboard costi.
Docs: `docs/modulo_dipendenti.md`, `docs/modulo_dipendenti_turni.md`

### Statistiche
Import iPratico mensile (.xls HTML), dashboard KPI, classifica top prodotti, trend mensile, dettaglio prodotti con filtri, storico import.
Docs: `docs/modulo_statistiche.md`

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
| `docs/stack_tecnico.md` | Architettura tecnica completa (ex `architettura.md`) |
| `docs/architettura_locale.md` | Architettura locale post-R6.5 (path canonico `locali/<id>/data/`) |
| `docs/architettura_mattoni.md` | Mattoni condivisi M.A-M.I |
| `docs/architettura_pattern.md` | Pattern ricorrenti (WAL, trailing slash, ecc.) |
| `docs/database.md` | Schema tutti i database |
| `docs/deploy.md` | Guida deploy VPS e locale |
| `docs/sicurezza_backup.md` | Architettura backup post-incidente S60-INC1 |
| `docs/installazione_nuovo_server.md` | Runbook setup nuovo cliente |
| `docs/refactor_monorepo.md` | Refactor R1-R8 monorepo (core/ + locali/) |
| `docs/changelog.md` | Storico rilasci |
| `docs/roadmap.md` | Task aperti e pianificati (modulo per modulo) |
| `docs/problemi.md` | Bug aperti e debt tecnico |
| `docs/sessione.md` | Briefing per sessioni Claude |
| `docs/GUIDA-RAPIDA.md` | Guida rapida operativa |
| `docs/inventario_pulizia.md` | Tech debt + cleanup batch (worktree, file morti, WAL TODO) |
| `docs/controllo_design.md` | Regole UI/UX trasversali |
| `docs/checklist_visione_insieme.md` | Checklist 6-punti per ogni modifica |
| `docs/modulo_*.md` | Documentazione per modulo (vini, acquisti, ricette_foodcost, cucina, dipendenti, ecc.) |

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
