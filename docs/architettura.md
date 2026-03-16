# TRGB Gestionale — Architettura Tecnica
**Ultimo aggiornamento:** 2026-03-16

---

# 1. Panorama generale

TRGB Gestionale e' il sistema interno dell'Osteria Tre Gobbi (Bergamo). E' composto da:

- **Backend:** FastAPI (Python 3.12), autenticazione JWT con PIN, SQLite multipli
- **Frontend:** React 18 + Vite + TailwindCSS
- **Database:** SQLite (un file per dominio funzionale, 5 database attivi)
- **Deploy:** VPS Aruba Ubuntu 22.04, systemd, Nginx reverse proxy, HTTPS Certbot
- **Deploy automatico:** `push.sh` → git push → post-receive hook VPS

---

# 2. Struttura Backend

```
app/
├── routers/            ← Endpoints API (un file per modulo)
│   ├── auth_router.py              — Login JWT (/auth/login, /auth/tiles)
│   ├── users_router.py             — CRUD utenti (/auth/users/*)
│   ├── menu_router.py              — Menu navigazione (/menu)
│   ├── modules_router.py           — Permessi moduli (/settings/modules)
│   ├── vini_router.py              — Carta Vini (/vini/...)
│   ├── vini_settings_router.py     — Settings carta (/settings/vini/...)
│   ├── vini_magazzino_router.py    — Magazzino vini (/vini/magazzino/...)
│   ├── vini_cantina_tools_router.py — Strumenti cantina (/vini/cantina-tools/...)
│   ├── foodcost_router.py          — FoodCost base (/foodcost/...)
│   ├── foodcost_ingredients_router.py — Ingredienti (/foodcost/ingredients/...)
│   ├── foodcost_recipes_router.py  — Ricette (/foodcost/ricette/...)
│   ├── foodcost_matching_router.py — Matching fatture (/foodcost/matching/...)
│   ├── admin_finance.py            — Corrispettivi (/admin/finance/...)
│   ├── chiusure_turno.py           — Chiusure turno (/chiusure-turno/...)
│   ├── fe_import.py                — Fatture XML (/contabilita/fe/...)
│   ├── fe_categorie_router.py      — Categorie fatture
│   ├── banca_router.py             — Banca (/banca/...)
│   ├── finanza_router.py           — Finanza (/finanza/...)
│   ├── finanza_scadenzario_router.py — Scadenzario
│   ├── statistiche_router.py       — Statistiche iPratico (/statistiche/...)
│   ├── dipendenti.py               — Dipendenti & turni (/dipendenti/...)
│   └── settings_router.py          — Impostazioni generali
│
├── services/           ← Logica applicativa
│   ├── auth_service.py             — Auth PIN sha256_crypt, users.json
│   ├── carta_vini_service.py       — Builder HTML/PDF/DOCX Carta Vini
│   ├── ipratico_parser.py          — Parser export iPratico (.xls HTML)
│   ├── admin_finance_db.py         — Query DB corrispettivi
│   ├── admin_finance_stats.py      — Statistiche corrispettivi
│   ├── admin_finance_import.py     — Import Excel corrispettivi
│   └── corrispettivi_import.py     — Parsing Excel corrispettivi
│
├── models/             ← Schema DB e dataclass
│   ├── vini_db.py / vini_model.py  — DEPRECATED (vecchio DB eliminato v3.0)
│   ├── vini_magazzino_db.py        — CRUD magazzino vini
│   ├── vini_settings.py            — Settings vini
│   ├── foodcost_db.py              — Schema + CRUD foodcost
│   ├── dipendenti_db.py            — Schema + CRUD dipendenti
│   └── fe_import.py                — Schema FE fatture/righe
│
├── core/               ← Configurazioni globali
│   ├── config.py       — SECRET_KEY da .env, ALGORITHM, TOKEN_EXPIRE
│   ├── security.py     — JWT encode/decode, sha256_crypt hashing
│   └── database.py     — Connessioni SQLite
│
├── migrations/         ← Migrazioni DB foodcost.db (001–017)
│   ├── 001_creare_ingredients.py
│   ├── ...
│   ├── 014_banca_movimenti.py
│   ├── 015–017 (finanza, scadenzario, ecc.)
│   └── migration_runner.py         — Eseguito all'avvio
│
├── repositories/       ← Accesso dati ordinato
│   ├── vini_repository.py
│   └── foodcost_repository.py
│
├── data/               ← Database SQLite
│   ├── vini.sqlite3            — ELIMINATO v3.0 (era Carta Vini legacy)
│   ├── vini_magazzino.sqlite3  — Cantina (DB moderno, unico DB vini)
│   ├── vini_settings.sqlite3   — Ordinamenti e filtri carta
│   ├── foodcost.db             — FoodCost, Ricette, FE XML, Banca, Finanza
│   ├── admin_finance.sqlite3   — Vendite + Chiusure turno
│   ├── users.json              — Store utenti (4 utenti con hash PIN)
│   ├── modules.json            — Permessi moduli per ruolo
│   └── (dipendenti.sqlite3)    — Creato a runtime
│
└── static/             ← CSS, font, PDF static
    └── css/carta_pdf.css       — Stile WeasyPrint (font Cormorant Garamond)
```

---

# 3. Struttura Frontend

```
frontend/
├── src/
│   ├── App.jsx             — React Router: 50+ route
│   ├── main.jsx            — Entry point React
│   ├── index.css           — Stili globali + Tailwind
│   ├── config/
│   │   ├── api.js          — API_BASE + apiFetch() con JWT auto-inject
│   │   ├── versions.jsx    — MODULE_VERSIONS + VersionBadge
│   │   └── viniConstants.js — Costanti modulo vini
│   ├── components/
│   │   ├── LoginForm.jsx   — Login tile-based con PIN pad
│   │   ├── Header.jsx      — Header globale + cambio PIN + logout
│   │   ├── Menu.jsx, CardMenu.jsx, BackButton.jsx
│   │   └── vini/MagazzinoSubMenu.jsx
│   └── pages/
│       ├── Home.jsx, Login.jsx, CambioPIN.jsx
│       ├── vini/           — Carta, Magazzino, Movimenti, Dashboard, Impostazioni
│       ├── ricette/        — Archivio, Nuova, Dettaglio, Ingredienti, Matching, Dashboard, Settings
│       ├── banca/          — Nav, Menu, Dashboard, Movimenti, Import, Categorie, CrossRef
│       ├── statistiche/    — Nav, Menu, Dashboard, Prodotti, Import iPratico
│       └── admin/          — Corrispettivi, ChiusuraTurno, Fatture, Dipendenti, Impostazioni
├── .env.development        — VITE_API_BASE_URL=http://127.0.0.1:8000
├── .env.production         — VITE_API_BASE_URL=https://trgb.tregobbi.it
└── package.json            — React 18, Vite, Axios, TailwindCSS, Recharts
```

---

# 4. Database SQLite

| File | Moduli | Note |
|------|--------|------|
| ~~`vini.sqlite3`~~ | ~~Carta Vini~~ | ELIMINATO v3.0 — carta ora da magazzino |
| `vini_magazzino.sqlite3` | Cantina | Magazzino moderno con movimenti, note, locazioni |
| `vini_settings.sqlite3` | Settings Carta | tipologia_order, nazioni_order, regioni_order, filtri_carta |
| `foodcost.db` | FoodCost, FE XML, Banca, Finanza, Statistiche | Gestito da migration_runner (001–018) |
| `admin_finance.sqlite3` | Vendite, Chiusure Turno | daily_closures, shift_closures, shift_preconti, shift_spese |
| `dipendenti.sqlite3` | Dipendenti & Turni | Creato a runtime da `init_dipendenti_db()` |

Schema dettagliato → `docs/database.md`

---

# 5. Autenticazione

- **Tipo:** JWT (python-jose, HS256, 60 min scadenza)
- **Login:** `POST /auth/login` — PIN numerico (4+ cifre)
- **UI Login:** Selezione utente via tile colorate + PIN pad numerico
- **Hashing:** sha256_crypt via passlib.CryptContext
- **Store:** `app/data/users.json` — 4 utenti con hash PIN
- **Cambio PIN:** Self-service per tutti + reset admin da pagina `/cambio-pin`
- **Token frontend:** `localStorage` con gestione 401 centralizzata via `apiFetch()`
- **Middleware:** `ReadOnlyViewerMiddleware` blocca POST/PUT/PATCH/DELETE per "viewer"

Ruoli: `admin`, `chef`, `sommelier`, `sala`, `viewer`

---

# 6. Routing Frontend (tutte le route)

```
/                           — Home (moduli visibili per ruolo)
/cambio-pin                 — Cambio PIN (tutti gli utenti)

/vini                       — Menu Vini
/vini/carta                 — Anteprima Carta Vini
/vini/vendite               — Vendite vini (bottiglia/calici)
/vini/settings              — Impostazioni Carta
/vini/magazzino             — Cantina (lista con filtri gerarchici)
/vini/magazzino/nuovo       — Nuovo vino
/vini/magazzino/:id         — Dettaglio vino
/vini/magazzino/admin       — Modifica massiva (admin)
/vini/magazzino/registro    — Registro movimenti (admin)
/vini/magazzino/tools       — Strumenti cantina (admin)
/vini/dashboard             — Dashboard vini KPI

/ricette                    — Menu Ricette & Food Cost
/ricette/nuova              — Nuova ricetta
/ricette/archivio           — Archivio ricette
/ricette/:id                — Dettaglio ricetta
/ricette/modifica/:id       — Modifica ricetta
/ricette/ingredienti        — Gestione ingredienti
/ricette/ingredienti/:id/prezzi — Storico prezzi + conversioni
/ricette/matching           — Matching fatture (4 tab)
/ricette/dashboard          — Dashboard food cost
/ricette/settings           — Strumenti (export/import)

/vendite                    — Menu Gestione Vendite
/vendite/fine-turno         — Chiusura Turno (pranzo/cena)
/vendite/chiusure           — Lista Chiusure (admin)
/vendite/riepilogo          — Riepilogo mensile
/vendite/dashboard          — Dashboard mensile
/vendite/annual             — Confronto annuale
/vendite/import             — Import Excel

/acquisti                   — Menu Gestione Acquisti
/acquisti/dashboard         — Dashboard acquisti
/acquisti/elenco            — Elenco fatture
/acquisti/dettaglio/:id     — Dettaglio fattura
/acquisti/fornitori         — Elenco fornitori
/acquisti/fornitore/:piva   — Dettaglio fornitore
/acquisti/import            — Import FE XML
/acquisti/categorie         — Categorie fornitori

/banca                      — Menu Banca
/banca/dashboard            — Dashboard banca
/banca/movimenti            — Movimenti bancari
/banca/import               — Import CSV
/banca/categorie            — Categorie custom
/banca/crossref             — Cross-ref fatture

/finanza                    — Menu Finanza
/finanza/dashboard          — Dashboard finanza
/finanza/movimenti          — Movimenti finanziari
/finanza/import             — Import Excel
/finanza/categorie          — Categorie
/finanza/scadenzario        — Scadenzario pagamenti

/statistiche                — Menu Statistiche
/statistiche/dashboard      — Dashboard (categorie, top prodotti, trend)
/statistiche/prodotti       — Dettaglio prodotti (filtri, ricerca)
/statistiche/import         — Import iPratico (.xls)

/admin/dipendenti           — Menu Dipendenti
/admin/dipendenti/anagrafica — Anagrafica
/admin/dipendenti/turni     — Turni
/admin/dipendenti/costi     — Costi

/admin/impostazioni         — Impostazioni Sistema (utenti + moduli)
```

---

# 7. Architettura di Rete

```
Utente → HTTPS (443) → Nginx
                         ├── app.tregobbi.it → Frontend Vite (127.0.0.1:5173)
                         └── trgb.tregobbi.it → Backend FastAPI (127.0.0.1:8000)

Porte esterne chiuse da UFW (8000, 5173 non raggiungibili dall'esterno)
```

IP VPS: `80.211.131.156` (Aruba, Ubuntu 22.04)

---

# 8. Script di avvio e deploy

| Script | Uso |
|--------|-----|
| `run_servers.command` | Avvio locale macOS (backend + frontend in parallelo) |
| `push.sh` | **Deploy principale**: commit + push + restart VPS |
| `push.sh "msg" -f` | Deploy completo con pip + npm install |
| `scripts/deploy.sh -a/-b/-c/-d` | Fallback manuale dalla VPS |
| `scripts/setup_git_server.sh` | Setup bare repo + post-receive hook (una tantum) |
| `scripts/gen_passwords.py` | Utility per rigenerare hash PIN |

> **Deploy automatico (dal 2026-03-08):** `git push` dal Mac → post-receive hook su `/home/marco/trgb/trgb.git` → deploy automatico.

---

# 9. Versioni e dipendenze

```
Master Version ................. 2026.03.16
Core Backend ................... v1.8.0
Core Frontend .................. v1.4.0

Modulo Cantina & Vini ......... v4.0   — stabile
Modulo Gestione Acquisti ....... v2.0   — stabile
Modulo Ricette & Food Cost .... v3.0   — beta
Modulo Gestione Vendite ........ v2.0   — stabile
Modulo Banca ................... v1.0   — beta
Modulo Statistiche ............. v1.0   — beta
Modulo Finanza ................. v1.0   — beta
Modulo Dipendenti .............. v1.0   — stabile
Login & Ruoli .................. v2.0   — stabile
Sistema ........................ v4.3   — stabile

DB vini.sqlite3 ................ ELIMINATO v3.0
DB vini_magazzino.sqlite3 ...... v4.0
DB vini_settings.sqlite3 ....... v1.4
DB foodcost.db ................. v3.1  (migrazioni 001–018)
DB admin_finance.sqlite3 ....... v2.0  (shift_closures, shift_preconti, shift_spese)
DB dipendenti.sqlite3 .......... v1.0  (creato a runtime)
```

## Dipendenze Python

| Pacchetto | Uso |
|-----------|-----|
| fastapi + uvicorn | Framework backend + ASGI server |
| python-jose | JWT |
| passlib | Password hashing (sha256_crypt) |
| python-multipart | Upload file |
| openpyxl, pyxlsb | Import Excel |
| weasyprint | Generazione PDF |
| python-docx | Generazione DOCX |
| jinja2 | Templating |
| python-dotenv | Configurazione da .env |
| pandas | Processing dati |

## Dipendenze npm

| Pacchetto | Uso |
|-----------|-----|
| react 18, react-router-dom 7 | UI Framework + Routing |
| axios | HTTP client |
| recharts | Grafici dashboard |
| tailwindcss | Styling |
| @hello-pangea/dnd | Drag & drop |
| vite | Build tool |
