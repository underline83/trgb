# TRGB — Briefing per Nuova Sessione
> File scritto da Claude a Claude. Leggilo per intero prima di iniziare a lavorare.
> **Aggiornalo alla fine di ogni sessione.**
> Ultima sessione: 2026-03-13 (sessione 5 — Ricette & Food Cost v3.0: Matching avanzato)

---

## Chi sei e dove sei

Sei l'assistente AI che lavora sul gestionale interno dell'**Osteria Tre Gobbi (Bergamo)**.
Il progetto si chiama **TRGB Gestionale** — un'app web FastAPI + React in produzione su VPS Aruba.
L'utente si chiama **Marco** (mac: `underline83`, win: `mcarm`).

La cartella di lavoro è selezionata come workspace Cowork. Puoi leggere e scrivere direttamente tutti i file del progetto.

---

## Cosa abbiamo fatto nell'ultima sessione (2026-03-13, sessione 5)

### Ricette & Food Cost v3.0 — Matching avanzato + Smart Create + Esclusioni

#### Ricette module reforming (completamento sessione precedente)
1. **RicetteDashboard.jsx** — pagina dashboard con 5 KPI (ricette, basi, FC medio, critiche, buone) + tabelle top5 FC e top5 margini
2. **RicetteSettings.jsx** — pagina strumenti con export JSON, export PDF per ricetta, import JSON (sostituisce vecchio RicetteImport)
3. **App.jsx** — route `/ricette/dashboard`, `/ricette/settings`, redirect `/ricette/import` → `/ricette/settings`
4. **Fix endpoint ordering** in `foodcost_recipes_router.py` — path statici (`/stats/dashboard`, `/export/json`) spostati PRIMA del dynamic `/{recipe_id}`

#### Matching: rimozione LIMIT
5. **Rimosso LIMIT 100** dalla query pending — il matching mostrava solo 100 ingredienti su migliaia
6. **Rimosso completamente il LIMIT** anche a 2000 (Marco: "saranno anche oltre 2000")

#### Smart Create — creazione intelligente ingredienti
7. **Pipeline pulizia nomi** — `_NOISE_PATTERNS` (regex per codici, date, quantita), `_UNIT_MAP` (conversione unita fattura → standard), `_CATEGORY_HINTS` (keyword → categoria: carne, pesce, latticini, verdure, frutta, pasta, olio, bevande)
8. **`GET /matching/smart-suggest`** — raggruppa righe pending per descrizione normalizzata, fuzzy-match contro ingredienti esistenti, suggerisce nome/unita/categoria
9. **`POST /matching/bulk-create`** — crea ingredienti in blocco con auto-mapping + salvataggio prezzi
10. **Tab "Smart Create"** in RicetteMatching — analisi, checkbox con editing inline nome/unita/categoria, creazione in blocco

#### Esclusione fornitori
11. **Esclusione query** — LEFT JOIN `fe_fornitore_categoria` con filtro `escluso=0` su pending e smart-suggest
12. **`GET /matching/suppliers`** — lista fornitori da righe pending con stato esclusione e conteggio
13. **`POST /matching/suppliers/toggle-exclusion`** — toggle flag escluso in `fe_fornitore_categoria`
14. **Tab "Fornitori"** in RicetteMatching — tabella con nome, P.IVA, categoria, righe pending, stato, toggle Escludi/Riattiva

#### Ignora descrizioni non-ingrediente
15. **Migration 012** — tabelle `matching_description_exclusions` + `matching_ignored_righe`
16. **`POST /matching/ignore-description`** — salva descrizione normalizzata + righe come ignorate
17. **`GET /matching/ignored-descriptions`** — lista con conteggio righe
18. **`DELETE /matching/ignored-descriptions/{id}`** — ripristino
19. **Filtro** in pending e smart-suggest per escludere righe/descrizioni ignorate
20. **Pulsante "Ignora"** su ogni suggerimento Smart Create + sezione espandibile "Descrizioni ignorate" con ripristino

#### Versioni
21. **versions.jsx** — Ricette v2.0→v3.0, Sistema v4.1→v4.2

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-11, sessione 4)

### Gestione Vendite v2.0 — Promozione a modulo top-level

1. **Promosso "Gestione Vendite"** (ex Corrispettivi) da sotto-sezione Admin a modulo di primo livello nella Home
2. **Route migrate** da `/admin/corrispettivi/*` a `/vendite/*` (5 route + 1 nuova)
3. **VenditeNav.jsx** — barra navigazione persistente (5 tab: Riepilogo, Chiusure, Dashboard, Annuale, Import)
4. **CorrispettiviRiepilogo.jsx** — riepilogo chiusure mese per mese multi-anno
5. **Bugfix**: Dashboard 401 (apiFetch), query params URL, ImportResult conteggi

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
- **Matching fatture**: collegamento righe FE XML a ingredienti, fuzzy + auto-match + smart create + esclusioni fornitori/descrizioni
- **DB**: foodcost.db con migrazioni 001-012, tabelle recipes/recipe_items/recipe_categories/ingredient_supplier_map/matching_description_exclusions/matching_ignored_righe
- **Route attive**:
  - `/ricette` → RicetteMenu
  - `/ricette/nuova` → RicetteNuova
  - `/ricette/archivio` → RicetteArchivio
  - `/ricette/:id` → RicetteDettaglio
  - `/ricette/modifica/:id` → RicetteModifica
  - `/ricette/ingredienti` → RicetteIngredienti
  - `/ricette/ingredienti/:id/prezzi` → RicetteIngredientiPrezzi
  - `/ricette/matching` → RicetteMatching (4 tab: Da associare, Smart Create, Mappings, Fornitori)
  - `/ricette/dashboard` → RicetteDashboard
  - `/ricette/settings` → RicetteSettings (ex RicetteImport)

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
| Ricette & Food Cost | v3.0 | beta | Ricette, sub-ricette, matching fatture, smart create, esclusioni fornitori/descrizioni |
| Gestione Vendite | v2.0 | stabile | Corrispettivi, chiusure cassa, dashboard, confronto annuale (top-level) |
| Dipendenti | v1.0 | stabile | Anagrafica, ruoli |
| Login & Ruoli | v2.0 | stabile | Login PIN tile-based, 4 ruoli |
| Sistema | v4.2 | stabile | Versione globale gestionale |

Le versioni sono mostrate visualmente nella UI:
- **Home** — badge versione su ogni tile modulo + footer sistema
- **ViniMenu** — badge v3.6 nell'header
- **RicetteMenu** — badge v3.0 nell'header
- **VenditeMenu** — badge v2.0 nell'header
- **AdminMenu** — badge v4.2 nell'header

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

1. **Deploy v3.0** — `./push.sh "Ricette v3.0: matching avanzato + smart create + esclusioni" -f`
2. **Test in produzione** — verificare Smart Create, Fornitori, Ignora descrizioni, Dashboard ricette, Settings
3. **Conversioni unita ingredienti** — gestire equivalenze kg↔g, L↔ml ecc. per ingredienti comprati in un'unita e usati in un'altra
4. **Gestione Vendite Fase 2** — foglio 2 Excel (breakdown pranzo/cena, coperti, preconto), nuove colonne DB, scontrino medio
5. **Aggiornare RicetteIngredientiPrezzi.jsx** — allineare ai nuovi endpoint v2
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
app/routers/foodcost_matching_router.py   — matching fatture XML → ingredienti + smart create + esclusioni
app/routers/foodcost_ingredients_router.py — CRUD ingredienti + prezzi + suppliers
app/models/foodcost_db.py                 — DB foodcost (tabelle base)
app/migrations/007_foodcost_v2.py         — migrazione v2 (drop+ricrea tabelle ricette)
app/migrations/012_matching_description_exclusions.py — tabelle ignora descrizioni matching
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
frontend/src/pages/ricette/            — 10 pagine modulo ricette/foodcost v3 (+ Dashboard, Settings)
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
| `app/data/foodcost.db` | FoodCost + FE XML + Ricette v3 | ingredienti, recipes, recipe_items, recipe_categories, ingredient_supplier_map, fe_fatture, fe_righe, fe_fornitore_categoria, matching_description_exclusions, matching_ignored_righe; migraz. 001-012 |
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

## Deploy — PROCEDURA OBBLIGATORIA

> **IMPORTANTE PER CLAUDE:** Dopo ogni commit, ricorda SEMPRE a Marco di fare il deploy
> con `push.sh`. Non dare mai comandi manuali (`git push`, `git pull`, `ssh`...).
> Lo script `push.sh` nella root del progetto fa TUTTO automaticamente:
> commit + push + deploy sul VPS.

### Uso di push.sh (UNICO metodo di deploy)

```bash
# Deploy rapido (git pull + restart backend/frontend):
./push.sh "messaggio commit"

# Deploy completo (git pull + pip install + npm install + restart):
./push.sh "messaggio commit" -f

# Se non ci sono modifiche da committare ma serve solo pushare:
./push.sh ""

# Se serve npm run build sul frontend, usare -f:
./push.sh "fix: descrizione" -f
```

### Cosa fa push.sh:
1. Se ci sono modifiche locali → `git add -A && git commit`
2. `git push` al remote VPS
3. SSH al VPS → `git pull` + restart servizi
4. Con `-f`: anche `pip install` + `npm install`

### Quando usare -f (full deploy):
- Nuove dipendenze Python (`requirements.txt`)
- Nuove dipendenze npm (`package.json`)
- Dopo modifiche al frontend che richiedono rebuild

### NOTA: Claude NON può eseguire push.sh
Lo script richiede accesso SSH al VPS che non è disponibile dalla sandbox Cowork.
Marco deve lanciarlo dal terminale del Mac:
```bash
cd ~/trgb/trgb && ./push.sh "messaggio" -f
```

### Su Windows (aggiornare remote se non fatto):
```bash
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
