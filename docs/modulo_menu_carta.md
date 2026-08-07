# Modulo Menu Carta — Design Document

> **Tipo:** 📄 pagina wiki · **Stato:** parziale · **Ultima verifica:** 2026-07-25 (vs codice)
> **Vedi anche:** [modulo_ricette_foodcost.md](modulo_ricette_foodcost.md) · [modulo_pranzo.md](modulo_pranzo.md) · [modulo_cucina.md](modulo_cucina.md) · [architettura_mattoni.md](architettura_mattoni.md)
> **Non verificato in questo giro:** migrazioni 097/098/154 e contenuto dei seed (dir `app/migrations/` assente dallo snapshot), template `app/templates/pdf/menu_carta.html`, route React (App.jsx assente — verificate via `modulesMenu.js` e i `Link` nelle pagine)

**Data:** 2026-04-25 (design originale) — annotato vs codice il 2026-07-25
**Stato:** IMPLEMENTATO — modulo `menuCarta` **v1.3 beta** (`frontend/src/config/versions.jsx`). Router: `app/routers/menu_carta_router.py` (v1.3-i18n, 2026-08-07), mount `/menu-carta` in `main.py:634-635`. Il testo sotto nasce come design doc (sessioni 56-57): le annotazioni ✅/❌/🆕 marcano cosa è stato davvero realizzato. 🆕 2026-07-19: sezione **'dolci'** (router+FE+PDF+MEP) + edizione **Estate 2026** in carta (mig 154, locale tregobbi). 🆕 2026-08-07: **multilingua** it/en/fr/es/de/uk (mig 163, § 11) + fix sezione 'dolci' mancante nella pagina pubblica.
**Autore:** brainstorming Marco + Claude
**Ruoli destinatari:** chef/admin (gestione), sala/sommelier (lettura), viewer
**Punto di partenza:** menù Primavera 2026 cartaceo (PDF A5 definitivo, 21 piatti + degustazioni)

---

## 0. TL;DR

Il "menu carta" non è un modulo nuovo: è il **lato anteriore** di quello che esiste già in `recipes` (campo `menu_name`, `menu_description`, `kind='dish'`) + `service_types` ("Alla carta") + `recipe_service_types`. Quello che manca:

1. La nozione di **edizione/stagione** (Primavera 2026 / Estate 2026 / ...) per versionare la carta nel tempo.
2. La nozione di **sezione di stampa** (Antipasti / Paste, Risi e Zuppe / Piatti del giorno / Secondi / Contorni / Dolci 🆕 / Degustazioni / Bambini / Servizio) ordinata, distinta dalle `recipe_categories` semantiche. Elenco vivo: `SEZIONI_VALIDE` in `app/routers/menu_carta_router.py:78-81` ('dolci' aggiunta 2026-07-19).
3. **Allergeni dichiarati a livello piatto** (oggi gli allergeni stanno a livello `ingredients.allergeni`, non aggregati).
4. **Prezzo carta per edizione** (lo stesso piatto può essere a 18 in Primavera 2026 e a 19 in Estate 2026).
5. **Stato del piatto in carta**: bozza / in carta / fuori menu, con storico.

Realizzato (mig 098) con **4 tabelle nuove** (`menu_editions`, `menu_dish_publications`, `menu_tasting_paths`, `menu_tasting_path_steps`) + 3 colonne aggiuntive su `recipes` per allergeni e impiattamento (cfr. docstring `app/routers/menu_carta_router.py:9-10`). Niente refactor, niente migrazione distruttiva.

---

## 1. Stato attuale (sessione 56)

> ⚠️ Fotografia storica pre-implementazione. I "buchi" elencati in § 1.2 sono stati colmati (schema mig 098, router sessione 57, allergeni Modulo C, foto Modulo D). Le tabelle vivono in `foodcost.db`, accedute via `get_cucina_connection()` — alias di `get_foodcost_connection()` (`app/models/cucina_db.py`, Fase 0 split cucina).

### 1.1 Cosa c'è già nel DB `foodcost.db`

```
recipes
├── id, name (nome interno cucina, es. "Tartare di manzo Cantabrico v3")
├── menu_name (nome poetico per stampa, es. "La Tartare dell'Oste")  ← mig 074
├── menu_description (testo descrittivo da stampa)                    ← mig 074
├── kind ('dish' | 'base')                                            ← mig 074
├── category_id → recipe_categories.id (Antipasto/Primo/...)
├── is_base, yield_qty, yield_unit, selling_price, prep_time
├── note, is_active, created_at, updated_at

recipe_categories (8 voci pre-seed)
├── 1: Antipasto · 2: Primo · 3: Secondo · 4: Contorno · 5: Dolce
├── 6: Base · 7: Salsa · 8: Impasto

service_types (4 voci pre-seed, configurabili)
├── 1: Alla carta · 2: Banchetto · 3: Pranzo di lavoro · 4: Aperitivo

recipe_service_types (M:N, vuota)
├── recipe_id, service_type_id

recipe_items
├── recipe_id, ingredient_id | sub_recipe_id, qty, unit, sort_order, note

ingredients (vuota in dev, popolata in prod via fatture XML)
├── id, name, category_id, default_unit, allergeni TEXT, is_active

clienti_menu_template / clienti_menu_template_righe (clienti.sqlite3)
└── per i menu di banchetto nei preventivi (modulo separato)
```

### 1.2 Cosa NON c'è ancora

- **Edizioni stagionali del menu carta**: oggi un piatto è "in carta" o non lo è (`is_active`), senza storia. Quando si farà il menu Estate 2026, perdiamo la traccia di cosa era in Primavera 2026.
- **Ordine di stampa** dentro una sezione (oggi i piatti sarebbero alfabetici, non come da PDF).
- **Sezioni di stampa** distinte dalle categorie semantiche. Esempio: i salumi del menu PDF sono in "Antipasti" ma vorremmo un raggruppamento "Taglieri & Affettati" in stampa. Le degustazioni sono una sezione a sé.
- **Allergeni a livello piatto** (aggregati e dichiarati; non solo dedotti dagli ingredienti).
- **Foto piatto** (per app mobile / sito / QR menu cliente).
- **Prezzo carta per edizione**: oggi `recipes.selling_price` è un singolo numero. Se il piatto resta tra primavera ed estate ma cambia prezzo, perdiamo la storia.
- **Voci di menu non-ricetta**: copertO, acqua, espresso, the, moka — vanno in carta ma non sono "ricette". Servono righe "documentali" senza FK a `recipes`.
- **Degustazioni**: sono composizioni di N piatti a prezzo fisso. Non è una ricetta, è un percorso.

### 1.3 Cosa NON va toccato

- `recipes`, `recipe_items`, `recipe_categories` → schema food cost v2, production-ready, IMPLEMENTATO al 100% (cfr. `docs/modulo_ricette_foodcost.md`). Solo **ADD COLUMN** non distruttive.
- `clienti_menu_template*` → modulo Preventivi/Banchetti, non c'entra con menu carta. Resta indipendente.
- DB checklist Cucina HACCP → parallelo, non si tocca. (Nel codice attuale è `tasks.sqlite3`, cfr. `menu_carta_router.py:60-63`; `cucina.sqlite3` come file separato è la futura Fase 1 dello split, cfr. `app/models/cucina_db.py`.)

---

## 2. Gap analysis: cosa manca per archiviare il menù Primavera 2026

> ⚠️ Tabella storica (pre-implementazione): tutte le righe ❌/⚠️ sono state coperte dallo schema mig 098 (prezzi a fasce/range/label, edizioni, ordine, allergeni dichiarati, foto, degustazioni, voci servizio, `descrizione_variabile` — cfr. campi in `menu_carta_router.py:110-129`).

| Feature richiesta dal PDF Primavera 2026 | Coperta? | Note |
|------------------------------------------|----------|------|
| Nome poetico del piatto (es. "Sua Maestà la Taragna") | ✅ | `recipes.menu_name` |
| Descrizione da stampa | ✅ | `recipes.menu_description` |
| Categoria (Antipasto/Primo/...) | ✅ | `recipes.category_id` |
| "Alla carta" come tipo servizio | ✅ | `service_types` id=1 |
| Prezzo singolo (es. 16 €) | ⚠️ | `recipes.selling_price` esiste ma non versiona per edizione |
| Prezzo a fasce (es. 14/20 formaggi italiani) | ❌ | Servono 2 prezzi (piccolo/grande) |
| Prezzo "da X a Y" (piatti del giorno: da 14 a 26) | ❌ | Range da modellare |
| "Consigliato per due" (salumi misti) | ❌ | Flag/nota |
| Edizione stagionale (Primavera/Estate/Autunno/Inverno + anno) | ❌ | Da aggiungere |
| Ordine in sezione stampata | ❌ | Da aggiungere |
| Allergeni dichiarati per piatto (UE 1169/2011) | ❌ | Da aggregare |
| Foto piatto | ❌ | Da aggiungere (path) |
| Degustazioni (Prima volta 60 €, Fidati dell'Oste 75 €) | ❌ | Da modellare come "percorso" |
| Voci di servizio (coperto, acqua, espresso, moka, the) | ❌ | Da modellare |
| "Pescato del giorno" (descrizione variabile, prezzo fisso) | ⚠️ | Va come piatto con flag `descrizione_variabile` |
| Piatti del giorno a voce | ⚠️ | Sezione speciale, niente piatti specifici archiviati |

**Verdetto:** ~50% coperto dal DB attuale. Il restante 50% è additivo, non distruttivo.

---

## 3. Proposta architettura

Filosofia: **estendere, non sostituire**. Niente nuovo modulo separato. Tutto resta dentro `foodcost.db` perché il menu carta è la faccia anteriore delle ricette.

### 3.1 Tabelle nuove

#### `menu_editions` — edizioni stagionali del menu

```sql
CREATE TABLE menu_editions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nome            TEXT    NOT NULL,           -- "Primavera 2026"
    slug            TEXT    NOT NULL UNIQUE,    -- "primavera-2026"
    stagione        TEXT,                       -- 'primavera'|'estate'|'autunno'|'inverno'
    anno            INTEGER,
    data_inizio     TEXT,                       -- ISO date, opzionale
    data_fine       TEXT,                       -- ISO date, opzionale
    stato           TEXT    NOT NULL DEFAULT 'bozza',
                                                -- 'bozza'|'in_carta'|'archiviata'
    note            TEXT,
    pdf_path        TEXT,                       -- path al PDF stampato di questa edizione
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_menu_editions_stato ON menu_editions(stato);
CREATE UNIQUE INDEX idx_menu_editions_in_carta
    ON menu_editions(stato) WHERE stato = 'in_carta';
-- vincolo: una sola edizione "in_carta" per volta
```

**Esempio righe:**
```
(1, 'Primavera 2026', 'primavera-2026', 'primavera', 2026, '2026-03-21', '2026-06-20', 'archiviata', ..., 'menù-A5-primavera-2026-definitivo.pdf')
(2, 'Estate 2026',    'estate-2026',    'estate',    2026, '2026-06-21', '2026-09-22', 'in_carta',   ..., NULL)
```

🆕 L'edizione **Estate 2026** è stata seedata e messa `in_carta` con la mig 154 (2026-07-19, locale tregobbi — cfr. commento in `frontend/src/config/versions.jsx:39-42`; migrazione non presente in questo snapshot, non verificata riga per riga).

#### `menu_dish_publications` — riga di pubblicazione di un piatto in un'edizione

Il cuore del versionamento. Un piatto (`recipes.id`) può apparire in N edizioni con prezzo, sezione, ordine, allergeni potenzialmente diversi. Quando il menu cambia stagione, chi pianifica copia le righe, modifica quel che cambia, archivia la vecchia edizione.

```sql
CREATE TABLE menu_dish_publications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    edition_id      INTEGER NOT NULL REFERENCES menu_editions(id) ON DELETE CASCADE,
    recipe_id       INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
                    -- NULL ammesso per voci di servizio (coperto, acqua, ...)
                    -- e per "Piatti del giorno raccontati a voce"

    -- Posizionamento in carta
    sezione         TEXT    NOT NULL,
                    -- 'antipasti'|'paste_risi_zuppe'|'piatti_del_giorno'|
                    -- 'secondi'|'contorni'|'dolci'|'degustazioni'|'bambini'|'servizio'
                    -- 🆕 'dolci' aggiunta 2026-07-19 (SEZIONI_VALIDE,
                    -- app/routers/menu_carta_router.py:78-81)
    sort_order      INTEGER NOT NULL DEFAULT 0,

    -- Override testuali (di solito NULL → fallback su recipes.menu_name/description)
    titolo_override         TEXT,
    descrizione_override    TEXT,

    -- Prezzi (uno solo dei tre va valorizzato)
    prezzo_singolo  REAL,                       -- es. 16
    prezzo_min      REAL,                       -- per range (piatti giorno: 14)
    prezzo_max      REAL,                       -- per range (piatti giorno: 26)
    prezzo_piccolo  REAL,                       -- per fasce (formaggi: 14)
    prezzo_grande   REAL,                       -- per fasce (formaggi: 20)
    prezzo_label    TEXT,                       -- override etichetta (es. "Da 14 a 26")

    -- Flag e annotazioni stampa
    consigliato_per INTEGER,                    -- es. 2 (salumi misti)
    descrizione_variabile INTEGER NOT NULL DEFAULT 0,
                                                -- 1 = "raccontato a voce" / "pescato del giorno"
    badge           TEXT,                       -- 'novità'|'classico'|'firma'|...
    is_visible      INTEGER NOT NULL DEFAULT 1,

    -- Allergeni dichiarati a livello pubblicazione (UE 1169/2011)
    allergeni_dichiarati TEXT,                  -- CSV: "glutine,lattosio,uova"

    -- Foto piatto
    foto_path       TEXT,

    -- Metadata
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),

    CHECK (
        prezzo_singolo IS NOT NULL
        OR (prezzo_min IS NOT NULL AND prezzo_max IS NOT NULL)
        OR (prezzo_piccolo IS NOT NULL AND prezzo_grande IS NOT NULL)
        OR descrizione_variabile = 1
        OR sezione = 'servizio'                 -- coperto, acqua, ecc.
    )
);

CREATE INDEX idx_mdp_edition_section ON menu_dish_publications(edition_id, sezione, sort_order);
CREATE INDEX idx_mdp_recipe ON menu_dish_publications(recipe_id);
```

#### `menu_tasting_paths` — percorsi degustazione

Le degustazioni ("Prima volta", "Fidati dell'Oste") sono composizioni multi-portata a prezzo fisso. Non sono un piatto.

```sql
CREATE TABLE menu_tasting_paths (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    edition_id      INTEGER NOT NULL REFERENCES menu_editions(id) ON DELETE CASCADE,
    nome            TEXT    NOT NULL,           -- "Prima volta", "Fidati dell'Oste"
    sottotitolo     TEXT,                       -- frase descrittiva
    prezzo_persona  REAL    NOT NULL,
    note            TEXT,                       -- "Le degustazioni sono per tutto il tavolo. ..."
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_visible      INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE menu_tasting_path_steps (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    path_id         INTEGER NOT NULL REFERENCES menu_tasting_paths(id) ON DELETE CASCADE,
    sort_order      INTEGER NOT NULL,
    -- Il "passo" può puntare a una pubblicazione carta esistente OPPURE a testo libero
    publication_id  INTEGER REFERENCES menu_dish_publications(id) ON DELETE SET NULL,
    titolo_libero   TEXT,                       -- fallback se non puntiamo a publication
    note            TEXT
);

CREATE INDEX idx_mtps_path ON menu_tasting_path_steps(path_id, sort_order);
```

### 3.2 Estensioni a tabelle esistenti

#### `recipes` — 3 colonne in più

```sql
ALTER TABLE recipes ADD COLUMN allergeni_calcolati TEXT;
-- CSV degli allergeni desunti dagli ingredienti (cache, ricalcolata su trigger).
-- Il campo allergeni "ufficiale" da stampare resta in menu_dish_publications.allergeni_dichiarati,
-- perché può divergere (un piatto può essere "senza glutine on request" e su menu lo dichiariamo).

ALTER TABLE recipes ADD COLUMN istruzioni_impiattamento TEXT;
-- testo libero per il cuoco al pass: come si finisce e si manda

ALTER TABLE recipes ADD COLUMN tempo_servizio_minuti INTEGER;
-- minuti dichiarati al cliente per arrivare al tavolo (informativo per sala)
```

### 3.3 Diagramma relazioni

```
menu_editions (1)
    │
    ├── (N) menu_dish_publications ──→ recipes (0..1)
    │           │
    │           └── allergeni_dichiarati, prezzi, sezione, ordine
    │
    └── (N) menu_tasting_paths
                │
                └── (N) menu_tasting_path_steps ──→ menu_dish_publications (0..1)

recipes (esistenti, modulo food cost v2)
    │
    ├── (N) recipe_items ──→ ingredients
    │
    └── (M:N) service_types via recipe_service_types
                                    ("Alla carta" = service_type id=1)
```

---

## 4. Endpoint API previsti

Router: `app/routers/menu_carta_router.py`. Prefisso `/menu-carta` (mount `main.py:634`). Auth: `Depends(get_current_user)` a livello router (`menu_carta_router.py:70`); in più un `public_router` senza auth (`menu_carta_router.py:71`, mount `main.py:635`).

Trailing slash sui root (regola TRGB: niente 307 redirect).

### 4.1 Edizioni

| Verbo | Path | Scopo |
|-------|------|-------|
| GET | `/menu-carta/editions/` | ✅ Lista edizioni (filtri: stato) — `menu_carta_router.py:211` |
| POST | `/menu-carta/editions/` | ✅ Crea nuova edizione (stato='bozza') — `menu_carta_router.py:328` |
| GET | `/menu-carta/editions/{id}` | ✅ Dettaglio + pubblicazioni raggruppate per sezione + degustazioni + KPI — `menu_carta_router.py:231` |
| PUT | `/menu-carta/editions/{id}` | ✅ Aggiorna (nome, date, note, pdf_path) — `menu_carta_router.py:352` |
| POST | `/menu-carta/editions/{id}/publish` | ✅ Promuove `bozza` → `in_carta` (e archivia automaticamente l'edizione `in_carta` precedente) — `menu_carta_router.py:373` |
| POST | `/menu-carta/editions/{id}/clone` | ✅ Clona un'edizione (copia pubblicazioni + degustazioni, nuovo stato `bozza`; body `{nome, slug, ...}`) → punto di partenza per il menu della stagione successiva — `menu_carta_router.py:396` |
| POST | `/menu-carta/editions/{id}/archive` | ✅ Forza `archiviata` — `menu_carta_router.py:482` |
| DELETE | `/menu-carta/editions/{id}` | ✅ Solo se `bozza` — `menu_carta_router.py:496` |
| GET | `/menu-carta/editions/{id}/mep-preview` | 🆕 Anteprima JSON dei template MEP generabili (non scrive) — `menu_carta_router.py:840` |
| POST | `/menu-carta/editions/{id}/generate-mep` | 🆕 Genera/rigenera template MEP "MEP Carta · {partita} · {slug}" in `tasks.sqlite3` (idempotente, `attivo=0`) — `menu_carta_router.py:891` |

### 4.2 Pubblicazioni piatto

| Verbo | Path | Scopo |
|-------|------|-------|
| GET | `/menu-carta/publications/?edition_id=X` | ✅ Lista (con join recipe per nome/descrizione fallback) — `menu_carta_router.py:517` |
| POST | `/menu-carta/publications/` | ✅ Aggiunge piatto a edizione — `menu_carta_router.py:535` |
| PUT | `/menu-carta/publications/{id}` | ✅ Modifica prezzo/sezione/ordine/allergeni/badge — `menu_carta_router.py:565` |
| POST | `/menu-carta/publications/{id}/move` | ❌ (non implementato — cambio sezione/ordine si fa con la PUT; niente drag&drop) |
| DELETE | `/menu-carta/publications/{id}` | ✅ Rimuove dalla carta (+ cleanup foto orfana) — `menu_carta_router.py:592` |
| POST | `/menu-carta/publications/{id}/foto` | 🆕 Upload foto piatto (multipart, resize 1200x800, JPEG q85, Modulo D) — `menu_carta_router.py:621` + `app/services/menu_carta_image_service.py` |
| DELETE | `/menu-carta/publications/{id}/foto` | 🆕 Rimuove foto (file + `foto_path` NULL, Modulo D) — `menu_carta_router.py:669` |

### 4.3 Degustazioni

| Verbo | Path | Scopo |
|-------|------|-------|
| GET/POST | `/menu-carta/tasting-paths/?edition_id=X` | ✅ Lista (con steps) / crea (steps inclusi nel body) — `menu_carta_router.py:704,741` |
| PUT/DELETE | `/menu-carta/tasting-paths/{id}` | ✅ Modifica (replace completo degli steps) / elimina — `menu_carta_router.py:765,795`. Non esiste la GET singola |
| POST | `/menu-carta/tasting-paths/{id}/steps` | ❌ (non implementato — gli step si sostituiscono in blocco con la PUT) |

### 4.4 Stampa / export

| Verbo | Path | Scopo |
|-------|------|-------|
| GET | `/menu-carta/editions/{id}/pdf` | ✅ Genera PDF stampabile via mattone **M.B PDF brand** (`genera_pdf_html`, template `menu_carta.html` + CSS dedicato `_menu_carta_css()`) — `menu_carta_router.py:1094`. Ordine sezioni di stampa: `PDF_SEZIONI_ORDER` (`menu_carta_router.py:1025-1034`, 🆕 include 'dolci') |
| GET | `/menu-carta/editions/{id}/print-preview` | ❌ (non implementato — la preview HTML è il tab "Anteprima" di `MenuCartaDettaglio.jsx`) |
| GET | `/menu-carta/editions/{id}/qr-menu` | ❌ (non implementato — il QR si genera da Impostazioni Cucina e punta alla pagina pubblica `/carta/menu`, cfr. `frontend/src/pages/ricette/RicetteSettings.jsx:1020`) |

### 4.5 Operativo / cucina

| Verbo | Path | Scopo |
|-------|------|-------|
| GET | `/menu-carta/in-carta/today` | ✅ Implementato come **`GET /menu-carta/public/today`** (no auth, `public_router`) — restituisce il menu attualmente `in_carta` per app esterne / sito / pagina QR — `menu_carta_router.py:1188` |
| GET | `/menu-carta/editions/{id}/checklist?partita=primi&data=YYYY-MM-DD` | ❌ Sostituito dal generatore MEP: `GET /editions/{id}/mep-preview` + `POST /editions/{id}/generate-mep` (template checklist in `tasks.sqlite3`, mapping `SEZIONE_TO_PARTITA` in `menu_carta_router.py:830-837`, 🆕 include 'dolci' → partita Dolci) |
| GET | `/menu-carta/publications/{id}/scheda-piatto` | ❌ (non implementato) |

---

## 5. Mockup UI

Pagina principale: **`/menu-carta`** (voce "Menu Carta" sotto "Gestione Cucina" in `frontend/src/config/modulesMenu.js:69` — non `/cucina/menu-carta/` come nel design). Pagine: `frontend/src/pages/cucina/MenuCartaElenco.jsx` (v1.1) e `MenuCartaDettaglio.jsx` (v1.4-sezione-dolci, 2026-07-19 — 🆕 'dolci' in `SEZIONI_ORDER`, riga 22). I mockup sotto sono il design originale; l'implementazione differisce in alcuni punti: tab reali = **Sezioni / Degustazioni / Anteprima / Anagrafica** (`MenuCartaDettaglio.jsx:33-38`, niente tab Servizio/Allergeni/Foto/Stampa separati), niente drag&drop (riordino via campi della modale), modale pubblicazione integrata in `MenuCartaDettaglio.jsx` (nessun file `PubblicazioneModale.jsx`).

### 5.1 Lista edizioni

```
┌─ MENU CARTA ─────────────────────────────────────────────────────────┐
│  [+ Nuova edizione]           [⬇ Esporta PDF]                         │
│                                                                       │
│  ● IN CARTA                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ Primavera 2026         21 marzo → 20 giugno 2026                 │ │
│  │ 21 piatti · 2 degustazioni · 6 contorni                          │ │
│  │                              [Modifica] [Anteprima] [Clone→Estate]│ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ◐ BOZZE                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ Estate 2026 (clonata da Primavera 2026)                          │ │
│  │ 8 piatti · da finire                                              │ │
│  │                              [Modifica] [Pubblica] [Elimina]      │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ▼ ARCHIVIATE  (mostra 4)                                             │
│  - Inverno 2025-2026                                                  │
│  - Autunno 2025                                                       │
│  - Estate 2025                                                        │
│  - Primavera 2025                                                     │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 Dettaglio edizione (testa fissa + tab)

Stesso pattern di `SchedaVino` / `FattureDettaglio` (sessioni 55-56): testa colorata + tab.

```
┌─ Primavera 2026 ─────────────────────────────────── [Anteprima] [PDF] ┐
│ TESTA brand-cream                                                      │
│ ● IN CARTA          21 marzo 2026 → 20 giugno 2026          [Archivia]│
│                                                                        │
│ KPI: 21 piatti · 2 degustazioni · prezzo medio 21 €                   │
│      antipasti 8 · primi 6 · secondi 7 · contorni 6                   │
│                                                                        │
│ [Sezioni] [Degustazioni] [Servizio] [Allergeni] [Foto] [Stampa]       │
└────────────────────────────────────────────────────────────────────────┘

  Tab "Sezioni":
  ┌──────────────────────────────────────────────────────────────────┐
  │ ▼ ANTIPASTI (8)                              [+ Aggiungi piatto] │
  │ ▤ Tegamino di asparagi e uovo 63°               16 €  [✏️] [🗑]  │
  │ ▤ Sua Maestà "La Taragna"                       16 €  [✏️] [🗑]  │
  │ ▤ Cappuccino di baccalà e patata                16 €  [✏️] [🗑]  │
  │ ▤ La Tartare dell'Oste                          22 €  [✏️] [🗑]  │
  │ ▤ Il Vitello Tonnato dell'Osteria               20 €  [✏️] [🗑]  │
  │ ▤ Il salame del Roberto con la giardiniera      16 €  [✏️] [🗑]  │
  │ ▤ I nostri salumi misti              20 € (per 2)     [✏️] [🗑]  │
  │ ▤ Le selezioni di formaggi italiani         14 / 20 € [✏️] [🗑]  │
  │                                                                  │
  │ ▼ PASTE, RISI E ZUPPE (6)                                        │
  │ ...                                                              │
  │                                                                  │
  │ ▼ SECONDI (7)                                                    │
  │ ...                                                              │
  └──────────────────────────────────────────────────────────────────┘

  Drag&drop tra sezioni e per ordinamento. Click su ▤ apre la modale.
```

### 5.3 Modale "Pubblicazione piatto"

```
┌─ Pubblicazione piatto ─────────────────────────────────────────────┐
│                                                                     │
│ Ricetta:        [La Tartare dell'Oste ▾]   [+ Crea ricetta]         │
│                                                                     │
│ Sezione:        [Antipasti ▾]    Ordine: [4]                        │
│                                                                     │
│ Titolo override:        ⌜ ⌟  (lascia vuoto per usare menu_name)     │
│ Descrizione override:   ⌜ ⌟  (lascia vuoto per usare menu_descr.)   │
│                                                                     │
│ ── Prezzo ──                                                        │
│ ( • ) Prezzo singolo:    [22] €                                     │
│ ( ○ ) Range "da/a":      [  ] - [  ] €    Etichetta: [           ] │
│ ( ○ ) Fasce P/G:         [  ] / [  ] €                              │
│                                                                     │
│ Consigliato per:  [    ] persone    Badge: [firma ▾]                │
│ ☐ Descrizione variabile (raccontato a voce / pescato del giorno)    │
│                                                                     │
│ ── Allergeni dichiarati ──                                          │
│ ☐ Glutine ☐ Crostacei ☑ Uova ☐ Pesce ☐ Arachidi                     │
│ ☐ Soia    ☑ Latte    ☐ Frutta a guscio ☐ Sedano ☐ Senape           │
│ ☐ Sesamo  ☐ Solfiti  ☐ Lupini ☐ Molluschi                          │
│ Calcolati dagli ingredienti: [Uova, Latte, Pesce]                   │
│                          [↻ Rigenera dichiarazione da ingredienti]   │
│                                                                     │
│ Foto: [scegli file]                                                 │
│                                                                     │
│              [Annulla]              [Salva]                         │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.4 Stile

Palette: `bg-brand-cream` di sfondo, sezioni con accenti `brand-blue` per attivi e `brand-green` per pubblicato. Testa edizione come quelle di SchedaVino (gradiente soft). Touch target 44pt. `Btn` da `components/ui/`. Niente font custom oltre Playfair Display 700 sui titoli sezione (già caricato).

---

## 6. Integrazioni con moduli esistenti

| Modulo | Integrazione |
|--------|--------------|
| **Food cost v2** (`recipes`) | ✅ Ogni `menu_dish_publication` punta a una `recipes` (LEFT JOIN per fallback nome/descrizione/allergeni). Modificare il prezzo carta da menu_carta NON modifica `recipes.selling_price` (che resta il prezzo "default"). |
| **Cucina HACCP** (`tasks.sqlite3`) | ✅ Implementato come **generatore MEP** (Blocco E, sessione 57): `POST /editions/{id}/generate-mep` crea in `tasks.sqlite3` un `checklist_template` "MEP Carta · {partita} · {slug}" per partita (Antipasti/Primi/Secondi/Contorni/Dolci 🆕), item CHECKBOX uno per piatto, `attivo=0` (attivazione manuale da Impostazioni Cucina) — `menu_carta_router.py:891-1017`. I 5 template MEP fissi della mig 097 restano come fallback. |
| **Preventivi banchetti** (`clienti_menu_template`) | ❌ Bottone "Importa da menu carta" non implementato (nessun riferimento a menu_carta in `menu_templates_service.py` / `menu_templates_router.py`). |
| **M.A Notifiche** | ❌ Non implementato (nessuna notifica su publish/sposta piatto nel router). |
| **M.B PDF brand** | ✅ Endpoint `/editions/{id}/pdf` usa `pdf_brand.genera_pdf_html` con template `menu_carta.html` + CSS dedicato (`menu_carta_router.py:1094-1181`; il nome file template è `menu_carta.html`, non `menu_carta_a5.html`). |
| **M.F Alert engine** | ❌ Checker `menu_publication_costs` non implementato (nessun `@register_checker` menu-carta in `app/services/alert_engine.py`). |
| **iPratico vendite** | ❌ Cross-check non implementato. |
| **Allergeni / `ingredients.allergeni`** | ✅ Implementato (Modulo C, 2026-04-27) ma NON come job notturno: cache ricorsiva `recipes.allergeni_calcolati` ricalcolata automaticamente su POST/PUT ricetta + on-demand via `POST /foodcost/ricette/{id}/ricalcola-allergeni` e `POST /foodcost/ricette/ricalcola-allergeni-tutti` (`app/services/allergeni_service.py`, `app/routers/foodcost_recipes_router.py`). La dichiarazione finale resta umana (`menu_dish_publications.allergeni_dichiarati`). |

---

## 7. QR menu cliente (futuro, non in v1)

🆕 Implementato in variante semplificata (Modulo G.1, 2026-04-27): pagina pubblica FE **`/carta/menu`** (`frontend/src/pages/public/CartaMenuPubblica.jsx`) che consuma `GET /menu-carta/public/today` (no auth) e mostra sempre l'edizione `in_carta`; QR generabile da Impostazioni Cucina ("QR Carta Menu", `RicetteSettings.jsx:32,1020`). Il resto del paragrafo (URL per-slug `/m/{slug}`, switch lingua, redirect `/m/today`) resta futuro/non implementato.

Design originale: una volta che le edizioni sono in DB, generare una pagina pubblica `/m/{slug}` (es. `osteriatregobbi.it/m/primavera-2026`) renderizzata server-side con:

- Sezioni come da PDF
- Allergeni dichiarati (UE 1169/2011 obbligatorio)
- Foto piatto se disponibili
- Switch lingua (futuro)
- QR sui tavoli punta a `/m/today` → 302 alla edizione `in_carta`

Permette di pubblicare il menu in tempo reale senza ristampe.

---

## 8. Migrazione dati: archiviazione del menu Primavera 2026

> ⚠️ Sezione storica: piano di seed del design doc (eseguito con la mig 098; l'edizione Estate 2026 è arrivata poi con la mig 154, 2026-07-19). Le migrazioni non sono incluse in questo snapshot del repo, quindi il contenuto effettivo dei seed non è ri-verificato riga per riga.

Tutte le voci da archiviare sono nel PDF `menù-A5-primavera-2026-definitivo.pdf`. Vediamo come si traducono.

### 8.1 Mappa piatti del menu → recipes (tutte da CREARE)

Stato `recipes`: **VUOTA**. Vanno create 21 ricette piatto (oltre alle ricette base che servono come componenti). La tabella sotto è il piano di lavoro.

| # | Sezione PDF | menu_name (come stampato) | name interno (suggerito) | category_id | service_type | kind | prezzo carta primavera 2026 |
|---|-------------|---------------------------|--------------------------|-------------|--------------|------|------------------------------|
| 1 | Antipasti | Tegamino di asparagi e uovo 63° | Tegamino asparagi uovo 63° | 1 (Antipasto) | 1 (Alla carta) | dish | 16 |
| 2 | Antipasti | Sua Maestà "La Taragna" | Taragna 5 formaggi bergamaschi | 1 | 1 | dish | 16 |
| 3 | Antipasti | Cappuccino di baccalà e patata | Cappuccino baccalà mantecato | 1 | 1 | dish | 16 |
| 4 | Antipasti | La Tartare dell'Oste | Tartare manzo 23 ingredienti | 1 | 1 | dish | 22 |
| 5 | Antipasti | Il Vitello Tonnato dell'Osteria | Vitello tonnato girello rosa | 1 | 1 | dish | 20 |
| 6 | Antipasti | Il salame del Roberto con la giardiniera | Salame Roberto + giardiniera | 1 | 1 | dish | 16 |
| 7 | Antipasti | I nostri salumi misti | Tagliere salumi misti (per 2) | 1 | 1 | dish | 20 (consigliato_per=2) |
| 8 | Antipasti | Le selezioni di formaggi italiani | Tagliere formaggi italiani | 1 | 1 | dish | 14 / 20 (P/G) |
| 9 | Antipasti | Le selezioni di formaggi francesi | Tagliere formaggi francesi | 1 | 1 | dish | 15 / 25 (P/G) |
| 10 | Paste, risi e zuppe | Risotto alla Vignarola | Risotto Vignarola Carnaroli SM | 2 (Primo) | 1 | dish | 18 |
| 11 | Paste, risi e zuppe | Fettuccine all'Alfredo se fosse stato di Bergamo | Fettuccine burro + formai de mut | 2 | 1 | dish | 18 |
| 12 | Paste, risi e zuppe | Casoncelli di mamma e papà | Casoncelli ricetta famiglia Carminati | 2 | 1 | dish | 18 |
| 13 | Paste, risi e zuppe | Lasagnetta al ragù di cortile | Lasagnetta ragù 5 carni bianche | 2 | 1 | dish | 20 |
| 14 | Paste, risi e zuppe | Pasta mista, sarda di Montisola ed erba orsina | Pasta mista sarda + aglio orsino | 2 | 1 | dish | 20 |
| 15 | Paste, risi e zuppe | Trippa dell'Oste | Trippa minestrone primaverile | 2 | 1 | dish | 18 |
| 16 | Piatti del giorno | Raccontati a voce | Piatti del giorno (placeholder) | NULL | 1 | dish | da 14 a 26 (descr. variabile) |
| 17 | Secondi | Faraona, carote, senape e miele | Faraona BT + carote + miele | 3 (Secondo) | 1 | dish | 24 |
| 18 | Secondi | Filetto alla Donizetti | Filetto + fegatini + spugnole + Valcalepio | 3 | 1 | dish | 35 |
| 19 | Secondi | Ossobuco di vitello con purè | Ossobuco gremolada + purè | 3 | 1 | dish | 24 |
| 20 | Secondi | Vuoi un piatto unico con ossobuco e risotto giallo? | Ossobuco + risotto milanese (combo) | 3 | 1 | dish | 35 |
| 21 | Secondi | Brasato di manzo e polenta | Brasato manzo + polenta | 3 | 1 | dish | 24 |
| 22 | Secondi | Arrosto di coniglio e agretti | Coniglio disossato + agretti | 3 | 1 | dish | 22 |
| 23 | Secondi | Pescato del giorno | Pescato del giorno (placeholder) | 3 | 1 | dish | 26 (descr. variabile) |
| 24 | Contorni | Polenta nostrana | Polenta nostrana | 4 (Contorno) | 1 | dish | 4 |
| 25 | Contorni | Assaggio di Sua Maestà la Taragna | Assaggio taragna | 4 | 1 | dish | 8 |
| 26 | Contorni | Patate arrosto | Patate arrosto | 4 | 1 | dish | 6 |
| 27 | Contorni | Spadellata di verdure | Spadellata verdure stagione | 4 | 1 | dish | 6 |
| 28 | Contorni | Giardiniera di verdure | Giardiniera casa | 4 | 1 | dish | 6 |
| 29 | Contorni | Insalata mista di stagione | Insalata mista stagione | 4 | 1 | dish | 6 |

**Totale: 29 voci da archiviare** (di cui 2 placeholder per "voce" — piatti giorno + pescato).

### 8.2 Degustazioni → menu_tasting_paths

```
PATH 1 — "Prima volta", 60 € a persona
  step 1 → publication "Antipasto misto dell'osteria" (titolo libero, non mappa a una recipe singola)
  step 2 → publication #12 (Casoncelli di mamma e papà)
  step 3 → publication #21 (Brasato di manzo e polenta)
  step 4 → "Dolce a scelta" (titolo libero)

PATH 2 — "Fidati dell'Oste", 75 € a persona
  step 1 → publication #3 (Cappuccino di baccalà e patata)
  step 2 → publication #5 (Vitello tonnato dell'Osteria)
  step 3 → publication #11 (Fettuccine all'Alfredo)
  step 4 → publication #10 (Risotto alla Vignarola)
  step 5 → publication #17 (Faraona, carote, senape e miele)
  step 6 → "Dolce a scelta" (titolo libero)
```

### 8.3 Sezione "servizio" (coperto, bevande)

Sezione speciale con `recipe_id = NULL` (non sono ricette).

| menu_name | prezzo_singolo | sort |
|-----------|----------------|------|
| Coperto | 5 | 10 |
| Acqua | 3 | 20 |
| Espresso | 3 | 30 |
| The e tisane | 8 | 40 |
| Moka "Pump" (degustazione per due) | 10 | 50 |

### 8.4 Menu bambini

Due righe simboliche, sezione "bambini":

| menu_name | prezzo_singolo |
|-----------|----------------|
| Primo piatto bambini (su richiesta) | 10 |
| Secondo piatto bambini (su richiesta) | 15 |

### 8.5 Ricette base implicite (da popolare nel food cost)

Componenti riutilizzabili che vengono fuori dal menu primavera 2026 e che **conviene archiviare come `recipes.kind='base'`**:

- Salsa olandese al tuorlo
- Salsa tonnata fresca
- Fondo bruno
- Fondo al Valcalepio rosso
- Crema di fegatini al burro di malga
- Pesto di aglio orsino
- Crema di caprino
- Polenta nostrana base
- Polenta taragna base (5 formaggi)
- Ragù di cortile (5 carni bianche, cottura 3 giorni)
- Brodo carni bianche
- Giardiniera della casa
- Mantecatura per casoncelli (burro/salvia)
- Olandese 63°

Ognuna entra come `recipes.kind='base'`, finisce come `sub_recipe_id` nelle righe delle 21 ricette piatto.

---

## 9. Roadmap implementativa

Tre fasi minime. Ogni fase è un push.

### Fase 1 — schema + populate (1 sessione) — ✅ FATTA

1. Migrazione **`098_menu_carta_init`** (non 097: la 097 sono i 5 template MEP fissi cucina — cfr. `menu_carta_router.py:9,823-824`):
   - CREATE `menu_editions`, `menu_dish_publications`, `menu_tasting_paths`, `menu_tasting_path_steps`
   - ALTER `recipes` ADD COLUMN `allergeni_calcolati`, `istruzioni_impiattamento`, `tempo_servizio_minuti`
2. Seed dell'edizione "Primavera 2026" con tutte le 29 voci della § 8.1 in stato `in_carta`. Ricette piatto vuote inizialmente (solo `name`, `menu_name`, `menu_description`, `category_id`, `kind='dish'`).
3. Seed delle 2 degustazioni con i 10 step (§ 8.2).
4. Seed delle 5 voci di servizio (§ 8.3) e delle 2 voci bambini (§ 8.4).

### Fase 2 — backend API + UI base (1-2 sessioni) — ✅ FATTA

1. ✅ Router `menu_carta_router.py` con endpoint § 4.1 e § 4.2 (CRUD edizioni + pubblicazioni).
2. Pagine FE:
   - ✅ `frontend/src/pages/cucina/MenuCartaElenco.jsx` (lista edizioni)
   - ✅ `frontend/src/pages/cucina/MenuCartaDettaglio.jsx` (testa + tab; niente drag&drop)
   - ❌ `PubblicazioneModale.jsx` come file separato (rimosso dal piano: la modale § 5.3 è integrata in `MenuCartaDettaglio.jsx`)
3. ✅ Voce in `modulesMenu.js`: sotto "Gestione Cucina" → "Menu Carta" → `/menu-carta` (`modulesMenu.js:69`).

### Fase 3 — popolamento ricette + integrazioni (N sessioni) — parziale

1. Compilare le 21 ricette piatto + ricette base dalla § 8.5 — lavoro di Marco/cuochi assistito (stato dati non verificabile da repo).
2. ✅ Endpoint § 4.4 (PDF stampa via M.B PDF brand) — `menu_carta_router.py:1094`.
3. ✅/❌ Endpoint § 4.5: mise en place via generatore MEP (`mep-preview`/`generate-mep`); schede piatto stampabili ❌.
4. ❌ Cross-check con iPratico (warning prodotti carta non mappati).
5. ❌ Checker M.F per food cost % oltre soglia.
6. ✅ (variante) Pagina pubblica `/carta/menu` per QR (Modulo G.1, cfr. § 7); `/m/{slug}` ❌.

---

## 10. Domande aperte per Marco

1. **Stagioni del menu**: 4 fisse (primavera/estate/autunno/inverno) o vuoi più libertà (es. "Tartufo bianco 2026" di nicchia tra autunno e inverno)? *Proposta:* libero — `stagione` è solo etichetta, non vincolo.
2. **Edizioni concorrenti**: una sola `in_carta` per volta, o vuoi gestire più carte parallele (es. menu pranzo lavoro a parte)? *Proposta:* una sola `in_carta` per service_type. Quindi possono coesistere "Primavera 2026 carta" e "Primavera 2026 pranzo lavoro" se entrambi `in_carta` ma su `service_type` diversi.
3. **Allergeni**: vuoi una matrice booleana sui 14 allergeni UE (`menu_dish_publications.glutine`, `lattosio`, ...) o un CSV testuale come proposto? *Proposta:* CSV in v1, eventuale normalizzazione a tabella M:N in v2 quando serve. → **Risolta: CSV** (Modulo C, `allergeni_service.py` — CSV lowercase ordinato).
4. **Ricette già esistenti**: in produzione `foodcost.db` ne ha già qualcuna creata da Marco/cuochi? Se sì, prima del seed va fatto un check duplicati su `menu_name`.
5. **Foto piatto**: dove vivono? *Proposta originale:* `frontend/public/menu_photos/...`. → **Risolta diversamente** (Modulo D + Modulo K): upload gestito dal backend, salvataggio **fuori dal repo** in `<UPLOADS_DIR>/menu_carta/<edition_id>/<pub_id>.jpg` (default prod `/home/marco/trgb_uploads/`), path relativo `/uploads/menu_carta/...` in `foto_path`; i path legacy `/static/menu_carta/...` restano serviti (`app/services/menu_carta_image_service.py`, `app/utils/uploads.py`).
6. **Lingua**: serve già il menu inglese (turisti)? *Proposta:* fuori v1; volendo, in v2 un'altra colonna `menu_name_en` / `menu_description_en` su `menu_dish_publications`. → **Risolta 2026-08-07, ma NON con le colonne**: sei lingue (it/en/fr/es/de/uk) × quattro campi farebbero ventiquattro colonne e un `ALTER TABLE` su DB live a ogni lingua nuova. Realizzato con la tabella di traduzione `menu_translations` (mig 163) — cfr. § 11.
7. **Storico prezzi**: quando una pubblicazione cambia prezzo dentro la stessa edizione, va tracciato? *Proposta:* un trigger che scrive un evento in `menu_publication_price_log` (tabella futura, fuori v1).

---

## 11. Multilingua (i18n) — 2026-08-07 🆕

> **Classificazione:** `[core]` — il motore è di prodotto, riusabile da qualsiasi
> ristorante. I *contenuti* tradotti dell'Osteria Tre Gobbi sono `[locale:tregobbi]`
> e vivono in una migrazione seed separata.

### 11.1 Il modello

L'italiano è **lingua madre** e non vive nella tabella traduzioni: sta dove è
sempre stato (`menu_dish_publications.titolo_override` / `descrizione_override`,
`recipes.menu_name` / `menu_description`, `menu_tasting_paths.sottotitolo` /
`note`). `menu_translations` (mig 163) contiene **solo** le traduzioni.

| Colonna | Valori |
|---|---|
| `entita` | `publication` \| `tasting_path` \| `edition` |
| `entita_id` | id nella tabella corrispondente (polimorfico → **nessuna FK possibile**) |
| `lang` | `en` \| `fr` \| `es` \| `de` \| `uk` — mai `it` |
| `campo` | `titolo` \| `descrizione` \| `prezzo_label` \| `sottotitolo` \| `note` \| `storia` |
| `valore` | testo tradotto |
| `rivisto` | `0` = entrato col seed, `1` = approvato da Marco dal backoffice |

Chiave unica `(entita, entita_id, lang, campo)` + indice di lettura
`(entita, entita_id, lang)`.

**Nome della tabella:** `menu_translations`, non `menu_carta_translations`. Le 4
tabelle del modulo (mig 098) usano tutte il prefisso `menu_`: quello *è* il
prefisso reale del modulo `menu_carta`, e a R8 il `module.json` ne dichiarerà
uno solo. Deciso con Marco il 2026-08-07.

### 11.2 Le due regole che non si toccano

1. **Fallback a cascata: traduzione → italiano.** Verso l'ospite non esce mai
   una stringa vuota. Se manca la traduzione di un piatto, si legge l'italiano:
   non è un errore, è il comportamento previsto. Una traduzione salvata vuota
   viene scartata in lettura e **cancellata** in scrittura.
2. **Retrocompatibilità di `public/today`.** Le traduzioni si scrivono *dentro*
   i campi originali (`titolo_override`, …), non in campi paralleli. La forma
   della risposta non cambia: gli unici campi nuovi sono `lang` e
   `lingue_disponibili`. Chi chiama senza `?lang=` vede esattamente quello che
   vedeva prima — verificato per confronto della risposta serializzata.

### 11.3 Cosa NON si traduce

- **`menu_tasting_paths.nome`** — resta sempre italiano: *"Fidati dell'oste"* è
  la firma della casa, non contenuto. Il sottotitolo, che è discorsivo, viene
  tradotto e fa il lavoro di spiegare il percorso. Deciso 2026-08-07.
- **Le etichette di sezione** (Antipasti → *Starters*) — sono struttura di
  prodotto, non contenuto del ristorante: dizionario statico in
  `app/services/menu_i18n_service.py` + **gemello** in
  `frontend/src/config/menuI18n.js`. Se tocchi uno, tocca l'altro.
- **La Storia dell'oste** — deciso 2026-08-07 che è testo di *locale* (identità,
  non contenuto stagionale) e andrà in `locali/tregobbi/strings.<lang>.json`.
  ⚠️ Oggi la pagina Storia **non esiste** né nel frontend pubblico né come
  colonna su `menu_editions`: l'entità `edition`/campo `storia` è predisposta in
  `menu_translations` ma non usata. Da fare in sessione dedicata.

### 11.4 Ciclo di vita delle righe

- **Clone edizione** → le traduzioni seguono le mappe di id e vengono clonate
  (`ON CONFLICT DO NOTHING`), mantenendo `rivisto`. Senza questo, ogni cambio di
  carta stagionale butterebbe via sei lingue di lavoro sui piatti riportati.
- **Delete publication / tasting path / edition** → cleanup esplicito degli
  orfani nel router. `entita_id` è polimorfico, quindi non c'è FK e il cascade
  di SQLite non li raggiunge; senza cleanup un id riciclato da AUTOINCREMENT si
  porterebbe dietro le traduzioni di un piatto morto.

### 11.5 Capability

| Codice | Cosa fa | file:linea | Audience | Stato |
|---|---|---|---|---|
| **C-MC-011** | Today menu pubblico, ora con `?lang=` (it/en/fr/es/de/uk); lang ignoto o assente → `it` senza errore | `menu_carta_router.py:1465` | cliente esterno | ⚠️ aggiornata |
| **C-MC-023** | Selettore lingua sulla pagina pubblica `/carta/menu` — bandiera + sigla; `?lang=` URL → localStorage → `navigator.language` → it; il cambio riscrive l'URL (link condivisibile) | `CartaMenuPubblica.jsx:437` | cliente esterno | 🆕 |
| **C-MC-024** | Tab **Traduzioni** nel backoffice edizione: italiano a sinistra in sola lettura, lingua a destra editabile, checkbox *Approvata*, filtri (da tradurre / da rivedere / non approvate), salvataggio massivo | `MenuCartaDettaglio.jsx:223` | manager | 🆕 |
| **C-MC-025** | Lettura righe traducibili di un'edizione con originale IT, traduzione e flag `stale` (italiano modificato dopo l'ultima traduzione) | `GET /menu-carta/translations/` · `menu_carta_router.py:1322` | manager | 🆕 |
| **C-MC-026** | Upsert massivo traduzioni; valore vuoto = cancella e torna al fallback italiano | `PUT /menu-carta/translations/` · `menu_carta_router.py:1397` | manager | 🆕 |
| **C-MC-027** | Copertura per lingua sull'edizione (tradotte / approvate / totale / %). Denominatore = campi con italiano non vuoto | `GET /menu-carta/translations/coverage/` · `menu_carta_router.py:1413` | manager | 🆕 |
| **C-MC-028** | Clone edizione: porta con sé le traduzioni delle publication e delle degustazioni | `POST /editions/{id}/clone` · `menu_carta_router.py:403` | manager | ⚠️ aggiornata |

### 11.6 Selettore lingua: bandiera + sigla

Marco, 2026-08-07: bandierine sui pulsanti. Realizzato come **bandiera + sigla**, mai bandiera da sola:

- le emoji bandiera **non renderizzano su Windows** (mostrano le due lettere del codice paese), quindi la sigla non è ridondanza ma il vero contenuto del bottone;
- la bandiera è `aria-hidden`, il bottone ha `aria-label` col nome della lingua nella lingua stessa (*Français*, non *Francese*): lo screen reader legge la lingua, non "bandiera della Francia";
- font emoji di sistema esplicito sulla bandiera — il Cormorant Garamond non ha quei glifi.

⚠️ **`uk` è il codice ISO 639-1 dell'ucraino, non del Regno Unito.** Con la bandiera 🇺🇦 accanto, la sigla "UK" leggerebbe *United Kingdom* a chiunque: sul selettore si mostra **"UA"** (codice paese), mentre il codice interno resta `uk` ovunque (DB, `?lang=`, API). Per non tradire chi ricopia la sigla vista a schermo, `normalizza_lang()` accetta `ua` come alias di `uk` — in entrambi i gemelli, verificato su 13 input.

### 11.7 Seed Estate 2026 — `[locale:tregobbi]`, mig 164

Sorgente: `locali/tregobbi/seeds/menu_traduzioni_lug_set_2026.py`, generato da `sorgenti_menu_lug_set_2026/costruisci_seed.py` (italiano + EN/FR/ES + DE/UK). Traduzioni revisionate da madrelingua. **I sorgenti sono conservati accanto al generato: se cambia la carta si rigenera, non si edita a mano.**

**Copertura: 44/44 publications, 2/2 degustazioni, 400 righe (80 per lingua × 5).** Tutte con `rivisto = 0`.

Il matching sul titolo italiano ha richiesto tre accorgimenti, ognuno per una discrepanza reale fra cartaceo e DB:

| Discrepanza | Perché | Come |
|---|---|---|
| `(NG)` `(NL)` e traduzioni `(GF)(LF)` `(SG)(SL)` `(БГ)(БЛ)` | Tag dietetici: nel cartaceo fanno parte del titolo, a DB no | Tolti da chiave **e** valore |
| `(prezzo per 2 persone)` nel titolo | A DB è già in `prezzo_label` + `consigliato_per` | Tolto dal titolo, **riusato** per tradurre `prezzo_label` |
| `PRIMO PIATTO` vs `Primo piatto bambini` | Il cartaceo abbrevia | Mappa esplicita `MAPPA_BAMBINI` |

Altri due punti non ovvi:

- **`da 14 a 26`** (piatti del giorno) non è nel seed tradotto: lì il prezzo è una stringa sola condivisa fra le lingue. Le traduzioni sono state prese **dai PDF consegnati**, non inventate, e stanno in `PREZZI_LABEL`. Se compare un `prezzo_label` nuovo non coperto, la migrazione lo stampa a video dicendo dove aggiungerlo.
- **`<i>...</i>`** nei due testi tedeschi (corsivo su *Oste*) viene **strippato**: la pagina pubblica è React e stamperebbe il markup come testo letterale. Aggiungere un renderer HTML a una pagina pubblica senza auth per due corsivi decorativi non vale la superficie di rischio. L'italiano a DB non ha mai contenuto markup.

⚠️ **Debito dichiarato — i tag dietetici.** `(NG)`/`(NL)` significano *senza glutine* / *senza lattosio*: sono un "adatto a", **non** allergeni presenti (*La piantina del tiramisù* è `(NG)` ma ha latte e uova in `allergeni_dichiarati`). A DB non esiste un campo per questa informazione e il titolo italiano non la porta, quindi tenerla solo nelle lingue darebbe due carte diverse. Tolta ovunque: il digitale resta **alla pari con l'italiano di oggi**, ma più povero del cartaceo. Da modellare come campo dedicato — è la cosa più utile da fare dopo, perché un celiaco che legge il QR oggi non trova l'informazione che ha sul menù di carta.

### 11.8 Fuori perimetro (dichiarato)

- Il **PDF stampabile** (`/menu-carta/editions/{id}/pdf`) resta italiano: il
  cartaceo in sala è italiano per scelta, il digitale è il canale multilingua.
- **`CartaClienti`** (vini & bevande) ha la stessa esigenza ma non è stata
  toccata: sessione separata.
- Nessuna traduzione automatica a runtime, nessuna chiamata a servizi esterni:
  le traduzioni sono contenuto rivisto e stanno a DB.

---

## 12. Riferimenti

- `docs/modulo_ricette_foodcost.md` — schema food cost v2 (fonte di verità su `recipes`)
- `docs/modulo_cucina.md` — modulo Cucina HACCP MVP (sessione 43)
- `docs/modulo_pranzo.md` — sub-modulo Pranzo settimanale (stessa area Gestione Cucina)
- `docs/architettura_mattoni.md` — mattoni condivisi (M.A, M.B, M.F)
- `app/routers/menu_carta_router.py` — router implementato (v1.3-i18n) · `app/services/menu_carta_image_service.py` (foto) · `app/services/allergeni_service.py` (Modulo C) · `app/services/menu_i18n_service.py` (i18n, § 11)
- Frontend: `frontend/src/pages/cucina/MenuCartaElenco.jsx` · `MenuCartaDettaglio.jsx` · `frontend/src/pages/public/CartaMenuPubblica.jsx` (route `/menu-carta`, `/menu-carta/:id`, `/carta/menu`) · `frontend/src/config/menuI18n.js` (dizionario lingue, **gemello** di `menu_i18n_service.py`)
- `app/migrations/163_menu_carta_i18n.py` — tabella `menu_translations` (§ 11)
- `app/migrations/074_recipes_menu_servizi.py` — estensione `recipes` per menu/servizi (sessione 35)
- `app/migrations/080_menu_templates.py` — template menu per preventivi banchetto (sessione 39)
- Migrazioni menu carta: 097 (5 template MEP fissi), 098 (init menu carta), 154 (seed Estate 2026 + dolci, locale tregobbi) — *non presenti in questo snapshot, citate da commenti nel codice*
- `menù-A5-primavera-2026-definitivo.pdf` — fonte di verità del menu da archiviare
