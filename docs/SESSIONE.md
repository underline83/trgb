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

1. **Aggiornato `Roadmap.md`** — riscritta con stato verificato via ispezione del codice (tag `⚠️ Confermato aperto`)
2. **Audit completo** della cartella — backend, frontend, DB, auth, route, docs
3. **Riscritta tutta la documentazione** in `docs/`:
   - Eliminati: `sistema-vini.md`, `to-do.md`, `version.json`, `promt.md`
   - Creati: `Modulo_Corrispettivi.md`, `Modulo_Dipendenti.md`, `prompt_canvas.md`, questo file
   - Aggiornati: `architettura.md`, `Index.md`, `VersionMap.md`, `changelog.md`, `readme.md`, `Modulo_Vini.md`, `Modulo_MagazzinoVini.md`, `Database_FoodCost.md`
4. **Fix deployati** (commit `9a34957`, `0d7987b`): pyxlsb, console.log debug, bug pie chart pagamenti

---

## Stato attuale del codice — cose critiche da sapere

### 🔴 AUTH È UN MOCK
`app/services/auth_service.py` riga 21 ha `USERS = {"admin": {"password": "admin", ...}}` — password in chiaro, hardcoded. **Non è auth reale.** `security.py` ha già sha256_crypt pronto, ma non è usato. `SECRET_KEY = "trgb_secret_key_2025"` è hardcoded in `config.py` (non da `.env`).

### 🔴 ENDPOINT FINANZIARI SONO PUBBLICI
`admin_finance.py`, `fe_import.py`, `foodcost_ingredients_router.py`, `foodcost_recipes_router.py`, `vini_settings_router.py` — **nessun** `Depends(get_current_user)`. Chiunque può chiamarli.

### 🟡 ROUTE FRONTEND MANCANTE
`/admin/corrispettivi/annual` — il pulsante esiste nella UI ma la route non è in `App.jsx`. L'endpoint backend `/admin/finance/stats/annual-compare` **esiste già**.

### 🟡 NESSUN INTERCEPTOR AXIOS
La gestione 401 è copiata manualmente in ~10 pagine diverse. Non c'è un interceptor centralizzato.

### 🟠 BUG PREZZO=0 CARTA VINI
In `carta_vini_service.py`, il ramo HTML usa `if prezzo:` (esclude 0), il ramo PDF usa `if prezzo not in (None, "")` (corretto). Da allineare.

### 🟠 FORCE IMPORT SENZA CHECK RUOLO
`vini_magazzino_router.py` riga ~403: commento `# per ora nessun controllo di ruolo`.

### 🟠 SLUGIFY DUPLICATA
Definita sia in `vini_router.py` che in `carta_vini_service.py`.

---

## Task aperti prioritizzati

Vai su `docs/Roadmap.md` per la lista completa con dettagli.
Ordine suggerito per lavorare:

| # | Task | Difficoltà | Impatto |
|---|------|-----------|---------|
| 6 | Aggiungere route `/annual` in `App.jsx` | Facile (15 min) | Medio |
| 11 | Fix `if prezzo:` in `carta_vini_service.py` | Facile (5 min) | Basso |
| 7 | Interceptor Axios centralizzato | Medio (1h) | Alto |
| 9 | Rimuovere `slugify` duplicata | Facile (10 min) | Basso |
| 3 | Aggiungere auth su endpoint pubblici | Medio (1-2h) | Critico |
| 1 | Sostituire mock auth con hash reali | Alto (2-3h) | Critico |

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

**Sempre su Mac** (cartella `~/trgb`, workspace Cowork selezionato):
1. Modifiche ai file con Cowork/Claude
2. `git add` + `git commit` + `git push`
3. Sul VPS: `./scripts/deploy.sh -b` (o `-a` se ci sono nuove dipendenze)
4. Su Windows: `git pull` in VS Code

**Non lavorare mai direttamente sul VPS o su Windows** — la fonte di verità è sempre il Mac.

## Deploy — comandi utili

```bash
# 1. Da Mac — commit e push
git add <file> && git commit -m "fix: #N descrizione" && git push

# 2. Sul VPS (ssh marco@80.211.131.156):
cd /home/marco/trgb/trgb
./scripts/deploy.sh -b    # quick: solo git pull + restart
./scripts/deploy.sh -a    # full: + pip install + npm build (nuove dipendenze)
./scripts/deploy.sh -c    # safe: + backup DB prima

# 3. Su Windows VS Code:
git pull

# Regola: se tocchi requirements.txt o package.json → obbligatorio -a sul VPS
```

---

## Aggiorna questo file a fine sessione

Sostituisci la sezione **"Cosa abbiamo fatto"** con i task completati oggi.
Aggiorna la tabella dei task se ne hai chiusi.
Aggiorna la data in cima.
