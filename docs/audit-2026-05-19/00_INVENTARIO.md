# Inventario TRGB

> Data audit: 2026-05-19 · Versione backend: 5.16 · Versione frontend: 1.1.0
> Tenant default scansionato: `tregobbi` (l'unico abitato di dati reali).

## Stack rilevato

- **Tipo progetto:** monorepo a singolo repo Git con:
  - backend FastAPI (`app/`, entry point `main.py`)
  - frontend SPA React (`frontend/`)
  - cartella tenant (`locali/<id>/`) per branding/strings/seeds/feature-flag
  - cartella prodotto generico in fase di estrazione (`core/moduli/<id>/`) — finora popolata solo dei manifesti `module.json`
- **Backend:**
  - Linguaggio: Python ≥ 3.12
  - Framework: FastAPI (montato in `main.py:207`)
  - Auth: JWT — `python-jose[cryptography]` + `passlib[bcrypt]`, decode in `app/core/security.py`
  - Persistenza: SQLite multi-database (un file per macro-modulo) sotto `app/data/`
  - Migrazioni: runner custom in `app/migrations/migration_runner.py`, eseguito al boot da `main.py:201`. Tabella `schema_migrations` su `foodcost.db`.
  - Server statici: `static/` (CSS/font/immagini) + `/uploads` (cartella esterna al repo, default `/home/marco/trgb_uploads`, override env `TRGB_UPLOADS_DIR`)
  - HTTP client esterno: `httpx` (per Fatture in Cloud)
  - Generatori documento: `weasyprint` (PDF), `python-docx`, `pdfplumber` + `pikepdf` (estrazione cedolini LUL)
- **Frontend:**
  - Linguaggio: JavaScript (JSX) — niente TypeScript
  - Framework: React 18 + react-router-dom 7 (file-based no, ma routing centralizzato in `frontend/src/App.jsx`)
  - Build: Vite 5
  - Stile: TailwindCSS 3.4 con palette brand custom (`brand-red`, `brand-green`, `brand-blue`, `brand-ink`, `brand-cream`, `brand-night`). Nessun CSS module separato.
  - Drag & drop: `@hello-pangea/dnd`
  - HTTP client: `axios` (configurato in `frontend/src/config/api.js` come `API_BASE`)
  - Grafici: `recharts` 3
- **Database:**
  - File SQLite in `app/data/`:
    - `foodcost.db` (DB principale storico: ricette, ingredienti, fatture FE, fattureincloud, banca, controllo gestione, prenotazioni, preventivi, menu_templates, ipratico, ecc.)
    - `admin_finance.sqlite3` (corrispettivi, chiusure giornaliere/turno, cash_deposits)
    - `vini.sqlite3` (cantina cliente, anagrafiche bottiglie)
    - `vini_magazzino.sqlite3` (movimenti magazzino vini)
    - `vini_settings.sqlite3` (filtri/widget config cantina)
    - `dipendenti.sqlite3` (anagrafica, presenze, turni, scadenze, buste paga, reparti)
    - `clienti.sqlite3` (CRM: anagrafica, tag, note, alias, impostazioni)
    - `notifiche.sqlite3` (mattone M.A: notifiche, comunicazioni WA, alert_config)
    - `tasks.sqlite3` (checklist, istanze, task singoli, haccp)
    - `bevande.sqlite3` (carta bevande non-vino: aperitivi, birre, distillati, ecc.)
  - Settings utenti: `users.json` (JSON flat)
  - Settings moduli runtime: `modules.json`, `modules.runtime.json`, `modules.runtime.meta.json`
- **Pacchetti chiave (riconducibili a capability utente):**
  - auth: JWT (`python-jose`) + bcrypt
  - router HTTP: FastAPI
  - ORM: nessuno — accesso diretto via `sqlite3` con repository custom (`app/repositories/`)
  - UI router: `react-router-dom@7`
  - UI components proprietari: `frontend/src/components/ui/` (M.I primitives: `Btn`, `PageLayout`, `StatusBadge`, `EmptyState`)
  - Notifiche frontend: hook `useNotifiche` (`frontend/src/hooks/`)
  - WA composer: `frontend/src/utils/whatsapp.js` + backend `app/utils/whatsapp.py`
  - Alert engine: registry pattern in `app/services/alert_engine.py` (decoratore `@register_checker`)
- **Entry point:**
  - Backend: `main.py` (uvicorn lo serve in `app:app`)
  - Frontend: `frontend/src/main.jsx` → `App.jsx`
  - Tooling deploy: `push.sh` (orchestrazione commit + push + restart VPS), `scripts/deploy.sh`, `scripts/setup_git_server.sh`
- **File di routing centrali:**
  - Backend: `main.py` (montaggio 50+ router con wrapper `_mount` controllato dal module_loader)
  - Frontend: `frontend/src/App.jsx` (541 righe, mappa pagina-rotta in `<Routes>` di react-router)
- **Sotto-progetti:**
  - **monorepo** unico, ma con due "dimensioni" di tenancy:
    1. tenant-locali (`locali/{tregobbi, trgb, test_demo, _template}`) — branding/strings/feature-flag
    2. moduli vendibili (`core/moduli/<id>/`) — solo manifesti `module.json` per ora; il codice resta in `app/routers/` e `frontend/src/pages/` in attesa del refactor R8c
- **Variabili d'ambiente rilevanti:**
  - `TRGB_LOCALE` — id del locale corrente (default `tregobbi`)
  - `TRGB_UPLOADS_DIR` — root upload utente fuori dal repo

### File `DEPLOYED_COMMIT.txt`
Letto dal backend al boot per esporre il commit short hash su `/system/info`. Scritto dal post-receive hook git sul VPS.

### Diagnostica esposta (endpoint pubblici read-only)
- `GET /system/info` → `{ locale, product, version, commit }`
- `GET /system/modules` → snapshot feature flags via `module_loader.get_module_info()`
- `GET /system/backup-health` (JWT admin) → stato sistema backup, file `last_known_good/`, età ultimo Drive sync
- `GET /locale/branding.json` → palette/font/asset paths del tenant corrente (cache 60s)
- `GET /locale/strings.json` → testi UI tenant-aware (helper `t()`)

---

## Moduli funzionali (visibili all'utente)

> Fonte di verità: `core/moduli/<id>/module.json`. La priorità manuale è stimata da Claude in base alla criticità operativa per Marco (osteria Tre Gobbi) e all'uso quotidiano.

| # | Nome modulo (id) | Path principali | Entry point (router_files) | Modelli/Tabelle chiave | Dipende da | Priorità manuale |
|---|---|---|---|---|---|---|
| 1 | **Cantina Vini** (`vini`) | `app/routers/vini_*.py`, `app/routers/ipratico_products_router.py`, `app/routers/bevande_router.py`, `frontend/src/pages/vini/` | `vini_router`, `vini_settings_router`, `vini_magazzino_router`, `vini_cantina_tools_router`, `vini_anagrafiche_router`, `vini_v2_router`, `vini_pricing_router`, `ipratico_products_router`, `bevande_router` | `vini`, `vini_movimenti`, `vini_magazzino`, `vini_magazzino_movimenti`, `bevande_sezioni`, `bevande_voci`, `filtri_carta` | platform (auth, notifiche, pdf, permessi, ui_primitives) | **Alta** |
| 2 | **Ricette / Foodcost** (`ricette`) | `app/routers/foodcost_*.py`, `app/routers/scelta_*_router.py`, `app/routers/piatti_giorno_router.py`, `frontend/src/pages/ricette/`, `frontend/src/pages/selezioni/` | `foodcost_router`, `foodcost_ingredients_router`, `foodcost_recipes_router`, `foodcost_matching_router`, `scelta_macellaio_router`, `scelta_salumi_router`, `scelta_formaggi_router`, `scelta_pescato_router`, `piatti_giorno_router` | `recipes`, `recipe_items`, `recipe_categories`, `ingredients`, `ingredient_prices`, `ingredient_supplier_map`, `service_types`, `macellaio_*`, `salumi_*`, `formaggi_*`, `pescato_*` | platform + acquisti (matching) | **Alta** |
| 3 | **Acquisti / Fatture** (`acquisti`) | `app/routers/fe_*.py`, `app/routers/fattureincloud_router.py`, `frontend/src/pages/admin/` (Fatture) | `fe_import`, `fe_categorie_router`, `fe_proforme_router`, `fattureincloud_router` | `fe_fatture`, `fe_righe`, `fe_fornitori`, `fe_fornitore_categoria`, `fe_proforme`, `suppliers` | platform + opt: ricette, controllo_gestione, banca | **Alta** |
| 4 | **Controllo Gestione** (`controllo_gestione`) | `app/routers/controllo_gestione_router.py`, `frontend/src/pages/controllo-gestione/` | `controllo_gestione_router` | `cg_uscite`, `cg_entrate`, `cg_spese_fisse`, `cg_categorie` | platform + opt: acquisti, banca, cassa, dipendenti | **Alta** |
| 5 | **Banca** (`banca`) | `app/routers/banca_router.py`, `frontend/src/pages/banca/` | `banca_router` | `banca_movimenti`, `banca_categorie`, `cash_deposits` | platform + opt: controllo_gestione, acquisti, cassa | **Alta** |
| 6 | **Dipendenti / Turni** (`dipendenti`) | `app/routers/dipendenti.py`, `app/routers/reparti.py`, `app/routers/turni_router.py`, `frontend/src/pages/dipendenti/` | `dipendenti`, `reparti`, `turni_router` | `dipendenti`, `dipendenti_allegati`, `dipendenti_scadenze`, `dipendenti_presenze`, `dipendenti_contratti`, `buste_paga`, `turni_calendario`, `turni_tipi`, `reparti` | platform (calendar, pdf) + opt: controllo_gestione | **Alta** |
| 7 | **Prenotazioni** (`prenotazioni`) | `app/routers/prenotazioni_router.py`, `app/routers/preventivi_router.py`, `app/routers/menu_templates_router.py`, `frontend/src/pages/prenotazioni/`, `frontend/src/pages/admin/Preventivi*` | `prenotazioni_router`, `preventivi_router`, `menu_templates_router` | `clienti_prenotazioni`, `clienti_preventivi`, `clienti_preventivo_*`, `menu_templates`, `tavoli`, `tavoli_layout`, `tavoli_combinazioni` | platform (calendar, wa, pdf) + opt: clienti, menu_carta | **Alta** |
| 8 | **Clienti CRM** (`clienti`) | `app/routers/clienti_router.py`, `frontend/src/pages/clienti/` | `clienti_router` | `clienti`, `clienti_tag`, `clienti_tag_assoc`, `clienti_note`, `clienti_alias`, `clienti_impostazioni` | platform (wa) + opt: prenotazioni | **Media** |
| 9 | **Cassa / Chiusure** (`cassa`) | `app/routers/admin_finance.py`, `app/routers/chiusure_turno.py`, `app/routers/closures_config_router.py`, `frontend/src/pages/admin/` (Cassa/Vendite) | `admin_finance`, `chiusure_turno`, `closures_config_router` | `daily_closures`, `shift_closures`, `cash_deposits`, `corrispettivi` | platform + opt: banca, controllo_gestione | **Alta** |
| 10 | **Menu Carta + Pranzo** (`menu_carta`) | `app/routers/menu_carta_router.py`, `app/routers/pranzo_router.py`, `app/routers/menu_router.py`, `frontend/src/pages/pranzo/`, `frontend/src/pages/public/` | `menu_carta_router`, `pranzo_router`, `menu_router` | `menu_editions`, `menu_dish_publications`, `menu_tasting_paths`, `menu_tasting_path_steps`, `pranzo_menu`, `pranzo_menu_righe`, `pranzo_settings` | platform (pdf, import) + opt: ricette, task_manager | **Alta** |
| 11 | **Cucina — Lista Spesa** (`cucina`) | `app/routers/lista_spesa_router.py`, `frontend/src/pages/cucina/` | `lista_spesa_router` | `lista_spesa_items`, `lista_spesa_righe` | platform + opt: ricette, acquisti, task_manager | **Media** |
| 12 | **Task Manager / HACCP** (`task_manager`) | `app/routers/tasks_router.py`, `app/routers/haccp_router.py`, `frontend/src/pages/tasks/` | `tasks_router`, `haccp_router` | `checklist_template`, `checklist_item`, `checklist_instance`, `checklist_execution`, `task_singolo`, `task_alert_log`, `haccp_*` | platform + opt: dipendenti | **Media** |
| 13 | **Statistiche** (`statistiche`) | `app/routers/statistiche_router.py`, `frontend/src/pages/statistiche/` | `statistiche_router` | (nessuna tabella propria — cross-aggregatore read-only) | platform + opt: vini, ricette, cassa, banca, controllo_gestione | **Media** |

### Moduli "sub" — sotto-elementi visibili al cliente

Nella UI alcuni moduli compaiono come voci di menu indipendenti pur essendo router/sub-feature di un modulo padre. Da segnare come capability del padre nel manuale.

- **Selezioni del giorno** (`/selezioni`) → fa parte di `ricette` (`scelta_*_router`, `piatti_giorno_router`)
- **Carta Bevande** (`/vini/bevande`) → fa parte di `vini` (`bevande_router`)
- **Pranzo del Giorno** (`/pranzo`) → fa parte di `menu_carta` (`pranzo_router`)
- **Preventivi eventi** (`/preventivi`) → fa parte di `prenotazioni` (`preventivi_router`, `menu_templates_router`)
- **HACCP** (`/haccp`) → fa parte di `task_manager` (`haccp_router`)
- **Modulo Vini 2 (test parallelo)** (`vini_v2_router`) → variante in test del modulo `vini` (Fase 2 V.6+V.7+V.8). Da segnare in audit.

---

## Moduli trasversali (infrastruttura — "platform")

| # | Nome modulo | Path | Ruolo | Rilevante per manuale? |
|---|---|---|---|---|
| P.1 | **Auth / Utenti / Permessi (M.G)** | `app/routers/auth_router.py`, `app/routers/users_router.py`, `app/core/security.py`, `app/services/auth_service.py` | Login JWT, gestione utenti, ruoli (`admin`, `contabile`, `sommelier`, `sala`, `chef`, `viewer`), middleware read-only `viewer` | **Sì** (Sezione B Manager: gestione utenti/ruoli) |
| P.2 | **Modules registry** | `app/routers/modules_router.py`, `app/data/modules.json`, `app/platform/module_loader.py` | Snapshot moduli attivi, toggle visibilità menu | **Sì** (Sezione B: cosa è attivo per il locale) |
| P.3 | **Dashboard Home** | `app/routers/dashboard_router.py`, `frontend/src/pages/Home.jsx`, `frontend/src/pages/DashboardSala.jsx` | Widget aggregatore Home, pulsanti rapidi per ruolo | **Sì** (Sezione A: la prima schermata) |
| P.4 | **Home Actions** | `app/routers/home_actions_router.py`, `app/services/home_actions_defaults.py` | Config dei pulsanti rapidi Home per ogni ruolo | Solo Sezione B (configurazione) |
| P.5 | **Notifiche (M.A)** | `app/routers/notifiche_router.py`, `app/services/notifiche_service.py`, `notifiche.sqlite3` | Crea/leggi/marca-letta notifiche, comunicazioni WhatsApp | **Sì** (Sezione A: la campanellina; Sezione B: configurazione canali) |
| P.6 | **Alert Engine (M.F)** | `app/routers/alerts_router.py`, `app/services/alert_engine.py` | Checker pluggable, dry-run, scheduler, integrazione notifiche | Solo Sezione B (configurazione soglie) |
| P.7 | **PDF Brand (M.B)** | `app/services/pdf_brand.py`, `app/services/pranzo_pdf_service.py`, `app/services/haccp_report_service.py`, `app/services/menu_templates_service.py` | Generatori PDF brandizzati (carta menu, pranzo, HACCP, preventivi, buste paga) | Citato nelle capability che generano PDF |
| P.8 | **WA Composer (M.C)** | `app/utils/whatsapp.py`, `frontend/src/utils/whatsapp.js` | Build link `wa.me/`, normalizzazione telefoni, template variabili | Citato dove si manda WhatsApp |
| P.9 | **Calendar (M.E)** | (componente FE) | Componente calendario riusabile (turni, prenotazioni) | Non standalone |
| P.10 | **UI Primitives (M.I)** | `frontend/src/components/ui/` | `Btn`, `PageLayout`, `StatusBadge`, `EmptyState` | Non standalone |
| P.11 | **Backup** | `app/routers/backup_router.py`, `scripts/backup_db.sh`, `scripts/check_backup_health.sh`, `/system/backup-health` | Download manuale DB, dashboard salute backup (admin) | Solo Sezione B (admin) |
| P.12 | **System / Locale** | `main.py` endpoints `/system/*`, `/locale/*`, `app/utils/locale_data.py`, `app/utils/locale_strings.py`, `app/utils/uploads.py` | Diagnostica, branding tenant, strings tenant, paths upload | Solo Sezione B (configurazione locale) |
| P.13 | **Migrations** | `app/migrations/`, `app/migrations/migration_runner.py` | Runner idempotente al boot, naming `NNN_*.py` | Non standalone (riferito in troubleshooting) |
| P.14 | **Import / Parser** | `app/services/ipratico_parser.py`, `app/services/corrispettivi_import.py`, `app/services/elab_parser.py`, `app/services/f24_parser.py` | Parser per: corrispettivi iPratico, elab LUL cedolini, F24 PDF | Citato dove si fa import |
| P.15 | **Comunicazioni** (`com_router`) | `app/routers/notifiche_router.py` (router secondario) | Endpoint per inviare comunicazioni broadcast a staff | Sezione B (manager) |

---

## Sotto-progetti e ambienti

- **Multi-tenant** (R1-R8 in `docs/refactor_monorepo.md`):
  - `locali/tregobbi/` — l'osteria di Marco. Branding TRGB-02, deploy `trgb.tregobbi.it`. Unico tenant con dati reali.
  - `locali/trgb/` — istanza pulita prodotto, deploy futuro `trgb.it`.
  - `locali/test_demo/` — istanza demo.
  - `locali/_template/` — scaffold per nuovi clienti.
- **Modular toggle**: `locali/<id>/moduli_attivi.json` controlla quali moduli sono attivi via `module_loader.is_router_active()`. Default backward-compat: `"*"` o file mancante → tutti attivi.

---

## Statistiche

- **N° router backend:** 49 (vedi `app/routers/`)
- **N° pagine frontend:** ~50 sotto `frontend/src/pages/` (13 sotto-cartelle modulo + 5 pagine flat: `Home`, `Login`, `CambioPIN`, `Comunicazioni`, `DashboardSala`)
- **N° migrazioni SQLite eseguite:** 135 file in `app/migrations/` (alcuni con numerazione duplicata — vedi note)
- **N° moduli funzionali:** 13 vendibili + 1 platform (totale 14 in `core/moduli/`)
- **N° servizi platform:** 15 (P.1 – P.15)
- **N° database SQLite:** 10 (foodcost.db + 9 sqlite3 dedicati per dominio)
- **LOC approssimative:** backend `main.py` 728 righe + 49 router (stima 8.000-12.000 LOC backend); frontend `App.jsx` 541 righe + ~50 pagine (stima 15.000-20.000 LOC frontend).

### Numerazione migrazioni — anomalie
Sono presenti più migrazioni con lo stesso numero progressivo (collisioni):
- `129_conto_economico_fase_a.py` + `129_movimenti_prezzo_unitario.py`
- `130_madre_nome_etichetta.py` + `130_normalizza_periodo_riferimento_stipendi.py`
- `131_madre_vitigni_strutturati.py` + `131_riclassifica_tasse_arretrate.py`
- `133_cutover_rename_tabelle_v2.py` + `133_fe_fatture_competenza_override.py`

In `schema_migrations` ciascuna è tracciata per nome file, quindi non c'è collisione runtime, ma è un *code smell* di branch concorrenti merge-ati senza re-numerare. Da segnalare in `02_GAP_REPORT.md`.
