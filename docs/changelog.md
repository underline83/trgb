# 📄 TRGB Gestionale — CHANGELOG
**Formato:** Keep a Changelog

---

## 2026-03-21 — Modulo iPratico Sync v2.0

### Added
- **Sincronizzazione prodotti iPratico** — nuovo modulo per import/export bidirezionale tra iPratico e magazzino vini TRGB
- **`app/routers/ipratico_products_router.py`** v2.0 — 10 endpoint sotto `/vini/ipratico/`: upload, mappings, ignore, export, missing, export-defaults, sync-log, stats, trgb-wines
- **`frontend/src/pages/vini/iPraticoSync.jsx`** v2.0 — pagina workflow lineare (no tab): import → verifica → esporta
- **Migrazioni 020–022** in `foodcost.db`:
  - `ipratico_product_map` — mapping prodotti iPratico ↔ vini TRGB
  - `ipratico_sync_log` — storico sincronizzazioni
  - `ipratico_export_defaults` — valori default configurabili per nuovi vini (Family, reparti, listini)
- **Match diretto per ID** — il codice 4 cifre nel Name iPratico corrisponde a `vini_magazzino.id` (~99.7% match rate)
- **TRGB ha priorita'** — l'export ricostruisce il Name da dati TRGB se cambiati
- **Vini mancanti** — l'export aggiunge automaticamente righe per vini TRGB non presenti su iPratico con tutti i campi default compilati (12 campi prezzo, reparti, family, hidden, listini)
- **Default configurabili** — pannello collassabile nella sezione Export per modificare i valori default senza toccare il codice
- **Ignore/Ripristina** — toggle per prodotti iPratico senza corrispondenza TRGB
- **Tile "Import/Export iPratico"** nella home modulo Vini (`ViniMenu.jsx`)
- **`push.sh`** — aggiunto download automatico database dal VPS prima di ogni push

---

## 2026-03-16 — Cantina & Vini v4.0: Filtro locazioni unificato, Stampa selezionati PDF, SchedaVino sidebar+main

### Added
- **Stampa selezionati diretta PDF** — il pulsante "Stampa selezionati" in MagazzinoVini ora genera direttamente un PDF dei vini selezionati senza aprire il dialog StampaFiltrata
- **Endpoint `POST /vini/cantina-tools/inventario/selezione/pdf`** — accetta lista ID via Body, genera PDF con WeasyPrint e ritorna `Response` con bytes (autenticazione Bearer token, no query token)
- **Mappa colori `TIPOLOGIA_SIDEBAR`** in SchedaVino.jsx — gradiente sidebar dinamico per ciascuna tipologia (ROSSI=rosso, BIANCHI=ambra, BOLLICINE=giallo, ROSATI=rosa, PASSITI=arancio, GRANDI FORMATI=viola, ANALCOLICI=teal)

### Changed
- **SchedaVino.jsx** v5.0 — layout completamente riscritto da scroll verticale a **sidebar+main** con CSS grid `grid-cols-[260px_1fr]`:
  - Sidebar (260px): nome vino, badge #id, griglia 4 stat box, lista info, pulsanti azione (Modifica anagrafica/giacenze, Duplica, Chiudi)
  - Main: area scrollabile con sezioni Anagrafica, Giacenze, Movimenti, Note
  - Colore sidebar determinato dinamicamente dalla TIPOLOGIA del vino (stesso schema colori usato nella tabella MagazzinoVini)
- **MagazzinoVini.jsx** v4.0 — **filtro locazioni unificato**: sostituiti 8 state vars e 6 select cascading con 2 soli dropdown:
  - "Locazione": tutti i nomi da tutte le 4 sezioni config, deduplicati e ordinati
  - "Spazio": spazi unificati per la locazione selezionata (inclusi spazi matrice generati)
  - Logica di filtro cerca contemporaneamente su tutte e 4 le colonne DB (FRIGORIFERO, LOCAZIONE_1, LOCAZIONE_2, LOCAZIONE_3)
- **`handlePrintSelection()`** in MagazzinoVini — entrambi i pulsanti "Stampa selezionati" ora chiamano direttamente il nuovo endpoint POST (fetch+blob+createObjectURL), il pulsante "Con filtri..." nel dropdown mantiene apertura StampaFiltrata

### Notes
- StampaFiltrata mantiene i propri filtri per-locazione separati (server-side) — è intenzionale
- Le modifiche non sono ancora state testate nel browser

---

## 2026-03-15c — Modulo Statistiche v1.0

### Added
- **Modulo Statistiche** — nuovo modulo per import e analisi dati vendite da iPratico
- **`app/migrations/018_ipratico_vendite.py`** — 3 tabelle: `ipratico_imports`, `ipratico_categorie`, `ipratico_prodotti` con indici su (anno, mese)
- **`app/services/ipratico_parser.py`** — parser export iPratico (.xls HTML) con `pd.read_html()`, gestisce encoding variabile
- **`app/routers/statistiche_router.py`** v1.0 — 7 endpoint sotto `/statistiche`: import-ipratico, mesi, categorie, prodotti, top-prodotti, trend, elimina mese
- **Frontend Statistiche** — 5 componenti React:
  - `StatisticheMenu.jsx` — menu principale modulo
  - `StatisticheNav.jsx` — tab navigation
  - `StatisticheDashboard.jsx` — KPI, categorie per fatturato, top 15 prodotti, trend mensile (bar chart CSS)
  - `StatisticheProdotti.jsx` — dettaglio prodotti con filtri, ricerca e paginazione
  - `StatisticheImport.jsx` — upload .xls con selettore anno/mese, storico import, eliminazione mese
- **Route** `/statistiche`, `/statistiche/dashboard`, `/statistiche/prodotti`, `/statistiche/import` in `App.jsx`
- **Home tile** Statistiche con badge versione
- **`modules.json`** — aggiunto modulo `statistiche` (ruoli: admin, viewer)
- **`versions.jsx`** — aggiunto `statistiche: v1.0 beta`

---

## 2026-03-15b — Unificazione loader carta + DOCX tabelle + fix cancellazione movimenti

### Fixed
- **`vini_magazzino_db.py`** `delete_movimento()` — cancellare un movimento VENDITA/SCARICO azzerava la giacenza perché il replay partiva da zero perdendo lo stock iniziale importato da Excel. Ora usa **inversione del delta** (per RETTIFICA mantiene il replay conservativo)

### Changed
- **`carta_vini_service.py`** v1.1 — aggiunta `build_carta_docx()` condivisa: genera DOCX con **tabelle senza bordi a 3 colonne** (descrizione 67% | annata 15% | prezzo 18%) invece di tab stops che sfondavano con descrizioni lunghe
- **`vini_router.py`** — endpoint `/carta/docx` semplificato: usa `build_carta_docx()` condiviso, rimossi import `Document`, `Inches`, `groupby`
- **`vini_cantina_tools_router.py`** v3.1 — eliminata `_load_vini_cantina_ordinati()` (~70 righe duplicate), tutti gli endpoint carta (HTML/PDF/DOCX) usano `load_vini_ordinati()` dal repository; endpoint DOCX semplificato

### Removed
- **`_load_vini_cantina_ordinati()`** — funzione duplicata nel cantina tools router, sostituita da import condiviso

---

## 2026-03-15 — Eliminazione vecchio DB vini.sqlite3 + fix carta v3.1

### Removed
- **`vini.sqlite3`** — vecchio DB Carta Vini (generato da import Excel) eliminato; tutto ora su `vini_magazzino.sqlite3`
- **Endpoint `POST /vini/upload`** — import Excel vecchio rimosso da `vini_router.py`
- **Endpoint `POST /vini/cantina-tools/sync-from-excel`** — sincronizzazione vecchio DB → cantina rimossa
- **Tasto "Importa file Excel"** da pagina Carta Vini (`ViniCarta.jsx`)
- **UI sincronizzazione** da `CantinaTools.jsx` e `ViniImpostazioni.jsx`
- **Codice migrazione vecchio DB** da `vini_settings.py`
- **`mockup_nazione.html`** — file mockup temporaneo

### Changed
- **`vini_router.py`** v3.0 — movimenti ora su `vini_magazzino_db` (era `vini_db`), rimossi import da `vini_db`/`vini_model`
- **`vini_cantina_tools_router.py`** v3.0 — rimosso sync-from-excel, mantenuto import-excel (diretto → magazzino)
- **`ViniCarta.jsx`** v3.3 — rimosso import Excel, griglia 4 colonne, sottotitolo aggiornato
- **`ViniDatabase.jsx`** — upload ora punta a `/cantina-tools/import-excel` con `apiFetch`
- **`carta_html.css`** v3.1 — allineato a PDF: stili nazione con filetti decorativi, Google Fonts import, spaziature coerenti
- **`carta_pdf.css`** v3.1 — `page-break-after: avoid` su `.tipologia`, `.nazione`, `.regione`, `.produttore` per evitare intestazioni orfane in fondo pagina

### Notes
- `vini_db.py` e `vini_model.py` restano nel codice (deprecated) — `normalize_dataframe` ancora usata da import-excel
- `core/database.py` mantenuto per dipendenza pre-esistente da `fe_import.py`

---

## 2026-03-14c — Cambio PIN self-service + reset admin

### Added
- **Pagina CambioPIN** (`/cambio-pin`) — accessibile a tutti gli utenti loggati
  - Cambio PIN proprio: verifica PIN attuale (obbligatorio per non-admin) + nuovo PIN + conferma
  - Sezione admin: lista utenti con pulsante "Reset → 0000" per ciascuno
  - PinInput component: type=password, inputMode=numeric, filtra non-digit
- **Icona 🔑 nel Header** — accanto al logout, per accesso rapido alla pagina Cambio PIN
- **Route `/cambio-pin`** in App.jsx + import CambioPIN

---

## 2026-03-14b — Chiusure Turno: modulo completo fine servizio

### Added
- **Modulo Chiusure Turno** — sistema completo per chiusura fine servizio (pranzo/cena)
  - **`chiusure_turno.py`** — backend con tabelle: `shift_closures` (con fondo_cassa_inizio/fine), `shift_checklist_config`, `shift_checklist_responses`, `shift_preconti`, `shift_spese`
  - **`ChiusuraTurno.jsx`** v2.0 — form completo con:
    - Preconto rinominato "Chiusura Parziale" (pranzo) / "Chiusura" (cena) dinamicamente
    - Sezione Pre-conti: righe dinamiche (tavolo + importo) per tavoli non battuti
    - Sezione Spese: righe dinamiche (tipo: scontrino/fattura/personale/altro + descrizione + importo)
    - Fondo Cassa: inizio e fine servizio
    - **Logica cena cumulativa**: staff inserisce totali giornalieri, il sistema sottrae pranzo per calcolare parziali cena
    - Hint "pranzo €X → parz. cena €Y" sotto ogni campo in modalita' cena
    - Banner esplicativo in modalita' cena
    - Riepilogo differenziato: pranzo mostra totali semplici, cena mostra giorno→pranzo→parziale
    - Quadratura: `(incassi + preconti) - chiusura_parziale`
  - **`ChiusureTurnoLista.jsx`** — pagina admin con lista completa chiusure
    - Filtri: range date (default ultimi 30 giorni), turno (tutti/pranzo/cena)
    - Totali periodo: n. chiusure, totale incassi, totale coperti, totale spese
    - Ogni riga: data, turno badge, inserita da (created_by), chiusura, incassi, coperti, spese, quadratura (dot verde/rosso)
    - Espandi per dettaglio: incassi breakdown, fondo cassa, pre-conti, spese con badge tipo, note
    - Pulsante "Modifica" per riaprire il form
- **VenditeNav aggiornato** — tab "Fine Turno" visibile a tutti, altri tab admin-only
- **Route** `/vendite/fine-turno` → ChiusuraTurno, `/vendite/chiusure` → ChiusureTurnoLista (sostituisce vecchio CorrispettiviGestione)

### Changed
- **VenditeNav.jsx** v2.0 — visibilita' tab per ruolo (`roles: null` = tutti, `roles: ["admin"]` = solo admin)
- **App.jsx** — nuove route + vecchio `/vendite/chiusure-old` preservato come fallback
- **admin_finance.sqlite3** — nuove tabelle shift_closures, shift_preconti, shift_spese con auto-migrazione colonne

---

## 2026-03-14 — Cantina & Vini v3.7: Filtri locazione gerarchici, Dashboard KPI valore, Modifica massiva migliorata

### Added
- **Filtri locazione gerarchici (cascading)** — in Cantina e Stampa Filtrata, il singolo dropdown locazione è stato sostituito con 3 gruppi indipendenti (Frigorifero, Locazione 1, Locazione 2), ciascuno con selettore nome (contenitore) e spazio (sotto-contenitore) cascading
- **Backend filtri gerarchici** — 6 nuovi parametri (`frigo_nome`, `frigo_spazio`, `loc1_nome`, `loc1_spazio`, `loc2_nome`, `loc2_spazio`) nell'endpoint PDF filtrato, con logica di match gerarchica (nome solo → LIKE, nome+spazio → match esatto)
- **Dashboard KPI valore** — 2 nuove tile: Valore acquisto (somma QTA × listino) e Valore carta (somma QTA × prezzo carta) con formattazione euro
- **Dashboard liste espandibili** — vini in carta senza giacenza e vini fermi ora mostrano tutti i risultati (rimosso LIMIT) con pulsante "Mostra tutti / Comprimi"
- **Modifica massiva ordinabile** — click sugli header delle colonne per ordinare ASC/DESC con indicatori ▲/▼/⇅
- **Dropdown locazioni configurate ovunque** — LOCAZIONE_1 e LOCAZIONE_2 ora usano select con valori configurati (come FRIGORIFERO) in dettaglio, nuovo vino e modifica massiva
- **Filtro locazione in Cantina** — aggiunto nella barra filtri principale
- **Filtro locazione in PDF inventario filtrato** — backend + frontend

### Changed
- **MagazzinoVini.jsx** v3.0 — filtri locazione gerarchici con 6 select cascading
- **MagazzinoAdmin.jsx** v2.0 — colonne ordinabili, loc_select per FRIGORIFERO/LOCAZIONE_1/LOCAZIONE_2
- **MagazzinoViniDettaglio.jsx** v4.1 — dropdown configurati per locazioni 1 e 2
- **MagazzinoViniNuovo.jsx** v1.2 — dropdown configurati per locazioni 1 e 2
- **DashboardVini.jsx** v3.0 — liste espandibili, KPI valore, vini fermi senza LIMIT
- **vini_cantina_tools_router.py** v2.0 — filtri gerarchici, opzioni loc1/loc2 nell'endpoint locazioni-config
- **vini_magazzino_db.py** v1.3 — dashboard: valore_acquisto, valore_carta, total_alert_carta, total_vini_fermi, rimosso LIMIT
- **versions.jsx** — Cantina & Vini v3.6→v3.7, Sistema v4.2→v4.3

### Fixed
- **Vini fermi** — il calcolo ora include correttamente anche i vini senza alcun movimento (mai movimentati)

---

## 2026-03-13b — Modulo Banca v1.0 + Conversioni unità ingredienti + Smart Create UX

### Added
- **Modulo Banca v1.0** — nuovo modulo completo per monitoraggio movimenti bancari
  - **Migration 014** — 4 tabelle: `banca_movimenti`, `banca_categorie_map`, `banca_fatture_link`, `banca_import_log`
  - **banca_router.py** — 11 endpoint: import CSV Banco BPM con dedup (hash data+importo+descrizione), lista movimenti con filtri (data/categoria/tipo/search + paginazione), dashboard aggregati (KPI + breakdown per categoria + ultimi movimenti), categorie mapping banca→custom (CRUD), cross-ref fatture XML (match automatico ±5% importo ±10 giorni, link/unlink manuale), andamento temporale (giorno/settimana/mese), storico import
  - **6 pagine frontend**: BancaNav (tabs emerald), BancaMenu (5 card), BancaDashboard (4 KPI + grafico barre CSS + breakdown entrate/uscite per categoria + ultimi movimenti + filtri periodo con preset), BancaMovimenti (tabella filtrata + paginazione), BancaImport (upload CSV + storico), BancaCategorie (mapping custom con colori), BancaCrossRef (collega pagamenti a fatture con suggerimenti automatici)
  - **Integrazione**: main.py, App.jsx (6 route `/banca/*`), Home.jsx (card Banca), versions.jsx (Banca v1.0 beta), modules.json
- **Conversioni unità per ingrediente** — sistema conversioni custom + chain resolution
  - **Migration 013** — tabella `ingredient_unit_conversions` (per-ingredient custom conversions)
  - **`convert_qty` potenziato** — cerca prima conversioni custom (diretta, inversa, chain), poi fallback a standard
  - **`_save_price_from_riga`** — auto-normalizza prezzi fattura usando `convert_qty`
  - **Endpoint CRUD** in ingredients router: GET/POST/DELETE conversioni per ingrediente
  - **UI** in RicetteIngredientiPrezzi.jsx v2.0 — sezione espandibile "Conversioni unità personalizzate"
- **Smart Create: Seleziona/Deseleziona tutti** — pulsanti nel tab Smart Create + default tutti deselezionati (l'utente sceglie manualmente)

### Changed
- **RicetteMatching.jsx** v5.1 — aggiunta select all/deselect all + default deselected
- **foodcost_recipes_router.py** — `convert_qty` accetta `ingredient_id` e `cur` opzionali per custom conversions
- **foodcost_matching_router.py** — `_save_price_from_riga` con auto-normalizzazione prezzo
- **foodcost_ingredients_router.py** v1.4 — endpoint conversioni unità
- **RicetteIngredientiPrezzi.jsx** v2.0 — sezione conversioni
- **versions.jsx** — aggiunta Banca v1.0 beta
- **App.jsx** v3.7 — 6 route banca
- **Home.jsx** v3.1 — card Banca in homepage
- **modules.json** — aggiunto modulo banca (admin only)

---

## 2026-03-13a — Ricette & Food Cost v3.0: Matching avanzato + Smart Create + Esclusioni

### Added
- **Smart Create** — tab nel Matching che analizza le righe fattura pending, raggruppa per descrizione normalizzata, pulisce i nomi con pipeline regex, suggerisce unita/categoria, fuzzy-match contro ingredienti esistenti, e crea ingredienti in blocco con auto-mapping
- **Esclusione fornitori** — tab "Fornitori" nel Matching: lista tutti i fornitori con righe pending, toggle per escludere quelli che non vendono ingredienti (servizi, attrezzature, ecc.). Endpoint `GET/POST /matching/suppliers`, toggle-exclusion
- **Ignora descrizioni non-ingrediente** — pulsante "Ignora" su ogni suggerimento Smart Create per escludere voci come trasporto, spedizione, consulenze. Tabelle `matching_description_exclusions` + `matching_ignored_righe`. Endpoint CRUD `/matching/ignore-description`, `/matching/ignored-descriptions`
- **Sezione "Descrizioni ignorate"** — espandibile in fondo al tab Smart Create, con ripristino one-click
- **RicetteDashboard.jsx** — pagina dashboard con 5 KPI + tabelle top5 FC e margini
- **RicetteSettings.jsx** — pagina strumenti con export JSON, export PDF per ricetta, import JSON
- **Migration 012** — `matching_description_exclusions` + `matching_ignored_righe`

### Changed
- **foodcost_matching_router.py** v3.0 — pipeline pulizia nomi (_NOISE_PATTERNS, _UNIT_MAP, _CATEGORY_HINTS), smart-suggest con grouping, bulk-create, esclusione fornitori e descrizioni nei query pending/smart-suggest
- **RicetteMatching.jsx** v5.0 — 4 tab: Da associare, Smart Create (con Ignora), Mappings, Fornitori
- **foodcost_recipes_router.py** — fix endpoint ordering (static paths prima di `{recipe_id}`)
- **App.jsx** — route `/ricette/dashboard`, `/ricette/settings`, redirect `/ricette/import` → `/ricette/settings`
- **Rimosso LIMIT 100** dalla query pending matching (mostrava solo 100 ingredienti su migliaia)
- **versions.jsx** — Ricette v2.0→v3.0, Sistema v4.1→v4.2

---

## 2026-03-11a — Riepilogo Chiusure + bugfix Dashboard e Import

### Added
- **CorrispettiviRiepilogo.jsx** — nuova pagina `/vendite/riepilogo` con riepilogo chiusure mese per mese, accordion per anno, KPI complessivi, click-through a dashboard mensile
- **Tab "Riepilogo"** in VenditeNav (ora 5 tab)
- **Tile "Riepilogo Mensile"** nel hub Gestione Vendite
- **scripts/report_chiusure_mensili.py** — report CLI chiusure da lanciare sul server

### Fixed
- **CorrispettiviDashboard 401** — usava `fetch()` senza JWT; sostituito con `apiFetch()`
- **Dashboard ignora query params** — click da Riepilogo a `/vendite/dashboard?year=2025&month=1` ora apre il mese corretto (legge `year`/`month` da URL con `useSearchParams`)
- **ImportResult senza conteggi** — endpoint non restituiva `inserted`/`updated`; aggiunti al modello Pydantic e alla risposta

---

## 2026-03-10g — Gestione Vendite v2.0: promozione a modulo top-level

### Added
- **Modulo "Gestione Vendite"** promosso a sezione top-level nella Home (ex Corrispettivi)
- **Route migrate** da `/admin/corrispettivi/*` a `/vendite/*` (5 route)
- **VenditeNav.jsx** — barra navigazione persistente per sezione vendite (4 tab: Chiusure, Dashboard, Annuale, Import)
- **VenditeMenu hub** — pagina menu rinnovata con mini-KPI, VersionBadge, tile Confronto Annuale
- **Tile "Gestione Vendite"** nella Home con badge versione

### Changed
- **CorrispettiviMenu.jsx** → hub "Gestione Vendite" con VenditeNav + KPI
- **CorrispettiviGestione.jsx** — VenditeNav, route `/vendite/chiusure`
- **CorrispettiviDashboard.jsx** — VenditeNav, route `/vendite/dashboard`
- **CorrispettiviAnnual.jsx** — VenditeNav, route `/vendite/annual`
- **CorrispettiviImport.jsx** — VenditeNav, route `/vendite/import`
- **AdminMenu.jsx** — rimossa tile Corrispettivi
- **Home.jsx** — aggiunta entry `vendite`, subtitle admin aggiornato
- **modules.json** — aggiunto modulo `vendite`, aggiornato admin
- **versions.jsx** — Corrispettivi v2.0 "Gestione Vendite", Sistema v4.1

---

## 2026-03-10f — Gestione Acquisti v2.0 + ViniNav + Versioning v4.0

### Added
- **Modulo "Gestione Acquisti"** promosso a sezione top-level nella Home
- **Route migrate** da `/admin/fatture/*` a `/acquisti/*` (8 route)
- **FattureFornitoriElenco.jsx** — elenco fornitori con ricerca, ordinamento, KPI
- **ViniNav.jsx** — barra navigazione persistente per modulo Vini (5 tab)
- **ViniNav applicata** a 11 pagine vini (rimosso MagazzinoSubMenu)
- **Tile "Gestione Acquisti"** nella Home
- **Docs/Modulo_Acquisti.md** — documentazione completa

### Changed
- **Home.jsx** — aggiunta entry `acquisti`, subtitle admin aggiornato
- **AdminMenu.jsx** — rimossa tile Fatture
- **FattureMenu.jsx** — rinominato "Gestione Acquisti", 3 colonne, link Home
- **FattureNav.jsx** — brand "Acquisti", link Home
- **modules.json** — aggiunto modulo `acquisti`
- **versions.jsx** — Vini v3.6, Fatture v2.0, Sistema v4.0

---

## 2026-03-10e — Sistema versioning moduli

### Added
- **`frontend/src/config/versions.js`** — config centralizzata versioni moduli + componente `VersionBadge` riutilizzabile
- **Badge versione su Home** — ogni tile modulo mostra la versione corrente con colore (verde=stabile, blu=beta)
- **Badge versione su menu moduli** — ViniMenu (v3.5), RicetteMenu (v2.0), AdminMenu (v3.5)
- **Footer sistema** — versione globale in fondo alla Home
- **Mappa versioni in SESSIONE.md** — tabella riepilogativa + reminder aggiornamento

---

## 2026-03-10d — Modulo Ricette & Food Cost v2 (rebuild completo)

### Added
- **Login tile-based con PIN** — selezione utente via tile colorate + PIN pad numerico, shake animation su errore, supporto tastiera
- **Ruolo "sala"** — nuovo ruolo equivalente a sommelier, propagato su 13+ file (router, modules.json, frontend)
- **Endpoint `GET /auth/tiles`** — lista utenti per UI login (pubblico)
- **Migrazione 007** — drop tabelle ricette vecchie, crea: `recipe_categories` (8 default), `recipes` v2 (is_base, selling_price, prep_time, category_id), `recipe_items` v2 (sub_recipe_id), `ingredient_supplier_map`
- **`foodcost_recipes_router.py`** (~500 righe) — CRUD ricette con:
  - Calcolo food cost ricorsivo con cycle detection
  - Sistema conversione unita' (kg/g, L/ml/cl, pz)
  - Sub-ricette (ingredient_id OR sub_recipe_id, mutuamente esclusivi)
  - Response: total_cost, cost_per_unit, food_cost_pct
  - Endpoint: GET/POST/PUT/DELETE ricette, GET/POST categorie, GET basi
- **`foodcost_matching_router.py`** (~400 righe) — matching fatture XML a ingredienti:
  - GET /matching/pending, GET /matching/suggest (fuzzy SequenceMatcher)
  - POST /matching/confirm, POST /matching/auto (batch)
  - GET/DELETE /matching/mappings
- **`foodcost_ingredients_router.py`** esteso — PUT ingredient, GET suppliers, GET/POST/DELETE prezzi
- **`RicetteDettaglio.jsx`** — visualizzazione ricetta con 4 card riepilogo (costo totale, costo/porzione, vendita, FC%), tabella ingredienti con costo riga, totale footer
- **`RicetteModifica.jsx`** — form modifica precaricato, salva con PUT
- **`RicetteMatching.jsx`** — UI matching fatture a 2 tab (pending + mappings), suggerimenti fuzzy, auto-match
- **Route**: `/ricette/:id`, `/ricette/modifica/:id`, `/ricette/matching`
- **`docs/design_ricette_foodcost_v2.md`** — design document completo del modulo
- **Task #25 roadmap** — sistema permessi centralizzato (TODO)

### Changed
- **`RicetteArchivio.jsx`** — riscritto: tabella con food cost %, badge colorati (verde/giallo/rosso), filtri nome/tipo/categoria, azioni modifica/disattiva
- **`RicetteNuova.jsx`** — riscritto v2: categorie da DB, checkbox "ricetta base", pulsanti separati +Ingrediente/+Sub-ricetta, riordino righe, prezzo vendita, tempo preparazione
- **`RicetteMenu.jsx`** — aggiunta tile "Matching fatture"
- **`foodcost_db.py`** — semplificato, solo tabelle base (migrazioni fanno il resto)
- **`App.jsx`** — registrate 3 nuove route ricette + 1 matching
- **`app/data/users.json`** — 3 utenti reali (marco admin, iryna/paolo sala) con PIN hash
- **`auth_service.py`** — display_name, list_tiles(), ruolo "sala" in VALID_ROLES

### Fixed
- **`delete_movimento()`** — ora riconcilia TUTTE le colonne quantita' (QTA_FRIGO, QTA_LOC1/2/3), non solo QTA_TOTALE
- **Ricerca vendite** — `search_vini_autocomplete()` con parametro `solo_disponibili=true` per nascondere vini a giacenza zero

### Removed
- **`app/routers/ricette.py`** — router orfano mai montato (sostituito da foodcost_recipes_router)
- **`app/models/ricette_db.py`** — DB parallelo mai usato (sostituito da foodcost_db con migrazioni)

---

## 2026-03-10c — Riorganizzazione menu Cantina + fix PDF + Impostazioni Carta

### Added
- **"📄 Genera Carta PDF"** nel submenu Cantina — bottone diretto che scarica il PDF senza pagine intermedie (visibile a tutti)
- **Impostazioni Ordinamento Carta** in Strumenti — UI completa per:
  - Ordine Tipologie (lista riordinabile con frecce ▲▼ + salva)
  - Ordine Nazioni (lista riordinabile + salva)
  - Ordine Regioni per nazione (select nazione → lista riordinabile + salva)
  - Filtri Carta (quantità minima, mostra negativi, mostra senza prezzo)
- **Registro Movimenti** e **Modifica Massiva** accessibili da Strumenti (pulsanti rapidi in cima)

### Changed
- **MagazzinoSubMenu.jsx**: rimossi "Registro movimenti" e "Modifica massiva" dal menu (spostati in Strumenti); aggiunto bottone "Genera Carta PDF"
- **CantinaTools.jsx** (v2.0): riscritto con 4 sezioni: Sync, Import/Export, Genera Carta (HTML+PDF+Word), Impostazioni Ordinamento
- **vini_cantina_tools_router.py**: fix PDF frontespizio — corrette classi CSS (`front-logo`, `front-title`, `front-subtitle`), aggiunto wrapper `carta-body`, corretto `base_url` e caricamento CSS per match esatto con vecchio sistema

### Fixed
- **PDF cantina**: logo non visibile, titolo sbagliato, frontespizio su 2 pagine, subtitle diverso — ora identico al PDF generato dal vecchio sistema

---

## 2026-03-10b — Strumenti Cantina: ponte Excel ↔ Cantina + Genera Carta

### Added
- **vini_cantina_tools_router.py**: nuovo router backend con 6 endpoint:
  - `POST /vini/cantina-tools/sync-from-excel` — sincronizza vini.sqlite3 → cantina (upsert: anagrafica aggiornata, giacenze intatte per vini esistenti)
  - `POST /vini/cantina-tools/import-excel` — import diretto Excel → cantina (senza passare dal vecchio DB)
  - `GET /vini/cantina-tools/export-excel` — esporta cantina in .xlsx compatibile con Excel storico
  - `GET /vini/cantina-tools/carta-cantina` — genera carta HTML dal DB cantina
  - `GET /vini/cantina-tools/carta-cantina/pdf` — genera PDF carta dal DB cantina
  - `GET /vini/cantina-tools/carta-cantina/docx` — genera DOCX carta dal DB cantina
- **CantinaTools.jsx**: pagina frontend admin-only con UI per sync, import, export e genera carta
- **Colonna ORIGINE** in `vini_magazzino`: flag 'EXCEL' o 'MANUALE' per tracciare provenienza vini
- Route `/vini/magazzino/tools` in App.jsx
- Link "🔧 Strumenti" in MagazzinoSubMenu.jsx (admin only)
- Autenticazione via query token per endpoint di download (window.open)

### Changed
- **vini_magazzino_db.py**: `create_vino()` ora setta ORIGINE='MANUALE' di default; `upsert_vino_from_carta()` setta ORIGINE='EXCEL'
- **main.py**: registrato nuovo router `vini_cantina_tools_router`

---

## 2026-03-10 — Reforming Modulo Vini (v2026.03.10a)

### Added
- **RegistroMovimenti.jsx**: pagina admin-only con log globale di tutti i movimenti cantina
  - Filtri: tipo, testo (vino/produttore), range date, con paginazione server-side (50/pagina)
  - Click su vino → scheda dettaglio
  - Bottone "Pulisci filtri" + "Aggiorna"
- `MagazzinoSubMenu.jsx`: aggiunto link "📜 Registro movimenti" (admin only)
- `App.jsx`: route `/vini/magazzino/registro`

### Changed
- **ViniMenu.jsx**: da 6 a 5 voci — rimossa "Movimenti Cantina", "Magazzino Vini" rinominato in "Cantina"
- **MagazzinoSubMenu.jsx**: semplificato da 6 a 5 pulsanti (Cantina, Nuovo vino + admin: Registro movimenti, Modifica massiva)
- **App.jsx**: rimosse route orfane `/vini/movimenti` e `/vini/magazzino/:id/movimenti`
- **MagazzinoVini.jsx**: titolo → "Cantina", aggiunto bottone "Pulisci filtri"
- **MagazzinoViniDettaglio.jsx**: fix layout form movimenti (grid 5→4 col), emoji nei tipi, bottone "← Cantina"
- **DashboardVini.jsx**: aggiornati pulsanti accesso rapido (+ Vendite, fix link Impostazioni, rinominato Cantina)

### Removed
- Route `/vini/movimenti` e `/vini/magazzino/:id/movimenti` (movimenti ora solo da scheda vino)

---

## 2026-03-09 — Admin Magazzino + Vendite Bottiglia/Calici (v2026.03.09e)

### Added
- `MagazzinoAdmin.jsx`: pagina admin-only per modifica massiva vini
  - Tabella spreadsheet-like con 21 colonne editabili (descrizione, produttore, tipologia, prezzi, giacenze, stati operativi, flag)
  - Filtri client-side: ricerca testo, tipologia, nazione, solo giacenza, solo in carta
  - Salvataggio bulk: raccolta modifiche lato client, invio singolo al backend
  - Eliminazione per riga con doppia conferma
  - Celle modificate evidenziate in ambra
  - Accesso negato per non-admin con schermata dedicata
- `vini_magazzino_db.py`: nuove funzioni `bulk_update_vini()` e `delete_vino()`
- `vini_magazzino_router.py`: nuovi endpoint `PATCH /bulk-update` e `DELETE /delete-vino/{id}` (admin only)
- `App.jsx`: route `/vini/magazzino/admin` + route `/vini/magazzino/:id/movimenti`
- `MagazzinoSubMenu.jsx`: link "⚙️ Admin" visibile solo per role=admin

### Changed
- `ViniVendite.jsx` (v2.0): semplificata a sole vendite con toggle Bottiglia/Calici
  - Rimossi scarichi/carichi/rettifiche (restano in sezione Magazzino)
  - Tag `[BOTTIGLIA]`/`[CALICI]` nel campo note per distinguere modalità vendita
  - Storico filtrato di default solo su movimenti VENDITA

---

## 2026-03-09 — Hub Vendite & Scarichi + Locazione obbligatoria (v2026.03.09d)

### Added
- `ViniVendite.jsx` (v1.0): riscritta da placeholder a hub operativo completo:
  - **Registrazione rapida**: ricerca vino con autocomplete, selezione tipo (VENDITA/SCARICO/CARICO/RETTIFICA), **locazione obbligatoria** per vendita/scarico, quantità, note, registrazione in un click
  - **Storico movimenti globale**: tabella paginata di tutti i movimenti della cantina con filtri per tipo, testo, range date
  - **KPI rapidi**: vendite oggi, 7gg, 30gg, bottiglie totali in cantina
  - Click su vino nello storico → navigazione a scheda dettaglio
  - Badge `#id` e stile coerente con il resto del modulo
- `vini_magazzino_db.py`: nuove funzioni:
  - `list_movimenti_globali()`: query cross-vino con filtri tipo/testo/date e paginazione (LIMIT/OFFSET + COUNT)
  - `search_vini_autocomplete()`: ricerca rapida per form registrazione (id, descrizione, produttore, QTA, prezzi)
- `vini_magazzino_router.py`: nuovi endpoint:
  - `GET /vini/magazzino/movimenti-globali` — movimenti globali con filtri e paginazione
  - `GET /vini/magazzino/autocomplete?q=...` — autocomplete vini per registrazione rapida
  - Entrambi dichiarati prima di `/{vino_id}` per evitare conflitti path FastAPI
- `MagazzinoSubMenu.jsx`: aggiunto link "🛒 Vendite & Scarichi" → `/vini/vendite`

### Changed
- **`registra_movimento()` — locazione reale**: ora aggiorna anche la colonna `QTA_<LOC>` corrispondente. Per VENDITA e SCARICO la locazione è **obbligatoria** (validazione backend + frontend)
- **`MovimentiCantina.jsx`**: campo locazione da testo libero a dropdown (frigo/loc1/loc2/loc3), obbligatorio per VENDITA/SCARICO, disabilitato per RETTIFICA
- **`MagazzinoViniDettaglio.jsx`**: stessa modifica al form movimenti nella scheda dettaglio

---

## 2026-03-09 — Dashboard Vini operativa, analytics vendite, UX miglioramenti (v2026.03.09c)

### Added
- `DashboardVini.jsx` (v2.0 → v2.1): riscritta completamente da placeholder a dashboard operativa:
  - **Riga KPI Stock** (4 tile): bottiglie in cantina, vini in carta, senza prezzo listino, vini fermi 30gg
  - **Riga KPI Vendite** (2 tile): bottiglie vendute ultimi 7gg / 30gg
  - **Drill-down interattivo**: click su tile "senza listino" → tabella inline con tutti i vini da completare; click su tile "vini fermi" → lista con giacenza e data ultimo movimento; click di nuovo chiude il pannello
  - **Vendite recenti** (viola): ultimi 8 movimenti di tipo VENDITA, con vino e data
  - **Movimenti operativi** (neutro): ultimi 6 tra CARICO / SCARICO / RETTIFICA con badge tipo colorato
  - **Top venduti 30gg**: ranking a barre dei vini più venduti nell'ultimo mese, a larghezza piena
  - **Distribuzione tipologie**: barre proporzionali per tipologia con contatore referenze
  - **Accesso rapido**: link a Magazzino, Nuovo vino, Carta vini, Impostazioni
  - Badge `#id` in stile `bg-slate-700` su alert e drill-down
- `vini_magazzino_db.py`: aggiunte query per `get_dashboard_stats()`:
  - `kpi_vendite`: vendute_7gg, vendute_30gg (WHERE tipo='VENDITA')
  - `vendite_recenti`: ultimi 8 movimenti VENDITA con join su descrizione vino
  - `movimenti_operativi`: ultimi 6 CARICO/SCARICO/RETTIFICA
  - `top_venduti_30gg`: top 8 per SUM(qta) su VENDITA ultimi 30gg
  - `vini_fermi`: vini con QTA_TOTALE > 0 e nessun movimento negli ultimi 30 giorni (LEFT JOIN + HAVING)
- `vini_magazzino_router.py`: aggiunto endpoint `GET /dashboard` (dichiarato prima di `/{vino_id}` per evitare conflitti di routing FastAPI)
- Dashboard raggiungibile da: NavLink `MagazzinoSubMenu.jsx`, card `ViniMenu.jsx`, route `/vini/dashboard` in `App.jsx`

### Changed
- `MagazzinoVini.jsx`: pannello destro semplificato — rimosso bottone "📦 Movimenti" separato; rinominato unico bottone in "🍷 Apri scheda completa" (movimenti ora integrati nella scheda dettaglio)
- Badge `#id` standardizzato a `bg-slate-700 text-white` su tutte le pagine (era `bg-amber-900` — conflitto visivo con i bottoni ambra)

### Fixed
- `vini_magazzino_router.py`: rimossi 12 caratteri smart quote (U+201C/U+201D) nelle stringhe — causavano `SyntaxError: invalid character` al boot del backend
- `scripts/deploy.sh`: corretto mode bit git a `100755` (era `100644`) — risolto `Permission denied` ad ogni deploy
- `push.sh`: riscritto per usare comandi SSH diretti invece di `./scripts/deploy.sh` — più robusto e non dipende dal mode bit
- Sudoers configurato sul VPS per `systemctl restart` senza password — deploy non-interattivo da SSH

### Docs
- `modulo_magazzino_vini.md`: aggiornato con sezioni Movimenti, Dashboard, Scheda dettaglio v3.0
- `Roadmap.md`: aggiunti task #23 (dashboard vini), #24 (badge ID); marcati come chiusi

---

## 2026-03-09 — Magazzino vini: edit, note, movimenti, role check (v2026.03.09b)

### Security
- `vini_magazzino_router.py`: aggiunto role check su `DELETE /movimenti/{id}` — solo admin o sommelier possono eliminare movimenti (#12 chiuso)
- Rimosso endpoint `/vini/magazzino/duplicate-check` ridondante (#10 chiuso) — mantenuto solo `POST /check-duplicati` (più pulito, usa `find_potential_duplicates` DB-side)

### Added
- `vini_magazzino_db.py`: aggiunta funzione `delete_nota(nota_id)` per eliminare note operative
- `vini_magazzino_router.py`: aggiunto `DELETE /{vino_id}/note/{nota_id}` — elimina nota e ritorna lista aggiornata
- `MagazzinoViniDettaglio.jsx` (v2.0): riscritta con tre sezioni:
  - **Anagrafica** — view + edit mode inline (PATCH `/vini/magazzino/{id}`) con tutti i campi
  - **Giacenze per locazione** — view + edit separato; salvataggio registra automaticamente RETTIFICA nello storico movimenti se QTA_TOTALE cambia
  - **Note operative** — add + delete note (usa `GET/POST/DELETE /note`)
- `MovimentiCantina.jsx` (v2.0): migrato da `fetch` grezzo ad `apiFetch` (redirect 401 automatico); aggiunto bottone elimina movimento (visibile solo ad admin/sommelier)

### Changed
- `MagazzinoVini.jsx`: rimosso bottone logout locale (gestito globalmente da `Header.jsx`)
- `MagazzinoViniDettaglio.jsx`: rimosso bottone logout locale

### Docs
- `roadmap.md`: aggiornati task #10, #12 come chiusi; aggiornate feature #17 (Magazzino Vini)

---

## 2026-03-09 — Gestione utenti, permessi moduli, sicurezza auth (v2026.03.09)

### Security
- `auth_service.py`: sostituito USERS dict con password in chiaro con hash `sha256_crypt` via `passlib.CryptContext`
- `authenticate_user()` usa `security.verify_password()` — nessuna password in chiaro nel codice
- `SECRET_KEY` caricata da `.env` via `python-dotenv` (fallback al valore hardcoded)
- `scripts/gen_passwords.py`: utility CLI per rigenerare hash al cambio password

### Added
- `app/data/users.json`: store persistente utenti (caricato a boot, aggiornato ad ogni modifica)
- `app/routers/users_router.py`: CRUD utenti — `GET/POST /auth/users`, `DELETE /{username}`, `PUT /{username}/password`, `PUT /{username}/role`. Admin: accesso totale; non-admin: solo propria password con verifica
- `app/data/modules.json`: permessi moduli per ruolo (`roles[]` per modulo)
- `app/routers/modules_router.py`: `GET /settings/modules` (tutti autenticati), `PUT /settings/modules` (admin only). Admin sempre incluso, modulo admin non disabilitabile
- `frontend/src/pages/admin/ImpostazioniSistema.jsx`: pagina unica con due tab — **Utenti** (crea/modifica/elimina/cambio password/cambio ruolo) e **Moduli & Permessi** (griglia checkbox ruolo × modulo)
- Logout button cablato in `Header.jsx` — visibile su tutte le pagine post-login
- `Home.jsx` dinamica: mostra solo i moduli accessibili al ruolo dell'utente corrente

### Changed
- `AdminMenu.jsx`: due card separate (Impostazioni + Gestione Utenti) → una sola card **Impostazioni** → `/admin/impostazioni`
- `LoginForm.jsx`: salva `username` in localStorage (necessario per UI "Tu" in gestione utenti)
- `App.jsx`: `Header` montato globalmente con `onLogout`; route `/admin/impostazioni` aggiunta

### Docs
- `roadmap.md`: aggiornato con task #1, #3, #7 chiusi
- `sessione.md`: aggiornato con lavoro della sessione 2026-03-09

---

## 2026-03-08 — Fix sicurezza, bug e refactor frontend (v2026.03.08)

### Security
- `Depends(get_current_user)` aggiunto a livello router su 5 endpoint pubblici: `admin_finance`, `fe_import`, `foodcost_ingredients`, `foodcost_recipes`, `vini_settings`

### Fixed
- Bug pie chart pagamenti in `CorrispettiviDashboard.jsx`: `pag.pos` → `pag.pos_bpm`, `pag.sella` → `pag.pos_sella`
- `carta_vini_service.py`: `if prezzo:` → `if prezzo not in (None, "")` — fix prezzo=0 in preview HTML
- `vini_router.py`: rimossa funzione `slugify` duplicata, importata da `carta_vini_service`
- Rimosso `console.log("API_BASE:", API_BASE)` da `LoginForm.jsx`

### Added
- `pyxlsb` aggiunto a `requirements.txt` (necessario per import Excel .xlsb)
- `frontend/src/config/api.js`: `apiFetch()` — wrapper centralizzato di `fetch` con auto-inject token Authorization e redirect automatico al login su 401
- `frontend/src/pages/admin/CorrispettiviAnnual.jsx`: nuova pagina confronto annuale con grafico e tabella mensile
- Route `/admin/corrispettivi/annual` in `App.jsx`
- Setup git bare repo VPS (`/home/marco/trgb/trgb.git`) con post-receive hook per auto-deploy su `git push`
- `scripts/setup_git_server.sh`: script one-time setup VPS

### Changed
- Gestione 401 rimossa da 6 pagine (ViniCarta, MagazzinoVini, MagazzinoViniDettaglio, MagazzinoViniNuovo, DipendentiAnagrafica, CorrispettiviAnnual) — ora centralizzata in `apiFetch()`

### Docs
- Docs consolidati da 18 a 13 file, tutti in minuscolo
- `database.md`: unificato da `Database_Vini.md` + `Database_FoodCost.md`
- `architettura.md`: merge di `VersionMap.md`
- `deploy.md`: merge di `troubleshooting.md`
- Eliminati: `sistema-vini.md`, `to-do.md`, `version.json`, `Index.md`

---

## 2025-12-05 — Modulo FE XML esteso (v2025.12.05-1)
### Added
- Sezione documentazione completa nel README  
- Descrizione architetturale + routing + frontend  
- Dettaglio endpoints e flusso operativo  

### Updated
- Modulo FE XML porta versione → `v2025.12.05-1`
- Documentazione `/docs/Modulo_FattureXML.md` integrata  

### Notes
- Il modulo è ora ufficialmente considerato "prima release operativa"


# 🗓️ 2025-12-05 — Versione 2025.12.05 (Master Integrato)

## ✨ Aggiunto

### Modulo Fatture Elettroniche (FE XML)
- Nuovo router `fe_import.py`
- Funzioni:
  - parsing XML (FatturaPA)
  - hashing SHA-256 anti-duplicati
  - estrazione fornitori, numeri fattura, date, imponibili, IVA, totale
  - estrazione righe (descrizione, quantità, prezzo, IVA)
- Endpoint:
  - `POST /contabilita/fe/import`  
  - `GET /contabilita/fe/fatture`
  - `GET /contabilita/fe/fatture/{id}`
  - `GET /contabilita/fe/stats/fornitori`
  - `GET /contabilita/fe/stats/mensili`
- Creazione tabelle nel DB:
  - `fe_fatture`  
  - `fe_righe`
- Dashboard acquisti frontend:
  - top fornitori
  - andamento mensile
  - filtro anno dinamico
- UI:
  - pagina `FattureElettroniche.jsx`
  - uploading multiplo
  - gestione duplicati
  - dettaglio righe completo
  - formattazione prezzi, valute e date

---

## 🛠️ Modulo Magazzino Vini — Refactor completo

### Nuove funzionalità frontend
- Filtri dinamici dipendenti (tipologia/nazione/regione/produttore)
- Filtri testuali multi-campo:
  - descrizione
  - denominazione
  - produttore
  - codice
  - regione
  - nazione
- Filtri numerici avanzati:
  - giacenza totale (>, <, tra)
  - checkbox "solo positivi"
  - prezzo carta
- Ordinamenti migliorati
- Prestazioni ottimizzate con `useMemo`

### Backend — Struttura magazzino
- Aggiunto campo `id_excel`
- Reintroduzione struttura coerente di locazioni:
  - frigo
  - loc1
  - loc2
  - loc3 (future use)
- Calcolo automatico `qta_totale`
- Refactor funzioni:
  - `create_vino()`
  - `update_vino()`
- Migliorata coerenza dati dopo aggiornamenti multipli

### Import Excel
- Modalità SAFE introdotta:
  - evita sovrascrittura ID
  - aggiorna solo campi consentiti
  - mantiene allineamento storico
- Modalità FORCE (solo admin) — predisposta

---

## 🧹 Miglioramenti UI/UX

- Nuova sezione **/admin**
- Interfaccia vini backend migliorata
- Stile grafico omogeneo con TRGB design
- Pannelli più leggibili e uniformati

---

## 🗄️ Documentazione (grande aggiornamento)

- Riscritto completamente il README principale
- Creato sistema documentazione modulare:
  - `Modulo_Vini.md`
  - `Modulo_MagazzinoVini.md`
  - `Modulo_FoodCost.md`
  - `Modulo_FattureXML.md`
- Creati file DB dedicati:
  - `DATABASE_Vini.md`
  - `DATABASE_FoodCost.md`
- Creato `INDEX.md`
- Creato `ROADMAP.md`
- Creato `CHANGELOG.md` (esteso)
- Creato `PROMPT_CANVAS.md`

---

## 🔧 Backend & DevOps

- Aggiornata configurazione systemd:
  - `trgb-backend.service`
  - `trgb-frontend.service`
- Migliorato `deploy.sh`:
  - quick deploy
  - full deploy
  - safe deploy
  - rollback
- Aggiornati file `.env` + separazione produzione/sviluppo
- Rifinito reverse proxy Nginx:
  - `trgb.tregobbi.it` (backend)
  - `app.tregobbi.it` (frontend)
- UFW:
  - bloccate porte 8000 e 5173 dall'esterno
  - aggiunta apertura loopback per Vite

---

## 🐞 Bugfix importanti

### Magazzino vini
- Rimossi duplicati storici
- Ripristinati **1186 record reali**
- Eliminati ID corrotti
- Ripuliti import precedenti non coerenti

### Backend generale
- Fix encoding PDF
- Fix salvare prezzi carta vs listino
- Fix ordinamento produttori con apostrofi
- Fix annate stringa/numero

---

# 🗓️ 2025-12-03 — Versione 2025.12.03

## ✨ Aggiunto
- Prima versione documentation system  
- Prima versione modulo Magazzino Vini rifattorizzato

## 🐞 Risolto
- Duplicati magazzino storici  
- QTA negative generate da import errati

---

# 🗓️ 2025-11 — Versioni preliminari

## ✨ Aggiunto
- Carta Vini stabile (HTML/PDF/DOCX)
- Template PDF unificato
- Generatore PDF staff/cliente
- Funzioni base foodcost (ricette + ingredienti)
- Deploy su VPS + servizi systemd

## 🔧 Migliorato
- Vite configurato per VPS
- Backend ottimizzato per caricamenti Excel
- Repository vini riscritto per prestazioni

## 🐞 Risolti
- Problemi CORS
- Loop infinito Vite reload
- Reset porta 8000 al deploy
