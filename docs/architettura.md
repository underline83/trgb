# 🧱 TRGB Gestionale — Architettura Tecnica
**Ultimo aggiornamento:** 2026-03-08

---

# 1. Panorama generale

TRGB Gestionale è il sistema interno dell'Osteria Tre Gobbi (Bergamo). È composto da:

- **Backend:** FastAPI (Python 3.12), autenticazione JWT, SQLite multipli
- **Frontend:** React 18 + Vite + TailwindCSS
- **Database:** SQLite (un file per dominio funzionale)
- **Deploy:** VPS Aruba Ubuntu 22.04, systemd, Nginx reverse proxy, HTTPS Certbot
- **Script locali:** `run_servers.command` (macOS), `scripts/deploy.sh` (VPS)

---

# 2. Struttura Backend

```
app/
├── routers/            ← Endpoints API (un file per modulo)
│   ├── auth_router.py              — Login JWT (/auth/login)
│   ├── menu_router.py              — Menu navigazione (/menu)
│   ├── vini_router.py              — Carta Vini (/vini/...)
│   ├── vini_settings_router.py     — Settings carta (/settings/vini/...)
│   ├── vini_magazzino_router.py    — Magazzino vini (/vini/magazzino/...)
│   ├── foodcost_router.py          — FoodCost base (/foodcost/...)
│   ├── foodcost_ingredients_router.py — Ingredienti (/foodcost/ingredients/...)
│   ├── foodcost_recipes_router.py  — Ricette (/foodcost/ricette/...)
│   ├── admin_finance.py            — Corrispettivi & finanza (/admin/finance/...)
│   ├── fe_import.py                — Fatture XML (/contabilita/fe/...)
│   └── dipendenti.py               — Dipendenti & turni (/dipendenti/...)
│
├── services/           ← Logica applicativa
│   ├── auth_service.py             — ⚠️ MOCK: USERS dict in chiaro (da sostituire)
│   ├── carta_vini_service.py       — Builder HTML/PDF Carta Vini
│   ├── admin_finance_db.py         — Query DB corrispettivi
│   ├── admin_finance_stats.py      — Statistiche corrispettivi
│   ├── admin_finance_import.py     — Import Excel corrispettivi
│   └── corrispettivi_import.py     — Parsing Excel corrispettivi
│
├── models/             ← Schema DB e dataclass
│   ├── vini_db.py / vini_model.py  — Schema + import vini
│   ├── vini_magazzino_db.py        — CRUD magazzino vini
│   ├── vini_settings.py            — Settings vini settings DB
│   ├── foodcost_db.py              — Schema + CRUD foodcost
│   ├── dipendenti_db.py            — Schema + CRUD dipendenti
│   └── fe_import.py                — Schema FE fatture/righe
│
├── core/               ← Configurazioni globali
│   ├── config.py       — SECRET_KEY, ALGORITHM, TOKEN_EXPIRE (⚠️ key hardcoded, da mettere in .env)
│   └── security.py     — JWT encode/decode, sha256_crypt hashing
│
├── migrations/         ← Migrazioni DB foodcost.db
│   ├── 001_creare_ingredients.py
│   ├── 002_create_suppliers_and_price_history.py
│   ├── 003_create_recipes_and_items.py
│   ├── 004_reset_foodcostl_schema.py
│   ├── 005_add_order_inderx.py
│   └── migration_runner.py         — Eseguito all'avvio (init in main.py)
│
├── repositories/       ← Accesso dati ordinato
│   ├── vini_repository.py
│   └── foodcost_repository.py
│
├── data/               ← Database SQLite
│   ├── vini.sqlite3            — Magazzino vini (principale)
│   ├── vini_settings.sqlite3   — Ordinamenti e filtri carta
│   ├── foodcost.db             — Ingredienti, ricette, fatture XML
│   └── (dipendenti.sqlite3)    — Creato a runtime da dipendenti_db
│
└── static/             ← CSS, font, PDF static
    └── css/carta_pdf.css       — Stile WeasyPrint (font Cormorant Garamond)
```

---

# 3. Struttura Frontend

```
frontend/
├── src/
│   ├── App.jsx             — React Router: definizione di TUTTE le route
│   ├── main.jsx            — Entry point React + build version buster
│   ├── index.css           — Stili globali + Tailwind
│   ├── config/
│   │   └── api.js          — Esporta API_BASE da VITE_API_BASE_URL
│   ├── components/
│   │   ├── LoginForm.jsx
│   │   ├── Header.jsx, Menu.jsx, CardMenu.jsx
│   │   └── vini/MagazzinoSubMenu.jsx
│   └── pages/
│       ├── Home.jsx, Login.jsx
│       ├── vini/           — Carta, Magazzino, Movimenti, Impostazioni
│       ├── ricette/        — Archivio, Nuova, Ingredienti, Import
│       └── admin/          — Corrispettivi, Fatture, Dipendenti
├── .env.development        — VITE_API_BASE_URL=http://127.0.0.1:8000
├── .env.production         — VITE_API_BASE_URL=http://80.211.131.156:8000 ⚠️ (da aggiornare a HTTPS)
└── package.json            — React 18, Vite, Axios, TailwindCSS, Recharts
```

---

# 4. Database SQLite

| File | Moduli | Note |
|------|--------|------|
| `vini.sqlite3` | Carta Vini, Magazzino Vini | 1186 record reali, schema v2.1 |
| `vini_settings.sqlite3` | Settings Carta Vini | tipologia_order, nazioni_order, regioni_order, filtri_carta |
| `foodcost.db` | FoodCost, FE XML | ingredients, recipes, fe_fatture, fe_righe; gestito da migration_runner |
| `dipendenti.sqlite3` | Dipendenti & Turni | creato a runtime da `init_dipendenti_db()` |

---

# 5. Autenticazione

- **Tipo:** JWT (python-jose, HS256, 60 min scadenza)
- **Endpoint:** `POST /auth/login`
- **⚠️ Stato attuale (MOCK):** utenti hardcoded con password in chiaro in `auth_service.py`
- **Da fare (task #1 Roadmap):** sostituire con utenti hashed + credenziali da `.env`
- **Frontend:** token in `localStorage`; gestione 401 sparsa nelle singole pagine (nessun interceptor centralizzato — task #7 Roadmap)

Ruoli esistenti: `admin`, `chef`, `sommelier`, `viewer`

---

# 6. Routing Frontend (tutte le route)

```
/                           — Home
/vini                       — Menu Vini
/vini/carta                 — Anteprima Carta Vini
/vini/vendite               — Vendite vini
/vini/settings              — Impostazioni Carta
/vini/magazzino             — Lista Magazzino
/vini/magazzino/nuovo       — Nuovo vino
/vini/magazzino/:id         — Dettaglio vino
/vini/movimenti             — Movimenti Cantina
/ricette                    — Menu Ricette
/ricette/nuova              — Nuova ricetta
/ricette/archivio           — Archivio ricette
/ricette/import             — Import ricette
/ricette/ingredienti        — Gestione ingredienti
/ricette/ingredienti/:id/prezzi — Storico prezzi ingrediente
/admin                      — Menu Amministrazione
/admin/corrispettivi        — Menu Corrispettivi
/admin/corrispettivi/import — Import Excel corrispettivi
/admin/corrispettivi/gestione — Gestione chiusure
/admin/corrispettivi/dashboard — Dashboard corrispettivi
/admin/fatture              — Menu Fatture Elettroniche
/admin/fatture/import       — Import FE XML
/admin/fatture/dashboard    — Dashboard acquisti
/admin/dipendenti           — Menu Dipendenti
/admin/dipendenti/anagrafica — Anagrafica dipendenti
/admin/dipendenti/turni     — Turni dipendenti
/admin/dipendenti/costi     — Costi dipendenti
```

✅ `/admin/corrispettivi/annual` — aggiunta (Fix #6, 2026-03-08)

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

# 8. Script di avvio

| Script | Uso |
|--------|-----|
| `run_servers.command` | Avvio locale macOS (backend + frontend in parallelo) |
| `run_server_vps.sh` | Avvio manuale backend su VPS |
| `run_frontend_vps.sh` | Avvio manuale frontend su VPS |
| `scripts/deploy.sh -a` | Full deploy manuale VPS (checkout + pip + npm + restart) — fallback |
| `scripts/deploy.sh -b` | Quick deploy manuale (checkout + restart) — fallback |
| `scripts/deploy.sh -c` | Safe deploy manuale (backup DB + full deploy) — fallback |
| `scripts/deploy.sh -d` | Rollback all'ultimo backup |
| `scripts/setup_git_server.sh` | Setup bare repo + post-receive hook sul VPS (una tantum) |

> **Deploy automatico (dal 2026-03-08):** `git push` dal Mac → post-receive hook su `/home/marco/trgb/trgb.git` → deploy automatico. Vedi `docs/deploy.md` §4.1.

---

# 9. Versioni e dipendenze

```
Master Version ................. 2026.03.08
Core Backend ................... v1.8.0
Core Frontend .................. v1.4.0

Modulo Vini (Carta) ............ v2025.12.01  — stabile
Modulo Magazzino Vini ......... v2025.12.03  — stabile
Modulo Corrispettivi ........... v2026.01.01  — operativo
Modulo Fatture XML ............. v2025.12.05  — operativo (Fase 2 in roadmap)
Modulo FoodCost ................ v2025.11.28  — in sviluppo
Modulo Dipendenti .............. v2025.12.01  — operativo

DB vini.sqlite3 ................ v2.1
DB vini_settings.sqlite3 ....... v1.4
DB foodcost.db ................. v1.6  (migrazioni 001–005 applicate)
DB dipendenti.sqlite3 .......... v1.0  (creato a runtime)
```

## Dipendenze Python

| Pacchetto | Versione | Uso |
|-----------|----------|-----|
| fastapi | ~0.115 | Framework backend |
| uvicorn | ~0.32 | ASGI server |
| python-jose | ~3.3 | JWT |
| passlib | ~1.7 | Password hashing (sha256_crypt) |
| python-multipart | ~0.0.20 | Upload file |
| openpyxl | ~3.1 | Import Excel .xlsx |
| pyxlsb | ~1.0 | Import Excel .xlsb |
| weasyprint | ~62 | Generazione PDF |
| python-docx | ~1.1 | Generazione DOCX |

## Dipendenze npm

| Pacchetto | Versione | Uso |
|-----------|----------|-----|
| react | ^18.2 | UI Framework |
| react-router-dom | ^7.9 | Routing |
| axios | ^1.6 | HTTP client |
| recharts | ^3.6 | Grafici dashboard |
| tailwindcss | ^3.4 | Styling |
| @hello-pangea/dnd | ^18.0 | Drag & drop (pianificato) |
| vite | ^5.0 | Build tool |
