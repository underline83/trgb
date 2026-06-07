# Modulo Ricette & Food Cost — TRGB Gestionale

**Ultimo aggiornamento:** 2026-05-08 (consolidamento docs)
**Stato:** stabile, in produzione
**Versione modulo (`versions.jsx`):** ricette/foodcost v3.0
**Router:** `foodcost_recipes_router.py`, `foodcost_matching_router.py`, `foodcost_ingredients_router.py`
**DB:** `app/data/foodcost.db` (migrazioni 001-013 per parte ricette)
**Roadmap:** sezione `R.` di `docs/roadmap.md`

---

# 0. Indice

1. Panoramica e obiettivi
2. Concetti chiave (ingrediente vs ricetta-base, prezzo, sub-ricetta)
3. Architettura backend
4. Schema database
5. Calcolo Food Cost (algoritmo + esempio)
6. Matching fatture XML → ingredienti
7. Conversioni unità di misura
8. Frontend (pagine + funzioni)
9. Esclusioni e modulo cooperante con Acquisti
10. Roadmap e debt

---

# 1. Panoramica e obiettivi

Il modulo **Ricette & Food Cost** copre 3 filoni operativi:

1. **Anagrafica ricette** — cucina, pasticceria, basi (sub-ricette riusabili). Una crema base diventa ingrediente di N dolci. Annidamento a profondità arbitraria con cycle detection.
2. **Food cost preciso** — costo per porzione + % sul prezzo di vendita, calcolato in real-time, aggiornato automaticamente quando cambia un prezzo a monte (a cascata su tutte le ricette che usano quell'ingrediente).
3. **Aggancio prezzi da fatture XML** — match automatico riga fattura → ingrediente, multi-fornitore (codici diversi, prezzi diversi, unità diverse). Prima conferma manuale, poi automatico per le fatture future.

Il modulo lavora **in tandem con Acquisti**: quest'ultimo importa fatture XML/FIC, popola `fe_fatture`/`fe_righe`, il modulo Ricette le legge per matching e prezzi.

---

# 2. Concetti chiave

## 2.1 Ingrediente vs Ricetta-base

- **Ingrediente** = materia prima che compri (farina, burro, latte). Vive in `ingredients`.
- **Ricetta-base** = qualcosa che produci e che diventa componente di altre ricette (crema pasticcera, brodo, pasta frolla). Vive in `recipes` con flag `is_base=1`.

Nella tabella `recipe_items`, ogni riga punta a UN ingrediente OPPURE a UNA sub-ricetta (mai entrambi). Vincolo a livello SQL: esattamente uno tra `ingredient_id` e `sub_recipe_id` deve essere valorizzato.

## 2.2 Prezzo ingrediente = ultimo prezzo fattura

Il costo di un ingrediente è l'**ultimo prezzo unitario** ricavato dall'ultima fattura importata per quell'ingrediente. **Non una media** — il prezzo reale attuale.

Lo storico è tenuto integralmente in `ingredient_prices` (mai sovrascritto), ma il calcolo food cost usa sempre il più recente.

## 2.3 Costo ricetta-base = somma ingredienti / resa

Se "Crema Pasticcera" rende 2 kg e usa 3 € di ingredienti, il costo è 1,50 €/kg. Quando la usi in un dolce (es. 200 g), il costo di quella riga è 0,30 €.

## 2.4 Matching fatture → ingredienti (il pezzo smart)

Ogni fornitore chiama gli ingredienti a modo suo:
- Fornitore A: "FARINA 00 MOLINO SPADONI KG 25" → Farina 00
- Fornitore B: "FARINA T.00 SACCO 25KG" → Farina 00

Serve una **tabella di mapping** che collega la descrizione/codice del fornitore al tuo ingrediente. La prima volta confermi manualmente; poi il sistema ricorda (auto-match per fatture successive).

---

# 3. Architettura backend

## 3.1 Router (FastAPI)

| Router | File | Prefix | Funzione |
|--------|------|--------|----------|
| Ricette | `foodcost_recipes_router.py` | `/foodcost` | CRUD ricette, categorie, calcolo food cost |
| Matching | `foodcost_matching_router.py` | `/foodcost` | Matching fatture → ingredienti, Smart Create, esclusioni |
| Ingredienti | `foodcost_ingredients_router.py` | `/foodcost` | CRUD ingredienti, prezzi, conversioni |

## 3.2 Endpoint principali

### Ricette
- `GET /foodcost/ricette` — lista con food cost calcolato in real-time
- `GET /foodcost/ricette/{id}` — dettaglio con items arricchiti (`unit_cost`, `line_cost`)
- `POST /foodcost/ricette` — crea ricetta con items
- `PUT /foodcost/ricette/{id}` — aggiorna (replace items)
- `DELETE /foodcost/ricette/{id}` — soft delete (`is_active=0`)
- `DELETE /foodcost/ricette/{id}/hard` — eliminazione DEFINITIVA (2026-06-07). 409 se usata come sub-ricetta o pubblicata su menu carta. Cancella recipe_items + recipe_service_types, scollega pranzo_menu_righe/pranzo_piatti (snapshot storico intatto), poi DELETE recipes. UI: bottone "🗑 Elimina" in RicetteDettaglio + barra batch RicetteArchivio
- `GET /foodcost/ricette/categorie` — lista categorie
- `POST /foodcost/ricette/categorie` — crea categoria
- `GET /foodcost/ricette/basi` — lista ricette base (per dropdown sub-recipe)

### Matching
- `GET /foodcost/matching/pending` — righe fattura non associate
- `GET /foodcost/matching/suggest?riga_id=X` — suggerimenti fuzzy
- `GET /foodcost/matching/smart-suggest` — suggerimenti Smart Create con grouping
- `POST /foodcost/matching/confirm` — conferma match → salva mapping + prezzo
- `POST /foodcost/matching/auto` — auto-match batch
- `POST /foodcost/matching/bulk-create` — creazione ingredienti in blocco
- `GET /foodcost/matching/mappings` — lista mappings attivi
- `DELETE /foodcost/matching/mappings/{id}` — elimina mapping
- `POST /foodcost/matching/ignore-description` — ignora descrizione non-ingrediente
- `GET /foodcost/matching/ignored-descriptions` — lista descrizioni ignorate
- `GET /foodcost/matching/suppliers` — fornitori con toggle esclusione

### Ingredienti
- `GET /foodcost/ingredients` — lista con ultimo prezzo
- `POST /foodcost/ingredients` — crea ingrediente
- `PUT /foodcost/ingredients/{id}` — aggiorna
- `GET /foodcost/ingredients/categories` — categorie
- `GET /foodcost/ingredients/{id}/conversions` — conversioni unità custom
- `POST /foodcost/ingredients/{id}/conversions` — crea conversione
- `DELETE /foodcost/ingredients/conversions/{id}` — elimina conversione

---

# 4. Schema database (`foodcost.db`)

## 4.1 Tabelle preesistenti (non si toccano — vive in Acquisti)

- `suppliers` — anagrafica fornitori (auto-creati da fatture XML)
- `fe_fatture` — fatture XML importate
- `fe_righe` — righe fatture XML

## 4.2 Tabelle del modulo

| Tabella | Contenuto |
|---------|-----------|
| `ingredient_categories` | Categorie ingredienti (Latticini, Farine, Carni, Verdure, Spezie...) |
| `ingredients` | Anagrafica ingredienti (`name`, `default_unit`, `allergeni`, `note`, `is_active`) |
| `ingredient_prices` | Storico prezzi multi-fornitore (mai sovrascritto) |
| `ingredient_supplier_map` | ⭐ La chiave di volta — mapping fornitore → ingrediente per auto-match |
| `ingredient_unit_conversions` | Conversioni unità personalizzate per ingrediente |
| `recipe_categories` | Categorie ricette (8 default: ANTIPASTO, PRIMO, SECONDO, CONTORNO, DOLCE, BASE, SALSA, IMPASTO) |
| `recipes` | Ricette (`is_base`, `selling_price`, `prep_time`, `category_id`) |
| `recipe_items` | Righe ricetta (`ingredient_id` OR `sub_recipe_id`, mutuamente esclusivi) |
| `matching_description_exclusions` | Descrizioni ignorate nel matching |
| `matching_ignored_righe` | Righe fattura ignorate |

## 4.3 Schema dettaglio — tabelle principali

### `ingredient_categories`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| name | TEXT UNIQUE | Latticini, Farine, Carni, Verdure, Spezie... |
| description | TEXT | |

### `ingredients`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| name | TEXT | Nome standard interno (es. "Farina 00") |
| category_id | INT FK | → `ingredient_categories` |
| default_unit | TEXT | Unità base: kg, g, L, ml, pz |
| allergeni | TEXT | Glutine, Lattosio, Uova... |
| note | TEXT | |
| is_active | INT | Default 1 |
| created_at, updated_at | TEXT | |

### `ingredient_supplier_map` ⭐ (tabella chiave)

> Collega una riga fattura al tuo ingrediente. Senza di lei il matching automatico non esiste.

| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| ingredient_id | INT FK | → `ingredients` |
| supplier_id | INT FK | → `suppliers` |
| codice_fornitore | TEXT | Codice articolo del fornitore (se in fattura) |
| descrizione_fornitore | TEXT | "FARINA 00 MOLINO SPADONI KG 25" |
| unita_fornitore | TEXT | Unità del fornitore (es. "CF", "PZ", "KG") |
| fattore_conversione | REAL | Moltiplicatore per convertire in unità base (CF da 25kg → 25.0) |
| is_default | INT | 1 = fornitore preferito per questo ingrediente |
| confirmed_by | TEXT | Username che ha confermato il match |
| created_at | TEXT | |

**Esempio concreto:** Molino Spadoni vende "FARINA 00 KG 25" a 18€/CF.
- `ingredient_id` → "Farina 00"
- `codice_fornitore` → "ART-4521" (dal XML)
- `descrizione_fornitore` → "FARINA 00 MOLINO SPADONI KG 25"
- `unita_fornitore` → "CF" (confezione)
- `fattore_conversione` → 25.0 (1 CF = 25 kg)
- Prezzo convertito: 18 € / 25 = **0,72 €/kg** → salvato in `ingredient_prices`

### `ingredient_prices`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| ingredient_id | INT FK | |
| supplier_id | INT FK | |
| unit_price | REAL | Prezzo per unità base (€/kg, €/L, €/pz) — DOPO conversione |
| original_price | REAL | Prezzo originale fattura |
| original_unit | TEXT | Unità originale fattura |
| original_qty | REAL | Quantità originale fattura |
| fattura_id | INT FK | → `fe_fatture` |
| riga_fattura_id | INT FK | → `fe_righe` |
| price_date | TEXT | Data fattura |
| note | TEXT | |
| created_at | TEXT | |

### `recipes`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| name | TEXT | |
| category | TEXT | ANTIPASTO/PRIMO/SECONDO/CONTORNO/DOLCE/BASE/SALSA/IMPASTO |
| is_base | INT | 1 = ricetta-base usabile come sub-ricetta |
| yield_qty | REAL | Resa (4 porzioni, 2 kg, 500 ml) |
| yield_unit | TEXT | "porzioni", "kg", "g", "L", "ml" |
| selling_price | REAL | Prezzo vendita (NULL per basi) |
| prep_time | INT | Minuti preparazione |
| note | TEXT | |
| is_active | INT | Default 1 |
| created_at, updated_at | TEXT | |

### `recipe_items`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| recipe_id | INT FK | → `recipes` (padre) |
| ingredient_id | INT FK | NULL se sub-ricetta |
| sub_recipe_id | INT FK | NULL se ingrediente |
| qty | REAL | Quantità usata |
| unit | TEXT | g, kg, ml, L, pz |
| sort_order | INT | Ordine visualizzazione |
| note | TEXT | |
| created_at | TEXT | |

> ⚠️ **Vincolo:** esattamente UNO tra `ingredient_id` e `sub_recipe_id` deve essere valorizzato.

---

# 5. Calcolo Food Cost

## 5.1 Algoritmo (ricorsivo con cycle detection)

```
costo_ricetta = Σ (costo_riga per ogni item)
costo_per_unita = costo_ricetta / yield_qty

dove costo_riga =
  - se ingrediente: qty × prezzo_unitario_ingrediente (convertito nell'unità giusta)
  - se sub-ricetta: qty × costo_per_unita_sub_ricetta (chiamata ricorsiva)
```

**Cycle detection:** se `recipe_items` formano un ciclo (ricetta A usa B che usa A), il calcolo si ferma e segnala l'errore. Questo previene loop infiniti.

## 5.2 Formule chiave

```
costo_ingrediente_base = ultimo prezzo da ingredient_prices
                         (ORDER BY price_date DESC LIMIT 1)

food_cost_pct = (costo_porzione / selling_price) × 100
```

## 5.3 Esempio concreto

**Crema Pasticcera** (ricetta-base, resa: 2 kg)

| Ingrediente | Qty | Unità | Costo/unità | Costo riga |
|-------------|-----|-------|-------------|------------|
| Latte intero | 1 | L | 1,20 €/L | 1,20 € |
| Zucchero | 250 | g | 0,90 €/kg | 0,23 € |
| Tuorli | 6 | pz | 0,15 €/pz | 0,90 € |
| Farina 00 | 80 | g | 0,72 €/kg | 0,06 € |
| Vaniglia | 1 | pz | 1,50 €/pz | 1,50 € |
| **Totale** | | | | **3,89 €** |
| **Costo/kg** | | | | **1,94 €/kg** |

**Crème Brûlée** (piatto finale, resa: 4 porzioni, vendita: 10 €)

| Ingrediente | Qty | Unità | Costo/unità | Costo riga |
|-------------|-----|-------|-------------|------------|
| **Crema Pasticcera** (sub) | 400 | g | 1,94 €/kg | 0,78 € |
| Zucchero di canna | 40 | g | 2,10 €/kg | 0,08 € |
| Panna fresca | 200 | ml | 4,50 €/L | 0,90 € |
| **Totale** | | | | **1,76 €** |
| **Costo/porzione** | | | | **0,44 €** |
| **Food cost %** | | | | **4,4%** |

**Cascata:** se il fornitore alza il prezzo del latte da 1,20 a 1,50 €/L → la crema pasticcera si aggiorna automaticamente → la crème brûlée si aggiorna → ogni dolce con quella crema si aggiorna. Tutto in real-time, senza job batch.

## 5.4 Auto-normalizzazione prezzi

`_save_price_from_riga` (in `foodcost_matching_router.py`) normalizza automaticamente i prezzi fattura usando `convert_qty(ingredient_id, original_qty, original_unit, default_unit)`. Salva in `ingredient_prices` il prezzo già convertito nell'unità base dell'ingrediente.

---

# 6. Matching fatture XML → ingredienti

## 6.1 Pipeline

```
IMPORT XML (modulo Acquisti)
  │
  ▼
Per ogni riga fattura (fe_righe):
  │
  ├─ 1. Cerca match ESATTO in ingredient_supplier_map
  │     (supplier_id + codice_fornitore O descrizione_fornitore)
  │     ├─ TROVATO → aggiorna prezzo automaticamente ✅
  │     └─ NON TROVATO → vai a 2
  │
  ├─ 2. Cerca match FUZZY (Levenshtein su descrizione)
  │     ├─ Match > 80% → suggerisci all'utente (UI Smart Suggest)
  │     └─ Nessun match → mostra come "non abbinata" in tab "Da associare"
  │
  └─ 3. L'utente conferma/corregge il match (UI Smart Create)
        ├─ Salva in ingredient_supplier_map (la prossima volta auto)
        └─ Crea record in ingredient_prices con prezzo convertito
```

**Smart Create:** pipeline di pulizia nomi + grouping per descrizioni simili + suggerimenti unità/categoria. Permette di creare 10+ ingredienti in batch invece che uno alla volta.

**Auto-match per fatture successive:** dopo la prima conferma, tutte le fatture future di quel fornitore per quell'articolo sono agganciate automaticamente. Prezzo aggiornato senza intervento.

## 6.2 Tab UI `/ricette/matching` (4 tab)

1. **Da associare** — righe fattura "non abbinate", con fuzzy suggestion
2. **Smart Create** — grouping di descrizioni simili, creazione batch
3. **Mappings** — lista mapping attivi, possibilità di eliminare
4. **Fornitori** — toggle esclusione fornitori non pertinenti (servizi, attrezzature, ecc.)

---

# 7. Conversioni unità di misura

Sistema a **3 livelli**:

1. **Custom per ingrediente** (tabella `ingredient_unit_conversions`):
   - Diretta: `1 CF → 25 kg` (esempio Farina 00 sopra)
   - Inversa: `25 kg → 1 CF` (calcolata automaticamente da `1/fattore`)
   - **Chain resolution:** se serve `g → CF`, sistema cerca `g → kg → CF` e moltiplica i fattori
2. **Standard:**
   - Peso: kg=1, g=0.001
   - Volume: L=1, ml=0.001, cl=0.01
   - Conta: pz=1
3. **Compatibilità:** conversioni solo tra unità compatibili (peso↔peso, volume↔volume). Mai peso↔volume senza densità (per ora non implementato — richiederebbe campo `densita` per ingrediente, voce roadmap).

**UI conversioni:** `/ricette/ingredienti/:id/prezzi` — sezione conversioni custom con add/remove inline.

---

# 8. Frontend

| Pagina | Route | Funzione |
|--------|-------|----------|
| `RicetteMenu.jsx` | `/ricette` | Hub modulo con tile |
| `RicetteNuova.jsx` | `/ricette/nuova` | Form creazione con sub-ricette |
| `RicetteArchivio.jsx` | `/ricette/archivio` | Lista con FC%, filtri, azioni |
| `RicetteDettaglio.jsx` | `/ricette/:id` | Visualizzazione costi calcolati |
| `RicetteModifica.jsx` | `/ricette/modifica/:id` | Form modifica |
| `RicetteIngredienti.jsx` | `/ricette/ingredienti` | Anagrafica ingredienti |
| `RicetteIngredientiPrezzi.jsx` | `/ricette/ingredienti/:id/prezzi` | Storico prezzi + conversioni unità |
| `RicetteMatching.jsx` | `/ricette/matching` | 4 tab matching (vedi §6.2) |
| `RicetteDashboard.jsx` | `/ricette/dashboard` | 5 KPI + tabelle top FC e margini |
| `RicetteSettings.jsx` | `/ricette/settings` | Strumenti: export/import JSON ricette |

**Pattern UI consolidati TRGB:** sidebar filtri a sinistra, `SortTh` per colonne ordinabili, toast per feedback, palette `bg-brand-cream`. Touch target 44pt minimo.

---

# 9. Esclusioni e cooperazione con Acquisti

⚠️ **REGOLA CRITICA (vedi `CLAUDE.md`):**
- `fe_fornitore_categoria.escluso` → SOLO per modulo Ricette/Matching (esclude fornitori non pertinenti dalle suggestions matching)
- `fe_fornitore_categoria.escluso_acquisti` → SOLO per modulo Acquisti (esclude da dashboard/KPI)
- **NON mescolare mai** i due campi.

**Flusso operativo cooperante:**
1. Acquisti importa XML/FIC → `fe_fatture` + `fe_righe`
2. Ricette/Matching legge `fe_righe`, filtra per fornitori non esclusi (`escluso=0`)
3. Smart Create groupping + fuzzy suggest
4. Conferma match → `ingredient_supplier_map` + `ingredient_prices`

---

# 10. Roadmap modulo (sintesi — dettaglio in `roadmap.md` §R)

- Dashboard per reparto (cucina / pasticceria / cocktail)
- Storico variazione costi ricette (mini-grafico Recharts)
- Export PDF ricette con costi (dipendenza M.B PDF brand)
- Collegamento consumi → magazzino (scarico ingredienti da ricetta)
- Sistema permessi centralizzato
- Voci R.12, R.13, R.15 della vecchia roadmap **ELIMINATE** (decisione Marco, Batch 2)
- Voce R.5 vive nel modulo Cucina (gestione vendite)

## 10.1 Debt tecnico

- Nessuna densità ingredienti → impossibile peso↔volume (workaround: conversione custom per ingrediente)
- Allergeni come stringa libera (no tabella di lookup) — ostacola filtri/aggregazioni futuri (vedi voce roadmap)
- Mappings molti-a-uno potenzialmente confondenti se più fornitori hanno articoli con stesso `codice_fornitore` (collisione gestita ma da loggare)

## 10.2 Storia / context

Il modulo è stato **riscritto v2 a marzo 2026** (sessione 51?) per introdurre lo schema multi-fornitore con `ingredient_supplier_map`. La v1 aveva `recipes`/`recipe_items` con schema diverso, è stata buttata via (clean rebuild). Le tabelle `suppliers`, `fe_fatture`, `fe_righe` sono rimaste intatte (sono la base dati di Acquisti).

Le tabelle `invoices`/`invoice_lines` (vecchio schema duplicato in `foodcost.db`) sono state eliminate. Anche `app/routers/ricette.py` (router orfano, mai registrato) e `app/models/ricette_db.py` (model orfano, DB inesistente) sono stati rimossi.
