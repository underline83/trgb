# Modulo Ricette & Food Cost v3.0 — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-14
**Stato:** Beta — Backend e Frontend completi, in produzione
**Router:** `foodcost_recipes_router.py`, `foodcost_matching_router.py`, `foodcost_ingredients_router.py`
**DB:** `app/data/foodcost.db` (migrazioni 001–013)

---

## 1. Obiettivo del modulo

Il modulo **Ricette & Food Cost** gestisce:

- Anagrafica ingredienti con categorie, allergeni, unita' di misura
- Fornitori (auto-creati da fatture XML)
- Storico prezzi multi-fornitore (mai sovrascritti, ultimo prezzo usato per calcolo)
- **Conversioni unita' personalizzate** per ingrediente (custom + chain resolution)
- Ricette con supporto sub-ricette (ricetta come ingrediente di un'altra ricetta)
- Calcolo food cost ricorsivo: costo totale, costo/porzione, % su prezzo vendita
- **Matching avanzato** righe fatture XML → ingredienti con fuzzy search + Smart Create
- **Esclusione** fornitori non pertinenti e descrizioni non-ingrediente
- Categorie ricette configurabili (8 default)
- Dashboard con KPI e top food cost
- Strumenti: export/import JSON ricette

---

## 2. Architettura

### 2.1 Backend (FastAPI)

| Router | File | Prefix | Funzione |
|--------|------|--------|----------|
| Ricette | `foodcost_recipes_router.py` | `/foodcost` | CRUD ricette, categorie, calcolo food cost |
| Matching | `foodcost_matching_router.py` | `/foodcost` | Matching fatture → ingredienti, Smart Create, esclusioni |
| Ingredienti | `foodcost_ingredients_router.py` | `/foodcost` | CRUD ingredienti, prezzi, suppliers, conversioni |

### 2.2 Endpoint principali

**Ricette:**
- `GET /foodcost/ricette` — lista con food cost calcolato in real-time
- `GET /foodcost/ricette/{id}` — dettaglio con items arricchiti (unit_cost, line_cost)
- `POST /foodcost/ricette` — crea ricetta con items
- `PUT /foodcost/ricette/{id}` — aggiorna ricetta (replace items)
- `DELETE /foodcost/ricette/{id}` — soft delete (is_active=0)
- `GET /foodcost/ricette/categorie` — lista categorie
- `POST /foodcost/ricette/categorie` — crea categoria
- `GET /foodcost/ricette/basi` — lista ricette base

**Matching:**
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

**Ingredienti:**
- `GET /foodcost/ingredients` — lista con ultimo prezzo
- `POST /foodcost/ingredients` — crea ingrediente
- `PUT /foodcost/ingredients/{id}` — aggiorna
- `GET /foodcost/ingredients/categories` — categorie
- `GET /foodcost/ingredients/{id}/conversions` — conversioni unita' custom
- `POST /foodcost/ingredients/{id}/conversions` — crea conversione
- `DELETE /foodcost/ingredients/conversions/{id}` — elimina conversione

### 2.3 Frontend (React)

| Pagina | Route | Funzione |
|--------|-------|----------|
| RicetteMenu | `/ricette` | Hub con tile |
| RicetteNuova | `/ricette/nuova` | Form creazione con sub-ricette |
| RicetteArchivio | `/ricette/archivio` | Lista con FC%, filtri, azioni |
| RicetteDettaglio | `/ricette/:id` | Visualizzazione costi calcolati |
| RicetteModifica | `/ricette/modifica/:id` | Form modifica |
| RicetteIngredienti | `/ricette/ingredienti` | Anagrafica ingredienti |
| RicetteIngredientiPrezzi | `/ricette/ingredienti/:id/prezzi` | Storico prezzi + conversioni unita' |
| RicetteMatching | `/ricette/matching` | 4 tab: Da associare, Smart Create, Mappings, Fornitori |
| RicetteDashboard | `/ricette/dashboard` | 5 KPI + tabelle top FC e margini |
| RicetteSettings | `/ricette/settings` | Strumenti: export JSON, import JSON |

---

## 3. Database (`foodcost.db`)

Gestito tramite migrazioni (001–013).

| Tabella | Contenuto |
|---------|-----------|
| `suppliers` | Fornitori (nome, P.IVA) |
| `ingredient_categories` | Categorie ingredienti |
| `ingredients` | Anagrafica (nome, unita', allergeni, note, is_active) |
| `ingredient_prices` | Storico prezzi multi-fornitore |
| `ingredient_supplier_map` | Mapping fornitore → ingrediente per auto-match |
| `ingredient_unit_conversions` | Conversioni unita' personalizzate per ingrediente |
| `recipe_categories` | Categorie ricette (8 default) |
| `recipes` | Ricette v2 (is_base, selling_price, prep_time, category_id) |
| `recipe_items` | Righe ricetta (ingredient_id OR sub_recipe_id) |
| `matching_description_exclusions` | Descrizioni ignorate nel matching |
| `matching_ignored_righe` | Righe fattura ignorate |

---

## 4. Calcolo Food Cost

### Algoritmo
Calcolo **ricorsivo** con **cycle detection**:

1. Per ogni riga ricetta:
   - Se `ingredient_id`: prende ultimo prezzo, converte unita' → costo riga
   - Se `sub_recipe_id`: calcola ricorsivamente, divide per resa, moltiplica per qty
2. Somma costi riga = `total_cost`
3. `cost_per_unit = total_cost / yield_qty`
4. `food_cost_pct = (cost_per_unit / selling_price) * 100`

### Conversione unita'
Sistema a 3 livelli:
1. **Custom per ingrediente** (diretta, inversa, chain via `ingredient_unit_conversions`)
2. **Standard**: kg=1, g=0.001, L=1, ml=0.001, cl=0.01, pz=1
3. Conversioni solo tra unita' compatibili (peso↔peso, volume↔volume)

### Auto-normalizzazione prezzi
`_save_price_from_riga` normalizza automaticamente i prezzi fattura usando `convert_qty` con ingredient_id.

---

## 5. Matching Fatture → Ingredienti

### Flusso
1. Import fatture XML dal modulo Acquisti
2. Righe appaiono in `/ricette/matching` come "da associare"
3. **Smart Create**: pipeline pulizia nomi + grouping + suggerimenti unita'/categoria
4. Conferma match → crea mapping + prezzo
5. Auto-match per fatture successive dello stesso fornitore

### Esclusioni
- Fornitori non pertinenti (servizi, attrezzature) → toggle nella tab Fornitori
- Descrizioni non-ingrediente (trasporto, spedizione) → pulsante "Ignora" in Smart Create
- Sezione "Descrizioni ignorate" espandibile con ripristino

---

## 6. Roadmap modulo

- [ ] Dashboard per reparto (cucina / pasticceria / cocktail)
- [ ] Storico variazione costi ricette
- [ ] Export PDF ricette con costi
- [ ] Collegamento consumi → magazzino (scarico ingredienti da ricetta)
- [ ] Sistema permessi centralizzato (task #25 roadmap)
