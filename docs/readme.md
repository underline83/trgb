# TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** parziale (onboarding; §2–§8 path/env e §11 elenco DB da riverificare) · **Ultima verifica:** 2026-10-02 (§1, §9, §13)
> **Vedi anche:** [index.md](index.md) (home del wiki), [stack_tecnico.md](stack_tecnico.md), [GUIDA-RAPIDA.md](GUIDA-RAPIDA.md)

Sistema gestionale interno dell'Osteria Tre Gobbi (Bergamo)
**Versione:** Sistema 5.42 al 2026-10-02 — fonte: file `VERSION` in root, esposto da `/system/info`

---

# 1. Panoramica del Progetto

TRGB Gestionale e' un'applicazione web interna composta da:

- **Backend** FastAPI (Python 3.12) — API REST, autenticazione JWT con PIN, SQLite
- **Frontend** React 18 + Vite + TailwindCSS
- **Deploy** VPS Ubuntu 24.04 LTS (Aruba, upgrade 2026-04-28), Nginx, systemd, HTTPS Certbot
- **Deploy automatico** via `./push.sh "msg"` → git push bare repo → post-receive hook su VPS

Moduli attivi: elenco in §9, versioni correnti in `frontend/src/config/versions.jsx` (§13).

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

Una riga per modulo; la descrizione completa vive nella pagina wiki di ciascuno (regola "un fatto, una pagina" — [convenzioni_wiki.md](convenzioni_wiki.md), sanata 2026-07-24).

| Modulo | In breve | Pagina wiki |
|---|---|---|
| Cantina & Vini | magazzino a locazioni, movimenti, carta vini/bevande, vista sommelier, Cantina mobile, ordini fornitori, KPI | [modulo_vini.md](modulo_vini.md) · [ordini](modulo_vini_ordini.md) · [widget dashboard](modulo_vini_widget_dashboard.md) |
| Gestione Acquisti | import FatturaPA XML + FattureInCloud, fornitori, categorie, dashboard | [modulo_acquisti.md](modulo_acquisti.md) · [XML SDI](modulo_fatture_xml.md) · [FIC](modulo_fatture_in_cloud.md) |
| Ricette & Food Cost | ingredienti, ricette con sub-ricette, food cost ricorsivo, matching fatture | [modulo_ricette_foodcost.md](modulo_ricette_foodcost.md) |
| Vendite / Cassa | corrispettivi, chiusure giornaliere e di turno, preconti, dashboard YoY | [modulo_vendite.md](modulo_vendite.md) · [Selezioni del giorno](modulo_selezioni_giorno.md) |
| Banca + Flussi di Cassa | estratti conto, riconciliazione, contanti, mance | [modulo_banca.md](modulo_banca.md) |
| Controllo Gestione | dashboard unificata, scadenzario aggregatore, spese fisse, rateizzazioni | [modulo_controllo_gestione.md](modulo_controllo_gestione.md) |
| Cucina + Task Manager | checklist HACCP, task, scheduler, compliance, MEP | [modulo_cucina.md](modulo_cucina.md) · [pranzo](modulo_pranzo.md) |
| Scorte & Frigoriferi cucina | frigo/congelatori a ripiani, lotti e scadenze, Cucina da iPhone (/cucina/mobile) | [modulo_scorte_cucina.md](modulo_scorte_cucina.md) |
| Menu Carta | edizioni, sezioni, QR pubblico multilingua, generatore MEP | [modulo_menu_carta.md](modulo_menu_carta.md) |
| Clienti / CRM | anagrafica, tag, segmenti RFM, sync Mailchimp, Gift Card | [modulo_clienti_crm.md](modulo_clienti_crm.md) |
| Prenotazioni | planning giornaliero/settimanale, autocomplete CRM, mappa tavoli | [modulo_prenotazioni.md](modulo_prenotazioni.md) |
| Preventivi | eventi privati, numerazione annuale, template, link a prenotazione | [modulo_preventivi.md](modulo_preventivi.md) |
| Dipendenti & Turni | anagrafica + foglio turni settimanale stile Excel, comunicazione Intermittenti | [modulo_dipendenti.md](modulo_dipendenti.md) · [turni](modulo_dipendenti_turni.md) · [intermittenti](modulo_intermittenti.md) |
| Statistiche | import iPratico, KPI, top prodotti, trend | [modulo_statistiche.md](modulo_statistiche.md) |

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

File SQLite attivi in `locali/tregobbi/data/` (elenco completo e aggiornato in [database.md](database.md); la tabella sotto è parziale) — path canonico da R6.5; `app/data/` è solo fallback legacy con file vuoti (+ 1 eliminato):

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

Il catalogo completo di `docs/` vive in **[`docs/index.md`](index.md)** (home del wiki di progetto, organizzato per argomento). Le regole di manutenzione della documentazione sono in [`docs/convenzioni_wiki.md`](convenzioni_wiki.md).

> La tabella che stava qui è stata spostata in `index.md` il 2026-07-24 (regola "un fatto, una pagina").

---

# 13. Versioni Moduli

Non si ricopiano qui (si disallineavano: questa tabella era ferma a Vini 3.8 / Sistema 5.3). Fonti:

- **Sistema:** file `VERSION` in root (= `sistema.version` in `versions.jsx`), live su `/system/info`.
- **Moduli:** `frontend/src/config/versions.jsx` — ogni voce ha in commento la storia dei bump. In app: badge versione in testa ai moduli.

---

# 14. Roadmap

Task prioritari aperti → `docs/roadmap.md`
