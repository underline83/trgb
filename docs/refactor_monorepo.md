# TRGB — Refactor Monorepo (`core/` + `locali/`)

**Data avvio piano:** 2026-04-28 (sessione 60)
**Decisione strategica:** vedi `docs/analisi_app_apple.md` §8 (multi-locale prerequisito App Store)
**Documenti correlati:** `docs/roadmap.md`, `docs/architettura_mattoni.md`, `docs/sessione.md`, `CLAUDE.md`

---

## 0. Perché stiamo facendo questo refactor

TRGB ha due obiettivi paralleli:

1. **Gestire l'osteria Tre Gobbi di Marco** — cliente zero, sempre attivo (su `trgb.tregobbi.it`).
2. **Diventare un prodotto vendibile ad altri ristoratori** — orizzonte primo cliente paying: 12 mesi minimo (2027). Dominio prodotto: **`trgb.it`** (acquistato da Marco, non ancora attivo).

Oggi il codice mescola "logica di prodotto" (gestione vini, ricette, fatture, dashboard cucina) con "personalizzazioni Tre Gobbi" (palette TRGB-02, wordmark gobbette, dominio `trgb.tregobbi.it`, dati seed con piatti piemontesi, vini reali). Senza separazione esplicita, ogni feature nuova si contamina e rendere TRGB vendibile diventa progressivamente più caro.

**Inoltre Marco vuole che TRGB sia modulare**: ogni modulo (Vini, Foodcost, Dipendenti, Prenotazioni, ecc.) deve poter essere venduto da solo. Cliente compra "solo Vini" → vede solo Vini, il resto inesistente per lui. Questo si ottiene con l'**architettura monolite modulare con feature flags per locale** (sessione R8).

**Audit del 2026-04-27 / 28:**
- 60% del codebase è già architetturalmente generico (router, modelli DB, ruoli utente, mattoni condivisi).
- Le contaminazioni TRGB sono concentrate in 5 categorie ben isolabili (vedi §1).
- Il **Modulo K** (commit `c7aaa4a`, 27/04) ha già messo gli upload utente fuori dal repo via `TRGB_UPLOADS_DIR` env var — pattern già pronto per essere generalizzato a `TRGB_LOCALE`.

**Stima totale:** 7-10 giornate di lavoro effettivo, distribuite in 8 sessioni "R" (R1-R7 + R8 modulare) deployabili una alla volta. Calendario realistico: 4-5 settimane.

**Beneficio collaterale:** disciplina forzata. Da R1 in poi, ogni feature nuova va classificata come `[core]`, `[locale:tregobbi]` o `[mixed]` e attribuita a un modulo specifico (vedi `CLAUDE.md` sezione "Architettura modulare").

---

## 1. Categorie di contaminazione TRGB (mappatura)

### A — Brand cosmetic (banale, 30min-2h)
- `frontend/src/index.css` — palette CSS vars `--trgb-red/green/blue/cream/ink/night`.
- `frontend/src/components/TrgbWordmark.jsx` — gobbette inline con colori hardcoded.
- `frontend/public/manifest.webmanifest` — `name: "TRGB Gestionale — Osteria Tre Gobbi"`, `description` con "(Bergamo)".
- `frontend/index.html` — `apple-mobile-web-app-title="TRGB"`, theme-color.
- `frontend/public/icons/` — favicon, apple-touch-icon-*.png, icon-*.png.
- `frontend/src/assets/brand/TRGB-*.svg` — gobbette, strip, varianti dark.
- 151 occorrenze di "TRGB"/"Tre Gobbi"/"tregobbi" sparse in 38+ file (audit 2026-04-28).

### B — Testi UI italiani con sapore osteria-piemontese (medio, 4-6h)
- ~40 stringhe in JSX/Python con riferimenti a "osteria", "tre gobbi", nomi sezione menu, piatti specifici.
- Email seed (`mail@tregobbi.it` se presente in futuro), nomi sezioni menu, saluto WA dipendenti.
- Brand cliente carta vini/menu: "Osteria Tre Gobbi", indirizzo Bergamo.

### C — Dati seed / dati locali (medio-alto, 8-12h)
- 12-15 migrazioni con dati TRGB-specific su 104 totali. Esempi: `099_seed_food_cost_test.py` (80 ingredienti piemontesi), `100_seed_menu_primavera_2026.py` (28 piatti specifici), `097_import_mep_templates.py`, `102_pranzo_init.py` (6 piatti dal Word di Marco), `069_macellaio_categorie.py`, `070_preventivi_menu_luoghi.py`.
- File `vini.db` — catalogo vini reali del locale.
- Static brand cliente: `static/img/logo_tregobbi.png`, `static/css/menu_pranzo_pdf.css` (Cormorant Garamond, identità osteria).

### D — Config infra / deploy (facile-medio, 2-4h)
- `push.sh` linee 19-21: `VPS_HOST="trgb"`, `VPS_DIR="/home/marco/trgb/trgb"`, `VENV="/home/marco/trgb/venv-trgb"`.
- `push.sh` linea 87: `PROBE_URL="https://trgb.tregobbi.it/"`.
- `frontend/.env.production`: `VITE_API_BASE_URL` con dominio TRGB.
- `frontend/vite.config.js`: `allowedHosts: ["app.tregobbi.it"]`.
- `app/utils/uploads.py`: `_DEFAULT_PROD_PATH = "/home/marco/trgb_uploads"` (Modulo K — già parametrizzato via env, ma default hardcoded).

### E — Business logic specifica (sorpresa: NON c'è quasi nulla)
- I ruoli (`admin, contabile, chef, sous_chef, commis, sommelier, sala, viewer`) sono uno standard ristorante italiano.
- I moduli (vini, ricette, menu pranzo, menu carta, vendite, acquisti, cassa, dipendenti, statistiche, prenotazioni, controllo gestione, cucina) sono generici per qualsiasi locale food.
- Il modello DB è schema-puro, zero TRGB-isms strutturali.
- L'unica eccezione vera sono i **dati seed**, già coperti in C.

**Conclusione:** è essenzialmente un refactor di tipo D+C+B+A. La E (la categoria che fa più male in qualsiasi refactor) è praticamente vuota. Buona notizia.

---

## 2. Struttura target

```
trgb/                                       # repo (un solo monorepo, lavoro su main)
├── core/                                   # IL PRODOTTO (90% del codice attuale)
│   ├── app/                                # backend FastAPI invariato
│   │   ├── routers/                        # tutti i 44 router
│   │   ├── moduli/                         # NEW (R8): modular boundary
│   │   ├── models/                         # 13 modelli DB
│   │   ├── services/                       # mattoni M.A-M.I (platform)
│   │   ├── platform/                       # NEW (R8): module loader, feature flags
│   │   ├── utils/
│   │   │   └── uploads.py                  # già fatto (Modulo K), generalizzato in R4
│   │   └── migrations/                     # 89 migrazioni schema-only
│   ├── frontend/                           # tutto il React: 216 file invariati
│   │   ├── src/
│   │   ├── public/
│   │   └── vite.config.js                  # legge locale config a build-time
│   └── docs/                               # documentazione di prodotto
└── locali/
    ├── trgb/                               # ISTANZA PULITA del prodotto (futuro: trgb.it)
    │   ├── locale.json                     # id="trgb", nome="TRGB", dominio="trgb.it"
    │   ├── branding.json                   # palette neutra prodotto
    │   ├── strings.json                    # nessun override (testi default core)
    │   ├── moduli_attivi.json              # NEW (R8): tutti i moduli attivi (demo completo)
    │   ├── manifest.template.json
    │   ├── assets/                         # logo TRGB neutro
    │   ├── seeds/                          # nessun seed di dati cliente
    │   ├── data/                           # vuoto / DB vuoti puliti
    │   ├── deploy/
    │   │   └── env.production              # vuoto fino al deploy reale (vedi §9)
    │   └── README.md
    ├── tregobbi/                           # IL CLIENTE ZERO (Osteria Tre Gobbi)
    │   ├── locale.json                     # id="tregobbi", nome="Osteria Tre Gobbi"
    │   ├── branding.json                   # palette TRGB-02 + gobbette
    │   ├── strings.json                    # override testi italiano-osteria
    │   ├── moduli_attivi.json              # NEW (R8): tutti i moduli attivi
    │   ├── manifest.template.json
    │   ├── assets/                         # logo+icone TRGB-02 + gobbette
    │   ├── seeds/
    │   │   └── migrations/                 # 12-15 migrazioni dati TRGB-specific
    │   ├── data/
    │   │   └── vini.db                     # catalogo vini reali (gitignored)
    │   ├── deploy/
    │   │   ├── env.production              # VPS_HOST=trgb, DOMAIN=trgb.tregobbi.it
    │   │   └── nginx.conf                  # config nginx specifica
    │   └── README.md
    └── _template/                          # scaffold pulito per locale nuovo
        ├── locale.json.template
        ├── branding.json.template
        ├── moduli_attivi.json.template
        └── README.md
```

**Path uploads (default produzione):** `/var/lib/trgb/<TRGB_LOCALE>/uploads/` (override via `TRGB_UPLOADS_DIR` env).

**Build:** separato per locale.
- Frontend: `TRGB_LOCALE=tregobbi npm run build` per la sua osteria, `TRGB_LOCALE=trgb npm run build` per l'istanza pulita.
- Backend: `TRGB_LOCALE=tregobbi python main.py`.
- Default `TRGB_LOCALE=tregobbi` per non rompere il workflow attuale di Marco.

---

## 3. Le 8 sessioni R

Ogni sessione: cosa, file toccati, commit message proposto, verifica post-push, rischi.

### R1 — Scaffolding `locali/tregobbi/` + `locali/trgb/` + env `TRGB_LOCALE`
**Effort:** 1-2 ore. **Rischio:** zero.

**Cosa:**
- Crea cartelle `locali/tregobbi/`, `locali/trgb/`, `locali/_template/` con README ciascuna.
- Crea `locali/tregobbi/locale.json` con `{id: "tregobbi", nome: "Osteria Tre Gobbi", dominio: "trgb.tregobbi.it", lingua: "it-IT", timezone: "Europe/Rome"}`.
- Crea `locali/trgb/locale.json` con `{id: "trgb", nome: "TRGB", dominio: "trgb.it", lingua: "it-IT", timezone: "Europe/Rome"}` (placeholder fino a R2).
- Aggiunge in `main.py` lettura env `TRGB_LOCALE` (default `"tregobbi"`), espone in `/system/info` come `{locale: "tregobbi"}`.
- Aggiunge in `frontend/vite.config.js` lettura env `VITE_TRGB_LOCALE` per il build.
- **Niente sposta**, niente modifica funzionale.

**File toccati:**
- nuovi: `locali/{tregobbi,trgb,_template}/{locale.json,README.md}`
- modificati: `main.py` (4 righe), `frontend/vite.config.js` (3 righe), `.gitignore` (esclude `locali/*/data/*`)

**Commit:** `[core] R1 — scaffolding locali/{tregobbi,trgb,_template}/ + lettura TRGB_LOCALE (no behavior change)`

**Verifica post-push:**
- Server riparte normale, `GET /system/info` ritorna `{locale: "tregobbi"}`.
- L'osteria continua a usare l'app come sempre.

**Rischi:** quasi nulli. Eventuale fix se `vite.config.js` rompe il build.

---

### R2 — Branding centralizzato in `branding.json` + Splash iOS
**Effort:** 3-4 ore. **Rischio:** medio (tocca CSS e UI principali).

**Cosa:**
- Crea `locali/tregobbi/branding.json` con palette completa TRGB-02, paths logo/wordmark, font, theme-color.
- Crea `locali/trgb/branding.json` con **palette neutra prodotto** (es. blu professionale, no gobbette, wordmark "TRGB" neutro).
- Crea `locali/<id>/manifest.template.json` (con placeholders per build).
- Sposta gli SVG/PNG da `frontend/src/assets/brand/` e `frontend/public/icons/` in `locali/tregobbi/assets/` (con copia, non move-only, fino a R7).
- Crea per `locali/trgb/assets/` un set minimale di icone TRGB neutro (placeholder o generato).
- **Splash screens iOS** completi (matrice immagini per ogni device) finiscono in `locali/tregobbi/assets/splash/` — la PWA Fase 0 si chiude qui.
- Backend: nuovo endpoint `GET /locale/branding.json` che ritorna il file (cached).
- Frontend: helper `loadBrandConfig()` che legge il JSON al boot e popola le CSS vars dinamicamente.
- Build script: `core/scripts/build_manifest.py` genera `frontend/public/manifest.webmanifest` da template + locale.json + branding.json.
- Mantieni alias `:root --trgb-*` per compatibilità con codice esistente (lo si rimuove in R7).

**File toccati:**
- nuovi: `locali/{tregobbi,trgb}/{branding.json,manifest.template.json,assets/*}`
- modificati: `frontend/src/index.css`, `frontend/src/main.jsx` (loadBrandConfig), `frontend/index.html`, `main.py` (endpoint locale), `core/scripts/build_manifest.py` (nuovo)

**Commit:** `[mixed] R2 — branding locale-driven + splash iOS in locali/<id>/branding.json`

**Verifica post-push:**
- Pagina principale: palette identica, wordmark identico, favicon identica.
- Console DevTools: nessun warning su CSS vars mancanti.
- iPad: aggiungi a Home funziona, splash e icona corretti.
- Dev locale `TRGB_LOCALE=trgb npm run dev` fa partire l'app con palette neutra ⇒ **prima vista delle 2 istanze affiancate**.

**Rischi:** se `loadBrandConfig()` fallisce, l'app potrebbe partire senza colori. Mitigazione: fallback a CSS vars hardcoded come "boot-default" finché il fetch non risolve.

---

### R3 — Seed migrations isolate in `locali/tregobbi/seeds/`
**Effort:** 2-3 ore. **Rischio:** medio (tocca migration_runner).

**Cosa:**
- Identifica le 12-15 migrazioni con dati TRGB-specific (lista in `locali/tregobbi/seeds/MIGRATIONS_TRGB.md`).
- **Non sposta i file** (in R3): aggiunge una flag `TRGB_SPECIFIC = True` in cima a ogni migration interessata.
- Esteso `app/migrations/migration_runner.py`: legge flag, e se `TRGB_LOCALE != "tregobbi"`, salta le migrazioni con la flag (logga "skipping TRGB-specific migration").
- A R7 si valuterà se **spostare fisicamente** i file in `locali/tregobbi/seeds/migrations/`.

**File toccati:**
- nuovi: `locali/tregobbi/seeds/MIGRATIONS_TRGB.md` (lista + razionale per ogni file marcato)
- modificati: 12-15 file in `app/migrations/0NN_*.py` (1 riga ciascuno: `TRGB_SPECIFIC = True`)
- modificato: `app/migrations/migration_runner.py` (10-20 righe)

**Commit:** `[core] R3 — flag TRGB_SPECIFIC su seed migrations + runner locale-aware`

**Verifica post-push:**
- Boot del backend osteria: log `migration_runner — esecuzione N migrazioni per locale 'tregobbi' (M skipped)` ma `M=0` perché tregobbi vuole tutte.
- Boot del backend istanza pulita (`TRGB_LOCALE=trgb`): log mostra `M skipped` con M = numero migrazioni TRGB-specific.
- DB del VPS osteria invariato (tutte le migrazioni TRGB sono già girate, idempotenti).

**Rischi:** se classifichiamo male una migrazione (la marchiamo TRGB ma è schema-puro), un domani il locale nuovo non riceve quello schema. Mitigazione: review attenta della lista in `MIGRATIONS_TRGB.md` con motivazione per ogni file marcato.

---

### R4 — `push.sh` locale-aware + `locali/<id>/deploy/env.production`
**Effort:** 1-2 ore. **Rischio:** basso (tocca solo bash + uploads.py).

**Cosa:**
- Crea `locali/tregobbi/deploy/env.production` con: `VPS_HOST=trgb`, `VPS_DIR=/home/marco/trgb/trgb`, `VENV=/home/marco/trgb/venv-trgb`, `DOMAIN=trgb.tregobbi.it`, `PROBE_URL=https://trgb.tregobbi.it/`, `TRGB_LOCALE=tregobbi`, `BACKEND_SERVICE=trgb-backend`, `FRONTEND_SERVICE=trgb-frontend`, `TRGB_UPLOADS_DIR=/home/marco/trgb_uploads`.
- Crea `locali/_template/deploy/env.production.template` come scaffold.
- `push.sh` accetta flag `-l <locale_id>` (default `tregobbi`). Sourceia `locali/$TRGB_LOCALE/deploy/env.production`.
- Sostituisce le costanti hardcoded in cima allo script con le variabili lette dall'env.
- Per il caso classico `./push.sh "msg"` resta tutto identico (default = tregobbi).
- Per cliente nuovo: `./push.sh -l cliente_pinco "msg"`.
- Estende `app/utils/uploads.py` per costruire path da `TRGB_LOCALE` se `TRGB_UPLOADS_DIR` non override (default produzione: `/var/lib/trgb/<TRGB_LOCALE>/uploads`).

**File toccati:**
- nuovi: `locali/tregobbi/deploy/env.production`, `locali/_template/deploy/env.production.template`
- modificati: `push.sh` (15-30 righe), `app/utils/uploads.py` (default path locale-aware)

**Commit:** `[core] R4 — push.sh -l locale + locali/<id>/deploy/env.production + uploads.py locale-aware`

**Verifica post-push:**
- `./push.sh "test"` deploya sul VPS Marco esattamente come prima.
- `./push.sh -l tregobbi "test"` idem.
- Probe HTTP, sync DB, restart, tutto identico.

**Rischi:** se `source` di env.production fallisce, push.sh esce con errore. Mitigazione: check esistenza file all'inizio + fallback ai vecchi default per il locale `tregobbi`.

---

### R5 — Testi UI italiani in `locali/tregobbi/strings.json`
**Effort:** 3-4 ore. **Rischio:** medio-alto (tocca ~40 file FE/BE).

**Cosa:**
- Crea `locali/tregobbi/strings.json` con override per stringhe specifiche-osteria (formato chiave-valore piatto, no nesting profondo).
- Crea `locali/trgb/strings.json` vuoto (l'istanza pulita usa i fallback in italiano generico).
- Crea helper `frontend/src/utils/localeStrings.js` con `t(key, fallback)` che legge dal JSON.
- Identifica le stringhe hardcoded "Osteria Tre Gobbi", "Bergamo", saluto WA, sezioni menu, ecc.
- Sostituisce ogni stringa con `t("nome_chiave", "stringa di default")`.
- La stringa di default rimane in codice come fallback se `strings.json` non ha override per quella chiave.

**File toccati:**
- nuovi: `locali/tregobbi/strings.json`, `locali/trgb/strings.json`, `frontend/src/utils/localeStrings.js`, `app/utils/locale_strings.py`
- modificati: ~30-40 file JSX/Python con stringhe TRGB-specific

**Commit:** `[mixed] R5 — override testi UI in locali/<id>/strings.json + helper t()`

**Verifica post-push:**
- Tutte le pagine osteria hanno gli stessi testi che avevano prima.
- Su `TRGB_LOCALE=trgb` l'app gira con i fallback in italiano generico.

**Rischi:** dimenticare una stringa o introdurre regressioni grafiche (allineamento se la stringa cambia). Mitigazione: lista esaustiva in `locali/tregobbi/strings.json` + grep finale `grep -rn "Tre Gobbi\|tregobbi" core/` deve tornare zero.

---

### R6 — Dati TRGB in `locali/tregobbi/data/`
**Effort:** 1 ora. **Rischio:** basso.

**Cosa:**
- Sposta `vini.db` (catalogo vini reali Marco) in `locali/tregobbi/data/vini.db` (gitignored come tutti i DB).
- Aggiorna lookup path in `app/models/vini_db.py` o `app/core/database.py`: cerca prima `locali/$TRGB_LOCALE/data/<file>`, fallback a `app/data/<file>`.
- Eventuali altri file dati TRGB (se ci sono) vanno qui.
- I 9 DB SQLite operativi (`foodcost.db`, `vini_magazzino.sqlite3`, `dipendenti.sqlite3`, ecc.) **NON si toccano** — restano in `app/data/`. Sono dati runtime del locale attivo, non dati versionati.

**File toccati:**
- nuovo path: `locali/tregobbi/data/vini.db`
- modificati: 1-2 file lookup path

**Commit:** `[locale:tregobbi] R6 — dati TRGB-specific in locali/tregobbi/data/`

**Verifica post-push:**
- Carta vini, magazzino, prezzi: tutto come prima.

**Rischi:** se il lookup fallisce, l'endpoint vini ritorna empty. Mitigazione: fallback path doppio + log esplicito al boot.

---

### R7 — Cleanup, docs, scaffold `locali/_template/`
**Effort:** 1-2 ore. **Rischio:** zero (cleanup).

**Cosa:**
- Rimuove gli alias temporanei introdotti in R2 (CSS vars `:root --trgb-*` ridondanti se non più usate).
- Verifica che `grep -rn "Tre Gobbi\|tregobbi" core/` torni 0 (nessuna contaminazione residua).
- Completa `locali/_template/` con tutti i file scaffold pronti per il primo cliente nuovo.
- Crea `docs/architettura_locale.md` con la spiegazione completa del modello.
- Aggiorna `docs/architettura_pattern.md` con sezione "core/ vs locali/<id>/".
- Aggiorna `roadmap.md`: chiude R1-R7 in sezione 0, marca R8 come prossimo.

**File toccati:**
- modificati: `frontend/src/index.css`, `docs/roadmap.md`, `docs/architettura_pattern.md`
- nuovi: `docs/architettura_locale.md`, `locali/_template/*` completati

**Commit:** `[core] R7 — cleanup finale + docs + scaffold locali/_template/`

**Verifica post-push:**
- `grep -rn "TRGB\|Tre Gobbi" core/` ritorna 0 (o solo commenti storici).
- Test "creare un locale fittizio": `cp -r locali/_template locali/test_demo`, modifica nome+colori, build con `TRGB_LOCALE=test_demo`, verifica che l'app cambi look.

**Rischi:** zero, è solo polish.

---

### R8 — Architettura modulare con feature flags per locale
**Effort:** 2-3 giornate. **Rischio:** medio-alto (tocca module loader + UI menu).

**Cosa:**
Implementa il monolite modulare. Ogni modulo TRGB diventa accendibile/spegnibile per locale via `moduli_attivi.json`.

- Definisce `core/moduli/<id>/module.json` per ogni modulo (manifesto: id, nome, versione, dipendenze platform, dipendenze opzionali, tabelle DB, endpoint prefix, frontend route). Mappa attuale dei moduli vendibili:

  | id | Nome utente | Tabelle DB principali | Endpoint prefix |
  |----|-------------|----------------------|-----------------|
  | `vini` | Cantina Vini | vini_magazzino, vini_settings, ... | /vini |
  | `ricette` | Ricette / Foodcost | ricette, ingredienti, ... | /ricette |
  | `acquisti` | Acquisti / Fatture | fe_fatture, fe_righe, ... | /acquisti |
  | `controllo_gestione` | Controllo Gestione | cg_uscite, cg_entrate, ... | /cg |
  | `banca` | Banca / Flussi Cassa | banca_movimenti, ... | /banca |
  | `dipendenti` | Dipendenti / Turni / Buste paga | dipendenti, turni, ... | /dipendenti |
  | `prenotazioni` | Prenotazioni | prenotazioni, ... | /prenotazioni |
  | `clienti` | Clienti CRM | clienti, ... | /clienti |
  | `cassa` | Cassa / Chiusure | chiusure_turno, ... | /cassa |
  | `menu_carta` | Menu Carta + Pranzo + PDF | menu_carta_*, pranzo_* | /menu-carta, /pranzo |
  | `cucina` | Cucina (Dashboard, Spesa, HACCP) | cucina_*, lista_spesa_* | /cucina, /tasks/haccp |
  | `task_manager` | Task Manager / HACCP loop | tasks, haccp_*, ... | /tasks |
  | `statistiche` | Statistiche (cross-modulo) | — | /statistiche |

  Più la **platform** (sempre inclusa, non vendibile da sola): auth, utenti, M.A notifiche, M.B PDF, M.C WA, M.D email, M.E calendar, M.F alert, M.G permessi, M.H import, M.I UI primitives.

- Scrive `core/app/platform/module_loader.py` che al boot legge `locali/$TRGB_LOCALE/moduli_attivi.json` e monta solo i router dei moduli dichiarati attivi.
- Scrive `frontend/src/config/moduleLoader.js` che nasconde voci menu (modulesMenu.js) non attive.
- Riorganizza eventualmente le 104 migrazioni in cartelle per modulo (`core/app/migrations/<modulo>/`), runner skippa moduli non attivi.
- Default backward-compat: se `moduli_attivi.json` manca o vuoto, attiva tutto (per Tre Gobbi non cambia nulla).
- Crea `locali/tregobbi/moduli_attivi.json` = `{moduli: ["*"]}` (tutti).
- Crea `locali/trgb/moduli_attivi.json` = `{moduli: ["*"]}` (tutti, demo completo).

**File toccati:**
- nuovi: `core/app/platform/module_loader.py`, `core/moduli/<id>/module.json` (×13), `frontend/src/config/moduleLoader.js`, `locali/<id>/moduli_attivi.json`
- modificati: `main.py` (router mount via loader), `frontend/src/config/modulesMenu.js` (filtra via loader), `app/migrations/migration_runner.py`

**Commit:** `[core] R8 — monolite modulare con feature flags per locale (module_loader)`

**Verifica post-push:**
- Boot del backend osteria: log `module_loader — moduli attivi: vini, ricette, acquisti, ...` (tutti 13).
- Test: in `locali/test_demo/moduli_attivi.json` mettiamo `{moduli: ["vini", "cassa"]}`, build con `TRGB_LOCALE=test_demo`, verifichiamo che il menu mostri SOLO Vini e Cassa.

**Rischi:** se il loader sbaglia a montare un router, una pagina si rompe. Mitigazione: test esaustivo modulo-per-modulo prima del push, default "tutti attivi" non rompe l'osteria.

---

## 4. Calendario indicativo

| Settimana | Sessione | Sviluppo normale parallelo |
|-----------|----------|----------------------------|
| 1 | R1 (lun) + R2 (gio) | Bug fix + ritocchi OK |
| 2 | R3 (mar) + R4 (gio) | Bug fix + features piccole OK |
| 3 | R5 (lun-mar, 2 sessioni) | Meglio fermare features grosse |
| 4 | R6 (mar) + R7 (ven) | Tutto torna normale |
| 5 | R8 (lun-mar-mer, 2-3 sessioni) | Bug fix piccoli OK |

Marco lavora a sessioni concentrate quando l'osteria glielo permette. Il calendario sopra è indicativo: ogni sessione R può essere posticipata senza danni se Marco ha lavoro urgente sull'osteria.

---

## 5. Regole operative durante il refactor

Vedi `CLAUDE.md` sezione "Refactor monorepo — gestione operativa" e "Architettura modulare". Riassunto:

1. **Ogni sessione R = un PR-mentale (un push deployabile, indipendente).** Niente "branch refactor lungo".
2. **Bug fix urgenti hanno SEMPRE precedenza.** Si ferma R, si fixa il bug nel codice corrente, si pusha, si riprende R.
3. **Una sessione = una direzione.** O R o feature/bug. Mai mischiare nello stesso commit.
4. **Disciplina core/ vs locali/<id>/.** Da R1 in poi, ogni nuova feature va classificata in commit message: `[core]`, `[locale:tregobbi]`, `[mixed]`. Se non sai, chiedi a Marco.
5. **Disciplina modulare.** Da R8 (e già da oggi nelle 5 regole CLAUDE.md), ogni feature appartiene a UN modulo dichiarato. Niente import diretti tra router di moduli diversi.
6. **Mai rimuovere file in modo distruttivo.** Si copia con alias temporaneo prima, si verifica, poi in R7 si pulisce.
7. **Migrazioni DB durante R: solo idempotenti, solo additive.** Niente DROP, niente RENAME su DB live.
8. **`/guardiano push` per ogni sessione R.** Pre-audit + push.sh + post-audit + update docs (sessione.md, changelog.md, refactor_monorepo.md questo file §6).

---

## 6. Stato corrente del piano

| Sessione | Stato | Data | Commit | Note |
|----------|-------|------|--------|------|
| R1 | ✅ FATTO | 2026-04-28 | `8876603` | Scaffolding `locali/{tregobbi,trgb,_template}/` + `TRGB_LOCALE` + `/system/info` + `VITE_TRGB_LOCALE` + `.gitignore`. Verifica: endpoint risponde `{"locale":"tregobbi"}`, banner nei log, backend OK. |
| R2 | ✅ FATTO | 2026-04-29 | `753019a` | Branding tenant-aware completo: `locali/<id>/branding.json` + endpoint `GET /locale/branding.json` + `loadBrandConfig()` + hook `useBranding()` + collab marker `TRGB × <tagline>` in Home. Disciplina applicata: palette+asset TRGB-02 in `locali/trgb/` (branding prodotto), tregobbi eredita + override solo tagline/pwa.name/client_pdf. Splash iOS pre-generati in `TRGB-02-final.zip` da integrare in commit dedicato. |
| R3 | ✅ FATTO | 2026-04-29 | `503c88f` | `migration_runner.py` v1.3-locale-aware (`_is_trgb_specific()` + skip su `TRGB_LOCALE != "tregobbi"`). Flag `TRGB_SPECIFIC = True` sulle 3 migrazioni seed (097 MEP templates, 099 food_cost, 100 menu_primavera). Doc `locali/tregobbi/seeds/MIGRATIONS_TRGB.md` con razionale + criterio per marcature future. Zero behavior change su tregobbi (le 3 mig erano già in schema_migrations). |
| R4 | ✅ FATTO | 2026-04-29 | `f200781` + `77b3430` | `push.sh -l <locale>` (default tregobbi) + source `locali/<id>/deploy/env.production` per tregobbi/trgb/_template. `app/utils/uploads.py` v1.1 locale-aware (tregobbi → path storico, altri locali → `/home/marco/trgb_uploads_<id>`). Banner locale corrente al boot di push.sh. Follow-up `77b3430`: file `VERSION` come single source of truth (versione prodotto allineata frontend↔backend), commit hash dinamico in `/system/info` (no più "2025.12-web" stantio), CLAUDE.md sezione "Versioning prodotto". |
| R5 | ✅ FATTO | 2026-04-29 | `ba46536` | Locale strings tenant-aware: helper `t(key, fallback)` BE (`app/utils/locale_strings.py`) + FE (`frontend/src/utils/localeStrings.js`) + endpoint `GET /locale/strings.json` + `locali/{tregobbi,trgb,_template}/strings.json`. 18 stringhe TRGB-specific sostituite in 9 file FE/BE: PDF brand (`pdf_brand.py`, templates Jinja2), DOCX export (carta vini + bevande), WA templates (Proxy getter dinamico in `whatsapp.js`), page titles (`CartaClienti`, `CartaStaff`, `RicetteSettings`), banca subtitle, brand turni HTML, brand carta vini HTML inline. Boot frontend carica strings parallelo a branding. |
| R6 | DA FARE | — | — | vini.db in locali/tregobbi/data/ |
| R7 | DA FARE | — | — | Cleanup + docs + _template |
| R8 | DA FARE | — | — | Architettura modulare + feature flags |

A fine di ogni R, aggiornare questa tabella con stato `✅ FATTO`, data, hash commit, eventuali note.

---

## 7. Decisioni chiuse (a riferimento storico)

Tutte le decisioni di architettura/naming sono chiuse al 2026-04-28:

| Decisione | Risolta come |
|-----------|--------------|
| Strategia (monorepo vs multi-tenant SaaS vs due repo) | Monorepo isolato (questa scelta) |
| Nome cartella codice prodotto | `core/` |
| Nome cartella installazioni | `locali/` |
| Nome subfolder osteria Marco | `locali/tregobbi/` |
| Nome subfolder istanza pulita prodotto | `locali/trgb/` |
| Dominio prodotto | `trgb.it` (acquistato da Marco) |
| Dominio osteria | `trgb.tregobbi.it` (resta come oggi) |
| Env var locale | `TRGB_LOCALE=tregobbi` |
| Tag commit | `[core]`, `[locale:tregobbi]`, `[mixed]` |
| Path uploads default produzione | `/var/lib/trgb/<TRGB_LOCALE>/uploads` |
| Build separato o runtime | Build separato per locale (`TRGB_LOCALE=<id> npm run build`) |
| Splash iOS PWA | Parte di R2 (insieme al branding tenant-aware) |
| Scaffold `locali/_template/` | Minimo R1, completo R7 |
| Strategia work | Cartella unica con commit incrementali su `main` (no worktree) |
| Architettura modulare | Monolite modulare con feature flags per locale (R8) |
| Demo navigabile online | Decidiamo dove deployarla quando arriviamo a R4 (vedi §9) |

---

## 8. Riferimenti

- Decisione strategica originale: conversazione 2026-04-27 con Claude (memoria `project_strategia_prodotto_vendibile.md`).
- Audit codebase: questo file §1, basato su scansione 2026-04-28.
- Roadmap mobile (PWA → Capacitor → eventuale SwiftUI): `docs/analisi_app_apple.md`.
- Modulo K (uploads fuori repo, primo passo già fatto): commit `c7aaa4a` (2026-04-27).
- Architettura mattoni TRGB: `docs/architettura_mattoni.md`.
- Pattern uniformi codice: `docs/architettura_pattern.md`.
- Disciplina codice modulare: `CLAUDE.md` sezione "Architettura modulare".

---

## 9. Demo navigabile in parallelo

Marco vuole vedere 2 istanze affiancate (osteria + pulita). La progressione concreta:

**Tappa 1 — dopo R1 (1-2h):** sul Mac di Marco, in dev mode, può fare `TRGB_LOCALE=trgb npm run dev` su porta diversa. Differenza solo nei log e nel campo `/system/info`. Nessuna differenza visiva ancora.

**Tappa 2 — dopo R2 (4-6h totali):** dev mode su porta diversa con palette diversa. **Le 2 istanze affiancate diventano visivamente distinte sul Mac**.

**Tappa 3 — dopo R4 (8-12h totali):** deploy della seconda istanza online. Decidiamo al momento dove:
- Opzione preferenziale: su `trgb.it` (se il dominio è già attivo + DNS + cert SSL) come istanza ufficiale del prodotto
- Opzione fallback: su `demo.tregobbi.it` o `pulito.tregobbi.it` come deploy temporaneo, da migrare a `trgb.it` quando pronto

Implementazione: secondo servizio systemd (`trgb-backend-trgb` su porta diversa), secondo `trgb-frontend-trgb`, secondo nginx vhost con cert Let's Encrypt (gratis), secondo set di DB SQLite vuoti, login separato. Costo zero ricorrente, stesso VPS.

**Tappa 4 — dopo R8:** la demo `locali/trgb/` può attivare/disattivare moduli per dimostrare a clienti potenziali la versione "completa" o "solo Vini" o qualsiasi combinazione, senza redeploy.

---

*Fine piano. Da aggiornare a chiusura di ogni sessione R con stato (§6) e note operative (§5).*
