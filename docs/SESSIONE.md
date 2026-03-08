# 📋 TRGB — Briefing per Nuova Sessione
> File scritto da Claude a Claude. Leggilo per intero prima di iniziare a lavorare.
> **Aggiornalo alla fine di ogni sessione.**
> Ultima sessione: 2026-03-08

---

## Chi sei e dove sei

Sei l'assistente AI che lavora sul gestionale interno dell'**Osteria Tre Gobbi (Bergamo)**.
Il progetto si chiama **TRGB Gestionale** — un'app web FastAPI + React in produzione su VPS Aruba.
L'utente si chiama **Marco** (mac: `underline83`, win: `mcarm`).

La cartella di lavoro è selezionata come workspace Cowork. Puoi leggere e scrivere direttamente tutti i file del progetto.

---

## Cosa abbiamo fatto nell'ultima sessione (2026-03-08)

1. **Audit completo** — backend, frontend, DB, auth, route, docs verificati via ispezione codice
2. **Riscritta tutta la documentazione** in `docs/` (vedi changelog.md per dettagli):
   - Eliminati: `sistema-vini.md`, `to-do.md`, `version.json` (JSON non valido), `promt.md`
   - Creati: `Modulo_Corrispettivi.md`, `Modulo_Dipendenti.md`, `prompt_canvas.md`, `SESSIONE.md`
   - Aggiornati: `architettura.md`, `Index.md`, `VersionMap.md`, `changelog.md`, `readme.md`, `Modulo_Vini.md`, `Modulo_MagazzinoVini.md`, `Database_FoodCost.md`, `Roadmap.md`
3. **Fix #6** — nuova pagina `CorrispettiviAnnual.jsx` + route `/admin/corrispettivi/annual` in `App.jsx` ✅
4. **Fix #9** — rimossa `slugify` duplicata da `vini_router.py`, importata da `carta_vini_service` ✅
5. **Fix #11** — allineato `if prezzo:` → `if prezzo not in (None, "")` nel ramo HTML ✅
6. **Setup git server VPS** — creato bare repo `/home/marco/trgb/trgb.git` con post-receive hook per deploy automatico. Script `scripts/setup_git_server.sh` creato per ricreare il setup.
7. **Fix precedenti** (commit `9a34957`, `0d7987b`): pyxlsb, console.log debug, bug pie chart pagamenti

---

## Stato attuale del codice — cose critiche da sapere

### 🔴 AUTH È UN MOCK
`app/services/auth_service.py` riga 21 ha `USERS = {"admin": {"password": "admin", ...}}` — password in chiaro, hardcoded. **Non è auth reale.** `security.py` ha già sha256_crypt pronto, ma non è usato. `SECRET_KEY = "trgb_secret_key_2025"` è hardcoded in `config.py` (non da `.env`).

### 🔴 ENDPOINT FINANZIARI SONO PUBBLICI
`admin_finance.py`, `fe_import.py`, `foodcost_ingredients_router.py`, `foodcost_recipes_router.py`, `vini_settings_router.py` — **nessun** `Depends(get_current_user)`. Chiunque può chiamarli.

### 🟡 NESSUN INTERCEPTOR AXIOS
La gestione 401 è copiata manualmente in ~10 pagine diverse. Non c'è un interceptor centralizzato.

### 🟠 FORCE IMPORT SENZA CHECK RUOLO
`vini_magazzino_router.py` riga ~403: commento `# per ora nessun controllo di ruolo`.

### 🟢 COSE GIÀ FIXATE (questa sessione)
- Fix #6: route `/admin/corrispettivi/annual` aggiunta in `App.jsx` + pagina `CorrispettiviAnnual.jsx` creata ✅
- Fix #9: `slugify` deduplicata — ora importata da `carta_vini_service.py` ✅
- Fix #11: `if prezzo:` → `if prezzo not in (None, "")` nel ramo HTML carta vini ✅

---

## Task aperti prioritizzati

Vai su `docs/Roadmap.md` per la lista completa con dettagli.
Ordine suggerito per lavorare:

| # | Task | Difficoltà | Impatto |
|---|------|-----------|---------|
| ~~6~~ | ~~Route `/annual` + pagina confronto annuale~~ | ~~Facile~~ | ~~Medio~~ | ✅ |
| ~~9~~ | ~~`slugify` deduplicata~~ | ~~Facile~~ | ~~Basso~~ | ✅ |
| ~~11~~ | ~~Fix `if prezzo:` HTML preview~~ | ~~Facile~~ | ~~Basso~~ | ✅ |
| 7 | Interceptor Axios centralizzato | Medio (1h) | Alto |
| 3 | Aggiungere auth su endpoint pubblici | Medio (1-2h) | Critico |
| 1 | Sostituire mock auth con hash reali | Alto (2-3h) | Critico |

**Azione pendente (manuale su VPS):**
Aggiungere a `/etc/sudoers` tramite `sudo visudo`:
```
marco ALL=(ALL) NOPASSWD: /bin/systemctl restart trgb-backend, /bin/systemctl restart trgb-frontend
```
Senza questa riga il post-receive hook non può riavviare i servizi automaticamente.

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
docs/Roadmap.md                      — task aperti con stato verificato
docs/prompt_canvas.md                — regole operative per generare codice
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
