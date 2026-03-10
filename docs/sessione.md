# 📋 TRGB — Briefing per Nuova Sessione
> File scritto da Claude a Claude. Leggilo per intero prima di iniziare a lavorare.
> **Aggiornalo alla fine di ogni sessione.**
> Ultima sessione: 2026-03-10

---

## Chi sei e dove sei

Sei l'assistente AI che lavora sul gestionale interno dell'**Osteria Tre Gobbi (Bergamo)**.
Il progetto si chiama **TRGB Gestionale** — un'app web FastAPI + React in produzione su VPS Aruba.
L'utente si chiama **Marco** (mac: `underline83`, win: `mcarm`).

La cartella di lavoro è selezionata come workspace Cowork. Puoi leggere e scrivere direttamente tutti i file del progetto.

---

## Cosa abbiamo fatto nell'ultima sessione (2026-03-10)

### Riorganizzazione menu Cantina + fix PDF + Impostazioni Carta (v2026.03.10c)
1. **Menu Cantina semplificato** — ora 3 voci + admin: Cantina, Nuovo vino, Genera Carta PDF + (admin) Strumenti
2. **"Genera Carta PDF" nel submenu** — bottone diretto che scarica il PDF senza pagine intermedie
3. **Registro Movimenti + Modifica Massiva** spostati dentro Strumenti (pulsanti rapidi in cima)
4. **Fix PDF cantina** — corretto frontespizio: classi CSS (`front-logo`, `front-title`, `front-subtitle`), wrapper `carta-body`, `base_url`, caricamento CSS → ora identico al vecchio sistema
5. **Impostazioni Ordinamento Carta in Strumenti** — UI per riordinare tipologie, nazioni, regioni (con frecce ▲▼) e configurare filtri carta (qta minima, mostra negativi, mostra senza prezzo). Usa le API `/settings/vini/*` già esistenti.
6. **CantinaTools.jsx v2.0** — riscritto con 4 sezioni: Sync, Import/Export, Genera Carta (HTML+PDF+Word), Impostazioni Ordinamento

### Strumenti Cantina: ponte Excel ↔ Cantina + Genera Carta (v2026.03.10b)
1. **Nuovo router `vini_cantina_tools_router.py`** — 6 endpoint backend:
   - `POST /sync-from-excel` → sincronizza vini.sqlite3 → cantina (upsert: anagrafica aggiornata, giacenze intatte per vini esistenti)
   - `POST /import-excel` → import diretto Excel → cantina (senza passare dal vecchio DB)
   - `GET /export-excel` → esporta cantina in .xlsx compatibile con Excel storico
   - `GET /carta-cantina` → genera carta HTML dal DB cantina
   - `GET /carta-cantina/pdf` → genera PDF carta dal DB cantina
   - `GET /carta-cantina/docx` → genera DOCX carta dal DB cantina
2. **Nuovo: `CantinaTools.jsx`** — pagina frontend admin-only con 3 sezioni: Sync, Import/Export, Genera Carta
3. **Colonna ORIGINE** in `vini_magazzino` — flag 'EXCEL' o 'MANUALE' per tracciare provenienza
4. **Auth via query token** per endpoint di download (PDF/DOCX/Export usano `?token=...`)
5. **Route + SubMenu** — `/vini/magazzino/tools`, link "🔧 Strumenti" (admin only)

### Reforming completo modulo vini (stesso giorno, prima sessione)
1. **ViniMenu.jsx** — da 6 a 5 voci: rimossa "Movimenti Cantina" (orfana), rinominato "Magazzino Vini" → "🍷 Cantina"
2. **MagazzinoSubMenu.jsx** — semplificato da 6 a 6 pulsanti: Cantina, Nuovo vino + admin-only: Registro movimenti, Modifica massiva, Strumenti
3. **App.jsx** — rimosse route orfane `/vini/movimenti` e `/vini/magazzino/:id/movimenti`
4. **MagazzinoViniDettaglio.jsx** — fix layout form movimenti (grid 5→4 colonne), emoji nei tipi, bottone "← Cantina"
5. **MagazzinoVini.jsx** — titolo → "Cantina", aggiunto bottone "✕ Pulisci filtri"
6. **DashboardVini.jsx** — aggiornati pulsanti accesso rapido (+ Vendite, fix link Impostazioni `/vini/settings`, rinominato Cantina)
7. **Nuovo: RegistroMovimenti.jsx** — pagina admin-only log globale movimenti cantina, filtri tipo/testo/date, paginazione 50/pagina

### Sessione precedente (2026-03-09)
1. **Hub Vendite** — `ViniVendite.jsx` riscritta: toggle Bottiglia/Calici, autocomplete vini, storico filtrato VENDITA, KPI
2. **Locazione obbligatoria** — `registra_movimento()` aggiorna QTA_<LOC>, validazione giacenza insufficiente (HTTP 400)
3. **Nomi locazioni dinamici** — dropdown con nomi reali per vino + quantità disponibili
4. **Admin bulk edit** — `MagazzinoAdmin.jsx`: tabella 21 colonne, filtri, salvataggio bulk, delete per riga (admin only)
5. **Endpoint backend** — `bulk_update_vini()`, `delete_vino()`, `list_movimenti_globali()`, `search_vini_autocomplete()`

---

## Cosa abbiamo fatto nelle sessioni precedenti (2026-03-08/09)

1. **Fix #1 — Auth reale** — `auth_service.py` riscritto: password hashate sha256_crypt, `security.verify_password()` ✅
2. **SECRET_KEY da .env** — `python-dotenv`, `load_dotenv()`, `.env` gitignored ✅
3. **Audit completo** — backend, frontend, DB, auth, route, docs verificati
4. **Documentazione consolidata** — da 18 a 13 file
5. **Setup git server VPS** — bare repo + post-receive hook deploy automatico
6. **Fix #6/#7/#9/#11** — route annual, apiFetch centralizzato, slugify, prezzo carta ✅
7. **Fix #3** — `Depends(get_current_user)` su 5 router pubblici ✅

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

### 🟢 Modulo Vini — struttura attuale dopo reforming
**Menu principale** (`ViniMenu.jsx`): 5 voci — Carta dei Vini, Vendite, Cantina, Dashboard, Impostazioni
**Submenu Cantina** (`MagazzinoSubMenu.jsx`): Cantina · Nuovo vino · Genera Carta PDF (download diretto) · (admin) Strumenti
**Strumenti** (`CantinaTools.jsx` v2.0): Registro Movimenti + Modifica Massiva (pulsanti rapidi) · Sync Excel → Cantina · Import/Export Excel · Genera Carta (HTML+PDF+Word) · Impostazioni Ordinamento Carta (tipologie, nazioni, regioni, filtri)
**Route attive**:
- `/vini` → ViniMenu
- `/vini/carta` → ViniCarta (NON TOCCARE — paracadute Excel)
- `/vini/vendite` → ViniVendite (Bottiglia/Calici)
- `/vini/settings` → ViniImpostazioni
- `/vini/dashboard` → DashboardVini
- `/vini/magazzino` → MagazzinoVini (lista cantina)
- `/vini/magazzino/nuovo` → MagazzinoViniNuovo
- `/vini/magazzino/admin` → MagazzinoAdmin (bulk edit, admin only)
- `/vini/magazzino/registro` → RegistroMovimenti (log globale, admin only)
- `/vini/magazzino/tools` → CantinaTools (sync/import/export/genera carta, admin only)
- `/vini/magazzino/:id` → MagazzinoViniDettaglio (scheda vino con movimenti + note)

**Route eliminate**: `/vini/movimenti`, `/vini/magazzino/:id/movimenti` (movimenti ora solo dalla scheda vino)
**File dead code**: `MovimentiCantina.jsx` — non più importato né raggiungibile, da eliminare quando si vuole

### 🟢 Sistema movimenti e locazioni
- Locazione **obbligatoria** per VENDITA e SCARICO (backend + frontend)
- Backend valida giacenza insufficiente → HTTP 400
- Vendite taggate `[BOTTIGLIA]` o `[CALICI]` nel campo note
- Locazioni con nomi dinamici per vino (FRIGORIFERO, LOCAZIONE_1/2/3)
- Costanti: `LOCAZIONI_VALIDE`, `LOCAZIONE_TO_COLUMN` in `vini_magazzino_db.py`

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
app/services/auth_service.py         — auth con password hashate sha256_crypt
app/core/security.py                 — JWT + sha256_crypt
app/core/config.py                   — SECRET_KEY (da .env)
app/routers/vini_magazzino_router.py — magazzino vini, prefix /vini/magazzino
app/models/vini_magazzino_db.py      — DB module vini: CRUD, movimenti, bulk, autocomplete
app/services/carta_vini_service.py   — builder HTML/PDF carta vini
frontend/src/App.jsx                 — TUTTE le route React
frontend/src/config/api.js           — API_BASE url + apiFetch() con gestione 401
frontend/src/pages/vini/ViniMenu.jsx          — menu principale modulo vini
frontend/src/pages/vini/ViniVendite.jsx       — vendite bottiglia/calici
frontend/src/pages/vini/MagazzinoVini.jsx     — lista cantina con filtri
frontend/src/pages/vini/MagazzinoViniDettaglio.jsx — scheda vino (anagrafica+giacenze+movimenti+note)
frontend/src/pages/vini/MagazzinoAdmin.jsx    — modifica massiva (admin)
frontend/src/pages/vini/RegistroMovimenti.jsx — log globale movimenti (admin)
frontend/src/pages/vini/CantinaTools.jsx     — strumenti sync/import/export/carta (admin)
frontend/src/components/vini/MagazzinoSubMenu.jsx — submenu cantina
app/routers/vini_cantina_tools_router.py     — router strumenti cantina (6 endpoint)
docs/changelog.md                    — changelog formato Keep a Changelog
docs/roadmap.md                      — task aperti
docs/prompt_canvas.md                — regole operative per generare codice
docs/database.md                     — schema completo tutti i DB
```

---

## DB — mappa rapida

| Database | Moduli | Note |
|----------|--------|------|
| `app/data/vini.sqlite3` | Carta Vini (legacy Excel) | NON TOCCARE — paracadute; schema v2.1 |
| `app/data/vini_magazzino.sqlite3` | Cantina (DB moderno) | vini_magazzino + movimenti + note; colonna ORIGINE |
| `app/data/vini_settings.sqlite3` | Settings carta | tipologie, nazioni, regioni, filtri (usati da entrambi i generatori carta) |
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
