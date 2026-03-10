# TRGB — Briefing per Nuova Sessione
> File scritto da Claude a Claude. Leggilo per intero prima di iniziare a lavorare.
> **Aggiornalo alla fine di ogni sessione.**
> Ultima sessione: 2026-03-10 (sessione 4 — Gestione Vendite v2.0)

---

## Chi sei e dove sei

Sei l'assistente AI che lavora sul gestionale interno dell'**Osteria Tre Gobbi (Bergamo)**.
Il progetto si chiama **TRGB Gestionale** — un'app web FastAPI + React in produzione su VPS Aruba.
L'utente si chiama **Marco** (mac: `underline83`, win: `mcarm`).

La cartella di lavoro è selezionata come workspace Cowork. Puoi leggere e scrivere direttamente tutti i file del progetto.

---

## Cosa abbiamo fatto nell'ultima sessione (2026-03-10, sessione 4)

### Gestione Vendite v2.0 — Promozione a modulo top-level

1. **Promosso "Gestione Vendite"** (ex Corrispettivi) da sotto-sezione Admin a modulo di primo livello nella Home
2. **Route migrate** da `/admin/corrispettivi/*` a `/vendite/*` (5 route)
3. **VenditeNav.jsx** — barra navigazione persistente (4 tab: Chiusure, Dashboard, Annuale, Import)
4. **CorrispettiviMenu → hub "Gestione Vendite"** con mini-KPI (corrispettivi mese, incassi mese, media giornaliera, giorni aperti), VersionBadge, tile Confronto Annuale, grid 3 colonne
5. **CorrispettiviGestione** → VenditeNav, route `/vendite/chiusure`
6. **CorrispettiviDashboard** → VenditeNav, route `/vendite/dashboard`, titolo aggiornato
7. **CorrispettiviAnnual** → VenditeNav, route `/vendite/annual`
8. **CorrispettiviImport** → VenditeNav, route `/vendite/import`
9. **Home.jsx** — tile "Gestione Vendite" con icona e badge, subtitle admin aggiornato
10. **AdminMenu** — rimossa tile Corrispettivi
11. **modules.json** — aggiunto modulo `vendite`
12. **versions.jsx** — Corrispettivi v1.5→v2.0 "Gestione Vendite", Sistema v4.0→v4.1
13. **Design doc** — `docs/design_gestione_vendite.md` con piano evolutivo in 5 fasi

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-10, sessione 3)

### Gestione Acquisti v2.0 + ViniNav

1. Promosso "Gestione Acquisti" da sotto-sezione Admin a modulo top-level
2. Route migrate da `/admin/fatture/*` a `/acquisti/*` (8 route)
3. Pagina Elenco Fornitori, Elenco Fatture, Dettaglio Fattura
4. Fix ricerca elenco fatture + Fix drill-down dashboard
5. FattureNav, ViniNav (applicata a 11 pagine)
6. versions.jsx: Vini v3.6, Fatture v2.0, Sistema v4.0

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-10, sessione 2)

### Modulo Ricette & Food Cost v2 — REBUILD COMPLETO

Rifacimento totale del modulo ricette e food cost, partendo da zero. Il vecchio codice e' stato eliminato (ricette.py, ricette_db.py) e sostituito con un sistema completamente nuovo.

#### Bug fix vendite vini
1. **DELETE movimento non riconcilia locazioni** — `delete_movimento()` ora azzera TUTTE le colonne quantita' (QTA_TOTALE, QTA_FRIGO, QTA_LOC1/2/3) e ripercorre tutti i movimenti inclusa la locazione
2. **Ricerca vendite mostra vini a giacenza zero** — aggiunto parametro `solo_disponibili` a `search_vini_autocomplete()`, usato nel frontend ViniVendite

#### Login PIN + ruolo "sala"
1. **Login tile-based** — rimosso form username/password, sostituito con selezione utente via tile colorate + PIN pad numerico con dot indicators e shake animation su PIN errato
2. **3 utenti reali** — Marco (admin, PIN 5261), Iryna (sala, PIN 0000), Paolo (sala, PIN 0000)
3. **Ruolo "sala"** — nuovo ruolo equivalente a sommelier, propagato su 13+ file (router, frontend, modules.json)
4. **Endpoint `/auth/tiles`** — ritorna lista utenti per la UI di login (pubblico, senza token)

#### Backend Food Cost v2
1. **Migrazione 007** — drop tabelle vecchie, crea nuove: `recipe_categories` (8 categorie default), `recipes` v2 (con is_base, selling_price, prep_time, category_id), `recipe_items` v2 (con sub_recipe_id), `ingredient_supplier_map`
2. **`foodcost_recipes_router.py`** (~500 righe) — CRUD ricette completo con calcolo food cost ricorsivo, conversione unita', sub-ricette
3. **`foodcost_matching_router.py`** (~400 righe) — matching fatture XML a ingredienti con fuzzy search, auto-match, gestione mappings
4. **`foodcost_ingredients_router.py`** esteso — PUT ingredient, GET suppliers, CRUD prezzi
5. **`foodcost_db.py`** semplificato — solo tabelle base, il resto via migrazioni
6. **Eliminati file orfani**: `app/routers/ricette.py`, `app/models/ricette_db.py`

#### Frontend Food Cost v2
1. **`RicetteArchivio.jsx`** — tabella ricette con food cost %, badge colorati, filtri, azioni
2. **`RicetteNuova.jsx`** — form v2: categorie DB, checkbox "ricetta base", sub-ricette, riordino righe
3. **`RicetteDettaglio.jsx`** (NUOVO) — visualizzazione con card riepilogo + tabella costi per riga
4. **`RicetteModifica.jsx`** (NUOVO) — form precaricato con PUT
5. **`RicetteMatching.jsx`** (NUOVO) — matching fatture a 2 tab + auto-match
6. **`RicetteMenu.jsx`** — aggiunta tile matching fatture
7. **`App.jsx`** — nuove route: `/ricette/:id`, `/ricette/modifica/:id`, `/ricette/matching`

#### Design doc + Roadmap
- **`docs/design_ricette_foodcost_v2.md`** — documento di design completo
- **Task #25** in roadmap — sistema permessi centralizzato (TODO futuro)

### Deploy pendente
Marco deve fare `./push.sh "" -f` dal Mac per pushare 5 commit (inclusa migrazione 007 che richiede full deploy).

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-10, sessione 1)

1. **Riorganizzazione menu Cantina** + fix PDF + Impostazioni Carta
2. **Header v2.0** Tailwind + pulizia logout duplicati
3. **Strumenti Cantina** — ponte Excel-Cantina + Genera Carta (6 endpoint backend)
4. **Reforming completo modulo vini** — menu, submenu, route, UX
5. **Analisi modulo Ricette/FoodCost** — ricognizione stato (40% funzionante, architettura da rifare)

---

## Stato attuale del codice — cose critiche da sapere

### Modulo Ricette & Food Cost v2 (NUOVO)
- **Backend completo**: 3 router (recipes, matching, ingredients) + migrazione 007
- **Frontend completo**: 7 pagine (menu, archivio, nuova, dettaglio, modifica, matching, ingredienti + prezzi)
- **Calcolo food cost**: ricorsivo con sub-ricette, cycle detection, conversione unita'
- **Matching fatture**: collegamento righe FE XML a ingredienti, fuzzy + auto-match
- **DB**: foodcost.db con migrazioni 001-007, tabelle recipes/recipe_items/recipe_categories/ingredient_supplier_map
- **Route attive**:
  - `/ricette` → RicetteMenu
  - `/ricette/nuova` → RicetteNuova
  - `/ricette/archivio` → RicetteArchivio
  - `/ricette/:id` → RicetteDettaglio
  - `/ricette/modifica/:id` → RicetteModifica
  - `/ricette/ingredienti` → RicetteIngredienti
  - `/ricette/ingredienti/:id/prezzi` → RicetteIngredientiPrezzi
  - `/ricette/matching` → RicetteMatching
  - `/ricette/import` → RicetteImport (placeholder)

### FORCE IMPORT SENZA CHECK RUOLO
`vini_magazzino_router.py` riga ~403: commento `# per ora nessun controllo di ruolo`.

### `.env` non esiste sul VPS
Il file `.env` con `SECRET_KEY` e' stato creato in locale (gitignored). Sul VPS va creato manualmente.

### Modulo Vini — struttura attuale dopo reforming
**Menu principale** (`ViniMenu.jsx`): 5 voci — Carta dei Vini, Vendite, Cantina, Dashboard, Impostazioni
**Submenu Cantina** (`MagazzinoSubMenu.jsx`): Cantina, Nuovo vino, Genera Carta PDF, (admin) Strumenti
**Strumenti** (`CantinaTools.jsx` v2.0): Registro Movimenti + Modifica Massiva + Sync + Import/Export + Genera Carta + Impostazioni Ordinamento

### Sistema movimenti e locazioni
- Locazione obbligatoria per VENDITA e SCARICO
- Backend valida giacenza insufficiente (HTTP 400)
- Vendite taggate `[BOTTIGLIA]` o `[CALICI]` nel campo note
- DELETE movimento riconcilia tutte le colonne quantita' (fix sessione 2)

---

## Mappa versioni moduli

Fonte di verita': `frontend/src/config/versions.js`

| Modulo | Versione | Stato | Note |
|--------|----------|-------|------|
| Cantina & Vini | v3.6 | stabile | Carta, vendite, magazzino, dashboard, strumenti, ViniNav |
| Gestione Acquisti | v2.0 | stabile | Fatture XML, fornitori, dashboard, categorie (top-level) |
| Ricette & Food Cost | v2.0 | beta | Ricette, sub-ricette, matching fatture, ingredienti |
| Gestione Vendite | v2.0 | stabile | Corrispettivi, chiusure cassa, dashboard, confronto annuale (top-level) |
| Dipendenti | v1.0 | stabile | Anagrafica, ruoli |
| Login & Ruoli | v2.0 | stabile | Login PIN tile-based, 4 ruoli |
| Sistema | v4.1 | stabile | Versione globale gestionale |

Le versioni sono mostrate visualmente nella UI:
- **Home** — badge versione su ogni tile modulo + footer sistema
- **ViniMenu** — badge v3.6 nell'header
- **RicetteMenu** — badge v2.0 nell'header
- **VenditeMenu** — badge v2.0 nell'header
- **AdminMenu** — badge v4.1 nell'header

---

## Task aperti prioritizzati

Vai su `docs/roadmap.md` per la lista completa.

| # | Task | Stato |
|---|------|-------|
| 2 | Aggiornare `.env.production` a HTTPS | Aperto |
| 25 | Sistema permessi centralizzato | TODO |
| - | RicetteImport (import/export JSON) | Placeholder |
| - | Aggiornare RicetteIngredientiPrezzi per nuovi endpoint v2 | Da fare |

---

## Prossima sessione — TODO

1. **Push al VPS** — Marco deve fare `./push.sh "" -f` dal Mac (molti commit, migrazione 007)
2. **Test in produzione** — verificare migrazione 007 + nuove route `/vendite/*` e `/acquisti/*`
3. **Gestione Vendite Fase 2** — coperti e scontrino medio (design doc: `docs/design_gestione_vendite.md`)
4. **Aggiornare RicetteIngredientiPrezzi.jsx** — allineare ai nuovi endpoint v2
5. **RicetteImport** — implementare import/export JSON ricette
6. **Carta Vini web pubblica** — pagina internet aggiornata automaticamente
7. **Riordinare la roadmap** — pulizia task completati

---

## File chiave — dove trovare le cose

```
main.py                                — entry point, include tutti i router
app/services/auth_service.py           — auth PIN sha256_crypt + ruolo "sala"
app/core/security.py                   — JWT + sha256_crypt
app/core/config.py                     — SECRET_KEY (da .env)
app/data/users.json                    — store utenti (marco/iryna/paolo)

# --- MODULO VINI ---
app/routers/vini_magazzino_router.py   — magazzino vini, prefix /vini/magazzino
app/routers/vini_cantina_tools_router.py — strumenti cantina
app/routers/vini_settings_router.py    — impostazioni carta
app/models/vini_magazzino_db.py        — DB cantina: CRUD, movimenti, bulk, autocomplete
app/services/carta_vini_service.py     — builder HTML/PDF carta vini

# --- MODULO RICETTE & FOOD COST v2 ---
app/routers/foodcost_recipes_router.py    — CRUD ricette + calcolo food cost ricorsivo
app/routers/foodcost_matching_router.py   — matching fatture XML → ingredienti
app/routers/foodcost_ingredients_router.py — CRUD ingredienti + prezzi + suppliers
app/models/foodcost_db.py                 — DB foodcost (tabelle base)
app/migrations/007_foodcost_v2.py         — migrazione v2 (drop+ricrea tabelle ricette)
docs/design_ricette_foodcost_v2.md        — design document completo

# --- MODULO GESTIONE VENDITE (ex Corrispettivi) ---
app/routers/admin_finance.py              — backend corrispettivi, prefix /admin/finance
frontend/src/pages/admin/VenditeNav.jsx   — barra navigazione persistente (4 tab)
frontend/src/pages/admin/CorrispettiviMenu.jsx      — hub "Gestione Vendite" (/vendite)
frontend/src/pages/admin/CorrispettiviGestione.jsx   — chiusura cassa (/vendite/chiusure)
frontend/src/pages/admin/CorrispettiviDashboard.jsx  — dashboard mensile (/vendite/dashboard)
frontend/src/pages/admin/CorrispettiviAnnual.jsx     — confronto annuale (/vendite/annual)
frontend/src/pages/admin/CorrispettiviImport.jsx     — import Excel (/vendite/import)
docs/design_gestione_vendite.md            — design document evolutivo (5 fasi)

# --- FRONTEND ---
frontend/src/App.jsx                   — TUTTE le route React
frontend/src/config/api.js             — API_BASE + apiFetch()
frontend/src/config/versions.js        — MODULE_VERSIONS + VersionBadge (UNICA fonte versioni)
frontend/src/components/Header.jsx     — header globale
frontend/src/components/LoginForm.jsx  — login tile PIN
frontend/src/pages/ricette/            — 8 pagine modulo ricette/foodcost v2
frontend/src/pages/vini/               — pagine modulo vini

# --- DOCS ---
docs/changelog.md                      — changelog formato Keep a Changelog
docs/roadmap.md                        — task aperti
docs/design_ricette_foodcost_v2.md     — design ricette/foodcost v2
docs/design_gestione_vendite.md        — design vendite (5 fasi evolutive)
docs/Modulo_FoodCost.md                — documentazione modulo food cost
```

---

## DB — mappa rapida

| Database | Moduli | Note |
|----------|--------|------|
| `app/data/vini.sqlite3` | Carta Vini (legacy Excel) | NON TOCCARE — paracadute; schema v2.1 |
| `app/data/vini_magazzino.sqlite3` | Cantina (DB moderno) | vini_magazzino + movimenti + note; colonna ORIGINE |
| `app/data/vini_settings.sqlite3` | Settings carta | tipologie, nazioni, regioni, filtri |
| `app/data/foodcost.db` | FoodCost + FE XML + Ricette v2 | ingredienti, recipes, recipe_items, recipe_categories, ingredient_supplier_map, fe_fatture, fe_righe; migraz. 001-007 |
| `app/data/admin_finance.sqlite3` | Gestione Vendite (corrispettivi) | daily_closures; import Excel multi-anno |
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

**La fonte di verita' e' sempre il Mac. Non modificare direttamente sul VPS o Windows.**

## Deploy — comandi utili

```bash
# Da Mac — commit e push (VPS si aggiorna automaticamente)
git add <file> && git commit -m "fix: #N descrizione" && git push

# Per full deploy (con migrazione 007):
./push.sh "" -f

# Su Windows (aggiornare remote se non fatto):
git remote set-url origin marco@80.211.131.156:/home/marco/trgb/trgb.git
git pull origin main
```

---

## Aggiorna questo file a fine sessione

Sostituisci la sezione **"Cosa abbiamo fatto"** con i task completati oggi.
Aggiorna la tabella dei task se ne hai chiusi.
Aggiorna la data in cima.

**IMPORTANTE:** Quando aggiungi/modifichi funzionalita' significative a un modulo, aggiorna anche la versione:
1. Cambia il numero in `frontend/src/config/versions.js` (unica fonte di verita')
2. Aggiorna la tabella "Mappa versioni moduli" qui sopra
3. Menziona il bump di versione nel changelog
