# 📋 TRGB — Briefing per Nuova Sessione
> File scritto da Claude a Claude. Leggilo per intero prima di iniziare a lavorare.
> **Aggiornalo alla fine di ogni sessione.**
> Ultima sessione: 2026-03-09

---

## Chi sei e dove sei

Sei l'assistente AI che lavora sul gestionale interno dell'**Osteria Tre Gobbi (Bergamo)**.
Il progetto si chiama **TRGB Gestionale** — un'app web FastAPI + React in produzione su VPS Aruba.
L'utente si chiama **Marco** (mac: `underline83`, win: `mcarm`).

La cartella di lavoro è selezionata come workspace Cowork. Puoi leggere e scrivere direttamente tutti i file del progetto.

---

## Cosa abbiamo fatto nell'ultima sessione (2026-03-09)

1. **Fix #1 — Auth reale** — `auth_service.py` riscritto:
   - Rimosso `USERS` con password in chiaro
   - Password hashate `sha256_crypt` via `passlib.CryptContext` (già in `security.py`)
   - `authenticate_user()` usa `security.verify_password()`
   - `decode_access_token()` delega a `security.decode_access_token()`
   - `scripts/gen_passwords.py` — utility per rigenerare hash al cambio password ✅
2. **SECRET_KEY da .env** — `python-dotenv` in `requirements.txt`, `load_dotenv()` in `main.py`, `.env` creato (gitignored) ✅

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-08)

1. **Audit completo** — backend, frontend, DB, auth, route, docs verificati via ispezione codice
2. **Riscritta e consolidata tutta la documentazione** — da 18 a 13 file, naming tutto minuscolo, accorpati troubleshooting/VersionMap/Index, DB unificato in `database.md`
3. **Setup git server VPS** — bare repo `/home/marco/trgb/trgb.git` + post-receive hook deploy automatico su `git push`
4. **Fix #6** — `CorrispettiviAnnual.jsx` + route `/admin/corrispettivi/annual` ✅
5. **Fix #9** — `slugify` deduplicata in `vini_router.py` ✅
6. **Fix #11** — `if prezzo:` → `if prezzo not in (None, "")` in `carta_vini_service.py` ✅
7. **Fix #7** — `apiFetch()` in `api.js`: gestione 401 centralizzata, rimosso codice duplicato da 6 pagine ✅
8. **Fix #3** — `Depends(get_current_user)` su 5 router pubblici: `admin_finance`, `fe_import`, `foodcost_ingredients`, `foodcost_recipes`, `vini_settings` ✅

---

## Stato attuale del codice — cose critiche da sapere

### 🟠 FORCE IMPORT SENZA CHECK RUOLO
`vini_magazzino_router.py` riga ~403: commento `# per ora nessun controllo di ruolo`.

### 🟡 `.env` non esiste sul VPS
Il file `.env` con `SECRET_KEY` è stato creato in locale (gitignored). Sul VPS va creato manualmente:
```
/home/marco/trgb/trgb/.env
SECRET_KEY=<chiave-forte-diversa-da-quella-locale>
```
Poi `pip install python-dotenv` sul VPS se non già installato.

### 🟢 COSE GIÀ FIXATE (totale)
- Fix #1: `auth_service.py` — sha256_crypt hash, `security.verify_password()`, `python-dotenv` ✅
- Fix #3: `Depends(get_current_user)` su admin_finance, fe_import, foodcost_ingredients, foodcost_recipes, vini_settings ✅
- Fix #6: route `/admin/corrispettivi/annual` + pagina `CorrispettiviAnnual.jsx` ✅
- Fix #7: `apiFetch()` centralizzato in `api.js`, rimosso codice 401 duplicato da 6 pagine ✅
- Fix #9: `slugify` deduplicata in `vini_router.py` ✅
- Fix #11: `if prezzo:` → `if prezzo not in (None, "")` in `carta_vini_service.py` ✅

---

## Task aperti prioritizzati

Vai su `docs/roadmap.md` per la lista completa con dettagli.
Ordine suggerito per lavorare:

| # | Task | Difficoltà | Impatto |
|---|------|-----------|---------|
| ~~1~~ | ~~Sostituire mock auth con hash reali~~ | ~~Alto~~ | ~~Critico~~ | ✅ |
| ~~3~~ | ~~Auth su endpoint pubblici~~ | ~~Medio~~ | ~~Critico~~ | ✅ |
| ~~6~~ | ~~Route `/annual` + pagina confronto annuale~~ | ~~Facile~~ | ~~Medio~~ | ✅ |
| ~~7~~ | ~~`apiFetch()` centralizzato (gestione 401)~~ | ~~Medio~~ | ~~Alto~~ | ✅ |
| ~~9~~ | ~~`slugify` deduplicata~~ | ~~Facile~~ | ~~Basso~~ | ✅ |
| ~~11~~ | ~~Fix `if prezzo:` HTML preview~~ | ~~Facile~~ | ~~Basso~~ | ✅ |
| 2 | Aggiornare `.env.production` a HTTPS | Facile (15min) | Medio |

**Azione pendente (manuale su VPS):**
Il post-receive hook funziona ma non riesce a riavviare i servizi. Verificare il path di systemctl (`which systemctl`) e aggiungere via `sudo visudo`:
```
marco ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart trgb-backend, /usr/bin/systemctl restart trgb-frontend
```

---

## File chiave — dove trovare le cose

```
main.py                              — entry point, include tutti i router
app/services/auth_service.py         — ⚠️ MOCK USERS (da sostituire)
app/core/security.py                 — JWT + sha256_crypt (già pronto)
app/core/config.py                   — SECRET_KEY (da spostare in .env)
app/routers/admin_finance.py         — corrispettivi, prefix /admin/finance
app/routers/fe_import.py             — fatture XML, prefix /contabilita/fe
app/routers/vini_magazzino_router.py — magazzino, prefix /vini/magazzino
app/services/carta_vini_service.py   — builder HTML/PDF carta vini (NON pdf_service.py)
frontend/src/App.jsx                 — TUTTE le route React
frontend/src/config/api.js           — API_BASE url
frontend/.env.development            — http://127.0.0.1:8000
frontend/.env.production             — ⚠️ ancora HTTP (da aggiornare)
docs/roadmap.md                      — task aperti con stato verificato
docs/prompt_canvas.md                — regole operative per generare codice
docs/database.md                     — schema completo tutti i DB
```

---

## DB — mappa rapida

| Database | Moduli | Note |
|----------|--------|------|
| `app/data/vini.sqlite3` | Carta Vini + Magazzino | 1186 record; schema v2.1 |
| `app/data/vini_settings.sqlite3` | Settings carta | tipologie, nazioni, regioni, filtri |
| `app/data/foodcost.db` | FoodCost + FE XML | ingredienti, ricette, fe_fatture, fe_righe; migraz. 001-005 |
| `app/data/dipendenti.sqlite3` | Dipendenti | creato a runtime |

---

## Workflow operativo di Marco

**Macchine:**
- **Mac** — macchina principale di sviluppo, utente `underline83`, cartella `~/trgb`
- **Windows** — PC secondario, utente `mcarm`, cartella `C:\Users\mcarm\progetti\trgb`
- **VPS** — Aruba Ubuntu 22.04, IP `80.211.131.156`, utente SSH `marco`, cartella `/home/marco/trgb/trgb`

**Flusso sempre:**
1. Modifiche su Mac con Cowork/Claude
2. `git commit` + `git push` dal Mac → il VPS si aggiorna automaticamente via post-receive hook
3. Su Windows: `git pull` in VS Code

**La fonte di verità è sempre il Mac. Non modificare direttamente sul VPS o Windows.**

## Deploy — comandi utili

```bash
# ── NUOVO FLUSSO (automatico) ──────────────────────────
# Il remote su Mac punta al bare repo sul VPS:
# origin → marco@80.211.131.156:/home/marco/trgb/trgb.git

# 1. Da Mac — commit e push (il VPS si aggiorna automaticamente)
git add <file> && git commit -m "fix: #N descrizione" && git push
# → hook post-receive esegue: git checkout, pip install se serve, npm install se serve, restart servizi

# 2. Su Windows (aggiornare il remote se non fatto):
git remote set-url origin marco@80.211.131.156:/home/marco/trgb/trgb.git
git pull origin main

# ── VECCHIO FLUSSO MANUALE (fallback se hook non funziona) ─
# ssh marco@80.211.131.156
# cd /home/marco/trgb/trgb
# ./scripts/deploy.sh -b    # quick: checkout + restart servizi
# ./scripts/deploy.sh -a    # full: + pip install + npm build
# ./scripts/deploy.sh -c    # safe: + backup DB prima del deploy

# ── Setup bare repo (da eseguire UNA SOLA VOLTA sul VPS) ───
# ./scripts/setup_git_server.sh
```

---

## Aggiorna questo file a fine sessione

Sostituisci la sezione **"Cosa abbiamo fatto"** con i task completati oggi.
Aggiorna la tabella dei task se ne hai chiusi.
Aggiorna la data in cima.
