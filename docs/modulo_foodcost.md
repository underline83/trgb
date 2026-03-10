# Modulo Ricette & Food Cost v2 — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-10
**Stato:** Backend completo, Frontend completo, in test

---

## 1. Obiettivo del modulo

Il modulo **Ricette & Food Cost** gestisce:

- Anagrafica ingredienti con categorie, allergeni, unita' di misura
- Fornitori (auto-creati da fatture XML)
- Storico prezzi multi-fornitore (mai sovrascritti, ultimo prezzo usato per calcolo)
- Ricette con supporto sub-ricette (ricetta come ingrediente di un'altra ricetta)
- Calcolo food cost ricorsivo: costo totale, costo/porzione, % su prezzo vendita
- Matching automatico righe fatture XML → ingredienti con fuzzy search
- Categorie ricette configurabili (8 di default: Antipasti, Primi, Secondi, Contorni, Dolci, Basi, Salse, Bevande)

---

## 2. Architettura

### 2.1 Backend (FastAPI)

Tre router principali:

| Router | File | Prefix | Funzione |
|--------|------|--------|----------|
| Ricette | `foodcost_recipes_router.py` | `/foodcost` | CRUD ricette, categorie, calcolo food cost |
| Matching | `foodcost_matching_router.py` | `/foodcost` | Matching fatture XML → ingredienti |
| Ingredienti | `foodcost_ingredients_router.py` | `/foodcost` | CRUD ingredienti, prezzi, suppliers |

### 2.2 Endpoint principali

**Ricette:**
- `GET /foodcost/ricette` — lista ricette con food cost calcolato in real-time
- `GET /foodcost/ricette/{id}` — dettaglio con items arricchiti (unit_cost, line_cost)
- `POST /foodcost/ricette` — crea ricetta con items
- `PUT /foodcost/ricette/{id}` — aggiorna ricetta (replace items)
- `DELETE /foodcost/ricette/{id}` — soft delete (is_active=0)
- `GET /foodcost/ricette/categorie` — lista categorie
- `POST /foodcost/ricette/categorie` — crea categoria
- `GET /foodcost/ricette/basi` — lista ricette base (per selettore sub-ricette)

**Matching:**
- `GET /foodcost/matching/pending` — righe fattura non associate
- `GET /foodcost/matching/suggest?riga_id=X` — suggerimenti fuzzy
- `POST /foodcost/matching/confirm` — conferma match → salva mapping + prezzo
- `POST /foodcost/matching/auto` — auto-match batch con mappings esistenti
- `GET /foodcost/matching/mappings` — lista mappings attivi
- `DELETE /foodcost/matching/mappings/{id}` — elimina mapping

**Ingredienti:**
- `GET /foodcost/ingredients` — lista ingredienti con ultimo prezzo
- `POST /foodcost/ingredients` — crea ingrediente
- `PUT /foodcost/ingredients/{id}` — aggiorna ingrediente
- `GET /foodcost/ingredients/suppliers` — lista fornitori
- `GET /foodcost/ingredients/{id}/prezzi` — storico prezzi
- `POST /foodcost/ingredients/{id}/prezzi` — inserimento prezzo manuale
- `DELETE /foodcost/ingredients/prezzi/{id}` — elimina prezzo

### 2.3 Frontend (React)

| Pagina | File | Route | Funzione |
|--------|------|-------|----------|
| Menu | `RicetteMenu.jsx` | `/ricette` | Hub con 5 tile |
| Nuova | `RicetteNuova.jsx` | `/ricette/nuova` | Form creazione con sub-ricette |
| Archivio | `RicetteArchivio.jsx` | `/ricette/archivio` | Lista con FC%, filtri, azioni |
| Dettaglio | `RicetteDettaglio.jsx` | `/ricette/:id` | Visualizzazione costi calcolati |
| Modifica | `RicetteModifica.jsx` | `/ricette/modifica/:id` | Form modifica con PUT |
| Ingredienti | `RicetteIngredienti.jsx` | `/ricette/ingredienti` | Anagrafica + nuovo ingrediente |
| Prezzi | `RicetteIngredientiPrezzi.jsx` | `/ricette/ingredienti/:id/prezzi` | Storico prezzi ingrediente |
| Matching | `RicetteMatching.jsx` | `/ricette/matching` | Matching fatture → ingredienti |
| Import | `RicetteImport.jsx` | `/ricette/import` | Placeholder (TODO) |

---

## 3. Database (`foodcost.db`)

Il DB e' gestito tramite migrazioni (001-007). La migrazione 007 ha rifatto le tabelle ricette.

| Tabella | Contenuto | Migrazione |
|---------|-----------|------------|
| `suppliers` | Fornitori (nome, P.IVA) | base |
| `ingredient_categories` | Categorie ingredienti | base |
| `ingredients` | Anagrafica ingredienti (nome, unita', allergeni, note) | base |
| `ingredient_prices` | Storico prezzi (multi-fornitore, data, unit_price) | base + 007 |
| `ingredient_supplier_map` | Mapping descrizione fornitore → ingrediente | 007 |
| `recipe_categories` | Categorie ricette (8 default) | 007 |
| `recipes` | Ricette v2 (name, is_base, yield_qty/unit, selling_price, prep_time, category_id) | 007 |
| `recipe_items` | Righe ricetta (ingredient_id OR sub_recipe_id, qty, unit) | 007 |
| `fe_fatture` | Fatture XML importate | runtime (fe_import.py) |
| `fe_righe` | Righe fatture XML | runtime (fe_import.py) |
| `schema_migrations` | Tracking migrazioni applicate | sistema |

---

## 4. Calcolo Food Cost

### Algoritmo
Il calcolo e' **ricorsivo** con **cycle detection**:

1. Per ogni riga ricetta:
   - Se `ingredient_id`: prende ultimo prezzo da `ingredient_prices`, converte unita' → costo riga
   - Se `sub_recipe_id`: calcola ricorsivamente il costo della sub-ricetta, divide per resa, moltiplica per qty richiesta
2. Somma tutti i costi riga = `total_cost`
3. `cost_per_unit = total_cost / yield_qty`
4. `food_cost_pct = (cost_per_unit / selling_price) * 100`

### Conversione unita'
Sistema UNIT_TO_BASE: kg=1, g=0.001, L=1, ml=0.001, cl=0.01, pz=1.
Conversioni solo tra unita' compatibili (peso↔peso, volume↔volume).

### Cycle detection
Set `visited` di recipe_id. Se una ricetta e' gia' nel set → return None (ciclo rilevato).

---

## 5. Matching Fatture → Ingredienti

### Flusso
1. Marco importa fatture XML dal modulo Fatture (`/admin/fatture/import`)
2. Le righe appaiono in `/ricette/matching` come "da associare"
3. Click su una riga → suggerimenti fuzzy (SequenceMatcher su descrizione)
4. Conferma match → crea mapping in `ingredient_supplier_map` + prezzo in `ingredient_prices`
5. La prossima volta che lo stesso fornitore usa la stessa descrizione → auto-match

### Auto-match
`POST /matching/auto` scorre tutte le righe pendenti e cerca match esatti nella tabella `ingredient_supplier_map`. Se trova → associa e salva prezzo automaticamente.

---

## 6. Roadmap modulo

- [ ] Aggiornare `RicetteIngredientiPrezzi.jsx` per nuovi endpoint v2
- [ ] Implementare `RicetteImport.jsx` (import/export JSON ricette)
- [ ] Dashboard food cost (costi per categoria, trend prezzi, alert variazioni)
- [ ] Export PDF ricette con costi
- [ ] Integrazione con magazzino (scarico ingredienti da ricetta)
- [ ] Sistema permessi centralizzato (task #25 roadmap)
